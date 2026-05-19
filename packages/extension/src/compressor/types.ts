// ============================================================
// GeoGebra State Compressor — Type definitions
// ============================================================

import type { GgbState, GgbObjectBrief } from "../shared/types";

// ============================================================
// Compressed output (AI-facing)
// ============================================================
//
// This is the compact summary sent to the AI as context.
// Target: ~500 tokens for a typical GeoGebra construction.

export interface CompressedState {
  /** The high-level topic being taught */
  current_topic: string;

  /** Key objects needed to understand the current construction */
  important_objects: ImportantObject[];

  /** The last N meaningful changes (newest first), compact strings */
  recent_actions: string[];

  /** What the current step is trying to achieve */
  teaching_goal: string;
}

// ============================================================
// Important object (compact representation)
// ============================================================

export interface ImportantObject {
  /** Object label */
  label: string;
  /** GeoGebra object type */
  type: string;
  /** Compact human-readable description (1 line) */
  description: string;
  /** Role in the teaching context */
  role: ObjectRole;
  /** Priority for inclusion (higher = keep first when budget tight) */
  priority: number;
}

// ============================================================
// Object role classification
// ============================================================

export type ObjectRole =
  | "target"        // The main focus of teaching
  | "vertex"        // Vertex of a function/polygon
  | "intersection"  // Intersection point
  | "center"        // Center of a circle
  | "parameter"     // Slider / adjustable parameter
  | "construction"  // Scaffolding for building other objects
  | "annotation"    // Text label / explanation
  | "auxiliary";    // Helper object, discardable

// ============================================================
// Compressor input
// ============================================================

export interface CompressorInput {
  /** Current GeoGebra state */
  state: GgbState;
  /** Teaching topic hint (from session context) */
  topic?: string;
  /** Teaching goal hint (from current step) */
  goal?: string;
  /** AI-created object labels (from adapter, for priority boost) */
  aiLabels?: Set<string> | string[];
  /** Recent action descriptions (from engine log) */
  recentActions?: string[];
}

// ============================================================
// Compressor configuration
// ============================================================

export interface CompressorConfig {
  /** Approximate max token budget for compressed output */
  maxTokens: number;
  /** Max number of important objects to include */
  maxObjects: number;
  /** Max number of recent actions to include */
  maxActions: number;
  /** Max description length per object */
  maxDescLength: number;
  /** Whether to include auxiliary objects when budget allows */
  includeAuxiliary: boolean;
}

export const DEFAULT_COMPRESSOR_CONFIG: CompressorConfig = {
  maxTokens: 500,
  maxObjects: 15,
  maxActions: 8,
  maxDescLength: 80,
  includeAuxiliary: false,
};
