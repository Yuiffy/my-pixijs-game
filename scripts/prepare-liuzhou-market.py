"""Reconstruct the east end of Dongyi Lane from archived horizontal geometry.

OSM supplies the full lane and Liujian residential parcel, but no building
rings or side-alley axes here. All masses, courts, widths and wall heights are
estimates. This offline generator keeps those estimates separate from source.
"""
import json
import math
from pathlib import Path
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
road = next(r for r in source['roads'] if r['id'] == '835966474')
parcel = next(a for a in source['areas'] if a['id'] == '1539716392')
axis = LineString(road['points'])
residential = Polygon(parcel['points'])


def at(along, across=0):
    remaining = max(0, along)
    for a, b in zip(road['points'], road['points'][1:]):
        length = math.dist(a, b)
        if remaining <= length:
            dx, dz = (b[0] - a[0]) / length, (b[1] - a[1]) / length
            return (a[0] + dx * remaining - dz * across,
                    a[1] + dz * remaining + dx * across)
        remaining -= length
    return tuple(road['points'][-1])


def rectangle(along, across, width, depth):
    return Polygon([at(along + x, across + z) for x, z in
                    [(-width / 2, -depth / 2), (width / 2, -depth / 2),
                     (width / 2, depth / 2), (-width / 2, depth / 2)]])


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry] if geometry.area > 1e-6 else []
    return [p for g in getattr(geometry, 'geoms', []) for p in polygons(g)]


def lines(geometry):
    if geometry.geom_type == 'LineString':
        return [geometry]
    return [p for g in getattr(geometry, 'geoms', []) for p in lines(g)]


def rounded(points):
    return [[round(x, 5), round(z, 5)] for x, z in points]


# The other roads set the real junction clearances, not an arbitrary east box.
other_roads = []
road_ids = []
for r in source['roads']:
    if r['id'] == road['id'] or r['tags'].get('highway') in ['pedestrian', 'footway', 'path', 'cycleway']:
        continue
    line = LineString(r['points'])
    if line.distance(axis) < 30:
        width = 16 if r['tags'].get('highway') in ['primary', 'trunk'] else 13 if r['tags'].get('highway') == 'secondary' else 10 if r['tags'].get('highway') == 'tertiary' else 6
        other_roads.append(line.buffer(width / 2 + 0.65, quad_segs=4))
        road_ids.append(r['id'])
junctions = unary_union(other_roads)

# Two estimated shared courts open directly to the known lane. These are
# deliberately not entered into the source road graph as fictitious alleys.
courts = [rectangle(445, side * 23, 44, 30).intersection(residential.buffer(-2))
          for side in [-1, 1]]
court_space = unary_union(courts)
buildings = []
building_polygons = []


def add_building(shape, identifier, height, frontage=False, along=0, side=0):
    shape = shape.difference(junctions.buffer(3))
    for i, ring in enumerate(polygons(shape)):
        if ring.area < 45:
            continue
        # A cut polygon is still an estimated mass, not a surveyed footprint.
        buildings.append({'id': identifier + (f'-{i}' if i else ''),
                          'points': rounded(list(ring.exterior.coords)[:-1]),
                          'h': height, 'frontage': frontage, 'along': along, 'side': side})
        building_polygons.append(ring)


for side in [-1, 1]:
    for i, along in enumerate([307, 341, 375, 409, 481, 515, 545]):
        depth = 14 + i % 3 * 2
        shape = rectangle(along, side * (9.6 + depth / 2), 26, depth)
        if along >= 400:
            shape = shape.intersection(residential.buffer(-2))
        add_building(shape.difference(court_space.buffer(1)), f'market-east-front-{side}-{i}',
                     15.8 + (i % 3) * 3.2, True, along, side)

# Rear residential masses keep the known parcel enclosed without claiming
# the unknown cadastral building positions. Shared courts remain unobstructed.
for x in [-360, -315, -270]:
    for z in [-2104, -2072, -1984, -1958]:
        shape = box(x - 13, z - 8, x + 13, z + 8)
        excluded = unary_union(building_polygons).buffer(5).union(axis.buffer(32)).union(court_space.buffer(4)).union(junctions.buffer(4))
        if residential.buffer(-4).covers(shape) and not shape.intersects(excluded):
            add_building(shape, f'market-east-rear-{x}-{z}', 18.8 if z % 3 else 22)

# Follow each source boundary edge, cut open where it meets the public road.
# Short sections allow both visible wall bases and physics to follow terrain.
wall_space = residential.boundary.difference(axis.buffer(12, join_style=2)).difference(junctions.buffer(2))
walls = []
for line in lines(wall_space):
    # Keep each original corner. A chord over a bend would alter the parcel.
    for a, b in zip(line.coords, list(line.coords)[1:]):
        edge = LineString([a, b])
        count = max(1, math.ceil(edge.length / 3))
        for i in range(count):
            walls.append(rounded([edge.interpolate(i / count, normalized=True).coords[0],
                                  edge.interpolate((i + 1) / count, normalized=True).coords[0]]))

# Dedicated east paving continues both sidewalks around the two source bends
# and stops at the Sanzhong carriageways instead of painting over the junction.
east = LineString([at(280), *road['points'][2:]])
public = east.buffer(9.6, cap_style=2, join_style=2).difference(axis.buffer(3.05, join_style=2))
public = public.union(court_space).difference(junctions).difference(unary_union(building_polygons).buffer(0.1))
surfaces = []
minx, minz, maxx, maxz = public.bounds
for x in range(math.floor(minx / 6) * 6, math.ceil(maxx / 6) * 6, 6):
    for z in range(math.floor(minz / 6) * 6, math.ceil(maxz / 6) * 6, 6):
        tile = public.intersection(box(x, z, x + 6, z + 6))
        for face in constrained_delaunay_triangles(tile).geoms:
            if face.area > 1e-7:
                surfaces.append({'points': rounded(list(face.exterior.coords)[:-1]),
                                 'color': '#b4ae92' if court_space.covers(face.representative_point()) else '#cbc0a4'})

for side in [-1, 1]:
    route = LineString([at(445, side * 6.9), at(445, side * 31),
                        at(459, side * 31), at(459, side * 6.9)])
    assert public.buffer(1e-5).covers(route.buffer(0.65)), 'Court access must join the sidewalk'
assert not unary_union(building_polygons).intersects(axis.buffer(3.7)), 'Keep the source lane clear'

trees = []
for side in [-1, 1]:
    for along in [300, 355, 396, 474, 526]:
        p = Point(at(along, side * 8.6))
        if public.covers(p.buffer(0.8)):
            trees.append({'point': rounded([p.coords[0]])[0], 'along': along, 'side': side})

output = {
    'license': 'ODbL-1.0; OpenStreetMap contributors',
    'note': 'Only sourceRoad and sourceParcel are mapped geometry. All building rings/heights, court passages, pavement widths, wall heights, planting, furniture and frontage are estimated. No mapped side alleys or elevation data were added.',
    'sourceRoad': {'id': road['id'], 'points': road['points'], 'length': round(axis.length, 6)},
    'sourceParcel': parcel, 'junctionRoadIds': road_ids,
    'buildingsEstimated': buildings, 'walls': walls, 'surfaces': surfaces, 'trees': trees,
    'courtsEstimated': [{'side': side, 'points': rounded(list(court.exterior.coords)[:-1]),
                         'walk': rounded([at(445, side * 6.9), at(445, side * 31),
                                          at(459, side * 31), at(459, side * 6.9)])}
                        for side, court in zip([-1, 1], courts)],
}
text = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in ['src/components/liuzhou/market-east-layout.json', 'public/games/liuzhou/market-east-layout.json']:
    (ROOT / target).write_bytes(text.encode('utf8'))
print(json.dumps({'laneMetres': output['sourceRoad']['length'], 'buildings': len(buildings),
                  'wallSegments': len(walls), 'pavingFaces': len(surfaces), 'trees': len(trees)}))
