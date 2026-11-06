// ОХРАНА И ДИКИЕ ТОЧКИ ОТКРЫТОГО МИРА — часть worldGen.js (W64):
// секции 8b–8e генератора. placeGuards(env) получает снимок состояния
// generate() (env) и возвращает четыре массива; rng передаётся ОБЩИЙ —
// последовательность вызовов не менялась, миры по сиду те же.
(function () {
    globalThis.GAME_WORLDGEN_GUARDS = {
        placeGuards(env) {
            const { rows, pois, W, H, N, rng, ter, zone, ELEMS,
                T_BRIDGE, T_ROAD, T_MOUNTAIN, T_SWAMP, spawn, poiMask } = env;
        // ── 8b. бродячие отряды — «охрана» подземелий (просил юзер): по 4
        // отряда у каждого данжа патрулируют окрестности. Маршрут — 5 точек
        // в кольце 5–12 клеток от арки, у каждого отряда СВОЙ сектор 90°
        // (маршруты не пересекаются и не сходятся в одну точку: до любой
        // точки чужого маршрута этого же данжа — не меньше 3 клеток).
        // Точки — только в компоненте связности арки (река/хребет не
        // отрежут отряду путь домой). Данж без диалога врагов (Время)
        // мир пропустит при спавне — геометрия всё равно генерится для
        // всех арок, чтобы сид не зависел от набора подземелий
        const wanderers = [];
        {
            const ok = (x, y) => x >= 2 && y >= 2 && x < W - 2 && y < H - 2
                && rows[y][x] === ".";
            for (const dp of pois) {
                if (dp.kind !== "dungeon") continue;
                // суша, достижимая пешком от арки (после прокладки дорог)
                const comp = new Uint8Array(N);
                const q = [dp.gy * W + dp.gx];
                comp[q[0]] = 1;
                for (let qi = 0; qi < q.length; qi++) {
                    const c = q[qi], cx = c % W, cy = (c / W) | 0;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                        const ni = ny * W + nx;
                        if (!comp[ni] && rows[ny][nx] === ".") {
                            comp[ni] = 1; q.push(ni);
                        }
                    }
                }
                const taken = []; // точки чужих маршрутов этого же данжа
                for (let s = 0; s < 4; s++) {
                    const pts = [];
                    // 2 прохода: свой сектор 90°, при тесной стране (у края
                    // карты/за рекой полсектора — вода) — полукруг вокруг
                    // центра своего сектора (маршрут не растягивается)
                    for (let pass = 0; pass < 2 && pts.length < 5; pass++) {
                        for (let k = pts.length; k < 5; k++) {
                            for (let tries = 0; tries < 60; tries++) {
                                const ang = pass === 0
                                    ? (s + rng()) * (Math.PI * 2 / 4)
                                    : (s * 2 - 1 + rng() * 4) * (Math.PI * 2 / 8);
                                const r = 5 + rng() * 7; // 5–12 клеток от арки
                                const gx = dp.gx + Math.round(Math.cos(ang) * r);
                                const gy = dp.gy + Math.round(Math.sin(ang) * r);
                                if (!ok(gx, gy) || !comp[gy * W + gx]) continue;
                                if (taken.some((p) =>
                                    Math.hypot(p[0] - gx, p[1] - gy) < 3)) continue;
                                pts.push([gx, gy]); taken.push(pts[pts.length - 1]);
                                break;
                            }
                        }
                    }
                    if (!pts.length) continue; // совсем негде — отряда нет
                    wanderers.push({
                        cave: dp.cave,
                        gx: pts[0][0], gy: pts[0][1], // спавн — первая точка
                        route: pts,
                    });
                }
            }
        }

        // ── 8c. охранники мостов (просил юзер): бродячие враги, патрули-
        // рующие мосты через реки в зонах своих стихий. Один страж на
        // мост-«кластер» (связные клетки настила: русло в 3 клетки под
        // дорогой — один мост); стихия — зона центра кластера. Все 6
        // стихий прикрыты: зона Времени — «Охранник Времени» (heroes/53,
        // просил юзер W28). Маршрут — 4 точки в кольце 1.5–4.5 клетки
        // от моста, только проходимая суша из компоненты связности моста
        // (берега у стражи свои)
        const bridgeGuards = [];
        {
            const seen = new Uint8Array(N);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i0 = y * W + x;
                if (ter[i0] !== T_BRIDGE || seen[i0]) continue;
                const cl = [i0]; seen[i0] = 1; // кластер моста (4-связный)
                for (let qi = 0; qi < cl.length; qi++) {
                    const c = cl[qi], cx = c % W, cy = (c / W) | 0;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                        const ni = ny * W + nx;
                        if (!seen[ni] && ter[ni] === T_BRIDGE) {
                            seen[ni] = 1; cl.push(ni);
                        }
                    }
                }
                const cz = zone[cl[(cl.length / 2) | 0]];
                const mx = Math.round(cl.reduce((s, c) => s + (c % W), 0) / cl.length);
                const my = Math.round(cl.reduce((s, c) => s + ((c / W) | 0), 0) / cl.length);
                // суша, достижимая пешком от моста (берега + дороги)
                const comp = new Uint8Array(N);
                const q = cl.slice();
                for (const c of cl) comp[c] = 1;
                for (let qi = 0; qi < q.length; qi++) {
                    const c = q[qi], cx = c % W, cy = (c / W) | 0;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                        const ni = ny * W + nx;
                        if (!comp[ni] && rows[ny][nx] === ".") {
                            comp[ni] = 1; q.push(ni);
                        }
                    }
                }
                const pts = [];
                for (let k = 0; k < 4; k++) {
                    for (let tries = 0; tries < 40; tries++) {
                        const ang = (k + rng()) * (Math.PI / 2);
                        const r = 1.5 + rng() * 3; // 1.5–4.5 клетки от моста
                        const gx = mx + Math.round(Math.cos(ang) * r);
                        const gy = my + Math.round(Math.sin(ang) * r);
                        if (gx < 2 || gy < 2 || gx >= W - 2 || gy >= H - 2) continue;
                        if (rows[gy][gx] !== "." || !comp[gy * W + gx]) continue;
                        if (pts.some((p) => Math.hypot(p[0] - gx, p[1] - gy) < 2)) continue;
                        pts.push([gx, gy]);
                        break;
                    }
                }
                if (pts.length < 2) continue; // мост в скалах — стража нет
                bridgeGuards.push({
                    elem: ELEMS[cz],
                    gx: pts[0][0], gy: pts[0][1], // спавн — первая точка
                    route: pts,
                });
            }
        }

        // ── 8d. охранники Тлена (просил юзер, волна 13): в зоне Тлена рек
        // нет (v9) — мостовых у него не бывает. Его стражи патрулируют
        // горные проходы (дороги сквозь хребты) из зоны тьмы и болота;
        // числом — примерно как мостовые в других зонах: проходы у Тлена
        // получают стража на каждый кластер, болота добирают до нормы
        // (максимум из 6 и числа мостовых этого сида)
        const decayGuards = [];
        {
            const DZ = 3; // ELEMS[3] === "decay"
            // точки маршрута не липнут к POI (арки/площади городов) —
            // стража не караулит двери данжей и спавн героя
            const nearPoi = (gx, gy) => pois.some((p) =>
                Math.max(Math.abs(p.gx - gx), Math.abs(p.gy - gy)) <= 3);
            // суша, достижимая пешком от затравок (как у мостов: у стражи
            // своя береговая компонента — реки/хребты её режут)
            const compFrom = (seeds) => {
                const comp = new Uint8Array(N);
                const q = [];
                for (const c of seeds)
                    if (rows[(c / W) | 0][c % W] === "." && !comp[c]) {
                        comp[c] = 1; q.push(c);
                    }
                for (let qi = 0; qi < q.length; qi++) {
                    const c = q[qi], cx = c % W, cy = (c / W) | 0;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                        const ni = ny * W + nx;
                        if (!comp[ni] && rows[ny][nx] === ".") {
                            comp[ni] = 1; q.push(ni);
                        }
                    }
                }
                return comp;
            };
            // маршрут 2–4 точки в кольце r0..r0+3 клетки от точки по 4
            // углам, только проходимая суша из comp, попарно ≥2 (как у
            // мостов); спавн — первая точка
            const routeNear = (mx, my, comp, r0) => {
                const pts = [];
                for (let k = 0; k < 4; k++) {
                    for (let tries = 0; tries < 40; tries++) {
                        const ang = (k + rng()) * (Math.PI / 2);
                        const r = r0 + rng() * 3;
                        const gx = mx + Math.round(Math.cos(ang) * r);
                        const gy = my + Math.round(Math.sin(ang) * r);
                        if (gx < 2 || gy < 2 || gx >= W - 2 || gy >= H - 2)
                            continue;
                        if (rows[gy][gx] !== "." || !comp[gy * W + gx])
                            continue;
                        if (nearPoi(gx, gy)) continue;
                        if (pts.some((p) =>
                            Math.hypot(p[0] - gx, p[1] - gy) < 2)) continue;
                        pts.push([gx, gy]);
                        break;
                    }
                }
                return pts;
            };
            const cluster = (i0, kind, seen) => {
                const cl = [i0]; seen[i0] = 1;
                for (let qi = 0; qi < cl.length; qi++) {
                    const c = cl[qi], cx = c % W, cy = (c / W) | 0;
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                        const ni = ny * W + nx;
                        if (!seen[ni] && ter[ni] === kind) {
                            seen[ni] = 1; cl.push(ni);
                        }
                    }
                }
                return cl;
            };
            // 1) горные проходы из зоны тьмы: кластеры дорог, у которых
            // есть гора в чебышёв-1 (дорога идёт сквозь хребет) и клетки
            // зоны Тлена в кольце 6. Страж ходит у УСТЬЯ — края кластера
            // на стороне Тлена
            const seenR = new Uint8Array(N);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i0 = y * W + x;
                if (ter[i0] !== T_ROAD || seenR[i0]) continue;
                const cl = cluster(i0, T_ROAD, seenR);
                let inMtn = false;
                for (const c of cl) {
                    const cx = c % W, cy = (c / W) | 0;
                    for (let dy = -1; dy <= 1 && !inMtn; dy++)
                        for (let dx = -1; dx <= 1; dx++) {
                            if (!dx && !dy) continue;
                            const nx = cx + dx, ny = cy + dy;
                            if (nx < 0 || ny < 0 || nx >= W || ny >= H)
                                continue;
                            if (ter[ny * W + nx] === T_MOUNTAIN) {
                                inMtn = true; break;
                            }
                        }
                    if (inMtn) break;
                }
                if (!inMtn) continue; // дорога вне гор — не проход
                let nearD = false;
                for (const c of cl) {
                    const cx = c % W, cy = (c / W) | 0;
                    for (let dy = -6; dy <= 6 && !nearD; dy++)
                        for (let dx = -6; dx <= 6; dx++) {
                            const nx = cx + dx, ny = cy + dy;
                            if (nx < 0 || ny < 0 || nx >= W || ny >= H)
                                continue;
                            if (zone[ny * W + nx] === DZ) {
                                nearD = true; break;
                            }
                        }
                    if (nearD) break;
                }
                if (!nearD) continue; // проход чужой зоны
                // устье: клетка кластера ближе прочих к зоне Тлена
                let bi = 0, bd = Infinity;
                for (let ci = 0; ci < cl.length; ci++) {
                    const cx = cl[ci] % W, cy = (cl[ci] / W) | 0;
                    let d = Infinity;
                    for (let dy = -7; dy <= 7; dy++)
                        for (let dx = -7; dx <= 7; dx++) {
                            const nx = cx + dx, ny = cy + dy;
                            if (nx < 0 || ny < 0 || nx >= W || ny >= H)
                                continue;
                            if (zone[ny * W + nx] === DZ)
                                d = Math.min(d, Math.hypot(dx, dy));
                        }
                    if (d < bd) { bd = d; bi = ci; }
                }
                const mx = cl[bi] % W, my = (cl[bi] / W) | 0;
                const pts = routeNear(mx, my, compFrom(cl), 1.5);
                if (pts.length < 2) continue; // проход в скалах — тесно
                decayGuards.push({
                    elem: "decay",
                    gx: pts[0][0], gy: pts[0][1], // спавн — первая точка
                    route: pts,
                });
            }
            // 2) болота: кластеры T_SWAMP (болота растут только в Тлене,
            // 3b); страж ходит ВКОЛО края болота — радиус от центра с
            // запасом на размер кляксы. Добор до нормы мостовых
            const norm = Math.max(6, bridgeGuards.length);
            const seenS = new Uint8Array(N);
            for (let y = 0; y < H && decayGuards.length < norm; y++)
                for (let x = 0; x < W && decayGuards.length < norm; x++) {
                    const i0 = y * W + x;
                    if (ter[i0] !== T_SWAMP || seenS[i0]) continue;
                    const cl = cluster(i0, T_SWAMP, seenS);
                    const mx = Math.round(cl.reduce((s, c) => s + (c % W), 0)
                        / cl.length);
                    const my = Math.round(cl.reduce((s, c) =>
                        s + ((c / W) | 0), 0) / cl.length);
                    // суша вокруг болота: 4-соседи кластера (гать — тоже
                    // суша), компонента от них
                    const seeds = [];
                    for (const c of cl) {
                        const cx = c % W, cy = (c / W) | 0;
                        for (const [dx, dy] of
                            [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            const nx = cx + dx, ny = cy + dy;
                            if (nx < 0 || ny < 0 || nx >= W || ny >= H)
                                continue;
                            if (rows[ny][nx] === ".")
                                seeds.push(ny * W + nx);
                        }
                    }
                    if (!seeds.length) continue; // болото замуровано
                    const r0 = Math.sqrt(cl.length / Math.PI) + 1.5;
                    const pts = routeNear(mx, my, compFrom(seeds), r0);
                    if (pts.length < 2) continue; // болото в скалах — тесно
                    decayGuards.push({
                        elem: "decay",
                        gx: pts[0][0], gy: pts[0][1], // спавн — первая
                        route: pts,
                    });
                }
        }

        // ── 8e-pre. (W44, юзер) ни один враг открытого мира не спавнится
        // у стартовой позиции героя — игрок должен успеть сориентироваться
        // и осмотреться, погоня не срывается на старте. Старт героя —
        // map.spawn[стихия] (6 точек у стартовых городов, мир ставит героя
        // в точку его стихии, world.js:916). Радиус покоя 16 клеток:
        // агро диких — 9 клеток (288px), стражей — 4.5 (144px), 16 даёт
        // запас. Проверяется ВЕСЬ маршрут отряда (спавн — первая точка,
        // патруль ходит по всем, у арки данжа маршрут 5–12 клеток).
        // Отряды у стартов удаляются ДО того, как их точки попадут в
        // запрет диких (guardPts) — место у старта не резервируется
        const START_SAFE = 16;
        const spawnPts = ELEMS.map((e) => spawn[e]).filter(Boolean)
            .map((s) => [s.gx, s.gy]);
        const nearStart = (pts) => pts.some(([gx, gy]) =>
            spawnPts.some(([sx, sy]) => Math.hypot(sx - gx, sy - gy)
                < START_SAFE));
        for (const list of [wanderers, bridgeGuards, decayGuards])
            for (let i = list.length - 1; i >= 0; i--)
                if (nearStart(list[i].route)) list.splice(i, 1);

        // ── 8e. точки спавна ДИКИХ врагов (просил юзер W29): ~12 на зону
        // в проходимых местах (не лес/гора/река/болото/стены), на равном
        // удалении друг от друга (best-candidate сэмпл даёт ровное
        // разрежение) и НЕ на маршрутах стражей мостов/данжей/Тлена и
        // подземелий (не пересекаются с их патрулями). Не липнут к POI
        // (площади/арки) и точкам появления героя (W44: не ближе 16
        // клеток — было 5, радиус агро диких 9 клеток и герой получал
        // погоню сразу на старте). route = своя точка:
        // стоящий враг «патрулирует» одно место, а после погони
        // возвращается на него (поводок — как у стражей)
        const wildSpawns = [];
        {
            const guardPts = [];
            for (const w of wanderers)
                for (const [gx, gy] of w.route) guardPts.push([gx, gy]);
            for (const g of bridgeGuards)
                for (const [gx, gy] of g.route) guardPts.push([gx, gy]);
            for (const g of decayGuards)
                for (const [gx, gy] of g.route) guardPts.push([gx, gy]);
            const poiPts = pois.map((p) => [p.gx, p.gy]);
            const farAll = (x, y, pts, d) => pts.every(([px, py]) =>
                Math.hypot(px - x, py - y) >= d);
            // W60 (юзер): «карманы» — суша, запертая рекой и горами, —
            // героя недостижимы, дикий там неопровержим. Достижимая суша =
            // компонента связности точек появления героя (многоисточниковый
            // BFS по «.»); точка вне её не берётся вообще
            const reach = new Map();
            {
                const queue = [];
                const seeds = Object.values(spawn).filter(Boolean);
                for (const sp of seeds) {
                    // spawn-точка — { gx, gy } (клетка у города), null — мимо
                    if (!sp) continue;
                    const sx = sp.gx, sy = sp.gy;
                    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
                    if (rows[sy][sx] !== ".") continue;
                    const k0 = sy * W + sx;
                    if (!reach.has(k0)) { reach.set(k0, 0); queue.push([sx, sy]); }
                }
                while (queue.length) {
                    const [x, y] = queue.shift();
                    const d = reach.get(y * W + x);
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                        const nk = ny * W + nx;
                        if (reach.has(nk) || rows[ny][nx] !== ".") continue;
                        reach.set(nk, d + 1);
                        queue.push([nx, ny]);
                    }
                }
            }
            for (let k = 0; k < 6; k++) {
                const chosen = [];
                for (let n = 0; n < 12; n++) {
                    // смягчение: если зона тесная (чащи/болота/стражи),
                    // порог разрежения опускается — точка всё равно
                    // обязана быть проходимой, достижимой и вне запретов
                    for (const minD of [16, 10, 5, 0]) {
                        let best = null, bd = -1;
                        for (let t = 0; t < 60; t++) {
                            const x = 3 + (rng() * (W - 6)) | 0;
                            const y = 3 + (rng() * (H - 6)) | 0;
                            const i = y * W + x;
                            if (zone[i] !== k || rows[y][x] !== ".") continue;
                            if (!reach.has(i)) continue; // недостижимый «карман»
                            if (poiMask[i]) continue; // площади и стены зданий
                            if (!farAll(x, y, guardPts, 8)) continue;
                            if (!farAll(x, y, poiPts, 6)) continue;
                            if (!farAll(x, y, spawnPts, START_SAFE)) continue;
                            let md = Infinity;
                            for (const c of chosen)
                                md = Math.min(md, Math.hypot(c[0] - x, c[1] - y));
                            if (chosen.length && md < minD) continue;
                            if (md > bd) { bd = md; best = [x, y]; }
                        }
                        if (best) {
                            chosen.push(best);
                            wildSpawns.push({ elem: ELEMS[k],
                                gx: best[0], gy: best[1], route: [best] });
                            break;
                        }
                    }
                }
            }
        }
            return { wanderers, bridgeGuards, decayGuards, wildSpawns };
        },
    };
})();
