// ГЕРОИ — данные карт персонажей (игрок и враги). Часть cardsData.js:
// сборка каталога и правила колод — там, героев читает GAME_CARD_DATA.
(function () {
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
        // ── «Рыжий лес» (мультицвет Сила+Рост, W54, спека юзера) ─────────
        // «Большой размер» (арт heroes/66.png): ДВУХЦВЕТНЫЙ герой — elems
        // из двух стихий (правило колод: карты обеих стихий + мультицветные
        // с хотя бы одной из них). 16♥, редкая; способность bigStomp:
        // когда ваше существо с уроном 6+ атакует, оно наносит 1 урон
        // базе противника
        sgrBig: { id: "sgrBig", rarity: "rare", baseHp: 16,
                  elems: ["strength", "growth"], starter: "strGro",
                  img: "66", ability: "bigStomp", abilityVal: 1 },
        // «Горящая местность» (W55, спека юзера, арт heroes/67.png): враг
        // 2-го этажа «Рыжего леса». 18♥, редкая; способность burnDeath:
        // когда ВАША постройка умирает, нанесите 1 урон базе противника
        sgrBurn: { id: "sgrBurn", rarity: "rare", baseHp: 18,
                   elems: ["strength", "growth"], starter: "strBurn",
                   img: "67", ability: "burnDeath", abilityVal: 1 },
        // «Безумие стаи» (W56, спека юзера, арт heroes/68.png): враг
        // 3-го этажа «Рыжего леса». 20♥, редкая; способность packFrenzy:
        // когда срабатывает способность СУЩЕСТВА владельца — 1 урон базе
        // противника (точки вызова packFrenzy: призывные хуки addUnit,
        // ogrGrow/afterAttackPush, predator, summonDruidWolf, fleeCoward,
        // druidEnergy)
        sgrPack: { id: "sgrPack", rarity: "rare", baseHp: 20,
                   elems: ["strength", "growth"], starter: "strPack",
                   img: "68", ability: "packFrenzy", abilityVal: 1 },
        // «Эльф-отступник» (W57, спека юзера, арт heroes/69.png): БОСС
        // «Рыжего леса» — последняя комната 3-го этажа (CAVES.sgr.boss →
        // ENCOUNTERS.sgrBoss). 22♥, эпическая; способность baseRage: когда
        // наносится урон базе противника, наносится на 1 урон больше
        // (damageBase — единая точка урона базе)
        sgrApostate: { id: "sgrApostate", rarity: "epic", baseHp: 22,
                       elems: ["strength", "growth"], starter: "strBoss",
                       img: "69", ability: "baseRage", abilityVal: 1 },
        // ── «Белая пуща» (мультицвет Рост+Честь, W61, спека юзера) ─────────
        // «Зелёные рыцари» (арт heroes/70.png): враг 1-го этажа. ДВУХЦВЕТНЫЙ
        // герой — elems из двух стихий. 16♥, редкая; способность buffHeal:
        // когда существо владельца получает усиление, его база лечится на
        // 1 жизнь (onBuff — единый хук усиления в arenaCombat)
        ghKnight: { id: "ghKnight", rarity: "rare", baseHp: 16,
                    elems: ["growth", "honor"], starter: "groHon",
                    img: "70", ability: "buffHeal", abilityVal: 1 },
        // «Долгая прогулка» (арт heroes/71.png): враг 2-го этажа (W65,
        // спека юзера). ДВУХЦВЕТНЫЙ герой Рост+Честь. 18♥, редкая;
        // способность walkHeal: когда ЛЮБОЕ существо перемещается — кроме
        // своего обычного перемещения в начале хода (марша) — его база
        // лечится на 1 жизнь (walkHealTick в arenaCombat; марш зовёт
        // afterMoved с regular=true — лечение не триггерит)
        ghWalk: { id: "ghWalk", rarity: "rare", baseHp: 18,
                  elems: ["growth", "honor"], starter: "groHon",
                  img: "71", ability: "walkHeal", abilityVal: 1 },
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
        // ── «Земли мёртвых»: карта персонажа врага (просил юзер).
        // 1-й этаж (арт heroes/25.png): Тлен, 10♥, начиная бой берёт
        // дополнительную случайную карту Скелета из колоды.
        decBones: { id: "decBones", rarity: "common", baseHp: 10,
                    elems: ["decay"], starter: "decay",
                    img: "25", ability: "startDrawSkeleton" },
        // 2-й этаж (арт heroes/26.png): Тлен, 11♥, начиная бой берёт
        // дополнительное случайное заклинание стихии Тлен из колоды
        decBlack: { id: "decBlack", rarity: "common", baseHp: 11,
                    elems: ["decay"], starter: "decay",
                    img: "26", ability: "startDrawDecaySpell" },
        // 3-й этаж (арт heroes/27.png): Тлен, 12♥, при первом за бой
        // срабатывании своей способности «Выкапливание» берёт 1 карту
        // и получает 1 энергию
        decUnder: { id: "decUnder", rarity: "common", baseHp: 12,
                    elems: ["decay"], starter: "decay",
                    img: "27", ability: "firstDigReward" },
        // 4-й этаж (арт heroes/28.png): Тлен, 13♥, первая за бой карта,
        // чей эффект сбросил карты, после своего розыгрыша возвращается
        // в руку (playCtx/noteDiscard — см. arenaCombat)
        decMind: { id: "decMind", rarity: "common", baseHp: 13,
                   elems: ["decay"], starter: "decay",
                   img: "28", ability: "firstDiscardReplay" },
        // 5-й этаж (арт heroes/29.png): Тлен, 14♥, первый призванный
        // в этом бою Скелет (включая жетоны Толпы/Поля костей) наносит
        // базе противника урон в размере своего урона
        decArmy: { id: "decArmy", rarity: "rare", baseHp: 14,
                   elems: ["decay"], starter: "decay",
                   img: "29", ability: "firstSkeletonStrike" },
        // 6-й этаж (арт heroes/30.png): Тлен, 15♥, первая за бой гибель
        // СВОЕГО существа лечит базу владельца на 3 (firstDeathHeal —
        // хук в killUnit)
        decThirst: { id: "decThirst", rarity: "rare", baseHp: 15,
                     elems: ["decay"], starter: "decay",
                     img: "30", ability: "firstDeathHeal" },
        // «Архилич» (босс «Земель мёртвых», просил юзер): первая за бой
        // Эпическая карта владельца стоит на 2 энергии дешевле
        // (epicDiscount — effCost + consumeEpicDiscount в arenaCards)
        decLich: { id: "decLich", rarity: "epic", baseHp: 18,
                   elems: ["decay"], starter: "decay",
                   img: "31", ability: "epicDiscount", abilityVal: 2 },
        // Леон фон Орэ (просил юзер): Честь (белая), 15♥, первое за бой
        // призванное существо стихии Честь получает «Защиту 1»
        // (firstHonorGuard — у.protect, режется в damageUnit). Спрайт героя
        // и всех существ Чести — лист рыцаря knight_256 (пока один, просил юзер)
        leon: {
            id: "leon", rarity: "common",
            baseHp: 15, elems: ["honor"], starter: "honor",
            img: "32", ability: "firstHonorGuard", abilityVal: 1,
        },
        // «Мятежники» (1-й этаж «Залов Чести», просил юзер): Честь (белая),
        // 10♥, первое призванное в бою существо стихии Честь получает
        // «Скорость 1» (firstHonorDash — summonDash сразу после призыва;
        // если у существа своя «Скорость 1», геройский рывок даётся ПОВЕРХ
        // — «Скорость» складывается, просил юзер). Спрайт — heroes/33.png
        honRebels: { id: "honRebels", rarity: "common", baseHp: 10,
                     elems: ["honor"], starter: "honor",
                     img: "33", ability: "firstHonorDash", abilityVal: 1 },
        // «Конница» (2-й этаж «Залов Чести», просил юзер): первое
        // призванное стороной существо СО СВОЕЙ «Скоростью» (dash1)
        // получает при призыве +1 к урону (firstSpeedAtk — до рывка,
        // удар рывком уже усиленный). Спрайт — heroes/34.png
        honCavalry: { id: "honCavalry", rarity: "common", baseHp: 11,
                      elems: ["honor"], starter: "honor",
                      img: "34", ability: "firstSpeedAtk", abilityVal: 1 },
        // «Укрепления» (3-й этаж «Залов Чести», просил юзер): Честь
        // (белая), 12♥, начиная бой берёт дополнительную случайную карту
        // ПОСТРОЙКИ из колоды (startDrawBuilding — heroStartDraw в
        // arenaFlow). Спрайт — heroes/35.png
        honRampart: { id: "honRampart", rarity: "common", baseHp: 12,
                      elems: ["honor"], starter: "honor",
                      img: "35", ability: "startDrawBuilding" },
        // «Святость» (4-й этаж «Залов Чести», просил юзер): начиная бой
        // берёт случайную карту заклинания стихии Честь из колоды
        honZealot: { id: "honZealot", rarity: "common", baseHp: 13,
                     elems: ["honor"], starter: "honor",
                     img: "36", ability: "startDrawHonorSpell" },
        // «Отряд соседа» (5-й этаж «Залов Чести», просил юзер): первая за
        // бой способность СУЩЕСТВА ЧЕСТИ стороны активируется дополнительный
        // раз (honorRelay — honorRelayAct в arenaCards, образец «Безумный
        // маг»). Спрайт — heroes/37.png
        honNeighbor: { id: "honNeighbor", rarity: "rare", baseHp: 14,
                       elems: ["honor"], starter: "honor",
                       img: "37", ability: "honorRelay" },
        // «Великая битва» (6-й этаж «Залов Чести», просил юзер): Честь
        // (белая), 15♥, в начале боя ОБА игрока призывают случайное
        // существо из своей колоды — в ряд, ближайший к своей базе, в
        // случайную пустую клетку, без траты энергии (greatBattle —
        // greatBattleSummon в arenaCards, вызов из enter арены).
        // Спрайт — heroes/38.png
        honGreatBattle: { id: "honGreatBattle", rarity: "rare", baseHp: 15,
                          elems: ["honor"], starter: "honor",
                          img: "38", ability: "greatBattle" },
        // «Претендент на трон» (босс «Залов Чести», на каждом из 6 этажей,
        // просил юзер): Честь (белая), 18♥, Эпическая. Способность
        // throneGuard: когда у базы ВЛАДЕЛЬЦА меньше 10 жизней и она
        // получает жизни, она получает на 1 жизнь больше (healBase).
        // Спрайт — heroes/39.png
        honThrone: { id: "honThrone", rarity: "epic", baseHp: 18,
                     elems: ["honor"], starter: "honor",
                     img: "39", ability: "throneGuard" },
        // Тордин Изобретатель (просил юзер): Время (фиолетовая), 15♥,
        // первая за бой ПОСТРОЙКА владельца стоит на 1 энергию меньше
        // (firstBuildingDiscount, abilityVal 1 — тот же механизм, что у
        // «Города мудрости», но дешевле; флаг тратится в addUnit).
        // Спрайт — heroes/40.png
        tordin: {
            id: "tordin", rarity: "common",
            baseHp: 15, elems: ["time"], starter: "time",
            img: "40", ability: "firstBuildingDiscount", abilityVal: 1,
        },
        // «Бой во времени» (противник 1-го этажа данжа Времени, просил
        // юзер): Время (фиолетовая), 10♥, обычная. Способность
        // startDrawDelayed — начиная бой берёт случайный призыв со
        // «Сдвигом» из колоды (heroStartDraw в arenaFlow).
        // Спрайт — heroes/41.png
        timBattle: {
            id: "timBattle", rarity: "common",
            baseHp: 10, elems: ["time"], starter: "time",
            img: "41", ability: "startDrawDelayed",
        },
        // «Долгий сдвиг» (противник 2-го этажа данжа Времени, просил
        // юзер): Время (фиолетовая), 11♥, обычная. Способность
        // firstDelayMinus — первый за бой призыв стороны со «Сдвигом»
        // (из своей карты) приходит на 1 ход раньше (addUnit).
        // Спрайт — heroes/47.png
        longShift: {
            id: "longShift", rarity: "common",
            baseHp: 11, elems: ["time"], starter: "time",
            img: "47", ability: "firstDelayMinus", abilityVal: 1,
        },
        // «В прошлое» (противник 3-го этажа данжа Времени, просил юзер):
        // Время (фиолетовая), 12♥, обычная. Способность firstReturnPlus —
        // первый за бой призыв стороны со «Возвратом» приходит с
        // счётчиком на 2 больше (addUnit). Спрайт — heroes/48.png
        intoTime: {
            id: "intoTime", rarity: "common",
            baseHp: 12, elems: ["time"], starter: "time",
            img: "48", ability: "firstReturnPlus", abilityVal: 2,
        },
        // «Стройка» (противник 4-го этажа данжа Времени, просил юзер):
        // Время (фиолетовая), 13♥, обычная. Способность startBuildingPlay —
        // в начале боя разыгрывает случайную постройку с руки БЕСПЛАТНО
        // (startBuildingPlay в arenaFlow, зовётся из enter рядом с
        // «Великой битвой»). Спрайт — heroes/49.png
        timBuild: {
            id: "timBuild", rarity: "common",
            baseHp: 13, elems: ["time"], starter: "time",
            img: "49", ability: "startBuildingPlay",
        },
        // «Опасности парадоксов» (противник 5-го этажа данжа Времени,
        // просил юзер): Время (фиолетовая), 14♥, редкая. Способность
        // trapReplay — первая за бой ловушка СТОРОНЫ, разыгранная картой,
        // повторяется в случайную клетку поля боя без траты энергии
        // (armTrap в arenaTraps). Спрайт — heroes/50.png
        paradox: {
            id: "paradox", rarity: "rare",
            baseHp: 14, elems: ["time"], starter: "time",
            img: "50", ability: "trapReplay", abilityVal: 1,
        },
        // «Поиск ответов» (6-й этаж данжа Времени, просил юзер): Время,
        // 15♥, редкая. Способность openTutor — в начале игры добрать 3
        // карты и после этого сбросить 3 карты с руки (arenaScene,
        // сразу после стартовой раздачи). Спрайт — heroes/51.png
        answers: {
            id: "answers", rarity: "rare",
            baseHp: 15, elems: ["time"], starter: "time",
            img: "51", ability: "openTutor", abilityVal: 3,
        },
        // Босс «Логова Времени» (просил юзер): «Тёмный владыка» —
        // Эпическая, Время, 18♥. Способность baseReflect: первый за бой
        // урон БАЗЕ владельца отражается — базе противника наносится
        // столько же (damageBase; босс стоит на каждом этаже данжа,
        // как главари других подземелий). Спрайт — heroes/52.png
        darklord: {
            id: "darklord", rarity: "epic",
            baseHp: 18, elems: ["time"], starter: "time",
            img: "52", ability: "baseReflect",
        },
        // ── «Охранники мостов» (просил юзер): бродячие враги открытого
        // мира, патрулируют мосты через реки в зонах своих стихий.
        // Общий принцип: 16♥, обычная; при гибели СВОЕГО существа СВОЕЙ
        // стихии срабатывает способность (каждый раз, не «первый за бой»).
        // Спрайты в мире — спрайтшиты существ стихии (как у охраны данжей).
        // Способности работают у обеих сторон (хуки в killUnit,
        // arenaDamage.js).
        // «Охранник Силы» (heroes/42.png): при гибели своего существа
        // Силы наносит 1 урон случайному существу или постройке противника
        // (elemDeathSnipe).
        strGuard: {
            id: "strGuard", rarity: "common",
            baseHp: 16, elems: ["strength"], starter: "strength",
            img: "42", ability: "elemDeathSnipe", abilityVal: 1,
        },
        // «Охранник Роста» (heroes/43.png): при гибели своего существа
        // Роста случайное ваше существо получает +1 к жизням (elemDeathHp)
        grwGuard: {
            id: "grwGuard", rarity: "common",
            baseHp: 16, elems: ["growth"], starter: "growth",
            img: "43", ability: "elemDeathHp", abilityVal: 1,
        },
        // «Охранник Мудрости» (heroes/44.png): при гибели своего существа
        // Мудрости возьмите карту, затем скиньте карту с руки на выбор
        // (elemDeathLoot; выбор игрока — панель сброса в начале его хода,
        // как у «Торговца»; ИИ сбрасывает сам)
        wisGuard: {
            id: "wisGuard", rarity: "common",
            baseHp: 16, elems: ["wisdom"], starter: "wisdom",
            img: "44", ability: "elemDeathLoot", abilityVal: 1,
        },
        // «Охранник Тлена» (heroes/45.png): при гибели своего существа
        // Тлена верните карту призыва из сброса в руку, затем скиньте
        // карту с руки на выбор (elemDeathReturn)
        decGuard: {
            id: "decGuard", rarity: "common",
            baseHp: 16, elems: ["decay"], starter: "decay",
            img: "45", ability: "elemDeathReturn", abilityVal: 1,
        },
        // «Охранник Чести» (heroes/46.png): при гибели своего существа
        // Чести, если у вашей базы 3 жизни и меньше, вылечите ей 1 жизнь
        // (elemDeathMend)
        honGuard: {
            id: "honGuard", rarity: "common",
            baseHp: 16, elems: ["honor"], starter: "honor",
            img: "46", ability: "elemDeathMend", abilityVal: 1,
        },
        // «Охранник Времени» (heroes/53.png, просил юзер): при гибели
        // своего существа Времени у одного случайного вашего существа
        // в «Сдвиге» (значок-счётчик ещё тает) «Сдвиг» уменьшается на 1
        // (elemDeathDelay — guardDeathAct)
        timGuard: {
            id: "timGuard", rarity: "common",
            baseHp: 16, elems: ["time"], starter: "time",
            img: "53", ability: "elemDeathDelay", abilityVal: 1,
        },
        // ── «Простые» враги открытого мира (просил юзер W29): случайные
        // враги точек спавна зон, способности нет. Ядро колоды НЕ
        // фиксировано — 9 случайных Обычных карт стихии при спавне
        // (dataCards.wildDeck); победа над одним усиливает всех
        // одноимённых: +1 макс. жизнь и +1 Редкая карта в ядро
        strSimple: { id: "strSimple", rarity: "common", baseHp: 8,
                     elems: ["strength"], starter: "strength", img: "54" },
        grwSimple: { id: "grwSimple", rarity: "common", baseHp: 8,
                     elems: ["growth"], starter: "growth", img: "55" },
        wisSimple: { id: "wisSimple", rarity: "common", baseHp: 8,
                     elems: ["wisdom"], starter: "wisdom", img: "56" },
        honSimple: { id: "honSimple", rarity: "common", baseHp: 8,
                     elems: ["honor"], starter: "honor", img: "57" },
        decSimple: { id: "decSimple", rarity: "common", baseHp: 8,
                     elems: ["decay"], starter: "decay", img: "58" },
        timSimple: { id: "timSimple", rarity: "common", baseHp: 8,
                     elems: ["time"], starter: "time", img: "59" },
        // ── «Разбойники» — РЕДКИЕ бродячие враги открытого мира (просил
        // юзер W40, арты heroes/60–65.png): база 12♥, ядро колоды НЕ
        // фиксировано — 8 Обычных + 3 Редких + 1 Эпическая карта стихии
        // при спавне (dataCards.raiderDeck). Способности — «первый раз
        // за бой»: Сила — убив существо, бьёт 2 по случайному существу
        // (firstKillSnipe); Рост — ударив базу, бьёт 4 по случайной
        // постройке (firstBaseHitBuild); Мудрость — сыграв заклинание,
        // получает 2⚡ (firstSpellEnergy); Честь — атаковав существо,
        // лечит базе 2♥ (firstAttackHeal); Тлен — нанеся урон существу,
        // даёт «Возврат 1» случайному своему (firstDmgReturn); Время —
        // оставшись без карт в руке, берёт 2 (emptyHandDraw).
        // Способности работают у обеих сторон
        strRaider: { id: "strRaider", rarity: "rare", baseHp: 12,
                     elems: ["strength"], starter: "strength",
                     img: "60", ability: "firstKillSnipe", abilityVal: 2 },
        grwRaider: { id: "grwRaider", rarity: "rare", baseHp: 12,
                     elems: ["growth"], starter: "growth",
                     img: "61", ability: "firstBaseHitBuild", abilityVal: 4 },
        wisRaider: { id: "wisRaider", rarity: "rare", baseHp: 12,
                     elems: ["wisdom"], starter: "wisdom",
                     img: "62", ability: "firstSpellEnergy", abilityVal: 2 },
        decRaider: { id: "decRaider", rarity: "rare", baseHp: 12,
                     elems: ["decay"], starter: "decay",
                     img: "64", ability: "firstDmgReturn", abilityVal: 1 },
        honRaider: { id: "honRaider", rarity: "rare", baseHp: 12,
                     elems: ["honor"], starter: "honor",
                     img: "63", ability: "firstAttackHeal", abilityVal: 2 },
        timRaider: { id: "timRaider", rarity: "rare", baseHp: 12,
                     elems: ["time"], starter: "time",
                     img: "65", ability: "emptyHandDraw", abilityVal: 2 },
    };
    const HERO_ORDER = ["gorbag", "elmir", "mira", "mortis", "leon", "tordin"];
    // Порядок карт персонажей противников во вкладке «Герои»: гоблинские
    // пещеры, затем Роща Роста, затем «Подземные ключи» (просил юзер)
    const HERO_FOE_ORDER = ["gob", "gobBig", "gobTrap", "gobFire", "gobElite",
        "gobMaster", "boss",
        "grwBeasts", "grwGrove", "grwWild", "grwMagic", "grwCity",
        "grwControl", "grwBoss",
        "sgrBig", // «Рыжий лес»: двухцветный враг 1-го этажа (W54)
        "sgrBurn", // «Горящая местность»: враг 2-го этажа (W55)
        "sgrPack", // «Безумие стаи»: враг 3-го этажа (W56)
        "sgrApostate", // «Эльф-отступник»: босс «Рыжего леса» (W57)
        "ghKnight", // «Зелёные рыцари»: враг 1-го этажа «Белой пущи» (W61)
        "ghWalk", // «Долгая прогулка»: враг 2-го этажа «Белой пущи» (W65)
        "wisBreeze", "wisWater", "wisSpirits", "wisFlurry", "wisMaster",
        "wisCity", "wisMad",
        "decBones", "decBlack", "decUnder", "decMind", "decArmy",
        "decThirst", "decLich", // «Архилич» — ключ HEROES (enc.hero), не id энкаунтера
        "honRebels", "honCavalry", "honRampart", "honZealot",
        "honNeighbor", "honGreatBattle", "honThrone", // «Залы Чести» (этажи 1–6)
        "timBattle", // данж Времени, 1-й этаж (просил юзер)
        "longShift", // данж Времени, 2-й этаж (просил юзер)
        "intoTime", // данж Времени, 3-й этаж (просил юзер)
        "timBuild", // данж Времени, 4-й этаж (просил юзер)
        "paradox", // данж Времени, 5-й этаж «Опасности парадоксов» (просил юзер)
        "answers", // данж Времени, 6-й этаж «Поиск ответов» (просил юзер)
        "darklord", // босс Логова Времени «Тёмный владыка» (просил юзер)
        // «Охранники мостов» открытого мира (просил юзер)
        "strGuard", "grwGuard", "wisGuard", "decGuard", "honGuard",
        "timGuard", // «Охранник Времени» — зона Времени (просил юзер)
        // «Простые» враги открытого мира (просил юзер W29)
        "strSimple", "grwSimple", "wisSimple", "honSimple",
        "decSimple", "timSimple",
        // «Разбойники» — редкие бродячие враги открытого мира (просил юзер W40)
        "strRaider", "grwRaider", "wisRaider", "honRaider",
        "decRaider", "timRaider"];

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
    // Часть каталога для cardsData.js (его читают игра и tools/cards.html).
    globalThis.GAME_HEROES_DATA = { HEROES, HERO_ORDER, HERO_FOE_ORDER, ELEM_LOGO };
})();
