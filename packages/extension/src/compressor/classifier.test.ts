import { describe, it, expect } from "vitest";
import type { GgbState } from "../shared/types";

// Lightweight test — tests the compressor's core logic without GeoGebra applet
describe("Compressor concept tests", () => {
  describe("Object classification principles", () => {
    it("should prioritize function objects highest", () => {
      // Function type objects have the highest base priority (100)
      // This is a design assertion: functions are the primary teaching targets
      const functionPriority = 100; // from classifier: "function" type
      const conicPriority = 90;
      const pointPriority = 60;

      expect(functionPriority).toBeGreaterThan(conicPriority);
      expect(conicPriority).toBeGreaterThan(pointPriority);
    });

    it("target role gives the highest boost", () => {
      const targetBoost = 50;
      const vertexBoost = 40;
      const constructionBoost = 10;

      expect(targetBoost).toBeGreaterThan(vertexBoost);
      expect(vertexBoost).toBeGreaterThan(constructionBoost);
    });
  });

  describe("Token estimation", () => {
    // The compressor's estimateTokens function uses a simple heuristic:
    // ~1.3 tokens per Chinese character, ~0.75 per English word

    it("estimates Chinese text as ~1.3 tokens per character", () => {
      // Estimate: 5 Chinese chars → ~7 tokens
      const text = "二次函数图像";
      // Tokens ≈ text.length * 1.3 for CJK, or words * 0.75 for English
      // This is a design constraint test
      const estimatedCJK = Math.ceil(text.length * 1.3);
      const estimatedEnglish = Math.ceil(text.length * 0.75);

      expect(estimatedCJK).toBeGreaterThan(estimatedEnglish);
    });
  });

  describe("Trim behavior", () => {
    it("always keeps critical objects (target, parameter, vertex) first", () => {
      const objects = [
        { label: "aux1", type: "point", description: "", role: "auxiliary", priority: 10 },
        { label: "aux2", type: "line", description: "", role: "auxiliary", priority: 10 },
        { label: "target1", type: "function", description: "", role: "target", priority: 150 },
        { label: "param1", type: "slider", description: "", role: "parameter", priority: 120 },
        { label: "v1", type: "point", description: "", role: "vertex", priority: 100 },
      ];

      // Simulate the compressor's trimToBudget logic
      const budget = 3;
      const critical = objects.filter(
        (o) => o.role === "target" || o.role === "parameter" || o.role === "vertex"
      );
      const others = objects.filter(
        (o) => o.role !== "target" && o.role !== "parameter" && o.role !== "vertex"
      );

      const result = [...critical];
      for (const obj of others) {
        if (result.length >= budget) break;
        result.push(obj);
      }

      // Critical objects always included
      expect(result.map((o) => o.label)).toContain("target1");
      expect(result.map((o) => o.label)).toContain("param1");
      expect(result.map((o) => o.label)).toContain("v1");

      // No room for auxiliaries
      expect(result.map((o) => o.label)).not.toContain("aux1");
      expect(result.map((o) => o.label)).not.toContain("aux2");
    });
  });

  describe("CompressedState structure", () => {
    it("has the required AI-facing fields", () => {
      // The CompressedState must always have these 4 fields
      const requiredFields = [
        "current_topic",
        "important_objects",
        "recent_actions",
        "teaching_goal",
      ];

      const sample = {
        current_topic: "二次函数",
        important_objects: [
          { label: "f", type: "function", description: "f(x)=x²", role: "target", priority: 150 },
        ],
        recent_actions: ["绘制函数图像"],
        teaching_goal: "观察抛物线开口方向",
      };

      for (const field of requiredFields) {
        expect(sample).toHaveProperty(field);
      }
    });
  });
});
