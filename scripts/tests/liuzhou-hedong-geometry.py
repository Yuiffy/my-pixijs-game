"""Independent checks of the archived Hedong source and serialized geometry.

This does not execute/import the generator or trust its area totals. It reads
the original XML, independently resolves revisions and rebuilds source rings.
Run: python -X utf8 scripts/tests/liuzhou-hedong-geometry.py
"""
import gzip
import hashlib
import json
import math
import unittest
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
LAYOUT = json.loads((ROOT / 'src/components/liuzhou/hedong-layout.json').read_text(encoding='utf8'))
REVISIONS = defaultdict(list)
ARCHIVES = {}
for archive in (ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz'):
    raw = gzip.decompress(archive.read_bytes())
    ARCHIVES[archive.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
    for element in ET.fromstring(raw):
        if element.tag in {'node', 'way', 'relation'}:
            REVISIONS[(element.tag, element.attrib['id'])].append((archive.name, element))


def canonical(element):
    """Compare actual OSM content without request-specific XML metadata."""
    data = {'tags': sorted((t.attrib['k'], t.attrib['v']) for t in element.findall('tag'))}
    if element.tag == 'node':
        data['coordinate'] = (element.attrib['lat'], element.attrib['lon'])
    elif element.tag == 'way':
        data['refs'] = [n.attrib['ref'] for n in element.findall('nd')]
    else:
        data['members'] = [(m.attrib['type'], m.attrib['ref'], m.attrib['role']) for m in element.findall('member')]
    return data


def newest(kind, identifier):
    candidates = REVISIONS[(kind, identifier)]
    version = max(int(element.attrib.get('version', 0)) for _, element in candidates)
    current = [(name, element) for name, element in candidates if int(element.attrib.get('version', 0)) == version]
    # A content conflict at the same OSM version would make filename tie-breaks
    # unsafe. The source archive must be investigated instead of hiding it.
    contents = [canonical(element) for _, element in current]
    assert all(content == contents[0] for content in contents), (kind, identifier, version, [n for n, _ in current])
    return current[0][1]


def source_way(identifier):
    way = newest('way', identifier)
    refs = [n.attrib['ref'] for n in way.findall('nd')]
    points = []
    for ref in refs:
        node = newest('node', ref)
        points.append([round((float(node.attrib['lon']) - 109.41225) * 101458, 3),
                       round((24.31415 - float(node.attrib['lat'])) * 111320, 3)])
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    return {'id': identifier, 'version': int(way.attrib.get('version', 0)), 'refs': refs,
            'points': points, 'tags': tags, 'name': tags.get('name', '')}


def check_source_object(test, actual):
    expected = source_way(actual['id'])
    for key in expected:
        test.assertEqual(actual[key], expected[key], f'way/{actual["id"]} {key}')


SQUARE_RELATION = newest('relation', '8038736')
MEMBERS = [{'id': m.attrib['ref'], 'role': m.attrib['role']} for m in SQUARE_RELATION.findall('member')]
OUTER = Polygon(source_way(next(m['id'] for m in MEMBERS if m['role'] == 'outer'))['points'])
HOLES = [Polygon(source_way(m['id'])['points']) for m in MEMBERS if m['role'] == 'inner']
SQUARE = Polygon(OUTER.exterior.coords, [h.exterior.coords for h in HOLES])
WATER = unary_union([Polygon(source_way(w['id'])['points']) for w in LAYOUT['sourceWater']])
BOUNDS = LAYOUT['boundsEstimated']
REGION = box(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ'])
ALL_AREA_WATER = unary_union([Polygon(source_way(a['id'])['points']) for a in LAYOUT['areas']
                             if a['tags'].get('natural') == 'water']).intersection(REGION)
BUILDINGS = [Polygon(source_way(b['id'])['points']) for b in LAYOUT['buildings']]
ROAD_OBSTACLES = []
for road in LAYOUT['roads']:
    source = source_way(road['id'])
    tags = source['tags']
    if not road['foot'] and tags.get('bridge') != 'yes' and tags.get('tunnel') != 'yes':
        ROAD_OBSTACLES.append(LineString(source['points']).buffer(road['widthEstimated'] / 2 + .55, join_style=2))
OBSTACLES = unary_union(ROAD_OBSTACLES + [shape.buffer(.5) for shape in BUILDINGS])
SURFACE_FACES = defaultdict(list)
for surface in LAYOUT['surfaces']:
    SURFACE_FACES[surface['kind']].append(Polygon(surface['points']))
SURFACES = {kind: unary_union(shapes) for kind, shapes in SURFACE_FACES.items()}
METRICS = {}


class HedongGeometry(unittest.TestCase):
    def test_01_all_archives_and_highest_revisions(self):
        self.assertEqual({a['path']: a['rawSha256'] for a in LAYOUT['archives']}, ARCHIVES)
        compared = 0
        mixed_versions = 0
        for (kind, identifier), revisions in REVISIONS.items():
            versions = {int(element.attrib.get('version', 0)) for _, element in revisions}
            newest(kind, identifier)
            compared += 1
            mixed_versions += len(versions) > 1
        METRICS.update(archiveCount=len(ARCHIVES), sourceObjects=compared, sourceObjectsWithMultipleVersions=mixed_versions)

    def test_02_source_objects_preserve_nodes_tags_and_versions(self):
        all_objects = LAYOUT['roads'] + LAYOUT['buildings'] + LAYOUT['areas'] + LAYOUT['sourceWater']
        all_objects += LAYOUT['bridge']['sourceLanes']
        all_objects += [c['source'] for c in LAYOUT['bridge']['crossings']]
        for group in ['roads', 'buildings', 'areas', 'sourceWater']:
            identifiers = [item['id'] for item in LAYOUT[group]]
            self.assertEqual(len(identifiers), len(set(identifiers)), group)
        for item in all_objects:
            check_source_object(self, item)
        for building in LAYOUT['buildings']:
            shape = Polygon(building['points'])
            self.assertTrue(shape.is_valid)
            self.assertTrue(REGION.covers(shape))
            self.assertEqual(building['points'][0], building['points'][-1])
            self.assertIn('estimated', building['heightStatus'])
        for i, shape in enumerate(BUILDINGS):
            for other in BUILDINGS[i + 1:]:
                self.assertLess(shape.intersection(other).area, .0001, 'overlapping independent building masses')
        METRICS.update(buildingCount=len(BUILDINGS), roadCount=len(LAYOUT['roads']))

    def test_03_square_relation_roles_and_all_ten_holes(self):
        actual = LAYOUT['sourceSquare']
        self.assertEqual(actual['relationId'], '8038736')
        self.assertEqual(actual['version'], int(SQUARE_RELATION.attrib['version']))
        self.assertEqual(actual['members'], MEMBERS)
        self.assertEqual(Counter(m['role'] for m in MEMBERS), {'outer': 1, 'inner': 10})
        check_source_object(self, actual['outer'])
        self.assertEqual([h['id'] for h in actual['holes']], [m['id'] for m in MEMBERS if m['role'] == 'inner'])
        for hole in actual['holes']:
            check_source_object(self, hole)
        self.assertTrue(SQUARE.is_valid)
        self.assertAlmostEqual(actual['area'], SQUARE.area, places=5)
        self.assertLess(unary_union(HOLES).symmetric_difference(WATER.intersection(OUTER)).area, 1e-7)
        self.assertLess(SQUARE.intersection(WATER).area, 1e-7)
        METRICS.update(squareSourceArea=SQUARE.area, basinSourceArea=WATER.area)

    def test_04_serialized_triangles_do_not_overlap(self):
        for kind, faces in SURFACE_FACES.items():
            for face in faces:
                self.assertTrue(face.is_valid, kind)
                self.assertEqual(len(face.exterior.coords), 4, kind)
                self.assertGreater(face.area, 0, kind)
            self.assertLess(abs(sum(face.area for face in faces) - SURFACES[kind].area), .00001, kind)
        kinds = list(SURFACES)
        for i, kind in enumerate(kinds):
            for other in kinds[i + 1:]:
                self.assertLess(SURFACES[kind].intersection(SURFACES[other]).area, .00001, (kind, other))
        METRICS.update(surfaceTriangles=len(LAYOUT['surfaces']))

    def test_05_square_and_basins_cover_their_source_geometry(self):
        expected_square = SQUARE.difference(OBSTACLES)
        expected_basins = WATER.intersection(REGION).difference(OBSTACLES)
        square_error = expected_square.symmetric_difference(SURFACES['square']).area
        basin_error = expected_basins.symmetric_difference(SURFACES['inactive-basin']).area
        # Five-decimal serialized coordinates allow a few square millimetres
        # around oblique source boundaries, not a missing source ring or hole.
        self.assertLess(square_error, .01)
        self.assertLess(basin_error, .01)
        for kind, shape in SURFACES.items():
            self.assertLess(shape.intersection(OBSTACLES.buffer(-.0001)).area, .00001, kind)
        self.assertLess(SURFACES['square'].intersection(WATER).area, .00001)
        METRICS.update(squareRenderedArea=SURFACES['square'].area, squareSymmetricDifference=square_error,
                       basinSymmetricDifference=basin_error)

    def test_06_gardens_stay_in_source_parks_and_outside_square(self):
        source_parks = []
        for area in LAYOUT['areas']:
            if area['tags'].get('leisure') in {'park', 'garden'}:
                source_parks.append(Polygon(source_way(area['id'])['points']))
        parks = unary_union(source_parks).intersection(REGION).difference(OUTER).difference(OBSTACLES).difference(ALL_AREA_WATER)
        error = parks.symmetric_difference(SURFACES['garden']).area
        self.assertLess(error, .02)
        self.assertLess(SURFACES['garden'].intersection(WATER).area, .00001)
        self.assertLess(SURFACES['garden'].intersection(OUTER.buffer(-.0001)).area, .00001)
        METRICS.update(gardenRenderedArea=SURFACES['garden'].area, gardenSymmetricDifference=error)

    def test_07_estimated_furniture_clears_traffic_buildings_and_basins(self):
        for group, clearance in [('treesEstimated', 3), ('benchesEstimated', 2)]:
            for coordinate in LAYOUT[group]:
                point = Point(coordinate)
                self.assertTrue(SQUARE.difference(OBSTACLES).covers(point.buffer(clearance)), (group, coordinate))
                self.assertTrue(WATER.disjoint(point.buffer(clearance)), (group, coordinate))
        self.assertIn('estimated', LAYOUT['detailStatus'])
        self.assertIn('inactive', LAYOUT['detailStatus'])
        self.assertIn('without surveyed water levels', LAYOUT['detailStatus'])
        METRICS.update(estimatedTrees=len(LAYOUT['treesEstimated']), estimatedBenches=len(LAYOUT['benchesEstimated']))

    def test_08_estimated_bridge_axis_and_lower_crossings(self):
        bridge = LAYOUT['bridge']
        self.assertEqual([r['id'] for r in bridge['sourceLanes']], ['370559017', '1376744096', '1502734093', '772825346'])
        axis = LineString(bridge['axisEstimated'])
        for a, b in zip(bridge['axisEstimated'], bridge['axisEstimated'][1:]):
            self.assertGreater(math.dist(a, b), .0001, 'duplicate/degenerate estimated bridge-axis points')
        self.assertAlmostEqual(axis.length, bridge['length'], places=5)
        for c in bridge['crossings']:
            check_source_object(self, c['source'])
            point = Point(c['at'])
            self.assertLess(axis.distance(point), .00001)
            self.assertLess(LineString(c['source']['points']).distance(point), .00001)
            self.assertAlmostEqual(axis.project(point), c['chainage'], places=4)
            self.assertNotEqual(c['source']['tags'].get('bridge'), 'yes')
        self.assertIn('estimated', bridge['status'])
        self.assertIn('No surveyed elevation', bridge['status'])
        METRICS.update(bridgeSourceLanes=len(bridge['sourceLanes']), lowerRoadCrossings=len(bridge['crossings']))

    def test_09_park_water_is_not_replaced_by_lawn(self):
        # The two park ponds are independent of the plaza's ten relation holes.
        # Testing only sourceWater would miss a source pond omitted from that
        # list while the same polygon was still present under areas.
        overlap = SURFACES['garden'].intersection(ALL_AREA_WATER).area
        missing = ALL_AREA_WATER.difference(WATER).area
        self.assertLess(overlap, .00001, 'source pond/lake painted as garden')
        self.assertLess(missing, .00001, 'area water omitted from the water inventory')
        METRICS.update(allSourceWaterArea=ALL_AREA_WATER.area, gardenWaterOverlap=overlap, missingWaterInventoryArea=missing)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(HedongGeometry)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(json.dumps({'passed': result.wasSuccessful(), **METRICS}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)
