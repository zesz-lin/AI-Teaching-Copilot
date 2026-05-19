import { useRef, useEffect } from "react";
import { useStore } from "../store";
import { useTranslation } from "../i18n";

const stateColor: Record<string, string> = {
  FAILED: "text-danger",
  ABORTED: "text-warn",
  COMPLETED: "text-success",
  RUNNING: "text-accent",
};

export function LogPanel() {
  const entries = useStore((s) => s.logEntries);
  const clearLogs = useStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-panel-muted">
          <div className="text-3xl mb-2">📋</div>
          <div className="text-sm">{t("log.empty.title")}</div>
          <div className="text-xs mt-1 text-panel-muted/60">
            {t("log.empty.description")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-panel-border">
        <span className="text-xs text-panel-muted">{t("log.entry_count", { count: entries.length })}</span>
        <button
          onClick={clearLogs}
          className="text-xs text-panel-muted hover:text-danger transition-colors"
        >
          {t("log.clear")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.seq}
            className="px-3 py-1.5 border-b border-panel-border/30 text-xs font-mono hover:bg-panel-surface/50"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-panel-muted/60 shrink-0">
                #{entry.seq}
              </span>
              <span className={stateColor[entry.toEngineState] || "text-panel-muted"}>
                {entry.toEngineState}
              </span>
              {entry.actionId && (
                <span className="text-panel-muted/50 truncate">
                  {entry.actionId}
                </span>
              )}
              <span className="text-panel-muted/40 shrink-0 ml-auto">
                {new Date(entry.timestamp).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
            <div className="text-panel-text mt-0.5 truncate">{entry.message}</div>
            {entry.error && (
              <div className="text-danger mt-0.5 truncate">{entry.error}</div>
            )}
            {entry.durationMs != null && (
              <div className="text-panel-muted/50">{entry.durationMs}ms</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
