// ДАННЫЕ КАРТ — отдельный от логики файл (просил юзер): его читают и
// игра (dataCards.js), и внешние инструменты (tools/cards.html).
// Типы: unit (существо — марширует), spell (одноразовый эффект),
// building (строение — стоит, эффект), trap (ловушка — триггер «?»).
// Имена/описания — в loc.js (card.<id>.name / .desc).
// Стихии идут волнами; id внутри стихии = номер карты он же спрайт:
// images/cards/<elem>/<№>.png — готовое лицо карты (рамка/имя/тексты).
// Подтипы и типы эффектов карт ведёт ЮЗЕР в спецификации
// for_work/cards.txt («Я тебе каждый раз пишу подтипы») — брать только
// оттуда, не по названиям. subtype — явный подтип карт, у которых он не
// выводится из creature/plant (creature в данных — лист поля боя, у
// ростовских эльфов там плейсхолдер «goblin»); kind — тип эффекта
// заклинания/ловушки (Нанесение урона, Усиление, …). Читает картотека
// tools/cards.html (фильтры по подтипам и типам эффекта, просил юзер).
(function () {
    // ── Стихия «Сила» (красные) ──────────────────────────────────────────
    // img — файл лица карты; creature — лист поля боя (creatureSheets).
    const CARDS = {
        str1: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1, ability: "dash1",
                subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a, img: "strength/1" },
        str2: { type: "unit", cost: 2, atk: 1, hp: 5, speed: 1,
                subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a, img: "strength/2" },
        str3: { type: "unit", cost: 3, atk: 4, hp: 4, speed: 1,
                subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a, img: "strength/3" },
        str4: { type: "spell", cost: 1, spell: { target: "anyUnit", buffAtk: 2 },
                kind: "buff", // тип эффекта — по спеке юзера (cards.txt)
                rarity: "common", elem: "strength",
                color: 0xb0402e, img: "strength/4" },
        str5: { type: "building", cost: 3, atk: 0, hp: 2, campAura: 1,
                rarity: "rare", elem: "strength",
                color: 0x8a5a3e, img: "strength/5" },
        str6: { type: "trap", cost: 2, trap: { event: "onEnemyCell", effect: "cellDmg", amount: 3, splash: 1 },
                kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                rarity: "epic", elem: "strength",
                color: 0x6e4a2e, img: "strength/6" },
        str7: { type: "unit", cost: 3, atk: 1, hp: 2, speed: 1,
                creature: "goblin", ability: "shaman",
                subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                rarity: "rare", elem: "strength",
                color: 0x9c4a3a, img: "strength/7" },
        str8: { type: "unit", cost: 4, atk: 3, hp: 3, speed: 1,
                creature: "goblin", leaderAura: 1,
                subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                rarity: "epic", elem: "strength",
                color: 0x9c4a3a, img: "strength/8" },
        str9: { type: "spell", cost: 2, spell: { target: "anyUnitDmg", dmg: 2 },
                kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                rarity: "common", elem: "strength",
                color: 0xb0402e, img: "strength/9" },
        str10: { type: "spell", cost: 5, spell: { target: "none", baseDmg: 5 },
                kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                rarity: "epic", elem: "strength",
                color: 0xb0402e, img: "strength/10" },
        str11: { type: "spell", cost: 1, spell: { target: "ownUnit", dmg: 3, sacrifice: true },
                kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                rarity: "rare", elem: "strength",
                color: 0xb0402e, img: "strength/11" },
        str12: { type: "trap", cost: 1, race: "goblin",
                 trap: { event: "onEnemyMoveFromAdj", effect: "lure", dmg: 1 },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0x6e4a2e, img: "strength/12" },
        str13: { type: "unit", cost: 2, atk: 2, hp: 1, speed: 1,
                 creature: "goblin", ability: "archer",
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/13" },
        str14: { type: "unit", cost: 2, atk: 1, hp: 1, speed: 1,
                 creature: "goblin", ability: "bombling",
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/14" },
        str15: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                 creature: "goblin", ability: "assassin",
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/15" },
        str16: { type: "unit", cost: 4, atk: 5, hp: 5, speed: 1,
                 creature: "goblin",
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/16" },
        str17: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", dmg: 1, noBuildings: true, brew: true },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
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
                 subtype: "goblin", // «Гоблинская засада» — поправка спеки (Ловушка Гоблин)
                 kind: "summon", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "strength",
                 color: 0x6e4a2e, img: "strength/20" },
        str21: { type: "spell", cost: 3,
                 spell: { target: "anyCell", firewall: 2, turns: 3 },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/21" },
        str22: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", enchantFire: true },
                 kind: "buff", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/22" },
        str23: { type: "spell", cost: 1,
                 spell: { target: "none", search: 6 },
                 kind: "search", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/23" },
        str24: { type: "spell", cost: 1,
                 spell: { target: "anyUnitDmg", drainAll: true },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "strength",
                 color: 0xb0402e, img: "strength/24" },
        str25: { type: "spell", cost: 1,
                 spell: { target: "none", copyLast: true },
                 kind: "copy", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/25" },
        str26: { type: "spell", cost: 3,
                 spell: { target: "none", journey: 6 },
                 kind: "search", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/26" },
        str27: { type: "unit", cost: 3, atk: 2, hp: 1, speed: 1,
                 creature: "goblin", spellBuffAura: 1,
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/27" },
        str28: { type: "spell", cost: 6,
                 spell: { target: "none", aoeDmg: 3 },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/28" },
        str29: { type: "unit", cost: 0, atk: 0, hp: 1, speed: 1,
                 creature: "goblin", ability: "coward",
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/29" },
        str30: { type: "spell", cost: 1,
                 spell: { target: "none", buffAllAtk: 1 },
                 kind: "buff", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/30" },
        str31: { type: "building", cost: 1, atk: 0, hp: 6, runeMonolith: true,
                 rarity: "common", elem: "strength",
                 color: 0x8a5a3e, img: "strength/31" },
        str32: { type: "trap", cost: 1,
                 trap: { event: "onAttack", effect: "castRandom" },
                 kind: "castSpell", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0x6e4a2e, img: "strength/32" },
        str33: { type: "spell", cost: 2,
                 spell: { target: "anyUnit", berserk: 1 },
                 kind: "buff", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/33" },
        str34: { type: "unit", cost: 3, atk: 1, hp: 4, speed: 1,
                 creature: "goblin", berserkSummon: 2,
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0x9c4a3a, img: "strength/34" },
        str35: { type: "spell", cost: 3,
                 spell: { target: "ownUnit", baseHit: true },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0xb0402e, img: "strength/35" },
        str36: { type: "trap", cost: 0,
                 trap: { event: "onEnemyCell", effect: "cellDmgAll", amount: 1 },
                 kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "common", elem: "strength",
                 color: 0x6e4a2e, img: "strength/36" },
        str37: { type: "unit", cost: 4, atk: 1, hp: 3, speed: 1,
                 creature: "goblin", ability: "spiritSummoner",
                 subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "strength",
                 color: 0x9c4a3a, img: "strength/37" },
        str38: { type: "building", cost: 2, atk: 0, hp: 3, campfire: 1,
                 rarity: "common", elem: "strength",
                 color: 0x8a5a3e, img: "strength/38" },
        str39: { type: "trap", cost: 3,
                 trap: { event: "onEnemyCell", effect: "confuse", turns: 2 },
                 kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "rare", elem: "strength",
                 color: 0x6e4a2e, img: "strength/39" },
        str40: { type: "spell", cost: 6,
                 spell: { target: "emptyCell", cultRow: true },
                 kind: "summon", // тип эффекта — по спеке юзера (cards.txt)
                 rarity: "epic", elem: "strength",
                 color: 0xb0402e, img: "strength/40" },
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
        grw7: { type: "spell", cost: 1,
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
                 trap: { event: "onUnitDamage", effect: "sporeCurse" },
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
        // ── Стихия «Тлен» (чёрные) — четвёртая стихия, лица decay/121–126 ──
        // (нумерация артов юзера — сквозная со 121). Герой стихии — Мортис
        // (necr_256), первый призванный Скелет получает «Выкапливание 1»;
        // подземелья у стихии пока нет — карты живут в стартере Мортиса.
        // «Боевой скелет» — тип призываемого существа Скелет (подтип юзера)
        dec121: { type: "unit", cost: 1, atk: 1, hp: 2, speed: 1,
                  creature: "goblin", // плейсхолдер листа поля боя (гоблин)
                  subtype: "skeleton", // подтип — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x504048, img: "decay/121" },
        // «Зомби-селянин» — тип призываемого существа Зомби
        dec122: { type: "unit", cost: 2, atk: 3, hp: 3, speed: 1,
                  creature: "goblin", // плейсхолдер листа поля боя (гоблин)
                  subtype: "zombie", // подтип — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x504048, img: "decay/122" },
        // «Нетопырь» — Животное с «Полётом» (flyOver, как «Мини-фея»)
        dec123: { type: "unit", cost: 3, atk: 5, hp: 1, speed: 1,
                  creature: "goblin", ability: "flyOver",
                  subtype: "animal", // подтип — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x504048, img: "decay/123" },
        // «Поднятие мёртвых»: выбрать карту существа из СВОЕГО сброса — в руку
        dec124: { type: "spell", cost: 1,
                  spell: { target: "none", raiseDead: true },
                  kind: "draw", // тип эффекта — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/124" },
        // «Пытка разума»: выбранный игрок (вы или противник) сбрасывает
        // 2 случайные карты с руки
        dec125: { type: "spell", cost: 1,
                  spell: { target: "none", mindTorture: 2 },
                  kind: "discard", // тип эффекта — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/125" },
        // «Негативный поток»: 1 урон любому существу или противнику
        // (его базе) — новая цель «существо или враг» (anyUnitOrFoe)
        dec126: { type: "spell", cost: 1,
                  spell: { target: "anyUnitOrFoe", dmg: 1 },
                  kind: "damage", // тип эффекта — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/126" },
        // «Тёмные цепи»: ловушка на клетку — переместившееся/призванное
        // на неё существо атакуют ВСЕ соседние СВОИ (хозяйки ловушки)
        // существа своей атакой (полный набор боевых эффектов атаки)
        dec127: { type: "trap", cost: 1,
                  trap: { event: "onEnemyCell", effect: "alliesStrike" },
                  kind: "damage", // тип эффекта — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x443840, img: "decay/127" },
        // «Тёмный алтарь»: в начале хода владельца случайное существо
        // противника теряет 1 жизнь (снятие жизни — не входящий урон)
        dec128: { type: "building", cost: 2, atk: 0, hp: 2, darkAltar: true,
                  rarity: "epic", elem: "decay",
                  color: 0x504048, img: "decay/128" },
        // «Сполохи бездны»: 1 урон всем вражеским существам и постройкам
        // (aoeDmg — общий эффект «Смерча»; база не задевается)
        dec129: { type: "spell", cost: 2,
                  spell: { target: "none", aoeDmg: 1 },
                  kind: "damage", // тип эффекта — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/129" },
        // «Скелет-лучник» (dec135): «Выстрел 2» — тот же механический выстрел,
        // что у Гоблинского лучника (ability archer), но урон 2 (shotDmg)
        dec135: { type: "unit", cost: 2, atk: 0, hp: 1, speed: 1,
                  creature: "goblin", // плейсхолдер листа поля боя (гоблин)
                  ability: "archer", shotDmg: 2, // «Выстрел 2»
                  subtype: "skeleton", // подтип — по спеке юзера (чат)
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/135" },
        // «Проклятый обелиск» (dec136): на смерть любого существа получает
        // +1 жизнь; урон по обелиску от существа столько же бьёт базу
        // противника (не больше жизней обелиска до удара)
        dec136: { type: "building", cost: 3, atk: 0, hp: 1, curseObelisk: true,
                  rarity: "epic", elem: "decay",
                  color: 0x504048, img: "decay/136" },
        // «Метка некроманта» (dec137): цель получает «Выкапливание 1» —
        // та же механика, что у Мортиса (addExhuming, счётчик стакается)
        dec137: { type: "spell", cost: 2,
                  spell: { target: "anyUnit", exhumingMark: 1 },
                  kind: "buff", // тип эффекта — по спеке юзера («Усиление»)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/137" },
        // «Проклятые артефакты» (dec138): запоминает каждую свою сброшенную
        // карту; при смерти постройки запомненные возвращаются в руку
        // владельца (по одной копии из сброса, иначе из колоды)
        dec138: { type: "building", cost: 1, atk: 0, hp: 1, relicVault: true,
                  rarity: "common", elem: "decay",
                  color: 0x504048, img: "decay/138" },
        // «Дурное варево» (dec139): любой сброс (обе стороны) — база
        // противника −1; в начале хода владельца сбрасывает худшую карту
        // с руки и получает +1 жизнь (пустая рука — эффект не тикает)
        dec139: { type: "building", cost: 3, atk: 0, hp: 3, evilBrew: true,
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/139" },
        // Гоблин из «Гоблинской засады» (str20) — служебная карта без лица:
        // нет в коллекции/наградах/энкаунтерах, в редакторе колоды не виден
        // (тот фильтрует по коллекции). Спавнится только ловушкой.
        gobA: { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1,
                subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a },
        // Медведь из «Духа предка» (grw12) — служебная карта без лица,
        // как gobA/gobC: спавнится только ловушкой.
        ancBear: { type: "unit", cost: 3, atk: 3, hp: 5, speed: 1,
                   subtype: "animal", // подтип — по спеке юзера (cards.txt)
                   creature: "animal", sheet: "bear", rarity: "common", elem: "growth",
                   color: 0x2e5a2e },
        // Гоблин из «Культа кочерыжки» (str40) — служебная карта без лица,
        // как gobA: ряд выбранной клетки заполняется Гоблинами 3/4.
        gobC: { type: "unit", cost: 3, atk: 3, hp: 4, speed: 1,
                subtype: "goblin", // подтип — по спеке юзера (cards.txt)
                creature: "goblin", rarity: "common", elem: "strength",
                color: 0x9c4a3a },
        // Ледо-пикси из «Роя ледо-пикси» (wis103) — служебная карта без
        // лица: Элементаль 1/1 с «Полётом», спавнится только заклинанием.
        icePixie: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                    creature: "goblin", sheet: "spirit", ability: "flyOver",
                    subtype: "elemental", // подтип — по спеке юзера (cards.txt)
                    rarity: "common", elem: "wisdom",
                    color: 0x3a6ea8 },
    };
    const RARITY_COLORS = { common: 0x9a9a9a, rare: 0x5b9bd5, epic: 0xb07ad5 };

    // Базовая колода: 12 карт — по 2 копии шести основных (просил юзер).
    const DEFAULT_DECK = [
        "str1", "str1", "str2", "str2", "str3", "str3",
        "str4", "str4", "str9", "str9", "str12", "str12",
    ];
    // Стартовые колоды по стихиям (выбор при «Новая игра»): Рост — карты
    // 41–46 юзера по 2 копии; Мудрость — карты 81–86 по 2 копии, стартер
    // Миры (просил юзер); Тлен — карты 121–126 по 2 копии, стартер Мортиса.
    const STARTER_DECKS = {
        strength: DEFAULT_DECK,
        growth: ["grw1", "grw1", "grw2", "grw2", "grw3", "grw3",
                 "grw4", "grw4", "grw5", "grw5", "grw6", "grw6"],
        wisdom: ["wis81", "wis81", "wis82", "wis82", "wis83", "wis83",
                 "wis84", "wis84", "wis85", "wis85", "wis86", "wis86"],
        decay: ["dec121", "dec121", "dec122", "dec122", "dec123", "dec123",
                "dec124", "dec124", "dec125", "dec125", "dec126", "dec126"],
    };

    // Лимита ловушек НЕТ (просил юзер: «если он есть — это и есть баг»).
    // Константа оставлена для совместимости: на неё завязаны гейты в бою/ИИ,
    // с Infinity они всегда пропускают. TRAP_SLOTS = 2 больше не действует.
    const DECK_MAX = 60, DECK_MIN = 12, TRAP_SLOTS = Infinity;
    const DECK_COPIES = 3; // максимум одинаковых карт в колоде

    // ГЕРОИ — выбор при «Новой игре» (вместо стихии, просил юзер). Герой
    // определяет: жизни базы в бою (baseHp), стихии, которые можно класть
    // в колоду (elems), стартовую колоду (starter — ключ STARTER_DECKS,
    // у каждого героя своя стихия) и особую способность (ability +
    // abilityVal: firstSummonAtk / firstSummonHp — бонус первому
    // призванному ИГРОКОМ существу). Изображение — полная карточка
    // 230×338 юзера: images/heroes/<img>.png. Список будет расширяться.
    //
    // Карты персонажей противников (просил юзер, волна «Герои-враги»):
    // ключ = id энкаунтера (ENCOUNTERS.<id>.hero ссылается сюда), defeat
    // добавляет карту в коллекцию героев (G.captured). Способности работают
    // у ОБЕИХ сторон: ИИ играет своим персонажем, игрок — захваченной
    // картой. ability: startDrawGoblin / startDrawTrap — добор карты в
    // начале боя; firstSpellDmg — первое уронное заклинание боя +1;
    // strengthSpellDmg — заклинания Силы +1 существам; goblinChainSummon —
    // гоблин призвал гоблина из колоды → +1⚔ призванному; goblinDeathReplay
    // — первый погибший гоблин (не токен) возвращается картой в руку и
    // сразу разыгрывается на место; firstSpellEnergy — первое заклинание
    // боя даёт владельцу +1⚡; firstBuildingDiscount — первая постройка
    // боя стоит на abilityVal дешевле (герои «Подземных ключей» и игрок).
    const HEROES = {
        gorbag: {
            id: "gorbag", rarity: "common",
            baseHp: 15, elems: ["strength"], starter: "strength",
            img: "0", ability: "firstSummonAtk", abilityVal: 2,
        },
        elmir: {
            id: "elmir", rarity: "common",
            baseHp: 15, elems: ["growth"], starter: "growth",
            img: "1", ability: "firstSummonHp", abilityVal: 3,
        },
        // Мира (просил юзер): мудрость, «Защита от заклинаний» первому
        // призванному существу (firstSummonWard) — не выбирается целью
        // заклинаний и не получает урона от заклинаний
        mira: {
            id: "mira", rarity: "common",
            baseHp: 15, elems: ["wisdom"], starter: "wisdom",
            img: "16", ability: "firstSummonWard",
        },
        // Мортис (просил юзер): Тлен, первый призванный в бою Скелет
        // получает «Выкапливание 1» (firstSkeletonDig) — однажды после
        // смерти возвращается на ту же клетку без траты энергии
        mortis: {
            id: "mortis", rarity: "common",
            baseHp: 15, elems: ["decay"], starter: "decay",
            img: "24", ability: "firstSkeletonDig", abilityVal: 1,
        },
        gob: { id: "gob", rarity: "common", baseHp: 10,
               elems: ["strength"], starter: "strength",
               img: "2", ability: "startDrawGoblin" },
        gobBig: { id: "gobBig", rarity: "common", baseHp: 11,
                  elems: ["strength"], starter: "strength",
                  img: "3", ability: "firstSpellDmg", abilityVal: 1 },
        gobTrap: { id: "gobTrap", rarity: "common", baseHp: 12,
                   elems: ["strength"], starter: "strength",
                   img: "4", ability: "startDrawTrap" },
        gobFire: { id: "gobFire", rarity: "rare", baseHp: 13,
                   elems: ["strength"], starter: "strength",
                   img: "5", ability: "strengthSpellDmg", abilityVal: 1 },
        gobElite: { id: "gobElite", rarity: "rare", baseHp: 14,
                    elems: ["strength"], starter: "strength",
                    img: "6", ability: "goblinChainSummon", abilityVal: 1 },
        gobMaster: { id: "gobMaster", rarity: "rare", baseHp: 15,
                     elems: ["strength"], starter: "strength",
                     img: "8", ability: "strengthSpellReplay" },
        boss: { id: "boss", rarity: "epic", baseHp: 18,
                elems: ["strength"], starter: "strength",
                img: "7", ability: "goblinDeathReplay" },
        // ── «Роща Роста»: карты персонажей её врагов (просил юзер) ────────
        grwBeasts: { id: "grwBeasts", rarity: "common", baseHp: 10,
                     elems: ["growth"], starter: "growth",
                     img: "9", ability: "startDrawAnimal" },
        grwGrove: { id: "grwGrove", rarity: "common", baseHp: 11,
                    elems: ["growth"], starter: "growth",
                    img: "10", ability: "trapEcho" },
        grwWild: { id: "grwWild", rarity: "common", baseHp: 12,
                   elems: ["growth"], starter: "growth",
                   img: "11", ability: "startDrawPlant" },
        grwMagic: { id: "grwMagic", rarity: "common", baseHp: 13,
                    elems: ["growth"], starter: "growth",
                    img: "12", ability: "growthSpellDmg", abilityVal: 1 },
        grwCity: { id: "grwCity", rarity: "rare", baseHp: 14,
                   elems: ["growth"], starter: "growth",
                   img: "13", ability: "firstBuildingGuard" },
        grwControl: { id: "grwControl", rarity: "rare", baseHp: 15,
                      elems: ["growth"], starter: "growth",
                      img: "14", ability: "firstTurnEnergyDown" },
        grwBoss: { id: "grwBoss", rarity: "epic", baseHp: 18,
                   elems: ["growth"], starter: "growth",
                   img: "15", ability: "buildingDeathReplay" },
        // ── «Подземные ключи»: карты персонажей врагов (просил юзер).
        // 1-й этаж (арт heroes/17.png): Мудрость, 10♥, первое заклинание
        // боя даёт владельцу 1 энергию (firstSpellEnergy);
        // 2-й этаж (арт heroes/18.png): Мудрость, 11♥, первое срабатывание
        // своей ловушки в бою даёт владельцу 1 энергию (firstTrapEnergy);
        // 3-й этаж (арт heroes/19.png): Мудрость, 12♥, первое срабатывание
        // способности своего элементаля в бою — добор карты
        // (firstElementalDraw).
        // 4-й этаж (арт heroes/20.png): Мудрость, 13♥, первое накладывание
        // «Заморожен» в бою применяет эффект ещё 2 раза (firstFrozenExtra).
        // 5-й этаж (арт heroes/21.png): Мудрость, 14♥, ваши заклинания
        // Мудрости ценой 4 стоят на 1 энергию меньше (wis4SpellDiscount).
        // 6-й этаж (арт heroes/22.png): Мудрость, 15♥, первая ваша
        // сыгранная постройка стоит на 2 энергии дешевле (firstBuildingDiscount).
        // Способности работают у обеих сторон.
        wisBreeze: { id: "wisBreeze", rarity: "common", baseHp: 10,
                     elems: ["wisdom"], starter: "wisdom",
                     img: "17", ability: "firstSpellEnergy", abilityVal: 1 },
        wisWater: { id: "wisWater", rarity: "common", baseHp: 11,
                    elems: ["wisdom"], starter: "wisdom",
                    img: "18", ability: "firstTrapEnergy", abilityVal: 1 },
        wisSpirits: { id: "wisSpirits", rarity: "common", baseHp: 12,
                      elems: ["wisdom"], starter: "wisdom",
                      img: "19", ability: "firstElementalDraw", abilityVal: 1 },
        wisFlurry: { id: "wisFlurry", rarity: "common", baseHp: 13,
                     elems: ["wisdom"], starter: "wisdom",
                     img: "20", ability: "firstFrozenExtra", abilityVal: 2 },
        wisMaster: { id: "wisMaster", rarity: "rare", baseHp: 14,
                     elems: ["wisdom"], starter: "wisdom",
                     img: "21", ability: "wis4SpellDiscount", abilityVal: 1 },
        wisCity: { id: "wisCity", rarity: "rare", baseHp: 15,
                   elems: ["wisdom"], starter: "wisdom",
                   img: "22", ability: "firstBuildingDiscount", abilityVal: 2 },
        // Главарь «Подземных ключей» (арт heroes/23.png): Эпическая,
        // Мудрость, 18♥, первая сработавшая за бой способность вашего Мага
        // срабатывает дважды (firstMageDouble). В бою босс получает ещё
        // +2♥ за этаж — как главари других подземелий.
        wisMad: { id: "wisMad", rarity: "epic", baseHp: 18,
                  elems: ["wisdom"], starter: "wisdom",
                  img: "23", ability: "firstMageDouble", abilityVal: 1 },
    };
    const HERO_ORDER = ["gorbag", "elmir", "mira", "mortis"];
    // Порядок карт персонажей противников во вкладке «Герои»: гоблинские
    // пещеры, затем Роща Роста, затем «Подземные ключи» (просил юзер)
    const HERO_FOE_ORDER = ["gob", "gobBig", "gobTrap", "gobFire", "gobElite",
        "gobMaster", "boss",
        "grwBeasts", "grwGrove", "grwWild", "grwMagic", "grwCity",
        "grwControl", "grwBoss",
        "wisBreeze", "wisWater", "wisSpirits", "wisFlurry", "wisMaster",
        "wisCity", "wisMad"];

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
    // Единая точка данных для инструментов: каталог без логики.
    globalThis.GAME_CARD_DATA = {
        CARDS, RARITY_COLORS, DEFAULT_DECK, STARTER_DECKS,
        DECK_MAX, DECK_MIN, DECK_COPIES, TRAP_SLOTS,
        HEROES, HERO_ORDER, HERO_FOE_ORDER, ELEM_LOGO,
    };
})();
