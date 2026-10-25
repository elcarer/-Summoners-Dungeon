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
                if (hand.includes(id)) return false; // уже в руке — второй копии не надо
                hand.push(id); // карты не было ни в одной зоне — возвращаем копию
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
                if (u.token) return;
                if (returnCardToHand(u.side, id))
                    floatText(p.x, p.y - 66, "↩ " + GAME_LOC.t(`card.${id}.name`), 0x8cd0ef);
            };


            A.killUnit = function killUnit(u, killer) {
                if (u && B.units.includes(u)) {
                    const dp = cellXY(u.col, u.row);
                    fxEvent("death", {
                        x: dp.x, y: dp.y - 8, color: fxColorOf(u.def.elem),
                        scale: u.def.type === "building" ? 1.2 : 1,
                    });
                }
                removeUnit(u);
                sfx("die");
                // «Иллюзия» (wis108): погибает вместе с существом, чьи статы
                // скопировала. Штатный killUnit — каскады смерти работают.
                for (const v of B.units.slice()) {
                    if (v.illusionOf === u && v.def.illusion && B.units.includes(v))
                        killUnit(v, null);
                }
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
                exhumingReplay(u); // «Выкапливание»: существо возвращается после смерти
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
                if (u.entangle) { u.entangle = 0; n++; }
                if (u.frozen) { u.frozen = 0; n++; }
                if (u.spellWard) { u.spellWard = false; n++; removeWardMark(u); }
                if (u.exhuming) { u.exhuming = 0; n++; updateExhumingMark(u); }
                // «Иллюзия» (wis108): без способности связь с источником
                // больше не действует — смерть источника её не убивает
                if (u.illusionOf) u.illusionOf = null;
                for (const m of ["sporeMark", "enchMark", "protectMark", "berserkMark", "confuseMark",
                    "venomMark", "poisonMark", "entangleMark", "frozenMark", "exhumingMark"]) {
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

            // snd — звук удара: "sword" (атака существом), "acid" (ловушка),
            // "rocket" (заклинание), по умолчанию "dam"

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
                    fxEvent("ward", { x: wp.x, y: wp.y - 14, scale: 0.72 });
                    sfx("aqua");
                    return;
                }
                // «Защита N» («Защитный кокон») режет входящий урон до нуля;
                // споры/огненное дыхание реагируют на ФАКТИЧЕСКИ прошедший урон
                let amt = amount;
                let blocked = 0;
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
                target.hp -= amt;
                procEnchantFire(killer);
                procSpores(killer, amt); // «Призрачные споры» отражают урон по базе
                const n = target.node.getChildByName("hp");
                if (n) n.text = String(Math.max(0, target.hp));
                const p = cellXY(target.col, target.row);
                floatText(p.x, p.y - 36, `−${amt}`, 0xffb26e);
                if (amt > 0) {
                    fxEvent("impact", {
                        x: p.x, y: p.y - 16,
                        color: snd === "acid" ? 0x9fd46a
                            : snd === "rocket" ? 0xffa45e
                            : snd === "monolith" ? 0xd0b0ef : 0xffb26e,
                        power: Math.min(1.8, 0.72 + amt * 0.12),
                        scale: target.def.type === "building" ? 1.12 : 0.9,
                        slash: snd === "sword",
                    });
                }
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
                sfx("up");
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
                const house = B.units.find((v) => v.side === side
                    && v.def.type === "building" && v.def.treeHomes);
                if (house) {
                    damageUnit(house, amount, null, "crash");
                    punch(root.hud);
                    return;
                }
                if (side === "p") B.playerBase -= amount; else B.enemyBase -= amount;
                if (where) floatText(where.x, where.y, `−${amount}`, where.fill);
                fxEvent("base", {
                    x: where ? where.x : 960,
                    y: where ? where.y : (side === "p" ? 840 : 240),
                    color: side === "p" ? 0xff7a5e : 0xffb26e,
                });
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

            // «Круг стихий» (wis102): в начале хода владельца разыгрывает
            // случайного Элементаля из руки в случайную пустую соседнюю
            // (верт/гориз) клетку без траты энергии. Карта уходит в сброс,
            // «Отмена призыва» врага ловит этот призыв, как обычный.
        }
    };
})();
