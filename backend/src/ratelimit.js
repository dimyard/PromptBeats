// ============================================================================
// ratelimit.js — tiny in-memory fixed-window limiter (opt-in). Owner: B.
// ============================================================================
// No dependency. Per-key (IP) fixed window. Suitable for a single-process dev
// gateway; not a distributed limiter. Disabled unless RATE_LIMIT_ENABLED=true.
// ============================================================================

/**
 * @param {{max?:number, windowMs?:number}} [opts]
 * @returns {(key:string, now?:number) => {allowed:boolean, remaining?:number, retryAfterMs?:number}}
 */
export function createRateLimiter({ max = 30, windowMs = 60000 } = {}) {
  const hits = new Map(); // key -> { count, resetAt }
  return function check(key, now) {
    const t = now ?? Date.now();
    const e = hits.get(key);
    if (!e || t >= e.resetAt) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return { allowed: true, remaining: max - 1 };
    }
    if (e.count >= max) return { allowed: false, retryAfterMs: e.resetAt - t };
    e.count++;
    return { allowed: true, remaining: max - e.count };
  };
}
