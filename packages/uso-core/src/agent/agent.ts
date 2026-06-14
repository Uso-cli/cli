import { createInitialState, setEnvironment } from "./state";
import type { AgentState } from "./state";
import type { AgentConfig } from "./agent-config";
import { loadAgentConfig } from "./agent-config";
import { LlmRouter } from "./llm-router";
import { AgentBrain } from "./brain";
import { AgentFSM } from "./fsm";
import type { FsmCallbacks } from "./fsm";
import { ToolRegistry } from "./tool-registry";
import { runTerminalCommandTool } from "./tools/terminal";
import {
  checkEnvironmentTool,
  checkWalletBalanceTool,
  checkClusterTool,
} from "./tools/environment";
import {
  readFileTool,
  writeFileTool,
  listDirectoryTool,
} from "./tools/filesystem";
import {
  anchorBuildTool,
  anchorTestTool,
  anchorDeployTool,
  solanaAirdropTool,
} from "./tools/solana";
import { discoverRuntime } from "../runtime/discovery";
import { fingerprintToolchain } from "../runtime/toolchain";

// ─── Agent Options ─────────────────────────────────────────────────
export interface AgentRunOptions {
  /** The goal to accomplish */
  goal: string;

  /** Override the LLM provider (e.g., "ollama", "gemini", "openai", "github") */
  provider?: string;

  /** Override the model name */
  model?: string;

  /** Maximum ReAct loop iterations (default: from config, fallback: 3) */
  maxIterations?: number;

  /** If true, show verbose reasoning traces */
  verbose?: boolean;

  /** Callbacks for the FSM lifecycle (used by CLI for rendering) */
  callbacks?: FsmCallbacks;
}

// ─── Agent Result ──────────────────────────────────────────────────
export interface AgentResult {
  success: boolean;
  summary: string;
  state: AgentState;
  llmProvider: string;
  totalIterations: number;
  durationMs: number;
}

/**
 * UsoAgent — The public API for the USO AI Agent.
 *
 * Usage:
 * ```typescript
 * const agent = new UsoAgent();
 * const result = await agent.run({ goal: "Deploy my staking program" });
 * ```
 */
export class UsoAgent {
  private config: AgentConfig;

  constructor(config?: AgentConfig) {
    this.config = config ?? loadAgentConfig();
  }

  /**
   * Run the agent to accomplish a goal.
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    const startMs = Date.now();

    // 1. Resolve LLM
    const router = new LlmRouter(this.config);
    const llm = await router.resolve(options.provider);

    // 2. Build tool registry
    const tools = this.buildToolRegistry();

    // 3. Initialize state
    const maxIterations =
      options.maxIterations ??
      this.config.agent?.maxIterations ??
      3;

    let state = createInitialState(options.goal, maxIterations);

    // 4. Discover runtime environment
    const runtime = discoverRuntime({
      projectRoot: process.cwd(),
      runtime: { preferWsl: false },
      healing: { enabled: true, maxAttempts: 2, backoffMs: 250 },
    });
    const toolchain = fingerprintToolchain(true);

    state = setEnvironment(state, {
      os: runtime.os,
      route: runtime.route,
      toolchain,
    });

    // 5. Build brain + FSM
    const brain = new AgentBrain(llm, tools);
    const fsm = new AgentFSM(brain, options.callbacks);

    // 6. Run the FSM
    const finalState = await fsm.run(state);

    // 7. Build result
    const durationMs = Date.now() - startMs;
    const success = finalState.currentPhase === "complete";
    const lastComplete = finalState.history
      .filter((h) => h.role === "system")
      .pop();

    return {
      success,
      summary: success
        ? lastComplete?.content ?? "Task completed successfully."
        : finalState.errors[finalState.errors.length - 1]?.message ??
          "Task failed.",
      state: finalState,
      llmProvider: llm.name,
      totalIterations: finalState.iterationCount,
      durationMs,
    };
  }

  /**
   * Diagnose available LLM providers (for `uso doctor`).
   */
  async diagnoseLlm(): Promise<
    Array<{ name: string; provider: string; available: boolean }>
  > {
    const router = new LlmRouter(this.config);
    return router.diagnose();
  }

  /**
   * Build the tool registry with all built-in tools.
   */
  private buildToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();

    // Core tools
    registry.register(runTerminalCommandTool);
    registry.register(checkEnvironmentTool);
    registry.register(checkWalletBalanceTool);
    registry.register(checkClusterTool);

    // Filesystem tools
    registry.register(readFileTool);
    registry.register(writeFileTool);
    registry.register(listDirectoryTool);

    // Solana tools
    registry.register(anchorBuildTool);
    registry.register(anchorTestTool);
    registry.register(anchorDeployTool);
    registry.register(solanaAirdropTool);

    return registry;
  }
}
