// СЦЕНА «НАСТРОЙКИ» — звук, музыка, анимации (ползунки-ячейки), язык
// (RU/EN), способ призыва (клик / перетаскивание), прогресс (сохранить /
// загрузить). Панель — спрайты юзера (images/ui/settings/: окно panel1,
// титул panel2, «назад» panel3, бирки panel4, трек panel5, ячейка point,
// кнопки abutton — активная / obutton — пассивная), координаты макета
// for_work/arts/example.png (дизайн 1920×1080, всё 1:1). Панель —
// переиспользуемый компонент buildPanel: её встраивает и сцена из меню,
// и оверлей прямо в бою (arenaHud.js).
// Ползунки: значение 0..12 = номер последней золотой ячейки (12 ячеек
// трека, биекция без округлений); звук применяется к мастеру движкового
// аудио.
(function () {
    // Координаты макета (центры, якорь 0.5)
    const TITLE_POS = { x: 960, y: 170 }; // panel2 557×73
    const WIN_POS = { x: 960, y: 598 };   // panel1 1014×639
    const LAB_X = 645;                    // panel4 135×49 — бирки слайдеров
    const TRACK_CX = 1040;                // panel5 552×46 — центр трека
    const TRACK_TY = [370, 435, 500];     // верх треков (шаг 65)
    const CELL_LEFTS = [7, 52, 97, 142, 187, 233, 281, 326, 371, 416, 462, 507];
    const PAIR_ROWS = [627, 705, 785];    // центры рядов пар
    const PAIR_L = 795, PAIR_R = 1126;    // центры кнопок пары
    const BACK_Y = 974;                   // panel3 224×60
    const GOLD = 0xf0c96a, PARCH = 0xf3e6c2, PARCH_DIM = 0xd8c79d, MUTED = 0x8a7c5e;

    function buildPanel(ctx, { onBack, onQuit, onFlee }) {
        const { G } = ctx;
        const { T, button, fit } = globalThis.GAME_UI;
        const t = (k, v) => GAME_LOC.t(k, v);
        const outer = new PIXI.Container();
        outer.eventMode = "static";

        function applySound() {
            if (ctx.audio && ctx.audio.setVolume) ctx.audio.setVolume(G.settings.sound / 12);
        }
        function applyMusic() {
            if (ctx.audio && ctx.audio.setMusicVolume) ctx.audio.setMusicVolume(G.settings.music / 12);
        }
        function save() { globalThis.GAME_META.saveSettings(G.settings); }

        // Спрайт по центру (anchor 0.5); interactive — ловит клики
        function spr(tex, x, y, interactive = false) {
            const s = new PIXI.Sprite(ctx.uiTex(tex));
            s.anchor.set(0.5);
            s.position.set(x, y);
            s.eventMode = interactive ? "static" : "none";
            return s;
        }

        // Подпись с обводкой по центру; maxW — ужать по ширине
        function label(s, x, y, size, color, maxW, strokeW = 4) {
            const el = T(s, size, color, { stroke: { color: 0x1c1207, width: strokeW } });
            el.anchor.set(0.5);
            el.position.set(x, y);
            el.eventMode = "none";
            if (maxW) fit(el, maxW);
            return el;
        }

        // Два режима панели (просил юзер): main — сами настройки,
        // blocks — список блоков сохранений для «Загрузить»
        let panelMode = "main";
        let savedName = null; // имя последнего сохранённого блока (подпись)

        // Титул + окно (окно глотает клики мимо рядов)
        function frame(titleKey) {
            outer.addChildAt(spr("settings/panel1.png", WIN_POS.x, WIN_POS.y, true), 0);
            outer.addChild(spr("settings/panel2.png", TITLE_POS.x, TITLE_POS.y));
            outer.addChild(label(t(titleKey), TITLE_POS.x, TITLE_POS.y, 44, GOLD, 500, 6));
        }

        // Ползунок: бирка + трек с 12 ячейками; клик по треку ставит
        // значение = номер кликнутой ячейки (0..12, клик левее первой — 0);
        // клик по бирке с надписью сбрасывает ползунок в ноль (юзер)
        function slider(labelKey, key, row) {
            const ty = TRACK_TY[row], cy = ty + 23;
            const plate = spr("settings/panel4.png", LAB_X, cy, true);
            plate.cursor = "pointer";
            plate.on("pointertap", () => {
                if (ctx.sfx) ctx.sfx();
                G.settings[key] = 0;
                if (key === "sound") applySound();
                else if (key === "music") applyMusic();
                save();
                rebuild();
            });
            outer.addChild(plate);
            outer.addChild(label(t(labelKey).toUpperCase(), LAB_X, cy, 24, PARCH, 122));
            const track = spr("settings/panel5.png", TRACK_CX, cy, true);
            track.cursor = "pointer";
            track.on("pointertap", (e) => {
                if (ctx.sfx) ctx.sfx();
                // toLocal у спрайта с якорем 0.5 даёт координату от ЦЕНТРА
                // (−276…+276), ячейки же меряны в текстурных (0…552) —
                // сдвигаем на полширины текстуры
                const lx = track.toLocal(e.global).x + track.texture.width / 2;
                let k = 0, best = 1e9;
                for (let i = 0; i < CELL_LEFTS.length; i++) {
                    const d = Math.abs(lx - (CELL_LEFTS[i] + 19));
                    if (d < best) { best = d; k = i; }
                }
                G.settings[key] = (best > 19 && lx < CELL_LEFTS[0]) ? 0 : k + 1;
                if (key === "sound") applySound();
                else if (key === "music") applyMusic();
                save();
                rebuild();
            });
            outer.addChild(track);
            // заполненные (золотые) ячейки поверх тёмных ячеек трека:
            // значение = число золотых ячеек, без округлений
            const fill = Math.max(0, Math.min(12, G.settings[key]));
            for (let i = 0; i < fill; i++) {
                outer.addChild(spr("settings/point.png",
                    TRACK_CX - 276 + CELL_LEFTS[i] + 19, ty + 23.5));
            }
        }

        // Пара кнопок: активная — abutton (золотая кромка), пассивная —
        // obutton; options: [lab, active, x, onTap]
        function pair(y, options) {
            for (const [lab, active, x, onTap] of options) {
                outer.addChild(button(ctx, {
                    tex: active ? "settings/abutton.png" : "settings/obutton.png",
                    label: lab, x, y, fontSize: 22,
                    labelColor: active ? GOLD : PARCH_DIM,
                    onTap,
                }));
            }
        }

        // Нижние кнопки panel3: одна — «Назад» (макет); с миром/подземельем
        // добавляется «В главное меню»; в бою ещё и «Убежать»
        function bottomButtons() {
            const backTap = () => (panelMode === "blocks" ? rebuild("main") : onBack());
            const mk = (x, lab, onTap) => outer.addChild(button(ctx, {
                tex: "settings/panel3.png", label: lab, x, y: BACK_Y, fontSize: 24, onTap,
            }));
            if (onQuit && onFlee) { // бой: «Назад» + «Убежать» + «В главное меню»
                mk(700, t("settings.back"), backTap);
                mk(960, t("settings.flee").toUpperCase(), onFlee);
                mk(1220, t("settings.quit").toUpperCase(), onQuit);
            } else if (onQuit) { // выход в главное меню рядом с «Назад» (просил юзер)
                mk(830, t("settings.back"), backTap);
                mk(1090, t("settings.quit").toUpperCase(), onQuit);
            } else {
                mk(960, t("settings.back"), backTap);
            }
        }

        // Список блоков сохранений: клик по строке применяет блок
        function rebuildBlocks() {
            frame("settings.loadTitle");
            const blocks = globalThis.GAME_META.listBlocks();
            const MAX_ROWS = 8; // 8 строк в окне, старее — счётчиком ниже
            blocks.slice(0, MAX_ROWS).forEach((b, i) => {
                const y = 350 + i * 66;
                const row = new PIXI.Graphics();
                row.roundRect(540, y - 27, 840, 54, 10);
                row.fill(0x2e2822);
                row.stroke({ width: 3, color: 0x6b5c40 });
                row.eventMode = "static";
                row.on("pointertap", () => {
                    if (ctx.sfx) ctx.sfx();
                    const name = G.loadBlock(b.name);
                    savedName = null;
                    // блок с забегом уводит в игру — панель умрёт вместе
                    // со сменой сцены; блок без забега (писался из меню)
                    // применим только мету — возвращаемся к настройкам
                    if (!outer.destroyed && name && !globalThis.GAME_META.loadRun())
                        rebuild("main");
                });
                const nm = T(b.name, 27, PARCH);
                nm.anchor.set(0.5);
                nm.position.set(960, y);
                nm.eventMode = "none";
                outer.addChild(row, nm);
            });
            if (!blocks.length) {
                outer.addChild(label(t("settings.noBlocks"), 960, 600, 25, MUTED));
            } else if (blocks.length > MAX_ROWS) {
                outer.addChild(label(t("settings.moreBlocks", { n: blocks.length - MAX_ROWS }), 960, 862, 19, MUTED));
            }
            bottomButtons();
        }

        function pickLang(code) {
            if (ctx.sfx) ctx.sfx();
            G.settings.lang = code;
            GAME_LOC.setLang(code);
            save();
            rebuild();
        }

        function pickSummon(v) {
            if (ctx.sfx) ctx.sfx();
            G.settings.dragSummon = !!v;
            save();
            rebuild();
        }

        function rebuild(nextMode) {
            if (nextMode) panelMode = nextMode;
            for (const ch of outer.removeChildren()) ch.destroy({ children: true });
            if (panelMode === "blocks") { rebuildBlocks(); return; }

            frame("settings.title");
            slider("settings.sound", "sound", 0);
            slider("settings.music", "music", 1);
            // скорость анимаций/передвижений боя: 0..10, живое значение —
            // арена читает его каждый кадр (arena.js animK)
            slider("settings.anim", "animSpeed", 2);

            pair(PAIR_ROWS[0], [
                ["РУССКИЙ", GAME_LOC.lang === "ru", PAIR_L, () => pickLang("ru")],
                ["ENGLISH", GAME_LOC.lang === "en", PAIR_R, () => pickLang("en")],
            ]);

            // способ призыва: клик по карте → клетка, или перетаскивание
            pair(PAIR_ROWS[1], [
                [t("settings.summonClick").toUpperCase(), !G.settings.dragSummon, PAIR_L, () => pickSummon(false)],
                [t("settings.summonDrag").toUpperCase(), !!G.settings.dragSummon, PAIR_R, () => pickSummon(true)],
            ]);

            // прогресс игры (просил юзер): «Сохранить» пишет датируемый
            // блок всего прогресса (забег + мета), «Загрузить» открывает
            // список блоков
            pair(PAIR_ROWS[2], [
                [t("settings.save"), true, PAIR_L, () => {
                    if (ctx.sfx) ctx.sfx();
                    savedName = G.saveBlockNow();
                    rebuild();
                }],
                [t("settings.load"), false, PAIR_R, () => {
                    if (ctx.sfx) ctx.sfx();
                    rebuild("blocks");
                }],
            ]);

            // вместо подписи о музыке — имя свежего блока (до закрытия панели)
            const note = T(savedName ? t("settings.saved", { name: savedName })
                : t("settings.musicNote"), 19, savedName ? GOLD : MUTED);
            note.anchor.set(0.5, 0);
            note.position.set(960, 838);
            note.eventMode = "none";
            outer.addChild(note);

            bottomButtons();
        }
        rebuild();
        return { node: outer, rebuild, applySound, applyMusic, get mode() { return panelMode; } };
    }

    // Снимок текущей сцены в дизайн-разрешении 1920×1080 — подложка
    // настроек: сзади видна ЗАТЕНЁННАЯ СЦЕНА, откуда открыли (юзер), а не
    // подложка-коридор. Сцена-хозяин выз captureSettingsBg ПЕРЕД
    // go("settings") (сцена при переключении умирает — остаётся снимок).
    // Рисуем контейнер сцен ui с ОТКЛЮЧЁННЫМ летербокс-трансформом.
    function captureSettingsBg(ctx) {
        const G = ctx.G;
        if (G.__settingsShot) { G.__settingsShot.destroy(true); G.__settingsShot = null; }
        try {
            const ui = ctx.ui;
            const sx = ui.scale.x, sy = ui.scale.y, px = ui.position.x, py = ui.position.y;
            ui.scale.set(1); ui.position.set(0, 0);
            const rt = PIXI.RenderTexture.create({ width: 1920, height: 1080 });
            ctx.app.renderer.render({ container: ui, target: rt, clear: true });
            ui.scale.set(sx, sy); ui.position.set(px, py);
            G.__settingsShot = rt;
        } catch (e) { /* снимок не вышел — сцена возьмёт штатную подложку */ }
    }

    function createSettingsScene(ctx) {
        const { scenes, G, ui } = ctx;
        const { dimBg } = globalThis.GAME_UI;
        let root = null, panel = null;

        // «Назад» возвращает туда, откуда открыли (меню/мир/подземелье)
        function goBack() {
            const to = G.uiReturn || "menu";
            G.uiReturn = null;
            scenes.go(to);
        }

        return {
            // Эскейп = «Назад» (просил юзер: кнопки «выход» меню — на клавише);
            // в списке сохранений сначала возвращает к самим настройкам
            update() {
                if (!ctx.input.wasPressed("Escape")) return;
                if (panel && panel.mode === "blocks") panel.rebuild("main");
                else goBack();
            },
            enter() {
                // «В главное меню» — только когда настройки открыты из
                // мира или подземелья (из меню строка выхода уже есть)
                const quit = (G.uiReturn === "dungeon" || G.uiReturn === "world")
                    ? () => { G.uiReturn = null; scenes.go("menu"); }
                    : undefined;
                panel = buildPanel(ctx, { onBack: goBack, onQuit: quit });
                panel.applySound();
                root = new PIXI.Container();
                root.eventMode = "static";
                // сзади — затенённый снимок сцены, откуда открыли (юзер);
                // без снимка (прямые go("settings") из проб) — штатный коридор
                if (G.__settingsShot) {
                    root.addChild(new PIXI.Sprite(G.__settingsShot));
                    root.addChild(new PIXI.Graphics()
                        .rect(0, 0, 1920, 1080)
                        .fill({ color: 0x000000, alpha: 0.85 }));
                } else {
                    root.addChild(dimBg(ctx, 0.85));
                }
                root.addChild(panel.node);
                ui.addChild(root);
            },
            exit() {
                if (root) { root.destroy({ children: true }); root = null; }
                panel = null;
                if (G.__settingsShot) { G.__settingsShot.destroy(true); G.__settingsShot = null; }
            },
            api: {
                setStep(key, v) {
                    G.settings[key] = Math.max(0, Math.min(12, v));
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
                // блоки сохранений (кнопки «Сохранить»/«Загрузить», юзер)
                blocks: () => globalThis.GAME_META.listBlocks(),
                saveBlock: () => G.saveBlockNow(),
                loadBlock: (name) => G.loadBlock(name),
                openBlocks: () => panel && panel.rebuild("blocks"),
                panelMode: () => (panel ? panel.mode : null),
            },
        };
    }

    globalThis.GAME_SETTINGS_SCENE = { createSettingsScene, buildPanel, captureSettingsBg };
})();
