import { Mic } from "lucide-react";
import type { ChatMessage as ChatMessageModel } from "@/lib/agent/useAgent";
import type { QueryRow } from "@/lib/agent/query";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionChip } from "./ActionChip";
import { ShowQuery } from "./ShowQuery";

function QueryRows({ rows }: { rows: QueryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {rows.slice(0, 5).map((row, index) => (
        <li
          key={`${row.key}-${index}`}
          className="flex items-baseline gap-2 text-[11px]"
        >
          <span className="w-3 shrink-0 tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate" title={row.label}>
            {row.label}
          </span>
          <span className="shrink-0 font-medium tabular-nums">
            {formatCount(row.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ChatMessageBubble({ message }: { message: ChatMessageModel }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.viaVoice ? (
            <Mic className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden />
          ) : null}
          <span className="whitespace-pre-wrap break-words">{message.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[94%] rounded-2xl rounded-bl-sm border border-border/70 bg-card px-3 py-2 text-sm shadow-sm",
          message.error && "border-destructive/50 bg-destructive/5",
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.text}
        </p>
        {message.rows ? <QueryRows rows={message.rows} /> : null}
        {message.chips && message.chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.chips.map((chip) => (
              <ActionChip key={chip} label={chip} />
            ))}
          </div>
        ) : null}
        {message.sources ? <ShowQuery sources={message.sources} /> : null}
      </div>
    </div>
  );
}
