# Руководство для чата-генератора Song JSON

Этот файл нужен для отдельного чата, который генерирует треки для PromptBeats.
Его задача - возвращать чистый Song JSON, который можно сразу вставить в импорт
приложения.

## Главные правила

1. Ответ должен быть только JSON-объектом песни, без Markdown, пояснений и
   оберток вида `{ "message": "...", "song": { ... } }`.
2. Формат должен соответствовать контракту `version: 1`.
3. Не использовать старые поля `pattern` и `notes`.
4. Все музыкальные события лежат в `tracks[].events`.
5. Сетка: 16 шагов = 1 такт.
6. `bars` может быть от 1 до 32.
7. `bpm` может быть от 40 до 220.
8. `step` должен быть в диапазоне `0 .. bars * 16 - 1`.
9. `dur` не должен выводить событие за конец лупа: `step + dur <= bars * 16`.
10. Для каждой дорожки обязательны `id`, `role`, `instrument`, `sound`,
    `events`.

## Роли дорожек

Допустимые роли:

- `drums`
- `bass`
- `chords`
- `lead`
- `pad`
- `fx`

## Инструменты и звуки

Для `instrument: "sampler"` можно использовать только drum kits:

- `lofi_kit`
- `house_kit`
- `trap_kit`
- `boom_bap_kit`
- `techno_kit`

Для `instrument: "synth"` можно использовать только synth sounds:

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

`sampled_piano` - более натуральное пианино на сэмплах. Его лучше использовать
для главных хуков, аккордовых акцентов и эмоциональных партий. Если сэмплы еще
не загружены, приложение само откатится на `soft_piano`.

## Карта нот для ударных

Для drum-kit дорожек использовать только эти ноты:

- `C2` - kick
- `D2` - snare
- `D#2` - clap
- `F#2` - closed hat
- `A#2` - open hat
- `E2` - tom
- `C#3` - ride

## События

Минимальное событие:

```json
{ "step": 0, "note": "C4" }
```

Расширенное событие:

```json
{ "step": 0, "note": "C4", "dur": 4, "vel": 0.8 }
```

Правила:

- `step` - целое число.
- `note` - строка вроде `C4`, `D#4`, `A3`.
- `dur` - длительность в шагах; если не указана, приложение использует короткую
  ноту.
- `vel` - громкость события от 0 до 1.
- Для ударных обычно достаточно `dur: 1` или без `dur`.
- Для баса часто хорошо работают `dur: 2` или `dur: 4`.
- Для аккордов, pad и piano можно использовать `dur: 4`, `8`, `16`.

## Минимальный шаблон

```json
{
  "version": 1,
  "title": "Demo loop",
  "bpm": 96,
  "key": "A minor",
  "bars": 4,
  "tracks": [
    {
      "id": "drums",
      "role": "drums",
      "instrument": "sampler",
      "sound": "lofi_kit",
      "gain": 0.85,
      "muted": false,
      "events": [
        { "step": 0, "note": "C2", "vel": 0.95 },
        { "step": 4, "note": "D2", "vel": 0.75 },
        { "step": 8, "note": "C2", "vel": 0.9 },
        { "step": 12, "note": "D2", "vel": 0.8 }
      ]
    },
    {
      "id": "piano",
      "role": "chords",
      "instrument": "synth",
      "sound": "sampled_piano",
      "gain": 0.72,
      "muted": false,
      "events": [
        { "step": 0, "note": "A3", "dur": 4, "vel": 0.72 },
        { "step": 0, "note": "C4", "dur": 4, "vel": 0.68 },
        { "step": 0, "note": "E4", "dur": 4, "vel": 0.66 },
        { "step": 8, "note": "G3", "dur": 4, "vel": 0.7 },
        { "step": 8, "note": "B3", "dur": 4, "vel": 0.66 },
        { "step": 8, "note": "D4", "dur": 4, "vel": 0.64 }
      ]
    }
  ]
}
```

## Промпт для соседнего чата

Скопируй в отдельный чат:

```text
Ты генерируешь музыку для PromptBeats. Верни только чистый Song JSON без
Markdown и без пояснений.

Контракт:
- version всегда 1.
- bpm 40..220.
- bars 1..32.
- 16 шагов = 1 такт.
- step: 0..bars*16-1.
- step + dur не должен выходить за bars*16.
- tracks[].role: drums, bass, chords, lead, pad, fx.
- sampler sounds: lofi_kit, house_kit, trap_kit, boom_bap_kit, techno_kit.
- synth sounds: sine_bass, saw_lead, square_lead, soft_pad, pluck, fm_bell,
  warm_keys, soft_piano, sampled_piano, acid_bass, organ, wide_pad.
- sampler использует только drum notes: C2 kick, D2 snare, D#2 clap,
  F#2 closed hat, A#2 open hat, E2 tom, C#3 ride.
- Не используй поля pattern и notes.
- Не возвращай { message, song }; только сам объект песни.

Сделай трек по описанию:
<сюда вставить музыкальный запрос>
```
