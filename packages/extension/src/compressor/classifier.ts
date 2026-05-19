// ============================================================
// Object classifier — scores importance for teaching relevance
// ============================================================

import type { GgbObjectBrief, GgbState } from "../shared/types";
import type { ImportantObject, ObjectRole, CompressorConfig } from "./types";

// ============================================================
// Type → base priority
// ============================================================

const TYPE_PRIORITY: Record<string, number> = {
  function: 100,
  conic: 90,
  polygon: 85,
  slider: 80,
  numeric: 80,
  point: 70,
  line: 65,
  text: 60,
  angle: 50,
  locus: 40,
  list: 30,
  image: 20,
  ray: 65,
  segment: 65,
  vector: 55,
};

function basePriority(type: string): number {
  return TYPE_PRIORITY[type] ?? 30;
}

// ============================================================
// Role inference
// ============================================================

function inferRole(
  obj: GgbObjectBrief,
  allObjects: GgbObjectBrief[],
  aiLabels: Set<string>
): ObjectRole {
  const label = obj.label;
  const type = obj.type;

  // AI-created objects are typically construction or target
  if (aiLabels.has(label)) {
    // Functions and conics are usually the target
    if (type === "function" || type === "conic") return "target";
    // Sliders are parameters
    if (type === "numeric" || type === "slider") return "parameter";
    // Text objects are annotations
    if (type === "text") return "annotation";
    // Points/lines are construction
    return "construction";
  }

  // User-visible important points
  if (type === "point") {
    // Check if this point is referenced by other objects' labels
    const referenced = allObjects.some(
      (other) => other.label !== label && other.label.includes(label)
    );
    if (referenced) return "vertex";
    return "auxiliary";
  }

  // Functions/conics not created by AI
  if (type === "function" || type === "conic") return "target";
  if (type === "polygon") return "target";
  if (type === "numeric" || type === "slider") return "parameter";
  if (type === "text") return "annotation";

  return "auxiliary";
}

// ============================================================
// Description builder
// ============================================================

function buildDescription(
  _obj: GgbObjectBrief,
  _allObjects: GgbObjectBrief[],
  _aiLabels: Set<string>,
  maxLength: number
): string {
  const type = _obj.type;
  const label = _obj.label;

  // Base description: type + label
  let desc = `${typeName(type)} ${label}`;
  if (desc.length > maxLength) return desc.slice(0, maxLength);

  return desc;
}

function typeName(type: string): string {
  const names: Record<string, string> = {
    point: "点",
    line: "直线",
    segment: "线段",
    ray: "射线",
    conic: "圆锥曲线",
    circle: "圆",
    function: "函数",
    polygon: "多边形",
    numeric: "数值",
    slider: "滑块",
    text: "文本",
    angle: "角",
    locus: "轨迹",
    list: "列表",
    image: "图片",
    vector: "向量",
  };
  return names[type] ?? type;
}

// ============================================================
// Object dedup — merge near-identical objects
// ============================================================

interface ObjectGroup {
  type: string;
  labels: string[];
  role: ObjectRole;
  priority: number;
}

function groupSimilarObjects(objects: ImportantObject[]): ImportantObject[] {
  const groups = new Map<string, ObjectGroup>();

  for (const obj of objects) {
    const key = `${obj.type}:${obj.role}`;
    const existing = groups.get(key);

    if (existing && obj.role === "auxiliary") {
      existing.labels.push(obj.label);
    } else if (existing && existing.labels.length < 4) {
      existing.labels.push(obj.label);
    } else if (!existing) {
      groups.set(key, {
        type: obj.type,
        labels: [obj.label],
        role: obj.role,
        priority: obj.priority,
      });
    }
  }

  const result: ImportantObject[] = [];
  for (const [, group] of groups) {
    const labels = group.labels;
    const labelStr = labels.length === 1
      ? labels[0]
      : `${labels[0]} 等${labels.length}个`;
    const desc = labels.length === 1
      ? `${typeName(group.type)} ${labelStr}`
      : `${labels.length}个${typeName(group.type)}: ${labels.slice(0, 3).join(", ")}`;

    result.push({
      label: labelStr,
      type: group.type,
      description: desc,
      role: group.role,
      priority: group.priority + labels.length, // Groups get slight priority boost
    });
  }

  return result;
}

// ============================================================
// Main classifier
// ============================================================

export function classifyObjects(
  state: GgbState,
  aiLabels: Set<string>,
  config: CompressorConfig
): ImportantObject[] {
  const results: ImportantObject[] = [];
  const allObjects = state.objects;

  for (const obj of allObjects) {
    // Skip undefined objects
    if (!obj.defined) continue;

    const role = inferRole(obj, allObjects, aiLabels);
    const typePri = basePriority(obj.type);

    // Role-based priority boost
    const roleBoost = {
      target: 50,
      vertex: 40,
      intersection: 35,
      center: 30,
      parameter: 25,
      construction: 10,
      annotation: 5,
      auxiliary: 0,
    }[role];

    const aiBoost = aiLabels.has(obj.label) ? 20 : 0;

    const description = buildDescription(obj, allObjects, aiLabels, config.maxDescLength);

    results.push({
      label: obj.label,
      type: obj.type,
      description,
      role,
      priority: typePri + roleBoost + aiBoost,
    });
  }

  // Sort by priority descending
  results.sort((a, b) => b.priority - a.priority);

  // Dedup auxiliary groups
  const deduped = groupSimilarObjects(results);

  // Trim to budget
  if (!config.includeAuxiliary) {
    return deduped.filter((o) => o.role !== "auxiliary").slice(0, config.maxObjects);
  }

  return deduped.slice(0, config.maxObjects);
}

// ============================================================
// Token estimation
// ============================================================

export function estimateTokens(objects: ImportantObject[]): number {
  let total = 0;
  for (const obj of objects) {
    // Rough: each character ~0.25 tokens for Chinese, ~0.3 for mixed
    total += Math.ceil(obj.description.length * 0.35);
    total += 2; // overhead per object
  }
  return total;
}
