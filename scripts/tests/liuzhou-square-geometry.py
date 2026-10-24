"""Independently compare square output to the archived OSM multipolygon."""
import gzip
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
layout = json.loads((ROOT / 'src/components/liuzhou/square-layout.json').read_text(encoding='utf8'))
city = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
raw = gzip.decompress((ROOT / layout['sourceSquare']['archive']).read_bytes())
osm = ET.fromstring(raw)
nodes = {n.attrib['id']: n for n in osm.findall('node')}
ways = {w.attrib['id']: w for w in osm.findall('way')}
relation = next(r for r in osm.findall('relation') if r.attrib['id'] == '9600586')
assert {t.attrib['k']: t.attrib['v'] for t in relation.findall('tag')}['name'] == '人民广场'
assert layout['sourceSquare']['rawSha256'] == hashlib.sha256(raw).hexdigest()


def points(identifier):
    ns = [nodes[n.attrib['ref']] for n in ways[identifier].findall('nd')]
    return [[round((float(n.attrib['lon']) - 109.41225) * 101458, 3),
             round((24.31415 - float(n.attrib['lat'])) * 111320, 3)] for n in ns]


outer, holes = [], []
for member in relation.findall('member'):
    (outer if member.attrib['role'] == 'outer' else holes).append(points(member.attrib['ref']))
assert len(outer) == 1 and len(holes) == 1
assert layout['sourceSquare']['outer'] == outer[0]
assert layout['sourceSquare']['holes'] == holes
assert layout['sourceFountain']['points'] == holes[0]
square, fountain = Polygon(outer[0], holes), Polygon(holes[0])
assert abs(square.area - layout['sourceSquare']['area']) < .00001
assert abs(fountain.area - layout['sourceFountain']['area']) < .00001
envelope = Polygon(layout['envelopeEstimated'])
obstacles = []
for building in city['buildings']:
    polygon = Polygon(building['points'])
    if polygon.intersects(envelope):
        obstacles.append(polygon.buffer(.65))
for road in city['roads']:
    highway = road['tags'].get('highway')
    if not highway or highway in ['pedestrian', 'footway', 'path', 'cycleway']:
        continue
    width = {'primary': 16, 'trunk': 16, 'secondary': 13, 'tertiary': 10}.get(highway, 6)
    line = LineString(road['points'])
    if line.distance(envelope) < width:
        obstacles.append(line.buffer(width / 2 + .5, quad_segs=4))
expected = envelope.difference(unary_union(obstacles)).difference(fountain)
triangles = [Polygon(s['points']) for s in layout['surfaces']]
paving = unary_union(triangles)
assert abs(sum(t.area for t in triangles) - paving.area) < .05, 'overlapping paving'
assert paving.symmetric_difference(expected).area < .05, 'missing public paving or painted source hole'
assert paving.intersection(fountain).area < .001, 'source fountain hole painted as general plaza'
for surface, triangle in zip(layout['surfaces'], triangles):
    if surface['kind'] == 'approach':
        assert triangle.intersection(Polygon(outer[0])).area < .001, 'estimated approach labeled as source square'
    else:
        assert triangle.difference(square).area < .001, 'square paving extends beyond source polygon'
fountain_faces = [Polygon(s['points']) for s in layout['sourceFountain']['surfaces']]
assert unary_union(fountain_faces).symmetric_difference(fountain).area < .001
assert abs(sum(f.area for f in fountain_faces) - fountain.area) < .001

# Independently reconstruct the source tower/podium overlap. Render subtraction
# must remove the duplicate exterior without shrinking the combined solid.
tower_source = next(b for b in city['buildings'] if b['id'] == '899710004')
podium_source = next(b for b in city['buildings'] if b['id'] == '434067129')
assert tower_source['points'] == points('899710004')
assert podium_source['points'] == points('434067129')
tower, podium = Polygon(tower_source['points']), Polygon(podium_source['points'])
override = layout['buildingRenderOverrides']['city-osm-434067129']
rendered = unary_union([Polygon(p['points'], p['holes']) for p in override['parts']])
assert podium.boundary.intersection(tower.boundary).length > 80, 'fixture must retain the actual shared exterior'
assert rendered.symmetric_difference(podium.difference(tower)).area < 1e-7
assert rendered.intersection(tower).area < 1e-7
assert rendered.union(tower).symmetric_difference(podium.union(tower)).area < 1e-7
exposed = unary_union([LineString(edge) for edge in override['facadeEdges']])
expected_exterior = podium.boundary.difference(tower)
assert exposed.symmetric_difference(expected_exterior).length < 1e-7
assert exposed.intersection(tower.boundary).length < 1e-7, 'podium window bands duplicate the tower exterior'
assert abs(override['overlapArea'] - tower.area) < 1e-7
print(json.dumps({'sourceRelation': '9600586', 'sourceSquareArea': square.area,
                  'sourceFountainArea': fountain.area, 'publicArea': paving.area,
                  'pavingTriangles': len(triangles), 'symmetricDifference': paving.symmetric_difference(expected).area}))
