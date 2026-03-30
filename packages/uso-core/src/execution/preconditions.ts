import { spawnSync } from "node:child_process";
import type { ExecutionPlan } from "../types";

export interface PreconditionCheckResult {
  name: string;
  satisfied: boolean;
  message: string;
  remedy?: string;
}

/**
 * Validate wallet-funded precondition
 * Checks: solana balance >= some minimum (e.g., 0.1 SOL)
 */
function checkWalletFunded(): PreconditionCheckResult {
  const minBalanceSol = 0.1;

  try {
    const result = spawnSync("solana", ["balance"], {
      encoding: "utf8",
      timeout: 5000,
    });

    if (result.status !== 0) {
      return {
        name: "wallet-funded",
        satisfied: false,
        message:
          "Failed to check wallet balance (solana CLI may not be configured)",
        remedy: "Run: solana config set --url devnet && solana airdrop 1",
      };
    }

    const output = result.stdout || "";
    const match = output.match(/(\d+\.?\d*)\s+SOL/);
    if (!match) {
      return {
        name: "wallet-funded",
        satisfied: false,
        message: "Could not parse wallet balance",
        remedy: "Check solana configuration: solana config get",
      };
    }

    const balance = parseFloat(match[1]);
    if (balance < minBalanceSol) {
      return {
        name: "wallet-funded",
        satisfied: false,
        message: `Wallet balance (${balance} SOL) is below minimum (${minBalanceSol} SOL)`,
        remedy: "Run: solana airdrop 1",
      };
    }

    return {
      name: "wallet-funded",
      satisfied: true,
      message: `Wallet funded: ${balance} SOL available`,
    };
  } catch (e) {
    return {
      name: "wallet-funded",
      satisfied: false,
      message: `Error checking wallet: ${e instanceof Error ? e.message : "Unknown error"}`,
      remedy: "Ensure Solana CLI is installed and configured",
    };
  }
}

/**
 * Validate cluster-selected precondition
 * Checks: solana config get shows valid cluster (devnet/testnet/mainnet-beta)
 */
function checkClusterSelected(): PreconditionCheckResult {
  const validClusters = ["devnet", "testnet", "mainnet-beta", "localnet"];

  try {
    const result = spawnSync("solana", ["config", "get"], {
      encoding: "utf8",
      timeout: 5000,
    });

    if (result.status !== 0) {
      return {
        name: "cluster-selected",
        satisfied: false,
        message: "Failed to check solana cluster configuration",
        remedy: "Run: solana config set --url devnet",
      };
    }

    const output = result.stdout || "";
    const match = output.match(/RPC URL:\s*([^\n]+)/);
    if (!match) {
      return {
        name: "cluster-selected",
        satisfied: false,
        message: "Could not parse RPC URL from solana config",
        remedy: "Run: solana config set --url devnet",
      };
    }

    const rpcUrl = match[1].trim();
    const isValid =
      validClusters.some((c) => rpcUrl.includes(c)) || rpcUrl.includes("http");

    if (!isValid) {
      return {
        name: "cluster-selected",
        satisfied: false,
        message: `Invalid or unknown cluster in RPC URL: ${rpcUrl}`,
        remedy: "Run: solana config set --url <devnet|testnet|mainnet-beta>",
      };
    }

    const clusterName = validClusters.find((c) => rpcUrl.includes(c)) || rpcUrl;
    return {
      name: "cluster-selected",
      satisfied: true,
      message: `Cluster configured: ${clusterName}`,
    };
  } catch (e) {
    return {
      name: "cluster-selected",
      satisfied: false,
      message: `Error checking cluster: ${e instanceof Error ? e.message : "Unknown error"}`,
      remedy: "Ensure Solana CLI is installed and configured",
    };
  }
}

/**
 * Validate repo-clean precondition
 * Checks: no uncommitted changes in git repo
 */
function checkRepoClean(): PreconditionCheckResult {
  try {
    const result = spawnSync("git", ["status", "--short"], {
      encoding: "utf8",
      timeout: 3000,
    });

    if (result.status !== 0) {
      return {
        name: "repo-clean",
        satisfied: false,
        message: "Not in a git repository or git command failed",
        remedy: "Initialize git repository (git init) or commit changes",
      };
    }

    const output = result.stdout || "";
    const hasChanges = output.trim().length > 0;

    if (hasChanges) {
      return {
        name: "repo-clean",
        satisfied: false,
        message: `Repository has uncommitted changes (${output.trim().split(/\r?\n/).length} files)`,
        remedy: "Commit or stash changes: git add . && git commit -m '...'",
      };
    }

    return {
      name: "repo-clean",
      satisfied: true,
      message: "Repository is clean (no uncommitted changes)",
    };
  } catch (e) {
    return {
      name: "repo-clean",
      satisfied: false,
      message: `Error checking repo status: ${e instanceof Error ? e.message : "Unknown error"}`,
      remedy: "Ensure git is installed",
    };
  }
}

/**
 * The main precondition validator
 * Checks all required preconditions for a plan and returns results
 */
export async function validatePreconditions(
  plan: ExecutionPlan,
): Promise<PreconditionCheckResult[]> {
  const results: PreconditionCheckResult[] = [];

  for (const precondition of plan.preconditions) {
    if (precondition === "wallet-funded") {
      results.push(checkWalletFunded());
    } else if (precondition === "cluster-selected") {
      results.push(checkClusterSelected());
    } else if (precondition === "repo-clean") {
      results.push(checkRepoClean());
    }
  }

  return results;
}

/**
 * Check if all preconditions are satisfied
 */
export function allPreconditionsSatisfied(
  results: PreconditionCheckResult[],
): boolean {
  return results.every((r) => r.satisfied);
}
