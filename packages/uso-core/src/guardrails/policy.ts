import type { ExecutionPlan, GuardrailPolicy, HealingDecision } from "../types";

export function evaluateGuardrails(
  plan: ExecutionPlan,
  policy?: GuardrailPolicy,
): { ok: boolean; reason?: string } {
  if (!policy) {
    return { ok: true };
  }

  if (policy.blockOnUnknownIntent && !plan.intentKind) {
    return { ok: false, reason: "Unknown intent blocked by policy." };
  }

  if (
    plan.intentKind === "deploy-program" &&
    policy.allowedClusters &&
    policy.allowedClusters.length === 0
  ) {
    return {
      ok: false,
      reason: "No cluster allowed by policy for deploy intent.",
    };
  }

  return { ok: true };
}

export function evaluateHealingGuardrails(
  plan: ExecutionPlan,
  decision: HealingDecision,
  policy?: GuardrailPolicy,
): { ok: boolean; reason?: string } {
  if (!policy) {
    return { ok: true };
  }

  if (
    policy.blockUnsafeHealActions &&
    plan.intentKind === "deploy-program" &&
    decision.shouldRetry
  ) {
    if (!policy.allowAutoHealDeploy) {
      return {
        ok: false,
        reason: "Auto-heal retry for deploy intent blocked by guardrails.",
      };
    }
  }

  return { ok: true };
}
