// СЦЕНА «АРЕНА»: бой: статусы, урон, ловушки, upkeep.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installCombat = function installCombat(A) {
        with (A) {
            // ── Хуки атаки (марш, берсерк, «Скорость 1») ──────────────────────
            // «Старейший древоброд» (grw28), «Сокрушение»: после удара лишний
            // урон — разница между уроном атаки и жизнями цели ДО удара —
            // переходит в базу противника
            A.crushHit = function crushHit(attacker, dmg, hpBefore) {
                if (!attacker || !attacker.def || !attacker.def.crush
                    || !B.units.includes(attacker) || dmg <= 0) return;
                const raw = dmg - hpBefore;
                if (raw <= 0) return;
                // «Пастух росянок»: Сокрушение — способность Растения, лишний
                // урон списывается в базу дважды
                const excess = raw * (1 + (attacker.def.plant ? plantEcho(attacker.side) : 0));
                damageBase(attacker.side === "p" ? "e" : "p", excess,
                    attacker.side === "p"
                        ? { x: 960, y: 60, fill: 0xff8f6e }
                        : { x: 960, y: 840, fill: 0xff5f4e });
                sfx("crash");
            };
            // «Древоброд глухой чащи» (grw31): при атаке урон атаки получают
            // и ВСЕ существа и постройки по соседству (верт/гориз) с целью —
            // сам древоброд от собственного всплеска не страдает
            A.thicketSplash = function thicketSplash(attacker, target) {
                if (!attacker || !attacker.def || !attacker.def.thicket
                    || !B.units.includes(attacker)) return;
                // «Пастух росянок»: всплеск — способность Растения, бьёт дважды
                const times = 1 + (attacker.def.plant ? plantEcho(attacker.side) : 0);
                for (let t = 0; t < times; t++) {
                    for (const v of B.units.slice()) {
                        if (v === attacker || !B.units.includes(v)) continue;
                        if (Math.abs(v.col - target.col) + Math.abs(v.row - target.row) !== 1) continue;
                        damageUnit(v, attacker.curAtk, attacker, "sword");
                    }
                }
            };
            // «Круговая атака» (grw34): цель наносит 1 урон каждому соседу
            // (верт/гориз) — существам и постройкам обеих сторон (фикс 1,
            // аура алтаря не добавляется)
            A.novaSplash = function novaSplash(u) {
                if (!u || !B.units.includes(u)) return;
                for (const v of B.units.slice()) {
                    if (v === u || !B.units.includes(v)) continue;
                    if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) !== 1) continue;
                    damageUnit(v, 1, u, "dam");
                }
                refreshHud();
                checkEnd();
            };
            // «Ядовитость N» («Отравленные лезвия» grw29): атака по существу
            // противника вешает на него «Яд» N (свой яд не расплёскивается,
            // постройки не травятся)
            A.venomApply = function venomApply(attacker, target) {
                if (!attacker || !(attacker.venom > 0) || !B.units.includes(attacker)) return;
                if (!target || target.def.type !== "unit" || target.side === attacker.side
                    || !B.units.includes(target)) return;
                addPoison(target, attacker.venom);
            };

            // «Проросший кабан» (grw13): после атаки по существу отталкивает
            // его на клетку дальше от себя, если та свободна (постройки не
            // оттолкнуть, умирающая цель не толкается). Втолкнули на чужую
            // ловушку — она срабатывает, как от шага.
            A.afterAttackPush = function afterAttackPush(u, occ) {
                if (!u || !u.def || u.def.ability !== "pushBack") return;
                if (!B.units.includes(u) || !B.units.includes(occ)) return;
                if (occ.def.type !== "unit") return;
                const dir = u.side === "p" ? -1 : 1;
                const r2 = u.row + 2 * dir; // клетка за целью — дальше от кабана
                if (r2 < 0 || r2 >= GRID || unitAt(occ.col, r2)) return;
                occ.row = r2;
                const p = cellXY(occ.col, occ.row);
                glide(occ, p.x, p.y);
                sfx("step");
                triggerCellTraps(occ);
            };

            // «Шаман гоблинов»: после призыва бесплатно разыгрывает случайного
            // Гоблина (цена ≤ 2) из колоды своей стороны на пустую соседнюю
            // (верт/гориз) клетку — карта уходит из колоды прямо на поле.
            // Гоблин-ловушка (приманка) ставится как ловушка: нужен свободный
            // слот и клетка без своей ловушки.
            A.summonShaman = function summonShaman(u) {
                if (!B.units.includes(u)) return; // мог умереть от мины при призыве
                const deck = u.side === "p" ? B.deck : B.eDeck;
                const traps = u.side === "p" ? B.traps.p : B.traps.e;
                const near = [[-1, 0], [1, 0], [0, -1], [0, 1]]
                    .map(([dc, dr]) => [u.col + dc, u.row + dr]);
                const cellOk = (def, c2, r2) => c2 >= 0 && c2 < GRID && r2 >= 0 && r2 < GRID
                    && !unitAt(c2, r2)
                    && (def.type !== "trap" || !traps.some((tr) => tr.col === c2 && tr.row === r2));
                const goblins = deck
                    .map((id, i) => ({ id, i, def: CARDS[id] }))
                    .filter((x) => isGoblin(x.def) && x.def.cost <= 2
                        && (x.def.type !== "trap" || traps.length < TRAP_SLOTS)
                        && near.some(([c2, r2]) => cellOk(x.def, c2, r2)));
                if (!goblins.length) return;
                const pick = goblins[(Math.random() * goblins.length) | 0];
                deck.splice(pick.i, 1);
                const cells = near.filter(([c2, r2]) => cellOk(pick.def, c2, r2));
                const [col, row] = cells[(Math.random() * cells.length) | 0];
                if (pick.def.type === "trap") armTrap(u.side, pick.id, col, row);
                else addUnit(u.side, pick.id, col, row, { viaGoblin: u });
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 69, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
            };

            // «Призыватель духов»: после призыва бесплатно разыгрывает случайного
            // Гоблина из СБРОСА своей стороны (цена ≤ 3) на пустую соседнюю
            // (верт/гориз) клетку — энергия не тратится (просил юзер). Карта
            // уходит из сброса прямо на поле. Ловушка-гоблин (приманка) ставится
            // как ловушка: нужен свободный слот и клетка без своей ловушки.
            A.summonSpiritCaller = function summonSpiritCaller(u) {
                if (!B.units.includes(u)) return; // мог умереть от мины при призыве
                const discard = u.side === "p" ? B.discard : B.eDiscard;
                const traps = u.side === "p" ? B.traps.p : B.traps.e;
                const near = [[-1, 0], [1, 0], [0, -1], [0, 1]]
                    .map(([dc, dr]) => [u.col + dc, u.row + dr]);
                const cellOk = (def, c2, r2) => c2 >= 0 && c2 < GRID && r2 >= 0 && r2 < GRID
                    && !unitAt(c2, r2)
                    && (def.type !== "trap" || !traps.some((tr) => tr.col === c2 && tr.row === r2));
                const goblins = discard
                    .map((id, i) => ({ id, i, def: CARDS[id] }))
                    .filter((x) => CARDS[x.id] && isGoblin(x.def) && x.def.cost <= 3
                        && (x.def.type !== "trap" || traps.length < TRAP_SLOTS)
                        && near.some(([c2, r2]) => cellOk(x.def, c2, r2)));
                if (!goblins.length) return;
                const pick = goblins[(Math.random() * goblins.length) | 0];
                discard.splice(pick.i, 1);
                const cells = near.filter(([c2, r2]) => cellOk(pick.def, c2, r2));
                const [col, row] = cells[(Math.random() * cells.length) | 0];
                if (pick.def.type === "trap") armTrap(u.side, pick.id, col, row);
                else addUnit(u.side, pick.id, col, row);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 69, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
            };

            // «Бомблинг»: после призыва находит в колоде владельца случайную
            // карту ловушки и кладёт её в руку (карта уходит из колоды).
            A.summonBombling = function summonBombling(u) {
                if (!B.units.includes(u)) return; // мог умереть от мины при призыве
                const deck = u.side === "p" ? B.deck : B.eDeck;
                const hand = u.side === "p" ? B.hand : B.eHand;
                const traps = deck.map((id, i) => ({ id, i }))
                    .filter((x) => CARDS[x.id].type === "trap");
                if (!traps.length) return;
                const pick = traps[(Math.random() * traps.length) | 0];
                deck.splice(pick.i, 1);
                hand.push(pick.id);
                sfx("chpoc");
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 69, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
            };

            // «Гоблинская приманка»: существо врага, шагающее С КЛЕТКИ, соседней
            // с ловушкой, сходит на клетку приманки вместо намеченной — и получает
            // 1 урона. Приманка одноразовая; занятая клетка приманки не манит.
            A.lureRedirect = function lureRedirect(u, fromCol, fromRow, toCol, toRow) {
                // «Водный элементаль» (wis82) на приманку не ведётся
                if (u.def.ability === "noTraps") return [toCol, toRow];
                const foe = u.side === "p" ? "e" : "p";
                const i = B.traps[foe].findIndex((tr) => tr.def.trap.effect === "lure"
                    && Math.abs(tr.col - fromCol) + Math.abs(tr.row - fromRow) === 1
                    && !unitAt(tr.col, tr.row));
                if (i < 0) return [toCol, toRow];
                const trap = B.traps[foe].splice(i, 1)[0];
                redrawTraps();
                const p = cellXY(trap.col, trap.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                damageUnit(u, trap.def.trap.dmg + altarBonus(foe), null, "acid");
                return [trap.col, trap.row];
            };

            // Перемещение завершилось: ловушка врага на этой клетке срабатывает,
            // затем «Выстрел 1» лучника (перемещение состоялось)
            A.afterMoved = function afterMoved(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                triggerCellTraps(u);
                archerShot(u);
            };
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
            A.counterTrapConsume = function counterTrapConsume(side, effect) {
                const i = B.traps[side].findIndex((t) =>
                    t.def.trap && t.def.trap.effect === effect);
                if (i < 0) return null;
                const trap = B.traps[side].splice(i, 1)[0];
                redrawTraps();
                const p = cellXY(trap.col, trap.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
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
                let i = B.traps[side].findIndex((t) => t.col === u.col && t.row === u.row
                    && (t.def.trap.effect === "cellDmg" || t.def.trap.effect === "ambush"
                        || t.def.trap.effect === "confuse" || t.def.trap.effect === "cellDebuff"
                        || t.def.trap.effect === "ancestor" || t.def.trap.effect === "entangle"));
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
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                const echo = trapEchoOnce(side); // первая ловушка боя — флаг потрачен
                applyCellTrap(trap, side, u);
                if (echo && B.units.includes(u)) applyCellTrap(trap, side, u);
            };

            // Эффект сработавшей ловушки на клетке (отделён от поиска ловушки —
            // «Роща лоз» применяет его дважды); u — существо, наступившее на неё
            A.applyCellTrap = function applyCellTrap(trap, side, u) {
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
            A.archerShot = function archerShot(u) {
                if (!B.units.includes(u) || u.def.ability !== "archer") return;
                const dir = u.side === "p" ? -1 : 1;
                for (let r = u.row + dir; r >= 0 && r < GRID; r += dir) {
                    const o = unitAt(u.col, r);
                    if (o) {
                        damageUnit(o, 1, u, "dam");
                        refreshHud();
                        checkEnd();
                        return;
                    }
                }
                sfx("crash");
                damageBase(u.side === "p" ? "e" : "p", 1,
                    u.side === "p"
                        ? { x: cellXY(u.col, 0).x, y: cellXY(u.col, 0).y - 15, fill: 0xff8f6e }
                        : { x: cellXY(u.col, GRID - 1).x, y: cellXY(u.col, GRID - 1).y + 15, fill: 0xff5f4e });
                refreshHud();
                checkEnd();
            };

            // «Атака духами волков» (grw33): выбранное существо делает Выстрел —
            // урон атаки вперёд по вертикали ближайшему существу или строению
            // (любой стороны, как у лучника), а если вертикаль пуста — базе
            // противника. На всех пустых клетках пути являются Волки 2/4
            // стороны кастовавшего (штатный addUnit: ауры/монолит/сестра работают)
            A.wolfVolley = function wolfVolley(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                const dir = u.side === "p" ? -1 : 1;
                let hit = null;
                const path = [];
                for (let r = u.row + dir; r >= 0 && r < GRID; r += dir) {
                    const o = unitAt(u.col, r);
                    if (o) { hit = o; break; }
                    path.push(r);
                }
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "➤", 0xcfe8b0);
                if (hit) {
                    damageUnit(hit, u.curAtk, u, "dam");
                } else {
                    baseHit(u.side, u); // вертикаль пуста — выстрел в базу
                }
                for (const r of path) addUnit(u.side, "grw2", u.col, r, { token: true });
                refreshHud();
                checkEnd();
            };

            A.removeUnit = function removeUnit(u) {
                const i = B.units.indexOf(u);
                if (i >= 0) B.units.splice(i, 1);
                if (unitCard && unitCard.unit === u) unitCardHide(); // жетон умер
                // руна («Наскальная рунопись») живёт на существе: существо ушло
                // с поля (смерть, побег, удар по базе) — ловушка рассыпалась
                for (const s of ["p", "e"]) {
                    const n = B.traps[s].length;
                    B.traps[s] = B.traps[s].filter((tr) => tr.unit !== u);
                    if (B.traps[s].length !== n) redrawTraps();
                }
                punches.push({ node: u.node, life: 0.25 / animK(), total: 0.25 / animK(), dying: true });
            };

            // «Смыв» (wis85): существо убирается с поля боя БЕЗ каскадов смерти
            // (зеркально «Раскопкам» — хищник не кормится, ауры пересчитываются),
            // его карта призыва возвращается в руку владельца из сброса. У
            // токена (gobA/gobC/волк друида) карты призыва нет — просто убирается.
            // Рука не резиновая: не влезло (HAND_MAX) — карта остаётся в сбросе.
            A.bounceUnit = function bounceUnit(u) {
                if (!B.units.includes(u)) return;
                const p = cellXY(u.col, u.row);
                const id = cardIdOf(u.def);
                removeUnit(u);
                recalcAuras();
                if (u.token) return;
                const discard = u.side === "p" ? B.discard : B.eDiscard;
                const hand = u.side === "p" ? B.hand : B.eHand;
                const i = discard.indexOf(id);
                if (i < 0) return; // карты призыва нет (повтор/сожжение) — просто убрали
                discard.splice(i, 1);
                if (hand.length < HAND_MAX) {
                    hand.push(id);
                    floatText(p.x, p.y - 66, "↩ " + GAME_LOC.t(`card.${id}.name`), 0x8cd0ef);
                } else {
                    discard.push(id); // рука полна — карта возвращается в сброс
                }
            };

            A.killUnit = function killUnit(u, killer) {
                removeUnit(u);
                sfx("die");
                if (u.def.type === "building") recalcAuras();
                // «Рунный монолит»: на смерть существа постройка теряет 1 жизнь,
                // а владелец берёт карту (просил юзер). Добор до урона — как у
                // «Грибницы»: эффект срабатывает, даже если монолит гибнет сам;
                // смерть монолита — смерть постройки, каскад не повторяется.
                if (u.def.type === "unit") for (const b of B.units.slice()) {
                    if (!b.def.runeMonolith) continue;
                    if (b.side === "p") drawCards(1); else drawEnemy(1);
                    const hand = b.side === "p" ? B.hand : B.eHand;
                    const drawn = hand[hand.length - 1];
                    const p = cellXY(b.col, b.row);
                    floatText(p.x, p.y - 66,
                        drawn ? GAME_LOC.t(`card.${drawn}.name`) : "…", 0xffd98c);
                    damageUnit(b, 1, null, "dam");
                }
                // «Хищное растение» (grw1): когда умирает ДРУГОЕ существо (любой
                // стороны), каждое живое растение получает +1 урона и +1 жизни
                // («Пастух росянок» — способность Растения срабатывает дважды)
                if (u.def.type === "unit") for (const v of B.units.slice()) {
                    if (v === u || v.def.ability !== "predator" || !B.units.includes(v)) continue;
                    const k = 1 + (v.def.plant ? plantEcho(v.side) : 0);
                    v.bonusAtk = (v.bonusAtk || 0) + k;
                    v.hp += k;
                    recalcAuras(); // обновит и бейдж урона (кламп ≥ 0)
                    const hn = v.node.getChildByName("hp");
                    if (hn) hn.text = String(v.hp);
                    const p = cellXY(v.col, v.row);
                    floatText(p.x, p.y - 66, `+${k}⚔ +${k}♥`, 0x9fd489);
                    punch(v.node);
                    sfx("up");
                }
                // ловушки стороны погибшего: триггер «при гибели своего существа»
                if (killer && killer.def && killer.def.type === "unit" && killer.side !== u.side) {
                    triggerTraps(u.side, killer);
                }
                heroDeathReplay(u); // «Гоблин-вождь»: первый погибший гоблин возвращается
                heroBuildingReplay(u); // «Хранитель рощи»: первая погибшая постройка возвращается
            };

            // Способность «Хранителя рощи» (buildingDeathReplay, просил юзер):
            // ПЕРВАЯ за бой погибшая постройка стороны-владелицы возвращается —
            // её карта уходит в руку, и она сразу разыгрывается в ту же клетку
            // без траты энергии (штатный addUnit: ауры, ловушки клетки)
            A.heroBuildingReplay = function heroBuildingReplay(u) {
                if (!u || u.def.type !== "building") return;
                const side = u.side;
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "buildingDeathReplay"
                    || B.heroFlags.buildReplay[side]) return;
                B.heroFlags.buildReplay[side] = true;
                const id = cardIdOf(u.def);
                const hand = side === "p" ? B.hand : B.eHand;
                const col = u.col, row = u.row;
                hand.push(id);
                const p = cellXY(col, row);
                floatText(p.x, p.y - 90, GAME_LOC.t(`card.${id}.name`), 0xffd98c);
                sfx("chpoc");
                // тут же разыгрывается в ту же клетку (занята — карта остаётся
                // в руке)
                if (!unitAt(col, row)) addUnit(side, id, col, row);
            };

            // Способность «Гоблин-вождя» (goblinDeathReplay, просил юзер):
            // ПЕРВЫЙ за бой гоблин стороны-владелицы, погибнув, возвращается —
            // его карта уходит в руку, и он сразу разыгрывается в ту же клетку
            // без траты энергии. «Не токен, с картой призыва»: жетоны (засада,
            // культ, дух предка, волки друида/выстрела) не возвращаются.
            A.heroDeathReplay = function heroDeathReplay(u) {
                // без лица карты — служебный жетон (gobA/gobC/ancBear): вождь
                // такие не возвращает, даже если метки token не было
                if (!u || u.def.type !== "unit" || u.token || !u.def.img
                    || !isGoblin(u.def)) return;
                const side = u.side;
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "goblinDeathReplay"
                    || B.heroFlags.deathReplay[side]) return;
                B.heroFlags.deathReplay[side] = true;
                const id = cardIdOf(u.def);
                const hand = side === "p" ? B.hand : B.eHand;
                const col = u.col, row = u.row;
                hand.push(id);
                const p = cellXY(col, row);
                floatText(p.x, p.y - 90, GAME_LOC.t(`card.${id}.name`), 0xffd98c);
                sfx("chpoc");
                // тут же разыгрывается в ту же клетку (занята — карта остаётся
                // в руке); штатный addUnit: ауры, ловушки клетки — как у призыва
                if (!unitAt(col, row)) addUnit(side, id, col, row);
            };

            // «Огненное дыхание»: зачарованное существо при КАЖДОМ нанесении
            // урона кладёт владельцу в руку случайное заклинание из своей колоды
            // (карта уходит из колоды; заклинаний в колоде нет — нет и добора).
            A.procEnchantFire = function procEnchantFire(killer) {
                if (!killer || !killer.def || killer.def.type !== "unit"
                    || !killer.enchantFire || !B.units.includes(killer)) return;
                const deck = killer.side === "p" ? B.deck : B.eDeck;
                const hand = killer.side === "p" ? B.hand : B.eHand;
                const spells = deck.map((id, i) => ({ id, i }))
                    .filter((x) => CARDS[x.id].type === "spell");
                if (!spells.length) return;
                const pick = spells[(Math.random() * spells.length) | 0];
                deck.splice(pick.i, 1);
                hand.push(pick.id);
                sfx("chpoc");
                const p = cellXY(killer.col, killer.row);
                floatText(p.x, p.y - 66, GAME_LOC.t(`card.${pick.id}.name`), 0xffd98c);
            };

            // «Призрачные споры» (grw15): проклятие вешается на существо врага —
            // когда оно наносит урон (существу, постройке, базе), СВОЯ база
            // получает столько же. Живёт на самом существе: смерть/побег
            // снимают проклятие вместе с ним (в слоты ловушек не попадает).
            A.addSpores = function addSpores(u) {
                u.spores = true;
                const mark = new PIXI.Graphics();
                mark.circle(0, 0, 10.5);
                mark.fill({ color: 0x7a9a4e });
                mark.stroke({ width: 3, color: 0xd8e8a0 });
                mark.position.set(-36, -54); // очарование — справа, споры — слева
                mark.name = "sporeMark";
                mark.eventMode = "none";
                u.node.addChild(mark);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "☣", 0xb7d178);
                sfx("acid");
            };
            // Отклик спор на урон: база стороны проклятого существа получает
            // столько же, сколько оно нанесло (checkEnd зовут вызывающие)
            A.procSpores = function procSpores(u, amount) {
                if (!u || !u.spores || !B.units.includes(u) || !(amount > 0)) return;
                damageBase(u.side, amount,
                    u.side === "p"
                        ? { x: 960, y: 840, fill: 0xff5f4e }
                        : { x: 960, y: 60, fill: 0xff8f6e });
                sfx("acid");
            };

            // «Защитный кокон» (grw19): цель получает «Защита 1» — любой урон
            // по ней уменьшается на 1 (режется в damageUnit). Коконы складываются,
            // бейдж показывает сумму; «Извлечение духа» снимает защиту целиком.
            A.addProtect = function addProtect(u) {
                u.protect = (u.protect || 0) + 1;
                let mark = u.node.getChildByName("protectMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "protectMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x2e5f8a });
                    g.stroke({ width: 3, color: 0xa0d8ef });
                    mark.addChild(g);
                    const tx = T("", 17, 0xd0effa);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(36, -54); // зеркально меткам берсерка/спор
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.protect);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, GAME_LOC.t("card.grw19.name"), 0x8cd0ef);
                punch(u.node);
                sfx("up");
            };

            // «Ядовитость N» (grw29): метка на существе — его атаки вешают на
            // цель «Яд» N. «Яд M» копится на отравленном; в начале хода
            // владельца (до марша) существо теряет M жизней
            A.addVenom = function addVenom(u, n) {
                u.venom = (u.venom || 0) + n;
                let mark = u.node.getChildByName("venomMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "venomMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x2a5a2e });
                    g.stroke({ width: 3, color: 0x9fd489 });
                    mark.addChild(g);
                    const tx = T("", 17, 0xd8f0c0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(18, -66); // запутанность по центру, яд слева
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.venom);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 66, `☠ ${u.venom}`, 0x9fd489);
                punch(u.node);
                sfx("acid");
            };
            A.addPoison = function addPoison(u, m) {
                if (!B.units.includes(u)) return; // цель умерла от самой атаки
                u.poison = (u.poison || 0) + m;
                let mark = u.node.getChildByName("poisonMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "poisonMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x5a7a2e });
                    g.stroke({ width: 3, color: 0xd8f0a0 });
                    mark.addChild(g);
                    const tx = T("", 17, 0xf0fad0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(-18, -66);
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.poison);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "☠", 0xb7d178);
                sfx("acid");
            };
            // Начало хода стороны, ДО марша: каждое отравленное её существо
            // теряет жизни по мощности яда (штатный урон — яд может убить)
            A.poisonTick = function poisonTick(side) {
                for (const u of B.units.slice()) {
                    if (u.side !== side || u.def.type !== "unit" || !(u.poison > 0)) continue;
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 60, `☠ −${u.poison}`, 0xb7d178);
                    damageUnit(u, u.poison, null, "acid");
                }
                refreshHud();
                checkEnd();
            };
            // «Опутывание N» (grw35): корни держат существо на месте — оно
            // пропускает перемещение в начале своего хода, счётчик тает на 1;
            // на ноль — эффект снят. Атака по стоящему впереди врагу остаётся
            A.addEntangle = function addEntangle(u, n) {
                if (!B.units.includes(u)) return; // цель умерла от той же ловушки
                u.entangle = (u.entangle || 0) + n;
                let mark = u.node.getChildByName("entangleMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "entangleMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x6b4a2e });
                    g.stroke({ width: 3, color: 0xc9a06a });
                    mark.addChild(g);
                    const tx = T("", 17, 0xf0dcb0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(-36, -66); // опутывание — левее яда
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.entangle);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "≡", 0xc9a06a);
                sfx("acid");
            };
            A.removeEntangleMark = function removeEntangleMark(u) {
                const mark = u.node && u.node.getChildByName("entangleMark");
                if (mark) mark.destroy({ children: true });
            };
            // «Защита от заклинаний» (способность Миры, u.spellWard): метка
            // синим знаком на жетоне — зеркально меткам очарования/берсерка
            A.addWardMark = function addWardMark(u) {
                if (u.node.getChildByName("wardMark")) return;
                const mark = new PIXI.Container();
                mark.name = "wardMark";
                mark.eventMode = "none";
                const g = new PIXI.Graphics();
                g.circle(0, 0, 13.5);
                g.fill({ color: 0x1e3a5f });
                g.stroke({ width: 3, color: 0x8cd0ef });
                mark.addChild(g);
                const tx = T("✦", 18, 0x8cd0ef);
                tx.anchor.set(0.5);
                mark.addChild(tx);
                mark.position.set(36, -54);
                u.node.addChild(mark);
            };
            A.removeWardMark = function removeWardMark(u) {
                const mark = u.node && u.node.getChildByName("wardMark");
                if (mark) mark.destroy({ children: true });
            };

            A.countProps = function countProps(u) {
                let n = PURGE_DEF_KEYS.filter((k) => u.def[k] !== undefined).length;
                if (u.bonusAtk) n++; // перманентные бонусы (лагерь, «Природная мощь»)
                if (u.spores) n++;
                if (u.enchantFire) n++;
                if (u.protect) n++;
                if (u.berserk) n++;
                if (u.confused) n++;
                if (u.venom) n++;
                if (u.poison) n++;
                if (u.entangle) n++;
                if (u.spellWard) n++;
                return n;
            };
            // Снять ВСЕ свойства/эффекты цели; возвращает, сколько снято, —
            // база кастовавшего лечится за каждое. Метка plant и базовые статы
            // остаются (это тип существа, а не эффект).
            A.purgeUnit = function purgeUnit(u) {
                const def = Object.assign({}, u.def);
                let n = 0;
                for (const k of PURGE_DEF_KEYS) if (def[k] !== undefined) { delete def[k]; n++; }
                def.__base = u.def.__base || u.def; // cardIdOf должен узнавать карту
                u.def = def;
                if (u.bonusAtk) { u.bonusAtk = 0; n++; }
                if (u.spores) { u.spores = false; n++; }
                if (u.enchantFire) { u.enchantFire = false; n++; }
                if (u.protect) { u.protect = 0; n++; }
                if (u.berserk) { u.berserk = 0; n++; }
                if (u.confused) { u.confused = 0; n++; }
                if (u.venom) { u.venom = 0; n++; }
                if (u.poison) { u.poison = 0; n++; }
                if (u.entangle) { u.entangle = 0; n++; }
                if (u.spellWard) { u.spellWard = false; n++; removeWardMark(u); }
                for (const m of ["sporeMark", "enchMark", "protectMark", "berserkMark", "confuseMark",
                    "venomMark", "poisonMark", "entangleMark"]) {
                    const node = u.node.getChildByName(m);
                    if (node) node.destroy({ children: true });
                }
                recalcAuras(); // снесённая аура больше не действует соседям
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, GAME_LOC.t("card.grw17.name"), 0xd0b0ef);
                punch(u.node);
                sfx("chpoc");
                return n;
            };

            // snd — звук удара: "sword" (атака существом), "acid" (ловушка),
            // "rocket" (заклинание), по умолчанию "dam"
            A.damageUnit = function damageUnit(target, amount, killer = null, snd = "dam") {
                // «Защита от заклинаний» (u.spellWard): пока идёт разрешение
                // заклинания (A.spellCasting ставят applySpellP /
                // enemyCastSpellEffect / тик «Стены костров»), урон заклинания
                // по такому существу не проходит вовсе (просил юзер)
                if (amount > 0 && target.spellWard && A.spellCasting) {
                    const wp = cellXY(target.col, target.row);
                    floatText(wp.x, wp.y - 66,
                        "✦ " + GAME_LOC.t("spell.ward.name"), 0x8cd0ef);
                    sfx("aqua");
                    return;
                }
                // «Защита N» («Защитный кокон») режет входящий урон до нуля;
                // споры/огненное дыхание реагируют на ФАКТИЧЕСКИ прошедший урон
                let amt = amount;
                if (target.protect && amt > 0) {
                    const blocked = Math.min(target.protect, amt);
                    amt -= blocked;
                    const bp = cellXY(target.col, target.row);
                    floatText(bp.x, bp.y - 72, `Защита −${blocked}`, 0x8cd0ef);
                }
                target.hp -= amt;
                procEnchantFire(killer);
                procSpores(killer, amt); // «Призрачные споры» отражают урон по базе
                const n = target.node.getChildByName("hp");
                if (n) n.text = String(Math.max(0, target.hp));
                const p = cellXY(target.col, target.row);
                floatText(p.x, p.y - 36, `−${amt}`, 0xffb26e);
                punch(target.node);
                sfx(snd);
                if (target.hp <= 0) { killUnit(target, killer); return; }
                // «Гоблин-асассин»: существо, оставшееся после его урона
                // с 1 жизнью, добивается
                if (target.hp === 1 && target.def.type === "unit"
                    && killer && killer.def.ability === "assassin") {
                    floatText(p.x, p.y - 66, "☠", 0xef9f8c);
                    killUnit(target, killer);
                    return;
                }
                // «Друид глубокой чащи» (grw24): пережив ФАКТИЧЕСКИЙ урон
                // (защита, съевшая всё, уроном не считается), призывает Волка
                summonDruidWolf(target, amt);
            };

            // Призыв Волка 2/4 (grw2) на пустую соседнюю клетку друида; нет
            // свободной — волка нет. Вызывается из damageUnit, когда друид выжил
            A.summonDruidWolf = function summonDruidWolf(u, amt) {
                if (!u.def.wolfSummon || amt <= 0 || !B.units.includes(u)) return;
                const near = [];
                for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const c = u.col + dc, r = u.row + dr;
                    if (c < 0 || c >= GRID || r < 0 || r >= GRID) continue;
                    if (!unitAt(c, r)) near.push([c, r]);
                }
                if (!near.length) return; // кругом свои — волку нет места
                const [col, row] = near[(Math.random() * near.length) | 0];
                addUnit(u.side, "grw2", col, row, { token: true });
                const p = cellXY(col, row);
                floatText(p.x, p.y - 75, GAME_LOC.t("card.grw2.name"), 0x9fd489);
            };

            // Лечение (+n жизни; пределом служит сама карта — жёсткого максимума
            // у существ нет): счётчик на жетоне и всплывающий «+n»
            A.healUnit = function healUnit(u, n) {
                if (!B.units.includes(u)) return;
                u.hp += n;
                const node = u.node.getChildByName("hp");
                if (node) node.text = String(u.hp);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 36, `+${n}`, 0x9fd489);
                punch(u.node);
                sfx("up");
            };

            // Урон базе стороны — единая точка для всех источников. «Дома на
            // деревьях» (grw38): пока такая постройка на поле, урон базе
            // ЦЕЛИКОМ уходит в неё (без остатка базе; несколько — первая).
            // where — позиция/цвет всплывающего «−N» у базы (при редиректе
            // не показывается: урон виден на самой постройке).
            A.damageBase = function damageBase(side, amount, where = null) {
                if (!B || !(amount > 0)) return;
                const house = B.units.find((v) => v.side === side
                    && v.def.type === "building" && v.def.treeHomes);
                if (house) {
                    damageUnit(house, amount, null, "crash");
                    punch(root.hud);
                    return;
                }
                if (side === "p") B.playerBase -= amount; else B.enemyBase -= amount;
                if (where) floatText(where.x, where.y, `−${amount}`, where.fill);
                punch(root.hud);
            };

            A.baseHit = function baseHit(side, u) {
                sfx("crash");
                procEnchantFire(u); // «Огненное дыхание» срабатывает и на базе
                procSpores(u, u.curAtk); // споры: удар по чужой базе бьёт и свою
                damageBase(side === "p" ? "e" : "p", u.curAtk,
                    side === "p"
                        ? { x: cellXY(u.col, 0).x, y: cellXY(u.col, 0).y - 15, fill: 0xff8f6e }
                        : { x: cellXY(u.col, GRID - 1).x, y: cellXY(u.col, GRID - 1).y + 15, fill: 0xff5f4e });
            };

            // «Грибница»: в начало хода владельца даёт 1 энергию и теряет 1 жизнь
            // (энергия начисляется даже если грибница от этого урона погибает).
            // «Походный костёр»: соседние с ним существа (обе стороны) получают
            // 1 жизнь, а сам костёр теряет 1 — лечит раньше, так что даже
            // погибая от собственного жара, он успевает согреть соседей.
            A.upkeep = function upkeep(side) {
                for (const b of B.units.slice()) {
                    if (b.side !== side || b.def.type !== "building") continue;
                    if (b.def.mycelium) {
                        if (side === "p") B.energy += 1; else B.eEnergy += 1;
                        sfx("aqua");
                        const p = cellXY(b.col, b.row);
                        floatText(p.x, p.y - 60, "+1⚡", 0xffd98c);
                        damageUnit(b, 1, null, "dam");
                    }
                    if (b.def.campfire) {
                        for (const v of B.units.slice()) {
                            if (v.def.type !== "unit") continue;
                            if (Math.abs(v.col - b.col) + Math.abs(v.row - b.row) !== 1) continue;
                            healUnit(v, 1);
                        }
                        damageUnit(b, 1, null, "dam");
                    }
                    if (b.def.sprout && b.hp >= 3) {
                        // «Росток» (grw6): в начале хода владельца при 3+ жизнях
                        // возвращается в руку, а соседнее СВОЁ существо получает
                        // +3 жизни (нет своего — лечить некого, возврат всё равно
                        // происходит); «Пастух росянок» — лечение срабатывает
                        // на раз больше (возврат в руку — один)
                        const id = cardIdOf(b.def);
                        if (side === "p") B.hand.push(id); else B.eHand.push(id);
                        const heals = 1 + (b.def.plant ? plantEcho(b.side) : 0);
                        for (let t = 0; t < heals; t++) {
                            const near = B.units.filter((v) => v.side === b.side
                                && v.def.type === "unit"
                                && Math.abs(v.col - b.col) + Math.abs(v.row - b.row) === 1);
                            if (near.length) healUnit(near[(Math.random() * near.length) | 0], 3);
                        }
                        const p = cellXY(b.col, b.row);
                        floatText(p.x, p.y - 72, GAME_LOC.t("card.grw6.name"), 0x9fd489);
                        sfx("chpoc");
                        removeUnit(b); // ушёл в руку — не смерть, каскадов нет
                    }
                }
                refreshHud();
            };

            // «Пень обряда» (grw11), начало хода ИИ: подсматривает верхнюю карту
            // чужой или своей колоды — сильную карту игрока (цена 4+ или
            // эпическая) сбрасывает, свою слабую (цена ≤ 1 и мелкое существо)
            // тоже; иную карту оставляет наверху, как было
            A.riteStumpTick = function riteStumpTick(side) {
                const stump = B.units.find((b) => b.side === side
                    && b.def.type === "building" && b.def.riteStump);
                if (!stump) return;
                const foeDeck = side === "p" ? B.eDeck : B.deck;
                const foeDisc = side === "p" ? B.eDiscard : B.discard;
                const ownDeck = side === "p" ? B.deck : B.eDeck;
                const ownDisc = side === "p" ? B.discard : B.eDiscard;
                const fp = cellXY(stump.col, stump.row);
                const fDef = foeDeck.length ? CARDS[foeDeck[foeDeck.length - 1]] : null;
                if (fDef && (fDef.cost >= 4 || fDef.rarity === "epic")) {
                    const id = foeDeck.pop();
                    foeDisc.push(id);
                    floatText(fp.x, fp.y - 66, GAME_LOC.t(`card.${id}.name`), 0xffd98c);
                    sfx("chpoc");
                    return;
                }
                const oDef = ownDeck.length ? CARDS[ownDeck[ownDeck.length - 1]] : null;
                if (oDef && oDef.cost <= 1
                    && (oDef.type !== "unit" || oDef.atk + oDef.hp <= 3)) {
                    const id = ownDeck.pop();
                    ownDisc.push(id);
                    floatText(fp.x, fp.y - 66, GAME_LOC.t(`card.${id}.name`), 0xffd98c);
                    sfx("chpoc");
                }
            };

            // «Росток» (grw6), конец хода владельца: постройка получает +1 жизнь
            // (вызывается там же, где тик «Стены костров» этой стороны)
            A.sproutTick = function sproutTick(side) {
                for (const b of B.units.slice()) {
                    if (b.side !== side || !b.def.sprout || !B.units.includes(b)) continue;
                    const k = 1 + (b.def.plant ? plantEcho(b.side) : 0);
                    b.hp += k;
                    const hn = b.node.getChildByName("hp");
                    if (hn) hn.text = String(b.hp);
                    const p = cellXY(b.col, b.row);
                    floatText(p.x, p.y - 60, `+${k}♥`, 0x9fd489);
                    punch(b.node);
                    sfx("up");
                }
            };

            // ── Ловушки ─────────────────────────────────────────────────────────
            // Мины хранят клетку (col/row); руна («Наскальная рунопись») —
            // само существо (unit) и ездит с ним.
            A.armTrap = function armTrap(side, cardId, col, row, unit = null) {
                if (B.traps[side].length >= TRAP_SLOTS) return false;
                B.traps[side].push({ def: CARDS[cardId], col, row, unit });
                redrawTraps();
                sfx("mine");
                return true;
            };
            A.triggerTraps = function triggerTraps(side, killer) {
                if (!B.traps[side].length) return;
                const trap = B.traps[side].shift();
                redrawTraps();
                const k = cellXY(killer.col, killer.row);
                floatText(k.x, k.y - 60, "?!", 0xe08cd0);
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
            A.triggerAttackTraps = function triggerAttackTraps(attacker) {
                if (!attacker || !B.units.includes(attacker)) return;
                for (const side of ["p", "e"]) {
                    const i = B.traps[side].findIndex((tr) =>
                        tr.unit === attacker && tr.def.trap.effect === "castRandom");
                    if (i < 0) continue;
                    B.traps[side].splice(i, 1);
                    redrawTraps();
                    const p = cellXY(attacker.col, attacker.row);
                    floatText(p.x, p.y - 60, "?!", 0xe08cd0);
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
            A.castRandomSpell = function castRandomSpell(side, focus) {
                const deck = side === "p" ? B.deck : B.eDeck;
                const spells = deck.map((id, i) => ({ id, i }))
                    .filter((x) => CARDS[x.id] && CARDS[x.id].type === "spell");
                if (!spells.length) return; // заклинаний в колоде нет — руна впустую
                const pick = spells[(Math.random() * spells.length) | 0];
                deck.splice(pick.i, 1);
                const def = CARDS[pick.id];
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const fp = cellXY(focus.col, focus.row);
                floatText(fp.x, fp.y - 90, GAME_LOC.t(`card.${pick.id}.name`), 0xffd98c);
                // панельные заклинания (выбор из карт / призыв) авто-розыгрыша
                // не имеют — уходят в руку владельца, разыграет сам за энергию
                if (def.spell.search || def.spell.journey || def.spell.searchUnit) {
                    hand.push(pick.id);
                    return;
                }
                // «Отмена заклинания» противника: свободный каст руны — тоже
                // розыгрыш заклинания, отменяется (карта руны уходит в сброс)
                if (counterTrapConsume(side === "p" ? "e" : "p", "counterSpell")) {
                    floatText(fp.x, fp.y - 60,
                        "✕ " + GAME_LOC.t(`card.${pick.id}.name`), 0x8cd0ef);
                    discard.push(pick.id);
                    return;
                }
                if (def.spell.copyLast) { // «Горящие руны»: повтор последнего
                    const last = side === "p" ? B.lastSpell.p : B.lastSpell.e;
                    const ok = last && last !== "str25" && CARDS[last]
                        && CARDS[last].type === "spell";
                    if (!ok) { discard.push(pick.id); return; } // повтора нет — впустую
                    if (side === "p") { B.lastSpell.p = "str25"; replaySpell(last); }
                    else { B.lastSpell.e = "str25"; enemyReplayLast(); }
                    afterSpellPlayed();
                    discard.push(pick.id);
                    return;
                }
                if (side === "p") {
                    applySpellP(pick.id, runeTargetP(pick.id, focus), true);
                    if (def.spell.drainAll) B.energy = 0; // огнешар и бесплатно его сжигает
                    B.lastSpell.p = pick.id;
                } else {
                    enemyCastSpellEffect(def, true, focus);
                    if (def.spell.drainAll) B.eEnergy = 0;
                    B.lastSpell.e = pick.id;
                }
                afterSpellPlayed(); // «Заклинатель клинков» реагирует и на это
                discard.push(pick.id);
            };

            // Цель свободного каста у игрока: атакующий (focus), если заклинание
            // может на него целиться, иначе автоцель как у «Горящих рун».
            A.runeTargetP = function runeTargetP(cardId, focus) {
                const s = CARDS[cardId].spell;
                if (s.target === "anyCell" || s.target === "none")
                    return autoTargetFor(cardId);
                if (!focus || !B.units.includes(focus)) return autoTargetFor(cardId);
                // «Защита от заклинаний»: на такое существо заклинание не целится
                const ok = s.target === "anyUnit" ? focus.side === "p"
                        && focus.def.type === "unit" && !focus.spellWard
                    : s.target === "ownUnit" ? focus.side === "p"
                        && focus.def.type === "unit" && !focus.spellWard
                    : s.target === "anyUnitDmg" ? (focus.def.type === "unit"
                            && !focus.spellWard)
                        || (focus.def.type === "building" && !s.noBuildings)
                    : s.target === "enemyAny" ? focus.side !== "p"
                    : false;
                return ok ? { col: focus.col, row: focus.row } : autoTargetFor(cardId);
            };

            // Повтор последнего заклинания врага (общий код для «Горящих рун»
            // в aiPlay и руны-ловушки): эффект бесплатно, затем сжигание.
            A.enemyReplayLast = function enemyReplayLast() {
                const last = B.lastSpell.e;
                if (!last || last === "str25" || !CARDS[last]
                    || CARDS[last].type !== "spell") return false;
                enemyCastSpellEffect(CARDS[last], true);
                if (CARDS[last].spell.drainAll) B.eEnergy = 0;
                for (const zone of [B.eHand, B.eDeck, B.eDiscard]) {
                    const i = zone.indexOf(last);
                    if (i >= 0) { zone.splice(i, 1); break; }
                }
                floatText(960, 500, `🔥 ${GAME_LOC.t(`card.${last}.name`)}`, 0xffb26e);
                return true;
            };
            // «Берсерк N» («Двойная атака»): бейдж «×(N+1)» на жетоне зеркально
            // метке «Огненного дыхания»; в марш своего хода существо атакует
            // N дополнительных раз и платит за каждую 1 жизнью (см. marchSide)
            A.addBerserk = function addBerserk(u, n) {
                u.berserk = (u.berserk || 0) + n;
                let mark = u.node.getChildByName("berserkMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "berserkMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x8a2f1e });
                    g.stroke({ width: 3, color: 0xffd98c });
                    mark.addChild(g);
                    const tx = T("", 17, 0xffe9b0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(-36, -54);
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = `×${u.berserk + 1}`;
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 66, `⚔×${u.berserk + 1}`, 0xffb26e);
            };

            A.redrawTraps = function redrawTraps() {
                const layer = root.trapLayer;
                layer.removeChildren().forEach((n) => n.destroy({ children: true }));
                    for (const side of ["p", "e"]) {
                        B.traps[side].forEach((tr) => {
                            // мина — «?» прямо на заминированной клетке; руна —
                            // над существом, на котором висит
                            let p = null;
                            if (tr.unit) {
                                if (!B.units.includes(tr.unit)) return; // снимут в removeUnit
                                p = cellXY(tr.unit.col, tr.unit.row);
                                p.y -= 44;
                            } else p = cellXY(tr.col, tr.row);
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
                            c.position.set(p.x, p.y);
                            layer.addChild(c);
                        });
                    }
            };

            // ── «Стена костров» (str21) ────────────────────────────────────────
            // Ряд клетки горит effects/fire.png; в конце каждого хода ВЛАДЕЛЬЦА
            // (включая ход каста) все существа и строения ряда получают 2 урона
            // (+ аура алтаря). У каждого каста свой счётчик ходов (left).
            A.redrawFirewalls = function redrawFirewalls() {
                root.fireLayer.removeChildren().forEach((n) => n.destroy({ children: true }));
                for (const f of B.firewalls) {
                    for (let col = 0; col < GRID; col++) {
                        const rc = cellRect(col, f.row);
                        const sp = new PIXI.Sprite(uiTex("effects/fire.png"));
                        sp.anchor.set(0.5);
                        sp.scale.set(Math.min(rc.w / sp.texture.width, rc.h / sp.texture.height));
                        sp.position.set(rc.x + rc.w / 2, rc.y + rc.h / 2);
                        sp.eventMode = "none"; // эффект поля не ест клики
                        root.fireLayer.addChild(sp);
                    }
                }
            };
            A.firewallTick = function firewallTick(side) {
                if (!B.firewalls || !B.firewalls.length) return;
                // стена — эффект заклинания: «Защита от заклинаний» бережёт
                for (const f of B.firewalls) {
                    if (f.side !== side) continue;
                    A.spellCasting = true;
                    for (const v of B.units.slice()) {
                        if (v.row !== f.row || !B.units.includes(v)) continue;
                        damageUnit(v, f.dmg + altarBonus(side), null, "rocket");
                    }
                    A.spellCasting = false;
                    f.left -= 1;
                }
                const keep = B.firewalls.filter((f) => f.left > 0);
                if (keep.length !== B.firewalls.length) { B.firewalls = keep; redrawFirewalls(); }
                refreshHud();
                checkEnd();
            };
        }
    };
})();
