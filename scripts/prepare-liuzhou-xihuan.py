"""Rebuild Xihuan/Eshan junction from the preserved OSM sources, offline.

Axes, crossings, signal nodes, bus platform and parcel outlines are source data.
Lane widths, pavement extent, fences, planting and all furniture are estimates.
Source building footprints are preserved; facade details and internal courtyard
layouts are authored estimates. No terrain heights are manufactured here.
"""
import gzip
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import nearest_points, unary_union

ROOT = Path(__file__).resolve().parents[1]
city = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
nodes, ways = {}, {}
for path in sorted((ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz')):
    tree = ET.fromstring(gzip.decompress(path.read_bytes()))
    nodes.update({n.attrib['id']: n for n in tree.findall('node')})
    ways.update({w.attrib['id']: w for w in tree.findall('way')})


def point(node):
    return [round((float(node.attrib['lon']) - 109.41225) * 101458, 3),
            round((24.31415 - float(node.attrib['lat'])) * 111320, 3)]


def tags(element):
    return {t.attrib['k']: t.attrib['v'] for t in element.findall('tag')}


def ring(ident):
    return [point(nodes[n.attrib['ref']]) for n in ways[ident].findall('nd')]


envelope = box(-3500, -860, -3060, -470)
roads = [r for r in city['roads'] if LineString(r['points']).intersects(envelope)]
# OSM has separate carriageways. Preserve their separate axes and source lanes.
# 3.2 m/lane + 0.8 m edges is an estimate, not a measured road width.
widths = {r['id']: round(int(r['tags']['lanes']) * 3.2 + 0.8, 2) if 'lanes' in r['tags']
          else 16 if r['tags']['highway'] in ['primary', 'trunk'] else 13 if r['tags']['highway'] == 'secondary'
          else 10 if r['tags']['highway'] == 'tertiary' else 6 for r in roads}
road_shapes = [LineString(r['points']).buffer(widths[r['id']] / 2, quad_segs=5) for r in roads]
carriageway = unary_union(road_shapes)
buildings = [Polygon(b['points']) for b in city['buildings'] if Polygon(b['points']).distance(envelope) < 6]
obstacles = unary_union([b.buffer(0.7) for b in buildings])
sidewalk = unary_union([s.buffer(4.4, quad_segs=4) for s in road_shapes]).difference(carriageway.buffer(0.18)).difference(obstacles).intersection(envelope)
parcels = [{'id': ident, 'name': tags(ways[ident]).get('name', ''), 'points': ring(ident)}
           for ident in ['899210203', '1421525099', '1421525106']]
campus = Polygon(parcels[0]['points'])
surfaces = []


def faces(geometry, color, kind, offset):
    for face in constrained_delaunay_triangles(geometry).geoms:
        if face.area < 1e-7:
            continue
        surfaces.append({'points': [[round(x, 5), round(z, 5)] for x, z in list(face.exterior.coords)[:-1]],
                         'color': color, 'kind': kind, 'offset': offset})


faces(campus.difference(obstacles).difference(carriageway.buffer(0.25)), '#80916b', 'campus', 0.19)
faces(sidewalk, '#bcb6a1', 'pavement', 0.23)
faces(carriageway.intersection(envelope), '#586963', 'carriageway', 0.22)


def rectangle(p, tangent, along, across):
    dx, dz = tangent
    return Polygon([[p[0] + dx * a - dz * b, p[1] + dz * a + dx * b]
                    for a, b in [(-along / 2, -across / 2), (along / 2, -across / 2),
                                 (along / 2, across / 2), (-along / 2, across / 2)]])


# Preserve source shells and their existing runtime height rule. The windows,
# balconies and internal paving below are an interpretation, not source survey.
facade_ids = ['546014175', '546014176', '546014177', '1442497610',
              '1442497611', '1442497612', '1442497613', '1442497614',
              '1442497615', '1442497622', '1442497623', '1442497624', '1442497625',
              '1527710222', '1527710223']
frontages = []
for building in city['buildings']:
    if building['id'] not in facade_ids:
        continue
    info = building['tags']
    tagged = info.get('height')
    try:
        height = float(tagged) if tagged else float(info.get('building:levels', '0')) * 3.2
    except ValueError:
        height = 0
    sourced_height = 2 <= height <= 500
    frontages.append({'id': building['id'], 'points': building['points'],
                      'height': height if sourced_height else 10 + int(building['id']) % 6 * 3.2,
                      'heightSource': 'tagged' if sourced_height else 'estimated',
                      'kind': 'school' if info.get('building') == 'school' else
                      'industrial' if info.get('building') == 'industrial' else 'residential'})

# Fill only the open space of archived parcels. Exact internal paths and court
# locations are unknown and must remain marked as estimates in the manifest.
yard_space = {parcel['id']: Polygon(parcel['points']).buffer(-2).difference(obstacles.buffer(0.6))
              .difference(carriageway.buffer(0.8)) for parcel in parcels}
for parcel in parcels[1:]:
    yard = yard_space[parcel['id']]
    faces(yard, '#869179', 'courtyard', 0.185)
    # Sparse paths between source rows. Clipping keeps paving out of the shells.
    direction = [math.cos(-0.5), math.sin(-0.5)]
    for x, z in ([[-3222, -557], [-3205, -531]] if parcel['id'] == '1421525099'
                 else [[-3119, -598], [-3091, -581]]):
        faces(rectangle([x, z], direction, 102, 3.8).intersection(yard), '#b5ad97', 'yardpath', 0.205)

sports = []
for center, along, across, color, name in [([-3506, -632], 54, 30, '#967969', 'estimated-playground'),
                                          ([-3438, -630], 28, 15, '#6e9180', 'estimated-court')]:
    shape = rectangle(center, [1, 0], along, across)
    assert yard_space[parcels[0]['id']].covers(shape.buffer(0.5)), name
    faces(shape, color, 'sports', 0.215)
    border = shape.buffer(-0.3).boundary.buffer(0.055)
    faces(border, '#e3dac1', 'courtLine', 0.23)
    faces(rectangle(center, [1, 0], 0.1, across - 0.6), '#e3dac1', 'courtLine', 0.23)
    circle = Point(center).buffer(1.8 if name == 'estimated-court' else 4.5, quad_segs=16).boundary.buffer(0.055)
    faces(circle, '#e3dac1', 'courtLine', 0.23)
    for side in [-1, 1]:
        length = 5.8 if name == 'estimated-court' else 9
        width = 4.9 if name == 'estimated-court' else 16.5
        box_center = [center[0] + side * (along / 2 - 0.3 - length / 2), center[1]]
        penalty = rectangle(box_center, [1, 0], length, width).boundary.buffer(0.055)
        faces(penalty, '#e3dac1', 'courtLine', 0.23)
    sports.append({'name': name, 'center': center, 'along': along, 'across': across,
                   'points': list(shape.exterior.coords)[:-1], 'estimated': True})

yard_trees = []
paths = unary_union([Polygon(s['points']) for s in surfaces if s['kind'] == 'yardpath'])
for parcel in parcels:
    yard = yard_space[parcel['id']]
    minx, minz, maxx, maxz = yard.bounds
    for ix, x in enumerate(range(math.ceil(minx / 17) * 17, math.floor(maxx), 17)):
        for iz, z in enumerate(range(math.ceil(minz / 19) * 19, math.floor(maxz), 19)):
            p = Point(x, z)
            if (ix + iz) % 3 != 0 or not yard.covers(p.buffer(2.6)) or paths.distance(p) < 2.5:
                continue
            if any(Polygon(s['points']).distance(p) < 4 for s in sports):
                continue
            if parcel['id'] == '899210203' and p.distance(campus.boundary) > 15:
                continue
            yard_trees.append({'point': [x, z], 'parcelId': parcel['id']})


crossings = []
signals = []
for ident, node in nodes.items():
    p = point(node)
    if not envelope.covers(Point(p)):
        continue
    info = tags(node)
    if info.get('highway') not in ['crossing', 'traffic_signals']:
        continue
    containing = [r for r in roads if any(math.dist(p, q) < 0.01 for q in r['points'])]
    if not containing:
        continue
    road = min(containing, key=lambda r: LineString(r['points']).distance(Point(p)))
    pts = road['points']
    i = min(range(len(pts)), key=lambda n: math.dist(p, pts[n]))
    a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
    length = math.dist(a, b)
    tangent = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    record = {'id': ident, 'roadId': road['id'], 'point': p, 'tangent': tangent, 'tags': info}
    if info['highway'] == 'crossing':
        crossings.append(record)
        width = widths[road['id']]
        n = -width / 2 + 0.5
        while n < width / 2 - 0.25:
            q = [p[0] - tangent[1] * n, p[1] + tangent[0] * n]
            faces(rectangle(q, tangent, 3.6, 0.55).intersection(carriageway), '#e6dfc6', 'zebra', 0.26)
            n += 1.15
    else:
        # Signal node is on the carriageway axis. The authored pole is placed
        # on a pavement; do not turn the source node into an obstacle in traffic.
        pavement = sidewalk.buffer(-0.65)
        for previous in signals:
            pavement = pavement.difference(Point(previous['pole']).buffer(1.8))
        pole = nearest_points(Point(p), pavement)[1]
        signals.append({**record, 'pole': [round(pole.x, 5), round(pole.y, 5)]})

for road in roads:
    line = LineString(road['points'])
    lanes = int(road['tags'].get('lanes', max(1, round(widths[road['id']] / 3.2))))
    for n in range(2, int(line.length), 8):
        p = line.interpolate(n)
        if not envelope.contains(p) or any(p.distance(Point(c['point'])) < 8 for c in crossings + signals):
            continue
        if any(r['name'] != road['name'] and p.distance(LineString(r['points'])) < widths[r['id']] / 2 + 3 for r in roads):
            continue
        a, b = line.interpolate(max(0, n - 1)), line.interpolate(n + 1)
        dx, dz = b.x - a.x, b.y - a.y
        length = math.hypot(dx, dz)
        tangent = [dx / length, dz / length]
        for lane in range(1, lanes):
            across = widths[road['id']] * (lane / lanes - 0.5)
            q = [p.x - tangent[1] * across, p.y + tangent[0] * across]
            faces(rectangle(q, tangent, 3.5, 0.12).intersection(envelope), '#ddd9bd', 'lane', 0.255)

# Split each fence along its real parcel ring. Small segments follow the rendered
# terrain independently. Fence heights and gaps have no surveyed source.
fences = []
for parcel in parcels:
    pts = parcel['points']
    for a, b in zip(pts, pts[1:]):
        length = math.dist(a, b)
        count = max(1, math.ceil(length / 6))
        for i in range(count):
            aa = [a[j] + (b[j] - a[j]) * i / count for j in range(2)]
            bb = [a[j] + (b[j] - a[j]) * (i + 1) / count for j in range(2)]
            line = LineString([aa, bb])
            if line.distance(carriageway) < 0.9 or line.distance(obstacles) < 0.15:
                continue
            fences.append({'a': aa, 'b': bb, 'parcelId': parcel['id'], 'height': 2.2 if parcel['id'] == '899210203' else 1.55})

trees = []
for road in roads:
    line = LineString(road['points'])
    for n in range(25, int(line.length), 28):
        p = line.interpolate(n)
        if not envelope.covers(p) or p.distance(Point(-3214, -664)) < 42:
            continue
        a, b = line.interpolate(max(0, n - 1)), line.interpolate(n + 1)
        dx, dz = b.x - a.x, b.y - a.y
        length = math.hypot(dx, dz)
        for side in [-1, 1]:
            q = Point(p.x - dz / length * side * (widths[road['id']] / 2 + 3.2), p.y + dx / length * side * (widths[road['id']] / 2 + 3.2))
            if sidewalk.covers(q.buffer(0.6)) and all(q.distance(Point(t)) > 12 for t in trees) and all(q.distance(LineString([f['a'], f['b']])) > 1 for f in fences) and all(q.distance(Point(s['pole'])) > 3 for s in signals) and q.distance(Point(point(nodes['5917715597']))) > 10:
                trees.append([round(q.x, 4), round(q.y, 4)])

bus_node = nodes['5917715597']
bus_point = point(bus_node)
shelter_point = nearest_points(Point(bus_point), sidewalk.buffer(-1.1))[1]
bus = {'id': '5917715597', 'point': bus_point, 'shelter': [round(shelter_point.x, 5), round(shelter_point.y, 5)], 'sourceTags': tags(bus_node)}
furniture_space = sidewalk.difference(unary_union([LineString([f['a'], f['b']]).buffer(0.7) for f in fences]))
furniture_space = furniture_space.difference(unary_union([Point(p).buffer(1.7) for p in trees]))
signs = []
for x, z, text, angle, kind in [
        (-3315, -628, '柳州市铁二中学', 0.74, 'parcel'), (-3228, -617, '鹅山九区', 0.75, 'parcel'),
        (-3166, -633, '鹅山六区', -0.5, 'parcel'), (-3260, -710, '西环路', -0.56, 'road'),
        (-3198, -620, '鹅山路', -1.06, 'road'), (-3248, -635, '和平路', 0.75, 'road'), (-3180, -691, '磨滩路', 0.75, 'road')]:
    p = nearest_points(Point(x, z), furniture_space.buffer(-1.7 if kind == 'parcel' else -0.5))[1]
    signs.append({'x': round(p.x, 5), 'z': round(p.y, 5), 'text': text, 'angle': angle, 'kind': kind})
neighbour_space = furniture_space.difference(unary_union([Point(s['x'], s['z']).buffer(3) for s in signs]))
neighbour = nearest_points(Point(-3220, -609), neighbour_space.buffer(-0.9))[1]
output = {'license': 'ODbL-1.0; OpenStreetMap contributors',
          'note': 'Source axes, tagged crossing/signal/bus nodes and parcel rings are unchanged. Lane widths, shoulders, fences, shelter and planting are estimated; there is no survey or new height data.',
          'bounds': [-3500, -860, -3060, -470], 'roadWidths': widths,
          'sourceRoads': roads, 'parcels': parcels, 'crossings': crossings, 'signals': signals,
          'busStop': bus, 'surfaces': surfaces, 'fences': fences, 'trees': trees, 'signs': signs,
          'frontages': frontages, 'sports': sports, 'yardTrees': yard_trees,
          'detailSource': 'Building footprint and school/residential parcel rings are archived OSM geometry. Facades, balconies, courtyard planting, paving, playgrounds and court locations are estimated; no measured heights or internal-layout source.',
          'neighbour': [round(neighbour.x, 5), round(neighbour.y, 5)]}
text = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in ['src/components/liuzhou/xihuan-layout.json', 'public/games/liuzhou/xihuan-layout.json']:
    path = ROOT / target
    if not path.exists() or path.read_text(encoding='utf8') != text:
        path.write_text(text, encoding='utf8')
print(json.dumps({'roads': len(roads), 'crossings': len(crossings), 'signals': len(signals), 'fences': len(fences), 'trees': len(trees), 'yardTrees': len(yard_trees), 'frontages': len(frontages), 'faces': len(surfaces)}))
