import type { AgentState } from "./state";
import type { AgentBrain, AgentAction } from "./brain";
import {
  setPhase,
  incrementIteration,
  markComplete,
  markFailed,
  appendHistory,
  appendReflection,
} from "./state";

// ─── FSM Event Callbacks ──────────────────────────────────────────
export interface FsmCallbacks {
  onPhaseChange?: (phase: AgentState["currentPhase"], state: AgentState) => void;
  onThought?: (thought: string, state: AgentState) => void;
  onToolCall?: (toolName: string, params: Record<string, unknown>, state: AgentState) => void;
  onObservation?: (observation: string, success: boolean, state: AgentState) => void;
  onComplete?: (summary: string, state: AgentState) => void;
  onFailed?: (reason: string, state: AgentState) => void;
  onIteration?: (iteration: number, maxIterations: number, state: AgentState) => void;
}

/**
 * Agent FSM — The Cyclic Graph State Machine.
 *
 * This is the control loop that drives the agent through:
 *
 *   [INIT] → [PLANNING] → [EXECUTING] → [VALIDATING]
 *                                           │
 *                             ┌─────────────┤
 *                             │             │
 *                       [COMPLETE]    [HEALING]
 *                                       │
 *                                       └──→ [PLANNING] (re-plan)
 *                                       │
 *                                       └──→ [FAILED] (maxIterations)
 *
 * Each node is a pure function: (state) → state.
 * The FSM orchestrates transitions and enforces the iteration ceiling.
 */
export class AgentFSM {
  private callbacks: FsmCallbacks;

  constructor(
    private brain: AgentBrain,
    callbacks?: FsmCallbacks,
  ) {
    this.callbacks = callbacks ?? {};
  }

  /**
   * Run the full agent loop from init to completion/failure.
   */
  async run(initialState: AgentState): Promise<AgentState> {
    let state = setPhase(initialState, "planning");
    this.emit("onPhaseChange", "planning", state);

    // Main agent loop
    while (
      state.currentPhase !== "complete" &&
      state.currentPhase !== "failed"
    ) {
      // Guard: max iterations
      if (state.iterationCount >= state.maxIterations) {
        state = markFailed(
          state,
          `Maximum iterations (${state.maxIterations}) reached. ` +
            `The agent could not complete the goal within the allowed number of steps. ` +
            `Try increasing --max-loops or simplify the task.`,
        );
        this.emit("onFailed", state.errors[state.errors.length - 1]?.message ?? "Max iterations", state);
        break;
      }

      state = incrementIteration(state);
      this.emit("onIteration", state.iterationCount, state.maxIterations, state);

      // ─── THINK ─────────────────────────────────────────
      state = setPhase(state, "planning");
      const { action, state: thinkState } = await this.brain.think(state);
      state = thinkState;

      this.emit("onThought", action.thought, state);

      // ─── CLASSIFY ACTION ───────────────────────────────
      if (action.type === "task_complete") {
        state = markComplete(state);
        state = appendHistory(state, {
          role: "system",
          content: `Task completed: ${action.summary ?? "Done"}`,
        });
        this.emit("onComplete", action.summary ?? "Done", state);
        break;
      }

      if (action.type === "task_failed") {
        state = markFailed(state, action.reason ?? "Unknown failure");
        this.emit("onFailed", action.reason ?? "Unknown failure", state);
        break;
      }

      // ─── EXECUTE ───────────────────────────────────────
      state = setPhase(state, "executing");
      this.emit("onPhaseChange", "executing", state);
      this.emit("onToolCall", action.toolName ?? "unknown", action.toolParams ?? {}, state);

      const { observation, success, state: actState } = await this.brain.act(
        action,
        state,
      );
      state = actState;

      this.emit("onObservation", observation, success, state);

      // ─── VALIDATE ──────────────────────────────────────
      state = setPhase(state, "validating");
      this.emit("onPhaseChange", "validating", state);

      if (!success) {
        // ─── HEAL ──────────────────────────────────────
        state = setPhase(state, "healing");
        this.emit("onPhaseChange", "healing", state);

        state = appendReflection(state, {
          iterationIndex: state.iterationCount,
          thought: `Tool ${action.toolName} failed. Re-evaluating approach.`,
          decision: "re-plan",
          reason: observation.slice(0, 300),
        });

        // Inject the failure context so the LLM knows to try something different
        state = appendHistory(state, {
          role: "error",
          content: observation,
          toolName: action.toolName,
        });

        // Loop back to planning (the LLM sees the error in history)
        state = setPhase(state, "planning");
        this.emit("onPhaseChange", "planning", state);
      }
      // If success, the loop continues — the LLM sees the observation
      // and decides the next step (or TASK_COMPLETE)
    }

    return state;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private emit(event: keyof FsmCallbacks, ...args: any[]): void {
    const cb = this.callbacks[event];
    if (cb) {
      // @ts-expect-error — dynamic dispatch
      cb(...args);
    }
  }
}
