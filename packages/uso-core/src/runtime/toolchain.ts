import { spawnSync } from "node:child_process";
import type { ToolVersion } from "../types";

// Cache toolchain result (TTL: 1 minute)
let cachedToolchain: ToolVersion[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

const TOOL_PROBES: Array<{ command: string; args: string[]; timeout: number }> =
  [
    { command: "node", args: ["--version"], timeout: 3000 },
    { command: "rustc", args: ["--version"], timeout: 5000 },
    { command: "solana", args: ["--version"], timeout: 5000 },
    { command: "anchor", args: ["--version"], timeout: 5000 },
  ];

function parseVersion(raw: string): string | undefined {
  if (!raw) return undefined;
  // Extract first line and trim
  const firstLine = raw.split(/\r?\n/)[0]?.trim();
  if (!firstLine) return undefined;

  // Try to extract semantic version pattern (e.g., "v1.2.3" or "1.2.3")
  const match = firstLine.match(/(?:v)?(\d+\.\d+\.\d+(?:[.-].*)?)/);
  if (match) {
    return match[0];
  }

  return firstLine;
}

function probe(command: string, args: string[], timeout: number): ToolVersion {
  try {
    let executable = command;
    let spawnArgs = args;

    // Check for stealth mode
    const os = require("node:os");
    const fs = require("node:fs");
    const path = require("node:path");
    if (process.platform === "win32") {
      try {
        const configPath = path.join(os.homedir(), ".uso-config.json");
        if (fs.existsSync(configPath)) {
          const configJson = JSON.parse(fs.readFileSync(configPath, "utf8"));
          if (configJson.mode === "wsl") {
            executable = "wsl.exe";
            const envSetup = 'source $HOME/.cargo/env 2>/dev/null; export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"';
            spawnArgs = ["-d", "Ubuntu", "-e", "bash", "-c", `${envSetup} && ${command} ${args.join(" ")}`];
          }
        }
      } catch (e) {
        // ignore
      }
    }

    const result = spawnSync(executable, spawnArgs, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status === 0 && result.stdout) {
      const version = parseVersion(result.stdout);
      return {
        name: command,
        available: true,
        version,
        raw: result.stdout.trim(),
      };
    }

    // Check stderr for version info (some tools output to stderr)
    if (result.stderr && result.stderr.length < 500) {
      const version = parseVersion(result.stderr);
      if (version) {
        return {
          name: command,
          available: true,
          version,
          raw: result.stderr.trim(),
        };
      }
    }

    return {
      name: command,
      available: false,
      raw: (result.stderr || result.stdout || "").trim(),
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    return {
      name: command,
      available: false,
      raw: errorMsg,
    };
  }
}

export function fingerprintToolchain(skipCache = false): ToolVersion[] {
  // Check cache first
  if (!skipCache) {
    const now = Date.now();
    if (cachedToolchain && now - cacheTimestamp < CACHE_TTL_MS) {
      return cachedToolchain;
    }
  }

  const toolchain: ToolVersion[] = [];

  for (const tool of TOOL_PROBES) {
    const result = probe(tool.command, tool.args, tool.timeout);
    toolchain.push(result);
  }

  // Cache the result
  cachedToolchain = toolchain;
  cacheTimestamp = Date.now();

  return toolchain;
}

export function getToolVersion(toolName: string): ToolVersion | undefined {
  const toolchain = fingerprintToolchain();
  return toolchain.find((t) => t.name === toolName);
}

export function clearToolchainCache(): void {
  cachedToolchain = null;
  cacheTimestamp = 0;
}
