import { useRef, useEffect, useState, useMemo } from "react";
import { useStore } from "./store";
import { useChannel } from "./hooks/useChannel";
import { useTranslation } from "./i18n";
import { ChatArea } from "./components/ChatArea";
import { InputBox } from "./components/InputBox";
import { ControlBar } from "./components/ControlBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { LogPanel } from "./components/LogPanel";
import { QuestionCard } from "./components/QuestionCard";

type Panel = "chat" | "settings" | "log";

const TABS: { key: Panel; labelKey: string }[] = [
  { key: "chat", labelKey: "app.tab.chat" },
  { key: "settings", labelKey: "app.tab.settings" },
];

export default function App() {
  const { t } = useTranslation();

  const tabs = useMemo(() => TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) })), [t]);
  const activePanel = useStore((s) => s.activePanel);
  const setActivePanel = useStore((s) => s.setActivePanel);
  const darkMode = useStore((s) => s.darkMode);

  // Apply dark mode to document (moved from store module-level side effect)
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);
  const toggleDarkMode = useStore((s) => s.toggleDarkMode);
  const isRunning = useStore((s) => s.isRunning);
  const execState = useStore((s) => s.execState);
  const activeQuestion = useStore((s) => s.activeQuestion);

  const {
    sendQuery,
    sendEngineControl,
    submitAnswer,
    skipQuestion,
    clearCanvas,
    rerun,
    stop,
  } = useChannel();

  const prevPanel = useRef(activePanel);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (prevPanel.current !== activePanel) {
      prevPanel.current = activePanel;
      setAnimKey((k) => k + 1);
    }
  }, [activePanel]);


  return (
    <div className="h-screen flex flex-col bg-panel-bg text-panel-text">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-2 py-1.5 border-b border-panel-border">
        <div className="flex items-center gap-2">
          <h1 className="text-xs font-semibold">{t("app.title")}</h1>
          {execState && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              execState.engineState === "RUNNING"
                ? "bg-accent-surface text-accent"
                : execState.engineState === "PAUSED"
                ? "bg-warn-surface text-warn"
                : execState.engineState === "COMPLETED"
                ? "bg-success-surface text-success"
                : "bg-panel-surface text-panel-muted"
            }`}>
              {execState.engineState === "RUNNING"
                ? `▶ ${execState.completedSteps}/${execState.totalSteps}`
                : execState.engineState === "PAUSED"
                ? `⏸ ${execState.completedSteps}/${execState.totalSteps}`
                : execState.engineState === "COMPLETED"
                ? t("engine.status.completed")
                : execState.engineState}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => chrome.tabs.create({ url: "https://www.geogebra.org/calculator" })}
            className="px-2 py-1 rounded text-[10px] font-medium bg-accent-surface text-accent hover:bg-accent hover:text-white transition-colors active:scale-95"
            title={t("app.open_geogebra")}
          >
            {t("app.open_geogebra")}
          </button>
          <button
            onClick={toggleDarkMode}
            className="p-1 rounded text-panel-muted hover:bg-panel-surface transition-colors active:scale-95"
            title={darkMode ? t("app.darkmode.tooltip.light") : t("app.darkmode.tooltip.dark")}
            aria-label={darkMode ? t("app.darkmode.tooltip.light") : t("app.darkmode.tooltip.dark")}
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* Control bar */}
      <ControlBar
        onStop={stop}
        onClear={clearCanvas}
        onRerun={rerun}
        isRunning={isRunning}
        isPaused={execState?.isPaused ?? false}
        onResume={() => sendEngineControl("resume")}
        onSkip={() => sendEngineControl("skip")}
        onShowLog={() => setActivePanel("log")}
      />

      {/* Status bar (when engine is running) */}
      {execState && execState.engineState !== "IDLE" && (
        <div className="shrink-0 px-2 py-1 bg-panel-surface/50 border-b border-panel-border">
          <div className="flex items-center gap-2">
            <div
              className={`flex-1 h-1 rounded-full bg-panel-border overflow-hidden ${
                execState.engineState === "RUNNING" ? "animate-pulse-progress" : ""
              }`}
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  execState.failedSteps > 0 ? "bg-warn" : "bg-accent"
                }`}
                style={{
                  width: `${execState.totalSteps > 0
                    ? (execState.completedSteps / execState.totalSteps) * 100
                    : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-panel-muted shrink-0">
              {execState.completedSteps}/{execState.totalSteps}
              {execState.failedSteps > 0 &&
                ` ${t("engine.status.failed_count", { count: execState.failedSteps })}`}
            </span>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <nav className="shrink-0 flex border-b border-panel-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActivePanel(t.key)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors border-b-2 active:scale-95
              ${
                activePanel === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-panel-muted hover:text-panel-text"
              }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Panel content */}
      <div key={animKey} className="flex-1 flex flex-col min-h-0 animate-fade-in-up">
        {activePanel === "chat" && <ChatArea />}
        {activePanel === "log" && <LogPanel />}
        {activePanel === "settings" && <SettingsPanel />}
      </div>

      {/* Active question (ASK_OBSERVATION from engine) */}
      {activeQuestion && (
        <QuestionCard
          actionId={activeQuestion.actionId}
          question={activeQuestion.question}
          answerType={activeQuestion.answerType}
          options={activeQuestion.options}
          onSubmit={submitAnswer}
          onSkip={skipQuestion}
        />
      )}

      {/* Input box (only on chat panel, when no question active) */}
      {activePanel === "chat" && !activeQuestion && (
        <InputBox onSend={sendQuery} disabled={isRunning} />
      )}

      {/* Input box (when question is active, replaced by answer input) */}
      {activePanel === "chat" && activeQuestion && (
        <div className="border-t border-panel-border px-3 py-2">
          <p className="text-[10px] text-panel-muted text-center">
            {t("input.question_hint")}
          </p>
        </div>
      )}
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="3" />
      <path d="M7 1v1M7 12v1M13 7h-1M2 7H1M11.24 2.76l-.71.71M3.47 10.53l-.71.71M11.24 11.24l-.71-.71M3.47 3.47l-.71-.71" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 8A5 5 0 0 1 6 3a4 4 0 0 0 5 5z" />
    </svg>
  );
}
