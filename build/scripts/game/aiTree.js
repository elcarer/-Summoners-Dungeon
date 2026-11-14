// СЦЕНА «АРЕНА»: ИИ: ДЕРЕВО РОЗЫГРЫША (W114 — «этап 2», просил юзер:
// деревья решений там, где важны связки карт и порядок розыгрыша).
//
// Этап 1 (W110) настроил жадную utility весами AI_W; порядок карт при этом
// оставался статическими группами aiGroup. Здесь — ограниченный перебор
// последовательностей розыгрыша одного полухода: подмножества играбельных
// карт и их порядки проигрываются на ЛЁГКОЙ МОДЕЛИ поля (без визуала и
// без мутации боя), листья оцениваются board-метрикой на тех же aiVal/
// aiThreat, лучший порядок возвращается в aiPlay как план.
//
// Почему модель, а не настоящий розыгрыш: эффекты карт в игре сплетены с
// анимациями (floatText/полёты/await), откатывать реальное состояние нельзя;
// модель несёт РЕАЛЬНЫЕ def-объекты карт, поэтому aiVal/aiThreat считают
// её юнитов без изменений. Несмоделированные эффекты (тонкие статусы,
// панели, поиск) вносят статическую ценность aiCardPower — перебор всё
// равно упорядочивает их разумно.
//
// Возврат: план = { order, hold } — порядок карт к розыгрышу и список
// карт, которые НАМЕРЕННО придержаны (дерево нашло лучшее). После плана
// aiPlay возвращается к прежнему поведению для новых доборов; hold
// блокирует приержанные карты до конца полухода.
//
// Проверка чистоты: planFrom НЕ мутирует ни snap, ни что-либо вне модели
// (офлайн-тест check_w114 гоняет её на синтетике и сверяет снапшот).
//
// Модуль только вешает функции на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.makeAiPlanner = function makeAiPlanner(d) {
        // d: { CARDS, GRID, W, aiVal, aiThreat, aiCardPower, aiGroup,
        //      aiOwnValue } — W живой (AI_W контекста), остальное —
        // чистые функции оценок.
        const { CARDS, GRID, W } = d;

        // ── модель поля ─────────────────────────────────────────────────────
        // Юнит модели: { def, side, col, row, hp, curAtk, venom, berserk,
        // enchantFire, exhuming } — ровно поля, которые читают aiVal/aiThreat
        // и пишут смоделированные эффекты.
        const cloneU = (u) => ({
            def: u.def, side: u.side, col: u.col, row: u.row,
            hp: u.hp, curAtk: u.curAtk,
            venom: u.venom || 0, berserk: u.berserk || 0,
            enchantFire: u.enchantFire || 0, exhuming: u.exhuming || 0,
        });
        const mkModel = (snap) => ({
            units: snap.units.map(cloneU),
            pBase: snap.playerBase,
            eBase: snap.enemyBase,
            energy: snap.eEnergy,
            hand: snap.eHand.length,
            back: snap.rows.length - 1, // зона призыва «e»: ряды 0..back
        });
        const mAt = (m, c, r) => m.units.find((u) => u.col === c && u.row === r) || null;
        // урон существу модели: смерть убирает, «Снизошедший» выживает с 1♥
        const hurtU = (m, u, dmg) => {
            if (!u || dmg <= 0) return;
            u.hp -= dmg;
            if (u.hp <= 0) {
                if (u.def.undying) u.hp = 1;
                else m.units.splice(m.units.indexOf(u), 1);
            }
        };
        const bestFoe = (m) => m.units.filter((u) => u.side === "p")
            .sort((a, b) => d.aiThreat(b) - d.aiThreat(a))[0] || null;
        const bestOwn = (m) => m.units.filter((u) => u.side === "e"
            && u.def.type === "unit")
            .sort((a, b) => d.aiVal(b) - d.aiVal(a))[0] || null;
        // клетка призыва в модели: передний ряд, свободная колонка, ауры
        // соседства; детерминированно (перебор без случайностей)
        const pickCell = (m, def) => {
            let best = null, bs = -Infinity;
            for (let r = 0; r <= m.back; r++) {
                for (let c = 0; c < GRID; c++) {
                    if (mAt(m, c, r)) continue;
                    let sc = 0;
                    if (r === m.back) sc += 2;
                    if (!m.units.some((u) => u.side === "e" && u.col === c)) sc += 1.5;
                    for (const b of m.units) {
                        if (b.side !== "e" || b.def.type !== "building") continue;
                        if (Math.abs(b.col - c) + Math.abs(b.row - r) !== 1) continue;
                        // аура соседства дороже «переднего ряда» (связка
                        // «аура → призыв рядом» — главная, что ловит модель)
                        if (b.def.campAura || b.def.groveAura || b.def.altarSword
                            || b.def.monolith || b.def.sprout || b.def.campfire) sc += 2.2;
                    }
                    if (m.units.some((u) => u.side === "e" && u.col === c && u.row > r))
                        sc -= 0.9; // затор колонки
                    if (sc > bs) { bs = sc; best = [c, r]; }
                }
            }
            return best;
        };
        const extendZone = (m, row) => {
            m.back = Math.min(GRID - 2, Math.max(m.back, row + 1));
        };
        const mkUnit = (def, cell) => ({
            def, side: "e", col: cell[0], row: cell[1],
            hp: def.hp || 1, curAtk: def.atk || 0,
            venom: 0, berserk: 0, enchantFire: 0, exhuming: 0,
        });
        // постановка в модели с аурами соседства (приближение: лагерь — +atk,
        // роща/лесной монолит — +♥)
        const deployM = (m, def) => {
            const cell = pickCell(m, def);
            if (!cell) return false;
            const u = mkUnit(def, cell);
            for (const b of m.units) {
                if (b.side !== "e" || b.def.type !== "building") continue;
                if (Math.abs(b.col - cell[0]) + Math.abs(b.row - cell[1]) !== 1) continue;
                if (b.def.campAura) u.curAtk += b.def.campAura;
                if (b.def.groveAura) u.hp += b.def.groveAura;
            }
            m.units.push(u);
            extendZone(m, cell[1]);
            return true;
        };
        // тело-сателлит заклинаний (хелпер-дефы — как у реальных призывов)
        const BODY = {
            lay: { type: "unit", atk: 2, hp: 2 },                     // «Молебен»
            ice: { type: "unit", atk: 1, hp: 1 },                     // «Рой ледо-пикси»
            skel: { type: "unit", atk: 1, hp: 2, subtype: "skeleton" }, // толпа
            wolf: { type: "unit", atk: 2, hp: 3, wolfSummon: true },  // «Белый волк»
            fly: { type: "unit", atk: 1, hp: 1, fly: true },          // светлячки
        };

        // ── применение карты к модели ───────────────────────────────────────
        // Возвращает true, если хоть что-то смоделировано (иначе ценность
        // карты уходит в статическую часть acc.static).
        const applyCard = (m, c, acc, st, altarB) => {
            const def = c.def;
            const s = def.spell || {};
            let modeled = false;
            if (def.type === "unit" || def.type === "building") {
                // «Сдвиг» — придёт позже, сейчас поле не занимает
                if (def.type === "unit" && def.delay) {
                    acc.static += st(c.id); return true;
                }
                if (deployM(m, def)) return true;
                acc.static += st(c.id); // некуда ставить — карта всё равно уйдёт
                return true;
            }
            if (def.type === "trap") { acc.static += st(c.id); return true; }
            // ── заклинания: семейства с полями def.spell ──
            if (s.baseDmg) { m.pBase -= s.baseDmg + (altarB || 0); modeled = true; }
            if (s.aoeDmg) {
                for (const u of m.units.filter((v) => v.side === "p").slice())
                    hurtU(m, u, s.aoeDmg + (altarB || 0));
                modeled = true;
            }
            if (s.dmg) { hurtU(m, bestFoe(m), s.dmg + (altarB || 0)); modeled = true; }
            if (s.columnDmg) {
                hurtU(m, bestFoe(m), s.columnDmg + (altarB || 0)); modeled = true;
            }
            if (s.destroy) {
                const v = bestFoe(m);
                if (v) m.units.splice(m.units.indexOf(v), 1);
                modeled = !!v;
            }
            if (s.mindControl) {
                const v = bestFoe(m);
                if (v) { v.side = "e"; m.eBase -= s.mindControl; }
                modeled = !!v;
            }
            if (s.debuffEnemyAtkAll) {
                const foes = m.units.filter((v) => v.side === "p");
                for (const v of foes) v.curAtk = Math.max(0, v.curAtk - s.debuffEnemyAtkAll);
                modeled = foes.length > 0;
            }
            if (s.buffAtk || s.buffHp) {
                const v = bestOwn(m);
                if (v) {
                    v.curAtk += s.buffAtk || 0;
                    v.hp += s.buffHp || 0;
                }
                modeled = modeled || !!v;
            }
            if (s.buffAtkByHp) {
                const v = m.units.filter((u) => u.side === "e" && u.def.type === "unit")
                    .sort((a, b) => b.hp - a.hp)[0];
                if (v) v.curAtk += v.hp;
                modeled = modeled || !!v;
            }
            if (s.buffAllAtk) {
                const own = m.units.filter((v) => v.side === "e" && v.def.type === "unit");
                for (const v of own) v.curAtk += s.buffAllAtk;
                modeled = modeled || own.length > 0;
            }
            if (s.berserk) {
                const v = bestOwn(m);
                if (v) v.berserk += s.berserk;
                modeled = modeled || !!v;
            }
            if (s.venom) { const v = bestOwn(m); if (v) v.venom = 1; modeled = modeled || !!v; }
            if (s.enchantFire) {
                const v = bestOwn(m);
                if (v) v.enchantFire = 1;
                modeled = modeled || !!v;
            }
            // ── энергия ──
            if (s.energyPerHand) {
                m.energy += Math.max(0, m.hand - 1); // сама карта не считается
                modeled = true;
            }
            if (s.darkExtract) {
                const v = m.units.filter((u) => u.side === "e" && u.def.type === "unit")
                    .sort((a, b) => d.aiVal(a) - d.aiVal(b))[0];
                if (v) {
                    m.energy += (v.curAtk || 0) + (v.hp || 0);
                    m.units.splice(m.units.indexOf(v), 1);
                }
                modeled = modeled || !!v;
            }
            if (s.bloodMoon) {
                const take = Math.min(s.bloodMoon || 3, m.eBase - 2);
                if (take > 0) { m.eBase -= take; m.energy += take; }
                modeled = true;
            }
            if (s.nextEnergy) { m.energy += s.nextEnergy; modeled = true; }
            if (s.drainAll || s.stormAll || s.crushEnergy || s.highPower) {
                m.energy = 0; modeled = true;
            }
            // ── призывы-сателлиты ──
            if (s.laySummon) { deployM(m, BODY.lay); modeled = true; }
            if (s.iceSwarm) {
                for (let i = 0; i < s.iceSwarm; i++) deployM(m, BODY.ice);
                modeled = true;
            }
            if (s.skeletonCrowd) {
                for (let i = 0; i < 3; i++) deployM(m, BODY.skel);
                modeled = true;
            }
            if (s.wolfSummon) { deployM(m, BODY.wolf); modeled = true; }
            if (s.summonPoints) {
                deployM(m, { type: "unit", atk: Math.ceil(s.summonPoints / 2),
                    hp: Math.floor(s.summonPoints / 2), creature: "animal" });
                modeled = true;
            }
            if (s.fireflies) {
                for (let i = 0; i < s.fireflies; i++) deployM(m, BODY.fly);
                modeled = true;
            }
            if (s.resurrect) {
                // лучшее существо из сброса (статическая сила на момент плана)
                const best = snap.eDiscard.map((id) => CARDS[id])
                    .filter((x) => x && x.type === "unit" && !x.delay)
                    .sort((a, b) => d.aiCardPower(b) - d.aiCardPower(a))[0];
                if (best) { deployM(m, best); modeled = true; }
            }
            if (s.healPlayer) { m.eBase += s.healPlayer; modeled = true; }
            // ── добор (статическая ценность карты) ──
            if (s.search || s.searchUnit || s.journey || s.discardPick || s.seek
                || s.grim || s.timeSearch || s.forbidden || s.brainstorm
                || s.discardHandDraw) {
                acc.drew += s.forbidden ? 3 : 1;
                modeled = true;
            }
            if (!modeled) acc.static += st(c.id);
            return modeled;
        };

        // ── оценка листа ────────────────────────────────────────────────────
        const evalModel = (snap, m, acc) => {
            let own = 0, foe = 0;
            for (const u of m.units) {
                if (u.side === "e") own += d.aiVal(u);
                else foe += d.aiThreat(u);
            }
            let sc = W.cBoard * (own - foe)
                + W.cBase * (snap.playerBase - m.pBase)
                + W.cSelfBase * (m.eBase - snap.enemyBase)
                + W.cEnergy * m.energy
                + W.cDraw * acc.drew
                + W.cStatic * acc.static;
            if (m.pBase <= 0) sc += W.cLethal;
            return sc;
        };

        // ── жадная база (что бы сыграл прежний ИИ): порядок aiGroup, всё
        // по карману подряд — эталон, который план должен побить ────────────
        const greedyRun = (snap, cands, st) => {
            const m = mkModel(snap);
            const acc = { static: 0, drew: 0 };
            const grp = (c) => d.aiGroup(c.id, c.def);
            const cost = (c) => snap.costs[c.id];
            const seq = [];
            for (const c of cands.slice().sort((a, b) => grp(a) - grp(b)
                || cost(b) - cost(a))) {
                if (cost(c) > m.energy) continue;
                m.energy -= cost(c);
                m.hand--;
                applyCard(m, c, acc, st, snap.altarB);
                seq.push(c.id);
            }
            return { seq, score: evalModel(snap, m, acc) };
        };

        // ── перебор последовательностей (DFS по подмножествам и порядкам) ───
        const planFrom = (snap, cands) => {
            if (!cands.length) return null;
            const st = (id) => {
                const def = CARDS[id];
                return def ? d.aiCardPower(def) : 0;
            };
            const greedy = greedyRun(snap, cands, st);
            const budget = { left: Math.max(20, W.treeNodes | 0) };
            let best = { seq: greedy.seq.slice(), score: greedy.score };
            const maxLen = Math.max(1, Math.min(W.treeLen | 0, cands.length));
            const costs = cands.map((c) => ({ c, cost: snap.costs[c.id] }));
            const dfs = (m, seq, acc) => {
                const sc = evalModel(snap, m, acc);
                if (sc > best.score) { best.score = sc; best.seq = seq.slice(); }
                if (seq.length >= maxLen || budget.left <= 0) return;
                for (const { c, cost } of costs) {
                    if (seq.indexOf(c.id) >= 0) continue;
                    if (cost > m.energy) continue;
                    if (budget.left <= 0) return;
                    budget.left--;
                    const m2 = {
                        units: m.units.map(cloneU), pBase: m.pBase, eBase: m.eBase,
                        energy: m.energy - cost, hand: m.hand - 1, back: m.back,
                    };
                    const acc2 = { static: acc.static, drew: acc.drew };
                    applyCard(m2, c, acc2, st, snap.altarB);
                    dfs(m2, seq.concat([c.id]), acc2);
                }
            };
            dfs(mkModel(snap), [], { static: 0, drew: 0 });
            // план действует, только если он ЯВНО лучше жадной базы
            if (!best.seq.length) return null;
            if (best.score <= greedy.score + W.treeMargin) return null;
            // treeHold=0: план обязан играть ВСЕ карты-кандидаты (только
            // порядок) — иначе прежнее поведение
            if (!W.treeHold && !cands.every((c) => best.seq.indexOf(c.id) >= 0))
                return null;
            const hold = cands.filter((c) => best.seq.indexOf(c.id) < 0)
                .map((c) => c.id);
            return { order: best.seq, hold, base: greedy.score, score: best.score };
        };
        return { planFrom };
    };

    globalThis.GAME_ARENA.installAiTree = function installAiTree(A) {
        with (A) {
            // Снимок состояния полухода для планировщика (ТОЛЬКО чтение боя)
            A.aiSnapTurn = function aiSnapTurn() {
                return {
                    units: B.units.map((u) => ({
                        def: u.def, side: u.side, col: u.col, row: u.row,
                        hp: u.hp, curAtk: u.curAtk,
                        venom: u.venom || 0, berserk: u.berserk || 0,
                        enchantFire: u.enchantFire || 0, exhuming: u.exhuming || 0,
                    })),
                    playerBase: B.playerBase,
                    enemyBase: B.enemyBase,
                    eEnergy: B.eEnergy,
                    eHand: B.eHand.slice(),
                    eDiscard: B.eDiscard.slice(),
                    costs: {},
                    altarB: altarBonus("e"),
                    rows: deployRows("e"),
                };
            };
            // Существование клетки призыва — БЕЗ случайностей: зеркала
            // гейтов aiUnitSpot/aiBuildingSpot (только фильтры, без
            // скоринга и случайных тай-брейков). Планировщик обязан не
            // потреблять случайность: иначе даже бой БЕЗ плана сдвигает
            // ГПСЧ-поток боя и ломает парность лиг (бои без плана должны
            // быть точными копиями боёв базы). Синхронизировать с
            // aiUnitSpot/aiBuildingSpot при правке их гейтов!
            A.aiSpotExists = function aiSpotExists(def) {
                const rows = deployRows("e");
                let free = freeCells(rows);
                if (!free.length) return false;
                if (def.type === "unit" && def.nearSpeed) {
                    free = free.filter(([c, r]) => B.units.some((v) =>
                        v.side === "e" && v.def.type === "unit"
                        && B.units.includes(v)
                        && Math.abs(v.col - c) + Math.abs(v.row - r) === 1));
                    if (!free.length) return false;
                }
                if (def.type === "unit" && def.returnN) {
                    const rush = free.filter(([c, r]) => retRushOk(def, c, r));
                    if (rush.length) free = rush;
                    else if (def.healArrive) {
                        const hurt = free.filter(([c, r]) => B.units.some((v) =>
                            v.side === "e" && v.def.type === "unit"
                            && v.hp < (CARDS[cardIdOf(v.def)] || { hp: 0 }).hp
                            && Math.abs(v.col - c) + Math.abs(v.row - r) === 1));
                        if (!hurt.length) return false;
                        free = hurt;
                    } else return false;
                }
                if (def.illusion) {
                    free = free.filter(([c, r]) => B.units.some((v) =>
                        v.def.type === "unit"
                        && Math.abs(v.col - c) + Math.abs(v.row - r) === 1));
                    if (!free.length) return false;
                }
                return free.length > 0;
            };
            A.aiBldSpotExists = function aiBldSpotExists(def) {
                const rows = deployRows("e");
                const free = freeCells(rows);
                if (!free.length) return false;
                const marchBlocked = (c, r) =>
                    B.units.some((v) => v.side === "e" && v.def.type === "unit"
                        && v.col === c && v.row < r)
                    || ((B.delayed && B.delayed.e) || [])
                        .some((e) => e.col === c && e.row <= r);
                const safe = free.filter(([c, r]) => !marchBlocked(c, r));
                const pmarks = free.filter(([c, r]) => B.delayed && B.delayed.p
                    && B.delayed.p.some((e) => e.col === c && e.row === r
                        && e.left <= 2)
                    && !B.delayed.e.some((e) => e.col === c && e.row === r));
                if (pmarks.length) return true;
                if (def.campAura || def.campfire || def.sprout || def.groveAura
                    || def.monolith || def.elementalCircle || def.altarSword)
                    return safe.length > 0;
                if (def.roadPush) {
                    const fwd = free.filter(([, r]) => rows.length > 1
                        && r === rows[1]);
                    const pool = fwd.length ? fwd
                        : free.filter(([, r]) => r !== rows[0]);
                    return pool.length > 0;
                }
                if (def.fortress || def.edgeStone) return free.length > 0;
                return safe.length > 0;
            };
            // План полухода: перебор порядков играбельных карт на модели.
            // affordable0 — { id, def }[] уже «по карману» (строго по энергии,
            // без альт-стоимостей); flags.monolithCombo — гейт «Трёх монолитов».
            // Возвращает { order, hold, base, score } или null (план не лучше
            // жадной базы — прежнее поведение).
            A.aiPlanTurn = function aiPlanTurn(affordable0, flags = {}) {
                if (!AI_W.treeOn || AI_W.treeOn < 1) return null;
                const snap = aiSnapTurn();
                const cands = [];
                for (const x of affordable0) {
                    const id = x.id, def = x.def;
                    if (!def || !CARDS[id]) continue;
                    snap.costs[id] = effCost(id, "e");
                    // гейты играбельности — те же, что проверяет цикл aiPlay
                    if (def.type === "unit") {
                        if (bubbleBlocked("e", id)) continue;
                        if (def.monolith && !flags.monolithCombo) continue;
                        if (def.elementalCircle && !B.eHand.some((i2) => {
                            const d2 = CARDS[i2];
                            return d2 && d2.type === "unit"
                                && d2.subtype === "elemental";
                        })) continue;
                        if (def.energyToStats
                            && B.eEnergy - effCost(id, "e") < 2) continue;
                        if (!aiSpotExists(def)) continue;
                    } else if (def.type === "building") {
                        if (def.monolith && !flags.monolithCombo) continue;
                        if (def.elementalCircle && !B.eHand.some((i2) => {
                            const d2 = CARDS[i2];
                            return d2 && d2.type === "unit"
                                && d2.subtype === "elemental";
                        })) continue;
                        if (!aiBldSpotExists(def)) continue;
                    } else if (def.type === "spell") {
                        if (!aiSpellPlayable(def)) continue;
                    } else if (def.type === "trap") {
                        if (def.trap && def.trap.effect === "castRandom"
                            && !B.units.some((v) => v.side === "p"
                                && v.def.type === "unit")) continue;
                        if (def.trap && def.trap.effect === "darkOffering"
                            && !B.eHand.some((i2) => CARDS[i2]
                                && CARDS[i2].type === "unit")) continue;
                        if (def.trap && def.trap.effect === "ambushRise"
                            && !B.units.some((v) => v.side === "e"
                                && v.def.type === "building")) continue;
                    }
                    cands.push({ id, def });
                }
                if (cands.length < Math.max(2, AI_W.treeMinCards | 0)) return null;
                if (!A.__planner) {
                    A.__planner = globalThis.GAME_ARENA.makeAiPlanner({
                        CARDS, GRID, W: AI_W,
                        aiVal, aiThreat, aiCardPower, aiGroup, aiOwnValue,
                    });
                }
                return A.__planner.planFrom(snap, cands, flags);
            };
        }
    };
})();
