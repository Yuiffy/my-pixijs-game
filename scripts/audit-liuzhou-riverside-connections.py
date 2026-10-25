"""Preserve exact archived OSM node joins for future bridge/stair work."""
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parents[1]
layout = json.loads((root / 'src/components/liuzhou/riverside-layout.json').read_text(encoding='utf8'))
city = json.loads((root / 'src/components/liuzhou/city-map.json').read_text(encoding='utf8'))
raw = gzip.decompress((root / layout['source']).read_bytes())
assert hashlib.sha256(raw).hexdigest() == layout['sourceSha256']
tree = ET.fromstring(raw)
ways = {w.attrib['id']: w for w in tree.findall('way')}
nodes = {n.attrib['id']: n for n in tree.findall('node')}
roads = {r['id']: r for r in city['roads']}
connections = []
for step in layout['paths']:
    if step['tags']['highway'] != 'steps':
        continue
    way = ways[step['sourceId']]
    refs = [n.attrib['ref'] for n in way.findall('nd')]
    ends = []
    for ref in [refs[0], refs[-1]]:
        joined = []
        for road_id, road in roads.items():
            source_road = ways.get(road_id)
            if source_road is not None and any(n.attrib['ref'] == ref for n in source_road.findall('nd')):
                joined.append({'sourceId': road_id, 'name': road['name'], 'tags': road['tags']})
        node = nodes[ref]
        ends.append({'nodeId': ref, 'lon': float(node.attrib['lon']), 'lat': float(node.attrib['lat']), 'roads': sorted(joined, key=lambda r: int(r['sourceId']))})
    connections.append({'sourceId': step['sourceId'], 'nodeIds': refs, 'tags': step['tags'], 'ends': ends,
                        'heightStatus': 'No surveyed deck, landing or stair elevations are present. DEM ground samples cannot establish bridge stair levels.'})
output = {'source': layout['source'], 'sourceSha256': layout['sourceSha256'], 'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0',
          'status': 'Exact archived node joins; not a constructed or validated walkable staircase model.', 'connections': connections}
target = root / 'data/liuzhou/references/riverside-connections.json'
target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'stairs': len(connections), 'output': str(target)}))
