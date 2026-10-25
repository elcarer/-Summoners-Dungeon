// СЦЕНА «АРЕНА»: ТИКИ ХОДА — upkeep: эффекты начала хода (постройки,
// алтари, «Тёмный алтарь»), элементальный круг, штормовик, пень обряда,
// росток и «Стена костров».
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installUpkeep = function installUpkeep(A) {
        with (A) {

            // «Круг стихий» (wis102): в начале хода владельца разыгрывает
            // случайного Элементаля из руки в случайную пустую соседнюю
            // (верт/гориз) клетку без траты энергии. Карта уходит в сброс,
            // «Отмена призыва» врага ловит этот призыв, как обычный.
            A.elementalCircleTick = function elementalCircleTick(b) {
                if (!B.units.includes(b)) return;
                const side = b.side;
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const picks = [];
                for (let i = 0; i < hand.length; i++) {
                    const d = CARDS[hand[i]];
                    if (d && d.type === "unit" && d.subtype === "elemental") picks.push(i);
                }
                if (!picks.length) return;
                const near = [];
                for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const c = b.col + dc, r = b.row + dr;
                    if (c < 0 || c >= GRID || r < 0 || r >= GRID) continue;
                    if (!unitAt(c, r)) near.push([c, r]);
                }
                if (!near.length) return;
                const cardId = hand.splice(picks[(Math.random() * picks.length) | 0], 1)[0];
                const [col, row] = near[(Math.random() * near.length) | 0];
                const p = cellXY(col, row);
                if (counterTrapConsume(side === "p" ? "e" : "p", "counterSummon")) {
                noteDiscard();
                    discard.push(cardId);
                    floatText(p.x, p.y - 60,
                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    return;
                }
                addUnit(side, cardId, col, row);
                noteDiscard();
                discard.push(cardId);
                floatText(p.x, p.y - 78, GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                sfx("chpoc");
            };

            // «Весёлый штормовик» (wis110): в начале хода владельца играет
            // случайное заклинание из СЛУЧАЙНОЙ колоды (игрока или врага)
            // без траты энергии. Каст идёт от хозяина выбранной колоды —
            // «вражеская» половина эффекта может ударить по самому штормовику.
            // Колода без заклинаний не выбирается (эпик не должен молча
            // простаивать, если заклинания есть хотя бы у одной стороны).

            // «Весёлый штормовик» (wis110): в начале хода владельца играет
            // случайное заклинание из СЛУЧАЙНОЙ колоды (игрока или врага)
            // без траты энергии. Каст идёт от хозяина выбранной колоды —
            // «вражеская» половина эффекта может ударить по самому штормовику.
            // Колода без заклинаний не выбирается (эпик не должен молча
            // простаивать, если заклинания есть хотя бы у одной стороны).
            A.stormerTick = function stormerTick(u) {
                if (!u || !B.units.includes(u)) return false;
                const decks = ["p", "e"].filter((side) => {
                    const deck = side === "p" ? B.deck : B.eDeck;
                    return deck.some((id) => CARDS[id] && CARDS[id].type === "spell");
                });
                if (!decks.length) return false;
                const side = decks[(Math.random() * decks.length) | 0];
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 84,
                    GAME_LOC.t(`card.${cardIdOf(u.def)}.name`), 0xffd98c);
                // focus — «атакующий» для рунного выбора цели: годится только
                // существо ПРОТИВОПОЛОЖНОЙ кастующему стороны. Свою колоду
                // штормовик играет с автоцелью (иначе ударил бы себя).
                castRandomSpell(side, side !== u.side ? u : null);
                return true;
            };

            // «Грибница»: в начало хода владельца даёт 1 энергию и теряет 1 жизнь
            // (энергия начисляется даже если грибница от этого урона погибает).
            // «Походный костёр»: соседние с ним существа (обе стороны) получают
            // 1 жизнь, а сам костёр теряет 1 — лечит раньше, так что даже
            // погибая от собственного жара, он успевает согреть соседей.

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
                    // «Меч в алтаре» (wis104): в начале хода владельца +1♥
                    if (b.def.altarSword) healUnit(b, 1);
                    // «Башня звездочёта» (wis105): сначала добор, затем −1♥
                    // (погибая от износа, башня всё равно даёт карту)
                    if (b.def.starTower) {
                        if (side === "p") drawCards(1); else drawEnemy(1);
                        const p = cellXY(b.col, b.row);
                        floatText(p.x, p.y - 66, `+1 ${GAME_LOC.t("card.wis105.name")}`, 0xffd98c);
                        sfx("chpoc");
                        damageUnit(b, 1, null, "dam");
                    }
                    if (b.def.elementalCircle) elementalCircleTick(b);
                    // «Тёмный алтарь» (dec128): в начале хода владельца
                    // случайное существо противника теряет 1 жизнь — снятие
                    // жизни напрямую (не входящий урон, как у «Песчаного
                    // духа»); на 0♥ жертва погибает. Алтарь с 2♥ мог погибнуть
                    // от самоповреждения построек выше — тогда не тикает
                    if (b.def.darkAltar && B.units.includes(b)) {
                        const foes = B.units.filter((v) => v.side !== side
                            && v.def.type === "unit");
                        if (foes.length) {
                            const victim = foes[(Math.random() * foes.length) | 0];
                            victim.hp -= 1;
                            recalcAuras();
                            const hn = victim.node.getChildByName("hp");
                            if (hn) hn.text = String(Math.max(0, victim.hp));
                            const vp = cellXY(victim.col, victim.row);
                            floatText(vp.x, vp.y - 60, "−1♥", 0xef9f8c);
                            punch(victim.node);
                            fxEvent("debuff", { x: vp.x, y: vp.y - 10, scale: 0.8 });
                            sfx("acid");
                            if (victim.hp <= 0) killUnit(victim, null);
                        }
                    }
                }
                // «Весёлый штормовик» (wis110): в начале хода владельца —
                // случайное заклинание из случайной колоды, без энергии.
                for (const u of B.units.slice()) {
                    if (u.side !== side || !u.def.stormer
                        || !B.units.includes(u)) continue;
                    stormerTick(u);
                }
                // «Песчаный дух» (wis109): в начале хода владельца теряет
                // 1 урон и 1 жизнь. Урон — постоянная убыль (atkPenalty),
                // жизнь снимается напрямую (не «входящий урон»: защита и
                // прочие реакции на удар не срабатывают). На 0♥ погибает.
                for (const u of B.units.slice()) {
                    if (u.side !== side || !u.def.sandDecay || !B.units.includes(u)) continue;
                    u.atkPenalty = (u.atkPenalty || 0) - 1;
                    u.hp -= 1;
                    recalcAuras();
                    const an = u.node.getChildByName("atk");
                    if (an) an.text = String(u.curAtk);
                    const hn = u.node.getChildByName("hp");
                    if (hn) hn.text = String(Math.max(0, u.hp));
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 60, "−1⚔ −1♥", 0xef9f8c);
                    punch(u.node);
                    sfx("dam");
                    // убыль — способность Элементаля: «Сонм духов» (wisSpirits)
                    // за первое её срабатывание в бою даёт владельцу карту
                    // (даже если Дух погибает от этой же убыли)
                    heroElementalDraw(u);
                    if (u.hp <= 0) killUnit(u, null);
                }
                refreshHud();
            };

            // «Пень обряда» (grw11), начало хода ИИ: подсматривает верхнюю карту
            // чужой или своей колоды — сильную карту игрока (цена 4+ или
            // эпическая) сбрасывает, свою слабую (цена ≤ 1 и мелкое существо)
            // тоже; иную карту оставляет наверху, как было

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
            // само существо (unit) и ездит с ним. Лимита ловушек нет (просил юзер).
            // «Битва умов» (wis114) противника: разыгранная ловушка отменяется
            // (зеркало counterSpell/counterSummon). Гейт на ВСЕ пути постановки
            // ловушек картой — рука, колода (руна/водный маг/штормовик),
            // повтор: armTrap зовёт его первым делом.

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
