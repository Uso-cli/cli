const { test } = require("node:test");
const assert = require("node:assert");

const { decideHealing } = require("../dist/cjs/healing/engine.js");

// ===== HEURISTIC LEVEL TESTS =====

test("healing: anchor version error triggers heuristic stop", () => {
  const stderr = "Error: Anchor version not set. Run: avm use latest";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "heuristic");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.appliedFix || "", /avm/i);
});

test("healing: no validator detected triggers heuristic stop", () => {
  const stderr = "Error: No validator detected on http://localhost:8899";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "heuristic");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.appliedFix || "", /val/i);
});

test("healing: insufficient funds triggers heuristic stop", () => {
  const stderr = "error: insufficient balance in token account";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "heuristic");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.appliedFix || "", /airdrop/i);
});

test("healing: permission denied triggers heuristic stop", () => {
  const stderr = "error: Permission denied (os error 13, EACCES)";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "heuristic");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.appliedFix || "", /permission|chown/i);
});

test("healing: tool not found triggers heuristic stop", () => {
  const stderr =
    "error: Cannot find the specified file\nsolana not found in path";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "heuristic");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.appliedFix || "", /PATH|install/i);
});

// ===== CONTEXTUAL LEVEL TESTS =====

test("healing: timeout triggers contextual retry", () => {
  const stderr = "error: transaction processing timed out";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "contextual");
  assert.strictEqual(result.shouldRetry, true);
  assert.strictEqual(typeof result.retryAfterMs, "number");
});

test("healing: connection reset triggers contextual retry", () => {
  const stderr = "error: ECONNRESET: Remote host forced connection close";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "contextual");
  assert.strictEqual(result.shouldRetry, true);
});

test("healing: RPC not ready triggers contextual retry", () => {
  const stderr = "error: RPC request failed: backend temporarily not ready";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "contextual");
  assert.strictEqual(result.shouldRetry, true);
});

test("healing: network unreachable triggers contextual retry", () => {
  const stderr = "Error: network unreachable (os error 101)";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "contextual");
  assert.strictEqual(result.shouldRetry, true);
});

test("healing: cargo build failure triggers contextual retry", () => {
  const stderr =
    "error: could not compile `my_project` (bin target `my_project`)";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "contextual");
  assert.strictEqual(result.shouldRetry, true);
  assert.match(result.appliedFix || "", /clean|rebuild/i);
});

// ===== ESCALATION LEVEL TESTS =====

test("healing: panic triggers escalation", () => {
  const stderr = "thread 'main' panicked at 'index out of bounds'";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "escalation");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.reason, /panic|bug/i);
});

test("healing: anchor error code triggers escalation", () => {
  const stderr = "error[E0001]: Invalid account data";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "escalation");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.reason, /E0001|documentation/i);
});

test("healing: unknown error triggers escalation", () => {
  const stderr = "Something completely unexpected happened";
  const result = decideHealing(stderr, "", 1, 2, 250);
  assert.strictEqual(result.level, "escalation");
  assert.strictEqual(result.shouldRetry, false);
});

// ===== SPECIAL CASES =====

test("healing: retry limit reached returns escalation", () => {
  const stderr = "Any error at all";
  const result = decideHealing(stderr, "", 3, 2, 250); // attempt=3, max=2
  assert.strictEqual(result.level, "escalation");
  assert.strictEqual(result.shouldRetry, false);
  assert.match(result.reason, /limit|reached/i);
});

test("healing: exponential backoff on connection errors", () => {
  const stderr = "error: ECONNRESET";
  const result1 = decideHealing(stderr, "", 1, 3, 250);
  const result2 = decideHealing(stderr, "", 2, 3, 250);
  assert.strictEqual(typeof result1.retryAfterMs, "number");
  assert.strictEqual(typeof result2.retryAfterMs, "number");
  assert(result2.retryAfterMs > result1.retryAfterMs); // Exponential increase
});

test("healing: chain multiple error indicators", () => {
  const stderr = "error: RPC timeout waiting for confirmation";
  const result = decideHealing(stderr, "", 1, 2, 250);
  // Should detect timeout
  assert.strictEqual(result.shouldRetry, true);
});
