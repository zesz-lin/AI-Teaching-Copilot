// ============================================================
// Sidepanel ↔ Service Worker communication channel
// ============================================================

import { SIDEPANEL_PORT } from "../../shared/constants";
import type { AppMessage, CommandPayload, ResponsePayload, EventPayload } from "../../shared/messages";
import { buildRequest } from "../../shared/messages";

// ============================================================
// Public interface
// ============================================================

export interface Channel {
  /** Send a request, returns a Promise that resolves with the response.
   *  timeoutMs overrides the default 30s — use for long-running requests like AI_QUERY. */
  request(payload: CommandPayload, timeoutMs?: number): Promise<ResponsePayload>;
  /** Register a handler for events pushed from bridge/sw */
  onEvent(handler: (evt: EventPayload) => void): void;
  /** Close the channel */
  close(): void;
}

// ============================================================
// Implementation
// ============================================================

interface PendingEntry {
  resolve: (payload: ResponsePayload) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  msg: AppMessage;
  retries: number;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export function createChannel(): Channel {
  let port = chrome.runtime.connect({ name: SIDEPANEL_PORT });
  const pending = new Map<string, PendingEntry>();
  const eventHandlers: Array<(evt: EventPayload) => void> = [];

  function wirePort(p: chrome.runtime.Port): void {
    p.onMessage.addListener((msg: AppMessage) => {
      switch (msg.direction) {
        case "response": {
          const entry = pending.get(msg.id);
          if (!entry) return;

          clearTimeout(entry.timer);
          pending.delete(msg.id);
          entry.resolve(msg.payload as ResponsePayload);
          break;
        }

        case "event": {
          const evt = msg.payload as EventPayload;
          for (const handler of eventHandlers) {
            try {
              handler(evt);
            } catch {
              // Don't let one handler break the rest
            }
          }
          break;
        }

        // Ignore request-direction messages on this port
      }
    });

    p.onDisconnect.addListener(() => {
      if (p !== port) return;

      // SW was killed — try to reconnect and re-send pending requests
      if (pending.size > 0) {
        try {
          const newPort = chrome.runtime.connect({ name: SIDEPANEL_PORT });
          port = newPort;
          wirePort(newPort);
          // Re-send all pending requests through the new port
          for (const [, entry] of pending) {
            entry.retries++;
            if (entry.retries > MAX_RETRIES) {
              clearTimeout(entry.timer);
              entry.reject(new Error("Service Worker disconnected"));
            } else {
              try {
                newPort.postMessage(entry.msg);
              } catch {
                clearTimeout(entry.timer);
                entry.reject(new Error("Service Worker disconnected"));
              }
            }
          }
          // Clean up rejected entries
          for (const [id, entry] of pending) {
            if (entry.retries > MAX_RETRIES) pending.delete(id);
          }
        } catch {
          for (const [, entry] of pending) {
            clearTimeout(entry.timer);
            entry.reject(new Error("Service Worker disconnected"));
          }
          pending.clear();
        }
      }
    });
  }

  wirePort(port);

  function reconnect(): chrome.runtime.Port {
    const oldPort = port;
    port = chrome.runtime.connect({ name: SIDEPANEL_PORT });
    wirePort(port);
    try { oldPort.disconnect(); } catch { /* already disconnected */ }
    return port;
  }

  function getPort(): chrome.runtime.Port {
    try {
      return port;
    } catch {
      return reconnect();
    }
  }

  function resolveTarget(payload: CommandPayload): "sw" | "bridge" {
    switch (payload.type) {
      case "AI_QUERY":
      case "CLEAR_SESSION":
      case "SET_MODE":
      case "PING":
      case "ENGINE_CONTROL":
      case "STUDENT_ANSWER":
      case "EXECUTE_PLAN":
        return "sw";
      case "EXEC_GGB":
      case "GET_STATE":
      case "CLEAR_ALL":
        return "bridge";
    }
  }

  return {
    request(payload: CommandPayload, timeoutMs?: number): Promise<ResponsePayload> {
      return new Promise((resolve, reject) => {
        const target = resolveTarget(payload);
        const msg = buildRequest("sidepanel", target, payload);

        const timer = setTimeout(() => {
          pending.delete(msg.id);
          reject(new Error(`Request timeout: ${msg.id}`));
        }, timeoutMs ?? REQUEST_TIMEOUT_MS);

        const entry: PendingEntry = { resolve, reject, timer, msg, retries: 0 };
        pending.set(msg.id, entry);

        try {
          getPort().postMessage(msg);
        } catch {
          try {
            const newPort = reconnect();
            entry.retries = 1;
            newPort.postMessage(msg);
          } catch {
            clearTimeout(timer);
            pending.delete(msg.id);
            reject(new Error("Service Worker disconnected"));
          }
        }
      });
    },

    onEvent(handler: (evt: EventPayload) => void): void {
      eventHandlers.push(handler);
    },

    close(): void {
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("Channel closed"));
      }
      pending.clear();
      eventHandlers.length = 0;
      try { port.disconnect(); } catch { /* noop */ }
    },
  };
}
