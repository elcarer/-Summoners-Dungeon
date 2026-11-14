// СЦЕНА «КОЛОДА И КОЛЛЕКЦИЯ» — редактор колоды из меню.
// Слева — текущая колода карточками (клик по карте убирает копию),
// справа — коллекция (клик добавляет копию), только карты, которые
// есть у игрока. Наведение на карту плавно
// увеличивает её до полного размера (копия поверх панели, маска не режет).
// Фильтры по типу/цене/редкости; стихии — рядом из 6 лого в правой части
// экрана. Фильтры — наборы-переключатели (просил юзер): клик по опции
// добавляет её к выбору, повторный — убирает; внутри оси опции объединяются
// по «ИЛИ», разные оси — по «И». «Все» сбрасывает ось. Оба окна —
// скролл-панели (колесо мыши, ползунок, клик по треку). Сохранение сразу.
// W115 (юзер): окна — спрайты юзера из images/ui/settings/: panel6 (окно
// колоды 640×997, плашка-заголовок вшита в спрайт сверху), panel7 (окно
// коллекции 1240×956), вкладки abutton2 (активная, золотая) / obutton2
// (пассивная, тёмная) 246×85 над окном коллекции, выход — panel3 224×60
// внизу по центру (как в настройках). Плашки сгенерированы БЕЗ текста —
// надписи (Kereru) кладём кодом. Позиции — из макета юзера
// for_work/arts/dec_ref.png (все спрайты 1:1).
(function () {
    function createDeckScene(ctx) {
        const { scenes, G, ui, uiTex } = ctx;
        const { CARDS, DECK_MAX, DECK_MIN, DECK_COPIES, ELEM_LOGO, MULTI_LOGO,
            HEROES, HERO_ORDER, HERO_FOE_ORDER } = globalThis.GAME_DATA;
        const { T, fit, button, chip, cardFace, dimBg, scrollPane } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        // минимум колоды: открытый мир и ГОРОД живут по DECK_MIN = 12
        // (стартовые колоды; город — мирная сцена мира, а не данж — W32
        // юзер: «16 карт+ — правило для подземелья»), подземелья требуют
        // свои 16+ этаж (просил юзер — dataCards.caveDeckFor); редактор
        // показывает минимум контекста
        const deckMinNow = () => (G.dungeon && !G.dungeon.city
            ? globalThis.GAME_DATA.caveDeckFor(
                G.run && G.run.cave, G.run && G.run.floor ? G.run.floor : 1)
            : DECK_MIN);
        let root = null, leftPane = null, rightPane = null, heroesPane = null;
        let tab = "deck"; // вкладка сцены: «Колода» | «Герои» (просил юзер)
        const heroCards = []; // вкладка «Герои»: {id, node} (тесты)
        // Фильтры-наборы: пустой набор = «Все»; несколько значений в оси
        // расширяют выдачу (ИЛИ), разные оси сужают (И)
        const filters = { type: new Set(), cost: new Set(), rarity: new Set(), elem: new Set() };
        const filterOn = (key, value) => filters[key].has(value);
        function toggleFilterOpt(key, value) {
            if (!filters[key]) return false;
            if (filters[key].has(value)) filters[key].delete(value);
            else filters[key].add(value);
            return true;
        }
        function clearFilter(key) { if (filters[key]) filters[key].clear(); }
        // кнопки фильтра стихий: 6 одноцветных + 5 ДВУХЦВЕТНЫХ (арт юзера
        // W74/W75/W82, MULTI_LOGO) — мульти-карты фильтруются по def.elem
        const ELEM_KEYS = [...Object.keys(ELEM_LOGO), ...Object.keys(MULTI_LOGO)];
        // ── геометрия W115 (спрайты 1:1 из макета dec_ref.png) ────────────
        const P6 = { x: 15, y: 9 };    // окно колоды 640×997 (плашка вшита)
        const P7 = { x: 665, y: 48 };  // окно коллекции 1240×956
        const PLAQUE_C = { x: P6.x + 320, y: P6.y + 47 }; // центр плашки panel6
        const TAB_Y = 8, TAB_H = 85;
        const TABS = [ // [ключ вкладки, x] — активная золотая (abutton2)
            ["heroes", 805], ["deck", 1057],
        ];
        const GOLD = 0xf0c96a, PARCH_DIM = 0xd8c79d;
        const BACK_POS = { x: 960, y: 1040 }; // panel3 — выход внизу по центру
        const PANE_POS = { left: { x: 35, y: 245 }, right: { x: 695, y: 255 } };
        // ряд лого стихий (общие константы: использует и rebuildChips, и api).
        // 11 кнопок (5-я мульти-стихия timDec, W82): БЕЗ кружков (поправка
        // юзера W82 — само лого и есть кнопка), лого 40px, шаг 44; ряд —
        // в правой части окна коллекции: x0 = 1860 − (10·44 + 40) = 1380.
        // Слева ряд ограничен чипами «Тип»
        const ELEM_Y = 118, ELEM_ICON = 40, STEP = 44;
        const ELEM_X0 = 1860 - ((ELEM_KEYS.length - 1) * STEP + ELEM_ICON);
        const paneCards = { left: [], right: [] }; // для тестов: {id, node, cx, cy, labelY}
        const elemBtns = []; // спрайты-логотипы (эмитят pointertap в тестах)
        const elemSprites = []; // те же спрайты (тесты: позиция = центр лого)
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
            // центр полной копии клампится внутрь окон (panel6/panel7):
            // полная карта 495px — от 320 до 733 по вертикали
            node.position.set(pp.x + cx, Math.max(320, Math.min(733, pp.y + cy + iy)));
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
        // нельзя (герой определяет стихии колоды — просил юзер).
        // W54 (спека юзера): мультицветные карты (multi: [список стихий])
        // разрешены, если ХОТЯ БЫ ОДНА их стихия есть у героя — двухцветный
        // персонаж Силы и Роста берёт карты обеих стихий и мультицветные;
        // одностихийному герою мульти-карта разрешена по его стихии
        const heroDef = () => HEROES[G.heroId] || HEROES.gorbag;
        const heroElemOk = (id) => {
            const c = CARDS[id];
            if (!c) return false;
            const he = heroDef().elems || [];
            return c.multi
                ? c.multi.some((e) => he.includes(e))
                : he.includes(c.elem);
        };
        function passes(id) {
            const def = CARDS[id];
            if (!def) return false;
            if (filters.type.size && !filters.type.has(def.type)) return false;
            if (filters.cost.size && !filters.cost.has(def.cost)) return false;
            if (filters.rarity.size && !filters.rarity.has(def.rarity)) return false;
            if (filters.elem.size && !filters.elem.has(def.elem)) return false;
            return true;
        }
        function save() { G.persistMeta(); } // колода героя — она же G.deck

        // ── Перелёт карты между панелями (W66, юзер): как взятие карты
        // в бою — лицо карты летит по дуге от исходной карточки к своей
        // новой позиции в другой панели (колода ↔ коллекция). Позиции
        // карточек — paneCards в координатах контента; глобальные получаем
        // как в showZoom: смещение панели + сдвиг скролла
        const flights = []; // { node, fx, fy, tx, ty, life, total }
        const paneGlobal = (side, e) => {
            const st = (side === "left" ? leftPane : rightPane).state;
            const iy = -st.t * Math.max(0, st.contentH - st.viewH);
            return { x: PANE_POS[side].x + e.cx, y: PANE_POS[side].y + e.cy + iy };
        };
        // показать/скрыть карточку панели вместе с её счётчиком (W86)
        const setPaneCardVisible = (e, v) => {
            if (!e) return;
            if (e.node && !e.node.destroyed) e.node.visible = v;
            if (e.label && !e.label.destroyed) e.label.visible = v;
        };
        // конечная карта полёта (по id в ТЕКУЩЕЙ панели — переживает
        // пересборку панелей)
        const destCard = (toSide, id) =>
            (paneCards[toSide] || []).find((x) => x.id === id);
        function flyCard(id, from, toSide) {
            if (!root) return;
            const tgt = destCard(toSide, id);
            // W86 (юзер): конечная карта НЕ видна, пока летит перелёт —
            // видна только летящая карта; на месте она появится после
            // посадки (раньше показывалась сразу под летящей)
            if (tgt) setPaneCardVisible(tgt, false);
            // фильтры могут прятать карту в целевой панели — летим к её шапке
            const to = tgt ? paneGlobal(toSide, tgt)
                : { x: PANE_POS[toSide].x + 300, y: PANE_POS[toSide].y + 110 };
            const node = cardFace(ctx, id, { scale: 0.5 });
            node.eventMode = "none";
            node.position.set(from.x, from.y);
            root.addChild(node);
            flights.push({ node, fx: from.x, fy: from.y, tx: to.x, ty: to.y,
                life: 0.42, total: 0.42, id, toSide });
        }

        // ── левое окно: колода карточками (как коллекция) ──────────────────
        function buildDeckList() {
            const c = new PIXI.Container();
            paneCards.left = [];
            const ids = [...new Set(G.deck)].sort((a, b) => {
                const da = CARDS[a], db = CARDS[b];
                return (da.cost - db.cost) || a.localeCompare(b);
            }).filter(passes);
            const locked = G.deck.length <= deckMinNow(); // минимум — убирать нельзя
            ids.forEach((id, i) => {
                const col = i % 3, rowI = (i / 3) | 0;
                const cx = 75 + col * 198, cy = 138 + rowI * 307.5;
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
                paneCards.left.push({ id, node: card, label: cnt, cx, cy,
                    labelY: cy + 138 });
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
                const cx = 75 + col * 240, cy = 138 + rowI * 307.5;
                const card = cardFace(ctx, id, {
                    scale: 0.5, dim: owned <= inDeck || capped || !elemOk,
                });
                card.position.set(cx, cy);
                card.eventMode = "static"; // ховер-зум — на любой карте
                card.on("pointerover", () => showZoom(id, "right", cx, cy, card));
                card.on("pointerout", () => hideZoom(false));
                c.addChild(card);
                // W60 (юзер): «в коллекции: X/Y» — X свободные копии
                // (не в колоде), Y все копии этого названия
                const cnt = T(t("deck.owned", { n: owned - inDeck, total: owned }),
                    19, canAdd ? 0xd8c79d : 0x8a7c5e);
                cnt.anchor.set(0.5, 0);
                cnt.position.set(cx, cy + 138); // под картой (×1.5 от базы 1280)
                cnt.eventMode = "none";
                c.addChild(cnt);
                paneCards.right.push({ id, node: card, label: cnt, cx, cy,
                    labelY: cy + 138 });
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
            // W86: пересборка создаёт карты видимыми — конечные карты
            // активных полётов снова скрыты до посадки
            for (const f of flights)
                setPaneCardVisible(destCard(f.toSide, f.id), false);
            rebuildChips();
            headerText();
        }

        let headerRef = null;
        function headerText() {
            if (!headerRef) return;
            headerRef.deck.text = t("deck.current", { n: G.deck.length, max: DECK_MAX });
            headerRef.min.text = t("deck.min", { min: deckMinNow() });
            headerRef.min.style.fill = G.deck.length < deckMinNow() ? 0xff8f6e : 0x8a7c5e;
            updateLockHint();
        }

        // ── Замок редактора колоды (просил юзер) ──────────────────────────
        // Вернуться в мир/подземелье с колодой меньше минимума этажа нельзя —
        // бой с такой колодой запрещён (обычный повод — потеря карты после
        // проигрыша). «Назад» молча не пускает, в правом верхнем углу висит
        // подсказка; в меню выход свободный — боя там нет.
        let lockHintRef = null;
        const runReturn = () => G.uiReturn === "dungeon" || G.uiReturn === "world";
        function updateLockHint() {
            if (!lockHintRef) return;
            lockHintRef.text = (runReturn() && G.deck.length < deckMinNow())
                ? t("deck.locked", { min: deckMinNow() }) : "";
        }
        function doBack() {
            if (runReturn() && G.deck.length < deckMinNow()) return;
            const to = G.uiReturn || "menu"; // откуда пришли (меню/мир/подземелье)
            G.uiReturn = null;
            scenes.go(to);
        }

        // Имя героя: стартовые — свои ключи, карты противников — названия
        // энкаунтеров («Банда гоблинов», …); foeTitle ловит несовпадение
        // id героя и id энкаунтера (wisMad ↔ wisBoss)
        const heroName = (id) => t(HERO_ORDER.includes(id)
            ? `hero.${id}.name` : globalThis.GAME_UI.foeTitle(id));
        // Все герои вкладки: выбранный при «Новой игре» стартовый герой
        // (только он, просил юзер) и завоёванные. Карты противников,
        // которые ещё не взяты, не показываются вовсе — как неполученные
        // карты коллекции. Стартовый берём из G.starterId, а НЕ из G.heroId:
        // активного можно сменить на завоёванного, и тогда старый стартер
        // пропадал из коллекции (баг)
        function heroesOwnedOrder() {
            const starter = HERO_ORDER.includes(G.starterId) ? G.starterId
                : (HERO_ORDER.includes(G.heroId) ? G.heroId : HERO_ORDER[0]);
            return [starter, ...HERO_FOE_ORDER.filter((id) => G.captured.includes(id))];
        }

        // ── вкладка «Герои»: слева активный герой (panel6, плашка «Герои»),
        // справа сетка всех карт персонажей (panel7) ────────────────────────
        function buildHeroesTab() {
            const active = HEROES[G.heroId] || HEROES.gorbag;
            const nameT = T(heroName(active.id), 40, 0xf0c96a,
                { stroke: { color: 0x241505, width: 7 } });
            nameT.anchor.set(0.5, 0);
            nameT.position.set(320, 128);
            nameT.eventMode = "none";
            fit(nameT, 480, 34);
            root.addChild(nameT);
            const face = new PIXI.Sprite(uiTex(`heroes/${active.img}.png`));
            face.anchor.set(0.5, 0);
            face.scale.set(1); // натуральный размер 230×338
            face.position.set(190, 180);
            face.eventMode = "none";
            root.addChild(face);
            const statY = 186; // ниже имени (128 + 48px кегля) — не наезжает
            const lines = [
                t("hero.baseLine", { n: active.baseHp }),
                t("hero.elemLine", { elems: active.elems.map((e) => t("elem." + e)).join(", ") }),
                t("filter.rarity") + ": " + t(`rarity.${active.rarity}`),
                t("heroes.deckCount", { n: G.heroDecksOf()[active.id]
                    ? G.heroDecksOf()[active.id].length : 0 }),
            ];
            lines.forEach((s, i) => {
                const ln = T(s, 24, 0xd8c79d);
                ln.position.set(330, statY + i * 36);
                ln.eventMode = "none";
                fit(ln, 270, 12);
                root.addChild(ln);
            });
            const abil = T(t("hero.abilityLabel", { text: t(`hero.${active.id}.ability`) }),
                21, 0xbfd489, { wordWrap: true, wordWrapWidth: 270, align: "left" });
            abil.position.set(330, statY + lines.length * 36 + 14);
            abil.eventMode = "none";
            root.addChild(abil);
            // своя колода ещё не собрана — подсказка (завоёванные герои
            // начинают с пустой колодой, просил юзер); ниже текста
            // способности — у длинных способностей он высок
            if ((G.heroDecksOf()[active.id] || []).length === 0) {
                const warn = T(t("heroes.emptyDeck"), 20, 0xffb26e,
                    { wordWrap: true, wordWrapWidth: 270 });
                warn.position.set(330, abil.y + abil.height + 14);
                warn.eventMode = "none";
                root.addChild(warn);
            }
            if (HERO_ORDER.includes(active.id) || G.captured.includes(active.id)) {
                if (G.heroId === active.id) {
                    const mark = T(t("heroes.active"), 32, 0xf0c96a,
                        { stroke: { color: 0x241505, width: 6 } });
                    mark.anchor.set(0.5);
                    mark.position.set(320, 890);
                    mark.eventMode = "none";
                    root.addChild(mark);
                } else {
                    root.addChild(button(ctx, {
                        tex: "button_menu.png", label: t("heroes.pick"), x: 320, y: 890, scale: 1,
                        onTap: () => api.setActive(active.id),
                    }));
                }
            }

            // правое окно: подзаголовок + сетка всех карт персонажей
            const sub = T(t("heroes.subtitle"), 22, 0x8a7c5e);
            sub.anchor.set(0.5, 0);
            sub.position.set(1285, 118);
            sub.eventMode = "none";
            fit(sub, 1100, 14);
            root.addChild(sub);
            // сетка героев в скролл-панели — как во вкладке карт: карты
            // ростом с карты колоды (276 px), колесо мыши и полоса прокрутки
            heroesPane = scrollPane(ctx, { x: 695, y: 165, w: 1160, h: 780,
                onScroll: () => {} });
            root.addChild(heroesPane.node);
            const list = new PIXI.Container();
            const ids = heroesOwnedOrder();
            ids.forEach((id, i) => {
                const h = HEROES[id];
                const col = i % 4, rowI = (i / 4) | 0;
                // шаг — как в сетках колоды (307.5 там): карта 276 + имя
                // ниже, следующий ряд не наезжает
                const cx = 140 + col * 250, cy = 150 + rowI * 314;
                const c = new PIXI.Container();
                c.position.set(cx, cy);
                if (G.heroId === id) { // активный — золотая рамка
                    const glow = new PIXI.Graphics();
                    glow.roundRect(-101, -146, 202, 292, 10);
                    glow.stroke({ width: 5, color: 0xf0c96a });
                    glow.eventMode = "none";
                    c.addChild(glow);
                }
                const card = new PIXI.Sprite(uiTex(`heroes/${h.img}.png`));
                card.anchor.set(0.5, 0.5);
                card.scale.set(0.82); // 230×338 → ~189×277, рост карт колоды
                c.addChild(card);
                c.eventMode = "static";
                if (G.heroId !== id) {
                    c.on("pointertap", () => api.setActive(id));
                    c.on("pointerover", () => {
                        card.scale.set(0.88);
                        // увеличенная — поверх соседних (просил юзер)
                        if (c.__z === undefined) {
                            c.__z = list.getChildIndex(c);
                            list.addChild(c);
                        }
                    });
                    c.on("pointerout", () => {
                        card.scale.set(0.82);
                        if (c.__z !== undefined && c.parent === list) {
                            list.addChildAt(c, Math.min(c.__z, list.children.length - 1));
                            c.__z = undefined;
                        }
                    });
                }
                const nm = T(heroName(id), 20,
                    G.heroId === id ? 0xf0c96a : 0xd8c79d,
                    { stroke: { color: 0x1c1207, width: 4.5 } });
                nm.anchor.set(0.5, 0);
                nm.position.set(0, 150);
                nm.eventMode = "none";
                fit(nm, 230, 10);
                c.addChild(nm);
                list.addChild(c);
                heroCards.push({ id, node: c });
            });
            const rowsN = Math.ceil(ids.length / 4);
            heroesPane.setContent(list,
                ids.length ? 150 + (rowsN - 1) * 314 + 238 : 60);
        }

        // Вкладки-спрайты над окном коллекции (юзер W115): активная —
        // abutton2 (золотая), пассивная — obutton2 (тёмная). Плашки
        // сгенерированы без текста — надпись кодом (как в настройках W113)
        function buildTabs() {
            for (const [key, x] of TABS) {
                const active = tab === key;
                root.addChild(button(ctx, {
                    tex: active ? "settings/abutton2.png" : "settings/obutton2.png",
                    label: t(key === "deck" ? "deck.tabDeck" : "deck.tabHeroes"),
                    x, y: TAB_Y + TAB_H / 2, fontSize: 24,
                    labelColor: active ? GOLD : PARCH_DIM,
                    onTap: () => { if (tab !== key) { tab = key; rebuild(); } },
                }));
            }
        }

        // Окна-спрайты: panel6 (плашка-заголовок вшита, надпись plaqueKey)
        // + panel7. Оба eventMode "none" — клики проходят к панелям поверх
        function buildWindows(plaqueKey) {
            const win6 = new PIXI.Sprite(uiTex("settings/panel6.png"));
            win6.anchor.set(0.5);
            win6.position.set(P6.x + 320, P6.y + 498.5); // 640×997
            win6.eventMode = "none";
            root.addChild(win6);
            const pl = T(t(plaqueKey), 36, GOLD,
                { stroke: { color: 0x241505, width: 6 } });
            pl.anchor.set(0.5);
            pl.position.set(PLAQUE_C.x, PLAQUE_C.y);
            pl.eventMode = "none";
            fit(pl, 290);
            root.addChild(pl);
            const win7 = new PIXI.Sprite(uiTex("settings/panel7.png"));
            win7.anchor.set(0.5);
            win7.position.set(P7.x + 620, P7.y + 478); // 1240×956
            win7.eventMode = "none";
            root.addChild(win7);
        }

        function rebuild() {
            hideZoom(true); // смена вкладки — ховер-зум мимо (узлы умрут с root)
            if (root) root.destroy({ children: true });
            heroCards.length = 0;
            heroesPane = null; // панель героев живёт только на своей вкладке
            root = new PIXI.Container();
            root.eventMode = "static";
            root.addChild(dimBg(ctx, 0.85));

            buildTabs();
            buildWindows(tab === "heroes" ? "deck.tabHeroes" : "deck.tabDeck");

            // подсказка замка (правый верх экрана, над окном коллекции):
            // пустая, пока колода в норме или выход не в забег
            const lockHint = T("", 21, 0xff8f6e,
                { stroke: { color: 0x1c1207, width: 5 } });
            lockHint.anchor.set(1, 0);
            lockHint.position.set(1880, 18);
            lockHint.eventMode = "none";
            root.addChild(lockHint);
            lockHintRef = lockHint;
            updateLockHint();

            if (tab === "heroes") {
                buildHeroesTab();
            } else {
            // шапка левого окна: карточка героя (просил юзер) + счётчики
            // колоды правее. Герой определяет стихии, разрешённые в колоде.
            // Всё компактно до верха карт первого ряда. Держатель карточки
            // добавляем ПОСЛЕ панели: в увеличенном виде карточка накрывает
            // счётчики, а не уходит под них
            const hd = heroDef();
            const heroHolder = new PIXI.Container();
            heroHolder.position.set(90, 112);
            heroHolder.hitArea = new PIXI.Rectangle(0, 0, 71, 105); // исходное место
            const heroCard = new PIXI.Sprite(uiTex(`heroes/${hd.img}.png`));
            heroCard.anchor.set(0, 0);
            heroCard.scale.set(105 / heroCard.texture.height); // ~71×105
            heroCard.eventMode = "none";
            heroHolder.addChild(heroCard);
            ctx.heroHover(heroHolder, heroCard, 0, 0);
            const deckH = T("", 30, 0xf3e6c2);
            deckH.position.set(180, 122);
            deckH.eventMode = "none";
            root.addChild(deckH);
            const minH = T("", 19, 0x8a7c5e);
            minH.position.set(182, 162);
            minH.eventMode = "none";
            fit(minH, 420, 13);
            root.addChild(minH);
            const abilT = T(t(`hero.${hd.id}.ability`), 17, 0x8a7c5e);
            abilT.position.set(180, 192);
            abilT.eventMode = "none";
            fit(abilT, 420, 13); // одна строка — не наезжает на карты колоды
            root.addChild(abilT);
            headerRef = { deck: deckH, min: minH };
            leftPane = scrollPane(ctx, { x: 35, y: 245, w: 575, h: 720, onScroll: () => hideZoom(false) });
            root.addChild(leftPane.node);
            root.addChild(heroHolder);

            const hint = T(t("deck.hint"), 19, 0x8a7c5e, { wordWrap: true, wordWrapWidth: 1140 });
            hint.position.set(700, 952);
            hint.eventMode = "none";
            root.addChild(hint);

            rightPane = scrollPane(ctx, { x: 695, y: 255, w: 1160, h: 690, onScroll: () => hideZoom(false) });
            root.addChild(rightPane.node);

            rebuildChips();
            const lc = buildDeckList();
            leftPane.setContent(lc, lc.userData.contentH);
            const rc = buildCollection();
            rightPane.setContent(rc, rc.userData.contentH);
            headerText();
            }

            root.addChild(button(ctx, {
                tex: "settings/panel3.png", label: t("deck.back"),
                x: BACK_POS.x, y: BACK_POS.y, fontSize: 24,
                onTap: doBack, // замок минимума — внутри doBack
            }));
            ui.addChild(root);
        }

        function rebuildChips() {
            elemBtns.length = 0;
            elemSprites.length = 0;
            for (const n of root.children.slice()) {
                if (n.userData && n.userData.isChip) root.removeChild(n);
                else if (n.style && n.style.fontSize === 19 && n.y >= 118 && n.y <= 250 && n.x >= 690) {
                    root.removeChild(n); // подписи осей фильтров
                }
            }
            const costs = [...new Set(Object.values(CARDS).map((d) => d.cost))].sort();
            const rows = [
                { y: 118, label: t("filter.type"), key: "type",
                    opts: [["unit", "building", "spell", "trap"].map((v) => ({ value: v, label: t(`type.${v}.short`) }))] },
                { y: 163, label: t("filter.cost"), key: "cost",
                    opts: [costs.map((v) => ({ value: v, label: String(v) }))] },
                { y: 208, label: t("filter.rarity"), key: "rarity",
                    opts: [["common", "rare", "epic"].map((v) => ({ value: v, label: t(`rarity.${v}.short`) }))] },
            ];
            for (const r of rows) {
                let cx = 700;
                const label = T(r.label, 19, 0xcfc4a6);
                label.position.set(cx, r.y + 9);
                label.eventMode = "none";
                root.addChild(label);
                cx += label.width + 15;
                // «Все» — сброс оси; опции — независимые переключатели
                const allCh = chip(ctx, {
                    label: t("filter.all"), x: cx, y: r.y, active: filters[r.key].size === 0,
                    onTap: () => { clearFilter(r.key); rebuildPanes(); },
                });
                allCh.userData.isChip = true;
                allCh.userData.filterKey = r.key;
                allCh.userData.filterValue = null;
                root.addChild(allCh);
                cx += allCh.userData.w + 9;
                for (const o of r.opts[0]) {
                    const active = filterOn(r.key, o.value);
                    const ch = chip(ctx, {
                        label: o.label, x: cx, y: r.y, active,
                        onTap: () => { toggleFilterOpt(r.key, o.value); rebuildPanes(); },
                    });
                    ch.userData.isChip = true;
                    ch.userData.filterKey = r.key;
                    ch.userData.filterValue = o.value;
                    root.addChild(ch);
                    cx += ch.userData.w + 9;
                }
            }
            // ── фильтр стихий: ряд из 6 одноцветных + 5 двухцветных лого в
            // ПРАВОЙ части окна коллекции, под его верхней кромкой
            // (просил юзер). W82 (поправка юзера): кружки вокруг лого
            // УБРАНЫ — само лого (40px) и есть кнопка: клик добавляет
            // стихию к выбору, повторный — убирает; ни одной выбранной =
            // «Все». Неактивное лого приглушено (alpha 0.6), активное —
            // полное
            for (let i = 0; i < ELEM_KEYS.length; i++) {
                const value = ELEM_KEYS[i];
                const active = filterOn("elem", value);
                const c2 = new PIXI.Container();
                const sp = new PIXI.Sprite(uiTex(ELEM_LOGO[value] || MULTI_LOGO[value]));
                sp.anchor.set(0.5);
                sp.scale.set(ELEM_ICON / sp.texture.width);
                sp.position.set(ELEM_ICON / 2, ELEM_ICON / 2); // центр лого
                sp.eventMode = "static";
                sp.on("pointertap", () => {
                    if (ctx.sfx) ctx.sfx();
                    toggleFilterOpt("elem", value);
                    rebuildPanes();
                });
                sp.alpha = active ? 1 : 0.6;
                c2.addChild(sp);
                c2.position.set(ELEM_X0 + i * STEP, ELEM_Y);
                c2.userData = { isChip: true };
                root.addChild(c2);
                elemBtns.push(sp);
                elemSprites.push(sp);
            }
            const cap = T(t("filter.elem"), 19, 0xcfc4a6);
            cap.anchor.set(0.5, 0);
            cap.position.set(ELEM_X0 + (ELEM_KEYS.length - 1) * STEP / 2
                + ELEM_ICON / 2, ELEM_Y + ELEM_ICON + 14);
            cap.eventMode = "none";
            root.addChild(cap);
        }

        const api = {
            // «Назад» программно (тесты): тот же замок минимума при возврате
            // в мир/подземелье
            backTap() { if (!root) return false; doBack(); return true; },
            add(id) {
                if (!root) return false; // вне редактора перерисовывать нечего
                if (G.deck.length >= DECK_MAX) return false;
                if (!heroElemOk(id)) return false; // стихия не из героя
                if (countIn(id) >= (G.collection[id] || 0)) return false;
                if (countIn(id) >= DECK_COPIES) return false; // не более 3 одинаковых
                // источник перелёта — карточка в коллекции (до пересборки)
                const src = paneCards.right.find((e) => e.id === id);
                G.deck.push(id);
                save();
                rebuildPanes();
                if (src) flyCard(id, paneGlobal("right", src), "left");
                return true;
            },
            remove(id) {
                if (!root) return false; // вне редактора перерисовывать нечего
                const i = G.deck.lastIndexOf(id);
                if (i < 0 || G.deck.length <= deckMinNow()) return false;
                // источник перелёта — карточка в колоде (до пересборки:
                // последняя копия из списка исчезнет)
                const src = paneCards.left.find((e) => e.id === id);
                G.deck.splice(i, 1);
                save();
                rebuildPanes();
                if (src) flyCard(id, paneGlobal("left", src), "right");
                return true;
            },
            // совместимость с тестами/старыми вызовами: заменить ось одним
            // значением (null/undefined — сброс). Клики в сцене идут через
            // переключатель — независимое включение/выключение опций.
            setFilter(key, value) {
                if (!filters[key]) return;
                filters[key].clear();
                if (value !== null && value !== undefined) filters[key].add(value);
                rebuildPanes();
            },
            toggleFilter(key, value) {
                if (!toggleFilterOpt(key, value)) return false;
                rebuildPanes();
                return true;
            },
            filters: () => Object.fromEntries(Object.entries(filters)
                .map(([k, set]) => [k, [...set]])),
            // клик по чипу фильтра как мышью (тесты); value=null — «Все»
            filterChipTap(key, value) {
                if (!root) return false;
                const ch = root.children.find((n) => n.userData && n.userData.isChip
                    && n.userData.filterKey === key && n.userData.filterValue === value);
                if (!ch) return false;
                // обработчик чипа висит на его графике-фоне (первый ребёнок)
                (ch.children[0] || ch).emit("pointertap");
                return true;
            },
            visibleIds: () => Object.keys(CARDS)
                .filter((id) => (G.collection[id] || 0) > 0 && passes(id)),
            deckListIds: () => [...new Set(G.deck)].filter(passes),
            counts() { return { deck: G.deck.length, collection: { ...G.collection } }; },
            // минимум колоды текущего контекста (тесты: город 12 / данж 16+)
            minNow: () => deckMinNow(),
            scroll(side, dy) {
                if (side === "heroes") { if (heroesPane) heroesPane.scrollBy(dy); return; }
                (side === "left" ? leftPane : rightPane).scrollBy(dy);
            },
            paneState: (side) => (side === "left" ? leftPane : rightPane).state,
            paneDebug: (side) => (side === "left" ? leftPane : rightPane).debug(),
            // ховер-зум карт: состояние анимации (тесты)
            zoomState: () => (zoom
                ? { id: zoom.id, scale: Math.round(zoom.cur * 1000) / 1000, target: zoom.tgt }
                : null),
            // перелёты карт (тесты W66): живые полёты и их позиция
            flightsState: () => flights.map((f) => ({
                x: Math.round(f.node.x), y: Math.round(f.node.y),
                ms: Math.round(f.life * 1000),
            })),
            // узлы/геометрия карточек панелей (тесты: эмит pointerover/out)
            cardNode: (side, i) => (paneCards[side] && paneCards[side][i] ? paneCards[side][i].node : null),
            cardInfo: (side, i) => {
                const e = paneCards[side] && paneCards[side][i];
                if (!e) return null;
                // W86: видимость лица и счётчика (скрытие на время полёта);
                // живые узлы наружу не отдаём (label — Text с круговыми
                // ссылками, JSON.stringify тестов падает на нём)
                return { ...e, node: undefined, label: undefined,
                    nodeV: e.node && !e.node.destroyed ? e.node.visible : null,
                    labelV: e.label && !e.label.destroyed ? e.label.visible : null };
            },
            // ряд лого стихий (тесты): число, активный фильтр, левый край,
            // фактическая позиция первого лого (должна совпадать с центром круга)
            elemInfo: () => ({
                count: ELEM_KEYS.length,
                // старые тесты ждут строку/ null: одна выбранная стихия = она,
                // иначе null; полный набор — в activeList
                active: filters.elem.size === 1 ? [...filters.elem][0] : null,
                activeList: [...filters.elem],
                x0: ELEM_X0,
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
                starter: G.starterId,
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
                // Эскейп = «Назад» (просил юзер): дублирует кнопку выхода,
                // замок минимума колоды работает как у кнопки (внутри doBack)
                if (ctx.input.wasPressed("Escape")) doBack();
                // перелёты карт колода ↔ коллекция (W66): дуга с подъёмом,
                // ease-out — как полёт карты при взятии в бою
                for (let i = flights.length - 1; i >= 0; i--) {
                    const f = flights[i];
                    if (!f.node || f.node.destroyed) { flights.splice(i, 1); continue; }
                    f.life -= ticker.deltaMS / 1000;
                    const k = 1 - Math.max(0, f.life / f.total);
                    const e = 1 - Math.pow(1 - k, 3);
                    const lift = Math.sin(Math.PI * Math.min(1, k)) * 80;
                    f.node.x = f.fx + (f.tx - f.fx) * e;
                    f.node.y = f.fy + (f.ty - f.fy) * e - lift;
                    if (f.life <= 0) {
                        flights.splice(i, 1);
                        f.node.destroy({ children: true });
                        // посадка (W86): карта появляется на своём месте —
                        // если её не несёт ещё один полёт того же названия
                        if (!flights.some((o) => o.id === f.id
                            && o.toSide === f.toSide))
                            setPaneCardVisible(destCard(f.toSide, f.id), true);
                    }
                }
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
