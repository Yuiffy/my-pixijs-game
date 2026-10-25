"""Independent source and exclusion checks for authored riverbank furniture."""
import hashlib
import gzip
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

root = Path(__file__).resolve().parents[2]
layout_path = root / 'src/components/liuzhou/riverside-detail-layout.json'
layout = json.loads(layout_path.read_text(encoding='utf8'))
source_path = root / 'src/components/liuzhou/riverside-layout.json'
source = json.loads(source_path.read_text(encoding='utf8'))
city_path = root / 'src/components/liuzhou/city-map.json'
city = json.loads(city_path.read_text(encoding='utf8'))
assert layout_path.read_bytes() == (root / 'public/games/liuzhou/riverside-detail-layout.json').read_bytes()
assert layout['sourceSha256'] == hashlib.sha256(source_path.read_bytes()).hexdigest()
assert layout['citySha256'] == hashlib.sha256(city_path.read_bytes()).hexdigest()
assert layout['sourcePath'] == next(p for p in source['paths'] if p['sourceId'] == '1524324802')
assert layout['sourcePark'] == '21015274'
park = next(p for p in source['parks'] if p['id'] == layout['sourcePark'])
park_shape = unary_union([Polygon(p['points'], p['holes']) for p in park['parts']])
water = json.loads((root / 'src/components/liuzhou/skyline-map.json').read_text(encoding='utf8'))['riverPolygons']
river = unary_union([Polygon(p['outer'], p.get('holes', [])) for p in water])
footprints = json.loads((root / 'src/components/liuzhou/building-footprints.json').read_text(encoding='utf8'))
buildings = unary_union([Polygon(p['points']) for p in city['buildings'] + footprints['features']])
axis = LineString(layout['sourcePath']['points'])
roads = []
for road in city['roads'] + city['steps']:
    if road['id'] == layout['sourcePath']['sourceId']:
        continue
    kind = road['tags']['highway']
    half = {'primary': 8, 'trunk': 8, 'secondary': 7.5, 'tertiary': 6, 'residential': 3, 'service': 3, 'unclassified': 3, 'cycleway': 3, 'steps': 3}.get(kind, 2.5)
    roads.append(LineString(road['points']).buffer(half + .79, cap_style=2, join_style=2))
crossings = unary_union(roads)
assert len(layout['rails']) >= 100
assert len(layout['restBays']) >= 5
ids = [p['id'] for p in layout['rails'] + layout['restBays']]
assert len(ids) == len(set(ids))
audit = json.loads((root / 'data/liuzhou/references/riverside-connections.json').read_text(encoding='utf8'))
raw = gzip.decompress((root / audit['source']).read_bytes())
assert audit['sourceSha256'] == hashlib.sha256(raw).hexdigest()
original = ET.fromstring(raw)
ways = {w.attrib['id']: w for w in original.findall('way')}
expected_joins = {'1378654366': ('1275168863', '1531307805'), '1378654367': ('195910349', '1531307805'), '1449382842': ('649497457', '1531307805')}
for connection in audit['connections']:
    refs = [n.attrib['ref'] for n in ways[connection['sourceId']].findall('nd')]
    assert refs == connection['nodeIds']
    for i, road_id in enumerate(expected_joins[connection['sourceId']]):
        end = connection['ends'][i]
        assert end['nodeId'] == refs[0 if i == 0 else -1]
        assert end['nodeId'] in [n.attrib['ref'] for n in ways[road_id].findall('nd')]
        assert road_id in [r['sourceId'] for r in end['roads']]
    assert connection['ends'][0]['roads'][0]['tags']['bridge'] == 'yes'
    assert all(key not in connection['tags'] for key in ['ele', 'step_count', 'incline'])
for rail in layout['rails']:
    shape = LineString([rail['a'], rail['b']]).buffer(.219, cap_style=2)
    assert 'estimated' in rail['geometryStatus'], rail['id']
    assert park_shape.covers(shape), rail['id']
    assert not shape.intersects(river), rail['id']
    assert not shape.intersects(crossings), rail['id']
    assert shape.distance(buildings) >= 1.99, rail['id']
    assert shape.distance(axis) >= 2.8, rail['id']
    assert 3.9 <= LineString([rail['a'], rail['b']]).length <= 3.98
for bay in layout['restBays']:
    shape = Polygon(bay['points'])
    assert 'estimated' in bay['geometryStatus'], bay['id']
    assert park_shape.covers(shape), bay['id']
    assert shape.distance(river) >= 1.99, bay['id']
    assert shape.distance(buildings) >= 2.99, bay['id']
    assert not shape.intersects(crossings), bay['id']
    assert Point(bay['route'][0]).distance(axis) < .001, bay['id']
    assert shape.buffer(.001).covers(LineString(bay['route'])), bay['id']
    assert shape.covers(Point(bay['bench'])), bay['id']
    assert shape.area >= 29, bay['id']
    for tree in source['trees']:
        assert Point(tree['at']).distance(shape) >= 4.49, bay['id']
print(json.dumps({'sourcePath': layout['sourcePath']['sourceId'], 'rails': len(layout['rails']), 'restBays': len(layout['restBays']), 'geometry': 'all exclusions and source preservation pass'}))
