// СИСТЕМА КВЕСТОВ И ДИАЛОГОВ — основная сюжетная линия (просил юзер).
// Цепочка заданий живёт в ЗАБЕГЕ (G.quests, сейв sd_run): новый квест
// анонсируется диалогом при входе в мир/подземелье, победа в подземелье
// СВОЕЙ стихии (фракции героя) выполняет задание, а окно награды
// открывается ПОСЛЕ экрана выбора наградной карты — то есть на входе в
// подземелье после трофея (pending = квест выполнен, ждёт получения;
// так окно переживает даже перезапуск на экране трофея). Диалоги
// модальные: пока открыт, герой стоит (ctx.questModal глушит оси
// и триггеры мира/подземелья).
(function () {
    // Основная сюжетная линия. kind: "win" — победа над любым врагом
    // подземелья своей фракции, "boss" — победа над Боссом этажа там же.
    const QUESTS = [
        { id: "q1", kind: "win", gold: 10 },
        { id: "q2", kind: "boss", gold: 20 },
    ];
    const nextOf = (id) => {
        const i = QUESTS.findIndex((q) => q.id === id);
        return i >= 0 && i + 1 < QUESTS.length ? QUESTS[i + 1].id : null;
    };

    // Состояние на новый забег: первый квест активен, ещё не анонсирован
    // (окно «Новое задание» откроется при первом входе в мир)
    function fresh() {
        return { active: QUESTS[0].id, done: {}, announced: false, pending: null };
    }
    // Подъём из сейва: null — квесты явно выключены (профиль без квестов);
    // старые сейвы без поля получают q1 уже «анонсированным» — диалог не
    // выскакивает посреди чужого забега
    function revive(saved) {
        if (saved === null) return null;
        if (saved && typeof saved === "object"
            && (QUESTS.some((q) => q.id === saved.active) || saved.active === null)) {
            return {
                active: saved.active || null,
                done: saved.done && typeof saved.done === "object" ? { ...saved.done } : {},
                announced: saved.announced !== false,
                pending: QUESTS.some((q) => q.id === saved.pending) ? saved.pending : null,
            };
        }
        const st = fresh();
        st.announced = true;
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
    function questText(G, q) {
        return GAME_LOC.t(`quest.${q.id}.text`,
            q.id === "q2" ? { boss: bossName(G) } : null);
    }

    // Победа в бою (не драфт): выполняет активный квест, если бой был
    // в подземелье фракции игрока (у квеста «boss» — над Боссом этажа).
    // Возвращает id выполненного квеста или null.
    function onBattleWin(G, { boss, draft }) {
        if (!G.quests || G.quests.pending || draft) return null;
        const q = QUESTS.find((x) => x.id === G.quests.active);
        if (!q) return null;
        const D = globalThis.GAME_DATA;
        const cave = (G.dungeon && G.dungeon.cave) || G.run.cave || "gob";
        const info = D.CAVES[cave];
        const own = !!(info && info.elem === G.elem);
        // в данже без босса (пока «Залы Чести») роль босса квеста играет
        // главный враг верхнего этажа: победа на верхнем этаже СВОЕГО данжа
        // засчитывается — иначе задание «по имени Конница» не выполнить
        const topWin = !!(q.kind === "boss" && own && info && !info.boss
            && G.dungeon && G.dungeon.floor >= info.maxFloor);
        const hit = q.kind === "boss" ? (own && !!boss) || topWin : own;
        if (!hit) return null;
        G.quests.pending = q.id;
        if (G.saveRun) G.saveRun();
        return q.id;
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
        const headerText = t(kind === "reward" ? "quest.doneHeader"
            : kind === "announce" ? "quest.newHeader" : "quest.header");
        const header = T(headerText, 48, 0xf0c96a,
            { stroke: { color: 0x241505, width: 8 } });
        header.anchor.set(0.5, 0);
        header.position.set(960, top + 30);
        header.eventMode = "none";
        node.addChild(header);
        let y = top + 122;
        if (kind !== "reward") { // текст задания — в анонсе и просмотре
            const body = T(questText(G, q), 30, 0xf3e6c2,
                { wordWrap: true, wordWrapWidth: 790, align: "center" });
            body.anchor.set(0.5, 0);
            body.position.set(960, y);
            body.eventMode = "none";
            node.addChild(body);
            y += body.height + 30;
        }
        const goal = T(t("quest.goalLabel") + " " + t(`quest.${q.id}.goal`),
            26, 0xbfd489, { wordWrap: true, wordWrapWidth: 790, align: "center" });
        goal.anchor.set(0.5, 0);
        goal.position.set(960, y);
        goal.eventMode = "none";
        node.addChild(goal);
        y += goal.height + 30;
        const gicon = new PIXI.Sprite(ctx.uiTex("icon_gold.png"));
        gicon.anchor.set(0.5);
        gicon.scale.set(0.72);
        gicon.position.set(960, y + 18);
        gicon.eventMode = "none";
        node.addChild(gicon);
        const reward = T(t("quest.rewardGot", { n: q.gold }), 30, 0xffe2a8);
        reward.anchor.set(0.5, 0);
        reward.position.set(960, y + 52);
        reward.eventMode = "none";
        node.addChild(reward);
        // получение награды: золото, следующий квест цепочки анонсируется
        // сразу следом за закрытием окна
        const claim = () => {
            G.gold += q.gold;
            G.quests.done[q.id] = true;
            G.quests.pending = null;
            G.quests.active = nextOf(q.id);
            G.quests.announced = !!G.quests.active;
            if (ctx.sfx) ctx.sfx("coins");
            if (G.saveRun) G.saveRun();
            const nxt = G.quests.active;
            if (nxt) {
                G.quests.announced = false;
                openDialog(ctx, { kind: "announce", questId: nxt });
            }
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

    // Вход в мир/подземелье: окно награды за выполненный квест (в т.ч.
    // восстановление после перезапуска на экране трофея) важнее анонса
    function onSceneEnter(ctx) {
        const G = ctx.G;
        if (!G.quests || cur) return;
        if (G.quests.pending)
            openDialog(ctx, { kind: "reward", questId: G.quests.pending });
        else if (G.quests.active && !G.quests.announced)
            openDialog(ctx, { kind: "announce", questId: G.quests.active });
    }

    // Просмотр активного задания (иконка квеста в HUD мира/подземелья)
    function showReview(ctx) {
        const G = ctx.G;
        if (!G.quests || cur) return false;
        if (G.quests.pending) {
            openDialog(ctx, { kind: "reward", questId: G.quests.pending });
            return true;
        }
        if (!G.quests.active) return false;
        openDialog(ctx, { kind: "review", questId: G.quests.active });
        return true;
    }

    // Страховка от «осиротевшего» диалога при программном уходе со сцены
    function forcedClose(ctx) {
        if (cur && (!ctx || cur.ctx === ctx)) closeDialog();
    }

    globalThis.GAME_QUESTS = {
        QUESTS, fresh, revive, onBattleWin, onSceneEnter, showReview,
        forcedClose, bossName,
        stateOf: (G) => (G.quests ? {
            active: G.quests.active, done: { ...(G.quests.done || {}) },
            announced: !!G.quests.announced, pending: G.quests.pending || null,
        } : null),
        dialogInfo: () => {
            if (!cur) return null;
            const q = QUESTS.find((x) => x.id === cur.questId);
            return {
                kind: cur.kind, questId: cur.questId, gold: q ? q.gold : 0,
                header: cur.headerText,
                text: q ? questText(cur.ctx.G, q) : "",
                goal: GAME_LOC.t(`quest.${cur.questId}.goal`),
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
