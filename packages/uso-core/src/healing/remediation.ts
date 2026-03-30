import type { CheckResult } from "../types";

const REMEDIATION_MAP: Record<string, string> = {
  node: "Install Node.js from https://nodejs.org/ or run: nvm install node",
  rustc: `Install Rust from https://www.rust-lang.org/tools/install or run:
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`,
  solana: `Install Solana CLI from https://docs.solana.com/cli/install-solana-cli-tools
  Windows: usar init (will auto-install)
  macOS/Linux: sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`,
  anchor: `Install Anchor from https://www.anchor-lang.com/docs/installation
  $ cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  $ avm install latest
  $ avm use latest`,
};

export function getRemediationHint(
  toolName: string,
  os: "windows" | "linux" | "darwin",
): string | undefined {
  if (REMEDIATION_MAP[toolName]) {
    return REMEDIATION_MAP[toolName];
  }

  return undefined;
}

export function addRemediationToCheck(
  check: CheckResult,
  os: "windows" | "linux" | "darwin",
): CheckResult {
  if (check.status === "fail" || check.status === "warn") {
    const toolName = check.id.replace("tool-", "");
    const hint = getRemediationHint(toolName, os);
    if (hint) {
      return { ...check, remediation: hint };
    }
  }

  return check;
}
