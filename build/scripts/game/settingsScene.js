// СЦЕНА «НАСТРОЙКИ» — звук, музыка, язык (RU/EN), способ призыва (клик /
// перетаскивание). Панель — переиспользуемый компонент buildPanel: её
// встраивает и сцена из меню, и оверлей прямо в бою (arena.js).
// Значения 0..10 сохраняются в localStorage; звук применяется к мастеру
// движкового аудио.
(function () {
    // Панель настроек: стабильный корень outer, содержимое пересобирается
    // rebuild()-ом (степперы/язык/призыв). onBack — куда ведёт «Назад».
    function buildPanel(ctx, { onBack }) {
        const { G } = ctx;
        const { T, button } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        const outer = new PIXI.Container();
        outer.eventMode = "static";

        function applySound() {
            if (ctx.audio && ctx.audio.setVolume) ctx.audio.setVolume(G.settings.sound / 10);
        }
        function applyMusic() {
            if (ctx.audio && ctx.audio.setMusicVolume) ctx.audio.setMusicVolume(G.settings.music / 10);
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
                    else if (key === "music") applyMusic();
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

        // Сегмент из двух кнопок (язык / способ призыва)
        function segmented(label, y, options, isOn, onPick) {
            const name = T(label, 22, 0xf3e6c2);
            name.anchor.set(1, 0.5);
            name.position.set(520, y);
            name.eventMode = "none";
            outer.addChild(name);
            for (const [code, lab, x, w] of options) {
                const active = isOn(code);
                const b = new PIXI.Graphics();
                b.roundRect(x - w / 2, y - 28, w, 56, 8);
                b.fill(active ? 0x3f5f2a : 0x2e2822);
                b.stroke({ width: 2, color: active ? 0x9fd489 : 0x6b5c40 });
                b.eventMode = "static";
                b.cursor = "pointer";
                b.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onPick(code); });
                const lt = T(lab, 17, active ? 0xe6ffd9 : 0xd8c79d);
                lt.anchor.set(0.5);
                lt.position.set(x, y);
                lt.eventMode = "none";
                outer.addChild(b, lt);
            }
        }

        function rebuild() {
            for (const ch of outer.removeChildren()) ch.destroy({ children: true });

            const title = T(t("settings.title"), 36, 0xf0c96a, { stroke: { color: 0x241505, width: 6 } });
            title.anchor.set(0.5, 0);
            title.position.set(640, 60);
            title.eventMode = "none";
            outer.addChild(title);

            const panel = new PIXI.Graphics();
            panel.roundRect(340, 130, 600, 400, 12);
            panel.fill({ color: 0x171310, alpha: 0.92 });
            panel.stroke({ width: 2, color: 0x6b5c40 });
            panel.eventMode = "static"; // глотает клики мимо рядов
            outer.addChildAt(panel, 0);

            outer.addChild(stepper(t("settings.sound"), "sound", 200));
            outer.addChild(stepper(t("settings.music"), "music", 270));

            segmented(t("settings.lang"), 360,
                [["ru", "РУССКИЙ", 610, 144], ["en", "ENGLISH", 770, 144]],
                (code) => GAME_LOC.lang === code,
                (code) => {
                    if (ctx.sfx) ctx.sfx();
                    G.settings.lang = code;
                    GAME_LOC.setLang(code);
                    save();
                    rebuild();
                });

            // способ призыва: клик по карте → клетка, или перетаскивание
            segmented(t("settings.summon"), 430,
                [[false, t("settings.summonClick"), 610, 144], [true, t("settings.summonDrag"), 770, 144]],
                (v) => !!G.settings.dragSummon === v,
                (v) => {
                    if (ctx.sfx) ctx.sfx();
                    G.settings.dragSummon = !!v;
                    save();
                    rebuild();
                });

            const note = T(t("settings.musicNote"), 13, 0x8a7c5e);
            note.anchor.set(0.5, 0);
            note.position.set(640, 486);
            note.eventMode = "none";
            outer.addChild(note);

            outer.addChild(button(ctx, {
                tex: "button_stone.png", label: t("settings.back"), x: 640, y: 596, scale: 1.0,
                onTap: onBack,
            }));
        }
        rebuild();
        return { node: outer, rebuild, applySound, applyMusic };
    }

    function createSettingsScene(ctx) {
        const { scenes, G, ui } = ctx;
        const { dimBg } = globalThis.GAME_UI;
        let root = null, panel = null;

        // «Назад» возвращает туда, откуда открыли (меню/подземелье)
        function goBack() {
            const to = G.uiReturn || "menu";
            G.uiReturn = null;
            scenes.go(to);
        }

        return {
            enter() {
                panel = buildPanel(ctx, { onBack: goBack });
                panel.applySound();
                root = new PIXI.Container();
                root.eventMode = "static";
                root.addChild(dimBg(ctx, 0.85));
                root.addChild(panel.node);
                ui.addChild(root);
            },
            exit() { if (root) { root.destroy({ children: true }); root = null; } panel = null; },
            api: {
                setStep(key, v) {
                    G.settings[key] = Math.max(0, Math.min(10, v));
                    if (key === "sound") panel && panel.applySound();
                    else if (key === "music") panel && panel.applyMusic();
                    globalThis.GAME_META.saveSettings(G.settings);
                    panel && panel.rebuild();
                },
                setLang(code) {
                    G.settings.lang = code;
                    GAME_LOC.setLang(code);
                    globalThis.GAME_META.saveSettings(G.settings);
                    panel && panel.rebuild();
                },
                setDragSummon(v) {
                    G.settings.dragSummon = !!v;
                    globalThis.GAME_META.saveSettings(G.settings);
                    panel && panel.rebuild();
                },
                state() { return { ...G.settings, lang: GAME_LOC.lang }; },
            },
        };
    }

    globalThis.GAME_SETTINGS_SCENE = { createSettingsScene, buildPanel };
})();
