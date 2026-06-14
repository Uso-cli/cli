import type { LlmAdapter, ChatMessage, LlmOptions } from "./llm-types";
import type { ToolRegistry } from "./tool-registry";
import type { AgentState } from "./state";
import {
  buildSystemPrompt,
  buildPlanningPrompt,
  buildObservationMessage,
  buildReflectionPrompt,
} from "./prompts";
import { appendHistory, appendError } from "./state";

// ─── Parsed Agent Action ───────────────────────────────────────────
export interface AgentAction {
  type: "tool_call" | "task_complete" | "task_failed";
  thought: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  summary?: string;
  reason?: string;
}

/**
 * Agent Brain — The ReAct (Reason + Act) reasoning engine.
 *
 * This is the core loop:
 *   1. Build context (system prompt + history)
 *   2. Send to LLM
 *   3. Parse the THOUGHT + ACTION from the response
 *   4. Execute the tool
 *   5. Append the observation to history
 *   6. Loop until TASK_COMPLETE, TASK_FAILED, or max iterations
 */
export class AgentBrain {
  constructor(
    private llm: LlmAdapter,
    private tools: ToolRegistry,
  ) {}

  /**
   * Run one reasoning step: LLM produces a thought + action.
   */
  async think(state: AgentState): Promise<{ action: AgentAction; state: AgentState }> {
    const messages = this.buildMessages(state);

    const options: LlmOptions = {
      temperature: 0.1,
      maxTokens: 2048,
    };

    // Try native function calling if the adapter supports it
    const toolDefs = [...this.tools.getDefinitions()];
    toolDefs.push(
      {
        name: "TASK_COMPLETE",
        description: "Mark the user's goal as complete.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Summary of what was accomplished." }
          },
          required: ["summary"],
        }
      },
      {
        name: "TASK_FAILED",
        description: "Mark the user's goal as failed due to inability to accomplish it.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Reason why the goal could not be completed." }
          },
          required: ["reason"],
        }
      }
    );

    if (
      this.llm.provider === "openai" ||
      this.llm.provider === "github" ||
      this.llm.provider === "gemini"
    ) {
      options.tools = toolDefs;
    }

    let response;
    try {
      response = await this.llm.chat(messages, options);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newState = appendError(state, {
        message: `LLM call failed: ${errorMsg}`,
        category: "LLM_ERROR",
      });
      return {
        action: {
          type: "task_failed",
          thought: `LLM call failed: ${errorMsg}`,
          reason: errorMsg,
        },
        state: newState,
      };
    }

    // Handle native function calling responses
    if (response.toolCalls && response.toolCalls.length > 0) {
      const tc = response.toolCalls[0]; // Process one tool call at a time
      const thought = response.content || `Calling ${tc.name}`;

      const newState = appendHistory(state, {
        role: "thought",
        content: thought,
      });

      if (tc.name === "TASK_COMPLETE") {
        return {
          action: {
            type: "task_complete",
            thought,
            summary: String(tc.arguments?.summary ?? ""),
          },
          state: newState,
        };
      }

      if (tc.name === "TASK_FAILED") {
        return {
          action: {
            type: "task_failed",
            thought,
            reason: String(tc.arguments?.reason ?? ""),
          },
          state: newState,
        };
      }

      return {
        action: {
          type: "tool_call",
          thought,
          toolName: tc.name,
          toolParams: tc.arguments,
        },
        state: newState,
      };
    }

    // Parse text-based THOUGHT + ACTION format (for Ollama and fallback)
    const action = this.parseTextResponse(response.content);
    const newState = appendHistory(state, {
      role: "thought",
      content: action.thought,
    });

    return { action, state: newState };
  }

  /**
   * Execute a tool call and return the observation.
   */
  async act(
    action: AgentAction,
    state: AgentState,
  ): Promise<{ observation: string; success: boolean; state: AgentState }> {
    if (!action.toolName) {
      return {
        observation: "No tool specified.",
        success: false,
        state,
      };
    }

    const result = await this.tools.execute(
      action.toolName,
      action.toolParams ?? {},
      state,
    );

    const observation = buildObservationMessage(
      action.toolName,
      result.success,
      result.output || result.error || "No output",
    );

    const newState = appendHistory(state, {
      role: "observation",
      content: observation,
      toolName: action.toolName,
      toolParams: action.toolParams,
    });

    return {
      observation,
      success: result.success,
      state: result.success
        ? newState
        : appendError(newState, {
            message: result.error ?? `Tool ${action.toolName} failed`,
            stepId: action.toolName,
          }),
    };
  }

  /**
   * Build the full message array for the LLM.
   */
  private buildMessages(state: AgentState): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // System prompt
    messages.push({
      role: "system",
      content: buildSystemPrompt(
        this.tools,
        state.environment.os,
        state.environment.route,
      ),
    });

    // User's goal
    messages.push({
      role: "user",
      content: buildPlanningPrompt(state.userGoal),
    });

    // History (thoughts, actions, observations)
    for (const entry of state.history) {
      if (entry.role === "thought") {
        messages.push({
          role: "assistant",
          content: entry.content,
        });
      } else if (entry.role === "observation") {
        messages.push({
          role: "user",
          content: entry.content,
        });
      } else if (entry.role === "error") {
        messages.push({
          role: "user",
          content: buildReflectionPrompt(
            entry.toolName ?? "unknown",
            entry.content,
            state.iterationCount,
          ),
        });
      } else if (entry.role === "system") {
        messages.push({
          role: "user",
          content: `[System] ${entry.content}`,
        });
      }
    }

    return messages;
  }

  /**
   * Parse the THOUGHT + ACTION text format from Ollama responses.
   */
  private parseTextResponse(text: string): AgentAction {
    const thoughtMatch = text.match(/THOUGHT:\s*([\s\S]*?)(?=ACTION:|$)/i);
    const actionMatch = text.match(/ACTION:\s*(\{[\s\S]*?\})\s*$/im);

    const thought = thoughtMatch
      ? thoughtMatch[1].trim()
      : text.split("\n")[0] || "Thinking...";

    if (!actionMatch) {
      // Try to find any JSON block in the response
      const jsonMatch = text.match(/\{[\s\S]*?"action"\s*:[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            action: string;
            params?: Record<string, unknown>;
          };
          return this.classifyAction(thought, parsed);
        } catch {
          // Fall through
        }
      }

      // No parseable action — treat as thinking aloud
      return {
        type: "task_failed",
        thought,
        reason: "Could not parse a valid action from the LLM response.",
      };
    }

    try {
      const parsed = JSON.parse(actionMatch[1]) as {
        action: string;
        params?: Record<string, unknown>;
      };
      return this.classifyAction(thought, parsed);
    } catch {
      return {
        type: "task_failed",
        thought,
        reason: `Invalid JSON in ACTION block: ${actionMatch[1]}`,
      };
    }
  }

  private classifyAction(
    thought: string,
    parsed: { action: string; params?: Record<string, unknown> },
  ): AgentAction {
    if (parsed.action === "TASK_COMPLETE") {
      return {
        type: "task_complete",
        thought,
        summary:
          String(parsed.params?.summary ?? "") || thought,
      };
    }

    if (parsed.action === "TASK_FAILED") {
      return {
        type: "task_failed",
        thought,
        reason:
          String(parsed.params?.reason ?? "") || thought,
      };
    }

    return {
      type: "tool_call",
      thought,
      toolName: parsed.action,
      toolParams: parsed.params ?? {},
    };
  }
}
