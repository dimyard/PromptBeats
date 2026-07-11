// ============================================================================
// LLM ADAPTER — THIS IS HUMAN B's MAIN JOB.
// ============================================================================
// Replace the STUB body of generateSong() with a real LLM call.
//
// Contract you must honor:
//   input:  { prompt: string, song: Song|null, previousErrors: string[] }
//   output: { song: Song, message: string }
//
// The song null vs. present tells you: generate-from-scratch vs. edit.
// `previousErrors` is non-empty on a retry — feed it back into your prompt so
// the model fixes its mistakes. compose.js handles the retry loop + validation.
//
// Suggested approach:
//   1. Build a SYSTEM prompt describing the Song JSON schema + CATALOG + drum map.
//   2. Demand "return ONLY valid JSON, no prose".
//   3. Add 2-3 few-shot examples (wish -> Song) and one (edit -> Song).
//   4. On edit, include the current song in the user message.
//   5. Parse the JSON, return { song, message }.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG, ALL_SOUNDS } from "./catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../sample-song.json"), "utf8")
);

/**
 * @param {{ prompt: string, song: object|null, previousErrors?: string[] }} args
 * @returns {Promise<{ song: object, message: string }>}
 */
export async function generateSong({ prompt, song, previousErrors = [] }) {
  // ---------------------------------------------------------------------------
  // >>> STUB — remove everything below and call your LLM. <<<
  // It returns a deterministic result so the whole pipeline (frontend -> here ->
  // player) runs end-to-end before the real model is wired.
  // ---------------------------------------------------------------------------
  const base = song ?? SAMPLE;
  const next = structuredClone(base);
  next.title = prompt.slice(0, 60);

  // toy heuristics just to make edits visibly do *something* in the demo:
  const bpmMatch = prompt.match(/(\d{2,3})\s*bpm/i);
  if (bpmMatch) next.bpm = Math.max(40, Math.min(220, Number(bpmMatch[1])));
  if (/faster|быстрее|ускор/i.test(prompt)) next.bpm = Math.min(220, next.bpm + 15);
  if (/slower|медленн/i.test(prompt)) next.bpm = Math.max(40, next.bpm - 15);

  return {
    song: next,
    message:
      `[STUB] Human B: wire a real LLM in backend/src/llm.js. ` +
      `Catalog: ${ALL_SOUNDS.join(", ")}. Roles: ${CATALOG.roles.join(", ")}.`,
  };
}
