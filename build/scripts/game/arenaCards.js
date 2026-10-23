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
                let d = isGoblin(def) && B ? goblinDiscount(side) : 0;
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
                B.heroFlags.strReplay[side] = true;
                floatText(960, side === "p" ? 640 : 300,
                    `↩ ${GAME_LOC.t(`card.${cardId}.name`)}`, 0x9fd489);
                sfx("up");
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
                sfx("aqua");
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
                sfx("aqua");
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
            // Итоговый урон заклинания по цели: у «Роя светлячков» (grw30) он
            // равен числу СВОИХ существ на поле (+ аура алтаря), у «Выстрела
            // стихией» (grw32) — числу карт Роста в руке, у прочих — spellDmg
            A.spellHitDmg = function spellHitDmg(def, side = "p", toUnit = true, consume = false) {
                if (def.spell.fireflies)
                    return B.units.filter((v) => v.side === side && v.def.type === "unit").length
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
            A.afterSpellPlayed = function afterSpellPlayed() {
                for (const u of B.units.slice()) {
                    if (!u.def.spellBuffAura || !B.units.includes(u)) continue;
                    const near = B.units.filter((v) => v !== u && v.def.type === "unit"
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1);
                    for (const v of [u, ...near]) {
                        v.bonusAtk = (v.bonusAtk || 0) + 1;
                    }
                    recalcAuras();
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 66, "+1⚔", 0x9fd489);
                    punch(u.node);
                    sfx("up");
                }
            };
        }
    };
})();
