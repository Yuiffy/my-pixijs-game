"""Validate western shopping geometry against archived OSM, not generator output alone."""
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
source_path = ROOT / 'src/components/liuzhou/city-map.json'
source = json.loads(source_path.read_text(encoding='utf-8'))
layout = json.loads((ROOT / 'src/components/liuzhou/wuxing-layout.json').read_text(encoding='utf-8'))
assert (ROOT / 'src/components/liuzhou/wuxing-layout.json').read_bytes() == (ROOT / 'public/games/liuzhou/wuxing-layout.json').read_bytes()
assert layout['sourceSha256'] == hashlib.sha256(source_path.read_bytes()).hexdigest()
west_ids = ['205654183', '205654194', '205654205', '641119432', '1044328355', '1044328356', '1044328357', '1275168866', '1275168894', '1275168895', '1275168896', '1351248939']
assert layout['westSourceIds'] == west_ids
required = {layout['retail']['id']: layout['retail']}
required.update({b['id']: b for b in layout['buildings']})
required.update({r['id']: r for r in layout['sourceRoads'] + layout['westSourceRoads']})
matched = set()
for archive in sorted((ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz')):
    osm = ET.fromstring(gzip.decompress(archive.read_bytes()))
    nodes = {n.attrib['id']: n for n in osm.findall('node')}
    for way in osm.findall('way'):
        identifier = way.attrib['id']
        if identifier not in required or identifier in matched:
            continue
        refs = [n.attrib['ref'] for n in way.findall('nd')]
        if not all(ref in nodes for ref in refs):
            continue
        expected = [[round((float(nodes[ref].attrib['lon']) - 109.41225) * 101458, 3), round((24.31415 - float(nodes[ref].attrib['lat'])) * 111320, 3)] for ref in refs]
        actual = required[identifier]
        assert actual['points'] == expected, (identifier, archive.name)
        assert actual['tags'] == {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}, identifier
        matched.add(identifier)
assert matched == set(required), set(required) - matched
for identifier in west_ids:
    building = next(b for b in layout['buildings'] if b['id'] == identifier)
    assert building['height'] == 10 + int(identifier) % 6 * 3.2, 'retain the previous generic shell height'
    assert building['heightSource'] == 'estimated'

retail = Polygon(layout['retail']['points'])
source_buildings = unary_union([Polygon(b['points']) for b in source['buildings']])
infill = [Polygon(b['points']) for b in layout['infillBuildings']]
assert len(infill) == 6
infill_union = unary_union(infill)
core = json.loads((ROOT / 'src/components/liuzhou/map.json').read_text(encoding='utf-8'))
core_ids = {r['id'] for r in core['features'] if r.get('highway')}
motor = []
for road in source['roads']:
    kind = road['tags']['highway']
    if kind in ['pedestrian', 'footway', 'path', 'cycleway', 'steps']:
        continue
    if road['id'] in core_ids:
        width = 15 if kind == 'secondary' else 12 if kind == 'tertiary' else 5
    else:
        width = 16 if kind in ['primary', 'trunk'] else 13 if kind == 'secondary' else 10 if kind == 'tertiary' else 6
    motor.append(LineString(road['points']).buffer(width / 2, cap_style=2, join_style=2))
motor = unary_union(motor)
under = json.loads((ROOT / 'src/components/liuzhou/underground-layout.json').read_text(encoding='utf-8'))
openings = unary_union([LineString(e['points']).buffer(e['width'] / 2 + 1.8) for e in under['entrances']])
walk = unary_union([LineString(points).buffer(.7) for points in layout['walkRoutes'].values()])
for b, shape in zip(layout['infillBuildings'], infill):
    assert b['geometryStatus'] == 'estimated footprint' and b['heightSource'] == 'estimated'
    assert b['height'] in [6.4, 9.6]
    assert retail.covers(shape)
    assert shape.distance(source_buildings) > 2.99
    assert shape.distance(motor) > 2.99
    assert shape.intersection(openings).area == 0
    assert shape.intersection(walk).area == 0
for i, shape in enumerate(infill):
    assert all(shape.distance(other) >= 7.999 for other in infill[i + 1:])
for name, route in layout['westWalkRoutes'].items():
    road = next(r for r in source['roads'] if r['id'] == route['sourceId'])
    axis = LineString(road['points'])
    offset = axis.offset_curve(route['offsetMeters'], join_style=2) if route['offsetMeters'] else axis
    actual = LineString(route['points'])
    assert actual.difference(offset.buffer(.00002)).length < .0001, name
    assert actual.length > 20
    assert actual.buffer(.7).intersection(source_buildings.union(infill_union).union(openings)).area < .001, name
assert len(layout['westWalkRoutes']) == 2
ground = unary_union([Polygon(f['points']) for f in layout['surfaces']])
solid = source_buildings.union(infill_union)
non_crossings = unary_union([Polygon(f['points']) for f in layout['surfaces'] if f['color'] != '#d8ccb0'])
areas = {'ground_building': ground.intersection(solid).area,
         'ground_stairs': ground.intersection(openings).area,
         'pavement_carriageway': non_crossings.intersection(motor).area,
         'duplicate_ground': sum(Polygon(f['points']).area for f in layout['surfaces']) - ground.area}
assert max(areas.values()) < .02, areas
assert non_crossings.area > 10000
for b, shape in zip(layout['infillBuildings'], infill):
    assert ground.intersection(shape.buffer(.2)).area > 1, b['id']
    assert any(f['buildingId'] == b['id'] for f in layout['facades']), b['id']
assert {a['buildingId'] for a in layout['shopApproaches']} == {b['id'] for b in layout['infillBuildings']}
for approach in layout['shopApproaches']:
    route = layout['westWalkRoutes'].get(approach['routeId'])
    axis = LineString(route['points'] if route else layout['routes'][approach['routeId']])
    assert Point(approach['points'][0]).distance(axis) < .00002
    line = LineString(approach['points'])
    assert line.buffer(.6).intersection(solid.union(openings)).area < .001
    assert line.buffer(.4).difference(ground).area < .001, approach['buildingId']
for front in layout['facades']:
    a, b = front['a'], front['b']; nx, nz = front['outward']
    outside = Point((a[0] + b[0]) / 2 + nx * .8, (a[1] + b[1]) / 2 + nz * .8)
    assert not solid.contains(outside), front['id']
    shell = next(b for b in layout['buildings'] + layout['infillBuildings'] if b['id'] == front['buildingId'])
    owner = next(b for b in layout['buildings'] + layout['infillBuildings'] if b['id'] == front['detailOwnerId'])
    assert owner['height'] >= shell['height']
    assert LineString([a, b]).difference(Polygon(owner['points']).boundary.buffer(.035)).length < .02
drawn = [f for f in layout['facades'] if f['detailOwnerId'] == f['buildingId']]
for i, front in enumerate(drawn):
    edge = LineString([front['a'], front['b']])
    for other in drawn[i + 1:]:
        if front['buildingId'] == other['buildingId']:
            continue
        overlap = edge.intersection(LineString([other['a'], other['b']]).buffer(.02, cap_style=2)).length
        assert overlap < .1, ('duplicate exterior details', front['id'], other['id'], overlap)
rendered = []
for shell in layout['buildings']:
    original = Polygon(shell['points'])
    override = next((r for r in layout['renderParts'] if r['id'] == shell['id']), None)
    if override:
        covers = [b for b in layout['buildings'] if b['id'] in override['coveredBy']]
        assert all((b['height'], b['id']) > (shell['height'], shell['id']) for b in covers)
        visible = unary_union([Polygon(p['points'], p['holes']) for p in override['parts']])
        expected = original.difference(unary_union([Polygon(b['points']) for b in covers]))
        assert visible.symmetric_difference(expected).area < .001, shell['id']
    else:
        visible = original
    rendered.append(visible)
source_union = unary_union([Polygon(b['points']) for b in layout['buildings']])
assert unary_union(rendered).symmetric_difference(source_union).area < .001
assert sum(p.area for p in rendered) - unary_union(rendered).area < .001
print(json.dumps({'passed': True, 'sourceBuildings': len(layout['buildings']), 'westRestyledShells': len(west_ids), 'estimatedShops': len(infill), 'routes': len(layout['westWalkRoutes']), 'facades': len(layout['facades']), 'furniture': len(layout['furniture']), 'areas_m2': areas}))
