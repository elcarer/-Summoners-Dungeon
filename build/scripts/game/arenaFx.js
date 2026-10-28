// СЦЕНА «АРЕНА»: процедурные эффекты боя.
// Отдельный лёгкий слой частиц: никаких новых картинок — только PIXI.Graphics,
// поэтому эффекты работают в любой стихии и не требуют предзагрузки.
// Модуль вешает на A fxEvent/fxTick/fxClear; сцена тикает их в update,
// а боевые события зовут fxEvent из своих точек (урон, лечение, смерть,
// призыв, каст, ловушка, статус, удар по базе, смена хода, итог боя).
(function () {
    globalThis.GAME_ARENA.installFx = function installFx(A) {
        with (A) {
            const MAX_FX = 40;       // одновременно живущих эффектов
            const MAX_PARTS = 40;    // частиц в одном эффекте
            const ELEM_FX = { strength: 0xff7a4e, growth: 0x8fe06a, wisdom: 0x5cc8ff };
            const GOLD = 0xffd98c;

            A.fxList = [];
            A.fxSeq = 0;
            A.fxEnabled = true;

            const rnd = (a, b) => a + Math.random() * (b - a);
            const pick = (arr) => arr[(Math.random() * arr.length) | 0];
            const TAU = Math.PI * 2;
            const easeOut = (k) => 1 - Math.pow(1 - k, 3);

            // Цвет эффекта по стихии карты (сила/рост/мудрость).
            A.fxColorOf = (elem) => ELEM_FX[elem] || 0xffc27a;

            function part(e, p) {
                if (e.parts.length >= MAX_PARTS) return;
                p.type = p.type || "dot";
                p.x = p.x || 0;
                p.y = p.y || 0;
                p.age = 0;
                p.total = p.total || 0.5;
                p.delay = p.delay || 0;
                p.alpha = p.alpha === undefined ? 1 : p.alpha;
                p.vx = p.vx || 0;
                p.vy = p.vy || 0;
                p.ax = p.ax || 0;
                p.ay = p.ay || 0;
                p.rot = p.rot || 0;
                p.spin = p.spin || 0;
                p.sway = p.sway || 0;
                p.phase = p.phase || 0;
                p.rise = p.rise || 0;
                p.add = p.add !== false;
                e.parts.push(p);
            }

            const dot = (e, x, y, r, color, o = {}) => part(e, {
                type: "dot", x, y, r, color, ...o,
            });
            const ring = (e, r0, r1, w, color, o = {}) => part(e, {
                type: "ring", r0, r1, w, color, glow: o.glow !== false, ...o,
            });
            const spark = (e, x, y, vx, vy, color, o = {}) => part(e, {
                type: "spark", x, y, vx, vy, color, len: o.len || 14,
                w: o.w || 2.5, ...o,
            });
            const shard = (e, x, y, vx, vy, size, color, o = {}) => part(e, {
                type: "shard", x, y, vx, vy, size, color, ...o,
            });
            const smoke = (e, x, y, vx, vy, r, color, o = {}) => part(e, {
                type: "smoke", x, y, vx, vy, r, color, add: false, alpha: 0.3, ...o,
            });

            // ── Пресеты эффектов ─────────────────────────────────────────────
            // Каждый пресет только раскладывает частицы; движение/рисование —
            // общее, поэтому событие можно собрать из готовых «кирпичиков».
            const BUILD = {
                // Удар по существу: вспышка, расходящееся кольцо, искры и осколки.
                impact(e, o) {
                    const pw = o.power || 1;
                    dot(e, 0, 0, 21 * pw, 0xfff4dc, { total: 0.14, alpha: 0.95 });
                    ring(e, 6, 72 * pw, 6, e.color, { total: 0.36, glow: true });
                    ring(e, 2, 42 * pw, 2.8, 0xfff1d0, { total: 0.24 });
                    ring(e, 18, 96 * pw, 1.8, e.color,
                        { total: 0.4, alpha: 0.3, delay: 0.06 });
                    part(e, { type: "arc", r: 37 * pw, a0: -1.15, a1: 1.15,
                        w: 7.5, color: 0xfff4dc, rot: rnd(-1.2, 1.2) - 0.65,
                        total: 0.22, alpha: 0.95 });
                    part(e, { type: "arc", r: 29 * pw, a0: 1.7, a1: 2.75,
                        w: 3.5, color: e.color, rot: rnd(-0.8, 0.8),
                        total: 0.26, alpha: 0.8 });
                    for (let i = 0; i < 16; i++) {
                        const a = rnd(0, TAU), sp = rnd(150, 470) * pw;
                        spark(e, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp,
                            i % 3 ? e.color : 0xfff1d0,
                            { len: rnd(8, 24), w: rnd(1.6, 3.6), total: rnd(0.26, 0.58),
                                ay: rnd(150, 330), alpha: rnd(0.65, 1) });
                    }
                    for (let i = 0; i < 6; i++) {
                        const a = rnd(0, TAU), sp = rnd(70, 210);
                        shard(e, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp,
                            rnd(3, 7), i % 2 ? e.color : 0xffe9d0,
                            { total: rnd(0.4, 0.7), ay: rnd(360, 620),
                                spin: rnd(-5, 5), alpha: 0.85 });
                    }
                    // Пыль у ног — мягкая, без «свечения».
                    for (let i = 0; i < 4; i++) {
                        smoke(e, rnd(-22, 22), rnd(14, 28), rnd(-45, 45),
                            rnd(-25, -5), rnd(7, 14), 0x6b5a4a,
                            { total: rnd(0.45, 0.7), alpha: 0.22 });
                    }
                },

                // Лечение: тёплые искры, плюсы и кольцо жизни.
                heal(e) {
                    ring(e, 10, 58, 5, 0xb8ee8c, { total: 0.62 });
                    ring(e, 24, 78, 1.8, 0xe7ffb0,
                        { total: 0.52, alpha: 0.3, delay: 0.08 });
                    dot(e, 0, -12, 30, 0x9fe37a, { total: 0.42, alpha: 0.22 });
                    dot(e, 0, -12, 15, 0xd8ff9e, { total: 0.3, alpha: 0.45 });
                    for (let i = 0; i < 15; i++) {
                        const a = rnd(0, TAU), rr = rnd(8, 34);
                        dot(e, Math.cos(a) * rr, Math.sin(a) * rr + 12,
                            rnd(1.8, 4.4), pick([0xb8ee8c, 0xe7ffb0, GOLD]),
                            { vx: rnd(-12, 12), vy: rnd(-95, -45), total: rnd(0.55, 1),
                                sway: rnd(0.3, 0.9), phase: rnd(0, TAU), alpha: rnd(0.65, 1) });
                    }
                    for (let i = 0; i < 4; i++) {
                        part(e, { type: "plus", x: rnd(-22, 22), y: rnd(0, 20),
                            size: rnd(4, 8), w: 2, color: 0xd8ff9e,
                            vy: rnd(-70, -35), total: rnd(0.6, 0.95),
                            sway: rnd(0.4, 1), phase: rnd(0, TAU), delay: i * 0.07 });
                    }
                },

                // Смерть: тёмный дым, осколки и улетающая душа.
                death(e) {
                    dot(e, 0, 0, 20, e.color, { total: 0.18, alpha: 0.5 });
                    ring(e, 8, 62, 4, 0x8e7a9a, { total: 0.45, alpha: 0.5, glow: false });
                    for (let i = 0; i < 10; i++) {
                        smoke(e, rnd(-28, 28), rnd(-16, 24), rnd(-35, 35),
                            rnd(-30, 5), rnd(10, 22), pick([0x332a3a, 0x4a3a4a, 0x5a4a5a]),
                            { total: rnd(0.55, 0.95), alpha: rnd(0.18, 0.34) });
                    }
                    for (let i = 0; i < 14; i++) {
                        const a = rnd(0, TAU), sp = rnd(50, 240);
                        shard(e, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp,
                            rnd(3, 8), pick([e.color, 0xd8c7a0, 0xffe9b0]),
                            { total: rnd(0.45, 0.85), ay: rnd(280, 650), spin: rnd(-7, 7),
                                alpha: 0.8 });
                    }
                    part(e, { type: "wisp", x: 0, y: -8, r: 9, color: e.color,
                        vy: -80, total: 0.9, alpha: 0.9, sway: 0.5, phase: rnd(0, TAU) });
                    for (let i = 0; i < 5; i++) {
                        dot(e, rnd(-12, 12), rnd(-26, 4), rnd(1.5, 3.5), 0xfff1d0,
                            { vx: rnd(-18, 18), vy: rnd(-150, -80), total: rnd(0.6, 1.1),
                                delay: 0.12 + i * 0.04, alpha: 0.7 });
                    }
                },

                // Призыв: портал у ног, спираль искр и световой столб.
                summon(e) {
                    part(e, { type: "ellipse", r: 48, h: 16, w: 4.2, color: e.color,
                        total: 0.52, glow: true, oy: 0 });
                    part(e, { type: "ellipse", r: 28, h: 9, w: 2.2, color: 0xfff1d0,
                        total: 0.38, oy: 0 });
                    part(e, { type: "ellipse", r: 70, h: 22, w: 1.4, color: e.color,
                        total: 0.6, alpha: 0.3, delay: 0.1 });
                    dot(e, 0, -26, 46, e.color, { total: 0.38, alpha: 0.1 });
                    part(e, { type: "beam", y0: 18, y1: -112, w: 42, color: e.color,
                        total: 0.48, alpha: 0.2 });
                    part(e, { type: "beam", y0: 10, y1: -96, w: 13, color: 0xfff4dc,
                        total: 0.4, alpha: 0.62 });
                    for (let i = 0; i < 20; i++) {
                        part(e, { type: "spiral", x: 0, y: 0, r0: rnd(38, 58),
                            r1: rnd(5, 17), a: rnd(0, TAU), spin: rnd(-3.8, 3.8),
                            rise: rnd(55, 145), size: rnd(1.8, 4.6),
                            color: i % 4 ? e.color : 0xfff1d0, total: rnd(0.5, 1),
                            delay: rnd(0, 0.2), alpha: rnd(0.65, 1) });
                    }
                    for (let i = 0; i < 7; i++) {
                        const a = rnd(0, TAU);
                        shard(e, Math.cos(a) * 30, Math.sin(a) * 12,
                            Math.cos(a) * rnd(15, 45), -rnd(55, 125),
                            rnd(2.5, 5), GOLD, { total: rnd(0.45, 0.8),
                                ay: 140, spin: rnd(-6, 6), alpha: 0.8 });
                    }
                    dot(e, 0, 4, 24, e.color, { total: 0.24, alpha: 0.45 });
                },

                // Каст: магический круг, руны на орбите и спираль энергии.
                cast(e, o) {
                    const s = o.scale || 1;
                    dot(e, 0, -8, 66 * s, e.color, { total: 0.5, alpha: 0.1 });
                    ring(e, 14 * s, 98 * s, 3.2, e.color, { total: 0.82, glow: true });
                    ring(e, 5 * s, 52 * s, 2, 0xd8f6ff, { total: 0.52, alpha: 0.75 });
                    ring(e, 34 * s, 128 * s, 1.4, e.color,
                        { total: 0.72, alpha: 0.32, delay: 0.08 });
                    part(e, { type: "ellipse", r: 64 * s, h: 22 * s, w: 2.4,
                        color: e.color, total: 0.62, oy: 22 * s, glow: true });
                    dot(e, 0, -4, 15 * s, 0xd8f6ff, { total: 0.26, alpha: 0.8 });
                    for (let i = 0; i < 10; i++) {
                        part(e, { type: "orbitRune", orbitR: (52 + (i % 2) * 22) * s,
                            a: (i / 10) * TAU, spin: 1.2, size: 6 * s,
                            color: i % 4 ? e.color : 0xd8f6ff, total: 0.72,
                            delay: 0.03 + i * 0.012, alpha: 0.9 });
                    }
                    for (let i = 0; i < 20; i++) {
                        part(e, { type: "spiral", x: 0, y: 0, r0: rnd(22, 72) * s,
                            r1: rnd(2, 12) * s, a: rnd(0, TAU), spin: rnd(-4, 4),
                            rise: rnd(20, 85) * s, size: rnd(1.5, 3.8),
                            color: i % 5 ? e.color : 0xd8f6ff, total: rnd(0.42, 0.85),
                            delay: rnd(0, 0.14), alpha: rnd(0.6, 1) });
                    }
                    for (let i = 0; i < 6; i++) {
                        const a = rnd(0, TAU);
                        spark(e, Math.cos(a) * 20 * s, Math.sin(a) * 20 * s,
                            Math.cos(a) * rnd(60, 180), Math.sin(a) * rnd(60, 180),
                            e.color, { len: rnd(6, 16), w: rnd(1.5, 2.8),
                                total: rnd(0.28, 0.55), ay: 100, alpha: 0.85 });
                    }
                },

                // Лёд: снежинки, кристаллы и морозная дымка.
                ice(e, o) {
                    const s = o.scale || 1;
                    ring(e, 8 * s, 62 * s, 3.2, 0xa8e8ff, { total: 0.52 });
                    part(e, { type: "ellipse", r: 42 * s, h: 13 * s, w: 2,
                        color: 0xc8f4ff, total: 0.5, oy: 16 * s });
                    for (let i = 0; i < 9; i++) {
                        const a = (i / 9) * TAU + rnd(-0.15, 0.15), rr = rnd(15, 42) * s;
                        part(e, { type: "flake", x: Math.cos(a) * rr, y: Math.sin(a) * rr,
                            size: rnd(4, 8) * s, color: i % 3 ? 0xa8e8ff : 0xe8fbff,
                            rot: a, spin: rnd(-2, 2), total: rnd(0.55, 0.95),
                            vx: Math.cos(a) * 22, vy: Math.sin(a) * 22, alpha: 0.9 });
                    }
                    for (let i = 0; i < 7; i++) {
                        const a = rnd(0, TAU);
                        shard(e, 0, 0, Math.cos(a) * rnd(40, 160), Math.sin(a) * rnd(40, 160),
                            rnd(3, 6) * s, 0xd8f6ff, { total: rnd(0.45, 0.8),
                                ay: 80, spin: rnd(-5, 5), alpha: 0.8 });
                    }
                    for (let i = 0; i < 7; i++) {
                        smoke(e, rnd(-28, 28) * s, rnd(-12, 26) * s, rnd(-20, 20),
                            rnd(-18, -2), rnd(8, 16) * s, 0x9fd8ef,
                            { total: rnd(0.5, 0.85), alpha: 0.16 });
                    }
                },

                // Яд/споры: пузыри, капли и зелёная дымка.
                poison(e) {
                    ring(e, 7, 48, 3, 0x9fd46a, { total: 0.5, alpha: 0.8 });
                    for (let i = 0; i < 10; i++) {
                        part(e, { type: "bubble", x: rnd(-26, 26), y: rnd(10, 30),
                            r: rnd(2.5, 6.5), color: pick([0x9fd46a, 0xd8f0a0]),
                            vx: rnd(-10, 10), vy: rnd(-70, -30), total: rnd(0.55, 1),
                            sway: rnd(0.4, 1.2), phase: rnd(0, TAU), alpha: rnd(0.6, 0.95) });
                    }
                    for (let i = 0; i < 7; i++) {
                        smoke(e, rnd(-24, 24), rnd(-8, 20), rnd(-25, 25),
                            rnd(-28, -4), rnd(8, 16), 0x4e6a32,
                            { total: rnd(0.55, 0.9), alpha: 0.22 });
                    }
                    for (let i = 0; i < 5; i++) {
                        dot(e, rnd(-20, 20), rnd(-12, 8), rnd(1.5, 3.2), 0xd8f0a0,
                            { vx: rnd(-20, 20), vy: rnd(50, 110), total: rnd(0.35, 0.65),
                                ay: 140, alpha: 0.7 });
                    }
                },

                // Сработавшая ловушка: рунный всплеск и «искры-шипы».
                trap(e) {
                    dot(e, 0, 0, 15, 0xe08cd0, { total: 0.16, alpha: 0.9 });
                    ring(e, 5, 52, 3.6, 0xe08cd0, { total: 0.4 });
                    ring(e, 2, 30, 1.8, 0xffd0f0, { total: 0.25 });
                    for (let i = 0; i < 4; i++) {
                        const a = (i / 4) * TAU + 0.4;
                        part(e, { type: "rune", x: Math.cos(a) * 28, y: Math.sin(a) * 28,
                            size: rnd(4, 7), rot: a, spin: 2.2, color: 0xffd0f0,
                            total: 0.42, delay: 0.03 * i, alpha: 0.9 });
                    }
                    for (let i = 0; i < 14; i++) {
                        const a = rnd(0, TAU), sp = rnd(90, 300);
                        spark(e, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp,
                            i % 3 ? 0xe08cd0 : 0xffd0f0,
                            { len: rnd(5, 16), w: rnd(1.5, 3), total: rnd(0.25, 0.55),
                                ay: 220, alpha: 0.85 });
                    }
                    for (let i = 0; i < 5; i++) {
                        smoke(e, rnd(-18, 18), rnd(-6, 16), rnd(-28, 28),
                            rnd(-24, -4), rnd(6, 13), 0x5a3a5a,
                            { total: rnd(0.45, 0.75), alpha: 0.22 });
                    }
                },

                // Удар по базе: широкая волна, угли и лёгкая засветка экрана.
                base(e) {
                    ring(e, 8, 160, 7, e.color, { total: 0.55, alpha: 0.9 });
                    ring(e, 4, 92, 3, 0xfff1d0, { total: 0.4 });
                    part(e, { type: "ellipse", r: 110, h: 30, w: 3, color: e.color,
                        total: 0.55, alpha: 0.5, glow: true });
                    for (let i = 0; i < 24; i++) {
                        const a = rnd(Math.PI, TAU), sp = rnd(80, 340);
                        spark(e, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp,
                            i % 3 ? e.color : 0xfff1d0,
                            { len: rnd(8, 24), w: rnd(1.8, 4), total: rnd(0.35, 0.75),
                                ay: rnd(180, 420), alpha: rnd(0.6, 1) });
                    }
                    for (let i = 0; i < 12; i++) {
                        dot(e, rnd(-95, 95), rnd(-20, 24), rnd(2, 5),
                            pick([e.color, GOLD, 0xffe9b0]),
                            { vx: rnd(-30, 30), vy: rnd(-160, -60), total: rnd(0.5, 1),
                                ay: 90, sway: rnd(0.3, 0.9), phase: rnd(0, TAU),
                                alpha: rnd(0.65, 1) });
                    }
                    part(e, { type: "screen", color: e.color, total: 0.28, alpha: 0.07 });
                },

                // Усиление: золотые вихри и поднимающиеся стрелки.
                buff(e) {
                    ring(e, 8, 52, 3.2, GOLD, { total: 0.55 });
                    part(e, { type: "beam", y0: 18, y1: -78, w: 24,
                        color: GOLD, total: 0.42, alpha: 0.22 });
                    for (let i = 0; i < 12; i++) {
                        part(e, { type: "chevron", x: rnd(-28, 28), y: rnd(6, 30),
                            size: rnd(5, 10), w: 2.2, color: i % 2 ? GOLD : 0xffe9b0,
                            vy: rnd(-80, -38), total: rnd(0.5, 0.9),
                            sway: rnd(0.2, 0.8), phase: rnd(0, TAU),
                            delay: rnd(0, 0.12), alpha: 0.9 });
                    }
                    for (let i = 0; i < 7; i++) {
                        dot(e, rnd(-24, 24), rnd(-8, 18), rnd(1.5, 3.2), 0xfff1d0,
                            { vy: rnd(-100, -45), total: rnd(0.5, 0.85),
                                sway: rnd(0.4, 1), phase: rnd(0, TAU), alpha: 0.8 });
                    }
                },

                // Ослабление/проклятие: фиолетовый вихрь и падающие клинья.
                debuff(e) {
                    ring(e, 6, 46, 2.6, 0xc090e0, { total: 0.5, alpha: 0.85 });
                    for (let i = 0; i < 11; i++) {
                        part(e, { type: "chevron", x: rnd(-26, 26), y: rnd(-12, 22),
                            size: rnd(4, 8), w: 2, color: i % 2 ? 0xc090e0 : 0x8a5aa8,
                            rot: Math.PI, vy: rnd(25, 65), total: rnd(0.45, 0.8),
                            sway: rnd(0.3, 0.9), phase: rnd(0, TAU), alpha: 0.8 });
                    }
                    for (let i = 0; i < 7; i++) {
                        smoke(e, rnd(-22, 22), rnd(-10, 10), rnd(-30, 30),
                            rnd(-12, 18), rnd(7, 15), 0x4a2e5a,
                            { total: rnd(0.5, 0.9), alpha: 0.22 });
                    }
                },

                // Защита: пульсирующий щит-шестиугольник и голубые искры.
                ward(e) {
                    part(e, { type: "hex", x: 0, y: -12, r: 40, w: 3,
                        color: 0xa8e8ff, total: 0.55, spin: 0.9, glow: true });
                    part(e, { type: "hex", x: 0, y: -12, r: 28, w: 1.5,
                        color: 0xe8fbff, total: 0.45, spin: -1.4 });
                    ring(e, 4, 35, 2, 0xa8e8ff, { total: 0.42 });
                    for (let i = 0; i < 9; i++) {
                        const a = rnd(0, TAU), rr = rnd(22, 48);
                        dot(e, Math.cos(a) * rr, Math.sin(a) * rr - 12,
                            rnd(1.5, 3.5), i % 2 ? 0xa8e8ff : 0xfff4dc,
                            { vx: Math.cos(a) * 25, vy: Math.sin(a) * 25 - 20,
                                total: rnd(0.4, 0.8), alpha: 0.85 });
                    }
                },

                // Печать/установка ловушки — тихий рунный круг.
                seal(e) {
                    part(e, { type: "hex", x: 0, y: 0, r: 34, w: 2,
                        color: e.color, total: 0.55, spin: 0.8, alpha: 0.8 });
                    ring(e, 6, 36, 1.5, e.color, { total: 0.45, alpha: 0.65 });
                    for (let i = 0; i < 5; i++) {
                        const a = (i / 5) * TAU;
                        part(e, { type: "rune", x: Math.cos(a) * 24, y: Math.sin(a) * 24,
                            size: 4, rot: a, spin: 1.2, color: e.color,
                            total: 0.45, delay: i * 0.035, alpha: 0.8 });
                    }
                    dot(e, 0, 0, 9, e.color, { total: 0.25, alpha: 0.45 });
                },

                // Смена хода: мягкая волна от своей базы и восходящие искры.
                turn(e, o) {
                    const top = o.side === "e";
                    ring(e, 30, 720, 2, e.color, { total: 0.85, alpha: 0.12, glow: true });
                    part(e, { type: "screen", color: e.color, total: 0.42, alpha: 0.035 });
                    for (let i = 0; i < 16; i++) {
                        dot(e, rnd(160, 1760), top ? rnd(150, 300) : rnd(760, 930),
                            rnd(1.5, 4), i % 3 ? e.color : 0xfff1d0,
                            { vy: top ? rnd(35, 85) : rnd(-85, -35),
                                total: rnd(0.6, 1.1), sway: rnd(0.2, 0.7),
                                phase: rnd(0, TAU), alpha: rnd(0.35, 0.75) });
                    }
                },

                // Победа: золотой салют и конфетти.
                victory(e) {
                    part(e, { type: "screen", color: 0xffe9b0, total: 0.7, alpha: 0.08 });
                    ring(e, 20, 520, 4, GOLD, { total: 0.9, alpha: 0.5 });
                    for (let i = 0; i < 34; i++) {
                        const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15), sp = rnd(180, 520);
                        shard(e, rnd(-40, 40), rnd(-20, 20),
                            Math.cos(a) * sp, Math.sin(a) * sp,
                            rnd(3, 8), pick([GOLD, 0xfff1d0, 0x9fe37a, 0x83d8ff]),
                            { total: rnd(0.9, 1.6), ay: rnd(380, 620),
                                spin: rnd(-9, 9), alpha: 0.95 });
                    }
                    for (let i = 0; i < 14; i++) {
                        spark(e, rnd(-30, 30), rnd(-30, 30),
                            rnd(-230, 230), rnd(-350, -110),
                            i % 2 ? GOLD : 0xfff4dc,
                            { len: rnd(6, 16), w: rnd(1.5, 3),
                                total: rnd(0.7, 1.2), ay: 460, alpha: 0.9 });
                    }
                },

                // Поражение: багровая вспышка и тяжёлый пепел.
                defeat(e) {
                    // обычный (не аддитивный) слой: тёмная вспышка должна
                    // реально затемнять кадр, а не только добавлять красный
                    part(e, { type: "screen", color: 0x160606, total: 0.8,
                        alpha: 0.42, add: false });
                    ring(e, 10, 280, 5, 0x8a2f1e, { total: 0.8, alpha: 0.4, glow: false });
                    for (let i = 0; i < 20; i++) {
                        smoke(e, rnd(-80, 80), rnd(-30, 30), rnd(-45, 45),
                            rnd(-50, -5), rnd(12, 30),
                            pick([0x2a1a1a, 0x3a2020, 0x4a2a2a]),
                            { total: rnd(0.8, 1.4), alpha: rnd(0.16, 0.3) });
                    }
                    for (let i = 0; i < 12; i++) {
                        shard(e, rnd(-40, 40), rnd(-20, 20),
                            rnd(-100, 100), rnd(-90, 20),
                            rnd(3, 7), pick([0x8a2f1e, 0x5a1a1a, 0xd8c7a0]),
                            { total: rnd(0.7, 1.2), ay: 240, spin: rnd(-6, 6),
                                alpha: 0.7 });
                    }
                },
            };

            // ── Создание/жизненный цикл ──────────────────────────────────────
            A.fxEvent = function fxEvent(kind, opts = {}) {
                if (!A.fxEnabled || !root || !root.fx || !BUILD[kind]) return null;
                if (A.fxList.length >= MAX_FX) {
                    const old = A.fxList.shift();
                    if (old) destroyFx(old);
                }
                const e = {
                    kind, t: 0, dur: 0.6,
                    x: opts.x === undefined ? 960 : opts.x,
                    y: opts.y === undefined ? 540 : opts.y,
                    color: opts.color || A.fxColorOf(opts.elem),
                    parts: [],
                };
                BUILD[kind](e, opts);
                if (!e.parts.length) return null;
                const k = animK();
                let dur = 0.2;
                for (const p of e.parts) {
                    p.total /= k;
                    p.delay /= k;
                    // те же траектории, но медленнее/быстрее вместе с настройкой
                    p.vx *= k; p.vy *= k; p.ax *= k; p.ay *= k;
                    p.sway *= k; p.rise *= k; p.spin *= k;
                    if (p.orbitSpin !== undefined) p.orbitSpin *= k;
                    dur = Math.max(dur, p.delay + p.total);
                }
                const s = opts.scale || 1;
                if (s !== 1) for (const p of e.parts) {
                    // Масштабируем только те поля, которые реально есть у частицы:
                    // у точек нет r0/r1, у колец — size и т.п.
                    for (const key of ["x", "y", "r", "r0", "r1", "w", "size",
                        "len", "orbitR", "y0", "y1", "rise", "oy"]) {
                        if (p[key] !== undefined) p[key] *= s;
                    }
                }
                e.dur = dur;
                e.g = new PIXI.Graphics();
                e.ga = new PIXI.Graphics();
                e.g.eventMode = "none";
                e.ga.eventMode = "none";
                e.ga.blendMode = "add";
                // Все частицы рисуются в ЛОКАЛЬНЫХ координатах эффекта:
                // контейнер Graphics ставится в точку события (центр жетона,
                // базы, каста), поэтому не нужно прибавлять x/y к каждой частице.
                e.g.position.set(e.x, e.y);
                e.ga.position.set(e.x, e.y);
                root.fx.addChild(e.g);
                root.fx.addChild(e.ga);
                A.fxList.push(e);
                A.fxSeq++;
                drawFx(e);
                return e;
            };

            function destroyFx(e) {
                for (const g of [e.g, e.ga]) {
                    if (!g || g.destroyed) continue;
                    if (g.parent) g.parent.removeChild(g);
                    g.destroy();
                }
            }

            // Очистка: при входе в новую арену и при выходе из сцены. Узлы
            // старого root могли уже умереть вместе с ним — их просто забываем.
            A.fxClear = function fxClear() {
                for (const e of A.fxList) destroyFx(e);
                A.fxList.length = 0;
            };

            // ── Рисование ────────────────────────────────────────────────────
            function strokeArc(g, x, y, r, a0, a1, w, color, alpha) {
                if (alpha <= 0.005) return;
                const n = Math.max(5, Math.ceil(Math.abs(a1 - a0) / 0.24));
                g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
                for (let i = 1; i <= n; i++) {
                    const a = a0 + (a1 - a0) * (i / n);
                    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
                }
                g.stroke({ width: w, color, alpha });
            }

            function drawPart(g, p, e, k) {
                const fadeIn = p.fadeIn ? Math.min(1, p.age / 0.06) : 1;
                const a = Math.max(0, (1 - k) * p.alpha * fadeIn);
                if (a <= 0.006) return;
                if (p.type === "dot") {
                    g.circle(p.x, p.y, p.r * (1 + (p.grow || 0) * k));
                    g.fill({ color: p.color, alpha: a });
                } else if (p.type === "spark") {
                    const sp = Math.hypot(p.vx, p.vy) || 1;
                    const nx = p.vx / sp, ny = p.vy / sp;
                    g.moveTo(p.x, p.y);
                    g.lineTo(p.x - nx * p.len, p.y - ny * p.len);
                    g.stroke({ width: p.w, color: p.color, alpha: a });
                    g.circle(p.x, p.y, Math.max(1, p.w * 0.7));
                    g.fill({ color: p.color, alpha: a });
                } else if (p.type === "ring") {
                    const rr = p.r0 + (p.r1 - p.r0) * easeOut(k);
                    g.circle(p.x, p.y, rr);
                    g.stroke({ width: p.w * (1 - k) + 0.7, color: p.color, alpha: a });
                    if (p.glow) {
                        g.circle(p.x, p.y, rr);
                        g.stroke({ width: p.w * 3, color: p.color, alpha: a * 0.13 });
                    }
                } else if (p.type === "ellipse") {
                    const rr = p.r * (0.35 + easeOut(k) * 0.65);
                    g.ellipse(p.x, p.y + (p.oy || 0), rr, rr * (p.h / p.r));
                    g.stroke({ width: p.w * (1 - k) + 0.6, color: p.color, alpha: a });
                } else if (p.type === "arc") {
                    strokeArc(g, 0, 0, p.r, p.a0 + p.rot, p.a1 + p.rot,
                        p.w * (1 - k) + 0.5, p.color, a);
                } else if (p.type === "shard") {
                    const sz = p.size * (1 - 0.35 * k);
                    const co = Math.cos(p.rot), si = Math.sin(p.rot);
                    const pts = [0, -sz, sz * 0.55, sz * 0.2, 0, sz,
                        -sz * 0.55, sz * 0.2];
                    const out = [];
                    for (let i = 0; i < pts.length; i += 2) {
                        out.push(p.x + pts[i] * co - pts[i + 1] * si,
                            p.y + pts[i] * si + pts[i + 1] * co);
                    }
                    g.poly(out);
                    g.fill({ color: p.color, alpha: a });
                } else if (p.type === "flake") {
                    for (let i = 0; i < 3; i++) {
                        const ang = p.rot + (i / 3) * Math.PI;
                        const co = Math.cos(ang), si = Math.sin(ang);
                        g.moveTo(p.x - co * p.size, p.y - si * p.size);
                        g.lineTo(p.x + co * p.size, p.y + si * p.size);
                    }
                    g.stroke({ width: 1.8, color: p.color, alpha: a });
                    g.circle(p.x, p.y, p.size * 0.22);
                    g.fill({ color: 0xffffff, alpha: a * 0.8 });
                } else if (p.type === "plus") {
                    g.moveTo(p.x - p.size, p.y); g.lineTo(p.x + p.size, p.y);
                    g.moveTo(p.x, p.y - p.size); g.lineTo(p.x, p.y + p.size);
                    g.stroke({ width: p.w, color: p.color, alpha: a });
                } else if (p.type === "chevron") {
                    const co = Math.cos(p.rot), si = Math.sin(p.rot);
                    const tipX = p.x + si * p.size, tipY = p.y - co * p.size;
                    const lx = p.x - co * p.size * 0.9 - si * p.size * 0.7;
                    const ly = p.y - si * p.size * 0.9 + co * p.size * 0.7;
                    const rx = p.x + co * p.size * 0.9 - si * p.size * 0.7;
                    const ry = p.y + si * p.size * 0.9 + co * p.size * 0.7;
                    g.moveTo(lx, ly); g.lineTo(tipX, tipY); g.lineTo(rx, ry);
                    g.stroke({ width: p.w, color: p.color, alpha: a });
                } else if (p.type === "bubble") {
                    g.circle(p.x, p.y, p.r);
                    g.stroke({ width: 1.6, color: p.color, alpha: a });
                    g.circle(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.25);
                    g.fill({ color: 0xffffff, alpha: a * 0.6 });
                } else if (p.type === "smoke") {
                    g.circle(p.x, p.y, p.r * (0.7 + 0.6 * k));
                    g.fill({ color: p.color, alpha: a });
                } else if (p.type === "rune" || p.type === "orbitRune") {
                    const x = p.type === "orbitRune"
                        ? Math.cos(p.a + (p.orbitSpin || 1.2) * p.age) * p.orbitR
                        : p.x;
                    const y = p.type === "orbitRune"
                        ? Math.sin(p.a + (p.orbitSpin || 1.2) * p.age) * p.orbitR
                        : p.y;
                    g.poly([x, y - p.size, x + p.size * 0.7, y,
                        x, y + p.size, x - p.size * 0.7, y]);
                    g.stroke({ width: 1.8, color: p.color, alpha: a });
                    g.circle(x, y, p.size * 0.18);
                    g.fill({ color: p.color, alpha: a });
                } else if (p.type === "hex") {
                    const pts = [];
                    for (let i = 0; i < 6; i++) {
                        const ang = p.rot + (i / 6) * TAU;
                        pts.push(p.x + Math.cos(ang) * p.r, p.y + Math.sin(ang) * p.r);
                    }
                    g.poly(pts);
                    g.stroke({ width: p.w, color: p.color, alpha: a });
                    if (p.glow) {
                        g.poly(pts);
                        g.stroke({ width: p.w * 4, color: p.color, alpha: a * 0.12 });
                    }
                } else if (p.type === "spiral") {
                    const rr = p.r0 + (p.r1 - p.r0) * k;
                    const ang = p.a + p.spin * p.age;
                    const x = Math.cos(ang) * rr;
                    const y = Math.sin(ang) * rr - p.rise * k;
                    g.circle(x, y, p.size * (1 - k * 0.5));
                    g.fill({ color: p.color, alpha: a });
                } else if (p.type === "beam") {
                    const y0 = p.y0, y1 = p.y1;
                    const w = p.w * (1 - k * 0.55);
                    g.rect(-w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0));
                    g.fill({ color: p.color, alpha: a });
                } else if (p.type === "wisp") {
                    const ang = Math.sin(p.age * 5 + p.phase) * 6;
                    g.circle(p.x + ang, p.y, p.r * (1 - k * 0.5));
                    g.fill({ color: p.color, alpha: a * 0.8 });
                    g.circle(p.x + ang, p.y, p.r * 1.7);
                    g.fill({ color: p.color, alpha: a * 0.12 });
                } else if (p.type === "screen") {
                    // контейнер эффекта сдвинут в точку события — возвращаем
                    // прямоугольник на весь экран в локальных координатах
                    g.rect(-e.x, -e.y, 1920, 1080);
                    g.fill({ color: p.color, alpha: a });
                }
            }

            function drawFx(e) {
                if (!e.g || e.g.destroyed || !e.ga || e.ga.destroyed) return;
                e.g.clear();
                e.ga.clear();
                for (const p of e.parts) {
                    if (p.delay > 0 || p.age <= 0 || p.age >= p.total) continue;
                    drawPart(p.add ? e.ga : e.g, p, e, Math.min(1, p.age / p.total));
                }
            }

            A.fxTick = function fxTick(dt) {
                if (!A.fxList.length) return;
                for (let i = A.fxList.length - 1; i >= 0; i--) {
                    const e = A.fxList[i];
                    if (!e.g || e.g.destroyed || !root || !root.fx) {
                        A.fxList.splice(i, 1);
                        continue;
                    }
                    e.t += dt;
                    for (const p of e.parts) {
                        if (p.delay > 0) { p.delay -= dt; continue; }
                        p.age += dt;
                        if (p.age >= p.total) continue;
                        p.x += p.vx * dt;
                        p.y += p.vy * dt;
                        p.vx += p.ax * dt;
                        p.vy += p.ay * dt;
                        p.rot += p.spin * dt;
                        if (p.sway) p.x += Math.sin((p.age + p.phase) * 4.2) * p.sway * dt * 18;
                    }
                    drawFx(e);
                    if (e.t >= e.dur + 0.05) {
                        destroyFx(e);
                        A.fxList.splice(i, 1);
                    }
                }
            };

            // Удобный хелпер для кастов: позиция цели/базы/центра и цвет стихии.
            // origin — центр РАЗЫГРАННОЙ карты (просил юзер): заклинание
            // без позиции цели рождается на карте в руке игрока или на
            // показанной карте врага, а не в центре экрана
            A.fxSpellCast = function fxSpellCast(cardId, target, side, origin) {
                const def = typeof cardId === "string" ? CARDS[cardId] : cardId;
                if (!def) return null;
                let x = 960, y = 540;
                if (target && target.col !== undefined) {
                    const p = cellXY(target.col, target.row);
                    x = p.x; y = p.y - 8;
                } else if (target && target.base) {
                    x = 960; y = 70;
                } else if (origin) {
                    x = origin.x; y = origin.y;
                }
                return A.fxEvent("cast", {
                    x, y, color: A.fxColorOf(def.elem), scale: 0.9,
                    side,
                });
            };
        }
    };
})();
