import type { HealingDecision } from "../types";

/**
 * Parse error patterns and decide on healing strategy
 * Returns: heuristic -> contextual -> escalation
 */
export function decideHealing(
  stderr: string,
  stdout: string,
  attempt: number,
  maxAttempts: number,
  baseBackoffMs: number,
): HealingDecision {
  if (attempt >= maxAttempts) {
    return {
      level: "escalation",
      decision: "escalate",
      shouldRetry: false,
      reason: "Retry limit reached.",
    };
  }

  const text = `${stderr}\n${stdout}`.toLowerCase();

  // ===== HEURISTIC LEVEL: Obvious manual intervention needed =====

  if (
    text.includes("anchor version not set") ||
    text.includes("anchor version")
  ) {
    return {
      level: "heuristic",
      decision: "stop",
      shouldRetry: false,
      appliedFix: "Run: avm use latest",
      reason: "Manual Anchor version activation required.",
    };
  }

  if (
    text.includes("no validator detected") ||
    text.includes("validator not running") ||
    text.includes("solana-test-validator")
  ) {
    return {
      level: "heuristic",
      decision: "stop",
      shouldRetry: false,
      appliedFix: "Run: uso val (or uso dev) to start validator",
      reason: "Validator must be started manually.",
    };
  }

  if (
    text.includes("insufficient funds") ||
    text.includes("insufficient balance")
  ) {
    return {
      level: "heuristic",
      decision: "stop",
      shouldRetry: false,
      appliedFix: "Run: solana airdrop 1",
      reason: "Insufficient SOL balance in wallet.",
    };
  }

  if (text.includes("permission denied") || text.includes("eacces")) {
    return {
      level: "heuristic",
      decision: "stop",
      shouldRetry: false,
      appliedFix: "Fix file permissions: sudo chown -R $USER ~/.cargo",
      reason: "File permission error encountered.",
    };
  }

  if (text.includes("cannot find") || text.includes("not found in path")) {
    return {
      level: "heuristic",
      decision: "stop",
      shouldRetry: false,
      appliedFix:
        "Ensure tool is installed and on PATH: which anchor && which solana",
      reason: "Required tool not found in PATH.",
    };
  }

  // ===== CONTEXTUAL LEVEL: Transient failures worth retrying =====

  if (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("timeout waiting")
  ) {
    return {
      level: "contextual",
      decision: "retry",
      shouldRetry: true,
      retryAfterMs: baseBackoffMs * attempt,
      appliedFix:
        "Retrying after timeout (possible network congestion or slow RPC).",
      reason: "Transient timeout detected.",
    };
  }

  if (
    text.includes("econnreset") ||
    text.includes("econnrefused") ||
    text.includes("connection refused") ||
    text.includes("connection reset")
  ) {
    return {
      level: "contextual",
      decision: "retry",
      shouldRetry: true,
      retryAfterMs: baseBackoffMs * (attempt * 1.5), // Exponential backoff
      appliedFix: "Retrying after transient connection failure.",
      reason: "Network connection reset, possibly transient.",
    };
  }

  if (
    text.includes("rpc request failed") ||
    text.includes("backend not ready") ||
    text.includes("enotfound")
  ) {
    return {
      level: "contextual",
      decision: "retry",
      shouldRetry: true,
      retryAfterMs: baseBackoffMs * 2,
      appliedFix: "Retrying RPC request.",
      reason: "Backend temporarily unavailable or DNS not resolved.",
    };
  }

  if (text.includes("network unreachable")) {
    return {
      level: "contextual",
      decision: "retry",
      shouldRetry: true,
      retryAfterMs: baseBackoffMs * 3,
      appliedFix: "Retrying after network issue.",
      reason: "Network unreachable (possibly temporary).",
    };
  }

  if (
    (text.includes("cargo") || text.includes("error")) &&
    (text.includes("could not compile") || text.includes("failed to compile"))
  ) {
    return {
      level: "contextual",
      decision: "retry",
      shouldRetry: true,
      retryAfterMs: baseBackoffMs * 2,
      appliedFix: "Attempting rebuild after cargo clean.",
      reason: "Cargo build failed, attempting clean rebuild.",
    };
  }

  // ===== ESCALATION LEVEL: Unknown or complex failures =====

  if (text.includes("panicked") || text.includes("panic")) {
    return {
      level: "escalation",
      decision: "escalate",
      shouldRetry: false,
      reason:
        "Rust panic detected. This is likely a bug in Anchor or program code. Consider filing an issue on GitHub.",
    };
  }

  if (text.includes("error[e") && text.match(/error\[e\d{4}\]/)) {
    // Anchor error code
    const errorCodeMatch = text.match(/error\[e(\d{4})\]/);
    const code = errorCodeMatch ? errorCodeMatch[1] : "????";
    return {
      level: "escalation",
      decision: "escalate",
      shouldRetry: false,
      reason: `Anchor error E${code} detected. Check Anchor documentation for E${code}.`,
    };
  }

  return {
    level: "escalation",
    decision: "escalate",
    shouldRetry: false,
    reason:
      "No automatic recovery strategy identified. Manual investigation required.",
  };
}
