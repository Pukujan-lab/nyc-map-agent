import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MicButtonProps {
  supported: boolean;
  listening: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function MicButton({
  supported,
  listening,
  onStart,
  onStop,
  disabled,
}: MicButtonProps) {
  const label = !supported
    ? "Voice input is not available in this browser"
    : listening
      ? "Stop listening"
      : "Ask by voice";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={listening ? "destructive" : "ghost"}
          aria-label={label}
          aria-pressed={listening}
          disabled={!supported || disabled}
          onClick={() => (listening ? onStop() : onStart())}
          className={cn("relative h-9 w-9 shrink-0", listening && "animate-none")}
        >
          {listening ? (
            <>
              <span className="absolute inset-0 animate-pulse-ring rounded-md bg-destructive/30" />
              <MicOff className="relative h-4 w-4" />
            </>
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
