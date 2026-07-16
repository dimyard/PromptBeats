import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPartEvents } from "./index.js";

test("buildPartEvents sorts events by step before Tone.Part scheduling", () => {
  const events = [
    { step: 12, note: "A#2", dur: 1 },
    { step: 0, note: "C2", dur: 1 },
    { step: 4, note: "F#2", dur: 1 },
  ];

  assert.deepEqual(buildPartEvents(events, 16), [
    ["0:0:0", { step: 0, note: "C2", dur: 1 }],
    ["0:1:0", { step: 4, note: "F#2", dur: 1 }],
    ["0:3:0", { step: 12, note: "A#2", dur: 1 }],
  ]);
});

test("buildPartEvents drops out-of-loop events and clamps duration", () => {
  const events = [
    { step: 14, note: "C4", dur: 8 },
    { step: 20, note: "E4", dur: 1 },
  ];

  assert.deepEqual(buildPartEvents(events, 16), [
    ["0:3:2", { step: 14, note: "C4", dur: 2 }],
  ]);
});
