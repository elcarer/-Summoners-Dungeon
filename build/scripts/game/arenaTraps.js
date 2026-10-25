// СЦЕНА «АРЕНА»: ЛОВУШКИ — установка (armTrap), срабатывание по клетке/
// атаке/гибели (triggerCellTraps, triggerAttackTraps, triggerTraps),
// эффекты (applyCellTrap + снежок/толчок/всплеск) и значки «?».
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installTraps = function installTraps(A) {
        with (A) {

            // «Выросшие духи» (wis96): после перемещения разыгрывает ловушку
            // из руки владельца на пустую соседнюю (верт/гориз) клетку БЕЗ
            // траты энергии. Берётся первая подходящая ловушка руки: руна и
            // «Призрачные споры» вешаются на существо — им нужна не пустая
            // клетка, поэтому они пропускаются. Клетка — без существа и без
            // своей ловушки (веер «?» не плодим); приоритет — клетка впереди
            // по маршу, затем бока, затем тыл.
            A.trapOnMoveAct = function trapOnMoveAct(u) {
                if (!u || !B.units.includes(u) || !u.def.trapOnMove) return;
                const hand = u.side === "p" ? B.hand : B.eHand;
                const discard = u.side === "p" ? B.discard : B.eDiscard;
                const traps = u.side === "p" ? B.traps.p : B.traps.e;
                const fwd = u.side === "p" ? -1 : 1;
                const cells = [[0, fwd], [-1, 0], [1, 0], [0, -fwd]]
                    .map(([dc, dr]) => [u.col + dc, u.row + dr])
                    .filter(([c2, r2]) => c2 >= 0 && c2 < GRID && r2 >= 0 && r2 < GRID
                        && !unitAt(c2, r2)
                        && !traps.some((tr) => !tr.unit && tr.col === c2 && tr.row === r2));
                if (!cells.length) return;
                const i = hand.findIndex((id) => CARDS[id] && CARDS[id].type === "trap"
                    && CARDS[id].trap.effect !== "castRandom"
                    && CARDS[id].trap.effect !== "sporeCurse");
                if (i < 0) return;
                const cardId = hand.splice(i, 1)[0];
                const [col, row] = cells[0];
                discard.push(cardId);
                noteDiscard(1, u.side, [cardId]);
                armTrap(u.side, cardId, col, row);
                const p = cellXY(col, row);
                floatText(p.x, p.y - 60, GAME_LOC.t(`card.${cardId}.name`), 0xb7d0ef);
                heroElementalDraw(u); // «Сонм духов»: способность элементаля
            };

            // «Заморожен N» (wis91/wis92): существо пропускает перемещение
            // И атаку в свой следующий ход, затем счётчик тает на 1; на нуле
            // эффект снимается. Счётчик складывается, метка — над головой.
            // side — сторона, НАКЛАДЫВАЮЩАЯ эффект (нужна способности героя
            // «Ледяная суета», firstFrozenExtra): при первом накладывании
            // в бою она добавляет abilityVal (2) к счётчику. Без side
            // (тест-хуки, старые вызовы) способность не срабатывает.

            // «Зимние духи» (wis89): когда срабатывает ЛЮБАЯ ловушка (клеточная,
            // отмена, руна, приманка, ряд), каждое живое существо с меткой
            // trapGrow получает +1 к урону навсегда. side — ХОЗЯИН ловушки:
            // по нему же «Путь воды» (firstTrapEnergy) даёт +1⚡ за первое
            // срабатывание. Зовётся в точках, где ловушка снимается/тратится,
            // — один раз на срабатывание, без повторов «Рощи лоз».
            A.trapTriggered = function trapTriggered(side) {
                if (!B || !B.units) return;
                if (side) A.heroFirstTrapEnergy(side);
                for (const u of B.units.slice()) {
                    if (!u.def || !u.def.trapGrow || !B.units.includes(u)) continue;
                    u.bonusAtk = (u.bonusAtk || 0) + 1;
                    recalcAuras();
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 39, "+1⚔", 0x9fd489);
                    punch(u.node);
                    sfx("up");
                    heroElementalDraw(u); // «Сонм духов»: способность элементаля
                }
            };

            // «Проросший кабан» (grw13): после атаки по существу отталкивает
            // его на клетку дальше от себя, если та свободна (постройки не
            // оттолкнуть, умирающая цель не толкается). Втолкнули на чужую
            // ловушку — она срабатывает, как от шага.
            // Ловушки на клетке: «Гоблинская мина» (взрыв 3+1 по соседям),
            // «Гоблинская засада» (выход гоблинов стороны-хозяйки), «Дух
            // предка» (явление Медведя перед ловушкой). Срабатывают, когда
            // вражеское существо призвано или переместилось на её клетку.
            // «Роща лоз» (trapEcho, просил юзер): первая сработавшая в бою
            // ловушка стороны применяет свой эффект дополнительный раз.
            // Возвращает true один раз за бой; флаг тратится на первом
            // срабатывании, даже если повторять эффект не по кому.
            A.trapEchoOnce = function trapEchoOnce(side) {
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "trapEcho"
                    || B.heroFlags.trapEcho[side]) return false;
                B.heroFlags.trapEcho[side] = true;
                return true;
            };

            // «Отмена заклинания» (wis83) / «Отмена призыва» (wis84): ловушки
            // без клетки — срабатывают, когда ПРОТИВНИК разыгрывает заклинание
            // или карту призыва, и отменяют это: эффект не происходит, существо
            // не появляется, но карта и энергия противника потрачены (спека
            // юзера). Ловушка одноразовая. Возвращает сработавшую ловушку или
            // null. Вызывается в точках розыгрыша ДО эффекта (castSpell,
            // aiPlay, castRandomSpell, постановка существ).

            // «Отмена заклинания» (wis83) / «Отмена призыва» (wis84): ловушки
            // без клетки — срабатывают, когда ПРОТИВНИК разыгрывает заклинание
            // или карту призыва, и отменяют это: эффект не происходит, существо
            // не появляется, но карта и энергия противника потрачены (спека
            // юзера). Ловушка одноразовая. Возвращает сработавшую ловушку или
            // null. Вызывается в точках розыгрыша ДО эффекта (castSpell,
            // aiPlay, castRandomSpell, постановка существ).
            A.counterTrapConsume = function counterTrapConsume(side, effect) {
                const i = B.traps[side].findIndex((t) =>
                    t.def.trap && t.def.trap.effect === effect);
                if (i < 0) return null;
                const trap = B.traps[side].splice(i, 1)[0];
                redrawTraps();
                trapTriggered(side); // «Зимние духи»/«Путь воды»: сработала отмена
                const p = cellXY(trap.col, trap.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                fxEvent("trap", { x: p.x, y: p.y - 8 });
                sfx("mine");
                trapEchoOnce(side); // «Роща лоз»: флаг первого срабатывания
                // тратится — повторять отмену нечего (зеркально клеточным)
                return trap;
            };


            A.triggerCellTraps = function triggerCellTraps(u) {
                if (!B.units.includes(u)) return; // умер раньше (рывок+мина на шаге)
                // «Водный элементаль» (wis82): не активирует ловушки — ни
                // призываясь на клетку, ни шагая на неё
                if (u.def.ability === "noTraps") return;
                const foe = u.side === "p" ? "e" : "p";
                let side = foe;
                // клеточные ловушки-существа (freezeSplash/rowShift) срабатывают
                // только на СУЩЕСТВ, как и написано в спеке; мины/засады и
                // нейтральные ловушки по-прежнему ловят и строения
                const cellEffect = (t) => {
                    const e = t.def.trap.effect;
                    if (e === "freezeSplash" || e === "rowShift"
                        || e === "bubble" || e === "alliesStrike")
                        return u.def.type === "unit";
                    return e === "cellDmg" || e === "ambush"
                        || e === "confuse" || e === "cellDebuff"
                        || e === "ancestor" || e === "entangle";
                };
                let i = B.traps[side].findIndex((t) => t.col === u.col && t.row === u.row
                    && cellEffect(t));
                if (i < 0) {
                    // «Решётка с шипами», «Шипастые лозы» и «Опутывание корней»
                    // нейтральны: срабатывают на ЛЮБОЕ существо, оказавшееся на
                    // клетке, — включая хозяина ловушки
                    side = u.side;
                    i = B.traps[side].findIndex((t) => t.col === u.col && t.row === u.row
                        && (t.def.trap.effect === "cellDmgAll" || t.def.trap.effect === "cellDebuff"
                            || t.def.trap.effect === "entangle"));
                }
                if (i < 0) return;
                const trap = B.traps[side].splice(i, 1)[0];
                redrawTraps();
                trapTriggered(side); // «Зимние духи»/«Путь воды»: сработала клеточная ловушка
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                fxEvent("trap", { x: p.x, y: p.y - 8, scale: 0.9 });
                const echo = trapEchoOnce(side); // первая ловушка боя — флаг потрачен
                // «Дух реки» (wis112): активированная им ловушка снимается,
                // но её эффект отменяется (спека юзера). Считается сработавшей
                // («Зимние духи», «Путь воды»); «Роща лоз» тратит флаг на
                // первом срабатывании, повторять нечего — как у отмен.
                if (u.def.trapCancel) {
                    floatText(p.x, p.y - 96,
                        "✕ " + GAME_LOC.t(`card.${cardIdOf(trap.def)}.name`), 0x8cd0ef);
                    heroElementalDraw(u); // способность элементаля
                    return;
                }
                applyCellTrap(trap, side, u);
                if (echo && B.units.includes(u)) applyCellTrap(trap, side, u);
            };

            // «Ледяные кандалы» (wis97): активировавшее существо и все
            // существа по соседству (верт/гориз) получают «Заморожен 1»;
            // постройки addFrozen пропускает сам. side — хозяин ловушки:
            // его способность героя «Ледяная суета» может усилить ПЕРВОЕ
            // накладывание (жертва идёт первой в списке).

            // «Ледяные кандалы» (wis97): активировавшее существо и все
            // существа по соседству (верт/гориз) получают «Заморожен 1»;
            // постройки addFrozen пропускает сам. side — хозяин ловушки:
            // его способность героя «Ледяная суета» может усилить ПЕРВОЕ
            // накладывание (жертва идёт первой в списке).
            A.freezeSplash = function freezeSplash(u, side = null) {
                if (!u || !B.units.includes(u)) return;
                const victims = [u, ...B.units.filter((v) => v !== u
                    && v.def.type === "unit"
                    && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1)];
                for (const v of victims) if (B.units.includes(v)) addFrozen(v, 1, side);
            };

            // «Снежный ком» (wis98): каждое существо в ВЕРТИКАЛЬНОМ ряду
            // (одинаковый col) сдвигается на случайную соседнюю (верт/гориз)
            // пустую клетку и получает 2 урона. Порядок хода случайный,
            // клетки заняты «по факту» — двое в одну клетку не встанут.
            // Постройки не существа: не двигаются и урона не получают.

            // «Снежный ком» (wis98): каждое существо в ВЕРТИКАЛЬНОМ ряду
            // (одинаковый col) сдвигается на случайную соседнюю (верт/гориз)
            // пустую клетку и получает 2 урона. Порядок хода случайный,
            // клетки заняты «по факту» — двое в одну клетку не встанут.
            // Постройки не существа: не двигаются и урона не получают.
            A.snowballShift = function snowballShift(trap, side) {
                const col = trap.col;
                const list = B.units.filter((v) => v.col === col && v.def.type === "unit");
                const order = shuffle(list.slice());
                const moved = [];
                for (const v of order) {
                    if (!B.units.includes(v)) continue;
                    const dirs = shuffle([[-1, 0], [1, 0], [0, -1], [0, 1]]);
                    let dest = null;
                    for (const [dc, dr] of dirs) {
                        const c2 = v.col + dc, r2 = v.row + dr;
                        if (c2 < 0 || c2 >= GRID || r2 < 0 || r2 >= GRID) continue;
                        if (unitAt(c2, r2)) continue;
                        dest = [c2, r2];
                        break;
                    }
                    if (!dest) continue; // кругом занято — с места не сдвинуть
                    v.col = dest[0];
                    v.row = dest[1];
                    const p = cellXY(v.col, v.row);
                    glide(v, p.x, p.y);
                    moved.push(v);
                }
                // сдвиг — перемещение: чужие ловушки на новых клетках срабатывают
                for (const v of moved) if (B.units.includes(v)) triggerCellTraps(v);
                const dmg = (trap.def.trap.amount || 2) + altarBonus(side);
                for (const v of list) {
                    if (!B.units.includes(v)) continue;
                    const p = cellXY(v.col, v.row);
                    fxEvent("ice", { x: p.x, y: p.y - 8, scale: 0.72 });
                    damageUnit(v, dmg, null, "acid");
                }
                refreshHud();
                checkEnd();
            };

            // «Гидроудар» (wis99): сдвиг на 1 клетку БЛИЖЕ К СВОЕЙ базе
            // (игрок — row+1, враг — row−1), только если там пусто.

            // «Гидроудар» (wis99): сдвиг на 1 клетку БЛИЖЕ К СВОЕЙ базе
            // (игрок — row+1, враг — row−1), только если там пусто.
            A.pushTowardBase = function pushTowardBase(u) {
                if (!u || !B.units.includes(u) || u.def.type !== "unit") return false;
                const dr = u.side === "p" ? 1 : -1;
                const r2 = u.row + dr;
                if (r2 < 0 || r2 >= GRID || unitAt(u.col, r2)) return false;
                u.row = r2;
                const p = cellXY(u.col, u.row);
                glide(u, p.x, p.y);
                fxEvent("ice", { x: p.x, y: p.y - 10, scale: 0.7 });
                sfx("step");
                triggerCellTraps(u); // втолкнули на ловушку — она срабатывает
                return true;
            };

            // Эффект сработавшей ловушки на клетке (отделён от поиска ловушки —
            // «Роща лоз» применяет его дважды); u — существо, наступившее на неё

            // Эффект сработавшей ловушки на клетке (отделён от поиска ловушки —
            // «Роща лоз» применяет его дважды); u — существо, наступившее на неё
            A.applyCellTrap = function applyCellTrap(trap, side, u) {
                if (trap.def.trap.effect === "alliesStrike") {
                    // «Тёмные цепи» (dec127): вошедшее на клетку существо
                    // атакуют ВСЕ соседние СВОИ (хозяйки ловушки) существа —
                    // полной атакой (урон с бонусами + «Сокрушение»/
                    // «Ядовитость»/лёд/толчок, как у доп. атак «Берсерка»).
                    // Соседи бьют в случайном порядке; цель могла умереть
                    // от предыдущего — её не трогают.
                    const allies = shuffle(B.units.filter((v) => v.side === side
                        && v !== u && v.def.type === "unit"
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1));
                    for (const a of allies) {
                        if (!B.units.includes(u)) break; // цель уже погибла
                        if (!B.units.includes(a)) continue;
                        const ap = cellXY(a.col, a.row);
                        floatText(ap.x, ap.y - 60, "⚔", 0xffb26e);
                        punch(a.node);
                        sfx("sword");
                        const hpBefore = u.hp;
                        damageUnit(u, a.curAtk, a, "sword");
                        crushHit(a, a.curAtk, hpBefore); // «Сокрушение»
                        venomApply(a, u); // «Ядовитость»
                        frostAttack(a, u); // «Снежный элементаль»: −1⚔ цели
                        frostNeighbors(a); // «Старший ледовик»: лёд соседям
                        afterAttackPush(a, u); // «Проросший кабан»
                        triggerAttackTraps(a); // руна: существо атаковало
                    }
                    refreshHud();
                    checkEnd();
                    return;
                }
                if (trap.def.trap.effect === "bubble") {
                    // «Ловушка-пузырь» (wis119): урон существа становится 0
                    // (atkZero — кламп в recalcAuras; «Извлечение духа» снимает)
                    // и противник не может играть карту призыва этого существа,
                    // пока оно на поле боя (спека юзера)
                    u.atkZero = true;
                    u.bubbleBlock = true;
                    recalcAuras();
                    const p2 = cellXY(u.col, u.row);
                    floatText(p2.x, p2.y - 39, "⚔=0", 0x8cd0ef);
                    fxEvent("ice", { x: p2.x, y: p2.y - 8, scale: 0.72 });
                    sfx("aqua");
                    refreshHud();
                    checkEnd();
                    return;
                }
                if (trap.def.trap.effect === "freezeSplash") {
                    // «Ледяные кандалы»: существо и соседи (верт/гориз)
                    freezeSplash(u, side);
                    refreshHud();
                    checkEnd();
                    return;
                }
                if (trap.def.trap.effect === "rowShift") {
                    // «Снежный ком»: весь вертикальный ряд сдвигается и получает 2
                    snowballShift(trap, side);
                    return;
                }
                if (trap.def.trap.effect === "cellDebuff") {
                    // «Шипастые лозы» (grw4): существо на клетке теряет 1 урона
                    // и 1 жизни; не пережило шипы — гибнет (не «урон», но смерть)
                    u.bonusAtk = (u.bonusAtk || 0) - (trap.def.trap.atk || 1);
                    recalcAuras();
                    u.hp -= (trap.def.trap.hp || 1);
                    const hn = u.node.getChildByName("hp");
                    if (hn) hn.text = String(Math.max(0, u.hp));
                    sfx("acid");
                    if (u.hp <= 0) killUnit(u, null);
                    refreshHud();
                    checkEnd();
                    return;
                }
                if (trap.def.trap.effect === "ambush") {
                    // «Гоблинская засада»: в каждой пустой соседней (верт/гориз)
                    // клетке появляется Гоблин 2/2 стороны-хозяйки ловушки
                    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const c2 = trap.col + dc, r2 = trap.row + dr;
                        if (c2 < 0 || c2 >= GRID || r2 < 0 || r2 >= GRID) continue;
                        if (unitAt(c2, r2)) continue;
                        addUnit(side, trap.def.trap.spawn, c2, r2, { token: true });
                    }
                    refreshHud();
                    checkEnd();
                    return;
                }
                if (trap.def.trap.effect === "confuse") {
                    // «Путь грибов»: существо получает «Запутанность 2» — два
                    // своих хода вместо марша пятится к своей базе (просил юзер)
                    addConfusion(u, trap.def.trap.turns || 2);
                    refreshHud();
                    checkEnd();
                    return;
                }
                if (trap.def.trap.effect === "entangle") {
                    // «Опутывание корней» (grw35): существо получает «Опутывание
                    // 2» — два своих хода пропускает перемещение (атака по
                    // стоящему впереди врагу остаётся)
                    addEntangle(u, trap.def.trap.entangle || 2);
                    refreshHud();
                    checkEnd();
                    return;
                }
                if (trap.def.trap.effect === "ancestor") {
                    // «Дух предка» (grw12): в пустой клетке перед ловушкой
                    // (ближе к базе хозяина) является Медведь 3/5. Сначала
                    // колонка ловушки, не хватило — соседние; всё занято —
                    // предок не явился
                    const dr = side === "p" ? 1 : -1;
                    let spot = null;
                    for (const c2 of [trap.col, trap.col - 1, trap.col + 1]) {
                        if (c2 < 0 || c2 >= GRID) continue;
                        for (let r2 = trap.row + dr; r2 >= 0 && r2 < GRID; r2 += dr) {
                            if (!unitAt(c2, r2)) { spot = [c2, r2]; break; }
                        }
                        if (spot) break;
                    }
                    if (spot) addUnit(side, trap.def.trap.spawn, spot[0], spot[1], { token: true });
                    refreshHud();
                    checkEnd();
                    return;
                }
                damageUnit(u, trap.def.trap.amount + altarBonus(side), null, "acid");
                if (trap.def.trap.splash) for (const v of B.units.slice()) { // у ловушек без splash соседей не задевает
                    if (v !== u && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                        damageUnit(v, trap.def.trap.splash + altarBonus(side), null, "acid");
                    }
                }
                refreshHud();
                checkEnd();
            };

            // «Выстрел 1» (Гоблинский лучник): после перемещения — 1 урон
            // ближайшему существу или строению впереди по вертикали (любой
            // стороны); если вертикаль перед ним пуста — 1 урон базе противника.

            // ── Ловушки ─────────────────────────────────────────────────────────
            // Мины хранят клетку (col/row); руна («Наскальная рунопись») —
            // само существо (unit) и ездит с ним. Лимита ловушек нет (просил юзер).
            // «Битва умов» (wis114) противника: разыгранная ловушка отменяется
            // (зеркало counterSpell/counterSummon). Гейт на ВСЕ пути постановки
            // ловушек картой — рука, колода (руна/водный маг/штормовик),
            // повтор: armTrap зовёт его первым делом.
            A.trapPlayCountered = function trapPlayCountered(side) {
                return !!counterTrapConsume(side === "p" ? "e" : "p", "counterTrap");
            };


            A.armTrap = function armTrap(side, cardId, col, row, unit = null) {
                if (CARDS[cardId] && CARDS[cardId].type === "trap"
                    && trapPlayCountered(side)) return false;
                B.traps[side].push({ def: CARDS[cardId], col, row, unit });
                redrawTraps();
                const p = unit ? cellXY(unit.col, unit.row) : cellXY(col, row);
                fxEvent("seal", { x: p.x, y: p.y + 8, color: 0xb07ad5, scale: 0.85 });
                sfx("mine");
                return true;
            };
            A.triggerTraps = function triggerTraps(side, killer) {
                // «при гибели своего существа» — это ловушка-«ряд» (rowDmg);
                // в каталоге её пока нет (задел на будущее). Раньше здесь
                // безусловно снималась ПЕРВАЯ ловушка списка — гибель своего
                // существа молча съедала мину/отмену/руну и давала «Зимним
                // духам» фантомное +1 (баг юзера). Расходуем только rowDmg.
                const ti = B.traps[side].findIndex((t) => t.def.trap
                    && t.def.trap.effect === "rowDmg");
                if (ti < 0) return;
                const trap = B.traps[side].splice(ti, 1)[0];
                redrawTraps();
                trapTriggered(side); // «Зимние духи»/«Путь воды»: сработала ловушка «при гибели»
                const k = cellXY(killer.col, killer.row);
                floatText(k.x, k.y - 60, "?!", 0xe08cd0);
                fxEvent("trap", { x: k.x, y: k.y - 8, scale: 0.9 });
                if (trap.def.trap.effect === "rowDmg") {
                    const echo = trapEchoOnce(side);
                    for (let n = 0; n < (echo ? 2 : 1); n++) {
                        const amount = trap.def.trap.amount + altarBonus(side);
                        const victims = B.units.filter((v) => v.side !== side && v.row === killer.row);
                        for (const v of victims) {
                            if (B.units.includes(v)) damageUnit(v, amount, null, "acid");
                        }
                    }
                    refreshHud();
                    checkEnd();
                }
            };

            // «Наскальная рунопись»: руна висит на существе — когда ОНО атакует
            // (удар в марш или по базе), владелец руны разыгрывает случайное
            // заклинание из своей колоды без траты энергии (просил юзер). Если
            // заклинание может быть нацелено на атакующего — целит именно в него.

            // «Наскальная рунопись»: руна висит на существе — когда ОНО атакует
            // (удар в марш или по базе), владелец руны разыгрывает случайное
            // заклинание из своей колоды без траты энергии (просил юзер). Если
            // заклинание может быть нацелено на атакующего — целит именно в него.
            A.triggerAttackTraps = function triggerAttackTraps(attacker) {
                if (!attacker || !B.units.includes(attacker)) return;
                for (const side of ["p", "e"]) {
                    const i = B.traps[side].findIndex((tr) =>
                        tr.unit === attacker && tr.def.trap.effect === "castRandom");
                    if (i < 0) continue;
                    B.traps[side].splice(i, 1);
                    redrawTraps();
                    trapTriggered(side); // «Зимние духи»/«Путь воды»: сработала руна
                    const p = cellXY(attacker.col, attacker.row);
                    floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                    fxEvent("trap", { x: p.x, y: p.y - 8, scale: 0.9 });
                    sfx("mine");
                    const echo = trapEchoOnce(side);
                    castRandomSpell(side, attacker);
                    if (echo) castRandomSpell(side, attacker); // «Роща лоз»
                    refreshHud();
                    checkEnd();
                }
            };

            // Свободный каст случайного заклинания владельца side; focus —
            // атакующее существо (приоритетная цель, если заклинание умеет в него).

            A.redrawTraps = function redrawTraps() {
                const layer = root.trapLayer;
                layer.removeChildren().forEach((n) => n.destroy({ children: true }));
                    for (const side of ["p", "e"]) {
                        // Несколько ловушек в одной точке (одна клетка/существо)
                        // рисуем веером, иначе «?» полностью перекрывают друг
                        // друга и не видно, сколько их. Точки запоминаем в
                        // tr.__mx/__my — по ним работает наведение (подсказка
                        // «какая карта поставила ловушку», просил юзер).
                        const groups = new Map();
                        for (const tr of B.traps[side]) {
                            let p = null;
                            if (tr.unit) {
                                if (!B.units.includes(tr.unit)) continue; // снимут в removeUnit
                                p = cellXY(tr.unit.col, tr.unit.row);
                                p.y -= 44;
                            } else p = cellXY(tr.col, tr.row);
                            const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
                            if (!groups.has(key)) groups.set(key, []);
                            groups.get(key).push({ tr, p });
                        }
                        for (const list of groups.values()) {
                            const n = list.length;
                            list.forEach(({ tr, p }, i) => {
                                const dx = (i - (n - 1) / 2) * 40; // веер влево/вправо
                                const c = new PIXI.Container();
                                c.eventMode = "none"; // маркер не ест клики клетки
                                const g = new PIXI.Graphics();
                                g.circle(0, 0, 21);
                                g.fill({ color: side === "p" ? 0x3f5f8a : 0x7a3f3f, alpha: 0.62 });
                                g.stroke({ width: 3, color: 0xd8c79d });
                                c.addChild(g);
                                const q = T("?", 27, 0xffe9b0);
                                q.anchor.set(0.5);
                                c.addChild(q);
                                c.position.set(p.x + dx, p.y);
                                tr.__mx = p.x + dx; // для наведения на значок
                                tr.__my = p.y;
                                layer.addChild(c);
                            });
                        }
                    }
            };

            // ── «Стена костров» (str21) ────────────────────────────────────────
            // Ряд клетки горит effects/fire.png; в конце каждого хода ВЛАДЕЛЬЦА
            // (включая ход каста) все существа и строения ряда получают 2 урона
            // (+ аура алтаря). У каждого каста свой счётчик ходов (left).
        }
    };
})();
