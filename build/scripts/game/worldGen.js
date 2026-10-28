// ГЕНЕРАТОР ГЛОБАЛЬНОЙ КАРТЫ ОТКРЫТОГО МИРА (просил юзер). Референсы:
// Shandalar — континент из цветных регионов со столицами-замками,
// бродячими врагами и подземельями; forge-adventure — карта-сетка с
// объектами (enemy/shop/inn/entry). У нас карта 384×256 клетки (клетка
// мира 32px → 12288×8192; вдвое больше — города редкие, якоря ≥30
// клеток, просил юзер), 6 зон по стихиям сеткой 3×2: верхний ряд
// Сила/Рост/Мудрость, нижний Тлен/Честь/Время. В каждой зоне: столица
// 5×4 клетки, 9–11 городов 5×3 клетки и вход в подземелье стихии
// (1 клетка). Города стоят редко — минимум ~9 клеток между якорями
// (просил юзер ×2 к прежнему). Путь преграждают горные хребты по
// границам зон, чащи, реки и озёра; населённые пункты связывают дороги
// (A* сквозь препятствия = перевал, через воду = мост), поэтому весь
// мир гарантированно проходим от любого города к любому.
// Город = якорь-площадь (проходимая клетка, к ней приходит дорога) +
// стены-клетки здания (непроходимы). Генерация ДЕТЕРМИНИРОВАНА сидом:
// один сид — одна карта. «Новая игра» крутит сид, сейв хранит его
// (V — версия генератора: смена алгоритма инкрементирует её, старые
// сейвы перегенерируются). Модуль чистый: PIXI не касается.
(function () {
    const V = 6;
    const W = 384, H = 256;
    const ELEMS = ["strength", "growth", "wisdom", "decay", "honor", "time"];
    // сетка зон 3×2: индекс k — колонка k%3, ряд (k/3|0), сектор 128×128
    const ZONE_ADJ = [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]];
    // вход в подземелье стихии (id данжа из CAVES; hon/tim — «Скоро…»)
    const ELEM_CAVE = {
        strength: "gob", growth: "grw", wisdom: "wis",
        decay: "dec", honor: "hon", time: "tim",
    };
    const ELEM_CAVE_LABEL = {
        strength: "world.cave", growth: "world.caveGrowth",
        wisdom: "world.caveWisdom", decay: "world.caveDecay",
        honor: "world.caveHonor", time: "world.caveTime",
    };
    // габариты зданий в клетках (просил юзер): город 5×3, столица 5×4;
    // (gx,gy) POI — якорь-площадь: у города нижняя средняя клетка,
    // у столицы — центральная. Данж — 1×1
    const KIND_SIZE = { town: { w: 5, h: 3 }, capital: { w: 5, h: 4 }, dungeon: { w: 1, h: 1 } };
    // минимальная дистанция между якорями POI зоны (просил юзер ×2 к
    // редкости на карте вдвое больше: было 15 на карте 192×128)
    const MIN_POI_DIST = 30;

    // террен-коды клетки: земля/гора/лес/вода/дорога/мост
    const T_GROUND = 0, T_MOUNTAIN = 1, T_FOREST = 2, T_WATER = 3,
        T_ROAD = 4, T_BRIDGE = 5;

    // ── детерминированный ГПСЧ (mulberry32) и целочисленный хэш ─────────
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hash2(x, y, k) {
        let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    const smooth = (t) => t * t * (3 - 2 * t);
    // value-noise по блокам 8×8 (билинейно, со сглаживанием) — орга-
    // нические границы зон и неровности хребтов
    function vnoise(x, y, k) {
        const bx = x / 8, by = y / 8;
        const x0 = Math.floor(bx), y0 = Math.floor(by);
        const fx = smooth(bx - x0), fy = smooth(by - y0);
        const c00 = hash2(x0, y0, k), c10 = hash2(x0 + 1, y0, k);
        const c01 = hash2(x0, y0 + 1, k), c11 = hash2(x0 + 1, y0 + 1, k);
        return (c00 * (1 - fx) + c10 * fx) * (1 - fy)
            + (c01 * (1 - fx) + c11 * fx) * fy;
    }

    // ── бинарная куча для A* ─────────────────────────────────────────────
    function hPush(h, item, f) {
        h.push({ item, f });
        let i = h.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (h[p].f <= h[i].f) break;
            const t = h[p]; h[p] = h[i]; h[i] = t;
            i = p;
        }
    }
    function hPop(h) {
        const top = h[0], last = h.pop();
        if (h.length) {
            h[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < h.length && h[l].f < h[m].f) m = l;
                if (r < h.length && h[r].f < h[m].f) m = r;
                if (m === i) break;
                const t = h[m]; h[m] = h[i]; h[i] = t;
                i = m;
            }
        }
        return top;
    }

    // спираль от клетки: первый элемент, удовлетв. предикату
    function spiral(cx, cy, pred, maxR) {
        if (pred(cx, cy)) return { x: cx, y: cy };
        for (let r = 1; r <= maxR; r++) {
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                if (pred(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
            }
        }
        return null;
    }

    // клетки здания вокруг якоря-площади: [x, y, isAnchor]
    function footCells(kind, gx, gy) {
        const s = KIND_SIZE[kind];
        const x0 = gx - ((s.w - 1) >> 1), y0 = gy - (s.h - 1); // низ по якорю
        const cells = [];
        for (let y = y0; y < y0 + s.h; y++)
            for (let x = x0; x < x0 + s.w; x++) cells.push([x, y, x === gx && y === gy]);
        return cells;
    }

    function generate(seed) {
        seed = seed | 0;
        const rng = mulberry32(seed);
        const N = W * H;
        const ter = new Array(N).fill(T_GROUND);
        const zone = new Array(N).fill(0);
        const blocked = new Array(N).fill(0); // стены зданий (для коллизий)

        // ── 1. центры зон (сектор 128×128 + дрожание) ──────────────────────
        const centers = ELEMS.map((elem, k) => ({
            elem,
            x: 64.5 + (k % 3) * 128 + (rng() - 0.5) * 14,
            y: 64.5 + ((k / 3) | 0) * 128 + (rng() - 0.5) * 14,
        }));
        // «расстояние» до зоны с шумом — границы зон органичные
        const zoneDist = (x, y, k) =>
            Math.hypot(x - centers[k].x, y - centers[k].y)
            + (vnoise(x, y, 91 + k) - 0.5) * 18;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            let best = 0, bd = Infinity;
            for (let k = 0; k < 6; k++) {
                const d = zoneDist(x, y, k);
                if (d < bd) { bd = d; best = k; }
            }
            zone[y * W + x] = best;
        }

        // ── 2. горные хребты по границам зон (проходы остаются: гора
        // ставится с вероятностью, дороги дорежут перевалы) + короткие
        // хребты внутри зон. Толщина ОТ 2 КЛЕТОК (просил юзер — на виде
        // без зума одинарные слишком тонкие): основная маска расширяется
        // на соседа с вероятностью, проходы не зарастают целиком ──────
        const ridge = new Uint8Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            let d1 = Infinity, d2 = Infinity;
            for (let k = 0; k < 6; k++) {
                const d = zoneDist(x, y, k);
                if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
            }
            if (d2 - d1 < 3.5 && hash2(x, y, 777) < 0.74) ridge[y * W + x] = 1;
        }
        for (let k = 0; k < 6; k++) {
            const ridges = 1 + (rng() < 0.6 ? 1 : 0);
            for (let r = 0; r < ridges; r++) {
                let x = 6 + (rng() * (W - 12)) | 0, y = 6 + (rng() * (H - 12)) | 0;
                const len = 12 + (rng() * 12) | 0;
                for (let s = 0; s < len; s++) {
                    const i = y * W + x;
                    if (zone[i] === k) ridge[i] = 1;
                    if (rng() < 0.5) x += rng() < 0.5 ? -1 : 1;
                    else y += rng() < 0.5 ? -1 : 1;
                    x = Math.max(3, Math.min(W - 4, x));
                    y = Math.max(3, Math.min(H - 4, y));
                }
            }
        }
        // расширение на 1 соседа — хребты становятся в 2-3 клетки
        const ridge2 = ridge.slice();
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (ridge2[i]) continue;
            let near = false;
            for (let dy = -1; dy <= 1 && !near; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    if (ridge[(y + dy) * W + x + dx]) { near = true; break; }
                }
            if (near && hash2(x, y, 778) < 0.8) ridge2[i] = 1;
        }
        for (let i = 0; i < N; i++) if (ridge2[i]) ter[i] = T_MOUNTAIN;

        // ── 3. чащи: «острова»-пятна с РВАНЫМИ КРАЯМИ (просил юзер: прежние
        // блуждания с дрейфом давали ленты и кольца с дырами — не похоже на
        // лес). Ядро растёт КОМПАКТНО — новая клетка только по соседству с
        // уже покрашенной (клякса без дыр и без лент), отростки-языки
        // выступают НАРУЖУ короткими кончиками. Полости, окружённые чащей,
        // заливаются лесом — дырок внутри массивов нет. В зоне Роста блобов
        // больше (количество сбалансировано, чтобы зона не заросла целиком)
        for (let k = 0; k < 6; k++) {
            const grove = ELEMS[k] === "growth";
            const blobs = (grove ? 20 : 12) + (rng() * (grove ? 9 : 6)) | 0;
            for (let b = 0; b < blobs; b++) {
                let x = Math.max(4, Math.min(W - 5,
                    (centers[k].x + (rng() - 0.5) * 116) | 0));
                let y = Math.max(4, Math.min(H - 5,
                    (centers[k].y + (rng() - 0.5) * 116) | 0));
                const paint = (px, py) => {
                    const i = py * W + px;
                    if (zone[i] === k && ter[i] === T_GROUND) ter[i] = T_FOREST;
                };
                // ядро-клякса: рост по краю (edge-набор соседей покрашенного)
                // — остров растёт «пятном», ленты исключены по построению
                const size = 55 + (rng() * 35) | 0; // 55..89
                const edge = [];
                const addEdge = (px, py) => {
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = px + dx, ny = py + dy;
                        if (nx < 3 || ny < 3 || nx >= W - 3 || ny >= H - 3) continue;
                        const ni = ny * W + nx;
                        if (ter[ni] !== T_FOREST) edge.push([nx, ny]);
                    }
                };
                paint(x, y);
                addEdge(x, y);
                for (let s = 0; s < size && edge.length; s++) {
                    const e = (rng() * edge.length) | 0;
                    const [ex, ey] = edge[e];
                    edge.splice(e, 1);
                    const ei = ey * W + ex;
                    if (ter[ei] === T_FOREST) continue; // обросла из другого края
                    paint(ex, ey);
                    addEdge(ex, ey);
                }
                // отростки-кончики из периметра ядра — рваные края
                // (просил юзер: «выступающие наружу кончики пятен леса»)
                const twigs = 2 + (rng() * 3) | 0; // 2..4
                for (let tw = 0; tw < twigs; tw++) {
                    // старт — покрашенная клетка с не-лесным соседом
                    let sx = -1, sy = -1;
                    for (let tries = 0; tries < 40; tries++) {
                        const tx = 3 + (rng() * (W - 6)) | 0;
                        const ty = 3 + (rng() * (H - 6)) | 0;
                        if (zone[ty * W + tx] !== k || ter[ty * W + tx] !== T_FOREST)
                            continue;
                        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
                            ([dx, dy]) => {
                                const ni = (ty + dy) * W + tx + dx;
                                return zone[ni] === k && ter[ni] === T_GROUND;
                            });
                        if (near) { sx = tx; sy = ty; break; }
                    }
                    if (sx < 0) continue;
                    let ang = Math.atan2(sy - centers[k].y, sx - centers[k].x);
                    const len = 5 + (rng() * 7) | 0; // 5..11 — короткий язык
                    let cx2 = sx, cy2 = sy;
                    for (let s = 0; s < len; s++) {
                        if (rng() < 0.5) ang += (rng() - 0.5) * 1.0; // виляет
                        cx2 += Math.abs(Math.cos(ang)) > 0.4
                            ? Math.sign(Math.cos(ang)) : 0;
                        cy2 += Math.abs(Math.sin(ang)) > 0.4
                            ? Math.sign(Math.sin(ang)) : 0;
                        cx2 = Math.max(3, Math.min(W - 4, cx2));
                        cy2 = Math.max(3, Math.min(H - 4, cy2));
                        paint(cx2, cy2);
                        if (rng() < 0.45) // язык в 2 клетки толщиной
                            paint(cx2 + (rng() < 0.5 ? 1 : -1), cy2);
                    }
                }
            }
        }
        // заливка дыр (просил юзер: дырок внутри лесных массивов быть не
        // должно): всё не-лес, НЕдостижимое от рамки карты по не-лесу, —
        // полость внутри чащи, красится лесом (горы полостей не трогаем)
        {
            const out = new Uint8Array(N);
            const q = [];
            const push = (i) => {
                if (!out[i] && ter[i] !== T_FOREST) { out[i] = 1; q.push(i); }
            };
            for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
            for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
            for (let qi = 0; qi < q.length; qi++) {
                const c = q[qi], cx = c % W, cy = (c / W) | 0;
                if (cx > 0) push(c - 1);
                if (cx < W - 1) push(c + 1);
                if (cy > 0) push(c - W);
                if (cy < H - 1) push(c + W);
            }
            for (let i = 0; i < N; i++)
                if (!out[i] && ter[i] === T_GROUND) ter[i] = T_FOREST;
        }

        // ── 4. реки (извилистые, сверху вниз / слева направо) и озёра ─────
        // русло ОТ 2 КЛЕТОК (просил юзер: на виде без зума одинарная
        // протока слишком тонкая) — вторая параллельная протока всегда;
        // река прорезает горы и чащи (каньон), но не рамку карты
        const rivers = 6 + (rng() < 0.5 ? 1 : 0);
        for (let r = 0; r < rivers; r++) {
            const vertical = rng() < 0.55;
            if (vertical) {
                let x = 8 + (rng() * (W - 16)) | 0;
                for (let y = 2; y < H - 2; y++) {
                    ter[y * W + x] = T_WATER;
                    if (x + 1 < W - 2) ter[y * W + x + 1] = T_WATER;
                    x += (rng() < 0.55 ? 0 : rng() < 0.5 ? -1 : 1);
                    x = Math.max(4, Math.min(W - 5, x));
                }
            } else {
                let y = 8 + (rng() * (H - 16)) | 0;
                for (let x = 2; x < W - 2; x++) {
                    ter[y * W + x] = T_WATER;
                    if (y + 1 < H - 2) ter[(y + 1) * W + x] = T_WATER;
                    y += (rng() < 0.55 ? 0 : rng() < 0.5 ? -1 : 1);
                    y = Math.max(4, Math.min(H - 5, y));
                }
            }
        }
        const lakes = 4 + (rng() * 3) | 0;
        for (let l = 0; l < lakes; l++) {
            let x = 6 + (rng() * (W - 12)) | 0, y = 6 + (rng() * (H - 12)) | 0;
            const size = 8 + (rng() * 10) | 0;
            for (let s = 0; s < size; s++) {
                ter[y * W + x] = T_WATER;
                const dir = rng();
                if (dir < 0.25) x--; else if (dir < 0.5) x++;
                else if (dir < 0.75) y--; else y++;
                x = Math.max(3, Math.min(W - 4, x));
                y = Math.max(3, Math.min(H - 4, y));
            }
        }
        // ── 4b. речная сеть зоны Мудрости (просил юзер: рек, притоков и
        // устьев больше, чем в других областях): магистраль через зону +
        // 5–7 притоков с устьями-расширениями + малые протоки + пруды;
        // русла по 2 клетки, как у больших рек. Вся сеть держится ВНУТРИ
        // сектора зоны (±58 от центра) — иначе блуждания уводили воду в
        // чужие зоны и Мудрость не была самой речной. Реки кладутся ДО
        // выбора POI — города/данж встанут на сухую землю, дороги
        // прорежут мосты
        let wisdomPond = null; // финальный добор — ПОСЛЕ дорог (шаг 6b)
        const poiMask = new Uint8Array(N); // клетки POI — прудам нельзя
        {
            const k = 2; // ELEMS[2] === "wisdom"
            const cx = centers[k].x | 0, cy = centers[k].y | 0;
            const R = 58; // полукабарит сектора зоны Мудрости
            const clampX = (x) => Math.max(Math.max(3, cx - R),
                Math.min(Math.min(W - 4, cx + R), x));
            const clampY = (y) => Math.max(Math.max(3, cy - R),
                Math.min(Math.min(H - 4, cy + R), y));
            // извилистое русло от точки; возвращает пройденные клетки
            const carve = (x0, y0, len, dir0, wide, cells) => {
                let x = x0, y = y0, ang = dir0;
                for (let s = 0; s < len; s++) {
                    if (rng() < 0.4) ang += (rng() - 0.5) * 1.1; // извилина
                    x = clampX(x + (Math.abs(Math.cos(ang)) > 0.4
                        ? Math.sign(Math.cos(ang)) : 0));
                    y = clampY(y + (Math.abs(Math.sin(ang)) > 0.4
                        ? Math.sign(Math.sin(ang)) : 0));
                    ter[y * W + x] = T_WATER;
                    if (wide) { // вторая параллельная протока — русло от 2 клеток
                        if (Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)))
                            ter[y * W + clampX(x + 1)] = T_WATER;
                        else
                            ter[clampY(y + 1) * W + x] = T_WATER;
                    }
                    if (cells) cells.push({ x, y });
                }
                return cells;
            };
            // магистрали: вертикальная И горизонтальная через сектор —
            // пересекаются, много устьев для притоков
            const mainV = [], mainH = [];
            carve(clampX(cx + ((rng() - 0.5) * 20 | 0)), clampY(cy - R),
                2 * R - 8, Math.PI / 2, true, mainV);
            carve(clampX(cx - R), clampY(cy + ((rng() - 0.5) * 20 | 0)),
                2 * R - 8, 0, true, mainH);
            // притоки: перпендикулярно своей магистрали; устье в месте
            // впадения расширяется (дельта)
            const tribCells = [];
            const trib = 6 + (rng() * 3) | 0; // 6..8 притоков
            for (let t = 0; t < trib; t++) {
                const fromV = rng() < mainV.length / (mainV.length + mainH.length);
                const main = fromV ? mainV : mainH;
                if (!main.length) { t--; continue; }
                const m = main[(rng() * main.length) | 0];
                ter[m.y * W + clampX(m.x + 1)] = T_WATER; // устье-расширение
                ter[clampY(m.y - 1) * W + m.x] = T_WATER;
                const cells = [];
                carve(m.x, m.y, 20 + (rng() * 24) | 0,
                    fromV ? (rng() < 0.5 ? 0 : Math.PI)
                        : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
                    true, cells);
                tribCells.push(...cells);
            }
            // малые протоки второго порядка — из середины притоков
            const brooks = 2 + (rng() * 2) | 0;
            for (let t = 0; t < brooks && tribCells.length; t++) {
                const c = tribCells[(tribCells.length / 2
                    + (rng() - 0.5) * tribCells.length / 2) | 0];
                carve(c.x, c.y, 10 + (rng() * 8) | 0, rng() * Math.PI * 2, false, null);
            }
            // пруды Мудрости — короткие широкие заводи; красят ТОЛЬКО
            // землю: дорога/мост/площадь водой не накрываются
            const pond = () => {
                let x = clampX(cx + ((rng() - 0.5) * 90) | 0);
                let y = clampY(cy + ((rng() - 0.5) * 90) | 0);
                const size = 10 + (rng() * 8) | 0;
                for (let s = 0; s < size; s++) {
                    const i0 = y * W + x, i1 = y * W + clampX(x + 1);
                    if (ter[i0] === T_GROUND && !poiMask[i0]) ter[i0] = T_WATER;
                    if (ter[i1] === T_GROUND && !poiMask[i1]) ter[i1] = T_WATER;
                    const dir = rng();
                    if (dir < 0.25) x--; else if (dir < 0.5) x++;
                    else if (dir < 0.75) y--; else y++;
                    x = clampX(x);
                    y = clampY(y);
                }
            };
            const ponds = 3 + (rng() * 2) | 0;
            for (let l = 0; l < ponds; l++) pond();
            wisdomPond = pond;
        }
        // рамка мира — скалы по периметру (2 клетки)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
            if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2)
                ter[y * W + x] = T_MOUNTAIN;

        // ── 5. точки интереса зоны: столица 3×3, данж, 9–11 городов 3×2.
        // Якорь POI — его площадь: здание становится вокруг якоря, все
        // клетки footprint обязаны лежать на земле своей зоны ────────────
        const pois = [];
        const placePred = (kind, k) => (x, y) => {
            if (x < 3 || y < 2 || x >= W - 3 || y >= H - 3) return false;
            for (const [fx, fy] of footCells(kind, x, y)) {
                const i = fy * W + fx;
                if (zone[i] !== k || ter[i] !== T_GROUND) return false;
            }
            return true;
        };
        for (let k = 0; k < 6; k++) {
            const c = centers[k];
            const zonePois = [];
            const cap = spiral(c.x | 0, c.y | 0, placePred("capital", k), 16)
                || spiral(c.x | 0, c.y | 0, (x, y) =>
                    x >= 3 && y >= 2 && x < W - 3 && y < H - 3
                    && ter[y * W + x] === T_GROUND, 16);
            zonePois.push({ kind: "capital", elem: c.elem,
                gx: cap ? cap.x : (c.x | 0), gy: cap ? cap.y : (c.y | 0) });
            // подземелье — в 26–41 клетках от столицы (масштаб карты
            // ×2: было 18–26), направление от сида
            const ang = rng() * Math.PI * 2, dist = 26 + rng() * 16;
            const dg = spiral(
                Math.round(zonePois[0].gx + Math.cos(ang) * dist),
                Math.round(zonePois[0].gy + Math.sin(ang) * dist),
                placePred("dungeon", k), 16)
                || spiral(zonePois[0].gx, zonePois[0].gy,
                    placePred("dungeon", k), 16);
            zonePois.push({ kind: "dungeon", elem: c.elem,
                gx: dg.x, gy: dg.y, cave: ELEM_CAVE[c.elem] });
            ter[dg.y * W + dg.x] = T_GROUND; // арка стоит на свободной земле
            // города: сэмплинг с минимальной дистанцией между якорями
            // (редкие неудачи упаковки ослабляют её до 22, теснее — стоп)
            const want = 9 + (rng() * 3) | 0;
            let minD = MIN_POI_DIST, tries = 0;
            while (zonePois.length < 2 + want && minD >= 22) {
                const x = 4 + (rng() * (W - 8)) | 0, y = 3 + (rng() * (H - 6)) | 0;
                if (placePred("town", k)(x, y)
                    && !zonePois.some((p) => Math.hypot(p.gx - x, p.gy - y) < minD)) {
                    zonePois.push({ kind: "town", elem: c.elem, gx: x, gy: y });
                } else if (++tries > 2200) { minD -= 0.5; tries = 0; }
            }
            // стены зданий вокруг площадей (сами площади свободны)
            for (const p of zonePois) {
                for (const [fx, fy, isAnchor] of footCells(p.kind, p.gx, p.gy)) {
                    if (!isAnchor) blocked[fy * W + fx] = 1;
                    poiMask[fy * W + fx] = 1; // прудам Мудрости нельзя
                }
                pois.push(p);
            }
        }

        // ── 6. дороги: A* между площадями/арками. Внутри зоны — остов
        // (Прим) + одно «кольцевое» ребро; между смежными зонами —
        // ближайшая пара. Дорога прокладывается и сквозь горы/чащи
        // (перевал), и через воду (мост); стены городов для дорог
        // непроходимы — путь приходит к площади снаружи, и связность
        // всего мира гарантирована ────────────────────────────────────────
        const costOf = (x, y) => {
            const i = y * W + x;
            if (blocked[i]) return Infinity; // стены зданий не пересекаем
            const t = ter[i];
            if (t === T_ROAD) return 0.75; // дороги охотно сливаются
            if (t === T_BRIDGE) return 0.9;
            if (t === T_GROUND) return 1;
            if (t === T_FOREST) return 7;
            if (t === T_MOUNTAIN) return 9;
            return 13; // вода — мост
        };
        function astar(sx, sy, tx, ty) {
            const start = sy * W + sx, target = ty * W + tx;
            if (!isFinite(costOf(sx, sy)) || !isFinite(costOf(tx, ty)))
                return null;
            const g = new Map([[start, 0]]);
            const prev = new Map([[start, null]]);
            const open = [];
            hPush(open, start, Math.abs(tx - sx) + Math.abs(ty - sy));
            const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            while (open.length) {
                const cur = hPop(open).item;
                if (cur === target) break;
                const cx = cur % W, cy = (cur / W) | 0;
                const gc = g.get(cur);
                for (const [dx, dy] of DIRS) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const step = costOf(nx, ny);
                    if (!isFinite(step)) continue;
                    const ni = ny * W + nx;
                    const ng = gc + step;
                    if (ng < (g.get(ni) ?? Infinity)) {
                        g.set(ni, ng);
                        prev.set(ni, cur);
                        hPush(open, ni, ng + Math.abs(tx - nx) + Math.abs(ty - ny));
                    }
                }
            }
            if (!prev.has(target)) return null;
            const path = [];
            for (let c = target; c !== null; c = prev.get(c)) path.push(c);
            return path.reverse();
        }
        const edges = [];
        for (let k = 0; k < 6; k++) {
            const nodes = pois.filter((p) => p.elem === ELEMS[k]);
            const inTree = [0];
            const rest = nodes.map((_, i) => i).slice(1);
            while (rest.length) { // остов Прима по евклиду
                let bi = 0, bd = Infinity, ba = 0;
                for (let a = 0; a < inTree.length; a++)
                    for (let b = 0; b < rest.length; b++) {
                        const d = Math.hypot(
                            nodes[inTree[a]].gx - nodes[rest[b]].gx,
                            nodes[inTree[a]].gy - nodes[rest[b]].gy);
                        if (d < bd) { bd = d; bi = b; ba = inTree[a]; }
                    }
                edges.push([nodes[ba], nodes[rest[bi]]]);
                inTree.push(rest[bi]);
                rest.splice(bi, 1);
            }
            if (nodes.length >= 4) { // одно дополнительное ребро — кольца
                let bi = null, bd = Infinity;
                for (let a = 0; a < nodes.length; a++)
                    for (let b = a + 1; b < nodes.length; b++) {
                        const d = Math.hypot(nodes[a].gx - nodes[b].gx,
                            nodes[a].gy - nodes[b].gy);
                        if (d < bd && d > 5 && !edges.some(([p, q]) =>
                            (p === nodes[a] && q === nodes[b])
                            || (p === nodes[b] && q === nodes[a]))) {
                            bd = d; bi = [a, b];
                        }
                    }
                if (bi) edges.push([nodes[bi[0]], nodes[bi[1]]]);
            }
        }
        for (const [z1, z2] of ZONE_ADJ) { // межзонные тракты
            let bp = null, bd = Infinity;
            for (const p of pois) if (p.elem === ELEMS[z1])
                for (const q of pois) if (q.elem === ELEMS[z2]) {
                    const d = Math.hypot(p.gx - q.gx, p.gy - q.gy);
                    if (d < bd) { bd = d; bp = [p, q]; }
                }
            if (bp) edges.push(bp);
        }
        for (const [p, q] of edges) {
            const path = astar(p.gx, p.gy, q.gx, q.gy);
            if (!path) continue;
            for (const i of path) {
                if (blocked[i]) continue; // стены не красятся, площадь — да
                ter[i] = ter[i] === T_WATER ? T_BRIDGE : T_ROAD;
            }
        }

        // ── 6b. финальный добор воды Мудрости — ПОСЛЕ дорог: мосты
        // превращали часть рек в T_BRIDGE, и «речность» зоны меряется
        // честно (вода+мост). Глобальные реки иногда дают чужой зоне
        // больше воды, чем сеть Мудрости — добираем прудами (только по
        // земле, POI/дороги/мосты не трогаем) до гарантированного
        // превосходства (просил юзер: Мудрость — самая речная)
        if (wisdomPond) {
            const riverOf = (i) => ter[i] === T_WATER || ter[i] === T_BRIDGE;
            for (let guard = 0; guard < 40; guard++) {
                const wz = new Array(6).fill(0);
                for (let i = 0; i < N; i++) if (riverOf(i)) wz[zone[i]]++;
                const other = Math.max(...wz.filter((_, z) => z !== 2));
                if (wz[2] >= other * 1.15 + 30) break;
                wisdomPond();
            }
        }

        // ── 7. точка появления героя каждой стихии: свободная клетка
        // в 1.9–5 клетках от входа в СВОЁ подземелье — из компоненты
        // связности арки (река/хребет у входа не отрежут героя от мира;
        // стены городов непроходимы) ──────────────────────────────────────
        const spawn = {};
        for (let k = 0; k < 6; k++) {
            const d = pois.find((p) => p.elem === ELEMS[k] && p.kind === "dungeon");
            const passable = (i) => !blocked[i] && ter[i] !== T_MOUNTAIN
                && ter[i] !== T_FOREST && ter[i] !== T_WATER;
            // суша, соединённая с аркой (после прокладки дорог)
            const comp = new Uint8Array(N);
            const q = [d.gy * W + d.gx];
            comp[q[0]] = 1;
            for (let qi = 0; qi < q.length; qi++) {
                const c = q[qi], cx = c % W, cy = (c / W) | 0;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const ni = ny * W + nx;
                    if (!comp[ni] && passable(ni)) { comp[ni] = 1; q.push(ni); }
                }
            }
            let cand = [];
            for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
                const i = y * W + x, dist = Math.hypot(x - d.gx, y - d.gy);
                if (dist >= 1.9 && dist <= 5 && zone[i] === k && comp[i])
                    cand.push({ gx: x, gy: y });
            }
            if (!cand.length) { // страховка: любая суша рядом с аркой
                const c = spiral(d.gx, d.gy,
                    (x, y) => x >= 2 && y >= 2 && x < W - 2 && y < H - 2
                        && passable(y * W + x), 8);
                cand = [c || { gx: d.gx, gy: Math.min(H - 3, d.gy + 2) }];
            }
            spawn[ELEMS[k]] = cand[(rng() * cand.length) | 0];
        }

        // ── 8. строки коллизий (стены '#', вода '~', проход '.'): мост,
        // дорога и ПЛОЩАДИ городов проходимы; стены зданий — преграда;
        // арка данжа проходима (триггер по касанию) ──────────────────────
        const rows = [];
        for (let y = 0; y < H; y++) {
            let s = "";
            for (let x = 0; x < W; x++) {
                const i = y * W + x;
                if (ter[i] === T_WATER) s += "~";
                else if (ter[i] === T_MOUNTAIN || ter[i] === T_FOREST || blocked[i])
                    s += "#";
                else s += ".";
            }
            rows.push(s);
        }

        return {
            v: V, w: W, h: H, seed,
            ter, zone, rows, pois, spawn,
            centers: centers.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
        };
    }

    // ── имена точек интереса: столицы/данжи — из локализации, города —
    // слоги стихии (детерминировано сидом и языком, при смене языка мир
    // переименовывает города) ─────────────────────────────────────────────
    function namePois(map, lang) {
        const rngN = mulberry32((map.seed ^ 0x9E3779B9) + (lang === "en" ? 1013 : 77));
        const used = new Set();
        for (const p of map.pois) {
            if (p.kind === "capital") p.name = GAME_LOC.t(`world.capital.${p.elem}`);
            else if (p.kind === "dungeon")
                p.name = GAME_LOC.t(ELEM_CAVE_LABEL[p.elem]);
            else {
                const pre = GAME_LOC.arr(`world.townPre.${p.elem}`);
                const suf = GAME_LOC.arr(`world.townSuf.${p.elem}`);
                p.name = "";
                for (let t = 0; t < 14 && !p.name; t++) {
                    const n = pre[(rngN() * pre.length) | 0]
                        + suf[(rngN() * suf.length) | 0];
                    if (!used.has(n)) { used.add(n); p.name = n; }
                }
                if (!p.name) p.name = GAME_LOC.t(`elem.${p.elem}`) + " "
                    + (used.size + 1); // все слоги повторились — номер
            }
        }
        map.lang = lang;
    }

    globalThis.GAME_WORLDGEN = {
        V, W, H, ELEMS, ELEM_CAVE, KIND_SIZE, namePois, generate, hash2,
        T: { GROUND: T_GROUND, MOUNTAIN: T_MOUNTAIN, FOREST: T_FOREST,
            WATER: T_WATER, ROAD: T_ROAD, BRIDGE: T_BRIDGE },
    };
})();
