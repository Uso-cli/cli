const assert = require("assert");
const test = require("node:test");
const {
  LifecycleManager,
  createLifecycleHelpers,
} = require("../dist/cjs/execution/lifecycle.js");
const {
  EvidenceCollector,
  extractHealingHistory,
  extractTaskHistory,
} = require("../dist/cjs/execution/evidence.js");

test("lifecycle: LifecycleManager can emit and track events", () => {
  const manager = new LifecycleManager();
  const intentId = "intent-123";

  manager.emit("intent-received", intentId, "init", { test: true });

  const events = manager.getEvents();
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "intent-received");
  assert.strictEqual(events[0].intentId, intentId);
  assert.strictEqual(events[0].phase, "init");
  assert.match(events[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("lifecycle: LifecycleManager can register event listeners", () => {
  const manager = new LifecycleManager();
  let callCount = 0;

  manager.on("intent-success", () => {
    callCount += 1;
  });

  manager.emit("intent-success", "intent-1", "complete", {});

  assert.strictEqual(callCount, 1);
});

test("lifecycle: LifecycleManager filters events by intentId", () => {
  const manager = new LifecycleManager();

  manager.emit("intent-received", "intent-1", "init", {});
  manager.emit("intent-received", "intent-2", "init", {});
  manager.emit("intent-success", "intent-1", "complete", {});

  const intent1Events = manager.getIntentEvents("intent-1");
  assert.strictEqual(intent1Events.length, 2);
  assert(intent1Events.every((e) => e.intentId === "intent-1"));
});

test("lifecycle: LifecycleManager reset clears all data", () => {
  const manager = new LifecycleManager();

  manager.emit("intent-received", "intent-1", "init", {});
  manager.reset();

  assert.strictEqual(manager.getEvents().length, 0);
});

test("lifecycle: createLifecycleHelpers provides convenience methods", () => {
  const manager = new LifecycleManager();
  const helpers = createLifecycleHelpers(manager);
  const intentId = "intent-456";

  helpers.emitIntentSuccess(intentId, { task: "completed" });

  const events = manager.getEvents();
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, "intent-success");
  assert.deepStrictEqual(events[0].data.result, { task: "completed" });
});

test("evidence: EvidenceCollector can record execution results", () => {
  const collector = new EvidenceCollector();
  const result = {
    intentId: "intent-789",
    status: "success",
    route: "native",
    plan: {
      intentKind: "deploy-program",
      route: "native",
      tasks: [],
      preconditions: [],
    },
    attempts: [
      {
        taskId: "task-1",
        attempt: 1,
        command: "cargo build",
        args: ["--release"],
        route: "native",
        status: "success",
        stdout: "Finished release",
        stderr: "",
        exitCode: 0,
      },
    ],
    evidence: { events: [], notes: [], reflections: [] },
  };

  const evidence = collector.record(result, [], 1500);

  assert.strictEqual(evidence.intentId, "intent-789");
  assert.strictEqual(evidence.status, "success");
  assert.strictEqual(evidence.tasksAttempted, 1);
  assert.strictEqual(evidence.tasksSucceeded, 1);
  assert.strictEqual(evidence.duration_ms, 1500);
});

test("evidence: EvidenceCollector calculates success metrics", () => {
  const collector = new EvidenceCollector();
  const result = {
    intentId: "intent-999",
    status: "success",
    route: "native",
    plan: {
      intentKind: "build-program",
      route: "native",
      tasks: [],
      preconditions: [],
    },
    attempts: [
      {
        taskId: "task-1",
        attempt: 1,
        command: "rustc",
        args: ["--version"],
        route: "native",
        status: "success",
        stdout: "rustc 1.75.0",
        stderr: "",
        exitCode: 0,
      },
      {
        taskId: "task-2",
        attempt: 1,
        command: "cargo",
        args: ["build"],
        route: "native",
        status: "failed",
        stdout: "",
        stderr: "error: could not compile",
        exitCode: 1,
      },
      {
        taskId: "task-2",
        attempt: 2,
        command: "cargo",
        args: ["build"],
        route: "native",
        status: "success",
        stdout: "Finished",
        stderr: "",
        exitCode: 0,
      },
    ],
    evidence: { events: [], notes: [], reflections: [] },
  };

  const evidence = collector.record(result, [], 5000);

  assert.strictEqual(evidence.tasksAttempted, 3);
  assert.strictEqual(evidence.tasksSucceeded, 2);
});

test("evidence: extractTaskHistory formats task attempts", () => {
  const attempts = [
    {
      taskId: "build-1",
      attempt: 1,
      command: "cargo build",
      args: [],
      route: "native",
      status: "failed",
      stdout: "",
      stderr: "error",
      exitCode: 1,
    },
    {
      taskId: "build-1",
      attempt: 2,
      command: "cargo build",
      args: [],
      route: "native",
      status: "success",
      stdout: "Finished",
      stderr: "",
      exitCode: 0,
    },
  ];

  const history = extractTaskHistory(attempts);

  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].taskId, "build-1");
  assert.strictEqual(history[0].attempt, 1);
  assert.strictEqual(history[0].status, "failed");
  assert.strictEqual(history[1].attempt, 2);
  assert.strictEqual(history[1].status, "success");
});

test("evidence: extractHealingHistory from lifecycle events", () => {
  const events = [
    {
      type: "healing-applied",
      timestamp: "2024-01-15T10:00:00Z",
      intentId: "intent-1",
      phase: "heal",
      data: {
        error: "insufficient funds",
        decision: {
          level: "heuristic",
          appliedFix: "Run: solana airdrop 1",
        },
      },
    },
    {
      type: "healing-applied",
      timestamp: "2024-01-15T10:00:05Z",
      intentId: "intent-1",
      phase: "heal",
      data: {
        error: "timeout waiting for block",
        decision: {
          level: "contextual",
          appliedFix: "Retrying after network issue",
        },
      },
    },
  ];

  const history = extractHealingHistory(events);

  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].decision, "heuristic");
  assert.match(history[0].appliedFix, /airdrop/);
  assert.strictEqual(history[1].decision, "contextual");
});

test("evidence: summarize generates readable output", () => {
  const collector = new EvidenceCollector();
  const result = {
    intentId: "intent-final",
    status: "success",
    route: "native",
    plan: {
      intentKind: "test-program",
      route: "native",
      tasks: [],
      preconditions: [],
    },
    attempts: [
      {
        taskId: "test-1",
        attempt: 1,
        command: "cargo test",
        args: [],
        route: "native",
        status: "success",
        stdout: "test result: ok",
        stderr: "",
        exitCode: 0,
      },
    ],
    evidence: { events: [], notes: [], reflections: [] },
  };

  const evidence = collector.record(result, [], 3000);
  const summary = collector.summarize(evidence);

  assert.match(summary, /Intent: test-program/);
  assert.match(summary, /Status: SUCCESS/);
  assert.match(summary, /Duration: 3000ms/);
  assert.match(summary, /Tasks: 1\/1 succeeded/);
});
