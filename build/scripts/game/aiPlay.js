// СЦЕНА «АРЕНА»: ИИ: ХОД — показ карты врага, ход (enemyTurn → aiPlay):
// разыгрывание руки в порядке ценности с таргетингом и панелями.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installAiPlay = function installAiPlay(A) {
        with (A) {

            A.enemyTurn = async function enemyTurn() {
                B.phase = "enemy";
                B.selected = null;
                B.spellTarget = false;
                layoutHand();
                redrawHighlight();
                refreshHud();
                firewallTick("p"); // стена костров игрока — конец хода игрока
                sproutTick("p");   // ростки игрока подросли — конец его хода
                if (B.stopped || B.phase === "over") return;
                banner(t("arena.enemyTurn"));
                fxEvent("turn", { side: "e", color: 0xff8a5e });
                await delay(0.5 / animK());
                if (B.stopped) return;
                upkeep("e"); // грибницы врага
                riteStumpTick("e"); // пень обряда врага подсмотрел и решил
                poisonTick("e"); // яд: до марша (просил юзер)
                await marchSide("e");
                if (B.stopped || B.phase === "over") return;
                await aiPlay();
                if (B.stopped || B.phase === "over") return;
                // шкала врага — мягкое правило добора (просил юзер), см. enemyDrawPlan
                const eCards = enemyDrawPlan();
                drawEnemy(eCards);
                B.eEnergy += spheresTotal() - eCards;
                refreshHud();
                await delay(0.25 / animK());
                if (B.stopped) return;
                await playerTurnStart();
            };

            // ── Карта, разыгранная врагом (просил юзер): лицом на свободном
            // месте слева от поля, со свечением по краю; между розыгрышами врага
            // пауза ≥ 1 реальной секунды, и всё это время карта видна — игрок
            // понимает, что делает противник.
            A.enemyCard = null; // { id, node }
            A.showEnemyCard = function showEnemyCard(cardId) {
                hideEnemyCard();
                const node = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.75 });
                node.eventMode = "none";
                node.position.set(430, 420);
                // свечение по ФАКТИЧЕСКОЙ кромке карты (просил юзер): жёсткая
                // рамка с чужими размерами сидела криво — слои от широкого
                // тусклого к узкому яркому поверх bounds лица карты
                const b = node.getLocalBounds();
                const frame = new PIXI.Graphics();
                for (const [w, a] of [[30, 0.08], [18, 0.16], [10, 0.3], [4.5, 0.95]])
                    frame.roundRect(b.x, b.y, b.width, b.height, 16)
                        .stroke({ width: w, color: 0xff5a36, alpha: a });
                frame.name = "glowFrame";
                frame.eventMode = "none";
                node.addChild(frame);
                root.addChild(node);
                enemyCard = { id: cardId, node };
            };
            A.hideEnemyCard = function hideEnemyCard() {
                if (!enemyCard) return;
                enemyCard.node.destroy({ children: true });
                enemyCard = null;
            };
            // Рубашка колоды врага по стихии боя: враги Роста — природная
            // рубашка (card_nature_back), прочие (гоблины, драфт Силы) — гоблинская
            // Рубашка колоды врага по стихии боя: враги Роста — природная
            // рубашка (card_nature_back), прочие (гоблины, драфт Силы) — гоблинская
            A.enemyBackTex = function enemyBackTex() {
                const enc = ENCOUNTERS[B.encId];
                const cave = G.dungeon && globalThis.GAME_DATA.CAVES[G.dungeon.cave];
                const elem = (enc && enc.elem) || (cave && cave.elem);
                return globalThis.GAME_UI.backTexOf(elem);
            };
            // Рубашка колоды и сброса ИГРОКА — по его стихии забега (просил
            // юзер): у Горбага и прочих героев Силы — гоблинская, у героев
            // Роста — природная
            // Рубашка колоды и сброса ИГРОКА — по его стихии забега (просил
            // юзер): у Горбага и прочих героев Силы — гоблинская, у героев
            // Роста — природная
            A.playerBackTex = function playerBackTex() {
                return globalThis.GAME_UI.backTexOf(G.elem);
            };
            // Ловушка врага — РУБАШКОЙ (просил юзер): игрок видит, что противник
            // сыграл карту, но какая именно ловушка — неизвестно; на поле встанет
            // безликий «?» (рубашка колоды — та же, что у колоды врага)
            // Ловушка врага — РУБАШКОЙ (просил юзер): игрок видит, что противник
            // сыграл карту, но какая именно ловушка — неизвестно; на поле встанет
            // безликий «?» (рубашка колоды — та же, что у колоды врага)
            A.showEnemyBack = function showEnemyBack() {
                hideEnemyCard();
                const node = new PIXI.Sprite(uiTex(enemyBackTex()));
                node.scale.set(0.75);
                node.eventMode = "none";
                node.position.set(430, 420);
                const b = node.getLocalBounds();
                const frame = new PIXI.Graphics();
                for (const [w, a] of [[30, 0.08], [18, 0.16], [10, 0.3], [4.5, 0.95]])
                    frame.roundRect(b.x, b.y, b.width, b.height, 16)
                        .stroke({ width: w, color: 0xff5a36, alpha: a });
                frame.name = "glowFrame";
                frame.eventMode = "none";
                node.addChild(frame);
                root.addChild(node);
                enemyCard = { id: null, node };
            };
            // пауза между розыгрышами (она же — сколько видна карта врага):
            // минимум 1.5 секунды — на 0.5 дольше прежнего, успеть разглядеть
            // (просил юзер); при замедленных анимациях — ещё дольше
            A.enemyPlayDelay = () => Math.max(1.5, 1.5 / animK());

            // ── Правила ИИ по картам и связкам (просил юзер) ───────────────────
            // ИИ играет аккуратно: не навредит своим (стена костров, сплэш мины,
            // взрыв жертвы), строит связки (лагерь/костёр + призыв рядом, вождь
            // до гоблинов, алтарь до урона) и держит части комбо в руке, пока
            // не придёт пара (руны копируют только достойное, валун ждёт
            // сильного метателя).
            // Ценность жетона для размена: не только «урон + жизни», но и
            // способности/ауры (сокрушение, чаща, вождь, алтарь…). Одна общая
            // метрика, чтобы пожар/жертва/грибы считали одинаково с целями.

            A.aiPlay = async function aiPlay() {
                // ИИ тратит энергию, пока есть чем. Если играть нечем (в руке всё
                // слишком дорого или неприменимо — поле забито, целей нет), а
                // энергии много — добирает карты и пробует снова: копить десятки
                // энергии вместо давления ИИ не должен.
                let refillTries = 0;
                const tryRefill = async () => {
                    if (B.eEnergy < 5 || refillTries >= 2) return false;
                    refillTries++;
                    const before = B.eHand.length;
                    drawEnemy(2); // пустые колода/сброс закроет «подкрепление»
                    if (B.eHand.length === before) return false; // карт взять неоткуда
                    refreshHud();
                    await delay(0.3 / animK());
                    return true;
                };
                for (;;) {
                    if (B.stopped || B.phase === "over") return;
                    const affordable = B.eHand
                        .map((c, i) => ({ i, id: c, def: CARDS[c] }))
                        .filter((x) => effCost(x.id, "e") <= B.eEnergy)
                        // порядок — по правилам связок (двигатели до урона и
                        // существ, усиления после), внутри группы дороже раньше
                        .sort((a, b) => (aiGroup(a.id, a.def) - aiGroup(b.id, b.def))
                            || (effCost(b.id, "e") - effCost(a.id, "e")));
                    if (!affordable.length) { if (!await tryRefill()) return; continue; }
                    let played = false;
                    for (const pick of affordable) {
                        const def = pick.def;
                        if (def.type === "unit" || def.type === "building") {
                            // «Ловушка-пузырь» (wis119) игрока: существо под
                            // пузырём запрещает ИИ играть карту призыва того
                            // же существа (спека юзера) — карту держим
                            if (def.type === "unit" && bubbleBlocked("e", pick.id)) continue;
                            // «Отряд эльфов» забирает ВСЮ энергию: без запаса в 2⚡
                            // это 0–1/0–1 — карту не переводим (группа 3.5 уже
                            // отодвинула его в конец розыгрыша)
                            if (def.energyToStats && B.eEnergy - effCost(pick.id, "e") < 2) continue;
                            // «Три монолита» — движок добора: без существа в руке
                            // и пары «цена+1» в колоде он пока пустой; не тратим
                            // темп (просил юзер: карта не в приоритете)
                            if (def.monolith && !B.eHand.some((id) => {
                                const d = CARDS[id];
                                return d && d.type === "unit" && B.eDeck.some((x) => CARDS[x]
                                    && CARDS[x].type === "unit"
                                    && CARDS[x].cost === d.cost + 1);
                            })) continue;
                            // «Круг стихий»: без Элементаля в руке призыв пуст —
                            // постройку держим до подходящей карты
                            if (def.elementalCircle && !B.eHand.some((id) => {
                                const d = CARDS[id];
                                return d && d.type === "unit" && d.subtype === "elemental";
                            })) continue;
                            // клетка — по правилам связок: строения-ауры соседства
                            // к существам и будущим призывам, прочие в тыл; существа —
                            // рядом с лагерем/костром/заклинателем клинков
                            const spot = def.type === "building"
                                ? aiBuildingSpot(def) : aiUnitSpot(def);
                            if (!spot) continue;
                            showEnemyCard(pick.id); // карта врага слева ≥ 1с
                            await delay(enemyPlayDelay());
                            const [col, row] = spot;
                            const cardId = B.eHand[pick.i];
                            // «Отмена призыва» (wis84) игрока: существо не
                            // появляется, карта и энергия врага потрачены;
                            // «Иссушение почвы» (dec133) — то же для ПОСТРОЕК
                            if ((def.type === "unit"
                                    && counterTrapConsume("p", "counterSummon"))
                                || (def.type === "building"
                                    && counterTrapConsume("p", "counterBuilding"))) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eEnergy -= effCost(cardId, "e");
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                B.eDiscard.push(cardId);
                                noteDiscard(1, "e", [cardId]);
                                floatText(960, 500,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            // playCtx для «Сброса разума» (decMind): dec146 при
                            // появлении сбрасывает карту; свой выход карты в
                            // сброс ниже вернёт её в руку, если помечена
                            B.playCtx = { side: "e", cardId };
                            addUnit("e", cardId, col, row);
                            B.eDiscard.push(cardId); // как у игрока: карта в сброс (иначе цикл «Трусливого гоблина» не работает)
                            noteDiscard(1, "e", [cardId]);
                            B.playCtx = null;
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "trap") {
                            // лимита ловушек нет (просил юзер) — ставим любую
                            // руна («Наскальная рунопись») и споры («Призрачные
                            // споры») — на существо игрока: руна на сильнейшего
                            // (при его атаке ИИ бесплатно разыграет случайное
                            // заклинание своей колоды), споры тоже — чем больше
                            // урона наносит проклятый, тем больше летит в базу
                            if (def.trap.effect === "castRandom" || def.trap.effect === "sporeCurse") {
                                const pu = B.units.filter((v) => v.side === "p" && v.def.type === "unit")
                                    .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                                if (!pu) continue;
                                showEnemyBack(); // какую руну повесил — загадка (просил юзер)
                                await delay(enemyPlayDelay());
                                const cardId = B.eHand[pick.i];
                                B.eHand.splice(pick.i, 1);
                                B.eEnergy -= effCost(cardId, "e");
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                if (def.trap.effect === "sporeCurse") addSpores(pu);
                                else armTrap("e", cardId, 0, 0, pu);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            // Ловушки — прежде всего на путь марша игрока: пустая
                            // клетка прямо ПЕРЕД его существом (шагнёт и наступит),
                            // и не просто «какая-то передняя», а на пути САМОГО
                            // ОПАСНОГО (aiTrapSpot: мина любит скопления, приманка
                            // — соседство, опутывание — сильнейшего). Если все
                            // варианты небезопасны для своих — карту держим.
                            const spot = aiTrapSpot(def);
                            if (!spot) continue;
                            showEnemyBack(); // какая ловушка — загадка (просил юзер)
                            await delay(enemyPlayDelay());
                            const [col, row] = spot;
                            const cardId = B.eHand[pick.i];
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            armTrap("e", cardId, col, row);
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "spell") {
                            if (!aiSpellPlayable(def)) continue;
                            // карта врага — лицом слева, пауза ≥ 1с: игрок видит,
                            // что сейчас произойдёт (просил юзер)
                            showEnemyCard(pick.id);
                            await delay(enemyPlayDelay());
                            const cardId = B.eHand[pick.i];
                            // «Отмена заклинания» (wis83) игрока: эффект не
                            // срабатывает, карта и энергия врага потрачены
                            if (counterTrapConsume("p", "counterSpell")) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eDiscard.push(cardId);
                                noteDiscard(1, "e", [cardId]);
                                B.eEnergy -= effCost(cardId, "e");
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                floatText(960, 500,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            // playCtx для «Сброса разума» (decMind): пометка
                            // ставится на эффекты карты; возврат — в noteDiscard
                            // при выходе самой карты в сброс ниже
                            B.playCtx = { side: "e", cardId };
                            if (def.spell.copyLast) {
                                // «Горящие руны»: повтор ПОСЛЕДНЕГО заклинания тем
                                // же кодом эффектов (бесплатно для его цены)
                                if (enemyReplayLast()) B.lastSpell.e = "str25"; // повтор самой себя — цепочка
                            } else {
                                enemyCastSpellEffect(def, false, null, true);
                            }
                            B.playCtx = null;
                            // indexOf: панельные эффекты кладут карты в руку —
                            // индексы могли сместиться
                            B.eHand.splice(B.eHand.indexOf(cardId), 1);
                            // «Заклятый древоброд» целью — цена заклинания на 1 меньше
                            // (повтор «Горящими рунами» бесплатен — скидка не копится)
                            const tOff = def.spell.copyLast ? 0 : castTargetOff;
                            castTargetOff = 0;
                            B.eEnergy = (def.spell.drainAll || def.spell.stormAll)
                                ? 0 : B.eEnergy - Math.max(0, effCost(cardId, "e") - tOff);
                            consumeEpicDiscount(cardId, "e"); // «Архилич»: флаг первой эпик-карты
                            heroFirstSpellEnergy("e"); // «Дуновение опасности»
                            // рука ИИ тоже не больше 7 — излишек панельных доборов
                            // сбрасывается случайно (как панель сброса у игрока)
                            while (B.eHand.length > HAND_MAX) {
                                const sp = B.eHand.splice((Math.random() * B.eHand.length) | 0, 1)[0];
                                B.eDiscard.push(sp);
                                noteDiscard(1, "e", [sp]);
                                B.scorch.e.delete(sp); // метка ушла вместе с картой
                            }
                            if (B.scorch.e.has(cardId)) { // «Сожжение»: карта удалена из боя
                                B.scorch.e.delete(cardId);
                                floatText(960, 640, `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                                sfx("rocket");
                            } else { B.eDiscard.push(cardId); noteDiscard(1, "e", [cardId]); }
                            heroStrReplay("e", cardId, def); // «Мастера огня»
                            B.lastSpell.e = cardId;
                            afterSpellPlayed(); // «Заклинатель клинков» на поле
                            hideEnemyCard();
                            refreshHud();
                            if (checkEnd()) return;
                            played = true;
                            break;
                        }
                    }
                    if (!played) { if (!await tryRefill()) return; continue; }
                    refreshHud();
                    await delay(0.4 / animK());
                }
            };
        }
    };
})();
