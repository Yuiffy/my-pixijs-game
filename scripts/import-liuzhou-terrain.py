"""Rebuild Liuzhou terrain from public Mapzen/AWS Terrarium DEM tiles.

Requires Pillow. Run from any directory with Python 3. Cached original tiles
remain in tmp/liuzhou/terrain; generated grids include their URL and SHA-256.
No visual exaggeration, summit painting, or vertical rescaling is performed.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
from urllib.request import urlopen
import json
import math

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp/liuzhou/terrain"
CACHE.mkdir(parents=True, exist_ok=True)
ZOOM = 12
ORIGIN = (109.41225, 24.31415)
EXTENT = (-6600, -10000, 10000, 7600)
STEP = 40


def mercator(lon, lat):
    n = 2 ** ZOOM * 256
    return ((lon + 180) / 360 * n,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def coordinate(x, z):
    return ORIGIN[0] + x / 101458, ORIGIN[1] - z / 111320


corners = [mercator(*coordinate(x, z)) for x in EXTENT[::2] for z in EXTENT[1::2]]
tile_keys = [(x, y)
             for x in range(math.floor(min(p[0] for p in corners) / 256), math.floor(max(p[0] for p in corners) / 256) + 1)
             for y in range(math.floor(min(p[1] for p in corners) / 256), math.floor(max(p[1] for p in corners) / 256) + 1)]


def fetch(key):
    x, y = key
    name = f"{ZOOM}-{x}-{y}.png"
    target = CACHE / name
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png"
    if not target.exists():
        with urlopen(url, timeout=60) as response:
            target.write_bytes(response.read())
    with Image.open(target) as source:
        pixels = list(source.convert("RGB").getdata())
    heights = [r * 256 + g + b / 256 - 32768 for r, g, b in pixels]
    return key, heights, {"url": url, "sha256": sha256(target.read_bytes()).hexdigest()}


with ThreadPoolExecutor(max_workers=3) as pool:
    fetched = list(pool.map(fetch, tile_keys))
tiles = {key: heights for key, heights, _ in fetched}


def pixel(x, y):
    return tiles[(x // 256, y // 256)][(y % 256) * 256 + x % 256]


def sample(x, z):
    # Coordinates refer to pixel centers, not the upper-left pixel corner.
    u, v = mercator(*coordinate(x, z))
    u -= 0.5
    v -= 0.5
    a, b = math.floor(u), math.floor(v)
    fx, fz = u - a, v - b
    return round((pixel(a, b) * (1 - fx) + pixel(a + 1, b) * fx) * (1 - fz)
                 + (pixel(a, b + 1) * (1 - fx) + pixel(a + 1, b + 1) * fx) * fz, 1)


min_x, min_z, max_x, max_z = EXTENT
cols = int((max_x - min_x) / STEP) + 1
rows = int((max_z - min_z) / STEP) + 1
heights = [sample(min_x + col * STEP, min_z + row * STEP)
           for row in range(rows) for col in range(cols)]
output = {
    "attribution": "Mapzen / AWS Terrain Tiles; source elevation data includes NASA SRTM",
    "source": "https://registry.opendata.aws/terrain-tiles/",
    "license": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
    "fetched": "2026-10-24", "origin": list(ORIGIN), "zoom": ZOOM,
    "encoding": "Absolute elevation in metres, rounded to 0.1 m; no vertical exaggeration",
    "sourceResolutionMeters": 30, "sampleStepMeters": STEP,
    "minX": min_x, "minZ": min_z, "cols": cols, "rows": rows,
    "tiles": [metadata for _, _, metadata in fetched], "heights": heights,
}
for target in [ROOT / "src/components/liuzhou/terrain-dem.json", ROOT / "public/games/liuzhou/terrain-dem.json"]:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(json.dumps({"tiles": len(fetched), "samples": len(heights), "range": [min(heights), max(heights)],
                  "originElevation": sample(0, 0)}, ensure_ascii=False))
