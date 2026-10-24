// СЦЕНА «АРЕНА»: ИИ противника: план добора, заклинания, ход.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
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
(function () {
    globalThis.GAME_ARENA.installAI = function installAI(A) {
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

            A.enemyTurn = async function enemyTurn() {
                B.phase = "enemy";
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
                firewallTick("p"); // стена костров игрока — конец хода игрока
                sproutTick("p");   // ростки игрока подросли — конец его хода
                if (B.stopped || B.phase === "over") return;
                banner(t("arena.enemyTurn"));
                fxEvent("turn", { side: "e", color: 0xff8a5e });
                await delay(0.5 / animK());
                if (B.stopped) return;
                upkeep("e"); // грибницы врага
                riteStumpTick("e"); // пень обряда врага подсмотрел и решил
                poisonTick("e"); // яд: до марша (просил юзер)
                await marchSide("e");
                if (B.stopped || B.phase === "over") return;
                await aiPlay();
                if (B.stopped || B.phase === "over") return;
                // шкала врага — мягкое правило добора (просил юзер), см. enemyDrawPlan
                const eCards = enemyDrawPlan();
                drawEnemy(eCards);
                B.eEnergy += spheresTotal() - eCards;
                refreshHud();
                await delay(0.25 / animK());
                if (B.stopped) return;
                await playerTurnStart();
            };

            // ── Карта, разыгранная врагом (просил юзер): лицом на свободном
            // месте слева от поля, со свечением по краю; между розыгрышами врага
            // пауза ≥ 1 реальной секунды, и всё это время карта видна — игрок
            // понимает, что делает противник.
            A.enemyCard = null; // { id, node }
            A.showEnemyCard = function showEnemyCard(cardId) {
                hideEnemyCard();
                const node = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.75 });
                node.eventMode = "none";
                node.position.set(430, 420);
                // свечение по ФАКТИЧЕСКОЙ кромке карты (просил юзер): жёсткая
                // рамка с чужими размерами сидела криво — слои от широкого
                // тусклого к узкому яркому поверх bounds лица карты
                const b = node.getLocalBounds();
                const frame = new PIXI.Graphics();
                for (const [w, a] of [[30, 0.08], [18, 0.16], [10, 0.3], [4.5, 0.95]])
                    frame.roundRect(b.x, b.y, b.width, b.height, 16)
                        .stroke({ width: w, color: 0xff5a36, alpha: a });
                frame.name = "glowFrame";
                frame.eventMode = "none";
                node.addChild(frame);
                root.addChild(node);
                enemyCard = { id: cardId, node };
            };
            A.hideEnemyCard = function hideEnemyCard() {
                if (!enemyCard) return;
                enemyCard.node.destroy({ children: true });
                enemyCard = null;
            };
            // Рубашка колоды врага по стихии боя: враги Роста — природная
            // рубашка (card_nature_back), прочие (гоблины, драфт Силы) — гоблинская
            A.enemyBackTex = function enemyBackTex() {
                const enc = ENCOUNTERS[B.encId];
                const cave = G.dungeon && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                const elem = (enc && enc.elem) || (cave && cave.elem);
                return globalThis.GAME_UI.backTexOf(elem);
            };
            // Рубашка колоды и сброса ИГРОКА — по его стихии забега (просил
            // юзер): у Горбага и прочих героев Силы — гоблинская, у героев
            // Роста — природная
            A.playerBackTex = function playerBackTex() {
                return globalThis.GAME_UI.backTexOf(G.elem);
            };
            // Ловушка врага — РУБАШКОЙ (просил юзер): игрок видит, что противник
            // сыграл карту, но какая именно ловушка — неизвестно; на поле встанет
            // безликий «?» (рубашка колоды — та же, что у колоды врага)
            A.showEnemyBack = function showEnemyBack() {
                hideEnemyCard();
                const node = new PIXI.Sprite(uiTex(enemyBackTex()));
                node.scale.set(0.75);
                node.eventMode = "none";
                node.position.set(430, 420);
                const b = node.getLocalBounds();
                const frame = new PIXI.Graphics();
                for (const [w, a] of [[30, 0.08], [18, 0.16], [10, 0.3], [4.5, 0.95]])
                    frame.roundRect(b.x, b.y, b.width, b.height, 16)
                        .stroke({ width: w, color: 0xff5a36, alpha: a });
                frame.name = "glowFrame";
                frame.eventMode = "none";
                node.addChild(frame);
                root.addChild(node);
                enemyCard = { id: null, node };
            };
            // пауза между розыгрышами (она же — сколько видна карта врага):
            // минимум 1.5 секунды — на 0.5 дольше прежнего, успеть разглядеть
            // (просил юзер); при замедленных анимациях — ещё дольше
            A.enemyPlayDelay = () => Math.max(1.5, 1.5 / animK());

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
                return v;
            };
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
                        || s.sacrifice || s.copyLast
                        || s.purge || s.stealEnergy || s.fireflies
                        || s.growthHand || s.nova || s.debuffEnemyAtkAll
                        || s.iceStrike) return 2;
                    if (s.buffAtk || s.buffAtkByHp || s.berserk || s.buffAllAtk
                        || s.enchantFire || s.cocoon || s.venom) return 4;
                    if (s.baseHit || s.wolfVolley) return 4.5; // бьёт СВОИМ существом
                    if (s.iceSwarm) return 3; // тела — как обычный призыв
                    return 6; // поиск рун / гадание / поиск знаний / глубокое путешествие
                }
                // «Три монолита» — без спешки (просил юзер: не в приоритете):
                // движок добора, играется, когда важное уже разыграно
                if (def.type === "building") return def.monolith ? 5.5 : 1;
                if (def.type === "trap") {
                    // «Отмена заклинания»/«Отмена призыва» (wis83/wis84):
                    // реактивные ловушки — чем раньше висят, тем больше шансов
                    // поймать розыгрыш (просил юзер: контроль)
                    return def.trap.effect === "counterSpell"
                        || def.trap.effect === "counterSummon" ? 1.2 : 5;
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
            A.aiUnitSpot = function aiUnitSpot(def) {
                const rows = deployRows("e");
                const free = freeCells(rows);
                if (!free.length) return null;
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
            A.aiSacrificePick = function aiSacrificePick() {
                const dmg = CARDS.str11.spell.dmg;
                let best = null, bestScore = 0;
                for (const u of spellTargets(B.units)) {
                    if (u.side !== "e" || u.def.type !== "unit") continue;
                    const victims = B.units.filter((v) => v.side === "p"
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1
                        && v.hp <= dmg);
                    const ownColl = B.units.filter((v) => v.side === "e" && v !== u
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1
                        && v.hp <= dmg);
                    // считаем не число голов, а их опасность; своё — по цене
                    const killScore = victims.reduce((s, v) => s + aiThreat(v), 0);
                    const lossScore = ownColl.reduce((s, v) => s + aiOwnValue(v), 0);
                    const score = victims.length * 1.8 + killScore * 0.8
                        - aiOwnValue(u) * 0.5 - lossScore * 0.8;
                    if (victims.length >= 1 && score > bestScore) { best = u; bestScore = score; }
                }
                return best;
            };
            // «Круговая атака» (grw34) бьёт ВСЕХ соседей цели — и чужих, и
            // своих. Выбираем своё существо, у которого чужих соседей больше
            // и они опаснее; если выгоднее своих — заклинание не играем.
            A.aiNovaPick = function aiNovaPick() {
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"));
                let best = null, bestScore = 0;
                for (const v of own) {
                    let score = 0, foes = 0;
                    for (const o of B.units) {
                        if (o === v) continue;
                        if (Math.abs(o.col - v.col) + Math.abs(o.row - v.row) !== 1) continue;
                        if (o.side === "p") {
                            foes++;
                            score += o.hp <= 1 ? aiThreat(o) + 1 : 0.8;
                        } else {
                            score -= o.hp <= 1 ? aiVal(o) + 1 : 0.8;
                        }
                    }
                    if (foes && score > bestScore) { best = v; bestScore = score; }
                }
                return best;
            };
            // «Атака духами волков» (grw33): выстрел идёт по СВОЕЙ колонке и
            // бьёт ЛЮБОЕ первое существо — в том числе своё. Выбираем стрелка,
            // у которого впереди нет своих: лучше всего — чистая колонка до
            // базы игрока (урон в базу + волки на всём пути) или убийство.
            A.aiWolfPick = function aiWolfPick() {
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"));
                let best = null, bestScore = -Infinity;
                for (const u of own) {
                    let hit = null;
                    const path = [];
                    for (let r = u.row + 1; r < GRID; r++) {
                        const o = unitAt(u.col, r);
                        if (o) { hit = o; break; }
                        path.push(r);
                    }
                    let score = 0;
                    if (!hit) {
                        score = u.curAtk * 1.4 + path.length * 0.8;
                        if (u.curAtk >= B.playerBase) score += 10; // летал в базу
                    } else if (hit.side === "p") {
                        score = Math.min(u.curAtk, hit.hp) * 0.9 + path.length * 0.6;
                        if (u.curAtk >= hit.hp) score += 4 + aiThreat(hit) * 0.4;
                        if (hit.def.type === "building") score += 0.8;
                    } else {
                        score = -20; // свой на линии — не стреляем сюда
                    }
                    if (u.curAtk <= 0) score -= 2;
                    if (score > bestScore) { bestScore = score; best = u; }
                }
                return bestScore > 0 ? best : null;
            };
            // Есть ли летал «Атакой духами волков»: чистая колонка до базы,
            // урон стрелка покрывает остаток базы. Нужен, чтобы ИИ не тратил
            // ману на другие карты, когда выстрел уже добивает.
            A.aiWolfLethal = function aiWolfLethal() {
                const u = aiWolfPick();
                if (!u || u.curAtk < B.playerBase) return false;
                for (let r = u.row + 1; r < GRID; r++) if (unitAt(u.col, r)) return false;
                return true;
            };
            // Цель усиления: не «самый сильный», а тот, кто успеет реализовать
            // бафф — ближе к базе игрока, выживет и ударит; для «Природной мощи»
            // — самый живучий, для «Огненного дыхания» — крепкий атакующий.
            A.aiBuffPick = function aiBuffPick(def) {
                const s = def.spell;
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"
                    && (!s.enchantFire || !v.enchantFire)));
                if (!own.length) return null;
                let best = null, bestScore = -Infinity;
                for (const v of own) {
                    const rowBonus = v.row * 0.2;
                    let score = 0;
                    if (s.buffAtk) {
                        score = (v.curAtk + s.buffAtk) * 1.25 + v.hp * 0.35
                            + (s.buffHp || 0) * 0.3 + rowBonus;
                        if (v.row >= GRID - 1 && v.curAtk + s.buffAtk >= B.playerBase) score += 8;
                    } else if (s.buffAtkByHp) {
                        score = v.hp * 1.4 + v.curAtk * 0.5 + rowBonus;
                    } else if (s.berserk) {
                        score = v.curAtk * 1.3 + v.hp * 0.7 + rowBonus;
                        if (v.curAtk >= 3) score += 0.8;
                        if (v.hp >= 3) score += 0.8;
                    } else if (s.venom) {
                        score = v.curAtk * 0.9 + v.hp * 1.0 + rowBonus;
                        if (v.def.speed > 1) score += 1;
                        if (v.berserk) score += 1;
                        if (v.venom) score += 0.5; // яд складывается
                    } else if (s.enchantFire) {
                        score = v.curAtk * 1.1 + v.hp * 0.8 + rowBonus;
                    } else {
                        score = v.curAtk * 1.2 + v.hp * 0.4 + rowBonus;
                    }
                    if (v.def.leaderAura || v.def.plantEcho || v.def.druidEnergy
                        || v.def.sisterDraw) score -= 0.4;
                    if (score > bestScore) { bestScore = score; best = v; }
                }
                return best;
            };
            // «Защитный кокон» — на своего под удар игрока (игрок ходит первым):
            // ценнее всего существо, которое вот-вот умрёт/движок.
            A.aiCocoonPick = function aiCocoonPick() {
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"));
                let best = null, bestScore = -Infinity;
                for (const v of own) {
                    const att = unitAt(v.col, v.row + 1);
                    const incoming = att && att.side === "p" && att.def.type === "unit"
                        ? att.curAtk : 0;
                    let score = aiOwnValue(v) + incoming * 0.8;
                    if (incoming) score += 2.5; // кокон на того, кого реально бьют
                    else score -= 2;
                    if (incoming && v.hp <= incoming) score += 2;
                    if (score > bestScore) { bestScore = score; best = v; }
                }
                return best;
            };
            // Точный урон заклинания по конкретной цели (для выбора цели).
            // consume=false — прикидка: способность «первое уронное» не тратится.
            A.aiDmgFor = function aiDmgFor(def, target, free = false, consume = false) {
                const s = def.spell;
                if (s.drainAll) {
                    const id = cardIdOf(def);
                    const cost = free ? 0 : effCost(id, "e", { col: target.col, row: target.row });
                    return Math.max(0, B.eEnergy - cost) + altarBonus("e")
                        + heroSpellBonus(def, "e", target.def.type === "unit", consume);
                }
                return spellHitDmg(def, "e", target.def.type === "unit", consume);
            };
            A.aiDmgTargets = function aiDmgTargets(def) {
                const s = def.spell;
                // «Защита от заклинаний» — общий фильтр целей (spellTargets)
                return spellTargets(B.units.filter((v) => v.side === "p"
                    && (v.def.type === "unit"
                        || (v.def.type === "building" && !s.noBuildings))));
            };
            // Выбор цели урона: добивание важнее «поцарапать» крупного;
            // иначе — максимум пользы на единицу урона (угроза × доля жизней),
            // плюс приоритет движкам игрока. Летал по базе проверяется отдельно.
            A.aiDmgTargetPick = function aiDmgTargetPick(def, targets, free = false) {
                let best = null, bestScore = -Infinity;
                for (const v of targets) {
                    const dmg = aiDmgFor(def, v, free, false);
                    if (dmg <= 0) continue;
                    const pos = (GRID - 1 - v.row) * 0.35; // ближе к нашей базе — опаснее
                    let score;
                    if (v.hp <= dmg) {
                        score = 14 + aiThreat(v) * 1.1 + pos
                            - Math.max(0, dmg - v.hp) * 0.15;
                    } else {
                        score = (dmg / Math.max(1, v.hp)) * (aiThreat(v) * 0.9 + pos)
                            + dmg * 0.35 + (v.hp - dmg <= 2 ? 1.2 : 0);
                    }
                    if (v.def.type === "building") {
                        score *= 0.85;
                        if (v.def.spellAura || v.def.campAura || v.def.treeHomes
                            || v.def.monolith || v.def.groveAura || v.def.mycelium
                            || v.def.sprout) score += 2;
                    }
                    if (score > bestScore) { bestScore = score; best = v; }
                }
                return best;
            };
            // Оценка клетки ловушки: на пути самого опасного существа игрока;
            // мина любит скопления (сплэш по соседям жертвы), приманка — соседство
            // с сильными, опутывание — сильнейшего.
            A.aiTrapScore = function aiTrapScore(def, col, row) {
                const tr = def.trap;
                let score = 0;
                const victim = B.units.find((v) => v.side === "p"
                    && v.col === col && v.row === row + 1);
                if (victim) score += aiThreat(victim) * 0.8;
                if (tr.effect === "cellDmg" || tr.effect === "cellDmgAll") {
                    if (victim) {
                        if (victim.def.type === "unit") {
                            const crowd = B.units.filter((o) => o.side === "p" && o !== victim
                                && Math.abs(o.col - victim.col) + Math.abs(o.row - victim.row) === 1).length;
                            score += crowd * (tr.splash || 0) * 0.6;
                        }
                        if (victim.hp <= (tr.amount || 0) + altarBonus("e")) score += 1.5;
                    }
                } else if (tr.effect === "confuse" || tr.effect === "entangle") {
                    if (victim) score += aiThreat(victim) * 1.0 + victim.curAtk * 0.2;
                } else if (tr.effect === "freezeSplash") {
                    // «Ледяные кандалы»: жертва + её соседи-существа (обе
                    // стороны) пропускают марш; своих соседей — минус
                    if (victim) {
                        score += aiThreat(victim) * 0.9;
                        const near = B.units.filter((o) => o !== victim && o.def.type === "unit"
                            && Math.abs(o.col - victim.col) + Math.abs(o.row - victim.row) === 1);
                        for (const o of near)
                            score += (o.side === "p" ? aiThreat(o) * 0.7 : -aiThreat(o) * 1.1);
                    }
                } else if (tr.effect === "rowShift") {
                    // «Снежный ком»: сдвиг и 2 урона ВСЕМУ вертикальному ряду;
                    // своих в ряду — минус (здоровые бьют по нам же)
                    const dmg = (tr.amount || 2) + altarBonus("e");
                    for (const v of B.units) {
                        if (v.col !== col || v.def.type !== "unit") continue;
                        score += v.side === "p" ? aiThreat(v) * 0.55 : -(v.hp <= dmg
                            ? 9 : aiThreat(v) * 0.8);
                    }
                } else if (tr.effect === "lure") {
                    for (const v of B.units) if (v.side === "p"
                        && Math.abs(v.col - col) + Math.abs(v.row - row) === 1)
                        score += aiThreat(v) * 0.3;
                } else if (tr.effect === "ambush" || tr.effect === "ancestor") {
                    if (victim) score += aiThreat(victim) * 0.4;
                }
                return score;
            };
            // Выбор клетки ловушки (вынесено из aiPlay, чтобы правило было одно
            // и проверялось пробой): путь марша сильнейшего, безопасность мины
            // для своих, приманка — к сильным.
            A.aiTrapSpot = function aiTrapSpot(def) {
                const freeAt = (cc, r2) => !unitAt(cc, r2)
                    && !B.traps.e.some((t) => t.col === cc && t.row === r2);
                const front = [], spots = [];
                const seenF = new Set();
                for (const v of B.units) {
                    if (v.side !== "p" || v.row - 1 < 0) continue;
                    const key = `${v.col}:${v.row - 1}`;
                    if (seenF.has(key) || !freeAt(v.col, v.row - 1)) continue;
                    seenF.add(key);
                    front.push([v.col, v.row - 1]);
                }
                for (const r of [4, 3, 2]) for (let cc = 0; cc < GRID; cc++) {
                    if (freeAt(cc, r)) spots.push([cc, r]);
                }
                if (!front.length && !spots.length) return null;
                let pool;
                if (front.length) pool = front;
                else if (def.trap.effect === "lure") {
                    const near = spots.filter(([c2, r2]) => B.units.some((v) =>
                        v.side === "p" && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                    pool = near.length ? near : spots;
                } else pool = spots;
                // «Путь грибов»/«Опутывание корней» — на клетку следующего шага
                // СИЛЬНЕЙШЕГО существа игрока (лучший бегун теряет марш).
                if ((def.trap.effect === "confuse" || def.trap.effect === "entangle")
                    && front.length) {
                    const strong = B.units.filter((v) =>
                        v.side === "p" && v.def.type === "unit")
                        .sort((a, b) => aiVal(b) - aiVal(a))[0];
                    if (strong) {
                        const f2 = front.filter(([c2, r2]) =>
                            c2 === strong.col && r2 === strong.row - 1);
                        if (f2.length) pool = f2;
                    }
                }
                // «Гоблинская мина»: сплэш задевает соседей клетки — рядом не
                // должно быть своих убиваемых; совсем небезопасно — держим мину.
                if (def.trap.effect === "cellDmg" && def.trap.splash) {
                    const safe = pool.filter(([c2, r2]) => aiMineSafe(c2, r2));
                    if (!safe.length) return null;
                    const clean = safe.filter(([c2, r2]) => !B.units.some((v) =>
                        v.side === "e" && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                    pool = clean.length ? clean : safe;
                }
                // «Снежный ком»: 2 урона всему ряду (колонке клетки) — если в
                // нём есть своё убиваемое существо, ловушку держим.
                if (def.trap.effect === "rowShift") {
                    const dmg = (def.trap.amount || 2) + altarBonus("e");
                    pool = pool.filter(([c2]) => !B.units.some((v) =>
                        v.side === "e" && v.col === c2 && v.def.type === "unit"
                        && v.hp <= dmg));
                    if (!pool.length) return null;
                }
                let best = [], bestScore = -Infinity;
                for (const [c, r] of pool) {
                    const score = aiTrapScore(def, c, r);
                    if (score > bestScore + 1e-9) { bestScore = score; best = [[c, r]]; }
                    else if (Math.abs(score - bestScore) < 1e-9) best.push([c, r]);
                }
                return best[(Math.random() * best.length) | 0];
            };
            // Цель «Ледяного удара» для ИИ: существо (своё или игрока), чей
            // случайный сосед получит урон/«Заморожен» в нашу пользу. Если
            // все варианты бьют по своим — карту не играем.
            A.aiIceStrikeTarget = function aiIceStrikeTarget() {
                const pick = iceStrikePick("e");
                return pick && pick.score > 0 ? pick.unit : null;
            };
            // Цель «Гидроудара» (wis99) для ИИ: существо игрока — 1 урон и
            // сдвиг К ЕГО базе (назад по маршу). Ценим добивание, сильных
            // угроз, доступность клетки за спиной (без неё сдвига нет).
            A.aiHydroPick = function aiHydroPick() {
                let best = null, bestScore = 0;
                const dmg = 1 + altarBonus("e");
                for (const v of spellTargets(B.units)) {
                    if (v.side !== "p" || v.def.type !== "unit") continue;
                    const kill = v.hp <= dmg;
                    let s = kill ? 3.2 + aiThreat(v) * 0.5 : aiThreat(v) * 0.55;
                    const r2 = v.row + 1; // его база — ряд игрока
                    if (r2 < GRID && !unitAt(v.col, r2)) s += 0.9 + aiThreat(v) * 0.3;
                    if (s > bestScore) { bestScore = s; best = v; }
                }
                return best;
            };
            // Играбельность заклинания для ИИ (общие проверки цели/эффекта).
            // forReplay — проверка ПОВТОРА «Горящими рунами»: карта уже не в руке.
            A.aiSpellPlayable = function aiSpellPlayable(def, forReplay = false) {
                const s = def.spell;
                if (s.copyLast) return aiReplayOk();
                if (s.sacrifice && !aiSacrificePick()) return false;
                // «Стена костров» — ряд должен окупаться (не на своих, просил
                // юзер); всем рядам в убыток — карту держим до подходящего поля
                if (s.firewall && aiFirewallRow() === null) return false;
                // «Раскалённые обломки» — 6 энергии: нужны 2+ цели либо снос
                // ценного (убиваемое существо с уроном 3+)
                if (s.aoeDmg) {
                    const hits = B.units.filter((v) => v.side === "p");
                    if (hits.length < 2 && !hits.some((v) =>
                        v.hp <= s.aoeDmg + altarBonus("e") && v.curAtk >= 3)) return false;
                }
                // «Рой светлячков» — 4⚡ за урон числом существ: играем при 2+ урона
                if (s.fireflies && spellHitDmg(def, "e") < 2) return false;
                // «Выстрел стихией Роста» — без карт Роста в руке урона нет
                if (s.growthHand && spellHitDmg(def, "e") < 1) return false;
                // «Цветение кристаллов» — разгон: играется при 4+ картах в руке
                if (s.energyPerHand && B.eHand.length < 4) return false;
                // «Поток маны» — без своих ловушек энергии не даёт
                if (s.energyPerTrap && !B.traps.e.length) return false;
                // «Нехватка воздуха» — нужен хоть один урон у существ игрока
                if (s.debuffEnemyAtkAll && !B.units.some((v) =>
                    v.side === "p" && v.def.type === "unit" && v.curAtk > 0)) return false;
                // «Атака духами волков» — нужен стрелок, чья линия не бьёт своих
                if (s.wolfVolley && !aiWolfPick()) return false;
                // «Круговая атака» — своё существо впритык к врагу, и урон по
                // чужим должен окупать урон по своим (просил юзер: аккуратно)
                if (s.nova && !aiNovaPick()) return false;
                // «Ледяной удар» — нужен сосед-существо и выгодный размен
                if (s.iceStrike && !aiIceStrikeTarget()) return false;
                // «Культ кочерыжки» — нужна хоть одна пустая клетка под гоблинов
                if (s.cultRow && B.units.length >= GRID * GRID) return false;
                // «Поднять стяги!» — окупается при двух и более своих существах
                if (s.buffAllAtk
                    && B.units.filter((v) => v.side === "e" && v.def.type === "unit").length < 2) return false;
                // «Бросок валуна» — метатель с уроном 3+ либо добивание базы;
                // слабым метателем карту не переводим — держим для сильного
                // из колоды (просил юзер: часть комбы в руке ждёт пару)
                if (s.baseHit) {
                    const throwers = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"));
                    if (!throwers.some((v) => v.curAtk >= 3 || v.curAtk >= B.playerBase)) return false;
                }
                // «Двойная атака» — берсерк платит жизнь за удар: вешаем
                // на сильного (3+ урона) и крепкого (3+ жизней), либо на уже
                // стоящего у базы врага (ряд 3+ — следующий марш в базу)
                if (s.berserk && !spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"
                    && ((v.curAtk >= 3 && v.hp >= 3) || (v.row >= 3 && v.curAtk >= 2)))).length) return false;
                // «Запутать руны» — сброс обеих рук: играем, только если у
                // игрока карт больше, чем останется у нас после розыгрыша
                if (s.discardHandDraw && B.hand.length <= B.eHand.length - 1) return false;
                // добор-заклинание — тоже трата энергии; гасим только при полной руке
                if (s.draw && B.eHand.length >= HAND_MAX) return false;
                // огнешар при энергии 1..2 почти пуст (урон 0..1) — копим дальше
                if (s.drainAll && B.eEnergy < 3) return false;
                // «Поиск рун»: в верхних картах колоды должно быть заклинание
                if (s.search && !B.eDeck.slice(-s.search)
                    .some((id) => CARDS[id] && CARDS[id].type === "spell")) return false;
                // «Рунное гадание»: в верхних картах колоды должен быть призыв
                if (s.searchUnit && !B.eDeck.slice(-s.searchUnit)
                    .some((id) => CARDS[id] && CARDS[id].type === "unit")) return false;
                // «Поиск знаний»: брать нечего, если колода пуста
                if (s.seek && !B.eDeck.length) return false;
                // «Природная мощь»: есть свой крепыш (3+ жизни) — иначе +1 урона
                // за энергию и карту не окупается
                if (s.buffAtkByHp && !spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.hp >= 3)).length) return false;
                // «Извлечение духа» — окупается, когда у цели 2+ свойств
                if (s.purge && !spellTargets(B.units.filter((v) => v.side === "p"))
                    .some((v) => countProps(v) >= 2)) return false;
                // «Похищение энергии» — крадём 2⚡, окупается при 2+⚡ у игрока
                if (s.stealEnergy && B.energy < s.stealEnergy) return false;
                // «Варка зелий» — в сбросах (своём или чужом) должно быть
                // заклинание, которое стоит тащить (саму Варку ИИ не берёт)
                if (s.discardPick && !spellsInDiscard("e").concat(spellsInDiscard("p"))
                    .some((id) => id !== "grw23")) return false;
                // «Раскопки» — нужна своя постройка и постройка сброса ДОРОЖЕ
                // худшей своей (иначе обмен картой не окупается)
                if (s.excavate) {
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "building");
                    const back = B.eDiscard.filter((id) => CARDS[id] && CARDS[id].type === "building");
                    if (!own.length || !back.length) return false;
                    const worst = own.slice().sort((a, b) =>
                        (a.def.cost - b.def.cost) || (a.hp - b.hp))[0];
                    if (!back.some((id) => CARDS[id].cost > worst.def.cost)) return false;
                }
                // «Защитный кокон» — есть кому защищать и есть от кого: игрок
                // ходит первым, поэтому кокон на своего под удар реально спасает
                if (s.cocoon) {
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"));
                    const threat = own.some((v) => {
                        const a = unitAt(v.col, v.row + 1);
                        return a && a.side === "p" && a.def.type === "unit" && a.curAtk >= 2;
                    });
                    if (!own.length || !threat) return false;
                }
                // «Глубокое путешествие»: в верхних картах колоды должен быть призыв
                if (s.journey && !B.eDeck.slice(-Math.min(s.journey, B.eDeck.length))
                    .some((id) => CARDS[id] && CARDS[id].type === "unit")) return false;
                // «Смыв» — есть существо игрока (желательно не токен);
                // «Защита от заклинаний» отсеяна общим фильтром целей
                if (s.bounce && !spellTargets(B.units.filter((v) => v.side === "p"
                    && v.def.type === "unit")).length) return false;
                // «Рой ледо-пикси» — 4⚡ за 5 тел 1/1: держим, пока на поле
                // есть хотя бы 3 свободные клетки (иначе призыв почти пуст)
                if (s.iceSwarm && GRID * GRID - B.units.length < 3) return false;
                // «Слабость» — есть чей-то урон, который стоит снять
                if (s.debuffAtk && !spellTargets(B.units.filter((v) => v.side === "p"
                    && v.def.type === "unit" && v.curAtk > 0)).length) return false;
                // «Гидроудар» — есть чьё-то существо: урон 1 и сдвиг к базе
                if (s.hydroPunch && !spellTargets(B.units.filter((v) => v.side === "p"
                    && v.def.type === "unit")).length) return false;
                // усиление/очарование — только если есть своё существо под него
                // (огонь не дублируем; яд складывается — его можно докинуть);
                // «Смыв»/«Слабость»/«Ледяной удар»/«Гидроудар» целятся в ИГРОКА —
                // этот гейт их не касается
                if (s.target === "anyUnit" && !s.bounce && !s.debuffAtk && !s.iceStrike
                    && !s.hydroPunch
                    && !spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"
                        && (!s.enchantFire || !v.enchantFire))).length) return false;
                // дротик/варево/огнешар — только если есть цель
                if (s.target === "anyUnitDmg" && !aiDmgTargets(def).length) return false;
                return true;
            };
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
                    if (d.ability === "dash1") s += 0.2;
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
                        + (d.cloudSpire ? 2.2 : 0);
                }
                if (d.type === "spell") {
                    const s = d.spell || {};
                    let v = 1.5 + (d.cost || 0) * 0.15;
                    if (s.baseDmg) v += s.baseDmg * 1.2;
                    if (s.aoeDmg) v += s.aoeDmg * 1.4;
                    if (s.dmg) v += s.dmg * 1.1;
                    if (s.drainAll) v += 1.5;
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
                    if (s.copyLast) v += 1.0;
                    if (s.wolfVolley) v += 2.0;
                    if (s.baseHit) v += 1.6;
                    if (s.freeze) v += 1.0;
                    if (s.iceStrike) v += 2.0;
                    if (s.hydroPunch) v += 1.2; // урон 1 + полезный сдвиг назад
                    if (s.iceSwarm) v += Math.min(5, s.iceSwarm) * 0.55; // 5 тел 1/1
                    if (s.discardHandDraw) v += 1.0
                        + 0.35 * Math.min(6, B.hand.length)
                        - 0.3 * Math.min(6, B.eHand.length);
                    return v;
                }
                if (d.type === "trap") return 2.0 + (d.cost || 0) * 0.2;
                return 1;
            };
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
            A.aiSearchSpell = function aiSearchSpell(n) {
                let best = null, bestScore = -Infinity;
                for (const x of aiTopCards(n)) {
                    const d = CARDS[x.id];
                    if (!d || d.type !== "spell") continue;
                    let sc = aiCardPower(d);
                    if (aiSpellPlayable(d)) sc += 1.5;
                    if (sc > bestScore) { bestScore = sc; best = x; }
                }
                return best;
            };
            // «Рунное гадание»: из верхних призывов — лучший для текущего поля.
            A.aiSearchUnit = function aiSearchUnit(n) {
                let best = null, bestScore = -Infinity;
                const animals = B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.def.creature === "animal").length;
                for (const x of aiTopCards(n)) {
                    const d = CARDS[x.id];
                    if (!d || d.type !== "unit") continue;
                    let sc = aiCardPower(d);
                    if (d.keeperScale) sc += animals * 0.35;
                    if (d.energyToStats) sc += Math.max(0, B.eEnergy - 1) * 0.2;
                    if (d.leaderAura && B.eHand.some((id) => isGoblin(CARDS[id]))) sc += 0.6;
                    if (sc > bestScore) { bestScore = sc; best = x; }
                }
                return best;
            };
            // «Глубокое путешествие»: 1 призыв из верхних N — берём лучший,
            // а не случайный. Если места на поле нет, карта хоть в руку.
            A.aiSummonPick = function aiSummonPick(n) {
                let best = null, bestScore = -Infinity;
                const animals = B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.def.creature === "animal").length;
                for (const x of aiTopCards(n)) {
                    const d = CARDS[x.id];
                    if (!d || d.type !== "unit") continue;
                    let sc = aiCardPower(d);
                    if (d.keeperScale) sc += animals * 0.35;
                    if (d.energyToStats) sc += Math.max(0, B.eEnergy - 1) * 0.2;
                    if (!aiUnitSpot(d)) sc -= 30; // поле забито — не выбираем
                    if (sc > bestScore) { bestScore = sc; best = x; }
                }
                return best;
            };
            // Повторять «Горящими рунами» стоит МОЩНОЕ: по базе, по площади,
            // стену костров, жертву, огнешар, волков или урон 2+. Усиление или
            // добор повторять — перевод карты: руны держим, пока не выйдет пара.
            A.aiReplayWorth = function aiReplayWorth(id) {
                const d = CARDS[id], s = d && d.spell;
                if (!s) return false;
                return !!(s.aoeDmg || s.baseDmg || s.firewall || s.sacrifice
                    || s.drainAll || s.fireflies || s.growthHand
                    || s.wolfVolley || s.nova || s.baseHit || s.iceStrike
                    || s.iceSwarm
                    || (s.dmg || 0) + altarBonus("e") >= 2);
            };
            // Есть ли смысл повторять последнее заклинание («Горящие руны»):
            // оно есть, это не сами руны, оно достойно повтора и применимо
            A.aiReplayOk = function aiReplayOk() {
                const last = B.lastSpell.e;
                if (!last || last === "str25") return false;
                const def = CARDS[last];
                return !!def && def.type === "spell" && aiReplayWorth(last)
                    && aiSpellPlayable(def, true);
            };
            // Эффект заклинания врага — один код для прямого розыгрыша и для
            // повтора «Горящими рунами» (там эффект последнего заклинания,
            // free=true — цена повтора не вычитается из урона). focus —
            // приоритетная цель руны-ловушки: если заклинание умеет целиться
            // в это существо, бьёт именно его (просил юзер).
            // Скидка «Заклятого древоброда» (grw37): если целью вышел он,
            // aiPlay платит на 1 энергию меньше (флаг ставится здесь).
            A.castTargetOff = 0;
            // Флаг spellCasting на всё разрешение заклинания: damageUnit в
            // это время не наносит урон существам с «Защитой от заклинаний»
            // (u.spellWard, просил юзер)
            A.enemyCastSpellEffect = function enemyCastSpellEffect(def, free = false, focus = null, fromHand = false) {
                A.spellCasting = true;
                fxSpellCast(def, focus, "e");
                try {
                    enemyCastSpellEffectInner(def, free, focus, fromHand);
                } finally { A.spellCasting = false; }
            };
            A.enemyCastSpellEffectInner = function enemyCastSpellEffectInner(def, free = false, focus = null, fromHand = false) {
                const s = def.spell;
                castTargetOff = 0;
                const aimOff = (u) => { if (u && u.def.targetDiscount) castTargetOff = 1; };
                if (s.nova) { // «Круговая атака»: своё существо, где чужих соседей
                    // больше и они опаснее своих (своих тоже задевает)
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"));
                    let best = aiNovaPick();
                    if (focus && own.includes(focus)) best = focus; // руна
                    aimOff(best);
                    if (best) { novaSplash(best); punch(best.node); sfx("up"); }
                }
                if (s.wolfVolley) { // «Атака духами волков»: стрелок без своих на линии
                    const best = aiWolfPick();
                    aimOff(best);
                    if (best) wolfVolley(best);
                }
                if (s.target === "anyUnit" && !s.nova) { // усиление/очарование — лучшему
                    // «Гидроудар» (wis99): 1 урон + сдвиг К ЕГО базе,
                    // цель — самая опасная (фокус руны, если годится)
                    if (s.hydroPunch) {
                        const foes = spellTargets(B.units.filter((v) => v.side === "p"
                            && v.def.type === "unit"));
                        let best = aiHydroPick();
                        if (focus && foes.includes(focus)) best = focus;
                        if (!best) return;
                        aimOff(best);
                        damageUnit(best, spellDmg(def, "e", true, true), null, "rocket");
                        if (B.units.includes(best)) pushTowardBase(best);
                        punch(best.node);
                        sfx("aqua");
                        return;
                    }
                    // «Смыв» (wis85): существо игрока — в его руку; цель —
                    // самая опасная не-токенная единица (токены — крайний случай).
                    // «Защита от заклинаний» отсеяна общим фильтром целей.
                    if (s.bounce) {
                        const foes = spellTargets(B.units.filter((v) => v.side === "p"
                            && v.def.type === "unit"));
                        const real = foes.filter((v) => !v.token);
                        const pool = real.length ? real : foes;
                        const best = pool.slice()
                            .sort((a, b) => aiThreat(b) - aiThreat(a) || b.row - a.row)[0];
                        if (!best) return;
                        aimOff(best);
                        punch(best.node);
                        bounceUnit(best);
                        sfx("aqua");
                        return;
                    }
                    // «Слабость» (wis86): −2 урона сильнейшему существу игрока
                    if (s.debuffAtk) {
                        const best = spellTargets(B.units
                            .filter((v) => v.side === "p" && v.def.type === "unit"))
                            .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                        if (!best) return;
                        aimOff(best);
                        best.bonusAtk = (best.bonusAtk || 0) - s.debuffAtk;
                        recalcAuras();
                        const p = cellXY(best.col, best.row);
                        floatText(p.x, p.y - 39, `−${s.debuffAtk}⚔`, 0xef9f8c);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.72 });
                        punch(best.node);
                        sfx("acid");
                        return;
                    }
                    // «Ледяной удар» (wis92): цель бьёт случайного соседа-
                    // существо; урон считает сама цель, поэтому важна не её
                    // сторона, а чей сосед попадёт под удар (iceStrikePick)
                    if (s.iceStrike) {
                        const focusOk = focus && B.units.includes(focus)
                            && focus.def.type === "unit" && spellAimable(focus)
                            && iceStrikeVictims(focus).length > 0;
                        const target = focusOk ? focus : aiIceStrikeTarget();
                        if (!target) return;
                        const victim = iceStrikeVictim(target);
                        if (!victim) return;
                        aimOff(target); // скидка «Заклятого древоброда»
                        iceStrikeAttack(target, victim);
                        if (B.units.includes(victim)) addFrozen(victim, s.freeze || 1, "e");
                        punch(target.node);
                        sfx("aqua");
                        return;
                    }
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"
                        && (!s.enchantFire || !v.enchantFire)
                        && (!s.venom || !v.venom)));
                    // очарование «Огненного дыхания» вешается на крепкого атакующего
                    // (ему жить и бить, чтобы тянуть заклинания), «Природная мощь» —
                    // на самого живучего (+урона = жизням), усиление — на того, кто
                    // успеет ударить; всё это — в aiBuffPick
                    let best = aiBuffPick(def);
                    if (focus && own.includes(focus)) best = focus;
                    if (!best) return;
                    aimOff(best); // скидка «Заклятого древоброда» — оплатит aiPlay
                    if (s.enchantFire) { // «Огненное дыхание»
                        best.enchantFire = true;
                        const mark = new PIXI.Graphics();
                        mark.circle(0, 0, 10.5);
                        mark.fill({ color: 0xff7a2e });
                        mark.stroke({ width: 3, color: 0xffd98c });
                        mark.position.set(36, -54);
                        mark.name = "enchMark";
                        mark.eventMode = "none";
                        best.node.addChild(mark);
                        floatText(cellXY(best.col, best.row).x, cellXY(best.col, best.row).y - 60, "✦", 0xffb26e);
                    } else {
                        if (s.buffAtk) {
                            best.bonusAtk = (best.bonusAtk || 0) + s.buffAtk;
                            recalcAuras();
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 39, `+${s.buffAtk}⚔`, 0x9fd489);
                        }
                        if (s.buffHp) { // «Дар леса»: +N жизни
                            best.hp += s.buffHp;
                            const hn = best.node.getChildByName("hp");
                            if (hn) hn.text = String(best.hp);
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 75, `+${s.buffHp}♥`, 0x9fd489);
                        }
                        if (s.buffAtkByHp) { // «Природная мощь»: +урона = жизням
                            best.bonusAtk = (best.bonusAtk || 0) + best.hp;
                            recalcAuras();
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 39, `+${best.hp}⚔`, 0x9fd489);
                        }
                        if (s.berserk) addBerserk(best, s.berserk);
                        if (s.venom) addVenom(best, s.venom); // «Отравленные лезвия»
                    }
                    punch(best.node);
                    if (s.buffAtk || s.buffHp || s.buffAtkByHp || s.enchantFire) {
                        const bp = cellXY(best.col, best.row);
                        fxEvent("buff", { x: bp.x, y: bp.y - 12,
                            color: s.enchantFire ? 0xff8a5e : 0xffd98c, scale: 0.82 });
                    }
                    sfx("up");
                }
                if (s.target === "anyUnitDmg") {
                    const targets = aiDmgTargets(def);
                    if (s.purge) { // «Извлечение духа»: чистим самую «заряженную» цель
                        let best = null, bestScore = 0;
                        for (const v of targets) {
                            const n = countProps(v);
                            if (!n) continue;
                            const sc = n * 3 + aiThreat(v) * 0.5;
                            if (sc > bestScore) { bestScore = sc; best = v; }
                        }
                        if (focus && targets.includes(focus)) best = focus; // руна
                        if (best) {
                            const n = purgeUnit(best);
                            B.enemyBase = Math.min(B.enemyBaseMax, B.enemyBase + n);
                            floatText(960, 60, `+${n}`, 0x9fd489);
                            fxEvent("heal", { x: 960, y: 70, scale: 1.15 });
                            punch(root.hud);
                            sfx("up");
                        }
                    } else if (s.cocoon) { // «Защитный кокон» — своему под удар
                        const own = spellTargets(B.units.filter((v) => v.side === "e"));
                        let best = aiCocoonPick();
                        if (focus && own.includes(focus)) best = focus;
                        if (best) addProtect(best);
                    } else { // дротик/варево/огнешар/светлячки
                        // ИИ добивает (приоритет — убийство), иначе бьёт туда,
                        // где урон окупается: угроза × доля жизней + близость
                        // к нашей базе. Точный урон считается по цели (скидка
                        // древоброда, алтарь, герой), прикидка — без траты
                        // флага «первого уронного» (consume=false).
                        let best = aiDmgTargetPick(def, targets, free);
                        if (focus && targets.includes(focus)) best = focus; // руна
                        if (!best) return;
                        aimOff(best); // скидка «Заклятого древоброда»
                        const dmg = aiDmgFor(def, best, free, true);
                        damageUnit(best, dmg, null, "rocket");
                        // «Ядро кометы»: выжившее существо — «Заморожен N»
                        if (s.freeze && B.units.includes(best)) addFrozen(best, s.freeze, "e");
                    }
                }
                if (s.target === "anyCell") { // стена костров — ряд, где огонь окупается
                    const row = aiFirewallRow();
                    if (row === null) return; // невыгодного ряда нет — гейт держал карту
                    B.firewalls.push({ col: 2, row, side: "e",
                        left: s.turns, dmg: s.firewall });
                    redrawFirewalls();
                    sfx("rocket");
                }
                if (s.target === "emptyCell") { // культ — ряд, где больше пустых (ничья — где больше игроков)
                    const empt = [0, 0, 0, 0, 0], pu = [0, 0, 0, 0, 0];
                    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
                        if (!unitAt(c, r)) empt[r]++;
                    for (const v of B.units) if (v.side === "p") pu[v.row]++;
                    let row = 0;
                    for (let r = 1; r < GRID; r++)
                        if (empt[r] > empt[row] || (empt[r] === empt[row] && pu[r] > pu[row])) row = r;
                    cultRowSpawn("e", row);
                }
                if (s.target === "enemyAny") {
                    const targets = spellTargets(B.units.filter((u) => u.side === "p"));
                    // если база добивается — бьём базу, даже когда на поле есть
                    // существа (прежний ИИ всегда бил существо и упускал летал)
                    const baseDmg = s.dmg + heroSpellBonus(def, "e", false, true);
                    if (!targets.length || B.playerBase <= baseDmg) {
                        damageBase("p", baseDmg,
                            { x: 960, y: 840, fill: 0xff5f4e });
                        sfx("rocket");
                    } else {
                        const best = focus && targets.includes(focus)
                            ? focus // руна: именно атакующий
                            : aiDmgTargetPick(def, targets);
                        if (best) damageUnit(best, s.dmg + heroSpellBonus(def, "e",
                            best.def.type === "unit", true), null, "rocket");
                    }
                }
                if (s.target === "none" && s.baseDmg) { // землетрясение
                    damageBase("p", s.baseDmg + heroSpellBonus(def, "e", false, true),
                        { x: 960, y: 840, fill: 0xff5f4e });
                    sfx("rocket");
                }
                if (s.stealEnergy) { // «Похищение энергии»: 2⚡ игрока — нам
                    const got = Math.min(s.stealEnergy, B.energy);
                    B.energy -= got;
                    B.eEnergy += got;
                    floatText(960, 840, `−${got}⚡`, 0xff5f4e);
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (s.energyPerHand) { // «Цветение кристаллов»: +1⚡ за карту руки (сама не считается)
                    const got = Math.max(0, B.eHand.length - 1);
                    B.eEnergy += got;
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (s.energyPerTrap) { // «Поток маны»: +1⚡ за свою ловушку
                    const got = B.traps.e.length;
                    B.eEnergy += got;
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    if (got) punch(root.hud);
                    sfx("aqua");
                }
                if (s.debuffEnemyAtkAll) { // «Нехватка воздуха»: −N урона всем существам игрока
                    const n = s.debuffEnemyAtkAll;
                    for (const v of B.units) if (v.side !== "e" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) - n;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `−${n}⚔`, 0xef9f8c);
                    }
                    recalcAuras();
                    sfx("acid");
                }
                if (s.iceSwarm) { // «Рой ледо-пикси»: Элементали 1/1 на случайные пустые клетки
                    iceSwarmSpawn("e", s.iceSwarm);
                    sfx("use");
                }
                if (s.aoeDmg) { // «Раскалённые обломки»: всем существам и постройкам игрока
                    const dmg = s.aoeDmg + altarBonus("e");
                    const fs = heroSpellBonus(def, "e", false, true); // первое уронное — всем ударам
                    for (const v of B.units.slice()) if (v.side !== "e")
                        damageUnit(v, dmg + fs
                            + (v.def.type === "unit" ? heroSpellBonus(def, "e", true) : 0),
                            null, "rocket");
                    sfx("rocket");
                }
                if (s.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                    for (const v of B.units) if (v.side === "e" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) + s.buffAllAtk;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${s.buffAllAtk}⚔`, 0x9fd489);
                    }
                    recalcAuras();
                    sfx("up");
                }
                if (s.sacrifice) { // «Жертвоприношение»: взрыв по соседям жертвы
                    const u = aiSacrificePick();
                    if (u) {
                        const p = cellXY(u.col, u.row);
                        killUnit(u, null);
                        floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                        for (const v of B.units.slice())
                            if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1)
                                damageUnit(v, s.dmg, null, "rocket");
                    }
                }
                if (s.baseHit) { // «Бросок валуна»: своё сильнейшее бьёт базу героя — это его атака
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"))
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row));
                    if (own[0]) { baseHit("e", own[0]); triggerAttackTraps(own[0]); }
                }
                if (s.draw) drawEnemy(s.draw);
                // «Запутать руны»: обе руки в сброс, по 3 карты. При прямом
                // розыгрыше карта ещё в руке — её оставляем, aiPlay уберёт её
                // сам (fromHand); при повторе/руне карты в руке уже нет.
                if (s.discardHandDraw)
                    discardHandDraw("e", s.discardHandDraw,
                        fromHand ? cardIdOf(def) : null);
                if (s.search) { // «Поиск рун»: из ВЕРХНИХ N заклинаний — лучшее в руку
                    const k = aiSearchSpell(s.search);
                    if (k) { B.eDeck.splice(k.j, 1); B.eHand.push(k.id); }
                }
                if (s.searchUnit) { // «Рунное гадание»: из верхних N призывов — лучший
                    const k = aiSearchUnit(s.searchUnit);
                    if (k) { B.eDeck.splice(k.j, 1); B.eHand.push(k.id); }
                }
                if (s.seek) { // «Поиск знаний»: лучшие `seekPicks` из верхних N — в руку
                    const k = Math.min(s.seek, B.eDeck.length);
                    const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                    const want = Math.min(s.seekPicks || 1, top.length);
                    const ranked = top.map((id, i) => ({ id, i, sc: aiCardPower(CARDS[id]) }))
                        .sort((a, b) => (b.sc - a.sc) || (b.i - a.i));
                    const take = new Set();
                    for (const x of ranked.slice(0, want)) { take.add(x.i); B.eHand.push(x.id); }
                    for (let i = 0; i < top.length; i++) if (!take.has(i)) B.eDeck.push(top[i]);
                    if (want) sfx("chpoc");
                }
                if (s.discardPick) { // «Варка зелий»: лучшее заклинание сбросов — в руку
                    const pick = (disc) => disc
                        .filter((id) => CARDS[id] && CARDS[id].type === "spell" && id !== "grw23")
                        .map((id) => ({ id, sc: aiCardPower(CARDS[id])
                            + (aiSpellPlayable(CARDS[id]) ? 1 : 0) }))
                        .sort((a, b) => b.sc - a.sc)[0];
                    const own = pick(B.eDiscard), foe = pick(B.discard);
                    // своё ближе; чужое берём, только если заметно сильнее
                    const k = own && (!foe || own.sc + 0.5 >= foe.sc) ? own : foe;
                    if (k) {
                        const disc = B.eDiscard.includes(k.id) ? B.eDiscard : B.discard;
                        disc.splice(disc.indexOf(k.id), 1);
                        B.eHand.push(k.id);
                        B.scorch.e.add(k.id); // сожжётся после розыгрыша
                    }
                }
                if (s.excavate) { // «Раскопки»: худшую свою постройку — в сброс, из сброса — лучшую
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "building")
                        .sort((a, b) => aiCardPower(a.def) - aiCardPower(b.def));
                    const back = B.eDiscard.filter((id) => CARDS[id] && CARDS[id].type === "building")
                        .sort((a, b) => aiCardPower(CARDS[b]) - aiCardPower(CARDS[a]))[0];
                    const out = own[0];
                    if (out && back && aiCardPower(CARDS[back]) > aiCardPower(out.def)) {
                        const cell = { col: out.col, row: out.row };
                        removeUnit(out); // в сброс без каскадов смерти
                        recalcAuras();
                        B.eDiscard.push(cardIdOf(out.def));
                        B.eDiscard.splice(B.eDiscard.indexOf(back), 1);
                        addUnit("e", back, cell.col, cell.row);
                        sfx("chpoc");
                    }
                }
                if (s.journey) { // «Глубокое путешествие»: лучший призыв из верхних N — бесплатно
                    const chosen = aiSummonPick(s.journey); // выбор ДО изъятия карт
                    const k = Math.min(s.journey, B.eDeck.length);
                    const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                    const chosenId = chosen ? chosen.id : null;
                    const rest = top.filter((id) => id !== chosenId);
                    if (rest.length) {
                        const r = (Math.random() * rest.length) | 0;
                        B.eHand.push(rest[r]); // одна случайная — в руку (по правилу карты)
                        for (let i = 0; i < rest.length; i++) if (i !== r) B.eDiscard.push(rest[i]);
                    }
                    if (chosenId) {
                        // клетка призыва — теми же правилами связок, что и обычный
                        // призыв ИИ (лагерь/костёр рядом, передний ряд, колонка без своих)
                        const spot = aiUnitSpot(CARDS[chosenId]);
                        if (spot) {
                            addUnit("e", chosenId, spot[0], spot[1]);
                        } else B.eHand.push(chosenId); // поле забито — карта хотя бы в руку
                    }
                }
                if (s.brew) { B.brewCasts = (B.brewCasts || 0) + 1; refreshBrewBadges(); }
            };

            A.aiPlay = async function aiPlay() {
                // ИИ тратит энергию, пока есть чем. Если играть нечем (в руке всё
                // слишком дорого или неприменимо — поле забито, целей нет), а
                // энергии много — добирает карты и пробует снова: копить десятки
                // энергии вместо давления ИИ не должен.
                let refillTries = 0;
                const tryRefill = async () => {
                    if (B.eEnergy < 5 || refillTries >= 2) return false;
                    refillTries++;
                    const before = B.eHand.length;
                    drawEnemy(2); // пустые колода/сброс закроет «подкрепление»
                    if (B.eHand.length === before) return false; // карт взять неоткуда
                    refreshHud();
                    await delay(0.3 / animK());
                    return true;
                };
                for (;;) {
                    if (B.stopped || B.phase === "over") return;
                    const affordable = B.eHand
                        .map((c, i) => ({ i, id: c, def: CARDS[c] }))
                        .filter((x) => effCost(x.id, "e") <= B.eEnergy)
                        // порядок — по правилам связок (двигатели до урона и
                        // существ, усиления после), внутри группы дороже раньше
                        .sort((a, b) => (aiGroup(a.id, a.def) - aiGroup(b.id, b.def))
                            || (effCost(b.id, "e") - effCost(a.id, "e")));
                    if (!affordable.length) { if (!await tryRefill()) return; continue; }
                    let played = false;
                    for (const pick of affordable) {
                        const def = pick.def;
                        if (def.type === "unit" || def.type === "building") {
                            // «Отряд эльфов» забирает ВСЮ энергию: без запаса в 2⚡
                            // это 0–1/0–1 — карту не переводим (группа 3.5 уже
                            // отодвинула его в конец розыгрыша)
                            if (def.energyToStats && B.eEnergy - effCost(pick.id, "e") < 2) continue;
                            // «Три монолита» — движок добора: без существа в руке
                            // и пары «цена+1» в колоде он пока пустой; не тратим
                            // темп (просил юзер: карта не в приоритете)
                            if (def.monolith && !B.eHand.some((id) => {
                                const d = CARDS[id];
                                return d && d.type === "unit" && B.eDeck.some((x) => CARDS[x]
                                    && CARDS[x].type === "unit"
                                    && CARDS[x].cost === d.cost + 1);
                            })) continue;
                            // «Круг стихий»: без Элементаля в руке призыв пуст —
                            // постройку держим до подходящей карты
                            if (def.elementalCircle && !B.eHand.some((id) => {
                                const d = CARDS[id];
                                return d && d.type === "unit" && d.subtype === "elemental";
                            })) continue;
                            // клетка — по правилам связок: строения-ауры соседства
                            // к существам и будущим призывам, прочие в тыл; существа —
                            // рядом с лагерем/костром/заклинателем клинков
                            const spot = def.type === "building"
                                ? aiBuildingSpot(def) : aiUnitSpot(def);
                            if (!spot) continue;
                            showEnemyCard(pick.id); // карта врага слева ≥ 1с
                            await delay(enemyPlayDelay());
                            const [col, row] = spot;
                            const cardId = B.eHand[pick.i];
                            // «Отмена призыва» (wis84) игрока: существо не
                            // появляется, карта и энергия врага потрачены
                            if (def.type === "unit"
                                && counterTrapConsume("p", "counterSummon")) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eEnergy -= effCost(cardId, "e");
                                B.eDiscard.push(cardId);
                                floatText(960, 500,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            addUnit("e", cardId, col, row);
                            B.eDiscard.push(cardId); // как у игрока: карта в сброс (иначе цикл «Трусливого гоблина» не работает)
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "trap") {
                            // лимита ловушек нет (просил юзер) — ставим любую
                            // руна («Наскальная рунопись») и споры («Призрачные
                            // споры») — на существо игрока: руна на сильнейшего
                            // (при его атаке ИИ бесплатно разыграет случайное
                            // заклинание своей колоды), споры тоже — чем больше
                            // урона наносит проклятый, тем больше летит в базу
                            if (def.trap.effect === "castRandom" || def.trap.effect === "sporeCurse") {
                                const pu = B.units.filter((v) => v.side === "p" && v.def.type === "unit")
                                    .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                                if (!pu) continue;
                                showEnemyBack(); // какую руну повесил — загадка (просил юзер)
                                await delay(enemyPlayDelay());
                                const cardId = B.eHand[pick.i];
                                B.eHand.splice(pick.i, 1);
                                B.eEnergy -= effCost(cardId, "e");
                                if (def.trap.effect === "sporeCurse") addSpores(pu);
                                else armTrap("e", cardId, 0, 0, pu);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            // Ловушки — прежде всего на путь марша игрока: пустая
                            // клетка прямо ПЕРЕД его существом (шагнёт и наступит),
                            // и не просто «какая-то передняя», а на пути САМОГО
                            // ОПАСНОГО (aiTrapSpot: мина любит скопления, приманка
                            // — соседство, опутывание — сильнейшего). Если все
                            // варианты небезопасны для своих — карту держим.
                            const spot = aiTrapSpot(def);
                            if (!spot) continue;
                            showEnemyBack(); // какая ловушка — загадка (просил юзер)
                            await delay(enemyPlayDelay());
                            const [col, row] = spot;
                            const cardId = B.eHand[pick.i];
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            armTrap("e", cardId, col, row);
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "spell") {
                            if (!aiSpellPlayable(def)) continue;
                            // карта врага — лицом слева, пауза ≥ 1с: игрок видит,
                            // что сейчас произойдёт (просил юзер)
                            showEnemyCard(pick.id);
                            await delay(enemyPlayDelay());
                            const cardId = B.eHand[pick.i];
                            // «Отмена заклинания» (wis83) игрока: эффект не
                            // срабатывает, карта и энергия врага потрачены
                            if (counterTrapConsume("p", "counterSpell")) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eDiscard.push(cardId);
                                B.eEnergy -= effCost(cardId, "e");
                                floatText(960, 500,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            if (def.spell.copyLast) {
                                // «Горящие руны»: повтор ПОСЛЕДНЕГО заклинания тем
                                // же кодом эффектов (бесплатно для его цены)
                                if (enemyReplayLast()) B.lastSpell.e = "str25"; // повтор самой себя — цепочка
                            } else {
                                enemyCastSpellEffect(def, false, null, true);
                            }
                            // indexOf: панельные эффекты кладут карты в руку —
                            // индексы могли сместиться
                            B.eHand.splice(B.eHand.indexOf(cardId), 1);
                            // «Заклятый древоброд» целью — цена заклинания на 1 меньше
                            // (повтор «Горящими рунами» бесплатен — скидка не копится)
                            const tOff = def.spell.copyLast ? 0 : castTargetOff;
                            castTargetOff = 0;
                            B.eEnergy = def.spell.drainAll
                                ? 0 : B.eEnergy - Math.max(0, effCost(cardId, "e") - tOff);
                            heroFirstSpellEnergy("e"); // «Дуновение опасности»
                            // рука ИИ тоже не больше 7 — излишек панельных доборов
                            // сбрасывается случайно (как панель сброса у игрока)
                            while (B.eHand.length > HAND_MAX) {
                                const sp = B.eHand.splice((Math.random() * B.eHand.length) | 0, 1)[0];
                                B.eDiscard.push(sp);
                                B.scorch.e.delete(sp); // метка ушла вместе с картой
                            }
                            if (B.scorch.e.has(cardId)) { // «Сожжение»: карта удалена из боя
                                B.scorch.e.delete(cardId);
                                floatText(960, 640, `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                                sfx("rocket");
                            } else B.eDiscard.push(cardId);
                            heroStrReplay("e", cardId, def); // «Мастера огня»
                            B.lastSpell.e = cardId;
                            afterSpellPlayed(); // «Заклинатель клинков» на поле
                            hideEnemyCard();
                            refreshHud();
                            if (checkEnd()) return;
                            played = true;
                            break;
                        }
                    }
                    if (!played) { if (!await tryRefill()) return; continue; }
                    refreshHud();
                    await delay(0.4 / animK());
                }
            };
        }
    };
})();
