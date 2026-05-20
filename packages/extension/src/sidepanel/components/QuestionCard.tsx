import { useState, useMemo } from "react";
import { useTranslation } from "../i18n";
import katex from "katex";

function renderMath(text: string): string {
  let out = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  out = out.replace(/\$\$([^$]+)\$\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: true });
    } catch {
      return `<span class="md-math">$$${expr}$$</span>`;
    }
  });
  out = out.replace(/\$([^$]+)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: false });
    } catch {
      return `<span class="md-math">$${expr}$</span>`;
    }
  });
  return out;
}

interface QuestionCardProps {
  actionId: string;
  question: string;
  answerType: string;
  options?: string[];
  hint?: string;
  onSubmit: (actionId: string, answer: string) => void;
  onSkip: (actionId: string) => void;
}

const inputClass =
  "w-full px-2 py-1 text-xs rounded border border-panel-border bg-panel-bg text-panel-text focus:outline-none focus:border-accent transition-colors";
const btnClass =
  "px-2 py-0.5 rounded text-xs bg-accent-surface text-accent hover:opacity-80 transition-colors border border-transparent";
const submitClass =
  "shrink-0 px-3 py-1 rounded text-xs bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors active:scale-95";

export function QuestionCard({
  actionId,
  question,
  answerType,
  options,
  hint,
  onSubmit,
  onSkip,
}: QuestionCardProps) {
  const { t } = useTranslation();
  const [textAnswer, setTextAnswer] = useState("");
  const [numAnswer, setNumAnswer] = useState("");
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [numError, setNumError] = useState("");
  const [coordError, setCoordError] = useState("");

  const handleSubmitText = () => {
    if (!textAnswer.trim()) return;
    onSubmit(actionId, textAnswer.trim());
    setTextAnswer("");
  };

  const handleSubmitChoice = (opt: string) => {
    onSubmit(actionId, opt);
  };

  const handleSubmitNumber = () => {
    if (!numAnswer.trim()) return;
    const val = parseFloat(numAnswer);
    if (isNaN(val)) {
      setNumError(t("question.error.invalid_number"));
      return;
    }
    setNumError("");
    onSubmit(actionId, numAnswer.trim());
    setNumAnswer("");
  };

  const handleSubmitCoords = () => {
    if (!coordX.trim() || !coordY.trim()) {
      setCoordError(t("question.error.invalid_coords"));
      return;
    }
    const x = parseFloat(coordX);
    const y = parseFloat(coordY);
    if (isNaN(x) || isNaN(y)) {
      setCoordError(t("question.error.coords_not_number"));
      return;
    }
    setCoordError("");
    onSubmit(actionId, `(${coordX.trim()}, ${coordY.trim()})`);
    setCoordX("");
    setCoordY("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, handler: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handler();
    }
  };

  const answerTypeLabel: Record<string, string> = {
    text: t("question.type.text"),
    choice: t("question.type.choice"),
    number: t("question.type.number"),
    coords: t("question.type.coords"),
  };

  return (
    <div className="shrink-0 border-t-2 border-accent bg-accent-surface px-3 py-2 animate-slide-up">
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5">❓</span>
        <div className="flex-1 min-w-0">
          {/* Question text */}
          <div
            className="text-xs font-medium text-accent mb-1"
            dangerouslySetInnerHTML={{ __html: renderMath(question) }}
          />

          {/* Answer type badge & skip */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-block text-[9px] px-1 py-0.5 rounded bg-accent-surface text-accent">
              {answerTypeLabel[answerType] ?? answerType}
            </span>
            <button
              onClick={() => onSkip(actionId)}
              className="text-[9px] px-1.5 py-0.5 rounded text-panel-muted hover:text-panel-text hover:bg-panel-border transition-colors"
            >
              {t("question.skip")}
            </button>
          </div>

          {/* Hint */}
          {hint && (
            <div className="text-[10px] text-panel-muted mb-1.5">{hint}</div>
          )}

          {/* Choice answers */}
          {answerType === "choice" && options && options.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleSubmitChoice(opt)}
                  className={btnClass}
                  dangerouslySetInnerHTML={{ __html: renderMath(opt) }}
                />
              ))}
            </div>
          )}

          {/* Text answer */}
          {answerType === "text" && (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleSubmitText)}
                placeholder={t("question.input.placeholder")}
                className={inputClass}
                autoFocus
              />
              <button
                onClick={handleSubmitText}
                disabled={!textAnswer.trim()}
                className={submitClass}
              >
                {t("question.submit")}
              </button>
            </div>
          )}

          {/* Number answer */}
          {answerType === "number" && (
            <div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={numAnswer}
                  onChange={(e) => {
                    setNumAnswer(e.target.value);
                    setNumError("");
                  }}
                  onKeyDown={(e) => handleKeyDown(e, handleSubmitNumber)}
                  placeholder={t("question.input.placeholder.number")}
                  className={inputClass}
                  autoFocus
                />
                <button
                  onClick={handleSubmitNumber}
                  disabled={!numAnswer.trim()}
                  className={submitClass}
                >
                  {t("question.submit")}
                </button>
              </div>
              {numError && (
                <div className="text-[10px] text-danger mt-0.5">{numError}</div>
              )}
            </div>
          )}

          {/* Coords answer */}
          {answerType === "coords" && (
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-panel-muted shrink-0">(</span>
                <input
                  type="number"
                  value={coordX}
                  onChange={(e) => {
                    setCoordX(e.target.value);
                    setCoordError("");
                  }}
                  onKeyDown={(e) => handleKeyDown(e, handleSubmitCoords)}
                  placeholder="x"
                  className={`${inputClass} w-16`}
                  autoFocus
                />
                <span className="text-[10px] text-panel-muted shrink-0">,</span>
                <input
                  type="number"
                  value={coordY}
                  onChange={(e) => {
                    setCoordY(e.target.value);
                    setCoordError("");
                  }}
                  onKeyDown={(e) => handleKeyDown(e, handleSubmitCoords)}
                  placeholder="y"
                  className={`${inputClass} w-16`}
                />
                <span className="text-[10px] text-panel-muted shrink-0">)</span>
                <button
                  onClick={handleSubmitCoords}
                  disabled={!coordX.trim() || !coordY.trim()}
                  className={submitClass}
                >
                  {t("question.submit")}
                </button>
              </div>
              {coordError && (
                <div className="text-[10px] text-danger mt-0.5">{coordError}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
