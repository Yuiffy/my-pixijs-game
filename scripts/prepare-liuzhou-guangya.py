"""Keep Guangya's archived road geometry; derive an estimated shared deck axis.

There is no surveyed longitudinal profile or sidewalk width in these sources.
Paired carriageways are averaged by normalized chainage, never presented as a
new surveyed road. Heights are estimated at runtime from the existing terrain.
"""
import json
import math
from pathlib import Path
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
roads = {r['id']: r for r in source['roads']}


def chain(ids):
    points = []
    for road_id, reverse in ids:
        part = roads[road_id]['points'][::(-1 if reverse else 1)]
        if points:
            assert math.dist(points[-1], part[0]) < 0.002
        points.extend(part if not points else part[1:])
    return LineString(points)


def paired(north, south):
    a, b = chain(north), chain(south)
    fractions = {0, 1}
    for line in [a, b]:
        travelled = 0
        for p, q in zip(line.coords, list(line.coords)[1:]):
            travelled += math.dist(p, q)
            fractions.add(travelled / line.length)
    fractions.update(i / math.ceil(max(a.length, b.length) / 12)
                     for i in range(1, math.ceil(max(a.length, b.length) / 12)))
    result = []
    for t in sorted(fractions):
        point = [round((a.interpolate(t, normalized=True).x + b.interpolate(t, normalized=True).x) / 2, 5),
                 round((a.interpolate(t, normalized=True).y + b.interpolate(t, normalized=True).y) / 2, 5)]
        if not result or math.dist(result[-1], point) > 0.0001:
            result.append(point)
    return result


groups = [
    ('west', [('666310140', False), ('666310155', False)], [('666310154', True), ('480885869', True)]),
    ('main', [('666310141', False)], [('666310142', True)]),
    ('east', [('666310143', False)], [('379031685', True)]),
]
sections = []
for name, north, south in groups:
    axis = paired(north, south)
    sections.append({'name': name, 'sourceIds': [i for i, _ in north + south], 'axis': axis,
                     'length': round(LineString(axis).length, 6)})
assert sections[0]['axis'][-1] == sections[1]['axis'][0]
assert sections[1]['axis'][-1] == sections[2]['axis'][0]

axis = LineString([p for s in sections for p in s['axis']])
crossings = []
crossing_ids = ['666310149', '666310150', '835966480', '205519383', '481085881']
for road_id in crossing_ids:
    road = roads[road_id]
    hit = LineString(road['points']).intersection(axis)
    assert hit.geom_type == 'Point', road_id
    crossings.append({'roadId': road_id, 'name': road['name'],
                      'at': [round(hit.x, 5), round(hit.y, 5)],
                      'chainage': round(axis.project(hit), 6)})

ground_ids = ['666310138', '434067144', '666310144', '196166791']
selected_ids = list(dict.fromkeys([i for _, a, b in groups for i, _ in a + b] + ground_ids + crossing_ids))
walks = []
walk_polygons = []
for road_id in ground_ids:
    points = roads[road_id]['points'][:]
    root = sections[0]['axis'][0] if points[0][0] < -2000 else sections[-1]['axis'][-1]
    if math.dist(points[0], root) > math.dist(points[-1], root):
        points.reverse()
    result = [points[0]]
    remaining = 55
    for a, b in zip(points, points[1:]):
        if remaining <= 0:
            break
        distance = math.dist(a, b)
        t = min(1, remaining / distance)
        result.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        remaining -= distance
    a, b = result[:2]
    first_length = math.dist(a, b)
    dot = ((a[0] - root[0]) * (b[1] - a[1]) - (a[1] - root[1]) * (b[0] - a[0])) / first_length
    offset = math.copysign(40.1 / 2 - 4.2 / 2 - abs(a[1] - root[1]), dot)
    for a, b in zip(result, result[1:]):
        distance = math.dist(a, b)
        nx, nz = (b[1] - a[1]) / distance, -(b[0] - a[0]) / distance
        start = [a[0] + nx * offset, a[1] + nz * offset]
        end = [b[0] + nx * offset, b[1] + nz * offset]
        walks.append({'a': [round(v, 5) for v in start], 'b': [round(v, 5) for v in end], 'width': 4.2})
        walk_polygons.append(Polygon([[p[0] + nx * sign * 2.1, p[1] + nz * sign * 2.1]
                                      for p, sign in [(start, -1), (start, 1), (end, 1), (end, -1)]]))
paving = unary_union(walk_polygons)
carriageways = []
for road in source['roads']:
    highway = road['tags'].get('highway')
    if road['tags'].get('bridge') == 'yes' or highway in ['footway', 'path', 'pedestrian', 'cycleway']:
        continue
    line = LineString(road['points'])
    if line.distance(paving) > 20:
        continue
    width = 16 if highway in ['primary', 'trunk'] else 13 if highway == 'secondary' else 10 if highway == 'tertiary' else 6
    carriageways.append(line.buffer(width / 2 + 0.08, cap_style=2, join_style=2))
carriageway_union = unary_union(carriageways)
paving = paving.difference(carriageway_union)
paving_faces = [[[round(x, 5), round(z, 5)] for x, z in triangle.exterior.coords[:-1]]
                for triangle in constrained_delaunay_triangles(paving).geoms]
# Check the actual serialized faces, including coordinate rounding, rather
# than only trusting the pre-triangulation clipping. The tiny inset absorbs
# the 0.00001m rounding and remains well inside the 0.08m road clearance.
serialized_paving = unary_union([Polygon(face) for face in paving_faces])
assert serialized_paving.area > 100, 'Ground sidewalks unexpectedly disappeared'
assert serialized_paving.intersection(carriageway_union.buffer(-0.0001)).area < 0.00001
assert serialized_paving.symmetric_difference(paving).area < 0.02
layout = {'source': 'data/liuzhou/open/osm/ (city-map.json offline extract)',
          'attribution': source['attribution'], 'license': source['license'],
          'heightStatus': 'estimated from existing terrain, not surveyed',
          'axisStatus': 'mean of paired archived carriageways by normalized chainage',
          'sourceRoads': [roads[i] for i in selected_ids], 'sections': sections,
          'lowerRoads': [r for r in source['roads'] if r['tags'].get('bridge') != 'yes'
                         and r['id'] not in ground_ids and LineString(r['points']).distance(axis) < 32],
          'crossings': crossings, 'groundRoadIds': ground_ids,
          'groundWalks': walks, 'groundWalkPaving': paving_faces,
          'estimatedWidth': 40.1, 'estimatedSidewalkWidth': 4.2}
encoded = (json.dumps(layout, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf8')
for folder in ['src/components/liuzhou', 'public/games/liuzhou']:
    (ROOT / folder / 'guangya-layout.json').write_bytes(encoded)
print(json.dumps({'sourceRoads': len(selected_ids), 'groundPavingArea': serialized_paving.area,
                  'groundPavingFaces': len(paving_faces),
                  'sections': [(s['name'], s['length']) for s in sections],
                  'crossings': crossings}, ensure_ascii=False))
