// СЦЕНА «АРЕНА»: заклинания игрока — эффекты, валидация цели, повторы
// («Горящие руны», «Мастера огня») и ИИ-подбор цели. Часть arenaActions.js:
// установщик на общий контекст A (см. arenaCore.js), внутри — with (A),
// поэтому тела видят общие имена как раньше. Вызывается РЯДОМ с
// installActions при сборке (arena.js): имена резолвятся динамически.
(function () {
    globalThis.GAME_ARENA.installSpells = function installSpells(A) {
        with (A) {

            // «Вихри магии» (hw261, W75 — спека юзера): «свои эффекты»
            // существа — способности (def.ability — технический слот
            // диспатчера призыва: Полёт, Скорость, Выстрел, Сдвиг, …;
            // именные флаги-способности: Возрождение, Рост после атаки,
            // Выстрел-параметр steamShot и пр.) плюс выданные ключевые
            // статусы (u.protect «Защита», u.venom «Ядовитость»).
            // Параметры-значения (shotDmg у «Выстрела», abilityVal у
            // «Скорости») отдельно НЕ считаются — это та же способность.
            // Реестр — известные движку флаги эффектов
            const HW_EFFECT_KEYS = ["ability", "dashN", "fireSnipe",
                "growOnAttack", "rootGrab", "wolfPack", "buffEcho",
                "trapOnMove", "undying", "siegeDouble", "portalLeap",
                "crush", "frostAttack", "frostNeighbors", "vampHeal",
                "illusion", "sisterDraw", "berserkSummon", "stormer",
                "energyToStats", "lakeMaid", "lichRaise", "plantEcho",
                "riteStump", "sandDecay", "spellBuffAura", "spellGrow",
                "sprout", "targetDiscount", "thicket", "trapGrow",
                "waterMage", "wolfSummon", "medicHeal", "protect",
                "healArrive", "axeArrive", "nearSpeed", "skelKing",
                "tradeDraw", "trebuchet", "fortress", "returnN", "delay",
                "steamShot", "siegeShot", "siegeFollow", "exhuming",
                "discardAtk", "roadPush", "sulfurBurst", "relicVault",
                "lab", "treeHomes", "trapCancel", "elementalCircle",
                "animalCost", "monolith", "altarSword", "campfire",
                "campAura", "groveAura", "starTower", "cloudSpire",
                "pillarEnergy", "aura",
                "castZap"]; // «Элементаль молнии» (W77) — эффект для «Вихрей магии»
            A.hwEffectCount = function hwEffectCount(u) {
                if (!u || !u.def) return 0;
                let n = 0;
                for (const k of HW_EFFECT_KEYS) if (u.def[k]) n++;
                if (u.protect) n++; // выданная «Защита» — тоже эффект
                if (u.venom) n++; // выданная «Ядовитость» — тоже эффект
                return n;
            };

            // «Силовой купол» (tim234, просил юзер): установка метки купола
            // на существо/постройку — любой урон по ней режется до 1
            // (гейт в damageUnit). Общая для игрока (applySpellPInner) и
            // ИИ (enemyCastSpellEffect); держится до гибели цели
            A.domeTarget = function domeTarget(u) {
                u.dome = true;
                const p = cellXY(u.col, u.row);
                const mark = new PIXI.Graphics();
                mark.circle(0, 0, 10.5);
                mark.fill({ color: 0x2a4a6c });
                mark.stroke({ width: 3, color: 0x8cd0ef });
                mark.position.set(-36, -54);
                mark.name = "domeMark";
                mark.eventMode = "none";
                u.node.addChild(mark);
                floatText(p.x, p.y - 60,
                    "◈ " + GAME_LOC.t("spell.dome.name"), 0x8cd0ef);
                fxEvent("ward", { x: p.x, y: p.y - 12, scale: 0.85 });
                punch(u.node);
                sfx("chpoc");
            };

            // «Ремонт» (tim239, просил юзер): метка «при смерти — в руку
            // владельца» на существо/постройку. Общая для игрока
            // (applySpellPInner) и ИИ (enemyCastSpellEffect); перехват —
            // в killUnit (arenaDamage) ДО каскадов смерти
            A.repairTarget = function repairTarget(u) {
                u.repair = true;
                const p = cellXY(u.col, u.row);
                const mark = new PIXI.Graphics();
                mark.circle(0, 0, 10.5);
                mark.fill({ color: 0x2a5a34 });
                mark.stroke({ width: 3, color: 0x9fd489 });
                mark.position.set(-36, -54);
                mark.name = "repairMark";
                mark.eventMode = "none";
                u.node.addChild(mark);
                floatText(p.x, p.y - 60,
                    "🔧 " + GAME_LOC.t("spell.repair.name"), 0x9fd489);
                fxEvent("heal", { x: p.x, y: p.y - 12, scale: 0.85 });
                punch(u.node);
                sfx("chpoc");
            };

            // «Перемена мест» (gh254, W65): выбор целей ПООЧЕРЁДНО. Первая
            // ждёт в B.swapPick с жёлтым маркером (swapMark) на объекте;
            // вторая цель передаётся в эффект через target.first. Снимается
            // deselect'ом, сменой карты в руке и после каста
            A.swapMarkDraw = function swapMarkDraw(u) {
                const mark = new PIXI.Graphics();
                mark.circle(0, 0, 10.5);
                mark.fill({ color: 0x5a4a20 });
                mark.stroke({ width: 3, color: 0xffd98c });
                mark.position.set(-36, -54);
                mark.name = "swapMark";
                mark.eventMode = "none";
                u.node.addChild(mark);
            };
            A.swapPickClear = function swapPickClear() {
                B.swapPick = null;
                for (const v of B.units) {
                    if (!v.node || v.node.destroyed) continue;
                    const m = v.node.getChildByName("swapMark");
                    if (m) {
                        m.parent.removeChild(m);
                        m.destroy({ children: true });
                    }
                }
            };
            // «Перемена мест» (gh254, W65, спека юзера): обменять местами
            // два объекта (существо/постройку). Обмен — ПЕРЕМЕЩЕНИЕ: оба
            // получают направление входа (lastMoveDir — для «Пути
            // одуванчиков») и триггерят ловушки новых клеток (afterMoved);
            // «Краевой камень»/«Лабиринт» могут докинуть обменявшегося.
            // Общая для игрока (applySpellPInner) и ИИ (aiSpells)
            A.swapObjectsAct = function swapObjectsAct(a, b) {
                const pa = cellXY(a.col, a.row), pb = cellXY(b.col, b.row);
                const ca = a.col, ra = a.row;
                a.lastMoveDir = [b.col - ca, b.row - ra];
                b.lastMoveDir = [ca - b.col, ra - b.row];
                a.col = b.col;
                a.row = b.row;
                b.col = ca;
                b.row = ra;
                a.node.zIndex = a.row;
                b.node.zIndex = b.row;
                glide(a, pb.x, pb.y); // a летит на место b и наоборот
                glide(b, pa.x, pa.y);
                floatText(pa.x, pa.y - 72, "⇄", 0xb7d0ef);
                floatText(pb.x, pb.y - 72, "⇄", 0xb7d0ef);
                fxEvent("cast", { x: pa.x, y: pa.y - 12, color: 0x8fae7d });
                sfx("chpoc");
                for (const u of [a, b])
                    if (B.units.includes(u)) afterMoved(u);
            };

            // «Циклон» (gh256, W65, спека юзера): каждое СУЩЕСТВО поля
            // сдвигается в случайную пустую соседнюю (верт/гориз) клетку —
            // по образцу «Снежного кома» (snowballShift); сдвигов нет —
            // существо возвращается в руку владельца (bounceUnit, как
            // «Смыв»). Порядок обработки — снапшот поля (перемешанный):
            // каждый следующий видит клетки, занятые предыдущими. Сдвиг —
            // перемещение: ловушки новых клеток и лечение героя
            // «Долгая прогулка» через afterMoved; возврат в руку — нет
            A.cycloneAct = function cycloneAct() {
                const moved = [];
                for (const u of shuffle(B.units.slice())) {
                    if (!B.units.includes(u) || u.def.type !== "unit") continue;
                    const spots = [];
                    for (const [dc, dr] of shuffle(
                        [[-1, 0], [1, 0], [0, -1], [0, 1]])) {
                        const c2 = u.col + dc, r2 = u.row + dr;
                        if (c2 < 0 || c2 >= GRID || r2 < 0 || r2 >= GRID) continue;
                        if (unitAt(c2, r2)) continue;
                        spots.push([c2, r2, dc, dr]);
                    }
                    if (!spots.length) { // некуда — в руку владельца
                        const p = cellXY(u.col, u.row);
                        bounceUnit(u);
                        floatText(p.x, p.y - 96,
                            "↩ " + GAME_LOC.t("status.return.name"), 0xc9a0ef);
                        continue;
                    }
                    const [c2, r2, dc, dr] = spots[0]; // dirs перемешаны — [0] случаен
                    u.lastMoveDir = [dc, dr]; // W65: направление входа
                    u.col = c2;
                    u.row = r2;
                    u.node.zIndex = r2;
                    glide(u, cellXY(c2, r2));
                    moved.push(u);
                }
                for (const u of moved)
                    if (B.units.includes(u)) afterMoved(u);
                refreshHud();
                checkEnd();
            };

            // «Небо в стрелах» (gh258, W72, спека юзера): все СВОИ существа
            // применяют свой «Выстрел», как будто они переместились; у
            // не-стрелков — виртуальный «Выстрел 1», как будто он у него
            // есть. Стрелки (archer/steamShot/колчанные) стреляют СВОИМ
            // выстрелом полным путём (performShot: релей героя-Чести,
            // откат Баллисты), не-стрелкам залп даёт forced=1 без релея.
            // Порядок залпа — от передних рядов к задним (снапшот поля):
            // передний убивает блокирующего, стрела заднего летит дальше.
            // Гибель стрелка от контр-эффектов не снимает залп с остальных
            A.volleyAct = function volleyAct(side) {
                const own = B.units.filter((u) => u.side === side
                    && u.def.type === "unit");
                own.sort((a, b) => side === "p" ? a.row - b.row : b.row - a.row);
                for (const u of own) {
                    if (!B.units.includes(u)) continue;
                    const hasShot = u.def.ability === "archer"
                        || u.def.steamShot || (u.quiverBonus || 0) > 0;
                    performShot(u, hasShot ? undefined : 1);
                }
                refreshHud();
                checkEnd();
            };

            // Эффекты заклинаний игрока, валидация цели внутри (false — цель не
            // годится, тогда и оплаты/сброса/панелей не будет). Отделено от
            // оплаты карты, чтобы «Горящие руны» могли повторить эффект
            // бесплатно. free — повтор (дренаж энергии идёт без вычета цены).
            // Флаг spellCasting на всё разрешение: damageUnit в это время не
            // наносит урон существам с «Защитой от заклинаний» (u.spellWard).
            A.applySpellP = function applySpellP(cardId, target, free = false, opts = null) {
                A.spellCasting = true;
                // чей каст (вложенные повторы сохраняют внешний) — «Зомби-
                // разбойник» (decRaider): урон заклинанием вражескому существу
                // считается «нанесённым уроном» (W40)
                const prevCast = A.castSide;
                A.castSide = "p";
                try {
                    return applySpellPInner(cardId, target, free, opts);
                } finally { A.spellCasting = false; A.castSide = prevCast; }
            };
            A.applySpellPInner = function applySpellPInner(cardId, target, free = false, opts = null) {
                const def = CARDS[cardId];
                const tg = def.spell.target;
                // «Защита от заклинаний» — ОДНА проверка на входе: заклинание,
                // адресующее клетку с существом, не может выбрать ward-цель.
                // Массовые и клеточные (none/anyCell/emptyCell) существо не
                // адресуют — им эта проверка не нужна.
                if (tg !== "none" && tg !== "anyCell" && tg !== "emptyCell"
                    && target && target.col !== undefined) {
                    const aimed = unitAt(target.col, target.row);
                    if (aimed && !spellAimable(aimed)) return false;
                    // «Отражение» (wis120) врага: заклинание игрока, целью
                    // выбрано СУЩЕСТВО врага, летит в случайное существо
                    // игрока (спека юзера). Цель подменяется ДО эффекта.
                    const rt = reflectAim("e", aimed);
                    if (rt !== aimed) target = { col: rt.col, row: rt.row };
                }
                if (def.spell.stormAll) { // «Гроза»: вся оставшаяся энергия — удары по 2
                    stormStrike("p", cardId, free);
                    return true;
                }
                // «Поднятие мёртвых» (dec124): в своём сбросе нет существ —
                // заклинание не разыгрывается (карта и энергия целы)
                if (def.spell.raiseDead && !unitsInDiscard("p").length) return false;
                // «Пытка разума» (dec125): обе руки пусты — сбрасывать нечего
                if (def.spell.mindTorture && !B.hand.length && !B.eHand.length) return false;
                // «Плен» (hon197): в руке противника нет карты призыва —
                // выбирать нечего, заклинание не разыгрывается (как выше)
                if (def.spell.captivate && !B.eHand.some((id) =>
                    CARDS[id] && CARDS[id].type === "unit")) return false;
                // «Воскрешение» (hon200): в своём сбросе нет карты призыва —
                // воскрешать нечего (как у «Поднятия мёртвых»)
                if (def.spell.resurrect && !unitsInDiscard("p").length) return false;
                // «Управление временем» (tim223): жетон выбран кликом,
                // направление — панелька (target {col, row, dir})
                if (def.spell.tokenShift) {
                    if (!target || target.col === undefined) return false;
                    return applyTokenShift("p", target);
                }
                // «Эксперименты» (wt271, W79): метка выбрана кликом,
                // тип и мин/макс — панелька (target {col, row, tagKey, mm});
                // значение — среди меток ИГРАЮЩЕГО (side "p")
                if (tg === "tagPick") {
                    if (!target || target.col === undefined
                        || !target.tagKey) return false;
                    return applyTagPick("p", target);
                }
                if (tg === "anyObj" && (def.spell.dome || def.spell.repair)) {
                    // «Силовой купол» / «Ремонт»: цель — любое существо
                    // или постройка (тип цели отсеян входом, клик/хук)
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u) return false;
                    if (def.spell.dome) domeTarget(u); // повторный купол
                    // бессмыслен, но и безвреден — не запрещаем
                    else repairTarget(u); // «Ремонт»: повтор тоже безвреден
                    return true;
                }
                if (tg === "anyObj" && def.spell.swap) {
                    // «Перемена мест» (gh254, W65): две цели выбираются
                    // ПООЧЕРЁДНО — первая ждёт в B.swapPick (клик/хук),
                    // вторая приходит в target.first. Оба объекта живы
                    // (первый могли потерять между кликами — не бывает:
                    // фаза игрока, но послеMoved «Горящих рун» повторяет
                    // эффект сразу — тоже проверяем)
                    if (!target || target.col === undefined || !target.first)
                        return false;
                    const a = unitAt(target.first.col, target.first.row);
                    const b = unitAt(target.col, target.row);
                    if (!a || !b || a === b) return false;
                    swapObjectsAct(a, b);
                    return true;
                }
                if (def.spell.cyclone) { // «Циклон» (gh256, W65): без цели
                    cycloneAct();
                    return true;
                }
                // «Двойная магия» (hw265, W77): разыгрывает до 2 случайных
                // заклинаний/ловушек из руки бесплатно; некого — карта и
                // энергия целы (как у «Пытки разума»)
                if (def.spell.hwSpellPlay) {
                    const n = doubleCastAct("p");
                    if (!n) return false;
                    return true;
                }
                // «Общие загадки» (wt273, W80): применяет эффект другого
                // случайного заклинания руки (riddlesAct в arenaCombat;
                // карта-эффект остаётся в руке); нечего — карта и
                // энергия целы (как у «Двойной магии»)
                if (def.spell.riddles) {
                    if (!riddlesAct("p", cardId)) return false;
                    return true;
                }
                // «Высокая мощность» (wt274, W80): тратит ВСЮ оставшуюся
                // энергию (своя цена учтётся флагом highPower ниже, в
                // castSpell) и разыгрывает случайное заклинание из КОЛОДЫ
                // с ценой, равной потраченной (powerAct в arenaCombat);
                // подходящего нет — карта и энергия целы
                if (def.spell.highPower) {
                    if (!powerAct("p", cardId)) return false;
                    return true;
                }
                // «Проекция прошлого» (wt277, W81): выбор направления —
                // панелькой (как у «Управления временем»); само применение
                // ±1 ко всем жетонам случится по кнопке. Жетонов нет —
                // применение вхолостую (энергия и карта потрачены)
                if (def.spell.projection) {
                    projPanelOpen();
                    return true;
                }
                if (def.spell.volley) { // «Небо в стрелах» (gh258, W72): без цели
                    volleyAct("p");
                    return true;
                }
                if (tg === "anyUnit") { // усиление/Смыв/Слабость
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    // тип карты проверяем здесь; защиту уже отсеял вход
                    // (W73: под «Лесным оплотом» и постройка — effCreature)
                    if (!u || !effCreature(u)) return false;
                    const p = cellXY(u.col, u.row);
                    if (def.spell.quiver) { // «Полные колчаны» (gh259, W72):
                        // «Выстрел 1» цели; у стрелка выстрел растёт на 1
                        // (u.quiverBonus читают performShot/archerShot).
                        // Складывается: второй колчан — ещё +1
                        u.quiverBonus = (u.quiverBonus || 0) + 1;
                        floatText(p.x, p.y - 66, `🏹 ${u.quiverBonus}`, 0xffd98c);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.9 });
                        punch(u.node);
                        sfx("chpoc");
                        return true;
                    }
                    if (def.spell.axeAmp) { // «Лабрис основателя» (wt279, W81):
                        // цель атакует — бьёт 3 урона случайного врага
                        // (axeStrike зовётся во всех точках атаки). Повторное
                        // заклинание ничего не меняет (метка уже стоит)
                        u.axeGrant = true;
                        floatText(p.x, p.y - 66, "🪓", 0xc9a0ef);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.9 });
                        punch(u.node);
                        sfx("chpoc");
                        return true;
                    }
                    if (def.spell.airShield) { // «Воздушный щит» (hw263, W75):
                        // цель не получает урона, кроме обычных атак —
                        // читает damageUnit (arenaDamage); держится до
                        // гибели цели, повторный щит ничего не меняет
                        u.airShield = true;
                        floatText(p.x, p.y - 66,
                            "✦ " + GAME_LOC.t("spell.airShield.name"), 0x9ecbe8);
                        fxEvent("ward", { x: p.x, y: p.y - 14, scale: 0.9 });
                        punch(u.node);
                        sfx("chpoc");
                        return true;
                    }
                    if (def.spell.vortexBuff) { // «Вихри магии» (hw261, W75):
                        // +1/+1 за каждый СВОЙ эффект цели (способности/
                        // особости карты — HW_EFFECT_KEYS). Ноль эффектов —
                        // заклинание ничего не даёт (текст по спеке юзера)
                        const n = hwEffectCount(u);
                        if (n > 0) {
                            u.bonusAtk = (u.bonusAtk || 0) + n;
                            u.hp += n;
                            recalcAuras();
                            const an = u.node.getChildByName("atk");
                            if (an) an.text = String(u.curAtk);
                            const hn = u.node.getChildByName("hp");
                            if (hn) hn.text = String(u.hp);
                            floatText(p.x, p.y - 39, `+${n}⚔ +${n}♥`, 0x9ecbe8);
                            fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.9 });
                            punch(u.node);
                            onBuff(u, n, n); // «Белая пуща» (W61): волк/Корона
                        } else floatText(p.x, p.y - 66, "±0", 0xc9b98c);
                        sfx("chpoc");
                        return true;
                    }
                    if (def.spell.crushEnergy) { // «Древомощь» (sg243): вся
                        // оставшаяся энергия → «Сокрушение» и +N⚔/+N♥ цели.
                        // Эффект идёт ДО списания цены карты (см. castSpell)
                        // — как «Гроза»: пул = энергия минус цена (повтор
                        // «Горящими рунами» бесплатен), нулит castSpell
                        const pool = B.energy - (free ? 0 : effCost(cardId, "p"));
                        u.crushGrant = true; // crushHit читает поверх def.crush
                        u.bonusAtk = (u.bonusAtk || 0) + pool;
                        u.hp += pool;
                        recalcAuras();
                        const an = u.node.getChildByName("atk");
                        if (an) an.text = String(u.curAtk);
                        const hn = u.node.getChildByName("hp");
                        if (hn) hn.text = String(u.hp);
                        floatText(p.x, p.y - 39, `+${pool}⚔ +${pool}♥`, 0x9fd489);
                        floatText(960, 840, `−${pool}⚡`, 0xffd98c);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.9 });
                        punch(u.node);
                        sfx("chpoc");
                        onBuff(u, pool, pool); // «Белая пуща» (W61)
                        return true;
                    }
                    if (def.spell.iceStrike) { // «Ледяной удар»: цель бьёт соседа
                        const victim = iceStrikeVictim(u);
                        if (!victim) return false; // соседей-существ нет — не кастуем
                        iceStrikeAttack(u, victim);
                        if (B.units.includes(victim)) addFrozen(victim, def.spell.freeze || 1, "p");
                        punch(u.node);
                        sfx("chpoc");
                        return true;
                    }
                    if (def.spell.hydroPunch) { // «Гидроудар»: 1 урон + сдвиг к своей базе
                        const dmg = spellDmg(def, "p", true, true);
                        damageUnit(u, dmg, null, "rocket");
                        if (B.units.includes(u)) pushTowardBase(u);
                        punch(u.node);
                        sfx("chpoc");
                        return true;
                    }
                    if (def.spell.bounce) { // «Смыв»: существо — в руку владельца
                        punch(u.node);
                        bounceUnit(u);
                        sfx("chpoc");
                        return true;
                    }
                    if (def.spell.debuffAtk) { // «Слабость»: −N к урону (не ниже нуля)
                        u.bonusAtk = (u.bonusAtk || 0) - def.spell.debuffAtk;
                        recalcAuras();
                        floatText(p.x, p.y - 39, `−${def.spell.debuffAtk}⚔`, 0xef9f8c);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.72 });
                        punch(u.node);
                        sfx("chpoc");
                        return true;
                    }
                    // «Разложение» (dec145): уничтожьте существо, затем
                    // сбросьте карту с руки (авто, наименее ценная; сама
                    // dec145 ещё в руке — себя не сбрасывает)
                    if (def.spell.destroy) {
                        punch(u.node);
                        killUnit(u, null);
                        discardWeakest("p", cardId);
                        refreshHud();
                        return true;
                    }
                    if (def.spell.enchantFire) { // «Огненное дыхание» — метка-очарование
                        u.enchantFire = true;
                        const mark = new PIXI.Graphics();
                        mark.circle(0, 0, 10.5);
                        mark.fill({ color: 0xff7a2e });
                        mark.stroke({ width: 3, color: 0xffd98c });
                        mark.position.set(36, -54);
                        mark.name = "enchMark";
                        mark.eventMode = "none";
                        u.node.addChild(mark);
                        floatText(p.x, p.y - 60, "✦", 0xffb26e);
                    } else {
                        if (def.spell.buffAtk) {
                            u.bonusAtk = (u.bonusAtk || 0) + def.spell.buffAtk;
                            recalcAuras();
                            floatText(p.x, p.y - 39, `+${def.spell.buffAtk}⚔`, 0x9fd489);
                        }
                        if (def.spell.buffHp) { // «Дар леса»: +N жизни любому существу
                            u.hp += def.spell.buffHp;
                            const hn = u.node.getChildByName("hp");
                            if (hn) hn.text = String(u.hp);
                            floatText(p.x, p.y - 75, `+${def.spell.buffHp}♥`, 0x9fd489);
                        }
                        // «Луч света» (hon179): «выбранный игрок» — владелец
                        // заклинания (второй цели в игре нет, как у
                        // «Негативного потока»), получает 1 жизнь
                        // (healBase — единая точка, внутри гейт
                        // «Претендента на трон»)
                        if (def.spell.healPlayer) healBase("p", def.spell.healPlayer);
                        if (def.spell.buffAtkByHp) { // «Природная мощь»: +урона = жизням
                            const bump = u.hp;
                            u.bonusAtk = (u.bonusAtk || 0) + bump;
                            recalcAuras();
                            floatText(p.x, p.y - 39, `+${bump}⚔`, 0x9fd489);
                            onBuff(u, bump, 0); // «Белая пуща» (W61)
                        }
                        // Обычные усиления (+N⚔/+N♥ — «Дар леса», «Молитва»,
                        // «Праведный гнев»): хук после обоих применений
                        if (def.spell.buffAtk || def.spell.buffHp)
                            onBuff(u, def.spell.buffAtk || 0, def.spell.buffHp || 0);
                        if (def.spell.berserk) addBerserk(u, def.spell.berserk);
                        if (def.spell.venom) addVenom(u, def.spell.venom); // «Отравленные лезвия»
                        if (def.spell.poison) addPoison(u, def.spell.poison); // «Трупный яд»
                        if (def.spell.nova) novaSplash(u); // «Круговая атака»
                        // «Метка некроманта» (dec137): «Выкапливание 1» —
                        // счётчик стакается с уже висящим (Мортис/вторая метка)
                        if (def.spell.exhumingMark) {
                            addExhuming(u, (u.exhuming || 0) + def.spell.exhumingMark);
                            floatText(p.x, p.y - 90,
                                "⛏ +" + def.spell.exhumingMark, 0xc9b98c);
                        }
                        if (def.spell.buffAtk || def.spell.buffHp
                            || def.spell.buffAtkByHp || def.spell.enchantFire
                            || def.spell.exhumingMark) {
                            fxEvent("buff", { x: p.x, y: p.y - 12,
                                color: def.spell.enchantFire ? 0xff8a5e : 0xffd98c,
                                scale: 0.82 });
                        }
                    }
                    punch(u.node);
                    sfx("chpoc");
                }
                if (def.spell.target === "anyUnitDmg") { // дротик: существо или строение; варево — только существо
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    // защиту отсеял единый вход; здесь — допустимый тип цели
                    if (!u || (u.def.type !== "unit"
                        && (u.def.type !== "building" || def.spell.noBuildings))) return false;
                    if (def.spell.purge) { // «Извлечение духа»: снять все свойства, база лечится за каждое
                        const n = purgeUnit(u);
                        healBase("p", n);
                        sfx("chpoc");
                    } else if (def.spell.cocoon) { // «Защитный кокон»: «Защита 1» цели
                        addProtect(u);
                    } else if (def.spell.drainAll) { // «Огнешар»: вся энергия сверх цены — в урон
                        damageUnit(u, Math.max(0, B.energy - (free ? 0 : effCost(cardId, "p", target)))
                            + altarBonus("p")
                            + heroSpellBonus(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else if (def.spell.fireflies) { // «Рой светлячков»: урон = своим существам
                        damageUnit(u, spellHitDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else if (def.spell.growthHand) { // «Выстрел стихией Роста»: урон = картам Роста в руке
                        damageUnit(u, spellHitDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    } else {
                        damageUnit(u, spellDmg(def, "p", u.def.type === "unit", true), null, "rocket");
                    }
                    // «Ядро кометы»: выжившее существо получает «Заморожен N»
                    if (def.spell.freeze && B.units.includes(u)) addFrozen(u, def.spell.freeze, "p");
                }
                if (def.spell.target === "emptyCell") { // культ — ряд в гоблинах; толпа — 3 скелета
                    if (!target || target.col === undefined) return false;
                    if (unitAt(target.col, target.row)) return false;
                    if (def.spell.skeletonCrowd) { // «Толпа скелетов»: клетка + слева/справа
                        if (skeletonCrowdSpawn("p", target.col, target.row)) sfx("aqua");
                    } else cultRowSpawn("p", target.row);
                }
                if (def.spell.target === "anyCell") { // стена костров: ряд горит N ходов владельца;
                    // «Испепеляющий луч»: все существа вертикального ряда клетки
                    if (!target || target.col === undefined) return false;
                    if (def.spell.columnDmg) { // hon180: СУЩЕСТВА (обе стороны)
                        // в колонке выбранной клетки (W73: под «Лесным
                        // оплотом» и постройки — effCreature); урон как у
                        // массовых — алтарь и геройский бонус добавляются
                        // к каждому удару (первое уронное — на всю серию,
                        // по образцу aoeDmg)
                        const dmg = def.spell.columnDmg + altarBonus("p");
                        const fs = heroSpellBonus(def, "p", false, true);
                        A.fxHint = "mass"; // массовый урон — Impact frame
                        try {
                            for (const v of B.units.slice()) {
                                if (v.col !== target.col
                                    || !effCreature(v)) continue;
                                damageUnit(v, dmg + fs
                                    + heroSpellBonus(def, "p", true), null, "rocket");
                            }
                        } finally { A.fxHint = null; }
                        sfx("chpoc");
                        return true;
                    }
                    B.firewalls.push({ col: target.col, row: target.row, side: "p",
                        left: def.spell.turns, dmg: def.spell.firewall });
                    redrawFirewalls();
                    sfx("chpoc");
                }
                if (def.spell.target === "ownUnit" && def.spell.baseHit) { // «Бросок валуна»: своё существо бьёт базу врага — это его атака
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    baseHit("p", u);
                    triggerAttackTraps(u);
                }
                if (def.spell.target === "ownUnit" && def.spell.wolfVolley) { // «Атака духами волков»: Выстрел + волки на пути
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    wolfVolley(u);
                }
                if (def.spell.target === "ownUnit" && def.spell.sacrifice) { // жертва: убить своё, ударить соседей
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    const p = cellXY(u.col, u.row);
                    killUnit(u, null);
                    floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                    for (const v of B.units.slice()) {
                        if (Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1) {
                            damageUnit(v, def.spell.dmg, null, "rocket");
                        }
                    }
                }
                if (def.spell.target === "ownUnit" && def.spell.beastBlast) { // «Взрыв твари» (dec150): своё гибнет, серия случайных ударов
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    beastBlastCast("p", u);
                }
                if (def.spell.target === "enemyUnit" && def.spell.mindControl) { // «Тёмный контроль» (dec134): существо врага переходит на вашу сторону, вы теряете 2 жизни
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side === "p" || u.def.type !== "unit") return false;
                    damageBase("p", def.spell.mindControl, { x: 960, y: 840, fill: 0xff8f6e });
                    u.side = "p"; // «как будто вы его призвали»: марши/атаки по новой стороне, метки остаются
                    recalcAuras();
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 78, "⇄", 0xc9a0ef);
                    fxEvent("seal", { x: p.x, y: p.y - 8, color: 0xc9a0ef, scale: 0.85 });
                    punch(u.node);
                    sfx("chpoc");
                }
                if (def.spell.target === "ownUnit" && def.spell.lightAura) { // «Аура света» (hon199): световая метка
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    // в конце хода владельца соседние СУЩЕСТВА противника
                    // теряют 1 жизнь (auraLightTick); метка умирает вместе
                    // с носителем
                    u.lightAura = true;
                    const mark = new PIXI.Graphics();
                    mark.circle(0, 0, 9);
                    mark.fill({ color: 0xffe9b0 });
                    mark.stroke({ width: 3, color: 0xf0c96a });
                    mark.position.set(-36, -54);
                    mark.name = "auraMark";
                    mark.eventMode = "none";
                    u.node.addChild(mark);
                    const p = cellXY(u.col, u.row);
                    floatText(p.x, p.y - 60, "☀", 0xffe9b0);
                }
                if (def.spell.target === "ownUnit" && def.spell.darkExtract) { // «Извлечение тьмы» (dec153): своё гибнет — энергия = сумма ⚔+♥
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "unit") return false;
                    const n = (u.curAtk || 0) + (u.hp || 0);
                    const p = cellXY(u.col, u.row);
                    killUnit(u, null);
                    floatText(p.x, p.y - 45, "☠", 0xef9f8c);
                    B.energy += n;
                    floatText(960, 840, `+${n}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("chpoc");
                }
                if (def.spell.terrainScout) { // «Выбор местности» (dec156): верхние N карт колоды — взять 1 постройку
                    openRunesPanel(def.spell.terrainScout, "building");
                }
                if (def.spell.bloodMoon) { // «Кровавая луна» (dec160): жизни базы — в энергию (выбор 1..N)
                    openMoonPanel(def.spell.bloodMoon);
                }
                if (def.spell.target === "ownBuilding" && def.spell.excavate) { // «Раскопки»
                    if (!target || target.col === undefined) return false;
                    const u = unitAt(target.col, target.row);
                    if (!u || u.side !== "p" || u.def.type !== "building") return false;
                    const cell = { col: u.col, row: u.row };
                    const id = cardIdOf(u.def);
                    removeUnit(u); // в сброс без каскадов смерти — постройка не «убита»
                    recalcAuras();
                    B.discard.push(id);
                    noteDiscard(1, "p", [id]);
                    const p = cellXY(cell.col, cell.row);
                    floatText(p.x, p.y - 60, "⤓", 0xef9f8c);
                    sfx("chpoc");
                    openExcavatePanel(cell); // выбор постройки сброса в освободившуюся клетку
                }
                if (def.spell.phoenix) { // «Рождение феникса» (sg244): все
                    // постройки — в топку, Элементаль = числу жертв
                    phoenixRise("p");
                    return true;
                }
                if (def.spell.target === "none" && def.spell.baseDmg) { // землетрясение
                    damageBase("e", def.spell.baseDmg + heroSpellBonus(def, "p", false, true),
                        { x: 960, y: 60, fill: 0xff8f6e });
                    sfx("chpoc");
                }
                if (def.spell.target === "none" && def.spell.stealEnergy) { // «Похищение энергии»: 2⚡
                    const got = Math.min(def.spell.stealEnergy, B.eEnergy);
                    B.eEnergy -= got;
                    B.energy += got;
                    floatText(960, 60, `−${got}⚡`, 0xff8f6e);
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("chpoc");
                }
                if (def.spell.target === "none" && def.spell.energyPerHand) { // «Цветение кристаллов»: +1⚡ за карту в руке
                    // сама карта в момент эффекта ещё числится в руке — не считаем
                    const got = Math.max(0, B.hand.length - 1);
                    B.energy += got;
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("chpoc");
                }
                if (def.spell.target === "none" && def.spell.energyPerTrap) { // «Поток маны»: +1⚡ за свою ловушку
                    const got = B.traps.p.length;
                    B.energy += got;
                    floatText(960, 840, `+${got}⚡`, 0xffd98c);
                    if (got) punch(root.hud);
                    sfx("chpoc");
                }
                if (def.spell.target === "none" && def.spell.nextEnergy) { // «Медитация» (hw268, W78): +3⚡ в начале следующего хода (upkeep)
                    const n = def.spell.nextEnergy;
                    B.nextTurnEnergy.p += n;
                    floatText(960, 840, `⏳ +${n}⚡`, 0xffd98c);
                    punch(root.hud);
                    sfx("chpoc");
                }
                if (def.spell.debuffEnemyAtkAll) { // «Нехватка воздуха»: −N урона всем существам врага
                    const n = def.spell.debuffEnemyAtkAll;
                    for (const v of B.units) if (v.side !== "p" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) - n;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `−${n}⚔`, 0x8cd0ef);
                        fxEvent("debuff", { x: p.x, y: p.y - 12, scale: 0.62 });
                    }
                    recalcAuras();
                    sfx("chpoc");
                }
                if (def.spell.iceSwarm) { // «Рой ледо-пикси»: Элементали 1/1 на случайные пустые клетки
                    const n = iceSwarmSpawn("p", def.spell.iceSwarm);
                    if (n) sfx("aqua");
                }
                if (def.spell.laySummon) { // «Молебен»: Человек 2/2 на случайную пустую клетку
                    if (laySummonSpawn("p")) sfx("aqua");
                }
                if (def.spell.rootSummon) { // «Эльф корней»: Эльф 1/1 на случайную пустую клетку
                    if (rootElfSpawn("p")) sfx("aqua");
                }
                if (def.spell.wolfSummon) { // «Белый волк» (gh252, W61): Животное 2/3 на случайную пустую клетку
                    if (wolfSpawn("p")) sfx("aqua");
                }
                if (def.spell.summonPoints) { // «Огнелис»/«Огнемедведь» (sg249/250):
                    // Животное в случайную пустую клетку — очки характеристик
                    // распределяет игрок (панель); поле забито — не призывается
                    if (splitSpawnable())
                        openSplitPanel(def.spell.summonToken, def.spell.summonPoints);
                }
                if (def.spell.rebalance) { // «Снабжение» (hon170): у всех своих
                    // существ меньшая из характеристик ⚔/♥ становится равной
                    // большей (постройки — не существа; жетоны — существа)
                    for (const v of B.units.slice()) {
                        if (v.side !== "p" || v.def.type !== "unit"
                            || v.curAtk === v.hp) continue;
                        const a = v.curAtk;
                        let dAtk = 0, dHp = 0;
                        if (a < v.hp) {
                            dAtk = v.hp - a;
                            v.bonusAtk = (v.bonusAtk || 0) + dAtk;
                            recalcAuras();
                        } else { dHp = a - v.hp; v.hp = a; }
                        const an = v.node.getChildByName("atk");
                        if (an) an.text = String(v.curAtk);
                        const hn = v.node.getChildByName("hp");
                        if (hn) hn.text = String(v.hp);
                        const vp = cellXY(v.col, v.row);
                        floatText(vp.x, vp.y - 60, "⇔", 0xffd98c);
                        punch(v.node);
                        onBuff(v, dAtk, dHp); // «Белая пуща» (W61)
                    }
                    sfx("chpoc");
                }
                if (def.spell.aoeDmg) { // «Раскалённые обломки»: всем вражеским существам и постройкам
                    const dmg = def.spell.aoeDmg + altarBonus("p");
                    // первое уронное заклинание — +1 ко ВСЕМ ударам этого каста;
                    // «Поджигатели» — +1 только существам (постройки не считаются)
                    const fs = heroSpellBonus(def, "p", false, true);
                    A.fxHint = "mass"; // массовый урон — Impact frame
                    try {
                        for (const v of B.units.slice()) if (v.side !== "p")
                            damageUnit(v, dmg + fs
                                + (v.def.type === "unit"
                                    ? heroSpellBonus(def, "p", true) : 0),
                                null, "rocket");
                    } finally { A.fxHint = null; }
                    sfx("chpoc");
                }
                if (def.spell.buffAllAtk) { // «Поднять стяги!»: +1 урона всем своим существам
                    for (const v of B.units) if (v.side === "p" && v.def.type === "unit") {
                        v.bonusAtk = (v.bonusAtk || 0) + def.spell.buffAllAtk;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${def.spell.buffAllAtk}⚔`, 0x9fd489);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.6 });
                        onBuff(v, def.spell.buffAllAtk, 0); // «Белая пуща» (W61)
                    }
                    recalcAuras();
                    sfx("chpoc");
                }
                // «Ковка оружия» (tim208): все свои существа, появившиеся
                // в ЭТОТ ход (включая пришедших через «Сдвиг»), получают
                // +2 к урону; до конца хода бонус ловят и следующие
                // появления (forge в addUnit)
                if (def.spell.forge) {
                    B.forge.p = { turn: B.turnNo, amt: def.spell.forge };
                    for (const v of B.units) if (v.side === "p"
                        && v.def.type === "unit" && v.bornTurn === B.turnNo) {
                        v.bonusAtk += def.spell.forge;
                        punch(v.node);
                        const p = cellXY(v.col, v.row);
                        floatText(p.x, p.y - 39, `+${def.spell.forge}⚔`, 0x9fd489);
                        fxEvent("buff", { x: p.x, y: p.y - 12, scale: 0.6 });
                        onBuff(v, def.spell.forge, 0); // «Белая пуща» (W61)
                    }
                    recalcAuras();
                    sfx("chpoc");
                }
                if (def.spell.target === "enemyAny") {
                    if (!target) return false;
                    if (target.base === true) {
                        damageBase("e", def.spell.dmg + heroSpellBonus(def, "p", false, true),
                            { x: 960, y: 60, fill: 0xff8f6e });
                        sfx("chpoc");
                    } else if (target.col !== undefined) {
                        const u = unitAt(target.col, target.row);
                        // защиту отсеял единый вход; тут — только сторона
                        if (!u || u.side === "p") return false;
                        damageUnit(u, def.spell.dmg + heroSpellBonus(def, "p",
                            u.def.type === "unit", true), null, "rocket");
                    } else return false;
                }
                // «Негативный поток» (dec126): 1 урон ЛЮБОМУ существу (обе
                // стороны, постройки — не существа) или противнику (его базе)
                if (def.spell.target === "anyUnitOrFoe") {
                    if (!target) return false;
                    if (target.base === true) {
                        damageBase("e", def.spell.dmg + heroSpellBonus(def, "p", false, true),
                            { x: 960, y: 60, fill: 0xff8f6e });
                        sfx("chpoc");
                    } else if (target.col !== undefined) {
                        const u = unitAt(target.col, target.row);
                        if (!u || u.def.type !== "unit") return false;
                        damageUnit(u, def.spell.dmg + heroSpellBonus(def, "p", true, true),
                            null, "rocket");
                    } else return false;
                }
                if (def.spell.draw) drawCards(def.spell.draw);
                // «Временная петля» (tim229): после этого хода сторона
                // играет ещё раз — флаг тратится в точке смены хода
                // (endTurn/панель сброса/enemyTurn)
                if (def.spell.extraTurn) {
                    B.extraTurn.p = true;
                    floatText(960, 540,
                        "⏳ " + GAME_LOC.t("time.loop.extra"), 0xc9a0ef);
                    fxEvent("seal", { x: 960, y: 540, color: 0xc9a0ef, scale: 1.4 });
                    sfx("chpoc");
                }
                // «Царский совет» (tim230): все жетоны ловушек противника
                // снимаются с поля боя (клеточные и руны-жетоны; споры —
                // не жетон ловушки, остаются)
                if (def.spell.trapSweep) {
                    const swept = B.traps.e.length;
                    B.traps.e = [];
                    redrawTraps();
                    for (let i = 0; i < Math.min(swept, 3); i++)
                        fxEvent("seal", { x: 960 + (i - 1) * 140, y: 300,
                            color: 0x8a5ab0, scale: 0.9 });
                    floatText(960, 430,
                        "✕ " + GAME_LOC.t("time.sweep.done"), 0x8cd0ef);
                    sfx("mine");
                }
                // «Добыча кристаллов» (tim211): +1⚡ за каждую единицу
                // «Сдвига» каждого своего существа, ждущего на поле (значки)
                if (def.spell.crystalHarvest) {
                    let n = 0;
                    for (const d2 of (B.delayed ? B.delayed.p : []))
                        n += Math.max(0, d2.left);
                    if (n > 0) {
                        B.energy += n;
                        floatText(960, 790, `+${n}⚡`, 0xffd98c);
                        sfx("chpoc");
                    }
                }
                // «Мозговой штурм» (tim206): сбросить ВСЮ руку и взять столько
                // же +1. Прямой розыгрыш — карта ещё в руке, её сбросит/
                // оплатит castSpell (skipHandReset); вызов после spendCard
                if (def.spell.brainstorm && !(opts && opts.skipHandReset))
                    discardHandDraw("p", B.hand.length + 1);
                // «Запутать руны»: обе руки — в сброс, по 3 карты (спека:
                // «вы И ПРОТИВНИК»; раньше сбрасывалась только своя — баг
                // юзера). При прямом розыгрыше карта ещё в руке — её сбросит/
                // оплатит castSpell (skipHandReset), поэтому эффект зовётся
                // оттуда после spendCard.
                if (def.spell.discardHandDraw && !(opts && opts.skipHandReset))
                    confuseRunes("p", def.spell.discardHandDraw);
                if (def.spell.brew) { B.brewCasts = (B.brewCasts || 0) + 1; refreshBrewBadges(); }
                if (def.spell.search) openRunesPanel(def.spell.search); // выбор поверх боя
                if (def.spell.searchUnit) openRunesPanel(def.spell.searchUnit, "unit"); // «Рунное гадание»
                if (def.spell.seek) openSeekPanel(def.spell.seek, def.spell.seekPicks || 1); // «Поиск знаний»
                // «Поиск во времени» (tim217): верхние 6 карт колоды — 1 карта
                // со «Сдвигом» или «Возвратом» в руку (панель Поиска знаний
                // с фильтром; не подходящие затемнены; нет подходящих —
                // «Закончить», карта и энергия потрачены)
                if (def.spell.timeSearch)
                    openSeekPanel(def.spell.timeSearch, 1,
                        (id) => { const d = CARDS[id];
                            return !!(d && (d.delay || d.returnN)); },
                        "seekTime.title");
                if (def.spell.grim) openGrimPanel(); // «Гримуар инея»: выбор типа + верхние 4
                if (def.spell.journey) openJourneyPanel(def.spell.journey);
                if (def.spell.discardPick) openBrewPanel(); // «Варка зелий»: выбор из сбросов
                // «Поднятие мёртвых»: существа своего сброса — в руку (гейт
                // выше: пусто в сбросе → карта не разыгрывается)
                if (def.spell.raiseDead) openRaisePanel();
                // «Плен» (hon197): панель руки противника — удалить карту призыва
                if (def.spell.captivate) openCaptivatePanel();
                // «Воскрешение» (hon200): панель своего сброса — разыграть карту
                if (def.spell.resurrect) openResurrectPanel();
                // «Пытка разума»: панель «кто сбрасывает случайные карты»
                if (def.spell.mindTorture) openTorturePanel(def.spell.mindTorture);
                // «Запретные знания» (dec130): панель «кто берёт 3 карты
                // и теряет 2 жизни»
                if (def.spell.forbidden) openForbiddenPanel(def.spell.forbidden);
                return true;
            };

            // Автоцель для повтора заклинания («Горящие руны») — приоритеты ИИ:
            // добивание, сильнейший, ряд с наибольшим числом врагов.
            A.autoTargetFor = function autoTargetFor(cardId) {
                const def = CARDS[cardId];
                const tg = def.spell.target;
                if (tg === "anyUnit" && def.spell.hydroPunch) { // «Гидроудар»
                    const foes = spellTargets(B.units.filter((u) => u.side !== "p"
                        && u.def.type === "unit"));
                    const best = foes.slice().sort((a, b) =>
                        (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnit" && def.spell.iceStrike) { // «Ледяной удар»
                    const pick = iceStrikePick("p");
                    return pick ? { col: pick.unit.col, row: pick.unit.row } : null;
                }
                if (tg === "ownUnit" && def.spell.darkExtract) { // «Извлечение тьмы»: своё с наибольшей суммой ⚔+♥
                    const own = spellTargets(B.units.filter((u) => u.side === "p"
                        && u.def.type === "unit"));
                    const best = own.slice().sort((a, b) =>
                        ((b.curAtk || 0) + (b.hp || 0)) - ((a.curAtk || 0) + (a.hp || 0)))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "enemyUnit") { // «Тёмный контроль»: самое опасное существо врага
                    const foes = spellTargets(B.units.filter((u) => u.side !== "p"
                        && u.def.type === "unit"));
                    const best = foes.slice().sort((a, b) => aiThreat(b) - aiThreat(a))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnit" || tg === "ownUnit") {
                    const own = spellTargets(B.units.filter((u) => u.side === "p"
                        && u.def.type === "unit"));
                    const best = own.slice().sort((a, b) => (b.curAtk - a.curAtk) || (b.row - a.row))[0];
                    return best ? { col: best.col, row: best.row } : null;
                }
                if (tg === "anyUnitDmg") {
                    if (def.spell.cocoon) { // кокон — своему крепышу
                        const own = spellTargets(B.units.filter((u) => u.side === "p"));
                        const best = own.slice().sort((a, b) => (b.hp - a.hp) || (b.curAtk - a.curAtk))[0];
                        return best ? { col: best.col, row: best.row } : null;
                    }
                    if (def.spell.purge) { // дух — чужой самый «заряженный» объект
                        let best = null, bestN = 0;
                        for (const u of spellTargets(B.units)) {
                            if (u.side === "p") continue;
                            const n = countProps(u);
                            if (n > bestN) { bestN = n; best = u; }
                        }
                        return best ? { col: best.col, row: best.row } : null;
                    }
                    const dmg = def.spell.drainAll
                        ? Math.max(0, B.energy) + altarBonus("p") // повтор — цена не вычитается
                        : spellHitDmg(def);
                    const targets = spellTargets(B.units.filter((u) => u.side !== "p"
                        && (u.def.type === "unit"
                            || (u.def.type === "building" && !def.spell.noBuildings))));
                    if (!targets.length) return null;
                    const kills = targets.filter((v) => v.hp <= dmg);
                    const best = (kills.length ? kills : targets)
                        .slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return { col: best.col, row: best.row };
                }
                if (tg === "ownBuilding") { // раскопки — первая своя постройка
                    const own = spellTargets(B.units.filter((u) => u.side === "p"
                        && u.def.type === "building"));
                    return own.length ? { col: own[0].col, row: own[0].row } : null;
                }
                if (tg === "enemyAny") {
                    const targets = spellTargets(B.units.filter((u) => u.side !== "p"));
                    if (!targets.length) return { base: true };
                    const best = targets.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return { col: best.col, row: best.row };
                }
                if (tg === "anyUnitOrFoe") { // «Негативный поток»: существо любой стороны или база
                    const dmg = spellHitDmg(def);
                    const targets = spellTargets(B.units.filter((u) => u.def.type === "unit"));
                    const kills = targets.filter((v) => v.hp <= dmg);
                    if (!kills.length && B.enemyBase <= dmg) return { base: true };
                    const pool = kills.length ? kills : targets;
                    const best = pool.slice().sort((a, b) => (b.curAtk - a.curAtk) || (a.row - b.row))[0];
                    return best ? { col: best.col, row: best.row } : { base: true };
                }
                if (tg === "anyCell") { // стена костров — ряд, где больше врагов
                    const counts = [0, 0, 0, 0, 0];
                    for (const v of B.units) if (v.side !== "p") counts[v.row]++;
                    return { col: 2, row: counts.indexOf(Math.max(...counts)) };
                }
                if (tg === "emptyCell") { // культ — ряд, где больше пустых (ничья — где больше врагов)
                    const empt = [0, 0, 0, 0, 0], foes = [0, 0, 0, 0, 0];
                    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++)
                        if (!unitAt(c, r)) empt[r]++;
                    for (const v of B.units) if (v.side !== "p") foes[v.row]++;
                    let best = 0;
                    for (let r = 1; r < GRID; r++)
                        if (empt[r] > empt[best] || (empt[r] === empt[best] && foes[r] > foes[best])) best = r;
                    return { col: 2, row: best };
                }
                return null; // без цели или целей нет — эффект повторится «вхолостую»
            };

            // «Горящие руны» (str25): эффект последнего разыгранного заклинания
            // повторно, бесплатно; затем то заклинание СЖИГАЕТСЯ — одна копия
            // уходит из своей текущей зоны (рука → колода → сброс) до конца боя
            // (в колоду при перетасовке она больше не вернётся).
            A.replaySpell = function replaySpell(cardId, origin) {
                const def = CARDS[cardId];
                if (!def || def.type !== "spell") return;
                const target = autoTargetFor(cardId);
                applySpellP(cardId, target, true);
                fxSpellCast(cardId, target, "p", origin);
                if (def.spell.drainAll || def.spell.stormAll
                    || def.spell.crushEnergy || def.spell.highPower)
                    B.energy = 0; // огнешар/гроза/«Древомощь»/«Высокая мощность» и в повторе сжигают энергию
                const hi = B.hand.indexOf(cardId);
                if (hi >= 0) B.hand.splice(hi, 1);
                else {
                    const di = B.deck.indexOf(cardId);
                    if (di >= 0) B.deck.splice(di, 1);
                    else {
                        const si = B.discard.indexOf(cardId);
                        if (si >= 0) B.discard.splice(si, 1);
                    }
                }
                A.recalcAuras(); // «Каток» (tim236): сброс мог стать короче
                floatText(960, 640, `🔥 ${GAME_LOC.t(`card.${cardId}.name`)}`, 0xffb26e);
            };

            A.castSpell = function castSpell(handIdx, target) {
                if (B.phase !== "player" || B.discarding || B.picking) return false;
                const cardId = B.hand[handIdx];
                const def = CARDS[cardId];
                if (!def || def.type !== "spell"
                    || effCost(cardId, "p", target) > B.energy) return false;
                const resetHand = def.spell.discardHandDraw;
                // «Мозговой штурм» (tim206): рука уйдёт в сброс ПОСЛЕ выхода
                // самой карты (в applySpellPInner она ещё в руке)
                const brainstorm = def.spell.brainstorm;
                // центр разыгранной карты (просил юзер): эффект заклинания
                // без позиции цели рождается на карте; считаем ДО эффектов —
                // сбросы/доборы могли бы пересобрать руку и сдвинуть индексы
                const origin = handCardCenter(handIdx);
                // «Магопуты» (firstCardVoid, W77): первая карта игрока за
                // бой отменяется героем врага — карта и энергия потрачены
                if (heroVoidFirstCancel("p")) {
                    B.energy -= effCost(cardId, "p", target);
                    spendCard(handIdx);
                    consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                    floatText(960, 640, "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    sfx("mine");
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    checkEnd();
                    return true;
                }
                // «Отмена заклинания» (wis83) врага: заклинание отменяется —
                // карта и энергия потрачены, эффект не срабатывает (спека юзера)
                const cTrap = counterTrapConsume("e", "counterSpell");
                if (cTrap) {
                    B.energy -= effCost(cardId, "p", target);
                    spendCard(handIdx);
                    consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                    const p = cellXY(cTrap.col, cTrap.row);
                    floatText(p.x, p.y + 66, "✕ " + GAME_LOC.t(`card.${cardId}.name`), 0x8cd0ef);
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    checkEnd();
                    return true;
                }
                if (def.spell.copyLast) { // «Горящие руны»: повтор последнего бесплатно
                    const last = B.lastSpell.p;
                    if (!last || last === "str25" || !CARDS[last]
                        || CARDS[last].type !== "spell") return false;
                    B.energy -= effCost(cardId, "p", target);
                    spendCard(handIdx);
                    consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                    heroFirstSpellEnergy("p"); // «Дуновение опасности»
                    heroStrReplay("p", cardId, def); // «Мастера огня»
                    B.lastSpell.p = "str25"; // повтор самой себя — бесконечная цепочка
                    replaySpell(last, origin);
                    afterSpellPlayed("p");
                    layoutHand();
                    redrawHighlight();
                    refreshHud();
                    checkEnd();
                    return true;
                }
                // playCtx — карта в процессе розыгрыша: её эффекты (сбросы
                // карт) видит noteDiscard для способности «Сброс разума»
                // (decMind); снимается после выхода карты в сброс
                B.playCtx = { side: "p", cardId };
                // «Растущая доблесть» (Белая пуща, W62): ДО эффекта —
                // случайное существо из стоящих на поле (призванное этой
                // картой в пул не попадает); отменённое «Отменой
                // заклинания» выше по ветке не доходит сюда. «Переплетение
                // сил» (Небесный дворец, W75) — туда же
                multiValor(cardId, "p");
                multiWeave(cardId, "p");
                multiStudy(cardId, "p"); // «Глубокое изучение» (Магодром, W79)
                if (!applySpellP(cardId, target, false,
                    (resetHand || brainstorm) ? { skipHandReset: true } : null)) {
                    B.playCtx = null;
                    return false;
                }
                fxSpellCast(cardId, target, "p", origin);
                B.energy = (def.spell.drainAll || def.spell.stormAll
                    || def.spell.crushEnergy // «Древомощь» (sg243) сливает всё
                    || def.spell.highPower) // «Высокая мощность» (wt274, W80): всю энергию потратил powerAct
                    ? 0 : B.energy - effCost(cardId, "p", target);
                consumeEpicDiscount(cardId, "p"); // «Архилич»: флаг первой эпик-карты
                spendCard(handIdx); // при пометке «Сброса разума» вернёт карту в руку
                B.playCtx = null;
                if (resetHand) confuseRunes("p", resetHand); // обе стороны (спека)
                if (brainstorm) // сброс остатка руки уже без карты штурма:
                    // добор = (рука сейчас) + 2, итого «столько же и ещё +1»
                    discardHandDraw("p", B.hand.length + 2);
                heroFirstSpellEnergy("p"); // «Дуновение опасности»: +1⚡ за 1-е заклинание
                heroStrReplay("p", cardId, def); // «Мастера огня»
                B.lastSpell.p = cardId;
                afterSpellPlayed("p"); // «Заклинатель клинков» и его соседи
                layoutHand();
                redrawHighlight();
                refreshHud();
                checkEnd();
                return true;
            };
        }
    };
})();
