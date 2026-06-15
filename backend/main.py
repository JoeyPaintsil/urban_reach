"""
McReach backend
- Isochrones: OpenRouteService API (real road network) -> approx fallback
- Coverage grid: clipped to Lisboa GeoJSON boundary
- Custom locations: POST /api/isochrones accepts extra_locations to include in calc
"""

import csv
import json
import logging
import math
import os
import warnings
from contextlib import asynccontextmanager
from typing import List, Optional

import networkx as nx
import numpy as np
import osmnx as ox
import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from shapely.geometry import Point, MultiPolygon, Polygon as ShapelyPolygon, shape
from shapely.ops import unary_union

warnings.filterwarnings("ignore")
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("osmnx").setLevel(logging.WARNING)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ORS_API_KEY: Optional[str] = os.environ.get("ORS_API_KEY") or None
ORS_URL = "https://api.openrouteservice.org/v2/isochrones/driving-car"

# ── Lisbon boundary (loaded first at startup) ──────────────────
_GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lisbon_boundary.geojson")
_AIRPORT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "airport.geojson")
_boundary = None
_boundary_coords: List[List[float]] = []
_grid_pts: np.ndarray = np.empty((0, 2))
_airport_coords: List[List[float]] = []


def load_boundary() -> None:
    global _boundary, _boundary_coords, _grid_pts

    print("Loading Lisbon boundary from GeoJSON...")
    with open(_GEOJSON_PATH, encoding="utf-8") as f:
        gj = json.load(f)

    if gj["type"] == "FeatureCollection":
        geom_dict = gj["features"][0]["geometry"]
    elif gj["type"] == "Feature":
        geom_dict = gj["geometry"]
    else:
        geom_dict = gj

    _boundary = shape(geom_dict)
    _boundary_coords = [[c[1], c[0]] for c in _boundary.exterior.coords]
    bounds = _boundary.bounds
    print(f"Boundary loaded: {_boundary.geom_type} | lat {bounds[1]:.4f}-{bounds[3]:.4f}, lng {bounds[0]:.4f}-{bounds[2]:.4f}")
    _build_grid()


def _build_grid(rows: int = 60, cols: int = 90) -> None:
    global _grid_pts
    min_lng, min_lat, max_lng, max_lat = _boundary.bounds

    lat_vals = np.linspace(min_lat, max_lat, rows)
    lng_vals = np.linspace(min_lng, max_lng, cols)

    pts = []
    for lat in lat_vals:
        for lng in lng_vals:
            if _boundary.contains(Point(lng, lat)):
                pts.append((lat, lng))

    _grid_pts = np.array(pts, dtype=np.float64)
    print(f"Grid built: {len(_grid_pts)} points inside Lisboa boundary")


def load_airport() -> None:
    global _airport_coords
    try:
        with open(_AIRPORT_PATH, encoding="utf-8") as f:
            gj = json.load(f)
        if gj["type"] == "FeatureCollection":
            geom = gj["features"][0]["geometry"]
        elif gj["type"] == "Feature":
            geom = gj["geometry"]
        else:
            geom = gj
        if geom["type"] == "Polygon":
            ring = geom["coordinates"][0]
        else:
            ring = geom["coordinates"][0][0]
        _airport_coords = [[c[1], c[0]] for c in ring]
        print(f"Airport loaded: {len(_airport_coords)} points")
    except Exception as e:
        print(f"Airport load failed: {e}")


# ── McDonald's locations (loaded after boundary) ───────────────
MCDONALDS: List[dict] = []
_CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mcdonalds_portugal.csv")


def load_mcdonalds() -> None:
    global MCDONALDS
    locations = []
    with open(_CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=1):
            try:
                lat = float(row["latitude"])
                lng = float(row["longitude"])
            except (ValueError, KeyError):
                continue
            if not _boundary.contains(Point(lng, lat)):
                continue
            locations.append({
                "id": i,
                "name": row.get("name", f"McDonald's #{i}"),
                "lat": lat,
                "lng": lng,
                "address": row.get("address", ""),
            })
    MCDONALDS = locations
    print(f"Loaded {len(MCDONALDS)} McDonald's locations inside Lisboa boundary")


# ── Distance helpers ───────────────────────────────────────────

def _dist_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    lat1 = a[:, 0:1]
    lng1 = a[:, 1:2]
    lat2 = b[:, 0]
    lng2 = b[:, 1]
    dlat = (lat1 - lat2) * 111.0
    mean_lat = np.radians((lat1 + lat2) / 2)
    dlng = (lng1 - lng2) * 111.0 * np.cos(mean_lat)
    return np.sqrt(dlat ** 2 + dlng ** 2)


def _eff_radius(minutes: float) -> float:
    return (minutes / 60.0) * 25.0 * 0.82


def _make_circle(lat: float, lng: float, r_km: float) -> ShapelyPolygon:
    pt = Point(lng, lat)
    r_deg = r_km / 111.0
    cos_lat = math.cos(math.radians(lat))
    base = pt.buffer(r_deg, resolution=32)
    return shapely_scale(base, xfact=1.0 / cos_lat, yfact=1.0, origin=pt)


def _extract_rings(geom) -> List[List[List[float]]]:
    rings = []
    if geom.is_empty:
        return rings
    if geom.geom_type == "Polygon":
        rings.append([[c[1], c[0]] for c in geom.exterior.coords])
    elif geom.geom_type in ("MultiPolygon", "GeometryCollection"):
        for g in geom.geoms:
            rings.extend(_extract_rings(g))
    return rings


# ── Road network (osmnx) ──────────────────────────────────────
_GRAPH_PATH = os.path.join(os.path.dirname(__file__), "lisbon_graph.graphml")
_G = None
_osmnx_cache: dict = {}


def load_road_network() -> None:
    global _G
    try:
        if os.path.exists(_GRAPH_PATH):
            print("Loading road network from cache...")
            _G = ox.load_graphml(_GRAPH_PATH)
        else:
            print("Downloading Lisbon road network (first run, ~90s)...")
            _G = ox.graph_from_place("Lisbon, Portugal", network_type="drive")
            _G = ox.add_edge_speeds(_G)
            _G = ox.add_edge_travel_times(_G)
            ox.save_graphml(_G, _GRAPH_PATH)
            print("Road network saved to lisbon_graph.graphml")

        sample = next(iter(_G.edges(data=True)), (None, None, {}))
        if "travel_time" not in sample[2]:
            _G = ox.add_edge_speeds(_G)
            _G = ox.add_edge_travel_times(_G)

        print(f"Road network ready: {len(_G.nodes)} nodes, {len(_G.edges)} edges")
    except Exception as e:
        print(f"Road network unavailable: {e} — falling back to approximate isochrones")
        _G = None


# ── ORS cache ─────────────────────────────────────────────────
_ors_cache: dict = {}


def _get_ors(locations: List[dict], minutes: float) -> Optional[List[List[List[float]]]]:
    # Never cache requests that include custom locations (string IDs) — always fetch fresh
    has_custom = any(isinstance(l["id"], str) for l in locations)
    if has_custom:
        return _batch_isochrones_ors(locations, minutes)
    key = (round(minutes, 2), tuple((l["lat"], l["lng"]) for l in locations))
    if key in _ors_cache:
        return _ors_cache[key]
    result = _batch_isochrones_ors(locations, minutes)
    if result is not None:
        _ors_cache[key] = result
    return result


# ── ORS batch isochrones ───────────────────────────────────────

def _batch_isochrones_ors(
    locations: List[dict], minutes: float
) -> Optional[List[List[List[float]]]]:
    if not ORS_API_KEY:
        return None

    def _call(batch: List[dict]) -> Optional[List]:
        try:
            resp = requests.post(
                ORS_URL,
                headers={"Authorization": ORS_API_KEY, "Content-Type": "application/json"},
                json={
                    "locations": [[loc["lng"], loc["lat"]] for loc in batch],
                    "range": [int(minutes * 60)],
                    "range_type": "time",
                    "smoothing": 2,
                },
                timeout=15,
            )
            resp.raise_for_status()
            return [
                [[y, x] for x, y in feat["geometry"]["coordinates"][0]]
                for feat in resp.json()["features"]
            ]
        except Exception as e:
            print(f"ORS error: {e}")
            return None

    results = []
    for i in range(0, len(locations), 5):
        polygons = _call(locations[i: i + 5])
        if polygons is None:
            return None
        results.extend(polygons)
    return results


def _approx_isochrone(lat: float, lng: float, minutes: float, seed: int = 0) -> List[List[float]]:
    import random
    rng = random.Random(seed * 137 + int(minutes * 31))
    r_km = (minutes / 60.0) * 25.0
    lat_deg = 1.0 / 111.0
    lng_deg = 1.0 / (111.0 * math.cos(math.radians(lat)))
    n = 52
    arterials = [0, 30, 60, 90, 135, 180, 225, 270, 315, 340]
    pts = []
    for i in range(n):
        a_deg = 360.0 * i / n
        a_rad = math.radians(a_deg)
        base = rng.uniform(0.68, 1.02)
        boost = 1.0
        for az in arterials:
            diff = min(abs(a_deg - az), 360 - abs(a_deg - az))
            if diff < 22:
                boost = max(boost, 1.0 + 0.38 * (1.0 - diff / 22.0))
        noise = (
            0.12 * math.sin(3 * a_rad + rng.uniform(0, 6.28))
            + 0.07 * math.cos(5 * a_rad + rng.uniform(0, 6.28))
            + 0.04 * math.sin(9 * a_rad + rng.uniform(0, 6.28))
        )
        r = r_km * base * boost * (1.0 + noise)
        r = max(r, r_km * 0.40)
        pts.append([lat + r * lat_deg * math.sin(a_rad),
                    lng + r * lng_deg * math.cos(a_rad)])
    pts.append(pts[0])
    return pts


def _osmnx_isochrone(lat: float, lng: float, minutes: float) -> List[List[float]]:
    if _G is None:
        return _approx_isochrone(lat, lng, minutes)
    try:
        center = ox.distance.nearest_nodes(_G, lng, lat)
        reachable = nx.single_source_dijkstra_path_length(
            _G, center, cutoff=minutes * 60, weight="travel_time"
        )
        node_geoms = [Point(_G.nodes[n]["x"], _G.nodes[n]["y"]) for n in reachable]
        if len(node_geoms) < 3:
            return _approx_isochrone(lat, lng, minutes)
        poly = unary_union([p.buffer(0.001) for p in node_geoms])
        if poly.geom_type == "MultiPolygon":
            poly = max(poly.geoms, key=lambda p: p.area)
        if poly.is_empty or poly.geom_type != "Polygon":
            return _approx_isochrone(lat, lng, minutes)
        return [[c[1], c[0]] for c in poly.exterior.coords]
    except Exception as e:
        print(f"osmnx isochrone error ({lat:.4f}, {lng:.4f}): {e}")
        return _approx_isochrone(lat, lng, minutes)


def _get_osmnx_isochrone(loc: dict, minutes: float) -> List[List[float]]:
    is_custom = isinstance(loc["id"], str)
    if not is_custom:
        key = (round(loc["lat"], 5), round(loc["lng"], 5), round(minutes, 2))
        if key in _osmnx_cache:
            return _osmnx_cache[key]
        result = _osmnx_isochrone(loc["lat"], loc["lng"], minutes)
        _osmnx_cache[key] = result
        return result
    return _osmnx_isochrone(loc["lat"], loc["lng"], minutes)


# ── Pydantic models ────────────────────────────────────────────

class ExtraLocation(BaseModel):
    id: str
    lat: float
    lng: float


class IsochroneRequest(BaseModel):
    minutes: float = 5.0
    extra_locations: List[ExtraLocation] = []


# ── Startup ────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_boundary()
    load_mcdonalds()
    load_airport()
    load_road_network()
    if ORS_API_KEY:
        print("ORS API key active - will attempt ORS isochrones first")
    yield


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="UrbanReach API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────

@app.get("/api/mcdonalds")
@limiter.limit("60/minute")
def get_mcdonalds(request: Request):
    return {"locations": MCDONALDS, "boundary": _boundary_coords}


@app.get("/api/airport")
@limiter.limit("60/minute")
def get_airport(request: Request):
    return {"coordinates": _airport_coords}


@app.post("/api/isochrones")
@limiter.limit("10/minute")
def post_isochrones(request: Request, req: IsochroneRequest):
    minutes = req.minutes

    # Merge McDonald's with any user-supplied custom locations
    custom_locs = [
        {
            "id": loc.id,
            "name": f"Custom Location {i + 1}",
            "lat": loc.lat,
            "lng": loc.lng,
            "address": "",
        }
        for i, loc in enumerate(req.extra_locations)
    ]
    all_locations = MCDONALDS + custom_locs

    ors_polys = _get_ors(all_locations, minutes)

    isochrones = []
    for i, loc in enumerate(all_locations):
        if ors_polys:
            poly = ors_polys[i]
        elif _G is not None:
            poly = _get_osmnx_isochrone(loc, minutes)
        else:
            seed = loc["id"] if isinstance(loc["id"], int) else (300 + i)
            poly = _approx_isochrone(loc["lat"], loc["lng"], minutes, seed=seed)
        isochrones.append({
            "id": loc["id"],
            "name": loc["name"],
            "center": {"lat": loc["lat"], "lng": loc["lng"]},
            "polygon": poly,
        })

    merged_polygons: List[List[List[float]]] = []
    covered_shape = None
    try:
        shapely_polys = [
            ShapelyPolygon([(p[1], p[0]) for p in iso["polygon"]]) for iso in isochrones
        ]
        covered_shape = unary_union(shapely_polys).buffer(0)
        merged_polygons = _extract_rings(covered_shape)
    except Exception as e:
        print(f"Union failed: {e}")

    # Grid coverage via point-in-polygon
    if covered_shape is not None:
        covered_mask = np.array([
            covered_shape.contains(Point(pt[1], pt[0])) for pt in _grid_pts
        ])
    else:
        r = _eff_radius(minutes)
        loc_pts = np.array([[loc["lat"], loc["lng"]] for loc in all_locations])
        covered_mask = _dist_matrix(_grid_pts, loc_pts).min(axis=1) <= r

    n = len(_grid_pts)
    covered = int(covered_mask.sum())

    print(f"Isochrones: {len(all_locations)} locations ({len(custom_locs)} custom) | "
          f"Green rings: {len(merged_polygons)} | Coverage: {round(covered / n * 100, 1) if n else 0}%")

    return {
        "isochrones": isochrones,
        "merged_polygons": merged_polygons,
        "minutes": minutes,
        "coverage": {
            "total": n,
            "covered": covered,
            "pct": round(covered / n * 100, 1) if n else 0,
        },
        "engine": "ors" if ors_polys else ("osmnx" if _G is not None else "approx"),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
