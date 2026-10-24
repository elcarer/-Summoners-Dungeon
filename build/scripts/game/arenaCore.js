// СЦЕНА «АРЕНА»: ядро — константы, геометрия поля, общий контекст A и мелкие
// помощники. Модули арены (arenaCards/Board/Combat/...) вешают свои функции и
// состояние на A; их установщики работают в with (A), поэтому тела функций
// видят общие имена (B, root, T, …) так же, как раньше в одном замыкании.
(function () {
    const NS = globalThis.GAME_ARENA = globalThis.GAME_ARENA || {};

    const GRID = 5;          // 5×5
    // Геометрия поля — поверх НАРИСОВАННОЙ сетки бэкграунда арены
    // (images/scenes/N.png). Границы клеток по колонкам/рядам в базовом
    // разрешении 1920×1080 (сетка на арте слегка неравномерная — потому
    // массивы, а не один шаг). Измерено по градиентам краев клеток.
    const SCENE_GRID = {
        1: { cols: [640.5, 763.5, 891, 1018.5, 1147.5, 1275], rows: [168, 297, 414, 529.5, 649.5, 775.5] },
        2: { cols: [640.5, 763.5, 891, 1018.5, 1147.5, 1275], rows: [178.5, 297, 414, 529.5, 649.5, 775.5] },
        // 3 — подводная пещера «Подземных ключей» (Мудрость); границы
        // клеток измерены по градиентам краёв, как у 1/2
        3: { cols: [640.5, 764, 892, 1018.5, 1151, 1275], rows: [178, 299, 413.5, 529.5, 650, 780] },
    };
    // Лимит руки — 7 карт, проверяется ТОЛЬКО в конце хода (после добора со
    // шкалы): лишнее игрок сбрасывает по своему выбору (панель сброса).
    const HAND_MAX = 7;
    // «Извлечение духа» (grw17): снимаемые свойства КАРТЫ (способности, ауры,
    // особости построек); активные состояния считаются отдельно (см. countProps).
    const PURGE_DEF_KEYS = ["ability", "animalCost", "aura", "altarSword",
        "campAura", "campfire", "cloudSpire", "crush", "energyToStats",
        "frostAttack", "frostNeighbors", "groveAura", "illusion", "keeperScale",
        "lakeMaid", "leaderAura", "monolith", "mycelium", "plantEcho",
        "riteStump", "sandDecay", "spellBuffAura", "sprout", "sisterDraw",
        "starTower", "stormer", "berserkSummon", "portalLeap", "targetDiscount",
        "thicket", "trapGrow", "trapOnMove", "waterMage", "wolfSummon"];

    NS.createContext = function createContext(ctx) {
        const { scenes, G, uiTex, scheduler } = ctx;
        const { CARDS, ENCOUNTERS, TRAP_SLOTS, enemyDeck, HEROES } = globalThis.GAME_DATA;
        const A = {
            ctx, scenes, G, uiTex, scheduler,
            GRID, HAND_MAX, SCENE_GRID,
            // стартовая сцена поля: 1 — гоблинские пещеры, 2 — Роща Роста,
            // 3 — Подземные ключи (enter() выставляет по стихии подземелья)
            curScene: 1,
            SPRITE_SCALE: 0.525, // кадр 256 → ~134px, фигура ~102px в клетке
            root: null,
            B: null,
            floats: [], punches: [], // всплывающий текст и тряска жетонов
            moves: [], // плавные переходы существ между клетками
            PURGE_DEF_KEYS,
            CARDS, ENCOUNTERS, TRAP_SLOTS, enemyDeck, HEROES,
        };

        A.t = (k, v) => GAME_LOC.t(k, v);
        A.sfx = (name) => { if (ctx.sfx) ctx.sfx(name); };
        A.delay = (s) => new Promise((r) => scheduler.after(s, r));
        // Скорость анимаций и передвижений (ползунок «Анимации» в Настройках,
        // settings.animSpeed 0..10). 5 = дефолт — в 1.5 раза медленнее
        // исходной; все длительности (глиссады, паузы, всплывающий текст)
        // делятся на этот коэффициент, скорость походки — умножается.
        A.animK = () => Math.max(0.25, (((G.settings && G.settings.animSpeed) ?? 5) * 2) / 15);
        // всего сфер на шкале конца хода: 3 на первом ходу, каждый ход +1
        A.spheresTotal = () => A.B.turnNo + 2;

        A.cellRect = (col, row) => {
            const g = SCENE_GRID[A.curScene] || SCENE_GRID[1];
            return {
                x: g.cols[col] + 3, y: g.rows[row] + 3,
                w: g.cols[col + 1] - g.cols[col] - 6, h: g.rows[row + 1] - g.rows[row] - 6,
            };
        };
        A.cellXY = (col, row) => {
            const rc = A.cellRect(col, row);
            return { x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 };
        };
        // Листы существ поля боя — по стихии карты: Рост — эльф, Мудрость —
        // сорка (плейсхолдер до арта элементалей), Сила (и прочие) — гоблин.
        // Отдельный лист — полем def.sheet у карты.
        A.sheetOf = (u) => ctx.creatureSheets
            && (ctx.creatureSheets[u.def.sheet]
                || ctx.creatureSheets[u.def.elem === "growth" ? "elf"
                    : u.def.elem === "wisdom" ? "wisdom" : "goblin"]);
        A.T = (text, size, fill, opts = {}) => new PIXI.Text({
            text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
        });
        A.isGoblin = (def) => !!def && (def.creature === "goblin" || def.race === "goblin");
        A.cardIdOf = function cardIdOf(def) {
            // «Извлечение духа» подменяет def существа «очищенной» копией —
            // в копии остаётся ссылка __base на исходную карту каталога
            return Object.keys(CARDS).find((k) => CARDS[k] === def
                || (def && def.__base && CARDS[k] === def.__base));
        };
        // «Защита от заклинаний» (u.spellWard, способность героя Миры):
        // существо нельзя выбрать целью заклинаний. Проверка ОДНА на весь бой
        // — здесь. Все списки целей (игрок: onCellTap/applySpellPInner/
        // autoTargetFor/runeTargetP; ИИ: aiDmgTargets/aiBuffPick/…; руны)
        // фильтруются через spellTargets, поэтому отдельные карты свою
        // проверку не дублируют.
        A.spellAimable = (u) => !!u && !u.spellWard;
        A.spellTargets = (list) => list.filter((u) => A.spellAimable(u));
        return A;
    };
})();
