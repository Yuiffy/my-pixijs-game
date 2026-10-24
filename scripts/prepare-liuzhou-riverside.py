"""Restore complete archived riverside park relations without inventing rings.

Boundary vertices and mapped footways are source data. Grass/tree placements
are estimated landscape; terrain heights and source building footprints stay
unchanged. Requires Shapely 2.1; operates entirely offline.
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
archive = ROOT / 'data/liuzhou/open/osm/skyline-core.osm.gz'
raw = gzip.decompress(archive.read_bytes())
osm = ET.fromstring(raw)
nodes = {n.attrib['id']: n for n in osm.findall('node')}
ways = {w.attrib['id']: w for w in osm.findall('way')}
relations = {r.attrib['id']: r for r in osm.findall('relation')}
city = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
core = json.loads((ROOT / 'src/components/liuzhou/map.json').read_text(encoding='utf8'))
water = json.loads((ROOT / 'src/components/liuzhou/skyline-map.json').read_text(encoding='utf8'))['riverPolygons']
river = unary_union([Polygon(p['outer'], p.get('holes', [])) for p in water])


def point(ref):
    n = nodes[ref]
    return [round((float(n.attrib['lon']) - 109.41225) * 101458, 3),
            round((24.31415 - float(n.attrib['lat'])) * 111320, 3)]


def stitch(members):
    pending = [(m.attrib['ref'], [n.attrib['ref'] for n in ways[m.attrib['ref']].findall('nd')]) for m in members]
    rings = []
    while pending:
        identifier, refs = pending.pop(0)
        ids = [identifier]
        while refs[-1] != refs[0]:
            matches = [(i, wid, chain if chain[0] == refs[-1] else chain[::-1])
                       for i, (wid, chain) in enumerate(pending) if refs[-1] in (chain[0], chain[-1])]
            assert len(matches) == 1, 'Incomplete or branching relation: do not close by approximation'
            index, wid, chain = matches[0]
            pending.pop(index)
            refs.extend(chain[1:]); ids.append(wid)
        assert all(ref in nodes for ref in refs)
        rings.append({'points': [point(ref) for ref in refs], 'nodeIds': refs, 'wayIds': ids})
    return rings


def polygons(shape):
    if shape.is_empty:
        return []
    if shape.geom_type == 'Polygon':
        return [shape]
    return [p for g in shape.geoms for p in polygons(g)]


parks = []
for identifier in ['21015546', '21015274']:
    relation = relations[identifier]
    members = relation.findall('member')
    assert all(m.attrib['type'] == 'way' and m.attrib['role'] in ['outer', 'inner'] for m in members)
    outers = stitch([m for m in members if m.attrib['role'] == 'outer'])
    inners = stitch([m for m in members if m.attrib['role'] == 'inner'])
    parts = []
    for outer in outers:
        holes = [ring for ring in inners if Polygon(outer['points']).covers(Polygon(ring['points']))]
        polygon = Polygon(outer['points'], [h['points'] for h in holes])
        assert polygon.is_valid
        parts.append({**outer, 'holes': [h['points'] for h in holes]})
    assert sum(len(p['holes']) for p in parts) == len(inners)
    tags = {t.attrib['k']: t.attrib['v'] for t in relation.findall('tag')}
    parks.append({'id': identifier, 'name': tags['name'], 'tags': tags, 'parts': parts,
                  'members': [m.attrib for m in members],
                  'area': sum(Polygon(p['points'], p['holes']).area for p in parts)})

# Clear actual game road widths as well as source roads. Bridge trees must
# avoid the full canopy corridor even where there is usable ground underneath.
road_buffers, canopy_buffers = [], []
for road in city['roads']:
    kind = road['tags']['highway']
    width = 16 if kind in ['primary', 'trunk'] else 15 if kind == 'secondary' else 12 if kind == 'tertiary' else 6 if kind in ['residential', 'service', 'unclassified', 'cycleway'] else 5
    line = LineString(road['points'])
    canopy_buffers.append(line.buffer(width / 2 + 5, cap_style=2, join_style=2))
    if road['tags'].get('bridge') != 'yes':
        road_buffers.append(line.buffer(width / 2 + .6, cap_style=2, join_style=2))
for road in core['features']:
    if not road.get('highway'):
        continue
    line = LineString(road['points'])
    width = 15 if road['highway'] == 'secondary' else 12 if road['highway'] == 'tertiary' else 5
    canopy_buffers.append(line.buffer(width / 2 + 6, cap_style=2, join_style=2))
    if road.get('bridge') != 'yes':
        road_buffers.append(line.buffer(width / 2 + .6, cap_style=2, join_style=2))
for step in city['steps']:
    line = LineString(step['points'])
    road_buffers.append(line.buffer(3.5, cap_style=2, join_style=2))
    canopy_buffers.append(line.buffer(7, cap_style=2, join_style=2))
roads = unary_union(road_buffers)
canopies = unary_union(canopy_buffers)
source_buildings = unary_union([Polygon(b['points']) for b in city['buildings']])
overture = json.loads((ROOT / 'src/components/liuzhou/building-footprints.json').read_text(encoding='utf8'))
all_buildings = source_buildings.union(unary_union([Polygon(b['points']) for b in overture['features']]))
surfaces, trees, paths = [], [], []
for park in parks:
    shape = unary_union([Polygon(p['points'], p['holes']) for p in park['parts']])
    dry = shape.difference(river.buffer(.3)).difference(roads).difference(all_buildings.buffer(.8))
    park['dryLandscapeArea'] = dry.area
    for x in range(math.floor(shape.bounds[0] / 20) * 20, math.ceil(shape.bounds[2]), 20):
        for z in range(math.floor(shape.bounds[1] / 20) * 20, math.ceil(shape.bounds[3]), 20):
            for face in constrained_delaunay_triangles(dry.intersection(box(x, z, x + 20, z + 20))).geoms:
                if face.area > 1e-6:
                    surfaces.append({'parkId': park['id'], 'points': [[round(a, 8), round(b, 8)] for a, b in list(face.exterior.coords)[:-1]]})
    planting = dry.buffer(-4).difference(canopies).difference(all_buildings.buffer(5))
    for x in range(math.floor(shape.bounds[0] / 22) * 22, math.ceil(shape.bounds[2]), 22):
        for z in range(math.floor(shape.bounds[1] / 23) * 23, math.ceil(shape.bounds[3]), 23):
            p = [round(x + math.sin(z * .17) * 3.1, 3), round(z + math.sin(x * .13) * 2.7, 3)]
            if planting.contains(Point(p)):
                trees.append({'parkId': park['id'], 'at': p, 'geometryStatus': 'estimated planting'})
    for road in city['roads'] + city['steps']:
        if road['tags']['highway'] not in ['footway', 'pedestrian', 'path', 'steps', 'cycleway']:
            continue
        line = LineString(road['points'])
        if line.intersection(shape).length > 8:
            paths.append({'parkId': park['id'], 'sourceId': road['id'], 'points': road['points'], 'tags': road['tags']})

output = {'source': str(archive.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
          'citySha256': hashlib.sha256((ROOT / 'src/components/liuzhou/city-map.json').read_bytes()).hexdigest(),
          'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0',
          'geometryStatus': 'Source park rings and path axes; estimated landscape, unchanged terrain heights.',
          'parks': parks, 'surfaces': surfaces, 'trees': trees, 'paths': paths}
for target in ['src/components/liuzhou/riverside-layout.json', 'public/games/liuzhou/riverside-layout.json']:
    (ROOT / target).write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print(json.dumps({'parks': len(parks), 'sourceArea': sum(p['area'] for p in parks), 'surfaces': len(surfaces), 'trees': len(trees), 'paths': len(paths)}))
