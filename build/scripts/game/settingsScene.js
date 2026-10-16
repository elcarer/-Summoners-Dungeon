// СЦЕНА «НАСТРОЙКИ» — звук, музыка, язык (RU/EN), способ призыва (клик /
// перетаскивание). Панель — переиспользуемый компонент buildPanel: её
// встраивает и сцена из меню, и оверлей прямо в бою (arena.js).
// Значения 0..10 сохраняются в localStorage; звук применяется к мастеру
// движкового аудио.
(function () {
    // Панель настроек: стабильный корень outer, содержимое пересобирается
    // rebuild()-ом (степперы/язык/призыв). onBack — куда ведёт «Назад».
    // onQuit — необязательная кнопка «В главное меню» рядом с «Назад»
    // (её передают бой и подземелье; из главного меню она ни к чему).
    function buildPanel(ctx, { onBack, onQuit }) {
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
            const name = T(label, 33, 0xf3e6c2);
            name.anchor.set(1, 0.5);
            name.position.set(780, y);
            name.eventMode = "none";
            row.addChild(name);
            const mk = (dx, glyph, delta) => {
                const b = new PIXI.Graphics();
                b.circle(dx, y, 27);
                b.fill(0x2e2822);
                b.stroke({ width: 3, color: 0x6b5c40 });
                b.eventMode = "static";
                b.on("pointertap", () => {
                    if (ctx.sfx) ctx.sfx();
                    G.settings[key] = Math.max(0, Math.min(10, G.settings[key] + delta));
                    if (key === "sound") applySound();
                    else if (key === "music") applyMusic();
                    save();
                    rebuild();
                });
                const g = T(glyph, 33, 0xd8c79d);
                g.anchor.set(0.5);
                g.position.set(dx, y);
                g.eventMode = "none";
                row.addChild(b, g);
            };
            mk(855, "−", -1);
            mk(1185, "+", 1);
            const bar = new PIXI.Graphics();
            const v = G.settings[key];
            for (let i = 0; i < 10; i++) {
                bar.rect(909 + i * 25.5, y - 15, 19.5, 30);
                bar.fill(i < v ? 0x9fd489 : 0x35302a);
            }
            bar.eventMode = "none";
            row.addChild(bar);
            return row;
        }

        // Сегмент из двух кнопок (язык / способ призыва)
        function segmented(label, y, options, isOn, onPick) {
            const name = T(label, 33, 0xf3e6c2);
            name.anchor.set(1, 0.5);
            name.position.set(780, y);
            name.eventMode = "none";
            outer.addChild(name);
            for (const [code, lab, x, w] of options) {
                const active = isOn(code);
                const b = new PIXI.Graphics();
                b.roundRect(x - w / 2, y - 42, w, 84, 12);
                b.fill(active ? 0x3f5f2a : 0x2e2822);
                b.stroke({ width: 3, color: active ? 0x9fd489 : 0x6b5c40 });
                b.eventMode = "static";
                b.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onPick(code); });
                const lt = T(lab, 25, active ? 0xe6ffd9 : 0xd8c79d);
                lt.anchor.set(0.5);
                lt.position.set(x, y);
                lt.eventMode = "none";
                outer.addChild(b, lt);
            }
        }

        function rebuild() {
            for (const ch of outer.removeChildren()) ch.destroy({ children: true });

            const title = T(t("settings.title"), 54, 0xf0c96a, { stroke: { color: 0x241505, width: 9 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 90);
            title.eventMode = "none";
            outer.addChild(title);

            const panel = new PIXI.Graphics();
            panel.roundRect(510, 195, 900, 600, 18);
            panel.fill({ color: 0x171310, alpha: 0.92 });
            panel.stroke({ width: 3, color: 0x6b5c40 });
            panel.eventMode = "static"; // глотает клики мимо рядов
            outer.addChildAt(panel, 0);

            outer.addChild(stepper(t("settings.sound"), "sound", 292.5));
            outer.addChild(stepper(t("settings.music"), "music", 382.5));
            // скорость анимаций/передвижений боя: 0..10, живое значение —
            // арена читает его каждый кадр (arena.js animK)
            outer.addChild(stepper(t("settings.anim"), "animSpeed", 472.5));

            segmented(t("settings.lang"), 570,
                [["ru", "РУССКИЙ", 915, 216], ["en", "ENGLISH", 1155, 216]],
                (code) => GAME_LOC.lang === code,
                (code) => {
                    if (ctx.sfx) ctx.sfx();
                    G.settings.lang = code;
                    GAME_LOC.setLang(code);
                    save();
                    rebuild();
                });

            // способ призыва: клик по карте → клетка, или перетаскивание
            segmented(t("settings.summon"), 667.5,
                [[false, t("settings.summonClick"), 915, 216], [true, t("settings.summonDrag"), 1155, 216]],
                (v) => !!G.settings.dragSummon === v,
                (v) => {
                    if (ctx.sfx) ctx.sfx();
                    G.settings.dragSummon = !!v;
                    save();
                    rebuild();
                });

            const note = T(t("settings.musicNote"), 19, 0x8a7c5e);
            note.anchor.set(0.5, 0);
            note.position.set(960, 745.5);
            note.eventMode = "none";
            outer.addChild(note);

            if (onQuit) { // выход в главное меню рядом с «Назад» (просил юзер)
                outer.addChild(button(ctx, {
                    tex: "button_menu.png", label: t("settings.back"), x: 735, y: 894, scale: 1.0,
                    onTap: onBack,
                }));
                outer.addChild(button(ctx, {
                    tex: "button_menu.png", label: t("settings.quit"), x: 1185, y: 894, scale: 1.0,
                    onTap: onQuit,
                }));
            } else {
                outer.addChild(button(ctx, {
                    tex: "button_menu.png", label: t("settings.back"), x: 960, y: 894, scale: 1.0,
                    onTap: onBack,
                }));
            }
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
                // «В главное меню» — только когда настройки открыты из
                // подземелья (из меню строка выхода уже есть)
                const quit = G.uiReturn === "dungeon"
                    ? () => { G.uiReturn = null; scenes.go("menu"); }
                    : undefined;
                panel = buildPanel(ctx, { onBack: goBack, onQuit: quit });
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
