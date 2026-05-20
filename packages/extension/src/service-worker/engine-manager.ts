// ============================================================
// SW Engine Manager — bridges Engine ↔ Bridge ↔ Sidepanel
// ============================================================
//
// One EngineSession per tab. The SwActionExecutor routes:
//   Geometry actions → EXEC_GGB to Bridge (via CS)
//   Teaching actions → events to Sidepanel
//   ASK_OBSERVATION → pauses until student answers
//
// Engine state is persisted to chrome.storage.session so it
// survives SW restarts (inactivity-kill, crash, update).

import { ExecutionEngine, type SerializedEngine } from "../engine/engine";
import type { ActionExecutor } from "../engine/transaction";
import type { ActionSnapshot, InverseAction } from "../engine/types";
import type { Action, LessonPlan } from "../dsl/types";
import type { AppMessage } from "../shared/messages";
import { buildRequest, buildResponse, buildEvent } from "../shared/messages";
import type { GgbCommand } from "../shared/types";
import { LabelResolver } from "../adapter/naming";
import { buildCommand } from "../adapter/command-builder";

// ============================================================
// Persistence keys
// ============================================================

const PERSIST_PREFIX = "engine_session_";

function persistKey(tabId: number): string {
  return `${PERSIST_PREFIX}${tabId}`;
}

// ============================================================
// Pending answer (for ASK_OBSERVATION flow)
// ============================================================

interface PendingAnswer {
  resolve: (result: { createdLabels: string[]; deletedLabels: string[] }) => void;
  reject: (err: Error) => void;
  /** For event-driven pauses: the condition to match */
  eventCondition?: PauseEventCondition;
}

interface PauseEventCondition {
  until: string;
  target?: string;
}

// ============================================================
// SW Action Executor
// ============================================================

class SwActionExecutor implements ActionExecutor {
  constructor(
    private tabId: number,
    public port: chrome.runtime.Port | null,
    private pendingAnswers: Map<string, PendingAnswer>
  ) {}

  // ── Main execute ──────────────────────────────────────────

  async execute(action: Action): Promise<{ createdLabels: string[]; deletedLabels: string[] }> {
    switch (action.type) {
      case "FUNCTION_PLOT":
      case "POINT":
      case "LINE":
      case "CIRCLE":
      case "POLYGON":
      case "SLIDER":
      case "DELETE":
      case "CLEAR":
        return this.executeGeometry(action);

      case "EXPLAIN":
        return this.executeExplain(action);

      case "ASK_OBSERVATION":
        return this.executeAskObservation(action);

      case "PAUSE":
        return this.executePause(action);

      case "HIGHLIGHT":
      case "FOCUS_VIEW":
      case "ANIMATE_STEP":
      case "SHOW_RELATION":
        // Teaching commands that affect the canvas — sent as events for now
        return this.executeTeachingCommand(action);

      default:
        throw new Error(`SwActionExecutor: unknown action type ${action.type}`);
    }
  }

  // ── Geometry ──────────────────────────────────────────────

  private async executeGeometry(
    action: Action
  ): Promise<{ createdLabels: string[]; deletedLabels: string[] }> {
    const resolver = new LabelResolver("AI_");
    const buildResult = buildCommand(
      action.type as "FUNCTION_PLOT" | "POINT" | "LINE" | "CIRCLE" | "POLYGON" | "SLIDER" | "DELETE" | "CLEAR",
      action.params as unknown as Record<string, unknown>,
      resolver
    );

    const requestMsg = buildRequest("sw", "bridge", {
      type: "EXEC_GGB",
      commands: buildResult.commands.map((c) => ({
        expr: c.expr,
        timeout: c.timeout,
        silent: c.silent,
      })),
    });

    let response: any;
    try {
      response = await chrome.tabs.sendMessage(this.tabId, requestMsg);
    } catch {
      throw new Error(
        `无法连接到 GeoGebra 标签页 (tab ${this.tabId})。请确认你正在 *.geogebra.org 页面上，且页面已完全加载。`
      );
    }
    const payload = response.payload;

    if (payload.type === "EXEC_RESULT") {
      const hasError = payload.results.some((r: { status: string }) => r.status === "error");
      if (hasError) {
        const errMsg = payload.results
          .filter((r: { status: string; error?: string }) => r.status === "error")
          .map((r: { error?: string }) => r.error ?? "unknown")
          .join("; ");
        throw new Error(`GeoGebra命令执行失败: ${errMsg}`);
      }

      return {
        createdLabels: buildResult.labels,
        deletedLabels: [],
      };
    }

    if (payload.type === "ERROR") {
      throw new Error(`Bridge error: ${payload.detail}`);
    }

    return { createdLabels: buildResult.labels, deletedLabels: [] };
  }

  // ── EXPLAIN ───────────────────────────────────────────────

  private executeExplain(action: Action): { createdLabels: string[]; deletedLabels: string[] } {
    const params = action.params as { type: string; text: string };
    this.postEvent({
      type: "SHOW_EXPLAIN",
      actionId: action.id,
      text: params.text,
    });
    return { createdLabels: [], deletedLabels: [] };
  }

  // ── ASK_OBSERVATION ───────────────────────────────────────

  private executeAskObservation(
    action: Action
  ): Promise<{ createdLabels: string[]; deletedLabels: string[] }> {
    const params = action.params as {
      type: string;
      question: string;
      answerType: string;
      options?: string[];
    };

    return new Promise((resolve, reject) => {
      this.pendingAnswers.set(action.id, { resolve, reject });

      this.postEvent({
        type: "SHOW_QUESTION",
        actionId: action.id,
        question: params.question,
        answerType: params.answerType,
        options: params.options,
      });
    });
  }

  // ── PAUSE ─────────────────────────────────────────────────

  private executePause(action: Action): Promise<{ createdLabels: string[]; deletedLabels: string[] }> {
    const params = action.params as {
      type: string;
      until: string;
      duration?: number;
      target?: string;
    };

    if (params.until === "duration" && params.duration) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ createdLabels: [], deletedLabels: [] });
        }, params.duration);
      });
    }

    return new Promise((resolve, reject) => {
      this.pendingAnswers.set(action.id, {
        resolve,
        reject,
        eventCondition: {
          until: params.until,
          target: params.target,
        },
      });
    });
  }

  // ── Other teaching commands ───────────────────────────────

  private executeTeachingCommand(
    _action: Action
  ): { createdLabels: string[]; deletedLabels: string[] } {
    return { createdLabels: [], deletedLabels: [] };
  }

  // ── Snapshot / Restore / Inverse (delegated to Bridge) ────

  async snapshot(labels?: string[]): Promise<ActionSnapshot> {
    try {
      const requestMsg = buildRequest("sw", "bridge", {
        type: "GET_STATE",
        query: "object_list",
      });
      const response = await chrome.tabs.sendMessage(this.tabId, requestMsg);
      return {
        actionId: "",
        existingLabels: labels ?? [],
        state: (response.payload as Record<string, unknown>) ?? {},
        capturedAt: new Date().toISOString(),
      };
    } catch {
      return { actionId: "", existingLabels: labels ?? [], state: {}, capturedAt: new Date().toISOString() };
    }
  }

  async restoreSnapshot(_snapshot: ActionSnapshot): Promise<void> {
    // For P0, restore = clear and let rebuild happen
  }

  async executeInverse(inverse: InverseAction): Promise<void> {
    if (inverse.type === "DELETE_OBJECT" && inverse.labels?.length) {
      try {
        const commands: GgbCommand[] = inverse.labels.map((label) => ({
          expr: `Delete(${label})`,
        }));
        const requestMsg = buildRequest("sw", "bridge", {
          type: "EXEC_GGB",
          commands,
        });
        await chrome.tabs.sendMessage(this.tabId, requestMsg);
      } catch { /* best-effort */ }
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private postEvent(payload: Record<string, unknown>): void {
    if (!this.port) return;
    const event = buildEvent("sw", "sidepanel", payload as any);
    this.port.postMessage(event);
  }
}

// ============================================================
// Engine Session (per tab)
// ============================================================

export class EngineSession {
  engine: ExecutionEngine;
  executor: SwActionExecutor;
  pendingAnswers: Map<string, PendingAnswer>;
  readonly tabId: number;
  private onEvent: (event: Record<string, unknown>) => void;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    tabId: number,
    port: chrome.runtime.Port | null,
    onEvent: (event: Record<string, unknown>) => void
  ) {
    this.tabId = tabId;
    this.onEvent = onEvent;
    this.pendingAnswers = new Map();
    this.executor = new SwActionExecutor(tabId, port, this.pendingAnswers);

    this.engine = new ExecutionEngine(this.executor, {}, `engine_${tabId}`);

    this.wireEngineEvents();
  }

  /** Resolve a pending ASK_OBSERVATION or PAUSE with the student's answer */
  resolveAnswer(actionId: string, answer: string): boolean {
    const pending = this.pendingAnswers.get(actionId);
    if (!pending) return false;

    this.pendingAnswers.delete(actionId);
    pending.resolve({ createdLabels: [], deletedLabels: [] });

    if (this.engine.getState() === "PAUSED") {
      this.engine.start();
    }

    return true;
  }

  /** Check if there's a pending question waiting for this action */
  hasPending(actionId: string): boolean {
    return this.pendingAnswers.has(actionId);
  }

  /** Emit ENGINE_STATUS with current counts (for per-step progress) */
  private emitEngineStatus(): void {
    const status = this.engine.getStatus();
    this.onEvent({
      type: "ENGINE_STATUS",
      engineState: this.engine.getState(),
      currentStep: status.currentStep,
      totalSteps: status.totalSteps,
      completedSteps: status.completedSteps,
      failedSteps: status.failedSteps,
      isPaused: status.isPaused,
    });
  }

  /**
   * Handle a bridge event (OBJECT_CLICKED, CONSTRUCTION_STEP, etc.).
   * Checks pending event-driven pauses and resolves matching ones.
   * Returns true if the event resolved a pending pause.
   */
  handleBridgeEvent(event: { type: string; label?: string; coords?: unknown }): boolean {
    for (const [actionId, pending] of this.pendingAnswers) {
      const cond = pending.eventCondition;
      if (!cond) continue;

      let matched = false;

      switch (cond.until) {
        case "object_click":
          // Resolve when any object is clicked (or specific target)
          if (event.type === "OBJECT_CLICKED") {
            if (!cond.target || cond.target === event.label) {
              matched = true;
            }
          }
          break;

        case "click":
          // Resolve on any user click (OBJECT_CLICKED or CONSTRUCTION_STEP)
          if (event.type === "OBJECT_CLICKED" || event.type === "CONSTRUCTION_STEP") {
            matched = true;
          }
          break;

        case "interaction":
          // Resolve on any bridge interaction event
          if (
            event.type === "OBJECT_CLICKED" ||
            event.type === "OBJECT_DRAGGED" ||
            event.type === "CONSTRUCTION_STEP"
          ) {
            matched = true;
          }
          break;

        case "ggb_ready":
          if (event.type === "GGB_READY") {
            matched = true;
          }
          break;
      }

      if (matched) {
        this.pendingAnswers.delete(actionId);
        pending.resolve({ createdLabels: [], deletedLabels: [] });

        // Resume engine if paused
        if (this.engine.getState() === "PAUSED") {
          this.engine.start();
        }

        return true;
      }
    }

    return false;
  }

  // ── Persistence ───────────────────────────────────────────

  /** Schedule a debounced persist (default 500ms) */
  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      persistSession(this).catch((err) => {
        console.error(`[SW] Failed to persist engine session for tab ${this.tabId}:`, err);
      });
    }, 500);
  }

  /** Persist immediately (call before SW shutdown) */
  async persistNow(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await persistSession(this);
  }

  /** Update the sidepanel port (called on reconnect after SW restart) */
  setPort(port: chrome.runtime.Port): void {
    this.executor.port = port;

    // Re-emit current status so the sidepanel syncs
    const status = this.engine.getStatus();
    this.onEvent({
      type: "ENGINE_STATUS",
      engineState: this.engine.getState(),
      currentStep: status.currentStep,
      totalSteps: status.totalSteps,
      completedSteps: status.completedSteps,
      failedSteps: status.failedSteps,
      isPaused: status.isPaused,
    });
  }

  /** Create a session from a persisted snapshot */
  static restore(
    tabId: number,
    port: chrome.runtime.Port | null,
    snap: SerializedEngine
  ): EngineSession {
    const pendingAnswers = new Map<string, PendingAnswer>();
    const executor = new SwActionExecutor(tabId, port, pendingAnswers);
    const engine = ExecutionEngine.deserialize(snap, executor, {}, `engine_${tabId}`);

    // Build session shell, then replace engine+executor+pendingAnswers
    const session = new EngineSession(tabId, port, () => {});
    session.engine = engine;
    session.executor = executor;
    session.pendingAnswers = pendingAnswers;
    session.wireEngineEvents();

    console.log(
      `[SW] Restored engine session for tab ${tabId}: state=${engine.getState()}, ` +
      `${engine.getStatus().completedSteps}/${engine.getStatus().totalSteps} steps done`
    );

    return session;
  }

  // ── Internal ──────────────────────────────────────────────

  /** Wire engine event handlers (shared by constructor and restore) */
  private wireEngineEvents(): void {
    this.engine.on({
      onStateChange: (_from, to) => {
        const status = this.engine.getStatus();
        this.onEvent({
          type: "ENGINE_STATUS",
          engineState: to,
          currentStep: status.currentStep,
          totalSteps: status.totalSteps,
          completedSteps: status.completedSteps,
          failedSteps: status.failedSteps,
          isPaused: status.isPaused,
        });

        if (
          to === "PAUSED" ||
          to === "COMPLETED" ||
          to === "ABORTED" ||
          to === "FAILED"
        ) {
          this.schedulePersist();
        }
      },
      onActionStart: (ctx) => {
        this.onEvent({
          type: "STEP_EVENT",
          event: "started",
          actionId: ctx.action.id,
          actionType: ctx.action.type,
          message: `执行 ${ctx.action.type}`,
        });
      },
      onActionComplete: (ctx) => {
        this.onEvent({
          type: "STEP_EVENT",
          event: "completed",
          actionId: ctx.action.id,
          actionType: ctx.action.type,
          message: `${ctx.action.type} 完成`,
        });
        this.emitEngineStatus();
        this.schedulePersist();
      },
      onActionFail: (ctx, err) => {
        this.onEvent({
          type: "STEP_EVENT",
          event: "failed",
          actionId: ctx.action.id,
          actionType: ctx.action.type,
          message: `${ctx.action.type} 失败`,
          error: err.message,
        });
        this.emitEngineStatus();
        this.schedulePersist();
      },
      onActionSkip: (ctx) => {
        this.onEvent({
          type: "STEP_EVENT",
          event: "skipped",
          actionId: ctx.action.id,
          actionType: ctx.action.type,
          message: `${ctx.action.type} 已跳过`,
        });
        this.emitEngineStatus();
        this.schedulePersist();
      },
      onPause: (reason) => {
        this.onEvent({
          type: "ENGINE_STATUS",
          engineState: "PAUSED",
          currentStep: this.engine.getStatus().currentStep,
          totalSteps: this.engine.getStatus().totalSteps,
          completedSteps: this.engine.getStatus().completedSteps,
          failedSteps: this.engine.getStatus().failedSteps,
          isPaused: true,
          pauseReason: reason,
        });
        this.schedulePersist();
      },
      onComplete: () => {
        this.onEvent({
          type: "ENGINE_STATUS",
          engineState: "COMPLETED",
          currentStep: this.engine.getStatus().totalSteps,
          totalSteps: this.engine.getStatus().totalSteps,
          completedSteps: this.engine.getStatus().completedSteps,
          failedSteps: this.engine.getStatus().failedSteps,
          isPaused: false,
        });
        this.schedulePersist();
      },
    });
  }
}

// ============================================================
// Persistence helpers
// ============================================================

async function persistSession(session: EngineSession): Promise<void> {
  const snap = session.engine.serialize();
  await chrome.storage.session.set({ [persistKey(session.tabId)]: snap });
}

// ============================================================
// Engine Session Registry (per-tab singletons)
// ============================================================

const sessions = new Map<number, EngineSession>();

export function getSession(tabId: number): EngineSession | undefined {
  return sessions.get(tabId);
}

export function createSession(
  tabId: number,
  port: chrome.runtime.Port | null
): EngineSession {
  const existing = sessions.get(tabId);
  if (existing) return existing;

  const session = new EngineSession(tabId, port, (event) => {
    if (port) {
      const msg = buildEvent("sw", "sidepanel", event as any);
      port.postMessage(msg);
    }
  });

  sessions.set(tabId, session);
  return session;
}

export function removeSession(tabId: number): void {
  const session = sessions.get(tabId);
  if (session) {
    try { session.engine.abort(); } catch { /* already terminal */ }
    sessions.delete(tabId);
  }
  // Clean up persisted state
  chrome.storage.session.remove(persistKey(tabId)).catch(() => {});
}

// ============================================================
// Restore — recreate engine session from persisted state
// ============================================================

/**
 * Try to restore an engine session for a tab from chrome.storage.session.
 * Called at SW startup. The port will be null initially and can be
 * updated later via session.setPort() when the sidepanel reconnects.
 *
 * On restore, RUNNING state is downgraded to PAUSED (safe state since
 * the SW was killed). Pending ASK_OBSERVATION/PAUSE promises are lost
 * and will be re-presented when the engine resumes execution.
 */
export async function restoreSession(
  tabId: number,
  port: chrome.runtime.Port | null
): Promise<EngineSession | undefined> {
  const key = persistKey(tabId);
  const result = await chrome.storage.session.get(key);
  const snap = result[key] as SerializedEngine | undefined;
  if (!snap) return undefined;

  // Downgrade RUNNING → PAUSED (SW was killed mid-execution)
  if (snap.state === "RUNNING") {
    snap.state = "PAUSED" as any;
    snap.serializedAt = Date.now();
  }

  return EngineSession.restore(tabId, port, snap);
}

/**
 * Set the sidepanel port on all registered sessions (called on reconnect).
 */
export function setSessionsPort(port: chrome.runtime.Port): void {
  for (const [, session] of sessions) {
    session.setPort(port);
  }
}
