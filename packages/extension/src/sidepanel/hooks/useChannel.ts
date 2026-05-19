// ============================================================
// React hook — wraps the messaging channel for components
// ============================================================

import { useEffect, useCallback, useRef } from "react";
import { createChannel, type Channel } from "../messaging/channel";
import { useStore } from "../store";
import type { EventPayload } from "../../shared/messages";
import { toErrorMessage } from "../../shared/utils";
import { EngineState } from "../../engine/types";
import type { LogEntry } from "../../engine/types";
import { parsePlannerResponse } from "../../planner/parser";
import { buildSystemPrompt, buildUserPrompt } from "../../planner/prompt";
import { buildFewShotMessages } from "../../planner/examples";
import type { ChatMessage } from "../../planner/types";
import type { PlannerConfig } from "../../planner/types";
import { loadConfig } from "../../planner/config-store";

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
          store.addSystemMessage("✅ GeoGebra 已就绪");
          break;
        case "GGB_UNLOADED":
        case "SESSION_EXPIRED":
          store.addSystemMessage("⚠️ GeoGebra 已断开，请刷新 GeoGebra 页面后重试");
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

  function isReasoner(model: string): boolean {
    return /reasoner|o1|o3|o4/i.test(model);
  }

  const sendQuery = useCallback(
    async (text: string) => {
      const store = useStore.getState();
      store.addUserMessage(text);
      store.startStreaming();
      lastQuery.current = text;

      try {
        // 1. Load config
        const cfg = await loadConfig();
        if (!cfg) {
          store.addSystemMessage("❌ 无法加载 AI 配置");
          return;
        }

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

        // 3. Build messages
        const systemContent = buildSystemPrompt("zh");
        const isReasoning = /deepseek.*reasoner/i.test(cfg.model);
        const messages: ChatMessage[] = [
          { role: isReasoning ? "user" : "system", content: systemContent },
          ...buildFewShotMessages(),
          { role: "user", content: buildUserPrompt(text, "beginner", contextHint) },
        ];

        // 4. Call AI API directly from sidepanel
        const body: Record<string, unknown> = {
          model: cfg.model,
          messages,
          max_tokens: cfg.maxTokens,
        };
        if (!isReasoner(cfg.model)) {
          body.temperature = cfg.temperature;
        }

        const resp = await fetch(cfg.apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          store.addSystemMessage(`❌ AI API 错误 (${resp.status}): ${errText.slice(0, 200)}`);
          return;
        }

        const json = await resp.json();
        const content = json.choices?.[0]?.message?.content;
        if (!content) {
          store.addSystemMessage("❌ AI 返回了空响应");
          return;
        }

        // 5. Parse response
        const parsed = parsePlannerResponse(content);
        if (!parsed.success) {
          store.addSystemMessage(`❌ AI 规划失败: ${parsed.error}`);
          return;
        }

        // 6. Send parsed plan to SW for execution
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
          store.setStreamContent(`AI 已生成 ${stepCount} 步教学计划，开始执行…`);
          store.finishStreaming();
        }
      } catch (err) {
        store.addSystemMessage(`❌ 请求失败: ${toErrorMessage(err)}`);
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
          `❌ 控制命令失败: ${toErrorMessage(err)}`
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
          `❌ 提交答案失败: ${toErrorMessage(err)}`
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
      useStore.getState().addSystemMessage("🫧 画布已清除");
    } catch (err) {
      useStore.getState().addSystemMessage(`❌ 清除失败: ${toErrorMessage(err)}`);
    }
  }, [channel]);

  const rerun = useCallback(async () => {
    if (lastQuery.current) {
      await sendQuery(lastQuery.current);
    } else {
      useStore.getState().addSystemMessage("⚠️ 没有可重新执行的查询");
    }
  }, [channel, sendQuery]);

  const stop = useCallback(async () => {
    const ok = await sendEngineControl("abort");
    if (ok) useStore.getState().addSystemMessage("⏹ 已停止");
  }, [sendEngineControl]);

  return {
    channel,
    sendQuery,
    sendEngineControl,
    submitAnswer,
    clearCanvas,
    rerun,
    stop,
  };
}
