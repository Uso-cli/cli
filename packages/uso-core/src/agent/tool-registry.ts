import type { AgentState } from "./state";
import type { ToolDefinition } from "./llm-types";

// ─── Tool Result ───────────────────────────────────────────────────
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: Record<string, unknown>;
}

// ─── Agent Tool Interface ──────────────────────────────────────────
export interface AgentTool {
  /** Unique tool name (used by the LLM to invoke it) */
  name: string;

  /** Human-readable description (shown to the LLM in system prompt) */
  description: string;

  /** JSON schema for parameters */
  definition: ToolDefinition;

  /** Execute the tool with given params and current agent state */
  execute(
    params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult>;
}

// ─── Tool Registry ─────────────────────────────────────────────────
/**
 * MCP-inspired tool registry. The brain queries this to know
 * what tools exist. Tools self-register their schemas.
 */
export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  /** Register a tool */
  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name */
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /** Get all tool definitions (for sending to the LLM) */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** Get all tool names */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Execute a tool by name */
  async execute(
    name: string,
    params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: "",
        error: `Unknown tool: "${name}". Available tools: ${this.getNames().join(", ")}`,
      };
    }

    try {
      return await tool.execute(params, state);
    } catch (err) {
      return {
        success: false,
        output: "",
        error: `Tool "${name}" threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** Get a formatted summary of all tools for the system prompt */
  getToolSummary(): string {
    const tools = Array.from(this.tools.values());
    return tools
      .map((t) => {
        const params = Object.entries(t.definition.parameters.properties)
          .map(
            ([k, v]) =>
              `    - ${k} (${v.type}): ${v.description}${v.default !== undefined ? ` [default: ${String(v.default)}]` : ""}`,
          )
          .join("\n");
        const required = t.definition.parameters.required?.join(", ") ?? "none";
        return `• ${t.name}: ${t.description}\n  Required params: ${required}\n${params}`;
      })
      .join("\n\n");
  }
}
