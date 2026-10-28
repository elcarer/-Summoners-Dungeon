// СЦЕНА «АРЕНА»: рука: карты, перетаскивание, шкала, сброс.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installHand = function installHand(A) {
        with (A) {
            // ── Карта-подсказка на существо/строение (наведение на поле) ───────
            // Просили юзер: наведение на жетон (свой или врага) показывает ЕГО
            // КАРТУ — вся информация о существе на лицевой стороне. Жетоны не
            // ловят клики, поэтому курсор отслеживает зона поля (pointermove);
            // карта показывается на свободном месте слева от поля.
            A.unitCard = null; // { unit, node }
            A.unitCardHide = function unitCardHide() {
                if (!unitCard) return;
                unitCard.node.destroy({ children: true });
                unitCard = null;
            };
            // Подсказка СВОЕЙ ловушки (просил юзер): наведение на «?» показывает
            // карту, которая её поставила, — игрок видит, где какая ловушка.
            // Вражеские ловушки не раскрываем (они и задуманы загадкой).
            A.trapCard = null; // { trap, id, node }
            A.trapCardHide = function trapCardHide() {
                if (!trapCard) return;
                trapCard.node.destroy({ children: true });
                trapCard = null;
            };
            // ── Подсказка «что за эффект» при наведении на значок ──────────
            // (просил юзер): у существ на поле есть метки статусов (яд, лёд,
            // берсерк, …) — наведение курсора на метку показывает её название
            // и описание. Позиции меток — локальные координаты узла существа
            // (узел стоит в cellXY клетки), берём ближайшую в радиусе 17px.
            A.EFFECT_MARKS = {
                frozenMark: { name: "status.frozen.name", desc: "status.frozen.desc", val: (u) => u.frozen },
                wardMark: { name: "spell.ward.name", desc: "spell.ward.desc", val: () => 0 },
                sporeMark: { name: "status.spores.name", desc: "status.spores.desc", val: () => 0 },
                enchMark: { name: "status.enchantFire.name", desc: "status.enchantFire.desc", val: () => 0 },
                protectMark: { name: "status.protect.name", desc: "status.protect.desc", val: (u) => A.unitProtectTotal(u) },
                berserkMark: { name: "status.berserk.name", desc: "status.berserk.desc", val: (u) => u.berserk },
                confuseMark: { name: "status.confuse.name", desc: "status.confuse.desc", val: (u) => u.confused },
                venomMark: { name: "status.venom.name", desc: "status.venom.desc", val: (u) => u.venom },
                poisonMark: { name: "status.poison.name", desc: "status.poison.desc", val: (u) => u.poison },
                entangleMark: { name: "status.entangle.name", desc: "status.entangle.desc", val: (u) => u.entangle },
            };
            A.effectTip = null; // { key, node }
            A.effectTipHide = function effectTipHide() {
                if (!effectTip) return;
                effectTip.node.destroy({ children: true });
                effectTip = null;
            };
            // Панель подсказки: тёмная плашка, название + описание; рисуется
            // у метки (над существом), не вылезая за края экрана
            A.showEffectTip = function showEffectTip(u, markName, mx, my) {
                const mk = EFFECT_MARKS[markName];
                const val = mk.val(u) || 0;
                const key = `${markName}:${val}`;
                if (effectTip && effectTip.key === key) return;
                effectTipHide();
                const name = GAME_LOC.t(mk.name) + (val > 1 ? ` ${val}` : "");
                const desc = GAME_LOC.t(mk.desc);
                const nt = T(name, 24, 0xf0c96a, { stroke: { color: 0x1c1207, width: 4 } });
                const dt = T(desc, 19, 0xf3e6c2,
                    { wordWrap: true, wordWrapWidth: 372, breakWords: true, lineHeight: 24 });
                dt.y = 36;
                const w = Math.max(nt.width, Math.min(382, dt.width)) + 30;
                const h = dt.height + 58;
                const node = new PIXI.Container();
                const bg = new PIXI.Graphics();
                bg.roundRect(0, 0, w, h, 12);
                bg.fill({ color: 0x171310, alpha: 0.94 });
                bg.stroke({ width: 3, color: 0x6b5c40 });
                node.addChild(bg, nt, dt);
                nt.x = dt.x = 15;
                node.x = Math.max(240, Math.min(1680 - w, mx - w / 2));
                node.y = Math.max(88, my - h - 26);
                node.eventMode = "none";
                root.addChild(node);
                effectTip = { key, node };
            };
            // Курсор над меткой эффекта существа u? Показывает подсказку и
            // возвращает true (карта существа при этом не дублируется)
            A.markTipAt = function markTipAt(u, x, y) {
                if (!u || !u.node) return false;
                let best = null, bestD = 17 * 17;
                for (const markName of Object.keys(EFFECT_MARKS)) {
                    const node = u.node.getChildByName(markName);
                    if (!node) continue;
                    const dx = x - (u.node.x + node.x), dy = y - (u.node.y + node.y);
                    const d = dx * dx + dy * dy;
                    if (d <= bestD) { bestD = d; best = markName; }
                }
                if (!best) return false;
                showEffectTip(u, best, x, y);
                return true;
            };
            A.hoverHideAll = function hoverHideAll() {
                unitCardHide();
                trapCardHide();
                effectTipHide();
            };
            // Позиция «?» записана redrawTraps (__mx/__my); радиус чуть больше
            // самого значка — попасть курсором легко.
            A.playerTrapAtPoint = function playerTrapAtPoint(x, y) {
                if (!B || !B.traps) return null;
                let best = null, bestD = 29 * 29;
                for (const tr of B.traps.p) {
                    if (!tr.def || !tr.def.trap) continue;
                    let px = tr.__mx, py = tr.__my;
                    if (px === undefined || py === undefined) { // страховка до отрисовки
                        if (tr.unit) {
                            if (!B.units.includes(tr.unit)) continue;
                            const p = cellXY(tr.unit.col, tr.unit.row);
                            px = p.x; py = p.y - 44;
                        } else {
                            const p = cellXY(tr.col, tr.row);
                            px = p.x; py = p.y;
                        }
                    }
                    const d = (x - px) * (x - px) + (y - py) * (y - py);
                    if (d <= bestD) { bestD = d; best = tr; }
                }
                return best;
            };
            A.showTrapCard = function showTrapCard(tr) {
                if (trapCard && trapCard.trap === tr) return;
                unitCardHide();
                trapCardHide();
                const id = cardIdOf(tr.def);
                if (!id) return;
                const node = globalThis.GAME_UI.cardFace(ctx, id, { scale: 0.75 });
                node.eventMode = "none";
                node.position.set(430, 420);
                root.addChild(node);
                trapCard = { trap: tr, id, node };
            };
            A.unitHoverAt = function unitHoverAt(x, y) {
                if (!root || !B) return;
                const tr = playerTrapAtPoint(x, y);
                if (tr) { showTrapCard(tr); effectTipHide(); return; }
                trapCardHide();
                // курсор на значке эффекта — подсказка вместо карты существа.
                // Метки висят над головой существа и часто НАД соседней
                // клеткой, поэтому ищем по всем существам, а не по клетке
                for (const u of B.units) if (markTipAt(u, x, y)) { unitCardHide(); return; }
                effectTipHide();
                const hit = cellAt(x, y);
                const u = hit ? unitAt(hit[0], hit[1]) : null;
                if (!u) { unitCardHide(); return; }
                if (unitCard && unitCard.unit === u) return;
                unitCardHide();
                const node = globalThis.GAME_UI.cardFace(ctx, cardIdOf(u.def), { scale: 0.75 });
                node.eventMode = "none";
                node.position.set(430, 420); // свободная полоса между героем и полем
                root.addChild(node);
                unitCard = { unit: u, node };
            };

            // ── Карты в руке ────────────────────────────────────────────────────
            // Лицо — картинка карты 230×338 в масштабе 1, нижний
            // край уходит за экран: верх карты ниже поля (поле кончается на y=775) —
            // клетки боя не закрываются. Выбор/наведение — лёгкое увеличение и
            // золотая рамка, БЕЗ подъёма вверх. Неразыгрываемая (не хватает энергии)
            // карта — затемнённая тинтом. Пока выбрана карта — все карты руки
            // неинтерактивны: клики уходят в поле; снять выбор — Esc, клик по фону
            // или мимо подсвеченных клеток.
            A.HAND_Y = 1131;
            A.HAND_SCALE = 1; // картинка 230×338 в масштабе 1
            A.cardBottom = function cardBottom(def) { // подпись нижней плашки (фолбэк без картинки)
                if (def.type === "unit") return { text: `${def.atk}⚔ ${def.hp}♥ ${def.speed}→`, small: false };
                const key = `card.${Object.keys(CARDS).find((k) => CARDS[k] === def)}.desc`;
                return { text: GAME_LOC.t(key), small: true };
            };
            A.makeCardNode = function makeCardNode(card, idx) {
                const def = CARDS[card];
                const c = new PIXI.Container();
                c.__handIdx = idx; // индекс в руке: слой может переставляться ховером
                if (def.img) {
                    const face = new PIXI.Sprite(uiTex(`cards/${def.img}.png`));
                    face.anchor.set(0.5, 1); // оригинальный размер спрайта
                    face.tint = effCost(card) > B.energy ? 0x9f9f9f : 0xffffff;
                    c.addChild(face);
                    // мягкое свечение выбора/наведения (просил юзер: жёсткая
                    // обводка висела слишком далеко от края спрайта) — золотая
                    // заливка РОВНО по границе карты, размытая блюром, ПОД
                    // спрайтом: виден только мягкий ореол вокруг краёв
                    const frame = new PIXI.Graphics();
                    frame.roundRect(-115, -338, 230, 338, 16);
                    frame.fill({ color: 0xf0c96a, alpha: 0.85 });
                    const blur = new PIXI.BlurFilter({ strength: 9, quality: 3 });
                    blur.padding = 18; // ореол не резать по границе фильтра
                    frame.filters = [blur];
                    frame.visible = false;
                    frame.name = "selframe";
                    frame.eventMode = "none";
                    c.addChildAt(frame, 0);
                } else { // фолбэк без картинки: рубашка + подписи
                    const face = new PIXI.Sprite(uiTex("card_back_small.png"));
                    face.anchor.set(0.5, 1);
                    face.tint = def.type === "unit" ? 0xffffff : (def.color || 0xffffff);
                    if (effCost(card) > B.energy) face.tint = (face.tint & 0x9f9f9f) >>> 0;
                    c.addChild(face);
                    const plate = new PIXI.Graphics();
                    plate.roundRect(-66, def.type === "unit" ? -198 : -225, 132, def.type === "unit" ? 66 : 93, 9);
                    plate.fill({ color: 0x120d09, alpha: 0.66 });
                    c.addChild(plate);
                    const name = T(GAME_LOC.t(`card.${card}.name`), 19, 0xf3e6c2);
                    name.anchor.set(0.5, 0);
                    name.position.set(0, -192);
                    globalThis.GAME_UI.fit(name, 126, 15);
                    c.addChild(name);
                    const bottom = cardBottom(def);
                    const stats = T(bottom.text, bottom.small ? 16 : 21, 0xd8c79d,
                        bottom.small ? { wordWrap: true, wordWrapWidth: 126, breakWords: true, align: "center" } : {});
                    stats.anchor.set(0.5, 1);
                    stats.position.set(0, -138);
                    if (!bottom.small) globalThis.GAME_UI.fit(stats, 126, 15);
                    c.addChild(stats);
                    const tag = T(GAME_LOC.t(`type.${def.type}.short`), 15, 0xcfc4a6);
                    tag.anchor.set(0, 1);
                    tag.position.set(-60, -51);
                    c.addChild(tag);
                    const cost = new PIXI.Graphics();
                    cost.circle(51, -204, 19.5);
                    cost.fill(0x2f6fb0);
                    cost.stroke({ width: 3, color: 0xbfe0ff });
                    c.addChild(cost);
                    const costT = T(String(def.cost), 22, 0xffffff);
                    costT.anchor.set(0.5);
                    costT.position.set(51, -204);
                    c.addChild(costT);
                }
                // «Колдовское варево»: бейдж с числом уже разыгранных в бою
                // копий — урон карты растёт с каждым кастом (просил юзер)
                if (def.spell && def.spell.brew) {
                    const badge = new PIXI.Container();
                    const disc = new PIXI.Graphics();
                    disc.circle(0, 0, 17);
                    disc.fill({ color: 0x1c1207, alpha: 0.88 });
                    disc.stroke({ width: 2.5, color: 0xf0c96a });
                    badge.addChild(disc);
                    const bt = T(`×${B.brewCasts || 0}`, 19, 0xffe9b0, { stroke: { color: 0x1c1207, width: 3 } });
                    bt.anchor.set(0.5);
                    bt.name = "bt";
                    badge.addChild(bt);
                    badge.position.set(84, -316);
                    badge.visible = (B.brewCasts || 0) > 0;
                    badge.eventMode = "none";
                    badge.name = "brewBadge";
                    c.addChild(badge);
                }
                // «Сожжение» (Варка зелий): карта после розыгрыша удалится из
                // боя — пламя-метка в левом верхнем углу лица
                if (B.scorch.p.has(card)) {
                    const fl = T("🔥", 26, 0xffffff, { stroke: { color: 0x1c1207, width: 4 } });
                    fl.anchor.set(0.5);
                    fl.position.set(-84, -316);
                    fl.eventMode = "none";
                    fl.name = "scorchMark";
                    c.addChild(fl);
                }
                c.eventMode = B.selected === null ? "static" : "none";
                c.on("pointertap", () => onCardTap(idx));
                // альтернативный режим призыва (Настройки): наведение увеличивает
                // карту, перетаскивание на клетку поля — призыв
                c.on("pointerover", () => { hoverIdx = idx; updateEnergyHint(); hoverCard(idx, true); });
                c.on("pointerout", () => {
                    if (hoverIdx === idx) { hoverIdx = null; updateEnergyHint(); }
                    hoverCard(idx, false);
                });
                c.on("pointerdown", (e) => startCardDrag(idx, e));
                c.on("globalpointermove", (e) => moveCardDrag(e));
                return c;
            };

            // Узел карты по индексу В РУКЕ. hoverCard поднимает наведённую карту
            // наверх слоя, поэтому порядок cardsLayer.children перестаёт
            // совпадать с порядком руки: брать детей «по индексу» нельзя —
            // иначе перетаскивается соседняя карта (баг юзера). Метку __handIdx
            // ставит makeCardNode, порядок детей для неё не важен.
            A.handNode = function handNode(idx) {
                if (!root) return null;
                return root.cardsLayer.children.find((n) => n.__handIdx === idx)
                    || root.cardsLayer.children[idx] || null;
            };

            A.layoutHand = function layoutHand() {
                for (const n of root.cardsLayer.children) n.destroy({ children: true });
                root.cardsLayer.removeChildren();
                hoverIdx = null; // карта под курсором уничтожена — подсказку погасить
                raisedCard = null; // узлы руки пересобраны — выдвинутой карты нет
                updateEnergyHint();
                const n = B.hand.length;
                B.hand.forEach((card, idx) => {
                    const node = makeCardNode(card, idx);
                    // у малых рук разлёт как был (225); у больших — веер с
                    // нахлёстом: крайние карты не залезают под «Конец хода»
                    // и угловые колоды (просил юзер)
                    const spread = Math.min(225, n > 1 ? 790 / (n - 1) : 225);
                    node.x = 960 + (idx - (n - 1) / 2) * spread;
                    node.y = HAND_Y;
                    node.rotation = (idx - (n - 1) / 2) * 0.035;
                    const sel = B.selected === idx;
                    node.scale.set((sel ? 1.12 : 1) * HAND_SCALE);
                    const f = node.getChildByName("selframe");
                    if (f) f.visible = sel;
                    root.cardsLayer.addChild(node);
                });
            };
            // Центр карты руки по индексу (просил юзер): здесь рождается
            // эффект заклинания без позиции цели. Узел карты якорен НИЗОМ
            // (anchor 0.5,1, высота 338) — центр выше HAND_Y на полкарты;
            // выбранная карта чуть крупнее (×1.12)
            A.handCardCenter = function handCardCenter(idx) {
                const n = B.hand.length;
                const spread = Math.min(225, n > 1 ? 790 / (n - 1) : 225);
                const s = (B.selected === idx ? 1.12 : 1) * HAND_SCALE;
                return { x: 960 + (idx - (n - 1) / 2) * spread, y: HAND_Y - 169 * s };
            };
            // бейджи «×N» на картах варева в руке: N = разыгранные в этом бою
            // (растёт и от кастов врага). Рука не пересобирается посреди хода —
            // обновляем тексты точечно
            A.refreshBrewBadges = function refreshBrewBadges() {
                if (!root || !B) return;
                for (const node of root.cardsLayer.children) {
                    const b = node.getChildByName("brewBadge");
                    if (!b) continue;
                    b.visible = (B.brewCasts || 0) > 0;
                    const bt = b.getChildByName("bt");
                    if (bt) bt.text = `×${B.brewCasts || 0}`;
                }
            };

            // ── Перетаскивание карт (режим «Перетаскивание» в Настройках) ────────
            // Наведение увеличивает карту; перетаскивание рисует кривую от её
            // слота в руке до центра клетки, отпускание — призыв. Спеллы и ловушки
            // ставятся кликом как раньше.
            A.drag = null;
            A.dragFx = null; // drag: {idx,node,homeX,homeY,sx,sy,moved,over}
            // Глобальные экранные → координаты 1920×1080: мировая трансформация
            // ui-корня (letterbox) — полная цепочка от экрана.
            A.toDesign = (g) => {
                const wt = ctx.ui.worldTransform;
                return { x: (g.x - wt.tx) / wt.a, y: (g.y - wt.ty) / wt.d };
            };

            A.cellAt = function cellAt(x, y) {
                const g = SCENE_GRID[curScene] || SCENE_GRID[1];
                for (let r = 0; r < GRID; r++) if (y >= g.rows[r] && y < g.rows[r + 1])
                    for (let c2 = 0; c2 < GRID; c2++) if (x >= g.cols[c2] && x < g.cols[c2 + 1]) return [c2, r];
                return null;
            };
            A.canDropAt = function canDropAt(handIdx, col, row) {
                const def = CARDS[B.hand[handIdx]];
                return !!def && (def.type === "unit" || def.type === "building")
                    && effCost(B.hand[handIdx]) <= B.energy
                    && deployRows("p").includes(row) && !unitAt(col, row);
            };
            // Подсказка «−X» у шкалы энергии (просил юзер): курсор на карте
            // руки — рядом с текущей энергией видно, сколько уйдёт на розыгрыш.
            // Живёт на hud, поэтому переживает пересборку руки; краснеет,
            // когда энергии не хватает.
            A.hoverIdx = null;
            A.updateEnergyHint = function updateEnergyHint() {
                if (!root || !root.hud) return;
                const ht = root.hud.userData.pEnergyCostT;
                const id = hoverIdx !== null && B && B.phase === "player" && !overlay
                    ? B.hand[hoverIdx] : null;
                if (hoverIdx !== null && !handNode(hoverIdx)) hoverIdx = null;
                if (!id || !CARDS[id]) { ht.visible = false; return; }
                const c = effCost(id);
                ht.text = "-" + c;
                ht.style.fill = c > B.energy ? 0xff7c6a : 0xffd98c;
                ht.visible = true;
            };

            // увеличенная наведением карта руки выдвигается поверх соседних
            // (просил юзер), с уходом курсора возвращается в свой слот —
            // порядок детей cardsLayer всегда совпадает с порядком руки
            A.raisedCard = null;
            A.lowerRaisedCard = function lowerRaisedCard() {
                if (!raisedCard) return;
                const n = raisedCard;
                raisedCard = null;
                if (root && !n.destroyed && n.__homeIdx !== undefined
                    && n.parent === root.cardsLayer) {
                    root.cardsLayer.addChildAt(n,
                        Math.min(n.__homeIdx, root.cardsLayer.children.length - 1));
                    n.scale.set(n.__homeScale);
                    n.y = HAND_Y;
                }
            };
            A.hoverCard = function hoverCard(idx, on) {
                if (!G.settings.dragSummon || drag || B.phase !== "player" || overlay || B.discarding || B.picking) {
                    lowerRaisedCard(); // фаза/режим сменились — слот вернуть сразу
                    return;
                }
                if (!on) lowerRaisedCard();
                const node = handNode(idx);
                if (!node) return;
                const raised = on || B.selected === idx;
                if (on && !raisedCard) {
                    raisedCard = node;
                    node.__homeIdx = root.cardsLayer.getChildIndex(node);
                    node.__homeScale = node.scale.x;
                    root.cardsLayer.addChild(node); // поверх соседних карт веера
                }
                node.scale.set((raised ? 1.12 : 1) * HAND_SCALE);
                // приподнять карту ещё на 40px — текст на ней виден целиком
                // (просил юзер); выбранная карта держится приподнятой тоже
                node.y = HAND_Y - (raised ? 40 : 0);
                const f = node.getChildByName("selframe");
                if (f) f.visible = raised;
            };
            A.startCardDrag = function startCardDrag(idx, e) {
                if (!G.settings.dragSummon || B.phase !== "player" || overlay || B.discarding || B.picking) return;
                const def = CARDS[B.hand[idx]];
                if (!def || (def.type !== "unit" && def.type !== "building")) return;
                const node = handNode(idx);
                if (!node) return;
                const p = toDesign(e.global);
                drag = { idx, node, homeX: node.x, homeY: node.y, sx: p.x, sy: p.y, moved: false, over: null };
                window.addEventListener("pointerup", endCardDrag);
            };
            A.moveCardDrag = function moveCardDrag(e) {
                if (!drag || !B || B.phase !== "player" || B.stopped || overlay || B.picking) return;
                const p = toDesign(e.global);
                if (!drag.moved) {
                    if (Math.hypot(p.x - drag.sx, p.y - drag.sy) < 12) return; // это клик
                    drag.moved = true;
                    root.cardsLayer.addChild(drag.node); // карта поверх остальных
                    B.selected = drag.idx; // подсветить зону призыва
                    B.spellTarget = false;
                    redrawHighlight();
                }
                drag.node.x = p.x;
                drag.node.y = Math.min(p.y, 1035);
                drag.node.scale.set(1.12); // перетаскиваемая карта — полноразмерная
                drag.over = cellAt(p.x, p.y);
                drawDragFx();
            };
            A.drawDragFx = function drawDragFx() {
                // после exit() сцены dragFx мог остаться ссылкой на уничтоженный
                // Graphics (в Pixi v8 у него внутрь null) — проверяем живость
                if (!dragFx || dragFx.destroyed) {
                    dragFx = new PIXI.Graphics();
                    dragFx.eventMode = "none";
                    if (root) root.addChild(dragFx); // поверх HUD (добавляется последним)
                }
                dragFx.clear();
                if (!drag || !drag.moved || !drag.over) return;
                const [c2, r2] = drag.over;
                const target = cellXY(c2, r2);
                const ok = canDropAt(drag.idx, c2, r2);
                // кривая от домашнего слота карты к центру клетки (дуга набок)
                const dx = target.x - drag.homeX, dy = target.y - drag.homeY;
                const len = Math.hypot(dx, dy) || 1;
                const bow = Math.min(210, len * 0.3);
                dragFx.moveTo(drag.homeX, drag.homeY - 75);
                dragFx.quadraticCurveTo(drag.homeX + dx / 2 - dy / len * bow, drag.homeY + dy / 2 + dx / len * bow, target.x, target.y);
                dragFx.stroke({ width: 4.5, color: ok ? 0xa8e890 : 0xef9f8c, alpha: 0.9 });
                dragFx.circle(drag.homeX, drag.homeY - 75, 7.5);
                dragFx.fill({ color: ok ? 0xa8e890 : 0xef9f8c });
                const rc = cellRect(c2, r2);
                dragFx.rect(rc.x + 3, rc.y + 3, rc.w - 6, rc.h - 6);
                dragFx.fill({ color: ok ? 0x7dc95e : 0xd05a3c, alpha: 0.4 });
            };
            A.endCardDrag = function endCardDrag(ev) {
                window.removeEventListener("pointerup", endCardDrag);
                if (!drag) return;
                const d = drag;
                drag = null;
                if (dragFx && !dragFx.destroyed) dragFx.clear();
                if (!d.moved) { layoutHand(); return; } // короткий клик — выбор уже сыграл pointertap
                let over = d.over;
                if (ev && ev.clientX !== undefined) { // отпустили за пределами канваса — отмена
                    const r = ctx.app.canvas.getBoundingClientRect();
                    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) over = null;
                }
                if (over && canDropAt(d.idx, over[0], over[1])) {
                    B.selected = d.idx;
                    B.spellTarget = false;
                    onCellTap(over[0], over[1]);
                    if (ctx.sfx) ctx.sfx();
                } else {
                    B.selected = null;
                    B.spellTarget = false;
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                }
            };

            // ── Шкала конца хода: «+карты ↔ +энергия» ──────────────────────────
            // Постоянный ползунок в HUD (под кнопкой «Конец»). Положение можно
            // менять в любой момент хода (тап/перетаскивание по треку); выбранное
            // сохраняется между ходами. По кнопке «Конец» шкала применяется
            // автоматически: слева — добор карт, справа — энергия на след. ход.
            // Бегунок следует за курсором плавно (без рывков по засечкам), а
            // после отпускания сам доскакивает к ближайшей засечке (просил юзер).
            A.SLIDER_W = 360;
            A.SLIDER_X = 1663;
            A.SLIDER_Y = 626;
            A.SLIDER_GLIDE_MS = 150; // доскок к засечке после отпускания
            A.sliderHeld = false;
            A.sliderVis = null; // плавная доля бегунка 0..1 при перетаскивании
            A.sliderGlide = null; // доскок { from, to, t0 }
            A.refreshSlider = function refreshSlider() {
                if (!root || !B) return;
                const sl = root.hud.userData.slider;
                const total = spheresTotal();
                B.split = Math.max(0, Math.min(total, B.split));
                // добавки шкалы — на иконках энергии и карт игрока
                root.hud.userData.pEnergyGainT.text = `+${total - B.split}`;
                root.hud.userData.pCardsT.text = `${B.hand.length}+${B.split}`;
                const on = B.phase === "player" && !B.discarding && !B.picking;
                sl.track.eventMode = on ? "static" : "none";
                sl.thumb.eventMode = on ? "static" : "none";
                sl.wrap.alpha = on ? 1 : 0.45;
                // drag — за курсором, отпускание — плавный доскок к засечке
                let frac;
                if (sliderVis !== null) frac = sliderVis;
                else if (sliderGlide) {
                    const k = Math.min(1, (performance.now() - sliderGlide.t0) / SLIDER_GLIDE_MS);
                    frac = sliderGlide.from + (sliderGlide.to - sliderGlide.from) * (1 - Math.pow(1 - k, 3));
                } else frac = B.split / total;
                const g = sl.track;
                g.clear();
                const w = SLIDER_W, h = 21, x0 = -w / 2;
                g.roundRect(x0, -h / 2, w, h, 10.5);
                g.fill(0x1c1712);
                g.roundRect(x0 + 4.5, -h / 2 + 4.5, Math.max(0, frac * (w - 9)), h - 9, 6);
                g.fill(0x3a5f8a); // доля «в карты»
                // засечки — шаги шкалы: каждая меняет делёж «энергия ↔ карты»
                // (просил юзер); поверх заливок, внутри трека
                for (let k = 1; k < total; k++) {
                    g.rect(x0 + (k / total) * w - 1.5, -h / 2 + 6, 3, h - 12);
                }
                g.fill(0x8a7c5e);
                g.roundRect(x0, -h / 2, w, h, 10.5);
                g.stroke({ width: 3, color: 0x6b5c40 });
                sl.thumb.position.set(x0 + frac * w, 0); // сфера button_1
            };
            A.sliderApply = function sliderApply(e) {
                // Pixi-событие несёт .global; DOM-событие window (pointermove
                // при перетаскивании) — только clientX/clientY
                const p = toDesign(e.global ? e.global : { x: e.clientX, y: e.clientY });
                const total = spheresTotal();
                let fv = (p.x - SLIDER_X + SLIDER_W / 2) / SLIDER_W;
                fv = Math.max(0, Math.min(1, fv));
                sliderGlide = null; // новый жест отменяет доскок
                sliderVis = fv; // бегунок — на плавной доле, без рывков
                const v = Math.round(fv * total); // засечка — ближайшая
                if (v !== B.split) {
                    B.split = v;
                    if (ctx.sfx) ctx.sfx();
                }
                refreshSlider();
            };
            A.sliderGrab = function sliderGrab(e) {
                if (!B || B.phase !== "player" || B.discarding || B.picking) return;
                sliderHeld = true;
                sliderApply(e);
                window.addEventListener("pointermove", sliderMove);
                window.addEventListener("pointerup", sliderUp);
            };
            A.sliderMove = function sliderMove(e) { if (sliderHeld && B && !B.stopped) sliderApply(e); };
            A.sliderUp = function sliderUp() {
                sliderHeld = false;
                window.removeEventListener("pointermove", sliderMove);
                window.removeEventListener("pointerup", sliderUp);
                const total = spheresTotal();
                if (sliderVis !== null && Math.abs(sliderVis - B.split / total) > 0.001) {
                    sliderGlide = { from: sliderVis, to: B.split / total, t0: performance.now() };
                }
                sliderVis = null;
                refreshSlider();
            };

            // ── Панель сброса лишних карт (конец хода при руке > 7) ─────────────
            // Лимит руки проверяется только здесь: игрок кликами сбрасывает
            // карты по своему выбору, пока в руке не останется 7 — тогда ход
            // переходит врагу.
            A.discardPanel = null;
            A.closeDiscardPanel = function closeDiscardPanel() {
                if (!discardPanel) return;
                discardPanel.destroy({ children: true });
                discardPanel = null;
                if (B) B.discarding = false;
            };
            A.buildDiscardPanel = function buildDiscardPanel() {
                closeDiscardPanel();
                B.discarding = true;
                const node = new PIXI.Container();
                node.eventMode = "static";
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                dim.eventMode = "static";
                node.addChild(dim);
                const frame = new PIXI.Graphics();
                frame.roundRect(225, 240, 1470, 525, 18);
                frame.fill({ color: 0x171310, alpha: 0.96 });
                frame.stroke({ width: 3, color: 0x6b5c40 });
                node.addChild(frame);
                const title = T(t("discard.title"), 39, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 273);
                title.eventMode = "none";
                node.addChild(title);
                const hint = T(t("discard.hint", { n: B.hand.length - HAND_MAX }), 25, 0xd8c79d);
                hint.anchor.set(0.5, 0);
                hint.position.set(960, 339);
                hint.eventMode = "none";
                node.addChild(hint);
                const n = B.hand.length;
                const spread = Math.min(150, 1350 / Math.max(1, n));
                B.hand.forEach((card, idx) => {
                    const def = CARDS[card];
                    const c = new PIXI.Container();
                    if (def.img) {
                        const face = new PIXI.Sprite(uiTex(`cards/${def.img}.png`));
                        face.anchor.set(0.5, 0.5);
                        face.scale.set(0.825);
                        c.addChild(face);
                    } else { // фолбэк без картинки: рубашка + имя
                        const face = new PIXI.Sprite(uiTex("card_back_small.png"));
                        face.anchor.set(0.5, 0.5);
                        c.addChild(face);
                        const nm = T(GAME_LOC.t(`card.${card}.name`), 18, 0xf3e6c2);
                        nm.anchor.set(0.5);
                        nm.position.set(0, 69);
                        nm.eventMode = "none";
                        c.addChild(nm);
                    }
                    c.position.set(960 + (idx - (n - 1) / 2) * spread, 600);
                    c.eventMode = "static";
                    c.on("pointertap", () => pickDiscard(idx));
                    node.addChild(c);
                });
                root.addChild(node);
                discardPanel = node;
            };
            A.pickDiscard = function pickDiscard(idx) {
                if (!B || !B.discarding || !discardPanel) return;
                const cardId = B.hand.splice(idx, 1)[0];
                if (cardId) {
                    B.discard.push(cardId);
                    noteDiscard(1, "p", [cardId]);
                    B.scorch.p.delete(cardId); // метка ушла вместе с этой картой
                }
                sfx("chpoc");
                if (B.hand.length <= HAND_MAX) {
                    closeDiscardPanel();
                    layoutHand();
                    refreshHud();
                    enemyTurn(); // сброс завершён — ход переходит врагу
                } else {
                    layoutHand();
                    buildDiscardPanel(); // пересборка: новый состав руки и счётчик
                }
            };
        }
    };
})();
