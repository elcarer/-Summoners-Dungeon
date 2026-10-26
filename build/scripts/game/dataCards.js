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
        decay: starterCollection(STARTER_DECKS.decay), // стартер Мортиса
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
                "dec148", "dec148", "dec148"],
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
        // 1-й этаж (просил юзер): «Дуновение опасности» — база 10♥, ядро
        // 11 карт (81×3, 85×3, 86×3, 114, 94); правка 2026-10-25:
        // −1 «Нехватка воздуха» (88) → +1 «Битва умов» (114) — просил юзер.
        // 2-й этаж (просил юзер): «Путь воды» — база 11♥, ядро 11 карт
        // (Водный элементаль 82×3, Отмена призыва 84×3, Отмена заклинания
        // 83×3, Поток маны 87×2). Арена — scenes/3.png (подводная пещера).
        wisBreeze: { scene: 3, baseHp: 10, elem: "wisdom", hero: "wisBreeze",
                     core: ["wis81", "wis81", "wis81", "wis85", "wis85",
                            "wis85", "wis86", "wis86", "wis86", "wis114",
                            "wis94"] },
        wisWater: { scene: 3, baseHp: 11, elem: "wisdom", hero: "wisWater",
                    core: ["wis82", "wis82", "wis82", "wis84", "wis84",
                           "wis84", "wis83", "wis83", "wis83", "wis87",
                           "wis87"] },
        // 3-й этаж (просил юзер): «Сонм духов» — база 12♥, ядро 11 карт
        // (Зимние духи ×3, Отмена призыва, Отмена заклинания, Выросшие духи,
        // Ледяные кандалы ×2, Снежный ком, Гидроудар ×2).
        wisSpirits: { scene: 3, baseHp: 12, elem: "wisdom", hero: "wisSpirits",
                      core: ["wis89", "wis89", "wis89", "wis84", "wis83",
                             "wis96", "wis97", "wis97", "wis98", "wis99",
                             "wis99"] },
        // 4-й этаж (просил юзер): «Ледяная суета» — база 13♥, ядро 11 карт
        // (Снежный элементаль ×3, Ледяной удар ×2, Ледяной элементаль,
        // Старший ледовик, Ледяные кандалы ×2, Слабость ×2).
        wisFlurry: { scene: 3, baseHp: 13, elem: "wisdom", hero: "wisFlurry",
                     core: ["wis90", "wis90", "wis90", "wis92", "wis92",
                            "wis93", "wis95", "wis97", "wis97", "wis86",
                            "wis86"] },
        // 5-й этаж (просил юзер): «Мастер холода» — база 14♥, ядро 11 карт
        // (Ядро кометы ×4, Поиск знаний, Снежный ком, Гидроудар ×2,
        // Запутать руны, Рой ледо-пикси ×2).
        wisMaster: { scene: 3, baseHp: 14, elem: "wisdom", hero: "wisMaster",
                     core: ["wis91", "wis91", "wis91", "wis91", "wis94",
                            "wis98", "wis99", "wis99", "wis101", "wis103",
                            "wis103"] },
        // 6-й этаж (просил юзер): «Город мудрости» — база 15♥, ядро 11 карт
        // (Башня звездочёта ×2, Облачный шпиль, Меч в алтаре ×2, Круг стихий,
        // Ледяной элементаль, Старейший ледовик, Иллюзия ×2, Песчаный дух).
        wisCity: { scene: 3, baseHp: 15, elem: "wisdom", hero: "wisCity",
                   core: ["wis105", "wis105", "wis106", "wis104", "wis104",
                          "wis102", "wis93", "wis95", "wis108", "wis108",
                          "wis109"] },
        // Главарь «Подземных ключей» (просил юзер): «Безумный маг» —
        // база 18♥, карта персонажа heroes/23.png (первая способность
        // вашего Мага за бой срабатывает дважды). Ядро 11 карт по спеке:
        // Водный маг ×2, Запутать руны ×2, Отмена призыва ×2, Отмена
        // заклинания ×2, Поток маны, Весёлый штормовик, Озёрная дева.
        // grow — усиление с глубиной, как у главарей других данжей.
        wisBoss: { scene: 3, baseHp: 18, elem: "wisdom", hero: "wisMad",
                   core: ["wis107", "wis107", "wis101", "wis101", "wis84",
                          "wis84", "wis83", "wis83", "wis87", "wis110",
                          "wis111"],
                   grow: ["wis91", "wis93", "wis95", "wis96", "wis100",
                          "wis102", "wis105", "wis106", "wis108", "wis109"] },
        // ── «Земли мёртвых» (четвёртое подземелье, стихия «Тлен») ──────────
        // 1-й этаж (просил юзер): «Живые кости» — база 10♥, ядро 11 карт
        // (Боевой скелет ×2, Скелет-лучник, Зомби-селянин ×2, Толпа
        // скелетов ×2, Нетопырь ×2, Поле костей ×2). Босса у данжа пока
        // нет, поэтому без grow — обычный враг, играет ядром как есть.
        decBones: { scene: 1, baseHp: 10, elem: "decay", hero: "decBones",
                    core: ["dec121", "dec121", "dec135", "dec122", "dec122",
                           "dec140", "dec140", "dec123", "dec123", "dec141",
                           "dec141"] },
        // 2-й этаж (просил юзер): «Чёрная магия» — база 11♥, ядро 11 карт
        // (Пытка разума ×2, Негативный поток ×2, Тёмные цепи ×2,
        // Сполохи бездны, Запретные знания ×2, Вампир, Лич)
        decBlack: { scene: 1, baseHp: 11, elem: "decay", hero: "decBlack",
                    core: ["dec125", "dec125", "dec126", "dec126",
                           "dec127", "dec127", "dec129", "dec130", "dec130",
                           "dec132", "dec131"] },
        // 3-й этаж (просил юзер): «Смерть из-под земли» — база 12♥, ядро
        // 11 карт (Поднятие мёртвых ×2, Иссушение почвы, Скелет-лучник ×2,
        // Метка некроманта ×2, Паршивище ×2, Разложенные кости ×2)
        decUnder: { scene: 1, baseHp: 12, elem: "decay", hero: "decUnder",
                    core: ["dec124", "dec124", "dec133", "dec135", "dec135",
                           "dec137", "dec137", "dec142", "dec142",
                           "dec143", "dec143"] },
        // 4-й этаж (просил юзер): «Сброс разума» — база 13♥, ядро 11 карт
        // (Пытка разума ×2, Проклятые артефакты ×2, Дурное варево ×2,
        // Проклятый обелиск, Разложение ×2, Восставший нетопырь ×2)
        decMind: { scene: 1, baseHp: 13, elem: "decay", hero: "decMind",
                   core: ["dec125", "dec125", "dec138", "dec138",
                          "dec139", "dec139", "dec136",
                          "dec145", "dec145", "dec146", "dec146"] },
        // 5-й этаж (просил юзер): «Армия тьмы» — база 14♥, ядро 11 карт
        // (Толпа скелетов ×2, Скелет-лучник ×2, Поле костей ×2,
        // Боевой скелет ×2, Король скелетов, Скелет послушника ×2)
        decArmy: { scene: 1, baseHp: 14, elem: "decay", hero: "decArmy",
                   core: ["dec140", "dec140", "dec135", "dec135",
                          "dec141", "dec141", "dec121", "dec121",
                          "dec147", "dec148", "dec148"] },
    };
    // Подземелья открытого мира: стихия (пул наград/драфта) и кап глубины.
    // У «Подземных ключей» шесть этажей; главарь «Безумный маг» стоит на
    // каждом этаже, как в двух других данжах.
    const CAVES = {
        gob: { elem: "strength", maxFloor: 6, boss: "boss" },      // Гоблинские пещеры
        grw: { elem: "growth", maxFloor: 6, boss: "grwBoss" },     // Роща Роста
        wis: { elem: "wisdom", maxFloor: 6, boss: "wisBoss" },     // Подземные ключи
        dec: { elem: "decay", maxFloor: 5 },                       // Земли мёртвых (5 этажей, пока без босса)
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
    // «Подземные ключи»: 1-й этаж — «Дуновение опасности», 2-й — «Путь
    // воды», 3-й — «Сонм духов», 4-й — «Ледяная суета», 5-й — «Мастер
    // холода», 6-й — «Город мудрости» (просил юзер; на каждом этаже свой
    // архетип)
    const FLOOR_MOBS_WISDOM = [
        ["wisBreeze", "wisBreeze"],             // 1
        ["wisWater", "wisWater"],               // 2
        ["wisSpirits", "wisSpirits"],           // 3
        ["wisFlurry", "wisFlurry"],             // 4
        ["wisMaster", "wisMaster"],             // 5
        ["wisCity", "wisCity"],                 // 6
    ];
    // «Земли мёртвых»: 1–5 этажи (просил юзер), босса у данжа пока нет
    const FLOOR_MOBS_DECAY = [
        ["decBones", "decBones"],               // 1
        ["decBlack"],                           // 2
        ["decUnder"],                           // 3
        ["decMind"],                            // 4
        ["decArmy"],                            // 5
    ];
    const MOB_TABLES = { gob: FLOOR_MOBS, grw: FLOOR_MOBS_GROWTH,
                         wis: FLOOR_MOBS_WISDOM, dec: FLOOR_MOBS_DECAY };
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
        // Мудрость: обычные 81–90, 97, 99, 103, 105 и 114, редкие 91–95, 98,
        // 101, 104, 107, 108 и 119, эпические 96, 100, 102, 106, 109–118
        // и 120 — добор будущих боссов «Подземных ключей» (ядро уже синее)
        wisdom: {
            common: ["wis81", "wis82", "wis83", "wis84", "wis85", "wis86",
                     "wis87", "wis88", "wis89", "wis90", "wis97", "wis99",
                     "wis103", "wis105", "wis114"],
            rare:   ["wis91", "wis92", "wis93", "wis94", "wis95", "wis98",
                     "wis101", "wis104", "wis107", "wis108", "wis119"],
            epic:   ["wis96", "wis100", "wis102", "wis106", "wis109",
                     "wis110", "wis111", "wis112", "wis113", "wis115",
                     "wis116", "wis117", "wis118", "wis120"],
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
        FLOOR_MOBS_GROWTH, FLOOR_MOBS_WISDOM, FLOOR_MOBS_DECAY,
        MOB_TABLES, ENEMY_FILL, ENEMY_FILLS, CAVES,
        STARTER_DECKS, STARTER_COLLECTIONS, HEROES, HERO_ORDER, HERO_FOE_ORDER,
        enemyDeck, mobForFloor, ELEM_LOGO, SHOP_BUY, SHOP_SELL, rollLootCard,
    };
})();
