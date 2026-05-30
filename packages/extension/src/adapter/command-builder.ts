// ============================================================
// DSL Action → GeoGebra evalCommand string
// ============================================================
//
// Each builder returns a plain string that can be passed directly
// to ggbApplet.evalCommand(). No eval(), no dynamic execution.

import type {
  FunctionPlotParams,
  PointParams,
  LineParams,
  CircleParams,
  PolygonParams,
  SliderParams,
  DeleteParams,
  ClearParams,
} from "../dsl/types";
import type { GgbCommand } from "../shared/types";
import type { LabelResolver } from "./naming";

function hexToRgbCommands(label: string, hex: string): GgbCommand[] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [];
  return [{ expr: `SetColor(${label}, ${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})` }];
}

const DASH_MAP: Record<string, number> = { solid: 0, dashed: 10, dotted: 20, dashdot: 30 };

function styleCommands(label: string, style?: { thickness?: number; dash?: string }): GgbCommand[] {
  const cmds: GgbCommand[] = [];
  if (style?.thickness !== undefined) {
    cmds.push({ expr: `SetThickness(${label}, ${style.thickness})` });
  }
  if (style?.dash !== undefined) {
    const val = DASH_MAP[style.dash] ?? 0;
    cmds.push({ expr: `SetLineStyle(${label}, ${val})` });
  }
  return cmds;
}

// ============================================================
// Builder interface
// ============================================================

export interface BuildResult {
  commands: GgbCommand[];
  labels: string[];
}

export type ParamType = "FUNCTION_PLOT" | "POINT" | "LINE" | "CIRCLE" | "POLYGON" | "SLIDER" | "DELETE" | "CLEAR";

// ============================================================
// FUNCTION_PLOT
// ============================================================

export function buildFunctionPlot(
  params: FunctionPlotParams,
  resolver: LabelResolver
): BuildResult {
  const label = resolver.resolve(params.label, "FUNCTION_PLOT");
  const { fn, variable } = params;

  // GgbSyntax: f(x) = expression
  let expr = `${label}(${variable}) = ${fn}`;

  // If range specified, wrap with Function() to limit domain
  if (params.range) {
    const [min, max] = params.range;
    expr = `${label}(${variable}) = If(${variable} >= ${min} && ${variable} <= ${max}, ${fn})`;
  }

  const commands: GgbCommand[] = [{ expr }];

  // If the AI gave a display-text label (e.g. "y=x²"), it won't be
  // usable as a GeoGebra object name — the resolver auto-generates
  // one. Set the caption so the legend shows the intended text.
  if (params.label && params.label !== label) {
    commands.push({ expr: `SetCaption(${label}, "${params.label.replace(/"/g, "'")}")` });
  }

  if (params.color) {
    commands.push(...hexToRgbCommands(label, params.color!));
  }
  if (params.style) {
    commands.push(...styleCommands(label, params.style));
  }

  return { commands, labels: [label] };
}

// ============================================================
// POINT
// ============================================================

export function buildPoint(
  params: PointParams,
  resolver: LabelResolver
): BuildResult {
  const label = resolver.resolve(params.label, "POINT");
  let expr: string;
  let timeout: number | undefined;

  if (params.coords) {
    const [x, y] = params.coords;
    if (params.snap === "grid") {
      expr = `${label} = Point({Round(${x}), Round(${y})})`;
    } else {
      expr = `${label} = Point({${x}, ${y}})`;
    }
  } else if (params.intersection) {
    const [a, b] = params.intersection;
    expr = `${label} = Intersect(${a}, ${b})`;
    timeout = 10_000; // Intersect can be slow
  } else if (params.onObject) {
    expr = `${label} = Point(${params.onObject}, ${params.param ?? 0.5})`;
  } else if (params.expr) {
    if (params.expr.includes("(")) {
      // Function call returning a point (e.g. Midpoint(A,B), Circumcenter(A,B,C))
      expr = `${label} = ${params.expr}`;
    } else {
      // Coordinate expression: (x(A)+x(B))/2, (y(A)+y(B))/2
      expr = `${label} = Point({${params.expr}})`;
    }
  } else {
    throw new Error("POINT requires coords, intersection, onObject, or expr");
  }

  const commands: GgbCommand[] = [{ expr, timeout }];

  if (params.color) {
    commands.push(...hexToRgbCommands(label, params.color!));
  }
  if (params.size) {
    commands.push({ expr: `SetPointSize(${label}, ${params.size})` });
  }

  return { commands, labels: [label] };
}

// ============================================================
// LINE
// ============================================================

export function buildLine(
  params: LineParams,
  resolver: LabelResolver
): BuildResult {
  const label = resolver.resolve(params.label, "LINE");
  let expr: string;

  if (params.through && params.through.length >= 2) {
    const [a, b] = params.through;
    expr = `${label} = Line(${a}, ${b})`;
  } else if (params.through && params.through.length === 1 && params.slope !== undefined) {
    expr = `${label} = Line(${params.through[0]}, ${params.slope})`;
  } else if (params.expr) {
    // e.g. "y = 2x + 1"
    expr = `${label}: ${params.expr}`;
  } else if (params.relation === "parallel" && params.through && params.target) {
    // GeoGebra's Line(point, line) creates a parallel line through point
    expr = `${label} = Line(${params.through[0]}, ${params.target})`;
  } else if (params.relation === "perpendicular" && params.through && params.target) {
    expr = `${label} = OrthogonalLine(${params.through[0]}, ${params.target})`;
  } else if (params.tangent && params.through) {
    const [x, y] = params.tangent.at;
    expr = `${label} = Tangent(${params.through[0]}, (${x}, ${y}))`;
  } else {
    throw new Error("LINE requires through points, point+slope, expr, or relation");
  }

  const commands: GgbCommand[] = [{ expr }];

  if (params.color) {
    commands.push(...hexToRgbCommands(label, params.color!));
  }
  if (params.style) {
    commands.push(...styleCommands(label, params.style));
  }

  return { commands, labels: [label] };
}

// ============================================================
// CIRCLE
// ============================================================

export function buildCircle(
  params: CircleParams,
  resolver: LabelResolver
): BuildResult {
  const label = resolver.resolve(params.label, "CIRCLE");
  let expr: string;

  if (params.center && params.radius !== undefined) {
    expr = `${label} = Circle(${params.center}, ${params.radius})`;
  } else if (params.center && params.throughPoint) {
    expr = `${label} = Circle(${params.center}, ${params.throughPoint})`;
  } else if (params.diameter) {
    const [a, b] = params.diameter;
    expr = `${label} = Circle(Midpoint(${a}, ${b}), ${a})`;
  } else if (params.through && params.through.length === 3) {
    const [a, b, c] = params.through;
    expr = `${label} = Circle(${a}, ${b}, ${c})`;
  } else if (params.expr) {
    expr = `${label}: ${params.expr}`;
  } else {
    throw new Error("CIRCLE requires center+radius, center+point, diameter, or 3 points");
  }

  const commands: GgbCommand[] = [{ expr }];

  if (params.color) {
    commands.push(...hexToRgbCommands(label, params.color!));
  }
  if (params.style) {
    commands.push(...styleCommands(label, params.style));
  }
  if (params.fillOpacity !== undefined) {
    commands.push({ expr: `SetFilling(${label}, ${params.fillOpacity})` });
  }

  return { commands, labels: [label] };
}

// ============================================================
// POLYGON
// ============================================================

export function buildPolygon(
  params: PolygonParams,
  resolver: LabelResolver
): BuildResult {
  const label = resolver.resolve(params.label, "POLYGON");
  let expr: string;

  if (params.vertices && params.vertices.length >= 3) {
    const verts = params.vertices.join(", ");
    expr = `${label} = Polygon(${verts})`;
  } else if (params.coords && params.coords.length >= 3) {
    const points = params.coords.map(([x, y]) => `(${x}, ${y})`).join(", ");
    expr = `${label} = Polygon(${points})`;
  } else if (params.regular) {
    const { n, center, vertex } = params.regular;
    // Create points for the n-gon then polygon
    // Alternative: use Rotate to generate points
    // Simple approach: create the two points and use Polygon(p1, p2, n)
    expr = `${label} = Polygon(${center}, ${vertex}, ${n})`;
    // Note: Polygon(center, vertex, n) creates a regular n-gon
  } else {
    throw new Error("POLYGON requires vertices, coords, or regular spec");
  }

  const commands: GgbCommand[] = [{ expr }];

  if (params.fillOpacity !== undefined) {
    commands.push({ expr: `SetFilling(${label}, ${params.fillOpacity})` });
  }

  return { commands, labels: [label] };
}

// ============================================================
// SLIDER
// ============================================================

export function buildSlider(
  params: SliderParams,
  resolver: LabelResolver
): BuildResult {
  const label = resolver.resolve(params.name, "SLIDER");
  const initial = params.initial ?? params.min;
  const speed = params.speed ?? 1;
  const width = params.width ?? 200;

  // GgbSyntax: name = Slider(min, max, increment, speed, width, isAngle, horizontal, animating, random)
  let expr: string;

  if (params.unit === "°") {
    // Angle slider
    expr = `${label} = Slider(${params.min}°, ${params.max}°, ${params.step}°, ${speed}, ${width}, true)`;
  } else {
    expr = `${label} = Slider(${params.min}, ${params.max}, ${params.step}, ${speed}, ${width})`;
  }

  const commands: GgbCommand[] = [{ expr }];

  // Set initial value explicitly
  if (initial !== params.min) {
    commands.push({ expr: `SetValue(${label}, ${initial})` });
  }

  // Animation direction
  if (params.animate) {
    commands.push({ expr: `StartAnimation(${label})` });
  }

  return { commands, labels: [label] };
}

// ============================================================
// DELETE
// ============================================================

export function buildDelete(params: DeleteParams): BuildResult {
  const labels = params.labels;
  let expr: string;

  if (labels.length === 1) {
    expr = `Delete(${labels[0]})`;
  } else {
    expr = `Delete({${labels.join(", ")}})`;
  }

  return {
    commands: [{ expr }],
    labels: [],
  };
}

// ============================================================
// CLEAR
// ============================================================

export function buildClear(
  params: ClearParams,
  resolver: LabelResolver
): BuildResult {
  const commands: GgbCommand[] = [];
  const deleted: string[] = [];

  if (params.scope === "all") {
    // Delete everything
    commands.push({ expr: "Delete(All)" });
    resolver.reset();
    return { commands, labels: [] };
  }

  // scope === "selected" — delete only AI_ objects
  const toDelete = params.keep
    ? resolver.getActive().filter((l) => !params.keep!.includes(l))
    : resolver.getActive();

  for (const label of toDelete) {
    commands.push({ expr: `Delete(${label})` });
    resolver.release(label);
    deleted.push(label);
  }

  return { commands, labels: [] };
}

// ============================================================
// Dispatch
// ============================================================

export function buildCommand(
  type: ParamType,
  params: Record<string, unknown>,
  resolver: LabelResolver
): BuildResult {
  switch (type) {
    case "FUNCTION_PLOT": return buildFunctionPlot(params as unknown as FunctionPlotParams, resolver);
    case "POINT":         return buildPoint(params as unknown as PointParams, resolver);
    case "LINE":          return buildLine(params as unknown as LineParams, resolver);
    case "CIRCLE":        return buildCircle(params as unknown as CircleParams, resolver);
    case "POLYGON":       return buildPolygon(params as unknown as PolygonParams, resolver);
    case "SLIDER":        return buildSlider(params as unknown as SliderParams, resolver);
    case "DELETE":        return buildDelete(params as unknown as DeleteParams);
    case "CLEAR":         return buildClear(params as unknown as ClearParams, resolver);
    default:
      throw new Error(`Unknown geometry type: ${type}`);
  }
}
