"""Sample original zoom-14 Terrarium hill tiles, without height exaggeration.

Higher zoom preserves small karst peaks lost in the broad zoom-12 grid. This
does not improve the ~30m source survey accuracy or replace a bare-earth DTM.
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
ZOOM = 14
STEP = 10
geo = json.loads((ROOT / "src/components/liuzhou/skyline-map.json").read_text(encoding="utf-8"))


def mercator(x, z):
    lon, lat = 109.41225 + x / 101458, 24.31415 - z / 111320
    n = 2 ** ZOOM * 256
    return ((lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


patches = []
keys = set()
for hill in geo["hills"]:
    radius = 420 if hill["name"] in ["马鞍山", "鹅山"] else 280
    min_x, min_z = math.floor((hill["x"] - radius) / STEP) * STEP, math.floor((hill["z"] - radius) / STEP) * STEP
    cols = rows = radius * 2 // STEP + 1
    patches.append({"name": hill["name"], "minX": min_x, "minZ": min_z, "cols": cols, "rows": rows, "sampleStepMeters": STEP})
    corners = [mercator(x, z) for x in [min_x - STEP, min_x + cols * STEP] for z in [min_z - STEP, min_z + rows * STEP]]
    for x in range(math.floor(min(p[0] for p in corners) / 256), math.floor(max(p[0] for p in corners) / 256) + 1):
        for y in range(math.floor(min(p[1] for p in corners) / 256), math.floor(max(p[1] for p in corners) / 256) + 1):
            keys.add((x, y))


def fetch(key):
    x, y = key
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png"
    target = CACHE / f"{ZOOM}-{x}-{y}.png"
    if not target.exists():
        with urlopen(url, timeout=45) as response:
            target.write_bytes(response.read())
    with Image.open(target) as im:
        values = [r * 256 + g + b / 256 - 32768 for r, g, b in im.convert("RGB").getdata()]
    return key, values, {"url": url, "sha256": sha256(target.read_bytes()).hexdigest()}


with ThreadPoolExecutor(max_workers=3) as pool:
    fetched = list(pool.map(fetch, sorted(keys)))
tiles = {key: values for key, values, _ in fetched}


def pixel(x, y):
    return tiles[(x // 256, y // 256)][(y % 256) * 256 + x % 256]


def sample(x, z):
    u, v = mercator(x, z)
    u -= 0.5
    v -= 0.5
    a, b = math.floor(u), math.floor(v)
    fx, fz = u - a, v - b
    return round((pixel(a, b) * (1 - fx) + pixel(a + 1, b) * fx) * (1 - fz) + (pixel(a, b + 1) * (1 - fx) + pixel(a + 1, b + 1) * fx) * fz, 1)


for patch in patches:
    patch["heights"] = [sample(patch["minX"] + col * STEP, patch["minZ"] + row * STEP) for row in range(patch["rows"]) for col in range(patch["cols"])]
output = {"attribution": "Mapzen / AWS Terrain Tiles; NASA SRTM", "zoom": ZOOM, "fetched": "2026-10-24", "sourceResolutionMeters": 30, "tiles": [meta for _, _, meta in fetched], "patches": patches}
for target in [ROOT / "src/components/liuzhou/terrain-hills.json", ROOT / "public/games/liuzhou/terrain-hills.json"]:
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")
print(json.dumps({"tiles": len(tiles), "hillMaxima": {p["name"]: max(p["heights"]) for p in patches}}, ensure_ascii=False))
