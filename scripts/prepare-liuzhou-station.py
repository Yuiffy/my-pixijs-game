"""Partition the archived OSM station footprint; keep geometry and estimates separate."""
import json
import math
from pathlib import Path
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Polygon, box
from shapely.ops import triangulate, unary_union

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
station = next(b for b in source['buildings'] if b['id'] == '632407338')
origin = [-2928, 390]
length = math.hypot(-0.538, 0.843)
along = [-0.538 / length, 0.843 / length]
outward = [along[1], -along[0]]


def local(p):
    x, z = p[0] - origin[0], p[1] - origin[1]
    return [x * along[0] + z * along[1], x * outward[0] + z * outward[1]]


def world(p):
    return [round(origin[0] + along[0] * p[0] + outward[0] * p[1], 6),
            round(origin[1] + along[1] * p[0] + outward[1] * p[1], 6)]


outline = Polygon([local(p) for p in station['points']])
parts = []
for name, low, high, base, top, ridge, centre in [
    ('west', -1000, -75, 8, 27, 5, -120),
    ('concourse', -75, 70, 20, 28, 3, 0),
    ('east', 70, 1000, 6, 26, 6, 110),
]:
    polygon = outline.intersection(box(-1000, low, 1000, high))
    assert polygon.geom_type == 'Polygon' and not polygon.interiors
    uv = list(polygon.exterior.coords)[:-1]
    # A shallow metal hip roof: dimensions/vertical profile are reconstruction,
    # while its plan is clipped to the unmodified source station footprint.
    def roof_height(u, v):
        if name == 'concourse':
            return top + ridge * max(0, 1 - abs(u - 4) / 68)
        return top + ridge * max(0, 1 - max(abs(u) / 145, abs(v - centre) / 48))
    faces = []
    min_u, min_v, max_u, max_v = polygon.bounds
    for u in range(math.floor(min_u / 6) * 6, math.ceil(max_u / 6) * 6, 6):
        for v in range(math.floor(min_v / 6) * 6, math.ceil(max_v / 6) * 6, 6):
            cell = polygon.intersection(box(u, v, u + 6, v + 6))
            if cell.is_empty or cell.area < 1e-8:
                continue
            for face in triangulate(cell):
                if not cell.covers(face.representative_point()):
                    continue
                faces.append([[*world(p), round(roof_height(*p), 6)] for p in list(face.exterior.coords)[:-1]])
    parts.append({'name': name, 'footprint': [world(p) for p in uv], 'baseY': base, 'topY': top,
                  'roof': faces, 'estimatedVertical': True})
assert abs(sum(Polygon(p['footprint']).area for p in parts) - outline.area) < 0.01
plaza = next(a for a in source['areas'] if a['id'] == '1290673537')
carriageways = []
for road in source['roads']:
    tags = road['tags']
    if tags.get('railway') == 'platform' or tags.get('highway') in ['pedestrian', 'footway', 'path', 'cycleway']:
        continue
    width = 16 if tags['highway'] in ['primary', 'trunk'] else 13 if tags['highway'] == 'secondary' else 10 if tags['highway'] == 'tertiary' else 6
    line = LineString(road['points'])
    if line.distance(Polygon(plaza['points'])) < width:
        carriageways.append(line.buffer(width / 2 + 0.4, quad_segs=4))
paving = Polygon(plaza['points']).difference(unary_union(carriageways))
paving_faces = [[list(p) for p in list(face.exterior.coords)[:-1]]
                for face in constrained_delaunay_triangles(paving).geoms]
assert abs(sum(Polygon(face).area for face in paving_faces) - paving.area) < 1e-5
platforms = [r for r in source['roads'] if r['tags'].get('railway') == 'platform' and r['tags'].get('area') == 'yes'
             and any(-3120 < p[0] < -2680 and 100 < p[1] < 660 for p in r['points'])]
output = {'sourceWay': station['id'], 'sourceArea': plaza['id'], 'license': 'ODbL-1.0; OpenStreetMap contributors',
          'origin': origin, 'along': along, 'outward': outward,
          'note': 'Horizontal footprint/area/platform rings retain OSM. Partitions, all heights, roofs and furniture are estimated reconstruction.',
          'parts': parts, 'eastPlaza': plaza['points'], 'eastPaving': paving_faces, 'platforms': platforms}
text = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for name in ['src/components/liuzhou/station-layout.json', 'public/games/liuzhou/station-layout.json']:
    (ROOT / name).write_text(text, encoding='utf8')
print(json.dumps({'parts': len(parts), 'roofFaces': sum(len(p['roof']) for p in parts), 'platforms': len(platforms)}))
