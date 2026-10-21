/** Loads KEY=VALUE lines from OCTO_ENV_FILE (or .env) into process.env without printing them. */
import { existsSync, readFileSync } from "node:fs";

export function loadEnv(): void {
  const file = process.env.OCTO_ENV_FILE ?? ".env";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
