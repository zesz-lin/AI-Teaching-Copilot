// ============================================================
// DSL Version: 1.0.0 — Type definitions
// ============================================================

// ============================================================
// Action envelope
// ============================================================

/** Top-level action — every instruction uses this envelope */
export interface Action {
  version: "1.0.0";
  id: string;
  type: GeometryActionType | TeachingActionType;
  params: GeometryParams | TeachingParams;
  meta?: ActionMeta;
}

export interface ActionMeta {
  reason?: string;
  dependsOn?: string[];
  label?: string;
  optional?: boolean;
  timeoutMs?: number;
}

// ============================================================
// Geometry DSL
// ============================================================

export type GeometryActionType =
  | "FUNCTION_PLOT"
  | "POINT"
  | "LINE"
  | "CIRCLE"
  | "POLYGON"
  | "SLIDER"
  | "DELETE"
  | "CLEAR";

export interface LineStyle {
  thickness?: number;
  dash?: "solid" | "dashed" | "dotted" | "dashdot";
}

// --- FUNCTION_PLOT ---

export interface FunctionPlotParams {
  type: "FUNCTION_PLOT";
  fn: string;
  variable: string;
  range: [number, number];
  label?: string;
  style?: LineStyle;
  color?: string;
}

// --- POINT ---

export interface PointParams {
  type: "POINT";
  label?: string;
  coords?: [number, number];
  intersection?: [string, string];
  onObject?: string;
  param?: number;
  expr?: string;
  snap?: "none" | "grid" | "intersection";
  color?: string;
  size?: number;
}

// --- LINE ---

export interface LineParams {
  type: "LINE";
  label?: string;
  through?: string[];
  slope?: number;
  expr?: string;
  relation?: "parallel" | "perpendicular";
  target?: string;
  tangent?: { at: [number, number] };
  style?: LineStyle;
  color?: string;
}

// --- CIRCLE ---

export interface CircleParams {
  type: "CIRCLE";
  label?: string;
  center?: string;
  radius?: number;
  throughPoint?: string;
  diameter?: [string, string];
  through?: [string, string, string];
  expr?: string;
  style?: LineStyle;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
}

// --- POLYGON ---

export interface PolygonParams {
  type: "POLYGON";
  label?: string;
  vertices?: string[];
  coords?: [number, number][];
  regular?: {
    n: number;
    center: string;
    vertex: string;
  };
  fillColor?: string;
  fillOpacity?: number;
  showEdges?: boolean;
  edgeStyle?: LineStyle;
}

// --- SLIDER ---

export interface SliderParams {
  type: "SLIDER";
  name: string;
  min: number;
  max: number;
  step: number;
  initial?: number;
  unit?: "" | "°" | "rad";
  animate?: boolean;
  speed?: number;
  direction?: "inc" | "dec" | "oscillate";
  width?: number;
  position?: [number, number];
}

// --- DELETE ---

export interface DeleteParams {
  type: "DELETE";
  labels: string[];
}

// --- CLEAR ---

export interface ClearParams {
  type: "CLEAR";
  scope: "all" | "selected";
  keep?: string[];
}

export type GeometryParams =
  | FunctionPlotParams
  | PointParams
  | LineParams
  | CircleParams
  | PolygonParams
  | SliderParams
  | DeleteParams
  | ClearParams;

// ============================================================
// Teaching DSL
// ============================================================

export type TeachingActionType =
  | "EXPLAIN"
  | "HIGHLIGHT"
  | "FOCUS_VIEW"
  | "ANIMATE_STEP"
  | "PAUSE"
  | "ASK_OBSERVATION"
  | "SHOW_RELATION";

// --- EXPLAIN ---

export interface ExplainParams {
  type: "EXPLAIN";
  text: string;
  format?: "plain" | "markdown" | "latex";
  tts?: boolean;
  relatedObjects?: string[];
  display?: "inline" | "bubble" | "callout";
  pointTo?: [number, number] | string;
}

// --- HIGHLIGHT ---

export interface HighlightParams {
  type: "HIGHLIGHT";
  targets: string[];
  effect: "glow" | "pulse" | "color" | "outline" | "blink";
  duration?: number;
  repeat?: number;
  color?: string;
  restore?: boolean;
}

// --- FOCUS_VIEW ---

export interface FocusViewParams {
  type: "FOCUS_VIEW";
  target: "objects" | "region" | "reset" | "zoom_in" | "zoom_out";
  objects?: string[];
  xRange?: [number, number];
  yRange?: [number, number];
  padding?: number;
  animation?: number;
}

// --- ANIMATE_STEP ---

export interface AnimateStepParams {
  type: "ANIMATE_STEP";
  animate: string;
  from?: number;
  to?: number;
  along?: string;
  duration: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  play?: boolean;
}

// --- PAUSE ---

export interface PauseParams {
  type: "PAUSE";
  until: "click" | "duration" | "object_click" | "interaction" | "ggb_ready";
  duration?: number;
  target?: string;
  hint?: string;
}

// --- ASK_OBSERVATION ---

export interface AskObservationParams {
  type: "ASK_OBSERVATION";
  question: string;
  answerType: "text" | "choice" | "number" | "coords";
  options?: string[];
  hint?: string;
  expectedAnswer?: string | number;
  required?: boolean;
  storeKey?: string;
}

// --- SHOW_RELATION ---

export interface ShowRelationParams {
  type: "SHOW_RELATION";
  between: string[];
  relation:
    | "intersection"
    | "parallel"
    | "perpendicular"
    | "tangent"
    | "equal"
    | "congruent"
    | "similar"
    | "midpoint"
    | "bisector";
  at?: string[];
  measure?: boolean;
  style?: "text" | "icon" | "both";
  duration?: number;
}

export type TeachingParams =
  | ExplainParams
  | HighlightParams
  | FocusViewParams
  | AnimateStepParams
  | PauseParams
  | AskObservationParams
  | ShowRelationParams;

// ============================================================
// All params union
// ============================================================

export type AllParams = GeometryParams | TeachingParams;
export type AllActionTypes = GeometryActionType | TeachingActionType;

// ============================================================
// Top-level structures
// ============================================================

export interface LessonPlan {
  version: "1.0.0";
  planId: string;
  topic: string;
  level: "beginner" | "intermediate" | "advanced";
  estimatedDuration?: number;
  steps: Action[];
  meta: PlanMeta;
}

export interface PlanMeta {
  createdAt: string;
  model: string;
  promptSummary: string;
  tokensUsed?: number;
}

export interface LessonState {
  planId: string;
  version: "1.0.0";
  currentStep: number;
  stepStates: StepState[];
  collectedAnswers: Record<string, string | number>;
  createdObjects: string[];
  paused: boolean;
  pauseCondition?: PauseParams["until"];
}

export interface StepState {
  actionId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  error?: string;
  startedAt?: string;
  completedAt?: string;
}
