// ГОРОД — построение города (W47, юзер: вынесено из dungeon.js, чтобы
// логика города жила в своём файле и не мешала логике подземелья).
// Здесь только ГОРОД: планировка кварталов/зданий/стихийных фич
// (newCityState, W30–W38), декорации (деревья/горы), наземные оверлеи
// (болота/чаща/мосты) и окна двух городских зданий — кузницы и ратуши.
// Общий движок тайлов, стены, движение и объекты этажей остались в
// dungeon.js: город показывается той же сценой «подземелья» как её
// «этаж» (st.city), dungeon.js рендерит его общим кодом и передаёт
// городскому коду состояние и связи со сценой (env-объекты).
// Порядок подключения: city.js ДО dungeon.js (dungeon.js читает GAME_CITY).
(function () {
    const TS = 64; // клетка города — те же тайлы данжа (64px)

    // ГОРОД (W30, юзер): поверхность пола — местность зоны стихии
    // (листы вариантов заливки worldTiles 4×4 по 32px), стены — набор
    // тайлов данжа той же стихии
    const CITY_VARIANTS = { strength: "dirt", growth: "grass",
        wisdom: "magic", decay: "waste", honor: "sand", time: "snow" };

    // ── ГОРОД (W34, юзер): этаж данжа, КОМНАТЫ УКРУПНЕНЫ до КВАРТАЛОВ ────
    // Та же генерация, что у этажа (стены тайлами данжа, комнаты,
    // коридоры-проходы) — юзер: «стенки хорошо смотрелись», «просто
    // увеличьте пространство комнат до кварталов». W36 (юзер): города
    // вышли слишком громоздкими — здания и кварталы уменьшены ВДВОЕ
    // (карты 24×19 / 20×16 вместо 48×38 / 40×30; здания ратуша 3×3,
    // магазин/кузница/дом Глома 3×2, спрайты рисуются в полразмера).
    // Пятно "%" непроходимо, вход — клетка-дверь снизу. Пол —
    // ЕДИНЫЙ лист поверхности зоны (без подсыпок). Обычный город —
    // 5 районов (центр с ратушей + 4 квартала); столица (стартовый
    // город героя) — 8 районов, только в ней дом Глома и сам Глом.
    // Коридоры идут по низам комнат и сквозь стен-полосы; колонны
    // вертикалей (в столице 4 и 19, в городе 3 и 16) выбраны мимо
    // пятен застройки — коридор не прорезает здания. W37 (юзер):
    // выход из города — в ОТДЕЛЬНОМ квартале без зданий (в столице —
    // южном, в городе — юго-восточном), у городской стены: сквозные
    // маршруты (арка по низу квартала, вертикальный коридор) проходят
    // мимо — случайного выхода из города нет. W52 (юзер): выход — не
    // табличка-«лестница», а ПРОХОД ВНИЗ В СТЕНЕ (3 клетки пола в
    // нижнем ряду); выходишь, только заойдя в клетки прохода.
    // W38 (юзер): ОСОБЕННОСТИ ГОРОДОВ ПО СТИХИИ — города чуть разреженнее,
    // но архитектура интереснее: Сила — отдельные деревья (10.png) внутри
    // и между кварталами (декор, проходимы — как леса мира); Рост — лесные
    // зоны-рощи («F» НЕпроходимы: полог чащи wood + деревья, как массивы
    // мира); Мудрость — река «~» с мостами «=» и набережными (река режет
    // стеновую полосу между колонками кварталов, мосты встают на
    // пересечениях коридоров); Тлен — болотные зоны (проходимый оверлей
    // swamp.png поверх пустоши); Честь — горные массивы («M» непроходимы,
    // спрайты montain); Время — запутанные проходы: пальцы стен внутри
    // кварталов. Связность (двери/ворота/все клетки пола) проверяет
    // check_city по всем стихиям.
    const CITY_V = 7; // версия планировки города: старые cityStates пересобираются
    // (W52 — выход-проход в нижней стене вместо таблички-«лестницы»)

    function newCityState(elem, capital) {
        // city-состояние живёт в том же слоте G.dungeon, что и этажи:
        // v — версия архива этажей, читаем её у GAME_DUNGEON в рантайме
        const MAP_V = globalThis.GAME_DUNGEON.MAP_V;
        const D = globalThis.GAME_DATA;
        const caveId = Object.keys(D.CAVES).find(
            (k) => D.CAVES[k].elem === elem) || "gob";
        const CW = capital ? 24 : 20, CH = capital ? 19 : 16;
        const g = Array.from({ length: CH }, () => Array(CW).fill("#"));
        const carve = (x0, y0, x1, y1) => {
            for (let y = y0; y <= y1; y++)
                for (let x = x0; x <= x1; x++) g[y][x] = ".";
        };
        // комнаты-кварталы: [x0, y0, x1, y1] — всё между ними стены
        // (толща не рисуется, кромки — тайлами данжа, как в подземелье)
        const rooms = capital ? [
            [9, 7, 14, 12],   // центральная (ратуша)
            [1, 1, 7, 5],     // северо-западная (магазин)
            [16, 1, 22, 5],   // северо-восточная
            [1, 7, 7, 12],    // западная (кузница)
            [16, 7, 22, 12],  // восточная (дом Глома)
            [1, 14, 7, 17],   // юго-западная
            [9, 14, 14, 17],  // южная (ворота — проход-выход, W37/W52)
            [16, 14, 22, 17], // юго-восточная
        ] : [
            [7, 6, 12, 10],   // центральная (ратуша)
            [1, 1, 5, 4],     // северо-западная (магазин)
            [14, 1, 18, 4],   // северо-восточная (кузница)
            [1, 12, 5, 14],   // юго-западная
            [14, 12, 18, 14], // юго-восточная (ворота — проход-выход, W37/W52)
        ];
        for (const [x0, y0, x1, y1] of rooms) carve(x0, y0, x1, y1);
        // здания: прижаты к верху своей комнаты, фасад и дверь — вниз
        const blds = [];
        const put = (x0, y0, w, h, type, file) => {
            for (let j = y0; j < y0 + h; j++)
                for (let i = x0; i < x0 + w; i++) g[j][i] = "%";
            const door = [x0 + (w >> 1) - 1, y0 + h]; // клетка-дверь снизу
            blds.push({ type, build: file, gx: x0, gy: y0, w, h,
                col: door[0], row: door[1] });
        };
        if (capital) {
            put(10, 8, 3, 3, "townHall", "town_hall.png");
            put(2, 2, 3, 2, "shop", "shop.png");      // северо-западная
            put(1, 8, 3, 2, "armory", "armory.png");  // западная
            put(20, 8, 3, 2, "glomHouse", "glom_house.png"); // восточная
        } else {
            put(8, 6, 3, 3, "townHall", "town_hall.png");
            put(2, 2, 3, 2, "shop", "shop.png");      // северо-западная
            put(15, 2, 3, 2, "armory", "armory.png"); // северо-восточная
        }
        // коридоры-проходы: от низа центральной комнаты к низам остальных
        // кварталов + дуги по периметру (L-форма, как в генераторе данжей —
        // прорезают стены, соединяют все комнаты; здания прижаты к верхам
        // комнат, коридоры идут по низам — пятна не задевают)
        const corridor = (a, b) => {
            const [ax, ay] = a, [bx, by] = b;
            const sx0 = Math.min(ax, bx), sx1 = Math.max(ax, bx);
            for (let x = sx0; x <= sx1; x++) g[ay][x] = ".";
            const sy0 = Math.min(ay, by), sy1 = Math.max(ay, by);
            for (let y = sy0; y <= sy1; y++) g[y][bx] = ".";
        };
        const lows = rooms.map(([x0, y0, x1, y1]) =>
            [x0 + ((x1 - x0) >> 1), y1]); // центр НИЗА комнаты (пол)
        const hub = lows[0]; // низ центральной комнаты — развязка
        for (let i = 1; i < lows.length; i++) corridor(hub, lows[i]);
        if (capital) {
            corridor(lows[1], lows[2]); // дуга по северу
            corridor(lows[5], lows[6]); // дуги по югу
            corridor(lows[6], lows[7]);
        } else {
            corridor(lows[1], lows[2]);
            corridor(lows[3], lows[4]);
        }
        // ── W38: особенности по стихии (юзер). Рощи/горы пишутся СИМВОЛАМИ
        // в карту («F»/«M» — непроходимы, как пятна застройки), река Мудрости
        // — «~» вода / «=» мост, болота Тлена и деревья — только оверлеи
        // рендера (пол не меняют). Прямоугольники фич — с периметром-обходом:
        // коридорные строки (низы комнат) и вертикали коридоров не перерезаются
        const feat = { trees: 0, forest: [], swamp: [], mounts: [],
            maze: [], water: [], bridges: [] };
        const fillRect = (rects, ch) => {
            for (const [x0, y0, x1, y1] of rects)
                for (let y = y0; y <= y1; y++)
                    for (let x = x0; x <= x1; x++)
                        if (g[y][x] === ".") g[y][x] = ch;
        };
        if (elem === "strength") feat.trees = 1; // деревья ниже — рендером
        else if (elem === "growth") {
            feat.forest = capital
                ? [[17, 2, 21, 4], [17, 15, 18, 16]] // северо-восток + юго-восток
                : [[2, 12, 4, 13]];                 // юго-запад
            fillRect(feat.forest, "F");
        } else if (elem === "wisdom") {
            // река по стеновой полосе между колонками кварталов (столица —
            // между центральной/южной и восточными, город — между западом
            // и центром): коридорная клетка → мост, стена → вода; вдоль —
            // набережные (пол вместо толщи, берега реки из комнат).
            // У воротного квартала набережные НЕ прорезаются (чебышёв ≤ 3
            // до ворот): подход к проходу-выходу остаётся чистой улицей —
            // W37-инвариант (проверяет check_city)
            const rx = capital ? 15 : 6;
            const gate = capital ? [13, 15] : [18, 12];
            for (let y = 1; y < CH - 1; y++) {
                if (g[y][rx] === ".") { g[y][rx] = "="; feat.bridges.push([rx, y]); }
                else { g[y][rx] = "~"; feat.water.push([rx, y]); }
                for (const bx of [rx - 1, rx + 1]) {
                    if (g[y][bx] !== "#") continue;
                    if (Math.max(Math.abs(bx - gate[0]), Math.abs(y - gate[1])) <= 3)
                        continue;
                    g[y][bx] = ".";
                }
            }
        } else if (elem === "decay") {
            // болота проходимы: оверлей swamp.png поверх пола (рендер)
            feat.swamp = capital
                ? [[17, 2, 21, 4], [2, 15, 6, 16], [17, 15, 21, 16]]
                : [[2, 13, 4, 14], [10, 9, 12, 10]];
        } else if (elem === "honor") {
            // массивы НЕ перерезают вертикали коридоров (в столице это
            // x=4 и x=19) и не оставляют отрезанных карманов у зданий
            feat.mounts = capital
                ? [[17, 2, 21, 3], [2, 15, 3, 16], [5, 15, 6, 16],
                   [17, 15, 18, 16], [20, 15, 21, 16]]
                : [[2, 13, 4, 13], [15, 1, 17, 1], [12, 9, 12, 9]];
            fillRect(feat.mounts, "M");
        } else if (elem === "time") {
            // пальцы стен внутри кварталов (воротный квартал чист — W37):
            // прижаты к стенам, чебышёв ≥ 2 от зданий (не «прилипают»),
            // коридорные строки/вертикали не перерезают, карманов не
            // оставляют (полная связность — check_city)
            feat.maze = capital ? [
                [14, 7], [14, 8], [14, 9], [14, 10],        // центральная
                [7, 2], [7, 3],                             // северо-западная
                [16, 2], [16, 3], [22, 2], [22, 3], [19, 2], // северо-восточная
                [7, 8], [7, 9], [6, 10], [7, 10],           // западная
                [16, 8], [16, 9],                           // восточная
                [1, 15], [1, 16], [7, 15], [7, 16],         // юго-западная
                [16, 15], [16, 16], [22, 15], [22, 16],     // юго-восточная
            ] : [
                [12, 7], [12, 8], [12, 9],                  // центральная
                [5, 12], [5, 13], [1, 13],                  // юго-западная
            ];
            for (const [x, y] of feat.maze) g[y][x] = "#";
        }
        const objects = blds.map((b) => {
            const o = { ...b, taken: false };
            if (o.type === "shop") { // торговец картами живёт в магазине
                o.stock = Array.from({ length: 6 }, () => D.rollLootCard(elem));
                o.sold = [false, false, false, false, false, false];
            }
            return o;
        });
        const house = blds.find((b) => b.type === "glomHouse");
        const glomHome = house ? {
            x: (house.col + 1) * TS + TS / 2, // появляется у двери дома
            y: house.row * TS + TS / 2,
        } : null;
        // проход-выход (W52, юзер) вырезается ДО снимка rows ниже:
        // 3 клетки пола в нижнем ряду под воротным кварталом (W37:
        // в столице — южном, в городе — юго-восточном)
        const px2 = capital ? 13 : 16, py2 = CH - 1;
        for (let x = px2 - 1; x <= px2 + 1; x++) g[py2][x] = ".";
        const st = {
            v: MAP_V, cityV: CITY_V, city: true, isCapital: !!capital,
            elem, cave: caveId, floor: 1,
            enemies: [], exit: null, exitCool: false, bossDead: true,
            toast: null, toastT: 0, win: null,
            rows: g.map((r) => r.join("")),
            roomCenters: rooms.map(([x0, y0, x1, y1]) =>
                [x0 + ((x1 - x0) >> 1), y0 + ((y1 - y0) >> 1)]),
            lootCenters: [], objects,
            districts: rooms.length, // районов-комнат: 5 / 8
            roomRects: rooms, // [x0,y0,x1,y1] кварталов — для проб (W37)
            feat, // особенности стихии (W38): trees/forest/swamp/mounts/maze/water/bridges
            glom: house ? {
                state: "hidden", // hidden → walking → talking → idle
                x: glomHome.x, y: glomHome.y,
            } : null,
            glomHome,
        };
        // Ворота (W37, юзер): воротный квартал без зданий — якорь
        // исключений реки (W38) и декора; в столице — южный, в городе —
        // юго-восточный. W52 (юзер): ВЫХОД ИЗ ГОРОДА — не табличка-
        // «лестница», а ПРОХОД ВНИЗ В ГОРОДСКОЙ СТЕНЕ (вырезан выше,
        // до снимка rows), как выходы городов в RPG: герой ЗАХОДИТ
        // в клетки прохода — город покидается. Триггер — сама клетка
        // прохода, радиуса нет: сквозные маршруты (арка по низу
        // квартала, вертикальный коридор) идут мимо и не выходят.
        // Спавн — клетка выше среднего прохода; 2с «остывания»
        // enterCity — первый кадр не выкидывает в мир
        st.exitPassage = { x0: px2 - 1, x1: px2 + 1, y: py2 };
        st.spawn = { x: px2 * TS + TS / 2, y: (py2 - 1) * TS + TS / 2 };
        return st;
    }

    // W38: декорации стихийных фич города на слой y-sort (как стены и
    // здания): деревья Силы — ОТДЕЛЬНЫЕ, спрайт 10.png (юзер), внутри и
    // между кварталами, ПРОХОДИМЫ (клетка остаётся полом — как леса
    // открытого мира, герой ходит за кронами); Рост — деревья рощ «F»
    // (набор стихии из worldGen) + редкий разброс; Честь — горные
    // спрайты на клетках массивов «M». Позиция/зеркало — хэш клетки,
    // как у деревьев мира (worldTiles).
    // env: { ctx, st, MAPROWS, W, H, hsh } — состояние города сцены
    // (dungeon.js ставит MAPROWS/W/H под активную раскладку) и хэш клеток
    function addCityDeco(env, layer) {
        const { ctx, st, MAPROWS, W, H, hsh } = env;
        if (!st || !st.city || !st.feat) return;
        const f = st.feat;
        const GEN = globalThis.GAME_WORLDGEN;
        const trees = ctx.treeTex || [];
        if (!trees.length) return;
        // зона отчуждения РАЗБРОСА (рощи «F» руками расставлены вне её):
        // проход-выход/спавн/двери зданий — чебышёв ≤ 1: деревья не
        // заслоняют выход-проход и входы в дома
        const keep = new Set();
        const keep1 = (x, y) => {
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) keep.add((y + dy) * 1000 + x + dx);
        };
        const pgDeco = st.exitPassage; // клетки прохода и подход к нему
        if (pgDeco) for (let x = pgDeco.x0; x <= pgDeco.x1; x++) keep1(x, pgDeco.y);
        keep1(Math.floor(st.spawn.x / TS), Math.floor(st.spawn.y / TS));
        for (const o of st.objects) keep1(o.col, o.row);
        const strengthSet = [10]; // юзер: деревья города Силы — 10.png
        const groveSet = (GEN && GEN.TREE_SETS && GEN.TREE_SETS.growth) || [10];
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const ch = MAPROWS[j][i];
            if (ch !== "." && ch !== "F") continue;
            const grove = ch === "F";
            const scatter = (f.trees && hsh(i, j, 11) < 130) // ~13% пола
                || (st.elem === "growth" && hsh(i, j, 11) < 70); // ~7%
            if (!grove && !scatter) continue;
            if (!grove && keep.has(j * 1000 + i)) continue;
            const pool = st.elem === "strength" ? strengthSet : groveSet;
            const tex = trees[pool[hsh(i, j, 12) % pool.length] - 1];
            if (!tex) continue;
            const sp = new PIXI.Sprite(tex);
            sp.anchor.set(0.5, 1); // низ ствола на кромке клетки
            sp.scale.x = hsh(i, j, 13) < 500 ? -1 : 1;
            sp.position.set(
                (i + 0.5) * TS + (hsh(i, j, 14) / 1000 - 0.5) * TS * 0.6,
                (j + 1) * TS + 3);
            sp.zIndex = sp.position.y; // y-sort с героем/стенами
            sp.eventMode = "none"; // декорация — клики уходят в пол
            sp.__cityTree = 1; // тест-хук: подсчёт деревьев (как __tree мира)
            layer.addChild(sp);
        }
        const mtns = ctx.mountainTex || [];
        if (st.elem === "honor" && mtns.length) {
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                if (MAPROWS[j][i] !== "M") continue;
                const sp = new PIXI.Sprite(mtns[hsh(i, j, 15) % mtns.length]);
                sp.anchor.set(0.5, 1);
                sp.scale.x = hsh(i, j, 16) < 500 ? -1 : 1;
                sp.position.set(
                    (i + 0.5) * TS + (hsh(i, j, 17) / 1000 - 0.5) * TS * 0.5,
                    (j + 1) * TS + 2);
                sp.zIndex = sp.position.y;
                sp.eventMode = "none";
                sp.__cityMount = 1; // тест-хук: подсчёт скал
                layer.addChild(sp);
            }
        }
    }

    // Наземные оверлеи стихийных фич города (W38): болота Тлена
    // (swamp.png) и полог чащи Роста (wood.png) — те же dual-grid
    // рендеры, что у массивов открытого мира (синтетический ter-слой по
    // state.feat; город ≤ 24×19 — один чанк). Болото проходимо, чаща
    // «F» — нет, но пол/полог под ней рисуются. Мосты «=» — тайлсет
    // moats.png (W51, юзер) поверх воды, как мосты мира. Зовёт
    // dungeon.js из своей отрисовки
    // пола; env: { ctx, st, MAPROWS, W, H }
    function addCityGroundOverlays(env, c) {
        const { ctx, st, MAPROWS, W, H } = env;
        if (!st || !st.city || !st.feat) return;
        const WT = globalThis.GAME_WORLDTILES, GEN = globalThis.GAME_WORLDGEN;
        const mkTer = (val, chNeed, rects) => {
            const ter = new Uint8Array(W * H);
            for (const [x0, y0, x1, y1] of rects)
                for (let y = y0; y <= y1; y++)
                    for (let x = x0; x <= x1; x++)
                        if (MAPROWS[y][x] === chNeed) ter[y * W + x] = val;
            return { w: W, h: H, ter };
        };
        if (st.feat.swamp.length && WT && GEN && ctx.worldSheets.swamp)
            c.addChild(WT.renderSwampChunk(
                mkTer(GEN.T.SWAMP, ".", st.feat.swamp),
                ctx.worldSheets, TS, 0, 0).container);
        if (st.feat.forest.length && WT && GEN && ctx.worldSheets.wood)
            c.addChild(WT.renderForestChunk(
                mkTer(GEN.T.FOREST, "F", st.feat.forest),
                ctx.worldSheets, TS, 0, 0).container);
        // мосты «=»: тайлсет moats.png (W51, юзер) вместо заглушки-
        // настила — вид по маске 4-соседей (таблица ROAD_TILE), через
        // мост продолжаются мосты и пол берега (уступ упирается в
        // набережную). Для города — 64px лист moats_64.png (клетка
        // города 64px, рисование 1:1; 32px лист растягивался вдвое
        // и мылился), фолбэки — 32px лист, затем старый настил-доски.
        // W52 (юзер): прямой мост рисуется НА СЕКЦИЮ БОЛЬШЕ — 2 секции
        // (2 тайла) вокруг центра клетки реки, концы заходят на берега
        // по полсекции — воды между настилом и берегом нет. Доски
        // тайла идут от края до края (сверено по альфе) — стык секций
        // посередине реки бесшовный; повороты/T/крест — один тайл
        const moatTex = (ctx.moatsCityTex && ctx.moatsCityTex.length)
            ? ctx.moatsCityTex : ctx.moatsTex;
        if (WT && moatTex && moatTex.length) {
            const cn = (x, y) => (x >= 0 && y >= 0 && x < W && y < H
                && (MAPROWS[y][x] === "=" || MAPROWS[y][x] === ".")) ? 1 : 0;
            const s32 = moatTex[0].width;
            const moatSc = TS / s32;
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                if (MAPROWS[j][i] !== "=") continue;
                const mask = cn(i, j - 1) | cn(i + 1, j) << 1
                    | cn(i, j + 1) << 2 | cn(i - 1, j) << 3;
                const k = WT.ROAD_TILE[mask];
                if (k === 1 || k === 2) { // прямые: 2 секции через реку
                    const hor = k === 2;
                    for (const off of [-TS / 2, TS / 2]) {
                        const sp2 = new PIXI.Sprite(moatTex[k]);
                        sp2.scale.set(moatSc);
                        if (hor) sp2.position.set(i * TS + off, j * TS);
                        else sp2.position.set(i * TS, j * TS + off);
                        c.addChild(sp2);
                    }
                    continue;
                }
                const spr = new PIXI.Sprite(moatTex[k]);
                spr.position.set(i * TS, j * TS);
                spr.scale.set(moatSc);
                c.addChild(spr);
            }
        } else {
            const g2 = new PIXI.Graphics();
            let planks = 0;
            const edge = 4, plank = 2, gap = (TS - 2 * edge - plank) / 3;
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++)
                if (MAPROWS[j][i] === "=") {
                    const x = i * TS, y = j * TS;
                    g2.rect(x, y, TS, edge); g2.fill(0x6e5233);
                    g2.rect(x, y + TS - edge, TS, edge); g2.fill(0x6e5233);
                    for (let b = 0; b < 4; b++) {
                        g2.rect(x + 3, y + edge + b * gap, TS - 6, plank);
                        g2.fill(0x7c5c36);
                    }
                    planks++;
                }
            if (planks) c.addChild(g2);
        }
    }

    // Берега реки Мудрости (W50, юзер): переходы листом magic_water
    // (dual-grid 4×4×32px, фича — вода: тайл показывает воду в углах-
    // фичах). Река — колонка «~» с мостами «=» (мост тоже вода под
    // досками), берега до сих пор были жёсткими — клетка целиком вода,
    // клетка целиком магия. Рисуются КВАДРАНТЫ 32px (четверть клетки
    // 64px): тайл квадранта (qx,qy) стоит в пикселе (qx·32, qy·32) и
    // определяется 4 клетками города вокруг его верхнего левого угла —
    // та же конвенция dual-grid, что у мира. Квадрант со СМЕШАННЫМИ
    // углами (вода + суша) перерисовывается тайлом magic_water по ключу
    // LOOKUP; чистые (вся вода / вся суша) не трогаются — под ними
    // базовая заливка пола/воды dungeon.js как была. У мостов «=»
    // квадранты рисуются КАК ВЕЗДЕ (W52, юзер: линия берега изогнутая
    // и в ряду моста — прямой скип W51 убран); водный занос переходов
    // на берег в ряду моста накрывает удлинённый настил — заход мостов
    // на сушу в addCityGroundOverlays («дырки» W51 больше нет).
    // Зовёт dungeon.js ПЕРЕД addCityGroundOverlays (мосты поверх
    // берегов); env: { ctx, st, MAPROWS, W, H }
    function addCityWaterBanks(env, c) {
        const { ctx, MAPROWS, W, H } = env;
        const WT = globalThis.GAME_WORLDTILES;
        const sheet = ctx.worldSheets && ctx.worldSheets.magic_water;
        if (!WT || !sheet || !sheet.textures || !sheet.textures.length)
            return;
        const isW = (x, y) => x >= 0 && y >= 0 && x < W && y < H
            && (MAPROWS[y][x] === "~" || MAPROWS[y][x] === "=");
        for (let qy = 0; qy < H * 2; qy++)
            for (let qx = 0; qx < W * 2; qx++) {
                // клетки вокруг вершины (qx·32, qy·32): лево/право, верх/низ
                const lx = (qx * 32 - 1) >> 6, rx2 = qx >> 1;
                const ty = (qy * 32 - 1) >> 6, by = qy >> 1;
                const tl = isW(lx, ty), tr = isW(rx2, ty);
                const bl = isW(lx, by), br = isW(rx2, by);
                const n = tl + tr + bl + br;
                if (!n || n === 4) continue; // чистые квадранты — база
                const spr = new PIXI.Sprite(
                    sheet.textures[WT.LOOKUP[tl * 8 + tr * 4 + bl * 2 + br]]);
                spr.position.set(qx * 32, qy * 32);
                spr.scale.set(32 / sheet.ts);
                c.addChild(spr);
            }
    }

    // ── Кузница города (W40, просил юзер): бустер из 3 ресурсов стихии
    // города; вскрытие — 3 обычные + 2 редкие + 1 эпическая карта стихии
    // в коллекцию (dataCards.boosterCards). Арт бустера юзера
    // images/resources/buster_<стихия>.png. Ресурсы/бустеры — в сейве.
    // Окно строится здесь (city.js, W47), но живёт в ui-слое сцены
    // dungeon.js: env несёт связи — closeModal/showToast сцены, setRefs
    // (winRefs сцены) и replaceWin (кузница в живом порядке меняет окно:
    // вскрытие → анимация → окно добычи)
    function buildForgeWin(env, o) {
        const ctx = env.ctx;
        const G = ctx.G, uiTex = ctx.uiTex;
        const t = GAME_LOC.t;
        const D = globalThis.GAME_DATA;
        const { T, button, cardFace, cardZoomer } = globalThis.GAME_UI;
        const elem = G.dungeon.elem || "strength";
        const resName = t("res." + elem);
        const c = new PIXI.Container();
        const zoomer = cardZoomer(ctx, { host: c });
        c.eventMode = "static";
        const dim = new PIXI.Graphics();
        dim.rect(-3000, -2000, 7920, 5080);
        dim.fill({ color: 0x000000, alpha: 0.55 });
        c.addChild(dim);
        const w = 780, h = 640, top = 540 - h / 2;
        const panel = new PIXI.Graphics();
        panel.roundRect(960 - w / 2, top, w, h, 18);
        panel.fill({ color: 0x171310, alpha: 0.96 });
        panel.stroke({ width: 4, color: 0x6b5c40 });
        c.addChild(panel);
        const title = T(t("forge.title"), 44, 0xf0c96a,
            { stroke: { color: 0x241505, width: 8 } });
        title.anchor.set(0.5, 0);
        title.position.set(960, top + 20);
        title.eventMode = "none";
        c.addChild(title);
        // арт бустера стихии (юзер, 500×300)
        const art = new PIXI.Sprite(uiTex(`resources/buster_${elem}.png`));
        art.anchor.set(0.5, 0);
        art.scale.set(0.56); // → 280×168
        art.position.set(960, top + 84);
        art.eventMode = "none";
        c.addChild(art);
        const desc = T(t("forge.desc", { elem: t("elem." + elem) }),
            21, 0xbfae87, { wordWrap: true, wordWrapWidth: w - 120,
                align: "center" });
        desc.anchor.set(0.5, 0);
        desc.position.set(960, top + 268);
        desc.eventMode = "none";
        c.addChild(desc);
        // ресурс (иконка+число) и бустеры — живые строки
        const rIcon = new PIXI.Sprite(uiTex(`resources/res_${elem}.png`));
        rIcon.anchor.set(0.5);
        rIcon.scale.set(0.42);
        rIcon.position.set(960 - 168, top + 352);
        rIcon.eventMode = "none";
        c.addChild(rIcon);
        const resT = T("", 26, 0xf3e6c2);
        resT.anchor.set(0, 0.5);
        resT.position.set(960 - 140, top + 352);
        resT.eventMode = "none";
        c.addChild(resT);
        const boostT = T("", 26, 0xffe2a8);
        boostT.anchor.set(0, 0.5);
        boostT.position.set(960 + 40, top + 352);
        boostT.eventMode = "none";
        c.addChild(boostT);
        const needT = T("", 22, 0xff8f6e);
        needT.anchor.set(0.5, 0.5);
        needT.position.set(960, top + 408);
        needT.alpha = 0;
        needT.eventMode = "none";
        c.addChild(needT);
        const craftBtn = button(ctx, {
            tex: "button_menu.png", label: t("forge.craft"),
            x: 960 - 180, y: top + h - 74, scale: 1,
            onTap: () => craft(),
        });
        c.addChild(craftBtn);
        const openBtn = button(ctx, {
            tex: "button_menu.png", label: t("forge.open"),
            x: 960 + 180, y: top + h - 74, scale: 1,
            onTap: () => openBooster(),
        });
        c.addChild(openBtn);
        const leaveBtn = button(ctx, {
            tex: "button_menu.png", label: t("shop.leave"),
            x: 165, y: 78, scale: 1,
            onTap: () => { o.cool = true; env.closeModal(); },
        });
        c.addChild(leaveBtn);
        function refresh() {
            resT.text = t("forge.res",
                { name: resName, n: G.resources[elem] || 0 });
            boostT.text = t("forge.boosters",
                { n: G.boosters[elem] || 0 });
        }
        // (W45, юзер) анимации кузницы: ковка — бустер собирается из
        // кусочков, вскрытие — бустер рвётся, карты вылетают. Состояние
        // для проб: phase "idle"/"craft"/"open"; на время анимации
        // кнопки кузницы не работают (animBusy)
        let animBusy = false, animPhase = "idle";
        function craft() {
            if ((G.resources[elem] || 0) < 3) {
                // «не хватает» — мгновенный фидбек даже во время анимации
                needT.text = t("forge.need", { name: resName });
                needT.alpha = 1;
                if (ctx.sfx) ctx.sfx();
                return;
            }
            if (animBusy) return; // ковка уже идёт — двойной траты нет
            G.resources[elem] -= 3;
            G.boosters[elem] = (G.boosters[elem] || 0) + 1;
            needT.alpha = 0;
            refresh();
            if (ctx.sfx) ctx.sfx("up");
            if (G.saveRun) G.saveRun();
            playCraftAnim();
        }
        // (W48, юзер) кусочки мельче и неровные: арт рисуется в canvas,
        // каждый кусок вырезается ломаным полигоном (случайная сетка
        // резов + дрожь края); соседи нахлёстываются (пиксели общие) —
        // в собранном виде швов нет, а во время полёта края рваные
        function boosterBase() {
            const cv = document.createElement("canvas");
            cv.width = 500; cv.height = 300;
            cv.getContext("2d").drawImage(
                art.texture.source.resource, 0, 0, 500, 300);
            return cv;
        }
        // текстура куска: полигон (в координатах арта 500×300) → canvas
        function jagTex(base, poly, bx0, by0, bw, bh) {
            const cv = document.createElement("canvas");
            cv.width = bw; cv.height = bh;
            const g = cv.getContext("2d");
            g.beginPath();
            poly.forEach((p, i) =>
                (i ? g.lineTo : g.moveTo).call(g, p[0] - bx0, p[1] - by0));
            g.closePath();
            g.clip();
            g.drawImage(base, -bx0, -by0);
            return PIXI.Texture.from(cv);
        }
        // ковка: арт бустера (500×300) режется на ~25-35 неровных
        // кусков; слетаются в свой слот по одному (стаггер 24мс,
        // ease-out), в конце — вспышка и «прикат» готового бустера
        function playCraftAnim() {
            animBusy = true;
            animPhase = "craft";
            art.visible = false;
            const base = boosterBase();
            const OV = 9, AMP = 5 + Math.random() * 2; // нахлёст, дрожь края
            const xs = [0]; // неровная сетка резов (px арта)
            for (let gx = 55 + Math.random() * 40; gx < 438;
                gx += 52 + Math.random() * 46) xs.push(Math.round(gx));
            xs.push(500);
            const ys = [0];
            for (let gy = 48 + Math.random() * 30; gy < 252;
                gy += 44 + Math.random() * 34) ys.push(Math.round(gy));
            ys.push(300);
            // ломаная сторона: линия вокруг v0 вдоль [a..b] с дрожью ±AMP
            const zig = (v0, a, b, vert) => {
                const pts = [];
                const n = Math.max(2, Math.round(Math.abs(b - a) / 12));
                for (let k = 0; k <= n; k++) {
                    const j = (Math.random() - 0.5) * 2 * AMP;
                    const t = a + (b - a) * (k / n);
                    pts.push(vert ? [v0 + j, t] : [t, v0 + j]);
                }
                return pts;
            };
            const fx = new PIXI.Container();
            fx.eventMode = "none";
            c.addChild(fx);
            const flash = new PIXI.Graphics();
            flash.ellipse(0, 0, 195, 115);
            flash.fill({ color: 0xffe2a8, alpha: 0.5 });
            flash.position.set(960, top + 84 + 84);
            flash.alpha = 0;
            flash.eventMode = "none";
            c.addChild(flash);
            const pieces = [], texs = [];
            for (let j = 0; j < ys.length - 1; j++)
                for (let i = 0; i < xs.length - 1; i++) {
                    const L = i ? xs[i] - OV : 0;
                    const R = i < xs.length - 2 ? xs[i + 1] + OV : 500;
                    const T = j ? ys[j] - OV : 0;
                    const B = j < ys.length - 2 ? ys[j + 1] + OV : 300;
                    const poly = [
                        ...(j ? zig(T, L, R, false) : [[L, 0], [R, 0]]),
                        ...(i < xs.length - 2 ? zig(R, T, B, true)
                            : [[R, T], [R, B]]),
                        ...(j < ys.length - 2 ? zig(B, R, L, false)
                            : [[R, 300], [L, 300]]),
                        ...(i ? zig(L, B, T, true) : [[0, B], [0, T]]),
                    ];
                    const pxs = poly.map(p => p[0]);
                    const pys = poly.map(p => p[1]);
                    const bx0 = Math.floor(Math.min(...pxs)) - 1;
                    const by0 = Math.floor(Math.min(...pys)) - 1;
                    const bw = Math.ceil(Math.max(...pxs)) - bx0 + 1;
                    const bh = Math.ceil(Math.max(...pys)) - by0 + 1;
                    const tx = jagTex(base, poly, bx0, by0, bw, bh);
                    texs.push(tx);
                    const sp = new PIXI.Sprite(tx);
                    sp.anchor.set(0.5);
                    sp.scale.set(0.56);
                    sp.eventMode = "none";
                    const ex = 960 + (bx0 + bw / 2 - 250) * 0.56;
                    const ey = top + 84 + 84 + (by0 + bh / 2 - 150) * 0.56;
                    const a = Math.random() * Math.PI * 2;
                    const d = 150 + Math.random() * 150;
                    sp.position.set(ex + Math.cos(a) * d,
                        ey + Math.sin(a) * d);
                    sp.rotation = (Math.random() - 0.5) * 1.3;
                    sp.alpha = 0;
                    fx.addChild(sp);
                    pieces.push({ sp, ex, ey, sx: sp.x, sy: sp.y,
                        srot: sp.rotation, t0: 120 + pieces.length * 24 });
                }
            const t0 = performance.now();
            const FLY = 460, TOTAL = 120 + pieces.length * 24 + FLY + 40;
            const tick = () => {
                if (fx.destroyed) {
                    PIXI.Ticker.shared.remove(tick);
                    texs.forEach(t => t.destroy(true));
                    return;
                }
                const el = performance.now() - t0;
                for (const p of pieces) {
                    const k = Math.min(1, Math.max(0, (el - p.t0) / FLY));
                    const e = 1 - Math.pow(1 - k, 3);
                    p.sp.alpha = e;
                    p.sp.x = p.sx + (p.ex - p.sx) * e;
                    p.sp.y = p.sy + (p.ey - p.sy) * e;
                    p.sp.rotation = p.srot * (1 - e);
                }
                if (el < TOTAL) return;
                PIXI.Ticker.shared.remove(tick);
                fx.destroy({ children: true });
                texs.forEach(t => t.destroy(true));
                art.visible = true;
                // вспышка + прикат готового бустера
                const t1 = performance.now();
                const pop = () => {
                    if (flash.destroyed) {
                        PIXI.Ticker.shared.remove(pop);
                        return;
                    }
                    const k = Math.min(1,
                        (performance.now() - t1) / 260);
                    art.scale.set(0.56 + Math.sin(k * Math.PI) * 0.07);
                    flash.alpha = k < 0.6 ? 0.5 * (1 - k / 0.6) : 0;
                    if (k >= 1) {
                        PIXI.Ticker.shared.remove(pop);
                        flash.destroy();
                        animBusy = false;
                        animPhase = "idle";
                    }
                };
                PIXI.Ticker.shared.add(pop);
            };
            PIXI.Ticker.shared.add(tick);
        }
        // вскрытие: карты сразу в коллекцию (как награда W32), лица —
        // рядом с ховер-зумом; окно меняется на просмотр добычи.
        // (W45, юзер) перед окном добычи — анимация: бустер дрожит,
        // РВЁТСЯ пополам (половинки разлетаются), карты вылетают из
        // центра и встают в свой ряд — потом обычное окно (forgeReward)
        function openBooster() {
            if (animBusy) return;
            if (!(G.boosters[elem] > 0)) {
                needT.text = t("forge.none");
                needT.alpha = 1;
                if (ctx.sfx) ctx.sfx();
                return;
            }
            G.boosters[elem] -= 1;
            const cards = D.boosterCards(elem);
            for (const id of cards)
                G.collection[id] = (G.collection[id] || 0) + 1;
            G.persistMeta();
            if (G.saveRun) G.saveRun();
            if (ctx.sfx) ctx.sfx("coins");
            animBusy = true;
            animPhase = "open";
            env.replaceWin(buildOpenAnim(cards), { leaveBtn: null, forge: {
                tap: () => {},
                state: () => ({ elem, phase: animPhase,
                    res: G.resources[elem] || 0,
                    boosters: G.boosters[elem] || 0,
                    cards: [...cards], need: false, needText: "" }),
            } });
        }
        // анимация вскрытия: панель как у forgeReward (800×460), в
        // центре — арт бустера; геометрия ряда карт ТА ЖЕ, что в
        // forgeReward (spread/cy) — вылетевшие карты «приземляются»
        // точно в слоты статичного окна добычи
        function buildOpenAnim(cards) {
            const rc = new PIXI.Container();
            rc.eventMode = "static";
            const dm = new PIXI.Graphics();
            dm.rect(-3000, -2000, 7920, 5080);
            dm.fill({ color: 0x000000, alpha: 0.55 });
            rc.addChild(dm);
            const pn = new PIXI.Graphics();
            pn.roundRect(960 - 400, top, 800, 460, 18);
            pn.fill({ color: 0x171310, alpha: 0.96 });
            pn.stroke({ width: 4, color: 0x6b5c40 });
            rc.addChild(pn);
            const head = T(t("forge.opened"), 34, 0xf0c96a);
            head.anchor.set(0.5, 0);
            head.position.set(960, top + 30);
            head.eventMode = "none";
            rc.addChild(head);
            const tex = uiTex(`resources/buster_${elem}.png`);
            const CX = 960, CY = top + 84 + 84, S = 0.56;
            const whole = new PIXI.Sprite(tex);
            whole.anchor.set(0.5);
            whole.scale.set(S);
            whole.position.set(CX, CY);
            whole.eventMode = "none";
            rc.addChild(whole);
            // (W48, юзер) разрез — рваный, зигзагом-«ёлочкой»: обе
            // половинки режутся ОДНОЙ ломаной, края комплементарны
            const base = boosterBase();
            const AM = 15; // амплитуда ёлочки (px арта)
            const zpts = [];
            for (let y = 0, k = 0; y <= 300; y += 22, k++)
                zpts.push([
                    250 + (k % 2 ? -AM : AM) * (0.8 + Math.random() * 0.4),
                    Math.min(300, y + (k ? (Math.random() - 0.5) * 6 : 0))]);
            const polyL = [[0, 0], [zpts[0][0], 0], ...zpts, [0, 300]];
            const polyR = [[500, 0], [zpts[0][0], 0], ...zpts, [500, 300]];
            const txL = jagTex(base, polyL, 0, 0, 251 + AM, 301);
            const txR = jagTex(base, polyR, 250 - AM - 1, 0, 250 + AM + 2, 301);
            const xL0 = 960 + ((251 + AM) / 2 - 250) * S;
            const xR0 = 960 + (250 - AM - 1 + (250 + AM + 2) / 2 - 250) * S;
            const mkHalf = (tx, x0) => {
                const s = new PIXI.Sprite(tx);
                s.anchor.set(0.5);
                s.scale.set(S);
                s.eventMode = "none";
                s.position.set(x0, CY);
                s.visible = false;
                rc.addChild(s);
                return s;
            };
            const hl = mkHalf(txL, xL0), hr = mkHalf(txR, xR0);
            const sc = 0.28;
            const spread = Math.min(150, 760 / Math.max(1, cards.length));
            const cy = top + 250, sy = top + 230;
            const cardsSp = cards.map((id, i) => {
                const card = cardFace(ctx, id, { scale: 0.02 });
                card.position.set(CX, sy);
                card.alpha = 0;
                card.eventMode = "none";
                rc.addChild(card);
                return { sp: card,
                    ex: 960 + (i - (cards.length - 1) / 2) * spread, ey: cy };
            });
            const t0 = performance.now();
            const SHAKE = 420, TEAR = 560, STAG = 90, FLY = 460;
            const TOTAL = Math.max(SHAKE + 140
                + (cards.length - 1) * STAG + FLY + 80, SHAKE + TEAR);
            const tick = () => {
                if (rc.destroyed) { PIXI.Ticker.shared.remove(tick); return; }
                const el = performance.now() - t0;
                if (el < SHAKE) { // дрожит нарастающе
                    const k = el / SHAKE;
                    whole.x = CX + Math.sin(el / 22) * 5 * k;
                    whole.rotation = Math.sin(el / 17) * 0.06 * k;
                } else { // рвётся: половинки (край ёлочкой) разлетаются
                    whole.visible = false;
                    hl.visible = hr.visible = true;
                    const k = Math.min(1, (el - SHAKE) / TEAR);
                    const e = 1 - Math.pow(1 - k, 2);
                    hl.x = xL0 - 175 * e;
                    hl.y = CY + 14 * e;
                    hl.rotation = -0.55 * e;
                    hl.alpha = 1 - e;
                    hr.x = xR0 + 175 * e;
                    hr.y = CY + 14 * e;
                    hr.rotation = 0.55 * e;
                    hr.alpha = 1 - e;
                }
                for (let i = 0; i < cardsSp.length; i++) {
                    const cs = cardsSp[i];
                    const k = Math.min(1, Math.max(0,
                        (el - SHAKE - 120 - i * STAG) / FLY));
                    const e = 1 - Math.pow(1 - k, 3);
                    cs.sp.alpha = e;
                    cs.sp.scale.set(0.02 + (sc - 0.02) * e);
                    cs.sp.x = CX + (cs.ex - CX) * e;
                    cs.sp.y = sy + (cs.ey - sy) * e;
                }
                if (el < TOTAL) return;
                PIXI.Ticker.shared.remove(tick);
                if (rc.destroyed) { // окно закрыли mid-anim — чистим
                    txL.destroy(true); txR.destroy(true);
                    return;
                }
                animBusy = false;
                animPhase = "idle";
                const fr = forgeReward(cards);
                env.replaceWin(fr.node, fr.refs);
                txL.destroy(true); txR.destroy(true);
            };
            PIXI.Ticker.shared.add(tick);
            return rc;
        }
        function forgeReward(cards) {
            const rc = new PIXI.Container();
            const zr = cardZoomer(ctx, { host: rc });
            rc.eventMode = "static";
            const dm = new PIXI.Graphics();
            dm.rect(-3000, -2000, 7920, 5080);
            dm.fill({ color: 0x000000, alpha: 0.55 });
            rc.addChild(dm);
            const pn = new PIXI.Graphics();
            pn.roundRect(960 - 400, top, 800, 460, 18);
            pn.fill({ color: 0x171310, alpha: 0.96 });
            pn.stroke({ width: 4, color: 0x6b5c40 });
            rc.addChild(pn);
            const head = T(t("forge.opened"), 34, 0xf0c96a);
            head.anchor.set(0.5, 0);
            head.position.set(960, top + 30);
            head.eventMode = "none";
            rc.addChild(head);
            // ряд лиц (как награда W32): ховер — зум до полного размера
            const sc = 0.28, hh = 495 * sc / 2;
            const spread = Math.min(150, 760 / Math.max(1, cards.length));
            const cy = top + 250;
            cards.forEach((id, i) => {
                const card = cardFace(ctx, id, { scale: sc });
                const cx = 960 + (i - (cards.length - 1) / 2) * spread;
                card.position.set(cx, cy);
                card.eventMode = "static";
                card.on("pointerover", () => zr.show(id, cx, cy, card, sc));
                card.on("pointerout", () => zr.hide(false));
                rc.addChild(card);
            });
            const lv = button(ctx, {
                tex: "button_menu.png", label: t("shop.leave"),
                x: 960, y: top + 400, scale: 1,
                onTap: () => { o.cool = true; env.closeModal(); },
            });
            rc.addChild(lv);
            return { node: rc, refs: { leaveBtn: lv, forge: null } }; // окно сменилось
        }
        refresh();
        return { node: c, refs: { leaveBtn, forge: {
            tap: (w) => (w === "craft" ? craft() : openBooster()),
            state: () => ({ elem, phase: animPhase,
                res: G.resources[elem] || 0,
                boosters: G.boosters[elem] || 0,
                resT: resT.text, boostT: boostT.text,
                need: needT.alpha > 0.5, needText: needT.text }),
        } } };
    }

    // ── Ратуша города (W40, просил юзер): побочные квесты. Подход к
    // ратуше — окно с описанием, наградой и кнопками «Принять»/
    // «Отказаться». Выполненные квесты не возобновляются (model/accept —
    // sidequests.js); «охота» спавнит монстра у города, «письмо»
    // выбирает город-адресат. Живёт в city.js (W47), связи со сценой —
    // env (как у кузницы выше)
    function buildQuestWin(env, o) {
        const ctx = env.ctx;
        const G = ctx.G, uiTex = ctx.uiTex;
        const t = GAME_LOC.t;
        const { T, button } = globalThis.GAME_UI;
        const SQ = globalThis.GAME_SIDEQ;
        const c = new PIXI.Container();
        c.eventMode = "static";
        const dim = new PIXI.Graphics();
        dim.rect(-3000, -2000, 7920, 5080);
        dim.fill({ color: 0x000000, alpha: 0.55 });
        c.addChild(dim);
        const w = 780, h = 540, top = 540 - h / 2;
        const panel = new PIXI.Graphics();
        panel.roundRect(960 - w / 2, top, w, h, 18);
        panel.fill({ color: 0x171310, alpha: 0.96 });
        panel.stroke({ width: 4, color: 0x6b5c40 });
        c.addChild(panel);
        const title = T(t("sideq.title"), 44, 0xf0c96a,
            { stroke: { color: 0x241505, width: 8 } });
        title.anchor.set(0.5, 0);
        title.position.set(960, top + 20);
        title.eventMode = "none";
        c.addChild(title);
        const leaveBtn = button(ctx, {
            tex: "button_menu.png", label: t("sideq.leave"),
            x: 960, y: top + h - 70, scale: 1,
            onTap: () => { o.cool = true; env.closeModal(); },
        });
        c.addChild(leaveBtn);
        // город, в котором герой: вход запомнил якорь (exitTown)
        const map = G.world && G.world.map;
        const et = G.dungeon.exitTown || null;
        const poi = map && et ? map.pois.find((p) =>
            (p.kind === "town" || p.kind === "capital")
            && p.gx === et.gx && p.gy === et.gy) : null;
        const head = T("", 26, 0xbfae87);
        head.anchor.set(0.5, 0);
        head.position.set(960, top + 96);
        head.eventMode = "none";
        c.addChild(head);
        const name = T("", 32, 0xf0c96a);
        name.anchor.set(0.5, 0);
        name.position.set(960, top + 136);
        name.eventMode = "none";
        c.addChild(name);
        const body = T("", 24, 0xd8c79d,
            { wordWrap: true, wordWrapWidth: w - 130, align: "center" });
        body.anchor.set(0.5, 0);
        body.position.set(960, top + 200);
        body.eventMode = "none";
        c.addChild(body);
        const rewIcon = new PIXI.Sprite(uiTex("icon_gold.png"));
        rewIcon.anchor.set(0.5);
        rewIcon.eventMode = "none";
        const rew = T("", 26, 0xffe2a8);
        rew.anchor.set(0.5, 0);
        rew.position.set(960, top + 320);
        rew.eventMode = "none";
        c.addChild(rew);
        if (!poi || !SQ) {
            head.text = t("sideq.done");
            name.text = "";
            body.text = "";
            rew.text = "";
            rewIcon.visible = false;
            return { node: c, refs: { leaveBtn, quest: null } };
        }
        const m = SQ.model(G, poi);
        let refs = null; // offer назначит свою, остальным — общий «Уйти»
        if (m.mode === "done") {
            head.text = "";
            name.text = "";
            body.text = m.text || t("sideq.done");
            rew.text = "";
            rewIcon.visible = false;
        } else if (m.mode === "taken") {
            head.text = m.head;
            name.text = m.name;
            body.text = m.text;
            rew.text = m.reward;
            // иконка ресурса награды слева от строки награды
            const resTex = uiTex(`resources/res_${poi.elem}.png`);
            rewIcon.texture = resTex;
            rewIcon.scale.set(0.34);
            rewIcon.position.set(960 - rew.width / 2 - 24, top + 338);
            rewIcon.visible = true;
        } else { // offer
            head.text = t("sideq.offerHead");
            name.text = m.name;
            body.text = m.text;
            rew.text = m.reward;
            const resTex = uiTex(`resources/res_${poi.elem}.png`);
            rewIcon.texture = resTex;
            rewIcon.scale.set(0.34);
            rewIcon.position.set(960 - rew.width / 2 - 24, top + 338);
            rewIcon.visible = true;
            // кнопки «Принять»/«Отказаться» вместо «Уйти»
            c.removeChild(leaveBtn);
            const acceptTap = () => {
                const q = SQ.accept(G, poi, m.type, m.target);
                if (!q) return;
                if (ctx.sfx) ctx.sfx("up");
                env.closeModal();
                env.showToast(q.type === "hunt"
                    ? t("sideq.hunt.active", { mob: SQ.mobTitle(q.elem) })
                    : t("sideq.letter.active",
                        { city: SQ.cityName(G, q.target) }));
            };
            const acceptBtn = button(ctx, {
                tex: "button_menu.png", label: t("sideq.accept"),
                x: 960 - 170, y: top + h - 70, scale: 1,
                onTap: acceptTap,
            });
            c.addChild(acceptBtn);
            const declineBtn = button(ctx, {
                tex: "button_menu.png", label: t("sideq.decline"),
                x: 960 + 170, y: top + h - 70, scale: 1,
                onTap: () => { o.cool = true; env.closeModal(); },
            });
            c.addChild(declineBtn);
            refs = { leaveBtn: declineBtn, quest: {
                state: () => ({ mode: m.mode, type: m.type,
                    name: name.text, text: body.text, reward: rew.text }),
                accept: acceptTap,
            } };
        }
        // taken/done: «Уйти» остаётся, принять нечего (offer выше
        // уже назначил refs с accept)
        if (!refs || !refs.quest) refs = { leaveBtn, quest: {
            state: () => ({ mode: m.mode, type: m.type || null,
                name: name.text, text: body.text, reward: rew.text }),
            accept: () => {},
        } };
        return { node: c, refs };
    }

    // Живые огни города (W53, юзер просил эффекты pixelfx в игре): горн
    // кузницы (armory) и горны у дверей ратуши (townHall). W59 (юзер):
    // факелы (Torch) заменены на горны (Brazier) — fire/brazier везде.
    // Loop-эффекты через GAME_FX (мост pixelfx.js): бандл
    // dll/pixelfx.min.js не загрузился — город просто без огней, ошибки
    // не бывает. Живут до выхода из города (FX-спрайты умирают вместе с
    // контейнером карты, тик сам вычищает мёртвых).
    // Зовётся dungeon.js ПОСЛЕ addCityGroundOverlays — огонь поверх
    // моста/берега, если здание вдруг у воды.
    function addCityFires(env, c) {
        const FX = globalThis.GAME_FX;
        if (!FX || !FX.available || !env.st.objects) return;
        const TS = 64;
        for (const o of env.st.objects) {
            if (o.type === "armory") {
                // горн у левого края фасада, на полу перед дверью
                FX.spawn(c, "fire/brazier", {
                    x: (o.gx + 0.45) * TS, y: (o.row + 0.62) * TS,
                    size: 76, seed: o.gx * 7 + o.gy,
                });
            } else if (o.type === "townHall") {
                // горны по углам фасада (W59: были факелы — заменил юзер)
                FX.spawn(c, "fire/brazier", {
                    x: (o.gx + 0.4) * TS, y: (o.row + 0.6) * TS,
                    size: 68, seed: o.gx * 3 + 1,
                });
                FX.spawn(c, "fire/brazier", {
                    x: (o.gx + o.w - 0.4) * TS, y: (o.row + 0.6) * TS,
                    size: 68, seed: o.gx * 3 + 2,
                });
            }
        }
    }

    globalThis.GAME_CITY = {
        CITY_VARIANTS, CITY_V, newCityState, addCityDeco,
        addCityGroundOverlays, addCityWaterBanks, buildForgeWin,
        buildQuestWin, addCityFires,
    };
})();
