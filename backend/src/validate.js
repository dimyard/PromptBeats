// Validates a Song against song.schema.json plus a few semantic invariants
// that JSON Schema can't express (steps within bars*16, unique track ids).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../song.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(schema);

/**
 * Gently fixes a Song (on a clone) before validation so trivial, unambiguous
 * LLM mistakes don't burn a retry. Does NOT touch semantic mistakes (unknown
 * `sound`, wrong instrument↔sound pair, missing `role`) — those stay errors so
 * the retry loop asks the model to fix them.
 *   - clamps each event's `dur` so `step + dur <= bars*16`;
 *   - drops events whose `step` is outside `0..bars*16-1` (would never play);
 *   - renames duplicate track `id`s (`x` -> `x-2`, `x-3`, …) to keep them unique.
 * @returns {{ song: object, stats: { clampedDurs:number, droppedEvents:number, renamedIds:number } }}
 */
export function normalizeSong(song) {
  const stats = { clampedDurs: 0, droppedEvents: 0, renamedIds: 0 };
  if (!song || typeof song !== "object") return { song, stats };
  const out = structuredClone(song);
  const totalSteps = (out.bars ?? 0) * 16;
  const seenIds = new Set();

  for (const t of out.tracks ?? []) {
    // Dedup track ids.
    if (t && typeof t.id === "string") {
      if (seenIds.has(t.id)) {
        const base = t.id;
        let n = 2, cand = `${base}-${n}`;
        while (seenIds.has(cand)) cand = `${base}-${++n}`;
        t.id = cand;
        stats.renamedIds++;
      }
      seenIds.add(t.id);
    }
    // Filter/clamp events.
    if (Array.isArray(t?.events)) {
      const kept = [];
      for (const ev of t.events) {
        if (typeof ev.step === "number" && (ev.step < 0 || ev.step > totalSteps - 1)) {
          stats.droppedEvents++;
          continue;
        }
        if (typeof ev.step === "number" && typeof ev.dur === "number") {
          const maxDur = totalSteps - ev.step;
          if (maxDur >= 1 && ev.dur > maxDur) { ev.dur = maxDur; stats.clampedDurs++; }
        }
        kept.push(ev);
      }
      t.events = kept;
    }
  }
  return { song: out, stats };
}

/** @returns {{ ok: boolean, errors: string[] }} */
export function validateSong(song) {
  const errors = [];

  if (!validateSchema(song)) {
    for (const e of validateSchema.errors ?? []) {
      errors.push(`${e.instancePath || "(root)"} ${e.message}`);
    }
    return { ok: false, errors };
  }

  // Semantic checks beyond the schema
  const maxStep = song.bars * 16 - 1;
  const seenIds = new Set();
  for (const t of song.tracks) {
    if (seenIds.has(t.id)) errors.push(`duplicate track id "${t.id}"`);
    seenIds.add(t.id);
    for (const ev of t.events ?? []) {
      if (ev.step > maxStep) {
        errors.push(`track "${t.id}": step ${ev.step} exceeds max ${maxStep} (bars=${song.bars})`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
