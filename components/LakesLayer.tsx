import React, { useEffect, useMemo, useState } from 'react';
import { Polygon, type Region } from 'react-native-maps';
import Constants from 'expo-constants';
import type { ClaimsByLakeId } from '../lib/claims';

// EU-Hydro lake feature shape (post `scripts/euhydro-to-lakes.sh` filter).
export type LakeFeature = {
  type: 'Feature';
  // RFC 7946 bbox: [minLon, minLat, (minZ), maxLon, maxLat, (maxZ)].
  // Length is 4 for 2D, 6 for 3D — EU-Hydro coords carry altitude so we get 6.
  bbox?: number[];
  properties: {
    OBJECTID: number;
    NAM: string | null;
    AREA: number | null; // m²
    ALTITUDE: number | null; // m
    LAKID: string;
    LKE_TYPE: string | null;
  };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
};

// Lakes URL resolution mirrors HILLSHADE_TILE_URL in OSMMap.tsx:
//   1. EXPO_PUBLIC_LAKES_URL (e.g. Cloudflare R2 https URL) for any non-laptop net
//   2. fall back to `http://<expo-bundler-host>:8000/lakes.json` so the Python
//      tile server we already run for hillshade can serve the GeoJSON too
//   3. null → no fetch, no polygons
const hostedLakesUrl = process.env.EXPO_PUBLIC_LAKES_URL;
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const LAKES_URL = hostedLakesUrl
  ? hostedLakesUrl
  : devHost
    ? `http://${devHost}:8000/lakes.json`
    : null;

export type LakesLoadState = 'loading' | 'ready' | 'error' | 'unconfigured';

type Props = {
  // Lake-id → owner info. Lakes in this map render in the owner's color;
  // lakes not in this map render as "unclaimed water" blue.
  claimsByLakeId: ClaimsByLakeId;
  onSelect: (feature: LakeFeature) => void;
  region?: Region;
  onLoadStateChange?: (state: LakesLoadState) => void;
};

// Render budget — at most ~800 polygons on screen at once keeps the map snappy.
const MAX_RENDER = 800;

const UNCLAIMED_FILL = 'rgba(50, 130, 200, 0.35)';
const UNCLAIMED_STROKE = '#1565c0';

// Append "99" alpha (~60%) so the basemap stays slightly visible underneath.
function fillForOwner(ownerColor: string): string {
  // Hex like #3498db → #3498db99
  if (ownerColor.startsWith('#') && (ownerColor.length === 7)) {
    return ownerColor + '99';
  }
  return ownerColor;
}

function ringToCoords(ring: number[][]) {
  return ring.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

// Smaller lakes only matter when zoomed in — show big ones at country scale,
// progressively reveal smaller lakes as the user zooms. AREA is in m².
function minAreaForZoom(latitudeDelta: number): number {
  if (latitudeDelta > 2) return 50_000_000; // > 50 km²
  if (latitudeDelta > 1) return 10_000_000; // > 10 km²
  if (latitudeDelta > 0.5) return 3_000_000; // > 3 km²
  if (latitudeDelta > 0.2) return 1_000_000; // > 1 km²
  if (latitudeDelta > 0.1) return 300_000; // > 0.3 km²
  if (latitudeDelta > 0.05) return 100_000; // > 0.1 km²
  return 0; // street zoom: show all
}

// Bbox-vs-region intersection. RFC 7946 3D bbox is
// [minLon, minLat, minZ, maxLon, maxLat, maxZ]; 2D is [minLon, minLat, maxLon, maxLat].
function intersects(bbox: number[] | undefined, region: Region): boolean {
  if (!bbox || bbox.length < 4) return true;
  const minLon = bbox[0];
  const minLat = bbox[1];
  const maxLon = bbox.length === 6 ? bbox[3] : bbox[2];
  const maxLat = bbox.length === 6 ? bbox[4] : bbox[3];

  const lonHalf = (region.longitudeDelta / 2) * 1.2;
  const latHalf = (region.latitudeDelta / 2) * 1.2;
  const regMinLon = region.longitude - lonHalf;
  const regMaxLon = region.longitude + lonHalf;
  const regMinLat = region.latitude - latHalf;
  const regMaxLat = region.latitude + latHalf;

  return !(
    maxLon < regMinLon ||
    minLon > regMaxLon ||
    maxLat < regMinLat ||
    minLat > regMaxLat
  );
}

export default function LakesLayer({
  claimsByLakeId,
  onSelect,
  region,
  onLoadStateChange,
}: Props) {
  const [allFeatures, setAllFeatures] = useState<LakeFeature[]>([]);

  useEffect(() => {
    if (!LAKES_URL) {
      onLoadStateChange?.('unconfigured');
      console.warn(
        '[LakesLayer] No lakes URL — set EXPO_PUBLIC_LAKES_URL or run `expo start` for the dev fallback.',
      );
      return;
    }
    let cancelled = false;
    onLoadStateChange?.('loading');
    (async () => {
      try {
        const res = await fetch(LAKES_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${LAKES_URL}`);
        const json = (await res.json()) as { features: LakeFeature[] };
        if (cancelled) return;
        const valid = (json.features ?? []).filter(
          (f): f is LakeFeature =>
            f?.geometry?.type === 'Polygon' ||
            f?.geometry?.type === 'MultiPolygon',
        );
        setAllFeatures(valid);
        onLoadStateChange?.('ready');
        console.log(`[LakesLayer] loaded ${valid.length} lake polygons`);
      } catch (err) {
        if (cancelled) return;
        console.error('[LakesLayer] fetch failed:', err);
        onLoadStateChange?.('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // onLoadStateChange isn't in deps because it's a stable setter from the parent;
    // listing it would re-fetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const featuresByArea = useMemo(() => {
    return [...allFeatures].sort(
      (a, b) => (b.properties.AREA ?? 0) - (a.properties.AREA ?? 0),
    );
  }, [allFeatures]);

  const visible = useMemo<LakeFeature[]>(() => {
    if (!region) return featuresByArea.slice(0, MAX_RENDER);
    const minArea = minAreaForZoom(region.latitudeDelta);
    const result: LakeFeature[] = [];
    for (const f of featuresByArea) {
      if ((f.properties.AREA ?? 0) < minArea) continue;
      if (!intersects(f.bbox, region)) continue;
      result.push(f);
      if (result.length >= MAX_RENDER) break;
    }
    return result;
  }, [featuresByArea, region]);

  const polygons: React.ReactNode[] = [];
  for (const feature of visible) {
    const claim = claimsByLakeId[feature.properties.LAKID];
    const fill = claim ? fillForOwner(claim.owner_color) : UNCLAIMED_FILL;
    const stroke = claim ? claim.owner_color : UNCLAIMED_STROKE;
    const strokeWidth = claim ? 2 : 1;
    const onPress = () => onSelect(feature);

    if (feature.geometry.type === 'Polygon') {
      polygons.push(
        <Polygon
          key={`p-${feature.properties.OBJECTID}`}
          coordinates={ringToCoords(feature.geometry.coordinates[0])}
          fillColor={fill}
          strokeColor={stroke}
          strokeWidth={strokeWidth}
          tappable
          onPress={onPress}
        />,
      );
    } else {
      feature.geometry.coordinates.forEach((poly, i) => {
        polygons.push(
          <Polygon
            key={`mp-${feature.properties.OBJECTID}-${i}`}
            coordinates={ringToCoords(poly[0])}
            fillColor={fill}
            strokeColor={stroke}
            strokeWidth={strokeWidth}
            tappable
            onPress={onPress}
          />,
        );
      });
    }
  }

  return <>{polygons}</>;
}
