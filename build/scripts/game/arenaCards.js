// СЦЕНА «АРЕНА»: стоимость карт и способности героев.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installCards = function installCards(A) {
        with (A) {
            A.goblinDiscount = function goblinDiscount(side) {
                return B.units.some((u) => u.side === side && u.def.leaderAura) ? 1 : 0;
            };
            A.effCost = function effCost(cardId, side = "p", target = null) {
                const def = CARDS[cardId];
                if (!def) return 0;
                // «Мастер порталов» (tim231): карта, взятая с верха колоды
                // его способностью, разыгрывается без траты энергии, пока
                // лежит в руке владельца (не разыгранная — вернётся на
                // верх колоды portalRefund-ом в начале хода противника)
                if (B) {
                    const free = side === "p" ? B.pPortalFree : B.ePortalFree;
                    if (free === cardId
                        && (side === "p" ? B.hand : B.eHand).includes(cardId)) return 0;
                }
                let d = isGoblin(def) && B ? goblinDiscount(side) : 0;
                // «Мастер холода» (wisMaster): заклинания стихии «Мудрость»
                // ценой 4 стоят на 1 энергию меньше (способность обеих сторон)
                if (def.type === "spell" && def.elem === "wisdom" && def.cost === 4) {
                    const hd = heroDefOf(side);
                    if (hd && hd.ability === "wis4SpellDiscount") d += hd.abilityVal || 1;
                }
                // «Город мудрости» (wisCity): ПЕРВАЯ сыгранная постройка
                // стороны стоит на 2 энергии дешевле. Флаг за бой тратится в
                // addUnit (после реальной постановки), поэтому скидка видна
                // и в тинте руки, и в расчётах ИИ.
                if (def.type === "building" && B) {
                    const hd = heroDefOf(side);
                    if (hd && hd.ability === "firstBuildingDiscount"
                        && !B.heroFlags.firstBuilding[side]) d += hd.abilityVal || 2;
                }
                // «Деревня» (hon173): все ПОСТРОЙКИ стороны на 1 энергию
                // дешевле, пока их Деревня на поле (считаем по живым
                // постройкам — гибель снимает скидку, как аура)
                if (def.type === "building" && B
                    && B.units.some((u) => u.side === side && u.def.village)) d += 1;
                // «Строительный кран» (tim226): все ПОСТРОЙКИ стороны на
                // 1 энергию дешевле ЗА КАЖДЫЙ кран на поле (складывается
                // с «Деревней» и с другими кранами)
                if (def.type === "building" && B)
                    d += B.units.filter((u) => u.side === side
                        && u.def.type === "building" && u.def.crane).length;
                // «Конвейер» (tim225): карты «Конвейер» в этот ход на 1
                // энергию дешевле за КАЖДУЮ карту, разыгранную стороной с
                // руки (счётчик B.convey[side] {turn, n} — notePlay в
                // spendCard/aiPlay; скидка живёт, пока есть живой Конвейер)
                if (def.conveyor && B && B.units.some((u) => u.side === side
                    && u.def.type === "building" && u.def.conveyor)) {
                    const cp = B.convey && B.convey[side];
                    if (cp && cp.turn === B.turnNo) d += cp.n;
                }
                // «Архилич» (decLich): ПЕРВАЯ сыгранная Эпическая карта
                // стороны стоит на 2 энергии дешевле. Флаг тратится в момент
                // реальной оплаты (consumeEpicDiscount), поэтому скидка видна
                // и в тинте руки, и в расчётах ИИ (зеркало «Города мудрости»)
                if (def.rarity === "epic" && B) {
                    const hd = heroDefOf(side);
                    if (hd && hd.ability === "epicDiscount"
                        && !B.heroFlags.epicDiscount[side]) d += hd.abilityVal || 2;
                }
                // «Озверевший шатун» (grw36): −1 за каждое СВОЁ Животное на поле
                if (def.animalCost && B)
                    d += B.units.filter((v) => v.side === side
                        && v.def.type === "unit" && v.def.creature === "animal").length;
                // «Заклятый древоброд» (grw37): заклинание с прицелом на него
                // стоит на 1 энергию меньше — любому кастующему
                if (def.type === "spell" && target && target.col !== undefined && B) {
                    const aim = unitAt(target.col, target.row);
                    if (aim && aim.def.targetDiscount) d += 1;
                }
                return Math.max(0, def.cost - d);
            };
            // «Архилич» (decLich): трата флага первой Эпической карты —
            // зовётся из точек РЕАЛЬНОЙ оплаты карты (игрок: castSpell/
            // playCardAt; ИИ: aiPlay). Бесплатные касты (руна, повторы
            // «Горящих рун», послушник) флаг не тратят — карта не «стоит».
            A.consumeEpicDiscount = function consumeEpicDiscount(cardId, side) {
                const def = CARDS[cardId];
                if (!B || !def || def.rarity !== "epic") return;
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "epicDiscount"
                    || B.heroFlags.epicDiscount[side]) return;
                B.heroFlags.epicDiscount[side] = true;
                const n = hd.abilityVal || 2;
                floatText(960, side === "p" ? 640 : 300, `−${n}⚡`, 0xc9a0ef);
                sfx("chpoc");
            };
            // «Пастух росянок» (grw40): пока он на поле стороны, способности
            // Растений (метка plant) этой стороны срабатывают на 1 раз больше
            // (несколько Пастухов складываются)
            A.plantEcho = function plantEcho(side) {
                if (!B) return 0;
                return B.units.filter((u) => u.side === side && u.def.plantEcho).length;
            };
            // Урон заклинания с ростом: «Колдовское варево» — +1 за каждое
            // разыгранное ранее в этом бою (счёт общий на обе стороны).
            // «Алтарь огня» (spellAura): +N ко ВСЕМУ урону от заклинаний и
            // ловушек стороны (сумма по строениям на поле).
            A.altarBonus = function altarBonus(side) {
                return B.units.reduce((s, u) => s
                    + (u.side === side && u.def.type === "building" && u.def.spellAura
                        ? u.def.spellAura : 0), 0);
            };

            // ── Герой стороны (карты персонажей, просил юзер): у игрока —
            // G.heroId, у врага — hero энкаунтера (HEROES[enc.hero]). У драфта
            // и Рощи Роста карты пока нет — null.
            A.heroDefOf = function heroDefOf(side) {
                if (!B) return null;
                if (side !== "e") return HEROES[G.heroId] || HEROES.gorbag;
                const enc = ENCOUNTERS[B.encId] || ENCOUNTERS.gob;
                return enc.hero && HEROES[enc.hero] ? HEROES[enc.hero] : null;
            };
            // «Скорость N» существа — РАВНОПРАВНАЯ способность (просил юзер:
            // у существ нет «ключевых» способностей, все одинаковы). У
            // большинства карт это ключевое слово ability — "dash1"
            // («Скорость 1»), "dashN" («Скорость N», abilityVal). У существ,
            // у которых слот ability уже занят другой способностью
            // («Наездник грифона» hw262 — «Полёт»), «Скорость» живёт
            // собственным флагом dashN (= N) — наравне с «Возрождением»
            // (undying) и прочими именными способностями. ВСЕ проверки
            // «Скорости» (рывок после призыва, бонус героя «Конницы»,
            // оценки ИИ) идут через этот хелпер — второй сорт исключён.
            // Возвращает N (1 для «Скорости 1»), 0 — способности нет
            A.unitDash = function unitDash(def) {
                if (!def) return 0;
                if (def.ability === "dash1") return 1;
                if (def.ability === "dashN") return def.abilityVal || 2;
                return def.dashN || 0;
            };
            // Бонус урона заклинаний от способности героя стороны:
            // «Гоблины-мародёры» (firstSpellDmg) — ПЕРВОЕ уронное заклинание
            // боя бьёт на 1 сильнее (флаг на бой, тратится при реальном уроне);
            // «Гоблины-поджигатели» (strengthSpellDmg) — заклинания стихии
            // «Сила» бьют существ на 1 сильнее (постройки и базу — нет).
            // consume=false — прикидка (выбор цели ИИ): флаг не тратится.
            A.spellDealsDmg = function spellDealsDmg(def) {
                return !!(def && def.spell && (def.spell.dmg || def.spell.baseDmg
                    || def.spell.aoeDmg || def.spell.drainAll
                    || def.spell.fireflies || def.spell.growthHand));
            };
            A.heroSpellBonus = function heroSpellBonus(def, side, toUnit, consume = false) {
                const hd = heroDefOf(side);
                if (!hd) return 0;
                let b = 0;
                if (hd.ability === "firstSpellDmg" && spellDealsDmg(def)
                    && !B.heroFlags.firstSpell[side]) {
                    if (consume) B.heroFlags.firstSpell[side] = true;
                    b += 1;
                }
                if (hd.ability === "strengthSpellDmg" && def && def.elem === "strength"
                    && toUnit) b += 1;
                // «Лесная магия» (growthSpellDmg): заклинания стихии «Рост»
                // бьют существ на 1 сильнее (постройки и базу — нет)
                if (hd.ability === "growthSpellDmg" && def && def.elem === "growth"
                    && toUnit) b += hd.abilityVal || 1;
                return b;
            };
            // «Отряд стрелков» (ghShoot, heroes/72, W72, спека юзера;
            // W72-дополнение по просьбе юзера — ЛЮБАЯ способность существа):
            // когда способность СУЩЕСТВА стороны наносит урон — на 1 больше.
            // Точки применения: «Выстрел» (archerShot в arenaCombat: марш,
            // паровой выстрел, залп «Неба в стрелах»), «Сокрушение»
            // (лишний урон в базу), всплеск «Древоброда глухой чащи»,
            // всплеск «Поджигателя», «Эльф огня», «Секироносец». Урон
            // ЗАКЛИНАНИЙ (в т.ч. «Атака духов волков» и сплэш «Круговой
            // атаки» — эффекты заклинаний) и уронные способности
            // ПОСТРОЕК («Осадная башня», ров) способность не бустит.
            // killer — наноситель
            A.abilDmgBump = function abilDmgBump(killer, amt) {
                if (amt > 0 && killer && killer.def
                    && killer.def.type === "unit") {
                    const hd = heroDefOf(killer.side);
                    if (hd && hd.ability === "abilDmg")
                        return amt + (hd.abilityVal || 1);
                }
                return amt;
            };
            // «Лесной оплот» (ghBastion, heroes/73, W73, спека юзера):
            // все ПОСТРОЙКИ стороны считаются ДОПОЛНИТЕЛЬНО существами
            // для ЭФФЕКТОВ — баффы/ауры/лечение/уронные эффекты, счётчики
            // существ и цели заклинаний видят их наравне с существами
            // (примеры юзера: «Эльфийский друид» — призыв постройки даёт
            // +1⚡, «Корона леса» — повторяет усиление постройки). Боевые
            // правила не меняются: постройка не марширует и не атакует,
            // не двигается эффектами перемещения (Циклон, «Снежный ком»,
            // толчки), остаётся целью уничтожающего «Выстрела» «Осадной
            // башни»; статусы (яд/заморозка/запутанность/опутывание/
            // возврат) на постройки по-прежнему не вешаются. Уронные
            // дебаффы атаки (−N⚔) на постройку не начисляются — у неё
            // нет урона
            A.effCreature = function effCreature(u) {
                if (!u || !u.def) return false;
                if (u.def.type === "unit") return true;
                if (u.def.type !== "building") return false;
                const hd = heroDefOf(u.side);
                return !!(hd && hd.ability === "bldUnits");
            };
            A.spellDmg = function spellDmg(def, side = "p", toUnit = true, consume = false) {
                return (def.spell.dmg || 0) + (def.spell.brew ? (B.brewCasts || 0) : 0)
                    + altarBonus(side) + heroSpellBonus(def, side, toUnit, consume);
            };
            // «Мастера огня» (strengthSpellReplay): первое сыгранное стороной
            // заклинание стихии «Сила» возвращается в её руку (энергия уже
            // потрачена). Сожжённая «Сожжением» карта из боя уходит — флаг не
            // тратим, способность ждёт следующего заклинания. Бесплатные касты
            // (руна-ловушка, повторы «Горящих рун») способность не считают.
            A.heroStrReplay = function heroStrReplay(side, cardId, def) {
                if (!B || B.heroFlags.strReplay[side]) return;
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "strengthSpellReplay") return;
                if (!def || def.type !== "spell" || def.elem !== "strength") return;
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                if (discard[discard.length - 1] !== cardId) return; // сожжена
                discard.pop();
                hand.push(cardId);
                markFlyFrom(cardId, side); // прилетит из сброса (анимации руки)
                B.heroFlags.strReplay[side] = true;
                floatText(960, side === "p" ? 640 : 300,
                    `↩ ${GAME_LOC.t(`card.${cardId}.name`)}`, 0x9fd489);
                sfx("chpoc");
            };
            // «Дуновение опасности» (firstSpellEnergy): первое заклинание
            // стороны в бою даёт её владельцу +1⚡. Зовётся после оплаты
            // карты из руки (касты рун и повторы бесплатные — не в счёт).
            A.heroFirstSpellEnergy = function heroFirstSpellEnergy(side) {
                if (!B || B.heroFlags.spellEnergy[side]) return;
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "firstSpellEnergy") return;
                B.heroFlags.spellEnergy[side] = true;
                const n = hd.abilityVal || 1;
                if (side === "p") B.energy += n; else B.eEnergy += n;
                floatText(960, side === "p" ? 640 : 300, `+${n}⚡`, 0x8cd0ef);
                sfx("chpoc");
            };
            // «Путь воды» (firstTrapEnergy): первое срабатывание ЛЮБОЙ своей
            // ловушки в бою (клеточная, отмена, приманка, руна, «при гибели»)
            // даёт владельцу +1⚡. Зовётся из trapTriggered вместе с «Зимними
            // духами» — один раз за бой, флаг тратится на первом срабатывании.
            A.heroFirstTrapEnergy = function heroFirstTrapEnergy(side) {
                if (!B || B.heroFlags.trapEnergy[side]) return;
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "firstTrapEnergy") return;
                B.heroFlags.trapEnergy[side] = true;
                const n = hd.abilityVal || 1;
                if (side === "p") B.energy += n; else B.eEnergy += n;
                floatText(960, side === "p" ? 640 : 300, `+${n}⚡`, 0x8cd0ef);
                sfx("chpoc");
                refreshHud();
            };
            // «Сонм духов» (firstElementalDraw): ПЕРВОЕ срабатывание
            // способности СВОЕГО элементаля в бою даёт владельцу карту.
            // Зовётся из точек, где реально срабатывает способность:
            // «Зимние духи» (trapGrow), «Снежный элементаль» (frostAttack),
            // «Ледяной элементаль» (crush), «Старший ледовик» (frostNeighbors),
            // «Выросшие духи» (trapOnMove), «Воздушный элементаль» (flyOver).
            // Флаг на бой, как у остальных карт персонажей.
            A.heroElementalDraw = function heroElementalDraw(u) {
                if (!B || !u || !u.def || u.def.subtype !== "elemental") return;
                const side = u.side;
                if (B.heroFlags.elementalDraw[side]) return;
                const hd = heroDefOf(side);
                if (!hd || hd.ability !== "firstElementalDraw") return;
                B.heroFlags.elementalDraw[side] = true;
                const n = hd.abilityVal || 1;
                const hand = side === "p" ? B.hand : B.eHand;
                if (side === "p") drawCards(n); else drawEnemy(n);
                const drawn = hand[hand.length - 1];
                floatText(960, side === "p" ? 640 : 300,
                    `+ ${drawn ? GAME_LOC.t(`card.${drawn}.name`) : "…"}`, 0x8cd0ef);
                sfx("chpoc");
                refreshHud();
            };
            // «Безумный маг» (wisMad, firstMageDouble): ПЕРВАЯ за бой
            // реально сработавшая способность Мага стороны разрешается
            // дважды. fn возвращает false, если эффект не разрешился
            // (нет цели/ловушки/клетки) — тогда флаг не тратится.
            A.heroMageDouble = function heroMageDouble(u, fn) {
                if (!B || !u || !B.units.includes(u)) return false;
                const first = fn();
                if (first === false) return false;
                const hd = heroDefOf(u.side);
                if (!hd || hd.ability !== "firstMageDouble"
                    || B.heroFlags.mageDouble[u.side]) return true;
                B.heroFlags.mageDouble[u.side] = true;
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 96, "×2", 0xffd98c);
                sfx("chpoc");
                fn();
                return true;
            };
            // «Отряд соседа» (honNeighbor, heroes/37, просил юзер): ПЕРВАЯ за
            // бой реально сработавшая способность СУЩЕСТВА СТИХИИ Честь
            // стороны разрешается дважды. Образец — «Безумный маг» выше:
            // fn возвращает false, если эффект не разрешился (нет цели/
            // соседей/карт) — тогда флаг не тратится. opts.dead — носитель
            // уже удалён с поля («Нищий»: способность на смерть), позиция
            // для надписи — у базы его стороны.
            A.honorRelayAct = function honorRelayAct(u, fn, opts = {}) {
                if (!B || !u || !u.def) return fn();
                if (u.def.type !== "unit" || u.def.elem !== "honor") return fn();
                if (!opts.dead && !B.units.includes(u)) return fn();
                const first = fn();
                if (first === false) return false;
                const hd = heroDefOf(u.side);
                if (!hd || hd.ability !== "honorRelay"
                    || B.heroFlags.honorRelay[u.side]) return first;
                B.heroFlags.honorRelay[u.side] = true;
                const p = opts.dead ? { x: 960, y: 0 } : cellXY(u.col, u.row);
                floatText(p.x, (opts.dead ? (u.side === "p" ? 640 : 300)
                    : p.y - 96), "×2", 0xffd98c);
                sfx("chpoc");
                fn();
                return first;
            };
            // Итоговый урон заклинания по цели: у «Роя светлячков» (grw30) он
            // равен числу СВОИХ существ на поле (+ аура алтаря), у «Выстрела
            // стихией» (grw32) — числу карт Роста в руке, у прочих — spellDmg
            A.spellHitDmg = function spellHitDmg(def, side = "p", toUnit = true, consume = false) {
                if (def.spell.fireflies)
                    // «Рой светлячков» (grw30): урон = числу СВОИХ существ
                    // (W73: под «Лесным оплотом» постройки тоже считаются)
                    return B.units.filter((v) => v.side === side && effCreature(v)).length
                        + altarBonus(side) + heroSpellBonus(def, side, toUnit, consume);
                if (def.spell.growthHand) {
                    const hand = side === "p" ? B.hand : B.eHand;
                    let n = hand.filter((id) => CARDS[id] && CARDS[id].elem === "growth").length;
                    // эффект срабатывает до списания карты — сама она ещё в руке
                    if (hand.includes(cardIdOf(def))) n -= 1;
                    return n + heroSpellBonus(def, side, toUnit, consume);
                }
                return spellDmg(def, side, toUnit, consume);
            };

            // «Заклинатель клинков» (spellBuffAura): после КАЖДОГО розыгрыша
            // заклинания — любой стороной, включая повторы «Горящих рун» — он и
            // все соседние СУЩЕСТВА (строения не считаются) получают +1 к урону
            // навсегда (bonusAtk).
            // «Портал духов» (dec158, просил юзер): розыгрыш заклинания
            // ВЛАДЕЛЬЦЕМ портала (side — кастовавшая сторона; касты врага
            // портал не будят) призывает Призрака 2/1 (жетон ghost) на
            // первую пустую соседнюю (верт/гориз) клетку; все соседние
            // заняты — призыва нет. Способности существ (руна, послушник)
            // розыгрышем карты не считаются — их зовут БЕЗ стороны
            A.afterSpellPlayed = function afterSpellPlayed(side) {
                for (const b of B.units.slice()) {
                    if (!b.def.ghostPortal || !B.units.includes(b)) continue;
                    if (b.side !== side) continue; // только свои касты (dec158)
                    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                        const c2 = b.col + dc, r2 = b.row + dr;
                        if (c2 < 0 || c2 >= GRID || r2 < 0 || r2 >= GRID
                            || unitAt(c2, r2)) continue;
                        addUnit(b.side, "ghost", c2, r2, { token: true });
                        const gp = cellXY(c2, r2);
                        floatText(gp.x, gp.y - 108,
                            GAME_LOC.t("card.ghost.name"), 0xb7d0ef);
                        sfx("chpoc");
                        break;
                    }
                }
                for (const u of B.units.slice()) {
                    if (!u.def.spellBuffAura || !B.units.includes(u)) continue;
                    // «Заклинатель клинков»: +1⚔ себе и соседним СУЩЕСТВАМ
                    // (строения не считаются; W73: под «Лесным оплотом»
                    // постройка — тоже существо)
                    const near = B.units.filter((v) => v !== u && effCreature(v)
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1);
                    for (const v of [u, ...near]) {
                        v.bonusAtk = (v.bonusAtk || 0) + 1;
                        onBuff(v, 1, 0); // «Белая пуща» (W61)
                    }
                    recalcAuras();
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 66, "+1⚔", 0x9fd489);
                    punch(u.node);
                    sfx("chpoc");
                }
                // «Паладин света» (hon182, просил юзер): когда ВЛАДЕЛЕЦ
                // разыгрывает заклинание, существо получает +N к урону и +N к
                // жизням. Повторы «Горящих рун» тоже зовут хук со стороной —
                // растут вместе с повтором; касты противника не считают.
                // Рост — способность существа Чести: герой-релей («Отряд
                // соседа») может разрешить её дважды.
                for (const u of B.units.slice()) {
                    if (!u.def.spellGrow || u.side !== side
                        || !B.units.includes(u)) continue;
                    honorRelayAct(u, () => {
                        u.bonusAtk = (u.bonusAtk || 0) + u.def.spellGrow;
                        u.hp += u.def.spellGrow;
                        recalcAuras();
                        const an = u.node.getChildByName("atk");
                        if (an) an.text = String(u.curAtk);
                        const hn = u.node.getChildByName("hp");
                        if (hn) hn.text = String(u.hp);
                        const p = cellXY(u.col, u.row);
                        floatText(p.x, p.y - 75,
                            `+${u.def.spellGrow}⚔ +${u.def.spellGrow}♥`, 0x9fd489);
                        punch(u.node);
                        sfx("chpoc");
                        onBuff(u, u.def.spellGrow, u.def.spellGrow); // «Белая пуща» (W61)
                        return true;
                    });
                }
                // «Элементаль молнии» (hw266, W77 спека юзера): когда ВЛАДЕЛЕЦ
                // разыгрывает ЗАКЛИНАНИЕ, бьёт 1 урон случайному врагу
                // (существо/постройка/база наравне; zapRandomFoe — arenaCombat).
                // side не задан у кастов РУН (руна кастует сама, не владелец)
                // — те молчат. Релей героя-Чести может разрешить дважды.
                for (const u of B.units.slice()) {
                    if (!u.def.castZap || u.side !== side
                        || !B.units.includes(u)) continue;
                    honorRelayAct(u, () => { zapRandomFoe(u); return true; });
                }
                // «Техномагия» (wtMagic, W80 спека юзера): когда ВЛАДЕЛЕЦ
                // разыгрывает заклинание, призовите токен «Сервитор» 1/1
                // (Механизм, сине-фиолетовый) в случайную клетку игрового
                // поля, из клеток ближайших к его базе (servitorSummon
                // ниже). Касты рун/«Послушника» (без стороны) не будят;
                // хук зовут места розыгрыша заклинаний: castSpell (игрок),
                // aiPlay (ИИ), doubleCastAct (обе стороны). «Общие
                // загадки» применяют эффект БЕЗ розыгрыша — Сервитора не
                // зовут; «Высокая мощность» разыгрывает — зовут её место
                if (side) {
                    const hd = heroDefOf(side);
                    if (hd && hd.ability === "servitorOnSpell")
                        servitorSummon(side);
                }
            };
            // Жетон «Сервитор» (жетон «Техномагии», W80): случайная пустая
            // клетка из БЛИЖАЙШИХ к базе стороны — манхэттен до якоря базы
            // (центр своей крайней строки: у игрока ряд 4, у врага ряд 0).
            // Все 25 клеток заняты — призыва нет
            A.servitorSummon = function servitorSummon(side) {
                const baseRow = side === "p" ? GRID - 1 : 0;
                const best = [];
                let bd = 99;
                for (let r = 0; r < GRID; r++) {
                    for (let c = 0; c < GRID; c++) {
                        if (unitAt(c, r)) continue;
                        const d = Math.abs(c - 2) + Math.abs(r - baseRow);
                        if (d < bd) { bd = d; best.length = 0; best.push({ c, r }); }
                        else if (d === bd) best.push({ c, r });
                    }
                }
                if (!best.length) return;
                const pick = best[(Math.random() * best.length) | 0];
                addUnit(side, "servitor", pick.c, pick.r, { token: true });
                const p = cellXY(pick.c, pick.r);
                floatText(p.x, p.y - 108,
                    GAME_LOC.t("card.servitor.name"), 0x9a8ce8);
                sfx("chpoc");
            };
            // Тот же триггер «Элементаля молнии» для ЛОВУШЕК: послеTrapPlaced
            // зовут места фактической постановки ловушки владельцем из руки
            // (arenaActions — 3 ветки игрока; aiPlay — 3 пути ИИ). Отменённая
            // «Битвой умов» ловушка не ставится — её место вызова не зовёт.
            A.afterTrapPlaced = function afterTrapPlaced(side) {
                for (const u of B.units.slice()) {
                    if (!u.def.castZap || u.side !== side
                        || !B.units.includes(u)) continue;
                    honorRelayAct(u, () => { zapRandomFoe(u); return true; });
                }
            };
            // «Магопуты» (hwMagebonds, firstCardVoid, W77 спека юзера):
            // ПЕРВАЯ за бой карта, которую противник РАЗЫГРЫВАЕТ (юнит/
            // постройка, заклинание, ловушка — все розыгрыши ИЗ РУКИ),
            // отменяется: карта и энергия потрачены, эффекта нет (семантика —
            // как у ловушек «Отмена призыва»/«Отмена заклинания»). Зовут места
            // розыгрыша карт: arenaActions/aiPlay (юнит и 3 ветки ловушек),
            // arenaSpells.castSpell и aiPlay (заклинание). Флаг firstCard
            // ставится при КАЖДОМ розыгрыше стороны — способность срабатывает
            // ровно один раз, на первой карте, независимо от героя
            A.heroVoidFirstCancel = function heroVoidFirstCancel(side) {
                if (!B || B.heroFlags.firstCard[side]) return false; // не первая
                B.heroFlags.firstCard[side] = true;
                const hd = heroDefOf(side === "p" ? "e" : "p");
                if (!hd || hd.ability !== "firstCardVoid") return false;
                return true;
            };
        }
    };
})();
