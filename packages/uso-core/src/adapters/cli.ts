import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Uso } from "../core";
import type { IntentRequest, RuntimeRoute, UsoConfig } from "../types";

export type CliCommand = "build" | "test" | "deploy";

export interface CliAdapterInput {
  command: CliCommand;
  args?: string[];
  binary?: string;
  cwd?: string;
  preferWsl?: boolean;
}

export interface CliAdapterResult {
  handled: boolean;
  ok: boolean;
  status?: "success" | "failed" | "blocked";
  exitCode?: number;
  reason?: string;
}

export function isIntentSdkEnabled(): boolean {
  return (
    process.env.USE_INTENT_SDK === "1" || process.env.USO_CORE_BRIDGE === "1"
  );
}

export function commandToIntentRequest(
  input: CliAdapterInput,
): IntentRequest | null {
  const args = Array.isArray(input.args) ? input.args : [];
  const binary = input.binary ?? "anchor";

  if (input.command === "build") {
    return {
      intent: "build-program",
      routeHint: "auto",
      context: { binary, args },
    };
  }

  if (input.command === "test") {
    return {
      intent: "test-program",
      routeHint: "auto",
      context: { binary, args },
    };
  }

  if (input.command === "deploy") {
    return {
      intent: "deploy-program",
      routeHint: "auto",
      context: { binary, args },
    };
  }

  return null;
}

function appendCliTrace(cwd: string, payload: Record<string, unknown>): void {
  const usoDir = join(cwd, ".uso");
  mkdirSync(usoDir, { recursive: true });
  const logPath = join(usoDir, "cli-runs.log");
  appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function runCliIntentAdapter(
  input: CliAdapterInput,
): Promise<CliAdapterResult> {
  if (!isIntentSdkEnabled()) {
    return { handled: false, ok: false };
  }

  const cwd = input.cwd ?? process.cwd();
  const request = commandToIntentRequest(input);
  if (!request) {
    return { handled: false, ok: false };
  }

  const config: Partial<UsoConfig> = {
    projectRoot: cwd,
    runtime: { preferWsl: !!input.preferWsl } as {
      preferWsl?: boolean;
      distro?: string;
      shell?: "powershell" | "bash";
    },
    healing: { enabled: true, maxAttempts: 2, backoffMs: 250 },
  };

  try {
    const uso = new Uso(config);
    const result = await uso.executeIntent(request);

    appendCliTrace(cwd, {
      timestamp: new Date().toISOString(),
      command: input.command,
      args: input.args ?? [],
      status: result.status,
      route: result.route as RuntimeRoute,
      error: result.error?.message,
    });

    if (result.status === "success") {
      return {
        handled: true,
        ok: true,
        status: result.status,
        exitCode: 0,
      };
    }

    return {
      handled: true,
      ok: false,
      status: result.status,
      exitCode: 1,
      reason: result.error?.message,
    };
  } catch (err) {
    appendCliTrace(cwd, {
      timestamp: new Date().toISOString(),
      command: input.command,
      args: input.args ?? [],
      status: "adapter-error",
      error: (err as Error).message,
    });

    return {
      handled: true,
      ok: false,
      status: "failed",
      exitCode: 1,
      reason: (err as Error).message,
    };
  }
}
