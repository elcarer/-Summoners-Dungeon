// СЦЕНА «ТРОФЕЙ» — после победы в бою: выбор 1 из 3 карт в коллекцию.
// После победы в драфте («Карта сокровищ») — выбор 1 карты из ВСЕЙ
// драфт-колоды (сеткой). Клик по карте сам ведёт в подземелье
// (кнопки «Продолжить» нет).
(function () {
    function createRewardScene(ctx) {
        const { scenes, G, ui, scheduler } = ctx;
        const { REWARD_POOL, CARDS } = globalThis.GAME_DATA;
        const { T, cardFace, dimBg, button } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        let root = null, options = [], picked = null, draftMode = false;

        function pickThree() {
            // Награда — из колоды ПОБЕЖДЁННОГО противника (просил юзер):
            // 3 разные карты именно его колоды (G.rewardDeck пишет арена при
            // победе). Нет данных (старый сейв/прямой заход) — общий пул Силы.
            const pool = G.rewardDeck && G.rewardDeck.length
                ? [...G.rewardDeck] : [...REWARD_POOL];
            for (let i = pool.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            return pool.slice(0, 3);
        }

        function choose(index) {
            if (picked !== null || !options[index]) return;
            picked = index;
            const id = options[index];
            G.collection[id] = (G.collection[id] || 0) + 1;
            globalThis.GAME_META.saveMeta(G.collection, G.deck);
            if (G.saveRun) G.saveRun(); // трофей получен — забег сохранён
            if (ctx.sfx) ctx.sfx("coins");
            rebuild();
            // подсветка выбора видна ~0.7с, затем карта сама ведёт в подземелье
            scheduler.after(0.7, () => {
                if (root && picked !== null) scenes.go("dungeon");
            });
        }

        function rebuild() {
            if (root) root.destroy({ children: true });
            root = new PIXI.Container();
            root.eventMode = "static";
            root.addChild(dimBg(ctx, 0.85));
            // «Колоды» доступна и здесь (просил юзер): перед выбором трофея
            // можно посмотреть колоду и коллекцию. Кнопка запоминает, откуда
            // вышли — тройка карт при возврате НЕ перекидывается заново.
            root.addChild(button(ctx, {
                tex: "button_menu.png", label: t("menu.deck"), x: 165, y: 78, scale: 1,
                onTap: () => {
                    G.rewardKeep = true; // enter() сохранит текущую тройку
                    G.uiReturn = "reward";
                    scenes.go("deck");
                },
            }));
            const title = T(t(draftMode ? "reward.titleDraft" : "reward.title"), 60,
                0xf0c96a, { stroke: { color: 0x241505, width: 10.5 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 66);
            title.eventMode = "none";
            root.addChild(title);
            const sub = T(t(draftMode ? "reward.pickDraft" : "reward.pick"), 30, 0xd8c79d);
            sub.anchor.set(0.5, 0);
            sub.position.set(960, 159);
            sub.eventMode = "none";
            root.addChild(sub);

            options.forEach((id, i) => {
                const isPicked = picked === i;
                let x, y, sc;
                if (draftMode) {
                    // сетка до 4 карт в ряд (драфт-колода — до 12 разных);
                    // строки центрируются, верхней хватает места под заголовком
                    const cols = 4, rowI = (i / cols) | 0;
                    const rows = Math.ceil(options.length / cols);
                    const inRow = Math.min(options.length - rowI * cols, cols);
                    x = 960 + (i % cols - (inRow - 1) / 2) * 250;
                    y = (rows >= 3 ? [330, 610, 890] : rows === 2 ? [470, 750] : [540])[rowI];
                    sc = picked === null || isPicked ? 0.5 : 0.42;
                } else {
                    x = 510 + i * 450;
                    y = 495;
                    sc = picked === null || isPicked ? 0.92 : 0.78;
                }
                const card = cardFace(ctx, id, {
                    scale: sc,
                    dim: picked !== null && !isPicked,
                });
                card.position.set(x, y);
                if (isPicked) {
                    const glow = new PIXI.Graphics();
                    glow.roundRect(-168, -243, 336, 486, 15);
                    glow.stroke({ width: 7.5, color: 0xf0c96a });
                    card.addChildAt(glow, 0);
                }
                if (picked === null) {
                    card.eventMode = "static";
                    card.on("pointertap", () => choose(i));
                }
                root.addChild(card);
            });

            ui.addChild(root);
        }

        const api = {
            options: () => [...options],
            picked: () => picked,
            pick: choose,
        };

        return {
            enter() {
                if (G.rewardKeep) G.rewardKeep = false; // возврат из колоды
                else {
                    // новая победа: в драфте на выбор ВСЯ драфт-колода
                    // (просил юзер), иначе 3 карты колоды побеждённого
                    draftMode = !!G.rewardDraft;
                    G.rewardDraft = false;
                    options = draftMode
                        ? [...new Set(G.rewardDeck || [])].filter((id) => CARDS[id])
                        : pickThree();
                    picked = null;
                }
                rebuild();
            },
            exit() { if (root) { root.destroy({ children: true }); root = null; } },
            api,
        };
    }

    globalThis.GAME_REWARD = { createRewardScene };
})();
