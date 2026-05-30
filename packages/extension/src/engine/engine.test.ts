import { describe, it, expect } from "vitest";
import { ExecutionEngine } from "./engine";
import { EngineState, ActionState } from "./types";
import { canTransitionAction } from "./state-machine";
import type { Action } from "../dsl/types";
import type { ActionSnapshot, InverseAction } from "./types";
import type { ActionExecutor } from "./transaction";
import type { InverseExecutor } from "./rollback";

function makeMockExecutor(): ActionExecutor & InverseExecutor {
  return {
    async execute() {
      return { createdLabels: [], deletedLabels: [] };
    },
    async snapshot(): Promise<ActionSnapshot> {
      return { actionId: "", existingLabels: [], state: {}, capturedAt: new Date().toISOString() };
    },
    async restoreSnapshot() {},
    async executeInverse() {},
  };
}

function makePlan(steps?: Action[]) {
  return {
    version: "1.0.0" as const,
    planId: "test-plan",
    topic: "Test",
    level: "beginner" as const,
    steps: steps ?? [
      { version: "1.0.0", id: "s1", type: "EXPLAIN", params: { type: "EXPLAIN", text: "Hello" } },
    ],
    meta: { createdAt: new Date().toISOString(), model: "test", promptSummary: "test" },
  };
}

describe("ExecutionEngine", () => {
  it("getCurrentActionId returns null when no running or failed action", () => {
    const engine = new ExecutionEngine(makeMockExecutor());
    engine.loadPlan(makePlan());
    expect(engine.getCurrentActionId()).toBeNull();
  });

  it("getCurrentActionId returns failed action when no running action", () => {
    const engine = new ExecutionEngine(makeMockExecutor());
    engine.loadPlan(makePlan());
    const entry = (engine as unknown as { queue: { get: (id: string) => { state: string; action: { id: string } } } }).queue.get("s1");
    if (!entry) throw new Error("entry not found");
    entry.state = "FAILED" as string;
    expect(engine.getCurrentActionId()).toBe("s1");
  });

  it("READY→ABORTED transition", () => {
    const engine = new ExecutionEngine(makeMockExecutor());
    engine.loadPlan(makePlan());
    engine.abort();
    expect(engine.getState()).toBe(EngineState.ABORTED);
  });

  it("abort during execution transitions correctly", () => {
    const engine = new ExecutionEngine(makeMockExecutor());
    engine.loadPlan(makePlan());
    engine.start();
    engine.abort();
    expect(engine.getState()).toBe(EngineState.ABORTED);

    engine.loadPlan(makePlan());
    expect(engine.getState()).toBe(EngineState.READY);
  });

  it("engine.skip() transitions action and logs correct fromState", () => {
    const engine = new ExecutionEngine(makeMockExecutor());
    engine.loadPlan(makePlan([{ version: "1.0.0", id: "s0", type: "EXPLAIN", params: { type: "EXPLAIN", text: "A" } }]));
    engine.skip("s0");

    const status = engine.getStatus();
    expect(status.skippedSteps).toBe(1);

    const log = engine.getLog();
    const skipEntry = log.find((e) => e.toActionState === ActionState.SKIPPED);
    expect(skipEntry).toBeDefined();
    expect(skipEntry!.fromActionState).toBe(ActionState.PENDING);
  });

  it("engine serialize and deserialize preserves state", () => {
    const engine = new ExecutionEngine(makeMockExecutor());
    engine.loadPlan(makePlan());
    engine.start();

    const ser = engine.serialize();
    expect(ser.state).toBe(EngineState.RUNNING);
    expect(ser.queueSnapshot).toHaveLength(1);

    const engine2 = ExecutionEngine.deserialize(ser, makeMockExecutor());
    expect(engine2.getState()).toBe(EngineState.RUNNING);
    expect(engine2.getStatus().totalSteps).toBe(1);
  });

  it("restorePendingAction resets RUNNING action to PENDING", () => {
    const engine = new ExecutionEngine(makeMockExecutor());
    engine.loadPlan(makePlan());
    const entry = (engine as unknown as { queue: { get: (id: string) => { state: string } } }).queue.get("s1");
    if (!entry) throw new Error("entry not found");
    entry.state = "RUNNING" as string;

    engine.restorePendingAction();
    expect(engine.getStatus().completedSteps).toBe(0);
  });

  it("RUNNING→SKIPPED action transition is valid", () => {
    expect(canTransitionAction(ActionState.RUNNING, ActionState.SKIPPED)).toBe(true);
  });
});
