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
 * Normalizes a Song in place-safe way (returns a fixed clone) before validation.
 * Currently: clamps each event's `dur` so `step + dur <= bars*16` (notes never
 * overhang the loop). Add further gentle fixes here rather than rejecting.
 * @returns {object} normalized song
 */
export function normalizeSong(song) {
  if (!song || typeof song !== "object") return song;
  const out = structuredClone(song);
  const totalSteps = (out.bars ?? 0) * 16;
  for (const t of out.tracks ?? []) {
    for (const ev of t.events ?? []) {
      if (typeof ev.step === "number" && typeof ev.dur === "number") {
        const maxDur = totalSteps - ev.step;
        if (maxDur >= 1 && ev.dur > maxDur) ev.dur = maxDur;
      }
    }
  }
  return out;
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
