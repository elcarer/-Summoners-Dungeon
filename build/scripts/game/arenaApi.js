// СЦЕНА «АРЕНА»: тестовый API арены.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installApi = function installApi(A) {
        with (A) {
            A.api = {
                endTurn() {
                    if (!B || B.phase !== "player" || B.discarding || B.picking) return;
                    cancelJourneySummon(); // незавершённый призыв — карта в руку
                    // шкала применяется автоматически: слева карты, справа энергия
                    const total = spheresTotal();
                    const cards = Math.max(0, Math.min(B.split, total));
                    const energy = total - cards;
                    if (cards > 0) { drawCards(cards); sfx("chpoc"); }
                    if (energy > 0) { B.energy += energy; sfx("aqua"); } // на следующий ход
                    layoutHand();
                    refreshHud();
                    if (B.hand.length > HAND_MAX) buildDiscardPanel(); // лимит — на конце хода
                    else enemyTurn();
                },
                // шкала «карты↔энергия»: total сфер (3 + ход−1), split — доля в карты
                sliderGet: () => (B ? { total: spheresTotal(), split: B.split } : null),
                // длительности текущих глиссад (тесты скорости анимаций)
                movesInfo: () => moves.map((m) => Math.round(m.total * 1000) / 1000),
                sliderSet(n) {
                    if (!B) return null;
                    const total = spheresTotal();
                    B.split = Math.max(0, Math.min(total, n | 0));
                    refreshSlider();
                    return B.split;
                },
                // плавное состояние шкалы (тесты): бегунок на доле курсора,
                // идёт ли доскок к засечке
                sliderGeom: () => (root && root.hud
                    ? { thumbX: Math.round(root.hud.userData.slider.thumb.position.x * 100) / 100,
                        vis: sliderVis !== null ? Math.round(sliderVis * 1000) / 1000 : null,
                        gliding: !!sliderGlide }
                    : null),
                // тексты открытого оверлея (тесты: кнопки панели настроек)
                panelTexts: () => {
                    if (!overlay) return null;
                    const out = [];
                    (function walk(n) { if (n.text) out.push(n.text); n.children.forEach(walk); })(overlay.node);
                    return out;
                },
                // панель сброса лишних карт (конец хода, рука > 7)
                discardPick(idx) { pickDiscard(idx); },
                discardNeeded: () => (B ? Math.max(0, B.hand.length - HAND_MAX) : 0),
                playCardAt(handIdx, col, row) {
                    B.selected = handIdx;
                    B.spellTarget = false;
                    onCellTap(col, row);
                },
                // клик по клетке как есть (бесплатный призыв «Глубокого путешествия»)
                cellTap(col, row) { onCellTap(col, row); },
                select(handIdx) { onCardTap(handIdx); },
                castSpell,
                playTrap(handIdx, col, row) { // мина — выбрать карту и пустую клетку
                    B.selected = handIdx;
                    B.spellTarget = false;
                    onCellTap(col, row);
                },
                deployRows,
                // оверлеи боя (настройки / колода-остаток / сброс)
                openPanel(name) { if (B && root && B.phase !== "over") openOverlay(name); },
                closePanel() { closeOverlay(); },
                panel: () => (overlay && overlay.name) || null,
                // карта-подсказка на жетон (тесты): что показано + наведение по клетке
                unitCardState: () => (unitCard
                    ? { id: cardIdOf(unitCard.unit.def), side: unitCard.unit.side,
                        col: unitCard.unit.col, row: unitCard.unit.row }
                    : null),
                // карта, разыгранная врагом (тесты): что показано слева + свечение
                enemyCardState: () => (enemyCard
                    ? (() => {
                        const f = enemyCard.node.getChildByName("glowFrame");
                        return { id: enemyCard.id, x: enemyCard.node.x, y: enemyCard.node.y,
                            glow: f ? { w: Math.round(f.width), h: Math.round(f.height) } : null };
                    })()
                    : null),
                // тест-хуки показа карты врага (как в aiPlay): позиция
                // эффекта заклинания из руки проверяемо привязана к карте
                _showEnemyCard(id) { if (B && CARDS[id]) { showEnemyCard(id); return true; } return false; },
                _hideEnemyCard() { hideEnemyCard(); return true; },
                // ловушки (тесты): у руны видно существо, на котором она висит
                trapList: () => ({
                    p: B.traps.p.map((tr) => ({ eff: tr.def.trap.effect,
                        col: tr.unit ? null : tr.col, row: tr.unit ? null : tr.row,
                        unit: tr.unit ? cardIdOf(tr.unit.def) : null,
                        on: tr.unit ? B.units.includes(tr.unit) : null })),
                    e: B.traps.e.map((tr) => ({ eff: tr.def.trap.effect,
                        col: tr.unit ? null : tr.col, row: tr.unit ? null : tr.row,
                        unit: tr.unit ? cardIdOf(tr.unit.def) : null,
                        on: tr.unit ? B.units.includes(tr.unit) : null })),
                }),
                hoverCell(col, row) { const p = cellXY(col, row); unitHoverAt(p.x, p.y); },
                hoverPoint(x, y) { unitHoverAt(x, y); }, // тест: точное наведение (значок ловушки)
                hoverOff: () => hoverHideAll(),
                // карта-подсказка СВОЕЙ ловушки (тесты): что показано + наведение
                trapCardState: () => (trapCard
                    ? { id: trapCard.id, effect: trapCard.trap.def.trap.effect,
                        col: trapCard.trap.col, row: trapCard.trap.row,
                        unit: trapCard.trap.unit ? cardIdOf(trapCard.trap.unit.def) : null }
                    : null),
                // drag&drop (режим «Перетаскивание»): состояние для тестов
                dragState() {
                    return drag ? { idx: drag.idx, moved: drag.moved, over: drag.over,
                        nodeIdx: drag.node ? drag.node.__handIdx : null } : null;
                },
                // геометрия первой карты руки (дизайн-координаты) — тесты «не закрывает поле»
                handGeom() {
                    if (!root || !B || !root.cardsLayer.children.length) return null;
                    const b = root.cardsLayer.children[0].getBounds();
                    const wt = ctx.ui.worldTransform; // полная цепочка letterbox × бокс
                    return {
                        x: (b.x - wt.tx) / wt.a, top: (b.y - wt.ty) / wt.d,
                        w: b.width / wt.a, h: b.height / wt.d,
                    };
                },
                state() {
                    return {
                        phase: B.phase, result: B.result,
                        pBase: B.playerBase, eBase: B.enemyBase,
                        energy: B.energy, eEnergy: B.eEnergy,
                        spheres: { total: spheresTotal(), split: B.split },
                        hand: [...B.hand],
                        discarding: !!B.discarding,
                        discardMode: B.discardMode || "overflow",
                        pendingDiscard: B.pendingDiscard || 0,
                        picking: !!B.picking,
                        lastSpell: B.lastSpell.p,
                        journeySummon: B.journeySummon,
                        eDeck: B.eDeck.length,
                        units: B.units.map((u) => ({ side: u.side, id: cardIdOf(u.def), col: u.col, row: u.row, hp: u.hp, atk: u.curAtk, type: u.def.type, spr: !!u.node.getChildByName("body"), ench: !!u.enchantFire, berserk: u.berserk || 0, confused: u.confused || 0, venom: u.venom || 0, poison: u.poison || 0, entangle: u.entangle || 0, frozen: u.frozen || 0, frozenMark: !!u.node.getChildByName("frozenMark"), ward: !!u.spellWard, token: !!u.token, exhuming: u.exhuming || 0, exhumingMark: !!u.node.getChildByName("exhumingMark") })),
                        traps: { p: B.traps.p.length, e: B.traps.e.length },
                        // эффекты висящих ловушек (тесты: «Отмена заклинания/
                        // призыва» и др. — какие ловушки на поле)
                        trapFx: { p: B.traps.p.map((t) => t.def.trap.effect),
                            e: B.traps.e.map((t) => t.def.trap.effect) },
                        firewalls: B.firewalls.map((f) => ({ side: f.side, row: f.row, left: f.left })),
                        // «Поднятие мёртвых»/«Пытка разума» (тесты): панели
                        raise: { open: !!raisePanel, cards: unitsInDiscard("p") },
                        torture: { open: !!torturePanel, count: tortureCount },
                    };
                },
                // «Стена костров» (тесты): касты + сколько спрайтов огня на поле
                firewalls: () => ({ list: B.firewalls.map((f) => ({ ...f })),
                    sprites: root.fireLayer.children.length }),
                // тест-хук: тик стены костров (как в конце хода стороны)
                _fwTick(side) { firewallTick(side); return B.firewalls.map((f) => ({ ...f })); },
                // тест-хук: тик ростков — конец хода стороны (+1 жизни постройкам)
                _sproutTick(side) { sproutTick(side); return true; },
                // «Поиск рун» (тесты): состав панели и выбор карты
                runesState: () => ({ picking: !!B.picking, top: [...runesTop], want: runesWant }),
                runesPick(idx) { pickRune(idx); },
                // «Поиск знаний» (wis94, тесты): верхние карты, что взято, сколько осталось
                seekState: () => ({ open: !!seekPanel, picking: !!(B && B.picking),
                    top: [...seekTop], taken: [...seekTaken], left: seekPicks }),
                seekPick(idx) { pickSeek(idx); },
                seekDone() { finishSeek(); },
                // «Гримуар инея» (wis113, тесты): стадия панели и выбор типа
                grimState: () => ({ open: !!grimPanel, picking: !!(B && B.picking),
                    stage: grimStage, type: grimType, top: [...grimTop] }),
                grimPick(type) { pickGrimType(type); },
                grimDone() { closeGrimPanel(); },
                // «Старший ледовик»/«Выросшие духи» (тесты): способности напрямую
                _frostNeighbors(col, row) {
                    const a = unitAt(col, row);
                    if (!a) return false;
                    frostNeighbors(a);
                    return true;
                },
                _trapOnMove(col, row) {
                    const u = unitAt(col, row);
                    if (!u) return false;
                    trapOnMoveAct(u);
                    return true;
                },
                // «Пень обряда» (тесты): панель и нажатия её кнопок
                stumpState: () => ({ open: !!stumpPanel, picking: !!(B && B.picking),
                    side: stumpSide, top: stumpTop }),
                stumpChoose(side) { stumpShow(side); },
                stumpKeep() { closeStumpPanel(); },
                stumpBurn() { stumpBurn(); },
                // «Глубокое путешествие» (тесты): панель, выбор призыва, режим
                // бесплатной постановки
                journeyState: () => ({ picking: !!journeyPanel, top: [...journeyTop] }),
                journeyPick(idx) { pickJourney(idx); },
                journeySummon: () => (B ? B.journeySummon : null),
                // «Варка зелий» (тесты): панель, заклинания сбросов, «Сожжение»
                brewState: () => ({ open: !!brewPanel, picking: !!(B && B.picking),
                    pile: brewPile,
                    own: spellsInDiscard("p"), foe: spellsInDiscard("e") }),
                brewChoose(side) { brewShow(side); },
                brewPick(idx) { pickBrew(idx); },
                scorch: () => ({ p: [...B.scorch.p], e: [...B.scorch.e] }),
                // «Три монолита» (тесты): панель поиска, совпадения, выбор
                monolithState: () => ({ open: !!monolithPanel, picking: !!(B && B.picking),
                    queue: monolithQueue.slice(), cost: monolithCost,
                    matches: monolithPanel ? monolithMatches(monolithCost ?? -1)
                        .map((m) => m.id) : [] }),
                monolithPick(cardIdx) {
                    if (!monolithPanel) return false;
                    const m = monolithMatches(monolithCost ?? -1)[cardIdx];
                    if (!m) return false;
                    monolithTake(m);
                    closeMonolithPanel();
                    return true;
                },
                // «Раскопки» (тесты): панель обмена и выбор постройки из сброса
                excavateState: () => ({ open: !!excavatePanel, picking: !!(B && B.picking),
                    cell: excavateCell, blds: excavatePanel ? buildingsInDiscard() : [] }),
                excavatePick(idx) { pickExcavate(idx); },
                // «Поднятие мёртвых» (dec124, тесты): панель и выбор существа
                raisePick(idx) { pickRaise(idx); },
                // «Пытка разума» (dec125, тесты): панель и выбор стороны
                torturePick(side) { pickTorture(side); },
                // «Запретные знания» (dec130, тесты): панель и выбор стороны
                forbiddenPick(side) { pickForbidden(side); },
                // «Кровавая луна» (dec160, тесты): панель и выбор траты
                moonState: () => ({ open: !!moonPanel, picking: !!(B && B.picking),
                    cap: moonMax }),
                moonPick(n) { pickMoon(n); },
                // «Склеп» (dec157, тесты): замешивание сыгранной карты (ИИ-точка)
                _cryptSettle(side, cardId) { cryptSettle(side, cardId); },
                // тест-хуки поправок: свечение выбранной карты (п2) и сетка
                // оверлея-просмотра (п3)
                selGlow() {
                    if (!root || !B || B.selected === null) return null;
                    const n = handNode(B.selected);
                    if (!n) return null;
                    const f = n.getChildByName("selframe");
                    if (!f) return null; // фолбэк-карта без свечения
                    return { visible: !!f.visible, blurred: !!(f.filters && f.filters.length),
                        behind: n.getChildIndex(f) === 0 };
                },
                overlayCards() {
                    if (!overlay || !overlay.grid) return null;
                    return overlay.grid.children
                        .filter((ch) => ch.scale && ch.scale.x === 0.75) // cardFace (не тексты ×N)
                        .map((ch) => ({ x: Math.round(ch.x), y: Math.round(ch.y) }));
                },
                // ховер-зум карт оверлея (тесты): анимация 0.75 ↔ 1
                ovZoomState: () => (ovZoom
                    ? { id: ovZoom.id, scale: Math.round(ovZoom.cur * 1000) / 1000, target: ovZoom.tgt }
                    : null),
                // узел карточки сетки оверлея (тесты: эмит pointerover/out)
                overlayCardNode: (i) => ovCards[i] || null,
                // геометрия полоски базы врага (тесты: не вылезает за плашку;
                // локальные границы = дизайн-координаты, без letterbox-масштаба)
                eBarGeom: () => {
                    if (!root || !root.hud) return null;
                    const b = root.hud.userData.eBar.getLocalBounds();
                    return { x: Math.round(b.x), w: Math.round(b.width) };
                },
                // бейдж «×N» на картах варева в руке + текст жизней базы героя
                // (тесты: счётчик разыгрываний, число у полоски базы)
                brewBadge: () => {
                    if (!root || !B) return null;
                    for (const node of root.cardsLayer.children) {
                        const b = node.getChildByName("brewBadge");
                        if (b) return { n: B.brewCasts || 0, visible: !!b.visible };
                    }
                    return null;
                },
                hudTexts: () => (root && root.hud
                    ? { pBase: root.hud.userData.pBaseT.text,
                        eBase: root.hud.userData.eBaseT.text,
                        pEnergy: root.hud.userData.pEnergyT.text,
                        pEnergyGain: root.hud.userData.pEnergyGainT.text,
                        pEnergyCost: root.hud.userData.pEnergyCostT.text,
                        pEnergyCostVisible: !!root.hud.userData.pEnergyCostT.visible,
                        pCards: root.hud.userData.pCardsT.text,
                        eEnergy: root.hud.userData.eEnergyT.text,
                        eCards: root.hud.userData.eCardsT.text }
                    : null),
                // узел карты руки (тесты: подсказка «−X» у энергии)
                handCardNode: (idx) => handNode(idx),
                // пересборка руки (тесты: свежие узлы после подмены B.hand)
                relayoutHand: () => { if (root) { layoutHand(); return true; } return false; },
                // перерисовка HUD (тесты: сбросы/счётчики после подмен B.*)
                refreshHud: () => { if (B && root) { refreshHud(); return true; } return false; },
                // геометрия/цвета HUD (тесты): иконки энергии, цвет карт врага
                hudGeom: () => {
                    if (!root || !root.hud) return null;
                    const hex = (v) => { const c = v && v.color !== undefined ? v.color : v;
                        try { return new PIXI.Color(c).toHex(); } catch (e) { return String(c); } };
                    const ud = root.hud.userData;
                    return { eEnergyX: ud.eEnergyIcon.x, pEnergyX: ud.pEnergyIcon.x,
                        eCardsFill: hex(ud.eCardsT.style.fill), pCardsFill: hex(ud.pCardsT.style.fill),
                        // сброс игрока у колоды + счётчики колод/сбросов (тесты)
                        discardX: ud.discardFace.x, discardY: ud.discardFace.y,
                        discardScaleX: Math.round(ud.discardFace.scale.x * 1000) / 1000,
                        deckX: ud.pDeckPile.x, deckY: ud.pDeckPile.y,
                        deckScaleX: Math.round(ud.pDeckPile.scale.x * 1000) / 1000,
                        cntSize: ud.discardCnt.style.fontSize,
                        pDeckCntSize: ud.pDeckCnt.style.fontSize,
                        eDeckCntSize: ud.eDeckCnt.style.fontSize,
                        eDiscardCntSize: ud.eDiscardCnt.style.fontSize };
                },
                // подсказка статуса у значка эффекта (тесты: key = метка:значение)
                effectTipState: () => (A.effectTip
                    ? { key: A.effectTip.key, x: Math.round(A.effectTip.node.x),
                        y: Math.round(A.effectTip.node.y) } : null),
                // общий z-order поля (тесты): сортировка включена, zIndex — ряды
                zOrder: () => (root && root.unitsLayer
                    ? { sortable: !!root.unitsLayer.sortableChildren,
                        z: root.unitsLayer.children.map((n) => n.zIndex),
                        dbg: root.unitsLayer.children.map((n) =>
                            ({ z: n.zIndex, dead: !!n.destroyed, x: Math.round(n.x), y: Math.round(n.y),
                               unit: B.units.findIndex((u) => u.node === n),
                               a: Math.round(n.alpha * 100) / 100, rot: Math.round(n.rotation * 100) / 100,
                               sc: Math.round(n.scale.x * 100) / 100 })) }
                    : null),
                punchesDump: () => ({ n: punches.length,
                    list: punches.map((p) => ({ dying: !!p.dying,
                        life: Math.round(p.life * 1000) / 1000, total: p.total,
                        dead: !!p.node.destroyed, inLayer: !!(p.node.parent && p.node.parent === root.unitsLayer) })) }),
                // процедурные эффекты (тесты): сколько живёт, какие события
                // звучали и сколько узлов реально висит в слое root.fx
                fxState: () => ({
                    enabled: !!fxEnabled,
                    count: fxList.length,
                    seq: fxSeq,
                    kinds: fxList.map((e) => e.kind),
                    xy: fxList.map((e) => [Math.round(e.x), Math.round(e.y)]),
                    parts: fxList.reduce((n, e) => n + e.parts.length, 0),
                    nodes: root && root.fx ? root.fx.children.length : 0,
                }),
                // тест-хук: точечный эффект в координатах дизайна
                _fx(kind, x = 960, y = 540, color = null) {
                    if (!root || !root.fx) return false;
                    return !!fxEvent(kind, { x, y, color: color || undefined });
                },
                _fxClear() { fxClear(); return true; },
                // лицо походки юнита на клетке (тесты: боковой шаг — walk_left/right)
                walkFace: (col, row) => {
                    const u = unitAt(col, row);
                    if (!u || !u.node) return null;
                    const body = u.node.getChildByName("body");
                    return body ? (body.userData_face || null) : null;
                },
                // тест-хук: урон цели с указанным «убийцей» — через damageUnit,
                // с хуками боя (очарование «Огненного дыхания» и пр.)
                _dmg(col, row, amount, killerCol, killerRow) {
                    const u = unitAt(col, row);
                    if (!u) return false;
                    const killer = (killerCol !== undefined && killerCol !== null) ? unitAt(killerCol, killerRow) : null;
                    damageUnit(u, amount, killer, "sword");
                    return true;
                },
                // тест-хук: убить юнита с указанным «убийцей» (для проверки ловушки)
                _kill(col, row, killerCol, killerRow) {
                    const u = unitAt(col, row);
                    if (!u) return false;
                    const killer = (killerCol !== undefined && killerCol !== null) ? unitAt(killerCol, killerRow) : null;
                    killUnit(u, killer || null);
                    return true;
                },
                // тест-хук: принудительный итог (бои с растущей шкалой длинные —
                // смоук проверяет механики, а не ждёт органического финиша)
                _finish(victory) {
                    if (!B || B.phase === "over" || B.discarding) return false;
                    if (victory) B.enemyBase = 0; else B.playerBase = 0;
                    finish(!!victory);
                    return true;
                },
                // тест-хук: разместить юнита любой стороны (героя не будит)
                _spawn(side, cardId, col, row) {
                    if (unitAt(col, row)) return false;
                    return addUnit(side, cardId, col, row, { testSummon: true });
                },
                // тест-хук: взвести ловушку стороны (как розыгрыш карты ловушки)
                _trap(side, cardId, col, row) { return armTrap(side, cardId, col, row); },
                // тест-хук: урон базе стороны (проба «Неусыпного гарнизона»
                // hon194 — триггер «ваша база получает урон» живёт в damageBase)
                _damageBase(side, amount) { damageBase(side, amount); return true; },
                // тест-хук: upkeep стороны (начало её хода: грибницы, костры)
                _upkeep(side) { upkeep(side); return true; },
                // тест-хуки «Торговца» (hon183): панель сброса по выбору
                _openTradePanel() { buildDiscardPanel("trade"); return true; },
                _pickDiscard(idx) { pickDiscard(idx); return true; },
                // тест-хуки боевых хуков атаки: марш одной стороны и тик яда
                // (проба сокрушения/чащи/ядовитости без полного хода ИИ)
                async _march(side) { await marchSide(side); return true; },
                _poisonTick(side) { poisonTick(side); return true; },
                // тест-хук: единый сброс-хук (проба «Сброса разума» decMind)
                _noteDiscard(n, side, ids) { noteDiscard(n, side, ids); return true; },
                // тест-хуки волны «Тлен 144–146»: текущая сцена поля и лист
                // существ по стихии карты (фолбэк sheetOf)
                _scene() { return { curScene }; },
                // тест-хук: всплывающие надписи (проба времени жизни/затухания)
                _fxFloats() {
                    return floats.map((f) => ({
                        a: Math.round(f.node.alpha * 100) / 100,
                        life: Math.round(f.life * 100) / 100,
                        total: Math.round(f.total * 100) / 100,
                    }));
                },
                _sheetName(id) {
                    const def = CARDS[id];
                    if (!def) return null;
                    const sh = sheetOf({ def });
                    if (!sh || !ctx.creatureSheets) return null;
                    return Object.keys(ctx.creatureSheets)
                        .find((k) => ctx.creatureSheets[k] === sh) || null;
                },
                // установка ловушки стороной (проба опутывания без розыгрыша
                // карты); существо на клетке — «нахождение», как у клика игрока
                _armTrap(side, cardId, col, row) {
                    armTrap(side, cardId, col, row);
                    const u = unitAt(col, row);
                    if (u) triggerCellTraps(u);
                    return true;
                },
                // итоговая цена карты (проба скидок: Вождь, шатун, древоброд)
                _effCost(cardId, side = "p", target = null) {
                    return effCost(cardId, side, target);
                },
                // трата флага «Архилича» (проба скидки первой эпик-карты)
                _consumeEpic(cardId, side = "p") {
                    consumeEpicDiscount(cardId, side);
                },
                // план добора ИИ по шкале (тесты мягкого правила): сколько карт
                // возьмёт и какой доход всего
                aiDrawPlan: () => (B
                    ? { cards: enemyDrawPlan(), total: spheresTotal(),
                        nextMana: B.eEnergy + spheresTotal() }
                    : null),
                // гейты ИИ по заклинанию (тесты): id карты → playable
                aiSpellPlayable: (id) => !!CARDS[id] && aiSpellPlayable(CARDS[id]),
                // тест-хук: применить эффект заклинания стороны врага напрямую
                _aiSpell(id, fromHand = false) {
                    if (!B || !CARDS[id] || CARDS[id].type !== "spell") return false;
                    enemyCastSpellEffect(CARDS[id], true, null, !!fromHand);
                    refreshHud();
                    checkEnd();
                    return true;
                },
                // группы приоритета ИИ (тесты связок): id карты → группа
                _aiGroup: (id) => (B && CARDS[id] ? aiGroup(id, CARDS[id]) : null),
                // ── тест-хуки «умного ИИ» (волна 2026-10-21) ────────────────
                // клетка призыва/постройки и её оценка
                _aiUnitSpot: (id) => (B && CARDS[id] ? aiUnitSpot(CARDS[id]) : null),
                _aiBuildingSpot: (id) => (B && CARDS[id] ? aiBuildingSpot(CARDS[id]) : null),
                _aiSpotScore: (id, col, row) => (B && CARDS[id]
                    ? aiSpotScore(CARDS[id], col, row) : null),
                _aiBuildingScore: (id, col, row) => (B && CARDS[id]
                    ? aiBuildingSpotScore(CARDS[id], col, row,
                        freeCells(deployRows("e"))) : null),
                // выбор цели урона/усиления/стрелка/круговой/ловушки
                _aiDmgPick: (id, free = false) => {
                    if (!B || !CARDS[id] || !CARDS[id].spell) return null;
                    const u = aiDmgTargetPick(CARDS[id], aiDmgTargets(CARDS[id]), !!free);
                    return u ? { col: u.col, row: u.row, id: cardIdOf(u.def) } : null;
                },
                _aiBuffPick: (id) => {
                    if (!B || !CARDS[id] || !CARDS[id].spell) return null;
                    const u = aiBuffPick(CARDS[id]);
                    return u ? { col: u.col, row: u.row, id: cardIdOf(u.def) } : null;
                },
                _aiWolfPick: () => {
                    const u = B ? aiWolfPick() : null;
                    return u ? { col: u.col, row: u.row, id: cardIdOf(u.def) } : null;
                },
                _aiNovaPick: () => {
                    const u = B ? aiNovaPick() : null;
                    return u ? { col: u.col, row: u.row, id: cardIdOf(u.def) } : null;
                },
                _aiTrapSpot: (id) => (B && CARDS[id] ? aiTrapSpot(CARDS[id]) : null),
                // «Гидроудар» (тесты): сдвиг цели к её базе напрямую
                _hydro(col, row) {
                    const u = unitAt(col, row);
                    return u ? pushTowardBase(u) : false;
                },
                // поиск/гадание/путешествие: какую карту выбрал ИИ
                _aiSearchSpell: (n) => {
                    const k = B ? aiSearchSpell(n) : null;
                    return k ? { id: k.id, j: k.j } : null;
                },
                _aiSearchUnit: (n) => {
                    const k = B ? aiSearchUnit(n) : null;
                    return k ? { id: k.id, j: k.j } : null;
                },
                _aiSummonPick: (n) => {
                    const k = B ? aiSummonPick(n) : null;
                    return k ? { id: k.id, j: k.j } : null;
                },
            };
        }
    };
})();
