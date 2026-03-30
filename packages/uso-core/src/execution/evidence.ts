import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionResult, AttemptRecord } from "../types";
import type { LifecycleEvent } from "./lifecycle";

/**
 * Represents collected evidence from execution
 */
export interface EvidenceRecord {
  intentId: string;
  timestamp: string;
  intent: string;
  status: "success" | "failed" | "blocked";
  route: string;
  tasksAttempted: number;
  tasksSucceeded: number;
  attempts: AttemptRecord[];
  events: Array<LifecycleEvent | string>;
  duration_ms: number;
}

/**
 * Manages evidence collection and persistence
 */
export class EvidenceCollector {
  private records: EvidenceRecord[] = [];

  /**
   * Record an execution result as evidence
   */
  record(
    result: ExecutionResult,
    events: Array<LifecycleEvent | string>,
    durationMs: number,
  ): EvidenceRecord {
    const tasksSucceeded = result.attempts.filter(
      (a) => a.status === "success",
    ).length;

    const evidence: EvidenceRecord = {
      intentId: result.intentId,
      timestamp: new Date().toISOString(),
      intent: result.plan.intentKind,
      status: result.status,
      route: result.route,
      tasksAttempted: result.attempts.length,
      tasksSucceeded,
      attempts: result.attempts,
      events,
      duration_ms: durationMs,
    };

    this.records.push(evidence);
    return evidence;
  }

  /**
   * Get all recorded evidence
   */
  getRecords(): EvidenceRecord[] {
    return [...this.records];
  }

  /**
   * Clear all evidence
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Persist evidence to disk
   */
  persistToDisk(projectRoot: string, evidence: EvidenceRecord): string {
    const evidenceDir = join(projectRoot, ".uso", "evidence");

    // Create directory if it doesn't exist
    mkdirSync(evidenceDir, { recursive: true });

    // Generate filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -1);
    const filename = `${timestamp}-${evidence.intentId.slice(0, 8)}.json`;
    const filepath = join(evidenceDir, filename);

    // Write evidence to file
    writeFileSync(filepath, JSON.stringify(evidence, null, 2));

    return filepath;
  }

  /**
   * Generate a summary from evidence
   */
  summarize(evidence: EvidenceRecord): string {
    const successRate =
      evidence.tasksAttempted > 0
        ? Math.round((evidence.tasksSucceeded / evidence.tasksAttempted) * 100)
        : 0;

    return `
=== Execution Evidence ===
Intent: ${evidence.intent}
Status: ${evidence.status.toUpperCase()}
Route: ${evidence.route}
Duration: ${evidence.duration_ms}ms
Tasks: ${evidence.tasksSucceeded}/${evidence.tasksAttempted} succeeded (${successRate}%)
Attempts: ${evidence.attempts.length}
Events: ${evidence.events.length}
    `.trim();
  }
}

/**
 * Helper to extract healing events from lifecycle events
 */
export function extractHealingHistory(events: LifecycleEvent[]): Array<{
  timestamp: string;
  error: string;
  decision: string;
  appliedFix?: string;
}> {
  return events
    .filter((e) => e.type === "healing-applied")
    .map((e) => {
      const decision = (e.data.decision ?? {}) as {
        level?: string;
        appliedFix?: string;
      };

      return {
        timestamp: e.timestamp,
        error: String(e.data.error || ""),
        decision: String(decision.level || "unknown"),
        appliedFix: String(decision.appliedFix || ""),
      };
    });
}

/**
 * Helper to extract task execution history
 */
export function extractTaskHistory(attempts: AttemptRecord[]): Array<{
  taskId: string;
  attempt: number;
  status: string;
  exitCode: number;
  command: string;
}> {
  return attempts.map((a) => ({
    taskId: a.taskId,
    attempt: a.attempt,
    status: a.status,
    exitCode: a.exitCode,
    command: a.command,
  }));
}
