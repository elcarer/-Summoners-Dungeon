// ЗАСТАВКА ПРИ ЗАПУСКЕ (W202, юзер): ролик video/intro.mp4 играет сразу
// после загрузки страницы, поверх холста; пропуск — любая клавиша или клик
// мыши. Ролик собирается в for_work/intro2 (сценарий, пересборка) и
// ставится в игру тамошним install_game.sh.
//
// Порядок (main.js): start() — первым делом в буте → ролик качается и
// играет, ассеты игры грузятся под ним параллельно → `await done` (экран
// чёрный: ролик доиграл или пропущен) → меню → reveal(): чёрный оверлей
// растворяется поверх меню (у меню своя анимация появления, W21).
//
// Грабли:
//  • ролик качается ЦЕЛИКОМ (fetch → Blob): dev_server.py и мини-сервер
//    Electron (deploy/) не умеют Range — из памяти видео не подгружается
//    по ходу и не спотыкается;
//  • play() со звуком без жеста юзера Chrome отклоняет (autoplay-политика)
//    — тогда на чёрном «Нажмите любую клавишу»: жест запускает ролик со
//    звуком (Esc — пропускает и его). Electron (autoplayPolicy по
//    умолчанию no-user-gesture-required) играет сразу;
//  • пока оверлей на экране, клавиши и клики до игры НЕ доходят (перехват
//    в capture на window) — жесты отдаются хукам onGesture (main.js
//    разблокирует ими WebAudio, иначе музыка меню молчала бы до клика);
//  • громкость — max(«звук», «музыка») из настроек: ролик сведён в
//    −14 LUFS, как и треки игры, — с музыкой меню звучит вровень;
//  • в HeadlessChrome (пробы, смоук) заставки нет — пробы кликают сразу
//    после __GAME.ready. URL: ?intro=0 — без заставки, ?intro=1 —
//    показать и в headless.
(function () {
    const SRC = "./video/intro.mp4";
    const LOAD_TIMEOUT_MS = 30000;  // ролик не скачался — игра без заставки
    const START_TIMEOUT_MS = 15000; // скачался, но не стартует (декодер) — так же
    const FADE_OUT = 0.35; // пропуск: картинка и звук уходят в чёрное, с
    const REVEAL = 0.6;    // чёрный оверлей растворяется над меню, с
    const HOLD_MAX = 1.5;  // ролик кончился раньше бута: чёрное ждёт меню не дольше, с
    // Эти клавиши ролик НЕ пропускают: модификаторы сами по себе (Alt+Tab
    // не должен сбивать заставку), F11 — полный экран, F12 — devtools.
    // Сочетания с Ctrl/Alt/Meta — тоже нет (горячие клавиши браузера/ОС)
    const NO_SKIP = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta",
        "OS", "CapsLock", "NumLock", "ScrollLock", "Fn", "FnLock", "Hyper",
        "Super", "F11", "F12", "PrintScreen"]);
    // Ввод, который не пускаем в игру, пока оверлей на экране (движения
    // мыши не трогаем — они ничего не нажимают)
    const SWALLOW = ["keydown", "keyup", "keypress", "pointerdown",
        "pointerup", "pointercancel", "mousedown", "mouseup", "click",
        "dblclick", "auxclick", "contextmenu", "touchstart", "touchend", "wheel"];

    let ctl = null; // один запуск на жизнь страницы

    function start(opts = {}) {
        if (ctl) return ctl;
        const q = new URLSearchParams(location.search).get("intro");
        const headless = /HeadlessChrome/.test(navigator.userAgent);
        const vol = Math.max(0, Math.min(1, opts.volume ?? 1));
        // loading → ready → starting → playing (или gate) → closing →
        // black (done зарезолвлен) → reveal → done
        const st = { phase: "loading", reason: null, gate: false, error: null, gestured: false };
        const hooks = [];
        let root = null, video = null, gateEl = null, url = null, fetchAbort = null;
        let loadTimer = 0, startTimer = 0, holdTimer = 0, revealAsked = false;
        let resolveDone;
        const done = new Promise((r) => { resolveDone = r; });

        // Часы перехода — с первого кадра после вызова: вход в меню грузит
        // текстуры в GPU, и тяжёлый первый кадр иначе съедал бы начало
        // растворения (оверлей прыгал с 1 сразу к ~0.3)
        const tween = (sec, step, end) => {
            let t0 = null;
            const tick = () => {
                if (t0 === null) t0 = performance.now();
                const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
                step(k);
                if (k < 1) requestAnimationFrame(tick); else end();
            };
            requestAnimationFrame(tick);
        };

        function build() {
            root = document.createElement("div");
            root.id = "introVideo";
            root.style.cssText = "position:fixed;inset:0;z-index:50;background:#000;"
                + "overflow:hidden;user-select:none;-webkit-user-select:none";
            video = document.createElement("video");
            video.playsInline = true;
            video.preload = "auto";
            video.disablePictureInPicture = true;
            video.disableRemotePlayback = true;
            video.tabIndex = -1;
            video.volume = vol;
            video.muted = vol === 0; // беззвучный ролик Chrome пускает и без жеста
            video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;"
                + "object-fit:contain;pointer-events:none;background:#000";
            root.appendChild(video);
            document.body.appendChild(root);
            for (const type of SWALLOW) window.addEventListener(type, onInput, true);
        }

        function cleanup() {
            clearTimeout(loadTimer);
            clearTimeout(startTimer);
            clearTimeout(holdTimer);
            for (const type of SWALLOW) window.removeEventListener(type, onInput, true);
            if (video) {
                try { video.pause(); video.removeAttribute("src"); video.load(); }
                catch (e) { /* элемент уже мёртв */ }
            }
            if (url) { URL.revokeObjectURL(url); url = null; }
            if (root) root.remove();
            root = null; video = null; gateEl = null;
        }

        // Ввод, пока оверлей на экране: игре — ничего; жест — пропуск
        // (или запуск ролика с экрана «нажмите любую клавишу»)
        function onInput(e) {
            if (!root) return;
            e.stopImmediatePropagation();
            const type = e.type;
            if (type === "contextmenu" || type === "mousedown" || type === "dblclick") {
                if (e.cancelable) e.preventDefault(); // без меню и выделения
                return;
            }
            let how = null;
            if (type === "keydown") {
                if (e.repeat || NO_SKIP.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                how = e.key === "Escape" ? "esc" : "key";
            } else if (type === "pointerdown" && e.pointerType !== "touch") {
                how = "click";
            } else if (type === "pointerup" && e.pointerType === "touch") {
                how = "tap"; // палец: жест браузер засчитывает на отпускании
            }
            if (!how) return;
            st.gestured = true;
            for (const fn of hooks) {
                try { fn(); } catch (err) { /* хук не должен ронять ввод */ }
            }
            if (st.phase === "gate") {
                if (how === "esc") black("esc");
                else play();
            } else if (st.phase === "playing") skip(how);
        }

        function play() {
            st.phase = "starting";
            if (gateEl) gateEl.style.visibility = "hidden";
            video.play().then(() => {
                if (st.phase !== "starting") return; // закрыли, пока запускался
                clearTimeout(startTimer);
                st.phase = "playing";
                if (gateEl) { gateEl.remove(); gateEl = null; }
                root.style.cursor = "none";
            }, (err) => {
                if (st.phase !== "starting") return;
                if (err && err.name === "NotAllowedError") showGate();
                else fail(err);
            });
        }

        // Браузер не дал звук без жеста: просьба нажать клавишу. Текст —
        // игровым шрифтом Kereru: main.js регистрирует его чуть позже старта
        // заставки, ждём (до 3 с), чтобы надпись не мигнула подменой шрифта
        function showGate() {
            st.phase = "gate";
            st.gate = true;
            root.style.cursor = ""; // курсор игры (наследуется от body)
            if (gateEl) { gateEl.style.visibility = ""; return; }
            gateEl = document.createElement("div");
            gateEl.textContent = GAME_LOC.t("intro.pressKey");
            gateEl.style.cssText = "position:absolute;left:0;right:0;top:50%;"
                + "transform:translateY(-50%);text-align:center;color:#cfc4a6;"
                + "font-family:Kereru,serif;font-size:min(4.1vh,2.3vw);"
                + "letter-spacing:.04em;opacity:0";
            root.appendChild(gateEl);
            const t0 = performance.now();
            const fontReady = () => {
                for (const f of document.fonts)
                    if (/kereru/i.test(f.family) && f.status === "loaded") return true;
                return false;
            };
            const wait = () => {
                if (!gateEl) return;
                if (!fontReady() && performance.now() - t0 < 3000) { setTimeout(wait, 100); return; }
                gateEl.style.opacity = "1";
                gateEl.animate([{ opacity: 0.25 }, { opacity: 1 }], {
                    duration: 1200, direction: "alternate", iterations: Infinity, easing: "ease-in-out",
                });
            };
            wait();
        }

        // Пропуск: картинка и звук уходят в чёрное, затем black()
        function skip(how) {
            if (st.phase !== "playing") return;
            st.phase = "closing";
            st.reason = how;
            const v0 = video.volume;
            tween(FADE_OUT, (k) => {
                if (!video) return;
                video.style.opacity = String(1 - k);
                video.volume = v0 * (1 - k);
            }, () => black(how));
        }

        function fail(err) {
            st.error = String((err && (err.message || err.code)) || err || "ошибка видео");
            if (st.phase === "playing") skip("error");
            else black("error");
        }

        // Экран чёрный (или оверлея не было): done резолвится — main.js
        // поднимает меню и зовёт reveal()
        function black(reason) {
            if (st.phase === "black" || st.phase === "reveal" || st.phase === "done") return;
            st.reason = st.reason || reason;
            clearTimeout(loadTimer);
            clearTimeout(startTimer);
            if (!root) {
                st.phase = "done";
                cleanup();
                resolveDone(st.reason);
                return;
            }
            if (video) { try { video.pause(); } catch (e) { /* нет */ } video.style.opacity = "0"; }
            if (gateEl) { gateEl.remove(); gateEl = null; }
            root.style.cursor = "none";
            st.phase = "black";
            resolveDone(st.reason);
            // бут ещё грузится — чёрное ждёт меню, но не вечно: потом видно
            // плашку этапов бута (или его ошибку)
            if (revealAsked) reveal();
            else holdTimer = setTimeout(reveal, HOLD_MAX * 1000);
        }

        function reveal() {
            revealAsked = true;
            if (st.phase !== "black") return;
            clearTimeout(holdTimer);
            st.phase = "reveal";
            tween(REVEAL, (k) => { if (root) root.style.opacity = String(1 - k); }, () => {
                st.phase = "done";
                cleanup();
            });
        }

        // Бут упал: убрать всё сразу — на экране должен быть текст ошибки
        function abort() {
            if (st.phase === "done") return;
            if (fetchAbort) fetchAbort.abort();
            st.reason = st.reason || "abort";
            st.phase = "done";
            cleanup();
            resolveDone(st.reason);
        }

        async function load() {
            fetchAbort = new AbortController();
            loadTimer = setTimeout(() => fetchAbort.abort(), LOAD_TIMEOUT_MS);
            let blob;
            try {
                const r = await fetch(SRC, { signal: fetchAbort.signal });
                if (!r.ok) throw new Error("HTTP " + r.status + " " + SRC);
                blob = await r.blob();
            } catch (err) {
                if (st.phase !== "loading") return; // abort() уже всё закрыл
                const late = fetchAbort.signal.aborted;
                st.error = late ? "не скачался за " + LOAD_TIMEOUT_MS + " мс"
                    : String((err && err.message) || err);
                black(late ? "timeout" : "error");
                return;
            }
            clearTimeout(loadTimer);
            if (st.phase !== "loading") return;
            // тип — явно: мини-сервер Electron отдаёт .mp4 как octet-stream
            url = URL.createObjectURL(new Blob([blob], { type: "video/mp4" }));
            build();
            video.addEventListener("ended", () => { if (st.phase === "playing") black("ended"); });
            video.addEventListener("error", () => fail(video && video.error));
            video.addEventListener("loadeddata", () => { if (st.phase === "ready") play(); }, { once: true });
            st.phase = "ready";
            startTimer = setTimeout(() => {
                if (st.phase !== "ready" && st.phase !== "starting") return;
                st.error = "не стартовал за " + START_TIMEOUT_MS + " мс";
                black("error");
            }, START_TIMEOUT_MS);
            video.src = url;
        }

        ctl = {
            done,      // Promise<причина>: "ended" | "key" | "click" | "tap" | "esc" | "error" | …
            reveal,    // меню поднято — растворить чёрный оверлей
            abort,     // бут упал — убрать заставку сразу
            // жест мог случиться раньше подписки (нажали на экране «нажмите
            // любую клавишу», пока бут ещё не создал WebAudio) — отдаём сразу:
            // активация у страницы уже есть, resume() пройдёт и вне обработчика
            onGesture(fn) {
                hooks.push(fn);
                if (st.gestured) { try { fn(); } catch (err) { /* как в onInput */ } }
            },
            // программный пропуск (консоль, пробы)
            skip() { if (st.phase === "gate") black("api"); else skip("api"); },
            info() {
                const v = video;
                return {
                    phase: st.phase, reason: st.reason, gate: st.gate, error: st.error,
                    overlay: !!root, volume: v ? v.volume : vol, muted: v ? v.muted : vol === 0,
                    t: v ? Math.round(v.currentTime * 100) / 100 : null,
                    duration: v && isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null,
                    paused: v ? v.paused : null,
                };
            },
        };
        if (q === "0" || (headless && q !== "1") || location.protocol === "file:") {
            st.phase = "done";
            st.reason = q === "0" ? "off" : headless ? "headless" : "file";
            resolveDone(st.reason);
        } else load();
        return ctl;
    }

    globalThis.GAME_INTRO_VIDEO = {
        start,
        get current() { return ctl; },
        info: () => (ctl ? ctl.info() : null),
    };
})();
