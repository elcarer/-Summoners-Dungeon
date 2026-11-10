// ЛОГИКА ПОВЕРХ ДАННЫХ КАРТ (сами карты, персонажи и правила колод —
// в cardsData.js): стартовые коллекции, минимум колоды по этажу, пулы
// наград, энкаунтеры подземелья, колоды врагов, магазин.
// Энкаунтеры и таблицы врагов — dataEncounters.js (грузится ДО этого
// файла): сюда они приходят готовым каталогом GAME_ENCOUNTERS.
(function () {
    const { CARDS, RARITY_COLORS, DEFAULT_DECK, STARTER_DECKS,
            DECK_MAX, DECK_MIN, DECK_COPIES, TRAP_SLOTS,
            ELEM_LOGO, MULTI_LOGO, HEROES, HERO_ORDER, HERO_FOE_ORDER } =
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
        decay: starterCollection(STARTER_DECKS.decay), // стартер Мортиса
        honor: starterCollection(STARTER_DECKS.honor), // стартер Леона
        time: starterCollection(STARTER_DECKS.time), // стартер Тордина
        // W54: ядро врага «Большой размер» (Рыжий лес) — не игрок, но
        // ключ держим для симметрии реестра
        strGro: starterCollection(STARTER_DECKS.strGro),
        // W55: ядро врага «Горящая местность» (2-й этаж) — та же симметрия
        strBurn: starterCollection(STARTER_DECKS.strBurn),
        strPack: starterCollection(STARTER_DECKS.strPack),
        // W57: ядро босса «Эльф-отступник» (3-й этаж) — та же симметрия
        strBoss: starterCollection(STARTER_DECKS.strBoss),
        // W61: ядро врага «Зелёные рыцари» («Белая пуща») — та же симметрия
        groHon: starterCollection(STARTER_DECKS.groHon),
        // W75: ядро врага «Кружащая стая» («Небесный дворец») — та же
        // симметрия
        honWis: starterCollection(STARTER_DECKS.honWis),
        // W79: ядро врага «Бешеные шестерни» («Магодром») — та же симметрия
        wisTim: starterCollection(STARTER_DECKS.wisTim),
        // W82: ядро врага «Некро-стражи» («Некро-раскопки») — та же симметрия
        timDec: starterCollection(STARTER_DECKS.timDec),
    };
    const DEFAULT_COLLECTION = STARTER_COLLECTIONS.strength;
    // Актуальный минимум колоды НА этаже забега (просил юзер): этаж N
    // достигнут спуском с этажа N−1, требовавшим 12+(N−1) карт, — минимум
    // поднимается вместе с ним: этаж 1 — 12, этаж 2 — 13, … (база DECK_MIN)
    function deckMinFor(floor) {
        return Math.min(DECK_MAX, DECK_MIN + Math.max(0, (floor | 0) - 1));
    }
    // Минимум колоды ДЛЯ ПОДЗЕМЕЛИЙ (просил юзер): вход на 1-й этаж —
    // 16 карт, каждый следующий этаж +1 (2-й — 17, 3-й — 18, …). Открытый
    // мир живёт по прежнему минимуму 12 (стартовые колоды) — бои с
    // бродячими отрядами идут по deckMinFor(1); данж требует своё:
    // вход (этаж 1) и все бои этажа — caveDeckFor(1) = 16, спуск с
    // этажа N требует caveDeckFor(N+1) = 16+N.
    // W54 (спека юзера): «Рыжий лес» (sgr) — своя лестница: 1-й этаж —
    // 24 карты, дальше +2 (26 на 2-м, 28 на 3-м)
    function caveDeckFor(cave, floor) {
        if (cave === "sgr") // (cave может прийти undefined из старых вызовов)
            return Math.min(DECK_MAX, 22 + 2 * Math.max(1, floor | 0));
        return Math.min(DECK_MAX, 15 + Math.max(1, floor | 0));
    }

    // Пул наград «1 из 3» — запасной (сейчас трофеи берутся из колоды
    // побеждённого врага; пул работает для прямых заходов из тестов).
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
        // W54 (спека юзера): сундуки/магазин «Рыжего леса» — смесь Силы,
        // Роста и мультицветных (встречаются только в этом данже)
        strGro: ["str1", "str1", "str1", "str2", "str2", "str2",
                 "str3", "str3", "str3", "str4", "str4", "str4",
                 "str9", "str9", "str9", "str13", "str13", "str13",
                 "str16", "str16", "str16", "str23", "str23", "str23",
                 "str26", "str26", "str26", "str30", "str30", "str30",
                 "str32", "str32", "str32", "str33", "str33", "str33",
                 "str35", "str35", "str35",
                 "grw1", "grw1", "grw1", "grw2", "grw2", "grw2",
                 "grw3", "grw3", "grw3", "grw4", "grw4", "grw4",
                 "grw5", "grw5", "grw5", "grw7", "grw7", "grw7",
                 "grw8", "grw8", "grw8", "grw10", "grw10", "grw10",
                 "grw16", "grw16", "grw16", "grw17", "grw17", "grw17",
                 "grw19", "grw19", "grw19",
                 "grw9", "grw9", "grw11", "grw11", "grw12", "grw12",
                 "grw13", "grw13", "grw14", "grw14", "grw20", "grw20",
                 "grw25", "grw25", "grw27", "grw27",
                 "grw36", "grw36", "grw37", "grw37", "grw38", "grw38",
                 "grw39", "grw39",
                 "grw31", "grw33",
                 "sg241", "sg241", "sg242", "sg242",
                 // W55: карты 243–246 — тоже только в «Рыжем лесу»
                 // (веса по редкости: обычная ×3, редкие ×2, эпическая ×1);
                 // W56: обычная sg247 — тем же весом ×3;
                 // W57: редкая sg248 ×2, эпические sg249/sg250 ×1
                 "sg243", "sg243", "sg243",
                 "sg247", "sg247", "sg247",
                 "sg244", "sg244", "sg246", "sg246", "sg245",
                 "sg248", "sg248", "sg249", "sg250"],
        // W61 (спека юзера): сундуки/магазин «Белой пущи» — смесь Роста,
        // Чести и мультицветных (встречаются только в этом данже);
        // веса по редкости: обычная ×3, редкая ×2, эпическая ×1
        groHon: ["grw1", "grw1", "grw1", "grw2", "grw2", "grw2",
                 "grw3", "grw3", "grw3", "grw4", "grw4", "grw4",
                 "grw5", "grw5", "grw5", "grw6", "grw6", "grw6",
                 "grw7", "grw7", "grw7", "grw8", "grw8", "grw8",
                 "grw10", "grw10", "grw10", "grw13", "grw13", "grw13",
                 "grw16", "grw16", "grw16", "grw17", "grw17", "grw17",
                 "grw19", "grw19", "grw19", "grw29", "grw29", "grw29",
                 "grw34", "grw34", "grw34", "grw35", "grw35", "grw35",
                 "grw9", "grw9", "grw11", "grw11", "grw12", "grw12",
                 "grw14", "grw14", "grw20", "grw20", "grw25", "grw25",
                 "grw27", "grw27", "grw36", "grw36", "grw37", "grw37",
                 "grw38", "grw38", "grw39", "grw39",
                 "grw15", "grw18", "grw21", "grw22", "grw23", "grw24",
                 "grw26", "grw30", "grw31", "grw33", "grw40",
                 "hon161", "hon161", "hon161", "hon162", "hon162", "hon162",
                 "hon163", "hon163", "hon163", "hon164", "hon164", "hon164",
                 "hon165", "hon165", "hon165", "hon166", "hon166", "hon166",
                 "hon167", "hon167", "hon167", "hon168", "hon168", "hon168",
                 "hon169", "hon169", "hon169", "hon170", "hon170", "hon170",
                 "hon172", "hon172", "hon172", "hon174", "hon174", "hon174",
                 "hon179", "hon179", "hon179", "hon181", "hon181", "hon181",
                 "hon189", "hon189", "hon189", "hon191", "hon191", "hon191",
                 "hon171", "hon171", "hon173", "hon173", "hon175", "hon175",
                 "hon178", "hon178", "hon180", "hon180", "hon182", "hon182",
                 "hon183", "hon183", "hon184", "hon184", "hon186", "hon186",
                 "hon187", "hon187", "hon188", "hon188", "hon193", "hon193",
                 "hon195", "hon195",
                 "hon176", "hon177", "hon185", "hon190", "hon192", "hon194",
                 "hon196", "hon197", "hon198", "hon199", "hon200",
                 "gh252", "gh252", "gh252", "gh251", "gh251",
                 // W65: карты 253–255 (обычные ×3) и 256 (эпическая ×1) —
                 // тоже только в этом данже
                 "gh253", "gh253", "gh253",
                 "gh254", "gh254", "gh254",
                 "gh255", "gh255", "gh255",
                 "gh256",
                 // W72: 257/259 (редкие ×2) и 258 (эпическая ×1)
                 "gh257", "gh257", "gh259", "gh259", "gh258",
                 // W73: 260 «Засека» (эпическая ×1)
                 "gh260"],
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
        // 97/99 обычные ×3, 98 редкая ×2, 100/102 эпические ×1, 101 редкая ×2,
        // 103 обычная ×3, 104/107 редкие ×2, 105 обычная ×3, 106 эпическая ×1.
        // Пул нужен для сундуков/магазинов «Подземных ключей»
        wisdom: ["wis81", "wis81", "wis81", "wis82", "wis82", "wis82",
                 "wis83", "wis83", "wis83", "wis84", "wis84", "wis84",
                 "wis85", "wis85", "wis85", "wis86", "wis86", "wis86",
                 "wis87", "wis87", "wis87", "wis88", "wis88", "wis88",
                 "wis89", "wis89", "wis89", "wis90", "wis90", "wis90",
                 "wis91", "wis91", "wis92", "wis92", "wis93", "wis93",
                 "wis94", "wis94", "wis95", "wis95", "wis96",
                 "wis97", "wis97", "wis97", "wis98", "wis98",
                 "wis99", "wis99", "wis99",
                 // 100–103: 100 эпическая ×1, 101 редкая ×2, 102 эпическая ×1,
                 // 103 обычная ×3
                 "wis100", "wis101", "wis101", "wis102",
                 "wis103", "wis103", "wis103",
                 // 104–107: 104 редкая ×2, 105 обычная ×3, 106 эпическая ×1,
                 // 107 редкая ×2
                 "wis104", "wis104", "wis105", "wis105", "wis105",
                 "wis106", "wis107", "wis107",
                 // 108–109: Иллюзия редкая ×2, Песчаный дух эпический ×1
                 "wis108", "wis108", "wis109",
                 // 110–111: новые эпические — по 1 копии
                 "wis110", "wis111",
                 // 112–115: 114 обычная ×3, эпические — по 1 копии
                 "wis112", "wis113", "wis114", "wis114", "wis114", "wis115",
                 // 116–120: 119 редкая ×3, эпические — по 1 копии
                 "wis116", "wis117", "wis118", "wis119", "wis119", "wis119",
                 "wis120"],
        // Тлен: все карты (об./редкие ×3, эпик ×1) — для сундуков/
        // магазина/наград «Земель мёртвых»
        decay: ["dec121", "dec121", "dec121", "dec122", "dec122", "dec122",
                "dec123", "dec123", "dec123", "dec124", "dec124", "dec124",
                "dec125", "dec125", "dec125", "dec126", "dec126", "dec126",
                "dec127", "dec127", "dec127", "dec128",
                "dec129", "dec129", "dec129",
                // 135–139: лучник/метка/артефакты/варево — об./редкие ×3,
                // обелиск эпик ×1
                "dec135", "dec135", "dec135", "dec136",
                "dec137", "dec137", "dec137",
                "dec138", "dec138", "dec138",
                "dec139", "dec139", "dec139",
                // 140–141: толпа и поле костей — обычные ×3
                "dec140", "dec140", "dec140",
                "dec141", "dec141", "dec141",
                // 130–133 (вошли в код позже): знания/лич/вампир/иссушение
                // — обычные и редкие ×3
                "dec130", "dec130", "dec130",
                "dec131", "dec131", "dec131",
                "dec132", "dec132", "dec132",
                "dec133", "dec133", "dec133",
                // 142–143: паршивище ×3, разложенные кости ×3
                "dec142", "dec142", "dec142",
                "dec143", "dec143", "dec143",
                // 144–146: трупный яд/разложение — об./редкие ×3,
                // восставший нетопырь редкий ×3
                "dec144", "dec144", "dec144",
                "dec145", "dec145", "dec145",
                "dec146", "dec146", "dec146",
                // 147–148: король скелетов эпик ×1,
                // скелет послушника редкий ×3
                "dec147",
                "dec148", "dec148", "dec148",
                // 149–151: толстопуз/взрыв твари редкие ×3,
                // болото рождения эпик ×1
                "dec149", "dec149", "dec149",
                "dec150", "dec150", "dec150",
                "dec151",
                // 152–153: гримуар духов редкая ×3,
                // извлечение тьмы эпик ×1
                "dec152", "dec152", "dec152",
                "dec153",
                // 154–160: посвящение тьме эпик ×1, смоляная статуя
                // редкая ×3, выбор местности обычная ×3, склеп/портал
                // духов/рыцарь смерти/кровавая луна — эпики ×1
                "dec154",
                "dec155", "dec155", "dec155",
                "dec156", "dec156", "dec156",
                "dec157",
                "dec158",
                "dec159",
                "dec160"],
        // Честь: все карты стихии (161–189; обычные/редкие ×3, эпик ×1) —
        // для сундуков/магазина/наград «Залов Чести»
        honor: ["hon161", "hon161", "hon161",
                "hon162", "hon162", "hon162",
                "hon163", "hon163", "hon163",
                "hon164", "hon164", "hon164",
                "hon165", "hon165", "hon165",
                "hon166", "hon166", "hon166",
                "hon167", "hon167", "hon167",
                "hon168", "hon168", "hon168",
                "hon169", "hon169", "hon169",
                "hon170", "hon170", "hon170",
                "hon171", "hon171", "hon171",
                "hon172", "hon172", "hon172",
                "hon173", "hon173", "hon173",
                "hon174", "hon174", "hon174",
                "hon175", "hon175", "hon175",
                "hon176",
                "hon177",
                "hon178", "hon178", "hon178",
                "hon179", "hon179", "hon179",
                "hon180", "hon180", "hon180",
                "hon181", "hon181", "hon181",
                "hon182", "hon182", "hon182",
                "hon183", "hon183", "hon183",
                "hon184", "hon184", "hon184",
                "hon185",
                "hon186", "hon186", "hon186",
                "hon187", "hon187", "hon187",
                "hon188", "hon188", "hon188",
                "hon189", "hon189", "hon189",
                // 190–194, 195–200 (просил юзер): обычные/редкие ×3, эпик ×1
                "hon190",
                "hon191", "hon191", "hon191",
                "hon192",
                "hon193", "hon193", "hon193",
                "hon194",
                "hon195", "hon195", "hon195",
                "hon196",
                "hon197",
                "hon198",
                "hon199",
                "hon200"],
        // Время: все 20 карт стихии (201–220; редкая только 210 — ×3,
        // эпическая 216 — ×1) — для сундуков/магазина/наград данжа Времени
        time: ["tim201", "tim201", "tim201",
               "tim202", "tim202", "tim202",
               "tim203", "tim203", "tim203",
               "tim204", "tim204", "tim204",
               "tim205", "tim205", "tim205",
               "tim206", "tim206", "tim206",
               "tim207", "tim207", "tim207",
               "tim208", "tim208", "tim208",
               "tim209", "tim209", "tim209",
               "tim210", "tim210", "tim210",
               "tim211", "tim211", "tim211",
               "tim212", "tim212", "tim212",
               "tim213", "tim213", "tim213",
               "tim214", "tim214", "tim214",
               "tim215", "tim215", "tim215",
               "tim216",
               "tim217", "tim217", "tim217",
               "tim218", "tim218", "tim218",
               "tim219", "tim219", "tim219",
               "tim220", "tim220", "tim220",
               // 221–226: 221 обычная ×3, 222/226 редкие ×2, 223/224/225
               // эпические ×1; 227 редкая ×2, 228 эпическая ×1; 230/231
               // редкие ×2, 229 эпическая ×1; 232–236 редкие ×2
               "tim221", "tim221", "tim221",
               "tim222", "tim222",
               "tim223",
               "tim224",
               "tim225",
               "tim226", "tim226",
               "tim227", "tim227",
               "tim228",
               "tim230", "tim230",
               "tim231", "tim231",
               "tim229",
               "tim232", "tim232",
               "tim233", "tim233",
               "tim234", "tim234",
               "tim235", "tim235",
               "tim236", "tim236",
               "tim237",
               "tim238",
               "tim239",
               "tim240"], // 237–240 эпические ×1 (просил юзер)
    };
    // W75 (спека юзера): сундуки/магазин «Небесного дворца» — смесь
    // Чести, Мудрости и мультицветных (встречаются только в этом данже).
    // Веса — пулы самих стихий (об./редкие ×3, эпик ×1); новые hw-карты —
    // обычные ×3, W76: редкая 264 тоже ×3 (вес редких), W77: эпические
    // 265/266 по ×1 (вес эпиков), W78: обычная 268 ×3, редкие 269/270 ×3,
    // эпическая 267 ×1 (вес эпиков)
    REWARD_POOLS.honWis = [...REWARD_POOLS.honor, ...REWARD_POOLS.wisdom,
        "hw261", "hw261", "hw261", "hw262", "hw262", "hw262",
        "hw263", "hw263", "hw263",
        "hw264", "hw264", "hw264",
        "hw265", "hw266",
        "hw268", "hw268", "hw268",
        "hw269", "hw269", "hw269",
        "hw270", "hw270", "hw270",
        "hw267"];

    // W79 (спека юзера): пул наград/драфта «Магодрома» — Мудрость, Время
    // и двухцветные Мудрость+Время (встречаются только в этом данже).
    // Новые wt-карты: обычная 271 ×3, редкая 272 ×3. W80: редкая 273 ×3,
    // эпические 274 ×3 и 275 ×3. W81: обычные 277/279/280 ×3, редкая
    // 276 ×3, эпическая 278 ×3
    REWARD_POOLS.wisTim = [...REWARD_POOLS.wisdom, ...REWARD_POOLS.time,
        "wt271", "wt271", "wt271",
        "wt272", "wt272", "wt272",
        "wt273", "wt273", "wt273",
        "wt274", "wt274", "wt274",
        "wt275", "wt275", "wt275",
        "wt276", "wt276", "wt276",
        "wt277", "wt277", "wt277",
        "wt278", "wt278", "wt278",
        "wt279", "wt279", "wt279",
        "wt280", "wt280", "wt280"];

    // W82 (спека юзера): пул наград/драфта «Некро-раскопок» — Время, Тлен
    // и двухцветные Время+Тлен (встречаются только в этом данже). Новые
    // nec-карты: обычные 281/282/283 ×3, редкая 285 ×3, эпическая 284 ×3.
    // W83 (спека юзера): + обычная 286 ×3 и редкая 287 ×3
    REWARD_POOLS.timDec = [...REWARD_POOLS.time, ...REWARD_POOLS.decay,
        "nec281", "nec281", "nec281",
        "nec282", "nec282", "nec282",
        "nec283", "nec283", "nec283",
        "nec285", "nec285", "nec285",
        "nec284", "nec284", "nec284",
        "nec286", "nec286", "nec286",
        "nec287", "nec287", "nec287"];

    const { ENCOUNTERS, FLOOR_MOBS, FLOOR_MOBS_GROWTH, FLOOR_MOBS_WISDOM,
        FLOOR_MOBS_DECAY, FLOOR_MOBS_HONOR, FLOOR_MOBS_TIME, MOB_TABLES,
        ENEMY_FILL, ENEMY_FILLS } = globalThis.GAME_ENCOUNTERS;
    // Подземелья открытого мира: стихия (пул наград/драфта) и кап глубины.
    // У «Подземных ключей» шесть этажей; главарь «Безумный маг» стоит на
    // каждом этаже, как в двух других данжах.
    const CAVES = {
        gob: { elem: "strength", maxFloor: 6, boss: "boss" },      // Гоблинские пещеры
        grw: { elem: "growth", maxFloor: 6, boss: "grwBoss" },     // Роща Роста
        wis: { elem: "wisdom", maxFloor: 6, boss: "wisBoss" },     // Подземные ключи
        dec: { elem: "decay", maxFloor: 6, boss: "decLichBoss" },  // Земли мёртвых — главарь «Архилич»
        hon: { elem: "honor", maxFloor: 6, boss: "honThrone" },    // Залы Чести — 6 этажей, босс «Претендент на трон» на каждом (просил юзер)
        tim: { elem: "time", maxFloor: 6, boss: "darklord" },      // Логово Времени — 6 этажей, босс «Тёмный владыка» на каждом (просил юзер)
        // W54 (спека юзера): «Рыжий лес» — МУЛЬТИЦВЕТНЫЙ данж Сила+Рост:
        // 3 этажа, босс только на последнем; особенность fury — «Ярость
        // природы»: двухцветные карты Сила+Рост наносят 1 урон базе врага
        // при розыгрыше (текст — в HUD данжа). elems — стихии ДРАФТА
        // «Карты сокровищ» (Сила, Рост, двухцветные); elem — мульти-стихия
        // (рубашки card_multi_back.png)
        sgr: { elem: "strGro", elems: ["strength", "growth"],
               maxFloor: 3, boss: "sgrBoss", bossLast: true, fury: true },
        // W61 (спека юзера): «Белая пуща» — МУЛЬТИЦВЕТНЫЙ данж Рост+Честь
        // (по образцу «Рыжего леса»): 3 ЭТАЖА, босс только на последнем.
        // 1-й этаж — «Зелёные рыцари» (герой 70, 16♥), W65 — 2-й этаж
        // «Долгая прогулка» (герой 71, 18♥), W72 — 3-й этаж «Отряд
        // стрелков» (герой 72, 20♥; обычные бои этажа), W73 — БОСС
        // «Лесной оплот» (герой 73, 22♥) в дальней комнате 3-го
        // (последнего) этажа (bossLast — как у «Рыжего леса»).
        // elems — стихии
        // ДРАФТА «Карты сокровищ» (Рост, Честь, двухцветные groHon);
        // elem — мульти-стихия (рубашки card_multi_back.png). W62 (спека
        // юзера): особенность valor — «Растущая доблесть»: Зелёно-Белая
        // (двухцветная) карта при розыгрыше даёт случайному существу
        // ИГРАЮЩЕГО +1/+1 (для всех противников данжа; текст в HUD —
        // dungeon.js)
        gh: { elem: "groHon", elems: ["growth", "honor"], maxFloor: 3,
              boss: "ghBastion", bossLast: true, valor: true },
        // W75 (спека юзера): «Небесный дворец» — МУЛЬТИЦВЕТНЫЙ данж
        // Честь+Мудрость (по образцу «Рыжего леса»/«Белой пущи»). 3 ЭТАЖА
        // без босса: 1-й — «Кружащая стая» (герой 74, 16♥), W76 — 2-й
        // «Ответный разряд» (герой 75, 18♥), W77 — 3-й «Магопуты»
        // (герой 76, 20♥); floors 4+ и босс — со спекой юзера). elems —
        // стихии ДРАФТА
        // «Карты сокровищ» (Честь, Мудрость, двухцветные honWis); elem —
        // мульти-стихия (рубашки card_multi_back.png). Особенность weave —
        // «Переплетение сил»: при розыгрыше Бело-Синей (двухцветной) карты
        // случайное существо ИГРАЮЩЕГО получает случайный положительный
        // эффект (текст в HUD — dungeon.js; multiWeave в arenaDamage)
        // W78 (спека юзера): БОСС «Сгусток магии» (герой 77, 22♥) в
        // дальней комнате 3-го (последнего) этажа (bossLast — как у
        // «Рыжего леса» и «Белой пущи»: на 1–2-м этажах в дальней
        // комнате только спуск)
        hw: { elem: "honWis", elems: ["honor", "wisdom"], maxFloor: 3,
              boss: "hwMagicBlob", bossLast: true, weave: true },
        // W79 (спека юзера): «Магодром» — МУЛЬТИЦВЕТНЫЙ данж
        // Мудрость+Время (по образцу «Рыжего леса»/«Белой пущи»).
        // 3 ЭТАЖА, босс — ТОЛЬКО в дальней комнате последнего (3-го)
        // этажа (bossLast): враги — «Бешеные шестерни» (герой 78, 16♥),
        // «Техномагия» (герой 79, 18♥, W80) и «Тёмный царь» (герой 80,
        // 20♥, W81); босс — «Искусственный маг» (герой 81, 22♥, W81).
        // elems — стихии ДРАФТА «Карты сокровищ» (Мудрость, Время,
        // двухцветные wisTim); elem — мульти-стихия (рубашки
        // card_multi_back.png). Особенность study — «Глубокое изучение»:
        // при розыгрыше двухцветной карты Мудрость−Время возьмите карту
        // (текст в HUD — dungeon.js; multiStudy в arenaDamage)
        wt: { elem: "wisTim", elems: ["wisdom", "time"], maxFloor: 3,
              boss: "wtArtMage", bossLast: true, study: true },
        // W82 (спека юзера): «Некро-раскопки» — МУЛЬТИЦВЕТНЫЙ данж
        // Время+Тлен (по образцу «Магодрома»). ЭТАЖА 2 (босс и 3-й этаж —
        // со спекой юзера): враги — «Некро-стражи» (герой 82, 16♥) и
        // «Река душ» (герой 83, 18♥). elems — стихии ДРАФТА «Карты
        // сокровищ» (Время, Тлен, двухцветные timDec); elem — мульти-
        // стихия (рубашки card_multi_back.png). Особенность plague —
        // «Зараза из глубин»: при розыгрыше двухцветной карты Время−Тлен
        // случайный враг играющего (существо/постройка/база) теряет
        // 1 жизнь (текст в HUD — dungeon.js; multiPlague в arenaDamage)
        nec: { elem: "timDec", elems: ["time", "decay"], maxFloor: 3,
               plague: true },
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
    // ── Дикие враги открытого мира (просил юзер W29) ─────────────────────
    // Спавн-пул: энкаунтеры с полем wild (ступень редкости). Выбор при
    // спавне — взвешенный по редкости: обычные чаще, редкие реже,
    // эпические самые редкие.
    const WILD_WEIGHT = { common: 6, rare: 2, epic: 1 };
    // детерминированный ГПСЧ (mulberry32) — как в worldGen: один сид —
    // один и тот же враг в точке
    function wildRng(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function wildPool(elem) {
        return Object.keys(ENCOUNTERS).filter((id) =>
            ENCOUNTERS[id].wild && (!elem || ENCOUNTERS[id].elem === elem));
    }
    // вид дикого врага для точки спавна (детерминировано сидом мира и
    // номером точки); null — в пуле стихии пусто
    function wildPick(elem, seed, salt) {
        const pool = wildPool(elem);
        if (!pool.length) return null;
        const rng = wildRng((seed ^ ((salt | 0) * 2654435761)) | 0);
        let total = 0;
        const w = pool.map((id) => {
            const wt = WILD_WEIGHT[ENCOUNTERS[id].wild] || 1;
            total += wt;
            return wt;
        });
        let roll = rng() * total;
        for (let i = 0; i < pool.length; i++) {
            roll -= w[i];
            if (roll < 0) return pool[i];
        }
        return pool[pool.length - 1];
    }
    // коллекционные карты стихии заданной редкости: служебные токены без
    // лица (gobA, skel, icePixie…) не имеют img — в пулы не попадают
    function collectibleOf(elem, rarity) {
        return Object.keys(CARDS).filter((id) => CARDS[id].elem === elem
            && CARDS[id].rarity === rarity && CARDS[id].img);
    }
    // Ядро колоды простого врага: 9 случайных ОБЫЧНЫХ карт стихии
    // (без повторов, пока карт хватает) + level случайных РЕДКИХ —
    // усиление за победы над одноимёнными. Детерминировано сидом точки.
    function wildDeck(elem, level, seed) {
        const rng = wildRng(seed | 0);
        const commons = collectibleOf(elem, "common");
        const deck = [];
        const bag = commons.slice();
        for (let k = 0; k < 9 && commons.length; k++) {
            if (!bag.length) bag.push(...commons); // карт меньше 9 — по кругу
            deck.push(bag.splice((rng() * bag.length) | 0, 1)[0]);
        }
        if (level > 0) {
            let rares = collectibleOf(elem, "rare");
            if (!rares.length) rares = commons;
            for (let k = 0; k < level; k++)
                deck.push(rares[(rng() * rares.length) | 0]);
        }
        return deck;
    }
    // одна случайная Редкая карта стихии — живое усиление одноимённых
    // при победе (состав уходит в сейв отряда, сид не нужен)
    function wildRareCard(elem) {
        let rares = collectibleOf(elem, "rare");
        if (!rares.length) rares = collectibleOf(elem, "common");
        return rares.length ? rares[(Math.random() * rares.length) | 0] : null;
    }
    // Ядро колоды РЕДКОГО бродячего монстра («разбойники», просил юзер
    // W40): 8 Обычных + 3 Редких + 1 Эпическая карта стихии, без повторов
    // (пока карт хватает — мешок добирается по кругу, как в wildDeck).
    // Усиление вида за победы (level) сверху добирает Редкие — как у
    // «Простых». Детерминировано сидом точки
    function raiderDeck(elem, level, seed) {
        const rng = wildRng((seed | 0) ^ 0x5eed1234);
        const plan = [["common", 8], ["rare", 3], ["epic", 1]];
        const deck = [];
        for (const [rar, n] of plan) {
            let pool = collectibleOf(elem, rar);
            if (!pool.length) pool = collectibleOf(elem, "common");
            const bag = pool.slice();
            for (let k = 0; k < n && pool.length; k++) {
                if (!bag.length) bag.push(...pool); // карт меньше плана — по кругу
                deck.push(bag.splice((rng() * bag.length) | 0, 1)[0]);
            }
        }
        if (level > 0) {
            let rares = collectibleOf(elem, "rare");
            if (!rares.length) rares = collectibleOf(elem, "common");
            for (let k = 0; k < level; k++)
                deck.push(rares[(rng() * rares.length) | 0]);
        }
        return deck;
    }
    // Состав бустера (кузница города, просил юзер W40): 3 Обычных +
    // 2 Редких + 1 Эпическая карта стихии — без повторов, где хватает
    function boosterCards(elem) {
        const plan = [["common", 3], ["rare", 2], ["epic", 1]];
        const out = [];
        for (const [rar, n] of plan) {
            const pool = collectibleOf(elem, rar);
            const bag = pool.slice();
            for (let k = 0; k < n && pool.length; k++) {
                if (!bag.length) bag.push(...pool);
                out.push(bag.splice((Math.random() * bag.length) | 0, 1)[0]);
            }
        }
        return out;
    }

    // Обычный враг для этажа подземелья: архетип из таблицы этажа СВОЕГО
    // данжа (пещеры / Роща Роста / Подземные ключи / Земли мёртвых /
    // Залы Чести).
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
        FLOOR_MOBS_GROWTH, FLOOR_MOBS_WISDOM, FLOOR_MOBS_DECAY,
        FLOOR_MOBS_HONOR, FLOOR_MOBS_TIME,
        MOB_TABLES, ENEMY_FILL, ENEMY_FILLS, CAVES,
        STARTER_DECKS, STARTER_COLLECTIONS, HEROES, HERO_ORDER, HERO_FOE_ORDER,
        caveDeckFor,
        enemyDeck, mobForFloor, ELEM_LOGO, MULTI_LOGO, SHOP_BUY, SHOP_SELL, rollLootCard,
        wildPool, wildPick, wildDeck, wildRareCard, WILD_WEIGHT,
        raiderDeck, boosterCards,
    };
})();
