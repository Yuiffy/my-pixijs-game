"""Read-only SRT/danmaku discovery. Raw local paths stay in ignored tmp/.

python scripts/research-sui-gifts.py --root <recording-root> [--root ...]
Candidates are NOT publication-ready facts: manually check month, speaker,
jokes, tentative plans and matching recording frames before cataloguing.
"""
import argparse
import collections
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

PATTERN = re.compile(r'舰[长礼]|[见建剑镜]长礼|提[督度]礼|体[督度]礼|总[督度]礼|[这本上下个一二三四五六七八九十\d]+月.{0,12}礼物|上[舰见剑].{0,6}礼物')


def scan(roots, output):
    hits = []
    counts = collections.Counter()
    coverage = collections.Counter()
    seen = set()
    for root in roots:
        for folder in sorted(root.iterdir()):
            if not folder.is_dir() or not re.fullmatch(r'(?:20)?2\d_\d\d_\d\d', folder.name):
                continue
            date = folder.name.replace('_', '-')
            if len(date) == 8:
                date = '20' + date
            for path in sorted(folder.glob('*.srt')):
                if path.name.endswith('.speaker.srt'):
                    continue
                counts['srt'] += 1
                coverage[date[:7]] += 1
                blocks = re.split(r'\n\s*\n', path.read_text(encoding='utf-8-sig', errors='replace'))
                cues = []
                for block in blocks:
                    lines = block.strip().splitlines()
                    if len(lines) >= 3 and ' --> ' in lines[1]:
                        cues.append({'time': lines[1].split(' --> ')[0], 'text': ' '.join(lines[2:])})
                for index, cue in enumerate(cues):
                    if not PATTERN.search(cue['text']):
                        continue
                    key = (date, cue['time'], cue['text'])
                    if key in seen:
                        continue
                    seen.add(key)
                    hits.append({'date': date, 'kind': 'subtitle', 'file': str(path), **cue,
                                 'context': cues[max(0, index - 3):index + 8]})
            for path in sorted(folder.glob('*.xml')):
                counts['xml'] += 1
                try:
                    for element in ET.parse(path).iter('d'):
                        text = element.text or ''
                        if PATTERN.search(text):
                            hits.append({'date': date, 'kind': 'danmaku', 'file': str(path),
                                         'time': element.get('p', '').split(',')[0], 'text': text})
                except ET.ParseError:
                    counts['xmlParseErrors'] += 1
    output.mkdir(parents=True, exist_ok=True)
    result = {'counts': dict(counts), 'coverage': dict(sorted(coverage.items())), 'hits': hits}
    (output / 'scan.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'counts': result['counts'], 'coverage': result['coverage'], 'hits': len(hits)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, action='append', required=True)
    parser.add_argument('--output', type=Path, default=Path('tmp/gift-research'))
    args = parser.parse_args()
    scan(args.root, args.output)
