// СЦЕНА «АРЕНА»: ИИ: ХОД — показ карты врага, ход (enemyTurn → aiPlay):
// разыгрывание руки в порядке ценности с таргетингом и панелями.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installAiPlay = function installAiPlay(A) {
        with (A) {

            A.enemyTurn = async function enemyTurn() {
                B.phase = "enemy";
                B.turnSide = "e"; // чей ход — честный маркер (reactShotPing)
                B.selected = null;
                B.spellTarget = false;
                B.islandPick = false; // прицел «Летучего острова» не переживает смену хода
                B.dmgHalt = { p: false, e: false }; // новый ход — урон снова наносится (hw267)
                B.turnSummons = { p: 0, e: 0 }; // новый ход — счётчик «шестерён» с нуля (wtGears)
                B.heroFlags.bioHit = { p: false, e: false }; // новый ход — «Биоугроза» (W83) снова может отразить раз
                B.heroFlags.toyDiscards = { p: 0, e: 0 }; // «Коробка игрушек» (W97): счётчик сбросов за ход — с нуля
                tokenPanelClose(); // панель «Управления временем» не переживает смену хода
                tagPanelClose(); // панель «Экспериментов» не переживает смену хода (W79)
                projPanelClose(); // панель «Проекции прошлого» — туда же (W81)
                cryptRefund("p"); // «Склеп»: не разыгранная игроком карта — назад в сброс
                portalRefund("p"); // «Мастер порталов»: не разыгранная карта — на верх колоды
                layoutHand();
                redrawHighlight();
                refreshHud();
                firewallTick("p"); // стена костров игрока — конец хода игрока
                sproutTick("p");   // ростки игрока подросли — конец его хода
                auraLightTick("p"); // «Аура света» игрока — конец его хода
                if (B.stopped || B.phase === "over") return;
                banner(t("arena.enemyTurn"));
                fxEvent("turn", { side: "e", color: 0xff8a5e });
                await delay(0.5 / animK());
                if (B.stopped) return;
                upkeep("e"); // грибницы врага
                riteStumpTick("e"); // пень обряда врага подсмотрел и решил
                portalMasterTick("e"); // «Мастер порталов»: ловушка с верха колоды — бесплатно
                poisonTick("e"); // яд: до марша (просил юзер)
                trapReturnTick("e"); // «Возврат» ЛОВУШКИ (tim221): созревшая — в руку
                summonTick("e"); // «Призыв» (W95): счётчик истёк — существо из колоды
                await delayArrive("e"); // «Сдвиг» (Время): созревшие являются
                await marchSide("e");
                if (B.stopped || B.phase === "over") return;
                // «Возврат» (Время, W103 — юзер): ПОСЛЕ действия существа
                // (движения/атаки), а не до — юнит успевает походить/ударить
                // и только тогда возвращается в руку
                returnTick("e");
                timeCavePulse("e"); // «Пещера времени»: призыв после марша — значок не тает в этом же ходу
                await aiPlay();
                if (B.stopped || B.phase === "over") return;
                await enemyTurnTail();
            };

            // Хвост хода врага ПОСЛЕ розыгрышей (W140): вынесен из enemyTurn,
            // чтобы восстановление боя после выхода могло доиграть полуход
            // с того же места (arenaSave.enemyResume — aiPlay → хвост),
            // не повторяя upkeep/марш
            A.enemyTurnTail = async function enemyTurnTail() {
                // «Гном-разбойник» (timRaider, W40): рука опустела — 2 карты
                heroEmptyHandDraw("e");
                cryptRefund("e"); // «Склеп» врага: не разыгранная карта — назад в сброс
                portalRefund("e"); // «Мастер порталов»: не разыгранная — на верх колоды
                // шкала врага — мягкое правило добора (просил юзер), см. enemyDrawPlan
                const eCards = enemyDrawPlan();
                drawEnemy(eCards);
                B.eEnergy += spheresTotal() - eCards;
                refreshHud();
                await delay(0.25 / animK());
                if (B.stopped) return;
                // «Временная петля» (tim229) врага: вместо хода игрока — ещё
                // один его ход (полный: upkeep, марш, aiPlay)
                if (B.extraTurn && B.extraTurn.e) {
                    B.extraTurn.e = false;
                    await enemyTurn();
                    return;
                }
                // Дополнительная пауза между концом хода противника и
                // началом хода игрока (W58, юзер) — успеть осмотреть поле
                await delay(0.5 / animK());
                if (B.stopped) return;
                await playerTurnStart();
            };

            // ── Карта, разыгранная врагом (просил юзер): лицом на свободном
            // месте слева от поля; между розыгрышами врага
            // пауза ≥ 1 реальной секунды, и всё это время карта видна — игрок
            // понимает, что делает противник.
            A.enemyCard = null; // { id, node }
            A.showEnemyCard = function showEnemyCard(cardId) {
                hideEnemyCard();
                const node = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.75 });
                node.eventMode = "none";
                node.position.set(430, 420);
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
            // Рубашка колоды и сброса ИГРОКА — по его стихии забега (просил
            // юзер): у Горбага и прочих героев Силы — гоблинская, у героев
            // Роста — природная
            A.playerBackTex = function playerBackTex() {
                // W54: герой с ДВУМЯ стихиями — обложка мультицвета
                const hd = globalThis.GAME_DATA.HEROES[G.heroId];
                return globalThis.GAME_UI.backTexOf(
                    hd && hd.elems && hd.elems.length > 1 ? "strGro" : G.elem);
            };
            // Ловушка врага — РУБАШКОЙ (просил юзер): игрок видит, что противник
            // сыграл карту, но какая именно ловушка — неизвестно; на поле встанет
            // безликий «?» (рубашка колоды — та же, что у колоды врага)
            // Ловушка врага — РУБАШКОЙ (просил юзер): игрок видит, что противник
            // сыграл карту, но какая именно ловушка — неизвестно; на поле встанет
            // безликий «?» (рубашка колоды — та же, что у колоды врага)
            A.showEnemyBack = function showEnemyBack() {
                hideEnemyCard();
                const node = new PIXI.Sprite(uiTex(enemyBackTex()));
                node.scale.set(0.75);
                node.eventMode = "none";
                node.position.set(430, 420);
                root.addChild(node);
                enemyCard = { id: null, node };
            };
            // пауза между розыгрышами (она же — сколько видна карта врага):
            // минимум 1.5 секунды — на 0.5 дольше прежнего, успеть разглядеть
            // (просил юзер); при замедленных анимациях — ещё дольше
            A.enemyPlayDelay = () => Math.max(1.6, 1.6 / animK());

            // Полёт разыгранной врагом карты к цели (просил юзер — розыгрыши
            // с перемещением): карта с левого места показа летит к клетке/
            // центру поля, сжимаясь, и «превращается» в призыв/эффект.
            // Узел уничтожит тик полёта (handFlight), ссылка enemyCard
            // снимается в done — последующий hideEnemyCard() безвреден.
            // Возвращает промис (в aiPlay — await).
            A.enemyFlyCard = function enemyFlyCard(to, opts = {}) {
                if (!enemyCard || !enemyCard.node || enemyCard.node.destroyed
                    || !root || !root.cardFxLayer) {
                    hideEnemyCard();
                    return Promise.resolve();
                }
                const node = enemyCard.node;
                if (node.anchor && node.anchor.x === 0) {
                    // рубашка ловушки (Sprite) якорена левым-верхним углом —
                    // переводим в центр без визуального скачка
                    node.x += node.width / 2;
                    node.y += node.height / 2;
                    node.anchor.set(0.5);
                }
                return new Promise((res) => {
                    handFlight(node, {
                        target: () => to,
                        r: opts.r ?? 0, s: opts.s ?? 0.34, arc: 60,
                        life: (opts.life ?? 0.42) / animK(), a1: opts.a1 ?? 1,
                        done: () => { enemyCard = null; res(); },
                    });
                });
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

            // ── «Искусственный маг» (wtArtMage, W81 — спека юзера) ─────
            // БЕСПЛАТНЫЙ розыгрыш случайной ДРУГОЙ карты руки (эффект
            // сыгранной карты уже отменён ветками aiPlay ниже: карта
            // ушла в сброс, энергия потрачена). Случайный порядок
            // кандидатов, неприменимые (нет клетки/цели/поставиться)
            // пропускаются; нечего разыгрывать — энергия потрачена зря.
            // Розыгрыш полноценный: ловится «Битвой умов»/отменами,
            // будит afterSpellPlayed-способности, мульти-особенности
            // идут (trap-рука/заклинание), карта уходит в сброс
            A.chaosFreePlay = async function chaosFreePlay(side) {
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const foe = side === "p" ? "e" : "p";
                const picks = shuffle(hand.slice());
                for (const id of picks) {
                    const hi = hand.indexOf(id);
                    if (hi < 0) continue; // ушла из руки эффектом соседа
                    const d = CARDS[id];
                    if (!d) continue;
                    if (d.type === "unit" || d.type === "building") {
                        if (d.type === "unit" && bubbleBlocked(side, id)) continue;
                        if (counterTrapConsume(foe,
                                d.type === "unit" ? "counterSummon" : "counterBuilding")) {
                            hand.splice(hi, 1);
                            discard.push(id);
                            noteDiscard(1, side, [id]);
                            floatText(960, 500,
                                "✕ " + GAME_LOC.t(`card.${id}.name`), 0x8cd0ef);
                            return true;
                        }
                        const spot = d.type === "building"
                            ? aiBuildingSpot(d) : aiUnitSpot(d);
                        if (!spot) continue;
                        showEnemyCard(id);
                        await delay(0.5 / animK());
                        await enemyFlyCard(cellXY(spot[0], spot[1]));
                        hand.splice(hand.indexOf(id), 1);
                        notePlay(side); // «Конвейер» + платит «Визуализатор»
                        B.playCtx = { side, cardId: id };
                        addUnit(side, id, spot[0], spot[1]);
                        B.playCtx = null;
                        discard.push(id);
                        noteDiscard(1, side, [id]);
                        cryptSettle(side, id);
                        const pp = cellXY(spot[0], spot[1]);
                        floatText(pp.x, pp.y - 96,
                            GAME_LOC.t(`card.${id}.name`), 0x9a8ce8);
                        hideEnemyCard();
                        refreshHud();
                        if (checkEnd()) return true;
                        return true;
                    }
                    if (d.type === "trap") {
                        // руна — на сильнейшее существо игрока (как aiPlay),
                        // клеточные — aiTrapSpot, без него случайная пустая
                        let col = 0, row = 0, unit = null;
                        if (d.trap.effect === "castRandom") {
                            const pu = B.units.filter((v) => v.side === foe
                                && v.def.type === "unit")
                                .sort((a, b) => (b.curAtk - a.curAtk)
                                    || (a.row - b.row))[0];
                            if (!pu) continue;
                            unit = pu;
                        } else {
                            const free = [];
                            for (let r = 0; r < GRID; r++)
                                for (let c = 0; c < GRID; c++)
                                    if (!unitAt(c, r)) free.push([c, r]);
                            const spot = aiTrapSpot(d)
                                || free[(Math.random() * free.length) | 0];
                            if (!spot) continue;
                            [col, row] = spot;
                        }
                        showEnemyBack();
                        await delay(0.5 / animK());
                        await enemyFlyCard(
                            cellXY(unit ? unit.col : col, unit ? unit.row : row),
                            { s: 0.3 });
                        hand.splice(hand.indexOf(id), 1);
                        notePlay(side);
                        multiFury(id, side);
                        multiValor(id, side);
                        multiWeave(id, side);
                        multiStudy(id, side);
                        multiPlague(id, side); // «Зараза из глубин» (Некро-раскопки, W82)
                        multiPortal(id, side); // «Из портала» (Портал в бездну, W95)
                        cryptSettle(side, id);
                        armTrap(side, id, col, row, unit);
                        afterTrapPlaced(side);
                        hideEnemyCard();
                        return true;
                    }
                    if (d.type === "spell") {
                        if (!aiSpellPlayable(d)) continue;
                        showEnemyCard(id);
                        await delay(0.5 / animK());
                        await enemyFlyCard({ x: 960, y: 430 },
                            { s: 0.42, a1: 0 });
                        hand.splice(hand.indexOf(id), 1);
                        notePlay(side);
                        multiFury(id, side);
                        multiValor(id, side);
                        multiWeave(id, side);
                        multiStudy(id, side);
                        multiPlague(id, side); // «Зараза из глубин» (Некро-раскопки, W82)
                        multiPortal(id, side); // «Из портала» (Портал в бездну, W95)
                        B.playCtx = { side, cardId: id };
                        enemyCastSpellEffect(d, true); // авто-цели ИИ
                        B.playCtx = null;
                        // внутренние «Огнешар»/«Гроза»/«Древомощь»/«Высокая
                        // мощность» жгут энергию и в бесплатном касте
                        // (прецедент «Загадок»/«Высокой мощности» W80)
                        if (d.spell.drainAll || d.spell.stormAll
                            || d.spell.crushEnergy || d.spell.highPower) {
                            if (side === "p") B.energy = 0;
                            else B.eEnergy = 0;
                        }
                        B.lastSpell[side] = id;
                        afterSpellPlayed(side); // розыгрыш — жетоны «Техномагии» и пр.
                        hideEnemyCard();
                        refreshHud();
                        if (checkEnd()) return true;
                        return true;
                    }
                }
                return false;
            };

            // W110: обёртка подсчёта возраста карт. Тело хода — aiPlayBody;
            // после розыгрышей карты, ОСТАВШИЕСЯ в руке, получают +1 к
            // возрасту («сколько СВОИХ полуходов подряд не смогла
            // сыграться») — «застрявшие» candidate'ы замены тупика.
            // Возраст keyed по стабильным креслам (в симе swap() зеркалит).
            A.aiPlay = async function aiPlay() {
                await aiPlayBody();
                const ha = B.holdAge || (B.holdAge = { p: {}, e: {} });
                const alive = {};
                for (const id of B.eHand) {
                    ha.e[id] = (ha.e[id] || 0) + 1;
                    alive[id] = true;
                }
                for (const id of Object.keys(ha.e))
                    if (!alive[id]) delete ha.e[id];
            };
            A.aiPlayBody = async function aiPlayBody() {
                // ── W124 (юзер): инструментация причин остановки полухода ──
                // «Пропуск хода с играбельной картой» из отчётов лиг может
                // быть и СТРАТЕГИЕЙ (придерживание до комбо, ловушки на
                // чужой ход, хаос-маг), и проблемой (гейты без причины).
                // Сим читает B.__pass после aiPlay и пишет причину в запись
                // боя; поведение ИИ это НЕ меняет (чистые счётчики)
                B.__pass = null;
                const skipLog = [];
                const gateSkip = (id, gate) => {
                    if (skipLog.length < 24) skipLog.push({ id, gate });
                };
                const markPass = (reason, aff, raw) => {
                    B.__pass = {
                        reason,
                        aff: aff || 0,          // играбельных «на момент стопа»
                        raw: raw || 0,          // по карману (до планов/гейтов)
                        skips: skipLog.slice(),
                    };
                };
                // «Склеп» (dec157): верхняя карта своего сброса играется
                // СРАЗУ — тем же ходом (у игрока клик по постройке
                // разыгрывает её автоматом); ИИ берёт её в руку и
                // разыгрывает на общих основаниях, не разыграл — вернётся
                // в сброс в конце хода.
                // Гейт: карта вообще играбельна (юнит/постройка — есть клетка,
                // заклинание — aiSpellPlayable, ловушка — есть) и по карману
                if (!B.eCryptTaken && B.eDiscard.length && B.eHand.length < HAND_MAX) {
                    const crypt = B.units.find((v) => v.side === "e"
                        && v.def.type === "building" && v.def.cryptPlay);
                    if (crypt) {
                        const id = B.eDiscard[B.eDiscard.length - 1];
                        const d = CARDS[id];
                        const playable = d && (d.type === "unit" || d.type === "building"
                            ? !bubbleBlocked("e", id)
                                && freeCells(deployRows("e")).length > 0
                            : true);
                        if (playable && effCost(id, "e") <= B.eEnergy) {
                            B.eDiscard.pop();
                            B.eHand.push(id);
                            B.eCryptTaken = id;
                            const cp = cellXY(crypt.col, crypt.row);
                            floatText(cp.x, cp.y - 96,
                                "⤒ " + GAME_LOC.t(`card.${id}.name`), 0xb7d0ef);
                        }
                    }
                }
                // «Лаборатория» (tim224): активация своей постройки —
                // добор карты и снова в «Сдвиг 1» (после активации на поле
                // её нет — за ход не зациклится; вернётся delayArrive-ом)
                {
                    const lab = B.units.find((v) => v.side === "e"
                        && v.def.type === "building" && v.def.lab);
                    if (lab) labActivate("e", lab);
                }
                // «Летучий остров» (hw270, W78): раз в свой ход — вернуть
                // своё существо в руку и получить 2⚡. Цель — случайное своё
                // существо (перезаявка ценного позже — бонус поверх энергии)
                {
                    const isle = B.units.find((v) => v.side === "e"
                        && v.def.type === "building" && v.def.islandAct
                        && !v.islandUsed);
                    const pool = B.units.filter((v) =>
                        v.side === "e" && effCreature(v));
                    if (isle && pool.length)
                        islandActivate("e", isle,
                            pool[(Math.random() * pool.length) | 0]);
                }
                // ИИ тратит энергию, пока есть чем. Если играть нечем (в руке всё
                // слишком дорого или неприменимо — поле забито, целей нет), а
                // энергии много — добирает карты и пробует снова: копить десятки
                // энергии вместо давления ИИ не должен.
                let refillTries = 0;
                const tryRefill = async () => {
                    // W110: пороги добора в тупике — в AI_W (тюнируемые)
                    if (B.eEnergy < AI_W.refillMin
                        || refillTries >= AI_W.refillTries) return false;
                    refillTries++;
                    const before = B.eHand.length;
                    drawEnemy(AI_W.refillCards); // пустые колода/сброс закроет «подкрепление»
                    if (B.eHand.length === before) return false; // карт взять неоткуда
                    refreshHud();
                    await delay(0.3 / animK());
                    return true;
                };
                // «Искусственный маг» (chaosPlay, W96 — просил юзер): его
                // эффект-отменщик превращает ЛЮБОЙ платный розыгрыш в трату
                // впустую (карта уходит в сброс без эффекта), зато
                // chaosFreePlay бесплатно разыгрывает случайную карту руки.
                // Стратегия: платить энергией только за дешёвые карты
                // (0–2⚡), дорогие (3+) придерживать в руке — их и вытащит
                // бесплатный розыгрыш
                const chaosHold = (heroDefOf("e") || {}).ability === "chaosPlay";
                // W124: порог платного розыгрыха мага — тюнируемый ключ
                // (был зашит 2; пер-геройский слой может поднять)
                const CHAOS_MAX_COST = AI_W.chaosMaxCost || 2;
                // «Бешеные шестерни» (thirdSummonEnergy): W105 (юзер)
                // сменил стратегию — БОЛЬШЕ НЕ ДЕРЖИМ тройку в руке:
                // тяжёлые «Сдвиги» (Квадромех и т.п.) выходят сразу,
                // уже на 2–3-й ход — они ждут на клетках и стол не
                // занимают, а одновременного прихода добиваемся
                // «Экспериментами» (большой «Сдвиг» ведётся к меньшему).
                // Прежнее копление (W99) и ползунок добора (W104) убраны
                // «Возжённый нетопырь» (dstr299, W100 — спека юзера):
                // альтернативная стоимость — скинуть карты общей ценой РОВНО
                // как цена карты (8⚡). ИИ пользуется, когда энергии на
                // обычную уплату не хватает, а точный поднабор в руке есть
                // (решение — один раз за ход, ДО розыгрышей)
                const altBat = B.eHand.some((id) => CARDS[id]
                    && CARDS[id].flyAltCost)
                    && altCostSubset(B.eHand,
                        B.eHand.find((id) => CARDS[id] && CARDS[id].flyAltCost),
                        CARDS[B.eHand.find((id) => CARDS[id]
                            && CARDS[id].flyAltCost)].cost || 0);
                // W103 (юзер): «Три монолита» — комбо готово (в руке юнит
                // ценой X и в колоде юнит ценой X+1)? Тогда постройка
                // играется ВЫСОКИМ приоритетом (группа 0.5 — раньше движков),
                // а юнит-пара встанет рядом с ней (бонус в aiSpotScore):
                // поиск дороже на 1 сработает сразу
                const monolithCombo = B.eHand.some((id) => {
                    const d = CARDS[id];
                    return d && d.type === "unit" && B.eDeck.some((x) => CARDS[x]
                        && CARDS[x].type === "unit"
                        && CARDS[x].cost === d.cost + 1);
                });
                // W103 (юзер): замена застрявшей карты в тупике — раз за ход
                let deadSwapUsed = false;
                // W110 (юзер): пакетное добивание базы — affordable-спеллы
                // урона по базе, СУММАРНО убивающие игрока в ЭТОТ полуход,
                // идут группой 0 (раньше прочего): по отдельности каждый не
                // смертелен, и обычный порядок успевал потратить энергию
                // на прочие карты раньше добивания
                let lethalSet = null;
                {
                    const pack = B.eHand
                        .map((id) => ({ id, s: CARDS[id] && CARDS[id].spell }))
                        .filter((x) => x.s && CARDS[x.id].type === "spell"
                            && x.s.baseDmg > 0)
                        .filter((x) => effCost(x.id, "e") <= B.eEnergy)
                        .sort((a, b) => effCost(a.id, "e") - effCost(b.id, "e"));
                    let pot = 0, paid = 0;
                    const take = [];
                    for (const x of pack) {
                        if (pot >= B.playerBase) break;
                        const c = effCost(x.id, "e");
                        if (paid + c > B.eEnergy) continue;
                        paid += c; pot += x.s.baseDmg; take.push(x.id);
                    }
                    if (pot >= B.playerBase && take.length) lethalSet = new Set(take);
                }
                // W132 (юзер, «связки с коэффициентами из логов лиг»):
                // комбо-hold — половинку сильной пары придержать до
                // партнёра. Партнёр УЖЕ в руке, но паре не хватает энергии:
                // карту не разыгрываем сейчас (иначе пары навсегда «врозь»
                // — при встрече в руке ИИ разводил их в 18% полуходов),
                // ползунок копит под ПАРУ (aiEnergyPlan comboPlanOn) —
                // следующий полуход выпускает обе. Не держим: lethal-пакет,
                // карту, которую держим comboHoldMax СВОИХ полуходов подряд
                // (счётчик ведём сами — holdAge карты считает всю жизнь в
                // руке, дорогие карты «старые» с рождения), пару, не
                // влезающую в бюджет следующего полухода; ход не морозим
                let comboHeldIds = null;
                const holdSeq = B.__comboHoldAge || (B.__comboHoldAge = {});
                const comboHoldFilter = (list) => {
                    comboHeldIds = null;
                    if (!AI_W.comboOn || !AI_W.comboHoldMax || chaosHold) return list;
                    // бюджет следующего СВОЕГО полухода при 0 добора
                    // (spheresTotal на раунд вперёд = +1⚡)
                    const next = B.eEnergy + A.spheresTotal() + 1;
                    const out = list.filter((x) => {
                        if (lethalSet && lethalSet.has(x.id)) return true;
                        const c = aiComboHand(x.id);
                        if (!c) return true; // не половинка сильной пары
                        // партнёр играется вместе с ней сейчас — не держим
                        if (c.cost <= B.eEnergy - effCost(x.id, "e")) return true;
                        // сколько ПОДРЯД своих полуходов уже придержали
                        // (свой полуход — раз в раунд: turnNo сдвигается на 1)
                        const st = holdSeq[x.id];
                        const n = st && B.turnNo - st.turn <= 1 ? st.n : 0;
                        if (n >= AI_W.comboHoldMax) return true;
                        if (effCost(x.id, "e") + c.cost > next) return true;
                        return false;
                    });
                    if (out.length === list.length) {
                        for (const k in holdSeq) delete holdSeq[k];
                        return list;
                    }
                    if (!out.length) { // ход не замораживаем
                        for (const k in holdSeq) delete holdSeq[k];
                        return list;
                    }
                    comboHeldIds = list.filter((x) =>
                        out.indexOf(x) < 0).map((x) => x.id);
                    for (const x of list) {
                        if (out.indexOf(x) < 0) {
                            const st = holdSeq[x.id];
                            const n = st && B.turnNo - st.turn <= 1 ? st.n : 0;
                            holdSeq[x.id] = { turn: B.turnNo, n: n + 1 };
                        } else delete holdSeq[x.id];
                    }
                    return out;
                };
                // W114 (юзер, «этап 2 — деревья решений»): план полухода —
                // перебор порядков и подмножеств играбельных карт на модели
                // поля (aiTree.js): связки (аура/бафф до призыва, урон до
                // добивания) и экономика энергии. План действует, только
                // если он ЯВНО лучше жадной базы (порядок прежних групп) —
                // иначе прежнее поведение. Спецрежимы не трогаем:
                // lethal-пакет (W110) и «Искусственный маг» (chaosHold)
                // остаются как были; при полной руке план не считается
                // (придерживать некуда — перетекание в сброс)
                let plan = null;
                B.aiPlan = null; // след для проб: план текущего полухода
                if (AI_W.treeOn > 0 && !lethalSet && !chaosHold
                    && B.eHand.length < HAND_MAX) {
                    const preAff0 = B.eHand
                        .map((c) => ({ id: c, def: CARDS[c] }))
                        .filter((x) => x.def && effCost(x.id, "e") <= B.eEnergy);
                    // W132: придержанные половинки пар — не кандидаты плана
                    const preAff = comboHoldFilter(preAff0);
                    if (preAff.length >= AI_W.treeMinCards) {
                        plan = aiPlanTurn(preAff, { monolithCombo });
                        if (plan) {
                            plan.left = plan.order.slice();
                            plan.done = false;
                            B.aiPlan = { order: plan.order.slice(),
                                hold: plan.hold.slice() }; // след для проб
                        } else B.aiPlan = null;
                    }
                }
                for (;;) {
                    if (B.stopped || B.phase === "over") return;
                    const rawAff = B.eHand
                        .map((c, i) => ({ i, id: c, def: CARDS[c] }))
                        .filter((x) => effCost(x.id, "e") <= B.eEnergy
                            // нетопырь по альт-стоимости — тоже играбелен
                            || (x.def.flyAltCost && altBat));
                    skipLog.length = 0; // гейты этой итерации — заново
                    let affordable = rawAff.filter((x) => !chaosHold
                        || effCost(x.id, "e") <= CHAOS_MAX_COST);
                    if (plan) {
                        // отыгранные/ушедшие карты сами выпадают из плана
                        // (фильтр по руке); план исчерпан — «хвост» полухода:
                        // придержанные планом карты стоят до конца полухода,
                        // новые доборы играются прежней логикой
                        plan.left = plan.left.filter((id) => B.eHand.indexOf(id) >= 0);
                        if (plan.done || !plan.left.length) {
                            plan.done = true;
                            affordable = affordable.filter(
                                (x) => plan.hold.indexOf(x.id) < 0);
                        } else {
                            affordable = affordable.filter(
                                (x) => plan.left.indexOf(x.id) >= 0);
                            if (!affordable.length) plan.done = true;
                        }
                    }
                    // W132: комбо-hold действует и в жадном хвосте полухода
                    // (плана нет/исчерпан) — удержанные половинки пар не идут.
                    // Рядом — РЕЗЕРВ энергии под пару: жадный цикл не имеет
                    // права сжечь ⚡, которые след. полуход тратит на ПАРУ
                    // (иначе hold бесполезен: энергия уходит дешёвым картам,
                    // партнёр снова не по карману — связка не сходится)
                    affordable = comboHoldFilter(affordable);
                    if (AI_W.comboOn && comboHeldIds && comboHeldIds.length) {
                        const income = A.spheresTotal() + 1; // доход след. своего
                        let res = 0;
                        for (const id of comboHeldIds) {
                            const c = aiComboHand(id);
                            if (c) res = Math.max(res,
                                effCost(id, "e") + c.cost - income);
                        }
                        if (res > 0)
                            affordable = affordable.filter((x) =>
                                (lethalSet && lethalSet.has(x.id))
                                || effCost(x.id, "e") <= B.eEnergy - res);
                    }
                    // W144 (юзер: «играть вокруг героя врага»): foeOn —
                    // редкие «необычные» решения против способности ГЕРОЯ
                    // противника (не карт): foeVoidBait — «Магопуты»
                    // отменяют ПЕРВУЮ карту за бой: подставляем самую
                    // дешёвую играбельную (не lethal — пакет важнее),
                    // спасая дорогие карты; foeReflectBait — «Тёмный
                    // владыка» отражает ПЕРВЫЙ урон своей базе: сперва
                    // дешёвый тычок baseDmg-заклинанием, крупный — следом
                    // (lethal не трогаем: убивает раньше отражения).
                    // Итерация сыграет только приманку — affordable
                    // переформируется, следующие карты пойдут как обычно
                    if (AI_W.foeOn && affordable.length > 1) {
                        const fAb = (heroDefOf("p") || {}).ability;
                        let baitId = null;
                        if (AI_W.foeVoidBait && fAb === "firstCardVoid"
                                && !B.heroFlags.firstCard.e) {
                            const bait = affordable
                                .filter((x) => !(lethalSet && lethalSet.has(x.id)))
                                .sort((a, b) => effCost(a.id, "e")
                                    - effCost(b.id, "e"))[0];
                            // жертвуем, только если есть что спасать —
                            // в руке карта дороже приманки
                            if (bait && B.eHand.some((id) =>
                                    effCost(id, "e") > effCost(bait.id, "e")))
                                baitId = bait.id;
                        } else if (AI_W.foeReflectBait && fAb === "baseReflect"
                                && !B.heroFlags.baseReflect.p && !lethalSet) {
                            const bd = affordable
                                .filter((x) => x.def.spell
                                    && x.def.spell.baseDmg > 0)
                                .sort((a, b) => a.def.spell.baseDmg
                                    - b.def.spell.baseDmg);
                            if (bd.length >= 2
                                    && bd[0].def.spell.baseDmg < bd[1].def.spell.baseDmg
                                    && bd[1].def.spell.baseDmg >= 2)
                                baitId = bd[0].id;
                        }
                        if (baitId)
                            affordable = affordable.filter((x) => x.id === baitId);
                    }
                    // W103 (юзер): большой банк энергии (хватает на ДВЕ самые
                    // дорогие играбельные карты) — ДОРОГИЕ идут раньше групп:
                    // дешёвыми не замуровывать стол, клетки кончаются раньше
                    // энергии; спецстратегии (chaos/шестерни) не трогаем
                    const top2 = affordable.map((x) => effCost(x.id, "e"))
                        .sort((a, b) => b - a);
                    const bigBank = !chaosHold
                        && affordable.length >= 2
                        && B.eEnergy >= top2[0] + top2[1];
                    // W104 (юзер): постройка-аура выходит РАНЬШЕ существ того
                    // же полухода даже при большом банке — иначе лагерь/роща
                    // вставали после уже призыванных и усиливали только
                    // будущих (в лиге так дважды терялись усиления).
                    // W132 (причинный анализ позиций): это РАННЯЯ эвристика —
                    // в ранних раундах «аура первой» даёт +2 медианного
                    // преимущества (z=2.67), после — нейтральна, в поздних
                    // ВРЕДИТ (z=−4.8: поздняя аура усиливает некого, существо
                    // нужнее). auraFirstTurns — до какого РАУНДА гнать ауры
                    // первыми (99 = всегда, прежнее поведение)
                    const isAuraB = (x) => B.turnNo <= AI_W.auraFirstTurns
                        && x.def.type === "building"
                        && (x.def.campAura || x.def.campfire || x.def.sprout
                            || x.def.groveAura || x.def.elementalCircle
                            || x.def.altarSword || x.def.treeHomes);
                    // W124 (юзер, «видимость колоды»): летальный пакет ВРУЧНУЮ
                    // виден в пуле врага (колода+сброс публичны) — если его
                    // хватит на НАШУ базу, гонка: группы раньше дорогих карт
                    // (bigBank больше не ставит дорогих существ вперед урона)
                    const race = AI_W.poolOn && AI_W.poolRaceK > 0
                        && aiEnemyLethal() >= B.enemyBase;
                    if (plan && !plan.done) {
                        // W114: активный план — порядок КАРТ ПЛАНА, остальная
                        // сортировка (группы/банк) не применяется: дерево
                        // уже оценило связки на модели поля
                        const rk = (x) => plan.left.indexOf(x.id);
                        affordable.sort((a, b) => rk(a.id) - rk(b.id));
                    } else {
                    // W132: половинки играбельной пары — вперёд очереди
                    // (вес лучшей пары карты среди остальных играбельных);
                    // рядом — определитель эмпирического ПОРЯДКА пар
                    let comboRank = null;
                    // жёсткий порядок — только comboHardOn (независимо от
                    // мягкого ранга comboOrderOn; по умолчанию выкл)
                    const comboOrderOW = (AI_W.comboOn && AI_W.comboHardOn)
                        ? aiComboOrderW : null;
                    if (AI_W.comboOn && AI_W.comboOrderOn) {
                        comboRank = {};
                        for (const x of affordable) {
                            // lethal-пакет — вне конкуренции со связками
                            if (lethalSet && lethalSet.has(x.id)) {
                                comboRank[x.id] = 999;
                                continue;
                            }
                            let r = 0;
                            for (const y of affordable)
                                if (y !== x) r = Math.max(r, aiComboW(x.id, y.id));
                            comboRank[x.id] = r;
                        }
                    }
                    affordable.sort((a, b) => {
                        // W132: эмпирический ПОРЯДОК пар — первое правило
                        // очереди: «Скелет-лучник до Поля костей» и пр.
                        // (положительный вес — a раньше b). Не перебивает
                        // lethal-пакет и гонку баз (темп важнее эмпирики)
                        if (comboOrderOW && !race
                            && !(lethalSet && (lethalSet.has(a.id) || lethalSet.has(b.id)))) {
                            const ow = comboOrderOW(a.id, b.id);
                            if (ow) return ow > 0 ? -1 : 1;
                        }
                        if (comboRank && comboRank[b.id] !== comboRank[a.id])
                            return comboRank[b.id] - comboRank[a.id];
                        // W110: lethal-пакет — раньше всего; монолит при
                        // готовом комбо (W103, юзер) — следом (группа 0.5)
                        const grp = (x) => lethalSet && lethalSet.has(x.id) ? -1
                            : (x.def.monolith && monolithCombo) ? 0.5
                            : aiGroup(x.id, x.def);
                        if (bigBank) {
                            if (race) return grp(a) - grp(b)
                                || effCost(b.id, "e") - effCost(a.id, "e");
                            return (isAuraB(a) ? 0 : 1) - (isAuraB(b) ? 0 : 1)
                                || effCost(b.id, "e") - effCost(a.id, "e")
                                || grp(a) - grp(b);
                        }
                        // порядок — по правилам связок (двигатели до урона и
                        // существ, усиления после), внутри группы дороже раньше
                        // (W105: «шестерням» тоже — тяжёлые «Сдвиги» выходят
                        // первыми, копления тройки больше нет); магу
                        // chaosPlay — наоборот: платить по минимуму
                        return grp(a) - grp(b)
                            || (chaosHold
                                ? effCost(a.id, "e") - effCost(b.id, "e")
                                : effCost(b.id, "e") - effCost(a.id, "e"));
                    });
                    } // else (без плана)
                    if (!affordable.length) {
                        // W124: стоп «играть нечего» — различаем пустой карман
                        // и придерживание (хаос-маг / план дерева)
                        markPass(rawAff.length
                            ? (chaosHold ? "chaosHold"
                                : (plan && plan.done && plan.hold.length
                                    ? "planHold" : "held"))
                            : "noAffordable",
                        affordable.length, rawAff.length);
                        if (await tryRefill()) continue;
                        // W103 (юзер): тупик — играть нечего, добирать
                        // неоткуда; МЕНЯЕМ одну карту: самая дорогая «не по
                        // карману» уходит в сброс, взамен добор (даже сверх
                        // 7 карт — легальная замена для продвижения вариантов)
                        // W106 (юзер, «пусть его играет»): энергия копится,
                        // а доход растёт каждый ход — карта, до которой ИИ
                        // дотянется за пару ходов, должна быть СЫГРАНА, а не
                        // съедена заменой (в лиге W105 замена выбрасывала
                        // «Старейший древоброд» ×36, «Рой светлячков» ×35 и
                        // «Мастера порталов» ×64 прямо перед тем, как те
                        // становились по карману). Безнадёжная — дороже
                        // энергии + дохода за два хода; одиночную карту в
                        // руке не трогаем вовсе — её ИИ доиграет сам
                        if (!deadSwapUsed && B.eHand.length >= 2) {
                            const inc = A.spheresTotal();
                            let worst = -1, worstScore = -1;
                            B.eHand.forEach((id, i2) => {
                                const c2 = effCost(id, "e");
                                if (c2 <= B.eEnergy) return; // по карману — не трогаем
                                // «безнадёжная» (W106): дороже энергии + K×дохода;
                                // «застрявшая» (W110): гейт не пускает N СВОИХ
                                // полуходов подряд (возраст считает обёртка
                                // aiPlay) — иначе карта висит до конца боя
                                const held = (B.holdAge && B.holdAge.e[id]) || 0;
                                const hopeless = c2 > B.eEnergy + AI_W.deadSwapIncK * inc;
                                const stuck = held >= AI_W.deadSwapHold;
                                if ((hopeless || stuck)
                                    && c2 + held > worstScore) {
                                    worstScore = c2 + held; worst = i2;
                                }
                            });
                            if (worst >= 0) {
                                deadSwapUsed = true;
                                const id = B.eHand.splice(worst, 1)[0];
                                B.eDiscard.push(id);
                                noteDiscard(1, "e", [id], "discard");
                                floatText(1330, 140,
                                    "↺ " + GAME_LOC.t(`card.${id}.name`), 0xb7d0ef);
                                drawEnemy(1);
                                refreshHud();
                                await delay(0.3 / animK());
                                continue;
                            }
                        }
                        return;
                    }
                    let played = false;
                    for (const pick of affordable) {
                        // W134 (латентный баг, всплыл лигой тренировки):
                        // план строился по СНАПШОТУ руки, а эффекты этого же
                        // полухода (chaosFreePlay «Искусственного мага»,
                        // сброс-поднабор «Возжённого нетопыря», возврат
                        // «Сброса разума») руку мутируют — pick.i устаревал:
                        // addUnit(undefined) ронял бой, а splice(pick.i)
                        // тихо съедал НЕ ТУ карту. Индекс перечитываем по id;
                        // карту, покинувшую руку, пропускаем
                        pick.i = B.eHand.indexOf(pick.id);
                        if (pick.i < 0) { gateSkip(pick.id, "handGone"); continue; }
                        const def = pick.def;
                        if (def.type === "unit" || def.type === "building") {
                            // «Ловушка-пузырь» (wis119) игрока: существо под
                            // пузырём запрещает ИИ играть карту призыва того
                            // же существа (спека юзера) — карту держим
                            if (def.type === "unit" && bubbleBlocked("e", pick.id)) { gateSkip(pick.id, "bubble"); continue; }
                            // «Отряд эльфов» забирает ВСЮ энергию: без запаса в 2⚡
                            // это 0–1/0–1 — карту не переводим (группа 3.5 уже
                            // отодвинула его в конец розыгрыша)
                            if (def.energyToStats && B.eEnergy - effCost(pick.id, "e") < 2) { gateSkip(pick.id, "energyToStats"); continue; }
                            // «Три монолита» — движок добора: без существа в
                            // руке и пары «цена+1» в колоде он пока пустой;
                            // при готовом комбо приоритет ВЫСОКИЙ (W103, юзер:
                            // монолит → юнит рядом → в руке карта дороже)
                            if (def.monolith && !monolithCombo) { gateSkip(pick.id, "monolith"); continue; }
                            // «Круг стихий»: без Элементаля в руке призыв пуст —
                            // постройку держим до подходящей карты
                            if (def.elementalCircle && !B.eHand.some((id) => {
                                const d = CARDS[id];
                                return d && d.type === "unit" && d.subtype === "elemental";
                            })) { gateSkip(pick.id, "elementalCircle"); continue; }
                            // клетка — по правилам связок: строения-ауры соседства
                            // к существам и будущим призывам, прочие в тыл; существа —
                            // рядом с лагерем/костром/заклинателем клинков
                            const spot = def.type === "building"
                                ? aiBuildingSpot(def) : aiUnitSpot(def);
                            if (!spot) { gateSkip(pick.id, "noSpot"); continue; }
                            showEnemyCard(pick.id); // карта врага слева ≥ 1с
                            await delay(enemyPlayDelay());
                            const [col, row] = spot;
                            await enemyFlyCard(cellXY(col, row)); // полёт к клетке
                            // W134: рука ЖИВАЯ — между планом и исполнением
                            // её меняют отложенные эффекты (await-анимации
                            // качают планировщик): резолв по id, покинувшую
                            // руку карту пропускаем (прежде B.eHand[pick.i]
                            // давал undefined → addUnit падал)
                            const cardId = pick.id;
                            if (B.eHand.indexOf(cardId) < 0) {
                                gateSkip(cardId, "handGone");
                                hideEnemyCard();
                                continue;
                            }
                            // «Отмена призыва» (wis84) игрока: существо не
                            // появляется, карта и энергия врага потрачены;
                            // «Иссушение почвы» (dec133) — то же для ПОСТРОЕК.
                            // «Магопуты»-герой игрока (W77): первая карта
                            // врага за бой отменяется — то же самое
                            if ((def.type === "unit"
                                    && (heroVoidFirstCancel("e")
                                        || counterTrapConsume("p", "counterSummon")))
                                || (def.type === "building"
                                    && (heroVoidFirstCancel("e")
                                        || counterTrapConsume("p", "counterBuilding")))) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                B.eDiscard.push(cardId);
                                cryptSettle("e", cardId); // «Склеп»
                                noteDiscard(1, "e", [cardId]);
                                floatText(960, 500,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            // «Искусственный маг» (wtArtMage, W81): эффект
                            // карты ОТМЕНЁН (энергия потрачена), взамен
                            // бесплатно разыгрывается другая случайная
                            // карта его руки
                            {
                                const hdE = heroDefOf("e");
                                if (hdE && hdE.ability === "chaosPlay") {
                                    B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                    B.eEnergy -= effCost(cardId, "e");
                                    notePlay("e"); // «Конвейер» (tim225)
                                    consumeEpicDiscount(cardId, "e");
                                    B.eDiscard.push(cardId);
                                    cryptSettle("e", cardId);
                                    noteDiscard(1, "e", [cardId]);
                                    floatText(960, 500,
                                        "✕ " + GAME_LOC.t(`card.${cardId}.name`),
                                        0x9a8ce8);
                                    hideEnemyCard();
                                    await chaosFreePlay("e");
                                    played = true;
                                    break;
                                }
                            }
                            // «Возжённый нетопырь» (dstr299, W100) по
                            // альтернативной стоимости: энергии на обычную
                            // уплату не хватило — точный поднабор руки уходит
                            // в сброс (нотификация «скидыванием»: Хозяин той
                            // стороны / Корм для портала / Мини-портал
                            // срабатывают как от любого сброса); энергия
                            // НЕ платится. Поднабор пересчитывается на месте
                            // (решение за ход могло устареть после первого
                            // нетопыря); не набралось — карту не тратим
                            const batAlt = def.flyAltCost
                                && B.eEnergy < effCost(cardId, "e")
                                ? altCostSubset(B.eHand, cardId, def.cost || 0)
                                : null;
                            if (def.flyAltCost && B.eEnergy < effCost(cardId, "e")
                                && !batAlt) { gateSkip(cardId, "batAlt"); continue; } // ни энергии, ни набора
                            if (batAlt) {
                                for (const id of batAlt) {
                                    B.eHand.splice(B.eHand.indexOf(id), 1);
                                    B.eDiscard.push(id);
                                    noteDiscard(1, "e", [id], "discard");
                                }
                            }
                            // сам нетопырь — по indexOf (поднабор выше съехал
                            // с индексов pick.i)
                            B.eHand.splice(B.eHand.indexOf(cardId), 1);
                            if (!batAlt) B.eEnergy -= effCost(cardId, "e");
                            notePlay("e"); // «Конвейер» (tim225)
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            // playCtx для «Сброса разума» (decMind): dec146 при
                            // появлении сбрасывает карту; свой выход карты в
                            // сброс ниже вернёт её в руку, если помечена
                            B.playCtx = { side: "e", cardId };
                            addUnit("e", cardId, col, row);
                            B.eDiscard.push(cardId); // как у игрока: карта в сброс (иначе цикл «Трусливого гоблина» не работает)
                            noteDiscard(1, "e", [cardId]);
                            cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                            B.playCtx = null;
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "trap") {
                            // лимита ловушек нет (просил юзер) — ставим любую.
                            // Руна («Наскальная рунопись») — на существо игрока:
                            // на сильнейшего (при его атаке ИИ бесплатно
                            // разыграет случайное заклинание своей колоды).
                            // W60: «Призрачные споры» — КЛЕТОЧНАЯ ловушка,
                            // ставится на общих основаниях ниже (aiTrapSpot)
                            if (def.trap.effect === "castRandom") {
                            const pu = B.units.filter((v) => v.side === "p" && v.def.type === "unit")
                                .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                            if (!pu) { gateSkip(pick.id, "noRuneTarget"); continue; }
                                showEnemyBack(); // какую руну повесил — загадка (просил юзер)
                                await delay(enemyPlayDelay());
                                await enemyFlyCard(cellXY(pu.col, pu.row), { s: 0.3 });
                                const cardId = pick.id; // W134: резолв по id (рука живая)
                                if (B.eHand.indexOf(cardId) < 0) {
                                    gateSkip(cardId, "handGone");
                                    hideEnemyCard();
                                    continue;
                                }
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                multiFury(cardId, "e"); // «Ярость природы» (Рыжий лес)
                                multiValor(cardId, "e"); // «Растущая доблесть» (Белая пуща, W62)
                                multiWeave(cardId, "e"); // «Переплетение сил» (Небесный дворец, W75)
                                multiStudy(cardId, "e"); // «Глубокое изучение» (Магодром, W79)
                                multiPortal(cardId, "e"); // «Из портала» (Портал в бездну, W95)
                                cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                                // «Магопуты»-герой игрока (W77): первая карта
                                // врага — отменена (энергия потрачена)
                                if (heroVoidFirstCancel("e")) {
                                    floatText(cellXY(pu.col, pu.row).x,
                                        cellXY(pu.col, pu.row).y - 60,
                                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                    hideEnemyCard();
                                    played = true;
                                    break;
                                }
                                armTrap("e", cardId, 0, 0, pu);
                                afterTrapPlaced("e"); // «Элементаль молнии» (W77)
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            // «Посвящение тьме» (dec154): без юнит-карты в руке
                            // ловушка — голое убийство за 5⚡; держим до карты
                            if (def.trap.effect === "darkOffering"
                                && !B.eHand.some((id) =>
                                    CARDS[id] && CARDS[id].type === "unit")) { gateSkip(pick.id, "darkOffering"); continue; }
                            // «Засадный отряд» (hon196) — на СВОЮ постройку
                            // (переднюю — её чаще атакуют); построек нет —
                            // карту держим
                            if (def.trap.effect === "ambushRise") {
                                const blds = B.units.filter((v) => v.side === "e"
                                    && v.def.type === "building")
                                    .sort((a, b) => b.row - a.row);
                                if (!blds.length) { gateSkip(pick.id, "ambushRise"); continue; }
                                showEnemyBack();
                                await delay(enemyPlayDelay());
                                await enemyFlyCard(cellXY(blds[0].col, blds[0].row),
                                    { s: 0.3 });
                                const cardId = pick.id; // W134: резолв по id (рука живая)
                                if (B.eHand.indexOf(cardId) < 0) {
                                    gateSkip(cardId, "handGone");
                                    hideEnemyCard();
                                    continue;
                                }
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                                // «Магопуты»-герой игрока (W77): первая карта
                                // врага — отменена (энергия потрачена)
                                if (heroVoidFirstCancel("e")) {
                                    floatText(cellXY(blds[0].col, blds[0].row).x,
                                        cellXY(blds[0].col, blds[0].row).y - 60,
                                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                    hideEnemyCard();
                                    played = true;
                                    break;
                                }
                                armTrap("e", cardId, 0, 0, blds[0]);
                                afterTrapPlaced("e"); // «Элементаль молнии» (W77)
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
                            if (!spot) { gateSkip(pick.id, "noTrapSpot"); continue; }
                            showEnemyBack(); // какая ловушка — загадка (просил юзер)
                            await delay(enemyPlayDelay());
                            const [col, row] = spot;
                            await enemyFlyCard(cellXY(col, row), { s: 0.3 });
                            const cardId = pick.id; // W134: резолв по id (рука живая)
                            if (B.eHand.indexOf(cardId) < 0) {
                                gateSkip(cardId, "handGone");
                                hideEnemyCard();
                                continue;
                            }
                            // «Искусственный маг» (wtArtMage, W81): ловушка
                            // НЕ ставится (энергия потрачена), взамен
                            // бесплатно разыгрывается другая карта руки
                            {
                                const hdE = heroDefOf("e");
                                if (hdE && hdE.ability === "chaosPlay") {
                                    B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                    B.eEnergy -= effCost(cardId, "e");
                                    notePlay("e"); // «Конвейер» (tim225)
                                    consumeEpicDiscount(cardId, "e");
                                    B.eDiscard.push(cardId);
                                    cryptSettle("e", cardId);
                                    noteDiscard(1, "e", [cardId]);
                                    floatText(960, 500,
                                        "✕ " + GAME_LOC.t(`card.${cardId}.name`),
                                        0x9a8ce8);
                                    hideEnemyCard();
                                    await chaosFreePlay("e");
                                    played = true;
                                    break;
                                }
                            }
                            B.eHand.splice(B.eHand.indexOf(cardId), 1); // W134: по id (рука живая)
                            B.eEnergy -= effCost(cardId, "e");
                            notePlay("e"); // «Конвейер» (tim225)
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                            multiFury(cardId, "e"); // «Ярость природы» (Рыжий лес, W60)
                            multiValor(cardId, "e"); // «Растущая доблесть» (W62)
                            multiWeave(cardId, "e"); // «Переплетение сил» (Небесный дворец, W75)
                            multiStudy(cardId, "e"); // «Глубокое изучение» (Магодром, W79)
                            multiPortal(cardId, "e"); // «Из портала» (Портал в бездну, W95)
                            // «Магопуты»-герой игрока (W77): первая карта
                            // врага — отменена (энергия потрачена)
                            if (heroVoidFirstCancel("e")) {
                                floatText(cellXY(col, row).x, cellXY(col, row).y - 60,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            armTrap("e", cardId, col, row);
                            afterTrapPlaced("e"); // «Элементаль молнии» (W77)
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "spell") {
                            if (!aiSpellPlayable(def)) { gateSkip(pick.id, "spellGate"); continue; }
                            // карта врага — лицом слева, пауза ≥ 1с: игрок видит,
                            // что сейчас произойдёт (просил юзер)
                            showEnemyCard(pick.id);
                            await delay(enemyPlayDelay());
                            await enemyFlyCard({ x: 960, y: 430 },
                                { s: 0.42, a1: 0 }); // к центру поля и растворяется
                            const cardId = pick.id; // W134: резолв по id (рука живая)
                            if (B.eHand.indexOf(cardId) < 0) {
                                gateSkip(cardId, "handGone");
                                hideEnemyCard();
                                continue;
                            }
                            // «Отмена заклинания» (wis83) игрока: эффект не
                            // срабатывает, карта и энергия врага потрачены.
                            // «Магопуты»-герой игрока (W77): первая карта
                            // врага за бой отменяется — то же самое
                            if (heroVoidFirstCancel("e")
                                || counterTrapConsume("p", "counterSpell")) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eDiscard.push(cardId);
                                noteDiscard(1, "e", [cardId]);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                                floatText(960, 500,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            // «Искусственный маг» (wtArtMage, W81):
                            // заклинание ОТМЕНЕНО (энергия потрачена),
                            // взамен бесплатно разыгрывается другая
                            // случайная карта его руки
                            {
                                const hdE = heroDefOf("e");
                                if (hdE && hdE.ability === "chaosPlay") {
                                    B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                    B.eDiscard.push(cardId);
                                    noteDiscard(1, "e", [cardId]);
                                    B.eEnergy -= effCost(cardId, "e");
                                    notePlay("e"); // «Конвейер» (tim225)
                                    consumeEpicDiscount(cardId, "e");
                                    cryptSettle("e", cardId);
                                    floatText(960, 500,
                                        "✕ " + GAME_LOC.t(`card.${cardId}.name`),
                                        0x9a8ce8);
                                    hideEnemyCard();
                                    await chaosFreePlay("e");
                                    played = true;
                                    break;
                                }
                            }
                            // playCtx для «Сброса разума» (decMind): пометка
                            // ставится на эффекты карты; возврат — в noteDiscard
                            // при выходе самой карты в сброс ниже
                            B.playCtx = { side: "e", cardId };
                            // «Ярость природы» (Рыжий лес, W60): зеркала
                            // spendCard игрока у ИИ НЕ БЫЛО — мультицветные
                            // заклинания врага (sg243–247) молча не били базу
                            multiFury(cardId, "e");
                            multiValor(cardId, "e"); // «Растущая доблесть» (W62)
                            multiWeave(cardId, "e"); // «Переплетение сил» (Небесный дворец, W75)
                            multiStudy(cardId, "e"); // «Глубокое изучение» (Магодром, W79)
                            multiPortal(cardId, "e"); // «Из портала» (Портал в бездну, W95)
                            if (def.spell.copyLast) {
                                // «Горящие руны»: повтор ПОСЛЕДНЕГО заклинания тем
                                // же кодом эффектов (бесплатно для его цены)
                                if (enemyReplayLast()) B.lastSpell.e = "str25"; // повтор самой себя — цепочка
                            } else {
                                enemyCastSpellEffect(def, false, null, true);
                            }
                            B.playCtx = null;
                            // indexOf: панельные эффекты кладут карты в руку —
                            // индексы могли сместиться
                            B.eHand.splice(B.eHand.indexOf(cardId), 1);
                            // «Заклятый древоброд» целью — цена заклинания на 1 меньше
                            // (повтор «Горящими рунами» бесплатен — скидка не копится)
                            const tOff = def.spell.copyLast ? 0 : castTargetOff;
                            castTargetOff = 0;
                            B.eEnergy = (def.spell.drainAll || def.spell.stormAll
                                || def.spell.crushEnergy // «Древомощь» сливает всё (sg243)
                                || def.spell.highPower) // «Высокая мощность» (wt274, W80): всю энергию потратил powerAct
                                ? 0 : B.eEnergy - Math.max(0, effCost(cardId, "e") - tOff);
                            notePlay("e"); // «Конвейер» (tim225)
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            heroFirstSpellEnergy("e"); // «Дуновение опасности»
                            // рука ИИ тоже не больше 7 — излишек панельных доборов
                            // сбрасывается случайно (как панель сброса у игрока);
                            // рубашки улетают в его сброс (W32, анимации руки)
                            while (B.eHand.length > HAND_MAX) {
                                // W143: dscPickOn — сбрасываем самую выгодную
                                // к сбросу карту (приёмники − цена потери),
                                // а не случайную
                                let di = (Math.random() * B.eHand.length) | 0;
                                if (AI_W.dscPickOn && A.aiDiscardOne
                                    && B.eHand.length > 1) {
                                    let bs = null;
                                    for (let i = 0; i < B.eHand.length; i++) {
                                        const v = aiDiscardOne("e", B.eHand[i]);
                                        if (bs === null || v > bs) { bs = v; di = i; }
                                    }
                                }
                                const sp = B.eHand.splice(di, 1)[0];
                                flyEnemyDiscard();
                                B.eDiscard.push(sp);
                                noteDiscard(1, "e", [sp], "discard");
                                B.scorch.e.delete(sp); // метка ушла вместе с картой
                            }
                            if (B.scorch.e.has(cardId) || def.burn) { // «Сожжение»: карта удалена из боя
                                B.scorch.e.delete(cardId);
                                floatText(960, 640, `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                                sfx("chpoc");
                            } else { B.eDiscard.push(cardId); noteDiscard(1, "e", [cardId]); }
                            cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                            heroStrReplay("e", cardId, def); // «Мастера огня»
                            B.lastSpell.e = cardId;
                            afterSpellPlayed("e"); // «Заклинатель клинков» на поле
                            hideEnemyCard();
                            refreshHud();
                            if (checkEnd()) return;
                            played = true;
                            break;
                        }
                    }
                    if (!played) {
                        // W124: стоп «были играбельные, но гейты не пустили
                        // ни одну» — в skips по каждой карте её гейт
                        markPass("gated", affordable.length, rawAff.length);
                        // W114: карты активного плана не сыгралась (гейты
                        // реального поля строже модели) — снимаем план;
                        // придержанные планом карты стоят до конца полухода,
                        // добор в тупике — прежний
                        if (plan && !plan.done) plan.done = true;
                        if (!await tryRefill()) return;
                        continue;
                    }
                    refreshHud();
                    await delay(0.4 / animK());
                }
            };
        }
    };
})();
