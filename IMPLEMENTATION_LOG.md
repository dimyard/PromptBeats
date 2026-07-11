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
| Бэк `/api/compose` | B | 🟡 каркас готов | `POST /api/compose`, `GET /api/catalog` | `backend/` |
| LLM-промт + валидатор | B | 🟡 валидатор+ретрай готовы, LLM — заглушка | `backend/src/llm.js` | `backend/` |
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
