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
        str6: { type: "trap", cost: 1, trap: { event: "onEnemyMove", effect: "moveDmg", amount: 3 },
                rarity: "epic", elem: "strength",
                color: 0x6e4a2e, img: "strength/6" },
    };
    const RARITY_COLORS = { common: 0x9a9a9a, rare: 0x5b9bd5, epic: 0xb07ad5 };

    // Базовая колода: 12 карт — по 3 копии обычных (ID 1-4) стихии «Сила».
    const DEFAULT_DECK = [
        "str1", "str1", "str1", "str2", "str2", "str2",
        "str3", "str3", "str3", "str4", "str4", "str4",
    ];
    const DEFAULT_COLLECTION = { str1: 3, str2: 3, str3: 3, str4: 3, str5: 0, str6: 0 };
    const DECK_MAX = 60, DECK_MIN = 12, TRAP_SLOTS = 2;

    // Пул наград «1 из 3»: вес повторами — обычные чаще, эпик реже.
    const REWARD_POOL = [
        "str1", "str1", "str1", "str2", "str2", "str2",
        "str3", "str3", "str3", "str4", "str4", "str4",
        "str5", "str5", "str6",
    ];

    // Энкаунтеры подземелья: 'e' — обычный (случайный), 'B' — главарь.
    // Название — ключ локализации enc.<id>.title; scene — фон арены (images/scenes).
    const ENCOUNTERS = {
        gob:     { scene: 1, baseHp: 10, deck: ["str1", "str1", "str1", "str1", "str2", "str2"] },
        gobBig:  { scene: 1, baseHp: 14, deck: ["str1", "str1", "str2", "str2", "str3", "str4"] },
        gobTrap: { scene: 2, baseHp: 12, deck: ["str1", "str1", "str3", "str3", "str6"] },
        boss:    { scene: 2, baseHp: 20, deck: ["str1", "str1", "str2", "str2", "str3", "str3",
                                                 "str4", "str4", "str5", "str6"] },
    };
    const MOB_POOL = ["gob", "gobBig", "gobTrap"];

    globalThis.GAME_DATA = {
        CARDS, RARITY_COLORS, DEFAULT_DECK, DEFAULT_COLLECTION, DECK_MAX, DECK_MIN, TRAP_SLOTS,
        REWARD_POOL, ENCOUNTERS, MOB_POOL,
    };
})();
