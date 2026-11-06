// ЛОКАЛИЗАЦИЯ — RU/EN. t(key, vars) подставляет {переменные}.
// Язык хранится в настройках (meta.js), при смене сцена перерисовывается
// заново (тексты создаются в enter). Строки живут частями: русские —
// locRu.js, английские — locEn.js (грузятся ДО этого файла).
(function () {
    const STRINGS = {
        ru: globalThis.GAME_LOC_RU,
        en: globalThis.GAME_LOC_EN,
    };
    let lang = "ru";

    function t(key, vars) {
        let s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.ru[key] ?? key;
        if (vars) for (const k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
        return s;
    }

    // Значение-список текущего языка (fallback ru) — для генератора мира
    function arr(key) {
        const v = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.ru[key];
        return Array.isArray(v) ? v : [];
    }

    globalThis.GAME_LOC = {
        t, arr,
        setLang(l) { if (STRINGS[l]) lang = l; },
        get lang() { return lang; },
        langs: Object.keys(STRINGS),
    };
})();
