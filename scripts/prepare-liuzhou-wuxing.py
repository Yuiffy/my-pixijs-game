"""Build the shopping street from preserved OSM rings and pedestrian axes.

No street survey was obtained. Widths, heights and furniture are estimates;
the retail landuse boundary is never treated as an empty public plaza.
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
source = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
under = json.loads((ROOT / 'src/components/liuzhou/underground-layout.json').read_text(encoding='utf8'))
ids = ['205654195', '641119425', '641119429', '641119437', '641119439',
       '641119441', '641119443', '1044328353', '1044328354', '1044328363', '1351248938']
heights = [26, 27, 17, 28, 17, 18, 20, 22, 32, 22, 4]
west_ids = ['205654183', '205654194', '205654205', '641119432',
            '1044328355', '1044328356', '1044328357', '1275168866',
            '1275168894', '1275168895', '1275168896', '1351248939']
# These shells were already present as generic city buildings. Keep their
# existing estimated heights when giving the western streets proper fronts.
ids.extend(west_ids)
heights.extend(10 + (int(identifier) % 6) * 3.2 for identifier in west_ids)
palette = ['#b9aa94', '#c2b6a3', '#d4c6b1', '#d9d3c5', '#c9beaa', '#b7c0b6']
buildings = []
for i, identifier in enumerate(ids):
    b = next(b for b in source['buildings'] if b['id'] == identifier)
    buildings.append({**b, 'height': heights[i], 'heightSource': 'estimated', 'color': '#c4ad94' if identifier == '641119437' else palette[i % len(palette)]})
retail = next(a for a in source['areas'] if a['id'] == '1524324821')
retail_shape = Polygon(retail['points'])
widths = {'196166794': 12, '205513960': 10, '205639719': 9,
          '205639717': 7, '1351248947': 8}
roads = [r for r in source['roads'] if r['id'] in widths]
lines = unary_union([LineString(r['points']) for r in roads])
all_buildings = unary_union([Polygon(b['points']) for b in source['buildings']
                            if Polygon(b['points']).distance(retail_shape) < 50])
public = unary_union([LineString(r['points']).buffer(widths[r['id']] / 2, quad_segs=4)
                      for r in roads]).difference(all_buildings.buffer(0.12))
core_map = json.loads((ROOT / 'src/components/liuzhou/map.json').read_text(encoding='utf8'))
core_road_ids = {r['id'] for r in core_map['features'] if r.get('highway')}
motor_polys = []
road_widths = {}
for r in source['roads']:
    tags = r['tags']
    if tags.get('highway') in ['pedestrian', 'footway', 'path', 'cycleway', 'steps'] or not tags.get('highway'):
        continue
    width = (15 if tags['highway'] == 'secondary' else 12 if tags['highway'] == 'tertiary' else 5) if r['id'] in core_road_ids else (16 if tags['highway'] in ['primary', 'trunk'] else 13 if tags['highway'] == 'secondary' else 10 if tags['highway'] == 'tertiary' else 6)
    road_widths[r['id']] = width
    line = LineString(r['points'])
    if line.distance(retail_shape) < width + 10:
        motor_polys.append(line.buffer(width / 2, cap_style=2, join_style=2))
motor = unary_union(motor_polys)
crossings = public.intersection(motor).intersection(lines.buffer(1.8, cap_style=2))
public = public.difference(motor)
openings = unary_union([LineString(e['points']).buffer(e['width'] / 2 + 1.8)
                       for e in under['entrances']])
public = public.difference(openings)

# Source road corridors define the additional western pavement. Nothing in
# landuse=retail alone establishes public access to the whole block.
west_road_ids = ['196166777', '205654192', '1275168862', '1275168860', '1275168898']
west_roads = [next(r for r in source['roads'] if r['id'] == identifier) for identifier in west_road_ids]
frontage = unary_union([LineString(r['points']).buffer(road_widths[r['id']] / 2 + 4.5, cap_style=2, join_style=2)
                       for r in west_roads]).intersection(retail_shape)
frontage = frontage.difference(motor).difference(all_buildings.buffer(.12)).difference(openings)
public = public.union(frontage)
facade_axes = lines.union(unary_union([LineString(r['points']) for r in west_roads]))


def parts(shape, kind):
    if shape.is_empty:
        return []
    if shape.geom_type == kind:
        return [shape]
    return [p for g in getattr(shape, 'geoms', []) for p in parts(g, kind)]


# Routes are clipped portions of the real axes/offsets, with every resulting
# segment identified. These are test paths, not surveyed sidewalk boundaries.
west_walk_routes = {}
for name, identifier, offset in [('gongyuan-south', '196166777', -8.25),
                                 ('service-north', '205654192', -5.25),
                                 ('south-passage', '205639717', 0)]:
    road = next(r for r in source['roads'] if r['id'] == identifier)
    axis = LineString(road['points'])
    route = axis.offset_curve(offset, join_style=2) if offset else axis
    clipped = route.intersection(retail_shape.buffer(-.8)).difference(all_buildings.buffer(1)).difference(openings.buffer(.8))
    for i, part in enumerate(sorted(parts(clipped, 'LineString'), key=lambda p: p.project(Point(route.coords[0])))):
        if part.length < 20:
            continue
        west_walk_routes[f'{name}-{i + 1}'] = {'sourceId': identifier, 'offsetMeters': offset,
                                              'points': [[round(x, 5), round(z, 5)] for x, z in part.coords]}

# Only six small, explicitly inferred low-rise shop volumes: source commercial
# shells take precedence, and the public corridors remain clear. Their aprons
# connect to the estimated roadside paving; no private interior is invented.
clear = retail_shape.buffer(-2).intersection(box(-700, -300, -480, 200))
clear = clear.difference(all_buildings.buffer(3)).difference(motor.buffer(3)).difference(public.buffer(2)).difference(openings.buffer(2))
clear = clear.difference(unary_union([LineString(r['points']).buffer(2) for r in west_walk_routes.values()]))
infill, occupied = [], []
for component in sorted(parts(clear, 'Polygon'), key=lambda p: -p.area):
    count = 0
    for width, depth in [(24, 12), (18, 10), (12, 9)]:
        candidates = []
        min_x, min_z, max_x, max_z = component.bounds
        for x in range(math.ceil(min_x + width / 2), math.floor(max_x - width / 2) + 1, 2):
            for z in range(math.ceil(min_z + depth / 2), math.floor(max_z - depth / 2) + 1, 2):
                shape = box(x - width / 2, z - depth / 2, x + width / 2, z + depth / 2)
                gap = shape.distance(public)
                if gap < 3.8 and component.covers(shape):
                    candidates.append((gap, x, z, shape))
        for _, x, z, shape in sorted(candidates, key=lambda v: v[:3]):
            if any(shape.distance(other) < 8 for other in occupied):
                continue
            occupied.append(shape); count += 1
            infill.append({'id': f'wuxing-west-infill-{len(infill) + 1}', 'points': [[round(x, 5), round(z, 5)] for x, z in shape.exterior.coords],
                           'height': 6.4 if len(infill) % 2 else 9.6, 'heightSource': 'estimated', 'geometryStatus': 'estimated footprint',
                           'color': '#bfb39a', 'tags': {'building': 'retail'}, 'name': ''})
            if count == 2 or len(infill) == 6:
                break
        if count == 2 or len(infill) == 6:
            break
    if len(infill) == 6:
        break
infill_shape = unary_union(occupied)
aprons = infill_shape.buffer(4, join_style=2).intersection(retail_shape)
aprons = aprons.difference(all_buildings.buffer(.12)).difference(infill_shape.buffer(.12)).difference(motor).difference(openings)
public = public.union(aprons).difference(infill_shape.buffer(.12))
all_buildings = all_buildings.union(infill_shape)


def faces(shape):
    return [[[round(x, 5), round(z, 5)] for x, z in list(f.exterior.coords)[:-1]]
            for f in constrained_delaunay_triangles(shape).geoms if f.area > 1e-8]


# Only attach a shop front to a real building edge facing a mapped public path.
# Projecting details and all sign texts are authored, not an inventory of shops.
facades = []
for b in buildings + infill:
    poly = Polygon(b['points'])
    for i, (a, c) in enumerate(zip(b['points'], b['points'][1:])):
        edge = LineString([a, c]); length = edge.length
        # Western source blocks include road setbacks over sixteen metres.
        # Preserve those footprints and decorate the exposed road-facing edge.
        frontage_distance = 24 if b['id'] in west_ids else 16
        if length < 3 or edge.distance(facade_axes) > frontage_distance:
            continue
        dx, dz = (c[0] - a[0]) / length, (c[1] - a[1]) / length
        normal = [-dz, dx]
        midpoint = edge.interpolate(0.5, normalized=True)
        if poly.contains(Point(midpoint.x + normal[0] * .1, midpoint.y + normal[1] * .1)):
            normal = [-normal[0], -normal[1]]
        # Inner/back edges close to an axis are still not street facades when
        # their outside face looks into another portion of the same building.
        outward = Point(midpoint.x + normal[0] * .8, midpoint.y + normal[1] * .8)
        if all_buildings.contains(outward) or outward.distance(facade_axes) > midpoint.distance(facade_axes) + .05:
            continue
        facades.append({'id': b['id'] + '-' + str(i), 'buildingId': b['id'],
                        'a': a, 'b': c, 'outward': normal})

# Some archived mall and attached-building rings share an exterior edge.
# Retain both source shells, but draw one set of window bands on that edge.
# A taller source shell owns the detail; a lower named shell keeps its sign.
detail_fronts = []
for front in facades:
    edge = LineString([front['a'], front['b']])
    # A neighbouring attached shell may cover only part of a long mall edge.
    # Split at its source vertices before choosing a single exterior owner.
    cuts = {0., edge.length}
    for b in buildings + infill:
        for vertex in b['points']:
            if edge.distance(Point(vertex)) < .025:
                cuts.add(edge.project(Point(vertex)))
    cuts = sorted(cuts)
    for i, (lo, hi) in enumerate(zip(cuts, cuts[1:])):
        if hi - lo < .05:
            continue
        a, c = edge.interpolate(lo), edge.interpolate(hi)
        piece = LineString([a, c])
        owners = [b for b in buildings + infill
                  if piece.difference(Polygon(b['points']).boundary.buffer(.035)).length < .02]
        owner = max(owners, key=lambda b: (b['height'], b['id']))
        detail_fronts.append({**front, 'id': front['id'] if len(cuts) == 2 else front['id'] + '-part-' + str(i),
                              'a': [round(a.x, 5), round(a.y, 5)], 'b': [round(c.x, 5), round(c.y, 5)],
                              'detailOwnerId': owner['id']})
facades = detail_fronts

approach_axes = {r['id']: LineString(r['points']) for r in roads}
approach_axes.update({key: LineString(r['points']) for key, r in west_walk_routes.items()})
approaches = []
for b in infill:
    candidates = []
    for f in [f for f in facades if f['buildingId'] == b['id']]:
        outside = Point((f['a'][0] + f['b'][0]) / 2 + f['outward'][0] * 2.2,
                        (f['a'][1] + f['b'][1]) / 2 + f['outward'][1] * 2.2)
        for key, axis in approach_axes.items():
            start = axis.interpolate(axis.project(outside))
            line = LineString([start, outside])
            if line.length > 25 or line.buffer(.65).intersects(all_buildings) or line.buffer(1.3).intersects(openings) or line.buffer(1.3).intersects(motor):
                continue
            candidates.append((line.length, key, f['id'], start, outside))
    assert candidates, f'no ordinary public approach to {b["id"]}'
    _, key, face_id, start, outside = min(candidates, key=lambda c: c[:3])
    approaches.append({'buildingId': b['id'], 'routeId': key, 'facadeId': face_id,
                       'points': [[round(p.x, 5), round(p.y, 5)] for p in [start, outside]],
                       'geometryStatus': 'estimated connection to source-derived walking line'})
approach_lines = unary_union([LineString(a['points']) for a in approaches])
public = public.union(approach_lines.buffer(1.3, cap_style=2)).difference(all_buildings.buffer(.12)).difference(motor).difference(openings)

furniture = []
used = []
for road in roads + west_roads:
    line = LineString(road['points'])
    for n in range(18, int(line.length) - 8, 28):
        a, c = line.interpolate(n - .1), line.interpolate(n + .1)
        length = a.distance(c); dx, dz = (c.x - a.x) / length, (c.y - a.y) / length
        p = line.interpolate(n)
        offset = widths[road['id']] / 2 - 1 if road['id'] in widths else road_widths[road['id']] / 2 + 3.75
        for side in [-1, 1]:
            q = Point(p.x - dz * side * offset, p.y + dx * side * offset)
            if not public.covers(q.buffer(.9 if road['id'] in widths else .72)) or q.distance(lines) < 2.5:
                continue
            if all_buildings.distance(q) < 1.4 or any(q.distance(v) < 10 for v in used):
                continue
            if approach_lines.distance(q) < 1.8:
                continue
            used.append(q)
            furniture.append({'point': [round(q.x, 5), round(q.y, 5)],
                              'angle': -math.atan2(dz, dx),
                              'kind': 'bench' if len(used) % 3 == 0 else 'tree' if len(used) % 3 == 1 else 'lamp'})

surfaces = []
for x in range(-604, -300, 4):
    for z in range(-292, 196, 4):
        tile = box(x, z, x + 4, z + 4).intersection(public)
        color = '#ada28c' if x % 20 == 0 or z % 24 == 0 else '#c4b59c'
        surfaces.extend({'points': f, 'color': color} for f in faces(tile))
# Inferred crossing paint only at intersections of source pedestrian/road axes;
# the underlying carriageway stays visible instead of a plaza covering it.
for x in range(-604, -300, 1):
    stripes = box(x, -292, x + .45, 168).intersection(crossings)
    surfaces.extend({'points': f, 'color': '#d8ccb0'} for f in faces(stripes))

sculpture = None
for path in sorted((ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz')):
    for node in ET.fromstring(gzip.decompress(path.read_bytes())).findall('node'):
        if node.get('id') == '2065206730':
            sculpture = {'id': node.get('id'), 'point': [round((float(node.get('lon')) - 109.41225) * 101458, 3), round((24.31415 - float(node.get('lat'))) * 111320, 3)],
                         'tags': {t.get('k'): t.get('v') for t in node.findall('tag')}}
    if sculpture:
        break
assert sculpture is not None
walk_routes = {}
for road in roads:
    route = []
    for p in road['points']:
        if math.dist(p, sculpture['point']) < .01:
            route.append([-420.3, -41.2])
        elif math.dist(p, [-572.974, -13.258]) < .01:
            # The source axis meets a north-facing stair. Walk around its
            # sidewalls to reach the front instead of passing through the wall.
            route.extend([[-568, -9], [-573, -9], [-579, -9]])
        else:
            route.append(p)
    walk_routes[road['id']] = route
walk_routes['1351248947'] = [roads[[r['id'] for r in roads].index('1351248947')]['points'][0],
                             [-410, -43.4], [-412.5, -38.5], [-419.5, -38.5], [-420.3, -41.2]]
render_parts = []
for b in buildings:
    poly = Polygon(b['points'])
    covering = [other for other in buildings if (other['height'], other['id']) > (b['height'], b['id'])
                and poly.intersection(Polygon(other['points'])).area > .001]
    if not covering:
        continue
    visible = poly.difference(unary_union([Polygon(other['points']) for other in covering]))
    render_parts.append({'id': b['id'], 'coveredBy': [other['id'] for other in covering],
                         'parts': [{'points': [[round(x, 8), round(z, 8)] for x, z in list(p.exterior.coords)[:-1]],
                                    'holes': [[[round(x, 8), round(z, 8)] for x, z in list(h.coords)[:-1]] for h in p.interiors]}
                                   for p in parts(visible, 'Polygon') if p.area > .000001]})
output = {'version': 2, 'license': 'ODbL-1.0; OpenStreetMap contributors',
          'note': 'Source axes and building rings are unchanged. All heights, paving widths, facades, furniture and residents are estimated; no survey or current shop inventory was obtained.',
          'retail': retail, 'sourceRoads': roads, 'buildings': buildings,
          'sourceSha256': hashlib.sha256((ROOT / 'src/components/liuzhou/city-map.json').read_bytes()).hexdigest(),
          'westSourceIds': west_ids, 'westSourceRoads': west_roads, 'westRoadWidths': {r['id']: road_widths[r['id']] for r in west_roads},
          'infillBuildings': infill, 'westWalkRoutes': west_walk_routes, 'shopApproaches': approaches, 'renderParts': render_parts,
          'surfaces': surfaces, 'facades': facades, 'furniture': furniture, 'sculpture': sculpture,
          'routes': {r['id']: r['points'] for r in roads}, 'walkRoutes': walk_routes}
text = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in ['src/components/liuzhou/wuxing-layout.json', 'public/games/liuzhou/wuxing-layout.json']:
    (ROOT / target).write_text(text, encoding='utf8')
print(json.dumps({'buildings': len(buildings), 'facades': len(facades),
                  'infillBuildings': len(infill), 'westWalkRoutes': len(west_walk_routes),
                  'pavingArea': public.area, 'surfaces': len(surfaces), 'furniture': len(furniture)}))
