// ДАННЫЕ ИГРЫ: карты четырёх типов, колоды, энкаунтеры подземелья.
// Типы: unit (существо — марширует), spell (одноразовый эффект),
// building (строение — стоит, аура), trap (ловушка — триггер «?»).
// Имена/описания — в loc.js (card.<id>.name / .desc).
(function () {
    const CARDS = {
        // ── Существа: cost, atk, hp, speed (клеток за ход) ────────────────
        spear:  { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1, color: 0x6f9b4a },
        merc:   { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1, color: 0x8a6d4b },
        shield: { type: "unit", cost: 2, atk: 1, hp: 3, speed: 1, color: 0x5c6e82 },
        wolf:   { type: "unit", cost: 3, atk: 3, hp: 2, speed: 2, color: 0x7d7d8c },
        golem:  { type: "unit", cost: 4, atk: 2, hp: 5, speed: 1, color: 0x83807a },
        ogre:   { type: "unit", cost: 5, atk: 5, hp: 4, speed: 1, color: 0x9b5c3f },
        // ── Заклинания: spell {target: enemyAny|none, dmg / draw} ─────────
        fireball: { type: "spell", cost: 2, spell: { target: "enemyAny", dmg: 2 }, color: 0xc05a35 },
        insight:  { type: "spell", cost: 3, spell: { target: "none", draw: 3 }, color: 0x4a7bc0 },
        // ── Строения: стоят на клетке, не маршируют, дают ауру ────────────
        banner: { type: "building", cost: 4, atk: 0, hp: 3, aura: { atk: 1, hp: 1 }, color: 0xb08a3e },
        // ── Ловушки: «?» рядом с полем, срабатывают по условию ────────────
        mine: { type: "trap", cost: 2, trap: { event: "onOwnDeath", effect: "rowDmg", amount: 1 }, color: 0x8a4a6e },
    };

    // Стартовая колода (12) и стартовая коллекция (колода + пара новых карт).
    const DEFAULT_DECK = [
        "spear", "spear", "spear", "merc", "merc", "shield",
        "shield", "wolf", "wolf", "golem", "golem", "ogre",
    ];
    const DEFAULT_COLLECTION = {
        spear: 3, merc: 2, shield: 2, wolf: 2, golem: 2, ogre: 1,
        fireball: 1, insight: 0, banner: 0, mine: 1,
    };
    const DECK_MAX = 15, DECK_MIN = 8, TRAP_SLOTS = 2;

    // Пул наград «1 из 3» — все карты.
    const REWARD_POOL = Object.keys(CARDS);

    // Энкаунтеры подземелья: 'e' — обычный (случайный), 'B' — главарь.
    // Название — ключ локализации enc.<id>.title.
    const ENCOUNTERS = {
        gob:     { baseHp: 10, deck: ["spear", "spear", "spear", "spear", "merc", "merc", "fireball"] },
        gobBig:  { baseHp: 14, deck: ["spear", "spear", "merc", "merc", "shield", "wolf", "fireball"] },
        wolfP:   { baseHp: 12, deck: ["wolf", "wolf", "spear", "spear", "merc", "shield", "mine"] },
        boss:    { baseHp: 20, deck: ["spear", "merc", "merc", "shield", "wolf", "wolf", "golem", "ogre", "fireball", "banner", "mine"] },
    };
    const MOB_POOL = ["gob", "gobBig", "wolfP"];

    globalThis.GAME_DATA = {
        CARDS, DEFAULT_DECK, DEFAULT_COLLECTION, DECK_MAX, DECK_MIN, TRAP_SLOTS,
        REWARD_POOL, ENCOUNTERS, MOB_POOL,
    };
})();
