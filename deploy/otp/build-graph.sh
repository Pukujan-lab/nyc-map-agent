#!/usr/bin/env bash
# Weekly OTP graph rebuild: fetch NYC OSM + MTA/NYC Ferry GTFS, build graph.obj
# in a one-shot OTP container, swap it in atomically, restart the otp service.
# SIR ships inside gtfs_subway.zip. The env file supplies MTA_BUSTIME_KEY
# (router-config.json substitutes ${MTA_BUSTIME_KEY}). Run on gravebuster (cron: Sun 04:10 New York). See docs/OTP.md.
set -euo pipefail
ROOT=${OTP_ROOT:-/srv/nyc-map-agent/otp}
APP=${APP_DIR:-/srv/nyc-map-agent/app}
IMAGE=${OTP_IMAGE:-opentripplanner/opentripplanner:2.10.0}
STAGE="$ROOT/stage"; LIVE="$ROOT/graph"
mkdir -p "$STAGE" "$LIVE"
cp "$APP"/deploy/otp/{build-config.json,router-config.json,otp-config.json} "$STAGE"/
S3=https://rrgtfsfeeds.s3.amazonaws.com
fetch() { curl -fsSL --retry 3 -o "$STAGE/$2.tmp" "$1" && mv "$STAGE/$2.tmp" "$STAGE/$2"; }
fetch https://download.bbbike.org/osm/bbbike/NewYork/NewYork.osm.pbf nyc.osm.pbf
for f in gtfs_subway gtfs_bx gtfs_b gtfs_m gtfs_q gtfs_si gtfs_busco gtfslirr gtfsmnr; do fetch "$S3/$f.zip" "$f.zip"; done
fetch https://nycferry.connexionz.net/rtt/public/utility/gtfs.aspx gtfs_ferry.zip
rm -f "$STAGE/graph.obj"
docker run --rm --name nyc-map-otp-build -m 14g -e JAVA_TOOL_OPTIONS=-Xmx12g --env-file "${ENV_FILE:-/srv/nyc-map-agent/.env}" \
  -v "$STAGE":/var/opentripplanner "$IMAGE" --build --save
cp "$STAGE"/{router-config.json,otp-config.json,build-config.json} "$LIVE"/
mv "$STAGE/graph.obj" "$LIVE/graph.obj.new" && mv "$LIVE/graph.obj.new" "$LIVE/graph.obj"
docker restart nyc-map-otp >/dev/null 2>&1 || echo "otp container not running yet; start it with compose"
echo "graph rebuilt $(date -Is)"
