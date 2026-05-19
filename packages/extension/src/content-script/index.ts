// ============================================================
// Content Script entry point
// ============================================================

import { injectBridge } from "./injector";
import { relayToBridge, handleBridgeMessage } from "./relay";
import type { AppMessage } from "../shared/messages";

// ============================================================
// 1. Inject Bridge script into page's main world
// ============================================================

injectBridge();

// ============================================================
// 2. Listen for commands from Service Worker
// ============================================================

chrome.runtime.onMessage.addListener(
  (msg: AppMessage, _sender, respond) => {
    if (msg.source !== "sw" || msg.target !== "bridge") return;

    relayToBridge(msg, respond);
    return true; // async response
  }
);

// ============================================================
// 3. Listen for messages from Bridge (main world → isolated world)
// ============================================================

window.addEventListener("message", (event) => {
  // Validate source — must come from this window, not an iframe or parent
  if (event.source !== window) return;

  const msg = event.data as AppMessage | undefined;
  if (!msg || msg.source !== "bridge") return;

  handleBridgeMessage(msg);
});
