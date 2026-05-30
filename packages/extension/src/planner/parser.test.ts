import { describe, it, expect } from "vitest";
import { parsePlannerResponse } from "./parser";

describe("parsePlannerResponse", () => {
  it("parses a valid planner response", () => {
    const raw = JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "FUNCTION_PLOT",
          params: {
            type: "FUNCTION_PLOT",
            fn: "x^2",
            variable: "x",
            range: [-5, 5],
          },
          meta: { reason: "绘制基础图像" },
        },
        {
          version: "1.0.0",
          id: "step-2",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "观察抛物线的形状",
          },
        },
      ],
      summary: "绘制二次函数并观察其形状",
    });

    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toHaveLength(2);
      expect(result.data.summary).toBe("绘制二次函数并观察其形状");
    }
  });

  it("handles markdown code fence wrapping", () => {
    const raw = '```json\n' + JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "POINT",
          params: { type: "POINT", coords: [0, 0], label: "O" },
        },
      ],
      summary: "在原点创建一个点",
    }) + '\n```';

    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
  });

  it("handles leading/trailing whitespace", () => {
    const raw = '\n\n  ' + JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "CIRCLE",
          params: { type: "CIRCLE", center: "O", radius: 3 },
        },
      ],
      summary: "画一个圆",
    }) + '  \n\n';

    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
  });

  it("rejects missing actions array", () => {
    const raw = JSON.stringify({ summary: "no actions" });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("actions");
    }
  });

  it("accepts empty actions array (valid edge case)", () => {
    const raw = JSON.stringify({ actions: [], summary: "empty" });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toHaveLength(0);
    }
  });

  it("rejects action with invalid version", () => {
    const raw = JSON.stringify({
      actions: [
        { version: "2.0.0", id: "step-1", type: "EXPLAIN", params: { type: "EXPLAIN", text: "hi" } },
      ],
      summary: "bad version",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects action with unknown type", () => {
    const raw = JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "UNKNOWN_TYPE",
          params: { type: "UNKNOWN_TYPE" },
        },
      ],
      summary: "bad type",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects action missing required params", () => {
    const raw = JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "FUNCTION_PLOT",
          params: { type: "FUNCTION_PLOT" }, // missing fn, variable, range
        },
      ],
      summary: "missing params",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects non-JSON input", () => {
    const result = parsePlannerResponse("not json at all");
    expect(result.success).toBe(false);
  });

  it("rejects invalid JSON", () => {
    const result = parsePlannerResponse('{ "actions": [}');
    expect(result.success).toBe(false);
  });

  it("validates POINT with coordinates", () => {
    const raw = JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "POINT",
          params: { type: "POINT", coords: [2, 3], label: "A" },
        },
      ],
      summary: "create a point",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
  });

  it("validates SLIDER with all params", () => {
    const raw = JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "SLIDER",
          params: {
            type: "SLIDER",
            name: "a",
            min: -5,
            max: 5,
            step: 0.1,
            initial: 1,
          },
        },
      ],
      summary: "create a slider",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
  });

  it("validates ASK_OBSERVATION with choices", () => {
    const raw = JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "ASK_OBSERVATION",
          params: {
            type: "ASK_OBSERVATION",
            question: "Which one?",
            answerType: "choice",
            options: ["A", "B", "C"],
          },
        },
      ],
      summary: "ask a question",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
  });

  it("handles AI prepending text before JSON", () => {
    const raw = "Here's the generated lesson plan:\n\n" + JSON.stringify({
      actions: [
        { version: "1.0.0", id: "step-1", type: "POINT", params: { type: "POINT", coords: [1, 2], label: "A" } },
      ],
      summary: "test",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
  });

  it("handles JSON with braces inside string values", () => {
    const raw = JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "EXPLAIN",
          params: { type: "EXPLAIN", text: "function f(x) = { x + 1 } has a brace", format: "plain" },
        },
      ],
      summary: "test",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
  });

  it("shows specific field name for missing required params", () => {
    const raw = JSON.stringify({
      actions: [
        { version: "1.0.0", id: "step-1", type: "FUNCTION_PLOT", params: { type: "FUNCTION_PLOT" } },
      ],
      summary: "missing fields",
    });
    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("fn");
      expect(result.error).toContain("variable");
      expect(result.error).toContain("range");
    }
  });

  it("parses all 15 action types correctly", () => {
    const actions = [
      { type: "FUNCTION_PLOT", params: { type: "FUNCTION_PLOT", fn: "x^2", variable: "x", range: [-5, 5] } },
      { type: "POINT", params: { type: "POINT", coords: [0, 0] } },
      { type: "LINE", params: { type: "LINE", expr: "y = x" } },
      { type: "CIRCLE", params: { type: "CIRCLE", center: "O", radius: 3 } },
      { type: "POLYGON", params: { type: "POLYGON", vertices: ["A", "B", "C"] } },
      { type: "SLIDER", params: { type: "SLIDER", name: "a", min: 0, max: 10, step: 0.1 } },
      { type: "DELETE", params: { type: "DELETE", labels: ["A"] } },
      { type: "CLEAR", params: { type: "CLEAR", scope: "all" } },
      { type: "EXPLAIN", params: { type: "EXPLAIN", text: "Hello" } },
      { type: "HIGHLIGHT", params: { type: "HIGHLIGHT", targets: ["A"], effect: "glow" } },
      { type: "FOCUS_VIEW", params: { type: "FOCUS_VIEW", target: "reset" } },
      { type: "ANIMATE_STEP", params: { type: "ANIMATE_STEP", animate: "P", duration: 1000 } },
      { type: "PAUSE", params: { type: "PAUSE", until: "click" } },
      { type: "ASK_OBSERVATION", params: { type: "ASK_OBSERVATION", question: "Q?", answerType: "text" } },
      { type: "SHOW_RELATION", params: { type: "SHOW_RELATION", between: ["A", "B"], relation: "intersection" } },
    ];

    const raw = JSON.stringify({
      actions: actions.map((a, i) => ({
        version: "1.0.0",
        id: `step-${i + 1}`,
        ...a,
      })),
      summary: "all types",
    });

    const result = parsePlannerResponse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toHaveLength(15);
    }
  });
});
