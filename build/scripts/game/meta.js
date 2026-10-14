// МЕТА-МОДУЛЬ: настройки и прогресс игрока (коллекция карт, колода) —
// переживают перезапуск (localStorage) и НЕ сбрасываются между забегами.
(function () {
    const LS_SETTINGS = "sd_settings";
    const LS_META = "sd_meta";

    const DEFAULT_SETTINGS = { sound: 5, music: 5, lang: "ru" }; // 0..10 шаги

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
                return { collection: raw.collection || {}, deck: raw.deck };
            }
        } catch (e) { /* дефолт ниже */ }
        return null;
    }
    function saveMeta(collection, deck) {
        localStorage.setItem(LS_META, JSON.stringify({ collection, deck }));
    }

    // Количество копий карты в колоде
    function countIn(deck, id) {
        return deck.reduce((n, c) => n + (c === id ? 1 : 0), 0);
    }

    globalThis.GAME_META = { loadSettings, saveSettings, loadMeta, saveMeta, countIn };
})();
