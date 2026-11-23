// СЦЕНА «АРЕНА»: ИИ: ОЦЕНКИ — «сила карты» (aiVal/aiCardPower), угроза и
// роль существ, выбор клеток (spot-скоринги призыва/постройки), план
// добора по шкале.
//
// ── Откуда взята «умность» (волна «умный ИИ») ───────────────────────────────
// Перед правкой смотрели, как делают ИИ для карточных игр:
// · Hearthstone AI Competition (SabberStone): сильные агенты оценивают ВСЁ
//   поле взвешенной эвристикой, а не только «можно/нельзя»; эволюционно
//   настроенный агент обошёл даже MCTS при скрытой информации
//   (arXiv:2410.19681, «Optimizing Hearthstone Agents using an
//   Evolutionary Algorithm»).
// · Bottled AI для Slay the Spire: перебирает порядки розыгрыша руки,
//   проигрывает последствия своей моделью и сравнивает ~40 взвешенных
//   величин; вне боя — списки приоритетов.
// · Обсуждения GameMaker/StackExchange про ИИ карточных игр: оценка
//   состояний (heuristic), ограниченная глубина, немного случайности —
//   иначе ИИ либо тупой, либо неинтересный.
// Вывод для нашей игры: прозрачная utility-эвристика — ценность существа,
// угрозы, позиция/ауры, выбор цели и порядок карт. Без MCTS/нейросетей:
// JS без сборки, асинхронные анимации, а рука игрока ИИ не видит (честная
// игра); глубины «текущий ход + следующий ответ игрока» хватает.
//
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installAiValue = function installAiValue(A) {
        with (A) {
            // ── W110: вектор весов ИИ (эволюционный тюнер) ────────────────────
            // Все тюнируемые константы ИИ собраны сюда. ДЕФОЛТЫ — настройка,
            // проверенная лигами до W110; эволюционный тюнер
            // (for_work/ai_tuner.mjs, вне git) перебирает вектора короткими
            // лигами, впрыскивая их через globalThis.AI_W_OVERRIDE (сим).
            // Подобранный вектор запекается обратно в дефолты.
            // W172: дефолты = ЧЕМПИОН #9 g119_m01@g119 (4-сидовый confirm
            // 50.79% z=2.99, vsarch +0.77 п.п.; 23 ключа поверх базы W159).
            A.AI_W_BASE = {
                // экономика полухода (aiPlay)
                refillMin: 3,        // добор «в тупике» от этой энергии (W142: 5 → 3)
                refillTries: 5,      // попыток добора за полуход
                refillCards: 4,      // карт за попытку
                deadSwapIncK: 4,     // «безнадёжная»: дороже энергии + K×дохода
                deadSwapHold: 2,     // «застрявшая»: гейт не пускает N полуходов
                drawTo: 2,           // короткая рука добирается до
                drawPlayable: 4,     // …и по числу разыгрываемых на след. ману
                drawFullMana: 27,    // мана след. хода ≥ — рука до 7
                drawAllEnergy: 20,   // энергия ≥ — вся шкала только в карты
                // W130 (юзер: «меньше карт, больше энергии на первых ходах»,
                // у второго со старта +2 карты): flooding-правила добора
                // («до 4 разыгрываемых», «рука до 7», «всё в карты») молчат,
                // пока не кончился разгон энергии
                drawRampTurn: 2,     // полуходы < — только разгон (добор до drawTo) (W142: 4 → 2)
                drawPlayableMana: 19, // «до 4 разыгрываемых» — только при мане след. хода ≥ (0 = всегда)
                // W181: сдвиг порога «большого банка» (W103: энергии хватает
                // на две самые дорогие карты → дорогие идут раньше групп).
                // 0 = прежнее условие; <0 — флип раньше, >0 — позже.
                bigBankSlack: 0,
                // W148 (бэклог исследования ИИ 2026-11-15, юзер: «делай»):
                // (а) замена мёртвой карты по ГЕЙТАМ, не только по цене —
                // заклинание с закрытым гейтом (aiSpellPlayable=false:
                // «нечего применять / переводить зря») не сыграет, даже
                // когда ИИ дотянется по мане; (б) пороги добора в «деньгах
                // маны» (drawPlayableMana/drawFullMana/drawAllEnergy)
                // нормализуются темпом боя — доля выбитых жизней обеих баз:
                // один и тот же запас маны значит разное в начале и в конце.
                // Оба гейта 0 = бит-в-бит прежнее поведение.
                deadSwapGateK: 0,    // бонус «мёртвости» за закрытый гейт (0 = выкл)
                tempoDrawOn: 0,      // 1 — пороги добора от темпа боя (0 = прежнее)
                tempoDrawK: 0.6,     // сила сдвига: порог × (1 + K×(темп − ½)); K<0 — flooding раньше
                // W131 (юзер: «планы на розыгрыш в зависимости от притока
                // энергии»): планировщик энергии — ИИ оценивает тяжесть своей
                // колоды (средняя цена пула) и цены руки и копит энергию
                // ползунком под конкретную цель: дорогую карту («за 6 маны
                // при 4 энергии — не брать карты, добрать 2+ маны») или
                // связку из двух карт (только у «тяжёлой» колоды)
                planOn: 1,           // 1 — планировщик включён (0 = политика W130)
                planMinCost: 5,      // карта-цель: эффективная цена ≥
                planComboCost: 2,    // вторая карта связки: цена ≥
                planHeavyAvg: 2.4,   // средняя цена колоды ≥ — «тяжёлая» (связки копим)
                planFloor: 0,        // мин. добор при копении (рука не замирает)
                // W132 (юзер: «связки 2–3 карт с коэффициентами из логов
                // лиг»): эмпирические пары AI_COMBOS — Δ винрейта «вместе
                // в одном полуходе» против «обе вышли врозь» (17 160 боёв
                // RR, w132_analyze). ИИ подстраивается: держит половинку
                // пары до партнёра (comboHold), копит ползунок на ПАРУ
                // (comboPlanOn), разыгрывает связку вперёд (comboOrderOn)
                // и даёт бонус парам в плане дерева (comboK)
                comboOn: 1,         // мастер-выключатель (0 = поведение W131 бит-в-бит)
                comboMinW: 0.15,    // мин. вес пары, чтобы ИИ под неё подстраивался
                comboHoldMax: 0,    // макс. подряд удержаний половинки (0 = не держать:
                                    //  главная причина «врозь» — гейты карт, не энергия)
                comboOrderOn: 0,    // обе половинки играбельны → связка вперёд очереди
                comboHardOn: 1,     // ЖЁСТКИЙ порядок пар («лучник до поля») —
                                    //  ВРЕДИТ (лиги 3 сидов: −0.5 п.п. носителям,
                                    //  корреляция порядков ≠ причинность), выкл
                comboPlanOn: 0,     // копить ползунок под ПАРУ (поверх heavy-логики W131)
                comboK: 0.459,      // масштаб бонуса связки в плане дерева (aiTree)
                // W132: фазовый гейт W104 «аура первой» — до какого РАУНДА
                // (причинный анализ: ранним — полезно, поздним — вредит)
                auraFirstTurns: 2, // 99 = всегда (поведение W104)
                // W133: клеточные правила из причинного анализа логов
                // (позитивный контроль юзера — «Гоблинская засада»):
                // placeAmbushFreeK — ценность свободных соседей клетки
                // (число гоблинов монотонно → Δadv, z=7.4, НО интервенция
                // 4 весов на лиге ВРЕДИТ: уводит от лучших жертв; 0 = выкл)
                // placeAmbushHold — засаду БЕЗ жертвы перед клеткой держать
                // (vic=0: −2.9 ост.мед против +3.4, z=4.2)
                placeAmbushFreeK: 0, placeAmbushHold: 0,
                // W134 (юзер: «ключи со ВСЕЙ информацией о состоянии боя,
                // на которую AI может повлиять»): позиция юнитов и фаза.
                // ПРОГРЕСС до чужой базы: марш по рядам (ряд 0 — база
                // врага, ряд 4 — игрока), press = row/(GRID−1) для наших
                // ("e" идут вниз к базе игрока), (GRID−1−row)/(GRID−1)
                // для чужих ("p" идут вверх к нашей). Дефолты 0/1 —
                // поведение W133 бит-в-бит; значения ищет тренировочная
                // лига W134 (w134_train.mjs, адаптация AlphaStar)
                vPressBase: 0,   // aiVal: наш юнит ближе к базе игрока — ценнее
                tPressBase: 0,   // aiThreat: чужой у НАШЕЙ базы — опаснее
                tNearK: 0,       // aiThreat: близость чужого к нашим юнитам (манхэттен)
                cPress: 0,       // aiTree: давление позиций (Σpress своих − Σpress чужих)
                cSelfLethal: 0,  // aiTree: анти-летал — модель оставила НАШУ базу ≤0
                lateTurn: 12,    // aiTree: полуход, после которого ресурсы дешевеют
                cDrawLate: 1,    // …ценность добранной карты (множитель; 1 = всегда)
                cEnergyLate: 1,  // …ценность остатка энергии (множитель; 1 = всегда)
                // ценность своего существа (aiVal) — тюнинг W110 (фитнес 2.5)
                vAtk: 1.034, vHp: 0.571, vBld: 0.494, vCrush: 0.713, vThicket: 0.975,
                vAura: 0.462, vEngine: 0.829, vBuffEcho: 1.119, vMedic: 0.836,
                vUndying: 3, vTradeDraw: 1,
                // угроза чужого (aiThreat)
                tAtk: 0.527, tHp: 0.418, tCrush: 1.4, tThicket: 1.404, tAura: 0.515,
                tDangerBld: 3.213, tBldMult: 0.672,
                runMinAtk: 7,       // разгоны: атака от…
                runGap: 6,           // …и выше печатной на
                runMult: 1.997,        // …угроза УМНОЖАЕТСЯ
                // клетки призыва (aiSpotScore). W134: sFrontRow/sColFree
                // подняты тренировочной лигой (адаптация AlphaStar, юзер):
                // 51.2% против прежней базы (z=3.05, 16.7 тыс. боёв, оба
                // кресла) и 53.6% против архива W110 — агрессивнее фронт
                // и свободные колонки; усреднённая 10×RR — мета стабильна
                sFrontRow: 3.2, sColFree: 2.269, sOwnAhead: 0.9,
                sSupportBack: 2.022, sGap: 5, sDashKill: 2.522,
                sKillThreatK: 0.341, sNearKill: 4.527, sCowardAhead: 2.5,
                sMarkBlock: 3.63,
                // W181 (волна «найти ИИ-чемпиона»): зашитые константы
                // решений ИИ вынесены в тюнинг. Ось контакта В БАЗЕ — значения
                // чемпиона #11 j2_kill23@g217 (W181): base −1, loss 0, gate 2,
                // kill 2.274; остальные ключи — прежние литералы.
                // Контактный размен при призыве (aiSpotScore):
                sContactBaseK: -1,   // × база «бой в упор» (стена 0.5 / прочие 0.15)
                sContactIncomingK: 0.22, // × min(4, атака врага) — «тело/задержка»
                sTradeLossK: 0,     // × aiThreat(ahead)*0.18 — цена будущей потери
                sTradeCostGate: 2,  // дорогая карта (cost ≥) в смертельный контакт: штраф
                sBehindBldPen: 2.2, // призыв за собственной постройкой (застрянет)
                // Условные бонусы контакта (W181 batch3 — та же ось, что уже
                // дала сигнал: безусловный бонус снят, условные тюним):
                sContactSurvK: 1,   // × «новичок выживет» (стена 0.6 / прочие 0.2)
                sContactWallK: 1,   // × плоский бонус роли «стена» в контакте (0.8)
                sContactKillK: 2.274,   // × «убьём в ответ» (стена 1.6 / прочие 1.0)
                sContactChipK: 1,   // × недобитие в контакте (0.2·min(atk,hp))
                // Реакция на врага у нашей базы (aiSpotScore):
                sDefendThreatK: 0.12, // × aiThreat(near), ряд ≤2 — защита колонки
                sDefendRowK: 0.5,   // × (3 − ряд) — ближе к базе опаснее
                // Стрелок позади своего (W105): штраф за выстрел «в своих»
                sArcherOwnPen: 2.6,
                // Выбор цели заклинаний/баффов (aiTarget):
                tgtPosK: 0.35,      // × (GRID−1−ряд) — ближе к нашей базе опаснее
                tgtOverKillK: 0.15, // × перерасход урона при добивании
                buffRowK: 0.2,      // × ряд цели баффа (фронт ценнее)
                // дерево розыгрыша (W114, юзер — «этап 2: деревья решений
                // для связок»): перебор порядков/подмножеств играбельных карт
                // на модели поля (aiTree.js), план действует, если явно лучше
                // жадной базы
                treeOn: 1,          // 1 — планировщик включён
                treeLen: 4,         // макс. длина последовательности перебора
                treeNodes: 400,     // бюджет листьев перебора за полуход
                treeHold: 1,        // 1 — план может придержать карты
                treeMinCards: 2,    // гейт: считать план при ≥2 играбельных
                treeMargin: 0.362,    // план действует, если лучше базы на ≥
                // веса оценки листа (модель поля aiTree.js)
                cBoard: 0.56,          // (ценность своих − угроза чужих)
                cBase: 1.788,         // урон по базе игрока за ♥
                cSelfBase: 1.159,     // урон своей базе (штраф/польза)
                cEnergy: 0.797,      // остаток энергии за ⚡ (W135: 0.3 → 0.797,
                                     // чемпион тренировочной лиги g7_m16)
                cDraw: 0.982,         // добранная карта
                cStatic: 0.507,       // несмоделированный эффект (aiCardPower)
                cLethal: 1000,      // добивание базы игрока в переборе
                // ── W124 (юзер): пул врага ИИ видит так же, как игрок —
                // клик по рубашке колоды (колода+сброс публичны, рука нет).
                // ВКЛЮЧЁН по распоряжению юзера («у AI тоже должна быть
                // такая возможность»); feature-лига W124 (pool+syn+дерево
                // +пер-герои пакетом) показала нейтральность — вреда нет
                poolOn: 1,
                poolGapK: 0.5,      // «через клетку» слабеет при стрелках/рывковых в пуле
                poolMobileN: 3,     // …сколько мобильных карт в пуле считать «много»
                poolLastCopyK: 1.25, // копий карты в КОЛОДЕ игрока нет — угроза ×(добивание навсегда)
                poolCopiesK: 0.92,  // копии в колоде есть — угроза ×(вернётся добором)
                poolCheapN: 6,      // дешёвых существ в пуле ≥ — мина/засада ценнее
                poolSpellN: 10,      // заклинаний в пуле ≥ — контр-ловушки вперед
                poolRaceK: 1,       // летальный пул у врага ≥ нашей базы — гонка (1 = обычный порядок групп)
                // «Искусственный маг» (chaosPlay): платный порог был зашит (2);
                // теперь тюнируемый ключ, у мага — пер-геройский слой.
                // W176: способность ослаблена (отмена — только у ПЕРВОЙ карты
                // за ход); порог остался стратегией «дешёвая жертва», а после
                // срабатывания способности ИИ играет всё, что по карману
                chaosMaxCost: 1,
                // синтез «способность героя ↔ карты» (W124, юзер): мягкие
                // прибавки к ценности карт, созвучных способности
                synOn: 0,
                synSpell: 0.35, synTrap: 0.4, synGoblin: 0.3, synUnit: 0.2,
                synPlant: 0.3, synBld: 0.25, synAnimal: 0.3, synSkel: 0.3,
                // W143 (юзер: «колоды играют от сброса — тюнить свой сброс,
                // знать что и когда сбрасывать»): стратегии сброса. Гейты
                // dsc*On=0 — прежнее поведение бит-в-бит; 1 — решение
                // принимает оценщик aiDiscardOne/aiDiscardExp (срабатывания
                // приёмников сброса против цены потери карты из руки).
                // K-веса ищет тренировочная лига (группа discard)
                dscSelfOn: 0,     // «Пытка разума»: оценивать сброс В СЕБЯ
                dscDropOn: 1,     // «Огненный бич»/«Игра в кости»: число сбросов по ценности
                dscPickOn: 1,     // выбор ЧТО сбросить (aiDropWorst/переполнение руки >7)
                dscFoeK: 1,       // ценность снятия карты с руки врага (×)
                dscKeepK: 0.445,    // цена потери своей карты (× aiCardPower)
                dscRecvK: 1,      // масштаб срабатываний приёмников сброса (×)
                dscPortalK: 1,    // ценность бесплатного выхода скинутой карты (×)
                // W144 (юзер: «чем больше у ИИ информации и возможностей,
                // тем лучше»): подсистема stat — счётчики состояний на
                // юнитах/постройках, которые видит игрок маркерами, а ИИ
                // раньше не читал (яд, «Призыв N», копилка артефактов,
                // купол, «Некроз», наросты, заморозка/опутывание).
                // W172: чемпион #9 включил statOn=1 и сдвинул оценки;
                // statOn=0 — прежнее поведение бит-в-бит
                statOn: 1,        // мастер-гейт подсистемы
                tPoisonK: 1,      // угроза отравленного НИЖЕ (яд тикает и растёт)
                vPoisonK: 1,      // свой отравленный дешевле (не спасать обречённого)
                tSummonNK: 2.223, // чужой со счётчиком «Призыв N» опаснее (убить ДО выхода)
                vSummonNK: 1,     // свой со счётчиком «Призыв N» ценнее (беречь)
                tRelicsK: 1,      // угроза dec138 растёт с глубиной копилки v.relics
                tDomeK: 0.39,     // купол (урон режется до 1): не тратить добивание
                tRotK: 1,         // «Некроз» (урон ×2): помеченный — приоритетная цель
                tNecroGrowK: 1,   // наросты: носитель слабеет с каждым тиком
                tFrozenK: 1,      // замороженный/опутанный безопаснее
                // W144: пороги «играть или держать» — прежние литералы
                // гейтов aiSpellPlayable стали ключами; W172: чемпион #9
                // сдвинул 7 из 11 порогов (лига ищет, КОГДА карта окупается)
                holdMindThreat: 2,   // «Тёмный контроль»: хватать при угрозе ≥
                holdForbiddenHp: 6, // «Запретные знания»: брать себе при базе >
                holdMoonKeep: 2,     // «Кровавая луна»: сколько ♥ оставлять базе
                holdMoonMinE: 1,     // …и только при энергии ≤
                holdFireballE: 5,    // «Огнешар» (урон = вся энергия): копить до ⚡≥
                // W175 (юзер: «научить ИИ правильно играть опасные себе
                // карты»): «Огнешар» сжигает ВСЮ энергию на одну цель —
                // играем, только если цель реально добивается и её угроза
                // окупает переплату (overkill × K); иначе держим
                fireballOverK: 1,
                // «Котлы со смолой» (hon191): 4 урона ВСЕМ существам в ряду
                // у СВОЕЙ базы, включая своих — свои потери считаем дороже
                kettlesOwnK: 1.25,
                // «Переговоры» (hon192): на своём upkeep оба сбрасывают
                // руки и энергию — сравниваем, кто теряет больше
                // (карта в руке = handK, 1⚡ = energyK, выгода ≥ slack)
                parleyHandK: 3, parleyEnergyK: 1, parleySlack: 2,
                holdBerserkAtk: 6,   // «Двойная атака»: крепыш ⚔≥ и ♥≥
                holdBerserkRow: 3,   // …или уже у базы врага (ряд ≥)
                holdPhoenixBld: 5,   // феникс раньше при постройках ≥
                holdBrainHand: 3,    // «Мозговой штурм»: сброс всей руки при руке ≥
                holdCaptivateCost: 1, // «Плен»: удалять призыв цены ≥
                holdExcavateHp: 4,   // «Раскопки»: перезагрузка при потере ≥♥
                // W144: foe — играть вокруг способности ГЕРОЯ врага (не
                // карт): сейчас ИИ её игнорирует. Гейт foeOn=0 = бит-в-бит
                foeOn: 1,           // мастер-гейт подсистемы
                foeVoidBait: 0,     // «Магопуты» (1-я карта отменяется): первой жертвовать дешёвую
                foeReflectBait: 1,  // «Тёмный владыка» (1-й урон базе отражается): сначала мелкий тычок
                // W144: panel — микрорешения панелей/тиков (дефолты =
                // прежние литералы, бит-в-бит)
                panelMonolithOn: 0, // «Три монолита»: брать лучшее по aiCardPower (0 = первое)
                panelBrewOwnK: 0.5, // «Варка зелий»: буфер «своё ближе»
                panelSplitAtk: 0.5, // Огнелис/Огнемедведь: доля очков в ⚔
                panelStumpFoeCost: 2, // «Пень обряда»: чужой верх сбрасывать при цене ≥
                panelStumpOwnCost: 1, // …свой верх сбрасывать при цене ≤
                panelTutorEpicK: 3.965,   // «Сгусток магии»: вес редкости при поиске
                panelReplayMinDmg: 2, // «Горящие руны»: мин. урон для повтора
                // W144: модель дерева (aiTree pickCell) читает spot-ключи
                // боя вместо разошедшихся литералов (0 = прежние 2/1.5/0.9)
                treeGeomOn: 0,
                // W147 (юзер: «ценность карты зависит от колоды и героя»,
                // пример — «Паладин света» растёт от заклинаний: в колоде с
                // обилием заклинаний он ценнее, без них плоский бонус
                // завышен): динамические поправки к «силе карты» по составу
                // РОДНОЙ колоды (снимок колода+сброс+рука на полуход,
                // __deckCtx) и способности героя. Гейт deckCtxOn=0 —
                // прежнее поведение бит-в-бит; знаки и масштабы ищет
                // тренировочная лига (группа deck w134_train)
                deckCtxOn: 0,
                dcSpellSynK: 0,  // «растёт от заклинаний» × доля заклинаний
                dcSpellFuelK: 0, // заклинание × доля каст-синергистов
                dcSubK: 0,       // существо с подтипом × доля сородичей
                dcCheapK: 0,     // карта ≤2⚡ × доля тяжёлых (≥5⚡) — темп
                dcHeroK: 0,      // созвучность способности героя (маппинг W124)
                // W147b (юзер: «меньше 500 карт — можем позволить таблицу
                // весов на каждую карту»): per-card bias-таблица A.DC_BIAS —
                // ДАННЫЕ из логов лиг, не ключи (эффект одной карты на 1-2
                // порядка ниже разрешения скрина ±1.2 п.п. — per-card веса
                // турнир не поднимает). Лига судит таблицу ЦЕЛИКОМ:
                // dcBiasOn читает таблицу, dcBiasK — её масштаб.
                // Гейт НЕЗАВИСИМ от deckCtxOn (грубый пробник g52 нашёл,
                // что член был заперт под deckCtxOn и lookup шёл по
                // несуществующему d.id — канал всегда давал 0; починено)
                dcBiasOn: 0,     // 0 = таблица не читается (паритет бит-в-бит)
                dcBiasK: 0,      // масштаб per-card поправки из DC_BIAS
                // W154 (тройка №10, гипотезы из механики боя; дозы ищет лига):
                // avoid — обход ЧУЖИХ клеточных ловушек при выборе клетки
                // призыва («?» на клетке публична, а aiSpotScore их вовсе
                // не читал): призыв на клетку мины/засады/опутывания
                // триггерит triggerCellTraps (arenaBoard addUnit), а клетка
                // ВПЛОТНУЮ к «Лудке» врага теряет первый шаг марша/рывка
                // (lureRedirect уводит на лудку; сам вход НА лудку безвреден).
                // Штраф масштабируется ценой карты: дешёвые «разминируют»
                // (мина одноразовая), дорогие — полный штраф.
                // ret — угроза чужого со «Возвратом N» (tim215+): юнит уйдёт
                // с поля после N маршей владельца — добивать досрочно всё
                // чаще в утиль, угроза падает с долей достижимых атак.
                // style — СПЕКА ЮЗЕРА («агрессия/контроль/комба,
                // камень-ножницы-бумага»): классификатор обеих колод
                // (__styleCtx/aiStyle) выбирает стиль матчапа, поправка
                // styleK входит множителем aiStyleMul в глобальные веса
                // (9 точек: vAtk/tAtk/sFrontRow здесь, cBase/cSelfBase/
                // cEnergy/cDraw/comboK/treeMargin в aiTree.js).
                // W172: чемпион #9 включил trapAvoidOn; гейты 0 — прежнее
                // поведение бит-в-бит.
                trapAvoidOn: 1, sTrapCell: 1.204, sTrapLure: 0,
                retOn: 0, tReturnK: 0.318,
                styleOn: 0, styleK: 1, styleMargin: 0,
                // W154b (юзер: «у каждой стратегии — СВОИ настраиваемые
                // ключи»): дельты aiStyleMul — 15 ключей, пакеты под каждую
                // стратегию; дефолты = бывшие константы литерала, 0 = точка
                // выключена. styleK — общая сила слоя: дефолт 1 (полные
                // пакеты; ноль гасил бы весь слой — мутанты групп-пакетов
                // без мутации styleK стали бы ноу-опами)
                styleAggroVAtk: 0.3, styleAggroCBase: 0.6,
                styleAggroCEnergy: -0.4, styleAggroSFrontRow: 0.15,
                styleAggroCDraw: -0.2,
                styleCtrlCSelfBase: 0.6, styleCtrlTAtk: 0.35,
                styleCtrlSFrontRow: -0.35, styleCtrlCEnergy: 0.2,
                styleCtrlCBase: -0.2,
                styleComboComboK: 0.6, styleComboCDraw: 0.4,
                styleComboCEnergy: 0.25, styleComboTreeMargin: -0.3,
                styleComboVAtk: -0.15,
                // W156 (юзер: «стратегии настраиваемы друг против друга
                // самой игрой, какую из них когда применять»): КНБ-таблица
                // была ДОПУЩЕНИЕМ спеки — теперь матрица контр-пиков
                // тюнируема. styleVs<E><R>: E — однозначный стиль врага
                // (Aggro/Ctrl/Combo — имя стиля с заглавной, как его
                // собирает aiStyle из имён метрик), R — свой ответ
                // (Aggro/Ctrl/Combo; Own = не контрпикать, играть свой
                // сильнейший). Выбор — argmax по строке, порядок важнее
                // знака. Дефолты = прежняя КНБ (контр-ячейка 1, прочие 0)
                // — бит-паритет решения.
                styleVsAggroAggro: 0, styleVsAggroCtrl: 1,
                styleVsAggroCombo: 0, styleVsAggroOwn: 0,
                styleVsCtrlAggro: 0, styleVsCtrlCtrl: 0,
                styleVsCtrlCombo: 1, styleVsCtrlOwn: 0,
                styleVsComboAggro: 1, styleVsComboCtrl: 0,
                styleVsComboCombo: 0, styleVsComboOwn: 0,
                // W158 (юзер: «попробуй все три варианта поочерёдно… делай
                // выводы»): СТИЛЬ КАК ГЕЙТ ПЛАНОВ — последняя живая дорога
                // стилевой оси. Матрица W157 закрыла слой дельт весов (вред
                // равномерный по всем ячейкам, ~−1.5 п.п. на полной дозе);
                // осталась гипотеза, что матчапу нужен не другой ВЕС, а другой
                // РЕЖИМ: выбранный КНБ ответ (aggro/ctrl/combo) переключает
                // подсистемы ПОЛИТИКИ — план добора, план энергии, связки,
                // hold-пороги «играть или держать», темп-добор, дерево
                // розыгрыша — на per-стильные значения plan<Стиль><Ключ>
                // (резолюция в Proxy AI_W ниже). Веса оценщика не трогаются
                // вовсе. stylePlanOn — гейт слоя; дефолты plan-ключей =
                // глобальные дефолты тех же ключей → слой с дефолтами =
                // бит-паритет с чемпионом.
                stylePlanOn: 0,
                // план добора (enemyDrawPlan)
                planAggroDrawTo: 2, planCtrlDrawTo: 2, planComboDrawTo: 2,
                planAggroDrawPlayable: 4, planCtrlDrawPlayable: 4, planComboDrawPlayable: 4,
                planAggroDrawPlayableMana: 13, planCtrlDrawPlayableMana: 13, planComboDrawPlayableMana: 13,
                planAggroDrawFullMana: 22, planCtrlDrawFullMana: 22, planComboDrawFullMana: 22,
                planAggroDrawAllEnergy: 20, planCtrlDrawAllEnergy: 20, planComboDrawAllEnergy: 20,
                planAggroDrawRampTurn: 2, planCtrlDrawRampTurn: 2, planComboDrawRampTurn: 2,
                // план энергии (aiEnergyPlan)
                planAggroPlanOn: 1, planCtrlPlanOn: 1, planComboPlanOn: 1,
                planAggroPlanMinCost: 5, planCtrlPlanMinCost: 5, planComboPlanMinCost: 5,
                planAggroPlanComboCost: 2, planCtrlPlanComboCost: 2, planComboPlanComboCost: 2,
                planAggroPlanHeavyAvg: 2.4, planCtrlPlanHeavyAvg: 2.4, planComboPlanHeavyAvg: 2.4,
                planAggroPlanFloor: 0, planCtrlPlanFloor: 0, planComboPlanFloor: 0,
                // связки (aiComboHand/aiTree/aiEnergyPlan)
                planAggroComboOn: 1, planCtrlComboOn: 1, planComboComboOn: 1,
                planAggroComboMinW: 0.15, planCtrlComboMinW: 0.15, planComboComboMinW: 0.15,
                planAggroComboHoldMax: 0, planCtrlComboHoldMax: 0, planComboComboHoldMax: 0,
                planAggroComboOrderOn: 0, planCtrlComboOrderOn: 0, planComboComboOrderOn: 0,
                planAggroComboHardOn: 1, planCtrlComboHardOn: 1, planComboComboHardOn: 1,
                planAggroComboPlanOn: 0, planCtrlComboPlanOn: 0, planComboComboPlanOn: 0,
                planAggroComboK: 0.5, planCtrlComboK: 0.5, planComboComboK: 0.5,
                planAggroAuraFirstTurns: 4, planCtrlAuraFirstTurns: 4, planComboAuraFirstTurns: 4,
                // темп-добор (W148)
                planAggroTempoDrawOn: 0, planCtrlTempoDrawOn: 0, planComboTempoDrawOn: 0,
                planAggroTempoDrawK: 0.6, planCtrlTempoDrawK: 0.6, planComboTempoDrawK: 0.6,
                // hold-пороги «играть или держать» (aiSpellPlayable/aiTarget)
                planAggroHoldMindThreat: 4, planCtrlHoldMindThreat: 4, planComboHoldMindThreat: 4,
                planAggroHoldForbiddenHp: 4, planCtrlHoldForbiddenHp: 4, planComboHoldForbiddenHp: 4,
                planAggroHoldMoonKeep: 2, planCtrlHoldMoonKeep: 2, planComboHoldMoonKeep: 2,
                planAggroHoldMoonMinE: 1, planCtrlHoldMoonMinE: 1, planComboHoldMoonMinE: 1,
                planAggroHoldFireballE: 3, planCtrlHoldFireballE: 3, planComboHoldFireballE: 3,
                planAggroHoldBerserkAtk: 3, planCtrlHoldBerserkAtk: 3, planComboHoldBerserkAtk: 3,
                planAggroHoldBerserkRow: 3, planCtrlHoldBerserkRow: 3, planComboHoldBerserkRow: 3,
                planAggroHoldPhoenixBld: 3, planCtrlHoldPhoenixBld: 3, planComboHoldPhoenixBld: 3,
                planAggroHoldBrainHand: 3, planCtrlHoldBrainHand: 3, planComboHoldBrainHand: 3,
                planAggroHoldCaptivateCost: 3, planCtrlHoldCaptivateCost: 3, planComboHoldCaptivateCost: 3,
                planAggroHoldExcavateHp: 2, planCtrlHoldExcavateHp: 2, planComboHoldExcavateHp: 2,
                // дерево розыгрыша (aiTree)
                planAggroTreeOn: 1, planCtrlTreeOn: 1, planComboTreeOn: 1,
                planAggroTreeLen: 4, planCtrlTreeLen: 4, planComboTreeLen: 4,
                planAggroTreeMinCards: 2, planCtrlTreeMinCards: 2, planComboTreeMinCards: 2,
                planAggroTreeMargin: 0.362, planCtrlTreeMargin: 0.362, planComboTreeMargin: 0.362,
            };
            // ── W124 (юзер): пер-геройская адаптация — слой порогов ПОВЕРХ
            // общего вектора. Ключи «heroId.key» → значение; резолвятся в
            // Proxy ниже ПОСЛЕ flat-override (тюнер крутит общий вектор,
            // пер-геройские исключения ложатся сверху). Дефолт пуст —
            // поведение до W124; заполняется данными лиг/тюнером
            A.AI_W_HERO_BASE = {};
            // ── W132 (юзер): эмпирические связки карт из логов лиг ─────────
            // Вес пары = Δ винрейта боёв «вместе в одном полуходе» против
            // «обе вышли врозь» (17 160 боёв RR, 4 сида; w132_analyze,
            // отбор z ≥ 8, Δ ≥ 0.18, n ≥ 160). Ключи — ПАРЫ КАРТ «a|b»,
            // без героя: одни и те же карты у энкаунтеров в проде получают
            // тот же коэффициент. Override для сима/тюнера:
            // globalThis.AI_COMBOS_OVERRIDE («a|b»: w; 0 — выключить пару).
            A.AI_COMBOS_BASE = {
                // контр-заклинания и «Битва умов» (мудрость)
                "wis114|wis84": 0.45, "wis114|wis83": 0.45,
                "wis83|wis84": 0.354, "wis83|wis87": 0.334, "wis84|wis87": 0.333,
                "wis114|wis87": 0.36, "wis105|wis109": 0.321,
                "wis109|wis94": 0.202, "wis87|wis96": 0.387, "wis107|wis96": 0.359,
                // «Двойная магия» и элементали (небесно-грозовой маг)
                "hw265|hw266": 0.445, "hw265|wis87": 0.418, "hw265|wis96": 0.37,
                "hw266|wis87": 0.39, "hw266|wis96": 0.394, "hw266|wis107": 0.371,
                "hon198|wis87": 0.418, "hon198|wis107": 0.404,
                "hon198|wis96": 0.398, "hon198|hw266": 0.393,
                // гоблинские руны/алтари
                "str23|str28": 0.335, "str21|str28": 0.288, "str10|str19": 0.386,
            };
            // Вес пары (0, если пары нет; отрицательные не применяем —
            // «разводить» карты не учим). Кэш мёржа base+override — на
            // полуход (ключ turnNo:turnSide — при смене актёра ключ
            // меняется сам, как у __pool). B ещё не поднят — только base.
            A.aiComboW = function aiComboW(aId, bId) {
                const key = aId < bId ? aId + "|" + bId : bId + "|" + aId;
                let m = null;
                try {
                    const ck = B.turnNo + ":" + B.turnSide;
                    if (B.__combos && B.__combos.key === ck) m = B.__combos.m;
                    else {
                        m = Object.assign({}, A.AI_COMBOS_BASE);
                        const ov = globalThis.AI_COMBOS_OVERRIDE;
                        if (ov) for (const k in ov) {
                            // ключ пары нормализуем: «a|b» с a>b → «b|a»
                            const p = k.split("|");
                            m[p[0] < p[1] ? k : p[1] + "|" + p[0]] = ov[k];
                        }
                        B.__combos = { key: ck, m };
                    }
                } catch (e) { m = A.AI_COMBOS_BASE; }
                const v = m[key];
                return v > 0 ? v : 0;
            };
            // Лучший партнёр карты ИЗ РУКИ: { id, w, cost } или null
            // (порог comboMinW; вес 0/без партнёра — не связка)
            A.aiComboHand = function aiComboHand(id) {
                if (!AI_W.comboOn || !AI_W.comboMinW) return null;
                let best = null;
                for (const i2 of B.eHand) {
                    if (i2 === id) continue;
                    const w = aiComboW(id, i2);
                    if (w >= AI_W.comboMinW && (!best || w > best.w))
                        best = { id: i2, w, cost: effCost(i2, "e") };
                }
                return best;
            };
            // ── W132: ПОРЯДКИ пар из ПРИЧИННОГО анализа позиций (анализ-2,
            // юзер: «таблицы причина-следствие»). Метрика — Δ преимущества
            // позиции за раунд (медианы, Манн-Уитни; снапшоты позиций в
            // концах полуходов, 3 лиги × 4290 боёв), сравнение порядков
            // ВНУТРИ одного полухода (обе карты вышли — контекст одинаков).
            // Позитивный контроль: метод видит выверенное правило W104
            // «аура → существо» в ранней фазе (медианы +2.0, z=2.67).
            // Отбор: |z|≥3.5, в early+mid |z|≥2.5 со СОВПАДАЮЩИМ знаком
            // (поздние эффекты нестабильны — «Луч света» z=15.9 выпал:
            // весь его эффект в late). Первый заход (порядки по WR боёв)
            // ВРЕДИЛ (−0.5 п.п.): корреляция ≠ причинность; эта таблица —
            // только позиционно-стабильные «двигатели до потребителей».
            // Override: globalThis.AI_COMBO_ORDER_OVERRIDE («a>b»: w).
            A.AI_COMBO_ORDER_BASE = {
                "tim202>tim210": 1, "tim203>tim210": 1, // мехи до «Сдвига»
                "wis87>wis96": 1, "wis89>wis96": 1,     // мана/духи до тяги
                "wis85>wis94": 1, "wis90>wis95": 1,
                "str21>str10": 1,   // костры до «Землетрясения»
                "str20>str14": 1, "str20>str6": 1, // засада первой
                "grw1>grw40": 1,    // хищное растение первым
                "hon181>hon166": 1, // «Праведный гнев» первым
                "hon193>hon164": 1,
            };
            // Знак веса порядка: >0 — a раньше b; <0 — b раньше a; 0 — нет
            A.aiComboOrderW = function aiComboOrderW(aId, bId) {
                let m = A.AI_COMBO_ORDER_BASE;
                const ov = globalThis.AI_COMBO_ORDER_OVERRIDE;
                if (ov) {
                    m = Object.assign({}, A.AI_COMBO_ORDER_BASE);
                    for (const k in ov) m[k] = ov[k];
                }
                const f = m[aId + ">" + bId];
                if (f > 0) return f;
                const r = m[bId + ">" + aId];
                if (r > 0) return -r;
                return 0;
            };
            // Живой вектор: база + flat-override (тюнер, globalThis
            // .AI_W_OVERRIDE) + пер-геройские исключения (globalThis
            // .AI_W_HERO_OVERRIDE, формат { "decBones.drawAllEnergy": 13 }).
            // Proxy читает глобалы на КАЖДОЕ обращение — впрыск сима после
            // загрузки страницы доезжает без переприсваивания (прежде
            // injectWeights переприсваивал A.AI_W, и const AI_W внутри
            // aiValue.js держала старый объект — плоские веса до aiVal/
            // aiThreat доезжали только через перезагрузку страницы).
            // Герой кресла «e» — через heroDefOf("e") (в симе патчится на
            // S.seats, так что работает в обоих мирах одинаково).
            // Override виден и заданный ДО установки (снапшот — офлайн-черки
            // install(override) восстанавливают globalThis сразу после
            // install), и живой глобал (впрыск сима после загрузки страницы)
            const __wOvSnap = Object.assign({}, globalThis.AI_W_OVERRIDE || null);
            // W158: план-ключи — суффиксы «plan<Стиль><Ключ с заглавной
            // первой буквой>»; при чтении план-ключа с включённым слоем
            // (styleOn+stylePlanOn) значение берётся у plan<Стиль><Ключ>
            // выбранного ответа (см. резолюцию в геттере). Стили — как их
            // отдаёт aiStyle: строчные
            const PLAN_KEYS = {
                drawTo: "DrawTo", drawPlayable: "DrawPlayable",
                drawPlayableMana: "DrawPlayableMana", drawFullMana: "DrawFullMana",
                drawAllEnergy: "DrawAllEnergy", drawRampTurn: "DrawRampTurn",
                planOn: "PlanOn", planMinCost: "PlanMinCost",
                planComboCost: "PlanComboCost", planHeavyAvg: "PlanHeavyAvg",
                planFloor: "PlanFloor", comboOn: "ComboOn", comboMinW: "ComboMinW",
                comboHoldMax: "ComboHoldMax", comboOrderOn: "ComboOrderOn",
                comboHardOn: "ComboHardOn", comboPlanOn: "ComboPlanOn",
                comboK: "ComboK", auraFirstTurns: "AuraFirstTurns",
                tempoDrawOn: "TempoDrawOn", tempoDrawK: "TempoDrawK",
                holdMindThreat: "HoldMindThreat",
                holdForbiddenHp: "HoldForbiddenHp", holdMoonKeep: "HoldMoonKeep",
                holdMoonMinE: "HoldMoonMinE", holdFireballE: "HoldFireballE",
                holdBerserkAtk: "HoldBerserkAtk", holdBerserkRow: "HoldBerserkRow",
                holdPhoenixBld: "HoldPhoenixBld", holdBrainHand: "HoldBrainHand",
                holdCaptivateCost: "HoldCaptivateCost", holdExcavateHp: "HoldExcavateHp",
                treeOn: "TreeOn", treeLen: "TreeLen", treeMinCards: "TreeMinCards",
                treeMargin: "TreeMargin",
            };
            A.AI_W = new Proxy(Object.assign({}, A.AI_W_BASE), {
                get(t, k) {
                    if (typeof k !== "string") return t[k];
                    let v = t[k];
                    const ov = globalThis.AI_W_OVERRIDE || __wOvSnap;
                    if (ov && k in ov) v = ov[k];
                    try {
                        const ho = globalThis.AI_W_HERO_OVERRIDE;
                        if (ho) {
                            const hd = heroDefOf && heroDefOf("e");
                            const hid = hd && hd.id;
                            if (hid && (hid + "." + k) in ho) v = ho[hid + "." + k];
                        }
                    } catch (e) { /* B ещё не поднят — только база */ }
                    // W158 (юзер: «стиль как гейт планов»): выбранный КНБ
                    // ответ переключает подсистемы ПОЛИТИКИ — план<Стиль><Ключ>
                    // заменяет глобальное значение plan-ключа; веса оценщика
                    // не тронуты. Гейт stylePlanOn (0 = слой молчит бит-в-бит);
                    // дефолты plan-ключей = глобальные → слой с дефолтами
                    // паритетен. Гейты читаем через ту же резолюцию (овверрайд
                    // кандидата обязан работать), план-значение — тоже.
                    if (PLAN_KEYS[k]) {
                        // aiStyle читает B — вне боя плана нет; гасим в
                        // глобальное значение (страховка, бои не задето:
                        // канарейки 180 боёв без чтений вне контекста)
                        try {
                            const g = (kk) => {
                                let x = t[kk];
                                if (ov && kk in ov) x = ov[kk];
                                return x;
                            };
                            if (g("styleOn") && g("stylePlanOn")) {
                                const st = aiStyle();
                                if (st) {
                                    const pk = "plan" + st[0].toUpperCase()
                                        + st.slice(1) + PLAN_KEYS[k];
                                    let pv = t[pk];
                                    if (ov && pk in ov) pv = ov[pk];
                                    if (pv !== undefined) v = pv;
                                }
                            }
                        } catch (e) { /* B ещё не поднят — глобальное */ }
                    }
                    return v;
                },
                set(t, k, val) { t[k] = val; return true; },
            });
            const AI_W = A.AI_W;
            // Сумма урона по базе в ПУБЛИЧНОМ пуле игрока (колода+сброс):
            // руки ИИ не видит, но рубашку колоды игрок кликает — состав
            // колоды публичен (записано в game-mechanics-cheatsheet).
            // Мемо на полуход: ключ — turnNo+turnSide, сбрасывается swap'ом
            // (turnSide снова "enemy" → ключ меняется)
            A.aiPoolMemo = function aiPoolMemo() {
                const key = B.turnNo + ":" + B.turnSide;
                if (B.__pool && B.__pool.key === key) return B.__pool;
                const deck = {}, all = {};
                let lethal = 0, mobile = 0, cheap = 0, spells = 0;
                const count = (src, m) => {
                    for (const id of src) {
                        m[id] = (m[id] || 0) + 1;
                    }
                };
                count(B.deck, deck);
                count(B.deck, all);
                count(B.discard, all);
                for (const id of B.discard) deck[id] = (deck[id] || 0); // сброс — не «скоро вернётся»
                for (const id in all) {
                    const d = CARDS[id];
                    if (!d) continue;
                    if (d.type === "spell" && d.spell && d.spell.baseDmg > 0)
                        lethal += d.spell.baseDmg * all[id];
                    if (d.type === "spell") spells += all[id];
                    if (d.type === "unit" && (d.cost || 0) <= 2) cheap += all[id];
                    if (d.type === "unit"
                        && (unitDash(d) > 0 || d.ability === "archer"
                            || d.steamShot || d.fly || d.siegeFollow))
                        mobile += all[id];
                }
                B.__pool = { key, deck, all, lethal, mobile, cheap, spells };
                return B.__pool;
            };
            // Пул врага (колода+сброс игрока) — «видимость колоды» (W124,
            // юзер: «у AI тоже должна быть такая возможность»). Хелпер для
            // всех пул-эффектов; рука остаётся скрытой
            A.aiEnemyPool = function aiEnemyPool() {
                return AI_W.poolOn ? aiPoolMemo().all : null;
            };
            // Летальный потенциал пула врага: сумма baseDmg его колоды+сброса
            A.aiEnemyLethal = function aiEnemyLethal() {
                return AI_W.poolOn ? aiPoolMemo().lethal : 0;
            };
            // ── W154 (юзер: «стиль по матчапу»: агрессия/контроль/комба) ──────
            // Классификатор КОЛОДЫ стороны по трём архетипам. Своя видна
            // целиком (рука+колода+сброс), противник — публично (колода+сброс,
            // рука скрыта — честность W124). aggro — дешёвые атакеры,
            // рывковые/стрелки/летуны, летал заклинаниями; ctrl — удаления,
            // ловушки, тяжёлые карты и постройки; combo — движки связок,
            // дорогие финишеры, собранные пары AI_COMBOS. Кэш на полуход
            // (ключ turnNo:turnSide, как у __combos/__deckCtx): состав
            // меняется только добором/сбросами на границах полуходов.
            // Чистые чтения, без случайностей (парность лиг).
            A.__styleCtx = function __styleCtx(side) {
                let c = B.__styleCtx;
                const ck = B.turnNo + ":" + B.turnSide;
                if (!c || c.key !== ck) { c = { key: ck, map: {} }; B.__styleCtx = c; }
                if (c.map[side]) return c.map[side];
                const deck = side === "p" ? B.deck : B.eDeck;
                const disc = side === "p" ? B.discard : B.eDiscard;
                const hand = side === "p" ? [] : B.eHand; // рука врага скрыта
                const ids = (deck || []).concat(disc || [], hand || []);
                const has = {};
                let cheap = 0, rush = 0, removal = 0, traps = 0, blds = 0,
                    engines = 0, heavy = 0, lethal = 0;
                for (const id of ids) {
                    has[id] = (has[id] || 0) + 1;
                    const d = CARDS[id];
                    if (!d) continue;
                    if (d.type === "unit") {
                        if ((d.cost || 0) <= 2) cheap++; // темп-атакеры
                        if (unitDash(d) > 0 || d.ability === "archer" || d.fly
                            || d.siegeFollow) rush++;
                    } else if (d.type === "spell") {
                        const s = d.spell || {};
                        if (s.baseDmg) lethal += s.baseDmg;
                        if (s.dmg || s.purge || s.destroy || s.freeze
                            || s.iceStrike || s.mindControl || s.captivate
                            || s.stealEnergy || s.cocoon || s.confuse) removal++;
                    } else if (d.type === "trap") traps++;
                    else if (d.type === "building") blds++;
                    if (d.spellGrow || d.spellBuffAura || d.leaderAura
                        || d.plantEcho || d.buffEcho || d.tradeDraw
                        || d.medicHeal) engines++;
                    if ((d.cost || 0) >= 5) heavy++; // финишеры/тяжесть
                }
                let pairs = 0;
                for (const k in A.AI_COMBOS_BASE) {
                    const pp = k.split("|");
                    if (has[pp[0]] && has[pp[1]]) pairs++;
                }
                const n = Math.max(1, ids.length);
                return c.map[side] = {
                    aggro: 0.5 * cheap / n + 0.3 * rush / n
                        + 0.2 * Math.min(1, lethal / 15),
                    ctrl: 0.45 * removal / n + 0.3 * traps / n
                        + 0.25 * Math.min(1, (heavy + blds) / n * 2),
                    combo: 0.45 * engines / n + 0.35 * Math.min(1, heavy / n * 2)
                        + 0.2 * Math.min(1, pairs / 3),
                };
            };
            // Выбор стиля матчапа: противник однозначен (разрыв первых двух
            // его метрик ≥ styleMargin) — контр-стиль по МАТРИЦЕ КОНТР-
            // ПИКОВ (W156, юзер: «какую стратегию против какой применять —
            // решает сама игра»): argmax строки styleVs<E>* — ключей AI_W,
            // которые лига тюнит турниром; «Own» в строке = не контрпикать,
            // свой сильнейший. Дефолты матрицы = прежняя КНБ-таблица
            // (агрессия успевает убить комбу, контроль перемалывает
            // агрессию, комба резко выигрывает у контроля) — допущение
            // спеки теперь проверяемо: лига может перевернуть любую
            // ячейку (например, «против агрессии — комба»).
            // Неоднозначный матчап — свой сильнейший стиль. "" = гейт выкл.
            A.aiStyle = function aiStyle() {
                if (!AI_W.styleOn) return "";
                let c = B.__stylePick;
                const ck = B.turnNo + ":" + B.turnSide;
                if (c && c.key === ck) return c.v;
                const ORDER = ["aggro", "ctrl", "combo"];
                const top = (mm) => ORDER.slice().sort((a, b) => mm[b] - mm[a]);
                const cap = (s) => s[0].toUpperCase() + s.slice(1);
                const my = __styleCtx("e"), foe = __styleCtx("p");
                const ft = top(foe);
                let v = top(my)[0];
                if (foe[ft[0]] - foe[ft[1]] >= AI_W.styleMargin) {
                    // argmax по строке матрицы; тай-брейк детерминирован
                    // порядком вставки (aggro, ctrl, combo, own) — парность
                    // лиг. Own (пустой ответ) → свой сильнейший (v)
                    const E = cap(ft[0]);
                    const resp = [];
                    for (const s of ORDER)
                        resp.push({ s,
                            w: AI_W["styleVs" + E + cap(s)] || 0 });
                    resp.push({ s: "", w: AI_W["styleVs" + E + "Own"] || 0 });
                    resp.sort((a, b) => b.w - a.w);
                    v = resp[0].s || v;
                }
                B.__stylePick = { key: ck, v };
                return v;
            };
            // Множитель глобального веса по стилю. W154b (юзер: «у каждой
            // стратегии — СВОИ настраиваемые ключи»): дельты — 15 ключей
            // AI_W (styleAggro*/styleCtrl*/styleCombo* — пакеты под каждую
            // стратегию, лига тюнит знак и силу каждой точки; 0 = точка
            // выключена). Карта «вес → свой ключ» статична: aggro —
            // атакеры и урон базе ценнее, энергия тратится, добор
            // дешевеет; ctrl — своя база и удаление угроз дороже,
            // подставляться хуже; combo — связки/добор ценнее, энергия
            // копится, план принимается охотнее
            const STYLE_DKEY = {
                aggro: { vAtk: "styleAggroVAtk", cBase: "styleAggroCBase",
                    cEnergy: "styleAggroCEnergy",
                    sFrontRow: "styleAggroSFrontRow", cDraw: "styleAggroCDraw" },
                ctrl: { cSelfBase: "styleCtrlCSelfBase", tAtk: "styleCtrlTAtk",
                    sFrontRow: "styleCtrlSFrontRow", cEnergy: "styleCtrlCEnergy",
                    cBase: "styleCtrlCBase" },
                combo: { comboK: "styleComboComboK", cDraw: "styleComboCDraw",
                    cEnergy: "styleComboCEnergy",
                    treeMargin: "styleComboTreeMargin", vAtk: "styleComboVAtk" },
            };
            A.aiStyleMul = function aiStyleMul(key) {
                if (!AI_W.styleOn) return 1;
                const st = aiStyle();
                if (!st) return 1;
                const dk = STYLE_DKEY[st][key];
                return dk ? 1 + AI_W.styleK * (AI_W[dk] || 0) : 1;
            };
            // ── W124 (юзер): синтез «способность героя ↔ карта». Мягкие
            // прибавки к ценности карт, созвучных способности героя кресла
            // (только СВОИМ юнитам и своим выборам из поиска). Спека-
            // режимы (chaosHold, шестерни) не трогает — это только оценки.
            // W147: тело вынесено в aiHeroSynOf(def, side) — deckCtx зовёт
            // его БЕЗ гейта synOn и с чужой стороной (герой владельца карты)
            A.aiHeroSynOf = function aiHeroSynOf(def, side) {
                if (!def) return 0;
                let h = null;
                try { h = heroDefOf(side || "e"); } catch (e) { return 0; }
                const ab = h && h.ability;
                if (!ab) return 0;
                let s = 0;
                if ((ab === "firstSpellDmg" || ab === "strengthSpellDmg"
                    || ab === "growthSpellDmg" || ab === "firstSpellEnergy")
                    && def.type === "spell") s += AI_W.synSpell;
                if ((ab === "trapEcho" || ab === "startDrawTrap"
                    || ab === "firstTrapEnergy" || ab === "trapReplay")
                    && def.type === "trap") s += AI_W.synTrap;
                if ((ab === "goblinChainSummon" || ab === "startDrawGoblin")
                    && (def.isGoblin || def.creature === "goblin"
                        || def.race === "goblin")) s += AI_W.synGoblin;
                if ((ab === "thirdSummonEnergy" || ab === "secondSummonDig"
                    || ab === "packFrenzy" || ab === "firstSummonAtk"
                    || ab === "firstSummonHp" || ab === "firstSummonWard")
                    && def.type === "unit") s += AI_W.synUnit;
                if ((ab === "startDrawPlant" || ab === "plantEcho")
                    && (def.plant || def.creature === "plant")) s += AI_W.synPlant;
                if ((ab === "startDrawBuilding" || ab === "firstBuildingGuard"
                    || ab === "bldUnits" || ab === "startBuildingPlay")
                    && def.type === "building") s += AI_W.synBld;
                if ((ab === "startDrawAnimal" || ab === "packFrenzy")
                    && def.creature === "animal") s += AI_W.synAnimal;
                if ((ab === "startDrawSkeleton" || ab === "firstSkeletonDig"
                    || ab === "firstSkeletonStrike") && def.subtype === "skeleton")
                    s += AI_W.synSkel;
                return s;
            };
            A.aiHeroSyn = function aiHeroSyn(def) {
                return AI_W.synOn ? aiHeroSynOf(def) : 0;
            };
            // ── W124 (юзер): единая оценка поля — та же формула, что у листа
            // дерева розыгрыша (aiTree.js evalModel), на РЕАЛЬНОМ бое.
            // «Все решения — её Δ» целиком — следующий этап; сейчас это
            // общий измеритель (пробы/будущие ветки), поведение не меняет
            A.evalBoard = function evalBoard() {
                let own = 0, foe = 0;
                for (const u of B.units) {
                    if (u.side === "e") own += aiVal(u);
                    else foe += aiThreat(u);
                }
                // своя база — как «сохранённые жизни» (cSelfBase модели),
                // энергия — как в модели; урон вражеской базе считается
                // по факту в местах применения (Δ-оценкой)
                return own - foe
                    + AI_W.cSelfBase * (B.enemyBase || 0)
                    + AI_W.cEnergy * (B.eEnergy || 0);
            };
            // ── W131 (юзер): план энергии — «на что копим ползунок» ────────────
            // ИИ видит СВОИ карты целиком (рука/колода/сброс). Два опорных
            // факта:
            //  · тяжесть колоды — средняя базовая цена пула, который ещё
            //    придёт в руку (колода+сброс: сброс вернётся пересмешиванием);
            //    «тяжёлая» колода (≥ planHeavyAvg) оправдывает копение под
            //    СВЯЗКУ из двух дорогих карт, «лёгкая-быстрая» — под одну.
            //  · бюджет — что будет на руках в СЛЕДУЮЩИЙ полуход ИИ при
            //    нулевом доборе (остаток + доход шкалы). Карта «за 6 маны»
            //    при бюджете 4 — сигнал: добор режется, чтобы через полуход
            //    её сыграть («специально ставит ползунок на 2+ маны»).
            // План — ОГРАНИЧЕНИЕ добора сверху: каждая не взятая карта =
            // +1⚡ в копилку, но не ниже planFloor карт — рука не замирает
            // наглухо. Выбор цели:
            //  1) T1 — самая дорогая карта руки с effCost ≥ planMinCost
            //     (ничья — по «силе карты» aiCardPower);
            //  2) если T1 и так по зубам (с добором planFloor) — связка
            //     T2 = T1 + вторая карта с ценой ≥ planComboCost, но только
            //     у тяжёлой колоды: копим на ОБЕ сразу.
            // Возвращает { t1, t2, budget, deckAvg, heavy, cap }: cap — граница
            // добора (−1 = планировщик выключен); применяет enemyDrawPlan.
            // Вызывается раз в полуход — дёшево (рука ≤ 7, пул — строки).
            A.aiEnergyPlan = function aiEnergyPlan() {
                const plan = { t1: 0, t2: 0, budget: 0, deckAvg: 0, heavy: false, cap: -1 };
                if (!AI_W.planOn) return plan;
                const total = spheresTotal();
                plan.budget = B.eEnergy + total; // мана след. полухода при 0 добора
                // тяжесть колоды: что ещё реально придёт в руку
                const pool = (B.eDeck.length + B.eDiscard.length)
                    ? B.eDeck.concat(B.eDiscard)
                    : (B.eDeckBase || B.eHand);
                let s = 0;
                for (const id of pool) s += (CARDS[id] && CARDS[id].cost) || 0;
                plan.deckAvg = pool.length ? s / pool.length : 0;
                plan.heavy = plan.deckAvg >= AI_W.planHeavyAvg;
                // цели из руки: дорогие карты по убыванию РЕАЛЬНОЙ цены
                // (effCost — со скидками), ничья — по «силе карты»
                const costly = B.eHand
                    .map((id) => ({ id, c: effCost(id, "e"),
                        p: CARDS[id] ? aiCardPower(CARDS[id]) : 0 }))
                    .filter((x) => x.c >= AI_W.planMinCost)
                    .sort((a, b) => b.c - a.c || b.p - a.p);
                if (!costly.length) return plan;
                plan.t1 = costly[0].c;
                if (costly.length > 1 && costly[1].c >= AI_W.planComboCost)
                    plan.t2 = plan.t1 + costly[1].c;
                // W132: эмпирическая пара из AI_COMBOS — копим на ОБЕ карты
                // и у лёгкой колоды (партнёр УЖЕ в руке — рука не замирает,
                // вопрос только в энергии; heavy-гейт W131 тут не нужен)
                let comboT2 = 0;
                if (AI_W.comboOn && AI_W.comboPlanOn) {
                    const c = aiComboHand(costly[0].id);
                    if (c) {
                        comboT2 = plan.t1 + c.cost;
                        plan.t2 = Math.max(plan.t2 || 0, comboT2);
                        plan.combo = c.id;
                    }
                }
                // цель: связка — только у тяжёлой колоды и когда одиночная
                // карта и так выходит; иначе копим на неё одну; комбо-пара
                // (обе карты в руке) копится без heavy-гейта
                const t = comboT2 || ((plan.heavy && plan.t2
                    && plan.t1 <= plan.budget - AI_W.planFloor) ? plan.t2 : plan.t1);
                // граница добора: сколько карт можно взять, не срывая цель
                // (ползунок в энергию), но не ниже planFloor
                plan.cap = Math.max(Math.min(AI_W.planFloor, HAND_MAX - B.eHand.length),
                    plan.budget - t);
                return plan;
            };
            // ── План добора ИИ по шкале конца хода (мягкое правило — просил юзер).
            // Короткая рука добирается до 4; с 4-го хода ИИ считает по стоимостям
            // карты руки, сколько реально разыграет на следующую ману (запас +
            // доход) — меньше четырёх разыгрываемых, добор до четырёх. Если на
            // следующий ход у него будет 12+ маны — рука добивается до 7; при
            // 20+ маны вся шкала идёт только в карты. Энергия не уходит в минус,
            // до 4-го хода накопления в добор не конвертируются.
            // W130: конец «разгона» энергии (drawRampTurn) и порог маны для
            // правила «до 4 разыгрываемых» (drawPlayableMana) — тюнируемые
            // ключи; дефолты (4 / 0) дают прежнее поведение.
            A.enemyDrawPlan = function enemyDrawPlan() {
                const total = spheresTotal();
                const nextMana = B.eEnergy + total; // мана следующего хода
                // W148: пороги в «деньгах маны» нормализуются темпом боя —
                // доля выбитых жизней обеих баз (0 = старт, 1 = финиш):
                // один и тот же запас маны значит разное в начале и в конце.
                // tempoDrawK со знаком: K>0 — поздняя фаза копит руку
                // (пороги выше), K<0 — flooding включается раньше.
                // tempoDrawOn=0 — прежние литералы бит-в-бит.
                let mPlayable = AI_W.drawPlayableMana,
                    mFull = AI_W.drawFullMana,
                    mAll = AI_W.drawAllEnergy;
                if (AI_W.tempoDrawOn) {
                    const tempo = Math.min(1, Math.max(0, 1
                        - (B.playerBase + B.enemyBase)
                        / (B.playerBaseMax + B.enemyBaseMax)));
                    const tf = 1 + AI_W.tempoDrawK * (tempo - 0.5);
                    mPlayable *= tf; mFull *= tf; mAll *= tf;
                }
                let eCards = 0;
                if (B.eHand.length < AI_W.drawTo)
                    eCards = AI_W.drawTo - B.eHand.length;
                if (B.turnNo >= AI_W.drawRampTurn) {
                    if (nextMana >= mPlayable) {
                        const costs = B.eHand.map((c) => effCost(c, "e")).sort((a, b) => a - b);
                        let mana = nextMana, playable = 0;
                        for (const c of costs) { if (c <= mana) { mana -= c; playable++; } else break; }
                        if (playable < AI_W.drawPlayable)
                            eCards = Math.max(eCards, AI_W.drawPlayable - playable);
                    }
                    if (nextMana >= mFull)
                        eCards = Math.max(eCards, HAND_MAX - B.eHand.length);
                    if (B.eEnergy >= mAll)
                        eCards = HAND_MAX - B.eHand.length; // только карты
                }
                // W105 (юзер): спец-добор «шестерён» под тройку УБРАН —
                // стратегия сменена: тяжёлые «Сдвиги» выходят сразу
                // (2–3-й ход, они ждут на клетках и не занимают стол),
                // одновременного прихода добиваются «Экспериментами»,
                // а не удержанием карт; план добора обычный
                // W131: план энергии (aiEnergyPlan) — под дорогую карту/
                // связку режем добор сверху (ползунок в энергию); cap = −1,
                // пока планировщик выключен
                const plan = aiEnergyPlan();
                if (plan.cap >= 0)
                    eCards = Math.min(eCards, Math.max(0, plan.cap));
                return Math.max(0, Math.min(eCards,
                    HAND_MAX - B.eHand.length,
                    B.turnNo >= AI_W.drawRampTurn ? total + B.eEnergy : total));
            };


            // ── Правила ИИ по картам и связкам (просил юзер) ───────────────────
            // ИИ играет аккуратно: не навредит своим (стена костров, сплэш мины,
            // взрыв жертвы), строит связки (лагерь/костёр + призыв рядом, вождь
            // до гоблинов, алтарь до урона) и держит части комбо в руке, пока
            // не придёт пара (руны копируют только достойное, валун ждёт
            // сильного метателя).
            // Ценность жетона для размена: не только «урон + жизни», но и
            // способности/ауры (сокрушение, чаща, вождь, алтарь…). Одна общая
            // метрика, чтобы пожар/жертва/грибы считали одинаково с целями.
            A.aiVal = function aiVal(u) {
                if (!u || !u.def) return 0;
                const d = u.def;
                let v = (u.curAtk || 0) * AI_W.vAtk
                    * (u.side === "e" ? aiStyleMul("vAtk") : 1) // W154: стиль — СВОИ атакеры
                    + (u.hp || 0) * AI_W.vHp;
                if (d.type === "building") v += AI_W.vBld; // стоит, клетку держит
                if (d.crush) v += AI_W.vCrush;
                if (d.thicket) v += AI_W.vThicket;
                if (d.siegeDouble) v += 0.9; // «Тараномобиль»: ×2 постройкам/базе
                if (d.ability === "archer") v += 0.4;
                if (d.ability === "assassin") v += 0.4;
                if (d.ability === "pushBack") v += 0.3;
                if (d.frostNeighbors) v += 0.6; // «Старший ледовик»: лёд своим бокам
                if (d.trapOnMove) v += 0.3; // «Выросшие духи»: ловушка с руки
                if (d.leaderAura || d.plantEcho || d.druidEnergy
                    || d.sisterDraw || d.spellAura || d.campAura) v += AI_W.vEngine;
                if (d.buffEcho) v += AI_W.vBuffEcho; // gh251 (W61): Корона леса — усиления ×2
                if (d.aura) v += AI_W.vAura; // «Святой Грааль»: +2/+2 всем своим
                if (d.tradeDraw) v += AI_W.vTradeDraw; // «Торговец»: карта каждый ход
                if (d.counterSpike) v += 0.4 * d.counterSpike; // «Ответ»
                if (d.siegeFollow) v += 1.2; // «Осадная башня»: ездит и стреляет
                if (unitDash(d) > 1) v += 0.5 * unitDash(d); // «Скорость N»
                if (d.undying) v += AI_W.vUndying; // «Снизошедший»: переживает смертельный удар
                if (d.medicHeal) v += AI_W.vMedic; // «Полевой медик»: +1♥ случайному каждый ход
                if (d.pillarEnergy) v += 1.0; // «Опорник»: +1⚡ за каждую атаку по нему
                if (d.altarSword) v += 0.9 + 0.25 * Math.max(0, (u.hp || 0) - 1);
                if (d.starTower) v += 1.2;
                if (d.cloudSpire) v += 1.8;
                if (d.waterMage) v += 0.6;
                if (d.stormer) v += 0.8; // «Весёлый штормовик»: каст каждый ход
                if (d.lakeMaid) v += 0.5; // «Озёрная дева»: чужая способность
                if (u.venom) v += 0.4;
                if (u.berserk) v += 0.3 * u.berserk;
                if (u.exhuming) v += 0.8 * u.exhuming; // «Выкапливание»: вернётся после смерти
                // W144 (statOn): счётчики состояний своего юнита — растущий
                // яд удешевляет обречённого (ожидаемая смерть ≈ яд/жизни,
                // яд +1 за тик), счётчик «Призыва N» дорожает к выходу
                if (AI_W.statOn && d.type === "unit") {
                    if (u.poison > 0) v *= Math.max(0.1, 1 - AI_W.vPoisonK
                        * Math.min(0.9, u.poison / Math.max(1, u.hp || 1)));
                    if (u.summonN > 0) v *= 1 + AI_W.vSummonNK * 0.2;
                }
                // W134 (юзер): ПОЗИЦИЯ юнита — прогресс до чужой базы
                // (наш "e" идёт к ряду GRID−1, чужой "p" — к ряду 0);
                // постройки не маршируют — их press = 0
                if (AI_W.vPressBase && d.type === "unit" && u.row != null) {
                    const pr = (u.side === "e" ? u.row : (GRID - 1) - u.row)
                        / (GRID - 1);
                    v *= 1 + AI_W.vPressBase * pr;
                }
                // W124 (юзер): синтез «способность героя ↔ карта» — только
                // СВОИМ юнитам (aiVal зовётся и на чужих для разменов, там
                // синтез нашего героя неуместен)
                if (u.side === "e") v += aiHeroSyn(d);
                return v;
            };
            // W104 (юзер): ОПАСНЫЕ ПОСТРОЙКИ — приоритетные цели уничтожения
            // (заклинаниями и существами, «чтобы поломать связку»). Вес:
            // 1.0 — оружие и саботаж (бьют нас или глушат наши ходы),
            // 0.8 — движки призыва/статов (кормят связки владельца),
            // 0.6 — экономика карт/энергии. Пассивная мелочь (Росток,
            // костёр, Опорник — тот ещё кормит атакующего) — вне списка.
            A.aiDangerBld = function aiDangerBld(d) {
                if (!d || d.type !== "building") return 0;
                // «Дурное варево», требушет, осадная/паровая стрельба, взрыв
                // при возврате, проклятый обелиск; «Краевой камень», ров,
                // крепость, «Ответ», лабиринт, техно-руны, отскок портала —
                // бьют/саботируют наших; «Тёмный алтарь» (снятие эффектов),
                // «Щит возврата», «Дома на деревьях» (перехват базы), Тракт,
                // «Грааль» (+2/+2 всем), Небесный шпиль (полёт+защита)
                if (d.evilBrew || d.trebuchet || d.siegeShot || d.steamShot
                    || d.boomRet || d.curseObelisk || d.edgeStone || d.moat
                    || d.fortress || d.counterSpike || d.labyrinth
                    || d.techRunes || d.portalBounce || d.darkAltar
                    || d.retShield || d.treeHomes || d.roadPush
                    || d.aura || d.cloudSpire) return 1.0;
                // Лагерь, роща, знамя, болото рождений, поле/куча костей,
                // призрачный портал, Склеп, Мини-портал, круг стихий, монолиты,
                // машина времени, часовой механизм, пещера времени, деревня,
                // «Выкапливание», аура эпохи, реликвии, меч в алтаре, аура
                // заклинаний, «Хирд», Корона леса — двигатели связок
                if (d.campAura || d.groveAura || d.banner || d.birthSwamp
                    || d.boneField || d.ghostPortal || d.cryptPlay
                    || d.miniPortal || d.elementalCircle || d.monolith
                    || d.timeMachine || d.clockwork || d.timeCave
                    || d.bonePile || d.epochAura || d.relicsBuff
                    || d.altarSword || d.spellAura || d.hird || d.buffEcho
                    || d.village) return 0.8;
                // Башня звездочёта, грибница, мельница, реликварий, конвейер,
                // кран, лаборатория, «Визуализатор», корм портала, рунные
                // постройки, остров, могильный призрак — экономика
                if (d.starTower || d.mycelium || d.sunsetMill || d.relicVault
                    || d.conveyor || d.crane || d.lab || d.visualizer
                    || d.portalFeed || d.runeMonolith || d.runeBurn
                    || d.islandAct || d.graveGhost) return 0.6;
                return 0;
            };
            // Опасность ЧУЖОГО (игрока) существа для нашей базы/поля. Нужна
            // для выбора цели заклинания и оценки «кого выгодно добить».
            A.aiThreat = function aiThreat(u) {
                if (!u || !u.def) return 0;
                const d = u.def;
                let s = (u.curAtk || 0) * AI_W.tAtk * aiStyleMul("tAtk")
                    + (u.hp || 0) * AI_W.tHp; // W154: ctrl — чужие угрозы приоритетнее
                if (d.crush) s += AI_W.tCrush;
                if (d.thicket) s += AI_W.tThicket;
                if (d.siegeDouble) s += 1.2; // «Тараномобиль»: ×2 постройкам/базе
                if (d.ability === "archer") s += 0.9;
                if (d.ability === "assassin") s += 0.8;
                if (d.ability === "pushBack") s += 0.6;
                if (unitHasFly(u)) s += 0.5;
                if (unitDash(d) === 1) s += 0.4; // «Скорость 1»
                if (unitDash(d) > 1) s += 0.7; // «Скорость N»
                if (d.counterSpike) s += 0.5 * d.counterSpike; // «Ответ»: атаковать больно
                if (d.undying) s += 1.8; // «Снизошедший»: урон в лоб его не убивает
                if (d.medicHeal) s += 1.0; // «Полевой медик»: подлечивает сторону
                if (d.frostNeighbors) s += 0.8;
                if (d.leaderAura || d.plantEcho || d.druidEnergy || d.sisterDraw
                    || d.spellAura || d.campAura || d.monolith) s += 0.9;
                if (d.aura) s += AI_W.tAura; // «Святой Грааль»: усиливает всю сторону
                if (d.altarSword) s += 0.7;
                if (d.starTower) s += 0.8;
                if (d.cloudSpire) s += 1.4;
                if (d.waterMage) s += 0.5;
                if (d.stormer) s += 0.7;
                if (d.lakeMaid) s += 0.3;
                if (u.venom) s += 0.8;
                if (u.enchantFire) s += 0.8;
                if (u.berserk) s += 0.5 * u.berserk;
                // W144 (statOn): счётчики состояний чужого юнита — яд и
                // наросты снижают его будущее, счётчик «Призыва N» и метка
                // «Некроза» повышают срочность, заморозка/опутывание глушат
                if (AI_W.statOn && d.type === "unit") {
                    if (u.poison > 0) s *= Math.max(0.1, 1 - AI_W.tPoisonK
                        * Math.min(0.9, u.poison / Math.max(1, u.hp || 1)));
                    if (u.summonN > 0) s *= 1 + AI_W.tSummonNK * 0.25;
                    if (u.rot) s *= 1 + AI_W.tRotK * 0.3; // следующий урон ×2
                    if (u.necroGrow > 0) s *= Math.max(0.2,
                        1 - AI_W.tNecroGrowK * 0.15 * u.necroGrow);
                    if (u.frozen > 0 || u.entangle > 0)
                        s *= Math.max(0.2, 1 - AI_W.tFrozenK * 0.4);
                }
                if (d.type === "building") {
                    s *= AI_W.tBldMult; // здание не марширует
                    // W104 (юзер): опасная постройка — приоритетная цель
                    // («Дурное варево» и пр.) — поломать связку
                    s += AI_W.tDangerBld * aiDangerBld(d);
                    // W144 (statOn): копилка dec138 — чем больше накопила
                    // сброшенных карт, тем срочнее её ломать
                    if (AI_W.statOn && u.relics && u.relics.length)
                        s *= 1 + AI_W.tRelicsK * 0.1 * u.relics.length;
                }
                // W110 (юзер): детектор разгонов — существо, чья атака ушла
                // далеко выше печатной (медик-петли hon195: лига 20261115
                // видела базы −1736♥), — приоритетная цель: угроза
                // УМНОЖАЕТСЯ, чтобы контроль и удаление выбирали его первым
                if ((u.curAtk || 0) >= AI_W.runMinAtk
                    && (u.curAtk || 0) - (d.atk || 0) >= AI_W.runGap)
                    s *= AI_W.runMult;
                // W124 (юзер, «видимость колоды»): добивание движка —
                // НАВСЕГДА, только если в колоде игрока копий больше нет
                // (сброс вернётся нескоро — пересмешка при пустой колоде);
                // если копии в колоде есть — убийство отчасти впустую
                if (AI_W.poolOn && d.type === "unit") {
                    const dc = aiPoolMemo().deck[cardIdOf(d)] || 0;
                    s *= dc === 0 ? AI_W.poolLastCopyK : AI_W.poolCopiesK;
                }
                // W134 (юзер): ПОЗИЦИЯ чужого юнита — его прогресс к нашей
                // базе ("p" идёт к ряду 0: чем меньше row, тем ближе) и
                // близость к любому нашему юниту (манхэттен до ближайшего)
                if (d.type === "unit" && u.row != null) {
                    if (AI_W.tPressBase) {
                        const pr = (u.side === "p" ? (GRID - 1) - u.row : u.row)
                            / (GRID - 1);
                        s *= 1 + AI_W.tPressBase * pr;
                    }
                    if (AI_W.tNearK && B && B.units) {
                        let md = 99;
                        for (const w of B.units) {
                            if (w.side !== "e" || !w.def) continue;
                            const dd = Math.abs(w.col - u.col) + Math.abs(w.row - u.row);
                            if (dd < md) md = dd;
                        }
                        if (md < 99) s *= 1 + AI_W.tNearK * (1 - Math.min(md, 6) / 6);
                    }
                }
                // W154 (retOn): «Возврат N» — чужое существо уйдёт с поля
                // после N маршей владельца: атак до ухода ≤ ret × скорость
                // и не больше шагов до нашей базы (ряд+1 — удар по базе с
                // края). Чем меньше осталось — тем ниже угроза: добивание
                // досрочно всё чаще в утиль (урон по уходящему пропадает)
                if (AI_W.retOn && d.type === "unit" && u.ret > 0) {
                    const spd = d.speed || 1;
                    const reach = Math.min(u.ret * spd, (u.row || 0) + 1);
                    s *= Math.max(0.1, 1 - AI_W.tReturnK
                        * Math.min(0.8, reach / GRID));
                }
                return s;
            };
            // Ценность СВОЕГО существа (для жертвы/кокона): жизни и цена
            // важнее урона — потерять движок дороже, чем бойца.
            // Ценность СВОЕГО существа (для жертвы/кокона): жизни и цена
            // важнее урона — потерять движок дороже, чем бойца.
            A.aiOwnValue = function aiOwnValue(u) {
                if (!u || !u.def) return 0;
                const d = u.def;
                let s = (d.cost || 0) * 0.6 + (u.curAtk || 0) * 1.0 + (u.hp || 0) * 0.9;
                if (d.crush) s += 0.8;
                if (d.thicket) s += 1.0;
                if (d.leaderAura || d.plantEcho || d.druidEnergy || d.sisterDraw
                    || d.spellBuffAura || d.spellAura || d.campAura) s += 1.1;
                if (d.aura) s += 1.3; // «Святой Грааль»
                if (d.tradeDraw) s += 1.0; // «Торговец»
                if (d.undying) s += 1.2; // «Снизошедший»: своё терять дороже
                if (d.medicHeal) s += 1.0; // «Полевой медик»: движок хила
                if (d.pillarEnergy) s += 0.8; // «Опорник»: энергия за атаку по себе
                if (d.altarSword) s += 0.7;
                if (d.starTower) s += 0.9;
                if (d.cloudSpire) s += 1.6;
                if (d.keeperScale) s += 0.4;
                if (u.venom) s += 0.3;
                if (u.berserk) s += 0.3 * u.berserk;
                return s;
            };
            // Существа в руке ИИ, которые дадут эффект от заклинаний
            // («Заклинатель клинков» растёт с каждого каста) и поиск.
            A.aiSpellCount = () => B.eHand
                .filter((id) => CARDS[id] && CARDS[id].type === "spell").length;
            // Роль существа: поддержку (глобальные ауры/движки) держим в тылу,
            // бойцов — впереди; «стена» — трус, который ловит шаг игрока.
            // Роль существа: поддержку (глобальные ауры/движки) держим в тылу,
            // бойцов — впереди; «стена» — трус, который ловит шаг игрока.
            A.aiUnitRole = function aiUnitRole(def) {
                if (def.ability === "coward") return "wall";
                if (def.leaderAura || def.plantEcho || def.druidEnergy
                    || def.sisterDraw || def.spellBuffAura || def.tradeDraw
                    || def.aura) return "support";
                if (def.medicHeal) return "support"; // «Полевой медик» — в тыл
                if (def.keeperScale) return "scaling";
                if (def.energyToStats) return "finisher";
                if (def.ability === "archer" || def.ability === "assassin") return "striker";
                return "fighter";
            };
            // Первое существо в колонке по направлению марша стороны.
            // Первое существо в колонке по направлению марша стороны.
            A.aiNearestInCol = function aiNearestInCol(side, col, row) {
                const dir = side === "p" ? -1 : 1;
                for (let r = row + dir; r >= 0 && r < GRID; r += dir) {
                    const u = unitAt(col, r);
                    if (u) return u;
                }
                return null;
            };
            A.aiFreeNear = function aiFreeNear(col, row) {
                let n = 0;
                for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const c2 = col + dc, r2 = row + dr;
                    if (c2 >= 0 && c2 < GRID && r2 >= 0 && r2 < GRID
                        && !unitAt(c2, r2)) n++;
                }
                return n;
            };
            // W105 (юзер): план «Экспериментов» (wt271) — какую метку и к
            // какому пределу вести. Вынесен из каста, чтобы тот же план
            // видел гейт играбельности (карта не разыгрывается без пользы).
            // Приоритеты: (1) свой БОЛЬШОЙ «Сдвиг» к меньшему — приходы
            // синхронизируются и лягут в один ход (просил юзер: за
            // одновременный приход трёх существ «шестерни» получают 1⚡);
            // (2) свой «Возврат» к максимуму (существо должно ОСТАВАТЬСЯ
            // на поле); (3) «Возврат» игрока к минимуму наших; (4) свой
            // «Выстрел» к максимуму; (5) значок «Сдвига» игрока к нашему
            // максимуму (его приход позже)
            A.aiTagPickPlan = function aiTagPickPlan() {
                const dPool = tagPool("e", "delay");
                if (dPool.length > 1) {
                    const mn = Math.min(...dPool);
                    const e = (B.delayed.e || [])
                        .filter((d) => d.left > mn)
                        .sort((a, b) => b.left - a.left)[0];
                    if (e) return { col: e.col, row: e.row,
                        tagKey: "delay", mm: "min" };
                }
                const rPool = tagPool("e", "ret");
                if (rPool.length > 1) {
                    const mx = Math.max(...rPool);
                    const u = B.units.find((v) => v.side === "e"
                        && B.units.includes(v)
                        && v.ret > 0 && v.ret < mx);
                    if (u) return { col: u.col, row: u.row,
                        tagKey: "ret", mm: "max" };
                }
                if (rPool.length) {
                    const mn = Math.min(...rPool);
                    const u = B.units.find((v) => v.side === "p"
                        && B.units.includes(v)
                        && v.ret > 0 && v.ret > mn);
                    if (u) return { col: u.col, row: u.row,
                        tagKey: "ret", mm: "min" };
                }
                const sPool = tagPool("e", "shotDmg");
                if (sPool.length) {
                    const mx = Math.max(...sPool);
                    const u = B.units.find((v) => v.side === "e"
                        && B.units.includes(v)
                        && tagVal(v, "shotDmg")
                        && tagVal(v, "shotDmg") < mx);
                    if (u) return { col: u.col, row: u.row,
                        tagKey: "shotDmg", mm: "max" };
                }
                if (dPool.length && (B.delayed.p || []).length) {
                    const mx = Math.max(...dPool);
                    const e = (B.delayed.p || [])
                        .find((d) => d.left < mx);
                    if (e) return { col: e.col, row: e.row,
                        tagKey: "delay", mm: "max" };
                }
                return null;
            };
            // «Стена костров» (str21): ряд горит ТРЁМИ тиками и бьёт ВСЕХ в ряду.
            // Выгоден ряд с давлением игрока — его существа в ряду (успеют
            // получить тик до ухода) и на подходе снизу (рядом r+1 — игрок
            // шагнёт в огонь). Убыток — свои в ряду и на подходе сверху (r−1),
            // а строения в ряду не уйти вовсе. Все ряды в убыток → null: карту
            // держим (просил юзер: не ставить стену на своих).
            // «Стена костров» (str21): ряд горит ТРЁМИ тиками и бьёт ВСЕХ в ряду.
            // Выгоден ряд с давлением игрока — его существа в ряду (успеют
            // получить тик до ухода) и на подходе снизу (рядом r+1 — игрок
            // шагнёт в огонь). Убыток — свои в ряду и на подходе сверху (r−1),
            // а строения в ряду не уйти вовсе. Все ряды в убыток → null: карту
            // держим (просил юзер: не ставить стену на своих).
            A.aiFirewallRow = function aiFirewallRow() {
                let best = null, bestScore = 0;
                for (let r = 0; r < GRID; r++) {
                    let score = 0;
                    for (const v of B.units) {
                        if (v.side === "p" && (v.row === r || v.row === r + 1)) score += aiVal(v);
                        if (v.side === "e" && (v.row === r || v.row === r - 1)) score -= aiVal(v);
                    }
                    if (score > bestScore) { bestScore = score; best = r; }
                }
                return best;
            };
            // «Испепеляющий луч» (hon180): колонка с максимальной выгодой
            // урона по СУЩЕСТВАМ (обе стороны, как в спеке) — урон + шанс
            // добить у существ игрока, убыток по своим почти такой же;
            // выгодной колонки нет → null: карту держим (как у стены костров)
            A.aiColumnPick = function aiColumnPick(dmg) {
                const hit = dmg + altarBonus("e");
                let best = null, bestScore = 0;
                for (let c = 0; c < GRID; c++) {
                    let score = 0;
                    for (const v of B.units) {
                        if (v.col !== c || v.def.type !== "unit") continue;
                        const w = aiVal(v);
                        if (v.side === "p")
                            score += w + (v.hp <= hit ? 2 : 0); // убиваемое жирнее
                        else score -= w * 0.8;
                    }
                    if (score > bestScore) { bestScore = score; best = c; }
                }
                return best;
            };
            // «Гоблинская мина» (str6): сплэш 1 (+алтарь) бьёт соседей клетки —
            // своих убиваемых рядом с миной ИИ не подставляет. Порог считаем
            // с аурой алтаря: она усиливает и сплэш.
            // «Гоблинская мина» (str6): сплэш 1 (+алтарь) бьёт соседей клетки —
            // своих убиваемых рядом с миной ИИ не подставляет. Порог считаем
            // с аурой алтаря: она усиливает и сплэш.
            A.aiMineSafe = function aiMineSafe(col, row) {
                const splash = 1 + altarBonus("e");
                return !B.units.some((v) => v.side === "e" && v.hp <= splash
                    && Math.abs(v.col - col) + Math.abs(v.row - row) === 1);
            };
            // Порядок розыгрыша в руке (внутри группы — дороже раньше, как было):
            // 0 добивание базы · 1 двигатели связок (постройки, вождь, заклинатель
            // клинков, друид/сестра) · 2 урон и удаление · 3 существа ·
            // 4 усиления (когда есть кого усиливать) · 4.5 удары существом
            // (валун/волки — ПОСЛЕ усилений, иначе бафф не успевает) ·
            // 5 ловушки · 6 добор. Так алтарь усиливает дротики этого же хода,
            // вождь удешевляет гоблинов до их розыгрыша, а лагерь встаёт раньше
            // существ, что призываются рядом с ним.
            // Порядок розыгрыша в руке (внутри группы — дороже раньше, как было):
            // 0 добивание базы · 1 двигатели связок (постройки, вождь, заклинатель
            // клинков, друид/сестра) · 2 урон и удаление · 3 существа ·
            // 4 усиления (когда есть кого усиливать) · 4.5 удары существом
            // (валун/волки — ПОСЛЕ усилений, иначе бафф не успевает) ·
            // 5 ловушки · 6 добор. Так алтарь усиливает дротики этого же хода,
            // вождь удешевляет гоблинов до их розыгрыша, а лагерь встаёт раньше
            // существ, что призываются рядом с ним.
            A.aiGroup = function aiGroup(id, def) {
                if (def.type === "spell") {
                    const s = def.spell;
                    if (s.baseDmg && B.playerBase <= s.baseDmg) return 0; // землетрясение добивает
                    if (s.baseHit && B.units.some((v) => v.side === "e"
                        && v.def.type === "unit" && v.curAtk >= B.playerBase)) return 0;
                    if (s.wolfVolley && aiWolfLethal()) return 0; // волки добивают базу
                    // «Цветение кристаллов» — ускоритель: энергия за размер руки,
                    // разыгрывается первым, чтобы хватило и на остальные карты;
                    // «Извлечение тьмы» (dec153) — тоже энергодвижок
                    if (s.energyPerHand || s.energyPerTrap || s.darkExtract
                        || s.bloodMoon || s.nextEnergy
                        || s.target === "tagPick") return 1;
                    if (s.firewall || s.aoeDmg || s.dmg || s.drainAll || s.baseDmg
                        || s.sacrifice || s.copyLast || s.stormAll
                        || s.purge || s.stealEnergy || s.fireflies
                        || s.growthHand || s.nova || s.debuffEnemyAtkAll
                        || s.mindTorture || s.iceStrike || s.mindControl) return 2;
                    if (s.buffAtk || s.buffAtkByHp || s.berserk || s.buffAllAtk
                        || s.enchantFire || s.cocoon || s.venom
                        || s.axeAmp || s.rot || s.transformPack
                        || s.stealEffect || s.necroGrow) return 4; // wt279 «Лабрис», nec286 «Некроз», nec288–290 (W84) — как усиления
                    if (s.baseHit || s.wolfVolley) return 4.5; // бьёт СВОИМ существом
                    if (s.iceSwarm || s.skeletonCrowd) return 3; // тела — как обычный призыв
                    if (s.laySummon) return 3; // «Молебен»: тело 2/2 — как призыв
                    if (s.summonPoints) return 4; // sg249/250: крупное Животное с распределением
                    if (s.wolfSummon) return 4; // gh252 (W61): Животное 2/3 с аурой усиления
                    if (s.captivate) return 2; // hon197: вынос карты призыва — контроль
                    if (s.resurrect) return 3; // hon200: бесплатное тело — как призыв
                    if (s.lightAura) return 4; // hon199: метка — как усиление
                    // «Общие загадки» (wt273, W80): зеркало случайного
                    // заклинания руки — по порядку обычных эффектов
                    if (s.riddles) return 2;
                    // «Высокая мощность» (wt274, W80): тратит ВСЁ, играется
                    // ПОЗЖЕ остальных карт (после трат энергии остаток
                    // больше — и заклинание из колоды дороже)
                    if (s.highPower) return 5;
                    // «Проекция прошлого» (wt277, W81): ±1 всем жетонам —
                    // играется среди обычных контрольных эффектов
                    if (s.projection) return 2;
                    // W60 (юзер): «Рождение феникса» — расчистка поля,
                    // играется РАНЬШЕ уже от 3 построек (гейт в aiSpellPlayable)
                    // W144: порог стал ключом holdPhoenixBld
                    if (s.phoenix
                        && B.units.filter((v) => v.def.type === "building").length
                            >= AI_W.holdPhoenixBld)
                        return 2;
                    return 6; // поиск рун / гадание / поиск знаний / глубокое путешествие
                }
                // «Три монолита» — без спешки (просил юзер: не в приоритете):
                // движок добора, играется, когда важное уже разыграно
                if (def.type === "building") {
                    // «Визуализатор» (wt278, W81): движок бесплатных карт —
                    // ставим ПЕРВЫМ делом (после постановки все карты стороны
                    // бесплатны, пока постройка жива)
                    if (def.visualizer) return 1;
                    return def.monolith ? 5.5 : 1;
                }
                if (def.type === "trap") {
                    // W124 (юзер, «видимость колоды»): масштабирование под
                    // состав пула врага — много заклинаний в его колоде/сбросе
                    // → контр-ловушки вперед даже обычных движков; много
                    // дешёвых существ → мины/засады раньше обычных ловушек
                    if (AI_W.poolOn) {
                        try {
                            const pm = aiPoolMemo();
                            if (def.trap.effect === "counterSpell"
                                && pm.spells >= AI_W.poolSpellN) return 0.9;
                            if (def.trap.effect === "cellDmg"
                                && pm.cheap >= AI_W.poolCheapN) return 4.5;
                        } catch (e) { /* B не поднят — как раньше */ }
                    }
                    // «Отмена заклинания»/«Отмена призыва» (wis83/wis84) и
                    // «Отражение» (wis120): реактивные ловушки — чем раньше
                    // висят, тем больше шансов поймать розыгрыш (контроль)
                    if (def.trap.effect === "counterSpell"
                        || def.trap.effect === "counterSummon"
                        || def.trap.effect === "counterBuilding"
                        || def.trap.effect === "reflectSpell") return 1.2;
                    // «Засадный отряд» (hon196) — висит на своей постройке до
                    // её смерти: не срочная (5 — общий порядок ловушек)
                    return 5;
                }
                // вождь / заклинатель клинков / пастух / друид / сестра — двигатели
                // связок: ставим до существ, чьи способности они усилят/оплатят
                if (def.leaderAura || def.spellBuffAura || def.plantEcho
                    || def.druidEnergy || def.sisterDraw) return 1;
                if (def.medicHeal) return 1.5; // «Полевой медик»: движок хила — рано
                // «Хранитель леса»: тело = числу своих Животных при призыве —
                // с двумя и больше зверями играет в общий поток, иначе ждёт
                if (def.keeperScale) return B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.def.creature === "animal").length >= 2
                    ? 3 : 5.5;
                if (def.energyToStats) return 3.5; // эльф — последним: соберёт остаток энергии
                return 3;
            };
            // ── Оценка ауры соседства при призыве ─────────────────────────────
            // Лагерь — +урон навсегда (ценнее для бойцов с сокрушением/чащей),
            // костёр — лечение каждый ход (ценнее крепышам; но лечит и игрока,
            // поэтому рядом с чужими — минус), лесной монолит — +1 жизнь
            // навсегда (просил юзер: ИИ должен ЛЮБИТЬ вставать рядом с ним),
            // росток — вернётся в руку и даст +3 жизни соседу, «Три монолита» —
            // добор существа на 1 дороже, «Заклинатель клинков» — +урон за касты.
            // ── Оценка ауры соседства при призыве ─────────────────────────────
            // Лагерь — +урон навсегда (ценнее для бойцов с сокрушением/чащей),
            // костёр — лечение каждый ход (ценнее крепышам; но лечит и игрока,
            // поэтому рядом с чужими — минус), лесной монолит — +1 жизнь
            // навсегда (просил юзер: ИИ должен ЛЮБИТЬ вставать рядом с ним),
            // росток — вернётся в руку и даст +3 жизни соседу, «Три монолита» —
            // добор существа на 1 дороже, «Заклинатель клинков» — +урон за касты.
            A.aiSummonAuraScore = function aiSummonAuraScore(def, col, row) {
                let score = 0;
                const spells = aiSpellCount();
                const atk = def.atk || 0;
                const hp = Math.max(1, def.hp || 1);
                for (const b of B.units) {
                    if (b.side !== "e") continue;
                    if (Math.abs(b.col - col) + Math.abs(b.row - row) !== 1) continue;
                    if (b.def.type === "building") {
                        if (b.def.campAura) {
                            score += 3 * b.def.campAura + 0.28 * Math.max(0, atk - 1)
                                + (def.crush ? 0.5 : 0) + (def.thicket ? 0.5 : 0);
                        }
                        if (b.def.campfire) {
                            // костёр лечит ВСЕХ соседей, включая игрока: если рядом
                            // стоит чужое существо, польза тает
                            const foes = B.units.filter((v) => v.side === "p"
                                && Math.abs(v.col - b.col) + Math.abs(v.row - b.row) === 1).length;
                            score += Math.max(0, 2.2 + 0.09 * Math.min(6, hp) - 0.9 * foes);
                        }
                        if (b.def.groveAura) {
                            score += 3 * b.def.groveAura + 0.14 * Math.min(8, hp)
                                + (def.keeperScale ? 0.6 : 0);
                        }
                        if (b.def.sprout) score += 1.9 + 0.05 * Math.min(5, hp);
                        if (b.def.altarSword) {
                            score += 2.0 + 0.35 * Math.max(0, (b.hp || 0) - 1)
                                + 0.12 * Math.min(6, atk);
                        }
                        if (b.def.monolith && B.eDeck.some((x) => CARDS[x]
                            && CARDS[x].type === "unit" && CARDS[x].cost === (def.cost || 0) + 1))
                            score += 3.2;
                    } else if (b.def.spellBuffAura) {
                        score += 2.2 + 0.45 * Math.min(3, spells);
                    }
                }
                // Сам «Заклинатель клинков» хочет стоять в гуще своих: его аура
                // усиливает соседей с каждого заклинания.
                if (def.spellBuffAura) {
                    const n = B.units.filter((o) => o.side === "e" && o.def.type === "unit"
                        && Math.abs(o.col - col) + Math.abs(o.row - row) === 1).length;
                    score += 0.7 * Math.min(3, n);
                }
                return score;
            };
            // Оценка клетки призыва существа: позиция (передний ряд, колонка без
            // затора), ауры соседства, роль (поддержка — в тыл), немедленный бой
            // (рывок/убийство в ответ), защита колонки у нашей базы, открытая
            // колонка к базе игрока. Это и есть «просчёт на ход вперёд»: игрок
            // ходит ПЕРЕД нами, поэтому выставленное под удар существо сначала
            // получает удар, а потом бьёт (если выжило).
            // Оценка клетки призыва существа: позиция (передний ряд, колонка без
            // затора), ауры соседства, роль (поддержка — в тыл), немедленный бой
            // (рывок/убийство в ответ), защита колонки у нашей базы, открытая
            // колонка к базе игрока. Это и есть «просчёт на ход вперёд»: игрок
            // ходит ПЕРЕД нами, поэтому выставленное под удар существо сначала
            // получает удар, а потом бьёт (если выжило).
            A.aiSpotScore = function aiSpotScore(def, col, row) {
                const rows = deployRows("e");
                const frontRow = rows[rows.length - 1];
                const role = aiUnitRole(def);
                let score = 0;
                if (row === frontRow)
                    score += AI_W.sFrontRow * aiStyleMul("sFrontRow");
                if (!B.units.some((o) => o.side === "e" && o.col === col))
                    score += AI_W.sColFree;
                // затор: свои впереди в той же колонке не дают пройти
                const ownAhead = B.units.filter((o) => o.side === "e"
                    && o.col === col && o.row > row).length;
                if (ownAhead) score -= AI_W.sOwnAhead * ownAhead;
                // поддержка — в тыл, если тыл вообще есть
                if (role === "support" && rows.length > 1) {
                    if (row === frontRow) score -= AI_W.sSupportBack;
                    else if (row === rows[0]) score += 0.8;
                }
                score += aiSummonAuraScore(def, col, row);
                // W103 (юзер): свой «Три монолита» на поле + этот юнит
                // образует пару (в колоде ИИ есть юнит ровно на 1 дороже)
                // — целенаправленно встаём в соседнюю к монолиту клетку:
                // поиск дороже на 1 сработает сразу после постановки
                if (B.units.some((o) => o.side === "e" && o.def.type === "building"
                        && o.def.monolith && B.units.includes(o))
                    && B.eDeck.some((x) => CARDS[x] && CARDS[x].type === "unit"
                        && CARDS[x].cost === (def.cost || 0) + 1)
                    && B.units.some((o) => o.side === "e"
                        && o.def.type === "building" && o.def.monolith
                        && B.units.includes(o)
                        && Math.abs(o.col - col) + Math.abs(o.row - row) === 1))
                    score += 1.6;
                const ahead = unitAt(col, row + 1);
                const atk = def.atk || 0;
                // W107 (юзер): «Скорость» — СПОСОБНОСТЬ (dash1/dashN-ключи и
                // dashN-флаг, хелпер unitDash), НЕ марш-поле speed — то есть
                // обычное движение движком боя, у большинства существ. У
                // скоростного после призыва сразу шаг/удар — ему ВЫГОДНО
                // стоять в упор к врагу (клетка перед ним оценивается ниже)
                const dash = unitDash(def);
                if (dash === 1) {
                    if (ahead && ahead.side === "p" && ahead.def.type === "unit" && atk >= ahead.hp)
                        score += AI_W.sDashKill + aiThreat(ahead) * AI_W.sKillThreatK;
                    else if (ahead && ahead.side === "p") score += 0.9;
                    else if (!ahead) score += 0.7; // сразу шагнёт вперёд
                }
                if (dash > 1) {
                    // «Скорость N» (Колесница): две попытки — убить дважды
                    // бьющего или пройти свободную колонку дальше
                    const n = dash;
                    if (ahead && ahead.side === "p" && ahead.def.type === "unit" && atk * n >= ahead.hp)
                        score += AI_W.sDashKill + aiThreat(ahead) * AI_W.sKillThreatK;
                    else if (ahead && ahead.side === "p") score += 1.1;
                    else if (!ahead) score += 0.8 + 0.25 * n;
                }
                if (def.ability === "archer") {
                    const t = aiNearestInCol("e", col, row);
                    // W105 (юзер): позади своего существа/постройки не
                    // ставим — выстрел бьёт ПЕРВОГО на линии, своим
                    // «стрелять в своих же» дороже свободной клетки
                    if (t && t.side === "e") score -= AI_W.sArcherOwnPen;
                    else if (t && t.side === "p") score += 0.8; // есть куда стрелять
                    else if (!t) score += 0.5; // колонка пуста — выстрел в базу
                    // W105 (юзер): стрелок — ближе к своей базе: дольше
                    // идёт до врага, больше выстрелов по подходящим
                    // (или в базу по пустой вертикали)
                    if (rows.length > 1) {
                        if (row === rows[0]) score += 0.8;
                        else if (row === frontRow) score -= 0.7;
                    }
                }
                // W109 (юзер): «Герой прошлого» (tim232) — по соседству со
                // СВОИМ существом получает «Скорость 1» (рывок сразу после
                // появления): рядом со своим — высокий приоритет; если перед
                // клеткой враг, которого рывок (atk) убьёт, — максимальный.
                // Клетки без соседа сюда не доходят (aiUnitSpot отфильтровал)
                if (def.nearSpeed) {
                    if (ahead && ahead.side === "p" && ahead.def.type === "unit"
                        && atk >= ahead.hp)
                        score += AI_W.sNearKill + aiThreat(ahead) * AI_W.sKillThreatK;
                    else if (ahead && ahead.side === "p") score += 0.9;
                    else score += 0.7; // рывок сразу шагнёт вперёд
                }
                if (def.ability === "assassin") {
                    if (B.units.some((v) => v.side === "p" && v.col === col && v.row > row
                        && v.def.type === "unit" && v.hp === 1)) score += 1.8;
                    if (ahead && ahead.side === "p" && ahead.def.type === "unit"
                        && ahead.hp - atk === 1) score += 1.0;
                }
                if (def.crush && row === frontRow) score += 1.1;
                if (def.thicket) {
                    const n = B.units.filter((v) => v.side === "p"
                        && Math.abs(v.col - col) + Math.abs(v.row - row) === 1).length;
                    score += 0.5 * n + (row === frontRow ? 0.5 : 0);
                    if (ahead) { // всплеск бьёт и своих рядом с целью
                        const ownNear = B.units.filter((v) => v.side === "e" && v !== undefined
                            && Math.abs(v.col - ahead.col) + Math.abs(v.row - ahead.row) === 1).length;
                        score -= 0.4 * ownNear;
                    }
                }
                if (def.ability === "pushBack" && ahead && ahead.side === "p") score += 0.6;
                // W104 (юзер): «через клетку» — боевое существо ставим в 2
                // клетках перед вражеским (клетка между свободна): противник
                // потратит свой марш на подход (скорость 1 с разбега не
                // бьёт), и наш удар будет первым — на удар больше в размен.
                // W107 (юзер): правило ТОЛЬКО для существ БЕЗ «Скорости» —
                // скоростным промежуток не нужен (рывок сразу бьёт стоящего
                // перед ним), их в упор оценивает ветка «Скорости» выше.
                // Полётным то же самое (W104-7): в упор они перелетают, а
                // не бьют, так что и им нужен этот промежуток — в свой
                // следующий ход перелетят через врага полётом. Раньше
                // полётным платили за стоянку В УПОР (+1.0) — но игрок
                // бьёт первым и перелёт не успевал случиться
                const gapFoe = B.units.find((v) => v.side === "p" && v.col === col
                    && v.def.type === "unit" && v.row === row + 2);
                if (gapFoe && role !== "wall" && role !== "support"
                    && (gapFoe.def.speed || 1) === 1
                    && row + 1 < GRID && !unitAt(col, row + 1)
                    && !dash) {
                    // W124 (юзер): правило «через клетку» предполагает, что
                    // враг доберётся шагом. В пуле игрока (колода+сброс
                    // публичны) много стрелков/рывковых/летящих — промежуток
                    // не спасает, вес гейпа ослабевает
                    let gapW = 1;
                    if (AI_W.poolOn) {
                        try {
                            if (aiPoolMemo().mobile >= AI_W.poolMobileN)
                                gapW = AI_W.poolGapK;
                        } catch (e) { /* B не поднят — как раньше */ }
                    }
                    score += AI_W.sGap * gapW;
                }
                if (def.wolfSummon && row === frontRow) score += 0.4; // ловит урон — зовёт волка
                if (def.keeperScale) {
                    const animals = B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit" && v.def.creature === "animal").length;
                    if (animals >= 3 && row === frontRow) score += 0.8;
                }
                if (def.energyToStats
                    && B.eEnergy - effCost(cardIdOf(def), "e") >= 4) {
                    if (row === frontRow) score += 0.8;
                }
                if (def.ability === "shaman" || def.ability === "spiritSummoner") {
                    // бесплатный призыв на соседнюю клетку — оставляем место
                    score += 0.6 * Math.min(2, aiFreeNear(col, row));
                }
                // «Иллюзия» (wis108) копирует статы соседа — ставим рядом с
                // сильным СВОИМ существом и избегаем пустых клеток
                if (def.illusion) {
                    let best = 0;
                    for (const v of B.units) {
                        if (v.side !== "e" || v.def.type !== "unit") continue;
                        if (Math.abs(v.col - col) + Math.abs(v.row - row) !== 1) continue;
                        best = Math.max(best, aiVal(v));
                    }
                    if (best > 0) score += 0.8 + best * 0.22;
                    else score -= 1.6;
                }
                // «Озёрная дева» (wis111) копирует способность соседа —
                // ставим рядом с ценным СВОИМ существом
                if (def.lakeMaid) {
                    let best = 0;
                    for (const v of B.units) {
                        if (v.side !== "e" || v.def.type !== "unit") continue;
                        if (Math.abs(v.col - col) + Math.abs(v.row - row) !== 1) continue;
                        best = Math.max(best, aiVal(v));
                    }
                    if (best > 0) score += 0.5 + best * 0.14;
                }
                // бой в клетке: игрок ходит первым — наш новичок сначала
                // получает. W104 (юзер): обмен в упор — не приоритет
                // (выгоднее «через клетку», см. выше), поэтому обычным
                // бойцам он стоит заметно дешевле, чем стене
                if (ahead && ahead.side === "p") {
                    const incoming = ahead.def.type === "unit" ? ahead.curAtk : 0;
                    const survives = (def.hp || 0) > incoming;
                    if (incoming) {
                        score += (role === "wall" ? 0.5 : 0.15) * AI_W.sContactBaseK
                            + Math.min(4, incoming) * AI_W.sContactIncomingK; // тело/задержка
                        score += Math.min(2.2, aiThreat(ahead) * 0.18 * AI_W.sTradeLossK);
                        if (survives) score += (role === "wall" ? 0.6 : 0.2) * AI_W.sContactSurvK;
                        else if ((def.cost || 0) >= AI_W.sTradeCostGate) score -= 1.2; // дорогого зря теряем
                        if (role === "wall") score += 0.8 * AI_W.sContactWallK;
                    }
                    if (survives && ahead.def.type === "unit" && atk >= ahead.hp) {
                        score += (role === "wall" ? 1.6 : 1.0) * AI_W.sContactKillK
                            + aiThreat(ahead) * AI_W.sKillThreatK; // убьём в ответ
                    } else if (survives && atk > 0) {
                        score += 0.2 * Math.min(atk, ahead.hp) * AI_W.sContactChipK;
                    }
                    if (ahead.def.type === "building") { // строения не бьют в ответ
                        // W104 (юзер): опасная постройка врага — ломать связку
                        const dg = aiDangerBld(ahead.def);
                        score += dg ? 1.1 + 1.7 * dg
                            : 0.8 + ((ahead.def.spellAura || ahead.def.campAura
                                || ahead.def.monolith || ahead.def.treeHomes
                                || ahead.def.groveAura) ? 1.2 : 0);
                    }
                }
                // трус — стеной прямо перед существом игрока (его следующий шаг)
                if (def.ability === "coward" && ahead && ahead.side === "p")
                    score += AI_W.sCowardAhead;
                // защита колонки, где игрок уже близко к нашей базе
                const near = B.units.filter((v) => v.side === "p" && v.col === col)
                    .sort((a, b) => a.row - b.row)[0];
                if (near) {
                    if (near.row <= 2) score += (3 - near.row) * AI_W.sDefendRowK
                        + Math.min(1.5, aiThreat(near) * AI_W.sDefendThreatK);
                    if (near.row - 1 === row) score += 0.6; // прямо на его пути
                }
                // «Сдвиг» (Время, просил юзер): метки «Сдвига» — чужие
                // занимаем (прибытие задержанного существа противника
                // блокируется, пока наш стоит на клетке; значок с малым
                // счётчиком ценнее — заблокировать успеем наверняка),
                // свои не трогаем (заблокируем собственный призыв)
                const pmark = B.delayed && B.delayed.p
                    && B.delayed.p.find((e) => e.col === col && e.row === row);
                if (pmark) score += pmark.left <= 2 ? AI_W.sMarkBlock : 1.2;
                const emark = B.delayed && B.delayed.e
                    && B.delayed.e.find((e) => e.col === col && e.row === row);
                if (emark) score -= 2.5;
                // W104 (юзер) «Бой во времени»: «Сдвиг»-карта появится через
                // N тиков (в начале нашего хода, ПЕРЕД маршем) — ставить
                // значок так, чтобы при появлении враг стоял прямо впереди
                // (row+1): пришедшее бьёт сразу, а не подставляется.
                // Враг в колонке марширует вверх по spd клеток за ход:
                // соседом станет через (v.row − row − 1)/spd ходов —
                // совпало с N: идеально; уже впереди, а «Сдвиг» снят
                // Машиной времени — удар при появлении; подойдёт позже —
                // пришедшее шагнёт само и получит удар первым (хуже);
                // пройдёт мимо раньше — нейтрально
                if (def.delay && def.type === "unit") {
                    const dly = effDelayVal(def.delay, "e");
                    let adj = -0.6;
                    for (const v of B.units) {
                        if (v.side !== "p" || v.col !== col
                            || v.def.type !== "unit") continue;
                        const gap = v.row - row - 1; // 0 = прямо перед клеткой
                        if (gap < 0) { adj = Math.max(adj, 0.2); continue; }
                        const spd = v.def.speed || 1;
                        if (gap === 0) adj = Math.max(adj, dly === 0 ? 1.6 : 0.5);
                        else if (gap === dly * spd) adj = Math.max(adj, 2.4);
                        else if (gap < dly * spd) adj = Math.max(adj, 0.4);
                    }
                    score += adj;
                }
                // W104 (юзер): в колонке врага стоит опасная постройка
                // («Дурное варево» и пр.) — колонка привлекательнее: марш
                // существа сам приведёт его на удар по связке
                const colDanger = B.units.find((v) => v.side === "p"
                    && v.col === col && v.def.type === "building"
                    && aiDangerBld(v.def) > 0);
                if (colDanger) score += 1.0 + 0.8 * aiDangerBld(colDanger.def);
                // открытая колонка к базе игрока — давление
                const foesAhead = B.units.some((v) => v.side === "p"
                    && v.col === col && v.row > row);
                if (!foesAhead) score += 0.5 + (row === frontRow ? 0.4 : 0);
                // (W58, юзер) призыв ЗА собственной постройкой — существо
                // застрянет за ней до её смерти: марш прямой. Вес заметный,
                // но не абсолютный (в забитой зоне призываться надо)
                if (B.units.some((v) => v.side === "e" && v.def.type === "building"
                    && v.col === col && v.row > row)) score -= AI_W.sBehindBldPen;
                // W154 (trapAvoidOn): ЧУЖИЕ клеточные ловушки — «?» публична.
                // Призыв на её клетку триггерит ловушку (мина бьёт, опутывание
                // глушит, засада зовёт гоблинов); штраф × цена карты — дешёвым
                // можно «разминироваться» (мина одноразовая), дорогим нет.
                // «Лудка» на самой клетке безвредна (прямой вход ничего не
                // делает) — опасна СОСЕДНЯЯ: первый шаг марша/рывка уведут
                // lureRedirect-ом на неё (урон + шаг впустую)
                if (AI_W.trapAvoidOn) {
                    const ft = (B.traps && B.traps.p || []).find((t) => !t.unit
                        && t.col === col && t.row === row
                        && t.def.trap.effect !== "lure");
                    if (ft) score -= AI_W.sTrapCell
                        * Math.min(1, (def.cost || 1) / 4);
                    if (AI_W.sTrapLure && (B.traps && B.traps.p || []).some((t) =>
                        !t.unit && t.def.trap.effect === "lure"
                        && Math.abs(t.col - col) + Math.abs(t.row - row) === 1))
                        score -= AI_W.sTrapLure;
                }
                return score;
            };
            // Клетка призыва существа ИИ: раньше — передний ряд/колонка без своих,
            // теперь ещё ауры соседства и оценка боя. Возвращает лучшую клетку;
            // равные варианты перемешиваются, чтобы бои не были клонами.
            // W86 (юзер): ИИ не ставит существ с «Возвратом N», если они
            // не успеют ДОБЕЖАТЬ до существа/постройки врага (в колонке
            // клетки) или базы противника раньше, чем вернутся в руку.
            // Тик «Возврата» — ПОСЛЕ марша владельца (W103 — юзер: существо
            // успевает походить/ударить и только потом возвращается в руку;
            // aiPlay.enemyTurn/arenaActions.playerTurnStart: marchSide →
            // returnTick), так что призванному сейчас доступно returnN
            // маршей по speed шагов. Шаги до цели: ближайший юнит в колонке
            // клетки — враг на ряду r достижим за r−row шагов (последний
            // шаг — атака), СВОЙ раньше цели стопарит марш («своим не даём
            // пройти, своих не бьём» — цель за ним недостижима), пустая
            // колонка — выпад в базу игрока за 5−row шагов. Консервативно:
            // «Зелёный портал» и прочие перепрыгивания не учитываем
            A.retRushOk = function retRushOk(def, col, row) {
                const marches = def.returnN || 0;
                if (marches <= 0) return false;
                // W109 (юзер): «Герой прошлого» (tim232) — «Скорость 1»
                // появляется ТОЛЬКО по соседству со своим существом
                // (nearSpeed): соседняя клетка годна сразу — рывок бьёт при
                // появлении, дальше ведут 3 марша; без соседа скорости нет —
                // прежняя блокировка (на лиге 20261115 карта не сыграла НИ
                // РАЗУ: speed 0 всегда заворачивалась здесь)
                let near = false;
                let spd = def.speed || 0;
                if (def.nearSpeed && B.units.some((v) => v.side === "e"
                        && v.def.type === "unit" && B.units.includes(v)
                        && Math.abs(v.col - col) + Math.abs(v.row - row) === 1)) {
                    spd += def.nearSpeed;
                    near = true;
                }
                if (spd <= 0) return false; // ни шага не успеет
                if (near) return true; // рывок бьёт сразу — доходимость не важна
                let steps = 5 - row; // база игрока за последним рядом
                for (let r = row + 1; r < GRID; r++) {
                    const occ = unitAt(col, r);
                    if (!occ) continue;
                    // свой раньше цели — марш упрётся в него, цели/базы
                    // в этой колонке не достичь
                    steps = occ.side === "p" ? r - row : Infinity;
                    break;
                }
                return steps <= marches * spd;
            };
            // Клетка призыва существа ИИ: раньше — передний ряд/колонка без своих,
            // теперь ещё ауры соседства и оценка боя. Возвращает лучшую клетку;
            // равные варианты перемешиваются, чтобы бои не были клонами.
            A.aiUnitSpot = function aiUnitSpot(def) {
                const rows = deployRows("e");
                let free = freeCells(rows);
                if (!free.length) return null;
                // W109 (юзер): «Герой прошлого» (tim232) — играть ТОЛЬКО по
                // соседству со своим существом: иначе «Скорости» не будет,
                // а speed 0 — «Возврат 3» заберёт карту без единого шага
                if (def.type === "unit" && def.nearSpeed) {
                    free = free.filter(([c, r]) => B.units.some((v) => v.side === "e"
                        && v.def.type === "unit" && B.units.includes(v)
                        && Math.abs(v.col - c) + Math.abs(v.row - r) === 1));
                    if (!free.length) return null;
                }
                // W86 (юзер): «Возврат» — только клетки, ОТКУДА успеет
                // добежать до цели/базы (см. retRushOk); таких нет —
                // карта не играется (в руке останется до конца хода).
                // W103 (юзер): исключение — целитель с «Возвратом»
                // (healArrive, tim219): лечение соседа срабатывает при
                // ПОЯВЛЕНИИ, до возврата, — если рядом есть раненое своё,
                // выходим туда и без раш-клеток
                if (def.type === "unit" && def.returnN) {
                    const rush = free.filter(([c, r]) => retRushOk(def, c, r));
                    if (rush.length) free = rush;
                    else if (def.healArrive) {
                        const hurt = free.filter(([c, r]) => B.units.some((v) =>
                            v.side === "e" && v.def.type === "unit"
                            && v.hp < (CARDS[cardIdOf(v.def)] || { hp: 0 }).hp
                            && Math.abs(v.col - c) + Math.abs(v.row - r) === 1));
                        if (!hurt.length) return null;
                        free = hurt;
                    } else return null;
                }
                // «Иллюзия» без соседей — 0/0 и мгновенная гибель (просил
                // юзер): только клетки рядом с существом (любой стороны —
                // Иллюзия копирует и своих, и чужих). Таких клеток нет —
                // карту не играем
                if (def.illusion) {
                    free = free.filter(([c, r]) => B.units.some((v) => v.def.type === "unit"
                        && Math.abs(v.col - c) + Math.abs(v.row - r) === 1));
                    if (!free.length) return null;
                }
                let best = [], bestScore = -Infinity;
                for (const [c, r] of free) {
                    const score = aiSpotScore(def, c, r);
                    if (score > bestScore + 1e-9) { bestScore = score; best = [[c, r]]; }
                    else if (Math.abs(score - bestScore) < 1e-9) best.push([c, r]);
                }
                return best[(Math.random() * best.length) | 0];
            };
            // Клетка постройки-ауры (лагерь, костёр, росток, лесной монолит,
            // «Три монолита»): свободные клетки РЯДОМ — это будущие призывы,
            // поэтому они важнее «прижаться к своим». Костёр не ставим к чужим
            // (лечит и игрока), ауры — не в первый ряд под удар, если есть тыл.
            // Остальные постройки — как раньше, в тыл у своей базы.
            // Клетка постройки-ауры (лагерь, костёр, росток, лесной монолит,
            // «Три монолита»): свободные клетки РЯДОМ — это будущие призывы,
            // поэтому они важнее «прижаться к своим». Костёр не ставим к чужим
            // (лечит и игрока), ауры — не в первый ряд под удар, если есть тыл.
            // Остальные постройки — как раньше, в тыл у своей базы.
            A.aiBuildingSpotScore = function aiBuildingSpotScore(def, col, row, free) {
                const rows = deployRows("e");
                const frontRow = rows[rows.length - 1];
                const adjOwn = B.units.filter((v) => v.side === "e"
                    && Math.abs(v.col - col) + Math.abs(v.row - row) === 1);
                const adjFree = free.filter(([c2, r2]) =>
                    Math.abs(c2 - col) + Math.abs(r2 - row) === 1);
                const adjFoe = B.units.filter((v) => v.side === "p"
                    && Math.abs(v.col - col) + Math.abs(v.row - row) === 1);
                let score = 0;
                if (def.campAura) {
                    score += adjFree.length * 1.2;
                    for (const [, r2] of adjFree) if (r2 === frontRow) score += 0.5;
                    score += adjOwn.length * 0.35;
                }
                if (def.groveAura) {
                    score += adjFree.length * 1.7;
                    for (const [, r2] of adjFree) if (r2 === frontRow) score += 0.4;
                    score += adjOwn.length * 0.45;
                }
                if (def.monolith) {
                    score += adjFree.length * 1.5;
                    score += adjOwn.length * 0.3;
                    const combo = B.eHand.some((id) => {
                        const d = CARDS[id];
                        return d && d.type === "unit" && B.eDeck.some((x) => CARDS[x]
                            && CARDS[x].type === "unit" && CARDS[x].cost === d.cost + 1);
                    });
                    if (combo) score += 0.8;
                }
                if (def.campfire) {
                    score += adjOwn.length * 1.0;
                    score += adjFree.length * 0.7;
                    score -= adjFoe.length * 1.4; // лечит и чужих
                }
                if (def.sprout) {
                    score += adjOwn.length * 1.1;
                    score += adjFree.length * 0.25;
                }
                if (def.elementalCircle) {
                    // «Круг стихий»: нужна хотя бы одна свободная клетка рядом
                    score += adjFree.length * 1.6;
                    score += adjOwn.length * 0.2;
                }
                if (def.altarSword) {
                    // «Меч в алтаре»: ценен свободными клетками рядом —
                    // следующие призывы получат бонус, а меч погибнет
                    score += adjFree.length * 1.4;
                    score += adjOwn.length * 0.25;
                }
                if (row === frontRow && rows.length > 1) score -= 0.7;
                score -= adjFoe.length * 1.0;
                // не замуровать ауру: без свободной соседней клетки призыв рядом
                // больше не случится
                if ((def.campAura || def.groveAura || def.monolith
                    || def.elementalCircle || def.altarSword) && !adjFree.length)
                    score -= 3;
                // W154 (trapAvoidOn): постройка на чужой клеточной ловушке
                // тоже триггерит её (мины/нейтральные ловят и строения);
                // лудка-соседка постройке не страшна — она не марширует
                if (AI_W.trapAvoidOn) {
                    const ft = (B.traps && B.traps.p || []).find((t) => !t.unit
                        && t.col === col && t.row === row
                        && t.def.trap.effect !== "lure");
                    if (ft) score -= AI_W.sTrapCell
                        * Math.min(1, (def.cost || 1) / 4);
                }
                return score;
            };
            A.aiBuildingSpot = function aiBuildingSpot(def) {
                const rows = deployRows("e");
                const free = freeCells(rows);
                if (!free.length) return null;
                // (W58, юзер) постройка не должна ПЕРЕКРЫВАТЬ путь своим
                // существам к базе противника: марш прямой, постройка на
                // (c,r) запирает всё СВОЁ, что стоит в той же колонке ВЫШЕ
                // (враг марширует вниз) — и ждущие «Сдвига»: и приезд на
                // клетку постройки (значок ждёт), и марш после приезда.
                // Спецветки ниже не фильтруем: «Сдвиг»-метки врага, Тракт,
                // Крепость, Краевой камень — их механика на перекрытии
                const marchBlocked = (c, r) =>
                    B.units.some((v) => v.side === "e" && v.def.type === "unit"
                        && v.col === c && v.row < r)
                    || ((B.delayed && B.delayed.e) || [])
                        .some((e) => e.col === c && e.row <= r);
                const safe = free.filter(([c, r]) => !marchBlocked(c, r));
                // «Сдвиг» (Время, просил юзер): на метки «Сдвига» ИГРОКА ИИ
                // ставит ПОСТРОЙКИ в первую очередь — постройка не марширует,
                // стоит на клетке и блокирует прибытие задержанного существа
                // игрока, пока жива (значок ждёт с нулём до освобождения).
                // Свои метки не занимаем — заблокируем собственный призыв
                const pmarks = free.filter(([c, r]) => B.delayed && B.delayed.p
                    && B.delayed.p.some((e) => e.col === c && e.row === r
                        && e.left <= 2)
                    && !B.delayed.e.some((e) => e.col === c && e.row === r));
                if (pmarks.length)
                    return pmarks[(Math.random() * pmarks.length) | 0];
                if (def.campAura || def.campfire || def.sprout || def.groveAura
                    || def.monolith || def.elementalCircle || def.altarSword) {
                    // (W58, юзер) ауры тоже не поперёк марша своих; безопасных
                    // клеток нет — карту держим (поставим позже, колонки
                    // освободятся)
                    if (!safe.length) return null;
                    let best = [], bestScore = -Infinity;
                    for (const [c, r] of safe) {
                        const score = aiBuildingSpotScore(def, c, r, free);
                        if (score > bestScore + 1e-9) { bestScore = score; best = [[c, r]]; }
                        else if (Math.abs(score - bestScore) < 1e-9) best.push([c, r]);
                    }
                    return best[(Math.random() * best.length) | 0];
                }
                // «Тракт» (hon171, просил юзер): НИКОГДА в ряд вплотную к
                // своей базе — постройку триггерит существо, ВСТАВШЕЕ после
                // перемещения на соседнюю клетку (призыв не считается), а из
                // ряда у базы марш ни на одну соседнюю клетку не попадает.
                // Ровно на 1 клетку впереди (следующий ряд деплоя) — марши
                // мимо Тракта встают по соседству и уезжают вперёд.
                if (def.roadPush) {
                    const fwd = free.filter(([, r]) => rows.length > 1 && r === rows[1]);
                    const pool = fwd.length ? fwd : free.filter(([, r]) => r !== rows[0]);
                    // своё поле пустое — зона призыва сжалась в один ряд у базы,
                    // ставить некуда: null = карту держим, после первого же
                    // своего существа зона расширится и ряд впереди откроется
                    if (!pool.length) return null;
                    return pool[(Math.random() * pool.length) | 0];
                }
                // «Крепость»/«Краевой камень» (hon176/174): держат ряд — лучше
                // ряд впереди (куда доходят марш-существа), но соседство по
                // вертикали работает и из ряда у базы, поэтому при пустом
                // своём поле ставятся как есть (в отличие от «Тракта»)
                if (def.fortress || def.edgeStone) {
                    const fwd = free.filter(([, r]) => rows.length > 1 && r === rows[1]);
                    const pool = fwd.length ? fwd : free;
                    return pool[(Math.random() * pool.length) | 0];
                }
                // (W58, юзер) обычные постройки — в тыл у своей базы, и тоже
                // только на клетки, не запирающие марш своих существ
                if (!safe.length) return null;
                const back = safe.filter(([, r]) => r === rows[0]);
                const pool = back.length ? back : safe;
                return pool[(Math.random() * pool.length) | 0];
            };

            // ── Панельные карты у ИИ (просил юзер): эффекты, которые у игрока
            // идут через панели выбора, ИИ разыгрывает «в голове» — цель берёт
            // теми же приоритетами, что и обычные карты.
            // Жертва «Жертвоприношения» (str11): своё существо, чей взрыв убивает
            // врагов и окупает потерю — слабое своё против убиваемого, либо
            // 2+ убиваемых разом. Взрыв бьёт и СВОИХ рядом (аккуратно с картами,
            // вредящими своим — просил юзер): своих под удар не подставляем.
            // ── Общая «сила карты» для поиска/варки/путешествия ───────────────
            // Раньше ИИ брал САМУЮ ВЕРХНЮЮ карту (или случайную), хотя правила
            // позволяют выбрать из верхних N. Теперь выбираем лучшую по вкладу:
            // статы/ауры у существ, урон/усиление/движки у заклинаний.
            const aiCardPowerRaw = function aiCardPowerRaw(d) {
                if (!d) return 0;
                // W124 (юзер): связки «способность героя ↔ карта» — мягкая
                // прибавка созвучным картам (поиск/варка/сброс худшей)
                let syn = 0;
                try { syn = aiHeroSyn(d); } catch (e) { syn = 0; }
                if (d.type === "unit") {
                    let s = (d.atk || 0) * 1.25 + (d.hp || 0) + (d.cost || 0) * 0.15;
                    if (d.crush) s += 1.0;
                    if (d.thicket) s += 1.2;
                    if (d.leaderAura || d.plantEcho || d.druidEnergy
                        || d.sisterDraw || d.spellBuffAura) s += 0.9;
                    if (d.keeperScale) s += 0.6;
                    if (d.energyToStats) s += 0.4;
                    if (d.trapGrow) s += 0.4 + Math.min(3, B && B.traps ? B.traps.e.length : 0) * 0.15;
                    if (d.frostAttack) s += 0.4;
                    if (d.frostNeighbors) s += 0.8;
                    // «Выросшие духи»: ценнее, когда в руке есть ловушка под него
                    if (d.trapOnMove) s += 0.4 + (B && B.eHand && B.eHand.some((id) =>
                        CARDS[id] && CARDS[id].type === "trap") ? 0.5 : 0);
                    if (d.waterMage) s += 0.7 + (B && B.eDeck && B.eDeck.some((id) => {
                        const t = CARDS[id];
                        return t && t.type === "trap" && t.cost <= 2;
                    }) ? 0.6 : 0);
                    if (d.illusion) s += 1.2; // X/X от соседа — ценность выше 0/0
                    if (d.copyNeighbor) s += 1.2; // «Мехо-иллюзия» (wt272, W79): копия соседа — тоже
                    if (d.stormer) s += 0.9;
                    if (d.lakeMaid) s += 0.7;
                    if (d.sandDecay) s -= 1.0; // 9/9 за 7⚡, но тает каждый ход
                    if (d.ability === "archer" || d.ability === "assassin") s += 0.3;
                    // «Скелет-лучник» (dec135): «Выстрел 2» дороже обычного
                    if (d.ability === "archer") s += ((d.shotDmg || 1) - 1) * 0.55;
                    if (unitDash(d) === 1) s += 0.2; // «Скорость 1»
                    // «Скорость N» (Колесница) и «Торговец» (карта каждый ход)
                    if (unitDash(d) > 1) s += 0.5 * unitDash(d);
                    if (d.tradeDraw) s += 1.0;
                    if (d.counterSpike) s += 0.4 * d.counterSpike; // «Ответ»
                    if (d.dyingDiscard) s += 0.4; // «Нищий»: бесплатная мелочь с эффектом
                    if (d.lichRaise) s += 1.0; // dec131: Призрак 2/1 за каждое убийство
                    if (d.vampHeal) s += 0.5; // dec132: отхил после каждой атаки
                    if (d.exhuming) s += 1.2; // dec146: вторая жизнь
                    if (d.summonDiscard) s -= 0.4; // dec146: платит картой при появлении
                    // dec147: аура Короля кормит своих скелетов на поле
                    if (d.skelKing) s += 1 + 0.5 * B.units.filter((v) =>
                        v.side === "e" && v.def.type === "unit"
                        && v.def.subtype === "skeleton").length;
                    if (d.acolyteCast) s += 0.5; // dec148: бесплатный каст из сброса
                    if (d.fatBelly) s += 0.9; // dec149: растёт от каждой своей смерти
                    if (d.deathKnight) s += 0.7; // dec159: +1⚡ за каждое убийство
                    if (d.spellGrow) s += 1.0; // hon182: растёт от каждого своего заклинания
                    if (d.undying) s += 1.5; // hon190: переживает смертельный удар
                    if (d.medicHeal) s += 1.2; // hon195: +1♥ случайному объекту каждый ход
                    if (d.protect) s += 0.5 * d.protect; // tim201: врождённая «Защита»
                    if (d.returnN) s += 0.3; // tim215/218/219/220: карта переигрывается
                    if (d.healArrive) s += 0.4; // tim219: лечение соседа при появлении
                    if (d.axeArrive) s += 0.3; // tim220: урон соседу врага при появлении
                    // «Сдвиг» (Время): тело придёт позже — сейчас стоит дешевле
                    if (d.delay) s -= 0.5 * d.delay;
                    return s + syn;
                }
                if (d.type === "building") {
                    return 1.5 + (d.hp || 0) * 0.4 + syn
                        + (d.campAura ? 1.5 : 0) + (d.groveAura ? 1.4 : 0)
                        + (d.monolith ? 1.6 : 0) + (d.spellAura ? 1.2 : 0)
                        + (d.treeHomes ? 1.2 : 0) + (d.mycelium ? 0.8 : 0)
                        + (d.sprout ? 0.8 : 0) + (d.campfire ? 0.8 : 0)
                        + (d.elementalCircle ? 1.6 : 0)
                        + (d.altarSword ? 1.1 : 0) + (d.starTower ? 1.2 : 0)
                        + (d.cloudSpire ? 2.2 : 0) + (d.darkAltar ? 1.4 : 0)
                        + (d.curseObelisk ? 1.7 : 0) // dec136: растёт и отражает
                        + (d.birthSwamp ? 1.5 : 0) // dec151: кормит призванных рядом
                        + (d.relicVault ? 1.3 : 0) // dec138: копит сбросы
                        + (d.evilBrew ? 1.6 : 0) // dec139: давит базу всяким сбросом
                        + (d.boneField ? 1.6 : 0) // dec141: скелет каждый ход
                        + (d.bonePile ? 1.4 : 0) // dec143: «Выкапливание» каждому призыву рядом
                        + (d.cryptPlay ? 1.5 : 0) // dec157: верх сброса играется каждый ход
                        + (d.ghostPortal ? 1.6 : 0) // dec158: Призрак за каждый каст
                        // Честь (hon173–178, просил юзер): движки и контроль
                        + (d.village ? 1.4 : 0) // скидка постройкам — ценнее с постройками в руке/колоде
                        + (d.edgeStone ? 1.3 : 0) // вынос прорвавшихся со своего ряда
                        + (d.moat ? 1.4 : 0) // обдирание подходящих к постройкам
                        + (d.fortress ? 1.8 : 0) // замирает чужой марш, тянет удары на себя
                        + (d.banner ? 1.5 : 0) // Ответ всем своим — ценнее с существами на поле
                        + (d.trebuchet ? 1.7 : 0) // −2 базы врага каждый ход
                        + (d.aura ? 2.2 : 0) // hon185 «Грааль»: +2/+2 всем своим
                        + (d.siegeShot ? (d.siegeFollow ? 1.8 : 0.8) : 0) // hon188: ездит и стреляет
                        + (d.pillarEnergy ? 1.2 : 0) // hon198: +1⚡ за атаку по себе
                        // Время (tim204/205/210/216): движки «Сдвига» и «Возврата»
                        + (d.timeMachine ? 1.5 : 0) // ускоряет всех своих на ход
                        + (d.clockwork ? 1.4 : 0) // рывок каждому пришедшему «Сдвигом»
                        + (d.timeCave ? 1.5 : 0) // бесплатный призыв «Сдвигом» каждый ход
                        + (d.retShield ? 1.4 : 0); // tim216: блокирует тик «Возврата»
                }
                if (d.type === "spell") {
                    const s = d.spell || {};
                    let v = 1.5 + (d.cost || 0) * 0.15;
                    if (s.baseDmg) v += s.baseDmg * 1.2;
                    if (s.aoeDmg) v += s.aoeDmg * 1.4;
                    if (s.dmg) v += s.dmg * 1.1;
                    if (s.drainAll) v += 1.5;
                    // «Гроза»: ценнее при запасе энергии и целях у игрока
                    if (s.stormAll) v += 1 + Math.min(4, B.eEnergy) * 0.4;
                    if (s.fireflies) v += 1.2;
                    if (s.growthHand) v += 1.0;
                    if (s.firewall) v += 1.6;
                    if (s.sacrifice) v += 1.4;
                    if (s.buffAtk) v += 0.5 + s.buffAtk * 0.4;
                    if (s.buffHp) v += 0.3 + s.buffHp * 0.3;
                    if (s.healPlayer) v += 0.6; // hon179: лечение своей базы
                    if (s.columnDmg) v += s.columnDmg * 1.3; // hon180: урон колонке
                    if (s.buffAtkByHp) v += 0.8;
                    if (s.berserk) v += 0.8;
                    if (s.enchantFire) v += 0.8;
                    if (s.venom) v += 0.6;
                    if (s.nova) v += 0.8;
                    if (s.cocoon) v += 0.6;
                    if (s.purge) v += 1.1;
                    if (s.stealEnergy) v += 1.2;
                    if (s.energyPerHand) v += 0.8;
                    if (s.energyPerTrap) v += 0.6 + Math.min(4, B.traps.e.length) * 0.15;
                    // «Медитация» (hw268, W78): 3⚡ в начале следующего хода
                    if (s.nextEnergy) v += 1.1;
                    // «Эксперименты» (wt271, W79): метка к мин/макс — ценнее,
                    // когда есть что улучшать (свой «Сдвиг»/«Выстрел»)
                    if (s.target === "tagPick") v += 0.5 + (tagPool && B ? Math.min(2,
                        ((B.delayed.e || []).length
                            + B.units.filter((u) => u.side === "e"
                                && B.units.includes(u)
                                && (tagVal(u, "shotDmg")
                                    || tagVal(u, "protect")
                                    || tagVal(u, "counterSpike"))).length)) * 0.2 : 0);
                    // «Общие загадки» (wt273, W80): применяет случайное
                    // заклинание руки — ценнее с бОльшей рукой заклинаний
                    if (s.riddles) v += 0.6 + Math.min(3, B.eHand.filter((id) =>
                        id !== "wt273" && CARDS[id]
                        && CARDS[id].type === "spell").length) * 0.2;
                    // «Высокая мощность» (wt274, W80): чем больше энергии
                    // останется после цены карты — тем дороже заклинание
                    // разыграет (гейт «есть подходящее» — в aiSpellPlayable)
                    if (s.highPower) v += 0.8
                        + Math.min(2.5, Math.max(0, B.eEnergy
                            - Math.max(0, effCost("wt274", "e"))) * 0.35);
                    if (s.debuffEnemyAtkAll) v += 0.7 + Math.min(4, B.units.filter(
                        (u) => u.side === "p" && u.def.type === "unit" && u.curAtk > 0).length) * 0.25;
                    if (s.search || s.searchUnit || s.journey || s.discardPick) v += 0.5;
                    if (s.seek) v += 0.6 + Math.min(4, B ? B.eDeck.length : 0) * 0.05;
                    // «Поиск во времени» (tim217): ценнее, когда в верхних
                    // картах колоды есть карты со «Сдвигом»/«Возвратом»
                    if (s.timeSearch) v += 0.5 + 0.25 * Math.min(4,
                        B ? B.eDeck.slice(-(s.timeSearch || 6)).filter((id) => {
                            const d = CARDS[id];
                            return d && (d.delay || d.returnN);
                        }).length : 0);
                    if (s.grim) v += 0.5 + Math.min(4, B ? B.eDeck.length : 0) * 0.05;
                    if (s.copyLast) v += 1.0;
                    if (s.wolfVolley) v += 2.0;
                    if (s.baseHit) v += 1.6;
                    if (s.exhumingMark) v += 1.1; // dec137: вторая жизнь существу
                    if (s.phoenix) v += 2.2 + 0.5 * Math.min(5,
                        B.units.filter((u) => u.def.type === "building").length);
                    if (s.freeze) v += 1.0;
                    if (s.iceStrike) v += 2.0;
                    if (s.hydroPunch) v += 1.2; // урон 1 + полезный сдвиг назад
                    if (s.iceSwarm) v += Math.min(5, s.iceSwarm) * 0.55; // 5 тел 1/1
                    if (s.skeletonCrowd) v += 3 * 0.65; // dec140: три Скелета 1/2
                    if (s.laySummon) v += 1.2; // hon166: тело 2/2 за 1⚡
                    if (s.summonPoints) v += 1.5; // sg249/250: Животное 4/4–5/4
                    if (s.wolfSummon) v += 1.4; // gh252 (W61): Животное 2/3 с аурой усиления
                    // gh258/gh259 (W72): залп ценнее с бОльшим числом своих
                    // существ; колчан — при своём стрелке на поле
                    if (s.volley) v += 0.8 + 0.45 * B.units.filter((u) =>
                        u.side === "e" && u.def.type === "unit").length;
                    if (s.quiver && B.units.some((u) => u.side === "e"
                        && u.def.type === "unit"
                        && (u.def.ability === "archer" || u.def.steamShot
                            || (u.quiverBonus || 0) > 0))) v += 1.6;
                    // hw261/hw263 (W75): вихри ценнее существу со
                    // способностями (+N/+N за каждый свой эффект); щит —
                    // крупному своему существу без щита
                    if (s.vortexBuff) {
                        const bestN = Math.max(0, ...B.units
                            .filter((u) => u.side === "e" && effCreature(u))
                            .map((u) => hwEffectCount(u)));
                        v += bestN > 0 ? 0.5 + 0.45 * bestN : -1; // без эффектов — зря
                    }
                    if (s.airShield) {
                        const best = Math.max(0, ...B.units
                            .filter((u) => u.side === "e" && effCreature(u)
                                && !u.airShield)
                            .map((u) => (u.curAtk || 0) + (u.hp || 0)));
                        v += best >= 4 ? 1.4 : best > 0 ? 0.7 : -1;
                    }
                    if (s.captivate) v += 1.6; // hon197: удаление карты призыва из руки
                    if (s.resurrect) v += 1.8; // hon200: бесплатный призыв из сброса
                    if (s.lightAura) v += 1.0; // hon199: −1♥ соседям каждый ход
                    if (s.poison) v += 1.4; // dec144: растущий яд — тариф выше
                    if (s.destroy) v += 2.7; // dec145: убийство любого существа минус карта
                    // dec150: размен тела на серию случайных ударов (ценнее
                    // при своём крупном существе и целях у игрока)
                    if (s.beastBlast) v += 1.4 + Math.min(4,
                        B.units.filter((u) => u.side === "e"
                            && u.def.type === "unit").length) * 0.2;
                    if (s.darkExtract) v += 1.5; // dec153: энергия = ⚔+♥ жертвы
                    if (s.mindControl) v += 2.4; // dec134: чужое существо — сильный ход
                    if (s.terrainScout) v += 0.6; // dec156: поиск постройки в топ-6
                    if (s.bloodMoon) v += 1.2; // dec160: жизни базы — в энергию
                    if (s.forbidden) v += 2.0
                        + Math.min(3, B ? B.eDeck.length : 0) * 0.1; // dec130: 3 карты
                    if (s.discardHandDraw) v += 1.0
                        + 0.35 * Math.min(6, B.hand.length)
                        - 0.3 * Math.min(6, B.eHand.length);
                    // «Мозговой штурм» (tim206): смена руки +1 карта —
                    // ценнее с полной рукой слабых карт
                    if (s.brainstorm) v += 0.6
                        + 0.25 * Math.min(6, B.eHand.length);
                    // «Добыча кристаллов» (tim211): ценность — по суммарному
                    // «Сдвигу» своих ждущих карт (значков на клетках)
                    if (s.crystalHarvest) v += 0.3 + 0.5 * Math.min(6,
                        B.delayed ? B.delayed.e.reduce(
                            (a2, e2) => a2 + Math.max(0, e2.left), 0) : 0);
                    // «Ковка оружия» (tim208): ценнее, когда в этот ход уже
                    // вышли свои существа (кого усиливать — решает гейт)
                    if (s.forge) v += 0.9 + 0.3 * Math.min(4,
                        B ? B.units.filter((u) => u.side === "e"
                            && u.def.type === "unit"
                            && u.bornTurn === B.turnNo).length : 0);
                    return v + syn;
                }
                if (d.type === "trap") {
                    let v = 2.0 + (d.cost || 0) * 0.2;
                    // «Тёмные цепи»: ценнее, когда на поле уже есть свои
                    // существа — их атака и есть урон ловушки
                    if (d.trap.effect === "alliesStrike" && B)
                        v += Math.min(4, B.units.filter((u) =>
                            u.side === "e" && u.def.type === "unit").length) * 0.4;
                    if (d.trap.effect === "ghostGrave") v += 1.2; // dec152: смерть + призрак
                    if (d.trap.effect === "darkOffering") v += 1.3; // dec154: смерть + бесплатный юнит с руки
                    if (d.trap.effect === "tarStatue") v += 1.0; // dec155: −4⚔ жертве, −2⚔ соседям
                    if (d.trap.effect === "tarKettles") v += 1.2; // hon191: 4 урона всему ряду у базы
                    if (d.trap.effect === "grandParley") v += 0.6; // hon192: размен рук — ценен при пустой руке ИИ
                    if (d.trap.effect === "garrisonRise") v += 1.6; // hon194: до 10 Прихожан 2/2 за удар по базе
                    if (d.trap.effect === "ambushRise") v += 1.4; // hon196: Прихожанин + карта в руку за смерть постройки
                    if (d.trap.effect === "timeTrap") v += 1.3; // tim207: существо из игры на 2 хода
                    return v + syn;
                }
                return 1 + syn;
            };
            // ── W147 (юзер): контекст состава РОДНОЙ колоды стороны ────────
            // Снимок «колода + сброс + рука» (≈ исходная колода минус
            // вышедшие на стол) — доли заклинаний, каст-синергистов
            // (spellGrow/spellBuffAura/acolyteCast/ghostPortal), сородичей
            // по подтипу, тяжёлых (≥5⚡) и дешёвых (≤2⚡) карт + способность
            // героя. Пересчёт ОДИН раз на полуход (кэш ключом
            // turnNo:turnSide — как у __combos): состав меняется только
            // добором/сбросами на границах полуходов. Рабочие поля
            // B.deck/B.eDeck свапаются симом вместе с креслами — привязка
            // «карта → колода владельца» точна и в проде, и в симе.
            // Чтения чистые, без Math.random (парность лиг)
            A.__deckCtx = function __deckCtx(side) {
                let c = B.__dcCtx;
                const ck = B.turnNo + ":" + B.turnSide;
                if (!c || c.key !== ck) { c = { key: ck, map: {} }; B.__dcCtx = c; }
                if (c.map[side]) return c.map[side];
                const deck = side === "p" ? B.deck : B.eDeck;
                const disc = side === "p" ? B.discard : B.eDiscard;
                const hand = side === "p" ? B.hand : B.eHand;
                const ids = (deck || []).concat(disc || [], hand || []);
                const f = { n: ids.length, spell: 0, syn: 0, heavy: 0,
                    cheap: 0, sub: {}, ab: "" };
                for (const id of ids) {
                    const d = CARDS[id];
                    if (!d) continue;
                    if (d.type === "spell") f.spell++;
                    if (d.spellGrow || d.spellBuffAura || d.acolyteCast
                        || d.ghostPortal) f.syn++;
                    if ((d.cost || 0) >= 5) f.heavy++;
                    if ((d.cost || 0) <= 2) f.cheap++;
                    if (d.type === "unit" && d.subtype)
                        f.sub[d.subtype] = (f.sub[d.subtype] || 0) + 1;
                }
                const n = f.n || 1;
                f.spell /= n; f.syn /= n; f.heavy /= n; f.cheap /= n;
                for (const k in f.sub) f.sub[k] /= n;
                try { const h = heroDefOf(side); f.ab = (h && h.ability) || ""; }
                catch (e) { /* B не поднят — как раньше */ }
                c.map[side] = f;
                return f;
            };
            // Поправка к «силе карты» по составу колоды владельца и его
            // героя. Шесть ключей (дефолты 0, гейт deckCtxOn) — бит-в-бит;
            // знаки/масштабы ищет тренировочная лига (группа deck).
            // Сторона владельца карты — второй аргумент aiCardPower
            // (чужая рука: «Плен», сбросы, aiFoeHandAvg — там зовут с "p")
            // ── W147b: per-card bias-таблица (данные, не тюнируемые ключи).
            // Заполняется из корпусов лиг генератором for_work/
            // w147b_bias_gen.mjs (Δ винрейта боя при розыгрыше карты против
            // среднего винрейта того же героя; per-card per-side статистика
            // копится в слимах league_slim cs). Пустой литерал {} = ноу-оп:
            // w134_train не сэмплирует dcBias*, пока таблица пуста
            A.DC_BIAS = {
                "dec122": 0.010,
                "dec137": 0.015,
                "dec139": 0.016,
                "dec149": 0.014,
                "dec150": 0.019,
                "dec153": 0.032,
                "dec154": -0.016,
                "dstr299": 0.014,
                "gh251": 0.016,
                "gh254": 0.010,
                "gh256": 0.014,
                "gh257": -0.026,
                "gh258": -0.016,
                "gh260": 0.017,
                "grw11": 0.016,
                "grw26": -0.013,
                "grw33": 0.028,
                "grw34": -0.018,
                "grw38": 0.018,
                "grw5": 0.012,
                "grw7": 0.018,
                "grw9": 0.019,
                "gwd301": 0.011,
                "hon167": 0.012,
                "hon170": 0.012,
                "hon177": 0.014,
                "hon181": 0.020,
                "hon188": -0.014,
                "hon189": 0.011,
                "hon190": -0.014,
                "hon191": -0.041,
                "hon194": -0.018,
                "hon196": 0.075,
                "hon197": 0.012,
                "hon198": 0.016,
                "hon199": 0.014,
                "hon200": 0.016,
                "hw261": 0.014,
                "hw262": 0.028,
                "hw265": 0.052,
                "hw266": 0.017,
                "hw267": 0.022,
                "hw268": 0.027,
                "hw269": 0.030,
                "nec283": 0.015,
                "nec287": -0.027,
                "nec289": 0.049,
                "sg242": -0.018,
                "sg243": -0.015,
                "sg244": 0.021,
                "sg245": 0.037,
                "sg246": 0.014,
                "sg247": 0.020,
                "sg248": -0.017,
                "sg249": 0.017,
                "sth302": -0.017,
                "str10": 0.013,
                "str28": 0.011,
                "str31": 0.012,
                "str34": 0.014,
                "str35": 0.056,
                "str40": 0.018,
                "tim205": 0.011,
                "tim208": 0.047,
                "tim211": 0.011,
                "tim216": -0.020,
                "tim220": 0.011,
                "tim223": 0.030,
                "tim224": 0.023,
                "tim226": 0.021,
                "tim229": 0.023,
                "tim232": 0.013,
                "wis101": 0.014,
                "wis103": 0.013,
                "wis112": 0.024,
                "wis114": 0.012,
                "wis115": 0.016,
                "wis118": 0.020,
                "wis119": 0.023,
                "wis120": 0.022,
                "wis85": 0.012,
                "wis91": 0.011,
                "wis98": 0.012,
                "wis99": 0.012,
                "wt271": 0.036,
                "wt273": 0.049,
                "wt274": 0.039,
                "wt275": 0.031,
                "wt277": -0.034,
                "wt279": -0.072,
                "wt280": -0.036
            };
            // id карты в объекте: таблицы per-card (DC_BIAS) ключены
            // строкой «str35», а литералы каталога поля id НЕ имеют.
            // Штамп неперечислимый — JSON/Object.keys/копии его не видят;
            // жетоны (вне каталога) остаются без id → bias-член даст 0.
            // CARDS резолвится мягко: в живой игре каталог всегда стоит
            // раньше aiValue, в статик-чекерах цикл просто ноу-оп
            const __CAT = typeof CARDS !== "undefined" ? CARDS
                : (globalThis.GAME_CARD_DATA && globalThis.GAME_CARD_DATA.CARDS);
            if (__CAT) for (const id in __CAT) {
                const cd = __CAT[id];
                if (cd && cd.id === undefined)
                    Object.defineProperty(cd, "id",
                        { value: id, enumerable: false, configurable: true });
            }
            A.__deckCorr = function __deckCorr(d, side) {
                try {
                    const f = __deckCtx(side);
                    let r = 0;
                    // «Паладин света»-класс: растёт от заклинаний — ценнее
                    // в колоде с обилием заклинаний, без них — дешевле
                    if (d.spellGrow || d.spellBuffAura)
                        r += AI_W.dcSpellSynK * f.spell;
                    // заклинание — топливо каст-синергистов (аколит, портал
                    // призраков), которых в колоде много — ценнее
                    if (d.type === "spell") r += AI_W.dcSpellFuelK * f.syn;
                    // сородичи по подтипу (люди среди людей, скелеты среди
                    // скелетов) — аналогия draftSynergy W141
                    if (d.type === "unit" && d.subtype)
                        r += AI_W.dcSubK * (f.sub[d.subtype] || 0);
                    // мелочь (≤2⚡) держит темп тяжёлой колоды (ось W131)
                    if ((d.cost || 0) <= 2) r += AI_W.dcCheapK * f.heavy;
                    // созвучность способности героя (маппинг W124) —
                    // работает и при synOn=0 (оси независимы)
                    if (AI_W.dcHeroK && f.ab)
                        r += AI_W.dcHeroK * aiHeroSynOf(d, side);
                    return r;
                } catch (e) { return 0; } // B не поднят — как раньше
            };
            // «Сила карты» = базовая оценка + поправка deckCtx (если гейт
            // включён) + персональная bias-поправка карты (данные лиг,
            // W147b; НЕЗАВИСИМА от deckCtxOn — судится своими ключами
            // dcBiasOn/dcBiasK). Все потребители (дерево, сбросы, панели,
            // поиск, оценки чужой руки) голое имя резолвят через with (A) —
            // получают обёртку автоматически
            A.aiCardPower = function aiCardPower(d, side) {
                const s = aiCardPowerRaw(d);
                if (!d) return s;
                let r = 0;
                if (AI_W.deckCtxOn) r += __deckCorr(d, side || "e");
                if (AI_W.dcBiasOn)
                    r += AI_W.dcBiasK * (A.DC_BIAS[d.id] || 0);
                return s + r;
            };
            // ── W143 (юзер: стратегии сброса) ──────────────────────────────
            // Приёмники сброса (терминология W97 — только kind="discard")
            // превращают сброс в выгоду: скинутый «Гаргул» (dstr295)
            // разыгрывается сам, «Мини-портал» (dstr300) выводит скинутый
            // призыв БЕЗ энергии, «Голодный цербер» (dstr294)/«Корм для
            // портала» (dstr293)/«Болотная слизь» (wis116)/«Дурное варево»
            // (dec139)/«Обитаемый могильник» (nec284)/«Каток» (tim236,
            // discardAtk) качаются за каждую карту, способности героя
            // («Коробка игрушек»/«Хозяин той стороны») срабатывают от
            // сброса. Оценки чистые — только чтение боя, без случайностей
            // (парность лиг); вызываются ТОЛЬКО при гейтах dsc*On=1,
            // дефолты 0 держат прежнее поведение бит-в-бит
            // Ценность срабатываний ПРИЁМНИКОВ стороны side на сброс ОДНОЙ
            // карты id (без цены потери руки); единицы — aiVal
            A.aiDiscardRecv = function aiDiscardRecv(side, id, def) {
                if (!B) return 0;
                const us = B.units;
                let r = 0;
                // «Гаргул» на столе: +1/+1 за каждое СБРОШЕННОЕ заклинание
                if (def && def.type === "spell")
                    r += us.filter((v) => v.side === side && v.def.gargoyle
                        && us.includes(v)).length * (AI_W.vAtk + AI_W.vHp);
                // «Голодный цербер»: +1/+1 за каждую карту владельца
                r += us.filter((v) => v.side === side && v.def.hungryCerb
                    && us.includes(v)).length * (AI_W.vAtk + AI_W.vHp);
                // «Болотная слизь»: +1⚔ за ЛЮБУЮ сброшенную карту (обе стороны)
                r += us.filter((v) => v.def.slimeGain && us.includes(v)).length
                    * AI_W.vAtk;
                // «Дурное варево»: 1 урон базе врага владельца за карту
                r += us.filter((v) => v.def.evilBrew && us.includes(v)).length
                    * AI_W.cBase;
                // «Обитаемый могильник»: Призрак 2/1 за карту владельца
                r += us.filter((v) => v.side === side && v.def.graveGhost
                    && us.includes(v)).length * (2 * AI_W.vAtk + AI_W.vHp) * 0.8;
                // «Корм для портала»: «Призыв 3» случайному своему без «Призыва»
                r += us.filter((v) => v.side === side && v.def.portalFeed
                    && us.includes(v)).length * 0.6;
                // «Каток» (discardAtk): урон = длина сброса — карта в сброс
                // это его будущая атака
                r += us.filter((v) => v.side === side && v.def.discardAtk
                    && us.includes(v)).length * AI_W.vAtk * 0.8;
                // «Проклятые артефакты» (dec138): карта сохранена постройкой
                r += us.filter((v) => v.side === side && v.def.relicVault
                    && us.includes(v)).length * 0.25;
                // «Коробка игрушек»: вторая сброшенная за ход карта — добор;
                // «Хозяин той стороны»: тик счётчика «Призыва» за карту
                try {
                    const hd = heroDefOf(side);
                    const was = (B.heroFlags.toyDiscards || { p: 0, e: 0 })[side] || 0;
                    if (hd && hd.ability === "secondDiscardDraw" && was < 2)
                        r += AI_W.cDraw;
                    if (hd && hd.ability === "discardSummonMinus") r += 0.3;
                } catch (e) { /* B не поднят — как раньше */ }
                return r;
            };
            // Полная ценность сброса карты id стороной side: приёмники −
            // цена потери карты из руки. Скинутый «Гаргул» (есть свободная
            // клетка своих рядов) и свой призыв при «Мини-портале» (есть
            // соседняя клетка, жизнь постройки >1) — НЕ потеря, а бесплатный
            // выход на поле (× dscPortalK)
            A.aiDiscardOne = function aiDiscardOne(side, id) {
                const def = CARDS[id];
                if (!def) return -0.5;
                if (!B) return 0;
                if (id === "dstr295" && freeCells(deployRows(side)).length)
                    return AI_W.dscPortalK * aiCardPower(def, side);
                if (def.type === "unit") {
                    const portal = B.units.find((v) => v.side === side
                        && v.def.miniPortal && v.hp > 1 && B.units.includes(v));
                    if (portal && [[1, 0], [-1, 0], [0, 1], [0, -1]].some((d) => {
                        const c = portal.col + d[0], r = portal.row + d[1];
                        return c >= 0 && c < GRID && r >= 0 && r < GRID
                            && !unitAt(c, r);
                    }))
                        return AI_W.dscPortalK * aiCardPower(def, side);
                }
                return aiDiscardRecv(side, id, def) * AI_W.dscRecvK
                    - AI_W.dscKeepK * aiCardPower(def, side);
            };
            // Ожидание для k СЛУЧАЙНЫХ сбросов с руки стороны side («Пытка
            // разума»); recvOnly — только приёмники (оценка сброса В
            // противника: ЕГО приёмники работают против нас)
            A.aiDiscardExp = function aiDiscardExp(side, k, recvOnly) {
                if (!B) return 0;
                const hand = side === "e" ? B.eHand : B.hand;
                if (!hand.length) return 0;
                let s = 0;
                for (const id of hand) {
                    if (recvOnly) s += aiDiscardRecv(side, id, CARDS[id] || {});
                    else s += aiDiscardOne(side, id);
                }
                return s * Math.min(k, hand.length) / hand.length;
            };
            // Средняя сила карты ВРАГА по ВИДИМЫМ колоде+сбросу (рука
            // скрыта — poolOn-видимость W124): оценка снятия карты с его
            // руки. W147: фикс пула — было B.eDeck/B.eDiscard (СВОЯ колода
            // ИИ), враг ИИ — игрок: его видимая карта B.deck/B.discard.
            // Баг не был виден: единственный вызов внутри ветки dscSelfOn
            // (дефолт 0 — не вызывалась). Оценка — с контекстом КОЛОДЫ
            // владельца (side "p", W147 deckCtx)
            A.aiFoeHandAvg = function aiFoeHandAvg() {
                if (!B) return 1;
                const ids = (B.deck || []).concat(B.discard || []);
                let s = 0, n = 0;
                for (const id of ids) {
                    const d = CARDS[id];
                    if (d) { s += aiCardPower(d, "p"); n++; }
                }
                return n ? s / n : 1;
            };
            // Верхние N карт колоды ИИ с исходными индексами (верх — последний).
            // Верхние N карт колоды ИИ с исходными индексами (верх — последний).
            A.aiTopCards = function aiTopCards(n) {
                const k = Math.min(Math.max(0, n | 0), B.eDeck.length);
                const out = [];
                for (let j = B.eDeck.length - k; j < B.eDeck.length; j++)
                    out.push({ id: B.eDeck[j], j });
                return out;
            };
            // «Поиск рун»/«Варка зелий»: из доступных заклинаний — лучшее по
            // силе, с бонусом за играбельность прямо сейчас.
        }
    };
})();
