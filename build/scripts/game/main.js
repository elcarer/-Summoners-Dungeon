// БУТ «Подземелье призывателей»: движок → ассеты → шрифт → сцены → меню.
// Все сцены (кроме подземелья с ECS-миром) рисуются в UI-корне 1280×720,
// который вписывается в окно с сохранением пропорций (letterbox).
(async function () {
    const boot = document.getElementById("boot");
    const say = (m) => { boot.textContent = m; };
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    if (location.protocol === "file:") {
        say("Игра грузит ассеты fetch-ем — по file:// не работает.\n" +
            "Запустите:  python nocache-server.py 8147\n" +
            "и откройте  http://127.0.0.1:8147/index.html");
        return;
    }
    window.addEventListener("error", (e) => { window.__gameError = String(e.message); });
    window.addEventListener("unhandledrejection", (e) => { window.__gameError = String(e.reason); });

    try {
        say("ядро движка…");
        await frame();
        const engine = await init();
        const { app, world, ECS, COMPONENTS, DATA, worldContainer, addSystem } = engine;

        // ── Игровой шрифт ──────────────────────────────────────────────────
        say("шрифт…");
        const font = new FontFace("Kereru", "url(./font/Kereru.otf)");
        await font.load();
        document.fonts.add(font);

        // ── Ассеты: UI-кит + рыцарь-заглушка ───────────────────────────────
        const assets = createAssets();
        const UI_FILES = [
            "arc_rune", "bg_corridor_1", "bg_corridor_2", "board", "button_1", "button_attack",
            "button_end", "button_red", "button_stone", "card_back_min", "card_back_screen",
            "card_back_small", "icon_bag", "icon_gold", "icon_map", "icon_rune", "icon_setting",
            "panel_1", "panel_2", "panel_allert", "panel_buff", "panel_buff_circle",
            "panel_down", "panel_label", "panel_minimap", "panel_skill", "panel_top",
            "portrate_hero", "sign_mana", "sign_shield",
        ];
        say("арт интерфейса…");
        await frame();
        const uiTextures = {};
        for (const name of UI_FILES) {
            uiTextures[`${name}.png`] = await assets.loadTexture(`./images/ui/${name}.png`);
        }
        const uiTex = (name) => {
            const t = uiTextures[name];
            if (!t) throw new Error(`нет текстуры ui/${name}`);
            return t;
        };
        say("спрайты…");
        await frame();
        const knight = await assets.loadCharacter("./images/sprites/knight_64");

        // ── UI-корень 1280×720 с вписыванием в окно ────────────────────────
        const ui = new PIXI.Container();
        app.stage.addChild(ui);
        function fitUi() {
            const s = Math.min(app.screen.width / 1280, app.screen.height / 720);
            ui.scale.set(s);
            ui.x = (app.screen.width - 1280 * s) / 2;
            ui.y = (app.screen.height - 720 * s) / 2;
        }
        fitUi();
        app.renderer.on("resize", fitUi);

        // ── Общий контекст для сцен ────────────────────────────────────────
        const scheduler = createScheduler();
        const input = createInput();
        const camera = createCamera({ app, container: worldContainer, addSystem });

        const DROWS = GAME_DUNGEON.ROWS, DTS = 40;
        const DW = DROWS[0].length, DH = DROWS.length;
        function blocked(px, py) {
            const gx = Math.floor(px / DTS), gy = Math.floor(py / DTS);
            if (gx < 0 || gy < 0 || gx >= DW || gy >= DH) return true;
            return DROWS[gy][gx] === "#";
        }
        const characters = createCharacterSystem({
            world, ECS, COMPONENTS, DATA, blocked, input: createCharacterInput(), addSystem,
        });

        const G = {
            hero: { hp: 10, maxHp: 10 }, gold: 0,
            run: { floor: 1 },
            deck: [...GAME_DATA.PLAYER_DECK],
            dungeon: null, activeEnemy: null, battle: null,
            resetRun() {
                this.hero.hp = this.hero.maxHp;
                this.gold = 0;
                this.run.floor = 1;
                this.deck = [...GAME_DATA.PLAYER_DECK];
                this.dungeon = null;
                this.activeEnemy = null;
                this.battle = null;
            },
        };

        const ctx = { app, world, ECS, COMPONENTS, DATA, worldContainer, addSystem,
                      assets, uiTex, scheduler, input, camera, characters, knight, G, ui };

        const scenes = createScenes({ addSystem });
        ctx.scenes = scenes;

        // ── Сцена «Меню» ───────────────────────────────────────────────────
        let menuRoot = null;
        const T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });
        function menuButton(texName, label, x, y, scale, onTap) {
            const c = new PIXI.Container();
            const sp = new PIXI.Sprite(uiTex(texName));
            sp.anchor.set(0.5);
            sp.scale.set(scale);
            c.addChild(sp);
            const t = T(label, 20, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4 } });
            t.anchor.set(0.5);
            c.addChild(t);
            c.position.set(x, y);
            c.eventMode = "static";
            c.cursor = "pointer";
            c.on("pointertap", onTap);
            return c;
        }
        scenes.add("menu", {
            enter() {
                menuRoot = new PIXI.Container();
                menuRoot.eventMode = "static";
                const bg = new PIXI.Sprite(uiTex("bg_corridor_1.png"));
                const s = Math.max(1280 / bg.texture.width, 720 / bg.texture.height);
                bg.scale.set(s);
                bg.position.set((1280 - bg.texture.width * s) / 2, (720 - bg.texture.height * s) / 2);
                menuRoot.addChild(bg);

                const t1 = T("ПОДЗЕМЕЛЬЕ", 78, 0xf0c96a, { stroke: { color: 0x241505, width: 10 } });
                t1.anchor.set(0.5, 1);
                t1.position.set(640, 168);
                const t2 = T("ПРИЗЫВАТЕЛЕЙ", 78, 0xf0c96a, { stroke: { color: 0x241505, width: 10 } });
                t2.anchor.set(0.5, 0);
                t2.position.set(640, 176);
                menuRoot.addChild(t1, t2);
                const sub = T("карточный рогалик о спуске в глубину", 20, 0xd8c79d);
                sub.anchor.set(0.5);
                sub.position.set(640, 252);
                menuRoot.addChild(sub);

                menuRoot.addChild(menuButton("button_1.png", "ВОЙТИ", 640, 420, 1.25, () => {
                    G.resetRun();
                    scenes.go("dungeon");
                }));
                const bye = T("До встречи в глубине…", 26, 0xffe2a8, { stroke: { color: 0x1c1207, width: 5 } });
                bye.anchor.set(0.5);
                bye.position.set(640, 646);
                bye.visible = false;
                menuRoot.addChild(bye);
                menuRoot.addChild(menuButton("button_stone.png", "ВЫХОД", 640, 566, 1.0, () => {
                    bye.visible = true;
                }));
                const ver = T("v0.1 · zero_engine", 14, 0x8a7c5e);
                ver.position.set(12, 700);
                menuRoot.addChild(ver);
                ui.addChild(menuRoot);
                worldContainer.visible = false;
            },
            exit() {
                if (menuRoot) { menuRoot.destroy({ children: true }); menuRoot = null; }
            },
        });

        // ── Сцена «Этаж пройден» ───────────────────────────────────────────
        let fwRoot = null;
        scenes.add("floorWin", {
            enter() {
                fwRoot = new PIXI.Container();
                fwRoot.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(0, 0, 1280, 720);
                dim.fill({ color: 0x000000, alpha: 0.65 });
                fwRoot.addChild(dim);
                const panel = new PIXI.Sprite(uiTex("panel_allert.png"));
                panel.anchor.set(0.5);
                panel.scale.set(1.5);
                panel.position.set(640, 290);
                fwRoot.addChild(panel);
                const t = T(`ЭТАЖ ${G.run.floor - 1} ПРОЙДЕН!`, 38, 0xffe9b0, { stroke: { color: 0x1c1207, width: 7 } });
                t.anchor.set(0.5);
                t.position.set(640, 252);
                fwRoot.addChild(t);
                fwRoot.addChild(menuButton("button_stone.png", "Спуститься ниже", 640, 386, 1.0, () => {
                    scenes.go("dungeon");
                }));
                fwRoot.addChild(menuButton("button_red.png", "В меню", 640, 486, 1.0, () => {
                    G.resetRun();
                    scenes.go("menu");
                }));
                ui.addChild(fwRoot);
            },
            exit() {
                if (fwRoot) { fwRoot.destroy({ children: true }); fwRoot = null; }
            },
        });

        // ── Подземелье и арена ─────────────────────────────────────────────
        const dungeonScene = GAME_DUNGEON.createDungeonScene(ctx);
        scenes.add("dungeon", dungeonScene);
        const arenaScene = GAME_ARENA.createArenaScene(ctx);
        scenes.add("arena", arenaScene);

        // ── Конец кадра: планировщик после сцен, ввод в самом конце ────────
        addSystem((ticker) => {
            scheduler.update(ticker.deltaMS);
            input.endFrame();
        });

        // ── Хендл для консоли и автотестов ─────────────────────────────────
        window.__GAME = {
            scenes, G, ui,
            dungeon: dungeonScene, arena: arenaScene, arenaApi: arenaScene.api,
            toScreen: (x, y) => ({ x: ui.x + x * ui.scale.x, y: ui.y + y * ui.scale.y }),
            test: {
                COMPONENTS,
                setHeroPos(x, y) {
                    const id = dungeonScene.heroId();
                    if (id === null) return false;
                    COMPONENTS.positionX[id] = x;
                    COMPONENTS.positionY[id] = y;
                    return true;
                },
            },
            stats: () => ({
                scene: scenes.current,
                hero: { ...G.hero }, floor: G.run.floor,
                heroPos: (() => {
                    const id = dungeonScene.heroId();
                    return id !== null ? { x: COMPONENTS.positionX[id], y: COMPONENTS.positionY[id] } : null;
                })(),
                dungeon: G.dungeon ? {
                    enemies: G.dungeon.enemies.filter((e) => e.alive).length,
                    bossDead: G.dungeon.bossDead,
                } : null,
                battle: G.battle ? {
                    phase: G.battle.phase, turn: G.battle.turnNo,
                    mana: G.battle.mana, hand: [...G.battle.hand],
                    pBase: G.battle.playerBase, eBase: G.battle.enemyBase,
                    units: G.battle.units.map((u) => `${u.side}:${u.def.name}@${u.col},${u.row} hp${u.hp}`),
                    result: G.battle.result,
                } : null,
                error: window.__gameError || null,
            }),
            ready: true,
        };
        scenes.go("menu");
        say("");
        boot.remove();
        console.log("[game] готово:", window.__GAME.stats());
    } catch (err) {
        say("Ошибка загрузки: " + (err && err.message));
        window.__gameError = String((err && err.stack) || err);
        console.error(err);
    }
})();
