// ============================================================
// postMessage security validation
// ============================================================

/**
 * Validate that a message event is a legitimate Bridge message:
 * 1. Must originate from this window (not parent frame or cross-origin)
 * 2. Must carry the expected token
 * 3. Must have the basic AppMessage shape
 */
export function isValidBridgeMessage(
  event: MessageEvent,
  expectedToken: string
): boolean {
  // 1. Source check — reject messages from iframes or parent
  if (event.source !== window) return false;

  // 2. Token check — reject spoofed messages from other page scripts
  if (event.data?.__token !== expectedToken) return false;

  // 3. Structural check — must have the essential AppMessage fields
  const msg = event.data;
  if (!msg || typeof msg !== "object") return false;
  if (typeof msg.id !== "string") return false;
  if (typeof msg.direction !== "string") return false;
  if (typeof msg.source !== "string") return false;
  if (typeof msg.target !== "string") return false;
  if (!msg.payload || typeof msg.payload !== "object") return false;
  if (typeof msg.payload.type !== "string") return false;

  return true;
}
