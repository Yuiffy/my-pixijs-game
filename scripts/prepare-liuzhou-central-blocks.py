"""Restore boundary buildings and enclose archived central residential parcels.

Footprints/parcel rings and public road axes are source geometry. The apartment
infill, fences, heights and ground finishes are estimates, not cadastral data.
"""
import hashlib
import gzip
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'src/components/liuzhou/city-map.json'
source = json.loads(source_path.read_text(encoding='utf8'))
source_ids = ['205656857', '205657492', '1351248940', '1351248943']
heights = [19.2, 25.6, 22.4, 19.2]
buildings = [{**next(b for b in source['buildings'] if b['id'] == identifier),
              'height': heights[i], 'heightSource': 'estimated'} for i, identifier in enumerate(source_ids)]
parcel_ids = ['205654200', '205659715', '1044328330', '1044328341',
              '1044328342', '1044328343', '1044328346', '1044328347',
              '1352351112', '1044328331', '1539716390', '1274445934',
              '1274445939', '1306511547', '1539716380', '1539716381']
parcels = [next(a for a in source['areas'] if a['id'] == identifier) for identifier in parcel_ids]

# The source residential relation surrounds, but explicitly excludes, a school.
# These members have no independent landuse tags and were missed by city-map's
# way-only importer. Preserve both rings rather than treating the inner school
# as residential building space.
archive = ROOT / 'data/liuzhou/open/osm/skyline-core.osm.gz'
archive_raw = gzip.decompress(archive.read_bytes())
osm = ET.fromstring(archive_raw)
nodes = {n.attrib['id']: n for n in osm.findall('node')}
ways = {w.attrib['id']: w for w in osm.findall('way')}
relation = next(r for r in osm.findall('relation') if r.attrib['id'] == '21296846')
assert [(m.attrib['ref'], m.attrib['role']) for m in relation.findall('member')] == [('1553552667', 'outer'), ('205663282', 'inner')]


def source_ring(identifier):
    refs = [n.attrib['ref'] for n in ways[identifier].findall('nd')]
    assert refs[0] == refs[-1] and all(ref in nodes for ref in refs)
    return [[round((float(nodes[ref].attrib['lon']) - 109.41225) * 101458, 3),
             round((24.31415 - float(nodes[ref].attrib['lat'])) * 111320, 3)] for ref in refs]


outer, school_ring = source_ring('1553552667'), source_ring('205663282')
parcels.extend([
    {'id': 'relation-21296846', 'name': '', 'points': outer, 'holes': [school_ring],
     'tags': {t.attrib['k']: t.attrib['v'] for t in relation.findall('tag')},
     'sourceRelationId': '21296846', 'outerWayIds': ['1553552667'], 'innerWayIds': ['205663282']},
    {'id': 'school-205663282', 'name': '雅儒路小学', 'points': school_ring, 'holes': [],
     'tags': {t.attrib['k']: t.attrib['v'] for t in ways['205663282'].findall('tag')},
     'sourceWayId': '205663282'},
])

source_shapes = unary_union([Polygon(b['points']) for b in source['buildings']])
road_shapes = []
for road in source['roads']:
    tags = road['tags']
    if tags.get('bridge') == 'yes':
        continue
    kind = tags['highway']
    width = 16 if kind in ['primary', 'trunk'] else 13 if kind == 'secondary' else 10 if kind == 'tertiary' else 4 if kind in ['pedestrian', 'footway', 'path', 'cycleway'] else 6
    # Fence/infill clearance protects the entire road and its walking margin.
    road_shapes.append(LineString(road['points']).buffer(width / 2 + 2.2, cap_style=2, join_style=2))
roads = unary_union(road_shapes)
water = json.loads((ROOT / 'src/components/liuzhou/skyline-map.json').read_text(encoding='utf8'))['riverPolygons']
river = unary_union([Polygon(ring['outer'], ring.get('holes', [])) for ring in water])
walls, volumes, surfaces, labels = [], [], [], []


def rings(poly):
    return [[round(x, 5), round(z, 5)] for x, z in list(poly.exterior.coords)[:-1]]


def lines(shape):
    if shape.is_empty:
        return []
    return [shape] if shape.geom_type == 'LineString' else [p for p in shape.geoms if p.geom_type == 'LineString']


for parcel in parcels:
    poly = Polygon(parcel['points'], parcel.get('holes', []))
    assert poly.is_valid
    parcel['existingBuildingIds'] = [b['id'] for b in source['buildings']
                                     if poly.intersection(Polygon(b['points'])).area > 5]
    # A mapped group of apartment buildings takes priority over authored bars.
    # In particular, keep Fuliu Xindu's ten source rings and its open courts.
    source_only = len(parcel['existingBuildingIds']) >= 3
    school = parcel['tags'].get('amenity') == 'school'
    parcel['infillPolicy'] = 'source buildings only' if source_only else 'estimated school edge blocks with open court' if school else 'estimated apartment infill'
    clear = poly.buffer(-3.0).difference(roads.buffer(1.2)).difference(source_shapes.buffer(3)).difference(river.buffer(2))
    axis = list(poly.minimum_rotated_rectangle.exterior.coords)
    a, b = max(zip(axis, axis[1:]), key=lambda pair: math.dist(*pair))
    angle = math.atan2(b[1] - a[1], b[0] - a[0])
    c, s = math.cos(angle), math.sin(angle)
    centre = poly.centroid
    local_points = [((x - centre.x) * c + (z - centre.y) * s,
                     -(x - centre.x) * s + (z - centre.y) * c) for x, z in parcel['points']]
    min_x = min(p[0] for p in local_points); max_x = max(p[0] for p in local_points)
    min_z = min(p[1] for p in local_points); max_z = max(p[1] for p in local_points)
    occupied = []
    # Try larger apartment bars first, then a shorter bar for small parcels.
    for width in ([] if source_only else [28] if school else [28, 19, 13]):
        depth = 10 if width > 13 else 8
        # Start inside the setback, rather than placing the first candidate
        # on the outer parcel edge (which rejected every bar in small plots).
        rows = [math.ceil(min_z + depth / 2 + 6), math.floor(max_z - depth / 2 - 6)] if school else range(math.ceil(min_z + depth / 2 + 4), math.floor(max_z - depth / 2 - 3) + 1, 18)
        for z in rows:
            for x in range(math.ceil(min_x + width / 2 + 4), math.floor(max_x - width / 2 - 3) + 1, width + 9):
                points = [[centre.x + (x + dx) * c - (z + dz) * s,
                           centre.y + (x + dx) * s + (z + dz) * c]
                          for dx, dz in [(-width / 2, -depth / 2), (width / 2, -depth / 2),
                                         (width / 2, depth / 2), (-width / 2, depth / 2)]]
                candidate = Polygon(points)
                if not clear.covers(candidate) or any(candidate.distance(other) < 7 for other in occupied):
                    continue
                occupied.append(candidate)
                volumes.append({'id': f'central-infill-{parcel["id"]}-{len(occupied)}',
                                'parcelId': parcel['id'], 'points': rings(candidate),
                                'height': 12.8 if school else 12.8 + (len(occupied) % 4) * 3.2,
                                'use': 'school' if school else 'residential',
                                'heightSource': 'estimated', 'geometryStatus': 'inferred'})
    # The inner school has its own enclosure. Do not extrude that shared ring
    # twice, which creates coplanar walls and a second, residential nameplate.
    fence = LineString(poly.exterior.coords).difference(roads.buffer(0.6)).difference(source_shapes.buffer(0.85)).difference(river.buffer(0.5))
    label_edges = []
    for line in lines(fence):
        points = list(line.coords)
        for a, b in zip(points, points[1:]):
            length = math.dist(a, b); count = max(1, math.ceil(length / 7))
            for n in range(count):
                start = [a[i] + (b[i] - a[i]) * n / count for i in range(2)]
                end = [a[i] + (b[i] - a[i]) * (n + 1) / count for i in range(2)]
                if math.dist(start, end) < .35:
                    continue
                wall = LineString([start, end]).buffer(.24, cap_style=2)
                assert wall.intersection(roads).area < 1e-6
                walls.append({'id': f'urban-wall-central-{parcel["id"]}-{len(walls)}',
                              'parcelId': parcel['id'], 'points': rings(wall), 'height': 2.2,
                              'geometryStatus': 'inferred along source parcel'})
                if math.dist(start, end) > 4:
                    label_edges.append((start, end, walls[-1]['id']))
    if label_edges:
        a, b, wall_id = min(label_edges, key=lambda edge: roads.distance(LineString(edge[:2]).centroid))
        length = math.dist(a, b)
        nx, nz = (b[1] - a[1]) / length, -(b[0] - a[0]) / length
        x, z = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if poly.contains(Point(x + nx * .6, z + nz * .6)):
            nx, nz = -nx, -nz
        labels.append({'parcelId': parcel['id'], 'text': parcel['name'] or '住宅院落',
                       'wallId': wall_id,
                       'at': [round(x + nx * .27, 5), round(z + nz * .27, 5)],
                       'angle': math.atan2(nx, nz), 'height': 1.5,
                       'geometryStatus': 'estimated nameplate on inferred wall'})
    # Leave a millimetre of export tolerance so five-decimal vertices cannot
    # round courtyard triangles back into the protected public road surface.
    court = poly.buffer(-.5).difference(source_shapes.buffer(.25)).difference(unary_union(occupied).buffer(.25)).difference(roads.buffer(.001)).difference(river)
    # Continuous landscape with narrow building/perimeter aprons. Grid cells
    # subdivide terrain only; they must not appear as alternating chess tiles.
    apron = source_shapes.buffer(2).union(unary_union(occupied).buffer(2)).union(poly.boundary.buffer(1.5))
    finishes = [(court.intersection(apron), '#b7b49c', 'estimated paved apron'),
                (court.difference(apron), '#baa990' if school else '#969e80', 'estimated school court' if school else 'estimated planted court')]
    for x in range(math.floor(poly.bounds[0] / 10) * 10, math.ceil(poly.bounds[2]), 10):
        for z in range(math.floor(poly.bounds[1] / 10) * 10, math.ceil(poly.bounds[3]), 10):
            for finish, color, status in finishes:
                patch = finish.intersection(box(x, z, x + 10, z + 10))
                for face in constrained_delaunay_triangles(patch).geoms:
                    if face.area > 1e-7:
                        surfaces.append({'points': rings(face), 'color': color, 'geometryStatus': status, 'parcelId': parcel['id']})
    for v in volumes:
        if v['parcelId'] == parcel['id']:
            shape = Polygon(v['points'])
            assert poly.covers(shape)
            assert shape.intersection(roads).area < 1e-6
            assert shape.intersection(source_shapes).area < 1e-6
liantang = next(r for r in source['roads'] if r['id'] == '205517132')
liantang_walk = LineString(liantang['points']).offset_curve(-4.5, join_style=2)
# This lane's source centre passes through entrance 1275168887. Keep the
# ground tour on its north side; the mapped stair remains fully accessible.
underground = json.loads((ROOT / 'src/components/liuzhou/underground-layout.json').read_text(encoding='utf8'))
openings = unary_union([Polygon(rings[0], rings[1:]) for rings in underground['openings']])
assert liantang_walk.intersection(openings.buffer(.8)).is_empty
walk_routes = {'liantang': {'sourceId': liantang['id'], 'offsetMeters': -4.5,
                           'points': [[round(x, 5), round(z, 5)] for x, z in liantang_walk.coords]}}
for name, source_id, offset, point_count in [('bayi', '1376744091', 9.25, None),
                                            ('yuejin', '646444253', 9.25, 4),
                                            ('guangya', '196166791', 7.75, None),
                                            ('square', '205515115', 4.25, None),
                                            ('wangjia-west', '205663297', 4.0, None),
                                            ('wangjia-east', '1352354551', 4.0, 7)]:
    road = next(r for r in source['roads'] if r['id'] == source_id)
    walk = LineString(road['points'][:point_count]).offset_curve(offset, join_style=2)
    assert walk.buffer(.7).intersection(source_shapes).is_empty
    assert walk.intersection(openings.buffer(.8)).is_empty
    walk_routes[name] = {'sourceId': source_id, 'offsetMeters': offset,
                         'geometryStatus': 'estimated walking offset from source road axis',
                         'sourcePointCount': len(road['points'][:point_count]),
                         'points': [[round(x, 5), round(z, 5)] for x, z in walk.coords]}
solids = source_shapes.union(unary_union([Polygon(v['points']) for v in volumes + walls]))
for route in walk_routes.values():
    assert LineString(route['points']).buffer(.7).intersection(solids).is_empty
output = {'version': 1, 'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
          'license': 'ODbL-1.0; OpenStreetMap contributors',
          'note': 'Four restored source building rings, sixteen source residential ways, residential relation 21296846 and its excluded school 205663282. Existing source building groups take priority. Infill, fences, heights, nameplates and landscaping are estimates; road corridors remain open.',
          'additionalSource': {'archive': str(archive.relative_to(ROOT)).replace('\\', '/'),
                               'rawSha256': hashlib.sha256(archive_raw).hexdigest(),
                               'relationId': '21296846'},
          'sourceBuildings': buildings, 'parcels': parcels, 'volumes': volumes,
          'walls': walls, 'surfaces': surfaces, 'labels': labels, 'walkRoutes': walk_routes}
text = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in ['src/components/liuzhou/central-layout.json', 'public/games/liuzhou/central-layout.json']:
    (ROOT / target).write_text(text, encoding='utf8')
print(json.dumps({'sourceBuildings': len(buildings), 'parcels': len(parcels), 'inferredBuildings': len(volumes), 'wallSegments': len(walls), 'surfaces': len(surfaces)}))
