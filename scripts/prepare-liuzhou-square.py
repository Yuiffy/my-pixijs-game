"""Recover People's Square multipolygon, including its fountain, offline.

Source boundaries are preserved separately from estimated approach paving,
landscaping and furniture. No pool depth, detailed elevation or survey is known.
"""
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
raw = gzip.decompress((ROOT / 'data/liuzhou/open/osm/skyline-core.osm.gz').read_bytes())
osm = ET.fromstring(raw)
nodes = {n.attrib['id']: n for n in osm.findall('node')}
ways = {w.attrib['id']: w for w in osm.findall('way')}
relation = next(r for r in osm.findall('relation') if r.attrib['id'] == '9600586')


def ring(identifier):
    refs = [n.attrib['ref'] for n in ways[identifier].findall('nd')]
    assert refs[0] == refs[-1] and all(ref in nodes for ref in refs)
    return [[round((float(nodes[ref].attrib['lon']) - 109.41225) * 101458, 3),
             round((24.31415 - float(nodes[ref].attrib['lat'])) * 111320, 3)] for ref in refs]


members = [(m.attrib['ref'], m.attrib['role']) for m in relation.findall('member')]
assert members == [('583907191', 'outer'), ('205658310', 'inner')]
outer, fountain_ring = ring('583907191'), ring('205658310')
square = Polygon(outer, [fountain_ring])
fountain = Polygon(fountain_ring)
assert square.is_valid and fountain.is_valid
# Keep the previously explored cultural-building approaches, but do not label
# this envelope (or the area beyond the source outer ring) as a surveyed square.
roof_ids = ['899710007', '899710008']
mall_source = next(b for b in source['buildings'] if b['id'] == '566345463')
retail_source = next(a for a in source['areas'] if a['id'] == '899710010')
# Rebuild only the near-street mall frontage inside the archived retail parcel.
# This is an estimated access strip, not a claim of public parcel ownership.
north_approach = Polygon(retail_source['points']).intersection(
    Polygon(mall_source['points']).buffer(13, join_style=2)).intersection(box(-775, -1055, -590, -963))
base_envelope = box(-766, -913, -365, -555).union(Polygon(outer))
envelope = base_envelope.union(north_approach)
buildings = [b for b in source['buildings'] if Polygon(b['points']).intersects(envelope)]
obstacles = [Polygon(b['points']).buffer(0.65) for b in buildings if b['id'] not in roof_ids]
road_ids = []
for road in source['roads']:
    tags = road['tags']
    if tags.get('railway') == 'platform' or tags.get('highway') in ['pedestrian', 'footway', 'path', 'cycleway']:
        continue
    width = 16 if tags['highway'] in ['primary', 'trunk'] else 13 if tags['highway'] == 'secondary' else 10 if tags['highway'] == 'tertiary' else 6
    line = LineString(road['points'])
    if line.distance(envelope) < width:
        obstacles.append(line.buffer(width / 2 + 0.5, quad_segs=4))
        road_ids.append(road['id'])
obstacles = unary_union(obstacles)
public_square = square.difference(obstacles)
approaches = envelope.difference(Polygon(outer)).difference(obstacles)
public = public_square.union(approaches)
frontage_ids = ['205657493', '205657490', '205657494', '205657496', '566345463']
frontages = [b for b in buildings if b['id'] in frontage_ids]
# Estimated apron bands beside archived building outlines distinguish the
# east-side commercial frontage from the broad cultural-building approaches.
# They only recolor existing public paving; no roads, parcels or buildings move.
frontage_aprons = unary_union([Polygon(b['points']).buffer(3.8, join_style=2)
                              for b in frontages]).intersection(approaches)


def faces(geometry):
    return [[[round(x, 5), round(z, 5)] for x, z in list(face.exterior.coords)[:-1]]
            for face in constrained_delaunay_triangles(geometry).geoms if face.area > 1e-8]


# Estimated narrow planting strips leave two unobstructed north/south promenades
# and generous east/west approaches. They are not source landuse polygons.
lawns = []
trees = []
benches = []
for x in [-649, -510]:
    for z in [-865, -785, -705, -625]:
        lawn = box(x - 6, z - 23, x + 6, z + 23).intersection(public_square)
        if lawn.area > 3:
            lawns.append(lawn)
        for dz in [-14, 14]:
            p = Point(x, z + dz)
            if public_square.covers(p.buffer(3.5)):
                trees.append([x, z + dz])
        bx = x + (10 if x < -600 else -10)
        if public_square.covers(box(bx - 0.7, z - 1.2, bx + 0.7, z + 1.2)):
            benches.append([bx, z])
lawns = unary_union(lawns)
frontage_trees = []
frontage_benches = []
for x, z in [(-476, -705), (-476, -680), (-446, -654), (-446, -610),
             (-421, -573), (-457, -586), (-477, -749),
             (-704, -978), (-662, -978), (-766, -1028)]:
    # A clear walking corridor is retained around every isolated planter.
    # No claim is made that a tree or bench occupies this exact real-world spot.
    if approaches.covers(Point(x, z).buffer(2)):
        frontage_trees.append([x, z])
        p = box(x - .7, z + 3, x + .7, z + 5.4)
        if approaches.covers(p):
            frontage_benches.append([x, z + 4.2])
trees.extend(frontage_trees)
benches.extend(frontage_benches)
surfaces = []
# Narrow estimated stone bands replace the previous entire 8-metre dark cells.
# Fine 0.6 x 0.9 m slab joints are drawn by a repeated texture in SquareView.
bands = unary_union([box(x, -920, x + .45, -540) for x in range(-648, -490, 24)]
                    + [box(-670, z, -490, z + .45) for z in range(-900, -540, 24)])
for shape, color, kind in [(public_square.difference(lawns).difference(bands), '#c7c1ad', 'square'),
                           (public_square.difference(lawns).intersection(bands), '#999a8b', 'band'),
                           (approaches.difference(frontage_aprons), '#b6b4a3', 'approach'),
                           (frontage_aprons, '#a39d8b', 'approach'), (lawns, '#718760', 'lawn')]:
    surfaces.extend({'points': face, 'color': color, 'kind': kind} for face in faces(shape))
assert abs(sum(Polygon(s['points']).area for s in surfaces) - public.area) < 0.05
assert public.intersection(fountain).area < 1e-7
# An inactive, flush fountain installation shows only its mapped footprint and
# estimated metal outlets. Avoid invented standing-water levels on coarse DEM.
fountain_border = fountain.difference(fountain.buffer(-.35, join_style=2))
fountain_surfaces = [{'points': face, 'color': color} for shape, color in [
    (fountain_border, '#8e9289'), (fountain.buffer(-.35, join_style=2), '#687773')]
                     for face in faces(shape)]
nozzles = []
for z in range(-662, -608, 4):
    for x in [-579, -574]:
        if fountain.covers(Point(x, z).buffer(.3)):
            nozzles.append([x, z])

# The source tower sits inside a larger podium and shares part of its exterior.
# Keep both original source/collision footprints. Only subtract the overlapping
# render volume, so the same low exterior wall is not rasterized twice.
tower = Polygon(next(b for b in source['buildings'] if b['id'] == '899710004')['points'])
podium = Polygon(next(b for b in source['buildings'] if b['id'] == '434067129')['points'])
podium_visible = podium.difference(tower)
assert tower.difference(podium).area < 1e-7
polygons = [podium_visible] if podium_visible.geom_type == 'Polygon' else list(podium_visible.geoms)
parts = [{'points': list(p.exterior.coords)[:-1], 'holes': [list(h.coords)[:-1] for h in p.interiors]} for p in polygons]
external = podium.boundary.difference(tower)
lines = [external] if external.geom_type == 'LineString' else list(external.geoms)
facade_edges = [[a, b] for line in lines for a, b in zip(list(line.coords), list(line.coords)[1:]) if Point(a).distance(Point(b)) > .01]
render_overrides = {'city-osm-434067129': {
    'sourceIds': ['434067129', '899710004'],
    'reason': 'Render-only podium minus tower; original physical footprints are retained.',
    'parts': parts, 'facadeEdges': facade_edges,
    'sourceArea': podium.area, 'renderedArea': podium_visible.area,
    'overlapArea': podium.intersection(tower).area,
    'sharedBoundaryLength': podium.boundary.intersection(tower.boundary).length,
}}

output = {
    'license': 'ODbL-1.0; OpenStreetMap contributors',
    'note': 'Square outer ring and fountain hole come from archived OSM relation 9600586. Approach envelope, all furniture, landscaping, sculpture position, inactive fountain details and facade dimensions are estimated. No detailed elevation or pool survey has been acquired.',
    'envelopeEstimated': list(base_envelope.exterior.coords),
    'envelopesEstimated': [list(p.exterior.coords) for p in ([envelope] if envelope.geom_type == 'Polygon' else envelope.geoms)],
    'sourceSquare': {'relationId': '9600586', 'outerWayId': '583907191', 'outer': outer,
                     'innerWayIds': ['205658310'], 'holes': [fountain_ring],
                     'area': round(square.area, 5), 'archive': 'data/liuzhou/open/osm/skyline-core.osm.gz',
                     'rawSha256': hashlib.sha256(raw).hexdigest()},
    'sourceFountain': {'id': '205658310', 'points': fountain_ring, 'area': round(fountain.area, 5),
                       'detailStatus': 'estimated inactive flush installation; no measured pool geometry',
                       'surfaces': fountain_surfaces, 'nozzles': nozzles},
    'sourceBuildingIds': [b['id'] for b in buildings], 'sourceRoadIds': road_ids,
    'frontage': {'sourceIds': frontage_ids, 'area': round(frontage_aprons.area, 5),
                 'surfaces': faces(frontage_aprons), 'trees': frontage_trees, 'benches': frontage_benches,
                 'detailStatus': 'OSM building names/outlines; estimated facade/apron/furniture, unchanged default heights'},
    'northApproach': {'retailSourceId': retail_source['id'], 'retailSourcePoints': retail_source['points'],
                      'mallSourceId': mall_source['id'], 'estimatedEnvelope': faces(north_approach),
                      'detailStatus': 'Estimated near-street access strip inside archived retail parcel; no claim of surveyed access/ownership'},
    'sourceRoofs': [{'id': b['id'], 'points': b['points'], 'tags': b['tags'],
                     'detailStatus': 'Source open-roof plan; roof elevation, thickness and supporting columns estimated'}
                    for b in source['buildings'] if b['id'] in roof_ids],
    'buildingRenderOverrides': render_overrides,
    'publicArea': round(public.area, 5), 'sourceSquarePublicArea': round(public_square.area, 5),
    'estimatedApproachArea': round(approaches.area, 5), 'surfaces': surfaces,
    'trees': trees, 'benches': benches,
    'surnameCentre': [-576, -704],
    'walks': {
        'square-walker-west': [[-628, -580], [-628, -690], [-628, -780], [-628, -690]],
        'square-walker-east': [[-530, -605], [-530, -700], [-530, -820], [-530, -700]],
    },
}
text = json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n'
for target in ['src/components/liuzhou/square-layout.json', 'public/games/liuzhou/square-layout.json']:
    (ROOT / target).write_text(text, encoding='utf8')
print(json.dumps({'publicArea': output['publicArea'], 'faces': len(surfaces), 'trees': len(trees), 'benches': len(benches)}))
