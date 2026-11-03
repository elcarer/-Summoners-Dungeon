// СЦЕНА «ПОДЗЕМЕЛЬЕ» — top-down перемещение героя, энкаунтеры-враги, выход.
// Карта-ASCII 30×17 собирается из тайлов юзера (images/dungeon_tiles/<данж>,
// клетка 64px): пол — плиты с вариациями, стены — спрайты по маске соседей
// (низ 64×64 — лицо с коллизией, верх 64×128-спрайтов нависает на клетку
// выше и на движение не влияет). Набор тайлов — свой у каждого данжа:
// goblins_lair (Сила), growth_lair (Рост), water_lair (Мудрость),
// necro_lair (Тлен), honor_lair (Честь).
// Состояние живёт в G.dungeon (переживает уход в арену и обратно);
// состояния пройденных этажей — в G.dungeonStates: по лестнице у старта
// герой поднимается на этаж выше (на 1-м — выходит в открытый мир),
// а повторный спуск попадает на этаж в том виде, в каком его оставили.
// Подземелье ограничено глубиной: MAX_FLOOR этажей, дальше спуска нет.
// В центрах комнат (кроме боссовой) — интерактивные объекты: куча золота,
// сундук с картой и магазин (только со 2-го этажа, не больше 1 на этаж).
(function () {
    const TS = 64; // клетка = тайлы юзера (пол 64×64, стены 64×64 и 64×128)
    // Подземелья (id → стихия/глубина/босс) — dataCards CAVES; гоблинские
    // пещеры, Роща Роста и «Подземные ключи» — одной глубины 6
    const CAVES = () => globalThis.GAME_DATA.CAVES;
    const caveOf = (id) => CAVES()[id] || CAVES().gob;
    // ГОРОД (W30, юзер): поверхность пола — местность зоны стихии
    // (листы вариантов заливки worldTiles 4×4 по 32px), стены — набор
    // тайлов данжа той же стихии
    const CITY_VARIANTS = { strength: "dirt", growth: "grass",
        wisdom: "magic", decay: "waste", honor: "sand", time: "snow" };
    const MAX_FLOOR = 6;
    // Набор тайлов по данжу — папка images/dungeon_tiles/<имя> (просил юзер:
    // у каждого данжа свой арт): Сила — goblins_lair, Рост — growth_lair,
    // Мудрость — water_lair («Подземные ключи»), Тлен — necro_lair
    // («Земли мёртвых», просил юзер), Честь — honor_lair («Залы Чести»)
    const TILE_SETS = { gob: "goblins_lair", grw: "growth_lair",
                        wis: "water_lair",
                        dec: "necro_lair",
                        hon: "honor_lair",
                        tim: "time_lair" };
    const tileSetOf = (cave) => TILE_SETS[cave] || TILE_SETS.gob;
    // Версия раскладки этажа: тайлы 64px данжа (v9 — у 5-го этажа
    // «Подземных ключей» появился спуск на новый 6-й; старые сейвы без
    // спуска пересобираются; cap глубины — 6 этажей). Сейвы другой
    // геометрии (координаты в других клетках) не поднимаются — этаж
    // пересобирается заново.
    const MAP_V = 10;
    // Ключ архива этажей — «данж:этаж» (gob:1, grw:2…): у каждого
    // подземелья своя история подъёмов/спусков
    const stKey = (cave, floor) => (caveOf(cave) && cave !== undefined ? cave : "gob") + ":" + floor;
    function stateFor(states, cave, floor) {
        const st = states && states[stKey(cave, floor)];
        return st && st.v === MAP_V ? st : newDungeonState(cave, floor);
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
    let W = DW, H = DH;
    // АКТИВНАЯ раскладка: строки сгенерированного этажа (st.rows).
    // До первого входа — старая фиксированная карта (заглушка для
    // collide в main.js; мир при входе ставит свои строки)
    let MAPROWS = ROWS;
    // ТОЛЩА — стена, у которой все четыре соседа тоже стены (за краем
    // карты соседа нет): внутрь недоступных игроку массивов тайлы не
    // рисуем ВООБЩЕ — ни стены, ни пол, только тёмная подложка (просил
    // юзер: «пусть будет только граница»)
    function wallInterior(x, y) {
        // Толща — клетка, окружённая стенами по ВСЕМУ периметру 3×3: ни
        // одной видимой грани, не рисуем вовсе (просил юзер). Клетка с
        // диагональным полом — уже НЕ толща: это видимый угол комнаты
        // (раньше он не рисовался — в углах комнат были разрывы).
        const w = (a, b) => a >= 0 && b >= 0 && a < W && b < H && MAPROWS[b][a] === "#";
        if (!(w(x - 1, y) && w(x + 1, y) && w(x, y - 1) && w(x, y + 1))) return false;
        return w(x - 1, y - 1) && w(x + 1, y - 1) && w(x - 1, y + 1) && w(x + 1, y + 1);
    }
    // РИСОВАННАЯ стена: не толща и среди 8 соседей есть пол. Внешний
    // периметр карты — стены без пола рядом — больше не рисуется: выходит
    // рамка-«коробка» вокруг всего уровня (просил юзер убрать). Коллизию
    // держит blocked(), а не спрайты.
    function wallDrawn(x, y) {
        if (MAPROWS[y][x] !== "#" || wallInterior(x, y)) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const a = x + dx, b = y + dy;
            if (a >= 0 && b >= 0 && a < W && b < H && MAPROWS[b][a] !== "#") return true;
        }
        return false;
    }
    // центры комнат старой фиксированной карты — фолбэк для genObjects
    // без раскладки (смоук зовёт с воздухом) и древних сейвов
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
    // (caveDeckFor(N) = 15+N)
    function deckNeed(floor) {
        return Math.min(globalThis.GAME_DATA.DECK_MAX, 16 + Math.max(0, floor));
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
        // маг» на каждом этаже, как у пещер и Рощи)
        if (caveOf(cave).boss) g[by][bx] = "B";
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
            v: MAP_V,
            cave: caveId,
            floor, heroPos: null, spawn: null, ladder: null, enemies: [],
            exit: null, exitCool: false, bossDead: !caveOf(caveId).boss,
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
            else if (ch === "B" && bossId) st.enemies.push({ x, y, enc: bossId, deck: enemyDeck(bossId, floor), alive: true, boss: true });
            else if (ch === "X") st.exit = { x, y };
        }
        // лестница наверх — в стартовой комнате, клеткой выше героя:
        // рядом (40px — чуть больше радиуса касания), но не на пути
        // первого шага вправо и не срабатывает сама при спауне
        if (st.spawn) st.ladder = { x: st.spawn.x, y: st.spawn.y - TS };
        return st;
    }

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
    // лестница-выход — в ОТДЕЛЬНОМ квартале без зданий (в столице —
    // южном, в городе — юго-восточном), вплотную к городской стене:
    // сквозные маршруты (арка по низу квартала, вертикальный коридор)
    // проходят в 2 клетках — мимо ворот не выезжает из города.
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
    const CITY_V = 6; // версия планировки города: старые cityStates пересобираются
    function newCityState(elem, capital) {
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
            [9, 14, 14, 17],  // южная (ворота — лестница-выход, W37)
            [16, 14, 22, 17], // юго-восточная
        ] : [
            [7, 6, 12, 10],   // центральная (ратуша)
            [1, 1, 5, 4],     // северо-западная (магазин)
            [14, 1, 18, 4],   // северо-восточная (кузница)
            [1, 12, 5, 14],   // юго-западная
            [14, 12, 18, 14], // юго-восточная (ворота — лестница-выход, W37)
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
            // до ворот): иначе появлялся транзит через прямых соседей
            // лестницы-выхода — W37-инвариант (проверяет check_city)
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
        // прибытие/отбытие: лестница-выход — в ОТДЕЛЬНОМ квартале без
        // зданий (W37, юзер): в столице — южном (13,15), в городе —
        // юго-восточном (18,12), вплотную к городской стене. Триггер
        // лестницы — 1.02 клетки: прямые соседи срабатывают, диагональ
        // (90px) нет — сквозные маршруты (арка по низу квартала,
        // вертикальный коридор) проходят в 2 клетках, мимо ворот герой
        // город не покидает. Спавн — клетка ниже; лестницу 2с «остужает»
        // enterCity — первый кадр не выкидывает в мир
        const gate = capital ? [13, 15] : [18, 12];
        st.ladder = { x: gate[0] * TS + TS / 2, y: gate[1] * TS + TS / 2 };
        st.spawn = { x: st.ladder.x, y: st.ladder.y + TS };
        return st;
    }

    // Поражение в бою (просил юзер): герой отступает на свободную
    // соседнюю клетку врага — враг остаётся на месте, реванш по касанию.
    // Клетка врага всегда проходима, соседи по карте; если кругом стены —
    // возвращаем на место (бой перезапустится касанием, не падаем).
    function retreatCell(enemy) {
        const cx = Math.round(enemy.x / TS - 0.5), cy = Math.round(enemy.y / TS - 0.5);
        const open = (gx, gy) => gx >= 0 && gy >= 0 && gx < DW && gy < DH
            && !"#%~FM".includes(MAPROWS[gy][gx]);
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (let i = dirs.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        for (const [dx, dy] of dirs)
            if (open(cx + dx, cy + dy))
                return { x: (cx + dx) * TS + TS / 2, y: (cy + dy) * TS + TS / 2 };
        return { x: enemy.x, y: enemy.y };
    }

    function createDungeonScene(ctx) {
        const { COMPONENTS, camera, characters, charInput, ECS, world, scenes, G, worldContainer, uiTex, creatureSheets } = ctx;
        let layer = null, heroId = null, heroSprite = null, heroShadow = null,
            tokens = [], uiHud = null;
        let myState = null; // состояние, которым живёт этот инстанс сцены:
        // подъём/спуск меняет G.dungeon ДО переключения сцены — тогда
        // heroPos в exit() пишет уже не этому состоянию
        let objNodes = []; // спрайты объектов комнат (куча/сундук/магазин)
        // Глом в городе (W34): живой агент у своего дома в столице.
        // Скрыт, пока герой не подойдёт к дому; выходит, идёт к герою,
        // начинает разговор. Сущность characters — как у отрядов мира
        let glomId = null, glomNode = null, glomShadow = null,
            glomPath = null, glomPathT = 0;
        let winNode = null, winRefs = null, winObj = null; // открытое окно объекта
        let sellRows = []; // строки продажи магазина (для тестов)
        let refreshShop = null; // живое обновление окна магазина (пишет buildShopWin)
        let shopZoomHook = null; // ховер-зум карт магазина (пишет buildShopWin)
        let path = null; // клик-перемещение: очередь центров клеток (мировые px)
        let zoneRef = null; // клик-зона местности (тесты: clickAt)
        let pathLayer = null; // fx-слой следа клика (кольцо + точки маршрута)

        function blocked(px, py) {
            const gx = Math.floor(px / TS), gy = Math.floor(py / TS);
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) return true;
            const ch = MAPROWS[gy][gx];
            // стены, пятна застройки (W34), вода рек и чащи/горы стихийных
            // фич (W38); мосты «=» — проходимы
            return ch === "#" || ch === "%" || ch === "~" || ch === "F" || ch === "M";
        }

        // ── Клик-перемещение: BFS по клеткам + ведение героя по пути ────────
        // Путь — очередь центров соседних клеток; герой движется виртуальными
        // осями (ctrlVI/ctrlVJ — механизм ИИ): работают коллизии-скольжение и
        // походка из character-системы. Клавиши движения путь отменяют.
        function walkable(gx, gy) {
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) return false;
            const ch = MAPROWS[gy][gx];
            // улицы/площадь/земля/мосты/болота — ходибельно; стены, пятна
            // застройки, вода, чащи и горы (W38) — нет
            return ch !== "#" && ch !== "%" && ch !== "~" && ch !== "F" && ch !== "M";
        }
        function bfsPath(sx, sy, tx, ty) {
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
            if (!prev.has(key(tx, ty))) return null; // стена/недостижимо
            const cells = [];
            for (let c = [tx, ty]; c; c = prev.get(key(c[0], c[1]))) cells.push(c);
            cells.reverse();
            return cells.slice(1).map(([cx, cy]) => ({ x: cx * TS + TS / 2, y: cy * TS + TS / 2 }));
        }
        // Путь с доводкой: клик в стену/иконку у стены (например, по
        // подписи «Выход» над лестницей) ведёт героя к ближайшей
        // проходимой клетке в радиусе 2 от цели (просил юзер W22)
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

        // ── Карта из тайлов юзера (набор по данжу, клетка 64) ─────────────
        // Пол — 10 плит (детерминированный хэш клетки, чтобы сейв/перезаход
        // показывали тот же пол). Стены — спрайт по маске соседей: Т-стыки
        // гладкие (wall_h1/wall_v1), углы — wall_cor1-4 (в т.ч. диагональные
        // углы комнат, где все 4 соседа — стены). Маски краёв карты читают
        // соседа ЗА краем как пол — у стен, доросших до края карты, конечные/
        // угловые спрайты. Толща (периметр 3×3 из стен) и рамка по периметру
        // карты не рисуются вовсе (просил юзер: уровень парит в чёрном).
        // Каждая стена получает zIndex по нижней кромке:
        // герой и объекты (y-sort сцены) честно заходят ЗА стены с севера
        // и выходят ВПЕРЕД с юга.
        const FLOORS = 10;
        function hsh(i, j, k) { return ((i * 73856093 ^ j * 19349663 ^ (k || 0) * 83492791) >>> 0) % 1000; }
        function wallTexName(L, R, U, D, dSE, dSW, dNW, dNE) {
            // d* — пол в диагонали. Угол комнаты: все четыре соседа — стены,
            // но пол подходит диагонально; стык угла «смотрит» в его сторону
            // (SE → стыки внизу и справа, и т.д.) — раньше клетка считалась
            // толщей и не рисовалась, в углу был разрыв (просил юзер).
            if (L && R && U && D) {
                if (dSE) return "wall_cor1";
                if (dSW) return "wall_cor2";
                if (dNW) return "wall_cor3";
                if (dNE) return "wall_cor4";
                return "wall_h1"; // недостижимо: толщу отсеивает wallInterior
            }
            // Т-стыки и крест — ГЛАДКИЕ тайлы (просил юзер): колонны-«зубы»
            // h1_tu/h1_td/v1_tl/v1_tr торчали в не рисуемую толщу-пустоту.
            if (L && R) return "wall_h1";
            if (U && D) return "wall_v1";
            if (D && R) return "wall_cor1"; // угол «Г»: стыки внизу и справа
            if (D && L) return "wall_cor2"; // угол «Г»: стыки внизу и слева
            if (U && L) return "wall_cor3"; // угол «Г»: стыки сверху и слева
            if (U && R) return "wall_cor4"; // угол «Г»: стыки сверху и справа
            if (L) return "wall_end1";      // торец: конец справа, стык слева
            if (R) return "wall_end2";      // торец: конец слева, стык справа
            if (U) return "wall_end3";      // торец: тупик снизу, стык сверху
            if (D) return "wall_end4";      // торец: тупик сверху, стык снизу
            return "wall_v1";               // одинокий столб
        }
        function buildMapGfx() {
            const c = new PIXI.Container(); // подложка + пол; стены поверх, с y-sort
            const lair = tileSetOf(myState && myState.cave); // набор тайлов данжа
            const base = new PIXI.Graphics(); // чёрный фон всей карты (просил юзер)
            base.rect(0, 0, W * TS, H * TS);
            base.fill(0x000000);
            c.addChild(base);
            // пол КЛАДЁМ И ПОД СТЕНЫ: у боковых спрайтов (v1/tl/tr) сторона к
            // полу прозрачна нарочно — сквозь неё должен просвечивать пол,
            // а не чёрный фон. В толще и на нерисованых стенах-рамке пола
            // нет — там вообще без тайлов
            // город (W30): пол — варианты поверхности зоны, 2×2 квадрата
            // 32px на клетку 64px, детерминированно по координате
            const city = myState && myState.city;
            const vsheet = city
                ? ctx.worldSheets[CITY_VARIANTS[caveOf(myState.cave).elem] || "dirt"]
                : null;
            // W38: вода реки Мудрости — те же квадраты, но листом воды;
            // под мостами «=» тоже вода, доски моста рисуются поверх
            const wsheet = city ? (ctx.worldSheets.water || null) : null;
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                const ch = MAPROWS[j][i];
                if (ch === "#" && !wallDrawn(i, j)) continue;
                const sheet = (ch === "~" || ch === "=") ? wsheet : vsheet;
                if (sheet && sheet.textures.length) {
                    const texs = sheet.textures;
                    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
                        const sp = new PIXI.Sprite(
                            texs[hsh(i * 2 + sx, j * 2 + sy) % texs.length]);
                        sp.position.set(i * TS + sx * 32, j * TS + sy * 32);
                        c.addChild(sp);
                    }
                    continue;
                }
                const sp = new PIXI.Sprite(uiTex(`dungeon_tiles/${lair}/floor/${hsh(i, j) % FLOORS}.png`));
                sp.position.set(i * TS, j * TS);
                c.addChild(sp);
            }
            // W38: оверлеи стихийных фич города — болота Тлена (swamp.png)
            // и полог чащи Роста (wood.png): те же dual-grid рендеры, что у
            // массивов открытого мира (синтетический ter-слой по state.feat;
            // город ≤ 24×19 — один чанк). Болото проходимо, чаща «F» — нет,
            // но пол/полог под ней рисуются
            if (city && myState.feat) {
                const WT = globalThis.GAME_WORLDTILES, GEN = globalThis.GAME_WORLDGEN;
                const mkTer = (val, chNeed, rects) => {
                    const ter = new Uint8Array(W * H);
                    for (const [x0, y0, x1, y1] of rects)
                        for (let y = y0; y <= y1; y++)
                            for (let x = x0; x <= x1; x++)
                                if (MAPROWS[y][x] === chNeed) ter[y * W + x] = val;
                    return { w: W, h: H, ter };
                };
                if (myState.feat.swamp.length && WT && GEN && ctx.worldSheets.swamp)
                    c.addChild(WT.renderSwampChunk(
                        mkTer(GEN.T.SWAMP, ".", myState.feat.swamp),
                        ctx.worldSheets, TS, 0, 0).container);
                if (myState.feat.forest.length && WT && GEN && ctx.worldSheets.wood)
                    c.addChild(WT.renderForestChunk(
                        mkTer(GEN.T.FOREST, "F", myState.feat.forest),
                        ctx.worldSheets, TS, 0, 0).container);
                // мосты «=»: настил-доски поверх воды (как мосты мира)
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
            return c;
        }
        function addWalls(layer) {
            const lair = tileSetOf(myState && myState.cave); // набор тайлов данжа
            // для ВЫБОРА ТАЙЛА сосед за краем карты — не стена: крайние
            // клетки получают конечные/угловые спрайты и карта «цельная»
            // (просил юзер); коллизию это не трогает — blocked() выше.
            // Толщу (wallInterior) и рамку по периметру карты (wallDrawn)
            // не рисуем вовсе — только стены у пола,
            // никакой заливки-кропов (просил юзер)
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                if (!wallDrawn(i, j)) continue;
                const isW = (x, y) => x >= 0 && y >= 0 && x < W && y < H && MAPROWS[y][x] === "#";
                const isF = (x, y) => !isW(x, y); // «за краем карты» — как пол
                const sp = new PIXI.Sprite(uiTex(`dungeon_tiles/${lair}/walls/${
                    wallTexName(isW(i - 1, j), isW(i + 1, j), isW(i, j - 1), isW(i, j + 1),
                        isF(i + 1, j + 1), isF(i - 1, j + 1), isF(i - 1, j - 1), isF(i + 1, j - 1))
                }.png`));
                sp.anchor.set(0, 1); // левый-низ: низ спрайта — низ своей клетки
                sp.position.set(i * TS, (j + 1) * TS);
                sp.zIndex = (j + 1) * TS - 1;
                layer.addChild(sp);
            }
        }

        // W38: декорации стихийных фич города на слой y-sort (как стены и
        // здания): деревья Силы — ОТДЕЛЬНЫЕ, спрайт 10.png (юзер), внутри и
        // между кварталами, ПРОХОДИМЫ (клетка остаётся полом — как леса
        // открытого мира, герой ходит за кронами); Рост — деревья рощ «F»
        // (набор стихии из worldGen) + редкий разброс; Честь — горные
        // спрайты на клетках массивов «M». Позиция/зеркало — хэш клетки,
        // как у деревьев мира (worldTiles)
        function addCityDeco(layer) {
            if (!myState || !myState.city || !myState.feat) return;
            const f = myState.feat;
            const GEN = globalThis.GAME_WORLDGEN;
            const trees = ctx.treeTex || [];
            if (!trees.length) return;
            // зона отчуждения РАЗБРОСА (рощи «F» руками расставлены вне её):
            // ворота/спавн/двери зданий — чебышёв ≤ 1: деревья не заслоняют
            // лестницу-выход и входы в дома
            const keep = new Set();
            const keep1 = (x, y) => {
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) keep.add((y + dy) * 1000 + x + dx);
            };
            keep1(Math.floor(myState.ladder.x / TS), Math.floor(myState.ladder.y / TS));
            keep1(Math.floor(myState.spawn.x / TS), Math.floor(myState.spawn.y / TS));
            for (const o of myState.objects) keep1(o.col, o.row);
            const strengthSet = [10]; // юзер: деревья города Силы — 10.png
            const groveSet = (GEN && GEN.TREE_SETS && GEN.TREE_SETS.growth) || [10];
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                const ch = MAPROWS[j][i];
                if (ch !== "." && ch !== "F") continue;
                const grove = ch === "F";
                const scatter = (f.trees && hsh(i, j, 11) < 130) // ~13% пола
                    || (myState.elem === "growth" && hsh(i, j, 11) < 70); // ~7%
                if (!grove && !scatter) continue;
                if (!grove && keep.has(j * 1000 + i)) continue;
                const pool = myState.elem === "strength" ? strengthSet : groveSet;
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
            if (myState.elem === "honor" && mtns.length) {
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

        function makeToken(enemy) {
            // иконки юзера (просил юзер): обычные — глаза с кинжалами,
            // босс — огненный череп с золотым ободком (как «здание» магазина)
            const c = new PIXI.Container();
            const boss = !!enemy.boss;
            const shadow = new PIXI.Graphics();
            shadow.circle(0, 0, boss ? 21 : 17);
            shadow.fill({ color: 0x120d09, alpha: 0.55 });
            c.addChild(shadow);
            if (boss) {
                const ring = new PIXI.Graphics();
                ring.circle(0, 0, 25);
                ring.stroke({ width: 2.5, color: 0xcfa94e });
                c.addChild(ring);
            }
            const sp = new PIXI.Sprite(uiTex(boss ? "icon_boss.png" : "icon_enemy.png"));
            sp.anchor.set(0.5);
            sp.scale.set(boss ? 0.62 : 0.5);
            c.addChild(sp);
            c.pivot.set(0, 12); // якорь чуть ниже центра — иконка «стоит» на клетке
            c.position.set(enemy.x, enemy.y + 6);
            c.zIndex = enemy.y + 1;
            return c;
        }

        function makeExit() {
            // спуск — иконка-арка юзера (просил юзер) + прежняя подпись сверху
            const c = new PIXI.Container();
            const shadow = new PIXI.Graphics();
            shadow.circle(0, 0, 21);
            shadow.fill({ color: 0x120d09, alpha: 0.55 });
            c.addChild(shadow);
            const sp = new PIXI.Sprite(uiTex("icon_down.png"));
            sp.anchor.set(0.5);
            sp.scale.set(0.6);
            c.addChild(sp);
            const t = new PIXI.Text({ text: GAME_LOC.t("dungeon.exitLabel"), style: { fontFamily: "Kereru", fontSize: 12, fill: 0xffe9b0 } });
            t.anchor.set(0.5, 1);
            t.position.set(0, -24);
            c.addChild(t);
            c.position.set(G.dungeon.exit.x, G.dungeon.exit.y);
            c.zIndex = G.dungeon.exit.y + 1;
            return c;
        }

        // Лестница наверх у старта этажа: на 1-м этаже это выход из
        // подземелья в открытый мир, глубже — подъём на предыдущий этаж.
        // Триггер — касание героем (как у спуска).
        function makeLadder(st) {
            const c = new PIXI.Container();
            const pad = new PIXI.Graphics();
            pad.roundRect(-17, -17, 34, 34, 6);
            pad.fill(0x4a4136);
            pad.stroke({ width: 2, color: 0x2b2620 });
            c.addChild(pad);
            const g = new PIXI.Graphics(); // тетивы + перекладины
            g.rect(-12, -13, 4, 26);
            g.rect(8, -13, 4, 26);
            g.fill(0x8a6a3f);
            g.rect(-10, -9, 20, 3.5);
            g.rect(-10, -1, 20, 3.5);
            g.rect(-10, 7, 20, 3.5);
            g.fill(0xa07c4c);
            c.addChild(g);
            const t = new PIXI.Text({
                text: GAME_LOC.t(st.floor <= 1 ? "dungeon.ladderExit" : "dungeon.ladder"),
                style: { fontFamily: "Kereru", fontSize: 12, fill: 0xffe9b0 },
            });
            t.anchor.set(0.5, 1);
            t.position.set(0, -20);
            c.addChild(t);
            c.position.set(st.ladder.x, st.ladder.y);
            c.zIndex = st.ladder.y + 1;
            return c;
        }

        // Объект комнаты на карте: иконка юзера (куча/сундук/магазин) на
        // тёмной подложке-тени; у магазина — золотой ободок «здание».
        // Здание города (W34) — спрайт юзера на пятне застройки; W36:
        // рисуется в ПОЛРАЗМЕРА (384×256 → 3×2 клетки, ратуша 384×384 →
        // 3×3) — юзер уменьшил здания и кварталы вдвое.
        function makeObjectNode(obj) {
            const c = new PIXI.Container();
            if (obj.build) {
                const sp = new PIXI.Sprite(uiTex(`buildings/${obj.build}`));
                sp.anchor.set(0.5, 1); // низ-центр: стоит на кромке пятна
                sp.scale.set(0.5); // W36: здание вдвое меньше (пятно 3×2 / 3×3)
                sp.position.set((obj.gx + obj.w / 2) * TS, (obj.gy + obj.h) * TS);
                c.addChild(sp);
                c.zIndex = (obj.gy + obj.h) * TS - 0.5; // y-sort: герой за/перед
                return c;
            }
            const shadow = new PIXI.Graphics();
            shadow.circle(0, 0, 19);
            shadow.fill({ color: 0x120d09, alpha: 0.55 });
            c.addChild(shadow);
            if (obj.type === "shop") {
                const ring = new PIXI.Graphics();
                ring.circle(0, 0, 24);
                ring.stroke({ width: 2.5, color: 0xcfa94e });
                c.addChild(ring);
            }
            if (obj.type === "npc") {
                // Старина Глом (W30): Graphics-силуэт (портрет юзера —
                // в окне диалога), золотое кольцо как у магазина
                const ring = new PIXI.Graphics();
                ring.circle(0, 0, 24);
                ring.stroke({ width: 2.5, color: 0xcfa94e });
                c.addChild(ring);
                const hood = new PIXI.Graphics();
                hood.circle(0, -8, 10); // капюшон
                hood.fill(0x5a4632);
                hood.roundRect(-9, -2, 18, 16, 6); // плечи-плащ
                hood.fill(0x5a4632);
                hood.circle(0, -7, 5.5); // лицо-тень
                hood.fill(0x241a10);
                c.addChild(hood);
                c.position.set(obj.col * TS + TS / 2, obj.row * TS + TS / 2);
                c.zIndex = (obj.row + 1) * TS;
                return c;
            }
            const tex = obj.type === "gold" ? "icon_gold.png"
                : obj.type === "chest" ? "icon_bag.png"
                : obj.type === "map" ? "icon_map.png" : "icon_shop.png";
            const sp = new PIXI.Sprite(uiTex(tex));
            sp.anchor.set(0.5);
            sp.scale.set(obj.type === "shop" ? 0.62 : 0.5);
            c.addChild(sp);
            c.position.set(obj.col * TS + TS / 2, obj.row * TS + TS / 2);
            c.zIndex = (obj.row + 1) * TS; // y-sort в пикселях, как у стен/героя
            return c;
        }

        function removeObjectNode(obj) {
            const i = objNodes.findIndex((n) => n.obj === obj);
            if (i >= 0) {
                objNodes[i].node.destroy({ children: true });
                objNodes.splice(i, 1);
            }
        }

        // Глом выходит из-за дома (W34): AnimatedSprite листа glom_256
        // (арт юзера, 4 ряда × 6 кадров), тот же контроллер персонажа,
        // что у героя и отрядов мира — ходьба и развороты сами
        function spawnGlom(gl) {
            const sheet = (creatureSheets && creatureSheets.glom)
                || ctx.heroSheets.strength;
            glomNode = new PIXI.AnimatedSprite(sheet.animations.walk_front, false);
            glomNode.anchor.set(0.5, 1);
            glomNode.scale.set(0.375); // как герой — ~96px
            glomShadow = new PIXI.Graphics();
            glomShadow.ellipse(0, 0, 15, 6.5);
            glomShadow.fill({ color: 0x120d09, alpha: 0.45 });
            layer.addChild(glomShadow);
            layer.addChild(glomNode);
            glomId = characters.spawn({
                x: gl.x, y: gl.y, sprite: glomNode, anims: sheet.animations,
                speed: 200, fps: sheet.fps, halfW: 8, halfH: 6,
            });
            ECS.addComponent(world, glomId, "ctrlVI", 0);
            ECS.addComponent(world, glomId, "ctrlVJ", 0);
            glomNode.zIndex = gl.y;
            glomShadow.position.set(gl.x, gl.y - 4.5);
            glomShadow.zIndex = gl.y - 0.5;
        }

        // Иконка-кнопка HUD (настройки/колода): спрайт-иконка без подписи
        function hudIcon(texName, x, y, onTap, scale = 0.9) {
            const sp = new PIXI.Sprite(uiTex(texName));
            sp.anchor.set(0.5);
            sp.scale.set(scale);
            sp.eventMode = "static";
            sp.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap(); });
            const c = new PIXI.Container();
            c.position.set(x, y);
            c.addChild(sp);
            // жёлтое свечение при наведении — правило UI для кнопок (W22)
            globalThis.GAME_UI.addGlow(ctx, c, sp.width * 1.15, sp.height * 1.15);
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
            const floorT = new PIXI.Text({ text: "", style: hudStyle });
            floorT.anchor.set(0.5, 0);
            floorT.position.set(960, 12); // по середине экрана (просил юзер)
            c.addChild(floorT);
            // золото — мета-ресурс забега: около верхнего левого угла
            // (просил юзер), без плашки
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
            // ресурсы стихий (W40, просил юзер): как в мире — иконки+числа
            // правее золота; кузница города тратит их (3 → бустер)
            const resStyle = { fontFamily: "Kereru", fontSize: 22,
                fill: 0xf3e6c2, stroke: { color: 0x1c1207, width: 4 } };
            const resT = {};
            let rx = 150;
            for (const e of globalThis.GAME_SIDEQ.RES_ELEMS) {
                const icon = new PIXI.Sprite(uiTex(`resources/res_${e}.png`));
                icon.anchor.set(0.5);
                icon.scale.set(0.4);
                icon.position.set(rx + 14, 18);
                goldPlate.addChild(icon);
                const num = new PIXI.Text({ text: "0", style: resStyle });
                num.position.set(rx + 32, 6);
                goldPlate.addChild(num);
                resT[e] = num;
                rx += 64;
            }
            // активный квест сюжетной линии (просил юзер): иконка правее
            // ресурсного ряда открывает текст задания; без квестов иконки нет
            if (G.quests && G.quests.active) {
                goldPlate.addChild(hudIcon("icon_rune.png", rx + 16, 17, () => {
                    globalThis.GAME_QUESTS.showReview(ctx);
                }, 0.75));
            }
            c.addChild(goldPlate);
            // настройки доступны и из подземелья; «Назад» вернёт сюда.
            // Колода — только по карте героя (просил юзер): карта под золотом
            c.addChild(hudIcon("icon_setting.png", 1839, 66, () => {
                G.uiReturn = "dungeon";
                scenes.go("settings");
            }));
            // карточка героя (просил юзер): под иконкой золота, клик —
            // в колоду, наведение — рост до натурального размера (ctx.heroHover)
            const dHero = globalThis.GAME_DATA.HEROES[G.heroId]
                || globalThis.GAME_DATA.HEROES.gorbag;
            const heroHolder = new PIXI.Container();
            heroHolder.position.set(58, 76);
            heroHolder.hitArea = new PIXI.Rectangle(-57.5, 0, 115, 169); // 115×169
            const heroCard = new PIXI.Sprite(uiTex(`heroes/${dHero.img}.png`));
            heroCard.anchor.set(0.5, 0);
            heroCard.scale.set(0.5); // 230×338 → 115×169
            heroCard.eventMode = "none";
            heroHolder.addChild(heroCard);
            heroHolder.on("pointertap", () => {
                if (ctx.sfx) ctx.sfx();
                G.uiReturn = "dungeon";
                scenes.go("deck");
            });
            ctx.heroHover(heroHolder, heroCard, 115, 0); // большой вид целиком на экране
            c.addChild(heroHolder);
            const hint = new PIXI.Text({
                text: GAME_LOC.t("dungeon.hint"),
                style: { fontFamily: "Kereru", fontSize: 22, fill: 0xbfae87 },
            });
            hint.anchor.set(0.5, 0);
            hint.position.set(960, 1050);
            c.addChild(hint);
            const toast = new PIXI.Text({
                text: "", style: { fontFamily: "Kereru", fontSize: 39, fill: 0xffe2a8,
                stroke: { color: 0x1c1207, width: 7.5 } },
            });
            toast.anchor.set(0.5, 0.5);
            toast.position.set(960, 495);
            toast.alpha = 0;
            c.addChild(toast);
            c.userData = { floorT, goldT, resT, toast };
            return c;
        }

        function showToast(text) {
            G.dungeon.toast = text;
            G.dungeon.toastT = 2.2;
        }

        // ── Подсказка на врага (наведение курсором): имя энкаунтера + краткое
        // описание его колоды (состав с копиями) и HP базы. Панель живёт в
        // ui-слое (дизайн-координаты) и каждый кадр следует за жетоном —
        // камера может двигаться. Показывает pointermove по клик-зоне карты:
        // жетоны врагов НЕ интерактивны, чтобы не съедать клики движения.
        let tip = null; // { enemy, node, h }
        function deckSummary(enemy) {
            // колода хранится в враге (кидается при генерации этажа); для
            // врагов из старых сейвов — генерим от этажа подземелья
            const deck = enemy.deck
                || globalThis.GAME_DATA.enemyDeck(enemy.enc, G.dungeon ? G.dungeon.floor : 1);
            const counts = new Map();
            for (const id of deck) counts.set(id, (counts.get(id) || 0) + 1);
            return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([id, n]) => `${n}× ${GAME_LOC.t("card." + id + ".name")}`).join(", ");
        }
        function showTip(enemy) {
            if (tip && tip.enemy === enemy) return;
            hideTip();
            const enc = globalThis.GAME_DATA.ENCOUNTERS[enemy.enc] || globalThis.GAME_DATA.ENCOUNTERS.gob;
            const node = new PIXI.Container();
            node.eventMode = "none";
            const title = new PIXI.Text({
                text: GAME_LOC.t("enc." + enemy.enc + ".title"),
                style: { fontFamily: "Kereru", fontSize: 24, fill: 0xffe9b0 },
            });
            const hpLine = new PIXI.Text({
                text: GAME_LOC.t("dungeon.tipBase", { n: enc.baseHp }),
                style: { fontFamily: "Kereru", fontSize: 18, fill: 0xff9c8c },
            });
            const deck = new PIXI.Text({
                text: GAME_LOC.t("dungeon.tipDeck") + ": " + deckSummary(enemy),
                style: { fontFamily: "Kereru", fontSize: 18, fill: 0xd8c79d,
                    wordWrap: true, wordWrapWidth: 336, breakWords: true },
            });
            const w = 372, pad = 15;
            const h = pad + title.height + 4 + hpLine.height + 6 + deck.height + pad;
            const g = new PIXI.Graphics();
            g.roundRect(0, 0, w, h, 12);
            g.fill({ color: 0x171310, alpha: 0.94 });
            g.stroke({ width: 3, color: 0x6b5c40 });
            title.position.set(pad, pad);
            hpLine.position.set(pad, pad + title.height + 4);
            deck.position.set(pad, pad + title.height + 8 + hpLine.height);
            node.addChild(g, title, hpLine, deck);
            ctx.ui.addChild(node);
            tip = { enemy, node, h };
        }
        function hideTip() {
            if (!tip) return;
            tip.node.destroy({ children: true });
            tip = null;
        }
        function hoverCheck(p) {
            if (!G.dungeon) { hideTip(); return; }
            let best = null, bd = 1e9;
            for (const e of G.dungeon.enemies) {
                if (!e.alive) continue;
                const d = Math.hypot(e.x - p.x, e.y - p.y);
                if (d < (e.boss ? 34 : 26) && d < bd) { best = e; bd = d; }
            }
            if (best) showTip(best); else hideTip();
        }

        // ── Окна интерактивных объектов: куча золота, сундук, магазин ──────
        // Модалка в ui-слое; пока окно открыто, герой стоит (update глушит
        // оси и триггеры). Забор золота/карты и покупки сохраняются сразу.
        function countInDeck(id) {
            return G.deck.reduce((n, c) => n + (c === id ? 1 : 0), 0);
        }

        function closeModal() {
            if (winNode) { winNode.destroy({ children: true }); winNode = null; }
            winRefs = null;
            winObj = null;
            sellRows = [];
            refreshShop = null;
            shopZoomHook = null;
            if (G.dungeon) G.dungeon.win = null;
        }

        function openObject(o) {
            path = null;
            winObj = o;
            if (o.type === "npc") {
                // Старина Глом (W30): окно квеста; объект не «тратится»,
                // повторный разговор после отхода — снова у Глома
                o.cool = true;
                globalThis.GAME_QUESTS.talkTo(ctx);
                return;
            }
            if (o.type === "glomHouse") {
                // дом Глома (W34): декорация — Глом сам подходит к герою
                // (квестовая сценка)
                o.cool = true;
                showToast(GAME_LOC.t("world.soon"));
                winObj = null;
                return;
            }
            if (o.type === "armory" || o.type === "townHall") {
                // кузница и ратуша (W40, просил юзер): крафт бустеров из
                // ресурсов стихии города; побочные квесты города
                o.cool = true;
                G.dungeon.win = { idx: G.dungeon.objects.indexOf(o) };
                winNode = o.type === "armory"
                    ? buildForgeWin(o) : buildQuestWin(o);
                ctx.ui.addChild(winNode);
                return;
            }
            G.dungeon.win = { idx: G.dungeon.objects.indexOf(o) };
            winNode = o.type === "shop" ? buildShopWin(o)
                : o.type === "map" ? buildMapWin(o) : buildLootWin(o);
            ctx.ui.addChild(winNode);
        }

        // Карта сокровищ: окно-приглашение на драфт. «Начать драфт» уводит
        // в мини-игру (G.draft хранит номер объекта — после боя он уйдёт);
        // «Уйти» — объект остаётся, можно передумать (cool до отхода).
        function buildMapWin(o) {
            const t = GAME_LOC.t;
            const { T, button } = globalThis.GAME_UI;
            const c = new PIXI.Container();
            c.eventMode = "static";
            const dim = new PIXI.Graphics();
            // дим с запасом за 1920×1080: накрыть поля letterbox — мир
            // рисуется на весь канвас, и без этого справа остаётся светлая
            // незатенённая полоса (просил юзер)
            dim.rect(-3000, -2000, 7920, 5080);
            dim.fill({ color: 0x000000, alpha: 0.55 });
            c.addChild(dim);
            const w = 760, h = 560, top = 540 - h / 2;
            const panel = new PIXI.Graphics();
            panel.roundRect(960 - w / 2, top, w, h, 18);
            panel.fill({ color: 0x171310, alpha: 0.96 });
            panel.stroke({ width: 4, color: 0x6b5c40 });
            c.addChild(panel);
            const title = T(t("obj.map"), 44, 0xf0c96a,
                { stroke: { color: 0x241505, width: 8 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, top + 26);
            title.eventMode = "none";
            c.addChild(title);
            const icon = new PIXI.Sprite(uiTex("icon_map.png"));
            icon.anchor.set(0.5);
            icon.scale.set(1.0);
            icon.position.set(960, top + 160);
            c.addChild(icon);
            const sub = T(t("obj.mapDesc"), 26, 0xd8c79d,
                { wordWrap: true, wordWrapWidth: w - 110, align: "center" });
            sub.anchor.set(0.5, 0);
            sub.position.set(960, top + 250);
            sub.eventMode = "none";
            c.addChild(sub);
            const startBtn = button(ctx, {
                tex: "button_menu.png", label: t("obj.startDraft"),
                x: 960, y: top + h - 70, scale: 1,
                onTap: () => startDraft(o),
            });
            c.addChild(startBtn);
            const leaveBtn = button(ctx, {
                tex: "button_menu.png", label: t("shop.leave"), x: 165, y: 78, scale: 1,
                onTap: () => { o.cool = true; closeModal(); },
            });
            c.addChild(leaveBtn);
            winRefs = { takeBtn: null, startBtn, leaveBtn };
            return c;
        }

        // ── Кузница города (W40, просил юзер): бустер из 3 ресурсов стихии
        // города; вскрытие — 3 обычные + 2 редкие + 1 эпическая карта стихии
        // в коллекцию (dataCards.boosterCards). Арт бустера юзера
        // images/resources/buster_<стихия>.png. Ресурсы/бустеры — в сейве
        function buildForgeWin(o) {
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
                onTap: () => { o.cool = true; closeModal(); },
            });
            c.addChild(leaveBtn);
            function refresh() {
                resT.text = t("forge.res",
                    { name: resName, n: G.resources[elem] || 0 });
                boostT.text = t("forge.boosters",
                    { n: G.boosters[elem] || 0 });
            }
            function craft() {
                if ((G.resources[elem] || 0) < 3) {
                    needT.text = t("forge.need", { name: resName });
                    needT.alpha = 1;
                    if (ctx.sfx) ctx.sfx();
                    return;
                }
                G.resources[elem] -= 3;
                G.boosters[elem] = (G.boosters[elem] || 0) + 1;
                needT.alpha = 0;
                refresh();
                if (ctx.sfx) ctx.sfx("up");
                if (G.saveRun) G.saveRun();
            }
            // вскрытие: карты сразу в коллекцию (как награда W32), лица —
            // рядом с ховер-зумом; окно меняется на просмотр добычи
            function openBooster() {
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
                winNode.destroy({ children: true });
                winNode = forgeReward(cards);
                ctx.ui.addChild(winNode);
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
                    onTap: () => { o.cool = true; closeModal(); },
                });
                rc.addChild(lv);
                winRefs = { leaveBtn: lv, forge: null }; // окно сменилось
                return rc;
            }
            refresh();
            winRefs = { leaveBtn, forge: {
                tap: (w) => (w === "craft" ? craft() : openBooster()),
                state: () => ({ elem, res: G.resources[elem] || 0,
                    boosters: G.boosters[elem] || 0,
                    resT: resT.text, boostT: boostT.text,
                    need: needT.alpha > 0.5, needText: needT.text }),
            } };
            return c;
        }

        // ── Ратуша города (W40, просил юзер): побочные квесты. Подход к
        // ратуше — окно с описанием, наградой и кнопками «Принять»/
        // «Отказаться». Выполненные квесты не возобновляются (model/accept —
        // sidequests.js); «охота» спавнит монстра у города, «письмо»
        // выбирает город-адресат
        function buildQuestWin(o) {
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
                onTap: () => { o.cool = true; closeModal(); },
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
                winRefs = { leaveBtn, quest: null };
                return c;
            }
            const m = SQ.model(G, poi);
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
                    closeModal();
                    showToast(q.type === "hunt"
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
                    onTap: () => { o.cool = true; closeModal(); },
                });
                c.addChild(declineBtn);
                winRefs = { leaveBtn: declineBtn, quest: {
                    state: () => ({ mode: m.mode, type: m.type,
                        name: name.text, text: body.text, reward: rew.text }),
                    accept: acceptTap,
                } };
            }
            // taken/done: «Уйти» остаётся, принять нечего (offer выше
            // уже назначил winRefs с accept)
            if (!winRefs || !winRefs.quest) winRefs = { leaveBtn, quest: {
                state: () => ({ mode: m.mode, type: m.type || null,
                    name: name.text, text: body.text, reward: rew.text }),
                accept: () => {},
            } };
            return c;
        }

        function startDraft(o) {
            closeModal();
            G.draft = { picks: [], ePicks: [], objIdx: G.dungeon.objects.indexOf(o) };
            // квест «Дно» (W30): участие в драфте — галочка чек-листа
            if (globalThis.GAME_QUESTS) globalThis.GAME_QUESTS.markDraft(G);
            if (ctx.sfx) ctx.sfx();
            scenes.go("draft");
        }

        // Куча золота и сундук: сумма и карта кинуты при генерации этажа —
        // окно показывает заготовленное (переживает сейв/загрузку).
        function buildLootWin(o) {
            const t = GAME_LOC.t;
            const { T, button, cardFace } = globalThis.GAME_UI;
            const chest = o.type === "chest";
            const c = new PIXI.Container();
            c.eventMode = "static";
            const dim = new PIXI.Graphics();
            dim.rect(-3000, -2000, 7920, 5080);
            dim.fill({ color: 0x000000, alpha: 0.55 });
            c.addChild(dim);
            const w = 640, h = chest ? 720 : 400, top = 540 - h / 2;
            const panel = new PIXI.Graphics();
            panel.roundRect(960 - w / 2, top, w, h, 18);
            panel.fill({ color: 0x171310, alpha: 0.96 });
            panel.stroke({ width: 4, color: 0x6b5c40 });
            c.addChild(panel);
            const title = T(t(chest ? "obj.chest" : "obj.gold"), 44, 0xf0c96a,
                { stroke: { color: 0x241505, width: 8 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, top + 26);
            title.eventMode = "none";
            c.addChild(title);
            if (chest) {
                const sub = T(t("obj.chestFound"), 27, 0xd8c79d);
                sub.anchor.set(0.5, 0);
                sub.position.set(960, top + 102);
                sub.eventMode = "none";
                c.addChild(sub);
                const card = cardFace(ctx, o.card, { scale: 0.62 });
                card.position.set(960, top + 350);
                c.addChild(card);
            } else {
                const icon = new PIXI.Sprite(uiTex("icon_gold.png"));
                icon.anchor.set(0.5);
                icon.scale.set(1.1);
                icon.position.set(960, top + 170);
                c.addChild(icon);
                const sub = T(t("obj.goldFound", { n: o.amount }), 40, 0xffe2a8,
                    { stroke: { color: 0x1c1207, width: 7 } });
                sub.anchor.set(0.5, 0);
                sub.position.set(960, top + 250);
                sub.eventMode = "none";
                c.addChild(sub);
            }
            const takeBtn = button(ctx, {
                tex: "button_menu.png", label: t(chest ? "obj.takeCard" : "obj.take"),
                x: 960, y: top + h - 70, scale: 1,
                onTap: () => {
                    if (chest) {
                        G.collection[o.card] = (G.collection[o.card] || 0) + 1;
                        G.persistMeta(); // коллекция + колоды героев/захваты (модульное хранилище)
                    } else {
                        G.gold += o.amount;
                    }
                    o.taken = true;
                    removeObjectNode(o);
                    if (ctx.sfx) ctx.sfx("coins");
                    if (G.saveRun) G.saveRun();
                    closeModal();
                },
            });
            c.addChild(takeBtn);
            winRefs = { takeBtn };
            return c;
        }

        function shopBuy(i) {
            const { CARDS, SHOP_BUY } = globalThis.GAME_DATA;
            const o = winObj;
            if (!o || o.type !== "shop" || !o.stock[i] || (o.sold && o.sold[i])) return false;
            const price = SHOP_BUY[CARDS[o.stock[i]].rarity];
            if (G.gold < price) return false; // не хватает золота — товар не продаётся
            G.gold -= price;
            G.collection[o.stock[i]] = (G.collection[o.stock[i]] || 0) + 1;
            o.sold[i] = true;
            G.persistMeta(); // коллекция + колоды героев/захваты (модульное хранилище)
            if (G.saveRun) G.saveRun();
            if (ctx.sfx) ctx.sfx("coins");
            if (refreshShop) refreshShop();
            return true;
        }

        // весь запас карт игрока: коллекция — полный реестр копий, колода
        // вложена в него. Продажа не должна уронить запас ниже нормы
        // спуска с текущего этажа (просил юзер)
        function ownedTotal() {
            let n = 0;
            for (const k in G.collection) n += G.collection[k] || 0;
            return n;
        }
        function sellLocked() {
            return ownedTotal() - 1 < deckNeed(G.dungeon ? G.dungeon.floor : 1);
        }

        function shopSell(id) {
            const { CARDS, SHOP_SELL } = globalThis.GAME_DATA;
            if (!winObj || winObj.type !== "shop") return false;
            // продаются только свободные копии: вложенные в колоду не трогаем
            if ((G.collection[id] || 0) - countInDeck(id) <= 0) return false;
            if (sellLocked()) return false;
            G.collection[id] -= 1;
            G.gold += SHOP_SELL[CARDS[id].rarity];
            G.persistMeta(); // коллекция + колоды героев/захваты (модульное хранилище)
            if (G.saveRun) G.saveRun();
            if (ctx.sfx) ctx.sfx("coins");
            if (refreshShop) refreshShop();
            return true;
        }

        function buildShopWin(o) {
            const t = GAME_LOC.t;
            const { CARDS, SHOP_BUY, SHOP_SELL } = globalThis.GAME_DATA;
            const { T, button, cardFace, scrollPane, cardZoomer } = globalThis.GAME_UI;
            const c = new PIXI.Container();
            // правило UI: наведение на карту — копия растёт до полного
            // размера спрайта (host — окно магазина, не скролл-панель)
            const zoomer = cardZoomer(ctx, { host: c });
            c.eventMode = "static";
            const dim = new PIXI.Graphics();
            dim.rect(-3000, -2000, 7920, 5080);
            dim.fill({ color: 0x000000, alpha: 0.65 });
            c.addChild(dim);
            const title = T(t("obj.shop"), 51, 0xf0c96a, { stroke: { color: 0x241505, width: 9 } });
            title.anchor.set(0.5, 0);
            title.position.set(960, 21);
            title.eventMode = "none";
            c.addChild(title);
            // золото — живой счётчик справа сверху (обновляется при покупках)
            const goldIcon = new PIXI.Sprite(uiTex("icon_gold.png"));
            goldIcon.anchor.set(0.5);
            goldIcon.scale.set(0.62);
            goldIcon.position.set(1826, 66);
            goldIcon.eventMode = "none";
            c.addChild(goldIcon);
            const goldT = T(String(G.gold), 34, 0xffe2a8, { stroke: { color: 0x1c1207, width: 6 } });
            goldT.anchor.set(1, 0.5);
            goldT.position.set(1798, 66);
            goldT.eventMode = "none";
            c.addChild(goldT);

            // левая панель: товары (6 карт 3×2), клик — купить
            const left = new PIXI.Graphics();
            left.roundRect(72, 129, 645, 888, 15);
            left.fill({ color: 0x171310, alpha: 0.92 });
            left.stroke({ width: 3, color: 0x6b5c40 });
            c.addChild(left);
            const goodsH = T(t("shop.goods"), 30, 0xf3e6c2);
            goodsH.position.set(99, 138);
            goodsH.eventMode = "none";
            c.addChild(goodsH);
            const goodsBox = new PIXI.Container();
            goodsBox.position.set(90, 200);
            c.addChild(goodsBox);
            const buyHint = T(t("shop.buyHint"), 19, 0x8a7c5e, { wordWrap: true, wordWrapWidth: 590 });
            buyHint.position.set(99, 946);
            buyHint.eventMode = "none";
            c.addChild(buyHint);

            // правая панель: продажа карт из коллекции (клик по карте)
            const right = new PIXI.Graphics();
            right.roundRect(762, 129, 1086, 888, 15);
            right.fill({ color: 0x171310, alpha: 0.92 });
            right.stroke({ width: 3, color: 0x6b5c40 });
            c.addChild(right);
            const sellH = T(t("shop.sellTitle"), 30, 0xf3e6c2);
            sellH.position.set(789, 138);
            sellH.eventMode = "none";
            c.addChild(sellH);
            const sellPane = scrollPane(ctx, { x: 780, y: 195, w: 1050, h: 768, onScroll: () => zoomer.hide(false) });
            c.addChild(sellPane.node);
            const sellHint = T(t("shop.sellHint"), 19, 0x8a7c5e, { wordWrap: true, wordWrapWidth: 1035 });
            sellHint.position.set(786, 972);
            sellHint.eventMode = "none";
            c.addChild(sellHint);
            const noGoldRef = { node: null };

            function buildGoods() {
                goodsBox.removeChildren().forEach((ch) => ch.destroy({ children: true }));
                const nodes = [];
                o.stock.forEach((id, i) => {
                    const col = i % 3, rowI = (i / 3) | 0;
                    const cx = 93 + col * 198, cy = 100 + rowI * 307.5;
                    const sold = !!(o.sold && o.sold[i]);
                    const price = SHOP_BUY[CARDS[id].rarity];
                    const card = cardFace(ctx, id, { scale: 0.5, dim: sold });
                    card.position.set(cx, cy);
                    card.eventMode = "static";
                    card.on("pointertap", () => { if (!shopBuy(i)) flashNoGold(); });
                    // правило UI: копия растёт до полного размера (позиция
                    // в окне — goodsBox смещён на 90,200)
                    card.on("pointerover", () => zoomer.show(id, 90 + cx, 200 + cy, card));
                    card.on("pointerout", () => zoomer.hide(false));
                    goodsBox.addChild(card);
                    const lbl = T(sold ? t("shop.soldOut") : t("shop.price", { n: price }),
                        21, sold ? 0x8a7c5e : 0xffe2a8);
                    lbl.anchor.set(0.5, 0);
                    lbl.position.set(cx, cy + 138);
                    lbl.eventMode = "none";
                    goodsBox.addChild(lbl);
                    nodes[i] = card;
                });
                return nodes;
            }
            function buildSellList() {
                const c2 = new PIXI.Container();
                const rows = [];
                // показываем только ПРОДАВАЕМОЕ: копии сверх вложенных в
                // колоду (просил юзер) — карты, целиком лежащие в колоде,
                // в списке нет, счётчик ×N — без колодных копий
                const ids = Object.keys(CARDS)
                    .filter((id) => (G.collection[id] || 0) - countInDeck(id) > 0)
                    .sort((a, b) => (CARDS[a].cost - CARDS[b].cost) || a.localeCompare(b));
                ids.forEach((id, i) => {
                    const col = i % 5, rowI = (i / 5) | 0;
                    const free = (G.collection[id] || 0) - countInDeck(id);
                    const canSell = !sellLocked();
                    const cx = 93 + col * 198, cy = 138 + rowI * 307.5;
                    const card = cardFace(ctx, id, { scale: 0.5, dim: !canSell });
                    card.position.set(cx, cy);
                    card.eventMode = "static";
                    if (canSell) card.on("pointertap", () => { shopSell(id); });
                    // правило UI: копия растёт до полного размера; позиция
                    // в окне — контент панели (780,195) с поправкой на скролл
                    card.on("pointerover", () => {
                        const st = sellPane.state;
                        const iy = -st.t * Math.max(0, st.contentH - st.viewH);
                        zoomer.show(id, 780 + cx, 195 + cy + iy, card);
                    });
                    card.on("pointerout", () => zoomer.hide(false));
                    c2.addChild(card);
                    const lbl = T(`×${free} · ${t("shop.price", { n: SHOP_SELL[CARDS[id].rarity] })}`,
                        19, canSell ? 0xd8c79d : 0x8a7c5e);
                    lbl.anchor.set(0.5, 0);
                    lbl.position.set(cx, cy + 138);
                    lbl.eventMode = "none";
                    c2.addChild(lbl);
                    rows.push({ id, node: card, canSell });
                });
                if (!ids.length) {
                    const empty = T(t("shop.sellEmpty"), 22, 0x8a7c5e);
                    empty.position.set(93, 36);
                    empty.eventMode = "none";
                    c2.addChild(empty);
                }
                const rowsN = Math.ceil(ids.length / 5);
                c2.userData = { contentH: ids.length ? (138 + (rowsN - 1) * 307.5 + 232.5) : 60, rows };
                return c2;
            }
            function flashNoGold() {
                if (noGoldRef.node) return;
                const n = T(t("shop.noGold"), 30, 0xff8f6e, { stroke: { color: 0x1c1207, width: 6 } });
                n.anchor.set(0.5);
                n.position.set(394, 920); // над подсказкой левой панели
                n.eventMode = "none";
                c.addChild(n);
                noGoldRef.node = n;
                ctx.scheduler.after(1.2, () => {
                    if (noGoldRef.node) { noGoldRef.node.destroy(); noGoldRef.node = null; }
                });
            }
            // живое обновление окна при покупке/продаже (зовут shopBuy/shopSell
            // со уровня сцены — пишем в внешнюю переменную, не локальную).
            // goodsNodes перечитываем: карточки пересобраны, старые узлы мертвы
            shopZoomHook = () => zoomer.state(); // тесты: ховер-зум карт
            refreshShop = function () {
                zoomer.hide(true); // карточки пересобраны — старый зум мимо
                goldT.text = String(G.gold);
                // нижняя подсказка правой панели объясняет блокировку продажи
                const locked = sellLocked();
                sellHint.text = locked
                    ? t("shop.sellNeed", { n: deckNeed(G.dungeon ? G.dungeon.floor : 1) })
                    : t("shop.sellHint");
                sellHint.style.fill = locked ? 0xff8f6e : 0x8a7c5e;
                winRefs.goodsNodes = buildGoods();
                const list = buildSellList();
                sellPane.setContent(list, list.userData.contentH);
                sellRows = list.userData.rows;
            };

            const goodsNodes = buildGoods();
            const firstList = buildSellList();
            sellPane.setContent(firstList, firstList.userData.contentH);
            sellRows = firstList.userData.rows;

            const leaveBtn = button(ctx, {
                tex: "button_menu.png", label: t("shop.leave"), x: 165, y: 78, scale: 1,
                onTap: () => {
                    o.cool = true; // повторное открытие — только после отхода
                    closeModal();
                },
            });
            c.addChild(leaveBtn);
            winRefs = { takeBtn: null, leaveBtn, goodsNodes };
            return c;
        }

        return {
            enter() {
                if (ctx.music) ctx.music("dungeon");
                // сейв другой геометрии (v≠MAP_V) — этаж пересобирается; сейвы
                // до вторых данжей жили в гоблинских пещерах
                if (!G.dungeon || G.dungeon.v !== MAP_V)
                    G.dungeon = newDungeonState(G.run.cave, G.run.floor);
                if (!G.dungeon.cave) G.dungeon.cave = "gob";
                // город другой планировки (cityV старше W34) — пересобирается
                // по новым правилам; floors данжей это не задевает
                if (G.dungeon.city && G.dungeon.cityV !== CITY_V)
                    G.dungeon = newCityState(G.dungeon.elem || "strength",
                        !!G.dungeon.isCapital);
                const st = G.dungeon;
                myState = st;
                MAPROWS = st.rows || ROWS; // активная раскладка этажа
                W = MAPROWS[0].length; H = MAPROWS.length; // город шире/выше данжа
                ctx.collide.rows = MAPROWS; // коллизии героя — по карте этажа
                ctx.collide.ts = TS; // клетка этажа — 64px (тайлы данжа)
                // сейв стоя на лестнице не должен мгновенно поднимать героя
                if (st.ladder && st.heroPos
                    && Math.hypot(st.ladder.x - st.heroPos.x, st.ladder.y - st.heroPos.y) < TS * 0.9) {
                    st.heroPos = { ...st.spawn };
                }
                // сейвы старых волн без объектов — генерируются при заходе
                if (!st.objects) { st.objects = genObjects(st.floor, st.cave, st.lootCenters || st.roomCenters); st.win = null; }
                for (const o of st.objects)
                    if (o.type === "shop" && !o.sold) o.sold = [false, false, false, false, false, false];
                // сейвы до «объектов вне стартовой комнаты»: в стартовой
                // комнате героя объектов больше не бывает — выкидываем.
                // У города своих комнат нет (здания в кварталах) — не трогаем
                if (!st.city && st.roomCenters && st.roomCenters.length) {
                    const [sc, sr] = st.roomCenters[0];
                    const n0 = st.objects.length;
                    st.objects = st.objects.filter((o) => o.col !== sc || o.row !== sr);
                    if (st.objects.length !== n0) st.win = null;
                }
                // (пересадка врагов «до волны в коридорах» удалена: этажи
                // v5 генерируются с врагами уже в узких проходах — см. genMap)
                // сейвы до волны «лестница наверх»: старт и лестница
                // восстанавливаются из карты этажа
                if (!st.spawn) {
                    for (let j = 0; j < H; j++) {
                        const i = MAPROWS[j].indexOf("H");
                        if (i >= 0) st.spawn = { x: i * TS + TS / 2, y: j * TS + TS / 2 };
                    }
                }
                if (!st.ladder && st.spawn) st.ladder = { x: st.spawn.x, y: st.spawn.y - TS };
                if (st.city) {
                    // город (W30): страховки сейвов — торговец без sold,
                    // врагов в городе нет и не будет
                    st.enemies = [];
                    for (const o of st.objects)
                        if (o.type === "shop" && !o.sold)
                            o.sold = [false, false, false, false, false, false];
                } else if (globalThis.GAME_QUESTS) {
                    globalThis.GAME_QUESTS.noteFloor(G, st.floor); // «Дно»: галочка дна
                }
                closeModal(); // окно объекта не переживает уход из сцены
                // Глом (W34): сцена переехала — он снова за домом
                if (st.city && st.glom && st.glomHome) {
                    st.glom.state = "hidden";
                    st.glom.x = st.glomHome.x;
                    st.glom.y = st.glomHome.y;
                    glomId = null; glomNode = null; glomShadow = null;
                    glomPath = null;
                }
                layer = new PIXI.Container();
                layer.sortableChildren = true;
                // клик-зона на всю карту (ниже всех — рисуется прозрачной):
                // клик по полу = построить путь и идти
                const zone = new PIXI.Graphics();
                zone.rect(0, 0, W * TS, H * TS);
                zone.fill({ color: 0xffffff, alpha: 0.001 });
                zone.eventMode = "static";
                zone.on("pointertap", (e) => {
                    if (heroId === null) return;
                    const p = zone.toLocal(e.global); // мировые координаты (камера учтена)
                    const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                    const next = pathTo(Math.floor(hx / TS), Math.floor(hy / TS),
                        Math.floor(p.x / TS), Math.floor(p.y / TS));
                    if (next) { // в стену/сам в себя — не идём
                        path = next;
                        // след клика: кольцо в КОНЦЕ пути (просил юзер W22)
                        // + точки маршрута волной к нему
                        const last = next[next.length - 1];
                        globalThis.GAME_UI.pathFx(ctx, {
                            layer: pathLayer, x: last.x, y: last.y,
                            points: next.slice(0, -1),
                        });
                    }
                });
                zoneRef = zone; // тест-хук clickAt
                // наведение на врага — подсказка (имя + колода); ушли — скрыть
                zone.on("pointermove", (e) => hoverCheck(zone.toLocal(e.global)));
                zone.on("pointerout", () => hideTip());
                layer.addChild(zone);
                layer.addChild(buildMapGfx()); // подложка + пол (zIndex 0)
                addWalls(layer); // стены поверх пола, zIndex по нижней кромке
                addCityDeco(layer); // деревья/горы стихийных фич города (W38)
                if (st.exit) layer.addChild(makeExit()); // на дне данжа спуска нет
                if (st.ladder) layer.addChild(makeLadder(st));
                tokens = [];
                for (const e of st.enemies) if (e.alive) {
                    const tok = makeToken(e);
                    layer.addChild(tok);
                    tokens.push({ enemy: e, node: tok, base: tok.y, phase: Math.random() * 6.28 });
                }
                objNodes = [];
                for (const o of st.objects) if (!o.taken) {
                    const node = makeObjectNode(o);
                    layer.addChild(node);
                    // здания города (W34) стоят НА ЗЕМЛЕ — не качаются
                    // (юзер: «дома должны просто стоять»); качаются только
                    // иконки-объекты данжа (куча/сундук/магазин-иконка)
                    if (o.build) continue;
                    objNodes.push({ obj: o, node, base: node.y, phase: Math.random() * 6.28 });
                }
                worldContainer.addChild(layer);
                // fx-слой следа клика — ПОВЕРХ всего этажа (включая стены):
                // точки маршрута должны быть видны и между стен
                pathLayer = new PIXI.Container();
                pathLayer.zIndex = 999999;
                layer.addChild(pathLayer);

                // герой — лист по стихии забега (Рост — эльф, Сила — гоблин).
                // Спрайт 96×96 (0.375 листа 256 — просил юзер), якорь (0.5,1)
                // держит НИЖНЮЮ границу спрайта на точке ног, коллизия прежняя
                // (halfW/halfH — поклеточные проходы не сужаются)
                ctx.heroSheet = ctx.heroSheets[G.elem] || ctx.heroSheets.strength;
                const sprite = new PIXI.AnimatedSprite(ctx.heroSheet.animations.walk_front, false);
                sprite.anchor.set(0.5, 1);
                sprite.scale.set(0.375);
                heroId = characters.spawn({
                    // 272 px/с — тот же темп 4.25 кл/с, что был на клетке 56
                    x: st.heroPos.x, y: st.heroPos.y, sprite, anims: ctx.heroSheet.animations,
                    speed: 272, fps: ctx.heroSheet.fps, halfW: 10, halfH: 7,
                });
                // виртуальные оси: их пишет и путь (клик-перемещение), и
                // зеркало клавиш/джойстика в update — герой всегда на них
                ECS.addComponent(world, heroId, "ctrlVI", 0);
                ECS.addComponent(world, heroId, "ctrlVJ", 0);
                heroSprite = sprite;
                // тень под героем (просил юзер): эллипс на точке ног,
                // в y-sort сразу под спрайтом. Приподнята вверх на 0.7
                // её высоты (просил юзер): 6.5×2 — полная высота эллипса
                heroShadow = new PIXI.Graphics();
                heroShadow.ellipse(0, 0, 15, 6.5);
                heroShadow.fill({ color: 0x120d09, alpha: 0.45 });
                heroShadow.position.set(st.heroPos.x, st.heroPos.y - 0.7 * 6.5 * 2);
                heroShadow.zIndex = st.heroPos.y - 0.5;
                layer.addChild(heroShadow);
                sprite.zIndex = st.heroPos.y; // y-sort со стенами (см. update)
                layer.addChild(sprite);
                worldContainer.visible = true;
                camera.follow({
                    get x() { return heroId !== null ? COMPONENTS.positionX[heroId] : st.heroPos.x; },
                    get y() { return heroId !== null ? COMPONENTS.positionY[heroId] : st.heroPos.y; },
                }, 8);
                camera.setBounds({ x: 0, y: 0, width: W * TS, height: H * TS });
                camera.setZoom(1.3125); // клетка на экране ~84px — как было при 56×1.5
                camera.centerOn(st.heroPos.x, st.heroPos.y);
                uiHud = buildHud();
                ctx.ui.addChild(uiHud);
                // квест-диалоги: окно награды за выполненный квест открывается
                // именно здесь — после экрана выбора наградной карты (просил
                // юзер); также анонс нового задания поверх подземелья
                globalThis.GAME_QUESTS.onSceneEnter(ctx);
            },
            exit() {
                const st = myState;
                globalThis.GAME_QUESTS.forcedClose(ctx); // диалог не сиротеет
                // heroPos пишем только пока G.dungeon — всё ещё состояние
                // этой сцены: подъём/спуск свапнули его до переключения
                if (st && heroId !== null && G.dungeon === st) {
                    st.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
                }
                // забег сохраняется при каждом уходе из подземелья (бой,
                // настройки, колода, «этаж пройден») — «Продолжить» в меню
                if (st && G.saveRun) G.saveRun();
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
                if (glomId !== null) { characters.remove(glomId); glomId = null; } // Глом (W34)
                glomNode = null;
                glomShadow = null;
                heroSprite = null;
                heroShadow = null;
                path = null;
                hideTip();
                closeModal();
                if (layer) { layer.destroy({ children: true }); layer = null; }
                tokens = [];
                objNodes = [];
                if (uiHud) { uiHud.destroy({ children: true }); uiHud = null; }
                worldContainer.visible = false;
            },
            update(ticker) {
                const st = G.dungeon;
                if (!st || heroId === null || !uiHud) return;
                const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                if (ctx.footstep) ctx.footstep(hx, hy); // шаги героя (W34)
                const dt = ticker.deltaMS / 1000;

                // Эскейп — дублирует кнопку «выход» открытого меню (просил
                // юзер): квест-диалог закрывается своей кнопкой, окно объекта
                // — «Уйти» (магазин/карта сокровищ) или «Взять» (сундук/
                // золото — оно там единственное)
                if (ctx.input.wasPressed("Escape")) {
                    if ((ctx.questModal || 0) > 0) globalThis.GAME_QUESTS.tap();
                    else if (winObj) {
                        if (winRefs && winRefs.leaveBtn) winRefs.leaveBtn.emit("pointertap");
                        else if (winRefs && winRefs.takeBtn) winRefs.takeBtn.emit("pointertap");
                    }
                }

                // скорость анимаций из настроек (0..10; 5 = скорость листа,
                // ниже 2 — ползунок в минимум) — живая, как в бою (просил юзер)
                COMPONENTS.animationSpeed[heroId] = (ctx.heroSheet.animationSpeed || 0.2)
                    * Math.max(0.25, ((G.settings && G.settings.animSpeed) ?? 5) / 5);
                // y-sort со стенами: низ героя (ноги) против нижней кромки
                // клеток стен — с юга герой впереди, с севера уходит за стену
                heroSprite.zIndex = hy;
                heroShadow.position.set(hx, hy - 0.7 * 6.5 * 2); // тень приподнята (см. enter)
                heroShadow.zIndex = hy - 0.5;

                // ── ведение по пути (клик-перемещение) ─────────────────────
                if (path && (charInput.ix || charInput.iy)) path = null; // клавиши главнее
                if (path && !path.length) path = null;
                if (path) {
                    const dx = path[0].x - hx, dy = path[0].y - hy;
                    if (Math.hypot(dx, dy) < 5) {
                        const last = path.length === 1 ? path[0] : null;
                        path.shift();
                        if (!path.length) { // финальная клетка — встать ровно в центр
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
                    setHeroAxes(charInput.ix, charInput.iy); // зеркало обычного ввода
                }

                for (const t of tokens) {
                    t.phase += dt * 3;
                    t.node.y = t.base + Math.sin(t.phase) * 3;
                }
                for (const t of objNodes) {
                    t.phase += dt * 3;
                    t.node.y = t.base + Math.sin(t.phase) * 2.5;
                }
                // тултип следует за жетоном врага (камера/покачивание живые):
                // мировые → экранные → дизайн-координаты ui-слоя
                if (tip && layer) {
                    const sp = layer.toGlobal({ x: tip.enemy.x, y: tip.enemy.y });
                    const p = ctx.ui.toLocal(sp);
                    const tx = Math.max(12, Math.min(1920 - 384, p.x - 186));
                    const ty = (p.y - tip.h - 27 < 12) ? p.y + 33 : p.y - tip.h - 27;
                    tip.node.position.set(tx, ty);
                }
                if (st.toastT > 0) {
                    st.toastT -= dt;
                    uiHud.userData.toast.text = st.toast;
                    uiHud.userData.toast.alpha = Math.min(1, st.toastT);
                } else uiHud.userData.toast.alpha = 0;
                uiHud.userData.floorT.text = st.city
                    ? GAME_LOC.t("city.name")
                    : GAME_LOC.t("dungeon.floor", { n: st.floor });
                uiHud.userData.goldT.text = String(G.gold);
                // ресурсы стихий в HUD (W40) — числа каждый кадр
                for (const e of globalThis.GAME_SIDEQ.RES_ELEMS)
                    uiHud.userData.resT[e].text = String(G.resources[e] || 0);

                // ── триггеры: окно объекта, враги, выход ───────────────────
                if (st.win || ctx.questModal) { // квест-диалог — как окно объекта
                    // окно открыто: герой стоит на месте, боя/выхода нет
                    setHeroAxes(0, 0);
                    path = null;
                } else {
                    // окно объекта открываем только когда герой СТОИТ рядом:
                    // проход по пути через центр комнаты не должен прерываться
                    const idle = !path && !charInput.ix && !charInput.iy;
                    if (idle) for (const o of st.objects) {
                        if (o.taken) continue;
                        const d = Math.hypot(o.col * TS + TS / 2 - hx, o.row * TS + TS / 2 - hy);
                        if (o.cool) { if (d > TS * 1.25) o.cool = false; continue; }
                        if (d < TS * 0.85) { openObject(o); break; }
                    }
                }
                // ── Глом у своего дома (W34, юзер): квестовая сценка ───────
                // Герой входит в город — Глома нет, у дома стоит сам дом.
                // Подошёл к дому — Глом выходит, идёт к герою, начинается
                // квестовый диалог. Разошлись — «остывает» и ждёт, куда
                // дошёл (повторный разговор — подойти снова, как у объектов)
                if (st.city && st.isCapital && st.glom && !st.win
                    && globalThis.GAME_QUESTS) {
                    const gl = st.glom;
                    if (gl.state === "hidden") {
                        const house = st.objects.find((o) => o.type === "glomHouse");
                        const q = G.quests;
                        const busy = house && q && (q.pending || q.active);
                        const hcx = (house.gx + house.w / 2) * TS,
                            hcy = (house.gy + house.h / 2) * TS;
                        if (busy && !ctx.questModal
                            && Math.hypot(hx - hcx, hy - hcy) < TS * 4) {
                            spawnGlom(gl); // вышел из-за дома
                            gl.state = "walking";
                        }
                    } else if (glomId !== null) {
                        const gx2 = COMPONENTS.positionX[glomId],
                            gy2 = COMPONENTS.positionY[glomId];
                        gl.x = gx2; gl.y = gy2;
                        glomNode.zIndex = gy2;
                        glomShadow.position.set(gx2, gy2 - 4.5);
                        glomShadow.zIndex = gy2 - 0.5;
                        if (gl.state === "walking") {
                            if (ctx.questModal) { // окно открыто — стоит
                                COMPONENTS.ctrlVI[glomId] = 0;
                                COMPONENTS.ctrlVJ[glomId] = 0;
                            } else {
                                const dHero = Math.hypot(hx - gx2, hy - gy2);
                                if (dHero < TS * 0.95) {
                                    // дошёл — начинает разговор
                                    gl.state = "talking";
                                    COMPONENTS.ctrlVI[glomId] = 0;
                                    COMPONENTS.ctrlVJ[glomId] = 0;
                                    globalThis.GAME_QUESTS.talkTo(ctx);
                                } else if (dHero > TS * 10) {
                                    gl.state = "idle"; // герой убежал — поводок
                                } else {
                                    // путь к герою по клеткам (пересчёт
                                    // 0.4с), ось на очередную клетку —
                                    // как у отрядов мира
                                    glomPathT -= dt * 1000;
                                    if (!glomPath || !glomPath.length
                                        || glomPathT <= 0) {
                                        glomPathT = 400;
                                        glomPath = bfsPath(
                                            Math.floor(gx2 / TS), Math.floor(gy2 / TS),
                                            Math.floor(hx / TS), Math.floor(hy / TS));
                                    }
                                    let vx = 0, vy = 0;
                                    if (glomPath && glomPath.length) {
                                        const t0 = glomPath[0];
                                        if (Math.hypot(t0.x - gx2, t0.y - gy2) < 5)
                                            glomPath.shift();
                                        const t1 = glomPath[0];
                                        if (t1) {
                                            const dx = t1.x - gx2, dy = t1.y - gy2;
                                            const dd = Math.hypot(dx, dy) || 1;
                                            vx = dx / dd; vy = dy / dd;
                                        }
                                    }
                                    COMPONENTS.ctrlVI[glomId] = vx;
                                    COMPONENTS.ctrlVJ[glomId] = vy;
                                }
                            }
                        }
                        if (gl.state !== "walking") {
                            // диалог закрыт — Глом «остывает», как объекты
                            if (!ctx.questModal && gl.state === "talking") {
                                gl.state = "idle";
                                gl.cool = true;
                            }
                            const d = Math.hypot(hx - gl.x, hy - gl.y);
                            const idleG = !path && !charInput.ix && !charInput.iy;
                            if (gl.cool) {
                                if (d > TS * 1.25) gl.cool = false;
                            } else if (idleG && d < TS * 0.85) {
                                gl.cool = true;
                                globalThis.GAME_QUESTS.talkTo(ctx);
                            }
                        }
                    }
                }
                if (!st.win && !ctx.questModal && !st.city) for (const t of tokens) {
                    if (!t.enemy.alive) continue;
                    if (Math.hypot(t.enemy.x - hx, t.enemy.y - hy) < TS * 0.85) {
                        // мгновенный стоп у энкаунтера (просил юзер): гасим
                        // оси и путь, точка касания — позиция возврата из боя
                        setHeroAxes(0, 0);
                        path = null;
                        st.heroPos = { x: hx, y: hy };
                        // бой с колодой меньше минимума ДАНЖА запрещён
                        // (просил юзер: вход 16 карт, каждый следующий
                        // этаж +1): запираем в редакторе колоды — замок
                        // не выпустит, пока минимум не собран
                        const need = globalThis.GAME_DATA.caveDeckFor(
                            G.run && G.run.floor ? G.run.floor : 1);
                        if (G.deck.length < need) {
                            showToast(GAME_LOC.t("dungeon.deckLow", { min: need }));
                            G.uiReturn = "dungeon";
                            scenes.go("deck");
                            return;
                        }
                        G.worldFrom = false; // бой из подземелья — трофей вернёт сюда
                        G.activeEnemy = t.enemy;
                        if (ctx.sfx) ctx.sfx("rocket"); // начало боя (W34)
                        scenes.go("arena");
                        return;
                    }
                }
                // ── лестница у старта: наверх; на 1-м этаже — в открытый мир ──
                // первые 2с после входа в подземелье лестница «остывает» —
                // герой прибывает к ней вплотную, без паузы выход срабатывал
                // от первого же клика (просил юзер). Порог шире полклетки
                // (просил юзер W22): герой, вставший кликом в СОСЕДНЮЮ с
                // иконкой клетку (например, попал в подпись «Выход»),
                // тоже выходит. Остывание — убывающий счётчик МС (тик
                // ниже), а НЕ performance.now(): метка, сохранённая в сейв,
                // после «Продолжить» в новой сессии блокировала выход до
                // конца сессии (баг W22)
                if (st.ladderCoolMs > 0) st.ladderCoolMs -= dt * 1000;
                if (!st.win && !ctx.questModal && st.ladder
                    && !(st.ladderCoolMs > 0)
                    && Math.hypot(st.ladder.x - hx, st.ladder.y - hy) < TS * 1.02) {
                    const from = st.floor;
                    st.heroPos = { x: hx, y: hy };
                    if (st.city) {
                        // выход из города (W30): состояние — в G.cityStates
                        // (НЕ в архив «данж:этаж»), герой — к дверям ТОГО
                        // города, в который вошли (W31: объект с координатами)
                        G.cityStates[st.elem] = st;
                        G.dungeon = null;
                        if (!G.cityOut || typeof G.cityOut !== "object")
                            G.cityOut = st.exitTown
                                ? { elem: st.elem, gx: st.exitTown.gx, gy: st.exitTown.gy }
                                : st.elem; // старое состояние без exitTown — как раньше
                        if (G.saveRun) G.saveRun();
                        scenes.go("world");
                        return;
                    }
                    G.dungeonStates[stKey(st.cave, from)] = st; // этаж — в архив как оставили
                    if (from <= 1) {
                        G.dungeon = null;
                        G.world.heroPos = null;
                        G.world.out = true; // из пещеры — к самому входу
                        G.world.outCave = st.cave || "gob"; // к входу ЭТОГО данжа
                        scenes.go("world");
                    } else {
                        G.run.floor = from - 1;
                        (G.run.floors || (G.run.floors = {}))[st.cave] = from - 1;
                        const prev = stateFor(G.dungeonStates, st.cave, from - 1);
                        prev.heroPos = { x: prev.exit.x, y: prev.exit.y }; // у спуска
                        prev.exitCool = true; // не провалиться сразу обратно
                        G.dungeon = prev;
                        scenes.go("floorSwap"); // перезаход в ту же сцену
                    }
                    return;
                }
                // «остывание» спуска после подъёма: считаем ДО проверки
                // близости — герой уже ушёл, ветка касания не выполняется
                if (st.exit && st.exitCool
                    && Math.hypot(st.exit.x - hx, st.exit.y - hy) > TS * 1.25) {
                    st.exitCool = false;
                }
                if (!st.win && !ctx.questModal && st.exit
                    && Math.hypot(st.exit.x - hx, st.exit.y - hy) < TS * 0.85) {
                    if (st.exitCool) {
                        // поднялись и стоим на спуске: уйдём на клетку-другую —
                        // выход «остынет» и снова заработает
                    } else if (!st.bossDead && caveOf(st.cave).boss) showToast(GAME_LOC.t("dungeon.exitSealed"));
                    // дно подземелья: глубже его капа спуска нет (просил юзер)
                    else if (st.floor >= caveOf(st.cave).maxFloor) {
                        showToast(GAME_LOC.t("dungeon.exitBottom"));
                    }
                    // спуск требует растущую колоду: с этажа N — 16+N карт
                    // (спуск на 2-й — 17, …) до капа 60 (просил юзер)
                    else if (G.deck.length < deckNeed(st.floor)) {
                        showToast(GAME_LOC.t("dungeon.exitDeck", { n: deckNeed(st.floor) }));
                    } else {
                        st.heroPos = { x: hx, y: hy };
                        G.dungeonStates[stKey(st.cave, st.floor)] = st;
                        G.run.floor = st.floor + 1;
                        (G.run.floors || (G.run.floors = {}))[st.cave] = st.floor + 1;
                        // посещённый этаж восстанавливается из архива, новый
                        // генерируется; герой прибывает к старту (у лестницы)
                        const next = stateFor(G.dungeonStates, st.cave, G.run.floor);
                        next.heroPos = { ...next.spawn };
                        next.exitCool = false;
                        // лестница прибывшего этажа 2с «остывает»: герой
                        // стоит от неё в СОСЕДНЕЙ клетке, а порог выхода
                        // теперь шире клетки (W22) — без остывания его
                        // мгновенно выкидывало на предыдущий этаж
                        next.ladderCoolMs = 2000;
                        G.dungeon = next;
                        // сразу на следующий этаж, без меню «этаж пройден»
                        // (просил юзер); floorSwap — перезаход в ту же сцену
                        scenes.go("floorSwap");
                        return;
                    }
                }
            },
            blocked,
            heroId: () => heroId,
            // клик-перемещение: состояние пути и перевод мировых координат
            // в экранные (тесты кликают по полу через реальные события мыши);
            // layer стоит в (0,0) мира — его трансформ и есть мировая матрица
            path: () => path,
            // тест-хук: эмуляция клика по местности (обработчик зоны)
            clickAt: (x, y) => zoneRef && zoneRef.emit("pointertap",
                { global: layer ? layer.toGlobal({ x, y }) : { x, y } }),
            worldToScreen: (x, y) => (layer ? layer.toGlobal({ x, y }) : null),
            // тултип врага: тест-хук «наведение в мировых координатах» + состояние
            hoverAt(x, y) {
                hoverCheck({ x, y });
                return tip ? { enc: tip.enemy.enc, boss: !!tip.enemy.boss } : null;
            },
            tipState: () => (tip ? {
                enc: tip.enemy.enc, boss: !!tip.enemy.boss,
                title: GAME_LOC.t("enc." + tip.enemy.enc + ".title"),
                deck: deckSummary(tip.enemy),
                w: 372, h: tip.h,
            } : null),
            tipHide: () => hideTip(),
            // ── объекты комнат (тесты): состояние, активное окно, действия ─
            objects: () => (G.dungeon && G.dungeon.objects
                ? G.dungeon.objects.map((o) => ({
                    type: o.type, col: o.col, row: o.row, taken: !!o.taken,
                    amount: o.amount || null, card: o.card || null,
                    stock: o.stock ? [...o.stock] : null,
                    sold: o.sold ? [...o.sold] : null,
                })) : []),
            objWin: () => {
                if (!winObj || !G.dungeon || !G.dungeon.win) return null;
                const { CARDS, SHOP_BUY, SHOP_SELL } = globalThis.GAME_DATA;
                if (winObj.type === "shop") return {
                    kind: "shop", gold: G.gold,
                    items: winObj.stock.map((id, i) => ({
                        id, price: SHOP_BUY[CARDS[id].rarity],
                        sold: !!(winObj.sold && winObj.sold[i]),
                    })),
                    sell: (sellRows || []).map((r) => ({
                        id: r.id, price: SHOP_SELL[CARDS[r.id].rarity], canSell: r.canSell,
                        free: (G.collection[r.id] || 0) - countInDeck(r.id),
                    })),
                };
                if (winObj.type === "map") return { kind: "map" };
                return winObj.type === "gold"
                    ? { kind: "gold", amount: winObj.amount }
                    : { kind: "chest", card: winObj.card };
            },
            objTake: () => { if (winRefs && winRefs.takeBtn) winRefs.takeBtn.emit("pointertap"); },
            // карта сокровищ: кнопка «Начать драфт» (тесты полного потока)
            objStart: () => { if (winRefs && winRefs.startBtn) winRefs.startBtn.emit("pointertap"); },
            objClose: () => { if (winRefs && winRefs.leaveBtn) winRefs.leaveBtn.emit("pointertap"); },
            shopBuy: (i) => shopBuy(i),
            shopSell: (id) => shopSell(id),
            shopCardNode: (i) => (winRefs && winRefs.goodsNodes ? winRefs.goodsNodes[i] || null : null),
            shopZoomState: () => (shopZoomHook ? shopZoomHook() : null),
            shopSellNode: (id) => {
                const r = (sellRows || []).find((x) => x.id === id);
                return r ? r.node : null;
            },
            hudGold: () => (uiHud && uiHud.userData.goldT ? uiHud.userData.goldT.text : null),
            // формула минимума колоды для спуска (тесты + единый источник)
            deckNeed: (f) => deckNeed(f),
            // лестница наверх у старта этажа и предел глубины данжа (тесты)
            ladderAt: () => (G.dungeon && G.dungeon.ladder ? { ...G.dungeon.ladder } : null),
            maxFloor: (cave) => caveOf(cave || (G.dungeon && G.dungeon.cave) || "gob").maxFloor,
            // город (тесты W34): районы, здания (пятна и двери), Глом
            cityInfo: () => {
                const st = G.dungeon;
                if (!st || !st.city) return null;
                return {
                    isCapital: !!st.isCapital, districts: st.districts,
                    w: st.rows[0].length, h: st.rows.length,
                    buildings: st.objects.filter((o) => o.build).map((o) => ({
                        type: o.type, gx: o.gx, gy: o.gy, w: o.w, h: o.h,
                        door: [o.col, o.row],
                    })),
                    glom: st.glom ? { ...st.glom } : null,
                };
            },
            // кузница/ратуша (тесты W40): окно открыто?, тапы кнопок
            cityObjWin: () => ({ open: !!winNode, type: winObj && winObj.type }),
            forgeTap: (w) => { if (winRefs && winRefs.forge) winRefs.forge.tap(w); },
            forgeState: () => (winRefs && winRefs.forge
                ? winRefs.forge.state() : null),
            questWinState: () => (winRefs && winRefs.quest
                ? winRefs.quest.state() : null),
            questAccept: () => { if (winRefs && winRefs.quest) winRefs.quest.accept(); },
            winDismiss: () => { if (winObj) { winObj.cool = true; closeModal(); } },
        };
    }

    globalThis.GAME_DUNGEON = {
        createDungeonScene, newDungeonState, newCityState, stateFor, deckNeed,
        retreatCell, genObjects, MAX_FLOOR, MAP_V, CITY_V,
        get ROWS() { return MAPROWS; }, // активная раскладка этажа
    };
})();
