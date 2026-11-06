// Карты стихии «Время» (фиолетовые) — данные. Часть cardsData.js (см. cardsStrength.js).
(function () {
    globalThis.GAME_CARDS_TIME = {
        // ── Стихия «Время» (фиолетовые) — карты 201–207 юзера ──────────────
        // (нумерация артов юзера — сквозная с 201). Герой стихии — Тордин
        // Изобретатель (heroes/40.png); подземелья у стихии пока нет — арка
        // на карте мира отвечает «Скоро…», карты живут в стартере Тордина.
        // Новый механика стихии — «Сдвиг N»: существо появляется на
        // выбранной клетке не сразу, а в начале хода владельца, когда
        // счётчик истечёт (значок-счётчик на клетке; клетка занята —
        // существо ждёт, см. delayTick в arenaBoard).
        // «Защитник» (tim201): Гном 1/1 с «Защитой 1» — любой урон по нему
        // уменьшается на 1 (врождённая защита — def.protect в
        // unitProtectTotal; «Извлечением духа» не снимается)
        tim201: { type: "unit", cost: 1, atk: 1, hp: 1, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256 (просил юзер)
                  protect: 1, // «Защита 1» — врождённая (def.protect)
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/201" },
        // «Базовый мех» (tim202): Гном 4/4 со «Сдвигом 1» — появится на
        // выбранной клетке в начале СЛЕДУЮЩЕГО хода владельца
        tim202: { type: "unit", cost: 2, atk: 4, hp: 4, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256 (просил юзер)
                  delay: 1, // «Сдвиг 1» — маркер-счётчик на клетке
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/202" },
        // «Стрельбовоз» (tim203): Гном 3/5 — «Сдвиг 2» + «Выстрел 1»
        // (после перемещения бьёт ближайшее существо/постройку по вертикали
        // вперёд, пустая вертикаль — 1 базе противника; archer/shotDmg —
        // поправка юзера, выстрел срабатывает и после марш-шага, которым
        // сопровождается появление через «Сдвиг»)
        tim203: { type: "unit", cost: 3, atk: 3, hp: 5, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256 (просил юзер)
                  delay: 2, // «Сдвиг 2»
                  ability: "archer", shotDmg: 1, // «Выстрел 1» (поправка юзера)
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/203" },
        // «Машина времени» (tim204): постройка 3⚡/3♥ — «Сдвиг» всех карт
        // владельца уменьшается на 1 (0 — сдвига нет, приходит сразу);
        // effDelayVal в arenaBoard, работает и на «Сдвиг 2» Ловушки времени
        tim204: { type: "building", cost: 3, atk: 0, hp: 3, timeMachine: 1,
                  rarity: "common", elem: "time",
                  color: 0x6a3a8c, img: "time/204" },
        // «Часовой механизм» (tim205): постройка 4⚡/4♥ — существо,
        // пришедшее через «Сдвиг», получает «Скорость 1» (delayArrive)
        tim205: { type: "building", cost: 4, atk: 0, hp: 4, clockwork: 1,
                  rarity: "common", elem: "time",
                  color: 0x6a3a8c, img: "time/205" },
        // «Мозговой штурм» (tim206): заклинание 1⚡ без цели — сбросить всю
        // руку и взять столько же +1 карту (brainstorm)
        tim206: { type: "spell", cost: 1,
                  spell: { target: "none", brainstorm: 1 },
                  kind: ["discard", "draw"], // тип эффекта — по спеке юзера
                  rarity: "common", elem: "time",
                  color: 0x8a5ab0, img: "time/206" },
        // «Ловушка времени» (tim207): ловушка на пустую клетку (нейтральная,
        // как «Опутывание»: срабатывает на перемещение/призыв ЛЮБОГО
        // существа) — существо убирается с поля и получает «Сдвиг 2»:
        // вернётся на эту клетку в начале хода через 2 хода, если она
        // останется свободной; эффекты и параметры сбрасываются — оно
        // «заново призывается» (timeTrap — applyCellTrap)
        tim207: { type: "trap", cost: 1,
                  trap: { event: "onCell", effect: "timeTrap", delay: 2 },
                  kind: "control", // тип эффекта — по спеке юзера
                  rarity: "common", elem: "time",
                  color: 0x5a3a7c, img: "time/207" },
        // «Ковка оружия» (tim208): заклинание 2⚡ без цели — все существа,
        // появившиеся на поле боя в этот ход владельца, получают +2 к урону
        // (включая пришедших через «Сдвиг»; последующие появления в этот же
        // ход ловит флаг B.forge в addUnit — applySpellPInner/aiSpells)
        tim208: { type: "spell", cost: 2,
                  spell: { target: "none", forge: 2 },
                  kind: "buff", // тип эффекта — по спеке юзера (Усиление)
                  rarity: "common", elem: "time",
                  color: 0x8a5ab0, img: "time/208" },
        // «Гномолёт» (tim209): Гном 6/5 со «Сдвигом 3» и «Полётом»
        // (перелетает за жертву — ability flyOver, как у «Мини-феи»)
        tim209: { type: "unit", cost: 4, atk: 6, hp: 5, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256 (просил юзер)
                  delay: 3, // «Сдвиг 3»
                  ability: "flyOver", // «Полёт»
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/209" },
        // «Пещера времени» (tim210): постройка 6⚡/5♥ — в начале хода
        // владельца разыгрывает случайный призыв со «Сдвигом» из его руки
        // в случайную клетку поля боя, без траты энергии (timeCaveTick)
        tim210: { type: "building", cost: 6, atk: 0, hp: 5, timeCave: 1,
                  rarity: "rare", elem: "time",
                  color: 0x6a3a8c, img: "time/210" },
        // «Добыча кристаллов» (tim211): заклинание 2⚡ без цели — +1 энергии
        // за каждую единицу «Сдвига» каждого своего существа, ждущего на
        // поле (значки-счётчики; crystalHarvest — applySpellP/aiSpells)
        tim211: { type: "spell", cost: 2,
                  spell: { target: "none", crystalHarvest: 1 },
                  kind: "resource", // тип эффекта — по спеке юзера (Получение ресурсов)
                  rarity: "common", elem: "time",
                  color: 0x8a5ab0, img: "time/211" },
        // «Тараномобиль» (tim212): Гном 2/3 со «Сдвигом 3» — двойной урон
        // постройкам и базе противника (siegeDouble — damageUnit/baseHit)
        tim212: { type: "unit", cost: 1, atk: 2, hp: 3, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256
                  delay: 3, // «Сдвиг 3»
                  siegeDouble: 1, // двойной урон постройкам и базе противника
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/212" },
        // «Квадромех» (tim213): Гном 4/6 со «Сдвигом 4»
        tim213: { type: "unit", cost: 2, atk: 4, hp: 6, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256
                  delay: 4, // «Сдвиг 4»
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/213" },
        // «Паровой стрелятель» (tim214): постройка 3⚡/4♥ со «Сдвигом 3» —
        // прибыв, совершает «Выстрел 4» (archerShot — вертикаль вперёд,
        // пусто — базе противника) и снова уходит в «Сдвиг 1» (delayArrive)
        tim214: { type: "building", cost: 3, atk: 0, hp: 4,
                  delay: 3, // «Сдвиг 3»
                  steamShot: 1, shotDmg: 4, // прибытие → «Выстрел 4» → «Сдвиг 1»
                  rarity: "common", elem: "time",
                  color: 0x6a3a8c, img: "time/214" },
        // «Стреломёт» (tim215): Гном 2/2 — «Выстрел 2» (archer/shotDmg) и
        // «Возврат 2» (returnN — спустя 2 хода после призыва вернётся в руку)
        tim215: { type: "unit", cost: 2, atk: 2, hp: 2, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256
                  ability: "archer", shotDmg: 2, // «Выстрел 2»
                  returnN: 2, // «Возврат 2» (тик в upkeep владельца)
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/215" },
        // «Подгорное царство» (tim216): постройка 5⚡/8♥ — когда тикает
        // «Возврат» карты владельца, счётчик НЕ уменьшается, вместо этого
        // постройка теряет 1 жизнь (retShield — тик в returnTick)
        tim216: { type: "building", cost: 5, atk: 0, hp: 8, retShield: 1,
                  rarity: "epic", elem: "time",
                  color: 0x6a3a8c, img: "time/216" },
        // «Поиск во времени» (tim217): заклинание 1⚡ без цели — посмотреть
        // верхние 6 карт колоды и взять 1 карту со «Сдвигом» или «Возвратом»
        // в руку (панель Поиска знаний с фильтром; timeSearch)
        tim217: { type: "spell", cost: 1,
                  spell: { target: "none", timeSearch: 6 },
                  kind: "draw", // тип эффекта — по спеке юзера (Добор карт)
                  rarity: "common", elem: "time",
                  color: 0x8a5ab0, img: "time/217" },
        // «Верховой гном» (tim218): Гном 4/4 — «Скорость 1» и «Возврат 2»
        tim218: { type: "unit", cost: 3, atk: 4, hp: 4, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256
                  ability: "dash1", // «Скорость 1»
                  returnN: 2, // «Возврат 2»
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/218" },
        // «Целитель царства» (tim219): Гном 1/4 — при появлении даёт 2 жизни
        // случайному соседнему (верт/гориз) СВОЕМУ существу (healArrive)
        // и уходит в «Возврат 1» (returnN)
        tim219: { type: "unit", cost: 2, atk: 1, hp: 4, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256
                  healArrive: 2, // при появлении +2♥ соседнему своему
                  returnN: 1, // «Возврат 1»
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/219" },
        // «Секироносец царства» (tim220): Гном 4/3 — при появлении наносит
        // 1 урон случайному соседнему (верт/гориз) существу ВРАГА
        // (axeArrive) и уходит в «Возврат 2» (returnN)
        tim220: { type: "unit", cost: 2, atk: 4, hp: 3, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256
                  axeArrive: 1, // при появлении 1 урон соседнему врагу
                  returnN: 2, // «Возврат 2»
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  rarity: "common", elem: "time",
                  color: 0x7a4a9c, img: "time/220" },
        // «Удар двойника» (tim221, просил юзер): ловушка на пустую клетку —
        // призванное/переместившееся на неё существо ВРАГА бьёт само себя
        // уроном, равным его ⚔ (selfDmg — applyCellTrap). «Возврат 2»:
        // спустя 2 хода после установки ловушка возвращается в руку
        // (trap.ret — тик trapReturnTick в upkeep владельца, зеркально
        // «Возврату» существ)
        tim221: { type: "trap", cost: 2, // цена 1→2 (просил юзер)
                  trap: { event: "onEnemyCell", effect: "selfDmg" },
                  returnN: 2, // «Возврат 2» — ловушка вернётся в руку
                  kind: "damage", // тип эффекта — по спеке юзера (Нанесение урона)
                  rarity: "common", elem: "time",
                  color: 0x5a3a7c, img: "time/221" },
        // «Хирд» (tim222, просил юзер): постройка 1⚡/2♥ — «Защита 1»
        // существам СЛЕВА И СПРАВА от неё (тот же ряд, col±1; только
        // существа — hirdCount в unitProtectTotal, бейдж Защиты
        // синхронизирует recalcAuras → refreshProtectMark)
        tim222: { type: "building", cost: 1, atk: 0, hp: 2,
                  hird: 1, // «Защита 1» горизонтальным соседям
                  rarity: "rare", elem: "time",
                  color: 0x6a3a8c, img: "time/222" },
        // «Управление временем» (tim223, просил юзер): заклинание 0⚡ —
        // выберите жетон «Возврата» или «Сдвига» (значок на клетке любой
        // стороны или «Возврат» существа) и уменьшите его значение на 2
        // ИЛИ увеличьте на 2 (target "token" — прицел по жетонам; выбор
        // направления — панелька −2/+2, B.tokenPick)
        tim223: { type: "spell", cost: 0,
                  spell: { target: "token", tokenShift: 2 },
                  kind: "control", // тип эффекта — по спеке юзера (Контроль)
                  rarity: "epic", elem: "time",
                  color: 0x8a5ab0, img: "time/223" },
        // «Лаборатория» (tim224, просил юзер): постройка 2⚡/2♥ — живёт
        // в цикле «Сдвига 1» (def.delay — приходит значком). Клик игрока
        // по ней (onCellTap, lab): взять карту, постройка снова уходит
        // в «Сдвиг 1» (левая граница — effDelayVal(1): «Машина времени»
        // возвращает её ходом раньше); ИИ активирует раз в свой ход
        tim224: { type: "building", cost: 2, atk: 0, hp: 2,
                  delay: 1, // «Сдвиг 1» — и при розыгрыше, и после активации
                  lab: 1, // активация: добор + снова в «Сдвиг 1»
                  rarity: "epic", elem: "time",
                  color: 0x6a3a8c, img: "time/224" },
        // «Конвейер» (tim225, просил юзер): постройка 2⚡/2♥ — когда
        // сторона разыгрывает карту с руки, все карты «Конвейер» в ЭТОТ
        // ход стоят на 1 энергию меньше (копится: после каждого розыгрыша
        // −1, счётчик B.convey[side] {turn, n} — effCost)
        tim225: { type: "building", cost: 2, atk: 0, hp: 2,
                  conveyor: 1, // скидка на себя за разыгранные карты хода
                  rarity: "epic", elem: "time",
                  color: 0x6a3a8c, img: "time/225" },
        // «Строительный кран» (tim226, просил юзер): постройка 1⚡/1♥ со
        // «Сдвигом 1» (def.delay) — все ПОСТРОЙКИ владельца стоят на
        // 1 энергию меньше за каждый кран на поле (effCost, складывается
        // с «Деревней» hon173)
        tim226: { type: "building", cost: 1, atk: 0, hp: 1,
                  delay: 1, // «Сдвиг 1»
                  crane: 1, // постройки стороны −1⚡
                  rarity: "rare", elem: "time",
                  color: 0x6a3a8c, img: "time/226" },
        // «В гуще боя» (tim227, просил юзер): ловушка на пустую клетку —
        // призванное/переместившееся на неё существо ВРАГА и все соседние
        // с ним (верт/гориз) существа получают «Возврат 1» (massRet —
        // applyCellTrap; уже стоящий счётчик «Возврата» не уменьшаем)
        tim227: { type: "trap", cost: 2,
                  trap: { event: "onEnemyCell", effect: "massRet" },
                  kind: "control", // тип эффекта — по спеке юзера (Контроль)
                  rarity: "rare", elem: "time",
                  color: 0x6a3a8c, img: "time/227" },
        // «Стык эпох» (tim228, просил юзер): постройка 7⚡/7♥ со «Сдвигом 2»
        // (def.delay — приходит значком) и «Возвратом 2» (returnN —
        // тик returnTick в upkeep владельца). Аура: все СУЩЕСТВА владельца
        // имеют +3⚔/+3♥ (aura в recalcAuras) и «Сокрушение» (epochAura —
        // гейт в crushHit, лишний урон атаки уходит в базу противника)
        tim228: { type: "building", cost: 7, atk: 0, hp: 7,
                  delay: 2, // «Сдвиг 2»
                  returnN: 2, // «Возврат 2»
                  aura: { atk: 3, hp: 3 }, // +3⚔/+3♥ существам стороны
                  epochAura: 1, // «Сокрушение» существам стороны
                  rarity: "epic", elem: "time",
                  color: 0x8a5ab0, img: "time/228" },
        // «Временная петля» (tim229, просил юзер): заклинание 8⚡ — получите
        // дополнительный ход после этого. «Сожжение»: после розыгрыша карта
        // удаляется из боя (burn — не попадает в сброс, значит не вернётся
        // ни пересмешиванием колоды, ни «Варкой зелий»/«Склепом»)
        tim229: { type: "spell", cost: 8,
                  spell: { target: "none", extraTurn: 1 },
                  burn: 1, // «Сожжение» — сгорает после розыгрыша
                  kind: "control", // тип эффекта — по спеке юзера (Контроль)
                  rarity: "epic", elem: "time",
                  color: 0x8a5ab0, img: "time/229" },
        // «Царский совет» (tim230, просил юзер): заклинание 2⚡ — уберите все
        // жетоны ловушек противника с поля боя (клеточные и руны; споры —
        // не жетон ловушки, не трогаются)
        tim230: { type: "spell", cost: 2,
                  spell: { target: "none", trapSweep: 1 },
                  kind: "control", // тип эффекта — по спеке юзера (Контроль)
                  rarity: "rare", elem: "time",
                  color: 0x6a3a8c, img: "time/230" },
        // «Мастер порталов» (tim231, просил юзер): Гном 1/4 — в начале хода
        // владельца смотрит верхнюю карту колоды; если это ловушка —
        // можете её разыграть без траты энергии (portalMaster; у игрока —
        // панель выбора, карта до конца хода бесплатна и при отказе
        // возвращается на верх колоды; ИИ разыгрывает сразу)
        tim231: { type: "unit", cost: 4, atk: 1, hp: 4, speed: 1,
                  creature: "gnome", // лист поля боя — gnome_256
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  portalMaster: 1,
                  rarity: "rare", elem: "time",
                  color: 0x7a4a9c, img: "time/231" },
        // «Герой прошлого» (tim232, просил юзер): Гном 5/6 — если появляется
        // по соседству (верт/гориз) с СВОИМ существом, получает «Скорость 1»
        // (nearSpeed: рывок summonDash сразу после появления + постоянный
        // шаг в марш — spdBonus читается в marchSide). «Возврат 3»
        tim232: { type: "unit", cost: 4, atk: 5, hp: 6, speed: 0,
                  creature: "gnome",
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  nearSpeed: 1,
                  returnN: 3, // «Возврат 3»
                  rarity: "rare", elem: "time",
                  color: 0x8a4aa8, img: "time/232" },
        // «Руномаг царства» (tim233, просил юзер): Гном 1/3 — при замешивании
        // сброса владельца в колоду (drawCards/drawEnemy) наносит 3 урона
        // случайному вражескому СУЩЕСТВУ (runeReshuffleTick; несколько
        // Руномагов бьют каждый сам). «Возврат 4»
        tim233: { type: "unit", cost: 4, atk: 1, hp: 3, speed: 1,
                  creature: "gnome",
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  runeReshuffle: 1,
                  returnN: 4, // «Возврат 4»
                  rarity: "rare", elem: "time",
                  color: 0x6a4a9c, img: "time/233" },
        // «Силовой купол» (tim234, просил юзер): заклинание 2⚡ по любому
        // существу или постройке (target «anyObj» — новая цель) — любой урон
        // по цели уменьшается до 1 (метка dome, гейт в damageUnit)
        tim234: { type: "spell", cost: 2,
                  spell: { target: "anyObj", dome: 1 },
                  kind: "buff", // тип эффекта — по спеке юзера (Усиление)
                  rarity: "rare", elem: "time",
                  color: 0x5a4a9c, img: "time/234" },
        // «Большой бум» (tim235, просил юзер): постройка 1⚡/5♥ со «Сдвигом 1»
        // (delay) и «Возвратом 2» (returnN). Когда должен сработать «Возврат»
        // (returnTick, счётчик дошёл до нуля), вместо возврата в руку
        // постройка умирает и наносит урон, равный своим ТЕКУЩИМ жизням,
        // всем соседним (верт/гориз) вражеским существам и постройкам
        // и базе противника (boomRet)
        tim235: { type: "building", cost: 1, atk: 0, hp: 5,
                  delay: 1, // «Сдвиг 1»
                  returnN: 2, // «Возврат 2»
                  boomRet: 1,
                  rarity: "rare", elem: "time",
                  color: 0x9a5a5c, img: "time/235" },
        // «Каток» (tim236, просил юзер): Гном */6 — урон равен числу карт
        // в сбросе владельца (discardAtk: база урона в recalcAuras —
        // длина сброса; пересчёт из noteDiscard/пересмешиваний)
        tim236: { type: "unit", cost: 5, hp: 6, speed: 1,
                  creature: "gnome",
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  discardAtk: 1,
                  rarity: "rare", elem: "time",
                  color: 0x7a5a8c, img: "time/236" },
        // «Флагман гномов» (tim237, просил юзер): Гном 9/9 — «Сдвиг 4»
        // (speed: марш 4 клетки), «Полёт» (flyOver — перелетает блокера
        // без атаки) и «Защита 1» («Броня 1» спеки — та же механика
        // урона-минус-1, def.protect)
        tim237: { type: "unit", cost: 7, atk: 9, hp: 9, speed: 4,
                  creature: "gnome",
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  ability: "flyOver", // «Полёт»
                  protect: 1, // «Броня 1» = «Защита 1» (спека юзера)
                  rarity: "epic", elem: "time",
                  color: 0x9a5ab0, img: "time/237" },
        // «Поджигатель» (tim238, просил юзер): Гном 4/2 — при атаке
        // существа или постройки его урон получают ВСЕ существа и
        // постройки по соседству (верт/гориз) с атакованным, не только
        // атакованный (fireSplash: соседи ЦЕЛИ, атакующий исключён)
        tim238: { type: "unit", cost: 3, atk: 4, hp: 2, speed: 1,
                  creature: "gnome",
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  fireSplash: 1,
                  rarity: "epic", elem: "time",
                  color: 0xa85a50, img: "time/238" },
        // «Ремонт» (tim239, просил юзер): заклинание 0⚡ по любому
        // существу или постройке (target «anyObj») — когда выбранное
        // умрёт, его карта возвращается в руку владельца вместо смерти
        // (метка u.repair; перехват в killUnit ДО каскадов смерти —
        // гибели не было, «Большой бум» взрыв не делает)
        tim239: { type: "spell", cost: 0,
                  spell: { target: "anyObj", repair: 1 },
                  kind: "buff", // тип эффекта — по спеке юзера (Усиление)
                  rarity: "epic", elem: "time",
                  color: 0x6a6ad0, img: "time/239" },
        // «Взбунтовавшийся мех» (tim240, просил юзер): Гном 6/6 — когда
        // получает урон (ФАКТИЧЕСКИ прошедший: полностью съеденный
        // «Защитой» не считается), переходит на сторону противника
        // (defect; гибель от урона — обычная смерть без переворота)
        tim240: { type: "unit", cost: 3, atk: 6, hp: 6, speed: 0,
                  creature: "gnome",
                  subtype: "gnome", // подтип — по спеке юзера (cards.txt)
                  defect: 1,
                  rarity: "epic", elem: "time",
                  color: 0xb05a8c, img: "time/240" },
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
        // Скелет из «Толпы скелетов» (dec140) и «Поля костей» (dec141) —
        // служебная карта без лица, как gobA/icePixie: спавнится только ими.
        skel: { type: "unit", cost: 1, atk: 1, hp: 2, speed: 1,
                creature: "goblin", // плейсхолдер листа поля боя (гоблин)
                subtype: "skeleton", // подтип — по спеке юзера (чат)
                rarity: "common", elem: "decay",
                color: 0x504048 },
        // Призрак из «Лича» (dec131) — служебная карта без лица, как skel:
        // в пулах/энкаунтерах её нет, спавнится только убийством Лича
        ghost: { type: "unit", cost: 1, atk: 2, hp: 1, speed: 1,
                 creature: "goblin", // плейсхолдер листа поля боя (гоблин)
                 subtype: "ghost", // подтип — по спеке юзера (cards.txt)
                 rarity: "common", elem: "decay",
                 color: 0x504048 },
        // Прихожанин из «Молебна» (hon166) — служебная карта без лица,
        // как skel/ghost: Человек 2/2, спавнится только заклинанием
        parishioner: { type: "unit", cost: 1, atk: 2, hp: 2, speed: 1,
                       creature: "human", sheet: "knight",
                       subtype: "human", // подтип — по спеке юзера (существо Человека)
                       rarity: "common", elem: "honor",
                       color: 0xcfc7b0 },

    };
})();
