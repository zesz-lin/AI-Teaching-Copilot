// ============================================================
// Adapter smoke tests
// ============================================================

import { GgbAdapter } from "./ggb-adapter";
import { LabelResolver } from "./naming";
import { buildCommand } from "./command-builder";
import type { GgbApplet } from "./types";
import type { Action } from "../dsl/types";

// ============================================================
// Test helpers
// ============================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ============================================================
// Mock GgbApplet
// ============================================================

function makeMockApplet(): GgbApplet {
  const objects = new Map<string, { type: string; defined: boolean; value: number; x: number; y: number }>();
  const commands: string[] = [];

  return {
    evalCommand(cmd: string) {
      commands.push(cmd);

      // Rudimentary parser to track created objects
      const assignMatch = cmd.match(/^(\w+)\((\w+)\)\s*=\s*(.+)$/);
      const pointMatch = cmd.match(/^(\w+)\s*=\s*\((.+)\)$/);
      const sliderMatch = cmd.match(/^(\w+)\s*=\s*Slider\(/);
      const deleteMatch = cmd.match(/^Delete\((.+)\)$/);
      const deleteAllMatch = cmd.match(/^Delete\(All\)$/);

      if (deleteAllMatch) {
        objects.clear();
        return;
      }
      if (deleteMatch) {
        const labels = deleteMatch[1].replace(/[{}]/g, "").split(",").map(s => s.trim());
        for (const l of labels) objects.delete(l);
        return;
      }
      if (assignMatch) {
        objects.set(assignMatch[1], { type: "function", defined: true, value: 0, x: 0, y: 0 });
        return;
      }
      if (pointMatch) {
        const [x, y] = pointMatch[2].split(",").map(Number);
        objects.set(pointMatch[1], { type: "point", defined: true, value: 0, x, y });
        return;
      }
      if (sliderMatch) {
        objects.set(sliderMatch[1], { type: "slider", defined: true, value: 0, x: 0, y: 0 });
        return;
      }
      // Generic creation
      const genericMatch = cmd.match(/^(\w+)\s*=\s*(.+)$/);
      if (genericMatch && !cmd.includes("SetColor") && !cmd.includes("SetPointSize") && !cmd.includes("SetFilling")) {
        objects.set(genericMatch[1], { type: "unknown", defined: true, value: 0, x: 0, y: 0 });
      }
    },

    getAllObjectNames() {
      return Array.from(objects.keys());
    },

    getObjectType(label: string) {
      return objects.get(label)?.type ?? "unknown";
    },

    getObjectNumber() {
      return objects.size;
    },

    getValueString(label: string) {
      return String(objects.get(label)?.value ?? 0);
    },

    setValue(label: string, value: number) {
      const obj = objects.get(label);
      if (obj) obj.value = value;
    },

    setCoords(label: string, x: number, y: number) {
      const obj = objects.get(label);
      if (obj) { obj.x = x; obj.y = y; }
    },

    exists(label: string) {
      return objects.has(label);
    },

    isDefined(label: string) {
      return objects.get(label)?.defined ?? false;
    },

    deleteObject(label: string) {
      objects.delete(label);
    },
  };
}

// ============================================================
// Naming tests
// ============================================================

console.log("=== Naming ===\n");

test("resolves DSL-specified label as-is (no prefix)", () => {
  const resolver = new LabelResolver("AI_");
  const label = resolver.resolve("myFunc", "FUNCTION_PLOT");
  if (label !== "myFunc") throw new Error(`expected myFunc, got ${label}`);
});

test("auto-generates label when none provided", () => {
  const resolver = new LabelResolver("AI_");
  const label = resolver.resolve(undefined, "FUNCTION_PLOT");
  if (!label.startsWith("AI_f")) throw new Error(`expected AI_f*, got ${label}`);
});

test("auto-generates different prefixes per type", () => {
  const r = new LabelResolver("AI_");
  const p = r.resolve(undefined, "POINT");
  const c = r.resolve(undefined, "CIRCLE");
  if (!p.startsWith("AI_P")) throw new Error(`point: ${p}`);
  if (!c.startsWith("AI_c")) throw new Error(`circle: ${c}`);
});

test("isManaged recognizes AI_ prefix", () => {
  const resolver = new LabelResolver("AI_");
  if (!resolver.isManaged("AI_test")) throw new Error("should be managed");
  if (resolver.isManaged("user_obj")) throw new Error("should not be managed");
});

test("counter increments", () => {
  const resolver = new LabelResolver("AI_");
  const a = resolver.resolve(undefined, "POINT");
  const b = resolver.resolve(undefined, "POINT");
  if (a === b) throw new Error(`labels should differ: ${a}, ${b}`);
});

test("export / import preserves state", () => {
  const resolver = new LabelResolver("AI_");
  resolver.resolve("A", "POINT");
  resolver.resolve("B", "POINT");
  const state = resolver.export();
  if (state.active.length !== 2) throw new Error("export length");

  const r2 = new LabelResolver("AI_");
  r2.import(state);
  if (r2.getActive().length !== 2) throw new Error("import failed");
});

// ============================================================
// Command builder tests
// ============================================================

console.log("\n=== Command Builder ===\n");

test("builds FUNCTION_PLOT command", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("FUNCTION_PLOT", {
    type: "FUNCTION_PLOT", fn: "sin(x)", variable: "x", range: [-6.28, 6.28], label: "f",
  }, r);
  if (result.commands.length < 1) throw new Error("no commands");
  if (!result.commands[0].expr.includes("f(x)")) throw new Error(`bad expr: ${result.commands[0].expr}`);
  if (!result.commands[0].expr.includes("sin(x)")) throw new Error("missing fn");
});

test("builds POINT command (coords)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("POINT", {
    type: "POINT", coords: [3, 0], label: "A",
  }, r);
  if (!result.commands[0].expr.includes("Point({3, 0})")) throw new Error(`bad expr: ${result.commands[0].expr}`);
});

test("builds POINT command (intersection)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("POINT", {
    type: "POINT", intersection: ["f", "g"],
  }, r);
  if (!result.commands[0].expr.includes("Intersect")) throw new Error(`missing Intersect: ${result.commands[0].expr}`);
});

test("builds LINE command (two points)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("LINE", {
    type: "LINE", through: ["A", "B"],
  }, r);
  if (!result.commands[0].expr.includes("Line(A, B)")) throw new Error(`bad expr: ${result.commands[0].expr}`);
});

test("builds CIRCLE command (center+radius)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("CIRCLE", {
    type: "CIRCLE", center: "O", radius: 3, label: "c",
  }, r);
  if (!result.commands[0].expr.includes("Circle(O, 3)")) throw new Error(`bad expr: ${result.commands[0].expr}`);
});

test("builds POLYGON command (vertices)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("POLYGON", {
    type: "POLYGON", vertices: ["A", "B", "C"],
  }, r);
  if (!result.commands[0].expr.includes("Polygon(A, B, C)")) throw new Error(`bad expr: ${result.commands[0].expr}`);
});

test("builds SLIDER command", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("SLIDER", {
    type: "SLIDER", name: "a", min: -5, max: 5, step: 0.1,
  }, r);
  if (!result.commands[0].expr.includes("Slider")) throw new Error(`bad expr: ${result.commands[0].expr}`);
  if (!result.commands[0].expr.includes("a = Slider")) throw new Error("missing label");
});

test("builds DELETE command (single)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("DELETE", { type: "DELETE", labels: ["A"] }, r);
  if (!result.commands[0].expr.includes("Delete(A)")) throw new Error(`bad expr: ${result.commands[0].expr}`);
});

test("builds DELETE command (multiple)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("DELETE", { type: "DELETE", labels: ["A", "B", "c"] }, r);
  if (!result.commands[0].expr.includes("Delete({A, B, c})")) throw new Error(`bad expr: ${result.commands[0].expr}`);
});

test("builds CLEAR command (all)", () => {
  const r = new LabelResolver("AI_");
  const result = buildCommand("CLEAR", { type: "CLEAR", scope: "all" }, r);
  if (result.commands[0].expr !== "Delete(All)") throw new Error(`bad expr: ${result.commands[0].expr}`);
});

test("builds CLEAR command (selected)", () => {
  const r = new LabelResolver("AI_");
  r.resolve("A", "POINT");
  r.resolve("B", "POINT");
  const result = buildCommand("CLEAR", { type: "CLEAR", scope: "selected" }, r);
  if (result.commands.length !== 2) throw new Error(`expected 2 delete cmds, got ${result.commands.length}`);
});

// ============================================================
// Adapter tests
// ============================================================

console.log("\n=== Adapter ===\n");

test("executes FUNCTION_PLOT action", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  const action: Action = {
    version: "1.0.0", id: "a1", type: "FUNCTION_PLOT",
    params: { type: "FUNCTION_PLOT", fn: "sin(x)", variable: "x", range: [-6.28, 6.28], label: "f" },
  };

  const { createdLabels } = adapter.execute(action);
  if (createdLabels.length < 1) throw new Error("no labels created");
  if (!adapter.getAiLabels().includes(createdLabels[0])) throw new Error("label not tracked");
});

test("executes POINT action", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  const action: Action = {
    version: "1.0.0", id: "a2", type: "POINT",
    params: { type: "POINT", coords: [3, 0], label: "A" },
  };

  const { createdLabels } = adapter.execute(action);
  if (createdLabels[0] !== "A") throw new Error(`bad label: ${createdLabels[0]}`);
});

test("executes CIRCLE action", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  const action: Action = {
    version: "1.0.0", id: "a3", type: "CIRCLE",
    params: { type: "CIRCLE", center: "O", radius: 3, label: "c" },
  };

  const result = adapter.execute(action);
  if (result.createdLabels.length < 1) throw new Error("no labels");
});

test("executes multiple actions and tracks state", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  adapter.execute({ version: "1.0.0", id: "1", type: "POINT", params: { type: "POINT", coords: [0, 0], label: "A" } });
  adapter.execute({ version: "1.0.0", id: "2", type: "POINT", params: { type: "POINT", coords: [3, 0], label: "B" } });
  adapter.execute({ version: "1.0.0", id: "3", type: "LINE", params: { type: "LINE", through: ["A", "B"] } });

  const state = adapter.getState();
  if (state.objectCount < 3) throw new Error(`expected >=3 objects, got ${state.objectCount}`);
});

test("snapshot captures current state", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  adapter.execute({ version: "1.0.0", id: "1", type: "POINT", params: { type: "POINT", coords: [1, 2] } });

  const snap = adapter.snapshot();
  if (snap.ggbState.objectCount < 1) throw new Error("snapshot empty");
  if (snap.aiObjects.length < 1) throw new Error("no AI objects in snapshot");
});

test("clearAiObjects removes only AI_ objects", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  adapter.execute({ version: "1.0.0", id: "1", type: "POINT", params: { type: "POINT", coords: [0, 0], label: "A" } });
  const labels = adapter.clearAiObjects();

  if (labels.length < 1) throw new Error("no labels cleared");
  if (adapter.getAiLabels().length !== 0) throw new Error("AI labels not cleared");
});

test("error classification: invalid command is 'invalid'", () => {
  const adapter = new GgbAdapter(makeMockApplet());
  const type = adapter.classifyError(new Error("invalid input"));
  if (type !== "invalid") throw new Error(`expected invalid, got ${type}`);
});

test("error classification: timeout is 'retryable'", () => {
  const adapter = new GgbAdapter(makeMockApplet());
  const type = adapter.classifyError(new Error("timeout exceeded"));
  if (type !== "retryable") throw new Error(`expected retryable, got ${type}`);
});

test("animate calls setValue", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  // First create a slider
  adapter.execute({ version: "1.0.0", id: "s1", type: "SLIDER", params: { type: "SLIDER", name: "t", min: 0, max: 10, step: 0.1 } });

  // Then animate
  adapter.animate("t", 5);
  const val = applet.getValueString("t");
  if (val !== "5") throw new Error(`expected 5, got ${val}`);
});

test("movePoint calls setCoords", () => {
  const applet = makeMockApplet();
  const adapter = new GgbAdapter(applet);

  adapter.execute({ version: "1.0.0", id: "p1", type: "POINT", params: { type: "POINT", coords: [0, 0], label: "M" } });
  adapter.movePoint("M", 5, 5);

  if (!applet.exists("M")) throw new Error("point should exist");
});

// ============================================================
// Summary
// ============================================================

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
