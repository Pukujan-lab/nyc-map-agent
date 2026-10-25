/**
 * A repeatable first-load baseline on an emulated mid-range phone (#362).
 *
 *   npx tsx scripts/perf-throttled.ts [url] [runs]     (default: the live site, 3 runs)
 *
 * Runs Lighthouse's mobile preset: a Moto G-sized screen, CPU slowed 4× and a
 * slow 4G link (150 ms round trip, about 1.6 Mbps down). Lighthouse is used
 * instead of hand-rolled Playwright timing because it also sees the map's tile
 * worker and reports blocking time the way phone browsers feel it. It needs a
 * full Chromium; Playwright's own copy is used when CHROME_PATH is not set.
 * Prints the median of each number as a Markdown table; changes nothing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const URL_BASE = process.argv[2] ?? "https://nyc.design-bakery.com/";
const RUNS = Number(process.argv[3] ?? 3);
const LIGHTHOUSE = "lighthouse@13.5.0";

function playwrightChromium(): string | undefined {
  const root = join(homedir(), "Library/Caches/ms-playwright");
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  // Newer Playwright builds ship Chrome for Testing; older ones a plain Chromium.
  const apps = ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"];
  for (const d of dirs) for (const app of apps) if (existsSync(join(root, d, app))) return join(root, d, app);
  return undefined;
}

interface Run {
  score: number;
  fcp: number;
  lcp: number;
  tbt: number;
  tti: number;
  requests: number;
  kb: number;
  scriptS: number;
  mainScriptS: number;
}

interface Report {
  categories: { performance: { score: number } };
  audits: Record<string, { numericValue?: number; details?: { items?: Record<string, unknown>[] } }>;
}

function once(dir: string, i: number): Run {
  const out = join(dir, `run-${i}.json`);
  execFileSync(
    "npx",
    ["-y", LIGHTHOUSE, URL_BASE, "--only-categories=performance", "--output=json", `--output-path=${out}`, "--chrome-flags=--headless=new", "--quiet"],
    { stdio: "inherit", env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? playwrightChromium() } },
  );
  const r = JSON.parse(readFileSync(out, "utf8")) as Report;
  const n = (id: string) => r.audits[id]?.numericValue ?? NaN;
  const requests = r.audits["network-requests"]?.details?.items ?? [];
  const boot = (r.audits["bootup-time"]?.details?.items ?? []) as { url: string; scripting: number }[];
  return {
    score: r.categories.performance.score * 100,
    fcp: n("first-contentful-paint") / 1000,
    lcp: n("largest-contentful-paint") / 1000,
    tbt: n("total-blocking-time") / 1000,
    tti: n("interactive") / 1000,
    requests: requests.length,
    kb: n("total-byte-weight") / 1024,
    scriptS: n("bootup-time") / 1000,
    // The entry bundle is the one script named index-*.js.
    mainScriptS: (boot.find((b) => /\/assets\/index-[^/]+\.js$/.test(b.url))?.scripting ?? NaN) / 1000,
  };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const dir = mkdtempSync(join(tmpdir(), "perf-"));
const runs: Run[] = [];
try {
  for (let i = 0; i < RUNS; i++) runs.push(once(dir, i));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const m = (k: keyof Run, digits = 1) => median(runs.map((r) => r[k])).toFixed(digits);
console.log(`Measured ${new Date().toISOString()} against ${URL_BASE} with ${LIGHTHOUSE} mobile, median of ${RUNS}.\n`);
console.log("| Score | First paint | Largest paint | Blocking time | Ready to use | Requests | Transferred | Script time | Main bundle script time |");
console.log("|---|---|---|---|---|---|---|---|---|");
console.log(
  `| ${m("score", 0)} | ${m("fcp")} s | ${m("lcp")} s | ${m("tbt")} s | ${m("tti")} s | ${m("requests", 0)} | ${(Number(m("kb", 0)) / 1024).toFixed(2)} MB | ${m("scriptS")} s | ${m("mainScriptS")} s |`,
);
