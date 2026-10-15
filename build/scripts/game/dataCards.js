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
        // Гоблин из «Гоблинской засады» (str20) — служебная карта без лица:
        // нет в коллекции/наградах/энкаунтерах, в редакторе колоды не виден
        // (тот фильтрует по коллекции). Спавнится только ловушкой.
        gobA: { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1,
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a },
    };
    const RARITY_COLORS = { common: 0x9a9a9a, rare: 0x5b9bd5, epic: 0xb07ad5 };

    // Базовая колода: 12 карт — по 2 копии шести основных (просил юзер).
    const DEFAULT_DECK = [
        "str1", "str1", "str2", "str2", "str3", "str3",
        "str4", "str4", "str9", "str9", "str12", "str12",
    ];
    const DEFAULT_COLLECTION = {
        str1: 2, str2: 2, str3: 2, str4: 2, str9: 2, str12: 2,
        str5: 0, str6: 0, str7: 0, str8: 0, str10: 0, str11: 0,
        str13: 0, str14: 0, str15: 0, str16: 0, str17: 0, str18: 0,
        str19: 0, str20: 0, str21: 0, str22: 0, str23: 0, str24: 0,
    };
    const DECK_MAX = 60, DECK_MIN = 12, TRAP_SLOTS = 2;
    const DECK_COPIES = 3; // максимум одинаковых карт в колоде

    // Пул наград «1 из 3»: вес повторами — обычные чаще, эпик реже.
    const REWARD_POOL = [
        "str1", "str1", "str1", "str2", "str2", "str2",
        "str3", "str3", "str3", "str4", "str4", "str4",
        "str9", "str9", "str9", "str12", "str12", "str12",
        "str15", "str15", "str15", "str16", "str16", "str16",
        "str22", "str22", "str22", "str23", "str23", "str23",
        "str5", "str5", "str7", "str7", "str11", "str11",
        "str13", "str13", "str14", "str14", "str17", "str17",
        "str19", "str19", "str20", "str20", "str24", "str24",
        "str6", "str8", "str10", "str18", "str21",
    ];

    // ── Враги по глубине (просил юзер) ────────────────────────────────────
    // Архетипы врагов: core — ядро колоды, всегда целиком; добор генерится
    // по этажу (enemyDeck): чем глубже, тем больше карт и тем выше доля
    // редких и эпических. На каждом этаже — свои архетипы (FLOOR_MOBS).
    // Название — ключ локализации enc.<id>.title; scene — фон арены.
    const ENCOUNTERS = {
        // «Банда гоблинов» — первый этаж: только обычные карты
        gob:      { scene: 1, baseHp: 10,
                    core: ["str1", "str1", "str1", "str2", "str2", "str3", "str4"] },
        // «Гоблины-мародёры» — обычные + первые редкие (лучник, наездник)
        gobBig:   { scene: 1, baseHp: 12,
                    core: ["str1", "str2", "str2", "str3", "str3", "str4", "str9",
                           "str13", "str16"] },
        // «Засада гоблинов» — ловушечная колода (мина, приманка, засада)
        gobTrap:  { scene: 2, baseHp: 12,
                    core: ["str1", "str1", "str3", "str3", "str6", "str12", "str12",
                           "str14", "str20"] },
        // «Гоблины-поджигатели» — заклинательная колода (огонь, огнешары)
        gobFire:  { scene: 2, baseHp: 14,
                    core: ["str2", "str4", "str9", "str9", "str22", "str22",
                           "str24", "str24", "str21"] },
        // «Свита вождя» — элитные редкие (лагерь, шаман, вождь, алтарь)
        gobElite: { scene: 1, baseHp: 16,
                    core: ["str3", "str3", "str5", "str7", "str8", "str13", "str16",
                           "str16", "str19"] },
        // «Гоблин-вождь» — главарь этажа (B на карте), сильное ядро
        boss:     { scene: 2, baseHp: 20,
                    core: ["str2", "str2", "str3", "str3", "str4", "str5", "str6",
                           "str7", "str8", "str13", "str16", "str16", "str17",
                           "str18", "str21", "str24"] },
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
    // Пул добора колоды врага по редкости. str11 («Жертвоприношение», цель —
    // своё существо) врагу не даётся: ИИ за неё не играет.
    const ENEMY_FILL = {
        common: ["str1", "str2", "str3", "str4", "str9", "str12", "str13",
                 "str14", "str15", "str16", "str22", "str23"],
        rare:   ["str5", "str7", "str13", "str14", "str17", "str19", "str20", "str24"],
        epic:   ["str6", "str8", "str10", "str18", "str21"],
    };
    // Колода врага: ядро архетипа + 3..8 карт добора; с глубиной (floor ≥ 1)
    // шанс эпических в доборе растёт от 0% (этаж 1) до 45%, редких — до ~85%.
    function enemyDeck(encId, floor) {
        const enc = ENCOUNTERS[encId] || ENCOUNTERS.gob;
        const deck = [...enc.core];
        const f = Math.max(1, floor | 0);
        const extra = Math.min(3 + (((f - 1) / 2) | 0), 8);
        const epicP = Math.min(0.45, (f - 1) * 0.09);
        const rareP = Math.min(0.85, 0.25 + f * 0.12);
        for (let k = 0; k < extra; k++) {
            const r = Math.random();
            const pool = r < epicP ? ENEMY_FILL.epic
                : r < epicP + rareP ? ENEMY_FILL.rare : ENEMY_FILL.common;
            deck.push(pool[(Math.random() * pool.length) | 0]);
        }
        return deck;
    }
    // Обычный враг для этажа: случайный архетип из таблицы этажа.
    function mobForFloor(floor) {
        const table = FLOOR_MOBS[Math.min(Math.max(1, floor | 0) - 1, FLOOR_MOBS.length - 1)];
        return table[(Math.random() * table.length) | 0];
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
        DECK_COPIES, REWARD_POOL, ENCOUNTERS, FLOOR_MOBS, ENEMY_FILL,
        enemyDeck, mobForFloor, ELEM_LOGO,
    };
})();
