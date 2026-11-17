// СЦЕНА «ОТКРЫТЫЙ МИР» — глобальная карта континента (генератор —
// worldGen.js, референсы: Shandalar, forge-adventure): 6 зон по стихиям
// (верх — Сила/Рост/Мудрость, низ — Тлен/Честь/Время), в каждой —
// столица 5×4 клетки, ~десяток городов 5×3 и вход в подземелье стихии
// (города стоят редко — ~9+ клеток между якорями). Путь преграждают
// горы, чащи и реки (мосты — только на дорогах), города связывают
// дороги; здания непроходимы, кроме якоря-площади. Карта
// детерминирована сидом забега (G.world.seed): «новая игра» каждый раз
// генерирует новую, «Продолжить» поднимает ту же.
// РЕНДЕР ЧАНКАМИ (просил юзер: движок не должен рисовать весь открытый
// мир): карта порезана на блоки 32×32 клетки — в сцене живут только
// чанки видимого экрана плюс запас по краям, остальные достраиваются,
// когда камера до них доезжает (кэш LRU переживает развороты камеры).
// Чанк = тайлы местности + болота (swamp.png) + лес-оверлей + дороги
// (roads.png, 11 видов) + мосты; ДЕРЕВЬЯ и ГОРЫ (спрайты юзера) живут
// в ОБЩЕМ слое объектов с городами, подземельями и героем с сортиров-
// кой по Y (просил юзер: кроны поверх дорог/мостов, z-order по
// координате Y) — чанки отдают их списком, слой включается/выключается
// вместе с чанком. POI и герой не чанкируются (их мало), но вне экрана
// отключаются.
// Передвижение — как в подземелье: WASD/стрелки и клик по земле (BFS-
// путь с ведением героя виртуальными осями). Вход в пещеру — триггер по
// касанию: продолжает текущий этаж забега (G.dungeonStates) или начинает
// первый. Города пока без функционала (просил юзер — потом добавим).
// БРОДЯЧИЕ ОТРЯДЫ (просил юзер): «охрана» подземелий — по 3 отряда у
// каждой арки патрулируют окрестности; ОХРАННИКИ МОСТОВ — по стражу у
// каждого моста через реку в зоне своей стихии (все 6 стихий); ДИКИЕ
// ВРАГИ ТОЧЕК СПАВНА (просил юзер W29) — ~12 на зону в проходимых
// местах вне маршрутов стражей: стоят на месте (после погони
// возвращаются), но заметят героя ВДВОЕ дальше (агро ×2); вид — из
// спавн-пула стихии по редкостным весам, ядро колоды — 9 случайных
// Обычных карт стихии при спавне, победа над одним усиливает всех
// одноимённых (+1 макс. жизнь и +1 Редкая карта в ядро). Все
// отряды — полноценные персонажи мира: спрайтшиты существ своей стихии,
// ходят по сетке 4 направлениями (BFS) и разворачиваются как герой
// (контроллер characters, виртуальный ввод). Маршруты генерит worldGen
// по сиду. Заметив героя (4.5 клетки, путь есть) — преследуют, но
// недалеко от маршрута (поводок 9 клеток от его центра); скорость —
// 0.9 от героевой; касание отряда — бой, как в подземелье. Наведение
// курсора — карта персонажа героя отряда + состав его колоды (просил
// юзер). Побеждённый отряд уходит с карты навсегда (жив/мёртв и позиция
// — в сейве забега). Вход в подземелье требует растущую колоду: 16 карт
// на 1-й этаж, +1 за следующий (просил юзер); открытый мир живёт по
// минимуму 12 — отряды фармят недостающие карты.
// В правом нижнем углу — мини-карта всего мира (просил юзер) с живым
// маркером героя.
(function () {
    // клетка мира 32px (просил юзер: общий стандарт + нативный размер
    // тайлсета images/tiles — листы 4×4 по 32px идут в масштабе 1:1).
    // Вид — БЕЗ зума (просил юзер): спрайты тайлов в натуральную
    // величину, зум портил и пикселизировал графику; камера ×1
    const TS = 32;
    const HERO_SPEED = 136; // 4.25 кл/с — прежний темп в клетках
    const ROAD_SPEED = HERO_SPEED * 1.2; // по дорогам/мостам ×1.2 (просил юзер)
    // бродячие отряды (просил юзер): скорость 0.9 от героевой; агро —
    // 4.5 клетки, поводок погони — 9 клеток от центра своего маршрута
    const WAND_SPEED = HERO_SPEED * 0.9;
    const BOSS_SPEED = HERO_SPEED * 1.35; // полёт мирового босса (W136)
    const WAND_AGGRO = TS * 4.5;
    const WAND_LEASH = TS * 9;

    // палитры зон: крыши городов и цвет чащ на мини-карте — у каждой
    // стихии свой характер (земля зон и ЛЕСНЫЕ МАССИВЫ — тайлы
    // worldTiles.js: местность + прозрачный оверлей wood.png поверх,
    // цвета мини-карты — в GAME_WORLDTILES.MINI)
    const ROOF = {
        strength: 0x8a3f2e, growth: 0x4f7a3a, wisdom: 0x3f6d8a,
        decay: 0x5f4a6e, honor: 0xd8d2c0, time: 0xb08a3f,
    };
    const FOREST = {
        strength: 0x3d3d26, growth: 0x2c3f22, wisdom: 0x2a3630,
        decay: 0x2e2833, honor: 0x555440, time: 0x4a3f22,
    };

    function createWorldScene(ctx) {
        const { COMPONENTS, camera, characters, charInput, ECS, world, scenes,
            G, worldContainer, uiTex } = ctx;
        const GEN = globalThis.GAME_WORLDGEN;
        const T = GEN.T;
        let layer = null, heroId = null, heroShadow = null, heroSprite = null;
        let questArrow = null; // стрелка к цели задания (W31)
        let worldTerr = null; // коды местности клетки (слой worldTiles)
        let terrStats = null; // статистика слоя (тесты: fallback/odd)
        let woodStats = null; // статистика лесного оверлея wood.png (тесты)
        let swampStats = null; // статистика болот swamp.png (тесты)
        let roadStats = null; // статистика дорог roads.png (тесты)
        let moatStats = null; // статистика мостов moats.png (тесты)
        let objLayer = null; // общий y-sort слой: деревья/горы/POI/герой
        let fxLayer = null; // всплывающие надписи — ВСЕГДА на переднем плане
        let chunkHolder = null; // контейнер активных чанков рендера
        let chunkCache = null; // Map: ключ чанка → {node, objs, active, used}
        let chunkRect = ""; // набор активных чанков — «cx0,cy0,cx1,cy1»
        let chunkClock = 0; // часы LRU (свежесть использования чанка)
        let mapFrame = null; // рамка карты (не чанкируется)
        let poiNodes = null; // [{node,x,y}] — видимость POI вне экрана
        let treeCount = 0; // деревьев построено (тесты)
        let mtnCount = 0; // спрайтов гор построено (тесты)
        let uiHud = null;
        let path = null; // клик-перемещение: очередь центров клеток (мировые px)
        // W60: во время первой половины «прожига» (кольцо сжимается над
        // миром до смены сцены) герой стоит и триггеры городов/пещер молчат
        let worldLock = false;
        // счётчик дней открытого мира: 20 секунд реального времени = 1 день
        let daysAcc = 0;
        let zoneRef = null; // клик-зона местности (тесты: clickAt)
        const hudBtns = []; // иконки-кнопки HUD (тесты: hudNodes)
        let floaties = []; // всплывающие подписи («Скоро…» у арки)
        let soonCount = 0; // сколько раз арка сказала «Скоро…» (тесты)
        // бродячие отряды (просил юзер): охрана данжей + охранники мостов.
        // Ходят как герой — сущности characters с виртуальным вводом:
        // спрайтшит существ своей стихии, анимации walk_* и разворот
        // делает контроллер, маршрут — BFS по 4 направлениям
        // s = { kind: "cave"|"bridge"|"decay"|"wild", key, d, st, enc,
        //       id, sprite, shadow, wp, path, aggro, repath }
        let squads = [];
        let tip = null; // { squad, node, hero } — подсказка на отряде (курсор)
        let poiGlows = []; // жёлтые свечения городов-адресатов писем (W40)
        let startGlow = null; // свечение стартового города новой игры (W67)
        let sideArrows = null; // стрелки побочных квестов: red/yellow (W40)

        // карта мира живёт в забеге: генерится по сиду один раз и
        // переживает переходы сцены (сейв хранит только сид)
        function ensureMap() {
            if (G.world.seed === undefined || G.world.seed === null)
                G.world.seed = (Math.random() * 0x7fffffff) | 0;
            if (!G.world.map || G.world.map.seed !== G.world.seed)
                G.world.map = GEN.generate(G.world.seed);
            if (G.world.map.lang !== GAME_LOC.lang)
                GEN.namePois(G.world.map, GAME_LOC.lang);
            return G.world.map;
        }

        // динамическое состояние отрядов (жив/мёртв, где стоит) живёт в
        // забеге — сейв хранит его рядом с сидом карты; геометрия и
        // маршруты детерминированы сидом (worldGen, map.wanderers +
        // map.bridgeGuards + map.decayGuards). Ключи "cave:i",
        // "bridge:j" и "decay:j" в одном словаре — победа над отрядом
        // (arenaFlow) снимает его по G.activeEnemy.wander
        function ensureWander() {
            const map = G.world.map;
            if (!G.world.wander) G.world.wander = {};
            if (map.wanderers) for (let i = 0; i < map.wanderers.length; i++) {
                const d = map.wanderers[i];
                if (!globalThis.GAME_DATA.CAVES[d.cave]) continue; // hon — данжа ещё нет
                const k = "cave:" + d.cave + ":" + i;
                if (!G.world.wander[k]) G.world.wander[k] = {
                    alive: true, x: (d.gx + 0.5) * TS, y: (d.gy + 0.5) * TS };
            }
            for (const [list, kind] of [["bridgeGuards", "bridge"],
                                        ["decayGuards", "decay"]]) {
                if (!map[list]) continue;
                for (let j = 0; j < map[list].length; j++) {
                    const d = map[list][j];
                    if (!guardEncOf(d.elem)) continue; // стихии без стражей нет
                    const k = kind + ":" + j;
                    if (!G.world.wander[k]) G.world.wander[k] = {
                        alive: true, x: (d.gx + 0.5) * TS, y: (d.gy + 0.5) * TS };
                }
            }
            // дикие враги точек спавна (просил юзер W29): вид — из пула
            // стихии по редкостным весам (детерминировано сидом мира и
            // номером точки), колода — 9 случайных Обычных карт стихии
            // плюс усиление за победы над одноимёнными (уровень вида —
            // в wildLevel). Состав колоды живёт в сейве отряда
            if (!G.world.wildLevel) G.world.wildLevel = {};
            // мировые боссы (W136): реестр убитых НАВСЕГДА; сам отряд
            // (G.world.wander["boss:<enc>"]) спавнит bossDayTick
            if (!G.world.bossKilled) G.world.bossKilled = {};
            {
                const D = globalThis.GAME_DATA;
                if (map.wildSpawns) {
                    for (let i = 0; i < map.wildSpawns.length; i++) {
                        const d = map.wildSpawns[i];
                        const k = "wild:" + d.elem + ":" + i;
                        if (G.world.wander[k]) continue;
                        const enc = D.wildPick(d.elem, G.world.seed, i);
                        if (!enc) continue;
                        const lvl = G.world.wildLevel[enc] || 0;
                        // «разбойники» (редкие дикие, W40): ядро 8 Обычных +
                        // 3 Редких + 1 Эпическая (raiderDeck); «Простые» —
                        // 9 Обычных + Редкие за уровень (wildDeck)
                        const rd = D.ENCOUNTERS[enc]
                            && D.ENCOUNTERS[enc].genDeck === "raider";
                        G.world.wander[k] = {
                            alive: true,
                            x: (d.gx + 0.5) * TS, y: (d.gy + 0.5) * TS,
                            enc, hpBonus: lvl,
                            deck: rd
                                ? D.raiderDeck(d.elem, lvl,
                                    (G.world.seed ^ ((i + 1) * 2654435761)) | 0)
                                : D.wildDeck(d.elem, lvl,
                                    (G.world.seed ^ ((i + 1) * 2654435761)) | 0),
                        };
                    }
                }
            }
        }
        // архетип отряда-охраны данжа: 1-й этаж охраняемого подземелья;
        // при двух архетипах этажа выбор детерминирован сидом (тутип мира
        // и бой показывают один и тот же состав колоды всегда)
        function wanderEnc(d, i) {
            const D = globalThis.GAME_DATA;
            const rows = D.MOB_TABLES[d.cave] || D.MOB_TABLES.gob;
            const tab = rows[0];
            if (tab.length === 1) return tab[0];
            return tab[(GEN.hash2(G.world.seed, i * 131 + d.cave.length * 17, 7)
                * tab.length) | 0];
        }
        // энкаунтер охранника моста по стихии (Время — «Охранник Времени»,
        // просил юзер W28)
        function guardEncOf(elem) {
            return { strength: "strGuard", growth: "grwGuard",
                wisdom: "wisGuard", decay: "decGuard", honor: "honGuard",
                time: "timGuard" }[elem] || null;
        }

        // тело городов мира — препятствие (W42, юзер): правило в
        // GAME_SIDEQ.cityBlockAt (единственная точка), здесь мемо-кэш
        // по клеткам — walkable зовётся BFS-ами десятки тысяч раз
        let blkCache = { map: null, m: new Map() };
        function cellBlocked(map, gx, gy) {
            const sq = globalThis.GAME_SIDEQ;
            if (!sq || !sq.cityBlockAt) return false;
            if (blkCache.map !== map) blkCache = { map, m: new Map() };
            const k = gy * map.w + gx;
            let v = blkCache.m.get(k);
            if (v === undefined) {
                v = sq.cityBlockAt(map, gx, gy);
                blkCache.m.set(k, v);
            }
            return v;
        }
        function walkable(gx, gy) {
            const map = G.world.map;
            if (!map || gx < 0 || gy < 0 || gx >= map.w || gy >= map.h) return false;
            const ch = map.rows[gy][gx];
            if (ch === "#" || ch === "~") return false;
            return !cellBlocked(map, gx, gy);
        }
        function bfsPath(sx, sy, tx, ty) {
            const map = G.world.map, W = map.w, H = map.h;
            if (sx === tx && sy === ty) return null;
            if (!walkable(sx, sy) || !walkable(tx, ty)) return null;
            const key = (x, y) => y * W + x;
            const prev = new Map([[key(sx, sy), null]]);
            const q = [[sx, sy]];
            for (let qi = 0; qi < q.length; qi++) {
                const [cx, cy] = q[qi];
                if (cx === tx && cy === ty) break;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
                    if (walkable(nx, ny) && !prev.has(k)) {
                        prev.set(k, [cx, cy]);
                        q.push([nx, ny]);
                    }
                }
            }
            if (!prev.has(key(tx, ty))) return null;
            const cells = [];
            for (let c = [tx, ty]; c; c = prev.get(key(c[0], c[1]))) cells.push(c);
            cells.reverse();
            return cells.slice(1).map(([cx, cy]) =>
                ({ x: cx * TS + TS / 2, y: cy * TS + TS / 2 }));
        }
        // Путь с доводкой: клик в непроходимую клетку (гора, вода, стена,
        // иконка у стены) ведёт героя к ближайшей проходимой клетке в
        // радиусе 2 от цели (просил юзер W22)
        function pathTo(sx, sy, tx, ty) {
            if (walkable(tx, ty)) return bfsPath(sx, sy, tx, ty);
            for (let r = 1; r <= 2; r++) {
                const cand = [];
                for (let dy = -r; dy <= r; dy++)
                    for (let dx = -r; dx <= r; dx++)
                        if (Math.max(Math.abs(dx), Math.abs(dy)) === r)
                            cand.push([tx + dx, ty + dy]);
                cand.sort((a, b) =>
                    Math.hypot(a[0] - tx, a[1] - ty) - Math.hypot(b[0] - tx, b[1] - ty));
                for (const [x, y] of cand) {
                    if (!walkable(x, y)) continue;
                    const p = bfsPath(sx, sy, x, y);
                    if (p) return p;
                }
            }
            return null;
        }
        function setHeroAxes(ix, iy) {
            COMPONENTS.ctrlVI[heroId] = ix;
            COMPONENTS.ctrlVJ[heroId] = iy;
        }
        const px = (p) => ({ x: p.gx * TS + TS / 2, y: p.gy * TS + TS / 2 });
        // большой ли регион у клетки (кап 120 клеток): карманы (лес + тело
        // города, баг юзера W62) малы — герой в них застревает; достигнутый
        // кап означает выход в открытый мир
        function bigRegion(gx, gy) {
            if (!walkable(gx, gy)) return false;
            const W = G.world.map.w;
            const seen = new Set([gy * W + gx]);
            const q = [[gx, gy]];
            for (let qi = 0; qi < q.length; qi++) {
                if (q.length >= 120) return true;
                const [cx, cy] = q[qi];
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy, k = ny * W + nx;
                    if (seen.has(k) || !walkable(nx, ny)) continue;
                    seen.add(k);
                    q.push([nx, ny]);
                }
            }
            return false;
        }
        // ближайшая свободная клетка не ближе 1.4 клетки от точки (герой
        // выходит из пещеры рядом с аркой, но не на самом триггере).
        // W62 (юзер): первый проход берёт только клетки БОЛЬШОГО региона —
        // свободная клетка внутри закрытого кармана героя запирает; если
        // таких рядом нет — прежнее поведение (как получится)
        function freeCellNear(x, y) {
            const gx = Math.floor(x / TS), gy = Math.floor(y / TS);
            for (let pass = 0; pass < 2; pass++)
                for (let r = 2; r <= 5; r++)
                    for (let dy = -r; dy <= r; dy++)
                        for (let dx = -r; dx <= r; dx++) {
                            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                            if (Math.hypot(dx, dy) < 1.4) continue;
                            const nx = gx + dx, ny = gy + dy;
                            if (!walkable(nx, ny)) continue;
                            if (pass === 0 && !bigRegion(nx, ny)) continue;
                            return { x: nx * TS + TS / 2, y: ny * TS + TS / 2 };
                        }
            return { x, y };
        }
        const cavePoi = (caveId) =>
            G.world.map.pois.find((p) => p.kind === "dungeon" && p.cave === caveId);

        // ── ЧАНКОВЫЙ CULLING (просил юзер: рендерится только видимый экран
        // плюс запас по краям, остальное достраивается, когда камера до
        // него доезжает). Чанк = местность + болота + лес-оверлей + дороги
        // + мосты одного блока 32×32 клетки (1024px); ДЕРЕВЬЯ и ГОРЫ
        // чанка живут в общем y-sort слое (objLayer) вместе с POI и
        // героем (просил юзер: z-order по Y, кроны поверх дорог) — при
        // выключении чанка его спрайты уходят из слоя. Активный набор —
        // прямоугольник экрана + полчанка запаса; кэш LRU переживает
        // развороты камеры (18 чанков). POI и герой не чанкируются
        // (их десятки), но вне экрана с запасом отключаются
        const CHUNK_CELLS = globalThis.GAME_WORLDTILES.CHUNK;
        const CHUNK_PX = CHUNK_CELLS * TS; // 1024px
        const CHUNK_LRU = 18;

        function buildChunk(cx, cy) {
            const c = new PIXI.Container();
            const x0 = cx * CHUNK_CELLS, y0 = cy * CHUNK_CELLS;
            const map = G.world.map;
            c.addChild(globalThis.GAME_WORLDTILES.renderChunk(
                map, worldTerr, ctx.worldSheets, TS, x0, y0, terrStats,
                G.world.seed).container);
            if (ctx.worldSheets.swamp)
                c.addChild(globalThis.GAME_WORLDTILES.renderSwampChunk(
                    map, ctx.worldSheets, TS, x0, y0, swampStats).container);
            c.addChild(globalThis.GAME_WORLDTILES.renderForestChunk(
                map, ctx.worldSheets, TS, x0, y0, woodStats).container);
            if (ctx.roadsTex && ctx.roadsTex.length)
                c.addChild(globalThis.GAME_WORLDTILES.renderRoadsChunk(
                    map, ctx.roadsTex, TS, x0, y0, roadStats).container);
            if (ctx.moatsTex && ctx.moatsTex.length)
                c.addChild(globalThis.GAME_WORLDTILES.renderMoatsChunk(
                    map, ctx.moatsTex, TS, x0, y0, moatStats).container);
            const objs = [];
            if (ctx.treeTex && ctx.treeTex.length) {
                const tr = globalThis.GAME_WORLDTILES.renderTreesChunk(
                    map, ctx.treeTex, TS, G.world.seed, x0, y0);
                objs.push(...tr.sprites);
                treeCount += tr.trees;
            }
            if (ctx.mountainTex && ctx.mountainTex.length) {
                const mt = globalThis.GAME_WORLDTILES.renderMountainsChunk(
                    map, ctx.mountainTex, TS, G.world.seed, x0, y0);
                objs.push(...mt.sprites);
                mtnCount += mt.mountains;
            }
            return { node: c, objs };
        }
        // честный видимый прямоугольник мира — из обратного трансформа
        // контейнера камеры (не зависим от внутренностей camera)
        function visibleRect() {
            const tl = worldContainer.toLocal({ x: 0, y: 0 });
            const br = worldContainer.toLocal({
                x: ctx.app.screen.width, y: ctx.app.screen.height });
            const x0 = Math.min(tl.x, br.x), y0 = Math.min(tl.y, br.y);
            const x1 = Math.max(tl.x, br.x), y1 = Math.max(tl.y, br.y);
            return [x0, y0, x1, y1];
        }
        function updateChunks() {
            if (!chunkHolder || !G.world.map) return;
            const [rx0, ry0, rx1, ry1] = visibleRect();
            const pad = CHUNK_PX / 2; // запас полчанка по каждому краю
            const map = G.world.map;
            const mx = Math.ceil(map.w / CHUNK_CELLS) - 1;
            const my = Math.ceil(map.h / CHUNK_CELLS) - 1;
            const cx0 = Math.max(0, Math.floor((rx0 - pad) / CHUNK_PX));
            const cy0 = Math.max(0, Math.floor((ry0 - pad) / CHUNK_PX));
            const cx1 = Math.min(mx, Math.floor((rx1 + pad) / CHUNK_PX));
            const cy1 = Math.min(my, Math.floor((ry1 + pad) / CHUNK_PX));
            const key = cx0 + "," + cy0 + "," + cx1 + "," + cy1;
            chunkClock++;
            if (key === chunkRect) {
                for (const [, ch] of chunkCache)
                    if (ch.active) ch.used = chunkClock;
                return;
            }
            chunkRect = key;
            const want = new Set();
            for (let cy = cy0; cy <= cy1; cy++)
                for (let cx = cx0; cx <= cx1; cx++) want.add(cy * 64 + cx);
            for (const [k, ch] of chunkCache)
                if (ch.active && !want.has(k)) {
                    chunkHolder.removeChild(ch.node);
                    for (const o of ch.objs) objLayer.removeChild(o);
                    ch.active = false;
                }
            for (const k of want) {
                if (!chunkCache.has(k)) {
                    const built = buildChunk(k % 64, (k / 64) | 0);
                    chunkCache.set(k, {
                        node: built.node, objs: built.objs,
                        active: false, used: chunkClock });
                }
                const ch = chunkCache.get(k);
                if (!ch.active) {
                    chunkHolder.addChild(ch.node);
                    for (const o of ch.objs) objLayer.addChild(o);
                    ch.active = true;
                }
                ch.used = chunkClock;
            }
            if (chunkCache.size > CHUNK_LRU) {
                const dead = [...chunkCache.entries()]
                    .filter(([, ch]) => !ch.active)
                    .sort((a, b) => a[1].used - b[1].used)
                    .slice(0, chunkCache.size - CHUNK_LRU);
                for (const [k, ch] of dead) {
                    ch.node.destroy({ children: true });
                    for (const o of ch.objs) o.destroy();
                    chunkCache.delete(k);
                }
            }
        }
        // POI: вне экрана с запасом (чтобы не мигали при скролле) — invisible
        function updatePoiVisibility() {
            if (!poiNodes) return;
            const [rx0, ry0, rx1, ry1] = visibleRect();
            for (const pn of poiNodes)
                pn.node.visible = pn.x > rx0 - 320 && pn.x < rx1 + 320
                    && pn.y > ry0 - 256 && pn.y < ry1 + 320;
        }

        // рамка всей карты — один Graphics на всё (не чанкируется)
        function buildMapFrame(map) {
            const g = new PIXI.Graphics();
            g.rect(0, 0, map.w * TS, map.h * TS);
            g.stroke({ width: 4, color: 0x141b0f, alignment: 0.5 });
            return g;
        }

        // ── точки интереса: города/столицы/арки данжей ────────────────────
        function label(text, size, fill, yOff) {
            const t = new PIXI.Text({
                text, style: { fontFamily: "Kereru", fontSize: size, fill,
                    stroke: { color: 0x1c1207, width: 3 } },
            });
            t.anchor.set(0.5, 1);
            t.position.set(0, yOff);
            t.eventMode = "none";
            return t;
        }
        function makeTown(poi) {
            const c = new PIXI.Container();
            // спрайт юзера images/sities/<стихия>/1.png: 288×192 = 9×6
            // клетки (W41, юзер: города крупнее); арты в двух разрешениях
            // (288px у decay/honor/time/wisdom, 192px у strength/growth) —
            // масштаб нормируется по ширине, итог 9×6 у всех (W42);
            // анкер — низ footprint (якорь-клетка нижняя средняя, перед
            // входом), как у пещеры данжа (W39, юзер)
            const sp = new PIXI.Sprite(ctx.cityTex[poi.elem].town);
            sp.anchor.set(0.5, 1);
            sp.scale.set(288 / sp.texture.width);
            c.addChild(sp);
            c.addChild(label(poi.name, 16, 0xf3e6c2, -195));
            c.position.set((poi.gx + 0.5) * TS, (poi.gy + 1) * TS);
            c.zIndex = (poi.gy + 1) * TS; // низ footprint — y-sort общий
            return c;
        }
        function makeCapital(poi) {
            const c = new PIXI.Container();
            // спрайт юзера images/sities/<стихия>/0.png: 288×240 = 9×7.5
            // клетки (W41, юзер: города крупнее); нормировка по ширине —
            // 288px арты scale 1, старые 192px — 1.5 (W42); анкер — низ
            // footprint, как у пещеры данжа (W39)
            const sp = new PIXI.Sprite(ctx.cityTex[poi.elem].cap);
            sp.anchor.set(0.5, 1);
            sp.scale.set(288 / sp.texture.width);
            c.addChild(sp);
            c.addChild(label(poi.name, 20, 0xf0c96a, -243));
            c.position.set((poi.gx + 0.5) * TS, (poi.gy + 1) * TS);
            c.zIndex = (poi.gy + 1) * TS; // низ footprint — y-sort общий
            return c;
        }
        // пещера-подземелье: спрайт юзера cave.png (192×136 ≈ 6×4 клетки,
        // просил юзер), анкер в низ footprint, имя данжа над сводом.
        // Триггер входа — якорь-клетка (нижняя средняя, перед входом)
        function makeCave(poi) {
            const c = new PIXI.Container();
            const s = GEN.KIND_SIZE.dungeon;
            const x0 = poi.gx - ((s.w - 1) >> 1), y0 = poi.gy - (s.h - 1);
            const sp = new PIXI.Sprite(ctx.caveTex);
            sp.anchor.set(0.5, 1);
            c.addChild(sp);
            c.addChild(label(poi.name, 16, 0xffe9b0, -140));
            c.position.set((x0 + s.w / 2) * TS, (y0 + s.h) * TS);
            c.zIndex = (y0 + s.h) * TS; // низ footprint — y-sort общий
            return c;
        }

        // отряд-страж (просил юзер): полноценный персонаж мира —
        // спрайтшит существ СВОЕЙ стихии, те же анимации ходьбы и
        // развороты, что у героя (контроллер characters). Спрайт в
        // общий y-sort слой (zIndex по позиции ставит контроллер),
        // под ним — тень, как у героя
        function makeSquadNode(s) {
            // у мультицветных данжей своей строки в heroSheets нет:
            // «Белая пуща» (groHon) ходит рыцарем — «они же рыцари даже
            // по названию» (просил юзер), «Некро-раскопки» (timDec) —
            // некромантом necr_256 (просил юзер W86), «Рыжий лес» (strGro)
            // остаётся гоблином-разбойником; прочее — гоблин, как прежде
            const sheet = ctx.heroSheets[s.elem]
                || ctx.heroSheets[s.elem === "groHon" ? "honor"
                    : s.elem === "timDec" ? "decay" : "strength"];
            const sprite = new PIXI.AnimatedSprite(sheet.animations.walk_front, false);
            sprite.anchor.set(0.5, 1);
            sprite.scale.set(0.375); // как герой (96×96)
            const shadow = new PIXI.Graphics();
            shadow.ellipse(0, 0, 15, 7);
            shadow.fill({ color: 0x0e140c, alpha: 0.45 });
            return { sprite, shadow, sheet };
        }

        // W86 (тесты): каким heroSheets-ключом реально рисуется отряд
        // («Некро-раскопки» — necr/decay, «Белая пуща» — honor, …);
        // сравнение первой текстуры walk-анимации — имена листов не нужны.
        // W145: мировые боссы ходят СВОИМИ листами из creatureSheets
        // (dragonA/dragonM) — сканируем и их (heroSheets первым: алиасы
        // creatureSheets — те же объекты, что и heroSheets)
        const sheetNameOf = (ref) => {
            if (!ref || !ref.animations || !ref.animations.walk_front) return null;
            for (const [k, sh] of Object.entries(ctx.heroSheets)) {
                if (!sh.animations || !sh.animations.walk_front) continue;
                if (sh.animations.walk_front[0] === ref.animations.walk_front[0])
                    return k;
            }
            for (const [k, sh] of Object.entries(ctx.creatureSheets || {})) {
                if (!sh.animations || !sh.animations.walk_front) continue;
                if (sh.animations.walk_front[0] === ref.animations.walk_front[0])
                    return k;
            }
            return null;
        };

        // бой с отрядом: как касание врага в подземелье (arenaScene читает
        // G.activeEnemy), только флаг wander — трофей и реванш вернут в мир,
        // а победа снимет отряд с карты (ключ s.key). Тип врага — энкаунтер
        // отряда: архетип 1-го этажа данжа у охраны, охранник моста у мостов
        function fightSquad(s) {
            const D = globalThis.GAME_DATA;
            // бой с колодой меньше минимума открытого мира (12) запрещён:
            // запираем в редакторе колоды (данжи требуют свои 16+, просил
            // юзер — мир фармится отрядами со стартовыми 12)
            const need = D.deckMinFor(1);
            if (G.deck.length < need) {
                floatText(GAME_LOC.t("dungeon.deckLow", { min: need }),
                    COMPONENTS.positionX[heroId], COMPONENTS.positionY[heroId],
                    0xff9a6e);
                G.uiReturn = "world";
                scenes.go("deck");
                return;
            }
            G.world.heroPos = {
                x: COMPONENTS.positionX[heroId],
                y: COMPONENTS.positionY[heroId],
            };
            G.worldFrom = true; // трофей/поражение ведут в открытый мир
            // дикий враг играет СВОЕЙ колодой — сгенерённой при спавне
            // (9 Обычных стихии + Редкие за победы над одноимёнными);
            // усиление вида — hpBonus к базе (просил юзер W29)
            const deck = (s.kind === "wild" || s.kind === "boss") && s.st.deck
                ? [...s.st.deck] : D.enemyDeck(s.enc, 1);
            G.activeEnemy = { x: s.st.x, y: s.st.y, enc: s.enc,
                deck, alive: true, boss: false,
                wander: s.key, wild: s.kind === "wild",
                worldBoss: s.kind === "boss", // W136: мировой босс
                hpBonus: s.kind === "wild" ? (s.st.hpBonus || 0) : 0 };
            if (ctx.sfx) ctx.sfx("rocket"); // начало боя (W34, юзер)
            // W150 (юзер): фон экрана награды — затенённый кадр игры
            // (открытого мира) на момент старта боя, а не спрайт из меню
            if (G.__rewardShot) G.__rewardShot.destroy(true);
            G.__rewardShot = globalThis.GAME_UI.sceneShot(ctx);
            scenes.go("arena");
        }

        // ── МИРОВЫЕ БОССЫ (W136, спека юзера) ─────────────────────────────
        // Появляются каждые 10 игровых дней (начиная с 10-го) в случайной
        // точке края карты, летят к ближайшей свободной из 12 точек
        // (map.bossStops), сидят 5 дней, улетают за ближайший край.
        // Реагируют на игрока и преследуют, как бродячие монстры (сидя на
        // точке — тот же поводок/погоня, что у отрядов). Побеждённый —
        // больше не появляется (world.bossKilled); награда — фиксированная
        // карта ENCOUNTERS.<enc>.reward (G.rewardFixed). Полёт — прямой
        // записью позиции мимо коллизий контроллера (летит над водой/горами)
        function bossPickStop(gx, gy) {
            let best = null, bd = Infinity;
            for (const p of G.world.map.bossStops || []) {
                let busy = false;
                for (const k of Object.keys(G.world.wander)) {
                    if (String(k).indexOf("boss:") !== 0) continue;
                    const o = G.world.wander[k];
                    if (!o || !o.alive || !o.stop) continue;
                    if (o.stop.gx === p.gx && o.stop.gy === p.gy) { busy = true; break; }
                }
                if (busy) continue;
                const dd = Math.hypot(p.gx - gx, p.gy - gy);
                if (dd < bd) { bd = dd; best = p; }
            }
            return best;
        }
        function bossExitPoint(x, y) {
            const W = G.world.map.w * TS, H = G.world.map.h * TS;
            const dl = x, dr = W - x, dt = y, db = H - y;
            const m = Math.min(dl, dr, dt, db);
            if (m === dt) return { x, y: -TS * 2 };
            if (m === db) return { x, y: H + TS * 2 };
            if (m === dl) return { x: -TS * 2, y };
            return { x: W + TS * 2, y };
        }
        function spawnBossSquad(st, key) {
            // лист — СВОЙ у мировых боссов (арт юзера, W145: Акралон —
            // dragonA, Матузорг — dragonM); боссу без своего листа — по
            // ПЕРВОЙ стихии героя (Акралон — эльф/Рост, Матузорг — гоблин/
            // Сила), КРУПНЕЕ обычных отрядов и с багровым свечением охотника
            const BOSS_SHEETS = { akralon: "dragonA", matuzorg: "dragonM" };
            const hd = globalThis.GAME_DATA.HEROES[
                globalThis.GAME_DATA.ENCOUNTERS[st.enc].hero];
            const sheet = (BOSS_SHEETS[st.enc]
                    && ctx.creatureSheets[BOSS_SHEETS[st.enc]])
                || ctx.heroSheets[hd && hd.elems[0]]
                || ctx.heroSheets.growth;
            const sprite = new PIXI.AnimatedSprite(sheet.animations.walk_front, false);
            sprite.anchor.set(0.5, 1);
            sprite.scale.set(0.5);
            const shadow = new PIXI.Graphics();
            shadow.ellipse(0, 0, 20, 9.3);
            shadow.fill({ color: 0x0e140c, alpha: 0.45 });
            const glow = new PIXI.Sprite(sprite.texture);
            glow.anchor.set(0.5, 1);
            glow.scale.set(0.5 * 1.24);
            glow.tint = 0xff4a30;
            glow.blendMode = "add";
            glow.alpha = 0.45;
            glow.eventMode = "none";
            const s = { kind: "boss", key, enc: st.enc, st,
                d: { route: [[st.stop.gx, st.stop.gy]] },
                wp: 0, path: null, aggro: false, repath: 0, id: null,
                elem: globalThis.GAME_DATA.ENCOUNTERS[st.enc].elem, glow };
            s.sprite = sprite;
            s.shadow = shadow;
            s.sheetRef = sheet; // W86: ключ листа для тестов
            sprite.position.set(st.x, st.y);
            sprite.zIndex = st.y;
            shadow.position.set(st.x, st.y - 13);
            shadow.zIndex = st.y - 0.5;
            glow.position.set(st.x, st.y);
            glow.zIndex = st.y - 0.4;
            objLayer.addChild(glow);
            objLayer.addChild(shadow);
            objLayer.addChild(sprite);
            s.id = characters.spawn({
                x: st.x, y: st.y, sprite,
                anims: sheet.animations,
                speed: BOSS_SPEED, fps: sheet.fps,
                halfW: 9, halfH: 7,
            });
            ECS.addComponent(world, s.id, "ctrlVI", 0);
            ECS.addComponent(world, s.id, "ctrlVJ", 0);
            squads.push(s);
        }
        function spawnBoss(enc) {
            const D = globalThis.GAME_DATA;
            const W = G.world.map.w, H = G.world.map.h;
            // случайная точка края (прилетает из-за края карты)
            const side = (Math.random() * 4) | 0;
            let gx = 0, gy = 0;
            if (side === 0) { gx = (Math.random() * W) | 0; gy = 0; }
            else if (side === 1) { gx = W - 1; gy = (Math.random() * H) | 0; }
            else if (side === 2) { gx = (Math.random() * W) | 0; gy = H - 1; }
            else { gx = 0; gy = (Math.random() * H) | 0; }
            const stop = bossPickStop(gx, gy);
            if (!stop) return; // все 12 точек заняты (пока босс один — не бывает)
            const st = {
                alive: true,
                x: (gx + 0.5) * TS, y: (gy + 0.5) * TS,
                enc, deck: [...(D.ENCOUNTERS[enc].core)],
                phase: "fly",
                stop: { gx: stop.gx, gy: stop.gy },
                tx: (stop.gx + 0.5) * TS, ty: (stop.gy + 0.5) * TS,
                leaveDay: null,
            };
            G.world.wander["boss:" + enc] = st;
            spawnBossSquad(st, "boss:" + enc);
            floatText(GAME_LOC.t("world.bossSpawn",
                { name: GAME_LOC.t("hero." + enc + ".name") }),
                COMPONENTS.positionX[heroId], COMPONENTS.positionY[heroId],
                0xff6a4e);
            if (ctx.sfx) ctx.sfx("alert");
        }
        function bossDayTick() {
            const D = globalThis.GAME_DATA;
            if (!D.WORLD_BOSSES || !G.world.map.bossStops) return;
            // просидевший 5 дней — улетает за ближайший край
            for (const s of squads) {
                if (s.kind !== "boss" || s.gone) continue;
                if (s.st.phase === "sit" && (G.days || 0) >= s.st.leaveDay) {
                    s.st.phase = "leave";
                    s.aggro = false;
                    const e = bossExitPoint(s.st.x, s.st.y);
                    s.st.tx = e.x; s.st.ty = e.y;
                }
            }
            // новый цикл: каждые 10 игровых дней, начиная с 10-го
            const day = G.days || 0;
            if (day % 10 !== 0 || day < 10) return;
            for (const enc of D.WORLD_BOSSES) {
                if (G.world.bossKilled && G.world.bossKilled[enc]) continue;
                const cur = G.world.wander["boss:" + enc];
                if (cur && cur.alive) continue;
                spawnBoss(enc);
            }
        }
        function floatText(text, x, y, fill) {
            const t = new PIXI.Text({
                text, style: { fontFamily: "Kereru", fontSize: 22, fill,
                    stroke: { color: 0x1c1207, width: 5 } },
            });
            t.anchor.set(0.5);
            t.position.set(x, y - 40);
            fxLayer.addChild(t); // передний план (просил юзер волна 15)
            floaties.push({ node: t, t: 0 });
        }

        // ── Подсказка на бродячем отряде (просил юзер): W141 — общее окно
        // противника (GAME_UI.deckTip, как в подземелье): карта героя + имя,
        // база, размер колоды + табличка колоды с зумом полной карты по
        // наведению на строку. Панель живёт в ui-слое и каждый кадр следует
        // за отрядом; показывается pointermove по клик-зоне карты, отряды
        // НЕ интерактивны (не съедают клики движения)
        function hideSquadTip() {
            if (!tip) return;
            tip.win.destroy();
            tip = null;
        }
        function showSquadTip(s) {
            if (tip && tip.squad === s) return;
            hideSquadTip();
            const D = globalThis.GAME_DATA;
            const enc = D.ENCOUNTERS[s.enc] || D.ENCOUNTERS.gob;
            const hd = D.HEROES[enc.hero] || D.HEROES.gob;
            // Дикие враги: база с усилением вида, колода — своя (W29)
            const hpN = enc.baseHp
                + (s.kind === "wild" ? (s.st.hpBonus || 0) : 0);
            const win = globalThis.GAME_UI.deckTip(ctx, {
                title: GAME_LOC.t("enc." + s.enc + ".title"),
                base: GAME_LOC.t("dungeon.tipBase", { n: hpN }),
                deck: s.kind === "wild" ? s.st.deck : enc.core,
                heroImg: hd && hd.img ? hd.img : null,
            });
            ctx.ui.addChild(win.node);
            tip = { squad: s, win };
        }
        // панель следует за отрядом (камера едет) — экранные координаты
        // через мировую матрицу layer + фит ui-канваса
        function placeSquadTip() {
            if (!tip || !layer) return;
            const s = tip.squad;
            const g = layer.toGlobal({ x: s.st.x, y: s.st.y });
            const p = ctx.ui.toLocal(g);
            tip.win.place(p.x, p.y - 30);
        }
        function hoverSquads(p) {
            // W150 (юзер): зона подсказки — ВЕСЬ спрайт отряда (anchor
            // 0.5,1, 96×96), а не круг 30px вокруг якоря-ног: раньше окно
            // ловилось только на нижней части спрайта
            let best = null, bd = 1e9;
            for (const s of squads) {
                const hw = Math.max(30, s.sprite.width / 2);
                if (Math.abs(p.x - s.st.x) > hw) continue;
                const top = s.st.y - s.sprite.height - 8;
                if (p.y < top || p.y > s.st.y + 12) continue;
                const d = Math.hypot(s.st.x - p.x, s.st.y - p.y);
                if (d < bd) { best = s; bd = d; }
            }
            if (best) showSquadTip(best); else hideSquadTip();
        }

        // Иконка-кнопка HUD (настройки/колода) — как в подземелье
        function hudIcon(texName, x, y, onTap, scale = 0.9) {
            const sp = new PIXI.Sprite(uiTex(texName));
            sp.anchor.set(0.5);
            sp.scale.set(scale);
            sp.eventMode = "static";
            sp.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap(); });
            const c = new PIXI.Container();
            c.position.set(x, y);
            c.addChild(sp);
            // W150 (юзер): с апгрейда на Pixi 8 контейнер с дефолтным
            // eventMode "passive" НЕ получает событий от детей — свечение
            // addGlow при наведении не срабатывало НИ на одной иконке
            // HUD. «static» возвращает контейнеру события (правило UI
            // W22: жёлтое свечение при наведении) — как в button()
            c.eventMode = "static";
            globalThis.GAME_UI.addGlow(ctx, c, sp);
            hudBtns.push(c);
            return c;
        }

        function buildHud() {
            const c = new PIXI.Container();
            // Панель героя и ресурсов panel9.png (арт юзера, W120): слева
            // кольцо героя, правее доска с 7 слотами (золото + 6 ресурсов
            // стихий), ниже — дощечка на подвесах с иконками квестов.
            // Вся панель — одна клик-зона (герой не идёт под панель),
            // прижата к левому верхнему углу ОКНА (clamp в update, как у
            // прежних краевых элементов). Замер арта: кольцо — центр
            // (119,119), дырка r≈92; слоты — овалы ~41×78, центры по x
            // 296..616 (шаг ~53), центр по y≈62; дощечка ~320..590×100..186.
            const panel = new PIXI.Container();
            panel.eventMode = "static";
            panel.hitArea = new PIXI.Rectangle(0, 0, 704, 240);
            const panelSpr = new PIXI.Sprite(uiTex("settings/panel9.png")); // 704×240
            panelSpr.eventMode = "none";
            panel.addChild(panelSpr);
            c.addChild(panel);
            const hudStyle = { fontFamily: "Kereru", fontSize: 27, fill: 0xf3e6c2,
                stroke: { color: 0x1c1207, width: 4 } };
            const titleT = new PIXI.Text({ text: GAME_LOC.t("world.title"), style: hudStyle });
            titleT.anchor.set(0.5, 0);
            titleT.position.set(960, 12); // по середине экрана (просил юзер)
            c.addChild(titleT);
            // ── 7 слотов: золото + ресурсы стихий (просил юзер W120) ──────
            // иконки чуть меньше слота и с мягким свечением, числа — под
            // иконками, в нижней части слота. Порядок прежнего ряда HUD:
            // золото, затем RES_ELEMS (Сила, Рост, Мудрость, Тлен, Честь,
            // Время); на начало игры нули, обновляются в update
            const resStyle = { fontFamily: "Kereru", fontSize: 21,
                fill: 0xf3e6c2, stroke: { color: 0x1c1207, width: 4 } };
            const SLOTS_X = [296.5, 350.5, 402, 455, 508.5, 562, 616];
            const ICON_Y = 55, NUM_Y = 86; // центр иконки (W123: −5px вверх
                // после W122; овалы слотов имеют центр y≈62) / центр числа
            // Свечение иконок — ТОТ ЖЕ шейдер, что у кнопок
            // (GAME_UI.constGlow, просил юзер W121: не полупрозрачные круги).
            // Один фильтр на контейнер ряда иконок — ореол по силуэту каждой
            // иконки; числа в ряд не входят, чтобы ореол не шёл вокруг цифр.
            const iconRow = new PIXI.Container();
            panel.addChild(iconRow);
            // W150 (юзер): плашка-подсказка «что это и зачем» на иконках
            // золота/ресурсов — одна на панель, показывается под слотом
            // (узел кладётся в панель В КОНЦЕ buildHud — поверх кольца героя)
            const slotTip = globalThis.GAME_UI.hudTipPlate();
            panel.addChild(slotTip.node);
            const goldT = new PIXI.Text({ text: "0", style: resStyle });
            {
                const gicon = new PIXI.Sprite(uiTex("icon_gold.png"));
                gicon.anchor.set(0.5);
                gicon.scale.set(0.5); // 72 → 36px
                gicon.position.set(SLOTS_X[0], ICON_Y);
                gicon.eventMode = "static"; // наведение — подсказка (W150)
                gicon.hitArea = new PIXI.Circle(0, 0, 22);
                gicon.on("pointerover", () =>
                    slotTip.show(GAME_LOC.t("hud.goldTip"), SLOTS_X[0]));
                gicon.on("pointerout", () => slotTip.hide());
                iconRow.addChild(gicon);
                goldT.anchor.set(0.5);
                goldT.position.set(SLOTS_X[0], NUM_Y);
                goldT.eventMode = "none";
                panel.addChild(goldT);
            }
            const resT = {};
            globalThis.GAME_SIDEQ.RES_ELEMS.forEach((e, i) => {
                const x = SLOTS_X[i + 1];
                const icon = new PIXI.Sprite(uiTex(`resources/res_${e}.png`));
                icon.anchor.set(0.5);
                icon.scale.set(0.5);
                icon.position.set(x, ICON_Y);
                icon.eventMode = "static"; // наведение — подсказка (W150)
                icon.hitArea = new PIXI.Circle(0, 0, 22);
                icon.on("pointerover", () => slotTip.show(GAME_LOC.t("hud.resTip",
                    { name: GAME_LOC.t("res." + e) }), x));
                icon.on("pointerout", () => slotTip.hide());
                iconRow.addChild(icon);
                const num = new PIXI.Text({ text: "0", style: resStyle });
                num.anchor.set(0.5);
                num.position.set(x, NUM_Y);
                num.eventMode = "none";
                panel.addChild(num);
                resT[e] = num;
            });
            globalThis.GAME_UI.constGlow(iconRow, 0.8);
            // ── квесты: 2 иконки на дощечке (просил юзер W120) ────────────
            // сюжетная руна + поручения; иконки строятся всегда, видимость
            // СИНХРОНИЗИРУЕТСЯ ПО КАДРАМ (update): руна — только с ВЗЯТЫМ
            // квестом (announced: «Принять» у Глома), поручения — при
            // активных заданиях (как в W46)
            const qRune = hudIcon("icon_rune.png", 425, 141, () => {
                globalThis.GAME_QUESTS.showReview(ctx);
            }, 0.62);
            const qSide = hudIcon("icon_map.png", 492, 141,
                () => { globalThis.GAME_SIDEQ.showReview(ctx); }, 0.62);
            qRune.visible = qSide.visible = false; // до первой синхронизации
            panel.addChild(qRune, qSide);
            // W150 (юзер): иконки квестов явнее сигнализируют «кнопка» —
            // при наведении слегка растут (жёлтое свечение уже в hudIcon)
            for (const q of [qRune, qSide]) {
                q.on("pointerover", () => { if (!q.destroyed) q.scale.set(1.15); });
                q.on("pointerout", () => { if (!q.destroyed) q.scale.set(1); });
            }
            // настройки доступны и из мира; «Назад» вернёт сюда. Колода —
            // по кружку героя (как по прежней карте, просил юзер)
            const settingsBtn = hudIcon("icon_setting.png", 1839, 66, () => {
                G.uiReturn = "world";
                globalThis.GAME_SETTINGS_SCENE.captureSettingsBg(ctx); // сзади — мир (юзер)
                scenes.go("settings");
            });
            c.addChild(settingsBtn);
            // счётчик дней открытого мира (W60, юзер; W122 — слева ПОД
            // панелью: иконка icon_day.png + число под кольцом героя, чуть
            // ниже рамки; живёт ребёнком панели — едет вместе с ней при
            // letterbox-прижатии, отдельный ежекадровый кламп не нужен)
            const dayPlate = new PIXI.Container();
            const dayIcon = new PIXI.Sprite(uiTex("icon_day.png"));
            dayIcon.anchor.set(0.5);
            dayIcon.scale.set(0.44);
            dayIcon.position.set(14, 66);
            dayIcon.eventMode = "none";
            dayPlate.addChild(dayIcon);
            const dayT = new PIXI.Text({ text: String(G.days || 0), style: resStyle });
            dayT.position.set(30, 54);
            dayT.eventMode = "none";
            dayPlate.addChild(dayT);
            dayPlate.position.set(98, 196); // центр иконки (112, 262) — под кольцом
            panel.addChild(dayPlate);
            // ── герой: круг-вырез из арта (просил юзер W120) ─────────────
            // в кольце панели — не карта, а вырезанный из её арта кружок;
            // клик — в колоду, наведение — полная карта натурального
            // размера 230×338 (верх у верхней кромки экрана); появление
            // ведёт update (плавный рост scale 0.45 → 1)
            const wHero = globalThis.GAME_DATA.HEROES[G.heroId]
                || globalThis.GAME_DATA.HEROES.gorbag;
            const heroHolder = new PIXI.Container();
            heroHolder.position.set(119, 119); // центр кольца (замер арта)
            heroHolder.hitArea = new PIXI.Circle(0, 0, 92); // дырка кольца
            heroHolder.eventMode = "static";
            panel.addChild(heroHolder);
            const art = new PIXI.Sprite(uiTex(`heroes/${wHero.img}.png`));
            art.anchor.set(0.5, 0.42); // персонаж — чуть выше середины арта
            art.scale.set(184 / 230);  // диаметр дырки кольца / ширина арта
            heroHolder.addChild(art);
            const artMask = new PIXI.Graphics();
            artMask.circle(0, 0, 92).fill(0xffffff);
            heroHolder.addChild(artMask);
            art.mask = artMask;
            const heroName = new PIXI.Text({
                text: GAME_LOC.t(`hero.${G.heroId || "gorbag"}.name`),
                style: { fontFamily: "Kereru", fontSize: 26, fill: 0xffe2a8,
                    stroke: { color: 0x241505, width: 6 } },
            });
            heroName.anchor.set(0.5);
            heroName.position.set(119, 22); // на деревянном ободе кольца
            heroName.eventMode = "none";
            panel.addChild(heroName);
            const heroFull = new PIXI.Sprite(uiTex(`heroes/${wHero.img}.png`));
            heroFull.anchor.set(0.5, 0);
            heroFull.position.set(0, -119); // верх карты — верхняя кромка экрана
            heroFull.scale.set(0.45);
            heroFull.alpha = 0;
            heroFull.eventMode = "none";
            heroHolder.addChild(heroFull);
            const hint = new PIXI.Text({
                text: GAME_LOC.t("world.hint"),
                style: { fontFamily: "Kereru", fontSize: 22, fill: 0xbfae87 },
            });
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 1050);
            c.addChild(hint);
            const mini = buildMinimap(miniMode); // режим помнится (M)
            c.addChild(mini.box);
            // краевые элементы HUD — ссылки для ежекадрового прижатия
            // к краям ОКНА по горизонтали (просил юзер: при переходе
            // из полноэкранного в оконный letterbox-полосы канваса
            // отодвигали панель и настройки от краёв)
            c.userData = { goldT, resT, mini, panel, settingsBtn, qRune, qSide,
                dayT, heroFull, heroT: 0, heroA: 0 };
            heroHolder.on("pointerover", () => { c.userData.heroT = 1; });
            heroHolder.on("pointerout", () => { c.userData.heroT = 0; });
            heroHolder.on("pointertap", () => {
                if (ctx.sfx) ctx.sfx();
                G.uiReturn = "world";
                scenes.go("deck");
            });
            panel.addChild(slotTip.node); // поверх всего (кольцо героя под ней)
            return c;
        }

        // ── мини-карта всего мира (просил юзер): правый нижний угол, ──────
        // 1px на клетку (384×256 — вдвое меньше прежней, просил юзер).
        // Статична: рельеф/дороги/POI рисуются один раз при входе; поверх —
        // живой пульсирующий маркер героя (update). Клики по ней
        // поглощаются — герой не бегает в угол.
        // ДВА РЕЖИМА (просил юзер волна 15): обычный (1px на клетку) и
        // крупный вдвое (2px) — переключение клавишей M.
        // Угол привязан к КРАЮ ОКНА, а не UI-канваса 1920×1080: при окне
        // шире 16:9 letterbox-полосы справа сдвигали угол UI к центру
        // (баг, просил юзер пофиксить) — позиция пересчитывается каждый
        // кадр (fit) от реального размера экрана
        function buildMinimap(scale = 1) {
            const map = G.world.map;
            const MS = scale, MW = map.w * MS, MH = map.h * MS;
            const box = new PIXI.Container();
            const fit = () => {
                const c = ctx.ui.toLocal({
                    x: ctx.app.screen.width, y: ctx.app.screen.height });
                box.position.set(c.x - 12 - MW, c.y - 12 - MH);
            };
            fit();
            box.eventMode = "static"; // ловит клики — не пускает их в мир
            box.hitArea = new PIXI.Rectangle(0, 0, MW, MH);
            const bg = new PIXI.Graphics();
            bg.rect(-4, -4, MW + 8, MH + 8);
            bg.fill({ color: 0x0d0f0a, alpha: 0.78 });
            bg.stroke({ width: 3, color: 0x6b5c40 });
            box.addChild(bg);
            const g = new PIXI.Graphics();
            for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
                const i = y * map.w + x, t = map.ter[i];
                let col;
                if (t === T.ROAD) col = 0x94805c;
                else if (t === T.BRIDGE) col = 0x7c5c36;
                else if (t === T.WATER) col = 0x2c4a63;
                else if (t === T.MOUNTAIN) col = 0x3b3831;
                else if (t === T.FOREST) col = FOREST[GEN.ELEMS[map.zone[i]]];
                else col = globalThis.GAME_WORLDTILES.MINI[worldTerr[i]];
                g.rect(x * MS, y * MS, MS, MS);
                g.fill(col);
            }
            box.addChild(g);
            // точки интереса: столицы/города — цвет крыши стихии, арки — светлые
            const p = new PIXI.Graphics();
            for (const poi of map.pois) {
                const s = (poi.kind === "capital" ? 6 : 4) * MS;
                p.rect(poi.gx * MS - s / 2 + MS / 2, poi.gy * MS - s / 2 + MS / 2, s, s);
                p.fill(poi.kind === "dungeon" ? 0xffe9b0
                    : poi.kind === "capital" ? 0xffd76a : ROOF[poi.elem]);
            }
            box.addChild(p);
            // маркер героя — белый пульсирующий кружок
            const dot = new PIXI.Graphics();
            dot.circle(0, 0, 3.5 * MS);
            dot.fill({ color: 0xffffff });
            dot.stroke({ width: 1.5, color: 0x1c1207 });
            box.addChild(dot);
            return { box, dot, MW, MH, fit };
        }

        // переключение режима мини-карты клавишей M (просил юзер волна 15):
        // пересобрать Graphics в новом масштабе — прежний узел сгорает
        let miniMode = 1; // 1 — обычная (1px на клетку), 2 — крупная (2px)
        function setMiniMode(m) {
            if (!uiHud || !uiHud.userData.mini) return;
            miniMode = m;
            uiHud.userData.mini.box.destroy({ children: true });
            const mini = buildMinimap(m);
            uiHud.addChild(mini.box); // поверх прочего HUD, как при входе
            uiHud.userData.mini = mini;
        }

        // Вход в подземелье: продолжить текущий этаж ЭТОГО данжа (состояния
        // этажей хранит G.dungeonStates) или начать его первый. Подземелья
        // требуют растущую колоду (просил юзер): вход — 16 карт, каждый
        // следующий этаж +1 (dataCards.caveDeckFor); «Рыжий лес» (W54) —
        // 24 и +2 за этаж. С меньшей колодой вход закрыт — всплывает
        // предупреждение. Открытый мир живёт по минимуму 12 (стартовые
        // колоды) — добор фармят отрядами. «Рыжему лесу» нужны ЕЩЁ и
        // ресурсы: 1 Щиток мощи + 1 Росток жизни (спека юзера W54;
        // НЕ списываются — требование к герою, как и колода)
        function enterCave(cave) {
            const D = globalThis.GAME_DATA;
            const caveId = D.CAVES[cave] ? cave : "gob";
            if (!D.CAVES[caveId]) return false; // на всякий
            const floor = G.run.cave === caveId
                ? (G.run.floors || (G.run.floors = {}))[caveId] || 1 : 1;
            const need = D.caveDeckFor(caveId, floor);
            if (G.deck.length < need) return false; // мало карт — вход закрыт
            if (D.CAVES[caveId].fury && D.CAVES[caveId].elems
                && !D.CAVES[caveId].elems.every((e) =>
                    (G.resources && (G.resources[e] || 0) >= 1))) return false;
            // W92 (юзер): сюжетный квест «чужие арки» — попадание в
            // двухцветное подземелье. Вызов ПОСЛЕ гейтов колоды/ресурсов:
            // дальше вход уже точно случится (сцена данжа)
            if (globalThis.GAME_QUESTS)
                globalThis.GAME_QUESTS.onCaveEnter(G, caveId);
            if (heroId !== null) {
                G.world.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
            }
            // уходим в ДРУГОЙ данж — текущий этаж архивируется, чтобы
            // прогресс (враги/объекты/позиция) не потерялся. W60 (юзер):
            // city-состояние (G.dungeon в городе) архивом этажа НЕ
            // становится — оно живёт в G.cityStates
            if (G.dungeon && !G.dungeon.city && G.dungeon.cave !== caveId) {
                G.dungeonStates[(G.dungeon.cave || "gob") + ":" + G.dungeon.floor] = G.dungeon;
            }
            if (G.run.cave !== caveId) {
                G.run.cave = caveId;
                G.run.floor = (G.run.floors || (G.run.floors = {}))[caveId] || 1;
            }
            // stateFor: этаж из архива или свежий
            const st = globalThis.GAME_DUNGEON.stateFor(G.dungeonStates, caveId, G.run.floor);
            st.cave = caveId;
            if (st.spawn) st.heroPos = { ...st.spawn }; // прибытие к лестнице
            st.exitCool = false;
            // лестница наверх (выход) 2с не работает после входа: герой
            // прибывает к ней вплотную, и первый же клик выкидывал в мир
            // (просил юзер). Остаток МС, тикает в update данжа, — НЕ
            // performance.now(): метка, уехавшая в сейв, после «Продолжить»
            // блокировала выход до конца сессии (баг W22)
            // W60: 4с — 2с «остывания» ПЛЮС время «прожига» входа (~3с):
            // герой прибывает на лестнице и стоит весь переход — без
            // поправки первый кадр после кольца выбрасывал его в мир
            st.ladderCoolMs = 4000;
            G.dungeon = st;
            G.cityOut = null; // stale-выход из города пещеру не перебивает (W60)
            if (ctx.sfx) ctx.sfx("coins"); // вход в подземелье (W34, юзер)
            // W60 (юзер): вход в подземелье — ДВУХФАЗНЫЙ «прожиг»: первая
            // половина эффекта (сужающееся кольцо) играет поверх ОТКРЫТОГО
            // МИРА, к её концу сцена мира сменяется подземельем, и доигрывает
            // вторая половина (расширяющееся кольцо), открывая его экран.
            // Эффект живёт на ctx.ui — общей подложке сцен — поэтому
            // переживает смену; свой эффект данж не запускает (st.descentFx)
            const FX = globalThis.GAME_FX;
            const fx = FX && FX.available
                ? FX.spawn(ctx.ui, "transitions/burn-away",
                    { x: 0, y: 0, size: 1080 })
                : null;
            if (fx) {
                st.descentFx = true;
                worldLock = true; // кольцо жнёт мир — герой стоит
                setTimeout(() => {
                    worldLock = false;
                    scenes.go("dungeon");
                }, 1250); // кольцо сузилось (CLOSE ≈ 1.2с эффекта)
            } else {
                scenes.go("dungeon");
            }
            return true;
        }

        // ── ГОРОД (W30, юзер): вход в СТАРТОВЫЙ город зоны — как в данж.
        // Состояние живёт в G.cityStates (отдельно от этажей подземелий,
        // чтобы не путать архив «данж:этаж»), сцена — dungeon в режиме
        // города (st.city): стены — набор тайлов данжа стихии, пол —
        // поверхность зоны; внутри торговец картами, врагов нет.
        // (W70, юзер) роль города — по типу POI на карте, НЕ по стихии
        // героя: столица зоны (большой город, одна на стихию) — слот
        // «столица», все обычные города (вкл. стартовый) — слот «город».
        // Глом живёт только в стартовом городе героя (home). Ключ кэша —
        // «стихия|роль»: у стихии до трёх состояний (cap/home/town)
        function cityStateFor(elem, capital, home) {
            const key = elem
                + (capital ? "|cap" : home ? "|home" : "|town");
            const saved = G.cityStates && G.cityStates[key];
            if (saved) return saved;
            const st = globalThis.GAME_CITY.newCityState(
                elem, capital, home);
            if (G.cityStates) G.cityStates[key] = st;
            return st;
        }
        // «свой» стартовый город стихии: городов-стартов шесть (по одному
        // на стихию, spawnTown ставит worldGen) — ищем ближайший к спавну
        // СВОЕЙ стихии. find() по флагу всегда отдавал первый в pois —
        // город Силы (баг юзера W31: Тлен заходил в Силовой город)
        function ownStartTown(map) {
            const sp = map.spawn[G.elem] || map.spawn.strength;
            let best = null, bd = Infinity;
            for (const p of map.pois) {
                if (!p.spawnTown) continue;
                const d = Math.hypot(p.gx - sp.gx, p.gy - sp.gy);
                if (d < bd) { bd = d; best = p; }
            }
            return best;
        }
        function enterCity(tw) {
            const m = G.world.map;
            if (!m || !m.pois) return false;
            // какой город: тот, что тронули (касание арки); без аргумента
            // (тесты/программный вход) — «свой» стартовый
            if (!tw) tw = ownStartTown(m);
            if (!tw) return false;
            // (W67, юзер) вошли в подсвеченный стартовый город — его
            // свечение больше не показывается (запомнить в забеге)
            if (G.world.startCity && tw.gx === G.world.startCity.gx
                && tw.gy === G.world.startCity.gy)
                G.world.startCitySeen = true;
            if (heroId !== null)
                G.world.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
            // выход — к дверям ЭТОГО города (не первого spawnTown в pois!)
            G.cityOut = { elem: tw.elem || G.elem, gx: tw.gx, gy: tw.gy };
            // роль и Глом (W70): столица — POI «capital»; стартовый город
            // СВОЕЙ стихии (spawnTown) — обычный город, где живёт Глом
            const el = tw.elem || G.elem;
            const st = cityStateFor(el, tw.kind === "capital",
                !!tw.spawnTown && el === G.elem);
            st.exitTown = { gx: tw.gx, gy: tw.gy };
            // прибытие у прохода-выхода (W52); 2с «остывание» выхода —
            // герой встаёт рядом с ним, и первый же кадр не выкидывает
            // в мир (тот же приём, что у входа в данж)
            if (st.spawn) st.heroPos = { ...st.spawn };
            st.ladderCoolMs = 2000;
            // письмо доставлено? (побочный квест ратуши, W40): вход в
            // город-адресат закрывает квест — +1 ресурс городу, выдавшему
            if (globalThis.GAME_SIDEQ) globalThis.GAME_SIDEQ.onEnterCity(G, tw);
            G.dungeon = st;
            if (ctx.sfx) ctx.sfx("enter"); // вход в город (W34, юзер)
            scenes.go("dungeon");
            return true;
        }

        return {
            enter() {
                if (ctx.music) ctx.music("menu"); // трек мира (пока общий с меню)
                const map = ensureMap();
                ensureWander(); // жив/мёртв и позиции отрядов (создать/дописать)
                // самолечение поручений ратуши (W62, юзер): охота без живого
                // монстра получает нового (состояние вычищено багом шаблона
                // W60 или пересборкой мира), письмо с пропавшим адресатом —
                // новый город. До спавна отрядов — починенный монстр сразу
                // выйдет на поле
                if (globalThis.GAME_SIDEQ
                    && globalThis.GAME_SIDEQ.repairQuests)
                    globalThis.GAME_SIDEQ.repairQuests(G);
                ctx.collide.rows = map.rows; // коллизии героя — по карте мира
                ctx.collide.ts = TS; // после подземелья (клетка 64) — шаг мира
                // ходьба (в т.ч. клавиатурой) тоже respectит тело городов
                // (W42) — данж при входе сбрасывает extra
                ctx.collide.extra = (gx, gy) => cellBlocked(map, gx, gy);
                // точка появления: вышедший из подземелья герой стоит
                // у входа ТОГО данжа; новая игра — клетка у случайного
                // ГОРОДА (не столицы, просил юзер), общая для всех стихий.
                // W42: спавн-точка могла попасть в тело города (теперь
                // непроходимо) — сдвиг к ближайшей свободной клетке
                const spawnOk = (q) => {
                    // W62 (юзер): спавн только в БОЛЬШОМ регионе — точка в
                    // закрытом кармане (лес + тело города) сдвигается к
                    // ближайшей открытой клетке
                    const gx = Math.floor(q.x / TS), gy = Math.floor(q.y / TS);
                    return walkable(gx, gy) && bigRegion(gx, gy)
                        ? q : freeCellNear(q.x, q.y);
                };
                const spawnPx = px(map.spawn[G.elem] || map.spawn.strength);
                let hp = G.world.heroPos ? { ...G.world.heroPos } : null;
                if (G.cityOut) { // вышли из города — к дверям ЭТОГО города (W31)
                    // W40: города-столицы тоже входят — выход к их дверям
                    const co = G.cityOut;
                    G.cityOut = null;
                    // (W49, юзер) 3с нельзя зайти в ЭТОТ же город обратно:
                    // герой выходит у ворот (свободная клетка в 1.4 клетки
                    // от якоря, триггер входа — 1.3), и без кулдауна первый
                    // же шаг к воротам возвращал его в город — пройти мимо
                    // входа было невозможно
                    G.world.cityCoolMs = 3000;
                    G.world.cityCoolTw = co ? co.gx + ":" + co.gy : null;
                    const tw = co && map.pois.find((p) =>
                        (p.kind === "town" || p.kind === "capital")
                        && p.gx === co.gx && p.gy === co.gy);
                    hp = tw ? freeCellNear(px(tw).x, px(tw).y) : spawnOk(spawnPx);
                } else if (G.world.out) {
                    const at = cavePoi(G.world.outCave) || cavePoi("gob");
                    hp = freeCellNear(px(at).x, px(at).y);
                    G.world.out = false;
                } else if (!hp) hp = spawnOk(spawnPx);
                else {
                    // сохранённая позиция у самой арки не должна мгновенно
                    // сработать триггер — отодвигаем на свободную клетку
                    const near = map.pois.some((p) => p.kind === "dungeon") &&
                        map.pois.filter((p) => p.kind === "dungeon").some((p) => {
                            const c = px(p);
                            return Math.hypot(hp.x - c.x, hp.y - c.y) < TS * 1.2;
                        });
                    if (near) hp = freeCellNear(hp.x, hp.y);
                }
                // активный герой сменился с момента выбора точки появления
                // (вкладка «Герои» меняет стихию забега на ходу): герой
                // отправляется в зону СВОЕЙ стихии — к спавну
                // (баг юзера W31: герой Тлена начинал в зоне Силы)
                if (G.world.startElem !== G.elem) {
                    G.world.startElem = G.elem;
                    G.world.heroPos = { ...spawnPx };
                    hp = { ...spawnPx };
                }
                // реванш: живой отряд у точки появления отодвигает героя —
                // касание с первого кадра не перезапускает только что
                // проигранный бой (как retreatCell в подземелье)
                if (G.world.wander && map.wanderers) {
                    for (let i = 0; i < map.wanderers.length; i++) {
                        const w = G.world.wander
                            ["cave:" + map.wanderers[i].cave + ":" + i];
                        if (!w || !w.alive) continue;
                        if (Math.hypot(w.x - hp.x, w.y - hp.y) < TS * 1.3) {
                            const away = freeCellNear(w.x, w.y);
                            hp = { x: away.x, y: away.y };
                        }
                    }
                }
                G.world.heroPos = { ...hp };

                // (W46, юзер) поражение/побег в открытом мире: 2с ненападения
                // С МОМЕНТА ВОЗВРАТА в мир. finish() (arenaFlow) ставит 3с,
                // но путь через редактор колоды (потеря карты, добор из
                // коллекции) съедает их — герой возвращался прямо под бой
                // с тем же отрядом
                if (G.world.afterDefeat) {
                    G.world.afterDefeat = false;
                    G.world.battleCool = Math.max(G.world.battleCool || 0,
                        performance.now() + 2000);
                }

                layer = new PIXI.Container();
                layer.sortableChildren = true;
                const zone = new PIXI.Graphics();
                zone.rect(0, 0, map.w * TS, map.h * TS);
                zone.fill({ color: 0xffffff, alpha: 0.001 });
                zone.eventMode = "static";
                zone.on("pointertap", (e) => {
                    if (heroId === null) return;
                    const p = zone.toLocal(e.global);
                    const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                    const next = pathTo(Math.floor(hx / TS), Math.floor(hy / TS),
                        Math.floor(p.x / TS), Math.floor(p.y / TS));
                    if (next) {
                        path = next;
                        // след клика: кольцо в КОНЦЕ пути (просил юзер W22)
                        // + точки маршрута волной к нему
                        const last = next[next.length - 1];
                        globalThis.GAME_UI.pathFx(ctx, {
                            layer: fxLayer, x: last.x, y: last.y,
                            points: next.slice(0, -1),
                        });
                    }
                });
                zoneRef = zone; // тест-хук clickAt
                // наведение на бродячий отряд — карточка героя + состав
                // колоды (просил юзер); квест-диалог открыт — тутипа нет
                zone.on("pointermove", (e) => {
                    if (!squads.length || ctx.questModal) return;
                    hoverSquads(zone.toLocal(e.global));
                });
                layer.addChild(zone);
                // слой МЕСТНОСТИ — dual-grid тайлы юзера (images/tiles),
                // самый низ картинки (просил юзер): преобладающий тип зоны
                // стихии (Сила-земля, Рост-трава, Мудрость-магия, Тлен-
                // тлен, Честь-песок, Время-снег) + вода рек/озёр;
                // несовместимые стыки расходятся земляной полосой
                // (см. worldTiles.js). Поверх — прозрачные оверлеи:
                // болота swamp.png (Тлен), лесные массивы wood.png,
                // дороги roads.png (11 видов) и мосты; ДЕРЕВЬЯ и ГОРЫ —
                // спрайты в общем y-sort слое объектов (objLayer выше).
                // Всё живёт ЧАНКАМИ (culling — см. выше): в сцене
                // только чанки экрана + запас (просил юзер)
                worldTerr = globalThis.GAME_WORLDTILES.terrainOf(map);
                terrStats = { tiles: 0, fallback: 0, odd: 0, bySheet: {} };
                woodStats = { tiles: 0, skipped: 0,
                    scale: TS / ctx.worldSheets.wood.ts };
                swampStats = { tiles: 0, skipped: 0,
                    scale: TS / (ctx.worldSheets.swamp || ctx.worldSheets.wood).ts };
                roadStats = { tiles: 0, skipped: 0 };
                moatStats = { tiles: 0, skipped: 0 };
                treeCount = 0;
                mtnCount = 0;
                chunkCache = new Map();
                chunkRect = "";
                chunkHolder = new PIXI.Container();
                chunkHolder.zIndex = -99;
                zone.zIndex = -100;
                layer.addChild(chunkHolder);
                mapFrame = buildMapFrame(map);
                mapFrame.zIndex = -97;
                layer.addChild(mapFrame);
                // общий y-sort слой объектов (просил юзер): деревья/горы
                // чанков + города/подземелья + герой сортируются по низу
                objLayer = new PIXI.Container();
                objLayer.sortableChildren = true;
                objLayer.zIndex = -96; // над чанками и рамкой
                layer.addChild(objLayer);
                // надписи поверх всего мира (просил юзер волна 15: раньше
                // жили в y-sort objLayer и прятались за спрайтом входа
                // в подземелье и прочими высокими объектами)
                fxLayer = new PIXI.Container();
                fxLayer.zIndex = -90;
                layer.addChild(fxLayer);
                poiNodes = [];
                for (const poi of map.pois) {
                    const node = poi.kind === "capital" ? makeCapital(poi)
                        : poi.kind === "town" ? makeTown(poi) : makeCave(poi);
                    poiNodes.push({ node, poi, x: node.x, y: node.y });
                    objLayer.addChild(node);
                }
                // (W67, юзер) город рядом с точкой появления в НОВОЙ игре:
                // жёлтое свечение вокруг его спрайта — куда идти в начале.
                // Город запоминается в забеге (startCity), флаг startCitySeen
                // ставит enterCity — после входа свечение не показывается
                if (G.world.startCity === undefined) {
                    let best = null, bd = Infinity;
                    for (const p of map.pois) {
                        if (p.kind !== "town" && p.kind !== "capital") continue;
                        const d = Math.hypot((p.gx + 0.5) * TS - hp.x,
                            (p.gy + 1) * TS - hp.y);
                        if (d < bd) { bd = d; best = p; }
                    }
                    G.world.startCity = best
                        ? { gx: best.gx, gy: best.gy } : null;
                }
                startGlow = null;
                if (G.world.startCity && !G.world.startCitySeen) {
                    const tw = map.pois.find((p) =>
                        (p.kind === "town" || p.kind === "capital")
                        && p.gx === G.world.startCity.gx
                        && p.gy === G.world.startCity.gy);
                    const pn = tw && poiNodes.find((n) => n.poi === tw);
                    const sp = pn && pn.node.children[0];
                    // свечение ВОКРУГ спрайта (стиль W58): копия спрайта
                    // чуть больше ПОД спрайтом — светится только кромка
                    // силуэта, прозрачные поля текстуры не светятся
                    if (sp) {
                        const glow = new PIXI.Sprite(sp.texture);
                        glow.anchor.set(0.5, 1);
                        glow.scale.set(sp.scale.x * 1.14, sp.scale.y * 1.14);
                        glow.tint = 0xffd75e;
                        glow.blendMode = "add";
                        glow.alpha = 0.5;
                        glow.eventMode = "none";
                        pn.node.addChildAt(glow, 0);
                        startGlow = glow;
                    }
                }
                // бродячие отряды (просил юзер): охрана данжей + охранники
                // мостов — персонажи мира на спрайтшитах своих стихий;
                // позиция берётся из состояния забега (переживает выход
                // в данж и перезаход), маршруты — из карты
                squads = [];
                const spawnSquads = (defs, kind) => {
                    for (let i = 0; i < defs.length; i++) {
                        const d = defs[i];
                        const key = kind === "cave"
                            ? "cave:" + d.cave + ":" + i
                            : kind === "wild"
                                ? "wild:" + d.elem + ":" + i
                                : kind + ":" + i;
                        const st = G.world.wander[key];
                        if (!st || !st.alive) continue;
                        const s = {
                            kind, key, d, st, wp: 0, path: null, aggro: false,
                            repath: 0, id: null,
                            enc: kind === "cave" ? wanderEnc(d, i)
                                : kind === "wild" ? st.enc
                                : guardEncOf(d.elem),
                        };
                        if (!s.enc) continue; // данж/стихия ещё без отрядов
                        s.elem = globalThis.GAME_DATA.ENCOUNTERS[s.enc].elem;
                        const made = makeSquadNode(s);
                        s.sprite = made.sprite;
                        s.shadow = made.shadow;
                        s.sheetRef = made.sheet; // W86: ключ листа для тестов
                        s.sprite.position.set(st.x, st.y);
                        s.sprite.zIndex = st.y;
                        s.shadow.position.set(st.x, st.y - 9.8);
                        s.shadow.zIndex = st.y - 0.5;
                        objLayer.addChild(s.shadow);
                        objLayer.addChild(s.sprite);
                        s.id = characters.spawn({
                            x: st.x, y: st.y, sprite: s.sprite,
                            anims: made.sheet.animations,
                            speed: WAND_SPEED, fps: made.sheet.fps,
                            halfW: 7, halfH: 5,
                        });
                        ECS.addComponent(world, s.id, "ctrlVI", 0);
                        ECS.addComponent(world, s.id, "ctrlVJ", 0);
                        squads.push(s);
                    }
                };
                if (map.wanderers) spawnSquads(map.wanderers, "cave");
                if (map.bridgeGuards) spawnSquads(map.bridgeGuards, "bridge");
                if (map.decayGuards) spawnSquads(map.decayGuards, "decay");
                if (map.wildSpawns) spawnSquads(map.wildSpawns, "wild");
                // охотничьи монстры ратуши (побочные квесты, W40): живут
                // в G.world.wander с ключами "wild:q<город>", маршрут
                // вокруг города — в состоянии (st.route). Спрайт с красным
                // свечением (пульс)
                for (const a of ((globalThis.GAME_SIDEQ
                    && globalThis.GAME_SIDEQ.stateOf(G).active) || [])) {
                    if (a.type !== "hunt" || !a.mobKey) continue;
                    const key = a.mobKey;
                    const st = G.world.wander[key];
                    if (!st || !st.alive) continue;
                    const s = { kind: "wild", key,
                        d: { route: st.route || [] }, st,
                        wp: 0, path: null, aggro: false, repath: 0, id: null,
                        enc: st.enc };
                    s.elem = globalThis.GAME_DATA.ENCOUNTERS[s.enc].elem;
                    const made = makeSquadNode(s);
                    s.sprite = made.sprite;
                    s.shadow = made.shadow;
                    s.sheetRef = made.sheet; // W86: ключ листа для тестов
                    s.sprite.position.set(st.x, st.y);
                    s.sprite.zIndex = st.y;
                    s.shadow.position.set(st.x, st.y - 9.8);
                    s.shadow.zIndex = st.y - 0.5;
                    // красное свечение ВОКРУГ спрайта (W67, юзер): копия
                    // спрайта чуть больше ПОД спрайтом — светится кромка
                    // силуэта, а не тень-эллипс под ногами; кадр анимации
                    // и позицию копирует тик update
                    s.glow = new PIXI.Sprite(made.sprite.texture);
                    s.glow.anchor.set(0.5, 1);
                    s.glow.scale.set(0.375 * 1.24);
                    s.glow.tint = 0xff4a30;
                    s.glow.blendMode = "add";
                    s.glow.alpha = 0.5;
                    s.glow.eventMode = "none";
                    s.glow.position.set(st.x, st.y);
                    s.glow.zIndex = st.y - 0.4;
                    objLayer.addChild(s.glow);
                    objLayer.addChild(s.shadow);
                    objLayer.addChild(s.sprite);
                    s.id = characters.spawn({
                        x: st.x, y: st.y, sprite: s.sprite,
                        anims: made.sheet.animations,
                        speed: WAND_SPEED, fps: made.sheet.fps,
                        halfW: 7, halfH: 5,
                    });
                    ECS.addComponent(world, s.id, "ctrlVI", 0);
                    ECS.addComponent(world, s.id, "ctrlVJ", 0);
                    squads.push(s);
                }
                // мировые боссы (W136): восстановление на карте из сейва
                // (сидят на точке или летят; убитые — alive:false, не встают)
                if (G.world.wander) {
                    for (const k of Object.keys(G.world.wander)) {
                        if (String(k).indexOf("boss:") !== 0) continue;
                        const st = G.world.wander[k];
                        if (!st || !st.alive) continue;
                        spawnBossSquad(st, k);
                    }
                }
                // жёлтые свечения городов-адресатов писем (пул по городам,
                // видимость/пульс — в update по GAME_SIDEQ.glowCities)
                poiGlows = map.pois
                    .filter((p) => p.kind === "town" || p.kind === "capital")
                    .map((p) => {
                        const g = new PIXI.Graphics();
                        // под размер города (W41: спрайты ×1.5, было 96×26)
                        g.ellipse(0, 0, 144, 39);
                        g.fill({ color: 0xd8b62a, alpha: 0.3 });
                        g.visible = false;
                        g.zIndex = (p.gy + 1) * TS - 1; // под узлом города
                        objLayer.addChild(g);
                        return { key: p.gx + ":" + p.gy, x: (p.gx + 0.5) * TS,
                            y: (p.gy + 1) * TS - 6, node: g };
                    });
                worldContainer.addChild(layer);

                // герой — лист по стихии забега (Рост — эльф, Сила — гоблин)
                ctx.heroSheet = ctx.heroSheets[G.elem] || ctx.heroSheets.strength;
                const sprite = new PIXI.AnimatedSprite(ctx.heroSheet.animations.walk_front, false);
                sprite.anchor.set(0.5, 1);
                sprite.scale.set(0.375); // 96×96 — крупнее (просил юзер)
                sprite.zIndex = hp.y; // y-sort: герой между зданиями/арками
                heroSprite = sprite;
                heroId = characters.spawn({
                    x: hp.x, y: hp.y, sprite, anims: ctx.heroSheet.animations,
                    speed: HERO_SPEED, fps: ctx.heroSheet.fps,
                    // (W49, юзер) коллайдер «ног» УЖЕ (8×6px, было 14×10):
                    // щели между валунами скал визуально есть, а широкий
                    // короб цеплял углы клеток и не пускал героя в
                    // 1-клеточные проходы (у отрядов мира свой короб —
                    // они ходят по BFS-клеткам и не застревают)
                    halfW: 4, halfH: 3,
                });
                ECS.addComponent(world, heroId, "ctrlVI", 0);
                ECS.addComponent(world, heroId, "ctrlVJ", 0);
                // тень под героем (просил юзер): эллипс на точке ног
                heroShadow = new PIXI.Graphics();
                heroShadow.ellipse(0, 0, 15, 7);
                heroShadow.fill({ color: 0x0e140c, alpha: 0.45 });
                heroShadow.position.set(hp.x, hp.y - 0.7 * 7 * 2); // приподнята на 0.7 высоты (просил юзер)
                heroShadow.zIndex = hp.y - 0.5;
                objLayer.addChild(heroShadow);
                objLayer.addChild(sprite);
                // стрелка к цели активного задания (W31): позицию/направление
                // обновляет update(); включение — чекбокс в окне задания
                // (G.settings.questArrow, по умолчанию включена).
                // (W45, юзер) зелёная — раньше была жёлтой и сливалась со
                // стрелкой письма побочного квеста
                questArrow = new PIXI.Graphics();
                questArrow.moveTo(20, 0); questArrow.lineTo(-12, -13);
                questArrow.lineTo(-6, 0); questArrow.lineTo(-12, 13);
                questArrow.lineTo(20, 0);
                questArrow.fill({ color: 0x76c93e });
                questArrow.stroke({ width: 2, color: 0x1c3207 });
                questArrow.scale.set(1.3); // заметнее у тайлов 32px
                questArrow.visible = false;
                questArrow.zIndex = hp.y + 2;
                objLayer.addChild(questArrow);
                // стрелки побочных квестов ратуши (W40): красная — к
                // охотничьему монстру, жёлтая — к городу-адресату письма.
                // Позиции/направления — в update (по GAME_SIDEQ.arrowTargets)
                sideArrows = {};
                for (const [name, fill, line] of [
                    ["red", 0xd03028, 0x3a0c08], ["yellow", 0xf3d34a, 0x3a2c05]]) {
                    const a = new PIXI.Graphics();
                    a.moveTo(20, 0); a.lineTo(-12, -13);
                    a.lineTo(-6, 0); a.lineTo(-12, 13);
                    a.lineTo(20, 0);
                    a.fill({ color: fill });
                    a.stroke({ width: 2, color: line });
                    a.scale.set(1.3);
                    a.visible = false;
                    a.zIndex = hp.y + 2;
                    objLayer.addChild(a);
                    sideArrows[name] = a;
                }
                worldContainer.visible = true;
                camera.follow({
                    get x() { return heroId !== null ? COMPONENTS.positionX[heroId] : hp.x; },
                    get y() { return heroId !== null ? COMPONENTS.positionY[heroId] : hp.y; },
                }, 8);
                camera.setBounds({ x: 0, y: 0, width: map.w * TS, height: map.h * TS });
                // БЕЗ зума (просил юзер): тайлы 32px в натуральную величину;
                // камера общая со сценами данжа (там 1.3125) — сбрасываем
                camera.setZoom(1);
                camera.centerOn(hp.x, hp.y);
                // применить трансформ камеры до первого тика и собрать
                // чанки экрана (первый кадр сцены — уже с миром)
                camera.update({ deltaMS: 16.7 });
                updateChunks();
                updatePoiVisibility();
                uiHud = buildHud();
                ctx.ui.addChild(uiHud);
                // W94 (юзер): новая игра входит под играющим «прожигом» —
                // тот же переход, что и спуск в подземелье (W60), запускает
                // выбор героя. Эффект живёт на общей подложке ctx.ui и
                // переживает смену сцены; вход мира только ПОДНИМАЕТ его
                // над своим HUD (сцена сменилась под играющим кольцом) и
                // снимает флаг. В остальных входах в мир эффекта нет
                {
                    const FX = globalThis.GAME_FX;
                    if (FX && FX.available && G.world.ringUp) {
                        G.world.ringUp = false;
                        for (const h of FX.live)
                            if (h.sprite && !h.sprite.destroyed
                                && h.sprite.parent === ctx.ui
                                && h.inst.meta && h.inst.meta.name === "Burn away")
                                ctx.ui.addChild(h.sprite); // наверх, над HUD
                    }
                }
                // квест-диалоги: анонс нового задания / окно незабранной
                // награды (открываются поверх мира, герой стоит)
                globalThis.GAME_QUESTS.onSceneEnter(ctx);
                // награда побочного квеста ратуши (W40 → W54, юзер):
                // инфоокно «поручение выполнено» — что сделал герой
                // (победил разбойника / доставил письмо) + строка награды
                if (G.world.sideNote) {
                    const n = G.world.sideNote;
                    G.world.sideNote = null;
                    if (!globalThis.GAME_SIDEQ.showComplete(ctx, n)) {
                        // окно не открылось (нет ctx и т.п.) — прежний тост
                        floatText(GAME_LOC.t(n.key,
                            { res: GAME_LOC.t("res." + n.elem) }),
                            COMPONENTS.positionX[heroId],
                            COMPONENTS.positionY[heroId], 0xf3d34a);
                    }
                }
            },
            exit() {
                worldLock = false;
                if (heroId !== null) {
                    G.world.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
                }
                globalThis.GAME_QUESTS.forcedClose(ctx); // диалог не сиротеет
                // забег сохраняется и из мира (вход в пещеру/меню/настройки)
                if (G.saveRun) G.saveRun();
                // неактивные чанки (лежат в кэше, но не в layer) — вручную,
                // вместе с их спрайтами в y-sort слое; активные разрушит
                // layer.destroy вместе со сценой
                if (chunkCache) {
                    for (const [, ch] of chunkCache)
                        if (!ch.active) {
                            ch.node.destroy({ children: true });
                            for (const o of ch.objs) o.destroy();
                        }
                    chunkCache = null;
                }
                chunkHolder = null;
                chunkRect = "";
                mapFrame = null;
                objLayer = null;
                fxLayer = null;
                poiNodes = null;
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
                heroShadow = null;
                heroSprite = null;
                questArrow = null; // уходит вместе со слоем сцены
                worldTerr = null;
                terrStats = null;
                woodStats = null;
                swampStats = null;
                roadStats = null;
                path = null;
                // отряды — полноценные сущности characters: снять с ECS и
                // вернуть позиции в сейв-состояние (узлы уйдут со слоем)
                for (const s of squads) {
                    if (s.id !== null) {
                        s.st.x = COMPONENTS.positionX[s.id];
                        s.st.y = COMPONENTS.positionY[s.id];
                        characters.remove(s.id);
                    }
                }
                squads = [];
                hideSquadTip();
                floaties = [];
                if (layer) { layer.destroy({ children: true }); layer = null; }
                if (uiHud) { uiHud.destroy({ children: true }); uiHud = null; }
                worldContainer.visible = false;
            },
            update(ticker) {
                if (heroId === null || !uiHud) return;
                const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                if (ctx.footstep) ctx.footstep(hx, hy); // шаги героя (W34)
                // (W49) остывание входа в город после выхода — убывающий
                // счётчик МС (тиком здесь), НЕ метка performance.now():
                // та в сейве после перезапуска блокировала бы до конца
                // сессии (ловушка W22 у ladderCoolMs)
                if (G.world.cityCoolMs > 0)
                    G.world.cityCoolMs -= ticker.deltaMS;
                // чанки экрана + запас (пересобираются только при выходе
                // камеры за набор) и видимость POI (просил юзер: рисуется
                // только экран плюс запас, остальное — когда доедет)
                updateChunks();
                updatePoiVisibility();
                heroShadow.position.set(hx, hy - 0.7 * 7 * 2);
                heroShadow.zIndex = hy - 0.5;
                if (heroSprite) heroSprite.zIndex = hy;
                // стрелка задания (W31): у героя, в сторону цели; у самой
                // цели и при открытом диалоге приглушена/скрыта
                if (questArrow) {
                    const qa = (G.settings && G.settings.questArrow !== false)
                        && !(ctx.questModal || 0)
                        ? globalThis.GAME_QUESTS.arrowTarget(G, { x: hx, y: hy })
                        : null;
                    if (qa) {
                        const dx = qa.x - hx, dy = qa.y - hy;
                        const d = Math.hypot(dx, dy) || 1;
                        const r = 48 + 4 * Math.sin(performance.now() / 280);
                        questArrow.visible = true;
                        questArrow.position.set(hx + dx / d * r, hy + dy / d * r - 30);
                        questArrow.rotation = Math.atan2(dy, dx);
                        questArrow.alpha = d > TS * 2.5 ? 0.95 : 0.45;
                        questArrow.zIndex = hy + 2;
                    } else questArrow.visible = false;
                }
                // стрелки побочных квестов ратуши (W40): красная — ближайший
                // живой охотничий монстр, жёлтая — город-адресат письма;
                // скрыты при модальном диалоге; свой чекбокс — в окне
                // поручения (G.settings.sideqArrow, W45: отдельно от
                // сюжетной стрелки)
                if (sideArrows) {
                    const on = (G.settings && G.settings.sideqArrow !== false)
                        && !(ctx.questModal || 0);
                    const tgts = on && globalThis.GAME_SIDEQ
                        ? globalThis.GAME_SIDEQ.arrowTargets(G) : [];
                    for (const name of ["red", "yellow"]) {
                        const a = sideArrows[name];
                        const near = tgts.filter((t) => t.color === name)
                            .sort((p, q) => Math.hypot(p.x - hx, p.y - hy)
                                - Math.hypot(q.x - hx, q.y - hy))[0];
                        if (near) {
                            const dx = near.x - hx, dy = near.y - hy;
                            const d = Math.hypot(dx, dy) || 1;
                            const r = 48 + 4 * Math.sin(performance.now() / 280);
                            a.visible = true;
                            a.position.set(hx + dx / d * r, hy + dy / d * r - 30);
                            a.rotation = Math.atan2(dy, dx);
                            a.alpha = d > TS * 2.5 ? 0.95 : 0.45;
                            a.zIndex = hy + 2;
                        } else a.visible = false;
                    }
                }
                // жёлтые свечения городов-адресатов писем (W40): пульс
                if (poiGlows.length) {
                    const lit = globalThis.GAME_SIDEQ
                        ? globalThis.GAME_SIDEQ.glowCities(G) : [];
                    for (const g of poiGlows) {
                        const on = lit.includes(g.key);
                        g.node.visible = on;
                        if (on) g.node.alpha = 0.62 + 0.3
                            * Math.sin(performance.now() / 300);
                    }
                }
                // жёлтое свечение стартового города (W67, юзер): пульс,
                // после входа в него — никогда больше
                if (startGlow) {
                    if (G.world.startCitySeen || startGlow.destroyed)
                        startGlow = null;
                    else startGlow.alpha = 0.5 + 0.2
                        * Math.sin(performance.now() / 300);
                }
                // скорость по дорогам (просил юзер): дорога и мост дают
                // ×1.2 к обычному шагу — переключается клеткой под ногами
                {
                    const t = G.world.map.ter[
                        Math.floor(hy / TS) * G.world.map.w + Math.floor(hx / TS)];
                    COMPONENTS.ctrlSpeed[heroId] =
                        t === T.ROAD || t === T.BRIDGE ? ROAD_SPEED : HERO_SPEED;
                }
                // мини-карта: угол прижат к краю окна (letterbox), маркер
                // героя живёт вместе с ним (пульс)
                {
                    const mini = uiHud.userData.mini;
                    if (mini && G.world.map) {
                        mini.fit();
                        mini.dot.position.set(
                            hx / (G.world.map.w * TS) * mini.MW,
                            hy / (G.world.map.h * TS) * mini.MH);
                        mini.dot.scale.set(1 + 0.25 * Math.sin(performance.now() / 250));
                    }
                }

                // краевые элементы HUD прижаты к краям ОКНА по горизонтали
                // (просил юзер): при окне шире/уже 16:9 letterbox-полосы
                // канваса UI отодвигали золото/карточку героя и настройки
                // от краёв к центру — позиции пересчитываются каждый кадр
                // от реального размера экрана (как у мини-карты выше).
                // Вертикаль не трогаем — по горизонтали только (спека)
                {
                    const lt = ctx.ui.toLocal({ x: 0, y: 0 });
                    const rt = ctx.ui.toLocal({
                        x: ctx.app.screen.width, y: 0 });
                    const ud = uiHud.userData;
                    // панель героя/ресурсов — у левого верхнего угла окна
                    // (вся начинка — дети панели, включая счётчик дней
                    // (W122), едет вместе с ней)
                    ud.panel.position.set(lt.x, 0);
                    ud.settingsBtn.position.set(rt.x - 81, 66);
                    // плавное увеличение карты героя при наведении на
                    // кружок в кольце (W120): лерп alpha/масштаба к цели
                    ud.heroA += (ud.heroT - ud.heroA) * 0.22;
                    if (ud.heroA < 0.004) ud.heroA = 0;
                    const he = ud.heroA * ud.heroA * (3 - 2 * ud.heroA);
                    ud.heroFull.alpha = he;
                    ud.heroFull.scale.set(0.45 + 0.55 * he);
                }
                // дни открытого мира (W60, юзер): тикают ТОЛЬКО здесь —
                // 20 секунд реального времени = 1 день; бой/город/подземелье/
                // меню счётчик не двигают (update мира не выполняется)
                daysAcc += ticker.deltaMS / 1000;
                if (daysAcc >= 20) {
                    daysAcc -= 20;
                    G.days = (G.days || 0) + 1;
                    uiHud.userData.dayT.text = String(G.days);
                    bossDayTick(); // мировые боссы: спавн раз в 10 дней, уход (W136)
                }

                // всплывающие подписи («Скоро…») — вверх и растворение
                for (let i = floaties.length - 1; i >= 0; i--) {
                    const f = floaties[i];
                    f.t += ticker.deltaMS / 1000;
                    f.node.y -= ticker.deltaMS * 0.03;
                    f.node.alpha = Math.max(0, 1 - f.t / 1.4);
                    if (f.t > 1.4) { f.node.destroy(); floaties.splice(i, 1); }
                }

                // панель-подсказка на отряде следует за ним (камера едет);
                // отряд скрылся/умер — тутип закрыт
                if (tip) {
                    if (!squads.includes(tip.squad) || !tip.squad.st.alive
                        || ctx.questModal) hideSquadTip();
                    else placeSquadTip();
                }

                // скорость анимаций из настроек (0..10; 5 = скорость листа) —
                // живая, как в бою и подземелье (просил юзер)
                COMPONENTS.animationSpeed[heroId] = (ctx.heroSheet.animationSpeed || 0.2)
                    * Math.max(0.25, ((G.settings && G.settings.animSpeed) ?? 6) / 6);

                // Эскейп закрывает квест-диалог его кнопкой (просил юзер —
                // дублирование кнопок «выход» меню на клавишу); окно
                // «поручение выполнено» (W54) — своей кнопкой, затем окно
                // поручения (W45) — кнопкой «Уйти»
                if (ctx.input.wasPressed("Escape") && (ctx.questModal || 0) > 0) {
                    if (globalThis.GAME_SIDEQ
                        && globalThis.GAME_SIDEQ.closeComplete()) {
                        // окно завершения закрыто — остальное не трогаем
                    } else if (!globalThis.GAME_QUESTS.tap()
                        && globalThis.GAME_SIDEQ) {
                        globalThis.GAME_SIDEQ.closeReview();
                    }
                }

                // M — размер мини-карты: обычная ↔ крупная вдвое
                // (просил юзер волна 15)
                if (ctx.input.wasPressed("KeyM"))
                    setMiniMode(miniMode === 1 ? 2 : 1);

                // C — колода/коллекция (W60, юзер): как клик по карте героя
                if (ctx.input.wasPressed("KeyC") && !(ctx.questModal > 0)
                    && !worldLock) {
                    if (ctx.sfx) ctx.sfx();
                    G.uiReturn = "world";
                    scenes.go("deck");
                }

                // квест-диалог открыт (модальный) — герой стоит и не входит
                // в пещеры, пока окно не закрыто
                if (ctx.questModal || worldLock) {
                    setHeroAxes(0, 0);
                    path = null;
                } else {
                    // ведение по пути (как в подземелье: клавиши главнее)
                    if (path && (charInput.ix || charInput.iy)) path = null;
                    if (path && !path.length) path = null;
                    if (path) {
                        const dx = path[0].x - hx, dy = path[0].y - hy;
                        if (Math.hypot(dx, dy) < 5) {
                            const last = path.length === 1 ? path[0] : null;
                            path.shift();
                            if (!path.length) {
                                if (last) {
                                    COMPONENTS.positionX[heroId] = last.x;
                                    COMPONENTS.positionY[heroId] = last.y;
                                }
                                path = null;
                            }
                        }
                    }
                    if (path) {
                        const dx = path[0].x - hx, dy = path[0].y - hy;
                        const d = Math.hypot(dx, dy) || 1;
                        setHeroAxes(dx / d, dy / d);
                    } else {
                        setHeroAxes(charInput.ix, charInput.iy);
                    }
                }

                uiHud.userData.goldT.text = String(G.gold);
                // ресурсы стихий в HUD (W40) — числа каждый кадр
                for (const e of globalThis.GAME_SIDEQ.RES_ELEMS)
                    uiHud.userData.resT[e].text = String(G.resources[e] || 0);

                // (W46, юзер) иконки квестов в HUD — синхронизация по кадрам:
                // руна видна только с ВЗЯТЫМ квестом (announced ставит
                // «Принять» в диалоге Глома), кнопка поручения — в своём
                // постоянном слоте правее (не двигаем: позиция иконок
                // не зависит от состояния квестов)
                {
                    const qud = uiHud.userData;
                    const qOn = !!(G.quests && G.quests.active
                        && G.quests.announced);
                    const sq = globalThis.GAME_SIDEQ
                        && globalThis.GAME_SIDEQ.stateOf(G);
                    qud.qRune.visible = qOn;
                    qud.qSide.visible = !!(sq && sq.active
                        && sq.active.length);
                }

                // ── бродячие отряды: патруль, погоня, касание — бой ────────
                // (просил юзер). Ходят по сетке 4 направлениями: BFS-путь
                // ведём виртуальными осями ctrlVI/VJ — контроллер characters
                // сам двигает отряд, играет walk_* и разворачивает его
                // (как героя). Пока открыт квест-диалог или отряды
                // заморожены тестами (wanderFreeze) — стоят
                if (!ctx.questModal && !G.world.wanderFreeze
                    && !window.__wanderFreezeAll && squads.length) {
                    for (const s of squads) {
                        const sx = COMPONENTS.positionX[s.id],
                            sy = COMPONENTS.positionY[s.id];
                        s.st.x = sx; s.st.y = sy; // сейв-состояние живёт с ним
                        s.shadow.position.set(sx, sy - 9.8);
                        s.shadow.zIndex = sy - 0.5;
                        // красное свечение охотничьего монстра (W67, юзер):
                        // копия спрайта ВОКРУГ него — кадр анимации и позиция
                        // следом за спрайтом, альфа пульсирует
                        if (s.glow) {
                            s.glow.texture =
                                s.sprite.textures[s.sprite.currentFrame];
                            s.glow.position.set(sx, sy);
                            s.glow.zIndex = sy - 0.4;
                            s.glow.alpha = 0.45 + 0.25
                                * Math.sin(performance.now() / 260);
                        }
                        const dHero = Math.hypot(hx - sx, hy - sy);
                        // касание отряда — бой (как соприкосновение
                        // с противником в самом подземелье). После
                        // «Убежать»/поражения 3с бой не начинается
                        // (просил юзер волна 15 — успеть отбежать)
                        if (dHero < TS * 0.85
                            && performance.now() >= (G.world.battleCool || 0)) {
                            fightSquad(s); return;
                        }
                        // ── мировой босс в полёте (W136): прямая линия
                        // к цели, над препятствиями — позиция пишется
                        // напрямую (контроллер с осями 0 позицию не трогает);
                        // долетел — сел на точку (leaveDay = +5 дней) или
                        // улетел за край (alive:false, сцена снимет отряд)
                        if (s.kind === "boss"
                            && (s.st.phase === "fly" || s.st.phase === "leave")) {
                            s.aggro = false;
                            // РЕАКЦИЯ НА ИГРОКА (спека W136): рядом —
                            // босс летит НА него прямым полётом (касание —
                            // бой); ушёл — продолжает путь к точке/краю
                            const chase = dHero < WAND_AGGRO * 2;
                            const btx = chase ? hx : s.st.tx;
                            const bty = chase ? hy : s.st.ty;
                            const bdx = btx - sx, bdy = bty - sy;
                            const bd = Math.hypot(bdx, bdy);
                            const step = Math.max(BOSS_SPEED
                                * ticker.deltaMS / 1000, 1);
                            if (bd <= Math.max(step * 1.5, TS / 3)) {
                                if (s.st.phase === "fly") {
                                    s.st.phase = "sit";
                                    s.st.leaveDay = (G.days || 0) + 5;
                                    s.st.x = s.st.tx; s.st.y = s.st.ty;
                                } else {
                                    s.st.alive = false;
                                    s.gone = true;
                                }
                            } else {
                                s.st.x = sx + bdx / bd * step;
                                s.st.y = sy + bdy / bd * step;
                            }
                            COMPONENTS.positionX[s.id] = s.st.x;
                            COMPONENTS.positionY[s.id] = s.st.y;
                            COMPONENTS.ctrlVI[s.id] = 0;
                            COMPONENTS.ctrlVJ[s.id] = 0;
                            s.shadow.position.set(s.st.x, s.st.y - 13);
                            s.shadow.zIndex = s.st.y - 0.5;
                            s.sprite.position.set(s.st.x, s.st.y);
                            s.sprite.zIndex = s.st.y;
                            if (s.glow) {
                                s.glow.position.set(s.st.x, s.st.y);
                                s.glow.zIndex = s.st.y - 0.4;
                            }
                            continue;
                        }
                        // дистанция до СВОЕГО маршрута (ближайшая его точка) —
                        // поводок погони: преследуем, но недалеко от маршрута
                        let dRoute = Infinity;
                        for (const [gx, gy] of s.d.route) {
                            const dd = Math.hypot(
                                sx - (gx * TS + TS / 2),
                                sy - (gy * TS + TS / 2));
                            if (dd < dRoute) dRoute = dd;
                        }
                        // агро: герой близко, отряд не за поводком маршрута
                        // и до героя есть путь (через реку не гонимся);
                        // сорвать погоню — герой ушёл или отряд дошёл до края.
                        // Пока действует иммунитет после побега/поражения —
                        // новые погони не срываются (герой отходит в покое).
                        // У диких врагов обнаружение ВДВОЕ больше (просил
                        // юзер W29) — заметят и погонятся раньше стражей
                        const aggroR = (s.kind === "wild" || s.kind === "boss")
                            ? WAND_AGGRO * 2 : WAND_AGGRO;
                        const hgx = Math.floor(hx / TS), hgy = Math.floor(hy / TS);
                        const sgx = Math.floor(sx / TS), sgy = Math.floor(sy / TS);
                        const battleCool = performance.now() < (G.world.battleCool || 0);
                        const wasAggro = s.aggro;
                        if (!s.aggro && !battleCool && dHero < aggroR
                            && dRoute < WAND_LEASH
                            && bfsPath(sgx, sgy, hgx, hgy)) s.aggro = true;
                        else if (s.aggro && (dHero > aggroR * 1.4
                            || dRoute > WAND_LEASH)) s.aggro = false;
                        // бродячий монстр заметил героя (W34, юзер):
                        // сигнал «обнаружения», не чаще раза в 2.5с
                        if (s.aggro && !wasAggro && ctx.sfx
                            && performance.now() >= (G.world.alertCool || 0)) {
                            G.world.alertCool = performance.now() + 2500;
                            ctx.sfx("alert");
                        }
                        if (s.aggro) {
                            // погоня: путь к герою, пересчёт раз в 0.4с
                            // (герой бежит — маршрут перестраивается)
                            s.repath -= ticker.deltaMS;
                            if (!s.path || !s.path.length || s.repath <= 0) {
                                s.repath = 400;
                                s.path = bfsPath(sgx, sgy, hgx, hgy);
                            }
                        } else {
                            // патруль: к очередной точке маршрута; дойдя —
                            // следующая. Путь строится от клетки отряда
                            const wc = s.d.route[s.wp % s.d.route.length];
                            if (Math.hypot(wc[0] * TS + TS / 2 - sx,
                                wc[1] * TS + TS / 2 - sy) < TS / 3) {
                                s.wp = (s.wp + 1) % s.d.route.length;
                                s.path = null;
                            } else if (!s.path || !s.path.length) {
                                s.path = bfsPath(sgx, sgy, wc[0], wc[1]);
                                if (!s.path) {
                                    // точку отрезало (чужой отряд не бывает —
                                    // компонента общая): пропустить
                                    s.wp = (s.wp + 1) % s.d.route.length;
                                }
                            }
                        }
                        // ведение по пути: ось на очередную клетку пути
                        let vx = 0, vy = 0;
                        if (s.path && s.path.length) {
                            const t = s.path[0];
                            const dx = t.x - sx, dy = t.y - sy;
                            const d = Math.hypot(dx, dy) || 1;
                            if (d < 5) s.path.shift(); // клетка пройдена
                            const t2 = s.path[0];
                            if (t2) {
                                const dx2 = t2.x - sx, dy2 = t2.y - sy;
                                const d2 = Math.hypot(dx2, dy2) || 1;
                                vx = dx2 / d2; vy = dy2 / d2;
                            }
                        }
                        COMPONENTS.ctrlVI[s.id] = vx;
                        COMPONENTS.ctrlVJ[s.id] = vy;
                    }
                } else if (squads.length) {
                    for (const s of squads) {
                        COMPONENTS.ctrlVI[s.id] = 0;
                        COMPONENTS.ctrlVJ[s.id] = 0;
                    }
                }
                // улетевшие за край мировые боссы — снять с карты (W136);
                // вернутся в следующем 10-дневном цикле, если не убиты
                for (let bi = squads.length - 1; bi >= 0; bi--) {
                    const bs = squads[bi];
                    if (!bs.gone) continue;
                    if (bs.id !== null) characters.remove(bs.id);
                    bs.sprite.destroy();
                    bs.shadow.destroy();
                    if (bs.glow) bs.glow.destroy();
                    squads.splice(bi, 1);
                    floatText(GAME_LOC.t("world.bossLeft",
                        { name: GAME_LOC.t("hero." + bs.st.enc + ".name") }),
                        COMPONENTS.positionX[heroId],
                        COMPONENTS.positionY[heroId], 0xc9b98c);
                }

                // арки подземелий — касание (диалог открыт — молчат).
                // Вход закрыт малой колодой или данж ещё впереди —
                // всплывает предупреждение (кулдаун 2.5с — без спама)
                if (!ctx.questModal && !worldLock && layer) {
                // W60 (юзер): герой вошёл во вход подземелья «Роща роста»,
                // а попал в столицу «Вечная Роща» — радиусы триггеров
                // перекрывались (город 1.3 клетки, пещера 0.85), и побеждал
                // ПЕРВЫЙ в списке POI. Теперь собираем всех подходящих и
                // входим в БЛИЖАЙШИЙ (ничья — пещера: её радиус жёстче,
                // герой целился именно в неё)
                let bestPoi = null, bestKind = null, bestD = Infinity;
                for (const p of G.world.map.pois) {
                    const c = px(p);
                    const d = Math.hypot(c.x - hx, c.y - hy);
                    // города (W30/W31): касание СТАРТОВОГО — вход в НЕГО
                    // (раньше всегда открывался первый spawnTown в pois —
                    // город Силы, баг юзера). W40 (юзер): входят ВСЕ города
                    // — письмо ратуши доставляется в любой из них.
                    // W42: нижний ряд спрайта непроходим (тело города —
                    // препятствие), радиус 1.3 клетки — вход с клетки
                    // перед воротами (диагональ 45px ещё молчит)
                    if ((p.kind === "town" || p.kind === "capital")
                        && d < TS * 1.3) {
                        // (W49, юзер) 3с после выхода вход в ЭТОТ же город
                        // закрыт — ворота можно спокойно пройти мимо; в
                        // другие города и после остывания вход как был
                        if (G.world.cityCoolMs > 0
                            && G.world.cityCoolTw === p.gx + ":" + p.gy) continue;
                        if (d < bestD) { bestD = d; bestPoi = p; bestKind = "city"; }
                    }
                    if (p.kind !== "dungeon") continue;
                    if (d < TS * 0.85
                        && (bestKind !== "city" || d <= bestD)) {
                        bestD = d; bestPoi = p; bestKind = "cave";
                    }
                }
                if (bestPoi) {
                    const p = bestPoi;
                    const c = px(p);
                    if (bestKind === "city") {
                        enterCity(p);
                        return;
                    }
                    {
                        const deniedAt = p.denyAt || p.soonAt;
                        if (globalThis.GAME_DATA.CAVES[p.cave]
                            ? !enterCave(p.cave)
                            : true) {
                            if (!deniedAt || performance.now() - deniedAt > 2500) {
                                p.denyAt = p.soonAt = performance.now();
                                soonCount++;
                                if (ctx.sfx) ctx.sfx();
                                // отказ «Рыжего леса» (W54): без 2 ресурсов
                                // стихий — свой текст, без них — про колоду
                                const cd = globalThis.GAME_DATA
                                    .CAVES[p.cave] || null;
                                const noRes = cd && cd.fury && cd.elems
                                    && !cd.elems.every((e) =>
                                        (G.resources
                                            && (G.resources[e] || 0)) >= 1);
                                const floor = G.run.cave === p.cave
                                    ? (G.run.floors
                                        || (G.run.floors = {}))[p.cave] || 1
                                    : 1;
                                floatText(GAME_LOC.t(
                                    !cd ? "world.soon"
                                        : noRes ? "world.resLow"
                                        : "world.deckLow",
                                    { min: globalThis.GAME_DATA
                                        .caveDeckFor(p.cave, floor) }),
                                    c.x, c.y, 0xd8c79d);
                            }
                        }
                        return;
                    }
                }
                }
            },
            heroId: () => heroId,
            // ── тесты: карта, геометрия, программный вход в пещеру ────────
            api: {
                info: () => {
                    const map = G.world.map;
                    const hero = heroId !== null
                        ? { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] }
                        : { ...G.world.heroPos };
                    const caveOf = (id) => {
                        const p = cavePoi(id);
                        return p ? px(p) : null;
                    };
                    // ближайшая свободная клетка с ДОСТИЖИМЫМ путём от
                    // героя — цель клика в тестах (клетка за стеной не годится)
                    const gx = Math.floor(hero.x / TS), gy = Math.floor(hero.y / TS);
                    let walkTarget = null;
                    outer: for (let r = 2; r <= 6; r++)
                        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                            if (walkable(gx + dx, gy + dy)
                                && bfsPath(gx, gy, gx + dx, gy + dy)) {
                                walkTarget = { x: (gx + dx) * TS + TS / 2,
                                    y: (gy + dy) * TS + TS / 2 };
                                break outer;
                            }
                        }
                    return {
                        heroPos: hero,
                        spawn: map ? px(map.spawn[G.elem] || map.spawn.strength) : null,
                        cave: caveOf("gob"), grove: caveOf("grw"),
                        keys: caveOf("wis"), dead: caveOf("dec"),
                        honorCave: caveOf("hon"), timeCave: caveOf("tim"),
                        w: map ? map.w : 0, h: map ? map.h : 0,
                        ts: TS,
                        zoom: camera.cam.zoom,
                        roundPixels: !!ctx.app.renderer.roundPixels, // рябь-фикс
                        heroScale: heroSprite ? heroSprite.scale.x : null,
                        seed: G.world.seed,
                        pois: map ? map.pois.length : 0,
                        speed: heroId !== null ? COMPONENTS.ctrlSpeed[heroId] : null,
                        questArrow: questArrow
                            ? { visible: questArrow.visible, x: questArrow.x,
                                y: questArrow.y, rot: questArrow.rotation }
                            : null,
                        onRoad: !!(map && heroId !== null
                            && [T.ROAD, T.BRIDGE].includes(map.ter[
                                Math.floor(hero.y / TS) * map.w + Math.floor(hero.x / TS)])),
                        walkTarget,
                        // чанковый culling (просил юзер): кэш построенных
                        // чанков, активных на экране, деревьев в построенном
                        chunks: chunkCache
                            ? { cache: chunkCache.size,
                                active: [...chunkCache.values()]
                                    .filter((ch) => ch.active).length,
                                keys: [...chunkCache]
                                    .filter(([, ch]) => ch.active)
                                    .map(([k]) => (k % 64) + ":" + ((k / 64) | 0)) }
                            : null,
                        trees: treeCount,
                        mountains: mtnCount,
                    };
                },
                map: () => {
                    const m = G.world.map;
                    if (!m) return null;
                    return {
                        w: m.w, h: m.h, seed: m.seed, rows: m.rows,
                        ter: m.ter, zone: m.zone, spawn: m.spawn,
                        pois: m.pois.map((p) => ({ ...p })),
                        wildSpawns: (m.wildSpawns || [])
                            .map((d) => ({ ...d, route: d.route.map((r) => [...r]) })),
                    };
                },
                // слой местности (тайлы images/tiles): коды клеток 0..7
                // (земля/трава/снег/песок/тлен/вода/болото), статистика
                // рендера, лесной оверлей wood.png, болота swamp.png,
                // дороги roads.png и мосты moats.png (тайлы по маскам)
                terrain: () => ({
                    v: globalThis.GAME_WORLDTILES.V,
                    terr: worldTerr ? Array.from(worldTerr) : null,
                    stats: terrStats,
                    forest: woodStats ? { ...woodStats } : null,
                    swamp: swampStats ? { ...swampStats } : null,
                    roads: roadStats ? { ...roadStats } : null,
                    moats: moatStats ? { ...moatStats } : null,
                }),
                setHeroPos(x, y) {
                    if (heroId === null) return false;
                    COMPONENTS.positionX[heroId] = x;
                    COMPONENTS.positionY[heroId] = y;
                    path = null; // телепорт гасит маршрут клика
                    return true;
                },
                enterCave: (cave) => enterCave(cave),
                // вход в город: без аргумента — «свой» стартовый (тесты W30),
                // с poi — в указанный (письмо W40 / вход в любой город)
                enterCity: (tw) => enterCity(tw),
                // (W49) остывание повторного входа в город после выхода
                // (пробы): мс до конца кулдауна и ключ города (gx:gy)
                cityCool: () => ({ ms: Math.max(0, G.world.cityCoolMs || 0),
                    tw: G.world.cityCoolTw || null }),
                soonCount: () => soonCount,
                // ── бродячие отряды (тесты): список с живыми позициями и
                // заморозка ИИ — пробы с прогулками по миру не ловят бои.
                // Живая позиция отряда — из сущности characters (сцена),
                // иначе из сейв-состояния
                wander: () => ({
                    freeze: !!G.world.wanderFreeze,
                    list: ((G.world.map && G.world.map.wanderers) || [])
                        .map((d, i) => {
                            const key = "cave:" + d.cave + ":" + i;
                            const st = G.world.wander && G.world.wander[key];
                            if (!st) return null;
                            const s = squads.find((x) => x.key === key);
                            return {
                                cave: d.cave, i, key, alive: st.alive,
                                x: s && s.id !== null ? COMPONENTS.positionX[s.id] : st.x,
                                y: s && s.id !== null ? COMPONENTS.positionY[s.id] : st.y,
                                enc: s ? s.enc : null,
                                // W86: каким листом реально рисуется отряд
                                sheet: s ? sheetNameOf(s.sheetRef) : null,
                                route: d.route,
                                active: !!globalThis.GAME_DATA.CAVES[d.cave],
                                face: s && s.id !== null
                                    ? characters.facingName(s.id) : null,
                                walking: !!(s && s.id !== null
                                    && COMPONENTS.ctrlMove[s.id]),
                            };
                        }).filter(Boolean),
                }),
                // ── охранники мостов и Тлена (тесты): список + живые
                // позиции (единый формат; ключи bridge:j / decay:j) ────
                bridges: () => {
                    const m = G.world.map;
                    const item = (d, key, j) => {
                        const st = G.world.wander && G.world.wander[key];
                        if (!st) return null;
                        const s = squads.find((x) => x.key === key);
                        return {
                            j, key, elem: d.elem, alive: st.alive,
                            enc: guardEncOf(d.elem),
                            x: s && s.id !== null ? COMPONENTS.positionX[s.id] : st.x,
                            y: s && s.id !== null ? COMPONENTS.positionY[s.id] : st.y,
                            // W86: каким листом реально рисуется отряд
                            sheet: s ? sheetNameOf(s.sheetRef) : null,
                            route: d.route,
                            // персонаж мира: взгляд и «идёт» (контроллер)
                            face: s && s.id !== null
                                ? characters.facingName(s.id) : null,
                            walking: !!(s && s.id !== null
                                && COMPONENTS.ctrlMove[s.id]),
                        };
                    };
                    return { list: [
                        ...(((m && m.bridgeGuards) || []).map((d, j) =>
                            item(d, "bridge:" + j, j))),
                        ...(((m && m.decayGuards) || []).map((d, j) =>
                            item(d, "decay:" + j, j))),
                    ].filter(Boolean) };
                },
                // ── дикие враги точек спавна (тесты, W29): список с
                // живыми позициями, колодой и усилением вида ──────────
                wild: () => {
                    const m = G.world.map;
                    const out = [];
                    if (m && m.wildSpawns)
                        for (let i = 0; i < m.wildSpawns.length; i++) {
                            const d = m.wildSpawns[i];
                            const key = "wild:" + d.elem + ":" + i;
                            const st = G.world.wander && G.world.wander[key];
                            if (!st) continue;
                            const s = squads.find((x) => x.key === key);
                            out.push({
                                i, key, elem: d.elem, enc: st.enc,
                                alive: st.alive, hpBonus: st.hpBonus || 0,
                                deck: st.deck || [],
                                gx: d.gx, gy: d.gy,
                                x: s && s.id !== null
                                    ? COMPONENTS.positionX[s.id] : st.x,
                                y: s && s.id !== null
                                    ? COMPONENTS.positionY[s.id] : st.y,
                                aggro: s ? !!s.aggro : false,
                                face: s && s.id !== null
                                    ? characters.facingName(s.id) : null,
                                walking: !!(s && s.id !== null
                                    && COMPONENTS.ctrlMove[s.id]),
                            });
                        }
                    return { list: out, level: G.world.wildLevel || {} };
                },
                // ── побочные квесты ратуши и ресурсы (тесты, W40) ────────
                sideq: () => ({
                    state: globalThis.GAME_SIDEQ
                        ? globalThis.GAME_SIDEQ.stateOf(G) : null,
                    mobs: globalThis.GAME_SIDEQ
                        ? globalThis.GAME_SIDEQ.huntMobs(G).map((m) => {
                            const s = squads.find((x) => x.key === m.key);
                            return { ...m,
                                x: s && s.id !== null
                                    ? COMPONENTS.positionX[s.id] : m.x,
                                y: s && s.id !== null
                                    ? COMPONENTS.positionY[s.id] : m.y,
                                walking: !!(s && s.id !== null
                                    && COMPONENTS.ctrlMove[s.id]),
                                glow: !!(s && s.glow && s.glow.visible) };
                        }) : [],
                    glows: globalThis.GAME_SIDEQ
                        ? globalThis.GAME_SIDEQ.glowCities(G) : [],
                    arrows: sideArrows ? {
                        red: sideArrows.red.visible,
                        yellow: sideArrows.yellow.visible } : null,
                    // (W45) цвета/видимость обеих стрелок + чек-боксы
                    arrowState: () => ({
                        sideqOn: (G.settings && G.settings.sideqArrow) !== false,
                        storyOn: (G.settings && G.settings.questArrow) !== false,
                        red: sideArrows ? sideArrows.red.visible : null,
                        yellow: sideArrows ? sideArrows.yellow.visible : null,
                        story: questArrow ? questArrow.visible : null,
                        storyFill: questArrow ? 0x76c93e : null,
                        review: globalThis.GAME_SIDEQ.reviewOpen(),
                    }),
                    // (W46) иконки квестов в HUD: видимость руны (только
                    // с взятым квестом) и кнопки поручения + её X
                    questIcons: () => {
                        const ud = uiHud && uiHud.userData;
                        return ud && ud.qRune
                            ? { rune: ud.qRune.visible,
                                side: ud.qSide.visible,
                                sideX: Math.round(ud.qSide.position.x),
                                runeX: Math.round(ud.qRune.position.x) }
                            : null;
                    },
                    note: G.world.sideNote || null,
                }),
                res: () => ({ resources: { ...G.resources },
                    boosters: { ...G.boosters } }),
                // подсказка на отряде: состояние панели (как в подземелье)
                hoverAt(x, y) {
                    hoverSquads({ x, y });
                    return tip ? { enc: tip.squad.enc } : null;
                },
                tipState: () => (tip ? {
                    enc: tip.squad.enc,
                    title: GAME_LOC.t("enc." + tip.squad.enc + ".title"),
                    rows: tip.win.rows.length, // строк таблички (W141)
                    w: tip.win.w, h: tip.win.h,
                    hero: tip.win.hero,
                    rowIds: tip.win.rows.map((r) => r.id),
                } : null),
                tipZoomShow: (i) => {
                    if (tip && tip.win.rows[i]) tip.win.rows[i].node.emit("pointerover");
                    return !!(tip && tip.win.rows[i]);
                },
                tipZoomHide: () => { if (tip) tip.win.zoomer.hide(); return true; },
                tipZoomState: () => (tip ? tip.win.zoomer.state() : null),
                tipHide: () => hideSquadTip(),
                // пополнить колоду тестово (гейты данжа: вход 16+): карты
                // стартера героя циклично до нужного размера
                deckAdd: (n) => {
                    const D = globalThis.GAME_DATA;
                    const starter = D.STARTER_DECKS[
                        (D.HEROES[G.heroId] || D.HEROES.gorbag).starter]
                        || D.DEFAULT_DECK;
                    while (G.deck.length < n) G.deck.push(
                        starter[G.deck.length % starter.length]);
                    return G.deck.length;
                },
                wanderFreeze: (v) => { G.world.wanderFreeze = !!v; return true; },
                // все отряды сцены (тесты): вид, живой id, агро и позиция —
                // общий срез по kind (cave/bridge/decay/wild)
                squadsList: () => squads.map((s) => ({
                    kind: s.kind, key: s.key, enc: s.enc,
                    id: s.id, aggro: !!s.aggro,
                    x: s.id !== null ? COMPONENTS.positionX[s.id] : null,
                    y: s.id !== null ? COMPONENTS.positionY[s.id] : null,
                })),
                // подсветки мира (тесты, W67): стартовый город новой игры
                // и кромка охотничьего монстра (копия спрайта, W67)
                glowState: () => ({
                    startCity: G.world.startCity || null,
                    startCitySeen: !!G.world.startCitySeen,
                    startGlow: (startGlow && !startGlow.destroyed
                        && startGlow.visible) ? {
                        alpha: +startGlow.alpha.toFixed(3),
                        rim: +startGlow.scale.x.toFixed(3),
                        tint: startGlow.tint,
                    } : null,
                    huntGlows: squads.filter((s) => s.glow).map((s) => ({
                        key: s.key,
                        alpha: +s.glow.alpha.toFixed(3),
                        rim: +s.glow.scale.x.toFixed(3),
                        tint: s.glow.tint,
                        follows: s.glow.texture
                            === s.sprite.textures[s.sprite.currentFrame],
                    })),
                }),
                // мини-карта (правый нижний угол): бокс и маркер героя
                mini: () => {
                    const mini = uiHud && uiHud.userData.mini;
                    if (!mini || !G.world.map || heroId === null) return null;
                    const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                    return {
                        x: mini.box.x, y: mini.box.y,
                        w: mini.MW, h: mini.MH,
                        dot: {
                            x: hx / (G.world.map.w * TS),
                            y: hy / (G.world.map.h * TS),
                        },
                    };
                },
                // краевые элементы HUD: позиции в локальных координатах
                // канваса UI и края окна (тест прижатия к краям окна —
                // просил юзер, оконный режим с letterbox-полосами)
                hudEdges: () => {
                    if (!uiHud) return null;
                    const ud = uiHud.userData;
                    const lt = ctx.ui.toLocal({ x: 0, y: 0 });
                    const rt = ctx.ui.toLocal({
                        x: ctx.app.screen.width, y: 0 });
                    return {
                        left: lt.x, right: rt.x,
                        panelX: ud.panel.x,
                        settingsX: ud.settingsBtn.x,
                    };
                },
                path: () => path,
                // тест-хук: эмуляция клика по местности (обработчик зоны)
                clickAt: (x, y) => zoneRef && zoneRef.emit("pointertap",
                    { global: layer ? layer.toGlobal({ x, y }) : { x, y } }),
                hudNodes: () => hudBtns.filter((n) => !n.destroyed),
                worldToScreen: (x, y) => (layer ? layer.toGlobal({ x, y }) : null),
                // тест-хук: перепись деревьев в видимых чанках — {elem: {номер: шт}}
                // (деревья по зонам стихий, просил юзер; __tree/__elem ставит
                // renderTreesChunk)
                treeCensus: () => {
                    const out = {};
                    if (!objLayer) return out;
                    for (const o of objLayer.children) {
                        if (o.destroyed || !o.__tree) continue;
                        const e = o.__elem || "?";
                        (out[e] = out[e] || {})[o.__tree] =
                            (out[e][o.__tree] || 0) + 1;
                    }
                    return out;
                },
                // тест-хук: перепись флипов деревьев в видимых чанках —
                // {flipped, straight} (зеркалирование 50%, просил юзер)
                treeFlipCensus: () => {
                    const out = { flipped: 0, straight: 0 };
                    if (!objLayer) return out;
                    for (const o of objLayer.children) {
                        if (o.destroyed || !o.__tree) continue;
                        if (o.scale.x < 0) out.flipped++;
                        else out.straight++;
                    }
                    return out;
                },
            },
        };
    }

    globalThis.GAME_WORLD = { createWorldScene };
})();
