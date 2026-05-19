// ============================================================
// Execution logger — structured log with replay support
// ============================================================

import type { LogEntry, EngineEventHandlers } from "./types";
import { EngineState, ActionState } from "./types";

// ============================================================
// Logger
// ============================================================

export class ExecutionLogger {
  private entries: LogEntry[] = [];
  private seq: number = 0;
  private listeners: Array<(entry: LogEntry) => void> = [];
  private persistKey: string | null = null;

  constructor(persistKey?: string) {
    if (persistKey) {
      this.persistKey = `engine_log_${persistKey}`;
    }
  }

  // ==========================================================
  // Logging
  // ==========================================================

  logEngine(
    from: EngineState,
    to: EngineState,
    message: string,
    durationMs?: number
  ): LogEntry {
    return this.write({
      fromEngineState: from,
      toEngineState: to,
      actionId: null,
      fromActionState: null,
      toActionState: null,
      message,
      durationMs,
    });
  }

  logAction(
    actionId: string,
    fromAction: ActionState,
    toAction: ActionState,
    engineState: EngineState,
    message: string,
    error?: string,
    durationMs?: number
  ): LogEntry {
    return this.write({
      fromEngineState: engineState,
      toEngineState: engineState,
      actionId,
      fromActionState: fromAction,
      toActionState: toAction,
      message,
      error,
      durationMs,
    });
  }

  /** Returns all log entries (for replay/inspection) */
  getAll(): ReadonlyArray<LogEntry> {
    return this.entries;
  }

  /** Get entries for a specific action */
  getByAction(actionId: string): LogEntry[] {
    return this.entries.filter((e) => e.actionId === actionId);
  }

  /** Get entries in a time window */
  getByTimeRange(from: string, to: string): LogEntry[] {
    return this.entries.filter((e) => e.timestamp >= from && e.timestamp <= to);
  }

  /** Get failed actions from log */
  getFailures(): LogEntry[] {
    return this.entries.filter((e) => e.toActionState === ActionState.FAILED);
  }

  /** Subscribe to new entries */
  onEntry(listener: (entry: LogEntry) => void): void {
    this.listeners.push(listener);
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
    this.seq = 0;
    this.persist();
  }

  /** Replay log for analysis */
  replay(): ReadonlyArray<LogEntry> {
    return this.entries.map((e) => ({ ...e }));
  }

  // ==========================================================
  // Persistence
  // ==========================================================

  /** Persist current entries to chrome.storage */
  private persist(): void {
    if (!this.persistKey) return;
    try {
      chrome.storage?.local?.set?.({ [this.persistKey]: this.entries });
    } catch {
      // Not in extension context — ignore
    }
  }

  /** Load entries from chrome.storage */
  async load(): Promise<void> {
    if (!this.persistKey) return;
    try {
      const result = await chrome.storage?.local?.get?.(this.persistKey);
      if (result?.[this.persistKey]) {
        this.entries = result[this.persistKey] as LogEntry[];
        this.seq = this.entries.length;
      }
    } catch {
      // Not in extension context — ignore
    }
  }

  // ==========================================================
  // Internal
  // ==========================================================

  private write(partial: Omit<LogEntry, "seq" | "timestamp">): LogEntry {
    const entry: LogEntry = {
      seq: this.seq++,
      timestamp: new Date().toISOString(),
      ...partial,
    };
    this.entries.push(entry);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Don't let one listener break logging
      }
    }

    // Persist (debounce would be nice, but keep simple for now)
    this.persist();

    return entry;
  }
}
