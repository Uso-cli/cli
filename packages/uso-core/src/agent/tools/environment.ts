import { spawnSync } from "node:child_process";
import type { AgentTool, ToolResult } from "../tool-registry";
import type { AgentState } from "../state";
import { fingerprintToolchain } from "../../runtime/toolchain";

/**
 * check_environment — Scan the dev environment for installed tools,
 * OS details, and wallet/cluster status. Gives the agent a complete
 * snapshot of the developer's machine.
 */
export const checkEnvironmentTool: AgentTool = {
  name: "check_environment",
  description:
    "Scan the development environment: OS, installed tools (node, rust, solana, anchor), " +
    "their versions, wallet status, and current Solana cluster. " +
    "Call this first to understand the developer's setup before planning.",

  definition: {
    name: "check_environment",
    description:
      "Scan the development environment for installed tools, versions, wallet, and cluster.",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  async execute(
    _params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult> {
    const results: string[] = [];

    // OS
    results.push(`OS: ${state.environment.os}`);
    results.push(`Runtime Route: ${state.environment.route}`);

    // Toolchain
    const toolchain = fingerprintToolchain(true);
    for (const tool of toolchain) {
      if (tool.available) {
        results.push(`✅ ${tool.name}: ${tool.version ?? tool.raw ?? "available"}`);
      } else {
        results.push(`❌ ${tool.name}: NOT INSTALLED`);
      }
    }

    // Wallet
    try {
      const walletResult = spawnSync("solana", ["address"], {
        encoding: "utf8",
        timeout: 5000,
      });
      if (walletResult.status === 0 && walletResult.stdout) {
        results.push(`Wallet: ${walletResult.stdout.trim()}`);
      } else {
        results.push("Wallet: No wallet configured");
      }
    } catch {
      results.push("Wallet: solana CLI not available");
    }

    // Balance
    try {
      const balResult = spawnSync("solana", ["balance"], {
        encoding: "utf8",
        timeout: 5000,
      });
      if (balResult.status === 0 && balResult.stdout) {
        results.push(`Balance: ${balResult.stdout.trim()}`);
      }
    } catch {
      // skip
    }

    // Cluster
    try {
      const clusterResult = spawnSync("solana", ["config", "get"], {
        encoding: "utf8",
        timeout: 5000,
      });
      if (clusterResult.status === 0 && clusterResult.stdout) {
        const rpcMatch = clusterResult.stdout.match(/RPC URL:\s*([^\n]+)/);
        if (rpcMatch) {
          results.push(`Cluster RPC: ${rpcMatch[1].trim()}`);
        }
      }
    } catch {
      // skip
    }

    return {
      success: true,
      output: results.join("\n"),
      data: {
        toolchain: toolchain.map((t) => ({
          name: t.name,
          available: t.available,
          version: t.version,
        })),
      },
    };
  },
};

/**
 * check_wallet_balance — Get the SOL balance of a wallet.
 */
export const checkWalletBalanceTool: AgentTool = {
  name: "check_wallet_balance",
  description:
    "Check the SOL balance of a wallet address, or the default wallet if no address is given.",

  definition: {
    name: "check_wallet_balance",
    description: "Check the SOL balance of a wallet.",
    parameters: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Wallet address to check. Omit to check the default wallet.",
        },
      },
    },
  },

  async execute(
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const address = params.address ? String(params.address) : undefined;
    const args = address ? ["balance", address] : ["balance"];

    try {
      const result = spawnSync("solana", args, {
        encoding: "utf8",
        timeout: 10000,
      });

      if (result.status === 0 && result.stdout) {
        return {
          success: true,
          output: result.stdout.trim(),
        };
      }

      return {
        success: false,
        output: result.stderr || result.stdout || "",
        error: "Failed to check balance",
      };
    } catch (e) {
      return {
        success: false,
        output: "",
        error: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/**
 * check_cluster — Get the current Solana cluster configuration.
 */
export const checkClusterTool: AgentTool = {
  name: "check_cluster",
  description:
    "Get the current Solana CLI cluster configuration (RPC URL, WebSocket URL, Keypair path).",

  definition: {
    name: "check_cluster",
    description: "Get the current Solana cluster configuration.",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  async execute(): Promise<ToolResult> {
    try {
      const result = spawnSync("solana", ["config", "get"], {
        encoding: "utf8",
        timeout: 5000,
      });

      if (result.status === 0 && result.stdout) {
        return {
          success: true,
          output: result.stdout.trim(),
        };
      }

      return {
        success: false,
        output: result.stderr || "",
        error: "Failed to get cluster config",
      };
    } catch (e) {
      return {
        success: false,
        output: "",
        error: `Error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
