"""Convert the cached Overture extract to the game's existing metre projection.

Retain source IDs and footprint geometry. No heights exist in this extract, so
this importer never manufactures height attributes. Runtime curation leaves
road and gameplay corridors open rather than moving a source footprint.
"""
from pathlib import Path
from hashlib import sha256
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'tmp/liuzhou/shared-data-2026-10-24/overture-buildings-core.geojson'
data = json.loads(source.read_text(encoding='utf-8'))
features = []
for f in data['features']:
    assert f['geometry']['type'] == 'Polygon', f['id']
    # The current renderer uses simple exteriors; do not silently fill holes.
    if len(f['geometry']['coordinates']) != 1:
        continue
    ring = f['geometry']['coordinates'][0]
    assert all(len(p) == 2 for p in ring)
    features.append({'id': f['id'], 'sources': f['properties']['sources'],
                     'points': [[round((p[0] - 109.41225) * 101458, 3),
                                 round((24.31415 - p[1]) * 111320, 3)] for p in ring[:-1]]})
output = {'source': 'https://docs.overturemaps.org/guides/buildings/',
          'release': '2026-10-21.0', 'downloaded': '2026-10-24',
          'sourceSha256': sha256(source.read_bytes()).hexdigest(),
          'license': 'ODbL-1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/',
          'attribution': '© OpenStreetMap contributors, Overture Maps Foundation; East Asian Buildings / CLSM',
          'origin': [109.41225, 24.31415], 'units': 'metres; x east, z south',
          'heightStatus': 'No height or storey values supplied; runtime volumes are estimates',
          'features': features}
for target in [ROOT / 'src/components/liuzhou/building-footprints.json', ROOT / 'public/games/liuzhou/building-footprints.json']:
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
shutil.copy2(source, ROOT / 'public/games/liuzhou/overture-buildings-core.geojson')
print(json.dumps({'input': len(data['features']), 'simpleFootprints': len(features), 'bytes': target.stat().st_size}))
