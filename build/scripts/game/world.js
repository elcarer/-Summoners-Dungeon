// СЦЕНА «ОТКРЫТЫЙ МИР» — глобальная карта континента (генератор —
// worldGen.js, референсы: Shandalar, forge-adventure): 6 зон по стихиям
// (верх — Сила/Рост/Мудрость, низ — Тлен/Честь/Время), в каждой —
// столица 3×3 клетки, ~десяток городов 3×2 и вход в подземелье стихии
// (города стоят редко — ~9+ клеток между якорями). Путь преграждают
// горы, чащи и реки (мосты — только на дорогах), города связывают
// дороги; здания непроходимы, кроме якоря-площади. Карта
// детерминирована сидом забега (G.world.seed): «новая игра» каждый раз
// генерирует новую, «Продолжить» поднимает ту же.
// Передвижение — как в подземелье: WASD/стрелки и клик по земле (BFS-
// путь с ведением героя виртуальными осями). Вход в пещеру — триггер по
// касанию: продолжает текущий этаж забега (G.dungeonStates) или начинает
// первый. Города пока без функционала (просил юзер — потом добавим).
// В правом нижнем углу — мини-карта всего мира (просил юзер) с живым
// маркером героя. Подземелья Чести и Времени на карте есть, но вход
// скажет «Скоро…» — данжи этих стихий ещё впереди.
(function () {
    const TS = 40;
    const HERO_SPEED = 170; // шаг героя по обычной местности (px/с)
    const ROAD_SPEED = HERO_SPEED * 1.2; // по дорогам/мостам ×1.2 (просил юзер)

    // палитры зон: земля (3 оттенка на шахматный детерминированный хэш),
    // крыши городов и кроны чащ — у каждой стихии свой характер
    const GROUND = {
        strength: [0x5a4632, 0x614c36, 0x52402d], // выжженные степи
        growth: [0x4a5c33, 0x516339, 0x455630], // луга (как раньше)
        wisdom: [0x3c4a57, 0x42525f, 0x364350], // стальные пустоши
        decay: [0x46404b, 0x4d4652, 0x3f3a44], // серые топи
        honor: [0x8a8168, 0x938a71, 0x807860], // паломнические равнины
        time: [0x6d5c36, 0x75633b, 0x645530], // охристые пески
    };
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
        let uiHud = null;
        let path = null; // клик-перемещение: очередь центров клеток (мировые px)
        let floaties = []; // всплывающие подписи («Скоро…» у арки)
        let soonCount = 0; // сколько раз арка сказала «Скоро…» (тесты)

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

        // ── рендер карты: плоские тайлы-заглушки в духе подземелья ────────
        function buildMapGfx(map) {
            const g = new PIXI.Graphics();
            const W = map.w, H = map.h;
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                const t = map.ter[j * W + i];
                const x = i * TS, y = j * TS;
                if (t === T.MOUNTAIN) {
                    g.rect(x, y, TS, TS); g.fill(0x3b3831);
                    g.rect(x + 2, y + 2, TS - 4, TS - 4); g.fill(0x4a463f);
                    g.poly([x + 8, y + 30, x + 20, y + 8, x + 32, y + 30]);
                    g.fill(0x6a655a); // вершина
                } else if (t === T.WATER) {
                    g.rect(x, y, TS, TS); g.fill(0x2c4a63);
                    g.rect(x + 3, y + 3, TS - 6, TS - 6); g.fill(0x38607c);
                    if ((i * 7 + j * 13) % 5 === 0) { // блики-волны
                        g.rect(x + 8, y + 18, 14, 3); g.fill(0x4a7a99);
                    }
                } else if (t === T.FOREST) {
                    const zone = map.zone[j * W + i];
                    const elem = GEN.ELEMS[zone];
                    g.rect(x, y, TS, TS); g.fill(0x20301b);
                    g.rect(x + 2, y + 2, TS - 4, TS - 4); g.fill(FOREST[elem]);
                    g.circle(x + TS / 2, y + TS / 2 - 3, 9); g.fill(0x2c3f22);
                    g.circle(x + TS / 2 - 4, y + TS / 2 + 2, 6); g.fill(0x26361d);
                    g.circle(x + TS / 2 + 5, y + TS / 2 + 3, 6); g.fill(0x26361d);
                } else if (t === T.ROAD || t === T.BRIDGE) {
                    g.rect(x, y, TS, TS); g.fill(0x8a744f);
                    g.rect(x + 1, y + 1, TS - 2, TS - 2); g.fill(0x94805c);
                    if (t === T.BRIDGE) { // доски и кант поверх воды
                        g.rect(x, y, TS, 5); g.fill(0x6e5233);
                        g.rect(x, y + TS - 5, TS, 5); g.fill(0x6e5233);
                        for (let b = 0; b < 4; b++) {
                            g.rect(x + 3, y + 6 + b * 8, TS - 6, 2); g.fill(0x7c5c36);
                        }
                    } else if ((i * 5 + j * 11) % 4 === 0) {
                        g.circle(x + 12, y + 26, 2); g.fill(0x7a6543); // камешки
                        g.circle(x + 27, y + 14, 2); g.fill(0x7a6543);
                    }
                } else { // земля зоны — чередование оттенков (детерминиро-
                    // ванное, карта не «мерцает»), редкие камешки/кочки
                    const elem = GEN.ELEMS[map.zone[j * W + i]];
                    const pal = GROUND[elem];
                    const v = (i * 7 + j * 13) % 3;
                    g.rect(x, y, TS, TS); g.fill(pal[v]);
                    if ((i * 3 + j * 5) % 11 === 0) {
                        g.rect(x + 16, y + 20, 5, 4); g.fill(pal[(v + 1) % 3]);
                    }
                }
            }
            g.rect(0, 0, W * TS, H * TS);
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
            // footprint 3×2 = 120×80px, центр — ((gx+0.5)·TS, (gy-0.5)·TS)
            const p = { x: (poi.gx + 0.5) * TS, y: (poi.gy - 0.5) * TS };
            const sh = new PIXI.Graphics();
            sh.ellipse(0, 36, 60, 12); sh.fill({ color: 0x0d130a, alpha: 0.5 });
            c.addChild(sh);
            const b = new PIXI.Graphics(); // два дома с крышами стихии
            b.rect(-56, -6, 76, 42); b.fill(0x8f846d); // большой дом
            b.poly([-62, -6, -18, -34, 38, -6]); b.fill(ROOF[poi.elem]);
            b.rect(24, 6, 34, 30); b.fill(0x9a8f75); // пристройка
            b.poly([18, 6, 41, -14, 64, 6]); b.fill(ROOF[poi.elem]);
            b.rect(-30, 14, 12, 22); b.fill(0x3a2f22); // двери
            b.rect(38, 18, 10, 18); b.fill(0x3a2f22);
            b.rect(-46, 2, 7, 7); b.rect(-6, 2, 7, 7); b.fill(0x3a2f22); // окна
            c.addChild(b);
            c.addChild(label(poi.name, 13, 0xf3e6c2, -40));
            c.position.set(p.x, p.y);
            c.zIndex = (poi.gy + 1) * TS; // низ footprint
            return c;
        }
        function makeCapital(poi) {
            const c = new PIXI.Container();
            // footprint 3×3 = 120×120px, центр — ((gx+0.5)·TS, (gy+0.5)·TS)
            const p = { x: (poi.gx + 0.5) * TS, y: (poi.gy + 0.5) * TS };
            const sh = new PIXI.Graphics();
            sh.ellipse(0, 54, 64, 13); sh.fill({ color: 0x0d130a, alpha: 0.55 });
            c.addChild(sh);
            const b = new PIXI.Graphics(); // цитадель: стены, зубцы, башня
            b.rect(-54, -12, 108, 66); b.fill(0x9a8f75);
            for (let t = 0; t < 5; t++) b.rect(-54 + t * 23, -20, 13, 9); // зубцы
            b.fill(0x8a8066);
            b.rect(-12, -54, 24, 74); b.fill(0x9a8f75); // башня
            b.poly([-19, -54, 0, -82, 19, -54]); b.fill(ROOF[poi.elem]);
            b.rect(-10, 26, 20, 28); b.fill(0x3a2f22); // ворота
            b.rect(-44, -2, 8, 8); b.rect(36, -2, 8, 8); b.fill(0x3a2f22);
            c.addChild(b);
            // флаг стихии над башней — логотип из интерфейса
            const logo = new PIXI.Sprite(
                uiTex(globalThis.GAME_DATA.ELEM_LOGO[poi.elem]));
            logo.anchor.set(0.5, 1);
            logo.scale.set(0.55);
            logo.position.set(0, -86);
            logo.eventMode = "none";
            c.addChild(logo);
            c.addChild(label(poi.name, 16, 0xf0c96a, -88));
            c.position.set(p.x, p.y);
            c.zIndex = (poi.gy + 2) * TS; // низ footprint
            return c;
        }
        // арка-спуск (та же, что выход этажа), с именем подземелья сверху
        function makeCave(poi) {
            const c = new PIXI.Container();
            const p = px(poi);
            const sh = new PIXI.Graphics();
            sh.circle(0, 0, 21); sh.fill({ color: 0x0d130a, alpha: 0.55 });
            c.addChild(sh);
            const sp = new PIXI.Sprite(uiTex("icon_down.png"));
            sp.anchor.set(0.5);
            sp.scale.set(0.66);
            c.addChild(sp);
            c.addChild(label(poi.name, 13, 0xffe9b0, -26));
            c.position.set(p.x, p.y);
            c.zIndex = p.y;
            return c;
        }

        function floatText(text, x, y, fill) {
            const t = new PIXI.Text({
                text, style: { fontFamily: "Kereru", fontSize: 22, fill,
                    stroke: { color: 0x1c1207, width: 5 } },
            });
            t.anchor.set(0.5);
            t.position.set(x, y - 40);
            t.zIndex = y + 10;
            layer.addChild(t);
            floaties.push({ node: t, t: 0 });
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
            c.addChild(hudIcon("icon_setting.png", 1839, 66, () => {
                G.uiReturn = "world";
                scenes.go("settings");
            }));
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
            c.userData = { goldT, mini };
            return c;
        }

        // ── мини-карта всего мира (просил юзер): правый нижний угол, ──────
        // 2px на клетку (144×96 → 288×192). Статична: рельеф/дороги/POI
        // рисуются один раз при входе; поверх — живой пульсирующий маркер
        // героя (update). Клики по ней поглощаются — герой не бегает в угол
        function buildMinimap() {
            const map = G.world.map;
            const MS = 2, MW = map.w * MS, MH = map.h * MS;
            const box = new PIXI.Container();
            box.position.set(1920 - 12 - MW, 1080 - 12 - MH);
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
                else col = GROUND[GEN.ELEMS[map.zone[i]]][0];
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
            return { box, dot, MW, MH };
        }

        // Вход в подземелье: продолжить текущий этаж ЭТОГО данжа (состояния
        // этажей хранит G.dungeonStates) или начать его первый. Данжей
        // Чести/Времени ещё нет — арки говорят «Скоро…»
        function enterCave(cave) {
            const caveId = globalThis.GAME_DATA.CAVES[cave] ? cave : "gob";
            if (!globalThis.GAME_DATA.CAVES[caveId]) return false; // на всякий
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
            G.dungeon = st;
            if (ctx.sfx) ctx.sfx();
            scenes.go("dungeon");
            return true;
        }

        return {
            enter() {
                if (ctx.music) ctx.music("menu"); // трек мира (пока общий с меню)
                const map = ensureMap();
                ctx.collide.rows = map.rows; // коллизии героя — по карте мира
                ctx.collide.ts = TS; // после подземелья (клетка 64) — шаг мира
                // точка появления: вышедший из подземелья герой стоит
                // у входа ТОГО данжа; новая игра — случайная свободная
                // клетка зоны своей стихии около её подземелья
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
                layer.addChild(zone);
                layer.addChild(buildMapGfx(map));
                for (const poi of map.pois) {
                    if (poi.kind === "capital") layer.addChild(makeCapital(poi));
                    else if (poi.kind === "town") layer.addChild(makeTown(poi));
                    else layer.addChild(makeCave(poi));
                }
                worldContainer.addChild(layer);

                // герой — лист по стихии забега (Рост — эльф, Сила — гоблин)
                ctx.heroSheet = ctx.heroSheets[G.elem] || ctx.heroSheets.strength;
                const sprite = new PIXI.AnimatedSprite(ctx.heroSheet.animations.walk_front, false);
                sprite.anchor.set(0.5, 1);
                sprite.scale.set(0.25); // лист 256px — рост как у рыцаря 64px
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
                heroShadow.ellipse(0, 0, 12, 5.5);
                heroShadow.fill({ color: 0x0e140c, alpha: 0.45 });
                heroShadow.position.set(hp.x, hp.y - 0.7 * 5.5 * 2); // приподнята на 0.7 высоты (просил юзер)
                heroShadow.zIndex = hp.y - 0.5;
                layer.addChild(heroShadow);
                layer.addChild(sprite);
                worldContainer.visible = true;
                camera.follow({
                    get x() { return heroId !== null ? COMPONENTS.positionX[heroId] : hp.x; },
                    get y() { return heroId !== null ? COMPONENTS.positionY[heroId] : hp.y; },
                }, 8);
                camera.setBounds({ x: 0, y: 0, width: map.w * TS, height: map.h * TS });
                camera.setZoom(2.1);
                camera.centerOn(hp.x, hp.y);
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
                if (heroId !== null) { characters.remove(heroId); heroId = null; }
                heroShadow = null;
                heroSprite = null;
                path = null;
                floaties = [];
                if (layer) { layer.destroy({ children: true }); layer = null; }
                if (uiHud) { uiHud.destroy({ children: true }); uiHud = null; }
                worldContainer.visible = false;
            },
            update(ticker) {
                if (heroId === null || !uiHud) return;
                const hx = COMPONENTS.positionX[heroId], hy = COMPONENTS.positionY[heroId];
                heroShadow.position.set(hx, hy - 0.7 * 5.5 * 2);
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
                // мини-карта: маркер героя живёт вместе с ним (пульс)
                {
                    const mini = uiHud.userData.mini;
                    if (mini && G.world.map) {
                        mini.dot.position.set(
                            hx / (G.world.map.w * TS) * mini.MW,
                            hy / (G.world.map.h * TS) * mini.MH);
                        mini.dot.scale.set(1 + 0.25 * Math.sin(performance.now() / 250));
                    }
                }

                // всплывающие подписи («Скоро…») — вверх и растворение
                for (let i = floaties.length - 1; i >= 0; i--) {
                    const f = floaties[i];
                    f.t += ticker.deltaMS / 1000;
                    f.node.y -= ticker.deltaMS * 0.03;
                    f.node.alpha = Math.max(0, 1 - f.t / 1.4);
                    if (f.t > 1.4) { f.node.destroy(); floaties.splice(i, 1); }
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

                // арки подземелий — касание (диалог открыт — молчат);
                // Честь/Время ещё без данжей — «Скоро…»
                if (!ctx.questModal && layer)
                for (const p of G.world.map.pois) {
                    if (p.kind !== "dungeon") continue;
                    const c = px(p);
                    if (Math.hypot(c.x - hx, c.y - hy) < TS * 0.85) {
                        if (globalThis.GAME_DATA.CAVES[p.cave]) {
                            enterCave(p.cave);
                        } else if (!p.soonAt || performance.now() - p.soonAt > 2500) {
                            p.soonAt = performance.now();
                            soonCount++;
                            if (ctx.sfx) ctx.sfx();
                            floatText(GAME_LOC.t("world.soon"), c.x, c.y, 0xd8c79d);
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
                        seed: G.world.seed,
                        pois: map ? map.pois.length : 0,
                        speed: heroId !== null ? COMPONENTS.ctrlSpeed[heroId] : null,
                        onRoad: !!(map && heroId !== null
                            && [T.ROAD, T.BRIDGE].includes(map.ter[
                                Math.floor(hero.y / TS) * map.w + Math.floor(hero.x / TS)])),
                        walkTarget,
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
                setHeroPos(x, y) {
                    if (heroId === null) return false;
                    COMPONENTS.positionX[heroId] = x;
                    COMPONENTS.positionY[heroId] = y;
                    path = null; // телепорт гасит маршрут клика
                    return true;
                },
                enterCave: (cave) => enterCave(cave),
                soonCount: () => soonCount,
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
                path: () => path,
                worldToScreen: (x, y) => (layer ? layer.toGlobal({ x, y }) : null),
            },
        };
    }

    globalThis.GAME_WORLD = { createWorldScene };
})();
