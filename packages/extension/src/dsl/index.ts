// ============================================================
// DSL barrel exports
// ============================================================

export type {
  // Envelope
  Action,
  ActionMeta,
  // Geometry
  GeometryActionType,
  LineStyle,
  FunctionPlotParams,
  PointParams,
  LineParams,
  CircleParams,
  PolygonParams,
  SliderParams,
  DeleteParams,
  ClearParams,
  GeometryParams,
  // Teaching
  TeachingActionType,
  ExplainParams,
  HighlightParams,
  FocusViewParams,
  AnimateStepParams,
  PauseParams,
  AskObservationParams,
  ShowRelationParams,
  TeachingParams,
  // Top-level
  AllParams,
  AllActionTypes,
  LessonPlan,
  PlanMeta,
  LessonState,
  StepState,
} from "./types";

export {
  actionSchema,
  lessonPlanSchema,
  planMetaSchema,
  validateAction,
  validateActionSafe,
  validateLessonPlan,
  validateLessonPlanSafe,
} from "./validators";
export type { ActionValidated, LessonPlanValidated } from "./validators";

export {
  actionJsonSchema,
  lessonPlanJsonSchema,
  ACTION_TYPE_DESCRIPTIONS,
} from "./schemas";
