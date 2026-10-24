"""Rebuild only retaining faces from the existing offline park mesh."""
import json
from pathlib import Path
from lib.liuzhou_eshan_edges import seal_trail_edges

root = Path(__file__).resolve().parents[1]
layout = json.loads((root / 'src/components/liuzhou/eshan-layout.json').read_text(encoding='utf-8'))
layout['walls'], layout['wallSealing'] = seal_trail_edges(layout, root)
for name in ['src/components/liuzhou/eshan-layout.json', 'public/games/liuzhou/eshan-layout.json']:
    (root / name).write_text(json.dumps(layout, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
print(json.dumps({'walls': len(layout['walls']), **layout['wallSealing']}))
