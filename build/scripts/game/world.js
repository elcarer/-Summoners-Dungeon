// СЦЕНА «ОТКРЫТЫЙ МИР» — верхний уровень игры (референсы: Shandalar,
// forge-adventure): герой странствует по карте мира и спускается в
// подземелья через входы-пещеры. v0 — один кусочек карты и один вход:
// «Гоблинские пещеры» (стихия «Сила», 6 этажей). Со временем рядом
// появятся входы в подземелья остальных пяти стихий.
// Передвижение — как в подземелье: WASD/стрелки и клик по земле (BFS-путь
// с ведением героя виртуальными осями). Вход в пещеру — триггер по
// касанию: продолжает текущий этаж забега (состояния этажей хранит
// G.dungeonStates) или начинает первый.
(function () {
    const TS = 40;
    // '#': деревья/скалы (стена), '~': вода (тоже стена), '.': трава,
    // 'W': старт героя, 'C': вход в Гоблинские пещеры (Сила), 'G': вход
    // в Рощу Роста (Рост). Вход стоит в поле у скального массива справа —
    // арка читается без рамки.
    const ROWS = [
        "##############################",
        "#............................#",
        "#...##.....~~~.....###.......#",
        "#..........~~~...............#",
        "#..##.......~.......##...##..#",
        "#......................##....#",
        "#.....##........##...........#",
        "#........##..................#",
        "#.W....C.##..................#",
        "#........##........##........#",
        "#....##........##............#",
        "#.....................##.....#",
        "#........##.............G....#",
        "#..............##............#",
        "#...##...................##..#",
        "#............................#",
        "##############################",
    ];
    // входы подземелий: символ карты → id данжа (dataCards CAVES)
    const CAVES_ON_MAP = { C: "gob", G: "grw" };
    const W = ROWS[0].length, H = ROWS.length;

    function findCh(ch) {
        for (let j = 0; j < H; j++) {
            const i = ROWS[j].indexOf(ch);
            if (i >= 0) return { x: i * TS + TS / 2, y: j * TS + TS / 2 };
        }
        return null;
    }

    function createWorldScene(ctx) {
        const { COMPONENTS, camera, characters, charInput, ECS, world, scenes, G, worldContainer, uiTex } = ctx;
        let layer = null, heroId = null, heroShadow = null, uiHud = null;
        let path = null; // клик-перемещение: очередь центров клеток (мировые px)

        function walkable(gx, gy) {
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) return false;
            const ch = ROWS[gy][gx];
            return ch !== "#" && ch !== "~";
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
            if (!prev.has(key(tx, ty))) return null;
            const cells = [];
            for (let c = [tx, ty]; c; c = prev.get(key(c[0], c[1]))) cells.push(c);
            cells.reverse();
            return cells.slice(1).map(([cx, cy]) => ({ x: cx * TS + TS / 2, y: cy * TS + TS / 2 }));
        }
        function setHeroAxes(ix, iy) {
            COMPONENTS.ctrlVI[heroId] = ix;
            COMPONENTS.ctrlVJ[heroId] = iy;
        }

        // Луга: базовый зелёный с чередованием оттенков (детерминированным,
        // чтобы карта не «мерцала»), деревья и вода — плоские тайлы-заглушки
        // в духе подземелья.
        function buildMapGfx() {
            const g = new PIXI.Graphics();
            const grass = [0x4a5c33, 0x516339, 0x455630];
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                const ch = ROWS[j][i];
                if (ch === "#") { // деревья/скалы
                    g.rect(i * TS, j * TS, TS, TS);
                    g.fill(0x22301b);
                    g.rect(i * TS + 2, j * TS + 2, TS - 4, TS - 4);
                    g.fill(0x2c3f22);
                } else if (ch === "~") { // вода
                    g.rect(i * TS, j * TS, TS, TS);
                    g.fill(0x2c4a63);
                    g.rect(i * TS + 3, j * TS + 3, TS - 6, TS - 6);
                    g.fill(0x38607c);
                } else { // трава
                    const v = (i * 7 + j * 13) % 3;
                    g.rect(i * TS, j * TS, TS, TS);
                    g.fill(grass[v]);
                }
            }
            g.rect(0, 0, W * TS, H * TS);
            g.stroke({ width: 4, color: 0x141b0f, alignment: 0.5 });
            return g;
        }

        // Входы в подземелья: та же арка-спуск, что и выход этажа, с именем
        // подземелья сверху (Гоблинские пещеры / Роща Роста). Триггер —
        // касание героем.
        function makeCave(ch, labelKey) {
            const c = new PIXI.Container();
            const p = findCh(ch);
            const shadow = new PIXI.Graphics();
            shadow.circle(0, 0, 21);
            shadow.fill({ color: 0x0d130a, alpha: 0.55 });
            c.addChild(shadow);
            const sp = new PIXI.Sprite(uiTex("icon_down.png"));
            sp.anchor.set(0.5);
            sp.scale.set(0.66);
            c.addChild(sp);
            const t = new PIXI.Text({
                text: GAME_LOC.t(labelKey),
                style: { fontFamily: "Kereru", fontSize: 13, fill: 0xffe9b0,
                    stroke: { color: 0x1c1207, width: 3 } },
            });
            t.anchor.set(0.5, 1);
            t.position.set(0, -26);
            c.addChild(t);
            c.position.set(p.x, p.y);
            c.zIndex = p.y + 1;
            return c;
        }

        // Иконка-кнопка HUD (настройки/колода) — как в подземелье
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
            panel.scale.set(1.05);
            panel.eventMode = "static"; // «хром» HUD: клики не двигают героя
            c.addChild(panel);
            const style = { fontFamily: "Kereru", fontSize: 27, fill: 0xf3e6c2 };
            const titleT = new PIXI.Text({ text: GAME_LOC.t("world.title"), style });
            titleT.position.set(39, 15);
            globalThis.GAME_UI.fit(titleT, 165, 11); // не наезжает на HP
            const hpT = new PIXI.Text({ text: "", style });
            hpT.position.set(219, 15);
            c.addChild(titleT, hpT);
            const goldPlate = new PIXI.Container();
            const gpanel = new PIXI.Sprite(uiTex("panel_label.png"));
            gpanel.scale.set(0.62);
            gpanel.eventMode = "static";
            goldPlate.addChild(gpanel);
            const gicon = new PIXI.Sprite(uiTex("icon_gold.png"));
            gicon.anchor.set(0.5);
            gicon.scale.set(0.46);
            gicon.position.set(27, 27);
            goldPlate.addChild(gicon);
            const goldT = new PIXI.Text({ text: "0", style });
            goldT.position.set(50, 13);
            goldPlate.addChild(goldT);
            goldPlate.position.set(0, 96);
            c.addChild(goldPlate);
            // настройки и колода доступны и из мира; «Назад» вернёт сюда
            c.addChild(hudIcon("icon_setting.png", 1839, 66, () => {
                G.uiReturn = "world";
                scenes.go("settings");
            }));
            c.addChild(hudIcon("card_back_small.png", 1839, 162, () => {
                G.uiReturn = "world";
                scenes.go("deck");
            }, 0.675));
            const hint = new PIXI.Text({
                text: GAME_LOC.t("world.hint"),
                style: { fontFamily: "Kereru", fontSize: 22, fill: 0xbfae87 },
            });
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 1050);
            c.addChild(hint);
            c.userData = { hpT, goldT };
            return c;
        }

        // Вход в подземелье: продолжить текущий этаж ЭТОГО данжа (состояния
        // этажей хранит G.dungeonStates — враги/объекты как их оставили)
        // или начать его первый. Герой прибывает к старту этажа (у лестницы).
        // У каждого подземелья своя глубина (G.run.floors).
        function enterCave(cave) {
            const caveId = globalThis.GAME_DATA.CAVES[cave] ? cave : "gob";
            if (heroId !== null) {
                G.world.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
            }
            // уходим в ДРУГОЙ данж — текущий этаж архивируется, чтобы
            // прогресс (враги/объекты/позиция) не потерялся
            if (G.dungeon && G.dungeon.v === globalThis.GAME_DUNGEON.MAP_V
                && G.dungeon.cave !== caveId) {
                G.dungeonStates[(G.dungeon.cave || "gob") + ":" + G.dungeon.floor] = G.dungeon;
            }
            if (G.run.cave !== caveId) {
                G.run.cave = caveId;
                G.run.floor = (G.run.floors || (G.run.floors = {}))[caveId] || 1;
            }
            // архив этажей другой геометрии (v≠MAP_V) не поднимается —
            // stateFor отдаст свежий этаж текущей сетки
            const st = globalThis.GAME_DUNGEON.stateFor(G.dungeonStates, caveId, G.run.floor);
            st.cave = caveId;
            if (st.spawn) st.heroPos = { ...st.spawn }; // прибытие к лестнице
            st.exitCool = false;
            G.dungeon = st;
            if (ctx.sfx) ctx.sfx();
            scenes.go("dungeon");
        }

        return {
            enter() {
                if (ctx.music) ctx.music("menu"); // трек мира (пока общий с меню)
                ctx.collide.rows = ROWS; // коллизии героя — по карте мира
                ctx.collide.ts = 40; // после подземелья (клетка 64) — вернуть шаг мира
                const cave = findCh("C"), spawn = findCh("W"), grove = findCh("G");
                // точка появления: вышедший из подземелья герой стоит у входа
                // ТОГО данжа; сохранившаяся позиция у самого входа не должна
                // мгновенно сработать триггер — ставим клеткой левее
                const nearCave = (p) => [cave, grove].some((cv) =>
                    Math.hypot(p.x - cv.x, p.y - cv.y) < TS * 1.2);
                let hp = G.world.heroPos ? { ...G.world.heroPos } : null;
                if (G.world.out) {
                    const at = G.world.outCave === "grw" ? grove : cave;
                    hp = { x: at.x - TS, y: at.y };
                    G.world.out = false;
                }
                else if (!hp) hp = { ...spawn };
                else if (nearCave(hp)) {
                    const at = Math.hypot(hp.x - grove.x, hp.y - grove.y)
                        < Math.hypot(hp.x - cave.x, hp.y - cave.y) ? grove : cave;
                    hp = { x: at.x - TS, y: at.y };
                }
                G.world.heroPos = { ...hp };

                layer = new PIXI.Container();
                layer.sortableChildren = true;
                const zone = new PIXI.Graphics();
                zone.rect(0, 0, W * TS, H * TS);
                zone.fill({ color: 0xffffff, alpha: 0.001 });
                zone.eventMode = "static";
                zone.on("pointertap", (e) => {
                    if (heroId === null) return;
                    const p = zone.toLocal(e.global);
                    const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                    const next = bfsPath(Math.floor(hx / TS), Math.floor(hy / TS),
                        Math.floor(p.x / TS), Math.floor(p.y / TS));
                    if (next) path = next;
                });
                layer.addChild(zone);
                layer.addChild(buildMapGfx());
                layer.addChild(makeCave("C", "world.cave"));
                layer.addChild(makeCave("G", "world.caveGrowth"));
                worldContainer.addChild(layer);

                // герой — лист по стихии забега (Рост — эльф, Сила — гоблин)
                ctx.heroSheet = ctx.heroSheets[G.elem] || ctx.heroSheets.strength;
                const sprite = new PIXI.AnimatedSprite(ctx.heroSheet.animations.walk_front, false);
                sprite.anchor.set(0.5, 1);
                sprite.scale.set(0.25); // лист 256px — рост как у рыцаря 64px
                heroId = characters.spawn({
                    x: hp.x, y: hp.y, sprite, anims: ctx.heroSheet.animations,
                    speed: 170, fps: ctx.heroSheet.fps, halfW: 7, halfH: 5,
                });
                ECS.addComponent(world, heroId, "ctrlVI", 0);
                ECS.addComponent(world, heroId, "ctrlVJ", 0);
                // тень под героем (просил юзер): эллипс на точке ног
                heroShadow = new PIXI.Graphics();
                heroShadow.ellipse(0, 0, 12, 5.5);
                heroShadow.fill({ color: 0x0e140c, alpha: 0.45 });
                heroShadow.position.set(hp.x, hp.y - 0.7 * 5.5 * 2); // приподнята на 0.7 высоты (просил юзер)
                heroShadow.zIndex = hp.y - 0.5;
                layer.addChild(heroShadow);
                layer.addChild(sprite);
                worldContainer.visible = true;
                camera.follow({
                    get x() { return heroId !== null ? COMPONENTS.positionX[heroId] : hp.x; },
                    get y() { return heroId !== null ? COMPONENTS.positionY[heroId] : hp.y; },
                }, 8);
                camera.setBounds({ x: 0, y: 0, width: W * TS, height: H * TS });
                camera.setZoom(2.1);
                camera.centerOn(hp.x, hp.y);
                uiHud = buildHud();
                ctx.ui.addChild(uiHud);
            },
            exit() {
                if (heroId !== null) {
                    G.world.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
                }
                // забег сохраняется и из мира (вход в пещеру/меню/настройки)
                if (G.saveRun) G.saveRun();
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
                heroShadow = null;
                path = null;
                if (layer) { layer.destroy({ children: true }); layer = null; }
                if (uiHud) { uiHud.destroy({ children: true }); uiHud = null; }
                worldContainer.visible = false;
            },
            update(ticker) {
                if (heroId === null || !uiHud) return;
                const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                heroShadow.position.set(hx, hy - 0.7 * 5.5 * 2);
                heroShadow.zIndex = hy - 0.5;

                // скорость анимаций из настроек (0..10; 5 = скорость листа) —
                // живая, как в бою и подземелье (просил юзер)
                COMPONENTS.animationSpeed[heroId] = (ctx.heroSheet.animationSpeed || 0.2)
                    * Math.max(0.25, ((G.settings && G.settings.animSpeed) ?? 5) / 5);

                // ведение по пути (как в подземелье: клавиши главнее)
                if (path && (charInput.ix || charInput.iy)) path = null;
                if (path && !path.length) path = null;
                if (path) {
                    const dx = path[0].x - hx, dy = path[0].y - hy;
                    if (Math.hypot(dx, dy) < 5) {
                        const last = path.length === 1 ? path[0] : null;
                        path.shift();
                        if (!path.length) {
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
                    setHeroAxes(charInput.ix, charInput.iy);
                }

                uiHud.userData.hpT.text = GAME_LOC.t("dungeon.hp", { hp: G.hero.hp, max: G.hero.maxHp });
                uiHud.userData.goldT.text = String(G.gold);
                globalThis.GAME_UI.fit(uiHud.userData.hpT, 128, 11);

                // входы в подземелья — касание арки
                for (const [ch, caveId] of Object.entries(CAVES_ON_MAP)) {
                    const at = findCh(ch);
                    if (Math.hypot(at.x - hx, at.y - hy) < TS * 0.85) {
                        enterCave(caveId);
                        return;
                    }
                }
            },
            ROWS,
            heroId: () => heroId,
            // ── тесты: геометрия мира и программный вход в пещеру ─────────
            api: {
                info: () => {
                    const hero = heroId !== null
                        ? { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] }
                        : { ...G.world.heroPos };
                    return {
                        heroPos: hero, spawn: findCh("W"),
                        cave: findCh("C"), grove: findCh("G"),
                    };
                },
                setHeroPos(x, y) {
                    if (heroId === null) return false;
                    COMPONENTS.positionX[heroId] = x;
                    COMPONENTS.positionY[heroId] = y;
                    return true;
                },
                enterCave: (cave) => enterCave(cave),
                path: () => path,
                worldToScreen: (x, y) => (layer ? layer.toGlobal({ x, y }) : null),
            },
        };
    }

    globalThis.GAME_WORLD = { createWorldScene, ROWS };
})();
