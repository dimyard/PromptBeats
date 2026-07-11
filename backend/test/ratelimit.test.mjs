import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../src/ratelimit.js";

test("allows up to max, blocks, then resets after window", () => {
  const check = createRateLimiter({ max: 2, windowMs: 1000 });
  assert.equal(check("ip", 0).allowed, true);
  assert.equal(check("ip", 100).allowed, true);
  const blocked = check("ip", 200);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  assert.equal(check("ip", 1200).allowed, true); // new window
});

test("separate keys are independent", () => {
  const check = createRateLimiter({ max: 1, windowMs: 1000 });
  assert.equal(check("a", 0).allowed, true);
  assert.equal(check("b", 0).allowed, true);
  assert.equal(check("a", 0).allowed, false);
});
