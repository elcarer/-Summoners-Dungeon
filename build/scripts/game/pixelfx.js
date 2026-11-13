// МОСТ pixelfx → PIXI (W53): пиксель-арт эффекты в сценах игры.
// Библиотека pixelfx (github.com/patch-gg/pixelfx, MIT) собрана бандлом
// в dll/pixelfx.min.js — глобаль PIXELFX (ядро + каталог эффектов).
// Эффект рисуется КОДОМ в два буфера (color — пиксели,
// light — аддитивное свечение), composite() выдаёт RGBA-кадр: пишем его в
// canvas и поднимаем в PIXI.Texture (nearest, без сглаживания). Спрайт
// вставляется в СЛОЙ СЦЕНЫ (координаты родителя), обновляется общим тиком
// PIXI.Ticker.shared и умирает сам: one-shot — по done(), loop — вместе с
// контейнером сцены или по GAME_FX.clear().
// Если бандл не загрузился (или текстура не создалась) — spawn вернёт null:
// сцены спокойно живут без пиксель-эффектов, у арены остался штатный
// Graphics-пресет (arenaFx.js), у города — просто тишина. Никаких ошибок.
(function () {
    const P = globalThis.PIXELFX;
    const FX = globalThis.GAME_FX = { available: !!(P && P.fx), live: [] };
    if (!FX.available) return;

    // Рампа (палитра тёмное→светлое) из ОДНОГО цвета события — арена
    // передаёт уже стихийный color (0xRRGGBB). Эффект сам подгонит длину
    // под свой дефолт (resolveOptions ресемплит рампы в core/fx.js).
    FX.ramp = function (c) {
        return [P.toHex(P.scale(c, 0.45)), P.toHex(P.scale(c, 0.72)),
            P.toHex(c), P.toHex(P.mix(c, P.WHITE, 0.42)),
            P.toHex(P.mix(c, P.WHITE, 0.75))];
    };

    // Запуск эффекта. parent — PIXI.Container сцены/слоя; id — ключ каталога
    // PIXELFX.fx; o: { x, y — точка origin эффекта (его «земля»/центр) в
    // координатах родителя; size — целевая ВЫСОТА в пикселях родителя
    // (масштаб = size / meta.size[1]); palette; flip; angle; light; seed }.
    // Возвращает хендл { sprite, inst, stop(), done() } или null.
    FX.spawn = function (parent, id, o = {}) {
        const mod = P.fx[id];
        if (!mod || !parent || parent.destroyed) return null;
        const m = mod.meta, w = m.size[0], h = m.size[1];
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const cx = cv.getContext("2d");
        const im = cx.createImageData(w, h);
        let tex;
        try {
            tex = PIXI.Texture.from(cv);
            tex.source.scaleMode = "nearest";
        } catch (e) { return null; }
        const sp = new PIXI.Sprite(tex);
        sp.eventMode = "none";
        const k = (o.size || h) / h;
        sp.scale.set(k);
        // якорь — origin эффекта (meta.origin — его «земля»/центр в кадре):
        // точка (x, y) родителя должна совпасть с ней
        const ox = m.origin ? m.origin[0] : w / 2;
        const oy = m.origin ? m.origin[1] : h / 2;
        sp.position.set(o.x - ox * k, o.y - oy * k);
        parent.addChild(sp);
        const opts = { x: ox, y: oy, light: o.light === undefined ? 1 : o.light };
        if (o.flip) opts.flip = true;
        if (o.angle) opts.angle = o.angle;
        if (o.seed !== undefined) opts.seed = o.seed;
        if (o.palette) opts.palette = o.palette;
        // W111 (юзер): свои опции эффекта (у монет магазина — count/from:
        // пластина-счётчик тикает до ЦЕНЫ карты)
        if (o.opts) Object.assign(opts, o.opts);
        const hnd = {
            sprite: sp, inst: P.createFx(mod, opts), f: P.createFrame(w, h, 0, 0),
            cv, cx, im,
            stop() { hnd.inst.stop(); },
            done() { return hnd.inst.done(); },
        };
        FX.live.push(hnd);
        return hnd;
    };

    // Снять живые эффекты (все или только родителя) — выход из сцены и т.п.
    FX.clear = function (parent) {
        for (let i = FX.live.length - 1; i >= 0; i--) {
            const h = FX.live[i];
            if (parent && h.sprite.parent !== parent) continue;
            FX.kill(h);
            FX.live.splice(i, 1);
        }
    };

    FX.kill = function (h) {
        const sp = h.sprite;
        if (sp.destroyed) return;
        if (sp.parent) sp.parent.removeChild(sp);
        sp.destroy({ texture: true, textureSource: true });
    };

    // Общий тик всех эффектов: обновили симуляцию, перерисовали кадр в
    // canvas, сказали текстуре перечитать его. Мёртвый контейнер сцены
    // уносит спрайт с собой — вычищаем по destroyed.
    PIXI.Ticker.shared.add(function pixelfxTick(tk) {
        const dt = Math.min(tk.deltaMS / 1000, 0.1);
        for (let i = FX.live.length - 1; i >= 0; i--) {
            const h = FX.live[i];
            if (h.sprite.destroyed || !h.sprite.parent) {
                FX.kill(h);
                FX.live.splice(i, 1);
                continue;
            }
            h.inst.update(dt);
            P.clearFrame(h.f);
            h.inst.draw(h.f, "front");
            P.composite(h.f, h.im.data, null);
            h.cx.putImageData(h.im, 0, 0);
            h.sprite.texture.source.update();
            if (h.inst.done()) { // one-shot закончился; loop не завершается
                FX.kill(h);
                FX.live.splice(i, 1);
            }
        }
    });
})();
