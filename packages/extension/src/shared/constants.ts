// ============================================================
// Shared constants — channel names, tokens, timeouts
// ============================================================

/** chrome.runtime.connect() port name for sidepanel ↔ SW */
export const SIDEPANEL_PORT = "sidepanel";

/** postMessage token to prevent spoofed messages */
export const BRIDGE_TOKEN = "__ggb_copilot_bridge_v1__";

/** Max wait for a Bridge response (ms) */
export const BRIDGE_TIMEOUT_MS = 10_000;

/** Poll interval while waiting for ggbApplet (ms) */
export const GGB_POLL_INTERVAL_MS = 200;

/** Max time to wait for ggbApplet before giving up (ms) */
export const GGB_POLL_TIMEOUT_MS = 30_000;

/** data-bridge attribute on the injected <script> to prevent double injection */
export const BRIDGE_SCRIPT_ATTR = "ggb-copilot";
