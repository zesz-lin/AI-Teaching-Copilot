// ============================================================
// Object naming strategy — AI_ prefix, collision avoidance
// ============================================================

import type { GgbApplet, LabelTracker } from "./types";

// ============================================================
// Label resolver
// ============================================================

export class LabelResolver {
  private prefix: string;
  private tracker: LabelTracker;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.tracker = { active: new Set(), counter: 0 };
  }

  // ==========================================================
  // Label generation
  // ==========================================================

  /**
   * Resolve a label for an object.
   *
   * Priority:
   * 1. DSL-specified label → used as-is (no prefix — the AI
   *    coordinates labels across actions, so rewriting them
   *    would break cross-reference in expressions)
   * 2. Auto-generated → `AI_{type_char}{counter}` (e.g., AI_f1, AI_A3)
   */
  resolve(requested: string | undefined, typeHint: string): string {
    if (requested && isValidGgbLabel(requested)) {
      if (!this.tracker.active.has(requested)) {
        this.tracker.active.add(requested);
        return requested;
      }
      // Requested label taken → fall through to auto-generate
    }

    const label = this.generate(typeHint);
    this.tracker.active.add(label);
    return label;
  }

  /**
   * Allocate the next counter-based label for a type.
   */
  private generate(typeHint: string): string {
    const prefix = typeChar(typeHint);

    while (true) {
      this.tracker.counter++;
      const label = `${this.prefix}${prefix}${this.tracker.counter}`;
      if (!this.tracker.active.has(label)) {
        return label;
      }
    }
  }

  // ==========================================================
  // Lifecycle
  // ==========================================================

  /** Register an externally-created label */
  register(label: string): void {
    this.tracker.active.add(label);
  }

  /** Release a label (object deleted) */
  release(label: string): void {
    this.tracker.active.delete(label);
  }

  /** Check if a label is managed by this adapter */
  isManaged(label: string): boolean {
    return this.tracker.active.has(label) || label.startsWith(this.prefix);
  }

  /** Get all active AI_ labels */
  getActive(): string[] {
    return Array.from(this.tracker.active);
  }

  /** Get the current counter */
  getCounter(): number {
    return this.tracker.counter;
  }

  /** Export tracker state for snapshot */
  export(): { active: string[]; counter: number } {
    return { active: this.getActive(), counter: this.tracker.counter };
  }

  /** Import tracker state from snapshot */
  import(state: { active: string[]; counter: number }): void {
    this.tracker.active = new Set(state.active);
    this.tracker.counter = state.counter;
  }

  /** Reset all tracking */
  reset(): void {
    this.tracker.active.clear();
    this.tracker.counter = 0;
  }
}

// ============================================================
// Helpers
// ============================================================

function typeChar(actionType: string): string {
  switch (actionType) {
    case "FUNCTION_PLOT": return "f";
    case "POINT":         return "P";
    case "LINE":          return "l";
    case "CIRCLE":        return "c";
    case "POLYGON":       return "poly";
    case "SLIDER":        return "s";
    default:              return "o";
  }
}

/** Characters that are never valid in GeoGebra object names */
const INVALID_LABEL_RE = /[=()\[\]{}+\-*/^.,;:!@#$%&<>|"'`~\s]/;

function isValidGgbLabel(s: string): boolean {
  return s.length > 0 && !INVALID_LABEL_RE.test(s);
}
