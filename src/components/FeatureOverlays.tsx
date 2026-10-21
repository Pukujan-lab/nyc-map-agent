import { lazy, Suspense, useMemo } from "react";
import { FEATURES } from "@/features";
import { useFlags } from "@/lib/flags";

const LAZY = new Map(
  FEATURES.filter((f) => f.overlay).map((f) => [f.id, lazy(f.overlay!.load)] as const),
);

/** Mounts each enabled feature's lazy overlay (its own chunk). */
export function FeatureOverlays() {
  const flags = useFlags();
  return (
    <Suspense fallback={null}>
      {[...LAZY].map(([id, C]) => (flags[id] ? <C key={id} /> : null))}
    </Suspense>
  );
}

/** True when an enabled feature has taken over the Ask button. */
export function useChatReplaced(): boolean {
  const flags = useFlags();
  return useMemo(() => FEATURES.some((f) => f.overlay?.replacesChat && flags[f.id]), [flags]);
}
