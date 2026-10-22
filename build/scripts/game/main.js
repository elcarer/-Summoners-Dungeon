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
            "icon_gold", "icon_map", "icon_rune", "icon_setting", "icon_shop",
            "panel_1", "panel_2", "panel_allert", "panel_buff", "panel_buff_circle",
            "panel_down", "panel_label", "panel_minimap", "panel_skill", "panel_top",
            "portrate_hero", "sign_mana", "sign_shield", "start_back",
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
        // эффект поля «Стена костров» и рубашки колод по стихиям
        // (гоблины/природа/мудрость)
        uiTextures["effects/fire.png"] = await assets.loadTexture("./images/effects/fire.png");
        uiTextures["card_goblin_back.png"] = await assets.loadTexture("./images/ui/card_goblin_back.png");
        uiTextures["card_nature_back.png"] = await assets.loadTexture("./images/ui/card_nature_back.png");
        uiTextures["card_wisdom_back.png"] = await assets.loadTexture("./images/ui/card_wisdom_back.png");
        // тайлы подземелий юзера: images/dungeon_tiles/<данж>/<…>.png —
        // полы 64×64 (floor/0-9) и стены walls/* по маске соседей.
        // Свой набор на каждый данж: goblins_lair (Сила), growth_lair (Рост)
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
        for (const lair of ["goblins_lair", "growth_lair"]) {
            for (const f of TILE_FILES) {
                uiTextures[`dungeon_tiles/${lair}/${f}.png`] =
                    await assets.loadTexture(`./images/dungeon_tiles/${lair}/${f}.png`);
            }
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
        // карточки героев (выбор при «Новой игре» + HUD): images/heroes/<…>.png
        say("герои…");
        await frame();
        for (const h of Object.values(GAME_DATA.HEROES)) {
            uiTextures[`heroes/${h.img}.png`] =
                await assets.loadTexture(`./images/heroes/${h.img}.png`);
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
            wolf: await assets.loadCharacter("./images/sprites/wolf_256"),
            bear: { ...(await assets.loadCharacter("./images/sprites/bear_256")), scale: 1.1 },
            ent: { ...(await assets.loadCharacter("./images/sprites/ent_256")), scale: 1.3 },
            plant: { ...(await assets.loadCharacter("./images/sprites/plant_256")), scale: 0.8 },
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
        // У старых сейвов поля starterId нет — выводим его из колод по
        // героям (после смены активного стартовый там остаётся).
        function savedStarterId() {
            if (savedMeta && HERO_ORDER.includes(savedMeta.starterId))
                return savedMeta.starterId;
            const decks = savedMeta && savedMeta.heroDecks;
            if (decks && typeof decks === "object") {
                const fromDecks = HERO_ORDER.find((id) => Array.isArray(decks[id]));
                if (fromDecks) return fromDecks;
            }
            if (savedMeta && HERO_ORDER.includes(savedMeta.activeHeroId))
                return savedMeta.activeHeroId;
            return HERO_ORDER[0];
        }
        // активный герой тоже переживает перезапуск (его меняют в «Героях»)
        const savedActiveId = savedMeta && GAME_DATA.HEROES[savedMeta.activeHeroId]
            ? savedMeta.activeHeroId : "gorbag";

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
        // если коллекция опустела или в старой НЕПУСТОЙ колоде не осталось
        // валидных карт — новые базовые значения.
        const savedDeck = savedMeta ? savedMeta.deck.filter((id) => GAME_DATA.CARDS[id]) : [];
        // Пустая колода — НОРМА для завоёванного героя (начинает без карт,
        // просил юзер); стартовую подставляем только совсем старому сейву,
        // где все id отфильтровались миграцией.
        const deckNeedsDefault = !savedMeta
            || (savedMeta.deck.length > 0 && savedDeck.length === 0);
        const savedColl = savedMeta
            ? Object.fromEntries(Object.entries(savedMeta.collection || {})
                .filter(([id]) => GAME_DATA.CARDS[id]))
            : {};

        const G = {
            hero: { hp: 10, maxHp: 10 }, gold: 0,
            run: { floor: 1, cave: "gob", floors: { gob: 1, grw: 1 } },
            heroId: savedActiveId, // активный герой забега (можно сменить в «Героях»)
            starterId: savedStarterId(), // выбранный при «Новой игре» — не меняется
            elem: "strength", // стихия забега — из героя, задаёт стартовую колоду
            settings,
            deck: deckNeedsDefault ? [...DEFAULT_DECK] : savedDeck,
            collection: Object.keys(savedColl).length ? savedColl : { ...DEFAULT_COLLECTION },
            // колода каждого героя своя (переключение во вкладке «Герои»);
            // heroDecks[heroId] всегда указывает на АКТИВНУЮ G.deck
            heroDecks: savedMeta && savedMeta.heroDecks ? savedMeta.heroDecks : null,
            // завоёванные карты персонажей противников (просил юзер)
            captured: savedMeta && Array.isArray(savedMeta.captured) ? savedMeta.captured : [],
            dungeon: null, activeEnemy: null, battle: null,
            world: { heroPos: null, out: false }, // открытый мир: где герой
            dungeonStates: {}, // этажи подземелий, ключ «данж:этаж» (gob:1, grw:2…)
            // (враги/объекты этажа остаются как их оставили),
            rewardDeck: null, // колода побеждённого — пул трофея «1 из 3»
            wonHero: null, // карта персонажа, завоёванная в последнем бою
            rewardDraft: false, // трофей — выбор из всей драфт-колоды (драфт)
            draft: null, // мини-игра «Карта сокровищ»: picks/ePicks/objIdx
            draftBattle: false, // текущий бой — драфт-бой (итог ведёт в подземелье)
            uiReturn: null, // откуда открыты настройки/колода (кнопка «Назад»)
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
                    dungeon: this.dungeon ? JSON.parse(JSON.stringify(this.dungeon)) : null,
                    dungeonStates: JSON.parse(JSON.stringify(this.dungeonStates || {})),
                    worldPos: this.world.heroPos,
                    worldOut: this.world.out,
                });
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
            sfx: gameSfx,   // ctx.sfx() — клик UI; ctx.sfx("sword") — событие боя
            music: gameMusic, // музыка сцены: "menu" | "dungeon" | "battle"
            heroHover,        // ctx.heroHover(держатель, спрайт, bigX, bigY)
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
                    // герой из сейва; у старых сейвов heroId ещё нет —
                    // герой восстанавливается по стихии забега
                    G.heroId = globalThis.GAME_DATA.HEROES[r.heroId]
                        ? r.heroId
                        : (G.elem === "growth" ? "elmir" : "gorbag");
                    // у старых сейвов забега поля нет — стартовый остаётся
                    // из sd_meta (с миграцией)
                    if (HERO_ORDER.includes(r.starterId)) G.starterId = r.starterId;
                    // поднимаются только этажи текущей геометрии (MAP_V —
                    // теперь тайлы 64px goblins_lair): сейвы волн с другой
                    // сеткой пересоберутся. Архив адресуется «данж:этаж»;
                    // у старых сейвов (одни гоблинские пещеры) данж по
                    // умолчанию gob
                    const mapV = GAME_DUNGEON.MAP_V;
                    G.dungeon = r.dungeon && r.dungeon.v === mapV ? r.dungeon : null;
                    if (G.dungeon && !G.dungeon.cave) G.dungeon.cave = "gob";
                    G.dungeonStates = {};
                    for (const k in (r.dungeonStates || {})) {
                        const st = r.dungeonStates[k];
                        if (!st || st.v !== mapV) continue;
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
                    // герой задаёт стихию/стартовую колоду/жизни базы —
                    // сначала выбор героя (юзер)
                    scenes.go("heroPick");
                });
                addMenuBtn(t("menu.deck"), 960, 810, () => scenes.go("deck"));
                addMenuBtn(t("menu.settings"), 960, 900, () => scenes.go("settings"));
                addMenuBtn(t("menu.exit"), 960, 990, () => {
                    // выйти по-настоящему: в Electron window.close() закрывает
                    // окно (и приложение), браузер обычно запрещает закрытие
                    // вкладки, открытой не скриптом — тогда остаётся «До встречи»
                    try { window.close(); } catch (e) { /* блокировка браузера */ }
                    setTimeout(() => {
                        if (menuRoot && !window.closed)
                            menuRoot.userData.bye.visible = true;
                    }, 250);
                });
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

        // ── Сцена «Выбор героя» (новая игра) ──────────────────────────────
        // Герой задаёт жизни базы в бою, стихии колоды (и стартовую
        // колоду) и особую способность (просил юзер). Карточки — полные
        // лица юзера images/heroes/<img>.png 230×338; подписи под ними.
        let epRoot = null;
        scenes.add("heroPick", {
            enter() {
                gameMusic("menu");
                epRoot = new PIXI.Container();
                epRoot.eventMode = "static";
                // фон выбора героя — картинка юзера images/ui/start_back.png
                // (1920×1080, карта мира); лёгкое затемнение — только чтобы
                // карточки героев и заголовок читались
                const bg = new PIXI.Sprite(uiTex("start_back.png"));
                const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
                bg.scale.set(s);
                bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
                epRoot.addChild(bg);
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.22 });
                epRoot.addChild(dim);

                const title = T(t("menu.pickHero"), 96, 0xf0c96a,
                    { stroke: { color: 0x241505, width: 9 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 44);
                title.eventMode = "none";
                epRoot.addChild(title);
                const sub = T(t("menu.pickHeroSub"), 30, 0xd8c79d);
                sub.anchor.set(0.5, 0);
                sub.position.set(960, 190);
                sub.eventMode = "none";
                epRoot.addChild(sub);

                const cards = [];
                // раскладка в 1 ряд: 2 героя — как раньше, 3+ — плотнее, чтобы
                // панель (480px) влезала в экран (Мира — третий, просил юзер)
                const gap = Math.min(720, 1400 / Math.max(1, GAME_DATA.HERO_ORDER.length - 1));
                GAME_DATA.HERO_ORDER.forEach((id, k) => {
                    const h = GAME_DATA.HEROES[id];
                    const cx = 960 + (k - (GAME_DATA.HERO_ORDER.length - 1) / 2) * gap;
                    const c = new PIXI.Container();
                    c.position.set(cx, 610);
                    const panel = new PIXI.Graphics();
                    panel.roundRect(-240, -330, 480, 700, 22);
                    panel.fill({ color: 0x171310, alpha: 0.94 });
                    panel.stroke({ width: 4, color: 0x6b5c40 });
                    c.addChild(panel);
                    const face = new PIXI.Sprite(uiTex(`heroes/${h.img}.png`));
                    face.anchor.set(0.5, 0);
                    face.scale.set(1.15); // 230×338 → ~264×389
                    face.position.set(0, -305);
                    c.addChild(face);
                    const name = T(t(`hero.${id}.name`), 44, 0xf0c96a,
                        { stroke: { color: 0x241505, width: 7 } });
                    name.anchor.set(0.5, 0);
                    name.position.set(0, 112);
                    name.eventMode = "none";
                    c.addChild(name);
                    const statLine = T(
                        `${t("hero.baseLine", { n: h.baseHp })}   ·   ${
                            t("hero.elemLine", { elems: h.elems.map((e) => t("elem." + e)).join(", ") })
                        }`,
                        24, 0xd8c79d);
                    statLine.anchor.set(0.5, 0);
                    statLine.position.set(0, 170);
                    statLine.eventMode = "none";
                    c.addChild(statLine);
                    const abil = T(t("hero.abilityLabel", { text: t(`hero.${id}.ability`) }),
                        23, 0xbfd489, { wordWrap: true, wordWrapWidth: 430, align: "center" });
                    abil.anchor.set(0.5, 0);
                    abil.position.set(0, 214);
                    abil.eventMode = "none";
                    c.addChild(abil);
                    c.eventMode = "static";
                    // подсветка наведения — отдельная рамка с альфой (повторный
                    // Graphics.stroke дописывает команду, а не заменяет её)
                    const glow = new PIXI.Graphics();
                    glow.roundRect(-240, -330, 480, 700, 22);
                    glow.stroke({ width: 5, color: 0xf0c96a });
                    glow.alpha = 0;
                    c.addChild(glow);
                    c.on("pointerover", () => { glow.alpha = 1; });
                    c.on("pointerout", () => { glow.alpha = 0; });
                    c.on("pointertap", () => {
                        if (ctx.sfx) ctx.sfx();
                        GAME_META.clearRun();
                        G.resetRun(id);
                        scenes.go("world"); // новый забег — в открытом мире
                        G.saveRun(); // свежий забег сразу сохранён
                    });
                    epRoot.addChild(c);
                    cards.push({ id, node: c, x: cx, y: 610 });
                });
                epRoot.addChild(menuButton("button_menu.png", t("settings.back"), 165, 78, 1,
                    () => scenes.go("menu")));
                window.__GAME.heroPick = {
                    options: () => cards.map((c) => ({ id: c.id, x: c.x, y: c.y })),
                    pick(heroId) {
                        const c = cards.find((x) => x.id === heroId);
                        if (c) c.node.emit("pointertap");
                    },
                };
                ui.addChild(epRoot);
                worldContainer.visible = false;
            },
            exit() {
                window.__GAME.heroPick = null;
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
                heroId: G.heroId, elem: G.elem, cave: G.run.cave,
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
