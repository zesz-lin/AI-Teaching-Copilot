// ============================================================
// GeoGebra API command executor
// ============================================================

import type { GgbCommand, GgbState } from "../shared/types";
import type { ExecResultItem } from "../shared/messages";

/**
 * Execute a sequence of GeoGebra commands.
 * Returns structured results for each command.
 * In non-silent mode, stops at the first error.
 *
 * Retries commands that fail with "Scripting commands not loaded"
 * (GeoGebra's GWT scripting engine may still be initializing even
 * after isReady() returns true).
 */
export async function execute(
  applet: { evalCommand(cmd: string): void } | undefined,
  commands: GgbCommand[]
): Promise<ExecResultItem[]> {
  if (!applet) {
    return commands.map((cmd) => ({
      command: cmd.expr,
      status: "error",
      error: "GeoGebra applet not available",
    }));
  }

  const results: ExecResultItem[] = [];

  for (const cmd of commands) {
    let lastError = "";
    let ok = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        applet.evalCommand(cmd.expr);
        results.push({ command: cmd.expr, status: "ok" });
        ok = true;
        break;
      } catch (e) {
        const errMsg: string = e instanceof Error ? (e as any).message ?? String(e) : String(e);
        lastError = errMsg;

        if (/scripting commands not loaded/i.test(errMsg) || /S394/i.test(errMsg)) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    if (!ok) {
      results.push({ command: cmd.expr, status: "error", error: lastError });
      if (!cmd.silent) break;
    }
  }

  return results;
}

/**
 * Query GeoGebra applet for state.
 */
export function getState(
  applet:
    | {
        isReady(): boolean;
        getObjectNumber(): number;
        getObjectName(i: number): string;
        getObjectType(label: string): string;
        getMode(): number;
        getPerspectiveXML(): string;
      }
    | undefined,
  _query: "applet_status" | "object_list" | "selected"
): GgbState {
  if (!applet) {
    return {
      appletReady: false,
      objectCount: 0,
      objects: [],
      mode: 0,
      perspective: "",
    };
  }

  const n = applet.getObjectNumber();
  const objects = [];
  for (let i = 0; i < Math.min(n, 100); i++) {
    const label = applet.getObjectName(i);
    objects.push({
      label,
      type: applet.getObjectType(label),
      defined: true,
    });
  }

  return {
    appletReady: typeof applet.isReady === "function" ? applet.isReady() : true,
    objectCount: n,
    objects,
    mode: applet.getMode(),
    perspective: applet.getPerspectiveXML(),
  };
}
