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
    // (images/scenes/N.png). Границы клеток по колонкам/рядам в базовом
    // разрешении 1920×1080 (сетка на арте слегка неравномерная — потому
    // массивы, а не один шаг). Измерено по градиентам краев клеток.
    const SCENE_GRID = {
        1: { cols: [640.5, 763.5, 891, 1018.5, 1147.5, 1275], rows: [168, 297, 414, 529.5, 649.5, 775.5] },
        2: { cols: [640.5, 763.5, 891, 1018.5, 1147.5, 1275], rows: [178.5, 297, 414, 529.5, 649.5, 775.5] },
    };
    let curScene = 1;
    const cellRect = (col, row) => {
        const g = SCENE_GRID[curScene] || SCENE_GRID[1];
        return {
            x: g.cols[col] + 3, y: g.rows[row] + 3,
            w: g.cols[col + 1] - g.cols[col] - 6, h: g.rows[row + 1] - g.rows[row] - 6,
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
    const { CARDS, ENCOUNTERS, TRAP_SLOTS, enemyDeck } = globalThis.GAME_DATA;

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
        const SPRITE_SCALE = 0.525; // кадр 256 → ~134px, фигура ~102px в клетке
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
        // «Алтарь огня» (spellAura): +N ко ВСЕМУ урону от заклинаний и
        // ловушек стороны (сумма по строениям на поле).
        function altarBonus(side) {
            return B.units.reduce((s, u) => s
                + (u.side === side && u.def.type === "building" && u.def.spellAura
                    ? u.def.spellAura : 0), 0);
        }
        function spellDmg(def, side = "p") {
            return (def.spell.dmg || 0) + (def.spell.brew ? (B.brewCasts || 0) : 0)
                + altarBonus(side);
        }

        // «Заклинатель клинков» (spellBuffAura): после КАЖДОГО розыгрыша
        // заклинания — любой стороной, включая повторы «Горящих рун» — он и
        // все соседние СУЩЕСТВА (строения не считаются) получают +1 к урону
        // навсегда (bonusAtk).
        function afterSpellPlayed() {
            for (const u of B.units.slice()) {
                if (!u.def.spellBuffAura || !B.units.includes(u)) continue;
                const near = B.units.filter((v) => v !== u && v.def.type === "unit"
                    && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1);
                for (const v of [u, ...near]) {
                    v.bonusAtk = (v.bonusAtk || 0) + 1;
                }
                recalcAuras();
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 66, "+1⚔", 0x9fd489);
                punch(u.node);
                sfx("up");
            }
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
            // наведение на жетон — карта-подсказка (жетоны сами не ловят курсор)
            zone.on("pointermove", (e) => {
                const p = zone.toLocal(e.global);
                unitHoverAt(p.x, p.y);
            });
            zone.on("pointerout", () => unitCardHide());
            c.addChild(zone);

            // зона клика по базе врага (для заклинаний с прицелом)
            const baseZone = new PIXI.Graphics();
            baseZone.rect(705, 42, 510, 54);
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
                if (B.phase !== "player" || !B.journeySummon) return;
                // бесплатный призыв из «Глубокого путешествия»: свободные
                // клетки зоны призыва подсвечены, карта не в руке
                for (const [col, r] of freeCells(deployRows("p"))) {
                    const rc = cellRect(col, r);
                    hi.rect(rc.x, rc.y, rc.w, rc.h);
                    hi.fill({ color: 0x7dc95e, alpha: 0.28 });
                }
                return;
            }
            if (B.spellTarget) { // прицел заклинания
                const def = CARDS[B.hand[B.selected]];
                const tg = def && def.spell && def.spell.target;
                if (tg === "anyCell") { // стена костров — годится любая клетка
                    root.board.userData.baseZone.eventMode = "none";
                    for (let r = 0; r < GRID; r++) for (let col = 0; col < GRID; col++) {
                        const rc = cellRect(col, r);
                        hi.rect(rc.x, rc.y, rc.w, rc.h);
                        hi.fill({ color: 0xd0722c, alpha: 0.3 }); // огненная заливка
                    }
                    return;
                }
                if (tg === "emptyCell") { // культ кочерыжки — годится пустая клетка
                    root.board.userData.baseZone.eventMode = "none";
                    for (let r = 0; r < GRID; r++) for (let col = 0; col < GRID; col++) {
                        if (unitAt(col, r)) continue;
                        const rc = cellRect(col, r);
                        hi.rect(rc.x, rc.y, rc.w, rc.h);
                        hi.fill({ color: 0x7dc95e, alpha: 0.3 });
                    }
                    return;
                }
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
                hi.rect(705, 42, 510, 54);
                hi.fill({ color: 0xd05a3c, alpha: 0.3 });
                hi.stroke({ width: 2, color: 0xef9f8c });
                root.board.userData.baseZone.eventMode = "static";
                return;
            }
            root.board.userData.baseZone.eventMode = "none";
            const selDef = CARDS[B.hand[B.selected]];
            if (selDef && selDef.type === "trap") {
                if (selDef.trap.effect === "castRandom") { // руна: подсветка существ
                    for (const u of B.units) {
                        if (u.def.type !== "unit") continue;
                        const rc = cellRect(u.col, u.row);
                        hi.rect(rc.x, rc.y, rc.w, rc.h);
                        hi.fill({ color: 0xb07ad5, alpha: 0.3 });
                    }
                    return;
                }
                // мина: любая пустая клетка
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
        // Жетон ПОЛНОСТЬЮ прозрачен для кликов (finishNode ставит
        // eventMode="none" на весь контейнер): клики всегда уходят в зону
        // поля под ним — иначе спрайт/подписи на клетке съедали pointertap
        // и клетка «не выбиралась» (баг юзера).
        function makeUnitNode(u) {
            const c = new PIXI.Container();
            const sheet = sheetOf(u);
            const spr = u.def.type !== "building" && sheet; // спрайт-существо
            if (u.def.type === "building") {
                const g = new PIXI.Graphics();
                g.moveTo(-39, -12); g.lineTo(0, -39); g.lineTo(39, -12); // крыша
                g.lineTo(39, 36); g.lineTo(-39, 36); g.closePath();
                g.fill(u.def.color);
                g.stroke({ width: 3.75, color: 0xffd98c });
                c.addChild(g);
                // метка эффекта: лагерь даёт +1 урона соседям, алтарь —
                // +1 урона заклинаний/ловушек, костёр лечит соседей (♥),
                // прочие ауры — ✦
                const aura = T(u.def.campAura ? `+${u.def.campAura}⚔`
                    : (u.def.campfire ? "♥"
                        : (u.def.spellAura ? `+${u.def.spellAura}✦` : "✦")), 30, 0xffe9b0);
                aura.anchor.set(0.5);
                aura.position.set(0, -3);
                aura.name = "auraMark";
                c.addChild(aura);
                const hp = T(String(u.hp), 25, 0xff9c8c, { stroke: { color: 0x1c1207, width: 4.5 } });
                hp.anchor.set(1, 1);
                hp.position.set(39, 39);
                hp.name = "hp";
                c.addChild(hp);
                return finishNode(c, u);
            }
            if (spr) {
                const face = u.side === "p" ? "walk_back" : "walk_front";
                const ring = new PIXI.Graphics(); // командная тень под ногами
                ring.ellipse(0, 12, 45, 15);
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
                g.roundRect(-45, -45, 90, 90, 15);
                g.fill(u.def.color);
                g.stroke({ width: 3.75, color: u.side === "p" ? 0x9fc4ef : 0xef9f8c });
                c.addChild(g);
            }
            const atk = T(String(u.curAtk), 25, 0xffe9b0, { stroke: { color: 0x1c1207, width: 4.5 } });
            atk.anchor.set(0, spr ? 1 : 0);
            atk.position.set(spr ? -46 : -39, spr ? 54 : -42);
            atk.name = "atk";
            const hp = T(String(u.hp), 25, 0xff9c8c, { stroke: { color: 0x1c1207, width: 4.5 } });
            hp.anchor.set(1, spr ? 1 : 0);
            hp.position.set(spr ? 46 : 39, spr ? 54 : -42);
            hp.name = "hp";
            c.addChild(atk, hp);
            if (u.def.speed > 1) {
                for (let k = 0; k < u.def.speed; k++) {
                    const pip = new PIXI.Graphics();
                    pip.poly([0, -6, 6, 4.5, -6, 4.5]);
                    pip.closePath();
                    pip.fill(0xffe9b0);
                    pip.position.set(-6 + k * 13.5, spr ? 45 : 33);
                    pip.eventMode = "none";
                    c.addChild(pip);
                }
            }
            return finishNode(c, u);
        }
        function finishNode(c, u) {
            const p = cellXY(u.col, u.row);
            c.position.set(p.x, p.y);
            c.zIndex = u.row; // общий z-order поля (см. unitsLayer)
            c.eventMode = "none"; // клики — всегда в клетки поля под жетоном
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
                    floatText(p.x, p.y - 60, `+${camp}⚔`, 0x9fd489);
                }
                if (def.ability === "dash1") summonDash(u); // «Скорость 1»
                else if (def.ability === "shaman") summonShaman(u); // шаман гоблинов
                else if (def.ability === "spiritSummoner") summonSpiritCaller(u); // призыватель духов
                else if (def.ability === "bombling") summonBombling(u); // бомблинг
                if (def.berserkSummon) addBerserk(u, def.berserkSummon); // «Берсерк» — уже при призыве
            }
            // ловушка врага на клетке призыва (и существа, и строения)
            triggerCellTraps(u);
            return u;
        }

        const floats = [], punches = [];
        const moves = []; // плавные переходы существ между клетками
        function floatText(x, y, text, fill) {
            const tt = T(text, 36, fill, { stroke: { color: 0x1c1207, width: 7.5 } });
            tt.anchor.set(0.5);
            tt.position.set(x, y);
            tt.eventMode = "none"; // всплывающий текст не ест клики поля
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
            u.node.zIndex = u.row; // шагнул ниже по полю — поверх остальных
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
            const ddx = dest[0] - u.col; // боковой шаг (приманка) — боковая походка
            u.col = dest[0];
            u.row = dest[1];
            const p = cellXY(u.col, u.row);
            glide(u, p.x, p.y);
            setWalk(u, true, ddx < 0 ? "walk_left" : ddx > 0 ? "walk_right" : undefined);
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
            floatText(p.x, p.y - 69, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
        }

        // «Призыватель духов»: после призыва бесплатно разыгрывает случайного
        // Гоблина из СБРОСА своей стороны (цена ≤ 3) на пустую соседнюю
        // (верт/гориз) клетку — энергия не тратится (просил юзер). Карта
        // уходит из сброса прямо на поле. Ловушка-гоблин (приманка) ставится
        // как ловушка: нужен свободный слот и клетка без своей ловушки.
        function summonSpiritCaller(u) {
            if (!B.units.includes(u)) return; // мог умереть от мины при призыве
            const discard = u.side === "p" ? B.discard : B.eDiscard;
            const traps = u.side === "p" ? B.traps.p : B.traps.e;
            const near = [[-1, 0], [1, 0], [0, -1], [0, 1]]
                .map(([dc, dr]) => [u.col + dc, u.row + dr]);
            const cellOk = (def, c2, r2) => c2 >= 0 && c2 < GRID && r2 >= 0 && r2 < GRID
                && !unitAt(c2, r2)
                && (def.type !== "trap" || !traps.some((tr) => tr.col === c2 && tr.row === r2));
            const goblins = discard
                .map((id, i) => ({ id, i, def: CARDS[id] }))
                .filter((x) => CARDS[x.id] && isGoblin(x.def) && x.def.cost <= 3
                    && (x.def.type !== "trap" || traps.length < TRAP_SLOTS)
                    && near.some(([c2, r2]) => cellOk(x.def, c2, r2)));
            if (!goblins.length) return;
            const pick = goblins[(Math.random() * goblins.length) | 0];
            discard.splice(pick.i, 1);
            const cells = near.filter(([c2, r2]) => cellOk(pick.def, c2, r2));
            const [col, row] = cells[(Math.random() * cells.length) | 0];
            if (pick.def.type === "trap") armTrap(u.side, pick.id, col, row);
            else addUnit(u.side, pick.id, col, row);
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 69, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
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
            floatText(p.x, p.y - 69, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
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
            floatText(p.x, p.y - 60, "?!", 0xe08cd0);
            damageUnit(u, trap.def.trap.dmg + altarBonus(foe), null, "acid");
            return [trap.col, trap.row];
        }

        // Перемещение завершилось: ловушка врага на этой клетке срабатывает,
        // затем «Выстрел 1» лучника (перемещение состоялось)
        function afterMoved(u) {
            if (!B.units.includes(u) || u.def.type !== "unit") return;
            triggerCellTraps(u);
            archerShot(u);
        }
        // Ловушки на клетке: «Гоблинская мина» (взрыв 3+1 по соседям) и
        // «Гоблинская засада» (выход гоблинов стороны-хозяйки). Срабатывают,
        // когда вражеское существо призвано или переместилось на её клетку.
        function triggerCellTraps(u) {
            if (!B.units.includes(u)) return; // умер раньше (рывок+мина на шаге)
            const foe = u.side === "p" ? "e" : "p";
            let side = foe;
            let i = B.traps[side].findIndex((t) => t.col === u.col && t.row === u.row
                && (t.def.trap.effect === "cellDmg" || t.def.trap.effect === "ambush"
                    || t.def.trap.effect === "confuse"));
            if (i < 0) {
                // «Решётка с шипами» нейтральна: жалит ЛЮБОЕ существо,
                // оказавшееся на клетке, — включая хозяина ловушки
                side = u.side;
                i = B.traps[side].findIndex((t) => t.col === u.col && t.row === u.row
                    && t.def.trap.effect === "cellDmgAll");
            }
            if (i < 0) return;
            const trap = B.traps[side].splice(i, 1)[0];
            redrawTraps();
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 60, "?!", 0xe08cd0);
            if (trap.def.trap.effect === "ambush") {
                // «Гоблинская засада»: в каждой пустой соседней (верт/гориз)
                // клетке появляется Гоблин 2/2 стороны-хозяйки ловушки
                for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const c2 = trap.col + dc, r2 = trap.row + dr;
                    if (c2 < 0 || c2 >= GRID || r2 < 0 || r2 >= GRID) continue;
                    if (unitAt(c2, r2)) continue;
                    addUnit(side, trap.def.trap.spawn, c2, r2);
                }
                refreshHud();
                checkEnd();
                return;
            }
            if (trap.def.trap.effect === "confuse") {
                // «Путь грибов»: существо получает «Запутанность 2» — два
                // своих хода вместо марша пятится к своей базе (просил юзер)
                addConfusion(u, trap.def.trap.turns || 2);
                refreshHud();
                checkEnd();
                return;
            }
            damageUnit(u, trap.def.trap.amount + altarBonus(side), null, "acid");
            if (trap.def.trap.splash) for (const v of B.units.slice()) { // у ловушек без splash соседей не задевает
                if (v !== u && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                    damageUnit(v, trap.def.trap.splash + altarBonus(side), null, "acid");
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
                floatText(p.x, p.y - 15, "−1", 0xff8f6e);
            } else {
                B.playerBase -= 1;
                const p = cellXY(u.col, GRID - 1);
                floatText(p.x, p.y + 15, "−1", 0xff5f4e);
            }
            punch(root.hud);
            refreshHud();
            checkEnd();
        }

        function removeUnit(u) {
            const i = B.units.indexOf(u);
            if (i >= 0) B.units.splice(i, 1);
            if (unitCard && unitCard.unit === u) unitCardHide(); // жетон умер
            // руна («Наскальная рунопись») живёт на существе: существо ушло
            // с поля (смерть, побег, удар по базе) — ловушка рассыпалась
            for (const s of ["p", "e"]) {
                const n = B.traps[s].length;
                B.traps[s] = B.traps[s].filter((tr) => tr.unit !== u);
                if (B.traps[s].length !== n) redrawTraps();
            }
            punches.push({ node: u.node, life: 0.25 / animK(), total: 0.25 / animK(), dying: true });
        }

        function killUnit(u, killer) {
            removeUnit(u);
            sfx("die");
            if (u.def.type === "building") recalcAuras();
            // «Рунный монолит»: на смерть существа постройка теряет 1 жизнь,
            // а владелец берёт карту (просил юзер). Добор до урона — как у
            // «Грибницы»: эффект срабатывает, даже если монолит гибнет сам;
            // смерть монолита — смерть постройки, каскад не повторяется.
            if (u.def.type === "unit") for (const b of B.units.slice()) {
                if (!b.def.runeMonolith) continue;
                if (b.side === "p") drawCards(1); else drawEnemy(1);
                const hand = b.side === "p" ? B.hand : B.eHand;
                const drawn = hand[hand.length - 1];
                const p = cellXY(b.col, b.row);
                floatText(p.x, p.y - 66,
                    drawn ? GAME_LOC.t(`card.${drawn}.name`) : "…", 0xffd98c);
                damageUnit(b, 1, null, "dam");
            }
            // ловушки стороны погибшего: триггер «при гибели своего существа»
            if (killer && killer.def && killer.def.type === "unit" && killer.side !== u.side) {
                triggerTraps(u.side, killer);
            }
        }

        // «Огненное дыхание»: зачарованное существо при КАЖДОМ нанесении
        // урона кладёт владельцу в руку случайное заклинание из своей колоды
        // (карта уходит из колоды; заклинаний в колоде нет — нет и добора).
        function procEnchantFire(killer) {
            if (!killer || !killer.def || killer.def.type !== "unit"
                || !killer.enchantFire || !B.units.includes(killer)) return;
            const deck = killer.side === "p" ? B.deck : B.eDeck;
            const hand = killer.side === "p" ? B.hand : B.eHand;
            const spells = deck.map((id, i) => ({ id, i }))
                .filter((x) => CARDS[x.id].type === "spell");
            if (!spells.length) return;
            const pick = spells[(Math.random() * spells.length) | 0];
            deck.splice(pick.i, 1);
            hand.push(pick.id);
            sfx("chpoc");
            const p = cellXY(killer.col, killer.row);
            floatText(p.x, p.y - 66, GAME_LOC.t(`card.${pick.id}.name`), 0xffd98c);
        }

        // snd — звук удара: "sword" (атака существом), "acid" (ловушка),
        // "rocket" (заклинание), по умолчанию "dam"
        function damageUnit(target, amount, killer = null, snd = "dam") {
            target.hp -= amount;
            procEnchantFire(killer);
            const n = target.node.getChildByName("hp");
            if (n) n.text = String(Math.max(0, target.hp));
            const p = cellXY(target.col, target.row);
            floatText(p.x, p.y - 36, `−${amount}`, 0xffb26e);
            punch(target.node);
            sfx(snd);
            if (target.hp <= 0) { killUnit(target, killer); return; }
            // «Гоблин-асассин»: существо, оставшееся после его урона
            // с 1 жизнью, добивается
            if (target.hp === 1 && target.def.type === "unit"
                && killer && killer.def.ability === "assassin") {
                floatText(p.x, p.y - 66, "☠", 0xef9f8c);
                killUnit(target, killer);
            }
        }

        // Лечение (+n жизни; пределом служит сама карта — жёсткого максимума
        // у существ нет): счётчик на жетоне и всплывающий «+n»
        function healUnit(u, n) {
            if (!B.units.includes(u)) return;
            u.hp += n;
            const node = u.node.getChildByName("hp");
            if (node) node.text = String(u.hp);
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 36, `+${n}`, 0x9fd489);
            punch(u.node);
            sfx("up");
        }

        function baseHit(side, u) {
            sfx("crash");
            procEnchantFire(u); // «Огненное дыхание» срабатывает и на базе
            if (side === "p") {
                B.enemyBase -= u.curAtk;
                const p = cellXY(u.col, 0);
                floatText(p.x, p.y - 15, `−${u.curAtk}`, 0xff8f6e);
            } else {
                B.playerBase -= u.curAtk;
                const p = cellXY(u.col, GRID - 1);
                floatText(p.x, p.y + 15, `−${u.curAtk}`, 0xff5f4e);
            }
            punch(root.hud);
        }

        // «Грибница»: в начало хода владельца даёт 1 энергию и теряет 1 жизнь
        // (энергия начисляется даже если грибница от этого урона погибает).
        // «Походный костёр»: соседние с ним существа (обе стороны) получают
        // 1 жизнь, а сам костёр теряет 1 — лечит раньше, так что даже
        // погибая от собственного жара, он успевает согреть соседей.
        function upkeep(side) {
            for (const b of B.units.slice()) {
                if (b.side !== side || b.def.type !== "building") continue;
                if (b.def.mycelium) {
                    if (side === "p") B.energy += 1; else B.eEnergy += 1;
                    sfx("aqua");
                    const p = cellXY(b.col, b.row);
                    floatText(p.x, p.y - 60, "+1⚡", 0xffd98c);
                    damageUnit(b, 1, null, "dam");
                }
                if (b.def.campfire) {
                    for (const v of B.units.slice()) {
                        if (v.def.type !== "unit") continue;
                        if (Math.abs(v.col - b.col) + Math.abs(v.row - b.row) !== 1) continue;
                        healUnit(v, 1);
                    }
                    damageUnit(b, 1, null, "dam");
                }
            }
            refreshHud();
        }

        // ── Ловушки ─────────────────────────────────────────────────────────
        // Мины хранят клетку (col/row); руна («Наскальная рунопись») —
        // само существо (unit) и ездит с ним.
        function armTrap(side, cardId, col, row, unit = null) {
            if (B.traps[side].length >= TRAP_SLOTS) return false;
            B.traps[side].push({ def: CARDS[cardId], col, row, unit });
            redrawTraps();
            sfx("mine");
            return true;
        }
        function triggerTraps(side, killer) {
            if (!B.traps[side].length) return;
            const trap = B.traps[side].shift();
            redrawTraps();
            const k = cellXY(killer.col, killer.row);
            floatText(k.x, k.y - 60, "?!", 0xe08cd0);
            if (trap.def.trap.effect === "rowDmg") {
                const amount = trap.def.trap.amount + altarBonus(side);
                const victims = B.units.filter((v) => v.side !== side && v.row === killer.row);
                for (const v of victims) {
                    if (B.units.includes(v)) damageUnit(v, amount, null, "acid");
                }
                refreshHud();
                checkEnd();
            }
        }

        // «Наскальная рунопись»: руна висит на существе — когда ОНО атакует
        // (удар в марш или по базе), владелец руны разыгрывает случайное
        // заклинание из своей колоды без траты энергии (просил юзер). Если
        // заклинание может быть нацелено на атакующего — целит именно в него.
        function triggerAttackTraps(attacker) {
            if (!attacker || !B.units.includes(attacker)) return;
            for (const side of ["p", "e"]) {
                const i = B.traps[side].findIndex((tr) =>
                    tr.unit === attacker && tr.def.trap.effect === "castRandom");
                if (i < 0) continue;
                B.traps[side].splice(i, 1);
                redrawTraps();
                const p = cellXY(attacker.col, attacker.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                sfx("mine");
                castRandomSpell(side, attacker);
                refreshHud();
                checkEnd();
            }
        }

        // Свободный каст случайного заклинания владельца side; focus —
        // атакующее существо (приоритетная цель, если заклинание умеет в него).
        function castRandomSpell(side, focus) {
            const deck = side === "p" ? B.deck : B.eDeck;
            const spells = deck.map((id, i) => ({ id, i }))
                .filter((x) => CARDS[x.id] && CARDS[x.id].type === "spell");
            if (!spells.length) return; // заклинаний в колоде нет — руна впустую
            const pick = spells[(Math.random() * spells.length) | 0];
            deck.splice(pick.i, 1);
            const def = CARDS[pick.id];
            const hand = side === "p" ? B.hand : B.eHand;
            const discard = side === "p" ? B.discard : B.eDiscard;
            const fp = cellXY(focus.col, focus.row);
            floatText(fp.x, fp.y - 90, GAME_LOC.t(`card.${pick.id}.name`), 0xffd98c);
            // панельные заклинания (выбор из карт / призыв) авто-розыгрыша
            // не имеют — уходят в руку владельца, разыграет сам за энергию
            if (def.spell.search || def.spell.journey) {
                hand.push(pick.id);
                return;
            }
            if (def.spell.copyLast) { // «Горящие руны»: повтор последнего
                const last = side === "p" ? B.lastSpell.p : B.lastSpell.e;
                const ok = last && last !== "str25" && CARDS[last]
                    && CARDS[last].type === "spell";
                if (!ok) { discard.push(pick.id); return; } // повтора нет — впустую
                if (side === "p") { B.lastSpell.p = "str25"; replaySpell(last); }
                else { B.lastSpell.e = "str25"; enemyReplayLast(); }
                afterSpellPlayed();
                discard.push(pick.id);
                return;
            }
            if (side === "p") {
                applySpellP(pick.id, runeTargetP(pick.id, focus), true);
                if (def.spell.drainAll) B.energy = 0; // огнешар и бесплатно его сжигает
                B.lastSpell.p = pick.id;
            } else {
                enemyCastSpellEffect(def, true, focus);
                if (def.spell.drainAll) B.eEnergy = 0;
                B.lastSpell.e = pick.id;
            }
            afterSpellPlayed(); // «Заклинатель клинков» реагирует и на это
            discard.push(pick.id);
        }

        // Цель свободного каста у игрока: атакующий (focus), если заклинание
        // может на него целиться, иначе автоцель как у «Горящих рун».
        function runeTargetP(cardId, focus) {
            const s = CARDS[cardId].spell;
            if (s.target === "anyCell" || s.target === "none")
                return autoTargetFor(cardId);
            if (!focus || !B.units.includes(focus)) return autoTargetFor(cardId);
            const ok = s.target === "anyUnit" ? focus.side === "p" && focus.def.type === "unit"
                : s.target === "ownUnit" ? focus.side === "p" && focus.def.type === "unit"
                : s.target === "anyUnitDmg" ? focus.def.type === "unit"
                    || (focus.def.type === "building" && !s.noBuildings)
                : s.target === "enemyAny" ? focus.side !== "p"
                : false;
            return ok ? { col: focus.col, row: focus.row } : autoTargetFor(cardId);
        }

        // Повтор последнего заклинания врага (общий код для «Горящих рун»
        // в aiPlay и руны-ловушки): эффект бесплатно, затем сжигание.
        function enemyReplayLast() {
            const last = B.lastSpell.e;
            if (!last || last === "str25" || !CARDS[last]
                || CARDS[last].type !== "spell") return false;
            enemyCastSpellEffect(CARDS[last], true);
            if (CARDS[last].spell.drainAll) B.eEnergy = 0;
            for (const zone of [B.eHand, B.eDeck, B.eDiscard]) {
                const i = zone.indexOf(last);
                if (i >= 0) { zone.splice(i, 1); break; }
            }
            floatText(960, 500, `🔥 ${GAME_LOC.t(`card.${last}.name`)}`, 0xffb26e);
            return true;
        }
        // «Берсерк N» («Двойная атака»): бейдж «×(N+1)» на жетоне зеркально
        // метке «Огненного дыхания»; в марш своего хода существо атакует
        // N дополнительных раз и платит за каждую 1 жизнью (см. marchSide)
        function addBerserk(u, n) {
            u.berserk = (u.berserk || 0) + n;
            let mark = u.node.getChildByName("berserkMark");
            if (!mark) {
                mark = new PIXI.Container();
                mark.name = "berserkMark";
                mark.eventMode = "none";
                const g = new PIXI.Graphics();
                g.circle(0, 0, 13.5);
                g.fill({ color: 0x8a2f1e });
                g.stroke({ width: 3, color: 0xffd98c });
                mark.addChild(g);
                const tx = T("", 17, 0xffe9b0);
                tx.anchor.set(0.5);
                mark.addChild(tx);
                mark.position.set(-36, -54);
                u.node.addChild(mark);
            }
            mark.getChildAt(1).text = `×${u.berserk + 1}`;
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 66, `⚔×${u.berserk + 1}`, 0xffb26e);
        }

        function redrawTraps() {
            const layer = root.trapLayer;
            layer.removeChildren().forEach((n) => n.destroy({ children: true }));
                for (const side of ["p", "e"]) {
                    B.traps[side].forEach((tr) => {
                        // мина — «?» прямо на заминированной клетке; руна —
                        // над существом, на котором висит
                        let p = null;
                        if (tr.unit) {
                            if (!B.units.includes(tr.unit)) return; // снимут в removeUnit
                            p = cellXY(tr.unit.col, tr.unit.row);
                            p.y -= 44;
                        } else p = cellXY(tr.col, tr.row);
                        const c = new PIXI.Container();
                        c.eventMode = "none"; // маркер не ест клики клетки
                        const g = new PIXI.Graphics();
                        g.circle(0, 0, 21);
                        g.fill({ color: side === "p" ? 0x3f5f8a : 0x7a3f3f, alpha: 0.62 });
                        g.stroke({ width: 3, color: 0xd8c79d });
                        c.addChild(g);
                        const q = T("?", 27, 0xffe9b0);
                        q.anchor.set(0.5);
                        c.addChild(q);
                        c.position.set(p.x, p.y);
                        layer.addChild(c);
                    });
                }
        }

        // ── «Стена костров» (str21) ────────────────────────────────────────
        // Ряд клетки горит effects/fire.png; в конце каждого хода ВЛАДЕЛЬЦА
        // (включая ход каста) все существа и строения ряда получают 2 урона
        // (+ аура алтаря). У каждого каста свой счётчик ходов (left).
        function redrawFirewalls() {
            root.fireLayer.removeChildren().forEach((n) => n.destroy({ children: true }));
            for (const f of B.firewalls) {
                for (let col = 0; col < GRID; col++) {
                    const rc = cellRect(col, f.row);
                    const sp = new PIXI.Sprite(uiTex("effects/fire.png"));
                    sp.anchor.set(0.5);
                    sp.scale.set(Math.min(rc.w / sp.texture.width, rc.h / sp.texture.height));
                    sp.position.set(rc.x + rc.w / 2, rc.y + rc.h / 2);
                    sp.eventMode = "none"; // эффект поля не ест клики
                    root.fireLayer.addChild(sp);
                }
            }
        }
        function firewallTick(side) {
            if (!B.firewalls || !B.firewalls.length) return;
            for (const f of B.firewalls) {
                if (f.side !== side) continue;
                for (const v of B.units.slice()) {
                    if (v.row !== f.row || !B.units.includes(v)) continue;
                    damageUnit(v, f.dmg + altarBonus(side), null, "rocket");
                }
                f.left -= 1;
            }
            const keep = B.firewalls.filter((f) => f.left > 0);
            if (keep.length !== B.firewalls.length) { B.firewalls = keep; redrawFirewalls(); }
            refreshHud();
            checkEnd();
        }

        // ── Карта-подсказка на существо/строение (наведение на поле) ───────
        // Просили юзер: наведение на жетон (свой или врага) показывает ЕГО
        // КАРТУ — вся информация о существе на лицевой стороне. Жетоны не
        // ловят клики, поэтому курсор отслеживает зона поля (pointermove);
        // карта показывается на свободном месте слева от поля.
        let unitCard = null; // { unit, node }
        function unitCardHide() {
            if (!unitCard) return;
            unitCard.node.destroy({ children: true });
            unitCard = null;
        }
        function unitHoverAt(x, y) {
            if (!root || !B) return;
            const hit = cellAt(x, y);
            const u = hit ? unitAt(hit[0], hit[1]) : null;
            if (!u) { unitCardHide(); return; }
            if (unitCard && unitCard.unit === u) return;
            unitCardHide();
            const node = globalThis.GAME_UI.cardFace(ctx, cardIdOf(u.def), { scale: 0.75 });
            node.eventMode = "none";
            node.position.set(430, 420); // свободная полоса между героем и полем
            root.addChild(node);
            unitCard = { unit: u, node };
        }

    // ── Карты в руке ────────────────────────────────────────────────────
    // Лицо — картинка карты 230×338 в масштабе 1, нижний
    // край уходит за экран: верх карты ниже поля (поле кончается на y=775) —
    // клетки боя не закрываются. Выбор/наведение — лёгкое увеличение и
    // золотая рамка, БЕЗ подъёма вверх. Неразыгрываемая (не хватает энергии)
    // карта — затемнённая тинтом. Пока выбрана карта — все карты руки
    // неинтерактивны: клики уходят в поле; снять выбор — Esc, клик по фону
    // или мимо подсвеченных клеток.
    const HAND_Y = 1131, HAND_SCALE = 1; // картинка 230×338 в масштабе 1
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
                // мягкое свечение выбора/наведения (просил юзер: жёсткая
                // обводка висела слишком далеко от края спрайта) — золотая
                // заливка РОВНО по границе карты, размытая блюром, ПОД
                // спрайтом: виден только мягкий ореол вокруг краёв
                const frame = new PIXI.Graphics();
                frame.roundRect(-115, -338, 230, 338, 16);
                frame.fill({ color: 0xf0c96a, alpha: 0.85 });
                const blur = new PIXI.BlurFilter({ strength: 9, quality: 3 });
                blur.padding = 18; // ореол не резать по границе фильтра
                frame.filters = [blur];
                frame.visible = false;
                frame.name = "selframe";
                frame.eventMode = "none";
                c.addChildAt(frame, 0);
            } else { // фолбэк без картинки: рубашка + подписи
                const face = new PIXI.Sprite(uiTex("card_back_small.png"));
                face.anchor.set(0.5, 1);
                face.tint = def.type === "unit" ? 0xffffff : (def.color || 0xffffff);
                if (effCost(card) > B.energy) face.tint = (face.tint & 0x9f9f9f) >>> 0;
                c.addChild(face);
                const plate = new PIXI.Graphics();
                plate.roundRect(-66, def.type === "unit" ? -198 : -225, 132, def.type === "unit" ? 66 : 93, 9);
                plate.fill({ color: 0x120d09, alpha: 0.66 });
                c.addChild(plate);
                const name = T(GAME_LOC.t(`card.${card}.name`), 19, 0xf3e6c2);
                name.anchor.set(0.5, 0);
                name.position.set(0, -192);
                globalThis.GAME_UI.fit(name, 126, 15);
                c.addChild(name);
                const bottom = cardBottom(def);
                const stats = T(bottom.text, bottom.small ? 16 : 21, 0xd8c79d,
                    bottom.small ? { wordWrap: true, wordWrapWidth: 126, breakWords: true, align: "center" } : {});
                stats.anchor.set(0.5, 1);
                stats.position.set(0, -138);
                if (!bottom.small) globalThis.GAME_UI.fit(stats, 126, 15);
                c.addChild(stats);
                const tag = T(GAME_LOC.t(`type.${def.type}.short`), 15, 0xcfc4a6);
                tag.anchor.set(0, 1);
                tag.position.set(-60, -51);
                c.addChild(tag);
                const cost = new PIXI.Graphics();
                cost.circle(51, -204, 19.5);
                cost.fill(0x2f6fb0);
                cost.stroke({ width: 3, color: 0xbfe0ff });
                c.addChild(cost);
                const costT = T(String(def.cost), 22, 0xffffff);
                costT.anchor.set(0.5);
                costT.position.set(51, -204);
                c.addChild(costT);
            }
            // «Колдовское варево»: бейдж с числом уже разыгранных в бою
            // копий — урон карты растёт с каждым кастом (просил юзер)
            if (def.spell && def.spell.brew) {
                const badge = new PIXI.Container();
                const disc = new PIXI.Graphics();
                disc.circle(0, 0, 17);
                disc.fill({ color: 0x1c1207, alpha: 0.88 });
                disc.stroke({ width: 2.5, color: 0xf0c96a });
                badge.addChild(disc);
                const bt = T(`×${B.brewCasts || 0}`, 19, 0xffe9b0, { stroke: { color: 0x1c1207, width: 3 } });
                bt.anchor.set(0.5);
                bt.name = "bt";
                badge.addChild(bt);
                badge.position.set(84, -316);
                badge.visible = (B.brewCasts || 0) > 0;
                badge.eventMode = "none";
                badge.name = "brewBadge";
                c.addChild(badge);
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
                // у малых рук разлёт как был (225); у больших — веер с
                // нахлёстом: крайние карты не залезают под «Конец хода»
                // и угловые колоды (просил юзер)
                const spread = Math.min(225, n > 1 ? 790 / (n - 1) : 225);
                node.x = 960 + (idx - (n - 1) / 2) * spread;
                node.y = HAND_Y;
                node.rotation = (idx - (n - 1) / 2) * 0.035;
                const sel = B.selected === idx;
                node.scale.set((sel ? 1.12 : 1) * HAND_SCALE);
                const f = node.getChildByName("selframe");
                if (f) f.visible = sel;
                root.cardsLayer.addChild(node);
            });
        }
        // бейджи «×N» на картах варева в руке: N = разыгранные в этом бою
        // (растёт и от кастов врага). Рука не пересобирается посреди хода —
        // обновляем тексты точечно
        function refreshBrewBadges() {
            if (!root || !B) return;
            for (const node of root.cardsLayer.children) {
                const b = node.getChildByName("brewBadge");
                if (!b) continue;
                b.visible = (B.brewCasts || 0) > 0;
                const bt = b.getChildByName("bt");
                if (bt) bt.text = `×${B.brewCasts || 0}`;
            }
        }

        // ── Перетаскивание карт (режим «Перетаскивание» в Настройках) ────────
        // Наведение увеличивает карту; перетаскивание рисует кривую от её
        // слота в руке до центра клетки, отпускание — призыв. Спеллы и ловушки
        // ставятся кликом как раньше.
        let drag = null, dragFx = null; // drag: {idx,node,homeX,homeY,sx,sy,moved,over}
        // Глобальные экранные → координаты 1920×1080: мировая трансформация
        // ui-корня (letterbox) — полная цепочка от экрана.
        const toDesign = (g) => {
            const wt = ctx.ui.worldTransform;
            return { x: (g.x - wt.tx) / wt.a, y: (g.y - wt.ty) / wt.d };
        };

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
            if (!G.settings.dragSummon || drag || B.phase !== "player" || overlay || B.discarding || B.picking) return;
            const node = root.cardsLayer.children[idx];
            if (!node) return;
            const raised = on || B.selected === idx;
            node.scale.set((raised ? 1.12 : 1) * HAND_SCALE);
            const f = node.getChildByName("selframe");
            if (f) f.visible = raised;
        }
        function startCardDrag(idx, e) {
            if (!G.settings.dragSummon || B.phase !== "player" || overlay || B.discarding || B.picking) return;
            const def = CARDS[B.hand[idx]];
            if (!def || (def.type !== "unit" && def.type !== "building")) return;
            const node = root.cardsLayer.children[idx];
            if (!node) return;
            const p = toDesign(e.global);
            drag = { idx, node, homeX: node.x, homeY: node.y, sx: p.x, sy: p.y, moved: false, over: null };
            window.addEventListener("pointerup", endCardDrag);
        }
        function moveCardDrag(e) {
            if (!drag || !B || B.phase !== "player" || B.stopped || overlay || B.picking) return;
            const p = toDesign(e.global);
            if (!drag.moved) {
                if (Math.hypot(p.x - drag.sx, p.y - drag.sy) < 12) return; // это клик
                drag.moved = true;
                root.cardsLayer.addChild(drag.node); // карта поверх остальных
                B.selected = drag.idx; // подсветить зону призыва
                B.spellTarget = false;
                redrawHighlight();
            }
            drag.node.x = p.x;
            drag.node.y = Math.min(p.y, 1035);
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
            const bow = Math.min(210, len * 0.3);
            dragFx.moveTo(drag.homeX, drag.homeY - 75);
            dragFx.quadraticCurveTo(drag.homeX + dx / 2 - dy / len * bow, drag.homeY + dy / 2 + dx / len * bow, target.x, target.y);
            dragFx.stroke({ width: 4.5, color: ok ? 0xa8e890 : 0xef9f8c, alpha: 0.9 });
            dragFx.circle(drag.homeX, drag.homeY - 75, 7.5);
            dragFx.fill({ color: ok ? 0xa8e890 : 0xef9f8c });
            const rc = cellRect(c2, r2);
            dragFx.rect(rc.x + 3, rc.y + 3, rc.w - 6, rc.h - 6);
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
        const SLIDER_W = 360, SLIDER_X = 1663, SLIDER_Y = 626;
        let sliderHeld = false;
        function refreshSlider() {
            if (!root || !B) return;
            const sl = root.hud.userData.slider;
            const total = spheresTotal();
            B.split = Math.max(0, Math.min(total, B.split));
            // добавки шкалы — на иконках энергии и карт игрока
            root.hud.userData.pEnergyGainT.text = `+${total - B.split}`;
            root.hud.userData.pCardsT.text = `${B.hand.length}+${B.split}`;
            const on = B.phase === "player" && !B.discarding && !B.picking;
            sl.track.eventMode = on ? "static" : "none";
            sl.thumb.eventMode = on ? "static" : "none";
            sl.wrap.alpha = on ? 1 : 0.45;
            const g = sl.track;
            g.clear();
            const w = SLIDER_W, h = 21, x0 = -w / 2;
            g.roundRect(x0, -h / 2, w, h, 10.5);
            g.fill(0x1c1712);
            g.roundRect(x0 + 4.5, -h / 2 + 4.5, Math.max(0, (B.split / total) * (w - 9)), h - 9, 6);
            g.fill(0x3a5f8a); // доля «в карты»
            g.roundRect(x0, -h / 2, w, h, 10.5);
            g.stroke({ width: 3, color: 0x6b5c40 });
            sl.thumb.position.set(x0 + (B.split / total) * w, 0); // сфера button_1
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
            if (!B || B.phase !== "player" || B.discarding || B.picking) return;
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
            dim.rect(0, 0, 1920, 1080);
            dim.fill({ color: 0x000000, alpha: 0.6 });
            dim.eventMode = "static";
            node.addChild(dim);
            const frame = new PIXI.Graphics();
            frame.roundRect(225, 240, 1470, 525, 18);
            frame.fill({ color: 0x171310, alpha: 0.96 });
            frame.stroke({ width: 3, color: 0x6b5c40 });
            node.addChild(frame);
            const title = T(t("discard.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 273);
            title.eventMode = "none";
            node.addChild(title);
            const hint = T(t("discard.hint", { n: B.hand.length - HAND_MAX }), 25, 0xd8c79d);
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 339);
            hint.eventMode = "none";
            node.addChild(hint);
            const n = B.hand.length;
            const spread = Math.min(150, 1350 / Math.max(1, n));
            B.hand.forEach((card, idx) => {
                const def = CARDS[card];
                const c = new PIXI.Container();
                if (def.img) {
                    const face = new PIXI.Sprite(uiTex(`cards/${def.img}.png`));
                    face.anchor.set(0.5, 0.5);
                    face.scale.set(0.825);
                    c.addChild(face);
                } else { // фолбэк без картинки: рубашка + имя
                    const face = new PIXI.Sprite(uiTex("card_back_small.png"));
                    face.anchor.set(0.5, 0.5);
                    c.addChild(face);
                    const nm = T(GAME_LOC.t(`card.${card}.name`), 18, 0xf3e6c2);
                    nm.anchor.set(0.5);
                    nm.position.set(0, 69);
                    nm.eventMode = "none";
                    c.addChild(nm);
                }
                c.position.set(960 + (idx - (n - 1) / 2) * spread, 600);
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

        // ── Панель «Поиск рун» (str23): верхние карты колоды — выбрать ──────
        // заклинание. Не-заклинания видны, но не кликабельны; «Оставить как
        // было» (или Esc) отменяет — карты остаются в колоде в том же порядке.
        let runesPanel = null, runesTop = [];
        function closeRunesPanel() {
            if (!runesPanel) return;
            runesPanel.destroy({ children: true });
            runesPanel = null;
            runesTop = [];
            if (B) B.picking = false;
        }
        function openRunesPanel(n) {
            closeRunesPanel();
            B.picking = true;
            const top = B.deck.slice(-Math.min(n, B.deck.length)); // верх колоды — конец массива
            runesTop = top;
            const node = new PIXI.Container();
            node.eventMode = "static";
            const dim = new PIXI.Graphics();
            dim.rect(0, 0, 1920, 1080);
            dim.fill({ color: 0x000000, alpha: 0.6 });
            dim.eventMode = "static";
            node.addChild(dim);
            const frame = new PIXI.Graphics();
            frame.roundRect(285, 270, 1350, 540, 18);
            frame.fill({ color: 0x171310, alpha: 0.96 });
            frame.stroke({ width: 3, color: 0x6b5c40 });
            node.addChild(frame);
            const title = T(t("runes.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 297);
            title.eventMode = "none";
            node.addChild(title);
            const hint = T(t("runes.hint", { n: top.length }), 25, 0xd8c79d);
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 354);
            hint.eventMode = "none";
            node.addChild(hint);
            const m = top.length;
            const spread = Math.min(210, 1260 / Math.max(1, m));
            top.forEach((cardId, idx) => {
                const isSpell = CARDS[cardId].type === "spell";
                const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                if (!isSpell) c.alpha = 0.5; // не заклинание — взять нельзя
                else { c.eventMode = "static"; c.on("pointertap", () => pickRune(idx)); }
                node.addChild(c);
            });
            if (!top.some((id) => CARDS[id].type === "spell")) {
                const empty = T(t("runes.empty"), 27, 0x8a7c5e);
                empty.anchor.set(0.5, 0);
                empty.position.set(960, 687);
                empty.eventMode = "none";
                node.addChild(empty);
            }
            node.addChild(globalThis.GAME_UI.button(ctx, {
                tex: "button_menu.png", label: t("runes.back"), x: 960, y: 762, scale: 1,
                onTap: closeRunesPanel,
            }));
            root.addChild(node);
            runesPanel = node;
        }
        function pickRune(idx) { // idx — номер карты среди показанных верхних
            if (!B || !B.picking || !runesPanel) return;
            const deckIdx = B.deck.length - runesTop.length + idx;
            const cardId = B.deck[deckIdx];
            if (cardId === undefined || CARDS[cardId].type !== "spell") return;
            B.deck.splice(deckIdx, 1);
            B.hand.push(cardId);
            sfx("chpoc");
            closeRunesPanel();
            layoutHand();
            refreshHud();
        }

        // ── Панель «Глубокое путешествие» (str26): верхние карты колоды ────
        // (снимаются с колоды сразу при касте) — выбрать карту ПРИЗЫВА и
        // сыграть её бесплатно. Из остальных: 1 случайная — в руку, прочие —
        // в сброс (это происходит и без выбора, «Без призыва»/Esc). Если
        // призыва среди верхних нет — панель не открывается вовсе.
        // Выбранная карта ставится в режим journeySummon: игрок кликает
        // клетку зоны призыва — существо выходит БЕЗ траты энергии (Esc или
        // клик мимо — карта просто возвращается в руку).
        let journeyPanel = null, journeyTop = [];
        function closeJourneyPanel() {
            if (!journeyPanel) return;
            journeyPanel.destroy({ children: true });
            journeyPanel = null;
            journeyTop = [];
            if (B) B.picking = false;
        }
        function openJourneyPanel(n) {
            closeJourneyPanel();
            const k = Math.min(n, B.deck.length);
            journeyTop = k ? B.deck.splice(B.deck.length - k, k) : []; // верх колоды — конец массива
            if (!journeyTop.some((id) => CARDS[id].type === "unit")) {
                finishJourney(null); // призыва нет: случайная — в руку, прочие в сброс
                return;
            }
            B.picking = true;
            const node = new PIXI.Container();
            node.eventMode = "static";
            const dim = new PIXI.Graphics();
            dim.rect(0, 0, 1920, 1080);
            dim.fill({ color: 0x000000, alpha: 0.6 });
            dim.eventMode = "static";
            node.addChild(dim);
            const frame = new PIXI.Graphics();
            frame.roundRect(285, 270, 1350, 540, 18);
            frame.fill({ color: 0x171310, alpha: 0.96 });
            frame.stroke({ width: 3, color: 0x6b5c40 });
            node.addChild(frame);
            const title = T(t("journey.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 297);
            title.eventMode = "none";
            node.addChild(title);
            const hint = T(t("journey.hint", { n: journeyTop.length }), 25, 0xd8c79d);
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 354);
            hint.eventMode = "none";
            node.addChild(hint);
            const m = journeyTop.length;
            const spread = Math.min(210, 1260 / Math.max(1, m));
            journeyTop.forEach((cardId, idx) => {
                const isUnit = CARDS[cardId].type === "unit";
                const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                if (!isUnit) c.alpha = 0.5; // не призыв — сыграть нельзя
                else { c.eventMode = "static"; c.on("pointertap", () => pickJourney(idx)); }
                node.addChild(c);
            });
            node.addChild(globalThis.GAME_UI.button(ctx, {
                tex: "button_menu.png", label: t("journey.back"), x: 960, y: 762, scale: 1,
                onTap: () => finishJourney(null),
            }));
            root.addChild(node);
            journeyPanel = node;
        }
        function pickJourney(idx) { // idx — номер карты среди показанных верхних
            if (!B || !B.picking || !journeyPanel) return;
            const cardId = journeyTop[idx];
            if (!cardId || CARDS[cardId].type !== "unit") return;
            finishJourney(cardId);
        }
        // раздача остатков и запуск бесплатного призыва (chosen может быть
        // null — игрок отказался от призыва)
        function finishJourney(chosen) {
            const rest = journeyTop.filter((id) => id !== chosen);
            if (rest.length) {
                const k = (Math.random() * rest.length) | 0;
                B.hand.push(rest[k]); // одна случайная — в руку
                for (let i = 0; i < rest.length; i++) if (i !== k) B.discard.push(rest[i]);
            }
            sfx("chpoc");
            closeJourneyPanel();
            if (chosen) {
                if (freeCells(deployRows("p")).length) { // есть куда поставить
                    B.journeySummon = chosen;
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                B.hand.push(chosen); // поле забито — карта хотя бы в руку
            }
            layoutHand();
            refreshHud();
        }
        // отказ от бесплатного призыва — карта возвращается в руку
        function cancelJourneySummon() {
            if (!B.journeySummon) return;
            B.hand.push(B.journeySummon);
            B.journeySummon = null;
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        // ── HUD боя ────────────────────────────────────────────────────────
        function buildHud() {
            const c = new PIXI.Container();
            // декор HUD — «хром»: клики сквозь него. Раскладка — по референсу
            // юзера (for_work/референсы/new_UI_battle.png): колоды в углах,
            // панели параметров у своих колод, сброс и «Конец хода» справа
            // внизу, полоса базы врага — сверху по центру.

            // полоса жизней базы врага, число — в центре полосы; по краям —
            // его энергия и карты (иконки юзера, раскладка по референсу
            // for_work/референсы/new_UI_battle.png)
            const eBar = new PIXI.Graphics();
            eBar.eventMode = "none";
            c.addChild(eBar);
            const eBaseT = T("", 22, 0xffff99, { stroke: { color: 0x2a1c10, width: 5 } });
            eBaseT.anchor.set(0.5, 0.5);
            eBaseT.position.set(962, 47);
            eBaseT.eventMode = "none";
            c.addChild(eBaseT);
            const digitStyle = { stroke: { color: 0x16283a, width: 6 } };
            const eEnergyIcon = new PIXI.Sprite(uiTex("UI_energy.png"));
            eEnergyIcon.position.set(679, 10);
            eEnergyIcon.eventMode = "none";
            c.addChild(eEnergyIcon);
            const eEnergyT = T("", 42, 0x9fd8e4, digitStyle);
            eEnergyT.anchor.set(0.5);
            eEnergyT.position.set(715, 46);
            eEnergyT.eventMode = "none";
            c.addChild(eEnergyT);
            const eCardsIcon = new PIXI.Sprite(uiTex("UI_cards_hand.png"));
            eCardsIcon.position.set(1164, 8);
            eCardsIcon.eventMode = "none";
            c.addChild(eCardsIcon);
            const eCardsT = T("", 40, 0x9fd8e4, digitStyle);
            eCardsT.anchor.set(0.5);
            eCardsT.position.set(1200, 44);
            eCardsT.eventMode = "none";
            c.addChild(eCardsT);

            // имя противника — каменная плашка слева от его колоды
            const namePlate = new PIXI.Sprite(uiTex("panel_label.png"));
            namePlate.position.set(1314, 24);
            namePlate.eventMode = "none";
            c.addChild(namePlate);
            const title = T("", 30, 0xf0c96a);
            title.anchor.set(0.5, 0.5);
            title.position.set(1484, 67);
            title.eventMode = "none";
            c.addChild(title);

            // колода врага — рубашка гоблинов в правом верхнем углу; клик
            // показывает, какие карты у него остались (просил юзер)
            const eDeckPile = new PIXI.Sprite(uiTex("card_goblin_back.png"));
            eDeckPile.position.set(1725, 24);
            eDeckPile.scale.set(0.74); // 230×338 → 170×250
            eDeckPile.eventMode = "static";
            eDeckPile.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("edeck"); });
            c.addChild(eDeckPile);
            const eDeckCnt = T("", 22, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4.5 } });
            eDeckCnt.anchor.set(0.5, 1);
            eDeckCnt.position.set(1810, 266);
            eDeckCnt.eventMode = "none";
            c.addChild(eDeckCnt);

            // база игрока — зелёная полоса над треком «энергия-карты», число
            // в её центре; по краям трека — энергия и карты игрока (иконки
            // юзера): текущее число у энергии сопровождает «+добавка» по
            // положению шкалы, у карт — «рука+добавка» (референс юзера)
            const pBar = new PIXI.Graphics();
            pBar.eventMode = "none";
            c.addChild(pBar);
            const pBaseT = T("", 22, 0xffff99, { stroke: { color: 0x2a1c10, width: 5 } });
            pBaseT.anchor.set(0.5, 0.5);
            pBaseT.position.set(1663, 535);
            pBaseT.eventMode = "none";
            c.addChild(pBaseT);
            const pEnergyIcon = new PIXI.Sprite(uiTex("UI_energy.png"));
            pEnergyIcon.position.set(1422, 588);
            pEnergyIcon.eventMode = "none";
            c.addChild(pEnergyIcon);
            const pEnergyT = T("", 42, 0x9fd8e4, digitStyle);
            pEnergyT.anchor.set(0.5);
            pEnergyT.position.set(1458, 624);
            pEnergyT.eventMode = "none";
            c.addChild(pEnergyT);
            const pEnergyGainT = T("", 30, 0x9fd3d3, { stroke: { color: 0x0e1826, width: 6 } });
            pEnergyGainT.anchor.set(0, 0.5);
            pEnergyGainT.position.set(1488, 624);
            pEnergyGainT.eventMode = "none";
            c.addChild(pEnergyGainT);
            const pCardsIcon = new PIXI.Sprite(uiTex("UI_cards_hand.png"));
            pCardsIcon.position.set(1822, 586);
            pCardsIcon.eventMode = "none";
            c.addChild(pCardsIcon);
            const pCardsT = T("", 36, 0xffcc66, { stroke: { color: 0x3a2408, width: 6 } });
            pCardsT.anchor.set(0.5);
            pCardsT.position.set(1858, 622);
            pCardsT.eventMode = "none";
            c.addChild(pCardsT);

            // колода игрока — рубашка в левом нижнем углу; клик — просмотр
            const pDeckPile = new PIXI.Sprite(uiTex("card_back_min.png"));
            pDeckPile.position.set(25, 806);
            pDeckPile.scale.set(0.775); // 230×330 → 178×256
            pDeckPile.eventMode = "static";
            pDeckPile.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("deck"); });
            c.addChild(pDeckPile);
            const pDeckCnt = T("", 22, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4.5 } });
            pDeckCnt.anchor.set(0.5, 1);
            pDeckCnt.position.set(114, 1052);
            pDeckCnt.eventMode = "none";
            c.addChild(pDeckCnt);

            // сброс — правый нижний угол: последняя ушедшая карта приглушённым
            // лицом (пусто — тусклая рубашка); клик — просмотр сброса
            const discardFace = new PIXI.Sprite(uiTex("card_back_min.png"));
            discardFace.position.set(1668, 724);
            discardFace.scale.set(1, 338 / 330); // рубашка 230×330 → слот 230×338
            discardFace.tint = 0x5a5a5a;
            discardFace.alpha = 0.6;
            discardFace.eventMode = "static";
            discardFace.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("discard"); });
            c.addChild(discardFace);
            const discardCnt = T("", 22, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4.5 } });
            discardCnt.anchor.set(0.5, 1);
            discardCnt.position.set(1783, 1052);
            discardCnt.eventMode = "none";
            c.addChild(discardCnt);

            // «Конец хода» — слева от сброса (кнопка-сфера без надписи)
            const endBtn = new PIXI.Sprite(uiTex("button_end.png"));
            endBtn.position.set(1477, 836); // 151×174 в натуральном масштабе
            endBtn.eventMode = "static";
            endBtn.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); api.endTurn(); });
            c.addChild(endBtn);
            const endLabel = T(t("arena.endTurn"), 28, 0xffe9b0,
                { stroke: { color: 0x1c1207, width: 5 }, wordWrap: true, wordWrapWidth: 120,
                  breakWords: true, align: "center", lineHeight: 34 });
            endLabel.anchor.set(0.5);
            endLabel.position.set(1552, 919);
            endLabel.eventMode = "none";
            c.addChild(endLabel);

            // шкала конца хода «+карты ↔ +энергия» (применится по «Конец»),
            // над сбросом; бегунок — синяя сфера button_1. Меток у трека нет:
            // добавки теперь видны на иконках энергии и карт по краям
            const slWrap = new PIXI.Container();
            slWrap.position.set(1663, 626);
            const slTrack = new PIXI.Graphics();
            slWrap.addChild(slTrack);
            const slThumb = new PIXI.Sprite(uiTex("button_1.png"));
            slThumb.anchor.set(0.5);
            slThumb.scale.set(0.81); // 99×128 → ~80×104
            slWrap.addChild(slThumb);
            slTrack.on("pointerdown", sliderGrab);
            slThumb.on("pointerdown", sliderGrab);
            c.addChild(slWrap);
            // иконки и числа — ПОВЕРХ трека и бегунка (просил юзер): полоска
            // заходит под края иконок, ползунок у краёв — под числа; клики
            // не теряются: у иконок и чисел eventMode "none"
            c.addChild(pEnergyIcon);
            c.addChild(pEnergyT);
            c.addChild(pCardsIcon);
            c.addChild(pCardsT);
            c.addChild(pEnergyGainT);

            // настройки — левый верхний угол
            const gear = new PIXI.Sprite(uiTex("icon_setting.png"));
            gear.anchor.set(0.5);
            gear.scale.set(0.92);
            gear.position.set(57, 57);
            gear.eventMode = "static";
            gear.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("settings"); });
            c.addChild(gear);

            const targetHint = T("", 24, 0xef9f8c, { stroke: { color: 0x1c1207, width: 6 } });
            targetHint.anchor.set(0.5);
            targetHint.position.set(960, 849);
            targetHint.eventMode = "none";
            c.addChild(targetHint);

            const banner = T("", 81, 0xffe2a8, { stroke: { color: 0x1c1207, width: 12 } });
            banner.anchor.set(0.5);
            banner.position.set(960, 450);
            banner.alpha = 0;
            banner.eventMode = "none"; // баннер не ест клики поля под ним
            c.addChild(banner);

            c.userData = { eBar, eBaseT, eEnergyT, eCardsT, title, pBar, pBaseT, pEnergyT,
                pEnergyGainT, pCardsT, eDeckCnt, pDeckCnt, discardCnt,
                discardFace, lastDiscard: undefined, endBtn, endLabel, banner, targetHint,
                slider: { wrap: slWrap, track: slTrack, thumb: slThumb } };
            return c;
        }

        // ── Оверлеи поверх боя: настройки / колода (просмотр) ────────────────
        let overlay = null; // { name, node, grid, pane }
        let ovZoom = null; // ховер-зум карты {id, node, cur, tgt}
        let ovCards = []; // узлы карточек сетки (тесты: pointerover/out)
        const OV_PANE = { x: 315, y: 198, w: 1290, h: 660 }; // окно просмотра
        function closeOverlay() {
            if (!overlay) return;
            hideOvZoom(true); // зум-копия — ребёнок overlay.node, гасим первой
            overlay.node.destroy({ children: true });
            overlay = null;
            ovCards = [];
            if (drag) endCardDrag(); // защита от пересечения состояний
        }
        // Ховер-зум карт оверлея (просил юзер — как в меню «Колоды»): копия
        // поверх панели растёт 0.75 → 1 (оригинальный размер спрайта),
        // уведение — уменьшается обратно и удаляется. Копия добавляется в
        // node оверлея — маска скролла её не обрезает.
        function showOvZoom(id, cx, cy, base) {
            hideOvZoom(true);
            if (!overlay || !overlay.pane) return;
            // базовую карту прячем на время показа копии (просил юзер —
            // иначе видны обе). Через alpha, не visible: невидимая карта
            // остаётся кликабельной, а dim-карты вернут свою прозрачность
            let baseAlpha = 1;
            if (base && !base.destroyed) { baseAlpha = base.alpha; base.alpha = 0; }
            const zNode = globalThis.GAME_UI.cardFace(ctx, id, { scale: 0.75 });
            zNode.eventMode = "none"; // уведение проходит к карте под копией
            const st = overlay.pane.state;
            const iy = -st.t * Math.max(0, st.contentH - st.viewH);
            // полная карта 337×495: не даём вылезти за окно панели
            const hw = 172, hh = 250;
            zNode.position.set(
                Math.max(OV_PANE.x + hw, Math.min(OV_PANE.x + OV_PANE.w - hw, OV_PANE.x + cx)),
                Math.max(OV_PANE.y + hh, Math.min(OV_PANE.y + OV_PANE.h - hh, OV_PANE.y + cy + iy)),
            );
            overlay.node.addChild(zNode);
            ovZoom = { id, node: zNode, cur: 0.75, tgt: 1, base, baseAlpha };
        }
        function hideOvZoom(immediate) {
            if (!ovZoom) return;
            if (immediate) {
                if (ovZoom.base && !ovZoom.base.destroyed) ovZoom.base.alpha = ovZoom.baseAlpha;
                ovZoom.node.destroy({ children: true });
                ovZoom = null;
            } else ovZoom.tgt = 0.75; // плавно уменьшится в update, затем удалится
        }
        function openOverlay(name) {
            if (overlay || (B && B.discarding)) return; // поверх сброса — ничего
            if (overlay) closeOverlay();
            const node = new PIXI.Container();
            let grid = null; // сетка карт (deck/edeck/discard) — для тестов
            let pane = null; // скролл-панель просмотра (ховер-зум берёт сдвиг скролла)
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
            } else { // deck / edeck / discard — только просмотр, без редактирования:
                // колода — ОСТАТОК (B.deck), колода врага — его остаток (B.eDeck),
                // сброс — лежащие карты (B.discard)
                const { T, button, cardFace, scrollPane } = globalThis.GAME_UI;
                const { CARDS } = globalThis.GAME_DATA;
                const pile = name === "discard" ? B.discard
                    : name === "edeck" ? B.eDeck : B.deck;
                const frame = new PIXI.Graphics();
                frame.roundRect(285, 81, 1350, 885, 18);
                frame.fill({ color: 0x171310, alpha: 0.95 });
                frame.stroke({ width: 3, color: 0x6b5c40 });
                node.addChild(frame);
                const title = T(t(name === "discard" ? "deck.discardTitle"
                    : name === "edeck" ? "deck.enemyTitle" : "deck.viewTitle"),
                    45, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 105);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("deck.viewHint"), 21, 0x8a7c5e);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 162);
                hint.eventMode = "none";
                node.addChild(hint);
                pane = scrollPane(ctx, {
                    x: OV_PANE.x, y: OV_PANE.y, w: OV_PANE.w, h: OV_PANE.h,
                    onScroll: () => hideOvZoom(false), // прокрутка — старый зум мимо
                });
                grid = new PIXI.Container();
                ovCards = [];
                // cardFace 0.75 = карта ~253×371 (центр в position): ряды
                // дальше высоты карты (415), первый ряд целиком в панели
                // (просил юзер: карты обрезались сверху и налагались)
                const CARD_H = 371, ROW_STEP = 415, TOP = 200;
                const ids = [...new Set(pile)].sort((a, b) =>
                    (CARDS[a].cost - CARDS[b].cost) || a.localeCompare(b));
                ids.forEach((id, i) => {
                    const col = i % 4, rowI = (i / 4) | 0;
                    const cx = 172.5 + col * 322.5, cy = TOP + rowI * ROW_STEP;
                    const card = cardFace(ctx, id, { scale: 0.75 });
                    card.position.set(cx, cy);
                    card.eventMode = "static"; // ховер-зум — на любой карте
                    card.on("pointerover", () => showOvZoom(id, cx, cy, card));
                    card.on("pointerout", () => hideOvZoom(false));
                    grid.addChild(card);
                    ovCards.push(card);
                    const n = pile.reduce((s, c) => s + (c === id ? 1 : 0), 0);
                    const cnt = T(`×${n}`, 27, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 6 } });
                    cnt.anchor.set(0.5);
                    cnt.position.set(cx + 72, cy - 96);
                    cnt.eventMode = "none";
                    grid.addChild(cnt);
                });
                if (!ids.length) {
                    const empty = T(t("deck.viewEmpty"), 30, 0x8a7c5e);
                    empty.position.set(66, 30);
                    empty.eventMode = "none";
                    grid.addChild(empty);
                }
                const rowsN = Math.ceil(ids.length / 4);
                pane.setContent(grid,
                    ids.length ? TOP + CARD_H / 2 + (rowsN - 1) * ROW_STEP : 60);
                node.addChild(pane.node);
                node.addChild(button(ctx, {
                    tex: "button_menu.png", label: t("settings.back"), x: 960, y: 1017, scale: 1,
                    onTap: closeOverlay,
                }));
            }
            root.addChild(node);
            overlay = { name, node, grid, pane };
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
            globalThis.GAME_UI.fit(ud.title, 300);
            // полоса базы врага — верх экрана по центру (742..1182)
            drawBar(ud.eBar, 742, 31, 440, 33, B.enemyBase / B.enemyBaseMax, 0xc0503c);
            ud.eBaseT.text = `${Math.max(0, B.enemyBase)}/${B.enemyBaseMax}`;
            // энергия и карты врага — числа на иконках по краям его полосы
            ud.eEnergyT.text = String(B.eEnergy);
            ud.eCardsT.text = String(B.eHand.length);
            // база игрока — зелёная полоса над треком (1449..1877); энергия
            // и карты — на иконках, добавку шкалы дорисует refreshSlider
            drawBar(ud.pBar, 1449, 520, 428, 31, B.playerBase / B.playerBaseMax, 0x579e52);
            ud.pBaseT.text = `${Math.max(0, B.playerBase)}/${B.playerBaseMax}`;
            ud.pEnergyT.text = String(B.energy);
            ud.pDeckCnt.text = String(B.deck.length);
            ud.eDeckCnt.text = String(B.eDeck.length);
            ud.discardCnt.text = String(B.discard.length);
            // сброс: последняя ушедшая карта приглушённым лицом
            const last = B.discard[B.discard.length - 1] || null;
            if (ud.lastDiscard !== last) {
                ud.lastDiscard = last;
                if (last && CARDS[last] && CARDS[last].img) {
                    ud.discardFace.texture = uiTex(`cards/${CARDS[last].img}.png`);
                    ud.discardFace.scale.set(1); // лицо 230×338 — натуральный слот
                    ud.discardFace.tint = 0x8a8a8a;
                    ud.discardFace.alpha = 1;
                } else {
                    ud.discardFace.texture = uiTex("card_back_min.png");
                    ud.discardFace.scale.set(1, 338 / 330);
                    ud.discardFace.tint = 0x5a5a5a;
                    ud.discardFace.alpha = 0.6;
                }
            }
            const on = B.phase === "player";
            ud.endBtn.alpha = on ? 1 : 0.45;
            ud.endBtn.eventMode = on ? "static" : "none";
            ud.endLabel.alpha = on ? 1 : 0.45;
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
                // «Подкрепление»: и колода, и сброс пусты — свежая тасовка
                // базовой колоды врага (иначе в затяжном бою ИИ остаётся
                // без карт и копит энергию — просил юзер)
                if (!B.eDeck.length && B.eDeckBase) B.eDeck = shuffle([...B.eDeckBase]);
                if (!B.eDeck.length) break;
                B.eHand.push(B.eDeck.pop());
            }
        }

        // ── «Запутанность N» (ловушка «Путь грибов», просил юзер) ─────────
        // Запутанное существо вместо своего перемещения/атаки (всего марша,
        // включая доб. атаки берсерка) идёт на клетку НАЗАД — к своей базе —
        // а всех, кто преграждает путь (свои, чужие, постройки, своя база),
        // атакует, как будто они вражеские. Счётчик — оставшиеся СВОИ ходы:
        // сработал в марш/призыв → в начале следующих двух ходов владельца
        // пятится, затем эффект снимается.
        function addConfusion(u, turns) {
            u.confused = turns;
            let mark = u.node.getChildByName("confuseMark");
            if (!mark) {
                mark = new PIXI.Container();
                mark.name = "confuseMark";
                mark.eventMode = "none";
                const g = new PIXI.Graphics();
                g.circle(0, 0, 13.5);
                g.fill({ color: 0x5a3f7a });
                g.stroke({ width: 3, color: 0xd0b0ef });
                mark.addChild(g);
                const tx = T("", 17, 0xf3e6ff);
                tx.anchor.set(0.5);
                mark.addChild(tx);
                mark.position.set(0, -66); // берсерк/очарование — по краям головы
                u.node.addChild(mark);
            }
            mark.getChildAt(1).text = String(u.confused);
            const p = cellXY(u.col, u.row);
            floatText(p.x, p.y - 66, "✧", 0xb07ad5);
            sfx("aqua");
        }
        function removeConfuseMark(u) {
            const mark = u.node && u.node.getChildByName("confuseMark");
            if (mark) mark.destroy({ children: true });
        }
        // Запутанное бьёт СВОЮ базу (зеркало baseHit: та же геометрия/цвета,
        // но минус стороне владельца) — база «мешает пройти»
        function ownBaseHit(u) {
            sfx("crash");
            procEnchantFire(u);
            if (u.side === "p") {
                B.playerBase -= u.curAtk;
                const p = cellXY(u.col, GRID - 1);
                floatText(p.x, p.y + 15, `−${u.curAtk}`, 0xff5f4e);
            } else {
                B.enemyBase -= u.curAtk;
                const p = cellXY(u.col, 0);
                floatText(p.x, p.y - 15, `−${u.curAtk}`, 0xff8f6e);
            }
            punch(root.hud);
        }
        // Ход запутанного существа (вместо марша): шаг назад или удар
        // встанавшего на пути; у задней кромки позади своя база — бьёт её
        // и уходит с поля. Асинхронно из-за паузы глиссады, как марш.
        async function confusedAct(u) {
            if (!B.units.includes(u)) return;
            const back = u.row + (u.side === "p" ? 1 : -1);
            if (back < 0 || back >= GRID) {
                ownBaseHit(u);
                triggerAttackTraps(u); // удар по базе — тоже атака (руна)
                removeUnit(u);
                refreshHud();
                checkEnd();
                return;
            }
            const occ = unitAt(u.col, back);
            if (occ) { // любой на пути — «как будто вражеский»
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "⚔", 0xb07ad5);
                damageUnit(occ, u.curAtk, u, "sword");
                triggerAttackTraps(u);
                refreshHud();
                checkEnd();
                return;
            }
            u.row = back;
            const p = cellXY(u.col, u.row);
            glide(u, p.x, p.y);
            setWalk(u, true, u.side === "p" ? "walk_front" : "walk_back");
            sfx("step");
            await delay(0.52 / animK()); // глиссада + пауза: полный шаг походки
            if (B.stopped) return;
            afterMoved(u); // перемещение — вражеские ловушки могут сработать
            checkEnd();
        }

        // ── Марш: юниты стороны идут вперёд (строения стоят) ────────────────
        async function marchSide(side) {
            const dir = side === "p" ? -1 : 1;
            const order = B.units.filter((u) => u.side === side && u.def.type === "unit")
                .sort((a, b) => (side === "p" ? a.row - b.row : b.row - a.row));
            for (const u of order) {
                if (B.stopped || !B.units.includes(u)) continue;
                if (u.confused > 0) { // «Запутанность»: марш заменён пятанием назад
                    await confusedAct(u);
                    if (B.stopped || B.phase === "over") return;
                    u.confused -= 1;
                    if (u.confused <= 0) { u.confused = 0; removeConfuseMark(u); refreshHud(); }
                    continue; // доб. атаки берсерка пропускает — не марширует
                }
                if (u.def.ability === "coward") { fleeCoward(u, side); continue; } // «Трусливый гоблин»
                for (let step = 0; step < u.def.speed; step++) {
                    if (B.stopped || !B.units.includes(u)) break;
                    const ahead = u.row + dir;
                    if (ahead < 0 || ahead >= GRID) {
                        baseHit(side, u);
                        triggerAttackTraps(u); // удар по базе — тоже атака (руна)
                        removeUnit(u);
                        refreshHud();
                        if (checkEnd()) return;
                        break;
                    }
                    const occ = unitAt(u.col, ahead);
                    if (occ) {
                        if (occ.side !== u.side) {
                            damageUnit(occ, u.curAtk, u, "sword");
                            triggerAttackTraps(u); // руна: существо атаковало
                            refreshHud();
                            if (checkEnd()) return;
                        }
                        break; // занято — стоим (своим не даём пройти, своих не бьём)
                    }
                    const dest = lureRedirect(u, u.col, u.row, u.col, ahead);
                    if (!B.units.includes(u)) break; // приманка убила шагнувшего
                    const ddx = dest[0] - u.col; // боковой шаг (приманка) — боковая походка
                    u.col = dest[0];
                    u.row = dest[1];
                    const p = cellXY(u.col, u.row);
                    glide(u, p.x, p.y);
                    setWalk(u, true, ddx < 0 ? "walk_left" : ddx > 0 ? "walk_right" : undefined);
                    sfx("step");
                    await delay(0.52 / animK()); // глиссада + пауза: полный шаг походки
                    if (B.stopped) return;
                    afterMoved(u); // перемещение — ловушки врага
                    if (checkEnd()) return;
                }
                // «Берсерк» («Двойная атака»): в начале хода владельца —
                // дополнительные атаки, каждая ценой 1 жизни (просил юзер).
                // Атаки нет (впереди пусто или своё) — жизни не теряет.
                // Паузы разведены нарочно: сначала видно, как доб. атака
                // ПРОШЛА, и только потом существо платит жизнью.
                for (let k = 0; k < (u.berserk || 0); k++) {
                    if (B.stopped || !B.units.includes(u)) break;
                    await delay(0.3 / animK()); // отделяем доб. атаку от маршевой
                    if (B.stopped || !B.units.includes(u)) break;
                    const ahead = u.row + dir;
                    if (ahead < 0 || ahead >= GRID) {
                        baseHit(side, u);
                        triggerAttackTraps(u);
                    } else {
                        const occ = unitAt(u.col, ahead);
                        if (!occ || occ.side === u.side) break;
                        const p = cellXY(u.col, u.row);
                        floatText(p.x, p.y - 60, "⚔", 0xffb26e);
                        damageUnit(occ, u.curAtk, u, "sword");
                        triggerAttackTraps(u);
                    }
                    refreshHud();
                    if (checkEnd()) return;
                    if (!B.units.includes(u)) break;
                    await delay(0.35 / animK()); // цена — после видимой атаки
                    if (B.stopped || !B.units.includes(u)) break;
                    damageUnit(u, 1, null, "dam"); // цена берсерка
                    refreshHud();
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

        // «Трусливый гоблин» (str29): в начале хода владельца вместо марша
        // сбегает с поля, а карта его призыва возвращается из сброса или
        // колоды в руку (если она там есть) — бесплатную стену можно ставить
        // снова. removeUnit, не killUnit: побег — не смерть, ловушки молчат.
        function fleeCoward(u, side) {
            const id = cardIdOf(u.def);
            const hand = side === "p" ? B.hand : B.eHand;
            const discard = side === "p" ? B.discard : B.eDiscard;
            const deck = side === "p" ? B.deck : B.eDeck;
            const p = cellXY(u.col, u.row);
            removeUnit(u);
            floatText(p.x, p.y - 60, GAME_LOC.t(`card.${id}.name`), 0xd8c79d);
            let i = discard.indexOf(id);
            if (i >= 0) { discard.splice(i, 1); hand.push(id); }
            else {
                i = deck.indexOf(id);
                if (i >= 0) { deck.splice(i, 1); hand.push(id); }
            }
            sfx("chpoc");
        }

        // ── План добора ИИ по шкале конца хода (мягкое правило — просил юзер).
        // Короткая рука добирается до 4; с 4-го хода ИИ считает по стоимостям
        // карты руки, сколько реально разыграет на следующую ману (запас +
        // доход) — меньше четырёх разыгрываемых, добор до четырёх. Если на
        // следующий ход у него будет 12+ маны — рука добивается до 7; при
        // 20+ маны вся шкала идёт только в карты. Энергия не уходит в минус,
        // до 4-го хода накопления в добор не конвертируются.
        function enemyDrawPlan() {
            const total = spheresTotal();
            const nextMana = B.eEnergy + total; // мана следующего хода
            let eCards = 0;
            if (B.eHand.length < 4) eCards = 4 - B.eHand.length;
            if (B.turnNo >= 4) {
                const costs = B.eHand.map((c) => effCost(c, "e")).sort((a, b) => a - b);
                let mana = nextMana, playable = 0;
                for (const c of costs) { if (c <= mana) { mana -= c; playable++; } else break; }
                if (playable < 4) eCards = Math.max(eCards, 4 - playable);
            }
            if (nextMana >= 12) eCards = Math.max(eCards, HAND_MAX - B.eHand.length);
            if (B.eEnergy >= 20) eCards = HAND_MAX - B.eHand.length; // только карты
            return Math.max(0, Math.min(eCards,
                HAND_MAX - B.eHand.length,
                B.turnNo >= 4 ? total + B.eEnergy : total));
        }

        async function enemyTurn() {
            B.phase = "enemy";
            B.selected = null;
            B.spellTarget = false;
            layoutHand();
            redrawHighlight();
            refreshHud();
            firewallTick("p"); // стена костров игрока — конец хода игрока
            if (B.stopped || B.phase === "over") return;
            banner(t("arena.enemyTurn"));
            await delay(0.5 / animK());
            if (B.stopped) return;
            upkeep("e"); // грибницы врага
            await marchSide("e");
            if (B.stopped || B.phase === "over") return;
            await aiPlay();
            if (B.stopped || B.phase === "over") return;
            // шкала врага — мягкое правило добора (просил юзер), см. enemyDrawPlan
            const eCards = enemyDrawPlan();
            drawEnemy(eCards);
            B.eEnergy += spheresTotal() - eCards;
            refreshHud();
            await delay(0.25 / animK());
            if (B.stopped) return;
            await playerTurnStart();
        }

        // ── Карта, разыгранная врагом (просил юзер): лицом на свободном
        // месте слева от поля, со свечением по краю; между розыгрышами врага
        // пауза ≥ 1 реальной секунды, и всё это время карта видна — игрок
        // понимает, что делает противник.
        let enemyCard = null; // { id, node }
        function showEnemyCard(cardId) {
            hideEnemyCard();
            const node = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.75 });
            node.eventMode = "none";
            node.position.set(430, 420);
            // свечение по ФАКТИЧЕСКОЙ кромке карты (просил юзер): жёсткая
            // рамка с чужими размерами сидела криво — слои от широкого
            // тусклого к узкому яркому поверх bounds лица карты
            const b = node.getLocalBounds();
            const frame = new PIXI.Graphics();
            for (const [w, a] of [[30, 0.08], [18, 0.16], [10, 0.3], [4.5, 0.95]])
                frame.roundRect(b.x, b.y, b.width, b.height, 16)
                    .stroke({ width: w, color: 0xff5a36, alpha: a });
            frame.name = "glowFrame";
            frame.eventMode = "none";
            node.addChild(frame);
            root.addChild(node);
            enemyCard = { id: cardId, node };
        }
        function hideEnemyCard() {
            if (!enemyCard) return;
            enemyCard.node.destroy({ children: true });
            enemyCard = null;
        }
        // Ловушка врага — РУБАШКОЙ (просил юзер): игрок видит, что противник
        // сыграл карту, но какая именно ловушка — неизвестно; на поле встанет
        // безликий «?» (гоблинская рубашка колоды — та же, что у колоды врага)
        function showEnemyBack() {
            hideEnemyCard();
            const node = new PIXI.Sprite(uiTex("card_goblin_back.png"));
            node.scale.set(0.75);
            node.eventMode = "none";
            node.position.set(430, 420);
            const b = node.getLocalBounds();
            const frame = new PIXI.Graphics();
            for (const [w, a] of [[30, 0.08], [18, 0.16], [10, 0.3], [4.5, 0.95]])
                frame.roundRect(b.x, b.y, b.width, b.height, 16)
                    .stroke({ width: w, color: 0xff5a36, alpha: a });
            frame.name = "glowFrame";
            frame.eventMode = "none";
            node.addChild(frame);
            root.addChild(node);
            enemyCard = { id: null, node };
        }
        // пауза между розыгрышами: минимум 1 секунда (реальная), при
        // замедленных анимациях — дольше
        const enemyPlayDelay = () => Math.max(1, 1 / animK());

        // ── Панельные карты у ИИ (просил юзер): эффекты, которые у игрока
        // идут через панели выбора, ИИ разыгрывает «в голове» — цель берёт
        // теми же приоритетами, что и обычные карты.
        // Жертва «Жертвоприношения» (str11): своё существо, чей взрыв убивает
        // врагов и окупает потерю — слабое своё против убиваемого, либо
        // 2+ убиваемых разом.
        function aiSacrificePick() {
            const dmg = CARDS.str11.spell.dmg;
            let best = null, bestScore = 0;
            for (const u of B.units) {
                if (u.side !== "e" || u.def.type !== "unit") continue;
                const kills = B.units.filter((v) => v.side === "p"
                    && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1
                    && v.hp <= dmg).length;
                const score = kills * 3 - (u.hp + u.curAtk); // убитый враг ценнее слабого своего
                if (kills >= 1 && score > bestScore) { best = u; bestScore = score; }
            }
            return best;
        }
        // Играбельность заклинания для ИИ (общие проверки цели/эффекта).
        // forReplay — проверка ПОВТОРА «Горящими рунами»: карта уже не в руке.
        function aiSpellPlayable(def, forReplay = false) {
            const s = def.spell;
            if (s.copyLast) return aiReplayOk();
            if (s.sacrifice && !aiSacrificePick()) return false;
            // «Раскалённые обломки» — только если есть что бить
            if (s.aoeDmg && !B.units.some((v) => v.side === "p")) return false;
            // «Культ кочерыжки» — нужна хоть одна пустая клетка под гоблинов
            if (s.cultRow && B.units.length >= GRID * GRID) return false;
            // «Поднять стяги!» — только если есть своё существо
            if (s.buffAllAtk && !B.units.some((v) => v.side === "e" && v.def.type === "unit")) return false;
            // «Бросок валуна» — тоже нужна своя цель
            if (s.baseHit && !B.units.some((v) => v.side === "e" && v.def.type === "unit")) return false;
            // добор-заклинание — тоже трата энергии; гасим только при полной руке
            if (s.draw && B.eHand.length >= HAND_MAX) return false;
            // огнешар при энергии 1..2 почти пуст (урон 0..1) — копим дальше
            if (s.drainAll && B.eEnergy < 3) return false;
            // «Поиск рун»: в верхних картах колоды должно быть заклинание
            if (s.search && !B.eDeck.slice(-s.search)
                .some((id) => CARDS[id] && CARDS[id].type === "spell")) return false;
            // «Глубокое путешествие»: в верхних картах колоды должен быть призыв
            if (s.journey && !B.eDeck.slice(-Math.min(s.journey, B.eDeck.length))
                .some((id) => CARDS[id] && CARDS[id].type === "unit")) return false;
            // усиление/очарование — только если есть своё существо под него
            if (s.target === "anyUnit" && !B.units.some((v) => v.side === "e"
                && v.def.type === "unit" && (!s.enchantFire || !v.enchantFire))) return false;
            // дротик/варево/огнешар — только если есть цель
            if (s.target === "anyUnitDmg" && !B.units.some((v) => v.side === "p"
                && (v.def.type === "unit"
                    || (v.def.type === "building" && !s.noBuildings)))) return false;
            return true;
        }
        // Есть ли смысл повторять последнее заклинание («Горящие руны»):
        // оно есть, это не сами руны и его эффект сейчас применим
        function aiReplayOk() {
            const last = B.lastSpell.e;
            if (!last || last === "str25") return false;
            const def = CARDS[last];
            return !!def && def.type === "spell" && aiSpellPlayable(def, true);
        }
        // Эффект заклинания врага — один код для прямого розыгрыша и для
        // повтора «Горящими рунами» (там эффект последнего заклинания,
        // free=true — цена повтора не вычитается из урона). focus —
        // приоритетная цель руны-ловушки: если заклинание умеет целиться
        // в это существо, бьёт именно его (просил юзер).
        function enemyCastSpellEffect(def, free = false, focus = null) {
            const s = def.spell;
            if (s.target === "anyUnit") { // усиление/очарование — своему сильнейшему
                const own = B.units.filter((v) => v.side === "e" && v.def.type === "unit"
                    && (!s.enchantFire || !v.enchantFire));
                let best = own.slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row))[0];
                if (focus && own.includes(focus)) best = focus;
                if (!best) return;
                if (s.enchantFire) { // «Огненное дыхание»
                    best.enchantFire = true;
                    const mark = new PIXI.Graphics();
                    mark.circle(0, 0, 10.5);
                    mark.fill({ color: 0xff7a2e });
                    mark.stroke({ width: 3, color: 0xffd98c });
                    mark.position.set(36, -54);
                    mark.name = "enchMark";
                    mark.eventMode = "none";
                    best.node.addChild(mark);
                    floatText(cellXY(best.col, best.row).x, cellXY(best.col, best.row).y - 60, "✦", 0xffb26e);
                } else {
                    if (s.buffAtk) {
                        best.bonusAtk = (best.bonusAtk || 0) + s.buffAtk;
                        recalcAuras();
                        const p = cellXY(best.col, best.row);
                        floatText(p.x, p.y - 39, `+${s.buffAtk}⚔`, 0x9fd489);
                    }
                    if (s.berserk) addBerserk(best, s.berserk);
                }
                punch(best.node);
                sfx("up");
            }
            if (s.target === "anyUnitDmg") { // дротик/варево/огнешар
                const dmg = s.drainAll // вся энергия сверх цены — в урон
                    ? Math.max(0, B.eEnergy - (free ? 0 : effCost(cardIdOf(def), "e"))) + altarBonus("e")
                    : spellDmg(def, "e");
                const targets = B.units.filter((v) => v.side === "p"
                    && (v.def.type === "unit"
                        || (v.def.type === "building" && !s.noBuildings)));
                // ИИ добивает: если есть цель под убийство (урон ≥
                // жизней) — бьём её (из них сильнейшую и ближе к базе),
                // иначе просто сильнейшего юза игрока
                const kills = targets.filter((v) => v.hp <= dmg);
                let best = (kills.length ? kills : targets)
                    .slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                if (focus && targets.includes(focus)) best = focus; // руна
                if (!best) return;
                damageUnit(best, dmg, null, "rocket");
            }
            if (s.target === "anyCell") { // стена костров — ряд, где больше игроков
                const counts = [0, 0, 0, 0, 0];
                for (const v of B.units) if (v.side === "p") counts[v.row]++;
                const row = counts.indexOf(Math.max(...counts));
                B.firewalls.push({ col: 2, row, side: "e",
                    left: s.turns, dmg: s.firewall });
                redrawFirewalls();
                sfx("rocket");
            }
            if (s.target === "emptyCell") { // культ — ряд, где больше пустых (ничья — где больше игроков)
                const empt = [0, 0, 0, 0, 0], pu = [0, 0, 0, 0, 0];
                for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
                    if (!unitAt(c, r)) empt[r]++;
                for (const v of B.units) if (v.side === "p") pu[v.row]++;
                let row = 0;
                for (let r = 1; r < GRID; r++)
                    if (empt[r] > empt[row] || (empt[r] === empt[row] && pu[r] > pu[row])) row = r;
                cultRowSpawn("e", row);
            }
            if (s.target === "enemyAny") {
                const targets = B.units.filter((u) => u.side === "p");
                if (targets.length) {
                    const best = focus && targets.includes(focus)
                        ? focus // руна: именно атакующий
                        : targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    damageUnit(best, s.dmg, null, "rocket");
                } else {
                    B.playerBase -= s.dmg;
                    floatText(960, 840, `−${s.dmg}`, 0xff5f4e);
                    sfx("rocket");
                }
            }
            if (s.target === "none" && s.baseDmg) { // землетрясение
                B.playerBase -= s.baseDmg;
                floatText(960, 840, `−${s.baseDmg}`, 0xff5f4e);
                punch(root.hud);
                sfx("rocket");
            }
            if (s.aoeDmg) { // «Раскалённые обломки»: всем существам и постройкам игрока
                const dmg = s.aoeDmg + altarBonus("e");
                for (const v of B.units.slice()) if (v.side !== "e") damageUnit(v, dmg, null, "rocket");
                sfx("rocket");
            }
            if (s.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                for (const v of B.units) if (v.side === "e" && v.def.type === "unit") {
                    v.bonusAtk = (v.bonusAtk || 0) + s.buffAllAtk;
                    punch(v.node);
                    const p = cellXY(v.col, v.row);
                    floatText(p.x, p.y - 39, `+${s.buffAllAtk}⚔`, 0x9fd489);
                }
                recalcAuras();
                sfx("up");
            }
            if (s.sacrifice) { // «Жертвоприношение»: взрыв по соседям жертвы
                const u = aiSacrificePick();
                if (u) {
                    const p = cellXY(u.col, u.row);
                    killUnit(u, null);
                    floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                    for (const v of B.units.slice())
                        if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1)
                            damageUnit(v, s.dmg, null, "rocket");
                }
            }
            if (s.baseHit) { // «Бросок валуна»: своё сильнейшее бьёт базу героя — это его атака
                const own = B.units.filter((v) => v.side === "e" && v.def.type === "unit")
                    .slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row));
                if (own[0]) { baseHit("e", own[0]); triggerAttackTraps(own[0]); }
            }
            if (s.draw) drawEnemy(s.draw);
            if (s.search) { // верхнее заклинание из верхних карт колоды — в руку
                const spells = B.eDeck.map((id, j) => ({ id, j }))
                    .filter((x) => CARDS[x.id] && CARDS[x.id].type === "spell");
                const k = spells[spells.length - 1];
                if (k) { B.eDeck.splice(k.j, 1); B.eHand.push(k.id); }
            }
            if (s.journey) { // «Глубокое путешествие»: призыв из верхних карт — бесплатно
                const k = Math.min(s.journey, B.eDeck.length);
                const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                const units = top.filter((id) => CARDS[id] && CARDS[id].type === "unit");
                const chosen = units.length ? units[(Math.random() * units.length) | 0] : null;
                const rest = top.filter((id) => id !== chosen);
                if (rest.length) {
                    const r = (Math.random() * rest.length) | 0;
                    B.eHand.push(rest[r]); // одна случайная — в руку
                    for (let i = 0; i < rest.length; i++) if (i !== r) B.eDiscard.push(rest[i]);
                }
                if (chosen) {
                    const rows = deployRows("e");
                    const free = freeCells(rows);
                    if (free.length) {
                        // как обычный призыв ИИ: передний ряд, колонка без своих
                        const frontRow = rows[rows.length - 1];
                        const front = free.filter(([, r2]) => r2 === frontRow);
                        let cand = front.length ? front : free;
                        const open = cand.filter(([c2]) =>
                            !B.units.some((o) => o.side === "e" && o.col === c2));
                        if (open.length) cand = open;
                        const [col, row] = cand[(Math.random() * cand.length) | 0];
                        addUnit("e", chosen, col, row);
                    } else B.eHand.push(chosen); // поле забито — карта хотя бы в руку
                }
            }
            if (s.brew) { B.brewCasts = (B.brewCasts || 0) + 1; refreshBrewBadges(); }
        }

        async function aiPlay() {
            // ИИ тратит энергию, пока есть чем. Если играть нечем (в руке всё
            // слишком дорого или неприменимо — поле забито, целей нет), а
            // энергии много — добирает карты и пробует снова: копить десятки
            // энергии вместо давления ИИ не должен.
            let refillTries = 0;
            const tryRefill = async () => {
                if (B.eEnergy < 5 || refillTries >= 2) return false;
                refillTries++;
                const before = B.eHand.length;
                drawEnemy(2); // пустые колода/сброс закроет «подкрепление»
                if (B.eHand.length === before) return false; // карт взять неоткуда
                refreshHud();
                await delay(0.3 / animK());
                return true;
            };
            for (;;) {
                if (B.stopped || B.phase === "over") return;
                const affordable = B.eHand
                    .map((c, i) => ({ i, id: c, def: CARDS[c] }))
                    .filter((x) => effCost(x.id, "e") <= B.eEnergy)
                    .sort((a, b) => effCost(b.id, "e") - effCost(a.id, "e"));
                if (!affordable.length) { if (!await tryRefill()) return; continue; }
                let played = false;
                for (const pick of affordable) {
                    const def = pick.def;
                    if (def.type === "unit" || def.type === "building") {
                        const rows = deployRows("e");
                        const free = freeCells(rows);
                        if (!free.length) continue;
                        let pool;
                        if (def.type === "building") {
                            // строения — в тыл (ряд у своей базы): их маршем
                            // не достать, аура работает из глубины
                            const back = free.filter(([, r]) => r === rows[0]);
                            pool = back.length ? back : free;
                        } else {
                            const frontRow = rows[rows.length - 1];
                            const front = free.filter(([, r]) => r === frontRow);
                            let cand = front.length ? front : free;
                            // юниты — не в колонку за своим (заторы марша):
                            // если есть свободные колонки без своих — в них
                            const open = cand.filter(([c2]) =>
                                !B.units.some((o) => o.side === "e" && o.col === c2));
                            if (open.length) cand = open;
                            pool = cand;
                        }
                        showEnemyCard(pick.id); // карта врага слева ≥ 1с
                        await delay(enemyPlayDelay());
                        const [col, row] = pool[(Math.random() * pool.length) | 0];
                        const cardId = B.eHand[pick.i];
                        B.eHand.splice(pick.i, 1);
                        B.eEnergy -= effCost(cardId, "e");
                        addUnit("e", cardId, col, row);
                        B.eDiscard.push(cardId); // как у игрока: карта в сброс (иначе цикл «Трусливого гоблина» не работает)
                        hideEnemyCard();
                        played = true;
                        break;
                    }
                    if (def.type === "trap") {
                        if (B.traps.e.length >= TRAP_SLOTS) continue;
                        // руна («Наскальная рунопись») — на существо игрока:
                        // сильнейшее (при его атаке ИИ бесплатно разыграет
                        // случайное заклинание своей колоды)
                        if (def.trap.effect === "castRandom") {
                            const pu = B.units.filter((v) => v.side === "p" && v.def.type === "unit")
                                .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                            if (!pu) continue;
                            showEnemyBack(); // какую руну повесил — загадка (просил юзер)
                            await delay(enemyPlayDelay());
                            const cardId = B.eHand[pick.i];
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            armTrap("e", cardId, 0, 0, pu);
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        // ловушки — прежде всего на путь марша игрока: пустая
                        // клетка прямо ПЕРЕД его существом (шагнёт в начале
                        // своего хода и наступит — просил юзер); таких нет —
                        // старое правило: зона призыва (ряд 4, затем 3, 2);
                        // приманка без «передних» манит с соседних клеток
                        const freeAt = (cc, r2) => !unitAt(cc, r2)
                            && !B.traps.e.some((t) => t.col === cc && t.row === r2);
                        const front = [], spots = [];
                        const seenF = new Set();
                        for (const v of B.units) {
                            if (v.side !== "p" || v.row - 1 < 0) continue;
                            const key = `${v.col}:${v.row - 1}`;
                            if (seenF.has(key) || !freeAt(v.col, v.row - 1)) continue;
                            seenF.add(key);
                            front.push([v.col, v.row - 1]);
                        }
                        for (const r of [4, 3, 2]) for (let cc = 0; cc < GRID; cc++) {
                            if (freeAt(cc, r)) spots.push([cc, r]);
                        }
                        if (!front.length && !spots.length) continue;
                        let pool;
                        if (front.length) pool = front;
                        else if (def.trap.effect === "lure") {
                            const near = spots.filter(([c2, r2]) => B.units.some((v) =>
                                v.side === "p" && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                            pool = near.length ? near : spots;
                        } else pool = spots;
                        showEnemyBack(); // какая ловушка — загадка (просил юзер)
                        await delay(enemyPlayDelay());
                        const [col, row] = pool[(Math.random() * pool.length) | 0];
                        const cardId = B.eHand[pick.i];
                        B.eHand.splice(pick.i, 1);
                        B.eEnergy -= effCost(cardId, "e");
                        armTrap("e", cardId, col, row);
                        hideEnemyCard();
                        played = true;
                        break;
                    }
                    if (def.type === "spell") {
                        if (!aiSpellPlayable(def)) continue;
                        // карта врага — лицом слева, пауза ≥ 1с: игрок видит,
                        // что сейчас произойдёт (просил юзер)
                        showEnemyCard(pick.id);
                        await delay(enemyPlayDelay());
                        const cardId = B.eHand[pick.i];
                        if (def.spell.copyLast) {
                            // «Горящие руны»: повтор ПОСЛЕДНЕГО заклинания тем
                            // же кодом эффектов (бесплатно для его цены)
                            if (enemyReplayLast()) B.lastSpell.e = "str25"; // повтор самой себя — цепочка
                        } else {
                            enemyCastSpellEffect(def);
                        }
                        // indexOf: панельные эффекты кладут карты в руку —
                        // индексы могли сместиться
                        B.eHand.splice(B.eHand.indexOf(cardId), 1);
                        B.eEnergy = def.spell.drainAll ? 0 : B.eEnergy - effCost(cardId, "e");
                        // рука ИИ тоже не больше 7 — излишек панельных доборов
                        // сбрасывается случайно (как панель сброса у игрока)
                        while (B.eHand.length > HAND_MAX)
                            B.eDiscard.push(B.eHand.splice((Math.random() * B.eHand.length) | 0, 1)[0]);
                        B.eDiscard.push(cardId);
                        B.lastSpell.e = cardId;
                        afterSpellPlayed(); // «Заклинатель клинков» на поле
                        hideEnemyCard();
                        refreshHud();
                        if (checkEnd()) return;
                        played = true;
                        break;
                    }
                }
                if (!played) { if (!await tryRefill()) return; continue; }
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
            firewallTick("e"); // стена костров врага — конец хода врага
            if (B.stopped || B.phase === "over") return;
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
            if (B.phase !== "player" || B.discarding || B.picking) return;
            if (B.journeySummon) return; // сначала поставьте (или отмените) призыв
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
            if (B.phase !== "player" || B.discarding || B.picking) return;
            if (B.journeySummon) { // «Глубокое путешествие»: бесплатный призыв
                if (!deployRows("p").includes(row) || unitAt(col, row)) return;
                const cardId = B.journeySummon;
                B.journeySummon = null;
                addUnit("p", cardId, col, row); // энергия не тратится
                layoutHand();
                redrawHighlight();
                refreshHud();
                return;
            }
            if (B.selected === null) return;
            const def = CARDS[B.hand[B.selected]];
            if (!def) return;
            if (B.spellTarget) { // прицел: по врагу, любому существу или строению
                const sdef = CARDS[B.hand[B.selected]];
                const u = unitAt(col, row);
                const tg = sdef.spell.target;
                if (tg === "anyCell") { // стена костров — подходит любая клетка
                    castSpell(B.selected, { col, row });
                    return;
                }
                if (tg === "emptyCell") { // культ кочерыжки — только пустая клетка
                    if (!unitAt(col, row)) castSpell(B.selected, { col, row });
                    else deselect();
                    return;
                }
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
            if (def.type === "trap") {
                // руна («Наскальная рунопись») — наоборот, на существо
                if (def.trap.effect === "castRandom") {
                    const u = unitAt(col, row);
                    if (!u || u.def.type !== "unit") { deselect(); return; }
                    const cardId = spendCard(B.selected);
                    armTrap("p", cardId, 0, 0, u);
                    deselect();
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                if (unitAt(col, row)) { deselect(); return; } // мина — пустая клетка
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

        // «Культ кочерыжки» (str40): на всех пустых клетках горизонтального
        // ряда (одинаковый row, колонки 0..4) появляются Гоблины 3/4 стороны
        // кастовавшего (служебная карта gobC, на поле — как обычный призыв:
        // ловушки клеток, ауры, бейджи). Возвращает число призванных.
        function cultRowSpawn(side, row) {
            let n = 0;
            for (let col = 0; col < GRID; col++) {
                if (unitAt(col, row)) continue;
                addUnit(side, "gobC", col, row);
                n++;
            }
            return n;
        }

        // Эффекты заклинаний игрока, валидация цели внутри (false — цель не
        // годится, тогда и оплаты/сброса/панелей не будет). Отделено от
        // оплаты карты, чтобы «Горящие руны» могли повторить эффект
        // бесплатно. free — повтор (дренаж энергии идёт без вычета цены).
        function applySpellP(cardId, target, free = false) {
            const def = CARDS[cardId];
            if (def.spell.target === "anyUnit") { // усиление: любое существо
                if (!target || target.col === undefined) return false;
                const u = unitAt(target.col, target.row);
                if (!u || u.def.type !== "unit") return false;
                const p = cellXY(u.col, u.row);
                if (def.spell.enchantFire) { // «Огненное дыхание» — метка-очарование
                    u.enchantFire = true;
                    const mark = new PIXI.Graphics();
                    mark.circle(0, 0, 10.5);
                    mark.fill({ color: 0xff7a2e });
                    mark.stroke({ width: 3, color: 0xffd98c });
                    mark.position.set(36, -54);
                    mark.name = "enchMark";
                    mark.eventMode = "none";
                    u.node.addChild(mark);
                    floatText(p.x, p.y - 60, "✦", 0xffb26e);
                } else {
                    if (def.spell.buffAtk) {
                        u.bonusAtk = (u.bonusAtk || 0) + def.spell.buffAtk;
                        recalcAuras();
                        floatText(p.x, p.y - 39, `+${def.spell.buffAtk}⚔`, 0x9fd489);
                    }
                    if (def.spell.berserk) addBerserk(u, def.spell.berserk);
                }
                punch(u.node);
                sfx("up");
            }
            if (def.spell.target === "anyUnitDmg") { // дротик: существо или строение; варево — только существо
                if (!target || target.col === undefined) return false;
                const u = unitAt(target.col, target.row);
                if (!u || (u.def.type !== "unit"
                    && (u.def.type !== "building" || def.spell.noBuildings))) return false;
                if (def.spell.drainAll) { // «Огнешар»: вся энергия сверх цены — в урон
                    damageUnit(u, Math.max(0, B.energy - (free ? 0 : effCost(cardId)))
                        + altarBonus("p"), null, "rocket");
                } else {
                    damageUnit(u, spellDmg(def), null, "rocket");
                }
            }
            if (def.spell.target === "emptyCell") { // культ кочерыжки: ряд в гоблинах
                if (!target || target.col === undefined) return false;
                if (unitAt(target.col, target.row)) return false;
                cultRowSpawn("p", target.row);
            }
            if (def.spell.target === "anyCell") { // стена костров: ряд горит N ходов владельца
                if (!target || target.col === undefined) return false;
                B.firewalls.push({ col: target.col, row: target.row, side: "p",
                    left: def.spell.turns, dmg: def.spell.firewall });
                redrawFirewalls();
                sfx("rocket");
            }
            if (def.spell.target === "ownUnit" && def.spell.baseHit) { // «Бросок валуна»: своё существо бьёт базу врага — это его атака
                if (!target || target.col === undefined) return false;
                const u = unitAt(target.col, target.row);
                if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                baseHit("p", u);
                triggerAttackTraps(u);
            }
            if (def.spell.target === "ownUnit" && def.spell.sacrifice) { // жертва: убить своё, ударить соседей
                if (!target || target.col === undefined) return false;
                const u = unitAt(target.col, target.row);
                if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                const p = cellXY(u.col, u.row);
                killUnit(u, null);
                floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                for (const v of B.units.slice()) {
                    if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                        damageUnit(v, def.spell.dmg, null, "rocket");
                    }
                }
            }
            if (def.spell.target === "none" && def.spell.baseDmg) { // землетрясение
                B.enemyBase -= def.spell.baseDmg;
                floatText(960, 60, `−${def.spell.baseDmg}`, 0xff8f6e);
                punch(root.hud);
                sfx("rocket");
            }
            if (def.spell.aoeDmg) { // «Раскалённые обломки»: всем вражеским существам и постройкам
                const dmg = def.spell.aoeDmg + altarBonus("p");
                for (const v of B.units.slice()) if (v.side !== "p") damageUnit(v, dmg, null, "rocket");
                sfx("rocket");
            }
            if (def.spell.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                for (const v of B.units) if (v.side === "p" && v.def.type === "unit") {
                    v.bonusAtk = (v.bonusAtk || 0) + def.spell.buffAllAtk;
                    punch(v.node);
                    const p = cellXY(v.col, v.row);
                    floatText(p.x, p.y - 39, `+${def.spell.buffAllAtk}⚔`, 0x9fd489);
                }
                recalcAuras();
                sfx("up");
            }
            if (def.spell.target === "enemyAny") {
                if (!target) return false;
                if (target.base === true) {
                    B.enemyBase -= def.spell.dmg;
                    floatText(960, 60, `−${def.spell.dmg}`, 0xff8f6e);
                    punch(root.hud);
                    sfx("rocket");
                } else if (target.col !== undefined) {
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side === "p") return false;
                    damageUnit(u, def.spell.dmg, null, "rocket");
                } else return false;
            }
            if (def.spell.draw) drawCards(def.spell.draw);
            if (def.spell.brew) { B.brewCasts = (B.brewCasts || 0) + 1; refreshBrewBadges(); }
            if (def.spell.search) openRunesPanel(def.spell.search); // выбор поверх боя
            if (def.spell.journey) openJourneyPanel(def.spell.journey);
            return true;
        }

        // Автоцель для повтора заклинания («Горящие руны») — приоритеты ИИ:
        // добивание, сильнейший, ряд с наибольшим числом врагов.
        function autoTargetFor(cardId) {
            const def = CARDS[cardId];
            const tg = def.spell.target;
            if (tg === "anyUnit" || tg === "ownUnit") {
                const own = B.units.filter((u) => u.side === "p" && u.def.type === "unit");
                const best = own.slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row))[0];
                return best ? { col: best.col, row: best.row } : null;
            }
            if (tg === "anyUnitDmg") {
                const dmg = def.spell.drainAll
                    ? Math.max(0, B.energy) + altarBonus("p") // повтор — цена не вычитается
                    : spellDmg(def);
                const targets = B.units.filter((u) => u.side !== "p"
                    && (u.def.type === "unit"
                        || (u.def.type === "building" && !def.spell.noBuildings)));
                if (!targets.length) return null;
                const kills = targets.filter((v) => v.hp <= dmg);
                const best = (kills.length ? kills : targets)
                    .slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                return { col: best.col, row: best.row };
            }
            if (tg === "enemyAny") {
                const targets = B.units.filter((u) => u.side !== "p");
                if (!targets.length) return { base: true };
                const best = targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                return { col: best.col, row: best.row };
            }
            if (tg === "anyCell") { // стена костров — ряд, где больше врагов
                const counts = [0, 0, 0, 0, 0];
                for (const v of B.units) if (v.side !== "p") counts[v.row]++;
                return { col: 2, row: counts.indexOf(Math.max(...counts)) };
            }
            if (tg === "emptyCell") { // культ — ряд, где больше пустых (ничья — где больше врагов)
                const empt = [0, 0, 0, 0, 0], foes = [0, 0, 0, 0, 0];
                for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
                    if (!unitAt(c, r)) empt[r]++;
                for (const v of B.units) if (v.side !== "p") foes[v.row]++;
                let best = 0;
                for (let r = 1; r < GRID; r++)
                    if (empt[r] > empt[best] || (empt[r] === empt[best] && foes[r] > foes[best])) best = r;
                return { col: 2, row: best };
            }
            return null; // без цели или целей нет — эффект повторится «вхолостую»
        }

        // «Горящие руны» (str25): эффект последнего разыгранного заклинания
        // повторно, бесплатно; затем то заклинание СЖИГАЕТСЯ — одна копия
        // уходит из своей текущей зоны (рука → колода → сброс) до конца боя
        // (в колоду при перетасовке она больше не вернётся).
        function replaySpell(cardId) {
            const def = CARDS[cardId];
            if (!def || def.type !== "spell") return;
            applySpellP(cardId, autoTargetFor(cardId), true);
            if (def.spell.drainAll) B.energy = 0; // огнешар и в повторе сжигает энергию
            const hi = B.hand.indexOf(cardId);
            if (hi >= 0) B.hand.splice(hi, 1);
            else {
                const di = B.deck.indexOf(cardId);
                if (di >= 0) B.deck.splice(di, 1);
                else {
                    const si = B.discard.indexOf(cardId);
                    if (si >= 0) B.discard.splice(si, 1);
                }
            }
            floatText(960, 640, `🔥 ${GAME_LOC.t(`card.${cardId}.name`)}`, 0xffb26e);
        }

        function castSpell(handIdx, target) {
            if (B.phase !== "player" || B.discarding || B.picking) return false;
            const cardId = B.hand[handIdx];
            const def = CARDS[cardId];
            if (!def || def.type !== "spell" || effCost(cardId) > B.energy) return false;
            if (def.spell.copyLast) { // «Горящие руны»: повтор последнего бесплатно
                const last = B.lastSpell.p;
                if (!last || last === "str25" || !CARDS[last]
                    || CARDS[last].type !== "spell") return false;
                B.energy -= effCost(cardId);
                spendCard(handIdx);
                B.lastSpell.p = "str25"; // повтор самой себя — бесконечная цепочка
                replaySpell(last);
                afterSpellPlayed();
                layoutHand();
                redrawHighlight();
                refreshHud();
                checkEnd();
                return true;
            }
            if (!applySpellP(cardId, target)) return false;
            B.energy = def.spell.drainAll ? 0 : B.energy - effCost(cardId);
            spendCard(handIdx);
            B.lastSpell.p = cardId;
            afterSpellPlayed(); // «Заклинатель клинков» и его соседи
            layoutHand();
            redrawHighlight();
            refreshHud();
            checkEnd();
            return true;
        }

        // ── Итог боя → награда (победа) / меню (поражение) ─────────────────
        // Драфт («Карта сокровищ») живёт по своим правилам: победа — выбор
        // ОДНОЙ карты из драфт-колоды в меню трофея, поражение — ничего;
        // оба исхода ведут назад в подземелье, карта сокровищ расходуется.
        function finish(victory) {
            B.phase = "over";
            B.spellTarget = false;
            const draft = !!(G.draftBattle && G.draft);
            sfx(victory ? "lvlUp" : "die");
            refreshHud();
            const ov = new PIXI.Container();
            const dim = new PIXI.Graphics();
            dim.rect(0, 0, 1920, 1080);
            dim.fill({ color: 0x000000, alpha: 0.6 });
            ov.addChild(dim);
            const panel = new PIXI.Sprite(uiTex("panel_allert.png"));
            panel.anchor.set(0.5);
            panel.scale.set(2.025);
            panel.position.set(960, 450);
            ov.addChild(panel);
            const txt = T(victory ? t("arena.victory") : t("arena.defeat"), 66,
                victory ? 0xffe9b0 : 0xff8f6e, { stroke: { color: 0x1c1207, width: 10.5 } });
            txt.anchor.set(0.5);
            txt.position.set(960, 402);
            txt.eventMode = "none";
            ov.addChild(txt);
            if (draft && victory) {
                const sub = T(t("draft.victorySub"), 30, 0xffe2a8,
                    { stroke: { color: 0x1c1207, width: 7 } });
                sub.anchor.set(0.5, 0);
                sub.position.set(960, 462);
                sub.eventMode = "none";
                ov.addChild(sub);
            }
            B.result = victory ? "win" : "lose";
            if (victory && !draft) {
                // трофеи «1 из 3» берутся из колоды побеждённого (просил юзер)
                G.rewardDeck = [...new Set(B.eDeckBase || [])].filter((id) => CARDS[id]);
            }
            if (draft && victory) {
                // награда драфта — одна ЛЮБАЯ карта драфт-колоды на выбор
                // (просил юзер): меню трофея покажет весь её состав
                G.rewardDeck = [...new Set(G.draft.picks)].filter((id) => CARDS[id]);
                G.rewardDraft = true;
            }
            B.continueAction = () => {
                if (draft) {
                    // карта сокровищ использована — объект уходит с этажа
                    if (G.dungeon && G.dungeon.objects[G.draft.objIdx])
                        G.dungeon.objects[G.draft.objIdx].taken = true;
                    G.draftBattle = false;
                    G.draft = null;
                    if (G.saveRun) G.saveRun();
                    if (victory) scenes.go("reward"); // выбор одной карты
                    else scenes.go("dungeon");
                    return;
                }
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
                // победа сама ведёт в меню трофея (в драфте — за картой награды)
                scheduler.after(1.4 / animK(), () => {
                    if (B && !B.stopped && B.phase === "over" && B.result === "win") B.continueAction();
                });
            } else {
                const btn = new PIXI.Sprite(uiTex("button_menu.png"));
                btn.anchor.set(0.5);
                btn.scale.set(1); // натуральный размер спрайта (просил юзер)
                btn.position.set(960, 585);
                btn.eventMode = "static";
                ov.addChild(btn);
                const bt = T(t(draft ? "arena.toDungeon" : "arena.toMenu"), 45, 0xf3e6c2);
                bt.anchor.set(0.5);
                globalThis.GAME_UI.fit(bt, btn.texture.width * btn.scale.x * 0.8, 11); // не шире кнопки
                bt.position.set(960, 585);
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
            curScene = 1; // в этом подземелье один фон поля боя (просил юзер)
            if (ctx.music) ctx.music("battle");
            // колода врага хранится в враге подземелья (кидается при
            // генерации этажа по глубине); для старых сейвов — генерим.
            // eDeckBase — эталон для «подкреплений»: в затяжном бою колода
            // не должна вымирать (иначе ИИ копит энергию без карт в руке)
            const eBase = G.activeEnemy && G.activeEnemy.deck
                ? [...G.activeEnemy.deck]
                : enemyDeck(encId, G.run ? G.run.floor : 1);
            // драфт («Карта сокровищ»): колода игрока — 12 отобранных карт,
            // НЕ G.deck (настоящая колода в мини-игре не участвует)
            const pDeck = G.draftBattle && G.draft ? G.draft.picks : G.deck;
            B = {
                encId, phase: "player", stopped: false, turnNo: 1,
                energy: 1, eEnergy: 1,
                split: 1, // положение ползунка «карты↔энергия» (1 карта / 2 энергии)
                playerBase: 15, playerBaseMax: 15,
                enemyBase: enc.baseHp, enemyBaseMax: enc.baseHp,
                deck: shuffle([...pDeck]), discard: [], hand: [],
                eDeck: shuffle([...eBase]),
                eDeckBase: eBase,
                eDiscard: [], eHand: [],
                units: [], traps: { p: [], e: [] }, firewalls: [],
                selected: null, spellTarget: false, result: null,
                discarding: false, picking: false, brewCasts: 0,
                // последнее разыгранное заклинание каждой стороны («Горящие
                // руны»); journeySummon — карта призыва из «Глубокого
                // путешествия», ждёт бесплатной постановки на клетку
                lastSpell: { p: null, e: null }, journeySummon: null,
            };
            G.battle = B;
            drawCards(4);
            moves.length = 0; floats.length = 0; punches.length = 0; // хвосты прошлого боя
            overlay = null;
            drag = null;
            dragFx = null; // прошлого боя Graphics уничтожен вместе с root
            discardPanel = null;
            runesPanel = null; runesTop = [];
            journeyPanel = null; journeyTop = [];
            unitCard = null;
            sfx("openRoom"); // начало боя

            root = new PIXI.Container();
            root.eventMode = "static";
            // фон арены — нарисованная сцена с сеткой поля; в этом подземелье
            // фон всегда один — scenes/1.png (просил юзер)
            const bg = new PIXI.Sprite(uiTex("scenes/1.png"));
            const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
            bg.scale.set(s);
            bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
            root.addChild(bg);
            root.board = buildBoard();
            root.addChild(root.board);
            root.fireLayer = new PIXI.Container(); // «Стена костров» — огонь под жетонами
            root.addChild(root.fireLayer);
            root.unitsLayer = new PIXI.Container();
            // общий z-order существ и строений: кто ниже по полю (больше row),
            // тот ближе к зрителю — рисуется поверх (просил юзер: строения
            // висели поверх существ выше их)
            root.unitsLayer.sortableChildren = true;
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
                if (e.target === root && B.phase === "player" && B.journeySummon) {
                    cancelJourneySummon(); // клик мимо поля — призыв в руку
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
            closeRunesPanel();
            closeJourneyPanel(); // узел умрёт вместе с root — снимаем ссылки
            hideEnemyCard(); // узел умер бы вместе с root — снимаем ссылку
            unitCard = null; // узел подсказки умер вместе с root
            if (root) { root.destroy({ children: true }); root = null; }
            overlay = null;
            ovZoom = null; // узел умер вместе с root — снимаем ссылку
            ovCards = [];
            dragFx = null; // Graphics умер вместе с root — не держим мёртвую ссылку
            G.battle = null;
        }

        function update(ticker) {
            if (!root || !B) return;
            const dt = ticker.deltaMS / 1000;
            // ховер-зум карты оверлея: 0.75 ↔ 1 (плавно, как в «Колоде»)
            if (ovZoom) {
                const z = ovZoom;
                z.cur += (z.tgt - z.cur) * Math.min(1, dt * 14);
                if (Math.abs(z.tgt - z.cur) < 0.01) {
                    z.cur = z.tgt;
                    if (z.tgt === 0.75) {
                        if (z.base && !z.base.destroyed) z.base.alpha = z.baseAlpha;
                        z.node.destroy({ children: true });
                        ovZoom = null;
                    }
                }
                if (ovZoom) z.node.scale.set(z.cur);
            }
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
                    // destroy в этой сборке Pixi не отцепляет узел от родителя —
                    // трупы оставались в unitsLayer и копились за бой
                    if (p.dying) {
                        if (p.node.parent) p.node.parent.removeChild(p.node);
                        p.node.destroy({ children: true });
                    } else p.node.scale.set(1);
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
            if (B.picking && ctx.input.wasPressed("Escape")) {
                if (journeyPanel) finishJourney(null); // «Глубокое путешествие» — без призыва
                else closeRunesPanel(); // «Поиск рун» — отмена выбора
                return;
            }
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
                if (!B || B.phase !== "player" || B.discarding || B.picking) return;
                cancelJourneySummon(); // незавершённый призыв — карта в руку
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
            // клик по клетке как есть (бесплатный призыв «Глубокого путешествия»)
            cellTap(col, row) { onCellTap(col, row); },
            select(handIdx) { onCardTap(handIdx); },
            castSpell,
            playTrap(handIdx, col, row) { // мина — выбрать карту и пустую клетку
                B.selected = handIdx;
                B.spellTarget = false;
                onCellTap(col, row);
            },
            deployRows,
            // оверлеи боя (настройки / колода-остаток / сброс)
            openPanel(name) { if (B && root && B.phase !== "over") openOverlay(name); },
            closePanel() { closeOverlay(); },
            panel: () => (overlay && overlay.name) || null,
            // карта-подсказка на жетон (тесты): что показано + наведение по клетке
            unitCardState: () => (unitCard
                ? { id: cardIdOf(unitCard.unit.def), side: unitCard.unit.side,
                    col: unitCard.unit.col, row: unitCard.unit.row }
                : null),
            // карта, разыгранная врагом (тесты): что показано слева + свечение
            enemyCardState: () => (enemyCard
                ? (() => {
                    const f = enemyCard.node.getChildByName("glowFrame");
                    return { id: enemyCard.id, x: enemyCard.node.x, y: enemyCard.node.y,
                        glow: f ? { w: Math.round(f.width), h: Math.round(f.height) } : null };
                })()
                : null),
            // ловушки (тесты): у руны видно существо, на котором она висит
            trapList: () => ({
                p: B.traps.p.map((tr) => ({ eff: tr.def.trap.effect,
                    unit: tr.unit ? cardIdOf(tr.unit.def) : null,
                    on: tr.unit ? B.units.includes(tr.unit) : null })),
                e: B.traps.e.map((tr) => ({ eff: tr.def.trap.effect,
                    unit: tr.unit ? cardIdOf(tr.unit.def) : null,
                    on: tr.unit ? B.units.includes(tr.unit) : null })),
            }),
            hoverCell(col, row) { const p = cellXY(col, row); unitHoverAt(p.x, p.y); },
            hoverOff: () => unitCardHide(),
            // drag&drop (режим «Перетаскивание»): состояние для тестов
            dragState() {
                return drag ? { idx: drag.idx, moved: drag.moved, over: drag.over } : null;
            },
            // геометрия первой карты руки (дизайн-координаты) — тесты «не закрывает поле»
            handGeom() {
                if (!root || !B || !root.cardsLayer.children.length) return null;
                const b = root.cardsLayer.children[0].getBounds();
                const wt = ctx.ui.worldTransform; // полная цепочка letterbox × бокс
                return {
                    x: (b.x - wt.tx) / wt.a, top: (b.y - wt.ty) / wt.d,
                    w: b.width / wt.a, h: b.height / wt.d,
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
                    picking: !!B.picking,
                    lastSpell: B.lastSpell.p,
                    journeySummon: B.journeySummon,
                    eDeck: B.eDeck.length,
                    units: B.units.map((u) => ({ side: u.side, id: cardIdOf(u.def), col: u.col, row: u.row, hp: u.hp, atk: u.curAtk, type: u.def.type, spr: !!u.node.getChildByName("body"), ench: !!u.enchantFire, berserk: u.berserk || 0, confused: u.confused || 0 })),
                    traps: { p: B.traps.p.length, e: B.traps.e.length },
                    firewalls: B.firewalls.map((f) => ({ side: f.side, row: f.row, left: f.left })),
                };
            },
            // «Стена костров» (тесты): касты + сколько спрайтов огня на поле
            firewalls: () => ({ list: B.firewalls.map((f) => ({ ...f })),
                sprites: root.fireLayer.children.length }),
            // тест-хук: тик стены костров (как в конце хода стороны)
            _fwTick(side) { firewallTick(side); return B.firewalls.map((f) => ({ ...f })); },
            // «Поиск рун» (тесты): состав панели и выбор карты
            runesState: () => ({ picking: !!B.picking, top: [...runesTop] }),
            runesPick(idx) { pickRune(idx); },
            // «Глубокое путешествие» (тесты): панель, выбор призыва, режим
            // бесплатной постановки
            journeyState: () => ({ picking: !!journeyPanel, top: [...journeyTop] }),
            journeyPick(idx) { pickJourney(idx); },
            journeySummon: () => (B ? B.journeySummon : null),
            // тест-хуки поправок: свечение выбранной карты (п2) и сетка
            // оверлея-просмотра (п3)
            selGlow() {
                if (!root || !B || B.selected === null) return null;
                const n = root.cardsLayer.children[B.selected];
                if (!n) return null;
                const f = n.getChildByName("selframe");
                if (!f) return null; // фолбэк-карта без свечения
                return { visible: !!f.visible, blurred: !!(f.filters && f.filters.length),
                    behind: n.getChildIndex(f) === 0 };
            },
            overlayCards() {
                if (!overlay || !overlay.grid) return null;
                return overlay.grid.children
                    .filter((ch) => ch.scale && ch.scale.x === 0.75) // cardFace (не тексты ×N)
                    .map((ch) => ({ x: Math.round(ch.x), y: Math.round(ch.y) }));
            },
            // ховер-зум карт оверлея (тесты): анимация 0.75 ↔ 1
            ovZoomState: () => (ovZoom
                ? { id: ovZoom.id, scale: Math.round(ovZoom.cur * 1000) / 1000, target: ovZoom.tgt }
                : null),
            // узел карточки сетки оверлея (тесты: эмит pointerover/out)
            overlayCardNode: (i) => ovCards[i] || null,
            // геометрия полоски базы врага (тесты: не вылезает за плашку;
            // локальные границы = дизайн-координаты, без letterbox-масштаба)
            eBarGeom: () => {
                if (!root || !root.hud) return null;
                const b = root.hud.userData.eBar.getLocalBounds();
                return { x: Math.round(b.x), w: Math.round(b.width) };
            },
            // бейдж «×N» на картах варева в руке + текст жизней базы героя
            // (тесты: счётчик разыгрываний, число у полоски базы)
            brewBadge: () => {
                if (!root || !B) return null;
                for (const node of root.cardsLayer.children) {
                    const b = node.getChildByName("brewBadge");
                    if (b) return { n: B.brewCasts || 0, visible: !!b.visible };
                }
                return null;
            },
            hudTexts: () => (root && root.hud
                ? { pBase: root.hud.userData.pBaseT.text,
                    eBase: root.hud.userData.eBaseT.text,
                    pEnergy: root.hud.userData.pEnergyT.text,
                    pEnergyGain: root.hud.userData.pEnergyGainT.text,
                    pCards: root.hud.userData.pCardsT.text,
                    eEnergy: root.hud.userData.eEnergyT.text,
                    eCards: root.hud.userData.eCardsT.text }
                : null),
            // общий z-order поля (тесты): сортировка включена, zIndex — ряды
            zOrder: () => (root && root.unitsLayer
                ? { sortable: !!root.unitsLayer.sortableChildren,
                    z: root.unitsLayer.children.map((n) => n.zIndex),
                    dbg: root.unitsLayer.children.map((n) =>
                        ({ z: n.zIndex, dead: !!n.destroyed, x: Math.round(n.x), y: Math.round(n.y),
                           unit: B.units.findIndex((u) => u.node === n),
                           a: Math.round(n.alpha * 100) / 100, rot: Math.round(n.rotation * 100) / 100,
                           sc: Math.round(n.scale.x * 100) / 100 })) }
                : null),
            punchesDump: () => ({ n: punches.length,
                list: punches.map((p) => ({ dying: !!p.dying,
                    life: Math.round(p.life * 1000) / 1000, total: p.total,
                    dead: !!p.node.destroyed, inLayer: !!(p.node.parent && p.node.parent === root.unitsLayer) })) }),
            // лицо походки юнита на клетке (тесты: боковой шаг — walk_left/right)
            walkFace: (col, row) => {
                const u = unitAt(col, row);
                if (!u || !u.node) return null;
                const body = u.node.getChildByName("body");
                return body ? (body.userData_face || null) : null;
            },
            // тест-хук: урон цели с указанным «убийцей» — через damageUnit,
            // с хуками боя (очарование «Огненного дыхания» и пр.)
            _dmg(col, row, amount, killerCol, killerRow) {
                const u = unitAt(col, row);
                if (!u) return false;
                const killer = (killerCol !== undefined && killerCol !== null) ? unitAt(killerCol, killerRow) : null;
                damageUnit(u, amount, killer, "sword");
                return true;
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
            // тест-хук: взвести ловушку стороны (как розыгрыш карты ловушки)
            _trap(side, cardId, col, row) { return armTrap(side, cardId, col, row); },
            // тест-хук: upkeep стороны (начало её хода: грибницы, костры)
            _upkeep(side) { upkeep(side); return true; },
            // план добора ИИ по шкале (тесты мягкого правила): сколько карт
            // возьмёт и какой доход всего
            aiDrawPlan: () => (B
                ? { cards: enemyDrawPlan(), total: spheresTotal(),
                    nextMana: B.eEnergy + spheresTotal() }
                : null),
        };
        function cardIdOf(def) {
            return Object.keys(CARDS).find((k) => CARDS[k] === def);
        }

        return { enter, exit, update, api };
    }

    globalThis.GAME_ARENA = { createArenaScene };
})();
