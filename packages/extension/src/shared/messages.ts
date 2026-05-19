// ============================================================
// Message protocol — the shared contract across all 4 layers
// ============================================================

import type { Layer, GgbCommand, GgbState, ErrorCode } from "./types";

// ============================================================
// Message envelope
// ============================================================

export interface AppMessage {
  id: string;
  direction: "request" | "response" | "event";
  source: Layer;
  target: Layer;
  timestamp: string;
  payload: CommandPayload | ResponsePayload | EventPayload;
}

// ============================================================
// Request payloads (sidepanel → sw → cs → bridge direction)
// ============================================================

export type CommandPayload =
  | { type: "AI_QUERY"; text: string }
  | { type: "EXEC_GGB"; commands: GgbCommand[] }
  | { type: "GET_STATE"; query: "applet_status" | "object_list" | "selected" }
  | { type: "SET_MODE"; mode: "teaching" | "free" | "observe" }
  | { type: "CLEAR_SESSION" }
  | { type: "PING" }
  | { type: "ENGINE_CONTROL"; action: "abort" | "resume" | "skip" | "rollback" }
  | { type: "STUDENT_ANSWER"; actionId: string; answer: string }
  | { type: "EXECUTE_PLAN"; topic: string; actions: unknown[]; summary: string }
  | { type: "CLEAR_ALL" };

// ============================================================
// Response payloads
// ============================================================

export interface ExecResultItem {
  command: string;
  status: "ok" | "error";
  error?: string;
  label?: string;
}

export interface TeachingStep {
  step: number;
  description: string;
  commands: GgbCommand[];
  expectedObservation: string;
}

export type ResponsePayload =
  | { type: "AI_RESPONSE"; text: string; steps: TeachingStep[] }
  | { type: "EXEC_RESULT"; results: ExecResultItem[] }
  | { type: "STATE_DATA"; data: GgbState }
  | { type: "ERROR"; code: ErrorCode; detail: string }
  | { type: "OK" }
  | { type: "PONG" };

// ============================================================
// Event payloads (bridge → cs → sw → sidepanel direction)
// ============================================================

export type EventPayload =
  | { type: "GGB_READY" }
  | { type: "GGB_UNLOADED" }
  | { type: "OBJECT_CLICKED"; label: string; coords: [number, number] }
  | {
      type: "OBJECT_DRAGGED";
      label: string;
      from: [number, number];
      to: [number, number];
    }
  | { type: "CONSTRUCTION_STEP"; stepIndex: number }
  | { type: "SESSION_EXPIRED" }
  // ── Engine / Teaching events (SW → Sidepanel) ──
  | { type: "ENGINE_STATUS"; engineState: string; currentStep: number; totalSteps: number; completedSteps: number; failedSteps: number; isPaused: boolean }
  | { type: "STEP_EVENT"; event: "started" | "completed" | "failed" | "skipped"; actionId: string; actionType: string; message: string; error?: string }
  | { type: "SHOW_EXPLAIN"; actionId: string; text: string }
  | { type: "SHOW_QUESTION"; actionId: string; question: string; answerType: string; options?: string[] }
  | { type: "STREAM_CHUNK"; text: string; done: boolean };

// ============================================================
// Builder helpers
// ============================================================

let _seq = 0;
function nextId(): string {
  _seq++;
  return `${Date.now()}-${_seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildRequest(
  source: Layer,
  target: Layer,
  payload: CommandPayload
): AppMessage {
  return {
    id: nextId(),
    direction: "request",
    source,
    target,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function buildResponse(
  requestId: string,
  source: Layer,
  target: Layer,
  payload: ResponsePayload
): AppMessage {
  return {
    id: requestId,
    direction: "response",
    source,
    target,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function buildEvent(
  source: Layer,
  target: Layer,
  payload: EventPayload
): AppMessage {
  return {
    id: nextId(),
    direction: "event",
    source,
    target,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function buildError(
  requestId: string,
  source: Layer,
  target: Layer,
  code: ErrorCode,
  detail: string
): AppMessage {
  return {
    id: requestId,
    direction: "response",
    source,
    target,
    timestamp: new Date().toISOString(),
    payload: { type: "ERROR", code, detail },
  };
}
