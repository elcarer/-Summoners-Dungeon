// UI-КИТ — общие элементы сцен: тексты, кнопки, крупная карта, скролл-панель.
(function () {
    const T = (text, size, fill, opts = {}) => new PIXI.Text({
        text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
    });

    // Вписать текст в ширину: сначала уменьшение кегля, при сильном
    // переливе — горизонтальное сжатие (для пиксельного шрифта незаметно).
    function fit(textEl, maxW, minSize = 9) {
        const w0 = textEl.width;
        if (w0 <= maxW || w0 === 0) return textEl;
        const size = textEl.style.fontSize;
        const k = maxW / w0;
        if (size * k >= minSize) {
            textEl.style.fontSize = Math.floor(size * k);
        } else {
            textEl.style.fontSize = minSize;
            textEl.scale.x = Math.min(1, maxW / textEl.width);
        }
        return textEl;
    }

    // Кнопка: спириm + подпись (текст не ловит клики и вписан в ширину).
    // Кнопки button_menu.png — натуральные 274×77 при базовом разрешении
    // 1920×1080 (просил юзер), кегль 45 — как в главном меню (просил юзер:
    // все button_menu в игре одного размера и одним кеглем; слишком
    // длинные надписи ужимает фит).
    function button(ctx, { tex, label, x, y, scale = 1, onTap, fontSize = 45, labelColor = 0xf3e6c2 }) {
        const c = new PIXI.Container();
        const sp = new PIXI.Sprite(ctx.uiTex(tex));
        sp.anchor.set(0.5);
        sp.scale.set(scale);
        c.addChild(sp);
        if (label) {
            const t = T(label, fontSize, labelColor, { stroke: { color: 0x1c1207, width: 4 } });
            t.anchor.set(0.5);
            t.eventMode = "none";
            // подпись не шире кнопки (у широких надписей ужимается кегль)
            fit(t, sp.texture.width * scale * 0.86, 11);
            c.addChild(t);
        }
        c.position.set(x, y);
        c.eventMode = "static";
        addGlow(ctx, c, sp);
        c.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap && onTap(); });
        c.userData.sprite = sp;
        return c;
    }

    // Эффект клика-перемещения в мире/подземелье (просил юзер W22):
    // золотое кольцо-волна в точке клика + точки маршрута (центры клеток,
    // мировые px) волной от героя к цели; всё растворяется за ~0.6с.
    // layer — fx-слой сцены поверх объектов. Активные эффекты пишутся
    // в ctx.__clickFxs (тесты).
    function pathFx(ctx, { layer, x, y, points = [] }) {
        if (!layer || layer.destroyed) return;
        const root = new PIXI.Container();
        root.eventMode = "none";
        layer.addChild(root);
        const ring = new PIXI.Graphics();
        ring.circle(0, 0, 10).fill({ color: 0xf0c96a, alpha: 0.25 });
        ring.circle(0, 0, 10).stroke({ width: 2.5, color: 0xf0c96a, alpha: 0.95 });
        ring.position.set(x, y);
        ring.blendMode = "add";
        root.addChild(ring);
        const dots = points.map((p, i) => {
            const g = new PIXI.Graphics();
            g.circle(0, 0, 3.4).fill({ color: 0xf5e2ac, alpha: 0.85 });
            g.position.set(p.x, p.y);
            root.addChild(g);
            return { g, at: i * 0.014 }; // волна появления по маршруту
        });
        const fxs = ctx.__clickFxs || (ctx.__clickFxs = new Set());
        const fx = { x, y, dots: dots.length, alive: true };
        fxs.add(fx);
        let t = 0;
        const LIFE = 0.62, FADE = 0.3;
        const tick = () => {
            if (root.destroyed) { // сцена умерла — эффект уже уничтожен
                ctx.app.ticker.remove(tick);
                fx.alive = false;
                fxs.delete(fx);
                return;
            }
            t += Math.min(ctx.app.ticker.deltaMS, 100) / 1000;
            if (t >= LIFE) {
                ctx.app.ticker.remove(tick);
                root.destroy({ children: true });
                fx.alive = false;
                fxs.delete(fx);
                return;
            }
            const k = Math.min(1, t / 0.5); // кольцо: рост и растворение
            ring.scale.set(0.55 + 1.15 * (1 - Math.pow(1 - k, 3)));
            ring.alpha = 0.95 * (1 - k);
            const out = Math.min(1, Math.max(0, (t - (LIFE - FADE)) / FADE));
            for (const d of dots) {
                const a = Math.min(1, Math.max(0, (t - d.at) / 0.12));
                d.g.alpha = 0.85 * a * (1 - out * 0.9);
                d.g.scale.set(1 - 0.35 * out);
            }
        };
        ctx.app.ticker.add(tick);
    }

    // Жёлтая подсветка кнопки при наведении курсора (просил юзер W22 —
    // правило UI: ВСЕ кнопки игры). W58 (юзер): свет должен идти ПО
    // КОНТУРУ кнопки, а не овалом за ней — раньше это была растянутая
    // радиальная текстура, форм кнопки не повторявшая. Теперь — копия
    // Свечение Вокруг силуэта ОДНИМ шейдером на кнопке (юзер: без клона —
    // «просто блюр вокруг изображения»): фильтр получает растр кнопки
    // (спрайт + надпись) и выводит «изображение + золотой гаусс-ореол по
    // альфе» одним проходом. На покое uStrength = 0 — шейдер сразу
    // возвращает картинку как есть. Сила свечения доводится твином
    // (0.25/кадр). Тикер снимается сам, узлы умерли — сразу.
    // c.userData.glow — доступ тестов.
    const GLOW_VERT = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}`;

    const GLOW_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uStrength;
void main(void)
{
    vec4 img = texture(uTexture, vTextureCoord);
    if (uStrength <= 0.0) { finalColor = img; return; }
    vec2 px = 1.0 / uInputSize.xy;
    float sa = img.a * 0.32;
    for (int i = 0; i < 12; i++) {
        float ang = 0.5235988 * float(i);
        vec2 d = vec2(cos(ang), sin(ang));
        sa += texture(uTexture, vTextureCoord + d * 2.0 * px).a * 0.13;
        sa += texture(uTexture, vTextureCoord + d * 4.5 * px).a * 0.06;
        sa += texture(uTexture, vTextureCoord + d * 8.0 * px).a * 0.025;
    }
    float glowA = min(1.0, sa * 0.62) * uStrength * (1.0 - img.a);
    vec3 gold = vec3(1.0, 0.843, 0.371);
    finalColor = vec4(img.rgb + gold * glowA, min(1.0, img.a + glowA));
}`;

    // та же логика для WebGPU (в игре рендерер webgpu — фильтр только с
    // glProgram под ним МОЛЧА не исполняется)
    const GLOW_WGSL = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct GlowUniforms {
  uStrength: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> glowU : GlowUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
    return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let img = textureSample(uTexture, uSampler, uv);
    if (glowU.uStrength <= 0.0) { return img; }
    let px = vec2<f32>(1.0) / gfu.uInputSize.xy;
    var sa = img.a * 0.32;
    for (var i: i32 = 0; i < 12; i++) {
        let ang = 0.5235988 * f32(i);
        let d = vec2<f32>(cos(ang), sin(ang));
        sa += textureSample(uTexture, uSampler, uv + d * 2.0 * px).a * 0.13;
        sa += textureSample(uTexture, uSampler, uv + d * 4.5 * px).a * 0.06;
        sa += textureSample(uTexture, uSampler, uv + d * 8.0 * px).a * 0.025;
    }
    let glowA = min(1.0, sa * 0.62) * glowU.uStrength * (1.0 - img.a);
    let gold = vec3<f32>(1.0, 0.843, 0.371);
    return vec4<f32>(img.rgb + gold * glowA, min(1.0, img.a + glowA));
}`;

    function makeGlowFilter() {
        return new PIXI.Filter({
            glProgram: PIXI.GlProgram.from({ vertex: GLOW_VERT, fragment: GLOW_FRAG }),
            gpuProgram: PIXI.GpuProgram.from({
                vertex: { source: GLOW_WGSL, entryPoint: "mainVertex" },
                fragment: { source: GLOW_WGSL, entryPoint: "mainFragment" },
            }),
            resources: { glowU: new PIXI.UniformGroup({ uStrength: { value: 0, type: "f32" } }) },
            padding: 14,
            resolution: 1,
        });
    }

    // Постоянное свечение тем же шейдером (W121, просил юзер: свечение
    // иконок ресурсов на панели — тем же, что у кнопок, а не «полупрозрачные
    // круги»; сила задана раз и навсегда — наведение не нужно, тикера нет).
    // c.userData.glow — доступ тестов.
    function constGlow(c, strength = 0.8) {
        const filter = makeGlowFilter();
        filter.resources.glowU.uniforms.uStrength = strength;
        c.filters = [filter];
        c.userData = c.userData || {};
        c.userData.glow = filter;
        return filter;
    }

    function addGlow(ctx, c, sp) {
        const filter = makeGlowFilter();
        c.filters = [filter];
        const uni = filter.resources.glowU.uniforms;
        let a = 0, tgt = 0, running = false, dead = false;
        const kill = () => { // фильтр и тикер умирают ровно один раз
            if (dead) return;
            dead = true;
            ctx.app.ticker.remove(tick);
            filter.destroy();
        };
        const tick = () => {
            if (c.destroyed) { kill(); return; }
            a += (tgt - a) * 0.25;
            if (Math.abs(tgt - a) < 0.012) { // дошли — тикер больше не нужен
                a = tgt;
                ctx.app.ticker.remove(tick);
                running = false;
            }
            uni.uStrength = a;
        };
        const setGlow = (on) => {
            tgt = on ? 0.8 : 0;
            if (!running && !dead) { running = true; ctx.app.ticker.add(tick); }
        };
        c.on("pointerover", () => setGlow(true));
        c.on("pointerout", () => setGlow(false));
        c.once("destroyed", kill);
        c.userData = c.userData || {};
        c.userData.glow = filter;
        return filter;
    }

    // Чип-кнопка (фильтры): маленькая прямоугольная кнопка с текстом
    function chip(ctx, { label, x, y, active = false, onTap, w = 0, h = 39 }) {
        const c = new PIXI.Container();
        const t = T(label, 19, active ? 0x14200e : 0xd8c79d);
        t.eventMode = "none";
        const tw = w || Math.max(45, Math.ceil(t.width) + 27);
        const g = new PIXI.Graphics();
        g.roundRect(0, 0, tw, h, 9);
        g.fill(active ? 0x7dc95e : 0x2e2822);
        g.stroke({ width: 2.25, color: active ? 0xa8e890 : 0x6b5c40 });
        g.eventMode = "static";
        g.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap && onTap(); });
        c.addChild(g, t);
        t.position.set(tw / 2 - t.width / 2, h / 2 - t.height / 2);
        c.position.set(x, y);
        c.userData = { w: tw, h };
        return c;
    }

    // Рубашка колоды по стихии (просил юзер): Рост — природная
    // (card_nature_back), Мудрость — синяя (card_wisdom_back),
    // Тлен — чёрная (card_decay_back), Честь — белая (card_honor_back),
    // Время — фиолетовая (card_time_back), мультицвет — card_multi_back
    // (ВСЕ составные стихии двухцветных героев и данжей — strGro, groHon,
    // honWis, wisTim, timDec, decStr: до сих пор мультицвет был только у
    // strGro (W54), остальные пять падали в гоблинскую), прочие —
    // гоблинская. Массив elems (двухцветный герой) — тоже мультицвет.
    const MULTI_ELEMS = ["strGro", "groHon", "honWis", "wisTim", "timDec", "decStr",
        "groWisDec", // W136: трёхцвет Рост+Мудрость+Тлен (мировой босс)
        "strTimHon"]; // W137: трёхцвет Сила+Время+Честь (мировой босс)
    function backTexOf(elem) {
        if (Array.isArray(elem)) {
            return elem.length > 1 ? "card_multi_back.png" : backTexOf(elem[0]);
        }
        return MULTI_ELEMS.includes(elem) ? "card_multi_back.png"
            : elem === "growth" ? "card_nature_back.png"
            : elem === "wisdom" ? "card_wisdom_back.png"
            : elem === "decay" ? "card_decay_back.png"
            : elem === "honor" ? "card_honor_back.png"
            : elem === "time" ? "card_time_back.png"
            : "card_goblin_back.png";
    }

    // Крупная карта (колода/награда). Если у карты есть img — это готовое
    // лицо-картинка (рамка/имя/тексты/редкость нарисованы); иначе —
    // процедурная сборка из рубашки и подписей.
    // Эталонная высота виджета — 495 (картинка 230×338 в масштабе ~1.46);
    // scale у вызывающих сторон — доля от этого эталона.
    function cardFace(ctx, cardId, { scale = 1, dim = false } = {}) {
        const { CARDS } = globalThis.GAME_DATA;
        const def = CARDS[cardId];
        const c = new PIXI.Container();
        if (def.img) {
            const face = new PIXI.Sprite(ctx.uiTex(`cards/${def.img}.png`));
            face.anchor.set(0.5);
            face.scale.set(495 / face.texture.height); // к высоте эталонной рубашки
            c.addChild(face);
            c.scale.set(scale);
            if (dim) c.alpha = 0.45;
            return c;
        }
        // служебные токены (gobA/gobC/ancBear) без лица — рубашка СВОЕЙ
        // стихии (карточка-подсказка при наведении на поле, просил юзер)
        const face = new PIXI.Sprite(ctx.uiTex(backTexOf(def.elem)));
        face.anchor.set(0.5);
        face.scale.set(1.5);
        if (def.type !== "unit") face.tint = def.color || 0xffffff;
        c.addChild(face);
        const plate = new PIXI.Graphics();
        plate.roundRect(-150, -210, 300, 225, 12);
        plate.fill({ color: 0x120d09, alpha: 0.72 });
        c.addChild(plate);
        const name = T(GAME_LOC.t(`card.${cardId}.name`), 30, 0xf3e6c2, { align: "center", wordWrap: true, wordWrapWidth: 285 });
        name.anchor.set(0.5, 0);
        name.position.set(0, -201);
        name.eventMode = "none";
        fit(name, 285, 18);
        c.addChild(name);
        const type = T(GAME_LOC.t(`type.${def.type}`), 21, 0xcfc4a6);
        type.anchor.set(0.5, 0);
        type.position.set(0, -138);
        type.eventMode = "none";
        c.addChild(type);
        const descText = def.type === "unit"
            ? `${def.atk} ⚔   ${def.hp} ♥   ${def.speed} →`
            : GAME_LOC.t(`card.${cardId}.desc`);
        const desc = T(descText, 21, 0xd8c79d, { align: "center", wordWrap: true, wordWrapWidth: 279 });
        desc.anchor.set(0.5, 0);
        desc.position.set(0, -99);
        desc.eventMode = "none";
        c.addChild(desc);
        const cost = new PIXI.Graphics();
        cost.circle(126, -219, 25.5);
        cost.fill(0x2f6fb0);
        cost.stroke({ width: 3.75, color: 0xbfe0ff });
        c.addChild(cost);
        const costT = T(String(def.cost), 30, 0xffffff);
        costT.anchor.set(0.5);
        costT.position.set(126, -219);
        costT.eventMode = "none";
        c.addChild(costT);
        c.scale.set(scale);
        if (dim) c.alpha = 0.45;
        return c;
    }

    // ── Ховер-зум карт в меню (правило UI, просил юзер) ────────────────────
    // Наведение на уменьшенную карту: её КОПИЯ поверх плавно растёт до
    // полного размера спрайта (scale 1), базовая карта на время показа
    // прячется через alpha (dim-карта вернёт свою прозрачность; клики
    // остаются на базовой — копия eventMode "none"), уведение — плавное
    // сжатие и удаление копии. Копия кладётся в host — слой окна/сцены,
    // а не в панель со скроллом (маска обрезала бы рост); для карт в
    // скролл-панели вызывающая сторона передаёт позицию с поправкой на
    // скролл (как showZoom в колоде). Обязателен для новых меню с картами.
    // host — узел или функция (сцены пересоздают root в rebuild).
    function cardZoomer(ctx, { host, from = 0.5, to = 1, yMin = 270, yMax = 810 } = {}) {
        // один тикер на игру: зумеры живут в Set на контексте и убираются,
        // как только копия удалена (узел уничтожен при закрытии окна — тоже)
        const zooms = ctx.__cardZooms || (ctx.__cardZooms = new Set());
        if (!ctx.__cardZoomTick) {
            ctx.__cardZoomTick = () => {
                for (const z of zooms) {
                    if (z.node && !z.node.destroyed) {
                        z.cur += (z.tgt - z.cur) * 0.22;
                        if (Math.abs(z.tgt - z.cur) < 0.004) {
                            z.cur = z.tgt;
                            if (z.tgt === 0) z.dead = true; // сжалось — убрать
                        }
                        z.node.scale.set(z.cur);
                    } else z.dead = true; // окно/сцена закрылись
                    if (z.dead) {
                        if (z.base && !z.base.destroyed) z.base.alpha = z.baseAlpha;
                        if (z.box && !z.box.destroyed)
                            z.box.destroy({ children: true }); // окошко способностей
                        if (z.node && !z.node.destroyed) z.node.destroy({ children: true });
                        zooms.delete(z);
                    }
                }
            };
            ctx.app.ticker.add(ctx.__cardZoomTick);
        }
        let zoom = null; // активная копия (одна на зумер)
        function hide(immediate) {
            if (!zoom) return;
            if (immediate || zoom.node.destroyed) {
                if (zoom.base && !zoom.base.destroyed) zoom.base.alpha = zoom.baseAlpha;
                if (zoom.box && !zoom.box.destroyed)
                    zoom.box.destroy({ children: true }); // окошко способностей
                if (!zoom.node.destroyed) zoom.node.destroy({ children: true });
                zooms.delete(zoom);
                zoom = null;
            } else zoom.tgt = 0; // плавно сожмётся в тикере, затем удалится
        }
        function show(id, x, y, base, fromScale) {
            hide(true);
            const h = typeof host === "function" ? host() : host;
            if (!h || h.destroyed) return;
            // базу прячем на время показа копии (просил юзер — иначе видны
            // обе); через alpha, не visible: невидимая карта остаётся
            // кликабельной, а dim-карта вернёт свою прозрачность
            let baseAlpha = 1;
            if (base && !base.destroyed) { baseAlpha = base.alpha; base.alpha = 0; }
            const node = cardFace(ctx, id, { scale: fromScale || from });
            node.eventMode = "none"; // клики проходят к карте под копией
            node.position.set(x, Math.max(yMin, Math.min(yMax, y)));
            h.addChild(node); // поверх всех карт host-слоя
            zoom = { id, node, cur: fromScale || from, tgt: to, base, baseAlpha };
            zooms.add(zoom);
            // W150 (юзер): рядом с увеличенной картой — окошко описаний
            // стандартных способностей; справа, не влезает — слева
            const box = abilTipOf(id);
            if (box) {
                const hw = 168 * to + 22; // полкарты на полном масштабе + отступ
                let bx = node.x + hw;
                if (bx + box.w > 1904) bx = node.x - hw - box.w;
                bx = Math.max(16, bx);
                box.node.position.set(bx,
                    Math.max(16, Math.min(node.y - box.h / 2, 1064 - box.h)));
                h.addChild(box.node);
                zoom.box = box.node;
                zoom.boxDX = bx - node.x;
                zoom.boxDY = box.node.y - node.y;
            }
        }
        return {
            show,
            hide,
            // переставить живую копию без перезапуска роста (панель-хозяин
            // следует за жетоном — W141, окно противника)
            moveTo(x, y) {
                if (!zoom || zoom.dead || !zoom.node || zoom.node.destroyed) return;
                zoom.node.position.set(x, Math.max(yMin, Math.min(yMax, y)));
                // окошко способностей следует за копией (панель-хозяин едет)
                if (zoom.box && !zoom.box.destroyed)
                    zoom.box.position.set(x + zoom.boxDX,
                        zoom.node.y + zoom.boxDY);
            },
            state: () => (zoom && !zoom.dead // dead — до-улитая тикером запись
                ? { id: zoom.id, scale: Math.round(zoom.cur * 1000) / 1000, target: zoom.tgt }
                : null),
        };
    }

    // Затемнённый полноэкранный фон сцены-меню
    function dimBg(ctx, alpha = 0.78) {
        const bg = new PIXI.Sprite(ctx.uiTex("bg_corridor_1.png"));
        const s = Math.max(1920 / bg.texture.width, 1080 / bg.texture.height);
        bg.scale.set(s);
        bg.position.set((1920 - bg.texture.width * s) / 2, (1080 - bg.texture.height * s) / 2);
        bg.alpha = alpha;
        return bg;
    }

    // ── Скролл-панель: контент + маска + ползунок справа, колесо мыши ──────
    // const pane = scrollPane(ctx, { x, y, w, h, onScroll }); pane.setContent(node);
    // node кладётся с локальным (0,0) — панель сама двигает его по вертикали.
    // onScroll вызывается при каждом перемещении контента (ховер-эффекты
    // вроде зума карт сбрасывают по нему своё состояние).
    function scrollPane(ctx, { x, y, w, h, onScroll }) {
        const root = new PIXI.Container();
        root.position.set(x, y);

        const inner = new PIXI.Container();
        root.addChild(inner);

        const maskG = new PIXI.Graphics();
        maskG.rect(0, 0, w, h);
        maskG.fill(0xffffff);
        root.addChild(maskG);
        inner.mask = maskG;

        const track = new PIXI.Graphics();
        // канавка приглушённая (W195, юзер): яркая 1px-обводка на тёмном
        // фоне читалась как «кривая волосная линия» скролла журнала боя
        track.rect(w - 11, 0, 8, h);
        track.fill({ color: 0x241c12, alpha: 0.9 });
        track.stroke({ width: 1, color: 0x6b5c40, alpha: 0.5 });
        track.eventMode = "none";
        root.addChild(track);

        const handle = new PIXI.Graphics();
        handle.roundRect(w - 14, 0, 12, 30, 4);
        handle.fill(0x9a8a68);
        handle.stroke({ width: 1, color: 0x1c1207 });
        handle.eventMode = "static";
        root.addChild(handle);

        // зона скролла: клики сквозь неё НЕ проходят — контент интерактивен
        const zone = new PIXI.Graphics();
        zone.rect(0, 0, w, h);
        zone.fill({ color: 0xffffff, alpha: 0.001 });
        zone.eventMode = "static";
        root.addChildAt(zone, 0);

        // колесо — на КОРНЕ панели (W58, юзер): раньше слушатель висел
        // только на подложке-зоне, а событие над картой уходило карте и
        // по соседней ветке (zone — sibling) не доходило; над увеличенной
        // ховер-копией (базовая карта под ней остаётся интерактивной)
        // скролл пропадал вовсе. События карт всплывают: card → контент
        // → inner → root — слушаем здесь. ВАЖНО: notifyTarget в Pixi v8
        // пропускает не-interactive узлы пути (isInteractive: static/
        // dynamic) — без eventMode корень с слушателем молчал бы
        root.eventMode = "static";
        root.on("wheel", (e) => {
            scrollBy((e.deltaY || 0) * 0.6);
        });

        let contentH = 0, t = 0, dragging = false, explicitH = null;

        function relayout() {
            // высоту даёт setContent: getLocalBounds на свежем (не
            // отрендеренном) контенте врёт до кадра, а в сериях быстрых
            // перерисовок (add/remove в редакторе колоды) падает вовсе —
            // границы меряем только при отсутствии явной высоты
            contentH = explicitH !== null ? explicitH
                : Math.max(0, inner.getLocalBounds().height);
            const max = Math.max(0, contentH - h);
            if (max <= 0) {
                t = 0;
                inner.y = 0;
                handle.visible = track.visible = false;
                return;
            }
            t = Math.min(1, t);
            handle.visible = track.visible = true;
            // минимум 90 (W195, юзер): на длинном журнале боя ползунок
            // сжимался до 28px и выглядел «сломанным» рядом с другими
            const hh = Math.max(90, (h / contentH) * h);
            handle.scale.y = hh / 30;
            apply();
        }
        function apply() {
            const max = Math.max(0, contentH - h);
            inner.y = -t * max;
            handle.y = t * (h - handle.height);
            if (onScroll) onScroll();
        }
        function scrollBy(dy) {
            const max = Math.max(0, contentH - h);
            if (max <= 0) return;
            t = Math.max(0, Math.min(1, t + dy / max));
            apply();
        }

        handle.on("pointerdown", () => { dragging = true; });
        handle.on("globalpointermove", (e) => {
            if (!dragging) return;
            const local = root.toLocal(e.global);
            t = Math.max(0, Math.min(1, (local.y - handle.height / 2) / (h - handle.height)));
            apply();
        });
        window.addEventListener("pointerup", () => { dragging = false; });
        track.eventMode = "static";
        track.on("pointertap", (e) => {
            const local = root.toLocal(e.global);
            t = Math.max(0, Math.min(1, (local.y - handle.height / 2) / Math.max(1, h - handle.height)));
            apply();
        });

        return {
            node: root,
            // contentH — явная высота контента (Pixi v8 getLocalBounds на
            // свежих Text/Graphics врёт до рендера); без неё — фолбэк.
            setContent(node, contentH = null) {
                inner.removeChildren().forEach((ch) => ch.destroy({ children: true }));
                inner.addChild(node);
                explicitH = contentH;
                relayout();
            },
            refresh: relayout,
            scrollBy,
            debug() {
                const b = inner.getLocalBounds();
                return {
                    children: inner.children.length,
                    grandchildren: inner.children[0] && inner.children[0].children ? inner.children[0].children.length : 0,
                    bounds: { x: b.x, y: b.y, w: b.width, h: b.height }, contentH,
                };
            },
            get state() { return { t, contentH, viewH: h }; },
        };
    }

    // Имя героя-противника для показа игроку: у героев-врагов id героя и id
    // энкаунтера не всегда совпадают (wisMad ↔ wisBoss) — по ним и ловился
    // «код ссылки» вместо имени в меню трофея. Порядок: enc.<id героя>.title
    // → enc-ключ энкаунтера с этим hero → hero.<id героя>.name.
    function foeTitle(heroId) {
        const direct = `enc.${heroId}.title`;
        if (GAME_LOC.t(direct) !== direct) return GAME_LOC.t(direct);
        const enc = globalThis.GAME_DATA.ENCOUNTERS || {};
        const found = Object.keys(enc).find((k) => enc[k] && enc[k].hero === heroId);
        if (found) return GAME_LOC.t(`enc.${found}.title`);
        return GAME_LOC.t(`hero.${heroId}.name`);
    }

    // Окно противника при наведении (W141, юзер): его карта героя слева,
    // справа — имя, база и размер колоды, ниже — табличка колоды «N× имя»
    // (в два столбца, когда карт много); наведение на строку — ПОЛНАЯ карта
    // вырастает рядом (cardZoomer). Заменяет прежнюю однострочную сводку
    // «Колода: 2× А, 1× Б…» в подземелье и у отрядов мира. Панель живёт
    // в ui-слое (дизайн-координаты) и каждый кадр позиционируется вызовом
    // place(px, py) — точка (px, py) — центр верхушки вражеского жетона.
    // deck — массив id карт; heroImg — имя листа героя или null.
    function deckTip(ctx, { title, base, deck, heroImg } = {}) {
        const counts = new Map();
        for (const id of deck || []) counts.set(id, (counts.get(id) || 0) + 1);
        const entries = [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const PAD = 14, CARD_S = 0.5, CARD_W = 230 * CARD_S, CARD_H = 338 * CARD_S;
        const ROW_H = 27, COLS = entries.length > 8 ? 2 : 1, W = 520;
        const colW = (W - PAD * 2) / COLS;
        const headH = Math.max(CARD_H, 24 + 8 + 22 + 4 + 22 + 8);
        const rowsN = Math.ceil(entries.length / COLS);
        const H = PAD + headH + 10 + rowsN * ROW_H + PAD;

        const node = new PIXI.Container();
        node.eventMode = "passive"; // сам не ловит, строки таблицы — ловят
        const bg = new PIXI.Graphics();
        bg.roundRect(0, 0, W, H, 12);
        bg.fill({ color: 0x171310, alpha: 0.94 });
        bg.stroke({ width: 3, color: 0x6b5c40 });
        node.addChild(bg);

        let hero = false;
        if (heroImg) {
            const sp = new PIXI.Sprite(ctx.uiTex(`heroes/${heroImg}.png`));
            sp.anchor.set(0.5);
            sp.scale.set(CARD_S);
            sp.position.set(PAD + CARD_W / 2, PAD + CARD_H / 2);
            node.addChild(sp);
            hero = true;
        }
        const tx = PAD + CARD_W + 14;
        const titleT = T(title || "", 24, 0xffe9b0);
        titleT.position.set(tx, PAD + 2);
        node.addChild(titleT);
        const baseT = T(base || "", 18, 0xff9c8c);
        baseT.position.set(tx, PAD + 34);
        node.addChild(baseT);
        const deckT = T(GAME_LOC.t("dungeon.tipDeckN", { n: (deck || []).length }),
            18, 0xd8c79d);
        deckT.position.set(tx, PAD + 60);
        node.addChild(deckT);

        // табличка колоды + ховер-зум полной карты (растёт, как всюду)
        const zoomer = cardZoomer(ctx, { host: node, from: 0.35, to: 0.92,
            yMin: -4000, yMax: 4000 }); // координаты локальные — без клампа
        const rows = [];
        entries.forEach(([id, n], i) => {
            const col = i % COLS, rowI = (i / COLS) | 0;
            const c = new PIXI.Container();
            c.eventMode = "static";
            c.hitArea = new PIXI.Rectangle(0, 0, colW, ROW_H);
            const cnt = T(n + "×", 18, 0xf0c96a);
            cnt.anchor.set(1, 0.5);
            cnt.position.set(44, ROW_H / 2);
            cnt.eventMode = "none";
            c.addChild(cnt);
            const name = T(GAME_LOC.t("card." + id + ".name"), 18, 0xd8c79d);
            name.position.set(56, ROW_H / 2 - 1);
            name.eventMode = "none";
            c.addChild(name);
            const ry = PAD + headH + 10 + rowI * ROW_H;
            const rx = PAD + col * colW;
            c.position.set(rx, ry);
            c.on("pointerover", () => {
                // зум в локальных координатах панели — по сторону, где есть
                // место (сторона и позиция пересчитываются в place каждый кадр)
                zoomRow = { id, ry };
                rezoom(true);
            });
            c.on("pointerout", () => { zoomRow = null; zoomer.hide(); });
            node.addChild(c);
            rows.push({ id, node: c });
        });
        const zoom = { x: "r" }; // сторона зума — пересчитывается в place
        let zoomRow = null; // активная строка зума { id, ry }
        let last = null;
        function clampZoomY(ry) {
            // центр зума держим в границах экрана (локальные координаты)
            const top = last ? last.y : 0;
            return Math.max(180, Math.min(900, top + ry)) - top;
        }
        function zoomLocalX() {
            return zoom.x === "l" ? -CARD_W - 26 : W + CARD_W + 26;
        }
        function rezoom(restart) {
            if (!zoomRow) return;
            if (restart) zoomer.show(zoomRow.id, zoomLocalX(),
                clampZoomY(zoomRow.ry), null, 0.35);
            else zoomer.moveTo(zoomLocalX(), clampZoomY(zoomRow.ry));
        }
        function place(px, py) {
            const x = Math.max(12, Math.min(1920 - W - 12, px - W / 2));
            const yRaw = (py - H - 27 < 12) ? py + 33 : py - H - 27;
            // жетон может быть вне камеры (наведение по координатам) — окно
            // прижимаем к краю экрана, а не теряем
            const y = Math.max(12, Math.min(1080 - H - 12, yRaw));
            node.position.set(x, y);
            last = { x, y };
            // зум справа, пока полная карта влезает в экран; иначе — слева
            zoom.x = (x + W + CARD_W + 136 <= 1920) ? "r" : "l";
            rezoom(false); // живой зум переставить без перезапуска роста
        }
        function destroy() {
            zoomer.hide(true);
            node.destroy({ children: true });
        }
        return { node, w: W, h: H, rows, hero, zoomer, place, destroy };
    }

    // ── Плашка-подсказка слотов HUD (W150, юзер): «что это и зачем» ────────
    // Одна плашка на панель HUD (золото/ресурсы). show(text, slotX) — текст
    // и позиция ПОД наведённым слотом (плашка не накрывает иконки/числа,
    // лишь декоративную дощечку квестов), hide гасит
    function hudTipPlate() {
        const node = new PIXI.Container();
        node.name = "hudSlotTip"; // пробы: найти плашку среди детей панели
        const bg = new PIXI.Graphics();
        const txt = T("", 20, 0xf3e6c2,
            { wordWrap: true, wordWrapWidth: 280, breakWords: true,
                lineHeight: 25 });
        txt.position.set(14, 11);
        txt.eventMode = "none";
        node.addChild(bg, txt);
        node.alpha = 0;
        node.eventMode = "none";
        return {
            node,
            show(text, slotX) { // slotX — центр слота в координатах панели
                txt.text = text;
                const w = txt.width + 28, h = txt.height + 22;
                bg.clear();
                bg.roundRect(0, 0, w, h, 10);
                bg.fill({ color: 0x171310, alpha: 0.94 });
                bg.stroke({ width: 3, color: 0x6b5c40 });
                // не заезжает на кольцо героя (правый край ~211)
                node.position.set(
                    Math.max(260, Math.min(slotX - w / 2, 696 - w)), 102);
                node.alpha = 1;
            },
            hide() { node.alpha = 0; },
        };
    }

    // ── Окошко описаний стандартных способностей карты (W150, юзер) ────────
    // Ставится РЯДОМ с увеличенной картой (ховер-зум): список стандартных
    // эффектов из def («Скорость», «Выстрел», «Сдвиг»…) с описаниями.
    // Возвращает { node, w, h } или null — способностей нет
    function abilTipOf(cardId) {
        const { CARDS } = globalThis.GAME_DATA;
        const def = CARDS[cardId];
        if (!def) return null;
        const rows = [];
        const dash = def.ability === "dash1" ? 1
            : def.ability === "dashN" ? (def.abilityVal || 2)
            : (def.dashN || 0);
        if (dash) rows.push([GAME_LOC.t("abil.dash.name", { n: dash }),
            GAME_LOC.t(dash === 1 ? "abil.dash.desc1" : "abil.dash.descN")]);
        if (def.ability === "archer")
            rows.push([GAME_LOC.t("abil.shot.name", { n: def.shotDmg || 1 }),
                GAME_LOC.t("abil.shot.desc", { n: def.shotDmg || 1 })]);
        if (def.ability === "flyOver")
            rows.push([GAME_LOC.t("abil.fly.name"), GAME_LOC.t("abil.fly.desc")]);
        if (def.delay)
            rows.push([GAME_LOC.t("abil.delay.name", { n: def.delay }),
                GAME_LOC.t("abil.delay.desc")]);
        if (def.returnN)
            rows.push([GAME_LOC.t("abil.ret.name", { n: def.returnN }),
                GAME_LOC.t("abil.ret.desc")]);
        if (def.protect)
            rows.push([GAME_LOC.t("abil.prot.name", { n: def.protect }),
                GAME_LOC.t("abil.prot.desc")]);
        if (def.counterSpike)
            rows.push([GAME_LOC.t("abil.counter.name", { n: def.counterSpike }),
                GAME_LOC.t("abil.counter.desc")]);
        if (def.crush)
            rows.push([GAME_LOC.t("abil.crush.name"), GAME_LOC.t("abil.crush.desc")]);
        if (def.exhuming)
            rows.push([GAME_LOC.t("abil.dig.name", { n: def.exhuming }),
                GAME_LOC.t("abil.dig.desc")]);
        if (!rows.length) return null;
        const node = new PIXI.Container();
        const DW = 330; // ширина колонки описания
        const nameTs = [], descTs = [];
        let h = 14;
        for (const [nm, ds] of rows) {
            const nt = T(nm, 22, 0xf0c96a,
                { stroke: { color: 0x241505, width: 4 } });
            nt.position.set(16, h);
            nt.eventMode = "none";
            h += nt.height + 4;
            const dt = T(ds, 19, 0xf3e6c2,
                { wordWrap: true, wordWrapWidth: DW, breakWords: true,
                    lineHeight: 24 });
            dt.position.set(16, h);
            dt.eventMode = "none";
            h += dt.height + 10;
            node.addChild(nt, dt);
            nameTs.push(nt); descTs.push(dt);
        }
        h += 4;
        const w = Math.min(362, DW + 32);
        const bg = new PIXI.Graphics();
        bg.roundRect(0, 0, w, h, 12);
        bg.fill({ color: 0x171310, alpha: 0.94 });
        bg.stroke({ width: 3, color: 0x6b5c40 });
        node.addChildAt(bg, 0);
        node.eventMode = "none";
        return { node, w, h };
    }

    // ── Снимок текущей сцены в RenderTexture (W150, юзер) ──────────────────
    // Фон экранов ПОВЕРХ игры (награда): затенённый кадр подземелья/мира,
    // а не спрайт из меню. Летербокс-трансформ ui на время рендера
    // снимается (тот же приём, что captureSettingsBg в settingsScene)
    function sceneShot(ctx) {
        const ui = ctx.ui;
        const sx = ui.scale.x, sy = ui.scale.y;
        const px = ui.position.x, py = ui.position.y;
        ui.scale.set(1); ui.position.set(0, 0);
        const rt = PIXI.RenderTexture.create({ width: 1920, height: 1080 });
        ctx.app.renderer.render({ container: ui, target: rt, clear: true });
        ui.scale.set(sx, sy); ui.position.set(px, py);
        return rt;
    }

    globalThis.GAME_UI = { T, fit, button, chip, cardFace, cardZoomer, addGlow, constGlow, pathFx, backTexOf, dimBg, scrollPane, foeTitle, deckTip, hudTipPlate, abilTipOf, sceneShot };
})();
