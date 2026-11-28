// ДЕКОР МЕСТНОСТИ ОТКРЫТОГО МИРА (W204, просил юзер: «окружение скудное —
// сверху тайлов местности декоративные элементы по зонам»). Мелкие
// предметы окружения в стиле игры поверх земли каждой зоны стихии:
// Сила — колья, кости, оружие в земле, знамёна; Рост — кусты, цветы,
// грибы, мшистые камни; Мудрость — кристаллы, рунные камни, руины;
// Тлен — надгробия, черепа, ядовитые лужи; Честь — колонны, черепа
// быков, кактусы; Время — сугробы, ледяные трещины, замёрзшие шестерни.
// Арт — images/deco/<стихия>/<n>.png (листы Flow/Nano Banana Pro по
// референсам игры, нарезка и уменьшение — for_work/deco/cut.py, build.py).
//
// Раскладка ЧИСТО ХЭШЕВАЯ от сида карты и клетки (как деревья и горы
// worldTiles): считается при построении чанка, в сейв не пишется, rng
// генератора не трогает — отряды/POI/кучки/ресурсы по сиду те же.
// Проходимость декор НЕ меняет (rows прежние): это только картинка.
// Клетка годится, если: земля (T.GROUND) и '.' в rows, местность клетки
// — родная местность зоны, у 8 соседей — она же или вода (берега рек не
// пустуют, но крупным предметам у воды нельзя; земляная полоса-буфер у
// стыка зон отсекается), клетка вне спрайтов POI (города/столицы/данжа/
// башни + кольцо в клетку) и не у кучки золота/ресурса. Плотность идёт
// пятнами (value-noise): редкие скопления чередуются с пустой землёй; в
// пятне чаще повторяется «любимый» предмет — пара надгробий, кустик
// ромашек, россыпь сугробов. Соседство — по приоритету-хэшу:
// кандидат ставится, если рядом (в радиусе r, у крупных 2) нет кандидата
// с большим приоритетом — предметы не налезают друг на друга, а правило
// одинаково по обе стороны границы чанка.
//
// W205 (юзер: «так же сделай декор для болот и воды»): два набора не по
// стихиям, а по местности — images/deco/swamp (болота Тлена: рогоз,
// кочки, коряги, пузыри газа, ряска, черепа, блуждающие огоньки) и
// images/deco/water (реки и озёра: кувшинки, камыш, камни в пене, рябь,
// блики, рыба, островки + водный декор зон — льдины Времени, лотосы и
// кристаллы Мудрости, папирус и колонны Чести, лодка и колья Силы,
// ветки и лягушки Роста). У предмета набора: at — какие клетки годятся
// (болото: d — глубина, e — кромка; вода: d — глубина, o — открытая вода,
// s — у берега), only/not — зоны стихий клетки. Правила те же: хэш сида,
// без сейва, rows не трогаются (вода и болото непроходимы и так).
(function () {
    // предметы зон: n — файл images/deco/<стихия>/<n>.png; obj — объект
    // общего y-sort слоя (стоит на земле, герой заходит за него), иначе —
    // плоская «наклейка» на землю под всеми объектами; w — частота;
    // r — радиус соседства в клетках (0 — мелочь может стоять вплотную,
    // 2 — крупный предмет держит вокруг себя две клетки)
    const ITEMS = {
        strength: [
            { n: 1, obj: true, w: 4, r: 1 },  // колья частоколом
            { n: 2, obj: true, w: 4, r: 1 },  // кол с черепом
            { n: 3, obj: true, w: 4, r: 1 },  // груда костей и черепов
            { n: 4, obj: true, w: 1, r: 2 },  // рёбра крупного зверя
            { n: 5, obj: true, w: 3, r: 1 },  // меч в земле
            { n: 6, obj: true, w: 3, r: 1 },  // топор в земле
            { n: 7, obj: true, w: 1, r: 2 },  // рваное красное знамя
            { n: 8, obj: true, w: 4, r: 1 },  // рыжие камни
            { n: 9, obj: true, w: 5, r: 1 },  // сухой колючий куст
            { n: 10, obj: false, w: 6, r: 0 }, // рассыпанные кости
            { n: 11, obj: false, w: 1, r: 2 }, // кострище
            { n: 12, obj: false, w: 2, r: 1 }, // брошенный щит
        ],
        growth: [
            { n: 1, obj: true, w: 4, r: 1 },  // куст с розовыми цветами
            { n: 2, obj: true, w: 3, r: 1 },  // ягодный куст
            { n: 3, obj: true, w: 4, r: 0 },  // мухоморы
            { n: 4, obj: true, w: 3, r: 1 },  // мшистый валун
            { n: 5, obj: true, w: 2, r: 1 },  // пень с ростком
            { n: 6, obj: true, w: 4, r: 1 },  // папоротник
            { n: 7, obj: true, w: 6, r: 0 },  // трава с полевыми цветами
            { n: 8, obj: true, w: 1, r: 2 },  // мшистое бревно
            { n: 9, obj: false, w: 6, r: 0 }, // ромашки
            { n: 10, obj: false, w: 1, r: 2 }, // ведьмин круг грибов
            { n: 11, obj: true, w: 2, r: 1 }, // шиповник
            { n: 12, obj: false, w: 3, r: 1 }, // мшистые камни с клевером
        ],
        wisdom: [
            { n: 1, obj: true, w: 5, r: 1 },  // голубые кристаллы
            { n: 2, obj: true, w: 4, r: 1 },  // аметисты
            { n: 3, obj: true, w: 2, r: 1 },  // рунный камень
            { n: 4, obj: true, w: 2, r: 1 },  // обломок мраморной колонны
            { n: 5, obj: true, w: 2, r: 0 },  // светящиеся грибы
            { n: 6, obj: false, w: 1, r: 2 }, // магический круг на земле
            { n: 7, obj: false, w: 5, r: 0 }, // осколки кристаллов
            { n: 8, obj: true, w: 1, r: 2 },  // жаровня с синим огнём
            { n: 9, obj: true, w: 1, r: 2 },  // обелиск со звездой
            { n: 10, obj: false, w: 2, r: 1 }, // упавшая скрижаль
            { n: 11, obj: true, w: 4, r: 1 }, // камни с кварцевыми жилами
            { n: 12, obj: true, w: 1, r: 2 }, // голова статуи мага
        ],
        decay: [
            { n: 1, obj: true, w: 5, r: 1 },  // треснувшее надгробие
            { n: 2, obj: true, w: 3, r: 1 },  // кельтский крест
            { n: 3, obj: true, w: 3, r: 1 },  // груда черепов
            { n: 4, obj: true, w: 3, r: 1 },  // мёртвый чёрный пень
            { n: 5, obj: false, w: 2, r: 1 }, // ядовитая лужа
            { n: 6, obj: true, w: 4, r: 0 },  // ядовитые грибы
            { n: 7, obj: true, w: 1, r: 2 },  // гроб
            { n: 8, obj: false, w: 5, r: 0 }, // кости на земле
            { n: 9, obj: true, w: 1, r: 2 },  // костяной тотем
            { n: 10, obj: true, w: 4, r: 1 }, // чёрный терновник
            { n: 11, obj: true, w: 1, r: 2 }, // кладбищенская ограда
            { n: 12, obj: true, w: 1, r: 2 }, // котёл с зелёной жижей
        ],
        honor: [
            { n: 1, obj: true, w: 3, r: 1 },  // обломок колонны
            { n: 2, obj: true, w: 2, r: 2 },  // поваленные барабаны колонны
            { n: 3, obj: true, w: 1, r: 2 },  // меч в камне со щитом
            { n: 4, obj: true, w: 1, r: 2 },  // сине-золотое знамя
            { n: 5, obj: true, w: 4, r: 1 },  // песчаниковая скала
            { n: 6, obj: true, w: 6, r: 0 },  // сухой куст перекати-поле
            { n: 7, obj: false, w: 3, r: 1 }, // бычий череп
            { n: 8, obj: true, w: 4, r: 0 },  // круглый кактус
            { n: 9, obj: true, w: 1, r: 1 },  // шлем рыцарской статуи
            { n: 10, obj: false, w: 6, r: 0 }, // галька
            { n: 11, obj: true, w: 4, r: 1 }, // агава
            { n: 12, obj: true, w: 1, r: 2 }, // святилище солнца
        ],
        time: [
            { n: 1, obj: true, w: 2, r: 2 },  // большой сугроб
            { n: 2, obj: true, w: 3, r: 1 },  // малый сугроб
            { n: 3, obj: false, w: 1, r: 1 }, // ледяной провал-звезда
            { n: 4, obj: true, w: 2, r: 1 },  // ледяные кристаллы
            { n: 5, obj: true, w: 3, r: 1 },  // валун под снегом
            { n: 6, obj: true, w: 3, r: 1 },  // обледенелый куст
            { n: 7, obj: true, w: 1, r: 1 },  // шестерня во льду
            { n: 8, obj: true, w: 1, r: 1 },  // песочные часы в снегу
            { n: 9, obj: false, w: 2, r: 1 }, // замёрзшая лужа
            { n: 10, obj: true, w: 2, r: 1 }, // пень под снегом
            { n: 11, obj: true, w: 3, r: 1 }, // камни под снегом
            { n: 12, obj: true, w: 1, r: 2 }, // колонна с часами
            // второй лист Времени (W204, «сугробы и трещины» юзера):
            // тонкие трещины во льду, сугробы с голубой тенью, иней
            { n: 13, obj: false, w: 4, r: 1 }, // длинная ветвистая трещина
            { n: 14, obj: false, w: 4, r: 1 }, // трещина с отростками
            { n: 15, obj: false, w: 2, r: 0 }, // короткая трещина-зигзаг
            { n: 16, obj: false, w: 3, r: 1 }, // паутина трещин
            { n: 17, obj: true, w: 3, r: 2 },  // широкий сугроб
            { n: 18, obj: true, w: 4, r: 1 },  // круглый сугроб
            { n: 19, obj: true, w: 3, r: 2 },  // длинный вал сугроба
            { n: 20, obj: true, w: 4, r: 0 },  // заиндевевшая трава
            { n: 21, obj: true, w: 4, r: 0 },  // заиндевевшая трава 2
            { n: 22, obj: true, w: 1, r: 2 },  // бивни мамонта из снега
            { n: 23, obj: true, w: 2, r: 1 },  // ледяные пики
            { n: 24, obj: false, w: 1, r: 1 }, // стрелки и шестерни на снегу
        ],
        // ── W205: БОЛОТА Тлена (T.SWAMP). at: d — глубина (все 8 соседей
        // — болото), e — кромка (сосед — суша; гать/лес рядом — пусто)
        swamp: [
            { n: 1, obj: true, w: 5, r: 1, at: "de" },   // рогоз
            { n: 2, obj: true, w: 4, r: 1, at: "de" },   // кочка осоки
            { n: 3, obj: true, w: 2, r: 2, at: "d" },    // мёртвая коряга
            { n: 4, obj: true, w: 2, r: 1, at: "de" },   // гнилой пень
            { n: 5, obj: false, w: 5, r: 0, at: "d" },   // пузыри газа
            { n: 6, obj: false, w: 3, r: 1, at: "d" },   // пятно ряски
            { n: 7, obj: false, w: 3, r: 1, at: "d" },   // кувшинки с бледным цветком
            { n: 8, obj: true, w: 2, r: 1, at: "de" },   // череп и рёбра из трясины
            { n: 9, obj: true, w: 2, r: 1, at: "d" },    // блуждающие огоньки
            { n: 10, obj: false, w: 1, r: 2, at: "d" },  // полузатонувшее бревно
            { n: 11, obj: true, w: 2, r: 1, at: "de" },  // ядовитые грибы на кочке
            { n: 12, obj: true, w: 1, r: 1, at: "de" },  // костяная рука
        ],
        // ── W205: ВОДА рек и озёр (T.WATER; в Тлен вода не заходит).
        // at: d — глубина (8 соседей — вода), o — открытая вода (4 стороны
        // — вода, суша лишь по диагонали), s — у берега (суша с одной
        // стороны или с двух смежных; предмет сдвигается от берега к
        // середине реки), n — узкая протока (суша с противоположных
        // сторон: только камыш, камешки, колья); only/not — зоны стихий.
        // Реки в 2–5 клеток: глубины мало, основной декор — у берегов
        water: [
            { n: 1, obj: false, w: 4, r: 1, at: "dos", not: ["time"] },  // кувшинки
            { n: 2, obj: false, w: 3, r: 1, at: "dos", not: ["time"] },  // белая кувшинка
            { n: 3, obj: false, w: 3, r: 1, at: "dos", not: ["time"] },  // кубышки
            { n: 4, obj: true, w: 4, r: 1, at: "sn", not: ["time", "honor"] }, // рогоз
            { n: 5, obj: true, w: 4, r: 1, at: "sn", not: ["time"] },    // тростник
            { n: 6, obj: true, w: 2, r: 1, at: "dos" },   // мшистый камень в пене
            { n: 7, obj: true, w: 3, r: 1, at: "dosn" },  // мокрые камни в пене
            { n: 8, obj: false, w: 2, r: 1, at: "dos" },  // топляк
            { n: 9, obj: false, w: 3, r: 0, at: "dos" },  // круги на воде
            { n: 10, obj: false, w: 2, r: 0, at: "dosn" }, // солнечные блики
            { n: 11, obj: true, w: 1, r: 1, at: "dos", not: ["time"] },  // рыба в прыжке
            { n: 12, obj: true, w: 1, r: 2, at: "do", not: ["time"] },   // травяной островок
            // водный декор зон (второй лист)
            { n: 13, obj: false, w: 3, r: 2, at: "do", only: ["time"] },    // большая льдина
            { n: 14, obj: false, w: 5, r: 1, at: "dos", only: ["time"] },   // мелкие льдины
            { n: 15, obj: true, w: 3, r: 1, at: "dosn", only: ["time"] },   // ледяная глыба
            { n: 16, obj: false, w: 4, r: 1, at: "dos", only: ["wisdom"] }, // светящийся лотос
            { n: 17, obj: true, w: 2, r: 1, at: "dos", only: ["wisdom"] },  // кристалл из воды
            { n: 18, obj: true, w: 5, r: 1, at: "sn", only: ["honor"] },    // папирус
            { n: 19, obj: true, w: 2, r: 1, at: "dos", only: ["honor"] },   // затонувшая колонна
            { n: 20, obj: true, w: 1, r: 2, at: "do", only: ["strength"] }, // затонувшая лодка
            { n: 21, obj: true, w: 3, r: 1, at: "osn", only: ["strength"] }, // колья в воде
            { n: 22, obj: false, w: 2, r: 1, at: "dos", only: ["growth"] }, // ветка с листьями
            { n: 23, obj: false, w: 2, r: 1, at: "dos", only: ["growth"] }, // лягушка на кувшинке
            { n: 24, obj: true, w: 1, r: 1, at: "sn" },   // причальный столб
        ],
    };
    // доля клеток-кандидатов в «густом» пятне (до гашения соседями).
    // Юзер (W204): первый вариант (~9–12% земли зоны) «слишком часто и
    // пестрит» — плотность снижена в ~3.4 раза: итог ~2.3–3.2% клеток
    // земли зоны (≈2000 предметов на карту вместо ≈6800); затем юзер сам
    // проредил сушу ещё ×0.62 — ≈1.4–2.1% земли зоны, ≈1300 на карту.
    // W205: болота мелкие и все в глубине Тлена — гуще и без пустых
    // пятен (≈7–10% клеток болота, ≈50 на карту); вода — пятнами, как
    // суша (≈2–4% клеток воды, ≈200 на карту)
    const DENSITY = {
        strength: 0.033, growth: 0.038, wisdom: 0.033,
        decay: 0.033, honor: 0.03, time: 0.035,
        swamp: 0.16, water: 0.07,
    };
    const SEED_K = 0xdec0; // соль хэшей декора (не совпадает с деревьями/горами)
    // разброс в клетке (доли клетки) и низ объекта: на суше — как W204; на
    // воде уже (предмет не наезжает на берег), низ выше — в своей клетке
    const POS = {
        land: { jx: 0.5, jy: 0.3, base: 0.85 },
        swamp: { jx: 0.4, jy: 0.24, base: 0.8 },
        water: { jx: 0.24, jy: 0.16, base: 0.78 },
    };
    const SHORE_SHIFT = 0.22; // сдвиг водного предмета от берега, доля клетки

    // накопленные веса по зонам — выбор предмета одним хэшем
    const CUM = {};
    for (const el of Object.keys(ITEMS)) {
        let s = 0;
        CUM[el] = ITEMS[el].map((it) => (s += it.w));
    }
    // наборы болот/воды: накопленные веса по ключу «набор|зона|класс
    // клетки», вес 0 — предмету здесь нельзя (at/only/not)
    const PICK = new Map();
    function pickCum(set, el, cls) {
        const key = set + "|" + el + "|" + cls;
        let cum = PICK.get(key);
        if (!cum) {
            let s = 0;
            cum = ITEMS[set].map((it) => (s += it.at.includes(cls)
                && (!it.only || it.only.includes(el))
                && (!it.not || !it.not.includes(el)) ? it.w : 0));
            PICK.set(key, cum);
        }
        return cum;
    }
    // выбор предмета: в пятне 8×8 есть «любимый» (38% случаев), иначе —
    // по весам; -1 — выбирать не из чего
    function pickItem(cum, x, y, seed) {
        const GEN = globalThis.GAME_WORLDGEN;
        const tot = cum[cum.length - 1];
        if (!tot) return -1;
        const roll = GEN.hash2(x, y, seed ^ (SEED_K + 3)) < 0.38
            ? GEN.hash2(x >> 3, y >> 3, seed ^ (SEED_K + 4)) * tot
            : GEN.hash2(x, y, seed ^ (SEED_K + 5)) * tot;
        return cum.findIndex((c) => roll < c);
    }
    const smooth = (t) => t * t * (3 - 2 * t);
    // value-noise по блокам b×b клеток (билинейно), 0..1
    function vnoise(hash2, x, y, b, k) {
        const bx = x / b, by = y / b;
        const x0 = Math.floor(bx), y0 = Math.floor(by);
        const fx = smooth(bx - x0), fy = smooth(by - y0);
        const c00 = hash2(x0, y0, k), c10 = hash2(x0 + 1, y0, k);
        const c01 = hash2(x0, y0 + 1, k), c11 = hash2(x0 + 1, y0 + 1, k);
        return (c00 * (1 - fx) + c10 * fx) * (1 - fy)
            + (c01 * (1 - fx) + c11 * fx) * fy;
    }

    // запретная маска карты (кэш на объект карты): спрайты POI с кольцом
    // в клетку (город 9×6, столица 9×8, данж 6×5, башня 3×4 — габариты
    // спрайтов world.js), кучки золота 2×1 и ресурсы 1×1 с кольцом
    const MASKS = new WeakMap();
    function blockMask(map) {
        let m = MASKS.get(map);
        if (m) return m;
        const W = map.w, H = map.h;
        m = new Uint8Array(W * H);
        const rect = (x0, y0, x1, y1) => {
            for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
                for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
                    m[y * W + x] = 1;
        };
        for (const p of map.pois || []) {
            const { gx, gy } = p;
            if (p.kind === "town") rect(gx - 5, gy - 6, gx + 5, gy + 1);
            else if (p.kind === "capital") rect(gx - 5, gy - 8, gx + 5, gy + 1);
            else if (p.kind === "tower") rect(gx - 2, gy - 4, gx + 2, gy + 1);
            else rect(gx - 3, gy - 5, gx + 4, gy + 1); // пещера данжа 6×4.25
        }
        for (const p of map.goldPiles || []) rect(p.gx - 1, p.gy - 1, p.gx + 2, p.gy + 1);
        for (const p of map.resNodes || []) rect(p.gx - 1, p.gy - 1, p.gx + 1, p.gy + 1);
        MASKS.set(map, m);
        return m;
    }

    // плотность пятнами: два октава шума (0..1)
    const patch = (GEN, x, y, seed) =>
        0.65 * vnoise(GEN.hash2, x, y, 9, seed ^ (SEED_K + 1))
        + 0.35 * vnoise(GEN.hash2, x, y, 4, seed ^ (SEED_K + 2));

    // W205: кандидат клетки болота. Соседи — болото или суша Тлена: у гати
    // (дорога через болото), леса и воды — пусто; d — глубина, e — кромка.
    // Болота — кляксы в десятки клеток: плотность мягче, чем у суши (пятна
    // гуще/реже, но пустых болот нет)
    function swampCandidate(map, seed, x, y, i) {
        const GEN = globalThis.GAME_WORLDGEN, T = GEN.T, W = map.w;
        let deep = true;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                const t = map.ter[i + dy * W + dx];
                if (t === T.SWAMP) continue;
                if (t !== T.GROUND) return null;
                deep = false;
            }
        const dens = DENSITY.swamp * (0.4 + 1.2 * patch(GEN, x, y, seed));
        if (GEN.hash2(x, y, seed ^ SEED_K) >= dens) return null;
        const z = GEN.ELEMS[map.zone[i]];
        const k = pickItem(pickCum("swamp", z, deep ? "d" : "e"), x, y, seed);
        if (k < 0) return null;
        return { el: "swamp", k, z, pri: GEN.hash2(x, y, seed ^ (SEED_K + 6)) };
    }

    // W205: кандидат клетки воды (мосты — T.BRIDGE — не вода декора).
    // Мост и дорога ближе 2 клеток — пусто (под настил и к съезду не
    // лезем), лес и горы в соседях — пусто (кроны и скалы свешиваются на
    // воду). Класс: d — глубина, o — открытая вода, s — у берега
    function waterCandidate(map, seed, x, y, i) {
        const GEN = globalThis.GAME_WORLDGEN, T = GEN.T, W = map.w;
        for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
                const t = map.ter[i + dy * W + dx];
                if (t === T.BRIDGE || t === T.ROAD) return null;
                if ((t === T.FOREST || t === T.MOUNTAIN)
                    && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return null;
            }
        let deep = true;
        const dry = (dx, dy) => map.ter[i + dy * W + dx] !== T.WATER ? 1 : 0;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
                if (dry(dx, dy)) deep = false;
        // суша по сторонам: сдвиг предмета — от берега (sx/sy в долях
        // клетки), протока — суша с противоположных сторон
        const lN = dry(0, -1), lS = dry(0, 1), lW = dry(-1, 0), lE = dry(1, 0);
        const cls = deep ? "d" : (lN && lS) || (lW && lE) ? "n"
            : lN || lS || lW || lE ? "s" : "o";
        const n = patch(GEN, x, y, seed);
        const dens = DENSITY.water * Math.min(1.5, Math.max(0, (n - 0.18) * 2.1));
        if (GEN.hash2(x, y, seed ^ SEED_K) >= dens) return null;
        const z = GEN.ELEMS[map.zone[i]];
        const k = pickItem(pickCum("water", z, cls), x, y, seed);
        if (k < 0) return null;
        return { el: "water", k, z, cls, sx: lW - lE, sy: lN - lS,
            pri: GEN.hash2(x, y, seed ^ (SEED_K + 6)) };
    }

    // кандидат клетки (без учёта соседей): null или {el, k, z, pri}; el —
    // набор (стихия суши или swamp/water), z — стихия зоны клетки
    function candidate(map, terr, mask, seed, x, y) {
        const GEN = globalThis.GAME_WORLDGEN, T = GEN.T;
        const WT = globalThis.GAME_WORLDTILES;
        const W = map.w, H = map.h;
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return null;
        const i = y * W + x;
        if (mask[i]) return null;
        if (map.ter[i] === T.SWAMP) return swampCandidate(map, seed, x, y, i);
        if (map.ter[i] === T.WATER) return waterCandidate(map, seed, x, y, i);
        if (map.ter[i] !== T.GROUND) return null;
        if (map.rows[y][x] !== ".") return null;
        const el = GEN.ELEMS[map.zone[i]];
        const items = ITEMS[el];
        if (!items) return null;
        // местность клетки и 8 соседей — родная местность зоны; вода у
        // соседей допустима (берега рек не пустуют), но крупным
        // предметам (r=2) у воды не место — свесились бы на реку
        const tz = WT.ZONE_TERRAIN[el];
        if (terr[i] !== tz) return null;
        let wet = false;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                const t = terr[i + dy * W + dx];
                if (t === tz) continue;
                if (t === WT.WATER) { wet = true; continue; }
                return null;
            }
        // плотность пятнами: пустоши почти без декора
        const n = patch(GEN, x, y, seed);
        const dens = DENSITY[el] * Math.min(1.5, Math.max(0, (n - 0.18) * 2.1));
        if (GEN.hash2(x, y, seed ^ SEED_K) >= dens) return null;
        // выбор предмета по весам зоны («любимый» в пятне 8×8)
        const k = pickItem(CUM[el], x, y, seed);
        if (wet && items[k].r > 1) return null;
        return { el, k, z: el, pri: GEN.hash2(x, y, seed ^ (SEED_K + 6)) };
    }

    // раскладка чанка 32×32 клеток — ЧИСТАЯ (без PIXI, для проб тоже):
    // [{gx, gy, el, z, k, n, obj, x, y, flip}] — el — набор (стихия суши или
    // swamp/water), z — стихия зоны клетки; x/y в пикселях мира (у
    // объекта — точка низа, у наклейки — центр)
    function placeChunk(map, terr, seed, x0, y0, TS, cells) {
        const GEN = globalThis.GAME_WORLDGEN;
        const W = map.w, H = map.h;
        const mask = blockMask(map);
        const CH = cells || globalThis.GAME_WORLDTILES.CHUNK;
        const xe = Math.min(W, x0 + CH), ye = Math.min(H, y0 + CH);
        const memo = new Map();
        const cand = (x, y) => {
            const key = y * W + x;
            if (memo.has(key)) return memo.get(key);
            const c = candidate(map, terr, mask, seed, x, y);
            memo.set(key, c);
            return c;
        };
        const out = [];
        for (let j = y0; j < ye; j++) for (let i = x0; i < xe; i++) {
            const c = cand(i, j);
            if (!c) continue;
            const rc = ITEMS[c.el][c.k].r;
            let ok = true;
            for (let dy = -2; dy <= 2 && ok; dy++)
                for (let dx = -2; dx <= 2; dx++) {
                    if (!dx && !dy) continue;
                    const d = cand(i + dx, j + dy);
                    if (!d) continue;
                    const R = Math.max(rc, ITEMS[d.el][d.k].r);
                    if (Math.max(Math.abs(dx), Math.abs(dy)) > R) continue;
                    if (d.pri > c.pri) { ok = false; break; }
                }
            if (!ok) continue;
            const it = ITEMS[c.el][c.k];
            const P = POS[c.el] || POS.land;
            // вода у берега: сдвиг от суши к середине реки (sx/sy — 0/±1)
            const jx = (GEN.hash2(i, j, seed ^ (SEED_K + 7)) - 0.5) * TS * P.jx
                + (c.sx || 0) * TS * SHORE_SHIFT;
            const jy = (GEN.hash2(i, j, seed ^ (SEED_K + 8)) - 0.5) * TS * P.jy
                + (c.sy || 0) * TS * SHORE_SHIFT;
            out.push({
                gx: i, gy: j, el: c.el, z: c.z, k: c.k, n: it.n, obj: it.obj,
                x: Math.round((i + 0.5) * TS + jx),
                y: Math.round((it.obj ? j + P.base : j + 0.5) * TS + jy),
                flip: GEN.hash2(i, j, seed ^ (SEED_K + 9)) < 0.5,
            });
        }
        return out;
    }

    // спрайты чанка: наклейки — в контейнер flat (кладётся в чанк под
    // лесной оверлей), объекты — списком для общего y-sort слоя сцены
    function renderDecoChunk(map, terr, decoTex, TS, seed, x0, y0) {
        const flat = new PIXI.Container();
        const sprites = [];
        let count = 0;
        for (const d of placeChunk(map, terr, seed, x0, y0, TS)) {
            const tex = decoTex[d.el] && decoTex[d.el][d.k];
            if (!tex) continue;
            const spr = new PIXI.Sprite(tex);
            spr.anchor.set(0.5, d.obj ? 1 : 0.5);
            if (d.flip) spr.scale.x = -1;
            spr.position.set(d.x, d.y);
            spr.eventMode = "none";
            spr.__deco = d.el + ":" + d.n; // тест-хук: перепись декора
            spr.__zone = d.z;
            if (d.obj) {
                spr.zIndex = d.y; // y-sort: низ предмета
                sprites.push(spr);
            } else flat.addChild(spr);
            count++;
        }
        return { flat, sprites, count };
    }

    // пути картинок по зонам — для загрузчика main.js (порядок = ITEMS)
    const files = () => Object.fromEntries(Object.entries(ITEMS).map(
        ([el, list]) => [el, list.map((it) => `./images/deco/${el}/${it.n}.png`)]));

    globalThis.GAME_WORLDDECO = {
        ITEMS, DENSITY, files, blockMask, candidate, placeChunk,
        renderDecoChunk,
    };
})();
