// ============================================================
// Engine smoke tests
// ============================================================

import { ExecutionEngine } from "./engine";
import { EngineState, ActionState } from "./types";
import { transitionEngine, canTransitionEngine, transitionAction, canTransitionAction } from "./state-machine";
import { ActionQueue } from "./queue";
import { TransactionManager, type ActionExecutor } from "./transaction";
import { RollbackManager, type InverseExecutor } from "./rollback";
import type { Action } from "../dsl/types";
import type { ActionSnapshot, InverseAction } from "./types";

// ============================================================
// Test helpers
// ============================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(() => fn())
    .then(() => { passed++; console.log(`  PASS: ${name}`); })
    .catch((e) => { failed++; console.log(`  FAIL: ${name} — ${e instanceof Error ? e.message : String(e)}`); });
}

// ============================================================
// Mock executor
// ============================================================

function makeMockExecutor(
  executeImpl?: (action: Action) => Promise<{ createdLabels: string[]; deletedLabels: string[] }>
): ActionExecutor & InverseExecutor {
  return {
    async execute(action: Action) {
      if (executeImpl) return executeImpl(action);
      return { createdLabels: [], deletedLabels: [] };
    },
    async snapshot(_labels?: string[]): Promise<ActionSnapshot> {
      return {
        actionId: "",
        existingLabels: [],
        state: {},
        capturedAt: new Date().toISOString(),
      };
    },
    async restoreSnapshot(_snapshot: ActionSnapshot): Promise<void> {},
    async executeInverse(_inverse: InverseAction): Promise<void> {},
  };
}

function makePlan(steps: Action[] = makeSampleSteps()) {
  return {
    version: "1.0.0" as const,
    planId: "test-plan",
    topic: "Test",
    level: "beginner" as const,
    steps,
    meta: {
      createdAt: new Date().toISOString(),
      model: "test",
      promptSummary: "test",
    },
  };
}

function makeSampleSteps(): Action[] {
  return [
    { version: "1.0.0", id: "s1", type: "EXPLAIN", params: { type: "EXPLAIN", text: "Hello" } },
    { version: "1.0.0", id: "s2", type: "FUNCTION_PLOT", params: { type: "FUNCTION_PLOT", fn: "x^2", variable: "x", range: [-5, 5] } },
    { version: "1.0.0", id: "s3", type: "ASK_OBSERVATION", params: { type: "ASK_OBSERVATION", question: "What?", answerType: "text" } },
  ];
}

// ============================================================
// State machine tests
// ============================================================

console.log("=== State Machine ===\n");

test("valid engine transitions", () => {
  if (!canTransitionEngine(EngineState.IDLE, EngineState.READY)) throw new Error("IDLE→READY");
  if (!canTransitionEngine(EngineState.READY, EngineState.RUNNING)) throw new Error("READY→RUNNING");
  if (!canTransitionEngine(EngineState.RUNNING, EngineState.PAUSED)) throw new Error("RUNNING→PAUSED");
  if (!canTransitionEngine(EngineState.PAUSED, EngineState.RUNNING)) throw new Error("PAUSED→RUNNING");
  if (!canTransitionEngine(EngineState.RUNNING, EngineState.COMPLETED)) throw new Error("RUNNING→COMPLETED");
});

test("invalid engine transition throws", () => {
  try {
    transitionEngine(EngineState.IDLE, EngineState.RUNNING);
    throw new Error("should have thrown");
  } catch {
    // expected
  }
});

test("valid action transitions", () => {
  if (!canTransitionAction(ActionState.PENDING, ActionState.RUNNING)) throw new Error("PENDING→RUNNING");
  if (!canTransitionAction(ActionState.RUNNING, ActionState.COMPLETED)) throw new Error("RUNNING→COMPLETED");
  if (!canTransitionAction(ActionState.RUNNING, ActionState.FAILED)) throw new Error("RUNNING→FAILED");
  if (!canTransitionAction(ActionState.FAILED, ActionState.PENDING)) throw new Error("FAILED→PENDING");
  if (!canTransitionAction(ActionState.COMPLETED, ActionState.ROLLED_BACK)) throw new Error("COMPLETED→ROLLED_BACK");
});

test("invalid action transition throws", () => {
  try {
    transitionAction(ActionState.COMPLETED, ActionState.RUNNING);
    throw new Error("should have thrown");
  } catch {
    // expected
  }
});

// ============================================================
// Queue tests
// ============================================================

console.log("\n=== Queue ===\n");

test("queue loads steps in order", () => {
  const queue = new ActionQueue();
  queue.load(makeSampleSteps());
  const all = queue.all();
  if (all.length !== 3) throw new Error(`expected 3, got ${all.length}`);
  if (all[0].action.id !== "s1") throw new Error("wrong order");
  if (all[1].action.id !== "s2") throw new Error("wrong order");
});

test("queue returns next executable", () => {
  const queue = new ActionQueue();
  queue.load(makeSampleSteps());
  const next = queue.next();
  if (!next) throw new Error("expected entry");
  if (next.action.id !== "s1") throw new Error(`expected s1, got ${next.action.id}`);
});

test("queue reports progress", () => {
  const queue = new ActionQueue();
  queue.load(makeSampleSteps());
  queue.markComplete("s1");
  queue.markComplete("s2");
  if (queue.progress() !== 2 / 3) throw new Error(`expected 0.667, got ${queue.progress()}`);
  if (queue.isDone()) throw new Error("should not be done yet");
  queue.markComplete("s3");
  if (!queue.isDone()) throw new Error("should be done");
});

test("queue resolves dependencies with blocking", () => {
  const queue = new ActionQueue();
  const steps: Action[] = [
    { version: "1.0.0", id: "a", type: "EXPLAIN", params: { type: "EXPLAIN", text: "A" } },
    { version: "1.0.0", id: "b", type: "EXPLAIN", params: { type: "EXPLAIN", text: "B" }, meta: { dependsOn: ["a"] } },
  ];
  queue.load(steps);

  // First entry should be "a" (PENDING)
  const first = queue.next();
  if (!first) throw new Error("expected a");
  if (first.action.id !== "a") throw new Error(`expected a, got ${first.action.id}`);

  // "b" should be BLOCKED
  const b = queue.get("b");
  if (!b) throw new Error("b not found");
  if (b.state !== ActionState.BLOCKED) throw new Error(`b should be BLOCKED, is ${b.state}`);

  // Complete "a" → "b" should unblock
  queue.markComplete("a");
  const b2 = queue.get("b");
  if (b2?.state !== ActionState.PENDING) throw new Error(`b should be PENDING after a done, is ${b2?.state}`);
});

// ============================================================
// Engine tests
// ============================================================

console.log("\n=== Engine ===\n");

test("engine starts in IDLE", () => {
  const engine = new ExecutionEngine(makeMockExecutor());
  if (engine.getState() !== EngineState.IDLE) throw new Error("not IDLE");
});

test("loadPlan transitions IDLE→READY", () => {
  const engine = new ExecutionEngine(makeMockExecutor());
  engine.loadPlan(makePlan());
  if (engine.getState() !== EngineState.READY) throw new Error("not READY");
});

test("start transitions READY→RUNNING", () => {
  const engine = new ExecutionEngine(makeMockExecutor());
  engine.loadPlan(makePlan());
  engine.start();
  if (engine.getState() !== EngineState.RUNNING) throw new Error("not RUNNING");
});

test("pause transitions RUNNING→PAUSED", () => {
  const engine = new ExecutionEngine(makeMockExecutor());
  engine.loadPlan(makePlan());
  engine.start();
  engine.pause("test");
  if (engine.getState() !== EngineState.PAUSED) throw new Error("not PAUSED");
});

test("abort transitions RUNNING→ABORTED", () => {
  const engine = new ExecutionEngine(makeMockExecutor());
  engine.loadPlan(makePlan());
  engine.start();
  engine.abort();
  if (engine.getState() !== EngineState.ABORTED) throw new Error("not ABORTED");
});

test("engine executes all steps and reaches COMPLETED", async () => {
  const executed: string[] = [];
  const executor = makeMockExecutor(async (action) => {
    executed.push(action.id);
    return { createdLabels: [], deletedLabels: [] };
  });

  const engine = new ExecutionEngine(executor);
  engine.loadPlan(makePlan());
  engine.start();
  await engine.run();

  if (engine.getState() !== EngineState.COMPLETED) throw new Error(`not COMPLETED: ${engine.getState()}`);
  if (executed.length !== 3) throw new Error(`expected 3 executed, got ${executed.length}`);
});

test("engine pauses on failed non-optional action", async () => {
  const executor = makeMockExecutor(async (action) => {
    if (action.id === "s2") throw new Error("fail");
    return { createdLabels: [], deletedLabels: [] };
  });

  const engine = new ExecutionEngine(executor, { maxRetries: 0 });
  engine.loadPlan(makePlan());
  engine.start();
  await engine.run();

  // Should have completed s1, failed s2, paused
  const status = engine.getStatus();
  if (status.completedSteps < 1) throw new Error(`expected >=1 completed, got ${status.completedSteps}`);
  if (status.failedSteps < 1) throw new Error(`expected >=1 failed, got ${status.failedSteps}`);
  if (engine.getState() !== EngineState.PAUSED) throw new Error(`expected PAUSED, got ${engine.getState()}`);
});

test("engine skips optional action on failure", async () => {
  const executor = makeMockExecutor(async (action) => {
    if (action.id === "s1") throw new Error("fail-optional");
    return { createdLabels: [], deletedLabels: [] };
  });

  const engine = new ExecutionEngine(executor, { maxRetries: 0 });
  const plan = makePlan([
    { version: "1.0.0", id: "s1", type: "EXPLAIN", params: { type: "EXPLAIN", text: "H" }, meta: { optional: true } },
    { version: "1.0.0", id: "s2", type: "EXPLAIN", params: { type: "EXPLAIN", text: "W" } },
  ]);
  engine.loadPlan(plan);
  engine.start();
  await engine.run();

  const status = engine.getStatus();
  if (status.skippedSteps < 1) throw new Error(`expected >=1 skipped, got ${status.skippedSteps}`);
  if (status.completedSteps < 1) throw new Error(`expected >=1 completed, got ${status.completedSteps}`);
});

test("engine retries failed actions", async () => {
  let attempts = 0;
  const executor = makeMockExecutor(async (action) => {
    if (action.id === "s2") {
      attempts++;
      if (attempts < 3) throw new Error("transient");
    }
    return { createdLabels: [], deletedLabels: [] };
  });

  const engine = new ExecutionEngine(executor, { maxRetries: 3 });
  engine.loadPlan(makePlan());
  engine.start();
  await engine.run();

  if (attempts !== 3) throw new Error(`expected 3 attempts, got ${attempts}`);
});

// ============================================================
// Transaction tests
// ============================================================

console.log("\n=== Transactions ===\n");

test("transaction generates correct inverse for FUNCTION_PLOT", async () => {
  const executor = makeMockExecutor(async () => {
    return { createdLabels: ["f"], deletedLabels: [] };
  });
  const tx = new TransactionManager(executor);

  const action: Action = { version: "1.0.0", id: "a1", type: "FUNCTION_PLOT", params: { type: "FUNCTION_PLOT", fn: "x^2", variable: "x", range: [-5, 5] } };
  const result = await tx.execute(action, 0, 0);

  if (!result.success) throw new Error("should succeed");
  if (result.ctx.inverse?.type !== "DELETE_OBJECT") throw new Error(`wrong inverse type: ${result.ctx.inverse?.type}`);
  if (result.ctx.inverse?.labels?.[0] !== "f") throw new Error(`wrong inverse label: ${result.ctx.inverse?.labels?.[0]}`);
});

test("transaction generates REMOVE_UI inverse for EXPLAIN", async () => {
  const executor = makeMockExecutor(async () => ({ createdLabels: [], deletedLabels: [] }));
  const tx = new TransactionManager(executor);

  const action: Action = { version: "1.0.0", id: "x1", type: "EXPLAIN", params: { type: "EXPLAIN", text: "Hi" } };
  const result = await tx.execute(action, 0, 0);

  if (!result.success) throw new Error("should succeed");
  if (result.ctx.inverse?.type !== "REMOVE_UI") throw new Error(`wrong inverse type: ${result.ctx.inverse?.type}`);
});

test("transaction generates NOOP inverse for PAUSE", async () => {
  const executor = makeMockExecutor(async () => ({ createdLabels: [], deletedLabels: [] }));
  const tx = new TransactionManager(executor);

  const action: Action = { version: "1.0.0", id: "p1", type: "PAUSE", params: { type: "PAUSE", until: "click" } };
  const result = await tx.execute(action, 0, 0);

  if (!result.success) throw new Error("should succeed");
  if (result.ctx.inverse?.type !== "NOOP") throw new Error(`wrong inverse type: ${result.ctx.inverse?.type}`);
});

test("transaction captures error on execute failure", async () => {
  const executor = makeMockExecutor(async () => { throw new Error("boom"); });
  const tx = new TransactionManager(executor);

  const action: Action = { version: "1.0.0", id: "e1", type: "POINT", params: { type: "POINT", coords: [0, 0] } };
  const result = await tx.execute(action, 0, 0);

  if (result.success) throw new Error("should fail");
  if (!result.error) throw new Error("should have error");
});

// ============================================================
// Logging tests
// ============================================================

console.log("\n=== Logger ===\n");

import { ExecutionLogger } from "./logger";

test("logger records engine transitions", () => {
  const logger = new ExecutionLogger();
  logger.logEngine(EngineState.IDLE, EngineState.READY, "loaded");
  logger.logEngine(EngineState.READY, EngineState.RUNNING, "started");

  const all = logger.getAll();
  if (all.length !== 2) throw new Error(`expected 2 entries, got ${all.length}`);
});

test("logger sequences entries", () => {
  const logger = new ExecutionLogger();
  logger.logEngine(EngineState.IDLE, EngineState.READY, "a");
  logger.logEngine(EngineState.READY, EngineState.RUNNING, "b");

  const all = logger.getAll();
  if (all[0].seq !== 0) throw new Error("seq mismatch");
  if (all[1].seq !== 1) throw new Error("seq mismatch");
});

// ============================================================
// Rollback tests
// ============================================================

console.log("\n=== Rollback ===\n");

import type { ExecutionContext } from "./types";

test("rollback executes inverses in reverse order", async () => {
  const executed: string[] = [];
  const executor: ActionExecutor & InverseExecutor = {
    async execute(_action: Action) { return { createdLabels: [], deletedLabels: [] }; },
    async snapshot(): Promise<ActionSnapshot> {
      return { actionId: "", existingLabels: [], state: {}, capturedAt: new Date().toISOString() };
    },
    async restoreSnapshot(_snapshot: ActionSnapshot): Promise<void> {},
    async executeInverse(inverse: InverseAction) {
      executed.push(inverse.type);
    },
  };

  const mgr = new RollbackManager(executor);

  // Record two completed contexts
  const ctx1: ExecutionContext = {
    action: { version: "1.0.0", id: "a1", type: "EXPLAIN", params: { type: "EXPLAIN", text: "A" } },
    stepIndex: 0, snapshot: null,
    inverse: { type: "REMOVE_UI", uiIds: ["a1"] },
    startedAt: Date.now(), retryCount: 0,
  };
  const ctx2: ExecutionContext = {
    action: { version: "1.0.0", id: "a2", type: "FUNCTION_PLOT", params: { type: "FUNCTION_PLOT", fn: "x", variable: "x", range: [0, 1] } },
    stepIndex: 1, snapshot: null,
    inverse: { type: "DELETE_OBJECT", labels: ["f"] },
    startedAt: Date.now(), retryCount: 0,
  };

  mgr.record(ctx1);
  mgr.record(ctx2);

  // Rollback all
  await mgr.execute({ type: "all" }, []);

  // Should execute a2 first (reverse order), then a1
  if (executed[0] !== "DELETE_OBJECT") throw new Error(`first should be DELETE_OBJECT, got ${executed[0]}`);
  if (executed[1] !== "REMOVE_UI") throw new Error(`second should be REMOVE_UI, got ${executed[1]}`);
  if (mgr.undoDepth !== 0) throw new Error(`undoDepth should be 0 after rollback, got ${mgr.undoDepth}`);
});

// ============================================================
// Summary
// ============================================================

// Run all tests (async ones return promises)
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 500);
