// Карты стихии «Рост» (зелёные) — данные. Часть cardsData.js (см. cardsStrength.js).
(function () {
    globalThis.GAME_CARDS_GROWTH = {
        // ── Стихия «Рост» (зелёные) — вторая стихия, лица growth/41..46 ─────
        // (сквозная нумерация артов юзера: после 40 карт Силы).
        grw1: { type: "unit", cost: 1, atk: 0, hp: 1, speed: 1,
                creature: "goblin", sheet: "plant", ability: "predator", plant: true,
                subtype: "plant", // подтип — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/41" },
        grw2: { type: "unit", cost: 2, atk: 2, hp: 4, speed: 1,
                creature: "animal", sheet: "wolf",
                subtype: "animal", // подтип — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/42" },
        grw3: { type: "unit", cost: 3, atk: 3, hp: 5, speed: 1,
                creature: "animal", sheet: "bear",
                subtype: "animal", // подтип — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/43" },
        grw4: { type: "trap", cost: 1,
                trap: { event: "onEnemyCell", effect: "cellDebuff", atk: 1, hp: 1 },
                kind: ["damage", "debuff"], // тип эффекта — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x2e5a2e, img: "growth/44" },
        grw5: { type: "spell", cost: 1,
                spell: { target: "anyUnit", buffAtk: 1, buffHp: 1 },
                kind: "buff", // тип эффекта — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x4a8a3e, img: "growth/45" },
        grw6: { type: "building", cost: 1, atk: 0, hp: 1, sprout: 1, plant: true,
                subtype: "plant", // подтип — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x2e5a3e, img: "growth/46" },
        // ── Рост, вторая партия (глаза юзера): 47–56 ────────────────────────
        grw7: { type: "spell", cost: 2, // W60 (юзер): было 1
                spell: { target: "anyUnit", buffAtkByHp: true },
                kind: "buff", // тип эффекта — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x4a8a3e, img: "growth/47" },
        grw8: { type: "unit", cost: 4, atk: 4, hp: 6, speed: 1,
                creature: "goblin", sheet: "ent", plant: true,
                subtype: "plant", // подтип — по спеке юзера (cards.txt)
                rarity: "common", elem: "growth",
                color: 0x3f6d3a, img: "growth/48" },
        grw9: { type: "unit", cost: 2, atk: 1, hp: 1, speed: 1,
                creature: "goblin", ability: "druidEnergy",
                subtype: "elf", // подтип — по спеке юзера (cards.txt)
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
                 kind: "summon", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x2e5a2e, img: "growth/52" },
        grw13: { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1,
                 creature: "animal", sheet: "wolf", ability: "pushBack",
                 subtype: "animal", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/53" },
        grw14: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                 creature: "goblin", ability: "flyOver",
                 subtype: "elf", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/54" },
        grw15: { type: "trap", cost: 2,
                 // W60 (юзер): ловушка на ПУСТОЙ КЛЕТКЕ — существо врага,
                 // вступившее на неё перемещением/призывом, получает
                 // проклятие спор (sporeCurse: его урон бьёт и его базу)
                 trap: { event: "onEnemyCell", effect: "sporeCurse" },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x2e5a2e, img: "growth/55" },
        grw16: { type: "spell", cost: 1,
                 spell: { target: "none", searchUnit: 6 },
                 kind: "search", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/56" },
        // ── Рост, третья партия (глаза юзера): 57–60 ────────────────────────
        grw17: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", purge: true },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/57" },
        grw18: { type: "spell", cost: 1,
                 spell: { target: "none", stealEnergy: 2 },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x4a8a3e, img: "growth/58" },
        grw19: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", cocoon: 1 },
                 kind: "protect", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/59" },
        grw20: { type: "unit", cost: 4, atk: 2, hp: 3, speed: 1,
                 creature: "goblin", ability: "flyOver", sisterDraw: true,
                 subtype: "elf", // подтип — по спеке юзера (cards.txt)
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
                 subtype: "animal", // подтип — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x3f6d3a, img: "growth/62" },
        // ── Рост, пятая партия (глаза юзера): 63–64 ─────────────────────────
        // «Варка зелий»: заклинание из любого сброса — в руку, с «Сожжением»
        // (после розыгрыша карта удаляется из боя, в сброс не попадает)
        grw23: { type: "spell", cost: 1,
                 spell: { target: "none", discardPick: true },
                 kind: "draw", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x4a8a3e, img: "growth/63" },
        // «Друид глубокой чащи»: пережив урон (выжил), призывает Волка 2/4
        // (grw2) на пустую соседнюю клетку; тип существа — Эльф
        grw24: { type: "unit", cost: 5, atk: 1, hp: 5, speed: 1,
                 creature: "elf", wolfSummon: true,
                 subtype: "elf", // подтип — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x3f6d3a, img: "growth/64" },
        // ── Рост, шестая партия (глаза юзера): 65–66 ─────────────────────────
        // «Цветение кристаллов»: +1⚡ за каждую карту в руке (кроме себя —
        // к моменту эффекта карта уже покидает руку)
        grw25: { type: "spell", cost: 2,
                 spell: { target: "none", energyPerHand: true },
                 kind: "resource", // тип эффекта — по спеке юзера (cards.txt)
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
                 subtype: "elf", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/67" },
        // «Старейший древоброд»: Сокрушение — после удара лишний урон
        // (урон атаки минус жизни цели) переходит в базу противника
        grw28: { type: "unit", cost: 6, atk: 6, hp: 6, speed: 1,
                 creature: "goblin", sheet: "ent", crush: true, plant: true,
                 subtype: "plant", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/68" },
        // «Отравленные лезвия»: существо получает «Ядовитость 1» — при
        // атаке вешает на атакованное существо противника «Яд 1», тот
        // теряет 1 жизнь в начале своего хода перед перемещением
        grw29: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", venom: 1 },
                 kind: "buff", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/69" },
        // «Рой светлячков»: урон цели = числу СВОИХ существ на поле
        grw30: { type: "spell", cost: 4,
                 spell: { target: "anyUnitDmg", fireflies: true },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x4a8a3e, img: "growth/70" },
        // «Древоброд глухой чащи»: при атаке урон атаки получают ВСЕ
        // существа и постройки по соседству с НИМ САМИМ (кроме атакованной
        // цели — ей уже достался удар; сам он от всплеска не страдает)
        grw31: { type: "unit", cost: 7, atk: 8, hp: 8, speed: 1,
                 creature: "goblin", sheet: "ent", thicket: true, plant: true,
                 subtype: "plant", // подтип — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x3f6d3a, img: "growth/71" },
        // ── Рост, восьмая партия (глаза юзера): 72–75 ────────────────────────
        // «Выстрел стихией Роста»: урон цели = числу карт Роста в руке
        // (сама карта в момент расчёта ещё в руке — не считается)
        grw32: { type: "spell", cost: 3,
                 spell: { target: "anyUnitDmg", growthHand: true },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x4a8a3e, img: "growth/72" },
        // «Атака духами волков»: своё существо делает Выстрел — урон
        // атаки вперёд по вертикали (ближайшее существо/строение, иначе
        // база противника); на пустых клетках пути являются Волки 2/4
        grw33: { type: "spell", cost: 5,
                 spell: { target: "ownUnit", wolfVolley: true },
                 kind: "summon", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x4a8a3e, img: "growth/73" },
        // «Круговая атака»: цель наносит 1 урон каждому соседу
        // (верт/гориз) — существам и постройкам обеих сторон
        grw34: { type: "spell", cost: 2,
                 spell: { target: "anyUnit", nova: true },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/74" },
        // «Опутывание корнями»: ловушка на любой клетке (можно сразу
        // под существом — «нахождение»); существо на клетке получает
        // «Опутывание 2»: два хода пропускает перемещение, счётчик тает
        grw35: { type: "trap", cost: 1,
                 trap: { event: "onCell", effect: "entangle", entangle: 2 },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "growth",
                 color: 0x4a8a3e, img: "growth/75" },
        // ── Рост, девятая партия (глаза юзера): 76–80 ────────────────────────
        // «Озверевший шатун»: −1 энергию за каждое СВОЁ Животное на поле
        grw36: { type: "unit", cost: 5, atk: 5, hp: 6, speed: 1,
                 creature: "animal", sheet: "bear", animalCost: true,
                 subtype: "animal", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/76" },
        // «Заклятый древоброд»: заклинания, выбравшие его целью, — на 1
        // энергию дешевле (для любого кастующего, просил юзер)
        grw37: { type: "unit", cost: 5, atk: 5, hp: 5, speed: 1,
                 creature: "goblin", sheet: "ent", plant: true, targetDiscount: true,
                 subtype: "plant", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x3f6d3a, img: "growth/77" },
        // «Дома на деревьях»: урон базе стороны целиком уходит в эту
        // постройку (вместо базы)
        grw38: { type: "building", cost: 3, atk: 0, hp: 7, treeHomes: true,
                 rarity: "rare", elem: "growth",
                 color: 0x2e5a3e, img: "growth/78" },
        // «Раскопки»: свою постройку с поля — в сброс, затем постройку из
        // сброса — в клетку убранной (панель выбора, как у «Варки зелий»)
        grw39: { type: "spell", cost: 2,
                 spell: { target: "ownBuilding", excavate: true },
                 kind: "summonBuilding", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "growth",
                 color: 0x4a8a3e, img: "growth/79" },
        // «Пастух росянок»: способности Растений (метка plant) его стороны
        // срабатывают на 1 раз больше
        grw40: { type: "unit", cost: 4, atk: 1, hp: 1, speed: 1,
                 creature: "elf", plantEcho: true,
                 subtype: "elf", // подтип — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "growth",
                 color: 0x3f6d3a, img: "growth/80" },
    };
})();
