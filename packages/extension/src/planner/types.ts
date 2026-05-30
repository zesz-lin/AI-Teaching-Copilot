// ============================================================
// AI Teaching Planner — Type definitions
// ============================================================

import type { Action } from "../dsl/types";

// ============================================================
// Planner configuration
// ============================================================

export interface PlannerConfig {
  /** OpenAI-compatible chat completions endpoint */
  apiEndpoint: string;
  /** Bearer token or API key */
  apiKey: string;
  /** Model name (e.g. gpt-4o, deepseek-chat) */
  model: string;
  /** Max tokens for the response */
  maxTokens: number;
  /** Sampling temperature */
  temperature: number;
  /** Request timeout (ms) */
  timeoutMs: number;
}

export const DEFAULT_PLANNER_CONFIG: Omit<PlannerConfig, "apiKey"> = {
  apiEndpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o",
  maxTokens: 10000,
  temperature: 0.3,
  timeoutMs: 60_000,
};

// ============================================================
// Planner input / output
// ============================================================

export interface PlannerInput {
  /** User's natural-language teaching request */
  query: string;
  /** Target student level */
  level?: "beginner" | "intermediate" | "advanced";
  /** Preferred language for explanations */
  lang?: string;
  /** Compressed GeoGebra canvas context (from StateCompressor) */
  contextHint?: string;
}

export interface PlannerOutput {
  /** Parsed and validated actions */
  actions: Action[];
  /** Human-readable summary of the lesson */
  summary: string;
  /** Raw model response (for debugging) */
  raw?: string;
}

export type PlannerResult =
  | { success: true; data: PlannerOutput }
  | { success: false; error: string; raw?: string };

// ============================================================
// API types
// ============================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  response_format?: { type: "json_object" };
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    total_tokens: number;
  };
}
