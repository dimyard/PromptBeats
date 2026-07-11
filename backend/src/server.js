import "dotenv/config";
import express from "express";
import cors from "cors";
import { compose } from "./compose.js";
import { CATALOG } from "./catalog.js";
import { assertProviderConfig, getHealthInfo, resolveProviderConfig } from "./providers.js";
import { createRateLimiter } from "./ratelimit.js";

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
