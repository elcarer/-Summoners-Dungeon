// СЦЕНА «АРЕНА» — карточный бой на поле 5×5.
// Ряд 0 — база врага (верх), ряд 4 — база игрока (низ).
// Типы карт: unit (марширует к базе врага), spell (одноразовый эффект),
// building (стоит в зоне призыва, даёт ауру), trap («?» у поля, триггер).
// Зона призыва (frontline, как в Stormbound): от своей базы до ряда перед
// самым выдвинутым своим существом/строением — призыв и продвижение
// расширяют зону. Пошаговая логика — FSM + объекты поверх Pixi.
//
// Сцена разложена по модулям (все — обычные скрипты на GAME_ARENA):
//   arenaCore.js    — константы, геометрия, общий контекст A, помощники;
//   arenaCards.js   — стоимость карт и способности героев;
//   arenaBoard.js   — поле, жетоны, ауры и анимации существ;
//   arenaCombat.js  — статусы, урон, ловушки, upkeep;
//   arenaHand.js    — рука, перетаскивание, шкала, сброс;
//   arenaPanels.js  — руны, монолит, пень, путешествие, варка, раскопки;
//   arenaHud.js     — HUD, оверлеи, баннер;
//   arenaFlow.js    — добор, замешательство, марш и итог боя;
//   arenaAI.js      — ИИ противника;
//   arenaActions.js — действия игрока: выбор, призыв, заклинания;
//   arenaFx.js      — процедурные эффекты боя (частицы на Graphics);
//   arenaScene.js   — enter/exit/update;
//   arenaApi.js     — тестовый API арены.
// Модули вешают функции и состояние на A; их установщики работают внутри
// with (A), поэтому тела видят общие имена (B, root, T, …) как раньше.
(function () {
    const NS = globalThis.GAME_ARENA = globalThis.GAME_ARENA || {};

    NS.createArenaScene = function createArenaScene(ctx) {
        const A = NS.createContext(ctx);
        NS.installCards(A);
        NS.installBoard(A);
        NS.installCombat(A);
        NS.installHand(A);
        NS.installPanels(A);
        NS.installHud(A);
        NS.installFlow(A);
        NS.installAI(A);
        NS.installActions(A);
        NS.installFx(A);
        NS.installScene(A);
        NS.installApi(A);
        return { enter: A.enter, exit: A.exit, update: A.update, api: A.api };
    };
})();
