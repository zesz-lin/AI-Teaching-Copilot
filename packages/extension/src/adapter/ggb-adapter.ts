// ============================================================
// GeoGebra Adapter — main class
// ============================================================
//
// Wraps ggbApplet. Converts DSL actions → GeoGebra API calls.
// Implements ActionExecutor + InverseExecutor for the engine.

import type { Action } from "../dsl/types";
import type { GgbState, GgbObjectBrief } from "../shared/types";
import type {
  GgbApplet,
  GgbAdapterConfig,
  CommandResult,
  BatchResult,
  AdapterSnapshot,
} from "./types";
import { DEFAULT_ADAPTER_CONFIG } from "./types";
import { LabelResolver } from "./naming";
import { buildCommand } from "./command-builder";
import type { InverseAction, ActionSnapshot } from "../engine/types";

// ============================================================
// GgbAdapter
// ============================================================

export class GgbAdapter {
  private applet: GgbApplet;
  private config: GgbAdapterConfig;
  private resolver: LabelResolver;

  // Track labels per-action for undo
  private actionLabels: Map<string, string[]> = new Map();

  constructor(applet: GgbApplet, config: Partial<GgbAdapterConfig> = {}) {
    this.applet = applet;
    this.config = { ...DEFAULT_ADAPTER_CONFIG, ...config };
    this.resolver = new LabelResolver(this.config.prefix);
  }

  // ==========================================================
  // Command execution
  // ==========================================================

  /**
   * Execute a single DSL geometry action.
   * Returns labels created/deleted for transaction tracking.
   */
  execute(action: Action): { createdLabels: string[]; deletedLabels: string[] } {
    this.assertValid(action);

    const buildResult = buildCommand(
      action.type as "FUNCTION_PLOT" | "POINT" | "LINE" | "CIRCLE" | "POLYGON" | "SLIDER" | "DELETE" | "CLEAR",
      action.params as unknown as Record<string, unknown>,
      this.resolver
    );

    const created: string[] = [];
    const deleted: string[] = [];

    for (const cmd of buildResult.commands) {
      try {
        this.applet.evalCommand(cmd.expr);

        if (buildResult.labels.length > 0 && cmd === buildResult.commands[0]) {
          // First command is the creation — track labels
          created.push(...buildResult.labels);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`evalCommand("${cmd.expr}") failed: ${msg}`);
      }
    }

    // Track labels per action for rollback
    this.actionLabels.set(action.id, buildResult.labels);

    return { createdLabels: created, deletedLabels: [] };
  }

  /**
   * Execute a batch of actions sequentially.
   */
  executeBatch(actions: Action[]): BatchResult {
    const results: CommandResult[] = [];
    let allSucceeded = true;
    const createdLabels: string[] = [];
    const deletedLabels: string[] = [];

    for (const action of actions) {
      try {
        const { createdLabels: c, deletedLabels: d } = this.execute(action);
        createdLabels.push(...c);
        deletedLabels.push(...d);
        results.push({
          command: action.type,
          success: true,
          createdLabels: c,
          deletedLabels: d,
        });
      } catch (err) {
        allSucceeded = false;
        results.push({
          command: action.type,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          createdLabels: [],
          deletedLabels: [],
        });
      }
    }

    return { results, allSucceeded, createdLabels, deletedLabels };
  }

  // ==========================================================
  // Animation
  // ==========================================================

  /** Animate a slider to a target value */
  animate(label: string, to: number): void {
    this.applet.setValue(label, to);
  }

  /** Move a point to new coordinates */
  movePoint(label: string, x: number, y: number): void {
    this.applet.setCoords(label, x, y);
  }

  /** Start animation on a slider */
  startAnimation(label: string): void {
    this.applet.evalCommand(`StartAnimation(${label})`);
  }

  /** Stop animation on a slider */
  stopAnimation(label: string): void {
    this.applet.evalCommand(`StartAnimation(${label}, false)`);
  }

  // ==========================================================
  // State query
  // ==========================================================

  /** Get current GeoGebra state */
  getState(): GgbState {
    const names = this.getAllObjectNamesSafe();
    const objects: GgbObjectBrief[] = [];

    for (const label of names) {
      try {
        objects.push({
          label,
          type: this.applet.getObjectType(label),
          defined: this.applet.isDefined(label),
        });
      } catch {
        // Object may have been deleted between getAllObjectNames and getObjectType
      }
    }

    return {
      appletReady: true,
      objectCount: objects.length,
      objects,
      mode: 0, // not available via constrained API
      perspective: "",
    };
  }

  /** Get only AI-managed objects */
  getAiObjects(): GgbObjectBrief[] {
    const state = this.getState();
    return state.objects.filter((o) => this.resolver.isManaged(o.label));
  }

  /** Get all active AI_ labels */
  getAiLabels(): string[] {
    return this.resolver.getActive();
  }

  /** Check if the applet is available */
  isReady(): boolean {
    try {
      this.applet.getAllObjectNames();
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================
  // Snapshot / Restore
  // ==========================================================

  /** Take a full snapshot of current state */
  snapshot(): AdapterSnapshot {
    const ggbState = this.getState();
    return {
      ggbState,
      aiObjects: ggbState.objects.filter((o) => this.resolver.isManaged(o.label)),
      userObjects: ggbState.objects.filter((o) => !this.resolver.isManaged(o.label)),
      tracker: this.resolver.export(),
    };
  }

  /** Restore tracked state from snapshot */
  restoreTracking(snapshot: AdapterSnapshot): void {
    this.resolver.import(snapshot.tracker);
  }

  // ==========================================================
  // Clear / Reset
  // ==========================================================

  /** Delete all AI_ objects */
  clearAiObjects(): string[] {
    const labels = this.resolver.getActive();
    for (const label of labels) {
      try {
        this.applet.deleteObject(label);
        this.resolver.release(label);
      } catch {
        // Object may already be gone
      }
    }
    return labels;
  }

  /** Delete all objects on the canvas */
  clearAll(): void {
    try {
      this.applet.evalCommand("Delete(All)");
    } catch {
      // Fallback: delete individually
      const names = this.getAllObjectNamesSafe();
      for (const label of names) {
        try { this.applet.deleteObject(label); } catch { /* skip */ }
      }
    }
    this.resolver.reset();
  }

  /** Full reset */
  reset(): void {
    this.clearAll();
    this.resolver.reset();
    this.actionLabels.clear();
  }

  // ==========================================================
  // Engine integration: ActionExecutor
  // ==========================================================

  /** Engine-compatible execute */
  async executeAction(action: Action): Promise<{ createdLabels: string[]; deletedLabels: string[] }> {
    return this.execute(action);
  }

  /** Engine-compatible snapshot */
  async takeSnapshot(_labels?: string[]): Promise<ActionSnapshot> {
    const snap = this.snapshot();
    return {
      actionId: "",
      existingLabels: snap.ggbState.objects.map((o) => o.label),
      state: snap as unknown as Record<string, unknown>,
      capturedAt: new Date().toISOString(),
    };
  }

  /** Engine-compatible restore */
  async restoreSnapshot(snapshot: ActionSnapshot): Promise<void> {
    // Restore by recreating objects from snapshot
    const snap = snapshot.state as unknown as AdapterSnapshot;
    // Delete current AI_ objects
    this.clearAiObjects();
    // Recreate from snapshot data (best-effort)
    // In practice, this requires saving the creation commands in the snapshot
    this.restoreTracking(snap);
  }

  /** Engine-compatible inverse execution */
  async executeInverse(inverse: InverseAction): Promise<void> {
    switch (inverse.type) {
      case "DELETE_OBJECT": {
        if (inverse.labels) {
          for (const label of inverse.labels) {
            try { this.applet.deleteObject(label); } catch { /* skip */ }
            this.resolver.release(label);
          }
        }
        break;
      }
      case "RESTORE_SNAPSHOT": {
        if (inverse.snapshot) {
          await this.restoreSnapshot(inverse.snapshot);
        }
        break;
      }
      case "RESTORE_STYLE":
      case "REMOVE_UI":
      case "NOOP":
      case "RESET_VIEW":
        // Non-geometry inverses — handled by higher layers
        break;
    }
  }

  // ==========================================================
  // Error handling
  // ==========================================================

  /**
   * Error classification for recovery strategies.
   */
  classifyError(error: Error): "retryable" | "fatal" | "invalid" {
    const msg = error.message;
    if (msg.includes("not defined") || msg.includes("undefined")) {
      return "retryable"; // Object may not exist yet
    }
    if (msg.includes("invalid") || msg.includes("parse")) {
      return "invalid"; // Bad command — don't retry
    }
    if (msg.includes("timeout")) {
      return "retryable";
    }
    return "fatal";
  }

  // ==========================================================
  // Internal
  // ==========================================================

  private assertValid(action: Action): void {
    const validTypes = [
      "FUNCTION_PLOT", "POINT", "LINE", "CIRCLE",
      "POLYGON", "SLIDER", "DELETE", "CLEAR",
    ];
    if (!validTypes.includes(action.type)) {
      throw new Error(`GgbAdapter cannot execute type: ${action.type}`);
    }
  }

  private getAllObjectNamesSafe(): string[] {
    try {
      return this.applet.getAllObjectNames();
    } catch {
      return [];
    }
  }
}
