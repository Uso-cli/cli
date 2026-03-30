const { test } = require("node:test");
const assert = require("node:assert");

const { runSimulation } = require("../dist/cjs/execution/simulator.js");

test("simulation passes for check-environment intent", () => {
  const plan = {
    intentKind: "check-environment",
    route: "native",
    preconditions: [],
    tasks: [
      {
        id: "check-1",
        command: "node",
        args: ["--version"],
        requiresSimulation: false,
      },
    ],
  };

  const result = runSimulation(plan);
  assert.strictEqual(result.ok, true);
});

test("simulation fails for deploy without cluster precondition", () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: [], // Missing cluster-selected
    tasks: [
      {
        id: "deploy-1",
        command: "anchor",
        args: ["deploy"],
        requiresSimulation: true,
      },
    ],
  };

  const result = runSimulation(plan);
  assert.strictEqual(result.ok, false);
  assert.match(result.reason || "", /cluster/i);
});

test("simulation passes for deploy with cluster precondition", () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: ["cluster-selected"], // Present
    tasks: [
      {
        id: "deploy-1",
        command: "anchor",
        args: ["deploy"],
        requiresSimulation: true,
      },
    ],
  };

  const result = runSimulation(plan);
  assert.strictEqual(result.ok, true);
});

test("simulation respects guardrail maxSpendSol limit", () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: ["cluster-selected"],
    tasks: [
      {
        id: "deploy-1",
        command: "anchor",
        args: ["deploy"],
        requiresSimulation: true,
      },
    ],
  };

  const guardrails = {
    maxSpendSol: 1.0, // Very low limit, will exceed typical deployment cost
  };

  const result = runSimulation(plan, guardrails);
  assert.strictEqual(result.ok, false);
  assert.match(result.reason || "", /exceeds|cost/i);
});

test("simulation passes when spend is within guardrail limits", () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: ["cluster-selected"],
    tasks: [
      {
        id: "deploy-1",
        command: "anchor",
        args: ["deploy"],
        requiresSimulation: true,
      },
    ],
  };

  const guardrails = {
    maxSpendSol: 10.0, // High limit, typical deployment should pass
  };

  const result = runSimulation(plan, guardrails);
  assert.strictEqual(result.ok, true);
});

test("simulation ignores guardrails when not provided", () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: ["cluster-selected"],
    tasks: [
      {
        id: "deploy-1",
        command: "anchor",
        args: ["deploy"],
        requiresSimulation: true,
      },
    ],
  };

  const result = runSimulation(plan, undefined);
  assert.strictEqual(result.ok, true);
});

test("simulation handles build-program intent", () => {
  const plan = {
    intentKind: "build-program",
    route: "native",
    preconditions: [],
    tasks: [
      {
        id: "build-1",
        command: "anchor",
        args: ["build"],
        requiresSimulation: true,
      },
    ],
  };

  const result = runSimulation(plan);
  // May succeed or fail depending on environment, but should return a valid result
  assert.strictEqual(typeof result.ok, "boolean");
});
