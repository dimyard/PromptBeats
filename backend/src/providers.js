// ============================================================================
// LLM PROVIDERS — thin, provider-agnostic chat adapters (owner: Human B).
// ============================================================================
// Each adapter takes { system, messages, model } and returns the model's raw
// text output. `messages` is a role-alternating array of { role, content }
// where role ∈ {"user","assistant"} and the sequence starts with "user".
//
// Selection is env-driven so the provider is swappable without code changes:
//   LLM_PROVIDER = anthropic | openai | gemini | mock   (default: anthropic)
//   LLM_MODEL    = <provider-specific model id>          (default per provider)
//
// Uses undici's fetch so requests can be routed through a corporate/egress
// proxy via a ProxyAgent dispatcher. Proxy is opt-in via env (see getDispatcher):
//   LLM_PROXY = http://[user:pass@]host:port   (preferred; scopes to LLM traffic)
//   or the standard HTTPS_PROXY / HTTP_PROXY.
// Why not global fetch: Node's global fetch ignores proxy env vars, and feeding
// the installed ProxyAgent to global fetch throws on internal-interface skew
// ("invalid onRequestStart"). Using undici's own fetch + ProxyAgent (same
// package version) is the reliable combination — verified empirically.
// Network / provider errors are thrown as-is — compose.js wraps them as
// `llm_error` for the HTTP contract.
// ============================================================================

import { fetch, ProxyAgent } from "undici";
import { withRetry, retryAfterMs } from "./retry.js";

const DEFAULT_MODEL = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  mock: "mock",
};

const KEY_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/** Numeric env var with fallback (empty/invalid -> default). */
function numEnv(name, def) {
  const v = process.env[name];
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
const maxTokens = () => numEnv("LLM_MAX_TOKENS", 4096);
const temperature = () => numEnv("LLM_TEMPERATURE", 0.4);

// --- Proxy (opt-in) ---------------------------------------------------------
// Resolved once, lazily, and reused (connection pooling). Env is read on the
// first request so dotenv is guaranteed loaded and tests can set it freely.
function resolveProxyUrl() {
  return (
    process.env.LLM_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    ""
  );
}

let _dispatcher; // undefined = unresolved; null = no proxy configured
function getDispatcher() {
  if (_dispatcher !== undefined) return _dispatcher;
  const url = resolveProxyUrl();
  if (url) {
    _dispatcher = new ProxyAgent(url);
    const safe = url.replace(/\/\/[^@/]*@/, "//***@"); // mask credentials in logs
    console.log(`[llm] routing provider requests via proxy ${safe}`);
  } else {
    _dispatcher = null;
  }
  return _dispatcher;
}

/**
 * fetch wrapper: injects the proxy dispatcher and enforces LLM_TIMEOUT_MS.
 * On timeout throws an error tagged code "LLM_TIMEOUT" (not retried).
 */
async function llmFetch(url, opts = {}) {
  const dispatcher = getDispatcher();
  const timeoutMs = numEnv("LLM_TIMEOUT_MS", 30000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const o = { ...opts, signal: ctrl.signal };
    if (dispatcher) o.dispatcher = dispatcher;
    return await fetch(url, o);
  } catch (e) {
    if (ctrl.signal.aborted) {
      const err = new Error(`LLM request timed out after ${timeoutMs}ms`);
      err.code = "LLM_TIMEOUT";
      throw err;
    }
    throw e; // network error — classified as transient by retry.js
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves { provider, model } from env, with sane defaults. */
export function resolveProviderConfig() {
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (!ADAPTERS[provider]) {
    throw new Error(
      `Unknown LLM_PROVIDER "${provider}". Use one of: ${Object.keys(ADAPTERS).join(", ")}.`
    );
  }
  const model = process.env.LLM_MODEL || DEFAULT_MODEL[provider];
  return { provider, model };
}

function requireKey(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Put it in backend/.env (see .env.example).`
    );
  }
  return v;
}

/** Build an Error carrying the provider HTTP status (for retry classification). */
async function httpError(name, res) {
  let body = "";
  try { body = await res.text(); } catch { /* ignore */ }
  const err = new Error(
    `${name} error: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}`
  );
  err.status = res.status;
  const ra = retryAfterMs(res.headers.get("retry-after"));
  if (ra != null) err.retryAfterMs = ra;
  return err;
}

/** Error for truncated output (max_tokens reached) — retrying as-is won't help. */
function truncatedError(name) {
  const err = new Error(`${name} output truncated (hit max_tokens). Increase LLM_MAX_TOKENS.`);
  err.transient = false;
  return err;
}

// --- Anthropic (Messages API) ----------------------------------------------
async function callAnthropic({ system, messages, model }) {
  const res = await llmFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": requireKey("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens(), temperature: temperature(), system, messages }),
  });
  if (!res.ok) throw await httpError("Anthropic", res);
  const data = await res.json();
  if (data.stop_reason === "max_tokens") throw truncatedError("Anthropic");
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text) throw new Error("Anthropic returned empty content");
  return text;
}

// --- OpenAI (Chat Completions, JSON mode) ----------------------------------
async function callOpenAI({ system, messages, model }) {
  const res = await llmFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requireKey("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens(),
      temperature: temperature(),
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw await httpError("OpenAI", res);
  const data = await res.json();
  if (data.choices?.[0]?.finish_reason === "length") throw truncatedError("OpenAI");
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned empty content");
  return text;
}

// --- Google Gemini (generateContent, JSON mime) ----------------------------
async function callGemini({ system, messages, model }) {
  const key = requireKey("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await llmFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: maxTokens(),
        temperature: temperature(),
      },
    }),
  });
  if (!res.ok) throw await httpError("Gemini", res);
  const data = await res.json();
  if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") throw truncatedError("Gemini");
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
  if (!text) throw new Error("Gemini returned empty content");
  return text;
}

// --- Mock (offline; no API key) --------------------------------------------
// Deterministic wrapper JSON so the whole pipeline runs end-to-end without a
// key. Echoes the last user turn's intent via tiny heuristics. Opt-in via
// LLM_PROVIDER=mock. Not a substitute for a real model — just smoke/dev.
async function callMock({ messages }) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";
  // Try to reuse an existing song embedded in an edit prompt, else start fresh.
  const embedded = prompt.match(/\{[\s\S]*\}/);
  let song;
  if (embedded) {
    try {
      const parsed = JSON.parse(embedded[0]);
      song = parsed.song ?? (parsed.tracks ? parsed : null);
    } catch {
      /* fall through */
    }
  }
  song ??= {
    version: 1,
    title: "mock beat",
    bpm: 90,
    key: "A minor",
    bars: 2,
    tracks: [
      {
        id: "drums",
        role: "drums",
        instrument: "sampler",
        sound: "lofi_kit",
        events: [
          { step: 0, note: "C2", vel: 0.9 },
          { step: 8, note: "D2", vel: 0.8 },
        ],
      },
      {
        id: "bass",
        role: "bass",
        instrument: "synth",
        sound: "sine_bass",
        events: [{ step: 0, note: "A1", dur: 8, vel: 0.8 }],
      },
    ],
  };
  const bpm = prompt.match(/(\d{2,3})\s*bpm/i);
  if (bpm) song.bpm = Math.max(40, Math.min(220, Number(bpm[1])));
  if (/faster|быстрее|ускор/i.test(prompt)) song.bpm = Math.min(220, song.bpm + 15);
  if (/slower|медленн/i.test(prompt)) song.bpm = Math.max(40, song.bpm - 15);
  return JSON.stringify({
    message: `[mock] Собрал трек на ${song.bpm} BPM. Подключи реальный LLM через LLM_PROVIDER в .env.`,
    song,
  });
}

const ADAPTERS = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  gemini: callGemini,
  mock: callMock,
};

/** Asserts the configured provider has its API key (except mock). Call at boot. */
export function assertProviderConfig() {
  const { provider, model } = resolveProviderConfig();
  if (provider !== "mock" && !process.env[KEY_ENV[provider]]) {
    throw new Error(`LLM_PROVIDER=${provider} but ${KEY_ENV[provider]} is not set (see backend/.env).`);
  }
  return { provider, model };
}

/** Health/info snapshot (no secrets — proxy is a boolean flag). */
export function getHealthInfo() {
  const { provider, model } = resolveProviderConfig();
  return { provider, model, proxy: !!resolveProxyUrl() };
}

/**
 * Sends a chat request to the configured provider, retrying transient provider
 * errors (429/5xx/network) with backoff. Validation retries are handled
 * separately by compose.js.
 * @param {{ system: string, messages: {role:string,content:string}[] }} args
 * @returns {Promise<string>} raw model text
 */
export async function callLLM({ system, messages }) {
  const { provider, model } = resolveProviderConfig();
  const retries = provider === "mock" ? 0 : numEnv("LLM_NET_RETRIES", 2);
  return withRetry(() => ADAPTERS[provider]({ system, messages, model }), {
    retries,
    onRetry: ({ attempt, delay, error }) =>
      console.warn(
        `[llm] transient error (${error.status ?? error.code ?? error.name}); retry ${attempt} in ${delay}ms`
      ),
  });
}
