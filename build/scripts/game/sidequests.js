// ПОБОЧНЫЕ КВЕСТЫ ГОРОДОВ — ратуша (W40, просил юзер). Герой берёт их,
// подходя к ратуше города: окно с описанием, наградой и кнопками
// «Принять»/«Отказаться». ВЫПОЛНЕННЫЕ квесты НЕ возобновляются (у каждого
// города два вида — охота и письмо; выполнил оба — ратуша пуста).
//
// Виды (награда обоих — 1 ресурс стихии ГОРОДА, где взят квест):
//   «Охота» — после взятия у города (в 16 клетках) спавнится БРОДЯЧИЙ
//   монстр РЕДКОЙ ступени стихии города («разбойники», ENCOUNTERS *.Raider,
//   wild: "rare") и ходит по маршруту вокруг города (кольцо точек по
//   проходимой местности, BFS 4 направления — как у прочих отрядов мира).
//   Спрайт подсвечен красным свечением, красная квестовая стрелка.
//   Победа (arenaFlow, ключ wild:q…) закрывает квест.
//   «Письмо» — случайный город в ~4–5 экранах (230–320 клеток по прямой).
//   Цель подсвечена жёлтым свечением, жёлтая квестовая стрелка. Доставлен —
//   при входе в этот город (enterCity, world.js).
//
// Состояние живёт в ЗАБЕГЕ: G.world.sideQuests
//   { v: 1, done: { "<gx>:<gy>": { hunt: true, … } }, active: [ {
//     city, type, elem, target? (город-адресат письма), mobKey? } ] } —
//   сейв sd_run (worldSideQ). Монстр охоты — в G.world.wander (обычный
//   механизм отрядов мира, живёт/ходит/сражается как все).
// UI: окно ратуши строит dungeon.js (buildQuestWin) по модели model();
// свечения и стрелки рисует world.js (GAME_SIDEQ.arrowTargets/glowCities).
(function () {
    const TS = 32; // тайл МИРА — 32px (в данже 64!)
    const TYPES = ["hunt", "letter"];
    const PREFIX = { strength: "str", growth: "grw", wisdom: "wis",
        decay: "dec", honor: "hon", time: "tim" };
    const HUNT_R = 16;      // спавн монстра не дальше 16 клеток от города
    const ROUTE_MIN = 7, ROUTE_MAX = 12; // кольцо маршрута вокруг города
    const LETTER_MIN = 230, LETTER_MAX = 320; // ~4–5 экранов (60 клеток/экран)

    function fresh() { return { v: 1, done: {}, active: [] }; }
    // Подъём состояния в забеге (лениво; сейвы без поля — новый забег квестов)
    function stateOf(G) {
        if (!G.world) return null;
        if (!G.world.sideQuests || G.world.sideQuests.v !== 1)
            G.world.sideQuests = fresh();
        return G.world.sideQuests;
    }
    const cityKey = (gx, gy) => gx + ":" + gy;
    const keyOf = (p) => cityKey(p.gx, p.gy);

    function citiesOf(G) {
        const m = G.world && G.world.map;
        return m && m.pois ? m.pois.filter((p) =>
            p.kind === "town" || p.kind === "capital") : [];
    }
    function poiByKey(G, key) {
        return citiesOf(G).find((p) => keyOf(p) === key) || null;
    }

    // Проходимость мира: стены «#» и вода «~» — как world.walkable
    function walkableAt(map, x, y) {
        if (!map || x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
        const ch = map.rows[y][x];
        return ch !== "#" && ch !== "~";
    }
    // BFS 4 направления (порядок соседей E,W,S,N — как bfsPath в world.js);
    // возвращает список клеток пути или null
    function bfs(map, sx, sy, tx, ty) {
        if (sx === tx && sy === ty) return null;
        if (!walkableAt(map, sx, sy) || !walkableAt(map, tx, ty)) return null;
        const W = map.w, H = map.h;
        const prev = new Map([[sy * W + sx, null]]);
        const queue = [[sx, sy]];
        while (queue.length) {
            const [x, y] = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                const k = ny * W + nx;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                if (prev.has(k) || !walkableAt(map, nx, ny)) continue;
                prev.set(k, y * W + x);
                if (nx === tx && ny === ty) {
                    const path = [];
                    let cur = k;
                    while (cur !== null) {
                        path.unshift([cur % W, (cur / W) | 0]);
                        cur = prev.get(cur);
                    }
                    return path;
                }
                queue.push([nx, ny]);
            }
        }
        return null;
    }
    // ближайшая проходимая клетка к идеальной точке (спираль по кольцам);
    // достижимость от города проверяет routeAround (bfs от якоря)
    function nearWalkable(map, x, y, maxR = 4) {
        for (let r = 0; r <= maxR; r++)
            for (let dy = -r; dy <= r; dy++)
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const nx = x + dx, ny = y + dy;
                    if (walkableAt(map, nx, ny)) return [nx, ny];
                }
        return null;
    }

    // Кольцо маршрута вокруг города: 8 румбов, радиус 7–12 (случайно на
    // точку), каждая — ближайшая проходимая и достижимая от якоря города;
    // дубли — мимо. Патруль мира (world.js) ведёт отряд по s.d.route —
    // недостижимую точку патруль просто пропустит
    function routeAround(G, poi) {
        const map = G.world.map;
        const pts = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = ROUTE_MIN + ((Math.random() * (ROUTE_MAX - ROUTE_MIN + 1)) | 0);
            const w = nearWalkable(map,
                Math.round(poi.gx + Math.cos(a) * r),
                Math.round(poi.gy + Math.sin(a) * r));
            if (w && bfs(map, poi.gx, poi.gy, w[0], w[1])
                && !pts.some((p) => p[0] === w[0] && p[1] === w[1])) pts.push(w);
        }
        return pts.length >= 2 ? pts : null;
    }

    // Заливка от точки (BFS 4 направления): карта «клетка → дистанция» —
    // достижимость всех проходимых клеток одним проходом
    function flood(map, sx, sy) {
        const W = map.w, H = map.h;
        const dist = new Map();
        if (!walkableAt(map, sx, sy)) return dist;
        dist.set(sy * W + sx, 0);
        const queue = [[sx, sy]];
        while (queue.length) {
            const [x, y] = queue.shift();
            const d = dist.get(y * W + x);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const k = ny * W + nx;
                if (dist.has(k) || !walkableAt(map, nx, ny)) continue;
                dist.set(k, d + 1);
                queue.push([nx, ny]);
            }
        }
        return dist;
    }

    // Спавн охотничьего монстра: клетка в кольце 5..16 от якоря города,
    // проходимая и достижимая от города (одна заливка). enc — «разбойник»
    // стихии города; колода — raiderDeck (8 Обычных + 3 Редких +
    // 1 Эпическая, W40)
    function spawnHuntMob(G, q) {
        const map = G.world.map;
        const enc = PREFIX[q.elem] + "Raider";
        const poi = poiByKey(G, q.city);
        if (!poi || !globalThis.GAME_DATA.ENCOUNTERS[enc]) return null;
        const dist = flood(map, poi.gx, poi.gy);
        const ring = [];
        for (let dy = -HUNT_R; dy <= HUNT_R; dy++)
            for (let dx = -HUNT_R; dx <= HUNT_R; dx++) {
                const cheb = Math.max(Math.abs(dx), Math.abs(dy));
                if (cheb < 5 || cheb > HUNT_R) continue;
                const x = poi.gx + dx, y = poi.gy + dy;
                if (walkableAt(map, x, y)
                    && dist.has(y * map.w + x)) ring.push([x, y]);
            }
        if (!ring.length) return null;
        const [sx, sy] = ring[(Math.random() * ring.length) | 0];
        const route = routeAround(G, poi) || [[sx, sy]];
        const st = {
            alive: true, x: sx * TS + TS / 2, y: sy * TS + TS / 2,
            enc, hpBonus: 0,
            deck: globalThis.GAME_DATA.raiderDeck(q.elem, 0,
                (G.world.seed ^ ((poi.gx * 131 + poi.gy * 17) | 0)) | 0),
            route, quest: true, // охотничий монстр (красное свечение, стрела)
        };
        q.mobKey = "wild:q" + q.city; // префикс wild: — миграция сейва не трогает
        G.world.wander[q.mobKey] = st;
        return st;
    }

    // Город-адресат письма: случайный в ~4–5 экранах (230–320 клеток по
    // прямой); кандидатов нет — из трёх самых дальних
    function letterTarget(G, fromPoi) {
        const all = citiesOf(G).filter((p) => keyOf(p) !== keyOf(fromPoi));
        if (!all.length) return null;
        const far = all.filter((p) => {
            const d = Math.hypot(p.gx - fromPoi.gx, p.gy - fromPoi.gy);
            return d >= LETTER_MIN && d <= LETTER_MAX;
        });
        if (far.length)
            return far[(Math.random() * far.length) | 0];
        return all.sort((a, b) =>
            Math.hypot(b.gx - fromPoi.gx, b.gy - fromPoi.gy)
            - Math.hypot(a.gx - fromPoi.gx, a.gy - fromPoi.gy))
            [(Math.random() * 3) | 0] || all[0];
    }

    const encOf = (elem) => PREFIX[elem] + "Raider";
    const mobName = (elem) =>
        globalThis.GAME_LOC.t("enc." + encOf(elem) + ".title");
    const resName = (elem) => globalThis.GAME_LOC.t("res." + elem);

    // Что ратуша города может предложить: вид(ы) не выполнен и не активен
    function remainingTypes(G, city) {
        const sq = stateOf(G);
        if (!sq) return [];
        if (sq.active.some((a) => a.city === city)) return [];
        const done = sq.done[city] || {};
        return TYPES.filter((tp) => !done[tp]);
    }
    // Модель окна ратуши (dungeon.js buildQuestWin): offer / taken / done
    function model(G, poi) {
        const t = globalThis.GAME_LOC.t;
        const city = keyOf(poi);
        const sq = stateOf(G);
        if (!sq) return { mode: "done" };
        const left = remainingTypes(G, city);
        if (!left.length) return { mode: "done", text: t("sideq.done") };
        if (sq.active.some((a) => a.city === city)) {
            const a = sq.active.find((x) => x.city === city);
            return {
                mode: "taken",
                head: t("sideq.taken"),
                name: a.type === "hunt"
                    ? t("sideq.hunt.name")
                    : t("sideq.letter.name", { city: poiName(G, a.target) }),
                text: a.type === "hunt"
                    ? t("sideq.hunt.active", { mob: mobName(a.elem) })
                    : t("sideq.letter.active", { city: poiName(G, a.target) }),
                reward: t("sideq.reward", { res: resName(a.elem) }),
            };
        }
        // порядок видов случайный — оба встречаются (выполненные не возобновляются)
        const type = left[(Math.random() * left.length) | 0];
        if (type === "hunt") {
            return {
                mode: "offer", type,
                name: t("sideq.hunt.name"),
                text: t("sideq.hunt.desc", { mob: mobName(poi.elem) }),
                reward: t("sideq.reward", { res: resName(poi.elem) }),
            };
        }
        // город-адресат выбирается СРАЗУ (и в окне, и при принятии —
        // accept получает его же, чтобы описание не разошлось с фактом)
        const tgt = letterTarget(G, poi) || poi;
        return {
            mode: "offer", type,
            name: t("sideq.letter.name", { city: poiName(G, keyOf(tgt)) }),
            text: t("sideq.letter.desc", { city: poiName(G, keyOf(tgt)) }),
            reward: t("sideq.reward", { res: resName(poi.elem) }),
            target: keyOf(tgt),
        };
    }
    function poiName(G, key) {
        const p = poiByKey(G, key);
        return p ? p.name : globalThis.GAME_LOC.t("world.title");
    }

    // Принять: письмо берёт адресат из окна (targetKey — тот же, что
    // показан, иначе случайный); охота спавнит монстра. Возвращает квест
    // или null
    function accept(G, poi, type, targetKey = null) {
        const sq = stateOf(G);
        if (!sq) return null;
        const city = keyOf(poi);
        if (!remainingTypes(G, city).includes(type)) return null;
        const q = { city, type, elem: poi.elem };
        if (type === "hunt") {
            if (!spawnHuntMob(G, q)) return null;
        } else {
            const tgt = (targetKey && poiByKey(G, targetKey)
                && keyOf(poiByKey(G, targetKey)) !== city)
                ? poiByKey(G, targetKey) : letterTarget(G, poi);
            if (!tgt) return null;
            q.target = keyOf(tgt);
        }
        sq.active.push(q);
        if (G.saveRun) G.saveRun();
        return q;
    }
    // Отказаться — окно закрыто, квест не взят (предложение повторится)

    // Награда + отметка выполнения (общий хвост охоты и письма)
    function complete(G, q, noteKey) {
        const sq = stateOf(G);
        if (!G.resources) G.resources = {};
        G.resources[q.elem] = (G.resources[q.elem] || 0) + 1;
        const i = sq.active.indexOf(q);
        if (i >= 0) sq.active.splice(i, 1);
        const done = sq.done[q.city] = sq.done[q.city] || {};
        done[q.type] = true;
        G.world.sideNote = { key: noteKey, elem: q.elem }; // всплывёт в мире
        if (G.saveRun) G.saveRun();
    }
    // Победа над охотничьим монстром (arenaFlow, ключ wild:q…)
    function onHuntWin(G, mobKey) {
        const sq = stateOf(G);
        if (!sq) return false;
        const q = sq.active.find((a) => a.type === "hunt" && a.mobKey === mobKey);
        if (!q) return false;
        complete(G, q, "sideq.huntDone");
        return true;
    }
    // Вход в город (world.enterCity): письмо доставлено?
    function onEnterCity(G, tw) {
        const sq = stateOf(G);
        if (!sq || !tw) return false;
        const key = keyOf(tw);
        const q = sq.active.find((a) => a.type === "letter" && a.target === key);
        if (!q) return false;
        complete(G, q, "sideq.letterDone");
        return true;
    }

    // ── Указатели для мира (world.js) ────────────────────────────────────
    // Стрелки: красная — к живому охотничьему монстру, жёлтая — к городу-
    // адресату письма. Свечение городов: keyOf адресатов (жёлтые)
    function arrowTargets(G) {
        const sq = stateOf(G);
        const out = [];
        if (!sq || !G.world) return out;
        for (const a of sq.active) {
            if (a.type === "hunt") {
                const st = G.world.wander && G.world.wander[a.mobKey];
                if (st && st.alive) out.push({ x: st.x, y: st.y, color: "red" });
            } else {
                const p = poiByKey(G, a.target);
                if (p) out.push({ x: (p.gx + 0.5) * TS, y: (p.gy + 0.5) * TS,
                    color: "yellow" });
            }
        }
        return out;
    }
    function glowCities(G) {
        const sq = stateOf(G);
        return sq ? sq.active.filter((a) => a.type === "letter")
            .map((a) => a.target) : [];
    }
    // охотничьи монстры для мира/проб: живы, позиции, маршруты
    function huntMobs(G) {
        const sq = stateOf(G);
        if (!sq) return [];
        return sq.active.filter((a) => a.type === "hunt").map((a) => {
            const st = G.world.wander && G.world.wander[a.mobKey];
            return { key: a.mobKey, city: a.city, elem: a.elem,
                enc: encOf(a.elem), alive: !!(st && st.alive),
                x: st ? st.x : null, y: st ? st.y : null,
                route: st ? st.route : null, deck: st ? st.deck : null };
        });
    }

    globalThis.GAME_SIDEQ = {
        fresh, stateOf, model, accept, onHuntWin, onEnterCity,
        arrowTargets, glowCities, huntMobs,
        // имя монстра стихии и имя города по ключу (тосты после принятия)
        mobTitle: (elem) => globalThis.GAME_LOC.t("enc." + encOf(elem) + ".title"),
        cityName: (G, key) => poiName(G, key),
        // порядок ресурсов в HUD (юзер: Сила, Рост, Мудрость, Тлен,
        // Честь, Время) — для world.js/dungeon.js
        RES_ELEMS: ["strength", "growth", "wisdom", "decay", "honor", "time"],
        // утилиты для проб/мир-кода
        cityKey, keyOf, remainingTypes, walkableAt,
    };
})();
