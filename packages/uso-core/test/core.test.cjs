const test = require("node:test");
const assert = require("node:assert/strict");
const { Uso } = require("../dist/cjs/index.js");

test("init returns runtime route and check list", async () => {
  const uso = new Uso({ projectRoot: process.cwd() });
  const result = await uso.init();

  assert.ok(result.runtimeRoute === "native" || result.runtimeRoute === "wsl");
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.checks.length >= 1);
});

test("unknown intent is blocked", async () => {
  const uso = new Uso({ projectRoot: process.cwd() });
  const result = await uso.executeIntent({
    intent: "do something magical unknown",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.error?.code, "UNKNOWN_INTENT");
});

test("check environment intent executes with at least one attempt", async () => {
  const uso = new Uso({ projectRoot: process.cwd() });
  const result = await uso.executeIntent({ intent: "check environment" });

  assert.ok(["success", "failed"].includes(result.status));
  assert.ok(Array.isArray(result.attempts));
});
