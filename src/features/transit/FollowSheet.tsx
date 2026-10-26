import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { QrButton } from "@/components/MapChrome";
import { PullSheet } from "@/components/PullSheet";
import { nextTab, type SheetLevel } from "@/components/sheetSwipe";
import { useMenuT } from "@/lib/i18n/menuText";
import { APP_LANGS, LANG_LABELS, setLangPref, useLangPref, type AppLang } from "@/lib/voice/langPref";
import { stopFollowing } from "./follow";

const TABS = ["train", "notices", "settings"] as const;
type Tab = (typeof TABS)[number];

export interface FollowSheetProps {
  route: string;
  color: string;
  bus: boolean;
  /** "Underground · No delay reported" and the like. */
  status: string;
  next: { name: string; eta: string } | null;
  /** The stops after the next one, already as buttons. */
  stops: ReactNode[];
  dest: ReactNode;
  notices: ReactNode[];
  noticeCount: number;
  actions: ReactNode;
}

/**
 * Following a train or bus: one line above the chat ("Next: …, 2 min") that
 * swipes or taps up into the stops, notices and settings, and down again.
 * Sideways swipes switch category; every swipe also has a tap, for people who
 * never find a gesture. The map stays clear above it, so the train stays in
 * view (owner, 2026-10-25).
 */
export function FollowSheet(p: FollowSheetProps) {
  const [level, setLevel] = useState<SheetLevel>(0);
  const [tab, setTab] = useState<Tab>("train");
  const t = useMenuT();
  const lang = useLangPref();
  const tabLabel: Record<Tab, string> = { train: p.bus ? "Bus" : "Train", notices: p.noticeCount ? `Notices (${p.noticeCount})` : "Notices", settings: "Settings" };
  return (
    <PullSheet testId="follow-card" label={`Following ${p.route}`} level={level} onLevel={setLevel} onSide={(swipe) => setTab((at) => nextTab(TABS, at, swipe))}
      header={<div className="flex items-center gap-2.5" data-testid="follow-heading">
        <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center px-2 text-[13px] font-extrabold ${p.bus ? "rounded-[10px]" : "rounded-full"}`} style={{ background: p.bus ? "#0ea5e9" : p.color }}>{p.route}</span>
        <button type="button" data-testid="follow-line" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={level > 0}
          onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-bold">{p.next ? `Next: ${p.next.name}` : "No upcoming stop reported"}</span>
            <span className="truncate text-xs text-amber-200">Following your {p.route} · {p.status}</span>
          </span>
          {p.next ? <span className="shrink-0 text-[15px] font-bold text-amber-200">{p.next.eta}</span> : null}
        </button>
        <button type="button" className="task-action task-close" aria-label="Stop following" onClick={stopFollowing}><X size={18} /></button>
      </div>}>
      <div role="tablist" aria-label="Sheet" className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-slate-900/50 p-1">
        {TABS.map((id) => <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`follow-tab-${id}`} onClick={() => setTab(id)}
          className={`min-h-9 truncate rounded-full px-2 text-[13px] font-semibold ${tab === id ? "bg-slate-100 text-slate-900" : "text-slate-300"}`}>{tabLabel[id]}</button>)}
      </div>
      <div role="tabpanel" aria-label={tabLabel[tab]} className="pull-sheet-body mt-2 flex flex-col gap-2">
        {tab === "train" ? <>
          {p.actions}
          <div className="flex flex-col gap-0.5 px-1">{level === 2 ? p.stops : p.stops.slice(0, 2)}</div>
          {p.dest}
        </> : tab === "notices" ? (p.notices.length ? p.notices : <p className="px-1 text-[13px] text-slate-300">No notices reported</p>) : <>
          <label className="flex min-h-11 items-center justify-between gap-3 px-1 text-sm font-semibold">
            {t("language")}
            <select value={lang ?? ""} aria-label={t("language")} onChange={(e) => setLangPref((e.target.value || null) as AppLang | null)}
              className="min-h-11 rounded-full border border-slate-400/30 bg-slate-900 px-3 text-sm font-medium text-slate-100">
              <option value="">{t("thisPhone")}</option>
              {APP_LANGS.map((code) => <option key={code} value={code}>{LANG_LABELS[code]}</option>)}
            </select>
          </label>
          <QrButton wide />
        </>}
      </div>
    </PullSheet>
  );
}
