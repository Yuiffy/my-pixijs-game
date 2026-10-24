"""Build underground surfaces from archived OSM topology, entirely offline.

Only horizontal axes/entrances are source geometry. Widths, shop bays, vertical
profile and all decoration are explicit game reconstruction, not survey data.
"""
from pathlib import Path
import hashlib
import json
import math
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'src/components/liuzhou/city-map.json'
source = json.loads(source_path.read_text(encoding='utf-8'))
walks = [w for w in source['underground'] if w['name'] in ['龙城地下街', '人防地下街'] and w['tags']['highway'] == 'pedestrian']
walk_points = [Point(p) for w in walks for p in w['points']]
stairs = [w for w in source['steps'] + source['underground'] if 1275168873 <= int(w['id']) <= 1275168893 and w['tags']['highway'] == 'steps']
entrances = []
for way in stairs:
    points = way['points'][:]
    # Stored directions vary. The endpoint touching a mapped tunnel is below.
    if min(Point(points[0]).distance(q) for q in walk_points) < min(Point(points[-1]).distance(q) for q in walk_points):
        points.reverse()
    entrances.append({'id': way['id'], 'points': points, 'width': 3.2, 'top': points[0], 'bottom': points[-1], 'sourceTags': way['tags']})

walk_shapes = [LineString(w['points']).buffer(5 if w['id'] in ['1275168868', '1275168884'] else 3.2, cap_style=2, join_style=2) for w in walks]
shops = []
for way in walks:
    if way['id'] not in ['1275168868', '1275168884']:
        continue
    line = LineString(way['points'])
    for at in range(16, int(line.length) - 12, 18):
        a = line.interpolate(at - 3.5)
        b = line.interpolate(at + 3.5)
        dx, dz = b.x - a.x, b.y - a.y
        length = math.hypot(dx, dz)
        nx, nz = dz / length, -dx / length
        for side in [-1, 1]:
            ring = [[a.x + nx * side * 4.7, a.y + nz * side * 4.7], [b.x + nx * side * 4.7, b.y + nz * side * 4.7], [b.x + nx * side * 8, b.y + nz * side * 8], [a.x + nx * side * 8, a.y + nz * side * 8]]
            shape = Polygon(ring)
            # Do not put retail bays in front of mapped entry branches.
            if any(shape.distance(LineString(e['points'])) < 4 for e in entrances):
                continue
            walk_shapes.append(shape)
            shops.append({'x': (a.x + b.x) / 2 + nx * side * 7.8, 'z': (a.y + b.y) / 2 + nz * side * 7.8, 'angle': math.atan2(dx, dz), 'side': side, 'sourceWay': way['id']})

opening_shapes = [LineString(e['points']).buffer(e['width'] / 2 + 0.22, cap_style=2, join_style=2) for e in entrances]
openings = unary_union(opening_shapes)
floor = unary_union(walk_shapes + [s.buffer(0.08, join_style=2) for s in opening_shapes])
roof = unary_union(walk_shapes).difference(openings.buffer(0.05, join_style=2))

def rings(shape):
    polygons = [shape] if shape.geom_type == 'Polygon' else [p for p in shape.geoms if p.geom_type == 'Polygon']
    return [[[list(p) for p in polygon.exterior.coords][:-1]] + [[list(p) for p in hole.coords][:-1] for hole in polygon.interiors] for polygon in polygons if polygon.area > 1e-7]

def profile_patches(shape):
    # Split at the runtime grade breaklines. Only the exterior union supplies
    # walls; these internal patches must not become barriers at retail bays.
    output = []
    for x in range(-820, -300, 20):
        for lo, hi in [(-620, -531.085), (-531.085, -37.838), (-37.838, 20)]:
            patch = shape.intersection(box(x, lo, x + 20, hi))
            if not patch.is_empty and patch.area > 1e-7:
                output.extend(rings(patch))
    return output

terrain_cuts = {}
dem = json.loads((ROOT / 'src/components/liuzhou/terrain-dem.json').read_text())
x0, z0, x1, z1 = openings.bounds
for step in [10, 20, 40]:
    start_x = dem['minX'] + math.floor((x0 - dem['minX']) / step) * step
    start_z = dem['minZ'] + math.floor((z0 - dem['minZ']) / step) * step
    for x in range(int(start_x), math.ceil(x1), step):
        for z in range(int(start_z), math.ceil(z1), step):
            cell = box(x, z, x + step, z + step)
            if cell.intersection(openings).area > 1e-7:
                terrain_cuts[f'{step}:{x}:{z}'] = rings(cell.difference(openings))

output = {'version': 1, 'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
          'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0',
          'status': 'Source horizontal topology; estimated widths, depth, shop bays and stair risers.',
          'walks': walks, 'entrances': entrances, 'shops': shops, 'floor': rings(floor), 'roof': rings(roof),
          'floorPatches': profile_patches(floor), 'roofPatches': profile_patches(roof),
          'openings': rings(openings), 'terrainCuts': terrain_cuts}
for path in [ROOT / 'src/components/liuzhou/underground-layout.json', ROOT / 'public/games/liuzhou/underground-layout.json']:
    path.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'walks': len(walks), 'entrances': len(entrances), 'shops': len(shops), 'terrainCells': len(terrain_cuts)}))
