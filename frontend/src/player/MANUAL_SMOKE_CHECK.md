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
```

Run the following one line at a time. `step` values should advance within
`0..15`; `stop()` should reset the position and emit step `0`.

```js
await player.play();
player.isPlaying();
player.stop();
player.isPlaying();
steps.at(-1);
offReady(); offError(); offStep(); player.dispose();
```

Expected results:

- Both assertions pass without a thrown error.
- The player reports `unknown_sound` and `event_out_of_range`, but remains usable.
- `isPlaying()` is `true` after `play()` and `false` after `stop()`.
- `steps.at(-1)` is `0` after `stop()`.
