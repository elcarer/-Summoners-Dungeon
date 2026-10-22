// ЛОГИКА ПОВЕРХ ДАННЫХ КАРТ (сами карты, персонажи и правила колод —
// в cardsData.js): стартовые коллекции, минимум колоды по этажу, пулы
// наград, энкаунтеры подземелья, колоды врагов, магазин.
(function () {
    const { CARDS, RARITY_COLORS, DEFAULT_DECK, STARTER_DECKS,
            DECK_MAX, DECK_MIN, DECK_COPIES, TRAP_SLOTS,
            ELEM_LOGO, HEROES, HERO_ORDER, HERO_FOE_ORDER } =
        globalThis.GAME_CARD_DATA;

    // Стартовый реестр коллекции: все карты игры по нулям + копии стартера
    function starterCollection(starter) {
        const coll = {};
        for (const id of Object.keys(CARDS)) coll[id] = 0;
        for (const id of starter) coll[id] = (coll[id] || 0) + 1;
        return coll;
    }
    const STARTER_COLLECTIONS = {
        strength: starterCollection(DEFAULT_DECK),
        growth: starterCollection(STARTER_DECKS.growth),
        wisdom: starterCollection(STARTER_DECKS.wisdom), // стартер Миры
    };
    const DEFAULT_COLLECTION = STARTER_COLLECTIONS.strength;
    // Актуальный минимум колоды НА этаже забега (просил юзер): этаж N
    // достигнут спуском с этажа N−1, требовавшим 12+(N−1) карт, — минимум
    // поднимается вместе с ним: этаж 1 — 12, этаж 2 — 13, … (база DECK_MIN)
    function deckMinFor(floor) {
        return Math.min(DECK_MAX, DECK_MIN + Math.max(0, (floor | 0) - 1));
    }

    // Пул наград «1 из 3» — запасной (сейчас трофеи берутся из колоды
    // побеждённого врага; пул работает для старых сейвов/прямых заходов).
    // Вес повторами — обычные чаще, эпик реже.
    const REWARD_POOL = [
        "str1", "str1", "str1", "str2", "str2", "str2",
        "str3", "str3", "str3", "str4", "str4", "str4",
        "str9", "str9", "str9", "str12", "str12", "str12",
        "str15", "str15", "str15", "str16", "str16", "str16",
        "str22", "str22", "str22", "str23", "str23", "str23",
        "str26", "str26", "str26", "str29", "str29", "str29",
        "str30", "str30", "str30", "str31", "str31", "str31",
        "str32", "str32", "str32", "str33", "str33", "str33",
        "str34", "str34", "str34", "str35", "str35", "str35",
        "str36", "str36", "str36", "str38", "str38", "str38",
        "str5", "str5", "str7", "str7", "str11", "str11",
        "str13", "str13", "str14", "str14", "str17", "str17",
        "str19", "str19", "str20", "str20", "str24", "str24",
        "str27", "str27", "str37", "str37", "str39", "str39",
        "str6", "str8", "str10", "str18", "str21", "str25", "str28",
        "str40",
    ];
    // Пулы наград по стихиям: сундуки/магазины подземелья дают карты ЕГО
    // стихии (просил юзер: в гоблинских пещерах зелёные карты не встречаются)
    const REWARD_POOLS = {
        strength: REWARD_POOL,
        growth: ["grw1", "grw1", "grw1", "grw2", "grw2", "grw2",
                 "grw3", "grw3", "grw3", "grw4", "grw4", "grw4",
                 "grw5", "grw5", "grw5", "grw6", "grw6", "grw6",
                 "grw7", "grw7", "grw7", "grw8", "grw8", "grw8",
                 "grw10", "grw10", "grw10", "grw16", "grw16", "grw16",
                 "grw17", "grw17", "grw17", "grw19", "grw19", "grw19",
                 "grw9", "grw9", "grw11", "grw11", "grw12", "grw12",
                 "grw13", "grw13", "grw14", "grw14", "grw20", "grw20",
                 "grw25", "grw25", "grw21", "grw22", "grw23", "grw24",
                 "grw26", "grw15", "grw18",
                 "grw29", "grw29", "grw29", "grw27", "grw27",
                 "grw28", "grw28", "grw30", "grw31",
                 // 72–75: обычные ×3, редкая ×2, эпическая ×1
                 "grw34", "grw34", "grw34", "grw35", "grw35", "grw35",
                 "grw32", "grw32", "grw33",
                 // 76–80: редкие ×2, эпическая ×1
                 "grw36", "grw36", "grw37", "grw37", "grw38", "grw38",
                 "grw39", "grw39", "grw40"],
        // Мудрость: карты 81–90 обычные ×3, 91–95 редкие ×2, 96 эпическая ×1;
        // пул нужен для будущих сундуков/магазинов «Подземных ключей» (81–96)
        wisdom: ["wis81", "wis81", "wis81", "wis82", "wis82", "wis82",
                 "wis83", "wis83", "wis83", "wis84", "wis84", "wis84",
                 "wis85", "wis85", "wis85", "wis86", "wis86", "wis86",
                 "wis87", "wis87", "wis87", "wis88", "wis88", "wis88",
                 "wis89", "wis89", "wis89", "wis90", "wis90", "wis90",
                 "wis91", "wis91", "wis92", "wis92", "wis93", "wis93",
                 "wis94", "wis94", "wis95", "wis95", "wis96"],
    };

    // ── Враги по глубине (просил юзер) ────────────────────────────────────
    // Архетипы врагов: core — ядро колоды, всегда целиком; добор — только
    // у боссов (enemyDeck): чем глубже, тем больше карт и тем выше доля
    // редких и эпических. На каждом этаже — свои архетипы (FLOOR_MOBS).
    // Название — ключ локализации enc.<id>.title; scene — фон арены.
    // hero — карта персонажа противника (ключ HEROES): её baseHp — жизни
    // базы врага в бою (10/11/12/13/14/18 по картам юзера), победа над
    // врагом добавляет карту в коллекцию героев. Без hero (драфт, Роща)
    // действует baseHp как раньше.
    const ENCOUNTERS = {
        // «Банда гоблинов» — первый этаж: только обычные карты
        gob:      { scene: 1, baseHp: 10, hero: "gob",
                    core: ["str1", "str1", "str2", "str3", "str4", "str15",
                           "str26"] },
        // «Гоблины-мародёры» — обычные + первые редкие (лучник, наездник)
        gobBig:   { scene: 1, baseHp: 11, hero: "gobBig",
                    core: ["str1", "str2", "str3", "str4", "str9", "str9",
                           "str13", "str16", "str23"] },
        // «Засада гоблинов» — ловушечная колода (мина, приманка, засада),
        // трусливый гоблин — бесплатная стена в коридоре поля
        gobTrap:  { scene: 2, baseHp: 12, hero: "gobTrap",
                    core: ["str3", "str6", "str6", "str12", "str12", "str14",
                           "str14", "str20", "str20", "str29"] },
        // «Гоблины-поджигатели» — заклинательная колода (огонь, огнешары,
        // горящие руны)
        gobFire:  { scene: 2, baseHp: 13, hero: "gobFire",
                    core: ["str2", "str9", "str9", "str19", "str21", "str22",
                           "str23", "str24", "str24", "str25"] },
        // «Свита вождя» — элитные редкие (лагерь, шаман, вождь, стяги)
        gobElite: { scene: 1, baseHp: 14, hero: "gobElite",
                    core: ["str3", "str5", "str7", "str7", "str8", "str13",
                           "str13", "str16", "str30"] },
        // «Мастера огня» — огненная колода (просил юзер): огнешары, стены
        // костров, алтари, руны; герой возвращает первое Силовое заклинание
        gobMaster: { scene: 1, baseHp: 15, hero: "gobMaster",
                     core: ["str24", "str24", "str21", "str21", "str10",
                            "str19", "str19", "str23", "str23", "str28",
                            "str40"] },
        // «Гоблин-вождь» — главарь этажа (B на карте). Ядро — 10 карт элиты
        // (составом просил юзер); с глубиной добавляются карты из grow
        // (2 за этаж; часть пересекается с ядром — дубликаты в колоде
        // врага легальны), плюс общий добор — только боссу (просил юзер)
        boss:     { scene: 2, baseHp: 18, hero: "boss",
                    core: ["str8", "str7", "str13", "str29", "str30", "str11",
                           "str16", "str31", "str18", "str5"],
                    grow: ["str5", "str6", "str7", "str8", "str16", "str17",
                           "str18", "str21", "str24", "str28"] },
        // «Соперник по драфту» — бой мини-игры «Карта сокровищ»: колода
        // НЕ генерится ядром (enemyDeck), её кладёт драфт-сцена из карт,
        // что соперник забрал себе при выборе. База 15 — зеркально игроку.
        draft:    { scene: 1, baseHp: 15, core: [] },

        // ── «Роща Роста» (второе подземелье, стихия «Рост») ───────────────
        // Каталог Роста — 40 карт (глаза юзера 41–80), свой архетип на этаж
        // (FLOOR_MOBS_GROWTH, принципы гоблинских пещер — просил юзер):
        // «Лесные звери» — звери и усиления, «Роща лоз» — контроль и добор,
        // дальше — свежий архетип каждого этажа; босс собирает всё и с
        // глубиной добирает grow-карты (механика вождя гоблинов). hero —
        // карта персонажа: baseHp — жизни базы врага, победа даёт карту
        grwBeasts: { scene: 1, baseHp: 10, elem: "growth", hero: "grwBeasts",
                     core: ["grw2", "grw2", "grw3", "grw3", "grw13", "grw22",
                            "grw24", "grw5", "grw5", "grw10", "grw12"] },
        grwGrove:  { scene: 1, baseHp: 11, elem: "growth", hero: "grwGrove",
                     core: ["grw4", "grw4", "grw19", "grw19", "grw17", "grw23",
                            "grw7", "grw8", "grw8", "grw16", "grw27"] },
        grwWild:   { scene: 1, baseHp: 12, elem: "growth", hero: "grwWild",
                     core: ["grw1", "grw1", "grw6", "grw6", "grw20", "grw29",
                            "grw34", "grw34", "grw35", "grw35", "grw40"] },
        grwMagic:  { scene: 1, baseHp: 13, elem: "growth", hero: "grwMagic",
                     core: ["grw14", "grw14", "grw20", "grw23", "grw25",
                            "grw30", "grw30", "grw32", "grw32", "grw37",
                            "grw28"] },
        grwCity:   { scene: 1, baseHp: 14, elem: "growth", hero: "grwCity",
                     core: ["grw6", "grw10", "grw10", "grw11", "grw13", "grw15",
                            "grw19", "grw21", "grw38", "grw38", "grw39",
                            "grw39"] },
        grwControl: { scene: 1, baseHp: 15, elem: "growth", hero: "grwControl",
                      core: ["grw26", "grw23", "grw18", "grw18", "grw22",
                             "grw33", "grw17", "grw1", "grw9", "grw3",
                             "grw24"] },
        // «Хранитель рощи» — главарь этажа (B на карте). Ядро — 11 карт
        // (составом просил юзер); с глубиной добавляются карты из grow
        // (2 за этаж; к 6-му забирает весь список), плюс общий добор —
        // только боссу (просил юзер).
        grwBoss:   { scene: 1, baseHp: 18, elem: "growth", hero: "grwBoss",
                     core: ["grw3", "grw3", "grw13", "grw12", "grw15", "grw18",
                            "grw9", "grw22", "grw36", "grw40", "grw1"],
                     grow: ["grw24", "grw28", "grw31", "grw2", "grw26", "grw25",
                            "grw21", "grw38", "grw33", "grw30"] },
        // ── «Подземные ключи» (третье подземелье, стихия «Мудрость») ──────
        // Пока только первый этаж (просил юзер): «Дуновение опасности» —
        // база 10♥, ядро 11 карт по спеке (81×3, 85×3, 86×3, 88, 94).
        // Арена — scenes/3.png (подводная пещера, уже лежала в арте).
        wisBreeze: { scene: 3, baseHp: 10, elem: "wisdom", hero: "wisBreeze",
                     core: ["wis81", "wis81", "wis81", "wis85", "wis85",
                            "wis85", "wis86", "wis86", "wis86", "wis88",
                            "wis94"] },
    };
    // Подземелья открытого мира: стихия (пул наград/драфта) и кап глубины.
    // У «Подземных ключей» пока один этаж и нет главаря (B на карте не
    // ставится) — юзер пришлёт следующие этажи/босса отдельно.
    const CAVES = {
        gob: { elem: "strength", maxFloor: 6, boss: "boss" },      // Гоблинские пещеры
        grw: { elem: "growth", maxFloor: 6, boss: "grwBoss" },     // Роща Роста
        wis: { elem: "wisdom", maxFloor: 1 },                      // Подземные ключи
    };
    // Этаж → какие обычные враги на нём водятся; после конца списка — набор
    // для самых глубоких этажей. Босс (B) есть на каждом этаже данжа,
    // у которого в CAVES задан `boss`.
    const FLOOR_MOBS = [
        ["gob", "gob"],                       // 1
        ["gob", "gobBig"],                    // 2
        ["gobBig", "gobTrap"],                // 3
        ["gobTrap", "gobFire"],               // 4
        ["gobFire", "gobElite"],              // 5
        ["gobElite", "gobMaster"],            // 6+ (просил юзер)
    ];
    // Этажи «Рощи Роста»: каждый этаж приводит свой архетип, принципы —
    // как в гоблинских пещерах (просил юзер); на 6+ правят два старших
    const FLOOR_MOBS_GROWTH = [
        ["grwBeasts", "grwBeasts"],             // 1
        ["grwBeasts", "grwGrove"],              // 2
        ["grwGrove", "grwWild"],                // 3
        ["grwWild", "grwMagic"],                // 4
        ["grwMagic", "grwCity"],                // 5
        ["grwCity", "grwControl"],              // 6+ (просил юзер)
    ];
    // «Подземные ключи»: пока один этаж с одним архетипом (просил юзер)
    const FLOOR_MOBS_WISDOM = [
        ["wisBreeze", "wisBreeze"],             // 1
    ];
    const MOB_TABLES = { gob: FLOOR_MOBS, grw: FLOOR_MOBS_GROWTH,
                         wis: FLOOR_MOBS_WISDOM };
    // Пул добора колоды врага по редкости. Панельные карты (str11 жертва,
    // str25 руны, str26 путешествие) ИИ теперь разыгрывает сам — цель он
    // выбирает по своим приоритетам, без экрана (просил юзер).
    const ENEMY_FILL = {
        common: ["str1", "str2", "str3", "str4", "str9", "str12", "str13",
                 "str14", "str15", "str16", "str22", "str23", "str26",
                 "str29", "str30", "str31", "str32", "str33",
                 "str34", "str35", "str36", "str38"],
        rare:   ["str5", "str7", "str13", "str14", "str11", "str17", "str19",
                 "str20", "str24", "str27", "str37", "str39"],
        epic:   ["str6", "str8", "str10", "str18", "str21", "str25", "str28",
                 "str40"],
    };
    // Пулы добора по стихии архетипа: враги Роста добирают только зелёное,
    // и это ВСЕ 40 карт Роста — включая «Цветение кристаллов» и «Три
    // монолита» (ИИ играет всеми картами — просил юзер)
    const ENEMY_FILLS = {
        strength: ENEMY_FILL,
        growth: {
            common: ["grw1", "grw2", "grw3", "grw4", "grw5", "grw6",
                     "grw7", "grw8", "grw10", "grw16", "grw17", "grw19",
                     "grw29", "grw34", "grw35"],
            rare:   ["grw9", "grw11", "grw12", "grw13", "grw14", "grw20",
                     "grw25", "grw27", "grw28", "grw32", "grw36", "grw37",
                     "grw38", "grw39"],
            epic:   ["grw15", "grw18", "grw21", "grw22", "grw23", "grw24",
                     "grw26", "grw30", "grw31", "grw33", "grw40"],
        },
        // Мудрость: обычные 81–90, редкие 91–95, эпическая 96 — добор
        // будущих боссов «Подземных ключей» (ядро уже синее)
        wisdom: {
            common: ["wis81", "wis82", "wis83", "wis84", "wis85", "wis86",
                     "wis87", "wis88", "wis89", "wis90"],
            rare:   ["wis91", "wis92", "wis93", "wis94", "wis95"],
            epic:   ["wis96"],
        },
    };
    // Колода врага: ядро архетипа; весь добор — только боссу (просил
    // юзер): с глубиной (floor ≥ 1) +2 карты из grow за этаж и 3..8 карт
    // общего добора, в котором шанс эпических растёт от 0% (этаж 1) до
    // 45%, редких — до ~85%.
    function enemyDeck(encId, floor) {
        const enc = ENCOUNTERS[encId] || ENCOUNTERS.gob;
        const fills = ENEMY_FILLS[enc.elem] || ENEMY_FILL;
        const deck = [...enc.core];
        const f = Math.max(1, floor | 0);
        // маркер босса — grow-список (обычные враги играют ядром как есть)
        const boss = !!enc.grow;
        // рост босса: с каждым этажом +2 карты из grow (без повторов внутри
        // него) — на 1-м этаже он без них, к 6-му забирает весь список
        if (boss) {
            const pool = [...enc.grow];
            const take = Math.min((f - 1) * 2, pool.length);
            for (let k = 0; k < take; k++)
                deck.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
        }
        const extra = boss ? Math.min(3 + (((f - 1) / 2) | 0), 8) : 0;
        const epicP = Math.min(0.45, (f - 1) * 0.09);
        const rareP = Math.min(0.85, 0.25 + f * 0.12);
        // правило юзера: в колоде не больше 3 одинаковых карт — добор
        // пропускает карты, которые ядро/grow/предыдущий добор довели до трёх
        for (let k = 0; k < extra; k++) {
            const r = Math.random();
            let base = r < epicP ? fills.epic
                : r < epicP + rareP ? fills.rare : fills.common;
            const underCap = (pool) => pool.filter((id) =>
                deck.filter((c) => c === id).length < 3);
            // в стихии может не быть редких/эпических (Рост пока весь
            // обычный) — добор берёт обычные той же стихии
            if (!base.length && fills.common.length) base = fills.common;
            const free = underCap(base);
            if (!free.length) continue; // всё уже в трёх копиях — не нарушаем кап
            deck.push(free[(Math.random() * free.length) | 0]);
        }
        return deck;
    }
    // Обычный враг для этажа подземелья: случайный архетип из таблицы
    // этажа СВОЕГО данжа (пещеры / Роща Роста / Подземные ключи).
    function mobForFloor(cave, floor) {
        const rows = MOB_TABLES[CAVES[cave] ? cave : "gob"];
        const table = rows[Math.min(Math.max(1, floor | 0) - 1, rows.length - 1)];
        return table[(Math.random() * table.length) | 0];
    }

    // ── Золото и магазин подземелья (просил юзер) ─────────────────────────
    // Золото — мета-валюта: кучи золота в комнатах, тратится в магазине.
    // Цены магазина по редкости: покупка карты и продажа копии из коллекции.
    const SHOP_BUY = { common: 10, rare: 30, epic: 100 };
    const SHOP_SELL = { common: 2, rare: 6, epic: 20 };
    // Случайная карта с редкостью «как у награды после боя» — веса заданы
    // повторами пула стихии (там все лица карт, служебные gobA/gobC не
    // входят): сундук и товары магазина кидаются им. Карты ДРУГОЙ стихии
    // в подземелье не выпадают (просил юзер).
    function rollLootCard(elem = "strength") {
        const pool = REWARD_POOLS[elem] || REWARD_POOL;
        return pool[(Math.random() * pool.length) | 0];
    }

    globalThis.GAME_DATA = {
        CARDS, RARITY_COLORS, DEFAULT_DECK, DEFAULT_COLLECTION, DECK_MAX, DECK_MIN,
        deckMinFor, TRAP_SLOTS,
        DECK_COPIES, REWARD_POOL, REWARD_POOLS, ENCOUNTERS, FLOOR_MOBS,
        FLOOR_MOBS_GROWTH, FLOOR_MOBS_WISDOM,
        MOB_TABLES, ENEMY_FILL, ENEMY_FILLS, CAVES,
        STARTER_DECKS, STARTER_COLLECTIONS, HEROES, HERO_ORDER, HERO_FOE_ORDER,
        enemyDeck, mobForFloor, ELEM_LOGO, SHOP_BUY, SHOP_SELL, rollLootCard,
    };
})();
