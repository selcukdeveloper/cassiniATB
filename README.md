# CassiniATB

Capture-the-flag for Norway's water bodies. Scan a kit's QR at a lake, send a
verification request, climb the leaderboard once it's approved.

Built for the **Cassini Hackathon** — uses Copernicus DEM (terrain) and
Copernicus EU-Hydro (lake polygons) as the backing geographic data.

---

## Contents

- [What the app does](#what-the-app-does)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
  - [Database schema (star)](#database-schema-star)
  - [Data flow](#data-flow)
- [Local development](#local-development)
- [Supabase setup](#supabase-setup)
- [Cloudflare R2 setup](#cloudflare-r2-setup)
- [Data pipelines](#data-pipelines)
  - [Copernicus DEM → hillshade tiles](#copernicus-dem--hillshade-tiles)
  - [Copernicus EU-Hydro → lakes.json](#copernicus-eu-hydro--lakesjson)
- [Project structure](#project-structure)
- [App flows](#app-flows)
- [Known caveats / future work](#known-caveats--future-work)

---

## What the app does

| Tab              | Purpose                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map**          | Norway map, every lake polygon. Tap a lake → see who owns it + average drinkability rating. **Rate** it (1-5 stars) or **Test water & claim** it (opens QR scanner). |
| **My Claims**    | Lakes you've **verified** (real ownership). Each row shows expiration countdown.                                                                                     |
| **Verification** | Scans you've submitted that are **pending** approval (or that were **rejected**). Disappear from here once approved.                                                 |
| **Leaderboard**  | Top players ranked by count of active _verified_ claims.                                                                                                             |

Capture-the-flag rules:

- Scan a kit's QR on a lake → row inserted into `water_claims` with `status = 'pending'`.
- Pending claims are **invisible** on the map and **don't count** for the leaderboard.
- An admin (later: automated check) flips status to `verified`. The polygon now colours in your flag colour, you appear on the leaderboard, and the row moves from Verification → My Claims.
- Verified claims expire 30 days after `claimed_at`. After that, anyone can re-scan and take the lake (the `claim_lake` RPC's `ON CONFLICT DO UPDATE` overwrites the row).
- Anyone signed in can **rate** any lake regardless of who owns it. Ratings are independent of claims.

---

## Tech stack

| Layer             | Choice                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Mobile framework  | [Expo SDK 54](https://expo.dev) (React Native 0.81, React 19)                                                                              |
| Language          | TypeScript                                                                                                                                 |
| Routing           | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based, bottom tabs + modal stacks)                                         |
| Map               | [`react-native-maps`](https://github.com/react-native-maps/react-native-maps) — Apple Maps / Google Maps base, custom `<Polygon>` overlays |
| QR scanner        | [`expo-camera`](https://docs.expo.dev/versions/latest/sdk/camera/) `CameraView` with `barcodeScannerSettings`                              |
| Photo picker      | [`expo-image-picker`](https://docs.expo.dev/versions/latest/sdk/imagepicker/) (currently optional/unused)                                  |
| Backend           | [Supabase](https://supabase.com): Postgres + Row-Level Security + Auth + Realtime + Storage                                                |
| Auth              | Email + password, demo accounts seeded via Auth dashboard                                                                                  |
| Static asset host | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible, free egress, public bucket via `pub-*.r2.dev`)                      |
| Bundler           | Metro                                                                                                                                      |

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
   ║   pending|      ║     ║                 ║     ║   pending|      ║
   ║   verified|     ║     ║  UNIQUE         ║     ║   verified|     ║
   ║   rejected      ║     ║  (lake_id,      ║     ║   rejected      ║
   ║  verification_  ║     ║   user_id)      ║     ║  notes          ║
   ║      code       ║     ╚═════════════════╝     ║  uploaded_at    ║
   ║  verified_at    ║                             ╚═════════════════╝
   ╚════════╤════════╝
            │
            │  lake_id  (degenerate dimension —
            │   references external GeoJSON,
            │   no DB table for "lakes")
            ▼
   ┌─────────────────────────────────────────┐
   │  Cloudflare R2: lakes.json              │
   │  87,371 EU-Hydro lake polygons,         │
   │  keyed by LAKID (= our lake_id)         │
   └─────────────────────────────────────────┘

         ╔══════════════════════════════╗   ╔══════════════════════════════╗
         ║  leaderboard  (view)         ║   ║  lake_rating_summary  (view) ║
         ║                              ║   ║                              ║
         ║  Per-profile count of        ║   ║  Per-lake avg(stars),        ║
         ║  ACTIVE + VERIFIED claims    ║   ║  rating count                ║
         ╚══════════════════════════════╝   ╚══════════════════════════════╝
```

**Why "star":**

- One central dimension (`profiles`) joined to several fact tables.
- `lake_id` is a _degenerate_ dimension — the values exist in every fact, but the lake "table" itself is the GeoJSON file in R2. The app does the join in JS by indexing the GeoJSON on `LAKID` (see [`lib/lake-display.ts`](lib/lake-display.ts) and [`components/LakesLayer.tsx`](components/LakesLayer.tsx)).
- Two precomputed analytical views (`leaderboard`, `lake_rating_summary`) sit off the side — read-only, no writes flow back to them.

Row-Level Security is enabled on every fact table:

- Anyone can `SELECT` (so the map and leaderboard work for unauthenticated viewers if we add them).
- Only authenticated users can `INSERT` rows where `user_id = auth.uid()`.
- The `claim_lake(text, text)` Postgres function is `SECURITY DEFINER` and performs the upsert atomically. Clients call it via `supabase.rpc('claim_lake', …)`.

### Data flow

```
 ┌──────────────────────────┐        ┌──────────────────────────┐
 │  Copernicus DEM GLO-30   │        │  Copernicus EU-Hydro     │
 │  (raw GeoTIFF tiles,     │        │  (1.8 GB GeoJSON, all    │
 │   30 m elevation)        │        │   hydrography in NUTS=NO)│
 └────────────┬─────────────┘        └────────────┬─────────────┘
              │                                   │
              │  scripts/dem-to-tiles.sh          │  scripts/euhydro-to-lakes.sh
              │  gdaldem hillshade →              │  ogr2ogr -where "LAKID NOT NULL"
              │  gdal2tiles --xyz                 │  -simplify 0.0005
              ▼                                   ▼
 ┌──────────────────────────┐        ┌──────────────────────────┐
 │  ./tiles/{z}/{x}/{y}.png │        │  ./tiles/lakes.json      │
 │  hillshade pyramid       │        │  ~51 MB, 87 k polygons   │
 └────────────┬─────────────┘        └────────────┬─────────────┘
              │                                   │
              │             rclone sync                  │
              ▼                                   ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  Cloudflare R2  ·  bucket: cassini-hillshade                │
 │  https://pub-XXXX.r2.dev                                    │
 │                                                             │
 │   /7/66/38.png   /8/132/77.png   …  ← hillshade tiles       │
 │   /lakes.json                       ← polygon GeoJSON       │
 └────────────────────────┬────────────────────────────────────┘
                          │  HTTPS (public reads)
                          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  React Native app (Expo Go on iOS)                          │
 │                                                             │
 │   • Apple Maps base layer                                   │
 │   • <Polygon> overlay per visible EU-Hydro lake             │
 │   • <CameraView> QR scan → claim_lake RPC → Supabase        │
 │   • <Realtime> subscription → map recolours                 │
 └─────────────────────────────────────────────────────────────┘
```

The hillshade tile pyramid currently lives in R2 but **isn't rendered by the
app** at the moment (we removed the overlay layer). The pipeline + uploaded
tiles are kept so we can flip it back on with a small component change.

---

## Local development

### Prerequisites

- Node.js ≥ 20 (the project is developed against Node 22 LTS)
- `npm` (lockfile v3)
- Xcode (iOS simulator) **OR** Expo Go on a physical phone on the same Wi-Fi
- For the data pipelines:
  - `gdal` (`brew install gdal`) — for `gdaldem`, `gdal2tiles.py`, `ogr2ogr`
  - `jq` (`brew install jq`) — for the inspection commands in the scripts
  - `rclone` (`brew install rclone`) — for uploading to R2

### One-time setup

```sh
git clone https://github.com/selcukdeveloper/cassiniATB.git
cd cassiniATB
npm install
```

### Run

```sh
npx expo start --clear   # --clear forces .env reload
```

Scan the QR with Expo Go on your phone, or press `i` to open the iOS simulator.

---

## Supabase setup

If you're cloning this and standing up your own backend:

1. **Create project** at <https://supabase.com> → New Project (free tier, region near you).
2. **Run the schema** in the SQL Editor — the canonical migrations executed during development:
   - `profiles`, `water_claims`, `claim_samples` tables + RLS policies
   - `lake_ratings` table + `lake_rating_summary` view
   - `claim_lake(p_lake_id text, p_verification_code text)` RPC (`SECURITY DEFINER`, upserts via `ON CONFLICT (lake_id) DO UPDATE`)
   - `leaderboard` view (per-profile count of active _verified_ claims)
3. **Storage bucket** — Storage → New bucket: `samples` · Public: on.
4. **Demo users** — Authentication → Users → Add user, with "Auto Confirm Email" ticked:
   - `selcuk@dev.no`, `ingrid@phd.no`, `alice@cassini.test`, `bob@cassini.test`, `carol@cassini.test`.
5. **Demo seed data** — claims + ratings on Kristiansand-area lakes; see the seed SQL block from the development conversation.
6. Copy **Settings → API → Project URL** and **anon (public) key** into your `.env`.

> **The anon key is safe to ship in the app bundle** — it's the public client key meant for end users. Never put the _service-role_ key in the app or in git.

---

## Cloudflare R2 setup

R2 hosts two things: the hillshade tile pyramid and `lakes.json`.

1. **Account + bucket:** <https://dash.cloudflare.com> → R2 Object Storage → Create bucket → name `cassini-hillshade`.
2. **Public access:** Settings → Public Access → "R2.dev subdomain" → **Allow Access**. Note the URL `https://pub-XXXX.r2.dev` — this is what `EXPO_PUBLIC_LAKES_URL` and (if re-enabled) `EXPO_PUBLIC_HILLSHADE_URL` point at.
3. **API token:** Manage API Tokens → Create → "Object Read & Write" on this bucket. Copy _Access Key ID_, _Secret Access Key_, and the _S3 Endpoint URL_.
4. **rclone:** `rclone config` → New remote → name `r2` → Storage `s3` → Provider `Cloudflare`. Paste the keys + endpoint. Then set `no_check_bucket = true` (otherwise rclone tries `CreateBucket` on each upload and gets 403):

   ```sh
   rclone config update r2 no_check_bucket true
   ```

Bucket layout after upload:

```
cassini-hillshade/
├── lakes.json                    51 MB
├── 7/66/38.png                   ~400 B
├── 7/66/39.png
├── …
└── 13/4263/2464.png
```

---

## Data pipelines

### Copernicus DEM → hillshade tiles

Input: a merged GeoTIFF DEM covering Norway (e.g. `dem_merged.tif`).

```sh
./scripts/dem-to-tiles.sh path/to/dem_merged.tif
```

What it does ([scripts/dem-to-tiles.sh](scripts/dem-to-tiles.sh)):

1. `gdaldem hillshade -multidirectional -compute_edges` — multi-directional shaded relief.
2. `gdal2tiles.py --xyz --processes=4 -z 7-13 -r bilinear` — XYZ tile pyramid, zoom 7 (country) through 13 (street).

Upload:

```sh
rclone sync tiles r2:cassini-hillshade --transfers 32 --progress --exclude lakes.json
```

`{z}/{x}/{y}.png` becomes `https://pub-…/7/66/38.png` etc.

### Copernicus EU-Hydro → lakes.json

Input: EU-Hydro River Network Database GeoJSON for Norway (download from
[Copernicus Land Portal](https://land.copernicus.eu/), filter by NUTS = `Norge`).
Drop into `data/EU-Hydro.json` (gitignored — it's ~1.8 GB).

```sh
./scripts/euhydro-to-lakes.sh
```

What it does ([scripts/euhydro-to-lakes.sh](scripts/euhydro-to-lakes.sh)):

1. `ogr2ogr -f GeoJSON -where "LAKID IS NOT NULL" -select OBJECTID,NAM,AREA,ALTITUDE,LAKID,LKE_TYPE -simplify 0.0005 -lco RFC7946=YES -lco WRITE_BBOX=YES`
   - Filters 341 k mixed features (rivers/lakes/basins/dams) down to **~87 k lakes**.
   - Drops noise attributes; keeps only what the app uses.
   - Simplifies geometry to ~50 m tolerance — keeps shape, slashes file size.
   - Embeds a per-feature `bbox` so the app can viewport-clip without recomputing.
2. Copies output into `tiles/lakes.json` so the local Python http server picks it up automatically (dev fallback when `EXPO_PUBLIC_LAKES_URL` is unset).

Upload:

```sh
rclone copyto tiles/lakes.json r2:cassini-hillshade/lakes.json --progress
```

Tweak knobs:

```sh
MIN_AREA_M2=1000000 ./scripts/euhydro-to-lakes.sh   # only lakes ≥ 1 km²
SIMPLIFY_DEG=0.001 ./scripts/euhydro-to-lakes.sh    # coarser geometry
```

---

## Project structure

```
.
├── app/                          ← Expo Router routes
│   ├── _layout.tsx               root Stack: tabs + login + claim-verify
│   ├── login.tsx                 email/password screen
│   ├── claim-verify.tsx          QR scan instructions + camera + done
│   └── (tabs)/                   bottom-tab group (auth-gated)
│       ├── _layout.tsx           Tabs config (icons, colours)
│       ├── index.tsx             Map (lakes + ClaimSheet + RatingModal)
│       ├── claims.tsx            My (verified) Claims
│       ├── verification.tsx      Pending/rejected requests
│       └── leaderboard.tsx       Top players
│
├── components/
│   ├── OSMMap.tsx                MapView wrapper, region tracking
│   ├── LakesLayer.tsx            fetches + clips + renders polygons
│   ├── ClaimSheet.tsx            bottom sheet with Rate + Test/Claim actions
│   ├── RatingModal.tsx           star picker
│   └── Header.tsx                map-screen overlay banner
│
├── lib/                          ← non-React helpers
│   ├── supabase.ts               client + DB row types
│   ├── auth.ts                   session hook, profile bootstrap
│   ├── claims.ts                 RPC wrapper, fetch helpers, realtime hook
│   ├── lake-ratings.ts           star-rating upsert + summary
│   ├── lake-display.ts           single source of truth for "Lake LAKID"
│   └── samples.ts                photo upload (currently unused)
│
├── scripts/
│   ├── dem-to-tiles.sh           GDAL hillshade pipeline → R2
│   └── euhydro-to-lakes.sh       GeoJSON filter pipeline → R2
│
├── assets/images/                ← icon, splash, adaptive-icon assets
└── .env                          ← gitignored, contains API keys
```

---

## App flows

### Authentication

1. App boots → `(tabs)/_layout.tsx` checks `useSession()`.
2. No session → `<Redirect href="/login" />`.
3. User enters demo email/password → `signInWithEmail` → if first sign-in, `ensureProfile` upserts a row in `profiles` with a deterministic colour from a 7-colour palette.

### Rate a lake (lightweight, anyone signed in)

- Tap polygon → `ClaimSheet` opens → tap **Rate** → `RatingModal` → 1–5 stars → `rateLake` `UPSERT`s into `lake_ratings`. The aggregate appears in the sheet via `lake_rating_summary`.

### Claim a lake (verified workflow)

1. Tap polygon → `ClaimSheet` → **Test water & claim**.
2. `router.push('/claim-verify?lake_id=…')` → instructions screen.
3. **Open scanner** → `expo-camera` → user points at any QR → `onBarcodeScanned`.
4. `claimLake(lakeId, qrData)` → calls `claim_lake(p_lake_id, p_verification_code)` RPC → `INSERT … ON CONFLICT (lake_id) DO UPDATE` → row stamped with `status='pending'`, fresh `expires_at = now() + 30 days`, `verification_code = qrData`, `verified_at = now()`.
5. Success screen → "Verification request sent" → user navigates to **Verification** tab and sees the row.
6. Admin (out-of-band) updates the row's `status` to `verified` in Supabase.
7. Realtime subscription (`useActiveClaims`) re-fetches → polygon recolours on map. Row moves: Verification → My Claims. Leaderboard `+1`.

### Capture-the-flag

- Anyone scanning a lake replaces the existing claim (the RPC's `ON CONFLICT DO UPDATE`).
- Their `status` resets to `pending`. The previous owner's claim is gone (the lake reverts to "unclaimed" on the map until the new request is verified).

---

## Known caveats / future work

- **Hillshade overlay disabled.** The `dem-to-tiles.sh` pipeline + uploaded R2 tiles still exist; we removed the `<UrlTile>`/`<Overlay>` layer to keep the map fast. Re-enable by reading `EXPO_PUBLIC_HILLSHADE_URL` and rendering an Overlay grid (the previous `HillshadeOverlay.tsx` component is in git history).
- **Photo upload** (`expo-image-picker` + `claim_samples` Storage bucket) is implemented in `lib/samples.ts` but no UI calls it. Plug into Verification tab when needed.
- **No country / regional leaderboards** yet. Would need a reverse-geocode of each lake's centroid and a `country_leaderboard` view.
- **QR validation is a no-op** — any scanned string is accepted as a valid verification code. Add a server-side allowlist or a signed-token check in `claim_lake` once you have real product codes.
- **Single-row-per-lake** in `water_claims` means scan history is overwritten on each new scan. If you want a permanent submission log, split into `claim_attempts` (history) + `water_claims` (current owner) tables.
