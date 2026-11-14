// СЦЕНА «АРЕНА»: ИИ ПРОТИВНИКА — корневой модуль-оркестратор. Логика ИИ
// разложена по тематическим файлам (все — install-модули на GAME_ARENA):
//   aiValue.js  — оценки: «сила карты», угроза/роль существ, клетки, добор;
//   aiTarget.js — выбор целей, панельные пики, играбельность, поиск;
//   aiSpells.js — исполнение заклинаний (свитч эффектов);
//   aiPlay.js   — ход: показ карты врага, разыгрывание руки;
//   aiTree.js   — дерево розыгрыша (W114): план порядка карт на модели поля.
// Истоки «умности» описаны в шапке aiValue.js.
(function () {
    globalThis.GAME_ARENA.installAI = function installAI(A) {
        globalThis.GAME_ARENA.installAiValue(A);
        globalThis.GAME_ARENA.installAiTarget(A);
        globalThis.GAME_ARENA.installAiSpells(A);
        globalThis.GAME_ARENA.installAiPlay(A);
        globalThis.GAME_ARENA.installAiTree(A);
    };
})();
