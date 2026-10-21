/**
 * pnpm openapi        write openapi.json from the Hono route table
 * pnpm openapi:check  fail if openapi.json is stale or a route has no spec
 */
import { readFileSync, writeFileSync } from "node:fs";
import { app, MOUNTED_PATHS } from "../server/app";
import { ROUTES } from "../server/openapi";

const missing = MOUNTED_PATHS.filter((p) => !(p in ROUTES));
if (missing.length) {
  console.error(`Routes without an OpenAPI spec in server/openapi.ts: ${missing.join(", ")}`);
  process.exit(1);
}
const doc = app.getOpenAPI31Document({ openapi: "3.1.0", info: { title: "NYC Map Agent API", version: "1" } });
const text = JSON.stringify(doc, null, 2) + "\n";
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync("openapi.json", "utf8");
  } catch {
    /* missing */
  }
  if (current !== text) {
    console.error("openapi.json is stale: run `pnpm openapi` and commit it.");
    process.exit(1);
  }
  console.log(`openapi.json up to date (${Object.keys(doc.paths ?? {}).length} paths)`);
} else {
  writeFileSync("openapi.json", text);
  console.log(`wrote openapi.json (${Object.keys(doc.paths ?? {}).length} paths)`);
}
