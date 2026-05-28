// ============================================================
// GeoGebra State Compressor — main class
// ============================================================

import type { GgbState } from "../shared/types";
import type {
  CompressedState,
  CompressorInput,
  CompressorConfig,
} from "./types";
import { DEFAULT_COMPRESSOR_CONFIG } from "./types";
import { classifyObjects, estimateTokens } from "./classifier";

// ============================================================
// Compressor
// ============================================================

export class StateCompressor {
  private config: CompressorConfig;

  constructor(config: Partial<CompressorConfig> = {}) {
    this.config = { ...DEFAULT_COMPRESSOR_CONFIG, ...config };
  }

  /**
   * Compress a full GgbState into an AI-consumable compact summary.
   */
  compress(input: CompressorInput): CompressedState {
    const { state, topic, goal, recentActions, aiLabels } = input;

    // 1. Normalize aiLabels
    const aiSet: Set<string> = aiLabels
      ? new Set(Array.isArray(aiLabels) ? aiLabels : aiLabels)
      : new Set();

    // 2. Classify and score objects
    const important = classifyObjects(state, aiSet, this.config);

    // 3. Trim to token budget
    const trimmed = this.trimToBudget(important);

    // 4. Build recent actions (compact)
    const actions = this.buildRecentActions(recentActions, state);

    // 5. Build output
    return {
      current_topic: this.resolveTopic(topic, trimmed, state),
      important_objects: trimmed,
      recent_actions: actions,
      teaching_goal: this.resolveGoal(goal, actions),
    };
  }

  /**
   * Compress and return as a JSON string ready for the AI prompt.
   */
  compressAsJson(input: CompressorInput): string {
    return JSON.stringify(this.compress(input), null, 0);
  }

  /**
   * Compress into a compact text block for inclusion in a system prompt.
   */
  compressAsText(input: CompressorInput): string {
    const c = this.compress(input);

    const lines: string[] = [];

    lines.push(`当前主题: ${c.current_topic}`);
    lines.push(`教学目标: ${c.teaching_goal}`);

    if (c.important_objects.length > 0) {
      lines.push("");
      lines.push("重要对象:");
      for (const obj of c.important_objects) {
        const roleTag = this.roleEmoji(obj.role);
        lines.push(`  ${roleTag} ${obj.description}`);
      }
    }

    if (c.recent_actions.length > 0) {
      lines.push("");
      lines.push("最近操作:");
      for (const action of c.recent_actions) {
        lines.push(`  - ${action}`);
      }
    }

    return lines.join("\n");
  }

  // ============================================================
  // Private
  // ============================================================

  private trimToBudget(objects: import("./types").ImportantObject[]): typeof objects {
    const budget = this.config.maxObjects;
    if (objects.length <= budget) return objects;

    // Always keep targets and parameters first
    const critical = objects.filter((o) =>
      o.role === "target" || o.role === "parameter" || o.role === "vertex"
    );
    const others = objects.filter((o) =>
      o.role !== "target" && o.role !== "parameter" && o.role !== "vertex"
    );

    const result = [...critical];
    for (const obj of others) {
      if (result.length >= budget) break;
      result.push(obj);
    }

    // Re-sort by priority
    result.sort((a, b) => b.priority - a.priority);
    return result.slice(0, budget);
  }

  private resolveTopic(
    topic: string | undefined,
    objects: import("./types").ImportantObject[],
    _state: GgbState
  ): string {
    if (topic) return topic;

    // Infer topic from the most important objects
    const targets = objects.filter((o) => o.role === "target");
    if (targets.length > 0) {
      return `探索 ${targets.map((o) => o.label).join(", ")}`;
    }

    // Infer from object types present
    const types = new Set(objects.map((o) => o.type));
    if (types.has("function")) return "函数图像分析";
    if (types.has("polygon") && types.has("circle")) return "几何构造";
    if (types.has("polygon")) return "多边形构造";
    if (types.has("conic")) return "圆锥曲线分析";

    return "数学探索";
  }

  private resolveGoal(
    goal: string | undefined,
    actions: string[]
  ): string {
    if (goal) return goal;
    if (actions.length > 0) return actions[0];
    return "观察和探索当前图形";
  }

  private buildRecentActions(
    input: string[] | undefined,
    _state: GgbState
  ): string[] {
    const actions = input ?? [];
    // Dedup and trim
    const unique = [...new Set(actions)];
    return unique.slice(0, this.config.maxActions);
  }

  private roleEmoji(role: string): string {
    switch (role) {
      case "target": return "🎯";
      case "vertex": return "📍";
      case "intersection": return "✖️";
      case "center": return "◎";
      case "parameter": return "🎚️";
      case "construction": return "🔧";
      case "annotation": return "📝";
      case "auxiliary": return "⬜";
      default: return "•";
    }
  }
}

// ============================================================
// Singleton convenience
// ============================================================

let _instance: StateCompressor | null = null;

export function getCompressor(config?: Partial<CompressorConfig>): StateCompressor {
  if (config) _instance = new StateCompressor(config);
  if (!_instance) _instance = new StateCompressor(); // auto-create with defaults
  return _instance;
}
