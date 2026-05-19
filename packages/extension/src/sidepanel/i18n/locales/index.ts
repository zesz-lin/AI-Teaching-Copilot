import zhCN from "./zh-CN";
import en from "./en";

export const locales = {
  "zh-CN": zhCN,
  en,
} as const;

export type LocaleKey = keyof typeof locales;
export type TranslationKey = keyof typeof zhCN;

export function getSystemLocale(): LocaleKey {
  try {
    const lang = navigator.language;
    if (lang.startsWith("zh")) return "zh-CN";
  } catch { /* SSR/node environment */ }
  return "en";
}
