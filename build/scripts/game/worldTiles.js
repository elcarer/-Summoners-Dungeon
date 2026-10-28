// СЛОЙ МЕСТНОСТИ ГЛОБАЛЬНОЙ КАРТЫ (просил юзер, волна тайлов мира).
// Dual-grid тайлы как в project1: конвенция dualgrid.js (TILE_CORNERS) —
// сетка рендера смещена на полклетки, тайл (i,j) стоит в точке (i*TS, j*TS)
// и накрывает углы клеток данных (i-1,j-1)(i,j-1)(i-1,j)(i,j). Листы юзера
// images/tiles/*.png — 4×4 тайла по 32px, каждый описывает ПАРУ местностей:
// grass_dirt (фон трава/фича земля), grass_water (фон трава/фича вода),
// snow_dirt / sand_dirt / waste_dirt / magic_dirt (фон земля, фича —
// снег/песок/тлен/магия); wood — ПРОЗРАЧНЫЙ оверлей лесных массивов
// поверх местности (фича — чаща, безлесные тайлы прозрачны целиком).
//
// ── ТАБЛИЦА СОЧЕТАЕМОСТИ (просил юзер) ──────────────────────────────────
// Напрямую соседствовать могут только пары с готовым переходным листом.
// Несовместимые местности разводятся переходным типом: любые две сухие
// местности — через ЗЕМЛЮ (dirt), вода — только с ТРАВОЙ (луговые берега).
//              земля трава  снег  песок  тлен  магия  вода
// земля         —    ЛИСТ   ЛИСТ  ЛИСТ  ЛИСТ  ЛИСТ   нет¹
// трава        ЛИСТ   —     нет²   нет²  нет²  нет²  ЛИСТ
// снег         ЛИСТ  нет²    —     нет²  нет²  нет²  нет¹
// песок        ЛИСТ  нет²   нет²    —    нет²  нет²  нет¹
// тлен         ЛИСТ  нет²   нет²   нет²    —    нет²  нет¹
// магия        ЛИСТ  нет²   нет²   нет²   нет²    —   нет¹
// вода         нет¹  ЛИСТ  нет¹   нет¹  нет¹  нет¹     —
// ¹ берега рек/озёр — луговая кромка: суша у воды становится травой
// ² у стыка зон несовместимая сторона уходит в землю (полоса-буфер)
// Итог: в любом блоке рендера 2×2 не больше двух местностей, и каждый
// тайл берётся из ОДНОГО листа — без прямых срезов на чужом фоне.
//
// Местность клетки выводится из данных worldGen (чистая функция — слой
// производный, в сейв не пишется): зоны стихий дают преобладающий тип —
// Сила-земля, Рост-трава, Мудрость-магия, Тлен-тлен, Честь-песок,
// Время-снег; реки и озёра — вода (мосты стоят на воде, доски поверх).
(function () {
    // коды местности тер-слоя (0-5 суша, 6 вода; dirt=0 — буфер суши)
    const DIRT = 0, GRASS = 1, SNOW = 2, SAND = 3, WASTE = 4, MAGIC = 5,
        WATER = 6;
    const NAME = ["dirt", "grass", "snow", "sand", "waste", "magic", "water"];
    // преобладающий тип зоны (Мудрость — магия: лист magic_dirt юзера)
    const ZONE_TERRAIN = {
        strength: DIRT, growth: GRASS, wisdom: MAGIC,
        decay: WASTE, honor: SAND, time: SNOW,
    };
    // СОЧЕТАЕМОСТЬ = пара с готовым листом: ключ a*8+b (a<b — коды
    // местностей), feature — «фича» этого листа
    const PAIRS = {
        1: { sheet: "grass_dirt", feature: DIRT },   // земля|трава
        2: { sheet: "snow_dirt", feature: SNOW },    // земля|снег
        3: { sheet: "sand_dirt", feature: SAND },    // земля|песок
        4: { sheet: "waste_dirt", feature: WASTE },  // земля|тлен
        5: { sheet: "magic_dirt", feature: MAGIC },  // земля|магия
        14: { sheet: "grass_water", feature: WATER }, // трава|вода (1·8+6)
    };
    // сплошные тайлы одной местности: лист, где она есть (бит фичи)
    const SOLID = [
        { sheet: "snow_dirt", feature: SNOW },   // земля — фон листа
        { sheet: "grass_dirt", feature: DIRT },  // трава — фон листа
        { sheet: "snow_dirt", feature: SNOW },
        { sheet: "sand_dirt", feature: SAND },
        { sheet: "waste_dirt", feature: WASTE },
        { sheet: "magic_dirt", feature: MAGIC },
        { sheet: "grass_water", feature: WATER },
    ];
    // цвета мини-карты (в тон тайлам; земля/трава/снег/песок/тлен/магия/вода)
    const MINI = [0x6a4828, 0x467622, 0xe8eef2, 0xe2d58b, 0x1c1a20, 0x9999ff,
        0x2c4a63];

    // углы 16 тайлов листа (конвенция dualgrid.js TILE_CORNERS):
    // [TL,TR,BL,BR], 1 — угол фичи; индекс = строка*4+столбец
    const CORNERS = (globalThis.createDualGrid
        ? globalThis.createDualGrid().TILE_CORNERS
        : [[0, 0, 1, 0], [0, 1, 0, 1], [1, 0, 1, 1], [0, 0, 1, 1],
           [1, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 0],
           [0, 1, 0, 0], [1, 1, 0, 0], [1, 1, 0, 1], [1, 0, 1, 0],
           [0, 0, 0, 0], [0, 0, 0, 1], [0, 1, 1, 0], [1, 0, 0, 0]]);
    const LOOKUP = new Array(16); // ключ TL*8+TR*4+BL*2+BR → индекс тайла
    CORNERS.forEach(([tl, tr, bl, br], t) => {
        LOOKUP[tl * 8 + tr * 4 + bl * 2 + br] = t;
    });
    const POP = new Array(128); // popcount битовой маски местностей блока
    POP[0] = 0;
    for (let m = 1; m < 128; m++) POP[m] = POP[m >> 1] + (m & 1);
    const LOG2 = { 1: 0, 2: 1, 4: 2, 8: 3, 16: 4, 32: 5, 64: 6 };
    const pairKey = (a, b) => a < b ? a * 8 + b : b * 8 + a;
    // сочетаемы = для пары есть переходный лист (таблица выше)
    const pairOK = (a, b) => a === b || !!PAIRS[pairKey(a, b)];

    // ── местность клетки мира: Uint8Array(w*h) кодов 0..6 ───────────────
    // Правила идут по таблице сочетаемости: сначала берега (вода только
    // с травой), затем полосы-буферы суши (несовместимая пара → земля
    // на не-травяной стороне). Оба прохода читают снимок предыдущего
    // шага и пишут в t — параллельная семантика, детерминизм по сиду.
    function terrainOf(map) {
        const GEN = globalThis.GAME_WORLDGEN, T = GEN.T;
        const W = map.w, H = map.h, N = W * H;
        const t = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
            const ter = map.ter[i];
            t[i] = (ter === T.WATER || ter === T.BRIDGE) ? WATER
                : ZONE_TERRAIN[GEN.ELEMS[map.zone[i]]];
        }
        const cheb = (x, y, pred) => { // есть ли сосед чебышёв-1 с условием
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                if (pred(src[ny * W + nx])) return true;
            }
            return false;
        };
        // 1. ЛУГОВЫЕ БЕРЕГА: вода сочетается только с травой — вся суша
        // в чебышёв-1 от воды, кроме травы, становится травяной кромкой
        // (река режет снег/песок/тлен/магию лугом, без земляных обрывов)
        let src = t.slice();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const a = src[y * W + x];
            if (a === WATER || a === GRASS) continue;
            if (cheb(x, y, (b) => b === WATER)) t[y * W + x] = GRASS;
        }
        // 2. ЗЕМЛЯНЫЕ ПОЛОСЫ: несовместимая пара суша-суша в чебышёв-1 →
        // не-травяная сторона уходит в землю (трава — фон базового листа,
        // её не режем; снег|песок обращаются обе стороны — полоса в 2 клетки)
        src = t.slice();
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const a = src[y * W + x];
            if (a === DIRT || a === GRASS || a === WATER) continue;
            if (cheb(x, y, (b) => b !== WATER && b !== a && !pairOK(a, b)))
                t[y * W + x] = DIRT;
        }
        return t;
    }

    // ── слой рендера: W×H спрайтов dual-grid, размер TS на тайл ─────────
    function render(map, terr, sheets, TS) {
        const t = terr || terrainOf(map);
        const W = map.w, H = map.h, s32 = sheets.grass_dirt.ts; // тайл листа
        const c = new PIXI.Container();
        const stats = { tiles: 0, fallback: 0, odd: 0, bySheet: {} };
        const at = (x, y) =>
            (x < 0 || y < 0 || x >= W || y >= H) ? DIRT : t[y * W + x];
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const tl = at(i - 1, j - 1), tr = at(i, j - 1);
            const bl = at(i - 1, j), br = at(i, j);
            const m = (1 << tl) | (1 << tr) | (1 << bl) | (1 << br);
            let sheet, feature;
            if (m & (1 << WATER) && m !== (1 << WATER)) {
                // вода сочетается только с травой (таблица): берега —
                // луговые, лист травяной и честный. Углы не-травы у воды
                // после правил невозможны; если появились — это баг данных
                sheet = "grass_water"; feature = WATER;
                if (m & ~((1 << WATER) | (1 << GRASS))) stats.fallback++;
            } else if (POP[m] === 1) {
                const sol = SOLID[tl];
                sheet = sol.sheet; feature = sol.feature;
            } else if (POP[m] === 2) {
                const lo = m & -m, a = LOG2[lo], b = LOG2[m ^ lo];
                const p = PAIRS[pairKey(a, b)];
                if (p) { sheet = p.sheet; feature = p.feature; }
                else { sheet = "snow_dirt"; feature = SNOW; stats.odd++; }
            } else { stats.odd++; sheet = "snow_dirt"; feature = SNOW; }
            const key = (tl === feature ? 8 : 0) + (tr === feature ? 4 : 0)
                + (bl === feature ? 2 : 0) + (br === feature ? 1 : 0);
            const spr = new PIXI.Sprite(sheets[sheet].textures[LOOKUP[key]]);
            spr.position.set(i * TS, j * TS);
            spr.scale.set(TS / s32);
            c.addChild(spr);
            stats.tiles++;
            stats.bySheet[sheet] = (stats.bySheet[sheet] || 0) + 1;
        }
        return { container: c, stats };
    }

    // ── оверлей ЛЕСНЫХ МАССИВОВ (просил юзер): wood.png поверх тайлов ─────
    // местности. Лист — прозрачный dual-grid 4×4 по 32px (фича = чаща:
    // индекс 12 без углов полностью прозрачен, 6 полон — конвенция
    // TILE_CORNERS как у местности). Маска — чащи worldGen (ter===FOREST,
    // чащи непроходимы, дороги их прорезают → под дорогами леса нет);
    // рендер-тайл (i,j) накрывает углы 4 клеток данных, безлесные тайлы
    // (ключ 0) не спрайтятся вовсе — сплошной лес = плотная крона
    function renderForest(map, sheets, TS) {
        const GEN = globalThis.GAME_WORLDGEN, T = GEN.T;
        const W = map.w, H = map.h, s32 = sheets.wood.ts; // тайл листа
        const c = new PIXI.Container();
        const stats = { tiles: 0, skipped: 0, scale: TS / s32 };
        const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0
            : (map.ter[y * W + x] === T.FOREST ? 1 : 0);
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const key = at(i - 1, j - 1) * 8 + at(i, j - 1) * 4
                + at(i - 1, j) * 2 + at(i, j);
            if (!key) { stats.skipped++; continue; }
            const spr = new PIXI.Sprite(sheets.wood.textures[LOOKUP[key]]);
            spr.position.set(i * TS, j * TS);
            spr.scale.set(TS / s32);
            c.addChild(spr);
            stats.tiles++;
        }
        return { container: c, stats };
    }

    globalThis.GAME_WORLDTILES = {
        V: 3, DIRT, GRASS, SNOW, SAND, WASTE, MAGIC, WATER,
        NAME, ZONE_TERRAIN, PAIRS, MINI, terrainOf, render, renderForest,
        pairOK,
    };
})();
