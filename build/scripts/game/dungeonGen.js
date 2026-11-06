// ГЕНЕРАТОР И СОСТОЯНИЕ ЭТАЖЕЙ ПОДЗЕМЕЛЬЯ — часть dungeon.js (W64):
// раскладка этажа (genMap), объекты комнат (genObjects), требование
// колоды (deckNeed), архив «данж:этаж» (stKey/stateFor) и сборка
// состояния этажа (newDungeonState). Сцена (рендер/окна/update/enter) —
// dungeon.js; активная карта (W/H/MAPROWS) живёт там же. Файл не
// зависит от сцены — его грузят и оффлайн-проверки (check_city.mjs).
(function () {
    const TS = 64; // клетка = тайлы юзера (пол 64×64, стены 64×64 и 64×128)
    // Подземелья (id → стихия/глубина/босс) — dataCards CAVES; гоблинские
    // пещеры, Роща Роста и «Подземные ключи» — одной глубины 6
    const CAVES = () => globalThis.GAME_DATA.CAVES;
    const caveOf = (id) => CAVES()[id] || CAVES().gob;

    // Набор тайлов по данжу — папка images/dungeon_tiles/<имя> (просил юзер:
    // у каждого данжа свой арт): Сила — goblins_lair, Рост — growth_lair,
    // Мудрость — water_lair («Подземные ключи»), Тлен — necro_lair
    // («Земли мёртвых», просил юзер), Честь — honor_lair («Залы Чести»)
    const TILE_SETS = { gob: "goblins_lair", grw: "growth_lair",
                        wis: "water_lair",
                        dec: "necro_lair",
                        hon: "honor_lair",
                        tim: "time_lair",
                        sgr: "str_gro", // W54: «Рыжий лес» (тайлы юзера)
                        gh: "gro_hon" }; // W61: «Белая пуща» (тайлы юзера)
    const tileSetOf = (cave) => TILE_SETS[cave] || TILE_SETS.gob;
    // Ключ архива этажей — «данж:этаж» (gob:1, grw:2…): у каждого
    // подземелья своя история подъёмов/спусков
    const stKey = (cave, floor) => (caveOf(cave) && cave !== undefined ? cave : "gob") + ":" + floor;
    function stateFor(states, cave, floor) {
        return (states && states[stKey(cave, floor)])
            || newDungeonState(cave, floor);
    }
    // #: стена, .: пол, H: старт героя, e: враг, B: главарь, X: выход.
    // Враги стоят В КОРИДОРАХ, перекрывая входы в комнаты (просил юзер),
    // а не в центрах: (3,7) — выход из стартовой комнаты, (24,6) — вход
    // в правую верхнюю, (11,12) — дверной проход левой нижней. В центрах
    // комнат — интерактивные объекты. Босс — в центре своей комнаты
    // у спуска, как был.
    const ROWS = [
        "##############################",
        "#......#........#............#",
        "#.H....#.....................#",
        "#...............#............#",
        "#......#........#............#",
        "#......#........########.#####",
        "###.####........########e#####",
        "###e##########.#########.#####",
        "###.##########.#########.#####",
        "#..........##................#",
        "#..........##................#",
        "#..........##................#",
        "#..........e.................#",
        "#..........##................#",
        "#..........##.........B....X.#",
        "#..........##................#",
        "##############################",
    ];
    // Сетка ГЕНЕРАЦИИ ДАНЖА — всегда 30×17 (genMap/newDungeonState/
    // retreatCell живут по ней). АКТИВНАЯ карта (W/H) — то, что на экране:
    // город шире и выше данжа, размер ставится в enter() по st.rows (W34)
    const DW = ROWS[0].length, DH = ROWS.length;

    // центры комнат старой фиксированной карты — фолбэк для genObjects
    // без раскладки (смоук зовёт с воздухом)
    const ROOM_CENTERS = [[3, 3], [11, 3], [22, 2], [5, 12]];

    // Объекты этажа: по одному в центре каждой комнаты, кроме стартовой
    // (просил юзер). Тип кидается из общего пула: куча золота, сундук и —
    // со 2-го этажа — магазин (просил юзер). Магазин может и не выпасть,
    // а выпав, исключается из пула — не больше 1 на этаж. Карта сокровищ
    // (драфт) в пуле больше НЕТ (просил юзер): она появляется только на
    // последнем этаже данжа с боссом, отдельным кодом после победы над
    // боссом (см. arenaFlow.js). Сумма кучи и карта сундука кидаются при
    // генерации этажа и хранятся в объекте — сейв/загрузка показывает
    // то же самое.
    function genObjects(floor, cave = "gob", centersArg = null) {
        const { rollLootCard } = globalThis.GAME_DATA;
        const elem = caveOf(cave).elem; // карты сундуков/магазина — стихии данжа
        // lootCenters уже без стартовой и боссовой комнат; фолбэк
        // ROOM_CENTERS — старый список, стартовую отрезаем
        const centers = centersArg ? centersArg.slice() : ROOM_CENTERS.slice(1);
        for (let i = centers.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [centers[i], centers[j]] = [centers[j], centers[i]];
        }
        const pool = ["gold", "chest"];
        if (floor >= 2) pool.push("shop");
        return centers.map(([col, row]) => {
            const pi = (Math.random() * pool.length) | 0;
            const type = pool[pi];
            if (type === "shop" || type === "map") pool.splice(pi, 1); // ≤ 1 на этаж
            const obj = { type, col, row, taken: false };
            if (type === "gold") obj.amount = 1 + ((Math.random() * 5) | 0) + (floor - 1);
            if (type === "chest") obj.card = rollLootCard(elem);
            if (type === "shop") obj.stock = Array.from({ length: 6 }, () => rollLootCard(elem));
            if (type === "shop") obj.sold = [false, false, false, false, false, false];
            return obj;
        });
    }

    // Требование колоды для спуска: с этажа N нужно 16+N карт
    // (спуск на 2-й — 17, на 3-й — 18, …), рост +1 за этаж до капа 60
    // (просил юзер; вход на 1-й этаж — 16, dataCards.caveDeckFor).
    // Минимум колоды ДЛЯ БОЯ на этаже N — то же число минус 1
    // (caveDeckFor(N) = 15+N). W54: считаем через caveDeckFor СВОЕГО
    // данжа этажом ниже — «Рыжий лес» требует свою лестницу (26/28)
    function deckNeed(cave, floor) {
        return globalThis.GAME_DATA.caveDeckFor(cave, (floor | 0) + 1);
    }

    // ── ГЕНЕРАТОР РАСКЛАДКИ ЭТАЖА (просил юзер: комнаты и граф проходов
    // между ними каждый раз другие, не одна и та же карта). Сетка та же
    // 30×17 (зум/камера не тронуты), маркеры прежние (H/e/B/X) — парсер
    // состояния ниже не менялся. Комнаты (4-6) бросаются случаем и
    // сшиваются L-коридорами: остов + до двух петель — граф проходов
    // каждый этаж новый. Враги встают в УЗКИХ коридорах у входов в
    // комнаты (просил юзер), босс — в дальней комнате у выхода, герой —
    // в центре стартовой (её центр и центры прочих комнат идут в
    // st.roomCenters для объектов). Сид: globalThis.__MAP_SEED (смоук/
    // пробы), иначе случайный; готовая раскладка хранится в состоянии
    // этажа (st.rows) — перезаход и «Продолжить» показывают ту же карту.
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function genMap(cave, floor) {
        const rng = mulberry32(((globalThis.__MAP_SEED != null
            ? globalThis.__MAP_SEED : (Math.random() * 2 ** 31) | 0)
            + floor * 104729 + cave.length * 7919 + cave.charCodeAt(0) * 313) | 0);
        const g = Array.from({ length: DH }, () => Array(DW).fill("#"));
        const carve = (x, y) => { if (x > 0 && y > 0 && x < DW - 1 && y < DH - 1) g[y][x] = "."; };
        const rooms = [];
        // стартовая комната — первой: пошире (клик-тесты ходят по ней),
        // в левой-верхней четверти
        rooms.push({ x: 2 + ((rng() * 3) | 0), y: 2 + ((rng() * 2) | 0), w: 6 + ((rng() * 3) | 0), h: 4 });
        const fits = (r) => r.x >= 2 && r.y >= 2 && r.x + r.w <= DW - 2 && r.y + r.h <= DH - 2 &&
            !rooms.some((o) => r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x &&
                                r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y);
        for (let n = 0; n < 300 && rooms.length < 4 + ((rng() * 3) | 0); n++) {
            const r = { w: 5 + ((rng() * 4) | 0), h: 3 + ((rng() * 3) | 0) };
            r.x = 2 + ((rng() * (DW - 4 - r.w)) | 0);
            r.y = 2 + ((rng() * (DH - 4 - r.h)) | 0);
            if (fits(r)) rooms.push(r);
        }
        const center = (r) => [r.x + (r.w >> 1), r.y + (r.h >> 1)];
        for (const r of rooms)
            for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) carve(i, j);
        // коридоры: остов (жадный Prim — каждая комната к ближайшей уже
        // соединённой) + до двух петель; L-форма, горизонталь/вертикаль
        // первыми — случаем
        const corridor = (a, b) => {
            let [x, y] = a;
            const [tx, ty] = b;
            const goX = () => { while (x !== tx) { x += Math.sign(tx - x); carve(x, y); } };
            const goY = () => { while (y !== ty) { y += Math.sign(ty - y); carve(x, y); } };
            if (rng() < 0.5) { goX(); goY(); } else { goY(); goX(); }
        };
        const inTree = [0], linked = new Set();
        while (inTree.length < rooms.length) {
            let best = null;
            for (const ai of inTree) for (let bi = 0; bi < rooms.length; bi++) {
                if (inTree.includes(bi)) continue;
                const [ax, ay] = center(rooms[ai]), [bx, by] = center(rooms[bi]);
                const d = Math.abs(ax - bx) + Math.abs(ay - by);
                if (!best || d < best.d) best = { ai, bi, d };
            }
            corridor(center(rooms[best.ai]), center(rooms[best.bi]));
            linked.add(Math.min(best.ai, best.bi) + "-" + Math.max(best.ai, best.bi));
            inTree.push(best.bi);
        }
        for (let n = 0, tries = 0; n < 2 && tries < 40; tries++) {
            const a = (rng() * rooms.length) | 0, b = (rng() * rooms.length) | 0;
            const key = Math.min(a, b) + "-" + Math.max(a, b);
            if (a === b || linked.has(key)) continue;
            linked.add(key);
            corridor(center(rooms[a]), center(rooms[b]));
            n++;
        }
        // маркеры: герой в центре стартовой, босс — в самой далёкой
        // комнате, выход рядом с ним же (но не вплотную)
        const [sx, sy] = center(rooms[0]);
        const far = rooms.reduce((m, r, i) => {
            if (!i) return m;
            const [cx, cy] = center(r), [mx, my] = center(rooms[m]);
            return Math.abs(cx - sx) + Math.abs(cy - sy) > Math.abs(mx - sx) + Math.abs(my - sy) ? i : m;
        }, 0);
        const [bx, by] = center(rooms[far]);
        g[sy][sx] = "H";
        // главарь есть у каждого данжа (у «Подземных ключей» — «Безумный
        // маг» на каждом этаже, как у пещер и Рощи). W54: «Рыжий лес»
        // (bossLast) держит босса ТОЛЬКО на последнем этаже — на 1–2-м
        // в дальней комнате только спуск, без охраны (спека юзера)
        if (caveOf(cave).boss && (!caveOf(cave).bossLast
            || floor >= caveOf(cave).maxFloor)) g[by][bx] = "B";
        // спуск ставится только если есть куда: на последнем этаже данжа
        // выхода вниз нет вовсе (просил юзер)
        if (floor < caveOf(cave).maxFloor) {
            for (let n = 0; n < 50; n++) {
                const x = rooms[far].x + ((rng() * rooms[far].w) | 0);
                const y = rooms[far].y + ((rng() * rooms[far].h) | 0);
                if (g[y][x] === "." && Math.abs(x - bx) + Math.abs(y - by) >= 3) { g[y][x] = "X"; break; }
            }
        }
        // враги — в УЗКИХ коридорах у входов в комнаты (не стартовую):
        // клетка пола вне комнат, в шаге от клетки комнаты, с парой
        // противоположных стен (проход шириной 1); трое, расходятся
        // между собой, от героя и от босса
        const inRoom = (x, y) => rooms.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
        const narrow = (x, y) => (g[y][x - 1] === "#" && g[y][x + 1] === "#") ||
                                 (g[y - 1][x] === "#" && g[y + 1][x] === "#");
        const cands = [];
        for (let y = 1; y < DH - 1; y++) for (let x = 1; x < DW - 1; x++) {
            if (g[y][x] !== "." || inRoom(x, y) >= 0) continue;
            const door = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inRoom(x + dx, y + dy) > 0);
            if (door && narrow(x, y)) cands.push([x, y]);
        }
        let placed = 0;
        for (let n = 0; n < 300 && placed < 3; n++) {
            if (!cands.length) break;
            const [x, y] = cands[(rng() * cands.length) | 0];
            if (g[y][x] !== ".") continue;
            if (Math.abs(x - sx) + Math.abs(y - sy) < 4) continue;
            if (Math.abs(x - bx) + Math.abs(y - by) < 3) continue;
            let apart = true;
            for (let j = 0; j < DH && apart; j++) for (let i = 0; i < DW && apart; i++)
                if (g[j][i] === "e" && Math.abs(i - x) + Math.abs(j - y) < 5) apart = false;
            if (!apart) continue;
            g[y][x] = "e";
            placed++;
        }
        // мало узких дверей (редкая раскладка) — добираем любыми
        // коридорными клетками подальше от героя
        for (let y = 1; y < DH - 1 && placed < 3; y++) for (let x = 1; x < DW - 1 && placed < 3; x++) {
            if (g[y][x] !== "." || inRoom(x, y) >= 0) continue;
            if (Math.abs(x - sx) + Math.abs(y - sy) < 5) continue;
            let apart = true;
            for (let j = 0; j < DH && apart; j++) for (let i = 0; i < DW && apart; i++)
                if (g[j][i] === "e" && Math.abs(i - x) + Math.abs(j - y) < 5) apart = false;
            if (!apart) continue;
            g[y][x] = "e";
            placed++;
        }
        const roomCenters = rooms.map(center);
        const lootCenters = roomCenters.filter((_, i) => i !== 0 && i !== far);
        return { rows: g.map((r) => r.join("")), roomCenters, lootCenters };
    }

    function newDungeonState(cave, floor) {
        const caveId = globalThis.GAME_DATA.CAVES[cave] ? cave : "gob";
        const { mobForFloor, enemyDeck } = globalThis.GAME_DATA;
        const map = genMap(caveId, floor); // раскладка этажа (просил юзер)
        const st = {
            cave: caveId,
            floor, heroPos: null, spawn: null, ladder: null, enemies: [],
            exit: null, exitCool: false,
            // босс «мёртв» по умолчанию: спуск НЕ запечатан, если на этаже
            // босса нет вовсе («Рыжий лес», этажи 1–2 — спека юзера W54);
            // парсер ниже переведёт в false, положив босса на карту
            bossDead: true,
            toast: null, toastT: 0, win: null,
            rows: map.rows, roomCenters: map.roomCenters,
            lootCenters: map.lootCenters,
            objects: genObjects(floor, caveId, map.lootCenters),
        };
        const bossId = caveOf(caveId).boss; // главарь данжа (boss / grwBoss / wisBoss)
        const rows = st.rows;
        for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
            const ch = rows[j][i];
            const x = i * TS + TS / 2, y = j * TS + TS / 2;
            if (ch === "H") { st.heroPos = { x, y }; st.spawn = { x, y }; }
            else if (ch === "e") {
                // архетип по этажу ДАНЖА; колода кидается один раз и хранится
                // в враге — тултип и бой показывают один и тот же состав
                const enc = mobForFloor(caveId, floor);
                st.enemies.push({ x, y, enc, deck: enemyDeck(enc, floor), alive: true, boss: false });
            }
            else if (ch === "B" && bossId) {
                st.bossDead = false;
                st.enemies.push({ x, y, enc: bossId, deck: enemyDeck(bossId, floor), alive: true, boss: true });
            }
            else if (ch === "X") st.exit = { x, y };
        }
        // лестница наверх — в стартовой комнате, клеткой выше героя:
        // рядом (40px — чуть больше радиуса касания), но не на пути
        // первого шага вправо и не срабатывает сама при спауне
        if (st.spawn) st.ladder = { x: st.spawn.x, y: st.spawn.y - TS };
        return st;
    }

    globalThis.GAME_DUNGEON_GEN = {
        TS, ROWS, DW, DH, CAVES, caveOf, TILE_SETS, tileSetOf,
        stKey, stateFor, ROOM_CENTERS, genObjects, deckNeed,
        mulberry32, genMap, newDungeonState,
    };
})();
