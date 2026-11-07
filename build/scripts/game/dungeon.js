// СЦЕНА «ПОДЗЕМЕЛЬЕ» (и ГОРОД в её режиме st.city) — top-down перемещение
// героя, энкаунтеры-враги, выход. Построение города — планировка кварталов,
// декор, оверлеи фич, окна кузницы/ратуши — живёт в city.js (W47, юзер).
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
    // Генератор/состояние этажей — dungeonGen.js (грузится ДО этого
    // файла): раскладка genMap, объекты, stateFor/newDungeonState.
    // Активная карта (W/H/MAPROWS ниже) живёт ЗДЕСЬ — её ставит enter()
    // по st.rows; retreatCell/wallInterior/wallDrawn читают её же.
    const { TS, ROWS, DW, DH, caveOf, tileSetOf, stKey, stateFor,
            genObjects, deckNeed, newDungeonState } =
        globalThis.GAME_DUNGEON_GEN;
    // ГОРОД — построение города (планировка/декор/оверлеи фич, окна
    // кузницы и ратуши) вынесено в city.js (W47, юзер): логика города
    // живёт в своём файле и не мешает логике подземелья. Здесь город
    // только рендерится и живёт — общим движком сцены ниже
    const CITY = globalThis.GAME_CITY;
    const MAX_FLOOR = 6;

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
        // W60: первая половина «прожига» перехода между этажами — герой
        // стоит и триггеры лестниц/спусков молчат до смены сцены
        let floorLock = false;
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
        // W60 (юзер): переход между этажами — двухфазный «прожиг»:
        // первая половина эффекта (сужающееся кольцо) играет над СТАРЫМ
        // этажом, к её концу сцена перезаходит (floorSwap), вторая половина
        // (расширяющееся кольцо) открывает новый этаж. Эффект живёт на
        // ctx.ui и переживает перезаход; в новом состоянии ставится
        // descentFx — вход сцены поднимет эффект над своим HUD.
        // Бандл не загрузился — обычный мгновенный переход
        function descentGo() {
            const FX = globalThis.GAME_FX;
            const fx = FX && FX.available
                ? FX.spawn(ctx.ui, "transitions/burn-away",
                    { x: 0, y: 0, size: 1080 })
                : null;
            if (!fx) { scenes.go("floorSwap"); return; }
            floorLock = true;
            setTimeout(() => {
                floorLock = false;
                scenes.go("floorSwap");
            }, 1250); // кольцо сузилось (CLOSE ≈ 1.2с эффекта)
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
                ? ctx.worldSheets[CITY.CITY_VARIANTS[caveOf(myState.cave).elem] || "dirt"]
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
            // W38: оверлеи фич города (болота/чаща/мосты) — city.js (W47)
            if (city && myState.feat) {
                // W50 (юзер): берега реки Мудрости — переходы magic_water
                // (смешанные квадранты поверх базовой заливки), city.js
                CITY.addCityWaterBanks({ ctx, st: myState, MAPROWS, W, H }, c);
                CITY.addCityGroundOverlays(
                    { ctx, st: myState, MAPROWS, W, H }, c);
                // W53: живые огни pixelfx — горн кузницы, факелы ратуши
                CITY.addCityFires({ st: myState }, c);
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
            globalThis.GAME_UI.addGlow(ctx, c, sp);
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
            // особенность подземелья (W54, юзер): текст «Ярости природы»
            // виден, пока герой внутри «Рыжего леса» (обновление ниже)
            const featT = new PIXI.Text({ text: "",
                style: { fontFamily: "Kereru", fontSize: 17,
                    fill: 0xd8a468, stroke: { color: 0x1c1207, width: 3 },
                    wordWrap: true, wordWrapWidth: 860, align: "center" } });
            featT.anchor.set(0.5, 0);
            featT.position.set(960, 44);
            featT.eventMode = "none";
            c.addChild(featT);
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
            // ресурсного ряда открывает текст задания. (W46, юзер) иконки
            // строятся всегда, видимость СИНХРОНИЗИРУЕТСЯ ПО КАДРАМ (update):
            // руна — только с ВЗЯТЫМ квестом (announced), кнопка поручения
            // (W45) — в постоянном слоте правее (отодвинута с rx+52:
            // налезала на руну боком)
            const qRune = hudIcon("icon_rune.png", rx + 16, 17, () => {
                globalThis.GAME_QUESTS.showReview(ctx);
            }, 0.75);
            const qSide = hudIcon("icon_map.png", rx + 80, 17,
                () => { globalThis.GAME_SIDEQ.showReview(ctx); }, 0.75);
            qRune.visible = qSide.visible = false; // до первой синхронизации
            goldPlate.addChild(qRune, qSide);
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
            c.userData = { floorT, featT, goldT, resT, toast, qRune, qSide };
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
            // колода хранится в враге (кидается при генерации этажа)
            const deck = enemy.deck;
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

        // Связи для городских окон city.js (W47): окна живут в ui-слое
        // этой сцены, закрывает их closeModal; кузница в живом порядке
        // заменяет окно (вскрытие → анимация → добыча) — replaceWin
        function cityEnv() {
            return {
                ctx,
                closeModal, showToast,
                setRefs: (r) => { winRefs = r; },
                replaceWin: (node, refs) => {
                    if (winNode) winNode.destroy({ children: true });
                    winNode = node;
                    ctx.ui.addChild(winNode);
                    winRefs = refs;
                },
            };
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
            if (o.type === "armory" || o.type === "townHall"
                || o.type === "collect") {
                // кузница и ратуша (W40, просил юзер): крафт бустеров из
                // ресурсов стихии города; побочные квесты города.
                // W66 (юзер): коллекционер — ТЕМ ЖЕ окном квестов, но
                // со своим заданием «Поиск редкостей» (rare-режим).
                // Окна города строит city.js (W47) — сцена даёт ему связи
                // (закрытие/тост/замена окна) и ставит их результат себе
                o.cool = true;
                G.dungeon.win = { idx: G.dungeon.objects.indexOf(o) };
                const w = (o.type === "armory"
                    ? CITY.buildForgeWin
                    : CITY.buildQuestWin)(cityEnv(), o, o.type === "collect");
                winNode = w.node;
                winRefs = w.refs;
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
            return ownedTotal() - 1 < deckNeed(G.dungeon ? G.dungeon.cave : "gob", G.dungeon ? G.dungeon.floor : 1);
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
                    ? t("shop.sellNeed", { n: deckNeed(G.dungeon ? G.dungeon.cave : "gob", G.dungeon ? G.dungeon.floor : 1) })
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
                if (!G.dungeon)
                    G.dungeon = newDungeonState(G.run.cave, G.run.floor);
                const st = G.dungeon;
                myState = st;
                MAPROWS = st.rows || ROWS; // активная раскладка этажа
                W = MAPROWS[0].length; H = MAPROWS.length; // город шире/выше данжа
                ctx.collide.rows = MAPROWS; // коллизии героя — по карте этажа
                ctx.collide.ts = TS; // клетка этажа — 64px (тайлы данжа)
                ctx.collide.extra = null; // блок тел городов мира (W42) — только в мире
                // сейв стоя на лестнице не должен мгновенно поднимать героя
                if (st.ladder && st.heroPos
                    && Math.hypot(st.ladder.x - st.heroPos.x, st.ladder.y - st.heroPos.y) < TS * 0.9) {
                    st.heroPos = { ...st.spawn };
                }
                // сейв в клетках прохода города (W52): груз не должен
                // сразу выкидывать в мир — герой возвращается к спавну
                if (st.city && st.exitPassage && st.heroPos) {
                    const pg = st.exitPassage;
                    const pcx = Math.floor(st.heroPos.x / TS),
                          pcy = Math.floor(st.heroPos.y / TS);
                    if (pcy === pg.y && pcx >= pg.x0 && pcx <= pg.x1)
                        st.heroPos = { ...st.spawn };
                }
                // старт без «лестницы наверх» (ленивая инициализация):
                // восстанавливается из карты этажа
                if (!st.spawn) {
                    for (let j = 0; j < H; j++) {
                        const i = MAPROWS[j].indexOf("H");
                        if (i >= 0) st.spawn = { x: i * TS + TS / 2, y: j * TS + TS / 2 };
                    }
                }
                // лестница — только у этажей данжа: у города выход —
                // проход в стене (W52), st.ladder у города нет
                if (!st.ladder && !st.city && st.spawn)
                    st.ladder = { x: st.spawn.x, y: st.spawn.y - TS };
                if (!st.city && globalThis.GAME_QUESTS) {
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
                CITY.addCityDeco({ ctx, st, MAPROWS, W, H, hsh }, layer); // деревья/горы фич города (W38)
                if (st.exit) layer.addChild(makeExit()); // на дне данжа спуска нет
                if (st.ladder && !st.city) layer.addChild(makeLadder(st));
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
                // W60 (юзер): «прожиг» экрана (transitions/burn-away)
                // запускает сам ПЕРЕХОД — спуск из открытого мира
                // (world.enterCave) и переходы между этажами по лестнице
                // (descentGo): эффект живёт на общей подложке ctx.ui и
                // переживает смену сцены. Вход сцены только ПОДНИМАЕТ его
                // над своим HUD (сцена сменилась под играющим кольцом) и
                // снимает флаг. После боя/выхода из колоды эффекта НЕТ.
                // Город входит без прожига
                {
                    const FX = globalThis.GAME_FX;
                    if (FX && FX.available && !st.city && st.descentFx) {
                        st.descentFx = false;
                        for (const h of FX.live)
                            if (h.sprite && !h.sprite.destroyed
                                && h.sprite.parent === ctx.ui
                                && h.inst.meta && h.inst.meta.name === "Burn away")
                                ctx.ui.addChild(h.sprite); // наверх, над HUD
                    }
                }
                // квест-диалоги: окно награды за выполненный квест открывается
                // именно здесь — после экрана выбора наградной карты (просил
                // юзер); также анонс нового задания поверх подземелья
                globalThis.GAME_QUESTS.onSceneEnter(ctx);
                // W60 (юзер): окно «поручение выполнено» и награда письма —
                // СРАЗУ при входе в город-адресат, а не при выходе из него
                // (прежде окно ждало возврата в открытый мир)
                if (st.city && G.world.sideNote && globalThis.GAME_SIDEQ) {
                    const n = G.world.sideNote;
                    G.world.sideNote = null;
                    if (!globalThis.GAME_SIDEQ.showComplete(ctx, n)) {
                        // окно не открылось — заметка возвращается (мир покажет)
                        G.world.sideNote = n;
                    }
                }
            },
            exit() {
                const st = myState;
                floorLock = false;
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
                    if ((ctx.questModal || 0) > 0) {
                        // квест-диалог — своей кнопкой; окно поручения
                        // (W45) — тоже своей («Уйти»)
                        if (!globalThis.GAME_QUESTS.tap()
                            && globalThis.GAME_SIDEQ)
                            globalThis.GAME_SIDEQ.closeReview();
                    }
                    else if (winObj) {
                        if (winRefs && winRefs.leaveBtn) winRefs.leaveBtn.emit("pointertap");
                        else if (winRefs && winRefs.takeBtn) winRefs.takeBtn.emit("pointertap");
                    }
                }

                // C — колода/коллекция (W60, юзер): как клик по карте героя
                if (ctx.input.wasPressed("KeyC") && !(ctx.questModal > 0)
                    && !floorLock) {
                    if (ctx.sfx) ctx.sfx();
                    G.uiReturn = "dungeon";
                    scenes.go("deck");
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
                // W60: во время «прожига» герой стоит (кольцо жнёт старый этаж)
                if (floorLock) {
                    path = null;
                    setHeroAxes(0, 0);
                } else if (path && (charInput.ix || charInput.iy)) path = null; // клавиши главнее
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
                if (floorLock) { // «прожиг» перехода — герой стоит
                    setHeroAxes(0, 0);
                } else if (path) {
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
                // особенность подземелья в инфоокне сверху (W54, юзер):
                // «Ярость природы» — «Рыжий лес»; «Растущая доблесть» —
                // «Белая пуща» (W62, юзер)
                {
                    const cd = globalThis.GAME_DATA.CAVES[st.cave];
                    uiHud.userData.featT.text = !st.city && cd
                        ? (cd.fury ? GAME_LOC.t("dungeon.fury")
                            : cd.valor ? GAME_LOC.t("dungeon.valor") : "")
                        : "";
                }
                uiHud.userData.goldT.text = String(G.gold);
                // ресурсы стихий в HUD (W40) — числа каждый кадр
                for (const e of globalThis.GAME_SIDEQ.RES_ELEMS)
                    uiHud.userData.resT[e].text = String(G.resources[e] || 0);

                // (W46, юзер) иконки квестов в HUD — синхронизация по кадрам:
                // руна видна только с ВЗЯТЫМ квестом, кнопка поручения — в
                // своём постоянном слоте правее (как в мире)
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
                        // W43 (юзер): у зданий с меню (ратуша/кузница/магазин)
                        // окно открывается у ЛЮБОЙ стены — дистанция до пятна
                        // здания, а не только до клетки-двери (у двери герой
                        // стоял, меню не было). Дом Глома — мимо (своя сценка),
                        // одиночные объекты (сундуки и пр.) — как раньше
                        let d;
                        if (o.build && o.type !== "glomHouse") {
                            const dx = Math.max(o.gx * TS - hx, 0,
                                hx - (o.gx + o.w) * TS);
                            const dy = Math.max(o.gy * TS - hy, 0,
                                hy - (o.gy + o.h) * TS);
                            d = Math.hypot(dx, dy);
                        } else {
                            d = Math.hypot(o.col * TS + TS / 2 - hx,
                                o.row * TS + TS / 2 - hy);
                        }
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
                // ── выход: город — проход в стене; данж — лестница у старта ──
                // Город (W52, юзер): выход из города — ЗАХОД в клетки
                // прохода в нижней стене; радиуса нет — сквозные маршруты
                // мимо прохода город не покидают. Данж: лестница наверх
                // (на 1-м этаже — в открытый мир), порог шире полклетки
                // (просил юзер W22): герой, вставший кликом в СОСЕДНЮЮ с
                // иконкой клетку, тоже выходит. Первые 2с после входа
                // выход «остывает» — герой прибывает к нему вплотную, без
                // паузы выход срабатывал от первого же клика (просил юзер).
                // Остывание — убывающий счётчик МС (тик ниже), а НЕ
                // performance.now(): метка, сохранённая в сейв, после
                // «Продолжить» в новой сессии блокировала выход до конца
                // сессии (баг W22)
                if (st.ladderCoolMs > 0) st.ladderCoolMs -= dt * 1000;
                const psg = st.city ? st.exitPassage : null;
                const hitExit = psg
                    ? Math.floor(hy / TS) === psg.y
                        && Math.floor(hx / TS) >= psg.x0
                        && Math.floor(hx / TS) <= psg.x1
                    : !!st.ladder
                        && Math.hypot(st.ladder.x - hx, st.ladder.y - hy) < TS * 1.02;
                if (!st.win && !ctx.questModal && !floorLock && hitExit
                    && !(st.ladderCoolMs > 0)) {
                    const from = st.floor;
                    st.heroPos = { x: hx, y: hy };
                    if (st.city) {
                        // выход из города (W30): состояние — в G.cityStates
                        // (НЕ в архив «данж:этаж»), герой — к дверям ТОГО
                        // города, в который вошли (W31: объект с координатами)
                        G.cityStates[st.elem] = st;
                        G.dungeon = null;
                        // cityOut ставится при входе в город (world.js);
                        // нет его — выход к дверям города, в котором герой
                        if (!G.cityOut)
                            G.cityOut = { elem: st.elem,
                                gx: st.exitTown.gx, gy: st.exitTown.gy };
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
                        // W60 (юзер): выход из ПОДЗЕМЛЬЯ — герой встаёт у
                        // входа этого данжа; stale-выход из города его не
                        // перебивает (баг «вышел из „Рыжего леса“ — попал
                        // в другой части мира у города»)
                        G.cityOut = null;
                        scenes.go("world");
                    } else {
                        G.run.floor = from - 1;
                        (G.run.floors || (G.run.floors = {}))[st.cave] = from - 1;
                        const prev = stateFor(G.dungeonStates, st.cave, from - 1);
                        prev.heroPos = { x: prev.exit.x, y: prev.exit.y }; // у спуска
                        prev.exitCool = true; // не провалиться сразу обратно
                        prev.descentFx = true; // вход нового этажа поднимет эффект
                        G.dungeon = prev;
                        descentGo(); // W60: 2-фазный «прожиг» подъёма
                    }
                    return;
                }
                // «остывание» спуска после подъёма: считаем ДО проверки
                // близости — герой уже ушёл, ветка касания не выполняется
                if (!floorLock && st.exit && st.exitCool
                    && Math.hypot(st.exit.x - hx, st.exit.y - hy) > TS * 1.25) {
                    st.exitCool = false;
                }
                if (!st.win && !ctx.questModal && !floorLock && st.exit
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
                    else if (G.deck.length < deckNeed(st.cave, st.floor)) {
                        showToast(GAME_LOC.t("dungeon.exitDeck", { n: deckNeed(st.cave, st.floor) }));
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
                        // W60: 4с = 2с остывания + «прожиг» перехода (~1.3с),
                        // чтобы лестница не сработала сразу после кольца
                        next.ladderCoolMs = 4000;
                        G.dungeon = next;
                        next.descentFx = true; // вход нового этажа поднимет эффект
                        // сразу на следующий этаж, без меню «этаж пройден»
                        // (просил юзер); W60: 2-фазный «прожиг» спуска —
                        // floorSwap по таймеру, после сужения кольца
                        descentGo();
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
            deckNeed: (c, f) => deckNeed(c, f),
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
            // W66: отдать карту коллекционеру (кнопка окна)
            questGive: () => {
                if (winRefs && winRefs.quest && winRefs.quest.give)
                    winRefs.quest.give();
            },
            // W66: карта-заказ коллекционера — показана? состояние зума
            questCardState: () => (winRefs && winRefs.quest
                ? { card: !!winRefs.quest.state().card,
                    zoom: winRefs.quest.zoom ? winRefs.quest.zoom() : null }
                : null),
            questCardHover: (on) => {
                if (winRefs && winRefs.quest && winRefs.quest.cardHover)
                    winRefs.quest.cardHover(on);
            },
            winDismiss: () => { if (winObj) { winObj.cool = true; closeModal(); } },
        };
    }

    globalThis.GAME_DUNGEON = {
        createDungeonScene, newDungeonState, stateFor, deckNeed,
        retreatCell, genObjects, MAX_FLOOR,
        get ROWS() { return MAPROWS; }, // активная раскладка этажа
    };
})();
