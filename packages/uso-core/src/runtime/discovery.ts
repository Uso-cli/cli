import os from "node:os";
import { spawnSync } from "node:child_process";
import type { RuntimeDiscovery, UsoConfig } from "../types";

interface WslDetectionResult {
  available: boolean;
  version?: "WSL1" | "WSL2";
  defaultDistro?: string;
}

interface ShellDetectionResult {
  shell: "powershell" | "bash";
  path: string;
  version?: string;
}

// Cache for runtime discovery (TTL: 5 minutes)
let cachedRuntime: RuntimeDiscovery | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function platformToOs(p: NodeJS.Platform): RuntimeDiscovery["os"] {
  if (p === "win32") return "windows";
  if (p === "darwin") return "darwin";
  return "linux";
}

function detectWslVersion(): WslDetectionResult {
  if (process.platform !== "win32") {
    return { available: false };
  }

  try {
    // Check if wsl.exe exists
    const result = spawnSync("wsl.exe", ["--version"], {
      encoding: "utf8",
      timeout: 2000,
    });
    if (result.status === 0 && result.stdout) {
      const version = result.stdout.toLowerCase().includes("wsl version 2")
        ? "WSL2"
        : "WSL1";
      return { available: true, version };
    }
  } catch (e) {
    // wsl.exe not available
  }

  return { available: false };
}

function getDefaultDistro(wslStatus: WslDetectionResult): string | undefined {
  if (!wslStatus.available) return undefined;

  try {
    const result = spawnSync("wsl.exe", ["-l", "-q"], {
      encoding: "utf8",
      timeout: 3000,
    });
    if (result.status === 0 && result.stdout) {
      const lines = result.stdout
        .trim()
        .split(/\r?\n/)
        .filter((l) => l.length > 0);
      // First line is usually default or marked with *
      return lines[0]?.replace(/\*\s*/, "").trim();
    }
  } catch (e) {
    // wsl.exe failed
  }

  return "Ubuntu"; // fallback assumption
}

function detectShellPreference(): ShellDetectionResult {
  const os = platformToOs(process.platform);

  // Windows: prefer PowerShell, fallback to bash if in Git Bash/WSL
  if (os === "windows") {
    try {
      const pwshResult = spawnSync(
        "pwsh.exe",
        ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"],
        {
          encoding: "utf8",
          timeout: 2000,
        },
      );
      if (pwshResult.status === 0) {
        return {
          shell: "powershell",
          path: "pwsh.exe",
          version: pwshResult.stdout?.trim(),
        };
      }
    } catch (e) {
      // pwsh not available, try cmd.exe built-in powershell
    }

    return {
      shell: "powershell",
      path: "cmd.exe /c powershell.exe",
      version: undefined,
    };
  }

  // macOS/Linux: bash is standard
  return { shell: "bash", path: "/bin/bash", version: undefined };
}

export function discoverRuntime(config: UsoConfig): RuntimeDiscovery {
  // Check cache first
  const now = Date.now();
  if (cachedRuntime && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRuntime;
  }

  const osName = platformToOs(process.platform);
  const wslStatus = detectWslVersion();
  const shellPrefs = detectShellPreference();
  const defaultDistro = getDefaultDistro(wslStatus);

  // Check ~/.uso-config.json for Stealth Mode
  let stealthWsl = false;
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const configPath = path.join(os.homedir(), ".uso-config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      const configJson = JSON.parse(raw);
      if (configJson.mode === "wsl") {
        stealthWsl = true;
      }
    }
  } catch (e) {
    // Ignore config read errors
  }

  const preferWsl = stealthWsl || (config.runtime?.preferWsl ?? false);
  const route = preferWsl && wslStatus.available ? "wsl" : "native";
  const shell: "powershell" | "bash" =
    config.runtime?.shell ?? shellPrefs.shell;

  const result: RuntimeDiscovery = {
    os: osName,
    route,
    shell,
    wslAvailable: wslStatus.available,
  };

  // Cache the result
  cachedRuntime = result;
  cacheTimestamp = now;

  return result;
}
