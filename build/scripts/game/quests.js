// СИСТЕМА КВЕСТОВ И ДИАЛОГОВ — линейка «Путь призывателя» (W30, юзер).
// Цепочка из 4 заданий живёт в ЗАБЕГЕ (G.quests, сейв sd_run). Задания
// ВЫДАЁТ NPC «Старина Глом» в городе (talkTo — вызов из объекта npc в
// городе): автозапуск анонса при входе в мир/подземелье убран. Окно
// награды по-прежнему открывается ПОСЛЕ экрана трофея (pending = квест
// выполнен, ждёт получения — переживает даже перезапуск на экране
// трофея). Диалоги модальные: пока открыт, герой стоит (ctx.questModal
// глушит оси и триггеры мира/подземелья). У анонса и просмотра слева
// портрет NPC images/npc/glom.png (арт кладёт юзер; файла нет — окно
// без портрета, не падает; при добавлении арта включить в UI_FILES
// main.js).
(function () {
    // kind: "wild" — победы над БРОДЯЧИМИ отрядами открытого мира
    // (счётчик kills), "win" — победа над любым врагом подземелья своей
    // фракции, "boss" — над Боссом этажа там же, "final" — чек-лист:
    // дно (последний этаж) + хозяин ямы (босс последнего этажа) +
    // драфт «Карта сокровищ» (markDraft из старта драфта).
    const QUESTS = [
        { id: "q1", kind: "wild", kills: 3, gold: 10, cards: 4 },
        { id: "q2", kind: "win", gold: 15 },
        { id: "q3", kind: "boss", gold: 25 },
        { id: "q4", kind: "final", gold: 50, rare: true, epilog: true },
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
            progress: {}, qv: 2,
        };
    }
    // Подъём из сейва: null — квесты явно выключены (профиль без квестов).
    // qv=2 — формат линейки «Путь призывателя» (4 квеста, прогресс);
    // сейвы старого формата (q1 win / q2 boss) мигрируют: смыслы сдвинулись
    // на квест позже — выполненный «win» = новый q2, «boss» = новый q3
    const MIGRATE = { q1: "q2", q2: "q3" };
    function revive(saved) {
        if (saved === null) return null;
        if (saved && typeof saved === "object" && saved.qv === 2
            && (QUESTS.some((q) => q.id === saved.active) || saved.active === null)) {
            return {
                active: saved.active || null,
                done: saved.done && typeof saved.done === "object" ? { ...saved.done } : {},
                announced: saved.announced !== false,
                pending: QUESTS.some((q) => q.id === saved.pending) ? saved.pending : null,
                progress: saved.progress && typeof saved.progress === "object"
                    ? { ...saved.progress } : {},
                qv: 2,
            };
        }
        const st = fresh();
        if (saved && typeof saved === "object") {
            // старый формат: сдвиг идентификаторов на шаг позже
            for (const k of Object.keys(saved.done || {}))
                if (MIGRATE[k]) st.done[MIGRATE[k]] = true;
            const shift = (id) => (id && MIGRATE[id]) || null;
            st.active = saved.active ? shift(saved.active)
                : (Object.keys(st.done).length >= 3 ? null : st.active);
            if (st.active && st.done[st.active]) st.active = nextOf(st.active);
            st.pending = shift(saved.pending);
            st.announced = saved.announced !== false;
        } else {
            st.announced = true; // сейв без квестов — диалог посреди чужого забега не выскакивает
        }
        return st;
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
    // (+/−) и имя хозяина ямы
    function questVars(G, q) {
        const P = (G.quests && G.quests.progress) || {};
        if (q.id === "q1") return { n: Math.min(P.wildKills || 0, q.kills || 3) };
        if (q.id === "q2") return { boss: bossName(G) };
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

    const finalDone = (P) => !!(P.finalBoss && P.draft);

    // Победа в бою (не драфт). kind "wild" считает БРОДЯЧИЕ победы мира,
    // остальные kinds — только подземелье своей фракции (бродячие бои им
    // безразличны). kind "final" — босс ПОСЛЕДНЕГО этажа своего данжа.
    // Возвращает id выполненного квеста или null.
    function onBattleWin(G, { boss, draft, wander }) {
        if (!G.quests || G.quests.pending || draft) return null;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        if (!q) return null;
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
            } else return null;
        }
        G.quests.pending = q.id;
        if (G.saveRun) G.saveRun();
        return q.id;
    }

    // Участие в драфте «Карта сокровищ» (вызов из старта драфта, dungeon.js):
    // для активного «Дно» ставит галочку; обе галочки — квест выполнен
    function markDraft(G) {
        if (!G.quests || G.quests.pending) return;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        if (!q || q.kind !== "final") return;
        G.quests.progress.draft = true;
        if (finalDone(G.quests.progress)) G.quests.pending = q.id;
        if (G.saveRun) G.saveRun();
    }

    // Спуск на последний этаж своего данжа (вызов из входа в сцену
    // подземелья): галочка «дно» для активного «Дно»
    function noteFloor(G, floor) {
        if (!G.quests || G.quests.pending || !G.dungeon || G.dungeon.city) return;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        if (!q || q.kind !== "final") return;
        const info = globalThis.GAME_DATA.CAVES[G.dungeon.cave];
        if (info && floor >= (info.maxFloor || 1)) {
            G.quests.progress.bottom = true;
            if (G.saveRun) G.saveRun();
        }
    }

    // Награда картами: q1 — 4 обычных из пула стихии ПРЯМО В КОЛОДУ
    // (гейт арки 16 карт должен открыться сам), q4 — редкая стихии.
    // Карты одновременно попадают в коллекцию
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

    // ── Диалоговое окно (общее для анонса / награды / просмотра) ─────────
    let cur = null; // { kind, questId, ctx, node, btn, headerText }

    function closeDialog() {
        if (!cur) return;
        const d = cur;
        cur = null;
        d.ctx.questModal = Math.max(0, (d.ctx.questModal || 1) - 1);
        if (!d.node.destroyed) d.node.destroy({ children: true });
    }

    function openDialog(ctx, { kind, questId }) {
        closeDialog(); // один диалог одновременно
        const G = ctx.G;
        const q = QUESTS.find((x) => x.id === questId);
        if (!q) return;
        const t = (k, v) => GAME_LOC.t(k, v);
        const { T, button } = globalThis.GAME_UI;
        const node = new PIXI.Container();
        node.eventMode = "static";
        const dim = new PIXI.Graphics();
        dim.rect(-3000, -2000, 7920, 5080); // с запасом за 1920×1080
        dim.fill({ color: 0x000000, alpha: 0.6 });
        node.addChild(dim);
        const w = 900, h = 620, top = 540 - h / 2;
        const panel = new PIXI.Graphics();
        panel.roundRect(960 - w / 2, top, w, h, 18);
        panel.fill({ color: 0x171310, alpha: 0.96 });
        panel.stroke({ width: 4, color: 0x6b5c40 });
        node.addChild(panel);
        // портрет NPC (арт юзера): файл не подгружен — окно без портрета
        let portrait = null;
        try { portrait = ctx.uiTex("npc/glom.png"); } catch (e) { portrait = null; }
        const headerText = t(kind === "reward" ? "quest.doneHeader"
            : kind === "announce" ? "quest.newHeader" : "quest.header");
        const header = T(headerText, 48, 0xf0c96a,
            { stroke: { color: 0x241505, width: 8 } });
        header.anchor.set(0.5, 0);
        header.position.set(960, top + 30);
        header.eventMode = "none";
        node.addChild(header);
        // анонс показывает РЕПЛИКИ Глома, просмотр — текст задания,
        // награда q4 — прощание (эпилог)
        const bodyText = kind === "announce" ? t(`quest.${q.id}.dialog`)
            : kind === "reward" && q.epilog ? t(`quest.${q.id}.epilog`)
            : questText(G, q);
        const bodyX = portrait ? 960 - w / 2 + 250 : 960;
        const bodyW = portrait ? w - 290 : 790;
        let y = top + 122;
        if (portrait) { // слева портрет, тело — справа от него
            const sp = new PIXI.Sprite(portrait);
            sp.anchor.set(0.5, 0);
            sp.position.set(960 - w / 2 + 130, top + 120);
            sp.eventMode = "none";
            node.addChild(sp);
        }
        if (kind !== "reward" || q.epilog) { // тело: анонс/просмотр/эпилог
            const body = T(bodyText, portrait ? 24 : 30, 0xf3e6c2,
                { wordWrap: true, wordWrapWidth: bodyW, align: "left" });
            body.anchor.set(0, 0);
            body.position.set(portrait ? bodyX : 960, y);
            if (!portrait) body.anchor.set(0.5, 0);
            body.eventMode = "none";
            node.addChild(body);
            y += body.height + 30;
        }
        const goal = T(t("quest.goalLabel") + " " + questGoal(G, q),
            26, 0xbfd489, { wordWrap: true, wordWrapWidth: 790, align: "center" });
        goal.anchor.set(0.5, 0);
        goal.position.set(960, Math.min(y, top + h - 230));
        goal.eventMode = "none";
        node.addChild(goal);
        y = Math.min(y + goal.height + 30, top + h - 160);
        const gicon = new PIXI.Sprite(ctx.uiTex("icon_gold.png"));
        gicon.anchor.set(0.5);
        gicon.scale.set(0.72);
        gicon.position.set(960, y + 18);
        gicon.eventMode = "none";
        node.addChild(gicon);
        const reward = T(t(`quest.${q.id}.reward`), 30, 0xffe2a8);
        reward.anchor.set(0.5, 0);
        reward.position.set(960, y + 52);
        reward.eventMode = "none";
        node.addChild(reward);
        // получение награды: золото/карты, следующий квест цепочки ждёт
        // СВОЕГО разговора с Гломом в городе (автоанонса больше нет)
        const claim = () => {
            G.gold += q.gold;
            if (q.cards) grantCards(G, q.cards, false);
            if (q.rare) grantCards(G, 1, true);
            G.quests.done[q.id] = true;
            G.quests.pending = null;
            G.quests.active = nextOf(q.id);
            G.quests.announced = false; // следующий квест выдаёт Глом (разговор в городе)
            if (ctx.sfx) ctx.sfx("coins");
            if (G.saveRun) G.saveRun();
        };
        const btn = button(ctx, {
            tex: "button_menu.png",
            label: t(kind === "announce" ? "quest.accept"
                : kind === "reward" ? "quest.claim" : "quest.close"),
            x: 960, y: top + h - 74, scale: 1,
            onTap: () => {
                if (kind === "announce") {
                    G.quests.announced = true;
                    if (G.saveRun) G.saveRun();
                }
                closeDialog();
                if (kind === "reward") claim();
            },
        });
        node.addChild(btn);
        ctx.ui.addChild(node);
        ctx.questModal = (ctx.questModal || 0) + 1;
        cur = { kind, questId, ctx, node, btn, headerText };
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
        showReview, forcedClose, bossName, markDraft, noteFloor,
        stateOf: (G) => (G.quests ? {
            active: G.quests.active, done: { ...(G.quests.done || {}) },
            announced: !!G.quests.announced, pending: G.quests.pending || null,
            progress: { ...(G.quests.progress || {}) },
        } : null),
        dialogInfo: () => {
            if (!cur) return null;
            const t = (k, v) => GAME_LOC.t(k, v);
            const q = QUESTS.find((x) => x.id === cur.questId);
            const body = !q ? "" : cur.kind === "announce" ? t(`quest.${q.id}.dialog`)
                : cur.kind === "reward" && q.epilog ? t(`quest.${q.id}.epilog`)
                : questText(cur.ctx.G, q);
            return {
                kind: cur.kind, questId: cur.questId, gold: q ? q.gold : 0,
                header: cur.headerText,
                text: body,
                goal: q ? questGoal(cur.ctx.G, q) : "",
                modal: (cur.ctx.questModal || 0) > 0,
            };
        },
        tap: () => {
            if (!cur) return false;
            cur.btn.emit("pointertap");
            return true;
        },
    };
})();
