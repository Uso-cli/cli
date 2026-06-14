import type { AgentTool, ToolResult } from "../tool-registry";
import type { AgentState } from "../state";
import { runTask } from "../../execution/runner";

/**
 * anchor_build — Build the Anchor program.
 * Wraps the existing uso-core execution runner.
 */
export const anchorBuildTool: AgentTool = {
  name: "anchor_build",
  description:
    "Build the Anchor program in the current project (runs 'anchor build'). " +
    "Returns the build output including any compilation errors.",

  definition: {
    name: "anchor_build",
    description: "Build the Anchor program (anchor build).",
    parameters: {
      type: "object",
      properties: {
        extra_args: {
          type: "string",
          description: "Additional arguments to pass to anchor build.",
        },
      },
    },
  },

  async execute(
    params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult> {
    const extraArgs = params.extra_args
      ? String(params.extra_args).split(" ")
      : [];

    const result = await runTask(
      {
        id: "agent-anchor-build",
        command: "anchor",
        args: ["build", ...extraArgs],
        requiresSimulation: false,
      },
      state.environment.route,
      1,
    );

    const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");

    return {
      success: result.status === "success",
      output: output.length > 4000
        ? output.slice(0, 2000) + "\n...[truncated]...\n" + output.slice(-2000)
        : output,
      error: result.status !== "success" ? `Build failed (exit ${result.exitCode})` : undefined,
      data: { exitCode: result.exitCode },
    };
  },
};

/**
 * anchor_test — Run the Anchor test suite.
 */
export const anchorTestTool: AgentTool = {
  name: "anchor_test",
  description:
    "Run the Anchor test suite (runs 'anchor test'). " +
    "Returns test results including pass/fail counts.",

  definition: {
    name: "anchor_test",
    description: "Run Anchor tests (anchor test).",
    parameters: {
      type: "object",
      properties: {
        skip_local_validator: {
          type: "boolean",
          description:
            "If true, adds --skip-local-validator flag. Use when a validator is already running.",
          default: false,
        },
        extra_args: {
          type: "string",
          description: "Additional arguments to pass to anchor test.",
        },
      },
    },
  },

  async execute(
    params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult> {
    const args = ["test"];
    if (params.skip_local_validator) {
      args.push("--skip-local-validator");
    }
    if (params.extra_args) {
      args.push(...String(params.extra_args).split(" "));
    }

    const result = await runTask(
      {
        id: "agent-anchor-test",
        command: "anchor",
        args,
        requiresSimulation: false,
      },
      state.environment.route,
      1,
    );

    const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");

    return {
      success: result.status === "success",
      output: output.length > 4000
        ? output.slice(0, 2000) + "\n...[truncated]...\n" + output.slice(-2000)
        : output,
      error: result.status !== "success" ? `Tests failed (exit ${result.exitCode})` : undefined,
      data: { exitCode: result.exitCode },
    };
  },
};

/**
 * anchor_deploy — Deploy the Anchor program.
 * This is a destructive action — the agent should confirm before calling.
 */
export const anchorDeployTool: AgentTool = {
  name: "anchor_deploy",
  description:
    "Deploy the compiled Anchor program to the configured Solana cluster. " +
    "⚠️ DESTRUCTIVE: This spends SOL and deploys on-chain. " +
    "Always check wallet balance and cluster before deploying.",

  definition: {
    name: "anchor_deploy",
    description: "Deploy the Anchor program (anchor deploy). DESTRUCTIVE — costs SOL.",
    parameters: {
      type: "object",
      properties: {
        extra_args: {
          type: "string",
          description: "Additional arguments to pass to anchor deploy.",
        },
      },
    },
  },

  async execute(
    params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult> {
    const extraArgs = params.extra_args
      ? String(params.extra_args).split(" ")
      : [];

    const result = await runTask(
      {
        id: "agent-anchor-deploy",
        command: "anchor",
        args: ["deploy", ...extraArgs],
        requiresSimulation: true,
      },
      state.environment.route,
      1,
    );

    const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");

    return {
      success: result.status === "success",
      output: output.length > 4000
        ? output.slice(0, 2000) + "\n...[truncated]...\n" + output.slice(-2000)
        : output,
      error: result.status !== "success" ? `Deploy failed (exit ${result.exitCode})` : undefined,
      data: { exitCode: result.exitCode },
    };
  },
};

/**
 * solana_airdrop — Airdrop SOL to a wallet (devnet/testnet only).
 */
export const solanaAirdropTool: AgentTool = {
  name: "solana_airdrop",
  description:
    "Airdrop SOL to a wallet address on devnet or testnet. " +
    "Cannot be used on mainnet. Useful for funding deployment wallets.",

  definition: {
    name: "solana_airdrop",
    description: "Airdrop SOL to a wallet (devnet/testnet only).",
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Amount of SOL to airdrop (e.g., 1, 2, 5).",
        },
        address: {
          type: "string",
          description:
            "Target wallet address. Omit to airdrop to the default wallet.",
        },
      },
      required: ["amount"],
    },
  },

  async execute(
    params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult> {
    const amount = Number(params.amount ?? 1);
    const address = params.address ? String(params.address) : undefined;

    const args = ["airdrop", String(amount)];
    if (address) args.push(address);

    const result = await runTask(
      {
        id: "agent-solana-airdrop",
        command: "solana",
        args,
        requiresSimulation: false,
      },
      state.environment.route,
      1,
    );

    const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");

    return {
      success: result.status === "success",
      output,
      error: result.status !== "success" ? `Airdrop failed (exit ${result.exitCode})` : undefined,
    };
  },
};
