// МЕТА-МОДУЛЬ: настройки и прогресс игрока (коллекция карт, колода) —
// переживают перезапуск (localStorage); на базовые сбрасываются кнопкой
// «Новая игра» (resetRun в main.js пишет сюда базовые значения).
(function () {
    const LS_SETTINGS = "sd_settings";
    const LS_META = "sd_meta";
    const LS_RUN = "sd_run";

    // dragSummon — способ призыва на поле: false — клик по карте + клик по
    // клетке; true — перетаскивание карты на клетку (drag&drop).
    // animSpeed — скорость анимаций/передвижений боя, 0..10; 5 = дефолт
    // (в 1.5 раза медленнее исходной), см. arena.js animK()
    const DEFAULT_SETTINGS = { sound: 5, music: 5, lang: "ru", dragSummon: false, animSpeed: 5 };

    function loadSettings() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_SETTINGS));
            if (raw && typeof raw === "object") return { ...DEFAULT_SETTINGS, ...raw };
        } catch (e) { /* повреждённые — дефолт */ }
        return { ...DEFAULT_SETTINGS };
    }
    function saveSettings(s) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }

    function loadMeta() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_META));
            if (raw && typeof raw === "object" && Array.isArray(raw.deck)) {
                return {
                    collection: raw.collection || {},
                    deck: raw.deck,
                    // колоды по героям и завоёванные карты персонажей
                    // (просил юзер): у старых сейвов их нет — миграция в main.js
                    heroDecks: raw.heroDecks || null,
                    captured: Array.isArray(raw.captured) ? raw.captured : null,
                    activeHeroId: raw.activeHeroId || null,
                    // стартовый герой «Новой игры» — НЕ то же, что активный:
                    // активного можно менять во вкладке «Герои», а стартовый
                    // должен оставаться в коллекции (баг: исчезал после
                    // переключения на завоёванного); у старых сейвов поля нет
                    starterId: raw.starterId || null,
                };
            }
        } catch (e) { /* дефолт ниже */ }
        return null;
    }
    // extra — { heroDecks, captured, activeHeroId, starterId }: колода
    // каждого героя своя (переключение героя в коллекции), захваченные
    // карты персонажей, активный и стартовый (выбранный при «Новой игре»)
    // герои
    function saveMeta(collection, deck, extra) {
        localStorage.setItem(LS_META, JSON.stringify({
            collection,
            deck,
            heroDecks: (extra && extra.heroDecks) || undefined,
            captured: (extra && extra.captured) || undefined,
            activeHeroId: (extra && extra.activeHeroId) || undefined,
            starterId: (extra && extra.starterId) || undefined,
        }));
    }

    // Количество копий карты в колоде
    function countIn(deck, id) {
        return deck.reduce((n, c) => n + (c === id ? 1 : 0), 0);
    }

    // Сейв забега (sd_run): этаж, герой, золото, подземелье (враги/выход).
    // «Продолжить» в меню загружает, «Новая игра» снимает. Колода/коллекция
    // живут отдельно (sd_meta) и забегом не считаются.
    function loadRun() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_RUN));
            if (raw && typeof raw === "object" && Number.isInteger(raw.floor) && raw.floor >= 1
                && raw.hero && raw.hero.hp > 0) return raw;
        } catch (e) { /* повреждённые — считаем, что сейва нет */ }
        return null;
    }
    function saveRun(run) { localStorage.setItem(LS_RUN, JSON.stringify(run)); }
    function clearRun() { localStorage.removeItem(LS_RUN); }

    globalThis.GAME_META = {
        loadSettings, saveSettings, loadMeta, saveMeta, countIn,
        loadRun, saveRun, clearRun,
    };
})();
