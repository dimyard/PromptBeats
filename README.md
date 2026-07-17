# PromptBeats

PromptBeats - браузерная мини-студия, где трек можно придумать в чате, сразу услышать, разобрать на дорожки и доредактировать руками.

Пользователь описывает настроение, жанр, темп и инструменты обычным языком. Backend отправляет запрос в LLM, получает структурированный **Song JSON**, проверяет его по контракту, а frontend показывает результат как музыкальный проект: дорожки, сетка шагов, транспорт, библиотека, импорт/экспорт и WAV-рендер.

Главная идея проекта: AI не отдает пользователю закрытый аудиофайл. Он дает редактируемую заготовку, которую можно довести до своего грува.

## Что умеет

- Генерировать и редактировать трек через чат.
- Проигрывать Song JSON в браузере через Tone.js.
- Редактировать BPM, длительность, дорожки, mute/gain, порядок дорожек и события на step-сетке.
- Работать с 6 ролями дорожек: `drums`, `bass`, `chords`, `lead`, `pad`, `fx`.
- Использовать синты, drum-kit'ы и sample-based piano (`sampled_piano`) с fallback на `soft_piano`.
- Импортировать и экспортировать Song JSON.
- Сохранять удачные варианты в локальную библиотеку backend.
- Экспортировать текущий микс в WAV.
- Проверять визуальные варианты через dev-only Design Lab.

## Быстрый старт

```bash
npm run dev
```

Команда из корня проекта при первом запуске подготавливает `backend/` и `frontend/`, создает `backend/.env` из примера, если файла еще нет, и поднимает:

- backend: `http://localhost:3001`
- frontend: `http://localhost:5173`

Если нужно запускать части отдельно:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Для генерации через реальную модель заполните `backend/.env`. Секреты и ключи в репозиторий не коммитятся.

Минимальный offline-режим для разработки:

```env
LLM_PROVIDER=mock
```

OpenAI-compatible режим:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=...
# опционально, если используется совместимый proxy endpoint:
OPENAI_CHAT_COMPLETIONS_URL=https://example.com/v1/chat/completions
```

## Проверка

```bash
cd backend
npm test
```

```bash
cd frontend
npm test
npm run build
```

## Структура

```text
backend/                 gateway, LLM-провайдеры, валидация, библиотека треков
frontend/                React UI, Tone.js player, Song JSON import/export, WAV export
frontend/public/samples/ sample assets для браузерного плеера
docs/                    продуктовая, дизайн- и LLM-документация
song.schema.json         машинная схема Song JSON
CONTRACTS.md             источник правды по интеграционным контрактам
sample-song.json         базовый пример Song JSON
```

## Главные документы

- [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md) - обзор проекта, архитектура, запуск, env, тесты и эксплуатационные заметки.
- [CONTRACTS.md](CONTRACTS.md) - источник правды по Song JSON, HTTP API, Player API, WAV export и библиотеке.
- [song.schema.json](song.schema.json) - JSON Schema для Song JSON.
- [docs/llm/SONG_JSON_GENERATOR_GUIDE.md](docs/llm/SONG_JSON_GENERATOR_GUIDE.md) - инструкция для генерации валидных треков без backend-LLM.
- [docs/design/MUSIC_REACTIVE_UI_CONTRACT.md](docs/design/MUSIC_REACTIVE_UI_CONTRACT.md) - контракт music-reactive UI layer.
- [docs/design/promptbeats.design-tokens.json](docs/design/promptbeats.design-tokens.json) - дизайн-токены PromptBeats.

## Song JSON в двух словах

Время в проекте задано step-сеткой: `16` шагов = `1` такт. Трек может быть от `1` до `32` тактов, темп - от `40` до `220` BPM.

Каждая дорожка содержит роль, тип инструмента, звук и события:

```json
{
  "version": 1,
  "title": "demo groove",
  "bpm": 96,
  "key": "A minor",
  "bars": 4,
  "tracks": [
    {
      "id": "piano",
      "role": "chords",
      "instrument": "synth",
      "sound": "sampled_piano",
      "gain": 0.74,
      "events": [
        { "step": 0, "note": "A3", "dur": 4, "vel": 0.82 }
      ]
    }
  ]
}
```

Полные правила описаны в [CONTRACTS.md](CONTRACTS.md).

## Статус проекта

Проект вырос из хакатона, но уже имеет рабочий end-to-end flow: prompt -> валидный Song JSON -> редактируемый трек -> playback -> WAV export. Следующие естественные направления развития: piano roll, полноценный микшер, больше инструментов и эффектов, MIDI/stems export, история версий и совместная работа.
