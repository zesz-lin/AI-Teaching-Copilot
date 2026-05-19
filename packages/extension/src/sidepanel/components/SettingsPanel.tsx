import { useState, useEffect } from "react";
import { loadConfig, saveConfig } from "../../planner/config-store";
import type { PlannerConfig } from "../../planner/types";
import { DEFAULT_PLANNER_CONFIG } from "../../planner/types";
import { useTranslation, setLocale } from "../i18n";

const inputClass =
  "w-full px-2 py-1 text-xs rounded border border-panel-border bg-panel-bg text-panel-text focus:outline-none focus:border-accent transition-colors";
const labelClass = "text-[10px] font-medium text-panel-muted mb-0.5 block";

export function SettingsPanel() {
  const { t, locale } = useTranslation();
  const [config, setConfig] = useState<Partial<PlannerConfig>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);
  const [testError, setTestError] = useState("");

  useEffect(() => {
    loadConfig().then((c) => {
      if (c) {
        setConfig({
          apiEndpoint: c.apiEndpoint,
          apiKey: c.apiKey,
          model: c.model,
          maxTokens: c.maxTokens,
          temperature: c.temperature,
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (key: string, value: string | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleTest = async () => {
    const endpoint = config.apiEndpoint?.trim();
    const key = config.apiKey?.trim();
    const model = config.model?.trim();

    if (!endpoint) {
      setTestResult("failed");
      setTestError(t("settings.test_no_endpoint"));
      return;
    }
    if (!key) {
      setTestResult("failed");
      setTestError(t("settings.test_no_key"));
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestError("");

    try {
      // Send a minimal request — just verify connectivity + credentials
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model || DEFAULT_PLANNER_CONFIG.model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
        }),
      });

      if (resp.ok) {
        setTestResult("success");
      } else {
        const errText = await resp.text().catch(() => "");
        setTestResult("failed");
        setTestError(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      setTestResult("failed");
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-panel-muted">{t("settings.loading")}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div className="text-xs font-semibold text-panel-text">{t("settings.title")}</div>
      <p className="text-[10px] text-panel-muted">
        {t("settings.description")}
      </p>

      {/* Language */}
      <div>
        <label className={labelClass}>{t("settings.language")}</label>
        <div className="flex gap-2">
          <button
            onClick={() => setLocale("zh-CN")}
            className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
              locale === "zh-CN"
                ? "bg-accent text-white"
                : "bg-panel-surface text-panel-text hover:bg-panel-border"
            }`}
          >
            中文
          </button>
          <button
            onClick={() => setLocale("en")}
            className={`flex-1 py-1 rounded text-xs font-medium transition-colors ${
              locale === "en"
                ? "bg-accent text-white"
                : "bg-panel-surface text-panel-text hover:bg-panel-border"
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* API Endpoint */}
      <div>
        <label className={labelClass}>{t("settings.api_endpoint")}</label>
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          <span className="text-[9px] text-panel-muted self-center">{t("settings.provider_quick")}:</span>
          <button
            onClick={() => handleChange("apiEndpoint", "https://api.openai.com/v1/chat/completions")}
            className="px-1.5 py-0.5 rounded text-[9px] bg-panel-surface text-panel-text hover:bg-panel-border transition-colors"
          >OpenAI</button>
          <button
            onClick={() => handleChange("apiEndpoint", "https://api.deepseek.com/v1/chat/completions")}
            className="px-1.5 py-0.5 rounded text-[9px] bg-panel-surface text-panel-text hover:bg-panel-border transition-colors"
          >DeepSeek</button>
          <button
            onClick={() => handleChange("apiEndpoint", "http://localhost:11434/v1/chat/completions")}
            className="px-1.5 py-0.5 rounded text-[9px] bg-panel-surface text-panel-text hover:bg-panel-border transition-colors"
          >Ollama</button>
        </div>
        <input
          type="url"
          className={inputClass}
          value={config.apiEndpoint ?? ""}
          onChange={(e) => handleChange("apiEndpoint", e.target.value)}
          placeholder={DEFAULT_PLANNER_CONFIG.apiEndpoint}
        />
        <p className="text-[9px] text-panel-muted mt-0.5">
          {t("settings.api_endpoint_hint")}
        </p>
      </div>

      {/* API Key */}
      <div>
        <label className={labelClass}>{t("settings.api_key")}</label>
        <input
          type="password"
          className={inputClass}
          value={config.apiKey ?? ""}
          onChange={(e) => handleChange("apiKey", e.target.value)}
          placeholder="sk-…"
        />
        <p className="text-[9px] text-panel-muted mt-0.5">
          {t("settings.api_key_hint")}
        </p>
      </div>

      {/* Model */}
      <div>
        <label className={labelClass}>{t("settings.model")}</label>
        <input
          type="text"
          className={inputClass}
          value={config.model ?? ""}
          onChange={(e) => handleChange("model", e.target.value)}
          placeholder={DEFAULT_PLANNER_CONFIG.model}
        />
        <p className="text-[9px] text-panel-muted mt-0.5">
          {t("settings.model_hint")}
        </p>
      </div>

      {/* Max Tokens */}
      <div>
        <label className={labelClass}>{t("settings.max_tokens")}</label>
        <input
          type="number"
          className={inputClass}
          value={config.maxTokens ?? DEFAULT_PLANNER_CONFIG.maxTokens}
          onChange={(e) => handleChange("maxTokens", parseInt(e.target.value, 10) || 0)}
          min={256}
          max={16384}
        />
      </div>

      {/* Temperature */}
      <div>
        <label className={labelClass}>{t("settings.temperature")}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            className="flex-1 h-1 accent-accent min-w-0"
            value={config.temperature ?? DEFAULT_PLANNER_CONFIG.temperature}
            onChange={(e) => handleChange("temperature", parseFloat(e.target.value))}
          />
          <span className="text-xs text-panel-muted w-6 text-right shrink-0">
            {config.temperature ?? DEFAULT_PLANNER_CONFIG.temperature}
          </span>
        </div>
      </div>

      {/* Test connection */}
      <button
        onClick={handleTest}
        disabled={testing}
        className={`w-full py-1.5 rounded text-xs font-medium transition-colors active:scale-95 ${
          testing
            ? "bg-panel-surface text-panel-muted cursor-not-allowed"
            : testResult === "success"
              ? "bg-success-surface text-success"
              : testResult === "failed"
                ? "bg-danger-surface text-danger"
                : "bg-panel-surface text-panel-text hover:bg-panel-border"
        }`}
      >
        {testing
          ? t("settings.testing")
          : testResult === "success"
            ? t("settings.test_success")
            : testResult === "failed"
              ? t("settings.test_failed")
              : t("settings.test_connection")}
      </button>
      {testError && (
        <p className="text-[9px] text-danger break-all">{testError}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        className={`w-full py-1.5 rounded text-xs font-medium transition-colors active:scale-95 ${
          saved
            ? "bg-success-surface text-success"
            : "bg-accent text-white hover:bg-accent-hover"
        }`}
      >
        {saved ? t("settings.saved") : t("settings.save")}
      </button>

      {/* Status */}
      <div className="text-[10px] text-panel-muted p-2 rounded bg-panel-surface/50">
        <p className="font-medium mb-1">{t("settings.config_status")}</p>
        <p>{t("settings.config_endpoint", { value: config.apiEndpoint || t("settings.not_set") })}</p>
        <p>{t("settings.config_key", { value: config.apiKey ? "••••" + config.apiKey.slice(-4) : t("settings.not_set") })}</p>
        <p>{t("settings.config_model", { value: config.model || t("settings.not_set") })}</p>
      </div>
    </div>
  );
}
