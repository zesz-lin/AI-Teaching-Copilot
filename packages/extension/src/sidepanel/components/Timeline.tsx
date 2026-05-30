import { memo } from "react";
import { useStore } from "../store";
import { useTranslation } from "../i18n";

export const Timeline = memo(function Timeline() {
  const steps = useStore((s) => s.steps);
  const currentStep = useStore((s) => s.currentStep);
  const advanceStep = useStore((s) => s.advanceStep);
  const { t } = useTranslation();

  if (steps.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-panel-muted">
          <div className="text-3xl mb-2">🕐</div>
          <div className="text-sm">{t("timeline.empty.title")}</div>
          <div className="text-xs mt-1 text-panel-muted/60">
            {t("timeline.empty.description")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      <div className="text-xs text-panel-muted mb-2">
        {t("timeline.step_count", { current: String(currentStep), total: String(steps.length) })}
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-panel-border" />

        <ol className="space-y-1">
          {steps.map((s, i) => {
            const isPast = i < currentStep;
            const isCurrent = i === currentStep;
            const isFuture = i > currentStep;

            return (
              <li key={s.step} className="relative flex items-start gap-3 pl-1">
                {/* Step circle */}
                <div
                  className={`relative z-10 shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border-2
                    ${isPast ? "bg-success border-success text-white" : ""}
                    ${isCurrent ? "bg-accent border-accent text-white" : ""}
                    ${isFuture ? "bg-panel-bg border-panel-border text-panel-muted" : ""}
                  `}
                >
                  {isPast ? "✓" : s.step}
                </div>

                {/* Step content */}
                <button
                  onClick={() => {
                    if (isCurrent) advanceStep();
                  }}
                  className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded text-sm transition-colors
                    ${isCurrent ? "bg-accent-surface border border-accent cursor-pointer" : ""}
                    ${isPast ? "text-panel-muted/70" : ""}
                    ${isFuture ? "text-panel-muted/50" : ""}
                    ${!isCurrent ? "cursor-default" : ""}
                  `}
                >
                  <div className={`font-medium ${isCurrent ? "text-accent" : ""}`}>
                    {s.description}
                  </div>
                  <div className="text-xs text-panel-muted mt-0.5">
                    {t("timeline.commands", { count: s.commands.length })} &middot; {s.expectedObservation}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
});
