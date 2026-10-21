import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Feature chips that are off by default (traffic, parking…), kept in the URL
 * as `on=traffic,parking` so a link reproduces the view.
 */
export function useFeatureToggles(): [Set<string>, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("on") ?? "";
  const on = useMemo(() => new Set(raw.split(",").filter(Boolean)), [raw]);
  const toggle = useCallback(
    (id: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const set = new Set((next.get("on") ?? "").split(",").filter(Boolean));
          if (set.has(id)) set.delete(id);
          else set.add(id);
          if (set.size) next.set("on", [...set].join(","));
          else next.delete("on");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [on, toggle];
}
