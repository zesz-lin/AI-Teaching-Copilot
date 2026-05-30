// ============================================================
// State machine — enforces valid transitions
// ============================================================

import { EngineState, ActionState } from "./types";

// ============================================================
// Engine state transitions
// ============================================================

const ENGINE_TRANSITIONS: Record<EngineState, Set<EngineState>> = {
  [EngineState.IDLE]:      new Set([EngineState.READY]),
  [EngineState.READY]:     new Set([EngineState.RUNNING, EngineState.ABORTED]),
  [EngineState.RUNNING]:   new Set([EngineState.PAUSED, EngineState.COMPLETED, EngineState.ABORTED, EngineState.FAILED]),
  [EngineState.PAUSED]:    new Set([EngineState.RUNNING, EngineState.ABORTED]),
  [EngineState.COMPLETED]: new Set([]),
  [EngineState.ABORTED]:   new Set([EngineState.READY]), // can reload plan
  [EngineState.FAILED]:    new Set([EngineState.READY]), // can reload plan
};

export function canTransitionEngine(from: EngineState, to: EngineState): boolean {
  return ENGINE_TRANSITIONS[from]?.has(to) ?? false;
}

export function transitionEngine(current: EngineState, next: EngineState): EngineState {
  if (!canTransitionEngine(current, next)) {
    throw new Error(`Invalid engine transition: ${current} → ${next}`);
  }
  return next;
}

// ============================================================
// Action state transitions
// ============================================================

const ACTION_TRANSITIONS: Record<ActionState, Set<ActionState>> = {
  [ActionState.PENDING]:     new Set([ActionState.BLOCKED, ActionState.RUNNING, ActionState.SKIPPED]),
  [ActionState.BLOCKED]:     new Set([ActionState.PENDING, ActionState.SKIPPED]),
  [ActionState.RUNNING]:     new Set([ActionState.COMPLETED, ActionState.FAILED, ActionState.SKIPPED]),
  [ActionState.COMPLETED]:   new Set([ActionState.ROLLED_BACK]),
  [ActionState.FAILED]:      new Set([ActionState.PENDING, ActionState.SKIPPED, ActionState.RUNNING]),
  [ActionState.SKIPPED]:     new Set([]),
  [ActionState.ROLLED_BACK]: new Set([]),
};

export function canTransitionAction(from: ActionState, to: ActionState): boolean {
  return ACTION_TRANSITIONS[from]?.has(to) ?? false;
}

export function transitionAction(current: ActionState, next: ActionState): ActionState {
  if (!canTransitionAction(current, next)) {
    throw new Error(`Invalid action transition: ${current} → ${next}`);
  }
  return next;
}

// ============================================================
// State helpers
// ============================================================

export function isTerminal(state: EngineState): boolean {
  return state === EngineState.COMPLETED || state === EngineState.ABORTED || state === EngineState.FAILED;
}

export function isRunning(state: EngineState): boolean {
  return state === EngineState.RUNNING;
}
