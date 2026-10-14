// БУТ «Подземелье призывателей»: движок → ассеты → шрифт → мета/настройки →
// сцены → меню. UI-корень 1280×720 вписывается в окно (letterbox).
// Коллекция/колода/настройки живут в localStorage (meta.js) и переживают
// забеги; язык применяется через loc.js при старте и смене в настройках.
(async function () {
    const boot = document.getElementById("boot");
    const say = (m) => { boot.textContent = m; };
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    if (location.protocol === "file:") {
        say("Игра грузит ассеты fetch-ем — по file:// не работает.\n" +
            "Запустите:  python dev_server.py 8147\n" +
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
        // фоны арен с нарисованной сеткой поля
        uiTextures["scenes/1.png"] = await assets.loadTexture("./images/scenes/1.png");
        uiTextures["scenes/2.png"] = await assets.loadTexture("./images/scenes/2.png");
        const uiTex = (name) => {
            const t = uiTextures[name];
            if (!t) throw new Error(`нет текстуры ui/${name}`);
            return t;
        };
        say("спрайты…");
        await frame();
        const knight = await assets.loadCharacter("./images/sprites/knight_64");
        // Листы существ поля боя. Стандарт: <имя>_256.png — сетка 256×256,
        // 4 ряда анимаций (спереди/сзади/справа/слева) по 6 кадров + json-манифест.
        // Пока один лист на всех существ; новые добавлять сюда записью.
        const creatureSheets = {
            goblin: await assets.loadCharacter("./images/sprites/goblin_256"),
        };

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

        // ── Настройки и мета (localStorage) ────────────────────────────────
        const settings = GAME_META.loadSettings();
        GAME_LOC.setLang(settings.lang);
        const savedMeta = GAME_META.loadMeta();
        const { DEFAULT_DECK, DEFAULT_COLLECTION } = GAME_DATA;

        // ── Звук: мастер движка = ползунок «звук»; клики UI ────────────────
        const audio = createAudio();
        audio.setVolume(settings.sound / 10);

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
            settings,
            deck: savedMeta ? savedMeta.deck.filter((id) => GAME_DATA.CARDS[id]) : [...DEFAULT_DECK],
            collection: savedMeta ? savedMeta.collection : { ...DEFAULT_COLLECTION },
            dungeon: null, activeEnemy: null, battle: null,
            resetRun() {
                // забег сбрасывается, коллекция/колода/настройки — нет
                this.hero.hp = this.hero.maxHp;
                this.gold = 0;
                this.run.floor = 1;
                this.dungeon = null;
                this.activeEnemy = null;
                this.battle = null;
            },
        };
        if (!G.deck.length) G.deck = [...DEFAULT_DECK];

        const ctx = {
            app, world, ECS, COMPONENTS, DATA, worldContainer, addSystem,
            assets, uiTex, scheduler, input, camera, characters, knight, creatureSheets, G, ui, audio,
            sfx() {
                try {
                    audio.unlock();
                    audio.tone({ freq: 660, dur: 0.045, type: "triangle", volume: 0.3 });
                } catch (e) { /* аудио может быть недоступно до жеста */ }
            },
        };

        const scenes = createScenes({ addSystem });
        ctx.scenes = scenes;
        const t = (k, v) => GAME_LOC.t(k, v);

        // ── Сцена «Меню» ───────────────────────────────────────────────────
        let menuRoot = null;
        const T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });
        function menuButton(texName, label, x, y, scale, onTap) {
            return globalThis.GAME_UI.button(ctx, { tex: texName, label, x, y, scale, onTap });
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

                const t1 = T(t("menu.title1"), 74, 0xf0c96a, { stroke: { color: 0x241505, width: 10 } });
                t1.anchor.set(0.5, 1);
                t1.position.set(640, 138);
                const t2 = T(t("menu.title2"), 74, 0xf0c96a, { stroke: { color: 0x241505, width: 10 } });
                t2.anchor.set(0.5, 0);
                t2.position.set(640, 146);
                t1.eventMode = "none"; t2.eventMode = "none";
                menuRoot.addChild(t1, t2);
                const sub = T(t("menu.subtitle"), 19, 0xd8c79d);
                sub.anchor.set(0.5, 0);
                sub.position.set(640, 222);
                sub.eventMode = "none";
                menuRoot.addChild(sub);

                menuRoot.addChild(menuButton("button_1.png", t("menu.play"), 640, 366, 1.18,
                    () => { G.resetRun(); scenes.go("dungeon"); }));
                menuRoot.addChild(menuButton("button_stone.png", t("menu.deck"), 640, 462, 0.92,
                    () => scenes.go("deck")));
                menuRoot.addChild(menuButton("button_stone.png", t("menu.settings"), 640, 542, 0.92,
                    () => scenes.go("settings")));
                menuRoot.addChild(menuButton("button_red.png", t("menu.exit"), 640, 622, 0.92,
                    () => { menuRoot.userData.bye.visible = true; }));

                const bye = T(t("menu.bye"), 24, 0xffe2a8, { stroke: { color: 0x1c1207, width: 5 } });
                bye.anchor.set(0.5);
                bye.position.set(640, 688);
                bye.visible = false;
                bye.eventMode = "none";
                menuRoot.addChild(bye);
                menuRoot.userData = { bye };
                const ver = T("v0.2 · zero_engine", 14, 0x8a7c5e);
                ver.position.set(12, 700);
                ver.eventMode = "none";
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
                const ft = T(t("floorWin.title", { n: G.run.floor - 1 }), 36, 0xffe9b0, { stroke: { color: 0x1c1207, width: 7 } });
                ft.anchor.set(0.5);
                ft.position.set(640, 252);
                ft.eventMode = "none";
                fwRoot.addChild(ft);
                fwRoot.addChild(menuButton("button_stone.png", t("floorWin.next"), 640, 386, 0.95,
                    () => scenes.go("dungeon")));
                fwRoot.addChild(menuButton("button_red.png", t("floorWin.menu"), 640, 486, 0.95,
                    () => { G.resetRun(); scenes.go("menu"); }));
                ui.addChild(fwRoot);
            },
            exit() {
                if (fwRoot) { fwRoot.destroy({ children: true }); fwRoot = null; }
            },
        });

        // ── Подземелье, арена, колода, награда, настройки ──────────────────
        const dungeonScene = GAME_DUNGEON.createDungeonScene(ctx);
        scenes.add("dungeon", dungeonScene);
        const arenaScene = GAME_ARENA.createArenaScene(ctx);
        scenes.add("arena", arenaScene);
        const deckScene = GAME_DECK.createDeckScene(ctx);
        scenes.add("deck", deckScene);
        const rewardScene = GAME_REWARD.createRewardScene(ctx);
        scenes.add("reward", rewardScene);
        const settingsScene = GAME_SETTINGS_SCENE.createSettingsScene(ctx);
        scenes.add("settings", settingsScene);

        // ── Конец кадра: планировщик после сцен, ввод в самом конце ────────
        addSystem((ticker) => {
            scheduler.update(ticker.deltaMS);
            input.endFrame();
        });

        // ── Хендл для консоли и автотестов ─────────────────────────────────
        window.__GAME = {
            scenes, G, ui, loc: GAME_LOC,
            dungeon: dungeonScene, arena: arenaScene,
            arenaApi: arenaScene.api, deckApi: deckScene.api,
            rewardApi: rewardScene.api, settingsApi: settingsScene.api,
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
                lang: GAME_LOC.lang,
                deck: { size: G.deck.length, cards: [...G.deck] },
                collection: { ...G.collection },
                settings: { ...G.settings },
                dungeon: G.dungeon ? {
                    enemies: G.dungeon.enemies.filter((e) => e.alive).length,
                    bossDead: G.dungeon.bossDead,
                } : null,
                battle: G.battle ? arenaScene.api.state() : null,
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
