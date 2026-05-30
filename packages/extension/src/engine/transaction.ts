// ============================================================
// Transaction system — snapshot → execute → commit/rollback
// ============================================================

import type { Action, SliderParams, HighlightParams } from "../dsl/types";
import type { ActionSnapshot, InverseAction, ExecutionContext } from "./types";

// ============================================================
// Transaction result
// ============================================================

export interface TransactionResult {
  success: boolean;
  ctx: ExecutionContext;
  error?: Error;
  /** Labels created during this transaction (for inverse generation) */
  createdLabels: string[];
  /** Labels deleted during this transaction */
  deletedLabels: string[];
}

// ============================================================
// Action executor (pluggable — concrete impl hooks into bridge)
// ============================================================

export interface ActionExecutor {
  /** Execute a single action. Returns labels created/deleted. */
  execute(action: Action): Promise<{ createdLabels: string[]; deletedLabels: string[] }>;
  /** Snapshot current state of specified labels (empty = all) */
  snapshot(labels?: string[]): Promise<ActionSnapshot>;
  /** Restore a previous snapshot */
  restoreSnapshot(snapshot: ActionSnapshot): Promise<void>;
  /** Execute an inverse action (rollback) */
  executeInverse(inverse: InverseAction): Promise<void>;
}

// ============================================================
// Transaction manager
// ============================================================

export class TransactionManager {
  constructor(private executor: ActionExecutor) {}

  /**
   * Execute an action within a transaction:
   * 1. Capture pre-state snapshot
   * 2. Execute the action
   * 3. Generate inverse for rollback
   * 4. Return result
   */
  async execute(
    action: Action,
    stepIndex: number,
    retryCount: number
  ): Promise<TransactionResult> {
    const ctx: ExecutionContext = {
      action,
      stepIndex,
      snapshot: null,
      inverse: null,
      startedAt: Date.now(),
      retryCount,
    };

    try {
      // 1. Snapshot before execution
      ctx.snapshot = await this.executor.snapshot();

      // 2. Execute the action
      const { createdLabels, deletedLabels } = await this.executor.execute(action);

      // 3. Generate inverse
      ctx.inverse = this.generateInverse(action, ctx.snapshot, createdLabels, deletedLabels);

      return { success: true, ctx, createdLabels, deletedLabels };
    } catch (err) {
      // On failure, attempt automatic rollback
      if (ctx.inverse) {
        try {
          await this.rollback(ctx);
          ctx.inverse = null;
        } catch {
          // Rollback failed — inverse stays for manual recovery
        }
      }

      return {
        success: false,
        ctx,
        error: err instanceof Error ? err : new Error(String(err)),
        createdLabels: [],
        deletedLabels: [],
      };
    }
  }

  /**
   * Execute the inverse action to rollback a completed transaction.
   */
  async rollback(ctx: ExecutionContext): Promise<void> {
    if (ctx.inverse) {
      await this.executor.executeInverse(ctx.inverse);
    }
  }

  // ==========================================================
  // Inverse generation
  // ==========================================================

  private generateInverse(
    action: Action,
    snapshot: ActionSnapshot,
    createdLabels: string[],
    deletedLabels: string[]
  ): InverseAction {
    switch (action.type) {
      // ── Geometry: creations → DELETE inverse ──
      case "FUNCTION_PLOT":
      case "POINT":
      case "LINE":
      case "CIRCLE":
      case "POLYGON":
        return {
          type: "DELETE_OBJECT",
          labels: createdLabels,
        };

      // ── Geometry: destructive → RESTORE_SNAPSHOT inverse ──
      case "DELETE":
      case "CLEAR":
        return {
          type: "RESTORE_SNAPSHOT",
          snapshot,
        };

      // ── SLIDER: delete the slider ──
      case "SLIDER":
        return {
          type: "DELETE_OBJECT",
          labels: [(action.params as SliderParams).name],
        };

      // ── Teaching: UI operations ──
      case "EXPLAIN":
        return { type: "REMOVE_UI", uiIds: [`explain-${action.id}`] };

      case "HIGHLIGHT":
        return { type: "RESTORE_STYLE", styleRestore: { targets: (action.params as HighlightParams).targets } };

      case "FOCUS_VIEW":
        return { type: "RESET_VIEW" };

      case "ANIMATE_STEP":
        return { type: "NOOP" };

      case "PAUSE":
        return { type: "NOOP" };

      case "ASK_OBSERVATION":
        return { type: "REMOVE_UI", uiIds: [`ask-${action.id}`] };

      case "SHOW_RELATION":
        return { type: "REMOVE_UI", uiIds: [`relation-${action.id}`] };

      default:
        // Unknown type → best-effort restore from snapshot
        return { type: "RESTORE_SNAPSHOT", snapshot };
    }
  }
}
