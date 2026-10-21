// СЦЕНА «АРЕНА»: HUD, оверлеи, баннер.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installHud = function installHud(A) {
        with (A) {
            // ── HUD боя ────────────────────────────────────────────────────────
            A.buildHud = function buildHud() {
                const c = new PIXI.Container();
                // декор HUD — «хром»: клики сквозь него. Раскладка — по референсу
                // юзера (for_work/референсы/new_UI_battle.png): колоды в углах,
                // панели параметров у своих колод, сброс и «Конец хода» справа
                // внизу, полоса базы врага — сверху по центру.

                // полоса жизней базы врага, число — в центре полосы; по краям —
                // его энергия и карты (иконки юзера, раскладка по референсу
                // for_work/референсы/new_UI_battle.png)
                const eBar = new PIXI.Graphics();
                eBar.eventMode = "none";
                c.addChild(eBar);
                const eBaseT = T("", 22, 0xffff99, { stroke: { color: 0x2a1c10, width: 5 } });
                eBaseT.anchor.set(0.5, 0.5);
                eBaseT.position.set(962, 47);
                eBaseT.eventMode = "none";
                c.addChild(eBaseT);
                const digitStyle = { stroke: { color: 0x16283a, width: 6 } };
                const eEnergyIcon = new PIXI.Sprite(uiTex("UI_energy.png"));
                eEnergyIcon.position.set(682, 10); // +3px вправо (просил юзер)
                eEnergyIcon.eventMode = "none";
                c.addChild(eEnergyIcon);
                const eEnergyT = T("", 42, 0x9fd8e4, digitStyle);
                eEnergyT.anchor.set(0.5);
                eEnergyT.position.set(718, 46);
                eEnergyT.eventMode = "none";
                c.addChild(eEnergyT);
                const eCardsIcon = new PIXI.Sprite(uiTex("UI_cards_hand.png"));
                eCardsIcon.position.set(1164, 8);
                eCardsIcon.eventMode = "none";
                c.addChild(eCardsIcon);
                // жёлтым — как число карт игрока (просил юзер; было голубым)
                const eCardsT = T("", 40, 0xffcc66, { stroke: { color: 0x3a2408, width: 6 } });
                eCardsT.anchor.set(0.5);
                eCardsT.position.set(1200, 44);
                eCardsT.eventMode = "none";
                c.addChild(eCardsT);

                // колода врага — рубашка по стихии боя (гоблины/природа); клик
                // показывает, какие карты у него остались. Сдвинута влево
                // (просил юзер): плашку с именем убрали, на старом месте колоды
                // теперь его сброс
                const eDeckPile = new PIXI.Sprite(uiTex(enemyBackTex()));
                eDeckPile.position.set(1545, 24);
                eDeckPile.scale.set(0.74); // 230×338 → 170×250
                eDeckPile.eventMode = "static";
                eDeckPile.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("edeck"); });
                c.addChild(eDeckPile);
                const eDeckCnt = T("", 22, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4.5 } });
                eDeckCnt.anchor.set(0.5, 1);
                eDeckCnt.position.set(1630, 266);
                eDeckCnt.eventMode = "none";
                c.addChild(eDeckCnt);

                // сброс врага — на прежнем месте его колоды: пусто — тусклая
                // полупрозрачная рубашка стихии боя, в бою — последняя ушедшая
                // карта приглушённым лицом; клик — просмотр сброса (механика
                // сброса игрока, просил юзер)
                const eDiscardFace = new PIXI.Sprite(uiTex(enemyBackTex()));
                eDiscardFace.position.set(1725, 24);
                eDiscardFace.scale.set(0.74); // рубашка 230×338 → слот 170×250
                eDiscardFace.tint = 0x5a5a5a;
                eDiscardFace.alpha = 0.6;
                eDiscardFace.eventMode = "static";
                eDiscardFace.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("ediscard"); });
                c.addChild(eDiscardFace);
                const eDiscardCnt = T("", 22, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4.5 } });
                eDiscardCnt.anchor.set(0.5, 1);
                eDiscardCnt.position.set(1810, 266);
                eDiscardCnt.eventMode = "none";
                c.addChild(eDiscardCnt);

                // карта персонажа врага (просил юзер): под его колодой, её
                // baseHp — жизни базы врага. Наведение — рост до натурального
                // размера (как у карточки героя игрока). У драфта/Рощи карты
                // пока нет — держатель не строится
                const eHeroDef = ENCOUNTERS[B.encId] && ENCOUNTERS[B.encId].hero
                    && HEROES[ENCOUNTERS[B.encId].hero]
                    ? HEROES[ENCOUNTERS[B.encId].hero] : null;
                if (eHeroDef) {
                    const eHeroHolder = new PIXI.Container();
                    eHeroHolder.position.set(1740, 286);
                    eHeroHolder.hitArea = new PIXI.Rectangle(0, 0, 143, 210);
                    const eHeroCard = new PIXI.Sprite(uiTex(`heroes/${eHeroDef.img}.png`));
                    eHeroCard.scale.set(0.62); // 230×338 → ~143×210
                    eHeroCard.eventMode = "none";
                    eHeroHolder.addChild(eHeroCard);
                    ctx.heroHover(eHeroHolder, eHeroCard, -50, 0); // большой вид: край 1920
                    c.addChild(eHeroHolder);
                }

                // база игрока — зелёная полоса в левой колонке, между картой
                // героя и его колодой, число — в её центре (просил юзер); по
                // краям трека справа внизу — энергия и карты игрока (иконки
                // юзера): текущее число у энергии сопровождает «+добавка» по
                // положению шкалы, у карт — «рука+добавка» (референс юзера)
                const pBar = new PIXI.Graphics();
                pBar.eventMode = "none";
                c.addChild(pBar);
                const pBaseT = T("", 22, 0xffff99, { stroke: { color: 0x2a1c10, width: 5 } });
                pBaseT.anchor.set(0.5, 0.5);
                pBaseT.position.set(239, 778);
                pBaseT.eventMode = "none";
                c.addChild(pBaseT);
                const pEnergyIcon = new PIXI.Sprite(uiTex("UI_energy.png"));
                pEnergyIcon.position.set(1425, 588); // +3px вправо (просил юзер)
                pEnergyIcon.eventMode = "none";
                c.addChild(pEnergyIcon);
                const pEnergyT = T("", 42, 0x9fd8e4, digitStyle);
                pEnergyT.anchor.set(0.5);
                pEnergyT.position.set(1461, 624);
                pEnergyT.eventMode = "none";
                c.addChild(pEnergyT);
                // «−X» при наведении на карту руки (просил юзер): сколько
                // энергии уйдёт на розыгрыш; краснеет, если энергии не хватает
                const pEnergyCostT = T("", 30, 0xffd98c, { stroke: { color: 0x0e1826, width: 6 } });
                pEnergyCostT.anchor.set(1, 0.5);
                pEnergyCostT.position.set(1417, 624);
                pEnergyCostT.eventMode = "none";
                c.addChild(pEnergyCostT);
                const pEnergyGainT = T("", 30, 0x9fd3d3, { stroke: { color: 0x0e1826, width: 6 } });
                pEnergyGainT.anchor.set(0, 0.5);
                pEnergyGainT.position.set(1488, 624);
                pEnergyGainT.eventMode = "none";
                c.addChild(pEnergyGainT);
                const pCardsIcon = new PIXI.Sprite(uiTex("UI_cards_hand.png"));
                pCardsIcon.position.set(1822, 586);
                pCardsIcon.eventMode = "none";
                c.addChild(pCardsIcon);
                const pCardsT = T("", 36, 0xffcc66, { stroke: { color: 0x3a2408, width: 6 } });
                pCardsT.anchor.set(0.5);
                pCardsT.position.set(1858, 622);
                pCardsT.eventMode = "none";
                c.addChild(pCardsT);

                // колода игрока — рубашка его стихии (просил юзер: вместо общей
                // card_back_min) в левом нижнем углу; клик — просмотр
                const pDeckPile = new PIXI.Sprite(uiTex(playerBackTex()));
                pDeckPile.position.set(25, 806);
                pDeckPile.scale.set(0.775, (0.775 * 330) / 338); // 230×338 → 178×256
                pDeckPile.eventMode = "static";
                pDeckPile.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("deck"); });
                c.addChild(pDeckPile);
                const pDeckCnt = T("", 22, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4.5 } });
                pDeckCnt.anchor.set(0.5, 1);
                pDeckCnt.position.set(114, 1052);
                pDeckCnt.eventMode = "none";
                c.addChild(pDeckCnt);

                // сброс — правый нижний угол: последняя ушедшая карта приглушённым
                // лицом (пусто — тусклая рубашка стихии игрока); клик — просмотр
                const discardFace = new PIXI.Sprite(uiTex(playerBackTex()));
                discardFace.position.set(1668, 724);
                discardFace.scale.set(1); // рубашка стихии 230×338 — натуральный слот
                discardFace.tint = 0x5a5a5a;
                discardFace.alpha = 0.6;
                discardFace.eventMode = "static";
                discardFace.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("discard"); });
                c.addChild(discardFace);
                const discardCnt = T("", 22, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4.5 } });
                discardCnt.anchor.set(0.5, 1);
                discardCnt.position.set(1783, 1052);
                discardCnt.eventMode = "none";
                c.addChild(discardCnt);

                // «Конец хода» — слева от сброса (кнопка-сфера без надписи)
                const endBtn = new PIXI.Sprite(uiTex("button_end.png"));
                endBtn.position.set(1477, 836); // 151×174 в натуральном масштабе
                endBtn.eventMode = "static";
                endBtn.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); api.endTurn(); });
                c.addChild(endBtn);
                const endLabel = T(t("arena.endTurn"), 28, 0xffe9b0,
                    { stroke: { color: 0x1c1207, width: 5 }, wordWrap: true, wordWrapWidth: 120,
                      breakWords: true, align: "center", lineHeight: 22 });
                endLabel.anchor.set(0.5);
                endLabel.position.set(1552, 919);
                endLabel.eventMode = "none";
                c.addChild(endLabel);

                // шкала конца хода «+карты ↔ +энергия» (применится по «Конец»),
                // над сбросом; бегунок — синяя сфера button_1. Меток у трека нет:
                // добавки теперь видны на иконках энергии и карт по краям
                const slWrap = new PIXI.Container();
                slWrap.position.set(1663, 626);
                const slTrack = new PIXI.Graphics();
                slWrap.addChild(slTrack);
                const slThumb = new PIXI.Sprite(uiTex("button_1.png"));
                slThumb.anchor.set(0.5);
                slThumb.scale.set(0.81); // 99×128 → ~80×104
                slWrap.addChild(slThumb);
                slTrack.on("pointerdown", sliderGrab);
                slThumb.on("pointerdown", sliderGrab);
                c.addChild(slWrap);
                // иконки и числа — ПОВЕРХ трека и бегунка (просил юзер): полоска
                // заходит под края иконок, ползунок у краёв — под числа; клики
                // не теряются: у иконок и чисел eventMode "none"
                c.addChild(pEnergyIcon);
                c.addChild(pEnergyT);
                c.addChild(pCardsIcon);
                c.addChild(pCardsT);
                c.addChild(pEnergyGainT);

                // настройки — левый верхний угол
                const gear = new PIXI.Sprite(uiTex("icon_setting.png"));
                gear.anchor.set(0.5);
                gear.scale.set(0.92);
                gear.position.set(57, 57);
                gear.eventMode = "static";
                gear.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); openOverlay("settings"); });
                c.addChild(gear);

                // карточка героя (просил юзер): НАД колодой игрока, та же
                // координата x. Его baseHp — жизни базы игрока. Наведение — рост
                // до натурального размера (ctx.heroHover); большой вид смещается
                // вверх, чтобы не накрывать полосу базы и колоду
                const aHeroDef = globalThis.GAME_DATA.HEROES[G.heroId]
                    || globalThis.GAME_DATA.HEROES.gorbag;
                const heroHolder = new PIXI.Container();
                heroHolder.position.set(25, 544);
                heroHolder.hitArea = new PIXI.Rectangle(0, 0, 143, 210); // исходное место
                const heroCard = new PIXI.Sprite(uiTex(`heroes/${aHeroDef.img}.png`));
                heroCard.scale.set(0.62); // 230×338 → ~143×210
                heroCard.eventMode = "none";
                heroHolder.addChild(heroCard);
                ctx.heroHover(heroHolder, heroCard, 0, -128);
                c.addChild(heroHolder);

                const targetHint = T("", 24, 0xef9f8c, { stroke: { color: 0x1c1207, width: 6 } });
                targetHint.anchor.set(0.5);
                targetHint.position.set(960, 849);
                targetHint.eventMode = "none";
                c.addChild(targetHint);

                const banner = T("", 81, 0xffe2a8, { stroke: { color: 0x1c1207, width: 12 } });
                banner.anchor.set(0.5);
                banner.position.set(960, 450);
                banner.alpha = 0;
                banner.eventMode = "none"; // баннер не ест клики поля под ним
                c.addChild(banner);

                c.userData = { eBar, eBaseT, eEnergyT, eCardsT, pBar, pBaseT, pEnergyT,
                    pEnergyGainT, pEnergyCostT, pCardsT, eDeckCnt, eDiscardCnt, pDeckCnt, discardCnt,
                    eEnergyIcon, pEnergyIcon, pDeckPile, eDeckPile,
                    discardFace, lastDiscard: undefined,
                    eDiscardFace, eLastDiscard: undefined,
                    endBtn, endLabel, banner, targetHint,
                    slider: { wrap: slWrap, track: slTrack, thumb: slThumb } };
                return c;
            };

            // ── Оверлеи поверх боя: настройки / колода (просмотр) ────────────────
            A.overlay = null; // { name, node, grid, pane }
            A.ovZoom = null; // ховер-зум карты {id, node, cur, tgt}
            A.ovCards = []; // узлы карточек сетки (тесты: pointerover/out)
            A.OV_PANE = { x: 315, y: 198, w: 1290, h: 660 }; // окно просмотра
            A.closeOverlay = function closeOverlay() {
                if (!overlay) return;
                hideOvZoom(true); // зум-копия — ребёнок overlay.node, гасим первой
                overlay.node.destroy({ children: true });
                overlay = null;
                ovCards = [];
                if (drag) endCardDrag(); // защита от пересечения состояний
            };
            // Ховер-зум карт оверлея (просил юзер — как в меню «Колоды»): копия
            // поверх панели растёт 0.75 → 1 (оригинальный размер спрайта),
            // уведение — уменьшается обратно и удаляется. Копия добавляется в
            // node оверлея — маска скролла её не обрезает.
            A.showOvZoom = function showOvZoom(id, cx, cy, base) {
                hideOvZoom(true);
                if (!overlay || !overlay.pane) return;
                // базовую карту прячем на время показа копии (просил юзер —
                // иначе видны обе). Через alpha, не visible: невидимая карта
                // остаётся кликабельной, а dim-карты вернут свою прозрачность
                let baseAlpha = 1;
                if (base && !base.destroyed) { baseAlpha = base.alpha; base.alpha = 0; }
                const zNode = globalThis.GAME_UI.cardFace(ctx, id, { scale: 0.75 });
                zNode.eventMode = "none"; // уведение проходит к карте под копией
                const st = overlay.pane.state;
                const iy = -st.t * Math.max(0, st.contentH - st.viewH);
                // полная карта 337×495: не даём вылезти за окно панели
                const hw = 172, hh = 250;
                zNode.position.set(
                    Math.max(OV_PANE.x + hw, Math.min(OV_PANE.x + OV_PANE.w - hw, OV_PANE.x + cx)),
                    Math.max(OV_PANE.y + hh, Math.min(OV_PANE.y + OV_PANE.h - hh, OV_PANE.y + cy + iy)),
                );
                overlay.node.addChild(zNode);
                ovZoom = { id, node: zNode, cur: 0.75, tgt: 1, base, baseAlpha };
            };
            A.hideOvZoom = function hideOvZoom(immediate) {
                if (!ovZoom) return;
                if (immediate) {
                    if (ovZoom.base && !ovZoom.base.destroyed) ovZoom.base.alpha = ovZoom.baseAlpha;
                    ovZoom.node.destroy({ children: true });
                    ovZoom = null;
                } else ovZoom.tgt = 0.75; // плавно уменьшится в update, затем удалится
            };
            A.openOverlay = function openOverlay(name) {
                if (overlay || (B && B.discarding)) return; // поверх сброса — ничего
                if (overlay) closeOverlay();
                const node = new PIXI.Container();
                let grid = null; // сетка карт (deck/edeck/discard) — для тестов
                let pane = null; // скролл-панель просмотра (ховер-зум берёт сдвиг скролла)
                node.eventMode = "static"; // глотает клики — поле под ним молчит
                const dim = new PIXI.Graphics();
                dim.rect(0, 0, 1280, 720);
                dim.fill({ color: 0x000000, alpha: 0.72 });
                dim.eventMode = "static";
                node.addChild(dim);
                if (name === "settings") {
                    // из боя в настройках есть «В главное меню» (просил юзер):
                    // забег сохранён подземельем при уходе в бой — «Продолжить»
                    // в меню вернёт к тому же врагу, бой начнётся заново
                    const panel = globalThis.GAME_SETTINGS_SCENE.buildPanel(ctx, {
                        onBack: closeOverlay,
                        onQuit: () => { closeOverlay(); scenes.go("menu"); },
                    });
                    panel.applySound();
                    node.addChild(panel.node);
                } else { // deck / edeck / discard — только просмотр, без редактирования:
                    // колода — ОСТАТОК (B.deck), колода врага — его остаток (B.eDeck),
                    // сброс — лежащие карты (свой B.discard / вражеский B.eDiscard)
                    const { T, button, cardFace, scrollPane } = globalThis.GAME_UI;
                    const { CARDS } = globalThis.GAME_DATA;
                    const pile = name === "discard" ? B.discard
                        : name === "ediscard" ? B.eDiscard
                        : name === "edeck" ? B.eDeck : B.deck;
                    const frame = new PIXI.Graphics();
                    frame.roundRect(285, 81, 1350, 885, 18);
                    frame.fill({ color: 0x171310, alpha: 0.95 });
                    frame.stroke({ width: 3, color: 0x6b5c40 });
                    node.addChild(frame);
                    const title = T(t(name === "discard" ? "deck.discardTitle"
                        : name === "ediscard" ? "deck.enemyDiscardTitle"
                        : name === "edeck" ? "deck.enemyTitle" : "deck.viewTitle"),
                        45, 0xf0c96a, { stroke: { color: 0x241505, width: 7.5 } });
                    title.anchor.set(0.5, 0);
                    title.position.set(960, 105);
                    title.eventMode = "none";
                    node.addChild(title);
                    const hint = T(t("deck.viewHint"), 21, 0x8a7c5e);
                    hint.anchor.set(0.5, 0);
                    hint.position.set(960, 162);
                    hint.eventMode = "none";
                    node.addChild(hint);
                    pane = scrollPane(ctx, {
                        x: OV_PANE.x, y: OV_PANE.y, w: OV_PANE.w, h: OV_PANE.h,
                        onScroll: () => hideOvZoom(false), // прокрутка — старый зум мимо
                    });
                    grid = new PIXI.Container();
                    ovCards = [];
                    // cardFace 0.75 = карта ~253×371 (центр в position): ряды
                    // дальше высоты карты (415), первый ряд целиком в панели
                    // (просил юзер: карты обрезались сверху и налагались)
                    const CARD_H = 371, ROW_STEP = 415, TOP = 200;
                    const ids = [...new Set(pile)].sort((a, b) =>
                        (CARDS[a].cost - CARDS[b].cost) || a.localeCompare(b));
                    ids.forEach((id, i) => {
                        const col = i % 4, rowI = (i / 4) | 0;
                        const cx = 172.5 + col * 322.5, cy = TOP + rowI * ROW_STEP;
                        const card = cardFace(ctx, id, { scale: 0.75 });
                        card.position.set(cx, cy);
                        card.eventMode = "static"; // ховер-зум — на любой карте
                        card.on("pointerover", () => showOvZoom(id, cx, cy, card));
                        card.on("pointerout", () => hideOvZoom(false));
                        grid.addChild(card);
                        ovCards.push(card);
                        const n = pile.reduce((s, c) => s + (c === id ? 1 : 0), 0);
                        const cnt = T(`×${n}`, 27, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 6 } });
                        cnt.anchor.set(0.5);
                        cnt.position.set(cx + 72, cy - 96);
                        cnt.eventMode = "none";
                        grid.addChild(cnt);
                    });
                    if (!ids.length) {
                        const empty = T(t("deck.viewEmpty"), 30, 0x8a7c5e);
                        empty.position.set(66, 30);
                        empty.eventMode = "none";
                        grid.addChild(empty);
                    }
                    const rowsN = Math.ceil(ids.length / 4);
                    pane.setContent(grid,
                        ids.length ? TOP + CARD_H / 2 + (rowsN - 1) * ROW_STEP : 60);
                    node.addChild(pane.node);
                    node.addChild(button(ctx, {
                        tex: "button_menu.png", label: t("settings.back"), x: 960, y: 1017, scale: 1,
                        onTap: closeOverlay,
                    }));
                }
                root.addChild(node);
                overlay = { name, node, grid, pane };
            };

            A.drawBar = function drawBar(g, x, y, w, h, ratio, color) {
                g.clear();
                g.roundRect(x, y, w, h, 6);
                g.fill(0x1c1712);
                g.roundRect(x + 2, y + 2, (w - 4) * Math.max(0, Math.min(1, ratio)), h - 4, 4);
                g.fill(color);
                g.roundRect(x, y, w, h, 6);
                g.stroke({ width: 2, color: 0x6b5c40 });
            };

            A.refreshHud = function refreshHud() {
                if (!root || !B) return;
                const ud = root.hud.userData;
                // полоса базы врага — верх экрана по центру (742..1182)
                drawBar(ud.eBar, 742, 31, 440, 33, B.enemyBase / B.enemyBaseMax, 0xc0503c);
                ud.eBaseT.text = `${Math.max(0, B.enemyBase)}/${B.enemyBaseMax}`;
                // энергия и карты врага — числа на иконках по краям его полосы
                ud.eEnergyT.text = String(B.eEnergy);
                ud.eCardsT.text = String(B.eHand.length);
                // база игрока — зелёная полоса слева, между картой героя и его
                // колодой (просил юзер); энергия и карты — на иконках справа
                // внизу, добавку шкалы дорисует refreshSlider
                drawBar(ud.pBar, 25, 762, 428, 31, B.playerBase / B.playerBaseMax, 0x579e52);
                ud.pBaseT.text = `${Math.max(0, B.playerBase)}/${B.playerBaseMax}`;
                ud.pEnergyT.text = String(B.energy);
                updateEnergyHint(); // «−X» у энергии — стоимость карты под курсором
                ud.pDeckCnt.text = String(B.deck.length);
                ud.eDeckCnt.text = String(B.eDeck.length);
                ud.discardCnt.text = String(B.discard.length);
                ud.eDiscardCnt.text = String(B.eDiscard.length);
                // сброс: последняя ушедшая карта приглушённым лицом
                const last = B.discard[B.discard.length - 1] || null;
                if (ud.lastDiscard !== last) {
                    ud.lastDiscard = last;
                    if (last && CARDS[last] && CARDS[last].img) {
                        ud.discardFace.texture = uiTex(`cards/${CARDS[last].img}.png`);
                        ud.discardFace.scale.set(1); // лицо 230×338 — натуральный слот
                        ud.discardFace.tint = 0x8a8a8a;
                        ud.discardFace.alpha = 1;
                    } else {
                        ud.discardFace.texture = uiTex(playerBackTex());
                        ud.discardFace.scale.set(1); // рубашка стихии 230×338 — тот же слот
                        ud.discardFace.tint = 0x5a5a5a;
                        ud.discardFace.alpha = 0.6;
                    }
                }
                // сброс врага — та же механика (просил юзер), приглушённей:
                // кучка полупрозрачная и в лицо последней карты
                const eLast = B.eDiscard[B.eDiscard.length - 1] || null;
                if (ud.eLastDiscard !== eLast) {
                    ud.eLastDiscard = eLast;
                    if (eLast && CARDS[eLast] && CARDS[eLast].img) {
                        ud.eDiscardFace.texture = uiTex(`cards/${CARDS[eLast].img}.png`);
                        ud.eDiscardFace.scale.set(0.74); // лицо 230×338 → слот 170×250
                        ud.eDiscardFace.tint = 0x9a9a9a;
                        ud.eDiscardFace.alpha = 0.8;
                    } else {
                        ud.eDiscardFace.texture = uiTex(enemyBackTex());
                        ud.eDiscardFace.scale.set(0.74); // рубашка 230×338 → слот 170×250
                        ud.eDiscardFace.tint = 0x5a5a5a;
                        ud.eDiscardFace.alpha = 0.6;
                    }
                }
                const on = B.phase === "player";
                ud.endBtn.alpha = on ? 1 : 0.45;
                ud.endBtn.eventMode = on ? "static" : "none";
                ud.endLabel.alpha = on ? 1 : 0.45;
                ud.targetHint.text = B.spellTarget ? t("arena.pickTarget") : "";
                refreshSlider();
            };

            A.bannerT = 0;
            A.bannerFade = 0.35;
            A.banner = function banner(text) {
                const b = root.hud.userData.banner;
                b.text = text;
                b.scale.set(1.25);
                b.alpha = 1;
                bannerT = 1.1 / animK();
                bannerFade = 0.35 / animK();
            };
        }
    };
})();
