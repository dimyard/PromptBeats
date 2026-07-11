# Промпт для Claude Design: PromptBeats

Ты проектируешь high-fidelity рабочий прототип фронтенда для хакатон-приложения `PromptBeats`.

Важно: делай экран приложения, а не лендинг.

## Продукт

PromptBeats — браузерный AI beat sketcher. Пользователь пишет музыкальный запрос обычным языком, backend возвращает структурированный `Song JSON`, а Tone.js проигрывает трек в браузере. Потом пользователь пишет правки вроде "добавь хэты", "сделай бас глубже", "ускорь до 90 BPM". Интерфейс должен сразу объяснять цикл: prompt → generate → play → inspect tracks → edit by chat.

## Целевая аудитория

Приложение показывается судьям хакатона, начинающим создателям музыки и людям с продюсерским взглядом. Оно должно быть простым, но выглядеть как настоящий музыкальный инструмент. Не должно ощущаться как обычный AI-chat или маркетинговая страница.

## Дизайн-направление

Сделай компактную AI beat lab:

- Тёмная graphite studio UI.
- Тактильные DAW-inspired controls.
- Видимый ритм и структура сгенерированной музыки.
- Prompt-first workflow.
- Всё понятно за 10 секунд на демо.

Палитра:

- Base: `#101113`
- Panel: `#1A1D21`
- Raised: `#23272D`
- Text: `#F5F2EA`
- Muted text: `#AEB4BD`
- Play/accent: lime `#B7FF5A`
- AI/generation: cyan `#35D7FF`
- Edit/error: coral `#FF6B5F`
- Current beat/selection: amber `#FFC857`

Не используй purple-blue gradient AI cliché, decorative blobs, landing hero, oversized marketing typography.

## Layout

Desktop: один full-screen app shell с тремя зонами.

1. Левая chat panel, примерно треть экрана:
   - Название `PromptBeats`.
   - История диалога.
   - Сообщения пользователя и короткие summaries от системы.
   - Примеры summary: "Собран трек: 8 тактов, 75 BPM, A minor, 3 дорожки" и "Правка: добавлен soft_pad, BPM поднят до 90".
   - Composer закреплён снизу.
   - Demo prompt chips:
     - "Спокойный lo-fi бит, 75 BPM, минор"
     - "Добавь мягкий pad на фоне"
     - "Ускорь до 90 и сделай бас громче"

2. Центральная studio panel:
   - Постоянный transport row: Play, Stop, Loop, BPM, key, bars, status.
   - Большая центральная визуализация: waveform/equalizer/beat pulse.
   - Название текущего трека.
   - Track list с компактными lanes:
     - Drums, `lofi_kit`, step grid из `track.events`.
     - Bass, `sine_bass`, note blocks из `track.events`.
     - Pad, `soft_pad`, длинные note blocks из `track.events`.
     - Lead, `pluck`, редкие note blocks из `track.events`.
   - Track controls: mute icon, solo icon, small level meter.
   - Moving playhead across the grid, если возможно.

3. Правая inspector rail:
   - Summary `Song JSON` как чипы: version, bpm, key, bars, tracks.
   - Collapsible JSON preview.
   - Validation status: "Schema valid" и "Sounds from fixed catalog".
   - Request payload preview: `{ prompt, currentSong }`.
   - Stretch button: Export WAV, secondary или disabled.

Mobile:

- Chat над studio.
- Inspector за toggle.
- Play/Stop и composer всегда легко доступны.

## Состояния

Нужно показать состояния:

- Ready: sample song loaded.
- Playing: play active, playhead или beat pulse animated.
- Generating: composer disabled, cyan equalizer shimmer, status "Генерация".
- Error: coral toast/banner "JSON validation failed" + Retry.

Backend не нужен. Используй реалистичные mock states.

## Sample Song JSON

Используй эти данные для отрисовки. Важно: актуальный контракт использует единый массив `events` для всех дорожек.
Не используй старые поля `pattern` и `notes`. Поле `role` обязательно.

```json
{
  "version": 1,
  "title": "lofi sketch",
  "bpm": 75,
  "key": "A minor",
  "bars": 2,
  "tracks": [
    {
      "id": "drums",
      "role": "drums",
      "instrument": "sampler",
      "sound": "lofi_kit",
      "gain": 0.9,
      "events": [
        { "step": 0, "note": "C2", "vel": 0.9 },
        { "step": 4, "note": "F#2", "vel": 0.5 },
        { "step": 8, "note": "D2", "vel": 0.8 },
        { "step": 12, "note": "F#2", "vel": 0.5 },
        { "step": 16, "note": "C2", "vel": 0.9 },
        { "step": 20, "note": "F#2", "vel": 0.5 },
        { "step": 24, "note": "D2", "vel": 0.8 },
        { "step": 28, "note": "F#2", "vel": 0.5 }
      ]
    },
    {
      "id": "bass",
      "role": "bass",
      "instrument": "synth",
      "sound": "sine_bass",
      "gain": 0.8,
      "events": [
        { "step": 0, "note": "A1", "dur": 8, "vel": 0.8 },
        { "step": 8, "note": "A1", "dur": 8, "vel": 0.7 },
        { "step": 16, "note": "F1", "dur": 8, "vel": 0.8 },
        { "step": 24, "note": "G1", "dur": 8, "vel": 0.7 }
      ]
    },
    {
      "id": "pad",
      "role": "pad",
      "instrument": "synth",
      "sound": "soft_pad",
      "gain": 0.6,
      "events": [
        { "step": 0, "note": "A3", "dur": 16, "vel": 0.5 },
        { "step": 16, "note": "F3", "dur": 16, "vel": 0.5 }
      ]
    }
  ]
}
```

## Критерии качества

Прототип должен выглядеть достаточно production-polished для хакатон-демо:

- Аккуратные alignment и spacing.
- Без text overflow.
- Без cards inside cards.
- Без маркетингового текста.
- Иконки в кнопках там, где это естественно: play, stop, loop, mute, solo, download, inspector/code.
- Компактные tooltips для icon-only controls, если поддерживаются.
- Стабильные размеры для step cells, meters, buttons и panels, чтобы анимация не двигала layout.

## Deliverable

Сделай полный frontend mock/prototype с реалистичным UI behavior и mock state transitions. Приоритет: главный demo loop, а не дополнительные фичи.
