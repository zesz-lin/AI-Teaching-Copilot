import { describe, it, expect } from "vitest";
import {
  EngineState,
  ActionState,
} from "./types";
import {
  canTransitionEngine,
  transitionEngine,
  canTransitionAction,
  isTerminal,
  isRunning,
  isPausable,
} from "./state-machine";

describe("Engine state machine", () => {
  describe("canTransitionEngine", () => {
    it("allows IDLE → READY", () => {
      expect(canTransitionEngine(EngineState.IDLE, EngineState.READY)).toBe(true);
    });

    it("allows READY → RUNNING", () => {
      expect(canTransitionEngine(EngineState.READY, EngineState.RUNNING)).toBe(true);
    });

    it("allows RUNNING → PAUSED", () => {
      expect(canTransitionEngine(EngineState.RUNNING, EngineState.PAUSED)).toBe(true);
    });

    it("allows RUNNING → COMPLETED", () => {
      expect(canTransitionEngine(EngineState.RUNNING, EngineState.COMPLETED)).toBe(true);
    });

    it("allows RUNNING → ABORTED", () => {
      expect(canTransitionEngine(EngineState.RUNNING, EngineState.ABORTED)).toBe(true);
    });

    it("allows PAUSED → RUNNING", () => {
      expect(canTransitionEngine(EngineState.PAUSED, EngineState.RUNNING)).toBe(true);
    });

    it("allows PAUSED → ABORTED", () => {
      expect(canTransitionEngine(EngineState.PAUSED, EngineState.ABORTED)).toBe(true);
    });

    it("allows ABORTED → READY (reload)", () => {
      expect(canTransitionEngine(EngineState.ABORTED, EngineState.READY)).toBe(true);
    });

    it("allows FAILED → READY (reload)", () => {
      expect(canTransitionEngine(EngineState.FAILED, EngineState.READY)).toBe(true);
    });

    it("rejects IDLE → RUNNING (skip READY)", () => {
      expect(canTransitionEngine(EngineState.IDLE, EngineState.RUNNING)).toBe(false);
    });

    it("rejects COMPLETED → anything", () => {
      expect(canTransitionEngine(EngineState.COMPLETED, EngineState.RUNNING)).toBe(false);
      expect(canTransitionEngine(EngineState.COMPLETED, EngineState.IDLE)).toBe(false);
    });
  });

  describe("transitionEngine", () => {
    it("transitions on valid input", () => {
      expect(transitionEngine(EngineState.READY, EngineState.RUNNING)).toBe(
        EngineState.RUNNING
      );
    });

    it("throws on invalid transition", () => {
      expect(() =>
        transitionEngine(EngineState.COMPLETED, EngineState.RUNNING)
      ).toThrow("Invalid engine transition");
    });
  });
});

describe("Action state machine", () => {
  it("allows PENDING → RUNNING", () => {
    expect(canTransitionAction(ActionState.PENDING, ActionState.RUNNING)).toBe(true);
  });

  it("allows PENDING → BLOCKED", () => {
    expect(canTransitionAction(ActionState.PENDING, ActionState.BLOCKED)).toBe(true);
  });

  it("allows BLOCKED → PENDING (unblock)", () => {
    expect(canTransitionAction(ActionState.BLOCKED, ActionState.PENDING)).toBe(true);
  });

  it("allows RUNNING → COMPLETED", () => {
    expect(canTransitionAction(ActionState.RUNNING, ActionState.COMPLETED)).toBe(true);
  });

  it("allows RUNNING → FAILED", () => {
    expect(canTransitionAction(ActionState.RUNNING, ActionState.FAILED)).toBe(true);
  });

  it("allows FAILED → PENDING (retry)", () => {
    expect(canTransitionAction(ActionState.FAILED, ActionState.PENDING)).toBe(true);
  });

  it("allows FAILED → SKIPPED", () => {
    expect(canTransitionAction(ActionState.FAILED, ActionState.SKIPPED)).toBe(true);
  });

  it("allows COMPLETED → ROLLED_BACK", () => {
    expect(canTransitionAction(ActionState.COMPLETED, ActionState.ROLLED_BACK)).toBe(
      true
    );
  });

  it("rejects COMPLETED → RUNNING", () => {
    expect(canTransitionAction(ActionState.COMPLETED, ActionState.RUNNING)).toBe(false);
  });

  it("rejects SKIPPED → anything (terminal)", () => {
    expect(canTransitionAction(ActionState.SKIPPED, ActionState.PENDING)).toBe(false);
    expect(canTransitionAction(ActionState.SKIPPED, ActionState.COMPLETED)).toBe(false);
  });
});

describe("State helpers", () => {
  it("isTerminal: COMPLETED is terminal", () => {
    expect(isTerminal(EngineState.COMPLETED)).toBe(true);
  });

  it("isTerminal: ABORTED is terminal", () => {
    expect(isTerminal(EngineState.ABORTED)).toBe(true);
  });

  it("isTerminal: FAILED is terminal", () => {
    expect(isTerminal(EngineState.FAILED)).toBe(true);
  });

  it("isTerminal: RUNNING is not terminal", () => {
    expect(isTerminal(EngineState.RUNNING)).toBe(false);
  });

  it("isRunning: RUNNING is running", () => {
    expect(isRunning(EngineState.RUNNING)).toBe(true);
  });

  it("isRunning: PAUSED is not running", () => {
    expect(isRunning(EngineState.PAUSED)).toBe(false);
  });

  it("isPausable: RUNNING is pausable", () => {
    expect(isPausable(EngineState.RUNNING)).toBe(true);
  });

  it("isPausable: IDLE is not pausable", () => {
    expect(isPausable(EngineState.IDLE)).toBe(false);
  });
});
