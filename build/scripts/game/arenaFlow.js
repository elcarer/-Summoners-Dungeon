// СЦЕНА «АРЕНА»: добор, замешательство, марш и итог боя.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installFlow = function installFlow(A) {
        with (A) {
            // ── Колода/рука ─────────────────────────────────────────────────────
            A.shuffle = function shuffle(arr) {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = (Math.random() * (i + 1)) | 0;
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            };
            A.drawCards = function drawCards(count) {
                // в процессе хода рука ничем не ограничена — лимит 7 проверяется
                // только в конце хода (панель сброса)
                for (let k = 0; k < count; k++) {
                    if (!B.deck.length) { B.deck = shuffle(B.discard); B.discard = []; }
                    if (!B.deck.length) break;
                    B.hand.push(B.deck.pop());
                }
            };
            A.drawEnemy = function drawEnemy(count) {
                for (let k = 0; k < count; k++) {
                    if (!B.eDeck.length) { B.eDeck = shuffle(B.eDiscard); B.eDiscard = []; }
                    // «Подкрепление»: и колода, и сброс пусты — свежая тасовка
                    // базовой колоды врага (иначе в затяжном бою ИИ остаётся
                    // без карт и копит энергию — просил юзер)
                    if (!B.eDeck.length && B.eDeckBase) B.eDeck = shuffle([...B.eDeckBase]);
                    if (!B.eDeck.length) break;
                    B.eHand.push(B.eDeck.pop());
                }
            };

            // ── Способность героя «начиная бой берёт дополнительную случайную
            // карту … из колоды» (просил юзер): «Банда гоблинов» — карту
            // гоблина, «Засада гоблинов» — карту ловушки, «Лесные звери» —
            // карту животного, «Буйная растительность» — карту растения.
            // Вызывается в enter() ПОСЛЕ сборки root (всплывающий текст
            // рисуется в root.fx).
            A.heroStartDraw = function heroStartDraw(side) {
                const hd = heroDefOf(side);
                if (!hd) return;
                const want = hd.ability === "startDrawGoblin" ? "goblin"
                    : hd.ability === "startDrawTrap" ? "trap"
                    : hd.ability === "startDrawAnimal" ? "animal"
                    : hd.ability === "startDrawPlant" ? "plant" : null;
                if (!want) return;
                const deck = side === "p" ? B.deck : B.eDeck;
                const hand = side === "p" ? B.hand : B.eHand;
                const pool = deck.map((id, i) => ({ id, i, def: CARDS[id] }))
                    .filter((x) => want === "goblin" ? isGoblin(x.def)
                        : want === "trap" ? x.def.type === "trap"
                        : want === "animal"
                            ? x.def.type === "unit" && x.def.creature === "animal"
                            : !!x.def.plant); // растение — существо или постройка
                if (!pool.length) return;
                const pick = pool[(Math.random() * pool.length) | 0];
                deck.splice(pick.i, 1);
                hand.push(pick.id);
                sfx("chpoc");
                floatText(960, side === "p" ? 840 : 240,
                    `+ ${GAME_LOC.t(`card.${pick.id}.name`)}`, 0xffd98c);
            };

            // ── «Запутанность N» (ловушка «Путь грибов», просил юзер) ─────────
            // Запутанное существо вместо своего перемещения/атаки (всего марша,
            // включая доб. атаки берсерка) идёт на клетку НАЗАД — к своей базе —
            // а всех, кто преграждает путь (свои, чужие, постройки, своя база),
            // атакует, как будто они вражеские. Счётчик — оставшиеся СВОИ ходы:
            // сработал в марш/призыв → в начале следующих двух ходов владельца
            // пятится, затем эффект снимается.
            A.addConfusion = function addConfusion(u, turns) {
                u.confused = turns;
                let mark = u.node.getChildByName("confuseMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "confuseMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x5a3f7a });
                    g.stroke({ width: 3, color: 0xd0b0ef });
                    mark.addChild(g);
                    const tx = T("", 17, 0xf3e6ff);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(0, -66); // берсерк/очарование — по краям головы
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.confused);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 66, "✧", 0xb07ad5);
                sfx("aqua");
            };
            A.removeConfuseMark = function removeConfuseMark(u) {
                const mark = u.node && u.node.getChildByName("confuseMark");
                if (mark) mark.destroy({ children: true });
            };
            // Запутанное бьёт СВОЮ базу (зеркало baseHit: та же геометрия/цвета,
            // но минус стороне владельца) — база «мешает пройти»
            A.ownBaseHit = function ownBaseHit(u) {
                sfx("crash");
                procEnchantFire(u);
                procSpores(u, u.curAtk); // споры: удар по базе — тоже нанесение урона
                damageBase(u.side, u.curAtk,
                    u.side === "p"
                        ? { x: cellXY(u.col, GRID - 1).x, y: cellXY(u.col, GRID - 1).y + 15, fill: 0xff5f4e }
                        : { x: cellXY(u.col, 0).x, y: cellXY(u.col, 0).y - 15, fill: 0xff8f6e });
            };
            // Ход запутанного существа (вместо марша): шаг назад или удар
            // встанавшего на пути; у задней кромки позади своя база — бьёт её
            // и уходит с поля. Асинхронно из-за паузы глиссады, как марш.
            A.confusedAct = async function confusedAct(u) {
                if (!B.units.includes(u)) return;
                const back = u.row + (u.side === "p" ? 1 : -1);
                if (back < 0 || back >= GRID) {
                    ownBaseHit(u);
                    triggerAttackTraps(u); // удар по базе — тоже атака (руна)
                    removeUnit(u);
                    refreshHud();
                    checkEnd();
                    return;
                }
                const occ = unitAt(u.col, back);
                if (occ) { // любой на пути — «как будто вражеский»
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 60, "⚔", 0xb07ad5);
                    damageUnit(occ, u.curAtk, u, "sword");
                    frostAttack(u, occ); // «Снежный элементаль»: −1⚔ цели
                    triggerAttackTraps(u);
                    refreshHud();
                    checkEnd();
                    return;
                }
                u.row = back;
                const p = cellXY(u.col, u.row);
                glide(u, p.x, p.y);
                setWalk(u, true, u.side === "p" ? "walk_front" : "walk_back");
                sfx("step");
                await delay(0.52 / animK()); // глиссада + пауза: полный шаг походки
                if (B.stopped) return;
                afterMoved(u); // перемещение — вражеские ловушки могут сработать
                checkEnd();
            };

            // ── Марш: юниты стороны идут вперёд (строения стоят) ────────────────
            // Прыжок через «Зелёный портал» (grw21): существо, которое должно
            // пройти на клетку портала или атаковать его, перепрыгивает на
            // свободную клетку с противоположной стороны (как существа с
            // полётом) и получает +1 к урону и +1 к жизням — любой стороны
            // (просил юзер). Возвращает true, если перепрыгнул.
            A.portalLeapAct = async function portalLeapAct(u, occ, dir) {
                const over = occ.row + dir;
                if (over < 0 || over >= GRID || unitAt(occ.col, over)) return false;
                u.col = occ.col;
                u.row = over;
                u.bonusAtk += 1; // перманентный бонус — снимается «Извлечением духа»
                u.hp += 1;
                recalcAuras();
                const an = u.node.getChildByName("atk");
                if (an) an.text = String(u.curAtk);
                const hn = u.node.getChildByName("hp");
                if (hn) hn.text = String(u.hp);
                const p = cellXY(u.col, u.row);
                glide(u, p.x, p.y);
                setWalk(u, true);
                floatText(p.x, p.y - 72, "+1⚔ +1♥", 0x9fd489);
                punch(u.node);
                sfx("up");
                await delay(0.52 / animK()); // глиссада: полный шаг
                if (B.stopped) return true;
                afterMoved(u); // перемещение — ловушки врага
                return true;
            };
            A.marchSide = async function marchSide(side) {
                const dir = side === "p" ? -1 : 1;
                const order = B.units.filter((u) => u.side === side && u.def.type === "unit")
                    .sort((a, b) => (side === "p" ? a.row - b.row : b.row - a.row));
                for (const u of order) {
                    if (B.stopped || !B.units.includes(u)) continue;
                    if (u.confused > 0) { // «Запутанность»: марш заменён пятанием назад
                        await confusedAct(u);
                        if (B.stopped || B.phase === "over") return;
                        u.confused -= 1;
                        if (u.confused <= 0) { u.confused = 0; removeConfuseMark(u); refreshHud(); }
                        continue; // доб. атаки берсерка пропускает — не марширует
                    }
                    if (u.def.ability === "coward") { fleeCoward(u, side); continue; } // «Трусливый гоблин»
                    if (u.entangle > 0) {
                        // «Опутывание корней» (grw35): перемещение пропущено,
                        // счётчик тает на 1; атака по стоящему впереди врагу
                        // остаётся (до базы опутанный не достаёт), берсерк не страдает
                        u.entangle -= 1;
                        if (u.entangle <= 0) { u.entangle = 0; removeEntangleMark(u); refreshHud(); }
                        const ahead = u.row + dir;
                        const occ = ahead >= 0 && ahead < GRID ? unitAt(u.col, ahead) : null;
                        if (occ && occ.side !== u.side) {
                            const hpBefore = occ.hp;
                            damageUnit(occ, u.curAtk, u, "sword");
                            crushHit(u, u.curAtk, hpBefore); // «Сокрушение»
                            thicketSplash(u, occ); // «Древоброд глухой чащи»
                            venomApply(u, occ); // «Ядовитость»
                            frostAttack(u, occ); // «Снежный элементаль»: −1⚔ цели
                            afterAttackPush(u, occ); // «Проросший кабан»
                            triggerAttackTraps(u); // руна: существо атаковало
                            refreshHud();
                            if (checkEnd()) return;
                        }
                    } else for (let step = 0; step < u.def.speed; step++) {
                        if (B.stopped || !B.units.includes(u)) break;
                        const ahead = u.row + dir;
                        if (ahead < 0 || ahead >= GRID) {
                            baseHit(side, u);
                            triggerAttackTraps(u); // удар по базе — тоже атака (руна)
                            removeUnit(u);
                            refreshHud();
                            if (checkEnd()) return;
                            break;
                        }
                        const occ = unitAt(u.col, ahead);
                        if (occ) {
                            // «Зелёный портал»: прыжок вместо прохода/атаки
                            // (до проверки стороны — перепрыгивают свои и чужие)
                            if (occ.def.portalLeap && await portalLeapAct(u, occ, dir)) {
                                if (B.stopped) return;
                                if (checkEnd()) return;
                                break;
                            }
                            if (occ.side !== u.side) {
                                // «Мини-фея» (grw14): полёт — за атакуемым
                                // существом есть пустая клетка, перелетает на
                                // неё вместо атаки (постройки не облетает)
                                const over = ahead + dir;
                                if (u.def.ability === "flyOver" && occ.def.type === "unit"
                                    && over >= 0 && over < GRID && !unitAt(u.col, over)) {
                                    u.row = over;
                                    const p = cellXY(u.col, u.row);
                                    glide(u, p.x, p.y);
                                    setWalk(u, true);
                                    sfx("step");
                                    await delay(0.52 / animK()); // глиссада: полный шаг
                                    if (B.stopped) return;
                                    afterMoved(u); // перемещение — ловушки врага
                                    if (checkEnd()) return;
                                    break;
                                }
                                const hpBefore = occ.hp;
                                damageUnit(occ, u.curAtk, u, "sword");
                                crushHit(u, u.curAtk, hpBefore); // «Сокрушение»
                                thicketSplash(u, occ); // «Древоброд глухой чащи»
                                venomApply(u, occ); // «Ядовитость»
                                frostAttack(u, occ); // «Снежный элементаль»: −1⚔ цели
                                afterAttackPush(u, occ); // «Проросший кабан»
                                triggerAttackTraps(u); // руна: существо атаковало
                                refreshHud();
                                if (checkEnd()) return;
                            }
                            break; // занято — стоим (своим не даём пройти, своих не бьём)
                        }
                        const dest = lureRedirect(u, u.col, u.row, u.col, ahead);
                        if (!B.units.includes(u)) break; // приманка убила шагнувшего
                        const ddx = dest[0] - u.col; // боковой шаг (приманка) — боковая походка
                        u.col = dest[0];
                        u.row = dest[1];
                        const p = cellXY(u.col, u.row);
                        glide(u, p.x, p.y);
                        setWalk(u, true, ddx < 0 ? "walk_left" : ddx > 0 ? "walk_right" : undefined);
                        sfx("step");
                        await delay(0.52 / animK()); // глиссада + пауза: полный шаг походки
                        if (B.stopped) return;
                        afterMoved(u); // перемещение — ловушки врага
                        if (checkEnd()) return;
                    }
                    // «Берсерк» («Двойная атака»): в начале хода владельца —
                    // дополнительные атаки, каждая ценой 1 жизни (просил юзер).
                    // Атаки нет (впереди пусто или своё) — жизни не теряет.
                    // Паузы разведены нарочно: сначала видно, как доб. атака
                    // ПРОШЛА, и только потом существо платит жизнью.
                    for (let k = 0; k < (u.berserk || 0); k++) {
                        if (B.stopped || !B.units.includes(u)) break;
                        await delay(0.3 / animK()); // отделяем доб. атаку от маршевой
                        if (B.stopped || !B.units.includes(u)) break;
                        const ahead = u.row + dir;
                        if (ahead < 0 || ahead >= GRID) {
                            baseHit(side, u);
                            triggerAttackTraps(u);
                        } else {
                            const occ = unitAt(u.col, ahead);
                            if (!occ || occ.side === u.side) break;
                            const p = cellXY(u.col, u.row);
                            floatText(p.x, p.y - 60, "⚔", 0xffb26e);
                            const hpBefore = occ.hp;
                            damageUnit(occ, u.curAtk, u, "sword");
                            crushHit(u, u.curAtk, hpBefore); // «Сокрушение»
                            thicketSplash(u, occ); // «Древоброд глухой чащи»
                            venomApply(u, occ); // «Ядовитость»
                            frostAttack(u, occ); // «Снежный элементаль»: −1⚔ цели
                            afterAttackPush(u, occ); // «Проросший кабан»
                            triggerAttackTraps(u);
                        }
                        refreshHud();
                        if (checkEnd()) return;
                        if (!B.units.includes(u)) break;
                        await delay(0.35 / animK()); // цена — после видимой атаки
                        if (B.stopped || !B.units.includes(u)) break;
                        damageUnit(u, 1, null, "dam"); // цена берсерка
                        refreshHud();
                        if (checkEnd()) return;
                    }
                }
            };

            A.checkEnd = function checkEnd() {
                if (B.phase === "over") return true;
                if (B.enemyBase <= 0) { finish(true); return true; }
                if (B.playerBase <= 0) { finish(false); return true; }
                return false;
            };

            // «Трусливый гоблин» (str29): в начале хода владельца вместо марша
            // сбегает с поля, а карта его призыва возвращается из сброса или
            // колоды в руку (если она там есть) — бесплатную стену можно ставить
            // снова. removeUnit, не killUnit: побег — не смерть, ловушки молчат.
            A.fleeCoward = function fleeCoward(u, side) {
                const id = cardIdOf(u.def);
                const hand = side === "p" ? B.hand : B.eHand;
                const discard = side === "p" ? B.discard : B.eDiscard;
                const deck = side === "p" ? B.deck : B.eDeck;
                const p = cellXY(u.col, u.row);
                removeUnit(u);
                floatText(p.x, p.y - 60, GAME_LOC.t(`card.${id}.name`), 0xd8c79d);
                let i = discard.indexOf(id);
                if (i >= 0) { discard.splice(i, 1); hand.push(id); }
                else {
                    i = deck.indexOf(id);
                    if (i >= 0) { deck.splice(i, 1); hand.push(id); }
                }
                sfx("chpoc");
            };

            // ── Итог боя → награда (победа) / меню (поражение) ─────────────────
            // Драфт («Карта сокровищ») живёт по своим правилам: победа — выбор
            // ОДНОЙ карты из драфт-колоды в меню трофея, поражение — ничего;
            // оба исхода ведут назад в подземелье, карта сокровищ расходуется.
            A.finish = function finish(victory) {
                B.phase = "over";
                B.spellTarget = false;
                const draft = !!(G.draftBattle && G.draft);
                sfx(victory ? "lvlUp" : "die");
                refreshHud();
                const ov = new PIXI.Container();
                const dim = new PIXI.Graphics();
                dim.rect(-3000, -2000, 7920, 5080);
                dim.fill({ color: 0x000000, alpha: 0.6 });
                ov.addChild(dim);
                const panel = new PIXI.Sprite(uiTex("panel_allert.png"));
                panel.anchor.set(0.5);
                panel.scale.set(2.025);
                panel.position.set(960, 450);
                ov.addChild(panel);
                const txt = T(victory ? t("arena.victory") : t("arena.defeat"), 66,
                    victory ? 0xffe9b0 : 0xff8f6e, { stroke: { color: 0x1c1207, width: 10.5 } });
                txt.anchor.set(0.5);
                txt.position.set(960, 402);
                txt.eventMode = "none";
                ov.addChild(txt);
                if (draft && victory) {
                    const sub = T(t("draft.victorySub"), 30, 0xffe2a8,
                        { stroke: { color: 0x1c1207, width: 7 } });
                    sub.anchor.set(0.5, 0);
                    sub.position.set(960, 462);
                    sub.eventMode = "none";
                    ov.addChild(sub);
                }
                B.result = victory ? "win" : "lose";
                if (victory && !draft) {
                    // трофеи «1 из 3» берутся из колоды побеждённого (просил юзер)
                    G.rewardDeck = [...new Set(B.eDeckBase || [])].filter((id) => CARDS[id]);
                    // карта персонажа побеждённого — игроку (просил юзер):
                    // показывается в меню трофея рядом с картами
                    const enc2 = ENCOUNTERS[B.encId] || ENCOUNTERS.gob;
                    if (enc2.hero && G.captureHero && G.captureHero(enc2.hero))
                        G.wonHero = enc2.hero;
                }
                if (draft && victory) {
                    // награда драфта — одна ЛЮБАЯ карта драфт-колоды на выбор
                    // (просил юзер): меню трофея покажет весь её состав
                    G.rewardDeck = [...new Set(G.draft.picks)].filter((id) => CARDS[id]);
                    G.rewardDraft = true;
                }
                if (!victory && !draft) {
                    // поражение — забег продолжается (просил юзер): случайная
                    // карта колоды теряется НАВСЕГДА (списывается и из
                    // коллекции — иначе редактор колоды вернул бы её даром).
                    // Списываем сразу: оверлей показывает потерю ещё до кнопки.
                    // Колода опустела — потеря нечему, забег кончается по-старому.
                    B.lossCard = G.loseCard ? G.loseCard() : null;
                    if (B.lossCard) {
                        const lossLbl = T(t("arena.lossCard"), 22, 0xf3e6c2,
                            { stroke: { color: 0x1c1207, width: 6 } });
                        lossLbl.anchor.set(1, 0.5);
                        lossLbl.position.set(906, 494);
                        lossLbl.eventMode = "none";
                        ov.addChild(lossLbl);
                        const face = new PIXI.Sprite(uiTex(`cards/${CARDS[B.lossCard].img}.png`));
                        face.anchor.set(0.5);
                        face.scale.set(0.3); // 230×338 → 69×101 — пояс панели
                        face.position.set(960, 494);
                        face.eventMode = "none";
                        ov.addChild(face);
                        const lossName = T(t("card." + B.lossCard + ".name"), 24, 0xffe2a8,
                            { stroke: { color: 0x1c1207, width: 6 } });
                        lossName.anchor.set(0, 0.5);
                        globalThis.GAME_UI.fit(lossName, 178, 8); // не наехало на край панели
                        lossName.position.set(1014, 494);
                        lossName.eventMode = "none";
                        ov.addChild(lossName);
                    }
                }
                B.continueAction = () => {
                    if (draft) {
                        // карта сокровищ использована — объект уходит с этажа
                        if (G.dungeon && G.dungeon.objects[G.draft.objIdx])
                            G.dungeon.objects[G.draft.objIdx].taken = true;
                        G.draftBattle = false;
                        G.draft = null;
                        if (G.saveRun) G.saveRun();
                        if (victory) scenes.go("reward"); // выбор одной карты
                        else scenes.go("dungeon");
                        return;
                    }
                    if (victory) {
                        if (G.activeEnemy) {
                            G.activeEnemy.alive = false;
                            if (G.activeEnemy.boss) G.dungeon.bossDead = true;
                        }
                        if (G.saveRun) G.saveRun(); // враг побеждён — забег продолжается
                        scenes.go("reward");
                    } else if (B.lossCard) {
                        // реванш (просил юзер): враг жив на месте, герой
                        // отступает на соседнюю клетку — бой не перезапускается
                        // сам, но касание врага начинает его заново
                        if (G.dungeon && G.activeEnemy && globalThis.GAME_DUNGEON.retreatCell)
                            G.dungeon.heroPos = globalThis.GAME_DUNGEON.retreatCell(G.activeEnemy);
                        G.activeEnemy = null;
                        if (G.saveRun) G.saveRun(); // забег жив: этаж и колода (−1 карта)
                        scenes.go("dungeon");
                    } else {
                        // колода опустела — забег закончен: сейв снимается;
                        // стартер той же стихии (забег был её)
                        if (globalThis.GAME_META.clearRun) globalThis.GAME_META.clearRun();
                        G.resetRun(G.elem);
                        scenes.go("menu");
                    }
                };
                if (victory) {
                    // победа сама ведёт в меню трофея (в драфте — за картой
                    // награды); окошко висит на 0.3с меньше (просил юзер)
                    scheduler.after(1.1 / animK(), () => {
                        if (B && !B.stopped && B.phase === "over" && B.result === "win") B.continueAction();
                    });
                } else {
                    const btn = new PIXI.Sprite(uiTex("button_menu.png"));
                    btn.anchor.set(0.5);
                    btn.scale.set(1); // натуральный размер спрайта (просил юзер)
                    btn.position.set(960, 585);
                    btn.eventMode = "static";
                    ov.addChild(btn);
                    const bt = T(t(draft || B.lossCard ? "arena.toDungeon" : "arena.toMenu"), 45, 0xf3e6c2);
                    bt.anchor.set(0.5);
                    globalThis.GAME_UI.fit(bt, btn.texture.width * btn.scale.x * 0.8, 11); // не шире кнопки
                    bt.position.set(960, 585);
                    bt.eventMode = "none";
                    ov.addChild(bt);
                    btn.on("pointertap", () => { B.btnTaps = (B.btnTaps || 0) + 1; if (ctx.sfx) ctx.sfx(); B.continueAction(); });
                    B.resultBtn = btn;
                }
                root.addChild(ov);
            };
        }
    };
})();
