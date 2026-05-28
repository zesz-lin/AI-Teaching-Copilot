// ============================================================
// Shared utilities — used across all layers
// ============================================================

/** Convert any caught value to a string message */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Check if a model is a reasoning model (o1, o3, o4, deepseek-reasoner, etc.) */
export function isReasoningModel(model: string): boolean {
  return /reasoner|o1|o3|o4/i.test(model);
}

/** Check if a model needs system role sent as user role (DeepSeek reasoner) */
export function needsSystemAsUser(model: string): boolean {
  return /deepseek.*reasoner/i.test(model) || /reasoner/i.test(model);
}
