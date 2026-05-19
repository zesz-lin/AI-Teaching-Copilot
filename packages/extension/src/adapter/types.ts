// ============================================================
// GeoGebra Adapter — Type definitions
// ============================================================

import type { GgbState, GgbObjectBrief } from "../shared/types";

// ============================================================
// Adapter configuration
// ============================================================

export interface GgbAdapterConfig {
  /** Prefix for all AI-created object labels */
  prefix: string;
  /** Default command timeout (ms) */
  timeout: number;
  /** Whether to verify object creation */
  verifyCreation: boolean;
}

export const DEFAULT_ADAPTER_CONFIG: GgbAdapterConfig = {
  prefix: "AI_",
  timeout: 5_000,
  verifyCreation: true,
};

// ============================================================
// Command result
// ============================================================

export interface CommandResult {
  /** The raw GgbCommand expression */
  command: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Labels created by this command */
  createdLabels: string[];
  /** Labels deleted by this command */
  deletedLabels: string[];
}

// ============================================================
// Batch execution result
// ============================================================

export interface BatchResult {
  /** Individual command results */
  results: CommandResult[];
  /** Whether ALL commands succeeded */
  allSucceeded: boolean;
  /** Aggregate created labels */
  createdLabels: string[];
  /** Aggregate deleted labels */
  deletedLabels: string[];
}

// ============================================================
// Label tracker
// ============================================================

export interface LabelTracker {
  /** All labels currently created by the adapter */
  active: Set<string>;
  /** Auto-increment counter for unnamed objects */
  counter: number;
}

// ============================================================
// Adapter state snapshot
// ============================================================

export interface AdapterSnapshot {
  /** Complete GgbState from applet */
  ggbState: GgbState;
  /** AI_ objects only */
  aiObjects: GgbObjectBrief[];
  /** User/native objects */
  userObjects: GgbObjectBrief[];
  /** Tracker state at snapshot time */
  tracker: { active: string[]; counter: number };
}

// ============================================================
// GgbApplet interface (minimal surface)
// ============================================================

export interface GgbApplet {
  evalCommand(cmd: string): void;
  getAllObjectNames(): string[];
  getObjectType(label: string): string;
  getObjectNumber(): number;
  getValueString(label: string): string;
  setValue(label: string, value: number): void;
  setCoords(label: string, x: number, y: number): void;
  exists(label: string): boolean;
  isDefined(label: string): boolean;
  deleteObject(label: string): void;
}
