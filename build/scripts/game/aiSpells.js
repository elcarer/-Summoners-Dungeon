// СЦЕНА «АРЕНА»: ИИ: ЗАКЛИНАНИЯ — исполнение разыгранных карт-заклинаний
// (вход + большой свитч эффектов).
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installAiSpells = function installAiSpells(A) {
        with (A) {
            // Флаг spellCasting на всё разрешение заклинания: damageUnit в
            // это время не наносит урон существам с «Защитой от заклинаний»
            // (u.spellWard, просил юзер)
            A.enemyCastSpellEffect = function enemyCastSpellEffect(def, free = false, focus = null, fromHand = false) {
                A.spellCasting = true;
                // чей каст (вложенные повторы сохраняют внешний) — «Зомби-
                // разбойник» (decRaider): урон заклинанием вражескому существу
                // считается «нанесённым уроном» (W40)
                const prevCast = A.castSide;
                A.castSide = "e";
                // заклинание ИЗ РУКИ рождает эффект в центре показанной
                // карты врага (просил юзер), не в центре экрана; руны и
                // повторы без показанной карты — как раньше
                const origin = fromHand && enemyCard && enemyCard.node
                    ? { x: enemyCard.node.x, y: enemyCard.node.y } : null;
                fxSpellCast(def, focus, "e", origin);
                try {
                    enemyCastSpellEffectInner(def, free, focus, fromHand);
                } finally { A.spellCasting = false; A.castSide = prevCast; }
            };
            A.enemyCastSpellEffectInner = function enemyCastSpellEffectInner(def, free = false, focus = null, fromHand = false) {
                const s = def.spell;
                castTargetOff = 0;
                const aimOff = (u) => { if (u && u.def.targetDiscount) castTargetOff = 1; };
                if (s.stormAll) { // «Гроза»: вся оставшаяся энергия — удары по 2
                    // по случайным существам/постройкам игрока; энергию гасит
                    // aiPlay/руна по флагу stormAll (как у drainAll)
                    stormStrike("e", cardIdOf(def), free);
                    return;
                }
                if (s.nova) { // «Круговая атака»: своё существо, где чужих соседей
                    // больше и они опаснее своих (своих тоже задевает)
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"));
                    let best = aiNovaPick();
                    if (focus && own.includes(focus)) best = focus; // руна
                    aimOff(best);
                    if (best) { novaSplash(best); punch(best.node); sfx("chpoc"); }
                }
                if (s.wolfVolley) { // «Атака духами волков»: стрелок без своих на линии
                    const best = aiWolfPick();
                    aimOff(best);
                    if (best) wolfVolley(best);
                }
                // «Двойная магия» (hw265, W77): ИИ разыгрывает до 2 случайных
                // заклинаний/ловушек своей руки бесплатно (кандидатов нет —
                // вхолостую; от полного слива энергии его бережёт гейт в
                // aiSpellPlayable)
                if (s.hwSpellPlay) {
                    doubleCastAct("e");
                    return;
                }
                if (s.dome) { // «Силовой купол» (tim234): своё самое ценное
                    // существо/постройка без купола (сумма ⚔+♥)
                    const own = B.units.filter((v) => v.side === "e" && !v.dome
                        && (v.def.type === "unit" || v.def.type === "building"));
                    const best = own.slice()
                        .sort((a, b) => ((b.curAtk + b.hp) - (a.curAtk + a.hp))
                            || (a.row - b.row))[0];
                    const t = focus && own.includes(focus) ? focus : best;
                    if (t) {
                        aimOff(t);
                        domeTarget(t);
                    }
                    return;
                }
                if (s.repair) { // «Ремонт» (tim239): страховка самому ценному
                    // своему существу/постройке ещё БЕЗ метки (сумма ⚔+♥)
                    const own = B.units.filter((v) => v.side === "e" && !v.repair
                        && (v.def.type === "unit" || v.def.type === "building"));
                    const best = own.slice()
                        .sort((a, b) => ((b.curAtk + b.hp) - (a.curAtk + a.hp))
                            || (a.row - b.row))[0];
                    const t = focus && own.includes(focus) ? focus : best;
                    if (t) {
                        aimOff(t);
                        repairTarget(t);
                    }
                    return;
                }
                if (s.swap) { // «Перемена мест» (gh254, W65): своё заднее ↔
                    // чужое переднее — своё продвигается к базе игрока,
                    // чужое отбрасывается назад; чужое поопаснее — приятнее
                    let best = null, bs = 0;
                    for (const a of B.units) {
                        if (a.side !== "e") continue;
                        for (const b of B.units) {
                            if (b.side !== "p" || b.row <= a.row) continue;
                            const sc = (b.row - a.row) * 2 + aiThreat(b) * 0.5;
                            if (sc > bs) { bs = sc; best = [a, b]; }
                        }
                    }
                    if (best) swapObjectsAct(best[0], best[1]);
                    return;
                }
                if (s.cyclone) { // «Циклон» (gh256, W65): без цели
                    cycloneAct();
                    return;
                }
                if (s.volley) { // «Небо в стрелах» (gh258, W72): залп всех
                    // своих существ — выстрелы полного пути (archerShot
                    // сам бустит урон способностью героя «Отряд стрелков»)
                    volleyAct("e");
                    return;
                }
                if (s.target === "anyUnit" && !s.nova) { // усиление/очарование — лучшему
                    // «Полные колчаны» (gh259, W72): лучшему СТРЕЛКУ
                    // (выстрел станет на 1 больше); стрелков нет —
                    // сильнейшему своему (выстрел 1 всё равно полезен)
                    if (s.quiver) {
                        const own = spellTargets(B.units.filter((v) => v.side === "e"
                            && v.def.type === "unit"));
                        const shotScore = (v) => (v.def.ability === "archer"
                            || v.def.steamShot ? 100 + (v.def.shotDmg || 0)
                                : (v.quiverBonus || 0) > 0 ? 100 + (v.quiverBonus || 0)
                                : (v.curAtk || 0) + (v.hp || 0));
                        let best = own.slice()
                            .sort((a, b) => shotScore(b) - shotScore(a)
                                || a.row - b.row)[0];
                        if (focus && own.includes(focus)) best = focus;
                        if (!best) return;
                        aimOff(best);
                        best.quiverBonus = (best.quiverBonus || 0) + 1;
                        const p = cellXY(best.col, best.row);
                        floatText(p.x, p.y - 66, `🏹 ${best.quiverBonus}`, 0xffd98c);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.9 });
                        punch(best.node);
                        sfx("chpoc");
                        return;
                    }
                    // «Воздушный щит» (hw263, W75): самому ценному своему
                    // существу без щита (щит повторно ничего не меняет)
                    if (s.airShield) {
                        const own = spellTargets(B.units.filter((v) => v.side === "e"
                            && effCreature(v) && !v.airShield));
                        let best = own.slice()
                            .sort((a, b) => ((b.curAtk || 0) + (b.hp || 0))
                                - ((a.curAtk || 0) + (a.hp || 0))
                                || a.row - b.row)[0];
                        if (focus && own.includes(focus)) best = focus;
                        if (!best) return;
                        aimOff(best);
                        best.airShield = true;
                        const p = cellXY(best.col, best.row);
                        floatText(p.x, p.y - 66,
                            "✦ " + GAME_LOC.t("spell.airShield.name"), 0x9ecbe8);
                        fxEvent("ward", { x: p.x, y: p.y - 14, scale: 0.9 });
                        punch(best.node);
                        sfx("chpoc");
                        return;
                    }
                    // «Вихри магии» (hw261, W75): своему существу с БОЛЬШИМ
                    // числом своих эффектов (+N/+N за каждый)
                    if (s.vortexBuff) {
                        const own = spellTargets(B.units.filter((v) => v.side === "e"
                            && effCreature(v)));
                        let best = own.slice()
                            .sort((a, b) => hwEffectCount(b) - hwEffectCount(a)
                                || ((b.curAtk || 0) + (b.hp || 0))
                                - ((a.curAtk || 0) + (a.hp || 0))
                                || a.row - b.row)[0];
                        if (focus && own.includes(focus)) best = focus;
                        if (!best) return;
                        const n = hwEffectCount(best);
                        aimOff(best);
                        if (n > 0) {
                            best.bonusAtk = (best.bonusAtk || 0) + n;
                            best.hp += n;
                            recalcAuras();
                            const an = best.node.getChildByName("atk");
                            if (an) an.text = String(best.curAtk);
                            const hn = best.node.getChildByName("hp");
                            if (hn) hn.text = String(best.hp);
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 39, `+${n}⚔ +${n}♥`, 0x9ecbe8);
                            fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.9 });
                            punch(best.node);
                            onBuff(best, n, n); // «Белая пуща» (W61)
                        } else {
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 66, "±0", 0xc9b98c);
                        }
                        sfx("chpoc");
                        return;
                    }
                    // «Древомощь» (sg243): вся оставшаяся энергия →
                    // «Сокрушение» и +N⚔/+N♥ лучшему своему существу.
                    // Эффект до списания цены — пул = энергия минус цена
                    // (нулит aiPlay, как у stormAll)
                    if (s.crushEnergy) {
                        const own = spellTargets(B.units.filter((v) => v.side === "e"
                            && v.def.type === "unit"));
                        let best = own.slice()
                            .sort((a, b) => aiThreat(b) - aiThreat(a)
                                || a.row - b.row)[0];
                        if (focus && own.includes(focus)) best = focus;
                        if (!best) return;
                        aimOff(best);
                        const pool = Math.max(0,
                            B.eEnergy - effCost(cardIdOf(def), "e"));
                        best.crushGrant = true; // crushHit читает поверх def.crush
                        best.bonusAtk = (best.bonusAtk || 0) + pool;
                        best.hp += pool;
                        recalcAuras();
                        const an = best.node.getChildByName("atk");
                        if (an) an.text = String(best.curAtk);
                        const hn = best.node.getChildByName("hp");
                        if (hn) hn.text = String(best.hp);
                        const p = cellXY(best.col, best.row);
                        floatText(p.x, p.y - 39, `+${pool}⚔ +${pool}♥`, 0x9fd489);
                        floatText(960, 240, `−${pool}⚡`, 0xffd98c);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.9 });
                        punch(best.node);
                        sfx("chpoc");
                        onBuff(best, pool, pool); // «Белая пуща» (W61)
                        return;
                    }
                    // «Гидроудар» (wis99): 1 урон + сдвиг К ЕГО базе,
                    // цель — самая опасная (фокус руны, если годится)
                    if (s.hydroPunch) {
                        const foes = spellTargets(B.units.filter((v) => v.side === "p"
                            && v.def.type === "unit"));
                        let best = aiHydroPick();
                        if (focus && foes.includes(focus)) best = focus;
                        if (!best) return;
                        best = reflectAim("p", best); // «Отражение» (wis120) игрока
                        aimOff(best);
                        damageUnit(best, spellDmg(def, "e", true, true), null, "rocket");
                        if (B.units.includes(best)) pushTowardBase(best);
                        punch(best.node);
                        sfx("chpoc");
                        return;
                    }
                    // «Смыв» (wis85): существо игрока — в его руку; цель —
                    // самая опасная не-токенная единица (токены — крайний случай).
                    // «Защита от заклинаний» отсеяна общим фильтром целей.
                    if (s.bounce) {
                        const foes = spellTargets(B.units.filter((v) => v.side === "p"
                            && v.def.type === "unit"));
                        const real = foes.filter((v) => !v.token);
                        const pool = real.length ? real : foes;
                        let best = pool.slice()
                            .sort((a, b) => aiThreat(b) - aiThreat(a) || b.row - a.row)[0];
                        if (!best) return;
                        best = reflectAim("p", best); // «Отражение» (wis120) игрока
                        aimOff(best);
                        punch(best.node);
                        bounceUnit(best);
                        sfx("chpoc");
                        return;
                    }
                    // «Слабость» (wis86): −2 урона сильнейшему существу игрока
                    if (s.debuffAtk) {
                        let best = spellTargets(B.units
                            .filter((v) => v.side === "p" && v.def.type === "unit"))
                            .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                        if (!best) return;
                        best = reflectAim("p", best); // «Отражение» (wis120) игрока
                        aimOff(best);
                        best.bonusAtk = (best.bonusAtk || 0) - s.debuffAtk;
                        recalcAuras();
                        const p = cellXY(best.col, best.row);
                        floatText(p.x, p.y - 39, `−${s.debuffAtk}⚔`, 0xef9f8c);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.72 });
                        punch(best.node);
                        sfx("chpoc");
                        return;
                    }
                    // «Трупный яд» (dec144): «Яд N» на существо игрока —
                    // яд тикает и растёт, поэтому цель — самое живучее
                    // (успеет потерять больше); при равенстве — опаснее
                    if (s.poison) {
                        let best = spellTargets(B.units
                            .filter((v) => v.side === "p" && v.def.type === "unit"))
                            .sort((a, b) => (b.hp - a.hp) || (b.curAtk - a.curAtk))[0];
                        if (!best) return;
                        best = reflectAim("p", best); // «Отражение» (wis120) игрока
                        aimOff(best);
                        addPoison(best, s.poison);
                        punch(best.node);
                        return;
                    }
                    // «Разложение» (dec145): уничтожить существо игрока —
                    // крупнейшая угроза; затем ИИ сбрасывает карту с руки
                    // (наименее ценную; сама dec145 ещё в руке — не её)
                    if (s.destroy) {
                        let best = spellTargets(B.units
                            .filter((v) => v.side === "p" && v.def.type === "unit"))
                            .sort((a, b) => aiThreat(b) - aiThreat(a))[0];
                        if (!best) return;
                        best = reflectAim("p", best); // «Отражение» (wis120) игрока
                        aimOff(best);
                        punch(best.node);
                        killUnit(best, null);
                        discardWeakest("e", cardIdOf(def));
                        refreshHud();
                        return;
                    }
                    // «Ледяной удар» (wis92): цель бьёт случайного соседа-
                    // существо; урон считает сама цель, поэтому важна не её
                    // сторона, а чей сосед попадёт под удар (iceStrikePick)
                    if (s.iceStrike) {
                        const focusOk = focus && B.units.includes(focus)
                            && focus.def.type === "unit" && spellAimable(focus)
                            && iceStrikeVictims(focus).length > 0;
                        let target = focusOk ? focus : aiIceStrikeTarget();
                        if (!target) return;
                        target = reflectAim("p", target); // «Отражение» (wis120) игрока
                        const victim = iceStrikeVictim(target);
                        if (!victim) return;
                        aimOff(target); // скидка «Заклятого древоброда»
                        iceStrikeAttack(target, victim);
                        if (B.units.includes(victim)) addFrozen(victim, s.freeze || 1, "e");
                        punch(target.node);
                        sfx("chpoc");
                        return;
                    }
                    // «Аура света» (hon199): световая метка на своё существо —
                    // на то, у которого больше соседей-врагов (свету есть кого
                    // жечь в конце хода); при равенстве — опаснейшее
                    if (s.lightAura) {
                        const own = spellTargets(B.units.filter((v) => v.side === "e"
                            && v.def.type === "unit" && !v.lightAura));
                        let best = null, bs = -1;
                        for (const v of own) {
                            const foes = B.units.filter((w) => w.side !== "e"
                                && w.def.type === "unit"
                                && Math.abs(w.col - v.col) + Math.abs(w.row - v.row) === 1);
                            const sc = foes.length * 10 + aiThreat(v);
                            if (sc > bs) { bs = sc; best = v; }
                        }
                        if (focus && own.includes(focus)) best = focus;
                        if (!best) return;
                        aimOff(best);
                        best.lightAura = true;
                        const mark = new PIXI.Graphics();
                        mark.circle(0, 0, 9);
                        mark.fill({ color: 0xffe9b0 });
                        mark.stroke({ width: 3, color: 0xf0c96a });
                        mark.position.set(-36, -54);
                        mark.name = "auraMark";
                        mark.eventMode = "none";
                        best.node.addChild(mark);
                        const ap = cellXY(best.col, best.row);
                        floatText(ap.x, ap.y - 60, "☀", 0xffe9b0);
                        punch(best.node);
                        sfx("chpoc");
                        return;
                    }
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"
                        && (!s.enchantFire || !v.enchantFire)
                        && (!s.venom || !v.venom)));
                    // очарование «Огненного дыхания» вешается на крепкого атакующего
                    // (ему жить и бить, чтобы тянуть заклинания), «Природная мощь» —
                    // на самого живучего (+урона = жизням), усиление — на того, кто
                    // успеет ударить; всё это — в aiBuffPick
                    let best = aiBuffPick(def);
                    if (focus && own.includes(focus)) best = focus;
                    if (!best) return;
                    aimOff(best); // скидка «Заклятого древоброда» — оплатит aiPlay
                    if (s.enchantFire) { // «Огненное дыхание»
                        best.enchantFire = true;
                        const mark = new PIXI.Graphics();
                        mark.circle(0, 0, 10.5);
                        mark.fill({ color: 0xff7a2e });
                        mark.stroke({ width: 3, color: 0xffd98c });
                        mark.position.set(36, -54);
                        mark.name = "enchMark";
                        mark.eventMode = "none";
                        best.node.addChild(mark);
                        floatText(cellXY(best.col, best.row).x, cellXY(best.col, best.row).y - 60, "✦", 0xffb26e);
                    } else {
                        if (s.buffAtk) {
                            best.bonusAtk = (best.bonusAtk || 0) + s.buffAtk;
                            recalcAuras();
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 39, `+${s.buffAtk}⚔`, 0x9fd489);
                        }
                        if (s.buffHp) { // «Дар леса»: +N жизни
                            best.hp += s.buffHp;
                            const hn = best.node.getChildByName("hp");
                            if (hn) hn.text = String(best.hp);
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 75, `+${s.buffHp}♥`, 0x9fd489);
                        }
                        if (s.healPlayer) { // «Луч света» (hon179): своя база тоже
                            healBase("e", s.healPlayer);
                        }
                        if (s.buffAtkByHp) { // «Природная мощь»: +урона = жизням
                            const bump = best.hp;
                            best.bonusAtk = (best.bonusAtk || 0) + bump;
                            recalcAuras();
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 39, `+${bump}⚔`, 0x9fd489);
                            onBuff(best, bump, 0); // «Белая пуща» (W61)
                        }
                        // Обычные усиления — хук после обоих применений
                        if (s.buffAtk || s.buffHp)
                            onBuff(best, s.buffAtk || 0, s.buffHp || 0);
                        if (s.berserk) addBerserk(best, s.berserk);
                        if (s.venom) addVenom(best, s.venom); // «Отравленные лезвия»
                        // «Метка некроманта» (dec137): «Выкапливание» на самое
                        // ценное своё существо (aiBuffPick уже выбрал лучшего;
                        // счётчик стакается с уже висящим)
                        if (s.exhumingMark) {
                            addExhuming(best, (best.exhuming || 0) + s.exhumingMark);
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 90,
                                "⛏ +" + s.exhumingMark, 0xc9b98c);
                        }
                    }
                    punch(best.node);
                    if (s.buffAtk || s.buffHp || s.buffAtkByHp || s.enchantFire
                        || s.exhumingMark) {
                        const bp = cellXY(best.col, best.row);
                        fxEvent("buff", { x: bp.x, y: bp.y - 12,
                            color: s.enchantFire ? 0xff8a5e : 0xffd98c, scale: 0.82 });
                    }
                    sfx("chpoc");
                }
                if (s.target === "anyUnitDmg") {
                    const targets = aiDmgTargets(def);
                    if (s.purge) { // «Извлечение духа»: чистим самую «заряженную» цель
                        // (W60 юзер: на существа БЕЗ эффектов и способностей
                        // дух не извлекать — карта и энергия в никуда)
                        let best = null, bestScore = 0;
                        for (const v of targets) {
                            const n = countProps(v);
                            if (!n) continue;
                            const sc = n * 3 + aiThreat(v) * 0.5;
                            if (sc > bestScore) { bestScore = sc; best = v; }
                        }
                        // руна: фокус только «заряженный», иначе лучший по счёту
                        if (focus && targets.includes(focus)
                            && countProps(focus) > 0) best = focus;
                        if (best) {
                            best = reflectAim("p", best); // «Отражение» (wis120) игрока
                            const n = purgeUnit(best);
                            healBase("e", n);
                            sfx("chpoc");
                        }
                    } else if (s.cocoon) { // «Защитный кокон» — своему под удар
                        const own = spellTargets(B.units.filter((v) => v.side === "e"));
                        let best = aiCocoonPick();
                        if (focus && own.includes(focus)) best = focus;
                        if (best) addProtect(best);
                    } else { // дротик/варево/огнешар/светлячки
                        // ИИ добивает (приоритет — убийство), иначе бьёт туда,
                        // где урон окупается: угроза × доля жизней + близость
                        // к нашей базе. Точный урон считается по цели (скидка
                        // древоброда, алтарь, герой), прикидка — без траты
                        // флага «первого уронного» (consume=false).
                        let best = aiDmgTargetPick(def, targets, free);
                        if (focus && targets.includes(focus)) best = focus; // руна
                        if (!best) return;
                        best = reflectAim("p", best); // «Отражение» (wis120) игрока
                        aimOff(best); // скидка «Заклятого древоброда»
                        const dmg = aiDmgFor(def, best, free, true);
                        damageUnit(best, dmg, null, "rocket");
                        // «Ядро кометы»: выжившее существо — «Заморожен N»
                        if (s.freeze && B.units.includes(best)) addFrozen(best, s.freeze, "e");
                    }
                }
                if (s.target === "anyCell") { // «Испепеляющий луч»: колонка,
                    // где удар по существам окупается; стена костров — ряд,
                    // где огонь окупается
                    if (s.columnDmg) {
                        const col = aiColumnPick(s.columnDmg);
                        if (col === null) return; // невыгодной колонки нет
                        const dmg = s.columnDmg + altarBonus("e");
                        const fs = heroSpellBonus(def, "e", false, true);
                        A.fxHint = "mass"; // массовый урон — Impact frame
                        try {
                            for (const v of B.units.slice()) {
                                if (v.col !== col || v.def.type !== "unit") continue;
                                damageUnit(v, dmg + fs
                                    + heroSpellBonus(def, "e", true), null, "rocket");
                            }
                        } finally { A.fxHint = null; }
                        sfx("chpoc");
                        return;
                    }
                    const row = aiFirewallRow();
                    if (row === null) return; // невыгодного ряда нет — гейт держал карту
                    B.firewalls.push({ col: 2, row, side: "e",
                        left: s.turns, dmg: s.firewall });
                    redrawFirewalls();
                    sfx("chpoc");
                }
                if (s.target === "emptyCell") {
                    if (s.skeletonCrowd) { // толпа — клетка с пустыми соседями, ближе к базе игрока
                        let bc = -1, br = -1, bs = -1;
                        for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
                            if (unitAt(c, r)) continue;
                            let sc = 1;
                            if (c > 0 && !unitAt(c - 1, r)) sc++;
                            if (c < GRID - 1 && !unitAt(c + 1, r)) sc++;
                            sc = sc * 10 + r; // плотнее и впереди — лучше
                            if (sc > bs) { bs = sc; bc = c; br = r; }
                        }
                        if (bc >= 0 && skeletonCrowdSpawn("e", bc, br)) sfx("aqua");
                    } else { // культ — ряд, где больше пустых (ничья — где больше игроков)
                        const empt = [0, 0, 0, 0, 0], pu = [0, 0, 0, 0, 0];
                        for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
                            if (!unitAt(c, r)) empt[r]++;
                        for (const v of B.units) if (v.side === "p") pu[v.row]++;
                        let row = 0;
                        for (let r = 1; r < GRID; r++)
                            if (empt[r] > empt[row] || (empt[r] === empt[row] && pu[r] > pu[row])) row = r;
                        cultRowSpawn("e", row);
                    }
                }
                if (s.target === "enemyAny") {
                    const targets = spellTargets(B.units.filter((u) => u.side === "p"));
                    // если база добивается — бьём базу, даже когда на поле есть
                    // существа (прежний ИИ всегда бил существо и упускал летал)
                    const baseDmg = s.dmg + heroSpellBonus(def, "e", false, true);
                    if (!targets.length || B.playerBase <= baseDmg) {
                        damageBase("p", baseDmg,
                            { x: 960, y: 840, fill: 0xff5f4e });
                        sfx("chpoc");
                    } else {
                        const best = focus && targets.includes(focus)
                            ? focus // руна: именно атакующий
                            : aiDmgTargetPick(def, targets);
                        if (best) damageUnit(best, s.dmg + heroSpellBonus(def, "e",
                            best.def.type === "unit", true), null, "rocket");
                    }
                }
                if (s.phoenix) { // «Рождение феникса» (sg244): все постройки —
                    // в топку, Элементаль = числу жертв
                    phoenixRise("e");
                    return;
                }
                if (s.rootSummon) { // «Эльф корней» (sg247): Эльф 1/1 +
                    // опутывание случайного существа игрока (summonRootElf)
                    rootElfSpawn("e");
                    return;
                }
                if (s.wolfSummon) { // «Белый волк» (gh252, W61): Животное 2/3
                    // в случайную пустую клетку (wolfSpawn)
                    wolfSpawn("e");
                    sfx("aqua");
                    return;
                }
                if (s.summonPoints) { // «Огнелис»/«Огнемедведь» (sg249/250):
                    // Животное в случайную пустую клетку, очки поровну
                    // (лис 4/4, медведь 5/4) — распределение только у игрока
                    splitSpawn("e", s.summonToken,
                        Math.ceil(s.summonPoints / 2),
                        Math.floor(s.summonPoints / 2));
                    sfx("aqua");
                    return;
                }
                if (s.target === "none" && s.baseDmg) { // землетрясение
                    damageBase("p", s.baseDmg + heroSpellBonus(def, "e", false, true),
                        { x: 960, y: 840, fill: 0xff5f4e });
                    sfx("chpoc");
                }
                if (s.raiseDead) { // «Поднятие мёртвых»: лучшее существо сброса — в руку
                    const units = unitsInDiscard("e");
                    if (units.length) {
                        const best = units.slice()
                            .sort((a, b) => aiCardPower(CARDS[b]) - aiCardPower(CARDS[a]))[0];
                        B.eDiscard.splice(B.eDiscard.indexOf(best), 1);
                        B.eHand.push(best);
                        A.recalcAuras(); // «Каток» (tim236): сброс стал короче
                        sfx("chpoc");
                        refreshHud();
                    }
                }
                if (s.captivate) { // «Плен» (hon197): карта призыва игрока
                    // удаляется ДО КОНЦА БОЯ (не в сброс) — самая ценная
                    const units = B.hand.map((id, i) => ({ id, i }))
                        .filter((m) => CARDS[m.id] && CARDS[m.id].type === "unit")
                        .sort((a, b) => (aiCardPower(CARDS[b.id]) - aiCardPower(CARDS[a.id]))
                            || (b.i - a.i));
                    if (units.length) {
                        const pick = units[0];
                        B.hand.splice(pick.i, 1);
                        floatText(960, 640,
                            "✕ " + GAME_LOC.t(`card.${pick.id}.name`), 0x8cd0ef);
                        sfx("chpoc");
                        refreshHud();
                    }
                }
                if (s.resurrect) { // «Воскрешение» (hon200): лучшая карта
                    // призыва сброса разыгрывается БЕСПЛАТНО (правилами
                    // связок призыва); карты «Ловушки-пузыря» не призываются
                    const units = B.eDiscard.filter((id) => CARDS[id]
                        && CARDS[id].type === "unit" && !bubbleBlocked("e", id));
                    const best = units.length ? units.slice()
                        .sort((a, b) => aiCardPower(CARDS[b]) - aiCardPower(CARDS[a]))[0]
                        : null;
                    if (best) {
                        const spot = aiUnitSpot(CARDS[best]);
                        B.eDiscard.splice(B.eDiscard.indexOf(best), 1);
                        if (spot) {
                            addUnit("e", best, spot[0], spot[1]);
                            floatText(cellXY(spot[0], spot[1]).x,
                                cellXY(spot[0], spot[1]).y - 108,
                                GAME_LOC.t(`card.${best}.name`), 0xb7d0ef);
                            sfx("chpoc");
                        }
                        B.eDiscard.push(best); // разыгранная — обратно в сброс
                        refreshHud();
                    }
                }
                if (s.mindTorture) { // «Пытка разума»: ИИ всегда выбирает игрока
                    randomDiscard("p", s.mindTorture);
                }
                if (s.forbidden) { // «Запретные знания» (dec130): ИИ берёт себе
                    drawEnemy(s.forbidden.draw);
                    damageBase("e", s.forbidden.dmg, { x: 960, y: 240, fill: 0xff8f6e });
                    refreshHud();
                }
                if (s.target === "anyUnitOrFoe") { // «Негативный поток»: существо или база
                    // свои цели смысла не имеют — бьём по существам игрока
                    const targets = spellTargets(B.units.filter((u) =>
                        u.side !== "e" && u.def.type === "unit"));
                    const baseDmg = s.dmg + heroSpellBonus(def, "e", false, true);
                    if (!targets.length || B.playerBase <= baseDmg) {
                        damageBase("p", baseDmg, { x: 960, y: 840, fill: 0xff5f4e });
                        sfx("chpoc");
                    } else {
                        const best = focus && targets.includes(focus)
                            ? focus // руна: именно атакованный
                            : (aiDmgTargetPick(def, targets) || targets[0]);
                        if (best) damageUnit(best, s.dmg + heroSpellBonus(def, "e", true, true),
                            null, "rocket");
                    }
                }
                if (s.stealEnergy) { // «Похищение энергии»: 2⚡ игрока — нам
                    const got = Math.min(s.stealEnergy, B.energy);
                    B.energy -= got;
                    B.eEnergy += got;
                    floatText(960, 840, `−${got}⚡`, 0xff5f4e);
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("chpoc");
                }
                if (s.energyPerHand) { // «Цветение кристаллов»: +1⚡ за карту руки (сама не считается)
                    const got = Math.max(0, B.eHand.length - 1);
                    B.eEnergy += got;
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("chpoc");
                }
                if (s.energyPerTrap) { // «Поток маны»: +1⚡ за свою ловушку
                    const got = B.traps.e.length;
                    B.eEnergy += got;
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    if (got) punch(root.hud);
                    sfx("chpoc");
                }
                if (s.nextEnergy) { // «Медитация» (hw268, W78): +3⚡ в начале следующего хода (upkeep)
                    B.nextTurnEnergy.e += s.nextEnergy;
                    floatText(960, 60, `⏳ +${s.nextEnergy}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("chpoc");
                }
                if (s.target === "tagPick") { // «Эксперименты» (wt271, W79): метка цели →
                    // мин/макс среди меток ИИ. Эвристика: свой «Сдвиг» к
                    // минимуму (быстрее явится), свой «Выстрел» к максимуму,
                    // значок противника — к максимуму своих «Сдвигов»
                    const pick = (() => {
                        const dPool = tagPool("e", "delay");
                        if (dPool.length > 1) {
                            const mn = Math.min(...dPool);
                            const e = (B.delayed.e || [])
                                .filter((d) => d.left > mn)
                                .sort((a, b) => b.left - a.left)[0];
                            if (e) return { col: e.col, row: e.row,
                                tagKey: "delay", mm: "min" };
                        }
                        // свой живой значок «Возврата» ниже максимума —
                        // к МАКСИМУМУ (поправка юзера: существо должно
                        // ОСТАВАТЬСЯ на поле — возврат в руку заставит
                        // разыгрывать его заново; чем дольше, тем лучше)
                        const rPool = tagPool("e", "ret");
                        if (rPool.length > 1) {
                            const mx = Math.max(...rPool);
                            const u = B.units.find((v) => v.side === "e"
                                && B.units.includes(v)
                                && v.ret > 0 && v.ret < mx);
                            if (u) return { col: u.col, row: u.row,
                                tagKey: "ret", mm: "max" };
                        }
                        // значок «Возврата» ИГРОКА — к минимуму своих
                        // (его существо раньше уйдёт с поля в руку)
                        if (rPool.length) {
                            const mn = Math.min(...rPool);
                            const u = B.units.find((v) => v.side === "p"
                                && B.units.includes(v)
                                && v.ret > 0 && v.ret > mn);
                            if (u) return { col: u.col, row: u.row,
                                tagKey: "ret", mm: "min" };
                        }
                        const sPool = tagPool("e", "shotDmg");
                        if (sPool.length) {
                            const mx = Math.max(...sPool);
                            const u = B.units.find((v) => v.side === "e"
                                && B.units.includes(v)
                                && tagVal(v, "shotDmg")
                                && tagVal(v, "shotDmg") < mx);
                            if (u) return { col: u.col, row: u.row,
                                tagKey: "shotDmg", mm: "max" };
                        }
                        if (dPool.length && (B.delayed.p || []).length) {
                            const mx = Math.max(...dPool);
                            const e = (B.delayed.p || [])
                                .find((d) => d.left < mx);
                            if (e) return { col: e.col, row: e.row,
                                tagKey: "delay", mm: "max" };
                        }
                        return null;
                    })();
                    if (pick) applyTagPick("e", pick);
                }
                if (s.debuffEnemyAtkAll) { // «Нехватка воздуха»: −N урона всем существам игрока
                    const n = s.debuffEnemyAtkAll;
                    for (const v of B.units) if (v.side !== "e" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) - n;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `−${n}⚔`, 0xef9f8c);
                    }
                    recalcAuras();
                    sfx("chpoc");
                }
                if (s.iceSwarm) { // «Рой ледо-пикси»: Элементали 1/1 на случайные пустые клетки
                    iceSwarmSpawn("e", s.iceSwarm);
                    sfx("aqua");
                }
                if (s.laySummon) { // «Молебен» (hon166): Человек 2/2 на случайную пустую клетку
                    if (laySummonSpawn("e")) sfx("aqua");
                }
                if (s.rebalance) { // «Снабжение» (hon170): у всех своих существ
                    // меньшая из характеристик ⚔/♥ становится равной большей
                    for (const v of B.units.slice()) {
                        if (v.side !== "e" || v.def.type !== "unit"
                            || v.curAtk === v.hp) continue;
                        const a = v.curAtk;
                        let dAtk = 0, dHp = 0;
                        if (a < v.hp) {
                            dAtk = v.hp - a;
                            v.bonusAtk = (v.bonusAtk || 0) + dAtk;
                            recalcAuras();
                        } else { dHp = a - v.hp; v.hp = a; }
                        const an = v.node.getChildByName("atk");
                        if (an) an.text = String(v.curAtk);
                        const hn = v.node.getChildByName("hp");
                        if (hn) hn.text = String(v.hp);
                        const vp = cellXY(v.col, v.row);
                        floatText(vp.x, vp.y - 60, "⇔", 0xffd98c);
                        punch(v.node);
                        onBuff(v, dAtk, dHp); // «Белая пуща» (W61)
                    }
                    sfx("chpoc");
                }
                if (s.aoeDmg) { // «Раскалённые обломки»: всем существам и постройкам игрока
                    const dmg = s.aoeDmg + altarBonus("e");
                    const fs = heroSpellBonus(def, "e", false, true); // первое уронное — всем ударам
                    A.fxHint = "mass"; // массовый урон — Impact frame
                    try {
                        for (const v of B.units.slice()) if (v.side !== "e")
                            damageUnit(v, dmg + fs
                                + (v.def.type === "unit"
                                    ? heroSpellBonus(def, "e", true) : 0),
                                null, "rocket");
                    } finally { A.fxHint = null; }
                    sfx("chpoc");
                }
                if (s.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                    for (const v of B.units) if (v.side === "e" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) + s.buffAllAtk;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${s.buffAllAtk}⚔`, 0x9fd489);
                        onBuff(v, s.buffAllAtk, 0); // «Белая пуща» (W61)
                    }
                    recalcAuras();
                    sfx("chpoc");
                }
                if (s.forge) { // «Ковка оружия» (tim208): появившиеся в этот ход — +2⚔
                    B.forge.e = { turn: B.turnNo, amt: s.forge };
                    for (const v of B.units) if (v.side === "e"
                        && v.def.type === "unit" && v.bornTurn === B.turnNo) {
                        v.bonusAtk += s.forge;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${s.forge}⚔`, 0x9fd489);
                        onBuff(v, s.forge, 0); // «Белая пуща» (W61)
                    }
                    recalcAuras();
                    sfx("chpoc");
                }
                if (s.sacrifice) { // «Жертвоприношение»: взрыв по соседям жертвы
                    const u = aiSacrificePick();
                    if (u) {
                        const p = cellXY(u.col, u.row);
                        killUnit(u, null);
                        floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                        for (const v of B.units.slice())
                            if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1)
                                damageUnit(v, s.dmg, null, "rocket");
                    }
                }
                if (s.beastBlast) { // «Взрыв твари» (dec150): жертва — жетон
                    // либо самый дешёвый размен; урон растёт от суммы ⚔+♥
                    let best = null, bs = -1e9;
                    for (const v of B.units) {
                        if (v.side !== "e" || v.def.type !== "unit") continue;
                        const sc = (v.curAtk || 0) + (v.hp || 0)
                            + (v.token ? 10 : 0) - aiThreat(v) * 0.5;
                        if (sc > bs) { bs = sc; best = v; }
                    }
                    if (best) beastBlastCast("e", best);
                }
                if (s.darkExtract) { // «Извлечение тьмы» (dec153): жертва —
                    // жетон либо своё с максимумом суммы ⚔+♥ (она станет энергией)
                    let best = null, bs = -1e9;
                    for (const v of B.units) {
                        if (v.side !== "e" || v.def.type !== "unit") continue;
                        const sc = (v.curAtk || 0) + (v.hp || 0)
                            + (v.token ? 10 : 0);
                        if (sc > bs) { bs = sc; best = v; }
                    }
                    if (best) {
                        const n = (best.curAtk || 0) + (best.hp || 0);
                        const p2 = cellXY(best.col, best.row);
                        killUnit(best, null);
                        floatText(p2.x, p2.y - 45, "☠", 0xef9f8c);
                        B.eEnergy += n;
                        floatText(960, 60, `+${n}⚡`, 0xffd98c);
                        punch(root.hud);
                        sfx("chpoc");
                    }
                }
                if (s.terrainScout) { // «Выбор местности» (dec156): лучшая постройка топ-6 — в руку
                    const top = aiTopCards(Math.min(s.terrainScout || 6, B.eDeck.length));
                    const best = top.filter((m) => CARDS[m.id]
                        && CARDS[m.id].type === "building")
                        .sort((a, b) => aiCardPower(CARDS[b.id]) - aiCardPower(CARDS[a.id]))[0];
                    if (best) {
                        B.eDeck.splice(best.j, 1);
                        B.eHand.push(best.id);
                        floatText(960, 60, "⤒ " + GAME_LOC.t(`card.${best.id}.name`), 0xb7d0ef);
                        sfx("chpoc");
                    }
                }
                if (s.bloodMoon) { // «Кровавая луна» (dec160): жизни базы — в энергию, базе оставляем 2♥
                    const n = Math.min(s.bloodMoon || 3, B.enemyBase - 2);
                    if (n >= 1) {
                        B.enemyBase -= n; // «потратьте» — не урон
                        B.eEnergy += n;
                        floatText(960, 240, `−${n}♥ +${n}⚡`, 0xef9f8c);
                        punch(root.hud);
                        sfx("chpoc");
                    }
                }
                if (s.mindControl) { // «Тёмный контроль» (dec134): забираем
                    // самое опасное существо игрока (реальные ценнее жетонов),
                    // платя 2♥ базы
                    let best = spellTargets(B.units.filter((v) => v.side === "p"
                        && v.def.type === "unit"))
                        .sort((a, b) => (aiThreat(b) - aiThreat(a))
                            || ((a.token ? 1 : 0) - (b.token ? 1 : 0)))[0];
                    if (!best) return;
                    damageBase("e", s.mindControl, { x: 960, y: 240, fill: 0xff8f6e });
                    best.side = "e"; // как собственный призыв: марши/атаки по новой стороне
                    recalcAuras();
                    const p2 = cellXY(best.col, best.row);
                    floatText(p2.x, p2.y - 78, "⇄", 0xc9a0ef);
                    fxEvent("seal", { x: p2.x, y: p2.y - 8, color: 0xc9a0ef, scale: 0.85 });
                    punch(best.node);
                    sfx("chpoc");
                }
                if (s.lightAura) { // «Аура света» (hon199): световая метка на
                    // своё существо — на то, у которого больше соседей-врагов
                    // (свету есть кого жечь в конце хода); при равенстве —
                    // опаснейшее
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit" && !v.lightAura));
                    let best = null, bs = -1;
                    for (const v of own) {
                        const foes = B.units.filter((w) => w.side !== "e"
                            && w.def.type === "unit"
                            && Math.abs(w.col - v.col) + Math.abs(w.row - v.row) === 1);
                        const sc = foes.length * 10 + aiThreat(v);
                        if (sc > bs) { bs = sc; best = v; }
                    }
                    if (focus && own.includes(focus)) best = focus;
                    if (best) {
                        aimOff(best);
                        best.lightAura = true;
                        const mark = new PIXI.Graphics();
                        mark.circle(0, 0, 9);
                        mark.fill({ color: 0xffe9b0 });
                        mark.stroke({ width: 3, color: 0xf0c96a });
                        mark.position.set(-36, -54);
                        mark.name = "auraMark";
                        mark.eventMode = "none";
                        best.node.addChild(mark);
                        const ap = cellXY(best.col, best.row);
                        floatText(ap.x, ap.y - 60, "☀", 0xffe9b0);
                        punch(best.node);
                        sfx("chpoc");
                    }
                }
                if (s.baseHit) { // «Бросок валуна»: своё сильнейшее бьёт базу героя — это его атака
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"))
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row));
                    if (own[0]) { baseHit("e", own[0]); triggerAttackTraps(own[0]); }
                }
                if (s.draw) drawEnemy(s.draw);
                // «Добыча кристаллов» (tim211): +1⚡ за каждую единицу
                // «Сдвига» своих ждущих карт (значков на клетках)
                if (s.crystalHarvest) {
                    let n = 0;
                    for (const d2 of (B.delayed ? B.delayed.e : []))
                        n += Math.max(0, d2.left);
                    if (n > 0) {
                        B.eEnergy += n;
                        floatText(960, 190, `+${n}⚡`, 0xffd98c);
                        sfx("chpoc");
                    }
                }
                // «Временная петля» (tim229): после этого хода враг играет
                // ещё раз — флаг тратится в конце enemyTurn
                if (s.extraTurn) {
                    B.extraTurn.e = true;
                    floatText(960, 430,
                        "⏳ " + GAME_LOC.t("time.loop.extra"), 0xc9a0ef);
                    fxEvent("seal", { x: 960, y: 430, color: 0xc9a0ef, scale: 1.4 });
                    sfx("chpoc");
                }
                // «Царский совет» (tim230): все жетоны ловушек ИГРОКА
                // снимаются с поля боя (клеточные и руны-жетоны)
                if (s.trapSweep) {
                    const swept = B.traps.p.length;
                    B.traps.p = [];
                    redrawTraps();
                    for (let i = 0; i < Math.min(swept, 3); i++)
                        fxEvent("seal", { x: 960 + (i - 1) * 140, y: 660,
                            color: 0x8a5ab0, scale: 0.9 });
                    floatText(960, 600,
                        "✕ " + GAME_LOC.t("time.sweep.done"), 0xef9f8c);
                    sfx("mine");
                }
                // «Управление временем» (tim223): лучший жетон и направление
                // выбрал aiTokenPick (гейт проверил, что есть что менять)
                if (s.tokenShift) {
                    const pick = aiTokenPick();
                    if (pick) {
                        applyTokenShift("e", pick);
                        const pp = cellXY(pick.col, pick.row);
                        floatText(pp.x, pp.y - 108,
                            GAME_LOC.t(`card.${cardIdOf(def)}.name`), 0xc9a0ef);
                    }
                }
                // «Запутать руны»: ОБЕ руки в сброс, по 3 карты (спека: «вы и
                // противник»; раньше сбрасывалась только своя — баг юзера).
                // При прямом розыгрыше карта ещё в руке — её оставляем, aiPlay
                // уберёт её сам (fromHand); при повторе/руне карты в руке нет.
                if (s.discardHandDraw)
                    confuseRunes("e", s.discardHandDraw,
                        fromHand ? cardIdOf(def) : null);
                // «Мозговой штурм» (tim206): сброс ВСЕЙ руки и добор столько
                // же +1. Карта при прямом розыгрыше ещё в руке (fromHand —
                // aiPlay уберёт её сам, как у «Запутать руны»)
                if (s.brainstorm)
                    discardHandDraw("e", B.eHand.length + (fromHand ? 2 : 1),
                        fromHand ? cardIdOf(def) : null);
                if (s.search) { // «Поиск рун»: из ВЕРХНИХ N заклинаний — лучшее в руку
                    const k = aiSearchSpell(s.search);
                    if (k) { B.eDeck.splice(k.j, 1); B.eHand.push(k.id); }
                }
                if (s.searchUnit) { // «Рунное гадание»: из верхних N призывов — лучший
                    const k = aiSearchUnit(s.searchUnit);
                    if (k) { B.eDeck.splice(k.j, 1); B.eHand.push(k.id); }
                }
                if (s.seek) { // «Поиск знаний»: лучшие `seekPicks` из верхних N — в руку
                    const k = Math.min(s.seek, B.eDeck.length);
                    const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                    const want = Math.min(s.seekPicks || 1, top.length);
                    const ranked = top.map((id, i) => ({ id, i, sc: aiCardPower(CARDS[id]) }))
                        .sort((a, b) => (b.sc - a.sc) || (b.i - a.i));
                    const take = new Set();
                    for (const x of ranked.slice(0, want)) { take.add(x.i); B.eHand.push(x.id); }
                    for (let i = 0; i < top.length; i++) if (!take.has(i)) B.eDeck.push(top[i]);
                    if (want) sfx("chpoc");
                }
                if (s.timeSearch) { // «Поиск во времени»: лучшая карта со
                    // «Сдвигом»/«Возвратом» из верхних N — в руку (гейт уже
                    // проверил, что такая там есть)
                    const k = Math.min(s.timeSearch, B.eDeck.length);
                    const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                    const fit = top.map((id, i) => ({ id, i }))
                        .filter((x) => { const d = CARDS[x.id];
                            return d && (d.delay || d.returnN); });
                    if (fit.length) {
                        fit.sort((a, b) => aiCardPower(CARDS[b.id]) - aiCardPower(CARDS[a.id])
                            || b.i - a.i);
                        B.eHand.push(top[fit[0].i]);
                        top.splice(fit[0].i, 1);
                        sfx("chpoc");
                    }
                    B.eDeck.push(...top); // остаток — наверх колоды в прежнем порядке
                }
                if (s.grim) { // «Гримуар инея»: тип с наибольшим числом карт среди верхних 4
                    const k = Math.min(s.grim, B.eDeck.length);
                    const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                    const by = {};
                    for (let i = 0; i < top.length; i++) {
                        const ty = CARDS[top[i]].type;
                        (by[ty] = by[ty] || []).push(i);
                    }
                    // приоритет при равенстве: призыв > заклинание > ловушка > постройка
                    let want = null;
                    for (const ty of ["unit", "spell", "trap", "building"])
                        if (by[ty] && (!want || by[ty].length > by[want].length)) want = ty;
                    if (want) for (const i of by[want]) B.eHand.push(top[i]);
                    for (let i = 0; i < top.length; i++)
                        if (!want || CARDS[top[i]].type !== want) B.eDiscard.push(top[i]);
                    const grimRest = top.filter((id) => !want
                        || CARDS[id].type !== want);
                    noteDiscard(grimRest.length, "e", grimRest); // «Болотная слизь»
                    if (want) sfx("chpoc");
                }
                if (s.discardPick) { // «Варка зелий»: лучшее заклинание сбросов — в руку
                    const pick = (disc) => disc
                        .filter((id) => CARDS[id] && CARDS[id].type === "spell" && id !== "grw23")
                        .map((id) => ({ id, sc: aiCardPower(CARDS[id])
                            + (aiSpellPlayable(CARDS[id]) ? 1 : 0) }))
                        .sort((a, b) => b.sc - a.sc)[0];
                    const own = pick(B.eDiscard), foe = pick(B.discard);
                    // своё ближе; чужое берём, только если заметно сильнее
                    const k = own && (!foe || own.sc + 0.5 >= foe.sc) ? own : foe;
                    if (k) {
                        const disc = B.eDiscard.includes(k.id) ? B.eDiscard : B.discard;
                        disc.splice(disc.indexOf(k.id), 1);
                        B.eHand.push(k.id);
                        B.scorch.e.add(k.id); // сожжётся после розыгрыша
                        A.recalcAuras(); // «Каток» (tim236): сброс стал короче
                    }
                }
                if (s.excavate) { // «Раскопки»: худшую свою постройку — в сброс, из сброса — лучшую
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "building")
                        .sort((a, b) => aiCardPower(a.def) - aiCardPower(b.def));
                    const back = B.eDiscard.filter((id) => CARDS[id] && CARDS[id].type === "building")
                        .sort((a, b) => aiCardPower(CARDS[b]) - aiCardPower(CARDS[a]))[0];
                    const out = own[0];
                    if (out && back && aiCardPower(CARDS[back]) > aiCardPower(out.def)) {
                        const cell = { col: out.col, row: out.row };
                        removeUnit(out); // в сброс без каскадов смерти
                        recalcAuras();
                        B.eDiscard.push(cardIdOf(out.def));
                        noteDiscard(1, "e", [cardIdOf(out.def)]);
                        B.eDiscard.splice(B.eDiscard.indexOf(back), 1);
                        addUnit("e", back, cell.col, cell.row);
                        sfx("chpoc");
                    }
                }
                if (s.journey) { // «Глубокое путешествие»: лучший призыв из верхних N — бесплатно
                    // «Ловушка-пузырь» (wis119) игрока: карту существа под
                    // пузырём не призываем (спека юзера) — она уйдёт в rest
                    const chosen = aiSummonPick(s.journey, (id) =>
                        !bubbleBlocked("e", id)); // выбор ДО изъятия карт
                    const k = Math.min(s.journey, B.eDeck.length);
                    const top = k ? B.eDeck.splice(B.eDeck.length - k, k) : [];
                    const chosenId = chosen ? chosen.id : null;
                    const rest = top.filter((id) => id !== chosenId);
                    if (rest.length) {
                        const r = (Math.random() * rest.length) | 0;
                        B.eHand.push(rest[r]); // одна случайная — в руку (по правилу карты)
                        for (let i = 0; i < rest.length; i++) if (i !== r) B.eDiscard.push(rest[i]);
                        noteDiscard(rest.length - 1, "e",
                            rest.filter((_, i) => i !== r)); // «Болотная слизь»
                    }
                    if (chosenId) {
                        // клетка призыва — теми же правилами связок, что и обычный
                        // призыв ИИ (лагерь/костёр рядом, передний ряд, колонка без своих)
                        const spot = aiUnitSpot(CARDS[chosenId]);
                        if (spot) {
                            addUnit("e", chosenId, spot[0], spot[1]);
                        } else B.eHand.push(chosenId); // поле забито — карта хотя бы в руку
                    }
                }
                if (s.brew) { B.brewCasts = (B.brewCasts || 0) + 1; refreshBrewBadges(); }
            };
        }
    };
})();
