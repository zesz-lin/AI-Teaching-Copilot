// ============================================================
// React hook — wraps the messaging channel for components
// ============================================================

import { useEffect, useCallback, useRef } from "react";
import { createChannel, type Channel } from "../messaging/channel";
import { useStore } from "../store";
import type { EventPayload } from "../../shared/messages";
import { toErrorMessage, isReasoningModel } from "../../shared/utils";
import { EngineState } from "../../engine/types";
import type { LogEntry } from "../../engine/types";
import { parsePlannerResponse } from "../../planner/parser";
import { buildSystemPrompt, buildUserPrompt } from "../../planner/prompt";
import { buildFewShotMessages } from "../../planner/examples";
import type { ChatMessage } from "../../planner/types";
import type { PlannerConfig } from "../../planner/types";
import { loadConfig } from "../../planner/config-store";
import { t } from "../i18n";

let _channel: Channel | null = null;
let _eventsWired = false;

function getChannel(): Channel {
  if (!_channel) _channel = createChannel();
  return _channel;
}

function makeLogEntry(message: string, actionId?: string, error?: string): LogEntry {
  return {
    seq: Date.now(),
    timestamp: new Date().toISOString(),
    fromEngineState: EngineState.RUNNING,
    toEngineState: EngineState.RUNNING,
    actionId: actionId ?? null,
    fromActionState: null,
    toActionState: null,
    message,
    error,
  };
}

export function useChannel() {
  const channel = useRef(getChannel()).current;
  const lastQuery = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Wire bridge events → store (once)
  useEffect(() => {
    if (_eventsWired) return;
    _eventsWired = true;

    channel.onEvent((evt: EventPayload) => {
      const store = useStore.getState();
      switch (evt.type) {
        // ── Streaming ──────────────────────────────

        case "STREAM_CHUNK":
          if (!evt.done) {
            store.appendStreamChunk(evt.text);
          }
          break;

        // ── Bridge events ──────────────────────────

        case "GGB_READY":
          store.addSystemMessage(t("system.ggb_ready"));
          break;
        case "GGB_UNLOADED":
        case "SESSION_EXPIRED":
          store.addSystemMessage(t("system.ggb_disconnected"));
          store.setIsRunning(false);
          store.setExecState(null);
          break;

        // ── Engine events ──────────────────────────────

        case "ENGINE_STATUS":
          store.setExecState({
            engineState: evt.engineState,
            currentStep: evt.currentStep,
            totalSteps: evt.totalSteps,
            completedSteps: evt.completedSteps,
            failedSteps: evt.failedSteps,
            isPaused: evt.isPaused,
          });
          store.setIsRunning(
            evt.engineState === "RUNNING" || evt.engineState === "PAUSED"
          );
          break;

        case "STEP_EVENT":
          store.addLogEntry(
            makeLogEntry(`[${evt.event}] ${evt.message}`, evt.actionId, evt.error)
          );
          if (evt.event === "failed") {
            store.addSystemMessage(`❌ ${evt.message}${evt.error ? `: ${evt.error}` : ""}`);
          }
          break;

        case "SHOW_EXPLAIN":
          store.addSystemMessage(evt.text);
          break;

        case "SHOW_QUESTION":
          store.setActiveQuestion({
            actionId: evt.actionId,
            question: evt.question,
            answerType: evt.answerType,
            options: evt.options,
          });
          store.addSystemMessage(`❓ ${evt.question}`);
          break;

        // ── Bridge events ──────────────────────────────

        case "OBJECT_CLICKED":
          store.addLogEntry(makeLogEntry(`对象被点击: ${evt.label}`));
          break;
        case "CONSTRUCTION_STEP":
          store.addLogEntry(makeLogEntry(`构造步骤: ${evt.stepIndex}`));
          break;
      }
    });
  }, [channel]);

  // ── AI Query (runs in sidepanel, not SW — avoids SW kill timeout) ──

  const sendQuery = useCallback(
    async (text: string) => {
      const store = useStore.getState();
      store.addUserMessage(text);
      store.startStreaming();
      lastQuery.current = text;

      // Abort any previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      try {
        // 1. Load config
        const cfg = await loadConfig();
        if (!cfg) {
          store.addSystemMessage(t("system.config_load_failed"));
          return;
        }

        if (signal.aborted) return;

        // 2. Get canvas context from SW
        let contextHint: string | undefined;
        try {
          const ctxResp = await channel.request({ type: "GET_STATE", query: "object_list" });
          if (ctxResp.type === "STATE_DATA") {
            const state = ctxResp.data;
            if (state.appletReady && state.objects.length > 0) {
              contextHint = `画布有 ${state.objectCount} 个对象: ${state.objects.map((o: {label: string; type: string}) => `${o.label}(${o.type})`).join(", ")}`;
            }
          }
        } catch { /* proceed without context */ }

        if (signal.aborted) return;

        // 3. Build messages
        const systemContent = buildSystemPrompt("zh");
        const isReasoning = isReasoningModel(cfg.model);
        const messages: ChatMessage[] = [
          { role: isReasoning ? "user" : "system", content: systemContent },
          ...buildFewShotMessages(),
          { role: "user", content: buildUserPrompt(text, "beginner", contextHint) },
        ];

        // 4. Call AI API directly from sidepanel with AbortController
        const body: Record<string, unknown> = {
          model: cfg.model,
          messages,
          max_tokens: cfg.maxTokens,
        };
        if (!isReasoningModel(cfg.model)) {
          body.temperature = cfg.temperature;
        }
        if (cfg.model.includes("gpt-4") || cfg.model.includes("gpt-3.5")) {
          body.response_format = { type: "json_object" };
        }

        const resp = await fetch(cfg.apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          store.addSystemMessage(t("system.api_error", { status: String(resp.status), detail: errText.slice(0, 200) }));
          return;
        }

        const json = await resp.json();
        const content = json.choices?.[0]?.message?.content;
        if (!content) {
          store.addSystemMessage(t("system.empty_response"));
          return;
        }

        if (signal.aborted) return;

        // 5. Save raw AI response for LogPanel debug view
        store.addAiRawResponse(content);

        // 6. Parse response
        const parsed = parsePlannerResponse(content);
        if (!parsed.success) {
          console.warn("[Planner] Parse failed. Raw AI response:", content);
          store.addSystemMessage(t("system.plan_failed", { error: parsed.error }));
          return;
        }

        // 7. Send parsed plan to SW for execution
        const planResp = await channel.request({
          type: "EXECUTE_PLAN",
          topic: text.slice(0, 80),
          actions: parsed.data.actions as unknown[],
          summary: parsed.data.summary,
        });

        if (planResp.type === "ERROR") {
          store.addSystemMessage(`❌ ${planResp.detail}`);
        } else if (planResp.type === "OK") {
          const stepCount = parsed.data.actions.length;
          store.setStreamContent(t("system.plan_generated", { count: stepCount }));
          store.finishStreaming();
        }
      } catch (err) {
        if (signal.aborted) return;
        store.addSystemMessage(t("system.request_failed", { error: toErrorMessage(err) }));
      }
    },
    [channel]
  );

  // ── Engine control ──────────────────────────────────────

  const sendEngineControl = useCallback(
    async (action: "abort" | "resume" | "skip" | "rollback"): Promise<boolean> => {
      try {
        const resp = await channel.request({ type: "ENGINE_CONTROL", action });
        if (resp.type === "ERROR") {
          useStore.getState().addSystemMessage(`❌ ${resp.detail}`);
          return false;
        }
        return true;
      } catch (err) {
        useStore.getState().addSystemMessage(
          t("system.control_failed", { error: toErrorMessage(err) })
        );
        return false;
      }
    },
    [channel]
  );

  const submitAnswer = useCallback(
    async (actionId: string, answer: string) => {
      const store = useStore.getState();
      store.clearActiveQuestion();
      store.addUserMessage(answer);
      try {
        const resp = await channel.request({ type: "STUDENT_ANSWER", actionId, answer });
        if (resp.type === "ERROR") {
          store.addSystemMessage(`❌ ${resp.detail}`);
        }
      } catch (err) {
        store.addSystemMessage(
          t("system.submit_failed", { error: toErrorMessage(err) })
        );
      }
    },
    [channel]
  );

  // ── Actions ─────────────────────────────────────────────

  const clearCanvas = useCallback(async () => {
    try {
      await channel.request({ type: "CLEAR_ALL" });
      await channel.request({ type: "CLEAR_SESSION" });
      useStore.getState().addSystemMessage(t("system.canvas_cleared"));
    } catch (err) {
      useStore.getState().addSystemMessage(t("system.clear_failed", { error: toErrorMessage(err) }));
    }
  }, [channel]);

  const rerun = useCallback(async () => {
    if (lastQuery.current) {
      await sendQuery(lastQuery.current);
    } else {
      useStore.getState().addSystemMessage(t("system.no_rerun_query"));
    }
  }, [channel, sendQuery]);

  const stop = useCallback(async () => {
    abortControllerRef.current?.abort();
    const ok = await sendEngineControl("abort");
    if (ok) useStore.getState().addSystemMessage(t("system.stopped"));
  }, [sendEngineControl]);

  const skipQuestion = useCallback(
    async (actionId: string) => {
      const store = useStore.getState();
      store.clearActiveQuestion();
      try {
        await channel.request({ type: "STUDENT_ANSWER", actionId, answer: "" });
      } catch (err) {
        store.addSystemMessage(
          t("system.submit_failed", { error: toErrorMessage(err) })
        );
      }
    },
    [channel]
  );

  return {
    channel,
    sendQuery,
    sendEngineControl,
    submitAnswer,
    skipQuestion,
    clearCanvas,
    rerun,
    stop,
  };
}
