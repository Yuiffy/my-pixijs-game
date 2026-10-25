"""Independent archived-source and spatial checks for the Xihuan detail layer."""
import gzip
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
layout = json.loads((ROOT / 'src/components/liuzhou/xihuan-layout.json').read_text(encoding='utf8'))
city = json.loads((ROOT / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
nodes, ways = {}, {}
for archive in sorted((ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz')):
    source = ET.fromstring(gzip.decompress(archive.read_bytes()))
    nodes.update({n.attrib['id']: n for n in source.findall('node')})
    ways.update({w.attrib['id']: w for w in source.findall('way')})


def source_ring(ident):
    result = []
    for ref in ways[ident].findall('nd'):
        n = nodes[ref.attrib['ref']]
        result.append([round((float(n.attrib['lon']) - 109.41225) * 101458, 3),
                       round((24.31415 - float(n.attrib['lat'])) * 111320, 3)])
    return result


parcels = {p['id']: Polygon(p['points']) for p in layout['parcels']}
for p in layout['parcels']:
    assert source_ring(p['id']) == p['points'], p['id']
for f in layout['frontages']:
    assert source_ring(f['id']) == f['points'], f['id']
    body = next(b for b in city['buildings'] if b['id'] == f['id'])
    assert body['points'] == f['points']
    assert f['heightSource'] == 'estimated'
    assert math.isclose(f['height'], 10 + int(f['id']) % 6 * 3.2)

roads = unary_union([LineString(r['points']).buffer(layout['roadWidths'][r['id']] / 2)
                     for r in layout['sourceRoads']])
shells = unary_union([Polygon(b['points']) for b in city['buildings']])
yard = unary_union(list(parcels.values()))
for s in layout['surfaces']:
    if s['kind'] not in ['courtyard', 'yardpath', 'sports', 'courtLine']:
        continue
    shape = Polygon(s['points'])
    assert shape.difference(yard).area < 0.0001, s['kind']
    assert shape.intersection(shells).area < 0.0001, s['kind']
    assert shape.intersection(roads).area < 0.0001, s['kind']

paths = unary_union([Polygon(s['points']) for s in layout['surfaces'] if s['kind'] == 'yardpath'])
for tree in layout['yardTrees']:
    p = Point(tree['point'])
    assert parcels[tree['parcelId']].contains(p.buffer(2.5))
    assert p.distance(shells) > 2.5
    assert p.distance(roads) > 2.5
    assert p.distance(paths) >= 2.49
    assert all(p.distance(Polygon(s['points'])) >= 4 for s in layout['sports'])
assert len(layout['frontages']) == 15
assert (ROOT / 'src/components/liuzhou/xihuan-layout.json').read_bytes() == (ROOT / 'public/games/liuzhou/xihuan-layout.json').read_bytes()
assert 'estimated' in layout['detailSource'] and 'no measured heights' in layout['detailSource']
print(json.dumps({'passed': True, 'sourceFrontages': len(layout['frontages']),
                  'parcelTrees': len(layout['yardTrees']), 'estimatedSports': len(layout['sports'])}))
