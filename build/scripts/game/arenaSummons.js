// СЦЕНА «АРЕНА»: ПРИЗЫВЫ-СПУТНИКИ — сателлиты способностей (шаман,
// духозвон, бомблинг, водомаг, иллюзия, сера, озёрная дева, волк друида),
// копирование способностей и «Выкапливание» Мортиса.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installSummons = function installSummons(A) {
        with (A) {

            // «Шаман гоблинов»: после призыва бесплатно разыгрывает случайного
            // Гоблина (цена ≤ 2) из колоды своей стороны на пустую соседнюю
            // (верт/гориз) клетку — карта уходит из колоды прямо на поле.
            // Гоблин-ловушка (приманка) ставится как ловушка: клетка без
            // своей ловушки (лимита ловушек нет).
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
            // как ловушка: клетка без своей ловушки (лимита ловушек нет).

            // «Призыватель духов»: после призыва бесплатно разыгрывает случайного
            // Гоблина из СБРОСА своей стороны (цена ≤ 3) на пустую соседнюю
            // (верт/гориз) клетку — энергия не тратится (просил юзер). Карта
            // уходит из сброса прямо на поле. Ловушка-гоблин (приманка) ставится
            // как ловушка: клетка без своей ловушки (лимита ловушек нет).
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

            // «Водный маг» (wis107): после призыва бесплатно разыгрывает
            // СЛУЧАЙНУЮ ловушку из КОЛОДЫ владельца (цена ≤ 2) на случайную
            // пустую соседнюю (верт/гориз) клетку. Энергия не тратится; карта
            // уходит из колоды в сброс. Руны/споры вешаются на существо — им
            // нужна не пустая клетка, поэтому в выбор не попадают.

            // «Водный маг» (wis107): после призыва бесплатно разыгрывает
            // СЛУЧАЙНУЮ ловушку из КОЛОДЫ владельца (цена ≤ 2) на случайную
            // пустую соседнюю (верт/гориз) клетку. Энергия не тратится; карта
            // уходит из колоды в сброс. Руны/споры вешаются на существо — им
            // нужна не пустая клетка, поэтому в выбор не попадают.
            A.summonWaterMage = function summonWaterMage(u) {
                if (!B.units.includes(u)) return false; // мог умереть от мины при призыве
                const deck = u.side === "p" ? B.deck : B.eDeck;
                const discard = u.side === "p" ? B.discard : B.eDiscard;
                const traps = u.side === "p" ? B.traps.p : B.traps.e;
                const near = [[-1, 0], [1, 0], [0, -1], [0, 1]]
                    .map(([dc, dr]) => [u.col + dc, u.row + dr])
                    .filter(([c2, r2]) => c2 >= 0 && c2 < GRID && r2 >= 0 && r2 < GRID
                        && !unitAt(c2, r2)
                        && !traps.some((tr) => tr.col === c2 && tr.row === r2));
                if (!near.length) return false;
                const picks = deck.map((id, i) => ({ id, i, def: CARDS[id] }))
                    .filter((x) => x.def && x.def.type === "trap" && x.def.cost <= 2
                        && x.def.trap.effect !== "castRandom"
                        && x.def.trap.effect !== "sporeCurse");
                if (!picks.length) return false;
                const pick = picks[(Math.random() * picks.length) | 0];
                const [col, row] = near[(Math.random() * near.length) | 0];
                deck.splice(pick.i, 1);
                discard.push(pick.id);
                noteDiscard(1, u.side, [pick.id]);
                armTrap(u.side, pick.id, col, row);
                const p = cellXY(col, row);
                floatText(p.x, p.y - 66, GAME_LOC.t(`card.${pick.id}.name`), 0x9fd489);
                return true;
            };

            // «Иллюзия» (wis108): после призыва берёт урон и жизни СЛУЧАЙНОГО
            // существа по соседству (верт/гориз, любая сторона). Статы
            // запоминаются на момент призыва; u.illusionOf — связь с
            // источником: его смерть убивает Иллюзию (см. killUnit).

            // «Иллюзия» (wis108): после призыва берёт урон и жизни СЛУЧАЙНОГО
            // существа по соседству (верт/гориз, любая сторона). Статы
            // запоминаются на момент призыва; u.illusionOf — связь с
            // источником: его смерть убивает Иллюзию (см. killUnit).
            A.summonIllusion = function summonIllusion(u) {
                if (!B.units.includes(u)) return false; // мог умереть от мины при призыве
                const near = B.units.filter((v) => v !== u && v.def.type === "unit"
                    && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1);
                if (!near.length) return false; // некого копировать — остаётся 0/0
                const src = near[(Math.random() * near.length) | 0];
                u.illusionOf = src;
                u.bonusAtk = (u.bonusAtk || 0) + src.curAtk;
                u.hp += src.hp; // база 0/0 — итог = статы источника (+ бонусы призыва)
                recalcAuras();
                const an = u.node.getChildByName("atk");
                if (an) an.text = String(u.curAtk);
                const hn = u.node.getChildByName("hp");
                if (hn) hn.text = String(u.hp);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 75, `${u.curAtk}⚔/${u.hp}♥`, 0x8cd0ef);
                sfx("up");
                return true;
            };

            // «Элементаль серы» (wis115): после призыва все соседние (верт/гориз)
            // существа ОБЕИХ сторон теряют 2 урона и 1 жизнь. Урон — постоянная
            // «Слабость» (минус в bonusAtk, клампит recalcAuras); жизнь
            // снимается напрямую (не входящий урон: защита и реакции на удар
            // не срабатывают, как у «Песчаного духа»). На 0♥ сосед погибает.

            // «Элементаль серы» (wis115): после призыва все соседние (верт/гориз)
            // существа ОБЕИХ сторон теряют 2 урона и 1 жизнь. Урон — постоянная
            // «Слабость» (минус в bonusAtk, клампит recalcAuras); жизнь
            // снимается напрямую (не входящий урон: защита и реакции на удар
            // не срабатывают, как у «Песчаного духа»). На 0♥ сосед погибает.
            A.summonSulfur = function summonSulfur(u) {
                if (!B.units.includes(u)) return false; // мог умереть от мины при призыве
                const near = B.units.filter((v) => v !== u && v.def.type === "unit"
                    && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1);
                if (!near.length) return false;
                for (const v of near) {
                    v.bonusAtk = (v.bonusAtk || 0) - 2;
                    v.hp -= 1;
                    const p = cellXY(v.col, v.row);
                    floatText(p.x, p.y - 60, "−2⚔ −1♥", 0xef9f8c);
                    punch(v.node);
                }
                recalcAuras();
                sfx("acid");
                heroElementalDraw(u); // способность элементаля
                for (const v of near.slice()) {
                    if (!B.units.includes(v)) continue; // каскад смерти соседа
                    const an = v.node.getChildByName("atk");
                    if (an) an.text = String(v.curAtk);
                    const hn = v.node.getChildByName("hp");
                    if (hn) hn.text = String(Math.max(0, v.hp));
                    if (v.hp <= 0) killUnit(v, null);
                }
                return true;
            };

            // Способности, которые «Озёрная дева» (wis111) может скопировать
            // у соседнего существа. Статы/подтип/арт/лист не копируются —
            // «способность», а не превращение в другое существо.
            const COPY_UNIT_ABILITY_KEYS = [
                "ability", "waterMage", "illusion", "lakeMaid", "stormer",
                "trapGrow", "trapOnMove", "frostAttack", "frostNeighbors",
                "crush", "thicket", "sandDecay", "leaderAura", "berserkSummon",
                "keeperScale", "energyToStats", "animalCost", "targetDiscount",
                "spellBuffAura", "sisterDraw", "plantEcho", "wolfSummon",
                "trapCancel", "sulfurBurst", "slimeGain",
            ];
            // Копирование способностей в per-unit копию def (как purgeUnit):
            // исходная карта каталога не меняется, cardIdOf узнаёт карту по
            // __base, «Извлечение духа» снимает скопированное через
            // PURGE_DEF_KEYS. Повторное копирование (двойная способность
            // «Безумного мага») добавляет недостающие перки, не затирая
            // первую активную ability.
            // Копирование способностей в per-unit копию def (как purgeUnit):
            // исходная карта каталога не меняется, cardIdOf узнаёт карту по
            // __base, «Извлечение духа» снимает скопированное через
            // PURGE_DEF_KEYS. Повторное копирование (двойная способность
            // «Безумного мага») добавляет недостающие перки, не затирая
            // первую активную ability.
            A.copyUnitAbilities = function copyUnitAbilities(u, src) {
                if (!u || !src || !src.def || !B.units.includes(u)
                    || !B.units.includes(src)) return false;
                const def = Object.assign({}, u.def);
                let got = false;
                for (const k of COPY_UNIT_ABILITY_KEYS) {
                    const v = src.def[k];
                    if (v === undefined || v === null || v === false || v === 0) continue;
                    if (k === "ability" && def.ability) continue; // первая важнее
                    def[k] = v;
                    got = true;
                }
                if (!got) return false;
                def.__base = u.def.__base || u.def;
                u.def = def;
                u.abilitySource = cardIdOf(src.def) || null;
                recalcAuras();
                return true;
            };
            // «Озёрная дева»: после призыва — способность случайного
            // соседнего существа (любая сторона, верт/гориз). Нет соседей
            // или у соседа нет перков — эффект не разрешается (флаг
            // «Безумного мага» не тратится).
            // «Озёрная дева»: после призыва — способность случайного
            // соседнего существа (любая сторона, верт/гориз). Нет соседей
            // или у соседа нет перков — эффект не разрешается (флаг
            // «Безумного мага» не тратится).
            A.summonLakeMaid = function summonLakeMaid(u) {
                if (!B.units.includes(u)) return false;
                const near = B.units.filter((v) => v !== u && v.def.type === "unit"
                    && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1);
                if (!near.length) return false;
                const src = near[(Math.random() * near.length) | 0];
                const ok = copyUnitAbilities(u, src);
                const p = cellXY(u.col, u.row);
                if (ok) {
                    floatText(p.x, p.y - 84,
                        GAME_LOC.t(`card.${cardIdOf(src.def)}.name`), 0x8cd0ef);
                    sfx("up");
                }
                return ok;
            };

            // «Гоблинская приманка»: существо врага, шагающее С КЛЕТКИ, соседней
            // с ловушкой, сходит на клетку приманки вместо намеченной — и получает
            // 1 урона. Приманка одноразовая; занятая клетка приманки не манит.

            // ── «Выкапливание N» (Мортис, просил юзер): существо ОДИН раз
            // после смерти призывается обратно на поле — на ту же клетку
            // (занята — соседнюю пустую верт/гориз) — с базовыми статами
            // и БЕЗ траты энергии; счётчик понижается на 1, на 0 свойство
            // исчезает. Штатный addUnit: ловушки клетки/ауры/постройки
            // срабатывают, как на призыв. Смертью считается только killUnit —
            // «Смыв»/«Раскопки» (removeUnit без каскадов) не будят скелета.
            A.addExhuming = function addExhuming(u, n) {
                u.exhuming = n;
                updateExhumingMark(u);
            };
            A.updateExhumingMark = function updateExhumingMark(u) {
                if (!u.node) return;
                let mark = u.node.getChildByName("exhumingMark");
                if (!u.exhuming || u.exhuming <= 0) {
                    if (mark) mark.destroy({ children: true });
                    return;
                }
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "exhumingMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x4a4034 });
                    g.stroke({ width: 3, color: 0xc9b98c });
                    mark.addChild(g);
                    const tx = T("", 17, 0xf3e6c2);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(34, -66); // правее головы (левее — берсерк)
                    u.node.addChild(mark);
                }
                const label = mark.children[mark.children.length - 1];
                if (label && label.text !== undefined) label.text = String(u.exhuming);
            };
            A.exhumingReplay = function exhumingReplay(u) {
                if (!u || u.def.type !== "unit" || u.token || !(u.exhuming > 0)) return;
                const side = u.side;
                const id = cardIdOf(u.def);
                const left = u.exhuming - 1;
                const col = u.col, row = u.row;
                let cell = !unitAt(col, row) ? [col, row] : null;
                if (!cell) { // клетку успели занять — ближайшая свободная
                    const spots = [[-1, 0], [1, 0], [0, -1], [0, 1]]
                        .map(([dc, dr]) => [col + dc, row + dr])
                        .filter(([c2, r2]) => c2 >= 0 && c2 < GRID && r2 >= 0
                            && r2 < GRID && !unitAt(c2, r2));
                    if (spots.length) cell = spots[(Math.random() * spots.length) | 0];
                }
                const p = cellXY(col, row);
                if (!cell) { // поле забито — вернуться некуда (крайний случай)
                    floatText(p.x, p.y - 84,
                        "⛏ " + GAME_LOC.t("spell.exhuming.name"), 0x8a7c5e);
                    return;
                }
                floatText(p.x, p.y - 84,
                    "⛏ " + GAME_LOC.t("spell.exhuming.name"), 0xc9b98c);
                sfx("use");
                // «Смерть из-под земли» (firstDigReward, просил юзер):
                // первое за бой срабатывание «Выкапливания» стороны —
                // 1 карта и 1 энергия
                const hd = heroDefOf(side);
                if (hd && hd.ability === "firstDigReward"
                    && !B.heroFlags.digReward[side]) {
                    B.heroFlags.digReward[side] = true;
                    if (side === "p") { drawCards(1); B.energy += 1; }
                    else { drawEnemy(1); B.eEnergy += 1; }
                    floatText(p.x, p.y - 118, "+1⚡ +1", 0xffd98c);
                    sfx("up");
                }
                const u2 = addUnit(side, id, cell[0], cell[1]);
                if (u2 && left > 0 && B.units.includes(u2)) addExhuming(u2, left);
            };

            // Случайный сброс N карт с руки стороны (Пытка разума, dec125):
            // карты под «Сожжением» сгорают (как при сбросе панели переполнения),
            // сброс кормит «Болотную слизь» (noteDiscard). Возвращает число карт.

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
        }
    };
})();
