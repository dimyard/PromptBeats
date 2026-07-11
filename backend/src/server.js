import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { compose } from "./compose.js";
import { CATALOG } from "./catalog.js";
import { createLibraryStore } from "./library.js";
import { normalizeSong, validateSong } from "./validate.js";
import { assertProviderConfig, getHealthInfo, resolveProviderConfig } from "./providers.js";
import { createRateLimiter } from "./ratelimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config (env with defaults) --------------------------------------------
const PORT = process.env.PORT ?? 3001;
const MAX_PROMPT_CHARS = Number(process.env.MAX_PROMPT_CHARS) || 2000;
const MAX_SONG_CHARS = Number(process.env.MAX_SONG_CHARS) || 20000;
const RATE_LIMIT_ENABLED = /^(1|true|yes)$/i.test(process.env.RATE_LIMIT_ENABLED ?? "");
const rateLimiter = RATE_LIMIT_ENABLED
  ? createRateLimiter({
      max: Number(process.env.RATE_LIMIT_MAX) || 30,
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    })
  : null;

// Shared track library (Contract 5). Runtime state in a gitignored JSON file.
const LIBRARY_FILE = process.env.LIBRARY_FILE || path.resolve(__dirname, "../data/library.json");
const library = createLibraryStore({ filePath: LIBRARY_FILE });

// Seed the shared library with the demo track so a fresh backend isn't empty.
// Idempotent: save() dedups by content, so restarts don't add copies.
async function seedLibrary() {
  try {
    const samplePath = path.resolve(__dirname, "../../sample-song.json");
    const raw = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    const { song } = normalizeSong(raw);
    if (!validateSong(song).ok) return;
    const res = await library.save({ song, title: song.title });
    if (res.status === "created") console.log(`[library] seeded demo track "${res.track.title}"`);
  } catch (e) {
    console.warn("[library] seed skipped:", e.message);
  }
}
seedLibrary();

const HTTP_STATUS = {
  bad_request: 400,
  rate_limited: 429,
  llm_invalid_output: 422,
  llm_error: 502,
  internal: 500,
};

// Client-facing error text. Internal detail (provider bodies) stays in logs.
const CLIENT_MESSAGE = {
  llm_error: "Проблема с LLM-провайдером, попробуйте ещё раз.",
  llm_invalid_output: "Модель вернула некорректный результат. Переформулируйте запрос.",
  rate_limited: "Слишком много запросов, подождите немного.",
  internal: "Внутренняя ошибка сервера.",
};

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ...getHealthInfo(), uptime: Math.round(process.uptime()) });
});

app.get("/api/catalog", (_req, res) => res.json(CATALOG));

app.post("/api/compose", async (req, res) => {
  const t0 = Date.now();
  const { prompt, song = null } = req.body ?? {};

  // --- Input validation ---
  if (typeof prompt !== "string" || !prompt.trim()) {
    return sendError(res, 400, "bad_request", "prompt (non-empty string) is required");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return sendError(res, 400, "bad_request", `prompt too long (max ${MAX_PROMPT_CHARS} chars)`);
  }
  if (song != null) {
    if (typeof song !== "object" || Array.isArray(song) || !Array.isArray(song.tracks)) {
      return sendError(res, 400, "bad_request", "song must be an object with a tracks array");
    }
    if (JSON.stringify(song).length > MAX_SONG_CHARS) {
      return sendError(res, 400, "bad_request", `song too large (max ${MAX_SONG_CHARS} chars)`);
    }
  }

  // --- Rate limit (opt-in) ---
  if (rateLimiter) {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const rl = rateLimiter(key);
    if (!rl.allowed) {
      res.set("Retry-After", String(Math.ceil((rl.retryAfterMs ?? 1000) / 1000)));
      return sendError(res, 429, "rate_limited", "rate limit exceeded");
    }
  }

  const mode = song ? "edit" : "generate";
  const { provider, model } = safeConfig();
  try {
    const result = await compose({ prompt, song }); // { song, message }
    res.json(result);
    logLine({ mode, provider, model, ms: Date.now() - t0, outcome: "ok" });
  } catch (e) {
    const code = e.code ?? "internal";
    const status = HTTP_STATUS[code] ?? 500;
    console.error(`[compose] ${code}:`, e.message); // full detail stays server-side
    sendError(res, status, code, CLIENT_MESSAGE[code] ?? "error");
    logLine({ mode, provider, model, ms: Date.now() - t0, outcome: code });
  }
});

// --- Shared library (Contract 5) -------------------------------------------

app.get("/api/library", async (_req, res) => {
  try {
    res.json({ tracks: await library.list() });
  } catch (e) {
    console.error("[library] list:", e.message);
    sendError(res, 500, "internal", CLIENT_MESSAGE.internal);
  }
});

app.get("/api/library/:id", async (req, res) => {
  try {
    const track = await library.get(req.params.id);
    if (!track) return sendError(res, 404, "not_found", "трек не найден");
    res.json({ track });
  } catch (e) {
    console.error("[library] get:", e.message);
    sendError(res, 500, "internal", CLIENT_MESSAGE.internal);
  }
});

app.post("/api/library", async (req, res) => {
  const { song = null, title, overwrite = false } = req.body ?? {};

  // Input shape (mirrors /api/compose song checks).
  if (song == null || typeof song !== "object" || Array.isArray(song) || !Array.isArray(song.tracks)) {
    return sendError(res, 400, "bad_request", "song must be an object with a tracks array");
  }
  if (JSON.stringify(song).length > MAX_SONG_CHARS) {
    return sendError(res, 400, "bad_request", `song too large (max ${MAX_SONG_CHARS} chars)`);
  }
  if (title !== undefined && typeof title !== "string") {
    return sendError(res, 400, "bad_request", "title must be a string");
  }

  // Keep the shared library clean: only persist schema-valid songs.
  const { song: normalized } = normalizeSong(song);
  const { ok, errors } = validateSong(normalized);
  if (!ok) {
    return sendError(res, 400, "bad_request", `song не проходит схему: ${errors.join("; ")}`);
  }

  try {
    const result = await library.save({ song: normalized, title, overwrite: Boolean(overwrite) });
    console.log(`[req] library save title="${result.track.title}" -> ${result.status}`);
    res.json(result); // { status, track }
  } catch (e) {
    console.error("[library] save:", e.message);
    sendError(res, 500, "internal", CLIENT_MESSAGE.internal);
  }
});

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function safeConfig() {
  try {
    return resolveProviderConfig();
  } catch {
    return { provider: "?", model: "?" };
  }
}

function logLine({ mode, provider, model, ms, outcome }) {
  console.log(`[req] compose mode=${mode} provider=${provider} model=${model} ${ms}ms -> ${outcome}`);
}

// --- Startup: fail fast on misconfig, then listen --------------------------
try {
  const { provider, model } = assertProviderConfig();
  const proxy = getHealthInfo().proxy;
  app.listen(PORT, () =>
    console.log(
      `PromptBeats backend on http://localhost:${PORT} · provider=${provider} model=${model} proxy=${proxy ? "on" : "off"}`
    )
  );
} catch (e) {
  console.error(`[boot] config error: ${e.message}`);
  process.exit(1);
}
