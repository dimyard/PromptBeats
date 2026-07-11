import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransient, withRetry, retryAfterMs } from "../src/retry.js";

test("isTransient classifies correctly", () => {
  assert.equal(isTransient({ status: 429 }), true);
  assert.equal(isTransient({ status: 503 }), true);
  assert.equal(isTransient({ status: 500 }), true);
  assert.equal(isTransient({ status: 400 }), false);
  assert.equal(isTransient({ status: 401 }), false);
  assert.equal(isTransient({ code: "LLM_TIMEOUT" }), false);
  assert.equal(isTransient({ name: "AbortError" }), false);
  assert.equal(isTransient({ code: "ECONNRESET" }), true);
  assert.equal(isTransient({ transient: true }), true);
  assert.equal(isTransient({ transient: false, status: 500 }), false);
  assert.equal(isTransient(new TypeError("fetch failed")), true);
});

test("withRetry succeeds after transient failures", async () => {
  let n = 0;
  const r = await withRetry(
    async () => {
      n++;
      if (n < 3) { const e = new Error("x"); e.status = 503; throw e; }
      return "ok";
    },
    { retries: 3, sleep: async () => {} }
  );
  assert.equal(r, "ok");
  assert.equal(n, 3);
});

test("withRetry stops immediately on permanent error", async () => {
  let n = 0;
  await assert.rejects(() =>
    withRetry(async () => { n++; const e = new Error("no"); e.status = 401; throw e; },
      { retries: 3, sleep: async () => {} })
  );
  assert.equal(n, 1);
});

test("withRetry exhausts retries then throws", async () => {
  let n = 0;
  await assert.rejects(() =>
    withRetry(async () => { n++; const e = new Error("x"); e.status = 500; throw e; },
      { retries: 2, sleep: async () => {} })
  );
  assert.equal(n, 3); // initial + 2 retries
});

test("withRetry honors retryAfterMs for the delay", async () => {
  const delays = [];
  let n = 0;
  await withRetry(
    async () => {
      n++;
      if (n < 2) { const e = new Error("x"); e.status = 429; e.retryAfterMs = 1234; throw e; }
      return "ok";
    },
    { retries: 2, sleep: async (ms) => { delays.push(ms); } }
  );
  assert.deepEqual(delays, [1234]);
});

test("retryAfterMs parses seconds and null", () => {
  assert.equal(retryAfterMs("2"), 2000);
  assert.equal(retryAfterMs(null), null);
});
