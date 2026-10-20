const countFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function formatCount(value: number): string {
  return countFormatter.format(Math.round(value));
}

export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return percentFormatter.format(fraction);
}

export function formatRatio(value: number, digits = 1): string {
  return value.toFixed(digits);
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats a zone-less NYC-local ISO timestamp without shifting the day. */
export function formatDate(iso: string): string {
  const [datePart] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatHour(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

export function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
