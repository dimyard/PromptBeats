# PromptBeats - документация проекта

## 1. Коротко о продукте

PromptBeats - это браузерная музыкальная мини-студия с AI-стартом.

Пользователь описывает идею трека обычным языком: настроение, жанр, темп, инструменты, референс по энергии. LLM превращает запрос в структурированный **Song JSON**. Приложение сразу показывает этот JSON как редактируемый музыкальный проект и воспроизводит его в браузере через Tone.js.

Ключевое отличие от генераторов "сделай мне аудио": PromptBeats не прячет результат в готовом файле. Он оставляет пользователю управление - можно поменять BPM, дорожки, звуки, ноты, громкость, mute, порядок партий, сохранить версию, экспортировать JSON или WAV.

## 2. Пользовательский сценарий

1. Пользователь вводит промпт в чат.
2. Backend отправляет запрос выбранному LLM-провайдеру.
3. LLM возвращает полный Song JSON.
4. Backend нормализует и валидирует результат.
5. Frontend отображает дорожки и события на step-сетке.
6. Tone.js player загружает Song JSON и воспроизводит loop.
7. Пользователь дорабатывает трек вручную или просит AI изменить существующую версию.
8. Удачный результат можно сохранить в библиотеку, экспортировать как JSON или WAV.

## 3. Что сейчас реализовано

- Чат для генерации и редактирования трека.
- Единый Song JSON contract.
- Валидация JSON Schema + дополнительные семантические проверки.
- React-интерфейс студии: transport, дорожки, inspector, библиотека, импорт/экспорт.
- Ручное редактирование дорожек и событий на сетке.
- Изменение BPM в диапазоне `40..220`.
- Длина трека от `1` до `32` тактов.
- Step-сетка: `16` шагов = `1` такт.
- Перестановка дорожек.
- Горизонтальный скролл сетки и вертикальный скролл дорожек.
- Tone.js playback.
- WAV export через offline render.
- Shared library на backend: сохранить, загрузить, перезаписать трек.
- Dev-only Design Lab для проверки визуальных состояний и music-reactive preview layer.
- Sample-based piano `sampled_piano` с локальными CC0 WAV-сэмплами и fallback на `soft_piano`.

## 4. Музыкальная модель

Источник правды - [../CONTRACTS.md](../CONTRACTS.md) и [../song.schema.json](../song.schema.json).

Основные ограничения:

- `version`: сейчас `1`.
- `bpm`: `40..220`.
- `bars`: `1..32`.
- `tracks`: `1..12`.
- В одном такте `16` шагов.
- Общее количество шагов: `bars * 16`.
- Событие не должно выходить за конец loop: `step + dur <= bars * 16`.

Роли дорожек:

- `drums`
- `bass`
- `chords`
- `lead`
- `pad`
- `fx`

Типы инструментов:

- `synth` - мелодические и гармонические звуки.
- `sampler` - drum-kit'ы.

Синтовые звуки:

- `sine_bass`
- `saw_lead`
- `square_lead`
- `soft_pad`
- `pluck`
- `fm_bell`
- `warm_keys`
- `soft_piano`
- `sampled_piano`
- `acid_bass`
- `organ`
- `wide_pad`

Drum-kit'ы:

- `lofi_kit`
- `house_kit`
- `trap_kit`
- `boom_bap_kit`
- `techno_kit`

Важно: `instrument: "synth"` можно использовать только с synth sound, а `instrument: "sampler"` - только с drum-kit sound.

## 5. Архитектура

```text
User prompt
    |
    v
frontend React app
    |
    | POST /api/compose
    v
backend Express gateway
    |
    | provider adapter
    v
LLM provider
    |
    v
Song JSON
    |
    v
backend validation + normalization
    |
    v
frontend editor + Tone.js player
```

### Frontend

Папка: `frontend/`

Отвечает за:

- UI студии и чата.
- Отображение Song JSON как дорожек.
- Ручные правки Song JSON.
- Импорт/экспорт JSON.
- Вызовы backend API.
- Загрузку Song JSON в player.
- WAV export из браузера.
- Music-reactive UI state и dev-only Design Lab.

Основные файлы:

- `frontend/src/App.jsx` - главный UI и orchestration.
- `frontend/src/player/` - Tone.js player.
- `frontend/src/song-io.js` - нормализация и проверка Song JSON на стороне frontend.
- `frontend/src/songEditing.js` - операции ручного редактирования.
- `frontend/src/musicUiState.js` - derived UI state для визуализации и дорожек.
- `frontend/src/api.js` - compose API client.
- `frontend/src/library-api.js` - shared library API client.

### Backend

Папка: `backend/`

Отвечает за:

- HTTP API.
- Подключение к LLM-провайдерам.
- Сбор системного промпта.
- Валидацию и нормализацию Song JSON.
- Ретраи при невалидном ответе модели.
- Каталог звуков.
- Shared library.

Основные файлы:

- `backend/src/server.js` - Express server и endpoints.
- `backend/src/llm.js` - промпт и сценарии генерации/редактирования.
- `backend/src/providers.js` - адаптеры Anthropic/OpenAI/Gemini/mock.
- `backend/src/validate.js` - JSON Schema + semantic validation.
- `backend/src/catalog.js` - роли и звуки.
- `backend/src/library.js` - файловое хранилище библиотеки.

## 6. API

Подробный контракт - в [../CONTRACTS.md](../CONTRACTS.md).

Основные endpoints:

- `POST /api/compose` - генерация или редактирование трека.
- `GET /api/catalog` - актуальный каталог ролей и звуков.
- `GET /api/health` - health-check backend без секретов.
- `GET /api/library` - список сохраненных треков.
- `GET /api/library/:id` - один сохраненный трек с полным Song JSON.
- `POST /api/library` - сохранить текущий Song JSON.

## 7. Запуск локально

Из корня:

```bash
npm run dev
```

Отдельно backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Отдельно frontend:

```bash
cd frontend
npm install
npm run dev
```

Адреса по умолчанию:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

## 8. Настройка LLM

Настройки лежат в `backend/.env`. Этот файл локальный и не должен попадать в репозиторий.

Поддерживаемые провайдеры:

- `mock`
- `anthropic`
- `openai`
- `gemini`

Offline smoke-режим:

```env
LLM_PROVIDER=mock
```

OpenAI-compatible режим:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=...
```

Если используется совместимый proxy endpoint:

```env
OPENAI_CHAT_COMPLETIONS_URL=https://example.com/v1/chat/completions
```

Полезные env-переменные:

- `PORT` - порт backend, по умолчанию `3001`.
- `LLM_PROVIDER` - выбранный провайдер.
- `LLM_MODEL` - модель провайдера.
- `LLM_MAX_TOKENS` - лимит ответа модели, по умолчанию `4096`.
- `LLM_TEMPERATURE` - температура генерации, по умолчанию `0.4`.
- `LLM_TIMEOUT_MS` - timeout запроса к LLM.
- `LLM_PROXY` - proxy только для LLM-трафика.
- `OPENAI_CHAT_COMPLETIONS_URL` - кастомный OpenAI-compatible endpoint.
- `LIBRARY_FILE` - путь к JSON-файлу библиотеки.
- `MAX_PROMPT_CHARS` - лимит prompt.
- `MAX_SONG_CHARS` - лимит входного Song JSON.
- `RATE_LIMIT_ENABLED` - включает rate limit.

## 9. Проверка качества

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

Что покрывают тесты:

- Валидацию и нормализацию Song JSON.
- Compose pipeline.
- Retry/error поведение LLM gateway.
- Shared library.
- Frontend Song IO.
- Редактирование треков.
- Music UI state.
- Player behavior и WAV export smoke-логика.
- Наличие и маппинг piano samples.

## 10. Импорт и экспорт

### JSON

Song JSON - переносимый формат проекта. Его можно:

- получить из LLM;
- импортировать в интерфейсе;
- экспортировать из интерфейса;
- сохранить в библиотеку;
- передать в другой чат/инструмент для ручной генерации.

Для генерации валидных JSON без backend используйте [llm/SONG_JSON_GENERATOR_GUIDE.md](llm/SONG_JSON_GENERATOR_GUIDE.md).

### WAV

WAV export работает в браузере через `player.exportWav(song?)`.

Особенности:

- рендерится один полный loop;
- длительность зависит от `bars` и `bpm`;
- live playback не должен сбрасываться;
- результат скачивается как `.wav`;
- dense drum-паттерны поддерживаются через запас голосов для offline render.

## 11. Дизайн и UI

Основной стиль - graphite-интерфейс музыкального инструмента: темные поверхности, компактные контролы, моноширинные числовые данные, цветовые акценты по смыслу.

Документы:

- [design/DESIGN_RESEARCH.md](design/DESIGN_RESEARCH.md)
- [design/MUSIC_REACTIVE_UI_CONTRACT.md](design/MUSIC_REACTIVE_UI_CONTRACT.md)
- [design/promptbeats.design-tokens.json](design/promptbeats.design-tokens.json)
- [design/promptbeats-design-system.html](design/promptbeats-design-system.html)

Design Lab работает только в dev-режиме и нужен для проверки вариантов визуализации, layout и mock music-state без поломки основного demo flow.

## 12. Piano samples

`sampled_piano` использует WAV-сэмплы из:

```text
frontend/public/samples/piano/
```

Сэмплы лежат в репозитории под CC0/public domain. Это значит, что их можно использовать, копировать, изменять и распространять без обязательного указания авторства. В проекте все равно оставлен README/LICENSE рядом с ассетами, чтобы происхождение было понятно будущим участникам.

Если samples не загрузились, player должен безопасно откатиться к `soft_piano`.

## 13. Безопасность и секреты

Нельзя коммитить:

- `backend/.env`
- реальные API-ключи;
- приватные proxy credentials;
- локальную runtime-библиотеку, если она содержит пользовательские данные.

Перед пушем полезно проверить:

```bash
git status -sb
git diff --cached
```

## 14. Частые проблемы

### Backend не стартует, порт занят

Проверьте процесс на порту:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

### Frontend не стартует, порт занят

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

### Генерация не работает

Проверьте:

- запущен ли backend;
- заполнен ли `backend/.env`;
- верный ли `LLM_PROVIDER`;
- есть ли нужный API key;
- не закончился ли бюджет у провайдера;
- не нужен ли `OPENAI_CHAT_COMPLETIONS_URL` для proxy endpoint.

### WAV не сохраняется

Проверьте:

- загружен ли трек;
- не заблокировал ли браузер скачивание;
- есть ли ошибки в dev console;
- проходит ли `frontend` test suite.

## 15. Куда развивать проект

Ближайшие продуктовые направления:

- полноценный piano roll;
- mixer view с master/track effects;
- больше инструментов и sample banks;
- пресеты жанров и аранжировок;
- undo/redo и история версий;
- MIDI export;
- stems export по дорожкам;
- шаринг трека по ссылке;
- коллаборативное редактирование;
- улучшение AI-редактирования отдельных дорожек.

Проект уже можно показывать как рабочий прототип, но самое интересное начинается там, где AI перестает быть кнопкой "сделай магию" и становится музыкальным напарником, который не спорит с ручным редактированием.
