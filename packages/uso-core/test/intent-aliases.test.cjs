const { test } = require("node:test");
const assert = require("node:assert");

// Import from dist (compiled output)
const { routeIntent } = require("../dist/cjs/intent/router.js");

test("intent aliases: check-environment variations", () => {
  const aliases = [
    "doctor",
    "health",
    "check-environment",
    "verify environment",
    "status",
    "diagnose",
  ];
  for (const alias of aliases) {
    const plan = routeIntent({ intent: alias }, "native");
    assert.strictEqual(
      plan.intentKind,
      "check-environment",
      `alias '${alias}' should resolve to check-environment`,
    );
  }
});

test("intent aliases: build-program variations", () => {
  const aliases = [
    "build",
    "build-program",
    "compile",
    "cargo build",
    "anchor build",
  ];
  for (const alias of aliases) {
    const plan = routeIntent({ intent: alias }, "native");
    assert.strictEqual(
      plan.intentKind,
      "build-program",
      `alias '${alias}' should resolve to build-program`,
    );
  }
});

test("intent aliases: test-program variations", () => {
  const aliases = ["test", "test-program", "run tests", "run test"];
  for (const alias of aliases) {
    const plan = routeIntent({ intent: alias }, "native");
    assert.strictEqual(
      plan.intentKind,
      "test-program",
      `alias '${alias}' should resolve to test-program`,
    );
  }
});

test("intent aliases: deploy-program variations", () => {
  const aliases = ["deploy", "deploy-program", "ship", "push", "launch"];
  for (const alias of aliases) {
    const plan = routeIntent({ intent: alias }, "native");
    assert.strictEqual(
      plan.intentKind,
      "deploy-program",
      `alias '${alias}' should resolve to deploy-program`,
    );
  }
});

test("intent routing includes preconditions for deploy", () => {
  const plan = routeIntent({ intent: "deploy" }, "native");
  assert.deepStrictEqual(plan.preconditions, [
    "wallet-funded",
    "cluster-selected",
  ]);
  assert.strictEqual(plan.tasks[0].requiresSimulation, true);
});

test("intent routing skips simulation for check-environment", () => {
  const plan = routeIntent({ intent: "check-environment" }, "native");
  assert.strictEqual(plan.tasks[0].requiresSimulation, false);
});

test("intent with context args passes through to task", () => {
  const plan = routeIntent(
    {
      intent: "test",
      context: { args: ["--skip-deploy", "--detach"] },
    },
    "native",
  );
  assert.deepStrictEqual(plan.tasks[0].args, [
    "test",
    "--skip-deploy",
    "--detach",
  ]);
});

test("unknown intent throws helpful error", () => {
  assert.throws(
    () => routeIntent({ intent: "unknown-intent-xyz" }, "native"),
    /Unknown intent/,
  );
});

test("intent respects route hint (wsl)", () => {
  const plan = routeIntent({ intent: "build", routeHint: "wsl" }, "native");
  assert.strictEqual(plan.route, "wsl");
});

test("intent fallback to native when hint is auto", () => {
  const plan = routeIntent({ intent: "build", routeHint: "auto" }, "native");
  assert.strictEqual(plan.route, "native");
});
