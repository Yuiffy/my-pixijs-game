"""Conservative ground estimate for the built-up playable district.

SRTM is a radar surface model, so rooftops must not become road hills. Preserve
the raw DEM separately; this is explicitly an approximate ground reconstruction,
not a measured DTM. Requires import-liuzhou-terrain.py and skyline importer.
"""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
dem = json.loads((ROOT / "src/components/liuzhou/terrain-dem.json").read_text(encoding="utf-8"))
geo = json.loads((ROOT / "src/components/liuzhou/skyline-map.json").read_text(encoding="utf-8"))


def inside(x, z, points):
    found = False
    for i, a in enumerate(points):
        b = points[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
            found = not found
    return found


def water(x, z):
    return any(inside(x, z, p["outer"]) and not any(inside(x, z, h) for h in p["holes"]) for p in geo["riverPolygons"])


def raw(x, z):
    ix = round((x - dem["minX"]) / dem["sampleStepMeters"])
    iz = round((z - dem["minZ"]) / dem["sampleStepMeters"])
    return dem["heights"][iz * dem["cols"] + ix]


STEP = 40
MIN_X, MIN_Z, MAX_X, MAX_Z = -800, -680, 920, 1040
COLS = (MAX_X - MIN_X) // STEP + 1
ROWS = (MAX_Z - MIN_Z) // STEP + 1
margin = 5
samples = {}
for iz in range(-margin, ROWS + margin):
    for ix in range(-margin, COLS + margin):
        x, z = MIN_X + ix * STEP, MIN_Z + iz * STEP
        samples[(ix, iz)] = (raw(x, z), water(x, z))

ground = []
for iz in range(ROWS):
    for ix in range(COLS):
        source, is_water = samples[(ix, iz)]
        if is_water:
            ground.append(source)
            continue
        nearby = [samples[(ix + dx, iz + dz)][0]
                  for dz in range(-margin, margin + 1) for dx in range(-margin, margin + 1)
                  if dx * dx + dz * dz <= margin * margin
                  and not samples[(ix + dx, iz + dz)][1]
                  and samples[(ix + dx, iz + dz)][0] >= 82]
        nearby.sort()
        envelope = nearby[round((len(nearby) - 1) * .1)] if nearby else source
        # The old town's documented urban terrace is approximately 85–92 m.
        # Remove positive roof bias; do not lift lower riverside embankments.
        ground.append(min(source, max(85, min(92, envelope))))

smoothed = []
for iz in range(ROWS):
    for ix in range(COLS):
        if samples[(ix, iz)][1]:
            smoothed.append(ground[iz * COLS + ix])
            continue
        total, weight = 0., 0.
        for dz in range(-2, 3):
            for dx in range(-2, 3):
                xx, zz = min(COLS - 1, max(0, ix + dx)), min(ROWS - 1, max(0, iz + dz))
                if samples[(xx, zz)][1]:
                    continue
                w = math.exp(-(dx * dx + dz * dz) / 3)
                total += ground[zz * COLS + xx] * w
                weight += w
        smoothed.append(round(total / weight, 1))

output = {
    "description": "Approximate urban ground reconstruction, not a surveyed bare-earth DTM",
    "method": "200 m land-only 10th-percentile lower envelope; 85–92 m urban-terrace cap; Gaussian smoothing; preserve raw river elevations",
    "source": "terrain-dem.json; skyline-map.json; docs/liuzhou-skyline-sources.md",
    "minX": MIN_X, "minZ": MIN_Z, "cols": COLS, "rows": ROWS, "step": STEP,
    "featherMeters": 160, "heights": smoothed,
}
for target in [ROOT / "src/components/liuzhou/terrain-ground.json", ROOT / "public/games/liuzhou/terrain-ground.json"]:
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(json.dumps({"samples": len(smoothed), "landRange": [min(smoothed), max(smoothed)]}))
