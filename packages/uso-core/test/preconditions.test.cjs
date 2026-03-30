const { test } = require("node:test");
const assert = require("node:assert");

const {
  validatePreconditions,
  allPreconditionsSatisfied,
} = require("../dist/cjs/execution/preconditions.js");

test("preconditions validation returns array of results", async () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: ["wallet-funded", "cluster-selected"],
    tasks: [],
  };

  const results = await validatePreconditions(plan);
  assert.strictEqual(Array.isArray(results), true);
  assert.strictEqual(results.length >= 2, true);
});

test("allPreconditionsSatisfied returns false if any fails", () => {
  const results = [
    { name: "wallet-funded", satisfied: true, message: "OK" },
    {
      name: "cluster-selected",
      satisfied: false,
      message: "Failed",
      remedy: "Fix it",
    },
  ];

  assert.strictEqual(allPreconditionsSatisfied(results), false);
});

test("allPreconditionsSatisfied returns true if all pass", () => {
  const results = [
    { name: "wallet-funded", satisfied: true, message: "OK" },
    { name: "cluster-selected", satisfied: true, message: "OK" },
  ];

  assert.strictEqual(allPreconditionsSatisfied(results), true);
});

test("preconditions return remedy hints on failure", async () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: ["wallet-funded", "cluster-selected"],
    tasks: [],
  };

  const results = await validatePreconditions(plan);
  // At least some preconditions will likely fail in test environment
  const failedResults = results.filter((r) => !r.satisfied);
  failedResults.forEach((result) => {
    assert.strictEqual(typeof result.remedy, "string");
  });
});

test("empty preconditions list returns empty results", async () => {
  const plan = {
    intentKind: "build-program",
    route: "native",
    preconditions: [],
    tasks: [],
  };

  const results = await validatePreconditions(plan);
  assert.strictEqual(results.length, 0);
});

test("unknown preconditions are silently ignored", async () => {
  const plan = {
    intentKind: "deploy-program",
    route: "native",
    preconditions: ["unknown-precondition", "wallet-funded"],
    tasks: [],
  };

  const results = await validatePreconditions(plan);
  // Should only include wallet-funded, not unknown-precondition
  const hasUnknown = results.some((r) => r.name === "unknown-precondition");
  assert.strictEqual(hasUnknown, false);
});
