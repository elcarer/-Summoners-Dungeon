// СЦЕНА «ПОДЗЕМЕЛЬЕ» — top-down перемещение героя, энкаунтеры-враги, выход.
// Карта-ASCII 30×17 собирается из тайлов юзера (images/dungeon_tiles,
// клетка 56px): пол — плиты с вариациями, стены — «верх» (кап) либо
// кирпичное «лицо» с капом, если ниже пол; южные стены украшаются
// факелами/окошками, пол — редкой щебёнкой.
// Состояние живёт в G.dungeon (переживает уход в арену и обратно);
// состояния пройденных этажей — в G.dungeonStates: по лестнице у старта
// герой поднимается на этаж выше (на 1-м — выходит в открытый мир),
// а повторный спуск попадает на этаж в том виде, в каком его оставили.
// Подземелье ограничено глубиной: MAX_FLOOR этажей, дальше спуска нет.
// В центрах комнат (кроме боссовой) — интерактивные объекты: куча золота,
// сундук с картой и магазин (только со 2-го этажа, не больше 1 на этаж).
(function () {
    const TS = 56; // клетка = размер тайлов юзера (пол 56×56, кап 56×28, лицо 56×54)
    // Подземелья (id → стихия/глубина/босс) — dataCards CAVES; гоблинские
    // пещеры и Роща Роста пока одной глубины 6
    const CAVES = () => globalThis.GAME_DATA.CAVES;
    const caveOf = (id) => CAVES()[id] || CAVES().gob;
    const MAX_FLOOR = 6;
    // Версия раскладки этажа: тайлы 56px (v3). Сейвы волн с другой
    // геометрии (координаты в других клетках) не поднимаются — этаж
    // пересобирается заново.
    const MAP_V = 3;
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
    const W = ROWS[0].length, H = ROWS.length;
    // центры комнат (колонка, строка): стартовая, верхняя средняя,
    // верхняя правая, нижняя левая. Боссовая комната — без объектов.
    const ROOM_CENTERS = [[3, 3], [11, 3], [22, 2], [5, 12]];

    // Объекты этажа: по одному в центре каждой комнаты, кроме стартовой
    // (просил юзер). Тип кидается из общего пула: куча золота, сундук,
    // карта сокровищ (драфт) и — со 2-го этажа — магазин (просил юзер).
    // Магазин и карта сокровищ могут и не выпасть, а выпав, исключаются
    // из пула — не больше 1 каждого на этаж (драфт — долгое состязание).
    // Сумма кучи и карта сундука кидаются при генерации этажа и хранятся
    // в объекте — сейв/загрузка показывает то же самое.
    function genObjects(floor, cave = "gob") {
        const { rollLootCard } = globalThis.GAME_DATA;
        const elem = caveOf(cave).elem; // карты сундуков/магазина — стихии данжа
        const centers = ROOM_CENTERS.slice(1); // стартовая комната — без объектов
        for (let i = centers.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [centers[i], centers[j]] = [centers[j], centers[i]];
        }
        const pool = ["gold", "chest", "map"];
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

    // Минимальный размер колоды для спуска: на этаже N нужно 11+N карт
    // (этаж 1 — 12, спуск на 2-й — 13, …), рост +1 за этаж до капа 60
    // (просил юзер).
    function deckNeed(floor) {
        return Math.min(globalThis.GAME_DATA.DECK_MAX, 12 + floor);
    }

    function newDungeonState(cave, floor) {
        const caveId = globalThis.GAME_DATA.CAVES[cave] ? cave : "gob";
        const { mobForFloor, enemyDeck } = globalThis.GAME_DATA;
        const st = {
            v: MAP_V,
            cave: caveId,
            floor, heroPos: null, spawn: null, ladder: null, enemies: [],
            exit: null, exitCool: false, bossDead: false,
            toast: null, toastT: 0, objects: genObjects(floor, caveId), win: null,
        };
        const bossId = caveOf(caveId).boss; // главарь данжа (boss / grwBoss)
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const ch = ROWS[j][i];
            const x = i * TS + TS / 2, y = j * TS + TS / 2;
            if (ch === "H") { st.heroPos = { x, y }; st.spawn = { x, y }; }
            else if (ch === "e") {
                // архетип по этажу ДАНЖА; колода кидается один раз и хранится
                // в враге — тултип и бой показывают один и тот же состав
                const enc = mobForFloor(caveId, floor);
                st.enemies.push({ x, y, enc, deck: enemyDeck(enc, floor), alive: true, boss: false });
            }
            else if (ch === "B") st.enemies.push({ x, y, enc: bossId, deck: enemyDeck(bossId, floor), alive: true, boss: true });
            else if (ch === "X") st.exit = { x, y };
        }
        // лестница наверх — в стартовой комнате, клеткой выше героя:
        // рядом (40px — чуть больше радиуса касания), но не на пути
        // первого шага вправо и не срабатывает сама при спауне
        if (st.spawn) st.ladder = { x: st.spawn.x, y: st.spawn.y - TS };
        return st;
    }

    function createDungeonScene(ctx) {
        const { COMPONENTS, camera, characters, charInput, ECS, world, scenes, G, worldContainer, uiTex } = ctx;
        let layer = null, heroId = null, tokens = [], uiHud = null;
        let myState = null; // состояние, которым живёт этот инстанс сцены:
        // подъём/спуск меняет G.dungeon ДО переключения сцены — тогда
        // heroPos в exit() пишет уже не этому состоянию
        let objNodes = []; // спрайты объектов комнат (куча/сундук/магазин)
        let winNode = null, winRefs = null, winObj = null; // открытое окно объекта
        let sellRows = []; // строки продажи магазина (для тестов)
        let refreshShop = null; // живое обновление окна магазина (пишет buildShopWin)
        let path = null; // клик-перемещение: очередь центров клеток (мировые px)

        function blocked(px, py) {
            const gx = Math.floor(px / TS), gy = Math.floor(py / TS);
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) return true;
            return ROWS[gy][gx] === "#";
        }

        // ── Клик-перемещение: BFS по клеткам + ведение героя по пути ────────
        // Путь — очередь центров соседних клеток; герой движется виртуальными
        // осями (ctrlVI/ctrlVJ — механизм ИИ): работают коллизии-скольжение и
        // походка из character-системы. Клавиши движения путь отменяют.
        function walkable(gx, gy) {
            return gx >= 0 && gy >= 0 && gx < W && gy < H && ROWS[gy][gx] !== "#";
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
        function setHeroAxes(ix, iy) {
            COMPONENTS.ctrlVI[heroId] = ix;
            COMPONENTS.ctrlVJ[heroId] = iy;
        }

        // ── Карта из тайлов юзера ─────────────────────────────────────────
        // Пол — 9 плит с вариациями (выбор по детерминированному хэшу клетки,
        // чтобы сейв/перезаход показывали тот же пол); редкая щебёнка оживляет.
        // Стена с полом снизу — «южная»: кирпичное лицо (низ по клетке) + кап
        // поверх верхушки лица (нависает на 16px вверх); прочие стены — кап
        // по центру клетки на тёмной подложке. Южные лица разнообразим
        // факелом/окошками, спуск — лестницей-спрайтом вместо рисованной.
        const FLOORS = 9, CAPS = 4, FACES = 4;
        function hsh(i, j, k) { return ((i * 73856093 ^ j * 19349663 ^ (k || 0) * 83492791) >>> 0) % 1000; }
        function buildMapGfx() {
            const c = new PIXI.Container();
            const base = new PIXI.Graphics(); // тёмная подложка всей карты
            base.rect(0, 0, W * TS, H * TS);
            base.fill(0x241f1a);
            c.addChild(base);
            const tile = (name, x, y, anchorBottom) => {
                const sp = new PIXI.Sprite(uiTex(`dungeon_tiles/${name}.png`));
                if (sp.texture.width !== TS) sp.scale.set(TS / sp.texture.width); // декор — в ширину клетки
                if (anchorBottom) sp.anchor.set(0, 1); // левый-низ: лица/декор стен
                else sp.anchor.set(0, 0);
                sp.position.set(x, y);
                c.addChild(sp);
            };
            // полы + щебёнка
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                if (ROWS[j][i] === "#") continue;
                tile(`floor_${hsh(i, j) % FLOORS}`, i * TS, j * TS);
                const h = hsh(i, j, 7);
                if (h < 80) tile(`rubble_${h % 4}`, i * TS, (j + 1) * TS, true);
            }
            // стены: сверху вниз, чтобы лица верхних рядов ложились под нижние
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                if (ROWS[j][i] !== "#") continue;
                const south = j + 1 >= H || ROWS[j + 1][i] !== "#";
                if (south) {
                    tile("shadow", i * TS, (j + 1) * TS, true); // тень на полу у стены
                    tile(`wall_face_${hsh(i, j, 3) % FACES}`, i * TS, (j + 1) * TS, true);
                    tile(`wall_top_${hsh(i, j * 3) % CAPS}`, i * TS, j * TS - 16);
                    const h = hsh(i, j, 11);
                    if (h < 145) { // украшение южной стены: факел либо окошко
                        const pick = h < 55 ? "wall_torch" : h < 100 ? "wall_window_a" : "wall_window_b";
                        tile(pick, i * TS, (j + 1) * TS, true);
                    }
                } else {
                    tile(`wall_top_${hsh(i, j * 3) % CAPS}`, i * TS, j * TS + 14);
                }
            }
            return c;
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
        function makeObjectNode(obj) {
            const c = new PIXI.Container();
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
            const tex = obj.type === "gold" ? "icon_gold.png"
                : obj.type === "chest" ? "icon_bag.png"
                : obj.type === "map" ? "icon_map.png" : "icon_shop.png";
            const sp = new PIXI.Sprite(uiTex(tex));
            sp.anchor.set(0.5);
            sp.scale.set(obj.type === "shop" ? 0.62 : 0.5);
            c.addChild(sp);
            c.position.set(obj.col * TS + TS / 2, obj.row * TS + TS / 2);
            c.zIndex = obj.row + 1;
            return c;
        }

        function removeObjectNode(obj) {
            const i = objNodes.findIndex((n) => n.obj === obj);
            if (i >= 0) {
                objNodes[i].node.destroy({ children: true });
                objNodes.splice(i, 1);
            }
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
            return c;
        }

        function buildHud() {
            const c = new PIXI.Container();
            const panel = new PIXI.Sprite(uiTex("panel_label.png"));
            panel.scale.set(1.05); // 341×87 → ~358×91
            panel.eventMode = "static"; // панель — «хром» HUD: клики по ней не ведут героя
            c.addChild(panel);
            const style = { fontFamily: "Kereru", fontSize: 27, fill: 0xf3e6c2 };
            const floorT = new PIXI.Text({ text: "", style });
            floorT.position.set(39, 15);
            const hpT = new PIXI.Text({ text: "", style });
            hpT.position.set(189, 15);
            c.addChild(floorT, hpT);
            // золото — мета-ресурс забега: плашка под панелью этажа/HP
            const goldPlate = new PIXI.Container();
            const gpanel = new PIXI.Sprite(uiTex("panel_label.png"));
            gpanel.scale.set(0.62); // 341×87 → ~211×54
            gpanel.eventMode = "static";
            goldPlate.addChild(gpanel);
            const gicon = new PIXI.Sprite(uiTex("icon_gold.png"));
            gicon.anchor.set(0.5);
            gicon.scale.set(0.46);
            gicon.position.set(27, 27);
            goldPlate.addChild(gicon);
            const goldT = new PIXI.Text({ text: "0", style });
            goldT.position.set(50, 13);
            goldPlate.addChild(goldT);
            goldPlate.position.set(0, 96);
            c.addChild(goldPlate);
            c.userData = { floorT, hpT, goldT, fit: true };
            // настройки и колода — доступны и из подземелья; «Назад» вернёт сюда
            c.addChild(hudIcon("icon_setting.png", 1839, 66, () => {
                G.uiReturn = "dungeon";
                scenes.go("settings");
            }));
            c.addChild(hudIcon("card_back_small.png", 1839, 162, () => {
                G.uiReturn = "dungeon";
                scenes.go("deck");
            }, 0.675));
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
            c.userData = { floorT, hpT, goldT, toast };
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
            if (G.dungeon) G.dungeon.win = null;
        }

        function openObject(o) {
            path = null;
            winObj = o;
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
            dim.rect(0, 0, 1920, 1080);
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

        function startDraft(o) {
            closeModal();
            G.draft = { picks: [], ePicks: [], objIdx: G.dungeon.objects.indexOf(o) };
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
            dim.rect(0, 0, 1920, 1080);
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
                        globalThis.GAME_META.saveMeta(G.collection, G.deck);
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
            globalThis.GAME_META.saveMeta(G.collection, G.deck);
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
            globalThis.GAME_META.saveMeta(G.collection, G.deck);
            if (G.saveRun) G.saveRun();
            if (ctx.sfx) ctx.sfx("coins");
            if (refreshShop) refreshShop();
            return true;
        }

        function buildShopWin(o) {
            const t = GAME_LOC.t;
            const { CARDS, SHOP_BUY, SHOP_SELL } = globalThis.GAME_DATA;
            const { T, button, cardFace, scrollPane } = globalThis.GAME_UI;
            const c = new PIXI.Container();
            c.eventMode = "static";
            const dim = new PIXI.Graphics();
            dim.rect(0, 0, 1920, 1080);
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
            const sellPane = scrollPane(ctx, { x: 780, y: 195, w: 1050, h: 768, onScroll: () => {} });
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
                const ids = Object.keys(CARDS)
                    .filter((id) => (G.collection[id] || 0) > 0)
                    .sort((a, b) => (CARDS[a].cost - CARDS[b].cost) || a.localeCompare(b));
                ids.forEach((id, i) => {
                    const col = i % 5, rowI = (i / 5) | 0;
                    const owned = G.collection[id] || 0;
                    const canSell = owned - countInDeck(id) > 0 && !sellLocked();
                    const cx = 93 + col * 198, cy = 138 + rowI * 307.5;
                    const card = cardFace(ctx, id, { scale: 0.5, dim: !canSell });
                    card.position.set(cx, cy);
                    card.eventMode = "static";
                    if (canSell) card.on("pointertap", () => { shopSell(id); });
                    c2.addChild(card);
                    const lbl = T(`×${owned} · ${t("shop.price", { n: SHOP_SELL[CARDS[id].rarity] })}`,
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
            refreshShop = function () {
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
                // сейв другой геометрии (v≠3) — этаж пересобирается; сейвы
                // до вторых данжей жили в гоблинских пещерах
                if (!G.dungeon || G.dungeon.v !== MAP_V)
                    G.dungeon = newDungeonState(G.run.cave, G.run.floor);
                if (!G.dungeon.cave) G.dungeon.cave = "gob";
                const st = G.dungeon;
                myState = st;
                ctx.collide.rows = ROWS; // коллизии героя — по карте этажа
                ctx.collide.ts = TS; // клетка этажа — 56px (тайлы юзера)
                // сейв стоя на лестнице не должен мгновенно поднимать героя
                if (st.ladder && st.heroPos
                    && Math.hypot(st.ladder.x - st.heroPos.x, st.ladder.y - st.heroPos.y) < TS * 0.9) {
                    st.heroPos = { ...st.spawn };
                }
                // сейвы старых волн без объектов — генерируются при заходе
                if (!st.objects) { st.objects = genObjects(st.floor, st.cave); st.win = null; }
                for (const o of st.objects)
                    if (o.type === "shop" && !o.sold) o.sold = [false, false, false, false, false, false];
                // сейвы до «объектов вне стартовой комнаты»: в стартовой
                // комнате героя объектов больше не бывает — выкидываем
                {
                    const [sc, sr] = ROOM_CENTERS[0];
                    const n0 = st.objects.length;
                    st.objects = st.objects.filter((o) => o.col !== sc || o.row !== sr);
                    if (st.objects.length !== n0) st.win = null;
                }
                // сейвы до волны «враги в коридорах»: враги стояли в центрах
                // комнат (позиции хранятся в сейве) — пересаживаем живых
                // обычных на коридорные клетки, босса не двигаем, побеждённые
                // не возвращаются (просил юзер: вход в комнату открыт после
                // победы над врагом-блокиратором в проходе)
                {
                    const slots = [[24, 6], [3, 7], [11, 12]];
                    const cell = (e) => [Math.round(e.x / TS - 0.5), Math.round(e.y / TS - 0.5)];
                    const alive = st.enemies.filter((e) => e.alive && !e.boss);
                    const inCorridor = (e) => slots.some(([c, r]) =>
                        cell(e)[0] === c && cell(e)[1] === r);
                    if (alive.some((e) => !inCorridor(e))) {
                        const busy = new Set(st.enemies.filter((e) => e.alive && e.boss)
                            .map((e) => cell(e).join(",")));
                        let si = 0;
                        for (const e of alive) {
                            while (si < slots.length && busy.has(slots[si].join(","))) si++;
                            if (si >= slots.length) break;
                            const [c, r] = slots[si++];
                            e.x = c * TS + TS / 2;
                            e.y = r * TS + TS / 2;
                        }
                    }
                }
                // сейвы до волны «лестница наверх»: старт и лестница
                // восстанавливаются из карты этажа
                if (!st.spawn) {
                    for (let j = 0; j < H; j++) {
                        const i = ROWS[j].indexOf("H");
                        if (i >= 0) st.spawn = { x: i * TS + TS / 2, y: j * TS + TS / 2 };
                    }
                }
                if (!st.ladder && st.spawn) st.ladder = { x: st.spawn.x, y: st.spawn.y - TS };
                closeModal(); // окно объекта не переживает уход из сцены
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
                    const next = bfsPath(Math.floor(hx / TS), Math.floor(hy / TS),
                        Math.floor(p.x / TS), Math.floor(p.y / TS));
                    if (next) path = next; // в стену/сам в себя — не идём
                });
                // наведение на врага — подсказка (имя + колода); ушли — скрыть
                zone.on("pointermove", (e) => hoverCheck(zone.toLocal(e.global)));
                zone.on("pointerout", () => hideTip());
                layer.addChild(zone);
                layer.addChild(buildMapGfx());
                layer.addChild(makeExit());
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
                    objNodes.push({ obj: o, node, base: node.y, phase: Math.random() * 6.28 });
                }
                worldContainer.addChild(layer);

                // герой (заглушка — рыцарь движка)
                const sprite = new PIXI.AnimatedSprite(ctx.knight.animations.wait, false);
                sprite.anchor.set(0.5, 1);
                heroId = characters.spawn({
                    x: st.heroPos.x, y: st.heroPos.y, sprite, anims: ctx.knight.animations,
                    speed: 238, fps: ctx.knight.fps, halfW: 10, halfH: 7,
                });
                // виртуальные оси: их пишет и путь (клик-перемещение), и
                // зеркало клавиш/джойстика в update — герой всегда на них
                ECS.addComponent(world, heroId, "ctrlVI", 0);
                ECS.addComponent(world, heroId, "ctrlVJ", 0);
                layer.addChild(sprite);
                worldContainer.visible = true;
                camera.follow({
                    get x() { return heroId !== null ? COMPONENTS.positionX[heroId] : st.heroPos.x; },
                    get y() { return heroId !== null ? COMPONENTS.positionY[heroId] : st.heroPos.y; },
                }, 8);
                camera.setBounds({ x: 0, y: 0, width: W * TS, height: H * TS });
                camera.setZoom(1.5); // клетка на экране ~84px — как было при TS40×2.1
                camera.centerOn(st.heroPos.x, st.heroPos.y);
                uiHud = buildHud();
                ctx.ui.addChild(uiHud);
            },
            exit() {
                const st = myState;
                // heroPos пишем только пока G.dungeon — всё ещё состояние
                // этой сцены: подъём/спуск свапнули его до переключения
                if (st && heroId !== null && G.dungeon === st) {
                    st.heroPos = { x: COMPONENTS.positionX[heroId], y: COMPONENTS.positionY[heroId] };
                }
                // забег сохраняется при каждом уходе из подземелья (бой,
                // настройки, колода, «этаж пройден») — «Продолжить» в меню
                if (st && G.saveRun) G.saveRun();
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
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
                const dt = ticker.deltaMS / 1000;

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
                uiHud.userData.floorT.text = GAME_LOC.t("dungeon.floor", { n: st.floor });
                uiHud.userData.hpT.text = GAME_LOC.t("dungeon.hp", { hp: G.hero.hp, max: G.hero.maxHp });
                uiHud.userData.goldT.text = String(G.gold);
                globalThis.GAME_UI.fit(uiHud.userData.floorT, 95, 11);
                globalThis.GAME_UI.fit(uiHud.userData.hpT, 105, 11);

                // ── триггеры: окно объекта, враги, выход ───────────────────
                if (st.win) {
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
                if (!st.win) for (const t of tokens) {
                    if (!t.enemy.alive) continue;
                    if (Math.hypot(t.enemy.x - hx, t.enemy.y - hy) < TS * 0.85) {
                        G.activeEnemy = t.enemy;
                        scenes.go("arena");
                        return;
                    }
                }
                // ── лестница у старта: наверх; на 1-м этаже — в открытый мир ──
                if (!st.win && st.ladder
                    && Math.hypot(st.ladder.x - hx, st.ladder.y - hy) < TS * 0.85) {
                    const from = st.floor;
                    st.heroPos = { x: hx, y: hy };
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
                if (!st.win && st.exit && Math.hypot(st.exit.x - hx, st.exit.y - hy) < TS * 0.85) {
                    if (st.exitCool) {
                        // поднялись и стоим на спуске: уйдём на клетку-другую —
                        // выход «остынет» и снова заработает
                    } else if (!st.bossDead) showToast(GAME_LOC.t("dungeon.exitSealed"));
                    // дно подземелья: глубже его капа спуска нет (просил юзер)
                    else if (st.floor >= caveOf(st.cave).maxFloor) {
                        showToast(GAME_LOC.t("dungeon.exitBottom"));
                    }
                    // спуск требует растущую колоду: на этаже N — минимум
                    // 11+N карт (этаж 1 — 12, спуск на 2-й — 13, …) до капа 60
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
                        G.dungeon = next;
                        scenes.go("floorWin");
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
        };
    }

    globalThis.GAME_DUNGEON = { createDungeonScene, newDungeonState, stateFor, deckNeed, ROWS, MAX_FLOOR };
})();
