// БУТ «Подземелье призывателей»: движок → ассеты → шрифт → мета/настройки →
// сцены → меню. Базовое разрешение UI — 1920×1080, все координаты
// интерфейса заданы прямо в нём; вписывается в окно (letterbox).
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
            "button_end", "button_menu", "card_back_min", "card_back_screen",
            "card_back_small", "icon_bag", "icon_boss", "icon_down", "icon_enemy",
            "icon_gold", "icon_map", "icon_rune", "icon_setting", "icon_shop",
            "panel_1", "panel_2", "panel_allert", "panel_buff", "panel_buff_circle",
            "panel_down", "panel_label", "panel_minimap", "panel_skill", "panel_top",
            "portrate_hero", "sign_mana", "sign_shield",
            "UI_cards_hand", "UI_energy",
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
        // эффект поля «Стена костров» и рубашка колоды врага (гоблины/природа)
        uiTextures["effects/fire.png"] = await assets.loadTexture("./images/effects/fire.png");
        uiTextures["card_goblin_back.png"] = await assets.loadTexture("./images/ui/card_goblin_back.png");
        uiTextures["card_nature_back.png"] = await assets.loadTexture("./images/ui/card_nature_back.png");
        // тайлы подземелья юзера: images/dungeon_tiles/<…>.png — полы,
        // стены (кап/лицо), тень, декор (факелы/окошки/щебёнка/лестницы)
        say("тайлы подземелья…");
        await frame();
        for (const f of ["floor_0", "floor_1", "floor_2", "floor_3", "floor_4",
            "floor_5", "floor_6", "floor_7", "floor_8", "wall_top_0", "wall_top_1",
            "wall_top_2", "wall_top_3", "wall_face_0", "wall_face_1", "wall_face_2",
            "wall_face_3", "shadow", "door_gate", "wall_torch", "wall_window_a",
            "wall_window_b", "stair_a", "stair_b", "stair_c", "rubble_0", "rubble_1",
            "rubble_2", "rubble_3", "prop_barrel", "prop_crates", "prop_crate"]) {
            uiTextures[`dungeon_tiles/${f}.png`] =
                await assets.loadTexture(`./images/dungeon_tiles/${f}.png`);
        }
        // лица карт стихий: images/cards/<elem>/<№>.png (def.img в dataCards)
        say("карты…");
        await frame();
        for (const def of Object.values(GAME_DATA.CARDS)) {
            if (def.img) uiTextures[`cards/${def.img}.png`] =
                await assets.loadTexture(`./images/cards/${def.img}.png`);
        }
        // логотипы стихий (кнопки фильтров): images/ui/logo/<…>.png
        say("стихии…");
        await frame();
        for (const file of Object.values(GAME_DATA.ELEM_LOGO)) {
            if (!uiTextures[file]) uiTextures[file] = await assets.loadTexture(`./images/ui/${file}`);
        }
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

        // ── UI-корень: базовое разрешение 1920×1080, вписывается в окно ────
        // (просил юзер). Все сцены и спрайты рассчитаны на эти координаты
        // напрямую: button_menu.png — натуральные 274×77, карты руки —
        // картинка 230×338 в масштабе 1 и т.д.
        const ui = new PIXI.Container();
        app.stage.addChild(ui);
        function fitUi() {
            const s = Math.min(app.screen.width / 1920, app.screen.height / 1080);
            ui.scale.set(s);
            ui.x = (app.screen.width - 1920 * s) / 2;
            ui.y = (app.screen.height - 1080 * s) / 2;
        }
        fitUi();
        app.renderer.on("resize", fitUi);

        // ── Настройки и мета (localStorage) ────────────────────────────────
        const settings = GAME_META.loadSettings();
        GAME_LOC.setLang(settings.lang);
        const savedMeta = GAME_META.loadMeta();
        const { DEFAULT_DECK, DEFAULT_COLLECTION } = GAME_DATA;

        // ── Звук: два канала движка — эффекты («звук») и музыка («музыка») ──
        const audio = createAudio();
        audio.setVolume(settings.sound / 10);
        audio.setMusicVolume(settings.music / 10);

        // Файлы из build/sound: sfx-эффекты боя/UI + музыка сцен.
        // Музыка грузится лениво при первом вызове music() (треки тяжёлые);
        // короткие sfx предзагружаются сразу, фоном.
        const SFX_FILES = {
            menu: "menu.mp3",      // клики UI
            chpoc: "chpoc.mp3",    // добор карты / сброс
            use: "use.mp3",        // призыв существа/строения
            mine: "mine.mp3",      // установка ловушки
            sword: "sword.mp3",    // атака существом
            dam: "dam.mp3",        // урон (прочие источники)
            acid: "acid.mp3",      // сработала ловушка
            rocket: "rocket.mp3",  // заклинание-снаряд
            up: "up.mp3",          // усиление (+ к урону)
            die: "die.mp3",        // гибель существа / поражение
            crash: "crash.mp3",    // удар по базе
            step: "step.mp3",      // шаг существа (марш/рывок)
            aqua: "aqua.mp3",      // шкала: +энергия в конце хода
            coins: "coins.mp3",    // выбор трофея
            lvlUp: "lvlUp.mp3",    // победа
            openRoom: "openRoom.mp3", // начало боя
        };
        // Тихие/частые звуки — множитель поверх ползунка «звук»
        const SFX_VOL = {
            menu: 0.7, step: 0.45, chpoc: 0.9, dam: 0.8, use: 1.0, sword: 0.9,
            die: 0.9, crash: 1.0, up: 0.85, mine: 0.9, acid: 0.9, rocket: 0.85,
            aqua: 0.8, coins: 0.9, lvlUp: 1.0, openRoom: 0.8,
        };
        const MUSIC_FILES = {
            menu: "CoinCreek.mp3",
            dungeon: "Hearthside Tankard R1.mp3",
            battle: "Dungeon Run.mp3",
        };
        for (const [name, file] of Object.entries(SFX_FILES)) {
            audio.registerFile(name, "./sound/" + encodeURI(file));
        }
        for (const [name, file] of Object.entries(MUSIC_FILES)) {
            audio.registerFile("music:" + name, "./sound/" + encodeURI(file));
        }
        audio.preload(Object.keys(SFX_FILES));
        // Аудио разрешён только после жеста юзера — ловим любой
        const unlockAudio = () => { try { audio.unlock(); } catch (e) { /* нет WebAudio */ } };
        window.addEventListener("pointerdown", unlockAudio);
        window.addEventListener("keydown", unlockAudio);
        const sfxCounts = {};
        const gameSfx = (name) => {
            const key = name || "menu";
            sfxCounts[key] = (sfxCounts[key] || 0) + 1;
            audio.playFile(key, SFX_VOL[key] !== undefined ? SFX_VOL[key] : 1);
        };
        const gameMusic = (name) => { audio.music(name); };

        // ── Общий контекст для сцен ────────────────────────────────────────
        const scheduler = createScheduler();
        const input = createInput();
        const camera = createCamera({ app, container: worldContainer, addSystem });

        // Коллизии героя (character-система) — по карте АКТИВНОЙ сцены:
        // подземелье и открытый мир подменяют collide.rows при входе,
        // а также шаг клетки (мир — 40px, подземелье — 56px тайлы)
        const collide = { rows: GAME_DUNGEON.ROWS, ts: 40 };
        function blocked(px, py) {
            const gx = Math.floor(px / collide.ts), gy = Math.floor(py / collide.ts);
            const rows = collide.rows;
            if (gy < 0 || gy >= rows.length || gx < 0 || gx >= rows[0].length) return true;
            const ch = rows[gy][gx];
            return ch === "#" || ch === "~"; // стены и вода непроходимы
        }
        // Инстанс ввода героя наружу: подземелье читает оси (клик-перемещение
        // отдаёт герою виртуальные оси, а без пути просто повторяет эти)
        const charInput = createCharacterInput();
        const characters = createCharacterSystem({
            world, ECS, COMPONENTS, DATA, blocked, input: charInput, addSystem,
        });

        // Миграция сейва: карты прошлых версий (тестовые id) отфильтровываются;
        // если после фильтра колода/коллекция пусты — новые базовые значения.
        const savedDeck = savedMeta ? savedMeta.deck.filter((id) => GAME_DATA.CARDS[id]) : [];
        const savedColl = savedMeta
            ? Object.fromEntries(Object.entries(savedMeta.collection || {})
                .filter(([id]) => GAME_DATA.CARDS[id]))
            : {};

        const G = {
            hero: { hp: 10, maxHp: 10 }, gold: 0,
            run: { floor: 1, cave: "gob", floors: { gob: 1, grw: 1 } },
            elem: "strength", // стихия забега — задаёт стартовую колоду
            settings,
            deck: savedDeck.length ? savedDeck : [...DEFAULT_DECK],
            collection: Object.keys(savedColl).length ? savedColl : { ...DEFAULT_COLLECTION },
            dungeon: null, activeEnemy: null, battle: null,
            world: { heroPos: null, out: false }, // открытый мир: где герой
            dungeonStates: {}, // этажи подземелий, ключ «данж:этаж» (gob:1, grw:2…)
            // (враги/объекты этажа остаются как их оставили),
            rewardDeck: null, // колода побеждённого — пул трофея «1 из 3»
            rewardDraft: false, // трофей — выбор из всей драфт-колоды (драфт)
            draft: null, // мини-игра «Карта сокровищ»: picks/ePicks/objIdx
            draftBattle: false, // текущий бой — драфт-бой (итог ведёт в подземелье)
            uiReturn: null, // откуда открыты настройки/колода (кнопка «Назад»)
            resetRun(elem) {
                // новая игра — забег И коллекция/колода с нуля (просил юзер:
                // после кнопки оставалась прокачанная коллекция). Стихия
                // задаёт стартовую колоду (выбор в меню «Новая игра»)
                const el = globalThis.GAME_DATA.STARTER_DECKS[elem] ? elem : "strength";
                this.elem = el;
                this.hero.hp = this.hero.maxHp;
                this.gold = 0;
                this.run = { floor: 1, cave: "gob", floors: { gob: 1, grw: 1 } };
                this.dungeon = null;
                this.world = { heroPos: null, out: false };
                this.dungeonStates = {};
                this.activeEnemy = null;
                this.battle = null;
                this.rewardDeck = null;
                this.rewardDraft = false;
                this.draft = null;
                this.draftBattle = false;
                this.deck = [...globalThis.GAME_DATA.STARTER_DECKS[el]];
                this.collection = { ...globalThis.GAME_DATA.STARTER_COLLECTIONS[el] };
                globalThis.GAME_META.saveMeta(this.collection, this.deck);
            },
            // сейв забега (sd_run): этаж, герой, золото, подземелье целиком —
            // «Продолжить» в меню поднимает его (dungeon — простые данные,
            // переживают JSON)
            saveRun() {
                globalThis.GAME_META.saveRun({
                    floor: this.run.floor,
                    cave: this.run.cave,
                    floors: { ...this.run.floors },
                    elem: this.elem,
                    hero: { hp: this.hero.hp, maxHp: this.hero.maxHp },
                    gold: this.gold,
                    dungeon: this.dungeon ? JSON.parse(JSON.stringify(this.dungeon)) : null,
                    dungeonStates: JSON.parse(JSON.stringify(this.dungeonStates || {})),
                    worldPos: this.world.heroPos,
                    worldOut: this.world.out,
                });
            },
        };
        if (!G.deck.length) G.deck = [...DEFAULT_DECK];

        const ctx = {
            app, world, ECS, COMPONENTS, DATA, worldContainer, addSystem,
            assets, uiTex, scheduler, input, camera, characters, charInput,
            knight, creatureSheets, G, ui, audio, collide,
            sfx: gameSfx,   // ctx.sfx() — клик UI; ctx.sfx("sword") — событие боя
            music: gameMusic, // музыка сцены: "menu" | "dungeon" | "battle"
        };

        const scenes = createScenes({ addSystem });
        ctx.scenes = scenes;
        const t = (k, v) => GAME_LOC.t(k, v);

        // ── Сцена «Меню» ───────────────────────────────────────────────────
        let menuRoot = null;
        const T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });
        function menuButton(texName, label, x, y, scale, onTap, fontSize = 45) {
            return globalThis.GAME_UI.button(ctx, { tex: texName, label, x, y, scale, onTap, fontSize });
        }
        scenes.add("menu", {
            enter() {
                gameMusic("menu");
                menuRoot = new PIXI.Container();
                menuRoot.eventMode = "static";
                const bg = new PIXI.Sprite(uiTex("bg_corridor_1.png"));
                const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
                bg.scale.set(s);
                bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
                menuRoot.addChild(bg);

                // Заголовок и кнопки — по референсу юзера (референсы/
                // start_menu.png): «Подземелье»/«призывателей» строками с
                // центрами y≈321/471 (кегль 150 по ширинам 650/804 референса,
                // тонкий штрих), без подзаголовка; кнопки 274×77 столбцом
                // по центру с шагом 90 (центры 630..990), подписи кеглем 45.
                const t1 = T(t("menu.title1"), 150, 0xf0c96a, { stroke: { color: 0x241505, width: 8 } });
                t1.anchor.set(0.5, 0.5);
                t1.position.set(960, 321);
                const t2 = T(t("menu.title2"), 150, 0xf0c96a, { stroke: { color: 0x241505, width: 8 } });
                t2.anchor.set(0.5, 0.5);
                t2.position.set(960, 471);
                t1.eventMode = "none"; t2.eventMode = "none";
                menuRoot.addChild(t1, t2);

                // «Войти» заменён парой «Продолжить»/«Новая игра» (просил юзер):
                // продолжить можно сохранённый забег (sd_run, пишет G.saveRun),
                // новая игра снимает сейв и начинает с 1-го этажа. Кнопки — в
                // натуральном размере спрайта 274×77 (просил юзер).
                const menuInfo = [];
                const addMenuBtn = (label, x, y, onTap) => {
                    const b = menuButton("button_menu.png", label, x, y, 1, onTap, 45);
                    const txt = b.children.find((n) => n.style);
                    const sp = b.userData.sprite;
                    menuInfo.push({
                        label, x, y, scale: sp.scale.x,
                        fontSize: txt ? txt.style.fontSize : null,
                        // ширина спрайта в экранных пикселях (тест базы 1920×1080)
                        physW: Math.round(sp.texture.width * sp.scale.x * ui.scale.x),
                    });
                    menuRoot.addChild(b);
                    return b;
                };
                const contEnabled = !!GAME_META.loadRun();
                const bCont = addMenuBtn(t("menu.continue"), 960, 630, () => {
                    const r = GAME_META.loadRun();
                    if (!contEnabled || !r) return;
                    G.hero = { hp: r.hero.hp, maxHp: r.hero.maxHp || 10 };
                    G.gold = r.gold || 0;
                    G.elem = r.elem || "strength";
                    // поднимаются только этажи текущей геометрии (v3 —
                    // тайлы 56px): сейвы волн с другой сеткой пересоберутся.
                    // Архив адресуется «данж:этаж»; у старых сейвов (одни
                    // гоблинские пещеры) данж по умолчанию gob
                    G.dungeon = r.dungeon && r.dungeon.v === 3 ? r.dungeon : null;
                    if (G.dungeon && !G.dungeon.cave) G.dungeon.cave = "gob";
                    G.dungeonStates = {};
                    for (const k in (r.dungeonStates || {})) {
                        const st = r.dungeonStates[k];
                        if (!st || st.v !== 3) continue;
                        st.cave = st.cave || "gob";
                        G.dungeonStates[st.cave + ":" + st.floor] = st;
                    }
                    if (!G.dungeon) G.dungeon = G.dungeonStates[(r.cave || "gob") + ":" + r.floor] || null;
                    if (G.dungeon)
                        G.dungeonStates[G.dungeon.cave + ":" + G.dungeon.floor] = G.dungeon;
                    // глубина у каждого подземелья своя; активное — где герой
                    G.run.floor = r.floor;
                    G.run.cave = G.dungeon ? G.dungeon.cave : (r.cave || "gob");
                    G.run.floors = r.floors && typeof r.floors === "object"
                        ? { gob: r.floors.gob || 1, grw: r.floors.grw || 1 }
                        : { gob: r.floor, grw: 1 };
                    G.world = { heroPos: r.worldPos || null, out: !!r.worldOut };
                    // продолжение с середины этажа — в подземелье, иначе —
                    // в открытый мир (герой вышел из пещер или только начал);
                    // решает ОТФИЛЬТРОВАННОЕ состояние (G.dungeon), не сейв
                    scenes.go(G.dungeon ? "dungeon" : "world");
                });
                if (!contEnabled) bCont.alpha = 0.45; // забега нет — кнопка приглушена
                const bNew = addMenuBtn(t("menu.newGame"), 960, 720, () => {
                    // стихия задаёт стартовую колоду — сначала выбор (юзер)
                    scenes.go("elemPick");
                });
                addMenuBtn(t("menu.deck"), 960, 810, () => scenes.go("deck"));
                addMenuBtn(t("menu.settings"), 960, 900, () => scenes.go("settings"));
                addMenuBtn(t("menu.exit"), 960, 990, () => { menuRoot.userData.bye.visible = true; });
                // хендл для смоука: подписи/размеры кнопок, заголовок, нажатие
                window.__GAME.menu = {
                    buttons: () => menuInfo.map((b) => ({ ...b })),
                    titles: () => [t1, t2].map((n) => ({
                        text: n.text, x: n.x, y: n.y,
                        fontSize: n.style.fontSize, stroke: n.style.stroke.width,
                    })),
                    texts: () => menuRoot.children.filter((n) => n.text).map((n) => n.text),
                    continueEnabled: () => contEnabled,
                    press(name) {
                        const b = name === "continue" ? bCont : name === "newGame" ? bNew : null;
                        if (b) b.emit("pointertap");
                    },
                };

                const bye = T(t("menu.bye"), 33, 0xffe2a8, { stroke: { color: 0x1c1207, width: 8 } });
                bye.anchor.set(0.5);
                bye.position.set(960, 1059);
                bye.visible = false;
                bye.eventMode = "none";
                menuRoot.addChild(bye);
                menuRoot.userData = { bye };
                const ver = T("v0.2 · zero_engine", 21, 0x8a7c5e);
                ver.position.set(18, 1050);
                ver.eventMode = "none";
                menuRoot.addChild(ver);
                ui.addChild(menuRoot);
                worldContainer.visible = false;
            },
            exit() {
                window.__GAME.menu = null; // кнопки умерли вместе с root
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
                dim.rect(0, 0, 1920, 1080);
                dim.fill({ color: 0x000000, alpha: 0.65 });
                fwRoot.addChild(dim);
                const panel = new PIXI.Sprite(uiTex("panel_allert.png"));
                panel.anchor.set(0.5);
                panel.scale.set(2.25);
                panel.position.set(960, 435);
                fwRoot.addChild(panel);
                const ft = T(t("floorWin.title", { n: G.run.floor - 1 }), 54, 0xffe9b0, { stroke: { color: 0x1c1207, width: 10 } });
                ft.anchor.set(0.5);
                ft.position.set(960, 378);
                ft.eventMode = "none";
                fwRoot.addChild(ft);
                fwRoot.addChild(menuButton("button_menu.png", t("floorWin.next"), 960, 579, 1,
                    () => scenes.go("dungeon")));
                // «В меню» больше НЕ сбрасывает забег: прогресс этажа сохранён
                // (dungeon.exit пишет sd_run), «Продолжить» в меню его поднимет
                fwRoot.addChild(menuButton("button_menu.png", t("floorWin.menu"), 960, 729, 1,
                    () => scenes.go("menu")));
                ui.addChild(fwRoot);
            },
            exit() {
                if (fwRoot) { fwRoot.destroy({ children: true }); fwRoot = null; }
            },
        });

        // ── Сцена «Выбор стихии» (новая игра) ─────────────────────────────
        // Стихия задаёт стартовую колоду/коллекцию (просил юзер): карточки
        // с лого стихий из images/ui/logo. Пока две — Сила и Рост.
        let epRoot = null;
        const ELEM_ORDER = ["strength", "growth"];
        scenes.add("elemPick", {
            enter() {
                gameMusic("menu");
                epRoot = new PIXI.Container();
                epRoot.eventMode = "static";
                const bg = new PIXI.Sprite(uiTex("bg_corridor_2.png"));
                const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
                bg.scale.set(s);
                bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
                epRoot.addChild(bg);
                const dim = new PIXI.Graphics();
                dim.rect(0, 0, 1920, 1080);
                dim.fill({ color: 0x000000, alpha: 0.5 });
                epRoot.addChild(dim);

                const title = T(t("menu.pickElem"), 96, 0xf0c96a,
                    { stroke: { color: 0x241505, width: 9 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 118);
                title.eventMode = "none";
                epRoot.addChild(title);
                const sub = T(t("menu.pickElemSub"), 30, 0xd8c79d);
                sub.anchor.set(0.5, 0);
                sub.position.set(960, 262);
                sub.eventMode = "none";
                epRoot.addChild(sub);

                const cards = [];
                ELEM_ORDER.forEach((elem, k) => {
                    const cx = 600 + k * 720;
                    const c = new PIXI.Container();
                    c.position.set(cx, 640);
                    const panel = new PIXI.Graphics();
                    panel.roundRect(-230, -230, 460, 460, 22);
                    panel.fill({ color: 0x171310, alpha: 0.94 });
                    panel.stroke({ width: 4, color: 0x6b5c40 });
                    c.addChild(panel);
                    const logo = new PIXI.Sprite(uiTex(GAME_DATA.ELEM_LOGO[elem]));
                    logo.anchor.set(0.5);
                    logo.scale.set(1.55);
                    c.addChild(logo);
                    logo.position.set(0, -100);
                    const name = T(t("elem." + elem), 57, 0xf0c96a,
                        { stroke: { color: 0x241505, width: 8 } });
                    name.anchor.set(0.5, 0);
                    name.position.set(0, 24);
                    name.eventMode = "none";
                    c.addChild(name);
                    const desc = T(t("menu.elem" + (elem === "strength" ? "Strength" : "Growth") + "Desc"),
                        25, 0xd8c79d, { wordWrap: true, wordWrapWidth: 396, align: "center" });
                    desc.anchor.set(0.5, 0);
                    desc.position.set(0, 110);
                    desc.eventMode = "none";
                    c.addChild(desc);
                    c.eventMode = "static";
                    // подсветка наведения — отдельная рамка с альфой (повторный
                    // Graphics.stroke дописывает команду, а не заменяет её)
                    const glow = new PIXI.Graphics();
                    glow.roundRect(-230, -230, 460, 460, 22);
                    glow.stroke({ width: 5, color: 0xf0c96a });
                    glow.alpha = 0;
                    c.addChild(glow);
                    c.on("pointerover", () => { glow.alpha = 1; logo.scale.set(1.68); });
                    c.on("pointerout", () => { glow.alpha = 0; logo.scale.set(1.55); });
                    c.on("pointertap", () => {
                        if (ctx.sfx) ctx.sfx();
                        GAME_META.clearRun();
                        G.resetRun(elem);
                        scenes.go("world"); // новый забег — в открытом мире
                        G.saveRun(); // свежий забег сразу сохранён
                    });
                    epRoot.addChild(c);
                    cards.push({ elem, node: c, x: cx, y: 640 });
                });
                epRoot.addChild(menuButton("button_menu.png", t("settings.back"), 165, 78, 1,
                    () => scenes.go("menu")));
                window.__GAME.elemPick = {
                    options: () => cards.map((c) => ({ elem: c.elem, x: c.x, y: c.y })),
                    pick(elem) {
                        const c = cards.find((x) => x.elem === elem);
                        if (c) c.node.emit("pointertap");
                    },
                };
                ui.addChild(epRoot);
                worldContainer.visible = false;
            },
            exit() {
                window.__GAME.elemPick = null;
                if (epRoot) { epRoot.destroy({ children: true }); epRoot = null; }
            },
        });

        // ── Открытый мир, подземелье, арена, колода, награда, настройки ──
        const worldScene = GAME_WORLD.createWorldScene(ctx);
        scenes.add("world", worldScene);
        // транзит между этажами: сцены не умеют перезаходить в себя
        // (createScenes игнорирует go() в текущую), лестница наверх ходит
        // этажами через этот ретранслятор
        scenes.add("floorSwap", { enter() { scenes.go("dungeon"); } });
        const dungeonScene = GAME_DUNGEON.createDungeonScene(ctx);
        scenes.add("dungeon", dungeonScene);
        const arenaScene = GAME_ARENA.createArenaScene(ctx);
        scenes.add("arena", arenaScene);
        const deckScene = GAME_DECK.createDeckScene(ctx);
        scenes.add("deck", deckScene);
        const rewardScene = GAME_REWARD.createRewardScene(ctx);
        scenes.add("reward", rewardScene);
        const draftScene = GAME_DRAFT.createDraftScene(ctx);
        scenes.add("draft", draftScene);
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
            dungeon: dungeonScene, arena: arenaScene, world: worldScene,
            arenaApi: arenaScene.api, deckApi: deckScene.api,
            rewardApi: rewardScene.api, settingsApi: settingsScene.api,
            draftApi: draftScene.api, worldApi: worldScene.api,
            audio: {
                track: () => audio.status().track,
                status: () => audio.status(),
                sfxCounts: () => ({ ...sfxCounts }),
            },
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
                hero: { ...G.hero }, floor: G.run.floor, gold: G.gold,
                elem: G.elem, cave: G.run.cave,
                floors: { ...(G.run.floors || {}) },
                heroPos: (() => {
                    // герой живёт в подземелье или открытом мире (сцена)
                    const ids = [dungeonScene.heroId(), worldScene.heroId()];
                    const id = ids.find((v) => v !== null && v !== undefined);
                    return id !== undefined && id !== null
                        ? { x: COMPONENTS.positionX[id], y: COMPONENTS.positionY[id] } : null;
                })(),
                lang: GAME_LOC.lang,
                deck: { size: G.deck.length, cards: [...G.deck] },
                collection: { ...G.collection },
                settings: { ...G.settings },
                dungeon: G.dungeon ? {
                    cave: G.dungeon.cave || "gob",
                    enemies: G.dungeon.enemies.filter((e) => e.alive).length,
                    bossDead: G.dungeon.bossDead,
                    floors: Object.keys(G.dungeonStates || {}).map(Number), // посещённые этажи
                    // объекты комнат: тип/собрано + открытое окно
                    objects: (G.dungeon.objects || []).map((o) => ({
                        type: o.type, taken: !!o.taken,
                    })),
                    win: G.dungeon.win && G.dungeon.objects && G.dungeon.objects[G.dungeon.win.idx]
                        ? G.dungeon.objects[G.dungeon.win.idx].type : null,
                } : null,
                world: { heroPos: G.world.heroPos ? { ...G.world.heroPos } : null, out: !!G.world.out },
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
