// СЦЕНА «ПОДЗЕМЕЛЬЕ» — top-down перемещение героя, энкаунтеры-враги, выход.
// v0: фиксированная карта-ASCII (30×17, тайл 40px), тайлы — плоские заглушки,
// враги — жетоны-ромбы, герой — спрайт движка knight_64 (заглушка).
// Состояние живёт в G.dungeon (переживает уход в арену и обратно).
(function () {
    const TS = 40;
    // #: стена, .: пол, H: старт героя, e: враг, B: главарь, X: выход
    const ROWS = [
        "##############################",
        "#......#........#............#",
        "#.H....#..............e......#",
        "#...........e...#............#",
        "#......#........#............#",
        "#......#........########.#####",
        "###.####........########.#####",
        "###.##########.#########.#####",
        "###.##########.#########.#####",
        "#..........##................#",
        "#..........##................#",
        "#..........##................#",
        "#............................#",
        "#.....e....##................#",
        "#..........##.........B....X.#",
        "#..........##................#",
        "##############################",
    ];
    const W = ROWS[0].length, H = ROWS.length;

    function newDungeonState(floor) {
        const { MOB_POOL } = globalThis.GAME_DATA;
        const st = {
            floor, heroPos: null, enemies: [], exit: null, bossDead: false,
            toast: null, toastT: 0,
        };
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const ch = ROWS[j][i];
            const x = i * TS + TS / 2, y = j * TS + TS / 2;
            if (ch === "H") st.heroPos = { x, y };
            else if (ch === "e") st.enemies.push({ x, y, enc: MOB_POOL[(Math.random() * MOB_POOL.length) | 0], alive: true, boss: false });
            else if (ch === "B") st.enemies.push({ x, y, enc: "boss", alive: true, boss: true });
            else if (ch === "X") st.exit = { x, y };
        }
        return st;
    }

    function createDungeonScene(ctx) {
        const { COMPONENTS, camera, characters, scenes, G, worldContainer, uiTex } = ctx;
        let layer = null, heroId = null, tokens = [], uiHud = null;

        function blocked(px, py) {
            const gx = Math.floor(px / TS), gy = Math.floor(py / TS);
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) return true;
            return ROWS[gy][gx] === "#";
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
            panel.scale.set(0.7); // 341×87 → ~239×61
            c.addChild(panel);
            const style = { fontFamily: "Kereru", fontSize: 18, fill: 0xf3e6c2 };
            const floorT = new PIXI.Text({ text: "", style });
            floorT.position.set(26, 10);
            const hpT = new PIXI.Text({ text: "", style });
            hpT.position.set(126, 10);
            c.addChild(floorT, hpT);
            c.userData = { floorT, hpT, fit: true };
            // настройки и колода — доступны и из подземелья; «Назад» вернёт сюда
            c.addChild(hudIcon("icon_setting.png", 1226, 44, () => {
                G.uiReturn = "dungeon";
                scenes.go("settings");
            }));
            c.addChild(hudIcon("card_back_small.png", 1226, 108, () => {
                G.uiReturn = "dungeon";
                scenes.go("deck");
            }, 0.45));
            const hint = new PIXI.Text({
                text: GAME_LOC.t("dungeon.hint"),
                style: { fontFamily: "Kereru", fontSize: 15, fill: 0xbfae87 },
            });
            hint.anchor.set(0.5, 0);
            hint.position.set(640, 700);
            c.addChild(hint);
            const toast = new PIXI.Text({
                text: "", style: { fontFamily: "Kereru", fontSize: 26, fill: 0xffe2a8,
                stroke: { color: 0x1c1207, width: 5 } },
            });
            toast.anchor.set(0.5, 0.5);
            toast.position.set(640, 330);
            toast.alpha = 0;
            c.addChild(toast);
            c.userData = { floorT, hpT, toast };
            return c;
        }

        function showToast(text) {
            G.dungeon.toast = text;
            G.dungeon.toastT = 2.2;
        }

        return {
            enter() {
                if (ctx.music) ctx.music("dungeon");
                if (!G.dungeon) G.dungeon = newDungeonState(G.run.floor);
                const st = G.dungeon;
                layer = new PIXI.Container();
                layer.sortableChildren = true;
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
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
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
                for (const t of tokens) {
                    t.phase += dt * 3;
                    t.node.y = t.base + Math.sin(t.phase) * 3;
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
                    else {
                        G.run.floor += 1;
                        G.dungeon = null; // новый этаж — новая карта (v0: тот же шаблон)
                        scenes.go("floorWin");
                        return;
                    }
                }
            },
            blocked,
            heroId: () => heroId,
        };
    }

    globalThis.GAME_DUNGEON = { createDungeonScene, newDungeonState, ROWS };
})();
