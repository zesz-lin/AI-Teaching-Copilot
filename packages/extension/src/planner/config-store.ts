// ============================================================
// Planner config storage — persist API key in chrome.storage
// ============================================================

import type { PlannerConfig } from "./types";
import { DEFAULT_PLANNER_CONFIG } from "./types";

const STORAGE_KEY = "planner_config";

export async function loadConfig(): Promise<PlannerConfig | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).apiKey === "string") {
      return { ...DEFAULT_PLANNER_CONFIG, ...raw } as PlannerConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(config: Partial<PlannerConfig>): Promise<void> {
  const existing = await loadConfig();
  const merged = { ...DEFAULT_PLANNER_CONFIG, ...existing, ...config };
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
}

export async function hasApiKey(): Promise<boolean> {
  const config = await loadConfig();
  return config !== null && config.apiKey.length > 0;
}

export async function getApiKey(): Promise<string | null> {
  const config = await loadConfig();
  return config?.apiKey ?? null;
}
