// Карты стихии «Тлен» (чёрные) — данные. Часть cardsData.js (см. cardsStrength.js).
(function () {
    globalThis.GAME_CARDS_DECAY = {
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
                  creature: "zombie", sheet: "zomb", // Зомби, лист зомби юзера
                  subtype: "zombie", // подтип — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x504048, img: "decay/122" },
        // «Нетопырь» — Животное с «Полётом» (flyOver, как «Мини-фея»)
        dec123: { type: "unit", cost: 3, atk: 5, hp: 1, speed: 1,
                  creature: "animal", sheet: "bat", // Животное, лист нетопыря юзера
                  subtype: "animal", // подтип — по спеке юзера (чат)
                  ability: "flyOver",
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
        // «Запретные знания» (dec130): выбранный игрок берёт 3 карты
        // и теряет 2 жизни (панель выбора — как «Пытка разума»)
        dec130: { type: "spell", cost: 1,
                  spell: { target: "none", forbidden: { draw: 3, dmg: 2 } },
                  kind: "damage", // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/130" },
        // «Лич» (dec131): убив существо, призывает Призрака 2/1 (токен
        // ghost) на клетку убитого
        dec131: { type: "unit", cost: 3, atk: 3, hp: 2, speed: 1,
                  creature: "goblin", // плейсхолдер листа поля боя (гоблин)
                  lichRaise: true,
                  subtype: "skeleton", // подтип — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/131" },
        // «Вампир» (dec132): после атаки получает 1 жизнь
        dec132: { type: "unit", cost: 3, atk: 3, hp: 4, speed: 1,
                  creature: "animal", sheet: "bat", // Животное, лист нетопыря юзера
                  vampHeal: 1,
                  subtype: "animal", // «Животное» — подтип по спеке юзера (cards.txt/чат)
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/132" },
        // «Иссушение почвы» (dec133): ловушка-отмена — срабатывает, когда
        // противник разыгрывает постройку: она не появляется, карта и
        // энергия потрачены (зеркало «Отмены призыва» для построек)
        dec133: { type: "trap", cost: 2,
                  trap: { event: "onEnemyBuilding", effect: "counterBuilding" },
                  kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "common", elem: "decay",
                  color: 0x443840, img: "decay/133" },
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
        // «Толпа скелетов» (dec140): Скелеты 1/2 (служебная карта skel) на
        // выбранной пустой клетке и слева/справа от неё — только на пустые.
        // W107 (юзер): цель — пустая клетка в ближних к базе владельца
        // двух рядах (nearRows: 2 — хелпер nearBaseRows)
        dec140: { type: "spell", cost: 3,
                  spell: { target: "emptyCell", skeletonCrowd: true, nearRows: 2 },
                  kind: "summon", // тип эффекта — по спеке юзера («Появление существ»)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/140" },
        // «Поле костей» (dec141): в начале хода владельца призывает Скелета
        // 1/2 в пустую клетку перед постройкой (на 1 ближе к базе противника)
        dec141: { type: "building", cost: 2, atk: 0, hp: 3, boneField: true,
                  rarity: "common", elem: "decay",
                  color: 0x504048, img: "decay/141" },
        // «Паршивище» (dec142): большой зомби 3/8 без способностей
        dec142: { type: "unit", cost: 5, atk: 3, hp: 8, speed: 1,
                  creature: "zombie", sheet: "zomb", // Зомби, лист зомби юзера
                  subtype: "zombie", // подтип — по спеке юзера (чат)
                  rarity: "common", elem: "decay",
                  color: 0x504048, img: "decay/142" },
        // «Разложенные кости» (dec143): существо, призванное рядом
        // (верт/гориз) с этой постройкой, получает «Выкапливание 1»
        // (зеркало военного лагеря/лесного монолита)
        dec143: { type: "building", cost: 5, atk: 0, hp: 4, bonePile: true,
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/143" },
        // «Трупный яд» (dec144): «Яд 1» на любое существо; при каждом
        // срабатывании яда мощность +1 (правило эффекта «Яд» — poisonTick)
        dec144: { type: "spell", cost: 1,
                  spell: { target: "anyUnit", poison: 1 },
                  kind: "damage", // тип эффекта — по спеке юзера («Нанесение урона»)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/144" },
        // «Разложение» (dec145): уничтожьте любое существо, затем сбросьте
        // карту с руки (авто, наименее ценная — кроме самой dec145)
        dec145: { type: "spell", cost: 2,
                  spell: { target: "anyUnit", destroy: true, selfDiscard: 1 },
                  kind: "destroy", // тип эффекта — по спеке юзера («Уничтожение существа»)
                  rarity: "rare", elem: "decay",
                  color: 0x63424e, img: "decay/145" },
        // «Восставший нетопырь» (dec146): 6/2 с «Выкапливанием 1»; после
        // появления на поле (включая возврат выкапливанием) сбрасывает
        // карту с руки (авто, наименее ценная). ОБЩЕЕ ПРАВИЛО (просил
        // юзер): врождённое «Выкапливание» НЕ работает при возврате
        // существа из сброса эффектом «Выкапливания» — иначе нетопырь
        // возвращался бы бесконечно (addUnit opts.rebirth)
        dec146: { type: "unit", cost: 4, atk: 6, hp: 2, speed: 1,
                  creature: "animal", sheet: "bat", // Животное, лист нетопыря юзера
                  subtype: "animal", // подтип — по спеке юзера («Животное»)
                  exhuming: 1, summonDiscard: 1,
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/146" },
        // «Король скелетов» (dec147): все скелеты на поле боя (ОБЕ
        // стороны) наносят на 1 урона больше, пока Король жив (skelKing —
        // глобальная аура в recalcAuras, уходит вместе с ним)
        dec147: { type: "unit", cost: 3, atk: 2, hp: 3, speed: 1,
                  creature: "goblin", // плейсхолдер листа поля боя (некр по стихии)
                  subtype: "skeleton", // подтип — по спеке юзера (чат)
                  skelKing: 1,
                  rarity: "epic", elem: "decay",
                  color: 0x504048, img: "decay/147" },
        // «Скелет послушника» (dec148): после появления разыгрывает
        // СЛУЧАЙНУЮ карту заклинания стоимостью ≤3 из СВОЕГО сброса —
        // бесплатно (энергия не тратится; acolyteCast в arenaCombat)
        dec148: { type: "unit", cost: 2, atk: 0, hp: 2, speed: 1,
                  creature: "goblin", // плейсхолдер листа поля боя (некр по стихии)
                  subtype: "skeleton", // подтип — по спеке юзера (чат)
                  acolyteCast: 3,
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/148" },
        // «Толстопуз» (dec149): когда умирает существо его владельца
        // (любое, кроме него самого), каждая живая копия прибавляет себе
        // БАЗОВЫЕ ⚔/♥ умершего (fatBelly — хук в killUnit).
        // Статы 4/5 (W46, юзер) — было 0/2; цена 6⚡ (W86, юзер) — было 2
        dec149: { type: "unit", cost: 6, atk: 4, hp: 5, speed: 1,
                  creature: "zombie", sheet: "zomb", // Зомби, лист зомби юзера
                  subtype: "zombie", // подтип — по спеке юзера (чат)
                  fatBelly: 1,
                  rarity: "rare", elem: "decay",
                  color: 0x504048, img: "decay/149" },
        // «Взрыв твари» (dec150): убивает своё существо, затем наносит 1
        // урона столько раз, какова сумма его ⚔+♥, каждый раз — случайному
        // существу/постройке противника или его базе (beastBlast —
        // beastBlastCast в arenaCombat, ветки в arenaActions/aiSpells)
        dec150: { type: "spell", cost: 1,
                  spell: { target: "ownUnit", beastBlast: true },
                  kind: "damage", // тип эффекта — по спеке юзера («Нанесение урона»)
                  rarity: "rare", elem: "decay",
                  color: 0x63424e, img: "decay/150" },
        // «Болото рождения» (dec151): призванное рядом (верт/гориз) СВОЁ
        // существо получает +2⚔/+2♥, постройка при этом теряет 2 жизни;
        // на смерть любого существа (обе стороны) — +1 жизнь (birthSwamp —
        // хуки в addUnit/killUnit)
        dec151: { type: "building", cost: 4, atk: 0, hp: 5, birthSwamp: true,
                  rarity: "epic", elem: "decay",
                  color: 0x504048, img: "decay/151" },
        // «Тёмный контроль» (dec134, просил юзер): заклинание забирает
        // существо противника на свою сторону («как будто вы его призвали»),
        // но платит 2 жизни базы (mindControl — число = цена; ветки в
        // arenaActions/aiSpells/autoTargetFor, target «enemyUnit»)
        dec134: { type: "spell", cost: 4,
                  spell: { target: "enemyUnit", mindControl: 2 },
                  kind: "control", // тип эффекта — по спеке юзера (cards.txt)
                  rarity: "epic", elem: "decay",
                  color: 0x63424e, img: "decay/134" },
        // «Гримуар духов» (dec152, просил юзер): ловушка на клетке —
        // переместившееся/призванное туда существо противника уничтожается,
        // на его клетке является Призрак 2/1 стороны-хозяйки (ghostGrave —
        // applyCellTrap; фильтр существ-only в triggerCellTraps)
        dec152: { type: "trap", cost: 4,
                  trap: { event: "onEnemyCell", effect: "ghostGrave" },
                  kind: ["destroy", "summon"], // типы эффекта — по спеке юзера (cards.txt)
                  rarity: "rare", elem: "decay",
                  color: 0x443840, img: "decay/152" },
        // «Извлечение тьмы» (dec153, просил юзер): своё существо гибнет —
        // энергия = сумма его ⚔+♥ (darkExtract; ветки в arenaActions/
        // aiSpells/autoTargetFor)
        dec153: { type: "spell", cost: 0,
                  spell: { target: "ownUnit", darkExtract: true },
                  kind: "resource", // тип эффекта — по спеке юзера («Получение ресурсов»)
                  rarity: "epic", elem: "decay",
                  color: 0x63424e, img: "decay/153" },
        // «Посвящение тьме» (dec154, просил юзер): ловушка на клетке —
        // переместившееся/призванное туда существо противника уничтожается,
        // затем ХОЗЯИН ловушки разыгрывает существо с руки в эту клетку
        // БЕЗ траты энергии (берётся первая юнит-карта руки, как у
        // «Выросших духов»; darkOffering — applyCellTrap; существ-only)
        dec154: { type: "trap", cost: 5,
                  trap: { event: "onEnemyCell", effect: "darkOffering" },
                  kind: ["destroy", "summon"], // типы эффекта — по спеке юзера (cards.txt)
                  rarity: "epic", elem: "decay",
                  color: 0x443840, img: "decay/154" },
        // «Смоляная статуя» (dec155, просил юзер): ловушка на клетке —
        // вошедшее существо получает −4⚔ навсегда (bonusAtk) и метку
        // tarMark: пока оно живо, соседние (верт/гориз) СУЩЕСТВА ЕГО ЖЕ
        // стороны («существа противника» — со стороны владельца карты)
        // всегда имеют −2⚔ (аура в recalcAuras; tarStatue — applyCellTrap;
        // существ-only)
        dec155: { type: "trap", cost: 3,
                  trap: { event: "onEnemyCell", effect: "tarStatue" },
                  kind: "debuff", // тип эффекта — по спеке юзера («Уменьшение параметров»)
                  rarity: "rare", elem: "decay",
                  color: 0x443840, img: "decay/155" },
        // «Выбор местности» (dec156, просил юзер): верхние 6 карт колоды —
        // выбрать 1 карту постройки и взять в руку (terrainScout; готовая
        // панель «Поиска рун» с want="building" — непостройки видны, но
        // не кликабельны; «Оставить как было» отменяет)
        dec156: { type: "spell", cost: 1,
                  spell: { target: "none", terrainScout: 6 },
                  kind: "search", // тип эффекта — по спеке юзера («Поиск»)
                  rarity: "common", elem: "decay",
                  color: 0x63424e, img: "decay/156" },
        // «Склеп» (dec157, просил юзер): постройка-движок — клик по ней
        // СРАЗУ разыгрывает ВЕРХНЮЮ карту своего сброса (с оплатой; цель/
        // клетку выбирает автомат — те же пути, что ручной розыгрыш), после
        // розыгрыша карта замешивается в колоду (cryptSettle в spendCard).
        // ИИ — одной картой за ход (eCryptTaken), своими приоритетами
        dec157: { type: "building", cost: 6, atk: 0, hp: 9, cryptPlay: true,
                  rarity: "epic", elem: "decay",
                  color: 0x504048, img: "decay/157" },
        // «Портал духов» (dec158, просил юзер): после розыгрыша заклинания
        // ВЛАДЕЛЬЦЕМ портала (просил юзер: только свои касты; руна/послушник
        // способностями не считаются — их afterSpellPlayed зовётся без
        // стороны) постройка призывает Призрака 2/1 (жетон ghost) на первую
        // пустую соседнюю (верт/гориз) клетку; все заняты — призыва нет
        dec158: { type: "building", cost: 4, atk: 0, hp: 4, ghostPortal: true,
                  rarity: "epic", elem: "decay",
                  color: 0x504048, img: "decay/158" },
        // «Рыцарь смерти» (dec159, просил юзер): убив существо (постройки
        // не считаются), даёт владельцу 1 энергию (deathKnight — хук в
        // killUnit рядом с «Личом»)
        dec159: { type: "unit", cost: 4, atk: 4, hp: 4, speed: 1,
                  creature: "goblin", // плейсхолдер листа поля боя (некр по стихии)
                  subtype: "skeleton", // подтип — по спеке юзера (cards.txt)
                  deathKnight: 1,
                  rarity: "epic", elem: "decay",
                  color: 0x504048, img: "decay/159" },
        // «Кровавая луна» (dec160, просил юзер): потратьте от 1 до 3 жизней
        // СВОЕЙ базы (на ваш выбор — панель с тремя кнопками у игрока) —
        // получите столько же энергии (bloodMoon; ветки в arenaActions/
        // aiSpells/aiTarget)
        dec160: { type: "spell", cost: 0,
                  spell: { target: "none", bloodMoon: 3 },
                  kind: "resource", // тип эффекта — по спеке юзера («Получение ресурсов»)
                  rarity: "epic", elem: "decay",
                  color: 0x63424e, img: "decay/160" },
    };
})();
