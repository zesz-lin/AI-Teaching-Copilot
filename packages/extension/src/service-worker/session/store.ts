// ============================================================
// Session store — chrome.storage.session wrapper
// ============================================================

import type { TabSession } from "../../shared/types";

const SESSION_PREFIX = "session_";

function sessionKey(tabId: number): string {
  return `${SESSION_PREFIX}${tabId}`;
}

export async function getSession(
  tabId: number
): Promise<TabSession | undefined> {
  const key = sessionKey(tabId);
  const result = await chrome.storage.session.get(key);
  return result[key] as TabSession | undefined;
}

export async function updateSession(
  tabId: number,
  data: Omit<TabSession, "tabId">
): Promise<void> {
  const session: TabSession = { tabId, ...data };
  await chrome.storage.session.set({ [sessionKey(tabId)]: session });
}

export async function removeSession(tabId: number): Promise<void> {
  await chrome.storage.session.remove(sessionKey(tabId));
}

export async function getAllSessions(): Promise<TabSession[]> {
  const result = await chrome.storage.session.get(null);
  return Object.entries(result)
    .filter(([key]) => key.startsWith(SESSION_PREFIX))
    .map(([, value]) => value as TabSession);
}
