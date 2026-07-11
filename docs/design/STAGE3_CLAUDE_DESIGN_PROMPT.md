# Промпт для Claude Design: этап 3 PromptBeats

Ты проектируешь high-fidelity экран приложения `PromptBeats` для следующего этапа фронтенда.

Важно: это не лендинг и не новый продукт. Нужен рабочий app UI для хакатон-демо, который можно быстро перенести в существующий React/Vite фронтенд.

## Контекст продукта

PromptBeats - браузерный AI beat sketcher:

1. Пользователь пишет музыкальный prompt.
2. Backend возвращает `{ song, message }`.
3. Frontend загружает `song` в Tone.js player.
4. Пользователь слушает, смотрит структуру трека и руками правит базовые параметры.

Цель этапа 3: сделать экран похожим на маленькую DAW-студию, но сохранить prompt-first workflow.

## Жесткие контрактные ограничения

Используй только актуальную Song JSON модель:

- Дорожки лежат в `song.tracks`.
- События лежат только в `track.events`.
- Поле `track.role` обязательно.
- Старые поля `pattern` и `notes` не использовать вообще.
- Manual controls не добавляют новые Player API.
- Для ручных правок UI должен менять `currentSong.bpm`, `currentSong.bars`, `currentSong.tracks[].muted`,
  `currentSong.tracks[].gain`, `currentSong.tracks[].sound`, `currentSong.tracks[].events`, затем вызывать
  `player.load(updatedSong)`.
- BPM допустим только в диапазоне `40..220`; Bars - целое число `1..32`. При уменьшении Bars UI удаляет события за
  новым концом лупа и клампит `dur` оставшихся событий.
- Key пока только информационный chip: не проектируй editable key, потому что Player не транспонирует абсолютные ноты.

Не проектируй функции, которые требуют нового backend/player контракта. Export WAV можно показать disabled/stretch.

## Что нужно спроектировать

Сделай один основной desktop screen 1440x900 и responsive mobile state.

### Левая зона: AI chat

- История сообщений.
- Composer снизу.
- Demo prompt chips.
- Состояния: idle, generating, backend error.
- Сообщение ассистента должно быть коротким summary, не большим markdown-ответом.

### Центр: Studio

Верхний transport:

- Play icon button.
- Stop icon button.
- Loop toggle.
- Интерактивный BPM stepper (`40..220`), который коммитит полное обновление Song.
- Read-only Key chip.
- Интерактивный Bars selector (`1..32`), который меняет размер step-grid и нормализует события при уменьшении длины.
- Status dot: `Готово`, `Играет`, `Генерация`, `Ошибка`.

Большая live-визуализация:

- Equalizer или beat pulse.
- Playhead/beat indicator.
- Должно выглядеть живым, но не ломать layout.

Track lanes:

- Каждая дорожка строкой, не отдельной большой карточкой.
- Слева: role/name, sound selector, mute, solo-looking disabled или planned, gain slider/meter.
- Справа: 16-step-per-bar grid из `track.events`.
- Drums показывать как step hits.
- Bass/pad/lead показывать как note blocks с длиной `dur`.
- Muted track визуально приглушать.
- Selected event можно подсветить amber.

### Правая зона: Inspector

- Song summary chips: version, bpm, key, bars, tracks count.
- Validation checklist:
  - Schema valid.
  - `role` present.
  - `events` only.
  - instrument/sound match.
- Collapsible JSON preview.
- Request payload preview `{ prompt, song }`.
- Error area для player/backend ошибок.

## Manual controls для этапа 3

Покажи в UI такие ручные действия:

- Mute/unmute track.
- Gain slider на дорожке.
- BPM stepper и Bars selector: меняют Song JSON, после коммита вызывают `player.load(updatedSong)`; не добавляют
  live-control методы в Player.
- Sound selector из фиксированного каталога:
  - sampler: `lofi_kit`, `house_kit`, `trap_kit`.
  - synth: `sine_bass`, `saw_lead`, `square_lead`, `soft_pad`, `pluck`, `fm_bell`.
- Для drums: клик по step cell включает/выключает hit.
- Для synth tracks: grid кликабельный. Рядом с дорожкой есть компактный note selector; клик добавляет/удаляет событие
  только с выбранной нотой на этом step, не затрагивая остальные ноты того же step. Новое событие использует
  `dur: 1`, `vel: 0.8`; дефолты: bass `C2`, chords/pad `C3`, lead/fx `C4`.

## Визуальный стиль

Направление: compact dark beat lab, DAW-inspired, production-polished.

Палитра:

- Base: `#101113`
- Panel: `#1A1D21`
- Raised: `#23272D`
- Text: `#F5F2EA`
- Muted text: `#AEB4BD`
- Play/accent: `#B7FF5A`
- AI/generation: `#35D7FF`
- Error/edit: `#FF6B5F`
- Selected beat: `#FFC857`

Не использовать:

- Marketing hero.
- Purple-blue AI gradient cliché.
- Decorative blobs/orbs.
- Oversized typography.
- Cards inside cards.
- Старые поля `pattern`/`notes`.

## Mock data

Используй этот Song JSON для визуализации:

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
      "muted": false,
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
      "muted": false,
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
      "muted": true,
      "events": [
        { "step": 0, "note": "A3", "dur": 16, "vel": 0.5 },
        { "step": 16, "note": "F3", "dur": 16, "vel": 0.5 }
      ]
    }
  ]
}
```

## Deliverable

Сгенерируй polished HTML/CSS/JS prototype с интерактивными mock-состояниями:

- Play/Stop меняют визуальный статус.
- Mute/gain/sound controls визуально обновляют дорожку.
- Drum grid cells toggle hit state.
- Synth grid cells toggle the selected pitch while preserving other pitch blocks in the same step.
- BPM и Bars controls обновляют summary, размер сетки и JSON preview; при уменьшении Bars старые события за лупом
  больше не показываются.
- Inspector показывает актуальный JSON preview.
- Error/generating states можно включить через mock controls или scripted demo.

Приоритет: главный demo loop и переносимые UI-паттерны, а не полнота DAW.
