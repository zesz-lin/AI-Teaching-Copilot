// ============================================================
// Response parser — validates AI output against DSL schema
// ============================================================

import { validateActionSafe, validateLessonPlanSafe } from "../dsl/validators";
import { toErrorMessage } from "../shared/utils";
import type { Action } from "../dsl/types";
import type { PlannerOutput, PlannerResult } from "./types";

// ============================================================
// Raw response shape (what we expect from the AI)
// ============================================================

interface RawPlannerJson {
  actions: unknown[];
  summary: string;
}

// ============================================================
// Main parser
// ============================================================

export function parsePlannerResponse(raw: string): PlannerResult {
  // 1. Extract JSON from the response (the AI might wrap it in markdown)
  const jsonText = extractJson(raw);
  if (!jsonText) {
    return {
      success: false,
      error: "无法从 AI 响应中提取 JSON",
      raw,
    };
  }

  // 2. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return {
      success: false,
      error: `JSON 解析失败: ${toErrorMessage(err)}`,
      raw,
    };
  }

  // 3. Validate top-level shape
  if (!isRawPlannerJson(parsed)) {
    return {
      success: false,
      error: "JSON 缺少必需的 actions 或 summary 字段",
      raw,
    };
  }

  // 4. Validate each action against the DSL schema
  const actions: Action[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.actions.length; i++) {
    const item = parsed.actions[i];
    const result = validateActionSafe(item);

    if (result.success) {
      actions.push(result.data as Action);
    } else {
      const issues = result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      );
      errors.push(`actions[${i}]: ${issues.join("; ")}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `${errors.length} 个动作验证失败:\n${errors.join("\n")}`,
      raw,
    };
  }

  // 5. Success
  const output: PlannerOutput = {
    actions,
    summary: parsed.summary,
    raw,
  };

  return { success: true, data: output };
}

// ============================================================
// Helpers
// ============================================================

function extractJson(text: string): string | null {
  // Try markdown code block first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // Try to find the outermost JSON object
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    return null;
  }

  // Count braces to find the matching closing brace
  let depth = 0;
  let end = firstBrace;
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  return text.slice(firstBrace, end);
}

function isRawPlannerJson(obj: unknown): obj is RawPlannerJson {
  return (
    typeof obj === "object" &&
    obj !== null &&
    Array.isArray((obj as Record<string, unknown>)["actions"]) &&
    typeof (obj as Record<string, unknown>)["summary"] === "string"
  );
}

// ============================================================
// Parse into LessonPlan (full format)
// ============================================================

export function parseToLessonPlan(
  raw: string,
  topic: string,
  level: "beginner" | "intermediate" | "advanced" = "beginner",
  model: string = "unknown"
) {
  const result = parsePlannerResponse(raw);
  if (!result.success) return result;

  const planResult = validateLessonPlanSafe({
    version: "1.0.0",
    planId: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    topic,
    level,
    estimatedDuration: result.data.actions.length * 60,
    steps: result.data.actions,
    meta: {
      createdAt: new Date().toISOString(),
      model,
      promptSummary: result.data.summary,
    },
  });

  if (!planResult.success) {
    return {
      success: false,
      error: `LessonPlan 验证失败: ${planResult.error.issues.map((i) => i.message).join("; ")}`,
      raw,
    } as const;
  }

  return {
    success: true,
    data: planResult.data,
  } as const;
}
