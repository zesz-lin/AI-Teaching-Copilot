// ============================================================
// Planner config storage — persist API key in chrome.storage
// ============================================================

import type { PlannerConfig } from "./types";
import { DEFAULT_PLANNER_CONFIG } from "./types";

const STORAGE_KEY = "planner_config";

// Simple obfuscation key (not cryptographically secure, prevents casual reading)
const XOR_KEY = 0x47; // 'G' for GeoGebra

function obfuscatekey(key: string): string {
  let result = "";
  for (let i = 0; i < key.length; i++) {
    result += String.fromCharCode(key.charCodeAt(i) ^ XOR_KEY);
  }
  return btoa(result);
}

function deobfuscateKey(encoded: string): string {
  try {
    const decoded = atob(encoded);
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ XOR_KEY);
    }
    return result;
  } catch {
    return encoded; // Not obfuscated, return as-is
  }
}

export async function loadConfig(): Promise<PlannerConfig | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).apiKey === "string") {
      const config = { ...DEFAULT_PLANNER_CONFIG, ...raw } as PlannerConfig;
      // Deobfuscate API key
      if (config.apiKey) {
        config.apiKey = deobfuscateKey(config.apiKey);
      }
      return config;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(config: Partial<PlannerConfig>): Promise<void> {
  const existing = await loadConfig();
  const merged = { ...DEFAULT_PLANNER_CONFIG, ...existing, ...config };
  // Obfuscate API key before storing
  if (merged.apiKey) {
    merged.apiKey = obfuscatekey(merged.apiKey);
  }
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
