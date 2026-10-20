// СЦЕНА «КОЛОДА И КОЛЛЕКЦИЯ» — редактор колоды из меню.
// Слева — текущая колода карточками (клик по карте убирает копию),
// справа — коллекция (клик добавляет копию), только карты, которые
// есть у игрока. Наведение на карту плавно
// увеличивает её до полного размера (копия поверх панели, маска не режет).
// Фильтры по типу/цене/редкости; стихии — рядом из 6 лого в правой части
// экрана (повторный клик по активному лого снимает фильтр). Оба окна —
// скролл-панели (колесо мыши, ползунок, клик по треку). Сохранение сразу.
(function () {
    function createDeckScene(ctx) {
        const { scenes, G, ui, uiTex } = ctx;
        const { CARDS, DECK_MAX, DECK_MIN, DECK_COPIES, ELEM_LOGO, HEROES,
            HERO_ORDER, HERO_FOE_ORDER } = globalThis.GAME_DATA;
        const { T, fit, button, chip, cardFace, dimBg, scrollPane } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        let root = null, leftPane = null, rightPane = null;
        let tab = "deck"; // вкладка сцены: «Колода» | «Герои» (просил юзер)
        const heroCards = []; // вкладка «Герои»: {id, node} (тесты)
        const filters = { type: null, cost: null, rarity: null, elem: null };
        const ELEM_KEYS = Object.keys(ELEM_LOGO);
        const PANE_POS = { left: { x: 90, y: 222 }, right: { x: 780, y: 279 } };
        // ряд лого стихий (общие константы: использует и rebuildChips, и api)
        const ELEM_Y = 144, ELEM_X0 = 1449, STEP = 66; // лого 57px, ряд до x=1836
        const paneCards = { left: [], right: [] }; // для тестов: {id, node, cx, cy, labelY}
        const elemBtns = []; // круги-логотипы (эмитят pointertap в тестах)
        const elemSprites = []; // спрайты лого (тесты: позиция = центр круга)
        let zoom = null; // {id, node, cur, tgt} — ховер-зум карты

        // Наведение на карту: копия поверх панели растёт 0.5 → 1 (полный
        // размер), уведение — уменьшается обратно и удаляется. Копия добавляется
        // в root сцены (не в панель) — маска скролла её не обрезает.
        function showZoom(id, side, cx, cy, base) {
            hideZoom(true);
            // базовую карту прячем на время показа копии (просил юзер —
            // иначе видны обе). Через alpha, не visible: невидимая карта
            // остаётся кликабельной (клик по ней добавляет/убирает копию),
            // а dim-карты вернут свою прозрачность
            let baseAlpha = 1;
            if (base && !base.destroyed) { baseAlpha = base.alpha; base.alpha = 0; }
            const node = cardFace(ctx, id, { scale: 0.5 });
            node.eventMode = "none"; // клики проходят к карте под копией
            const pp = PANE_POS[side];
            const st = (side === "left" ? leftPane : rightPane).state;
            const iy = -st.t * Math.max(0, st.contentH - st.viewH);
            node.position.set(pp.x + cx, Math.max(270, Math.min(810, pp.y + cy + iy)));
            root.addChild(node);
            zoom = { id, node, cur: 0.5, tgt: 1, base, baseAlpha };
        }
        function hideZoom(immediate) {
            if (!zoom) return;
            if (immediate) {
                if (zoom.base && !zoom.base.destroyed) zoom.base.alpha = zoom.baseAlpha;
                zoom.node.destroy({ children: true });
                zoom = null;
            } else zoom.tgt = 0.5; // плавно уменьшится в update, затем удалится
        }

        function countIn(id) {
            return G.deck.reduce((n, c) => n + (c === id ? 1 : 0), 0);
        }
        // герой забега и его стихии: карты других стихий в колоду класть
        // нельзя (герой определяет стихии колоды — просил юзер)
        const heroDef = () => HEROES[G.heroId] || HEROES.gorbag;
        const heroElemOk = (id) => !!CARDS[id] && heroDef().elems.includes(CARDS[id].elem);
        function passes(id) {
            const def = CARDS[id];
            if (!def) return false;
            if (filters.type && def.type !== filters.type) return false;
            if (filters.cost && def.cost !== filters.cost) return false;
            if (filters.rarity && def.rarity !== filters.rarity) return false;
            if (filters.elem && def.elem !== filters.elem) return false;
            return true;
        }
        function save() { G.persistMeta(); } // колода героя — она же G.deck

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
                const cx = 93 + col * 198, cy = 138 + rowI * 307.5;
                const card = cardFace(ctx, id, { scale: 0.5, dim: locked });
                card.position.set(cx, cy);
                card.eventMode = "static";
                card.on("pointertap", () => api.remove(id));
                card.on("pointerover", () => showZoom(id, "left", cx, cy, card));
                card.on("pointerout", () => hideZoom(false));
                c.addChild(card);
                const cnt = T(`×${countIn(id)}`, 19, locked ? 0x8a7c5e : 0xd8c79d);
                cnt.anchor.set(0.5, 0);
                cnt.position.set(cx, cy + 138); // под картой (×1.5 от базы 1280)
                cnt.eventMode = "none";
                c.addChild(cnt);
                paneCards.left.push({ id, node: card, cx, cy, labelY: cy + 138 });
            });
            const rowsN = Math.ceil(ids.length / 3);
            c.userData = { contentH: ids.length ? (138 + (rowsN - 1) * 307.5 + 232.5) : 60 };
            return c;
        }

        // ── правое окно: сетка коллекции ───────────────────────────────────
        // Показываются только карты, которые ЕСТЬ у игрока (просил юзер):
        // счётчик коллекции — все добытые копии, включая вложенные в колоду.
        function buildCollection() {
            const c = new PIXI.Container();
            paneCards.right = [];
            const ids = Object.keys(CARDS)
                .filter((id) => (G.collection[id] || 0) > 0 && passes(id));
            ids.forEach((id, i) => {
                const col = i % 5, rowI = (i / 5) | 0;
                const owned = G.collection[id] || 0;
                const inDeck = countIn(id);
                const capped = inDeck >= DECK_COPIES; // лимит одинаковых карт
                const elemOk = heroElemOk(id);
                const canAdd = owned > inDeck && !capped && G.deck.length < DECK_MAX && elemOk;
                const cx = 93 + col * 198, cy = 138 + rowI * 307.5;
                const card = cardFace(ctx, id, {
                    scale: 0.5, dim: owned <= inDeck || capped || !elemOk,
                });
                card.position.set(cx, cy);
                card.eventMode = "static"; // ховер-зум — на любой карте
                card.on("pointerover", () => showZoom(id, "right", cx, cy, card));
                card.on("pointerout", () => hideZoom(false));
                c.addChild(card);
                const cnt = T(t("deck.owned", { n: owned }), 19, canAdd ? 0xd8c79d : 0x8a7c5e);
                cnt.anchor.set(0.5, 0);
                cnt.position.set(cx, cy + 138); // под картой (×1.5 от базы 1280)
                cnt.eventMode = "none";
                c.addChild(cnt);
                paneCards.right.push({ id, node: card, cx, cy, labelY: cy + 138 });
                if (inDeck > 0) {
                    const mark = T(`+${inDeck}`, 22, 0x9fd489);
                    mark.anchor.set(0.5);
                    mark.position.set(cx + 69, cy - 102);
                    mark.eventMode = "none";
                    c.addChild(mark);
                }
                if (canAdd) card.on("pointertap", () => api.add(id));
            });
            if (!ids.length) { // фильтры спрятали всё (или коллекция пуста)
                const empty = T(t("deck.empty"), 22, 0x8a7c5e);
                empty.position.set(93, 36);
                empty.eventMode = "none";
                c.addChild(empty);
            }
            const rowsN = Math.ceil(ids.length / 5);
            c.userData = { contentH: ids.length ? (138 + (rowsN - 1) * 307.5 + 232.5) : 60 };
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

        // Имя героя: стартовые — свои ключи, карты противников — названия
        // энкаунтеров («Банда гоблинов», …)
        const heroName = (id) => t(HERO_ORDER.includes(id)
            ? `hero.${id}.name` : `enc.${id}.title`);
        // Все герои вкладки: свои (всегда есть), завоёванные, затем
        // ещё не взятые — серыми, для виду (просил юзер: просматривать)
        function heroesOwnedOrder() {
            return [...HERO_ORDER,
                ...HERO_FOE_ORDER.filter((id) => G.captured.includes(id)),
                ...HERO_FOE_ORDER.filter((id) => !G.captured.includes(id))];
        }

        // ── вкладка «Герои»: слева активный герой, справа все карты ────────
        function buildHeroesTab() {
            const active = HEROES[G.heroId] || HEROES.gorbag;
            // левая рамка: карточка активного героя и его данные
            const left = new PIXI.Graphics();
            left.roundRect(72, 129, 645, 888, 15);
            left.fill({ color: 0x171310, alpha: 0.92 });
            left.stroke({ width: 3, color: 0x6b5c40 });
            root.addChild(left);
            const nameT = T(heroName(active.id), 40, 0xf0c96a,
                { stroke: { color: 0x241505, width: 7 } });
            nameT.anchor.set(0.5, 0);
            nameT.position.set(394, 165);
            nameT.eventMode = "none";
            fit(nameT, 600, 34);
            root.addChild(nameT);
            const face = new PIXI.Sprite(uiTex(`heroes/${active.img}.png`));
            face.anchor.set(0.5, 0);
            face.scale.set(1); // натуральный размер 230×338
            face.position.set(215, 235);
            face.eventMode = "none";
            root.addChild(face);
            const statY = 245;
            const lines = [
                t("hero.baseLine", { n: active.baseHp }),
                t("hero.elemLine", { elems: active.elems.map((e) => t("elem." + e)).join(", ") }),
                t("filter.rarity") + ": " + t(`rarity.${active.rarity}`),
                t("heroes.deckCount", { n: G.heroDecksOf()[active.id]
                    ? G.heroDecksOf()[active.id].length : 0 }),
            ];
            lines.forEach((s, i) => {
                const ln = T(s, 24, 0xd8c79d);
                ln.position.set(360, statY + i * 36);
                ln.eventMode = "none";
                fit(ln, 330, 12);
                root.addChild(ln);
            });
            const abil = T(t("hero.abilityLabel", { text: t(`hero.${active.id}.ability`) }),
                21, 0xbfd489, { wordWrap: true, wordWrapWidth: 330, align: "left" });
            abil.position.set(360, statY + lines.length * 36 + 14);
            abil.eventMode = "none";
            root.addChild(abil);
            // своя колода ещё не собрана — подсказка (завоёванные герои
            // начинают с пустой колодой, просил юзер); ниже текста
            // способности — у длинных способностей он высок
            if ((G.heroDecksOf()[active.id] || []).length === 0) {
                const warn = T(t("heroes.emptyDeck"), 20, 0xffb26e,
                    { wordWrap: true, wordWrapWidth: 330 });
                warn.position.set(360, abil.y + abil.height + 14);
                warn.eventMode = "none";
                root.addChild(warn);
            }
            if (HERO_ORDER.includes(active.id) || G.captured.includes(active.id)) {
                if (G.heroId === active.id) {
                    const mark = T(t("heroes.active"), 32, 0xf0c96a,
                        { stroke: { color: 0x241505, width: 6 } });
                    mark.anchor.set(0.5);
                    mark.position.set(394, 930);
                    mark.eventMode = "none";
                    root.addChild(mark);
                } else {
                    root.addChild(button(ctx, {
                        tex: "button_menu.png", label: t("heroes.pick"), x: 394, y: 930, scale: 1,
                        onTap: () => api.setActive(active.id),
                    }));
                }
            }

            // правая рамка: сетка всех карт персонажей
            const right = new PIXI.Graphics();
            right.roundRect(762, 129, 1086, 888, 15);
            right.fill({ color: 0x171310, alpha: 0.92 });
            right.stroke({ width: 3, color: 0x6b5c40 });
            root.addChild(right);
            const sub = T(t("heroes.subtitle"), 22, 0x8a7c5e);
            sub.anchor.set(0.5, 0);
            sub.position.set(1305, 150);
            sub.eventMode = "none";
            fit(sub, 1000, 14);
            root.addChild(sub);
            const ids = heroesOwnedOrder();
            ids.forEach((id, i) => {
                const h = HEROES[id];
                const owned = HERO_ORDER.includes(id) || G.captured.includes(id);
                const col = i % 4, rowI = (i / 4) | 0;
                const cx = 900 + col * 250, cy = 320 + rowI * 300;
                const c = new PIXI.Container();
                c.position.set(cx, cy);
                if (G.heroId === id) { // активный — золотая рамка
                    const glow = new PIXI.Graphics();
                    glow.roundRect(-76, -110, 152, 220, 10);
                    glow.stroke({ width: 5, color: 0xf0c96a });
                    glow.eventMode = "none";
                    c.addChild(glow);
                }
                const card = new PIXI.Sprite(uiTex(`heroes/${h.img}.png`));
                card.anchor.set(0.5, 0.5);
                card.scale.set(0.62); // 230×338 → ~143×210
                card.alpha = owned ? 1 : 0.4; // не завоёван — серым
                c.addChild(card);
                if (owned) {
                    c.eventMode = "static";
                    if (G.heroId !== id) {
                        c.on("pointertap", () => api.setActive(id));
                        c.on("pointerover", () => { card.scale.set(0.68); });
                        c.on("pointerout", () => { card.scale.set(0.62); });
                    }
                }
                const nm = T(owned ? heroName(id) : t("heroes.locked"), 20,
                    G.heroId === id ? 0xf0c96a : owned ? 0xd8c79d : 0x8a7c5e,
                    { stroke: { color: 0x1c1207, width: 4.5 } });
                nm.anchor.set(0.5, 0);
                nm.position.set(0, 112);
                nm.eventMode = "none";
                fit(nm, 230, 10);
                c.addChild(nm);
                root.addChild(c);
                heroCards.push({ id, node: c });
            });
        }

        function rebuild() {
            hideZoom(true); // смена вкладки — ховер-зум мимо (узлы умрут с root)
            if (root) root.destroy({ children: true });
            heroCards.length = 0;
            root = new PIXI.Container();
            root.eventMode = "static";
            root.addChild(dimBg(ctx, 0.85));

            const title = T(t(tab === "heroes" ? "heroes.title" : "deck.title"),
                51, 0xf0c96a, { stroke: { color: 0x241505, width: 9 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 21);
            title.eventMode = "none";
            fit(title, 1350, 30);
            root.addChild(title);

            // вкладки «Колода» / «Герои» (просил юзер): чипы по центру
            // под заголовком
            let chipX = 795;
            for (const [key, label] of [["deck", t("deck.tabDeck")], ["heroes", t("deck.tabHeroes")]]) {
                const ch = chip(ctx, {
                    label, x: chipX, y: 95, active: tab === key,
                    onTap: () => { if (tab !== key) { tab = key; rebuild(); } },
                });
                chipX += ch.userData.w + 18;
                root.addChild(ch);
            }

            if (tab === "heroes") {
                buildHeroesTab();
            } else {
            // левая рамка + заголовок + скролл-панель
            const left = new PIXI.Graphics();
            left.roundRect(72, 129, 645, 888, 15);
            left.fill({ color: 0x171310, alpha: 0.92 });
            left.stroke({ width: 3, color: 0x6b5c40 });
            root.addChild(left);
            // шапка левой панели: карточка героя (просил юзер) + счётчики
            // колоды правее. Герой определяет стихии, разрешённые в колоде.
            // Всё компактно до верха карт первого ряда (y=236). Держатель
            // карточки добавляем ПОСЛЕ панели: в увеличенном виде карточка
            // накрывает счётчики, а не уходит под них
            const hd = heroDef();
            const heroHolder = new PIXI.Container();
            heroHolder.position.set(146, 130);
            heroHolder.hitArea = new PIXI.Rectangle(0, 0, 71, 105); // исходное место
            const heroCard = new PIXI.Sprite(uiTex(`heroes/${hd.img}.png`));
            heroCard.anchor.set(0, 0);
            heroCard.scale.set(105 / heroCard.texture.height); // ~71×105
            heroCard.eventMode = "none";
            heroHolder.addChild(heroCard);
            ctx.heroHover(heroHolder, heroCard, 0, 0);
            const deckH = T("", 30, 0xf3e6c2);
            deckH.position.set(240, 148);
            deckH.eventMode = "none";
            root.addChild(deckH);
            const minH = T("", 19, 0x8a7c5e);
            minH.position.set(500, 156);
            minH.eventMode = "none";
            fit(minH, 210, 13);
            root.addChild(minH);
            const abilT = T(t(`hero.${hd.id}.ability`), 17, 0x8a7c5e);
            abilT.position.set(240, 198);
            abilT.eventMode = "none";
            fit(abilT, 460, 13); // одна строка — не наезжает на карты колоды
            root.addChild(abilT);
            headerRef = { deck: deckH, min: minH };
            leftPane = scrollPane(ctx, { x: 90, y: 222, w: 609, h: 774, onScroll: () => hideZoom(false) });
            root.addChild(leftPane.node);
            root.addChild(heroHolder);

            // правая рамка + фильтры + скролл-панель
            const right = new PIXI.Graphics();
            right.roundRect(762, 129, 1086, 888, 15);
            right.fill({ color: 0x171310, alpha: 0.92 });
            right.stroke({ width: 3, color: 0x6b5c40 });
            root.addChild(right);

            const hint = T(t("deck.hint"), 19, 0x8a7c5e, { wordWrap: true, wordWrapWidth: 1035 });
            hint.position.set(786, 978);
            hint.eventMode = "none";
            root.addChild(hint);

            rightPane = scrollPane(ctx, { x: 780, y: 279, w: 1050, h: 684, onScroll: () => hideZoom(false) });
            root.addChild(rightPane.node);

            rebuildChips();
            const lc = buildDeckList();
            leftPane.setContent(lc, lc.userData.contentH);
            const rc = buildCollection();
            rightPane.setContent(rc, rc.userData.contentH);
            headerText();
            }

            root.addChild(button(ctx, {
                tex: "button_menu.png", label: t("deck.back"), x: 165, y: 78, scale: 1,
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
            elemSprites.length = 0;
            for (const n of root.children.slice()) {
                if (n.userData && n.userData.isChip) root.removeChild(n);
                else if (n.style && n.style.fontSize === 19 && n.y >= 138 && n.y <= 270 && n.x >= 786) {
                    root.removeChild(n); // подписи осей фильтров
                }
            }
            const costs = [...new Set(Object.values(CARDS).map((d) => d.cost))].sort();
            const rows = [
                { y: 144, label: t("filter.type"), key: "type",
                    opts: [["unit", "building", "spell", "trap"].map((v) => ({ value: v, label: t(`type.${v}.short`) }))] },
                { y: 189, label: t("filter.cost"), key: "cost",
                    opts: [costs.map((v) => ({ value: v, label: String(v) }))] },
                { y: 234, label: t("filter.rarity"), key: "rarity",
                    opts: [["common", "rare", "epic"].map((v) => ({ value: v, label: t(`rarity.${v}.short`) }))] },
            ];
            for (const r of rows) {
                let cx = 786;
                const label = T(r.label, 19, 0xcfc4a6);
                label.position.set(cx, r.y + 9);
                label.eventMode = "none";
                root.addChild(label);
                cx += label.width + 15;
                const opts = [{ value: null, label: t("filter.all") }, ...r.opts[0]];
                for (const o of opts) {
                    const active = filters[r.key] === o.value;
                    const ch = chip(ctx, {
                        label: o.label, x: cx, y: r.y, active,
                        onTap: () => { filters[r.key] = o.value; rebuildPanes(); },
                    });
                    ch.userData.isChip = true;
                    root.addChild(ch);
                    cx += ch.userData.w + 9;
                }
            }
            // ── фильтр стихий: ряд из 6 лого в ПРАВОЙ части экрана, на
            // свободном месте над панелью коллекции (просил юзер). Повторный
            // клик по активному лого снимает фильтр (= «Все»).
            for (let i = 0; i < ELEM_KEYS.length; i++) {
                const value = ELEM_KEYS[i];
                const active = filters.elem === value;
                const c2 = new PIXI.Container();
                const g = new PIXI.Graphics();
                g.circle(28.5, 28.5, 28.5);
                g.fill(active ? 0x3a4a2e : 0x2e2822);
                g.stroke({ width: 3, color: active ? 0xa8e890 : 0x6b5c40 });
                g.eventMode = "static";
                g.on("pointertap", () => {
                    if (ctx.sfx) ctx.sfx();
                    filters.elem = filters.elem === value ? null : value;
                    rebuildPanes();
                });
                const sp = new PIXI.Sprite(uiTex(ELEM_LOGO[value]));
                sp.anchor.set(0.5);
                sp.scale.set(45 / sp.texture.width);
                sp.position.set(28.5, 28.5); // центр круга, не угол контейнера
                sp.eventMode = "none";
                if (!active) sp.alpha = 0.6;
                c2.addChild(g, sp);
                c2.position.set(ELEM_X0 + i * STEP, ELEM_Y);
                c2.userData = { isChip: true };
                root.addChild(c2);
                elemBtns.push(g);
                elemSprites.push(sp);
            }
            const cap = T(t("filter.elem"), 19, 0xcfc4a6);
            cap.anchor.set(0.5, 0);
            cap.position.set(ELEM_X0 + (ELEM_KEYS.length - 1) * STEP / 2 + 28.5, ELEM_Y + 66);
            cap.eventMode = "none";
            root.addChild(cap);
        }

        const api = {
            add(id) {
                if (G.deck.length >= DECK_MAX) return false;
                if (!heroElemOk(id)) return false; // стихия не из героя
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
            visibleIds: () => Object.keys(CARDS)
                .filter((id) => (G.collection[id] || 0) > 0 && passes(id)),
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
            // ряд лого стихий (тесты): число, активный фильтр, левый край,
            // фактическая позиция первого лого (должна совпадать с центром круга)
            elemInfo: () => ({
                count: ELEM_KEYS.length, active: filters.elem, x0: ELEM_X0,
                logo: elemSprites[0] ? { x: elemSprites[0].x, y: elemSprites[0].y } : null,
            }),
            elemTap(i) { const g = elemBtns[i]; if (g) g.emit("pointertap"); },
            // герой забега (тесты): id + разрешённые стихии колоды
            heroInfo: () => ({ id: heroDef().id, elems: [...heroDef().elems] }),
            // ── вкладка «Герои» (тесты + смена героя) ──────────────────────
            // сделать героя активным: колода переключается на его собственную
            setActive(id) {
                if (!G.setHero(id)) return false;
                if (ctx.sfx) ctx.sfx();
                // забег жив — активный герой сохраняется в сейве забега
                if (globalThis.GAME_META.loadRun()) G.saveRun();
                rebuild();
                return true;
            },
            heroesState: () => ({
                tab,
                active: G.heroId,
                captured: [...G.captured],
                owned: heroesOwnedOrder(),
                decks: Object.fromEntries(Object.entries(G.heroDecksOf())
                    .map(([k, v]) => [k, v.length])),
                cards: heroCards.map((c) => ({ id: c.id })),
            }),
            heroTap(id) {
                const c = heroCards.find((x) => x.id === id);
                if (c) c.node.emit("pointertap");
            },
            setTab(next) { if (tab !== next) { tab = next; rebuild(); } },
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
                        if (z.tgt === 0.5) {
                            if (z.base && !z.base.destroyed) z.base.alpha = z.baseAlpha;
                            z.node.destroy({ children: true });
                            zoom = null;
                        }
                    }
                    if (zoom) z.node.scale.set(z.cur);
                }
            },
            api,
        };
    }

    globalThis.GAME_DECK = { createDeckScene };
})();
