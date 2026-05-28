import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { useTranslation } from "../i18n";
import { MessageBubble } from "./MessageBubble";

export function ChatArea() {
  const messages = useStore((s) => s.messages);
  const streamingId = useStore((s) => s.streamingId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // Auto-scroll when messages change or streaming updates
  useEffect(() => {
    const el = bottomRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [messages, streamingId]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-panel-muted">
          <div className="text-3xl mb-2">💬</div>
          <div className="text-sm">{t("chat.empty.title")}</div>
          <div className="text-xs mt-1 text-panel-muted/60">
            {t("chat.empty.description")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-2" role="log" aria-live="polite">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
