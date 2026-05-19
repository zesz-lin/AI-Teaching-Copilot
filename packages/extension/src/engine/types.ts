// ============================================================
// Execution Engine — Type definitions
// ============================================================

import type { Action, LessonPlan, LessonState, StepState } from "../dsl/types";

// ============================================================
// Engine state machine
// ============================================================

export enum EngineState {
  IDLE = "IDLE",
  READY = "READY",
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  ABORTED = "ABORTED",
  FAILED = "FAILED",
}

export enum ActionState {
  PENDING = "PENDING",
  BLOCKED = "BLOCKED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
  ROLLED_BACK = "ROLLED_BACK",
}

// ============================================================
// Transaction context
// ============================================================

/** Snapshot of state before an action executes */
export interface ActionSnapshot {
  actionId: string;
  /** Labels of objects that existed before this action */
  existingLabels: string[];
  /** Relevant state data for restoration */
  state: Record<string, unknown>;
  capturedAt: string;
}

/** The inverse of an action — used for rollback */
export interface InverseAction {
  /** Type discriminator for the inverse */
  type: "DELETE_OBJECT" | "RESTORE_SNAPSHOT" | "RESET_VIEW" | "RESTORE_STYLE" | "REMOVE_UI" | "NOOP";
  /** Labels to delete (for creation actions) */
  labels?: string[];
  /** Snapshot to restore (for destructive actions) */
  snapshot?: ActionSnapshot;
  /** UI element IDs to remove */
  uiIds?: string[];
  /** Style restoration data */
  styleRestore?: Record<string, unknown>;
}

// ============================================================
// Execution context per action
// ============================================================

export interface ExecutionContext {
  /** The action being executed */
  action: Action;
  /** Index within the plan */
  stepIndex: number;
  /** Snapshot captured before execution */
  snapshot: ActionSnapshot | null;
  /** The inverse to use on rollback */
  inverse: InverseAction | null;
  /** Start time */
  startedAt: number;
  /** Retry count */
  retryCount: number;
}

// ============================================================
// Engine configuration
// ============================================================

export interface EngineConfig {
  /** Max retries per action (default 2) */
  maxRetries: number;
  /** Default action timeout (ms) */
  actionTimeout: number;
  /** Whether to auto-pause on non-optional failure */
  pauseOnError: boolean;
  /** Whether to auto-skip optional failures */
  skipOptionalOnError: boolean;
  /** Whether to persist logs */
  persistLogs: boolean;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  maxRetries: 2,
  actionTimeout: 30_000,
  pauseOnError: true,
  skipOptionalOnError: true,
  persistLogs: true,
};

// ============================================================
// Log entry
// ============================================================

export interface LogEntry {
  /** Monotonic sequence number */
  seq: number;
  /** Wall-clock timestamp (ISO 8601) */
  timestamp: string;
  /** Engine state before this event */
  fromEngineState: EngineState;
  /** Engine state after this event */
  toEngineState: EngineState;
  /** Action ID (null for engine-level events) */
  actionId: string | null;
  /** Action state before */
  fromActionState: ActionState | null;
  /** Action state after */
  toActionState: ActionState | null;
  /** Human-readable message */
  message: string;
  /** Error detail (if any) */
  error?: string;
  /** Duration of this step (ms) */
  durationMs?: number;
}

// ============================================================
// Engine events (callbacks)
// ============================================================

export interface EngineEventHandlers {
  onStateChange?: (from: EngineState, to: EngineState) => void;
  onActionStart?: (ctx: ExecutionContext) => void;
  onActionComplete?: (ctx: ExecutionContext) => void;
  onActionFail?: (ctx: ExecutionContext, error: Error) => void;
  onActionSkip?: (ctx: ExecutionContext) => void;
  onPause?: (reason: string) => void;
  onResume?: () => void;
  onComplete?: () => void;
  onAbort?: () => void;
  onLogEntry?: (entry: LogEntry) => void;
}

// ============================================================
// Engine status (public read-only state)
// ============================================================

export interface EngineStatus {
  engineState: EngineState;
  planId: string | null;
  totalSteps: number;
  currentStep: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  isPaused: boolean;
  pauseReason: string | null;
  elapsedMs: number;
}
