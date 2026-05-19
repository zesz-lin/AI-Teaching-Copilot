import { describe, it, expect } from "vitest";
import { ActionQueue } from "./queue";
import { ActionState } from "./types";
import type { Action } from "../dsl/types";

function makeAction(id: string, dependsOn?: string[]): Action {
  return {
    version: "1.0.0",
    id,
    type: "EXPLAIN",
    params: { type: "EXPLAIN", text: `step ${id}` },
    meta: dependsOn ? { dependsOn } : undefined,
  };
}

describe("ActionQueue", () => {
  describe("load", () => {
    it("loads actions and marks all as PENDING when no dependencies", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b"), makeAction("c")]);

      const all = q.all();
      expect(all).toHaveLength(3);
      expect(all.every((e) => e.state === ActionState.PENDING)).toBe(true);
    });

    it("marks entries with unsatisfied deps as BLOCKED", () => {
      const q = new ActionQueue();
      q.load([
        makeAction("a"),
        makeAction("b", ["a"]), // depends on a
        makeAction("c", ["b"]), // depends on b
      ]);

      const a = q.get("a");
      const b = q.get("b");
      const c = q.get("c");

      expect(a!.state).toBe(ActionState.PENDING);
      expect(b!.state).toBe(ActionState.BLOCKED);
      expect(c!.state).toBe(ActionState.BLOCKED);
    });

    it("builds reverse dependency graph (dependents)", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b", ["a"])]);

      const a = q.get("a");
      expect(a!.dependents).toContain("b");
    });
  });

  describe("next", () => {
    it("returns first PENDING entry with all deps satisfied", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b")]);

      const entry = q.next();
      expect(entry).not.toBeNull();
      expect(entry!.action.id).toBe("a");
    });

    it("skips BLOCKED entries", () => {
      const q = new ActionQueue();
      q.load([makeAction("a", ["x"]), makeAction("b")]);

      // "a" is BLOCKED (depends on missing "x"), so "b" should be next
      const entry = q.next();
      expect(entry).not.toBeNull();
      expect(entry!.action.id).toBe("b");
    });

    it("returns null when no more executable entries", () => {
      const q = new ActionQueue();
      q.load([makeAction("a", ["x"])]); // all blocked

      expect(q.next()).toBeNull();
    });

    it("unblocks entries that become satisfied", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b", ["a"])]);

      // Complete "a"
      q.markComplete("a");

      // Now "b" should be unblocked
      const b = q.get("b");
      expect(b!.state).toBe(ActionState.PENDING);
    });
  });

  describe("markComplete", () => {
    it("marks action as COMPLETED and unblocks dependents", () => {
      const q = new ActionQueue();
      q.load([
        makeAction("a"),
        makeAction("b", ["a"]),
        makeAction("c", ["a"]),
      ]);

      q.markComplete("a");

      expect(q.get("a")!.state).toBe(ActionState.COMPLETED);
      expect(q.get("b")!.state).toBe(ActionState.PENDING);
      expect(q.get("c")!.state).toBe(ActionState.PENDING);
    });

    it("does not unblock entries with other unsatisfied deps", () => {
      const q = new ActionQueue();
      q.load([
        makeAction("a"),
        makeAction("b"),
        makeAction("c", ["a", "b"]),
      ]);

      q.markComplete("a");

      // "c" depends on both "a" and "b" — only "a" is done
      expect(q.get("c")!.state).toBe(ActionState.BLOCKED);
    });
  });

  describe("progress", () => {
    it("returns 0 when nothing done", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b")]);
      expect(q.progress()).toBe(0);
    });

    it("returns 0.5 when half done", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b")]);
      q.setState("a", ActionState.COMPLETED);
      expect(q.progress()).toBe(0.5);
    });

    it("returns 1 when all done", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b")]);
      q.setState("a", ActionState.COMPLETED);
      q.setState("b", ActionState.SKIPPED);
      expect(q.progress()).toBe(1);
    });

    it("returns 1 for empty queue", () => {
      const q = new ActionQueue();
      expect(q.progress()).toBe(1);
    });
  });

  describe("isDone", () => {
    it("returns true when all actions are terminal", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b")]);
      q.setState("a", ActionState.COMPLETED);
      q.setState("b", ActionState.SKIPPED);
      expect(q.isDone()).toBe(true);
    });

    it("returns false when some actions are still PENDING", () => {
      const q = new ActionQueue();
      q.load([makeAction("a"), makeAction("b")]);
      q.setState("a", ActionState.COMPLETED);
      expect(q.isDone()).toBe(false);
    });
  });

  describe("serialization", () => {
    it("serializes and restores correctly", () => {
      const q = new ActionQueue();
      const actions = [makeAction("a"), makeAction("b", ["a"]), makeAction("c")];
      q.load(actions);
      q.setState("a", ActionState.COMPLETED);
      q.setState("b", ActionState.PENDING);

      const snapshot = q.toJSON();
      expect(snapshot).toHaveLength(3);
      expect(snapshot[0].actionId).toBe("a");
      expect(snapshot[0].state).toBe(ActionState.COMPLETED);
      expect(snapshot[1].state).toBe(ActionState.PENDING);

      // Restore into fresh queue
      const q2 = new ActionQueue();
      q2.restoreFromJSON(snapshot, actions);

      expect(q2.get("a")!.state).toBe(ActionState.COMPLETED);
      expect(q2.get("b")!.state).toBe(ActionState.PENDING);
      expect(q2.get("c")!.state).toBe(ActionState.PENDING);
      expect(q2.progress()).toBe(1 / 3);
    });
  });
});
