// ============================================================
// SW lifecycle — restore state when woken up
// ============================================================

import { getAllSessions } from "../session/store";
import { restoreSession } from "../engine-manager";

const ENGINE_SESSION_PREFIX = "engine_session_";

/**
 * Called at SW startup. Restores any surviving engine sessions from
 * chrome.storage.session. Memory-only references (Port objects,
 * pending callbacks) are naturally lost and will be re-established
 * when the sidepanel reconnects.
 */
export async function reviveSessions(): Promise<void> {
  // 1. Restore tab sessions (GGB readiness state)
  const sessions = await getAllSessions();
  if (sessions.length > 0) {
    console.log(
      `[SW] Revived ${sessions.length} session(s) from storage:`,
      sessions.map((s) => `tab=${s.tabId} ready=${s.ggbReady}`)
    );
  }

  // Clean up stale tab sessions for tabs that no longer exist
  const allTabs = await chrome.tabs.query({});
  const existingIds = new Set(allTabs.map((t) => t.id).filter(Boolean));

  for (const session of sessions) {
    if (!existingIds.has(session.tabId)) {
      const { removeSession } = await import("../session/store");
      await removeSession(session.tabId);
      console.log(`[SW] Pruned stale session for tab ${session.tabId}`);
    }
  }

  // 2. Restore engine sessions
  const storage = await chrome.storage.session.get(null);
  const engineKeys = Object.keys(storage).filter((k) =>
    k.startsWith(ENGINE_SESSION_PREFIX)
  );

  if (engineKeys.length === 0) return;

  console.log(`[SW] Found ${engineKeys.length} persisted engine session(s)`);

  for (const key of engineKeys) {
    const tabId = parseInt(key.slice(ENGINE_SESSION_PREFIX.length), 10);

    // Only restore if the tab still exists
    if (!existingIds.has(tabId)) {
      await chrome.storage.session.remove(key);
      console.log(`[SW] Pruned stale engine session for tab ${tabId}`);
      continue;
    }

    // Port is null initially — will be set when sidepanel reconnects
    const session = await restoreSession(tabId, null);
    if (session) {
      console.log(
        `[SW] Restored engine session tab=${tabId} ` +
        `${session.engine.getStatus().completedSteps}/${session.engine.getStatus().totalSteps} steps done`
      );
    }
  }
}
