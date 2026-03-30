import { z } from "zod";

export const guardrailPolicySchema = z.object({
  maxSpendSol: z.number().positive().optional(),
  allowedClusters: z
    .array(z.enum(["localnet", "devnet", "testnet", "mainnet-beta"]))
    .optional(),
  allowedPrograms: z.array(z.string().min(1)).optional(),
  requireSimulationPass: z.boolean().optional(),
  blockOnUnknownIntent: z.boolean().optional(),
  blockUnsafeHealActions: z.boolean().optional(),
  allowAutoHealDeploy: z.boolean().optional(),
});

export const usoConfigSchema = z.object({
  projectRoot: z.string().min(1),
  telemetry: z
    .object({
      enabled: z.boolean(),
      mode: z.literal("local"),
      logDir: z.string().optional(),
    })
    .optional(),
  guardrails: guardrailPolicySchema.optional(),
  runtime: z
    .object({
      preferWsl: z.boolean().optional(),
      distro: z.string().optional(),
      shell: z.enum(["powershell", "bash"]).optional(),
    })
    .optional(),
  healing: z
    .object({
      enabled: z.boolean(),
      maxAttempts: z.number().int().min(1).max(5),
      backoffMs: z.number().int().min(0).max(30000),
    })
    .optional(),
});

export const intentRequestSchema = z.object({
  id: z.string().optional(),
  intent: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  routeHint: z.enum(["native", "wsl", "auto"]).optional(),
});
