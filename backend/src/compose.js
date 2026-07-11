// Orchestration: call the LLM, validate its Song against the contract, retry
// on failure feeding the errors back. Returns { song, message } or throws with
// a .code matching the HTTP contract error codes.
import { generateSong } from "./llm.js";
import { validateSong } from "./validate.js";

const MAX_RETRIES = 2;

export async function compose({ prompt, song }) {
  let previousErrors = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let result;
    try {
      result = await generateSong({ prompt, song, previousErrors });
    } catch (e) {
      const err = new Error(`LLM call failed: ${e.message}`);
      err.code = "llm_error";
      throw err;
    }

    const { ok, errors } = validateSong(result?.song);
    if (ok) {
      return { song: result.song, message: result.message ?? "" };
    }
    previousErrors = errors;
    console.warn(`compose: invalid Song (attempt ${attempt + 1}):`, errors);
  }

  const err = new Error(
    `LLM produced invalid Song after ${MAX_RETRIES + 1} attempts: ${previousErrors.join("; ")}`
  );
  err.code = "llm_invalid_output";
  throw err;
}
