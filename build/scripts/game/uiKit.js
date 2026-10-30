// UI-КИТ — общие элементы сцен: тексты, кнопки, крупная карта, скролл-панель.
(function () {
    const T = (text, size, fill, opts = {}) => new PIXI.Text({
        text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
    });

    // Вписать текст в ширину: сначала уменьшение кегля, при сильном
    // переливе — горизонтальное сжатие (для пиксельного шрифта незаметно).
    function fit(textEl, maxW, minSize = 9) {
        const w0 = textEl.width;
        if (w0 <= maxW || w0 === 0) return textEl;
        const size = textEl.style.fontSize;
        const k = maxW / w0;
        if (size * k >= minSize) {
            textEl.style.fontSize = Math.floor(size * k);
        } else {
            textEl.style.fontSize = minSize;
            textEl.scale.x = Math.min(1, maxW / textEl.width);
        }
        return textEl;
    }

    // Кнопка: спириm + подпись (текст не ловит клики и вписан в ширину).
    // Кнопки button_menu.png — натуральные 274×77 при базовом разрешении
    // 1920×1080 (просил юзер), кегль 45 — как в главном меню (просил юзер:
    // все button_menu в игре одного размера и одним кеглем; слишком
    // длинные надписи ужимает фит).
    function button(ctx, { tex, label, x, y, scale = 1, onTap, fontSize = 45 }) {
        const c = new PIXI.Container();
        const sp = new PIXI.Sprite(ctx.uiTex(tex));
        sp.anchor.set(0.5);
        sp.scale.set(scale);
        c.addChild(sp);
        if (label) {
            const t = T(label, fontSize, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4 } });
            t.anchor.set(0.5);
            t.eventMode = "none";
            // подпись не шире кнопки (у широких надписей ужимается кегль)
            fit(t, sp.texture.width * scale * 0.86, 11);
            c.addChild(t);
        }
        c.position.set(x, y);
        c.eventMode = "static";
        c.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap && onTap(); });
        c.userData = { sprite: sp };
        return c;
    }

    // Чип-кнопка (фильтры): маленькая прямоугольная кнопка с текстом
    function chip(ctx, { label, x, y, active = false, onTap, w = 0, h = 39 }) {
        const c = new PIXI.Container();
        const t = T(label, 19, active ? 0x14200e : 0xd8c79d);
        t.eventMode = "none";
        const tw = w || Math.max(45, Math.ceil(t.width) + 27);
        const g = new PIXI.Graphics();
        g.roundRect(0, 0, tw, h, 9);
        g.fill(active ? 0x7dc95e : 0x2e2822);
        g.stroke({ width: 2.25, color: active ? 0xa8e890 : 0x6b5c40 });
        g.eventMode = "static";
        g.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap && onTap(); });
        c.addChild(g, t);
        t.position.set(tw / 2 - t.width / 2, h / 2 - t.height / 2);
        c.position.set(x, y);
        c.userData = { w: tw, h };
        return c;
    }

    // Рубашка колоды по стихии (просил юзер): Рост — природная
    // (card_nature_back), Мудрость — синяя (card_wisdom_back),
    // Тлен — чёрная (card_decay_back), Честь — белая (card_honor_back),
    // Время — фиолетовая (card_time_back), прочие — гоблинская
    function backTexOf(elem) {
        return elem === "growth" ? "card_nature_back.png"
            : elem === "wisdom" ? "card_wisdom_back.png"
            : elem === "decay" ? "card_decay_back.png"
            : elem === "honor" ? "card_honor_back.png"
            : elem === "time" ? "card_time_back.png"
            : "card_goblin_back.png";
    }

    // Крупная карта (колода/награда). Если у карты есть img — это готовое
    // лицо-картинка (рамка/имя/тексты/редкость нарисованы); иначе —
    // процедурная сборка из рубашки и подписей.
    // Эталонная высота виджета — 495 (картинка 230×338 в масштабе ~1.46);
    // scale у вызывающих сторон — доля от этого эталона.
    function cardFace(ctx, cardId, { scale = 1, dim = false } = {}) {
        const { CARDS } = globalThis.GAME_DATA;
        const def = CARDS[cardId];
        const c = new PIXI.Container();
        if (def.img) {
            const face = new PIXI.Sprite(ctx.uiTex(`cards/${def.img}.png`));
            face.anchor.set(0.5);
            face.scale.set(495 / face.texture.height); // к высоте эталонной рубашки
            c.addChild(face);
            c.scale.set(scale);
            if (dim) c.alpha = 0.45;
            return c;
        }
        // служебные токены (gobA/gobC/ancBear) без лица — рубашка СВОЕЙ
        // стихии (карточка-подсказка при наведении на поле, просил юзер)
        const face = new PIXI.Sprite(ctx.uiTex(backTexOf(def.elem)));
        face.anchor.set(0.5);
        face.scale.set(1.5);
        if (def.type !== "unit") face.tint = def.color || 0xffffff;
        c.addChild(face);
        const plate = new PIXI.Graphics();
        plate.roundRect(-150, -210, 300, 225, 12);
        plate.fill({ color: 0x120d09, alpha: 0.72 });
        c.addChild(plate);
        const name = T(GAME_LOC.t(`card.${cardId}.name`), 30, 0xf3e6c2, { align: "center", wordWrap: true, wordWrapWidth: 285 });
        name.anchor.set(0.5, 0);
        name.position.set(0, -201);
        name.eventMode = "none";
        fit(name, 285, 18);
        c.addChild(name);
        const type = T(GAME_LOC.t(`type.${def.type}`), 21, 0xcfc4a6);
        type.anchor.set(0.5, 0);
        type.position.set(0, -138);
        type.eventMode = "none";
        c.addChild(type);
        const descText = def.type === "unit"
            ? `${def.atk} ⚔   ${def.hp} ♥   ${def.speed} →`
            : GAME_LOC.t(`card.${cardId}.desc`);
        const desc = T(descText, 21, 0xd8c79d, { align: "center", wordWrap: true, wordWrapWidth: 279 });
        desc.anchor.set(0.5, 0);
        desc.position.set(0, -99);
        desc.eventMode = "none";
        c.addChild(desc);
        const cost = new PIXI.Graphics();
        cost.circle(126, -219, 25.5);
        cost.fill(0x2f6fb0);
        cost.stroke({ width: 3.75, color: 0xbfe0ff });
        c.addChild(cost);
        const costT = T(String(def.cost), 30, 0xffffff);
        costT.anchor.set(0.5);
        costT.position.set(126, -219);
        costT.eventMode = "none";
        c.addChild(costT);
        c.scale.set(scale);
        if (dim) c.alpha = 0.45;
        return c;
    }

    // Затемнённый полноэкранный фон сцены-меню
    function dimBg(ctx, alpha = 0.78) {
        const bg = new PIXI.Sprite(ctx.uiTex("bg_corridor_1.png"));
        const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
        bg.scale.set(s);
        bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
        bg.alpha = alpha;
        return bg;
    }

    // ── Скролл-панель: контент + маска + ползунок справа, колесо мыши ──────
    // const pane = scrollPane(ctx, { x, y, w, h, onScroll }); pane.setContent(node);
    // node кладётся с локальным (0,0) — панель сама двигает его по вертикали.
    // onScroll вызывается при каждом перемещении контента (ховер-эффекты
    // вроде зума карт сбрасывают по нему своё состояние).
    function scrollPane(ctx, { x, y, w, h, onScroll }) {
        const root = new PIXI.Container();
        root.position.set(x, y);

        const inner = new PIXI.Container();
        root.addChild(inner);

        const maskG = new PIXI.Graphics();
        maskG.rect(0, 0, w, h);
        maskG.fill(0xffffff);
        root.addChild(maskG);
        inner.mask = maskG;

        const track = new PIXI.Graphics();
        track.rect(w - 9, 0, 7, h);
        track.fill({ color: 0x0d0a08, alpha: 0.85 });
        track.stroke({ width: 1, color: 0x6b5c40 });
        track.eventMode = "none";
        root.addChild(track);

        const handle = new PIXI.Graphics();
        handle.roundRect(w - 10, 0, 9, 30, 3);
        handle.fill(0x9a8a68);
        handle.stroke({ width: 1, color: 0x1c1207 });
        handle.eventMode = "static";
        root.addChild(handle);

        // зона скролла: клики сквозь неё НЕ проходят — контент интерактивен
        const zone = new PIXI.Graphics();
        zone.rect(0, 0, w, h);
        zone.fill({ color: 0xffffff, alpha: 0.001 });
        zone.eventMode = "static";
        zone.on("wheel", (e) => {
            scrollBy((e.deltaY || 0) * 0.6);
        });
        root.addChildAt(zone, 0);

        let contentH = 0, t = 0, dragging = false, explicitH = null;

        function relayout() {
            // высоту даёт setContent: getLocalBounds на свежем (не
            // отрендеренном) контенте врёт до кадра, а в сериях быстрых
            // перерисовок (add/remove в редакторе колоды) падает вовсе —
            // границы меряем только при отсутствии явной высоты
            contentH = explicitH !== null ? explicitH
                : Math.max(0, inner.getLocalBounds().height);
            const max = Math.max(0, contentH - h);
            if (max <= 0) {
                t = 0;
                inner.y = 0;
                handle.visible = track.visible = false;
                return;
            }
            t = Math.min(1, t);
            handle.visible = track.visible = true;
            const hh = Math.max(28, (h / contentH) * h);
            handle.scale.y = hh / 30;
            apply();
        }
        function apply() {
            const max = Math.max(0, contentH - h);
            inner.y = -t * max;
            handle.y = t * (h - handle.height);
            if (onScroll) onScroll();
        }
        function scrollBy(dy) {
            const max = Math.max(0, contentH - h);
            if (max <= 0) return;
            t = Math.max(0, Math.min(1, t + dy / max));
            apply();
        }

        handle.on("pointerdown", () => { dragging = true; });
        handle.on("globalpointermove", (e) => {
            if (!dragging) return;
            const local = root.toLocal(e.global);
            t = Math.max(0, Math.min(1, (local.y - handle.height / 2) / (h - handle.height)));
            apply();
        });
        window.addEventListener("pointerup", () => { dragging = false; });
        track.eventMode = "static";
        track.on("pointertap", (e) => {
            const local = root.toLocal(e.global);
            t = Math.max(0, Math.min(1, (local.y - handle.height / 2) / Math.max(1, h - handle.height)));
            apply();
        });

        return {
            node: root,
            // contentH — явная высота контента (Pixi v8 getLocalBounds на
            // свежих Text/Graphics врёт до рендера); без неё — фолбэк.
            setContent(node, contentH = null) {
                inner.removeChildren().forEach((ch) => ch.destroy({ children: true }));
                inner.addChild(node);
                explicitH = contentH;
                relayout();
            },
            refresh: relayout,
            scrollBy,
            debug() {
                const b = inner.getLocalBounds();
                return {
                    children: inner.children.length,
                    grandchildren: inner.children[0] && inner.children[0].children ? inner.children[0].children.length : 0,
                    bounds: { x: b.x, y: b.y, w: b.width, h: b.height }, contentH,
                };
            },
            get state() { return { t, contentH, viewH: h }; },
        };
    }

    // Имя героя-противника для показа игроку: у героев-врагов id героя и id
    // энкаунтера не всегда совпадают (wisMad ↔ wisBoss) — по ним и ловился
    // «код ссылки» вместо имени в меню трофея. Порядок: enc.<id героя>.title
    // → enc-ключ энкаунтера с этим hero → hero.<id героя>.name.
    function foeTitle(heroId) {
        const direct = `enc.${heroId}.title`;
        if (GAME_LOC.t(direct) !== direct) return GAME_LOC.t(direct);
        const enc = globalThis.GAME_DATA.ENCOUNTERS || {};
        const found = Object.keys(enc).find((k) => enc[k] && enc[k].hero === heroId);
        if (found) return GAME_LOC.t(`enc.${found}.title`);
        return GAME_LOC.t(`hero.${heroId}.name`);
    }

    globalThis.GAME_UI = { T, fit, button, chip, cardFace, backTexOf, dimBg, scrollPane, foeTitle };
})();
