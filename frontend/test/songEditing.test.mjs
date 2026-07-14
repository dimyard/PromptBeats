import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addTrack,
  moveTrack,
  setSongBars,
  setSongBpm,
  setTrackGain,
  setTrackMuted,
  setTrackSound,
  toggleDrumStep,
  toggleSynthStep,
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
    const good = setTrackSound(song, "drums", "techno_kit");
    assert.equal(bad.tracks[0].sound, "lofi_kit");
    assert.equal(good.tracks[0].sound, "techno_kit");
  });

  it("allows sampled_piano on synth tracks", () => {
    const next = setTrackSound(song, "bass", "sampled_piano");
    assert.equal(next.tracks[1].sound, "sampled_piano");
  });

  it("toggles sampler hits in track.events", () => {
    const added = toggleDrumStep(song, "drums", 4, "F#2");
    assert.equal(added.tracks[0].events.some((event) => event.step === 4 && event.note === "F#2"), true);
    const removed = toggleDrumStep(added, "drums", 4, "F#2");
    assert.equal(removed.tracks[0].events.some((event) => event.step === 4 && event.note === "F#2"), false);
  });

  it("toggles synth notes by step and keeps other notes for chords", () => {
    const addedC = toggleSynthStep(song, "bass", 4, "C2");
    const addedE = toggleSynthStep(addedC, "bass", 4, "E2");
    const bassEvents = addedE.tracks[1].events.filter((event) => event.step === 4);
    assert.deepEqual(bassEvents, [
      { step: 4, note: "C2", dur: 1, vel: 0.8 },
      { step: 4, note: "E2", dur: 1, vel: 0.8 },
    ]);

    const removedC = toggleSynthStep(addedE, "bass", 4, "C2");
    const remainingStepEvents = removedC.tracks[1].events.filter((event) => event.step === 4);
    assert.deepEqual(remainingStepEvents, [{ step: 4, note: "E2", dur: 1, vel: 0.8 }]);
  });

  it("adds a compatible empty track with a unique id", () => {
    const next = addTrack(song, { role: "drums", instrument: "sampler", sound: "trap_kit" });
    const added = next.tracks.at(-1);
    assert.equal(added.id, "drums_2");
    assert.equal(added.instrument, "sampler");
    assert.equal(added.sound, "trap_kit");
    assert.deepEqual(added.events, []);
  });

  it("adds sampled_piano as a compatible synth track", () => {
    const next = addTrack(song, { role: "lead", instrument: "synth", sound: "sampled_piano" });
    const added = next.tracks.at(-1);
    assert.equal(added.id, "lead");
    assert.equal(added.instrument, "synth");
    assert.equal(added.sound, "sampled_piano");
    assert.deepEqual(added.events, []);
  });

  it("moves tracks by id without changing track objects", () => {
    const next = moveTrack(song, "bass", "drums");
    assert.deepEqual(next.tracks.map((track) => track.id), ["bass", "drums"]);
    assert.equal(next.tracks[0], song.tracks[1]);
    assert.deepEqual(song.tracks.map((track) => track.id), ["drums", "bass"]);
  });

  it("keeps the same song when moving unknown or same track", () => {
    assert.equal(moveTrack(song, "missing", "drums"), song);
    assert.equal(moveTrack(song, "drums", "drums"), song);
  });
});
