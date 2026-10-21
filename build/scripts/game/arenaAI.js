// СЦЕНА «АРЕНА»: ИИ противника: план добора, заклинания, ход.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
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
            // сильного метателя). Ценность юнита для оценки размена:
            A.aiVal = (u) => u.curAtk + u.hp;
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
            // «Гоблинская мина» (str6): сплэш 1 бьёт соседей клетки — своих
            // убиваемых (жизней ≤ 1) рядом с миной ИИ не подставляет.
            A.aiMineSafe = function aiMineSafe(col, row) {
                return !B.units.some((v) => v.side === "e" && v.hp <= 1
                    && Math.abs(v.col - col) + Math.abs(v.row - row) === 1);
            };
            // Порядок розыгрыша в руке (внутри группы — дороже раньше, как было):
            // 0 добивание базы · 1 двигатели связок (постройки, вождь, заклинатель
            // клинков) · 2 урон и удаление · 3 существа · 4 усиления (когда есть
            // кого усиливать) · 5 ловушки · 6 добор. Так алтарь усиливает дротики
            // этого же хода, вождь удешевляет гоблинов до их розыгрыша, а лагерь
            // встаёт раньше существ, что призываются рядом с ним.
            A.aiGroup = function aiGroup(id, def) {
                if (def.type === "spell") {
                    const s = def.spell;
                    if (s.baseDmg && B.playerBase <= s.baseDmg) return 0; // землетрясение добивает
                    if (s.baseHit && B.units.some((v) => v.side === "e"
                        && v.def.type === "unit" && v.curAtk >= B.playerBase)) return 0;
                    // «Цветение кристаллов» — ускоритель: энергия за размер руки,
                    // разыгрывается первым, чтобы хватило и на остальные карты
                    if (s.energyPerHand) return 1;
                    if (s.firewall || s.aoeDmg || s.dmg || s.drainAll || s.baseDmg
                        || s.sacrifice || s.baseHit || s.copyLast
                        || s.purge || s.stealEnergy || s.fireflies
                        || s.growthHand || s.wolfVolley || s.nova) return 2;
                    if (s.buffAtk || s.buffAtkByHp || s.berserk || s.buffAllAtk
                        || s.enchantFire || s.cocoon || s.venom) return 4;
                    return 6; // поиск рун / гадание / глубокое путешествие
                }
                // «Три монолита» — без спешки (просил юзер: не в приоритете):
                // движок добора, играется, когда важное уже разыграно
                if (def.type === "building") return def.monolith ? 5.5 : 1;
                if (def.type === "trap") return 5;
                // вождь / заклинатель клинков / пастух росянок — двигатели связок:
                // пастуха ставим до Растений, чьи способности он удвоит
                if (def.leaderAura || def.spellBuffAura || def.plantEcho) return 1;
                // «Хранитель леса»: тело = числу своих Животных при призыве —
                // с двумя и больше зверями играет в общий поток, иначе ждёт
                if (def.keeperScale) return B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.def.creature === "animal").length >= 2
                    ? 3 : 5.5;
                if (def.energyToStats) return 3.5; // эльф — последним: соберёт остаток энергии
                return 3;
            };
            // Клетка призыва существа ИИ: связки с «Военным лагерем» (+урон при
            // призыве рядом — самый ценный), «Походным костром» (лечение каждый
            // ход) и «Заклинателем клинков» (+урон за каждое заклинание);
            // прежние приоритеты сохранены — передний ряд и колонка без своих
            // (заторы марша). Трусливый гоблин — стеной прямо перед существом
            // игрока (клетка его следующего шага).
            A.aiUnitSpot = function aiUnitSpot(def) {
                const rows = deployRows("e");
                const free = freeCells(rows);
                if (!free.length) return null;
                const frontRow = rows[rows.length - 1];
                let best = [], bestScore = -1;
                for (const [c, r] of free) {
                    let score = 0;
                    if (r === frontRow) score += 2;
                    if (!B.units.some((o) => o.side === "e" && o.col === c)) score += 1.5;
                    for (const b of B.units) {
                        if (b.side !== "e" || Math.abs(b.col - c) + Math.abs(b.row - r) !== 1) continue;
                        if (b.def.type === "building" && b.def.campAura) score += 3;
                        if (b.def.type === "building" && b.def.campfire) score += 2;
                        if (b.def.spellBuffAura) score += 2;
                        // «Три монолита»: призыв рядом добирает из колоды существо
                        // на 1⚡ дороже — встаём рядом, если такое в колоде есть
                        if (b.def.type === "building" && b.def.monolith
                            && B.eDeck.some((x) => CARDS[x].type === "unit"
                                && CARDS[x].cost === def.cost + 1)) score += 3;
                    }
                    if (def.ability === "coward"
                        && B.units.some((v) => v.side === "p" && v.col === c && v.row === r + 1)) score += 2.5;
                    if (score > bestScore) { bestScore = score; best = [[c, r]]; }
                    else if (score === bestScore) best.push([c, r]);
                }
                return best[(Math.random() * best.length) | 0];
            };
            // Постройки-ауры соседства (лагерь, костёр, росток, лесной монолит,
            // три монолита) — к существам и будущим призывам: своё существо рядом
            // (костёр лечит сразу, росток вернётся в руку с +3 жизни соседу,
            // монолит даст +1 жизни при призыве, «Три монолита» — добор существа)
            // и пустая клетка зоны призыва рядом (лагерь усилит того, кто
            // встанет). Остальные постройки — как раньше, в тыл у своей базы.
            A.aiBuildingSpot = function aiBuildingSpot(def) {
                const rows = deployRows("e");
                const free = freeCells(rows);
                if (!free.length) return null;
                if (def.campAura || def.campfire || def.sprout || def.groveAura
                    || def.monolith) {
                    let best = [], bestScore = -1;
                    for (const [c, r] of free) {
                        let score = 0;
                        for (const v of B.units)
                            if (v.side === "e" && v.def.type === "unit"
                                && Math.abs(v.col - c) + Math.abs(v.row - r) === 1) score += 1.5;
                        for (const [c2, r2] of free)
                            if (Math.abs(c2 - c) + Math.abs(r2 - r) === 1) score += 1;
                        if (score > bestScore) { bestScore = score; best = [[c, r]]; }
                        else if (score === bestScore) best.push([c, r]);
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
                for (const u of B.units) {
                    if (u.side !== "e" || u.def.type !== "unit") continue;
                    const kills = B.units.filter((v) => v.side === "p"
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1
                        && v.hp <= dmg).length;
                    const ownColl = B.units.filter((v) => v.side === "e" && v !== u
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1
                        && v.hp <= dmg).length;
                    const score = kills * 3 - ownColl * 2 - (u.hp + u.curAtk) * 0.25;
                    if (kills >= 1 && score > bestScore) { best = u; bestScore = score; }
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
                // «Атака духами волков» — нужно своё существо, которое выстрелит
                if (s.wolfVolley && !B.units.some((v) => v.side === "e"
                    && v.def.type === "unit")) return false;
                // «Круговая атака» — есть своё существо впритык к врагу
                if (s.nova && !B.units.some((v) => v.side === "e" && v.def.type === "unit"
                    && B.units.some((o) => o.side === "p"
                        && Math.abs(o.col - v.col) + Math.abs(o.row - v.row) === 1))) return false;
                // «Культ кочерыжки» — нужна хоть одна пустая клетка под гоблинов
                if (s.cultRow && B.units.length >= GRID * GRID) return false;
                // «Поднять стяги!» — окупается при двух и более своих существах
                if (s.buffAllAtk
                    && B.units.filter((v) => v.side === "e" && v.def.type === "unit").length < 2) return false;
                // «Бросок валуна» — метатель с уроном 3+ либо добивание базы;
                // слабым метателем карту не переводим — держим для сильного
                // из колоды (просил юзер: часть комбы в руке ждёт пару)
                if (s.baseHit) {
                    const throwers = B.units.filter((v) => v.side === "e" && v.def.type === "unit");
                    if (!throwers.some((v) => v.curAtk >= 3 || v.curAtk >= B.playerBase)) return false;
                }
                // «Двойная атака» — берсерк платит жизнь за удар: вешаем
                // на сильного (3+ урона) и крепкого (3+ жизней), либо на уже
                // стоящего у базы врага (ряд 3+ — следующий марш в базу)
                if (s.berserk && !B.units.some((v) => v.side === "e" && v.def.type === "unit"
                    && ((v.curAtk >= 3 && v.hp >= 3) || (v.row >= 3 && v.curAtk >= 2)))) return false;
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
                // «Природная мощь»: есть свой крепыш (3+ жизни) — иначе +1 урона
                // за энергию и карту не окупается
                if (s.buffAtkByHp && !B.units.some((v) => v.side === "e"
                    && v.def.type === "unit" && v.hp >= 3)) return false;
                // «Извлечение духа» — окупается, когда у цели 2+ свойств
                if (s.purge && !B.units.some((v) => v.side === "p" && countProps(v) >= 2)) return false;
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
                // «Защитный кокон» — есть кому защищать и есть от кого
                if (s.cocoon && !B.units.some((v) => v.side === "e")
                    && !B.units.some((v) => v.side === "p" && v.def.type === "unit"
                        && v.curAtk >= 2)) return false;
                // «Глубокое путешествие»: в верхних картах колоды должен быть призыв
                if (s.journey && !B.eDeck.slice(-Math.min(s.journey, B.eDeck.length))
                    .some((id) => CARDS[id] && CARDS[id].type === "unit")) return false;
                // усиление/очарование — только если есть своё существо под него
                if (s.target === "anyUnit" && !B.units.some((v) => v.side === "e"
                    && v.def.type === "unit" && (!s.enchantFire || !v.enchantFire))) return false;
                // дротик/варево/огнешар — только если есть цель
                if (s.target === "anyUnitDmg" && !B.units.some((v) => v.side === "p"
                    && (v.def.type === "unit"
                        || (v.def.type === "building" && !s.noBuildings)))) return false;
                return true;
            };
            // Повторять «Горящими рунами» стоит МОЩНОЕ: по базе, по площади,
            // стену костров, жертву, огнешар или урон 2+. Усиление или добор
            // повторять — перевод карты: руны держим в руке, пока не выйдет
            // достойная пара (просил юзер).
            A.aiReplayWorth = function aiReplayWorth(id) {
                const d = CARDS[id], s = d && d.spell;
                if (!s) return false;
                return !!(s.aoeDmg || s.baseDmg || s.firewall || s.sacrifice
                    || s.drainAll || s.fireflies || s.growthHand
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
            A.enemyCastSpellEffect = function enemyCastSpellEffect(def, free = false, focus = null) {
                const s = def.spell;
                castTargetOff = 0;
                const aimOff = (u) => { if (u && u.def.targetDiscount) castTargetOff = 1; };
                if (s.nova) { // «Круговая атака»: своё существо с наибольшим числом соседей-врагов
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "unit");
                    let best = null, bestN = 0;
                    for (const v of own) {
                        const n = B.units.filter((o) => o.side === "p"
                            && Math.abs(o.col - v.col) + Math.abs(o.row - v.row) === 1).length;
                        if (n > bestN) { bestN = n; best = v; }
                    }
                    if (focus && own.includes(focus)) best = focus; // руна
                    aimOff(best);
                    if (best) { novaSplash(best); punch(best.node); sfx("up"); }
                }
                if (s.wolfVolley) { // «Атака духами волков»: сильнейшее своё стреляет
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "unit")
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row));
                    aimOff(own[0]);
                    if (own[0]) wolfVolley(own[0]);
                }
                if (s.target === "anyUnit" && !s.nova) { // усиление/очарование — своему сильнейшему
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "unit"
                        && (!s.enchantFire || !v.enchantFire));
                    // очарование «Огненного дыхания» вешается на крепкого атакующего
                    // (ему жить и бить, чтобы тянуть заклинания), «Природная мощь» —
                    // на самого живучего (+урона = жизням), усиление — на сильнейшего
                    let best = own.slice().sort((a, b) => s.enchantFire
                        ? (b.curAtk + b.hp) - (a.curAtk + a.hp)
                        : s.buffAtkByHp ? ((b.hp - a.hp) || (b.curAtk - a.curAtk))
                        : ((b.curAtk - a.curAtk) || (b.row - a.row)))[0];
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
                    sfx("up");
                }
                if (s.target === "anyUnitDmg") {
                    const targets = B.units.filter((v) => v.side === "p"
                        && (v.def.type === "unit"
                            || (v.def.type === "building" && !s.noBuildings)));
                    if (s.purge) { // «Извлечение духа»: чистим самую «заряженную» цель
                        let best = null, bestN = 0;
                        for (const v of targets) {
                            const n = countProps(v);
                            if (n > bestN) { bestN = n; best = v; }
                        }
                        if (focus && targets.includes(focus)) best = focus; // руна
                        if (best && bestN > 0) {
                            const n = purgeUnit(best);
                            B.enemyBase = Math.min(B.enemyBaseMax, B.enemyBase + n);
                            floatText(960, 60, `+${n}`, 0x9fd489);
                            punch(root.hud);
                            sfx("up");
                        }
                    } else if (s.cocoon) { // «Защитный кокон» — своему крепышу
                        const own = B.units.filter((v) => v.side === "e");
                        let best = own.slice().sort((a, b) => (b.hp - a.hp) || (b.curAtk - a.curAtk))[0];
                        if (focus && own.includes(focus)) best = focus;
                        if (best) addProtect(best);
                    } else { // дротик/варево/огнешар/светлячки
                        // ИИ добивает: если есть цель под убийство (урон ≥
                        // жизней) — бьём её (из них сильнейшую и ближе к базе),
                        // иначе просто сильнейшего юза игрока. Прикидка БЕЗ
                        // траты флага «первого уронного» (consume=false)
                        const probe = spellHitDmg(def, "e");
                        const kills = targets.filter((v) => v.hp <= probe);
                        let best = (kills.length ? kills : targets)
                            .slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                        if (focus && targets.includes(focus)) best = focus; // руна
                        if (!best) return;
                        aimOff(best); // скидка «Заклятого древоброда»
                        const dmg = s.drainAll // вся энергия сверх цены — в урон
                            ? Math.max(0, B.eEnergy - (free ? 0 : effCost(cardIdOf(def), "e",
                                { col: best.col, row: best.row }))) + altarBonus("e")
                                + heroSpellBonus(def, "e", best.def.type === "unit", true)
                            : spellHitDmg(def, "e", best.def.type === "unit", true);
                        damageUnit(best, dmg, null, "rocket");
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
                    const targets = B.units.filter((u) => u.side === "p");
                    if (targets.length) {
                        const best = focus && targets.includes(focus)
                            ? focus // руна: именно атакующий
                            : targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                        damageUnit(best, s.dmg + heroSpellBonus(def, "e",
                            best.def.type === "unit", true), null, "rocket");
                    } else {
                        damageBase("p", s.dmg + heroSpellBonus(def, "e", false, true),
                            { x: 960, y: 840, fill: 0xff5f4e });
                        sfx("rocket");
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
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "unit")
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row));
                    if (own[0]) { baseHit("e", own[0]); triggerAttackTraps(own[0]); }
                }
                if (s.draw) drawEnemy(s.draw);
                if (s.search) { // верхнее заклинание из верхних карт колоды — в руку
                    const spells = B.eDeck.map((id, j) => ({ id, j }))
                        .filter((x) => CARDS[x.id] && CARDS[x.id].type === "spell");
                    const k = spells[spells.length - 1];
                    if (k) { B.eDeck.splice(k.j, 1); B.eHand.push(k.id); }
                }
                if (s.searchUnit) { // «Рунное гадание»: призыв из верхних карт — в руку
                    const units = B.eDeck.map((id, j) => ({ id, j }))
                        .filter((x) => CARDS[x.id] && CARDS[x.id].type === "unit");
                    const k = units[units.length - 1]; // ближайший к верху
                    if (k) { B.eDeck.splice(k.j, 1); B.eHand.push(k.id); }
                }
                if (s.discardPick) { // «Варка зелий»: лучшее заклинание сбросов — в руку
                    const pick = (disc) => disc
                        .filter((id) => CARDS[id] && CARDS[id].type === "spell" && id !== "grw23")
                        .sort((a, b) => (CARDS[b].cost - CARDS[a].cost)
                            || ((CARDS[b].rarity === "epic") - (CARDS[a].rarity === "epic")))[0];
                    const id = pick(B.eDiscard) || pick(B.discard); // своё ближе
                    if (id) {
                        const disc = B.eDiscard.includes(id) ? B.eDiscard : B.discard;
                        disc.splice(disc.indexOf(id), 1);
                        B.eHand.push(id);
                        B.scorch.e.add(id); // сожжётся после розыгрыша
                    }
                }
                if (s.excavate) { // «Раскопки»: худшую свою постройку — в сброс, из сброса — дорогую
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "building")
                        .sort((a, b) => (a.def.cost - b.def.cost) || (a.hp - b.hp));
                    const back = B.eDiscard.filter((id) => CARDS[id] && CARDS[id].type === "building")
                        .sort((a, b) => (CARDS[b].cost - CARDS[a].cost))[0];
                    const out = own[0];
                    if (out && back && CARDS[back].cost > out.def.cost) {
                        const cell = { col: out.col, row: out.row };
                        removeUnit(out); // в сброс без каскадов смерти
                        recalcAuras();
                        B.eDiscard.push(cardIdOf(out.def));
                        B.eDiscard.splice(B.eDiscard.indexOf(back), 1);
                        addUnit("e", back, cell.col, cell.row);
                        sfx("chpoc");
                    }
                }
                if (s.journey) { // «Глубокое путешествие»: призыв из верхних карт — бесплатно
                    const k = Math.min(s.journey, B.eDeck.length);
                    const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                    const units = top.filter((id) => CARDS[id] && CARDS[id].type === "unit");
                    const chosen = units.length ? units[(Math.random() * units.length) | 0] : null;
                    const rest = top.filter((id) => id !== chosen);
                    if (rest.length) {
                        const r = (Math.random() * rest.length) | 0;
                        B.eHand.push(rest[r]); // одна случайная — в руку
                        for (let i = 0; i < rest.length; i++) if (i !== r) B.eDiscard.push(rest[i]);
                    }
                    if (chosen) {
                        // клетка призыва — теми же правилами связок, что и обычный
                        // призыв ИИ (лагерь/костёр рядом, передний ряд, колонка без своих)
                        const spot = aiUnitSpot(CARDS[chosen]);
                        if (spot) {
                            addUnit("e", chosen, spot[0], spot[1]);
                        } else B.eHand.push(chosen); // поле забито — карта хотя бы в руку
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
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            addUnit("e", cardId, col, row);
                            B.eDiscard.push(cardId); // как у игрока: карта в сброс (иначе цикл «Трусливого гоблина» не работает)
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "trap") {
                            if (def.trap.effect !== "sporeCurse"
                                && B.traps.e.length >= TRAP_SLOTS) continue;
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
                            // ловушки — прежде всего на путь марша игрока: пустая
                            // клетка прямо ПЕРЕД его существом (шагнёт в начале
                            // своего хода и наступит — просил юзер); таких нет —
                            // старое правило: зона призыва (ряд 4, затем 3, 2);
                            // приманка без «передних» манит с соседних клеток
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
                            if (!front.length && !spots.length) continue;
                            let pool;
                            if (front.length) pool = front;
                            else if (def.trap.effect === "lure") {
                                const near = spots.filter(([c2, r2]) => B.units.some((v) =>
                                    v.side === "p" && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                                pool = near.length ? near : spots;
                            } else pool = spots;
                            // «Путь грибов» (Запутанность) и «Опутывание корней»:
                            // на клетку следующего шага СИЛЬНЕЙШЕГО существа
                            // игрока — лучший бегун два хода теряет марш (правило юзера)
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
                            // «Гоблинская мина»: сплэш задевает соседей клетки —
                            // рядом не должно быть своих убиваемых (аккуратно
                            // с картами, вредящими своим — просил юзер); совсем
                            // небезопасно — мину держим
                            if (def.trap.effect === "cellDmg" && def.trap.splash) {
                                const safe = pool.filter(([c2, r2]) => aiMineSafe(c2, r2));
                                if (!safe.length) continue;
                                const clean = safe.filter(([c2, r2]) => !B.units.some((v) =>
                                    v.side === "e"
                                    && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                                pool = clean.length ? clean : safe;
                            }
                            showEnemyBack(); // какая ловушка — загадка (просил юзер)
                            await delay(enemyPlayDelay());
                            const [col, row] = pool[(Math.random() * pool.length) | 0];
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
                            if (def.spell.copyLast) {
                                // «Горящие руны»: повтор ПОСЛЕДНЕГО заклинания тем
                                // же кодом эффектов (бесплатно для его цены)
                                if (enemyReplayLast()) B.lastSpell.e = "str25"; // повтор самой себя — цепочка
                            } else {
                                enemyCastSpellEffect(def);
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
