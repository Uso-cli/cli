const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Uso } = require("../dist/cjs/index.js");

test("integration: check-environment executes end-to-end", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "uso-core-int-"));

  try {
    const uso = new Uso({
      projectRoot: tmpRoot,
      telemetry: { enabled: true, mode: "local", logDir: tmpRoot },
    });

    const result = await uso.executeIntent({ intent: "check environment" });

    assert.equal(result.status, "success");
    assert.equal(result.plan.intentKind, "check-environment");
    assert.ok(Array.isArray(result.evidence.events));
    assert.ok(
      result.evidence.events.some((e) => e.includes("intent.received")),
    );
    assert.ok(result.evidence.notes.some((n) => n.includes("Evidence saved:")));

    const evidenceDir = path.join(tmpRoot, ".uso", "evidence");
    assert.ok(fs.existsSync(evidenceDir));
    const files = fs.readdirSync(evidenceDir);
    assert.ok(files.length >= 1);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("integration: unknown intent is blocked with UNKNOWN_INTENT", async () => {
  const uso = new Uso({ projectRoot: process.cwd() });

  const result = await uso.executeIntent({
    intent: "non-existent intent phrase",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.error?.code, "UNKNOWN_INTENT");
  assert.ok(result.evidence.events.some((e) => e.includes("intent.received")));
});

test("integration: deploy blocked by guardrail policy", async () => {
  const uso = new Uso({
    projectRoot: process.cwd(),
    guardrails: {
      allowedClusters: [],
    },
  });

  const result = await uso.executeIntent({ intent: "deploy" });

  assert.equal(result.status, "blocked");
  assert.equal(result.error?.code, "GUARDRAIL_BLOCK");
  assert.match(result.error?.message || "", /cluster|policy/i);
});

test("integration: telemetry disabled skips evidence persistence note", async () => {
  const uso = new Uso({
    projectRoot: process.cwd(),
    telemetry: { enabled: false, mode: "local" },
  });

  const result = await uso.executeIntent({ intent: "check environment" });

  assert.equal(result.status, "success");
  assert.equal(
    result.evidence.notes.some((n) => n.includes("Evidence saved:")),
    false,
  );
});
