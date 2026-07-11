// ============================================================================
// retry.js — provider-call retry policy (pure, testable). Owner: B.
// ============================================================================
// Transient (worth retrying): HTTP 429 / 5xx and network-level failures.
// Permanent (fail fast): 4xx client/auth (400/401/403/404), truncation, and
// our own request timeout (retrying a timeout only compounds latency).
// ============================================================================

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const NET_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT",
]);

/**
 * Is this error worth retrying?
 * @param {{status?:number, code?:string, name?:string, transient?:boolean, cause?:any, message?:string}} err
 * @returns {boolean}
 */
export function isTransient(err) {
  if (!err || typeof err !== "object") return false;
  if (err.transient === true) return true;
  if (err.transient === false) return false;
  // Our own timeout / aborts are not retried.
  if (err.code === "LLM_TIMEOUT" || err.name === "AbortError") return false;
  if (typeof err.status === "number") return TRANSIENT_STATUS.has(err.status);
  if (err.code && NET_CODES.has(err.code)) return true;
  // Global fetch surfaces network failures as TypeError "fetch failed" + .cause
  if (err.cause) return isTransient(err.cause);
  if (err.name === "TypeError" && /fetch failed/i.test(err.message || "")) return true;
  return false;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying while the thrown error is transient.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{retries?:number, baseDelayMs?:number, onRetry?:(i:{attempt:number,delay:number,error:any})=>void, sleep?:(ms:number)=>Promise<void>}} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, opts = {}) {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isTransient(err)) throw err;
      // Exponential backoff, unless the server told us how long to wait (429).
      let delay = base * 2 ** attempt;
      if (typeof err.retryAfterMs === "number" && err.retryAfterMs > 0) delay = err.retryAfterMs;
      opts.onRetry?.({ attempt: attempt + 1, delay, error: err });
      await sleep(delay);
      attempt++;
    }
  }
}

/** Parse a Retry-After header (seconds or HTTP-date) into ms, or null. */
export function retryAfterMs(headerValue, nowMs) {
  if (!headerValue) return null;
  const secs = Number(headerValue);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(headerValue);
  if (Number.isFinite(when)) return Math.max(0, when - (nowMs ?? Date.now()));
  return null;
}
