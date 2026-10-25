import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, type Map as MaplibreMap } from "maplibre-gl";
import { X } from "lucide-react";
import { lineColor } from "@/lib/transit/bullets";
import { setSelectedLine, useSelectedLine } from "@/lib/transit/selectedLine";
import { useMapState } from "@/lib/store/MapStateContext";
import { framePadding } from "@/lib/map/mapCover";
import { sendScreen, useScreen } from "@/lib/screen/screenSpace";
import { setAlertFocus } from "./alertFocus";
import { useAlerts, useNow, useTransitData } from "./hooks";
import { boardingArrivals, minutesUntil } from "./model";
import { TONE, lineNotices, type LineNotice } from "./lineNotices";
import { NoticeIcon, noticeKind } from "./noticeKind";

const GLASS = "border border-[rgba(148,163,184,0.18)] bg-[rgba(15,23,42,0.6)] backdrop-blur-[10px]";

/** The ring and label for one affected station, as plain DOM so it matches the design exactly. */
function ringMarker(color: string, glow: string, label: string): HTMLElement {
  const el = document.createElement("div");
  // No `position` here: MapLibre's marker class places the element absolutely, which also anchors the label.
  el.style.cssText = "width:34px;height:34px;pointer-events:none";
  const ring = document.createElement("div");
  ring.style.cssText = `width:34px;height:34px;box-sizing:border-box;border-radius:17px;border:3px solid ${color};box-shadow:0 0 0 6px ${glow}`;
  const tag = document.createElement("div");
  tag.textContent = label;
  tag.style.cssText = `position:absolute;left:39px;top:5px;padding:4px 8px;border-radius:8px;background:${color};color:#111827;font:700 12px Inter,system-ui,sans-serif;white-space:nowrap`;
  el.append(ring, tag);
  return el;
}

/** Ring the picked notice's stations; bring them into view when they are off screen. */
function useNoticeRings(map: MaplibreMap | undefined, notice: LineNotice | null, panel: HTMLElement | null) {
  useEffect(() => {
    if (!map || !notice?.stations.length) return;
    const tone = TONE[notice.tone];
    const markers = notice.stations.map((s) => new Marker({ element: ringMarker(tone.color, tone.glow, s.label) }).setLngLat(s.coord).addTo(map));
    const b = map.getBounds();
    // An alert's own focus already fits the affected stretch; only outages are framed here.
    if (!notice.alert && !notice.stations.every((s) => b.contains(s.coord))) {
      const top = Math.round((panel?.getBoundingClientRect().bottom ?? 120) + 24);
      const bottom = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-bar-h"), 10) || 0) + 40;
      const xs = notice.stations.map((s) => s.coord[0]), ys = notice.stations.map((s) => s.coord[1]);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: framePadding(map, { top, bottom, left: 40, right: 140 }), maxZoom: 15, duration: 700 });
    }
    return () => markers.forEach((m) => m.remove());
  }, [map, notice, panel]);
}

/**
 * The selected subway line (#370): a bullet pill with its notice count and a
 * close button, and under it a see-through panel listing the line's notices.
 * Tapping a notice opens its full text and rings its stations on the map.
 */
export function LinePanel({ map, route, onFollow }: { map: MaplibreMap | undefined; route: string; onFollow: () => void }) {
  const data = useTransitData(["subway"]);
  const alerts = useAlerts(true).data;
  const sys = data.subway?.stat;
  const notices = useMemo(() => lineNotices(route, alerts?.alerts ?? [], alerts?.outages ?? [], sys), [route, alerts, sys]);
  const [picked, setPicked] = useState<string | null>(null);
  // A new line starts with every notice closed.
  useEffect(() => setPicked(null), [route]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  useEffect(() => setPanelEl(panelRef.current), []);
  const pickedNotice = notices.find((n) => n.id === picked) ?? null;
  useNoticeRings(map, pickedNotice, panelEl);
  // The picked alert draws its affected stretch, skipped stops and detour on the map, the rest dimmed.
  const pickedAlert = pickedNotice?.alert ?? null;
  useEffect(() => {
    if (!pickedAlert) return;
    setAlertFocus(pickedAlert);
    return () => setAlertFocus(null);
  }, [pickedAlert]);
  const ride = useSelectedLine()?.ride;
  const now = useNow(Boolean(ride));
  const board = ride && sys ? boardingArrivals(sys, data.subway?.live, route, ride.from, ride.to, now) : null;
  const { seedChat, setChatOpen } = useMapState();
  const info = sys?.routes[route];
  const color = info?.color ?? lineColor(route);
  const text = info?.text ?? "#ffffff";
  const count = notices.length;
  const name = info?.name && info.name !== route ? info.name : "";
  // On a phone the open answer or orb wins: the panel folds to its pill, and tapping the pill opens it again (src/lib/screen/screenSpace.ts).
  useEffect(() => { sendScreen({ type: "LINE", on: true }); return () => sendScreen({ type: "LINE", on: false }); }, []);
  const folded = useScreen((v) => v.line === "pill");
  const pillLabel = (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-bold" style={{ background: color, color: text }} aria-hidden>
        {info?.short ?? route}
      </span>
      <span className="pr-1.5 text-[14px] font-semibold">
        <span className="sr-only">{route} line, </span>
        {name ? <span className="mr-1.5 inline-block max-w-[150px] truncate align-bottom lg:max-w-[200px]">{name}</span> : null}
        <span className={name ? "font-medium text-[#cbd5e1]" : ""}>{count === 1 ? "1 notice" : `${count} notices`}</span>
      </span>
    </>
  );

  return (
    <div
      data-testid="line-panel"
      data-map-cover
      className="pointer-events-none absolute left-4 right-4 z-[44] flex flex-col gap-3 font-[Inter,system-ui,sans-serif] text-[#f1f5f9] sm:left-auto sm:w-[360px] md:w-[380px] lg:w-[400px]"
      style={{ top: "calc(env(safe-area-inset-top) + 16px)", maxHeight: "calc(100% - env(safe-area-inset-top) - var(--chat-bar-h, 0px) - 32px)" }}
    >
      <div className="flex items-center justify-between">
        {folded ? (
          <button type="button" aria-expanded={false} aria-label={`Show the ${route} line`} data-testid="line-pill" onClick={() => sendScreen({ type: "SHOW_LINE" })}
            className={`pointer-events-auto flex h-11 items-center gap-2.5 rounded-[22px] pl-1.5 pr-2 ${GLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]`}>
            {pillLabel}
          </button>
        ) : (
          <div data-testid="line-pill" className={`pointer-events-auto flex h-11 items-center gap-2.5 rounded-[22px] pl-1.5 pr-2 ${GLASS}`}>{pillLabel}</div>
        )}
        <button type="button" aria-label="Close line" onClick={() => setSelectedLine(null)}
          className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full ${GLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]`}>
          <X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <div ref={panelRef} data-testid="line-body" className={`pointer-events-auto ${folded ? "hidden" : "flex"} min-h-0 flex-col gap-2.5 rounded-[22px] border border-[rgba(148,163,184,0.16)] bg-[rgba(11,18,32,0.45)] p-2.5 backdrop-blur-[14px]`}>
        {board ? (
          <div data-testid="line-board" className="flex items-start gap-3 rounded-[14px] border border-[rgba(148,163,184,0.16)] bg-[rgba(15,23,42,0.35)] px-3 py-2.5 text-[14px]">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Next {route} at {board.name}</div>
              {board.toward ? <div className="truncate text-[13px] text-[#cbd5e1]">Toward {board.toward}</div> : null}
              {board.times.length ? null : <div className="mt-1 text-[13px] text-[#cbd5e1]">No live times for this stop right now.</div>}
            </div>
            {/* The next trains stack at the right, soonest on top. */}
            {board.times.length ? (
              <div data-testid="line-times" className="flex shrink-0 flex-col items-end gap-1" aria-live="polite">
                {board.times.map((t) => {
                  const m = minutesUntil(t, now);
                  return <span key={t} className="rounded-full bg-[rgba(37,99,235,0.28)] px-2.5 py-0.5 text-[13px] font-semibold">{m < 1 ? "Now" : `${m} min`}</span>;
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        {count ? (
          <ul className={`line-notices flex ${picked ? "max-h-[min(236px,30dvh)]" : "max-h-[104px]"} min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-1.5`} aria-label={`${route} line notices`}>
            {notices.map((n) => {
              const open = n.id === picked;
              const tone = TONE[n.tone];
              return (
                <li key={n.id}>
                  <button type="button" aria-expanded={open} data-notice={n.id} onClick={() => setPicked(open ? null : n.id)}
                    className="flex w-full items-start gap-2.5 rounded-[14px] border px-3 py-2.5 text-left text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]"
                    style={{ borderColor: open ? "rgba(96,165,250,0.6)" : "rgba(148,163,184,0.16)", background: open ? "rgba(37,99,235,0.22)" : "rgba(15,23,42,0.35)" }}>
                    <NoticeIcon kind={noticeKind(`${n.title} ${n.body}`, { kind: n.alert?.kind, reroute: n.alert?.reroute })} color={tone.dot} className="mt-[2px] h-4 w-4 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      {/* Closed: one line each; the full text opens on tap. */}
                      <span className={`font-semibold ${open ? "" : "truncate"}`}>{n.title}</span>
                      {n.meta ? <span className={`text-[13px] text-[#cbd5e1] ${open ? "" : "truncate"}`}>{n.meta}</span> : null}
                      {open && n.body !== n.title ? <span className="mt-1 whitespace-pre-line text-[13px] leading-[1.45] text-[#e2e8f0]">{n.body}</span> : null}
                    </span>
                    <span aria-hidden className="mt-0.5 text-[#a5b4cb] transition-transform" style={{ transform: `rotate(${open ? 180 : 0}deg)` }}>⌄</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { seedChat(`What are other ways to go instead of the ${route} train right now?`); setChatOpen(true); }}
            className="h-9 rounded-[18px] bg-[#2563eb] text-[13px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            Other ways
          </button>
          <button type="button" onClick={onFollow}
            className="h-9 rounded-[18px] border border-[rgba(148,163,184,0.3)] bg-transparent text-[13px] font-semibold text-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
            Follow a train
          </button>
        </div>
      </div>
    </div>
  );
}
