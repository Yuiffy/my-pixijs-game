"""Independent source and polygon validation for the station surroundings."""
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
source_path = ROOT / 'src/components/liuzhou/city-map.json'
source = json.loads(source_path.read_text(encoding='utf8'))
layout_path = ROOT / 'src/components/liuzhou/station-neighborhood-layout.json'
layout = json.loads(layout_path.read_text(encoding='utf8'))
assert layout_path.read_bytes() == (ROOT / 'public/games/liuzhou/station-neighborhood-layout.json').read_bytes()
assert layout['sourceSha256'] == hashlib.sha256(source_path.read_bytes()).hexdigest()
ids = ['775896077', '775896078', '775896079', '1274348413', '1274348431', '1274348432']
assert [p['id'] for p in layout['parcels']] == ids
matched = set()
for archive in sorted((ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz')):
    osm = ET.fromstring(gzip.decompress(archive.read_bytes()))
    nodes = {n.attrib['id']: n for n in osm.findall('node')}
    for way in osm.findall('way'):
        identifier = way.attrib['id']
        if identifier not in ids:
            continue
        refs = [n.attrib['ref'] for n in way.findall('nd')]
        if not all(ref in nodes for ref in refs):
            continue
        expected = [[round((float(nodes[ref].attrib['lon']) - 109.41225) * 101458, 3), round((24.31415 - float(nodes[ref].attrib['lat'])) * 111320, 3)] for ref in refs]
        parcel = next(p for p in layout['parcels'] if p['id'] == identifier)
        assert parcel['points'] == expected, (archive.name, identifier)
        assert parcel['tags'] == {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
        matched.add(identifier)
assert matched == set(ids)
parcels = {p['id']: Polygon(p['points']) for p in layout['parcels']}
source_buildings = unary_union([Polygon(b['points']) for b in source['buildings']])
station = json.loads((ROOT / 'src/components/liuzhou/station-layout.json').read_text(encoding='utf8'))
plaza = Polygon(station['eastPlaza'])
road_shapes = []
for road in source['roads']:
    if road['tags'].get('bridge') == 'yes':
        continue
    kind = road['tags']['highway']
    width = 16 if kind in ['primary', 'trunk'] else 13 if kind == 'secondary' else 10 if kind == 'tertiary' else 4 if kind in ['pedestrian', 'footway', 'path', 'cycleway'] else 6
    road_shapes.append(LineString(road['points']).buffer(width / 2 + 2.2, cap_style=2, join_style=2))
roads = unary_union(road_shapes)
volumes = [Polygon(v['points']) for v in layout['volumes']]
walls = [Polygon(w['points']) for w in layout['walls']]
surfaces = [Polygon(s['points']) for s in layout['surfaces']]
for v, shape in zip(layout['volumes'], volumes):
    assert shape.difference(parcels[v['parcelId']]).area < .001, v['id']
    assert v['heightSource'] == 'estimated' and v['geometryStatus'] == 'inferred'
for i, shape in enumerate(volumes):
    assert shape.is_valid
    assert all(shape.distance(other) > 11.999 for other in volumes[i + 1:]), layout['volumes'][i]['id']
wall_union = unary_union(walls)
infill = unary_union(volumes)
ground = unary_union(surfaces)
areas = {
    'infill_source_overlap': infill.intersection(source_buildings).area,
    'infill_road_overlap': infill.intersection(roads).area,
    'infill_plaza_overlap': infill.intersection(plaza).area,
    'wall_road_overlap': wall_union.intersection(roads).area,
    'wall_source_overlap': wall_union.intersection(source_buildings).area,
    'wall_plaza_overlap': wall_union.intersection(plaza).area,
    'duplicate_wall_area': sum(p.area for p in walls) - wall_union.area,
    'ground_road_overlap': ground.intersection(roads).area,
    'ground_building_overlap': ground.intersection(source_buildings.union(infill)).area,
    'duplicate_ground_area': sum(p.area for p in surfaces) - ground.area,
}
assert max(areas.values()) < .003, areas
common = parcels['775896078'].boundary.intersection(parcels['775896079'].boundary)
assert 149 < common.length < 150
common_walls = unary_union([Polygon(w['points']) for w in layout['walls'] if set(w['parcelIds']) == {'775896078', '775896079'}])
assert common.difference(common_walls.buffer(.001)).length < .001, 'shared boundary must be enclosed exactly once'
for p in layout['parcels']:
    poly = parcels[p['id']]
    assert poly.is_valid
    own = unary_union([Polygon(v['points']) for v in layout['volumes'] if v['parcelId'] == p['id']])
    assert own.area > poly.area * .12, 'a bounded parcel must not remain an empty field'
    actual = unary_union([Polygon(s['points']) for s in layout['surfaces'] if s['parcelId'] == p['id']])
    expected = poly.buffer(-.5, join_style=2).difference(roads.buffer(.002, join_style=2)).difference(source_buildings.buffer(.25, join_style=2)).difference(own.buffer(.25, join_style=2)).difference(plaza)
    assert actual.symmetric_difference(expected).area < .01, p['id']
    label = next(l for l in layout['labels'] if l['parcelId'] == p['id'])
    wall = next(w for w in layout['walls'] if w['id'] == label['wallId'])
    assert wall['parcelIds'] == [p['id']], 'nameplates must face public streets, not shared internal walls'
    at = Point(label['at'])
    assert not poly.covers(at), 'nameplate must be on the outside face of its wall'
    assert .03 < at.distance(Polygon(wall['points'])) < .04, 'nameplate must clear the actual outer wall face'
for route in layout['walkRoutes'].values():
    source_road = next(r for r in source['roads'] if r['id'] == route['sourceId'])
    expected = LineString(source_road['points']).offset_curve(route['offsetMeters'], join_style=2)
    assert expected.hausdorff_distance(LineString(route['points'])) < 1e-5
    assert LineString(route['points']).buffer(.7).intersection(source_buildings.union(infill).union(wall_union)).area < .001
print(json.dumps({'passed': True, 'counts': {k: len(layout[k]) for k in ['parcels', 'volumes', 'walls', 'surfaces', 'walkRoutes']}, 'shared_boundary_m': common.length, 'intersection_areas_m2': areas}))
