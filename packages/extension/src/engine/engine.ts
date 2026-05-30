// ============================================================
// Execution Engine — main orchestrator
// ============================================================

import type { LessonPlan } from "../dsl/types";
import {
  EngineState,
  ActionState,
  DEFAULT_ENGINE_CONFIG,
  type EngineConfig,
  type EngineStatus,
  type EngineEventHandlers,
  type ExecutionContext,
  type InverseAction,
  type LogEntry,
} from "./types";
import {
  transitionEngine,
  transitionAction,
  isTerminal,
} from "./state-machine";
import { ActionQueue, type QueueEntry } from "./queue";
import {
  TransactionManager,
  type ActionExecutor,
  type TransactionResult,
} from "./transaction";
import { RollbackManager, type InverseExecutor } from "./rollback";
import { ExecutionLogger } from "./logger";

// ============================================================
// Serialized engine state (for SW restart persistence)
// ============================================================

export interface SerializedEngine {
  state: EngineState;
  plan: LessonPlan;
  queueSnapshot: ReturnType<ActionQueue["toJSON"]>;
  rollbackHistory: Array<{
    actionId: string;
    stepIndex: number;
    inverseType: string;
    labels: string[];
    startedAt: number;
    retryCount: number;
  }>;
  startedAt: number;
  pausedAt: number;
  serializedAt: number;
}

// ============================================================
// Execution Engine
// ============================================================

export class ExecutionEngine {
  // Subsystems
  private queue: ActionQueue;
  private transactions: TransactionManager;
  private rollbackMgr: RollbackManager;
  private logger: ExecutionLogger;

  // State
  private state: EngineState = EngineState.IDLE;
  private plan: LessonPlan | null = null;
  private config: EngineConfig;
  private handlers: EngineEventHandlers = {};

  // Timing
  private startedAt: number = 0;
  private pausedAt: number = 0;

  constructor(
    executor: ActionExecutor & InverseExecutor,
    config: Partial<EngineConfig> = {},
    persistKey?: string
  ) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.queue = new ActionQueue();
    this.transactions = new TransactionManager(executor);
    this.rollbackMgr = new RollbackManager(executor);
    this.logger = new ExecutionLogger(persistKey);
  }

  // ==========================================================
  // Public API — lifecycle
  // ==========================================================

  /** Load a lesson plan. Engine must be IDLE, ABORTED, or FAILED. */
  loadPlan(plan: LessonPlan): void {
    if (this.state !== EngineState.IDLE && !isTerminal(this.state)) {
      throw new Error(`Cannot load plan in state: ${this.state}`);
    }

    this.plan = plan;
    this.queue.clear();
    this.queue.load(plan.steps);
    this.rollbackMgr.clear();

    this.transitionTo(EngineState.READY);
    this.logger.logEngine(
      EngineState.IDLE,
      EngineState.READY,
      `Plan loaded: ${plan.planId} (${plan.steps.length} steps)`
    );
  }

  /** Start or resume execution. */
  start(): void {
    if (this.state !== EngineState.READY && this.state !== EngineState.PAUSED) {
      throw new Error(`Cannot start in state: ${this.state}`);
    }

    if (this.state === EngineState.READY) {
      this.startedAt = Date.now();
      this.logger.logEngine(
        this.state,
        EngineState.RUNNING,
        "Execution started"
      );
    } else {
      this.logger.logEngine(
        this.state,
        EngineState.RUNNING,
        "Execution resumed"
      );
      this.handlers.onResume?.();
    }

    this.transitionTo(EngineState.RUNNING);
  }

  /** Pause execution (user-requested). */
  pause(reason: string = "user"): void {
    if (this.state !== EngineState.RUNNING) return;

    this.pausedAt = Date.now();
    this.transitionTo(EngineState.PAUSED);
    this.logger.logEngine(
      EngineState.RUNNING,
      EngineState.PAUSED,
      `Paused: ${reason}`
    );
    this.handlers.onPause?.(reason);
  }

  /** Abort execution completely. */
  abort(): void {
    if (isTerminal(this.state)) return;

    const fromState = this.state;
    this.transitionTo(EngineState.ABORTED);
    this.logger.logEngine(fromState, EngineState.ABORTED, "Aborted");
    this.handlers.onAbort?.();
  }

  /** Reset engine to IDLE. */
  reset(): void {
    this.queue.clear();
    this.rollbackMgr.clear();
    this.plan = null;
    this.state = EngineState.IDLE;
    this.startedAt = 0;
    this.pausedAt = 0;
    this.logger.clear();
  }

  // ==========================================================
  // Public API — execution
  // ==========================================================

  /**
   * Execute the next pending action.
   * Returns the result, or null if nothing to execute.
   */
  async tick(): Promise<TransactionResult | null> {
    if (this.state !== EngineState.RUNNING) return null;

    const entry = this.queue.next();
    if (!entry) {
      // Check if everything is done
      if (this.queue.isDone()) {
        this.transitionTo(EngineState.COMPLETED);
        this.logger.logEngine(
          EngineState.RUNNING,
          EngineState.COMPLETED,
          `All ${this.queue.all().length} steps complete`
        );
        this.handlers.onComplete?.();
      }
      return null;
    }

    return this.executeEntry(entry);
  }

  /**
   * Auto-run: execute all remaining actions (stops on pause/error/complete).
   */
  async run(): Promise<void> {
    while (this.state === EngineState.RUNNING) {
      const result = await this.tick();
      if (!result) break;
      // Yield to event loop between steps to prevent SW timeout
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * Retry a failed action.
   */
  async retry(actionId: string): Promise<TransactionResult | null> {
    const entry = this.queue.get(actionId);
    if (!entry || entry.state !== ActionState.FAILED) return null;

    entry.state = transitionAction(entry.state, ActionState.PENDING);
    this.queue.resetCursorTo(actionId);

    if (this.state === EngineState.PAUSED) {
      this.start(); // resume
    }

    return this.executeEntry(entry);
  }

  /**
   * Skip a failed action and continue.
   */
  skip(actionId: string): void {
    const entry = this.queue.get(actionId);
    if (!entry) return;

    entry.state = transitionAction(entry.state, ActionState.SKIPPED);
    this.logger.logAction(
      actionId,
      ActionState.FAILED,
      ActionState.SKIPPED,
      this.state,
      "Action skipped by user"
    );

    if (this.state === EngineState.PAUSED) {
      this.start();
    }
  }

  /**
   * Rollback a scope of completed actions.
   */
  async rollback(scope: Parameters<RollbackManager["execute"]>[0]): Promise<void> {
    const wasRunning = this.state === EngineState.RUNNING;
    if (wasRunning) this.pause("rollback");

    await this.rollbackMgr.execute(scope, this.queue.all() as QueueEntry[]);

    this.logger.logEngine(
      this.state,
      this.state,
      `Rollback executed: ${JSON.stringify(scope)}`
    );

    if (wasRunning) this.start();
  }

  // ==========================================================
  // Public API — query
  // ==========================================================

  /** Current engine status (read-only snapshot) */
  getStatus(): EngineStatus {
    const all = this.queue.all();
    let currentStep = -1;
    let completedSteps = 0;
    let failedSteps = 0;
    let skippedSteps = 0;

    for (let i = 0; i < all.length; i++) {
      const state = all[i].state;
      if (state === ActionState.RUNNING && currentStep === -1) {
        currentStep = i;
      }
      if (state === ActionState.COMPLETED) completedSteps++;
      else if (state === ActionState.FAILED) failedSteps++;
      else if (state === ActionState.SKIPPED) skippedSteps++;
    }

    return {
      engineState: this.state,
      planId: this.plan?.planId ?? null,
      totalSteps: all.length,
      currentStep,
      completedSteps,
      failedSteps,
      skippedSteps,
      isPaused: this.state === EngineState.PAUSED,
      pauseReason: null,
      elapsedMs: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  /** Get the underlying log */
  getLog(): ReadonlyArray<LogEntry> {
    return this.logger.getAll();
  }

  /** Register event handlers */
  on(handlers: EngineEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /** Current engine state */
  getState(): EngineState {
    return this.state;
  }

  /** ID of the currently running action, if any */
  getCurrentActionId(): string | null {
    const all = this.queue.all();
    const running = all.find((e) => e.state === ActionState.RUNNING);
    return running?.action.id ?? null;
  }

  /** ID of the last completed action, if any — used for single-step undo */
  getLastCompletedActionId(): string | null {
    const completed = this.rollbackMgr.getCompleted();
    return completed.length > 0 ? completed[completed.length - 1].action.id : null;
  }

  // ==========================================================
  // Serialization — for SW restart persistence
  // ==========================================================

  /** Produce a compact snapshot for chrome.storage.session */
  serialize(): SerializedEngine {
    if (!this.plan) {
      throw new Error("Cannot serialize engine: no plan loaded");
    }
    const completed = this.rollbackMgr.getCompleted();
    return {
      state: this.state,
      plan: this.plan,
      queueSnapshot: this.queue.toJSON(),
      rollbackHistory: completed.map((ctx) => ({
        actionId: ctx.action.id,
        stepIndex: ctx.stepIndex,
        inverseType: ctx.inverse?.type ?? "NOOP",
        labels: ctx.inverse?.labels ?? [],
        startedAt: ctx.startedAt,
        retryCount: ctx.retryCount,
      })),
      startedAt: this.startedAt,
      pausedAt: this.pausedAt,
      serializedAt: Date.now(),
    };
  }

  /** Restore engine from a persisted snapshot */
  static deserialize(
    snap: SerializedEngine,
    executor: ActionExecutor & InverseExecutor,
    config: Partial<EngineConfig> = {},
    persistKey?: string
  ): ExecutionEngine {
    const engine = new ExecutionEngine(executor, config, persistKey);

    // Reconstruct internal state
    engine.state = snap.state;
    engine.plan = snap.plan;
    engine.startedAt = snap.startedAt;
    engine.pausedAt = snap.pausedAt;

    // Restore queue from snapshot
    engine.queue.restoreFromJSON(snap.queueSnapshot, snap.plan.steps);

    // Restore rollback history
    for (const item of snap.rollbackHistory) {
      const action = snap.plan.steps.find((a) => a.id === item.actionId);
      if (action) {
        engine.rollbackMgr.record({
          action,
          stepIndex: item.stepIndex,
          snapshot: null,
          inverse:
            item.inverseType !== "NOOP"
              ? { type: item.inverseType as InverseAction["type"], labels: item.labels }
              : null,
          startedAt: item.startedAt,
          retryCount: item.retryCount,
        });
      }
    }

    // Log the restore
    engine.logger.logEngine(
      EngineState.IDLE,
      snap.state,
      `Engine restored from snapshot (serialized ${new Date(snap.serializedAt).toISOString()})`
    );

    return engine;
  }

  // ==========================================================
  // Private — execution core
  // ==========================================================

  private async executeEntry(entry: QueueEntry): Promise<TransactionResult> {
    const action = entry.action;
    const retryCount = this.countRetries(action.id);

    this.logger.logAction(
      action.id,
      entry.state,
      ActionState.RUNNING,
      this.state,
      `Executing ${action.type} (retry ${retryCount})`
    );

    entry.state = transitionAction(entry.state, ActionState.RUNNING);
    this.handlers.onActionStart?.({
      action,
      stepIndex: entry.stepIndex,
      snapshot: null,
      inverse: null,
      startedAt: Date.now(),
      retryCount,
    });

    // Execute with transaction wrapping
    const result = await this.transactions.execute(action, entry.stepIndex, retryCount);

    if (result.success) {
      // Commit
      this.queue.markComplete(action.id);
      this.rollbackMgr.record(result.ctx);

      this.logger.logAction(
        action.id,
        ActionState.RUNNING,
        ActionState.COMPLETED,
        this.state,
        `Completed: ${action.type}`,
        undefined,
        Date.now() - result.ctx.startedAt
      );
      this.handlers.onActionComplete?.(result.ctx);
    } else {
      // Handle failure
      await this.handleFailure(entry, result);
    }

    return result;
  }

  private async handleFailure(
    entry: QueueEntry,
    result: TransactionResult
  ): Promise<void> {
    const action = entry.action;
    const error = result.error ?? new Error("Unknown error");

    // User-initiated skip (from skipAnswer) — mark as skipped and move on
    if (error.message === "Skipped by user") {
      entry.state = transitionAction(entry.state, ActionState.SKIPPED);
      this.logger.logAction(
        action.id,
        ActionState.RUNNING,
        ActionState.SKIPPED,
        this.state,
        `Skipped: ${action.type} — ${error.message}`,
        error.message,
        Date.now() - result.ctx.startedAt
      );
      this.handlers.onActionSkip?.(result.ctx);
      return;
    }

    entry.state = transitionAction(entry.state, ActionState.FAILED);

    this.logger.logAction(
      action.id,
      ActionState.RUNNING,
      ActionState.FAILED,
      this.state,
      `Failed: ${action.type} — ${error.message}`,
      error.message,
      Date.now() - result.ctx.startedAt
    );
    this.handlers.onActionFail?.(result.ctx, error);

    const maxRetries = action.meta?.timeoutMs
      ? this.config.maxRetries + 1 // explicit timeout = extra weight
      : this.config.maxRetries;

    const retryCount = this.countRetries(action.id);

    if (retryCount < maxRetries) {
      // Auto-retry
      entry.state = transitionAction(entry.state, ActionState.PENDING);
      this.queue.resetCursorTo(action.id);
      this.logger.logAction(
        action.id,
        ActionState.FAILED,
        ActionState.PENDING,
        this.state,
        `Auto-retry scheduled (${retryCount + 1}/${maxRetries})`
      );
      return;
    }

    // No more retries — decide based on optional flag
    if (action.meta?.optional && this.config.skipOptionalOnError) {
      entry.state = transitionAction(entry.state, ActionState.SKIPPED);
      this.logger.logAction(
        action.id,
        ActionState.FAILED,
        ActionState.SKIPPED,
        this.state,
        "Optional action skipped"
      );
      this.handlers.onActionSkip?.(result.ctx);
      return;
    }

    // Non-optional, no retries left → pause for user decision
    if (this.config.pauseOnError && !isTerminal(this.state)) {
      this.pause(`Action failed: ${action.id} (${action.type}) — ${error.message}`);
    }
  }

  private countRetries(actionId: string): number {
    return this.logger
      .getByAction(actionId)
      .filter((e) => e.toActionState === ActionState.FAILED)
      .length;
  }

  private transitionTo(next: EngineState): void {
    const prev = this.state;
    this.state = transitionEngine(prev, next);
    this.handlers.onStateChange?.(prev, next);
  }
}
