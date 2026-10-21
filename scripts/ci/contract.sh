#!/usr/bin/env bash
# Contract test: start the real API server (server/node.ts) and run schemathesis
# against openapi.json. Checks every documented GET under /api/v1 (the /api/*
# aliases are the same handlers): status codes, content types and response
# bodies must match the spec. No secrets: Octo-backed routes answer their
# documented 502. Excluded: binary tile/model routes, POST /agent (LLM), and
# /parking* (Overpass upstream regularly takes >30 s).
set -euo pipefail
cd "$(dirname "$0")/../.."
port=${PORT:-18080}
st=${SCHEMATHESIS:-schemathesis}
env -u OCTO_API_KEY PORT="$port" pnpm exec tsx server/node.ts > "${RUNNER_TEMP:-/tmp}/contract-server.log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT
for _ in $(seq 60); do curl -fs "http://localhost:$port/api/v1/openapi.json" >/dev/null && break; sleep 1; done
"$st" run openapi.json --url "http://localhost:$port" \
  --exclude-deprecated --include-method GET \
  --exclude-path-regex 'tiles|vehicle-models|/parking' \
  --checks status_code_conformance,content_type_conformance,response_schema_conformance \
  --phases examples,fuzzing --max-examples "${MAX_EXAMPLES:-25}" --request-timeout 30 \
  --seed 1 --no-color
