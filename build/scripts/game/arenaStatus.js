// СЦЕНА «АРЕНА»: СТАТУСЫ — метки-состояния существ (заморозка, яд,
// споры, защита, спутанность, энтангл, варад, берсерк) и «Ледяной удар»:
// наложение, тик и снятие.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installStatus = function installStatus(A) {
        with (A) {

            // «Заморожен N» (wis91/wis92): существо пропускает перемещение
            // И атаку в свой следующий ход, затем счётчик тает на 1; на нуле
            // эффект снимается. Счётчик складывается, метка — над головой.
            // side — сторона, НАКЛАДЫВАЮЩАЯ эффект (нужна способности героя
            // «Ледяная суета», firstFrozenExtra): при первом накладывании
            // в бою она добавляет abilityVal (2) к счётчику. Без side
            // (тест-хуки, старые вызовы) способность не срабатывает.
            A.addFrozen = function addFrozen(u, n = 1, side = null) {
                if (!u || !B.units.includes(u) || u.def.type !== "unit") return;
                let stacks = Math.max(1, n | 0);
                if (side && !B.heroFlags.frozenExtra[side]) {
                    const hd = heroDefOf(side);
                    if (hd && hd.ability === "firstFrozenExtra") {
                        B.heroFlags.frozenExtra[side] = true;
                        const extra = hd.abilityVal || 2;
                        stacks += extra;
                        floatText(960, side === "p" ? 640 : 300,
                            `❄ +${extra}`, 0x8cd0ef);
                        sfx("aqua");
                    }
                }
                u.frozen = (u.frozen || 0) + stacks;
                let mark = u.node.getChildByName("frozenMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "frozenMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x1e4a6f });
                    g.stroke({ width: 3, color: 0x8cd0ef });
                    mark.addChild(g);
                    const tx = T("", 17, 0xe6f7ff);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(0, -88); // над остальными метками
                    u.node.addChild(mark);
                }
                updateFrozenMark(u);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 88, `❄ ${u.frozen}`, 0x8cd0ef);
                fxEvent("ice", { x: p.x, y: p.y - 10, scale: 1.05 });
                punch(u.node);
                sfx("aqua");
            };
            A.updateFrozenMark = function updateFrozenMark(u) {
                const mark = u.node && u.node.getChildByName("frozenMark");
                if (!mark) return;
                const tx = mark.getChildAt(1);
                if (tx) tx.text = u.frozen > 1 ? String(u.frozen) : "❄";
            };
            A.removeFrozenMark = function removeFrozenMark(u) {
                const mark = u.node && u.node.getChildByName("frozenMark");
                if (mark) mark.destroy({ children: true });
            };

            // «Ледяной удар» (wis92): соседи выбранного существа-цели —
            // только существа (постройки не «существа»), верт/гориз.

            // «Ледяной удар» (wis92): соседи выбранного существа-цели —
            // только существа (постройки не «существа»), верт/гориз.
            A.iceStrikeVictims = function iceStrikeVictims(u) {
                if (!u || !B || !B.units.includes(u) || u.def.type !== "unit") return [];
                return B.units.filter((v) => v !== u && v.def.type === "unit"
                    && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1);
            };
            A.iceStrikeVictim = function iceStrikeVictim(u) {
                const near = iceStrikeVictims(u);
                return near.length ? near[(Math.random() * near.length) | 0] : null;
            };
            // Принудительная атака заклинанием: урон атаки и все хуки атаки
            // (сокрушение, чаща, яд, «Снежный элементаль», руна). Урон атаки
            // НЕ считается уроном заклинания — «Защита от заклинаний» его не
            // гасит (в отличие от самого выбора цели заклинанием).
            // Принудительная атака заклинанием: урон атаки и все хуки атаки
            // (сокрушение, чаща, яд, «Снежный элементаль», руна). Урон атаки
            // НЕ считается уроном заклинания — «Защита от заклинаний» его не
            // гасит (в отличие от самого выбора цели заклинанием).
            A.iceStrikeAttack = function iceStrikeAttack(attacker, victim) {
                if (!attacker || !victim || !B.units.includes(attacker)
                    || !B.units.includes(victim)) return;
                const wasCasting = A.spellCasting;
                A.spellCasting = false;
                try {
                    const hpBefore = victim.hp;
                    damageUnit(victim, attacker.curAtk, attacker, "sword");
                    crushHit(attacker, attacker.curAtk, hpBefore); // «Сокрушение»
                    thicketSplash(attacker, victim); // «Древоброд глухой чащи»: всплеск вокруг себя
                    venomApply(attacker, victim); // «Ядовитость»
                    frostAttack(attacker, victim); // «Снежный элементаль»
                    frostNeighbors(attacker); // «Старший ледовик»
                    // «Проросший кабан» толкает только цель впереди по маршу
                    if (victim.col === attacker.col
                        && victim.row === attacker.row + (attacker.side === "p" ? -1 : 1)) {
                        afterAttackPush(attacker, victim);
                    }
                    triggerAttackTraps(attacker); // руна: существо атаковало
                } finally {
                    A.spellCasting = wasCasting;
                }
            };
            // Оценка цели «Ледяного удара» с точки зрения стороны side:
            // выбираем существо, чей случайный сосед вероятнее получит урон
            // и «Заморожен» от НАС (чужой сосед — плюс, свой — минус).
            // Оценка цели «Ледяного удара» с точки зрения стороны side:
            // выбираем существо, чей случайный сосед вероятнее получит урон
            // и «Заморожен» от НАС (чужой сосед — плюс, свой — минус).
            A.iceStrikePick = function iceStrikePick(side) {
                if (!B || !B.units) return null;
                let best = null, bestScore = -Infinity;
                for (const u of spellTargets(B.units)) {
                    if (u.def.type !== "unit") continue;
                    const near = iceStrikeVictims(u);
                    if (!near.length) continue;
                    let score = 0;
                    for (const v of near) {
                        const hit = Math.min(Math.max(0, u.curAtk), Math.max(0, v.hp));
                        const kill = hit >= v.hp;
                        const val = hit * 1.1 + (kill ? 2.5 : 0) + (kill ? 0 : 1.2);
                        score += v.side === side ? -val : val;
                    }
                    score /= near.length; // цель выбирает случайного соседа
                    if (score > bestScore) { bestScore = score; best = u; }
                }
                return best ? { unit: best, score: bestScore } : null;
            };

            // «Зимние духи» (wis89): когда срабатывает ЛЮБАЯ ловушка (клеточная,
            // отмена, руна, приманка, ряд), каждое живое существо с меткой
            // trapGrow получает +1 к урону навсегда. side — ХОЗЯИН ловушки:
            // по нему же «Путь воды» (firstTrapEnergy) даёт +1⚡ за первое
            // срабатывание. Зовётся в точках, где ловушка снимается/тратится,
            // — один раз на срабатывание, без повторов «Рощи лоз».

            // «Призрачные споры» (grw15): проклятие вешается на существо врага —
            // когда оно наносит урон (существу, постройке, базе), СВОЯ база
            // получает столько же. Живёт на самом существе: смерть/побег
            // снимают проклятие вместе с ним (в слоты ловушек не попадает).
            A.addSpores = function addSpores(u) {
                u.spores = true;
                const mark = new PIXI.Graphics();
                mark.circle(0, 0, 10.5);
                mark.fill({ color: 0x7a9a4e });
                mark.stroke({ width: 3, color: 0xd8e8a0 });
                mark.position.set(-36, -54); // очарование — справа, споры — слева
                mark.name = "sporeMark";
                mark.eventMode = "none";
                u.node.addChild(mark);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "☣", 0xb7d178);
                fxEvent("poison", { x: p.x, y: p.y - 10, scale: 0.75 });
                sfx("acid");
            };
            // Отклик спор на урон: база стороны проклятого существа получает
            // столько же, сколько оно нанесло (checkEnd зовут вызывающие)
            // Отклик спор на урон: база стороны проклятого существа получает
            // столько же, сколько оно нанесло (checkEnd зовут вызывающие)
            A.procSpores = function procSpores(u, amount) {
                if (!u || !u.spores || !B.units.includes(u) || !(amount > 0)) return;
                damageBase(u.side, amount,
                    u.side === "p"
                        ? { x: 960, y: 840, fill: 0xff5f4e }
                        : { x: 960, y: 60, fill: 0xff8f6e });
                sfx("acid");
            };

            // «Защитный кокон» (grw19): цель получает «Защита 1» — любой урон
            // по ней уменьшается на 1 (режется в damageUnit). Коконы складываются,
            // бейдж показывает сумму; «Извлечение духа» снимает защиту целиком.
            // «Облачный шпиль» (wis106) добавляет к сумме ауру «Защита 1» —
            // unitProtectTotal считает её динамически, а этот помощник
            // синхронизирует бейдж (появление/гибель шпиля, очистка).

            // «Защитный кокон» (grw19): цель получает «Защита 1» — любой урон
            // по ней уменьшается на 1 (режется в damageUnit). Коконы складываются,
            // бейдж показывает сумму; «Извлечение духа» снимает защиту целиком.
            // «Облачный шпиль» (wis106) добавляет к сумме ауру «Защита 1» —
            // unitProtectTotal считает её динамически, а этот помощник
            // синхронизирует бейдж (появление/гибель шпиля, очистка).
            A.refreshProtectMark = function refreshProtectMark(u) {
                if (!u || !u.node) return;
                const total = A.unitProtectTotal(u);
                let mark = u.node.getChildByName("protectMark");
                if (total <= 0) {
                    if (mark) mark.destroy({ children: true });
                    return;
                }
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "protectMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x2e5f8a });
                    g.stroke({ width: 3, color: 0xa0d8ef });
                    mark.addChild(g);
                    const tx = T("", 17, 0xd0effa);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(36, -54); // зеркально меткам берсерка/спор
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(total);
            };
            A.addProtect = function addProtect(u) {
                u.protect = (u.protect || 0) + 1;
                A.refreshProtectMark(u);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, GAME_LOC.t("card.grw19.name"), 0x8cd0ef);
                fxEvent("ward", { x: p.x, y: p.y - 14, scale: 0.7 });
                punch(u.node);
                sfx("up");
            };

            // «Ядовитость N» (grw29): метка на существе — его атаки вешают на
            // цель «Яд» N. «Яд M» копится на отравленном; в начале хода
            // владельца (до марша) существо теряет M жизней

            // «Ядовитость N» (grw29): метка на существе — его атаки вешают на
            // цель «Яд» N. «Яд M» копится на отравленном; в начале хода
            // владельца (до марша) существо теряет M жизней
            A.addVenom = function addVenom(u, n) {
                u.venom = (u.venom || 0) + n;
                let mark = u.node.getChildByName("venomMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "venomMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x2a5a2e });
                    g.stroke({ width: 3, color: 0x9fd489 });
                    mark.addChild(g);
                    const tx = T("", 17, 0xd8f0c0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(18, -66); // запутанность по центру, яд слева
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.venom);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 66, `☠ ${u.venom}`, 0x9fd489);
                fxEvent("poison", { x: p.x, y: p.y - 10, scale: 0.64 });
                punch(u.node);
                sfx("acid");
            };
            A.addPoison = function addPoison(u, m) {
                if (!B.units.includes(u)) return; // цель умерла от самой атаки
                u.poison = (u.poison || 0) + m;
                let mark = u.node.getChildByName("poisonMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "poisonMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x5a7a2e });
                    g.stroke({ width: 3, color: 0xd8f0a0 });
                    mark.addChild(g);
                    const tx = T("", 17, 0xf0fad0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(-18, -66);
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.poison);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "☠", 0xb7d178);
                fxEvent("poison", { x: p.x, y: p.y - 10, scale: 0.72 });
                sfx("acid");
            };
            // Начало хода стороны, ДО марша: каждое отравленное её существо
            // теряет жизни по мощности яда (штатный урон — яд может убить)
            // Начало хода стороны, ДО марша: каждое отравленное её существо
            // теряет жизни по мощности яда (штатный урон — яд может убить)
            A.poisonTick = function poisonTick(side) {
                for (const u of B.units.slice()) {
                    if (u.side !== side || u.def.type !== "unit" || !(u.poison > 0)) continue;
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 60, `☠ −${u.poison}`, 0xb7d178);
                    damageUnit(u, u.poison, null, "acid");
                }
                refreshHud();
                checkEnd();
            };
            // «Опутывание N» (grw35): корни держат существо на месте — оно
            // пропускает перемещение в начале своего хода, счётчик тает на 1;
            // на ноль — эффект снят. Атака по стоящему впереди врагу остаётся
            // «Опутывание N» (grw35): корни держат существо на месте — оно
            // пропускает перемещение в начале своего хода, счётчик тает на 1;
            // на ноль — эффект снят. Атака по стоящему впереди врагу остаётся
            A.addEntangle = function addEntangle(u, n) {
                if (!B.units.includes(u)) return; // цель умерла от той же ловушки
                u.entangle = (u.entangle || 0) + n;
                let mark = u.node.getChildByName("entangleMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "entangleMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x6b4a2e });
                    g.stroke({ width: 3, color: 0xc9a06a });
                    mark.addChild(g);
                    const tx = T("", 17, 0xf0dcb0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(-36, -66); // опутывание — левее яда
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = String(u.entangle);
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 60, "≡", 0xc9a06a);
                fxEvent("seal", { x: p.x, y: p.y + 8, color: 0xc9a06a, scale: 0.8 });
                sfx("acid");
            };
            A.removeEntangleMark = function removeEntangleMark(u) {
                const mark = u.node && u.node.getChildByName("entangleMark");
                if (mark) mark.destroy({ children: true });
            };
            // «Защита от заклинаний» (способность Миры, u.spellWard): метка
            // синим знаком на жетоне — зеркально меткам очарования/берсерка
            // «Защита от заклинаний» (способность Миры, u.spellWard): метка
            // синим знаком на жетоне — зеркально меткам очарования/берсерка
            A.addWardMark = function addWardMark(u) {
                if (u.node.getChildByName("wardMark")) return;
                const mark = new PIXI.Container();
                mark.name = "wardMark";
                mark.eventMode = "none";
                const g = new PIXI.Graphics();
                g.circle(0, 0, 13.5);
                g.fill({ color: 0x1e3a5f });
                g.stroke({ width: 3, color: 0x8cd0ef });
                mark.addChild(g);
                const tx = T("✦", 18, 0x8cd0ef);
                tx.anchor.set(0.5);
                mark.addChild(tx);
                mark.position.set(36, -54);
                u.node.addChild(mark);
                const p = cellXY(u.col, u.row);
                fxEvent("ward", { x: p.x, y: p.y - 14, scale: 0.72 });
            };
            A.removeWardMark = function removeWardMark(u) {
                const mark = u.node && u.node.getChildByName("wardMark");
                if (mark) mark.destroy({ children: true });
            };

            // «Берсерк N» («Двойная атака»): бейдж «×(N+1)» на жетоне зеркально
            // метке «Огненного дыхания»; в марш своего хода существо атакует
            // N дополнительных раз и платит за каждую 1 жизнью (см. marchSide)
            A.addBerserk = function addBerserk(u, n) {
                u.berserk = (u.berserk || 0) + n;
                let mark = u.node.getChildByName("berserkMark");
                if (!mark) {
                    mark = new PIXI.Container();
                    mark.name = "berserkMark";
                    mark.eventMode = "none";
                    const g = new PIXI.Graphics();
                    g.circle(0, 0, 13.5);
                    g.fill({ color: 0x8a2f1e });
                    g.stroke({ width: 3, color: 0xffd98c });
                    mark.addChild(g);
                    const tx = T("", 17, 0xffe9b0);
                    tx.anchor.set(0.5);
                    mark.addChild(tx);
                    mark.position.set(-36, -54);
                    u.node.addChild(mark);
                }
                mark.getChildAt(1).text = `×${u.berserk + 1}`;
                const p = cellXY(u.col, u.row);
                floatText(p.x, p.y - 66, `⚔×${u.berserk + 1}`, 0xffb26e);
                fxEvent("buff", { x: p.x, y: p.y - 12, color: 0xff8a5e, scale: 0.72 });
            };
        }
    };
})();
