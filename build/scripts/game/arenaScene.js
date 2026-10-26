// СЦЕНА «АРЕНА»: жизненный цикл сцены: enter/exit/update.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installScene = function installScene(A) {
        with (A) {
            // ── Сцена ───────────────────────────────────────────────────────────
            A.enter = function enter() {
                const encId = G.activeEnemy ? G.activeEnemy.enc : "gob";
                const enc = ENCOUNTERS[encId] || ENCOUNTERS.gob;
                // герой забега: его baseHp — жизни базы игрока в бою (просил юзер)
                const heroDef = globalThis.GAME_DATA.HEROES[G.heroId]
                    || globalThis.GAME_DATA.HEROES.gorbag;
                // фон и сетка поля — по подземелью: гоблинские пещеры —
                // scenes/1.png, Роща Роста — scenes/2.png (просил юзер),
                // Мудрость/«Подземные ключи» — scenes/3.png (подводная пещера),
                // Тлен/«Земли мёртвых» — scenes/4.png
                curScene = enc.elem === "growth" ? 2 : enc.elem === "wisdom" ? 3
                    : enc.elem === "decay" ? 4 : 1;
                if (ctx.music) ctx.music("battle");
                // колода врага хранится в враге подземелья (кидается при
                // генерации этажа по глубине); для старых сейвов — генерим.
                // eDeckBase — эталон для «подкреплений»: в затяжном бою колода
                // не должна вымирать (иначе ИИ копит энергию без карт в руке)
                const eBase = G.activeEnemy && G.activeEnemy.deck
                    ? [...G.activeEnemy.deck]
                    : enemyDeck(encId, G.run ? G.run.floor : 1);
                // карта персонажа противника: её baseHp — жизни базы врага
                // (10/11/12/13/14/18 по картам юзера); нет карты — как раньше.
                // Босс этажа крепчает с глубиной (просил юзер): +2 макс. жизни
                // за номер этажа (2-й этаж — +4)
                const eHeroDef = enc.hero && HEROES[enc.hero] ? HEROES[enc.hero] : null;
                const bossHp = G.activeEnemy && G.activeEnemy.boss
                    ? 2 * (G.run ? G.run.floor : 1) : 0;
                // драфт («Карта сокровищ»): колода игрока — 12 отобранных карт,
                // НЕ G.deck (настоящая колода в мини-игре не участвует)
                const pDeck = G.draftBattle && G.draft ? G.draft.picks : G.deck;
                B = {
                    encId, phase: "player", stopped: false, turnNo: 1,
                    energy: 1, eEnergy: 1,
                    split: 1, // положение ползунка «карты↔энергия» (1 карта / 2 энергии)
                    playerBase: heroDef.baseHp, playerBaseMax: heroDef.baseHp,
                    // способность героя «первое призванное существо…» — ещё
                    // не сработала в этом бою
                    heroFirstSummon: heroDef.ability !== "firstSummonAtk"
                        && heroDef.ability !== "firstSummonHp"
                        && heroDef.ability !== "firstSummonWard",
                    // флаги способностей карт персонажей: первое уронное
                    // заклинание боя; возврат первого погибшего гоблина;
                    // возврат первого Силового заклинания («Мастера огня»);
                    // «Защита 1» первому строению («Лесной город»); повторный
                    // эффект первой сработавшей ловушки («Роща лоз»); возврат
                    // первой погибшей постройки («Хранитель рощи»); +1⚡ за
                    // первое срабатывание своей ловушки («Путь воды»); добор
                    // за первую способность элементаля («Сонм духов»);
                    // усиление первого «Заморожен» («Ледяная суета»);
                    // скидка первой постройке («Город мудрости»); первая
                    // способность Мага дважды («Безумный маг»)
                    heroFlags: { firstSpell: { p: false, e: false },
                        spellEnergy: { p: false, e: false },
                        trapEnergy: { p: false, e: false },
                        elementalDraw: { p: false, e: false },
                        frozenExtra: { p: false, e: false },
                        mageDouble: { p: false, e: false },
                        deathReplay: { p: false, e: false },
                        strReplay: { p: false, e: false },
                        builtGuard: { p: false, e: false },
                        firstBuilding: { p: false, e: false },
                        trapEcho: { p: false, e: false },
                        buildReplay: { p: false, e: false },
                        skeletonDig: { p: false, e: false },
                        digReward: { p: false, e: false },
                        discardReplay: { p: false, e: false },
                        skeletonStrike: { p: false, e: false },
                        firstDeathHeal: { p: false, e: false } },
                    enemyBase: (eHeroDef ? eHeroDef.baseHp : enc.baseHp) + bossHp,
                    enemyBaseMax: (eHeroDef ? eHeroDef.baseHp : enc.baseHp) + bossHp,
                    deck: shuffle([...pDeck]), discard: [], hand: [],
                    eDeck: shuffle([...eBase]),
                    eDeckBase: eBase,
                    eDiscard: [], eHand: [],
                    units: [], traps: { p: [], e: [] }, firewalls: [],
                    selected: null, spellTarget: false, result: null,
                    discarding: false, picking: false, brewCasts: 0,
                    // последнее разыгранное заклинание каждой стороны («Горящие
                    // руны»); journeySummon — карта призыва из «Глубокого
                    // путешествия», ждёт бесплатной постановки на клетку;
                    // scorch — «Сожжение» (Варка зелий): id карт в руке стороны,
                    // которые после розыгрыша удаляются из боя, а не в сброс
                    lastSpell: { p: null, e: null }, journeySummon: null,
                    scorch: { p: new Set(), e: new Set() },
                };
                G.battle = B;
                // «Контроль природы» (firstTurnEnergyDown, просил юзер): на
                // первый ход в бою противник героя получает на 1 энергию
                // меньше — старт с 0 вместо 1 (дальнейшие ходы как раньше)
                if (eHeroDef && eHeroDef.ability === "firstTurnEnergyDown") B.energy = 0;
                if (heroDef.ability === "firstTurnEnergyDown") B.eEnergy = 0;
                // «Карта сокровищ»: соперник по драфту начинает бой с 3
                // энергии вместо стандартной 1 (просил юзер)
                if (encId === "draft") B.eEnergy = 3;
                // Стандартный старт обеих сторон (просил юзер): 1 энергия
                // (выше) и 4 карты в руке; геройские доборы (startDraw*,
                // heroStartDraw ниже) всегда ЛЯГУТ СВЕРХУ этих четырёх
                drawCards(4);
                drawEnemy(4); // у врага раньше было 0 карт — добор только на его ходу
                moves.length = 0; floats.length = 0; punches.length = 0; // хвосты прошлого боя
                fxClear(); // эффекты прошлого боя жили в уничтоженном root
                overlay = null;
                drag = null;
                dragFx = null; // прошлого боя Graphics уничтожен вместе с root
                discardPanel = null;
                runesPanel = null; runesTop = [];
                journeyPanel = null; journeyTop = [];
                brewPanel = null; brewPile = null;
                raisePanel = null;
                torturePanel = null;
                unitCard = null;
                sfx("openRoom"); // начало боя

                root = new PIXI.Container();
                root.eventMode = "static";
                // фон арены — нарисованная сцена с сеткой поля (см. curScene выше)
                const bg = new PIXI.Sprite(uiTex(`scenes/${curScene}.png`));
                const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
                bg.scale.set(s);
                bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
                root.addChild(bg);
                root.board = buildBoard();
                root.addChild(root.board);
                root.fireLayer = new PIXI.Container(); // «Стена костров» — огонь под жетонами
                root.addChild(root.fireLayer);
                root.unitsLayer = new PIXI.Container();
                // общий z-order существ и строений: кто ниже по полю (больше row),
                // тот ближе к зрителю — рисуется поверх (просил юзер: строения
                // висели поверх существ выше их)
                root.unitsLayer.sortableChildren = true;
                root.addChild(root.unitsLayer);
                root.trapLayer = new PIXI.Container();
                root.addChild(root.trapLayer);
                root.cardsLayer = new PIXI.Container();
                root.addChild(root.cardsLayer);
                root.fx = new PIXI.Container();
                root.addChild(root.fx);
                root.hud = buildHud();
                root.addChild(root.hud);
                root.on("pointertap", (e) => {
                    B.taps = (B.taps || 0) + 1;
                    if (e.target === root && B.phase === "player" && B.selected !== null) {
                        B.selected = null;
                        B.spellTarget = false;
                        layoutHand();
                        redrawHighlight();
                        refreshHud();
                    }
                    if (e.target === root && B.phase === "player" && B.journeySummon) {
                        cancelJourneySummon(); // клик мимо поля — призыв в руку
                    }
                });
                ctx.ui.addChild(root);
                heroStartDraw("p"); // способность героя: добор в начале боя
                heroStartDraw("e");
                layoutHand();
                refreshHud();
                banner(t("arena.yourTurn"));
            };

            A.exit = function exit() {
                if (B) B.stopped = true;
                window.removeEventListener("pointerup", endCardDrag); // хвост незавершённого drag
                window.removeEventListener("pointermove", sliderMove); // хвост шкалы
                window.removeEventListener("pointerup", sliderUp);
                sliderHeld = false;
                sliderVis = null;
                sliderGlide = null;
                drag = null;
                closeDiscardPanel();
                closeRunesPanel();
                closeStumpPanel();
                closeJourneyPanel(); // узел умрёт вместе с root — снимаем ссылки
                monolithPanel = null; // панель монолита умерла с root; очередь неактуальна
                monolithQueue.length = 0;
                monolithCost = null;
                hideEnemyCard(); // узел умер бы вместе с root — снимаем ссылку
                unitCard = null; // узел подсказки умер вместе с root
                trapCard = null; // подсказка ловушки тоже
                fxClear(); // снять ссылки на Graphics до уничтожения root
                if (root) { root.destroy({ children: true }); root = null; }
                overlay = null;
                ovZoom = null; // узел умер вместе с root — снимаем ссылку
                ovCards = [];
                dragFx = null; // Graphics умер вместе с root — не держим мёртвую ссылку
                G.battle = null;
            };

            A.update = function update(ticker) {
                if (!root || !B) return;
                const dt = ticker.deltaMS / 1000;
                fxTick(dt); // процедурные эффекты боя (искры, кольца, дым)
                // доскок бегунка шкалы к засечке (после отпускания мыши)
                if (sliderGlide) {
                    if (performance.now() - sliderGlide.t0 >= SLIDER_GLIDE_MS) sliderGlide = null;
                    refreshSlider();
                }
                // ховер-зум карты оверлея: 0.75 ↔ 1 (плавно, как в «Колоде»)
                if (ovZoom) {
                    const z = ovZoom;
                    z.cur += (z.tgt - z.cur) * Math.min(1, dt * 14);
                    if (Math.abs(z.tgt - z.cur) < 0.01) {
                        z.cur = z.tgt;
                        if (z.tgt === 0.75) {
                            if (z.base && !z.base.destroyed) z.base.alpha = z.baseAlpha;
                            z.node.destroy({ children: true });
                            ovZoom = null;
                        }
                    }
                    if (ovZoom) z.node.scale.set(z.cur);
                }
                for (let i = floats.length - 1; i >= 0; i--) {
                    const f = floats[i];
                    if (f.node.destroyed) { floats.splice(i, 1); continue; } // узел снесён вне анимации
                    f.life -= dt;
                    f.node.y -= 36 * f.k * dt; // путь тот же — дольше и медленнее
                    f.node.alpha = Math.max(0, f.life / f.total);
                    if (f.life <= 0) { f.node.destroy(); floats.splice(i, 1); }
                }
                for (let i = punches.length - 1; i >= 0; i--) {
                    const p = punches[i];
                    if (p.node.destroyed) { punches.splice(i, 1); continue; } // узел снесён вне анимации (wipe в тестах)
                    p.life -= dt;
                    const k = Math.max(0, p.life / p.total);
                    if (p.dying) {
                        p.node.scale.set(k * 1.1);
                        p.node.alpha = k;
                        p.node.rotation = (1 - k) * 0.6;
                    } else {
                        p.node.scale.set(1 + Math.sin(k * Math.PI) * 0.22);
                    }
                    if (p.life <= 0) {
                        // destroy в этой сборке Pixi не отцепляет узел от родителя —
                        // трупы оставались в unitsLayer и копились за бой
                        if (p.dying) {
                            if (p.node.parent) p.node.parent.removeChild(p.node);
                            p.node.destroy({ children: true });
                        } else p.node.scale.set(1);
                        punches.splice(i, 1);
                    }
                }
                for (let i = moves.length - 1; i >= 0; i--) {
                    const m = moves[i];
                    m.life -= dt;
                    if (m.node.destroyed) { moves.splice(i, 1); continue; }
                    const k = 1 - Math.max(0, m.life / m.total);
                    m.node.x = m.fx + (m.tx - m.fx) * k;
                    m.node.y = m.fy + (m.ty - m.fy) * k;
                    if (m.life <= 0) {
                        moves.splice(i, 1);
                        if (!moves.some((mm) => mm.u === m.u)) setWalk(m.u, false);
                    }
                }
                // кадры спрайтов тикаем сами (autoUpdate=false; update ждёт ТИКЕР,
                // не число — иначе кадр NaN и спрайт замирает). Скорость походки
                // каждый кадр — ползунок «Анимации» действует и на живые юниты.
                for (const u of B.units) {
                    const body = u.node.getChildByName("body");
                    if (!body) continue;
                    const sheet = sheetOf(u);
                    body.animationSpeed = ((sheet && sheet.animationSpeed) || 0.2) * animK();
                    if (body.playing) body.update(ticker);
                }
                if (bannerT > 0) {
                    bannerT -= dt;
                    const b = root.hud.userData.banner;
                    b.alpha = Math.min(1, bannerT / bannerFade);
                    b.scale.set(b.scale.x + (1.0 - b.scale.x) * 0.12);
                } else root.hud.userData.banner.alpha = 0;
                // «Конец хода» с клавиши: Пробел (только в свой ход, без панелей)
                if (B.phase === "player" && !B.discarding && !overlay
                    && ctx.input.wasPressed("Space")) api.endTurn();
                if (B.picking && ctx.input.wasPressed("Escape")) {
                    if (journeyPanel) finishJourney(null); // «Глубокое путешествие» — без призыва
                    else if (stumpPanel) closeStumpPanel(); // «Пень обряда» — оставить как было
                    else if (brewPanel) closeBrewPanel(); // «Варка зелий» — без выбора
                    else if (raisePanel) closeRaisePanel(); // «Поднятие мёртвых» — без выбора
                    else if (torturePanel) closeTorturePanel(); // «Пытка разума» — без выбора
                    else if (seekPanel) finishSeek(); // «Поиск знаний» — взять, что выбрано
                    else if (grimPanel) closeGrimPanel(); // «Гримуар инея» — выбор сделан, просто закрыть
                    else closeRunesPanel(); // «Поиск рун» — отмена выбора
                    return;
                }
                if (overlay && B.phase !== "over" && ctx.input.wasPressed("Escape")) {
                    closeOverlay();
                    return;
                }
                if (B.phase === "player" && B.selected !== null && ctx.input.wasPressed("Escape")) {
                    deselect();
                }
            };
        }
    };
})();
