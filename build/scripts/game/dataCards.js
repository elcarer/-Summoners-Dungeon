// ДАННЫЕ ИГРЫ: карты по стихиям, колоды, энкаунтеры подземелья.
// Типы: unit (существо — марширует), spell (одноразовый эффект),
// building (строение — стоит, эффект), trap (ловушка — триггер «?»).
// Имена/описания — в loc.js (card.<id>.name / .desc).
// Стихии идут волнами; id внутри стихии = номер карты он же спрайт:
// images/cards/<elem>/<№>.png — готовое лицо карты (рамка/имя/тексты).
(function () {
    // ── Стихия «Сила» (красные) ──────────────────────────────────────────
    // img — файл лица карты; creature — лист поля боя (creatureSheets).
    const CARDS = {
        str1: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1, ability: "dash1",
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a, img: "strength/1" },
        str2: { type: "unit", cost: 2, atk: 1, hp: 5, speed: 1,
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a, img: "strength/2" },
        str3: { type: "unit", cost: 3, atk: 4, hp: 4, speed: 1,
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a, img: "strength/3" },
        str4: { type: "spell", cost: 1, spell: { target: "anyUnit", buffAtk: 2 },
                rarity: "common", elem: "strength",
                color: 0xb0402e, img: "strength/4" },
        str5: { type: "building", cost: 3, atk: 0, hp: 2, campAura: 1,
                rarity: "rare", elem: "strength",
                color: 0x8a5a3e, img: "strength/5" },
        str6: { type: "trap", cost: 2, trap: { event: "onEnemyCell", effect: "cellDmg", amount: 3, splash: 1 },
                rarity: "epic", elem: "strength",
                color: 0x6e4a2e, img: "strength/6" },
        str7: { type: "unit", cost: 3, atk: 1, hp: 2, speed: 1,
                creature: "goblin", ability: "shaman",
                rarity: "rare", elem: "strength",
                color: 0x9c4a3a, img: "strength/7" },
        str8: { type: "unit", cost: 4, atk: 3, hp: 3, speed: 1,
                creature: "goblin", leaderAura: 1,
                rarity: "epic", elem: "strength",
                color: 0x9c4a3a, img: "strength/8" },
        str9: { type: "spell", cost: 2, spell: { target: "anyUnitDmg", dmg: 2 },
                rarity: "common", elem: "strength",
                color: 0xb0402e, img: "strength/9" },
        str10: { type: "spell", cost: 5, spell: { target: "none", baseDmg: 5 },
                rarity: "epic", elem: "strength",
                color: 0xb0402e, img: "strength/10" },
        str11: { type: "spell", cost: 1, spell: { target: "ownUnit", dmg: 3, sacrifice: true },
                rarity: "rare", elem: "strength",
                color: 0xb0402e, img: "strength/11" },
        str12: { type: "trap", cost: 1, race: "goblin",
                 trap: { event: "onEnemyMoveFromAdj", effect: "lure", dmg: 1 },
                 rarity: "common", elem: "strength",
                 color: 0x6e4a2e, img: "strength/12" },
        str13: { type: "unit", cost: 2, atk: 2, hp: 1, speed: 1,
                 creature: "goblin", ability: "archer",
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/13" },
        str14: { type: "unit", cost: 2, atk: 1, hp: 1, speed: 1,
                 creature: "goblin", ability: "bombling",
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/14" },
        str15: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                 creature: "goblin", ability: "assassin",
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/15" },
        str16: { type: "unit", cost: 4, atk: 5, hp: 5, speed: 1,
                 creature: "goblin",
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/16" },
        str17: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", dmg: 1, noBuildings: true, brew: true },
                 rarity: "rare", elem: "strength",
                 color: 0xb0402e, img: "strength/17" },
        str18: { type: "building", cost: 2, atk: 0, hp: 5, mycelium: 1,
                 rarity: "epic", elem: "strength",
                 color: 0x8a5a3e, img: "strength/18" },
        str19: { type: "building", cost: 1, atk: 0, hp: 1, spellAura: 1,
                 rarity: "rare", elem: "strength",
                 color: 0x8a5a3e, img: "strength/19" },
        str20: { type: "trap", cost: 2,
                 trap: { event: "onEnemyCell", effect: "ambush", spawn: "gobA" },
                 rarity: "rare", elem: "strength",
                 color: 0x6e4a2e, img: "strength/20" },
        str21: { type: "spell", cost: 3,
                 spell: { target: "anyCell", firewall: 2, turns: 3 },
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/21" },
        str22: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", enchantFire: true },
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/22" },
        str23: { type: "spell", cost: 1,
                 spell: { target: "none", search: 6 },
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/23" },
        str24: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", drainAll: true },
                 rarity: "rare", elem: "strength",
                 color: 0xb0402e, img: "strength/24" },
        str25: { type: "spell", cost: 1,
                 spell: { target: "none", copyLast: true },
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/25" },
        str26: { type: "spell", cost: 3,
                 spell: { target: "none", journey: 6 },
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/26" },
        str27: { type: "unit", cost: 3, atk: 2, hp: 1, speed: 1,
                 creature: "goblin", spellBuffAura: 1,
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/27" },
        str28: { type: "spell", cost: 6,
                 spell: { target: "none", aoeDmg: 3 },
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/28" },
        str29: { type: "unit", cost: 0, atk: 0, hp: 1, speed: 1,
                 creature: "goblin", ability: "coward",
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/29" },
        str30: { type: "spell", cost: 1,
                 spell: { target: "none", buffAllAtk: 1 },
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/30" },
        str31: { type: "building", cost: 1, atk: 0, hp: 6, runeMonolith: true,
                 rarity: "common", elem: "strength",
                 color: 0x8a5a3e, img: "strength/31" },
        str32: { type: "trap", cost: 1,
                 trap: { event: "onAttack", effect: "castRandom" },
                 rarity: "common", elem: "strength",
                 color: 0x6e4a2e, img: "strength/32" },
        str33: { type: "spell", cost: 2,
                 spell: { target: "anyUnit", berserk: 1 },
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/33" },
        str34: { type: "unit", cost: 3, atk: 1, hp: 4, speed: 1,
                 creature: "goblin", berserkSummon: 2,
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/34" },
        str35: { type: "spell", cost: 3,
                 spell: { target: "ownUnit", baseHit: true },
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/35" },
        str36: { type: "trap", cost: 0,
                 trap: { event: "onEnemyCell", effect: "cellDmgAll", amount: 1 },
                 rarity: "common", elem: "strength",
                 color: 0x6e4a2e, img: "strength/36" },
        str37: { type: "unit", cost: 4, atk: 1, hp: 3, speed: 1,
                 creature: "goblin", ability: "spiritSummoner",
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/37" },
        str38: { type: "building", cost: 2, atk: 0, hp: 3, campfire: 1,
                 rarity: "common", elem: "strength",
                 color: 0x8a5a3e, img: "strength/38" },
        str39: { type: "trap", cost: 3,
                 trap: { event: "onEnemyCell", effect: "confuse", turns: 2 },
                 rarity: "rare", elem: "strength",
                 color: 0x6e4a2e, img: "strength/39" },
        str40: { type: "spell", cost: 6,
                 spell: { target: "emptyCell", cultRow: true },
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/40" },
        // ── Стихия «Рост» (зелёные) — вторая стихия, лица growth/41..46 ─────
        // (сквозная нумерация артов юзера: после 40 карт Силы).
        grw1: { type: "unit", cost: 1, atk: 0, hp: 1, speed: 1,
                creature: "goblin", ability: "predator", plant: true,
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/41" },
        grw2: { type: "unit", cost: 2, atk: 2, hp: 4, speed: 1,
                creature: "animal", sheet: "wolf",
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/42" },
        grw3: { type: "unit", cost: 3, atk: 3, hp: 5, speed: 1,
                creature: "animal",
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/43" },
        grw4: { type: "trap", cost: 1,
                trap: { event: "onEnemyCell", effect: "cellDebuff", atk: 1, hp: 1 },
                rarity: "common", elem: "growth",
                color: 0x2e5a2e, img: "growth/44" },
        grw5: { type: "spell", cost: 1,
                spell: { target: "anyUnit", buffAtk: 1, buffHp: 1 },
                rarity: "common", elem: "growth",
                color: 0x4a8a3e, img: "growth/45" },
        grw6: { type: "building", cost: 1, atk: 0, hp: 1, sprout: 1, plant: true,
                rarity: "common", elem: "growth",
                color: 0x2e5a3e, img: "growth/46" },
        // ── Рост, вторая партия (глаза юзера): 47–56 ────────────────────────
        grw7: { type: "spell", cost: 1,
                spell: { target: "anyUnit", buffAtkByHp: true },
                rarity: "common", elem: "growth",
                color: 0x4a8a3e, img: "growth/47" },
        grw8: { type: "unit", cost: 4, atk: 4, hp: 6, speed: 1,
                creature: "goblin", plant: true,
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/48" },
        grw9: { type: "unit", cost: 2, atk: 1, hp: 1, speed: 1,
                creature: "goblin", ability: "druidEnergy",
                rarity: "rare", elem: "growth",
                color: 0x3f6d3a, img: "growth/49" },
        grw10: { type: "building", cost: 2, atk: 0, hp: 1, groveAura: 1,
                 rarity: "common", elem: "growth",
                 color: 0x2e5a3e, img: "growth/50" },
        grw11: { type: "building", cost: 1, atk: 0, hp: 3, riteStump: true,
                 rarity: "rare", elem: "growth",
                 color: 0x2e5a3e, img: "growth/51" },
        grw12: { type: "trap", cost: 1,
                 trap: { event: "onEnemyCell", effect: "ancestor", spawn: "ancBear" },
                 rarity: "rare", elem: "growth",
                 color: 0x2e5a2e, img: "growth/52" },
        grw13: { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1,
                 creature: "animal", ability: "pushBack",
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/53" },
        grw14: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                 creature: "goblin", ability: "flyOver",
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/54" },
        grw15: { type: "trap", cost: 2,
                 trap: { event: "onUnitDamage", effect: "sporeCurse" },
                 rarity: "epic", elem: "growth",
                 color: 0x2e5a2e, img: "growth/55" },
        grw16: { type: "spell", cost: 1,
                 spell: { target: "none", searchUnit: 6 },
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/56" },
        // ── Рост, третья партия (глаза юзера): 57–60 ────────────────────────
        grw17: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", purge: true },
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/57" },
        grw18: { type: "spell", cost: 1,
                 spell: { target: "none", stealEnergy: 2 },
                 rarity: "epic", elem: "growth",
                 color: 0x4a8a3e, img: "growth/58" },
        grw19: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", cocoon: 1 },
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/59" },
        grw20: { type: "unit", cost: 4, atk: 2, hp: 3, speed: 1,
                 creature: "goblin", ability: "flyOver", sisterDraw: true,
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/60" },
        // ── Рост, четвёртая партия (глаза юзера): 61–62 ─────────────────────
        // «Зелёный портал»: существо, которое должно пройти на клетку
        // портала или атаковать его, перепрыгивает на свободную клетку
        // с противоположной стороны (как существа с полётом) и получает
        // +1 к урону и +1 к жизням — любой стороне (просил юзер).
        grw21: { type: "building", cost: 4, atk: 0, hp: 5, portalLeap: true,
                 rarity: "epic", elem: "growth",
                 color: 0x2e5a3e, img: "growth/61" },
        // «Хранитель леса»: при призыве урон и жизни = числу СВОИХ
        // Животных на поле (включая его самого); тип существа — Животное
        grw22: { type: "unit", cost: 4, atk: 1, hp: 1, speed: 1,
                 creature: "animal", keeperScale: true,
                 rarity: "epic", elem: "growth",
                 color: 0x3f6d3a, img: "growth/62" },
        // ── Рост, пятая партия (глаза юзера): 63–64 ─────────────────────────
        // «Варка зелий»: заклинание из любого сброса — в руку, с «Сожжением»
        // (после розыгрыша карта удаляется из боя, в сброс не попадает)
        grw23: { type: "spell", cost: 1,
                 spell: { target: "none", discardPick: true },
                 rarity: "epic", elem: "growth",
                 color: 0x4a8a3e, img: "growth/63" },
        // «Друид глубокой чащи»: пережив урон (выжил), призывает Волка 2/4
        // (grw2) на пустую соседнюю клетку; тип существа — Эльф
        grw24: { type: "unit", cost: 5, atk: 1, hp: 5, speed: 1,
                 creature: "elf", wolfSummon: true,
                 rarity: "epic", elem: "growth",
                 color: 0x3f6d3a, img: "growth/64" },
        // ── Рост, шестая партия (глаза юзера): 65–66 ─────────────────────────
        // «Цветение кристаллов»: +1⚡ за каждую карту в руке (кроме себя —
        // к моменту эффекта карта уже покидает руку)
        grw25: { type: "spell", cost: 2,
                 spell: { target: "none", energyPerHand: true },
                 rarity: "rare", elem: "growth",
                 color: 0x4a8a3e, img: "growth/65" },
        // «Три монолита»: призыв СВОЕГО существа по соседству — поиск в
        // колоде существа с ценой на 1 больше призванного и в руку;
        // монолит при этом теряет 1 жизнь
        grw26: { type: "building", cost: 3, atk: 0, hp: 3, monolith: true,
                 rarity: "epic", elem: "growth",
                 color: 0x2e5a3e, img: "growth/66" },
        // ── Рост, седьмая партия (глаза юзера): 67–71 ────────────────────────
        // «Отряд эльфов»: при призыве потратить ВСЮ оставшуюся энергию —
        // существо получает столько урона и жизней
        grw27: { type: "unit", cost: 0, atk: 0, hp: 0, speed: 1,
                 creature: "elf", energyToStats: true,
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/67" },
        // «Старейший древоброд»: Сокрушение — после удара лишний урон
        // (урон атаки минус жизни цели) переходит в базу противника
        grw28: { type: "unit", cost: 6, atk: 6, hp: 6, speed: 1,
                 creature: "goblin", crush: true, plant: true,
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/68" },
        // «Отравленные лезвия»: существо получает «Ядовитость 1» — при
        // атаке вешает на атакованное существо противника «Яд 1», тот
        // теряет 1 жизнь в начале своего хода перед перемещением
        grw29: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", venom: 1 },
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/69" },
        // «Рой светлячков»: урон цели = числу СВОИХ существ на поле
        grw30: { type: "spell", cost: 4,
                 spell: { target: "anyUnitDmg", fireflies: true },
                 rarity: "epic", elem: "growth",
                 color: 0x4a8a3e, img: "growth/70" },
        // «Древоброд глухой чащи»: при атаке урон атаки получают и ВСЕ
        // существа и постройки по соседству с атакованным (сам он не
        // страдает от собственного всплеска)
        grw31: { type: "unit", cost: 7, atk: 8, hp: 8, speed: 1,
                 creature: "goblin", thicket: true, plant: true,
                 rarity: "epic", elem: "growth",
                 color: 0x3f6d3a, img: "growth/71" },
        // Гоблин из «Гоблинской засады» (str20) — служебная карта без лица:
        // нет в коллекции/наградах/энкаунтерах, в редакторе колоды не виден
        // (тот фильтрует по коллекции). Спавнится только ловушкой.
        gobA: { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1,
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a },
        // Медведь из «Духа предка» (grw12) — служебная карта без лица,
        // как gobA/gobC: спавнится только ловушкой.
        ancBear: { type: "unit", cost: 3, atk: 3, hp: 5, speed: 1,
                   creature: "animal", rarity: "common", elem: "growth",
                   color: 0x2e5a2e },
        // Гоблин из «Культа кочерыжки» (str40) — служебная карта без лица,
        // как gobA: ряд выбранной клетки заполняется Гоблинами 3/4.
        gobC: { type: "unit", cost: 3, atk: 3, hp: 4, speed: 1,
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a },
    };
    const RARITY_COLORS = { common: 0x9a9a9a, rare: 0x5b9bd5, epic: 0xb07ad5 };

    // Базовая колода: 12 карт — по 2 копии шести основных (просил юзер).
    const DEFAULT_DECK = [
        "str1", "str1", "str2", "str2", "str3", "str3",
        "str4", "str4", "str9", "str9", "str12", "str12",
    ];
    // Стартовые колоды по стихиям (выбор при «Новая игра»): Рост — карты
    // 41–46 юзера по 2 копии (просил юзер).
    const STARTER_DECKS = {
        strength: DEFAULT_DECK,
        growth: ["grw1", "grw1", "grw2", "grw2", "grw3", "grw3",
                 "grw4", "grw4", "grw5", "grw5", "grw6", "grw6"],
    };
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
    };
    const DEFAULT_COLLECTION = STARTER_COLLECTIONS.strength;
    const DECK_MAX = 60, DECK_MIN = 12, TRAP_SLOTS = 2;
    const DECK_COPIES = 3; // максимум одинаковых карт в колоде

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
                 "grw28", "grw28", "grw30", "grw31"],
    };

    // ── Враги по глубине (просил юзер) ────────────────────────────────────
    // Архетипы врагов: core — ядро колоды, всегда целиком; добор генерится
    // по этажу (enemyDeck): чем глубже, тем больше карт и тем выше доля
    // редких и эпических. На каждом этаже — свои архетипы (FLOOR_MOBS).
    // Название — ключ локализации enc.<id>.title; scene — фон арены.
    const ENCOUNTERS = {
        // «Банда гоблинов» — первый этаж: только обычные карты
        gob:      { scene: 1, baseHp: 10,
                    core: ["str1", "str1", "str2", "str3", "str4", "str15",
                           "str26"] },
        // «Гоблины-мародёры» — обычные + первые редкие (лучник, наездник)
        gobBig:   { scene: 1, baseHp: 12,
                    core: ["str1", "str2", "str3", "str4", "str9", "str9",
                           "str13", "str16", "str23"] },
        // «Засада гоблинов» — ловушечная колода (мина, приманка, засада),
        // трусливый гоблин — бесплатная стена в коридоре поля
        gobTrap:  { scene: 2, baseHp: 12,
                    core: ["str3", "str6", "str6", "str12", "str12", "str14",
                           "str14", "str20", "str20", "str29"] },
        // «Гоблины-поджигатели» — заклинательная колода (огонь, огнешары,
        // горящие руны)
        gobFire:  { scene: 2, baseHp: 14,
                    core: ["str2", "str9", "str9", "str19", "str21", "str22",
                           "str23", "str24", "str24", "str25"] },
        // «Свита вождя» — элитные редкие (лагерь, шаман, вождь, стяги)
        gobElite: { scene: 1, baseHp: 16,
                    core: ["str3", "str5", "str7", "str7", "str8", "str13",
                           "str13", "str16", "str30"] },
        // «Гоблин-вождь» — главарь этажа (B на карте). Ядро — 10 карт элиты
        // (составом просил юзер); с глубиной добавляются карты из grow
        // (2 за этаж; часть пересекается с ядром — дубликаты в колоде
        // врага легальны), добор — как у обычных.
        boss:     { scene: 2, baseHp: 20,
                    core: ["str8", "str7", "str13", "str29", "str30", "str11",
                           "str16", "str31", "str18", "str5"],
                    grow: ["str5", "str6", "str7", "str8", "str16", "str17",
                           "str18", "str21", "str24", "str28"] },
        // «Соперник по драфту» — бой мини-игры «Карта сокровищ»: колода
        // НЕ генерится ядром (enemyDeck), её кладёт драфт-сцена из карт,
        // что соперник забрал себе при выборе. База 15 — зеркально игроку.
        draft:    { scene: 1, baseHp: 15, core: [] },

        // ── «Роща Роста» (второе подземелье, стихия «Рост») ───────────────
        // Каталог Роста — 24 карты (глаза юзера 41–64): «Лесные звери» —
        // существа и усиления (друид-эльф кормит связку волками), «Роща
        // лоз» — ловушки, постройки, контроль и добор заклинаний; босс
        // собирает всё.
        grwBeasts: { scene: 1, baseHp: 10, elem: "growth",
                     core: ["grw2", "grw2", "grw3", "grw3", "grw8", "grw8",
                            "grw13", "grw14", "grw20", "grw22", "grw24"] },
        grwGrove:  { scene: 1, baseHp: 12, elem: "growth",
                     core: ["grw4", "grw4", "grw10", "grw10", "grw11", "grw12",
                            "grw19", "grw19", "grw17", "grw21", "grw23"] },
        grwBoss:   { scene: 1, baseHp: 18, elem: "growth",
                     core: ["grw3", "grw3", "grw8", "grw8", "grw13", "grw12",
                            "grw11", "grw15", "grw18", "grw9", "grw22"] },
    };
    // Подземелья открытого мира: стихия (пул наград/драфта) и кап глубины
    const CAVES = {
        gob: { elem: "strength", maxFloor: 6, boss: "boss" },      // Гоблинские пещеры
        grw: { elem: "growth", maxFloor: 6, boss: "grwBoss" },     // Роща Роста
    };
    // Этаж → какие обычные враги на нём водятся; после конца списка — набор
    // для самых глубоких этажей. Босс (B) есть на каждом этаже.
    const FLOOR_MOBS = [
        ["gob", "gob"],                       // 1
        ["gob", "gobBig"],                    // 2
        ["gobBig", "gobTrap"],                // 3
        ["gobTrap", "gobFire"],               // 4
        ["gobFire", "gobElite"],              // 5
        ["gobElite", "gobTrap", "gobFire"],   // 6+
    ];
    // Этажи «Рощи Роста»: существа с 1-го, ловушки/постройки со 2-го
    const FLOOR_MOBS_GROWTH = [
        ["grwBeasts", "grwBeasts"],           // 1
        ["grwBeasts", "grwGrove"],            // 2
        ["grwGrove", "grwBeasts"],            // 3
        ["grwGrove", "grwBeasts", "grwGrove"],// 4
        ["grwGrove", "grwGrove", "grwBeasts"],// 5
        ["grwGrove", "grwGrove", "grwBeasts"],// 6+
    ];
    const MOB_TABLES = { gob: FLOOR_MOBS, grw: FLOOR_MOBS_GROWTH };
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
    // Пулы добора по стихии архетипа: враги Роста добирают только зелёное
    const ENEMY_FILLS = {
        strength: ENEMY_FILL,
        growth: {
            common: ["grw1", "grw2", "grw3", "grw4", "grw5", "grw6",
                     "grw7", "grw8", "grw10", "grw16", "grw17", "grw19",
                     "grw29"],
            rare:   ["grw9", "grw11", "grw12", "grw13", "grw14", "grw20",
                     "grw27", "grw28"],
            epic:   ["grw15", "grw18", "grw21", "grw22", "grw23", "grw24",
                     "grw30", "grw31"],
        },
    };
    // Колода врага: ядро архетипа + 3..8 карт добора; с глубиной (floor ≥ 1)
    // шанс эпических в доборе растёт от 0% (этаж 1) до 45%, редких — до ~85%.
    function enemyDeck(encId, floor) {
        const enc = ENCOUNTERS[encId] || ENCOUNTERS.gob;
        const fills = ENEMY_FILLS[enc.elem] || ENEMY_FILL;
        const deck = [...enc.core];
        const f = Math.max(1, floor | 0);
        // рост босса: с каждым этажом +2 карты из grow (без повторов внутри
        // него) — на 1-м этаже он без них, к 6-му забирает весь список
        if (enc.grow) {
            const pool = [...enc.grow];
            for (let k = 0; k < Math.min((f - 1) * 2, pool.length); k++)
                deck.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
        }
        const extra = Math.min(3 + (((f - 1) / 2) | 0), 8);
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
    // этажа СВОЕГО данжа (гоблинские пещеры / роща Роста).
    function mobForFloor(cave, floor) {
        const table = MOB_TABLES[CAVES[cave] ? cave : "gob"]
            [Math.min(Math.max(1, floor | 0) - 1, FLOOR_MOBS.length - 1)];
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

    // Логотипы стихий (images/ui/logo/, 128×128): кнопки фильтров и пр.
    // Имена файлов у стихий неоднородны (growth без «_logo») — маппинг явный.
    const ELEM_LOGO = {
        strength: "logo/strength_logo.png",
        growth: "logo/growth.png",
        decay: "logo/decay_logo.png",
        honor: "logo/honor_logo.png",
        time: "logo/time_logo.png",
        wisdom: "logo/wisdom_logo.png",
    };

    globalThis.GAME_DATA = {
        CARDS, RARITY_COLORS, DEFAULT_DECK, DEFAULT_COLLECTION, DECK_MAX, DECK_MIN, TRAP_SLOTS,
        DECK_COPIES, REWARD_POOL, REWARD_POOLS, ENCOUNTERS, FLOOR_MOBS, FLOOR_MOBS_GROWTH,
        MOB_TABLES, ENEMY_FILL, ENEMY_FILLS, CAVES,
        STARTER_DECKS, STARTER_COLLECTIONS,
        enemyDeck, mobForFloor, ELEM_LOGO, SHOP_BUY, SHOP_SELL, rollLootCard,
    };
})();
