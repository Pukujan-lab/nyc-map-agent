import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AgentContext } from "@/lib/agent/client";
import type { ExecuteContext } from "@/lib/agent/execute";
import { useAgent } from "@/lib/agent/useAgent";
import type { NtaBoundary } from "@/lib/api/nta";
import type { AggregateResult } from "@/lib/geo/types";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { useSpeech } from "@/lib/voice/useSpeech";
import { windowBounds } from "@/lib/windows";
import { ChatMessageBubble } from "./ChatMessage";
import { MicButton } from "./MicButton";
import { SuggestedQuestions } from "./SuggestedQuestions";

interface ChatPanelProps {
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
  isDesktop: boolean;
}

export function ChatPanel({
  boundaries,
  noise,
  crashes,
  isDesktop,
}: ChatPanelProps) {
  const {
    layer,
    window: windowId,
    chatOpen,
    setChatOpen,
    chatSeed,
    clearSeed,
    selectNta,
    setHighlights,
    setLayer,
    flyTo,
  } = useMapState();
  const reducedMotion = usePrefersReducedMotion();
  const { label: windowLabel } = windowBounds(windowId);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});

  const speech = useSpeech({
    onFinalTranscript: (text) => sendRef.current(text),
  });

  const agentContext = useMemo<AgentContext>(
    () => ({
      layer,
      windowId,
      windowLabel,
      boundaries,
      noise,
      crashes,
    }),
    [layer, windowId, windowLabel, boundaries, noise, crashes],
  );

  const executeContext = useMemo<ExecuteContext>(
    () => ({
      boundaries,
      noise,
      crashes,
      selectNta,
      setHighlights,
      setLayer,
      flyTo,
    }),
    [boundaries, noise, crashes, selectNta, setHighlights, setLayer, flyTo],
  );

  const { messages, pending, send } = useAgent({
    context: agentContext,
    executeContext,
    onSpoken: speech.speak,
  });

  useEffect(() => {
    sendRef.current = (text: string) => {
      void send(text, { viaVoice: true });
    };
  }, [send]);

  useEffect(() => {
    if (!chatSeed) return;
    const text = chatSeed.text;
    clearSeed();
    void send(text);
  }, [chatSeed, clearSeed, send]);

  useEffect(() => {
    if (speech.error) {
      toast.error("Voice input", { description: speech.error });
      speech.clearError();
    }
  }, [speech]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [messages, pending, reducedMotion]);

  const suggestions = useMemo(
    () => [
      "Where is the loudest block in Bushwick on weekend nights (10pm to 4am)?",
      `Which 5 neighborhoods had the most residential noise complaints in ${windowLabel}?`,
      "Which Brooklyn intersections have the most cyclist injuries?",
      "What is the top crash cause in Manhattan, and how many crashes did it cause?",
      "How many helicopter noise complaints were there near the Downtown Manhattan Heliport last summer?",
    ],
    [windowLabel],
  );

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setInput("");
    void send(value);
  };

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">Ask the map</div>
          <div className="truncate text-[11px] text-muted-foreground">
            Answers come from {windowLabel} of Socrata data
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={speech.muted ? "Unmute spoken answers" : "Mute spoken answers"}
              aria-pressed={speech.muted}
              className="h-8 w-8 shrink-0"
              onClick={() => {
                if (!speech.muted) speech.stopSpeaking();
                speech.setMuted(!speech.muted);
              }}
            >
              {speech.muted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {speech.muted ? "Spoken answers are off" : "Spoken answers are on"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 && !pending ? (
          <div className="space-y-2.5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Ask about noise or crashes anywhere in the five boroughs. Every
              answer names its neighborhood and time window, shows the query
              behind it, and moves the map.
            </p>
            <SuggestedQuestions
              questions={suggestions}
              onSelect={submit}
              disabled={!noise || !crashes}
            />
            {!noise || !crashes ? (
              <p className="text-[11px] text-muted-foreground">
                Waiting for the first aggregation to finish…
              </p>
            ) : null}
          </div>
        ) : null}

        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} />
        ))}

        {pending ? (
          <div className="flex justify-start">
            <div className="w-[70%] space-y-1.5 rounded-2xl rounded-bl-sm border border-border/70 bg-card px-3 py-2.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ) : null}
      </div>

      {speech.listening ? (
        <div className="border-t border-border/60 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-primary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            Listening…
          </div>
          <p className="mt-1 min-h-[16px] text-[11px] text-muted-foreground">
            {speech.interim || "Say your question, then tap the mic again."}
          </p>
        </div>
      ) : null}

      <div className="border-t border-border/60 p-2.5">
        <div className="flex items-end gap-1.5">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder="Where is the loudest block in Bushwick?"
            aria-label="Ask a question about noise or crashes"
            className="max-h-28 min-h-[38px] flex-1 py-2 text-[13px]"
          />
          <MicButton
            supported={speech.sttSupported}
            listening={speech.listening}
            onStart={speech.startListening}
            onStop={speech.stopListening}
            disabled={pending}
          />
          <Button
            type="button"
            size="icon"
            aria-label="Send question"
            className="h-9 w-9 shrink-0"
            disabled={pending || input.trim().length === 0}
            onClick={() => submit(input)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Card className="absolute bottom-4 right-4 top-4 z-30 flex w-[380px] flex-col overflow-hidden p-0">
        {body}
      </Card>
    );
  }

  return (
    <Sheet open={chatOpen} onOpenChange={setChatOpen}>
      <SheetContent
        side="bottom"
        className="flex h-[85vh] flex-col overflow-hidden p-0"
      >
        <SheetTitle className="sr-only">Ask the map</SheetTitle>
        <SheetDescription className="sr-only">
          Ask questions about noise and crashes in New York City.
        </SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  );
}
