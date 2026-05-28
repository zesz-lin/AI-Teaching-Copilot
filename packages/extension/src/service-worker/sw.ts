// ============================================================
// Service Worker entry point
// ============================================================

import { SIDEPANEL_PORT } from "../shared/constants";
import type { AppMessage } from "../shared/messages";
import { dispatch } from "./router/dispatcher";
import { reviveSessions } from "./lifecycle/revive";
import { setSessionsPort } from "./engine-manager";

// ============================================================
// Sidepanel long-lived connection
// ============================================================

let sidepanelPort: chrome.runtime.Port | null = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDEPANEL_PORT) return;

  sidepanelPort = port;
  setSessionsPort(port);

  port.onMessage.addListener((msg: AppMessage) => {
    if (!sidepanelPort) {
      console.warn("[SW] Received message but sidepanelPort is null, ignoring");
      return;
    }
    dispatch(msg, sidepanelPort).catch((err) => {
      console.error("[SW] dispatch error:", err);
    });
  });

  port.onDisconnect.addListener(() => {
    // Only null if this is still the active port (not a stale one)
    if (sidepanelPort === port) {
      sidepanelPort = null;
    }
  });
});

// ============================================================
// Content Script messages (relayed from bridge)
// ============================================================

chrome.runtime.onMessage.addListener(
  (msg: AppMessage, sender, respond) => {
    // Only accept messages from our content script on GeoGebra tabs
    if (!sender.tab || msg.source !== "cs") return;
    if (!sender.tab.id) return;

    if (!sidepanelPort) {
      console.warn("[SW] Received CS message but sidepanelPort is null, ignoring");
      return;
    }
    dispatch(msg, sidepanelPort, sender.tab.id, respond).catch((err) => {
      console.error("[SW] dispatch error:", err);
    });
    return true; // Keep respond callback alive for async
  }
);

// ============================================================
// SW lifecycle — restore state from storage
// ============================================================

reviveSessions();
