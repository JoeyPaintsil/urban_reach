# McReach — Full App Handoff Document

> This document exists to give a new agent complete context about the McReach app so it can pick up work without needing to re-read every file.

---

## What the App Does

**McReach** is a McDonald's drive-time coverage analyzer for **Lisbon, Portugal**. It answers two questions:

1. **Coverage mode** — Given a drive time (e.g. 5 minutes), which parts of Lisbon can reach an existing McDonald's?
2. **Optimal mode** — How many new McDonald's would need to be added, and where, so that *every* part of Lisbon is within the drive time?

The user interacts via a map with a sidebar. They can adjust the drive time with a slider or number input, toggle between the two modes, and click any restaurant or suggested location to fly the map to it.

---

## Project Structure

```
Nearest_Distance/
├── backend/
│   ├── main.py                  # FastAPI server — all logic lives here
│   ├── requirements.txt         # Python dependencies
│   ├── .env                     # ORS API key (gitignored)
│   └── lisbon_boundary.pkl      # Cached Lisbon boundary polygon (Shapely geometry)
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Root page — all state, fetching, layout
│   │   └── layout.tsx           # HTML shell, fonts
│   ├── components/
│   │   ├── MapComponent.tsx     # Leaflet map (SSR-disabled)
│   │   ├── Sidebar.tsx          # Left panel: mode toggle, slider, stats, location list
│   │   ├── Header.tsx           # Top bar with app name and backend status pill
│   │   └── Legend.tsx           # Bottom-right map legend overlay
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces for all data shapes
│   └── package.json
├── data/
│   └── mcdonalds_portugal.csv   # Real McDonald's locations across Portugal
│                                # Columns: name, address, latitude, longitude,
│                                #          place_id, rating, status
└── extras/
    └── HANDOFF.md               # This file
```

---

## How to Run

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

The frontend hardcodes `API = "http://localhost:8000"` in `page.tsx`. Both must be running at the same time.

---

## Backend: `backend/main.py`

### Startup sequence (`lifespan`)
1. `load_mcdonalds()` — reads `../data/mcdonalds_portugal.csv`, filters rows to a bounding box covering the Lisbon metro area (lat 38.40–39.05, lng -9.65 to -8.70), assigns sequential IDs. Result stored in global `MCDONALDS` list (~37 locations).
2. `load_boundary()` — loads the Lisbon boundary polygon from `lisbon_boundary.pkl` if cached; otherwise downloads from OpenStreetMap via `osmnx.geocode_to_gdf()`. Saves to pickle for next startup.
3. `_build_grid(rows=60, cols=90)` — creates a 60×90 grid over the boundary bounding box, keeps only points that fall inside the Shapely polygon. Result is `_grid_pts`, a numpy array of shape `(N, 2)` where N ≈ 2471. These points represent all "places in Lisbon that need to be reachable."

### Key globals
| Name | Type | Description |
|---|---|---|
| `MCDONALDS` | `List[dict]` | All real locations for Lisbon metro area |
| `_boundary` | Shapely Polygon/MultiPolygon | Lisbon administrative boundary |
| `_grid_pts` | `np.ndarray (N, 2)` | Grid points inside Lisbon: `[lat, lng]` pairs |

### Distance helper: `_dist_matrix(a, b)`
Vectorized haversine-approximation. Returns an `(n, m)` matrix of distances in km where `a` is shape `(n, 2)` and `b` is `(m, 2)`. Used everywhere for coverage calculations.

### Effective radius: `_eff_radius(minutes)`
Converts drive minutes to a straight-line km radius:
```python
(minutes / 60.0) * 25.0 * 0.82
```
25 km/h assumed city speed, 0.82 road-tortuosity factor. For 5 min → ~1.71 km.

**Known issue:** This radius is smaller than what ORS actually covers visually on the map. The ORS isochrone polygons follow real roads and reach further along arterials. The grid coverage calculation uses this small circle, so there is a mismatch between the visual polygons and the coverage stats. Consider calibrating by computing average ORS polygon area and back-solving for an equivalent circle radius.

### Isochrone generation: `_batch_isochrones_ors(locations, minutes)`
Calls the [OpenRouteService](https://openrouteservice.org/) API in batches of 5 (free tier limit per request). POST to `https://api.openrouteservice.org/v2/isochrones/driving-car`. Returns real road-network polygons as `[[lat, lng], ...]`.

Requires `ORS_API_KEY` in `backend/.env`:
```
ORS_API_KEY=<your_key_here>
```

If no key, falls back to `_approx_isochrone()` which uses a math model with arterial boosts and noise — looks organic but is not real road data.

### API endpoints

#### `GET /api/mcdonalds`
Returns the full list of locations:
```json
{ "locations": [{ "id": 1, "name": "...", "lat": 38.71, "lng": -9.14, "address": "..." }, ...] }
```

#### `GET /api/isochrones?minutes=5`
1. Calls ORS batch for all MCDONALDS → falls back to approx if no key.
2. Computes `_eff_radius(minutes)`, builds distance matrix between `_grid_pts` and all McDonald's.
3. Returns isochrone polygons + coverage stats (total grid points, covered count, percentage).

Response shape:
```json
{
  "isochrones": [{ "id": 1, "name": "...", "center": {"lat": ..., "lng": ...}, "polygon": [[lat,lng],...] }],
  "coverage": { "total": 2471, "covered": 847, "pct": 34.3 },
  "engine": "ors"
}
```

#### `GET /api/optimal-placement?minutes=5&target_pct=100`
Greedy set-cover algorithm:
1. Determine which grid points are already covered by existing McDonald's.
2. If coverage >= target, return immediately with empty optimal list.
3. Otherwise, loop:
   - Compute `(M×M)` distance matrix across all remaining uncovered grid points.
   - Find the uncovered point that covers the most other uncovered points within the radius.
   - Place a new McDonald's there; remove newly covered points from remaining set.
   - Repeat until remaining is empty or 200-placement safety cap is hit.
4. Fetch ORS isochrones for all new locations.
5. Return the list of optimal locations + before/after coverage stats.

Response shape:
```json
{
  "optimal_locations": [{ "id": "opt_1", "lat": ..., "lng": ..., "rank": 1, "coverage_score": 0, "polygon": [[lat,lng],...] }],
  "stats": { "coverage_before_pct": 34.3, "coverage_after_pct": 100.0, "covered_before": 847, "covered_after": 2471, "total_grid_points": 2471 }
}
```

---

## Frontend

### State (all in `app/page.tsx`)
| State var | Type | Description |
|---|---|---|
| `mode` | `"coverage" \| "optimal"` | Which panel/view is active |
| `driveTime` | `number` | Minutes, 1–60, default 5 |
| `locations` | `Location[]` | All existing McDonald's (fetched once) |
| `isochrones` | `IsochroneData[]` | Polygons for coverage mode |
| `coverage` | `SimpleCoverage \| null` | `{total, covered, pct}` for sidebar stats |
| `optimalLocations` | `OptimalLocation[]` | Greedy-placed new locations |
| `optimalStats` | `CoverageStats \| null` | Before/after percentages |
| `loading` | `boolean` | Shows spinner overlay and loading pill |
| `apiError` | `boolean` | Shows red banner + disables live pill |
| `selectedId` | `number \| string \| null` | Which restaurant/location is highlighted |

### Data flow
1. On mount: fetch `/api/mcdonalds` → set `locations`; then fetch `/api/isochrones?minutes=5`.
2. Drive time change: 500ms debounce → re-fetch isochrones; if mode is optimal, re-fetch optimal too.
3. Switching to optimal mode: immediately calls `fetchOptimal(driveTime, 100)`.
4. Clicking a sidebar card or map marker: sets `selectedId` → `MapController` flies the Leaflet map to that location.

### `MapComponent.tsx`
- Client-only (imported with `dynamic(..., { ssr: false })`).
- CartoDB light basemap tiles.
- Green semi-transparent polygons for existing coverage (`isochrones`).
- Amber dashed polygons for optimal placement zones.
- Yellow teardrop markers for existing McDonald's (turns red when selected).
- Amber circle markers numbered by rank for optimal locations.
- `MapController` component uses `useMap()` hook and `useEffect` on `selectedId` to call `map.flyTo()`.

### TypeScript types (`types/index.ts`)
```ts
Location        { id, name, lat, lng, address }
IsochroneData   { id, name, center: {lat, lng}, polygon: [number, number][] }
OptimalLocation { id, lat, lng, coverage_score, polygon, rank }
CoverageStats   { total_grid_points, covered_before, covered_after, coverage_before_pct, coverage_after_pct }
SimpleCoverage  { total, covered, pct }
```

---

## Known Issues / Pending Work

### 1. Coverage radius mismatch (most important)
The `_eff_radius()` function returns ~1.71 km for 5 minutes. The actual ORS road-network isochrones cover more area (they follow highways further). So:
- The visual green polygons look bigger than what the coverage stat counts.
- The optimal placement algorithm places locations based on tiny circles, not actual road reach.
- **Fix:** Either measure actual ORS polygon areas and back-solve for an equivalent radius, or refactor the optimal algorithm to use the real Shapely polygons for coverage checking.

### 2. Lisbon boundary may still be AML (too large)
The cached `lisbon_boundary.pkl` may contain the "Area Metropolitana de Lisboa" (~3000 km²) rather than the tighter Lisboa municipality (~85 km²). If coverage stats look very low (e.g. 1–2% for 5 min), delete `backend/lisbon_boundary.pkl` and change the query in `load_boundary()`:
```python
queries = [
    "Grande Lisboa, Portugal",
    "Lisboa, Portugal",
    "Lisbon, Portugal",
]
```
Then restart the backend to re-download and re-cache.

### 3. Header says "Demo data"
The `Header.tsx` component has a hardcoded label "Demo data · Lisbon metro area". Now that real CSV data is loaded, this could be updated to something like "37 locations · Lisbon metro area".

---

## ORS API Key
Stored in `backend/.env` (gitignored). Format:
```
ORS_API_KEY=eyJ...base64...
```
Free tier: 500 requests/day, max 5 locations per isochrone request. With 37 restaurants, that is 8 requests per `/api/isochrones` call.

---

## Git / Gitignore
The following are excluded from git:
- `backend/.env` — API key
- `backend/lisbon_boundary.pkl` — large binary cache
- `backend/graph_cache/`, `backend/*.graphml` — osmnx road graph cache (not used anymore)
- `frontend/.next/`, `frontend/node_modules/`
- `__pycache__/`, `*.pyc`
