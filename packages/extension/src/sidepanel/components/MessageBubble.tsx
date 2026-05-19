import type { ChatMessage } from "../store";
import { useTranslation } from "../i18n";
import { renderMarkdown } from "../markdown";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const { t, locale } = useTranslation();
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isStreaming = message.streaming;

  if (isSystem) {
    return (
      <div className="flex justify-center py-1 animate-fade-in">
        <span
          className="text-xs text-panel-muted system-message"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3 animate-message-in`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-accent text-white rounded-br-sm"
            : "bg-panel-surface text-panel-text rounded-bl-sm border border-panel-border"
        } ${isStreaming ? "streaming-cursor" : ""}`}
      >
        <div
          className="whitespace-pre-wrap break-words assistant-message"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content || (isStreaming ? "" : "")) }}
        />

        <div className={`text-[10px] mt-1 ${isUser ? "text-white/60" : "text-panel-muted/60"}`}>
          {new Date(message.timestamp).toLocaleTimeString(
            locale === "en" ? "en-US" : "zh-CN",
            { hour: "2-digit", minute: "2-digit" }
          )}
        </div>
      </div>
    </div>
  );
}
