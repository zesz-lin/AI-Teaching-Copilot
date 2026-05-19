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
import { toErrorMessage } from "../shared/utils";

function isReasoningModel(model: string): boolean {
  return /reasoner|o1|o3|o4/i.test(model);
}

function needsSystemAsUser(model: string): boolean {
  // DeepSeek reasoner and some reasoning models don't support system role
  return /deepseek.*reasoner/i.test(model) || /reasoner/i.test(model);
}

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

  private async callApi(messages: ChatMessage[]): Promise<string> {
    const { apiEndpoint, apiKey, model, maxTokens, temperature } = this.config;

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
    };

    // Reasoning models don't support temperature
    if (!isReasoningModel(model)) {
      body.temperature = temperature;
    }

    // Request JSON output if the model supports it (OpenAI only)
    if (model.includes("gpt-4") || model.includes("gpt-3.5")) {
      body.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.getEffectiveTimeout());

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

      const json: ChatCompletionResponse = await response.json();
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("AI 返回了空响应");
      }

      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Streaming fetch — reads SSE chunks and calls onChunk for each delta.
   * Accumulates and returns the full content.
   */
  private async callApiStreaming(
    messages: ChatMessage[],
    onChunk: (text: string, done: boolean) => void
  ): Promise<string> {
    const { apiEndpoint, apiKey, model, maxTokens } = this.config;

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
    };

    // Reasoning models don't support temperature
    if (!isReasoningModel(model)) {
      body.temperature = this.config.temperature;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.getEffectiveTimeout());

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
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      onChunk("", true);
      return accumulated;
    } finally {
      clearTimeout(timer);
    }
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
