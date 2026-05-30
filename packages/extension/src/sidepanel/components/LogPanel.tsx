import { memo, useRef, useEffect, useState } from "react";
import { useStore } from "../store";
import { useTranslation } from "../i18n";

const stateColor: Record<string, string> = {
  FAILED: "text-danger",
  ABORTED: "text-warn",
  COMPLETED: "text-success",
  RUNNING: "text-accent",
};

export const LogPanel = memo(function LogPanel() {
  const entries = useStore((s) => s.logEntries);
  const aiRawResponses = useStore((s) => s.aiRawResponses);
  const clearLogs = useStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, aiRawResponses]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* AI Raw Responses section */}
      {aiRawResponses.length > 0 && (
        <div className="shrink-0 border-b border-panel-border">
          <div className="px-3 py-1.5 text-xs font-semibold text-panel-muted flex items-center justify-between">
            <span>AI 原始输出 ({aiRawResponses.length})</span>
            <span className="text-[10px] text-panel-muted/50">点击展开</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {aiRawResponses.map((resp, i) => (
              <div key={i} className="border-t border-panel-border/20">
                <button
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  className="w-full px-3 py-1 text-left text-xs font-mono text-panel-muted/70 hover:bg-panel-surface/50 truncate"
                >
                  #{i + 1} {resp.slice(0, 80)}...
                </button>
                {expandedIdx === i && (
                  <pre className="px-3 pb-2 text-[11px] font-mono text-panel-text whitespace-pre-wrap break-all bg-panel-surface/30">
                    {resp}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engine logs */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-panel-border shrink-0">
        <span className="text-xs text-panel-muted">{t("log.entry_count", { count: entries.length })}</span>
        <button
          onClick={clearLogs}
          className="text-xs text-panel-muted hover:text-danger transition-colors"
        >
          {t("log.clear")}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-panel-muted">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm">{t("log.empty.title")}</div>
            <div className="text-xs mt-1 text-panel-muted/60">
              {t("log.empty.description")}
            </div>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
});
