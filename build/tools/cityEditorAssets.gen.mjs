// Генератор build/tools/cityEditorAssets.js — base64-снимок арта редактора
// городов (cityEditor.html). Зачем: при открытии редактора двойным кликом
// (file://) headed-Chrome считает картинки с file://-origin кросс-доменными,
// и WebGL бросает SecurityError на texImage2D — превью остаётся чёрным.
// Data-URL из снимка всегда «свой» — рисуется в любом происхождении.
//
// Запуск после изменения арта в build/images:
//   node build/tools/cityEditorAssets.gen.mjs
//
// Списки файлов синхронизированы с loadAssets() в cityEditor.html
// (sheets/WALL_NAMES/LAIR_OF/CATALOG парсятся отсюда же, деревья 1..10 и
// горы 1..6 — как в циклах loadAssets).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const tools = dirname(fileURLToPath(import.meta.url)); // build/tools
const buildDir = join(tools, "..");                    // build/

const edHtml = readFileSync(join(tools, "cityEditor.html"), "utf8");
const cityJs = readFileSync(join(buildDir, "scripts/game/city.js"), "utf8");

function reOne(re, s, what) {
    const m = s.match(re);
    if (!m) throw new Error("не нашёл в источнике: " + what);
    return m[1];
}
// листы заливки/воды/болот — массив `sheets` из loadAssets
const sheets = reOne(/const sheets = \[([^\]]*)\]/s, edHtml, "sheets")
    .match(/"([^"]+)"/g).map(s => s.slice(1, -1));
// имена тайлов стен — WALL_NAMES
const wallNames = reOne(/const WALL_NAMES = \[([^\]]*)\]/s, edHtml, "WALL_NAMES")
    .match(/"([^"]+)"/g).map(s => s.slice(1, -1));
// стихия-данжа → папка лэира — LAIR_OF
const lairBlock = reOne(/const LAIR_OF = \{([^}]*)\}/s, edHtml, "LAIR_OF");
const lairs = [...lairBlock.matchAll(/"([^"]+)"/g)].map(m => m[1]);
// каталог зданий — CITY_BLD_CATALOG из city.js
const catBlock = reOne(/CITY_BLD_CATALOG = \{([\s\S]*?)\};/, cityJs, "CATALOG");
const bldFiles = [...catBlock.matchAll(/file:\s*"([^"]+)"/g)].map(m => m[1]);
if (!sheets.length || !wallNames.length || !lairs.length || !bldFiles.length)
    throw new Error("пустой список арта — проверь парсинг источников");

// путь → base64 data-URL; ключ = путь от корня build/ (как в редакторе
// после срезания ведущих "../")
const files = [];
for (const n of sheets) files.push(`images/tiles/${n}.png`);
files.push("images/tiles/moats_64.png");
for (let n = 1; n <= 10; n++) files.push(`images/tiles/trees/${n}.png`);
for (let n = 1; n <= 6; n++) files.push(`images/tiles/montain/${n}.png`);
for (const f of bldFiles) files.push(`images/buildings/${f}`);
for (const lair of lairs)
    for (const nm of wallNames)
        files.push(`images/dungeon_tiles/${lair}/walls/${nm}.png`);

const out = [];
let total = 0, missing = 0;
for (const rel of files) {
    const p = join(buildDir, rel);
    if (!existsSync(p)) { console.warn("нет файла (пропущен): " + rel); missing++; continue; }
    const b = readFileSync(p);
    total += b.length;
    out.push(`    ${JSON.stringify(rel)}: "data:image/png;base64,${b.toString("base64")}",`);
}
if (missing) console.warn("пропущено файлов: " + missing);

const js = `// СГЕНЕРИРОВАНО скриптом build/tools/cityEditorAssets.gen.mjs — не править
// руками. base64-снимок арта редактора городов для запуска с file://
// (двойной клик): WebGL отвергает картинки с file://-origin (SecurityError
// на texImage2D). После изменения арта в build/images перегенерируй:
//   node build/tools/cityEditorAssets.gen.mjs
globalThis.CITY_ED_ASSETS = {
${out.join("\n")}
};
`;
writeFileSync(join(tools, "cityEditorAssets.js"), js);
console.log(`файлов: ${files.length - missing}/${files.length}, ` +
    `сырой арт: ${(total / 1024).toFixed(0)} КБ, ` +
    `выход: ${(Buffer.byteLength(js) / 1024).toFixed(0)} КБ → tools/cityEditorAssets.js`);
