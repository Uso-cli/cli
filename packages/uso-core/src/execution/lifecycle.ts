import type {
  IntentRequest,
  ExecutionPlan,
  AttemptRecord,
  HealingDecision,
} from "../types";

export type LifecycleEventType =
  | "intent-received"
  | "intent-routed"
  | "preconditions-checked"
  | "simulation-started"
  | "simulation-passed"
  | "execution-started"
  | "task-attempt"
  | "healing-applied"
  | "execution-complete"
  | "intent-success"
  | "intent-failed"
  | "intent-blocked";

export interface LifecycleEvent {
  type: LifecycleEventType;
  timestamp: string;
  intentId: string;
  phase: "init" | "plan" | "execute" | "heal" | "complete";
  data: Record<string, unknown>;
}

/**
 * Manages lifecycle event emission and tracking for intent execution
 */
export class LifecycleManager {
  private events: LifecycleEvent[] = [];
  private listeners: Map<
    LifecycleEventType,
    Set<(event: LifecycleEvent) => void>
  > = new Map();

  /**
   * Register a listener for a specific event type
   */
  on(
    eventType: LifecycleEventType,
    handler: (event: LifecycleEvent) => void,
  ): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
  }

  /**
   * Emit a lifecycle event
   */
  emit(
    type: LifecycleEventType,
    intentId: string,
    phase: LifecycleEvent["phase"],
    data: Record<string, unknown>,
  ): void {
    const event: LifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      intentId,
      phase,
      data,
    };

    this.events.push(event);

    // Notify listeners
    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.forEach((handler) => handler(event));
    }
  }

  /**
   * Get all recorded events
   */
  getEvents(): LifecycleEvent[] {
    return [...this.events];
  }

  /**
   * Clear all events and listeners
   */
  reset(): void {
    this.events = [];
    this.listeners.clear();
  }

  /**
   * Get events for a specific intent
   */
  getIntentEvents(intentId: string): LifecycleEvent[] {
    return this.events.filter((e) => e.intentId === intentId);
  }
}

/**
 * Helper to emit common lifecycle events
 */
export const createLifecycleHelpers = (manager: LifecycleManager) => ({
  emitIntentReceived: (intentId: string, request: IntentRequest) =>
    manager.emit("intent-received", intentId, "init", { request }),

  emitIntentRouted: (intentId: string, plan: ExecutionPlan) =>
    manager.emit("intent-routed", intentId, "plan", { plan }),

  emitPreconditionsChecked: (
    intentId: string,
    passed: boolean,
    failures?: string[],
  ) =>
    manager.emit("preconditions-checked", intentId, "plan", {
      passed,
      failures,
    }),

  emitSimulationStarted: (intentId: string, plan: ExecutionPlan) =>
    manager.emit("simulation-started", intentId, "plan", { plan }),

  emitSimulationPassed: (intentId: string) =>
    manager.emit("simulation-passed", intentId, "plan", {}),

  emitExecutionStarted: (intentId: string, plan: ExecutionPlan) =>
    manager.emit("execution-started", intentId, "execute", { plan }),

  emitTaskAttempt: (intentId: string, record: AttemptRecord) =>
    manager.emit("task-attempt", intentId, "execute", { record }),

  emitHealingApplied: (
    intentId: string,
    decision: HealingDecision,
    error: string,
  ) => manager.emit("healing-applied", intentId, "heal", { decision, error }),

  emitExecutionComplete: (intentId: string, success: boolean) =>
    manager.emit("execution-complete", intentId, "complete", { success }),

  emitIntentSuccess: (intentId: string, result: unknown) =>
    manager.emit("intent-success", intentId, "complete", { result }),

  emitIntentFailed: (intentId: string, error: unknown) =>
    manager.emit("intent-failed", intentId, "complete", { error }),

  emitIntentBlocked: (intentId: string, reason: string) =>
    manager.emit("intent-blocked", intentId, "complete", { reason }),
});
