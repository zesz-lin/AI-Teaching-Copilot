// ============================================================
// Few-shot examples for the AI Teaching Planner
// ============================================================

import type { ChatMessage } from "./types";

// Each example is a user→assistant pair showing the expected behavior.
// The assistant output follows the strict JSON schema.

interface Example {
  user: string;
  assistant: string;
}

const examples: Example[] = [
  // ── Example 1: 二次函数基础 ──
  {
    user: "教我二次函数 y = x² 的图像，难度：初级",

    assistant: JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "step-1",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 二次函数 y = x²\n\n二次函数是形如 y = ax² + bx + c 的函数。\n今天我们学习最简单的二次函数：**y = x²**（a=1, b=0, c=0）。\n\n它的图像是一条开口向上的抛物线。",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "step-2",
          type: "FUNCTION_PLOT",
          params: { type: "FUNCTION_PLOT", fn: "x^2", variable: "x", range: [-5, 5], color: "#6366f1" },
          meta: { reason: "绘制 y=x² 图像，让学生看到抛物线形状" },
        },
        {
          version: "1.0.0",
          id: "step-3",
          type: "FOCUS_VIEW",
          params: { type: "FOCUS_VIEW", target: "region", xRange: [-6, 6], yRange: [-1, 10], animation: 500 },
          meta: { reason: "调整视图让学生看到完整的抛物线和顶点" },
        },
        {
          version: "1.0.0",
          id: "step-4",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 顶点\n\n抛物线 y = x² 的**顶点**在原点 (0, 0)。\n这是抛物线的最低点，也是**对称轴** x = 0 上的点。",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "step-5",
          type: "POINT",
          params: { type: "POINT", label: "顶点", coords: [0, 0], color: "#ef4444", size: 5 },
          meta: { reason: "标记顶点位置" },
        },
        {
          version: "1.0.0",
          id: "step-6",
          type: "HIGHLIGHT",
          params: { type: "HIGHLIGHT", targets: ["顶点"], effect: "pulse", duration: 1500, color: "#ef4444" },
          meta: { reason: "高亮顶点吸引注意力" },
        },
        {
          version: "1.0.0",
          id: "step-7",
          type: "ASK_OBSERVATION",
          params: {
            type: "ASK_OBSERVATION",
            question: "抛物线 y=x² 关于哪条直线对称？",
            answerType: "text",
            hint: "观察顶点左右两侧的图像形状",
            expectedAnswer: "y轴 或 x=0",
            storeKey: "symmetry_axis",
          },
        },
        {
          version: "1.0.0",
          id: "step-8",
          type: "LINE",
          params: { type: "LINE", expr: "x=0", color: "#22c55e", style: { dash: "dashed", thickness: 2 } },
          meta: { reason: "绘制对称轴 x=0" },
        },
        {
          version: "1.0.0",
          id: "step-9",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 对称轴\n\ny = x² 的对称轴是 **x = 0**（y 轴）。\n对于 y = ax² + bx + c，对称轴公式为 **x = -b/(2a)**。\n这里 a=1, b=0，所以对称轴 x = 0。",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "step-10",
          type: "SLIDER",
          params: { type: "SLIDER", name: "a", min: -4, max: 4, step: 0.1, initial: 1, width: 200, position: [5, 8] },
          meta: { reason: "添加参数滑块，探索 a 对抛物线的影响" },
        },
        {
          version: "1.0.0",
          id: "step-11",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 探索：改变参数 a\n\n拖动滑块改变 a 的值，观察 y = ax² 的图像变化：\n- 当 |a| > 1 时，抛物线变窄\n- 当 0 < |a| < 1 时，抛物线变宽\n- 当 a < 0 时，开口向下",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "step-12",
          type: "ASK_OBSERVATION",
          params: {
            type: "ASK_OBSERVATION",
            question: "把 a 调到 -2，y = -2x² 的图像开口向哪个方向？为什么？",
            answerType: "text",
            hint: "注意 a 的符号",
            expectedAnswer: "向下，因为 a<0",
            storeKey: "negative_a",
          },
        },
      ],
      summary: "y=x² 图像教学：从绘制抛物线开始，引导观察顶点和对称轴，通过滑块探索参数 a 的影响，以互动提问加深理解。共12步，约15分钟。",
    }),
  },

  // ── Example 2: 三角形内切圆 ──
  {
    user: "展示三角形的内切圆怎么画",

    assistant: JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "geo-1",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 三角形的内切圆\n\n**内切圆**（inscribed circle）是与三角形三边都相切的圆。\n内切圆的圆心是三角形**角平分线的交点**，称为**内心**（incenter）。",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "geo-2",
          type: "POLYGON",
          params: {
            type: "POLYGON",
            coords: [[0, 0], [6, 0], [2, 5]],
            fillColor: "#6366f120",
            fillOpacity: 0.15,
            showEdges: true,
          },
          meta: { reason: "构造三角形 ABC" },
        },
        {
          version: "1.0.0",
          id: "geo-3",
          type: "POINT",
          params: { type: "POINT", label: "A", coords: [0, 0], size: 4, color: "#6366f1" },
        },
        {
          version: "1.0.0",
          id: "geo-4",
          type: "POINT",
          params: { type: "POINT", label: "B", coords: [6, 0], size: 4, color: "#6366f1" },
        },
        {
          version: "1.0.0",
          id: "geo-5",
          type: "POINT",
          params: { type: "POINT", label: "C", coords: [2, 5], size: 4, color: "#6366f1" },
        },
        {
          version: "1.0.0",
          id: "geo-6",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 步骤一：作角平分线\n\n分别作 ∠A、∠B、∠C 的角平分线。三条角平分线交于一点——**内心 I**。",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "geo-7",
          type: "LINE",
          params: { type: "LINE", expr: "AngleBisector(A, B, C)", color: "#f59e0b", style: { dash: "dashed" } },
          meta: { reason: "∠B 的角平分线" },
        },
        {
          version: "1.0.0",
          id: "geo-8",
          type: "LINE",
          params: { type: "LINE", expr: "AngleBisector(C, A, B)", color: "#f59e0b", style: { dash: "dashed" } },
          meta: { reason: "∠A 的角平分线" },
        },
        {
          version: "1.0.0",
          id: "geo-9",
          type: "POINT",
          params: { type: "POINT", label: "I", intersection: ["bisector_B", "bisector_A"], color: "#ef4444", size: 5 },
          meta: { reason: "内心 I = 角平分线交点" },
        },
        {
          version: "1.0.0",
          id: "geo-10",
          type: "HIGHLIGHT",
          params: { type: "HIGHLIGHT", targets: ["I"], effect: "glow", duration: 2000, color: "#ef4444" },
          meta: { reason: "高亮内心" },
        },
        {
          version: "1.0.0",
          id: "geo-11",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 步骤二：作内切圆\n\n以内心 I 为圆心，I 到任意一边的垂线距离为半径，即可作出内切圆。\n内心到三边的距离相等——这是内心的关键性质。",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "geo-12",
          type: "CIRCLE",
          params: { type: "CIRCLE", center: "I", expr: "Distance(I, AB)", fillColor: "#22c55e30", fillOpacity: 0.15, color: "#22c55e", style: { thickness: 2 } },
          meta: { reason: "以 I 为圆心、到 AB 的距离为半径作内切圆" },
        },
        {
          version: "1.0.0",
          id: "geo-13",
          type: "SHOW_RELATION",
          params: { type: "SHOW_RELATION", between: ["I", "AB", "BC", "CA"], relation: "equal", style: "text", duration: 3000 },
          meta: { reason: "标注内心到三边距离相等的性质" },
        },
        {
          version: "1.0.0",
          id: "geo-14",
          type: "ASK_OBSERVATION",
          params: {
            type: "ASK_OBSERVATION",
            question: "内心 I 到三角形三边的距离有什么关系？",
            answerType: "text",
            hint: "观察圆的半径",
            expectedAnswer: "相等",
            storeKey: "incenter_distance",
          },
        },
      ],
      summary: "三角形内切圆教学：先构造三角形，作两条角平分线确定内心，以内心到边的距离为半径画内切圆，展示等距性质。共14步。",
    }),
  },

  // ── Example 3: 正弦函数图像变换 ──
  {
    user: "解释正弦函数 y = A sin(ωx + φ) 的图像变换",

    assistant: JSON.stringify({
      actions: [
        {
          version: "1.0.0",
          id: "trig-1",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 正弦函数的图像变换\n\n正弦函数的一般形式：**y = A sin(ωx + φ)**\n\n三个参数：\n- **A** — 振幅（Amplitude），控制波的高度\n- **ω** — 角频率（Angular frequency），控制周期 T = 2π/ω\n- **φ** — 初相（Phase），控制水平平移",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "trig-2",
          type: "FUNCTION_PLOT",
          params: { type: "FUNCTION_PLOT", fn: "sin(x)", variable: "x", range: [-2 * Math.PI, 4 * Math.PI], color: "#6366f1", label: "y=sin(x)" },
          meta: { reason: "基准图像 y=sin(x)" },
        },
        {
          version: "1.0.0",
          id: "trig-3",
          type: "FOCUS_VIEW",
          params: { type: "FOCUS_VIEW", target: "region", xRange: [-6.28, 12.56], yRange: [-3, 3], animation: 400 },
        },
        {
          version: "1.0.0",
          id: "trig-4",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 振幅 A\n\ny = A sin(x) 中，A 控制波的**高度**。\n- A = 1：振幅为 1，值域 [-1, 1]\n- A = 2：振幅为 2，值域 [-2, 2]\n\n关键点：正弦曲线的最高点和最低点的 y 坐标 ±A。",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "trig-5",
          type: "SLIDER",
          params: { type: "SLIDER", name: "A", min: 0.1, max: 3, step: 0.1, initial: 1, width: 200, position: [10, 2] },
          meta: { reason: "振幅滑块" },
        },
        {
          version: "1.0.0",
          id: "trig-6",
          type: "FUNCTION_PLOT",
          params: { type: "FUNCTION_PLOT", fn: "A*sin(x)", variable: "x", range: [-2 * Math.PI, 4 * Math.PI], color: "#ef4444", label: "y=A·sin(x)" },
          meta: { reason: "带振幅参数的图像" },
        },
        {
          version: "1.0.0",
          id: "trig-7",
          type: "ASK_OBSERVATION",
          params: {
            type: "ASK_OBSERVATION",
            question: "把 A 调到 2，y=2sin(x) 的最大值和最小值分别是多少？",
            answerType: "number",
            hint: "观察波的最高点和最低点",
            expectedAnswer: 2,
            storeKey: "amplitude_max",
          },
        },
        {
          version: "1.0.0",
          id: "trig-8",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 角频率 ω\n\ny = sin(ωx) 中，ω 控制**周期**。\n周期 T = **2π/ω**\n\n- ω = 1：周期 2π，一个完整波形\n- ω = 2：周期 π，频率加倍\n- ω = 0.5：周期 4π，频率减半",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "trig-9",
          type: "SLIDER",
          params: { type: "SLIDER", name: "ω", min: 0.2, max: 3, step: 0.1, initial: 1, width: 200, position: [10, 0.5] },
          meta: { reason: "角频率滑块" },
        },
        {
          version: "1.0.0",
          id: "trig-10",
          type: "FUNCTION_PLOT",
          params: { type: "FUNCTION_PLOT", fn: "A*sin(ω*x)", variable: "x", range: [-2 * Math.PI, 4 * Math.PI], color: "#22c55e", label: "y=A·sin(ωx)" },
          meta: { reason: "带振幅和频率参数的图像" },
        },
        {
          version: "1.0.0",
          id: "trig-11",
          type: "ASK_OBSERVATION",
          params: {
            type: "ASK_OBSERVATION",
            question: "把 ω 调到 2，y=sin(2x) 在 0 到 2π 之间有几个完整的波长？",
            answerType: "number",
            hint: "数一数波峰或波谷的数量",
            expectedAnswer: 2,
            storeKey: "frequency_count",
          },
        },
        {
          version: "1.0.0",
          id: "trig-12",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 初相 φ\n\ny = sin(x + φ) 中，φ 控制**水平平移**。\n- φ > 0：图像向左平移 φ 个单位\n- φ < 0：图像向右平移 |φ| 个单位\n\n注意：sin(x + π/2) = cos(x)！",
            format: "markdown",
          },
        },
        {
          version: "1.0.0",
          id: "trig-13",
          type: "SLIDER",
          params: { type: "SLIDER", name: "φ", min: -3.14, max: 3.14, step: 0.1, initial: 0, width: 200, position: [10, -1], unit: "rad" },
          meta: { reason: "初相滑块，单位用弧度" },
        },
        {
          version: "1.0.0",
          id: "trig-14",
          type: "FUNCTION_PLOT",
          params: { type: "FUNCTION_PLOT", fn: "A*sin(ω*x+φ)", variable: "x", range: [-2 * Math.PI, 4 * Math.PI], color: "#f59e0b", label: "y=A·sin(ωx+φ)" },
          meta: { reason: "完整参数图像" },
        },
        {
          version: "1.0.0",
          id: "trig-15",
          type: "ASK_OBSERVATION",
          params: {
            type: "ASK_OBSERVATION",
            question: "把 φ 调到 π/2（约1.57），y=sin(x+π/2) 的图像与哪个函数重合？",
            answerType: "text",
            hint: "观察关键点的位置",
            expectedAnswer: "cos(x)",
            storeKey: "phase_shift_cos",
          },
        },
        {
          version: "1.0.0",
          id: "trig-16",
          type: "EXPLAIN",
          params: {
            type: "EXPLAIN",
            text: "## 总结\n\n- **A**（振幅）：纵向拉伸/压缩，值域 [-A, A]\n- **ω**（角频率）：横向拉伸/压缩，周期 T = 2π/ω\n- **φ**（初相）：水平平移，sin(x+φ) 左移 φ\n\n三者可以组合使用，学习正弦函数是理解波动、声波、交流电的基础！",
            format: "markdown",
          },
        },
      ],
      summary: "正弦函数图像变换三参数教学：A（振幅）、ω（频率）、φ（初相），每个参数配有滑块互动和观察提问，最后总结三者作用。共16步。",
    }),
  },
];

// ============================================================
// Build few-shot messages from examples
// ============================================================

export function buildFewShotMessages(): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (const ex of examples) {
    msgs.push({ role: "user", content: ex.user });
    msgs.push({ role: "assistant", content: ex.assistant });
  }
  return msgs;
}
