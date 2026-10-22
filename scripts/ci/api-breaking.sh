#!/usr/bin/env bash
# Breaking-change gate for openapi.json (oasdiff). A breaking change against the
# base branch is allowed only when info.version (= package.json version) has a
# higher major than the base. Usage: api-breaking.sh <base.json> <head.json>
set -euo pipefail
base=$1 head=$2
major() { node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).info.version; console.log(Number(String(v).split(".")[0])||0)' "$1"; }
if "${OASDIFF:-oasdiff}" breaking "$base" "$head" --fail-on ERR --format githubactions; then
  echo "no breaking API changes"; exit 0
fi
bm=$(major "$base"); hm=$(major "$head")
if [ "$hm" -gt "$bm" ]; then
  echo "breaking API changes accepted: major version bumped $bm -> $hm"; exit 0
fi
echo "::error::openapi.json has breaking changes (above) but the major version did not change ($bm). Make it non-breaking (add a new /api/vN path, keep the old one) or bump the major version."
exit 1
