// ============================================================
// Engine barrel exports
// ============================================================

export { ExecutionEngine } from "./engine";
export { ActionQueue } from "./queue";
export type { QueueEntry } from "./queue";
export { TransactionManager } from "./transaction";
export type { ActionExecutor, TransactionResult } from "./transaction";
export { RollbackManager } from "./rollback";
export type { RollbackScope, RollbackResult, InverseExecutor } from "./rollback";
export { ExecutionLogger } from "./logger";
export {
  EngineState,
  ActionState,
  DEFAULT_ENGINE_CONFIG,
} from "./types";
export type {
  EngineConfig,
  EngineStatus,
  EngineEventHandlers,
  ExecutionContext,
  ActionSnapshot,
  InverseAction,
  LogEntry,
} from "./types";
export {
  transitionEngine,
  transitionAction,
  canTransitionEngine,
  canTransitionAction,
  isTerminal,
  isRunning,
  isPausable,
} from "./state-machine";
