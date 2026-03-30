const test = require("node:test");
const assert = require("node:assert/strict");
const { decideHealing } = require("../dist/cjs/healing/engine.js");
const {
  evaluateHealingGuardrails,
} = require("../dist/cjs/guardrails/policy.js");

test("healing engine returns heuristic stop for anchor version errors", () => {
  const decision = decideHealing(
    "Error: Anchor version not set. Please run `avm use latest`.",
    "",
    1,
    3,
    100,
  );

  assert.equal(decision.level, "heuristic");
  assert.equal(decision.decision, "stop");
  assert.equal(decision.shouldRetry, false);
  assert.match(decision.appliedFix || "", /avm use latest/i);
});

test("healing engine returns contextual retry for transient network errors", () => {
  const decision = decideHealing(
    "network timeout while fetching",
    "",
    1,
    3,
    200,
  );

  assert.equal(decision.level, "contextual");
  assert.equal(decision.decision, "retry");
  assert.equal(decision.shouldRetry, true);
  assert.equal(decision.retryAfterMs, 200);
});

test("healing guardrail blocks deploy auto-heal retry when disabled", () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: [],
    tasks: [],
  };

  const decision = {
    level: "contextual",
    decision: "retry",
    shouldRetry: true,
    reason: "Transient failure",
    retryAfterMs: 100,
  };

  const result = evaluateHealingGuardrails(plan, decision, {
    blockUnsafeHealActions: true,
    allowAutoHealDeploy: false,
  });

  assert.equal(result.ok, false);
});
