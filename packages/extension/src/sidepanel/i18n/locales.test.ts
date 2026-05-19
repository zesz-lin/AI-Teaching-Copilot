import { describe, it, expect } from "vitest";
import zhCN from "./locales/zh-CN";
import en from "./locales/en";

describe("i18n locale files", () => {
  it("zh-CN and en have the same keys", () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("all zh-CN values are non-empty", () => {
    for (const [key, value] of Object.entries(zhCN)) {
      expect(value, `Key "${key}" has empty value`).toBeTruthy();
    }
  });

  it("all en values are non-empty", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `Key "${key}" has empty value`).toBeTruthy();
    }
  });
});
