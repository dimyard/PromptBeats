# IMPLEMENTATION_LOG.md — журнал реализаций

Живой реестр: **что сделано, где лежит, как использовать**. Каждый агент дописывает запись после законченной
единицы работы. **Новые записи — сверху.** Старые не переписываем.

Как заполнять: скопируй блок из «Шаблона записи», вставь под этой строкой, заполни. Держи раздел
«Статус компонентов» в актуальном состоянии.

---

## Статус компонентов (держать актуальным)
| Компонент | Владелец | Статус | Публичный интерфейс | Где |
|-----------|----------|--------|---------------------|-----|
| Song JSON + схема | все | ✅ готов (v1) | `song.schema.json` | корень |
| Фикстура-мок | все | ✅ готов | `sample-song.json` | корень |
| Бэк `/api/compose` | B | ✅ готов | `POST /api/compose`, `GET /api/catalog` | `backend/` |
| LLM-промт + валидатор | B | ✅ готов (multi-provider + few-shot + proxy) | `backend/src/llm.js`, `backend/src/providers.js` | `backend/` |
| Player (Tone.js) | C | ✅ engine + sampler готовы | `createPlayer()` | `frontend/src/player/` |
| Чат-UI + состояние | A | 🟡 рабочий базовый | — | `frontend/` |
| Грид дорожек | A | 🟡 базовый | — | `frontend/src/App.jsx` |
| Экспорт WAV (растяжка) | C | ⬜ не начат | `player.exportWav()` | `frontend/src/player/` |

Легенда: ⬜ не начат · 🟡 в работе · ✅ готов · ⚠️ есть отклонение/баг (см. запись).

---

## Шаблон записи (копировать)
```
### [ДАТА] · [Компонент] · [автор/агент]
- **Что сделано:** …
- **Где:** файлы/пути …
- **Публичный интерфейс:** эндпоинт / экспорт / сигнатура …
- **Как использовать:** пример импорта/вызова/запроса …
- **Отклонения от контракта:** нет / описание (+ обновлён ли CONTRACTS.md)
- **Известные баги / TODO:** …
```

---

## Записи

### 2026-07-11 · Hardening-пасс бэкенда B — реализовано · B
- **Что сделано:** выполнен анонсированный ниже пасс (надёжность/защиты/DX/качество LLM). Всё за env-флагами,
  дефолты сохраняют прежнее поведение; контракт `/api/compose` и Song JSON не менялись.
  - **Надёжность:** таймаут `LLM_TIMEOUT_MS` (30s, fail-fast); ретрай транзиентных 429/5xx/сеть с backoff и `Retry-After`
    (модуль `retry.js`, отдельно от валидационного ретрая); детект обрезания (`max_tokens`) → чёткая ошибка; `LLM_MAX_TOKENS` конфиг.
  - **Защиты:** `MAX_PROMPT_CHARS`/`MAX_SONG_CHARS` → `400`; санитизация ошибок клиенту (полный текст — только в лог сервера);
    opt-in rate-limit (`RATE_LIMIT_ENABLED` → `rate_limited`/429, модуль `ratelimit.js`).
  - **DX:** `GET /api/health`; fail-fast конфига на старте + summary-лог; лог-строка на запрос (mode/provider/model/латентность/исход).
  - **Качество LLM:** `LLM_TEMPERATURE=0.4`; `normalizeSong` дропает события со `step` вне лупа и дедупит `id` (со счётчиками в лог).
- **Где:** новые `backend/src/retry.js`, `backend/src/ratelimit.js`; правки `backend/src/{providers,server,validate,compose}.js`;
  `backend/.env.example`; тесты `backend/test/*.test.mjs` + `npm test`.
- **Публичный интерфейс:** без несовместимых изменений. Аддитивно: `GET /api/health` + опц. `rate_limited`/429 (см. `CONTRACTS.md`).
- **Как использовать:** `cd backend && npm test` (14 тестов). Тюнинг — новые env в `.env.example`. Дефолты = прежнее поведение.
- **Отклонения от контракта:** нет. Аддитивные пометки уже в `CONTRACTS.md`.
- **Проверено:** `npm test` 14/14 зелёные; HTTP-смоук (mock): health-shape, лимиты→`400`, rate-limit→`429`, fail-fast→exit 1;
  боевой Anthropic через прокси — валидный Song (128 BPM, ~4s).
- **Известные баги / TODO:** таймаут не ограничивает чтение тела ответа (только установление/заголовки); rate-limit in-memory (один процесс).

### 2026-07-11 · Design tokens для импорта/экспорта · A / UX-Front
- **Что сделано:** добавлен отдельный машинно-читаемый файл дизайн-токенов PromptBeats: цвета, шрифты, spacing,
  radius, semantic aliases, states, component hints и export map для CSS/Figma-like импорта.
- **Где:** `docs/design/promptbeats.design-tokens.json`.
- **Публичный интерфейс:** изменений runtime-контрактов нет; это дизайн-артефакт для будущего этапа 3.
- **Как использовать:** брать JSON как source of truth; из `exports.css.variables` можно сгенерировать `:root`, а
  `tokens.semantic`/`tokens.state` использовать для адаптивного visual layer.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** генератор `tokens.css` пока не добавлен; при необходимости сделать отдельным маленьким скриптом.

### 2026-07-11 · Windows fix для one-command launcher · Codex
- **Что сделано:** исправлен `spawn EINVAL` при `npm run dev` в Windows PowerShell. Launcher теперь запускает `npm`
  через shell на Windows и корректно останавливает второй dev-сервер, если первый не стартовал или завершился.
- **Где:** `scripts/dev.js`, `IMPLEMENTATION_LOG.md`.
- **Публичный интерфейс:** без изменений: `npm run dev` из корня проекта.
- **Как использовать:** выполнить `npm run dev`; при остановке `Ctrl+C` скрипт завершает backend и frontend вместе.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** нет.

### 2026-07-11 · Валидация ручной перезагрузки Song · C
- **Что сделано:** Player выровнен с ограничениями Song JSON: BPM клампится до `40..220`, количество тактов — до
  `1..32`. Smoke-check дополнен сценарием ручной правки BPM, mute и gain через полный `player.load(updatedSong)`.
- **Где:** `frontend/src/player/index.js`, `frontend/src/player/MANUAL_SMOKE_CHECK.md`.
- **Публичный интерфейс:** без изменений. A использует существующие `player.load(song)` и Song-поля `bpm`,
  `tracks[].muted`, `tracks[].gain`.
- **Как использовать:** A создаёт новый Song JSON с нужными полями и вызывает `await player.load(updatedSong)`;
  при активном воспроизведении Player пересобирает граф и продолжает игру.
- **Отклонения от контракта:** нет; `CONTRACTS.md` уже описывает этот поток, поэтому не менялся.
- **Проверено:** сценарий добавлен в browser smoke-check; синтаксис и сборка проверяются перед коммитом.
- **Известные баги / TODO:** редактирование `key` отложено; Player не транспонирует абсолютные ноты при изменении
  метаданных тональности.

### 2026-07-11 · Мгновенный Stop · C
- **Что сделано:** Stop теперь не только останавливает `Tone.Transport`, но и за 5 мс приглушает выход каждой
  дорожки. Уже запущенные synth и sampler-хвосты больше не доигрываются после нажатия кнопки.
- **Где:** `frontend/src/player/index.js`.
- **Публичный интерфейс:** без изменений: `player.stop()`.
- **Как использовать:** UI вызывает `player.stop()` как раньше; при следующем `player.play()` уровни дорожек
  восстанавливаются из последнего загруженного Song JSON.
- **Отклонения от контракта:** нет.
- **Проверено:** `node --check frontend/src/player/index.js`, `git diff --check`.
- **Известные баги / TODO:** ручные контролы BPM, key, mute и gain должны реализовываться в UI роли A через правку
  Song JSON и повторный `player.load(updatedSong)`.
### 2026-07-11 · [АНОНС] Hardening-пасс бэкенда B (запланировано, код ещё не влит) · B
- **Что будет сделано:** серия обратно совместимых доработок gateway+LLM. Всё за env-флагами, дефолты сохраняют текущее поведение.
  - **Надёжность:** таймаут LLM (`LLM_TIMEOUT_MS=30000`); ретрай транзиентных ошибок провайдера 429/5xx/сеть с backoff
    (отдельно от валидационного ретрая, уважает `Retry-After`); детект обрезания (`finish_reason=length` → чёткая ошибка);
    `LLM_MAX_TOKENS` конфигурируем (деф. 4096).
  - **Защиты:** лимиты входа (`MAX_PROMPT_CHARS=2000`, `MAX_SONG_CHARS=20000` → `400 bad_request`); санитизация ошибок клиенту
    (тело провайдера — только в лог сервера); опц. rate-limit (`RATE_LIMIT_ENABLED=false` → код `rate_limited`/429).
  - **DX:** `GET /api/health`; валидация конфига на старте (нет ключа под провайдера → понятный отказ на boot);
    лог-строка на запрос (provider/model/mode/латентность/ретраи/исход).
  - **Качество LLM:** `LLM_TEMPERATURE=0.4`; авто-нормализация в `normalizeSong` (дроп событий со `step` вне лупа + дедуп `id`,
    с подсчётом в лог). Несуществующий `sound`/неверная пара `instrument↔sound` — НЕ чиним, остаются ошибкой → ретрай.
- **Где (только `backend/`, чужие зоны не трогаю):** новые `backend/src/retry.js`, `backend/src/ratelimit.js`;
  правки `backend/src/{server,providers,validate}.js`; `backend/.env.example`; тесты на `node --test` в `backend/test/`.
- **Публичный интерфейс:** `POST /api/compose` и форма Song JSON — **БЕЗ ИЗМЕНЕНИЙ**. Аддитивно: `GET /api/health` +
  опц. код `rate_limited`/429 (задекларировано в `CONTRACTS.md`, Контракт 2).
- **Как использовать:** поведение по умолчанию прежнее; тюнинг — через новые env (появятся в `.env.example`).
- **Отклонения от контракта:** несовместимых нет. Аддитивные пометки внесены в `CONTRACTS.md`.
- **Известные баги / TODO:** это **анонс намерения** — предупреждение команде перед реализацией. По завершении добавлю запись «сделано».

### 2026-07-11 · Claude Design prompt для этапа 3 · A / UX-Front
- **Что сделано:** подготовлен отдельный русскоязычный промпт для Claude Design под будущий этап 3: ручные контролы
  дорожек, track lanes, inspector, transport и visual polish без старых `pattern`/`notes`.
- **Где:** `docs/design/STAGE3_CLAUDE_DESIGN_PROMPT.md`.
- **Публичный интерфейс:** изменений нет; это дизайн-артефакт для следующего этапа.
- **Как использовать:** перед стартом этапа 3 передать файл в Claude Design и брать из результата только UI-паттерны,
  совместимые с `tracks[].events` и ручными правками через `player.load(updatedSong)`.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** этап 3 не начат; после получения нового макета нужно выбрать минимальный переносимый scope.

### 2026-07-11 · One-command dev launcher · Codex
- **Что сделано:** добавлен запуск проекта одной командой из корня: `npm run dev`. Скрипт создаёт `backend/.env`
  из `.env.example`, если файла ещё нет, устанавливает зависимости backend/frontend при отсутствующем `node_modules`
  и параллельно запускает оба dev-сервера.
- **Где:** `package.json`, `scripts/dev.js`, `README.md`.
- **Публичный интерфейс:** контрактов нетронуто; новый dev-интерфейс — корневой npm script `dev`.
- **Как использовать:** из корня проекта выполнить `npm run dev`; backend слушает `:3001`, frontend — `:5173`.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** если `node_modules` уже есть, скрипт не переустанавливает зависимости автоматически
  после изменения package-lock; в таком случае вручную выполнить `npm install` в нужной папке.

### 2026-07-11 · README PowerShell quick start · Codex
- **Что сделано:** добавлена отдельная инструкция запуска для старого Windows PowerShell, где `&&` не поддерживается.
- **Где:** `README.md`.
- **Публичный интерфейс:** изменений нет.
- **Как использовать:** запускать backend и frontend пошаговыми командами из блока `powershell`: `cd backend`,
  `npm install`, `Copy-Item .env.example .env`, `npm run dev`; затем во втором терминале `cd frontend`,
  `npm install`, `npm run dev`.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** нет.

### 2026-07-11 · Прокси для запросов к LLM · B
- **Что сделано:** добавил опциональную маршрутизацию запросов к провайдерам через прокси. Включается env-переменной
  `LLM_PROXY` (или стандартными `HTTPS_PROXY`/`HTTP_PROXY`), поддержаны http/https-прокси и креды `user:pass@`.
  Прокси-URL резолвится лениво один раз, `ProxyAgent` переиспользуется (пул соединений), креды маскируются в логе.
  **Важно (проверено эмпирически на Node 25.2.1):** глобальный `fetch` игнорирует прокси-env; нативный
  `--use-env-proxy` HTTPS-трафик здесь НЕ проксировал; `ProxyAgent` из пакета + глобальный `fetch` падает
  (`invalid onRequestStart`, скос внутренних версий). Рабочая связка — **`fetch` и `ProxyAgent` из одного пакета
  `undici`**. Поэтому адаптеры переведены на `undici.fetch`.
- **Где:** `backend/src/providers.js` (импорт `undici`, `getDispatcher()`+`llmFetch()`, три адаптера зовут `llmFetch`),
  `backend/.env.example` и `backend/.env` (доки `LLM_PROXY`), `backend/package.json` (+ dep `undici ^8`).
- **Публичный интерфейс:** не изменился (`/api/compose`, `generateSong`). Новое — env `LLM_PROXY`.
- **Как использовать:** в `backend/.env` задать `LLM_PROXY=http://host:port` (или экспортировать `HTTPS_PROXY`);
  без переменной поведение прежнее (прямые запросы). При активном прокси в лог пишется `[llm] routing ... via proxy ...`.
- **Отклонения от контракта:** нет.
- **Проверено:** прокси на мёртвый порт → `ECONNREFUSED` именно на адрес прокси (значит трафик идёт в прокси);
  без прокси → запрос уходит на хост провайдера; `mock`-пайплайн (generate+edit) остаётся зелёным; `node --check` ок.
- **Боевой прогон:** ✅ реальный Anthropic (`claude-haiku-4-5`) через прокси заказчика — generate + edit вернули
  валидный по схеме Song с осмысленным `message` на языке промта (~5.8s на оба вызова).
- **Известные баги / TODO:** правит запись ниже — утверждение «новых npm-зависимостей нет» больше неактуально
  (добавлен `undici`). SOCKS-прокси не поддержан (`ProxyAgent` умеет только http/https).

### 2026-07-11 · LLM-шлюз: реальный вызов вместо STUB · B
- **Что сделано:** заменил заглушку в `llm.js` реальным LLM-вызовом. Сделал слой **провайдер-агностичным** —
  провайдер и модель выбираются через `.env`, без правок кода. Поддержаны **anthropic / openai / gemini** и
  `mock` (offline, без ключа — для смоука и демо). Собран system-промт (строго по схеме + каталог + drum-map +
  жёсткие инварианты, «только JSON-обёртка `{message, song}` без markdown»), 3 few-shot (2 генерация + 1 правка),
  устойчивый парсер (срезает ```-ограждения и текст вокруг, принимает обёртку и «голый» Song). На ретрае
  `previousErrors` вкладываются в user-сообщение.
- **Где:** `backend/src/llm.js` (промт+few-shot+парсинг+`generateSong`), `backend/src/providers.js` (адаптеры+выбор
  провайдера), `backend/.env.example` (LLM_PROVIDER/LLM_MODEL/ключи). `compose.js`/`validate.js`/`server.js` не менял.
- **Публичный интерфейс:** контракт не изменён. `generateSong({prompt, song, previousErrors}) → {song, message}`;
  `POST /api/compose`, `GET /api/catalog` — как в CONTRACTS.md.
- **Как использовать:** `cd backend && npm i && cp .env.example .env` → задать `LLM_PROVIDER` + соответствующий ключ
  (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`), опц. `LLM_MODEL`; `npm run dev`. Дефолт — `anthropic`
  (`claude-haiku-4-5`). Без ключа: `LLM_PROVIDER=mock`. Проверка — curl из брифа.
- **Отклонения от контракта:** нет. Форму Song JSON / HTTP API / схему не трогал.
- **Проверено:** offline-скрипт — все 3 few-shot валидны по схеме; `extractJson`/`parseResponse` (обёртка/фенсы/
  голый Song/ошибка) ок; `compose` generate+edit на mock → валидный Song, bpm парсится, `message` непустой.
  HTTP-смоук (`PORT=3011`, mock): `/api/catalog` ок, generate ок, пустой body → `400 bad_request`.
- **Известные баги / TODO:** `max_tokens=4096` — для очень плотных 32-тактовых треков может быть мало. Anthropic без
  нативного JSON-mode — держимся на строгом промте + ретрае (OpenAI/Gemini включают json-mime).

### 2026-07-11 · Player + sampler engine · C
- **Что сделано:** плеер теперь выбирает synth/kit по `track.instrument`, защищённо обрабатывает неизвестные sound,
  применяет `gain`, `muted`, `sound` и `events` при каждом идемпотентном `load(song)`; события вне лупа репортятся,
  длительность клампится. Убрана глобальная очистка чужих Transport-событий. Добавлены различимые автономные киты
  `lofi_kit`, `house_kit`, `trap_kit`, все ноты Drum note map и fallback неизвестной drum-ноды на kick.
- **Где:** `frontend/src/player/index.js`, `frontend/src/player/sounds.js`,
  `frontend/src/player/MANUAL_SMOKE_CHECK.md`.
- **Публичный интерфейс:** без изменений: `import { createPlayer } from "./player/index.js"`; методы
  `load`, `play`, `stop`, `isPlaying`, `on`, `dispose` соответствуют `CONTRACTS.md`.
- **Как использовать:** `const player = createPlayer(); await player.load(song); await player.play();`.
  Ручные контролы A меняют поля дорожек в Song JSON и вызывают `await player.load(updatedSong)`.
- **Отклонения от контракта:** нет; киты синтезированы локально, поэтому не требуют лицензируемых аудиофайлов.
- **Проверено:** `node --check` для обоих аудиомодулей, `git diff --check`; browser smoke-сценарий описан в
  `frontend/src/player/MANUAL_SMOKE_CHECK.md`.
- **Известные баги / TODO:** `exportWav()` пока не реализован (опциональный метод контракта); в текущей среде
  production-сборка Vite не получила ответ от проверки разрешений, поэтому остаётся прогнать `npm run build`
  и браузерный smoke-check на машине разработчика.

### 2026-07-11 · Этап 2 фронта: fallback, ошибки и demo UX · A / UX-Front
- **Что сделано:** добавлены fallback «Пример» на `sample-song.json`, видимые backend/player ошибки через toast и
  историю, автоскролл чата, demo prompt chips, статус `Пусто/Генерация/Готово/Играет`, отдельный Play/Stop transport
  и более читаемый grid дорожек по `tracks[].events`.
- **Где:** `frontend/src/App.jsx`, `frontend/src/styles.css`, `frontend/package-lock.json`.
- **Публичный интерфейс:** контрактов нетронуто; фронт по-прежнему использует `compose(prompt, currentSong)` и
  `createPlayer().load/play/stop/on`.
- **Как использовать:** `cd frontend && npm install && npm run dev`, открыть `http://127.0.0.1:5173/`.
  Для демо без бэка нажать «Пример», затем `Play`. Для ошибки бэка отправить prompt при выключенном backend.
- **Отклонения от контракта:** нет.
- **Проверено:** `npm run build` проходит; локальный Vite отвечает `HTTP 200` на `http://127.0.0.1:5173/`.
- **Известные баги / TODO:** этап 3 — ручные контролы `mute/gain/step edit`, каталог звуков и более глубокая полировка grid.

### 2026-07-11 · Этап 1 фронта: ревизия A · A / UX-Front
- **Что сделано:** выполнена ревизия текущего `frontend/` перед кодингом: проверены `App.jsx`, `api.js`, README,
  `sample-song.json`, контракт Player и brief A; зафиксированы соответствия, пробелы и очередь этапа 2.
- **Где:** `docs/frontend/STAGE1_FRONTEND_AUDIT.md`.
- **Публичный интерфейс:** изменений нет.
- **Как использовать:** открыть audit-док перед началом этапа 2; он перечисляет, что уже работает и какие фронтовые
  задачи нужно делать первыми.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** перейти к этапу 2: fallback «Пример», error UX, улучшенный grid и ручные контролы дорожек.

### 2026-07-11 · Sampler engine и ручные контролы · C/A contract docs
- **Что сделано:** явно добавлен sampler/kit слой в контракт и brief C; для A описаны ручные контролы дорожек.
- **Где:** `CONTRACTS.md`, `briefs/BRIEF_C_PLAYER.md`, `briefs/BRIEF_A_FRONTEND.md`.
- **Публичный интерфейс:** без новых методов Player. Ручная настройка MVP идёт через правку Song JSON
  (`track.muted`, `track.gain`, `track.sound`, `track.events`) и повторный `player.load(updatedSong)`.
- **Как использовать:** A меняет `currentSong` контролами UI и вызывает `player.load(updatedSong)`; C гарантирует
  sampler/kit playback для `instrument: "sampler"` по Drum note map и применяет `gain/muted/sound/events` при `load`.
- **Отклонения от контракта:** нет; `song.schema.json` не менялся, потому что новые требования используют уже существующие поля.
- **Известные баги / TODO:** реализовать более различимые киты и, при наличии чистых лицензий, реальные samples через `Tone.Sampler`.

### 2026-07-11 · Синхронизация UX-доков с Song JSON events · A / UX-Front
- **Что сделано:** Claude Design prompt и UX-ресерч приведены к актуальному контракту: все дорожки рисуются из
  `tracks[].events`, старые поля `pattern`/`notes` явно запрещены, `role` указан как обязательный.
- **Где:** `docs/design/DESIGN_RESEARCH.md`, `docs/design/CLAUDE_DESIGN_PROMPT.md`.
- **Публичный интерфейс:** изменений контрактов нет; документы теперь соответствуют `CONTRACTS.md` и `song.schema.json`.
- **Как использовать:** брать `docs/design/CLAUDE_DESIGN_PROMPT.md` для Claude Design без дополнительной ручной правки схемы.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** после макета проверить, что UI не ожидает `pattern`/`notes` и работает только с `events`.

### 2026-07-11 · Уточнение контрактов (6 правок по ревью) · setup
- **Что сделано:** закрыты 6 замечаний по контрактам до старта B.
  1. `role` теперь обязателен (schema `required` + CONTRACTS).
  2. Инвариант `step < bars*16` — уже был в `validate.js`; C теперь пропускает/репортит события вне лупа.
  3. `step + dur <= bars*16` — бэк нормализует (`normalizeSong` клампит `dur`), C клампит защитно.
  4. Пары instrument↔sound — жёсткий инвариант в схеме через `if/then` (synth→синты, sampler→киты).
  5. Payload'ы событий плеера зафиксированы: `step→number`, `ready→{totalSteps}`, `error→{code,message,details?}`.
  6. `on(...)` возвращает unsubscribe-функцию (React-safe).
- **Где:** `song.schema.json`, `CONTRACTS.md`, `backend/src/validate.js` (+`compose.js`), `frontend/src/player/index.js`, `frontend/src/App.jsx`.
- **Как использовать:** без изменений в вызовах; `on()` теперь можно (нужно) отписывать: `const off = player.on(...); off()`.
- **Отклонения от контракта:** нет — контракт и код синхронны.
- **Проверено:** sample валиден; missing role / synth+kit / sampler+synth-sound — отклоняются; `dur 20→2` клампится;
  compose generate/edit зелёные; player/App парсятся (esbuild). Пофикшена TDZ-коллизия `song` в compose.js.
- **Известные баги / TODO:** без изменений (B: реальный LLM; C: сэмпл-киты/exportWav; A: полировка UI).

### 2026-07-11 · UX/UI-ресерч и Claude Design prompt · A / UX-Front
- **Что сделано:** подготовлены русскоязычные материалы для роли A: UX/UI-ресерч, дизайн-направление, layout,
  состояния интерфейса, демо-нарратив и готовый промпт для Claude Design.
- **Где:** `docs/design/DESIGN_RESEARCH.md`, `docs/design/CLAUDE_DESIGN_PROMPT.md`.
- **Публичный интерфейс:** нет изменений в кодовых контрактах; материалы описывают ожидаемый UX вокруг
  существующих `Song JSON`, `/api/compose` и `createPlayer()`.
- **Как использовать:** открыть `docs/design/CLAUDE_DESIGN_PROMPT.md`, передать текст в Claude Design и использовать
  результат как ориентир для полировки `frontend/`. Детали обоснования и референсы — в `docs/design/DESIGN_RESEARCH.md`.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** после получения макета сверить его с текущим `frontend/src/App.jsx` и решить, что реально
  успеваем внедрить за оставшееся время.

### 2026-07-11 · Скелет проекта (backend + frontend + player) · setup
- **Что сделано:** рабочий end-to-end каркас по контрактам. Запускается на заглушке LLM.
- **Где:** `backend/` (server/compose/validate/llm/catalog), `frontend/` (Vite+React, `src/App.jsx`, `src/api.js`),
  `frontend/src/player/` (`index.js`, `sounds.js`), корневые `README.md`, `.gitignore`.
- **Публичный интерфейс:** `POST /api/compose`, `GET /api/catalog`; `createPlayer()`; `api.compose()/getCatalog()`.
- **Как использовать:** `cd backend && npm i && npm run dev` (:3001); `cd frontend && npm i && npm run dev` (:5173).
  Чат → `/api/compose` → `player.load(song)` → play. Правка = тот же вызов с текущим song.
- **Отклонения от контракта:** нет. Проверено: backend compose (generate/edit/invalid) — зелёное;
  все src-файлы фронта парсятся (esbuild).
- **Известные баги / TODO:**
  - B: заменить STUB в `backend/src/llm.js` реальным LLM (система-промт + few-shot + JSON-only). Ретрай с
    ошибками валидации уже прокинут через `previousErrors`.
  - C: киты сейчас синтезированные (без сэмплов); при желании перевести на `Tone.Sampler`; сделать `exportWav()`.
  - A: полировка UI/истории/тостов, кнопка «Пример» как фолбэк.

### 2026-07-11 · Контракты и фикстуры · setup
- **Что сделано:** заведены контракты и общий мок для старта.
- **Где:** `CONTRACTS.md`, `song.schema.json`, `sample-song.json`, `AGENTS.md`, этот журнал.
- **Публичный интерфейс:** Song JSON v1; `POST /api/compose`; `GET /api/catalog`; `createPlayer()` — все описаны в `CONTRACTS.md`.
- **Как использовать:** кодить против `CONTRACTS.md`; мокать чужие части через `sample-song.json`;
  валидировать JSON командой из `AGENTS.md` §6.
- **Отклонения от контракта:** нет.
- **Известные баги / TODO:** реализовать три компонента (B/C/A). Отметить прогресс здесь.
