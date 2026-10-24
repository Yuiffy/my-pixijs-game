"""Enclose six archived station landuse parcels with explicitly estimated interiors.

This is an offline reconstruction, not a building/height survey. Source rings
and public road axes remain untouched; shared parcel boundaries are built once.
"""
import hashlib
import json
import math
from pathlib import Path
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'src/components/liuzhou/city-map.json'
source = json.loads(source_path.read_text(encoding='utf8'))
parcel_ids = ['775896077', '775896078', '775896079', '1274348413', '1274348431', '1274348432']
parcels = [next(a for a in source['areas'] if a['id'] == identifier) for identifier in parcel_ids]
polygons = {p['id']: Polygon(p['points']) for p in parcels}
station = json.loads((ROOT / 'src/components/liuzhou/station-layout.json').read_text(encoding='utf8'))
source_buildings = unary_union([Polygon(b['points']) for b in source['buildings']])
plaza = Polygon(station['eastPlaza'])


def road_width(road):
    kind = road['tags']['highway']
    return 16 if kind in ['primary', 'trunk'] else 13 if kind == 'secondary' else 10 if kind == 'tertiary' else 4 if kind in ['pedestrian', 'footway', 'path', 'cycleway'] else 6


roads = unary_union([LineString(r['points']).buffer(road_width(r) / 2 + 2.2, cap_style=2, join_style=2)
                     for r in source['roads'] if r['tags'].get('bridge') != 'yes'])


def rings(poly):
    return [[round(x, 5), round(z, 5)] for x, z in list(poly.exterior.coords)[:-1]]


def parts(shape, kind):
    if shape.is_empty:
        return []
    if shape.geom_type == kind:
        return [shape]
    return [p for g in getattr(shape, 'geoms', []) for p in parts(g, kind)]


volumes, walls, surfaces, labels = [], [], [], []
for parcel in parcels:
    poly = polygons[parcel['id']]
    assert poly.is_valid
    parcel['existingBuildingIds'] = [b['id'] for b in source['buildings'] if poly.intersection(Polygon(b['points'])).area > 5]
    parcel['infillPolicy'] = 'estimated interiors; source parcel only'
    commercial = parcel['tags']['landuse'] == 'commercial'
    clear = poly.buffer(-5).difference(roads.buffer(1)).difference(source_buildings.buffer(4)).difference(plaza.buffer(3))
    axis = list(poly.minimum_rotated_rectangle.exterior.coords)
    a, b = max(zip(axis, axis[1:]), key=lambda edge: math.dist(*edge))
    angle = math.atan2(b[1] - a[1], b[0] - a[0]); c, s = math.cos(angle), math.sin(angle)
    center = poly.centroid
    local = [((x - center.x) * c + (z - center.y) * s, -(x - center.x) * s + (z - center.y) * c) for x, z in parcel['points']]
    min_x, max_x = min(p[0] for p in local), max(p[0] for p in local)
    min_z, max_z = min(p[1] for p in local), max(p[1] for p in local)
    occupied = []
    # Broad bars leave courts between rows instead of dense roadside boxes.
    for width, depth in ([(40, 18), (24, 16)] if commercial else [(38, 13), (26, 13), (17, 11)]):
        for z in range(math.ceil(min_z + depth / 2 + 7), math.floor(max_z - depth / 2 - 6) + 1, 7):
            for x in range(math.ceil(min_x + width / 2 + 7), math.floor(max_x - width / 2 - 6) + 1, 7):
                shape = Polygon([(center.x + (x + dx) * c - (z + dz) * s, center.y + (x + dx) * s + (z + dz) * c)
                                 for dx, dz in [(-width / 2, -depth / 2), (width / 2, -depth / 2), (width / 2, depth / 2), (-width / 2, depth / 2)]])
                if not clear.covers(shape) or any(shape.distance(other) < 12 for other in occupied):
                    continue
                occupied.append(shape)
                volumes.append({'id': f'station-neighborhood-{parcel["id"]}-{len(occupied)}',
                                'parcelId': parcel['id'], 'points': rings(shape),
                                'height': 9.6 if commercial else 16 + (len(occupied) % 4) * 3.2,
                                'use': 'commercial' if commercial else 'residential',
                                'heightSource': 'estimated', 'geometryStatus': 'inferred'})
    assert occupied, parcel['id']

# Union/noding removes the 149.5m common edge of 775896078/79 before extrusion.
fences = unary_union([poly.boundary for poly in polygons.values()]).difference(roads.buffer(.65)).difference(source_buildings.buffer(1)).difference(plaza.buffer(1))
used_walls = Polygon()
for line in parts(fences, 'LineString'):
    points = list(line.coords)
    for a, b in zip(points, points[1:]):
        length = math.dist(a, b); count = max(1, math.ceil(length / 8))
        owners = [identifier for identifier, poly in polygons.items() if poly.boundary.distance(LineString([a, b]).centroid) < 1e-4]
        assert owners
        for n in range(count):
            start = [a[i] + (b[i] - a[i]) * n / count for i in range(2)]
            end = [a[i] + (b[i] - a[i]) * (n + 1) / count for i in range(2)]
            if math.dist(start, end) < .4:
                continue
            # Trim joints too, so separate wall volumes have no coplanar area.
            shape = LineString([start, end]).buffer(.22, cap_style=2).difference(used_walls)
            for face in parts(shape, 'Polygon'):
                if face.area < .02:
                    continue
                walls.append({'id': f'urban-wall-station-neighborhood-{len(walls)}', 'parcelId': owners[0],
                              'parcelIds': owners, 'points': rings(face), 'height': 2.2,
                              'geometryStatus': 'inferred along source parcel'})
                used_walls = used_walls.union(face)

for parcel in parcels:
    poly = polygons[parcel['id']]
    candidates = []
    # Put names on a public-facing wall, never on the shared internal boundary.
    for wall in walls:
        if wall['parcelIds'] != [parcel['id']]:
            continue
        edges = list(Polygon(wall['points']).exterior.coords)
        a, b = max(zip(edges, edges[1:]), key=lambda edge: math.dist(*edge))
        length = math.dist(a, b)
        if length < 6:
            continue
        x, z = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        nx, nz = (b[1] - a[1]) / length, -(b[0] - a[0]) / length
        if poly.contains(Point(x + nx, z + nz)):
            nx, nz = -nx, -nz
        # The chosen longest polygon edge may be the INSIDE face. Project
        # from the wall centroid to its extreme outer face, then offset out.
        center = Polygon(wall['points']).centroid
        reach = max((px - center.x) * nx + (pz - center.y) * nz for px, pz in wall['points'])
        at = [round(center.x + nx * (reach + .035), 5), round(center.y + nz * (reach + .035), 5)]
        outside = Point(at[0] + nx * 4, at[1] + nz * 4)
        if any(p.covers(outside) for p in polygons.values()) or source_buildings.buffer(1).covers(outside) or plaza.covers(outside):
            continue
        candidates.append((roads.distance(outside), wall, at, nx, nz))
    assert candidates, parcel['id']
    _, wall, at, nx, nz = min(candidates, key=lambda row: row[0])
    labels.append({'parcelId': parcel['id'], 'text': parcel['name'] or '站前商业街区',
                   'wallId': wall['id'], 'at': at, 'angle': math.atan2(nx, nz), 'height': 1.45,
                   'geometryStatus': 'estimated nameplate; unnamed commercial label is descriptive'})
    own = unary_union([Polygon(v['points']) for v in volumes if v['parcelId'] == parcel['id']])
    court = poly.buffer(-.5, join_style=2).difference(roads.buffer(.002, join_style=2)).difference(source_buildings.buffer(.25, join_style=2)).difference(own.buffer(.25, join_style=2)).difference(plaza)
    apron = own.buffer(2, join_style=2).union(poly.boundary.buffer(1.7, join_style=2))
    finishes = [(court.intersection(apron), '#b4b09b'), (court.difference(apron), '#a49d87' if parcel['tags']['landuse'] == 'commercial' else '#939c7f')]
    # Twenty-metre export cells bound draping work, with no visible grid pattern.
    for x in range(math.floor(poly.bounds[0] / 20) * 20, math.ceil(poly.bounds[2]), 20):
        for z in range(math.floor(poly.bounds[1] / 20) * 20, math.ceil(poly.bounds[3]), 20):
            for finish, color in finishes:
                for face in constrained_delaunay_triangles(finish.intersection(box(x, z, x + 20, z + 20))).geoms:
                    if face.area > 1e-7:
                        surfaces.append({'points': rings(face), 'color': color, 'parcelId': parcel['id'], 'geometryStatus': 'estimated courtyard finish'})

solids = source_buildings.union(used_walls).union(unary_union([Polygon(v['points']) for v in volumes]))
walk_routes = {}
for name, identifier, offset in [('egang-north', '835456960', -6.2), ('egang-east', '196282140', -6.2),
                                  ('feie', '793233221', -6.2), ('nanzhan-north', '775894276', -7.7),
                                  ('nanzhan-south', '775894277', -7.7), ('station-east', '775894274', -6.2),
                                  ('south-blocks-west', '793233220', -6.2), ('south-blocks-east', '544112770', -4.2),
                                  ('south-blocks-lane', '544112772', -4.2)]:
    road = next(r for r in source['roads'] if r['id'] == identifier)
    walk = LineString(road['points']).offset_curve(offset, join_style=2)
    # Do not claim a measured sidewalk. This is an authored public-road tour.
    assert walk.buffer(.7).intersection(solids).area < .001, name
    walk_routes[name] = {'sourceId': identifier, 'offsetMeters': offset, 'points': [[round(x, 5), round(z, 5)] for x, z in walk.coords],
                         'geometryStatus': 'estimated walking offset from source road axis'}

output = {'version': 1, 'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
          'license': 'ODbL-1.0; OpenStreetMap contributors',
          'note': 'Six exact source landuse rings. Interior buildings, all heights, fences, finishes and nameplates are estimates. Shared boundaries are extruded once; public road corridors and the source station/plaza are preserved.',
          'parcels': parcels, 'volumes': volumes, 'walls': walls, 'surfaces': surfaces, 'labels': labels, 'walkRoutes': walk_routes}
text = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in ['src/components/liuzhou/station-neighborhood-layout.json', 'public/games/liuzhou/station-neighborhood-layout.json']:
    (ROOT / target).write_text(text, encoding='utf8')
print(json.dumps({k: len(output[k]) for k in ['parcels', 'volumes', 'walls', 'surfaces', 'walkRoutes']}))
