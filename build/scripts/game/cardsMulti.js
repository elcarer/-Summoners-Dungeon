// МУЛЬТИЦВЕТНЫЕ карты (Сила+Рост «Рыжий лес», Рост+Честь «Белая пуща») —
// данные. Часть cardsData.js (см. cardsStrength.js).
(function () {
    globalThis.GAME_CARDS_MULTI = {
        // ── МУЛЬТИЦВЕТ «Сила + Рост» (W54, спека юзера): карты 241–242,
        // встречаются только в мультицветном подземелье «Рыжий лес»
        // (cave "sgr"). elem "strGro" — собственная мульти-стихия (рубашка
        // card_multi_back.png, цвет «рыжего леса»); multi — обе родные
        // стихии (правило колод и «Ярость природы» читают его)
        // «Эльф огня» (sg241): Эльф 2/1 — после призыва наносит 2 раза
        // по 1 урону случайным соседним (верт/гориз) существам противника
        sg241: { type: "unit", cost: 3, atk: 2, hp: 1, speed: 1,
                 creature: "elf",
                 sheet: "elf", // W60 (юзер): был лист гоблина — лист стихии по умолчанию
                 subtype: "elf", // подтип — по спеке юзера (существо Эльфа)
                 fireSnipe: 2,
                 rarity: "common", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0xc86a3e, img: "strength_growth/241" },
        // «Проросший огр» (sg242): Гоблин 3/3 — после своей атаки получает
        // +2 к урону и +2 к жизням (growOnAttack)
        sg242: { type: "unit", cost: 5, atk: 3, hp: 3, speed: 1,
                 creature: "goblin",
                 subtype: "goblin", // подтип — по спеке юзера (существо Гоблина)
                 growOnAttack: 2,
                 rarity: "common", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0x8a6a3e, img: "strength_growth/242" },
        // ── W55 (спека юзера): карты 243–246, тоже только «Рыжий лес» ─────
        // «Древомощь» (sg243): заклинание — потратить ВСЮ оставшуюся
        // энергию, цель получает «Сокрушение» и +к урону/жизням по числу
        // потраченной энергии (crushEnergy — обработка в arenaActions/
        // aiSpells; флаг u.crushGrant читает crushHit в arenaCombat)
        sg243: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", crushEnergy: true },
                 kind: "buff", // тип эффекта — по спеке юзера
                 rarity: "common", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0xc8873e, img: "strength_growth/243" },
        // «Рождение феникса» (sg244): уничтожить ВСЕ постройки, в
        // случайной пустой клетке появляется Элементаль с «Полётом» и
        // ⚔/♥ = числу уничтоженных построек (phoenix — phoenixRise в
        // arenaActions, жетон sgrElem)
        sg244: { type: "spell", cost: 5,
                 spell: { target: "none", phoenix: true },
                 kind: "summon", // тип эффекта — по спеке юзера
                 rarity: "rare", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0xd8824e, img: "strength_growth/244" },
        // «Горящие рунокамни» (sg245): постройка 0/5 — умирая, наносит
        // всем СУЩЕСТВАМ противника и его базе урон = числу заклинаний
        // в сбросе владельца (runeBurn — killUnit в arenaDamage)
        sg245: { type: "building", cost: 3, atk: 0, hp: 5, runeBurn: true,
                 rarity: "epic", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0xb8652e, img: "strength_growth/245" },
        // «Закат перворожденных» (sg246): постройка 0/2 — после розыгрыша
        // 6 верхних карт своей колоды в сброс; за каждое сброшенное
        // заклинание соседние (верт/гориз) существа получают −1 к урону
        // (sunsetMill — addUnit в arenaBoard)
        sg246: { type: "building", cost: 1, atk: 0, hp: 2, sunsetMill: 6,
                 rarity: "rare", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0x8f7a52, img: "strength_growth/246" },
        // Элементаль из «Рождения феникса» (sg244) — служебная карта без
        // лица, как icePixie/skel: спавнится только заклинанием. Статы
        // (= числу уничтоженных построек) ставит phoenixRise поверх базы
        // 1/1. ЖЕТОН БЕЗ multi: «Ярость природы» бьёт при РОЗЫГРЫШЕ карт,
        // а не при призыве жетона — multiFury читает def.multi
        sgrElem: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                   creature: "goblin", sheet: "air_el", ability: "flyOver",
                   subtype: "elemental", // подтип — по спеке юзера (Элементаль)
                   rarity: "common", elem: "strGro",
                   color: 0xd8824e },
        // ── W56 (спека юзера): карта 247, тоже только «Рыжий лес» ──────────
        // «Эльф корней» (sg247): заклинание призыва — Эльф 1/1 (жетон
        // sgrRootElf) на случайную пустую клетку поля. Способность жетона
        // rootGrab: после приезда случайное вражеское существо получает
        // «Опутывание 1» (summonRootElf — arenaSummons)
        sg247: { type: "spell", cost: 1,
                 spell: { target: "none", rootSummon: true },
                 kind: "summon", // тип эффекта — по спеке юзера
                 rarity: "common", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0x6f8a4e, img: "strength_growth/247" },
        // Эльф корней из «Эльфа корней» (sg247) — служебная карта без
        // лица, как icePixie/skel: спавнится только заклинанием. rootGrab —
        // «Опутывание N» случайному вражескому существу после приезда.
        // ЖЕТОН БЕЗ multi: «Ярость природы» бьёт при РОЗЫГРЫШЕ карт,
        // а не при призыве жетона — multiFury читает def.multi
        sgrRootElf: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                      creature: "elf", sheet: "elf", // W60: лист эльфа, не гоблина
                      rootGrab: 1,
                      subtype: "elf", // подтип — по спеке юзера (Эльф)
                      rarity: "common", elem: "strGro",
                      color: 0x6f8a4e },
        // ── W57 (спека юзера): карты 248–250, тоже только «Рыжий лес» ──────
        // «Лужи магмы» (sg248): ловушка на пустую клетку — существо,
        // оказавшееся на ней перемещением/призывом, получает 1 урон;
        // выжило — ловушка НЕ исчезает, а переезжает в случайную пустую
        // клетку поля (magmaPool/relocateMagma — arenaTraps)
        sg248: { type: "trap", cost: 2,
                 trap: { event: "onCell", effect: "magmaPool", amount: 1 },
                 rarity: "rare", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0xb06a3e, img: "strength_growth/248" },
        // «Огнелис» (sg249): заклинание призыва — Животное (жетон sgrFox)
        // в случайную пустую клетку; после призыва игрок распределяет
        // 7 очков характеристик между уроном и жизнями (панель
        // openSplitPanel — arenaPanels; ИИ — авто поровну)
        sg249: { type: "spell", cost: 3,
                 spell: { target: "none", summonPoints: 7, summonToken: "sgrFox" },
                 kind: "summon", // тип эффекта — по спеке юзера
                 rarity: "epic", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0xd8824e, img: "strength_growth/249" },
        // «Огнемедведь» (sg250): то же, что «Огнелис», но 9 очков и жетон
        // sgrBear (лист медведя)
        sg250: { type: "spell", cost: 4,
                 spell: { target: "none", summonPoints: 9, summonToken: "sgrBear" },
                 kind: "summon", // тип эффекта — по спеке юзера
                 rarity: "epic", elem: "strGro",
                 multi: ["strength", "growth"],
                 color: 0xc4763e, img: "strength_growth/250" },
        // Огнелис из «Огнелиса» (sg249) — служебная карта без лица, как
        // icePixie/skel: спавнится только заклинанием. statPoints — очки
        // характеристик: распределение происходит при РОЗЫГРЫШЕ карты
        // (панель/ИИ-авто), базовые статы = авто-распределению ceil/floor
        // (у sgrFox 4/3 из 7 очков, у sgrBear 5/4 из 9).
        // ЖЕТОН БЕЗ multi: «Ярость природы» бьёт при РОЗЫГРЫШЕ карт, а не
        // при призыве жетона — multiFury читает def.multi
        sgrFox: { type: "unit", cost: 3, atk: 4, hp: 3, speed: 1,
                  creature: "animal", sheet: "wolf", statPoints: 7,
                  subtype: "animal", // подтип — по спеке юзера (Животное)
                  rarity: "epic", elem: "strGro",
                  color: 0xd8824e },
        // Огнемедведь из «Огнемедведя» (sg250) — как sgrFox, 9 очков
        sgrBear: { type: "unit", cost: 4, atk: 5, hp: 4, speed: 1,
                   creature: "animal", sheet: "bear", statPoints: 9,
                   subtype: "animal", // подтип — по спеке юзера (Животное)
                   rarity: "epic", elem: "strGro",
                   color: 0xc4763e },
        // ── W61 (спека юзера): карты 251–252 — МУЛЬТИЦВЕТ «Рост + Честь»,
        // встречаются только в мультицветном подземелье «Белая пуща»
        // (cave "gh"). elem "groHon" — собственная мульти-стихия (рубашка
        // card_multi_back.png); multi — обе родные стихии
        // «Корона леса» (gh251): постройка 0/8 — когда СВОЁ существо
        // получает усиление, оно получает это усиление ещё 1 раз
        // (buffEcho — единый хук onBuff в arenaCombat; каждая Корона на
        // поле даёт по одному повтору)
        gh251: { type: "building", cost: 5, atk: 0, hp: 8, buffEcho: true,
                 rarity: "rare", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x4e7a52, img: "growth_honor/251" },
        // «Белый волк» (gh252): заклинание призыва — Животное (жетон
        // ghWolf) 2/3 в случайную пустую клетку поля (wolfSpawn —
        // arenaActions/aiSpells)
        gh252: { type: "spell", cost: 3,
                 spell: { target: "none", wolfSummon: true },
                 kind: "summon", // тип эффекта — по спеке юзера
                 rarity: "common", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x8a9a7e, img: "growth_honor/252" },
        // Белый волк из «Белого волка» (gh252) — служебная карта без лица,
        // спавнится только заклинанием. Способность wolfPack: когда волк
        // получает усиление, соседние (верт/гориз) СВОИ существа получают
        // +1 к урону и +1 к жизням (onBuff в arenaCombat).
        // ЖЕТОН БЕЗ multi — как sgrRootElf/sgrFox
        ghWolf: { type: "unit", cost: 1, atk: 2, hp: 3, speed: 1,
                  creature: "animal", sheet: "wolf", wolfPack: true,
                  subtype: "animal", // подтип — по спеке юзера (Животное)
                  rarity: "common", elem: "groHon",
                  color: 0x8a9a7e },
        // ── W65 (спека юзера): карты 253–256 — мультицвет «Рост + Честь»,
        // встречаются только в «Белой пуще». Ключ — «перемещение»:
        // ловушка-гонка, обмен местами, эльф со Скоростью и Циклон
        // «Путь одуванчиков» (gh253): ловушка на пустую клетку — вошедшее
        // на неё ЛЮБОЕ существо едет последовательными шагами до
        // препятствия: своё владельцу — в том же направлении, в котором
        // вошло, чужое — в противоположном (dandelionPath —
        // dandelionPathAct в arenaTraps). Направление входа —
        // u.lastMoveDir, его ставят все точки перемещений (W65)
        gh253: { type: "trap", cost: 1,
                 trap: { event: "onAnyCell", effect: "dandelionPath" },
                 kind: "move", // тип эффекта — по спеке юзера (Перемещение)
                 rarity: "common", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x7fa06e, img: "growth_honor/253" },
        // «Перемена мест» (gh254): поменять местами два объекта
        // (существо/постройку) — считается перемещением: оба триггерят
        // ловушки новых клеток (swap — swapObjectsAct в arenaSpells;
        // выбор поочерёдный — B.swapPick в arenaActions)
        gh254: { type: "spell", cost: 1,
                 spell: { target: "anyObj", swap: true },
                 kind: "move", // тип эффекта — по спеке юзера (Перемещение)
                 rarity: "common", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x8fae7d, img: "growth_honor/254" },
        // «Новобранец» (gh255): Эльф 0/1 за 0⚡ — «Скорость 2»
        // (dashN/abilityVal — как у Колесницы hon187)
        gh255: { type: "unit", cost: 0, atk: 0, hp: 1, speed: 2,
                 creature: "elf", sheet: "elf", ability: "dashN",
                 abilityVal: 2,
                 subtype: "elf", // подтип — по спеке юзера (Эльф)
                 rarity: "common", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x9fbe8c, img: "growth_honor/255" },
        // «Циклон» (gh256): каждое существо поля сдвигается в случайную
        // пустую соседнюю клетку; некуда — возвращается в руку владельца
        // (cyclone — cycloneAct в arenaSpells, по образцу rowShift)
        gh256: { type: "spell", cost: 5,
                 spell: { target: "none", cyclone: true },
                 kind: ["move", "control"], // типы эффекта — по спеке юзера
                 rarity: "epic", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x6ea08e, img: "growth_honor/256" },
        // ── W72 (спека юзера): карты 257–259, тоже только «Белая пуща» ────
        // «Элитный лучник» (gh257): Человек 5/5 с «Выстрелом 3» —
        // archer/shotDmg, как у Арбалетчика hon172; стреляет после
        // перемещения (afterMoved → performShot)
        gh257: { type: "unit", cost: 6, atk: 5, hp: 5, speed: 1,
                 creature: "human", sheet: "knight", ability: "archer",
                 shotDmg: 3,
                 subtype: "human", // подтип — по спеке юзера (Человек)
                 rarity: "rare", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x7fa576, img: "growth_honor/257" },
        // «Небо в стрелах» (gh258): все СВОИ существа применяют свой
        // «Выстрел», как будто они переместились; у не-стрелков —
        // виртуальный «Выстрел 1» (volley — volleyAct в arenaSpells;
        // полный путь выстрела: релей героя-Чести и откат Баллисты)
        gh258: { type: "spell", cost: 5,
                 spell: { target: "none", volley: true },
                 kind: "damage", // тип эффекта — по спеке юзера
                 rarity: "epic", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x6e8e9e, img: "growth_honor/258" },
        // «Полные колчаны» (gh259): выбранное существо получает
        // «Выстрел 1», а у стрелка выстрел растёт на 1 (quiver —
        // u.quiverBonus читают performShot/archerShot в arenaCombat)
        gh259: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", quiver: true },
                 kind: "buff", // тип эффекта — по спеке юзера
                 rarity: "rare", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x9eae6e, img: "growth_honor/259" },
        // ── W73 (спека юзера): карта 260 — тоже только «Белая пуща» ──────
        // «Засека» (gh260): ловушка на пустую клетку — при перемещении/
        // призыве ЛЮБОГО существа на неё (включая хозяина — нейтральная,
        // как «Путь одуванчиков») все ПОСТРОЙКИ владельца применяют свой
        // «Выстрел», как будто они переместились; у постройки без
        // выстрела — виртуальный «Выстрел 1» (bldVolley — bldVolleyAct
        // в arenaTraps; зеркало «Неба в стрелах» gh258 для построек:
        // «Осадная башня» стреляет своим siegeShot, остальным archerShot
        // с forced=1). Ловушка расходуется
        gh260: { type: "trap", cost: 1,
                 trap: { event: "onAnyCell", effect: "bldVolley" },
                 kind: "damage", // тип эффекта — по спеке юзера
                 rarity: "epic", elem: "groHon",
                 multi: ["growth", "honor"],
                 color: 0x7e9e6e, img: "growth_honor/260" },
        // ── W75 (спека юзера): карты 261–263 — МУЛЬТИЦВЕТ «Честь +
        // Мудрость», встречаются только в «Небесном дворце» (cave "hw").
        // elem "honWis" — собственная мульти-стихия (рубашка
        // card_multi_back.png); multi — обе родные стихии
        // «Вихри магии» (hw261): заклинание — цель получает +1/+1 за
        // каждый СВОЙ эффект (способности/особости карты; список —
        // HW_EFFECT_KEYS в arenaSpells; vortexBuff — arenaSpells/aiSpells)
        hw261: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", vortexBuff: true },
                 kind: "buff", // тип эффекта — по спеке юзера
                 rarity: "common", elem: "honWis",
                 multi: ["honor", "wisdom"],
                 color: 0x6e9ec4, img: "honor_wisdom/261" },
        // «Наездник грифона» (hw262): Человек 2/3 — «Полёт» (flyOver,
        // как у мини-феи) и «Скорость 1» (рывок после призыва). У существа
        // одна ключевая способность (def.ability), поэтому «Скорость» —
        // флагом dashVal (= N): триггер рядом с dash1/dashN в arenaBoard
        hw262: { type: "unit", cost: 3, atk: 2, hp: 3, speed: 1,
                 creature: "human", sheet: "knight", ability: "flyOver",
                 dashVal: 1,
                 subtype: "human", // подтип — по спеке юзера (Человек)
                 rarity: "common", elem: "honWis",
                 multi: ["honor", "wisdom"],
                 color: 0x8ab4d8, img: "honor_wisdom/262" },
        // «Воздушный щит» (hw263): заклинание — цель не получает урона,
        // кроме ОБЫЧНЫХ атак (удар существом врукопашную: марш, рывок,
        // выпад). Всё прочее (заклинания, ловушки, выстрелы, Ответ, яд,
        // всплески способностей) гасится целиком (u.airShield читает
        // damageUnit в arenaDamage; airShieldAct — arenaSpells/aiSpells)
        hw263: { type: "spell", cost: 1,
                 spell: { target: "anyUnit", airShield: true },
                 kind: "buff", // тип эффекта — по спеке юзера
                 rarity: "common", elem: "honWis",
                 multi: ["honor", "wisdom"],
                 color: 0x9ecbe8, img: "honor_wisdom/263" },
    };
})();
