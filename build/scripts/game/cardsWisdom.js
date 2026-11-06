// Карты стихии «Мудрость» (синие) — данные. Часть cardsData.js (см. cardsStrength.js).
(function () {
    globalThis.GAME_CARDS_WISDOM = {
        // ── Стихия «Мудрость» (синие) — третья стихия, лица wisdom/81–109 ────
        // (нумерация артов юзера — сквозная с 81). Герой этой стихии — Мира
        // (первое призванное существо получает «Защиту от заклинаний»);
        // подземелье стихии — «Подземные ключи», карты также живут в стартере
        // Миры (просил юзер).
        // «Воздушный элементаль»: Полёт — как у «Мини-феи» (grw14)
        wis81: { type: "unit", cost: 3, atk: 3, hp: 4, speed: 1,
                 creature: "goblin", sheet: "air_el", ability: "flyOver",
                 subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x3a6ea8, img: "wisdom/81" },
        // «Водный элементаль»: не активирует ловушки — ни наступая, ни
        // призываясь на клетку с ловушкой, ни идя на приманку
        wis82: { type: "unit", cost: 2, atk: 2, hp: 3, speed: 1,
                 creature: "goblin", sheet: "water_el", ability: "noTraps",
                 subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x3a6ea8, img: "wisdom/82" },
        wis83: { type: "trap", cost: 2,
                 trap: { event: "onEnemySpell", effect: "counterSpell" },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x2e4a72, img: "wisdom/83" },
        wis84: { type: "trap", cost: 2,
                 trap: { event: "onEnemySummon", effect: "counterSummon" },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x2e4a72, img: "wisdom/84" },
        wis85: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", bounce: true },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/85" },
        wis86: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", debuffAtk: 2 },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/86" },
        // «Поток маны»: 1⚡ за каждую свою ловушку на поле боя (ловушки —
        // записи B.traps.p: мины, руны, отмены; споры-проклятие живут на
        // существе и в счёт не входят)
        wis87: { type: "spell", cost: 0,
                 spell: { target: "none", energyPerTrap: true },
                 kind: "resource", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/87" },
        // «Нехватка воздуха»: −1 к урону ВСЕМ существам противника (постройки
        // не существа; урон не ниже нуля — клампит recalcAuras)
        wis88: { type: "spell", cost: 1,
                 spell: { target: "none", debuffEnemyAtkAll: 1 },
                 kind: "debuff", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/88" },
        // «Зимние духи»: когда срабатывает любая ловушка (клеточная, отмена,
        // руна, приманка, ряд), получает +1 к урону навсегда (bonusAtk)
        wis89: { type: "unit", cost: 1, atk: 0, hp: 1, speed: 1,
                 creature: "goblin", sheet: "spirit", trapGrow: true,
                 subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x3a6ea8, img: "wisdom/89" },
        // «Снежный элементаль»: 2/2, при атаке по существу противника цель
        // получает −1 к урону (постоянно, как «Слабость»)
        wis90: { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1,
                 creature: "goblin", sheet: "water_el", frostAttack: true,
                 subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x3a6ea8, img: "wisdom/90" },
        // «Ядро кометы»: 4 урона любому существу; выжившее получает
        // «Заморожен 1» — пропускает свой следующий марш и атаку
        wis91: { type: "spell", cost: 4,
                 spell: { target: "anyUnitDmg", dmg: 4, freeze: 1,
                          noBuildings: true },
                 kind: ["damage", "control"], // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/91" },
        // «Ледяной удар»: выбранное существо атакует другое случайное
        // существо по соседству (урон своей атаки); атакованное получает
        // «Заморожен 1»
        wis92: { type: "spell", cost: 2,
                 spell: { target: "anyUnit", iceStrike: true, freeze: 1 },
                 kind: ["damage", "control"], // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/92" },
        // «Ледяной элементаль»: 4/4, Сокрушение — общий флаг crush
        // (лишний урон после удара уходит в базу противника)
        wis93: { type: "unit", cost: 4, atk: 4, hp: 4, speed: 1,
                 creature: "goblin", sheet: "water_el", crush: true,
                 subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "wisdom",
                 color: 0x3a6ea8, img: "wisdom/93" },
        // «Поиск знаний»: посмотреть верхние 6 карт колоды и взять ЛЮБЫЕ 2
        // в руку (остальные возвращаются наверх колоды в прежнем порядке)
        wis94: { type: "spell", cost: 2,
                 spell: { target: "none", seek: 6, seekPicks: 2 },
                 kind: "search", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/94" },
        // «Старший ледовик»: после атаки накладывает «Заморожен 1» на
        // существ СЛЕВА И СПРАВА от СЕБЯ (постройки не морозятся)
        wis95: { type: "unit", cost: 5, atk: 5, hp: 6, speed: 1,
                 creature: "goblin", sheet: "water_el", frostNeighbors: true,
                 subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "wisdom",
                 color: 0x3a6ea8, img: "wisdom/95" },
        // «Выросшие духи»: после перемещения бесплатно разыгрывает ловушку
        // из руки владельца на пустую соседнюю (верт/гориз) клетку
        wis96: { type: "unit", cost: 3, atk: 1, hp: 3, speed: 1,
                 creature: "goblin", sheet: "spirit", trapOnMove: true,
                 subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "wisdom",
                 color: 0x3a6ea8, img: "wisdom/96" },
        // «Ледяные кандалы»: ловушка на пустую клетку; существо врага,
        // призванное или шагнувшее на неё, и все существа по соседству
        // (верт/гориз) получают «Заморожен 1»
        wis97: { type: "trap", cost: 1,
                 trap: { event: "onEnemyCell", effect: "freezeSplash", freeze: 1 },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x2e4a72, img: "wisdom/97" },
        // «Снежный ком»: ловушка на пустую клетку; при срабатывании каждое
        // существо в клетках этого ВЕРТИКАЛЬНОГО ряда сдвигается на случайную
        // соседнюю пустую клетку и получает 2 урона
        wis98: { type: "trap", cost: 2,
                 trap: { event: "onEnemyCell", effect: "rowShift", amount: 2 },
                 kind: ["control", "damage"], // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "wisdom",
                 color: 0x2e4a72, img: "wisdom/98" },
        // «Гидроудар»: выбранному существу 1 урон и сдвиг на 1 клетку
        // БЛИЖЕ К ЕГО БАЗЕ (если там пусто)
        wis99: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", dmg: 1, hydroPunch: true },
                 kind: ["damage", "control"], // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "wisdom",
                 color: 0x4a7ac0, img: "wisdom/99" },
        // «Смерч»: 2 урона всем вражеским существам и постройкам (aoeDmg —
        // общий эффект «Раскалённых обломков»; база не задевается)
        wis100: { type: "spell", cost: 4,
                  spell: { target: "none", aoeDmg: 2 },
                  kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "epic", elem: "wisdom",
                  color: 0x4a7ac0, img: "wisdom/100" },
        // «Запутать руны»: обе стороны сбрасывают ВСЮ руку и берут по 3
        // карты (discardHandDraw; карты под «Сожжением» сгорают, как обычно)
        wis101: { type: "spell", cost: 2,
                  spell: { target: "none", discardHandDraw: 3 },
                  kind: ["draw", "discard"], // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "wisdom",
                  color: 0x4a7ac0, img: "wisdom/101" },
        // «Круг стихий»: в начале хода владельца разыгрывает случайного
        // Элементаля из его руки в пустую соседнюю клетку без траты энергии
        wis102: { type: "building", cost: 4, atk: 0, hp: 4, elementalCircle: true,
                  rarity: "epic", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/102" },
        // «Рой ледо-пикси»: на 5 случайных пустых клетках поля появляются
        // Элементали 1/1 с «Полётом» (служебная карта icePixie)
        wis103: { type: "spell", cost: 4,
                  spell: { target: "none", iceSwarm: 5 },
                  kind: "summon", // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "common", elem: "wisdom",
                  color: 0x4a7ac0, img: "wisdom/103" },
        // «Меч в алтаре»: в начале хода владельца +1♥; когда рядом с ним
        // призывается СВОЁ существо — оно получает +1⚔ за каждую жизнь
        // постройки, после чего постройка погибает (штатный killUnit).
        wis104: { type: "building", cost: 1, atk: 0, hp: 1, altarSword: true,
                  rarity: "rare", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/104" },
        // «Башня звездочёта»: в начале хода владельца добор карты, затем
        // постройка теряет 1♥ (добор раньше урона — даже погибая, башня
        // успевает дать карту).
        wis105: { type: "building", cost: 3, atk: 0, hp: 5, starTower: true,
                  rarity: "common", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/105" },
        // «Облачный шпиль»: пока стоит, все СВОИ существа получают «Полёт»
        // (flyOver, как у мини-феи) и «Защиту 1» (динамическая аура).
        wis106: { type: "building", cost: 5, atk: 0, hp: 5, cloudSpire: true,
                  rarity: "epic", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/106" },
        // «Водный маг»: после призыва бесплатно разыгрывает случайную
        // ловушку из КОЛОДЫ (цена ≤ 2) на случайную пустую соседнюю клетку;
        // карта уходит из колоды в сброс.
        wis107: { type: "unit", cost: 3, atk: 1, hp: 1, speed: 1,
                  waterMage: true,
                  subtype: "mage", // подтип — по спеке юзера (чат)
                  rarity: "rare", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/107" },
        // «Иллюзия»: при призыве получает урон и жизни случайного существа
        // по соседству (верт/гориз); если то существо умирает — Иллюзия
        // погибает вместе с ним. База 0/0 — на карте урон/жизни «*».
        wis108: { type: "unit", cost: 3, atk: 0, hp: 0, speed: 1,
                  creature: "goblin", illusion: true,
                  subtype: "mage", // подтип — по спеке юзера (чат)
                  rarity: "rare", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/108" },
        // «Песчаный дух»: 9/9 за 7⚡, в начале каждого СВОЕГО хода теряет
        // 1 урон и 1 жизнь (урон не ниже нуля; на 1♥ погибает от износа).
        wis109: { type: "unit", cost: 7, atk: 9, hp: 9, speed: 1,
                  creature: "goblin", sheet: "air_el", sandDecay: true,
                  subtype: "elemental", // подтип — по спеке юзера (чат)
                  rarity: "epic", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/109" },
        // «Весёлый штормовик»: в начале хода владельца разыгрывает случайное
        // заклинание из случайной колоды (одной из двух — игрока или врага)
        // без траты энергии. Каст идёт от хозяина выбранной колоды, поэтому
        // «чужая» половина эффекта может ударить и по владельцу штормовика.
        wis110: { type: "unit", cost: 6, atk: 6, hp: 6, speed: 1,
                  creature: "goblin", sheet: "air_el", stormer: true,
                  subtype: "elemental", // подтип — по спеке юзера (чат)
                  rarity: "epic", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/110" },
        // «Озёрная дева»: после призыва получает способность другого
        // случайного существа по соседству (верт/гориз, любая сторона).
        // Копируются именно способности/перки, а не статы/подтип/арт.
        wis111: { type: "unit", cost: 4, atk: 2, hp: 6, speed: 1,
                  creature: "goblin", lakeMaid: true,
                  subtype: "mage", // подтип — по спеке юзера (чат)
                  rarity: "epic", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/111" },
        // «Дух реки»: когда это существо активирует ловушку, эффект той
        // ловушки отменяется: ловушка снимается с поля, но ничего не делает
        // (спека юзера). На приманки не ведётся — перенаправление и урон
        // приманки тоже её эффект (см. lureRedirect).
        wis112: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                  creature: "goblin", sheet: "spirit", trapCancel: true,
                  subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                  rarity: "epic", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/112" },
        // «Гримуар инея»: выбрать тип карты («призыв»/«ловушка»/«заклинание»/
        // «постройка»), посмотреть верхние 4 карты колоды: все карты
        // выбранного типа — в руку, остальные — в сброс (спека юзера).
        wis113: { type: "spell", cost: 1,
                  spell: { target: "none", grim: 4 },
                  kind: ["draw", "discard"], // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "epic", elem: "wisdom",
                  color: 0x4a7ac0, img: "wisdom/113" },
        // «Битва умов»: ловушка на пустую клетку; когда противник разыгрывает
        // ЛЮБУЮ ловушку (из руки, из колоды, по повтору), она отменяется:
        // не ставится на поле, эффект не срабатывает, карта и энергия
        // противника потрачены (спека юзера). Ловушка одноразовая.
        wis114: { type: "trap", cost: 2,
                  trap: { event: "onEnemyTrap", effect: "counterTrap" },
                  kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "common", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/114" },
        // «Элементаль серы»: после призыва все соседние (верт/гориз)
        // существа ОБЕИХ сторон теряют 2 урона и 1 жизнь (спека юзера).
        wis115: { type: "unit", cost: 5, atk: 4, hp: 4, speed: 1,
                  creature: "goblin", sheet: "air_el", sulfurBurst: true,
                  subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                  rarity: "epic", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/115" },
        // «Болотная слизь» (wis116): +1⚔ каждый раз, когда ЛЮБАЯ карта
        // уходит в сброс (точки сброса зовут noteDiscard — см. arenaCombat)
        wis116: { type: "unit", cost: 2, atk: 0, hp: 4, speed: 1,
                  creature: "goblin", sheet: "water_el", slimeGain: true,
                  subtype: "elemental", // подтип — по спеке юзера
                  rarity: "epic", elem: "wisdom",
                  color: 0x3a6ea8, img: "wisdom/116" },
        // «Мистический лабиринт» (wis117): существо, подошедшее (маршем)
        // на клетку рядом с базой владельца, переносится на пустую клетку
        // по соседству с постройкой (labyrinthAct в afterMoved)
        wis117: { type: "building", cost: 6, atk: 0, hp: 6,
                  labyrinth: true,
                  rarity: "epic", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/117" },
        // «Гроза» (wis118): вся оставшаяся энергия (сверх цены) сгорает;
        // за каждую единицу — 2 урона случайному существу или постройке
        // противника, новая случайная цель на каждый удар (stormStrike)
        wis118: { type: "spell", cost: 2,
                  spell: { target: "none", stormAll: true },
                  kind: "damage", rarity: "epic", elem: "wisdom",
                  color: 0x4a7ac0, img: "wisdom/118" },
        // «Ловушка-пузырь» (wis119): существо, активировавшее ловушку,
        // теряет весь урон и запрещает противнику играть карту призыва
        // того же существа, пока оно на поле боя
        wis119: { type: "trap", cost: 3,
                  trap: { event: "onEnemyCell", effect: "bubble" },
                  kind: "control", rarity: "rare", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/119" },
        // «Отражение» (wis120): заклинание противника, выбранное целью
        // в существо владельца, летит в случайное существо противника
        // (reflectAim — перехват цели до применения эффекта)
        wis120: { type: "trap", cost: 1,
                  trap: { event: "onEnemySpellAim", effect: "reflectSpell" },
                  kind: "control", rarity: "epic", elem: "wisdom",
                  color: 0x2e4a72, img: "wisdom/120" },
    };
})();
