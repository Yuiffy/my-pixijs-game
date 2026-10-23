"""Split and pack generated Sui art; requires Pillow, NumPy and SciPy.

No redraw or recoloring: isolate four actual alpha components so uneven generated
columns cannot cut a hand/boot. Use shared head scale, then bottom-center anchors.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.ndimage import label, find_objects
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/games/sui-spring/animations'
PREVIEW = ROOT / '.tmp/sui-delivery/art'
FRAME = 104
# Measured broad hood/head width in each source strip, excluding trailing ponytail.
# One calibration per strip; do not normalize individual poses independently.
HEAD_WIDTH = {'air': 208, 'run': 215, 'tray': 241, 'reaction': 246}


def split_source(source):
    labels, _ = label(np.asarray(source)[:, :, 3] > 8)
    sizes = np.bincount(labels.ravel())
    components = [(i + 1, slices) for i, slices in enumerate(find_objects(labels))
                  if slices is not None and sizes[i + 1] > 1000]
    components.sort(key=lambda item: item[1][1].start)
    assert len(components) == 4, 'Expected exactly four substantial character silhouettes'
    frames, boxes = [], []
    for ident, slices in components:
        mask = Image.fromarray(np.uint8(labels == ident) * 255).filter(ImageFilter.MaxFilter(5))
        # Preserve original alpha on the antialiased edge, exclude other characters.
        alpha = np.minimum(np.asarray(source.getchannel('A')), np.asarray(mask))
        isolated = source.copy()
        isolated.putalpha(Image.fromarray(alpha))
        box = isolated.getbbox()
        frames.append(isolated.crop(box))
        boxes.append(box)
    return frames, boxes


def main():
    sources, boxes = {}, {}
    for group in HEAD_WIDTH:
        source = Image.open(ROOT / f'docs/art/sui-delivery/{group}-source-v1.png').convert('RGBA')
        sources[group], boxes[group] = split_source(source)
    # All strips share one head calibration and final scale. Crouches stay shorter.
    longest = max(max(frame.size) / HEAD_WIDTH[group]
                  for group, frames in sources.items() for frame in frames)
    head_pixels = 96 / longest
    metrics = {}
    for group, frames in sources.items():
        folder = ASSETS / f'{group}-v1'
        folder.mkdir(parents=True, exist_ok=True)
        sheet = Image.new('RGBA', (FRAME * 4, FRAME))
        bounds = []
        scale = head_pixels / HEAD_WIDTH[group]
        for i, source in enumerate(frames):
            size = tuple(max(1, round(v * scale)) for v in source.size)
            resized = source.resize(size, Image.Resampling.LANCZOS)
            frame = Image.new('RGBA', (96, 96))
            frame.alpha_composite(resized, ((96 - size[0]) // 2, 96 - size[1]))
            frame.save(folder / f'{i + 1:02d}.png', optimize=True)
            sheet.alpha_composite(frame, (i * FRAME + 4, 4))
            bounds.append(frame.getbbox())
        atlas = ASSETS / f'{group}-v1.png'
        sheet.save(atlas, optimize=True)
        metrics[group] = {'frameSize': FRAME, 'count': 4, 'sourceBounds': boxes[group],
                          'headSourceWidth': HEAD_WIDTH[group], 'scale': scale,
                          'bounds': bounds, 'bytes': atlas.stat().st_size,
                          'sha256': hashlib.sha256(atlas.read_bytes()).hexdigest()}
    PREVIEW.mkdir(parents=True, exist_ok=True)
    preview = Image.new('RGB', (660, len(metrics) * 238), '#e8d9b9')
    draw = ImageDraw.Draw(preview)
    for row, group in enumerate(metrics):
        draw.text((12, row * 238 + 8), f'{group}: 96px / 48px + 64px; shared head scale and foot anchor', fill='#344939')
        for size, x0, baseline in [(96, 12, 136), (48, 12, 226), (64, 240, 226)]:
            for i in range(1, 5):
                frame = Image.open(ASSETS / f'{group}-v1/{i:02d}.png').convert('RGBA')
                thumb = frame.resize((size, size), Image.Resampling.LANCZOS)
                preview.paste(thumb, (x0 + (i - 1) * (size + 4), row * 238 + baseline - size), thumb)
    preview.save(PREVIEW / 'animation-sizes-v1.png')
    (ASSETS / 'manifest-v1.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    provenance = json.loads((ROOT / 'docs/sui-delivery-art.json').read_text(encoding='utf-8'))
    for item in provenance['groups']:
        item['sourceSha256'] = hashlib.sha256((ROOT / item['source']).read_bytes()).hexdigest()
    (ROOT / 'docs/sui-delivery-art.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(metrics))


if __name__ == '__main__':
    main()
