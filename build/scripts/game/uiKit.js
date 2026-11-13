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
        addGlow(ctx, c, sp);
        c.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap && onTap(); });
        c.userData.sprite = sp;
        return c;
    }

    // Эффект клика-перемещения в мире/подземелье (просил юзер W22):
    // золотое кольцо-волна в точке клика + точки маршрута (центры клеток,
    // мировые px) волной от героя к цели; всё растворяется за ~0.6с.
    // layer — fx-слой сцены поверх объектов. Активные эффекты пишутся
    // в ctx.__clickFxs (тесты).
    function pathFx(ctx, { layer, x, y, points = [] }) {
        if (!layer || layer.destroyed) return;
        const root = new PIXI.Container();
        root.eventMode = "none";
        layer.addChild(root);
        const ring = new PIXI.Graphics();
        ring.circle(0, 0, 10).fill({ color: 0xf0c96a, alpha: 0.25 });
        ring.circle(0, 0, 10).stroke({ width: 2.5, color: 0xf0c96a, alpha: 0.95 });
        ring.position.set(x, y);
        ring.blendMode = "add";
        root.addChild(ring);
        const dots = points.map((p, i) => {
            const g = new PIXI.Graphics();
            g.circle(0, 0, 3.4).fill({ color: 0xf5e2ac, alpha: 0.85 });
            g.position.set(p.x, p.y);
            root.addChild(g);
            return { g, at: i * 0.014 }; // волна появления по маршруту
        });
        const fxs = ctx.__clickFxs || (ctx.__clickFxs = new Set());
        const fx = { x, y, dots: dots.length, alive: true };
        fxs.add(fx);
        let t = 0;
        const LIFE = 0.62, FADE = 0.3;
        const tick = () => {
            if (root.destroyed) { // сцена умерла — эффект уже уничтожен
                ctx.app.ticker.remove(tick);
                fx.alive = false;
                fxs.delete(fx);
                return;
            }
            t += Math.min(ctx.app.ticker.deltaMS, 100) / 1000;
            if (t >= LIFE) {
                ctx.app.ticker.remove(tick);
                root.destroy({ children: true });
                fx.alive = false;
                fxs.delete(fx);
                return;
            }
            const k = Math.min(1, t / 0.5); // кольцо: рост и растворение
            ring.scale.set(0.55 + 1.15 * (1 - Math.pow(1 - k, 3)));
            ring.alpha = 0.95 * (1 - k);
            const out = Math.min(1, Math.max(0, (t - (LIFE - FADE)) / FADE));
            for (const d of dots) {
                const a = Math.min(1, Math.max(0, (t - d.at) / 0.12));
                d.g.alpha = 0.85 * a * (1 - out * 0.9);
                d.g.scale.set(1 - 0.35 * out);
            }
        };
        ctx.app.ticker.add(tick);
    }

    // Жёлтая подсветка кнопки при наведении курсора (просил юзер W22 —
    // правило UI: ВСЕ кнопки игры). W58 (юзер): свет должен идти ПО
    // КОНТУРУ кнопки, а не овалом за ней — раньше это была растянутая
    // радиальная текстура, форм кнопки не повторявшая. Теперь — копия
    // спрайта кнопки чуть большего масштаба под самой кнопкой: золотая
    // кромка повторяет силуэт (прозрачные поля текстуры не светятся).
    // Альфа доводится твином (0.25/кадр). Тикер снимается сам, узлы
    // умерли — сразу. c.userData.glow — доступ тестов.
    function addGlow(ctx, c, sp, margin = 1.08) {
        // Контурная подсветка: клон спрайта кнопки, чуть раздутый —
        // видна только золотая кромка вокруг силуэта
        const glow = new PIXI.Sprite(sp.texture);
        glow.anchor.set(0.5);
        glow.scale.set(sp.scale.x * margin, sp.scale.y * margin);
        glow.tint = 0xffd75e;
        glow.blendMode = "add";
        glow.alpha = 0;
        glow.eventMode = "none";
        c.addChildAt(glow, 0); // под картинкой кнопки — кромка Вокруг
        let a = 0, tgt = 0, running = false;
        const tick = () => {
            if (c.destroyed || glow.destroyed) { // сцена умерла — снимаем
                ctx.app.ticker.remove(tick);
                running = false;
                return;
            }
            a += (tgt - a) * 0.25;
            if (Math.abs(tgt - a) < 0.012) { // дошли — тикер больше не нужен
                a = tgt;
                ctx.app.ticker.remove(tick);
                running = false;
            }
            glow.alpha = a;
        };
        const setGlow = (on) => {
            tgt = on ? 0.8 : 0;
            if (!running) { running = true; ctx.app.ticker.add(tick); }
        };
        c.on("pointerover", () => setGlow(true));
        c.on("pointerout", () => setGlow(false));
        c.userData = c.userData || {};
        c.userData.glow = glow;
        return glow;
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
    // Время — фиолетовая (card_time_back), мультицвет — card_multi_back
    // (ВСЕ составные стихии двухцветных героев и данжей — strGro, groHon,
    // honWis, wisTim, timDec, decStr: до сих пор мультицвет был только у
    // strGro (W54), остальные пять падали в гоблинскую), прочие —
    // гоблинская. Массив elems (двухцветный герой) — тоже мультицвет.
    const MULTI_ELEMS = ["strGro", "groHon", "honWis", "wisTim", "timDec", "decStr"];
    function backTexOf(elem) {
        if (Array.isArray(elem)) {
            return elem.length > 1 ? "card_multi_back.png" : backTexOf(elem[0]);
        }
        return MULTI_ELEMS.includes(elem) ? "card_multi_back.png"
            : elem === "growth" ? "card_nature_back.png"
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

    // ── Ховер-зум карт в меню (правило UI, просил юзер) ────────────────────
    // Наведение на уменьшенную карту: её КОПИЯ поверх плавно растёт до
    // полного размера спрайта (scale 1), базовая карта на время показа
    // прячется через alpha (dim-карта вернёт свою прозрачность; клики
    // остаются на базовой — копия eventMode "none"), уведение — плавное
    // сжатие и удаление копии. Копия кладётся в host — слой окна/сцены,
    // а не в панель со скроллом (маска обрезала бы рост); для карт в
    // скролл-панели вызывающая сторона передаёт позицию с поправкой на
    // скролл (как showZoom в колоде). Обязателен для новых меню с картами.
    // host — узел или функция (сцены пересоздают root в rebuild).
    function cardZoomer(ctx, { host, from = 0.5, to = 1, yMin = 270, yMax = 810 } = {}) {
        // один тикер на игру: зумеры живут в Set на контексте и убираются,
        // как только копия удалена (узел уничтожен при закрытии окна — тоже)
        const zooms = ctx.__cardZooms || (ctx.__cardZooms = new Set());
        if (!ctx.__cardZoomTick) {
            ctx.__cardZoomTick = () => {
                for (const z of zooms) {
                    if (z.node && !z.node.destroyed) {
                        z.cur += (z.tgt - z.cur) * 0.22;
                        if (Math.abs(z.tgt - z.cur) < 0.004) {
                            z.cur = z.tgt;
                            if (z.tgt === 0) z.dead = true; // сжалось — убрать
                        }
                        z.node.scale.set(z.cur);
                    } else z.dead = true; // окно/сцена закрылись
                    if (z.dead) {
                        if (z.base && !z.base.destroyed) z.base.alpha = z.baseAlpha;
                        if (z.node && !z.node.destroyed) z.node.destroy({ children: true });
                        zooms.delete(z);
                    }
                }
            };
            ctx.app.ticker.add(ctx.__cardZoomTick);
        }
        let zoom = null; // активная копия (одна на зумер)
        function hide(immediate) {
            if (!zoom) return;
            if (immediate || zoom.node.destroyed) {
                if (zoom.base && !zoom.base.destroyed) zoom.base.alpha = zoom.baseAlpha;
                if (!zoom.node.destroyed) zoom.node.destroy({ children: true });
                zooms.delete(zoom);
                zoom = null;
            } else zoom.tgt = 0; // плавно сожмётся в тикере, затем удалится
        }
        function show(id, x, y, base, fromScale) {
            hide(true);
            const h = typeof host === "function" ? host() : host;
            if (!h || h.destroyed) return;
            // базу прячем на время показа копии (просил юзер — иначе видны
            // обе); через alpha, не visible: невидимая карта остаётся
            // кликабельной, а dim-карта вернёт свою прозрачность
            let baseAlpha = 1;
            if (base && !base.destroyed) { baseAlpha = base.alpha; base.alpha = 0; }
            const node = cardFace(ctx, id, { scale: fromScale || from });
            node.eventMode = "none"; // клики проходят к карте под копией
            node.position.set(x, Math.max(yMin, Math.min(yMax, y)));
            h.addChild(node); // поверх всех карт host-слоя
            zoom = { id, node, cur: fromScale || from, tgt: to, base, baseAlpha };
            zooms.add(zoom);
        }
        return {
            show,
            hide,
            state: () => (zoom && !zoom.dead // dead — до-улитая тикером запись
                ? { id: zoom.id, scale: Math.round(zoom.cur * 1000) / 1000, target: zoom.tgt }
                : null),
        };
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
        root.addChildAt(zone, 0);

        // колесо — на КОРНЕ панели (W58, юзер): раньше слушатель висел
        // только на подложке-зоне, а событие над картой уходило карте и
        // по соседней ветке (zone — sibling) не доходило; над увеличенной
        // ховер-копией (базовая карта под ней остаётся интерактивной)
        // скролл пропадал вовсе. События карт всплывают: card → контент
        // → inner → root — слушаем здесь. ВАЖНО: notifyTarget в Pixi v8
        // пропускает не-interactive узлы пути (isInteractive: static/
        // dynamic) — без eventMode корень с слушателем молчал бы
        root.eventMode = "static";
        root.on("wheel", (e) => {
            scrollBy((e.deltaY || 0) * 0.6);
        });

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

    globalThis.GAME_UI = { T, fit, button, chip, cardFace, cardZoomer, addGlow, pathFx, backTexOf, dimBg, scrollPane, foeTitle };
})();
