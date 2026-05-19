// ============================================================
// Adapter barrel exports
// ============================================================

export { GgbAdapter } from "./ggb-adapter";
export { LabelResolver } from "./naming";
export {
  buildCommand,
  buildFunctionPlot,
  buildPoint,
  buildLine,
  buildCircle,
  buildPolygon,
  buildSlider,
  buildDelete,
  buildClear,
} from "./command-builder";
export type { BuildResult } from "./command-builder";
export { DEFAULT_ADAPTER_CONFIG } from "./types";
export type {
  GgbAdapterConfig,
  GgbApplet,
  CommandResult,
  BatchResult,
  AdapterSnapshot,
  LabelTracker,
} from "./types";
