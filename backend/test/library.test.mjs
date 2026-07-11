import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLibraryStore } from "../src/library.js";

// A minimal valid Song JSON v1 (mirrors sample-song.json shape).
const song = (over = {}) => ({
  version: 1,
  title: "lofi sketch",
  bpm: 75,
  key: "A minor",
  bars: 2,
  tracks: [
    { id: "drums", role: "drums", instrument: "sampler", sound: "lofi_kit", events: [{ step: 0, note: "C2" }] },
    { id: "bass", role: "bass", instrument: "synth", sound: "sine_bass", events: [{ step: 0, note: "A1" }] },
  ],
  ...over,
});

// Fresh temp file per store so tests are isolated.
let tmpCounter = 0;
function freshStore() {
  const file = path.join(os.tmpdir(), `pb-lib-${process.pid}-${tmpCounter++}.json`);
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* ignore */
  }
  // Deterministic clock + ids so ordering/update assertions are stable.
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
  let idN = 0;
  const genId = () => `lib_test_${idN++}`;
  return { store: createLibraryStore({ filePath: file, clock, genId }), file };
}

test("save a new song -> created, with id/timestamps and stored", async () => {
  const { store } = freshStore();
  const res = await store.save({ song: song() });
  assert.equal(res.status, "created");
  assert.equal(res.track.title, "lofi sketch");
  assert.match(res.track.id, /^lib_/);
  assert.ok(res.track.createdAt);
  assert.equal(res.track.createdAt, res.track.updatedAt);
  assert.deepEqual(res.track.summary, { bpm: 75, bars: 2, key: "A minor", tracks: 2 });

  const list = await store.list();
  assert.equal(list.length, 1);
});

test("saving the same song again -> duplicate, store does not grow", async () => {
  const { store } = freshStore();
  const first = await store.save({ song: song() });
  const again = await store.save({ song: song() });
  assert.equal(again.status, "duplicate");
  assert.equal(again.track.id, first.track.id);
  const list = await store.list();
  assert.equal(list.length, 1);
});

test("duplicate detection is insensitive to object key order", async () => {
  const { store } = freshStore();
  await store.save({ song: song() });
  // Same content, keys declared in a different order.
  const reordered = { tracks: song().tracks, bars: 2, key: "A minor", bpm: 75, title: "lofi sketch", version: 1 };
  const res = await store.save({ song: reordered });
  assert.equal(res.status, "duplicate");
});

test("same title, different content, no overwrite -> title_conflict, not saved", async () => {
  const { store } = freshStore();
  const first = await store.save({ song: song() });
  const res = await store.save({ song: song({ bpm: 120 }) });
  assert.equal(res.status, "title_conflict");
  assert.equal(res.track.id, first.track.id);
  const list = await store.list();
  assert.equal(list.length, 1);
  const full = await store.get(first.track.id);
  assert.equal(full.song.bpm, 75); // original content untouched
});

test("same title with overwrite:true -> updated in place, timestamp bumped", async () => {
  const { store } = freshStore();
  const first = await store.save({ song: song() });
  const res = await store.save({ song: song({ bpm: 120 }), overwrite: true });
  assert.equal(res.status, "updated");
  assert.equal(res.track.id, first.track.id);
  assert.equal(res.track.summary.bpm, 120);
  assert.notEqual(res.track.updatedAt, first.track.createdAt);
  const list = await store.list();
  assert.equal(list.length, 1);
  const full = await store.get(first.track.id);
  assert.equal(full.song.bpm, 120);
});

test("explicit title overrides song.title and is written into the stored song", async () => {
  const { store } = freshStore();
  const res = await store.save({ song: song(), title: "my beat" });
  assert.equal(res.status, "created");
  assert.equal(res.track.title, "my beat");
  const full = await store.get(res.track.id);
  assert.equal(full.song.title, "my beat");
});

test("list returns light metadata (no song) sorted by updatedAt desc", async () => {
  const { store } = freshStore();
  await store.save({ song: song({ title: "one" }) });
  await store.save({ song: song({ title: "two" }) });
  const list = await store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].title, "two"); // most recently saved first
  assert.equal(list[1].title, "one");
  assert.equal(list[0].song, undefined);
  assert.ok(list[0].summary);
});

test("get returns full song; unknown id -> null", async () => {
  const { store } = freshStore();
  const saved = await store.save({ song: song() });
  const got = await store.get(saved.track.id);
  assert.equal(got.id, saved.track.id);
  assert.equal(got.song.bpm, 75);
  assert.equal(await store.get("nope"), null);
});

test("missing store file reads as an empty library", async () => {
  const { store } = freshStore();
  const list = await store.list();
  assert.deepEqual(list, []);
});

test("corrupt store file reads as an empty library (does not throw)", async () => {
  const { store, file } = freshStore();
  fs.writeFileSync(file, "{ not json");
  const list = await store.list();
  assert.deepEqual(list, []);
});
