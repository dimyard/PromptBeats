import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSong } from "../src/validate.js";

// bars:2 -> totalSteps 32, valid step range 0..31
const base = () => ({
  version: 1, title: "t", bpm: 90, key: "A minor", bars: 2,
  tracks: [
    {
      id: "d", role: "drums", instrument: "sampler", sound: "lofi_kit",
      events: [
        { step: 0, note: "C2" },
        { step: 40, note: "D2" }, // out of range -> dropped
        { step: -1, note: "E2" }, // out of range -> dropped
        { step: 8, note: "C2", dur: 100 }, // dur clamped to 24
      ],
    },
    { id: "d", role: "bass", instrument: "synth", sound: "sine_bass", events: [{ step: 0, note: "A1" }] },
  ],
});

test("drops out-of-range step events", () => {
  const { song, stats } = normalizeSong(base());
  assert.deepEqual(song.tracks[0].events.map((e) => e.step), [0, 8]);
  assert.equal(stats.droppedEvents, 2);
});

test("clamps dur to loop end", () => {
  const { song, stats } = normalizeSong(base());
  const ev = song.tracks[0].events.find((e) => e.step === 8);
  assert.equal(ev.dur, 24); // 32 - 8
  assert.equal(stats.clampedDurs, 1);
});

test("dedups duplicate track ids", () => {
  const { song, stats } = normalizeSong(base());
  assert.deepEqual(song.tracks.map((t) => t.id), ["d", "d-2"]);
  assert.equal(stats.renamedIds, 1);
});

test("leaves a clean song untouched (zero stats)", () => {
  const clean = {
    version: 1, bpm: 90, bars: 1,
    tracks: [{ id: "x", role: "lead", instrument: "synth", sound: "saw_lead", events: [{ step: 0, note: "C4" }] }],
  };
  const { stats } = normalizeSong(clean);
  assert.deepEqual(stats, { clampedDurs: 0, droppedEvents: 0, renamedIds: 0 });
});
