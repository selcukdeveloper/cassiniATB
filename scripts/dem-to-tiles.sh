#!/usr/bin/env bash
set -euo pipefail

# Convert a Copernicus DEM GLO-30 GeoTIFF into XYZ hillshade tiles for react-native-maps.
# Run from the project root: ./scripts/dem-to-tiles.sh [path/to/dem.tif]

DEM_INPUT="${1:-dem_merged.tif}"
HILLSHADE="hillshade.tif"
TILES_DIR="tiles"
ZOOM_RANGE="${ZOOM_RANGE:-7-13}"

if [ ! -f "$DEM_INPUT" ]; then
  echo "DEM file not found: $DEM_INPUT" >&2
  exit 1
fi
if ! command -v gdaldem >/dev/null; then
  echo "GDAL not found. Install with: brew install gdal" >&2
  exit 1
fi
if ! command -v gdal2tiles.py >/dev/null; then
  echo "gdal2tiles.py not found (ships with GDAL — reinstall with: brew reinstall gdal)" >&2
  exit 1
fi

echo "[1/2] Hillshade -> $HILLSHADE (multidirectional)"
gdaldem hillshade -multidirectional -compute_edges "$DEM_INPUT" "$HILLSHADE"

echo "[2/2] Tile pyramid -> $TILES_DIR/  (zoom $ZOOM_RANGE, XYZ scheme)"
rm -rf "$TILES_DIR"
gdal2tiles.py --xyz --processes=4 -z "$ZOOM_RANGE" -r bilinear "$HILLSHADE" "$TILES_DIR"

echo
echo "Done. Tiles ready in ./$TILES_DIR/"
echo "Serve them so your phone can reach the laptop:"
echo "  (cd $TILES_DIR && python3 -m http.server 8000)"
