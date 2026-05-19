// ============================================================
// Bridge script injector — injects bridge.js into page main world
// ============================================================

import { BRIDGE_SCRIPT_ATTR } from "../shared/constants";

/**
 * Inject the Bridge script as a <script> tag into the page.
 *
 * This runs the script in the page's "main world", giving it access
 * to window.ggbApplet — which is invisible to this content script
 * (isolated world).
 *
 * We guard against double injection by checking for our data attribute.
 */
export function injectBridge(): void {
  if (document.querySelector(`script[data-bridge="${BRIDGE_SCRIPT_ATTR}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.dataset.bridge = BRIDGE_SCRIPT_ATTR;
  script.src = chrome.runtime.getURL("bridge.js");
  script.async = false;

  (document.head || document.documentElement).appendChild(script);
}
