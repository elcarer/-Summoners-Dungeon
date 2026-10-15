// СЦЕНА «АРЕНА» — карточный бой на поле 5×5.
// Ряд 0 — база врага (верх), ряд 4 — база игрока (низ).
// Типы карт: unit (марширует к базе врага), spell (одноразовый эффект),
// building (стоит в зоне призыва, даёт ауру), trap («?» у поля, триггер).
// Зона призыва (frontline, как в Stormbound): от своей базы до ряда перед
// самым выдвинутым своим существом/строением — призыв и продвижение
// расширяют зону. Пошаговая логика — FSM + объекты поверх Pixi.
(function () {
    const GRID = 5;          // 5×5
    // Геометрия поля — поверх НАРИСОВАННОЙ сетки бэкграунда арены
    // (images/scenes/N.png). Границы клеток по колонкам/рядам в координатах
    // дизайна 1280×720 (сетка на арте слегка неравномерная — потому массивы,
    // а не один шаг). Измерено по градиентам краев клеток.
    const SCENE_GRID = {
        1: { cols: [427, 509, 594, 679, 765, 850], rows: [112, 198, 276, 353, 433, 517] },
        2: { cols: [427, 509, 594, 679, 765, 850], rows: [119, 198, 276, 353, 433, 517] },
    };
    let curScene = 1;
    const cellRect = (col, row) => {
        const g = SCENE_GRID[curScene] || SCENE_GRID[1];
        return {
            x: g.cols[col] + 2, y: g.rows[row] + 2,
            w: g.cols[col + 1] - g.cols[col] - 4, h: g.rows[row + 1] - g.rows[row] - 4,
        };
    };
    const cellXY = (col, row) => {
        const rc = cellRect(col, row);
        return { x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 };
    };
    // ── Энергия и шкала конца хода ────────────────────────────────────────
    // Старт боя: 1 энергия, 4 карты в руке. Энергия НЕ обнуляется и сама не
    // восстанавливается — приходит только со шкалы. У игрока есть ПОСТОЯННАЯ
    // шкала «+карты ↔ +энергия» с ползунком (в HUD у кнопки «Конец»):
    // положение можно менять в любой момент хода. По кнопке «Конец» шкала
    // применяется автоматически: добор карт и энергия на следующий ход.
    // Всего сфер на шкале: 3 на первом ходу, каждый следующий ход +1 (4, 5, …).
    // Лимит руки — 7 карт, проверяется ТОЛЬКО в конце хода (после добора со
    // шкалы): лишнее игрок сбрасывает по своему выбору (панель сброса).
    const HAND_MAX = 7;
    const { CARDS, ENCOUNTERS, TRAP_SLOTS } = globalThis.GAME_DATA;

    function createArenaScene(ctx) {
        const { scenes, G, uiTex, scheduler } = ctx;
        const t = (k, v) => GAME_LOC.t(k, v);
        const sfx = (name) => { if (ctx.sfx) ctx.sfx(name); };
        const delay = (s) => new Promise((r) => scheduler.after(s, r));
        // Скорость анимаций и передвижений (ползунок «Анимации» в Настройках,
        // settings.animSpeed 0..10). 5 = дефолт — в 1.5 раза медленнее
        // исходной; все длительности (глиссады, паузы, всплывающий текст)
        // делятся на этот коэффициент, скорость походки — умножается.
        const animK = () => Math.max(0.25, (((G.settings && G.settings.animSpeed) ?? 5) * 2) / 15);
        // всего сфер на шкале конца хода: 3 на первом ходу, каждый ход +1
        const spheresTotal = () => B.turnNo + 2;
        let root = null, B = null;

        // Листы существ поля боя — по карте (def.creature), пока все гоблины.
        // Стандарт листа — 256×256, ряды front/back/right/left по 6 кадров.
        // Взгляд по стороне: юниты игрока идут вверх (виден затылок), врага —
        // вниз (анфас).
        const SPRITE_SCALE = 0.35; // кадр 256 → ~90px, фигура ~68px в клетке
        const sheetOf = (u) => ctx.creatureSheets
            && ((u.def.creature && ctx.creatureSheets[u.def.creature]) || ctx.creatureSheets.goblin);

        const T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });

        // ── Гоблины и Вождь: «карты Гоблинов» = существа с листом goblin и
        //    ловушка-приманка (def.race); пока Вождь (leaderAura) на поле,
        //    сторона платит за них на 1 энергию меньше (не ниже 0).
        const isGoblin = (def) => !!def && (def.creature === "goblin" || def.race === "goblin");
        function goblinDiscount(side) {
            return B.units.some((u) => u.side === side && u.def.leaderAura) ? 1 : 0;
        }
        function effCost(cardId, side = "p") {
            const def = CARDS[cardId];
            if (!def) return 0;
            const d = isGoblin(def) && B ? goblinDiscount(side) : 0;
            return Math.max(0, def.cost - d);
        }
        // Урон заклинания с ростом: «Колдовское варево» — +1 за каждое
        // разыгранное ранее в этом бою (счёт общий на обе стороны).
        function spellDmg(def) {
            return (def.spell.dmg || 0) + (def.spell.brew ? (B.brewCasts || 0) : 0);
        }

        // ── Зона призыва: [свой последний ряд .. ряд перед самым выдвинутым
        //    своим существом/строением]. Базы — ЗА пределами сетки (ниже ряда 4
        //    игрока, выше ряда 0 врага), поэтому «ряд перед базой» = крайний
        //    ряд сетки. По умолчанию — ОДИН ряд ([4] у игрока, [0] у врага);
        //    призыв и продвижение расширяют зону к центру. КРАЙНИЙ ряд у
        //    ЧУЖОЙ базы (0 для игрока, 4 для врага) для призыва закрыт
        //    всегда — до него существа только «доходят» маршем. ──────────
        function deployRows(side) {
            const own = B.units.filter((u) => u.side === side);
            const rows = [];
            if (side === "p") {
                let front = 4; // ряд у своей базы
                if (own.length) front = Math.max(1, Math.min(...own.map((u) => u.row)) - 1);
                for (let r = front; r <= 4; r++) rows.push(r);
            } else {
                let back = 0; // ряд у базы врага
                if (own.length) back = Math.min(3, Math.max(...own.map((u) => u.row)) + 1);
                for (let r = 0; r <= back; r++) rows.push(r);
            }
            return rows;
        }

        function unitAt(col, row) {
            return B.units.find((u) => u.col === col && u.row === row) || null;
        }
        function freeCells(rows) {
            const out = [];
            for (const r of rows) for (let col = 0; col < GRID; col++) {
                if (!unitAt(col, r)) out.push([col, r]);
            }
            return out;
        }

        // ── Поле: нарисованная сетка бэкграунда + полупрозрачная подсветка ─
        // Клик-зона ОДНА на всё поле (не 25 зон-клеток): у зоны-клетки с полем
        // 2px по краям и на линиях сетки были мёртвые полосы, а микросдвиг
        // мыши между press и release через границу ронял pointertap совсем —
        // «клик на некоторые места клетки не призывает» (баг юзера). Теперь
        // клетку считает cellAt по точке отпускания кнопки, границы никогда
        // не мертвы (x ∈ [cols[c], cols[c+1]) — детерминированно в одну из
        // соседних клеток).
        function buildBoard() {
            const c = new PIXI.Container();
            const hi = new PIXI.Graphics();
            c.addChild(hi);
            const g = SCENE_GRID[curScene] || SCENE_GRID[1];

            const zone = new PIXI.Graphics();
            zone.rect(g.cols[0], g.rows[0], g.cols[GRID] - g.cols[0], g.rows[GRID] - g.rows[0]);
            zone.fill({ color: 0xffffff, alpha: 0.001 });
            zone.eventMode = "static";
            zone.on("pointertap", (e) => {
                const p = zone.toLocal(e.global); // локальные = дизайн-координаты
                const hit = cellAt(p.x, p.y);
                if (hit) onCellTap(hit[0], hit[1]);
                else deselect(); // щель в разметке поля — как клик мимо клеток
            });
            c.addChild(zone);

            // зона клика по базе врага (для заклинаний с прицелом)
            const baseZone = new PIXI.Graphics();
            baseZone.rect(470, 28, 340, 36);
            baseZone.fill({ color: 0xffffff, alpha: 0.001 });
            baseZone.eventMode = "none";
            baseZone.on("pointertap", () => {
                if (B && B.spellTarget && B.selected !== null) castSpell(B.selected, { base: true });
            });
            c.addChild(baseZone);

            c.userData = { hi, baseZone };
            return c;
        }

        function redrawHighlight() {
            const hi = root.board.userData.hi;
            hi.clear();
            if (B.phase !== "player" || B.selected === null) {
                root.board.userData.baseZone.eventMode = "none";
                return;
            }
            if (B.spellTarget) { // прицел заклинания
                const def = CARDS[B.hand[B.selected]];
                const tg = def && def.spell && def.spell.target;
                if (tg === "anyUnit" || tg === "anyUnitDmg") {
                    // усиление — любые существа; дротик — существа и строения
                    // (варево строения не берёт — только существа)
                    root.board.userData.baseZone.eventMode = "none";
                    for (const u of B.units) {
                        const ok = u.def.type === "unit"
                            || (tg === "anyUnitDmg" && u.def.type === "building"
                                && !def.spell.noBuildings);
                        if (!ok) continue;
                        const rc = cellRect(u.col, u.row);
                        hi.rect(rc.x, rc.y, rc.w, rc.h);
                        hi.fill({ color: u.side === "p" ? 0x7dc95e : 0xd05a3c, alpha: 0.4 });
                        hi.stroke({ width: 2, color: u.side === "p" ? 0xa8e890 : 0xef9f8c });
                    }
                    return;
                }
                if (tg === "ownUnit") { // жертва — только своё существо
                    root.board.userData.baseZone.eventMode = "none";
                    for (const u of B.units) if (u.side === "p" && u.def.type === "unit") {
                        const rc = cellRect(u.col, u.row);
                        hi.rect(rc.x, rc.y, rc.w, rc.h);
                        hi.fill({ color: 0x7dc95e, alpha: 0.4 });
                        hi.stroke({ width: 2, color: 0xa8e890 });
                    }
                    return;
                }
                for (const u of B.units) if (u.side === "e") {
                    const rc = cellRect(u.col, u.row);
                    hi.rect(rc.x, rc.y, rc.w, rc.h);
                    hi.fill({ color: 0xd05a3c, alpha: 0.4 });
                    hi.stroke({ width: 2, color: 0xef9f8c });
                }
                hi.rect(470, 28, 340, 36);
                hi.fill({ color: 0xd05a3c, alpha: 0.3 });
                hi.stroke({ width: 2, color: 0xef9f8c });
                root.board.userData.baseZone.eventMode = "static";
                return;
            }
            root.board.userData.baseZone.eventMode = "none";
            const selDef = CARDS[B.hand[B.selected]];
            if (selDef && selDef.type === "trap") { // ловушка: любая пустая клетка
                for (let r = 0; r < GRID; r++) for (let col = 0; col < GRID; col++) {
                    if (unitAt(col, r)) continue;
                    const rc = cellRect(col, r);
                    hi.rect(rc.x, rc.y, rc.w, rc.h);
                    hi.fill({ color: 0xb07ad5, alpha: 0.3 }); // фиолетово, как «эпик»
                }
                return;
            }
            for (const [col, r] of freeCells(deployRows("p"))) {
                const rc = cellRect(col, r);
                hi.rect(rc.x, rc.y, rc.w, rc.h);
                hi.fill({ color: 0x7dc95e, alpha: 0.28 }); // без рамок, полупрозрачно
            }
        }

        // ── Жетоны на поле: существо / строение ────────────────────────────
        function makeUnitNode(u) {
            const c = new PIXI.Container();
            const sheet = sheetOf(u);
            const spr = u.def.type !== "building" && sheet; // спрайт-существо
            if (u.def.type === "building") {
                const g = new PIXI.Graphics();
                g.moveTo(-26, -8); g.lineTo(0, -26); g.lineTo(26, -8); // крыша
                g.lineTo(26, 24); g.lineTo(-26, 24); g.closePath();
                g.fill(u.def.color);
                g.stroke({ width: 2.5, color: 0xffd98c });
                c.addChild(g);
                // метка эффекта: лагерь даёт +1 урона соседям, прочие ауры — ✦
                const aura = T(u.def.campAura ? `+${u.def.campAura}⚔` : "✦", 20, 0xffe9b0);
                aura.anchor.set(0.5);
                aura.position.set(0, -2);
                aura.name = "auraMark";
                c.addChild(aura);
                const hp = T(String(u.hp), 17, 0xff9c8c, { stroke: { color: 0x1c1207, width: 3 } });
                hp.anchor.set(1, 1);
                hp.position.set(26, 26);
                hp.name = "hp";
                c.addChild(hp);
                return finishNode(c, u);
            }
            if (spr) {
                const face = u.side === "p" ? "walk_back" : "walk_front";
                const ring = new PIXI.Graphics(); // командная тень под ногами
                ring.ellipse(0, 8, 30, 10);
                ring.fill({ color: u.side === "p" ? 0x2f4f7a : 0x7a3430, alpha: 0.45 });
                ring.eventMode = "none";
                c.addChild(ring);
                const body = new PIXI.AnimatedSprite(sheet.animations[face], false);
                body.anchor.set(0.5, 0.85); // ноги (y≈0.93 кадра) чуть ниже центра клетки
                body.scale.set(SPRITE_SCALE);
                body.animationSpeed = sheet.animationSpeed || 0.2;
                body.gotoAndStop(0); // стоит — статичный кадр, играет только в движении
                body.eventMode = "none"; // клики уходят в клетки поля под существом
                body.name = "body";
                body.userData_face = face;
                c.addChild(body);
            } else {
                const g = new PIXI.Graphics();
                g.roundRect(-30, -30, 60, 60, 10);
                g.fill(u.def.color);
                g.stroke({ width: 2.5, color: u.side === "p" ? 0x9fc4ef : 0xef9f8c });
                c.addChild(g);
            }
            const atk = T(String(u.curAtk), 17, 0xffe9b0, { stroke: { color: 0x1c1207, width: 3 } });
            atk.anchor.set(0, spr ? 1 : 0);
            atk.position.set(spr ? -31 : -26, spr ? 36 : -28);
            atk.name = "atk";
            const hp = T(String(u.hp), 17, 0xff9c8c, { stroke: { color: 0x1c1207, width: 3 } });
            hp.anchor.set(1, spr ? 1 : 0);
            hp.position.set(spr ? 31 : 26, spr ? 36 : -28);
            hp.name = "hp";
            c.addChild(atk, hp);
            if (u.def.speed > 1) {
                for (let k = 0; k < u.def.speed; k++) {
                    const pip = new PIXI.Graphics();
                    pip.poly([0, -4, 4, 3, -4, 3]);
                    pip.closePath();
                    pip.fill(0xffe9b0);
                    pip.position.set(-4 + k * 9, spr ? 30 : 22);
                    pip.eventMode = "none";
                    c.addChild(pip);
                }
            }
            return finishNode(c, u);
        }
        function finishNode(c, u) {
            const p = cellXY(u.col, u.row);
            c.position.set(p.x, p.y);
            return c;
        }

        // ── Ауры строений + перманентные бонусы ──────────────────────────
        // curAtk = база + bonusAtk (кровожадность, лагерь при призыве) + ауры.
        // Ауры строений пересчитываются при каждом addUnit/гибели строения;
        // bonusAtk переживает всё — это «навсегда».
        function recalcAuras() {
            for (const side of ["p", "e"]) {
                let atk = 0, hp = 0;
                for (const u of B.units) if (u.side === side && u.def.type === "building") {
                    atk += (u.def.aura && u.def.aura.atk) || 0;
                    hp += (u.def.aura && u.def.aura.hp) || 0;
                }
                for (const u of B.units) if (u.side === side && u.def.type === "unit") {
                    const newAtk = u.def.atk + (u.bonusAtk || 0) + atk;
                    if (u.curAtk !== newAtk) {
                        u.curAtk = newAtk;
                        const n = u.node.getChildByName("atk");
                        if (n) n.text = String(u.curAtk);
                    }
                    const delta = hp - (u.auraHp || 0);
                    if (delta) {
                        u.hp = Math.max(1, u.hp + delta);
                        const n = u.node.getChildByName("hp");
                        if (n) n.text = String(u.hp);
                    }
                    u.auraHp = hp;
                }
            }
        }

        function addUnit(side, cardId, col, row) {
            const def = CARDS[cardId];
            const u = { side, def, col, row, hp: def.hp, curAtk: def.atk || 0, auraHp: 0, bonusAtk: 0 };
            const node = makeUnitNode(u);
            u.node = node;
            node.scale.set(0.2);
            punches.push({ node, life: 0.3 / animK(), total: 0.3 / animK() });
            root.unitsLayer.addChild(node);
            sfx("use"); // призыв (обе стороны)
            B.units.push(u);
            recalcAuras(); // строение могло появиться раньше юнита — аура живёт всегда
            if (def.type === "unit") {
                // военный лагерь: существо, призванное рядом (верт/гориз),
                // получает +1 к урону за каждый лагерь — перманентно
                let camp = 0;
                for (const o of B.units) if (o !== u && o.side === side
                    && o.def.type === "building" && o.def.campAura
                    && Math.abs(o.col - col) + Math.abs(o.row - row) === 1) camp += o.def.campAura;
                if (camp) {
                    u.bonusAtk += camp;
                    recalcAuras();
                    const p = cellXY(col, row);
                    floatText(p.x, p.y - 40, `+${camp}⚔`, 0x9fd489);
                }
                if (def.ability === "dash1") summonDash(u); // «Скорость 1»
                else if (def.ability === "shaman") summonShaman(u); // шаман гоблинов
                else if (def.ability === "bombling") summonBombling(u); // бомблинг
            }
            // мина врага на клетке призыва (и существа, и строения)
            triggerCellMines(u);
            return u;
        }

        const floats = [], punches = [];
        const moves = []; // плавные переходы существ между клетками
        function floatText(x, y, text, fill) {
            const tt = T(text, 24, fill, { stroke: { color: 0x1c1207, width: 5 } });
            tt.anchor.set(0.5);
            tt.position.set(x, y);
            root.fx.addChild(tt);
            const k = animK();
            floats.push({ node: tt, life: 0.9 / k, total: 0.9 / k, k });
        }
        function punch(node) {
            punches.push({ node, life: 0.22 / animK(), total: 0.22 / animK() });
        }

        // Плавный переезд в центр клетки (анимация/позиция доигрываются в update).
        // 0.5с на шаг = ровно один полный цикл походки (6 кадров × 12fps):
        // клетка проходится целым шагом, анимация читается целиком.
        function glide(u, x, y) {
            const dur = 0.5 / animK();
            const i = moves.findIndex((m) => m.u === u);
            if (i >= 0) moves.splice(i, 1);
            moves.push({ u, node: u.node, fx: u.node.x, fy: u.node.y, tx: x, ty: y, life: dur, total: dur });
        }
        // Походная анимация: on=true — играть цикл направления face (по умолчанию
        // «к врагу»: игрок видит спину, враг — анфас), on=false — стоп-кадр.
        function setWalk(u, on, face) {
            const body = u.node && u.node.getChildByName("body");
            const sheet = sheetOf(u);
            if (!body || !body.textures || !sheet) return;
            const name = face || (u.side === "p" ? "walk_back" : "walk_front");
            if (!sheet.animations[name]) return;
            if (body.userData_face !== name) {
                body.textures = sheet.animations[name];
                body.userData_face = name;
            }
            if (on) body.gotoAndPlay(0); else body.gotoAndStop(0);
        }

        // «Скорость 1»: сразу после призыва — шаг на клетку вперёд; если там
        // противник — удар по нему (урон с текущими бонусами). Своим не пройти,
        // своих не бить — стоим.
        function summonDash(u) {
            if (!B.units.includes(u)) return; // мог умереть от мины при призыве
            const dir = u.side === "p" ? -1 : 1;
            const ahead = u.row + dir;
            if (ahead < 0 || ahead >= GRID) return;
            const occ = unitAt(u.col, ahead);
            if (occ) {
                if (occ.side !== u.side) {
                    damageUnit(occ, u.curAtk, u, "sword");
                    refreshHud();
                    checkEnd();
                }
                return;
            }
            const dest = lureRedirect(u, u.col, u.row, u.col, ahead);
            if (!B.units.includes(u)) return; // приманка убила шагнувшего
            u.col = dest[0];
            u.row = dest[1];
            const p = cellXY(u.col, u.row);
            glide(u, p.x, p.y);
            setWalk(u, true);
            sfx("step");
            afterMoved(u); // перемещение — вражеские ловушки могут сработать
        }

        // «Шаман гоблинов»: после призыва бесплатно разыгрывает случайного
        // Гоблина (цена ≤ 2) из колоды своей стороны на пустую соседнюю
        // (верт/гориз) клетку — карта уходит из колоды прямо на поле.
        // Гоблин-ловушка (приманка) ставится как ловушка: нужен свободный
        // слот и клетка без своей ловушки.
        function summonShaman(u) {
            if (!B.units.includes(u)) return; // мог умереть от мины при призыве
            const deck = u.side === "p" ? B.deck : B.eDeck;
            const traps = u.side === "p" ? B.traps.p : B.traps.e;
            const near = [[-1, 0], [1, 0], [0, -1], [0, 1]]
                .map(([dc, dr]) => [u.col + dc, u.row + dr]);
            const cellOk = (def, c2, r2) => c2 >= 0 && c2 < GRID && r2 >= 0 && r2 < GRID
                && !unitAt(c2, r2)
                && (def.type !== "trap" || !traps.some((tr) => tr.col === c2 && tr.row === r2));
            const goblins = deck
                .map((id, i) => ({ id, i, def: CARDS[id] }))
                .filter((x) => isGoblin(x.def) && x.def.cost <= 2
                    && (x.def.type !== "trap" || traps.length < TRAP_SLOTS)
                    && near.some(([c2, r2]) => cellOk(x.def, c2, r2)));
            if (!goblins.length) return;
            const pick = goblins[(Math.random() * goblins.length) | 0];
            deck.splice(pick.i, 1);
            const cells = near.filter(([c2, r2]) => cellOk(pick.def, c2, r2));
            const [col, row] = cells[(Math.random() * cells.length) | 0];
            if (pick.def.type === "trap") armTrap(u.side, pick.id, col, row);
            else addUnit(u.side, pick.id, col, row);
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 46, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
        }

        // «Бомблинг»: после призыва находит в колоде владельца случайную
        // карту ловушки и кладёт её в руку (карта уходит из колоды).
        function summonBombling(u) {
            if (!B.units.includes(u)) return; // мог умереть от мины при призыве
            const deck = u.side === "p" ? B.deck : B.eDeck;
            const hand = u.side === "p" ? B.hand : B.eHand;
            const traps = deck.map((id, i) => ({ id, i }))
                .filter((x) => CARDS[x.id].type === "trap");
            if (!traps.length) return;
            const pick = traps[(Math.random() * traps.length) | 0];
            deck.splice(pick.i, 1);
            hand.push(pick.id);
            sfx("chpoc");
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 46, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
        }

        // «Гоблинская приманка»: существо врага, шагающее С КЛЕТКИ, соседней
        // с ловушкой, сходит на клетку приманки вместо намеченной — и получает
        // 1 урона. Приманка одноразовая; занятая клетка приманки не манит.
        function lureRedirect(u, fromCol, fromRow, toCol, toRow) {
            const foe = u.side === "p" ? "e" : "p";
            const i = B.traps[foe].findIndex((tr) => tr.def.trap.effect === "lure"
                && Math.abs(tr.col - fromCol) + Math.abs(tr.row - fromRow) === 1
                && !unitAt(tr.col, tr.row));
            if (i < 0) return [toCol, toRow];
            const trap = B.traps[foe].splice(i, 1)[0];
            redrawTraps();
            const p = cellXY(trap.col, trap.row);
            floatText(p.x, p.y - 40, "?!", 0xe08cd0);
            damageUnit(u, trap.def.trap.dmg, null, "acid");
            return [trap.col, trap.row];
        }

        // Перемещение завершилось: мина врага на этой клетке взрывается,
        // затем «Выстрел 1» лучника (перемещение состоялось)
        function afterMoved(u) {
            if (!B.units.includes(u) || u.def.type !== "unit") return;
            triggerCellMines(u);
            archerShot(u);
        }
        // «Гоблинская мина»: взрывается, когда вражеское юнит призван или
        // переместился на её клетку: 3 урона этому юниту + 1 урона соседним
        // с клеткой (верт/гориз, как у лагеря) существам и строениям.
        // Только мины (cellDmg): приманка на той же клетке — не мина.
        function triggerCellMines(u) {
            if (!B.units.includes(u)) return; // умер раньше (рывок+мина на шаге)
            const foe = u.side === "p" ? "e" : "p";
            const i = B.traps[foe].findIndex((t) => t.col === u.col && t.row === u.row
                && t.def.trap.effect === "cellDmg");
            if (i < 0) return;
            const trap = B.traps[foe].splice(i, 1)[0];
            redrawTraps();
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 40, "?!", 0xe08cd0);
            damageUnit(u, trap.def.trap.amount, null, "acid");
            for (const v of B.units.slice()) {
                if (v !== u && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                    damageUnit(v, trap.def.trap.splash, null, "acid");
                }
            }
            refreshHud();
            checkEnd();
        }

        // «Выстрел 1» (Гоблинский лучник): после перемещения — 1 урон
        // ближайшему существу или строению впереди по вертикали (любой
        // стороны); если вертикаль перед ним пуста — 1 урон базе противника.
        function archerShot(u) {
            if (!B.units.includes(u) || u.def.ability !== "archer") return;
            const dir = u.side === "p" ? -1 : 1;
            for (let r = u.row + dir; r >= 0 && r < GRID; r += dir) {
                const o = unitAt(u.col, r);
                if (o) {
                    damageUnit(o, 1, u, "dam");
                    refreshHud();
                    checkEnd();
                    return;
                }
            }
            sfx("crash");
            if (u.side === "p") {
                B.enemyBase -= 1;
                const p = cellXY(u.col, 0);
                floatText(p.x, p.y - 10, "−1", 0xff8f6e);
            } else {
                B.playerBase -= 1;
                const p = cellXY(u.col, GRID - 1);
                floatText(p.x, p.y + 10, "−1", 0xff5f4e);
            }
            punch(root.hud);
            refreshHud();
            checkEnd();
        }

        function removeUnit(u) {
            const i = B.units.indexOf(u);
            if (i >= 0) B.units.splice(i, 1);
            punches.push({ node: u.node, life: 0.25 / animK(), total: 0.25 / animK(), dying: true });
        }

        function killUnit(u, killer) {
            removeUnit(u);
            sfx("die");
            if (u.def.type === "building") recalcAuras();
            // ловушки стороны погибшего: триггер «при гибели своего существа»
            if (killer && killer.def && killer.def.type === "unit" && killer.side !== u.side) {
                triggerTraps(u.side, killer);
            }
        }

        // snd — звук удара: "sword" (атака существом), "acid" (ловушка),
        // "rocket" (заклинание), по умолчанию "dam"
        function damageUnit(target, amount, killer = null, snd = "dam") {
            target.hp -= amount;
            const n = target.node.getChildByName("hp");
            if (n) n.text = String(Math.max(0, target.hp));
            const p = cellXY(target.col, target.row);
            floatText(p.x, p.y - 24, `−${amount}`, 0xffb26e);
            punch(target.node);
            sfx(snd);
            if (target.hp <= 0) { killUnit(target, killer); return; }
            // «Гоблин-асассин»: существо, оставшееся после его урона
            // с 1 жизнью, добивается
            if (target.hp === 1 && target.def.type === "unit"
                && killer && killer.def.ability === "assassin") {
                floatText(p.x, p.y - 44, "☠", 0xef9f8c);
                killUnit(target, killer);
            }
        }

        function baseHit(side, u) {
            sfx("crash");
            if (side === "p") {
                B.enemyBase -= u.curAtk;
                const p = cellXY(u.col, 0);
                floatText(p.x, p.y - 10, `−${u.curAtk}`, 0xff8f6e);
            } else {
                B.playerBase -= u.curAtk;
                const p = cellXY(u.col, GRID - 1);
                floatText(p.x, p.y + 10, `−${u.curAtk}`, 0xff5f4e);
            }
            punch(root.hud);
        }

        // «Грибница»: в начало хода владельца даёт 1 энергию и теряет 1 жизнь
        // (энергия начисляется даже если грибница от этого урона погибает).
        function upkeep(side) {
            for (const b of B.units.slice()) {
                if (b.side !== side || b.def.type !== "building" || !b.def.mycelium) continue;
                if (side === "p") B.energy += 1; else B.eEnergy += 1;
                sfx("aqua");
                const p = cellXY(b.col, b.row);
                floatText(p.x, p.y - 40, "+1⚡", 0xffd98c);
                damageUnit(b, 1, null, "dam");
            }
            refreshHud();
        }

        // ── Ловушки ─────────────────────────────────────────────────────────
        function armTrap(side, cardId, col, row) {
            if (B.traps[side].length >= TRAP_SLOTS) return false;
            B.traps[side].push({ def: CARDS[cardId], col, row });
            redrawTraps();
            sfx("mine");
            return true;
        }
        function triggerTraps(side, killer) {
            if (!B.traps[side].length) return;
            const trap = B.traps[side].shift();
            redrawTraps();
            const k = cellXY(killer.col, killer.row);
            floatText(k.x, k.y - 40, "?!", 0xe08cd0);
            if (trap.def.trap.effect === "rowDmg") {
                const amount = trap.def.trap.amount;
                const victims = B.units.filter((v) => v.side !== side && v.row === killer.row);
                for (const v of victims) {
                    if (B.units.includes(v)) damageUnit(v, amount, null, "acid");
                }
                refreshHud();
                checkEnd();
            }
        }
        function redrawTraps() {
            const layer = root.trapLayer;
            layer.removeChildren().forEach((n) => n.destroy({ children: true }));
            for (const side of ["p", "e"]) {
                B.traps[side].forEach((tr) => {
                    // «?» стоит прямо на заминированной клетке
                    const c = new PIXI.Container();
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 14);
                    g.fill({ color: side === "p" ? 0x3f5f8a : 0x7a3f3f, alpha: 0.62 });
                    g.stroke({ width: 2, color: 0xd8c79d });
                    c.addChild(g);
                    const q = T("?", 18, 0xffe9b0);
                    q.anchor.set(0.5);
                    c.addChild(q);
                    const p = cellXY(tr.col, tr.row);
                    c.position.set(p.x, p.y);
                    layer.addChild(c);
                });
            }
        }

    // ── Карты в руке ────────────────────────────────────────────────────
    // Лицо — сама картинка карты в 2/3 размера (230×338 → ~153×225), нижний
    // край уходит за экран: верх карты ниже поля (поле кончается на y=517) —
    // клетки боя не закрываются. Выбор/наведение — лёгкое увеличение и
    // золотая рамка, БЕЗ подъёма вверх. Неразыгрываемая (не хватает энергии)
    // карта — затемнённая тинтом. Пока выбрана карта — все карты руки
    // неинтерактивны: клики уходят в поле; снять выбор — Esc, клик по фону
    // или мимо подсвеченных клеток.
    const HAND_Y = 754, HAND_SCALE = 2 / 3;
        function cardBottom(def) { // подпись нижней плашки (фолбэк без картинки)
            if (def.type === "unit") return { text: `${def.atk}⚔ ${def.hp}♥ ${def.speed}→`, small: false };
            const key = `card.${Object.keys(CARDS).find((k) => CARDS[k] === def)}.desc`;
            return { text: GAME_LOC.t(key), small: true };
        }
        function makeCardNode(card, idx) {
            const def = CARDS[card];
            const c = new PIXI.Container();
            if (def.img) {
                const face = new PIXI.Sprite(uiTex(`cards/${def.img}.png`));
                face.anchor.set(0.5, 1); // оригинальный размер спрайта
                face.tint = effCost(card) > B.energy ? 0x9f9f9f : 0xffffff;
                c.addChild(face);
                // рамка выбора/наведения (видна у выделенной карты)
                const frame = new PIXI.Graphics();
                frame.roundRect(-118, -341, 236, 344, 12);
                frame.stroke({ width: 5, color: 0xf0c96a });
                frame.visible = false;
                frame.name = "selframe";
                frame.eventMode = "none";
                c.addChild(frame);
            } else { // фолбэк без картинки: рубашка + подписи
                const face = new PIXI.Sprite(uiTex("card_back_small.png"));
                face.anchor.set(0.5, 1);
                face.tint = def.type === "unit" ? 0xffffff : (def.color || 0xffffff);
                if (effCost(card) > B.energy) face.tint = (face.tint & 0x9f9f9f) >>> 0;
                c.addChild(face);
                const plate = new PIXI.Graphics();
                plate.roundRect(-44, def.type === "unit" ? -132 : -150, 88, def.type === "unit" ? 44 : 62, 6);
                plate.fill({ color: 0x120d09, alpha: 0.66 });
                c.addChild(plate);
                const name = T(GAME_LOC.t(`card.${card}.name`), 13, 0xf3e6c2);
                name.anchor.set(0.5, 0);
                name.position.set(0, -128);
                globalThis.GAME_UI.fit(name, 84, 10);
                c.addChild(name);
                const bottom = cardBottom(def);
                const stats = T(bottom.text, bottom.small ? 11 : 14, 0xd8c79d,
                    bottom.small ? { wordWrap: true, wordWrapWidth: 84, breakWords: true, align: "center" } : {});
                stats.anchor.set(0.5, 1);
                stats.position.set(0, -92);
                if (!bottom.small) globalThis.GAME_UI.fit(stats, 84, 10);
                c.addChild(stats);
                const tag = T(GAME_LOC.t(`type.${def.type}.short`), 10, 0xcfc4a6);
                tag.anchor.set(0, 1);
                tag.position.set(-40, -34);
                c.addChild(tag);
                const cost = new PIXI.Graphics();
                cost.circle(34, -136, 13);
                cost.fill(0x2f6fb0);
                cost.stroke({ width: 2, color: 0xbfe0ff });
                c.addChild(cost);
                const costT = T(String(def.cost), 15, 0xffffff);
                costT.anchor.set(0.5);
                costT.position.set(34, -136);
                c.addChild(costT);
            }
            c.eventMode = B.selected === null ? "static" : "none";
            c.on("pointertap", () => onCardTap(idx));
            // альтернативный режим призыва (Настройки): наведение увеличивает
            // карту, перетаскивание на клетку поля — призыв
            c.on("pointerover", () => hoverCard(idx, true));
            c.on("pointerout", () => hoverCard(idx, false));
            c.on("pointerdown", (e) => startCardDrag(idx, e));
            c.on("globalpointermove", (e) => moveCardDrag(e));
            return c;
        }

        function layoutHand() {
            for (const n of root.cardsLayer.children) n.destroy({ children: true });
            root.cardsLayer.removeChildren();
            const n = B.hand.length;
            B.hand.forEach((card, idx) => {
                const node = makeCardNode(card, idx);
                const spread = Math.min(150, 1050 / Math.max(1, n));
                node.x = 640 + (idx - (n - 1) / 2) * spread;
                node.y = HAND_Y;
                node.rotation = (idx - (n - 1) / 2) * 0.035;
                const sel = B.selected === idx;
                node.scale.set((sel ? 1.12 : 1) * HAND_SCALE);
                const f = node.getChildByName("selframe");
                if (f) f.visible = sel;
                root.cardsLayer.addChild(node);
            });
        }

        // ── Перетаскивание карт (режим «Перетаскивание» в Настройках) ────────
        // Наведение увеличивает карту; перетаскивание рисует кривую от её
        // слота в руке до центра клетки, отпускание — призыв. Спеллы и ловушки
        // ставятся кликом как раньше.
        let drag = null, dragFx = null; // drag: {idx,node,homeX,homeY,sx,sy,moved,over}
        const toDesign = (g) => ({ x: (g.x - ctx.ui.x) / ctx.ui.scale.x, y: (g.y - ctx.ui.y) / ctx.ui.scale.y });

        function cellAt(x, y) {
            const g = SCENE_GRID[curScene] || SCENE_GRID[1];
            for (let r = 0; r < GRID; r++) if (y >= g.rows[r] && y < g.rows[r + 1])
                for (let c2 = 0; c2 < GRID; c2++) if (x >= g.cols[c2] && x < g.cols[c2 + 1]) return [c2, r];
            return null;
        }
        function canDropAt(handIdx, col, row) {
            const def = CARDS[B.hand[handIdx]];
            return !!def && (def.type === "unit" || def.type === "building")
                && effCost(B.hand[handIdx]) <= B.energy
                && deployRows("p").includes(row) && !unitAt(col, row);
        }
        function hoverCard(idx, on) {
            if (!G.settings.dragSummon || drag || B.phase !== "player" || overlay || B.discarding) return;
            const node = root.cardsLayer.children[idx];
            if (!node) return;
            const raised = on || B.selected === idx;
            node.scale.set((raised ? 1.12 : 1) * HAND_SCALE);
            const f = node.getChildByName("selframe");
            if (f) f.visible = raised;
        }
        function startCardDrag(idx, e) {
            if (!G.settings.dragSummon || B.phase !== "player" || overlay || B.discarding) return;
            const def = CARDS[B.hand[idx]];
            if (!def || (def.type !== "unit" && def.type !== "building")) return;
            const node = root.cardsLayer.children[idx];
            if (!node) return;
            const p = toDesign(e.global);
            drag = { idx, node, homeX: node.x, homeY: node.y, sx: p.x, sy: p.y, moved: false, over: null };
            window.addEventListener("pointerup", endCardDrag);
        }
        function moveCardDrag(e) {
            if (!drag || !B || B.phase !== "player" || B.stopped || overlay) return;
            const p = toDesign(e.global);
            if (!drag.moved) {
                if (Math.hypot(p.x - drag.sx, p.y - drag.sy) < 8) return; // это клик
                drag.moved = true;
                root.cardsLayer.addChild(drag.node); // карта поверх остальных
                B.selected = drag.idx; // подсветить зону призыва
                B.spellTarget = false;
                redrawHighlight();
            }
            drag.node.x = p.x;
            drag.node.y = Math.min(p.y, 690);
            drag.node.scale.set(1.12); // перетаскиваемая карта — полноразмерная
            drag.over = cellAt(p.x, p.y);
            drawDragFx();
        }
        function drawDragFx() {
            // после exit() сцены dragFx мог остаться ссылкой на уничтоженный
            // Graphics (в Pixi v8 у него внутрь null) — проверяем живость
            if (!dragFx || dragFx.destroyed) {
                dragFx = new PIXI.Graphics();
                dragFx.eventMode = "none";
                if (root) root.addChild(dragFx); // поверх HUD (добавляется последним)
            }
            dragFx.clear();
            if (!drag || !drag.moved || !drag.over) return;
            const [c2, r2] = drag.over;
            const target = cellXY(c2, r2);
            const ok = canDropAt(drag.idx, c2, r2);
            // кривая от домашнего слота карты к центру клетки (дуга набок)
            const dx = target.x - drag.homeX, dy = target.y - drag.homeY;
            const len = Math.hypot(dx, dy) || 1;
            const bow = Math.min(140, len * 0.3);
            dragFx.moveTo(drag.homeX, drag.homeY - 50);
            dragFx.quadraticCurveTo(drag.homeX + dx / 2 - dy / len * bow, drag.homeY + dy / 2 + dx / len * bow, target.x, target.y);
            dragFx.stroke({ width: 3, color: ok ? 0xa8e890 : 0xef9f8c, alpha: 0.9 });
            dragFx.circle(drag.homeX, drag.homeY - 50, 5);
            dragFx.fill({ color: ok ? 0xa8e890 : 0xef9f8c });
            const rc = cellRect(c2, r2);
            dragFx.rect(rc.x + 2, rc.y + 2, rc.w - 4, rc.h - 4);
            dragFx.fill({ color: ok ? 0x7dc95e : 0xd05a3c, alpha: 0.4 });
        }
        function endCardDrag(ev) {
            window.removeEventListener("pointerup", endCardDrag);
            if (!drag) return;
            const d = drag;
            drag = null;
            if (dragFx && !dragFx.destroyed) dragFx.clear();
            if (!d.moved) { layoutHand(); return; } // короткий клик — выбор уже сыграл pointertap
            let over = d.over;
            if (ev && ev.clientX !== undefined) { // отпустили за пределами канваса — отмена
                const r = ctx.app.canvas.getBoundingClientRect();
                if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) over = null;
            }
            if (over && canDropAt(d.idx, over[0], over[1])) {
                B.selected = d.idx;
                B.spellTarget = false;
                onCellTap(over[0], over[1]);
                if (ctx.sfx) ctx.sfx();
            } else {
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
            }
        }

        // ── Шкала конца хода: «+карты ↔ +энергия» ──────────────────────────
        // Постоянный ползунок в HUD (под кнопкой «Конец»). Положение можно
        // менять в любой момент хода (тап/перетаскивание по треку); выбранное
        // сохраняется между ходами. По кнопке «Конец» шкала применяется
        // автоматически: слева — добор карт, справа — энергия на след. ход.
        const SLIDER_W = 240, SLIDER_X = 1090, SLIDER_Y = 430;
        let sliderHeld = false;
        function refreshSlider() {
            if (!root || !B) return;
            const sl = root.hud.userData.slider;
            const total = spheresTotal();
            B.split = Math.max(0, Math.min(total, B.split));
            sl.cards.text = `+${B.split}`;
            sl.energy.text = `+${total - B.split}`;
            const on = B.phase === "player" && !B.discarding;
            sl.track.eventMode = on ? "static" : "none";
            sl.thumb.eventMode = on ? "static" : "none";
            sl.wrap.alpha = on ? 1 : 0.45;
            const g = sl.track;
            g.clear();
            const w = SLIDER_W, h = 14, x0 = -w / 2;
            g.roundRect(x0, -h / 2, w, h, 7);
            g.fill(0x1c1712);
            g.roundRect(x0 + 3, -h / 2 + 3, Math.max(0, (B.split / total) * (w - 6)), h - 6, 4);
            g.fill(0x3a5f8a); // доля «в карты»
            g.roundRect(x0, -h / 2, w, h, 7);
            g.stroke({ width: 2, color: 0x6b5c40 });
            for (let i = 0; i <= total; i++) { // деления — по числу сфер
                g.circle(x0 + (i / total) * w, h / 2 + 6, 1.5);
                g.fill(0x6b5c40);
            }
            sl.thumb.clear();
            sl.thumb.circle(x0 + (B.split / total) * w, 0, 11);
            sl.thumb.fill(0xbfe0ff);
            sl.thumb.stroke({ width: 3, color: 0x2f4f7a });
        }
        function sliderApply(e) {
            // Pixi-событие несёт .global; DOM-событие window (pointermove
            // при перетаскивании) — только clientX/clientY
            const p = toDesign(e.global ? e.global : { x: e.clientX, y: e.clientY });
            const total = spheresTotal();
            let v = Math.round(((p.x - SLIDER_X + SLIDER_W / 2) / SLIDER_W) * total);
            v = Math.max(0, Math.min(total, v));
            if (v !== B.split) {
                B.split = v;
                if (ctx.sfx) ctx.sfx();
                refreshSlider();
            }
        }
        function sliderGrab(e) {
            if (!B || B.phase !== "player" || B.discarding) return;
            sliderHeld = true;
            sliderApply(e);
            window.addEventListener("pointermove", sliderMove);
            window.addEventListener("pointerup", sliderUp);
        }
        function sliderMove(e) { if (sliderHeld && B && !B.stopped) sliderApply(e); }
        function sliderUp() {
            sliderHeld = false;
            window.removeEventListener("pointermove", sliderMove);
            window.removeEventListener("pointerup", sliderUp);
        }

        // ── Панель сброса лишних карт (конец хода при руке > 7) ─────────────
        // Лимит руки проверяется только здесь: игрок кликами сбрасывает
        // карты по своему выбору, пока в руке не останется 7 — тогда ход
        // переходит врагу.
        let discardPanel = null;
        function closeDiscardPanel() {
            if (!discardPanel) return;
            discardPanel.destroy({ children: true });
            discardPanel = null;
            if (B) B.discarding = false;
        }
        function buildDiscardPanel() {
            closeDiscardPanel();
            B.discarding = true;
            const node = new PIXI.Container();
            node.eventMode = "static";
            const dim = new PIXI.Graphics();
            dim.rect(0, 0, 1280, 720);
            dim.fill({ color: 0x000000, alpha: 0.6 });
            dim.eventMode = "static";
            node.addChild(dim);
            const frame = new PIXI.Graphics();
            frame.roundRect(150, 160, 980, 350, 12);
            frame.fill({ color: 0x171310, alpha: 0.96 });
            frame.stroke({ width: 2, color: 0x6b5c40 });
            node.addChild(frame);
            const title = T(t("discard.title"), 26, 0xf0c96a, { stroke: { color: 0x241505, width: 5 } });
            title.anchor.set(0.5, 0);
            title.position.set(640, 182);
            title.eventMode = "none";
            node.addChild(title);
            const hint = T(t("discard.hint", { n: B.hand.length - HAND_MAX }), 17, 0xd8c79d);
            hint.anchor.set(0.5, 0);
            hint.position.set(640, 226);
            hint.eventMode = "none";
            node.addChild(hint);
            const n = B.hand.length;
            const spread = Math.min(100, 900 / Math.max(1, n));
            B.hand.forEach((card, idx) => {
                const def = CARDS[card];
                const c = new PIXI.Container();
                if (def.img) {
                    const face = new PIXI.Sprite(uiTex(`cards/${def.img}.png`));
                    face.anchor.set(0.5, 0.5);
                    face.scale.set(0.55);
                    c.addChild(face);
                } else { // фолбэк без картинки: рубашка + имя
                    const face = new PIXI.Sprite(uiTex("card_back_small.png"));
                    face.anchor.set(0.5, 0.5);
                    c.addChild(face);
                    const nm = T(GAME_LOC.t(`card.${card}.name`), 12, 0xf3e6c2);
                    nm.anchor.set(0.5);
                    nm.position.set(0, 46);
                    nm.eventMode = "none";
                    c.addChild(nm);
                }
                c.position.set(640 + (idx - (n - 1) / 2) * spread, 400);
                c.eventMode = "static";
                c.on("pointertap", () => pickDiscard(idx));
                node.addChild(c);
            });
            root.addChild(node);
            discardPanel = node;
        }
        function pickDiscard(idx) {
            if (!B || !B.discarding || !discardPanel) return;
            const cardId = B.hand.splice(idx, 1)[0];
            if (cardId) B.discard.push(cardId);
            sfx("chpoc");
            if (B.hand.length <= HAND_MAX) {
                closeDiscardPanel();
                layoutHand();
                refreshHud();
                enemyTurn(); // сброс завершён — ход переходит врагу
            } else {
                layoutHand();
                buildDiscardPanel(); // пересборка: новый состав руки и счётчик
            }
        }

        // ── HUD боя ────────────────────────────────────────────────────────
        function buildHud() {
            const c = new PIXI.Container();
            const plate = new PIXI.Sprite(uiTex("panel_label.png"));
            plate.anchor.set(0.5, 0);
            plate.scale.set(0.92);
            plate.position.set(640, 6);
            c.addChild(plate);
            const title = T("", 21, 0xffe9b0);
            title.anchor.set(0.5, 0);
            title.position.set(640, 14);
            title.eventMode = "none";
            c.addChild(title);
            const eBar = new PIXI.Graphics();
            c.addChild(eBar);
            const eInfo = T("", 14, 0xd8c79d);
            eInfo.anchor.set(0.5, 0);
            eInfo.position.set(640, 60);
            eInfo.eventMode = "none";
            c.addChild(eInfo);

            const pp = new PIXI.Sprite(uiTex("panel_1.png"));
            pp.position.set(26, 500);
            pp.scale.set(0.78);
            c.addChild(pp);
            const portrait = new PIXI.Sprite(uiTex("portrate_hero.png"));
            portrait.position.set(44, 522);
            portrait.scale.set(0.78);
            c.addChild(portrait);
            const pBar = new PIXI.Graphics();
            c.addChild(pBar);
            const pName = T("", 17, 0xf3e6c2);
            pName.position.set(170, 528);
            pName.eventMode = "none";
            c.addChild(pName);

            const manaSign = new PIXI.Sprite(uiTex("sign_mana.png"));
            manaSign.position.set(180, 560);
            manaSign.scale.set(0.8);
            c.addChild(manaSign);
            const manaT = T("", 19, 0xbfe0ff);
            manaT.position.set(222, 566);
            manaT.eventMode = "none";
            c.addChild(manaT);
            const deckBack = new PIXI.Sprite(uiTex("card_back_small.png"));
            deckBack.position.set(180, 606);
            deckBack.scale.set(0.28);
            c.addChild(deckBack);
            const deckT = T("", 17, 0xd8c79d);
            deckT.position.set(222, 610);
            deckT.eventMode = "none";
            c.addChild(deckT);

            const endBtn = new PIXI.Sprite(uiTex("button_end.png"));
            endBtn.anchor.set(0.5);
            endBtn.scale.set(0.82);
            endBtn.position.set(1160, 330);
            endBtn.eventMode = "static";
            endBtn.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); api.endTurn(); });
            c.addChild(endBtn);

            // шкала конца хода «+карты ↔ +энергия» (применится по «Конец»)
            const slWrap = new PIXI.Container();
            slWrap.position.set(1090, 430);
            const slTitle = T(t("orb.scaleTitle"), 14, 0xcfc4a6);
            slTitle.anchor.set(0.5, 1);
            slTitle.position.set(0, -18);
            slTitle.eventMode = "none";
            slWrap.addChild(slTitle);
            const slCards = T("", 22, 0xbfe0ff, { stroke: { color: 0x1c1207, width: 4 } });
            slCards.anchor.set(1, 0.5);
            slCards.position.set(-146, 0);
            slCards.eventMode = "none";
            slWrap.addChild(slCards);
            const slCardsL = T(t("orb.cardsLabel"), 12, 0x8a7c5e);
            slCardsL.anchor.set(1, 0);
            slCardsL.position.set(-146, 8);
            slCardsL.eventMode = "none";
            slWrap.addChild(slCardsL);
            const slEnergy = T("", 22, 0xffd98c, { stroke: { color: 0x1c1207, width: 4 } });
            slEnergy.anchor.set(0, 0.5);
            slEnergy.position.set(146, 0);
            slEnergy.eventMode = "none";
            slWrap.addChild(slEnergy);
            const slEnergyL = T(t("orb.energyLabel"), 12, 0x8a7c5e);
            slEnergyL.anchor.set(0, 0);
            slEnergyL.position.set(146, 8);
            slEnergyL.eventMode = "none";
            slWrap.addChild(slEnergyL);
            const slTrack = new PIXI.Graphics();
            slWrap.addChild(slTrack);
            const slThumb = new PIXI.Graphics();
            slWrap.addChild(slThumb);
            slTrack.on("pointerdown", sliderGrab);
            slThumb.on("pointerdown", sliderGrab);
            c.addChild(slWrap);

            const targetHint = T("", 16, 0xef9f8c, { stroke: { color: 0x1c1207, width: 4 } });
            targetHint.anchor.set(0.5);
            targetHint.position.set(640, 566);
            targetHint.eventMode = "none";
            c.addChild(targetHint);

            const banner = T("", 54, 0xffe2a8, { stroke: { color: 0x1c1207, width: 8 } });
            banner.anchor.set(0.5);
            banner.position.set(640, 300);
            banner.alpha = 0;
            c.addChild(banner);

            // настройки и колода (просмотр) — оверлеи поверх боя, битва не
            // прерывается: сцена боя при выходе умерла бы вместе с состоянием
            const mkIcon = (tex, x, y, sc, onTap) => {
                const sp = new PIXI.Sprite(uiTex(tex));
                sp.anchor.set(0.5);
                sp.scale.set(sc);
                sp.eventMode = "static";
                sp.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap(); });
                const w = new PIXI.Container();
                w.position.set(x, y);
                w.addChild(sp);
                w.name = tex;
                return w;
            };
            c.addChild(mkIcon("icon_setting.png", 40, 44, 0.8, () => openOverlay("settings")));
            c.addChild(mkIcon("card_back_small.png", 40, 106, 0.42, () => openOverlay("deck")));

            c.userData = { eBar, eInfo, title, pBar, pName, manaT, deckT, endBtn, banner, targetHint,
                slider: { wrap: slWrap, cards: slCards, energy: slEnergy, track: slTrack, thumb: slThumb } };
            return c;
        }

        // ── Оверлеи поверх боя: настройки / колода (просмотр) ────────────────
        let overlay = null; // { name, node }
        function closeOverlay() {
            if (!overlay) return;
            overlay.node.destroy({ children: true });
            overlay = null;
            if (drag) endCardDrag(); // защита от пересечения состояний
        }
        function openOverlay(name) {
            if (overlay || (B && B.discarding)) return; // поверх сброса — ничего
            if (overlay) closeOverlay();
            const node = new PIXI.Container();
            node.eventMode = "static"; // глотает клики — поле под ним молчит
            const dim = new PIXI.Graphics();
            dim.rect(0, 0, 1280, 720);
            dim.fill({ color: 0x000000, alpha: 0.72 });
            dim.eventMode = "static";
            node.addChild(dim);
            if (name === "settings") {
                const panel = globalThis.GAME_SETTINGS_SCENE.buildPanel(ctx, { onBack: closeOverlay });
                panel.applySound();
                node.addChild(panel.node);
            } else { // deck — только просмотр, без редактирования
                const { T, button, cardFace, scrollPane } = globalThis.GAME_UI;
                const { CARDS } = globalThis.GAME_DATA;
                const frame = new PIXI.Graphics();
                frame.roundRect(190, 54, 900, 590, 12);
                frame.fill({ color: 0x171310, alpha: 0.95 });
                frame.stroke({ width: 2, color: 0x6b5c40 });
                node.addChild(frame);
                const title = T(t("deck.viewTitle"), 30, 0xf0c96a, { stroke: { color: 0x241505, width: 5 } });
                title.anchor.set(0.5, 0);
                title.position.set(640, 70);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("deck.viewHint"), 14, 0x8a7c5e);
                hint.anchor.set(0.5, 0);
                hint.position.set(640, 108);
                hint.eventMode = "none";
                node.addChild(hint);
                const pane = scrollPane(ctx, { x: 210, y: 132, w: 860, h: 440 });
                const grid = new PIXI.Container();
                const ids = [...new Set(G.deck)].sort((a, b) =>
                    (CARDS[a].cost - CARDS[b].cost) || a.localeCompare(b));
                ids.forEach((id, i) => {
                    const col = i % 4, rowI = (i / 4) | 0;
                    const cx = 115 + col * 215, cy = 110 + rowI * 205;
                    const card = cardFace(ctx, id, { scale: 0.5 });
                    card.position.set(cx, cy);
                    card.eventMode = "none";
                    grid.addChild(card);
                    const n = G.deck.reduce((s, c) => s + (c === id ? 1 : 0), 0);
                    const cnt = T(`×${n}`, 18, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4 } });
                    cnt.anchor.set(0.5);
                    cnt.position.set(cx + 48, cy - 64);
                    cnt.eventMode = "none";
                    grid.addChild(cnt);
                });
                const rowsN = Math.ceil(ids.length / 4);
                pane.setContent(grid, ids.length ? 110 + (rowsN - 1) * 205 + 150 : 40);
                node.addChild(pane.node);
                node.addChild(button(ctx, {
                    tex: "button_menu.png", label: t("settings.back"), x: 640, y: 678, scale: 1,
                    onTap: closeOverlay,
                }));
            }
            root.addChild(node);
            overlay = { name, node };
        }

        function drawBar(g, x, y, w, h, ratio, color) {
            g.clear();
            g.roundRect(x, y, w, h, 6);
            g.fill(0x1c1712);
            g.roundRect(x + 2, y + 2, (w - 4) * Math.max(0, Math.min(1, ratio)), h - 4, 4);
            g.fill(color);
            g.roundRect(x, y, w, h, 6);
            g.stroke({ width: 2, color: 0x6b5c40 });
        }

        function refreshHud() {
            if (!root || !B) return;
            const ud = root.hud.userData;
            ud.title.text = t(`enc.${B.encId}.title`);
            drawBar(ud.eBar, 470, 44, 340, 14, B.enemyBase / B.enemyBaseMax, 0xc0503c);
            ud.eInfo.text = `${t("arena.baseEnemy")} ${Math.max(0, B.enemyBase)}/${B.enemyBaseMax}  ·  ${t("arena.energy")} ${B.eEnergy}  ·  ${t("arena.manaCards", { n: B.eHand.length })}`;
            globalThis.GAME_UI.fit(ud.eInfo, 430, 11);
            drawBar(ud.pBar, 170, 552, 100, 12, B.playerBase / B.playerBaseMax, 0x5d9c4a);
            ud.pName.text = t("arena.hero");
            ud.manaT.text = `${B.energy}`;
            ud.deckT.text = `${B.deck.length}+${B.discard.length}`;
            ud.endBtn.alpha = B.phase === "player" ? 1 : 0.45;
            ud.endBtn.eventMode = B.phase === "player" ? "static" : "none";
            ud.targetHint.text = B.spellTarget ? t("arena.pickTarget") : "";
            refreshSlider();
        }

        let bannerT = 0, bannerFade = 0.35;
        function banner(text) {
            const b = root.hud.userData.banner;
            b.text = text;
            b.scale.set(1.25);
            b.alpha = 1;
            bannerT = 1.1 / animK();
            bannerFade = 0.35 / animK();
        }

        // ── Колода/рука ─────────────────────────────────────────────────────
        function shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }
        function drawCards(count) {
            // в процессе хода рука ничем не ограничена — лимит 7 проверяется
            // только в конце хода (панель сброса)
            for (let k = 0; k < count; k++) {
                if (!B.deck.length) { B.deck = shuffle(B.discard); B.discard = []; }
                if (!B.deck.length) break;
                B.hand.push(B.deck.pop());
            }
        }
        function drawEnemy(count) {
            for (let k = 0; k < count; k++) {
                if (!B.eDeck.length) { B.eDeck = shuffle(B.eDiscard); B.eDiscard = []; }
                if (!B.eDeck.length) break;
                B.eHand.push(B.eDeck.pop());
            }
        }

        // ── Марш: юниты стороны идут вперёд (строения стоят) ────────────────
        async function marchSide(side) {
            const dir = side === "p" ? -1 : 1;
            const order = B.units.filter((u) => u.side === side && u.def.type === "unit")
                .sort((a, b) => (side === "p" ? a.row - b.row : b.row - a.row));
            for (const u of order) {
                if (B.stopped || !B.units.includes(u)) continue;
                for (let step = 0; step < u.def.speed; step++) {
                    if (B.stopped || !B.units.includes(u)) break;
                    const ahead = u.row + dir;
                    if (ahead < 0 || ahead >= GRID) {
                        baseHit(side, u);
                        removeUnit(u);
                        refreshHud();
                        if (checkEnd()) return;
                        break;
                    }
                    const occ = unitAt(u.col, ahead);
                    if (occ) {
                        if (occ.side !== u.side) {
                            damageUnit(occ, u.curAtk, u, "sword");
                            refreshHud();
                            if (checkEnd()) return;
                        }
                        break; // занято — стоим (своим не даём пройти, своих не бьём)
                    }
                    const dest = lureRedirect(u, u.col, u.row, u.col, ahead);
                    if (!B.units.includes(u)) break; // приманка убила шагнувшего
                    u.col = dest[0];
                    u.row = dest[1];
                    const p = cellXY(u.col, u.row);
                    glide(u, p.x, p.y);
                    setWalk(u, true);
                    sfx("step");
                    await delay(0.52 / animK()); // глиссада + пауза: полный шаг походки
                    if (B.stopped) return;
                    afterMoved(u); // перемещение — ловушки врага
                    if (checkEnd()) return;
                }
            }
        }

        function checkEnd() {
            if (B.phase === "over") return true;
            if (B.enemyBase <= 0) { finish(true); return true; }
            if (B.playerBase <= 0) { finish(false); return true; }
            return false;
        }

        async function enemyTurn() {
            B.phase = "enemy";
            B.selected = null;
            B.spellTarget = false;
            layoutHand();
            redrawHighlight();
            refreshHud();
            banner(t("arena.enemyTurn"));
            await delay(0.5 / animK());
            if (B.stopped) return;
            upkeep("e"); // грибницы врага
            await marchSide("e");
            if (B.stopped || B.phase === "over") return;
            await aiPlay();
            if (B.stopped || B.phase === "over") return;
            // шкала врага (те же правила): рука мала — добор, остальное — энергия
            const total = spheresTotal();
            let eCards = 0;
            if (B.eHand.length < 4) eCards = Math.min(4 - B.eHand.length, total);
            drawEnemy(eCards);
            B.eEnergy += total - eCards;
            refreshHud();
            await delay(0.25 / animK());
            if (B.stopped) return;
            await playerTurnStart();
        }

        async function aiPlay() {
            for (;;) {
                if (B.stopped || B.phase === "over") return;
                const affordable = B.eHand
                    .map((c, i) => ({ i, id: c, def: CARDS[c] }))
                    .filter((x) => effCost(x.id, "e") <= B.eEnergy)
                    .sort((a, b) => effCost(b.id, "e") - effCost(a.id, "e"));
                if (!affordable.length) return;
                let played = false;
                for (const pick of affordable) {
                    const def = pick.def;
                    if (def.type === "unit" || def.type === "building") {
                        const rows = deployRows("e");
                        const free = freeCells(rows);
                        if (!free.length) continue;
                        const frontRow = rows[rows.length - 1];
                        const front = free.filter(([, r]) => r === frontRow);
                        const pool = front.length ? front : free;
                        const [col, row] = pool[(Math.random() * pool.length) | 0];
                        const cardId = B.eHand[pick.i];
                        B.eHand.splice(pick.i, 1);
                        B.eEnergy -= effCost(cardId, "e");
                        addUnit("e", cardId, col, row);
                        played = true;
                        break;
                    }
                    if (def.type === "trap") {
                        if (B.traps.e.length >= TRAP_SLOTS) continue;
                        // минируем зону призыва игрока: ряд 4 (там призыв), затем 3, 2
                        const spots = [];
                        for (const r of [4, 3, 2]) for (let cc = 0; cc < GRID; cc++) {
                            if (!unitAt(cc, r) && !B.traps.e.some((t) => t.col === cc && t.row === r)) spots.push([cc, r]);
                        }
                        if (!spots.length) continue;
                        const [col, row] = spots[(Math.random() * spots.length) | 0];
                        const cardId = B.eHand[pick.i];
                        B.eHand.splice(pick.i, 1);
                        B.eEnergy -= effCost(cardId, "e");
                        armTrap("e", cardId, col, row);
                        played = true;
                        break;
                    }
                    if (def.type === "spell") {
                        if (def.spell.draw && B.eHand.length > 4) continue;
                    if (def.spell.target === "anyUnit") { // усиление — своему сильнейшему
                        const own = B.units.filter((v) => v.side === "e" && v.def.type === "unit");
                        if (!own.length) continue;
                        const best = own.sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                        best.bonusAtk = (best.bonusAtk || 0) + def.spell.buffAtk;
                        recalcAuras();
                        const p = cellXY(best.col, best.row);
                        floatText(p.x, p.y - 26, `+${def.spell.buffAtk}⚔`, 0x9fd489);
                        punch(best.node);
                        sfx("up");
                    }
                    if (def.spell.target === "anyUnitDmg") { // дротик/варево — сильнейшему игроку
                        const targets = B.units.filter((v) => v.side === "p"
                            && (v.def.type === "unit"
                                || (v.def.type === "building" && !def.spell.noBuildings)));
                        if (!targets.length) continue;
                        const best = targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                        damageUnit(best, spellDmg(def), null, "rocket");
                    }
                    const cardId = B.eHand[pick.i];
                    B.eHand.splice(pick.i, 1);
                    B.eEnergy -= effCost(cardId, "e");
                    if (def.spell.target === "enemyAny") {
                        const targets = B.units.filter((u) => u.side === "p");
                        if (targets.length) {
                            const best = targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                            damageUnit(best, def.spell.dmg, null, "rocket");
                        } else {
                            B.playerBase -= def.spell.dmg;
                            floatText(640, 560, `−${def.spell.dmg}`, 0xff5f4e);
                            sfx("rocket");
                        }
                    }
                        if (def.spell.draw) drawEnemy(def.spell.draw);
                        if (def.spell.brew) B.brewCasts = (B.brewCasts || 0) + 1;
                        B.eDiscard.push(cardId);
                        refreshHud();
                        if (checkEnd()) return;
                        played = true;
                        break;
                    }
                }
                if (!played) return;
                refreshHud();
                await delay(0.4 / animK());
            }
        }

        async function playerTurnStart() {
            B.turnNo += 1; // шкала подросла: сфер теперь на одну больше
            B.phase = "anim";
            B.selected = null;
            B.spellTarget = false;
            refreshHud();
            banner(t("arena.yourTurn"));
            await delay(0.4 / animK());
            if (B.stopped) return;
            upkeep("p"); // грибницы игрока
            await marchSide("p");
            if (B.stopped || B.phase === "over") return;
            B.phase = "player";
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        // ── Действия игрока ────────────────────────────────────────────────
        function spendCard(handIdx) { // вынимает карту из руки в сброс
            const cardId = B.hand[handIdx];
            B.discard.push(cardId);
            B.hand.splice(handIdx, 1);
            B.selected = null;
            B.spellTarget = false;
            return cardId;
        }

        // снять выбор карты: карты руки снова интерактивны
        function deselect() {
            if (B.selected === null && !B.spellTarget) return;
            B.selected = null;
            B.spellTarget = false;
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        function onCardTap(idx) {
            if (B.phase !== "player" || B.discarding) return;
            const def = CARDS[B.hand[idx]];
            if (!def) return;
            if (ctx.sfx) ctx.sfx();
            if (def.type === "spell" && def.spell.target === "none") {
                castSpell(idx); // без цели — сразу
                return;
            }
            if (def.type === "trap") {
                if (effCost(B.hand[idx]) > B.energy || B.traps.p.length >= TRAP_SLOTS) return;
                // мина ставится на выбранную пустую клетку — выбор как у юнитов
                B.selected = B.selected === idx ? null : idx;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
                return;
            }
            // unit/building/spell с прицелом — выбор клетки
            B.selected = B.selected === idx ? null : idx;
            B.spellTarget = B.selected !== null && def.type === "spell";
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        function onCellTap(col, row) {
            if (B.phase !== "player" || B.discarding || B.selected === null) return;
            const def = CARDS[B.hand[B.selected]];
            if (!def) return;
            if (B.spellTarget) { // прицел: по врагу, любому существу или строению
                const sdef = CARDS[B.hand[B.selected]];
                const u = unitAt(col, row);
                const tg = sdef.spell.target;
                const typeOk = u && (tg === "anyUnitDmg"
                    ? (u.def.type === "unit"
                        || (u.def.type === "building" && !sdef.spell.noBuildings))
                    : u.def.type === "unit");
                const sideOk = !u || tg !== "ownUnit" || u.side === "p";
                const known = tg === "anyUnit" || tg === "anyUnitDmg" || tg === "ownUnit";
                if (u && typeOk && sideOk && known) castSpell(B.selected, { col, row });
                else deselect(); // мимо цели — снять выбор
                return;
            }
            if (def.type === "trap") { // мина — только пустая клетка
                if (unitAt(col, row)) { deselect(); return; }
                const cardId = spendCard(B.selected);
                armTrap("p", cardId, col, row);
                deselect();
                layoutHand();
                redrawHighlight();
                refreshHud();
                return;
            }
            // мимо допустимых клеток (не в зоне / занято / не хватает маны) —
            // снять выбор: карты руки снова кликабельны (при выбранной карте
            // они неинтерактивны, чтобы крупные карты не съедали клики полем)
            if (!deployRows("p").includes(row) || unitAt(col, row) || effCost(B.hand[B.selected]) > B.energy) {
                deselect();
                return;
            }
            B.energy -= effCost(B.hand[B.selected]);
            const cardId = spendCard(B.selected);
            addUnit("p", cardId, col, row);
            if (ctx.sfx) ctx.sfx();
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        function castSpell(handIdx, target) {
            if (B.phase !== "player" || B.discarding) return false;
            const cardId = B.hand[handIdx];
            const def = CARDS[cardId];
            if (!def || def.type !== "spell" || effCost(cardId) > B.energy) return false;
            if (def.spell.target === "anyUnit") { // усиление: любое существо
                if (!target || target.col === undefined) return false;
                const u = unitAt(target.col, target.row);
                if (!u || u.def.type !== "unit") return false;
                u.bonusAtk = (u.bonusAtk || 0) + def.spell.buffAtk;
                recalcAuras();
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 26, `+${def.spell.buffAtk}⚔`, 0x9fd489);
                punch(u.node);
                sfx("up");
            }
            if (def.spell.target === "anyUnitDmg") { // дротик: существо или строение; варево — только существо
                if (!target || target.col === undefined) return false;
                const u = unitAt(target.col, target.row);
                if (!u || (u.def.type !== "unit"
                    && (u.def.type !== "building" || def.spell.noBuildings))) return false;
                damageUnit(u, spellDmg(def), null, "rocket");
            }
            if (def.spell.target === "ownUnit") { // жертва: убить своё, ударить соседей
                if (!target || target.col === undefined) return false;
                const u = unitAt(target.col, target.row);
                if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                const p = cellXY(u.col, u.row);
                killUnit(u, null);
                floatText(p.x, p.y - 30, "☠", 0xef9f8c);
                for (const v of B.units.slice()) {
                    if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                        damageUnit(v, def.spell.dmg, null, "rocket");
                    }
                }
            }
            if (def.spell.target === "none" && def.spell.baseDmg) { // землетрясение
                B.enemyBase -= def.spell.baseDmg;
                floatText(640, 40, `−${def.spell.baseDmg}`, 0xff8f6e);
                punch(root.hud);
                sfx("rocket");
            }
            if (def.spell.target === "enemyAny") {
                if (!target) return false;
                if (target.base === true) {
                    B.enemyBase -= def.spell.dmg;
                    floatText(640, 40, `−${def.spell.dmg}`, 0xff8f6e);
                    punch(root.hud);
                    sfx("rocket");
                } else if (target.col !== undefined) {
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side === "p") return false;
                    damageUnit(u, def.spell.dmg, null, "rocket");
                } else return false;
            }
            if (def.spell.draw) drawCards(def.spell.draw);
            if (def.spell.brew) B.brewCasts = (B.brewCasts || 0) + 1;
            B.energy -= effCost(cardId);
            spendCard(handIdx);
            layoutHand();
            redrawHighlight();
            refreshHud();
            checkEnd();
            return true;
        }

        // ── Итог боя → награда (победа) / меню (поражение) ─────────────────
        function finish(victory) {
            B.phase = "over";
            B.spellTarget = false;
            sfx(victory ? "lvlUp" : "die");
            refreshHud();
            const ov = new PIXI.Container();
            const dim = new PIXI.Graphics();
            dim.rect(0, 0, 1280, 720);
            dim.fill({ color: 0x000000, alpha: 0.6 });
            ov.addChild(dim);
            const panel = new PIXI.Sprite(uiTex("panel_allert.png"));
            panel.anchor.set(0.5);
            panel.scale.set(1.35);
            panel.position.set(640, 300);
            ov.addChild(panel);
            const txt = T(victory ? t("arena.victory") : t("arena.defeat"), 44,
                victory ? 0xffe9b0 : 0xff8f6e, { stroke: { color: 0x1c1207, width: 7 } });
            txt.anchor.set(0.5);
            txt.position.set(640, 268);
            txt.eventMode = "none";
            ov.addChild(txt);
            B.result = victory ? "win" : "lose";
            B.continueAction = () => {
                if (victory) {
                    if (G.activeEnemy) {
                        G.activeEnemy.alive = false;
                        if (G.activeEnemy.boss) G.dungeon.bossDead = true;
                    }
                    if (G.saveRun) G.saveRun(); // враг побеждён — забег продолжается
                    scenes.go("reward");
                } else {
                    // поражение — забег закончен: сейв снимается
                    if (globalThis.GAME_META.clearRun) globalThis.GAME_META.clearRun();
                    G.resetRun();
                    scenes.go("menu");
                }
            };
            if (victory) {
                // победа сама ведёт в меню трофея — кнопка не нужна
                scheduler.after(1.4 / animK(), () => {
                    if (B && !B.stopped && B.phase === "over" && B.result === "win") B.continueAction();
                });
            } else {
                const btn = new PIXI.Sprite(uiTex("button_menu.png"));
                btn.anchor.set(0.5);
                btn.scale.set(1); // натуральный размер спрайта (просил юзер)
                btn.position.set(640, 390);
                btn.eventMode = "static";
                ov.addChild(btn);
                const bt = T(t("arena.toMenu"), 20, 0xf3e6c2);
                bt.anchor.set(0.5);
                globalThis.GAME_UI.fit(bt, btn.texture.width * btn.scale.x * 0.8, 11); // не шире кнопки
                bt.position.set(640, 390);
                bt.eventMode = "none";
                ov.addChild(bt);
                btn.on("pointertap", () => { B.btnTaps = (B.btnTaps || 0) + 1; if (ctx.sfx) ctx.sfx(); B.continueAction(); });
                B.resultBtn = btn;
            }
            root.addChild(ov);
        }

        // ── Сцена ───────────────────────────────────────────────────────────
        function enter() {
            const encId = G.activeEnemy ? G.activeEnemy.enc : "gob";
            const enc = ENCOUNTERS[encId] || ENCOUNTERS.gob;
            curScene = enc.scene || 1;
            if (ctx.music) ctx.music("battle");
            B = {
                encId, phase: "player", stopped: false, turnNo: 1,
                energy: 1, eEnergy: 1,
                split: 1, // положение ползунка «карты↔энергия» (1 карта / 2 энергии)
                playerBase: 15, playerBaseMax: 15,
                enemyBase: enc.baseHp, enemyBaseMax: enc.baseHp,
                deck: shuffle([...G.deck]), discard: [], hand: [],
                eDeck: shuffle([...enc.deck]), eDiscard: [], eHand: [],
                units: [], traps: { p: [], e: [] },
                selected: null, spellTarget: false, result: null,
                discarding: false, brewCasts: 0,
            };
            G.battle = B;
            drawCards(4);
            moves.length = 0; floats.length = 0; punches.length = 0; // хвосты прошлого боя
            overlay = null;
            drag = null;
            dragFx = null; // прошлого боя Graphics уничтожен вместе с root
            discardPanel = null;
            sfx("openRoom"); // начало боя

            root = new PIXI.Container();
            root.eventMode = "static";
            // фон арены — нарисованная сцена с сеткой поля (по энкаунтеру)
            const bg = new PIXI.Sprite(uiTex(`scenes/${enc.scene || 1}.png`));
            const s = Math.max(1280 / bg.texture.width, 720 / bg.texture.height);
            bg.scale.set(s);
            bg.position.set((1280 - bg.texture.width * s) / 2, (720 - bg.texture.height * s) / 2);
            root.addChild(bg);
            root.board = buildBoard();
            root.addChild(root.board);
            root.unitsLayer = new PIXI.Container();
            root.addChild(root.unitsLayer);
            root.trapLayer = new PIXI.Container();
            root.addChild(root.trapLayer);
            root.cardsLayer = new PIXI.Container();
            root.addChild(root.cardsLayer);
            root.fx = new PIXI.Container();
            root.addChild(root.fx);
            root.hud = buildHud();
            root.addChild(root.hud);
            root.on("pointertap", (e) => {
                B.taps = (B.taps || 0) + 1;
                if (e.target === root && B.phase === "player" && B.selected !== null) {
                    B.selected = null;
                    B.spellTarget = false;
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                }
            });
            ctx.ui.addChild(root);
            layoutHand();
            refreshHud();
            banner(t("arena.yourTurn"));
        }

        function exit() {
            if (B) B.stopped = true;
            window.removeEventListener("pointerup", endCardDrag); // хвост незавершённого drag
            window.removeEventListener("pointermove", sliderMove); // хвост шкалы
            window.removeEventListener("pointerup", sliderUp);
            sliderHeld = false;
            drag = null;
            closeDiscardPanel();
            if (root) { root.destroy({ children: true }); root = null; }
            overlay = null;
            dragFx = null; // Graphics умер вместе с root — не держим мёртвую ссылку
            G.battle = null;
        }

        function update(ticker) {
            if (!root || !B) return;
            const dt = ticker.deltaMS / 1000;
            for (let i = floats.length - 1; i >= 0; i--) {
                const f = floats[i];
                if (f.node.destroyed) { floats.splice(i, 1); continue; } // узел снесён вне анимации
                f.life -= dt;
                f.node.y -= 36 * f.k * dt; // путь тот же — дольше и медленнее
                f.node.alpha = Math.max(0, f.life / f.total);
                if (f.life <= 0) { f.node.destroy(); floats.splice(i, 1); }
            }
            for (let i = punches.length - 1; i >= 0; i--) {
                const p = punches[i];
                if (p.node.destroyed) { punches.splice(i, 1); continue; } // узел снесён вне анимации (wipe в тестах)
                p.life -= dt;
                const k = Math.max(0, p.life / p.total);
                if (p.dying) {
                    p.node.scale.set(k * 1.1);
                    p.node.alpha = k;
                    p.node.rotation = (1 - k) * 0.6;
                } else {
                    p.node.scale.set(1 + Math.sin(k * Math.PI) * 0.22);
                }
                if (p.life <= 0) {
                    if (p.dying) p.node.destroy({ children: true });
                    else p.node.scale.set(1);
                    punches.splice(i, 1);
                }
            }
            for (let i = moves.length - 1; i >= 0; i--) {
                const m = moves[i];
                m.life -= dt;
                if (m.node.destroyed) { moves.splice(i, 1); continue; }
                const k = 1 - Math.max(0, m.life / m.total);
                m.node.x = m.fx + (m.tx - m.fx) * k;
                m.node.y = m.fy + (m.ty - m.fy) * k;
                if (m.life <= 0) {
                    moves.splice(i, 1);
                    if (!moves.some((mm) => mm.u === m.u)) setWalk(m.u, false);
                }
            }
            // кадры спрайтов тикаем сами (autoUpdate=false; update ждёт ТИКЕР,
            // не число — иначе кадр NaN и спрайт замирает). Скорость походки
            // каждый кадр — ползунок «Анимации» действует и на живые юниты.
            for (const u of B.units) {
                const body = u.node.getChildByName("body");
                if (!body) continue;
                const sheet = sheetOf(u);
                body.animationSpeed = ((sheet && sheet.animationSpeed) || 0.2) * animK();
                if (body.playing) body.update(ticker);
            }
            if (bannerT > 0) {
                bannerT -= dt;
                const b = root.hud.userData.banner;
                b.alpha = Math.min(1, bannerT / bannerFade);
                b.scale.set(b.scale.x + (1.0 - b.scale.x) * 0.12);
            } else root.hud.userData.banner.alpha = 0;
            // «Конец хода» с клавиши: Пробел (только в свой ход, без панелей)
            if (B.phase === "player" && !B.discarding && !overlay
                && ctx.input.wasPressed("Space")) api.endTurn();
            if (overlay && B.phase !== "over" && ctx.input.wasPressed("Escape")) {
                closeOverlay();
                return;
            }
            if (B.phase === "player" && B.selected !== null && ctx.input.wasPressed("Escape")) {
                deselect();
            }
        }

        const api = {
            endTurn() {
                if (!B || B.phase !== "player" || B.discarding) return;
                // шкала применяется автоматически: слева карты, справа энергия
                const total = spheresTotal();
                const cards = Math.max(0, Math.min(B.split, total));
                const energy = total - cards;
                if (cards > 0) { drawCards(cards); sfx("chpoc"); }
                if (energy > 0) { B.energy += energy; sfx("aqua"); } // на следующий ход
                layoutHand();
                refreshHud();
                if (B.hand.length > HAND_MAX) buildDiscardPanel(); // лимит — на конце хода
                else enemyTurn();
            },
            // шкала «карты↔энергия»: total сфер (3 + ход−1), split — доля в карты
            sliderGet: () => (B ? { total: spheresTotal(), split: B.split } : null),
            // длительности текущих глиссад (тесты скорости анимаций)
            movesInfo: () => moves.map((m) => Math.round(m.total * 1000) / 1000),
            sliderSet(n) {
                if (!B) return null;
                const total = spheresTotal();
                B.split = Math.max(0, Math.min(total, n | 0));
                refreshSlider();
                return B.split;
            },
            // панель сброса лишних карт (конец хода, рука > 7)
            discardPick(idx) { pickDiscard(idx); },
            discardNeeded: () => (B ? Math.max(0, B.hand.length - HAND_MAX) : 0),
            playCardAt(handIdx, col, row) {
                B.selected = handIdx;
                B.spellTarget = false;
                onCellTap(col, row);
            },
            select(handIdx) { onCardTap(handIdx); },
            castSpell,
            playTrap(handIdx, col, row) { // мина — выбрать карту и пустую клетку
                B.selected = handIdx;
                B.spellTarget = false;
                onCellTap(col, row);
            },
            deployRows,
            // оверлеи боя (настройки / колода-просмотр)
            openPanel(name) { if (B && root && B.phase !== "over") openOverlay(name); },
            closePanel() { closeOverlay(); },
            panel: () => (overlay && overlay.name) || null,
            // drag&drop (режим «Перетаскивание»): состояние для тестов
            dragState() {
                return drag ? { idx: drag.idx, moved: drag.moved, over: drag.over } : null;
            },
            // геометрия первой карты руки (дизайн-координаты) — тесты «не закрывает поле»
            handGeom() {
                if (!root || !B || !root.cardsLayer.children.length) return null;
                const b = root.cardsLayer.children[0].getBounds();
                const s = ctx.ui.scale.x || 1;
                return {
                    x: (b.x - ctx.ui.x) / s, top: (b.y - ctx.ui.y) / s,
                    w: b.width / s, h: b.height / s,
                };
            },
            state() {
                return {
                    phase: B.phase, result: B.result,
                    pBase: B.playerBase, eBase: B.enemyBase,
                    energy: B.energy, eEnergy: B.eEnergy,
                    spheres: { total: spheresTotal(), split: B.split },
                    hand: [...B.hand],
                    discarding: !!B.discarding,
                    units: B.units.map((u) => ({ side: u.side, id: cardIdOf(u.def), col: u.col, row: u.row, hp: u.hp, atk: u.curAtk, type: u.def.type, spr: !!u.node.getChildByName("body") })),
                    traps: { p: B.traps.p.length, e: B.traps.e.length },
                };
            },
            // тест-хук: убить юнита с указанным «убийцей» (для проверки ловушки)
            _kill(col, row, killerCol, killerRow) {
                const u = unitAt(col, row);
                if (!u) return false;
                const killer = (killerCol !== undefined && killerCol !== null) ? unitAt(killerCol, killerRow) : null;
                killUnit(u, killer || null);
                return true;
            },
            // тест-хук: принудительный итог (бои с растущей шкалой длинные —
            // смоук проверяет механики, а не ждёт органического финиша)
            _finish(victory) {
                if (!B || B.phase === "over" || B.discarding) return false;
                if (victory) B.enemyBase = 0; else B.playerBase = 0;
                finish(!!victory);
                return true;
            },
            // тест-хук: разместить юнита любой стороны
            _spawn(side, cardId, col, row) {
                if (unitAt(col, row)) return false;
                return addUnit(side, cardId, col, row);
            },
        };
        function cardIdOf(def) {
            return Object.keys(CARDS).find((k) => CARDS[k] === def);
        }

        return { enter, exit, update, api };
    }

    globalThis.GAME_ARENA = { createArenaScene };
})();
