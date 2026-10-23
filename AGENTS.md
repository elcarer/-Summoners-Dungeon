# AGENTS.md — «Развернутый Мир» (project3)

Карточный рогалик: открытый мир → подземелья → бои-карточные батлеры 5×5.
Чистый JS без сборки: PixiJS 8 + движок zero_engine, подключённый «как есть»
(`build/scripts/engine`). `package.json`/npm/CI/линтеров нет — не искать
бандлер, ничего не устанавливать.

## Правила работы

- Отвечай пользователю по-русски; доки и комментарии в репо — русский.
- Спеки и поправки юзер присылает в чат — они приоритетнее PLAN.md и README
  (README — обзор, может отставать; актуальная правда и история — HANDOFF.md).
- Git: завершил волну — обнови HANDOFF.md (журнал волн), коммить и пуш
  `build/`, `PLAN.md`, `README.md`, `HANDOFF.md`. `for_work/` в git НЕ входит
  (тесты, пробы, скрины, арт-исходники). Присланный юзером арт/тайлы —
  ОТДЕЛЬНЫМ артовым коммитом, без смешивания с кодом.
- Заметки юзера в корне (`баги_заметки_поправки.txt`, `колоды_врагов.txt`,
  `промпты.txt`) и спека карт `for_work/cards.txt` — входные материалы
  текущей волны; в git их не тащить без просьбы юзера.
- Темп: узкая проба только на НОВЫЕ механики волны (старые пробы без нужды
  не гонять) → HANDOFF.md → коммит/пуш.
- Полный смоук (`for_work/smoke.sh`) запускать ТОЛЬКО по явному распоряжению
  юзера. Без такого распоряжения в конце волны достаточно точечной пробы.

## Запуск и тесты

- Игра: `python build/dev_server.py 8147` → http://127.0.0.1:8147/index.html
  (`/tools/cards.html` — картотека). Сервер строго ThreadingHTTPServer:
  однопоточный ронял параллельные `<script>` («… is not defined»).
- Полный смоук (только по явному распоряжению юзера):
  `bash for_work/smoke.sh` (Git Bash; ~700 проверок, ~2 мин):
  сервер 8147 + headless Chrome 9333 + watchdog `for_work/runtest.sh`,
  лог `/tmp/test_out.log`, печатает `ИТОГ pass=N fail=N`.
- Точечные пробы: пишутся файлами в `for_work/probe_*.mjs` (импорт `../cdp.mjs`),
  запуск `node for_work/probe_*.mjs` со своими портами сервера/Chrome; в конце
  обязательно `process.exit(0)` — иначе node висит (открытый WebSocket).
- НИКОГДА не запускать смоук и пробы параллельно: общие порты 8147/9333,
  второй сервер молча не биндится. Перед смоуком убить свои headless-хромы.
- Линтеров/тайпчека нет — верификация только смоук/пробы и реальные клики.

## Устройство

- `build/` — вся игра (корень dev-сервера): `index.html`, `scripts/game/`,
  `images/`, `sound/`, `dll/pixi.min.js`, `tools/cards.html`. Порядок
  `<script>` в `index.html` ВАЖЕН: `data/units.js` до `engine.js`,
  `cardsData.js` до `dataCards.js`, игровые скрипты в конце body (main ищет `#boot`).
- Код игры: `loc` (все тексты RU/EN, строки только отсюда), `meta`
  (localStorage: `sd_settings`, `sd_meta` — коллекция/колоды/герои, `sd_run` —
  забег), `cardsData` (ЧИСТЫЕ ДАННЫЕ карт/героев → `GAME_CARD_DATA`; его же
  читает cards.html), `dataCards` (логика: архетипы врагов, enemyDeck, пулы
  наград/добора, магазин → `GAME_DATA`), `uiKit`, `world` (открытый мир),
  `dungeon` (этажи, генератор, объекты), `arenaCore` + модули `arena*`
  (бой: Cards/Board/Combat/Hand/Panels/Hud/Flow/AI/Actions/Scene/Api;
  `arena.js` — только сборка), `deckScene`/`rewardScene`/`draftScene`/
  `settingsScene`, `main` (бут, меню, выбор героя, сцены).
- Сцены — через `createScenes`; UI-координаты — дизайн 1920×1080 (letterbox);
  для кликов переводить `__GAME.toScreen(x,y)`, в сценах карт — `worldToScreen`.
- Смена геометрии/раскладки этажа → поднять `MAP_V` (`GAME_DUNGEON.MAP_V`):
  сейвы другой версии пересобираются автоматически.
- Новая карта: арт-лицо `images/cards/<elem>/<N>.png` (готовое 230×338),
  данные в `cardsData.js`, строки в loc, веса в пулы (`REWARD_POOLS`,
  `ENEMY_FILLS`, архетипы) и нули в DEFAULT_COLLECTION. Содержание (в т.ч.
  подтип и `kind`) — ТОЛЬКО из спеки `for_work/cards.txt`;
  `creature` — плейсхолдер спрайт-листа, НЕ подтип.
- Новые UI-картинки — в список предзагрузки `UI_FILES` в main.js, иначе
  `uiTex` бросит исключение и бут умрёт.
- Листы существ: `images/sprites/<имя>_256.png`, сетка 256×256, 4 ряда
  front/back/right/left × 6 кадров + json-манифест; карта выбирает лист полем
  `def.sheet`, лист регистрируется в `creatureSheets` (main.js).

## Харнесс и грабли

- `cdp.mjs` (корень) — мини-CDP драйвер: `connect/evalJs/shot/mouse`; порт
  `CDP_PORT` (дефолт 9333).
- Headless с `--window-size=1300,760` даёт вьюпорт 1284×665: клики только через
  `toScreen`/`worldToScreen`, по дизайн-координатам «в лоб» — мимо.
- `evalJs` дольше ~30с убивается CDP; `node -e` с кавычками молча ломается —
  пробы писать файлами. Бут страницы ждать по `__GAME && __GAME.ready`
  (без цикла reload — страница не успевает подняться).
- Тест-хуки: `window.__GAME` — `stats()`, `menu`, `heroPick`, `arenaApi`,
  `deckApi`, `rewardApi`, `settingsApi`, `draftApi`, `worldApi`, `dungeon`,
  `loc`, `audio`, `test` (setHeroPos/COMPONENTS); `window.__CARDSDB` —
  картотека; `window.__gameError` — ошибка страницы. «Тихие» ошибки в update
  сцен видны ТОЛЬКО в console (scenes.js их глотает).
- Pixi v8 здесь: Text/Graphics по умолчанию перехватывают клики (текстам-
  оверлеям `eventMode="none"`); `destroy()` не отцепляет узел от родителя;
  pointertap требует down+up на ОДНОМ объекте (поля — одна зона + ручной
  разбор координат).
- Полный свод ловушек («СВОД ЛОВУШЕК»), правила боя («Правила боя (актуальные)»)
  и журнал волн — в HANDOFF.md; перед правкой боя/карт сверяться с ним.
