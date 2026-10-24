"""Build western/northern exploration geography from the project's OSM archive.

Offline only; retains source way IDs, tags, polygons and explicit height status.
No Tianditu restricted data or account information is read.
"""
from pathlib import Path
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
nodes, ways, sources = {}, {}, []
for path in sorted((ROOT / 'data/liuzhou/open/osm').glob('*.osm.gz')):
    raw = gzip.decompress(path.read_bytes())
    tree = ET.fromstring(raw)
    sources.append({'path': str(path.relative_to(ROOT)).replace('\\', '/'),
                    'sha256': hashlib.sha256(raw).hexdigest()})
    for node in tree.findall('node'):
        nodes[node.attrib['id']] = node
    for way in tree.findall('way'):
        ways[way.attrib['id']] = way


def point(node):
    return [round((float(node.attrib['lon']) - 109.41225) * 101458, 3),
            round((24.31415 - float(node.attrib['lat'])) * 111320, 3)]


def inside(p):
    return -4400 < p[0] < 700 and -3000 < p[1] < 1600


roads, buildings, areas, rails, underground, steps = [], [], [], [], [], []
for id, way in sorted(ways.items(), key=lambda item: int(item[0])):
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    pts = [point(nodes[n.attrib['ref']]) for n in way.findall('nd') if n.attrib['ref'] in nodes]
    if len(pts) < 2 or not any(inside(p) for p in pts):
        continue
    feature = {'id': id, 'name': tags.get('name', ''), 'points': pts, 'tags': tags}
    if tags.get('highway'):
        if tags.get('layer') == '-1' or tags.get('tunnel') == 'yes':
            underground.append(feature)
        elif tags['highway'] == 'steps':
            steps.append(feature)
        elif tags['highway'] not in ['construction', 'proposed', 'platform']:
            roads.append(feature)
    if tags.get('building') and len(pts) >= 4 and pts[0] == pts[-1]:
        buildings.append(feature)
    if tags.get('leisure') in ['park', 'garden'] or tags.get('landuse') in ['retail', 'residential', 'commercial', 'industrial', 'railway']:
        if len(pts) >= 4 and pts[0] == pts[-1]:
            areas.append(feature)
    if tags.get('railway') == 'rail' and not tags.get('abandoned'):
        rails.append(feature)

output = {'origin': [109.41225, 24.31415], 'attribution': '© OpenStreetMap contributors',
          'license': 'ODbL-1.0', 'axes': 'x east, z south; metres', 'sources': sources,
          'heightStatus': 'Source tags retained; absent heights and underground depths require estimation.',
          'roads': roads, 'buildings': buildings, 'areas': areas, 'rails': rails,
          'underground': underground, 'steps': steps}
for path in [ROOT / 'src/components/liuzhou/city-map.json', ROOT / 'public/games/liuzhou/city-map.json']:
    path.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({k: len(output[k]) for k in ['roads', 'buildings', 'areas', 'rails', 'underground', 'steps']}))
