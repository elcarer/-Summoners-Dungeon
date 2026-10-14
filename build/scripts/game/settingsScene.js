// СЦЕНА «НАСТРОЙКИ» — звук, музыка, язык (RU/EN). Значения 0..10,
// сохраняются в localStorage; звук применяется к мастеру движкового аудио.
(function () {
    function createSettingsScene(ctx) {
        const { scenes, G, ui } = ctx;
        const { T, button, dimBg } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        let root = null;

        function applySound() {
            if (ctx.audio && ctx.audio.setVolume) ctx.audio.setVolume(G.settings.sound / 10);
        }
        function save() { globalThis.GAME_META.saveSettings(G.settings); }

        // Степпер: [−] ▮▮▮▮▯▯ [+]
        function stepper(label, key, y) {
            const row = new PIXI.Container();
            const name = T(label, 22, 0xf3e6c2);
            name.anchor.set(1, 0.5);
            name.position.set(520, y);
            name.eventMode = "none";
            row.addChild(name);
            const mk = (dx, glyph, delta) => {
                const b = new PIXI.Graphics();
                b.circle(dx, y, 18);
                b.fill(0x2e2822);
                b.stroke({ width: 2, color: 0x6b5c40 });
                b.eventMode = "static";
                b.cursor = "pointer";
                b.on("pointertap", () => {
                    if (ctx.sfx) ctx.sfx();
                    G.settings[key] = Math.max(0, Math.min(10, G.settings[key] + delta));
                    if (key === "sound") applySound();
                    save();
                    rebuild();
                });
                const g = T(glyph, 22, 0xd8c79d);
                g.anchor.set(0.5);
                g.position.set(dx, y);
                g.eventMode = "none";
                row.addChild(b, g);
            };
            mk(570, "−", -1);
            mk(790, "+", 1);
            const bar = new PIXI.Graphics();
            const v = G.settings[key];
            for (let i = 0; i < 10; i++) {
                bar.rect(606 + i * 17, y - 10, 13, 20);
                bar.fill(i < v ? 0x9fd489 : 0x35302a);
            }
            bar.eventMode = "none";
            row.addChild(bar);
            return row;
        }

        function rebuild() {
            if (root) root.destroy({ children: true });
            root = new PIXI.Container();
            root.eventMode = "static";
            root.addChild(dimBg(ctx, 0.85));

            const title = T(t("settings.title"), 36, 0xf0c96a, { stroke: { color: 0x241505, width: 6 } });
            title.anchor.set(0.5, 0);
            title.position.set(640, 60);
            title.eventMode = "none";
            root.addChild(title);

            const panel = new PIXI.Graphics();
            panel.roundRect(340, 130, 600, 400, 12);
            panel.fill({ color: 0x171310, alpha: 0.92 });
            panel.stroke({ width: 2, color: 0x6b5c40 });
            root.addChild(panel);

            root.addChild(stepper(t("settings.sound"), "sound", 200));
            root.addChild(stepper(t("settings.music"), "music", 270));

            const langLabel = T(t("settings.lang"), 22, 0xf3e6c2);
            langLabel.anchor.set(1, 0.5);
            langLabel.position.set(520, 360);
            langLabel.eventMode = "none";
            root.addChild(langLabel);
            for (const [code, label, x] of [["ru", "РУССКИЙ", 610], ["en", "ENGLISH", 770]]) {
                const active = GAME_LOC.lang === code;
                const b = new PIXI.Graphics();
                b.roundRect(x - 72, 332, 144, 56, 8);
                b.fill(active ? 0x3f5f2a : 0x2e2822);
                b.stroke({ width: 2, color: active ? 0x9fd489 : 0x6b5c40 });
                b.eventMode = "static";
                b.cursor = "pointer";
                b.on("pointertap", () => {
                    if (ctx.sfx) ctx.sfx();
                    G.settings.lang = code;
                    GAME_LOC.setLang(code);
                    save();
                    rebuild();
                });
                const lt = T(label, 17, active ? 0xe6ffd9 : 0xd8c79d);
                lt.anchor.set(0.5);
                lt.position.set(x, 360);
                lt.eventMode = "none";
                root.addChild(b, lt);
            }

            const note = T(t("settings.musicNote"), 13, 0x8a7c5e);
            note.anchor.set(0.5, 0);
            note.position.set(640, 452);
            note.eventMode = "none";
            root.addChild(note);

            root.addChild(button(ctx, {
                tex: "button_stone.png", label: t("settings.back"), x: 640, y: 596, scale: 1.0,
                onTap: () => scenes.go("menu"),
            }));
            ui.addChild(root);
        }

        const api = {
            setStep(key, v) {
                G.settings[key] = Math.max(0, Math.min(10, v));
                if (key === "sound") applySound();
                save();
                rebuild();
            },
            setLang(code) {
                G.settings.lang = code;
                GAME_LOC.setLang(code);
                save();
                rebuild();
            },
            state() { return { ...G.settings, lang: GAME_LOC.lang }; },
        };

        return {
            enter() { applySound(); rebuild(); },
            exit() { if (root) { root.destroy({ children: true }); root = null; } },
            api,
        };
    }

    globalThis.GAME_SETTINGS_SCENE = { createSettingsScene };
})();
