// МЕТА-МОДУЛЬ: настройки и прогресс игрока (коллекция карт, колода) —
// переживают перезапуск (localStorage); на базовые сбрасываются кнопкой
// «Новая игра» (resetRun в main.js пишет сюда базовые значения).
(function () {
    const LS_SETTINGS = "sd_settings";
    const LS_META = "sd_meta";
    const LS_RUN = "sd_run";
    const LS_BLOCKS = "sd_blocks";

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

    // Именованные блоки прогресса (кнопки «Сохранить»/«Загрузить» в
    // настройках, просил юзер): блок снимает ВЕСЬ прогресс игры — забег
    // (sd_run) и мету (sd_meta) — под именем-датой. Повторное сохранение
    // в ту же минуту заменяет блок с тем же именем.
    function loadBlocks() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_BLOCKS));
            if (raw && typeof raw === "object" && Array.isArray(raw.blocks))
                return raw.blocks.filter((b) => b && typeof b === "object" && typeof b.name === "string");
        } catch (e) { /* повреждённые — считаем, что блоков нет */ }
        return [];
    }
    function saveBlock(run, meta) {
        const now = new Date();
        const p2 = (n) => String(n).padStart(2, "0");
        let name = `${p2(now.getDate())}.${p2(now.getMonth() + 1)}.${now.getFullYear()} `
            + `${p2(now.getHours())}:${p2(now.getMinutes())}`;
        // два сохранения в одну минуту — имена различаем счётчиком
        const have = new Set(loadBlocks().map((b) => b.name));
        if (have.has(name)) {
            let n = 2;
            while (have.has(`${name} (${n})`)) n++;
            name += ` (${n})`;
        }
        const blocks = loadBlocks().filter((b) => b.name !== name);
        blocks.push({ name, ts: Date.now(), run: run || null, meta: meta || null });
        localStorage.setItem(LS_BLOCKS, JSON.stringify({ blocks }));
        return name;
    }
    function listBlocks() {
        return loadBlocks().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))
            .map((b) => ({ name: b.name, ts: b.ts || 0 }));
    }
    function readBlock(name) {
        const b = loadBlocks().find((x) => x.name === name);
        if (!b) return null;
        return { name: b.name, ts: b.ts || 0, run: b.run || null, meta: b.meta || null };
    }
    // Блок обратно на диск: «Загрузить» в настройках сначала восстанавливает
    // sd_meta/sd_run из блока (F5 поднимет именно его), затем применяет к G.
    // run/meta = null — честно пишем/снимаем: как было при сохранении блока
    function restoreBlock(b) {
        localStorage.setItem(LS_META, JSON.stringify(b.meta || null));
        if (b.run) localStorage.setItem(LS_RUN, JSON.stringify(b.run));
        else localStorage.removeItem(LS_RUN);
    }

    globalThis.GAME_META = {
        loadSettings, saveSettings, loadMeta, saveMeta, countIn,
        loadRun, saveRun, clearRun,
        saveBlock, listBlocks, readBlock, restoreBlock,
    };
})();
