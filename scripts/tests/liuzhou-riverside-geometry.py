"""Independent raw-relation, source-path and landscape exclusion audit."""
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize_full, unary_union

root = Path(__file__).resolve().parents[2]
data = json.loads((root / 'src/components/liuzhou/riverside-layout.json').read_text(encoding='utf8'))
raw = gzip.decompress((root / data['source']).read_bytes())
assert hashlib.sha256(raw).hexdigest() == data['sourceSha256']
assert (root / 'src/components/liuzhou/riverside-layout.json').read_bytes() == (root / 'public/games/liuzhou/riverside-layout.json').read_bytes()
tree = ET.fromstring(raw)
nodes = {n.attrib['id']: n for n in tree.findall('node')}
ways = {w.attrib['id']: w for w in tree.findall('way')}
relations = {r.attrib['id']: r for r in tree.findall('relation')}


def points(w):
    return [[round((float(nodes[n.attrib['ref']].attrib['lon']) - 109.41225) * 101458, 3),
             round((24.31415 - float(nodes[n.attrib['ref']].attrib['lat'])) * 111320, 3)] for n in w.findall('nd')]


city_bytes = (root / 'src/components/liuzhou/city-map.json').read_bytes()
assert data['citySha256'] == hashlib.sha256(city_bytes).hexdigest()
city = json.loads(city_bytes)
core = json.loads((root / 'src/components/liuzhou/map.json').read_text(encoding='utf8'))
water = json.loads((root / 'src/components/liuzhou/skyline-map.json').read_text(encoding='utf8'))['riverPolygons']
river = unary_union([Polygon(p['outer'], p.get('holes', [])) for p in water])
buildings = unary_union([Polygon(b['points']) for b in city['buildings']])
corridors = []
for r in city['roads']:
    if r['tags'].get('bridge') == 'yes':
        continue
    kind = r['tags']['highway']
    width = 16 if kind in ['primary', 'trunk'] else 15 if kind == 'secondary' else 12 if kind == 'tertiary' else 6 if kind in ['residential', 'service', 'unclassified', 'cycleway'] else 5
    corridors.append(LineString(r['points']).buffer(width / 2, cap_style=2, join_style=2))
for r in core['features']:
    if not r.get('highway') or r.get('bridge') == 'yes':
        continue
    width = 15 if r['highway'] == 'secondary' else 12 if r['highway'] == 'tertiary' else 5
    corridors.append(LineString(r['points']).buffer(width / 2, cap_style=2, join_style=2))
for r in city['steps']:
    corridors.append(LineString(r['points']).buffer(3, cap_style=2, join_style=2))
roads = unary_union(corridors)
for p in data['parks']:
    relation = relations[p['id']]
    assert p['members'] == [m.attrib for m in relation.findall('member')]
    assert p['tags'] == {t.attrib['k']: t.attrib['v'] for t in relation.findall('tag')}
    # Polygonize the original member linework independently of the exporter
    # node-chain walk. Missing end segments must fail rather than be bridged.
    original, cuts, dangles, invalid = polygonize_full([LineString(points(ways[m['ref']])) for m in p['members']])
    assert cuts.is_empty and dangles.is_empty and invalid.is_empty
    source = unary_union(list(original.geoms))
    exported = unary_union([Polygon(part['points'], part['holes']) for part in p['parts']])
    assert source.equals(exported)
    assert abs(exported.area - p['area']) < 1e-6
    assert sorted(m['ref'] for m in p['members']) == sorted(w for part in p['parts'] for w in part['wayIds'])
    for part in p['parts']:
        assert part['points'] == [[round((float(nodes[ref].attrib['lon']) - 109.41225) * 101458, 3), round((24.31415 - float(nodes[ref].attrib['lat'])) * 111320, 3)] for ref in part['nodeIds']]
    patches = [Polygon(s['points']) for s in data['surfaces'] if s['parkId'] == p['id']]
    surface = unary_union(patches)
    assert sum(s.area for s in patches) - surface.area < .001
    assert surface.difference(source).area < .001
    assert surface.intersection(river).area < .001
    assert surface.intersection(roads).area < .001
    assert surface.intersection(buildings).area < .001
    assert abs(surface.area - p['dryLandscapeArea']) < .01
    for t in data['trees']:
        if t['parkId'] == p['id']:
            point = Point(t['at'])
            assert source.contains(point)
            assert point.distance(river) > 4
            assert point.distance(roads) > 4
            assert point.distance(buildings) > 4
    print(p['name'], round(p['area'], 3), 'landscape', round(surface.area, 3))
for path in data['paths']:
    source = next(r for r in city['roads'] + city['steps'] if r['id'] == path['sourceId'])
    assert path['points'] == source['points'] and path['tags'] == source['tags']
assert len(data['trees']) > 100 and len(data['paths']) == 5
print('two complete relations; source nodes, areas, paths, dry landscape and tree clearance verified')
