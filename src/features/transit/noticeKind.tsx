import { ArrowUpDown, Ban, Clock, Construction, Info, Shuffle, SkipForward, Wrench, type LucideIcon } from "lucide-react";

/**
 * What a notice is about, from its own words, so a row can show one icon and
 * one line ("what happens") before anyone opens the full text.
 */
export type NoticeKind = "elevator" | "repair" | "skip" | "noService" | "delay" | "detour" | "planned" | "info";

export function noticeKind(text: string, hint?: { kind?: string; reroute?: boolean }): NoticeKind {
  const t = text.toLowerCase();
  if (/elevator|escalator/.test(t)) return "elevator";
  if (/signal|switch problem|track (problem|condition|repair|work)|rail condition|mechanical|broken|repair/.test(t)) return "repair";
  if (/\bskip/.test(t)) return "skip";
  if (/\bno \S+( trains?)? (service|at|between|running)|\bsuspended|not running|no service/.test(t)) return "noService";
  if (hint?.kind === "delay" || /\bdelay/.test(t)) return "delay";
  if (hint?.reroute || /detour|reroute|runs via|rerouted/.test(t)) return "detour";
  if (hint?.kind === "planned" || /planned|weekend|overnight/.test(t)) return "planned";
  return "info";
}

export const NOTICE_ICON: Record<NoticeKind, LucideIcon> = {
  elevator: ArrowUpDown, repair: Wrench, skip: SkipForward, noService: Ban, delay: Clock, detour: Shuffle, planned: Construction, info: Info,
};

export const NOTICE_LABEL: Record<NoticeKind, string> = {
  elevator: "Elevator or escalator out", repair: "Repair", skip: "Skips stops", noService: "No service", delay: "Delays", detour: "Detour", planned: "Planned work", info: "Notice",
};

export function NoticeIcon({ kind, color, className }: { kind: NoticeKind; color?: string; className?: string }) {
  const Icon = NOTICE_ICON[kind];
  return <Icon aria-label={NOTICE_LABEL[kind]} role="img" className={className ?? "h-4 w-4 shrink-0"} style={color ? { color } : undefined} />;
}
