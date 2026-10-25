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
//   arenaDamage.js  — ядро урона: damageUnit/Base, killUnit, purge;
//   arenaStatus.js  — статусы существ (яд, заморозка, споры, …);
//   arenaSummons.js — призывы-сателлиты и «Выкапливание»;
//   arenaCombat.js  — хуки атак и разовые эффекты ударов;
//   arenaTraps.js   — ловушки: установка, срабатывание, эффекты;
//   arenaUpkeep.js  — тики начала хода (постройки, алтари, стена костров);
//   arenaHand.js    — рука, перетаскивание, шкала, сброс;
//   arenaPanels.js  — руны, монолит, пень, путешествие, варка, раскопки;
//   arenaHud.js     — HUD, оверлеи, баннер;
//   arenaFlow.js    — добор, замешательство, марш и итог боя;
//   aiValue.js      — ИИ: оценки (сила карты, угроза, клетки);
//   aiTarget.js     — ИИ: выбор целей, пики, играбельность, поиск;
//   aiSpells.js     — ИИ: исполнение заклинаний;
//   aiPlay.js       — ИИ: ход (показ карты врага, разыгрывание руки);
//   arenaActions.js — действия игрока: выбор, призыв, заклинания;
//   arenaFx.js      — процедурные эффекты боя (частицы на Graphics);
//   arenaScene.js   — enter/exit/update;
//   arenaApi.js     — тестовый API арены.
// arenaAI.js — корневой файл ИИ (заметки о происхождении «умности»), функций
// не несёт. Модули вешают функции и состояние на A; их установщики работают
// внутри with (A), поэтому тела видят общие имена (B, root, T, …) как раньше.
(function () {
    const NS = globalThis.GAME_ARENA = globalThis.GAME_ARENA || {};

    NS.createArenaScene = function createArenaScene(ctx) {
        const A = NS.createContext(ctx);
        NS.installCards(A);
        NS.installBoard(A);
        NS.installDamage(A);
        NS.installStatus(A);
        NS.installSummons(A);
        NS.installCombat(A);
        NS.installTraps(A);
        NS.installUpkeep(A);
        NS.installHand(A);
        NS.installPanels(A);
        NS.installHud(A);
        NS.installFlow(A);
        NS.installAI(A); // внутри — installAiValue/Target/Spells/Play
        NS.installActions(A);
        NS.installFx(A);
        NS.installScene(A);
        NS.installApi(A);
        return { enter: A.enter, exit: A.exit, update: A.update, api: A.api };
    };
})();
