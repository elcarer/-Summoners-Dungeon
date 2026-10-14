// ДАННЫЕ ИГРЫ: существа-карты, колоды, энкаунтеры подземелья.
// Всё — стартовые заглушки для баланса v0; статы пригождается держать рядом
// с id, чтобы колоды ссылались короткими строками.
(function () {
    // Существо: cost (мана), atk (урон), hp (здоровье), speed (клетки за ход).
    const CREATURES = {
        spear:  { name: "Гоблин-копейщик", cost: 1, atk: 1, hp: 1, speed: 1, color: 0x6f9b4a },
        merc:   { name: "Наёмник",         cost: 2, atk: 2, hp: 2, speed: 1, color: 0x8a6d4b },
        shield: { name: "Щитоносец",       cost: 2, atk: 1, hp: 3, speed: 1, color: 0x5c6e82 },
        wolf:   { name: "Волк",            cost: 3, atk: 3, hp: 2, speed: 2, color: 0x7d7d8c },
        golem:  { name: "Каменный голем",  cost: 4, atk: 2, hp: 5, speed: 1, color: 0x83807a },
        ogre:   { name: "Огр-вожак",       cost: 5, atk: 5, hp: 4, speed: 1, color: 0x9b5c3f },
    };

    // Колода игрока v0 — 12 карт (замешивается при старте забега).
    const PLAYER_DECK = [
        "spear", "spear", "spear", "merc", "merc", "shield",
        "shield", "wolf", "wolf", "golem", "golem", "ogre",
    ];

    // Энкаунтеры подземелья: 'e' — обычный (случайный из池), 'B' — главный.
    const ENCOUNTERS = {
        gob:     { title: "Банда гоблинов",     baseHp: 10, deck: ["spear", "spear", "spear", "spear", "merc", "merc"] },
        gobBig:  { title: "Гоблины-мародёры",   baseHp: 14, deck: ["spear", "spear", "merc", "merc", "shield", "wolf"] },
        wolfP:   { title: "Стая волков",        baseHp: 12, deck: ["wolf", "wolf", "spear", "spear", "merc", "shield"] },
        boss:    { title: "Огр-вожак банды",    baseHp: 20, deck: ["spear", "merc", "merc", "shield", "wolf", "wolf", "golem", "ogre"] },
    };
    const MOB_POOL = ["gob", "gobBig", "wolfP"];

    globalThis.GAME_DATA = { CREATURES, PLAYER_DECK, ENCOUNTERS, MOB_POOL };
})();
