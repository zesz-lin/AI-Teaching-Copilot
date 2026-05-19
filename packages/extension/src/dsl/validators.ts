// ============================================================
// DSL Version: 1.0.0 — Zod validators
// ============================================================

import { z } from "zod";

// ============================================================
// Shared sub-schemas
// ============================================================

const lineStyleSchema = z.object({
  thickness: z.number().min(1).max(13).optional(),
  dash: z.enum(["solid", "dashed", "dotted", "dashdot"]).optional(),
});

const actionMetaSchema = z.object({
  reason: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  label: z.string().optional(),
  optional: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

// ============================================================
// Geometry params schemas
// ============================================================

const functionPlotSchema = z.object({
  type: z.literal("FUNCTION_PLOT"),
  fn: z.string().min(1),
  variable: z.string().min(1),
  range: z.tuple([z.number(), z.number()]),
  label: z.string().optional(),
  style: lineStyleSchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const pointSchema = z.object({
  type: z.literal("POINT"),
  label: z.string().optional(),
  coords: z.tuple([z.number(), z.number()]).optional(),
  intersection: z.tuple([z.string(), z.string()]).optional(),
  onObject: z.string().optional(),
  param: z.number().optional(),
  expr: z.string().optional(),
  snap: z.enum(["none", "grid", "intersection"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  size: z.number().int().min(1).max(9).optional(),
}).refine(
  (p) => p.coords || p.intersection || p.onObject || Boolean(p.expr),
  { message: "POINT requires at least one of: coords, intersection, onObject, expr" }
);

const lineSchema = z.object({
  type: z.literal("LINE"),
  label: z.string().optional(),
  through: z.array(z.string()).min(1).optional(),
  slope: z.number().optional(),
  expr: z.string().optional(),
  relation: z.enum(["parallel", "perpendicular"]).optional(),
  target: z.string().optional(),
  tangent: z.object({ at: z.tuple([z.number(), z.number()]) }).optional(),
  style: lineStyleSchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const circleSchema = z.object({
  type: z.literal("CIRCLE"),
  label: z.string().optional(),
  center: z.string().optional(),
  radius: z.number().positive().optional(),
  throughPoint: z.string().optional(),
  diameter: z.tuple([z.string(), z.string()]).optional(),
  through: z.tuple([z.string(), z.string(), z.string()]).optional(),
  expr: z.string().optional(),
  style: lineStyleSchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fillColor: z.string().regex(/^#[0-9a-fA-F]{6,8}$/).optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
});

const polygonSchema = z.object({
  type: z.literal("POLYGON"),
  label: z.string().optional(),
  vertices: z.array(z.string()).min(3).optional(),
  coords: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  regular: z.object({
    n: z.number().int().min(3),
    center: z.string(),
    vertex: z.string(),
  }).optional(),
  fillColor: z.string().regex(/^#[0-9a-fA-F]{6,8}$/).optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  showEdges: z.boolean().optional(),
  edgeStyle: lineStyleSchema.optional(),
});

const sliderSchema = z.object({
  type: z.literal("SLIDER"),
  name: z.string().min(1),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  initial: z.number().optional(),
  unit: z.enum(["", "°", "rad"]).optional(),
  animate: z.boolean().optional(),
  speed: z.number().positive().optional(),
  direction: z.enum(["inc", "dec", "oscillate"]).optional(),
  width: z.number().positive().optional(),
  position: z.tuple([z.number(), z.number()]).optional(),
});

const deleteSchema = z.object({
  type: z.literal("DELETE"),
  labels: z.array(z.string()).min(1),
});

const clearSchema = z.object({
  type: z.literal("CLEAR"),
  scope: z.enum(["all", "selected"]),
  keep: z.array(z.string()).optional(),
});

// ============================================================
// Teaching params schemas
// ============================================================

const explainSchema = z.object({
  type: z.literal("EXPLAIN"),
  text: z.string().min(1),
  format: z.enum(["plain", "markdown", "latex"]).default("markdown"),
  tts: z.boolean().optional(),
  relatedObjects: z.array(z.string()).optional(),
  display: z.enum(["inline", "bubble", "callout"]).default("inline"),
  pointTo: z.union([
    z.tuple([z.number(), z.number()]),
    z.string(),
  ]).optional(),
});

const highlightSchema = z.object({
  type: z.literal("HIGHLIGHT"),
  targets: z.array(z.string()).min(1),
  effect: z.enum(["glow", "pulse", "color", "outline", "blink"]),
  duration: z.number().int().min(0).optional(),
  repeat: z.number().int().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  restore: z.boolean().optional(),
});

const focusViewSchema = z.object({
  type: z.literal("FOCUS_VIEW"),
  target: z.enum(["objects", "region", "reset", "zoom_in", "zoom_out"]),
  objects: z.array(z.string()).optional(),
  xRange: z.tuple([z.number(), z.number()]).optional(),
  yRange: z.tuple([z.number(), z.number()]).optional(),
  padding: z.number().min(0).max(1).optional(),
  animation: z.number().int().min(0).optional(),
});

const animateStepSchema = z.object({
  type: z.literal("ANIMATE_STEP"),
  animate: z.string().min(1),
  from: z.number().optional(),
  to: z.number().optional(),
  along: z.string().optional(),
  duration: z.number().int().positive(),
  easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]).default("ease-in-out"),
  play: z.boolean().default(false),
});

const pauseSchema = z.object({
  type: z.literal("PAUSE"),
  until: z.enum(["click", "duration", "object_click", "interaction", "ggb_ready"]),
  duration: z.number().int().positive().optional(),
  target: z.string().optional(),
  hint: z.string().optional(),
});

const askObservationSchema = z.object({
  type: z.literal("ASK_OBSERVATION"),
  question: z.string().min(1),
  answerType: z.enum(["text", "choice", "number", "coords"]),
  options: z.array(z.string()).optional(),
  hint: z.string().optional(),
  expectedAnswer: z.union([z.string(), z.number()]).optional(),
  required: z.boolean().default(true),
  storeKey: z.string().optional(),
});

const showRelationSchema = z.object({
  type: z.literal("SHOW_RELATION"),
  between: z.array(z.string()).min(1),
  relation: z.enum([
    "intersection", "parallel", "perpendicular", "tangent",
    "equal", "congruent", "similar", "midpoint", "bisector",
  ]),
  at: z.array(z.string()).optional(),
  measure: z.boolean().optional(),
  style: z.enum(["text", "icon", "both"]).default("both"),
  duration: z.number().int().min(0).optional(),
});

// ============================================================
// Discriminated unions
// ============================================================

const geometryParamsSchema = z.discriminatedUnion("type", [
  functionPlotSchema,
  pointSchema,
  lineSchema,
  circleSchema,
  polygonSchema,
  sliderSchema,
  deleteSchema,
  clearSchema,
]);

const teachingParamsSchema = z.discriminatedUnion("type", [
  explainSchema,
  highlightSchema,
  focusViewSchema,
  animateStepSchema,
  pauseSchema,
  askObservationSchema,
  showRelationSchema,
]);

const paramsSchema = z.union([geometryParamsSchema, teachingParamsSchema]);

// ============================================================
// Action schema
// ============================================================

export const actionSchema = z.object({
  version: z.literal("1.0.0"),
  id: z.string().min(1),
  type: z.string(),
  params: paramsSchema,
  meta: actionMetaSchema.optional(),
});

// ============================================================
// LessonPlan schema
// ============================================================

export const planMetaSchema = z.object({
  createdAt: z.string().datetime(),
  model: z.string(),
  promptSummary: z.string(),
  tokensUsed: z.number().int().positive().optional(),
});

export const lessonPlanSchema = z.object({
  version: z.literal("1.0.0"),
  planId: z.string(),
  topic: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedDuration: z.number().int().positive().optional(),
  steps: z.array(actionSchema),
  meta: planMetaSchema,
});

// ============================================================
// Inferred types (alternative to hand-written interfaces)
// ============================================================

export type ActionValidated = z.infer<typeof actionSchema>;
export type LessonPlanValidated = z.infer<typeof lessonPlanSchema>;

// ============================================================
// Convenience validators
// ============================================================

export function validateAction(raw: unknown): ActionValidated {
  return actionSchema.parse(raw);
}

export function validateActionSafe(raw: unknown): { success: true; data: ActionValidated } | { success: false; error: z.ZodError } {
  return actionSchema.safeParse(raw) as { success: true; data: ActionValidated } | { success: false; error: z.ZodError };
}

export function validateLessonPlan(raw: unknown): LessonPlanValidated {
  return lessonPlanSchema.parse(raw);
}

export function validateLessonPlanSafe(raw: unknown): { success: true; data: LessonPlanValidated } | { success: false; error: z.ZodError } {
  return lessonPlanSchema.safeParse(raw) as { success: true; data: LessonPlanValidated } | { success: false; error: z.ZodError };
}
