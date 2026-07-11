import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  setSongBars,
  setSongBpm,
  setTrackGain,
  setTrackMuted,
  setTrackSound,
  toggleDrumStep,
} from "../src/songEditing.js";

const song = {
  version: 1,
  title: "test",
  bpm: 75,
  key: "A minor",
  bars: 2,
  tracks: [
    {
      id: "drums",
      role: "drums",
      instrument: "sampler",
      sound: "lofi_kit",
      gain: 0.8,
      events: [{ step: 0, note: "C2", vel: 0.9 }],
    },
    {
      id: "bass",
      role: "bass",
      instrument: "synth",
      sound: "sine_bass",
      gain: 0.7,
      events: [
        { step: 0, note: "A1", dur: 16, vel: 0.8 },
        { step: 20, note: "G1", dur: 16, vel: 0.8 },
      ],
    },
  ],
};

describe("song editing helpers", () => {
  it("clamps bpm to contract range", () => {
    assert.equal(setSongBpm(song, 20).bpm, 40);
    assert.equal(setSongBpm(song, 300).bpm, 220);
    assert.equal(setSongBpm(song, 92).bpm, 92);
  });

  it("normalizes events when bars shrink", () => {
    const next = setSongBars(song, 1);
    const bass = next.tracks.find((track) => track.id === "bass");
    assert.equal(next.bars, 1);
    assert.deepEqual(bass.events, [{ step: 0, note: "A1", dur: 16, vel: 0.8 }]);
  });

  it("updates track mute and gain without touching other tracks", () => {
    const muted = setTrackMuted(song, "drums", true);
    const gained = setTrackGain(muted, "bass", 1.4);
    assert.equal(gained.tracks[0].muted, true);
    assert.equal(gained.tracks[1].gain, 1);
  });

  it("keeps sound compatible with instrument", () => {
    const bad = setTrackSound(song, "drums", "sine_bass");
    const good = setTrackSound(song, "drums", "trap_kit");
    assert.equal(bad.tracks[0].sound, "lofi_kit");
    assert.equal(good.tracks[0].sound, "trap_kit");
  });

  it("toggles sampler hits in track.events", () => {
    const added = toggleDrumStep(song, "drums", 4, "F#2");
    assert.equal(added.tracks[0].events.some((event) => event.step === 4 && event.note === "F#2"), true);
    const removed = toggleDrumStep(added, "drums", 4, "F#2");
    assert.equal(removed.tracks[0].events.some((event) => event.step === 4 && event.note === "F#2"), false);
  });
});
