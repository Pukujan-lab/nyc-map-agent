import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api/client";

const levelSchema = z.enum(["green", "yellow", "orange", "red"]).nullable();
const rowSchema = z.object({
  borough: z.string(),
  noise_12mo: z.coerce.number(),
  crashes_12mo: z.coerce.number(),
  injury_crashes_12mo: z.coerce.number(),
  noise_level: levelSchema.catch(null),
  crash_level: levelSchema.catch(null),
});
const bodySchema = z.object({ rows: z.array(rowSchema) });
export type StreetLevelRow = z.infer<typeof rowSchema>;
type Level = z.infer<typeof levelSchema>;

/** The walker's borough, or the busiest one when the borough is unknown. */
export function pickStreetRow(rows: readonly StreetLevelRow[], borough: string | null): StreetLevelRow | null {
  if (borough) return rows.find((r) => r.borough === borough) ?? null;
  return rows[0] ?? null;
}

const DOT: Record<NonNullable<Level>, string> = {
  green: "bg-emerald-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-600",
};
const WORD: Record<NonNullable<Level>, string> = { green: "low", yellow: "some", orange: "high", red: "very high" };

function Dot({ label, level }: { label: string; level: Level }) {
  if (!level) return null;
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ring-1 ring-black/20 ${DOT[level]}`} />
      <span className="sr-only">{`${label} ${WORD[level]}`}</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Two dots for the street underfoot, green to red against every other street
 * in the city: noise complaints and crashes over the last year. Tap for the
 * numbers. Says nothing when the street has no records.
 */
export function StreetLevels({ street, borough }: { street: string | null; borough: string | null }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["street-levels", street],
    enabled: !!street,
    staleTime: 6 * 60 * 60_000,
    queryFn: async ({ signal }) => {
      const { data, response } = await api.GET("/api/street", { params: { query: { name: street ?? "" } }, signal });
      if (!data) throw new Error(`street ${response.status}`);
      return bodySchema.parse(data).rows;
    },
  });
  const row = street && data ? pickStreetRow(data, borough) : null;
  if (!row || (!row.noise_level && !row.crash_level)) return null;

  return (
    <div data-testid="walk-levels" className="text-[11px]">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Hide street noise and crash numbers" : "Show street noise and crash numbers"}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-6 items-center gap-2.5 rounded-full font-medium text-foreground"
      >
        <Dot label="Noise" level={row.noise_level} />
        <Dot label="Crashes" level={row.crash_level} />
      </button>
      {open ? (
        <p className="pb-0.5 text-muted-foreground">
          {`Past year: ${plural(row.noise_12mo, "noise complaint")} · ${plural(row.crashes_12mo, "crash", "crashes")}`}
          {row.injury_crashes_12mo ? `, ${row.injury_crashes_12mo.toLocaleString()} with injuries` : ""}
        </p>
      ) : null}
    </div>
  );
}
