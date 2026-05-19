// ============================================================
// Bridge Script — runs in page's MAIN world
// ============================================================
//
// This script is injected via <script> tag by the content script.
// It has full access to window.ggbApplet but NO access to chrome.* APIs.
// All communication with the extension goes through window.postMessage.

import { BRIDGE_TOKEN, GGB_POLL_INTERVAL_MS, GGB_POLL_TIMEOUT_MS } from "../shared/constants";
import type { AppMessage, CommandPayload } from "../shared/messages";
import { buildEvent, buildResponse, buildError } from "../shared/messages";
import { execute, getState } from "./executor";
import { setupGgbListeners } from "./listener";
import { isValidBridgeMessage } from "./protocol";

// ============================================================
// GeoGebra applet reference
// ============================================================

declare global {
  interface Window {
    ggbApplet?: GgbApplet;
  }
}

interface GgbApplet {
  isReady(): boolean;
  evalCommand(cmd: string): void;
  deleteObject(label: string): void;
  getObjectNumber(): number;
  getObjectName(i: number): string;
  getObjectType(label: string): string;
  getCoords(label: string): { x: number; y: number };
  getMode(): number;
  getPerspectiveXML(): string;
  getConstructionStep(): number;
  registerObjectClickListener(cb: (label: string) => void): void;
  registerUpdateListener(cb: (label: string) => void): void;
  registerAddListener(cb: (label: string) => void): void;
  unregisterObjectClickListener(cb: (label: string) => void): void;
  unregisterUpdateListener(cb: (label: string) => void): void;
  unregisterAddListener(cb: (label: string) => void): void;
}

// ============================================================
// Boot
// ============================================================

(function boot(): void {
  listenForCsMessages();
  pollForApplet();
})();

// ============================================================
// Poll for ggbApplet readiness
// ============================================================

function pollForApplet(): void {
  const ggb = window.ggbApplet;
  if (ggb && typeof ggb.isReady === "function" && ggb.isReady()) {
    notifyReady();
    return;
  }

  const intv = setInterval(() => {
    const ggb = window.ggbApplet;
    if (ggb && typeof ggb.isReady === "function" && ggb.isReady()) {
      clearInterval(intv);
      clearTimeout(timeout);
      notifyReady();
    }
  }, GGB_POLL_INTERVAL_MS);

  const timeout = setTimeout(() => {
    clearInterval(intv);
    postToCs(
      buildEvent("bridge", "sw", {
        type: "SESSION_EXPIRED",
      })
    );
  }, GGB_POLL_TIMEOUT_MS);
}

function notifyReady(): void {
  setupGgbListeners(postToCs);
  postToCs(buildEvent("bridge", "sw", { type: "GGB_READY" }));
}

// ============================================================
// Listen for messages from Content Script
// ============================================================

function listenForCsMessages(): void {
  window.addEventListener("message", (event) => {
    if (!isValidBridgeMessage(event, BRIDGE_TOKEN)) return;

    const msg = event.data as AppMessage;
    if (msg.source !== "cs") return;

    handleCommand(msg);
  });
}

// ============================================================
// Command dispatch
// ============================================================

function handleCommand(msg: AppMessage): void {
  const payload = msg.payload as CommandPayload;

  switch (payload.type) {
    case "EXEC_GGB": {
      execute(window.ggbApplet, payload.commands).then((results) => {
        postToCs(
          buildResponse(msg.id, "bridge", msg.source, {
            type: "EXEC_RESULT",
            results,
          })
        );
      }).catch((err) => {
        console.error("[Bridge] EXEC_GGB failed:", err);
        postToCs(
          buildError(msg.id, "bridge", msg.source, "EXEC_FAILED", String(err))
        );
      });
      break;
    }

    case "GET_STATE": {
      const data = getState(window.ggbApplet, payload.query);
      postToCs(
        buildResponse(msg.id, "bridge", msg.source, {
          type: "STATE_DATA",
          data,
        })
      );
      break;
    }

    case "CLEAR_ALL": {
      const ggb = window.ggbApplet;
      if (!ggb) {
        postToCs(buildResponse(msg.id, "bridge", msg.source, {
          type: "EXEC_RESULT", results: [{ command: "Delete(All)", status: "ok" }],
        }));
        break;
      }

      // Use deleteObject() API directly — more reliable than evalCommand("Delete(...)")
      // which requires the GWT scripting engine to be fully initialized.
      // Iterate in reverse: dependent objects created later are removed first,
      // avoiding errors from deleting a parent before its children.
      const count = ggb.getObjectNumber();
      const labels: string[] = [];
      for (let i = 0; i < count; i++) {
        try {
          labels.push(ggb.getObjectName(i));
        } catch { /* skip */ }
      }

      for (let i = labels.length - 1; i >= 0; i--) {
        try {
          ggb.deleteObject(labels[i]);
        } catch { /* already deleted as dependency of another object */ }
      }

      postToCs(buildResponse(msg.id, "bridge", msg.source, {
        type: "EXEC_RESULT", results: [{ command: "Delete(All)", status: "ok" }],
      }));
      break;
    }

    case "PING": {
      const ggb = window.ggbApplet;
      const ready = !!(ggb && typeof ggb.isReady === "function" && ggb.isReady());
      postToCs(
        buildResponse(msg.id, "bridge", msg.source, {
          type: "STATE_DATA",
          data: {
            appletReady: ready,
            objectCount: ready ? ggb!.getObjectNumber() : 0,
            objects: [],
            mode: ready ? ggb!.getMode() : 0,
            perspective: "",
          },
        })
      );
      break;
    }

    default:
      postToCs(
        buildError(msg.id, "bridge", msg.source, "INVALID_MESSAGE", `Bridge cannot handle type: ${payload.type}`)
      );
  }
}

// ============================================================
// Send message to Content Script via postMessage
// ============================================================

function postToCs(msg: AppMessage): void {
  window.postMessage({ ...msg, __token: BRIDGE_TOKEN }, "*");
}
