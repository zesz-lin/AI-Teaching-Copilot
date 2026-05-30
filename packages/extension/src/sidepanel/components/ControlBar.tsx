import { useTranslation } from "../i18n";

interface Props {
  onStop: () => void;
  onClear: () => void;
  onRerun: () => void;
  isRunning: boolean;
  isPaused: boolean;
  onResume: () => void;
  onSkip: () => void;
  onShowLog: () => void;
}

const btnBase =
  "flex items-center gap-0.5 px-1.5 py-1 rounded text-[11px] font-medium transition-colors active:scale-95";

export function ControlBar({
  onStop, onClear, onRerun,
  isRunning, isPaused, onResume, onSkip, onShowLog,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-panel-border bg-panel-surface/50 flex-wrap">
      {isRunning && !isPaused && (
        <button onClick={onStop} className={`${btnBase} bg-danger-surface text-danger`} aria-label={t("control.stop")}>
          <StopIcon /> {t("control.stop")}
        </button>
      )}
      {isPaused && (
        <>
          <button onClick={onResume} className={`${btnBase} bg-success-surface text-success`} aria-label={t("control.resume")}>
            <PlayIcon /> {t("control.resume")}
          </button>
          <button onClick={onSkip} className={`${btnBase} text-warn hover:bg-warn-surface`} aria-label={t("control.skip")}>
            <SkipIcon /> {t("control.skip")}
          </button>
        </>
      )}
      {!isRunning && (
        <button onClick={onRerun} className={`${btnBase} text-panel-text hover:bg-panel-border/50`} aria-label={t("control.rerun")}>
          <RerunIcon /> {t("control.rerun")}
        </button>
      )}

      <button onClick={onClear} className={`${btnBase} text-panel-text hover:bg-panel-border/50`} aria-label={t("control.clear")}>
        <ClearIcon /> {t("control.clear")}
      </button>

      <button onClick={onShowLog} className={`${btnBase} text-panel-text hover:bg-panel-border/50`} aria-label={t("app.tab.log")}>
        <LogIcon /> {t("app.tab.log")}
      </button>

    </div>
  );
}

// Inline SVG icons to avoid extra dependencies
function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="1" y="1" width="10" height="10" rx="1" />
    </svg>
  );
}

function RerunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 6a5 5 0 0 1 5-5 4.9 4.9 0 0 1 3.5 1.5M11 6a5 5 0 0 1-5 5 4.9 4.9 0 0 1-3.5-1.5" />
      <polyline points="9,2 11,2 11,4" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <polygon points="3,1 10,6 3,11" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="2,3 7,6 2,9" fill="currentColor" />
      <line x1="9" y1="2" x2="9" y2="10" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3l6 6M9 3l-6 6" />
      <rect x="1" y="1" width="10" height="10" rx="2" />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="10" height="8" rx="1" />
      <line x1="3" y1="5" x2="9" y2="5" />
      <line x1="3" y1="7" x2="7" y2="7" />
    </svg>
  );
}


