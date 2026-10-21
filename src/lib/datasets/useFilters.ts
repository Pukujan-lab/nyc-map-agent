import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { BOROUGHS, type DataFilters } from "./backend";

/**
 * Filters live in the URL (`boro`, `cat.<source>`, `sev`) so a filtered view
 * can be shared and survives a reload.
 */
export function useFilters(): {
  filters: DataFilters;
  setBorough: (borough: string | undefined) => void;
  setCategories: (sourceId: string, values: string[]) => void;
  setSeverity: (values: string[]) => void;
  clear: () => void;
  activeCount: number;
} {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const filters = useMemo<DataFilters>(() => {
    const boro = params.get("boro") ?? undefined;
    const categories: Record<string, string[]> = {};
    params.forEach((value, name) => {
      if (name.startsWith("cat.") && value) categories[name.slice(4)] = value.split("|");
    });
    return {
      borough: boro && (BOROUGHS as readonly string[]).includes(boro) ? boro : undefined,
      categories,
      severity: (params.get("sev") ?? "").split("|").filter(Boolean),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (fn: (next: URLSearchParams) => void) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          fn(next);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const set = (next: URLSearchParams, name: string, value: string) =>
    value ? next.set(name, value) : next.delete(name);

  return {
    filters,
    setBorough: (b) => update((n) => set(n, "boro", b ?? "")),
    setCategories: (id, values) => update((n) => set(n, `cat.${id}`, values.join("|"))),
    setSeverity: (values) => update((n) => set(n, "sev", values.join("|"))),
    clear: () =>
      update((n) => {
        for (const name of [...n.keys()]) if (name === "boro" || name === "sev" || name.startsWith("cat.")) n.delete(name);
      }),
    activeCount:
      (filters.borough ? 1 : 0) +
      (filters.severity.length ? 1 : 0) +
      Object.values(filters.categories).filter((v) => v.length).length,
  };
}
