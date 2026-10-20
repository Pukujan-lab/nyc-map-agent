import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { SoqlSource } from "@/lib/geo/types";
import { createAgentClient, type AgentContext, type ChatTurn } from "./client";
import { executeToolCalls, type ExecuteContext } from "./execute";
import type { QueryRow } from "./query";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  chips?: string[];
  sources?: SoqlSource[];
  rows?: QueryRow[];
  error?: boolean;
  viaVoice?: boolean;
}

export interface UseAgentOptions {
  context: AgentContext;
  executeContext: ExecuteContext;
  onSpoken: (text: string) => void;
}

export function useAgent({
  context,
  executeContext,
  onSpoken,
}: UseAgentOptions) {
  const [client] = useState(createAgentClient);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const historyRef = useRef<ChatTurn[]>([]);
  const pendingRef = useRef(false);
  const contextRef = useRef(context);
  const executeRef = useRef(executeContext);
  const spokenRef = useRef(onSpoken);

  contextRef.current = context;
  executeRef.current = executeContext;
  spokenRef.current = onSpoken;

  const send = useCallback(
    async (raw: string, options?: { viaVoice?: boolean }) => {
      const text = raw.trim();
      if (!text || pendingRef.current) return;

      pendingRef.current = true;
      setPending(true);
      setLastError(null);
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "user",
          text,
          viaVoice: options?.viaVoice,
        },
      ]);
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: text },
      ];

      try {
        const reply = await client.send(historyRef.current, contextRef.current);
        const execution = executeToolCalls(
          reply.toolCalls,
          executeRef.current,
        );
        historyRef.current = [
          ...historyRef.current,
          { role: "assistant", content: reply.text },
        ];
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: reply.text,
            chips: execution.chips,
            sources: execution.sources,
            rows: execution.rows,
          },
        ]);
        spokenRef.current(reply.spoken ?? reply.text);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The query failed.";
        setLastError(message);
        toast.error("Query failed", { description: message });
        setMessages((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: `I couldn't answer that: ${message} I won't guess a number — try again or widen the time window.`,
            error: true,
          },
        ]);
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [client],
  );

  const reset = useCallback(() => {
    historyRef.current = [];
    setMessages([]);
    setLastError(null);
  }, []);

  return { messages, pending, lastError, send, reset };
}
