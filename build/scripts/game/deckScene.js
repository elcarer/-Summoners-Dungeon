// СЦЕНА «КОЛОДА И КОЛЛЕКЦИЯ» — редактор колоды из меню.
// Слева — текущая колода (клик по строке убирает копию), справа — коллекция
// (клик по карте добавляет копию, если лимиты позволяют). Изменения
// сохраняются в localStorage сразу.
(function () {
    function createDeckScene(ctx) {
        const { scenes, G, ui } = ctx;
        const { CARDS, DECK_MAX, DECK_MIN } = globalThis.GAME_DATA;
        const { T, button, cardFace, dimBg } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        let root = null;

        function countIn(id) {
            return G.deck.reduce((n, c) => n + (c === id ? 1 : 0), 0);
        }
        function uniqueSorted() {
            return [...new Set(G.deck)].sort((a, b) => {
                const da = CARDS[a], db = CARDS[b];
                return (da.cost - db.cost) || a.localeCompare(b);
            });
        }
        function save() { globalThis.GAME_META.saveMeta(G.collection, G.deck); }

        function rebuild() {
            if (root) { root.destroy({ children: true }); }
            root = new PIXI.Container();
            root.eventMode = "static";
            root.addChild(dimBg(ctx, 0.85));

            const title = T(t("deck.title"), 34, 0xf0c96a, { stroke: { color: 0x241505, width: 6 } });
            title.anchor.set(0.5, 0);
            title.position.set(640, 16);
            title.eventMode = "none";
            root.addChild(title);

            // ── левая панель: колода ───────────────────────────────────────
            const left = new PIXI.Graphics();
            left.roundRect(48, 88, 430, 590, 10);
            left.fill({ color: 0x171310, alpha: 0.92 });
            left.stroke({ width: 2, color: 0x6b5c40 });
            root.addChild(left);
            const header = T(t("deck.current", { n: G.deck.length, max: DECK_MAX }), 20, 0xf3e6c2);
            header.position.set(70, 104);
            header.eventMode = "none";
            root.addChild(header);
            const minNote = T(t("deck.min", { min: DECK_MIN }), 13, G.deck.length < DECK_MIN ? 0xff8f6e : 0x8a7c5e);
            minNote.position.set(70, 132);
            minNote.eventMode = "none";
            root.addChild(minNote);

            uniqueSorted().forEach((id, i) => {
                const def = CARDS[id];
                const row = new PIXI.Container();
                const y = 166 + i * 30;
                const chip = new PIXI.Graphics();
                chip.roundRect(0, 2, 22, 20, 4);
                chip.fill(def.color || 0x666666);
                row.addChild(chip);
                const name = T(`${t(`card.${id}.name`)}  ×${countIn(id)}`, 16, 0xf3e6c2);
                name.position.set(32, 0);
                name.eventMode = "none";
                row.addChild(name);
                const cost = T(String(def.cost), 14, 0xbfe0ff);
                cost.position.set(352, 0);
                cost.eventMode = "none";
                row.addChild(cost);
                const type = T(t(`type.${def.type}.short`), 11, 0x8a7c5e);
                type.position.set(376, 4);
                type.eventMode = "none";
                row.addChild(type);
                const hit = new PIXI.Graphics();
                hit.rect(-4, -4, 420, 28);
                hit.fill({ color: 0xffffff, alpha: 0.001 });
                hit.eventMode = "static";
                hit.cursor = "pointer";
                hit.on("pointertap", () => api.remove(id));
                row.addChild(hit);
                row.position.set(66, y);
                root.addChild(row);
            });

            // ── правая зона: коллекция ─────────────────────────────────────
            const right = new PIXI.Graphics();
            right.roundRect(508, 88, 724, 590, 10);
            right.fill({ color: 0x171310, alpha: 0.92 });
            right.stroke({ width: 2, color: 0x6b5c40 });
            root.addChild(right);
            const hint = T(t("deck.hint"), 14, 0x8a7c5e, { wordWrap: true, wordWrapWidth: 680 });
            hint.position.set(530, 104);
            hint.eventMode = "none";
            root.addChild(hint);

            const ids = Object.keys(CARDS);
            ids.forEach((id, i) => {
                const col = i % 5, rowI = (i / 5) | 0;
                const owned = G.collection[id] || 0;
                const inDeck = countIn(id);
                const canAdd = owned > inDeck && G.deck.length < DECK_MAX;
                const cx = 590 + col * 142, cy = 220 + rowI * 220;
                const card = cardFace(ctx, id, { scale: 0.55, dim: owned <= inDeck });
                card.position.set(cx, cy);
                root.addChild(card);
                const cnt = T(t("deck.owned", { n: owned }), 13, canAdd ? 0xd8c79d : 0x8a7c5e);
                cnt.anchor.set(0.5, 0);
                cnt.position.set(cx, cy + 88);
                cnt.eventMode = "none";
                root.addChild(cnt);
                if (inDeck > 0) {
                    const mark = T(`+${inDeck}`, 15, 0x9fd489);
                    mark.anchor.set(0.5);
                    mark.position.set(cx + 52, cy - 78);
                    mark.eventMode = "none";
                    root.addChild(mark);
                }
                if (canAdd) {
                    card.eventMode = "static";
                    card.cursor = "pointer";
                    card.on("pointertap", () => api.add(id));
                }
            });

            root.addChild(button(ctx, {
                tex: "button_stone.png", label: t("deck.back"), x: 110, y: 52, scale: 0.9,
                onTap: () => scenes.go("menu"),
            }));
            ui.addChild(root);
        }

        const api = {
            add(id) {
                if (G.deck.length >= DECK_MAX) return false;
                if (countIn(id) >= (G.collection[id] || 0)) return false;
                G.deck.push(id);
                save();
                rebuild();
                return true;
            },
            remove(id) {
                const i = G.deck.lastIndexOf(id);
                if (i < 0 || G.deck.length <= DECK_MIN) return false;
                G.deck.splice(i, 1);
                save();
                rebuild();
                return true;
            },
            counts() {
                return { deck: G.deck.length, collection: { ...G.collection } };
            },
        };

        return {
            enter() { rebuild(); },
            exit() { if (root) { root.destroy({ children: true }); root = null; } },
            api,
        };
    }

    globalThis.GAME_DECK = { createDeckScene };
})();
