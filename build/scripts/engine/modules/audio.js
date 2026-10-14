// ЗВУК — Web Audio API. Два канала: эффекты (тоны/шум/файлы, ползунок
// «звук») и музыка (зацикленные треки, ползунок «музыка»).
// Файлы подключаются реестром: audio.registerFile(имя, "./sound/x.mp3"),
// затем audio.playFile("x") — разово, audio.music("трек") — лупом на сцену.
// Браузер разрешает звук только после жеста юзера: вызовите audio.unlock()
// из обработчика клика/клавиши. Трек, выбранный до разблокировки, начнёт
// играть сам после первого жеста (pendingMusic + onstatechange).
//
// Пример:
//   const audio = createAudio();
//   audio.registerFile("shoot", "./sound/shoot.mp3");
//   audio.registerFile("music:menu", "./sound/menu_theme.mp3");
//   canvas.addEventListener('pointerdown', () => audio.unlock());
//   audio.tone({ freq: 880, dur: 0.08, type: "square" });  // «пиу» (синтез)
//   audio.playFile("shoot");                               // «пиу» (файл)
//   audio.music("menu");                                   // луп меню
function createAudio() {
    let ctx = null;
    let masterVolume = 0.5; // «звук» — эффекты
    let musicVolume = 0.5;  // «музыка»
    let sfxGain = null, musicGain = null;

    const presets = new Map();   // синтез-пресеты: register(name, fn)
    const files = new Map();     // имя → URL (registerFile)
    const buffers = new Map();   // имя → Promise<AudioBuffer> (лениво, с кэшем)
    let musicTrack = null;       // желаемый трек (то, что выбрала сцена)
    let musicName = null;        // трек, который реально играет
    let musicSrc = null;
    let pendingMusic = null;     // выбранный до разблокировки — стартует после

    function ensureCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            // авто-resume может дозреть позже вызова unlock — ловим момент
            ctx.onstatechange = () => {
                if (ctx.state === "running" && pendingMusic) {
                    const name = pendingMusic;
                    pendingMusic = null;
                    music(name);
                }
            };
        }
        return ctx;
    }

    // Разблокировать AudioContext (обязательный первый вызов — из жеста юзера)
    function unlock() {
        ensureCtx();
        if (ctx.state === "suspended") ctx.resume();
        if (ctx.state === "running" && pendingMusic) {
            const name = pendingMusic;
            pendingMusic = null;
            music(name);
        }
        return ctx.state === "running";
    }

    function isReady() {
        return ctx !== null && ctx.state === "running";
    }

    function channel(which) {
        if (which === "music") {
            if (!musicGain) musicGain = ctx.createGain();
            musicGain.gain.value = musicVolume;
            return musicGain;
        }
        if (!sfxGain) sfxGain = ctx.createGain();
        sfxGain.gain.value = masterVolume;
        return sfxGain;
    }

    // Декод файла (лениво, один раз; неудача выкидывается из кэша). Декод
    // работает и на suspended-контексте — грузить можно до разблокировки.
    function loadBuffer(key, url) {
        let p = buffers.get(key);
        if (!p) {
            p = fetch(url)
                .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status + " " + url); return r.arrayBuffer(); })
                .then((ab) => ensureCtx().decodeAudioData(ab));
            p.catch(() => buffers.delete(key));
            buffers.set(key, p);
        }
        return p;
    }

    // Тон: осциллятор с экспоненциальным затуханием. endFreq — скольжение частоты
    // (выстрел: 880 → 220). type: "square" | "sine" | "sawtooth" | "triangle"
    function tone({ freq = 440, endFreq = null, dur = 0.15, type = "square", volume = 0.2 } = {}) {
        if (!isReady()) return;
        const time = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), time + dur);
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain).connect(channel("sfx"));
        osc.start(time);
        osc.stop(time + dur);
    }

    // Шум: буфер случайных сэмплов через фильтр нижних частот (взрывы, попадания)
    function noise({ dur = 0.3, volume = 0.3, filterFreq = 800 } = {}) {
        if (!isReady()) return;
        const time = ctx.currentTime;
        const sampleCount = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < sampleCount; i++) {
            channelData[i] = Math.random() * 2 - 1;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = filterFreq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        source.connect(filter).connect(gain).connect(channel("sfx"));
        source.start(time);
    }

    // Именованные пресеты: audio.register("shoot", () => audio.tone({...}))
    function register(name, fn) { presets.set(name, fn); }
    function play(name) {
        const fn = presets.get(name);
        if (fn) fn();
    }

    // ── Файлы ──────────────────────────────────────────────────────────────
    function registerFile(name, url) { files.set(name, url); }
    // Предзагрузка в фоне (не ждём — playFile/music сами дождутся декода)
    function preload(names) {
        for (const name of names) {
            const url = files.get(name);
            if (url) loadBuffer(name, url).catch(() => { /* тишина лучше падения */ });
        }
    }
    // Разовый sfx-файл; volume — множитель поверх ползунка «звук»
    async function playFile(name, volume = 1) {
        const url = files.get(name);
        if (!url || !isReady()) return false;
        try {
            const buf = await loadBuffer(name, url);
            if (!isReady()) return false;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const g = ctx.createGain();
            g.gain.value = volume;
            src.connect(g).connect(channel("sfx"));
            src.start();
            return true;
        } catch (e) { return false; }
    }
    // Музыка сцены: луп; повторный вызов с тем же треком ничего не перезапускает
    function music(name) {
        musicTrack = name;
        if (!isReady()) { pendingMusic = name; return Promise.resolve(false); }
        return startMusic(name);
    }
    async function startMusic(name) {
        if (musicName === name && musicSrc) return true;
        stopMusicNode();
        const url = files.get("music:" + name);
        if (!url) return false;
        try {
            const buf = await loadBuffer("music:" + name, url);
            if (!isReady()) { pendingMusic = name; return false; } // контекст закрылся
            if (musicTrack !== name) return false; // трек сменили, пока грузился
            musicSrc = ctx.createBufferSource();
            musicSrc.buffer = buf;
            musicSrc.loop = true;
            musicSrc.connect(channel("music"));
            musicSrc.start();
            musicName = name;
            return true;
        } catch (e) { return false; }
    }
    function stopMusicNode() {
        if (musicSrc) {
            try { musicSrc.stop(); } catch (e) { /* уже остановлен */ }
            musicSrc = null;
        }
        musicName = null;
    }
    function stopMusic() {
        musicTrack = null;
        pendingMusic = null;
        stopMusicNode();
    }
    // Состояние — для тестов и отладки: track (желаемая), playing (фактическая)
    function status() {
        return {
            ready: isReady(), track: musicTrack, playing: musicName,
            decoded: [...buffers.keys()],
        };
    }

    function setVolume(v) {
        masterVolume = clamp01(v);
        if (sfxGain) sfxGain.gain.value = masterVolume;
    }
    function setMusicVolume(v) {
        musicVolume = clamp01(v);
        if (musicGain) musicGain.gain.value = musicVolume;
    }

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    return {
        unlock, isReady, tone, noise, register, play, setVolume,
        registerFile, preload, playFile, music, stopMusic, status, setMusicVolume,
        get volume() { return masterVolume; },
    };
}

// Подключение двумя способами (файл без import/export валиден и как ES-модуль):
//   1) обычный <script src="..."> — глобали (работает и на file://);
//   2) import "./файл.js" — глобали ставятся как побочный эффект.
globalThis.createAudio = createAudio;
