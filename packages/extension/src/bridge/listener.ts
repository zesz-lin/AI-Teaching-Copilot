// ============================================================
// GeoGebra event listeners → postMessage to Content Script
// ============================================================

import type { AppMessage } from "../shared/messages";
import { buildEvent } from "../shared/messages";

type PostToCs = (msg: AppMessage) => void;

/**
 * Register listeners on the GeoGebra applet that forward events
 * back to the content script via postMessage.
 */
export function setupGgbListeners(postToCs: PostToCs): void {
  const ggb = window.ggbApplet;
  if (!ggb) return;

  // Object click
  const onObjectClick = (label: string) => {
    try {
      const coords = ggb.getCoords(label);
      postToCs(
        buildEvent("bridge", "sw", {
          type: "OBJECT_CLICKED",
          label,
          coords: [coords.x, coords.y],
        })
      );
    } catch {
      postToCs(
        buildEvent("bridge", "sw", {
          type: "OBJECT_CLICKED",
          label,
          coords: [0, 0],
        })
      );
    }
  };

  ggb.registerObjectClickListener(onObjectClick);

  // Construction step (object added)
  const onAdd = (_label: string) => {
    postToCs(
      buildEvent("bridge", "sw", {
        type: "CONSTRUCTION_STEP",
        stepIndex: ggb.getConstructionStep(),
      })
    );
  };

  ggb.registerAddListener(onAdd);
}
