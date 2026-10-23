// СЦЕНА «АРЕНА»: действия игрока: выбор, призыв, заклинания.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installActions = function installActions(A) {
        with (A) {
            A.playerTurnStart = async function playerTurnStart() {
                B.turnNo += 1; // шкала подросла: сфер теперь на одну больше
                B.phase = "anim";
                B.selected = null;
                B.spellTarget = false;
                refreshHud();
                firewallTick("e"); // стена костров врага — конец хода врага
                sproutTick("e");   // ростки врага подросли — конец его хода
                if (B.stopped || B.phase === "over") return;
                banner(t("arena.yourTurn"));
                fxEvent("turn", { side: "p", color: 0xffd98c });
                await delay(0.4 / animK());
                if (B.stopped) return;
                upkeep("p"); // грибницы игрока
                poisonTick("p"); // яд: до марша (просил юзер)
                await marchSide("p");
                if (B.stopped || B.phase === "over") return;
                B.phase = "player";
                layoutHand();
                redrawHighlight();
                refreshHud();
                // «Пень обряда»: в начале хода — взгляд на верхнюю карту колоды
                if (B.units.some((b) => b.side === "p" && b.def.type === "building"
                    && b.def.riteStump)) openStumpPanel();
            };

            // ── Действия игрока ────────────────────────────────────────────────
            A.spendCard = function spendCard(handIdx) { // вынимает карту из руки в сброс
                const cardId = B.hand[handIdx];
                if (B.scorch.p.has(cardId)) { // «Сожжение»: карта удаляется из боя
                    B.scorch.p.delete(cardId);
                    floatText(960, 640, `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                    sfx("rocket");
                } else {
                    B.discard.push(cardId);
                }
                B.hand.splice(handIdx, 1);
                B.selected = null;
                B.spellTarget = false;
                return cardId;
            };

            // снять выбор карты: карты руки снова интерактивны
            A.deselect = function deselect() {
                if (B.selected === null && !B.spellTarget) return;
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            A.onCardTap = function onCardTap(idx) {
                if (B.phase !== "player" || B.discarding || B.picking) return;
                if (B.journeySummon) return; // сначала поставьте (или отмените) призыв
                const def = CARDS[B.hand[idx]];
                if (!def) return;
                if (ctx.sfx) ctx.sfx();
                if (def.type === "spell" && def.spell.target === "none") {
                    castSpell(idx); // без цели — сразу
                    return;
                }
                if (def.type === "trap") {
                    // руна и споры вешаются на существо; лимита ловушек нет
                    // (просил юзер) — можно ставить сколько угодно
                    if (effCost(B.hand[idx]) > B.energy) return;
                    // мина ставится на выбранную пустую клетку — выбор как у юнитов
                    B.selected = B.selected === idx ? null : idx;
                    B.spellTarget = false;
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                // unit/building/spell с прицелом — выбор клетки
                B.selected = B.selected === idx ? null : idx;
                B.spellTarget = B.selected !== null && def.type === "spell";
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            A.onCellTap = function onCellTap(col, row) {
                if (B.phase !== "player" || B.discarding || B.picking) return;
                if (B.journeySummon) { // «Глубокое путешествие»: бесплатный призыв
                    if (!deployRows("p").includes(row) || unitAt(col, row)) return;
                    const cardId = B.journeySummon;
                    B.journeySummon = null;
                    // «Отмена призыва» (wis84) врага: бесплатный призыв — тоже
                    // призыв; карта уходит в сброс, существо не появляется
                    if (counterTrapConsume("e", "counterSummon")) {
                        B.discard.push(cardId);
                        const jp = cellXY(col, row);
                        floatText(jp.x, jp.y - 60,
                            "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    } else {
                        addUnit("p", cardId, col, row); // энергия не тратится
                    }
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                if (B.selected === null) return;
                const def = CARDS[B.hand[B.selected]];
                if (!def) return;
                if (B.spellTarget) { // прицел: по врагу, любому существу или строению
                    const sdef = CARDS[B.hand[B.selected]];
                    const u = unitAt(col, row);
                    const tg = sdef.spell.target;
                    if (tg === "anyCell") { // стена костров — подходит любая клетка
                        castSpell(B.selected, { col, row });
                        return;
                    }
                    if (tg === "emptyCell") { // культ кочерыжки — только пустая клетка
                        if (!unitAt(col, row)) castSpell(B.selected, { col, row });
                        else deselect();
                        return;
                    }
                    const typeOk = u && !u.spellWard // «Защита от заклинаний» — целью заклинаний не выбирается
                        && (tg === "anyUnitDmg"
                            ? (u.def.type === "unit"
                                || (u.def.type === "building" && !sdef.spell.noBuildings))
                            : tg === "ownBuilding" ? u.def.type === "building"
                            : u.def.type === "unit");
                    const sideOk = !u || !(tg === "ownUnit" || tg === "ownBuilding")
                        || u.side === "p";
                    const known = tg === "anyUnit" || tg === "anyUnitDmg"
                        || tg === "ownUnit" || tg === "ownBuilding";
                    // «Ледяной удар»: у цели должен быть хотя бы один сосед-
                    // существо, иначе заклинание не разыгрывается
                    const effectOk = !sdef.spell.iceStrike || !!iceStrikeVictim(u);
                    if (u && typeOk && sideOk && known && effectOk) castSpell(B.selected, { col, row });
                    else deselect(); // мимо цели — снять выбор
                    return;
                }
                if (def.type === "trap") {
                    // руна («Наскальная рунопись») и споры («Призрачные споры») —
                    // наоборот, на существо; споры — только на существо ВРАГА
                    if (def.trap.effect === "castRandom" || def.trap.effect === "sporeCurse") {
                        const u = unitAt(col, row);
                        if (!u || u.def.type !== "unit"
                            || (def.trap.effect === "sporeCurse" && u.side === "p")) {
                            deselect();
                            return;
                        }
                        B.energy -= effCost(B.hand[B.selected]); // цена ловушки
                        const cardId = spendCard(B.selected);
                        if (def.trap.effect === "sporeCurse") addSpores(u);
                        else armTrap("p", cardId, 0, 0, u);
                        deselect();
                        layoutHand();
                        redrawHighlight();
                        refreshHud();
                        return;
                    }
                    // «Опутывание корней» (grw35) — на ЛЮБУЮ клетку поля, даже
                    // под существо: «нахождение» — условие срабатывания, оно
                    // опутывается сразу; прочие ловушки — только пустая клетка
                    const occupant = unitAt(col, row);
                    if (occupant && def.trap.effect !== "entangle") { deselect(); return; }
                    B.energy -= effCost(B.hand[B.selected]); // цена ловушки
                    const cardId = spendCard(B.selected);
                    armTrap("p", cardId, col, row);
                    if (occupant) triggerCellTraps(occupant); // сработала сразу
                    deselect();
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    return;
                }
                // мимо допустимых клеток (не в зоне / занято / не хватает маны) —
                // снять выбор: карты руки снова кликабельны (при выбранной карте
                // они неинтерактивны, чтобы крупные карты не съедали клики полем)
                if (!deployRows("p").includes(row) || unitAt(col, row) || effCost(B.hand[B.selected]) > B.energy) {
                    deselect();
                    return;
                }
                B.energy -= effCost(B.hand[B.selected]);
                const cardId = spendCard(B.selected);
                // «Отмена призыва» (wis84) врага: существо не появляется,
                // карта и энергия потрачены (строения отмену не триггерят —
                // спека говорит о существах)
                if (CARDS[cardId].type === "unit"
                    && counterTrapConsume("e", "counterSummon")) {
                    const sp = cellXY(col, row);
                    floatText(sp.x, sp.y - 60,
                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                } else {
                    addUnit("p", cardId, col, row);
                }
                if (ctx.sfx) ctx.sfx();
                layoutHand();
                redrawHighlight();
                refreshHud();
            };

            // «Культ кочерыжки» (str40): на всех пустых клетках горизонтального
            // ряда (одинаковый row, колонки 0..4) появляются Гоблины 3/4 стороны
            // кастовавшего (служебная карта gobC, на поле — как обычный призыв:
            // ловушки клеток, ауры, бейджи). Возвращает число призванных.
            A.cultRowSpawn = function cultRowSpawn(side, row) {
                let n = 0;
                for (let col = 0; col < GRID; col++) {
                    if (unitAt(col, row)) continue;
                    addUnit(side, "gobC", col, row, { token: true });
                    n++;
                }
                return n;
            };

            // «Рой ледо-пикси» (wis103): на N СЛУЧАЙНЫХ ПУСТЫХ клетках поля
            // (не только своей зоны призыва) появляются Элементали 1/1
            // с «Полётом» (служебная карта icePixie). Клетки выбираются без
            // повторов; если пустых меньше N — призываются сколько влезло.
            // Возвращает число призванных.
            A.iceSwarmSpawn = function iceSwarmSpawn(side, count) {
                const empty = [];
                for (let row = 0; row < GRID; row++)
                    for (let col = 0; col < GRID; col++)
                        if (!unitAt(col, row)) empty.push([col, row]);
                const n = Math.min(Math.max(0, count | 0), empty.length);
                for (let i = 0; i < n; i++) {
                    const [col, row] = empty.splice((Math.random() * empty.length) | 0, 1)[0];
                    addUnit(side, "icePixie", col, row, { token: true });
                }
                return n;
            };

            // Эффекты заклинаний игрока, валидация цели внутри (false — цель не
            // годится, тогда и оплаты/сброса/панелей не будет). Отделено от
            // оплаты карты, чтобы «Горящие руны» могли повторить эффект
            // бесплатно. free — повтор (дренаж энергии идёт без вычета цены).
            // Флаг spellCasting на всё разрешение: damageUnit в это время не
            // наносит урон существам с «Защитой от заклинаний» (u.spellWard).
            A.applySpellP = function applySpellP(cardId, target, free = false, opts = null) {
                A.spellCasting = true;
                try {
                    return applySpellPInner(cardId, target, free, opts);
                } finally { A.spellCasting = false; }
            };
            A.applySpellPInner = function applySpellPInner(cardId, target, free = false, opts = null) {
                const def = CARDS[cardId];
                if (def.spell.target === "anyUnit") { // усиление/Смыв/Слабость
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    // «Защита от заклинаний» (u.spellWard): целью заклинаний
                    // не выбирается — даже своими (просил юзер)
                    if (!u || u.def.type !== "unit" || u.spellWard) return false;
                    const p = cellXY(u.col, u.row);
                    if (def.spell.iceStrike) { // «Ледяной удар»: цель бьёт соседа
                        const victim = iceStrikeVictim(u);
                        if (!victim) return false; // соседей-существ нет — не кастуем
                        iceStrikeAttack(u, victim);
                        if (B.units.includes(victim)) addFrozen(victim, def.spell.freeze || 1, "p");
                        punch(u.node);
                        sfx("aqua");
                        return true;
                    }
                    if (def.spell.hydroPunch) { // «Гидроудар»: 1 урон + сдвиг к своей базе
                        const dmg = spellDmg(def, "p", true, true);
                        damageUnit(u, dmg, null, "rocket");
                        if (B.units.includes(u)) pushTowardBase(u);
                        punch(u.node);
                        sfx("aqua");
                        return true;
                    }
                    if (def.spell.bounce) { // «Смыв»: существо — в руку владельца
                        punch(u.node);
                        bounceUnit(u);
                        sfx("aqua");
                        return true;
                    }
                    if (def.spell.debuffAtk) { // «Слабость»: −N к урону (не ниже нуля)
                        u.bonusAtk = (u.bonusAtk || 0) - def.spell.debuffAtk;
                        recalcAuras();
                        floatText(p.x, p.y - 39, `−${def.spell.debuffAtk}⚔`, 0xef9f8c);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.72 });
                        punch(u.node);
                        sfx("acid");
                        return true;
                    }
                    if (def.spell.enchantFire) { // «Огненное дыхание» — метка-очарование
                        u.enchantFire = true;
                        const mark = new PIXI.Graphics();
                        mark.circle(0, 0, 10.5);
                        mark.fill({ color: 0xff7a2e });
                        mark.stroke({ width: 3, color: 0xffd98c });
                        mark.position.set(36, -54);
                        mark.name = "enchMark";
                        mark.eventMode = "none";
                        u.node.addChild(mark);
                        floatText(p.x, p.y - 60, "✦", 0xffb26e);
                    } else {
                        if (def.spell.buffAtk) {
                            u.bonusAtk = (u.bonusAtk || 0) + def.spell.buffAtk;
                            recalcAuras();
                            floatText(p.x, p.y - 39, `+${def.spell.buffAtk}⚔`, 0x9fd489);
                        }
                        if (def.spell.buffHp) { // «Дар леса»: +N жизни любому существу
                            u.hp += def.spell.buffHp;
                            const hn = u.node.getChildByName("hp");
                            if (hn) hn.text = String(u.hp);
                            floatText(p.x, p.y - 75, `+${def.spell.buffHp}♥`, 0x9fd489);
                        }
                        if (def.spell.buffAtkByHp) { // «Природная мощь»: +урона = жизням
                            u.bonusAtk = (u.bonusAtk || 0) + u.hp;
                            recalcAuras();
                            floatText(p.x, p.y - 39, `+${u.hp}⚔`, 0x9fd489);
                        }
                        if (def.spell.berserk) addBerserk(u, def.spell.berserk);
                        if (def.spell.venom) addVenom(u, def.spell.venom); // «Отравленные лезвия»
                        if (def.spell.nova) novaSplash(u); // «Круговая атака»
                        if (def.spell.buffAtk || def.spell.buffHp
                            || def.spell.buffAtkByHp || def.spell.enchantFire) {
                            fxEvent("buff", { x: p.x, y: p.y - 12,
                                color: def.spell.enchantFire ? 0xff8a5e : 0xffd98c,
                                scale: 0.82 });
                        }
                    }
                    punch(u.node);
                    sfx("up");
                }
                if (def.spell.target === "anyUnitDmg") { // дротик: существо или строение; варево — только существо
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    // «Защита от заклинаний» (u.spellWard): целью заклинаний
                    // не выбирается (урон, пурж, кокон — всё мимо)
                    if (!u || u.spellWard || (u.def.type !== "unit"
                        && (u.def.type !== "building" || def.spell.noBuildings))) return false;
                    if (def.spell.purge) { // «Извлечение духа»: снять все свойства, база лечится за каждое
                        const n = purgeUnit(u);
                        B.playerBase = Math.min(B.playerBaseMax, B.playerBase + n);
                        floatText(960, 840, `+${n}`, 0x9fd489);
                        fxEvent("heal", { x: 960, y: 830, scale: 1.15 });
                        punch(root.hud);
                        sfx("up");
                    } else if (def.spell.cocoon) { // «Защитный кокон»: «Защита 1» цели
                        addProtect(u);
                    } else if (def.spell.drainAll) { // «Огнешар»: вся энергия сверх цены — в урон
                        damageUnit(u, Math.max(0, B.energy - (free ? 0 : effCost(cardId, "p", target)))
                            + altarBonus("p")
                            + heroSpellBonus(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else if (def.spell.fireflies) { // «Рой светлячков»: урон = своим существам
                        damageUnit(u, spellHitDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else if (def.spell.growthHand) { // «Выстрел стихией Роста»: урон = картам Роста в руке
                        damageUnit(u, spellHitDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else {
                        damageUnit(u, spellDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    }
                    // «Ядро кометы»: выжившее существо получает «Заморожен N»
                    if (def.spell.freeze && B.units.includes(u)) addFrozen(u, def.spell.freeze, "p");
                }
                if (def.spell.target === "emptyCell") { // культ кочерыжки: ряд в гоблинах
                    if (!target || target.col === undefined) return false;
                    if (unitAt(target.col, target.row)) return false;
                    cultRowSpawn("p", target.row);
                }
                if (def.spell.target === "anyCell") { // стена костров: ряд горит N ходов владельца
                    if (!target || target.col === undefined) return false;
                    B.firewalls.push({ col: target.col, row: target.row, side: "p",
                        left: def.spell.turns, dmg: def.spell.firewall });
                    redrawFirewalls();
                    sfx("rocket");
                }
                if (def.spell.target === "ownUnit" && def.spell.baseHit) { // «Бросок валуна»: своё существо бьёт базу врага — это его атака
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit" || u.spellWard) return false;
                    baseHit("p", u);
                    triggerAttackTraps(u);
                }
                if (def.spell.target === "ownUnit" && def.spell.wolfVolley) { // «Атака духами волков»: Выстрел + волки на пути
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit" || u.spellWard) return false;
                    wolfVolley(u);
                }
                if (def.spell.target === "ownUnit" && def.spell.sacrifice) { // жертва: убить своё, ударить соседей
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit" || u.spellWard) return false;
                    const p = cellXY(u.col, u.row);
                    killUnit(u, null);
                    floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                    for (const v of B.units.slice()) {
                        if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                            damageUnit(v, def.spell.dmg, null, "rocket");
                        }
                    }
                }
                if (def.spell.target === "ownBuilding" && def.spell.excavate) { // «Раскопки»
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "building") return false;
                    const cell = { col: u.col, row: u.row };
                    const id = cardIdOf(u.def);
                    removeUnit(u); // в сброс без каскадов смерти — постройка не «убита»
                    recalcAuras();
                    B.discard.push(id);
                    const p = cellXY(cell.col, cell.row);
                    floatText(p.x, p.y - 60, "⤓", 0xef9f8c);
                    sfx("chpoc");
                    openExcavatePanel(cell); // выбор постройки сброса в освободившуюся клетку
                }
                if (def.spell.target === "none" && def.spell.baseDmg) { // землетрясение
                    damageBase("e", def.spell.baseDmg + heroSpellBonus(def, "p", false, true),
                        { x: 960, y: 60, fill: 0xff8f6e });
                    sfx("rocket");
                }
                if (def.spell.target === "none" && def.spell.stealEnergy) { // «Похищение энергии»: 2⚡
                    const got = Math.min(def.spell.stealEnergy, B.eEnergy);
                    B.eEnergy -= got;
                    B.energy += got;
                    floatText(960, 60, `−${got}⚡`, 0xff8f6e);
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (def.spell.target === "none" && def.spell.energyPerHand) { // «Цветение кристаллов»: +1⚡ за карту в руке
                    // сама карта в момент эффекта ещё числится в руке — не считаем
                    const got = Math.max(0, B.hand.length - 1);
                    B.energy += got;
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("aqua");
                }
                if (def.spell.target === "none" && def.spell.energyPerTrap) { // «Поток маны»: +1⚡ за свою ловушку
                    const got = B.traps.p.length;
                    B.energy += got;
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    if (got) punch(root.hud);
                    sfx("aqua");
                }
                if (def.spell.debuffEnemyAtkAll) { // «Нехватка воздуха»: −N урона всем существам врага
                    const n = def.spell.debuffEnemyAtkAll;
                    for (const v of B.units) if (v.side !== "p" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) - n;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `−${n}⚔`, 0x8cd0ef);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.62 });
                    }
                    recalcAuras();
                    sfx("acid");
                }
                if (def.spell.iceSwarm) { // «Рой ледо-пикси»: Элементали 1/1 на случайные пустые клетки
                    const n = iceSwarmSpawn("p", def.spell.iceSwarm);
                    if (n) sfx("use");
                }
                if (def.spell.aoeDmg) { // «Раскалённые обломки»: всем вражеским существам и постройкам
                    const dmg = def.spell.aoeDmg + altarBonus("p");
                    // первое уронное заклинание — +1 ко ВСЕМ ударам этого каста;
                    // «Поджигатели» — +1 только существам (постройки не считаются)
                    const fs = heroSpellBonus(def, "p", false, true);
                    for (const v of B.units.slice()) if (v.side !== "p")
                        damageUnit(v, dmg + fs
                            + (v.def.type === "unit" ? heroSpellBonus(def, "p", true) : 0),
                            null, "rocket");
                    sfx("rocket");
                }
                if (def.spell.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                    for (const v of B.units) if (v.side === "p" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) + def.spell.buffAllAtk;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${def.spell.buffAllAtk}⚔`, 0x9fd489);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.6 });
                    }
                    recalcAuras();
                    sfx("up");
                }
                if (def.spell.target === "enemyAny") {
                    if (!target) return false;
                    if (target.base === true) {
                        damageBase("e", def.spell.dmg + heroSpellBonus(def, "p", false, true),
                            { x: 960, y: 60, fill: 0xff8f6e });
                        sfx("rocket");
                    } else if (target.col !== undefined) {
                        const u = unitAt(target.col, target.row);
                        // «Защита от заклинаний»: целью заклинаний не выбирается
                        if (!u || u.side === "p" || u.spellWard) return false;
                        damageUnit(u, def.spell.dmg + heroSpellBonus(def, "p",
                            u.def.type === "unit", true), null, "rocket");
                    } else return false;
                }
                if (def.spell.draw) drawCards(def.spell.draw);
                // «Запутать руны»: обе руки — в сброс, по 3 карты. При прямом
                // розыгрыше карта ещё в руке — её сбросит/оплатит castSpell
                // (skipHandReset), поэтому эффект зовётся оттуда после spendCard.
                if (def.spell.discardHandDraw && !(opts && opts.skipHandReset))
                    discardHandDraw("p", def.spell.discardHandDraw);
                if (def.spell.brew) { B.brewCasts = (B.brewCasts || 0) + 1; refreshBrewBadges(); }
                if (def.spell.search) openRunesPanel(def.spell.search); // выбор поверх боя
                if (def.spell.searchUnit) openRunesPanel(def.spell.searchUnit, "unit"); // «Рунное гадание»
                if (def.spell.seek) openSeekPanel(def.spell.seek, def.spell.seekPicks || 1); // «Поиск знаний»
                if (def.spell.journey) openJourneyPanel(def.spell.journey);
                if (def.spell.discardPick) openBrewPanel(); // «Варка зелий»: выбор из сбросов
                return true;
            };

            // Автоцель для повтора заклинания («Горящие руны») — приоритеты ИИ:
            // добивание, сильнейший, ряд с наибольшим числом врагов.
            A.autoTargetFor = function autoTargetFor(cardId) {
                const def = CARDS[cardId];
                const tg = def.spell.target;
                if (tg === "anyUnit" && def.spell.hydroPunch) { // «Гидроудар»
                    const foes = B.units.filter((u) => u.side !== "p"
                        && u.def.type === "unit" && !u.spellWard);
                    const best = foes.slice().sort((a, b) =>
                        (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnit" && def.spell.iceStrike) { // «Ледяной удар»
                    const pick = iceStrikePick("p");
                    return pick ? { col: pick.unit.col, row: pick.unit.row } : null;
                }
                if (tg === "anyUnit" || tg === "ownUnit") {
                    const own = B.units.filter((u) => u.side === "p" && u.def.type === "unit"
                        && !u.spellWard); // «Защита от заклинаний» не выбирается
                    const best = own.slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnitDmg") {
                    if (def.spell.cocoon) { // кокон — своему крепышу
                        const own = B.units.filter((u) => u.side === "p" && !u.spellWard);
                        const best = own.slice().sort((a, b) => (b.hp - a.hp) || (b.curAtk - a.curAtk))[0];
                        return best ? { col: best.col, row: best.row } : null;
                    }
                    if (def.spell.purge) { // дух — чужой самый «заряженный» объект
                        let best = null, bestN = 0;
                        for (const u of B.units) {
                            if (u.side === "p" || u.spellWard) continue;
                            const n = countProps(u);
                            if (n > bestN) { bestN = n; best = u; }
                        }
                        return best ? { col: best.col, row: best.row } : null;
                    }
                    const dmg = def.spell.drainAll
                        ? Math.max(0, B.energy) + altarBonus("p") // повтор — цена не вычитается
                        : spellHitDmg(def);
                    const targets = B.units.filter((u) => u.side !== "p" && !u.spellWard
                        && (u.def.type === "unit"
                            || (u.def.type === "building" && !def.spell.noBuildings)));
                    if (!targets.length) return null;
                    const kills = targets.filter((v) => v.hp <= dmg);
                    const best = (kills.length ? kills : targets)
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return { col: best.col, row: best.row };
                }
                if (tg === "ownBuilding") { // раскопки — первая своя постройка
                    const own = B.units.filter((u) => u.side === "p" && u.def.type === "building");
                    return own.length ? { col: own[0].col, row: own[0].row } : null;
                }
                if (tg === "enemyAny") {
                    const targets = B.units.filter((u) => u.side !== "p");
                    if (!targets.length) return { base: true };
                    const best = targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return { col: best.col, row: best.row };
                }
                if (tg === "anyCell") { // стена костров — ряд, где больше врагов
                    const counts = [0, 0, 0, 0, 0];
                    for (const v of B.units) if (v.side !== "p") counts[v.row]++;
                    return { col: 2, row: counts.indexOf(Math.max(...counts)) };
                }
                if (tg === "emptyCell") { // культ — ряд, где больше пустых (ничья — где больше врагов)
                    const empt = [0, 0, 0, 0, 0], foes = [0, 0, 0, 0, 0];
                    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
                        if (!unitAt(c, r)) empt[r]++;
                    for (const v of B.units) if (v.side !== "p") foes[v.row]++;
                    let best = 0;
                    for (let r = 1; r < GRID; r++)
                        if (empt[r] > empt[best] || (empt[r] === empt[best] && foes[r] > foes[best])) best = r;
                    return { col: 2, row: best };
                }
                return null; // без цели или целей нет — эффект повторится «вхолостую»
            };

            // «Горящие руны» (str25): эффект последнего разыгранного заклинания
            // повторно, бесплатно; затем то заклинание СЖИГАЕТСЯ — одна копия
            // уходит из своей текущей зоны (рука → колода → сброс) до конца боя
            // (в колоду при перетасовке она больше не вернётся).
            A.replaySpell = function replaySpell(cardId) {
                const def = CARDS[cardId];
                if (!def || def.type !== "spell") return;
                const target = autoTargetFor(cardId);
                applySpellP(cardId, target, true);
                fxSpellCast(cardId, target, "p");
                if (def.spell.drainAll) B.energy = 0; // огнешар и в повторе сжигает энергию
                const hi = B.hand.indexOf(cardId);
                if (hi >= 0) B.hand.splice(hi, 1);
                else {
                    const di = B.deck.indexOf(cardId);
                    if (di >= 0) B.deck.splice(di, 1);
                    else {
                        const si = B.discard.indexOf(cardId);
                        if (si >= 0) B.discard.splice(si, 1);
                    }
                }
                floatText(960, 640, `🔥 ${GAME_LOC.t(`card.${cardId}.name`)}`, 0xffb26e);
            };

            A.castSpell = function castSpell(handIdx, target) {
                if (B.phase !== "player" || B.discarding || B.picking) return false;
                const cardId = B.hand[handIdx];
                const def = CARDS[cardId];
                if (!def || def.type !== "spell"
                    || effCost(cardId, "p", target) > B.energy) return false;
                const resetHand = def.spell.discardHandDraw;
                // «Отмена заклинания» (wis83) врага: заклинание отменяется —
                // карта и энергия потрачены, эффект не срабатывает (спека юзера)
                const cTrap = counterTrapConsume("e", "counterSpell");
                if (cTrap) {
                    B.energy -= effCost(cardId, "p", target);
                    spendCard(handIdx);
                    const p = cellXY(cTrap.col, cTrap.row);
                    floatText(p.x, p.y + 66, "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    checkEnd();
                    return true;
                }
                if (def.spell.copyLast) { // «Горящие руны»: повтор последнего бесплатно
                    const last = B.lastSpell.p;
                    if (!last || last === "str25" || !CARDS[last]
                        || CARDS[last].type !== "spell") return false;
                    B.energy -= effCost(cardId, "p", target);
                    spendCard(handIdx);
                    heroFirstSpellEnergy("p"); // «Дуновение опасности»
                    heroStrReplay("p", cardId, def); // «Мастера огня»
                    B.lastSpell.p = "str25"; // повтор самой себя — бесконечная цепочка
                    replaySpell(last);
                    afterSpellPlayed();
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    checkEnd();
                    return true;
                }
                if (!applySpellP(cardId, target, false,
                    resetHand ? { skipHandReset: true } : null)) return false;
                fxSpellCast(cardId, target, "p");
                B.energy = def.spell.drainAll ? 0 : B.energy - effCost(cardId, "p", target);
                spendCard(handIdx);
                if (resetHand) discardHandDraw("p", resetHand);
                heroFirstSpellEnergy("p"); // «Дуновение опасности»: +1⚡ за 1-е заклинание
                heroStrReplay("p", cardId, def); // «Мастера огня»
                B.lastSpell.p = cardId;
                afterSpellPlayed(); // «Заклинатель клинков» и его соседи
                layoutHand();
                redrawHighlight();
                refreshHud();
                checkEnd();
                return true;
            };
        }
    };
})();
