import { randomUUID } from "node:crypto";
import type { RuntimeRoute, ToolVersion } from "../types";

// ─── Agent Phase FSM ───────────────────────────────────────────────
export type AgentPhase =
  | "init"
  | "planning"
  | "executing"
  | "validating"
  | "healing"
  | "complete"
  | "failed";

// ─── Step + History types ──────────────────────────────────────────
export interface AgentStep {
  id: string;
  description: string;
  toolName: string;
  toolParams: Record<string, unknown>;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  result?: string;
  error?: string;
}

export interface AgentHistoryEntry {
  timestamp: string;
  role: "thought" | "action" | "observation" | "error" | "system";
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
}

export interface AgentError {
  timestamp: string;
  stepId?: string;
  message: string;
  stderr?: string;
  category?: string;
}

export interface AgentReflection {
  timestamp: string;
  iterationIndex: number;
  thought: string;
  decision: "retry" | "re-plan" | "escalate" | "abort";
  reason: string;
}

// ─── The Global Agent State ────────────────────────────────────────
export interface AgentState {
  sessionId: string;
  userGoal: string;
  currentPhase: AgentPhase;
  environment: {
    os: "windows" | "linux" | "darwin";
    route: RuntimeRoute;
    toolchain: ToolVersion[];
  };
  executionPlan: AgentStep[];
  currentStepIndex: number;
  history: AgentHistoryEntry[];
  errors: AgentError[];
  reflections: AgentReflection[];
  iterationCount: number;
  maxIterations: number;
  startedAt: string;
  completedAt?: string;
}

// ─── State Factory ─────────────────────────────────────────────────
export function createInitialState(
  userGoal: string,
  maxIterations: number = 3,
): AgentState {
  return {
    sessionId: randomUUID(),
    userGoal,
    currentPhase: "init",
    environment: {
      os:
        process.platform === "win32"
          ? "windows"
          : process.platform === "darwin"
            ? "darwin"
            : "linux",
      route: "native",
      toolchain: [],
    },
    executionPlan: [],
    currentStepIndex: 0,
    history: [],
    errors: [],
    reflections: [],
    iterationCount: 0,
    maxIterations,
    startedAt: new Date().toISOString(),
  };
}

// ─── Immutable State Reducers ──────────────────────────────────────
// Every reducer returns a NEW state object. Never mutate in place.

export function setPhase(state: AgentState, phase: AgentPhase): AgentState {
  return { ...state, currentPhase: phase };
}

export function setEnvironment(
  state: AgentState,
  env: AgentState["environment"],
): AgentState {
  return { ...state, environment: env };
}

export function setPlan(
  state: AgentState,
  plan: AgentStep[],
): AgentState {
  return {
    ...state,
    executionPlan: plan,
    currentStepIndex: 0,
  };
}

export function advanceStep(state: AgentState): AgentState {
  return { ...state, currentStepIndex: state.currentStepIndex + 1 };
}

export function updateStepStatus(
  state: AgentState,
  stepId: string,
  status: AgentStep["status"],
  result?: string,
  error?: string,
): AgentState {
  return {
    ...state,
    executionPlan: state.executionPlan.map((s) =>
      s.id === stepId ? { ...s, status, result, error } : s,
    ),
  };
}

export function appendHistory(
  state: AgentState,
  entry: Omit<AgentHistoryEntry, "timestamp">,
): AgentState {
  return {
    ...state,
    history: [
      ...state.history,
      { ...entry, timestamp: new Date().toISOString() },
    ],
  };
}

export function appendError(
  state: AgentState,
  error: Omit<AgentError, "timestamp">,
): AgentState {
  return {
    ...state,
    errors: [
      ...state.errors,
      { ...error, timestamp: new Date().toISOString() },
    ],
  };
}

export function appendReflection(
  state: AgentState,
  reflection: Omit<AgentReflection, "timestamp">,
): AgentState {
  return {
    ...state,
    reflections: [
      ...state.reflections,
      { ...reflection, timestamp: new Date().toISOString() },
    ],
  };
}

export function incrementIteration(state: AgentState): AgentState {
  return { ...state, iterationCount: state.iterationCount + 1 };
}

export function markComplete(state: AgentState): AgentState {
  return {
    ...state,
    currentPhase: "complete",
    completedAt: new Date().toISOString(),
  };
}

export function markFailed(
  state: AgentState,
  reason: string,
): AgentState {
  return {
    ...state,
    currentPhase: "failed",
    completedAt: new Date().toISOString(),
    errors: [
      ...state.errors,
      {
        timestamp: new Date().toISOString(),
        message: reason,
        category: "AGENT_FAILED",
      },
    ],
  };
}
