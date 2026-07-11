# Brief для агента — Human B (бэкенд + LLM)

Скопируй весь текст ниже в свою сессию агента (в папке репозитория PromptBeats).

---

Ты — инженер на хакатон-проекте **PromptBeats**. Работаешь в клонированном репозитории
`github.com/dimyard/PromptBeats`. Твоя роль — **Human B: бэкенд-шлюз и LLM**.

## Что за проект
Веб-морда с чатом: пользователь пишет пожелание («спокойный лоу-фай бит, 75 BPM») → **твой бэкенд** зовёт LLM,
который превращает это в **Song JSON** → фронт отдаёт JSON в браузерный движок Tone.js, и звучит музыка.
Правки трека идут тем же путём: промт + текущий JSON → новый JSON.

## Сначала прочитай (обязательно)
1. `CONTRACTS.md` — источник правды по интерфейсам. Особенно «Контракт 1 — Song JSON» и «Контракт 2 — HTTP API».
2. `song.schema.json` — машинная схема Song JSON.
3. `AGENTS.md` — правила работы (границы, дисциплина логирования).
4. `backend/README.md` и весь `backend/src/` — каркас уже написан, изучи его.

## Границы (важно)
Работай **только в `backend/`**. Фронт (`frontend/`) и движок (`frontend/src/player/`) — не твои, не трогай.
Не меняй форму Song JSON, HTTP API или схему без правки `CONTRACTS.md` + `song.schema.json` и записи в журнал.

## Что уже готово (не переписывай без причины)
- `src/server.js` — Express, роутинг, коды ошибок, CORS.
- `src/compose.js` — оркестрация: `normalizeSong` → `validateSong` → **ретрай до 2 раз** с прокидкой ошибок.
- `src/validate.js` — валидация по схеме + семантика (`step<bars*16`, уникальные id) + `normalizeSong` (кламп `dur`).
- `src/catalog.js` — каталог звуков.
- `src/llm.js` — **ЗАГЛУШКА. Это твоя главная задача.**

## Твоя задача
Заменить STUB в `src/llm.js` реальным вызовом LLM. Контракт функции менять нельзя:
- вход: `{ prompt: string, song: Song|null, previousErrors: string[] }`
- выход: `{ song: Song, message: string }`
- `song === null` → генерация с нуля; `song` задан → **правка** этого трека.
- `previousErrors` непустой на ретрае — **вложи эти ошибки в промт**, чтобы модель их исправила.

Пошагово:
1. Спроси у меня (человека), какой LLM-провайдер и ключ использовать (OpenAI / Anthropic / другой). Ключ — только
   в `backend/.env` (см. `.env.example`), никогда в код и не в коммит.
2. Собери **system-промт**: опиши формат Song JSON строго по схеме, перечисли каталог (`CATALOG`/`ALL_SOUNDS` из
   `catalog.js`), роли, drum-note-map из `CONTRACTS.md`, и жёсткие инварианты:
   - `sound` только из каталога; пары `synth`→синты, `sampler`→киты;
   - время в шагах, `step` в `0..bars*16-1`, `step+dur<=bars*16`;
   - **верни ТОЛЬКО валидный JSON, без пояснений и markdown-ограждений.**
3. Добавь **few-shot**: 2–3 примера «пожелание → Song JSON» и 1 пример «правка → Song JSON» (на вход даётся текущий
   song, на выходе изменённый). Примеры должны проходить `song.schema.json`.
4. На правках вкладывай текущий `song` в user-сообщение и проси вернуть **полный** новый Song (не дифф).
5. Распарси ответ (аккуратно срежь возможные ```json ограждения), верни `{ song, message }`, где `message` — 1–2
   коротких предложения на языке промта («Собрал лоу-фай на 75 BPM, добавил мягкий пэд»).
6. Ошибки сети/провайдера — кидай наверх (compose завернёт в код `llm_error`).

## Definition of Done
- `POST /api/compose` с `{prompt}` возвращает валидный по схеме Song + осмысленный `message`.
- `POST /api/compose` с `{prompt, song}` корректно **правит** переданный трек.
- Невалидный ответ модели чинится ретраем (используешь `previousErrors`); если и после ретраев плохо — отдаётся
  `422 llm_invalid_output` (это уже делает compose).
- `GET /api/catalog` работает (уже готов).
- Ключи только в `.env`. Запись в `IMPLEMENTATION_LOG.md` добавлена.

## Как проверить
```bash
cd backend && npm install && cp .env.example .env   # впиши ключ
npm run dev
# в другом терминале:
curl -s localhost:3001/api/compose -H 'Content-Type: application/json' \
  -d '{"prompt":"спокойный лоу-фай бит, 75 BPM, минор"}' | python3 -m json.tool
# правка:
curl -s localhost:3001/api/compose -H 'Content-Type: application/json' \
  -d '{"prompt":"добавь мягкий пэд и сделай быстрее","song": <вставь song из прошлого ответа>}' | python3 -m json.tool
```
Быстрая валидация любого Song JSON:
```bash
python3 -c "import json,jsonschema;jsonschema.validate(json.load(open('X.json')),json.load(open('song.schema.json')));print('OK')"
```

## В конце
Добавь запись в `IMPLEMENTATION_LOG.md` (шаблон там): что сделал, где, публичный интерфейс, как использовать,
отклонения, известные баги/TODO. Обнови строку статуса компонента на ✅. Коммить маленькими понятными коммитами.
