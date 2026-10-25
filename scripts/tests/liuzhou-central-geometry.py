"""Independent polygon checks for the generated residential reconstruction."""
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
source = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
layout = json.loads((ROOT / 'src/components/liuzhou/central-layout.json').read_text(encoding='utf8'))
raw = gzip.decompress((ROOT / layout['additionalSource']['archive']).read_bytes())
assert hashlib.sha256(raw).hexdigest() == layout['additionalSource']['rawSha256']
osm = ET.fromstring(raw)
nodes = {n.attrib['id']: n for n in osm.findall('node')}
ways = {w.attrib['id']: w for w in osm.findall('way')}
relation = next(r for r in osm.findall('relation') if r.attrib['id'] == '21296846')
assert {t.attrib['k']: t.attrib['v'] for t in relation.findall('tag')}['landuse'] == 'residential'
assert [(m.attrib['ref'], m.attrib['role']) for m in relation.findall('member')] == [('1553552667', 'outer'), ('205663282', 'inner')]


def source_ring(identifier):
    ns = [nodes[n.attrib['ref']] for n in ways[identifier].findall('nd')]
    return [[round((float(n.attrib['lon']) - 109.41225) * 101458, 3),
             round((24.31415 - float(n.attrib['lat'])) * 111320, 3)] for n in ns]


residential = next(p for p in layout['parcels'] if p.get('sourceRelationId') == '21296846')
school = next(p for p in layout['parcels'] if p.get('sourceWayId') == '205663282')
assert residential['points'] == source_ring('1553552667')
assert residential['holes'] == [source_ring('205663282')]
assert school['points'] == source_ring('205663282')
assert school['tags'] == {t.attrib['k']: t.attrib['v'] for t in ways['205663282'].findall('tag')}
school_shape = Polygon(school['points'])
residential_shape = Polygon(residential['points'], residential['holes'])
assert residential_shape.intersection(school_shape).area < 1e-7
assert residential_shape.union(school_shape).equals(Polygon(residential['points']))
road_shapes = []
for road in source['roads']:
    if road['tags'].get('bridge') == 'yes':
        continue
    kind = road['tags']['highway']
    width = 16 if kind in ['primary', 'trunk'] else 13 if kind == 'secondary' else 10 if kind == 'tertiary' else 4 if kind in ['pedestrian', 'footway', 'path', 'cycleway'] else 6
    road_shapes.append(LineString(road['points']).buffer(width / 2 + 2.2, cap_style=2, join_style=2))
roads = unary_union(road_shapes)
source_buildings = unary_union([Polygon(b['points']) for b in source['buildings']])
volumes = [Polygon(v['points']) for v in layout['volumes']]
walls = unary_union([Polygon(w['points']) for w in layout['walls']])
surfaces = unary_union([Polygon(s['points']) for s in layout['surfaces']])
parcels = {p['id']: Polygon(p['points'], p.get('holes', [])) for p in layout['parcels']}
# Re-read the small Linjiang Lane residential way from the original archive,
# rather than validating only against the intermediate city-map export.
dorm = next(p for p in layout['parcels'] if p['id'] == '1044328334')
assert dorm['points'] == source_ring('1044328334')
assert dorm['tags'] == {t.attrib['k']: t.attrib['v'] for t in ways['1044328334'].findall('tag')}
assert dorm['existingBuildingIds'] == []
dorm_volumes = [v for v in layout['volumes'] if v['parcelId'] == dorm['id']]
assert len(dorm_volumes) == 2
assert all(v['geometryStatus'] == 'inferred' and v['heightSource'] == 'estimated' for v in dorm_volumes)
assert sum(Polygon(v['points']).area for v in dorm_volumes) / parcels[dorm['id']].area > .15
assert any(w['parcelId'] == dorm['id'] for w in layout['walls'])
for v, polygon in zip(layout['volumes'], volumes):
    assert parcels[v['parcelId']].covers(polygon), v['id']
    if v['parcelId'] == residential['id']:
        assert polygon.intersection(school_shape).area < .001, 'residential infill entered source school hole'
    if v['parcelId'] == school['id']:
        assert v['use'] == 'school' and v['heightSource'] == 'estimated'
        assert school_shape.covers(polygon)
for surface in layout['surfaces']:
    polygon = Polygon(surface['points'])
    assert polygon.difference(parcels[surface['parcelId']]).area < .001
school_walls = unary_union([Polygon(w['points']) for w in layout['walls'] if w['parcelId'] == school['id']])
residential_walls = unary_union([Polygon(w['points']) for w in layout['walls'] if w['parcelId'] == residential['id']])
assert school_walls.intersection(residential_walls).area < .001, 'school shared boundary rendered twice'
school_court = unary_union([Polygon(s['points']) for s in layout['surfaces'] if s['parcelId'] == school['id'] and s['geometryStatus'] == 'estimated school court'])
assert school_court.area > 1500, 'estimated school edge blocks must leave an open central court'
for i, a in enumerate(volumes):
    for b in volumes[i + 1:]:
        assert a.distance(b) > 6.999, 'Apartment bars must leave usable space between them'
inferred = unary_union(volumes)
areas = {
    'inferred_source_overlap': inferred.intersection(source_buildings).area,
    'inferred_road_overlap': inferred.intersection(roads).area,
    'wall_road_overlap': walls.intersection(roads).area,
    'surface_road_overlap': surfaces.intersection(roads).area,
    'surface_building_overlap': surfaces.intersection(unary_union([inferred, source_buildings])).area,
    'inferred_outside_parcels': inferred.difference(unary_union(list(parcels.values()))).area,
}
# Five-decimal metre output rounding may leave sub-square-centimetre slivers.
assert max(areas.values()) < .001, areas
underground = json.loads((ROOT / 'src/components/liuzhou/underground-layout.json').read_text(encoding='utf8'))
openings = unary_union([Polygon(r[0], r[1:]) for r in underground['openings']])
route = LineString(layout['walkRoutes']['liantang']['points'])
assert route.intersection(openings.buffer(.8)).is_empty
print(json.dumps({'passed': True, 'counts': {k: len(layout[k]) for k in ['sourceBuildings', 'parcels', 'volumes', 'walls', 'surfaces']}, 'intersection_areas_m2': areas}))
