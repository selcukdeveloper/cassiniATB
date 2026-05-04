# MarinersATB

Capture-the-flag for Norway's water bodies. Scan a kit's QR at a lake, send a verification request, climb the leaderboard once it's approved.

Originally built for the **Cassini Hackathon** — uses Copernicus DEM and Copernicus EU-Hydro as the backing geographic data.

---

## Tabs

| Tab              | Purpose                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| **Map**          | Every lake polygon in Norway. Tap a lake to rate it (1-5 stars) or scan a kit's QR to claim it.      |
| **My Claims**    | Lakes you have claimed and that have been verified. Each row shows the 30-day expiration countdown.  |
| **Verification** | Verification requests you submitted that are pending approval (or were rejected).                    |
| **Leaderboard**  | Top players, ranked by count of active verified claims.                                              |

**Capture-the-flag rules**

- Scanning a kit's QR on a lake inserts a row into `water_claims` with `status = 'pending'`.
- Pending claims are invisible on the map and don't count for the leaderboard.
- An admin flips the status to `verified` (later: automated check). The polygon then colours in your flag colour, you appear on the leaderboard, and the row moves from Verification → My Claims.
- Verified claims expire 30 days after `claimed_at`. After that, anyone can re-scan and take the lake.
- Ratings are independent of claims — anyone signed in can rate any lake.

---

## Tech stack

- **Mobile**: Expo SDK 54 (React Native 0.81, React 19) + TypeScript + Expo Router (file-based)
- **Map**: `react-native-maps` with custom `<Polygon>` overlays
- **QR scanner**: `expo-camera`
- **Backend**: Supabase — Postgres + Row-Level Security + Auth + Realtime
- **Static asset host**: Cloudflare R2 (S3-compatible, public bucket via `pub-*.r2.dev`)

Runs in **Expo Go** on a physical iPhone over LAN — no dev build required.

---

## Architecture

### Database schema (star)

```
                         ╔══════════════════════╗
                         ║       profiles       ║   ← dimension
                         ║                      ║
                         ║  id  (PK → auth.users)
                         ║  username (unique)   ║
                         ║  color  (hex)        ║
                         ║  created_at          ║
                         ╚══════════╤═══════════╝
                                    │  user_id (FK)
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
   ╔════════▼════════╗     ╔════════▼════════╗     ╔════════▼════════╗
   ║  water_claims   ║     ║  lake_ratings   ║     ║  claim_samples  ║
   ║      (fact)     ║     ║      (fact)     ║     ║      (fact)     ║
   ║                 ║     ║                 ║     ║                 ║
   ║  lake_id  PK    ║     ║  id  PK         ║     ║  id  PK         ║
   ║  user_id        ║     ║  lake_id        ║     ║  lake_id        ║
   ║  claimed_at     ║     ║  user_id        ║     ║  user_id        ║
   ║  expires_at     ║     ║  stars  (1..5)  ║     ║  photo_url      ║
   ║  status         ║     ║  created_at     ║     ║  status         ║
   ║  verification_  ║     ║                 ║     ║  notes          ║
   ║      code       ║     ║  UNIQUE         ║     ║  uploaded_at    ║
   ║  verified_at    ║     ║  (lake_id,      ║     ║                 ║
   ║                 ║     ║   user_id)      ║     ║                 ║
   ╚════════╤════════╝     ╚═════════════════╝     ╚═════════════════╝
            │
            │  lake_id  (degenerate dimension —
            │   the values exist in every fact,
            │   but lakes have no DB table)
            ▼
   ┌─────────────────────────────────────────┐
   │  Cloudflare R2: lakes.json              │
   │  87,371 EU-Hydro lake polygons,         │
   │  keyed by LAKID (= lake_id)             │
   └─────────────────────────────────────────┘

         ╔══════════════════════════════╗   ╔══════════════════════════════╗
         ║  leaderboard  (view)         ║   ║  lake_rating_summary  (view) ║
         ║  per-profile count of        ║   ║  per-lake avg(stars),        ║
         ║  active verified claims      ║   ║  rating count                ║
         ╚══════════════════════════════╝   ╚══════════════════════════════╝
```

`profiles` is the central dimension. Three fact tables hang off it via `user_id`. `lake_id` is a *degenerate* dimension — the lake "table" is the GeoJSON file in R2; the app indexes it on `LAKID` and does the join in JS ([`lib/lake-display.ts`](lib/lake-display.ts), [`components/LakesLayer.tsx`](components/LakesLayer.tsx)).

Row-Level Security lets anyone `SELECT` and only authenticated users `INSERT` rows where `user_id = auth.uid()`. The `claim_lake(lake_id, verification_code)` RPC is `SECURITY DEFINER` and does the upsert atomically (`ON CONFLICT (lake_id) DO UPDATE`).

---

## Data pipelines

```
┌──────────────────────────┐                  ┌──────────────────────────┐
│ Copernicus Data Space    │                  │ Copernicus Land Portal   │
│ Ecosystem (CDSE) S3      │                  │ EU-Hydro download        │
│ DEM tiles                │                  │ ~1.8 GB GeoJSON          │
└────────────┬─────────────┘                  └────────────┬─────────────┘
             │                                             │
             │  01_dem_workflow.ipynb                      │
             │  (Python: token → S3 → 161 tiles → merge)   │
             ▼                                             │
   ┌──────────────────────┐                                │
   │   dem_merged.tif     │                                │
   └────────────┬─────────┘                                │
                │                                          │
                │  scripts/dem-to-tiles.sh                 │  scripts/euhydro-to-lakes.sh
                │  gdaldem hillshade → gdal2tiles --xyz    │  ogr2ogr filter + simplify
                ▼                                          ▼
   ┌─────────────────────────────┐         ┌──────────────────────────┐
   │  tiles/{z}/{x}/{y}.png      │         │  tiles/lakes.json        │
   │  hillshade pyramid          │         │  ~51 MB · 87 k polygons  │
   └────────────┬────────────────┘         └────────────┬─────────────┘
                │             rclone sync               │
                ▼                                       ▼
       ┌──────────────────────────────────────────────────────┐
       │  Cloudflare R2 · mariners-hillshade · pub-*.r2.dev   │
       └──────────────────────────────────────────────────────┘
                                │
                                │  HTTPS (public reads)
                                ▼
                         React Native app
```

### 1. Copernicus DEM

[`01_dem_workflow.ipynb`](01_dem_workflow.ipynb) — Python notebook:

1. Loads `.env` and gets an OAuth access token from Copernicus Data Space Ecosystem.
2. Creates temporary S3 credentials for the CDSE DEM bucket.
3. Searches DEM products inside a bbox (default: full Norway = `4.5°E – 31.3°E, 57.8°N – 71.3°N` → 200 products).
4. Downloads 161 GeoTIFF tiles via S3.
5. Merges them with `rasterio` into a single `data/processed/dem_merged.tif`.

The notebook imports helpers from `src/bbox.py` and `src/dem.py`, which live in a sibling Python project — not in this repo.

### 2. Hillshade tiles

```sh
./scripts/dem-to-tiles.sh path/to/dem_merged.tif
```

[`scripts/dem-to-tiles.sh`](scripts/dem-to-tiles.sh):
- `gdaldem hillshade -multidirectional -compute_edges` — multi-directional shaded relief
- `gdal2tiles.py --xyz --processes=4 -z 7-13 -r bilinear` — XYZ tile pyramid

Rendered natively in [`components/OSMMap.tsx`](components/OSMMap.tsx) via `<UrlTile>`. Hillshade is the *only* basemap — Apple/Google's basemap is suppressed so the hillshade isn't fighting it for pixels:

- **Android (Google Maps):** `mapType="none"` hides Google's basemap.
- **iOS (Apple Maps):** `MKMapType` has no `none`; we use `shouldReplaceMapContent={true}` on the `<UrlTile>` instead. Since react-native-maps 1.7.0 the overlay is added at `MKOverlayLevelAboveLabels`, so even Apple's labels stay hidden behind our tiles.

URL config (in `.env`, picked up by Metro at bundle time):

```env
EXPO_PUBLIC_HILLSHADE_URL=https://pub-XXXXXXXX.r2.dev/{z}/{x}/{y}.png
```

After editing `.env` you must `npx expo start --clear` — Metro inlines `EXPO_PUBLIC_*` constants at bundle time, so an old bundle keeps the old (or missing) value.

Upload to R2:

```sh
rclone sync tiles r2:mariners-hillshade --transfers 32 --progress --exclude lakes.json
```

### 3. EU-Hydro lakes

Download the EU-Hydro River Network Database (`NUTS = Norge`) from the [Copernicus Land Portal](https://land.copernicus.eu/), drop into `data/EU-Hydro.json` (gitignored).

```sh
./scripts/euhydro-to-lakes.sh
```

[`scripts/euhydro-to-lakes.sh`](scripts/euhydro-to-lakes.sh):
- `ogr2ogr -where "LAKID IS NOT NULL" -select OBJECTID,NAM,AREA,ALTITUDE,LAKID,LKE_TYPE -simplify 0.0005 -lco RFC7946=YES -lco WRITE_BBOX=YES`
- 341 k mixed features → 87 k lake polygons; ~50 m geometry tolerance; per-feature `bbox` for client-side viewport clipping
- Outputs `tiles/lakes.json` (~51 MB)

Upload:

```sh
rclone copyto tiles/lakes.json r2:mariners-hillshade/lakes.json --progress
```

Knobs: `MIN_AREA_M2=1000000` for lakes ≥ 1 km², `SIMPLIFY_DEG=0.001` for coarser geometry.

---

## Cloudflare R2

Bucket: `mariners-hillshade`. Public read enabled via "R2.dev subdomain" → URL `https://pub-XXXX.r2.dev`.

Layout:

```
mariners-hillshade/
├── lakes.json
├── 7/66/38.png
├── 7/66/39.png
├── …
└── 13/4263/2464.png
```

rclone config: provider `Cloudflare`, paste S3 endpoint + access keys, then `rclone config update r2 no_check_bucket true` (otherwise `CreateBucket` 403s on every upload).

---

## Local development

### Prerequisites

- Node ≥ 20
- For the data pipelines: `gdal`, `jq`, `rclone` (all `brew install`)
- For the DEM notebook: Python 3.10+, `rasterio`, `boto3`, `python-dotenv`, plus the `src/` helpers from the sibling project

### Setup

```sh
git clone https://github.com/selcukdeveloper/marinersATB.git
cd marinersATB
npm install
```

Create `.env` (gitignored — never commit):

```env
EXPO_PUBLIC_HILLSHADE_URL=https://pub-XXXXXXXX.r2.dev/{z}/{x}/{y}.png
EXPO_PUBLIC_LAKES_URL=https://pub-XXXXXXXX.r2.dev/lakes.json
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### Run

```sh
npx expo start --clear
```

Scan the QR with Expo Go on your phone, or press `i` for the iOS simulator.

---

## Supabase

If you're standing up your own backend:

1. Create a project at <https://supabase.com>.
2. Run the schema migrations in the SQL Editor — `profiles`, `water_claims`, `claim_samples`, `lake_ratings` tables with RLS, the `claim_lake(text, text)` RPC, and the `leaderboard` + `lake_rating_summary` views.
3. Add demo users via Authentication → Users with "Auto Confirm Email" ticked.
4. Copy *Settings → API → Project URL* and *anon (public) key* into `.env`.

> The anon key is safe to ship in the client bundle. The *service-role* key must never go in the app or in git.

---

## Project structure

```
.
├── app/                          ← Expo Router routes
│   ├── _layout.tsx               root Stack
│   ├── login.tsx                 email/password
│   ├── claim-verify.tsx          QR scan flow
│   └── (tabs)/                   bottom-tab group, auth-gated
│       ├── _layout.tsx
│       ├── index.tsx             Map
│       ├── claims.tsx            My (verified) Claims
│       ├── verification.tsx      Pending requests
│       └── leaderboard.tsx
│
├── components/
│   ├── OSMMap.tsx                MapView wrapper
│   ├── LakesLayer.tsx            polygons + viewport clipping
│   ├── ClaimSheet.tsx            tap-a-lake bottom sheet
│   ├── RatingModal.tsx           star picker
│   └── Header.tsx                map overlay banner
│
├── lib/
│   ├── supabase.ts               client + row types
│   ├── auth.ts                   session + profile bootstrap
│   ├── claims.ts                 RPC, fetches, realtime
│   ├── lake-ratings.ts           star-rating upsert + summary
│   ├── lake-display.ts           "Lake LAKID" label helper
│   └── samples.ts                photo upload helpers
│
├── scripts/
│   ├── dem-to-tiles.sh
│   └── euhydro-to-lakes.sh
│
├── 01_dem_workflow.ipynb         ← Copernicus DEM download + merge
└── .env                          credentials
```
