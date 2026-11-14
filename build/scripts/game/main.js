// БУТ «Развернутый Мир»: движок → ассеты → шрифт → мета/настройки →
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
            "icon_day", "icon_gold", "icon_map", "icon_rune", "icon_setting",
            "icon_shop",
            "panel_1", "panel_2", "panel_allert", "panel_buff", "panel_buff_circle",
            "panel_down", "panel_label", "panel_minimap", "panel_skill", "panel_top",
            "portrate_hero", "sign_mana", "sign_shield", "start_back",
            "start_cards",
            "UI_cards_hand", "UI_energy",
            // подложки чисел на жетонах поля боя (просил юзер)
            "attack", "heals",
            // панель настроек — спрайты юзера (макет for_work/arts/example.png)
            "settings/panel1", "settings/panel2", "settings/panel3", "settings/panel4",
            "settings/panel5", "settings/point", "settings/abutton", "settings/obutton",
            "settings/panel6", "settings/panel7", "settings/panel8",
            "settings/abutton2", "settings/obutton2",
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
        // подводная арена «Подземных ключей» (стихия Мудрость)
        uiTextures["scenes/3.png"] = await assets.loadTexture("./images/scenes/3.png");
        // арена «Земель мёртвых» (стихия Тлен)
        uiTextures["scenes/4.png"] = await assets.loadTexture("./images/scenes/4.png");
        // арена «Залов Чести» (стихия Честь, просил юзер)
        uiTextures["scenes/5.png"] = await assets.loadTexture("./images/scenes/5.png");
        // арена «Логова Времени» (стихия Время, просил юзер)
        uiTextures["scenes/6.png"] = await assets.loadTexture("./images/scenes/6.png");
        // задники ДВУХЦВЕТНЫХ подземелий (арт юзера, W75): «Рыжий лес»
        // (Сила+Рост) — 7, «Небесный дворец» (Честь+Мудрость) — 8,
        // «Белая пуща» (Рост+Честь) — 9, W79 (юзер): «Магодром»
        // (Мудрость+Время) — 10, W82 (юзер): «Некро-раскопки»
        // (Время+Тлен) — 11
        uiTextures["scenes/7.png"] = await assets.loadTexture("./images/scenes/7.png");
        uiTextures["scenes/8.png"] = await assets.loadTexture("./images/scenes/8.png");
        uiTextures["scenes/9.png"] = await assets.loadTexture("./images/scenes/9.png");
        uiTextures["scenes/10.png"] = await assets.loadTexture("./images/scenes/10.png");
        uiTextures["scenes/11.png"] = await assets.loadTexture("./images/scenes/11.png");
        // W95 (юзер): «Портал в бездну» (Тлен+Сила) — 12
        uiTextures["scenes/12.png"] = await assets.loadTexture("./images/scenes/12.png");
        // эффект поля «Стена костров» и рубашки колод по стихиям
        // (гоблины/природа/мудрость/тлен/честь)
        uiTextures["effects/fire.png"] = await assets.loadTexture("./images/effects/fire.png");
        uiTextures["card_goblin_back.png"] = await assets.loadTexture("./images/ui/card_goblin_back.png");
        uiTextures["card_nature_back.png"] = await assets.loadTexture("./images/ui/card_nature_back.png");
        uiTextures["card_wisdom_back.png"] = await assets.loadTexture("./images/ui/card_wisdom_back.png");
        uiTextures["card_decay_back.png"] = await assets.loadTexture("./images/ui/card_decay_back.png");
        uiTextures["card_honor_back.png"] = await assets.loadTexture("./images/ui/card_honor_back.png");
        // рубашка стихии Время (Тордин, просил юзер)
        uiTextures["card_time_back.png"] = await assets.loadTexture("./images/ui/card_time_back.png");
        // рубашка мультицветных колод и карт «Рыжего леса» (W54, юзер)
        uiTextures["card_multi_back.png"] = await assets.loadTexture("./images/ui/card_multi_back.png");
        // тайлы подземелий юзера: images/dungeon_tiles/<данж>/<…>.png —
        // полы 64×64 (floor/0-9) и стены walls/* по маске соседей.
        // Свой набор на каждый данж: goblins_lair (Сила), growth_lair (Рост),
        // water_lair (Мудрость), necro_lair (Тлен), honor_lair (Честь),
        // time_lair (Время)
        say("тайлы подземелья…");
        await frame();
        const TILE_FILES = ["floor/0", "floor/1", "floor/2", "floor/3",
            "floor/4", "floor/5", "floor/6", "floor/7", "floor/8",
            "floor/9", "walls/wall_h1", "walls/wall_h1_td",
            "walls/wall_h1_tu", "walls/wall_v1", "walls/wall_v1_tl",
            "walls/wall_v1_tr", "walls/wall_cross", "walls/wall_cor1",
            "walls/wall_cor2", "walls/wall_cor3", "walls/wall_cor4",
            "walls/wall_end1", "walls/wall_end2", "walls/wall_end3",
            "walls/wall_end4"];
        for (const lair of ["goblins_lair", "growth_lair", "water_lair",
                            "necro_lair", "honor_lair", "time_lair",
                            "str_gro", "gro_hon",
                            "hon_wis", "wis_tim",
                            "tim_nec", "nec_str"]) { // W54/W61/W75/W79/W82/W95: тайлы юзера
            for (const f of TILE_FILES) {
                uiTextures[`dungeon_tiles/${lair}/${f}.png`] =
                    await assets.loadTexture(`./images/dungeon_tiles/${lair}/${f}.png`);
            }
        }
        // Листы местности глобальной карты (просил юзер, волна тайлов
        // мира): images/tiles/*.png — dual-grid 4×4 по 32px, нарезка и
        // конвенция углов — из движкового dualgrid.js (TILE_CORNERS).
        // Пары: grass_dirt, grass_water, снег/песок/тлен/магия поверх
        // земли и (W50, юзер) совмещения местности с водой — берега рек
        // без травяных колец; wood — прозрачный оверлей лесных массивов
        // (renderForest); dirt/grass/snow/sand/waste/magic/water — НЕ
        // dual-grid: тайлсеты ВАРИАНТОВ сплошной заливки 4×4 (16
        // вариантов по 32px, просил юзер волны 13–14) — нарезка та же
        say("тайлы мира…");
        await frame();
        const dual = globalThis.createDualGrid();
        const worldSheets = {};
        for (const name of ["grass_dirt", "grass_water", "sand_dirt",
                            "snow_dirt", "waste_dirt", "magic_dirt", "wood",
                            "swamp", "dirt", "grass", "snow", "sand",
                            "waste", "magic", "water", "dirt_water",
                            "snow_water", "sand_water", "magic_water"]) {
            worldSheets[name] = dual.sliceTileset(
                await assets.loadTexture(`./images/tiles/${name}.png`));
        }
        // дороги: roads.png юзера — 11 видов сеткой 4×3 по 32px (12-й
        // слот пуст), прозрачные тайлы с поворотами и перекрёстками
        const roadsSrc = await assets.loadTexture("./images/tiles/roads.png");
        const roadsTex = [];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
            roadsTex.push(new PIXI.Texture({
                source: roadsSrc.source,
                frame: new PIXI.Rectangle(c * 32, r * 32, 32, 32),
            }));
        // мосты: moats.png юзера (W51) — 11 видов сеткой 4×3 по 32px
        // (12-й слот пуст), раскладка и ориентация как у дорог roads.png
        const moatsSrc = await assets.loadTexture("./images/tiles/moats.png");
        const moatsTex = [];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
            moatsTex.push(new PIXI.Texture({
                source: moatsSrc.source,
                frame: new PIXI.Rectangle(c * 32, r * 32, 32, 32),
            }));
        // мосты городов: moats_64.png юзера — те же 11 видов, но по 64px
        // (клетка города 64px → рисование 1:1; 32px лист в городе
        // растягивался вдвое и мылился)
        const moatsCitySrc = await assets.loadTexture(
            "./images/tiles/moats_64.png");
        const moatsCityTex = [];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
            moatsCityTex.push(new PIXI.Texture({
                source: moatsCitySrc.source,
                frame: new PIXI.Rectangle(c * 64, r * 64, 64, 64),
            }));
        // горы: images/tiles/montain/<n>.png — спрайты юзера на слой
        // объектов (общий y-sort с деревьями, просил юзер)
        const mountainTex = [];
        for (let n = 1; n <= 6; n++)
            mountainTex.push(await assets.loadTexture(
                `./images/tiles/montain/${n}.png`));
        // пещера подземелий: images/tiles/cave.png — 192×136 ≈ 6×4 клетки
        const caveTex = await assets.loadTexture("./images/tiles/cave.png");
        // города мира: images/sities/<стихия>/{0,1}.png — спрайты юзера
        // (0.png — столица 192×160, 1.png — обычный город 192×128);
        // стихии — ключи ELEM_LOGO (тот же канонический список)
        const cityTex = {};
        for (const e of Object.keys(GAME_DATA.ELEM_LOGO))
            cityTex[e] = {
                cap: await assets.loadTexture(`./images/sities/${e}/0.png`),
                town: await assets.loadTexture(`./images/sities/${e}/1.png`),
            };
        // деревья лесных массивов: images/tiles/trees/<n>.png — спрайты
        // юзера 96px (слой объектов над тайлами чащи, просил юзер)
        const treeTex = [];
        for (let n = 1; n <= 10; n++)
            treeTex.push(await assets.loadTexture(`./images/tiles/trees/${n}.png`));
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
        // логотипы ДВУХЦВЕТНЫХ стихий (арт юзера W74): тот же путь
        // images/ui/logo/, отдельный словарь — под ELEM_LOGO завязаны
        // города/ресурсы, которых для мульти-стихий нет
        for (const file of Object.values(GAME_DATA.MULTI_LOGO)) {
            if (!uiTextures[file]) uiTextures[file] = await assets.loadTexture(`./images/ui/${file}`);
        }
        // карточки героев (выбор при «Новой игре» + HUD): images/heroes/<…>.png
        say("герои…");
        await frame();
        for (const h of Object.values(GAME_DATA.HEROES)) {
            uiTextures[`heroes/${h.img}.png`] =
                await assets.loadTexture(`./images/heroes/${h.img}.png`);
        }
        // портрет Глома (арт юзера, W31): файла может ещё не быть —
        // диалоги квестов работают без портрета (силуэт); как только арт
        // появится в images/npc/, подхватится здесь без правок кода
        try {
            uiTextures["npc/glom.png"] =
                await assets.loadTexture("./images/npc/glom.png");
        } catch (e) { /* арта ещё нет — окно с силуэтом */ }
        // здания городов (арт юзера, W34): магазин/кузница/дом Глома
        // и коллекционер (W66) 384×256, ратуша 384×384; W36 — рисуются
        // в полразмера (пятно 3×2 / 3×3)
        for (const f of ["shop", "armory", "town_hall", "glom_house", "collect"])
            uiTextures[`buildings/${f}.png`] =
                await assets.loadTexture(`./images/buildings/${f}.png`);
        // ресурсы и бустеры стихий (арт юзера, W40): иконки в HUD сверху
        // (72×72) и бустер в окне кузницы (500×300)
        for (const e of Object.keys(GAME_DATA.ELEM_LOGO)) {
            uiTextures[`resources/res_${e}.png`] =
                await assets.loadTexture(`./images/resources/res_${e}.png`);
            uiTextures[`resources/buster_${e}.png`] =
                await assets.loadTexture(`./images/resources/buster_${e}.png`);
        }
        const uiTex = (name) => {
            const t = uiTextures[name];
            if (!t) throw new Error(`нет текстуры ui/${name}`);
            return t;
        };
        say("спрайты…");
        await frame();
        // Герой — лист по стихии забега (выбор при «Новой игре»): Рост —
        // эльф, Сила — гоблин. Сетка у обоих 256×256, 4 строки ходьбы по
        // 6 кадров. wait/attack в листах нет — контроллер персонажа в покое
        // замирает в стоп-кадре ходьбы (штатный сценарий play() без строки).
        // Спрайт рисуется в 0.25: фигура ~195px в кадре — те же ~49px роста,
        // что было у рыцаря, и честный пиксельный даунскейл 4→1.
        const heroSheets = {
            strength: await assets.loadCharacter("./images/sprites/goblin_256"),
            growth: await assets.loadCharacter("./images/sprites/elf_256"),
            wisdom: await assets.loadCharacter("./images/sprites/sorca_256"), // Мира
            decay: await assets.loadCharacter("./images/sprites/necr_256"), // Мортис
            honor: await assets.loadCharacter("./images/sprites/knight_256"), // Леон
            time: await assets.loadCharacter("./images/sprites/gnome_256"), // Тордин
        };
        // Листы существ поля боя. Стандарт: <имя>_256.png — сетка 256×256,
        // 4 ряда анимаций (спереди/сзади/справа/слева) по 6 кадров + json-манифест.
        // По умолчанию лист — по стихии (Рост — эльф, остальное — гоблин);
        // конкретное существо указывает свой лист полем def.sheet, новые
        // добавлять сюда записью. scale — множитель к боевому скейлу
        // (SPRITE_SCALE арены): медведь ×1.1, древоброд ×1.3, росянка ×0.8
        // (просил юзер).
        const creatureSheets = {
            goblin: heroSheets.strength,
            elf: heroSheets.growth,
            wisdom: heroSheets.wisdom, // существа Мудрости — сорка (плейсхолдер)
            necr: heroSheets.decay, // существа Тлена — некр (пока один лист, просил юзер)
            wolf: await assets.loadCharacter("./images/sprites/wolf_256"),
            bear: { ...(await assets.loadCharacter("./images/sprites/bear_256")), scale: 1.1 },
            ent: { ...(await assets.loadCharacter("./images/sprites/ent_256")), scale: 1.3 },
            plant: { ...(await assets.loadCharacter("./images/sprites/plant_256")), scale: 0.8 },
            // листы элементалей Мудрости (просил юзер): вода/лёд — water_el,
            // воздух/песок — air_el, зимние/выросшие духи и ледо-пикси — spirit
            water_el: await assets.loadCharacter("./images/sprites/water_el_256"),
            air_el: await assets.loadCharacter("./images/sprites/air_el_256"),
            spirit: await assets.loadCharacter("./images/sprites/spirit_256"),
            // листы Тлена юзера (просил юзер): зомби — zomb (dec122/142/149),
            // нетопыри — bat (dec123/132/146: Нетопырь, Вампир, Восставший нетопырь)
            zomb: await assets.loadCharacter("./images/sprites/zomb_256"),
            bat: await assets.loadCharacter("./images/sprites/bat_256"),
            // лист Чести юзера (просил юзер): все существа стихии (Человек)
            // пока ходят рыцарем knight_256
            knight: await assets.loadCharacter("./images/sprites/knight_256"),
            // лист Времени юзера (просил юзер): существа стихии — гномы
            // (tim201–203/209); Тордин в мире ходит тем же листом
            gnome: heroSheets.time,
            // фигурка Глома в городе (арт юзера, W34): спрайтшит 4×6 кадров
            glom: await assets.loadCharacter("./images/sprites/glom_256"),
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
        const { DEFAULT_DECK, DEFAULT_COLLECTION, HERO_ORDER } = GAME_DATA;

        // Стартовый герой «Новой игры» — ОТДЕЛЬНО от активного: активного
        // можно сменить во вкладке «Герои» на завоёванного, и тогда старый
        // фильтр «id === G.heroId» терял стартера из коллекции (баг).
        function savedStarterId() {
            if (savedMeta && HERO_ORDER.includes(savedMeta.starterId))
                return savedMeta.starterId;
            return HERO_ORDER[0];
        }
        // Нормализация меты (sd_meta или блока сохранения). Одно место
        // для бута и загрузки блока из настроек — состояние применяется
        // одинаково. Пустая колода — НОРМА для завоёванного героя
        // (начинает без карт, просил юзер).
        function buildMetaState(m) {
            return {
                deck: m && Array.isArray(m.deck) ? m.deck : [...DEFAULT_DECK],
                collection: m && m.collection ? m.collection : { ...DEFAULT_COLLECTION },
                heroDecks: m && m.heroDecks ? m.heroDecks : null,
                captured: m && Array.isArray(m.captured) ? m.captured : [],
                // активный герой тоже переживает перезапуск (его меняют в «Героях»)
                heroId: m && GAME_DATA.HEROES[m.activeHeroId] ? m.activeHeroId : "gorbag",
                starterId: savedStarterId(),
            };
        }
        const metaState = buildMetaState(savedMeta);

        // ── Звук: два канала движка — эффекты («звук») и музыка («музыка») ──
        const audio = createAudio();
        audio.setVolume(settings.sound / 12);
        audio.setMusicVolume(settings.music / 12);

        // Файлы из build/sound: sfx-эффекты боя/UI + музыка сцен.
        // Музыка грузится лениво при первом вызове music() (треки тяжёлые);
        // короткие sfx предзагружаются сразу, фоном.
        // Привязка звуков к событиям (W34, юзер перезаписал файлы и задал
        // список «событие → файл»); старые menu/use/dam/up/openRoom вышли
        // из оборота, файлы остаются в build/sound
        const SFX_FILES = {
            step: "step.mp3",      // нажатие кнопки интерфейса
            acid: "acid.mp3",      // взятие карты (добор, панели, драфт)
            aqua: "aqua.mp3",      // призыв существа
            chpoc: "chpoc.mp3",    // каст заклинания (срабатывания карт)
            mine: "mine.mp3",      // розыгрыш/срабатывание ловушки
            crash: "crash.mp3",    // атака существом и удар по базе
            die: "die.mp3",        // смерть существа
            sword: "sword.mp3",    // возведение постройки (механика впереди)
            coins: "coins.mp3",    // вход в подземелье (и золото/награды)
            rocket: "rocket.mp3",  // начало боя
            enter: "enter.mp3",    // вход в город
            footstep: "footstep.mp3", // шаги героя (петля)
            alert: "alert.mp3",    // бродячий монстр заметил героя
            fight: "fight.mp3",    // файтинговая заставка «VS» — удар карт (W93)
            lvlUp: "lvlUp.mp3",    // победа (драфт)
        };
        // Тихие/частые звуки — множитель поверх ползунка «звук»
        const SFX_VOL = {
            step: 0.45, chpoc: 0.9, sword: 0.9,
            die: 0.9, crash: 1.0, mine: 0.9, acid: 0.9, rocket: 0.85,
            aqua: 0.8, coins: 0.9, lvlUp: 1.0, enter: 0.9, alert: 0.9,
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

        // Курсор прячется при игре с клавиатуры и возвращается при движении
        // мыши (W54, юзер): жмёшь клавишу — стрелка исчезает, шевельнул
        // мышь — появилась. Движение = реальный mousemove, поэтому курсор
        // не мигает у стоящей мыши. У игры курсор-картинка стоит в CSS с
        // !important (index.html) — inline без important её не перебьет.
        // W58 (юзер): правило стоит на body И canvas — прятать надо на
        // обоих, иначе над холстом (вся игра) стрелка остаётся видимой
        let cursorHidden = false;
        const cursorEls = () => [document.body, document.querySelector("canvas")]
            .filter((el) => el);
        window.addEventListener("keydown", () => {
            if (!cursorHidden) {
                cursorHidden = true;
                for (const el of cursorEls())
                    el.style.setProperty("cursor", "none", "important");
            }
        });
        window.addEventListener("mousemove", () => {
            if (cursorHidden) {
                cursorHidden = false;
                for (const el of cursorEls())
                    el.style.removeProperty("cursor");
            }
        });
        const sfxCounts = {};
        const gameSfx = (name) => {
            const key = name || "step"; // клик UI — step.mp3 (W34, юзер)
            sfxCounts[key] = (sfxCounts[key] || 0) + 1;
            globalThis.__SFX_LOG = sfxCounts; // пробы: что и сколько звучало
            audio.playFile(key, SFX_VOL[key] !== undefined ? SFX_VOL[key] : 1);
        };
        const gameMusic = (name) => { audio.music(name); };

        // ── Шаги героя (W34, юзер): footstep.mp3 петлёй, ПОКА герой идёт ──
        // У разовых sfx движка петли нет — HTMLAudio с loop. Сцены тикают
        // ctx.footstep(x, y) каждый кадр: дельта позиции решает «идёт/стоит»;
        // смена сцены тики прекращает — страховочный интервал глушит звук.
        const stepAudio = new Audio("./sound/footstep.mp3");
        stepAudio.loop = true;
        let stepLast = null, stepT = 0, stepWanted = false;
        const footstepTick = (x, y) => {
            stepT = performance.now();
            const moving = !!stepLast
                && Math.abs(x - stepLast.x) + Math.abs(y - stepLast.y) > 0.3;
            stepLast = { x, y };
            stepWanted = moving;
            const vol = Math.max(0, Math.min(1, settings.sound / 12)) * 0.5;
            if (moving) {
                stepAudio.volume = vol;
                if (stepAudio.paused) stepAudio.play().catch(() => { /* нет жеста */ });
            } else if (!stepAudio.paused) stepAudio.pause();
        };
        setInterval(() => {
            if (!stepAudio.paused && performance.now() - stepT > 350)
                stepAudio.pause();
        }, 250);
        // пробы: headless-хром блокирует ЛЮБОЕ аудио (autoplay-политика) —
        // проверяем решение «идёт/стоит», реальный звук — в живом браузере
        globalThis.__STEP_INFO = () => ({ wanted: stepWanted,
            playing: !stepAudio.paused });

        // ── Общий контекст для сцен ────────────────────────────────────────
        const scheduler = createScheduler();
        const input = createInput();
        const camera = createCamera({ app, container: worldContainer, addSystem });

        // Коллизии героя (character-система) — по карте АКТИВНОЙ сцены:
        // подземелье и открытый мир подменяют collide.rows при входе,
        // а также шаг клетки (мир — 40px, подземелье — 56px тайлы).
        // extra — дополнительный предикат сцены (мир ставит блок тел
        // городов W42, данж сбрасывает)
        const collide = { rows: GAME_DUNGEON.ROWS, ts: 40, extra: null };
        function blocked(px, py) {
            const gx = Math.floor(px / collide.ts), gy = Math.floor(py / collide.ts);
            const rows = collide.rows;
            if (gy < 0 || gy >= rows.length || gx < 0 || gx >= rows[0].length) return true;
            const ch = rows[gy][gx];
            if (ch === "#" || ch === "~" || ch === "%") return true; // стены, вода и пятна застройки (W34)
            return !!(collide.extra && collide.extra(gx, gy));
        }
        // Инстанс ввода героя наружу: подземелье читает оси (клик-перемещение
        // отдаёт герою виртуальные оси, а без пути просто повторяет эти)
        const charInput = createCharacterInput();
        const characters = createCharacterSystem({
            world, ECS, COMPONENTS, DATA, blocked, input: charInput, addSystem,
        });

        // Нормализация меты — buildMetaState выше (общая с блоками сохранений)

        const G = {
            hero: { hp: 10, maxHp: 10 }, gold: 0,
            days: 0, // счётчик дней в открытом мире (W60, юзер)
            // ресурсы стихий и бустеры кузницы (W40, просил юзер): на начало
            // игры нули; ресурсы дают побочные квесты ратуши, тратятся в
            // кузнице города (3 → бустер стихии города)
            resources: { strength: 0, growth: 0, wisdom: 0,
                decay: 0, honor: 0, time: 0 },
            boosters: { strength: 0, growth: 0, wisdom: 0,
                decay: 0, honor: 0, time: 0 },
            run: { floor: 1, cave: "gob", floors: { gob: 1, grw: 1, wis: 1 } },
            heroId: metaState.heroId, // активный герой забега (можно сменить в «Героях»)
            starterId: metaState.starterId, // выбранный при «Новой игре» — не меняется
            elem: "strength", // стихия забега — из героя, задаёт стартовую колоду
            settings,
            deck: metaState.deck,
            collection: metaState.collection,
            // колода каждого героя своя (переключение во вкладке «Герои»);
            // heroDecks[heroId] всегда указывает на АКТИВНУЮ G.deck
            heroDecks: metaState.heroDecks,
            // завоёванные карты персонажей противников (просил юзер)
            captured: metaState.captured,
            // забег поднят в G (бут — false; «Продолжить»/новая игра — true):
            // «Сохранить» из настроек при live делает сначала штатный автосейв
            live: false,
            dungeon: null, activeEnemy: null, battle: null,
            world: { heroPos: null, out: false, wander: null, wildLevel: {} }, // открытый мир: где герой + бродячие отряды
            worldFrom: false, // последний бой начался в открытом мире (трофей/реванш ведут в мир)
            dungeonStates: {}, // этажи подземелий, ключ «данж:этаж» (gob:1, grw:2…)
            cityStates: {}, // города (W30): ключ «стихия|роль» (W70) — столица/стартовый/город зоны
            cityOut: null, // стихия города, из которого вышли (выход к его дверям)
            // (враги/объекты этажа остаются как их оставили),
            rewardDeck: null, // колода побеждённого — пул трофея «1 из 3»
            wonHero: null, // карта персонажа, завоёванная в последнем бою
            rewardDraft: false, // трофей — выбор из всей драфт-колоды (драфт)
            draft: null, // мини-игра «Карта сокровищ»: picks/ePicks/objIdx
            draftBattle: false, // текущий бой — драфт-бой (итог ведёт в подземелье)
            uiReturn: null, // откуда открыты настройки/колода (кнопка «Назад»)
            quests: null, // сюжетная линия забега (GAME_QUESTS): active/done/announced/pending
            // миграция старых сейвов: колода без «колод по героям» —
            // становится колодой активного героя
            heroDecksOf() {
                if (!this.heroDecks) this.heroDecks = { [this.heroId]: this.deck };
                if (!this.heroDecks[this.heroId]) this.heroDecks[this.heroId] = this.deck;
                return this.heroDecks;
            },
            // мета (коллекция/колоды/герои) — единая точка записи
            persistMeta() {
                globalThis.GAME_META.saveMeta(this.collection, this.deck, {
                    heroDecks: this.heroDecksOf(),
                    captured: this.captured,
                    activeHeroId: this.heroId,
                    starterId: this.starterId,
                });
            },
            // смена активного героя (вкладка «Герои», просил юзер): колода
            // переключается на его собственную; у завоёванных героев она
            // изначально пуста — игрок собирает её из общей коллекции
            setHero(id) {
                const HEROES = globalThis.GAME_DATA.HEROES;
                if (!HEROES[id]) return false;
                const owned = HERO_ORDER.includes(id) || this.captured.includes(id);
                if (!owned) return false;
                if (!this.heroDecks) this.heroDecks = { [this.heroId]: this.deck };
                // у стартового героя без своей колоды (Мира добавлена позже —
                // старые сейвы её не знают) колода = стартовая колода ЕГО
                // стихии, а не колода прошлого активного героя (миграция
                // heroDecksOf отдала бы её при смене — просил юзер)
                if (HERO_ORDER.includes(id) && !this.heroDecks[id]) {
                    this.heroDecks[id] = [...globalThis.GAME_DATA.STARTER_DECKS[HEROES[id].starter]];
                }
                this.heroId = id;
                this.elem = HEROES[id].elems[0];
                this.heroDecksOf();
                this.deck = this.heroDecks[id];
                this.persistMeta();
                return true;
            },
            // победа над противником: его карта персонажа — игроку
            // (просил юзер). Возвращает true, если карта завоёвана сейчас
            captureHero(id) {
                const HEROES = globalThis.GAME_DATA.HEROES;
                if (!HEROES[id] || HERO_ORDER.includes(id) || this.captured.includes(id)) return false;
                this.captured.push(id);
                this.heroDecksOf();
                // захваченный герой начинает БЕЗ карт в колоде (просил юзер)
                this.heroDecks[id] = [];
                this.persistMeta();
                return true;
            },
            resetRun(heroId) {
                // новая игра — забег И коллекция/колода с нуля (просил юзер:
                // после кнопки оставалась прокачанная коллекция). Герой
                // задаёт стихию и стартовую колоду (выбор в «Новая игра»)
                const HEROES = globalThis.GAME_DATA.HEROES;
                const h = HEROES[heroId] || HEROES.gorbag;
                this.heroId = h.id;
                this.starterId = h.id; // он же остаётся в «Героях» навсегда
                this.elem = h.elems[0];
                this.live = true; // забег поднят в G — «Сохранить» берёт его
                this.hero.hp = this.hero.maxHp;
                this.gold = 0;
                this.days = 0; // дни открытого мира — с нуля (W60)
                // ресурсы стихий и бустеры — с нуля (W40)
                for (const e of Object.keys(this.resources)) this.resources[e] = 0;
                for (const e of Object.keys(this.boosters)) this.boosters[e] = 0;
                this.run = { floor: 1, cave: "gob", floors: { gob: 1, grw: 1, wis: 1 } };
                this.dungeon = null;
                // глобальная карта — каждый забег своя: сид крутится здесь,
                // генерация детерминирована им (worldGen.js)
                this.world = {
                    seed: (Math.random() * 0x7fffffff) | 0,
                    heroPos: null, out: false, wander: null, wildLevel: {},
                    // стихия, под которую выбрана точка появления: смена
                    // героя («Герои») переносит его в зону новой стихии
                    startElem: h.elems[0],
                };
                this.worldFrom = false;
                this.dungeonStates = {};
                this.cityStates = {};
                this.cityOut = null;
                this.activeEnemy = null;
                this.battle = null;
                this.rewardDeck = null;
                this.rewardDraft = false;
                this.draft = null;
                this.draftBattle = false;
                // сюжетная линия — с первого квеста (анонс при входе в мир)
                this.quests = globalThis.GAME_QUESTS.fresh();
                this.deck = [...globalThis.GAME_DATA.STARTER_DECKS[h.starter]];
                this.collection = { ...globalThis.GAME_DATA.STARTER_COLLECTIONS[h.starter] };
                this.heroDecks = { [this.heroId]: this.deck }; // новая игра — колоды заново
                this.captured = []; // завоёванные карты тоже с нуля
                this.persistMeta();
            },
            // сейв забега (sd_run): этаж, герой, золото, подземелье целиком —
            // «Продолжить» в меню поднимает его (dungeon — простые данные,
            // переживают JSON)
            saveRun() {
                globalThis.GAME_META.saveRun({
                    floor: this.run.floor,
                    cave: this.run.cave,
                    floors: { ...this.run.floors },
                    heroId: this.heroId,
                    starterId: this.starterId, // стартовый герой не теряется
                    elem: this.elem,
                    hero: { hp: this.hero.hp, maxHp: this.hero.maxHp },
                    gold: this.gold,
                    days: this.days || 0, // дни открытого мира (W60)
                    // ресурсы стихий/бустеры (W40) и побочные квесты ратуши
                    resources: { ...this.resources },
                    boosters: { ...this.boosters },
                    worldSideQ: this.world.sideQuests
                        ? JSON.parse(JSON.stringify(this.world.sideQuests)) : null,
                    dungeon: this.dungeon ? JSON.parse(JSON.stringify(this.dungeon)) : null,
                    dungeonStates: JSON.parse(JSON.stringify(this.dungeonStates || {})),
                    cityStates: JSON.parse(JSON.stringify(this.cityStates || {})),
                    cityOut: this.cityOut || null,
                    worldPos: this.world.heroPos,
                    worldOut: this.world.out,
                    worldOutCave: this.world.outCave || null,
                    // бродячие отряды: жив/мёртв и позиции (геометрия — из сида)
                    worldWander: this.world.wander
                        ? JSON.parse(JSON.stringify(this.world.wander)) : null,
                    // дикие враги: уровень видов (победы над одноимёнными
                    // усиливают всех — W29); составы колод — в worldWander
                    worldWild: this.world.wildLevel
                        ? JSON.parse(JSON.stringify(this.world.wildLevel)) : null,
                    // стихия точки появления (W31): смена героя —
                    // перенос в зону новой стихии (world.enter)
                    worldStartElem: this.world.startElem || null,
                    // стартовый город новой игры и вход в него (W67, юзер):
                    // жёлтое свечение — пока герой не зайдёт в него
                    worldStartCity: this.world.startCity || null,
                    worldStartCitySeen: !!this.world.startCitySeen,
                    // глобальная карта: сейв хранит только сид — карта
                    // регенерируется детерминированно (worldGen.js)
                    worldSeed: this.world.seed,
                    quests: this.quests ? {
                        active: this.quests.active,
                        done: { ...(this.quests.done || {}) },
                        announced: !!this.quests.announced,
                        pending: this.quests.pending || null,
                        // прогресс (счётчик диких побед, чек-лист «Дно») —
                        // W31: прежде не писался и терялся при перезапуске
                        progress: { ...(this.quests.progress || {}) },
                    } : null,
                });
            },
            // Кнопка «Сохранить» в настройках (просил юзер): весь прогресс
            // игры — забег + мета — уходит в именованный блок с датой.
            // live — сначала штатный автосейв, блок снимает свежее
            // состояние; из меню без забега в G блок снимает sd_run/sd_meta
            // с диска как есть. Возвращает имя созданного блока
            saveBlockNow() {
                if (this.live) { this.saveRun(); this.persistMeta(); }
                return globalThis.GAME_META.saveBlock(
                    globalThis.GAME_META.loadRun(),
                    globalThis.GAME_META.loadMeta());
            },
            // Кнопка «Загрузить» в настройках: блок сначала возвращается
            // на диск (F5 поднимет именно его), затем мета и забег
            // применяются к G — как при буте и «Продолжить». Блок без
            // забега (писался из меню до начала игры) — только мета,
            // сцена не меняется. Возвращает имя блока или null
            loadBlock(name) {
                const b = globalThis.GAME_META.readBlock(name);
                if (!b) return null;
                globalThis.GAME_META.restoreBlock(b);
                const metaState = buildMetaState(b.meta);
                this.deck = metaState.deck;
                this.collection = metaState.collection;
                this.heroDecks = metaState.heroDecks;
                this.captured = metaState.captured;
                this.heroId = metaState.heroId;
                this.starterId = metaState.starterId;
                if (b.run) applySavedRun(b.run);
                else this.live = false;
                return b.name;
            },
            // поражение в бою: случайная карта колоды теряется НАВСЕГДА
            // (просил юзер — вместо сброса забега). Списывается и из
            // коллекции, иначе редактор колоды вернул бы её бесплатно.
            // Возвращает id потерянной карты или null, если колода пуста.
            loseCard() {
                if (!this.deck.length) return null;
                const id = this.deck.splice((Math.random() * this.deck.length) | 0, 1)[0];
                if (this.collection[id]) this.collection[id] = Math.max(0, this.collection[id] - 1);
                this.persistMeta(); // колода активного героя — она же G.deck
                return id;
            },
            // Итог поражения после потери карты (просил юзер): колода меньше
            // минимума этажа — «deck» (запереть игрока в редакторе колоды
            // до сбора минимума); набрать минимум нельзя даже из коллекции
            // (сумма карт доступных стихий всех героев игрока — коллекция
            // общая и уже включает копии в колодах) — «newGame», проигрыш;
            // иначе «dungeon» — обычный реванш.
            lossAftermath() {
                const D = globalThis.GAME_DATA;
                // минимум контекста боя (просил юзер): открытый мир — 12
                // (стартовые колоды), подземелье — 15+этаж (вход 16)
                const min = this.worldFrom ? D.deckMinFor(1)
                    : D.caveDeckFor(this.run && this.run.cave, this.run && this.run.floor ? this.run.floor : 1);
                if (this.deck.length >= min) return "dungeon";
                const heroes = [this.starterId, ...(this.captured || [])];
                const reach = heroes.some((h) => {
                    const elems = (D.HEROES[h] || D.HEROES.gorbag).elems;
                    let n = 0;
                    for (const id in this.collection)
                        if (this.collection[id] > 0 && D.CARDS[id]
                            && elems.includes(D.CARDS[id].elem)) n += this.collection[id];
                    return n >= min;
                });
                return reach ? "deck" : "newGame";
            },
        };
        // ── Ховер-увеличение карточки героя в HUD (просил юзер) ────────────
        // Зона наведения — исходное место карточки (hitArea держателя не
        // едет, нет дребезга на границе), сам спрайт плавно растёт до
        // натурального размера текстуры (scale 1, 230×338) и уменьшается
        // обратно. bigX/bigY — позиция увеличенного спрайта относительно
        // держателя (подгон, чтобы карточка не вылезала за экран).
        const hoverAnims = [];
        app.ticker.add(() => {
            for (let i = hoverAnims.length - 1; i >= 0; i--) {
                const a = hoverAnims[i];
                if (a.sp.destroyed) { hoverAnims.splice(i, 1); continue; }
                const tgt = a.on ? a.big : a.base;
                if (a.sp.x === tgt.x && a.sp.y === tgt.y && a.sp.scale.x === tgt.s) continue;
                a.sp.position.set(a.sp.x + (tgt.x - a.sp.x) * 0.22,
                    a.sp.y + (tgt.y - a.sp.y) * 0.22);
                a.sp.scale.set(a.sp.scale.x + (tgt.s - a.sp.scale.x) * 0.22);
                if (Math.abs(tgt.x - a.sp.x) < 0.5 && Math.abs(tgt.y - a.sp.y) < 0.5
                    && Math.abs(tgt.s - a.sp.scale.x) < 0.004) {
                    a.sp.position.set(tgt.x, tgt.y);
                    a.sp.scale.set(tgt.s);
                    if (!a.on) a.back(); // сжатие досчиталось — слой вернуть
                }
            }
        });
        const heroHover = (holder, sp, bigX, bigY) => {
            const a = {
                sp,
                holder,
                base: { x: sp.x, y: sp.y, s: sp.scale.x },
                big: { x: bigX, y: bigY, s: 1 },
                on: false,
                z: -1, // слой держателя до увеличения
                back() { // держатель обратно в свой слой
                    if (a.z >= 0 && !holder.destroyed && holder.parent) {
                        holder.parent.addChildAt(holder,
                            Math.min(a.z, holder.parent.children.length - 1));
                        a.z = -1;
                    }
                },
            };
            holder.eventMode = "static";
            holder.on("pointerover", () => {
                a.on = true;
                // увеличенная карточка — поверх всего своего слоя (просил
                // юзер: карта врага наезжала на полоску хп базы и пряталась
                // под ней)
                if (a.z < 0 && holder.parent) {
                    a.z = holder.parent.getChildIndex(holder);
                    holder.parent.addChild(holder);
                }
            });
            holder.on("pointerout", () => {
                a.on = false;
                // курсор ушёл до начала роста (карточка в базовом размере,
                // тикеру нечего досчитывать) — слой вернуть сразу
                if (sp.x === a.base.x && sp.y === a.base.y && sp.scale.x === a.base.s) a.back();
            });
            hoverAnims.push(a);
        };

        const ctx = {
            app, world, ECS, COMPONENTS, DATA, worldContainer, addSystem,
            assets, uiTex, scheduler, input, camera, characters, charInput,
            heroSheet: heroSheets.strength, heroSheets, creatureSheets, G, ui, audio, collide,
            worldSheets, // нарезки листов местности images/tiles (карта мира)
            treeTex,     // спрайты деревьев images/tiles/trees (лесные массивы)
            roadsTex,    // тайлы дорог images/tiles/roads.png (11 видов)
            moatsTex,    // тайлы мостов images/tiles/moats.png (11 видов)
            moatsCityTex, // мосты городов moats_64.png (64px, 1:1)
            mountainTex, // спрайты гор images/tiles/montain (слой объектов)
            caveTex,     // спрайт пещеры подземелий images/tiles/cave.png
            cityTex,     // спрайты городов мира images/sities/<стихия>/{0,1}
            sfx: gameSfx,   // ctx.sfx() — клик UI (step); ctx.sfx("chpoc") — событие
            music: gameMusic, // музыка сцены: "menu" | "dungeon" | "battle"
            footstep: footstepTick, // шаги героя: сцены тикают позицией героя
            heroHover,        // ctx.heroHover(держатель, спрайт, bigX, bigY)
            applySavedRun,    // подъём забега из сейва — меню «Продолжить» (W64)
            questModal: 0,    // открыт модальный квест-диалог (мир/подземелье стоят)
        };

        const scenes = createScenes({ addSystem });
        ctx.scenes = scenes;
        const t = (k, v) => GAME_LOC.t(k, v);

        // Поднять забег из сейва (sd_run или блока сохранения) в G и
        // продолжить игру: герой внутри пещер — в подземелье, иначе — в
        // открытый мир. Одно место для «Продолжить» в меню и «Загрузить»
        // в настройках (просил юзер).
        function applySavedRun(r) {
            // бой в сейв не входит: из арены выведет её exit() — здесь
            // только гасим ссылки на врага и накопленные награды драфта
            G.battle = null;
            G.activeEnemy = null;
            G.rewardDeck = null;
            G.rewardDraft = false;
            G.draft = null;
            G.draftBattle = false;
            G.live = true;
            G.hero = { hp: r.hero.hp, maxHp: r.hero.maxHp };
            G.gold = r.gold || 0;
            G.days = r.days || 0;
            // ресурсы стихий/бустеры (W40)
            G.resources = r.resources;
            G.boosters = r.boosters;
            G.elem = r.elem;
            G.heroId = r.heroId;
            G.starterId = r.starterId;
            // этажи поднимаются как есть; архив адресуется «данж:этаж»
            G.dungeon = r.dungeon || null;
            G.dungeonStates = {};
            for (const k in (r.dungeonStates || {})) {
                const st = r.dungeonStates[k];
                if (!st) continue;
                G.dungeonStates[st.cave + ":" + st.floor] = st;
            }
            if (!G.dungeon) G.dungeon = G.dungeonStates[r.cave + ":" + r.floor] || null;
            if (G.dungeon && !G.dungeon.city)
                G.dungeonStates[G.dungeon.cave + ":" + G.dungeon.floor] = G.dungeon;
            if (G.dungeon)
                // «Продолжить» ставит героя к прибытию у лестницы: без
                // остывание — мгновенный подъём на этаж выше (остальные
                // пути входа ставят его же: world.js, спуск dungeon.js)
                G.dungeon.ladderCoolMs = 2000;
            // города (W30; W70 — ключ «стихия|роль» по флагам состояния,
            // старые ключи-стихии перечитываются в новую схему)
            G.cityStates = {};
            for (const k in (r.cityStates || {})) {
                const st = r.cityStates[k];
                if (st) G.cityStates[st.elem + (st.isCapital ? "|cap"
                    : st.homeCity ? "|home" : "|town")] = st;
            }
            G.cityOut = r.cityOut || null;
            // глубина у каждого подземелья своя; активное — где герой
            G.run.floor = r.floor;
            G.run.cave = G.dungeon ? G.dungeon.cave : r.cave;
            // глубины всех данжей каталога: новые подземелья не должны
            // терять прогресс при «Продолжить»
            const caveIds = Object.keys(globalThis.GAME_DATA.CAVES);
            G.run.floors = Object.fromEntries(
                caveIds.map((c) => [c, r.floors[c] || 1]));
            // глобальная карта: сид из сейва восстанавливает ту же карту
            // (детерминированная генерация — worldGen.js)
            G.world = {
                seed: r.worldSeed,
                heroPos: r.worldPos || null,
                out: !!r.worldOut,
                // W60: вход КАКОГО данжа ждать при out (сейв хранит)
                outCave: r.worldOutCave || null,
                // отряды: жив/мёртв и позиции
                wander: r.worldWander || null,
                // стихия точки появления (W31): смена героя — перенос
                // в зону новой стихии (world.enter)
                startElem: r.worldStartElem || null,
                // стартовый город новой игры и вход в него (W67, юзер):
                // старые сейвы поля не имеют (null) — свечение им не показывается
                startCity: r.worldStartCity || null,
                startCitySeen: !!r.worldStartCitySeen,
                // дикие враги: уровень видов (победы над одноимёнными
                // усиливают всех — W29)
                wildLevel: r.worldWild || null,
                // побочные квесты ратуши (W40)
                sideQuests: r.worldSideQ || null,
                map: null,
            };
            // сюжетная линия забега
            G.quests = globalThis.GAME_QUESTS.revive(r.quests);
            // продолжение с середины этажа — в подземелье, иначе — в
            // открытый мир (герой вышел из пещер или только начал);
            // решает ОТФИЛЬТРОВАННОЕ состояние (G.dungeon), не сейв.
            // Переход в текущую сцену — транзитом floorSwap (сцены не
            // умеют перезаходить в себя)
            const target = G.dungeon ? "dungeon" : "world";
            if (scenes.current === target) {
                floorSwap.next = target;
                scenes.go("floorSwap");
            } else scenes.go(target);
        }
        // ── Сцены «Меню» и «Выбор героя» — menuScene.js (W64) ─────────────
        globalThis.GAME_MENU_SCENE.createMenuScene(ctx);

        // ── Открытый мир, подземелье, арена, колода, награда, настройки ──
        const worldScene = GAME_WORLD.createWorldScene(ctx);
        scenes.add("world", worldScene);
        // транзит между этажами: сцены не умеют перезаходить в себя
        // (createScenes игнорирует go() в текущую), лестница наверх ходит
        // этажами через этот ретранслятор. next — целевая сцена транзита
        // (по умолчанию подземелье; «Загрузить» из настроек подставляет
        // и мир), после прогона сбрасывается обратно
        const floorSwap = {
            next: "dungeon",
            enter() { const to = this.next; this.next = "dungeon"; scenes.go(to); },
        };
        scenes.add("floorSwap", floorSwap);
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
            scenes, G, ui, app, loc: GAME_LOC,
            dungeon: dungeonScene, arena: arenaScene, world: worldScene,
            arenaApi: arenaScene.api, deckApi: deckScene.api,
            rewardApi: rewardScene.api, settingsApi: settingsScene.api,
            draftApi: draftScene.api, worldApi: worldScene.api,
            // тест-хук W22: активные следы кликов (кольцо + точки пути)
            clickFxs: () => (ctx.__clickFxs
                ? [...ctx.__clickFxs].map((f) => ({ ...f })) : []),
            questApi: {
                state: () => globalThis.GAME_QUESTS.stateOf(G),
                dialog: () => globalThis.GAME_QUESTS.dialogInfo(),
                tap: () => globalThis.GAME_QUESTS.tap(),
                tapDecline: () => globalThis.GAME_QUESTS.tapDecline(),
                modal: () => (ctx.questModal || 0) > 0,
                close: () => globalThis.GAME_QUESTS.forcedClose(ctx),
                review: () => globalThis.GAME_QUESTS.showReview(ctx),
            },
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
                heroId: G.heroId, elem: G.elem, cave: G.run.cave,
                resources: { ...G.resources },
                boosters: { ...G.boosters },
                sideQuests: globalThis.GAME_SIDEQ
                    ? globalThis.GAME_SIDEQ.stateOf(G) : null,
                quests: globalThis.GAME_QUESTS.stateOf(G),
                // герои: активный, завоёванные карты, колоды по героям
                heroes: {
                    captured: [...G.captured],
                    decks: Object.fromEntries(
                        Object.entries(G.heroDecksOf()).map(([k, v]) => [k, v.length])),
                },
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
                world: {
                    heroPos: G.world.heroPos ? { ...G.world.heroPos } : null,
                    out: !!G.world.out,
                    seed: G.world.seed ?? null,
                    pois: G.world.map ? G.world.map.pois.length : 0,
                },
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
