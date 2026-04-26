#!/usr/bin/env bash
set -euo pipefail

# Filter the Copernicus EU-Hydro dump (rivers + lakes + basins + dams in one
# GeoJSON, ~1.8 GB for Norway) down to a lakes-only GeoJSON that the app fetches
# at runtime (NOT bundled — too big once we drop the AREA threshold).
#
# Default behaviour: full coverage (every LAKID-populated lake, no AREA threshold).
# Output goes to:
#   data/eu-hydro/lakes.geojson  — canonical artifact, gitignored
#   tiles/lakes.json             — picked up by the local Python tile server
#                                  (http://<lan>:8000/lakes.json) so the dev
#                                  fallback in LakesLayer.tsx Just Works
#
# Usage:
#   ./scripts/euhydro-to-lakes.sh                          # full coverage (no threshold)
#   MIN_AREA_M2=100000 ./scripts/euhydro-to-lakes.sh       # only lakes >= 0.1 km²
#   SIMPLIFY_DEG=0.001 ./scripts/euhydro-to-lakes.sh       # coarser geometry

INPUT="${1:-data/EU-Hydro.json}"
OUT_DIR="data/eu-hydro"
OUT_FILE="$OUT_DIR/lakes.geojson"
SERVE_PATH="tiles/lakes.json"
MIN_AREA_M2="${MIN_AREA_M2:-0}"          # 0 = no AREA filter (full coverage)
SIMPLIFY_DEG="${SIMPLIFY_DEG:-0.0005}"   # ~50 m at Norwegian latitudes

if [ ! -f "$INPUT" ]; then
  echo "EU-Hydro file not found: $INPUT" >&2
  exit 1
fi
if ! command -v ogr2ogr >/dev/null; then
  echo "GDAL ogr2ogr not found. brew install gdal" >&2
  exit 1
fi
if ! command -v jq >/dev/null; then
  echo "jq not found. brew install jq" >&2
  exit 1
fi

# Build the WHERE clause. When MIN_AREA_M2 is 0 we skip the AREA condition
# entirely so we don't drop lakes that just happen to have a NULL AREA value.
if [ "$MIN_AREA_M2" -eq 0 ]; then
  WHERE_CLAUSE="LAKID IS NOT NULL"
  THRESHOLD_LABEL="full coverage (no AREA threshold)"
else
  WHERE_CLAUSE="LAKID IS NOT NULL AND AREA >= $MIN_AREA_M2"
  THRESHOLD_LABEL=">= ${MIN_AREA_M2} m²"
fi

mkdir -p "$OUT_DIR" tiles
rm -f "$OUT_FILE"

echo "[filter+simplify]  $THRESHOLD_LABEL, tolerance $SIMPLIFY_DEG°"
echo "                   input  : $INPUT  ($(du -h "$INPUT" | cut -f1))"
echo "                   output : $OUT_FILE"
ogr2ogr \
  -f GeoJSON \
  -where "$WHERE_CLAUSE" \
  -select OBJECTID,NAM,AREA,ALTITUDE,LAKID,LKE_TYPE \
  -simplify "$SIMPLIFY_DEG" \
  -lco RFC7946=YES \
  -lco WRITE_BBOX=YES \
  "$OUT_FILE" \
  "$INPUT"

cp "$OUT_FILE" "$SERVE_PATH"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
COUNT=$(jq '.features | length' "$OUT_FILE")
SAMPLE=$(jq '.features[0].properties' "$OUT_FILE")

echo
echo "Done."
echo "  size     : $SIZE"
echo "  features : $COUNT"
echo "  sample   :"
echo "$SAMPLE" | sed 's/^/    /'
echo
echo "Now served locally at  http://<your-lan-ip>:8000/lakes.json"
echo "(make sure ./tiles/ is the cwd of your python http.server)"
echo
echo "To deploy to Cloudflare R2 (overrides the local fallback):"
echo "  rclone copyto $SERVE_PATH r2:cassini-hillshade/lakes.json --progress"
echo "Then add to .env in the project root:"
echo "  EXPO_PUBLIC_LAKES_URL=https://pub-32986430b7e441f49e3dd785e13ad9e4.r2.dev/lakes.json"
echo "Then:  npx expo start --clear"
