// СЦЕНА «АРЕНА»: хуки атак и разовые эффекты — что происходит ПОСЛЕ удара
// (сокрушение, всплески, наложение яда/льда), спецудары (лучники, волки,
// гроза), отражение/пузырь, сбросы и руны.
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
                heroElementalDraw(attacker); // «Сонм духов»: способность элементаля
            };
            // «Древоброд глухой чащи» (grw31): при атаке урон атаки получают
            // ВСЕ существа и постройки по соседству (верт/гориз) с САМИМ
            // древобродом. Атакованная цель исключена — ей уже достался удар;
            // сам древоброд от собственного всплеска не страдает.
            // «Древоброд глухой чащи» (grw31): при атаке урон атаки получают
            // ВСЕ существа и постройки по соседству (верт/гориз) с САМИМ
            // древобродом. Атакованная цель исключена — ей уже достался удар;
            // сам древоброд от собственного всплеска не страдает.
            A.thicketSplash = function thicketSplash(attacker, target) {
                if (!attacker || !attacker.def || !attacker.def.thicket
                    || !B.units.includes(attacker)) return;
                // «Пастух росянок»: всплеск — способность Растения, бьёт дважды
                const times = 1 + (attacker.def.plant ? plantEcho(attacker.side) : 0);
                for (let t = 0; t < times; t++) {
                    for (const v of B.units.slice()) {
                        if (v === attacker || v === target || !B.units.includes(v)) continue;
                        if (Math.abs(v.col - attacker.col) + Math.abs(v.row - attacker.row) !== 1) continue;
                        damageUnit(v, attacker.curAtk, attacker, "sword");
                    }
                }
            };
            // «Круговая атака» (grw34): цель наносит 1 урон каждому соседу
            // (верт/гориз) — существам и постройкам обеих сторон (фикс 1,
            // аура алтаря не добавляется)
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
            // «Ядовитость N» («Отравленные лезвия» grw29): атака по существу
            // противника вешает на него «Яд» N (свой яд не расплёскивается,
            // постройки не травятся)
            A.venomApply = function venomApply(attacker, target) {
                if (!attacker || !(attacker.venom > 0) || !B.units.includes(attacker)) return;
                if (!target || target.def.type !== "unit" || target.side === attacker.side
                    || !B.units.includes(target)) return;
                addPoison(target, attacker.venom);
            };

            // «Снежный элементаль» (wis90): после его атаки по существу
            // противника цель получает −1 к урону навсегда (bonusAtk, как
            // «Слабость»; recalcAuras клампит урон в 0). Постройки не
            // трогаем — у них нет урона, а «существо противника» в тексте.

            // «Снежный элементаль» (wis90): после его атаки по существу
            // противника цель получает −1 к урону навсегда (bonusAtk, как
            // «Слабость»; recalcAuras клампит урон в 0). Постройки не
            // трогаем — у них нет урона, а «существо противника» в тексте.
            A.frostAttack = function frostAttack(attacker, target) {
                if (!attacker || !attacker.def || !attacker.def.frostAttack
                    || !B.units.includes(attacker)) return;
                if (!target || target.def.type !== "unit" || target.side === attacker.side
                    || !B.units.includes(target)) return;
                target.bonusAtk = (target.bonusAtk || 0) - 1;
                recalcAuras();
                const p = cellXY(target.col, target.row);
                floatText(p.x, p.y - 39, "−1⚔", 0x8cd0ef);
                fxEvent("ice", { x: p.x, y: p.y - 12, scale: 0.72 });
                punch(target.node);
                sfx("aqua");
                heroElementalDraw(attacker); // «Сонм духов»: способность элементаля
            };

            // «Старший ледовик» (wis95): после атаки — «Заморожен 1» существам
            // СЛЕВА И СПРАВА от САМОГО ЛЕДОВИКА (только клетки его ряда).
            // Позиция цели роли не играет. Замораживаются любые существа —
            // в тексте карты нет «ваших» или «противника»; постройки не
            // морозятся (addFrozen их пропускает). Сторона атакующего —
            // владелец эффекта для способности героя «Ледяная суета».

            // «Старший ледовик» (wis95): после атаки — «Заморожен 1» существам
            // СЛЕВА И СПРАВА от САМОГО ЛЕДОВИКА (только клетки его ряда).
            // Позиция цели роли не играет. Замораживаются любые существа —
            // в тексте карты нет «ваших» или «противника»; постройки не
            // морозятся (addFrozen их пропускает). Сторона атакующего —
            // владелец эффекта для способности героя «Ледяная суета».
            A.frostNeighbors = function frostNeighbors(attacker) {
                if (!attacker || !attacker.def || !attacker.def.frostNeighbors
                    || !B.units.includes(attacker)) return;
                for (const dc of [-1, 1]) {
                    const v = unitAt(attacker.col + dc, attacker.row);
                    if (v && v !== attacker) addFrozen(v, 1, attacker.side);
                }
                heroElementalDraw(attacker); // «Сонм духов»: способность элементаля
            };

            // «Вампир» (dec132, просил юзер): после атаки (существом или по
            // базе) получает 1 жизнь; вызывается из всех точек атаки рядом
            // с остальными хуками (сокрушение/чаща/яд/руна)
            A.vampireHeal = function vampireHeal(u) {
                if (!u || !u.def || !u.def.vampHeal || !B.units.includes(u)) return;
                healUnit(u, u.def.vampHeal);
            };

            // «Выросшие духи» (wis96): после перемещения разыгрывает ловушку
            // из руки владельца на пустую соседнюю (верт/гориз) клетку БЕЗ
            // траты энергии. Берётся первая подходящая ловушка руки: руна и
            // «Призрачные споры» вешаются на существо — им нужна не пустая
            // клетка, поэтому они пропускаются. Клетка — без существа и без
            // своей ловушки (веер «?» не плодим); приоритет — клетка впереди
            // по маршу, затем бока, затем тыл.

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
            // Гоблин-ловушка (приманка) ставится как ловушка: клетка без
            // своей ловушки (лимита ловушек нет).

            // «Гоблинская приманка»: существо врага, шагающее С КЛЕТКИ, соседней
            // с ловушкой, сходит на клетку приманки вместо намеченной — и получает
            // 1 урона. Приманка одноразовая; занятая клетка приманки не манит.
            A.lureRedirect = function lureRedirect(u, fromCol, fromRow, toCol, toRow) {
                // «Водный элементаль» (wis82) на приманку не ведётся;
                // «Дух реки» (wis112) тоже: перенаправление и урон — эффект
                // приманки, а он отменяет эффекты активируемых им ловушек
                if (u.def.ability === "noTraps" || u.def.trapCancel) return [toCol, toRow];
                const foe = u.side === "p" ? "e" : "p";
                const i = B.traps[foe].findIndex((tr) => tr.def.trap.effect === "lure"
                    && Math.abs(tr.col - fromCol) + Math.abs(tr.row - fromRow) === 1
                    && !unitAt(tr.col, tr.row));
                if (i < 0) return [toCol, toRow];
                const trap = B.traps[foe].splice(i, 1)[0];
                redrawTraps();
                trapTriggered(foe); // «Зимние духи»/«Путь воды»: сработала приманка
                const p = cellXY(trap.col, trap.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                damageUnit(u, trap.def.trap.dmg + altarBonus(foe), null, "acid");
                return [trap.col, trap.row];
            };

            // Перемещение завершилось: ловушка врага на этой клетке срабатывает,
            // затем «Выстрел 1» лучника (перемещение состоялось)

            // Перемещение завершилось: ловушка врага на этой клетке срабатывает,
            // затем «Выстрел 1» лучника (перемещение состоялось)
            A.afterMoved = function afterMoved(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                triggerCellTraps(u);
                moatAct(u); // «Крепостной ров» (Честь): подошёл к постройке — 1 урона
                roadPushAct(u); // «Тракт» (Честь): соседняя постройка гонит вперёд
                edgeStoneAct(u); // «Краевой камень» (Честь): ряд камня — вынос вперёд
                if (u.def.ability === "archer") {
                    // «Выстрел N» — способность существа: герой-релей
                    // («Отряд соседа») может разрешить её дважды
                    honorRelayAct(u, () => { archerShot(u); return true; });
                    if (u.def.shotRetreat) shotRetreatAct(u); // Баллиста: откат после выстрела(-ов)
                }
                trapOnMoveAct(u); // «Выросшие духи»: ловушка из руки на соседнюю клетку
                labyrinthAct(u); // «Мистический лабиринт»: дошёл до базы — перенос к постройке
                honorRelayAct(u, () => chaplainHeal(u)); // «Капеллан» (Честь): после перемещения лечит соседа
                // руна/споры на существе ездят вместе с ним: маркер «?» и его
                // точка наведения (tr.__mx/__my) должны переехать на новую клетку
                if (B.traps.p.some((tr) => tr.unit === u)
                    || B.traps.e.some((tr) => tr.unit === u)) redrawTraps();
            };

            // «Крепостной ров» (hon175, просил юзер): существо противника,
            // вставшее ПОСЛЕ ПЕРЕМЕЩЕНИЯ на клетку по соседству (верт/гориз)
            // с ЛЮБОЙ постройкой владельца (ров сам — тоже постройка),
            // теряет 1 жизнь. Один раз за перемещение, даже если соседних
            // построек несколько (текст карты — «теряет 1 жизнь»). Урон —
            // штатный damageUnit: «Защита» существа его режет.
            A.moatAct = function moatAct(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                const near = B.units.some((b) => b.side !== u.side && b.def.moat
                    && Math.abs(b.col - u.col) + Math.abs(b.row - u.row) === 1);
                if (!near) return;
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 66, "−1♥", 0xef9f8c);
                damageUnit(u, 1, null, "dam");
            };

            // «Краевой камень» (hon174, просил юзер): существо противника,
            // переместившееся на клетку в одном ГОРИЗОНТАЛЬНОМ ряду с камнем,
            // переносится на пустую клетку ПЕРЕД камнем (сторона противника
            // владельца). Своих камень не трогает; клетка занята или за краем
            // — эффекта нет. Перенос — перемещение: ловушки новой клетки
            // срабатывают (как у «Лабиринта»); призыв не триггерит —
            // edgeStoneAct зовётся только из afterMoved.
            A.edgeStoneAct = function edgeStoneAct(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                for (const b of B.units) {
                    if (!b.def.edgeStone || b.side === u.side
                        || !B.units.includes(b)) continue;
                    if (b.row !== u.row) continue;
                    const nr = b.row + (b.side === "p" ? -1 : 1); // перед камнем
                    if (nr < 0 || nr >= GRID || unitAt(b.col, nr)) continue;
                    u.col = b.col;
                    u.row = nr;
                    const p = cellXY(u.col, u.row);
                    glide(u, p.x, p.y);
                    fxEvent("cast", { x: p.x, y: p.y - 24, color: 0xcfc7b0 });
                    sfx("chpoc");
                    triggerCellTraps(u); // перенесли на ловушку — она срабатывает
                    return; // один камень за перемещение
                }
            };

            // «Лечение N» (hon163 Капеллан, просил юзер): после перемещения
            // этого существа одно СЛУЧАЙНОЕ соседнее (верт/гориз) существо
            // его стороны получает +N жизни (само себя не лечит; соседей
            // нет или капеллан погиб по пути — эффекта нет). Постройки
            // соседями не считаются («существо»). Работает у обеих сторон.
            // Возвращает true, если полечил (герой-релей: «дважды» —
            // флаг не тратится на несработавшее лечение).
            A.chaplainHeal = function chaplainHeal(u) {
                if (!u || u.def.ability !== "healMove"
                    || !B.units.includes(u) || u.def.type !== "unit") return false;
                const n = u.def.abilityVal || 1;
                const allies = [];
                for (const v of B.units) {
                    if (v === u || v.side !== u.side || v.def.type !== "unit") continue;
                    if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1)
                        allies.push(v);
                }
                if (!allies.length) return false;
                const target = allies[(Math.random() * allies.length) | 0];
                healUnit(target, n);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 88, "♥", 0x9fd489);
                return true;
            };

            // «Тракт» (hon171, просил юзер): когда существо владельца после
            // перемещения оказывается по соседству (верт/гориз) с этой
            // постройкой, оно едет вперёд, пока перед ним остаётся свободная
            // клетка (занятая/край поля — стоп). Чужих постройка не гонит;
            // призыв (не перемещение) не триггерит — roadPushAct зовётся
            // только из afterMoved. Доехав, существо наступает на ловушку
            // конечной клетки (это тоже перемещение, как у «Лабиринта»).
            A.roadPushAct = function roadPushAct(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                const near = B.units.some((b) => b.def.roadPush && b.side === u.side
                    && Math.abs(b.col - u.col) + Math.abs(b.row - u.row) === 1);
                if (!near) return;
                const dir = u.side === "p" ? -1 : 1;
                let moved = false;
                for (;;) {
                    const nr = u.row + dir;
                    if (nr < 0 || nr >= GRID || unitAt(u.col, nr)) break;
                    u.row = nr;
                    moved = true;
                }
                if (!moved) return;
                const p = cellXY(u.col, u.row);
                glide(u, p.x, p.y);
                setWalk(u, true);
                sfx("step");
                triggerCellTraps(u); // доехал до ловушки — она срабатывает
            };

            // «Мистический лабиринт» (wis117): существо ПОДОШЛО (маршем/шагом)
            // на клетку рядом с базой владельца постройки — переносится на
            // случайную пустую клетку по соседству (верт/гориз) с постройкой
            // (спека юзера). Призыв на клетку у базы перенос не триггерит:
            // afterMoved зовётся только на перемещения. Пустых соседей нет —
            // перенести некуда, существо остаётся. После переноса ловушки на
            // новой клетке срабатывают (это тоже перемещение).

            // «Мистический лабиринт» (wis117): существо ПОДОШЛО (маршем/шагом)
            // на клетку рядом с базой владельца постройки — переносится на
            // случайную пустую клетку по соседству (верт/гориз) с постройкой
            // (спека юзера). Призыв на клетку у базы перенос не триггерит:
            // afterMoved зовётся только на перемещения. Пустых соседей нет —
            // перенести некуда, существо остаётся. После переноса ловушки на
            // новой клетке срабатывают (это тоже перемещение).
            A.labyrinthAct = function labyrinthAct(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                for (const b of B.units) {
                    if (!b.def.labyrinth) continue;
                    // база игрока — за нижним рядом (GRID-1), врага — за верхним (0)
                    if (u.row !== (b.side === "p" ? GRID - 1 : 0)) continue;
                    const spots = [];
                    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const c2 = b.col + dc, r2 = b.row + dr;
                        if (c2 < 0 || c2 >= GRID || r2 < 0 || r2 >= GRID) continue;
                        if (unitAt(c2, r2)) continue;
                        spots.push([c2, r2]);
                    }
                    if (!spots.length) continue; // кругом занято — не переносим
                    const [nc, nr] = spots[(Math.random() * spots.length) | 0];
                    u.col = nc;
                    u.row = nr;
                    const p = cellXY(nc, nr);
                    glide(u, p.x, p.y);
                    fxEvent("cast", { x: p.x, y: p.y - 24, color: 0x8c9ef0 });
                    sfx("chpoc");
                    floatText(p.x, p.y - 72,
                        GAME_LOC.t("wisdom.labyrinthMove"), 0x8cd0ef);
                    refreshHud();
                    triggerCellTraps(u); // перенесли на ловушку — она срабатывает
                    return; // одна постройка за перемещение
                }
            };

            // «Болотная слизь» (wis116): когда ЛЮБАЯ карта уходит в сброс
            // (рука/колода/потраченное заклинание/излишек руки) — каждая
            // слизь на поле получает +1 к урону (спека юзера). Зовётся из
            // ВСЕХ точек сброса (B.discard/B.eDiscard.push); смерть существ
            // сбросом не считается (removeUnit карту не отдаёт). n — сколько
            // карт ушло разом (гримуар/путешествие сбрасывают пачками);
            // side/ids — чьи и какие карты ушли в сброс: их запоминают
            // «Проклятые артефакты» (dec138) и за них бьёт «Дурное варево»
            // (dec139). Сгоревшие «Сожжением» карты в ids не попадают.
            // «Болотная слизь» (wis116): когда ЛЮБАЯ карта уходит в сброс
            // (рука/колода/потраченное заклинание/излишек руки) — каждая
            // слизь на поле получает +1 к урону (спека юзера). Зовётся из
            // ВСЕХ точек сброса (B.discard/B.eDiscard.push); смерть существ
            // сбросом не считается (removeUnit карту не отдаёт). n — сколько
            // карт ушло разом (гримуар/путешествие сбрасывают пачками).
            // Сброс «карты с руки» эффектом карты (dec145 «Разложение»,
            // dec146 «Восставший нетопырь»): авто, наименее ценная по
            // aiCardPower — как upkeep-сброс «Дурного варева» (панель
            // выбора заморозила бы анимации боя). exceptId — карта в
            // процессе розыгрыша (себя не сбрасываем); пустая рука —
            // эффекта нет; сгоревшая «Сожжением» сбросом не считается
            A.discardWeakest = function discardWeakest(side, exceptId) {
                if (!B) return;
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const scorch = B.scorch[side];
                let wi = -1, ws = Infinity;
                for (let i = 0; i < hand.length; i++) {
                    if (hand[i] === exceptId) continue;
                    const pv = aiCardPower(CARDS[hand[i]]);
                    if (pv < ws) { ws = pv; wi = i; }
                }
                if (wi < 0) return;
                const id = hand.splice(wi, 1)[0];
                if (scorch && scorch.has(id)) {
                    scorch.delete(id);
                    floatText(960, side === "p" ? 840 : 240,
                        `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                } else {
                    discard.push(id);
                    noteDiscard(1, side, [id]);
                    const p = side === "p" ? { x: 960, y: 840 } : { x: 960, y: 240 };
                    floatText(p.x, p.y, "⤓ " + GAME_LOC.t(`card.${id}.name`), 0xc9b98c);
                }
                if (side === "p") layoutHand();
                refreshHud();
            };
            // Возврат карты по способности «Сброс разума» (decMind): карта,
            // помеченная B.discardReplay {side, id}, вынимается из сброса
            // СВОЕЙ стороны в руку (одна и та же карта может лежать в сбросах
            // обеих сторон — сторону знает метка, а не поиск по сбросам).
            // Зовётся из noteDiscard (заклинания: карта выходит в сброс
            // ПОСЛЕ своего эффекта) и из точки постановки юнита игроком
            // (карта выходит в сброс ДО эффекта dec146 — см. onCellTap)
            A.discardReplayReturn = function discardReplayReturn(side, cardId) {
                if (!B || !B.discardReplay || B.discardReplay.id !== cardId) return;
                B.discardReplay = null;
                const disc = side === "p" ? B.discard : B.eDiscard;
                const i = disc.indexOf(cardId);
                if (i < 0) return;
                disc.splice(i, 1);
                if (side === "p") {
                    markFlyFrom(cardId, side); // прилетит из сброса (анимации руки)
                    B.hand.push(cardId);
                    layoutHand();
                } else B.eHand.push(cardId);
                const p = side === "p" ? { x: 960, y: 840 } : { x: 960, y: 240 };
                floatText(p.x, p.y, "↩ " + GAME_LOC.t(`card.${cardId}.name`), 0xb7d0ef);
                sfx("up");
                refreshHud();
            };
            // «Скелет послушника» (dec148): после появления разыгрывает
            // СЛУЧАЙНУЮ карту заклинания стоимостью ≤maxCost из СВОЕГО
            // сброса — бесплатно (энергия не тратится, карта остаётся
            // в сбросе). Панельные заклинания и сжигатели энергии (Огнешар/
            // Гроза) — ТОЖЕ (просил юзер): у врага их исполняет его движок
            // (enemyCastSpellEffect), у игрока открывается штатная панель
            // выбора; сжигатели жгут энергию и в бесплатном касте — как
            // в повторе «Горящих рун». Не берём только «Горящие руны»:
            // ветки повтора в движках прямого каста нет. Цель — авто:
            // врагу хватает его движка, игроку — applySpellP с
            // acolyteTargetFor (вредоносные — в лучшего чужого, остальное —
            // автоцель повтора «Горящих рун»)
            A.acolyteTargetFor = function acolyteTargetFor(cardId) {
                const d = CARDS[cardId];
                const s = d.spell;
                // вредоносные anyUnit-заклинания autoTargetFor наведёт на
                // СВОЕГО лучшего — послушник должен бить чужого
                if (s.target === "anyUnit" && (s.poison || s.destroy || s.debuffAtk
                    || s.bounce || s.hydroPunch || s.iceStrike)) {
                    if (s.iceStrike) {
                        const pick = iceStrikePick("p");
                        return pick ? { col: pick.unit.col, row: pick.unit.row } : null;
                    }
                    const foes = spellTargets(B.units
                        .filter((v) => v.side !== "p" && v.def.type === "unit"));
                    if (!foes.length) return null;
                    const best = s.poison
                        ? foes.slice().sort((a, b) => (b.hp - a.hp) || (b.curAtk - a.curAtk))[0]
                        : foes.slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.hp - a.hp))[0];
                    return { col: best.col, row: best.row };
                }
                return autoTargetFor(cardId);
            };
            A.acolyteCast = function acolyteCast(side, maxCost) {
                if (!B) return false;
                const pile = side === "p" ? B.discard : B.eDiscard;
                const cands = [];
                const seen = {};
                for (const id of pile) {
                    if (seen[id]) continue;
                    seen[id] = 1;
                    const d = CARDS[id];
                    if (!d || d.type !== "spell" || (d.cost || 0) > maxCost) continue;
                    if (d.spell.copyLast) continue; // повтора в движках каста нет
                    cands.push(id);
                }
                if (!cands.length) return false;
                for (let i = cands.length - 1; i > 0; i--) { // случайный порядок
                    const j = (Math.random() * (i + 1)) | 0;
                    [cands[i], cands[j]] = [cands[j], cands[i]];
                }
                for (const id of cands) {
                    if (side === "e") {
                        if (!aiSpellPlayable(CARDS[id])) continue;
                        enemyCastSpellEffect(CARDS[id], true); // авто-цели ИИ
                        // Огнешар/Гроза сжигают энергию и бесплатным кастом
                        if (CARDS[id].spell.drainAll || CARDS[id].spell.stormAll)
                            B.eEnergy = 0;
                        refreshHud();
                        return true;
                    }
                    const t = acolyteTargetFor(id);
                    if (t === null && CARDS[id].spell.target !== "none") continue;
                    if (applySpellP(id, t, true)) {
                        fxSpellCast(id, t, "p");
                        if (CARDS[id].spell.drainAll || CARDS[id].spell.stormAll)
                            B.energy = 0;
                        refreshHud();
                        return true;
                    }
                }
                return false;
            };
            // «Взрыв твари» (dec150): своё существо погибает, затем 1 урона
            // столько раз, какова была сумма его ⚔+♥; каждый удар — случайному
            // существу/постройке противника ИЛИ его базе (база в общем пуле)
            A.beastBlastCast = function beastBlastCast(side, u) {
                const n = (u.curAtk || 0) + (u.hp || 0);
                const p = cellXY(u.col, u.row);
                killUnit(u, null);
                floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                floatText(p.x, p.y - 78, "💥" + (n > 1 ? `×${n}` : ""), 0xffb26e);
                const foe = side === "p" ? "e" : "p";
                for (let i = 0; i < n; i++) {
                    const pool = B.units.filter((v) => v.side === foe);
                    // база — равноправная цель в пуле с существами/постройками
                    if (!pool.length
                        || Math.random() * (pool.length + 1) >= pool.length) {
                        damageBase(foe, 1, side === "p"
                            ? { x: 960, y: 60, fill: 0xff8f6e }
                            : { x: 960, y: 840, fill: 0xff5f4e });
                    } else {
                        const t = pool[(Math.random() * pool.length) | 0];
                        damageUnit(t, 1, null, "rocket");
                    }
                }
                sfx("rocket");
            };
            A.noteDiscard = function noteDiscard(n = 1, side = null, ids = null) {
                if (!B) return;
                // «Сброс разума» (decMind): первая за бой карта стороны, чьим
                // ЭФФЕКТОМ сброшены карты (B.playCtx ставят точки розыгрыша
                // вокруг исполнения эффектов), помечается — и после СВОЕГО
                // выхода в сброс вернётся в руку. Выход самой разыгранной
                // карты (ids из одной неё) эффектом не считается — это как
                // раз момент возврата
                if (B.playCtx && ids && ids.length) {
                    const pc = B.playCtx;
                    const selfOut = ids.length === 1 && ids[0] === pc.cardId;
                    if (!selfOut && !B.heroFlags.discardReplay[pc.side]) {
                        const hd = heroDefOf(pc.side);
                        if (hd && hd.ability === "firstDiscardReplay") {
                            B.heroFlags.discardReplay[pc.side] = true;
                            B.discardReplay = { side: pc.side, id: pc.cardId };
                            const bp = pc.side === "p"
                                ? { x: 960, y: 840 } : { x: 960, y: 240 };
                            floatText(bp.x, bp.y,
                                "↩ " + GAME_LOC.t(`card.${pc.cardId}.name`), 0xb7d0ef);
                        }
                    }
                }
                if (ids && ids.length === 1 && B.discardReplay
                    && B.discardReplay.id === ids[0]) {
                    discardReplayReturn(B.discardReplay.side, ids[0]);
                }
                for (const v of B.units.slice()) {
                    if (!v.def.slimeGain || !B.units.includes(v)) continue;
                    v.bonusAtk = (v.bonusAtk || 0) + n;
                    recalcAuras(); // обновит и бейдж урона
                    const p = cellXY(v.col, v.row);
                    floatText(p.x, p.y - 39, `+${n}⚔`, 0x9fd489);
                    punch(v.node);
                }
                // «Проклятые артефакты» (dec138): СВОЯ сброшенная карта
                // запоминается постройкой (ids — карты, реально ушедшие
                // в сброс; сгоревшие «Сожжением» не считаются)
                if (side && ids && ids.length) for (const v of B.units.slice()) {
                    if (!v.def.relicVault || v.side !== side
                        || !B.units.includes(v)) continue;
                    v.relics = v.relics || [];
                    v.relics.push(...ids);
                    const p = cellXY(v.col, v.row);
                    floatText(p.x, p.y - 60, `⤓ +${ids.length}`, 0xc9b98c);
                }
                // «Дурное варево» (dec139): ЛЮБАЯ сброшенная карта (обе
                // стороны, включая потраченные заклинания) — база противника
                // владельца варева теряет 1 жизнь за каждую карту
                for (const v of B.units.slice()) {
                    if (!v.def.evilBrew || !B.units.includes(v)) continue;
                    const k = ids ? ids.length : n;
                    if (!(k > 0)) continue;
                    damageBase(v.side === "p" ? "e" : "p", k,
                        { x: 960, y: v.side === "p" ? 240 : 840, fill: 0xb07ad5 });
                }
                refreshHud();
            };

            // «Гроза» (wis118): вся оставшаяся энергия (сверх цены, при
            // свободном касте — вся) сгорает; за каждую единицу — 2 урона
            // случайному существу ИЛИ постройке противника, НОВАЯ случайная
            // цель на каждый удар (спека юзера). Бонусы алтаря/героя не
            // добавляются — спека говорит ровно «2 урона за каждую 1».
            // Энергию обнуляет вызывающий путь (как у drainAll: castSpell,
            // aiPlay, руна, повторы — все гасят по флагу stormAll).

            // «Гроза» (wis118): вся оставшаяся энергия (сверх цены, при
            // свободном касте — вся) сгорает; за каждую единицу — 2 урона
            // случайному существу ИЛИ постройке противника, НОВАЯ случайная
            // цель на каждый удар (спека юзера). Бонусы алтаря/героя не
            // добавляются — спека говорит ровно «2 урона за каждую 1».
            // Энергию обнуляет вызывающий путь (как у drainAll: castSpell,
            // aiPlay, руна, повторы — все гасят по флагу stormAll).
            A.stormStrike = function stormStrike(side, cardId, free = false) {
                const cost = free ? 0 : effCost(cardId, side);
                const strikes = Math.max(0, (side === "p" ? B.energy : B.eEnergy) - cost);
                for (let n = 0; n < strikes; n++) {
                    const targets = spellTargets(B.units.filter((v) => v.side !== side));
                    if (!targets.length) break; // целей нет — энергия всё равно сгорает
                    const t = targets[(Math.random() * targets.length) | 0];
                    const p = cellXY(t.col, t.row);
                    fxEvent("impact", { x: p.x, y: p.y - 24, color: 0xffe28a,
                        power: 0.75 });
                    punch(t.node);
                    damageUnit(t, 2, null, "dam");
                }
                if (strikes > 0) sfx("rocket");
                refreshHud();
                checkEnd();
                return strikes;
            };

            // «Отражение» (wis120): заклинание противника, выбранное целью
            // в СУЩЕСТВО владельца ловушки, летит в случайное существо
            // противника (спека юзера). Постройки не ловятся («вашего
            // существа»); у противника нет существ — ловушка не тратится,
            // заклинание идёт по исходной цели. Возвращает новую цель
            // (или исходный u). Зовётся ДО применения эффекта: у игрока —
            // на входе applySpellPInner, у ИИ — в ветках
            // enemyCastSpellEffectInner после выбора best-цели.

            // «Отражение» (wis120): заклинание противника, выбранное целью
            // в СУЩЕСТВО владельца ловушки, летит в случайное существо
            // противника (спека юзера). Постройки не ловятся («вашего
            // существа»); у противника нет существ — ловушка не тратится,
            // заклинание идёт по исходной цели. Возвращает новую цель
            // (или исходный u). Зовётся ДО применения эффекта: у игрока —
            // на входе applySpellPInner, у ИИ — в ветках
            // enemyCastSpellEffectInner после выбора best-цели.
            A.reflectAim = function reflectAim(defenderSide, u) {
                if (!u || !B.units.includes(u) || u.side !== defenderSide
                    || u.def.type !== "unit") return u;
                const i = B.traps[defenderSide].findIndex((t) =>
                    t.def.trap && t.def.trap.effect === "reflectSpell");
                if (i < 0) return u;
                const caster = defenderSide === "p" ? "e" : "p";
                const pool = B.units.filter((v) => v.side === caster
                    && v.def.type === "unit" && spellAimable(v));
                if (!pool.length) return u;
                B.traps[defenderSide].splice(i, 1);
                redrawTraps();
                trapTriggered(defenderSide); // «Зимние духи»/«Путь воды»
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "?!", 0xe08cd0);
                fxEvent("trap", { x: p.x, y: p.y - 8, scale: 0.9 });
                sfx("mine");
                trapEchoOnce(defenderSide); // «Роща лоз»: флаг тратится —
                // повторять перенаправление нечего (одна цель на заклинание)
                return pool[(Math.random() * pool.length) | 0];
            };

            // «Ловушка-пузырь» (wis119): существо под пузырём запрещает
            // СВОЕЙ стороне играть карту призыва того же существа, пока оно
            // на поле (спека юзера). Юнит удалён (смерть/Смыв/база) — запрет
            // снят: флаг живёт на юните.

            // «Ловушка-пузырь» (wis119): существо под пузырём запрещает
            // СВОЕЙ стороне играть карту призыва того же существа, пока оно
            // на поле (спека юзера). Юнит удалён (смерть/Смыв/база) — запрет
            // снят: флаг живёт на юните.
            A.bubbleBlocked = function bubbleBlocked(side, cardId) {
                return B.units.some((v) => v.side === side && v.bubbleBlock
                    && cardIdOf(v.def) === cardId);
            };
            // Ловушки на клетке: «Гоблинская мина» (взрыв 3+1 по соседям),
            // «Гоблинская засада» (выход гоблинов стороны-хозяйки), «Дух
            // предка» (явление Медведя перед ловушкой). Срабатывают, когда
            // вражеское существо призвано или переместилось на её клетку.
            // «Роща лоз» (trapEcho, просил юзер): первая сработавшая в бою
            // ловушка стороны применяет свой эффект дополнительный раз.
            // Возвращает true один раз за бой; флаг тратится на первом
            // срабатывании, даже если повторять эффект не по кому.

            // «Выстрел N» (Гоблинский лучник — 1, Скелет-лучник dec135 — 2):
            // после перемещения — N урона ближайшему существу или строению
            // впереди по вертикали (любой стороны); если вертикаль перед ним
            // пуста — N урона базе противника. «Паровой стрелятель» (tim214)
            // стреляет тем же выстрелом при прибытии из «Сдвига» (def.steamShot)
            A.archerShot = function archerShot(u) {
                if (!B.units.includes(u)
                    || (u.def.ability !== "archer" && !u.def.steamShot)) return;
                const dmg = u.def.shotDmg || 1;
                const dir = u.side === "p" ? -1 : 1;
                for (let r = u.row + dir; r >= 0 && r < GRID; r += dir) {
                    const o = unitAt(u.col, r);
                    if (o) {
                        damageUnit(o, dmg, u, "dam");
                        refreshHud();
                        checkEnd();
                        return;
                    }
                }
                sfx("crash");
                damageBase(u.side === "p" ? "e" : "p", dmg,
                    u.side === "p"
                        ? { x: cellXY(u.col, 0).x, y: cellXY(u.col, 0).y - 15, fill: 0xff8f6e }
                        : { x: cellXY(u.col, GRID - 1).x, y: cellXY(u.col, GRID - 1).y + 15, fill: 0xff5f4e });
                refreshHud();
                checkEnd();
            };

            // «Осадная башня» (hon188): «Выстрел 1» после перемещения
            // (следования за своим существом). Выстрел в ПОСТРОЙКУ ПРОТИВНИКА
            // уничтожает её сразу (спека юзера); иная цель (существо, своя
            // постройка) — обычный урон; пустая вертикаль — 1 базе противника
            // (как у лучника).
            A.siegeShot = function siegeShot(u) {
                if (!B.units.includes(u) || !u.def.siegeShot) return;
                const dmg = u.def.shotDmg || 1;
                const dir = u.side === "p" ? -1 : 1;
                for (let r = u.row + dir; r >= 0 && r < GRID; r += dir) {
                    const o = unitAt(u.col, r);
                    if (!o) continue;
                    if (o.side !== u.side && o.def.type === "building") {
                        const sp = cellXY(o.col, o.row);
                        floatText(sp.x, sp.y - 66, "✖", 0xffb26e);
                        killUnit(o, u);
                    } else damageUnit(o, dmg, u, "dam");
                    refreshHud();
                    checkEnd();
                    return;
                }
                sfx("crash");
                damageBase(u.side === "p" ? "e" : "p", dmg,
                    u.side === "p"
                        ? { x: cellXY(u.col, 0).x, y: cellXY(u.col, 0).y - 15, fill: 0xff8f6e }
                        : { x: cellXY(u.col, GRID - 1).x, y: cellXY(u.col, GRID - 1).y + 15, fill: 0xff5f4e });
                refreshHud();
                checkEnd();
            };

            // «Баллиста» (hon184): после выстрела откатывается на клетку назад
            // (к своей базе), если та в поле и свободна; наступила на чужую
            // ловушку — она срабатывает (это тоже перемещение). Откат — часть
            // «Выстрела», не отдельная способность: герой-релей дублирует
            // выстрел, откат после него один.
            A.shotRetreatAct = function shotRetreatAct(u) {
                if (!B.units.includes(u) || u.def.type !== "unit") return;
                const back = u.row + (u.side === "p" ? 1 : -1);
                if (back < 0 || back >= GRID || unitAt(u.col, back)) return;
                u.row = back;
                u.node.zIndex = u.row;
                const p = cellXY(u.col, u.row);
                glide(u, p.x, p.y);
                setWalk(u, true);
                sfx("step");
                triggerCellTraps(u);
            };

            // «Атака духами волков» (grw33): выбранное существо делает Выстрел —
            // урон атаки вперёд по вертикали ближайшему существу или строению
            // (любой стороны, как у лучника), а если вертикаль пуста — базе
            // противника. На всех пустых клетках пути являются Волки 2/4
            // стороны кастовавшего (штатный addUnit: ауры/монолит/сестра работают)

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


            // Случайный сброс N карт с руки стороны (Пытка разума, dec125):
            // карты под «Сожжением» сгорают (как при сбросе панели переполнения),
            // сброс кормит «Болотную слизь» (noteDiscard). Возвращает число карт.
            A.randomDiscard = function randomDiscard(side, n) {
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const scorch = B.scorch[side];
                let dropped = 0, burned = 0;
                const droppedIds = [];
                for (let k = 0; k < n && hand.length; k++) {
                    const id = hand.splice((Math.random() * hand.length) | 0, 1)[0];
                    if (scorch && scorch.has(id)) { scorch.delete(id); burned++; }
                    else { discard.push(id); dropped++; droppedIds.push(id); }
                }
                if (dropped) noteDiscard(dropped, side, droppedIds);
                floatText(960, side === "p" ? 640 : 300,
                    `✧ −${dropped + burned}`, 0x8cd0ef);
                sfx("chpoc");
                if (side === "p") layoutHand();
                refreshHud();
                return dropped + burned;
            };
            // Существа в сбросе стороны (панель «Поднятие мёртвых» + гейт ИИ)
            // Существа в сбросе стороны (панель «Поднятие мёртвых» + гейт ИИ)
            A.unitsInDiscard = function unitsInDiscard(side) {
                const disc = side === "p" ? B.discard : B.eDiscard;
                return disc.filter((id) => CARDS[id] && CARDS[id].type === "unit");
            };

            // Способность «Хранителя рощи» (buildingDeathReplay, просил юзер):
            // ПЕРВАЯ за бой погибшая постройка стороны-владелицы возвращается —
            // её карта уходит в руку, и она сразу разыгрывается в ту же клетку
            // без траты энергии (штатный addUnit: ауры, ловушки клетки)

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
                const fp = focus ? cellXY(focus.col, focus.row) : { x: 960, y: 540 };
                floatText(fp.x, fp.y - 90, GAME_LOC.t(`card.${pick.id}.name`), 0xffd98c);
                // панельные заклинания (выбор из карт / призыв) авто-розыгрыша
                // не имеют — уходят в руку владельца, разыграет сам за энергию
                if (def.spell.search || def.spell.journey || def.spell.searchUnit
                    || def.spell.seek || def.spell.grim) {
                    hand.push(pick.id);
                    return;
                }
                // «Отмена заклинания» противника: свободный каст руны — тоже
                // розыгрыш заклинания, отменяется (карта руны уходит в сброс)
                if (counterTrapConsume(side === "p" ? "e" : "p", "counterSpell")) {
                    floatText(fp.x, fp.y - 60,
                        "✕ " + GAME_LOC.t(`card.${pick.id}.name`), 0x8cd0ef);
                        noteDiscard(1, side, [pick.id]);
                    discard.push(pick.id);
                    return;
                }
                if (def.spell.copyLast) { // «Горящие руны»: повтор последнего
                    const last = side === "p" ? B.lastSpell.p : B.lastSpell.e;
                    const ok = last && last !== "str25" && CARDS[last]
                        && CARDS[last].type === "spell";
                    if (!ok) { discard.push(pick.id); noteDiscard(1, side, [pick.id]); return; } // повтора нет — впустую
                    if (side === "p") { B.lastSpell.p = "str25"; replaySpell(last); }
                    else { B.lastSpell.e = "str25"; enemyReplayLast(); }
                    afterSpellPlayed();
                    noteDiscard(1, side, [pick.id]);
                    discard.push(pick.id);
                    return;
                }
                if (side === "p") {
                    const rt = runeTargetP(pick.id, focus);
                    applySpellP(pick.id, rt, true);
                    fxSpellCast(pick.id, rt, "p");
                    if (def.spell.drainAll || def.spell.stormAll) B.energy = 0; // огнешар/гроза и бесплатно сжигают энергию
                    B.lastSpell.p = pick.id;
                } else {
                    enemyCastSpellEffect(def, true, focus);
                    if (def.spell.drainAll || def.spell.stormAll) B.eEnergy = 0;
                    B.lastSpell.e = pick.id;
                }
                afterSpellPlayed(); // «Заклинатель клинков» реагирует и на это
                noteDiscard(1, side, [pick.id]);
                discard.push(pick.id);
            };

            // Цель свободного каста у игрока: атакующий (focus), если заклинание
            // может на него целиться, иначе автоцель как у «Горящих рун».
            // «Защита от заклинаний» — общая проверка цели (spellAimable).

            // Цель свободного каста у игрока: атакующий (focus), если заклинание
            // может на него целиться, иначе автоцель как у «Горящих рун».
            // «Защита от заклинаний» — общая проверка цели (spellAimable).
            A.runeTargetP = function runeTargetP(cardId, focus) {
                const s = CARDS[cardId].spell;
                if (s.target === "anyCell" || s.target === "none")
                    return autoTargetFor(cardId);
                if (!focus || !B.units.includes(focus) || !spellAimable(focus))
                    return autoTargetFor(cardId);
                // «Гидроудар» целится и в существ ВРАГА — руна может навести его
                // на атакующего юнита (обычное anyUnit — только на своих)
                const anyUnitOk = s.hydroPunch ? focus.def.type === "unit"
                    : focus.side === "p" && focus.def.type === "unit";
                const ok = s.target === "anyUnit" ? anyUnitOk
                    : s.target === "ownUnit" ? focus.side === "p"
                        && focus.def.type === "unit"
                    : s.target === "anyUnitDmg" ? (focus.def.type === "unit"
                        || (focus.def.type === "building" && !s.noBuildings))
                    : s.target === "enemyAny" ? focus.side !== "p"
                    : false;
                return ok ? { col: focus.col, row: focus.row } : autoTargetFor(cardId);
            };

            // Повтор последнего заклинания врага (общий код для «Горящих рун»
            // в aiPlay и руны-ловушки): эффект бесплатно, затем сжигание.

            // Повтор последнего заклинания врага (общий код для «Горящих рун»
            // в aiPlay и руны-ловушки): эффект бесплатно, затем сжигание.
            A.enemyReplayLast = function enemyReplayLast() {
                const last = B.lastSpell.e;
                if (!last || last === "str25" || !CARDS[last]
                    || CARDS[last].type !== "spell") return false;
                enemyCastSpellEffect(CARDS[last], true);
                if (CARDS[last].spell.drainAll || CARDS[last].spell.stormAll) B.eEnergy = 0;
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
        }
    };
})();
