# Player Manual Smoke Check

No JavaScript test runner is configured for the frontend. Run this check in a
browser with WebAudio enabled after starting the Vite development server:

```powershell
cd frontend
npm run dev
```

Open the local Vite URL, then paste the following into DevTools Console. Run
the `play()` line manually so it is a browser user gesture.

```js
const { createPlayer } = await import("/src/player/index.js");

const song = {
  bpm: 120,
  bars: 1,
  tracks: [
    {
      id: "drums",
      instrument: "sampler",
      sound: "lofi_kit",
      events: [{ step: 0, note: "C2", vel: 0.8 }],
    },
    {
      id: "bass",
      instrument: "synth",
      sound: "sine_bass",
      events: [{ step: 0, note: "A1", dur: 4, vel: 0.8 }],
    },
  ],
};

const player = createPlayer();
const ready = [];
const errors = [];
const steps = [];
const offReady = player.on("ready", (payload) => ready.push(payload));
const offError = player.on("error", (payload) => errors.push(payload));
const offStep = player.on("step", (step) => steps.push(step));

await player.load(song);
await player.load(song);
console.assert(ready.length === 2 && ready.every(({ totalSteps }) => totalSteps === 16));

await player.load({
  ...song,
  tracks: [{
    ...song.tracks[0],
    sound: "missing_kit",
    events: [...song.tracks[0].events, { step: 16, note: "C2" }],
  }],
});
console.assert(errors.some(({ code }) => code === "unknown_sound"));
console.assert(errors.some(({ code }) => code === "event_out_of_range"));

await player.load({
  ...song,
  tracks: [{ ...song.tracks[1], sound: "lofi_kit" }],
});
console.assert(errors.some(({ code, details }) => (
  code === "unknown_sound" && details?.reason === "instrument_sound_mismatch"
)));
```

Run the following one line at a time. The edit simulates A's manual controls:
it changes BPM, mutes drums, lowers bass gain, adds a future bass note, and
reloads the complete Song. With unchanged `bars`, playback and the current
Transport position must survive the reload. The new note should play in the
current loop if its step is still ahead, otherwise on the next loop.
`stop()` should reset the position, emit step `0`, and silence any active tail
immediately.

```js
await player.play();
const currentStep = steps.at(-1) ?? 0;
const futureStep = (currentStep + 4) % 16;
await player.load({
  ...song,
  bpm: 90,
  tracks: song.tracks.map((track) => (
    track.id === "drums"
      ? { ...track, muted: true }
      : {
        ...track,
        gain: 0.35,
        events: [...track.events, { step: futureStep, note: "C2", dur: 1, vel: 0.8 }],
      }
  )),
});
console.assert(player.isPlaying());
console.log("new bass note scheduled for step", futureStep);
player.isPlaying();
player.stop();
player.isPlaying();
steps.at(-1);
offReady(); offError(); offStep(); player.dispose();
```

Expected results:

- Both assertions pass without a thrown error.
- The player reports `unknown_sound` and `event_out_of_range`, but remains usable.
- A synth track with a kit sound reports the contract-safe `unknown_sound` code with mismatch details.
- `isPlaying()` is `true` after `play()` and `false` after `stop()`.
- BPM, mute, and gain from the reloaded Song JSON take effect without adding Player methods.
- With unchanged Bars, a running `load()` does not restart the playhead; a future edited step plays this loop,
  while a passed step waits for the next loop.
- `steps.at(-1)` is `0` after `stop()`.

## WAV export (offline render)

Load the repo's `sample-song.json` (bpm 75, bars 2) and render it offline to a
WAV file. `exportWav` does not touch live playback — you can call it while a
track is playing. Paste this into the DevTools Console:

```js
const { createPlayer } = await import("/src/player/index.js");

// sample-song.json lives at the repo root; adjust the path if the dev server
// does not serve it, or paste the JSON object inline.
const song = await fetch("/sample-song.json").then((r) => r.json());

const player = createPlayer();
await player.load(song);

// No argument -> renders the last loaded Song. Passing `song` is equivalent.
const blob = await player.exportWav();          // or: await player.exportWav(song)
console.log("blob type:", blob.type, "bytes:", blob.size);
console.assert(blob.type === "audio/wav");

// Decode to confirm the duration ≈ bars * 4 * 60 / bpm.
const ac = new AudioContext();
const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
console.log("channels:", decoded.numberOfChannels, "sampleRate:", decoded.sampleRate);
console.log("duration:", decoded.duration.toFixed(3), "s (expected ≈ 6.4 s)");

// Download and listen: the loop should play cleanly and non-empty.
const a = Object.assign(document.createElement("a"), {
  href: URL.createObjectURL(blob),
  download: "sample-song.wav",
});
a.click();
URL.revokeObjectURL(a.href);
```

Expected results:

- `blob.type === "audio/wav"` and `blob.size` is non-trivial (tens/hundreds of KB,
  not 44 bytes — the WAV must contain actual audio, not just a header).
- Decoded `duration` ≈ **6.4 s** for `sample-song.json` (`2 * 4 * 60 / 75`).
- The downloaded `sample-song.wav` opens in any audio player and you can hear the
  drums + bass + pad loop. Synth release tails at the loop boundary are truncated
  (known MVP limit).
- Calling `exportWav()` during `play()` does not interrupt or alter playback.

## Import / export UI (App, owner A)

Manual checks for the import overlay and export buttons (see `src/song-io.js`,
`docs/superpowers/specs/2026-07-11-import-export-audio-design.md`). Start the dev
server and open the app. Load a track first (click **Пример**).

1. **Экспорт JSON** — click it: a `<title>.json` downloads and re-imports cleanly.
2. **Сохранить WAV** — click it: the button shows `Рендер…` (cyan pulse), then a
   `<title>.wav` downloads and a `WAV сохранён` toast appears.
3. **Импорт → вставка текстом** — click **Импорт**, paste a valid Song JSON into the
   textarea, click **Импортировать**: overlay flashes lime, closes, the track swaps.
4. **Импорт → файл** — click **Импорт → Выбрать файл**, pick an exported `.json`:
   same result.
5. **Импорт → drag-n-drop** — drag a `.json` file from the OS anywhere onto the app:
   the overlay auto-opens, the drop-zone turns cyan; drop → track swaps. Dragging the
   file away (without dropping) closes the auto-opened overlay.
6. **Ошибка импорта** — paste `{ broken ]` and submit: drop-zone turns coral and
   shakes, a human-readable JSON error shows, the overlay stays open and the current
   track is unchanged.
7. **prefers-reduced-motion** — with the OS "reduce motion" setting on, the overlay,
   flash, shimmer and shake are disabled (state changes are instant).
