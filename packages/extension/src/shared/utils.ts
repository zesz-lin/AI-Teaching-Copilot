// ============================================================
// Shared utilities — used across all layers
// ============================================================

/** Convert any caught value to a string message */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
