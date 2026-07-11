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

Run the following one line at a time. The edit simulates A's manual controls:
it changes BPM, mutes drums, lowers bass gain, and reloads the complete Song.
Playback should remain active after the reload. `stop()` should reset the
position, emit step `0`, and silence any active tail immediately.

```js
await player.play();
await player.load({
  ...song,
  bpm: 90,
  tracks: song.tracks.map((track) => (
    track.id === "drums"
      ? { ...track, muted: true }
      : { ...track, gain: 0.35 }
  )),
});
console.assert(player.isPlaying());
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
- BPM, mute, and gain from the reloaded Song JSON take effect without adding Player methods.
- `steps.at(-1)` is `0` after `stop()`.
