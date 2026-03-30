# uso-core

TypeScript-first intent execution core for USO.

## What It Provides

- Deterministic `init()` environment checks
- Deterministic `executeIntent()` routing and execution pipeline
- Guardrail evaluation and bounded healing strategy hooks
- Dual CJS and ESM build outputs

## Install

```bash
npm install @xaidenlabs/uso-core
```

## Quick Start

```ts
import { Uso } from "@xaidenlabs/uso-core";

const uso = new Uso({
  projectRoot: process.cwd(),
  telemetry: { enabled: true, mode: "local" },
  runtime: { preferWsl: false },
  healing: { enabled: true, maxAttempts: 2, backoffMs: 250 },
});

const init = await uso.init({}, { strict: false, registerMcpHook: false });
console.log(init);
```

## API: init()

`init()` validates runtime/toolchain state and returns a deterministic report.

```ts
const result = await uso.init(
  {
    projectRoot: "C:/repo/uso",
    runtime: { preferWsl: true },
  },
  {
    strict: true,
    registerMcpHook: false,
  },
);

if (result.errors.length > 0) {
  console.error("Init failed", result.errors);
}
```

Result highlights:

- `os`: resolved host OS (`windows`, `linux`, `darwin`)
- `runtimeRoute`: selected route (`native` or `wsl`)
- `checks[]`: tool checks with `pass`/`warn`/`fail` and optional remediation
- `warnings[]` and `errors[]`: summarized health outcomes

## API: executeIntent()

`executeIntent()` parses an intent, builds a task plan, applies preconditions/guardrails,
runs simulation, and then executes with bounded retries.

```ts
const execution = await uso.executeIntent({
  intent: "build",
  routeHint: "auto",
  context: {
    binary: "anchor",
    args: ["--skip-lint"],
  },
});

if (execution.status !== "success") {
  console.error(execution.error);
}
```

Supported deterministic intent families:

- `check-environment`
- `build-program`
- `test-program`
- `deploy-program`

Common aliases include `doctor`, `build`, `test`, and `deploy`.

## Feature-Flagged CLI Bridge

When integrating through the CLI adapter, the bridge is controlled by:

- `USE_INTENT_SDK=1`
- `USO_CORE_BRIDGE=1`

Disable either flag to immediately fall back to existing CLI behavior.

## Troubleshooting

`stdout is not a tty` in CI:

- This is expected in non-interactive shells.
- Compare baseline and SDK-enabled outputs/exit codes for parity.
- For extra confidence, run an interactive local smoke check.

`anchor` or `solana` not found:

- Run `uso.init()` and inspect `checks[].remediation`.
- Ensure binaries are on PATH for the selected route (`native` vs `wsl`).

Deploy blocked by preconditions:

- Verify wallet funding and cluster configuration before deploy intents.
- Re-run `executeIntent()` after remediation.

Unexpected retries or escalation:

- Inspect returned `attempts[]` and `evidence.reflections`.
- Tune `healing.maxAttempts` and `healing.backoffMs` for your environment.

## Build and Test

```bash
npm run build
npm test
```
