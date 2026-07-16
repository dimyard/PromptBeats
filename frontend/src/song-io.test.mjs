// Unit tests for song-io.js — pure ESM module, runs in Node (no DOM).
// Run: node --test  (from frontend/)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  serializeSong,
  parseSong,
  validateSong,
  normalizeImportedSong,
  songFilename,
  downloadBlob,
} from "./song-io.js";

const sample = JSON.parse(
  fs.readFileSync(new URL("../../sample-song.json", import.meta.url), "utf8"),
);

// A minimal but valid song we can mutate per-test without touching the fixture.
function baseSong() {
  return {
    version: 1,
    title: "test",
    bpm: 90,
    bars: 1,
    tracks: [
      {
        id: "drums",
        role: "drums",
        instrument: "sampler",
        sound: "lofi_kit",
        events: [{ step: 0, note: "C2", vel: 0.9 }],
      },
    ],
  };
}

// ---- round-trip ----------------------------------------------------------

test("round-trip: parseSong(serializeSong(sample)).song equals normalizeImportedSong(sample).song", () => {
  const res = parseSong(serializeSong(sample));
  assert.equal(res.ok, true, `parse failed: ${res.error}`);
  const normalized = normalizeImportedSong(sample).song;
  assert.deepEqual(res.song, normalized);
});

test("serializeSong is pretty-printed with trailing newline", () => {
  const text = serializeSong(sample);
  assert.equal(text, JSON.stringify(sample, null, 2) + "\n");
  assert.ok(text.endsWith("\n"));
});

// ---- validateSong rejections --------------------------------------------

test("rejects version !== 1", () => {
  const song = baseSong();
  song.version = 2;
  const res = validateSong(song);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /version/i.test(e)), res.errors.join("; "));
});

test("rejects bpm out of range", () => {
  const song = baseSong();
  song.bpm = 400;
  const res = validateSong(song);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /bpm/i.test(e)), res.errors.join("; "));
});

test("rejects invalid instrument<->sound pair (sampler + saw_lead)", () => {
  const song = baseSong();
  song.tracks[0].instrument = "sampler";
  song.tracks[0].sound = "saw_lead";
  const res = validateSong(song);
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => /пара/i.test(e) && /saw_lead/.test(e)),
    res.errors.join("; "),
  );
});

test("rejects duplicate track ids", () => {
  const song = baseSong();
  song.tracks.push({
    id: "drums",
    role: "bass",
    instrument: "synth",
    sound: "sine_bass",
    events: [],
  });
  const res = validateSong(song);
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => /дубл/i.test(e) || /уникал/i.test(e)),
    res.errors.join("; "),
  );
});

test("rejects tracks that is not an array of 1..12", () => {
  const song = baseSong();
  song.tracks = [];
  const res = validateSong(song);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /tracks/i.test(e)), res.errors.join("; "));
});

test("rejects bad note pattern", () => {
  const song = baseSong();
  song.tracks[0].events = [{ step: 0, note: "H9" }];
  const res = validateSong(song);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /note/i.test(e)), res.errors.join("; "));
});

test("accepts the sample fixture", () => {
  const res = validateSong(sample);
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("accepts expanded synth and sampler catalog", () => {
  const song = baseSong();
  song.tracks[0].sound = "boom_bap_kit";
  song.tracks.push({
    id: "keys",
    role: "chords",
    instrument: "synth",
    sound: "warm_keys",
    events: [{ step: 0, note: "C4", dur: 4 }],
  });
  const res = validateSong(song);
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("accepts sampled_piano as a synth sound", () => {
  const song = baseSong();
  song.tracks = [
    {
      id: "piano",
      role: "lead",
      instrument: "synth",
      sound: "sampled_piano",
      events: [{ step: 0, note: "C4", dur: 4, vel: 0.8 }],
    },
  ];
  const res = validateSong(song);
  assert.equal(res.ok, true, res.errors.join("; "));
});

// ---- parseSong -----------------------------------------------------------

test("parseSong rejects broken JSON text", () => {
  const res = parseSong("{ not json ]");
  assert.equal(res.ok, false);
  assert.ok(/JSON/i.test(res.error), res.error);
});

test("parseSong returns validation errors joined", () => {
  const song = baseSong();
  song.bpm = 400;
  const res = parseSong(JSON.stringify(song));
  assert.equal(res.ok, false);
  assert.ok(/bpm/i.test(res.error), res.error);
});

test("parseSong does NOT reject out-of-loop events — normalize drops them with a warning", () => {
  const song = baseSong(); // bars=1 → totalSteps=16, max step = 15
  song.tracks[0].events = [
    { step: 0, note: "C2" },
    { step: 40, note: "D2" }, // out of loop — must be dropped, not rejected
  ];
  const res = parseSong(JSON.stringify(song));
  assert.equal(res.ok, true, `parse should succeed: ${res.error}`);
  assert.equal(res.song.tracks[0].events.length, 1);
  assert.ok(res.warnings.some((w) => /удалено 1 событ/i.test(w)), res.warnings.join("; "));
});

// ---- normalizeImportedSong ----------------------------------------------

test("drops events with step outside the loop, with a warning", () => {
  const song = baseSong(); // bars=1 → totalSteps=16, max step = 15
  song.tracks[0].events = [
    { step: 0, note: "C2" },
    { step: 20, note: "D2" }, // out of loop
    { step: 99, note: "E2" }, // out of loop
  ];
  const { song: out, warnings } = normalizeImportedSong(song);
  assert.equal(out.tracks[0].events.length, 1);
  assert.ok(
    warnings.some((w) => /удалено 2 событ/i.test(w)),
    warnings.join("; "),
  );
});

test("clamps dur so step + dur <= bars*16", () => {
  const song = baseSong(); // totalSteps=16
  song.tracks[0].events = [{ step: 14, note: "C2", dur: 8 }];
  const { song: out } = normalizeImportedSong(song);
  assert.equal(out.tracks[0].events[0].dur, 2); // 16 - 14
});

test("clamps bpm and bars into range", () => {
  const song = baseSong();
  song.bpm = 400;
  song.bars = 99;
  const { song: out } = normalizeImportedSong(song);
  assert.equal(out.bpm, 220);
  assert.equal(out.bars, 32);
});

test("clamps track gain into 0..1", () => {
  const song = baseSong();
  song.tracks[0].gain = 5;
  const { song: out } = normalizeImportedSong(song);
  assert.equal(out.tracks[0].gain, 1);
});

test("dedups duplicate track ids with a warning", () => {
  const song = baseSong();
  song.tracks.push({
    id: "drums",
    role: "bass",
    instrument: "synth",
    sound: "sine_bass",
    events: [],
  });
  const { song: out, warnings } = normalizeImportedSong(song);
  assert.equal(out.tracks[0].id, "drums");
  assert.equal(out.tracks[1].id, "drums-2");
  assert.ok(
    warnings.some((w) => /drums/.test(w) && /drums-2/.test(w)),
    warnings.join("; "),
  );
});

test("does not mutate the input", () => {
  const song = baseSong();
  song.bpm = 400;
  const snapshot = JSON.stringify(song);
  normalizeImportedSong(song);
  assert.equal(JSON.stringify(song), snapshot);
});

test("normalizeImportedSong is idempotent (second run = same result, no warnings)", () => {
  const first = normalizeImportedSong(sample);
  const second = normalizeImportedSong(first.song);
  assert.deepEqual(second.song, first.song);
  assert.equal(second.warnings.length, 0);

  // also with a dirty song
  const dirty = baseSong();
  dirty.bpm = 400;
  dirty.tracks[0].gain = 9;
  dirty.tracks[0].events = [
    { step: 14, note: "C2", dur: 8 },
    { step: 99, note: "D2" },
  ];
  dirty.tracks.push({
    id: "drums",
    role: "bass",
    instrument: "synth",
    sound: "sine_bass",
    events: [],
  });
  const d1 = normalizeImportedSong(dirty);
  const d2 = normalizeImportedSong(d1.song);
  assert.deepEqual(d2.song, d1.song);
  assert.equal(d2.warnings.length, 0);
});

// ---- songFilename --------------------------------------------------------

test("songFilename slugifies the title", () => {
  assert.equal(songFilename({ title: "Lo-Fi Sketch!" }, "wav"), "lo-fi-sketch.wav");
  assert.equal(songFilename({ title: "lofi sketch" }, "json"), "lofi-sketch.json");
});

test("songFilename falls back to promptbeats for empty/bad title", () => {
  assert.equal(songFilename({ title: "" }, "wav"), "promptbeats.wav");
  assert.equal(songFilename({}, "json"), "promptbeats.json");
  assert.equal(songFilename({ title: "!!!" }, "wav"), "promptbeats.wav");
  assert.equal(songFilename(null, "json"), "promptbeats.json");
});

test("songFilename lowercases and strips non latin/digit/hyphen", () => {
  const name = songFilename({ title: "Мой Трек 2" }, "json");
  // cyrillic dropped → only "2" survives
  assert.equal(name, "2.json");
});

// ---- browser download helper --------------------------------------------

test("downloadBlob revokes the object URL asynchronously after click", () => {
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  const originalSetTimeout = globalThis.setTimeout;

  const calls = [];
  const anchor = {
    href: "",
    download: "",
    click() {
      calls.push("click");
    },
    remove() {
      calls.push("remove");
    },
  };

  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "a");
      calls.push("create");
      return anchor;
    },
    body: {
      appendChild(node) {
        assert.equal(node, anchor);
        calls.push("append");
      },
    },
  };
  globalThis.URL = {
    createObjectURL(blob) {
      assert.equal(blob, "blob");
      calls.push("create-url");
      return "blob:promptbeats";
    },
    revokeObjectURL(url) {
      assert.equal(url, "blob:promptbeats");
      calls.push("revoke");
    },
  };
  globalThis.setTimeout = (callback, delay) => {
    assert.equal(delay, 0);
    calls.push("defer-revoke");
    callback();
    return 1;
  };

  try {
    downloadBlob("blob", "track.wav");
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.equal(anchor.href, "blob:promptbeats");
  assert.equal(anchor.download, "track.wav");
  assert.deepEqual(calls, [
    "create-url",
    "create",
    "append",
    "click",
    "remove",
    "defer-revoke",
    "revoke",
  ]);
});
