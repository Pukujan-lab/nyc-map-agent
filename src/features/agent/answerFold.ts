/**
 * Why the answer is folded down to its question chip, if it is (docs/PDD.md, "Screen space").
 * A task (following a train, walking, a followed route) outranks the answer, so it folds until
 * tapped. An open menu dropdown is the single focus, so the answer folds while it is open and
 * comes back when it closes.
 */
export type Fold = "menu" | "task" | null;

export function nextFold(fold: Fold, e: { menuOpen: boolean; taskStarted: boolean }): Fold {
  if (e.taskStarted) return "task";
  if (e.menuOpen) return fold ?? "menu";
  return fold === "menu" ? null : fold;
}
