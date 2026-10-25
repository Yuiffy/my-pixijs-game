"""Author estimated rest bays/railings beside an archived riverbank footway.

The source centreline is retained byte-for-byte. Furniture and rail setbacks
are deliberately authored estimates; no surveyed quay, staircase or current
merchant information is inferred from the source. Operates entirely offline.
"""
import hashlib
import json
import math
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'src/components/liuzhou/riverside-layout.json'
source = json.loads(source_path.read_text(encoding='utf8'))
city_path = ROOT / 'src/components/liuzhou/city-map.json'
city = json.loads(city_path.read_text(encoding='utf8'))
water = json.loads((ROOT / 'src/components/liuzhou/skyline-map.json').read_text(encoding='utf8'))['riverPolygons']
river = unary_union([Polygon(p['outer'], p.get('holes', [])) for p in water])
park = next(p for p in source['parks'] if p['id'] == '21015274')
park_shape = unary_union([Polygon(p['points'], p['holes']) for p in park['parts']])
path = next(p for p in source['paths'] if p['sourceId'] == '1524324802')
axis = LineString(path['points'])
source_buildings = unary_union([Polygon(p['points']) for p in city['buildings']])
overture = json.loads((ROOT / 'src/components/liuzhou/building-footprints.json').read_text(encoding='utf8'))
buildings = source_buildings.union(unary_union([Polygon(p['points']) for p in overture['features']]))

crossings = []
for road in city['roads'] + city['steps']:
    if road['id'] == path['sourceId']:
        continue
    kind = road['tags']['highway']
    half = 8 if kind in ['primary', 'trunk'] else 7.5 if kind == 'secondary' else 6 if kind == 'tertiary' else 3 if kind in ['residential', 'service', 'unclassified', 'cycleway', 'steps'] else 2.5
    crossings.append(LineString(road['points']).buffer(half + .8, cap_style=2, join_style=2))
crossings = unary_union(crossings)


def rounded(p):
    return [round(float(p[0]), 5), round(float(p[1]), 5)]


def frame(distance):
    p = axis.interpolate(distance)
    a = axis.interpolate(max(0, distance - .05))
    b = axis.interpolate(min(axis.length, distance + .05))
    dx, dz = b.x - a.x, b.y - a.y
    length = math.hypot(dx, dz)
    tangent = [dx / length, dz / length]
    normal = [-tangent[1], tangent[0]]
    sides = [Point(p.x + normal[0] * side * 4, p.y + normal[1] * side * 4) for side in [-1, 1]]
    side = -1 if sides[0].distance(river) < sides[1].distance(river) else 1
    return [p.x, p.y], tangent, [normal[0] * side, normal[1] * side]


rails = []
for distance in range(284, 1160, 4):
    p, tangent, outward = frame(distance)
    a = [p[i] + outward[i] * 3.2 - tangent[i] * 1.97 for i in [0, 1]]
    b = [p[i] + outward[i] * 3.2 + tangent[i] * 1.97 for i in [0, 1]]
    footprint = LineString([a, b]).buffer(.22, cap_style=2)
    if not park_shape.buffer(-.2).covers(footprint) or footprint.intersects(river.buffer(.25)) or footprint.intersects(crossings) or footprint.intersects(buildings.buffer(2)):
        continue
    rails.append({'id': f'liudi-estimated-rail-{distance}', 'a': rounded(a), 'b': rounded(b), 'chainage': distance,
                  'geometryStatus': 'estimated railing; 3.2m source-footway setback, not surveyed quay edge'})

rest_bays = []
for target in range(330, 1140, 105):
    for offset in [0, 12, -12, 24, -24]:
        distance = target + offset
        p, tangent, outward = frame(distance)
        center = [p[i] - outward[i] * 5.7 for i in [0, 1]]
        corners = [[center[i] + tangent[i] * x + outward[i] * z for i in [0, 1]] for x, z in [[-3.4, -2.2], [3.4, -2.2], [3.4, 2.2], [-3.4, 2.2]]]
        bay = Polygon(corners)
        connector = LineString([p, center]).buffer(1.4, cap_style=2)
        full = bay.union(connector)
        if not park_shape.buffer(-.6).covers(full) or full.intersects(river.buffer(2)) or full.intersects(crossings) or full.intersects(buildings.buffer(3)):
            continue
        if any(Point(t['at']).distance(bay) < 4.5 for t in source['trees']):
            continue
        bench = [p[i] - outward[i] * 6.65 for i in [0, 1]]
        rest_bays.append({'id': f'liudi-estimated-rest-{target}', 'chainage': distance,
                          'at': rounded(center), 'bench': rounded(bench), 'tangent': rounded(tangent), 'riverDirection': rounded(outward),
                          'points': [rounded(c) for c in list(full.exterior.coords)[:-1]],
                          'route': [rounded(p), rounded(center)],
                          'geometryStatus': 'estimated rest bay, furniture and short approach; not a mapped real facility'})
        break

output = {'source': 'riverside-layout.json', 'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
          'citySha256': hashlib.sha256(city_path.read_bytes()).hexdigest(),
          'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0',
          'sourcePath': path, 'sourcePark': park['id'],
          'geometryStatus': 'Archived footway axis; estimated river-facing railings and landward rest bays, unchanged terrain.',
          'heightStatus': 'Runtime uses actual terrain triangle height, skipping submerged or steep railing sections; no as-built levels available.',
          'rails': rails, 'restBays': rest_bays}
for target in ['src/components/liuzhou/riverside-detail-layout.json', 'public/games/liuzhou/riverside-detail-layout.json']:
    (ROOT / target).write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print(json.dumps({'sourceAxisLength': axis.length, 'candidateRails': len(rails), 'restBays': len(rest_bays), 'restArea': sum(Polygon(b['points']).area for b in rest_bays)}))
