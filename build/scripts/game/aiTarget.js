// СЦЕНА «АРЕНА»: ИИ: ВЫБОР ЦЕЛЕЙ — панельные пики (жертва/нова/волк/
// кокон/багрование), цели урона и бафов, клетки ловушек, играбельность
// заклинаний, поиск и повтор карт из сброса.
// Модуль только вешает функции/состояние на общий контекст A (см. arenaCore.js);
// внутри установщика — with (A), поэтому тела видят общие имена как раньше.
(function () {
    globalThis.GAME_ARENA.installAiTarget = function installAiTarget(A) {
        with (A) {

            // ── Панельные карты у ИИ (просил юзер): эффекты, которые у игрока
            // идут через панели выбора, ИИ разыгрывает «в голове» — цель берёт
            // теми же приоритетами, что и обычные карты.
            // Жертва «Жертвоприношения» (str11): своё существо, чей взрыв убивает
            // врагов и окупает потерю — слабое своё против убиваемого, либо
            // 2+ убиваемых разом. Взрыв бьёт и СВОИХ рядом (аккуратно с картами,
            // вредящими своим — просил юзер): своих под удар не подставляем.
            A.aiSacrificePick = function aiSacrificePick() {
                const dmg = CARDS.str11.spell.dmg;
                let best = null, bestScore = 0;
                for (const u of spellTargets(B.units)) {
                    if (u.side !== "e" || u.def.type !== "unit") continue;
                    const victims = B.units.filter((v) => v.side === "p"
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1
                        && v.hp <= dmg);
                    const ownColl = B.units.filter((v) => v.side === "e" && v !== u
                        && Math.abs(v.col - u.col) + Math.abs(v.row - u.row) === 1
                        && v.hp <= dmg);
                    // считаем не число голов, а их опасность; своё — по цене
                    const killScore = victims.reduce((s, v) => s + aiThreat(v), 0);
                    const lossScore = ownColl.reduce((s, v) => s + aiOwnValue(v), 0);
                    const score = victims.length * 1.8 + killScore * 0.8
                        - aiOwnValue(u) * 0.5 - lossScore * 0.8;
                    if (victims.length >= 1 && score > bestScore) { best = u; bestScore = score; }
                }
                return best;
            };
            // «Круговая атака» (grw34) бьёт ВСЕХ соседей цели — и чужих, и
            // своих. Выбираем своё существо, у которого чужих соседей больше
            // и они опаснее; если выгоднее своих — заклинание не играем.
            // «Круговая атака» (grw34) бьёт ВСЕХ соседей цели — и чужих, и
            // своих. Выбираем своё существо, у которого чужих соседей больше
            // и они опаснее; если выгоднее своих — заклинание не играем.
            A.aiNovaPick = function aiNovaPick() {
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"));
                let best = null, bestScore = 0;
                for (const v of own) {
                    let score = 0, foes = 0;
                    for (const o of B.units) {
                        if (o === v) continue;
                        if (Math.abs(o.col - v.col) + Math.abs(o.row - v.row) !== 1) continue;
                        if (o.side === "p") {
                            foes++;
                            score += o.hp <= 1 ? aiThreat(o) + 1 : 0.8;
                        } else {
                            score -= o.hp <= 1 ? aiVal(o) + 1 : 0.8;
                        }
                    }
                    if (foes && score > bestScore) { best = v; bestScore = score; }
                }
                return best;
            };
            // «Атака духами волков» (grw33): выстрел идёт по СВОЕЙ колонке и
            // бьёт ЛЮБОЕ первое существо — в том числе своё. Выбираем стрелка,
            // у которого впереди нет своих: лучше всего — чистая колонка до
            // базы игрока (урон в базу + волки на всём пути) или убийство.
            // «Атака духами волков» (grw33): выстрел идёт по СВОЕЙ колонке и
            // бьёт ЛЮБОЕ первое существо — в том числе своё. Выбираем стрелка,
            // у которого впереди нет своих: лучше всего — чистая колонка до
            // базы игрока (урон в базу + волки на всём пути) или убийство.
            A.aiWolfPick = function aiWolfPick() {
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"));
                let best = null, bestScore = -Infinity;
                for (const u of own) {
                    let hit = null;
                    const path = [];
                    for (let r = u.row + 1; r < GRID; r++) {
                        const o = unitAt(u.col, r);
                        if (o) { hit = o; break; }
                        path.push(r);
                    }
                    let score = 0;
                    if (!hit) {
                        score = u.curAtk * 1.4 + path.length * 0.8;
                        if (u.curAtk >= B.playerBase) score += 10; // летал в базу
                    } else if (hit.side === "p") {
                        score = Math.min(u.curAtk, hit.hp) * 0.9 + path.length * 0.6;
                        if (u.curAtk >= hit.hp) score += 4 + aiThreat(hit) * 0.4;
                        if (hit.def.type === "building") score += 0.8;
                    } else {
                        score = -20; // свой на линии — не стреляем сюда
                    }
                    if (u.curAtk <= 0) score -= 2;
                    if (score > bestScore) { bestScore = score; best = u; }
                }
                return bestScore > 0 ? best : null;
            };
            // Есть ли летал «Атакой духами волков»: чистая колонка до базы,
            // урон стрелка покрывает остаток базы. Нужен, чтобы ИИ не тратил
            // ману на другие карты, когда выстрел уже добивает.
            // Есть ли летал «Атакой духами волков»: чистая колонка до базы,
            // урон стрелка покрывает остаток базы. Нужен, чтобы ИИ не тратил
            // ману на другие карты, когда выстрел уже добивает.
            A.aiWolfLethal = function aiWolfLethal() {
                const u = aiWolfPick();
                if (!u || u.curAtk < B.playerBase) return false;
                for (let r = u.row + 1; r < GRID; r++) if (unitAt(u.col, r)) return false;
                return true;
            };
            // Цель усиления: не «самый сильный», а тот, кто успеет реализовать
            // бафф — ближе к базе игрока, выживет и ударит; для «Природной мощи»
            // — самый живучий, для «Огненного дыхания» — крепкий атакующий.
            // Цель усиления: не «самый сильный», а тот, кто успеет реализовать
            // бафф — ближе к базе игрока, выживет и ударит; для «Природной мощи»
            // — самый живучий, для «Огненного дыхания» — крепкий атакующий.
            A.aiBuffPick = function aiBuffPick(def) {
                const s = def.spell;
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"
                    && (!s.enchantFire || !v.enchantFire)));
                if (!own.length) return null;
                let best = null, bestScore = -Infinity;
                for (const v of own) {
                    const rowBonus = v.row * 0.2;
                    let score = 0;
                    if (s.buffAtk) {
                        score = (v.curAtk + s.buffAtk) * 1.25 + v.hp * 0.35
                            + (s.buffHp || 0) * 0.3 + rowBonus;
                        if (v.row >= GRID - 1 && v.curAtk + s.buffAtk >= B.playerBase) score += 8;
                    } else if (s.buffAtkByHp) {
                        score = v.hp * 1.4 + v.curAtk * 0.5 + rowBonus;
                    } else if (s.berserk) {
                        score = v.curAtk * 1.3 + v.hp * 0.7 + rowBonus;
                        if (v.curAtk >= 3) score += 0.8;
                        if (v.hp >= 3) score += 0.8;
                    } else if (s.venom) {
                        score = v.curAtk * 0.9 + v.hp * 1.0 + rowBonus;
                        if (v.def.speed > 1) score += 1;
                        if (v.berserk) score += 1;
                        if (v.venom) score += 0.5; // яд складывается
                    } else if (s.enchantFire) {
                        score = v.curAtk * 1.1 + v.hp * 0.8 + rowBonus;
                    } else {
                        score = v.curAtk * 1.2 + v.hp * 0.4 + rowBonus;
                    }
                    if (v.def.leaderAura || v.def.plantEcho || v.def.druidEnergy
                        || v.def.sisterDraw) score -= 0.4;
                    if (score > bestScore) { bestScore = score; best = v; }
                }
                return best;
            };
            // «Защитный кокон» — на своего под удар игрока (игрок ходит первым):
            // ценнее всего существо, которое вот-вот умрёт/движок.
            // «Защитный кокон» — на своего под удар игрока (игрок ходит первым):
            // ценнее всего существо, которое вот-вот умрёт/движок.
            A.aiCocoonPick = function aiCocoonPick() {
                const own = spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"));
                let best = null, bestScore = -Infinity;
                for (const v of own) {
                    const att = unitAt(v.col, v.row + 1);
                    const incoming = att && att.side === "p" && att.def.type === "unit"
                        ? att.curAtk : 0;
                    let score = aiOwnValue(v) + incoming * 0.8;
                    if (incoming) score += 2.5; // кокон на того, кого реально бьют
                    else score -= 2;
                    if (incoming && v.hp <= incoming) score += 2;
                    if (score > bestScore) { bestScore = score; best = v; }
                }
                return best;
            };
            // Точный урон заклинания по конкретной цели (для выбора цели).
            // consume=false — прикидка: способность «первое уронное» не тратится.
            // Точный урон заклинания по конкретной цели (для выбора цели).
            // consume=false — прикидка: способность «первое уронное» не тратится.
            A.aiDmgFor = function aiDmgFor(def, target, free = false, consume = false) {
                const s = def.spell;
                if (s.drainAll) {
                    const id = cardIdOf(def);
                    const cost = free ? 0 : effCost(id, "e", { col: target.col, row: target.row });
                    return Math.max(0, B.eEnergy - cost) + altarBonus("e")
                        + heroSpellBonus(def, "e", target.def.type === "unit", consume);
                }
                return spellHitDmg(def, "e", target.def.type === "unit", consume);
            };
            A.aiDmgTargets = function aiDmgTargets(def) {
                const s = def.spell;
                // «Защита от заклинаний» — общий фильтр целей (spellTargets)
                return spellTargets(B.units.filter((v) => v.side === "p"
                    && (v.def.type === "unit"
                        || (v.def.type === "building" && !s.noBuildings))));
            };
            // Выбор цели урона: добивание важнее «поцарапать» крупного;
            // иначе — максимум пользы на единицу урона (угроза × доля жизней),
            // плюс приоритет движкам игрока. Летал по базе проверяется отдельно.
            // Выбор цели урона: добивание важнее «поцарапать» крупного;
            // иначе — максимум пользы на единицу урона (угроза × доля жизней),
            // плюс приоритет движкам игрока. Летал по базе проверяется отдельно.
            A.aiDmgTargetPick = function aiDmgTargetPick(def, targets, free = false) {
                let best = null, bestScore = -Infinity;
                for (const v of targets) {
                    const dmg = aiDmgFor(def, v, free, false);
                    if (dmg <= 0) continue;
                    const pos = (GRID - 1 - v.row) * 0.35; // ближе к нашей базе — опаснее
                    let score;
                    if (v.hp <= dmg) {
                        score = 14 + aiThreat(v) * 1.1 + pos
                            - Math.max(0, dmg - v.hp) * 0.15;
                    } else {
                        score = (dmg / Math.max(1, v.hp)) * (aiThreat(v) * 0.9 + pos)
                            + dmg * 0.35 + (v.hp - dmg <= 2 ? 1.2 : 0);
                    }
                    if (v.def.type === "building") {
                        score *= 0.85;
                        if (v.def.spellAura || v.def.campAura || v.def.treeHomes
                            || v.def.monolith || v.def.groveAura || v.def.mycelium
                            || v.def.sprout) score += 2;
                    }
                    if (score > bestScore) { bestScore = score; best = v; }
                }
                return best;
            };
            // Оценка клетки ловушки: на пути самого опасного существа игрока;
            // мина любит скопления (сплэш по соседям жертвы), приманка — соседство
            // с сильными, опутывание — сильнейшего.
            // Оценка клетки ловушки: на пути самого опасного существа игрока;
            // мина любит скопления (сплэш по соседям жертвы), приманка — соседство
            // с сильными, опутывание — сильнейшего.
            A.aiTrapScore = function aiTrapScore(def, col, row) {
                const tr = def.trap;
                let score = 0;
                const victim = B.units.find((v) => v.side === "p"
                    && v.col === col && v.row === row + 1);
                if (victim) score += aiThreat(victim) * 0.8;
                if (tr.effect === "cellDmg" || tr.effect === "cellDmgAll"
                    || tr.effect === "cellDmgMin") {
                    if (victim) {
                        if (victim.def.type === "unit" && tr.effect !== "cellDmgMin") {
                            const crowd = B.units.filter((o) => o.side === "p" && o !== victim
                                && Math.abs(o.col - victim.col) + Math.abs(o.row - victim.row) === 1).length;
                            score += crowd * (tr.splash || 0) * 0.6;
                        }
                        // «Яма-ловушка»: урон = меньшему из урона и жизней
                        // жертвы — добивает, только если жизни не больше урона
                        const dmg = tr.effect === "cellDmgMin"
                            ? Math.min(victim.curAtk, victim.hp)
                            : (tr.amount || 0) + altarBonus("e");
                        if (victim.hp <= dmg) score += 1.5;
                    }
                } else if (tr.effect === "confuse" || tr.effect === "entangle") {
                    if (victim) score += aiThreat(victim) * 1.0 + victim.curAtk * 0.2;
                } else if (tr.effect === "freezeSplash") {
                    // «Ледяные кандалы»: жертва + её соседи-существа (обе
                    // стороны) пропускают марш; своих соседей — минус
                    if (victim) {
                        score += aiThreat(victim) * 0.9;
                        const near = B.units.filter((o) => o !== victim && o.def.type === "unit"
                            && Math.abs(o.col - victim.col) + Math.abs(o.row - victim.row) === 1);
                        for (const o of near)
                            score += (o.side === "p" ? aiThreat(o) * 0.7 : -aiThreat(o) * 1.1);
                    }
                } else if (tr.effect === "rowShift") {
                    // «Снежный ком»: сдвиг и 2 урона ВСЕМУ вертикальному ряду;
                    // своих в ряду — минус (здоровые бьют по нам же)
                    const dmg = (tr.amount || 2) + altarBonus("e");
                    for (const v of B.units) {
                        if (v.col !== col || v.def.type !== "unit") continue;
                        score += v.side === "p" ? aiThreat(v) * 0.55 : -(v.hp <= dmg
                            ? 9 : aiThreat(v) * 0.8);
                    }
                } else if (tr.effect === "lure") {
                    for (const v of B.units) if (v.side === "p"
                        && Math.abs(v.col - col) + Math.abs(v.row - row) === 1)
                        score += aiThreat(v) * 0.3;
                } else if (tr.effect === "ambush" || tr.effect === "ancestor") {
                    if (victim) score += aiThreat(victim) * 0.4;
                } else if (tr.effect === "alliesStrike") {
                    // «Тёмные цепи»: существо на клетке атакуют соседние СВОИ
                    // существа — ценность клетки = суммарная угроза соседей
                    const near = B.units.filter((o) => o.side === "e"
                        && o.def.type === "unit"
                        && Math.abs(o.col - col) + Math.abs(o.row - row) === 1);
                    if (near.length) {
                        for (const o of near) score += aiThreat(o) * 0.9;
                        if (victim) score += 0.5;
                    } else score = 0; // без соседей ловушка мертва
                }
                return score;
            };
            // Выбор клетки ловушки (вынесено из aiPlay, чтобы правило было одно
            // и проверялось пробой): путь марша сильнейшего, безопасность мины
            // для своих, приманка — к сильным.
            // Выбор клетки ловушки (вынесено из aiPlay, чтобы правило было одно
            // и проверялось пробой): путь марша сильнейшего, безопасность мины
            // для своих, приманка — к сильным.
            A.aiTrapSpot = function aiTrapSpot(def) {
                const freeAt = (cc, r2) => !unitAt(cc, r2)
                    && !B.traps.e.some((t) => t.col === cc && t.row === r2);
                const front = [], spots = [];
                const seenF = new Set();
                for (const v of B.units) {
                    if (v.side !== "p" || v.row - 1 < 0) continue;
                    const key = `${v.col}:${v.row - 1}`;
                    if (seenF.has(key) || !freeAt(v.col, v.row - 1)) continue;
                    seenF.add(key);
                    front.push([v.col, v.row - 1]);
                }
                for (const r of [4, 3, 2]) for (let cc = 0; cc < GRID; cc++) {
                    if (freeAt(cc, r)) spots.push([cc, r]);
                }
                if (!front.length && !spots.length) return null;
                let pool;
                if (front.length) pool = front;
                else if (def.trap.effect === "lure") {
                    const near = spots.filter(([c2, r2]) => B.units.some((v) =>
                        v.side === "p" && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                    pool = near.length ? near : spots;
                } else pool = spots;
                // «Путь грибов»/«Опутывание корней» — на клетку следующего шага
                // СИЛЬНЕЙШЕГО существа игрока (лучший бегун теряет марш).
                if ((def.trap.effect === "confuse" || def.trap.effect === "entangle")
                    && front.length) {
                    const strong = B.units.filter((v) =>
                        v.side === "p" && v.def.type === "unit")
                        .sort((a, b) => aiVal(b) - aiVal(a))[0];
                    if (strong) {
                        const f2 = front.filter(([c2, r2]) =>
                            c2 === strong.col && r2 === strong.row - 1);
                        if (f2.length) pool = f2;
                    }
                }
                // «Тёмные цепи»: клетка годится, только если рядом (верт/гориз)
                // есть СВОЁ существо — его атака и есть урон ловушки
                if (def.trap.effect === "alliesStrike") {
                    pool = pool.filter(([c2, r2]) => B.units.some((v) =>
                        v.side === "e" && v.def.type === "unit"
                        && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                    if (!pool.length) return null;
                }
                // «Гоблинская мина»: сплэш задевает соседей клетки — рядом не
                // должно быть своих убиваемых; совсем небезопасно — держим мину.
                if (def.trap.effect === "cellDmg" && def.trap.splash) {
                    const safe = pool.filter(([c2, r2]) => aiMineSafe(c2, r2));
                    if (!safe.length) return null;
                    const clean = safe.filter(([c2, r2]) => !B.units.some((v) =>
                        v.side === "e" && Math.abs(v.col - c2) + Math.abs(v.row - r2) === 1));
                    pool = clean.length ? clean : safe;
                }
                // «Снежный ком»: 2 урона всему ряду (колонке клетки) — если в
                // нём есть своё убиваемое существо, ловушку держим.
                if (def.trap.effect === "rowShift") {
                    const dmg = (def.trap.amount || 2) + altarBonus("e");
                    pool = pool.filter(([c2]) => !B.units.some((v) =>
                        v.side === "e" && v.col === c2 && v.def.type === "unit"
                        && v.hp <= dmg));
                    if (!pool.length) return null;
                }
                let best = [], bestScore = -Infinity;
                for (const [c, r] of pool) {
                    const score = aiTrapScore(def, c, r);
                    if (score > bestScore + 1e-9) { bestScore = score; best = [[c, r]]; }
                    else if (Math.abs(score - bestScore) < 1e-9) best.push([c, r]);
                }
                return best[(Math.random() * best.length) | 0];
            };
            // Цель «Ледяного удара» для ИИ: существо (своё или игрока), чей
            // случайный сосед получит урон/«Заморожен» в нашу пользу. Если
            // все варианты бьют по своим — карту не играем.
            // Цель «Ледяного удара» для ИИ: существо (своё или игрока), чей
            // случайный сосед получит урон/«Заморожен» в нашу пользу. Если
            // все варианты бьют по своим — карту не играем.
            A.aiIceStrikeTarget = function aiIceStrikeTarget() {
                const pick = iceStrikePick("e");
                return pick && pick.score > 0 ? pick.unit : null;
            };
            // Цель «Гидроудара» (wis99) для ИИ: существо игрока — 1 урон и
            // сдвиг К ЕГО базе (назад по маршу). Ценим добивание, сильных
            // угроз, доступность клетки за спиной (без неё сдвига нет).
            // Цель «Гидроудара» (wis99) для ИИ: существо игрока — 1 урон и
            // сдвиг К ЕГО базе (назад по маршу). Ценим добивание, сильных
            // угроз, доступность клетки за спиной (без неё сдвига нет).
            A.aiHydroPick = function aiHydroPick() {
                let best = null, bestScore = 0;
                const dmg = 1 + altarBonus("e");
                for (const v of spellTargets(B.units)) {
                    if (v.side !== "p" || v.def.type !== "unit") continue;
                    const kill = v.hp <= dmg;
                    let s = kill ? 3.2 + aiThreat(v) * 0.5 : aiThreat(v) * 0.55;
                    const r2 = v.row + 1; // его база — ряд игрока
                    if (r2 < GRID && !unitAt(v.col, r2)) s += 0.9 + aiThreat(v) * 0.3;
                    if (s > bestScore) { bestScore = s; best = v; }
                }
                return best;
            };
            // Играбельность заклинания для ИИ (общие проверки цели/эффекта).
            // forReplay — проверка ПОВТОРА «Горящими рунами»: карта уже не в руке.
            // Играбельность заклинания для ИИ (общие проверки цели/эффекта).
            // forReplay — проверка ПОВТОРА «Горящими рунами»: карта уже не в руке.
            A.aiSpellPlayable = function aiSpellPlayable(def, forReplay = false) {
                const s = def.spell;
                if (s.copyLast) return aiReplayOk();
                if (s.sacrifice && !aiSacrificePick()) return false;
                // «Взрыв твари» (dec150) — есть своё существо с суммой ⚔+♥ 3+
                // (иначе карта переводится зря)
                if (s.beastBlast && !B.units.some((v) => v.side === "e"
                    && v.def.type === "unit"
                    && (v.curAtk || 0) + (v.hp || 0) >= 3)) return false;
                // «Извлечение тьмы» (dec153) — жертва с суммой ⚔+♥ 6+ либо
                // жетон 4+ (меньше энергии с тела не берём)
                if (s.darkExtract && !B.units.some((v) => v.side === "e"
                    && v.def.type === "unit"
                    && ((v.curAtk || 0) + (v.hp || 0) >= 6
                        || (v.token && (v.curAtk || 0) + (v.hp || 0) >= 4)))) return false;
                // «Тёмный контроль» (dec134) — есть чьё-то опасное существо
                // (угроза 4+): тряпку забирать не окупается даже со скидкой
                if (s.mindControl && !spellTargets(B.units.filter((v) =>
                    v.side === "p" && v.def.type === "unit"
                    && aiThreat(v) >= 4)).length) return false;
                // «Выбор местности» (dec156) — среди верхних 6 колоды должна
                // быть постройка, иначе карте нечего принести
                if (s.terrainScout && !aiTopCards(Math.min(s.terrainScout || 6,
                    B.eDeck.length)).some((m) =>
                    CARDS[m.id] && CARDS[m.id].type === "building")) return false;
                // «Кровавая луна» (dec160) — только при низкой энергии (1⚡ и
                // меньше) и запасе базы: ИИ оставляет себе минимум 2♥
                if (s.bloodMoon
                    && !(B.eEnergy <= 1
                        && B.enemyBase - 2 >= 1)) return false;
                // «Стена костров» — ряд должен окупаться (не на своих, просил
                // юзер); всем рядам в убыток — карту держим до подходящего поля
                if (s.firewall && aiFirewallRow() === null) return false;
                // «Испепеляющий луч» (hon180) — колонка должна окупаться,
                // иначе карту держим до подходящего поля
                if (s.columnDmg && aiColumnPick(s.columnDmg) === null) return false;
                // «Луч света» (hon179) — нужно хоть одно своё существо под
                // лечение цели (лечение базы само по себе карту не тянет)
                if (s.healPlayer && !B.units.some((v) =>
                    v.side === "e" && v.def.type === "unit")) return false;
                // «Раскалённые обломки» — 6 энергии: нужны 2+ цели либо снос
                // ценного (убиваемое существо с уроном 3+)
                if (s.aoeDmg) {
                    const hits = B.units.filter((v) => v.side === "p");
                    if (hits.length < 2 && !hits.some((v) =>
                        v.hp <= s.aoeDmg + altarBonus("e") && v.curAtk >= 3)) return false;
                }
                // «Рой светлячков» — 4⚡ за урон числом существ: играем при 2+ урона
                if (s.fireflies && spellHitDmg(def, "e") < 2) return false;
                // «Выстрел стихией Роста» — без карт Роста в руке урона нет
                if (s.growthHand && spellHitDmg(def, "e") < 1) return false;
                // «Цветение кристаллов» — разгон: играется при 4+ картах в руке
                if (s.energyPerHand && B.eHand.length < 4) return false;
                // «Мозговой штурм» (tim206): полная смена руки +1 карта —
                // окупается от трёх карт в руке
                if (s.brainstorm && B.eHand.length < 3) return false;
                // «Поток маны» — без своих ловушек энергии не даёт
                if (s.energyPerTrap && !B.traps.e.length) return false;
                // «Нехватка воздуха» — нужен хоть один урон у существ игрока
                if (s.debuffEnemyAtkAll && !B.units.some((v) =>
                    v.side === "p" && v.def.type === "unit" && v.curAtk > 0)) return false;
                // «Атака духами волков» — нужен стрелок, чья линия не бьёт своих
                if (s.wolfVolley && !aiWolfPick()) return false;
                // «Круговая атака» — своё существо впритык к врагу, и урон по
                // чужим должен окупать урон по своим (просил юзер: аккуратно)
                if (s.nova && !aiNovaPick()) return false;
                // «Ледяной удар» — нужен сосед-существо и выгодный размен
                if (s.iceStrike && !aiIceStrikeTarget()) return false;
                // «Культ кочерыжки» — нужна хоть одна пустая клетка под гоблинов
                if (s.cultRow && B.units.length >= GRID * GRID) return false;
                // «Толпа скелетов» — нужна хоть одна пустая клетка под скелетов
                if (s.skeletonCrowd && B.units.length >= GRID * GRID) return false;
                // «Поднять стяги!» — окупается при двух и более своих существах
                if (s.buffAllAtk
                    && B.units.filter((v) => v.side === "e" && v.def.type === "unit").length < 2) return false;
                // «Ковка оружия» (tim208) — есть кому: в этот ход уже
                // появлялись свои существа ИЛИ в руке есть призыв, который
                // выйдет сразу (эффективный «Сдвиг» 0 — «Машина времени»)
                if (s.forge
                    && !B.units.some((v) => v.side === "e" && v.def.type === "unit"
                        && v.bornTurn === B.turnNo)
                    && !B.eHand.some((id) => { const d = CARDS[id];
                        return d && d.type === "unit" && d.delay
                            && effDelayVal(d.delay, "e") <= 0; })) return false;
                // «Снабжение» (hon170) — выравнивание статов: играем, если
                // хотя бы одно своё существо выигрывает (⚔ ≠ ♥)
                if (s.rebalance && !B.units.some((v) => v.side === "e"
                    && v.def.type === "unit" && v.curAtk !== v.hp)) return false;
                // «Плен» (hon197) — карта призыва у игрока уже проверена
                // гейтом applySpellPInner-зеркала; ИИ-гейт: не жжём 1⚡ ради
                // жетона/мелочи — удаляемое должно стоить 3+ энергии
                if (s.captivate) {
                    const units = B.hand.filter((id) => CARDS[id]
                        && CARDS[id].type === "unit");
                    if (!units.some((id) => (CARDS[id].cost || 0) >= 3
                        || CARDS[id].rarity === "epic")) return false;
                }
                // «Воскрешение» (hon200) — в сбросе должна быть карта
                // призыва (не под «Ловушкой-пузырём») и пустая клетка призыва
                if (s.resurrect && !B.eDiscard.some((id) => CARDS[id]
                    && CARDS[id].type === "unit" && !bubbleBlocked("e", id)
                    && aiUnitSpot(CARDS[id]))) return false;
                // «Аура света» (hon199) — своё существо с соседом-врагом,
                // иначе свету некого жечь
                if (s.lightAura && !B.units.some((v) => v.side === "e"
                    && v.def.type === "unit" && B.units.some((w) =>
                        w.side !== "e" && w.def.type === "unit"
                        && Math.abs(w.col - v.col) + Math.abs(w.row - v.row) === 1))) return false;
                // «Бросок валуна» — метатель с уроном 3+ либо добивание базы;
                // слабым метателем карту не переводим — держим для сильного
                // из колоды (просил юзер: часть комбы в руке ждёт пару)
                if (s.baseHit) {
                    const throwers = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"));
                    if (!throwers.some((v) => v.curAtk >= 3 || v.curAtk >= B.playerBase)) return false;
                }
                // «Двойная атака» — берсерк платит жизнь за удар: вешаем
                // на сильного (3+ урона) и крепкого (3+ жизней), либо на уже
                // стоящего у базы врага (ряд 3+ — следующий марш в базу)
                if (s.berserk && !spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit"
                    && ((v.curAtk >= 3 && v.hp >= 3) || (v.row >= 3 && v.curAtk >= 2)))).length) return false;
                // «Запутать руны» — сброс обеих рук: играем, только если у
                // игрока карт больше, чем останется у нас после розыгрыша
                if (s.discardHandDraw && B.hand.length <= B.eHand.length - 1) return false;
                // добор-заклинание — тоже трата энергии; гасим только при полной руке
                if (s.draw && B.eHand.length >= HAND_MAX) return false;
                // огнешар при энергии 1..2 почти пуст (урон 0..1) — копим дальше
                if (s.drainAll && B.eEnergy < 3) return false;
                // «Гроза»: после оплаты цены должен остаться хотя бы 1⚡ удара
                // и хоть одна цель у игрока (иначе энергия сгорит впустую)
                if (s.stormAll && (B.eEnergy - effCost(cardIdOf(def), "e") < 1
                    || !aiDmgTargets(def).length)) return false;
                // «Поиск рун»: в верхних картах колоды должно быть заклинание
                if (s.search && !B.eDeck.slice(-s.search)
                    .some((id) => CARDS[id] && CARDS[id].type === "spell")) return false;
                // «Рунное гадание»: в верхних картах колоды должен быть призыв
                if (s.searchUnit && !B.eDeck.slice(-s.searchUnit)
                    .some((id) => CARDS[id] && CARDS[id].type === "unit")) return false;
                // «Поиск знаний»: брать нечего, если колода пуста
                if (s.seek && !B.eDeck.length) return false;
                // «Гримуар инея»: смотреть нечего, если колода пуста
                if (s.grim && !B.eDeck.length) return false;
                // «Природная мощь»: есть свой крепыш (3+ жизни) — иначе +1 урона
                // за энергию и карту не окупается
                if (s.buffAtkByHp && !spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.hp >= 3)).length) return false;
                // «Извлечение духа» — окупается, когда у цели 2+ свойств
                if (s.purge && !spellTargets(B.units.filter((v) => v.side === "p"))
                    .some((v) => countProps(v) >= 2)) return false;
                // «Похищение энергии» — крадём 2⚡, окупается при 2+⚡ у игрока
                if (s.stealEnergy && B.energy < s.stealEnergy) return false;
                // «Варка зелий» — в сбросах (своём или чужом) должно быть
                // заклинание, которое стоит тащить (саму Варку ИИ не берёт)
                if (s.discardPick && !spellsInDiscard("e").concat(spellsInDiscard("p"))
                    .some((id) => id !== "grw23")) return false;
                // «Поднятие мёртвых» — в своём сбросе должно быть существо
                if (s.raiseDead && !unitsInDiscard("e").length) return false;
                // «Пытка разума» — сбрасывать нечего, если рука игрока пуста
                // (свою ИИ не режет)
                if (s.mindTorture && !B.hand.length) return false;
                // «Запретные знания» (dec130) — ИИ берёт карты СЕБЕ, теряя
                // 2♥ базы: играем только со здоровой базой (5+♥) и не
                // пустой колодой (иначе тратим энергию вхолостую)
                if (s.forbidden && (B.enemyBase <= 4 || !B.eDeck.length)) return false;
                // «Негативный поток» — нужна цель: существо или добивание базы
                if (s.target === "anyUnitOrFoe"
                    && !spellTargets(B.units.filter((v) => v.def.type === "unit")).length
                    && B.playerBase > s.dmg) return false;
                // «Метка некроманта» (dec137) — вешаем на своё крепкое
                // существо (2+♥): метка на тряпку 0/1 не окупается
                if (s.exhumingMark && !spellTargets(B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.hp >= 2)).length) return false;
                // «Раскопки» — нужна своя постройка и постройка сброса ДОРОЖЕ
                // худшей своей (иначе обмен картой не окупается)
                if (s.excavate) {
                    const own = B.units.filter((v) => v.side === "e" && v.def.type === "building");
                    const back = B.eDiscard.filter((id) => CARDS[id] && CARDS[id].type === "building");
                    if (!own.length || !back.length) return false;
                    const worst = own.slice().sort((a, b) =>
                        (a.def.cost - b.def.cost) || (a.hp - b.hp))[0];
                    if (!back.some((id) => CARDS[id].cost > worst.def.cost)) return false;
                }
                // «Защитный кокон» — есть кому защищать и есть от кого: игрок
                // ходит первым, поэтому кокон на своего под удар реально спасает
                if (s.cocoon) {
                    const own = spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"));
                    const threat = own.some((v) => {
                        const a = unitAt(v.col, v.row + 1);
                        return a && a.side === "p" && a.def.type === "unit" && a.curAtk >= 2;
                    });
                    if (!own.length || !threat) return false;
                }
                // «Глубокое путешествие»: в верхних картах колоды должен быть призыв
                if (s.journey && !B.eDeck.slice(-Math.min(s.journey, B.eDeck.length))
                    .some((id) => CARDS[id] && CARDS[id].type === "unit")) return false;
                // «Смыв» — есть существо игрока (желательно не токен);
                // «Защита от заклинаний» отсеяна общим фильтром целей
                if (s.bounce && !spellTargets(B.units.filter((v) => v.side === "p"
                    && v.def.type === "unit")).length) return false;
                // «Рой ледо-пикси» — 4⚡ за 5 тел 1/1: держим, пока на поле
                // есть хотя бы 3 свободные клетки (иначе призыв почти пуст)
                if (s.iceSwarm && GRID * GRID - B.units.length < 3) return false;
                // «Молебен» — нечего призывать, если поле забито целиком
                if (s.laySummon && GRID * GRID - B.units.length < 1) return false;
                // «Слабость» — есть чей-то урон, который стоит снять
                if (s.debuffAtk && !spellTargets(B.units.filter((v) => v.side === "p"
                    && v.def.type === "unit" && v.curAtk > 0)).length) return false;
                // «Гидроудар» — есть чьё-то существо: урон 1 и сдвиг к базе
                if (s.hydroPunch && !spellTargets(B.units.filter((v) => v.side === "p"
                    && v.def.type === "unit")).length) return false;
                // усиление/очарование — только если есть своё существо под него
                // (огонь не дублируем; яд складывается — его можно докинуть);
                // «Смыв»/«Слабость»/«Ледяной удар»/«Гидроудар»/«Трупный яд»/
                // «Разложение» целятся в ИГРОКА — этот гейт их не касается
                if (s.target === "anyUnit" && !s.bounce && !s.debuffAtk && !s.iceStrike
                    && !s.hydroPunch && !s.poison && !s.destroy
                    && !spellTargets(B.units.filter((v) => v.side === "e"
                        && v.def.type === "unit"
                        && (!s.enchantFire || !v.enchantFire))).length) return false;
                // «Трупный яд» (dec144)/«Разложение» (dec145) — есть существо
                // игрока (сброс «Разложения» при пустой руке просто не
                // срабатывает — уничтожение остаётся)
                if ((s.poison || s.destroy) && !spellTargets(B.units.filter((v) => v.side === "p"
                    && v.def.type === "unit")).length) return false;
                // дротик/варево/огнешар — только если есть цель
                if (s.target === "anyUnitDmg" && !aiDmgTargets(def).length) return false;
                return true;
            };
            // ── Общая «сила карты» для поиска/варки/путешествия ───────────────
            // Раньше ИИ брал САМУЮ ВЕРХНЮЮ карту (или случайную), хотя правила
            // позволяют выбрать из верхних N. Теперь выбираем лучшую по вкладу:
            // статы/ауры у существ, урон/усиление/движки у заклинаний.
            // «Поиск рун»/«Варка зелий»: из доступных заклинаний — лучшее по
            // силе, с бонусом за играбельность прямо сейчас.
            A.aiSearchSpell = function aiSearchSpell(n) {
                let best = null, bestScore = -Infinity;
                for (const x of aiTopCards(n)) {
                    const d = CARDS[x.id];
                    if (!d || d.type !== "spell") continue;
                    let sc = aiCardPower(d);
                    if (aiSpellPlayable(d)) sc += 1.5;
                    if (sc > bestScore) { bestScore = sc; best = x; }
                }
                return best;
            };
            // «Рунное гадание»: из верхних призывов — лучший для текущего поля.
            // «Рунное гадание»: из верхних призывов — лучший для текущего поля.
            A.aiSearchUnit = function aiSearchUnit(n) {
                let best = null, bestScore = -Infinity;
                const animals = B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.def.creature === "animal").length;
                for (const x of aiTopCards(n)) {
                    const d = CARDS[x.id];
                    if (!d || d.type !== "unit") continue;
                    let sc = aiCardPower(d);
                    if (d.keeperScale) sc += animals * 0.35;
                    if (d.energyToStats) sc += Math.max(0, B.eEnergy - 1) * 0.2;
                    if (d.leaderAura && B.eHand.some((id) => isGoblin(CARDS[id]))) sc += 0.6;
                    if (sc > bestScore) { bestScore = sc; best = x; }
                }
                return best;
            };
            // «Глубокое путешествие»: 1 призыв из верхних N — берём лучший,
            // а не случайный. Если места на поле нет, карта хоть в руку.
            // «Глубокое путешествие»: 1 призыв из верхних N — берём лучший,
            // а не случайный. Если места на поле нет, карта хоть в руку.
            A.aiSummonPick = function aiSummonPick(n, allow = null) {
                let best = null, bestScore = -Infinity;
                const animals = B.units.filter((v) => v.side === "e"
                    && v.def.type === "unit" && v.def.creature === "animal").length;
                for (const x of aiTopCards(n)) {
                    const d = CARDS[x.id];
                    if (!d || d.type !== "unit") continue;
                    if (allow && !allow(x.id)) continue; // «Ловушка-пузырь» (wis119)
                    let sc = aiCardPower(d);
                    if (d.keeperScale) sc += animals * 0.35;
                    if (d.energyToStats) sc += Math.max(0, B.eEnergy - 1) * 0.2;
                    if (!aiUnitSpot(d)) sc -= 30; // поле забито — не выбираем
                    if (sc > bestScore) { bestScore = sc; best = x; }
                }
                return best;
            };
            // Повторять «Горящими рунами» стоит МОЩНОЕ: по базе, по площади,
            // стену костров, жертву, огнешар, волков или урон 2+. Усиление или
            // добор повторять — перевод карты: руны держим, пока не выйдет пара.
            // Повторять «Горящими рунами» стоит МОЩНОЕ: по базе, по площади,
            // стену костров, жертву, огнешар, волков или урон 2+. Усиление или
            // добор повторять — перевод карты: руны держим, пока не выйдет пара.
            A.aiReplayWorth = function aiReplayWorth(id) {
                const d = CARDS[id], s = d && d.spell;
                if (!s) return false;
                return !!(s.aoeDmg || s.baseDmg || s.firewall || s.sacrifice
                    || s.drainAll || s.fireflies || s.growthHand
                    || s.wolfVolley || s.nova || s.baseHit || s.iceStrike
                    || s.iceSwarm
                    || (s.dmg || 0) + altarBonus("e") >= 2);
            };
            // Есть ли смысл повторять последнее заклинание («Горящие руны»):
            // оно есть, это не сами руны, оно достойно повтора и применимо
            // Есть ли смысл повторять последнее заклинание («Горящие руны»):
            // оно есть, это не сами руны, оно достойно повтора и применимо
            A.aiReplayOk = function aiReplayOk() {
                const last = B.lastSpell.e;
                if (!last || last === "str25") return false;
                const def = CARDS[last];
                return !!def && def.type === "spell" && aiReplayWorth(last)
                    && aiSpellPlayable(def, true);
            };
            // Эффект заклинания врага — один код для прямого розыгрыша и для
            // повтора «Горящими рунами» (там эффект последнего заклинания,
            // free=true — цена повтора не вычитается из урона). focus —
            // приоритетная цель руны-ловушки: если заклинание умеет целиться
            // в это существо, бьёт именно его (просил юзер).
            // Скидка «Заклятого древоброда» (grw37): если целью вышел он,
            // aiPlay платит на 1 энергию меньше (флаг ставится здесь).
            A.castTargetOff = 0;
            // Флаг spellCasting на всё разрешение заклинания: damageUnit в
            // это время не наносит урон существам с «Защитой от заклинаний»
            // (u.spellWard, просил юзер)
        }
    };
})();
