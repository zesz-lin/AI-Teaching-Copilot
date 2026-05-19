// ============================================================
// Rollback mechanism — execute inverses in reverse order
// ============================================================

import type { Action } from "../dsl/types";
import type { ExecutionContext, InverseAction } from "./types";
import { ActionState } from "./types";
import { toErrorMessage } from "../shared/utils";
import type { QueueEntry } from "./queue";

// ============================================================
// Rollback scope
// ============================================================

export type RollbackScope =
  | { type: "single"; actionId: string }
  | { type: "range"; fromStep: number; toStep: number }
  | { type: "all" };

// ============================================================
// Rollback result
// ============================================================

export interface RollbackResult {
  /** Successfully rolled back actions */
  rolledBack: string[];
  /** Actions that could not be rolled back */
  failed: Array<{ actionId: string; error: string }>;
  /** Whether the rollback was complete */
  complete: boolean;
}

// ============================================================
// Rollback executor
// ============================================================

export interface InverseExecutor {
  executeInverse(inverse: InverseAction): Promise<void>;
}

export class RollbackManager {
  /** Completed execution contexts, in execution order */
  private completed: ExecutionContext[] = [];

  constructor(private executor: InverseExecutor) {}

  /** Record a completed context for potential rollback */
  record(ctx: ExecutionContext): void {
    this.completed.push(ctx);
  }

  /**
   * Rollback a scope of actions.
   * Executes inverses in reverse execution order.
   */
  async execute(
    scope: RollbackScope,
    queueEntries: QueueEntry[]
  ): Promise<RollbackResult> {
    // Determine which contexts to rollback (reverse order)
    const targets = this.selectTargets(scope, queueEntries);

    const result: RollbackResult = { rolledBack: [], failed: [], complete: true };

    for (const ctx of targets) {
      if (!ctx.inverse) {
        // No inverse available — can't rollback this one, but continue
        result.complete = false;
        continue;
      }

      try {
        await this.executor.executeInverse(ctx.inverse);
        ctx.inverse = null; // consumed
        result.rolledBack.push(ctx.action.id);

        // Update queue entry state
        const entry = queueEntries.find((e) => e.action.id === ctx.action.id);
        if (entry) entry.state = ActionState.ROLLED_BACK;
      } catch (err) {
        result.failed.push({
          actionId: ctx.action.id,
          error: toErrorMessage(err),
        });
        result.complete = false;
      }
    }

    // Remove rolled-back entries from completed list
    this.completed = this.completed.filter(
      (ctx) => !result.rolledBack.includes(ctx.action.id)
    );

    return result;
  }

  /** Clear all recorded contexts */
  clear(): void {
    this.completed = [];
  }

  /** Get all completed contexts (for undo stack) */
  getCompleted(): ReadonlyArray<ExecutionContext> {
    return this.completed;
  }

  /** Number of undoable actions */
  get undoDepth(): number {
    return this.completed.filter((c) => c.inverse !== null).length;
  }

  // ==========================================================
  // Internal
  // ==========================================================

  private selectTargets(
    scope: RollbackScope,
    queueEntries: QueueEntry[]
  ): ExecutionContext[] {
    switch (scope.type) {
      case "single": {
        const ctx = this.completed.find((c) => c.action.id === scope.actionId);
        return ctx ? [ctx] : [];
      }

      case "range": {
        return this.completed
          .filter((c) => c.stepIndex >= scope.fromStep && c.stepIndex <= scope.toStep)
          .reverse();
      }

      case "all":
        return [...this.completed].reverse();
    }
  }
}
