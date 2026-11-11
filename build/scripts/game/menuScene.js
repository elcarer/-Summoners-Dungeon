// СЦЕНЫ «МЕНЮ» и «ВЫБОР ГЕРОЯ» — часть main.js (W64), по образцу
// deckScene/rewardScene: установщик получает общий контекст ctx
// (музыка/текстуры/ui/сцены/G). Подъём забега «Продолжить» —
// ctx.applySavedRun (живёт в main.js рядом с остальной сохранностью).
(function () {
    function createMenuScene(ctx) {
        const { scenes, G, ui, uiTex } = ctx;
        const gameMusic = ctx.music; // музыка сцены: "menu"
        const t = (k, v) => GAME_LOC.t(k, v); // строки — как в main.js
        // ── Сцена «Меню» ───────────────────────────────────────────────────
        let menuRoot = null;
        let menuIntro = null; // тикер появления стартового экрана (W21)
        const T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });
        function menuButton(texName, label, x, y, scale, onTap, fontSize = 45) {
            return globalThis.GAME_UI.button(ctx, { tex: texName, label, x, y, scale, onTap, fontSize });
        }
        scenes.add("menu", {
            enter() {
                gameMusic("menu");
                menuRoot = new PIXI.Container();
                menuRoot.eventMode = "static";
                const bg = new PIXI.Sprite(uiTex("bg_corridor_1.png"));
                const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
                bg.scale.set(s);
                bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
                menuRoot.addChild(bg);

                // Поверх коридора проявляется фон с картами (арт юзера
                // images/ui/start_cards.png): медленное появление с мягким
                // наездом камеры — см. интро-анимацию ниже (W21)
                const cardsBg = new PIXI.Sprite(uiTex("start_cards.png"));
                const cs = Math.max(1920 / cardsBg.texture.width, 1080 / cardsBg.texture.height);
                cardsBg.anchor.set(0.5);
                cardsBg.position.set(960, 540);
                cardsBg.scale.set(cs * 1.06);
                cardsBg.alpha = 0;
                cardsBg.eventMode = "none";
                menuRoot.addChild(cardsBg);

                // Заголовок и кнопки — по референсу юзера (референсы/
                // start_menu.png): «Подземелье»/«призывателей» строками с
                // центрами y≈321/471 (кегль 150 по ширинам 650/804 референса,
                // тонкий штрих), без подзаголовка; кнопки 274×77 столбцом
                // по центру с шагом 90 (центры 630..990), подписи кеглем 45.
                const t1 = T(t("menu.title1"), 150, 0xf0c96a, { stroke: { color: 0x241505, width: 8 } });
                t1.anchor.set(0.5, 0.5);
                t1.position.set(960, 321);
                const t2 = T(t("menu.title2"), 150, 0xf0c96a, { stroke: { color: 0x241505, width: 8 } });
                t2.anchor.set(0.5, 0.5);
                t2.position.set(960, 471);
                t1.eventMode = "none"; t2.eventMode = "none";
                menuRoot.addChild(t1, t2);

                // «Войти» заменён парой «Продолжить»/«Новая игра» (просил юзер):
                // продолжить можно сохранённый забег (sd_run, пишет G.saveRun),
                // новая игра снимает сейв и начинает с 1-го этажа. Кнопки — в
                // натуральном размере спрайта 274×77 (просил юзер).
                const menuInfo = [];
                const addMenuBtn = (label, x, y, onTap) => {
                    const b = menuButton("button_menu.png", label, x, y, 1, onTap, 45);
                    const txt = b.children.find((n) => n.style);
                    const sp = b.userData.sprite;
                    menuInfo.push({
                        label, x, y, scale: sp.scale.x,
                        fontSize: txt ? txt.style.fontSize : null,
                        // ширина спрайта в экранных пикселях (тест базы 1920×1080)
                        physW: Math.round(sp.texture.width * sp.scale.x * ui.scale.x),
                    });
                    menuRoot.addChild(b);
                    return b;
                };
                const contEnabled = !!GAME_META.loadRun();
                const bCont = addMenuBtn(t("menu.continue"), 960, 630, () => {
                    const r = GAME_META.loadRun();
                    if (!contEnabled || !r) return;
                    ctx.applySavedRun(r); // поднятие забега — см. applySavedRun
                });
                const bNew = addMenuBtn(t("menu.newGame"), 960, 720, () => {
                    // герой задаёт стихию/стартовую колоду/жизни базы —
                    // сначала выбор героя (юзер)
                    scenes.go("heroPick");
                });
                const bDeck = addMenuBtn(t("menu.deck"), 960, 810, () => scenes.go("deck"));
                const bSet = addMenuBtn(t("menu.settings"), 960, 900, () => scenes.go("settings"));
                const bExit = addMenuBtn(t("menu.exit"), 960, 990, () => {
                    // выйти по-настоящему: в Electron window.close() закрывает
                    // окно (и приложение), браузер обычно запрещает закрытие
                    // вкладки, открытой не скриптом — тогда остаётся «До встречи»
                    try { window.close(); } catch (e) { /* блокировка браузера */ }
                    setTimeout(() => {
                        if (menuRoot && !window.closed)
                            menuRoot.userData.bye.visible = true;
                    }, 250);
                });
                // хендл для смоука: подписи/размеры кнопок, заголовок, нажатие
                window.__GAME.menu = {
                    buttons: () => menuInfo.map((b) => ({ ...b })),
                    titles: () => [t1, t2].map((n) => ({
                        text: n.text, x: n.x, y: n.y,
                        fontSize: n.style.fontSize, stroke: n.style.stroke.width,
                    })),
                    texts: () => menuRoot.children.filter((n) => n.text).map((n) => n.text),
                    continueEnabled: () => contEnabled,
                    press(name) {
                        const b = name === "continue" ? bCont : name === "newGame" ? bNew : null;
                        if (b) b.emit("pointertap");
                    },
                    // тест-хук W22: узел кнопки меню (свечение addGlow)
                    btn(name) {
                        return name === "continue" ? bCont
                            : name === "newGame" ? bNew
                            : name === "deck" ? bDeck
                            : name === "settings" ? bSet
                            : name === "exit" ? bExit : null;
                    },
                    intro: () => ({
                        t: Math.round(introT * 100) / 100, done: !!introDone,
                        cards: {
                            alpha: Math.round(cardsBg.alpha * 100) / 100,
                            scale: Math.round(cardsBg.scale.x * 1000) / 1000,
                        },
                        items: reveals.map((r) => Math.round(r.node.alpha * 100) / 100),
                    }),
                };

                const bye = T(t("menu.bye"), 33, 0xffe2a8, { stroke: { color: 0x1c1207, width: 8 } });
                bye.anchor.set(0.5);
                bye.position.set(960, 1059);
                bye.visible = false;
                bye.eventMode = "none";
                menuRoot.addChild(bye);
                menuRoot.userData = { bye };
                const ver = T("v0.2 · zero_engine", 21, 0x8a7c5e);
                ver.position.set(18, 1050);
                ver.eventMode = "none";
                menuRoot.addChild(ver);
                ui.addChild(menuRoot);
                ctx.worldContainer.visible = false;

                // ── Появление стартового экрана (W21, просил юзер) ─────────
                // Сначала виден только коридор; поверх плавно проявляется
                // фон с картами (fade + мягкий наезд камеры 1.06 → 1);
                // затем по очереди проявляются заголовок, кнопки, версия
                // (fade + лёгкий подъём). Кликабельны с первого кадра.
                const reveals = []; // { node, by, delay, dur, dy, a1 }
                const reveal = (node, delay, dur, dy = 0, a1 = 1) => {
                    node.alpha = 0;
                    node.y += dy;
                    reveals.push({ node, by: node.y - dy, delay, dur, dy, a1 });
                };
                reveal(t1, 1.3, 0.6, 26);
                reveal(t2, 1.5, 0.6, 26);
                reveal(bCont, 1.75, 0.5, 18, contEnabled ? 1 : 0.45);
                reveal(bNew, 1.87, 0.5, 18);
                reveal(bDeck, 1.99, 0.5, 18);
                reveal(bSet, 2.11, 0.5, 18);
                reveal(bExit, 2.23, 0.5, 18);
                reveal(ver, 2.4, 0.4);
                const CARD_DELAY = 0.15, CARD_DUR = 1.35;
                let introT = 0, introDone = false;
                const smooth = (k) => k * k * (3 - 2 * k); // мягкий ease
                menuIntro = () => {
                    // закончилось в прошлый кадр — снимаем отдельным вызовом
                    // (удаление из тикера прямо во время его же вызова
                    // зависит от внутренностей Ticker, не рискуем)
                    if (introDone) {
                        ctx.app.ticker.remove(menuIntro);
                        menuIntro = null;
                        return;
                    }
                    introT += Math.min(ctx.app.ticker.deltaMS, 100) / 1000;
                    const kc = Math.min(1, Math.max(0, (introT - CARD_DELAY) / CARD_DUR));
                    const ec = smooth(kc);
                    cardsBg.alpha = ec;
                    cardsBg.scale.set(cs * (1.06 - 0.06 * ec));
                    for (const r of reveals) {
                        const k = Math.min(1, Math.max(0, (introT - r.delay) / r.dur));
                        const e = smooth(k);
                        r.node.alpha = r.a1 * e;
                        r.node.y = r.by + r.dy * (1 - e);
                    }
                    introDone = kc >= 1
                        && reveals.every((r) => introT >= r.delay + r.dur);
                };
                ctx.app.ticker.add(menuIntro);
            },
            exit() {
                window.__GAME.menu = null; // кнопки умерли вместе с root
                if (menuIntro) { ctx.app.ticker.remove(menuIntro); menuIntro = null; }
                if (menuRoot) { menuRoot.destroy({ children: true }); menuRoot = null; }
            },
        });

        // ── Сцена «Выбор героя» (новая игра) ──────────────────────────────
        // Герой задаёт жизни базы в бою, стихии колоды (и стартовую
        // колоду) и особую способность (просил юзер). Карточки — полные
        // лица юзера images/heroes/<img>.png 230×338; подписи под ними.
        let epRoot = null;
        scenes.add("heroPick", {
            enter() {
                gameMusic("menu");
                epRoot = new PIXI.Container();
                epRoot.eventMode = "static";
                // фон выбора героя — картинка юзера images/ui/start_back.png
                // (1920×1080, карта мира); лёгкое затемнение — только чтобы
                // карточки героев и заголовок читались
                const bg = new PIXI.Sprite(uiTex("start_back.png"));
                const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
                bg.scale.set(s);
                bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
                epRoot.addChild(bg);
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.22 });
                epRoot.addChild(dim);

                const title = T(t("menu.pickHero"), 96, 0xf0c96a,
                    { stroke: { color: 0x241505, width: 9 } });
                title.anchor.set(0.5, 0);
                title.position.set(960, 26);
                title.eventMode = "none";
                epRoot.addChild(title);
                const sub = T(t("menu.pickHeroSub"), 30, 0xd8c79d,
                    { stroke: { color: 0x1c1207, width: 7 } }); // обводка — читается на пёстрой карте
                sub.anchor.set(0.5, 0);
                sub.position.set(960, 138);
                sub.eventMode = "none";
                epRoot.addChild(sub);

                const cards = [];
                let launching = false; // переход уже запущен — повторные тапы мимо
                // Сетка 3×2 (просил юзер): 5 стартовых героев + пустой слот
                // под будущего героя следующей стихии. Панель 410×430,
                // ряды y=400/855, колонны x=480/960/1440 — всё в кадре 1920×1080
                const PW = 410, PH = 430, GAPX = 70;
                const colX = (k) => 960 + (k % 3 - 1) * (PW + GAPX);
                const rowY = (k) => k < 3 ? 400 : 855;
                GAME_DATA.HERO_ORDER.forEach((id, k) => {
                    const h = GAME_DATA.HEROES[id];
                    const cx = colX(k);
                    const cy = rowY(k);
                    const c = new PIXI.Container();
                    c.position.set(cx, cy);
                    const panel = new PIXI.Graphics();
                    panel.roundRect(-PW / 2, -PH / 2, PW, PH, 22);
                    panel.fill({ color: 0x171310, alpha: 0.94 });
                    panel.stroke({ width: 4, color: 0x6b5c40 });
                    c.addChild(panel);
                    const face = new PIXI.Sprite(uiTex(`heroes/${h.img}.png`));
                    face.anchor.set(0.5, 0);
                    face.scale.set(0.72); // 230×338 → ~166×244
                    face.position.set(0, -200);
                    c.addChild(face);
                    const name = T(t(`hero.${id}.name`), 36, 0xf0c96a,
                        { stroke: { color: 0x241505, width: 6 } });
                    name.anchor.set(0.5, 0);
                    name.position.set(0, 52);
                    name.eventMode = "none";
                    c.addChild(name);
                    const statLine = T(
                        `${t("hero.baseLine", { n: h.baseHp })}   ·   ${
                            t("hero.elemLine", { elems: h.elems.map((e) => t("elem." + e)).join(", ") })
                        }`,
                        20, 0xd8c79d);
                    statLine.anchor.set(0.5, 0);
                    statLine.position.set(0, 98);
                    statLine.eventMode = "none";
                    c.addChild(statLine);
                    const abil = T(t("hero.abilityLabel", { text: t(`hero.${id}.ability`) }),
                        19, 0xbfd489, { wordWrap: true, wordWrapWidth: 372, align: "center" });
                    abil.anchor.set(0.5, 0);
                    abil.position.set(0, 130);
                    abil.eventMode = "none";
                    c.addChild(abil);
                    c.eventMode = "static";
                    // подсветка наведения — отдельная рамка с альфой (повторный
                    // Graphics.stroke дописывает команду, а не заменяет её)
                    const glow = new PIXI.Graphics();
                    glow.roundRect(-PW / 2, -PH / 2, PW, PH, 22);
                    glow.stroke({ width: 5, color: 0xf0c96a });
                    glow.alpha = 0;
                    c.addChild(glow);
                    c.on("pointerover", () => { glow.alpha = 1; });
                    c.on("pointerout", () => { glow.alpha = 0; });
                    c.on("pointertap", () => {
                        if (launching) return;
                        launching = true;
                        epRoot.interactiveChildren = false; // кольцо жнёт
                            // экран — ввод выбора героя закрыт (как
                            // worldLock, W60): тапы по карточкам/«Назад» мимо
                        if (ctx.sfx) ctx.sfx();
                        GAME_META.clearRun();
                        G.resetRun(id);
                        G.saveRun(); // свежий забег сразу сохранён
                        // W94 (юзер): вход в открытый мир — тот же двухфазный
                        // «прожиг», что и при входе в подземелье (W60): первая
                        // половина эффекта (сужающееся кольцо) играет поверх
                        // выбора героя, к её концу сцена сменяется миром, и
                        // доигрывает вторая половина (расширяющееся кольцо),
                        // открывая его экран. Эффект живёт на ctx.ui — общей
                        // подложке сцен — поэтому переживает смену.
                        // Бандл не загрузился — обычный мгновенный переход
                        const FX = globalThis.GAME_FX;
                        const fx = FX && FX.available
                            ? FX.spawn(ctx.ui, "transitions/burn-away",
                                { x: 0, y: 0, size: 1080 })
                            : null;
                        if (fx) {
                            G.world.ringUp = true; // вход мира поднимет
                                // кольцо над своим HUD (как descentFx, W60)
                            setTimeout(() => scenes.go("world"),
                                1250); // кольцо сузилось (CLOSE ≈ 1.2с эффекта)
                        } else {
                            scenes.go("world");
                        }
                    });
                    epRoot.addChild(c);
                    cards.push({ id, node: c, x: cx, y: cy });
                });
                // Пустой слот под героя следующей стихии (просил юзер):
                // приглушённая рамка с «?», без кликов — только пока героев
                // меньше шести (сетка 3×2); Тордин занял свой слот
                if (GAME_DATA.HERO_ORDER.length < 6) {
                    const c = new PIXI.Container();
                    c.position.set(colX(5), rowY(5));
                    const panel = new PIXI.Graphics();
                    panel.roundRect(-PW / 2, -PH / 2, PW, PH, 22);
                    panel.fill({ color: 0x171310, alpha: 0.72 });
                    panel.stroke({ width: 4, color: 0x6b5c40, alpha: 0.6 });
                    c.addChild(panel);
                    const q = T("?", 150, 0x6b5c40);
                    q.anchor.set(0.5);
                    q.position.set(0, -40);
                    q.eventMode = "none";
                    c.addChild(q);
                    const soon = T(t("menu.pickHeroSoon"), 22, 0x8c7f60);
                    soon.anchor.set(0.5, 0);
                    soon.position.set(0, 96);
                    soon.eventMode = "none";
                    c.addChild(soon);
                    c.eventMode = "none";
                    epRoot.addChild(c);
                }
                epRoot.addChild(menuButton("button_menu.png", t("settings.back"), 165, 78, 1,
                    () => scenes.go("menu")));
                window.__GAME.heroPick = {
                    options: () => cards.map((c) => ({ id: c.id, x: c.x, y: c.y })),
                    pick(heroId) {
                        const c = cards.find((x) => x.id === heroId);
                        if (c) c.node.emit("pointertap");
                    },
                };
                ui.addChild(epRoot);
                ctx.worldContainer.visible = false;
            },
            exit() {
                window.__GAME.heroPick = null;
                if (epRoot) { epRoot.destroy({ children: true }); epRoot = null; }
            },
        });
        }

    globalThis.GAME_MENU_SCENE = { createMenuScene };
})();
