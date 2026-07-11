import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveMusicUiState } from "../src/musicUiState.js";

const song = {
  version: 1,
  bpm: 90,
  bars: 2,
  tracks: [
    {
      id: "drums",
      role: "drums",
      instrument: "sampler",
      sound: "lofi_kit",
      gain: 0.8,
      events: [
        { step: 0, note: "C2", vel: 1 },
        { step: 4, note: "D2", vel: 0.5 },
      ],
    },
    {
      id: "bass",
      role: "bass",
      instrument: "synth",
      sound: "sine_bass",
      gain: 0.5,
      muted: true,
      events: [{ step: 4, note: "A1", dur: 8, vel: 0.9 }],
    },
  ],
};

describe("deriveMusicUiState", () => {
  it("derives playback position from a 16-step-per-bar contract", () => {
    const state = deriveMusicUiState(song, { isPlaying: true, currentStep: 20 });
    assert.equal(state.playback.bpm, 90);
    assert.equal(state.playback.bars, 2);
    assert.equal(state.playback.stepsPerBar, 16);
    assert.equal(state.playback.totalSteps, 32);
    assert.equal(state.playback.currentBar, 1);
    assert.equal(state.playback.currentBeatInBar, 1);
  });

  it("derives active event steps and meter per track", () => {
    const state = deriveMusicUiState(song, { isPlaying: true, currentStep: 4 });
    const drums = state.tracks.find((track) => track.trackId === "drums");
    const bass = state.tracks.find((track) => track.trackId === "bass");
    assert.deepEqual(drums.activeEventSteps, [4]);
    assert.equal(drums.meterLevel, 0.4);
    assert.deepEqual(bass.activeEventSteps, [4]);
    assert.equal(bass.meterLevel, 0);
    assert.deepEqual(state.mutedTracks, ["bass"]);
  });

  it("accepts preview meter overrides without mutating song", () => {
    const state = deriveMusicUiState(song, { isPlaying: false, currentStep: 0 }, { meterLevelByTrack: { drums: 0.73 } });
    assert.equal(state.tracks[0].meterLevel, 0.73);
    assert.equal(song.tracks[0].events.length, 2);
  });

  it("normalizes error state and selection", () => {
    const state = deriveMusicUiState(
      song,
      { isPlaying: false, currentStep: 99 },
      { selectedTrackId: "drums", selectedEventStep: 4, errorState: "backend down" },
    );
    assert.equal(state.playback.currentStep, 31);
    assert.equal(state.selectedTrackId, "drums");
    assert.equal(state.selectedEventStep, 4);
    assert.equal(state.generationState, "error");
    assert.equal(state.error.message, "backend down");
    assert.equal(state.error.recoverable, true);
  });
});
