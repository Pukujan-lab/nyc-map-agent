/**
 * DuckDB with the spatial extension, for the block build and the ingest's
 * point-in-block join. Loads an already-installed extension first, then
 * installs it over HTTPS (some networks block the default plain-HTTP repo).
 */
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export async function spatialDuck(): Promise<DuckDBConnection> {
  const db = await DuckDBInstance.create(":memory:");
  const con = await db.connect();
  try {
    await con.run("LOAD spatial");
  } catch {
    await con.run("INSTALL spatial FROM 'https://extensions.duckdb.org'");
    await con.run("LOAD spatial");
  }
  return con;
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
