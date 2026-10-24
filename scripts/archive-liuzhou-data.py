"""Preserve cached source data in the project; verify or restore it offline.

No downloaded program or archive member is executed. Restricted exports stay
outside public/ and outside Git; their inventory and checksums remain versioned.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'data/liuzhou'
MANIFEST = ARCHIVE / 'manifest.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_write(path, data):
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f'Refusing to overwrite different archived bytes: {path}')
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def archive():
    entries = []

    def add(source, destination, category, restore=None, source_url=None, compressed=False):
        source = Path(source)
        if not source.is_file():
            raise FileNotFoundError(source)
        raw = source.read_bytes()
        saved = gzip.compress(raw, compresslevel=9, mtime=0) if compressed else raw
        checked_write(ARCHIVE / destination, saved)
        entries.append({'path': destination, 'bytes': len(saved), 'sha256': digest(saved),
                        'rawBytes': len(raw), 'rawSha256': digest(raw),
                        'encoding': 'gzip' if compressed else 'identity',
                        'category': category, 'restoreCachePath': restore,
                        'sourceUrl': source_url})

    osm_urls = {
        'map.osm': 'map?bbox=109.408,24.307,109.418,24.318',
        'urban-source.osm': 'map?bbox=109.408,24.307,109.418,24.318',
        'skyline-core.osm': 'map?bbox=109.375,24.296,109.425,24.34',
        'skyline-north.osm': 'map?bbox=109.375,24.338,109.495,24.39',
        'skyline-east.osm': 'map?bbox=109.44,24.26,109.505,24.338',
        'skyline-west.osm': 'map?bbox=109.34,24.35,109.376,24.395',
        'skyline-river.osm': 'relation/8382768/full',
        'skyline-riverbank.osm': 'relation/7774579/full',
        'skyline-riverbank-east.osm': 'relation/19894936/full',
    }
    for name, url in osm_urls.items():
        add(ROOT / 'tmp/liuzhou' / name, 'open/osm/' + name + '.gz', 'open-osm',
            'tmp/liuzhou/' + name, 'https://api.openstreetmap.org/api/0.6/' + url, True)
    request_cache = ROOT / 'tmp/liuzhou/data-request-2026-10-24'
    current_url = 'https://api.openstreetmap.org/api/0.6/map?bbox=109.4090,24.3050,109.4190,24.3190'
    add(request_cache / 'core-current.osm', 'open/osm/core-current.osm.gz', 'open-osm',
        'tmp/liuzhou/data-request-2026-10-24/core-current.osm', current_url, True)
    for name in ['core-current.geojson', 'request-area.geojson']:
        add(request_cache / name, 'open/osm/' + name, 'open-osm',
            'tmp/liuzhou/data-request-2026-10-24/' + name, current_url)
    for path in sorted((ROOT / 'tmp/liuzhou/terrain').glob('*.png')):
        zoom, x, y = path.stem.split('-')
        add(path, 'open/terrain/' + path.name, 'open-terrain',
            'tmp/liuzhou/terrain/' + path.name,
            f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png')
    for name in ['overture-buildings-core.geojson', 'manifest.json']:
        add(ROOT / 'tmp/liuzhou/shared-data-2026-10-24' / name, 'open/buildings/' + name,
            'open-buildings', 'tmp/liuzhou/shared-data-2026-10-24/' + name,
            'https://docs.overturemaps.org/getting-data/overturemaps-py/')
    add(ROOT / 'tmp/liuzhou/shared-data-2026-10-24/GABLE-README.md',
        'open/buildings/GABLE-README.md', 'reference-document',
        source_url='https://github.com/AICyberTeam/GABLE')
    # Preserve the actual delivered ZIP bytes, including both different wrappers.
    for name in ['20261024033400676.zip', '20261024040131256.zip']:
        add(Path.home() / 'Downloads' / name, 'restricted/tianditu/' + name,
            'restricted-reference', source_url='https://cloudcenter.tianditu.gov.cn/dataSource')
    for name in ['inspection.json', 'manifest.json', 'README.md', 'core-reference.geojson']:
        add(ROOT / 'tmp/liuzhou/tianditu-2026-10-24' / name, 'restricted/tianditu/' + name,
            'restricted-reference', 'tmp/liuzhou/tianditu-2026-10-24/' + name)
    for name in ['liuzhou-official-export.gif', 'export-frame-00.png', 'export-frame-01.png', 'manifest.json']:
        add(ROOT / 'tmp/liuzhou/tianditu-imagery-2026-10-24' / name, 'restricted/imagery/' + name,
            'restricted-reference', 'tmp/liuzhou/tianditu-imagery-2026-10-24/' + name,
            'https://image.tianditu.gov.cn/multidate')
    agreement = ROOT / 'tmp/liuzhou/data-request-2026-10-24/tianditu-download-agreement.txt'
    if agreement.is_file():
        add(agreement, 'restricted/tianditu/download-agreement.txt', 'restricted-reference',
            source_url='https://cloudcenter.tianditu.gov.cn/userAgreement')
    # Keep the extra browser export as an unverified original, not a terrain input.
    extra_name = '柳州市 (2).gif'
    extra_destination = 'restricted/imagery/liuzhou-download-2.gif'
    extra_download = Path.home() / 'Downloads' / extra_name
    extra_saved = ARCHIVE / extra_destination
    if extra_download.is_file() or extra_saved.is_file():
        add(extra_download if extra_download.is_file() else extra_saved,
            extra_destination, 'restricted-reference')
        entries[-1].update(originalFilename=extra_name,
                           contentStatus='Unverified browser export; not used for reconstruction')
    manifest = {'version': 1, 'archivedDate': '2026-10-24',
                'originWgs84': [109.41225, 24.31415], 'axes': 'x east, z south; metres',
                'notes': ['Open data archives are versioned. Restricted files are local project backups, not public assets.',
                          'Both Tianditu ZIPs contain the same inner g49c004001.zip; no DEM/Z/building heights.',
                          'Imagery frame 2024-11 is usable; frame 2025-10 is a connection-timeout error.',
                          'Overture extract has 648 candidates and no heights; 410 footprints are currently integrated.',
                          'Derived runtime grids are versioned under src/components/liuzhou and public/games/liuzhou.'],
                'files': entries}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Archived {len(entries)} files ({sum(e["bytes"] for e in entries):,} bytes)')


def verify(restore=False):
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    checked = 0
    optional_missing = []
    for item in manifest['files']:
        path = (ARCHIVE / item['path']).resolve()
        if not path.is_relative_to(ARCHIVE.resolve()):
            raise ValueError('Archive path escapes its root')
        if not path.is_file() and item['category'] == 'restricted-reference':
            optional_missing.append(item['path'])
            continue
        saved = path.read_bytes()
        if len(saved) != item['bytes'] or digest(saved) != item['sha256']:
            raise ValueError(f'Archived bytes failed verification: {path}')
        raw = gzip.decompress(saved) if item['encoding'] == 'gzip' else saved
        if len(raw) != item['rawBytes'] or digest(raw) != item['rawSha256']:
            raise ValueError(f'Original bytes failed verification: {path}')
        if restore and item['restoreCachePath']:
            target = (ROOT / item['restoreCachePath']).resolve()
            if not target.is_relative_to((ROOT / 'tmp/liuzhou').resolve()):
                raise ValueError('Cache path escapes its root')
            checked_write(target, raw)
        checked += 1
    print(json.dumps({'verified': checked, 'optionalRestrictedMissing': optional_missing,
                      'restoredCache': restore}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--archive', action='store_true')
    group.add_argument('--verify', action='store_true')
    group.add_argument('--restore-cache', action='store_true')
    args = parser.parse_args()
    if args.archive:
        archive()
    else:
        verify(args.restore_cache)
