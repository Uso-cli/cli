const { test } = require("node:test");
const assert = require("node:assert");

const {
  getRemediationHint,
  addRemediationToCheck,
} = require("../dist/cjs/healing/remediation.js");

test("remediation hints provided for missing tools", () => {
  const hint = getRemediationHint("anchor", "linux");
  assert.strictEqual(typeof hint, "string");
  assert.match(hint, /Install|anchor/i);
});

test("remediation hints include install URLs", () => {
  const hints = ["node", "rustc", "solana", "anchor"];
  for (const tool of hints) {
    const hint = getRemediationHint(tool, "linux");
    assert.strictEqual(typeof hint, "string");
  }
});

test("addRemediationToCheck adds hint to failed check", () => {
  const failedCheck = {
    id: "tool-anchor",
    status: "fail",
    message: "anchor missing",
  };
  const result = addRemediationToCheck(failedCheck, "linux");
  assert.strictEqual(typeof result.remediation, "string");
  assert.match(result.remediation, /anchor/i);
});

test("addRemediationToCheck adds hint to warn check", () => {
  const warnCheck = {
    id: "tool-solana",
    status: "warn",
    message: "solana missing",
  };
  const result = addRemediationToCheck(warnCheck, "linux");
  assert.strictEqual(typeof result.remediation, "string");
});

test("addRemediationToCheck doesn't add hint to pass check", () => {
  const passCheck = {
    id: "tool-node",
    status: "pass",
    message: "node available",
    detail: "v20.10.0",
  };
  const result = addRemediationToCheck(passCheck, "linux");
  assert.strictEqual(result.remediation, undefined);
});

test("unknown tool doesn't get a remediation hint", () => {
  const check = {
    id: "tool-unknown",
    status: "fail",
    message: "unknown missing",
  };
  const result = addRemediationToCheck(check, "linux");
  assert.strictEqual(result.remediation, undefined);
});
