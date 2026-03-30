const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isIntentSdkEnabled,
  commandToIntentRequest,
  runCliIntentAdapter,
} = require("../dist/cjs/adapters/cli.js");

test("adapter: build maps to build-program intent", () => {
  const request = commandToIntentRequest({
    command: "build",
    args: ["--skip-lint"],
    binary: "anchor",
  });

  assert.equal(request.intent, "build-program");
  assert.deepEqual(request.context.args, ["--skip-lint"]);
  assert.equal(request.context.binary, "anchor");
});

test("adapter: test maps to test-program intent with args", () => {
  const request = commandToIntentRequest({
    command: "test",
    args: ["--skip-deploy"],
    binary: "anchor",
  });

  assert.equal(request.intent, "test-program");
  assert.deepEqual(request.context.args, ["--skip-deploy"]);
});

test("adapter: deploy maps to deploy-program intent", () => {
  const request = commandToIntentRequest({
    command: "deploy",
    args: [],
    binary: "anchor",
  });

  assert.equal(request.intent, "deploy-program");
});

test("adapter: sdk gate respects USE_INTENT_SDK", () => {
  const oldUseIntent = process.env.USE_INTENT_SDK;
  const oldBridge = process.env.USO_CORE_BRIDGE;

  process.env.USE_INTENT_SDK = "1";
  process.env.USO_CORE_BRIDGE = "0";
  assert.equal(isIntentSdkEnabled(), true);

  process.env.USE_INTENT_SDK = "0";
  process.env.USO_CORE_BRIDGE = "1";
  assert.equal(isIntentSdkEnabled(), true);

  process.env.USE_INTENT_SDK = "0";
  process.env.USO_CORE_BRIDGE = "0";
  assert.equal(isIntentSdkEnabled(), false);

  if (oldUseIntent === undefined) {
    delete process.env.USE_INTENT_SDK;
  } else {
    process.env.USE_INTENT_SDK = oldUseIntent;
  }

  if (oldBridge === undefined) {
    delete process.env.USO_CORE_BRIDGE;
  } else {
    process.env.USO_CORE_BRIDGE = oldBridge;
  }
});

test("adapter: returns unhandled when sdk feature gate is disabled", async () => {
  const oldUseIntent = process.env.USE_INTENT_SDK;
  const oldBridge = process.env.USO_CORE_BRIDGE;

  process.env.USE_INTENT_SDK = "0";
  process.env.USO_CORE_BRIDGE = "0";

  const result = await runCliIntentAdapter({
    command: "build",
    args: [],
    binary: "anchor",
  });

  assert.equal(result.handled, false);
  assert.equal(result.ok, false);

  if (oldUseIntent === undefined) {
    delete process.env.USE_INTENT_SDK;
  } else {
    process.env.USE_INTENT_SDK = oldUseIntent;
  }

  if (oldBridge === undefined) {
    delete process.env.USO_CORE_BRIDGE;
  } else {
    process.env.USO_CORE_BRIDGE = oldBridge;
  }
});
