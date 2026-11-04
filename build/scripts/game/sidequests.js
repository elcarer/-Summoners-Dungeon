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
//   «Письмо» — случайный город в ~2–3 экранах (110–200 клеток по прямой;
//   W49, юзер: было 230–320 — идти было слишком долго).
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
    const LETTER_MIN = 110, LETTER_MAX = 200; // ~2–3 экрана (60 клеток/экран;
    // W49, юзер: было 230–320 — города-адресаты были слишком далеко)

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

    // Тело города в открытом мире — препятствие (W42, юзер): спрайт
    // 9 клеток шириной (колонки gx-4..gx+4), высота 6 рядов у города
    // (gy-5..gy) и 7.5 у столицы (gy-7..gy, верхний ряд — половинный);
    // непроходимы все ряды, КРОМЕ верхнего (герой обходит город и
    // может зайти за него, но не ходит по «телу»). Единственная точка
    // правила: её используют world.walkable (через кэш), collide.extra
    // (ходьба в main.js) и walkableAt ниже (флуд/маршруты квестов)
    function cityBlockAt(map, gx, gy) {
        const pois = map && map.pois;
        if (!pois) return false;
        for (let i = 0; i < pois.length; i++) {
            const p = pois[i];
            if (p.kind !== "town" && p.kind !== "capital") continue;
            if (gx < p.gx - 4 || gx > p.gx + 4) continue;
            const top = p.kind === "capital" ? p.gy - 7 : p.gy - 5;
            if (gy > top && gy <= p.gy) return true;
        }
        return false;
    }
    // Проходимость мира: стены «#» и вода «~» + тело города (W42)
    function walkableAt(map, x, y) {
        if (!map || x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
        const ch = map.rows[y][x];
        if (ch === "#" || ch === "~") return false;
        return !cityBlockAt(map, x, y);
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
    // точку), каждая — ближайшая проходимая и достижимая от города;
    // дубли — мимо. Патруль мира (world.js) ведёт отряд по s.d.route —
    // недостижимую точку патруль просто пропустит. Старт BFS — не якорь
    // (с W42 тело города непроходимо), а ближайшая проходимая клетка
    // у ворот — «снаружи» города
    function gateCell(map, poi) {
        return nearWalkable(map, poi.gx, poi.gy) || [poi.gx, poi.gy + 1];
    }
    function routeAround(G, poi) {
        const map = G.world.map;
        const gate = gateCell(map, poi);
        const pts = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = ROUTE_MIN + ((Math.random() * (ROUTE_MAX - ROUTE_MIN + 1)) | 0);
            const w = nearWalkable(map,
                Math.round(poi.gx + Math.cos(a) * r),
                Math.round(poi.gy + Math.sin(a) * r));
            if (w && bfs(map, gate[0], gate[1], w[0], w[1])
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
        const gate = gateCell(map, poi); // якорь непроходим с W42 — от ворот
        const dist = flood(map, gate[0], gate[1]);
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

    // Город-адресат письма: случайный в ~2–3 экранах (110–200 клеток по
    // прямой, W49 юзер); кандидатов нет — из трёх самых дальних
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

    // Модель АКТИВНОГО поручения для окна-просмотра (W45, юзер): после
    // поправки «одно одновременно» активное всегда одно
    function activeModel(G) {
        const sq = stateOf(G);
        if (!sq || !sq.active.length) return null;
        const a = sq.active[0];
        const t = globalThis.GAME_LOC.t;
        return {
            type: a.type, elem: a.elem, city: a.city,
            name: a.type === "hunt" ? t("sideq.hunt.name")
                : t("sideq.letter.name", { city: poiName(G, a.target) }),
            text: a.type === "hunt"
                ? t("sideq.hunt.active", { mob: mobName(a.elem) })
                : t("sideq.letter.active", { city: poiName(G, a.target) }),
            reward: t("sideq.reward", { res: resName(a.elem) }),
        };
    }

    // ── Окно активного поручения (W45, юзер): кнопка рядом с кнопкой
    // сюжетного задания открывает просмотр с чек-боксом стрелки (своё
    // состояние G.settings.sideqArrow — отдельно от сюжетной). Паттерн —
    // окно просмотра сюжетного квеста (quests.js review): dim+панель,
    // модальность ctx.questModal, Escape закрывает (closeReview)
    let rev = null, revGeo = null;
    function reviewOpen() { return !!rev; }
    function closeReview() {
        if (!rev) return false;
        const d = rev;
        rev = null;
        d.ctx.questModal = Math.max(0, (d.ctx.questModal || 1) - 1);
        if (d.node && !d.node.destroyed) d.node.destroy({ children: true });
        return true;
    }
    function showReview(ctx) {
        const G = ctx && ctx.G;
        if (!G || rev) return false;
        const m = activeModel(G);
        if (!m) return false;
        const t = globalThis.GAME_LOC.t;
        const { T, button } = globalThis.GAME_UI;
        const node = new globalThis.PIXI.Container();
        node.eventMode = "static";
        const dim = new globalThis.PIXI.Graphics();
        dim.rect(-3000, -2000, 7920, 5080);
        dim.fill({ color: 0x000000, alpha: 0.55 });
        node.addChild(dim);
        const w = 780, h = 540, top = 540 - h / 2;
        const panel = new globalThis.PIXI.Graphics();
        panel.roundRect(960 - w / 2, top, w, h, 18);
        panel.fill({ color: 0x171310, alpha: 0.96 });
        panel.stroke({ width: 4, color: 0x6b5c40 });
        node.addChild(panel);
        const title = T(t("sideq.title"), 44, 0xf0c96a,
            { stroke: { color: 0x241505, width: 8 } });
        title.anchor.set(0.5, 0);
        title.position.set(960, top + 20);
        title.eventMode = "none";
        node.addChild(title);
        const head = T(t("sideq.taken"), 26, 0xbfae87);
        head.anchor.set(0.5, 0);
        head.position.set(960, top + 96);
        head.eventMode = "none";
        node.addChild(head);
        const name = T(m.name, 32, 0xf0c96a);
        name.anchor.set(0.5, 0);
        name.position.set(960, top + 136);
        name.eventMode = "none";
        node.addChild(name);
        const body = T(m.text, 24, 0xd8c79d,
            { wordWrap: true, wordWrapWidth: w - 130, align: "center" });
        body.anchor.set(0.5, 0);
        body.position.set(960, top + 200);
        body.eventMode = "none";
        node.addChild(body);
        const rewIcon = new globalThis.PIXI.Sprite(
            ctx.uiTex(`resources/res_${m.elem}.png`));
        rewIcon.anchor.set(0.5);
        rewIcon.scale.set(0.34);
        rewIcon.eventMode = "none";
        node.addChild(rewIcon);
        const rew = T(m.reward, 26, 0xffe2a8);
        rew.anchor.set(0.5, 0);
        rew.position.set(960, top + 320);
        rew.eventMode = "none";
        node.addChild(rew);
        rew.position.y = top + 320;
        rewIcon.position.set(960 - rew.width / 2 - 24, top + 338);
        // чек-бокс стрелки к цели ПОРУЧЕНИЯ (как у сюжетного — quests.js):
        // своё состояние sideqArrow, стрелки побочных квестов читают его
        // в world.js
        const on = () => !!(G.settings && G.settings.sideqArrow !== false);
        const box = new globalThis.PIXI.Graphics();
        const mark = new globalThis.PIXI.Graphics();
        const drawBox = () => {
            box.clear();
            box.roundRect(0, 0, 28, 28, 6);
            box.fill({ color: 0x241505 });
            box.stroke({ width: 2, color: 0x6b5c40 });
            mark.clear();
            if (on()) {
                mark.moveTo(6, 15); mark.lineTo(12, 21); mark.lineTo(22, 7);
                mark.stroke({ width: 4, color: 0xbfd489 });
            }
        };
        drawBox();
        const lab = T(t("quest.arrow"), 22, 0xd8c79d);
        lab.anchor.set(0, 0.5);
        const rowW = 28 + 14 + lab.width;
        const rx = 960 - rowW / 2;
        box.position.set(rx, top + 386);
        mark.position.set(rx, top + 386);
        lab.position.set(rx + 42, top + 400);
        box.eventMode = "static";
        mark.eventMode = "none";
        lab.eventMode = "none";
        box.on("pointertap", () => {
            G.settings = G.settings || {};
            G.settings.sideqArrow = !on();
            if (revGeo) revGeo.on = on(); // пробы видят свежее состояние
            if (globalThis.GAME_META && globalThis.GAME_META.saveSettings)
                globalThis.GAME_META.saveSettings(G.settings);
            drawBox();
            if (ctx.sfx) ctx.sfx();
        });
        node.addChild(box);
        node.addChild(mark);
        node.addChild(lab);
        const leaveBtn = button(ctx, {
            tex: "button_menu.png", label: t("sideq.leave"),
            x: 960, y: top + h - 70, scale: 1,
            onTap: () => closeReview(),
        });
        node.addChild(leaveBtn);
        ctx.ui.addChild(node);
        ctx.questModal = (ctx.questModal || 0) + 1;
        rev = { ctx, node };
        revGeo = { box: [Math.round(box.x) + 14, Math.round(box.y) + 14],
            on: on() };
        return true;
    }
    // для проб: открыто ли окно поручения и где центр чек-бокса (клик мышью)
    function reviewState() {
        return rev ? { open: true, box: revGeo.box, on: revGeo.on }
            : { open: false };
    }

    // Принять: письмо берёт адресат из окна (targetKey — тот же, что
    // показан, иначе случайный); охота спавнит монстра. Возвращает квест
    // или null. (W45, юзер) ОДНОВРЕМЕННО висит только одно поручение:
    // взятие нового ОТМЕНЯЕТ текущее (монстр отменённой охоты уходит
    // из мира; в done не пишем — можно вернуться и взять заново)
    function accept(G, poi, type, targetKey = null) {
        const sq = stateOf(G);
        if (!sq) return null;
        const city = keyOf(poi);
        for (const a of sq.active)
            if (a.type === "hunt" && a.mobKey && G.world
                && G.world.wander) delete G.world.wander[a.mobKey];
        sq.active.length = 0;
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
        // окно активного поручения (W45): кнопка в HUD мира/города
        showReview, closeReview, reviewOpen, activeModel, reviewState,
        // имя монстра стихии и имя города по ключу (тосты после принятия)
        mobTitle: (elem) => globalThis.GAME_LOC.t("enc." + encOf(elem) + ".title"),
        cityName: (G, key) => poiName(G, key),
        // порядок ресурсов в HUD (юзер: Сила, Рост, Мудрость, Тлен,
        // Честь, Время) — для world.js/dungeon.js
        RES_ELEMS: ["strength", "growth", "wisdom", "decay", "honor", "time"],
        // утилиты для проб/мир-кода
        cityKey, keyOf, remainingTypes, walkableAt, cityBlockAt,
    };
})();
