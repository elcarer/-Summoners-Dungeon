// СЦЕНА «АРЕНА»: файтинговая заставка «VS» перед боем (W93, юзер).
// Короткая заставка как в файтингах: карта героя выезжает слева, карта
// противника — справа, обе в полном размере, сталкиваются в центре
// экрана; в момент удара — вспышка, встряска, надпись «VS» и звук
// fight.mp3; затем pixelfx-переход star-iris (dll/pixelfx.min.js):
// заставка скрывается на СУЖЕНИИ звезды, а поле боя открывается на её
// РАСШИРЕНИИ — эффект сам рисует тьму вокруг звезды-диафрагмы и в
// середине полностью заливает экран. Моста pixelfx нет или эффект не
// создался — заставка просто гаснет (fade), бой начинается как раньше.
// Хронометраж фиксированный (кинематографичный ролик, ползунок
// «Анимации» боёв его не растягивает). Баннер «ваш ход» стартует после
// заставки. Модуль вешает на A startVsIntro/vsTick/vsState/vsSkip:
// enter зовёт startVsIntro в самом конце, update тикает vsTick.
// Слой заставки — ребёнок root: умирает вместе со сценой, а ввод арены
// блокирует сам (лежит поверх HUD, тапы до root не доходят).
(function () {
    globalThis.GAME_ARENA.installVs = function installVs(A) {
        with (A) {
            // хронометраж фаз, сек: слайд карт → удар (вспышка+встряска+VS
            // и звук) → пауза → star-iris (0.98с сужение, 0.18с тьма,
            // 0.84с расширение) → конец
            const VS_TIME = {
                slide: 0.42,  // выезд карт к центру
                shake: 0.22,  // встряска слоя после удара
                flash: 0.16,  // белая вспышка удара
                pop: 0.25,    // «VS» осаживается с перелёта до своего размера
                hold: 0.5,    // от удара до старта star-iris
                fade: 0.4,    // запасное затухание без pixelfx
            };
            const CARD_K = 1.6; // карточка 230×338 в полный размер
            const CY = 540;     // центр экрана по вертикали
            const GAP = 12;     // зазор между картами у центра экрана
            let vs = null; // { layer, phase, t, onDone, iris, irisT, hid }
            globalThis.GAME_ARENA.vsFast = false; // пробы: ускорить заставку (×12)

            A.vsState = () => vs;
            // мгновенно доиграть заставку (пробы/отладка): убить эффект,
            // снять слой и объявить бой открытым
            A.vsSkip = function vsSkip() {
                if (!vs) return;
                const FX = globalThis.GAME_FX;
                if (vs.iris && FX && FX.kill) FX.kill(vs.iris);
                endVs();
            };

            function endVs() {
                if (vs.layer && !vs.layer.destroyed)
                    vs.layer.destroy({ children: true });
                const done = vs.onDone;
                vs = null;
                if (done) done(); // баннер «ваш ход» — когда поле открыто
            }

            // Карта стороны: heroes/<img>.png — полная карточка 230×338.
            // Противник без карты героя (драфт «Карта сокровищ» — у
            // энкаунтера hero нет) — лицо сильнейшей карты его колоды
            // (карточные лица того же размера 230×338)
            function vsCardTex(heroDef, eHero, eDeck) {
                if (heroDef) return `heroes/${heroDef.img}.png`;
                // eHero — уже карта героя энкаунтера (объект) или её id
                const eh = typeof eHero === "string" ? HEROES[eHero] : eHero;
                if (eh && eh.img) return `heroes/${eh.img}.png`;
                if (eDeck && eDeck.length) {
                    const score = (id) => (CARDS[id] ? CARDS[id].cost || 0 : 0)
                        + (CARDS[id] && CARDS[id].rarity === "epic" ? 3
                            : CARDS[id] && CARDS[id].rarity === "rare" ? 1 : 0);
                    let best = null, bs = -1;
                    for (const id of eDeck) {
                        const s = score(id);
                        if (s > bs) { bs = s; best = id; }
                    }
                    if (best && CARDS[best] && CARDS[best].img)
                        return `cards/${CARDS[best].img}.png`;
                }
                return null;
            }

            A.startVsIntro = function startVsIntro(heroDef, eHero, eDeck) {
                const done = () => banner(t("arena.yourTurn"));
                const pTex = vsCardTex(heroDef);
                const eTex = vsCardTex(null, eHero, eDeck);
                // без карт героя/противника (нечем показать) заставки нет
                if (!pTex || !eTex) { done(); return; }
                const layer = new PIXI.Container();
                layer.eventMode = "static";
                layer.hitArea = new PIXI.Rectangle(0, 0, 1920, 1080);
                // тёмная подложка прячет строящееся поле боя
                layer.addChild(new PIXI.Graphics()
                    .rect(0, 0, 1920, 1080).fill({ color: 0x0b0a10, alpha: 0.96 }));
                const mkCard = (tex) => {
                    const sp = new PIXI.Sprite(uiTex(tex));
                    sp.anchor.set(0.5);
                    sp.scale.set(CARD_K);
                    sp.eventMode = "none";
                    return sp;
                };
                // герой прилетает слева, противник — справа; стык в центре
                layer.heroCard = mkCard(pTex);
                layer.heroCard.position.set(-200, CY);
                layer.addChild(layer.heroCard);
                layer.enemyCard = mkCard(eTex);
                layer.enemyCard.position.set(2120, CY);
                layer.addChild(layer.enemyCard);
                vs = { layer, phase: "slide", t: 0, onDone: done,
                    hid: false, irisT: 0, iris: null };
                root.addChild(layer); // поверх HUD — последний ребёнок root
            };

            A.vsTick = function vsTick(dtSec) {
                if (!vs) return;
                const dt = dtSec * (globalThis.GAME_ARENA.vsFast ? 12 : 1);
                vs.t += dt;
                const L = vs.layer;
                if (L && L.destroyed) { vs = null; return; } // сцена снесена
                if (vs.phase === "slide") {
                    const k = Math.min(1, vs.t / VS_TIME.slide);
                    const p = k * k * k; // разгон: удар на полной скорости
                    const hx0 = -200, hx1 = 960 - 184 - GAP / 2;
                    const ex0 = 2120, ex1 = 960 + 184 + GAP / 2;
                    L.heroCard.position.set(hx0 + (hx1 - hx0) * p, CY);
                    L.enemyCard.position.set(ex0 + (ex1 - ex0) * p, CY);
                    if (k >= 1) {
                        vs.phase = "vs";
                        vs.t = 0;
                        sfx("fight"); // удар карт — «FIGHT!» (W93)
                        L.flash = new PIXI.Graphics()
                            .rect(0, 0, 1920, 1080)
                            .fill({ color: 0xffffff, alpha: 0.85 });
                        L.flash.eventMode = "none";
                        L.addChild(L.flash);
                        L.vsText = T(GAME_LOC.t("arena.vs"), 150, 0xffd98c,
                            { stroke: { color: 0x1c1207, width: 12 } });
                        L.vsText.anchor.set(0.5);
                        L.vsText.position.set(960, CY);
                        L.vsText.scale.set(2.4);
                        L.vsText.eventMode = "none";
                        L.addChild(L.vsText);
                    }
                } else if (vs.phase === "vs") {
                    if (vs.t <= VS_TIME.shake) {
                        // встряска слоя затухает к покою
                        const q = 1 - vs.t / VS_TIME.shake;
                        L.position.x = Math.sin(vs.t * 80) * 9 * q;
                    } else L.position.x = 0;
                    if (L.flash) {
                        L.flash.alpha = 0.85 * (1 - vs.t / VS_TIME.flash);
                        if (vs.t >= VS_TIME.flash) {
                            L.removeChild(L.flash);
                            L.flash.destroy();
                            L.flash = null;
                        }
                    }
                    if (L.vsText) {
                        const k = Math.min(1, vs.t / VS_TIME.pop);
                        L.vsText.scale.set(2.4 - 1.4 * (1 - (1 - k) ** 3));
                    }
                    if (vs.t >= VS_TIME.hold) {
                        const FX = globalThis.GAME_FX;
                        const iris = FX && FX.available
                            ? FX.spawn(root, "transitions/star-iris",
                                { x: 0, y: 0, size: 1080 })
                            : null;
                        if (iris) { vs.iris = iris; vs.phase = "iris"; vs.t = 0; }
                        else { vs.phase = "fade"; vs.t = 0; }
                    }
                } else if (vs.phase === "iris") {
                    vs.irisT += dt;
                    // тьма внутри эффекта — t∈[0.98..1.16]: экран полностью
                    // залит, заставка под ним больше не нужна
                    if (!vs.hid && vs.irisT >= 0.98) {
                        vs.hid = true;
                        vs.layer = null;
                        L.destroy({ children: true });
                    }
                    if (vs.irisT >= 2.02 || vs.iris.done()) endVs();
                } else if (vs.phase === "fade") {
                    if (L) L.alpha = Math.max(0, 1 - vs.t / VS_TIME.fade);
                    if (vs.t >= VS_TIME.fade) endVs();
                }
            };
        }
    };
})();
