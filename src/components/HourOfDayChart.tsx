import { useState } from "react";
import { formatCount, formatHour } from "@/lib/format";

/**
 * 24 bars, incidents by hour of day. Plain SVG: the chart library it replaces
 * (recharts + d3 + lodash) cost ~90 kB of JS for this one picture.
 */
const W = 320;
const H = 176;
const LEFT = 30;
const BOTTOM = 16;
const TOP = 6;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}

export function HourOfDayChart({ hours }: { hours: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...hours));
  const plotW = W - LEFT - 2;
  const plotH = H - TOP - BOTTOM;
  const bw = plotW / 24;
  const y = (v: number) => TOP + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const h = hover ?? -1;
  return (
    <div className="relative h-[176px] w-full text-[9px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label="Incidents by hour of day"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <text x={LEFT - 4} y={y(t) + 3} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={9}>
              {formatCount(t)}
            </text>
          </g>
        ))}
        {hours.map((v, i) => {
          const x = LEFT + i * bw;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={TOP} width={bw} height={plotH} fill={i === h ? "hsl(var(--muted))" : "transparent"} opacity={0.45} />
              <rect x={x + bw * 0.1} y={y(v)} width={bw * 0.8} height={Math.max(0, TOP + plotH - y(v))} rx={1.5} fill="hsl(var(--primary))" />
              {i % 3 === 0 ? (
                <text x={x + bw / 2} y={H - 4} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={9}>
                  {formatHour(i)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow"
          style={{ left: `${Math.min(70, ((LEFT + hover * bw) / W) * 100)}%` }}
        >
          <div>{`${formatHour(hover)}–${formatHour((hover + 1) % 24)}`}</div>
          <div className="tabular-nums">{formatCount(hours[hover] ?? 0)} incidents</div>
        </div>
      ) : null}
    </div>
  );
}
