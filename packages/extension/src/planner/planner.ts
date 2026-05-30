// ============================================================
// AI Teaching Planner — main module
// ============================================================

import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { buildFewShotMessages } from "./examples";
import { parsePlannerResponse, parseToLessonPlan } from "./parser";
import type { Action, LessonPlan } from "../dsl/types";
import type {
  PlannerConfig,
  PlannerInput,
  PlannerResult,
  ChatMessage,
  ChatCompletionResponse,
} from "./types";
import { DEFAULT_PLANNER_CONFIG } from "./types";
import { toErrorMessage, isReasoningModel, needsSystemAsUser } from "../shared/utils";

// ============================================================
// Planner
// ============================================================

export class TeachingPlanner {
  private config: PlannerConfig;

  constructor(config: PlannerConfig) {
    this.config = { ...DEFAULT_PLANNER_CONFIG, ...config };
  }

  /**
   * Convert a natural-language teaching request into a validated LessonPlan.
   */
  async plan(input: PlannerInput): Promise<PlannerResult> {
    const messages = this.buildMessages(input);

    let raw: string;
    try {
      raw = await this.callApi(messages);
    } catch (err) {
      return {
        success: false,
        error: `AI API 调用失败: ${toErrorMessage(err)}`,
      };
    }

    return parsePlannerResponse(raw);
  }

  /**
   * Convert to full LessonPlan (includes metadata).
   */
  async planLesson(
    input: PlannerInput,
    model?: string
  ): Promise<{ success: true; data: LessonPlan } | { success: false; error: string }> {
    const result = await this.plan(input);
    if (!result.success) return result;

    return parseToLessonPlan(
      result.data.raw ?? "",
      input.query.slice(0, 80),
      input.level ?? "beginner",
      model ?? this.config.model
    ) as { success: true; data: LessonPlan } | { success: false; error: string };
  }

  /**
   * Quick validate-only — useful for testing prompts without API calls.
   */
  static validate(actions: unknown[]): { success: true; data: Action[] } | { success: false; error: string } {
    const fakeResponse = JSON.stringify({ actions, summary: "Manual validation" });
    const parsed = parsePlannerResponse(fakeResponse);
    if (!parsed.success) return { success: false, error: parsed.error };
    return { success: true, data: parsed.data.actions };
  }

  // ============================================================
  // Streaming API — emits chunks via callback
  // ============================================================

  /**
   * Call the AI API with streaming enabled. Invokes onChunk for each
   * text delta. Returns the full accumulated text.
   */
  async planStreaming(
    input: PlannerInput,
    onChunk: (text: string, done: boolean) => void
  ): Promise<PlannerResult> {
    const messages = this.buildMessages(input);

    try {
      const raw = await this.callApiStreaming(messages, onChunk);
      return parsePlannerResponse(raw);
    } catch (err) {
      return {
        success: false,
        error: `AI API 调用失败: ${toErrorMessage(err)}`,
      };
    }
  }

  // ============================================================
  // Private: message building
  // ============================================================

  private buildMessages(input: PlannerInput): ChatMessage[] {
    const { query, level = "beginner", lang = "zh", contextHint } = input;

    const systemContent = buildSystemPrompt(lang);
    const systemRole: "system" | "user" = needsSystemAsUser(this.config.model) ? "user" : "system";

    const systemMsg: ChatMessage = {
      role: systemRole,
      content: systemContent,
    };
    const fewShotMsgs = buildFewShotMessages();
    const userMsg: ChatMessage = {
      role: "user",
      content: buildUserPrompt(query, level, contextHint),
    };

    return [systemMsg, ...fewShotMsgs, userMsg];
  }

  // ============================================================
  // Private: API calls
  // ============================================================

  private getEffectiveTimeout(): number {
    // Reasoning models can take minutes to think — use 5 min timeout
    return isReasoningModel(this.config.model) ? 300_000 : this.config.timeoutMs;
  }

  private buildRequestBody(
    messages: ChatMessage[],
    extra?: Record<string, unknown>
  ): Record<string, unknown> {
    const { model, maxTokens, temperature } = this.config;

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      ...extra,
    };

    // Reasoning models don't support temperature
    if (!isReasoningModel(model)) {
      body.temperature = temperature;
    }

    // Request JSON output if the model supports it (OpenAI only)
    if (model.includes("gpt-4") || model.includes("gpt-3.5")) {
      body.response_format = { type: "json_object" };
    }

    return body;
  }

  private async fetchWithTimeout(
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Response> {
    const { apiEndpoint, apiKey } = this.config;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.getEffectiveTimeout());

    // Combine external signal with internal timeout
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  private async callApi(messages: ChatMessage[]): Promise<string> {
    const body = this.buildRequestBody(messages);
    const response = await this.fetchWithTimeout(body);

    const json: ChatCompletionResponse = await response.json();
    const content = json.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("AI returned an empty response");
    }

    return content;
  }

  /**
   * Streaming fetch — reads SSE chunks and calls onChunk for each delta.
   * Accumulates and returns the full content.
   */
  private async callApiStreaming(
    messages: ChatMessage[],
    onChunk: (text: string, done: boolean) => void
  ): Promise<string> {
    const body = this.buildRequestBody(messages, { stream: true });
    const response = await this.fetchWithTimeout(body);

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream not supported");

    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            accumulated += content;
          }
        } catch (e) {
          // Malformed SSE line — log for debugging but continue processing
          console.debug("[Planner] Skipping malformed SSE line:", data, e);
        }
      }
    }

    onChunk("", true);
    return accumulated;
  }
}

// ============================================================
// Singleton convenience
// ============================================================

let _instance: TeachingPlanner | null = null;

export function getPlanner(config?: PlannerConfig): TeachingPlanner {
  if (config) {
    _instance = new TeachingPlanner(config);
  }
  if (!_instance) {
    throw new Error("Planner not initialized. Call getPlanner(config) first.");
  }
  return _instance;
}

export function initPlanner(config: PlannerConfig): TeachingPlanner {
  _instance = new TeachingPlanner(config);
  return _instance;
}
