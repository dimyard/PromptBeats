# PromptBeats asset bank: prompts for Claude Design

Этот файл - банк промптов для генерации UI-ассетов и вариантов интерфейса вокруг дизайн-системы PromptBeats.

Использование: в каждый запрос Claude прикладывай актуальные файлы:

- `promptbeats-design-system.html`
- `promptbeats.design-tokens.json`
- `MUSIC_REACTIVE_UI_CONTRACT.md`
- при необходимости `STAGE3_CLAUDE_DESIGN_PROMPT.md`

Общий инвариант для всех промптов:

```text
Use the provided PromptBeats design system as the only visual source of truth.
Do not invent new colors, typography, spacing, shadows, radii, or decorative motifs.
Use existing tokens and component rules: graphite surfaces, lime for play/audible, cyan for AI/generation, coral for edit/error, amber for playhead/selection.
This is app UI for a beat sketching tool, not a landing page.
Avoid purple-blue AI gradients, blobs/orbs, oversized hero typography, nested cards, and old song fields like pattern/notes.
Use only Song JSON tracks[].events.
Design every visual pattern as a consumer of the shared PromptBeats music-reactive UI contract.
The visual design may vary, but the state contract must stay the same.
Do not bind animation logic to a specific layout.
Use fixed-size containers so music-reactive motion never changes layout.
Every proposed visualizer, track lane, transport, chat state, or inspector variant must explicitly state which music signals it consumes.
```

Общие music-reactive signals, которые Claude должен учитывать:

```text
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
```

## 01. Component Expansion Board

```text
You are expanding the PromptBeats design system asset bank.

Create a high-fidelity component board, not a product screen. Use the attached design system as the only visual source of truth.

Goal:
Generate a compact but comprehensive UI component sheet for PromptBeats so the frontend team can reuse patterns.

Include these component families:

1. Transport controls:
- Play active / inactive.
- Stop.
- Loop on / off.
- Disabled export.
- Icon-only buttons with tooltip state.

2. Inputs and selectors:
- Prompt composer idle / focused / disabled during generation.
- BPM stepper with min/max hints: 40..220.
- Bars selector: 1..32.
- Sound selector for sampler and synth catalogs.
- Gain slider in compact track row.

3. Status and feedback:
- Ready, Playing, Generating, Error pills.
- Backend error toast with Retry.
- Validation checklist rows: valid, warning, error.
- Loading shimmer for generation.

4. Song summary chips:
- bpm, key, bars, version, tracks count.
- Fixed-width numeric variants using mono typography.

5. Track controls:
- Mute on/off.
- Solo as planned/disabled.
- Level meter idle/active/peaking.

Deliverable:
Generate polished HTML/CSS/JS prototype for a single component board at 1440px wide.
Use realistic labels and tooltips, but no long explanatory copy inside the UI.
Add small section labels only where needed for scanning.
For each component family, include a compact note in code comments or data attributes describing the consumed music-reactive signals.
```

## 02. Transport Variants

```text
Design 6 alternative transport bars for PromptBeats using the attached design system.

Context:
PromptBeats is a compact AI beat sketcher. The transport bar is the main operational anchor: Play, Stop, Loop, BPM, Key, Bars, Status.

Rules:
- Use only PromptBeats tokens and components.
- Keep the bar dense, app-like, and DAW-inspired.
- Do not make it a hero/header.
- Use icon buttons for Play, Stop, Loop.
- Use mono typography for BPM, bars, key, status.
- Key is read-only.
- BPM is editable via stepper, allowed range 40..220.
- Bars is editable, allowed range 1..32.

Explore:
1. Minimal transport.
2. Data-rich transport.
3. Status-forward transport.
4. Mobile compressed transport.
5. Playing-state transport with moving playhead indicator.
6. Error-state transport with retry affordance.

Deliverable:
One HTML/CSS/JS page showing all 6 variants stacked vertically.
Each variant should be implementation-ready and fit within a 1440px desktop layout.
Add micro-interactions: hover, active, disabled, playing status.
Each variant must declare consumed signals: isPlaying, isLooping, bpm, bars, currentStep, generationState, errorState.
```

## 03. Track Lane Pattern Library

```text
Create a PromptBeats track lane pattern library.

Use the attached design system as the only visual source of truth.

Purpose:
We need multiple reusable row patterns for track visualization and manual editing.

Song model constraints:
- Tracks are in song.tracks.
- Events are only in track.events.
- Do not use pattern or notes fields.
- Drums use step hits.
- Bass/pad/lead use note blocks with dur.

Design these lane variants:

1. Drum lane:
- 16-step-per-bar grid.
- Velocity as opacity or height.
- Toggleable hit cells.
- Amber selected beat.

2. Bass lane:
- Note blocks with duration.
- Note labels appear only on hover or selected state.
- Gain meter active.

3. Pad lane:
- Long note blocks.
- Muted state with reduced opacity and disabled-looking controls.

4. Lead lane:
- Thin note blocks.
- Future disabled note editing affordance.

5. Empty lane:
- No events yet, with subtle add/generate hint.

6. Error lane:
- Invalid instrument/sound mismatch row.

Deliverable:
Generate an HTML/CSS/JS prototype showing all lane states in a single studio panel.
Include interactive toggles for mute and drum hits.
The layout must not shift when states change.
Each lane variant must declare consumed signals: currentStep, activeEventSteps by track, meterLevel by track, mutedTracks, selectedEventStep.
```

## 04. Visualizer Asset Bank

```text
Generate a bank of live visualizer concepts for PromptBeats.

Use the attached design system. Do not invent new visual language.

Goal:
Create 8 compact visualizer options that can sit above track lanes in the central Studio panel.

Visualizer concepts:
1. Equalizer bars.
2. Beat pulse grid.
3. Circular beat clock.
4. Horizontal waveform strip.
5. Step energy skyline.
6. Track-layer intensity stack.
7. Minimal playhead ruler.
8. Generating shimmer state.

States to show:
- Ready.
- Playing.
- Generating.
- Error/paused after backend failure.

Rules:
- Visualizers must feel alive without moving layout.
- Use fixed dimensions.
- Lime means audible/play.
- Cyan means generation.
- Amber means current beat/playhead.
- Coral only for error/edit.
- No decorative blobs, no AI gradient, no marketing background.

Deliverable:
Single HTML/CSS/JS page with a grid of visualizer prototypes.
Include a small mock control to switch all visualizers between ready, playing, generating, and error.
Each visualizer card must list its consumed signals, for example currentStep, currentBeatInBar, meterLevel by track, generationState.
```

## 05. Inspector Variants

```text
Design 5 right-side Inspector rail variants for PromptBeats.

Use only the attached design system.

Inspector responsibilities:
- Show Song JSON summary chips: version, bpm, key, bars, tracks count.
- Show validation checklist:
  - Schema valid.
  - role present.
  - events only.
  - instrument/sound match.
- Show collapsible JSON preview.
- Show request payload preview: { prompt, song }.
- Show backend/player error area.

Explore variants:
1. Minimal demo inspector.
2. Debug-heavy inspector.
3. Validation-first inspector.
4. JSON-first inspector.
5. Mobile drawer inspector.

Interaction requirements:
- Collapsible JSON preview.
- Copy JSON button.
- Error area can be expanded/collapsed.
- Chips update from mock song state.

Deliverable:
High-fidelity HTML/CSS/JS prototype with 5 side-by-side or stacked Inspector variants.
Keep it compact and operational, not document-like.
Each Inspector variant must declare which shared state it consumes: current Song JSON, validation results, request payload, generationState, errorState.
```

## 06. AI Chat And Composer Patterns

```text
Create a PromptBeats chat/composer pattern sheet.

Use the attached design system as the only visual source of truth.

Context:
PromptBeats is prompt-first, but it must not look like a generic AI chat app. The chat is a control surface for generating and editing music.

Design these patterns:

1. Empty chat with demo prompt chips.
2. Successful generation summary.
3. User asks for edit: "Ускорь до 90 и сделай бас громче".
4. Assistant short summary after edit.
5. Generating state with disabled composer.
6. Backend error state with retry.
7. Validation error message.
8. Composer with attached current song context chip.

Rules:
- Assistant messages must be short summaries, not long markdown.
- User bubbles are compact.
- Composer stays anchored.
- Prompt chips are practical actions.
- Cyan marks AI/generation/send.
- Coral marks error/retry only.

Deliverable:
HTML/CSS/JS component board focused on left chat panel patterns.
Include interactive mock states: idle, generating, error, success.
Declare consumed signals for each pattern: generationState, errorState, current song metadata, latest prompt, latest assistant summary.
```

## 07. Empty And First-Run States

```text
Design first-run and empty states for PromptBeats.

Use the attached PromptBeats design system.

Goal:
Create states that help a new user understand the 10-second demo loop: prompt -> generate -> play -> edit.

Design states:
1. App opened with no song.
2. Prompt typed but not submitted.
3. Generation in progress.
4. First generated song loaded.
5. No tracks returned / empty song error.
6. Player unavailable fallback.

Rules:
- Do not use marketing hero layout.
- First viewport must be the actual app shell.
- Empty states should sit inside the real chat/studio/inspector layout.
- Use concise UI copy only.
- Keep controls visible even in empty states.

Deliverable:
Generate a desktop 1440x900 prototype with a state switcher.
Each state should preserve the same app shell and show how the UI evolves.
The state switcher must drive the shared music-reactive contract rather than layout-specific animation flags.
```

## 08. Error And Recovery Kit

```text
Create an error and recovery UI kit for PromptBeats.

Use the attached design system. Coral is reserved for edit/error.

Error cases to design:
1. Backend timeout.
2. Invalid Song JSON.
3. Missing track.role.
4. Old pattern/notes fields detected.
5. Sound not found in fixed catalog.
6. Tone.js/player load failure.
7. Network disconnected.
8. Rate limit or provider overload.

For each case include:
- Compact inline message.
- Toast variant.
- Inspector detail row.
- Retry or repair action.
- What happens to transport controls.

Rules:
- Do not flood the UI with red/coral.
- Error messages must be human-readable and short.
- Keep the previous valid song playable when possible.
- Use mono for technical field names and JSON paths.

Deliverable:
One HTML/CSS/JS page showing error components and one full app-shell scenario.
Show how recoverable errors preserve the previous valid song and keep playback available when possible.
```

## 09. Mobile App Shell

```text
Design the responsive mobile state for PromptBeats using the attached design system.

Target:
Mobile viewport 390x844 and 430x932.

Desktop context:
The desktop app has left Chat, center Studio, right Inspector.

Mobile requirements:
- Chat appears above or as a top tab.
- Studio remains the main working area.
- Transport is sticky and always reachable.
- Composer is reachable without burying Play/Stop.
- Inspector is behind a toggle/drawer.
- Track lanes remain readable; use horizontal scroll only where necessary.
- JSON preview is collapsed by default.

States:
- Ready.
- Playing.
- Generating.
- Error.

Deliverable:
Generate HTML/CSS/JS prototype with responsive CSS.
Include desktop preview and mobile preview, or a viewport switcher.
No landing page. The first screen must be the actual usable app.
Mobile and desktop must consume the same music-reactive signals; only layout presentation changes.
```

## 10. Sound Catalog And Track Editing

```text
Design sound catalog and manual track editing patterns for PromptBeats.

Use the attached design system as the only visual source of truth.

Fixed catalog:
- sampler: lofi_kit, house_kit, trap_kit.
- synth: sine_bass, saw_lead, square_lead, soft_pad, pluck, fm_bell.

Manual controls:
- Mute/unmute track.
- Gain slider.
- Sound selector.
- Drum step toggles.
- Synth note editing shown as future/disabled.

Constraints:
- Controls update currentSong and call player.load(updatedSong) after commit.
- Do not invent live Player API methods.
- Key is not editable.

Design:
1. Compact sound selector dropdown.
2. Instrument/sound mismatch warning.
3. Track edit popover.
4. Disabled note editor preview.
5. Drum step editing affordance.
6. Gain and mute quick controls.

Deliverable:
Generate a component board plus one integrated track editing scenario.
Use realistic mock data and keep all controls compact.
Show how edits update Song JSON and then feed the same music-reactive UI contract after player reload.
```

## 11. Demo Narrative Screen States

```text
Create a sequence of 6 high-fidelity PromptBeats demo states.

Use the attached design system.

Purpose:
These screens will support a hackathon demo narrative and give us reusable assets for implementation.

Screens:
1. Start: no song, prompt chips visible.
2. Prompt submitted: generating state, cyan shimmer, composer disabled.
3. Song loaded: ready state, track lanes populated.
4. Playing: lime play button, amber playhead, meters active.
5. User edit request: chat shows "Ускорь до 90 и сделай бас громче".
6. Updated song: BPM 90, bass gain increased, assistant summary, JSON preview updated.

Rules:
- Keep the same app shell across all screens.
- Use short assistant summaries.
- Show actual Song JSON fields: bpm, bars, key, tracks[].events.
- Do not use pattern or notes.
- Make the sequence feel like a working product, not slides.

Deliverable:
Generate a single HTML/CSS/JS prototype with a stepper that moves through the 6 demo states.
The stepper should mutate shared music-reactive state: generationState, isPlaying, currentStep, meter levels, selected events, and updated Song JSON.
```

## 12. Microinteractions And Motion Spec

```text
Create a microinteraction prototype and motion spec for PromptBeats.

Use only the attached design system.

Motion tokens:
- fast: 120ms for hover/icon state.
- base: 180ms for toggle, toast, inspector slide.
- pulse: 700ms for generating/status pulse.
- beatFlash: 160ms for active beat flash.

Prototype these interactions:
1. Play button activates and meters start moving.
2. Stop resets playhead.
3. Loop toggle.
4. Drum hit toggle.
5. Mute track fade.
6. Gain slider with meter response.
7. Composer submit -> generating -> success.
8. Error toast enters and retries.
9. Inspector drawer opens/collapses.
10. JSON preview copy confirmation.

Rules:
- Motion must never cause layout shift.
- Animate color, opacity, transform, meter fill height, and playhead position only.
- Keep timings close to the provided tokens.

Deliverable:
Generate an interactive HTML/CSS/JS prototype with a small motion gallery.
For each interaction, include a compact label and a working control.
For each interaction, state which shared signal triggers it and which CSS property changes.
```

## 13. Accessibility And Keyboard States

```text
Design accessibility and keyboard interaction states for PromptBeats.

Use the attached design system.

Focus areas:
- Visible focus rings that fit the graphite UI.
- Keyboard navigation through transport, composer, track controls, inspector.
- Disabled vs read-only states.
- Tooltip behavior for icon-only controls.
- Error announcement areas.
- Reduced motion mode.

Components to include:
- Play/Stop/Loop buttons focused/active/disabled.
- BPM stepper focused and invalid edge state.
- Bars selector focused.
- Sound selector open with keyboard highlight.
- Drum step cell focused/selected.
- Composer focused/disabled.
- Inspector JSON copy button focused/success.

Rules:
- Do not add new colors beyond tokens; derive focus from cyan/amber carefully.
- Keep outlines visible on dark surfaces.
- UI must stay compact.

Deliverable:
Generate a component board with keyboard/focus states and a short implementation note in comments inside the HTML/CSS, not visible UI text.
Keyboard states must operate on the same controls that consume the music-reactive UI contract.
```

## 14. Dense Desktop Layout Explorations

```text
Explore 4 dense desktop layout alternatives for the full PromptBeats app shell.

Use the attached design system as the only visual source of truth.

Baseline zones:
- Chat.
- Studio.
- Inspector.

Explore:
1. Classic 3-column: chat / studio / inspector.
2. Studio-dominant: narrow chat, wide tracks, collapsible inspector.
3. Chat-dominant prompt lab: larger chat, compact studio preview.
4. Performance mode: transport and lanes dominate, chat and inspector minimized.

Requirements:
- Each layout must fit 1440x900.
- No landing hero.
- No nested cards.
- Track lanes must stay readable.
- Transport remains visible.
- Composer remains reachable.
- Inspector can collapse but not disappear completely.

Deliverable:
Generate one HTML/CSS/JS prototype with a layout switcher showing all 4 alternatives.
Use the same mock song data in each layout.
All 4 layouts must consume the same shared music-reactive state object; the layout switcher must not change the underlying state model.
```

## 15. Implementation Handoff Sheet

```text
Create an implementation handoff sheet for PromptBeats UI assets.

Use the attached design system and generate code-oriented design documentation.

Include:
- Token table: color, type, space, radius, semantic roles.
- Component anatomy diagrams for:
  - Transport bar.
  - Track lane.
  - Chat message.
  - Composer.
  - Inspector validation row.
  - Toast.
- State matrix:
  - ready, playing, generating, error.
- Interaction matrix:
  - user action, state change, visual feedback, affected Song JSON field.
- CSS variable export.

Rules:
- The deliverable should be visual and readable, but compact.
- Do not create a marketing page.
- Use real component examples, not abstract documentation blocks.
- Keep all visual examples consistent with PromptBeats tokens.

Deliverable:
Generate a polished HTML/CSS handoff page that frontend engineers can use as a reference while implementing the app.
Include the music-reactive UI contract as a first-class handoff section with consumed signals per component.
```
