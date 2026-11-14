"""Offline, version-aware extraction of the first Hedong district.

Keep source rings/roles separately from estimated paving and bridge axes.
Run after fetch-liuzhou-hedong.py --archive; never requests the network.
"""
import gzip
import hashlib
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = {'minX': 700, 'maxX': 1780, 'minZ': -1790, 'maxZ': -1000}
region = box(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ'])
objects = {kind: {} for kind in ['node', 'way', 'relation']}
archives = []
paths = sorted((ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz'), key=lambda p: (p.name.startswith('hedong-'), p.name))
for path in paths:
    raw = gzip.decompress(path.read_bytes())
    archives.append({'path': path.relative_to(ROOT).as_posix(), 'rawSha256': hashlib.sha256(raw).hexdigest()})
    for item in ET.fromstring(raw):
        if item.tag not in objects:
            continue
        previous = objects[item.tag].get(item.attrib['id'])
        if previous is None or int(item.get('version', 0)) >= int(previous.get('version', 0)):
            objects[item.tag][item.attrib['id']] = item


def tags(element):
    return {t.attrib['k']: t.attrib['v'] for t in element.findall('tag')}


def geometry(identifier):
    way = objects['way'][identifier]
    refs = [n.attrib['ref'] for n in way.findall('nd')]
    points = []
    for ref in refs:
        node = objects['node'][ref]
        points.append([round((float(node.attrib['lon']) - 109.41225) * 101458, 3),
                       round((24.31415 - float(node.attrib['lat'])) * 111320, 3)])
    return {'id': identifier, 'version': int(way.get('version', 0)), 'refs': refs,
            'points': points, 'tags': tags(way), 'name': tags(way).get('name', '')}


def faces(shape):
    return [[[round(x, 5), round(z, 5)] for x, z in list(t.exterior.coords)[:-1]]
            for t in constrained_delaunay_triangles(shape).geoms if t.area > 1e-8]


relation = objects['relation']['8038736']
members = [{'id': m.attrib['ref'], 'role': m.attrib['role']} for m in relation.findall('member')]
outer = geometry(next(m['id'] for m in members if m['role'] == 'outer'))
holes = [geometry(m['id']) for m in members if m['role'] == 'inner']
assert len(holes) == 10
square = Polygon(outer['points'], [h['points'] for h in holes])
assert square.is_valid
buildings, roads, areas = [], [], []
for identifier, way in objects['way'].items():
    t = tags(way)
    if not (t.get('building') or t.get('highway') or t.get('landuse') or t.get('leisure') or t.get('natural') == 'water'):
        continue
    try:
        data = geometry(identifier)
    except KeyError:
        continue
    points = data['points']
    if len(points) < 2:
        continue
    line = LineString(points)
    if not line.intersects(region):
        continue
    if t.get('highway') and t.get('highway') != 'platform' and t.get('area') != 'yes' and len(set(map(tuple, points))) > 1:
        foot = t['highway'] in ['footway', 'path', 'pedestrian', 'cycleway', 'steps']
        width = 4 if foot else 16 if t['highway'] in ['primary', 'trunk'] else 13 if t['highway'] == 'secondary' else 10 if t['highway'] == 'tertiary' else 6
        roads.append({**data, 'widthEstimated': width, 'foot': foot})
    if len(points) < 4 or points[0] != points[-1]:
        continue
    shape = Polygon(points)
    if not shape.is_valid:
        continue
    if t.get('building') and t['building'] not in ['no', 'roof'] and region.covers(shape):
        buildings.append({**data, 'heightStatus': 'source tags when present; otherwise estimated massing'})
    elif t.get('natural') == 'water' or t.get('leisure') or t.get('landuse'):
        areas.append(data)

roads.sort(key=lambda r: int(r['id']))
buildings.sort(key=lambda r: int(r['id']))
areas.sort(key=lambda r: int(r['id']))
vehicle_roads = [r for r in roads if not r['foot'] and r['tags'].get('bridge') != 'yes' and r['tags'].get('tunnel') != 'yes']
obstacles = unary_union([LineString(r['points']).buffer(r['widthEstimated'] / 2 + .55, join_style=2) for r in vehicle_roads]
                        + [Polygon(b['points']).buffer(.5) for b in buildings])
public = square.difference(obstacles)
surfaces = [{'points': f, 'color': '#c5bfae', 'kind': 'square'} for f in faces(public)]
# Source water footprints are retained. Until pool levels/depth are available,
# show a flush, inactive basin surface draped on existing terrain, never a
# sloping sheet of "standing water" or a pool at the river's elevation.
water = [a for a in areas if a['tags'].get('natural') == 'water']
water_union = unary_union([Polygon(w['points']) for w in water])
for w in water:
    shape = Polygon(w['points']).intersection(region).difference(obstacles)
    surfaces.extend({'points': f, 'color': '#667c78', 'kind': 'inactive-basin'} for f in faces(shape))
# Mapped parks/gardens keep their original boundaries. Paving and trees cannot
# replace the ten source inner rings, which include planting as well as basins.
for a in areas:
    if a['tags'].get('leisure') not in ['park', 'garden']:
        continue
    shape = Polygon(a['points']).intersection(region).difference(Polygon(outer['points'])).difference(water_union).difference(obstacles)
    surfaces.extend({'points': f, 'color': '#728b60', 'kind': 'garden'} for f in faces(shape))

# Reconstruct a single estimated deck axis between the two source lanes.
lane_ids = ['370559017', '1376744096', '1502734093']
source_lanes = [geometry(i) for i in lane_ids] + [geometry('772825346')]
south_points = source_lanes[0]['points'][:]
for lane in source_lanes[1:3]:
    assert south_points[-1] == lane['points'][0]
    south_points.extend(lane['points'][1:])
lanes = [LineString(south_points), LineString(list(reversed(source_lanes[3]['points'])))]
fractions = {i / 130 for i in range(131)}
for lane in lanes:
    run = 0
    for a, b in zip(lane.coords, list(lane.coords)[1:]):
        run += math.dist(a, b)
        fractions.add(run / lane.length)
axis = []
for t in sorted(fractions):
    p = [round(sum(l.interpolate(t, normalized=True).x for l in lanes) / 2, 5),
         round(sum(l.interpolate(t, normalized=True).y for l in lanes) / 2, 5)]
    if not axis or math.dist(axis[-1], p) > .0001:
        axis.append(p)
axis_line = LineString(axis)
crossings = []
# Audit the complete bridge, including its west approach outside the new box.
for identifier, way in objects['way'].items():
    t = tags(way)
    if not t.get('highway') or t.get('bridge') == 'yes' or t.get('tunnel') == 'yes':
        continue
    try:
        r = geometry(identifier)
        line = LineString(r['points'])
    except (KeyError, ValueError):
        continue
    hit = line.intersection(axis_line)
    if hit.is_empty or hit.geom_type != 'Point' or axis_line.project(hit) < 12 or axis_line.project(hit) > axis_line.length - 12:
        continue
    crossings.append({'roadId': identifier, 'name': r['name'], 'at': [round(hit.x, 5), round(hit.y, 5)],
                      'chainage': round(axis_line.project(hit), 6), 'source': r})

# Estimated furniture is accepted only on the source paved surface, with clear
# walking space. Source tree nodes are kept distinct from inferred landscaping.
trees, benches = [], []
# All ten inner rings match mapped basins. Keep them out of paved/planting
# furniture, including the four large L-shaped features.
for x in range(980, 1460, 20):
    for z in range(-1500, -1320, 20):
        if public.covers(Point(x, z).buffer(3)) and 7 < water_union.distance(Point(x, z)) < 13:
            trees.append([x, z])
        if public.covers(Point(x, z).buffer(2)) and 14 < water_union.distance(Point(x, z)) < 18:
            benches.append([x, z])
output = {'license': 'ODbL-1.0; OpenStreetMap contributors', 'archives': archives,
          'boundsEstimated': BOUNDS, 'roads': roads, 'buildings': buildings, 'areas': areas,
          'sourceSquare': {'relationId': '8038736', 'version': int(relation.get('version', 0)),
                           'members': members, 'outer': outer, 'holes': holes, 'area': round(square.area, 6)},
          'sourceWater': water, 'surfaces': surfaces, 'treesEstimated': trees, 'benchesEstimated': benches,
          'bridge': {'sourceLanes': source_lanes, 'axisEstimated': axis, 'length': round(axis_line.length, 6),
                     'widthEstimated': 29.5, 'sidewalkWidthEstimated': 2.8, 'crossings': crossings,
                     'mainChainageEstimated': [215, 880],
                     'status': 'Source lane geometry; estimated paired mean axis, width, profile, piers and finishes. No surveyed elevation.'},
          'detailStatus': 'Source plan geometry; all untagged heights, facade colors, landscaping, furniture and basin details estimated. Basins shown inactive without surveyed water levels.'}
encoded = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in ['src/components/liuzhou/hedong-layout.json', 'public/games/liuzhou/hedong-layout.json']:
    (ROOT / target).write_text(encoded, encoding='utf8')
print(json.dumps({'buildings': len(buildings), 'roads': len(roads), 'areas': len(areas), 'surfaces': len(surfaces),
                  'squareArea': square.area, 'crossings': [{k: v for k, v in c.items() if k != 'source'} for c in crossings]}, ensure_ascii=False, indent=2))
