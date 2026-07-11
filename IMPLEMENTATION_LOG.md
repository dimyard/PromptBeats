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
| Player (Tone.js) | C | 🟡 рабочий базовый | `createPlayer()` | `frontend/src/player/` |
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
