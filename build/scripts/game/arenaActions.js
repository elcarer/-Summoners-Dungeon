// СЦЕНА «АРЕНА»: действия игрока: выбор, призыв, заклинания.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installActions = function installActions(A) {
        with (A) {
            // Розыгрыш карты С РУКИ стороной (счётчик «Конвейера» tim225):
            // после каждого розыгрыша карты «Конвейер» этого хода дешевле
            // на 1 (effCost; turn-сверка сбрасывает счётчик на новом ходу)
            A.notePlay = function notePlay(side) {
                if (!B.convey) return;
                const cp = B.convey[side] || (B.convey[side] = { turn: 0, n: 0 });
                if (cp.turn !== B.turnNo) { cp.turn = B.turnNo; cp.n = 0; }
                cp.n += 1;
            };

            A.playerTurnStart = async function playerTurnStart() {
                B.turnNo += 1; // шкала подросла: сфер теперь на одну больше
                B.phase = "anim";
                B.turnSide = "p"; // чей ход — честный маркер (reactShotPing)
                B.selected = null;
                B.spellTarget = false;
                B.islandPick = false; // прицел «Летучего острова» не переживает смену хода
                B.dmgHalt = { p: false, e: false }; // новый ход — урон снова наносится (hw267)
                tokenPanelClose(); // панель «Управления временем» не переживает смену хода
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
                returnTick("p"); // «Возврат» (Время): счётчики тают, созревшие — в руку
                trapReturnTick("p"); // «Возврат» ЛОВУШКИ (tim221): созревшая — в руку
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
                // «Мастер порталов» (tim231): раз за ход — верхняя карта
                // колоды-ловушка может быть разыграна бесплатно (панель
                // после марша, как у «Пня обряда»)
                portalMasterTick("p");
            };

            // ── Действия игрока ────────────────────────────────────────────────
            A.spendCard = function spendCard(handIdx) { // вынимает карту из руки в сброс
                const cardId = B.hand[handIdx];
                notePlay("p"); // «Конвейер» (tim225): разыграна карта с руки
                // «Ярость природы» (Рыжий лес, W54): заклинания/ловушки —
                // юниты и постройки бьются в addUnit (общая точка сторон)
                if (CARDS[cardId]
                    && (CARDS[cardId].type === "spell"
                        || CARDS[cardId].type === "trap"))
                    multiFury(cardId, "p");
                // «Растущая доблесть» (Белая пуща, W62): ловушки — здесь;
                // заклинания — в castSpell ДО эффекта (spendCard зовётся
                // ПОСЛЕ: пул случайных существ не должен видеть призванных
                // самой картой). «Переплетение сил» (Небесный дворец, W75) —
                // туда же
                if (CARDS[cardId] && CARDS[cardId].type === "trap") {
                    multiValor(cardId, "p");
                    multiWeave(cardId, "p");
                }
                // улетание карты в сброс (анимации руки, просил юзер):
                // позиция снимается ДО splice; узел мог быть пересобран
                // эффектами заклинания — тогда слот по расчёту веера
                const burn = B.scorch.p.has(cardId) || CARDS[cardId].burn;
                const nd = handNode(handIdx);
                flyToDiscard(cardId,
                    nd && !nd.destroyed && nd.__handIdx === handIdx
                        ? { x: nd.x, y: nd.y - 169 * nd.scale.y,
                            r: nd.rotation, s: nd.scale.x }
                        : { x: handCardCenter(handIdx).x,
                            y: handCardCenter(handIdx).y, r: 0, s: 1 },
                    burn);
                if (burn) { // «Сожжение»: карта удаляется из боя
                    B.scorch.p.delete(cardId);
                    floatText(960, 640, `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                    sfx("chpoc");
                } else {
                    B.discard.push(cardId);
                    noteDiscard(1, "p", [cardId]);
                }
                B.hand.splice(handIdx, 1);
                B.selected = null;
                B.spellTarget = false;
                cryptSettle("p", cardId); // «Склеп» (dec157): сыгранная из него карта — в колоду
                // «Гном-разбойник» (timRaider, W40): рука опустела — 2 карты
                heroEmptyHandDraw("p");
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
                if (side === "p") { // улетание в сброс (анимации руки)
                    const nd = handNode(hi);
                    flyToDiscard(mark,
                        nd && !nd.destroyed && nd.__handIdx === hi
                            ? { x: nd.x, y: nd.y - 169 * nd.scale.y,
                                r: nd.rotation, s: nd.scale.x }
                            : { x: handCardCenter(hi).x,
                                y: handCardCenter(hi).y, r: 0, s: 1 });
                } else flyEnemyDiscard(); // у врага рубашка — к его сбросу (W32)
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
                    if (def.trap.effect === "castRandom") {
                        // руна — сильнейшее существо врага (W60: споры —
                        // клеточные, ставятся как мины)
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
                A.recalcAuras(); // «Каток» (tim236): сброс стал короче
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
                tokenPanelClose(); // панель «Управления временем» закрывается
                swapPickClear(); // «Перемена мест»: первая цель и маркер (W65)
                if (B.selected === null && !B.spellTarget) return;
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            // ── «Управление временем» (tim223, просил юзер) ────────────────────
            // Цель заклинания — ЖЕТОН: значок «Сдвига» на клетке (любая
            // сторона) или существо со «Возвратом» (любая сторона). После
            // выбора цели панелька предлагает −2 или +2; каст идёт с dir.
            A.tokenAt = function tokenAt(col, row) {
                const u = unitAt(col, row);
                if (u && u.ret > 0) return { kind: "ret" };
                for (const side of ["p", "e"])
                    if (B.delayed[side] && B.delayed[side]
                        .some((e) => e.col === col && e.row === row))
                        return { kind: "delay" };
                return null;
            };
            // Применение: dir −1 уменьшает, +1 увеличивает (не ниже 0);
            // жетон «Возврата» с 0 вернётся в следующий тик владельца
            // (returnTick: счётчик тает и на 0 существо уходит в руку)
            A.applyTokenShift = function applyTokenShift(side, target) {
                if (!target || target.col === undefined || !target.dir) return false;
                const u = unitAt(target.col, target.row);
                if (u && u.ret > 0) {
                    u.ret = Math.max(0, u.ret + target.dir * 2);
                    if (u.ret > 0) A.returnMarkDraw(u); // метка с новым числом
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 84, `${target.dir < 0 ? "−" : "+"}2 ${GAME_LOC.t("status.return.name")}`,
                        0xc9a0ef);
                    punch(u.node);
                    sfx("chpoc");
                    return true;
                }
                for (const s of ["p", "e"]) {
                    const e = (B.delayed[s] || []).find((d) =>
                        d.col === target.col && d.row === target.row);
                    if (!e) continue;
                    e.left = Math.max(0, e.left + target.dir * 2);
                    A.delayDrawNode(e); // цифра на значке обновится
                    const p = cellXY(e.col, e.row);
                    floatText(p.x, p.y - 84, `${target.dir < 0 ? "−" : "+"}2 ${GAME_LOC.t("status.delay.name")}`,
                        0xc9a0ef);
                    sfx("chpoc");
                    return true;
                }
                return false;
            };
            // Панелька выбора направления (две кнопки над полем)
            A.tokenPanelOpen = function tokenPanelOpen(col, row) {
                tokenPanelClose();
                B.tokenPick = { col, row };
                const panel = new PIXI.Container();
                const bg = new PIXI.Graphics();
                bg.roundRect(960 - 330, 196, 660, 132, 14);
                bg.fill({ color: 0x201a2e, alpha: 0.92 });
                bg.stroke({ width: 3, color: 0xb07ad5 });
                panel.addChild(bg);
                const cap = T(GAME_LOC.t("time.ctl.pick"), 24, 0xf3e6c2,
                    { stroke: { color: 0x1c1207, width: 4 } });
                cap.anchor.set(0.5);
                cap.position.set(960, 226);
                cap.eventMode = "none";
                panel.addChild(cap);
                panel.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: GAME_LOC.t("time.ctl.down"),
                    x: 960 - 158, y: 288, scale: 0.9, fontSize: 38,
                    onTap: () => tokenPanelCast(-1),
                }));
                panel.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: GAME_LOC.t("time.ctl.up"),
                    x: 960 + 158, y: 288, scale: 0.9, fontSize: 38,
                    onTap: () => tokenPanelCast(1),
                }));
                root.tokenPanel = panel;
                root.addChild(panel); // поверх поля; умрёт вместе с root (exit боя)
            };
            A.tokenPanelClose = function tokenPanelClose() {
                B.tokenPick = null;
                if (root && root.tokenPanel && !root.tokenPanel.destroyed) {
                    root.tokenPanel.destroy({ children: true });
                }
                if (root) root.tokenPanel = null;
            };
            A.tokenPanelCast = function tokenPanelCast(dir) {
                if (!B.tokenPick) return;
                const target = { col: B.tokenPick.col, row: B.tokenPick.row, dir };
                const sel = B.selected;
                tokenPanelClose();
                if (sel !== null) castSpell(sel, target);
                else deselect();
            };

            A.onCardTap = function onCardTap(idx) {
                if (B.phase !== "player" || B.discarding || B.picking) return;
                if (B.journeySummon) return; // сначала поставьте (или отмените) призыв
                swapPickClear(); // «Перемена мест»: сменена карта — цели заново (W65)
                const def = CARDS[B.hand[idx]];
                if (!def) return;
                if (ctx.sfx) ctx.sfx();
                if (def.type === "spell" && def.spell.target === "none") {
                    castSpell(idx); // без цели — сразу
                    return;
                }
                if (def.type === "trap") {
                    // руна вешается на существо; W60: «Призрачные споры» —
                    // клеточная, ставится как мины; лимита ловушек нет
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
                    // «Летучий остров» (hw270, W78): прицел активной
                    // способности — клик по СВОЕМУ существу возвращает его
                    // в руку владельца и даёт 2 энергии (1 раз в ход);
                    // клик мимо — прицел снимается
                    if (B.islandPick) {
                        const t = unitAt(col, row);
                        if (t && t.side === "p" && effCreature(t)) {
                            islandActivate("p", B.islandPick, t);
                        } else {
                            B.islandPick = false;
                            redrawHighlight();
                        }
                        return;
                    }
                    // «Склеп» (dec157): клик по своей постройке СРАЗУ
                    // разыгрывает верхнюю карту сброса (с оплатой) —
                    // просил юзер: не ждать, пока игрок сыграет её сам.
                    // Одна карта за раз (cryptTaken гасит повторный клик)
                    const cb = unitAt(col, row);
                    if (cb && cb.side === "p" && cb.def.type === "building"
                        && cb.def.cryptPlay && B.discard.length && !B.cryptTaken) {
                        cryptAutoPlay(B.discard[B.discard.length - 1], col, row);
                        return;
                    }
                    // «Лаборатория» (tim224): активация кликом по постройке —
                    // взять карту, постройка снова уходит в «Сдвиг 1»
                    if (cb && cb.side === "p" && cb.def.type === "building"
                        && cb.def.lab) {
                        labActivate("p", cb);
                        return;
                    }
                    // «Летучий остров» (hw270): клик по острову открывает
                    // прицел (подсветка своих существ) — есть своё существо
                    // и ход ещё не активировал остров
                    if (cb && cb.side === "p" && cb.def.type === "building"
                        && cb.def.islandAct && !cb.islandUsed
                        && B.units.some((v) => v.side === "p" && effCreature(v))) {
                        B.islandPick = cb;
                        const ip = cellXY(cb.col, cb.row);
                        floatText(ip.x, ip.y - 96,
                            GAME_LOC.t("card.hw270.name"), 0x9ecbe8);
                        redrawHighlight();
                    }
                    return;
                }
                const def = CARDS[B.hand[B.selected]];
                if (!def) return;
                if (B.spellTarget) { // прицел: по врагу, любому существу или строению
                    const sdef = CARDS[B.hand[B.selected]];
                    const u = unitAt(col, row);
                    const tg = sdef.spell.target;
                    if (sdef.spell.swap) { // «Перемена мест» (gh254, W65):
                        // две цели выбираются ПООЧЕРЁДНО — единственное в
                        // игре заклинание со второй целью. Первая ждёт в
                        // B.swapPick (маркер «swapMark», карта ещё не
                        // потрачена), вторая уходит в castSpell как
                        // target.first. Клик мимо цели или по той же клетке —
                        // ждём/снимаем выбор как у остальных прицелов
                        if (!u || !spellAimable(u)) { swapPickClear(); deselect(); return; }
                        if (!B.swapPick) { // первая цель
                            B.swapPick = { col, row };
                            swapMarkDraw(u);
                            const p = cellXY(col, row);
                            floatText(p.x, p.y - 108,
                                GAME_LOC.t("spell.swap.pick2"), 0xb7d0ef);
                            return;
                        }
                        if (B.swapPick.col === col && B.swapPick.row === row)
                            return; // та же клетка — ждём другую
                        const first = B.swapPick;
                        swapPickClear();
                        castSpell(B.selected, { col, row, first });
                        return;
                    }
                    if (tg === "anyCell") { // стена костров — подходит любая клетка
                        castSpell(B.selected, { col, row });
                        return;
                    }
                    if (tg === "emptyCell") { // культ кочерыжки — только пустая клетка
                        if (!unitAt(col, row)) castSpell(B.selected, { col, row });
                        else deselect();
                        return;
                    }
                    if (tg === "token") { // «Управление временем» — по ЖЕТОНУ:
                        // значок «Сдвига» на клетке или «Возврат» существа;
                        // направление (−2/+2) выбирается в панельке
                        const pick = tokenAt(col, row);
                        if (pick) tokenPanelOpen(col, row);
                        else deselect();
                        return;
                    }
                    const typeOk = spellAimable(u) // «Защита от заклинаний» — единая проверка цели
                        && (tg === "anyUnitDmg"
                            ? (u.def.type === "unit"
                                || (u.def.type === "building" && !sdef.spell.noBuildings))
                            : tg === "anyUnitOrFoe" ? effCreature(u) // «Негативный поток»: существо или база врага
                            : tg === "enemyUnit" ? effCreature(u) // «Тёмный контроль»: только существо врага
                            : tg === "ownBuilding" ? u.def.type === "building"
                            : tg === "anyObj" ? true // «Силовой купол»: любое существо или постройка
                            // прочие («Укрепление», колчаны…): существо —
                            // W73: под «Лесным оплотом» и постройка
                            : effCreature(u));
                    const sideOk = !u
                        || ((tg === "ownUnit" || tg === "ownBuilding") ? u.side === "p"
                        : tg === "enemyUnit" ? u.side !== "p" : true);
                    const known = tg === "anyUnit" || tg === "anyUnitDmg"
                        || tg === "anyUnitOrFoe" || tg === "enemyUnit"
                        || tg === "ownUnit" || tg === "ownBuilding"
                        || tg === "anyObj";
                    // «Ледяной удар»: у цели должен быть хотя бы один сосед-
                    // существо, иначе заклинание не разыгрывается
                    const effectOk = !sdef.spell.iceStrike || !!iceStrikeVictim(u);
                    if (u && typeOk && sideOk && known && effectOk) castSpell(B.selected, { col, row });
                    else deselect(); // мимо цели — снять выбор
                    return;
                }
                if (def.type === "trap") {
                    // руна («Наскальная рунопись») — на существо
                    // (W60: «Призрачные споры» — клеточные, ставятся как мины)
                    if (def.trap.effect === "castRandom") {
                        const u = unitAt(col, row);
                        // «Крепится к существу» — без ограничения стороны
                        // (регрессия W60: осталось вражеское условие спор —
                        // руну нельзя было повесить на своё существо, смоук)
                        if (!u || u.def.type !== "unit") {
                            deselect();
                            return;
                        }
                        B.energy -= effCost(B.hand[B.selected]); // цена ловушки
                        const cardId = spendCard(B.selected);
                        consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                        // «Магопуты» (W77): первая карта игрока — отменена
                        if (heroVoidFirstCancel("p")) {
                            const sp = cellXY(u.col, u.row);
                            floatText(sp.x, sp.y - 60,
                                "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                            sfx("mine");
                        } else if (!armTrap("p", cardId, 0, 0, u)) {
                            const sp = cellXY(u.col, u.row);
                            floatText(sp.x, sp.y - 60,
                                "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                        } else {
                            afterTrapPlaced("p"); // «Элементаль молнии» (W77)
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
                        // «Магопуты» (W77): первая карта игрока — отменена
                        if (heroVoidFirstCancel("p")) {
                            const sp = cellXY(u.col, u.row);
                            floatText(sp.x, sp.y - 60,
                                "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                            sfx("mine");
                        } else if (!armTrap("p", cardId, 0, 0, u)) {
                            const sp = cellXY(u.col, u.row);
                            floatText(sp.x, sp.y - 60,
                                "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                        } else {
                            afterTrapPlaced("p"); // «Элементаль молнии» (W77)
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
                    let armed = false;
                    // «Магопуты» (W77): первая карта игрока — отменена
                    if (heroVoidFirstCancel("p")) {
                        const sp = cellXY(col, row);
                        floatText(sp.x, sp.y - 60,
                            "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                        sfx("mine");
                    } else {
                        armed = armTrap("p", cardId, col, row);
                        if (!armed) { // «Битва умов» (wis114) врага: ловушка не ставится
                            const sp = cellXY(col, row);
                            floatText(sp.x, sp.y - 60,
                                "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                        } else {
                            afterTrapPlaced("p"); // «Элементаль молнии» (W77)
                        }
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
                // то же для ПОСТРОЕК: срабатывает на розыгрыш строения.
                // «Магопуты» (firstCardVoid, W77): первая карта игрока за
                // бой отменяется героем врага — карта и энергия потрачены
                if ((CARDS[cardId].type === "unit"
                        && (heroVoidFirstCancel("p")
                            || counterTrapConsume("e", "counterSummon")))
                    || (CARDS[cardId].type === "building"
                        && (heroVoidFirstCancel("p")
                            || counterTrapConsume("e", "counterBuilding")))) {
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

            // «Эльф корней» (sg247, W56): призывает Эльфа 1/1 (жетон
            // sgrRootElf) на СЛУЧАЙНУЮ пустую клетку поля боя (не только
            // своей зоны призыва). Поле забито — существо не призывается.
            // Способность жетона («Опутывание 1» случайному вражескому
            // существу) срабатывает в addUnit через summonRootElf.
            // Возвращает true, если призвал
            A.rootElfSpawn = function rootElfSpawn(side) {
                const empty = [];
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) empty.push([col, row]);
                if (!empty.length) return false;
                const [col, row] = empty[(Math.random() * empty.length) | 0];
                addUnit(side, "sgrRootElf", col, row, { token: true });
                return true;
            };

            // «Белый волк» (gh252, W61): призыв Животного (жетон ghWolf)
            // 2/3 в случайную пустую клетку поля боя. Поле забито — волка
            // нет. Способность жетона («соседи +1⚔/+1♥ при его усилении»)
            // срабатывает из onBuff (arenaCombat). Возвращает true, если
            // призвал
            A.wolfSpawn = function wolfSpawn(side) {
                const empty = [];
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) empty.push([col, row]);
                if (!empty.length) return false;
                const [col, row] = empty[(Math.random() * empty.length) | 0];
                addUnit(side, "ghWolf", col, row, { token: true });
                return true;
            };

            // «Огнелис»/«Огнемедведь» (sg249/250, W57): призыв Животного
            // (жетон sgrFox/sgrBear) в СЛУЧАЙНУЮ пустую клетку поля боя с
            // распределёнными очками характеристик. База жетона в каталоге =
            // авто-распределению поровну (4/4 и 5/4); выбранные статы
            // накладываются поверх, как в phoenixRise. Возвращает true, если
            // призвал
            A.splitSpawn = function splitSpawn(side, tokenId, atk, hp) {
                const empty = [];
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) empty.push([col, row]);
                if (!empty.length) return false;
                const [col, row] = empty[(Math.random() * empty.length) | 0];
                const u = addUnit(side, tokenId, col, row, { token: true });
                if (u) {
                    const dAtk = atk - u.curAtk, dHp = hp - u.hp;
                    if (dAtk) u.bonusAtk += dAtk;
                    if (dHp) u.hp += dHp;
                    recalcAuras();
                    const an = u.node.getChildByName("atk");
                    if (an) an.text = String(u.curAtk);
                    const hn = u.node.getChildByName("hp");
                    if (hn) hn.text = String(u.hp);
                    const p = cellXY(col, row);
                    floatText(p.x, p.y - 75, `${u.curAtk}⚔/${u.hp}♥`, 0xffb26e);
                }
                return true;
            };

            // Есть ли где призывать splitSpawn (жетон «Огнелиса/Огнемедведя»)
            A.splitSpawnable = function splitSpawnable() {
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) return true;
                return false;
            };

            // «Рождение феникса» (sg244, W55): уничтожить ВСЕ постройки на
            // поле (обе стороны — в спеке «все постройки»), посчитать
            // погибших; в случайной пустой клетке поля появляется Элементаль
            // (жетон sgrElem, «Полёт») с ⚔/♥ = числу уничтоженных построек.
            // Построек не было или поле забито — жетона нет. Каскады смерти
            // штатные (killUnit): «Горящие рунокамни» и способность героя
            // срабатывают. Возвращает число уничтоженных построек
            A.phoenixRise = function phoenixRise(side) {
                let n = 0;
                for (const v of B.units.slice()) {
                    if (!v || v.def.type !== "building" || !B.units.includes(v)) continue;
                    if (killUnit(v, null)) n++;
                }
                if (n <= 0) return 0;
                const empty = [];
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) empty.push([col, row]);
                if (empty.length) {
                    const [col, row] = empty[(Math.random() * empty.length) | 0];
                    const u = addUnit(side, "sgrElem", col, row, { token: true });
                    if (u) { // база 1/1 — масштаб до n поверх (как keeperScale)
                        u.bonusAtk += n - 1;
                        u.hp += n - 1;
                        recalcAuras();
                        const an = u.node.getChildByName("atk");
                        if (an) an.text = String(u.curAtk);
                        const hn = u.node.getChildByName("hp");
                        if (hn) hn.text = String(u.hp);
                        const p = cellXY(col, row);
                        floatText(p.x, p.y - 75, `${n}⚔/${n}♥`, 0xffb26e);
                        sfx("chpoc");
                    }
                }
                return n;
            };
        }
    };
})();
