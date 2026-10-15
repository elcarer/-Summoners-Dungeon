// СЦЕНА «КОЛОДА И КОЛЛЕКЦИЯ» — редактор колоды из меню.
// Слева — текущая колода карточками (клик по карте убирает копию),
// справа — коллекция (клик добавляет копию). Наведение на карту плавно
// увеличивает её до полного размера (копия поверх панели, маска не режет).
// Фильтры по типу/цене/редкости; стихии — рядом из 6 лого в правой части
// экрана (повторный клик по активному лого снимает фильтр). Оба окна —
// скролл-панели (колесо мыши, ползунок, клик по треку). Сохранение сразу.
(function () {
    function createDeckScene(ctx) {
        const { scenes, G, ui, uiTex } = ctx;
        const { CARDS, DECK_MAX, DECK_MIN, DECK_COPIES, ELEM_LOGO } = globalThis.GAME_DATA;
        const { T, fit, button, chip, cardFace, dimBg, scrollPane } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        let root = null, leftPane = null, rightPane = null;
        const filters = { type: null, cost: null, rarity: null, elem: null };
        const ELEM_KEYS = Object.keys(ELEM_LOGO);
        const PANE_POS = { left: { x: 60, y: 148 }, right: { x: 520, y: 186 } };
        const paneCards = { left: [], right: [] }; // для тестов: {id, node, cx, cy, labelY}
        const elemBtns = []; // круги-логотипы (эмитят pointertap в тестах)
        let zoom = null; // {id, node, cur, tgt} — ховер-зум карты

        // Наведение на карту: копия поверх панели растёт 0.5 → 1 (полный
        // размер), уведение — уменьшается обратно и удаляется. Копия добавляется
        // в root сцены (не в панель) — маска скролла её не обрезает.
        function showZoom(id, side, cx, cy) {
            hideZoom(true);
            const node = cardFace(ctx, id, { scale: 0.5 });
            node.eventMode = "none"; // клики проходят к карте под копией
            const pp = PANE_POS[side];
            const st = (side === "left" ? leftPane : rightPane).state;
            const iy = -st.t * Math.max(0, st.contentH - st.viewH);
            node.position.set(pp.x + cx, Math.max(180, Math.min(540, pp.y + cy + iy)));
            root.addChild(node);
            zoom = { id, node, cur: 0.5, tgt: 1 };
        }
        function hideZoom(immediate) {
            if (!zoom) return;
            if (immediate) { zoom.node.destroy({ children: true }); zoom = null; }
            else zoom.tgt = 0.5; // плавно уменьшится в update, затем удалится
        }

        function countIn(id) {
            return G.deck.reduce((n, c) => n + (c === id ? 1 : 0), 0);
        }
        function passes(id) {
            const def = CARDS[id];
            if (!def) return false;
            if (filters.type && def.type !== filters.type) return false;
            if (filters.cost && def.cost !== filters.cost) return false;
            if (filters.rarity && def.rarity !== filters.rarity) return false;
            if (filters.elem && def.elem !== filters.elem) return false;
            return true;
        }
        function save() { globalThis.GAME_META.saveMeta(G.collection, G.deck); }

        // ── левое окно: колода карточками (как коллекция) ──────────────────
        function buildDeckList() {
            const c = new PIXI.Container();
            paneCards.left = [];
            const ids = [...new Set(G.deck)].sort((a, b) => {
                const da = CARDS[a], db = CARDS[b];
                return (da.cost - db.cost) || a.localeCompare(b);
            }).filter(passes);
            const locked = G.deck.length <= DECK_MIN; // минимум — убирать нельзя
            ids.forEach((id, i) => {
                const col = i % 3, rowI = (i / 3) | 0;
                const cx = 62 + col * 132, cy = 92 + rowI * 205;
                const card = cardFace(ctx, id, { scale: 0.5, dim: locked });
                card.position.set(cx, cy);
                card.eventMode = "static";
                card.on("pointertap", () => api.remove(id));
                card.on("pointerover", () => showZoom(id, "left", cx, cy));
                card.on("pointerout", () => hideZoom(false));
                c.addChild(card);
                const cnt = T(`×${countIn(id)}`, 13, locked ? 0x8a7c5e : 0xd8c79d);
                cnt.anchor.set(0.5, 0);
                cnt.position.set(cx, cy + 92); // под картой, поднято на 10px (просил юзер)
                cnt.eventMode = "none";
                c.addChild(cnt);
                paneCards.left.push({ id, node: card, cx, cy, labelY: cy + 92 });
            });
            const rowsN = Math.ceil(ids.length / 3);
            c.userData = { contentH: ids.length ? (92 + (rowsN - 1) * 205 + 155) : 40 };
            return c;
        }

        // ── правое окно: сетка коллекции ───────────────────────────────────
        function buildCollection() {
            const c = new PIXI.Container();
            paneCards.right = [];
            const ids = Object.keys(CARDS).filter(passes);
            ids.forEach((id, i) => {
                const col = i % 5, rowI = (i / 5) | 0;
                const owned = G.collection[id] || 0;
                const inDeck = countIn(id);
                const capped = inDeck >= DECK_COPIES; // лимит одинаковых карт
                const canAdd = owned > inDeck && !capped && G.deck.length < DECK_MAX;
                const cx = 62 + col * 132, cy = 92 + rowI * 205;
                const card = cardFace(ctx, id, { scale: 0.5, dim: owned <= inDeck || capped });
                card.position.set(cx, cy);
                card.eventMode = "static"; // ховер-зум — на любой карте
                card.on("pointerover", () => showZoom(id, "right", cx, cy));
                card.on("pointerout", () => hideZoom(false));
                c.addChild(card);
                const cnt = T(t("deck.owned", { n: owned }), 13, canAdd ? 0xd8c79d : 0x8a7c5e);
                cnt.anchor.set(0.5, 0);
                cnt.position.set(cx, cy + 92); // под картой, поднято на 10px (просил юзер)
                cnt.eventMode = "none";
                c.addChild(cnt);
                paneCards.right.push({ id, node: card, cx, cy, labelY: cy + 92 });
                if (inDeck > 0) {
                    const mark = T(`+${inDeck}`, 15, 0x9fd489);
                    mark.anchor.set(0.5);
                    mark.position.set(cx + 46, cy - 68);
                    mark.eventMode = "none";
                    c.addChild(mark);
                }
                if (canAdd) card.on("pointertap", () => api.add(id));
            });
            const rowsN = Math.ceil(ids.length / 5);
            c.userData = { contentH: ids.length ? (92 + (rowsN - 1) * 205 + 155) : 40 };
            return c;
        }

        // ── ряд чипов фильтров строится в rebuildChips ────────────────────

        function rebuildPanes() {
            hideZoom(true); // контент панелей пересобран — старый зум неактуален
            if (leftPane) {
                const c = buildDeckList();
                leftPane.setContent(c, c.userData.contentH);
            }
            if (rightPane) {
                const c = buildCollection();
                rightPane.setContent(c, c.userData.contentH);
            }
            rebuildChips();
            headerText();
        }

        let headerRef = null;
        function headerText() {
            if (!headerRef) return;
            headerRef.deck.text = t("deck.current", { n: G.deck.length, max: DECK_MAX });
            headerRef.min.text = t("deck.min", { min: DECK_MIN });
            headerRef.min.style.fill = G.deck.length < DECK_MIN ? 0xff8f6e : 0x8a7c5e;
        }

        function rebuild() {
            if (root) root.destroy({ children: true });
            root = new PIXI.Container();
            root.eventMode = "static";
            root.addChild(dimBg(ctx, 0.85));

            const title = T(t("deck.title"), 34, 0xf0c96a, { stroke: { color: 0x241505, width: 6 } });
            title.anchor.set(0.5, 0);
            title.position.set(640, 14);
            title.eventMode = "none";
            fit(title, 900, 20);
            root.addChild(title);

            // левая рамка + заголовок + скролл-панель
            const left = new PIXI.Graphics();
            left.roundRect(48, 86, 430, 592, 10);
            left.fill({ color: 0x171310, alpha: 0.92 });
            left.stroke({ width: 2, color: 0x6b5c40 });
            root.addChild(left);
            const deckH = T("", 20, 0xf3e6c2);
            deckH.position.set(66, 88); // на 10px выше (просил юзер)
            deckH.eventMode = "none";
            root.addChild(deckH);
            const minH = T("", 13, 0x8a7c5e);
            minH.position.set(66, 126);
            minH.eventMode = "none";
            root.addChild(minH);
            headerRef = { deck: deckH, min: minH };
            leftPane = scrollPane(ctx, { x: 60, y: 148, w: 406, h: 516, onScroll: () => hideZoom(false) });
            root.addChild(leftPane.node);

            // правая рамка + фильтры + скролл-панель
            const right = new PIXI.Graphics();
            right.roundRect(508, 86, 724, 592, 10);
            right.fill({ color: 0x171310, alpha: 0.92 });
            right.stroke({ width: 2, color: 0x6b5c40 });
            root.addChild(right);

            const hint = T(t("deck.hint"), 13, 0x8a7c5e, { wordWrap: true, wordWrapWidth: 690 });
            hint.position.set(524, 652);
            hint.eventMode = "none";
            root.addChild(hint);

            rightPane = scrollPane(ctx, { x: 520, y: 186, w: 700, h: 456, onScroll: () => hideZoom(false) });
            root.addChild(rightPane.node);

            rebuildChips();
            const lc = buildDeckList();
            leftPane.setContent(lc, lc.userData.contentH);
            const rc = buildCollection();
            rightPane.setContent(rc, rc.userData.contentH);
            headerText();

            root.addChild(button(ctx, {
                tex: "button_menu.png", label: t("deck.back"), x: 110, y: 52, scale: 1,
                onTap: () => {
                    const to = G.uiReturn || "menu"; // откуда пришли (меню/подземелье)
                    G.uiReturn = null;
                    scenes.go(to);
                },
            }));
            ui.addChild(root);
        }

        function rebuildChips() {
            elemBtns.length = 0;
            for (const n of root.children.slice()) {
                if (n.userData && n.userData.isChip) root.removeChild(n);
                else if (n.style && n.style.fontSize === 13 && n.y >= 92 && n.y <= 180 && n.x >= 524) {
                    root.removeChild(n); // подписи осей фильтров
                }
            }
            const costs = [...new Set(Object.values(CARDS).map((d) => d.cost))].sort();
            const rows = [
                { y: 96, label: t("filter.type"), key: "type",
                    opts: [["unit", "building", "spell", "trap"].map((v) => ({ value: v, label: t(`type.${v}.short`) }))] },
                { y: 126, label: t("filter.cost"), key: "cost",
                    opts: [costs.map((v) => ({ value: v, label: String(v) }))] },
                { y: 156, label: t("filter.rarity"), key: "rarity",
                    opts: [["common", "rare", "epic"].map((v) => ({ value: v, label: t(`rarity.${v}.short`) }))] },
            ];
            for (const r of rows) {
                let cx = 524;
                const label = T(r.label, 13, 0xcfc4a6);
                label.position.set(cx, r.y + 6);
                label.eventMode = "none";
                root.addChild(label);
                cx += label.width + 10;
                const opts = [{ value: null, label: t("filter.all") }, ...r.opts[0]];
                for (const o of opts) {
                    const active = filters[r.key] === o.value;
                    const ch = chip(ctx, {
                        label: o.label, x: cx, y: r.y, active,
                        onTap: () => { filters[r.key] = o.value; rebuildPanes(); },
                    });
                    ch.userData.isChip = true;
                    root.addChild(ch);
                    cx += ch.userData.w + 6;
                }
            }
            // ── фильтр стихий: ряд из 6 лого в ПРАВОЙ части экрана, на
            // свободном месте над панелью коллекции (просил юзер). Повторный
            // клик по активному лого снимает фильтр (= «Все»).
            const ELEM_Y = 96, ELEM_X0 = 966, STEP = 44; // лого 38px, ряд до x=1224
            for (let i = 0; i < ELEM_KEYS.length; i++) {
                const value = ELEM_KEYS[i];
                const active = filters.elem === value;
                const c2 = new PIXI.Container();
                const g = new PIXI.Graphics();
                g.circle(19, 19, 19);
                g.fill(active ? 0x3a4a2e : 0x2e2822);
                g.stroke({ width: 2, color: active ? 0xa8e890 : 0x6b5c40 });
                g.eventMode = "static";
                g.on("pointertap", () => {
                    if (ctx.sfx) ctx.sfx();
                    filters.elem = filters.elem === value ? null : value;
                    rebuildPanes();
                });
                const sp = new PIXI.Sprite(uiTex(ELEM_LOGO[value]));
                sp.anchor.set(0.5);
                sp.scale.set(30 / sp.texture.width);
                sp.position.set(19, 19);
                sp.eventMode = "none";
                if (!active) sp.alpha = 0.6;
                c2.addChild(g, sp);
                c2.position.set(ELEM_X0 + i * STEP, ELEM_Y);
                c2.userData = { isChip: true };
                root.addChild(c2);
                elemBtns.push(g);
            }
            const cap = T(t("filter.elem"), 13, 0xcfc4a6);
            cap.anchor.set(0.5, 0);
            cap.position.set(ELEM_X0 + (ELEM_KEYS.length - 1) * STEP / 2 + 19, ELEM_Y + 44);
            cap.eventMode = "none";
            root.addChild(cap);
        }

        const api = {
            add(id) {
                if (G.deck.length >= DECK_MAX) return false;
                if (countIn(id) >= (G.collection[id] || 0)) return false;
                if (countIn(id) >= DECK_COPIES) return false; // не более 3 одинаковых
                G.deck.push(id);
                save();
                rebuildPanes();
                return true;
            },
            remove(id) {
                const i = G.deck.lastIndexOf(id);
                if (i < 0 || G.deck.length <= DECK_MIN) return false;
                G.deck.splice(i, 1);
                save();
                rebuildPanes();
                return true;
            },
            setFilter(key, value) { filters[key] = value; rebuildPanes(); },
            filters: () => ({ ...filters }),
            visibleIds: () => Object.keys(CARDS).filter(passes),
            deckListIds: () => [...new Set(G.deck)].filter(passes),
            counts() { return { deck: G.deck.length, collection: { ...G.collection } }; },
            scroll(side, dy) { (side === "left" ? leftPane : rightPane).scrollBy(dy); },
            paneState: (side) => (side === "left" ? leftPane : rightPane).state,
            paneDebug: (side) => (side === "left" ? leftPane : rightPane).debug(),
            // ховер-зум карт: состояние анимации (тесты)
            zoomState: () => (zoom
                ? { id: zoom.id, scale: Math.round(zoom.cur * 1000) / 1000, target: zoom.tgt }
                : null),
            // узлы/геометрия карточек панелей (тесты: эмит pointerover/out)
            cardNode: (side, i) => (paneCards[side] && paneCards[side][i] ? paneCards[side][i].node : null),
            cardInfo: (side, i) => (paneCards[side] && paneCards[side][i]
                ? { ...paneCards[side][i], node: undefined } : null),
            // ряд лого стихий (тесты): число, активный фильтр, левый край
            elemInfo: () => ({ count: ELEM_KEYS.length, active: filters.elem, x0: 966 }),
            elemTap(i) { const g = elemBtns[i]; if (g) g.emit("pointertap"); },
        };

        return {
            enter() { rebuild(); },
            exit() {
                hideZoom(true);
                if (root) { root.destroy({ children: true }); root = null; }
            },
            update(ticker) {
                if (!root) return;
                if (zoom) {
                    const z = zoom;
                    z.cur += (z.tgt - z.cur) * Math.min(1, (ticker.deltaMS / 1000) * 14);
                    if (Math.abs(z.tgt - z.cur) < 0.01) {
                        z.cur = z.tgt;
                        if (z.tgt === 0.5) { z.node.destroy({ children: true }); zoom = null; }
                    }
                    if (zoom) z.node.scale.set(z.cur);
                }
            },
            api,
        };
    }

    globalThis.GAME_DECK = { createDeckScene };
})();
