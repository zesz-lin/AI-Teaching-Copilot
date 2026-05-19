// ============================================================
// Content Script ↔ Bridge message relay
// ============================================================

import { BRIDGE_TOKEN, BRIDGE_TIMEOUT_MS } from "../shared/constants";
import type { AppMessage } from "../shared/messages";
import { buildError } from "../shared/messages";

// ============================================================
// Pending request tracking (for request → response matching)
// ============================================================

interface PendingRequest {
  resolve: (resp: AppMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();

// ============================================================
// SW → Bridge (forward command)
// ============================================================

export function relayToBridge(
  msg: AppMessage,
  respond: (r: AppMessage) => void
): void {
  const pending: PendingRequest = {
    resolve: respond,
    reject: (err) => {
      respond(
        buildError(msg.id, "cs", "sw", "BRIDGE_TIMEOUT", err.message)
      );
    },
    timer: setTimeout(() => {
      pendingRequests.delete(msg.id);
      pending.reject(
        new Error(`Bridge response timeout for request ${msg.id}`)
      );
    }, BRIDGE_TIMEOUT_MS),
  };

  pendingRequests.set(msg.id, pending);

  window.postMessage({ ...msg, source: "cs", __token: BRIDGE_TOKEN }, "*");
}

// ============================================================
// Bridge → SW (forward response or event)
// ============================================================

export function handleBridgeMessage(msg: AppMessage): void {
  switch (msg.direction) {
    case "response": {
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);

      // Resolve the original chrome.tabs.sendMessage promise
      pending.resolve(msg);

      // Also route through SW for forwarding to sidepanel if needed
      chrome.runtime.sendMessage(msg).catch(() => { /* fire-and-forget */ });
      break;
    }

    case "event": {
      // Forward events up to SW (which may forward to sidepanel)
      chrome.runtime.sendMessage(msg).catch(() => {
        // SW may be inactive — event is fire-and-forget
      });
      break;
    }
  }
}
