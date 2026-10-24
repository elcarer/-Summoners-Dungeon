// СЦЕНА «АРЕНА»: поле, жетоны и анимации существ.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installBoard = function installBoard(A) {
        with (A) {
            // ── Зона призыва: [свой последний ряд .. ряд перед самым выдвинутым
            //    своим существом/строением]. Базы — ЗА пределами сетки (ниже ряда 4
            //    игрока, выше ряда 0 врага), поэтому «ряд перед базой» = крайний
            //    ряд сетки. По умолчанию — ОДИН ряд ([4] у игрока, [0] у врага);
            //    призыв и продвижение расширяют зону к центру. КРАЙНИЙ ряд у
            //    ЧУЖОЙ базы (0 для игрока, 4 для врага) для призыва закрыт
            //    всегда — до него существа только «доходят» маршем. ──────────
            A.deployRows = function deployRows(side) {
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
            };

            A.unitAt = function unitAt(col, row) {
                return B.units.find((u) => u.col === col && u.row === row) || null;
            };
            A.freeCells = function freeCells(rows) {
                const out = [];
                for (const r of rows) for (let col = 0; col < GRID; col++) {
                    if (!unitAt(col, r)) out.push([col, r]);
                }
                return out;
            };

            // ── Поле: нарисованная сетка бэкграунда + полупрозрачная подсветка ─
            // Клик-зона ОДНА на всё поле (не 25 зон-клеток): у зоны-клетки с полем
            // 2px по краям и на линиях сетки были мёртвые полосы, а микросдвиг
            // мыши между press и release через границу ронял pointertap совсем —
            // «клик на некоторые места клетки не призывает» (баг юзера). Теперь
            // клетку считает cellAt по точке отпускания кнопки, границы никогда
            // не мертвы (x ∈ [cols[c], cols[c+1]) — детерминированно в одну из
            // соседних клеток).
            A.buildBoard = function buildBoard() {
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
                zone.on("pointerout", () => hoverHideAll());
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
            };

            A.redrawHighlight = function redrawHighlight() {
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
                            if (!spellAimable(u)) continue; // ward-цель не подсвечиваем
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
                        for (const u of B.units) if (u.side === "p" && u.def.type === "unit"
                            && spellAimable(u)) {
                            const rc = cellRect(u.col, u.row);
                            hi.rect(rc.x, rc.y, rc.w, rc.h);
                            hi.fill({ color: 0x7dc95e, alpha: 0.4 });
                            hi.stroke({ width: 2, color: 0xa8e890 });
                        }
                        return;
                    }
                    for (const u of B.units) if (u.side === "e" && spellAimable(u)) {
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
            };

            // ── Жетоны на поле: существо / строение ────────────────────────────
            // Жетон ПОЛНОСТЬЮ прозрачен для кликов (finishNode ставит
            // eventMode="none" на весь контейнер): клики всегда уходят в зону
            // поля под ним — иначе спрайт/подписи на клетке съедали pointertap
            // и клетка «не выбиралась» (баг юзера).
            A.makeUnitNode = function makeUnitNode(u) {
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
                    // росток копит жизни и возвращается в руку (♥), прочие — ✦
                    const aura = T(u.def.campAura ? `+${u.def.campAura}⚔`
                        : ((u.def.campfire || u.def.sprout) ? "♥"
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
                    body.scale.set(SPRITE_SCALE * (sheet.scale || 1));
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
            };
            A.finishNode = function finishNode(c, u) {
                const p = cellXY(u.col, u.row);
                c.position.set(p.x, p.y);
                c.zIndex = u.row; // общий z-order поля (см. unitsLayer)
                c.eventMode = "none"; // клики — всегда в клетки поля под жетоном
                return c;
            };

            // ── Ауры строений + перманентные бонусы ──────────────────────────
            // curAtk = база + bonusAtk (кровожадность, лагерь при призыве) + ауры.
            // Ауры строений пересчитываются при каждом addUnit/гибели строения;
            // bonusAtk переживает всё — это «навсегда».
            // «Облачный шпиль» (wis106): глобальная аура своей стороны —
            // «Полёт» (flyOver) и «Защита 1». Считаем по живым постройкам в
            // момент проверки, поэтому аура сама снимается при гибели шпиля.
            A.cloudSpireCount = function cloudSpireCount(side) {
                let n = 0;
                if (!B || !B.units) return 0;
                for (const u of B.units) {
                    if (u.side === side && u.def.type === "building" && u.def.cloudSpire) n++;
                }
                return n;
            };
            A.unitHasFly = function unitHasFly(u) {
                return !!u && !!u.def && u.def.type === "unit"
                    && (u.def.ability === "flyOver" || A.cloudSpireCount(u.side) > 0);
            };
            A.unitProtectTotal = function unitProtectTotal(u) {
                if (!u || !u.def) return 0;
                let n = u.protect || 0;
                if (u.def.type === "unit") n += A.cloudSpireCount(u.side);
                return n;
            };
            A.recalcAuras = function recalcAuras() {
                for (const side of ["p", "e"]) {
                    let atk = 0, hp = 0;
                    for (const u of B.units) if (u.side === side && u.def.type === "building") {
                        atk += (u.def.aura && u.def.aura.atk) || 0;
                        hp += (u.def.aura && u.def.aura.hp) || 0;
                    }
                    for (const u of B.units) if (u.side === side && u.def.type === "unit") {
                        // «Шипастые лозы» уводят бонус в минус — урон не ниже нуля;
                        // atkPenalty — постоянная убыль «Песчаного духа» (wis109)
                        const newAtk = Math.max(0, u.def.atk + (u.bonusAtk || 0)
                            + (u.atkPenalty || 0) + atk);
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
                        if (A.refreshProtectMark) A.refreshProtectMark(u);
                    }
                }
            };

            A.addUnit = function addUnit(side, cardId, col, row, opts = {}) {
                if (!root) return null; // сцена уже вышла: поле уничтожено, призыву некуда
                const def = CARDS[cardId];
                const u = { side, def, col, row, hp: def.hp, curAtk: def.atk || 0, auraHp: 0, bonusAtk: 0,
                    // жетон — существо без карты призыва (засада, культ, дух
                    // предка, волки): «Гоблин-вождь» такие не возвращает
                    token: !!opts.token };
                const node = makeUnitNode(u);
                u.node = node;
                node.scale.set(0.2);
                punches.push({ node, life: 0.3 / animK(), total: 0.3 / animK() });
                root.unitsLayer.addChild(node);
                const sp = cellXY(col, row);
                fxEvent("summon", {
                    x: sp.x, y: sp.y + 24, color: fxColorOf(def.elem),
                    scale: opts.token ? 0.72 : 1,
                });
                sfx("use"); // призыв (обе стороны)
                B.units.push(u);
                recalcAuras(); // строение могло появиться раньше юнита — аура живёт всегда
                if (def.type === "unit") {
                    // «Отряд эльфов» (grw27): при призыве потратить ВСЮ
                    // оставшуюся энергию — существо получает столько урона и
                    // жизней. bonusAtk — его снимает «Извлечение духа», как
                    // остальные эффекты карт
                    if (def.energyToStats) {
                        const pool = side === "p" ? B.energy : B.eEnergy;
                        if (pool > 0) {
                            if (side === "p") B.energy = 0; else B.eEnergy = 0;
                            u.bonusAtk += pool;
                            u.hp += pool;
                            recalcAuras();
                            const an = u.node.getChildByName("atk");
                            if (an) an.text = String(u.curAtk);
                            const hn = u.node.getChildByName("hp");
                            if (hn) hn.text = String(u.hp);
                            const p = cellXY(col, row);
                            floatText(p.x, p.y - 75, `+${pool}⚔ +${pool}♥`, 0x9fd489);
                            floatText(960, side === "p" ? 840 : 240, `−${pool}⚡`, 0xffd98c);
                            sfx("up");
                        }
                    }
                    // «Хранитель леса» (grw22): при призыве урон и жизни = числу
                    // СВОИХ Животных на поле (включая его самого — он уже в
                    // B.units). База карты 1/1, масштаб уходит в bonusAtk — его
                    // снимает «Извлечение духа», как остальные эффекты
                    if (def.keeperScale) {
                        let n = 0;
                        for (const o of B.units) if (o.side === side
                            && o.def.type === "unit" && o.def.creature === "animal") n += 1;
                        if (n > (def.atk || 0)) u.bonusAtk += n - (def.atk || 0);
                        if (n !== u.hp) u.hp = n;
                        recalcAuras();
                        const an = u.node.getChildByName("atk");
                        if (an) an.text = String(u.curAtk);
                        const hn = u.node.getChildByName("hp");
                        if (hn) hn.text = String(u.hp);
                        const p = cellXY(col, row);
                        floatText(p.x, p.y - 75, `${n}⚔/${n}♥`, 0x9fd489);
                        sfx("up");
                    }
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
                    // «Лесной монолит»: существо, призванное рядом (верт/гориз)
                    // с этой постройкой, получает +1 к жизням за монолит —
                    // перманентно (зеркало военного лагеря)
                    let grove = 0;
                    for (const o of B.units) if (o !== u && o.side === side
                        && o.def.type === "building" && o.def.groveAura
                        && Math.abs(o.col - col) + Math.abs(o.row - row) === 1) grove += o.def.groveAura;
                    if (grove) {
                        u.hp += grove;
                        recalcAuras();
                        const hn = u.node.getChildByName("hp");
                        if (hn) hn.text = String(u.hp);
                        const p = cellXY(u.col, u.row);
                        floatText(p.x, p.y - 75, `+${grove}♥`, 0x9fd489);
                    }
                    // «Меч в алтаре» (wis104): существо, призванное рядом с
                    // этой постройкой, получает +1⚔ за каждую ЕЁ жизнь,
                    // после чего меч-постройка погибает (штатный killUnit:
                    // каскады смерти/возврат героем работают).
                    for (const o of B.units.slice()) {
                        if (o === u || o.side !== side || o.def.type !== "building"
                            || !o.def.altarSword || !B.units.includes(o)
                            || Math.abs(o.col - col) + Math.abs(o.row - row) !== 1) continue;
                        const k = Math.max(0, o.hp | 0);
                        if (k > 0) {
                            u.bonusAtk += k;
                            recalcAuras();
                            const an = u.node.getChildByName("atk");
                            if (an) an.text = String(u.curAtk);
                            const p = cellXY(u.col, u.row);
                            floatText(p.x, p.y - 60, `+${k}⚔`, 0x9fd489);
                            sfx("up");
                        }
                        const op = cellXY(o.col, o.row);
                        floatText(op.x, op.y - 90, GAME_LOC.t(`card.${cardIdOf(o.def)}.name`), 0xb7d0ef);
                        killUnit(o, null);
                    }
                    // «Три монолита» (grw26): призыв СВОЕГО существа по соседству
                    // — поиск в колоде существа с ценой на 1 больше призванного
                    // и в руку; монолит при этом теряет 1 жизнь (может и умереть)
                    for (const o of B.units.slice()) {
                        if (o === u || o.side !== side || o.def.type !== "building"
                            || !o.def.monolith || !B.units.includes(o)
                            || Math.abs(o.col - col) + Math.abs(o.row - row) !== 1) continue;
                        if (side === "p") queueMonolithSearch(def.cost + 1);
                        else monolithEnemyTake(def.cost + 1);
                        const mp = cellXY(o.col, o.row);
                        floatText(mp.x, mp.y - 60, "−1♥", 0xef9f8c);
                        punch(o.node);
                        damageUnit(o, 1, null, "monolith");
                    }
                    // «Эльфийский друид»: каждый призыв СУЩЕСТВА (не постройки)
                    // даёт владельцу каждого друида на поле +1 энергии — будит
                    // и призыв друида («другое существо» — не он сам)
                    for (const o of B.units) {
                        if (o === u || o.side !== side || o.def.ability !== "druidEnergy"
                            || !B.units.includes(o)) continue;
                        if (side === "p") B.energy += 1; else B.eEnergy += 1;
                        const p = cellXY(o.col, o.row);
                        floatText(p.x, p.y - 66, "+1⚡", 0xffd98c);
                        punch(o.node);
                        sfx("aqua");
                    }
                    if (def.ability === "dash1") summonDash(u); // «Скорость 1»
                    else if (def.ability === "shaman") summonShaman(u); // шаман гоблинов
                    else if (def.ability === "spiritSummoner") summonSpiritCaller(u); // призыватель духов
                    else if (def.ability === "bombling") summonBombling(u); // бомблинг
                    else if (def.waterMage) heroMageDouble(u, () => summonWaterMage(u)); // водный маг
                    else if (def.illusion) heroMageDouble(u, () => summonIllusion(u)); // иллюзия
                    else if (def.lakeMaid) heroMageDouble(u, () => summonLakeMaid(u)); // озёрная дева
                    else if (def.sulfurBurst) summonSulfur(u); // элементаль серы: −2⚔ −1♥ соседям
                    if (def.berserkSummon) addBerserk(u, def.berserkSummon); // «Берсерк» — уже при призыве
                    // Способность героя (просил юзер): ПЕРВОЕ призванное игроком
                    // существо получает бонус — Горбаг +2 к урону, Эльмир +3 к
                    // жизням. Один раз за бой; после собственных эффектов карты
                    // (Хранитель леса переписывает жизни — герой поверх них).
                    // Тест-хук _spawn (opts.testSummon) подстройку поля героя
                    // НЕ триггерит
                    if (side === "p" && !B.heroFirstSummon && !opts.testSummon) {
                        const hd = globalThis.GAME_DATA.HEROES[G.heroId]
                            || globalThis.GAME_DATA.HEROES.gorbag;
                        B.heroFirstSummon = true;
                        const hp2 = cellXY(col, row);
                        if (hd.ability === "firstSummonAtk") {
                            u.bonusAtk += hd.abilityVal;
                            recalcAuras();
                            const an = u.node.getChildByName("atk");
                            if (an) an.text = String(u.curAtk);
                            floatText(hp2.x, hp2.y - 75, `+${hd.abilityVal}⚔`, 0x9fd489);
                            sfx("up");
                        } else if (hd.ability === "firstSummonHp") {
                            u.hp += hd.abilityVal;
                            recalcAuras();
                            const hn = u.node.getChildByName("hp");
                            if (hn) hn.text = String(u.hp);
                            floatText(hp2.x, hp2.y - 75, `+${hd.abilityVal}♥`, 0x9fd489);
                            sfx("up");
                        } else if (hd.ability === "firstSummonWard") {
                            // Мира: первое призванное существо получает
                            // «Защиту от заклинаний» (u.spellWard)
                            u.spellWard = true;
                            addWardMark(u);
                            floatText(hp2.x, hp2.y - 75,
                                "✦ " + GAME_LOC.t("spell.ward.name"), 0x8cd0ef);
                            sfx("up");
                        }
                    }
                    // «Свита вождя» (goblinChainSummon, просил юзер): гоблин
                    // призвал ДРУГОГО гоблина ИЗ КОЛОДЫ (opts.viaGoblin ставит
                    // «Шаман гоблинов») — призванный получает +1 к урону
                    if (opts.viaGoblin && !opts.testSummon) {
                        const hd = heroDefOf(side);
                        if (hd && hd.ability === "goblinChainSummon" && isGoblin(def)
                            && def.type === "unit") {
                            u.bonusAtk += hd.abilityVal || 1;
                            recalcAuras();
                            const an = u.node.getChildByName("atk");
                            if (an) an.text = String(u.curAtk);
                            const cp = cellXY(col, row);
                            floatText(cp.x, cp.y - 75, `+${hd.abilityVal || 1}⚔`, 0x9fd489);
                            sfx("up");
                        }
                    }
                }
                // «Сестра леса»: каждый призыв Растения (метка plant — существо
                // или постройка) даёт владельцу каждой Сестры на поле 1 карту
                if (def.plant) {
                    for (const o of B.units) {
                        if (o === u || o.side !== side || !o.def.sisterDraw
                            || !B.units.includes(o)) continue;
                        if (side === "p") drawCards(1); else drawEnemy(1);
                        const p = cellXY(o.col, o.row);
                        floatText(p.x, p.y - 66, "+1 " + GAME_LOC.t("card.grw20.draw"), 0x9fd489);
                        punch(o.node);
                        sfx("chpoc");
                    }
                }
                // «Лесной город» (firstBuildingGuard, просил юзер): первое
                // сыгранное стороной строение боя получает «Защита 1».
                // «Город мудрости» (firstBuildingDiscount): здесь же тратится
                // флаг скидки — постройка уже на поле (энергия списана).
                if (def.type === "building" && !u.token) {
                    const hd = heroDefOf(side);
                    if (hd && hd.ability === "firstBuildingDiscount")
                        B.heroFlags.firstBuilding[side] = true;
                    if (hd && hd.ability === "firstBuildingGuard"
                        && !B.heroFlags.builtGuard[side]) {
                        B.heroFlags.builtGuard[side] = true;
                        addProtect(u);
                    }
                }
                // ловушка врага на клетке призыва (и существа, и строения)
                triggerCellTraps(u);
                // Пришло с 0 жизней («Иллюзия» без соседей — 0/0): сразу
                // после призыва умирает (просил юзер) — штатная смерть со
                // всеми каскадами (рунный монолит, хищник, вождь). Убийцы
                // нет: триггеры «при гибели от существа врага» молчат
                if (B.units.includes(u) && u.hp <= 0) {
                    const p0 = cellXY(u.col, u.row);
                    floatText(p0.x, p0.y - 60, "0♥", 0xef9f8c);
                    killUnit(u, null);
                    checkEnd();
                }
                return u;
            }; // плавные переходы существ между клетками
            A.floatText = function floatText(x, y, text, fill) {
                // эффект запаздывающего урона мог дожить до выхода со сцены
                // (root уничтожен) — показывать уже нечего, молча пропускаем
                if (!root || !root.fx) return;
                const tt = T(text, 36, fill, { stroke: { color: 0x1c1207, width: 7.5 } });
                tt.anchor.set(0.5);
                tt.position.set(x, y);
                tt.eventMode = "none"; // всплывающий текст не ест клики поля
                root.fx.addChild(tt);
                const k = animK();
                floats.push({ node: tt, life: 0.9 / k, total: 0.9 / k, k });
            };
            A.punch = function punch(node) {
                punches.push({ node, life: 0.22 / animK(), total: 0.22 / animK() });
            };

            // Плавный переезд в центр клетки (анимация/позиция доигрываются в update).
            // 0.5с на шаг = ровно один полный цикл походки (6 кадров × 12fps):
            // клетка проходится целым шагом, анимация читается целиком.
            A.glide = function glide(u, x, y) {
                const dur = 0.5 / animK();
                const i = moves.findIndex((m) => m.u === u);
                if (i >= 0) moves.splice(i, 1);
                u.node.zIndex = u.row; // шагнул ниже по полю — поверх остальных
                moves.push({ u, node: u.node, fx: u.node.x, fy: u.node.y, tx: x, ty: y, life: dur, total: dur });
            };
            // Походная анимация: on=true — играть цикл направления face (по умолчанию
            // «к врагу»: игрок видит спину, враг — анфас), on=false — стоп-кадр.
            A.setWalk = function setWalk(u, on, face) {
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
            };

            // «Скорость 1»: сразу после призыва — шаг на клетку вперёд; если там
            // противник — удар по нему (урон с текущими бонусами). Своим не пройти,
            // своих не бить — стоим.
            A.summonDash = function summonDash(u) {
                if (!B.units.includes(u)) return; // мог умереть от мины при призыве
                const dir = u.side === "p" ? -1 : 1;
                const ahead = u.row + dir;
                if (ahead < 0 || ahead >= GRID) return;
                const occ = unitAt(u.col, ahead);
                if (occ) {
                    if (occ.side !== u.side) {
                        const hpBefore = occ.hp;
                        damageUnit(occ, u.curAtk, u, "sword");
                        crushHit(u, u.curAtk, hpBefore); // «Сокрушение»
                        thicketSplash(u, occ); // «Древоброд глухой чащи»: всплеск вокруг себя
                        venomApply(u, occ); // «Ядовитость»
                        frostAttack(u, occ); // «Снежный элементаль»: −1⚔ цели
                        frostNeighbors(u); // «Старший ледовик»: лёд соседям-существам
                        afterAttackPush(u, occ); // «Проросший кабан»
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
            };
        }
    };
})();
