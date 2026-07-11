# PromptBeats music-reactive UI contract

Этот документ фиксирует общий контракт для интерфейсов PromptBeats, которые адаптивно реагируют на музыку.

Цель: разные варианты UI могут выглядеть по-разному, но должны читать одни и те же музыкальные сигналы и использовать одну семантику состояния. Мы не привязываем motion и визуализацию к конкретному layout; мы привязываем их к стабильному runtime-контракту.

## Principle

PromptBeats UI is a consumer of music state.

Любой layout, visualizer, track lane, transport или mobile state должен получать одинаковые сигналы:

- что играет;
- где находится playhead;
- какие события активны;
- какие дорожки слышимы;
- какие дорожки muted;
- где selection;
- в каком состоянии generation/error.

Разные интерфейсы могут по-разному визуализировать эти сигналы, но не должны придумывать собственную модель состояния.

## Source Data

Структурный источник правды - актуальный `Song JSON`.

Разрешенные поля:

- `song.version`
- `song.title`
- `song.bpm`
- `song.key`
- `song.bars`
- `song.tracks`
- `track.id`
- `track.role`
- `track.instrument`
- `track.sound`
- `track.gain`
- `track.muted`
- `track.events`
- `event.step`
- `event.note`
- `event.dur`
- `event.vel`

Запрещенные старые поля:

- `pattern`
- `notes`

## Runtime Signals

Интерфейс должен быть способен работать от такого набора сигналов:

```ts
type PlaybackState = {
  isPlaying: boolean;
  isLooping: boolean;
  bpm: number;
  bars: number;
  stepsPerBar: 16;
  totalSteps: number;
  currentStep: number;
  currentBar: number;
  currentBeatInBar: number;
  currentStepProgress: number;
};

type TrackActivity = {
  trackId: string;
  role: "drums" | "bass" | "pad" | "lead" | string;
  muted: boolean;
  gain: number;
  meterLevel: number;
  peakLevel: number;
  activeEventSteps: number[];
  activeEventIds?: string[];
};

type MusicUiState = {
  playback: PlaybackState;
  tracks: TrackActivity[];
  selectedTrackId?: string;
  selectedEventStep?: number;
  generationState: "idle" | "generating" | "success" | "error";
  error?: {
    scope: "backend" | "player" | "schema" | "network" | "catalog";
    message: string;
    path?: string;
    recoverable: boolean;
  };
};
```

This is a design/runtime contract, not a requirement to expose this exact TypeScript type in production. Production code may derive it from player callbacks, Tone.js scheduling, `currentSong`, and validation state.

## Derived Signals

UI variants should use derived signals instead of re-parsing the song ad hoc.

| Signal | Meaning | Typical consumers |
| --- | --- | --- |
| `isPlaying` | Transport is active | play button, visualizer, meters |
| `currentStep` | Current 16th-step in the loop | playhead, beat grid, step highlights |
| `currentBar` | Current bar index | bar ruler, compact status |
| `currentBeatInBar` | Beat group inside a bar | beat clock, pulse grid |
| `currentStepProgress` | Fractional progress between steps | smooth playhead movement |
| `activeEventSteps` | Events currently being triggered | lane flashes, event highlight |
| `meterLevel` | Per-track activity level | meters, visualizer stacks |
| `peakLevel` | Recent per-track peak | peak hold marker, amber warning |
| `muted` | Track is silent | opacity reduction, muted controls |
| `selectedEventStep` | User-selected event | amber selection state |
| `generationState` | AI/backend state | composer, shimmer, status pill |
| `error` | Current recoverable/fatal issue | toast, inspector row, retry |

## Visual Mapping

Use the PromptBeats design system as the only visual source of truth.

| State | Token | Usage |
| --- | --- | --- |
| Play / audible / active notes | `--lime` | play active, meters, active events |
| Generation / AI / send | `--cyan` | composer send, generating shimmer, assistant summary |
| Error / edit / mute | `--coral` | error toast, invalid row, mute active |
| Playhead / selection / solo | `--amber` | current step, selected event, solo planned |
| Idle text/data | `--muted`, `--dim` | inactive status, labels, supporting data |
| App depth | `--base`, `--panel`, `--raised` | app shell, panels, controls |

Rules:

- One semantic accent per local state.
- Coral is not decorative; reserve it for edit/error/mute.
- Amber means playhead or selection, not generic emphasis.
- Lime means audible musical activity.
- Cyan means AI/generation/send.

## Motion Rules

Music-reactive UI can move, but it must not move layout.

Allowed:

- color transitions;
- opacity changes;
- meter fill height;
- playhead translation inside fixed grid;
- subtle scale inside fixed cell bounds;
- shimmer inside fixed container;
- beat flash inside fixed lane height.

Avoid:

- changing row heights while playing;
- changing button/container dimensions during state changes;
- reflowing track lanes on every beat;
- using motion as decoration without musical meaning;
- unrelated background animation.

Motion tokens:

- hover/icon: `120ms`;
- toggle/toast/drawer: `180ms`;
- generation/status pulse: `700ms`;
- active beat flash: `160ms`.

## Component Consumption

### Transport

Required consumers:

- `isPlaying`
- `isLooping`
- `bpm`
- `bars`
- `currentStep`
- `generationState`
- `error`

Behavior:

- Play button uses lime fill only when `isPlaying`.
- Stop resets visual playhead to step `0`.
- BPM and Bars controls commit full `currentSong` updates and then reload player.
- Key remains read-only until transposition exists.

### Track Lanes

Required consumers:

- `track.role`
- `track.muted`
- `track.gain`
- `track.events`
- `activeEventSteps`
- `meterLevel`
- `selectedEventStep`
- `currentStep`

Behavior:

- Drums render step hits.
- Synth tracks render note blocks using `event.step` and `event.dur`.
- Muted tracks reduce opacity but keep geometry.
- Active events can flash within fixed cells/blocks.
- Selection uses amber.

### Visualizers

Required consumers:

- `isPlaying`
- `bpm`
- `currentStep`
- `currentBeatInBar`
- `meterLevel` per track
- `generationState`

Behavior:

- Ready state is calm and legible.
- Playing state responds to beat/meter.
- Generating state switches to cyan shimmer.
- Error state pauses motion and exposes recovery affordance.

### Chat And Composer

Required consumers:

- `generationState`
- `error`
- last prompt;
- latest assistant summary;
- current song metadata.

Behavior:

- Composer disabled during `generating`.
- Send action is cyan.
- Assistant messages are short summaries.
- Errors show retry without hiding previous valid song.

### Inspector

Required consumers:

- current `Song JSON`;
- validation results;
- request payload;
- player/backend error.

Behavior:

- JSON preview reflects current song after edits.
- Validation rows use semantic state.
- Technical paths use mono typography.

## Layout Independence

Every UI asset should specify which music signals it consumes.

Good:

```text
This visualizer consumes isPlaying, currentStep, currentBeatInBar, meterLevelByTrack, and generationState.
It can be placed in desktop studio, mobile studio, or performance mode without changing the data contract.
```

Avoid:

```text
This animation depends on the third row of the desktop layout being 420px wide.
```

## Claude Prompt Add-On

Use this block in future Claude Design prompts:

```text
Design every visual pattern as a consumer of the shared PromptBeats music-reactive UI contract.

Shared music UI signals:
- isPlaying
- isLooping
- bpm
- bars
- stepsPerBar = 16
- totalSteps
- currentStep
- currentBar
- currentBeatInBar
- currentStepProgress
- activeEventSteps by track
- meterLevel by track
- peakLevel by track
- mutedTracks
- selectedTrackId
- selectedEventStep
- generationState
- errorState

The visual design may vary, but the state contract must stay the same.
Do not bind animation logic to a specific layout.
Use fixed-size containers so music-reactive motion never changes layout.
Every proposed visualizer, track lane, transport, chat state, or inspector variant must explicitly state which signals it consumes.
```

## Handoff Checklist

Before accepting a Claude-generated UI variant, check:

- It uses only PromptBeats design tokens.
- It does not introduce `pattern` or `notes`.
- It declares consumed music signals.
- It keeps geometry stable while playing/generating/error states change.
- It maps colors semantically.
- It supports ready, playing, generating, and error states.
- It leaves previous valid song playable after recoverable errors.
- It can fit desktop and mobile with the same state contract.

