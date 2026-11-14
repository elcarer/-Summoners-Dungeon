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
            A.AI_W_BASE = {
                // экономика полухода (aiPlay)
                refillMin: 5,        // добор «в тупике» от этой энергии
                refillTries: 2,      // попыток добора за полуход
                refillCards: 2,      // карт за попытку
                deadSwapIncK: 2,     // «безнадёжная»: дороже энергии + K×дохода
                deadSwapHold: 3,     // «застрявшая»: гейт не пускает N полуходов
                drawTo: 3,           // короткая рука добирается до
                drawPlayable: 4,     // …и по числу разыгрываемых на след. ману
                drawFullMana: 12,    // мана след. хода ≥ — рука до 7
                drawAllEnergy: 20,   // энергия ≥ — вся шкала только в карты
                // ценность своего существа (aiVal) — тюнинг W110 (фитнес 2.5)
                vAtk: 1.1, vHp: 1, vBld: 0.467, vCrush: 0.948, vThicket: 0.903,
                vAura: 1.4, vEngine: 0.8, vBuffEcho: 1.119, vMedic: 1.3,
                vUndying: 2, vTradeDraw: 1,
                // угроза чужого (aiThreat)
                tAtk: 1.25, tHp: 0.6, tCrush: 1.4, tThicket: 1.404, tAura: 1.227,
                tDangerBld: 3.2, tBldMult: 0.8,
                runMinAtk: 10,       // разгоны: атака от…
                runGap: 6,           // …и выше печатной на
                runMult: 2,        // …угроза УМНОЖАЕТСЯ
                // клетки призыва (aiSpotScore)
                sFrontRow: 2, sColFree: 1.5, sOwnAhead: 0.9,
                sSupportBack: 2.284, sGap: 1.5, sDashKill: 3.315,
                sKillThreatK: 0.341, sNearKill: 5.651, sCowardAhead: 2.5,
                sMarkBlock: 3.63,
            };
            A.AI_W = Object.assign({}, A.AI_W_BASE,
                globalThis.AI_W_OVERRIDE || {});
            const AI_W = A.AI_W;
            // ── План добора ИИ по шкале конца хода (мягкое правило — просил юзер).
            // Короткая рука добирается до 4; с 4-го хода ИИ считает по стоимостям
            // карты руки, сколько реально разыграет на следующую ману (запас +
            // доход) — меньше четырёх разыгрываемых, добор до четырёх. Если на
            // следующий ход у него будет 12+ маны — рука добивается до 7; при
            // 20+ маны вся шкала идёт только в карты. Энергия не уходит в минус,
            // до 4-го хода накопления в добор не конвертируются.
            A.enemyDrawPlan = function enemyDrawPlan() {
                const total = spheresTotal();
                const nextMana = B.eEnergy + total; // мана следующего хода
                let eCards = 0;
                if (B.eHand.length < AI_W.drawTo)
                    eCards = AI_W.drawTo - B.eHand.length;
                if (B.turnNo >= 4) {
                    const costs = B.eHand.map((c) => effCost(c, "e")).sort((a, b) => a - b);
                    let mana = nextMana, playable = 0;
                    for (const c of costs) { if (c <= mana) { mana -= c; playable++; } else break; }
                    if (playable < AI_W.drawPlayable)
                        eCards = Math.max(eCards, AI_W.drawPlayable - playable);
                }
                if (nextMana >= AI_W.drawFullMana)
                    eCards = Math.max(eCards, HAND_MAX - B.eHand.length);
                if (B.eEnergy >= AI_W.drawAllEnergy)
                    eCards = HAND_MAX - B.eHand.length; // только карты
                // W105 (юзер): спец-добор «шестерён» под тройку УБРАН —
                // стратегия сменена: тяжёлые «Сдвиги» выходят сразу
                // (2–3-й ход, они ждут на клетках и не занимают стол),
                // одновременного прихода добиваются «Экспериментами»,
                // а не удержанием карт; план добора обычный
                return Math.max(0, Math.min(eCards,
                    HAND_MAX - B.eHand.length,
                    B.turnNo >= 4 ? total + B.eEnergy : total));
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
                let v = (u.curAtk || 0) * AI_W.vAtk + (u.hp || 0) * AI_W.vHp;
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
                let s = (u.curAtk || 0) * AI_W.tAtk + (u.hp || 0) * AI_W.tHp;
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
                if (d.type === "building") {
                    s *= AI_W.tBldMult; // здание не марширует
                    // W104 (юзер): опасная постройка — приоритетная цель
                    // («Дурное варево» и пр.) — поломать связку
                    s += AI_W.tDangerBld * aiDangerBld(d);
                }
                // W110 (юзер): детектор разгонов — существо, чья атака ушла
                // далеко выше печатной (медик-петли hon195: лига 20261115
                // видела базы −1736♥), — приоритетная цель: угроза
                // УМНОЖАЕТСЯ, чтобы контроль и удаление выбирали его первым
                if ((u.curAtk || 0) >= AI_W.runMinAtk
                    && (u.curAtk || 0) - (d.atk || 0) >= AI_W.runGap)
                    s *= AI_W.runMult;
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
                    if (s.phoenix
                        && B.units.filter((v) => v.def.type === "building").length >= 3)
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
                if (row === frontRow) score += AI_W.sFrontRow;
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
                    if (t && t.side === "e") score -= 2.6;
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
                    && !dash) score += AI_W.sGap;
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
                        score += (role === "wall" ? 0.5 : 0.15)
                            + Math.min(4, incoming) * 0.22; // тело/задержка
                        score += Math.min(2.2, aiThreat(ahead) * 0.18);
                        if (survives) score += role === "wall" ? 0.6 : 0.2;
                        else if ((def.cost || 0) >= 4) score -= 1.2; // дорогого зря теряем
                        if (role === "wall") score += 0.8;
                    }
                    if (survives && ahead.def.type === "unit" && atk >= ahead.hp) {
                        score += (role === "wall" ? 1.6 : 1.0)
                            + aiThreat(ahead) * AI_W.sKillThreatK; // убьём в ответ
                    } else if (survives && atk > 0) {
                        score += 0.2 * Math.min(atk, ahead.hp);
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
                    if (near.row <= 2) score += (3 - near.row) * 0.5
                        + Math.min(1.5, aiThreat(near) * 0.12);
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
                    && v.col === col && v.row > row)) score -= 2.2;
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
            A.aiCardPower = function aiCardPower(d) {
                if (!d) return 0;
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
                    return s;
                }
                if (d.type === "building") {
                    return 1.5 + (d.hp || 0) * 0.4
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
                    return v;
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
                    return v;
                }
                return 1;
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
