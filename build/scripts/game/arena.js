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
    const MANA_CAP = 10, ENEMY_MANA_CAP = 8;
    const HAND_MAX = 6, DRAW_PER_TURN = 2;
    const { CARDS, ENCOUNTERS, TRAP_SLOTS } = globalThis.GAME_DATA;

    function createArenaScene(ctx) {
        const { scenes, G, uiTex, scheduler } = ctx;
        const t = (k, v) => GAME_LOC.t(k, v);
        const delay = (s) => new Promise((r) => scheduler.after(s, r));
        let root = null, B = null;

        // Лист существ поля боя: пока один (goblin) на всех. Стандарт листа —
        // 256×256, ряды front/back/right/left по 6 кадров. Взгляд по стороне:
        // юниты игрока идут вверх (виден затылок), врага — вниз (анфас).
        const CREATURE = ctx.creatureSheets && ctx.creatureSheets.goblin;
        const SPRITE_SCALE = 0.35; // кадр 256 → ~90px, фигура ~68px в клетке

        const T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });

        // ── Зона призыва: [свой последний ряд .. ряд перед самым выдвинутым
        //    своим существом/строением]. Базы — ЗА пределами сетки (ниже ряда 4
        //    игрока, выше ряда 0 врага), поэтому «ряд перед базой» = крайний
        //    ряд сетки. По умолчанию — ОДИН ряд ([4] у игрока, [0] у врага);
        //    призыв и продвижение расширяют зону к центру. ────────────────
        function deployRows(side) {
            const own = B.units.filter((u) => u.side === side);
            const rows = [];
            if (side === "p") {
                let front = 4; // ряд у своей базы
                if (own.length) front = Math.max(0, Math.min(...own.map((u) => u.row)) - 1);
                for (let r = front; r <= 4; r++) rows.push(r);
            } else {
                let back = 0; // ряд у базы врага
                if (own.length) back = Math.min(4, Math.max(...own.map((u) => u.row)) + 1);
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
        function buildBoard() {
            const c = new PIXI.Container();
            const hi = new PIXI.Graphics();
            c.addChild(hi);

            const zones = [];
            for (let r = 0; r < GRID; r++) for (let col = 0; col < GRID; col++) {
                const rc = cellRect(col, r);
                const z = new PIXI.Graphics();
                z.rect(rc.x, rc.y, rc.w, rc.h);
                z.fill({ color: 0xffffff, alpha: 0.001 });
                z.eventMode = "static";
                z.cursor = "pointer";
                z.on("pointertap", () => onCellTap(col, r));
                c.addChild(z);
                zones.push(z);
            }

            // зона клика по базе врага (для заклинаний с прицелом)
            const baseZone = new PIXI.Graphics();
            baseZone.rect(470, 28, 340, 36);
            baseZone.fill({ color: 0xffffff, alpha: 0.001 });
            baseZone.eventMode = "none";
            baseZone.on("pointertap", () => {
                if (B && B.spellTarget && B.selected !== null) castSpell(B.selected, { base: true });
            });
            c.addChild(baseZone);

            c.userData = { hi, zones, baseZone };
            return c;
        }

        function redrawHighlight() {
            const hi = root.board.userData.hi;
            hi.clear();
            if (B.phase !== "player" || B.selected === null) {
                root.board.userData.baseZone.eventMode = "none";
                return;
            }
            if (B.spellTarget) { // прицел заклинания: враги + база
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
            for (const [col, r] of freeCells(deployRows("p"))) {
                const rc = cellRect(col, r);
                hi.rect(rc.x, rc.y, rc.w, rc.h);
                hi.fill({ color: 0x7dc95e, alpha: 0.38 });
                hi.stroke({ width: 2, color: 0xa8e890 });
            }
        }

        // ── Жетоны на поле: существо / строение ────────────────────────────
        function makeUnitNode(u) {
            const c = new PIXI.Container();
            const spr = u.def.type !== "building" && CREATURE; // спрайт-существо
            if (u.def.type === "building") {
                const g = new PIXI.Graphics();
                g.moveTo(-26, -8); g.lineTo(0, -26); g.lineTo(26, -8); // крыша
                g.lineTo(26, 24); g.lineTo(-26, 24); g.closePath();
                g.fill(u.def.color);
                g.stroke({ width: 2.5, color: 0xffd98c });
                c.addChild(g);
                const aura = T("✦", 20, 0xffe9b0);
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
                const ring = new PIXI.Graphics(); // командная тень-кольцо под ногами
                ring.ellipse(0, 8, 30, 10);
                ring.fill({ color: u.side === "p" ? 0x2f4f7a : 0x7a3430, alpha: 0.45 });
                ring.stroke({ width: 1.5, color: u.side === "p" ? 0x9fc4ef : 0xef9f8c });
                ring.eventMode = "none";
                c.addChild(ring);
                const body = new PIXI.AnimatedSprite(CREATURE.animations[face], false);
                body.anchor.set(0.5, 0.85); // ноги (y≈0.93 кадра) чуть ниже центра клетки
                body.scale.set(SPRITE_SCALE);
                body.animationSpeed = CREATURE.animationSpeed || 0.2;
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

        // ── Ауры строений: пересчёт атак/здоровья своих существ ────────────
        function recalcAuras() {
            for (const side of ["p", "e"]) {
                let atk = 0, hp = 0;
                for (const u of B.units) if (u.side === side && u.def.type === "building") {
                    atk += (u.def.aura && u.def.aura.atk) || 0;
                    hp += (u.def.aura && u.def.aura.hp) || 0;
                }
                for (const u of B.units) if (u.side === side && u.def.type === "unit") {
                    const newAtk = u.def.atk + atk;
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
            const u = { side, def, col, row, hp: def.hp, curAtk: def.atk || 0, auraHp: 0 };
            const node = makeUnitNode(u);
            u.node = node;
            node.scale.set(0.2);
            punches.push({ node, life: 0.3 });
            root.unitsLayer.addChild(node);
            B.units.push(u);
            recalcAuras(); // строение могло появиться раньше юнита — аура живёт всегда
            return u;
        }

        const floats = [], punches = [];
        const moves = []; // плавные переходы существ между клетками
        function floatText(x, y, text, fill) {
            const tt = T(text, 24, fill, { stroke: { color: 0x1c1207, width: 5 } });
            tt.anchor.set(0.5);
            tt.position.set(x, y);
            root.fx.addChild(tt);
            floats.push({ node: tt, life: 0.9 });
        }
        function punch(node) { punches.push({ node, life: 0.22 }); }

        // Плавный переезд в центр клетки (анимация/позиция доигрываются в update).
        // 0.3с на шаг: походная анимация (6 кадров, 12fps) успевает показать
        // 3-4 кадра — шаг читается, а не мелькает.
        function glide(u, x, y, dur = 0.3) {
            const i = moves.findIndex((m) => m.u === u);
            if (i >= 0) moves.splice(i, 1);
            moves.push({ u, node: u.node, fx: u.node.x, fy: u.node.y, tx: x, ty: y, life: dur, total: dur });
        }
        // Походная анимация: on=true — играть цикл направления face (по умолчанию
        // «к врагу»: игрок видит спину, враг — анфас), on=false — стоп-кадр.
        function setWalk(u, on, face) {
            const body = u.node && u.node.getChildByName("body");
            if (!body || !body.textures || !CREATURE) return;
            const name = face || (u.side === "p" ? "walk_back" : "walk_front");
            if (!CREATURE.animations[name]) return;
            if (body.userData_face !== name) {
                body.textures = CREATURE.animations[name];
                body.userData_face = name;
            }
            if (on) body.gotoAndPlay(0); else body.gotoAndStop(0);
        }

        function removeUnit(u) {
            const i = B.units.indexOf(u);
            if (i >= 0) B.units.splice(i, 1);
            punches.push({ node: u.node, life: 0.25, dying: true });
        }

        function killUnit(u, killer) {
            removeUnit(u);
            if (u.def.type === "building") recalcAuras();
            // ловушки стороны погибшего: триггер «при гибели своего существа»
            if (killer && killer.def && killer.def.type === "unit" && killer.side !== u.side) {
                triggerTraps(u.side, killer);
            }
        }

        function damageUnit(target, amount, killer = null) {
            target.hp -= amount;
            const n = target.node.getChildByName("hp");
            if (n) n.text = String(Math.max(0, target.hp));
            const p = cellXY(target.col, target.row);
            floatText(p.x, p.y - 24, `−${amount}`, 0xffb26e);
            punch(target.node);
            if (target.hp <= 0) killUnit(target, killer);
        }

        function baseHit(side, u) {
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

        // ── Ловушки ─────────────────────────────────────────────────────────
        function armTrap(side, cardId) {
            if (B.traps[side].length >= TRAP_SLOTS) return false;
            B.traps[side].push({ def: CARDS[cardId] });
            redrawTraps();
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
                    if (B.units.includes(v)) damageUnit(v, amount, null);
                }
                refreshHud();
                checkEnd();
            }
        }
        function redrawTraps() {
            const layer = root.trapLayer;
            layer.removeChildren().forEach((n) => n.destroy({ children: true }));
            for (const side of ["p", "e"]) {
                B.traps[side].forEach((tr, i) => {
                    const c = new PIXI.Container();
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 17);
                    g.fill(side === "p" ? 0x3f5f8a : 0x7a3f3f);
                    g.stroke({ width: 2, color: 0xd8c79d });
                    c.addChild(g);
                    const q = T("?", 20, 0xffe9b0);
                    q.anchor.set(0.5);
                    c.addChild(q);
                    c.position.set(886, side === "p" ? 470 - i * 44 : 130 + i * 44);
                    layer.addChild(c);
                });
            }
        }

        // ── Карты в руке ────────────────────────────────────────────────────
        function cardBottom(def) {
            if (def.type === "unit") return { text: `${def.atk}⚔ ${def.hp}♥ ${def.speed}→`, small: false };
            const key = `card.${Object.keys(CARDS).find((k) => CARDS[k] === def)}.desc`;
            return { text: GAME_LOC.t(key), small: true };
        }
        function makeCardNode(card, idx) {
            const def = CARDS[card];
            const c = new PIXI.Container();
            const face = new PIXI.Sprite(uiTex("card_back_small.png"));
            face.anchor.set(0.5, 1);
            face.tint = def.type === "unit" ? 0xffffff : (def.color || 0xffffff);
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
            c.eventMode = "static";
            c.cursor = "pointer";
            c.on("pointertap", () => onCardTap(idx));
            c.alpha = def.cost > B.mana ? 0.55 : 1;
            return c;
        }

        function layoutHand() {
            for (const n of root.cardsLayer.children) n.destroy({ children: true });
            root.cardsLayer.removeChildren();
            const n = B.hand.length;
            B.hand.forEach((card, idx) => {
                const node = makeCardNode(card, idx);
                const spread = Math.min(112, 700 / Math.max(1, n));
                node.x = 640 + (idx - (n - 1) / 2) * spread;
                node.y = B.selected === idx ? 616 : 656;
                node.rotation = (idx - (n - 1) / 2) * 0.035;
                if (B.selected === idx) node.scale.set(1.12);
                root.cardsLayer.addChild(node);
            });
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
            endBtn.cursor = "pointer";
            endBtn.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); api.endTurn(); });
            c.addChild(endBtn);

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
            c.userData = { eBar, eInfo, title, pBar, pName, manaT, deckT, endBtn, banner, targetHint };
            return c;
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
            ud.eInfo.text = `${t("arena.baseEnemy")} ${Math.max(0, B.enemyBase)}/${B.enemyBaseMax}  ·  ${t("arena.mana")} ${B.eMana}  ·  ${t("arena.manaCards", { n: B.eHand.length })}`;
            globalThis.GAME_UI.fit(ud.eInfo, 430, 11);
            drawBar(ud.pBar, 170, 552, 100, 12, B.playerBase / B.playerBaseMax, 0x5d9c4a);
            ud.pName.text = t("arena.hero");
            ud.manaT.text = `${B.mana}/${MANA_CAP}`;
            ud.deckT.text = `${B.deck.length}+${B.discard.length}`;
            ud.endBtn.alpha = B.phase === "player" ? 1 : 0.45;
            ud.endBtn.eventMode = B.phase === "player" ? "static" : "none";
            ud.targetHint.text = B.spellTarget ? t("arena.pickTarget") : "";
        }

        let bannerT = 0;
        function banner(text) {
            const b = root.hud.userData.banner;
            b.text = text;
            b.scale.set(1.25);
            b.alpha = 1;
            bannerT = 1.1;
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
            for (let k = 0; k < count; k++) {
                if (B.hand.length >= HAND_MAX) break;
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
                            damageUnit(occ, u.curAtk, u);
                            refreshHud();
                            if (checkEnd()) return;
                        }
                        break; // занято — стоим (своим не даём пройти, своих не бьём)
                    }
                    u.row = ahead;
                    const p = cellXY(u.col, u.row);
                    glide(u, p.x, p.y);
                    setWalk(u, true);
                    await delay(0.34); // глиссада 0.3с + пауза: шаг видно целиком
                    if (B.stopped) return;
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
            await delay(0.5);
            if (B.stopped) return;
            B.eMana = Math.min(ENEMY_MANA_CAP, B.eMana + 1);
            for (let k = 0; k < DRAW_PER_TURN; k++) drawEnemy(1);
            refreshHud();
            await marchSide("e");
            if (B.stopped || B.phase === "over") return;
            await aiPlay();
            if (B.stopped || B.phase === "over") return;
            await delay(0.25);
            if (B.stopped) return;
            await playerTurnStart();
        }

        async function aiPlay() {
            for (;;) {
                if (B.stopped || B.phase === "over") return;
                const affordable = B.eHand
                    .map((c, i) => ({ i, def: CARDS[c] }))
                    .filter((x) => x.def.cost <= B.eMana)
                    .sort((a, b) => b.def.cost - a.def.cost);
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
                        B.eMana -= def.cost;
                        addUnit("e", cardId, col, row);
                        played = true;
                        break;
                    }
                    if (def.type === "trap") {
                        if (B.traps.e.length >= TRAP_SLOTS) continue;
                        const cardId = B.eHand[pick.i];
                        B.eHand.splice(pick.i, 1);
                        B.eMana -= def.cost;
                        armTrap("e", cardId);
                        played = true;
                        break;
                    }
                    if (def.type === "spell") {
                        if (def.spell.draw && B.eHand.length > 4) continue;
                        const cardId = B.eHand[pick.i];
                        B.eHand.splice(pick.i, 1);
                        B.eMana -= def.cost;
                        if (def.spell.target === "enemyAny") {
                            const targets = B.units.filter((u) => u.side === "p");
                            if (targets.length) {
                                const best = targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                                damageUnit(best, def.spell.dmg, null);
                            } else {
                                B.playerBase -= def.spell.dmg;
                                floatText(640, 560, `−${def.spell.dmg}`, 0xff5f4e);
                            }
                        }
                        if (def.spell.draw) drawEnemy(def.spell.draw);
                        B.eDiscard.push(cardId);
                        refreshHud();
                        if (checkEnd()) return;
                        played = true;
                        break;
                    }
                }
                if (!played) return;
                refreshHud();
                await delay(0.4);
            }
        }

        async function playerTurnStart() {
            B.turnNo += 1;
            B.mana = Math.min(MANA_CAP, B.turnNo);
            drawCards(DRAW_PER_TURN);
            B.phase = "anim";
            B.selected = null;
            B.spellTarget = false;
            refreshHud();
            banner(t("arena.yourTurn"));
            await delay(0.4);
            if (B.stopped) return;
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

        function onCardTap(idx) {
            if (B.phase !== "player") return;
            const def = CARDS[B.hand[idx]];
            if (!def) return;
            if (ctx.sfx) ctx.sfx();
            if (def.type === "spell" && def.spell.target === "none") {
                castSpell(idx); // без цели — сразу
                return;
            }
            if (def.type === "trap") {
                if (def.cost > B.mana || B.traps.p.length >= TRAP_SLOTS) return;
                B.mana -= def.cost;
                spendCard(idx);
                armTrap("p", Object.keys(CARDS).find((k) => CARDS[k] === def));
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
            if (B.phase !== "player" || B.selected === null) return;
            const def = CARDS[B.hand[B.selected]];
            if (!def) return;
            if (B.spellTarget) { // прицел: только по врагу
                const u = unitAt(col, row);
                if (u && u.side === "e") castSpell(B.selected, { col, row });
                return;
            }
            if (!deployRows("p").includes(row)) return;
            if (unitAt(col, row)) return;
            if (def.cost > B.mana) return;
            B.mana -= def.cost;
            const cardId = spendCard(B.selected);
            addUnit("p", cardId, col, row);
            if (ctx.sfx) ctx.sfx();
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        function castSpell(handIdx, target) {
            if (B.phase !== "player") return false;
            const cardId = B.hand[handIdx];
            const def = CARDS[cardId];
            if (!def || def.type !== "spell" || def.cost > B.mana) return false;
            if (def.spell.target === "enemyAny") {
                if (!target) return false;
                if (target.base === true) {
                    B.enemyBase -= def.spell.dmg;
                    floatText(640, 40, `−${def.spell.dmg}`, 0xff8f6e);
                    punch(root.hud);
                } else if (target.col !== undefined) {
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side === "p") return false;
                    damageUnit(u, def.spell.dmg, null);
                } else return false;
            }
            if (def.spell.draw) drawCards(def.spell.draw);
            B.mana -= def.cost;
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
                    scenes.go("reward");
                } else {
                    G.resetRun();
                    scenes.go("menu");
                }
            };
            if (victory) {
                // победа сама ведёт в меню трофея — кнопка не нужна
                scheduler.after(1.4, () => {
                    if (B && !B.stopped && B.phase === "over" && B.result === "win") B.continueAction();
                });
            } else {
                const btn = new PIXI.Sprite(uiTex("button_red.png"));
                btn.anchor.set(0.5);
                btn.scale.set(1.15);
                btn.position.set(640, 390);
                btn.eventMode = "static";
                btn.cursor = "pointer";
                ov.addChild(btn);
                const bt = T(t("arena.toMenu"), 18, 0xf3e6c2);
                bt.anchor.set(0.5);
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
            B = {
                encId, phase: "player", stopped: false, turnNo: 1,
                mana: 1, eMana: 1,
                playerBase: 15, playerBaseMax: 15,
                enemyBase: enc.baseHp, enemyBaseMax: enc.baseHp,
                deck: shuffle([...G.deck]), discard: [], hand: [],
                eDeck: shuffle([...enc.deck]), eDiscard: [], eHand: [],
                units: [], traps: { p: [], e: [] },
                selected: null, spellTarget: false, result: null,
            };
            G.battle = B;
            drawCards(4);
            moves.length = 0; floats.length = 0; punches.length = 0; // хвосты прошлого боя

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
            if (root) { root.destroy({ children: true }); root = null; }
            G.battle = null;
        }

        function update(ticker) {
            if (!root || !B) return;
            const dt = ticker.deltaMS / 1000;
            for (let i = floats.length - 1; i >= 0; i--) {
                const f = floats[i];
                f.life -= dt;
                f.node.y -= 36 * dt;
                f.node.alpha = Math.max(0, f.life / 0.9);
                if (f.life <= 0) { f.node.destroy(); floats.splice(i, 1); }
            }
            for (let i = punches.length - 1; i >= 0; i--) {
                const p = punches[i];
                p.life -= dt;
                const k = Math.max(0, p.life / (p.dying ? 0.25 : 0.22));
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
            // не число — иначе кадр NaN и спрайт замирает)
            for (const u of B.units) {
                const body = u.node.getChildByName("body");
                if (body && body.playing) body.update(ticker);
            }
            if (bannerT > 0) {
                bannerT -= dt;
                const b = root.hud.userData.banner;
                b.alpha = Math.min(1, bannerT / 0.35);
                b.scale.set(b.scale.x + (1.0 - b.scale.x) * 0.12);
            } else root.hud.userData.banner.alpha = 0;
            if (B.phase === "player" && B.selected !== null && ctx.input.wasPressed("Escape")) {
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
            }
        }

        const api = {
            endTurn() {
                if (!B || B.phase !== "player") return;
                enemyTurn();
            },
            playCardAt(handIdx, col, row) {
                B.selected = handIdx;
                B.spellTarget = false;
                onCellTap(col, row);
            },
            select(handIdx) { onCardTap(handIdx); },
            castSpell,
            playTrap(handIdx) {
                B.selected = null;
                onCardTapTrapForApi(handIdx);
            },
            deployRows,
            state() {
                return {
                    phase: B.phase, result: B.result,
                    pBase: B.playerBase, eBase: B.enemyBase,
                    mana: B.mana, hand: [...B.hand],
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
            // тест-хук: разместить юнита любой стороны
            _spawn(side, cardId, col, row) {
                if (unitAt(col, row)) return false;
                return addUnit(side, cardId, col, row);
            },
        };
        function cardIdOf(def) {
            return Object.keys(CARDS).find((k) => CARDS[k] === def);
        }
        function onCardTapTrapForApi(handIdx) {
            const def = CARDS[B.hand[handIdx]];
            if (!def || def.type !== "trap" || def.cost > B.mana) return;
            B.mana -= def.cost;
            const id = cardIdOf(def);
            spendCard(handIdx);
            armTrap("p", id);
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        return { enter, exit, update, api };
    }

    globalThis.GAME_ARENA = { createArenaScene };
})();
