import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { PIANO_SAMPLE_URLS, getPianoSampleBaseUrl, reserveDrumTriggerTime } from "./sounds.js";

test("sampled piano uses bundled sample path by default", () => {
  assert.equal(getPianoSampleBaseUrl({}), "/samples/piano/");
});

test("sampled piano accepts an explicit global sample path override", () => {
  const globals = { PROMPTBEATS_PIANO_SAMPLE_BASE_URL: "/custom/piano" };
  assert.equal(getPianoSampleBaseUrl(globals), "/custom/piano/");
});

test("sampled piano sample map uses wav files committed under public samples", () => {
  assert.deepEqual(PIANO_SAMPLE_URLS, {
    C1: "C1.wav",
    "F#1": "Fs1.wav",
    B1: "B1.wav",
    "D#2": "Ds2.wav",
    "F#2": "Fs2.wav",
    B2: "B2.wav",
    "D#3": "Ds3.wav",
    "F#3": "Fs3.wav",
    A3: "A3.wav",
    C4: "C4.wav",
    "D#4": "Ds4.wav",
    "F#4": "Fs4.wav",
    A4: "A4.wav",
    C5: "C5.wav",
    "D#5": "Ds5.wav",
    "F#5": "Fs5.wav",
    A5: "A5.wav",
    C6: "C6.wav",
    "D#6": "Ds6.wav",
    "F#6": "Fs6.wav",
    A6: "A6.wav",
    C7: "C7.wav",
    "D#7": "Ds7.wav",
    "F#7": "Fs7.wav",
    A7: "A7.wav",
    B7: "B7.wav",
  });
});

test("all sampled piano wav files exist in public samples", () => {
  const sampleDir = new URL("../../public/samples/piano/", import.meta.url);
  for (const fileName of Object.values(PIANO_SAMPLE_URLS)) {
    assert.equal(
      fs.existsSync(new URL(fileName, sampleDir)),
      true,
      `${fileName} is missing`,
    );
  }
});

test("reserveDrumTriggerTime nudges repeated drum starts forward", () => {
  const lastStarts = new Map();

  assert.equal(reserveDrumTriggerTime(lastStarts, "openhat", 1), 1);
  assert.equal(reserveDrumTriggerTime(lastStarts, "openhat", 1), 1.0001);
  assert.equal(reserveDrumTriggerTime(lastStarts, "openhat", 0.5), 1.0002);
  assert.equal(reserveDrumTriggerTime(lastStarts, "closedhat", 0.5), 0.5);
});
