// СЦЕНА «АРЕНА»: панели: руны, монолит, пень, путешествие, варка, раскопки.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installPanels = function installPanels(A) {
        with (A) {
            // ── Панель «Поиск рун» (str23) / «Рунное гадание» (grw16): верхние
            // карты колоды — выбрать заклинание (руны) или карту призыва
            // (гадание). Неподходящие видны, но не кликабельны; «Оставить как
            // было» (или Esc) отменяет — карты остаются в колоде в том же порядке.
            A.runesPanel = null;
            A.runesTop = [];
            A.runesWant = "spell";
            A.closeRunesPanel = function closeRunesPanel() {
                if (!runesPanel) return;
                runesPanel.destroy({ children: true });
                runesPanel = null;
                runesTop = [];
                runesWant = "spell";
                if (B) B.picking = false;
            };
            A.openRunesPanel = function openRunesPanel(n, want = "spell") {
                closeRunesPanel();
                B.picking = true;
                runesWant = want;
                const top = B.deck.slice(-Math.min(n, B.deck.length)); // верх колоды — конец массива
                runesTop = top;
                const L = want === "unit" ? "gadanie" : "runes";
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                const frame = new PIXI.Graphics();
                frame.roundRect(285, 270, 1350, 540, 18);
                frame.fill({ color: 0x171310, alpha: 0.96 });
                frame.stroke({ width: 3, color: 0x6b5c40 });
                node.addChild(frame);
                const title = T(t(`${L}.title`), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t(`${L}.hint`, { n: top.length }), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const m = top.length;
                const spread = Math.min(210, 1260 / Math.max(1, m));
                top.forEach((cardId, idx) => {
                    const ok = CARDS[cardId].type === want;
                    const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                    c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                    if (!ok) c.alpha = 0.5; // не то — взять нельзя
                    else { c.eventMode = "static"; c.on("pointertap", () => pickRune(idx, want)); }
                    node.addChild(c);
                });
                if (!top.some((id) => CARDS[id].type === want)) {
                    const empty = T(t(`${L}.empty`), 27, 0x8a7c5e);
                    empty.anchor.set(0.5, 0);
                    empty.position.set(960, 687);
                    empty.eventMode = "none";
                    node.addChild(empty);
                }
                node.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("runes.back"), x: 960, y: 762, scale: 1,
                    onTap: closeRunesPanel,
                }));
                root.addChild(node);
                runesPanel = node;
            };
            A.pickRune = function pickRune(idx, want = runesWant) { // idx — номер карты среди показанных верхних
                if (!B || !B.picking || !runesPanel) return;
                const deckIdx = B.deck.length - runesTop.length + idx;
                const cardId = B.deck[deckIdx];
                if (cardId === undefined || CARDS[cardId].type !== want) return;
                B.deck.splice(deckIdx, 1);
                B.hand.push(cardId);
                sfx("chpoc");
                closeRunesPanel();
                layoutHand();
                refreshHud();
            };

            // ── Панель «Поиск знаний» (wis94): верхние N карт колоды — взять
            // ЛЮБЫЕ `picks` карт в руку. Выбранные уходят в руку, остальные
            // возвращаются наверх колоды в прежнем порядке (как «Поиск рун»:
            // непросмотренное не пропадает). «Закончить»/Esc — взять меньше.
            A.seekPanel = null;
            A.seekTop = [];
            A.seekTaken = [];
            A.seekPicks = 0;
            A.closeSeekPanel = function closeSeekPanel() {
                if (seekPanel) {
                    seekPanel.destroy({ children: true });
                    seekPanel = null;
                }
                if (B) B.picking = false;
            };
            A.finishSeek = function finishSeek() { // подобранное — в руку, остаток — в колоду
                const taken = seekTaken.slice();
                const rest = seekTop.slice();
                seekTaken = [];
                seekTop = [];
                seekPicks = 0;
                closeSeekPanel();
                if (!B) return;
                for (const id of taken) B.hand.push(id);
                if (rest.length) B.deck.push(...rest);
                sfx("chpoc");
                layoutHand();
                refreshHud();
            };
            A.openSeekPanel = function openSeekPanel(n, picks) {
                closeSeekPanel();
                const k = Math.min(n, B.deck.length);
                seekTop = k ? B.deck.splice(B.deck.length - k, k) : []; // верх колоды — конец массива
                seekTaken = [];
                seekPicks = Math.min(Math.max(1, picks | 0 || 1), seekTop.length);
                if (!seekTop.length) return; // в колоде пусто — смотреть нечего
                B.picking = true;
                drawSeekPanel();
            };
            A.drawSeekPanel = function drawSeekPanel() {
                if (seekPanel) {
                    seekPanel.destroy({ children: true });
                    seekPanel = null;
                }
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                node.addChild(stumpFrame());
                const title = T(t("seek.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("seek.hint", { n: seekTop.length, left: seekPicks }), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const m = seekTop.length;
                const spread = Math.min(210, 1260 / Math.max(1, m));
                seekTop.forEach((cardId, idx) => {
                    const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                    c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                    c.eventMode = "static";
                    c.on("pointertap", () => pickSeek(idx));
                    node.addChild(c);
                });
                node.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("seek.done"), x: 960, y: 762, scale: 1,
                    onTap: () => finishSeek(),
                }));
                root.addChild(node);
                seekPanel = node;
            };
            A.pickSeek = function pickSeek(idx) { // idx — номер карты среди показанных
                if (!B || !B.picking || !seekPanel) return;
                const cardId = seekTop[idx];
                if (!cardId) return;
                seekTop.splice(idx, 1);
                seekTaken.push(cardId);
                seekPicks -= 1;
                sfx("chpoc");
                if (seekPicks <= 0 || !seekTop.length) { finishSeek(); return; }
                drawSeekPanel(); // карт осталось меньше — перерисовать
            };

            // ── Панель «Гримуара инея» (wis113): два шага, как у «Пня обряда».
            // Шаг 1 — выбрать тип карты («призыв»/«ловушка»/«заклинание»/
            // «постройка»). Шаг 2 — посмотреть верхние 4 карты колоды: все
            // карты выбранного типа уже взяты в руку, остальные сброшены;
            // взятые показаны в полную силу, сброшенные затемнены. «Готово»
            // (или Esc) закрывает. В колоде пусто — эффект вхолостую.
            A.grimPanel = null;
            A.grimStage = null; // "type" | "show"
            A.grimType = null;
            A.grimTop = [];
            A.closeGrimPanel = function closeGrimPanel() {
                if (grimPanel) {
                    grimPanel.destroy({ children: true });
                    grimPanel = null;
                }
                grimStage = null;
                grimType = null;
                grimTop = [];
                if (B) B.picking = false;
            };
            A.openGrimPanel = function openGrimPanel() {
                closeGrimPanel();
                if (!B.deck.length) return; // смотреть нечего — эффект вхолостую
                B.picking = true;
                grimStage = "type";
                drawGrimPanel();
            };
            A.pickGrimType = function pickGrimType(type) { // розыгрыш: забрать/сбросить сразу
                if (!B || !B.picking || grimStage !== "type") return;
                grimType = type;
                const k = Math.min(4, B.deck.length);
                grimTop = k ? B.deck.splice(B.deck.length - k, k) : []; // верх колоды — конец массива
                const taken = grimTop.filter((id) => CARDS[id].type === type);
                const rest = grimTop.filter((id) => CARDS[id].type !== type);
                if (taken.length) B.hand.push(...taken);
                if (rest.length) B.discard.push(...rest);
                noteDiscard(rest.length, "p", rest); // «Болотная слизь»: пачка в сброс
                sfx("chpoc");
                grimStage = "show";
                layoutHand();
                refreshHud();
                drawGrimPanel();
            };
            A.drawGrimPanel = function drawGrimPanel() {
                if (grimPanel) {
                    grimPanel.destroy({ children: true });
                    grimPanel = null;
                }
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                node.addChild(stumpFrame());
                const title = T(t("grim.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t(grimStage === "type" ? "grim.hintType" : "grim.hintShow",
                    { type: grimType ? t(`grim.${grimType}`) : "" }), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                if (grimStage === "type") {
                    // два ряда по две кнопки (рамка 285..1635, как у прочих панелей)
                    const rows = [["unit", "trap"], ["spell", "building"]];
                    rows.forEach((pair, r) => pair.forEach((type, c) => {
                        node.addChild(globalThis.GAME_UI.button(ctx, {
                            tex: "button_menu.png", label: t(`grim.${type}`),
                            x: c ? 1210 : 710, y: r ? 640 : 480, scale: 1,
                            onTap: () => pickGrimType(type),
                        }));
                    }));
                } else {
                    const m = grimTop.length;
                    const spread = Math.min(210, 1260 / Math.max(1, m));
                    grimTop.forEach((cardId, idx) => {
                        const okType = CARDS[cardId].type === grimType;
                        const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                        c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                        if (!okType) c.alpha = 0.4; // сброшено
                        node.addChild(c);
                    });
                    node.addChild(globalThis.GAME_UI.button(ctx, {
                        tex: "button_menu.png", label: t("grim.ok"), x: 960, y: 762, scale: 1,
                        onTap: closeGrimPanel,
                    }));
                }
                root.addChild(node);
                grimPanel = node;
            };

            // ── Панель «Трёх монолитов» (grw26): поиск по ВСЕЙ колоде существа
            // заданной цены — одно в руку. Триггер — призыв своего существа по
            // соседству с монолитом (см. summonUnit); если монолитов несколько,
            // панели выстраиваются в очередь и открываются по очереди.
            A.monolithPanel = null;
            A.monolithQueue = [];
            A.monolithCost = null; // цена поиска открытой панели (уже снята с очереди)
            A.monolithMatches = function monolithMatches(cost) {
                return B.deck.map((id, idx) => ({ id, idx }))
                    .filter((m) => CARDS[m.id].type === "unit" && CARDS[m.id].cost === cost);
            };
            A.monolithTake = function monolithTake(m) { // из колоды — в руку
                B.deck.splice(m.idx, 1);
                B.hand.push(m.id);
                sfx("chpoc");
                layoutHand();
                refreshHud();
                floatText(960, 840, "+1 " + GAME_LOC.t("card.grw20.draw"), 0x9fd489);
            };
            A.closeMonolithPanel = function closeMonolithPanel() {
                if (monolithPanel) {
                    monolithPanel.destroy({ children: true });
                    monolithPanel = null;
                }
                pumpMonolithQueue();
            };
            A.pumpMonolithQueue = function pumpMonolithQueue() {
                if (!B || !root) return;
                const cost = monolithQueue.shift();
                monolithCost = cost ?? null;
                if (cost === undefined) { B.picking = false; return; }
                const matches = monolithMatches(cost);
                if (!matches.length) { pumpMonolithQueue(); return; } // нет существа — пропускаем
                if (matches.length === 1) { monolithTake(matches[0]); pumpMonolithQueue(); return; }
                B.picking = true;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                const frame = new PIXI.Graphics();
                frame.roundRect(285, 270, 1350, 540, 18);
                frame.fill({ color: 0x171310, alpha: 0.96 });
                frame.stroke({ width: 3, color: 0x6b5c40 });
                node.addChild(frame);
                const title = T(t("monolith.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("monolith.hint", { cost }), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const m = matches.length;
                const spread = Math.min(210, 1260 / m);
                matches.forEach((mt, idx) => {
                    const c = globalThis.GAME_UI.cardFace(ctx, mt.id, { scale: 0.66 });
                    c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                    c.eventMode = "static";
                    c.on("pointertap", () => { monolithTake(mt); closeMonolithPanel(); });
                    node.addChild(c);
                });
                node.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("monolith.back"), x: 960, y: 762, scale: 1,
                    onTap: closeMonolithPanel,
                }));
                root.addChild(node);
                monolithPanel = node;
            };
            A.queueMonolithSearch = function queueMonolithSearch(cost) { monolithQueue.push(cost); pumpMonolithQueue(); };
            // монолит врага: ИИ не выбирает — берёт первое попавшееся
            A.monolithEnemyTake = function monolithEnemyTake(cost) {
                const i = B.eDeck.findIndex((id) => CARDS[id].type === "unit" && CARDS[id].cost === cost);
                if (i < 0) return;
                B.eHand.push(B.eDeck.splice(i, 1)[0]);
            };

            // ── Панель «Пень обряда» (grw11): в начале хода владельца — взгляд
            // на верхнюю карту своей или вражеской колоды; «Оставить наверху»
            // закрывает, «Сбросить» отправляет карту в сброс. Esc = оставить.
            A.stumpPanel = null;
            A.stumpSide = null;
            A.stumpTop = null;
            A.closeStumpPanel = function closeStumpPanel() {
                if (!stumpPanel) return;
                stumpPanel.destroy({ children: true });
                stumpPanel = null;
                stumpSide = null;
                stumpTop = null;
                if (B) B.picking = false;
            };
            A.stumpShow = function stumpShow(side) { // выбор колоды → верхняя карта и решения
                if (!stumpPanel) return;
                const deck = side === "p" ? B.deck : B.eDeck;
                if (!deck.length) return; // колода пуста — смотреть нечего
                stumpSide = side;
                stumpTop = deck[deck.length - 1];
                const body = stumpPanel.getChildByName("body");
                body.destroy({ children: true });
                const fresh = new PIXI.Container();
                fresh.name = "body";
                const face = globalThis.GAME_UI.cardFace(ctx, stumpTop, { scale: 0.72 });
                face.position.set(960, 545);
                fresh.addChild(face);
                fresh.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("stump.keep"), x: 710, y: 762, scale: 1,
                    onTap: closeStumpPanel, // оставить наверху — панели конец
                }));
                fresh.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("stump.burn"), x: 1210, y: 762, scale: 1,
                    onTap: () => stumpBurn(),
                }));
                stumpPanel.addChild(fresh);
            };
            A.stumpBurn = function stumpBurn() { // «Сбросить»: верхняя карта показанной колоды — в сброс
                if (!stumpPanel || !stumpSide) return;
                const deck = stumpSide === "p" ? B.deck : B.eDeck;
                const disc = stumpSide === "p" ? B.discard : B.eDiscard;
                if (!deck.length) return;
                const id = deck.pop();
                disc.push(id);
                sfx("chpoc");
                closeStumpPanel();
                refreshHud();
            };
            A.openStumpPanel = function openStumpPanel() {
                closeStumpPanel();
                if (!B.deck.length && !B.eDeck.length) return; // смотреть нечего
                B.picking = true;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                node.addChild(stumpFrame());
                const title = T(t("stump.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("stump.hint"), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const body = new PIXI.Container(); // перезаполняется выбором колоды
                body.name = "body";
                node.addChild(body);
                const deckBtn = (key, side, x) => {
                    const deck = side === "p" ? B.deck : B.eDeck;
                    const btn = globalThis.GAME_UI.button(ctx, {
                        tex: "button_menu.png", label: t(key), x, y: 560, scale: 1,
                        onTap: () => stumpShow(side),
                    });
                    btn.alpha = deck.length ? 1 : 0.45; // пустая колода — не смотреть
                    return btn;
                };
                body.addChild(deckBtn("stump.own", "p", 660));
                body.addChild(deckBtn("stump.foe", "e", 1260));
                root.addChild(node);
                stumpPanel = node;
            };
            A.stumpFrame = function stumpFrame() { // рамка панели — как у «Поиска рун»
                const frame = new PIXI.Graphics();
                frame.roundRect(285, 270, 1350, 540, 18);
                frame.fill({ color: 0x171310, alpha: 0.96 });
                frame.stroke({ width: 3, color: 0x6b5c40 });
                return frame;
            };

            // ── Панель «Глубокое путешествие» (str26): верхние карты колоды ────
            // (снимаются с колоды сразу при касте) — выбрать карту ПРИЗЫВА и
            // сыграть её бесплатно. Из остальных: 1 случайная — в руку, прочие —
            // в сброс (это происходит и без выбора, «Без призыва»/Esc). Если
            // призыва среди верхних нет — панель не открывается вовсе.
            // Выбранная карта ставится в режим journeySummon: игрок кликает
            // клетку зоны призыва — существо выходит БЕЗ траты энергии (Esc или
            // клик мимо — карта просто возвращается в руку).
            A.journeyPanel = null;
            A.journeyTop = [];
            A.closeJourneyPanel = function closeJourneyPanel() {
                if (!journeyPanel) return;
                journeyPanel.destroy({ children: true });
                journeyPanel = null;
                journeyTop = [];
                if (B) B.picking = false;
            };
            A.openJourneyPanel = function openJourneyPanel(n) {
                closeJourneyPanel();
                const k = Math.min(n, B.deck.length);
                journeyTop = k ? B.deck.splice(B.deck.length - k, k) : []; // верх колоды — конец массива
                if (!journeyTop.some((id) => CARDS[id].type === "unit")) {
                    finishJourney(null); // призыва нет: случайная — в руку, прочие в сброс
                    return;
                }
                B.picking = true;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                const frame = new PIXI.Graphics();
                frame.roundRect(285, 270, 1350, 540, 18);
                frame.fill({ color: 0x171310, alpha: 0.96 });
                frame.stroke({ width: 3, color: 0x6b5c40 });
                node.addChild(frame);
                const title = T(t("journey.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("journey.hint", { n: journeyTop.length }), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const m = journeyTop.length;
                const spread = Math.min(210, 1260 / Math.max(1, m));
                journeyTop.forEach((cardId, idx) => {
                    const isUnit = CARDS[cardId].type === "unit";
                    const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                    c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                    if (!isUnit) c.alpha = 0.5; // не призыв — сыграть нельзя
                    else { c.eventMode = "static"; c.on("pointertap", () => pickJourney(idx)); }
                    node.addChild(c);
                });
                node.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("journey.back"), x: 960, y: 762, scale: 1,
                    onTap: () => finishJourney(null),
                }));
                root.addChild(node);
                journeyPanel = node;
            };
            A.pickJourney = function pickJourney(idx) { // idx — номер карты среди показанных верхних
                if (!B || !B.picking || !journeyPanel) return;
                const cardId = journeyTop[idx];
                if (!cardId || CARDS[cardId].type !== "unit") return;
                finishJourney(cardId);
            };
            // раздача остатков и запуск бесплатного призыва (chosen может быть
            // null — игрок отказался от призыва)
            A.finishJourney = function finishJourney(chosen) {
                const rest = journeyTop.filter((id) => id !== chosen);
                if (rest.length) {
                    const k = (Math.random() * rest.length) | 0;
                    B.hand.push(rest[k]); // одна случайная — в руку
                    for (let i = 0; i < rest.length; i++) if (i !== k) B.discard.push(rest[i]);
                    noteDiscard(rest.length - 1, "p",
                        rest.filter((_, i) => i !== k)); // «Болотная слизь»
                }
                sfx("chpoc");
                closeJourneyPanel();
                if (chosen) {
                    if (freeCells(deployRows("p")).length) { // есть куда поставить
                        B.journeySummon = chosen;
                        layoutHand();
                        redrawHighlight();
                        refreshHud();
                        return;
                    }
                    B.hand.push(chosen); // поле забито — карта хотя бы в руку
                }
                layoutHand();
                refreshHud();
            };
            // отказ от бесплатного призыва — карта возвращается в руку
            A.cancelJourneySummon = function cancelJourneySummon() {
                if (!B.journeySummon) return;
                B.hand.push(B.journeySummon);
                B.journeySummon = null;
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            // ── Панель «Варки зелий» (grw23): заклинание из СВОЕГО сброса или
            // сброса противника — себе в руку, карта получает «Сожжение»
            // (после розыгрыша удаляется из боя, в сброс не попадает).
            // Два шага, как у «Пня обряда»: выбор сброса → выбор заклинания;
            // «Назад»/Esc закрывает (само заклинание уже потрачено — как у
            // «Поиска рун»). Заклинаний ни в одном сбросе — панель не открывается.
            A.brewPanel = null;
            A.brewPile = null;
            A.closeBrewPanel = function closeBrewPanel() {
                if (!brewPanel) return;
                brewPanel.destroy({ children: true });
                brewPanel = null;
                brewPile = null;
                if (B) B.picking = false;
            };
            A.spellsInDiscard = function spellsInDiscard(side) {
                const disc = side === "p" ? B.discard : B.eDiscard;
                return disc.filter((id) => CARDS[id] && CARDS[id].type === "spell");
            };
            A.openBrewPanel = function openBrewPanel() {
                closeBrewPanel();
                B.picking = true;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                node.addChild(stumpFrame());
                const title = T(t("brew.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("brew.hint"), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const body = new PIXI.Container(); // перезаполняется выбором сброса
                body.name = "body";
                node.addChild(body);
                const pileBtn = (key, side, x) => {
                    const n = spellsInDiscard(side).length;
                    const btn = globalThis.GAME_UI.button(ctx, {
                        tex: "button_menu.png", label: t(key), x, y: 560, scale: 1,
                        onTap: () => brewShow(side),
                    });
                    btn.alpha = n ? 1 : 0.45; // пустой сброс — не смотреть
                    return btn;
                };
                body.addChild(pileBtn("brew.own", "p", 660));
                body.addChild(pileBtn("brew.foe", "e", 1260));
                root.addChild(node);
                brewPanel = node;
            };
            A.brewShow = function brewShow(side) { // заклинания выбранного сброса
                if (!brewPanel) return;
                const spells = spellsInDiscard(side);
                if (!spells.length) return;
                brewPile = side;
                const body = brewPanel.getChildByName("body");
                body.destroy({ children: true });
                const fresh = new PIXI.Container();
                fresh.name = "body";
                const m = spells.length;
                const spread = Math.min(210, 1260 / Math.max(1, m));
                spells.forEach((cardId, idx) => {
                    const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                    c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                    c.eventMode = "static";
                    c.on("pointertap", () => pickBrew(idx));
                    fresh.addChild(c);
                });
                fresh.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("brew.back"), x: 960, y: 762, scale: 1,
                    onTap: closeBrewPanel,
                }));
                brewPanel.addChild(fresh);
            };
            A.pickBrew = function pickBrew(idx) { // idx — номер карты среди заклинаний сброса
                if (!B || !B.picking || !brewPanel || !brewPile) return;
                const disc = brewPile === "p" ? B.discard : B.eDiscard;
                const spells = disc.filter((id) => CARDS[id] && CARDS[id].type === "spell");
                const cardId = spells[idx];
                if (!cardId) return;
                disc.splice(disc.indexOf(cardId), 1);
                B.hand.push(cardId);
                B.scorch.p.add(cardId); // «Сожжение»: после розыгрыша — из боя
                sfx("chpoc");
                closeBrewPanel();
                layoutHand();
                refreshHud();
            };

            // ── Панель «Раскопок» (grw39): выбранная своя постройка убрана в
            // сброс — теперь постройка ИЗ СВОЕГО сброса встаёт в её клетку.
            // «Оставить»/Esc — обмен не завершён: клетка пустует, постройки
            // остаются в сбросе. Построек в сбросе нет — панель не открывается.
            A.excavatePanel = null;
            A.excavateCell = null;
            A.closeExcavatePanel = function closeExcavatePanel() {
                if (!excavatePanel) return;
                excavatePanel.destroy({ children: true });
                excavatePanel = null;
                excavateCell = null;
                if (B) B.picking = false;
                refreshHud();
            };
            A.buildingsInDiscard = function buildingsInDiscard() {
                return B.discard.filter((id) => CARDS[id] && CARDS[id].type === "building");
            };
            A.openExcavatePanel = function openExcavatePanel(cell) {
                closeExcavatePanel();
                const blds = buildingsInDiscard();
                if (!blds.length) { // в сбросе построек нет — поменять не на что
                    floatText(cellXY(cell.col, cell.row).x,
                        cellXY(cell.col, cell.row).y - 60, t("excavate.empty"), 0x8a7c5e);
                    return;
                }
                B.picking = true;
                excavateCell = cell;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                node.addChild(stumpFrame());
                const title = T(t("excavate.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("excavate.hint"), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const m = blds.length;
                const spread = Math.min(210, 1260 / m);
                blds.forEach((cardId, idx) => {
                    const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                    c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                    c.eventMode = "static";
                    c.on("pointertap", () => pickExcavate(idx));
                    node.addChild(c);
                });
                node.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("excavate.back"), x: 960, y: 762, scale: 1,
                    onTap: closeExcavatePanel,
                }));
                root.addChild(node);
                excavatePanel = node;
            };
            A.pickExcavate = function pickExcavate(idx) { // idx — номер карты среди построек сброса
                if (!B || !B.picking || !excavatePanel || !excavateCell) return;
                const blds = buildingsInDiscard();
                const cardId = blds[idx];
                if (!cardId) return;
                const cell = excavateCell;
                B.discard.splice(B.discard.indexOf(cardId), 1);
                closeExcavatePanel();
                addUnit("p", cardId, cell.col, cell.row); // ловушка на клетке сработает, как при призыве
                layoutHand();
                redrawHighlight();
                refreshHud();
                checkEnd();
            };

            // ── Панель «Поднятие мёртвых» (dec124): карты СУЩЕСТВ из СВОЕГО
            // сброса — выбрать одну, она уходит в руку (без «Сожжения»).
            // Существ в сбросе нет — заклинание не разыгрывается вовсе
            // (гейт в applySpellPInner, карта и энергия целы).
            A.raisePanel = null;
            A.closeRaisePanel = function closeRaisePanel() {
                if (!raisePanel) return;
                raisePanel.destroy({ children: true });
                raisePanel = null;
                if (B) B.picking = false;
            };
            A.openRaisePanel = function openRaisePanel() {
                closeRaisePanel();
                const units = unitsInDiscard("p");
                if (!units.length) return; // страховка гейта applySpellPInner
                B.picking = true;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                node.addChild(stumpFrame());
                const title = T(t("raise.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("raise.hint"), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const m = units.length;
                const spread = Math.min(210, 1260 / m);
                units.forEach((cardId, idx) => {
                    const c = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.66 });
                    c.position.set(960 + (idx - (m - 1) / 2) * spread, 545);
                    c.eventMode = "static";
                    c.on("pointertap", () => pickRaise(idx));
                    node.addChild(c);
                });
                node.addChild(globalThis.GAME_UI.button(ctx, {
                    tex: "button_menu.png", label: t("raise.back"), x: 960, y: 762, scale: 1,
                    onTap: closeRaisePanel, // карта уже потрачена — эффект вхолостую
                }));
                root.addChild(node);
                raisePanel = node;
            };
            A.pickRaise = function pickRaise(idx) { // idx — среди существ сброса
                if (!B || !B.picking || !raisePanel) return;
                const units = unitsInDiscard("p");
                const cardId = units[idx];
                if (!cardId) return;
                B.discard.splice(B.discard.indexOf(cardId), 1);
                B.hand.push(cardId);
                sfx("chpoc");
                const p = cellXY(2, 4);
                floatText(p.x, p.y + 84, "↩ " + GAME_LOC.t(`card.${cardId}.name`), 0x9fd489);
                closeRaisePanel();
                layoutHand();
                refreshHud();
            };

            // ── Панель «Пытки разума» (dec125): выбрать, КТО сбрасывает
            // 2 случайные карты с руки — вы или противник. Сторона с пустой
            // рукой не выбирается (эффект по ней пуст); у обеих пусто —
            // заклинание не разыгрывается (гейт в applySpellPInner).
            A.torturePanel = null;
            A.tortureCount = 2;
            A.closeTorturePanel = function closeTorturePanel() {
                if (!torturePanel) return;
                torturePanel.destroy({ children: true });
                torturePanel = null;
                if (B) B.picking = false;
            };
            A.openTorturePanel = function openTorturePanel(n) {
                closeTorturePanel();
                tortureCount = n;
                B.picking = true;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                node.addChild(stumpFrame());
                const title = T(t("torture.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 297);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("torture.hint", { n: tortureCount }), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 354);
                hint.eventMode = "none";
                node.addChild(hint);
                const whoBtn = (key, side, x) => {
                    const btn = globalThis.GAME_UI.button(ctx, {
                        tex: "button_menu.png", label: t(key), x, y: 560, scale: 1,
                        onTap: () => pickTorture(side),
                    });
                    if (!(side === "p" ? B.hand : B.eHand).length) btn.alpha = 0.45;
                    return btn;
                };
                node.addChild(whoBtn("torture.you", "p", 660));
                node.addChild(whoBtn("torture.foe", "e", 1260));
                root.addChild(node);
                torturePanel = node;
            };
            A.pickTorture = function pickTorture(side) {
                if (!B || !B.picking || !torturePanel) return;
                closeTorturePanel();
                randomDiscard(side, tortureCount);
            };
        }
    };
})();
