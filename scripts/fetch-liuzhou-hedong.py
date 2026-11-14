"""Fetch and preserve the missing public OSM corridor east of the old city.

The API response is geographic source data, never executable input. Existing
candidate and archived bytes are retained; --archive is entirely offline.
"""
import argparse
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'tmp/liuzhou/hedong-2026-10-26'
URL = 'https://api.openstreetmap.org/api/0.6/map?bbox=109.420,24.320,109.445,24.338'
BBOX = [109.420, 24.320, 109.445, 24.338]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fetch():
    path = CACHE / 'hedong-south.osm'
    metadata = CACHE / 'hedong-south.download.json'
    if path.exists():
        assert metadata.is_file(), 'Existing response needs its original download metadata'
        info = json.loads(metadata.read_text(encoding='utf8'))
        assert sha(path.read_bytes()) == info['sha256']
        print('Retained existing verified response; no request sent.')
        return
    request = urllib.request.Request(URL, headers={
        'User-Agent': 'LiuzhouGTA-local-geography/0.1 (read-only reference)',
        'Accept': 'application/xml',
    })
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read(30_000_001)
    assert len(raw) <= 30_000_000, 'Unexpectedly large response'
    osm = ET.fromstring(raw)
    assert osm.tag == 'osm'
    info = {
        'url': URL,
        'downloadedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'bytes': len(raw), 'sha256': sha(raw), 'root': osm.tag,
        'counts': {tag: len(osm.findall(tag)) for tag in ['node', 'way', 'relation']},
        'wgs84Bbox': BBOX,
    }
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    metadata.write_text(json.dumps(info, indent=2) + '\n', encoding='utf8')
    print(json.dumps(info))


def archive():
    info = json.loads((CACHE / 'hedong-south.download.json').read_text(encoding='utf8'))
    raw = (CACHE / 'hedong-south.osm').read_bytes()
    assert sha(raw) == info['sha256'] and len(raw) == info['bytes']
    assert info['url'] == URL and info['wgs84Bbox'] == BBOX
    assert ET.fromstring(raw).tag == 'osm'
    manifest_path = ROOT / 'data/liuzhou/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    for name, destination, compress in [
        ('hedong-south.osm', 'open/osm/hedong-south-20261026.osm.gz', True),
        ('hedong-south.download.json', 'open/osm/hedong-south-20261026.download.json', False),
    ]:
        original = (CACHE / name).read_bytes()
        saved = gzip.compress(original, compresslevel=9, mtime=0) if compress else original
        target = ROOT / 'data/liuzhou' / destination
        if target.exists():
            assert target.read_bytes() == saved, f'Archive already has different bytes: {destination}'
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(saved)
        entry = {
            'path': destination, 'bytes': len(saved), 'sha256': sha(saved),
            'rawBytes': len(original), 'rawSha256': sha(original),
            'encoding': 'gzip' if compress else 'identity',
            'category': 'open-osm',
            'restoreCachePath': f'tmp/liuzhou/hedong-2026-10-26/{name}',
            'sourceUrl': URL, 'downloadedAt': info['downloadedAt'],
        }
        existing = next((f for f in manifest['files'] if f['path'] == destination), None)
        if existing:
            assert existing == entry
        else:
            manifest['files'].append(entry)
    manifest['updatedDate'] = '2026-10-26'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'archivedFiles': len(manifest['files']), 'responseSha256': sha(raw)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--fetch', action='store_true')
    group.add_argument('--archive', action='store_true')
    args = parser.parse_args()
    fetch() if args.fetch else archive()
