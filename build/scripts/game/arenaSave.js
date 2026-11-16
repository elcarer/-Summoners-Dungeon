// СЦЕНА «АРЕНА»: сохранение и восстановление боя (W140, просил юзер).
// Выход из боя («В главное меню»), закрытие страницы и «Сохранить/Загрузить»
// не сбрасывают бой: снапшот логического состояния пишется в сейв забега
// (G.battleSave → sd_run), и при возврате в игру бой продолжается с того же
// места. Восстановление ТИХОЕ — без прибытийных эффектов addUnit/armTrap:
// юниты собираются как простые объекты (makeUnitNode рисует жетон по hp/atk),
// ловушки/значки «Сдвига»/стена костров — простые записи + штатные redraw.
// Модуль только вешает функции на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installSave = function installSave(A) {
        with (A) {

            // ── Реплейсер JSON: def → id карты (неизвестный деф жетона —
            // целым клоном), узлы PIXI и функции — вырез, Set → {__set}.
            // Ссылка trap.unit → {__uref:[col,row]} — на восстановлении
            // юнит ищется по клетке ─────────────────────────────────────
            A.__snapReplacer = function (key, val) {
                if (val === undefined || typeof val === "function"
                    || typeof val === "symbol") return undefined;
                if (val instanceof Set) return { __set: [...val] };
                if (val === null || typeof val !== "object") return val;
                if (key === "def") {
                    const id = A.cardIdOf(val);
                    if (id) return id;
                    // жетон с дефом вне каталога (задел): деф — простые данные
                    return { __def: JSON.parse(JSON.stringify(val, A.__snapReplacer)) };
                }
                if (key === "node") return undefined; // жетон юнита/значок сдвига
                if (key === "unit" && val.def) // ловушка на существе
                    return { __uref: [val.col, val.row] };
                if (val.destroyed !== undefined || val.anchor
                    || val.texture || val.animations || val.frame) return undefined;
                return val;
            };
            // Обратная ветка: {__set} → Set, {__def} → объект, массивы/объекты
            A.__snapRevive = function (v) {
                if (v === null || typeof v !== "object") return v;
                if (v.__set) return new Set(v.__set);
                if (v.__def) return A.__snapRevive(v.__def);
                if (Array.isArray(v)) return v.map(A.__snapRevive);
                const o = {};
                for (const k in v) o[k] = A.__snapRevive(v[k]);
                return o;
            };

            // ── Снапшот боя в G.battleSave (+ сейв забега). Зовётся из
            // exit() арены и из beforeunload. Бой завершён — снапшот не
            // нужен (итог уже в забеге) ─────────────────────────────────
            A.snapshotBattle = function snapshotBattle() {
                if (!B || B.phase === "over") { G.battleSave = null; return; }
                // открытые панели выбора — по семантике Escape: выбор
                // отменяется, карта/эффект возвращаются (то же, что клик
                // «назад»); снапшот снимается с уже отменённого состояния
                if (journeyPanel) finishJourney(null);
                if (stumpPanel) closeStumpPanel();
                if (brewPanel) closeBrewPanel();
                if (raisePanel) closeRaisePanel();
                if (torturePanel) closeTorturePanel();
                if (captivatePanel) closeCaptivatePanel();
                if (resurrectPanel) closeResurrectPanel();
                if (seekPanel) finishSeek();
                if (grimPanel) closeGrimPanel();
                if (runesPanel) closeRunesPanel();
                if (discardPanel) closeDiscardPanel();
                if (monolithPanel) closeMonolithPanel();
                if (excavatePanel) closeExcavatePanel();
                if (moonPanel) closeMoonPanel();
                if (portalPanel) closePortalPanel();
                if (dropPanel) closeDropPanel();
                tokenPanelClose(); tagPanelClose(); projPanelClose();
                if (overlay) closeOverlay();
                B.selected = null;
                B.spellTarget = false;
                B.islandPick = false;
                drag = null;
                const snap = {
                    v: 1, // версия формата снапшота
                    encId: B.encId,
                    worldFrom: !!G.worldFrom,
                    draftBattle: !!G.draftBattle,
                    draft: G.draftBattle && G.draft
                        ? JSON.parse(JSON.stringify(G.draft)) : null,
                    activeEnemy: G.activeEnemy
                        ? JSON.parse(JSON.stringify(G.activeEnemy)) : null,
                    mid: B.phase === "enemy" ? "enemy"
                        : B.phase === "anim" ? "playerAnim" : "player",
                    B: JSON.parse(JSON.stringify(B, A.__snapReplacer)),
                };
                G.battleSave = snap;
                if (G.saveRun && G.live) G.saveRun(); // диск в sync: «Продолжить» видит бой
            };

            // ── Восстановление: перезапись логики снапшотом + тихая
            // сборка жетонов/ловушек/значков и возобновление полухода.
            // Зовётся из enter() арены после дефолтного B и buildArenaRoot
            A.applyBattleSnapshot = function applyBattleSnapshot(snap) {
                const S = snap.B;
                // 1) скаляры и коллекции карт: всё, кроме структурных
                for (const k in S) {
                    if (k === "units" || k === "traps" || k === "delayed"
                        || k === "firewalls") continue;
                    B[k] = A.__snapRevive(S[k]);
                }
                // снапшот снимался ПОСЛЕ exit() c B.stopped = true —
                // восстановленный бой жив: все async-потоки (aiPlay,
                // playerTurnStart) глядят на этот флаг
                B.stopped = false;
                // 2) юниты: простые объекты + жетон без портала (виден сразу);
                // hp/curAtk на момент снапшота — makeUnitNode пишет их в цифры
                B.units = (S.units || []).map((ru) => {
                    const def = typeof ru.def === "string" ? CARDS[ru.def]
                        : A.__snapRevive(ru.def);
                    const u = { side: ru.side, def, col: ru.col, row: ru.row };
                    for (const k in ru) {
                        if (k === "side" || k === "def" || k === "col"
                            || k === "row" || k === "node") continue;
                        u[k] = A.__snapRevive(ru[k]);
                    }
                    u.node = makeUnitNode(u);
                    root.unitsLayer.addChild(u.node); // явлен: без портала и punch
                    return u;
                });
                // 3) ловушки: деф по id, «руна на существе» — по клетке;
                // then redrawTraps() перерисует «?» на поле
                for (const side of ["p", "e"]) {
                    B.traps[side] = ((S.traps && S.traps[side]) || []).map((t) => ({
                        def: typeof t.def === "string" ? CARDS[t.def]
                            : A.__snapRevive(t.def),
                        col: t.col, row: t.row,
                        unit: t.unit && t.unit.__uref
                            ? unitAt(t.unit.__uref[0], t.unit.__uref[1]) : null,
                        ret: t.ret || 0,
                    }));
                }
                redrawTraps();
                // 4) значки «Сдвига»: записи с node: null — delayDrawNode рисует
                B.delayed = { p: [], e: [] };
                for (const side of ["p", "e"]) {
                    for (const e of (S.delayed && S.delayed[side]) || []) {
                        const entry = { side: side === "p" ? "p" : "e",
                            cardId: e.cardId, col: e.col, row: e.row,
                            left: e.left, token: !!e.token, node: null };
                        B.delayed[side].push(entry);
                        delayDrawNode(entry);
                    }
                }
                // 5) «Стена костров» — простые записи + перерисовка огня
                B.firewalls = (S.firewalls || []).map((f) => ({ ...f }));
                redrawFirewalls();
                // 6) метки статусов на жетонах (frozenMark и т.д. — бейджи);
                // ауры пересчитывает recalcAuras (hp/curAtk сводятся сами)
                for (const u of B.units) A.__drawUnitMarks(u);
                recalcAuras();
                layoutHand();
                redrawHighlight();
                refreshHud();
                // 7) возобновление полухода: чей был — тот и доигрывается
                if (snap.mid === "enemy") {
                    banner(t("arena.enemyTurn"));
                    A.enemyResume();
                } else if (snap.mid === "playerAnim") {
                    // выход пришёлся на марш игрока: доигрываем марш —
                    // частично ушедшие юниты продолжат с текущих клеток
                    (async () => {
                        await marchSide("p");
                        if (B.stopped || B.phase === "over") return;
                        returnTick("p");
                        B.phase = "player";
                        layoutHand();
                        redrawHighlight();
                        refreshHud();
                        banner(t("arena.yourTurn"));
                    })();
                } else {
                    banner(t("arena.yourTurn"));
                }
            };

            // Возобновление хода врага: розыгрыши руки (aiPlay) и хвост хода.
            // aiPlay каждый раз решает заново по текущему столу — сыгранные
            // до выхода карты в руке не лежат, повторов нет
            A.enemyResume = function enemyResume() {
                (async () => {
                    if (B.stopped || B.phase === "over") return;
                    await aiPlay();
                    if (B.stopped || B.phase === "over") return;
                    await enemyTurnTail();
                })();
            };

            // ── Перерисовка меток статусов на восстановленном жетоне:
            // бейджи создаются заново по флагам юнита (значения уже в них),
            // без игровых побочек add*-функций ────────────────────────────
            A.__drawUnitMarks = function __drawUnitMarks(u) {
                if (!u.node) return;
                const badge = (name, fill, stroke, color, x, y, txt) => {
                    if (u.node.getChildByName(name)) return;
                    const mark = new PIXI.Container();
                    mark.name = name;
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: fill });
                    g.stroke({ width: 3, color: stroke });
                    mark.addChild(g);
                    const tx = T(txt, 17, color);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(x, y);
                    u.node.addChild(mark);
                    return mark;
                };
                if (u.spores) {
                    const mark = new PIXI.Graphics();
                    mark.circle(0, 0, 10.5);
                    mark.fill({ color: 0x7a9a4e });
                    mark.stroke({ width: 3, color: 0xd8e8a0 });
                    mark.position.set(-36, -54);
                    mark.name = "sporeMark";
                    mark.eventMode = "none";
                    u.node.addChild(mark);
                }
                if (u.frozen > 0) {
                    const mark = badge("frozenMark", 0x1e4a6f, 0x8cd0ef,
                        0xd0effa, 0, -88, u.frozen > 1 ? String(u.frozen) : "❄");
                    if (mark) mark.getChildAt(1).style.fontSize = 17;
                }
                if (u.venom > 0) badge("venomMark", 0x2a5a2e, 0x9fd489,
                    0xd8f0c0, 18, -66, String(u.venom));
                if (u.poison > 0) badge("poisonMark", 0x5a7a2e, 0xd8f0a0,
                    0xf0fad0, -18, -66, String(u.poison));
                if (u.entangle > 0) badge("entangleMark", 0x6b4a2e, 0xc9a06a,
                    0xf0dcb0, -36, -66, String(u.entangle));
                if (u.berserk > 0) badge("berserkMark", 0x8a2f1e, 0xffd98c,
                    0xffe9b0, 36, -66, "×" + (u.berserk + 1));
                if (u.confused > 0) badge("confuseMark", 0x6f4a9a, 0xd0b0ef,
                    0xeedcff, -36, -54, String(u.confused));
                if (u.spellWard) badge("wardMark", 0x1e3a5f, 0x8cd0ef,
                    0x8cd0ef, 36, -54, "✦");
                if (u.enchantFire) badge("enchMark", 0x8a4a1e, 0xffb06a,
                    0xffd98c, 18, -54, "🔥");
                // значениями из юнита — штатные рисовалки (без побочек)
                refreshProtectMark(u);
                updateExhumingMark(u);
                if (u.ret > 0) returnMarkDraw(u);
            };
        }
    };
})();
