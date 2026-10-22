#!/usr/bin/env bash
# Migration round trip: baseline -> up -> down to zero -> up, failing on drift.
#   1. after all downs the schema must equal the pre-migration baseline
#   2. the second up must produce exactly the schema of the first up
# Needs DATABASE_URL, psql and dbmate on PATH. Used by .github/workflows/ci.yml (migrations job).
set -euo pipefail
cd "$(dirname "$0")/../.."
out=${OUT_DIR:-$(mktemp -d)}
snap() { psql "$DATABASE_URL" -X -q -tA -v ON_ERROR_STOP=1 -f db/ci/schema-snapshot.sql > "$out/$1.txt"; }
dbm() { dbmate --migrations-dir db/migrations --no-dump-schema --wait "$@"; }

psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f db/ci/legacy-public-tables.sql
# dbmate creates its tracking table on first run; create it up front so the baseline includes it.
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS public.schema_migrations (version varchar(128) PRIMARY KEY)'
snap baseline
dbm up
snap up1
n=$(ls db/migrations/*.sql | wc -l)
for _ in $(seq "$n"); do dbm down; done
snap down
dbm up
snap up2

fail=0
if ! diff -u "$out/baseline.txt" "$out/down.txt"; then echo "::error::down migrations leave objects behind (diff above: baseline vs after all downs)"; fail=1; fi
if ! diff -u "$out/up1.txt" "$out/up2.txt"; then echo "::error::up after down does not reproduce the schema (diff above)"; fail=1; fi
[ "$fail" = 0 ] && echo "migration round trip OK: $n migrations, $(wc -l < "$out/up1.txt") schema objects, no drift"
exit "$fail"
