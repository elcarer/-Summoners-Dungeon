// СЦЕНА «АРЕНА» — карточный бой на поле 5×5.
// Ряд 0 — база врага (верх), ряд 4 — база игрока (низ). Существа маршируют
// к чужой базе в начало хода своего владельца; у края бьют базу и гибнут;
// упёршись во врага — бьют его вместо шага. Пошаговая логика — FSM + обычные
// объекты поверх Pixi (ECS остаётся для real-time мира подземелья).
(function () {
    const GRID = 5;          // 5×5
    const CELL = 74, GAP = 5;
    const BOARD_X = 445, BOARD_Y = 96;
    const PLAYER_ROWS = [3, 4], ENEMY_ROWS = [0, 1];
    const MANA_CAP = 10, ENEMY_MANA_CAP = 8;
    const HAND_MAX = 6, DRAW_PER_TURN = 2;

    const cellXY = (col, row) => ({
        x: BOARD_X + col * (CELL + GAP) + CELL / 2,
        y: BOARD_Y + row * (CELL + GAP) + CELL / 2,
    });

    function createArenaScene(ctx) {
        const { scenes, G, uiTex, scheduler } = ctx;
        const delay = (s) => new Promise((r) => scheduler.after(s, r));
        let root = null, B = null;

        const T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });

        // ── Визуал клетки: фон-сетка + подсветка доступных ─────────────────
        function buildBoard() {
            const c = new PIXI.Container();
            const back = new PIXI.Sprite(uiTex("board.png"));
            back.anchor.set(0.5);
            back.scale.set(0.44); // 1012×882 → ~445×388 под сетку 390×390
            back.position.set(BOARD_X + (GRID * (CELL + GAP) - GAP) / 2, BOARD_Y + (GRID * (CELL + GAP) - GAP) / 2);
            back.alpha = 0.95;
            c.addChild(back);

            const grid = new PIXI.Graphics();
            for (let r = 0; r < GRID; r++) for (let col = 0; col < GRID; col++) {
                grid.rect(BOARD_X + col * (CELL + GAP), BOARD_Y + r * (CELL + GAP), CELL, CELL);
                grid.fill((r + col) % 2 ? 0x5a5044 : 0x4e463a);
                grid.stroke({ width: 1, color: 0x2e2822 });
            }
            c.addChild(grid);

            const hi = new PIXI.Graphics(); // подсветка доступных клеток
            c.addChild(hi);

            // хит-зоны клеток (поверх всего, невидимые)
            const zones = [];
            for (let r = 0; r < GRID; r++) for (let col = 0; col < GRID; col++) {
                const z = new PIXI.Graphics();
                z.rect(BOARD_X + col * (CELL + GAP), BOARD_Y + r * (CELL + GAP), CELL, CELL);
                z.fill({ color: 0xffffff, alpha: 0.001 });
                z.eventMode = "static";
                z.cursor = "pointer";
                z.on("pointertap", () => onCellTap(col, r));
                c.addChild(z);
                zones.push(z);
            }
            c.userData = { hi, zones };
            return c;
        }

        function redrawHighlight() {
            const hi = root.board.userData.hi;
            hi.clear();
            if (B.phase !== "player" || B.selected === null) return;
            for (const [col, r] of freeCells(PLAYER_ROWS)) {
                hi.rect(BOARD_X + col * (CELL + GAP), BOARD_Y + r * (CELL + GAP), CELL, CELL);
                hi.fill({ color: 0x7dc95e, alpha: 0.38 });
                hi.stroke({ width: 2, color: 0xa8e890 });
            }
        }

        // ── Жетон существа (заглушка: цветной квадрат + статы) ─────────────
        function makeUnitNode(u) {
            const c = new PIXI.Container();
            const g = new PIXI.Graphics();
            g.roundRect(-30, -30, 60, 60, 10);
            g.fill(u.def.color);
            g.stroke({ width: 2.5, color: u.side === "p" ? 0x9fc4ef : 0xef9f8c });
            c.addChild(g);
            const atk = T(String(u.def.atk), 17, 0xffe9b0, { stroke: { color: 0x1c1207, width: 3 } });
            atk.position.set(-26, -28);
            const hp = T(String(u.hp), 17, 0xff9c8c, { stroke: { color: 0x1c1207, width: 3 } });
            hp.anchor.set(1, 0);
            hp.position.set(26, -28);
            hp.name = "hp";
            c.addChild(atk, hp);
            if (u.def.speed > 1) {
                for (let k = 0; k < u.def.speed; k++) {
                    const pip = new PIXI.Graphics();
                    pip.poly([0, -4, 4, 3, -4, 3]);
                    pip.closePath();
                    pip.fill(0xffe9b0);
                    pip.position.set(-4 + k * 9, 22);
                    c.addChild(pip);
                }
            }
            const p = cellXY(u.col, u.row);
            c.position.set(p.x, p.y);
            return c;
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

        // ── Карта в руке (заглушка: рубашка + текст поверх) ────────────────
        function makeCardNode(card, idx) {
            const def = GAME_DATA.CREATURES[card];
            const c = new PIXI.Container();
            const face = new PIXI.Sprite(uiTex("card_back_small.png"));
            face.anchor.set(0.5, 1);
            c.addChild(face);
            const plate = new PIXI.Graphics();
            plate.roundRect(-44, -132, 88, 44, 6);
            plate.fill({ color: 0x120d09, alpha: 0.66 });
            c.addChild(plate);
            const name = T(def.name, 13, 0xf3e6c2);
            name.anchor.set(0.5, 0);
            name.position.set(0, -128);
            const stats = T(`${def.atk}⚔ ${def.hp}♥ ${def.speed}→`, 14, 0xd8c79d);
            stats.anchor.set(0.5, 1);
            stats.position.set(0, -92);
            c.addChild(name, stats);
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
        function buildHud(enc) {
            const c = new PIXI.Container();

            // верх: имя энкаунтера + HP базы врага
            const plate = new PIXI.Sprite(uiTex("panel_label.png"));
            plate.anchor.set(0.5, 0);
            plate.scale.set(0.92);
            plate.position.set(640, 6);
            c.addChild(plate);
            const title = T(enc.title, 22, 0xffe9b0);
            title.anchor.set(0.5, 0);
            title.position.set(640, 14);
            c.addChild(title);
            const eBar = new PIXI.Graphics();
            c.addChild(eBar);
            const eInfo = T("", 15, 0xd8c79d);
            eInfo.anchor.set(0.5, 0);
            eInfo.position.set(640, 60);
            c.addChild(eInfo);
            c.userData = { eBar, eInfo };

            // низ-лево: панель игрока
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
            const pName = T("Герой", 17, 0xf3e6c2);
            pName.position.set(170, 528);
            c.addChild(pName);
            c.userData.pBar = pBar;

            // мана + колода
            const manaSign = new PIXI.Sprite(uiTex("sign_mana.png"));
            manaSign.position.set(180, 560);
            manaSign.scale.set(0.8);
            c.addChild(manaSign);
            const manaT = T("", 19, 0xbfe0ff);
            manaT.position.set(222, 566);
            c.addChild(manaT);
            c.userData.manaT = manaT;
            const deckBack = new PIXI.Sprite(uiTex("card_back_small.png"));
            deckBack.position.set(180, 606);
            deckBack.scale.set(0.28);
            c.addChild(deckBack);
            const deckT = T("", 17, 0xd8c79d);
            deckT.position.set(222, 610);
            c.addChild(deckT);
            c.userData.deckT = deckT;

            // кнопка «Конец хода»
            const endBtn = new PIXI.Sprite(uiTex("button_end.png"));
            endBtn.anchor.set(0.5);
            endBtn.scale.set(0.82);
            endBtn.position.set(1160, 330);
            endBtn.eventMode = "static";
            endBtn.cursor = "pointer";
            endBtn.on("pointertap", () => api.endTurn());
            c.addChild(endBtn);
            c.userData.endBtn = endBtn;

            // баннер хода
            const banner = T("", 54, 0xffe2a8, { stroke: { color: 0x1c1207, width: 8 } });
            banner.anchor.set(0.5);
            banner.position.set(640, 300);
            banner.alpha = 0;
            c.addChild(banner);
            c.userData.banner = banner;
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
            drawBar(ud.eBar, 470, 44, 340, 14, B.enemyBase / B.enemyBaseMax, 0xc0503c);
            ud.eInfo.text = `база врага ${Math.max(0, B.enemyBase)}/${B.enemyBaseMax}   мана ${B.eMana}   карт ${B.eHand.length}`;
            drawBar(ud.pBar, 170, 552, 100, 12, B.playerBase / B.playerBaseMax, 0x5d9c4a);
            ud.manaT.text = `${B.mana}/${MANA_CAP}`;
            ud.deckT.text = `${B.deck.length}+${B.discard.length}`;
            ud.endBtn.alpha = B.phase === "player" ? 1 : 0.45;
            ud.endBtn.eventMode = B.phase === "player" ? "static" : "none";
        }

        let bannerT = 0;
        function banner(text) {
            const b = root.hud.userData.banner;
            b.text = text;
            b.scale.set(1.25);
            b.alpha = 1;
            bannerT = 1.1;
        }

        // ── Эффекты: всплывающие числа, «удар» масштабом ───────────────────
        const floats = [], punches = [];
        function floatText(x, y, text, fill) {
            const t = T(text, 24, fill, { stroke: { color: 0x1c1207, width: 5 } });
            t.anchor.set(0.5);
            t.position.set(x, y);
            root.fx.addChild(t);
            floats.push({ node: t, life: 0.9 });
        }
        function punch(node) { punches.push({ node, life: 0.22 }); }

        // ── Логика боя ─────────────────────────────────────────────────────
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

        function addUnit(side, cardId, col, row) {
            const def = GAME_DATA.CREATURES[cardId];
            const u = { side, def, col, row, hp: def.hp };
            const node = makeUnitNode(u);
            u.node = node;
            node.scale.set(0.2);
            punches.push({ node, life: 0.3 });
            root.unitsLayer.addChild(node);
            B.units.push(u);
            return u;
        }

        function removeUnit(u) {
            const i = B.units.indexOf(u);
            if (i >= 0) B.units.splice(i, 1);
            punches.push({ node: u.node, life: 0.25, dying: true });
        }

        function baseHit(side, u) {
            if (side === "p") {
                B.enemyBase -= u.def.atk;
                const p = cellXY(u.col, 0);
                floatText(p.x, p.y - 10, `−${u.def.atk}`, 0xff8f6e);
            } else {
                B.playerBase -= u.def.atk;
                const p = cellXY(u.col, GRID - 1);
                floatText(p.x, p.y + 10, `−${u.def.atk}`, 0xff5f4e);
            }
            punch(root.hud);
        }

        // Марш стороны: юниты по очереди (передние первыми) идут вперёд.
        async function marchSide(side) {
            const dir = side === "p" ? -1 : 1;
            const order = B.units.filter((u) => u.side === side)
                .sort((a, b) => (side === "p" ? a.row - b.row : b.row - a.row));
            for (const u of order) {
                if (B.stopped || !B.units.includes(u)) continue;
                for (let step = 0; step < u.def.speed; step++) {
                    if (B.stopped || !B.units.includes(u)) break;
                    const ahead = u.row + dir;
                    if (ahead < 0 || ahead >= GRID) { // край — удар по базе
                        baseHit(side, u);
                        removeUnit(u);
                        refreshHud();
                        if (checkEnd()) return;
                        break;
                    }
                    const occ = unitAt(u.col, ahead);
                    if (occ) {
                        if (occ.side !== u.side) { // бой вместо шага
                            occ.hp -= u.def.atk;
                            occ.node.getChildByName("hp").text = String(Math.max(0, occ.hp));
                            const p = cellXY(occ.col, occ.row);
                            floatText(p.x, p.y - 24, `−${u.def.atk}`, 0xffb26e);
                            punch(occ.node);
                            if (occ.hp <= 0) removeUnit(occ);
                            refreshHud();
                            if (checkEnd()) return;
                        }
                        break; // занято — стоим (своим не даём пройти, своих не бьём)
                    }
                    u.row = ahead; // шаг
                    const p = cellXY(u.col, u.row);
                    u.node.position.set(p.x, p.y);
                    punch(u.node);
                    await delay(0.08);
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
            layoutHand();
            redrawHighlight();
            refreshHud();
            banner("ХОД ВРАГА");
            await delay(0.5);
            if (B.stopped) return;
            B.eMana = Math.min(ENEMY_MANA_CAP, B.eMana + 1);
            for (let k = 0; k < DRAW_PER_TURN; k++) if (B.eDeck.length) B.eHand.push(B.eDeck.pop());
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
                if (B.stopped) return;
                const cells = freeCells(ENEMY_ROWS);
                if (!cells.length) return;
                const affordable = B.eHand
                    .map((c, i) => ({ i, def: GAME_DATA.CREATURES[c] }))
                    .filter((x) => x.def.cost <= B.eMana)
                    .sort((a, b) => b.def.cost - a.def.cost);
                if (!affordable.length) return;
                const pick = affordable[0];
                // предпочитаем передний ряд (1) — быстрее дойти
                const front = cells.filter(([, r]) => r === 1);
                const pool = front.length ? front : cells;
                const [col, row] = pool[(Math.random() * pool.length) | 0];
                const cardId = B.eHand[pick.i];
                B.eHand.splice(pick.i, 1);
                B.eMana -= pick.def.cost;
                addUnit("e", cardId, col, row);
                refreshHud();
                await delay(0.4);
            }
        }

        async function playerTurnStart() {
            B.turnNo += 1;
            B.mana = Math.min(MANA_CAP, B.turnNo);
            drawCards(DRAW_PER_TURN);
            B.phase = "anim";
            refreshHud();
            banner("ВАШ ХОД");
            await delay(0.4);
            if (B.stopped) return;
            await marchSide("p");
            if (B.stopped || B.phase === "over") return;
            B.phase = "player";
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        // ── Ввод игрока ─────────────────────────────────────────────────────
        function onCardTap(idx) {
            if (B.phase !== "player") return;
            B.selected = B.selected === idx ? null : idx;
            layoutHand();
            redrawHighlight();
        }

        function onCellTap(col, row) {
            if (B.phase !== "player" || B.selected === null) return;
            if (!PLAYER_ROWS.includes(row)) return;
            if (unitAt(col, row)) return;
            const cardId = B.hand[B.selected];
            const def = GAME_DATA.CREATURES[cardId];
            if (!def || def.cost > B.mana) return;
            B.mana -= def.cost;
            B.discard.push(cardId);
            B.hand.splice(B.selected, 1);
            B.selected = null;
            addUnit("p", cardId, col, row);
            layoutHand();
            redrawHighlight();
            refreshHud();
        }

        // ── Итог боя ────────────────────────────────────────────────────────
        function finish(victory) {
            B.phase = "over";
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
            const t = T(victory ? "ПОБЕДА!" : "ПОРАЖЕНИЕ", 44, victory ? 0xffe9b0 : 0xff8f6e,
                { stroke: { color: 0x1c1207, width: 7 } });
            t.anchor.set(0.5);
            t.position.set(640, 268);
            t.eventMode = "none"; // текст поверх кнопки перехватывал hit-тест (Pixi v8 Text)
            ov.addChild(t);
            const btn = new PIXI.Sprite(uiTex(victory ? "button_stone.png" : "button_red.png"));
            btn.anchor.set(0.5);
            btn.scale.set(1.15);
            btn.position.set(640, 390);
            btn.eventMode = "static";
            btn.cursor = "pointer";
            ov.addChild(btn);
            const bt = T(victory ? "Продолжить" : "В меню", 18, 0xf3e6c2);
            bt.anchor.set(0.5);
            bt.position.set(640, 390);
            bt.eventMode = "none"; // иначе текст ловит клик вместо кнопки под ним
            ov.addChild(bt);
            root.addChild(ov);
            B.result = victory ? "win" : "lose";
            B.continueAction = () => {
                if (victory) {
                    if (G.activeEnemy) {
                        G.activeEnemy.alive = false;
                        if (G.activeEnemy.boss) G.dungeon.bossDead = true;
                    }
                    scenes.go("dungeon");
                } else {
                    G.resetRun();
                    scenes.go("menu");
                }
            };
            btn.on("pointertap", () => { B.btnTaps = (B.btnTaps || 0) + 1; B.continueAction(); });
            B.resultBtn = btn;
        }

        // ── Сцена ───────────────────────────────────────────────────────────
        function enter() {
            const encId = G.activeEnemy ? G.activeEnemy.enc : "gob";
            const enc = GAME_DATA.ENCOUNTERS[encId] || GAME_DATA.ENCOUNTERS.gob;
            B = {
                encId, phase: "player", stopped: false, turnNo: 1,
                mana: 1, eMana: 1,
                playerBase: 15, playerBaseMax: 15,
                enemyBase: enc.baseHp, enemyBaseMax: enc.baseHp,
                deck: shuffle([...G.deck]), discard: [], hand: [],
                eDeck: shuffle([...enc.deck]), eHand: [],
                units: [], selected: null, result: null,
            };
            G.battle = B;
            drawCards(4);

            root = new PIXI.Container();
            root.eventMode = "static";

            const bg = new PIXI.Sprite(uiTex("bg_corridor_2.png"));
            const s = Math.max(1280 / bg.texture.width, 720 / bg.texture.height);
            bg.scale.set(s);
            bg.position.set((1280 - bg.texture.width * s) / 2, (720 - bg.texture.height * s) / 2);
            root.addChild(bg);

            root.board = buildBoard();
            root.addChild(root.board);
            root.unitsLayer = new PIXI.Container();
            root.addChild(root.unitsLayer);
            root.cardsLayer = new PIXI.Container();
            root.addChild(root.cardsLayer);
            root.fx = new PIXI.Container();
            root.addChild(root.fx);
            root.hud = buildHud(enc);
            root.addChild(root.hud);

            root.on("pointertap", (e) => {
                B.taps = (B.taps || 0) + 1;
                if (e.target === root && B.phase === "player" && B.selected !== null) {
                    B.selected = null;
                    layoutHand();
                    redrawHighlight();
                }
            });

            ctx.ui.addChild(root);
            layoutHand();
            refreshHud();
            banner("ВАШ ХОД");
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
            if (bannerT > 0) {
                bannerT -= dt;
                const b = root.hud.userData.banner;
                b.alpha = Math.min(1, bannerT / 0.35);
                b.scale.set(b.scale.x + (1.0 - b.scale.x) * 0.12);
            } else root.hud.userData.banner.alpha = 0;
            if (B.phase === "player" && B.selected !== null && ctx.input.wasPressed("Escape")) {
                B.selected = null;
                layoutHand();
                redrawHighlight();
            }
        }

        const api = {
            endTurn() {
                if (!B || B.phase !== "player") return;
                enemyTurn();
            },
            // для автотестов: разыграть карту из руки в клетку
            playCardAt(handIdx, col, row) {
                B.selected = handIdx;
                onCellTap(col, row);
            },
        };

        return { enter, exit, update, api };
    }

    globalThis.GAME_ARENA = { createArenaScene };
})();
