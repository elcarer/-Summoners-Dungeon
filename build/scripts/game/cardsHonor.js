// Карты стихии «Честь» (белые) — данные. Часть cardsData.js (см. cardsStrength.js).
(function () {
    globalThis.GAME_CARDS_HONOR = {
        // ── Стихия «Честь» (белые) — карты 161–166 юзера ──────────────────
        // «Ополченец» (hon161): Человек 2/1 без способностей
        hon161: { type: "unit", cost: 1, atk: 2, hp: 1, speed: 1,
                  creature: "human", sheet: "knight", // Человек — лист рыцаря (пока один на стихию, просил юзер)
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/161" },
        // «Пехотинец» (hon162): Человек 4/2 без способностей
        hon162: { type: "unit", cost: 2, atk: 4, hp: 2, speed: 1,
                  creature: "human", sheet: "knight",
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/162" },
        // «Капеллан» (hon163): «Лечение 1» — после перемещения лечит
        // случайное соседнее (верт/гориз) своё существо (healMove; хук в
        // afterMoved)
        hon163: { type: "unit", cost: 3, atk: 4, hp: 3, speed: 1,
                  creature: "human", sheet: "knight", ability: "healMove",
                  abilityVal: 1,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/163" },
        // «Молитва» (hon164): +2 к жизням любого существа
        hon164: { type: "spell", cost: 0,
                  spell: { target: "anyUnit", buffHp: 2 },
                  kind: "buff", // тип эффекта — по спеке юзера («Усиление»)
                  rarity: "common", elem: "honor",
                  color: 0xd8d3c8, img: "honor/164" },
        // «Строй» (hon165): постройка 1⚡/5♥ — существо, атаковавшее её,
        // получает 1 урон (counterSpike; хук в damageUnit)
        hon165: { type: "building", cost: 1, atk: 0, hp: 5, counterSpike: 1,
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/165" },
        // «Молебен» (hon166): призывает Человека 2/2 (служебная карта
        // parishioner) на случайную пустую клетку поля (laySummon)
        hon166: { type: "spell", cost: 1,
                  spell: { target: "none", laySummon: 1 },
                  kind: "summon", // тип эффекта — по спеке юзера («Появление существ»)
                  rarity: "common", elem: "honor",
                  color: 0xd8d3c8, img: "honor/166" },
        // «Яма-ловушка» (hon167): ловушка на пустую клетку; вошедшее/
        // призванное на неё существо противника получает урон, равный
        // МЕНЬШЕМУ из его урона и жизней (cellDmgMin — applyCellTrap)
        hon167: { type: "trap", cost: 2,
                  trap: { event: "onEnemyCell", effect: "cellDmgMin" },
                  kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xd8d3c8, img: "honor/167" },
        // «Разбойники» (hon168): Человек 3/1 со «Скоростью 1» — после
        // призыва сразу шаг на клетку вперёд или удар по стоящему впереди
        // противнику (dash1 — summonDash)
        hon168: { type: "unit", cost: 2, atk: 3, hp: 1, speed: 1,
                  creature: "human", sheet: "knight", ability: "dash1",
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/168" },
        // «Конный рыцарь» (hon169): Человек 2/4 со «Скоростью 1» (dash1)
        hon169: { type: "unit", cost: 3, atk: 2, hp: 4, speed: 1,
                  creature: "human", sheet: "knight", ability: "dash1",
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/169" },
        // «Снабжение» (hon170): у всех своих существ меньшая из ⚔/♥
        // становится равной большей (rebalance — applySpellPInner/aiSpells)
        hon170: { type: "spell", cost: 3,
                  spell: { target: "none", rebalance: 1 },
                  kind: "buff", // тип эффекта — по спеке юзера («Усиление»)
                  rarity: "common", elem: "honor",
                  color: 0xd8d3c8, img: "honor/170" },
        // «Тракт» (hon171): постройка 4⚡/4♥ — существо владельца, вставшее
        // после перемещения по соседству, едет вперёд до препятствия
        // (roadPush — roadPushAct в afterMoved)
        hon171: { type: "building", cost: 4, atk: 0, hp: 4, roadPush: 1,
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/171" },
        // «Арбалетчик» (hon172): Человек 4/2 с «Выстрелом 2» — после
        // перемещения бьёт ближайшее существо/постройку по вертикали
        // вперёд, пустая вертикаль — 2 базе противника (archer/shotDmg)
        hon172: { type: "unit", cost: 4, atk: 4, hp: 2, speed: 1,
                  creature: "human", sheet: "knight", ability: "archer",
                  shotDmg: 2,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/172" },
        // «Деревня» (hon173): постройка 5⚡/7♥ — все ПОСТРОЙКИ владельца
        // стоят на 1 энергию дешевле (village — effCost в arenaCards;
        // ИИ получает скидку тем же effCost)
        hon173: { type: "building", cost: 5, atk: 0, hp: 7, village: 1,
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/173" },
        // «Краевой камень» (hon174): постройка 1⚡/6♥ — существо противника,
        // переместившееся на клетку в одном ГОРИЗОНТАЛЬНОМ ряду с камнем,
        // переносится на пустую клетку ПЕРЕД ним (edgeStone — edgeStoneAct
        // в afterMoved)
        hon174: { type: "building", cost: 1, atk: 0, hp: 6, edgeStone: 1,
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/174" },
        // «Крепостной ров» (hon175): постройка 3⚡/4♥ — существо противника,
        // переместившееся на клетку по соседству (верт/гориз) с ЛЮБОЙ
        // постройкой владельца, теряет 1 жизнь (moat — moatAct в afterMoved)
        hon175: { type: "building", cost: 3, atk: 0, hp: 4, moat: 1,
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/175" },
        // «Крепость» (hon176): постройка 4⚡/10♥ — соседние с ней существа
        // противника не перемещаются и во время своей атаки бьют ТОЛЬКО
        // крепость (fortress — fortressPin в marchSide)
        hon176: { type: "building", cost: 4, atk: 0, hp: 10, fortress: 1,
                  rarity: "epic", elem: "honor",
                  color: 0xcfc7b0, img: "honor/176" },
        // «Вымпел империи» (hon177): постройка 2⚡/3♥ — все существа И
        // ПОСТРОЙКИ владельца имеют «Ответ 1»: после атаки на такой объект
        // атакующий получает 1 урон (banner — в damageUnit рядом со «Строем»;
        // складывается со встроенными шипами, как «Скорость»)
        hon177: { type: "building", cost: 2, atk: 0, hp: 3, banner: 1,
                  rarity: "epic", elem: "honor",
                  color: 0xcfc7b0, img: "honor/177" },
        // «Требушет империи» (hon178): постройка 6⚡/5♥ — в начале хода
        // владельца база противника получает 2 урона (trebuchet — upkeep)
        hon178: { type: "building", cost: 6, atk: 0, hp: 5, trebuchet: 2,
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/178" },
        // «Луч света» (hon179): заклинание 1⚡ — выбранное существо и
        // «выбранный игрок» получают по 1 жизни. Второй цели в игре нет,
        // как у «Негативного потока»: игрок = владелец заклинания
        // (healPlayer — applySpellPInner/aiSpells)
        hon179: { type: "spell", cost: 1,
                  spell: { target: "anyUnit", buffHp: 1, healPlayer: 1 },
                  kind: "heal", // тип эффекта — по спеке юзера («Усиление, Получение жизни»)
                  rarity: "common", elem: "honor",
                  color: 0xd8d3c8, img: "honor/179" },
        // «Испепеляющий луч» (hon180): заклинание 3⚡ — все СУЩЕСТВА в
        // клетках вертикального ряда выбранной клетки (обе стороны) получают
        // по 2 урона (columnDmg — applySpellPInner/aiSpells, цель anyCell)
        hon180: { type: "spell", cost: 3,
                  spell: { target: "anyCell", columnDmg: 2 },
                  kind: "damage", // тип эффекта — по спеке юзера («Нанесение урона»)
                  rarity: "rare", elem: "honor",
                  color: 0xd8d3c8, img: "honor/180" },
        // «Праведный гнев» (hon181): заклинание 5⚡ — выбранное существо
        // получает +6 к урону и +6 к жизням (buffAtk+buffHp — штатный путь)
        hon181: { type: "spell", cost: 5,
                  spell: { target: "anyUnit", buffAtk: 6, buffHp: 6 },
                  kind: "buff", // тип эффекта — по спеке юзера («Усиление»)
                  rarity: "common", elem: "honor",
                  color: 0xd8d3c8, img: "honor/181" },
        // «Паладин света» (hon182): Человек 4/4 — когда владелец разыгрывает
        // заклинание, это существо получает +1 к урону и +1 к жизням
        // (spellGrow — afterSpellPlayed)
        hon182: { type: "unit", cost: 5, atk: 4, hp: 4, speed: 1,
                  creature: "human", sheet: "knight", spellGrow: 1,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/182" },
        // «Торговец» (hon183): Человек 0/1 — в начале хода владельца тот
        // берёт карту, затем сбрасывает карту с руки по своему выбору
        // (tradeDraw — tradeDrawTick в upkeep; игрок выбирает в панели
        // сброса после марша, ИИ сбрасывает наименее ценную)
        hon183: { type: "unit", cost: 1, atk: 0, hp: 1, speed: 1,
                  creature: "human", sheet: "knight", tradeDraw: 1,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/183" },
        // «Баллиста» (hon184): Человек 0/4 — «Выстрел 2» после перемещения
        // (archer/shotDmg), после выстрела откатывается на клетку назад
        // (shotRetreat — shotRetreatAct в afterMoved)
        hon184: { type: "unit", cost: 4, atk: 0, hp: 4, speed: 1,
                  creature: "human", sheet: "knight", ability: "archer",
                  shotDmg: 2, shotRetreat: 1,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/184" },
        // «Святой Грааль» (hon185): постройка 7⚡/7♥ — все СУЩЕСТВА владельца
        // имеют +2 к урону и +2 к жизням (aura — recalcAuras; первые ауры
        // +X/+X в игре: сумму по своим постройкам считает штатный пересчёт)
        hon185: { type: "building", cost: 7, atk: 0, hp: 7,
                  aura: { atk: 2, hp: 2 },
                  rarity: "epic", elem: "honor",
                  color: 0xcfc7b0, img: "honor/185" },
        // «Алебардщик» (hon186): Человек 2/4 — «Ответ 2»: после атаки на
        // него атакующий получает 2 урона (counterSpike — damageUnit;
        // складывается с аурой «Вымпела империи», как у «Строя»)
        hon186: { type: "unit", cost: 3, atk: 2, hp: 4, speed: 1,
                  creature: "human", sheet: "knight", counterSpike: 2,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/186" },
        // «Колесница» (hon187): Человек 2/5 — «Скорость 2»: после призыва
        // сразу два действия (шаг вперёд или удар по впереди стоящему;
        // комбинации шаг/удар — summonDashN); в марш идёт на 2 клетки
        // (speed: 2 — значки скорости на жетоне)
        hon187: { type: "unit", cost: 4, atk: 2, hp: 5, speed: 2,
                  creature: "human", sheet: "knight", ability: "dashN",
                  abilityVal: 2,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/187" },
        // «Осадная башня» (hon188): постройка 5⚡/6♥ — «Выстрел 1» (siegeShot)
        // после перемещения; выстрел в ПОСТРОЙКУ ПРОТИВНИКА уничтожает её;
        // когда по соседству передвигается существо владельца, башня едет
        // на 1 клетку вперёд (siegeFollow — siegeFollowAct из шага марша)
        hon188: { type: "building", cost: 5, atk: 0, hp: 6,
                  siegeShot: 1, shotDmg: 1, siegeFollow: 1,
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/188" },
        // «Нищий» (hon189): Человек 0/1 — умирая, сбрасывает 1 случайную
        // карту с руки противника (dyingDiscard — killUnit/randomDiscard)
        hon189: { type: "unit", cost: 0, atk: 0, hp: 1, speed: 1,
                  creature: "human", sheet: "knight", dyingDiscard: 1,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "honor",
                  color: 0xcfc7b0, img: "honor/189" },
        // «Снизошедший» (hon190): Человек 6/6 с «Полётом» (flyOver, как
        // «Мини-фея») и стражем: если ПРОТИВНИК атакует это существо,
        // урон должен его убить, а жизней больше 1 — оно не умирает,
        // его жизни становятся 1 (undying — damageUnit)
        hon190: { type: "unit", cost: 6, atk: 6, hp: 6, speed: 1,
                  creature: "human", sheet: "knight",
                  ability: "flyOver", undying: 1,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "epic", elem: "honor",
                  color: 0xcfc7b0, img: "honor/190" },
        // «Котлы со смолой» (hon191): ловушка на пустую клетку — когда
        // существо перемещается или призывается на эту клетку (любоё,
        // включая хозяина — нейтральная, как «Решётка с шипами»), все
        // СУЩЕСТВА впритык перед базой владельца получают 4 урона
        // (tarKettles — applyCellTrap)
        hon191: { type: "trap", cost: 3,
                  trap: { event: "onCell", effect: "tarKettles", amount: 4 },
                  kind: "damage", // тип эффекта — по спеке юзера
                  rarity: "common", elem: "honor",
                  color: 0xd8d3c8, img: "honor/191" },
        // «Переговоры» (hon192): ловушка на пустую клетку — в начале хода
        // владельца и он, и противник сбрасывают ВСЕ карты с руки и
        // теряют ВСЮ энергию (grandParley — тик в начале upkeep)
        hon192: { type: "trap", cost: 1,
                  trap: { event: "onOwnUpkeep", effect: "grandParley" },
                  kind: "damage", // тип эффекта — по спеке юзера
                  rarity: "epic", elem: "honor",
                  color: 0xd8d3c8, img: "honor/192" },
        // «Боевой слон» (hon193): Человек 8/7 с «Сокрушением» (crush —
        // лишний урон атаки переходит в базу противника, crushHit)
        hon193: { type: "unit", cost: 7, atk: 8, hp: 7, speed: 1,
                  creature: "human", sheet: "knight", crush: true,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/193" },
        // «Неусыпный гарнизон» (hon194): ловушка на пустую клетку — когда
        // база владельца получает урон, на каждую пустую клетку в двух
        // рядах, ближайших к базе, становится Прихожанин 2/2 (жетон
        // parishioner, как у «Молебна»; garrisonRise — damageBase)
        hon194: { type: "trap", cost: 5,
                  trap: { event: "onBaseDamage", effect: "garrisonRise" },
                  kind: "damage", // тип эффекта — по спеке юзера
                  rarity: "epic", elem: "honor",
                  color: 0xd8d3c8, img: "honor/194" },
        // «Полевой медик» (hon195): Человек 1/3 — в начале хода владельца
        // случайно выбирается один объект из «все его существа + база»
        // (база наравне с каждым существом) и получает +1 жизнь
        // (medicHeal — medicHealTick в upkeep)
        hon195: { type: "unit", cost: 3, atk: 1, hp: 3, speed: 1,
                  creature: "human", sheet: "knight", medicHeal: 1,
                  subtype: "human", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "honor",
                  color: 0xcfc7b0, img: "honor/195" },
        // «Засадный отряд» (hon196): ловушка на СВОЮ ПОСТРОЙКУ (вторая
        // ловушка-«на объект» после руны — unit-привязка armTrap): когда
        // выбранная постройка умирает, в её клетку является Прихожанин 2/2
        // (жетон parishioner, как у «Молебна»), а сама карта возвращается
        // в руку владельца (из сброса или колоды — returnCardToHand;
        // ambushRise — killUnit/ambushRiseAct)
        hon196: { type: "trap", cost: 1,
                  trap: { event: "onOwnBuildingDeath", effect: "ambushRise",
                          spawn: "parishioner" },
                  kind: "summon", // тип эффекта — по спеке юзера
                  rarity: "epic", elem: "honor",
                  color: 0xd8d3c8, img: "honor/196" },
        // «Плен» (hon197): заклинание 1⚡ без клетки — посмотреть руку
        // противника и удалить из неё карту призыва ДО КОНЦА БОЯ (не в
        // сброс; игрок выбирает в панели captivatePanel, ИИ — самую
        // ценную). Руки призыва нет — карта и энергия целы (гейт как у
        // «Поднятия мёртвых»)
        hon197: { type: "spell", cost: 1,
                  spell: { target: "none", captivate: 1 },
                  kind: "discard", // тип эффекта — по спеке юзера
                  rarity: "epic", elem: "honor",
                  color: 0xd8d3c8, img: "honor/197" },
        // «Опорник» (hon198): постройка 2⚡/3♥ — когда её атакуют, владелец
        // получает 1 энергию (pillarEnergy — damageUnit; урон от заклинаний
        // и ловушек «атакой» не считается, как у «Ответа»)
        hon198: { type: "building", cost: 2, atk: 0, hp: 3, pillarEnergy: 1,
                  rarity: "epic", elem: "honor",
                  color: 0xcfc7b0, img: "honor/198" },
        // «Аура света» (hon199): заклинание 3⚡ — выбранное СВОЁ существо
        // получает световую метку (lightAura): в конце хода владельца все
        // соседние с ним СУЩЕСТВА противника теряют 1 жизнь (снятие
        // напрямую, как у «Тёмного алтаря»; auraLightTick — конец хода)
        hon199: { type: "spell", cost: 3,
                  spell: { target: "ownUnit", lightAura: 1 },
                  kind: "buff", // тип эффекта — по спеке юзера («Усиление»)
                  rarity: "epic", elem: "honor",
                  color: 0xd8d3c8, img: "honor/199" },
        // «Воскрешение» (hon200): заклинание 5⚡ без клетки — выбрать карту
        // призыва в своём сбросе (панель resurrectPanel) и разыграть её
        // без траты энергии (постановка на пустую клетку зоны призыва —
        // механизм journeySummon; resurrectSummon)
        hon200: { type: "spell", cost: 5,
                  spell: { target: "none", resurrect: 1 },
                  kind: "summon", // тип эффекта — по спеке юзера
                  rarity: "epic", elem: "honor",
                  color: 0xd8d3c8, img: "honor/200" },
    };
})();
