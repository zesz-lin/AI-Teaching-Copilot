// ============================================================
// Action queue with dependency resolution
// ============================================================

import type { Action } from "../dsl/types";
import { ActionState } from "./types";

// ============================================================
// Queue entry
// ============================================================

export interface QueueEntry {
  action: Action;
  stepIndex: number;
  state: ActionState;
  /** IDs of actions this entry depends on */
  dependencies: string[];
  /** IDs of actions that depend on this entry */
  dependents: string[];
}

// ============================================================
// Action queue
// ============================================================

export class ActionQueue {
  private entries: QueueEntry[] = [];
  private cursor: number = 0;

  // ==========================================================
  // Loading
  // ==========================================================

  /** Load a plan's actions into the queue with dependency resolution */
  load(steps: Action[]): void {
    this.entries = steps.map((action, i) => ({
      action,
      stepIndex: i,
      state: ActionState.PENDING,
      dependencies: Array.from(new Set(action.meta?.dependsOn ?? [])),
      dependents: [],
    }));

    this.cursor = 0;
    this.resolveDependencies();
  }

  /** Build the reverse dependency graph */
  private resolveDependencies(): void {
    const idToIndex = new Map<string, number>();
    for (const entry of this.entries) {
      idToIndex.set(entry.action.id, entry.stepIndex);
    }

    for (const entry of this.entries) {
      for (const depId of entry.dependencies) {
        const depIndex = idToIndex.get(depId);
        if (depIndex !== undefined) {
          this.entries[depIndex].dependents.push(entry.action.id);
        }
      }
    }

    // Mark entries with unsatisfied dependencies as BLOCKED
    for (const entry of this.entries) {
      if (this.hasUnsatisfiedDeps(entry)) {
        entry.state = ActionState.BLOCKED;
      }
    }
  }

  // ==========================================================
  // Query
  // ==========================================================

  /** Get the next executable entry (PENDING, all deps satisfied) */
  next(): QueueEntry | null {
    while (this.cursor < this.entries.length) {
      const entry = this.entries[this.cursor];
      if (entry.state === ActionState.PENDING && !this.hasUnsatisfiedDeps(entry)) {
        return entry;
      }
      // Check if any earlier entries are blocked and can be unblocked
      if (entry.state === ActionState.BLOCKED && !this.hasUnsatisfiedDeps(entry)) {
        entry.state = ActionState.PENDING;
      }
      this.cursor++;
    }
    return null;
  }

  /** Get entry by action ID */
  get(actionId: string): QueueEntry | undefined {
    return this.entries.find((e) => e.action.id === actionId);
  }

  /** Current progress (0-1) */
  progress(): number {
    if (this.entries.length === 0) return 1;
    const done = this.entries.filter(
      (e) => e.state === ActionState.COMPLETED || e.state === ActionState.SKIPPED
    ).length;
    return done / this.entries.length;
  }

  /** Whether all entries are terminal */
  isDone(): boolean {
    return this.entries.every(
      (e) =>
        e.state === ActionState.COMPLETED ||
        e.state === ActionState.SKIPPED ||
        e.state === ActionState.ROLLED_BACK
    );
  }

  /** All entries */
  all(): ReadonlyArray<QueueEntry> {
    return this.entries;
  }

  /** Remaining non-terminal entries */
  remaining(): QueueEntry[] {
    return this.entries.filter(
      (e) =>
        e.state !== ActionState.COMPLETED &&
        e.state !== ActionState.SKIPPED &&
        e.state !== ActionState.ROLLED_BACK
    );
  }

  // ==========================================================
  // Mutate
  // ==========================================================

  /** Update the state of an entry */
  setState(actionId: string, state: ActionState): void {
    const entry = this.get(actionId);
    if (entry) entry.state = state;
  }

  /** Mark a dependency as complete and unblock dependents */
  markComplete(actionId: string): void {
    const entry = this.get(actionId);
    if (entry) entry.state = ActionState.COMPLETED;

    // Unblock any entries that depended on this one
    for (const e of this.entries) {
      if (e.state === ActionState.BLOCKED && !this.hasUnsatisfiedDeps(e)) {
        e.state = ActionState.PENDING;
      }
    }
  }

  /** Reset cursor to the beginning */
  resetCursor(): void {
    this.cursor = 0;
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
    this.cursor = 0;
  }

  // ==========================================================
  // Serialization
  // ==========================================================

  /** Compact snapshot for persistence */
  toJSON(): Array<{ actionId: string; state: ActionState; stepIndex: number }> {
    return this.entries.map((e) => ({
      actionId: e.action.id,
      state: e.state,
      stepIndex: e.stepIndex,
    }));
  }

  /** Restore state from a persisted snapshot */
  restoreFromJSON(
    snap: Array<{ actionId: string; state: ActionState; stepIndex: number }>,
    actions: Action[]
  ): void {
    // Build fresh queue from the plan's actions
    this.load(actions);

    // Then apply persisted state for each entry (override load's BLOCKED marks)
    for (const item of snap) {
      const entry = this.get(item.actionId);
      if (entry) {
        entry.state = item.state;
      }
    }
    this.cursor = 0;
  }

  // ==========================================================
  // Internal
  // ==========================================================

  private hasUnsatisfiedDeps(entry: QueueEntry): boolean {
    for (const depId of entry.dependencies) {
      const dep = this.get(depId);
      if (!dep) return true;
      if (
        dep.state !== ActionState.COMPLETED &&
        dep.state !== ActionState.SKIPPED &&
        dep.state !== ActionState.ROLLED_BACK
      ) {
        return true;
      }
    }
    return false;
  }
}
