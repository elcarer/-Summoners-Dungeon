// СЦЕНА «ПОДЗЕМЕЛЬЕ» — top-down перемещение героя, энкаунтеры-враги, выход.
// v0: фиксированная карта-ASCII (30×17, тайл 40px), тайлы — плоские заглушки,
// враги — жетоны-ромбы, герой — спрайт движка knight_64 (заглушка).
// Состояние живёт в G.dungeon (переживает уход в арену и обратно).
(function () {
    const TS = 40;
    // #: стена, .: пол, H: старт героя, e: враг, B: главарь, X: выход.
    // Враги стоят В КОРИДОРАХ, перекрывая входы в комнаты (просил юзер),
    // а не в центрах: (3,7) — выход из стартовой комнаты, (24,6) — вход
    // в правую верхнюю, (11,12) — дверной проход левой нижней. Центры
    // комнат оставлены под будущие интерактивные объекты. Босс — в центре
    // своей комнаты у спуска, как был.
    const ROWS = [
        "##############################",
        "#......#........#............#",
        "#.H....#.....................#",
        "#...............#............#",
        "#......#........#............#",
        "#......#........########.#####",
        "###.####........########e#####",
        "###e##########.#########.#####",
        "###.##########.#########.#####",
        "#..........##................#",
        "#..........##................#",
        "#..........##................#",
        "#..........e.................#",
        "#..........##................#",
        "#..........##.........B....X.#",
        "#..........##................#",
        "##############################",
    ];
    const W = ROWS[0].length, H = ROWS.length;

    function newDungeonState(floor) {
        const { mobForFloor, enemyDeck } = globalThis.GAME_DATA;
        const st = {
            floor, heroPos: null, enemies: [], exit: null, bossDead: false,
            toast: null, toastT: 0,
        };
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const ch = ROWS[j][i];
            const x = i * TS + TS / 2, y = j * TS + TS / 2;
            if (ch === "H") st.heroPos = { x, y };
            else if (ch === "e") {
                // архетип по этажу; колода кидается один раз и хранится
                // в враге — тултип и бой показывают один и тот же состав
                const enc = mobForFloor(floor);
                st.enemies.push({ x, y, enc, deck: enemyDeck(enc, floor), alive: true, boss: false });
            }
            else if (ch === "B") st.enemies.push({ x, y, enc: "boss", deck: enemyDeck("boss", floor), alive: true, boss: true });
            else if (ch === "X") st.exit = { x, y };
        }
        return st;
    }

    function createDungeonScene(ctx) {
        const { COMPONENTS, camera, characters, charInput, ECS, world, scenes, G, worldContainer, uiTex } = ctx;
        let layer = null, heroId = null, tokens = [], uiHud = null;
        let path = null; // клик-перемещение: очередь центров клеток (мировые px)

        function blocked(px, py) {
            const gx = Math.floor(px / TS), gy = Math.floor(py / TS);
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) return true;
            return ROWS[gy][gx] === "#";
        }

        // ── Клик-перемещение: BFS по клеткам + ведение героя по пути ────────
        // Путь — очередь центров соседних клеток; герой движется виртуальными
        // осями (ctrlVI/ctrlVJ — механизм ИИ): работают коллизии-скольжение и
        // походка из character-системы. Клавиши движения путь отменяют.
        function walkable(gx, gy) {
            return gx >= 0 && gy >= 0 && gx < W && gy < H && ROWS[gy][gx] !== "#";
        }
        function bfsPath(sx, sy, tx, ty) {
            if (sx === tx && sy === ty) return null;
            if (!walkable(sx, sy) || !walkable(tx, ty)) return null;
            const key = (x, y) => y * W + x;
            const prev = new Map([[key(sx, sy), null]]);
            const q = [[sx, sy]];
            for (let qi = 0; qi < q.length; qi++) {
                const [cx, cy] = q[qi];
                if (cx === tx && cy === ty) break;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
                    if (walkable(nx, ny) && !prev.has(k)) {
                        prev.set(k, [cx, cy]);
                        q.push([nx, ny]);
                    }
                }
            }
            if (!prev.has(key(tx, ty))) return null; // стена/недостижимо
            const cells = [];
            for (let c = [tx, ty]; c; c = prev.get(key(c[0], c[1]))) cells.push(c);
            cells.reverse();
            return cells.slice(1).map(([cx, cy]) => ({ x: cx * TS + TS / 2, y: cy * TS + TS / 2 }));
        }
        function setHeroAxes(ix, iy) {
            COMPONENTS.ctrlVI[heroId] = ix;
            COMPONENTS.ctrlVJ[heroId] = iy;
        }

        function buildMapGfx() {
            const g = new PIXI.Graphics();
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                const wall = ROWS[j][i] === "#";
                g.rect(i * TS, j * TS, TS, TS);
                g.fill(wall ? 0x2b2620 : 0x4a4136);
                if (wall) { g.rect(i * TS + 2, j * TS + 2, TS - 4, TS - 4); g.fill(0x35302a); }
                else { g.rect(i * TS + 1, j * TS + 1, TS - 2, TS - 2); g.fill(0x52493c); }
            }
            g.rect(0, 0, W * TS, H * TS);
            g.stroke({ width: 4, color: 0x191512, alignment: 0.5 });
            return g;
        }

        function makeToken(enemy) {
            const c = new PIXI.Container();
            const size = enemy.boss ? 30 : 22;
            const g = new PIXI.Graphics();
            g.poly([0, -size, size * 0.8, size * 0.7, 0, size * 0.45, -size * 0.8, size * 0.7]);
            g.closePath();
            g.fill(enemy.boss ? 0x8a2f2f : 0x9c4a3a);
            g.stroke({ width: 2, color: enemy.boss ? 0xffd27a : 0x2c1512 });
            c.addChild(g);
            if (enemy.boss) {
                const label = new PIXI.Text({ text: "!", style: { fontFamily: "Kereru", fontSize: 22, fill: 0xffe9b0 } });
                label.anchor.set(0.5, 0.5);
                c.addChild(label);
            }
            c.pivot.set(0, size * 0.7);
            c.position.set(enemy.x, enemy.y + 6);
            c.zIndex = enemy.y + 1;
            return c;
        }

        function makeExit() {
            const c = new PIXI.Container();
            const g = new PIXI.Graphics();
            g.rect(-16, -14, 32, 28);
            g.fill(0x6a5a35);
            g.stroke({ width: 2, color: 0xcfa94e });
            for (let k = 0; k < 4; k++) { g.rect(-12, -10 + k * 7, 24, 4); g.fill(k % 2 ? 0x8a7548 : 0x584a2a); }
            c.addChild(g);
            const t = new PIXI.Text({ text: GAME_LOC.t("dungeon.exitLabel"), style: { fontFamily: "Kereru", fontSize: 12, fill: 0xffe9b0 } });
            t.anchor.set(0.5, 1);
            t.position.set(0, -18);
            c.addChild(t);
            c.position.set(G.dungeon.exit.x, G.dungeon.exit.y);
            c.zIndex = G.dungeon.exit.y + 1;
            return c;
        }

        // Иконка-кнопка HUD (настройки/колода): спрайт-иконка без подписи
        function hudIcon(texName, x, y, onTap, scale = 0.9) {
            const sp = new PIXI.Sprite(uiTex(texName));
            sp.anchor.set(0.5);
            sp.scale.set(scale);
            sp.eventMode = "static";
            sp.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap(); });
            const c = new PIXI.Container();
            c.position.set(x, y);
            c.addChild(sp);
            return c;
        }

        function buildHud() {
            const c = new PIXI.Container();
            const panel = new PIXI.Sprite(uiTex("panel_label.png"));
            panel.scale.set(1.05); // 341×87 → ~358×91
            panel.eventMode = "static"; // панель — «хром» HUD: клики по ней не ведут героя
            c.addChild(panel);
            const style = { fontFamily: "Kereru", fontSize: 27, fill: 0xf3e6c2 };
            const floorT = new PIXI.Text({ text: "", style });
            floorT.position.set(39, 15);
            const hpT = new PIXI.Text({ text: "", style });
            hpT.position.set(189, 15);
            c.addChild(floorT, hpT);
            c.userData = { floorT, hpT, fit: true };
            // настройки и колода — доступны и из подземелья; «Назад» вернёт сюда
            c.addChild(hudIcon("icon_setting.png", 1839, 66, () => {
                G.uiReturn = "dungeon";
                scenes.go("settings");
            }));
            c.addChild(hudIcon("card_back_small.png", 1839, 162, () => {
                G.uiReturn = "dungeon";
                scenes.go("deck");
            }, 0.675));
            const hint = new PIXI.Text({
                text: GAME_LOC.t("dungeon.hint"),
                style: { fontFamily: "Kereru", fontSize: 22, fill: 0xbfae87 },
            });
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 1050);
            c.addChild(hint);
            const toast = new PIXI.Text({
                text: "", style: { fontFamily: "Kereru", fontSize: 39, fill: 0xffe2a8,
                stroke: { color: 0x1c1207, width: 7.5 } },
            });
            toast.anchor.set(0.5, 0.5);
            toast.position.set(960, 495);
            toast.alpha = 0;
            c.addChild(toast);
            c.userData = { floorT, hpT, toast };
            return c;
        }

        function showToast(text) {
            G.dungeon.toast = text;
            G.dungeon.toastT = 2.2;
        }

        // ── Подсказка на врага (наведение курсором): имя энкаунтера + краткое
        // описание его колоды (состав с копиями) и HP базы. Панель живёт в
        // ui-слое (дизайн-координаты) и каждый кадр следует за жетоном —
        // камера может двигаться. Показывает pointermove по клик-зоне карты:
        // жетоны врагов НЕ интерактивны, чтобы не съедать клики движения.
        let tip = null; // { enemy, node, h }
        function deckSummary(enemy) {
            // колода хранится в враге (кидается при генерации этажа); для
            // врагов из старых сейвов — генерим от этажа подземелья
            const deck = enemy.deck
                || globalThis.GAME_DATA.enemyDeck(enemy.enc, G.dungeon ? G.dungeon.floor : 1);
            const counts = new Map();
            for (const id of deck) counts.set(id, (counts.get(id) || 0) + 1);
            return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([id, n]) => `${n}× ${GAME_LOC.t("card." + id + ".name")}`).join(", ");
        }
        function showTip(enemy) {
            if (tip && tip.enemy === enemy) return;
            hideTip();
            const enc = globalThis.GAME_DATA.ENCOUNTERS[enemy.enc] || globalThis.GAME_DATA.ENCOUNTERS.gob;
            const node = new PIXI.Container();
            node.eventMode = "none";
            const title = new PIXI.Text({
                text: GAME_LOC.t("enc." + enemy.enc + ".title"),
                style: { fontFamily: "Kereru", fontSize: 24, fill: 0xffe9b0 },
            });
            const hpLine = new PIXI.Text({
                text: GAME_LOC.t("dungeon.tipBase", { n: enc.baseHp }),
                style: { fontFamily: "Kereru", fontSize: 18, fill: 0xff9c8c },
            });
            const deck = new PIXI.Text({
                text: GAME_LOC.t("dungeon.tipDeck") + ": " + deckSummary(enemy),
                style: { fontFamily: "Kereru", fontSize: 18, fill: 0xd8c79d,
                    wordWrap: true, wordWrapWidth: 336, breakWords: true },
            });
            const w = 372, pad = 15;
            const h = pad + title.height + 4 + hpLine.height + 6 + deck.height + pad;
            const g = new PIXI.Graphics();
            g.roundRect(0, 0, w, h, 12);
            g.fill({ color: 0x171310, alpha: 0.94 });
            g.stroke({ width: 3, color: 0x6b5c40 });
            title.position.set(pad, pad);
            hpLine.position.set(pad, pad + title.height + 4);
            deck.position.set(pad, pad + title.height + 8 + hpLine.height);
            node.addChild(g, title, hpLine, deck);
            ctx.ui.addChild(node);
            tip = { enemy, node, h };
        }
        function hideTip() {
            if (!tip) return;
            tip.node.destroy({ children: true });
            tip = null;
        }
        function hoverCheck(p) {
            if (!G.dungeon) { hideTip(); return; }
            let best = null, bd = 1e9;
            for (const e of G.dungeon.enemies) {
                if (!e.alive) continue;
                const d = Math.hypot(e.x - p.x, e.y - p.y);
                if (d < (e.boss ? 34 : 26) && d < bd) { best = e; bd = d; }
            }
            if (best) showTip(best); else hideTip();
        }

        return {
            enter() {
                if (ctx.music) ctx.music("dungeon");
                if (!G.dungeon) G.dungeon = newDungeonState(G.run.floor);
                const st = G.dungeon;
                layer = new PIXI.Container();
                layer.sortableChildren = true;
                // клик-зона на всю карту (ниже всех — рисуется прозрачной):
                // клик по полу = построить путь и идти
                const zone = new PIXI.Graphics();
                zone.rect(0, 0, W * TS, H * TS);
                zone.fill({ color: 0xffffff, alpha: 0.001 });
                zone.eventMode = "static";
                zone.on("pointertap", (e) => {
                    if (heroId === null) return;
                    const p = zone.toLocal(e.global); // мировые координаты (камера учтена)
                    const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                    const next = bfsPath(Math.floor(hx / TS), Math.floor(hy / TS),
                        Math.floor(p.x / TS), Math.floor(p.y / TS));
                    if (next) path = next; // в стену/сам в себя — не идём
                });
                // наведение на врага — подсказка (имя + колода); ушли — скрыть
                zone.on("pointermove", (e) => hoverCheck(zone.toLocal(e.global)));
                zone.on("pointerout", () => hideTip());
                layer.addChild(zone);
                layer.addChild(buildMapGfx());
                layer.addChild(makeExit());
                tokens = [];
                for (const e of st.enemies) if (e.alive) {
                    const tok = makeToken(e);
                    layer.addChild(tok);
                    tokens.push({ enemy: e, node: tok, base: tok.y, phase: Math.random() * 6.28 });
                }
                worldContainer.addChild(layer);

                // герой (заглушка — рыцарь движка)
                const sprite = new PIXI.AnimatedSprite(ctx.knight.animations.wait, false);
                sprite.anchor.set(0.5, 1);
                heroId = characters.spawn({
                    x: st.heroPos.x, y: st.heroPos.y, sprite, anims: ctx.knight.animations,
                    speed: 170, fps: ctx.knight.fps, halfW: 7, halfH: 5,
                });
                // виртуальные оси: их пишет и путь (клик-перемещение), и
                // зеркало клавиш/джойстика в update — герой всегда на них
                ECS.addComponent(world, heroId, "ctrlVI", 0);
                ECS.addComponent(world, heroId, "ctrlVJ", 0);
                layer.addChild(sprite);
                worldContainer.visible = true;
                camera.follow({
                    get x() { return heroId !== null ? COMPONENTS.positionX[heroId] : st.heroPos.x; },
                    get y() { return heroId !== null ? COMPONENTS.positionY[heroId] : st.heroPos.y; },
                }, 8);
                camera.setBounds({ x: 0, y: 0, width: W * TS, height: H * TS });
                camera.setZoom(2.1);
                camera.centerOn(st.heroPos.x, st.heroPos.y);
                uiHud = buildHud();
                ctx.ui.addChild(uiHud);
            },
            exit() {
                const st = G.dungeon;
                if (st && heroId !== null) {
                    st.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
                }
                // забег сохраняется при каждом уходе из подземелья (бой,
                // настройки, колода, «этаж пройден») — «Продолжить» в меню
                if (st && G.saveRun) G.saveRun();
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
                path = null;
                hideTip();
                if (layer) { layer.destroy({ children: true }); layer = null; }
                tokens = [];
                if (uiHud) { uiHud.destroy({ children: true }); uiHud = null; }
                worldContainer.visible = false;
            },
            update(ticker) {
                const st = G.dungeon;
                if (!st || heroId === null || !uiHud) return;
                const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                const dt = ticker.deltaMS / 1000;

                // ── ведение по пути (клик-перемещение) ─────────────────────
                if (path && (charInput.ix || charInput.iy)) path = null; // клавиши главнее
                if (path && !path.length) path = null;
                if (path) {
                    const dx = path[0].x - hx, dy = path[0].y - hy;
                    if (Math.hypot(dx, dy) < 5) {
                        const last = path.length === 1 ? path[0] : null;
                        path.shift();
                        if (!path.length) { // финальная клетка — встать ровно в центр
                            if (last) {
                                COMPONENTS.positionX[heroId] = last.x;
                                COMPONENTS.positionY[heroId] = last.y;
                            }
                            path = null;
                        }
                    }
                }
                if (path) {
                    const dx = path[0].x - hx, dy = path[0].y - hy;
                    const d = Math.hypot(dx, dy) || 1;
                    setHeroAxes(dx / d, dy / d);
                } else {
                    setHeroAxes(charInput.ix, charInput.iy); // зеркало обычного ввода
                }

                for (const t of tokens) {
                    t.phase += dt * 3;
                    t.node.y = t.base + Math.sin(t.phase) * 3;
                }
                // тултип следует за жетоном врага (камера/покачивание живые):
                // мировые → экранные → дизайн-координаты ui-слоя
                if (tip && layer) {
                    const sp = layer.toGlobal({ x: tip.enemy.x, y: tip.enemy.y });
                    const p = ctx.ui.toLocal(sp);
                    const tx = Math.max(12, Math.min(1920 - 384, p.x - 186));
                    const ty = (p.y - tip.h - 27 < 12) ? p.y + 33 : p.y - tip.h - 27;
                    tip.node.position.set(tx, ty);
                }
                if (st.toastT > 0) {
                    st.toastT -= dt;
                    uiHud.userData.toast.text = st.toast;
                    uiHud.userData.toast.alpha = Math.min(1, st.toastT);
                } else uiHud.userData.toast.alpha = 0;
                uiHud.userData.floorT.text = GAME_LOC.t("dungeon.floor", { n: st.floor });
                uiHud.userData.hpT.text = GAME_LOC.t("dungeon.hp", { hp: G.hero.hp, max: G.hero.maxHp });
                globalThis.GAME_UI.fit(uiHud.userData.floorT, 95, 11);
                globalThis.GAME_UI.fit(uiHud.userData.hpT, 105, 11);

                // триггеры: враги и выход
                for (const t of tokens) {
                    if (!t.enemy.alive) continue;
                    if (Math.hypot(t.enemy.x - hx, t.enemy.y - hy) < TS * 0.85) {
                        G.activeEnemy = t.enemy;
                        scenes.go("arena");
                        return;
                    }
                }
                if (st.exit && Math.hypot(st.exit.x - hx, st.exit.y - hy) < TS * 0.85) {
                    if (!st.bossDead) showToast(GAME_LOC.t("dungeon.exitSealed"));
                    // спуск требует растущую колоду: на этаже N — минимум
                    // 11+N карт (этаж 1 — 12, спуск на 2-й — 13, …)
                    else if (G.deck.length < 12 + st.floor) {
                        showToast(GAME_LOC.t("dungeon.exitDeck", { n: 12 + st.floor }));
                    } else {
                        G.run.floor += 1;
                        G.dungeon = null; // новый этаж — новая карта (v0: тот же шаблон)
                        scenes.go("floorWin");
                        return;
                    }
                }
            },
            blocked,
            heroId: () => heroId,
            // клик-перемещение: состояние пути и перевод мировых координат
            // в экранные (тесты кликают по полу через реальные события мыши);
            // layer стоит в (0,0) мира — его трансформ и есть мировая матрица
            path: () => path,
            worldToScreen: (x, y) => (layer ? layer.toGlobal({ x, y }) : null),
            // тултип врага: тест-хук «наведение в мировых координатах» + состояние
            hoverAt(x, y) {
                hoverCheck({ x, y });
                return tip ? { enc: tip.enemy.enc, boss: !!tip.enemy.boss } : null;
            },
            tipState: () => (tip ? {
                enc: tip.enemy.enc, boss: !!tip.enemy.boss,
                title: GAME_LOC.t("enc." + tip.enemy.enc + ".title"),
                deck: deckSummary(tip.enemy),
                w: 372, h: tip.h,
            } : null),
            tipHide: () => hideTip(),
        };
    }

    globalThis.GAME_DUNGEON = { createDungeonScene, newDungeonState, ROWS };
})();
