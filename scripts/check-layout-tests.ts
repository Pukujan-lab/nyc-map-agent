/**
 * Pull request gate for the layout bar (e2e/layout.ts). A change to a screen
 * (`src/**\/*.tsx` or a stylesheet, tests aside) must also touch an e2e spec that
 * calls `expectLayout`, so the change is checked at every size in SIZES instead
 * of an agent saying it looked fine. A pull request labelled `no-layout-change`
 * (a rename, a type-only edit) skips the gate; the label is a visible claim a reviewer can question.
 *
 *   git diff --name-only origin/main...HEAD | pnpm -s check:layout-tests
 */
import { readFileSync } from "node:fs";

export function isScreen(path: string): boolean {
  return /^src\/.*\.(tsx|css)$/.test(path) && !/\.test\.tsx$/.test(path);
}

export function isLayoutSpec(path: string, read: (p: string) => string): boolean {
  if (!/^e2e\/.*\.spec\.ts$/.test(path)) return false;
  try {
    return read(path).includes("expectLayout(");
  } catch {
    return false; // deleted in this change
  }
}

export function gate(changed: string[], read: (p: string) => string): { ok: boolean; screens: string[] } {
  const screens = changed.filter(isScreen);
  return { ok: !screens.length || changed.some((p) => isLayoutSpec(p, read)), screens };
}

if (process.argv[1]?.endsWith("check-layout-tests.ts")) {
  const labels = (process.env.PR_LABELS ?? "").split(",").map((s) => s.trim());
  const changed = readFileSync(0, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const { ok, screens } = gate(changed, (p) => readFileSync(p, "utf8"));
  if (ok) console.log(screens.length ? `${screens.length} screen file(s) changed, with a layout spec.` : "No screen files changed.");
  else if (labels.includes("no-layout-change")) console.log(`Skipped by the no-layout-change label (${screens.length} screen file(s)).`);
  else {
    console.error(`These screen files changed:\n  ${screens.join("\n  ")}\n`);
    console.error("Add or update an e2e spec that calls expectLayout (e2e/layout.ts) for the screen you changed,");
    console.error("e.g. a case in e2e/responsive.spec.ts. Label the PR no-layout-change only when nothing on screen moves.");
    process.exit(1);
  }
}
