import { randomUUID } from "node:crypto";
import { intentRequestSchema, usoConfigSchema } from "./config/schema";
import { createEventLogger } from "./events/logger";
import {
  evaluateGuardrails,
  evaluateHealingGuardrails,
} from "./guardrails/policy";
import { decideHealing } from "./healing/engine";
import { addRemediationToCheck } from "./healing/remediation";
import { routeIntent } from "./intent/router";
import { registerMcpHook, type McpRegistrationHook } from "./mcp/hook";
import { runTask } from "./execution/runner";
import { runSimulation } from "./execution/simulator";
import {
  validatePreconditions,
  allPreconditionsSatisfied,
} from "./execution/preconditions";
import { EvidenceCollector } from "./execution/evidence";
import { discoverRuntime } from "./runtime/discovery";
import { fingerprintToolchain } from "./runtime/toolchain";
import type {
  ExecutionResult,
  InitOptions,
  InitResult,
  IntentRequest,
  AttemptRecord,
  ReflectionRecord,
  UsoConfig,
  UsoError,
} from "./types";

const defaultConfig: UsoConfig = {
  projectRoot: process.cwd(),
  telemetry: { enabled: true, mode: "local" },
  runtime: { preferWsl: false },
  healing: { enabled: true, maxAttempts: 2, backoffMs: 250 },
};

function toUsoError(
  category: UsoError["category"],
  code: string,
  message: string,
  raw?: string,
): UsoError {
  return { category, code, message, raw };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Uso {
  private config: UsoConfig = defaultConfig;
  private mcpHook?: McpRegistrationHook;

  constructor(config?: Partial<UsoConfig>, mcpHook?: McpRegistrationHook) {
    if (config) {
      this.config = this.mergeConfig(config);
    }
    this.mcpHook = mcpHook;
  }

  private mergeConfig(config: Partial<UsoConfig>): UsoConfig {
    return {
      ...defaultConfig,
      ...config,
      telemetry: {
        enabled: config.telemetry?.enabled ?? defaultConfig.telemetry!.enabled,
        mode: "local",
        logDir: config.telemetry?.logDir ?? defaultConfig.telemetry?.logDir,
      },
      runtime: { ...defaultConfig.runtime, ...config.runtime },
      healing: {
        enabled: config.healing?.enabled ?? defaultConfig.healing!.enabled,
        maxAttempts:
          config.healing?.maxAttempts ?? defaultConfig.healing!.maxAttempts,
        backoffMs:
          config.healing?.backoffMs ?? defaultConfig.healing!.backoffMs,
      },
      guardrails: config.guardrails,
    };
  }

  async init(
    config?: Partial<UsoConfig>,
    options?: InitOptions,
  ): Promise<InitResult> {
    if (config) {
      this.config = this.mergeConfig(config);
    }

    const parsed = usoConfigSchema.safeParse(this.config);
    if (!parsed.success) {
      return {
        timestamp: new Date().toISOString(),
        os:
          process.platform === "win32"
            ? "windows"
            : process.platform === "darwin"
              ? "darwin"
              : "linux",
        runtimeRoute: "native",
        checks: [],
        warnings: [],
        errors: [parsed.error.message],
      };
    }

    const runtime = discoverRuntime(parsed.data);
    const toolchain = fingerprintToolchain();

    const checks = toolchain.map((t) => ({
      id: `tool-${t.name}`,
      status: t.available
        ? ("pass" as const)
        : options?.strict
          ? ("fail" as const)
          : ("warn" as const),
      message: t.available ? `${t.name} available` : `${t.name} missing`,
      detail: t.version ?? t.raw,
    }));

    // Add remediation hints to failed/warned checks
    const checksWithRemediation = checks.map((c) =>
      addRemediationToCheck(c, runtime.os),
    );

    if (options?.registerMcpHook) {
      await registerMcpHook(this.mcpHook);
    }

    const warnings = checksWithRemediation
      .filter((c) => c.status === "warn")
      .map((c) => c.message);
    const errors = checksWithRemediation
      .filter((c) => c.status === "fail")
      .map((c) => c.message);

    return {
      timestamp: new Date().toISOString(),
      os: runtime.os,
      runtimeRoute: runtime.route,
      checks: checksWithRemediation,
      warnings,
      errors,
    };
  }

  async executeIntent(request: IntentRequest): Promise<ExecutionResult> {
    const logger = createEventLogger();
    const startedAt = Date.now();
    const evidenceCollector = new EvidenceCollector();

    const finalizeResult = (result: ExecutionResult): ExecutionResult => {
      if (!this.config.telemetry?.enabled) {
        return result;
      }

      const durationMs = Date.now() - startedAt;
      const record = evidenceCollector.record(
        result,
        result.evidence.events,
        durationMs,
      );

      try {
        const projectRoot =
          this.config.telemetry?.logDir ?? this.config.projectRoot;
        const evidencePath = evidenceCollector.persistToDisk(
          projectRoot,
          record,
        );
        result.evidence.notes.push(`Evidence saved: ${evidencePath}`);
      } catch (err) {
        result.evidence.notes.push(
          `Evidence save failed: ${(err as Error).message}`,
        );
      }

      return result;
    };
    logger.emit("intent.received", { intent: request.intent });

    const parsed = intentRequestSchema.safeParse(request);
    if (!parsed.success) {
      const invalid = toUsoError(
        "CONFIG_INVALID",
        "INVALID_INTENT_REQUEST",
        parsed.error.message,
      );
      return finalizeResult({
        intentId: request.id ?? randomUUID(),
        status: "failed",
        route: "native",
        plan: {
          intentKind: "check-environment",
          route: "native",
          preconditions: [],
          tasks: [],
        },
        attempts: [],
        evidence: { events: logger.getEvents(), notes: [], reflections: [] },
        error: invalid,
      });
    }

    const runtime = discoverRuntime(this.config);
    const intentId = parsed.data.id ?? randomUUID();

    let plan;
    try {
      plan = routeIntent(parsed.data, runtime.route);
      logger.emit("intent.routed", {
        kind: plan.intentKind,
        route: plan.route,
      });
    } catch (err) {
      const unknownIntent = toUsoError(
        "UNKNOWN",
        "UNKNOWN_INTENT",
        (err as Error).message,
      );
      return finalizeResult({
        intentId,
        status: "blocked",
        route: runtime.route,
        plan: {
          intentKind: "check-environment",
          route: runtime.route,
          preconditions: [],
          tasks: [],
        },
        attempts: [],
        evidence: { events: logger.getEvents(), notes: [], reflections: [] },
        error: unknownIntent,
      });
    }

    const policyResult = evaluateGuardrails(plan, this.config.guardrails);
    logger.emit("guardrails.checked", policyResult);

    if (!policyResult.ok) {
      return finalizeResult({
        intentId,
        status: "blocked",
        route: plan.route,
        plan,
        attempts: [],
        evidence: {
          events: logger.getEvents(),
          notes: [policyResult.reason ?? "Blocked by guardrails"],
          reflections: [],
        },
        error: toUsoError(
          "POLICY_BLOCKED",
          "GUARDRAIL_BLOCK",
          policyResult.reason ?? "Guardrail blocked intent",
        ),
      });
    }

    // Validate preconditions
    const preconditionResults = await validatePreconditions(plan);
    logger.emit("preconditions.checked", {
      total: preconditionResults.length,
      satisfied: preconditionResults.filter((r) => r.satisfied).length,
    });

    if (!allPreconditionsSatisfied(preconditionResults)) {
      const unsatisfiedPreconditions = preconditionResults
        .filter((r) => !r.satisfied)
        .map(
          (r) => `${r.name}: ${r.message}${r.remedy ? ` (${r.remedy})` : ""}`,
        )
        .join("; ");

      return finalizeResult({
        intentId,
        status: "blocked",
        route: plan.route,
        plan,
        attempts: [],
        evidence: {
          events: logger.getEvents(),
          notes: [
            "Preconditions not satisfied",
            ...preconditionResults
              .filter((r) => !r.satisfied)
              .map((r) => r.remedy ?? `Fix: ${r.name}`),
          ],
          reflections: [],
        },
        error: toUsoError(
          "PRECONDITION_FAILED",
          "PRECONDITION_CHECK_FAILED",
          unsatisfiedPreconditions,
        ),
      });
    }

    const simulation = runSimulation(plan, this.config.guardrails);
    logger.emit("simulation.completed", simulation);

    if (
      !simulation.ok &&
      this.config.guardrails?.requireSimulationPass !== false
    ) {
      return finalizeResult({
        intentId,
        status: "blocked",
        route: plan.route,
        plan,
        attempts: [],
        evidence: {
          events: logger.getEvents(),
          notes: [simulation.reason ?? "Simulation failed"],
          reflections: [],
        },
        error: toUsoError(
          "SIMULATION_FAILED",
          "SIMULATION_BLOCK",
          simulation.reason ?? "Simulation failed",
        ),
      });
    }

    const attempts: AttemptRecord[] = [];
    const reflections: ReflectionRecord[] = [];
    const maxAttempts = this.config.healing?.maxAttempts ?? 2;
    const baseBackoffMs = this.config.healing?.backoffMs ?? 250;

    for (const task of plan.tasks) {
      let attempt = 1;
      let done = false;

      while (!done) {
        logger.emit("execution.started", { taskId: task.id, attempt });
        const result = await runTask(task, plan.route, attempt);
        attempts.push(result);

        if (result.status === "success") {
          logger.emit("task.succeeded", { taskId: task.id, attempt });
          done = true;
          continue;
        }

        const healing = decideHealing(
          result.stderr,
          result.stdout,
          attempt,
          maxAttempts,
          baseBackoffMs,
        );
        logger.emit("healing.decided", healing);

        const reflection: ReflectionRecord = {
          timestamp: new Date().toISOString(),
          taskId: task.id,
          attempt,
          level: healing.level,
          decision: healing.decision,
          reason: healing.reason ?? "No reason provided",
          stderrSnippet: result.stderr.slice(0, 300),
          appliedFix: healing.appliedFix,
        };
        reflections.push(reflection);

        const healingPolicy = evaluateHealingGuardrails(
          plan,
          healing,
          this.config.guardrails,
        );
        if (!healingPolicy.ok) {
          return finalizeResult({
            intentId,
            status: "blocked",
            route: plan.route,
            plan,
            attempts,
            evidence: {
              events: logger.getEvents(),
              notes: [healingPolicy.reason ?? "Healing blocked by guardrails"],
              reflections,
            },
            error: toUsoError(
              "POLICY_BLOCKED",
              "HEALING_BLOCKED",
              healingPolicy.reason ?? "Healing blocked by guardrails",
            ),
          });
        }

        if (!healing.shouldRetry) {
          result.appliedFix = healing.appliedFix;
          return finalizeResult({
            intentId,
            status: "failed",
            route: plan.route,
            plan,
            attempts,
            evidence: {
              events: logger.getEvents(),
              notes: [healing.reason ?? "Execution failed"],
              reflections,
            },
            error: toUsoError(
              "EXECUTION_FAILED",
              "TASK_FAILED",
              healing.reason ?? "Task failed",
              result.stderr || result.stdout,
            ),
          });
        }

        if (healing.retryAfterMs && healing.retryAfterMs > 0) {
          await delay(healing.retryAfterMs);
        }

        attempt += 1;
      }
    }

    logger.emit("intent.completed", { status: "success" });
    return finalizeResult({
      intentId,
      status: "success",
      route: plan.route,
      plan,
      attempts,
      evidence: { events: logger.getEvents(), notes: [], reflections: [] },
    });
  }
}
