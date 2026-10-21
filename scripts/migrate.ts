/**
 * Applies dbmate-format migrations (db/migrations/*.sql, "-- migrate:up" /
 * "-- migrate:down") through Octo's SQL endpoint, tracking them in
 * public.schema_migrations exactly like dbmate does. Once a DSN exists,
 * `dbmate up` can take over with no file changes.
 *
 *   pnpm db:migrate            apply pending
 *   pnpm db:migrate status     list applied / pending
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { octoQuery } from "../api/_lib/octo";
import { loadEnv } from "./env";

export function upSection(sql: string): string {
  const up = sql.split(/^--\s*migrate:down/m)[0];
  return up.replace(/^--\s*migrate:up.*$/m, "").trim();
}

async function main() {
  loadEnv();
  const dir = "db/migrations";
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  await octoQuery("CREATE TABLE IF NOT EXISTS public.schema_migrations (version varchar(128) PRIMARY KEY)");
  const applied = new Set(
    (await octoQuery<{ version: string }>("SELECT version FROM public.schema_migrations")).rows.map((r) => r.version),
  );
  const status = process.argv[2] === "status";
  for (const file of files) {
    const version = file.split("_")[0];
    if (applied.has(version)) {
      if (status) console.log(`applied  ${file}`);
      continue;
    }
    if (status) {
      console.log(`pending  ${file}`);
      continue;
    }
    if (!/^\d+$/.test(version)) throw new Error(`bad version in ${file}`);
    const t0 = Date.now();
    const body = upSection(readFileSync(join(dir, file), "utf8"));
    await octoQuery(`BEGIN;\n${body}\nINSERT INTO public.schema_migrations (version) VALUES ('${version}');\nCOMMIT;`);
    console.log(`applied  ${file} (${Date.now() - t0} ms)`);
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
