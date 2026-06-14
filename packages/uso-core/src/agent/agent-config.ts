import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import os from "node:os";

// ─── Agent Configuration ───────────────────────────────────────────
export interface AgentConfig {
  ollama?: {
    baseUrl?: string;
    model?: string;
  };
  gemini?: {
    apiKey?: string;
    model?: string;
  };
  openai?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  github?: {
    token?: string;
    model?: string;
    baseUrl?: string;
  };
  agent?: {
    maxIterations?: number;
    confirmDestructive?: boolean;
    verbose?: boolean;
    preferredProvider?: string;
  };
}

const DEFAULT_CONFIG: AgentConfig = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "llama3.1:8b",
  },
  github: {
    baseUrl: "https://models.inference.ai.azure.com",
    model: "openai/gpt-4o-mini",
  },
  gemini: {
    model: "gemini-2.0-flash",
  },
  openai: {
    model: "gpt-4o-mini",
  },
  agent: {
    maxIterations: 3,
    confirmDestructive: true,
    verbose: false,
  },
};

/**
 * Get the config file path: ~/.uso-agent.json
 */
export function getConfigPath(): string {
  return join(os.homedir(), ".uso-agent.json");
}

/**
 * Load agent config from disk, merging with defaults.
 * Missing file = just use defaults.
 */
export function loadAgentConfig(): AgentConfig {
  const configPath = getConfigPath();

  try {
    const raw = readFileSync(configPath, "utf8");
    const userConfig = JSON.parse(raw) as Partial<AgentConfig>;
    return mergeConfig(userConfig);
  } catch {
    // File doesn't exist or is invalid — return defaults
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save agent config to disk.
 */
export function saveAgentConfig(config: AgentConfig): void {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });

  // Strip undefined values for cleaner JSON
  const clean = JSON.parse(JSON.stringify(config)) as AgentConfig;
  writeFileSync(configPath, JSON.stringify(clean, null, 2) + "\n", "utf8");
}

/**
 * Update specific fields in the config file.
 */
export function updateAgentConfig(
  updates: Partial<AgentConfig>,
): AgentConfig {
  const current = loadAgentConfig();
  const merged = mergeConfig({ ...current, ...updates });
  saveAgentConfig(merged);
  return merged;
}

/**
 * Set a specific API key
 */
export function setApiKey(
  provider: "gemini" | "openai" | "github",
  key: string,
): AgentConfig {
  const current = loadAgentConfig();

  if (provider === "gemini") {
    current.gemini = { ...current.gemini, apiKey: key };
  } else if (provider === "openai") {
    current.openai = { ...current.openai, apiKey: key };
  } else if (provider === "github") {
    current.github = { ...current.github, token: key };
  }

  saveAgentConfig(current);
  return current;
}

/**
 * Deep merge user config with defaults
 */
function mergeConfig(user: Partial<AgentConfig>): AgentConfig {
  return {
    ollama: { ...DEFAULT_CONFIG.ollama, ...user.ollama },
    gemini: { ...DEFAULT_CONFIG.gemini, ...user.gemini },
    openai: { ...DEFAULT_CONFIG.openai, ...user.openai },
    github: { ...DEFAULT_CONFIG.github, ...user.github },
    agent: { ...DEFAULT_CONFIG.agent, ...user.agent },
  };
}
