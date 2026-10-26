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
                if (B.eHand.length < 4) eCards = 4 - B.eHand.length;
                if (B.turnNo >= 4) {
                    const costs = B.eHand.map((c) => effCost(c, "e")).sort((a, b) => a - b);
                    let mana = nextMana, playable = 0;
                    for (const c of costs) { if (c <= mana) { mana -= c; playable++; } else break; }
                    if (playable < 4) eCards = Math.max(eCards, 4 - playable);
                }
                if (nextMana >= 12) eCards = Math.max(eCards, HAND_MAX - B.eHand.length);
                if (B.eEnergy >= 20) eCards = HAND_MAX - B.eHand.length; // только карты
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
                let v = (u.curAtk || 0) * 1.1 + (u.hp || 0);
                if (d.type === "building") v += 0.5; // стоит, клетку держит
                if (d.crush) v += 0.8;
                if (d.thicket) v += 0.8;
                if (d.ability === "archer") v += 0.4;
                if (d.ability === "assassin") v += 0.4;
                if (d.ability === "pushBack") v += 0.3;
                if (d.frostNeighbors) v += 0.6; // «Старший ледовик»: лёд своим бокам
                if (d.trapOnMove) v += 0.3; // «Выросшие духи»: ловушка с руки
                if (d.leaderAura || d.plantEcho || d.druidEnergy
                    || d.sisterDraw || d.spellAura || d.campAura) v += 0.8;
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
            // Опасность ЧУЖОГО (игрока) существа для нашей базы/поля. Нужна
            // для выбора цели заклинания и оценки «кого выгодно добить».
            // Опасность ЧУЖОГО (игрока) существа для нашей базы/поля. Нужна
            // для выбора цели заклинания и оценки «кого выгодно добить».
            A.aiThreat = function aiThreat(u) {
                if (!u || !u.def) return 0;
                const d = u.def;
                let s = (u.curAtk || 0) * 1.25 + (u.hp || 0) * 0.6;
                if (d.crush) s += 1.4;
                if (d.thicket) s += 1.4;
                if (d.ability === "archer") s += 0.9;
                if (d.ability === "assassin") s += 0.8;
                if (d.ability === "pushBack") s += 0.6;
                if (unitHasFly(u)) s += 0.5;
                if (d.ability === "dash1") s += 0.4;
                if (d.frostNeighbors) s += 0.8;
                if (d.leaderAura || d.plantEcho || d.druidEnergy || d.sisterDraw
                    || d.spellAura || d.campAura || d.monolith) s += 0.9;
                if (d.altarSword) s += 0.7;
                if (d.starTower) s += 0.8;
                if (d.cloudSpire) s += 1.4;
                if (d.waterMage) s += 0.5;
                if (d.stormer) s += 0.7;
                if (d.lakeMaid) s += 0.3;
                if (u.venom) s += 0.8;
                if (u.enchantFire) s += 0.8;
                if (u.berserk) s += 0.5 * u.berserk;
                if (d.type === "building") s *= 0.8; // здание не марширует
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
                    || def.sisterDraw || def.spellBuffAura) return "support";
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
                    // разыгрывается первым, чтобы хватило и на остальные карты
                    if (s.energyPerHand || s.energyPerTrap) return 1;
                    if (s.firewall || s.aoeDmg || s.dmg || s.drainAll || s.baseDmg
                        || s.sacrifice || s.copyLast || s.stormAll
                        || s.purge || s.stealEnergy || s.fireflies
                        || s.growthHand || s.nova || s.debuffEnemyAtkAll
                        || s.mindTorture || s.iceStrike) return 2;
                    if (s.buffAtk || s.buffAtkByHp || s.berserk || s.buffAllAtk
                        || s.enchantFire || s.cocoon || s.venom) return 4;
                    if (s.baseHit || s.wolfVolley) return 4.5; // бьёт СВОИМ существом
                    if (s.iceSwarm || s.skeletonCrowd) return 3; // тела — как обычный призыв
                    return 6; // поиск рун / гадание / поиск знаний / глубокое путешествие
                }
                // «Три монолита» — без спешки (просил юзер: не в приоритете):
                // движок добора, играется, когда важное уже разыграно
                if (def.type === "building") return def.monolith ? 5.5 : 1;
                if (def.type === "trap") {
                    // «Отмена заклинания»/«Отмена призыва» (wis83/wis84) и
                    // «Отражение» (wis120): реактивные ловушки — чем раньше
                    // висят, тем больше шансов поймать розыгрыш (контроль)
                    return def.trap.effect === "counterSpell"
                        || def.trap.effect === "counterSummon"
                        || def.trap.effect === "counterBuilding"
                        || def.trap.effect === "reflectSpell" ? 1.2 : 5;
                }
                // вождь / заклинатель клинков / пастух / друид / сестра — двигатели
                // связок: ставим до существ, чьи способности они усилят/оплатят
                if (def.leaderAura || def.spellBuffAura || def.plantEcho
                    || def.druidEnergy || def.sisterDraw) return 1;
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
                if (row === frontRow) score += 2;
                if (!B.units.some((o) => o.side === "e" && o.col === col)) score += 1.5;
                // затор: свои впереди в той же колонке не дают пройти
                const ownAhead = B.units.filter((o) => o.side === "e"
                    && o.col === col && o.row > row).length;
                if (ownAhead) score -= 0.9 * ownAhead;
                // поддержка — в тыл, если тыл вообще есть
                if (role === "support" && rows.length > 1) {
                    if (row === frontRow) score -= 2.2;
                    else if (row === rows[0]) score += 0.8;
                }
                score += aiSummonAuraScore(def, col, row);
                const ahead = unitAt(col, row + 1);
                const atk = def.atk || 0;
                // собственные способности призыва/марша
                if (def.ability === "dash1") {
                    if (ahead && ahead.side === "p" && ahead.def.type === "unit" && atk >= ahead.hp)
                        score += 2.6 + aiThreat(ahead) * 0.35;
                    else if (ahead && ahead.side === "p") score += 0.9;
                    else if (!ahead) score += 0.7; // сразу шагнёт вперёд
                }
                if (def.ability === "archer") {
                    const t = aiNearestInCol("e", col, row);
                    if (t && t.side === "p") score += 0.8; // есть куда стрелять
                    else if (!t) score += 0.5; // колонка пуста — выстрел в базу
                }
                if (def.ability === "assassin") {
                    if (B.units.some((v) => v.side === "p" && v.col === col && v.row > row
                        && v.def.type === "unit" && v.hp === 1)) score += 1.8;
                    if (ahead && ahead.side === "p" && ahead.def.type === "unit"
                        && ahead.hp - atk === 1) score += 1.0;
                }
                if (unitHasFly({ def, side: "e" }) && ahead && ahead.side === "p"
                    && ahead.def.type === "unit") {
                    if (row + 2 < GRID && !unitAt(col, row + 2)) score += 1.0;
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
                // бой в клетке: игрок ходит первым — наш новичок сначала получает
                if (ahead && ahead.side === "p") {
                    const incoming = ahead.def.type === "unit" ? ahead.curAtk : 0;
                    const survives = (def.hp || 0) > incoming;
                    if (incoming) {
                        score += 0.5 + Math.min(4, incoming) * 0.22; // тело/задержка
                        score += Math.min(2.2, aiThreat(ahead) * 0.18);
                        if (survives) score += 0.6;
                        else if ((def.cost || 0) >= 4) score -= 1.2; // дорогого зря теряем
                        if (role === "wall") score += 0.8;
                    }
                    if (survives && ahead.def.type === "unit" && atk >= ahead.hp) {
                        score += 1.6 + aiThreat(ahead) * 0.35; // убьём в ответ
                    } else if (survives && atk > 0) {
                        score += 0.2 * Math.min(atk, ahead.hp);
                    }
                    if (ahead.def.type === "building") { // строения не бьют в ответ
                        score += 0.8 + ((ahead.def.spellAura || ahead.def.campAura
                            || ahead.def.monolith || ahead.def.treeHomes
                            || ahead.def.groveAura) ? 1.2 : 0);
                    }
                }
                // трус — стеной прямо перед существом игрока (его следующий шаг)
                if (def.ability === "coward" && ahead && ahead.side === "p") score += 2.5;
                // защита колонки, где игрок уже близко к нашей базе
                const near = B.units.filter((v) => v.side === "p" && v.col === col)
                    .sort((a, b) => a.row - b.row)[0];
                if (near) {
                    if (near.row <= 2) score += (3 - near.row) * 0.5
                        + Math.min(1.5, aiThreat(near) * 0.12);
                    if (near.row - 1 === row) score += 0.6; // прямо на его пути
                }
                // открытая колонка к базе игрока — давление
                const foesAhead = B.units.some((v) => v.side === "p"
                    && v.col === col && v.row > row);
                if (!foesAhead) score += 0.5 + (row === frontRow ? 0.4 : 0);
                return score;
            };
            // Клетка призыва существа ИИ: раньше — передний ряд/колонка без своих,
            // теперь ещё ауры соседства и оценка боя. Возвращает лучшую клетку;
            // равные варианты перемешиваются, чтобы бои не были клонами.
            // Клетка призыва существа ИИ: раньше — передний ряд/колонка без своих,
            // теперь ещё ауры соседства и оценка боя. Возвращает лучшую клетку;
            // равные варианты перемешиваются, чтобы бои не были клонами.
            A.aiUnitSpot = function aiUnitSpot(def) {
                const rows = deployRows("e");
                let free = freeCells(rows);
                if (!free.length) return null;
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
                if (def.campAura || def.campfire || def.sprout || def.groveAura
                    || def.monolith || def.elementalCircle || def.altarSword) {
                    let best = [], bestScore = -Infinity;
                    for (const [c, r] of free) {
                        const score = aiBuildingSpotScore(def, c, r, free);
                        if (score > bestScore + 1e-9) { bestScore = score; best = [[c, r]]; }
                        else if (Math.abs(score - bestScore) < 1e-9) best.push([c, r]);
                    }
                    return best[(Math.random() * best.length) | 0];
                }
                const back = free.filter(([, r]) => r === rows[0]);
                const pool = back.length ? back : free;
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
                    if (d.stormer) s += 0.9;
                    if (d.lakeMaid) s += 0.7;
                    if (d.sandDecay) s -= 1.0; // 9/9 за 7⚡, но тает каждый ход
                    if (d.ability === "archer" || d.ability === "assassin") s += 0.3;
                    // «Скелет-лучник» (dec135): «Выстрел 2» дороже обычного
                    if (d.ability === "archer") s += ((d.shotDmg || 1) - 1) * 0.55;
                    if (d.ability === "dash1") s += 0.2;
                    if (d.lichRaise) s += 1.0; // dec131: Призрак 2/1 за каждое убийство
                    if (d.vampHeal) s += 0.5; // dec132: отхил после каждой атаки
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
                        + (d.relicVault ? 1.3 : 0) // dec138: копит сбросы
                        + (d.evilBrew ? 1.6 : 0) // dec139: давит базу всяким сбросом
                        + (d.boneField ? 1.6 : 0) // dec141: скелет каждый ход
                        + (d.bonePile ? 1.4 : 0); // dec143: «Выкапливание» каждому призыву рядом
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
                    if (s.debuffEnemyAtkAll) v += 0.7 + Math.min(4, B.units.filter(
                        (u) => u.side === "p" && u.def.type === "unit" && u.curAtk > 0).length) * 0.25;
                    if (s.search || s.searchUnit || s.journey || s.discardPick) v += 0.5;
                    if (s.seek) v += 0.6 + Math.min(4, B ? B.eDeck.length : 0) * 0.05;
                    if (s.grim) v += 0.5 + Math.min(4, B ? B.eDeck.length : 0) * 0.05;
                    if (s.copyLast) v += 1.0;
                    if (s.wolfVolley) v += 2.0;
                    if (s.baseHit) v += 1.6;
                    if (s.exhumingMark) v += 1.1; // dec137: вторая жизнь существу
                    if (s.freeze) v += 1.0;
                    if (s.iceStrike) v += 2.0;
                    if (s.hydroPunch) v += 1.2; // урон 1 + полезный сдвиг назад
                    if (s.iceSwarm) v += Math.min(5, s.iceSwarm) * 0.55; // 5 тел 1/1
                    if (s.skeletonCrowd) v += 3 * 0.65; // dec140: три Скелета 1/2
                    if (s.forbidden) v += 2.0
                        + Math.min(3, B ? B.eDeck.length : 0) * 0.1; // dec130: 3 карты
                    if (s.discardHandDraw) v += 1.0
                        + 0.35 * Math.min(6, B.hand.length)
                        - 0.3 * Math.min(6, B.eHand.length);
                    return v;
                }
                if (d.type === "trap") {
                    let v = 2.0 + (d.cost || 0) * 0.2;
                    // «Тёмные цепи»: ценнее, когда на поле уже есть свои
                    // существа — их атака и есть урон ловушки
                    if (d.trap.effect === "alliesStrike" && B)
                        v += Math.min(4, B.units.filter((u) =>
                            u.side === "e" && u.def.type === "unit").length) * 0.4;
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
