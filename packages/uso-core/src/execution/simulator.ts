import { spawnSync } from "node:child_process";
import type {
  ExecutionPlan,
  SimulationResult,
  GuardrailPolicy,
} from "../types";

interface CostEstimate {
  rentExemptMinimum: number;
  estimatedCost: number;
  executionUnits: number;
  feesPerSignature: number;
}

/**
 * Estimate costs for a program deployment based on IDL and guardrails
 */
function estimateDeploymentCost(plan: ExecutionPlan): CostEstimate {
  // Typical values for Solana (as of 2024)
  const rentExemptMinimum = 2.0; // ~2 SOL per typical program
  const estimatedCost = 2.5; // deployment + fees
  const executionUnits = 100_000;
  const feesPerSignature = 0.00025;

  // TODO: Parse anchor.toml and IDL for actual program size
  // For now, use conservative estimates

  return {
    rentExemptMinimum,
    estimatedCost,
    executionUnits,
    feesPerSignature,
  };
}

/**
 * Run a dry-run simulation via anchor (if available)
 */
function runAnchorDryRun(plan: ExecutionPlan): SimulationResult {
  if (
    plan.intentKind !== "build-program" &&
    plan.intentKind !== "test-program"
  ) {
    return { ok: true };
  }

  // Try to get task command that would be run
  const task = plan.tasks[0];
  if (!task) {
    return { ok: false, reason: "No task found in plan" };
  }

  // For test-program, perform a dry-run test
  if (plan.intentKind === "test-program") {
    try {
      const result = spawnSync(task.command, [...task.args, "--skip-deploy"], {
        encoding: "utf8",
        timeout: 30000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (result.status === 0) {
        return {
          ok: true,
          reason: `Dry-run test passed (${result.stdout?.split(/\r?\n/).length} lines)`,
        };
      }

      // Parse test failure details
      const output = result.stderr || result.stdout || "";
      const failureMatch = output.match(/error\[E\d+\]:/);
      const reasonSnippet = failureMatch
        ? output.substring(0, 200)
        : "Test simulation failed";

      return {
        ok: false,
        reason: `Test dry-run failed: ${reasonSnippet}`,
      };
    } catch (e) {
      return {
        ok: false,
        reason: `Dry-run error: ${e instanceof Error ? e.message : "Unknown error"}`,
      };
    }
  }

  return { ok: true };
}

/**
 * Cross-check estimated costs against guardrails
 */
function validateCostAgainstGuardrails(
  cost: CostEstimate,
  policy: GuardrailPolicy | undefined,
): { ok: boolean; reason?: string } {
  if (!policy || !policy.maxSpendSol) {
    return { ok: true };
  }

  if (cost.estimatedCost > policy.maxSpendSol) {
    return {
      ok: false,
      reason: `Estimated cost (${cost.estimatedCost} SOL) exceeds guardrail limit (${policy.maxSpendSol} SOL)`,
    };
  }

  return { ok: true };
}

/**
 * The main simulation runner - performs pre-flight checks and cost estimation
 */
export function runSimulation(
  plan: ExecutionPlan,
  guardrails?: GuardrailPolicy,
): SimulationResult {
  // Step 1: Validate cluster preconditions
  if (plan.intentKind === "deploy-program") {
    const hasCluster = plan.preconditions.includes("cluster-selected");
    if (!hasCluster) {
      return {
        ok: false,
        reason: "Deployment blocked: cluster precondition missing.",
      };
    }

    // Step 2: Estimate costs
    const cost = estimateDeploymentCost(plan);

    // Step 3: Cross-check against guardrails
    const guardCheck = validateCostAgainstGuardrails(cost, guardrails);
    if (!guardCheck.ok) {
      return guardCheck;
    }
  }

  // Step 4: Run dry-run for test/build tasks
  const dryRunResult = runAnchorDryRun(plan);
  if (!dryRunResult.ok) {
    return dryRunResult;
  }

  return { ok: true };
}
