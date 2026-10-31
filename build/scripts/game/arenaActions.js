// СЦЕНА «АРЕНА»: действия игрока: выбор, призыв, заклинания.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installActions = function installActions(A) {
        with (A) {
            A.playerTurnStart = async function playerTurnStart() {
                B.turnNo += 1; // шкала подросла: сфер теперь на одну больше
                B.phase = "anim";
                B.selected = null;
                B.spellTarget = false;
                refreshHud();
                firewallTick("e"); // стена костров врага — конец хода врага
                sproutTick("e");   // ростки врага подросли — конец его хода
                auraLightTick("e"); // «Аура света» врага — конец его хода
                if (B.stopped || B.phase === "over") return;
                banner(t("arena.yourTurn"));
                fxEvent("turn", { side: "p", color: 0xffd98c });
                await delay(0.4 / animK());
                if (B.stopped) return;
                upkeep("p"); // грибницы игрока
                poisonTick("p"); // яд: до марша (просил юзер)
                await delayArrive("p"); // «Сдвиг» (Время): созревшие являются
                await marchSide("p");
                timeCavePulse("p"); // «Пещера времени»: призыв после марша — значок не тает в этом же ходу
                if (B.stopped || B.phase === "over") return;
                B.phase = "player";
                layoutHand();
                redrawHighlight();
                refreshHud();
                // «Торговец» (hon183): добрал в начале хода — теперь выбор
                // карты для сброса (панель поверх; несколько Торговцев —
                // несколько очередей). Открытие ПОСЛЕ марша: панель
                // заморозила бы анимации боя
                if (B.pendingDiscard > 0) {
                    if (B.hand.length) buildDiscardPanel("trade");
                    else B.pendingDiscard = 0; // скидывать нечего — очередь в никуда
                }
                // «Пень обряда»: в начале хода — взгляд на верхнюю карту колоды
                if (B.units.some((b) => b.side === "p" && b.def.type === "building"
                    && b.def.riteStump)) openStumpPanel();
            };

            // ── Действия игрока ────────────────────────────────────────────────
            A.spendCard = function spendCard(handIdx) { // вынимает карту из руки в сброс
                const cardId = B.hand[handIdx];
                if (B.scorch.p.has(cardId)) { // «Сожжение»: карта удаляется из боя
                    B.scorch.p.delete(cardId);
                    floatText(960, 640, `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                    sfx("rocket");
                } else {
                    B.discard.push(cardId);
                    noteDiscard(1, "p", [cardId]);
                }
                B.hand.splice(handIdx, 1);
                B.selected = null;
                B.spellTarget = false;
                cryptSettle("p", cardId); // «Склеп» (dec157): сыгранная из него карта — в колоду
                return cardId;
            };

            // «Склеп» (dec157): карта, взятая из сброса постройки, после
            // розыгрыша (выход в сброс) замешивается в колоду. Сожжённая
            // («Сожжение») из боя удалена — не возвращаем; карточки нет в
            // сбросе (вернул в руку «Мастером огня» и пр.) — не трогаем.
            // ИИ симметрично: метка eCryptTaken, те же правила
            A.cryptSettle = function cryptSettle(side, cardId) {
                const mark = side === "p" ? B.cryptTaken : B.eCryptTaken;
                if (!mark || mark !== cardId) return;
                if (side === "p") B.cryptTaken = null; else B.eCryptTaken = null;
                if (B.scorch[side].has(cardId)) return;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const deck = side === "p" ? B.deck : B.eDeck;
                const di = discard.lastIndexOf(cardId);
                if (di < 0) return;
                discard.splice(di, 1);
                deck.push(cardId);
                shuffle(deck);
                floatText(960, side === "p" ? 640 : 300,
                    "⇵ " + GAME_LOC.t(`card.${cardId}.name`), 0xb7d0ef);
                sfx("chpoc");
            };

            // Конец хода стороны: взятая из «Склепа», но не разыгранная
            // карта возвращается в сброс (она формально из сброса и вышла)
            A.cryptRefund = function cryptRefund(side) {
                const mark = side === "p" ? B.cryptTaken : B.eCryptTaken;
                if (!mark) return;
                if (side === "p") B.cryptTaken = null; else B.eCryptTaken = null;
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const hi = hand.indexOf(mark);
                if (hi < 0) return;
                hand.splice(hi, 1);
                discard.push(mark);
                if (side === "p") { layoutHand(); refreshHud(); }
                const p = cellXY(2, side === "p" ? 4 : 0);
                floatText(p.x, p.y - 60, "⤓ " + GAME_LOC.t(`card.${mark}.name`), 0x8a7c5e);
            };

            // «Склеп» (dec157, просил юзер): клик по постройке разыгрывает
            // ВЕРХНЮЮ карту сброса СРАЗУ — не «в руку и ждём», а автоматом:
            // карта на миг уходит в руку и играется штатными путями
            // (onCellTap/castSpell — оплата, контрловушки, скидка Архилича
            // как при ручном розыгрыше). Заклинание с целью — автоцель
            // (autoTargetFor), существо/мина — передний ряд, постройка —
            // тыл, руна/споры — сильнейший чужой. Не выходит (нет энергии/
            // клетки/цели) — карта остаётся в сбросе. Одна карта за раз
            A.cryptAutoPlay = function cryptAutoPlay(cardId, fromCol, fromRow) {
                const def = CARDS[cardId];
                const p = cellXY(fromCol, fromRow);
                const deny = () => {
                    floatText(p.x, p.y - 96,
                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8a7c5e);
                    return false;
                };
                if (!def || effCost(cardId, "p") > B.energy) return deny();
                const rows = deployRows("p");
                const free = freeCells(rows);
                const spotIn = (wantRow) => { // ряд занят целиком — любой свободный
                    let pool = free.filter(([, r]) => r === wantRow);
                    if (!pool.length) pool = free;
                    pool.sort((a, b) => Math.abs(a[0] - 2) - Math.abs(b[0] - 2));
                    return pool[0] || null;
                };
                let tap = null; // { col, row } для onCellTap
                if (def.type === "unit" || def.type === "building") {
                    if (!free.length || (def.type === "unit" && bubbleBlocked("p", cardId)))
                        return deny();
                    tap = spotIn(def.type === "unit" ? rows[0] : rows[rows.length - 1]);
                } else if (def.type === "trap") {
                    if (def.trap.effect === "castRandom" || def.trap.effect === "sporeCurse") {
                        // руна/споры — сильнейшее существо врага
                        const foes = B.units.filter((v) => v.side === "e"
                            && v.def.type === "unit")
                            .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row));
                        if (!foes.length) return deny();
                        tap = { col: foes[0].col, row: foes[0].row };
                    } else { // мина — передний ряд: враг ступит раньше
                        if (!free.length) return deny();
                        tap = spotIn(rows[0]);
                    }
                }
                const di = B.discard.lastIndexOf(cardId);
                if (di < 0) return deny();
                B.discard.splice(di, 1);
                B.hand.push(cardId);
                B.cryptTaken = cardId;
                floatText(p.x, p.y - 96,
                    "⤒ " + GAME_LOC.t(`card.${cardId}.name`), 0xb7d0ef);
                sfx("chpoc");
                const idx = B.hand.length - 1;
                const back = () => { // не сыгралась — вернуть в сброс, метку снять
                    const hi = B.hand.indexOf(cardId);
                    if (hi >= 0) B.hand.splice(hi, 1);
                    B.discard.push(cardId);
                    B.cryptTaken = null;
                };
                if (def.type === "spell") {
                    if (def.spell.target === "none" || def.spell.copyLast) {
                        if (!castSpell(idx)) back();
                    } else {
                        const t = autoTargetFor(cardId);
                        if (t === null || !castSpell(idx, t)) back();
                    }
                } else {
                    B.selected = idx;
                    onCellTap(tap[0], tap[1]); // tap — пара [col, row]
                }
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
                return true;
            };

            // снять выбор карты: карты руки снова интерактивны
            A.deselect = function deselect() {
                if (B.selected === null && !B.spellTarget) return;
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            A.onCardTap = function onCardTap(idx) {
                if (B.phase !== "player" || B.discarding || B.picking) return;
                if (B.journeySummon) return; // сначала поставьте (или отмените) призыв
                const def = CARDS[B.hand[idx]];
                if (!def) return;
                if (ctx.sfx) ctx.sfx();
                if (def.type === "spell" && def.spell.target === "none") {
                    castSpell(idx); // без цели — сразу
                    return;
                }
                if (def.type === "trap") {
                    // руна и споры вешаются на существо; лимита ловушек нет
                    // (просил юзер) — можно ставить сколько угодно
                    if (effCost(B.hand[idx]) > B.energy) return;
                    // мина ставится на выбранную пустую клетку — выбор как у юнитов
                    B.selected = B.selected === idx ? null : idx;
                    B.spellTarget = false;
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                // unit/building/spell с прицелом — выбор клетки
                B.selected = B.selected === idx ? null : idx;
                B.spellTarget = B.selected !== null && def.type === "spell";
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            A.onCellTap = function onCellTap(col, row) {
                if (B.phase !== "player" || B.discarding || B.picking) return;
                if (B.journeySummon || B.resurrectSummon) { // бесплатный призыв:
                    // «Глубокое путешествие» (карта из колоды) и «Воскрешение»
                    // hon200 (карта, выбранная в панели из СВОЕГО сброса — она
                    // уже изъята из сброса и вернётся в него как разыгранная)
                    if (!deployRows("p").includes(row) || unitAt(col, row)) return;
                    const cardId = B.journeySummon || B.resurrectSummon;
                    const wasRes = !B.journeySummon && !!B.resurrectSummon;
                    // «Ловушка-пузырь» (wis119) врага: призыв того же существа
                    // под пузырём не проходит — заклинание не тратится, игрок
                    // выбирает другую карту/клетку
                    if (bubbleBlocked("p", cardId)) {
                        floatText(cellXY(col, row).x, cellXY(col, row).y - 60,
                            "✕", 0x8cd0ef);
                        return;
                    }
                    B.journeySummon = null;
                    B.resurrectSummon = null;
                    // «Отмена призыва» (wis84) врага: бесплатный призыв — тоже
                    // призыв; карта уходит в сброс, существо не появляется
                    // (карта «Воскрешения» из сброса — возвращается туда же,
                    // как разыгранная и отменённая)
                    if (counterTrapConsume("e", "counterSummon")) {
                        B.discard.push(cardId);
                        noteDiscard(1, "p", [cardId]);
                        const jp = cellXY(col, row);
                        floatText(jp.x, jp.y - 60,
                            "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    } else {
                        addUnit("p", cardId, col, row); // энергия не тратится
                        // «Глубокое путешествие»: карта «превращается» в существо
                        // и из зон уходит; «Воскрешение»: разыгранная карта
                        // призыва возвращается в сброс (как любой розыгрыш)
                        if (wasRes) B.discard.push(cardId);
                    }
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                if (B.selected === null) {
                    // «Склеп» (dec157): клик по своей постройке СРАЗУ
                    // разыгрывает верхнюю карту сброса (с оплатой) —
                    // просил юзер: не ждать, пока игрок сыграет её сам.
                    // Одна карта за раз (cryptTaken гасит повторный клик)
                    const cb = unitAt(col, row);
                    if (cb && cb.side === "p" && cb.def.type === "building"
                        && cb.def.cryptPlay && B.discard.length && !B.cryptTaken) {
                        cryptAutoPlay(B.discard[B.discard.length - 1], col, row);
                    }
                    return;
                }
                const def = CARDS[B.hand[B.selected]];
                if (!def) return;
                if (B.spellTarget) { // прицел: по врагу, любому существу или строению
                    const sdef = CARDS[B.hand[B.selected]];
                    const u = unitAt(col, row);
                    const tg = sdef.spell.target;
                    if (tg === "anyCell") { // стена костров — подходит любая клетка
                        castSpell(B.selected, { col, row });
                        return;
                    }
                    if (tg === "emptyCell") { // культ кочерыжки — только пустая клетка
                        if (!unitAt(col, row)) castSpell(B.selected, { col, row });
                        else deselect();
                        return;
                    }
                    const typeOk = spellAimable(u) // «Защита от заклинаний» — единая проверка цели
                        && (tg === "anyUnitDmg"
                            ? (u.def.type === "unit"
                                || (u.def.type === "building" && !sdef.spell.noBuildings))
                            : tg === "anyUnitOrFoe" ? u.def.type === "unit" // «Негативный поток»: существо или база врага
                            : tg === "enemyUnit" ? u.def.type === "unit" // «Тёмный контроль»: только существо врага
                            : tg === "ownBuilding" ? u.def.type === "building"
                            : u.def.type === "unit");
                    const sideOk = !u
                        || ((tg === "ownUnit" || tg === "ownBuilding") ? u.side === "p"
                        : tg === "enemyUnit" ? u.side !== "p" : true);
                    const known = tg === "anyUnit" || tg === "anyUnitDmg"
                        || tg === "anyUnitOrFoe" || tg === "enemyUnit"
                        || tg === "ownUnit" || tg === "ownBuilding";
                    // «Ледяной удар»: у цели должен быть хотя бы один сосед-
                    // существо, иначе заклинание не разыгрывается
                    const effectOk = !sdef.spell.iceStrike || !!iceStrikeVictim(u);
                    if (u && typeOk && sideOk && known && effectOk) castSpell(B.selected, { col, row });
                    else deselect(); // мимо цели — снять выбор
                    return;
                }
                if (def.type === "trap") {
                    // руна («Наскальная рунопись») и споры («Призрачные споры») —
                    // наоборот, на существо; споры — только на существо ВРАГА
                    if (def.trap.effect === "castRandom" || def.trap.effect === "sporeCurse") {
                        const u = unitAt(col, row);
                        if (!u || u.def.type !== "unit"
                            || (def.trap.effect === "sporeCurse" && u.side === "p")) {
                            deselect();
                            return;
                        }
                        B.energy -= effCost(B.hand[B.selected]); // цена ловушки
                        const cardId = spendCard(B.selected);
                        consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                        if (def.trap.effect === "sporeCurse") {
                            // «Битва умов» (wis114) врага отменяет и споры:
                            // карта и энергия потрачены, эффект не срабатывает
                            if (trapPlayCountered("p")) {
                                const sp = cellXY(u.col, u.row);
                                floatText(sp.x, sp.y - 60,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                            } else addSpores(u);
                        } else if (!armTrap("p", cardId, 0, 0, u)) {
                            const sp = cellXY(u.col, u.row);
                            floatText(sp.x, sp.y - 60,
                                "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                        }
                        deselect();
                        layoutHand();
                        redrawHighlight();
                        refreshHud();
                        return;
                    }
                    // «Засадный отряд» (hon196) — на СВОЮ ПОСТРОЙКУ (вторая
                    // ловушка-«на объект» после руны): когда она умирает,
                    // сработает засада (ambushRiseAct из killUnit)
                    if (def.trap.effect === "ambushRise") {
                        const u = unitAt(col, row);
                        if (!u || u.side !== "p" || u.def.type !== "building") {
                            deselect();
                            return;
                        }
                        B.energy -= effCost(B.hand[B.selected]); // цена ловушки
                        const cardId = spendCard(B.selected);
                        consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                        if (!armTrap("p", cardId, 0, 0, u)) {
                            const sp = cellXY(u.col, u.row);
                            floatText(sp.x, sp.y - 60,
                                "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                        }
                        deselect();
                        layoutHand();
                        redrawHighlight();
                        refreshHud();
                        return;
                    }
                    // «Опутывание корней» (grw35) — на ЛЮБУЮ клетку поля, даже
                    // под существо: «нахождение» — условие срабатывания, оно
                    // опутывается сразу; прочие ловушки — только пустая клетка
                    const occupant = unitAt(col, row);
                    if (occupant && def.trap.effect !== "entangle") { deselect(); return; }
                    B.energy -= effCost(B.hand[B.selected]); // цена ловушки
                    const cardId = spendCard(B.selected);
                    consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                    const armed = armTrap("p", cardId, col, row);
                    if (!armed) { // «Битва умов» (wis114) врага: ловушка не ставится
                        const sp = cellXY(col, row);
                        floatText(sp.x, sp.y - 60,
                            "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    }
                    if (armed && occupant) triggerCellTraps(occupant); // сработала сразу
                    deselect();
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                // мимо допустимых клеток (не в зоне / занято / не хватает маны) —
                // снять выбор: карты руки снова кликабельны (при выбранной карте
                // они неинтерактивны, чтобы крупные карты не съедали клики полем)
                if (!deployRows("p").includes(row) || unitAt(col, row) || effCost(B.hand[B.selected]) > B.energy) {
                    deselect();
                    return;
                }
                // «Ловушка-пузырь» (wis119) врага: существо под пузырём
                // запрещает играть карту призыва того же существа, пока оно
                // на поле (спека юзера) — розыгрыш не проходит, карта в руке
                if (CARDS[B.hand[B.selected]].type === "unit"
                    && bubbleBlocked("p", B.hand[B.selected])) {
                    const sp = cellXY(col, row);
                    floatText(sp.x, sp.y - 60, "✕", 0x8cd0ef);
                    sfx("mine");
                    deselect();
                    return;
                }
                B.energy -= effCost(B.hand[B.selected]);
                const cardId = spendCard(B.selected);
                consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                // «Отмена призыва» (wis84) врага: существо не появляется,
                // карта и энергия потрачены. «Иссушение почвы» (dec133) —
                // то же для ПОСТРОЕК: срабатывает на розыгрыш строения
                if ((CARDS[cardId].type === "unit"
                        && counterTrapConsume("e", "counterSummon"))
                    || (CARDS[cardId].type === "building"
                        && counterTrapConsume("e", "counterBuilding"))) {
                    const sp = cellXY(col, row);
                    floatText(sp.x, sp.y - 60,
                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                } else {
                    // playCtx для «Сброса разума» (decMind): dec146 при
                    // появлении сбрасывает карту — эффект розыгрыша
                    B.playCtx = { side: "p", cardId };
                    addUnit("p", cardId, col, row);
                    // карта игрока выходит в сброс ДО эффекта dec146 —
                    // помеченную возвращаем явно (заклинания — в noteDiscard)
                    discardReplayReturn("p", cardId);
                    B.playCtx = null;
                }
                if (ctx.sfx) ctx.sfx();
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            // «Культ кочерыжки» (str40): на всех пустых клетках горизонтального
            // ряда (одинаковый row, колонки 0..4) появляются Гоблины 3/4 стороны
            // кастовавшего (служебная карта gobC, на поле — как обычный призыв:
            // ловушки клеток, ауры, бейджи). Возвращает число призванных.
            A.cultRowSpawn = function cultRowSpawn(side, row) {
                let n = 0;
                for (let col = 0; col < GRID; col++) {
                    if (unitAt(col, row)) continue;
                    addUnit(side, "gobC", col, row, { token: true });
                    n++;
                }
                return n;
            };

            // «Толпа скелетов» (dec140): Скелеты 1/2 (служебная карта skel)
            // на выбранной клетке и слева/справа от неё — только на пустые
            // клетки поля (занятый сосед или край поля пропускаются).
            // Возвращает число призванных.
            A.skeletonCrowdSpawn = function skeletonCrowdSpawn(side, col, row) {
                let n = 0;
                for (const c of [col, col - 1, col + 1]) {
                    if (c < 0 || c >= GRID || unitAt(c, row)) continue;
                    addUnit(side, "skel", c, row, { token: true });
                    n++;
                }
                return n;
            };

            // «Рой ледо-пикси» (wis103): на N СЛУЧАЙНЫХ ПУСТЫХ клетках поля
            // (не только своей зоны призыва) появляются Элементали 1/1
            // с «Полётом» (служебная карта icePixie). Клетки выбираются без
            // повторов; если пустых меньше N — призываются сколько влезло.
            // Возвращает число призванных.
            A.iceSwarmSpawn = function iceSwarmSpawn(side, count) {
                const empty = [];
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) empty.push([col, row]);
                const n = Math.min(Math.max(0, count | 0), empty.length);
                for (let i = 0; i < n; i++) {
                    const [col, row] = empty.splice((Math.random() * empty.length) | 0, 1)[0];
                    addUnit(side, "icePixie", col, row, { token: true });
                }
                return n;
            };

            // «Молебен» (hon166, просил юзер): призывает Человека 2/2
            // (служебная карта parishioner — рыцарь knight_256) на СЛУЧАЙНУЮ
            // пустую клетку поля боя (не только своей зоны призыва). Поле
            // забито — существо не призывается. Возвращает true, если призвал.
            A.laySummonSpawn = function laySummonSpawn(side) {
                const empty = [];
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) empty.push([col, row]);
                if (!empty.length) return false;
                const [col, row] = empty[(Math.random() * empty.length) | 0];
                addUnit(side, "parishioner", col, row, { token: true });
                return true;
            };

            // Эффекты заклинаний игрока, валидация цели внутри (false — цель не
            // годится, тогда и оплаты/сброса/панелей не будет). Отделено от
            // оплаты карты, чтобы «Горящие руны» могли повторить эффект
            // бесплатно. free — повтор (дренаж энергии идёт без вычета цены).
            // Флаг spellCasting на всё разрешение: damageUnit в это время не
            // наносит урон существам с «Защитой от заклинаний» (u.spellWard).
            A.applySpellP = function applySpellP(cardId, target, free = false, opts = null) {
                A.spellCasting = true;
                try {
                    return applySpellPInner(cardId, target, free, opts);
                } finally { A.spellCasting = false; }
            };
            A.applySpellPInner = function applySpellPInner(cardId, target, free = false, opts = null) {
                const def = CARDS[cardId];
                const tg = def.spell.target;
                // «Защита от заклинаний» — ОДНА проверка на входе: заклинание,
                // адресующее клетку с существом, не может выбрать ward-цель.
                // Массовые и клеточные (none/anyCell/emptyCell) существо не
                // адресуют — им эта проверка не нужна.
                if (tg !== "none" && tg !== "anyCell" && tg !== "emptyCell"
                    && target && target.col !== undefined) {
                    const aimed = unitAt(target.col, target.row);
                    if (aimed && !spellAimable(aimed)) return false;
                    // «Отражение» (wis120) врага: заклинание игрока, целью
                    // выбрано СУЩЕСТВО врага, летит в случайное существо
                    // игрока (спека юзера). Цель подменяется ДО эффекта.
                    const rt = reflectAim("e", aimed);
                    if (rt !== aimed) target = { col: rt.col, row: rt.row };
                }
                if (def.spell.stormAll) { // «Гроза»: вся оставшаяся энергия — удары по 2
                    stormStrike("p", cardId, free);
                    return true;
                }
                // «Поднятие мёртвых» (dec124): в своём сбросе нет существ —
                // заклинание не разыгрывается (карта и энергия целы)
                if (def.spell.raiseDead && !unitsInDiscard("p").length) return false;
                // «Пытка разума» (dec125): обе руки пусты — сбрасывать нечего
                if (def.spell.mindTorture && !B.hand.length && !B.eHand.length) return false;
                // «Плен» (hon197): в руке противника нет карты призыва —
                // выбирать нечего, заклинание не разыгрывается (как выше)
                if (def.spell.captivate && !B.eHand.some((id) =>
                    CARDS[id] && CARDS[id].type === "unit")) return false;
                // «Воскрешение» (hon200): в своём сбросе нет карты призыва —
                // воскрешать нечего (как у «Поднятия мёртвых»)
                if (def.spell.resurrect && !unitsInDiscard("p").length) return false;
                if (tg === "anyUnit") { // усиление/Смыв/Слабость
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    // тип карты проверяем здесь; защиту уже отсеял вход
                    if (!u || u.def.type !== "unit") return false;
                    const p = cellXY(u.col, u.row);
                    if (def.spell.iceStrike) { // «Ледяной удар»: цель бьёт соседа
                        const victim = iceStrikeVictim(u);
                        if (!victim) return false; // соседей-существ нет — не кастуем
                        iceStrikeAttack(u, victim);
                        if (B.units.includes(victim)) addFrozen(victim, def.spell.freeze || 1, "p");
                        punch(u.node);
                        sfx("aqua");
                        return true;
                    }
                    if (def.spell.hydroPunch) { // «Гидроудар»: 1 урон + сдвиг к своей базе
                        const dmg = spellDmg(def, "p", true, true);
                        damageUnit(u, dmg, null, "rocket");
                        if (B.units.includes(u)) pushTowardBase(u);
                        punch(u.node);
                        sfx("aqua");
                        return true;
                    }
                    if (def.spell.bounce) { // «Смыв»: существо — в руку владельца
                        punch(u.node);
                        bounceUnit(u);
                        sfx("aqua");
                        return true;
                    }
                    if (def.spell.debuffAtk) { // «Слабость»: −N к урону (не ниже нуля)
                        u.bonusAtk = (u.bonusAtk || 0) - def.spell.debuffAtk;
                        recalcAuras();
                        floatText(p.x, p.y - 39, `−${def.spell.debuffAtk}⚔`, 0xef9f8c);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.72 });
                        punch(u.node);
                        sfx("acid");
                        return true;
                    }
                    // «Разложение» (dec145): уничтожьте существо, затем
                    // сбросьте карту с руки (авто, наименее ценная; сама
                    // dec145 ещё в руке — себя не сбрасывает)
                    if (def.spell.destroy) {
                        punch(u.node);
                        killUnit(u, null);
                        discardWeakest("p", cardId);
                        refreshHud();
                        return true;
                    }
                    if (def.spell.enchantFire) { // «Огненное дыхание» — метка-очарование
                        u.enchantFire = true;
                        const mark = new PIXI.Graphics();
                        mark.circle(0, 0, 10.5);
                        mark.fill({ color: 0xff7a2e });
                        mark.stroke({ width: 3, color: 0xffd98c });
                        mark.position.set(36, -54);
                        mark.name = "enchMark";
                        mark.eventMode = "none";
                        u.node.addChild(mark);
                        floatText(p.x, p.y - 60, "✦", 0xffb26e);
                    } else {
                        if (def.spell.buffAtk) {
                            u.bonusAtk = (u.bonusAtk || 0) + def.spell.buffAtk;
                            recalcAuras();
                            floatText(p.x, p.y - 39, `+${def.spell.buffAtk}⚔`, 0x9fd489);
                        }
                        if (def.spell.buffHp) { // «Дар леса»: +N жизни любому существу
                            u.hp += def.spell.buffHp;
                            const hn = u.node.getChildByName("hp");
                            if (hn) hn.text = String(u.hp);
                            floatText(p.x, p.y - 75, `+${def.spell.buffHp}♥`, 0x9fd489);
                        }
                        // «Луч света» (hon179): «выбранный игрок» — владелец
                        // заклинания (второй цели в игре нет, как у
                        // «Негативного потока»), получает 1 жизнь
                        // (healBase — единая точка, внутри гейт
                        // «Претендента на трон»)
                        if (def.spell.healPlayer) healBase("p", def.spell.healPlayer);
                        if (def.spell.buffAtkByHp) { // «Природная мощь»: +урона = жизням
                            u.bonusAtk = (u.bonusAtk || 0) + u.hp;
                            recalcAuras();
                            floatText(p.x, p.y - 39, `+${u.hp}⚔`, 0x9fd489);
                        }
                        if (def.spell.berserk) addBerserk(u, def.spell.berserk);
                        if (def.spell.venom) addVenom(u, def.spell.venom); // «Отравленные лезвия»
                        if (def.spell.poison) addPoison(u, def.spell.poison); // «Трупный яд»
                        if (def.spell.nova) novaSplash(u); // «Круговая атака»
                        // «Метка некроманта» (dec137): «Выкапливание 1» —
                        // счётчик стакается с уже висящим (Мортис/вторая метка)
                        if (def.spell.exhumingMark) {
                            addExhuming(u, (u.exhuming || 0) + def.spell.exhumingMark);
                            floatText(p.x, p.y - 90,
                                "⛏ +" + def.spell.exhumingMark, 0xc9b98c);
                        }
                        if (def.spell.buffAtk || def.spell.buffHp
                            || def.spell.buffAtkByHp || def.spell.enchantFire
                            || def.spell.exhumingMark) {
                            fxEvent("buff", { x: p.x, y: p.y - 12,
                                color: def.spell.enchantFire ? 0xff8a5e : 0xffd98c,
                                scale: 0.82 });
                        }
                    }
                    punch(u.node);
                    sfx("up");
                }
                if (def.spell.target === "anyUnitDmg") { // дротик: существо или строение; варево — только существо
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    // защиту отсеял единый вход; здесь — допустимый тип цели
                    if (!u || (u.def.type !== "unit"
                        && (u.def.type !== "building" || def.spell.noBuildings))) return false;
                    if (def.spell.purge) { // «Извлечение духа»: снять все свойства, база лечится за каждое
                        const n = purgeUnit(u);
                        healBase("p", n);
                        sfx("up");
                    } else if (def.spell.cocoon) { // «Защитный кокон»: «Защита 1» цели
                        addProtect(u);
                    } else if (def.spell.drainAll) { // «Огнешар»: вся энергия сверх цены — в урон
                        damageUnit(u, Math.max(0, B.energy - (free ? 0 : effCost(cardId, "p", target)))
                            + altarBonus("p")
                            + heroSpellBonus(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else if (def.spell.fireflies) { // «Рой светлячков»: урон = своим существам
                        damageUnit(u, spellHitDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else if (def.spell.growthHand) { // «Выстрел стихией Роста»: урон = картам Роста в руке
                        damageUnit(u, spellHitDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else {
                        damageUnit(u, spellDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    }
                    // «Ядро кометы»: выжившее существо получает «Заморожен N»
                    if (def.spell.freeze && B.units.includes(u)) addFrozen(u, def.spell.freeze, "p");
                }
                if (def.spell.target === "emptyCell") { // культ — ряд в гоблинах; толпа — 3 скелета
                    if (!target || target.col === undefined) return false;
                    if (unitAt(target.col, target.row)) return false;
                    if (def.spell.skeletonCrowd) { // «Толпа скелетов»: клетка + слева/справа
                        if (skeletonCrowdSpawn("p", target.col, target.row)) sfx("use");
                    } else cultRowSpawn("p", target.row);
                }
                if (def.spell.target === "anyCell") { // стена костров: ряд горит N ходов владельца;
                    // «Испепеляющий луч»: все существа вертикального ряда клетки
                    if (!target || target.col === undefined) return false;
                    if (def.spell.columnDmg) { // hon180: СУЩЕСТВА (обе стороны)
                        // в колонке выбранной клетки; урон как у массовых —
                        // алтарь и геройский бонус добавляются к каждому удару
                        // (первое уронное — на всю серию, по образцу aoeDmg)
                        const dmg = def.spell.columnDmg + altarBonus("p");
                        const fs = heroSpellBonus(def, "p", false, true);
                        for (const v of B.units.slice()) {
                            if (v.col !== target.col || v.def.type !== "unit") continue;
                            damageUnit(v, dmg + fs
                                + heroSpellBonus(def, "p", true), null, "rocket");
                        }
                        sfx("rocket");
                        return true;
                    }
                    B.firewalls.push({ col: target.col, row: target.row, side: "p",
                        left: def.spell.turns, dmg: def.spell.firewall });
                    redrawFirewalls();
                    sfx("rocket");
                }
                if (def.spell.target === "ownUnit" && def.spell.baseHit) { // «Бросок валуна»: своё существо бьёт базу врага — это его атака
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    baseHit("p", u);
                    triggerAttackTraps(u);
                }
                if (def.spell.target === "ownUnit" && def.spell.wolfVolley) { // «Атака духами волков»: Выстрел + волки на пути
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    wolfVolley(u);
                }
                if (def.spell.target === "ownUnit" && def.spell.sacrifice) { // жертва: убить своё, ударить соседей
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    const p = cellXY(u.col, u.row);
                    killUnit(u, null);
                    floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                    for (const v of B.units.slice()) {
                        if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                            damageUnit(v, def.spell.dmg, null, "rocket");
                        }
                    }
                }
                if (def.spell.target === "ownUnit" && def.spell.beastBlast) { // «Взрыв твари» (dec150): своё гибнет, серия случайных ударов
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    beastBlastCast("p", u);
                }
                if (def.spell.target === "enemyUnit" && def.spell.mindControl) { // «Тёмный контроль» (dec134): существо врага переходит на вашу сторону, вы теряете 2 жизни
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side === "p" || u.def.type !== "unit") return false;
                    damageBase("p", def.spell.mindControl, { x: 960, y: 840, fill: 0xff8f6e });
                    u.side = "p"; // «как будто вы его призвали»: марши/атаки по новой стороне, метки остаются
                    recalcAuras();
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 78, "⇄", 0xc9a0ef);
                    fxEvent("seal", { x: p.x, y: p.y - 8, color: 0xc9a0ef, scale: 0.85 });
                    punch(u.node);
                    sfx("chpoc");
                }
                if (def.spell.target === "ownUnit" && def.spell.lightAura) { // «Аура света» (hon199): световая метка
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    // в конце хода владельца соседние СУЩЕСТВА противника
                    // теряют 1 жизнь (auraLightTick); метка умирает вместе
                    // с носителем
                    u.lightAura = true;
                    const mark = new PIXI.Graphics();
                    mark.circle(0, 0, 9);
                    mark.fill({ color: 0xffe9b0 });
                    mark.stroke({ width: 3, color: 0xf0c96a });
                    mark.position.set(-36, -54);
                    mark.name = "auraMark";
                    mark.eventMode = "none";
                    u.node.addChild(mark);
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 60, "☀", 0xffe9b0);
                }
                if (def.spell.target === "ownUnit" && def.spell.darkExtract) { // «Извлечение тьмы» (dec153): своё гибнет — энергия = сумма ⚔+♥
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    const n = (u.curAtk || 0) + (u.hp || 0);
                    const p = cellXY(u.col, u.row);
                    killUnit(u, null);
                    floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                    B.energy += n;
                    floatText(960, 840, `+${n}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (def.spell.terrainScout) { // «Выбор местности» (dec156): верхние N карт колоды — взять 1 постройку
                    openRunesPanel(def.spell.terrainScout, "building");
                }
                if (def.spell.bloodMoon) { // «Кровавая луна» (dec160): жизни базы — в энергию (выбор 1..N)
                    openMoonPanel(def.spell.bloodMoon);
                }
                if (def.spell.target === "ownBuilding" && def.spell.excavate) { // «Раскопки»
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "building") return false;
                    const cell = { col: u.col, row: u.row };
                    const id = cardIdOf(u.def);
                    removeUnit(u); // в сброс без каскадов смерти — постройка не «убита»
                    recalcAuras();
                    B.discard.push(id);
                    noteDiscard(1, "p", [id]);
                    const p = cellXY(cell.col, cell.row);
                    floatText(p.x, p.y - 60, "⤓", 0xef9f8c);
                    sfx("chpoc");
                    openExcavatePanel(cell); // выбор постройки сброса в освободившуюся клетку
                }
                if (def.spell.target === "none" && def.spell.baseDmg) { // землетрясение
                    damageBase("e", def.spell.baseDmg + heroSpellBonus(def, "p", false, true),
                        { x: 960, y: 60, fill: 0xff8f6e });
                    sfx("rocket");
                }
                if (def.spell.target === "none" && def.spell.stealEnergy) { // «Похищение энергии»: 2⚡
                    const got = Math.min(def.spell.stealEnergy, B.eEnergy);
                    B.eEnergy -= got;
                    B.energy += got;
                    floatText(960, 60, `−${got}⚡`, 0xff8f6e);
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (def.spell.target === "none" && def.spell.energyPerHand) { // «Цветение кристаллов»: +1⚡ за карту в руке
                    // сама карта в момент эффекта ещё числится в руке — не считаем
                    const got = Math.max(0, B.hand.length - 1);
                    B.energy += got;
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (def.spell.target === "none" && def.spell.energyPerTrap) { // «Поток маны»: +1⚡ за свою ловушку
                    const got = B.traps.p.length;
                    B.energy += got;
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    if (got) punch(root.hud);
                    sfx("aqua");
                }
                if (def.spell.debuffEnemyAtkAll) { // «Нехватка воздуха»: −N урона всем существам врага
                    const n = def.spell.debuffEnemyAtkAll;
                    for (const v of B.units) if (v.side !== "p" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) - n;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `−${n}⚔`, 0x8cd0ef);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.62 });
                    }
                    recalcAuras();
                    sfx("acid");
                }
                if (def.spell.iceSwarm) { // «Рой ледо-пикси»: Элементали 1/1 на случайные пустые клетки
                    const n = iceSwarmSpawn("p", def.spell.iceSwarm);
                    if (n) sfx("use");
                }
                if (def.spell.laySummon) { // «Молебен»: Человек 2/2 на случайную пустую клетку
                    if (laySummonSpawn("p")) sfx("use");
                }
                if (def.spell.rebalance) { // «Снабжение» (hon170): у всех своих
                    // существ меньшая из характеристик ⚔/♥ становится равной
                    // большей (постройки — не существа; жетоны — существа)
                    for (const v of B.units.slice()) {
                        if (v.side !== "p" || v.def.type !== "unit"
                            || v.curAtk === v.hp) continue;
                        const a = v.curAtk;
                        if (a < v.hp) {
                            v.bonusAtk = (v.bonusAtk || 0) + (v.hp - a);
                            recalcAuras();
                        } else v.hp = a;
                        const an = v.node.getChildByName("atk");
                        if (an) an.text = String(v.curAtk);
                        const hn = v.node.getChildByName("hp");
                        if (hn) hn.text = String(v.hp);
                        const vp = cellXY(v.col, v.row);
                        floatText(vp.x, vp.y - 60, "⇔", 0xffd98c);
                        punch(v.node);
                    }
                    sfx("up");
                }
                if (def.spell.aoeDmg) { // «Раскалённые обломки»: всем вражеским существам и постройкам
                    const dmg = def.spell.aoeDmg + altarBonus("p");
                    // первое уронное заклинание — +1 ко ВСЕМ ударам этого каста;
                    // «Поджигатели» — +1 только существам (постройки не считаются)
                    const fs = heroSpellBonus(def, "p", false, true);
                    for (const v of B.units.slice()) if (v.side !== "p")
                        damageUnit(v, dmg + fs
                            + (v.def.type === "unit" ? heroSpellBonus(def, "p", true) : 0),
                            null, "rocket");
                    sfx("rocket");
                }
                if (def.spell.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                    for (const v of B.units) if (v.side === "p" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) + def.spell.buffAllAtk;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${def.spell.buffAllAtk}⚔`, 0x9fd489);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.6 });
                    }
                    recalcAuras();
                    sfx("up");
                }
                // «Ковка оружия» (tim208): все свои существа, появившиеся
                // в ЭТОТ ход (включая пришедших через «Сдвиг»), получают
                // +2 к урону; до конца хода бонус ловят и следующие
                // появления (forge в addUnit)
                if (def.spell.forge) {
                    B.forge.p = { turn: B.turnNo, amt: def.spell.forge };
                    for (const v of B.units) if (v.side === "p"
                        && v.def.type === "unit" && v.bornTurn === B.turnNo) {
                        v.bonusAtk += def.spell.forge;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${def.spell.forge}⚔`, 0x9fd489);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.6 });
                    }
                    recalcAuras();
                    sfx("up");
                }
                if (def.spell.target === "enemyAny") {
                    if (!target) return false;
                    if (target.base === true) {
                        damageBase("e", def.spell.dmg + heroSpellBonus(def, "p", false, true),
                            { x: 960, y: 60, fill: 0xff8f6e });
                        sfx("rocket");
                    } else if (target.col !== undefined) {
                        const u = unitAt(target.col, target.row);
                        // защиту отсеял единый вход; тут — только сторона
                        if (!u || u.side === "p") return false;
                        damageUnit(u, def.spell.dmg + heroSpellBonus(def, "p",
                            u.def.type === "unit", true), null, "rocket");
                    } else return false;
                }
                // «Негативный поток» (dec126): 1 урон ЛЮБОМУ существу (обе
                // стороны, постройки — не существа) или противнику (его базе)
                if (def.spell.target === "anyUnitOrFoe") {
                    if (!target) return false;
                    if (target.base === true) {
                        damageBase("e", def.spell.dmg + heroSpellBonus(def, "p", false, true),
                            { x: 960, y: 60, fill: 0xff8f6e });
                        sfx("rocket");
                    } else if (target.col !== undefined) {
                        const u = unitAt(target.col, target.row);
                        if (!u || u.def.type !== "unit") return false;
                        damageUnit(u, def.spell.dmg + heroSpellBonus(def, "p", true, true),
                            null, "rocket");
                    } else return false;
                }
                if (def.spell.draw) drawCards(def.spell.draw);
                // «Добыча кристаллов» (tim211): +1⚡ за каждую единицу
                // «Сдвига» каждого своего существа, ждущего на поле (значки)
                if (def.spell.crystalHarvest) {
                    let n = 0;
                    for (const d2 of (B.delayed ? B.delayed.p : []))
                        n += Math.max(0, d2.left);
                    if (n > 0) {
                        B.energy += n;
                        floatText(960, 790, `+${n}⚡`, 0xffd98c);
                        sfx("aqua");
                    }
                }
                // «Мозговой штурм» (tim206): сбросить ВСЮ руку и взять столько
                // же +1. Прямой розыгрыш — карта ещё в руке, её сбросит/
                // оплатит castSpell (skipHandReset); вызов после spendCard
                if (def.spell.brainstorm && !(opts && opts.skipHandReset))
                    discardHandDraw("p", B.hand.length + 1);
                // «Запутать руны»: обе руки — в сброс, по 3 карты (спека:
                // «вы И ПРОТИВНИК»; раньше сбрасывалась только своя — баг
                // юзера). При прямом розыгрыше карта ещё в руке — её сбросит/
                // оплатит castSpell (skipHandReset), поэтому эффект зовётся
                // оттуда после spendCard.
                if (def.spell.discardHandDraw && !(opts && opts.skipHandReset))
                    confuseRunes("p", def.spell.discardHandDraw);
                if (def.spell.brew) { B.brewCasts = (B.brewCasts || 0) + 1; refreshBrewBadges(); }
                if (def.spell.search) openRunesPanel(def.spell.search); // выбор поверх боя
                if (def.spell.searchUnit) openRunesPanel(def.spell.searchUnit, "unit"); // «Рунное гадание»
                if (def.spell.seek) openSeekPanel(def.spell.seek, def.spell.seekPicks || 1); // «Поиск знаний»
                if (def.spell.grim) openGrimPanel(); // «Гримуар инея»: выбор типа + верхние 4
                if (def.spell.journey) openJourneyPanel(def.spell.journey);
                if (def.spell.discardPick) openBrewPanel(); // «Варка зелий»: выбор из сбросов
                // «Поднятие мёртвых»: существа своего сброса — в руку (гейт
                // выше: пусто в сбросе → карта не разыгрывается)
                if (def.spell.raiseDead) openRaisePanel();
                // «Плен» (hon197): панель руки противника — удалить карту призыва
                if (def.spell.captivate) openCaptivatePanel();
                // «Воскрешение» (hon200): панель своего сброса — разыграть карту
                if (def.spell.resurrect) openResurrectPanel();
                // «Пытка разума»: панель «кто сбрасывает случайные карты»
                if (def.spell.mindTorture) openTorturePanel(def.spell.mindTorture);
                // «Запретные знания» (dec130): панель «кто берёт 3 карты
                // и теряет 2 жизни»
                if (def.spell.forbidden) openForbiddenPanel(def.spell.forbidden);
                return true;
            };

            // Автоцель для повтора заклинания («Горящие руны») — приоритеты ИИ:
            // добивание, сильнейший, ряд с наибольшим числом врагов.
            A.autoTargetFor = function autoTargetFor(cardId) {
                const def = CARDS[cardId];
                const tg = def.spell.target;
                if (tg === "anyUnit" && def.spell.hydroPunch) { // «Гидроудар»
                    const foes = spellTargets(B.units.filter((u) => u.side !== "p"
                        && u.def.type === "unit"));
                    const best = foes.slice().sort((a, b) =>
                        (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnit" && def.spell.iceStrike) { // «Ледяной удар»
                    const pick = iceStrikePick("p");
                    return pick ? { col: pick.unit.col, row: pick.unit.row } : null;
                }
                if (tg === "ownUnit" && def.spell.darkExtract) { // «Извлечение тьмы»: своё с наибольшей суммой ⚔+♥
                    const own = spellTargets(B.units.filter((u) => u.side === "p"
                        && u.def.type === "unit"));
                    const best = own.slice().sort((a, b) =>
                        ((b.curAtk || 0) + (b.hp || 0)) - ((a.curAtk || 0) + (a.hp || 0)))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "enemyUnit") { // «Тёмный контроль»: самое опасное существо врага
                    const foes = spellTargets(B.units.filter((u) => u.side !== "p"
                        && u.def.type === "unit"));
                    const best = foes.slice().sort((a, b) => aiThreat(b) - aiThreat(a))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnit" || tg === "ownUnit") {
                    const own = spellTargets(B.units.filter((u) => u.side === "p"
                        && u.def.type === "unit"));
                    const best = own.slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnitDmg") {
                    if (def.spell.cocoon) { // кокон — своему крепышу
                        const own = spellTargets(B.units.filter((u) => u.side === "p"));
                        const best = own.slice().sort((a, b) => (b.hp - a.hp) || (b.curAtk - a.curAtk))[0];
                        return best ? { col: best.col, row: best.row } : null;
                    }
                    if (def.spell.purge) { // дух — чужой самый «заряженный» объект
                        let best = null, bestN = 0;
                        for (const u of spellTargets(B.units)) {
                            if (u.side === "p") continue;
                            const n = countProps(u);
                            if (n > bestN) { bestN = n; best = u; }
                        }
                        return best ? { col: best.col, row: best.row } : null;
                    }
                    const dmg = def.spell.drainAll
                        ? Math.max(0, B.energy) + altarBonus("p") // повтор — цена не вычитается
                        : spellHitDmg(def);
                    const targets = spellTargets(B.units.filter((u) => u.side !== "p"
                        && (u.def.type === "unit"
                            || (u.def.type === "building" && !def.spell.noBuildings))));
                    if (!targets.length) return null;
                    const kills = targets.filter((v) => v.hp <= dmg);
                    const best = (kills.length ? kills : targets)
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return { col: best.col, row: best.row };
                }
                if (tg === "ownBuilding") { // раскопки — первая своя постройка
                    const own = spellTargets(B.units.filter((u) => u.side === "p"
                        && u.def.type === "building"));
                    return own.length ? { col: own[0].col, row: own[0].row } : null;
                }
                if (tg === "enemyAny") {
                    const targets = spellTargets(B.units.filter((u) => u.side !== "p"));
                    if (!targets.length) return { base: true };
                    const best = targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return { col: best.col, row: best.row };
                }
                if (tg === "anyUnitOrFoe") { // «Негативный поток»: существо любой стороны или база
                    const dmg = spellHitDmg(def);
                    const targets = spellTargets(B.units.filter((u) => u.def.type === "unit"));
                    const kills = targets.filter((v) => v.hp <= dmg);
                    if (!kills.length && B.enemyBase <= dmg) return { base: true };
                    const pool = kills.length ? kills : targets;
                    const best = pool.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return best ? { col: best.col, row: best.row } : { base: true };
                }
                if (tg === "anyCell") { // стена костров — ряд, где больше врагов
                    const counts = [0, 0, 0, 0, 0];
                    for (const v of B.units) if (v.side !== "p") counts[v.row]++;
                    return { col: 2, row: counts.indexOf(Math.max(...counts)) };
                }
                if (tg === "emptyCell") { // культ — ряд, где больше пустых (ничья — где больше врагов)
                    const empt = [0, 0, 0, 0, 0], foes = [0, 0, 0, 0, 0];
                    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
                        if (!unitAt(c, r)) empt[r]++;
                    for (const v of B.units) if (v.side !== "p") foes[v.row]++;
                    let best = 0;
                    for (let r = 1; r < GRID; r++)
                        if (empt[r] > empt[best] || (empt[r] === empt[best] && foes[r] > foes[best])) best = r;
                    return { col: 2, row: best };
                }
                return null; // без цели или целей нет — эффект повторится «вхолостую»
            };

            // «Горящие руны» (str25): эффект последнего разыгранного заклинания
            // повторно, бесплатно; затем то заклинание СЖИГАЕТСЯ — одна копия
            // уходит из своей текущей зоны (рука → колода → сброс) до конца боя
            // (в колоду при перетасовке она больше не вернётся).
            A.replaySpell = function replaySpell(cardId, origin) {
                const def = CARDS[cardId];
                if (!def || def.type !== "spell") return;
                const target = autoTargetFor(cardId);
                applySpellP(cardId, target, true);
                fxSpellCast(cardId, target, "p", origin);
                if (def.spell.drainAll || def.spell.stormAll) B.energy = 0; // огнешар/гроза и в повторе сжигают энергию
                const hi = B.hand.indexOf(cardId);
                if (hi >= 0) B.hand.splice(hi, 1);
                else {
                    const di = B.deck.indexOf(cardId);
                    if (di >= 0) B.deck.splice(di, 1);
                    else {
                        const si = B.discard.indexOf(cardId);
                        if (si >= 0) B.discard.splice(si, 1);
                    }
                }
                floatText(960, 640, `🔥 ${GAME_LOC.t(`card.${cardId}.name`)}`, 0xffb26e);
            };

            A.castSpell = function castSpell(handIdx, target) {
                if (B.phase !== "player" || B.discarding || B.picking) return false;
                const cardId = B.hand[handIdx];
                const def = CARDS[cardId];
                if (!def || def.type !== "spell"
                    || effCost(cardId, "p", target) > B.energy) return false;
                const resetHand = def.spell.discardHandDraw;
                // «Мозговой штурм» (tim206): рука уйдёт в сброс ПОСЛЕ выхода
                // самой карты (в applySpellPInner она ещё в руке)
                const brainstorm = def.spell.brainstorm;
                // центр разыгранной карты (просил юзер): эффект заклинания
                // без позиции цели рождается на карте; считаем ДО эффектов —
                // сбросы/доборы могли бы пересобрать руку и сдвинуть индексы
                const origin = handCardCenter(handIdx);
                // «Отмена заклинания» (wis83) врага: заклинание отменяется —
                // карта и энергия потрачены, эффект не срабатывает (спека юзера)
                const cTrap = counterTrapConsume("e", "counterSpell");
                if (cTrap) {
                    B.energy -= effCost(cardId, "p", target);
                    spendCard(handIdx);
                    consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                    const p = cellXY(cTrap.col, cTrap.row);
                    floatText(p.x, p.y + 66, "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    checkEnd();
                    return true;
                }
                if (def.spell.copyLast) { // «Горящие руны»: повтор последнего бесплатно
                    const last = B.lastSpell.p;
                    if (!last || last === "str25" || !CARDS[last]
                        || CARDS[last].type !== "spell") return false;
                    B.energy -= effCost(cardId, "p", target);
                    spendCard(handIdx);
                    consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                    heroFirstSpellEnergy("p"); // «Дуновение опасности»
                    heroStrReplay("p", cardId, def); // «Мастера огня»
                    B.lastSpell.p = "str25"; // повтор самой себя — бесконечная цепочка
                    replaySpell(last, origin);
                    afterSpellPlayed("p");
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    checkEnd();
                    return true;
                }
                // playCtx — карта в процессе розыгрыша: её эффекты (сбросы
                // карт) видит noteDiscard для способности «Сброс разума»
                // (decMind); снимается после выхода карты в сброс
                B.playCtx = { side: "p", cardId };
                if (!applySpellP(cardId, target, false,
                    (resetHand || brainstorm) ? { skipHandReset: true } : null)) {
                    B.playCtx = null;
                    return false;
                }
                fxSpellCast(cardId, target, "p", origin);
                B.energy = (def.spell.drainAll || def.spell.stormAll)
                    ? 0 : B.energy - effCost(cardId, "p", target);
                consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                spendCard(handIdx); // при пометке «Сброса разума» вернёт карту в руку
                B.playCtx = null;
                if (resetHand) confuseRunes("p", resetHand); // обе стороны (спека)
                if (brainstorm) // сброс остатка руки уже без карты штурма:
                    // добор = (рука сейчас) + 2, итого «столько же и ещё +1»
                    discardHandDraw("p", B.hand.length + 2);
                heroFirstSpellEnergy("p"); // «Дуновение опасности»: +1⚡ за 1-е заклинание
                heroStrReplay("p", cardId, def); // «Мастера огня»
                B.lastSpell.p = cardId;
                afterSpellPlayed("p"); // «Заклинатель клинков» и его соседи
                layoutHand();
                redrawHighlight();
                refreshHud();
                checkEnd();
                return true;
            };
        }
    };
})();
