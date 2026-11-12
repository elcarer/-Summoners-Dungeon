// СЦЕНА «АРЕНА»: УРОН И СМЕРТЬ — ядро списаний: damageUnit/damageBase/
// healUnit, гибель (killUnit) и уборка (removeUnit, bounce, возврат в руку),
// реакции героев на гибель, «Извлечение духа» (purge).
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installDamage = function installDamage(A) {
        with (A) {

            A.removeUnit = function removeUnit(u) {
                const i = B.units.indexOf(u);
                if (i >= 0) B.units.splice(i, 1);
                if (unitCard && unitCard.unit === u) unitCardHide(); // жетон умер
                if (effectTip) effectTipHide(); // подсказка статуса умерла с ним
                // руна («Наскальная рунопись») живёт на существе: существо ушло
                // с поля (смерть, побег, удар по базе) — ловушка рассыпалась
                for (const s of ["p", "e"]) {
                    const n = B.traps[s].length;
                    B.traps[s] = B.traps[s].filter((tr) => tr.unit !== u);
                    if (B.traps[s].length !== n) redrawTraps();
                }
                punches.push({ node: u.node, life: 0.25 / animK(), total: 0.25 / animK(), dying: true });
            };

            // Карта призыва — в руку владельца. Ищем во всех зонах: сброс мог
            // быть уже перемешан в колоду при доборе, а карта — лежать в руке
            // (возврат героем/панелью). Лимит 7 здесь НЕ действует: он только
            // для панели сброса в конце хода. Если карты нет нигде (призыв
            // напрямую из колоды/сброса, сожжение) — возвращаем новую копию,
            // иначе карта пропала бы навсегда (просил юзер).

            // Карта призыва — в руку владельца. Ищем во всех зонах: сброс мог
            // быть уже перемешан в колоду при доборе, а карта — лежать в руке
            // (возврат героем/панелью). Лимит 7 здесь НЕ действует: он только
            // для панели сброса в конце хода. Если карты нет нигде (призыв
            // напрямую из колоды/сброса, сожжение) — возвращаем новую копию,
            // иначе карта пропала бы навсегда (просил юзер).
            A.returnCardToHand = function returnCardToHand(side, id) {
                if (!id) return false;
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const deck = side === "p" ? B.deck : B.eDeck;
                let from = discard, i = discard.indexOf(id);
                if (i < 0) { from = deck; i = deck.indexOf(id); }
                if (i >= 0) {
                    from.splice(i, 1);
                    hand.push(id);
                    return true;
                }
                // карты не было ни в одной зоне — возвращаем копию (просил
                // юзер: карта не должна пропадать). Несколько копий одной
                // карты возвращаются ПО ОТДЕЛЬНОСТИ — «Стык эпох»/«В гуще
                // боя» могут вернуть на поле 2–3 одинаковых существа разом
                hand.push(id);
                return true;
            };

            // «Смыв» (wis85): существо убирается с поля боя БЕЗ каскадов смерти
            // (зеркально «Раскопкам» — хищник не кормится, ауры пересчитываются),
            // его карта призыва возвращается в руку владельца из любой зоны.
            // У токена (gobA/gobC/волк друида) карты призыва нет — просто
            // убирается. Полная рука возврат не блокирует.
            // «Защита от заклинаний» отсеяна выбором цели (spellAimable) —
            // сам эффект второй проверки не делает.

            // «Смыв» (wis85): существо убирается с поля боя БЕЗ каскадов смерти
            // (зеркально «Раскопкам» — хищник не кормится, ауры пересчитываются),
            // его карта призыва возвращается в руку владельца из любой зоны.
            // У токена (gobA/gobC/волк друида) карты призыва нет — просто
            // убирается. Полная рука возврат не блокирует.
            // «Защита от заклинаний» отсеяна выбором цели (spellAimable) —
            // сам эффект второй проверки не делает.
            A.bounceUnit = function bounceUnit(u) {
                if (!u || !B.units.includes(u)) return;
                const p = cellXY(u.col, u.row);
                const id = cardIdOf(u.def);
                removeUnit(u);
                recalcAuras();
                soulRiverLeave(u); // «Река душ» (W82): существо покинуло поле
                if (u.token) return;
                if (returnCardToHand(u.side, id))
                    floatText(p.x, p.y - 66, "↩ " + GAME_LOC.t(`card.${id}.name`), 0x8cd0ef);
            };


            A.killUnit = function killUnit(u, killer) {
                // «Ремонт» (tim239, просил юзер): помеченное заклинанием
                // существо/постройка не умирает — карта возвращается в руку
                // владельца (bounceUnit, каскадов смерти нет — гибели не
                // было). Возвращает false — «смерти не случилось»: boomRet
                // взрыв не делает. У токена карты призыва нет — просто убран
                if (u && u.repair && B.units.includes(u)) {
                    const rp = cellXY(u.col, u.row);
                    bounceUnit(u);
                    floatText(rp.x, rp.y - 96,
                        "🔧 " + GAME_LOC.t("spell.repair.name"), 0x9fd489);
                    sfx("chpoc");
                    return false;
                }
                if (u && B.units.includes(u)) {
                    const dp = cellXY(u.col, u.row);
                    // W59 (юзер): смерть существа — Disintegrate, постройки —
                    // Poof
                    fxEvent(u.def.type === "building" ? "poof" : "death", {
                        x: dp.x, y: dp.y - 8, color: fxColorOf(u.def.elem),
                        scale: u.def.type === "building" ? 1.2 : 1,
                    });
                }
                // «Засадный отряд» (hon196): ловушка висит на СВОЕЙ постройке
                // (unit-привязка armTrap, как руна) — постройка умирает, засада
                // срабатывает: Прихожанин 2/2 в клетку погибшей, карта — в руку.
                // Ловушка снимается в removeUnit вместе с постройкой — запоминаем
                // ДО него и разыгрываем после (клетка к тому моменту свободна)
                let ambush = null;
                if (u && u.def.type === "building") {
                    const ti = B.traps[u.side].findIndex((t) => t.unit === u
                        && t.def.trap && t.def.trap.effect === "ambushRise");
                    if (ti >= 0) {
                        ambush = { side: u.side, trap: B.traps[u.side][ti],
                                   col: u.col, row: u.row };
                    }
                }
                removeUnit(u);
                sfx("die");
                // «Иллюзия» (wis108): погибает вместе с существом, чьи статы
                // скопировала. Штатный killUnit — каскады смерти работают.
                for (const v of B.units.slice()) {
                    if (v.illusionOf === u && v.def.illusion && B.units.includes(v))
                        killUnit(v, null);
                }
                // «Гоблин-разбойник» (strRaider, W40): ПЕРВЫЙ раз за бой,
                // убивая существо противника, наносит 2 урона по случайному
                // существу противника. Убийство — ударом существа (killer):
                // заклинания и ловушки бьют без killer-существа, их гибели
                // способность не считает (как «Ответ»/«Снизошедший» ниже).
                // Рекурсия штатная: добив может убить — killUnit честно
                // обрабатывает каскады (здесь уже после removeUnit жертвы)
                if (u.def.type === "unit" && killer && killer.def
                    && killer.def.type === "unit" && killer.side !== u.side
                    && B.units.includes(killer)
                    && !B.heroFlags.killSnipe[killer.side]) {
                    const hd = heroDefOf(killer.side);
                    if (hd && hd.ability === "firstKillSnipe") {
                        B.heroFlags.killSnipe[killer.side] = true;
                        const foes = B.units.filter((v) =>
                            v.side === u.side && v.def.type === "unit");
                        if (foes.length) {
                            const v = foes[(Math.random() * foes.length) | 0];
                            const p2 = cellXY(v.col, v.row);
                            floatText(p2.x, p2.y - 66, `${hd.abilityVal || 2}`, 0xff8f6e);
                            damageUnit(v, hd.abilityVal || 2, null, "dam");
                        }
                    }
                }
                // ауры строений умирают вместе с ними; «Король скелетов»
                // (dec147) — юнит-аура, его смерть тоже снимает бонус;
                // «Смоляная статуя» (dec155): смерть носителя метки tarMark
                // снимает −2⚔ его живым соседям — пересчёт обязателен
                if (u.def.type === "building" || u.def.skelKing || u.tarMark)
                    recalcAuras();
                // «Нищий» (hon189, просил юзер): умирая, сбрасывает 1
                // случайную карту с руки ПРОТИВНИКА (randomDiscard; карты
                // под «Сожжением» сгорают). Способность на смерть — носитель
                // уже удалён с поля, релей героя зовётся с opts.dead
                if (u.def.type === "unit" && u.def.dyingDiscard) {
                    const foe = u.side === "p" ? "e" : "p";
                    const np = cellXY(u.col, u.row);
                    let resolved = false; // способность реально сбросила карту
                    honorRelayAct(u, () => {
                        const n = randomDiscard(foe, u.def.dyingDiscard);
                        if (n) floatText(np.x, np.y - 66, "⤓", 0xc9b98c);
                        resolved = resolved || n > 0;
                        return n > 0;
                    }, { dead: true });
                    // «Ответный разряд» (W76): способность на смерть
                    // сработала (чужой ход проверит пинг сам); opts.dead —
                    // носитель удалён с поля
                    if (resolved) reactShotPing(u, { dead: true });
                }
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
                    sfx("chpoc");
                    packFrenzy(v); // «Безумие стаи»: способность растения сработала
                    onBuff(v, k, k); // «Белая пуща» (W61)
                }
                // ловушки стороны погибшего: триггер «при гибели своего существа»
                if (killer && killer.def && killer.def.type === "unit" && killer.side !== u.side) {
                    triggerTraps(u.side, killer);
                }
                // «Проклятый обелиск» (dec136): когда умирает ЛЮБОЕ существо
                // (обе стороны; постройки не считаются), каждая живая копия
                // получает +1 жизнь
                if (u.def.type === "unit") for (const v of B.units.slice()) {
                    if (!v.def.curseObelisk || !B.units.includes(v)) continue;
                    healUnit(v, 1);
                }
                // «Болото рождения» (dec151): на смерть любого существа
                // (обе стороны) постройка получает +1 жизнь
                if (u.def.type === "unit") for (const v of B.units.slice()) {
                    if (!v.def.birthSwamp || !B.units.includes(v)) continue;
                    healUnit(v, 1);
                }
                // «Толстопуз» (dec149): когда умирает существо его владельца
                // (не он сам), каждая живая копия прибавляет себе БАЗОВЫЕ
                // ⚔/♥ умершего (статы карты, не текущие с баффами)
                if (u.def.type === "unit") for (const v of B.units.slice()) {
                    if (v === u || v.side !== u.side || !v.def.fatBelly
                        || !B.units.includes(v)) continue;
                    const a = u.def.atk || 0, h = u.def.hp || 0;
                    v.bonusAtk += a;
                    v.hp += h;
                    recalcAuras();
                    const hn = v.node.getChildByName("hp");
                    if (hn) hn.text = String(v.hp);
                    const p = cellXY(v.col, v.row);
                    floatText(p.x, p.y - 66, `+${a}⚔ +${h}♥`, 0x9fd489);
                    punch(v.node);
                    sfx("chpoc");
                    onBuff(v, a, h); // «Белая пуща» (W61)
                }
                // «Жажда смерти» (decThirst, heroes/30): ПЕРВАЯ за бой гибель
                // СВОЕГО существа лечит базу владельца на 3
                if (u.def.type === "unit") {
                    const hd = heroDefOf(u.side);
                    if (hd && hd.ability === "firstDeathHeal"
                        && !B.heroFlags.firstDeathHeal[u.side]) {
                        B.heroFlags.firstDeathHeal[u.side] = true;
                        healBase(u.side, 3);
                        sfx("chpoc");
                    }
                }
                // «Охранники мостов» (heroes 42–46, просил юзер): при
                // гибели СВОЕГО существа СВОЕЙ стихии (КАЖДЫЙ раз, без
                // «первого за бой») герой срабатывает — эффекты в
                // guardDeathAct ниже
                if (u.def.type === "unit") {
                    const hd = heroDefOf(u.side);
                    const he = hd && hd.elems && hd.elems[0];
                    if (hd && he && u.def.elem === he
                        && ["elemDeathSnipe", "elemDeathHp", "elemDeathLoot",
                            "elemDeathReturn", "elemDeathMend", "elemDeathDelay"]
                            .includes(hd.ability)) {
                        guardDeathAct(u.side, hd);
                    }
                }
                // «Проклятые артефакты» (dec138): при смерти постройки все
                // запомненные ею карты возвращаются в руку владельца — по
                // одной копии из сброса, иначе из колоды (карты нигде нет —
                // эта копия не возвращается)
                if (u.def.type === "building" && u.def.relicVault
                    && u.relics && u.relics.length) {
                    const side = u.side;
                    const hand = side === "p" ? B.hand : B.eHand;
                    const discard = side === "p" ? B.discard : B.eDiscard;
                    const deck = side === "p" ? B.deck : B.eDeck;
                    const p = cellXY(u.col, u.row);
                    let back = 0;
                    for (const id of u.relics) {
                        let i = discard.indexOf(id);
                        if (i >= 0) discard.splice(i, 1);
                        else {
                            i = deck.indexOf(id);
                            if (i >= 0) deck.splice(i, 1);
                            else continue; // копии нет нигде — не возвращается
                        }
                        hand.push(id);
                        back++;
                    }
                    if (back) {
                        floatText(p.x, p.y - 90, `⤓ +${back}`, 0xc9b98c);
                        sfx("chpoc");
                        if (side === "p") layoutHand();
                        refreshHud();
                    }
                }
                // «Горящие рунокамни» (sg245, W55): умирая, наносят всем
                // СУЩЕСТВАМ противника и его базе урон = числу заклинаний
                // в сбросе ВЛАДЕЛЬЦА (сама карта — постройка, на счёт не
                // влияет). Каждая цель — полная сумма
                if (u.def.type === "building" && u.def.runeBurn) {
                    const side = u.side;
                    const foe = side === "p" ? "e" : "p";
                    const discard = side === "p" ? B.discard : B.eDiscard;
                    const n = discard.filter((id) => CARDS[id]
                        && CARDS[id].type === "spell").length;
                    if (n > 0) {
                        const bp = cellXY(u.col, u.row);
                        for (const v of B.units.slice()) {
                            if (v.side !== foe || v.def.type !== "unit"
                                || !B.units.includes(v)) continue;
                            damageUnit(v, n, null, "dam");
                        }
                        damageBase(foe, n, foe === "p"
                            ? { x: 960, y: 830, fill: 0xc86a3e }
                            : { x: 960, y: 250, fill: 0xc86a3e });
                        floatText(bp.x, bp.y - 96, String(n), 0xff8f6e);
                        sfx("crash");
                    }
                }
                // «Горящая местность» (sgrBurn, W55): когда ПОСТРОЙКА героя
                // умирает — 1 урон базе противника (каждый раз, без «первого
                // за бой»; спека юзера)
                if (u.def.type === "building") {
                    const hd = heroDefOf(u.side);
                    if (hd && hd.ability === "burnDeath") {
                        const foe = u.side === "p" ? "e" : "p";
                        damageBase(foe, hd.abilityVal || 1, foe === "p"
                            ? { x: 960, y: 830, fill: 0xff5f4e }
                            : { x: 960, y: 250, fill: 0xff5f4e });
                        sfx("chpoc");
                    }
                }
                heroDeathReplay(u); // «Гоблин-вождь»: первый погибший гоблин возвращается
                heroBuildingReplay(u); // «Хранитель рощи»: первая погибшая постройка возвращается
                lichRaiseGhost(killer, u); // «Лич»: призрак на клетку убитого
                deathKnightGain(killer, u); // «Рыцарь смерти»: +1⚡ владельцу
                exhumingReplay(u); // «Выкапливание»: существо возвращается после смерти
                soulRiverLeave(u); // «Река душ» (W82): существо покинуло поле
                if (ambush) ambushRiseAct(ambush.side, ambush.trap,
                    ambush.col, ambush.row); // «Засадный отряд»
                return true;
            };

            // «Река душ» (necSoulRiver, W82 — спека юзера; перечень путей
            // уточнён юзером: «покидание поля» — возврат в руку, удаление
            // из игры и прочие такие события): когда СУЩЕСТВО владельца
            // покидает поле боя, случайная карта с руки сбрасывается и в
            // освободившуюся клетку призывается Призрак 2/1 (жетон ghost).
            // Точки вызова — ВСЕ пути покидания поля существом:
            //   killUnit (гибель, включая изъятие «Проломом») — arenaDamage;
            //   bounceUnit (возврат в руку: «Ремонт», «Циклон», «Возврат N»,
            //     «Смыв») — arenaDamage;
            //   удар по базе и уход (обе стороны) — arenaFlow ×2;
            //   побег труса (fleeCoward) — arenaFlow;
            //   уход в «Сдвиг»: «Паровой стрелятель» (arenaBoard) и
            //     «Ловушка времени» (arenaTraps) — временные, значок ждёт
            //     клетку (стандартное правило «занято — ждёт с нулём»);
            // постройки не «существо» (гейт type) — «Раскопки»/«Лаборатория»/
            // «Древомощь» не триггерят. Клетку успели занять каскадами
            // («Лич», «Засадный отряд», «Выкапывание») — призыва нет
            A.soulRiverLeave = function soulRiverLeave(u) {
                if (!u || !B || !B.units || u.def.type !== "unit") return;
                const hd = heroDefOf(u.side);
                if (!hd || hd.ability !== "soulRiver") return;
                const side = u.side, col = u.col, row = u.row;
                const hand = side === "p" ? B.hand : B.eHand;
                if (hand.length) {
                    const i = (Math.random() * hand.length) | 0;
                    const id = hand.splice(i, 1)[0];
                    (side === "p" ? B.discard : B.eDiscard).push(id);
                    noteDiscard(1, side, [id], "discard");
                    const hp = cellXY(col, row);
                    floatText(hp.x, hp.y - 108,
                        "⤓ " + GAME_LOC.t(`card.${id}.name`), 0xc79af0);
                    if (side === "p") layoutHand();
                }
                if (!unitAt(col, row)) {
                    addUnit(side, "ghost", col, row, { token: true });
                    const gp = cellXY(col, row);
                    floatText(gp.x, gp.y - 60,
                        GAME_LOC.t("card.ghost.name"), 0xb7d0ef);
                }
                sfx("chpoc");
                refreshHud();
            };

            // Способности «Охранников мостов» (просил юзер). Срабатывают
            // при КАЖДОЙ гибели существа своей стихии стороны:
            //   elemDeathSnipe  «Охранник Силы» (42): 1 урон случайному
            //                   существу или постройке противника
            //   elemDeathHp     «Охранник Роста» (43): случайное своё
            //                   существо получает +1 к жизням
            //   elemDeathLoot   «Охранник Мудрости» (44): взять карту,
            //                   затем скинуть карту с руки на выбор
            //   elemDeathReturn «Охранник Тлена» (45): вернуть карту
            //                   призыва из сброса в руку, затем скинуть
            //                   карту с руки на выбор
            //   elemDeathMend   «Охранник Чести» (46): если у базы 3 жизни
            //                   и меньше — вылечить ей 1 жизнь
            //   elemDeathDelay  «Охранник Времени» (53): случайное своё
            //                   существо в «Сдвиге» приходит на 1 ход
            //                   раньше (значок-счётчик тает на 1)
            // Выбор сброса ИГРОКА откладывается в очередь pendingDiscard —
            // панель откроется в начале его хода (механизм «Торговца»):
            // гибель существа часто случается в ход врага, и модальная
            // панель открыла бы его ход поверх себя. ИИ скидывает сразу
            // (самую дешёвую/слабую карту)
            A.guardDeathAct = function guardDeathAct(side, hd) {
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const dropWorst = () => { // сброс ИИ: дешевле и слабее — первой
                    if (!hand.length) return;
                    let bi = 0;
                    for (let i = 1; i < hand.length; i++) {
                        const a = CARDS[hand[i]], b = CARDS[hand[bi]];
                        const ka = (a.cost || 0) * 10
                            + (A.aiCardPower ? A.aiCardPower(a) : 0);
                        const kb = (b.cost || 0) * 10
                            + (A.aiCardPower ? A.aiCardPower(b) : 0);
                        if (ka < kb) bi = i;
                    }
                    const id = hand.splice(bi, 1)[0];
                    discard.push(id);
                    noteDiscard(1, side, [id], "discard");
                };
                if (hd.ability === "elemDeathSnipe") {
                    const foes = B.units.filter((v) => v.side !== side);
                    if (foes.length) {
                        const v = foes[(Math.random() * foes.length) | 0];
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 66, "1", 0xff8f6e);
                        damageUnit(v, 1, null, "dam");
                    }
                } else if (hd.ability === "elemDeathHp") {
                    const own = B.units.filter((v) => v.side === side);
                    if (own.length) healUnit(own[(Math.random() * own.length) | 0], 1);
                } else if (hd.ability === "elemDeathMend") {
                    const cur = side === "p" ? B.playerBase : B.enemyBase;
                    if (cur <= 3) healBase(side, 1);
                } else if (hd.ability === "elemDeathLoot") {
                    if (side === "p") drawCards(1); else drawEnemy(1);
                    if (side === "p") B.pendingDiscard = (B.pendingDiscard || 0) + 1;
                    else dropWorst();
                } else if (hd.ability === "elemDeathReturn") {
                    // последняя ушедшая в сброс карта призыва — первой обратно
                    for (let k = discard.length - 1; k >= 0; k--) {
                        const d = CARDS[discard[k]];
                        if (d && d.type === "unit") {
                            hand.push(discard.splice(k, 1)[0]);
                            if (side === "p") layoutHand();
                            break;
                        }
                    }
                    if (side === "p") B.pendingDiscard = (B.pendingDiscard || 0) + 1;
                    else dropWorst();
                } else if (hd.ability === "elemDeathDelay") {
                    // «Охранник Времени» (53, просил юзер): случайное СВОЁ
                    // существо в «Сдвиге» (значок-счётчик ещё тает, left > 0;
                    // постройки «Сдвига» не считаются — в спеке «существо»)
                    // приходит на 1 ход раньше. left 0 — значок уже ждёт
                    // клетку, ускорять ниже нуля нельзя
                    const wait = (B.delayed[side] || []).filter((e) =>
                        e.left > 0 && CARDS[e.cardId]
                        && CARDS[e.cardId].type === "unit");
                    if (wait.length) {
                        const e = wait[(Math.random() * wait.length) | 0];
                        e.left -= 1;
                        A.delayDrawNode(e);
                        const dp = cellXY(e.col, e.row);
                        floatText(dp.x, dp.y - 96,
                            "⏳ −" + (hd.abilityVal || 1), 0xc9a0ef);
                        sfx("chpoc");
                    }
                }
            };

            // «Рыцарь смерти» (dec159, просил юзер): убив СУЩЕСТВО (постройки
            // не считаются), даёт владельцу 1 энергию. Образец — «Лич» выше:
            // убийца должен быть жив (мог погибнуть от шипов/ответки)
            A.deathKnightGain = function deathKnightGain(killer, u) {
                if (!killer || killer === u || !killer.def || !killer.def.deathKnight
                    || !B.units.includes(killer)) return;
                if (!u || u.def.type !== "unit") return;
                if (killer.side === "p") B.energy += 1; else B.eEnergy += 1;
                const p = cellXY(killer.col, killer.row);
                floatText(p.x, p.y - 66, "+1⚡", 0xffd98c);
                punch(killer.node);
                sfx("chpoc");
            };

            // «Лич» (dec131, просил юзер): убив существо (любой стороны),
            // призывает Призрака 2/1 (токен ghost) на клетку убитого.
            // Клетку успели занять (возврат героя) — призрак не является;
            // «Выкапливание» убитого срабатывает ниже и уходит на соседнюю.
            A.lichRaiseGhost = function lichRaiseGhost(killer, u) {
                if (!killer || killer === u || !killer.def || !killer.def.lichRaise
                    || !B.units.includes(killer)) return;
                if (!u || u.def.type !== "unit") return;
                if (unitAt(u.col, u.row)) return; // клетка занята — некуда
                addUnit(killer.side, "ghost", u.col, u.row, { token: true });
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 108,
                    GAME_LOC.t("card.ghost.name"), 0xb7d0ef);
            };

            // ── «Выкапливание N» (Мортис, просил юзер): существо ОДИН раз
            // после смерти призывается обратно на поле — на ту же клетку
            // (занята — соседнюю пустую верт/гориз) — с базовыми статами
            // и БЕЗ траты энергии; счётчик понижается на 1, на 0 свойство
            // исчезает. Штатный addUnit: ловушки клетки/ауры/постройки
            // срабатывают, как на призыв. Смертью считается только killUnit —
            // «Смыв»/«Раскопки» (removeUnit без каскадов) не будят скелета.

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
                if (u.frozen) n++;
                if (u.spellWard) n++;
                if (u.exhuming) n++;
                return n;
            };
            // Снять ВСЕ свойства/эффекты цели; возвращает, сколько снято, —
            // база кастовавшего лечится за каждое. Метка plant и базовые статы
            // остаются (это тип существа, а не эффект).
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
                if (u.atkZero) { u.atkZero = false; n++; } // «Ловушка-пузырь» (wis119)
                if (u.tarMark) { u.tarMark = false; n++; } // «Смоляная статуя» (dec155): метка-аура снята
                if (u.lightAura) { u.lightAura = false; n++; } // «Аура света» (hon199): свет снят
                if (u.entangle) { u.entangle = 0; n++; }
                if (u.frozen) { u.frozen = 0; n++; }
                if (u.spellWard) { u.spellWard = false; n++; removeWardMark(u); }
                if (u.exhuming) { u.exhuming = 0; n++; updateExhumingMark(u); }
                // «Иллюзия» (wis108): без способности связь с источником
                // больше не действует — смерть источника её не убивает
                if (u.illusionOf) u.illusionOf = null;
                for (const m of ["sporeMark", "enchMark", "auraMark", "protectMark", "berserkMark",
                    "confuseMark", "venomMark", "poisonMark", "entangleMark", "frozenMark",
                    "exhumingMark"]) {
                    const node = u.node.getChildByName(m);
                    if (node) node.destroy({ children: true });
                }
                recalcAuras(); // снесённая аура больше не действует соседям
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, GAME_LOC.t("card.grw17.name"), 0xd0b0ef);
                fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.85 });
                punch(u.node);
                sfx("chpoc");
                return n;
            };

            // snd — МЕТКА удара: нужна и визуалу (цвет всплеска, slash),
            // и звуку; старые метки волн переводим в семантические ключи
            // W34: атака ("sword"/"dam") → crash, заклинания ("rocket"/
            // "monolith") → chpoc, ловушки ("acid") → mine, яд ("poison")
            A.damageUnit = function damageUnit(target, amount, killer = null, snd = "dam") {
                // «Абсолютная защита» (hw267, W78 — спека юзера): гейт стоит
                // ПЕРВЫМ — ход, «оглохший» после срабатывания ловушки, вообще
                // не наносит урон (щиты/броня/услуги не важны). После него —
                // проверка активации ловушки: урон-активатор проходит
                if (amount > 0 && B.dmgHalt && B.dmgHalt[B.turnSide]) return;
                if (amount > 0 && B.traps) absGuardCheck();
                // «Защита от заклинаний» (u.spellWard): пока идёт разрешение
                // заклинания (A.spellCasting ставят applySpellP /
                // enemyCastSpellEffect / тик «Стены костров»), урон заклинания
                // по такому существу не проходит вовсе (просил юзер)
                if (amount > 0 && target.spellWard && A.spellCasting) {
                    const wp = cellXY(target.col, target.row);
                    floatText(wp.x, wp.y - 66,
                        "✦ " + GAME_LOC.t("spell.ward.name"), 0x8cd0ef);
                    fxEvent("ward", { x: wp.x, y: wp.y - 14, scale: 0.72 });
                    sfx("chpoc");
                    return;
                }
                // «Воздушный щит» (hw263, W75 — спека юзера): существо не
                // получает урона, кроме ОБЫЧНЫХ атак — ударов существом
                // врукопашную (snd "sword" от юнита противника без массовой
                // метки: марш, рывок «Скорости», удар двойника-ловушки
                // «Тёмные цепи»). Всё прочее — заклинания, ловушки,
                // выстрелы, Ответ, яд, всплески способностей (fxHint
                // "mass") — гасится целиком
                if (amount > 0 && target.airShield
                    && !(killer && killer.def && killer.def.type === "unit"
                        && killer.side !== target.side
                        && snd === "sword" && A.fxHint !== "mass")) {
                    const ap = cellXY(target.col, target.row);
                    floatText(ap.x, ap.y - 66,
                        "✦ " + GAME_LOC.t("spell.airShield.name"), 0x9ecbe8);
                    fxEvent("ward", { x: ap.x, y: ap.y - 14, scale: 0.72 });
                    sfx("chpoc");
                    return;
                }
                // «Защита N» («Защитный кокон») режет входящий урон до нуля;
                // споры/огненное дыхание реагируют на ФАКТИЧЕСКИ прошедший урон
                let amt = amount;
                // «Тараномобиль» (tim212): двойной урон ПОСТРОЙКАМ противника
                // (урон, источником которого является существо: атака,
                // спецудар; заклинания и ловушки бьют без killer-существа)
                if (amt > 0 && killer && killer.def && killer.def.siegeDouble
                    && killer.side !== target.side
                    && target.def.type === "building") amt *= 2;
                // «Некроз» (nec286, W83 — спека юзера): существо с меткой
                // Некроза получает В 2 РАЗА больше урона от ЛЮБЫХ
                // источников — атака, заклинания, ловушки, способности
                // (всё идёт через damageUnit). Умножение ДО брони/купола —
                // как у «Тараномобиля»: защита гасит уже удвоенный урон;
                // метка держится до гибели цели
                if (amt > 0 && target.rot) amt *= 2;
                let blocked = 0;
                // «Снизошедший» (hon190): страж — если ПРОТИВНИК атакует это
                // существо (удар существом: марш, «Скорость», «Тёмные цепи»)
                // и урон должен его убить, а жизней больше 1, — смерти нет:
                // списывается ровно до 1 жизни (спека: «жизни становятся
                // равными 1»). «Ответ» атакующему срабатывает, как при любой
                // атаке; «Гоблин-асассин» добивание не делает — существо
                // «не умирает» (undyingGuard ниже)
                let undyingGuard = false;
                if (amt > 0 && target.def.undying && target.hp > 1
                    && killer && killer.def && killer.def.type === "unit"
                    && killer.side !== target.side && amt >= target.hp) {
                    undyingGuard = true;
                    amt = target.hp - 1;
                }
                const protect = A.unitProtectTotal(target);
                if (protect && amt > 0) {
                    blocked = Math.min(protect, amt);
                    amt -= blocked;
                    const bp = cellXY(target.col, target.row);
                    floatText(bp.x, bp.y - 72, `Защита −${blocked}`, 0x8cd0ef);
                    if (amt <= 0) {
                        // весь урон съеден бронёй — показать, что удар «погас»
                        fxEvent("ward", { x: bp.x, y: bp.y - 12, scale: 0.62 });
                    }
                }
                // «Силовой купол» (tim234, просил юзер): ЛЮБОЙ урон по
                // существу/постройке под куполом уменьшается до 1 (после
                // брони: броня может съесть и этот 1; купол держится до
                // гибели цели)
                if (target.dome && amt > 1) {
                    amt = 1;
                    const dp = cellXY(target.col, target.row);
                    floatText(dp.x, dp.y - 78, "◈", 0x8cd0ef);
                }
                target.hp -= amt;
                procEnchantFire(killer);
                procSpores(killer, amt); // «Призрачные споры» отражают урон по базе
                // «Нулевой образец» (nec287, W83 — спека юзера): когда
                // СУЩЕСТВО противника теряет жизни (любой источник;
                // постройки и базы — не существа; погасший бронёй/куполом
                // урон жизни не уменьшает), каждый живой «Образец» другой
                // стороны случайно получает +1 к урону или +1 к жизни
                // (50/50 — «случайно +1/0 или 0/+1» спеки)
                if (amt > 0 && target.def.type === "unit") {
                    const growers = B.units.filter((v) => v.side !== target.side
                        && v.def.painGrow && v.def.type === "unit"
                        && B.units.includes(v));
                    for (const z of growers) {
                        const zp = cellXY(z.col, z.row);
                        if (Math.random() < 0.5) { // +1 к урону
                            z.bonusAtk = (z.bonusAtk || 0) + 1;
                            recalcAuras();
                            const an = z.node.getChildByName("atk");
                            if (an) an.text = String(z.curAtk);
                            floatText(zp.x, zp.y - 39, "+1⚔", 0xc79af0);
                            onBuff(z, 1, 0);
                        } else { // +1 к жизни
                            z.hp += 1;
                            const hn = z.node.getChildByName("hp");
                            if (hn) hn.text = String(z.hp);
                            floatText(zp.x, zp.y - 39, "+1♥", 0x9fd489);
                            onBuff(z, 0, 1);
                        }
                        fxEvent("buff", { x: zp.x, y: zp.y - 12, scale: 0.7 });
                        sfx("chpoc");
                    }
                }
                // «Биоугроза» (necBiothreat, W83 — спека юзера): 1 РАЗ В
                // ХОД, когда у существа противника владельца способности
                // уменьшаются жизни на число, база противника получает
                // столько же урона (НЕ БОЛЬШЕ 2; реальное уменьшение —
                // броня/купол, съевшие весь урон, жизней не трогают).
                // База — не существо: отражённый урон дальше не отражается
                if (amt > 0 && target.def.type === "unit"
                    && !B.heroFlags.bioHit[target.side === "p" ? "e" : "p"]) {
                    const hd = heroDefOf(target.side === "p" ? "e" : "p");
                    if (hd && hd.ability === "bioReflect") {
                        B.heroFlags.bioHit[target.side === "p" ? "e" : "p"] = true;
                        damageBase(target.side, Math.min(amt, 2),
                            { x: 960, y: target.side === "p" ? 840 : 240,
                              fill: 0xb07ad5 });
                        sfx("chpoc");
                    }
                }
                const n = target.node.getChildByName("hp");
                if (n) n.text = String(Math.max(0, target.hp));
                const p = cellXY(target.col, target.row);
                floatText(p.x, p.y - 36, `−${amt}`, 0xffb26e);
                if (undyingGuard) // страж «Снизошедшего»: уцелел с 1 жизнью
                    floatText(p.x, p.y - 78, "⇒1♥", 0x8cd0ef);
                if (amt > 0) {
                    // W59 (юзер): эффект урона — по ИСТОЧНИКУ. Массовый урон
                    // (петли с fxHint "mass") — Impact frame; сработавшая
                    // ловушка (fxHint "trap") — Blunt hit; заклинание по
                    // одному существу (идёт разрешение каста, убийцы-юнита
                    // нет) — Parry; атака существа (удар мечом от юнита) —
                    // Claw swipe; прочие потери жизней — Heart lost
                    const kind = A.fxHint === "mass" ? "massHit"
                        : A.fxHint === "trap" ? "trapHit"
                        : (A.spellCasting && !killer) ? "spellHit"
                        : (killer && killer.def && killer.def.type === "unit"
                            && snd === "sword") ? "attack" : "hpLost";
                    fxEvent(kind, {
                        x: p.x, y: p.y - 16,
                        color: (snd === "acid" || snd === "poison") ? 0x9fd46a
                            : snd === "rocket" ? 0xffa45e
                            : snd === "monolith" ? 0xd0b0ef : 0xffb26e,
                        power: Math.min(1.8, 0.72 + amt * 0.12),
                        scale: target.def.type === "building" ? 1.12 : 0.9,
                    });
                }
                punch(target.node);
                // звук по метке: см. комментарий над damageUnit
                sfx(snd === "sword" || snd === "dam" ? "crash"
                    : snd === "rocket" || snd === "monolith" ? "chpoc"
                    : snd === "acid" ? "mine"
                    : snd === "poison" ? "chpoc" : snd);
                // «Проклятый обелиск» (dec136): урон, нанесённый постройке
                // СУЩЕСТВОМ (атака/спецудар; заклинания и ловушки бьют без
                // killer-существа), столько же бьёт базу противника обелиска —
                // но не больше жизней самого обелиска ДО удара
                if (amt > 0 && target.def.curseObelisk && killer && killer.def
                    && killer.def.type === "unit" && killer.side !== target.side) {
                    const refl = Math.min(amt, target.hp + amt);
                    if (refl > 0) damageBase(target.side === "p" ? "e" : "p", refl,
                        { x: 960, y: target.side === "p" ? 240 : 840, fill: 0xb07ad5 });
                }
                // «Техноруны» (wt275, W80 спека юзера): когда СУЩЕСТВО
                // наносит урон этой постройке (атака/спецудар — у заклинаний
                // и ловушек killer-существа нет, как у «Обелиска» выше),
                // разыграйте случайное заклинание из сброса ВЛАДЕЛЬЦА
                // постройки — acolyteCast, тот же движок, что у «Послушника»
                // (игрок — автоцели acolyteTargetFor, враг — свой движок;
                // карта из сброса не уходит; летающие руны стреляют и в
                // чужой ход). Бесконечной цепочки нет: заклинания бьют без
                // killer-существа и Техноруны сами не будят
                if (amt > 0 && target.def.techRunes && killer && killer.def
                    && killer.def.type === "unit" && acolyteCast(target.side, 99)) {
                    const rp = cellXY(target.col, target.row);
                    floatText(rp.x, rp.y - 96, "✦", 0x9a8ce8);
                }
                // «Строй» (hon165) + «Вымпел империи» (hon177): «Ответ» —
                // после атаки существа на объект атакующее существо получает
                // урон шипов — даже если цель от удара погибла (атака
                // состоялась). Встроенные шипы («Строй») и аура Вымпела
                // («все ваши существа и постройки имеют Ответ 1»)
                // СКЛАДЫВАЮТСЯ — способности в этой игре стакаются.
                // Заклинания и ловушки бьют без killer-существа — не
                // триггерят. Урон шипов режется «Защитой» атакующего.
                // tagVal — подмена «Экспериментов» (wt271, W79) видна
                let spike = tagVal(target, "counterSpike");
                // Вымпел даёт «Ответ 1» КАЖДОМУ объекту стороны — у кого
                // шипов не было, теперь 1; у «Строя» — 2
                if (B.units.some((b) => b.side === target.side
                    && b.def.banner && B.units.includes(b))) spike += 1;
                if (spike && killer && killer.def
                    && killer.def.type === "unit" && killer.side !== target.side
                    && B.units.includes(killer)) {
                    const kp = cellXY(killer.col, killer.row);
                    floatText(kp.x, kp.y - 66, `${spike}⚔`, 0x8cd0ef);
                    // «Ответ» — способность объекта: у существа Чести герой-
                    // релей («Отряд соседа») может разрешить её дважды
                    // (второй урон шипов по тому же атакующему)
                    honorRelayAct(target, () => {
                        damageUnit(killer, spike, null, "dam");
                        return true;
                    });
                    // атака всегда на ходу атакующего — для владельца «Ответа»
                    // это чужой ход: «Ответный разряд» (W76) пингует
                    reactShotPing(target);
                }
                // ── «Разбойники» (W40, просил юзер): «первый раз за бой» по
                // урону существам. Атака — урон существом (марш, «Скорость»,
                // спецудары; заклинания и ловушки бьют без killer-существа —
                // как у «Ответа»), заклинания — по A.castSide (ставят в
                // точках каста сторон; тики стен/статусов castSide не ставят)
                let raiderSide = null;
                if (target.def.type === "unit" && amt > 0) {
                    if (killer && killer.def && killer.def.type === "unit"
                        && killer.side !== target.side) raiderSide = killer.side;
                    else if (!killer && A.spellCasting && A.castSide
                        && A.castSide !== target.side) raiderSide = A.castSide;
                }
                if (raiderSide) {
                    // «Рыцарь-разбойник» (honRaider): после атаки существа
                    // противника лечит 2♥ своей базе (атака состоялась —
                    // даже если цель от удара погибла)
                    if (!B.heroFlags.attackHeal[raiderSide]) {
                        const hd = heroDefOf(raiderSide);
                        if (hd && hd.ability === "firstAttackHeal") {
                            B.heroFlags.attackHeal[raiderSide] = true;
                            healBase(raiderSide, hd.abilityVal || 2);
                        }
                    }
                    // «Зомби-разбойник» (decRaider): нанеся урон вражескому
                    // существу, даёт «Выкапливание 1» случайному СВОЕМУ
                    // существу (W46, юзер — было «Возврат 1»; счётчик
                    // добавляется к уже висящему, метка пересоздаётся)
                    if (!B.heroFlags.dmgReturn[raiderSide]) {
                        const hd = heroDefOf(raiderSide);
                        if (hd && hd.ability === "firstDmgReturn") {
                            B.heroFlags.dmgReturn[raiderSide] = true;
                            const own = B.units.filter((v) =>
                                v.side === raiderSide && v.def.type === "unit");
                            if (own.length) {
                                const v = own[(Math.random() * own.length) | 0];
                                addExhuming(v, (v.exhuming || 0) + (hd.abilityVal || 1));
                                floatText(cellXY(v.col, v.row).x,
                                    cellXY(v.col, v.row).y - 96,
                                    "⛏ " + (hd.abilityVal || 1), 0xc9b98c);
                                sfx("chpoc");
                                onEffectGain(v); // «Изменённый» (W84): выданное «Выкапывание»
                            }
                        }
                    }
                }
                // «Опорник» (hon198): когда ЭТУ ПОСТРОЙКУ атакуют, владелец
                // получает 1 энергию — даже если атака постройку убила
                // (атака состоялась); заклинания и ловушки бьют без
                // killer-существа — не «атака» (как у «Ответа»)
                if (amt > 0 && target.def.pillarEnergy && killer && killer.def
                    && killer.def.type === "unit" && killer.side !== target.side) {
                    if (target.side === "p") B.energy += 1; else B.eEnergy += 1;
                    const op = cellXY(target.col, target.row);
                    floatText(op.x, op.y - 84, "+1⚡", 0x8cd0ef);
                    sfx("chpoc");
                }
                // «Небесный портал» (hw269, W78 — спека юзера): когда СУЩЕСТВО
                // наносит урон этой постройке (атака/выстрел/спецудар —
                // killer-существа; заклинания и ловушки бьют без killer —
                // не «существо», не триггерят), то существо возвращается в
                // руку СВОЕГО владельца (штатный bounceUnit — без каскадов
                // смерти; «Ответ»/«Опорник» успели сработать выше). Даже
                // когда постройка от урона погибает — урон нанесён
                if (amt > 0 && target.def.portalBounce && killer && killer.def
                    && killer.def.type === "unit" && killer.side !== target.side
                    && B.units.includes(killer)) {
                    bounceUnit(killer);
                }
                if (target.hp <= 0) { killUnit(target, killer); return; }
                // «Гоблин-асассин»: существо, оставшееся после его урона
                // с 1 жизнью, добивается; страж «Снизошедшего» добивания не
                // даёт — существо «не умирает» (undyingGuard)
                if (target.hp === 1 && !undyingGuard && target.def.type === "unit"
                    && killer && killer.def.ability === "assassin") {
                    floatText(p.x, p.y - 66, "☠", 0xef9f8c);
                    killUnit(target, killer);
                    return;
                }
                // «Взбунтовавшийся мех» (tim240, просил юзер): пережив
                // ФАКТИЧЕСКИЙ урон (полностью съеденный «Защитой» уроном
                // не считается), переходит на сторону противника. Гибель
                // от урона — обычная смерть, переворота нет
                if (amt > 0 && target.def.defect && target.def.type === "unit"
                    && B.units.includes(target)) {
                    defectFlip(target);
                }
                // «Друид глубокой чащи» (grw24): пережив ФАКТИЧЕСКИЙ урон
                // (защита, съевшая всё, уроном не считается), призывает Волка
                summonDruidWolf(target, amt);
            };

            // Призыв Волка 2/4 (grw2) на пустую соседнюю клетку друида; нет
            // свободной — волка нет. Вызывается из damageUnit, когда друид выжил

            // Лечение (+n жизни; пределом служит сама карта — жёсткого максимума
            // у существ нет): счётчик на жетоне и всплывающий «+n»
            A.healUnit = function healUnit(u, n) {
                if (!B.units.includes(u)) return;
                u.hp += n;
                const node = u.node.getChildByName("hp");
                if (node) node.text = String(u.hp);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 36, `+${n}`, 0x9fd489);
                fxEvent("heal", { x: p.x, y: p.y - 10, scale: 0.78 });
                punch(u.node);
                sfx("chpoc");
            };

            // Лечение базы стороны — единая точка для всех источников
            // (заклинания «Луч света»/«Извлечение духа», «Полевой медик»).
            // Кап — начальные жизни базы, как в прежних прямых точках.
            // «Претендент на трон» (honThrone, просил юзер): когда у базы
            // ВЛАДЕЛЬЦА меньше 10 жизней и она получает жизни, она получает
            // на 1 жизнь больше (проверка по жизням ДО лечения).
            A.healBase = function healBase(side, n) {
                if (!B || !(n > 0)) return;
                const hd = heroDefOf(side);
                if (hd && hd.ability === "throneGuard") {
                    const cur = side === "p" ? B.playerBase : B.enemyBase;
                    if (cur < 10) n += 1;
                }
                const y = side === "p" ? 840 : 60;
                if (side === "p")
                    B.playerBase = Math.min(B.playerBaseMax, B.playerBase + n);
                else
                    B.enemyBase = Math.min(B.enemyBaseMax, B.enemyBase + n);
                floatText(960, y, `+${n}`, 0x9fd489);
                fxEvent("heal", { x: 960, y: side === "p" ? 830 : 70, scale: 1.15 });
                punch(root.hud);
            };

            // Урон базе стороны — единая точка для всех источников. «Дома на
            // деревьях» (grw38): пока такая постройка на поле, урон базе
            // ЦЕЛИКОМ уходит в неё (без остатка базе; несколько — первая).
            // where — позиция/цвет всплывающего «−N» у базы (при редиректе
            // не показывается: урон виден на самой постройке).

            // Урон базе стороны — единая точка для всех источников. «Дома на
            // деревьях» (grw38): пока такая постройка на поле, урон базе
            // ЦЕЛИКОМ уходит в неё (без остатка базе; несколько — первая).
            // where — позиция/цвет всплывающего «−N» у базы (при редиректе
            // не показывается: урон виден на самой постройке).
            A.damageBase = function damageBase(side, amount, where = null) {
                if (!B || !(amount > 0)) return;
                // «Абсолютная защита» (hw267, W78): оглохший ход урон базе
                // не наносит (гейт первым — редирект «Домов на деревьях»
                // тоже не спасает). Активацию ловушки см. ниже — ПОСЛЕ
                // редиректа, чтобы урон-активатор в дом проходил
                if (B.dmgHalt && B.dmgHalt[B.turnSide]) return;
                // «Эльф-отступник» (sgrApostate, W57, спека юзера): когда
                // наносится урон базе противника — на 1 урон больше. side —
                // ПОЛУЧАТЕЛЬ урона, усиливает герой НАНОСЯЩЕЙ стороны
                // (как firstBaseHitBuild: «разбирающий — противоположная
                // сторона»); до редиректов («Дома на деревьях») и отражений
                const hr = heroDefOf(side === "p" ? "e" : "p");
                if (hr && hr.ability === "baseRage") amount += hr.abilityVal || 1;
                const house = B.units.find((v) => v.side === side
                    && v.def.type === "building" && v.def.treeHomes);
                if (house) {
                    damageUnit(house, amount, null, "crash");
                    punch(root.hud);
                    return; // урон ушёл в «Дома на деревьях» — база не тронута
                }
                // «Абсолютная защита» (hw267, W78): в ход противника первый
                // урон базе активирует ловушку и проходит, дальнейшие уроны
                // этого хода отфильтрованы гейтом в начале функции
                if (B.traps) absGuardCheck();
                if (side === "p") B.playerBase -= amount; else B.enemyBase -= amount;
                if (where) floatText(where.x, where.y, `−${amount}`, where.fill);
                fxEvent("base", {
                    x: where ? where.x : 960,
                    y: where ? where.y : (side === "p" ? 840 : 240),
                    color: side === "p" ? 0xff7a5e : 0xffb26e,
                });
                punch(root.hud);
                // «Эльф-разбойник» (grwRaider, W40): ПЕРВЫЙ раз за бой,
                // нанеся урон вражеской базе, наносит 4 урона по случайной
                // постройке противника. Разбирающий — сторона, ПРОТИВОПОЛОЖНАЯ
                // получившей урон базе (само-урон своей базе способность
                // «чужим» не считает)
                if (!B.heroFlags.baseHitBuild[side === "p" ? "e" : "p"]) {
                    const hd = heroDefOf(side === "p" ? "e" : "p");
                    if (hd && hd.ability === "firstBaseHitBuild") {
                        B.heroFlags.baseHitBuild[side === "p" ? "e" : "p"] = true;
                        const blds = B.units.filter((v) =>
                            v.side === side && v.def.type === "building");
                        if (blds.length) {
                            const v = blds[(Math.random() * blds.length) | 0];
                            const bp = cellXY(v.col, v.row);
                            floatText(bp.x, bp.y - 66, `${hd.abilityVal || 4}`, 0xff8f6e);
                            damageUnit(v, hd.abilityVal || 4, null, "dam");
                        }
                    }
                }
                // «Тёмный владыка» (darklord, босс данжа Времени, просил
                // юзер): ПЕРВЫЙ за бой урон его базе отражается — базе
                // противника наносится столько же. Флаг ставится ДО
                // отражения — рекурсии нет; редирект «Домами на деревьях»
                // выше до сюда не доходит (база урона не получала)
                if (!B.heroFlags.baseReflect[side]) {
                    const hdr = heroDefOf(side);
                    if (hdr && hdr.ability === "baseReflect") {
                        B.heroFlags.baseReflect[side] = true;
                        const op = side === "p" ? "e" : "p";
                        floatText(960, side === "p" ? 800 : 280,
                            "⟲ " + GAME_LOC.t("hero.darklord.name"), 0xb07ad5);
                        sfx("chpoc");
                        damageBase(op, amount,
                            { x: 960, y: op === "p" ? 840 : 240, fill: 0xb07ad5 });
                    }
                }
                // «Неусыпный гарнизон» (hon194): база получила урон — ловушка
                // снимается и заселяет два ближайших к базе ряда Прихожанами
                // (arenaTraps/garrisonRise)
                garrisonRise(side);
            };


            A.baseHit = function baseHit(side, u) {
                sfx("crash");
                procEnchantFire(u); // «Огненное дыхание» срабатывает и на базе
                procSpores(u, u.curAtk); // споры: удар по чужой базе бьёт и свою
                // «Тараномобиль» (tim212): удар по базе противника — двойной урон
                const baseDmg = u.curAtk * (u.def.siegeDouble ? 2 : 1);
                damageBase(side === "p" ? "e" : "p", baseDmg,
                    side === "p"
                        ? { x: cellXY(u.col, 0).x, y: cellXY(u.col, 0).y - 15, fill: 0xff8f6e }
                        : { x: cellXY(u.col, GRID - 1).x, y: cellXY(u.col, GRID - 1).y + 15, fill: 0xff5f4e });
                bigStomp(u); // «Большой размер» (sgrBig): существо 6+⚔ атакует базу — +1 урон базе
            };

            // «Ярость природы» (Рыжий лес, W54 — спека юзера; текст в HUD
            // данжа): ДВУХЦВЕТНАЯ карта Сила+Рост (multi содержит обе
            // стихии) при розыгрыше наносит 1 урон базе ВРАГА играющего.
            // Особенность данжа — читаем CAVES[fury] по данжу забега.
            // Хуки: addUnit (юниты/постройки — общая точка ОБОИХ сторон) и
            // spendCard (игрок, заклинания/ловушки); у мульти-заклинаний
            // и ловушек хук появится вместе с ними
            A.multiFury = function multiFury(cardId, side) {
                const def = CARDS[cardId];
                if (!def || !def.multi
                    || !def.multi.includes("strength")
                    || !def.multi.includes("growth")) return;
                const cd = G.dungeon
                    && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                if (!cd || !cd.fury) return;
                // Поправка юзера (W79.2): «Особенность этого подземелья
                // для всех врагов» — особенности ДВУХЦВЕТНЫХ данжей
                // работают ТОЛЬКО у врагов; розыгрыш такой карты
                // игроком в данже ничего не делает
                if (side !== "e") return;
                const op = side === "p" ? "e" : "p";
                floatText(960, op === "p" ? 758 : 318,
                    GAME_LOC.t("dungeon.furyShort"), 0xc86a3e);
                damageBase(op, 1, { x: 960, y: op === "p" ? 830 : 250,
                    fill: 0xc86a3e });
                sfx("chpoc");
            };

            // «Растущая доблесть» (Белая пуща, W62 — спека юзера; текст в
            // HUD данжа): ЗЕЛЁНО-БЕЛАЯ (двухцветная Рост+Честь) карта при
            // розыгрыше даёт СЛУЧАЙНОМУ существу ИГРАЮЩЕГО +1/+1. Особенность
            // данжа — читаем CAVES[valor] по данжу забега. Бафф — через
            // общий хук onBuff: Корона леса повторит усиление, волк усилит
            // соседей, «Зелёные рыцари» вылечат базу. Хуки: addUnit (юниты/
            // постройки, обе стороны), castSpell игрока ДО эффекта
            // (призванное самой картой в пул не попадает; отменённое
            // «Отменой заклинания» молчит), ловушки игрока — в spendCard,
            // заклинания/ловушки ИИ — в aiPlay перед эффектом
            A.multiValor = function multiValor(cardId, side) {
                const def = CARDS[cardId];
                if (!def || !def.multi
                    || !def.multi.includes("growth")
                    || !def.multi.includes("honor")) return;
                const cd = G.dungeon
                    && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                if (!cd || !cd.valor) return;
                // Поправка юзера (W79.2): особенности данжей — только
                // у врагов («для всех врагов»)
                if (side !== "e") return;
                floatText(960, side === "p" ? 758 : 318,
                    GAME_LOC.t("dungeon.valorShort"), 0x9fd489);
                // случайное существо ИГРАЮЩЕГО (W73: под «Лесным оплотом»
                // постройки тоже в пуле — Корона леса повторит усиление)
                const own = B.units.filter((v) => v.side === side
                    && effCreature(v) && B.units.includes(v));
                if (own.length) {
                    const u = own[(Math.random() * own.length) | 0];
                    u.bonusAtk = (u.bonusAtk || 0) + 1;
                    u.hp += 1;
                    recalcAuras();
                    const an = u.node.getChildByName("atk");
                    if (an) an.text = String(u.curAtk);
                    const hn = u.node.getChildByName("hp");
                    if (hn) hn.text = String(u.hp);
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 39, "+1⚔ +1♥", 0x9fd489);
                    fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.7 });
                    onBuff(u, 1, 1);
                }
                sfx("chpoc");
            };

            // «Переплетение сил» (Небесный дворец, W75 — спека юзера; текст
            // в HUD данжа): БЕЛО-СИНЯЯ (двухцветная Честь+Мудрость) карта
            // при розыгрыше даёт случайному существу ИГРАЮЩЕГО случайный
            // положительный эффект. Особенность данжа — читаем CAVES[weave]
            // по данжу забега. Хуки — как у «Растущей доблести»: addUnit
            // (юниты/постройки, обе стороны), castSpell игрока ДО эффекта,
            // ловушки игрока — в spendCard, заклинания/ловушки ИИ — в
            // aiPlay перед эффектом
            A.multiWeave = function multiWeave(cardId, side) {
                const def = CARDS[cardId];
                if (!def || !def.multi
                    || !def.multi.includes("honor")
                    || !def.multi.includes("wisdom")) return;
                const cd = G.dungeon
                    && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                if (!cd || !cd.weave) return;
                // Поправка юзера (W79.2): особенности данжей — только
                // у врагов («для всех врагов»)
                if (side !== "e") return;
                floatText(960, side === "p" ? 758 : 318,
                    GAME_LOC.t("dungeon.weaveShort"), 0x8cd0ef);
                // случайное существо ИГРАЮЩЕГО (как в «Растущей доблести»:
                // под «Лесным оплотом» постройки тоже в пуле — effCreature)
                const own = B.units.filter((v) => v.side === side
                    && effCreature(v) && B.units.includes(v));
                if (own.length) {
                    const u = own[(Math.random() * own.length) | 0];
                    // пул положительных эффектов — на примитивах движка:
                    // усиления через onBuff (эхо «Короны леса», волк),
                    // «Защита» — режется в damageUnit (как у Леона)
                    const p = cellXY(u.col, u.row);
                    const roll = (Math.random() * 4) | 0;
                    if (roll === 0) { // +1/+1
                        u.bonusAtk = (u.bonusAtk || 0) + 1;
                        u.hp += 1;
                        recalcAuras();
                        const an = u.node.getChildByName("atk");
                        if (an) an.text = String(u.curAtk);
                        const hn = u.node.getChildByName("hp");
                        if (hn) hn.text = String(u.hp);
                        floatText(p.x, p.y - 39, "+1⚔ +1♥", 0x9fd489);
                        onBuff(u, 1, 1);
                    } else if (roll === 1) { // +2 к урону
                        u.bonusAtk = (u.bonusAtk || 0) + 2;
                        recalcAuras();
                        const an = u.node.getChildByName("atk");
                        if (an) an.text = String(u.curAtk);
                        floatText(p.x, p.y - 39, "+2⚔", 0x9fd489);
                        onBuff(u, 2, 0);
                    } else if (roll === 2) { // +2 к жизням
                        u.hp += 2;
                        recalcAuras();
                        const hn = u.node.getChildByName("hp");
                        if (hn) hn.text = String(u.hp);
                        floatText(p.x, p.y - 39, "+2♥", 0x9fd489);
                        onBuff(u, 0, 2);
                    } else { // «Защита 1»
                        u.protect = (u.protect || 0) + 1;
                        if (A.refreshProtectMark) A.refreshProtectMark(u);
                        floatText(p.x, p.y - 72,
                            "✦ " + GAME_LOC.t("status.protect.name"), 0x8cd0ef);
                        fxEvent("ward", { x: p.x, y: p.y - 12, scale: 0.66 });
                    }
                    fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.7 });
                }
                sfx("chpoc");
            };

            // «Глубокое изучение» (Магодром, W79 — спека юзера; текст в
            // HUD данжа): при розыгрыше ДВУХЦВЕТНОЙ карты Мудрость+Время
            // (elem "wisTim") играющий берёт карту из колоды. Особенность
            // данжа — читаем CAVES[study] по данжу забега. Хуки — как у
            // остальных особенностей: addUnit (юниты/постройки, обе
            // стороны), castSpell игрока ДО эффекта, ловушки игрока — в
            // spendCard, заклинания/ловушки ИИ — в aiPlay перед эффектом
            A.multiStudy = function multiStudy(cardId, side) {
                const def = CARDS[cardId];
                // Жетоны (Сервитор wtMagic) — не «розыгрыш двухцветной
                // карты», особенность не будит (элемент у жетона wisTim)
                if (!def || def.elem !== "wisTim" || def.token) return;
                const cd = G.dungeon
                    && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                if (!cd || !cd.study) return;
                // Поправка юзера (W79.2): «Особенность этого подземелья
                // для всех врагов» — только у врагов
                if (side !== "e") return;
                floatText(960, side === "p" ? 758 : 318,
                    GAME_LOC.t("dungeon.studyShort"), 0x9a8ce8);
                if (side === "p") {
                    drawCards(1);
                } else if (B.eDeck.length) { // добор врага — верх колоды
                    B.eHand.push(B.eDeck.pop());
                }
                sfx("chpoc");
            };

            // «Зараза из глубин» («Некро-раскопки», W82 — спека юзера;
            // текст в HUD данжа): при розыгрыше ДВУХЦВЕТНОЙ карты
            // Время+Тлен (elem "timDec") случайный враг ИГРАЮЩЕГО
            // (существо/постройка/база) теряет 1 жизнь; если это существо —
            // дополнительно −1 к урону ВСЕГДА (поправка юзера: запись
            // «−1/0» — синтаксис статов «урон/жизни», т.е. урон −1, жизни
            // 0 — не «или», не 50/50). Особенность данжа — читаем
            // CAVES[plague] по данжу забега. Хуки — как у остальных
            // особенностей: addUnit (юниты/постройки, обе стороны),
            // castSpell игрока ДО эффекта, ловушки игрока — в spendCard,
            // заклинания/ловушки ИИ — в aiPlay перед эффектом
            A.multiPlague = function multiPlague(cardId, side) {
                const def = CARDS[cardId];
                // Жетоны — не «розыгрыш двухцветной карты» (гейт, как у study)
                if (!def || def.elem !== "timDec" || def.token) return;
                const cd = G.dungeon
                    && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                if (!cd || !cd.plague) return;
                // Поправка юзера (W79.2): «Особенность этого подземелья
                // для всех врагов» — только у врагов
                if (side !== "e") return;
                floatText(960, 318,
                    GAME_LOC.t("dungeon.plagueShort"), 0xc79af0);
                // случайный враг играющего: существа/постройки поля + база
                // («последний билет» — как у «Тёмного царя», W81)
                const foes = B.units.filter((v) => v.side === "p"
                    && B.units.includes(v));
                const pick = (Math.random() * (foes.length + 1)) | 0;
                if (pick >= foes.length) {
                    damageBase("p", 1, { x: 960, y: 840, fill: 0xb07ad5 });
                } else {
                    const t = foes[pick];
                    const fp = cellXY(t.col, t.row);
                    floatText(fp.x, fp.y - 60, "1", 0xef9f8c);
                    damageUnit(t, 1, null, "dam");
                    // существо — дополнительно −1 к урону ВСЕГДА («−1/0»);
                    // погибло от первой жизни — ослаблять некого
                    if (t.def.type === "unit" && B.units.includes(t)) {
                        t.bonusAtk = (t.bonusAtk || 0) - 1;
                        recalcAuras();
                        const an = t.node.getChildByName("atk");
                        if (an) an.text = String(t.curAtk);
                        const p2 = cellXY(t.col, t.row);
                        floatText(p2.x, p2.y - 84, "−1⚔", 0xc79af0);
                    }
                }
                sfx("chpoc");
            };

            // «Из портала» («Портал в бездну», W95 — спека юзера; текст
            // в HUD данжа): при розыгрыше ДВУХЦВЕТНОЙ карты Тлен+Сила
            // (elem "decStr") на случайное существо ИГРАЮЩЕГО кладётся
            // эффект «Призыв 2» (summonTarget — arenaSpells; счётчик
            // тикает в начале хода владельца — summonTick, arenaUpkeep).
            // Особенность данжа — читаем CAVES[portal] по данжу забега.
            // Хуки — как у остальных особенностей: addUnit (юниты/
            // постройки, обе стороны), castSpell игрока ДО эффекта,
            // ловушки игрока — в spendCard, заклинания/ловушки ИИ — в
            // aiPlay перед эффектом
            A.multiPortal = function multiPortal(cardId, side) {
                const def = CARDS[cardId];
                // Жетоны (Гоблин из «Игры в кости») — не «розыгрыш
                // двухцветной карты» (гейт, как у study/plague)
                if (!def || def.elem !== "decStr" || def.token) return;
                const cd = G.dungeon
                    && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                if (!cd || !cd.portal) return;
                // Поправка юзера (W79.2): «Особенность этого подземелья
                // для всех врагов» — только у врагов
                if (side !== "e") return;
                // случайное СУЩЕСТВО играющего врага (постройка — не
                // существо); существ нет — класть «Призыв» некуда
                const own = B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && B.units.includes(v));
                if (!own.length) return;
                floatText(960, 318,
                    GAME_LOC.t("dungeon.portalShort"), 0xef9f8c);
                summonTarget(own[(Math.random() * own.length) | 0], 2, "e");
            };

            // «Круг стихий» (wis102): в начале хода владельца разыгрывает
            // случайного Элементаля из руки в случайную пустую соседнюю
            // (верт/гориз) клетку без траты энергии. Карта уходит в сброс,
            // «Отмена призыва» врага ловит этот призыв, как обычный.
        }
    };
})();
