// ============================================================
// Core domain types — independent of message protocol
// ============================================================

/** Execution context layers */
export type Layer = "sidepanel" | "sw" | "cs" | "bridge";

// ============================================================
// GeoGebra domain types
// ============================================================

export interface GgbCommand {
  expr: string;
  timeout?: number;
  silent?: boolean;
}

export interface GgbObjectBrief {
  label: string;
  type: string;
  defined: boolean;
}

export interface GgbState {
  appletReady: boolean;
  objectCount: number;
  objects: GgbObjectBrief[];
  mode: number;
  perspective: string;
}

// ============================================================
// Session
// ============================================================

export interface TeachingContext {
  topic?: string;
  level?: "beginner" | "intermediate" | "advanced";
  completedSteps: number[];
  collectedAnswers: Record<string, string | number>;
  createdObjectLabels: string[];
}

export interface TabSession {
  tabId: number;
  ggbReady: boolean;
  context: TeachingContext;
  lastActive: string;
}

// ============================================================
// Error codes
// ============================================================

export type ErrorCode =
  | "GGB_NOT_READY"
  | "GGB_COMMAND_FAILED"
  | "BRIDGE_TIMEOUT"
  | "AI_API_ERROR"
  | "INVALID_MESSAGE"
  | "NO_ACTIVE_TAB"
  | "NO_SESSION"
  | "NOTHING_TO_UNDO"
  | "SESSION_EXPIRED"
  | "UNKNOWN_ACTION"
  | "EXEC_FAILED";
