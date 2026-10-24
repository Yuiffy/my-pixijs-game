"""Clip terrain cells against the already-downloaded OSM water polygons.

Only planimetry is refined. Heights still come from the existing DEM / ground
estimate, not from the 1:250,000 Tianditu file (which has no elevation values).
Requires Shapely; does not fetch data or execute anything from the input files.
"""
from pathlib import Path
from hashlib import sha256
import json
import math
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src/components/liuzhou/skyline-map.json'
geo = json.loads(SOURCE.read_text(encoding='utf-8'))
dem = json.loads((ROOT / 'src/components/liuzhou/terrain-dem.json').read_text(encoding='utf-8'))
water = unary_union([Polygon(p['outer'], p['holes']) for p in geo['riverPolygons']])
assert water.is_valid
boundary = water.boundary
prepared = prep(boundary)


def polygons(g):
    if g.geom_type == 'Polygon':
        return [g]
    return [p for part in getattr(g, 'geoms', []) for p in polygons(part)]


def rings(g):
    return [[[list(p) for p in poly.exterior.coords[:-1]],
             *[[list(p) for p in ring.coords[:-1]] for ring in poly.interiors]]
            for poly in polygons(g) if poly.area > 1e-7]


def lines(g):
    if g.geom_type == 'LineString':
        return [list(g.coords)]
    return [p for part in getattr(g, 'geoms', []) for p in lines(part)]


keys = set()
patches = json.loads((ROOT / 'src/components/liuzhou/terrain-hills.json').read_text(encoding='utf-8'))['patches']
min_x, min_z = dem['minX'], dem['minZ']
max_x = min_x + (dem['cols'] - 1) * dem['sampleStepMeters']
max_z = min_z + (dem['rows'] - 1) * dem['sampleStepMeters']
for z in range(min_z, max_z, 800):
    for x in range(min_x, max_x, 800):
        near = math.hypot(max(0, abs(x + 400) - 400), max(0, abs(z + 400) - 400))
        hills = any(x < p['minX'] + (p['cols'] - 1) * p['sampleStepMeters'] and x + 800 > p['minX']
                    and z < p['minZ'] + (p['rows'] - 1) * p['sampleStepMeters'] and z + 800 > p['minZ']
                    for p in patches)
        physical = x < 700 and x + 800 > -660 and z < 1200 and z + 800 > -560
        step = 10 if physical or hills else 20 if near < 2100 else 40 if near < 4300 else 80 if near < 7200 else 160
        for cz in range(z, min(z + 800, max_z), step):
            for cx in range(x, min(x + 800, max_x), step):
                cell = box(cx, cz, min(cx + step, max_x), min(cz + step, max_z))
                if prepared.intersects(cell):
                    keys.add((step, cx, cz, min(cx + step, max_x), min(cz + step, max_z)))

cells = {}
area_error = 0.
for step, x, z, right, bottom in sorted(keys):
    cell = box(x, z, right, bottom)
    land, wet = cell.difference(water), cell.intersection(water)
    error = abs(cell.area - land.area - wet.area)
    area_error = max(area_error, error)
    assert error < 1e-4, (x, z, error)
    cells[f'{step}:{x}:{z}'] = {'land': rings(land), 'water': rings(wet), 'banks': lines(boundary.intersection(cell))}

output = {'description': 'OSM shoreline-conforming terrain cell cuts; no new measured elevations',
          'source': 'skyline-map.json', 'sourceSha256': sha256(SOURCE.read_bytes()).hexdigest(),
          'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0',
          'maxAreaErrorSquareMeters': area_error, 'cells': cells}
for target in [ROOT / 'src/components/liuzhou/terrain-shoreline.json', ROOT / 'public/games/liuzhou/terrain-shoreline.json']:
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'boundaryCells': len(cells), 'maxAreaErrorSquareMeters': area_error,
                  'bytes': target.stat().st_size}))
