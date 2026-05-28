// ============================================================
// Message dispatcher — routes messages based on target layer
// ============================================================

import type { AppMessage } from "../../shared/messages";
import { buildResponse, buildError } from "../../shared/messages";
import { getSession, updateSession } from "../session/store";
import { loadConfig, hasApiKey } from "../../planner/config-store";
import { initPlanner } from "../../planner/planner";
import type { TeachingStep } from "../../shared/messages";
import { buildRequest, buildEvent } from "../../shared/messages";
import { createSession, getSession as getEngineSession } from "../engine-manager";
import type { Action } from "../../dsl/types";
import type { GgbState } from "../../shared/types";
import { getCompressor } from "../../compressor/compressor";
import { toErrorMessage } from "../../shared/utils";

// ============================================================
// Content script injection for pre-existing tabs
// ============================================================
//
// Tabs opened before the extension was installed or reloaded won't
// have the content script auto-injected. We detect this by trying a
// cheap ping first, and if that fails, inject cs.js via the scripting
// API. The injected CS will then inject bridge.js into the page.

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    // Quick ping — resolves if CS is listening, rejects if not
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return;
  } catch {
    // CS not present — inject it
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["cs.js"],
    });
    // Poll for bridge readiness instead of fixed delay
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        await chrome.tabs.sendMessage(tabId, { type: "PING" });
        return; // Bridge is ready
      } catch {
        // Not ready yet, keep polling
      }
    }
    console.warn(`[Dispatcher] Bridge not ready after polling tab ${tabId}, proceeding anyway`);
  } catch (err) {
    console.error(`[Dispatcher] Failed to inject CS into tab ${tabId}:`, err);
  }
}

// ============================================================
// Active tab tracking
// ============================================================

let activeTabId: number | null = null;

export function setActiveTab(id: number): void {
  activeTabId = id;
}

async function resolveActiveTab(): Promise<number | null> {
  if (activeTabId) return activeTabId;

  const [tab] = await chrome.tabs.query({
    active: true,
    url: "*://*.geogebra.org/*",
  });
  if (tab?.id) {
    activeTabId = tab.id;
    return tab.id;
  }
  return null;
}

// ============================================================
// Main dispatch
// ============================================================

export async function dispatch(
  msg: AppMessage,
  sidepanelPort: chrome.runtime.Port | null,
  csTabId?: number,
  csRespond?: (r: AppMessage) => void
): Promise<void> {
  switch (msg.target) {
    case "sw":
      await handleInternal(msg, sidepanelPort, csTabId, csRespond);
      break;

    case "bridge": {
      const tabId = csTabId ?? (await resolveActiveTab());
      if (!tabId) {
        const err = buildError(
          msg.id,
          "sw",
          msg.source,
          "NO_ACTIVE_TAB",
          "No GeoGebra tab found"
        );
        respondToSource(msg, err, sidepanelPort, csRespond);
        return;
      }
      await ensureContentScript(tabId);

      // Rewrite source — CS only accepts messages from "sw"
      const fwdMsg: AppMessage = { ...msg, source: "sw" };

      chrome.tabs.sendMessage(tabId, fwdMsg)
        .then((response: AppMessage) => {
          respondToSource(msg, response, sidepanelPort, csRespond);
        })
        .catch(() => {
          const err = buildError(
            msg.id,
            "sw",
            msg.source,
            "BRIDGE_TIMEOUT",
            `Failed to reach content script on tab ${tabId}`
          );
          respondToSource(msg, err, sidepanelPort, csRespond);
        });
      break;
    }

    case "sidepanel":
      sidepanelPort?.postMessage(msg);
      break;
  }
}

// ============================================================
// Internal handlers (target === "sw")
// ============================================================

async function handleInternal(
  msg: AppMessage,
  sidepanelPort: chrome.runtime.Port | null,
  csTabId?: number,
  csRespond?: (r: AppMessage) => void
): Promise<void> {
  const payload = msg.payload;

  switch (payload.type) {
    case "PING": {
      const pong = buildResponse(msg.id, "sw", msg.source, { type: "PONG" });
      respondToSource(msg, pong, sidepanelPort, csRespond);
      break;
    }

    case "AI_QUERY": {
      // Check for API key
      const hasKey = await hasApiKey();
      if (!hasKey) {
        const resp = buildResponse(msg.id, "sw", msg.source, {
          type: "AI_RESPONSE",
          text: "⚠️ 请先设置 AI API Key。\n\n在扩展设置中配置 OpenAI 兼容的 API 端点、Key 和模型。",
          steps: [],
        });
        respondToSource(msg, resp, sidepanelPort, csRespond);
        break;
      }

      try {
        const config = await loadConfig();
        if (!config) {
          const resp = buildResponse(msg.id, "sw", msg.source, {
            type: "AI_RESPONSE",
            text: "⚠️ 无法加载 AI 配置",
            steps: [],
          });
          respondToSource(msg, resp, sidepanelPort, csRespond);
          break;
        }

        // 1. Resolve active tab
        const tabId = csTabId ?? (await resolveActiveTab());

        // 2. Fetch current GeoGebra state and compress for planner context
        let contextHint: string | undefined;
        if (tabId) {
          contextHint = await fetchCompressedState(tabId);
        }

        // 3. Show "thinking" via streaming, buffer the raw response
        if (sidepanelPort) {
          sidepanelPort.postMessage(
            buildEvent("sw", "sidepanel", {
              type: "STREAM_CHUNK",
              text: "",
              done: false,
            })
          );
        }

        // 3b. Generate LessonPlan via Planner with streaming progress
        const planner = initPlanner(config);
        const result = await planner.planStreaming(
          { query: payload.text, contextHint },
          (chunk, done) => {
            if (!sidepanelPort) return;
            if (done) {
              sidepanelPort.postMessage(
                buildEvent("sw", "sidepanel", {
                  type: "STREAM_CHUNK",
                  text: "",
                  done: true,
                })
              );
            } else if (chunk) {
              sidepanelPort.postMessage(
                buildEvent("sw", "sidepanel", {
                  type: "STREAM_CHUNK",
                  text: chunk,
                  done: false,
                })
              );
            }
          }
        );

        if (!result.success) {
          const resp = buildResponse(msg.id, "sw", msg.source, {
            type: "AI_RESPONSE",
            text: `❌ AI 规划失败:\n\n${result.error}`,
            steps: [],
          });
          respondToSource(msg, resp, sidepanelPort, csRespond);
          break;
        }

        if (!tabId) {
          const resp = buildResponse(msg.id, "sw", msg.source, {
            type: "AI_RESPONSE",
            text: "⚠️ 未找到活动的 GeoGebra 标签页，无法执行教学计划。",
            steps: [],
          });
          respondToSource(msg, resp, sidepanelPort, csRespond);
          break;
        }

        // 4. Build LessonPlan from Planner output
        const lessonPlan = {
          version: "1.0.0" as const,
          planId: `plan-${Date.now().toString(36)}`,
          topic: payload.text.slice(0, 80),
          level: "beginner" as const,
          steps: result.data.actions,
          meta: {
            createdAt: new Date().toISOString(),
            model: config.model,
            promptSummary: result.data.summary,
          },
        };

        // 5. Load into engine and start execution
        const engineSession = createSession(tabId, sidepanelPort);
        engineSession.engine.loadPlan(lessonPlan);
        engineSession.engine.start();

        // Start execution in background (don't await — engine runs async)
        engineSession.engine.run().catch((err) => {
          console.error("[Dispatcher] Engine run error:", err);
        });

        // 6. Build step descriptions for AI_RESPONSE
        const steps: TeachingStep[] = result.data.actions.map((a: Action, i: number) => ({
          step: i + 1,
          description: a.meta?.reason ?? `${a.type}: ${JSON.stringify(a.params).slice(0, 60)}`,
          commands: [],
          expectedObservation: "",
        }));

        const resp = buildResponse(msg.id, "sw", msg.source, {
          type: "AI_RESPONSE",
          text: result.data.summary,
          steps,
        });
        respondToSource(msg, resp, sidepanelPort, csRespond);
      } catch (err) {
        const resp = buildResponse(msg.id, "sw", msg.source, {
          type: "AI_RESPONSE",
          text: `❌ AI 调用异常:\n\n${toErrorMessage(err)}`,
          steps: [],
        });
        respondToSource(msg, resp, sidepanelPort, csRespond);
      }
      break;
    }

    // ── Execute plan (from sidepanel AI call) ──────────────

    case "EXECUTE_PLAN": {
      const tabId = csTabId ?? (await resolveActiveTab());
      if (!tabId) {
        respondToSource(
          msg,
          buildError(msg.id, "sw", msg.source, "NO_ACTIVE_TAB", "No GeoGebra tab found"),
          sidepanelPort,
          csRespond
        );
        break;
      }

      const actions = payload.actions as Action[];

      const lessonPlan = {
        version: "1.0.0" as const,
        planId: `plan-${Date.now().toString(36)}`,
        topic: payload.topic,
        level: "beginner" as const,
        steps: actions,
        meta: {
          createdAt: new Date().toISOString(),
          model: "",
          promptSummary: payload.summary,
        },
      };

      const engineSession = createSession(tabId, sidepanelPort);
      engineSession.engine.loadPlan(lessonPlan);
      engineSession.engine.start();

      engineSession.engine.run().catch((err) => {
        console.error("[Dispatcher] Engine run error:", err);
      });

      respondToSource(
        msg,
        buildResponse(msg.id, "sw", msg.source, { type: "OK" }),
        sidepanelPort,
        csRespond
      );
      break;
    }

    // ── Engine control ─────────────────────────────────────

    case "ENGINE_CONTROL": {
      let sent = false;
      const respond = (resp: AppMessage) => {
        sent = true;
        respondToSource(msg, resp, sidepanelPort, csRespond);
      };

      const tabId = csTabId ?? (await resolveActiveTab());
      if (!tabId) {
        respond(buildError(msg.id, "sw", msg.source, "NO_ACTIVE_TAB", "No GeoGebra tab found"));
        break;
      }

      const session = getEngineSession(tabId);
      if (!session) {
        respond(buildError(msg.id, "sw", msg.source, "NO_SESSION", "No active engine session"));
        break;
      }

      switch (payload.action) {
        case "abort":
          session.engine.abort();
          break;
        case "resume":
          if (session.engine.getState() === "PAUSED") {
            session.engine.start();
            session.engine.run().catch((err) => {
              console.error("[Dispatcher] Engine resume error:", err);
            });
          }
          break;
        case "skip": {
          const currentActionId = session.engine.getCurrentActionId();
          if (currentActionId) {
            session.engine.skip(currentActionId);
          }
          if (session.engine.getState() === "PAUSED") {
            session.engine.start();
            session.engine.run().catch((err) => {
              console.error("[Dispatcher] Engine skip error:", err);
            });
          }
          break;
        }
        case "rollback": {
          const actionId = session.engine.getLastCompletedActionId();
          if (!actionId) {
            respond(buildError(msg.id, "sw", msg.source, "NOTHING_TO_UNDO", "No completed steps to undo"));
            break;
          }
          await session.engine.rollback({ type: "single", actionId });
          break;
        }
      }
      if (!sent) {
        respond(buildResponse(msg.id, "sw", msg.source, { type: "OK" }));
      }
      break;
    }

    // ── Student answer ─────────────────────────────────────

    case "STUDENT_ANSWER": {
      const tabId = csTabId ?? (await resolveActiveTab());
      if (!tabId) {
        respondToSource(msg, buildError(msg.id, "sw", msg.source, "NO_ACTIVE_TAB", "No GeoGebra tab found"), sidepanelPort, csRespond);
        break;
      }

      const session = getEngineSession(tabId);
      if (!session) {
        respondToSource(msg, buildError(msg.id, "sw", msg.source, "NO_SESSION", "No active engine session"), sidepanelPort, csRespond);
        break;
      }

      session.resolveAnswer(payload.actionId, payload.answer);
      if (!payload.answer) {
        session.engine.skip(payload.actionId);
      }
      const ok = buildResponse(msg.id, "sw", msg.source, { type: "OK" });
      respondToSource(msg, ok, sidepanelPort, csRespond);
      break;
    }

    case "GET_STATE": {
      const tabId = csTabId ?? (await resolveActiveTab());
      if (tabId) {
        const session = await getSession(tabId);
        const resp = buildResponse(msg.id, "sw", msg.source, {
          type: "STATE_DATA",
          data: {
            appletReady: session?.ggbReady ?? false,
            objectCount: 0,
            objects: [],
            mode: 1,
            perspective: "",
          },
        });
        respondToSource(msg, resp, sidepanelPort, csRespond);
      }
      break;
    }

    case "CLEAR_SESSION": {
      const tabId = csTabId ?? (await resolveActiveTab());
      if (tabId) {
        await updateSession(tabId, {
          ggbReady: false,
          context: {
            completedSteps: [],
            collectedAnswers: {},
            createdObjectLabels: [],
          },
          lastActive: new Date().toISOString(),
        });
      }
      const ok = buildResponse(msg.id, "sw", msg.source, { type: "OK" });
      respondToSource(msg, ok, sidepanelPort, csRespond);
      break;
    }

    // Events from bridge (relayed through CS)
    case "GGB_READY": {
      if (csTabId) {
        const existing = await getSession(csTabId);
        await updateSession(csTabId, {
          ggbReady: true,
          context: existing?.context ?? {
            completedSteps: [],
            collectedAnswers: {},
            createdObjectLabels: [],
          },
          lastActive: new Date().toISOString(),
        });
      }
      break;
    }

    case "OBJECT_CLICKED":
    case "OBJECT_DRAGGED":
    case "CONSTRUCTION_STEP":
      // Forward to sidepanel AND check for event-driven pause resolution
      sidepanelPort?.postMessage(msg);
      if (csTabId) {
        const es = getEngineSession(csTabId);
        if (es) es.handleBridgeEvent(payload);
      }
      break;

    case "GGB_UNLOADED":
    case "SESSION_EXPIRED":
      // Forward all events to sidepanel
      sidepanelPort?.postMessage(msg);
      break;
  }
}

// ============================================================
// Response routing — determines which channel to reply on
// ============================================================

function respondToSource(
  original: AppMessage,
  response: AppMessage,
  sidepanelPort: chrome.runtime.Port | null,
  csRespond?: (r: AppMessage) => void
): void {
  switch (original.source) {
    case "sidepanel":
      sidepanelPort?.postMessage(response);
      break;
    case "cs":
      csRespond?.(response);
      break;
    // bridge cannot directly receive, but handle gracefully
  }
}

// ============================================================
// Canvas state fetch + compress (for planner context)
// ============================================================

async function fetchCompressedState(tabId: number): Promise<string | undefined> {
  try {
    // 1. Fetch current GeoGebra state from Bridge
    await ensureContentScript(tabId);
    const stateReq = buildRequest("sw", "bridge", {
      type: "GET_STATE",
      query: "object_list",
    });
    const stateResp = await chrome.tabs.sendMessage(tabId, stateReq);

    const ggbState: GgbState =
      stateResp.payload.type === "STATE_DATA"
        ? stateResp.payload.data
        : { appletReady: false, objectCount: 0, objects: [], mode: 1, perspective: "" };

    if (!ggbState.appletReady || ggbState.objects.length === 0) return undefined;

    // 2. Get session context for topic and AI-created labels
    let topic: string | undefined;
    let aiLabels: string[] = [];
    try {
      const session = await getSession(tabId);
      if (session) {
        topic = session.context.topic;
        aiLabels = session.context.createdObjectLabels ?? [];
      }
    } catch {
      // Session not available — proceed without context
    }

    // 3. Compress
    const compressor = getCompressor();
    const text = compressor.compressAsText({
      state: ggbState,
      topic,
      aiLabels,
    });

    return text;
  } catch {
    // State fetch failed — planner will work without context
    return undefined;
  }
}
