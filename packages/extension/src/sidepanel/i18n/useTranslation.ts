import { useSyncExternalStore, useCallback } from "react";
import { locales, getSystemLocale } from "./locales";
import type { LocaleKey, TranslationKey } from "./locales";

const STORAGE_KEY = "geogebra-copilot-locale";

let currentLocale: LocaleKey;

function getStoredLocale(): LocaleKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh-CN" || stored === "en") return stored;
  } catch { /* localStorage unavailable */ }
  return getSystemLocale();
}

const listeners: Array<() => void> = [];

function subscribeLocale(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function getLocale(): LocaleKey {
  return currentLocale;
}

export function setLocale(locale: LocaleKey): void {
  currentLocale = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* noop */ }
  for (const cb of listeners) cb();
}

// Initialize on module load
currentLocale = getStoredLocale();

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = locales[currentLocale] ?? locales["zh-CN"];
  let value: string | undefined = dict[key];
  if (value === undefined) {
    value = locales["zh-CN"][key];
  }
  if (value === undefined) return key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}

export function useTranslation() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);

  const _t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => t(key, params),
    [locale]
  );

  return { t: _t, locale, setLocale };
}
