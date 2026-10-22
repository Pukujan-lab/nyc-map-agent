import type { ReactNode } from "react";
import { X } from "lucide-react";

import { toneSurface, type Tone } from "@/components/status-pill";
import { cn } from "@/lib/utils";

interface BannerProps {
  tone: Tone;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Banner({ tone, children, onDismiss, className }: BannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed sm:text-xs",
        toneSurface[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
