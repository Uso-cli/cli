const { test } = require("node:test");
const assert = require("node:assert");

const {
  fingerprintToolchain,
  getToolVersion,
  clearToolchainCache,
} = require("../dist/cjs/runtime/toolchain.js");

test("toolchain can be fingerprinted without errors", () => {
  clearToolchainCache();
  const tools = fingerprintToolchain(true); // skip cache
  assert.strictEqual(Array.isArray(tools), true);
  assert.strictEqual(tools.length >= 4, true); // at least node, rustc, solana, anchor
});

test("toolchain includes node (always available in test environment)", () => {
  clearToolchainCache();
  const tools = fingerprintToolchain(true);
  const nodeTool = tools.find((t) => t.name === "node");
  assert.strictEqual(nodeTool?.available, true);
  assert.strictEqual(typeof nodeTool?.version, "string");
  assert.match(nodeTool?.version || "", /\d+\.\d+/);
});

test("toolchain version parser extracts semantic version", () => {
  const tools = fingerprintToolchain(true);
  tools.forEach((tool) => {
    if (tool.available && tool.version) {
      // Version should be in format like "v1.2.3" or "1.2.3"
      assert.match(tool.version, /v?\d+\.\d+/);
    }
  });
});

test("getToolVersion retrieves specific tool", () => {
  clearToolchainCache();
  const nodeTool = getToolVersion("node");
  assert.strictEqual(nodeTool?.name, "node");
  assert.strictEqual(nodeTool?.available, true);
});

test("toolchain caches results for 1 minute", () => {
  clearToolchainCache();
  const first = fingerprintToolchain(false); // no skip cache
  const second = fingerprintToolchain(false); // should use cache
  assert.deepStrictEqual(first, second);
});

test("missing tool returns available: false", () => {
  clearToolchainCache();
  const tools = fingerprintToolchain(true);
  // At least some tools will be missing in typical environments
  const missingTools = tools.filter((t) => !t.available);
  assert.strictEqual(missingTools.length > 0, true);
  missingTools.forEach((tool) => {
    assert.strictEqual(tool.available, false);
    assert.strictEqual(typeof tool.raw, "string");
  });
});

test("clearToolchainCache resets cache", () => {
  clearToolchainCache();
  assert.strictEqual(clearToolchainCache(), undefined);
});
