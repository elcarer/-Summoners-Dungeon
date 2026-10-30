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
// каждого моста через реку в зоне своей стихии (Время — позже). Все
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
        let worldTerr = null; // коды местности клетки (слой worldTiles)
        let terrStats = null; // статистика слоя (тесты: fallback/odd)
        let woodStats = null; // статистика лесного оверлея wood.png (тесты)
        let swampStats = null; // статистика болот swamp.png (тесты)
        let roadStats = null; // статистика дорог roads.png (тесты)
        let objLayer = null; // общий y-sort слой: деревья/горы/POI/герой
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
        let floaties = []; // всплывающие подписи («Скоро…» у арки)
        let soonCount = 0; // сколько раз арка сказала «Скоро…» (тесты)
        // бродячие отряды (просил юзер): охрана данжей + охранники мостов.
        // Ходят как герой — сущности characters с виртуальным вводом:
        // спрайтшит существ своей стихии, анимации walk_* и разворот
        // делает контроллер, маршрут — BFS по 4 направлениям
        // s = { kind: "cave"|"bridge", key, d, st, enc, id, sprite,
        //       shadow, wp, path, aggro, repath }
        let squads = [];
        let tip = null; // { squad, node, hero } — подсказка на отряде (курсор)

        // карта мира живёт в забеге: генерится по сиду один раз и
        // переживает переходы сцены (сейв хранит только сид)
        function ensureMap() {
            if (G.world.seed === undefined || G.world.seed === null)
                G.world.seed = (Math.random() * 0x7fffffff) | 0;
            if (!G.world.map || G.world.map.seed !== G.world.seed
                || G.world.map.v !== GEN.V)
                G.world.map = GEN.generate(G.world.seed);
            if (G.world.map.lang !== GAME_LOC.lang)
                GEN.namePois(G.world.map, GAME_LOC.lang);
            return G.world.map;
        }

        // динамическое состояние отрядов (жив/мёртв, где стоит) живёт в
        // забеге — сейв хранит его рядом с сидом карты; геометрия и
        // маршруты детерминированы сидом (worldGen, map.wanderers +
        // map.bridgeGuards). Ключи "cave:i" и "bridge:j" в одном словаре —
        // победа над отрядом (arenaFlow) снимает его по G.activeEnemy.wander
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
            if (map.bridgeGuards) for (let j = 0; j < map.bridgeGuards.length; j++) {
                const d = map.bridgeGuards[j];
                if (!guardEncOf(d.elem)) continue; // Время — стражей ещё нет
                const k = "bridge:" + j;
                if (!G.world.wander[k]) G.world.wander[k] = {
                    alive: true, x: (d.gx + 0.5) * TS, y: (d.gy + 0.5) * TS };
            }
            // миграция старых ключей "gob:0" → "cave:gob:0" (до v13)
            for (const k of Object.keys(G.world.wander))
                if (!k.startsWith("cave:") && !k.startsWith("bridge:")) {
                    G.world.wander["cave:" + k] = G.world.wander[k];
                    delete G.world.wander[k];
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
        // энкаунтер охранника моста по стихии (Время — позже, просил юзер)
        function guardEncOf(elem) {
            return { strength: "strGuard", growth: "grwGuard",
                wisdom: "wisGuard", decay: "decGuard", honor: "honGuard" }[elem] || null;
        }

        function walkable(gx, gy) {
            const map = G.world.map;
            if (!map || gx < 0 || gy < 0 || gx >= map.w || gy >= map.h) return false;
            const ch = map.rows[gy][gx];
            return ch !== "#" && ch !== "~";
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
        function setHeroAxes(ix, iy) {
            COMPONENTS.ctrlVI[heroId] = ix;
            COMPONENTS.ctrlVJ[heroId] = iy;
        }
        const px = (p) => ({ x: p.gx * TS + TS / 2, y: p.gy * TS + TS / 2 });
        // ближайшая свободная клетка не ближе 1.4 клетки от точки (герой
        // выходит из пещеры рядом с аркой, но не на самом триггере)
        function freeCellNear(x, y) {
            const gx = Math.floor(x / TS), gy = Math.floor(y / TS);
            for (let r = 2; r <= 5; r++)
                for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    if (Math.hypot(dx, dy) < 1.4) continue;
                    if (walkable(gx + dx, gy + dy))
                        return { x: (gx + dx) * TS + TS / 2, y: (gy + dy) * TS + TS / 2 };
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
                map, worldTerr, ctx.worldSheets, TS, x0, y0, terrStats).container);
            if (ctx.worldSheets.swamp)
                c.addChild(globalThis.GAME_WORLDTILES.renderSwampChunk(
                    map, ctx.worldSheets, TS, x0, y0, swampStats).container);
            c.addChild(globalThis.GAME_WORLDTILES.renderForestChunk(
                map, ctx.worldSheets, TS, x0, y0, woodStats).container);
            if (ctx.roadsTex && ctx.roadsTex.length)
                c.addChild(globalThis.GAME_WORLDTILES.renderRoadsChunk(
                    map, ctx.roadsTex, TS, x0, y0, roadStats).container);
            c.addChild(buildMapGfxChunk(map, x0, y0)); // мосты-настил
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

        // ── мосты чанка: настил-заглушка поверх воды (доски и кант).
        // Дороги рисует тайлсет roads.png (renderRoadsChunk, ПОД этим
        // слоем объектов), горы — спрайты montain (renderMountainsChunk,
        // общий y-sort слой) — см. worldTiles.js. Строится ЧАНКАМИ
        // 32×32 клетки — culling собирает сцену из видимых чанков
        function buildMapGfxChunk(map, x0, y0) {
            const g = new PIXI.Graphics();
            const W = map.w, H = map.h, CH = globalThis.GAME_WORLDTILES.CHUNK;
            const plank = 2; // доска моста (заглушка)
            const edge = 4; // кант моста, ~TS/8 (заглушка)
            const plankGap = (TS - 2 * edge - plank) / 3;
            const xe = Math.min(W, x0 + CH), ye = Math.min(H, y0 + CH);
            for (let j = y0; j < ye; j++) for (let i = x0; i < xe; i++) {
                if (map.ter[j * W + i] !== T.BRIDGE) continue;
                const x = i * TS, y = j * TS;
                g.rect(x, y, TS, edge); g.fill(0x6e5233);
                g.rect(x, y + TS - edge, TS, edge); g.fill(0x6e5233);
                for (let b = 0; b < 4; b++) {
                    g.rect(x + 3, y + edge + b * plankGap, TS - 6, plank);
                    g.fill(0x7c5c36);
                }
            }
            return g;
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
            // footprint 5×3 = 160×96px (просил юзер), центр — середина
            // footprint (у якоря-площади нижняя средняя клетка)
            const s = GEN.KIND_SIZE.town;
            const p = { x: (poi.gx + 0.5) * TS,
                y: (poi.gy - (s.h - 1) + s.h / 2) * TS };
            const sh = new PIXI.Graphics();
            sh.ellipse(0, 44, 78, 14); sh.fill({ color: 0x0d130a, alpha: 0.5 });
            c.addChild(sh);
            const b = new PIXI.Graphics(); // большой дом + пристройка
            b.rect(-76, -10, 104, 54); b.fill(0x8f846d);
            b.poly([-82, -10, -24, -46, 34, -10]); b.fill(ROOF[poi.elem]);
            b.rect(36, 6, 40, 38); b.fill(0x9a8f75); // пристройка
            b.poly([30, 6, 56, -16, 82, 6]); b.fill(ROOF[poi.elem]);
            b.rect(-52, 22, 14, 22); b.fill(0x3a2f22); // двери
            b.rect(48, 24, 12, 20); b.fill(0x3a2f22);
            b.rect(-66, 2, 8, 8); b.rect(-30, 2, 8, 8); b.rect(4, 2, 8, 8);
            b.fill(0x3a2f22); // окна
            c.addChild(b);
            c.addChild(label(poi.name, 16, 0xf3e6c2, -56));
            c.position.set(p.x, p.y);
            c.zIndex = (poi.gy + 1) * TS; // низ footprint
            return c;
        }
        function makeCapital(poi) {
            const c = new PIXI.Container();
            // footprint 5×4 = 160×128px (просил юзер), центр — середина
            // footprint (у якоря-площади центральная клетка)
            const s = GEN.KIND_SIZE.capital;
            const p = { x: (poi.gx + 0.5) * TS,
                y: (poi.gy - (s.h - 1) + s.h / 2) * TS };
            const sh = new PIXI.Graphics();
            sh.ellipse(0, 56, 84, 15); sh.fill({ color: 0x0d130a, alpha: 0.55 });
            c.addChild(sh);
            const b = new PIXI.Graphics(); // цитадель: стены, зубцы, башня
            b.rect(-80, -10, 160, 66); b.fill(0x9a8f75);
            for (let t = 0; t < 8; t++) b.rect(-80 + t * 21, -20, 15, 11);
            b.fill(0x8a8066);
            b.rect(-14, -64, 28, 90); b.fill(0x9a8f75); // башня
            b.poly([-22, -64, 0, -98, 22, -64]); b.fill(ROOF[poi.elem]);
            b.rect(-13, 30, 26, 26); b.fill(0x3a2f22); // ворота
            b.rect(-52, 4, 9, 9); b.rect(43, 4, 9, 9); b.fill(0x3a2f22);
            c.addChild(b);
            // флаг стихии над башней — логотип из интерфейса
            const logo = new PIXI.Sprite(
                uiTex(globalThis.GAME_DATA.ELEM_LOGO[poi.elem]));
            logo.anchor.set(0.5, 1);
            logo.scale.set(0.55);
            logo.position.set(0, -102);
            logo.eventMode = "none";
            c.addChild(logo);
            c.addChild(label(poi.name, 20, 0xf0c96a, -104));
            c.position.set(p.x, p.y);
            c.zIndex = (poi.gy + 1) * TS; // низ footprint
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
            const sheet = ctx.heroSheets[s.elem] || ctx.heroSheets.strength;
            const sprite = new PIXI.AnimatedSprite(sheet.animations.walk_front, false);
            sprite.anchor.set(0.5, 1);
            sprite.scale.set(0.375); // как герой (96×96)
            const shadow = new PIXI.Graphics();
            shadow.ellipse(0, 0, 15, 7);
            shadow.fill({ color: 0x0e140c, alpha: 0.45 });
            return { sprite, shadow, sheet };
        }

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
            G.activeEnemy = { x: s.st.x, y: s.st.y, enc: s.enc,
                deck: D.enemyDeck(s.enc, 1), alive: true, boss: false,
                wander: s.key };
            if (ctx.sfx) ctx.sfx();
            scenes.go("arena");
        }

        function floatText(text, x, y, fill) {
            const t = new PIXI.Text({
                text, style: { fontFamily: "Kereru", fontSize: 22, fill,
                    stroke: { color: 0x1c1207, width: 5 } },
            });
            t.anchor.set(0.5);
            t.position.set(x, y - 40);
            t.zIndex = y + 10;
            objLayer.addChild(t);
            floaties.push({ node: t, t: 0 });
        }

        // ── Подсказка на бродячем отряде (просил юзер): КАРТА ПЕРСОНАЖА
        // героя отряда + инфо-окно с составом колоды — как тутип врага в
        // подземелье (dungeon.js showTip). Панель живёт в ui-слое и каждый
        // кадр следует за отрядом; показывается pointermove по клик-зоне
        // карты, отряды НЕ интерактивны (не съедают клики движения)
        function squadDeckSummary(encId) {
            const enc = globalThis.GAME_DATA.ENCOUNTERS[encId]
                || globalThis.GAME_DATA.ENCOUNTERS.gob;
            const counts = new Map();
            for (const id of enc.core) counts.set(id, (counts.get(id) || 0) + 1);
            return [...counts.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([id, n]) => `${n}× ${GAME_LOC.t("card." + id + ".name")}`)
                .join(", ");
        }
        function hideSquadTip() {
            if (!tip) return;
            tip.node.destroy({ children: true });
            tip = null;
        }
        function showSquadTip(s) {
            if (tip && tip.squad === s) return;
            hideSquadTip();
            const D = globalThis.GAME_DATA;
            const enc = D.ENCOUNTERS[s.enc] || D.ENCOUNTERS.gob;
            const hd = D.HEROES[enc.hero] || D.HEROES.gob;
            const node = new PIXI.Container();
            node.eventMode = "none";
            // карта персонажа героя отряда (слева, 115×169)
            const heroCard = new PIXI.Sprite(uiTex(`heroes/${hd.img}.png`));
            heroCard.anchor.set(0, 0);
            heroCard.scale.set(0.5);
            heroCard.position.set(0, 0);
            node.addChild(heroCard);
            // инфо-панель (справа): имя, HP базы, колода — как в данже
            const title = new PIXI.Text({
                text: GAME_LOC.t("enc." + s.enc + ".title"),
                style: { fontFamily: "Kereru", fontSize: 24, fill: 0xffe9b0 },
            });
            const hpLine = new PIXI.Text({
                text: GAME_LOC.t("dungeon.tipBase", { n: enc.baseHp }),
                style: { fontFamily: "Kereru", fontSize: 18, fill: 0xff9c8c },
            });
            const deck = new PIXI.Text({
                text: GAME_LOC.t("dungeon.tipDeck") + ": "
                    + squadDeckSummary(s.enc),
                style: { fontFamily: "Kereru", fontSize: 18, fill: 0xd8c79d,
                    wordWrap: true, wordWrapWidth: 336, breakWords: true },
            });
            const w = 372, pad = 15;
            const h = Math.max(heroCard.height,
                pad + title.height + 4 + hpLine.height + 6 + deck.height + pad);
            const g = new PIXI.Graphics();
            g.roundRect(heroCard.width, 0, w, h, 12);
            g.fill({ color: 0x171310, alpha: 0.94 });
            g.stroke({ width: 3, color: 0x6b5c40 });
            title.position.set(heroCard.width + pad, pad);
            hpLine.position.set(heroCard.width + pad, pad + title.height + 4);
            deck.position.set(heroCard.width + pad,
                pad + title.height + 8 + hpLine.height);
            node.addChild(g, title, hpLine, deck);
            ctx.ui.addChild(node);
            tip = { squad: s, node, h: h + 16 };
        }
        // панель следует за отрядом (камера едет) — экранные координаты
        // через мировую матрицу layer + фит ui-канваса
        function placeSquadTip() {
            if (!tip || !layer) return;
            const s = tip.squad;
            const g = layer.toGlobal({ x: s.st.x, y: s.st.y });
            const p = ctx.ui.toLocal(g);
            const wAll = 115 + 372;
            tip.node.position.set(
                Math.max(8, Math.min(1920 - wAll - 8, p.x - wAll / 2)),
                Math.max(8, p.y - 30 - tip.h));
        }
        function hoverSquads(p) {
            let best = null, bd = 1e9;
            for (const s of squads) {
                const d = Math.hypot(s.st.x - p.x, s.st.y - p.y);
                if (d < 30 && d < bd) { best = s; bd = d; }
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
            return c;
        }

        function buildHud() {
            const c = new PIXI.Container();
            // «хром» HUD без фонов panel_label (просил юзер): невидимая
            // зона за золотом/квестом ловит клики — герой не идёт в угол
            const chrome = new PIXI.Container();
            chrome.eventMode = "static";
            chrome.hitArea = new PIXI.Rectangle(8, -6, 200, 76);
            c.addChild(chrome);
            const hudStyle = { fontFamily: "Kereru", fontSize: 27, fill: 0xf3e6c2,
                stroke: { color: 0x1c1207, width: 4 } };
            const titleT = new PIXI.Text({ text: GAME_LOC.t("world.title"), style: hudStyle });
            titleT.anchor.set(0.5, 0);
            titleT.position.set(960, 12); // по середине экрана (просил юзер)
            c.addChild(titleT);
            // золото — около верхнего левого угла (просил юзер), без плашки
            const goldPlate = new PIXI.Container();
            goldPlate.position.set(18, 14);
            const gicon = new PIXI.Sprite(uiTex("icon_gold.png"));
            gicon.anchor.set(0.5);
            gicon.scale.set(0.46);
            gicon.position.set(17, 17);
            goldPlate.addChild(gicon);
            const goldT = new PIXI.Text({ text: "0", style: hudStyle });
            goldT.position.set(38, 3);
            goldPlate.addChild(goldT);
            // активный квест сюжетной линии (просил юзер): иконка правее
            // числа золота открывает текст задания; без квестов иконки нет
            if (G.quests && G.quests.active) {
                goldPlate.addChild(hudIcon("icon_rune.png", 126, 17, () => {
                    globalThis.GAME_QUESTS.showReview(ctx);
                }, 0.75));
            }
            c.addChild(goldPlate);
            // настройки доступны и из мира; «Назад» вернёт сюда. Колода —
            // только по карте героя (просил юзер): карта под иконкой золота
            const settingsBtn = hudIcon("icon_setting.png", 1839, 66, () => {
                G.uiReturn = "world";
                scenes.go("settings");
            });
            c.addChild(settingsBtn);
            // карточка героя (просил юзер): под иконкой золота, клик —
            // в колоду, наведение — рост до натурального размера (ctx.heroHover)
            const wHero = globalThis.GAME_DATA.HEROES[G.heroId]
                || globalThis.GAME_DATA.HEROES.gorbag;
            const heroHolder = new PIXI.Container();
            heroHolder.position.set(58, 76);
            heroHolder.hitArea = new PIXI.Rectangle(-57.5, 0, 115, 169); // 115×169
            const heroCard = new PIXI.Sprite(uiTex(`heroes/${wHero.img}.png`));
            heroCard.anchor.set(0.5, 0);
            heroCard.scale.set(0.5); // 230×338 → 115×169
            heroCard.eventMode = "none";
            heroHolder.addChild(heroCard);
            heroHolder.on("pointertap", () => {
                if (ctx.sfx) ctx.sfx();
                G.uiReturn = "world";
                scenes.go("deck");
            });
            ctx.heroHover(heroHolder, heroCard, 115, 0); // большой вид целиком на экране
            c.addChild(heroHolder);
            const hint = new PIXI.Text({
                text: GAME_LOC.t("world.hint"),
                style: { fontFamily: "Kereru", fontSize: 22, fill: 0xbfae87 },
            });
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 1050);
            c.addChild(hint);
            const mini = buildMinimap();
            c.addChild(mini.box);
            // краевые элементы HUD — ссылки для ежекадрового прижатия
            // к краям ОКНА по горизонтали (просил юзер: при переходе
            // из полноэкранного в оконный letterbox-полосы канваса
            // отодвигали золото/карточку героя и настройки от краёв)
            c.userData = { goldT, mini, goldPlate, heroHolder, settingsBtn };
            return c;
        }

        // ── мини-карта всего мира (просил юзер): правый нижний угол, ──────
        // 1px на клетку (384×256 — вдвое меньше прежней, просил юзер).
        // Статична: рельеф/дороги/POI рисуются один раз при входе; поверх —
        // живой пульсирующий маркер героя (update). Клики по ней
        // поглощаются — герой не бегает в угол.
        // Угол привязан к КРАЮ ОКНА, а не UI-канваса 1920×1080: при окне
        // шире 16:9 letterbox-полосы справа сдвигали угол UI к центру
        // (баг, просил юзер пофиксить) — позиция пересчитывается каждый
        // кадр (fit) от реального размера экрана
        function buildMinimap() {
            const map = G.world.map;
            const MS = 1, MW = map.w * MS, MH = map.h * MS;
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
                const s = poi.kind === "capital" ? 6 : poi.kind === "town" ? 4 : 4;
                p.rect(poi.gx * MS - s / 2 + MS / 2, poi.gy * MS - s / 2 + MS / 2, s, s);
                p.fill(poi.kind === "dungeon" ? 0xffe9b0
                    : poi.kind === "capital" ? 0xffd76a : ROOF[poi.elem]);
            }
            box.addChild(p);
            // маркер героя — белый пульсирующий кружок
            const dot = new PIXI.Graphics();
            dot.circle(0, 0, 3.5);
            dot.fill({ color: 0xffffff });
            dot.stroke({ width: 1.5, color: 0x1c1207 });
            box.addChild(dot);
            return { box, dot, MW, MH, fit };
        }

        // Вход в подземелье: продолжить текущий этаж ЭТОГО данжа (состояния
        // этажей хранит G.dungeonStates) или начать его первый. Подземелья
        // требуют растущую колоду (просил юзер): вход — 16 карт, каждый
        // следующий этаж +1 (dataCards.caveDeckFor); с меньшей колодой
        // вход закрыт — всплывает предупреждение. Открытый мир живёт по
        // минимуму 12 (стартовые колоды) — добор фармят отрядами
        function enterCave(cave) {
            const D = globalThis.GAME_DATA;
            const caveId = D.CAVES[cave] ? cave : "gob";
            if (!D.CAVES[caveId]) return false; // на всякий
            const floor = G.run.cave === caveId
                ? (G.run.floors || (G.run.floors = {}))[caveId] || 1 : 1;
            const need = D.caveDeckFor(floor);
            if (G.deck.length < need) return false; // мало карт — вход закрыт
            if (heroId !== null) {
                G.world.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
            }
            // уходим в ДРУГОЙ данж — текущий этаж архивируется, чтобы
            // прогресс (враги/объекты/позиция) не потерялся
            if (G.dungeon && G.dungeon.v === globalThis.GAME_DUNGEON.MAP_V
                && G.dungeon.cave !== caveId) {
                G.dungeonStates[(G.dungeon.cave || "gob") + ":" + G.dungeon.floor] = G.dungeon;
            }
            if (G.run.cave !== caveId) {
                G.run.cave = caveId;
                G.run.floor = (G.run.floors || (G.run.floors = {}))[caveId] || 1;
            }
            // архив этажей другой геометрии (v≠MAP_V) не поднимается —
            // stateFor отдаст свежий этаж текущей сетки
            const st = globalThis.GAME_DUNGEON.stateFor(G.dungeonStates, caveId, G.run.floor);
            st.cave = caveId;
            if (st.spawn) st.heroPos = { ...st.spawn }; // прибытие к лестнице
            st.exitCool = false;
            // лестница наверх (выход) 2с не работает после входа: герой
            // прибывает к ней вплотную, и первый же клик выкидывал в мир
            // (просил юзер)
            st.ladderCool = performance.now() + 2000;
            G.dungeon = st;
            if (ctx.sfx) ctx.sfx();
            scenes.go("dungeon");
            return true;
        }

        return {
            enter() {
                if (ctx.music) ctx.music("menu"); // трек мира (пока общий с меню)
                const map = ensureMap();
                ensureWander(); // жив/мёртв и позиции отрядов (создать/дописать)
                ctx.collide.rows = map.rows; // коллизии героя — по карте мира
                ctx.collide.ts = TS; // после подземелья (клетка 64) — шаг мира
                // точка появления: вышедший из подземелья герой стоит
                // у входа ТОГО данжа; новая игра — клетка у случайного
                // ГОРОДА (не столицы, просил юзер), общая для всех стихий
                const spawnPx = px(map.spawn[G.elem] || map.spawn.strength);
                let hp = G.world.heroPos ? { ...G.world.heroPos } : null;
                if (G.world.out) {
                    const at = cavePoi(G.world.outCave) || cavePoi("gob");
                    hp = freeCellNear(px(at).x, px(at).y);
                    G.world.out = false;
                } else if (!hp) hp = spawnPx;
                else if (!walkable(Math.floor(hp.x / TS), Math.floor(hp.y / TS)))
                    hp = spawnPx; // позиция с чужой/старой карты — к спавну
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
                    const next = bfsPath(Math.floor(hx / TS), Math.floor(hy / TS),
                        Math.floor(p.x / TS), Math.floor(p.y / TS));
                    if (next) path = next;
                });
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
                poiNodes = [];
                for (const poi of map.pois) {
                    const node = poi.kind === "capital" ? makeCapital(poi)
                        : poi.kind === "town" ? makeTown(poi) : makeCave(poi);
                    poiNodes.push({ node, x: node.x, y: node.y });
                    objLayer.addChild(node);
                }
                // бродячие отряды (просил юзер): охрана данжей + охранники
                // мостов — персонажи мира на спрайтшитах своих стихий;
                // позиция берётся из состояния забега (переживает выход
                // в данж и перезаход), маршруты — из карты
                squads = [];
                const spawnSquads = (defs, kind) => {
                    for (let i = 0; i < defs.length; i++) {
                        const d = defs[i];
                        const key = kind === "bridge" ? "bridge:" + i
                            : "cave:" + d.cave + ":" + i;
                        const st = G.world.wander[key];
                        if (!st || !st.alive) continue;
                        const s = {
                            kind, key, d, st, wp: 0, path: null, aggro: false,
                            repath: 0, id: null,
                            enc: kind === "bridge" ? guardEncOf(d.elem)
                                : wanderEnc(d, i),
                        };
                        if (!s.enc) continue; // данж/стихия ещё без отрядов
                        s.elem = globalThis.GAME_DATA.ENCOUNTERS[s.enc].elem;
                        const made = makeSquadNode(s);
                        s.sprite = made.sprite;
                        s.shadow = made.shadow;
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
                    speed: HERO_SPEED, fps: ctx.heroSheet.fps, halfW: 7, halfH: 5,
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
                // квест-диалоги: анонс нового задания / окно незабранной
                // награды (открываются поверх мира, герой стоит)
                globalThis.GAME_QUESTS.onSceneEnter(ctx);
            },
            exit() {
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
                poiNodes = null;
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
                heroShadow = null;
                heroSprite = null;
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
                // чанки экрана + запас (пересобираются только при выходе
                // камеры за набор) и видимость POI (просил юзер: рисуется
                // только экран плюс запас, остальное — когда доедет)
                updateChunks();
                updatePoiVisibility();
                heroShadow.position.set(hx, hy - 0.7 * 7 * 2);
                heroShadow.zIndex = hy - 0.5;
                if (heroSprite) heroSprite.zIndex = hy;
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
                    ud.goldPlate.position.set(lt.x + 18, 14);
                    ud.heroHolder.position.set(lt.x + 58, 76);
                    ud.settingsBtn.position.set(rt.x - 81, 66);
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
                    * Math.max(0.25, ((G.settings && G.settings.animSpeed) ?? 5) / 5);

                // Эскейп закрывает квест-диалог его кнопкой (просил юзер —
                // дублирование кнопок «выход» меню на клавишу)
                if (ctx.input.wasPressed("Escape") && (ctx.questModal || 0) > 0)
                    globalThis.GAME_QUESTS.tap();

                // квест-диалог открыт (модальный) — герой стоит и не входит
                // в пещеры, пока окно не закрыто
                if (ctx.questModal) {
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
                        const dHero = Math.hypot(hx - sx, hy - sy);
                        // касание отряда — бой (как соприкосновение
                        // с противником в самом подземелье)
                        if (dHero < TS * 0.85) { fightSquad(s); return; }
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
                        // сорвать погоню — герой ушёл или отряд дошёл до края
                        const hgx = Math.floor(hx / TS), hgy = Math.floor(hy / TS);
                        const sgx = Math.floor(sx / TS), sgy = Math.floor(sy / TS);
                        if (!s.aggro && dHero < WAND_AGGRO && dRoute < WAND_LEASH
                            && bfsPath(sgx, sgy, hgx, hgy)) s.aggro = true;
                        else if (s.aggro && (dHero > WAND_AGGRO * 1.4
                            || dRoute > WAND_LEASH)) s.aggro = false;
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

                // арки подземелий — касание (диалог открыт — молчат).
                // Вход закрыт малой колодой или данж ещё впереди —
                // всплывает предупреждение (кулдаун 2.5с — без спама)
                if (!ctx.questModal && layer)
                for (const p of G.world.map.pois) {
                    if (p.kind !== "dungeon") continue;
                    const c = px(p);
                    if (Math.hypot(c.x - hx, c.y - hy) < TS * 0.85) {
                        const deniedAt = p.denyAt || p.soonAt;
                        if (globalThis.GAME_DATA.CAVES[p.cave]
                            ? !enterCave(p.cave)
                            : true) {
                            if (!deniedAt || performance.now() - deniedAt > 2500) {
                                p.denyAt = p.soonAt = performance.now();
                                soonCount++;
                                if (ctx.sfx) ctx.sfx();
                                floatText(GAME_LOC.t(
                                    globalThis.GAME_DATA.CAVES[p.cave]
                                        ? "world.deckLow" : "world.soon",
                                    { min: globalThis.GAME_DATA.caveDeckFor(
                                        G.run.cave === p.cave
                                            ? (G.run.floors || (G.run.floors = {}))[p.cave] || 1
                                            : 1) }),
                                    c.x, c.y, 0xd8c79d);
                            }
                        }
                        return;
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
                    };
                },
                // слой местности (тайлы images/tiles): коды клеток 0..7
                // (земля/трава/снег/песок/тлен/вода/болото), статистика
                // рендера, лесной оверлей wood.png, болота swamp.png и
                // дороги roads.png (тайлы по маскам)
                terrain: () => ({
                    v: globalThis.GAME_WORLDTILES.V,
                    terr: worldTerr ? Array.from(worldTerr) : null,
                    stats: terrStats,
                    forest: woodStats ? { ...woodStats } : null,
                    swamp: swampStats ? { ...swampStats } : null,
                    roads: roadStats ? { ...roadStats } : null,
                }),
                setHeroPos(x, y) {
                    if (heroId === null) return false;
                    COMPONENTS.positionX[heroId] = x;
                    COMPONENTS.positionY[heroId] = y;
                    path = null; // телепорт гасит маршрут клика
                    return true;
                },
                enterCave: (cave) => enterCave(cave),
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
                                route: d.route,
                                active: !!globalThis.GAME_DATA.CAVES[d.cave],
                                face: s && s.id !== null
                                    ? characters.facingName(s.id) : null,
                                walking: !!(s && s.id !== null
                                    && COMPONENTS.ctrlMove[s.id]),
                            };
                        }).filter(Boolean),
                }),
                // ── охранники мостов (тесты): список + живые позиции ─────
                bridges: () => ({
                    list: ((G.world.map && G.world.map.bridgeGuards) || [])
                        .map((d, j) => {
                            const key = "bridge:" + j;
                            const st = G.world.wander && G.world.wander[key];
                            if (!st) return null;
                            const s = squads.find((x) => x.key === key);
                            return {
                                j, key, elem: d.elem, alive: st.alive,
                                enc: guardEncOf(d.elem),
                                x: s && s.id !== null ? COMPONENTS.positionX[s.id] : st.x,
                                y: s && s.id !== null ? COMPONENTS.positionY[s.id] : st.y,
                                route: d.route,
                                // персонаж мира: взгляд и «идёт» (контроллер)
                                face: s && s.id !== null
                                    ? characters.facingName(s.id) : null,
                                walking: !!(s && s.id !== null
                                    && COMPONENTS.ctrlMove[s.id]),
                            };
                        }).filter(Boolean),
                }),
                // подсказка на отряде: состояние панели (как в подземелье)
                hoverAt(x, y) {
                    hoverSquads({ x, y });
                    return tip ? { enc: tip.squad.enc } : null;
                },
                tipState: () => (tip ? {
                    enc: tip.squad.enc,
                    title: GAME_LOC.t("enc." + tip.squad.enc + ".title"),
                    deck: squadDeckSummary(tip.squad.enc),
                    heroImg: (globalThis.GAME_DATA.ENCOUNTERS[tip.squad.enc]
                        || {}).hero || null,
                } : null),
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
                        goldX: ud.goldPlate.x, heroX: ud.heroHolder.x,
                        settingsX: ud.settingsBtn.x,
                    };
                },
                path: () => path,
                worldToScreen: (x, y) => (layer ? layer.toGlobal({ x, y }) : null),
            },
        };
    }

    globalThis.GAME_WORLD = { createWorldScene };
})();
