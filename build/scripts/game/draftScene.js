// СЦЕНА «ДРАФТ» — мини-игра объекта «Карта сокровищ» (просил юзер).
// 12 раундов: игрок кликает 1 из 3 разных карт — она в его временную
// колоду, одна из двух оставшихся уходит сопернику (случайно). Затем бой
// с колодой соперника: победа — вся драфт-колода в коллекцию (это делает
// арена по флагу G.draftBattle), поражение — ничего. Оба исхода ведут
// назад в подземелье; «Уйти» — сдаться до боя, объект не расходуется.
(function () {
    const DRAFT_ROUNDS = 12;
    // Пул драфта — все карты стихии подземелья, в котором найдена карта
    // сокровищ (гоблинские пещеры — Сила, Роща Роста — Рост); служебные
    // карты без лица (gobA/gobC) не драфтятся.
    function draftElemOf(G) {
        const cave = G.dungeon && G.dungeon.cave;
        const info = cave && globalThis.GAME_DATA.CAVES[cave];
        return info ? info.elem : "strength";
    }

    function createDraftScene(ctx) {
        const { scenes, G, ui, scheduler } = ctx;
        const { CARDS } = globalThis.GAME_DATA;
        const { T, fit, cardFace, button } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        let root = null;
        let options = [];   // тройка текущего раунда
        let phase = "pick"; // pick → result → (pick | built)
        let lastPicked = -1, lastEnemy = -1;

        function draftPool() {
            // W54 (спека юзера): «Карта сокровищ» «Рыжего леса» — карты
            // ОБОИХ стихий (elems) и мультицветные; W61 (спека юзера):
            // мультицветные карты встречаются ТОЛЬКО в мультицветных
            // подземельях своего сочетания стихий — набор multi должен
            // совпадать с elems данжа. Прочие данжи драфтят одну стихию
            // (elem), мультицветные в них не попадают
            const cave = G.dungeon && G.dungeon.cave;
            const info = cave && globalThis.GAME_DATA.CAVES[cave];
            const elems = info && info.elems ? info.elems : [draftElemOf(G)];
            const okElem = (c) => c.multi
                ? (elems.length > 1 && c.multi.length === elems.length
                    && c.multi.every((e) => elems.includes(e)))
                : elems.includes(c.elem);
            return Object.keys(CARDS).filter((id) =>
                okElem(CARDS[id]) && CARDS[id].img);
        }

        function pickThree() {
            // правило юзера «не больше 3 одинаковых в колоде»: не предлагаем
            // карту, которую кто-то из двоих уже забрал в трёх экземплярах —
            // иначе она может уйти четвёртой в его драфт-колоду
            const pool = draftPool().filter((id) =>
                G.draft.picks.filter((c) => c === id).length < 3
                && G.draft.ePicks.filter((c) => c === id).length < 3);
            const out = [];
            while (out.length < 3) {
                const id = pool[(Math.random() * pool.length) | 0];
                if (!out.includes(id)) out.push(id);
            }
            return out;
        }

        function choose(i) {
            if (phase !== "pick" || !G.draft || !options[i]) return;
            phase = "result";
            lastPicked = i;
            G.draft.picks.push(options[i]);
            // соперник забирает случайную из двух оставшихся
            const rest = options.map((_, k) => k).filter((k) => k !== i);
            lastEnemy = rest[(Math.random() * rest.length) | 0];
            G.draft.ePicks.push(options[lastEnemy]);
            if (ctx.sfx) ctx.sfx("acid");
            rebuild();
            scheduler.after(0.9, () => {
                if (!root) return; // сцена закрыта («Уйти») — доигрывать некому
                if (G.draft.picks.length >= DRAFT_ROUNDS) {
                    phase = "built";
                    if (ctx.sfx) ctx.sfx("lvlUp");
                    rebuild();
                    scheduler.after(1.3, () => { if (root) launchBattle(); });
                } else {
                    options = pickThree();
                    phase = "pick";
                    lastPicked = -1;
                    lastEnemy = -1;
                    rebuild();
                }
            });
        }

        // Колода собрана: бой с колодой соперника. Арена по G.draftBattle
        // возьмёт колоду игрока из драфта и разыграет итог сама.
        function launchBattle() {
            G.draftBattle = true;
            G.worldFrom = false; // драфт — бой подземелья («Карта сокровищ»)
            G.activeEnemy = { enc: "draft", deck: [...G.draft.ePicks], draft: true };
            G.draft.round = G.draft.picks.length;
            scenes.go("arena");
        }

        function leave() {
            G.draft = null; // объект не расходован — драфт можно начать заново
            scenes.go("dungeon");
        }

        function rebuild() {
            if (root) root.destroy({ children: true });
            root = new PIXI.Container();
            root.eventMode = "static";
            // фон как в меню, поверх — затемнение
            const bg = new PIXI.Sprite(ctx.uiTex("bg_corridor_1.png"));
            const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
            bg.scale.set(s);
            bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
            root.addChild(bg);
            const dim = new PIXI.Graphics();
            dim.rect(-3000, -2000, 7920, 5080);
            dim.fill({ color: 0x000000, alpha: 0.55 });
            root.addChild(dim);

            // W115 (юзер): окно panel7 + фигурная плашка panel8 сверху,
            // выход panel3 внизу по центру (спрайты 1:1 из макета юзера
            // for_work/arts/draft_ref.png; плашка без текста — надпись кодом)
            const win = new PIXI.Sprite(ctx.uiTex("settings/panel7.png"));
            win.anchor.set(0.5);
            win.position.set(340 + 620, 44 + 478); // 1240×956
            win.eventMode = "none";
            root.addChild(win);
            const plaque = new PIXI.Sprite(ctx.uiTex("settings/panel8.png"));
            plaque.anchor.set(0.5);
            plaque.position.set(960, 50); // 484×80
            plaque.eventMode = "none";
            root.addChild(plaque);
            const title = T(t("draft.title"), 32, 0xf0c96a,
                { stroke: { color: 0x241505, width: 5.5 } });
            title.anchor.set(0.5);
            title.position.set(960, 50);
            title.eventMode = "none";
            fit(title, 430);
            root.addChild(title);

            const done = G.draft ? G.draft.picks.length : 0;
            const sub = T(phase === "built"
                ? t("draft.built")
                : t("draft.round", { n: done + 1 }) + " · " + t("draft.pick"),
            30, 0xd8c79d);
            sub.anchor.set(0.5, 0);
            sub.position.set(960, 115);
            sub.eventMode = "none";
            root.addChild(sub);

            // счётчики колод внизу окна
            const counts = T(t("draft.deckCount",
                { n: done, m: G.draft ? G.draft.ePicks.length : 0 }), 30, 0xffe2a8,
            { stroke: { color: 0x1c1207, width: 6 } });
            counts.anchor.set(0.5, 0.5);
            counts.position.set(960, 950);
            counts.eventMode = "none";
            root.addChild(counts);

            if (phase === "built") {
                root.addChild(button(ctx, {
                    tex: "button_menu.png", label: t("draft.tobattle"),
                    x: 960, y: 760, scale: 1,
                    onTap: () => { if (root) launchBattle(); },
                }));
            } else {
                const enemyLabels = [];
                options.forEach((id, i) => {
                    const isMine = phase === "result" && i === lastPicked;
                    const isEnemy = phase === "result" && i === lastEnemy;
                    const card = cardFace(ctx, id, {
                        scale: isMine ? 0.98 : 0.9,
                        dim: phase === "result" && !isMine,
                    });
                    card.position.set(510 + i * 450, 520);
                    if (isMine) {
                        const glow = new PIXI.Graphics();
                        glow.roundRect(-168, -243, 336, 486, 15);
                        glow.stroke({ width: 7.5, color: 0xf0c96a });
                        card.addChildAt(glow, 0);
                    }
                    if (phase === "pick") {
                        card.eventMode = "static";
                        card.on("pointertap", () => choose(i));
                    } else if (isEnemy) {
                        // метка — в корень, НЕ внутрь карты: dim гасит детей
                        // (alpha 0.45), «Сопернику» должна читаться ясно
                        const lbl = T(t("draft.enemyTook"), 26, 0xff9c8c,
                            { stroke: { color: 0x1c1207, width: 6 } });
                        lbl.anchor.set(0.5, 0);
                        lbl.position.set(510 + i * 450, 520 + 250 * 0.9);
                        lbl.eventMode = "none";
                        enemyLabels.push(lbl);
                    }
                    root.addChild(card);
                });
                enemyLabels.forEach((lbl) => root.addChild(lbl));
            }

            root.addChild(button(ctx, {
                tex: "settings/panel3.png", label: t("shop.leave"),
                x: 960, y: 1040, fontSize: 24, // выход внизу по центру (W115)
                onTap: () => { if (root) { root.destroy({ children: true }); root = null; } leave(); },
            }));
            ui.addChild(root);
        }

        const api = {
            // состояние драфта (тесты): раунд, взятые карты, тройка, фаза
            state: () => (G.draft ? {
                round: G.draft.picks.length,
                picks: [...G.draft.picks],
                ePicks: [...G.draft.ePicks],
                options: [...options],
                phase,
                poolSize: draftPool().length,
            } : null),
            pick: (i) => choose(i),
            abort: () => leave(),
        };

        return {
            enter() {
                if (ctx.music) ctx.music("dungeon");
                // прямой заход без объекта (консоль/тесты) — драфт всё равно
                // играбелен: итог просто не найдёт объект, чтобы пометить
                if (!G.draft) G.draft = { picks: [], ePicks: [], objIdx: -1 };
                options = pickThree();
                phase = "pick";
                lastPicked = -1;
                lastEnemy = -1;
                rebuild();
            },
            exit() { if (root) { root.destroy({ children: true }); root = null; } },
            api,
        };
    }

    globalThis.GAME_DRAFT = { createDraftScene, DRAFT_ROUNDS, draftElemOf };
})();
