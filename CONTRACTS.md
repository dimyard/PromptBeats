# PromptBeats — контракты интеграции

Это **единственный источник правды** по интерфейсам между тремя частями системы.
Каждый кодит против этих контрактов независимо, на моках. Если всё соблюдено — интеграция сходится без переделок.

**Правило №1:** менять контракт можно только через правку этого файла + `song.schema.json`, с бампом `version`
и явным объявлением команде. Молчаливые изменения ломают чужой код.

## Карта: кто с кем стыкуется
```
        Человек A (фронт)
        /            \
  HTTP /api/compose   Player module (импорт в браузере)
       |                    |
  Человек B (бэк+LLM)   Человек C (Tone.js движок)
        \                  /
         общий Song JSON (данные)
```
- **Song JSON** — общий формат данных, знают все трое.
- **HTTP /api/compose** — контракт A↔B.
- **Player module** — контракт A↔C (импорт JS-модуля, без сети).

Фронт (A) — хаб: зовёт бэк по HTTP, результат отдаёт в плеер.

---

## Контракт 1 — Song JSON (данные, знают все)

Единая **step-сетка времени: 16 шагов = 1 такт**. Все дорожки (и ударные, и мелодические) используют шаги.
Всего шагов в треке = `bars * 16`.

```jsonc
{
  "version": 1,                 // int, схема контракта
  "title": "lofi sketch",       // string
  "bpm": 75,                    // number, 40..220
  "key": "A minor",             // string, человекочитаемо (для UI и подсказок LLM)
  "bars": 8,                    // int, 1..32
  "tracks": [
    {
      "id": "drums",            // string, уникален в песне
      "role": "drums",          // enum: drums|bass|chords|lead|pad|fx — ОБЯЗАТЕЛЬНО
      "instrument": "sampler",  // enum: synth|sampler
      "sound": "lofi_kit",      // из каталога; ПАРА обязана совпадать: sampler→kit, synth→synth
      "gain": 0.9,              // number 0..1, опционально (default 0.8)
      "muted": false,           // bool, опционально (default false)
      "events": [               // массив событий (единый формат для всех дорожек)
        { "step": 0, "note": "C2",  "dur": 1, "vel": 0.9 },
        { "step": 4, "note": "D2",  "dur": 1, "vel": 0.6 },
        { "step": 8, "note": "C2",  "dur": 1, "vel": 0.9 }
      ]
    },
    {
      "id": "bass",
      "role": "bass",
      "instrument": "synth",
      "sound": "sine_bass",
      "events": [
        { "step": 0,  "note": "A1", "dur": 8, "vel": 0.8 },
        { "step": 16, "note": "F1", "dur": 8, "vel": 0.8 }
      ]
    }
  ]
}
```

### Event
- `step` — int, 0-based, диапазон `0 .. bars*16 - 1`.
- `note` — научная нотация высоты: `"C2"`, `"A#3"`, `"Gb4"`. Для ударных `note` выбирает элемент кита (см. drum map).
- `dur` — int, длительность в шагах, `>=1`, опционально (default 1). Для ударных обычно 1.
- `vel` — number, громкость ноты `0..1`, опционально (default 0.8).

**Правило `step + dur`:** нота не должна выходить за конец лупа. Инвариант: `step + dur <= bars*16`.
Это не режется как ошибка — бэк **нормализует** (клампит `dur` до конца лупа) перед валидацией
(`normalizeSong` в `backend/src/validate.js`), а плеер клампит защитно на своей стороне.
События с `step` вне `0..bars*16-1` плеер пропускает и репортит через событие `error` (см. Контракт 3).

**Пары instrument↔sound (жёсткий инвариант, проверяется схемой через `if/then`):**
`instrument: "synth"` → `sound` только из синтов; `instrument: "sampler"` → `sound` только из китов.

### Каталог звуков (enum для поля `sound`)
Синты (без ассетов, чистый Tone.js): `sine_bass`, `saw_lead`, `square_lead`, `soft_pad`, `pluck`, `fm_bell`.
Сэмпл-киты: `lofi_kit`, `house_kit`, `trap_kit`.

LLM обязан выбирать `sound` только из этого списка. Бэк это валидирует.

### Drum note map (для дорожек с `instrument: "sampler"`)
Единое соответствие нота → элемент кита, чтобы фронт/бэк/движок понимали одно и то же:
| note | элемент |
|------|---------|
| C2   | kick    |
| D2   | snare   |
| D#2  | clap    |
| F#2  | closed hat |
| A#2  | open hat   |
| E2   | tom     |
| C#3  | ride/crash |

Кит обязан реализовать как минимум kick/snare/closed hat. Остальное — по возможности.

### Sampler engine и ручные контролы
`instrument: "sampler"` означает не просто "проиграй дорожку", а отдельный kit/sampler слой внутри Player:

- `sound` выбирает kit: `lofi_kit`, `house_kit`, `trap_kit`.
- `events[].note` выбирает pad/элемент кита по Drum note map выше.
- `events[].vel` управляет силой удара, `events[].dur` для ударных обычно игнорируется или трактуется как decay hint.
- `gain` и `muted` применяются на уровне дорожки.
- Неизвестная drum note не должна ронять плеер: Player использует безопасный fallback и/или эмитит `error`.

Ручная настройка дорожек в MVP идёт через правку самого Song JSON и повторный `player.load(song)`, без отдельного live-control API.
Фронт A может давать пользователю контролы:

- mute/unmute дорожки → меняет `track.muted`;
- level/gain → меняет `track.gain`;
- выбор sound/kit → меняет `track.sound` в рамках допустимой пары `instrument↔sound`;
- step-grid / drum pads → меняют `track.events`;
- удаление/добавление нот → меняет `track.events`.
- BPM stepper → меняет `song.bpm` в диапазоне `40..220`;
- Bars selector → меняет `song.bars` в диапазоне `1..32`.

При уменьшении `song.bars` фронт A **до** `player.load(song)` нормализует каждую дорожку: удаляет события,
у которых `step >= bars*16`, и клампит `dur` оставшихся так, чтобы `step + dur <= bars*16`.
`key` пока только отображается: изменение этого поля без отдельной логики транспозиции не меняет абсолютные ноты
в `events`, поэтому editable key не входит в MVP.

После любой такой правки фронт отдаёт полный обновлённый Song в `player.load(song)`. Player C обязан корректно пересобрать граф
идемпотентно, без наложения старых событий.

**Инварианты (гарантируются бэком, на них может полагаться фронт и движок):**
- Song всегда валиден по `song.schema.json`.
- Все `sound` — из каталога. Все `id` уникальны. Все `step` в пределах `bars*16`.

---

## Контракт 2 — HTTP API (A ↔ B)

Один эндпоинт и на генерацию, и на правку. Отличие только в наличии `song` в теле.

### `POST /api/compose`
Request body:
```jsonc
{
  "prompt": "сделай спокойный лоу-фай бит, 75 BPM, минор",
  "song": null   // null/отсутствует = генерация с нуля; объект Song = правка существующего
}
```
Response `200`:
```jsonc
{
  "song": { /* полный валидный Song JSON */ },
  "message": "Собрал лоу-фай бит на 75 BPM в ля-миноре."  // короткая реплика модели для чата
}
```
Response ошибки (`4xx`/`5xx`):
```jsonc
{ "error": { "code": "llm_invalid_output", "message": "human-readable" } }
```
Коды: `bad_request` (400), `llm_invalid_output` (422), `llm_error` (502), `internal` (500).
`rate_limited` (429) — опционально, off по умолчанию (см. hardening-пасс B ниже).

**Гарантии бэка (B):**
- В ответе `song` всегда полный и валиден по схеме (внутри — валидация + до 2 ретраев к LLM).
- CORS открыт для дев-фронта. `Content-Type: application/json`.
- `message` — 1–2 предложения, тот же язык, что и prompt.

> **⚠️ Аддитивный hardening-пасс B (в работе; детали — в IMPLEMENTATION_LOG).** Форма запроса/ответа `/api/compose`
> и Song JSON **не меняются**. Добавляется/уточняется только следующее (обратно совместимо, всё за env-флагами):
> - **Лимиты входа:** `prompt` ≤ `MAX_PROMPT_CHARS` (деф. 2000), входной `song` ≤ `MAX_SONG_CHARS` (деф. 20000) → `400 bad_request`.
> - **Санитизация ошибок:** для `llm_error`/`llm_invalid_output`/`internal` клиенту уходит generic-текст без тела провайдера
>   (полный текст — в логах сервера). `bad_request` остаётся информативным. Форма конверта ошибки та же.
> - **Прозрачно для клиента:** таймаут LLM (`LLM_TIMEOUT_MS`, деф. 30000) и ретрай транзиентных ошибок провайдера (429/5xx/сеть) с backoff.
> - **Опциональный rate-limit** (`RATE_LIMIT_ENABLED`, деф. off) → код `rate_limited` (429) в том же конверте ошибки.

### `GET /api/catalog` (вспомогательный)
Отдаёт актуальный каталог, чтобы фронт не хардкодил списки:
```jsonc
{ "synths": ["sine_bass", "..."], "kits": ["lofi_kit", "..."], "roles": ["drums","bass","chords","lead","pad","fx"] }
```

### `GET /api/health` (вспомогательный, добавляется B — аддитивно)
Лёгкий health-check для фронта/ops. Секретов не отдаёт (`proxy` — только булев флаг):
```jsonc
{ "ok": true, "provider": "anthropic", "model": "claude-haiku-4-5", "proxy": true, "uptime": 123.4 }
```

---

## Контракт 3 — Player module (A ↔ C)

Чистый браузерный модуль на Tone.js. Никакой сети. Вход — только Song JSON. Экспорт по умолчанию — фабрика.

```ts
export interface Player {
  /** (Пере)собирает аудиограф из песни. Идемпотентно: можно звать при каждой правке. */
  load(song: Song): Promise<void>;
  /** Запускает воспроизведение (луп по всей длине bars). Требует user gesture до первого вызова. */
  play(): Promise<void>;
  /** Останавливает и сбрасывает позицию в 0. */
  stop(): void;
  isPlaying(): boolean;
  /** Подписка на события. Возвращает функцию отписки (важно для React-размонтирования). */
  on(event: "step",  cb: (step: number) => void): () => void;
  on(event: "ready", cb: (p: { totalSteps: number }) => void): () => void;
  on(event: "error", cb: (e: PlayerError) => void): () => void;
  /** Растяжка: офлайн-рендер в WAV. */
  exportWav?(song: Song): Promise<Blob>;
  /** Освобождает ресурсы Tone (при размонтировании). */
  dispose(): void;
}

export function createPlayer(): Player;

/** Payload события "error". */
export interface PlayerError {
  code: "unknown_sound" | "event_out_of_range" | "load_failed";
  message: string;
  details?: Record<string, unknown>;
}
```

**Payload'ы событий (фиксированы):**
- `"step"` → `number` (текущий шаг, 0-based).
- `"ready"` → `{ totalSteps: number }`.
- `"error"` → `{ code, message, details? }` (см. `PlayerError`). Ошибки не роняют плеер.

**Контракт использования (как зовёт фронт A):**
```ts
import { createPlayer } from "./player";
const player = createPlayer();
await player.load(song);   // после каждого ответа бэка
await player.play();       // по кнопке Play (это и есть user gesture)
player.on("step", (s) => setPlayhead(s));
```

**Гарантии движка (C):**
- `load()` безопасно вызывать многократно (старый граф корректно уничтожается, без наложения и утечек).
- Неизвестный `sound` → fallback на дефолтный синт + событие `"error"` (не краш).
- Для `instrument: "sampler"` реализован sampler/kit playback по Drum note map; как минимум kick/snare/closed hat звучат
  в каждом kit, остальные элементы имеют fallback.
- `bpm`, `bars`, `gain`, `muted`, `sound` и `events` применяются при каждом `load(song)`, чтобы ручные контролы фронта
  работали через правку Song JSON без отдельного Player API; `ready.totalSteps` после загрузки равен `bars * 16`.
- Работает в Chrome/Firefox/Safari через WebAudio (Web MIDI не нужен).

---

## Общий стек по умолчанию (можно переголосовать в первые 30 минут)
- Язык: TypeScript/JavaScript и на фронте, и на бэке.
- Фронт: React + Tone.js. Бэк: Node + Express (или Fastify).
- LLM: провайдер на выбор B; наружу торчит только контракт 2 — фронту всё равно, какой провайдер внутри.
- Общий мок для старта: `sample-song.json` в корне репозитория.
