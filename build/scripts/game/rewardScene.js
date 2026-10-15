// СЦЕНА «ТРОФЕЙ» — после победы в бою: выбор 1 из 3 карт в коллекцию.
// Клик по карте сам ведёт в подземелье (кнопки «Продолжить» нет).
(function () {
    function createRewardScene(ctx) {
        const { scenes, G, ui, scheduler } = ctx;
        const { REWARD_POOL } = globalThis.GAME_DATA;
        const { T, cardFace, dimBg } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        let root = null, options = [], picked = null;

        function pickThree() {
            const pool = [...REWARD_POOL];
            const out = [];
            while (out.length < 3 && pool.length) {
                out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
            }
            return out;
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
            const title = T(t("reward.title"), 60, 0xf0c96a, { stroke: { color: 0x241505, width: 10.5 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 66);
            title.eventMode = "none";
            root.addChild(title);
            const sub = T(t("reward.pick"), 30, 0xd8c79d);
            sub.anchor.set(0.5, 0);
            sub.position.set(960, 159);
            sub.eventMode = "none";
            root.addChild(sub);

            options.forEach((id, i) => {
                const isPicked = picked === i;
                const card = cardFace(ctx, id, {
                    scale: picked === null || isPicked ? 0.92 : 0.78,
                    dim: picked !== null && !isPicked,
                });
                card.position.set(510 + i * 450, 495);
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
            enter() { options = pickThree(); picked = null; rebuild(); },
            exit() { if (root) { root.destroy({ children: true }); root = null; } },
            api,
        };
    }

    globalThis.GAME_REWARD = { createRewardScene };
})();
