// Quick smoke test for DSL validators
import { validateAction, validateLessonPlan, validateActionSafe } from "./validators";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name} — ${e}`);
  }
}

console.log("=== Action Validation ===\n");

// Geometry
test("valid FUNCTION_PLOT", () => {
  validateAction({
    version: "1.0.0", id: "a1", type: "FUNCTION_PLOT",
    params: { type: "FUNCTION_PLOT", fn: "sin(x)", variable: "x", range: [-6.28, 6.28] },
  });
});

test("valid POINT (coords)", () => {
  validateAction({
    version: "1.0.0", id: "a2", type: "POINT",
    params: { type: "POINT", coords: [3, 0], label: "A" },
  });
});

test("valid POINT (intersection)", () => {
  validateAction({
    version: "1.0.0", id: "a2b", type: "POINT",
    params: { type: "POINT", intersection: ["f", "g"] },
  });
});

test("POINT rejects empty params", () => {
  const r = validateActionSafe({
    version: "1.0.0", id: "bad", type: "POINT",
    params: { type: "POINT" },
  });
  if (r.success) throw new Error("should have failed");
});

test("valid CIRCLE (center+radius)", () => {
  validateAction({
    version: "1.0.0", id: "a3", type: "CIRCLE",
    params: { type: "CIRCLE", center: "A", radius: 3 },
  });
});

test("valid CIRCLE (diameter)", () => {
  validateAction({
    version: "1.0.0", id: "a3b", type: "CIRCLE",
    params: { type: "CIRCLE", diameter: ["A", "B"] },
  });
});

test("valid POLYGON (vertices)", () => {
  validateAction({
    version: "1.0.0", id: "a4", type: "POLYGON",
    params: { type: "POLYGON", vertices: ["A", "B", "C"] },
  });
});

test("POLYGON rejects <3 vertices", () => {
  const r = validateActionSafe({
    version: "1.0.0", id: "bad", type: "POLYGON",
    params: { type: "POLYGON", vertices: ["A"] },
  });
  if (r.success) throw new Error("should have failed");
});

test("valid POLYGON (regular)", () => {
  validateAction({
    version: "1.0.0", id: "a5", type: "POLYGON",
    params: { type: "POLYGON", regular: { n: 6, center: "O", vertex: "A" } },
  });
});

test("valid SLIDER", () => {
  validateAction({
    version: "1.0.0", id: "a6", type: "SLIDER",
    params: { type: "SLIDER", name: "a", min: -5, max: 5, step: 0.1 },
  });
});

test("valid DELETE", () => {
  validateAction({
    version: "1.0.0", id: "a7", type: "DELETE",
    params: { type: "DELETE", labels: ["A", "B"] },
  });
});

test("valid CLEAR", () => {
  validateAction({
    version: "1.0.0", id: "a8", type: "CLEAR",
    params: { type: "CLEAR", scope: "all" },
  });
});

// Teaching
test("valid EXPLAIN", () => {
  validateAction({
    version: "1.0.0", id: "a9", type: "EXPLAIN",
    params: { type: "EXPLAIN", text: "Hello world" },
  });
});

test("valid HIGHLIGHT", () => {
  validateAction({
    version: "1.0.0", id: "a10", type: "HIGHLIGHT",
    params: { type: "HIGHLIGHT", targets: ["A", "f"], effect: "glow" },
  });
});

test("valid FOCUS_VIEW", () => {
  validateAction({
    version: "1.0.0", id: "a11", type: "FOCUS_VIEW",
    params: { type: "FOCUS_VIEW", target: "reset" },
  });
});

test("valid ANIMATE_STEP", () => {
  validateAction({
    version: "1.0.0", id: "a12", type: "ANIMATE_STEP",
    params: { type: "ANIMATE_STEP", animate: "t", duration: 3000 },
  });
});

test("valid PAUSE (click)", () => {
  validateAction({
    version: "1.0.0", id: "a13", type: "PAUSE",
    params: { type: "PAUSE", until: "click" },
  });
});

test("valid PAUSE (duration)", () => {
  validateAction({
    version: "1.0.0", id: "a13b", type: "PAUSE",
    params: { type: "PAUSE", until: "duration", duration: 3000 },
  });
});

test("valid ASK_OBSERVATION (text)", () => {
  validateAction({
    version: "1.0.0", id: "a14", type: "ASK_OBSERVATION",
    params: { type: "ASK_OBSERVATION", question: "What do you see?", answerType: "text" },
  });
});

test("valid ASK_OBSERVATION (choice)", () => {
  validateAction({
    version: "1.0.0", id: "a14b", type: "ASK_OBSERVATION",
    params: { type: "ASK_OBSERVATION", question: "What shape?", answerType: "choice", options: ["Circle", "Square"] },
  });
});

test("valid SHOW_RELATION", () => {
  validateAction({
    version: "1.0.0", id: "a15", type: "SHOW_RELATION",
    params: { type: "SHOW_RELATION", between: ["f", "g"], relation: "intersection" },
  });
});

console.log("\n=== LessonPlan Validation ===\n");

test("valid LessonPlan", () => {
  validateLessonPlan({
    version: "1.0.0",
    planId: "plan-001",
    topic: "正弦函数图像",
    level: "intermediate",
    steps: [
      {
        version: "1.0.0", id: "s1", type: "EXPLAIN",
        params: { type: "EXPLAIN", text: "让我们开始学习正弦函数" },
      },
      {
        version: "1.0.0", id: "s2", type: "FUNCTION_PLOT",
        params: { type: "FUNCTION_PLOT", fn: "sin(x)", variable: "x", range: [-6.28, 6.28] },
      },
      {
        version: "1.0.0", id: "s3", type: "ASK_OBSERVATION",
        params: { type: "ASK_OBSERVATION", question: "图像的周期是多少？", answerType: "number" },
      },
    ],
    meta: {
      createdAt: "2026-05-17T10:00:00Z",
      model: "claude-opus-4-7",
      promptSummary: "正弦函数教学",
    },
  });
});

test("LessonPlan rejects missing meta", () => {
  try {
    validateLessonPlan({
      version: "1.0.0",
      planId: "p",
      topic: "t",
      level: "beginner",
      steps: [],
    });
    throw new Error("should have failed (missing meta)");
  } catch (e) {
    if (e instanceof Error && e.message === "should have failed (missing meta)") throw e;
    // expected — validation threw
  }
});

test("LessonPlan rejects unknown action type", () => {
  try {
    validateLessonPlan({
      version: "1.0.0",
      planId: "p",
      topic: "t",
      level: "beginner",
      steps: [{ version: "1.0.0", id: "bad", type: "INVENT", params: {} }],
      meta: { createdAt: "2026-05-17T10:00:00Z", model: "x", promptSummary: "x" },
    });
  } catch {
    return; // expected — validation threw
  }
  throw new Error("should have failed (unknown type)");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
