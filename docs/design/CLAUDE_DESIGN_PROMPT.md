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
     - Drums, `lofi_kit`, step grid на 16 шагов.
     - Bass, `sine_bass`, note blocks.
     - Pad, `soft_pad`, длинные note blocks.
     - Lead, `pluck`, редкие note blocks.
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

Используй эти данные для отрисовки:

```json
{
  "version": 1,
  "title": "lofi sketch",
  "bpm": 75,
  "key": "A minor",
  "bars": 8,
  "tracks": [
    {
      "id": "drums",
      "instrument": "sampler",
      "sound": "lofi_kit",
      "pattern": [
        { "step": 0, "note": "C2", "vel": 0.9 },
        { "step": 4, "note": "D2", "vel": 0.6 },
        { "step": 8, "note": "C2", "vel": 0.9 },
        { "step": 12, "note": "D2", "vel": 0.55 },
        { "step": 2, "note": "F#2", "vel": 0.35 },
        { "step": 6, "note": "F#2", "vel": 0.3 },
        { "step": 10, "note": "F#2", "vel": 0.35 },
        { "step": 14, "note": "F#2", "vel": 0.3 }
      ]
    },
    {
      "id": "bass",
      "instrument": "synth",
      "sound": "sine_bass",
      "notes": [
        { "start": 0, "dur": 2, "note": "A1", "vel": 0.8 },
        { "start": 2, "dur": 2, "note": "F1", "vel": 0.78 },
        { "start": 4, "dur": 2, "note": "D1", "vel": 0.72 },
        { "start": 6, "dur": 2, "note": "E1", "vel": 0.76 }
      ]
    },
    {
      "id": "pad",
      "instrument": "synth",
      "sound": "soft_pad",
      "notes": [
        { "start": 0, "dur": 4, "note": "A3", "vel": 0.45 },
        { "start": 4, "dur": 4, "note": "F3", "vel": 0.42 }
      ]
    },
    {
      "id": "lead",
      "instrument": "synth",
      "sound": "pluck",
      "notes": [
        { "start": 1, "dur": 0.5, "note": "C4", "vel": 0.55 },
        { "start": 2.5, "dur": 0.5, "note": "E4", "vel": 0.5 },
        { "start": 5, "dur": 0.5, "note": "A4", "vel": 0.48 }
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
