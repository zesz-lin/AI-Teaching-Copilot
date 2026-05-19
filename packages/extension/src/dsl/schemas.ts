// ============================================================
// DSL Version: 1.0.0 — JSON Schema (Draft 2020-12)
// ============================================================
//
// These are plain JS objects that can be exported as JSON Schema
// for tool use, API docs, or external consumption.

type Schema = Record<string, unknown>;

// ============================================================
// Shared definitions
// ============================================================

const lineStyleDef: Schema = {
  type: "object",
  properties: {
    thickness: { type: "integer", minimum: 1, maximum: 13 },
    dash: { enum: ["solid", "dashed", "dotted", "dashdot"] },
  },
};

const actionMetaDef: Schema = {
  type: "object",
  properties: {
    reason: { type: "string" },
    dependsOn: { type: "array", items: { type: "string" } },
    label: { type: "string" },
    optional: { type: "boolean" },
    timeoutMs: { type: "integer", minimum: 0 },
  },
};

// ============================================================
// Geometry param definitions
// ============================================================

const functionPlotDef: Schema = {
  type: "object",
  required: ["type", "fn", "variable", "range"],
  properties: {
    type: { const: "FUNCTION_PLOT" },
    fn: { type: "string", minLength: 1 },
    variable: { type: "string", minLength: 1 },
    range: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
    label: { type: "string" },
    style: lineStyleDef,
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
  },
};

const pointDef: Schema = {
  type: "object",
  required: ["type"],
  properties: {
    type: { const: "POINT" },
    label: { type: "string" },
    coords: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
    intersection: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
    onObject: { type: "string" },
    param: { type: "number" },
    expr: { type: "string" },
    snap: { enum: ["none", "grid", "intersection"] },
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    size: { type: "integer", minimum: 1, maximum: 9 },
  },
};

const lineDef: Schema = {
  type: "object",
  required: ["type"],
  properties: {
    type: { const: "LINE" },
    label: { type: "string" },
    through: { type: "array", items: { type: "string" }, minItems: 1 },
    slope: { type: "number" },
    expr: { type: "string" },
    relation: { enum: ["parallel", "perpendicular"] },
    target: { type: "string" },
    tangent: {
      type: "object",
      properties: { at: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } },
      required: ["at"],
    },
    style: lineStyleDef,
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
  },
};

const circleDef: Schema = {
  type: "object",
  required: ["type"],
  properties: {
    type: { const: "CIRCLE" },
    label: { type: "string" },
    center: { type: "string" },
    radius: { type: "number", minimum: 0, exclusiveMinimum: true },
    throughPoint: { type: "string" },
    diameter: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
    through: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
    expr: { type: "string" },
    style: lineStyleDef,
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    fillColor: { type: "string", pattern: "^#[0-9a-fA-F]{6,8}$" },
    fillOpacity: { type: "number", minimum: 0, maximum: 1 },
  },
};

const polygonDef: Schema = {
  type: "object",
  required: ["type"],
  properties: {
    type: { const: "POLYGON" },
    label: { type: "string" },
    vertices: { type: "array", items: { type: "string" }, minItems: 3 },
    coords: { type: "array", items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } }, minItems: 3 },
    regular: {
      type: "object",
      required: ["n", "center", "vertex"],
      properties: {
        n: { type: "integer", minimum: 3 },
        center: { type: "string" },
        vertex: { type: "string" },
      },
    },
    fillColor: { type: "string", pattern: "^#[0-9a-fA-F]{6,8}$" },
    fillOpacity: { type: "number", minimum: 0, maximum: 1 },
    showEdges: { type: "boolean" },
    edgeStyle: lineStyleDef,
  },
};

const sliderDef: Schema = {
  type: "object",
  required: ["type", "name", "min", "max", "step"],
  properties: {
    type: { const: "SLIDER" },
    name: { type: "string", minLength: 1 },
    min: { type: "number" },
    max: { type: "number" },
    step: { type: "number", minimum: 0, exclusiveMinimum: true },
    initial: { type: "number" },
    unit: { enum: ["", "°", "rad"] },
    animate: { type: "boolean" },
    speed: { type: "number", minimum: 0, exclusiveMinimum: true },
    direction: { enum: ["inc", "dec", "oscillate"] },
    width: { type: "number", minimum: 0, exclusiveMinimum: true },
    position: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
  },
};

const deleteDef: Schema = {
  type: "object",
  required: ["type", "labels"],
  properties: {
    type: { const: "DELETE" },
    labels: { type: "array", items: { type: "string" }, minItems: 1 },
  },
};

const clearDef: Schema = {
  type: "object",
  required: ["type", "scope"],
  properties: {
    type: { const: "CLEAR" },
    scope: { enum: ["all", "selected"] },
    keep: { type: "array", items: { type: "string" } },
  },
};

// ============================================================
// Teaching param definitions
// ============================================================

const explainDef: Schema = {
  type: "object",
  required: ["type", "text"],
  properties: {
    type: { const: "EXPLAIN" },
    text: { type: "string", minLength: 1 },
    format: { enum: ["plain", "markdown", "latex"], default: "markdown" },
    tts: { type: "boolean" },
    relatedObjects: { type: "array", items: { type: "string" } },
    display: { enum: ["inline", "bubble", "callout"], default: "inline" },
    pointTo: {
      oneOf: [
        { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
        { type: "string" },
      ],
    },
  },
};

const highlightDef: Schema = {
  type: "object",
  required: ["type", "targets", "effect"],
  properties: {
    type: { const: "HIGHLIGHT" },
    targets: { type: "array", items: { type: "string" }, minItems: 1 },
    effect: { enum: ["glow", "pulse", "color", "outline", "blink"] },
    duration: { type: "integer", minimum: 0 },
    repeat: { type: "integer", minimum: 1 },
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    restore: { type: "boolean" },
  },
};

const focusViewDef: Schema = {
  type: "object",
  required: ["type", "target"],
  properties: {
    type: { const: "FOCUS_VIEW" },
    target: { enum: ["objects", "region", "reset", "zoom_in", "zoom_out"] },
    objects: { type: "array", items: { type: "string" } },
    xRange: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
    yRange: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
    padding: { type: "number", minimum: 0, maximum: 1 },
    animation: { type: "integer", minimum: 0 },
  },
};

const animateStepDef: Schema = {
  type: "object",
  required: ["type", "animate", "duration"],
  properties: {
    type: { const: "ANIMATE_STEP" },
    animate: { type: "string", minLength: 1 },
    from: { type: "number" },
    to: { type: "number" },
    along: { type: "string" },
    duration: { type: "integer", minimum: 0, exclusiveMinimum: true },
    easing: { enum: ["linear", "ease-in", "ease-out", "ease-in-out"], default: "ease-in-out" },
    play: { type: "boolean", default: false },
  },
};

const pauseDef: Schema = {
  type: "object",
  required: ["type", "until"],
  properties: {
    type: { const: "PAUSE" },
    until: { enum: ["click", "duration", "object_click", "interaction", "ggb_ready"] },
    duration: { type: "integer", minimum: 0, exclusiveMinimum: true },
    target: { type: "string" },
    hint: { type: "string" },
  },
};

const askObservationDef: Schema = {
  type: "object",
  required: ["type", "question", "answerType"],
  properties: {
    type: { const: "ASK_OBSERVATION" },
    question: { type: "string", minLength: 1 },
    answerType: { enum: ["text", "choice", "number", "coords"] },
    options: { type: "array", items: { type: "string" } },
    hint: { type: "string" },
    expectedAnswer: {
      oneOf: [{ type: "string" }, { type: "number" }],
    },
    required: { type: "boolean", default: true },
    storeKey: { type: "string" },
  },
};

const showRelationDef: Schema = {
  type: "object",
  required: ["type", "between", "relation"],
  properties: {
    type: { const: "SHOW_RELATION" },
    between: { type: "array", items: { type: "string" }, minItems: 1 },
    relation: {
      enum: [
        "intersection", "parallel", "perpendicular", "tangent",
        "equal", "congruent", "similar", "midpoint", "bisector",
      ],
    },
    at: { type: "array", items: { type: "string" } },
    measure: { type: "boolean" },
    style: { enum: ["text", "icon", "both"], default: "both" },
    duration: { type: "integer", minimum: 0 },
  },
};

// ============================================================
// Combined params
// ============================================================

const allParamsDefs = [
  functionPlotDef, pointDef, lineDef, circleDef, polygonDef,
  sliderDef, deleteDef, clearDef,
  explainDef, highlightDef, focusViewDef, animateStepDef,
  pauseDef, askObservationDef, showRelationDef,
];

// ============================================================
// Action schema
// ============================================================

export const actionJsonSchema: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://geogebra-copilot.dev/dsl/v1.0.0/action.json",
  title: "GeoGebra AI Teaching Copilot Action DSL",
  description: "Version 1.0.0 — Unified action schema for Geometry + Teaching DSL",
  type: "object",
  required: ["version", "id", "type", "params"],
  properties: {
    version: { const: "1.0.0" },
    id: { type: "string" },
    type: {
      enum: [
        "FUNCTION_PLOT", "POINT", "LINE", "CIRCLE", "POLYGON",
        "SLIDER", "DELETE", "CLEAR",
        "EXPLAIN", "HIGHLIGHT", "FOCUS_VIEW", "ANIMATE_STEP",
        "PAUSE", "ASK_OBSERVATION", "SHOW_RELATION",
      ],
    },
    params: { oneOf: allParamsDefs },
    meta: actionMetaDef,
  },
};

// ============================================================
// LessonPlan schema
// ============================================================

export const lessonPlanJsonSchema: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://geogebra-copilot.dev/dsl/v1.0.0/lesson-plan.json",
  title: "GeoGebra AI Teaching Copilot Lesson Plan",
  description: "Version 1.0.0 — A complete lesson plan as a sequence of actions",
  type: "object",
  required: ["version", "planId", "topic", "level", "steps", "meta"],
  properties: {
    version: { const: "1.0.0" },
    planId: { type: "string" },
    topic: { type: "string" },
    level: { enum: ["beginner", "intermediate", "advanced"] },
    estimatedDuration: { type: "integer", minimum: 0 },
    steps: { type: "array", items: actionJsonSchema },
    meta: {
      type: "object",
      required: ["createdAt", "model", "promptSummary"],
      properties: {
        createdAt: { type: "string", format: "date-time" },
        model: { type: "string" },
        promptSummary: { type: "string" },
        tokensUsed: { type: "integer", minimum: 0 },
      },
    },
  },
};

// ============================================================
// All action types summary (for AI tool-use description)
// ============================================================

export const ACTION_TYPE_DESCRIPTIONS: Record<string, string> = {
  FUNCTION_PLOT: "Plot a function, e.g., sin(x), x^2",
  POINT:       "Create a point by coordinates, intersection, or expression",
  LINE:        "Create a line by two points, point-slope, or expression",
  CIRCLE:      "Create a circle by center-radius, diameter, or three points",
  POLYGON:     "Create a polygon by vertex list or regular polygon spec",
  SLIDER:      "Create a numeric slider with optional animation",
  DELETE:      "Delete specified objects by label",
  CLEAR:       "Clear all or selected objects from the canvas",
  EXPLAIN:     "Display an explanation block in the side panel",
  HIGHLIGHT:   "Visually highlight objects on the canvas",
  FOCUS_VIEW:  "Pan/zoom the canvas to a region or set of objects",
  ANIMATE_STEP: "Animate a slider or point along a path",
  PAUSE:       "Pause execution until user interaction or timeout",
  ASK_OBSERVATION: "Ask the student a question and collect their answer",
  SHOW_RELATION: "Display a mathematical relationship between objects",
};
