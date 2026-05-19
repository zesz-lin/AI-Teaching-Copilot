import { useState, useCallback, useRef, useEffect } from "react";
import { useStore } from "../store";
import { useTranslation } from "../i18n";

const MAX_BYTES = 8192; // 8KB

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function InputBox({ onSend, disabled }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setInputLength = useStore((s) => s.setInputLength);

  const bytes = byteLength(text);
  const overLimit = bytes > MAX_BYTES;

  useEffect(() => {
    setInputLength(bytes);
  }, [bytes, setInputLength]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || overLimit || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, overLimit, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t border-panel-border p-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={t("input.placeholder")}
          className="flex-1 resize-none rounded-lg border border-panel-border bg-panel-surface
                     text-panel-text text-sm px-3 py-2 placeholder:text-panel-muted/50
                     focus:outline-none focus:border-accent disabled:opacity-50
                     max-h-[120px]"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim() || overLimit}
          className="shrink-0 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium
                     hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors active:scale-95"
        >
          {t("input.send")}
        </button>
      </div>
      <div className="flex justify-between mt-1 px-1">
        <span className="text-[10px] text-panel-muted/60">
          {t("input.hint")}
        </span>
        <span
          className={`text-[10px] ${
            overLimit ? "text-danger font-medium" : "text-panel-muted/60"
          }`}
        >
          {t("input.byte_count", { bytes: String(bytes), maxBytes: String(MAX_BYTES) })}
        </span>
      </div>
    </div>
  );
}
