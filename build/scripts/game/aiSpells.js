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
                // заклинание ИЗ РУКИ рождает эффект в центре показанной
                // карты врага (просил юзер), не в центре экрана; руны и
                // повторы без показанной карты — как раньше
                const origin = fromHand && enemyCard && enemyCard.node
                    ? { x: enemyCard.node.x, y: enemyCard.node.y } : null;
                fxSpellCast(def, focus, "e", origin);
                try {
                    enemyCastSpellEffectInner(def, free, focus, fromHand);
                } finally { A.spellCasting = false; }
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
                    if (best) { novaSplash(best); punch(best.node); sfx("up"); }
                }
                if (s.wolfVolley) { // «Атака духами волков»: стрелок без своих на линии
                    const best = aiWolfPick();
                    aimOff(best);
                    if (best) wolfVolley(best);
                }
                if (s.target === "anyUnit" && !s.nova) { // усиление/очарование — лучшему
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
                        sfx("aqua");
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
                        sfx("aqua");
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
                        sfx("acid");
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
                        sfx("aqua");
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
                            const n = s.healPlayer;
                            B.enemyBase = Math.min(B.enemyBaseMax, B.enemyBase + n);
                            floatText(960, 60, `+${n}`, 0x9fd489);
                            fxEvent("heal", { x: 960, y: 70, scale: 1.15 });
                            punch(root.hud);
                        }
                        if (s.buffAtkByHp) { // «Природная мощь»: +урона = жизням
                            best.bonusAtk = (best.bonusAtk || 0) + best.hp;
                            recalcAuras();
                            const p = cellXY(best.col, best.row);
                            floatText(p.x, p.y - 39, `+${best.hp}⚔`, 0x9fd489);
                        }
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
                    sfx("up");
                }
                if (s.target === "anyUnitDmg") {
                    const targets = aiDmgTargets(def);
                    if (s.purge) { // «Извлечение духа»: чистим самую «заряженную» цель
                        let best = null, bestScore = 0;
                        for (const v of targets) {
                            const n = countProps(v);
                            if (!n) continue;
                            const sc = n * 3 + aiThreat(v) * 0.5;
                            if (sc > bestScore) { bestScore = sc; best = v; }
                        }
                        if (focus && targets.includes(focus)) best = focus; // руна
                        if (best) {
                            best = reflectAim("p", best); // «Отражение» (wis120) игрока
                            const n = purgeUnit(best);
                            B.enemyBase = Math.min(B.enemyBaseMax, B.enemyBase + n);
                            floatText(960, 60, `+${n}`, 0x9fd489);
                            fxEvent("heal", { x: 960, y: 70, scale: 1.15 });
                            punch(root.hud);
                            sfx("up");
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
                        for (const v of B.units.slice()) {
                            if (v.col !== col || v.def.type !== "unit") continue;
                            damageUnit(v, dmg + fs
                                + heroSpellBonus(def, "e", true), null, "rocket");
                        }
                        sfx("rocket");
                        return;
                    }
                    const row = aiFirewallRow();
                    if (row === null) return; // невыгодного ряда нет — гейт держал карту
                    B.firewalls.push({ col: 2, row, side: "e",
                        left: s.turns, dmg: s.firewall });
                    redrawFirewalls();
                    sfx("rocket");
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
                        if (bc >= 0 && skeletonCrowdSpawn("e", bc, br)) sfx("use");
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
                        sfx("rocket");
                    } else {
                        const best = focus && targets.includes(focus)
                            ? focus // руна: именно атакующий
                            : aiDmgTargetPick(def, targets);
                        if (best) damageUnit(best, s.dmg + heroSpellBonus(def, "e",
                            best.def.type === "unit", true), null, "rocket");
                    }
                }
                if (s.target === "none" && s.baseDmg) { // землетрясение
                    damageBase("p", s.baseDmg + heroSpellBonus(def, "e", false, true),
                        { x: 960, y: 840, fill: 0xff5f4e });
                    sfx("rocket");
                }
                if (s.raiseDead) { // «Поднятие мёртвых»: лучшее существо сброса — в руку
                    const units = unitsInDiscard("e");
                    if (units.length) {
                        const best = units.slice()
                            .sort((a, b) => aiCardPower(CARDS[b]) - aiCardPower(CARDS[a]))[0];
                        B.eDiscard.splice(B.eDiscard.indexOf(best), 1);
                        B.eHand.push(best);
                        sfx("chpoc");
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
                        sfx("rocket");
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
                    sfx("aqua");
                }
                if (s.energyPerHand) { // «Цветение кристаллов»: +1⚡ за карту руки (сама не считается)
                    const got = Math.max(0, B.eHand.length - 1);
                    B.eEnergy += got;
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (s.energyPerTrap) { // «Поток маны»: +1⚡ за свою ловушку
                    const got = B.traps.e.length;
                    B.eEnergy += got;
                    floatText(960, 60, `+${got}⚡`, 0xffd98c);
                    if (got) punch(root.hud);
                    sfx("aqua");
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
                    sfx("acid");
                }
                if (s.iceSwarm) { // «Рой ледо-пикси»: Элементали 1/1 на случайные пустые клетки
                    iceSwarmSpawn("e", s.iceSwarm);
                    sfx("use");
                }
                if (s.laySummon) { // «Молебен» (hon166): Человек 2/2 на случайную пустую клетку
                    if (laySummonSpawn("e")) sfx("use");
                }
                if (s.rebalance) { // «Снабжение» (hon170): у всех своих существ
                    // меньшая из характеристик ⚔/♥ становится равной большей
                    for (const v of B.units.slice()) {
                        if (v.side !== "e" || v.def.type !== "unit"
                            || v.curAtk === v.hp) continue;
                        const a = v.curAtk;
                        if (a < v.hp) {
                            v.bonusAtk = (v.bonusAtk || 0) + (v.hp - a);
                            recalcAuras();
                        } else v.hp = a;
                        const an = v.node.getChildByName("atk");
                        if (an) an.text = String(v.curAtk);
                        const hn = v.node.getChildByName("hp");
                        if (hn) hn.text = String(v.hp);
                        const vp = cellXY(v.col, v.row);
                        floatText(vp.x, vp.y - 60, "⇔", 0xffd98c);
                        punch(v.node);
                    }
                    sfx("up");
                }
                if (s.aoeDmg) { // «Раскалённые обломки»: всем существам и постройкам игрока
                    const dmg = s.aoeDmg + altarBonus("e");
                    const fs = heroSpellBonus(def, "e", false, true); // первое уронное — всем ударам
                    for (const v of B.units.slice()) if (v.side !== "e")
                        damageUnit(v, dmg + fs
                            + (v.def.type === "unit" ? heroSpellBonus(def, "e", true) : 0),
                            null, "rocket");
                    sfx("rocket");
                }
                if (s.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                    for (const v of B.units) if (v.side === "e" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) + s.buffAllAtk;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${s.buffAllAtk}⚔`, 0x9fd489);
                    }
                    recalcAuras();
                    sfx("up");
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
                        sfx("aqua");
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
                        sfx("aqua");
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
                if (s.baseHit) { // «Бросок валуна»: своё сильнейшее бьёт базу героя — это его атака
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"))
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row));
                    if (own[0]) { baseHit("e", own[0]); triggerAttackTraps(own[0]); }
                }
                if (s.draw) drawEnemy(s.draw);
                // «Запутать руны»: ОБЕ руки в сброс, по 3 карты (спека: «вы и
                // противник»; раньше сбрасывалась только своя — баг юзера).
                // При прямом розыгрыше карта ещё в руке — её оставляем, aiPlay
                // уберёт её сам (fromHand); при повторе/руне карты в руке нет.
                if (s.discardHandDraw)
                    confuseRunes("e", s.discardHandDraw,
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
