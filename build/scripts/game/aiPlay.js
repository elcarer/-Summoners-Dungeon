// СЦЕНА «АРЕНА»: ИИ: ХОД — показ карты врага, ход (enemyTurn → aiPlay):
// разыгрывание руки в порядке ценности с таргетингом и панелями.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installAiPlay = function installAiPlay(A) {
        with (A) {

            A.enemyTurn = async function enemyTurn() {
                B.phase = "enemy";
                B.turnSide = "e"; // чей ход — честный маркер (reactShotPing)
                B.selected = null;
                B.spellTarget = false;
                tokenPanelClose(); // панель «Управления временем» не переживает смену хода
                cryptRefund("p"); // «Склеп»: не разыгранная игроком карта — назад в сброс
                portalRefund("p"); // «Мастер порталов»: не разыгранная карта — на верх колоды
                layoutHand();
                redrawHighlight();
                refreshHud();
                firewallTick("p"); // стена костров игрока — конец хода игрока
                sproutTick("p");   // ростки игрока подросли — конец его хода
                auraLightTick("p"); // «Аура света» игрока — конец его хода
                if (B.stopped || B.phase === "over") return;
                banner(t("arena.enemyTurn"));
                fxEvent("turn", { side: "e", color: 0xff8a5e });
                await delay(0.5 / animK());
                if (B.stopped) return;
                upkeep("e"); // грибницы врага
                riteStumpTick("e"); // пень обряда врага подсмотрел и решил
                portalMasterTick("e"); // «Мастер порталов»: ловушка с верха колоды — бесплатно
                poisonTick("e"); // яд: до марша (просил юзер)
                returnTick("e"); // «Возврат» (Время): счётчики тают, созревшие — в руку
                trapReturnTick("e"); // «Возврат» ЛОВУШКИ (tim221): созревшая — в руку
                await delayArrive("e"); // «Сдвиг» (Время): созревшие являются
                await marchSide("e");
                if (B.stopped || B.phase === "over") return;
                timeCavePulse("e"); // «Пещера времени»: призыв после марша — значок не тает в этом же ходу
                await aiPlay();
                if (B.stopped || B.phase === "over") return;
                // «Гном-разбойник» (timRaider, W40): рука опустела — 2 карты
                heroEmptyHandDraw("e");
                cryptRefund("e"); // «Склеп» врага: не разыгранная карта — назад в сброс
                portalRefund("e"); // «Мастер порталов»: не разыгранная — на верх колоды
                // шкала врага — мягкое правило добора (просил юзер), см. enemyDrawPlan
                const eCards = enemyDrawPlan();
                drawEnemy(eCards);
                B.eEnergy += spheresTotal() - eCards;
                refreshHud();
                await delay(0.25 / animK());
                if (B.stopped) return;
                // «Временная петля» (tim229) врага: вместо хода игрока — ещё
                // один его ход (полный: upkeep, марш, aiPlay)
                if (B.extraTurn && B.extraTurn.e) {
                    B.extraTurn.e = false;
                    await enemyTurn();
                    return;
                }
                // Дополнительная пауза между концом хода противника и
                // началом хода игрока (W58, юзер) — успеть осмотреть поле
                await delay(0.5 / animK());
                if (B.stopped) return;
                await playerTurnStart();
            };

            // ── Карта, разыгранная врагом (просил юзер): лицом на свободном
            // месте слева от поля; между розыгрышами врага
            // пауза ≥ 1 реальной секунды, и всё это время карта видна — игрок
            // понимает, что делает противник.
            A.enemyCard = null; // { id, node }
            A.showEnemyCard = function showEnemyCard(cardId) {
                hideEnemyCard();
                const node = globalThis.GAME_UI.cardFace(ctx, cardId, { scale: 0.75 });
                node.eventMode = "none";
                node.position.set(430, 420);
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
                // W54: герой с ДВУМЯ стихиями — обложка мультицвета
                const hd = globalThis.GAME_DATA.HEROES[G.heroId];
                return globalThis.GAME_UI.backTexOf(
                    hd && hd.elems && hd.elems.length > 1 ? "strGro" : G.elem);
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
                root.addChild(node);
                enemyCard = { id: null, node };
            };
            // пауза между розыгрышами (она же — сколько видна карта врага):
            // минимум 1.5 секунды — на 0.5 дольше прежнего, успеть разглядеть
            // (просил юзер); при замедленных анимациях — ещё дольше
            A.enemyPlayDelay = () => Math.max(1.6, 1.6 / animK());

            // Полёт разыгранной врагом карты к цели (просил юзер — розыгрыши
            // с перемещением): карта с левого места показа летит к клетке/
            // центру поля, сжимаясь, и «превращается» в призыв/эффект.
            // Узел уничтожит тик полёта (handFlight), ссылка enemyCard
            // снимается в done — последующий hideEnemyCard() безвреден.
            // Возвращает промис (в aiPlay — await).
            A.enemyFlyCard = function enemyFlyCard(to, opts = {}) {
                if (!enemyCard || !enemyCard.node || enemyCard.node.destroyed
                    || !root || !root.cardFxLayer) {
                    hideEnemyCard();
                    return Promise.resolve();
                }
                const node = enemyCard.node;
                if (node.anchor && node.anchor.x === 0) {
                    // рубашка ловушки (Sprite) якорена левым-верхним углом —
                    // переводим в центр без визуального скачка
                    node.x += node.width / 2;
                    node.y += node.height / 2;
                    node.anchor.set(0.5);
                }
                return new Promise((res) => {
                    handFlight(node, {
                        target: () => to,
                        r: opts.r ?? 0, s: opts.s ?? 0.34, arc: 60,
                        life: (opts.life ?? 0.42) / animK(), a1: opts.a1 ?? 1,
                        done: () => { enemyCard = null; res(); },
                    });
                });
            };

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
                // «Склеп» (dec157): верхняя карта своего сброса играется
                // СРАЗУ — тем же ходом (у игрока клик по постройке
                // разыгрывает её автоматом); ИИ берёт её в руку и
                // разыгрывает на общих основаниях, не разыграл — вернётся
                // в сброс в конце хода.
                // Гейт: карта вообще играбельна (юнит/постройка — есть клетка,
                // заклинание — aiSpellPlayable, ловушка — есть) и по карману
                if (!B.eCryptTaken && B.eDiscard.length && B.eHand.length < HAND_MAX) {
                    const crypt = B.units.find((v) => v.side === "e"
                        && v.def.type === "building" && v.def.cryptPlay);
                    if (crypt) {
                        const id = B.eDiscard[B.eDiscard.length - 1];
                        const d = CARDS[id];
                        const playable = d && (d.type === "unit" || d.type === "building"
                            ? !bubbleBlocked("e", id)
                                && freeCells(deployRows("e")).length > 0
                            : true);
                        if (playable && effCost(id, "e") <= B.eEnergy) {
                            B.eDiscard.pop();
                            B.eHand.push(id);
                            B.eCryptTaken = id;
                            const cp = cellXY(crypt.col, crypt.row);
                            floatText(cp.x, cp.y - 96,
                                "⤒ " + GAME_LOC.t(`card.${id}.name`), 0xb7d0ef);
                        }
                    }
                }
                // «Лаборатория» (tim224): активация своей постройки —
                // добор карты и снова в «Сдвиг 1» (после активации на поле
                // её нет — за ход не зациклится; вернётся delayArrive-ом)
                {
                    const lab = B.units.find((v) => v.side === "e"
                        && v.def.type === "building" && v.def.lab);
                    if (lab) labActivate("e", lab);
                }
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
                            await enemyFlyCard(cellXY(col, row)); // полёт к клетке
                            const cardId = B.eHand[pick.i];
                            // «Отмена призыва» (wis84) игрока: существо не
                            // появляется, карта и энергия врага потрачены;
                            // «Иссушение почвы» (dec133) — то же для ПОСТРОЕК.
                            // «Магопуты»-герой игрока (W77): первая карта
                            // врага за бой отменяется — то же самое
                            if ((def.type === "unit"
                                    && (heroVoidFirstCancel("e")
                                        || counterTrapConsume("p", "counterSummon")))
                                || (def.type === "building"
                                    && (heroVoidFirstCancel("e")
                                        || counterTrapConsume("p", "counterBuilding")))) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                B.eDiscard.push(cardId);
                                cryptSettle("e", cardId); // «Склеп»
                                noteDiscard(1, "e", [cardId]);
                                floatText(960, 500,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            notePlay("e"); // «Конвейер» (tim225)
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            // playCtx для «Сброса разума» (decMind): dec146 при
                            // появлении сбрасывает карту; свой выход карты в
                            // сброс ниже вернёт её в руку, если помечена
                            B.playCtx = { side: "e", cardId };
                            addUnit("e", cardId, col, row);
                            B.eDiscard.push(cardId); // как у игрока: карта в сброс (иначе цикл «Трусливого гоблина» не работает)
                            noteDiscard(1, "e", [cardId]);
                            cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                            B.playCtx = null;
                            hideEnemyCard();
                            played = true;
                            break;
                        }
                        if (def.type === "trap") {
                            // лимита ловушек нет (просил юзер) — ставим любую.
                            // Руна («Наскальная рунопись») — на существо игрока:
                            // на сильнейшего (при его атаке ИИ бесплатно
                            // разыграет случайное заклинание своей колоды).
                            // W60: «Призрачные споры» — КЛЕТОЧНАЯ ловушка,
                            // ставится на общих основаниях ниже (aiTrapSpot)
                            if (def.trap.effect === "castRandom") {
                                const pu = B.units.filter((v) => v.side === "p" && v.def.type === "unit")
                                    .sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                                if (!pu) continue;
                                showEnemyBack(); // какую руну повесил — загадка (просил юзер)
                                await delay(enemyPlayDelay());
                                await enemyFlyCard(cellXY(pu.col, pu.row), { s: 0.3 });
                                const cardId = B.eHand[pick.i];
                                B.eHand.splice(pick.i, 1);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                multiFury(cardId, "e"); // «Ярость природы» (Рыжий лес)
                                multiValor(cardId, "e"); // «Растущая доблесть» (Белая пуща, W62)
                                multiWeave(cardId, "e"); // «Переплетение сил» (Небесный дворец, W75)
                                cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                                // «Магопуты»-герой игрока (W77): первая карта
                                // врага — отменена (энергия потрачена)
                                if (heroVoidFirstCancel("e")) {
                                    floatText(cellXY(pu.col, pu.row).x,
                                        cellXY(pu.col, pu.row).y - 60,
                                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                    hideEnemyCard();
                                    played = true;
                                    break;
                                }
                                armTrap("e", cardId, 0, 0, pu);
                                afterTrapPlaced("e"); // «Элементаль молнии» (W77)
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            // «Посвящение тьме» (dec154): без юнит-карты в руке
                            // ловушка — голое убийство за 5⚡; держим до карты
                            if (def.trap.effect === "darkOffering"
                                && !B.eHand.some((id) =>
                                    CARDS[id] && CARDS[id].type === "unit")) continue;
                            // «Засадный отряд» (hon196) — на СВОЮ постройку
                            // (переднюю — её чаще атакуют); построек нет —
                            // карту держим
                            if (def.trap.effect === "ambushRise") {
                                const blds = B.units.filter((v) => v.side === "e"
                                    && v.def.type === "building")
                                    .sort((a, b) => b.row - a.row);
                                if (!blds.length) continue;
                                showEnemyBack();
                                await delay(enemyPlayDelay());
                                await enemyFlyCard(cellXY(blds[0].col, blds[0].row),
                                    { s: 0.3 });
                                const cardId = B.eHand[pick.i];
                                B.eHand.splice(pick.i, 1);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                                // «Магопуты»-герой игрока (W77): первая карта
                                // врага — отменена (энергия потрачена)
                                if (heroVoidFirstCancel("e")) {
                                    floatText(cellXY(blds[0].col, blds[0].row).x,
                                        cellXY(blds[0].col, blds[0].row).y - 60,
                                        "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                    hideEnemyCard();
                                    played = true;
                                    break;
                                }
                                armTrap("e", cardId, 0, 0, blds[0]);
                                afterTrapPlaced("e"); // «Элементаль молнии» (W77)
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
                            await enemyFlyCard(cellXY(col, row), { s: 0.3 });
                            const cardId = B.eHand[pick.i];
                            B.eHand.splice(pick.i, 1);
                            B.eEnergy -= effCost(cardId, "e");
                            notePlay("e"); // «Конвейер» (tim225)
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                            multiFury(cardId, "e"); // «Ярость природы» (Рыжий лес, W60)
                            multiValor(cardId, "e"); // «Растущая доблесть» (W62)
                            multiWeave(cardId, "e"); // «Переплетение сил» (Небесный дворец, W75)
                            // «Магопуты»-герой игрока (W77): первая карта
                            // врага — отменена (энергия потрачена)
                            if (heroVoidFirstCancel("e")) {
                                floatText(cellXY(col, row).x, cellXY(col, row).y - 60,
                                    "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                                hideEnemyCard();
                                played = true;
                                break;
                            }
                            armTrap("e", cardId, col, row);
                            afterTrapPlaced("e"); // «Элементаль молнии» (W77)
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
                            await enemyFlyCard({ x: 960, y: 430 },
                                { s: 0.42, a1: 0 }); // к центру поля и растворяется
                            const cardId = B.eHand[pick.i];
                            // «Отмена заклинания» (wis83) игрока: эффект не
                            // срабатывает, карта и энергия врага потрачены.
                            // «Магопуты»-герой игрока (W77): первая карта
                            // врага за бой отменяется — то же самое
                            if (heroVoidFirstCancel("e")
                                || counterTrapConsume("p", "counterSpell")) {
                                B.eHand.splice(B.eHand.indexOf(cardId), 1);
                                B.eDiscard.push(cardId);
                                noteDiscard(1, "e", [cardId]);
                                B.eEnergy -= effCost(cardId, "e");
                                notePlay("e"); // «Конвейер» (tim225)
                                consumeEpicDiscount(cardId, "e"); // «Архилич»
                                cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
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
                            // «Ярость природы» (Рыжий лес, W60): зеркала
                            // spendCard игрока у ИИ НЕ БЫЛО — мультицветные
                            // заклинания врага (sg243–247) молча не били базу
                            multiFury(cardId, "e");
                            multiValor(cardId, "e"); // «Растущая доблесть» (W62)
                            multiWeave(cardId, "e"); // «Переплетение сил» (Небесный дворец, W75)
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
                            B.eEnergy = (def.spell.drainAll || def.spell.stormAll
                                || def.spell.crushEnergy) // «Древомощь» сливает всё (sg243)
                                ? 0 : B.eEnergy - Math.max(0, effCost(cardId, "e") - tOff);
                            notePlay("e"); // «Конвейер» (tim225)
                            consumeEpicDiscount(cardId, "e"); // «Архилич»
                            heroFirstSpellEnergy("e"); // «Дуновение опасности»
                            // рука ИИ тоже не больше 7 — излишек панельных доборов
                            // сбрасывается случайно (как панель сброса у игрока);
                            // рубашки улетают в его сброс (W32, анимации руки)
                            while (B.eHand.length > HAND_MAX) {
                                const sp = B.eHand.splice((Math.random() * B.eHand.length) | 0, 1)[0];
                                flyEnemyDiscard();
                                B.eDiscard.push(sp);
                                noteDiscard(1, "e", [sp]);
                                B.scorch.e.delete(sp); // метка ушла вместе с картой
                            }
                            if (B.scorch.e.has(cardId) || def.burn) { // «Сожжение»: карта удалена из боя
                                B.scorch.e.delete(cardId);
                                floatText(960, 640, `🔥 ${GAME_LOC.t("burn.gone")}`, 0xff8f6e);
                                sfx("chpoc");
                            } else { B.eDiscard.push(cardId); noteDiscard(1, "e", [cardId]); }
                            cryptSettle("e", cardId); // «Склеп»: сыгранная карта — в колоду
                            heroStrReplay("e", cardId, def); // «Мастера огня»
                            B.lastSpell.e = cardId;
                            afterSpellPlayed("e"); // «Заклинатель клинков» на поле
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
