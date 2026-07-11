// End-to-end pipeline on the offline `mock` provider (no network, no key).
// LLM_PROVIDER is read lazily at request time, so setting it here is enough.
process.env.LLM_PROVIDER = "mock";

import { test } from "node:test";
import assert from "node:assert/strict";
import { compose } from "../src/compose.js";
import { validateSong } from "../src/validate.js";

test("compose generate (mock) -> schema-valid song", async () => {
  const { song, message } = await compose({ prompt: "лоу-фай 72 bpm", song: null });
  assert.equal(validateSong(song).ok, true);
  assert.equal(song.bpm, 72);
  assert.ok(message.length > 0);
});

test("compose edit (mock) -> schema-valid song", async () => {
  const { song: gen } = await compose({ prompt: "лоу-фай 72 bpm", song: null });
  const { song } = await compose({ prompt: "быстрее", song: gen });
  assert.equal(validateSong(song).ok, true);
  assert.equal(song.bpm, 87); // +15
});
