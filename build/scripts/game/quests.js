// СИСТЕМА КВЕСТОВ И ДИАЛОГОВ — линейка «Путь призывателя» (W30, юзер).
// Цепочка из 4 заданий живёт в ЗАБЕГЕ (G.quests, сейв sd_run). Задания
// ВЫДАЁТ NPC «Старина Глом» в городе (talkTo — вызов из объекта npc в
// городе): автозапуск анонса при входе в мир/подземелье убран. Окно
// награды по-прежнему открывается ПОСЛЕ экрана трофея (pending = квест
// выполнен, ждёт получения — переживает даже перезапуск на экране
// трофея). Диалоги модальные: пока открыт, герой стоит (ctx.questModal
// глушит оси и триггеры мира/подземелья).
// W31 (юзер): выдача — как в визуальных новеллах. Реплики печатаются
// ПОБУКВЕННО одна за другой; портрет квестодателя слева, портрет героя
// справа у текстового окна; тап — допечатать/дальше. После реплик —
// панель задания: в шапке НАЗВАНИЕ квеста (не «новое задание»), краткий
// текст, цель, награда и кнопки «Принять»/«Отказаться» (кнопки под
// текстом, в own зоне — правка бага перекрытия). Окно просмотра
// активного задания — та же панель + чекбокс стрелки-указателя цели
// (стрелка рисуется в мире, world.js, настройка G.settings.questArrow).
// Портреты: NPC images/npc/glom.png (арт кладёт юзер; файла нет —
// силуэт, не падает; при добавлении арта включить в предзагрузку
// main.js — там уже guarded-загрузка), герой images/heroes/<img>.png
// (грузится всегда).
// W32 (юзер): награда q1 — 4 ОБЫЧНЫЕ карты стихии героя только в
// КОЛЛЕКЦИЮ (колоду до гейта арки 16 игрок собирает сам в редакторе),
// в окне награды — ряд этих карт с ховер-зумом (cardZoomer, W20).
(function () {
    // kind: "wild" — победы над БРОДЯЧИМИ отрядами открытого мира
    // (счётчик kills), "win" — победа над любым врагом подземелья своей
    // фракции, "boss" — над Боссом этажа там же, "final" — чек-лист:
    // дно (последний этаж) + хозяин ямы (босс последнего этажа) +
    // драфт «Карта сокровищ» (markDraft из старта драфта).
    // W92 (юзер): продолжение после «Дна» — двухцветные подземелья:
    // "multiEnter" — вход в ЛЮБОЕ из них (elems у CAVES; onCaveEnter
    // из world.enterCave после гейтов колоды/ресурсов), "multiBoss" —
    // победа над боссом последнего (3-го) этажа любого из них.
    const QUESTS = [
        { id: "q1", kind: "wild", kills: 3, gold: 10, cards: 4 },
        { id: "q2", kind: "win", gold: 15 },
        { id: "q3", kind: "boss", gold: 25 },
        { id: "q4", kind: "final", gold: 50, rare: true, epilog: true },
        { id: "q5", kind: "multiEnter", gold: 20 },
        { id: "q6", kind: "multiBoss", gold: 50 },
    ];
    const nextOf = (id) => {
        const i = QUESTS.findIndex((q) => q.id === id);
        return i >= 0 && i + 1 < QUESTS.length ? QUESTS[i + 1].id : null;
    };

    // Состояние на новый забег: первый квест активен и ещё не взят —
    // его выдаёт Глом в городе при первом разговоре
    function fresh() {
        return {
            active: QUESTS[0].id, done: {}, announced: false, pending: null,
            progress: {},
        };
    }
    // Подъём из сейва: null — квесты явно выключены (профиль без квестов).
    // W60 (юзер): цепочка Глома даётся и выполняется СТРОГО последовательно
    // с первого квеста; активным может быть только валидный id или null.
    // Некорректное/отсутствующее состояние — новый забег с первого квеста
    function revive(saved) {
        if (saved === null) return null;
        if (!(saved && typeof saved === "object")
            || !(QUESTS.some((q) => q.id === saved.active) || saved.active === null))
            return fresh();
        return {
            active: saved.active,
            done: saved.done && typeof saved.done === "object" ? { ...saved.done } : {},
            announced: saved.announced === true,
            pending: QUESTS.some((q) => q.id === saved.pending) ? saved.pending : null,
            progress: saved.progress && typeof saved.progress === "object"
                ? { ...saved.progress } : {},
        };
    }

    function caveOfElem(elem) {
        const CAVES = globalThis.GAME_DATA.CAVES;
        return Object.keys(CAVES).find((k) => CAVES[k].elem === elem) || "gob";
    }
    // Имя босса подземелья фракции игрока — подстановка в текст квеста.
    // «Самый страшный враг» — босс данжа; у данжа БЕЗ босса — герой
    // верхнего этажа (резерв на будущие данжи; прежде имя подставлялось
    // пустым — «…по имени .», баг юзера)
    function bossName(G) {
        const D = globalThis.GAME_DATA;
        const cave = caveOfElem(G.elem);
        const info = D.CAVES[cave];
        let encId = info && info.boss;
        if (!encId && info) {
            const mobs = (D.MOB_TABLES && D.MOB_TABLES[cave]) || D.FLOOR_MOBS;
            const top = mobs[Math.min(info.maxFloor || 1, mobs.length) - 1];
            encId = top && top[0];
        }
        const hero = encId && D.ENCOUNTERS[encId] ? D.ENCOUNTERS[encId].hero : null;
        return hero ? globalThis.GAME_UI.foeTitle(hero) : "";
    }
    // Подстановки: q1 — счётчик побед, q4 — чек-лист «дно/хозяин/драфт»
    // (+/−) и имя хозяина ямы, q5 — текущий размер колоды (W92)
    function questVars(G, q) {
        const P = (G.quests && G.quests.progress) || {};
        if (q.id === "q1") return { n: Math.min(P.wildKills || 0, q.kills || 3) };
        // W60 (юзер): у q3 в тексте тоже {boss} — без подстановки печаталась
        // сырая ссылка «{boss}» (был открыт только q2)
        if (q.id === "q2" || q.id === "q3") return { boss: bossName(G) };
        if (q.id === "q5") return { n: Math.min(G.deck ? G.deck.length : 0, 24) };
        if (q.id === "q4") return {
            boss: bossName(G),
            b1: P.bottom ? "+" : "-", b2: P.finalBoss ? "+" : "-",
            b3: P.draft ? "+" : "-",
        };
        return null;
    }
    function questText(G, q) {
        return GAME_LOC.t(`quest.${q.id}.text`, questVars(G, q));
    }
    function questGoal(G, q) {
        return GAME_LOC.t(`quest.${q.id}.goal`, questVars(G, q));
    }
    // Название задания (шапка диалога вместо «НОВОЕ ЗАДАНИЕ», W31)
    function questName(q) {
        return GAME_LOC.t(`quest.${q.id}.name`);
    }

    const finalDone = (P) => !!(P.finalBoss && P.draft);

    // Реплики квеста: loc-список "кто|текст" (кто = glom|hero). {boss}
    // подставляется здесь — arr() локализации без интерполяции. Пустой
    // список (будущие квесты без реплик) — одна реплика Глома с текстом
    function questLines(G, q, key) {
        const boss = bossName(G);
        const raw = GAME_LOC.arr(`quest.${q.id}.${key || "lines"}`);
        const list = raw.map((s) => {
            const i = s.indexOf("|");
            const who = i > 0 && s.slice(0, i) === "hero" ? "hero" : "glom";
            return { who, text: (i >= 0 ? s.slice(i + 1) : s)
                .split("{boss}").join(boss) };
        });
        return list.length ? list : [{ who: "glom", text: questText(G, q) }];
    }
    function speakerName(G, who) {
        // имя героя — через foeTitle (W45, юзер): активным героем может
        // стать ЗАВОЁВАННЫЙ герой-враг («Герои» — captured), у него нет
        // ключа hero.<id>.name — показывался сырой ключ «ссылкой в коде»;
        // foeTitle умеет и тех (enc-заголовок), и стартовых (hero.<id>.name)
        return who === "hero"
            ? globalThis.GAME_UI.foeTitle(G.heroId)
            : GAME_LOC.t("city.npcName");
    }

    // Победа в бою (не драфт). kind "wild" считает БРОДЯЧИЕ победы мира,
    // остальные kinds — только подземелье своей фракции (бродячие бои им
    // безразличны). kind "final" — босс ПОСЛЕДНЕГО этажа своего данжа.
    // Возвращает id выполненного квеста или null.
    function onBattleWin(G, { boss, draft, wander }) {
        if (!G.quests || G.quests.pending || draft) return null;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        if (!q) return null;
        // (W49, юзер) квест, ещё НЕ ВЗЯТЫЙ у Глома (announced=false),
        // не выполняется и прогресс не копит: победы до разговора
        // засчитывать нельзя — окно «задание выполнено» выскочило у
        // юзера без взятого «Карты с улицы»
        if (!G.quests.announced) return null;
        const P = G.quests.progress;
        if (q.kind === "wild") {
            if (!wander) return null;
            P.wildKills = (P.wildKills || 0) + 1;
            if (P.wildKills < (q.kills || 3)) {
                if (G.saveRun) G.saveRun();
                return null;
            }
        } else {
            if (wander) return null;
            const D = globalThis.GAME_DATA;
            const cave = (G.dungeon && G.dungeon.cave) || G.run.cave || "gob";
            const info = D.CAVES[cave];
            const own = !!(info && info.elem === G.elem);
            // в данже без босса (пока «Залы Чести») роль босса квеста
            // играет главный враг верхнего этажа: победа на верхнем этаже
            // СВОЕГО данжа засчитывается — иначе задание «по имени
            // Конница» не выполнить
            const topWin = !!(info && !info.boss && G.dungeon
                && G.dungeon.floor >= info.maxFloor);
            if (q.kind === "win") {
                if (!own) return null;
            } else if (q.kind === "boss") {
                if (!(own && boss) && !(own && topWin)) return null;
            } else if (q.kind === "final") {
                if (!own || !boss) return null;
                // хозяин ямы — босс ПОСЛЕДНЕГО этажа (в данже без босса —
                // победа на верхнем этаже)
                if (!(G.dungeon.floor >= (info.maxFloor || 1))) return null;
                P.bottom = true; P.finalBoss = true;
                if (!finalDone(P)) {
                    if (G.saveRun) G.saveRun();
                    return null;
                }
            } else if (q.kind === "multiBoss") {
                // W92 (юзер): босс ПОСЛЕДНЕГО (3-го) этажа ЛЮБОГО
                // двухцветного подземелья. У всех мультицветных босс
                // стоит ТОЛЬКО в дальней комнате последнего этажа
                // (bossLast), но проверяем и этаж — честнее спеке.
                // G.dungeon живёт весь бой из подземелья и хранит cave/floor
                if (!(info && info.elems && boss)) return null;
                if (!(G.dungeon
                    && G.dungeon.floor >= (info.maxFloor || 3))) return null;
            } else return null;
        }
        G.quests.pending = q.id;
        if (G.saveRun) G.saveRun();
        return q.id;
    }

    // Вход в подземелье (W92, вызов из world.enterCave ПОСЛЕ всех гейтов
    // колоды/ресурсов — дальше вход уже точно случится): q5 — попадание
    // в ЛЮБОЕ двухцветное подземелье (elems у CAVES: «Рыжий лес», «Белая
    // пуща», «Небесный дворец», «Магодром», «Некро-раскопки»). Гейт арки
    // сам требует на входе 24 карты (caveDeckFor мультицветных), но и
    // тут проверяем явно — квест про колоду. Возвращает id выполненного
    // квеста или null.
    function onCaveEnter(G, caveId) {
        if (!G.quests || G.quests.pending) return null;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        // (W49, юзер) невзятый квест не выполняется — как у onBattleWin
        if (!q || q.kind !== "multiEnter" || !G.quests.announced) return null;
        const info = globalThis.GAME_DATA.CAVES[caveId];
        if (!(info && info.elems) || G.deck.length < 24) return null;
        G.quests.pending = q.id;
        if (G.saveRun) G.saveRun();
        return q.id;
    }

    // Участие в драфте «Карта сокровищ» (вызов из старта драфта, dungeon.js):
    // для активного «Дно» ставит галочку; обе галочки — квест выполнен
    function markDraft(G) {
        if (!G.quests || G.quests.pending) return;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        // (W49, юзер) тот же гейт, что у onBattleWin: невзятый квест
        // галочки не копит
        if (!q || q.kind !== "final" || !G.quests.announced) return;
        G.quests.progress.draft = true;
        if (finalDone(G.quests.progress)) G.quests.pending = q.id;
        if (G.saveRun) G.saveRun();
    }

    // Спуск на последний этаж своего данжа (вызов из входа в сцену
    // подземелья): галочка «дно» для активного «Дно»
    function noteFloor(G, floor) {
        if (!G.quests || G.quests.pending || !G.dungeon || G.dungeon.city) return;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        // (W49, юзер) тот же гейт, что у onBattleWin: невзятый квест
        // галочки не копит
        if (!q || q.kind !== "final" || !G.quests.announced) return;
        const info = globalThis.GAME_DATA.CAVES[G.dungeon.cave];
        if (info && floor >= (info.maxFloor || 1)) {
            G.quests.progress.bottom = true;
            if (G.saveRun) G.saveRun();
        }
    }

    // Награда картами. q1 (W32, юзер): 4 ОБЫЧНЫЕ карты стихии героя —
    // только в КОЛЛЕКЦИЮ (колоду до гейта арки 16 игрок собирает сам в
    // редакторе); берём РАЗНЫЕ, сперва добавимые в колоду (копий в
    // колоде < DECK_COPIES) — иначе награда рискует стать мёртвым весом.
    // q4 — редкая стихии: коллекция + сразу в колоду (как было)
    function rollCommonCards(G, n) {
        const CD = globalThis.GAME_CARD_DATA;
        const D = globalThis.GAME_DATA;
        // (W45, юзер) только карты С ЛИЦОМ: служебные токены без лица
        // (icePixie «Ледо-пикси», gobA, skel…) — не награда; тот же
        // фильтр, что у collectibleOf в dataCards
        const commons = Object.keys(CD.CARDS).filter((c) =>
            CD.CARDS[c].elem === G.elem && CD.CARDS[c].rarity === "common"
            && CD.CARDS[c].img);
        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };
        const inDeck = (id) => G.deck.filter((x) => x === id).length;
        const addable = shuffle(commons.filter((c) =>
            inDeck(c) < (D.DECK_COPIES || 3)));
        const rest = shuffle(commons.filter((c) => addable.indexOf(c) < 0));
        const out = addable.slice(0, n);
        while (out.length < n && rest.length) out.push(rest.shift());
        while (out.length < n && addable.length)
            out.push(addable[(Math.random() * addable.length) | 0]);
        return out;
    }
    function grantToCollection(G, ids) {
        for (const id of ids || [])
            G.collection[id] = (G.collection[id] || 0) + 1;
    }
    function grantCards(G, n, rare) {
        const D = globalThis.GAME_DATA;
        const CD = globalThis.GAME_CARD_DATA;
        for (let i = 0; i < n; i++) {
            let id = null;
            if (rare) {
                const pool = Object.keys(CD.CARDS).filter((c) =>
                    CD.CARDS[c].elem === G.elem && CD.CARDS[c].rarity === "rare");
                id = pool.length
                    ? pool[(Math.random() * pool.length) | 0]
                    : D.rollLootCard(G.elem);
            } else id = D.rollLootCard(G.elem);
            if (!id) continue;
            G.collection[id] = (G.collection[id] || 0) + 1;
            if (G.deck.length < (D.DECK_MAX || 60)) G.deck.push(id);
        }
    }

    // ── Цель активного задания (стрелка-указатель, W31) ─────────────────
    // Мир (world.js) рисует стрелку у героя в сторону этой точки.
    // pending — в город, к Глому (сдать); q1 — ближайший живой дикий
    // отряд; q2/q3/q4 — арка подземелья своей стихии. Иначе null.
    function arrowTarget(G, from) {
        if (!G || !G.quests || !G.world || !G.world.map) return null;
        const map = G.world.map;
        const px = (p) => ({ x: p.gx * 32 + 16, y: p.gy * 32 + 16 });
        if (G.quests.pending) {
            // «свой» стартовый город (ближайший spawnTown к спавну своей
            // стихии — городов-стартов шесть, первый в pois чужой)
            const sp = map.spawn[G.elem] || map.spawn.strength;
            let best = null, bd = Infinity;
            for (const p of map.pois) {
                if (!p.spawnTown) continue;
                const d = Math.hypot(p.gx - sp.gx, p.gy - sp.gy);
                if (d < bd) { bd = d; best = p; }
            }
            return best ? px(best) : null;
        }
        const q = QUESTS.find((x) => x.id === G.quests.active);
        if (!q || !G.quests.announced) return null;
        if (q.kind === "wild") {
            // (W45, юзер) стрелка — только к КОНКРЕТНОЙ цели квеста, а не
            // «к любому дикому»: q1 не имеет монстра-цели (победи любых 3),
            // и после побочного квеста-охоты стрелка «перецеплялась» на
            // следующего бродягу. q1 — без стрелки; q2–q4 ведут к арке
            return null;
        }
        // W92 (юзер): q5/q6 ведут к БЛИЖАЙШЕМУ двухцветному подземелью —
        // «любая арка на два цвета», какую стихию взять, герой решает сам
        if (q.kind === "multiEnter" || q.kind === "multiBoss") {
            const D = globalThis.GAME_DATA;
            const f = from || { x: 0, y: 0 };
            let best = null, bd = Infinity;
            for (const p of map.pois) {
                if (p.kind !== "dungeon") continue;
                const inf = D.CAVES[p.cave];
                if (!(inf && inf.elems)) continue;
                const d = Math.hypot((p.gx + 0.5) * 32 - f.x,
                    (p.gy + 0.5) * 32 - f.y);
                if (d < bd) { bd = d; best = p; }
            }
            return best ? px(best) : null;
        }
        const cave = caveOfElem(G.elem);
        const poi = map.pois.find((p) => p.kind === "dungeon" && p.cave === cave);
        return poi ? px(poi) : null;
    }

    // ── Диалог (визуальная новелла, W31) ────────────────────────────────
    // Фаза "lines": реплики побуквенно у нижнего края, портреты по бокам
    // (Глом слева, герой справа), тап — допечатать/следующая. Фаза
    // "final": панель задания с названием в шапке и кнопками ПОД текстом.
    let cur = null;

    // W79 (поправка юзера): «ускорение печатания реплик на Пробел (как в
    // визуальных новеллах)» — пока ПРОБЕЛ удерживается, буквы летят в 8
    // раз быстрее (шаг тикера 24мс → 3мс). Слушатели один раз на модуль;
    // preventDefault гасит прокрутку страницы и «клик» по сфокусированной
    // кнопке. Отпустили — обычная скорость; короткий тап даёт рывок
    let spaceHeld = false;
    window.addEventListener("keydown", (e) => {
        if (e.code !== "Space") return;
        spaceHeld = true;
        e.preventDefault();
        // W85 (юзер): нажатый ПРОБЕЛ при показанной «далее» листает
        // реплику, как Эскейп (тот в диалоге зовёт tap() → advance()).
        // Пока строка печатается — просто ускорение (W79); автоповтор
        // удержания не листает — одно нажатие = одна реплика
        if (!e.repeat && cur && cur.phase === "lines" && !cur.typing)
            advance();
    });
    window.addEventListener("keyup", (e) => {
        if (e.code === "Space") spaceHeld = false;
    });
    window.addEventListener("blur", () => { spaceHeld = false; });

    const VN_W = 1240, VN_H = 300, VN_BOTTOM = 56; // окно реплик
    const VN_PAD = 30; // зазор текстовый фрейм ↔ портрет (W33, юзер:
    // арт Глома квадратный — портрет шире прежнего силуэта, фиксированный
    // TXT_X=600 налезал на арт; рамка теперь считается по фактическим
    // спрайтам с РАВНЫМИ зазорами с обеих сторон)

    function closeDialog() {
        if (!cur) return;
        const d = cur;
        cur = null;
        if (d.typer) PIXI.Ticker.shared.remove(d.typer);
        d.ctx.questModal = Math.max(0, (d.ctx.questModal || 1) - 1);
        if (!d.node.destroyed) d.node.destroy({ children: true });
    }

    const T = (text, size, fill, opts = {}) => new PIXI.Text({
        text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
    });

    // портрет NPC: арт юзера npc/glom.png, без файла — силуэт в капюшоне
    // (как статуя NPC в городе, dungeon.js) — окно не падает
    function npcPortrait(ctx) {
        try {
            const tex = ctx.uiTex("npc/glom.png");
            const sp = new PIXI.Sprite(tex);
            sp.anchor.set(0.5, 1);
            // высота 230, но широкое будущее арт не раздвинет окно (кап 260)
            sp.scale.set(Math.min(230 / Math.max(tex.height, 1),
                260 / Math.max(tex.width, 1)));
            return sp;
        } catch (e) {
            const g = new PIXI.Graphics();
            g.scale.set(1.05);
            g.circle(0, -96, 52); g.fill({ color: 0x5a4632 });
            g.circle(0, -96, 40); g.fill({ color: 0x241a10 });
            g.roundRect(-64, -56, 128, 150, 30); g.fill({ color: 0x5a4632 });
            g.circle(-18, -96, 6); g.fill({ color: 0xf0c96a });
            g.circle(18, -96, 6); g.fill({ color: 0xf0c96a });
            return g;
        }
    }

    // портрет героя — карточный арт images/heroes/<img>.png (грузится всегда)
    function heroPortrait(ctx, G) {
        const HEROES = globalThis.GAME_DATA.HEROES;
        const h = HEROES[G.heroId] || HEROES.gorbag;
        const tex = ctx.uiTex(`heroes/${h.img}.png`);
        const sp = new PIXI.Sprite(tex);
        sp.anchor.set(0.5, 1);
        sp.scale.set(Math.min(230 / Math.max(tex.height, 1),
            260 / Math.max(tex.width, 1)));
        return sp;
    }

    // реплика: имя говорящего, текст, подсветка портрета, подсказка «далее»
    function startLine(i) {
        cur.li = i;
        const L = cur.lines[i];
        const full = L.text;
        cur.shown = 0;
        cur.typing = full.length > 0;
        cur.acc = 0;
        cur.nameL.text = speakerName(cur.ctx.G, L.who);
        cur.body.text = "";
        cur.hint.visible = false;
        // говорящий подсвечен, слушающий притушен (новелльный приём)
        cur.npcSp.alpha = L.who === "glom" ? 1 : 0.4;
        cur.heroSp.alpha = L.who === "hero" ? 1 : 0.4;
    }

    function advance() {
        if (cur.phase !== "lines") return;
        const full = cur.lines[cur.li].text;
        if (cur.typing) { // допечатать строку целиком
            cur.shown = full.length;
            cur.typing = false;
            cur.body.text = full;
            cur.hint.visible = true;
            return;
        }
        if (cur.li + 1 < cur.lines.length) startLine(cur.li + 1);
        else buildFinal();
    }

    // фаза "final": панель задания. Кнопки строго ПОД текстом (баг юзера:
    // «Принять» перекрывал награду): контент зажат выше строки кнопок
    function buildFinal() {
        cur.phase = "final";
        if (cur.typer) { PIXI.Ticker.shared.remove(cur.typer); cur.typer = null; }
        if (cur.vn) { // просмотр/награда открываются сразу финалом — окна реплик нет
            cur.node.removeChild(cur.vn);
            cur.vn.destroy({ children: true });
            cur.vn = null;
        }
        const ctx = cur.ctx, G = ctx.G;
        const q = QUESTS.find((x) => x.id === cur.questId);
        const t = (k, v) => GAME_LOC.t(k, v);
        const { button, cardFace } = globalThis.GAME_UI;
        const w = 900, h = 640, top = 540 - h / 2, x0 = 960 - w / 2;
        const panel = new PIXI.Graphics();
        panel.roundRect(x0, top, w, h, 18);
        panel.fill({ color: 0x171310, alpha: 0.96 });
        panel.stroke({ width: 4, color: 0x6b5c40 });
        cur.node.addChild(panel);
        // шапка — НАЗВАНИЕ задания; награда подписывает «выполнено»
        const header = T(questName(q), 46, 0xf0c96a,
            { stroke: { color: 0x241505, width: 8 } });
        header.anchor.set(0.5, 0);
        header.position.set(960, top + 28);
        header.eventMode = "none";
        cur.node.addChild(header);
        if (cur.kind === "reward") {
            const done = T(t("quest.doneHeader"), 20, 0x8c7f60);
            done.anchor.set(0.5, 0);
            done.position.set(960, top + 82);
            done.eventMode = "none";
            cur.node.addChild(done);
        }
        // кнопки: центр строки y = top + h - 78; контент — не ниже top+h-168
        const BTN_Y = top + h - 78, CAP = top + h - 168;
        let y = top + (cur.kind === "reward" ? 120 : 104);
        // краткий текст задания (анонс/просмотр; награда — без него)
        if (cur.kind !== "reward") {
            const body = T(questText(G, q), 26, 0xf3e6c2,
                { wordWrap: true, wordWrapWidth: 780, align: "left" });
            body.anchor.set(0.5, 0);
            body.position.set(960, y);
            body.eventMode = "none";
            cur.node.addChild(body);
            y = Math.min(y + body.height + 24, CAP - 110);
        }
        // цель (у q4 — чек-лист [+]/[-])
        const goal = T(t("quest.goalLabel") + " " + questGoal(G, q), 24, 0xbfd489,
            { wordWrap: true, wordWrapWidth: 780, align: "center" });
        goal.anchor.set(0.5, 0);
        goal.position.set(960, Math.min(y, CAP - 120));
        goal.eventMode = "none";
        cur.node.addChild(goal);
        y = Math.min(y + goal.height + 20, CAP - 90);
        // награда
        const gicon = new PIXI.Sprite(ctx.uiTex("icon_gold.png"));
        gicon.anchor.set(0.5);
        gicon.scale.set(0.62);
        gicon.position.set(960, y + 14);
        gicon.eventMode = "none";
        cur.node.addChild(gicon);
        const reward = T(t(`quest.${q.id}.reward`), 26, 0xffe2a8);
        reward.anchor.set(0.5, 0);
        reward.position.set(960, y + 44);
        reward.eventMode = "none";
        cur.node.addChild(reward);
        y = Math.min(y + 44 + reward.height + 16, CAP - 34);
        // ряд обычных карт награды q1 (W32, юзер): лица с ховер-зумом
        // «как и везде» (cardZoomer, W20); в коллекцию — кнопкой «Забрать»
        if (cur.kind === "reward" && q.cards) {
            cur.rewardCards = rollCommonCards(G, q.cards);
            cur.cardUi = [];
            const sc = 0.28, hh = 495 * sc / 2; // полувысота лица cardFace
            const n = cur.rewardCards.length;
            const spread = Math.min(150, 760 / Math.max(1, n));
            const cy = Math.min(y + 80, CAP - hh - 6);
            cur.rewardCards.forEach((id, i) => {
                const card = cardFace(ctx, id, { scale: sc });
                const cx = 960 + (i - (n - 1) / 2) * spread;
                card.position.set(cx, cy);
                card.eventMode = "static";
                card.on("pointerover", () => {
                    if (cur.zoomer) cur.zoomer.show(id, cx, cy, card, sc);
                });
                card.on("pointerout", () => {
                    if (cur.zoomer) cur.zoomer.hide(false);
                });
                cur.node.addChild(card);
                cur.cardUi.push({ id, x: cx, y: cy });
                (cur.cardNodes = cur.cardNodes || []).push(card);
            });
            y = Math.min(cy + hh + 12, CAP);
        }
        // чекбокс стрелки-указателя — в окне ПРОСМОТРА (W31, юзер)
        if (cur.kind === "review") {
            const on = () => !!(G.settings && G.settings.questArrow !== false);
            const box = new PIXI.Graphics();
            const mark = new PIXI.Graphics();
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
            box.position.set(rx, y + 2);
            mark.position.set(rx, y + 2);
            lab.position.set(rx + 42, y + 16);
            box.eventMode = "static";
            mark.eventMode = "none";
            lab.eventMode = "none";
            box.on("pointertap", () => {
                G.settings = G.settings || {};
                G.settings.questArrow = !on();
                if (globalThis.GAME_META && globalThis.GAME_META.saveSettings)
                    globalThis.GAME_META.saveSettings(G.settings);
                drawBox();
                if (ctx.sfx) ctx.sfx();
            });
            cur.node.addChild(box);
            cur.node.addChild(mark);
            cur.node.addChild(lab);
            cur.checkbox = () => on();
        }
        // кнопки ПОД контентом (панель шире зоны контента — перекрытий нет)
        const mkBtn = (label, x, onTap, scale) => {
            const b = button(ctx, { tex: "button_menu.png", label, x,
                y: BTN_Y, scale, onTap });
            cur.node.addChild(b);
            return b;
        };
        if (cur.kind === "announce") {
            // отказ: квест остаётся невзятым — Глом предложит снова
            cur.declineBtn = mkBtn(t("quest.decline"), 960 - 200,
                () => closeDialog(), 0.85);
            cur.primary = mkBtn(t("quest.accept"), 960 + 200, () => {
                G.quests.announced = true;
                if (G.saveRun) G.saveRun();
                closeDialog();
            }, 0.95);
        } else if (cur.kind === "review") {
            cur.primary = mkBtn(t("quest.close"), 960, () => closeDialog(), 0.95);
        } else { // reward: золото/карты, следующий квест ждёт Глома
            cur.primary = mkBtn(t("quest.claim"), 960, () => {
                G.gold += q.gold;
                // обычные наградные — В КОЛЛЕКЦИЮ (W32); ряд карт мог не
                // успеть построиться — тогда катаем на месте
                if (q.cards) grantToCollection(G, cur.rewardCards
                    || rollCommonCards(G, q.cards));
                if (q.rare) grantCards(G, 1, true);
                G.quests.done[q.id] = true;
                G.quests.pending = null;
                G.quests.active = nextOf(q.id);
                G.quests.announced = false; // следующий квест выдаёт Глом
                if (ctx.sfx) ctx.sfx("coins");
                if (G.saveRun) G.saveRun();
                closeDialog();
            }, 0.95);
        }
        // для dialogInfo/проб
        cur.finalText = cur.kind === "reward" ? "" : questText(G, q);
    }

    function openDialog(ctx, { kind, questId }) {
        closeDialog(); // один диалог одновременно
        const G = ctx.G;
        const q = QUESTS.find((x) => x.id === questId);
        if (!q) return;
        const node = new PIXI.Container();
        node.eventMode = "static";
        const dim = new PIXI.Graphics();
        dim.rect(-3000, -2000, 7920, 5080); // с запасом за 1920×1080
        dim.fill({ color: 0x000000, alpha: 0.6 });
        node.addChild(dim);
        // реплики: анонс и эпилог q4; просмотр/обычная награда — сразу панель
        const lines = kind === "announce" ? questLines(G, q, "lines")
            : kind === "reward" && q.epilog ? questLines(G, q, "epilogLines")
            : null;
        cur = {
            kind, questId, ctx, node,
            phase: lines ? "lines" : "final",
            lines: lines || questLines(G, q, "lines"),
            li: 0, shown: 0, typing: false, acc: 0,
            primary: null, checkbox: null, vn: null, typer: null,
        };
        // ховер-зум наградных карт (W32): host — узел диалога, копия
        // растёт до полного размера, как на экране награды/в магазине
        cur.zoomer = globalThis.GAME_UI.cardZoomer(ctx, { host: () => cur.node });
        if (lines) {
            // ── окно реплик (новелла) ────────────────────────────────────
            const vn = new PIXI.Container();
            const bx = 960 - VN_W / 2, by = 1080 - VN_BOTTOM - VN_H;
            const panel = new PIXI.Graphics();
            panel.roundRect(bx, by, VN_W, VN_H, 18);
            panel.fill({ color: 0x171310, alpha: 0.96 });
            panel.stroke({ width: 4, color: 0x6b5c40 });
            vn.addChild(panel);
            // портреты по сторонам окна: квестодатель слева, герой справа
            const npc = npcPortrait(ctx);
            npc.position.set(bx + 160, by + VN_H - 22);
            npc.eventMode = "none";
            vn.addChild(npc);
            const hero = heroPortrait(ctx, G);
            hero.position.set(bx + VN_W - 160, by + VN_H - 22);
            hero.eventMode = "none";
            vn.addChild(hero);
            // текстовый фрейм МЕЖДУ портретами: левый/правый край — по
            // фактическим спрайтам с равным зазором VN_PAD (у Арта Глома
            // ширина 230, у карточного арта героя ~156 — константа врала)
            const txX = Math.round(npc.x + npc.width / 2 + VN_PAD);
            const txR = Math.round(hero.x - hero.width / 2 - VN_PAD);
            const txW = Math.max(360, txR - txX);
            const nameL = T("", 26, 0xf0c96a,
                { stroke: { color: 0x241505, width: 6 } });
            nameL.anchor.set(0, 0);
            nameL.position.set(txX, by + 26);
            nameL.eventMode = "none";
            vn.addChild(nameL);
            const body = T("", 26, 0xf3e6c2,
                { wordWrap: true, wordWrapWidth: txW, align: "left" });
            body.anchor.set(0, 0);
            body.position.set(txX, by + 64);
            body.eventMode = "none";
            vn.addChild(body);
            const hint = T(GAME_LOC.t("quest.next"), 20, 0x8c7f60);
            hint.anchor.set(1, 0.5);
            hint.position.set(txR, by + VN_H - 26);
            hint.eventMode = "none";
            vn.addChild(hint);
            node.addChild(vn);
            cur.vn = vn;
            cur.npcSp = npc;
            cur.heroSp = hero;
            cur.nameL = nameL;
            cur.body = body;
            cur.hint = hint;
            // тап по затемнению — допечатать/дальше (кнопки финала отдельно)
            node.on("pointertap", () => advance());
            // печатание по буквам — общий тикер Pixi (~42 знака/сек);
            // с зажатым Пробелом — ~330 знаков/сек (поправка юзера, W79)
            cur.typer = (tk) => {
                if (!cur || cur.phase !== "lines" || !cur.typing) return;
                cur.acc += tk.deltaMS;
                const full = cur.lines[cur.li].text;
                const step = spaceHeld ? 3 : 24;
                while (cur.typing && cur.acc >= step) {
                    cur.acc -= step;
                    cur.shown++;
                    if (cur.shown >= full.length) cur.typing = false;
                }
                cur.body.text = full.slice(0, cur.shown);
                if (!cur.typing) cur.hint.visible = true;
            };
            PIXI.Ticker.shared.add(cur.typer);
            startLine(0);
        } else {
            buildFinal();
        }
        ctx.ui.addChild(node);
        ctx.questModal = (ctx.questModal || 0) + 1;
    }

    // Вход в мир/подземелье: только окно награды за выполненный квест
    // (в т.ч. восстановление после перезапуска на экране трофея). Выдача
    // новых заданий — РАЗГОВОР С ГЛОМОМ в городе (talkTo)
    function onSceneEnter(ctx) {
        const G = ctx.G;
        if (!G.quests || cur) return;
        if (G.quests.pending)
            openDialog(ctx, { kind: "reward", questId: G.quests.pending });
    }

    // Разговор с NPC: награда важнее выдачи, выдача важнее просмотра.
    // НЕвыданный квест через HUD-иконку не открывается — только у Глома
    function talkTo(ctx) {
        const G = ctx && ctx.G;
        if (!G || !G.quests || cur) return false;
        if (G.quests.pending) {
            openDialog(ctx, { kind: "reward", questId: G.quests.pending });
            return true;
        }
        if (!G.quests.active) return false;
        if (!G.quests.announced) {
            openDialog(ctx, { kind: "announce", questId: G.quests.active });
            return true;
        }
        openDialog(ctx, { kind: "review", questId: G.quests.active });
        return true;
    }

    // Страховка от «осиротевшего» диалога при программном уходе со сцены
    function forcedClose(ctx) {
        if (cur && (!ctx || cur.ctx === ctx)) closeDialog();
    }

    // Просмотр активного задания через HUD-иконку: только УЖЕ выданное
    // (выдача новых — у Глома в городе); окно награды важнее
    function showReview(ctx) {
        const G = ctx && ctx.G;
        if (!G || !G.quests || cur) return false;
        if (G.quests.pending) {
            openDialog(ctx, { kind: "reward", questId: G.quests.pending });
            return true;
        }
        if (!G.quests.active || !G.quests.announced) return false;
        openDialog(ctx, { kind: "review", questId: G.quests.active });
        return true;
    }

    globalThis.GAME_QUESTS = {
        QUESTS, fresh, revive, onBattleWin, onSceneEnter, talkTo,
        showReview, forcedClose, bossName, markDraft, noteFloor, arrowTarget,
        onCaveEnter, // W92: вход в двухцветное подземелье (world.enterCave)
        stateOf: (G) => (G.quests ? {
            active: G.quests.active, done: { ...(G.quests.done || {}) },
            announced: !!G.quests.announced, pending: G.quests.pending || null,
            progress: { ...(G.quests.progress || {}) },
        } : null),
        dialogInfo: () => {
            if (!cur) return null;
            const q = QUESTS.find((x) => x.id === cur.questId);
            const L = cur.phase === "lines" ? cur.lines[cur.li] : null;
            return {
                kind: cur.kind, questId: cur.questId,
                phase: cur.phase, line: cur.li + 1, lines: cur.lines.length,
                typing: cur.phase === "lines" ? cur.typing : false,
                speaker: L ? L.who : null,
                name: L ? speakerName(cur.ctx.G, L.who) : null,
                header: cur.phase === "final" ? questName(q) : null,
                // в фазе реплик — НАПЕЧАТАННАЯ часть строки (пробы видят
                // побуквенное печатание), в финале — краткий текст задания
                text: cur.phase === "lines" ? cur.body.text : cur.finalText,
                goal: q ? questGoal(cur.ctx.G, q) : "",
                reward: q ? GAME_LOC.t(`quest.${q.id}.reward`) : "",
                gold: q ? q.gold : 0,
                // наградные карты (W32): id ряда и его геометрия (пробы),
                // состояние ховер-зума
                cards: cur.phase === "final" && cur.rewardCards
                    ? [...cur.rewardCards] : null,
                cardUi: cur.phase === "final" && cur.cardUi
                    ? cur.cardUi.map((c) => ({ ...c })) : null,
                zoom: cur.zoomer ? cur.zoomer.state() : null,
                // текстовый фрейм фазы реплик (W33, пробы): левый край,
                // ширина переноса и фактические зазоры до портретов
                txt: cur.vn ? {
                    x: Math.round(cur.nameL.position.x),
                    w: Math.round(cur.body.style.wordWrapWidth),
                    padL: Math.round(cur.nameL.position.x
                        - (cur.npcSp.x + cur.npcSp.width / 2)),
                    padR: Math.round((cur.heroSp.x - cur.heroSp.width / 2)
                        - (cur.nameL.position.x
                            + cur.body.style.wordWrapWidth)),
                } : null,
                arrowOn: cur.checkbox ? !!cur.checkbox() : null,
                buttons: cur.phase === "final"
                    ? (cur.kind === "announce"
                        ? [GAME_LOC.t("quest.decline"), GAME_LOC.t("quest.accept")]
                        : [GAME_LOC.t(cur.kind === "reward" ? "quest.claim" : "quest.close")])
                    : [],
                modal: (cur.ctx.questModal || 0) > 0,
            };
        },
        tap: () => {
            if (!cur) return false;
            if (cur.phase === "lines") { advance(); return true; }
            if (cur.primary) cur.primary.emit("pointertap");
            return true;
        },
        // пробы: отказ от выдачи (квест остаётся невзятым)
        tapDecline: () => {
            if (!cur || cur.phase !== "final" || !cur.declineBtn) return false;
            cur.declineBtn.emit("pointertap");
            return true;
        },
        // пробы: узлы ряда наградных карт (эмит pointerover/out без мыши)
        rewardCardNodes: () => (cur && cur.cardNodes
            ? cur.cardNodes.filter((n) => !n.destroyed) : []),
    };
})();
