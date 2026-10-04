"""Package three whole-strip ImageGen poses without cutting overlapping bounds.

Usage: python scripts/prepare-beach-dive.py --input-dir PATH --preview-dir PATH
Requires Pillow, numpy, scipy and OpenCV. Input: sui/shiori/nagisa.png.
The generator's uneven spacing is not assumed to be three equal cells.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt


FRAME = 384
ANCHOR = (192, 380)
ACTORS = ('sui', 'shiori', 'nagisa')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_poses(path):
    rgba = np.array(Image.open(path).convert('RGBA'))
    alpha = rgba[:, :, 3]
    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 8).astype('uint8'))
    components = sorted(
        (i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > 1000),
        key=lambda i: stats[i, cv2.CC_STAT_LEFT],
    )
    if len(components) != 3:
        raise ValueError(f'{path}: expected 3 separate whole-body poses, found {len(components)}')
    # Restore nearby translucent edge pixels while excluding the adjacent pose.
    major = np.where(np.isin(labels, components), labels, 0)
    distance, nearest = distance_transform_edt(major == 0, return_indices=True)
    owners = major[tuple(nearest)]
    poses, bounds = [], []
    for component in components:
        mask = (owners == component) & (distance <= 2) & (alpha > 0)
        content = rgba.copy()
        content[~mask] = 0
        image = Image.fromarray(content)
        box = image.getbbox()
        if not box:
            raise ValueError(f'{path}: empty pose')
        poses.append(image.crop(box))
        bounds.append(list(box))
    return poses, bounds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path('public/games/beach-volley/dive'))
    parser.add_argument('--preview-dir', type=Path, required=True)
    parser.add_argument('--provenance-file', type=Path, help='Update the packaging results in existing generation metadata')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.preview_dir.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 1, 'poses': ['flight', 'slide', 'recover'], 'characters': {}}
    provenance = {}
    for actor in ACTORS:
        source = args.input_dir / f'{actor}.png'
        poses, source_bounds = extract_poses(source)
        # A single shared scale, never independent per-frame stretching.
        scale = min((FRAME - 24) / max(p.width for p in poses),
                    (ANCHOR[1] - 12) / max(p.height for p in poses))
        atlas = Image.new('RGBA', (FRAME * 3, FRAME))
        content_bounds = []
        for i, pose in enumerate(poses):
            pose = pose.resize((round(pose.width * scale), round(pose.height * scale)), Image.Resampling.LANCZOS)
            frame = Image.new('RGBA', (FRAME, FRAME))
            frame.alpha_composite(pose, (ANCHOR[0] - pose.width // 2, ANCHOR[1] - pose.height))
            box = frame.getbbox()
            if box[0] < 8 or box[1] < 8 or box[2] > FRAME - 8 or box[3] > FRAME - 2:
                raise ValueError(f'{actor}/{i}: insufficient transparent padding {box}')
            content_bounds.append(list(box))
            atlas.alpha_composite(frame, (i * FRAME, 0))
        output = args.output_dir / f'{actor}.webp'
        atlas.save(output, 'WEBP', quality=91, method=6, exact=True)
        decoded = Image.open(output).convert('RGBA')
        preview = Image.new('RGB', (FRAME * 3, FRAME + 40), '#24334c')
        for y in range(0, FRAME, 24):
            for x in range(0, FRAME * 3, 24):
                if (x // 24 + y // 24) % 2 == 0:
                    ImageDraw.Draw(preview).rectangle((x, y, x + 23, y + 23), fill='#30415e')
        preview.paste(decoded, (0, 0), decoded)
        draw = ImageDraw.Draw(preview)
        for i, name in enumerate(manifest['poses']):
            x = i * FRAME + ANCHOR[0]
            draw.line((i * FRAME, ANCHOR[1], (i + 1) * FRAME - 1, ANCHOR[1]), fill='#7693b4')
            draw.ellipse((x - 3, ANCHOR[1] - 3, x + 3, ANCHOR[1] + 3), fill='#ffe5a1')
            draw.text((i * FRAME + 12, FRAME + 12), f'{actor} / {name}', fill='white')
        preview.save(args.preview_dir / f'{actor}.png')
        manifest['characters'][actor] = {
            'file': f'dive/{actor}.webp', 'scale': 0.84, 'anchor': list(ANCHOR),
            'frames': [[i * FRAME, 0, FRAME, FRAME] for i in range(3)],
        }
        provenance[actor] = {
            'sourceSha256': digest(source), 'sourceSize': list(Image.open(source).size),
            'sourceBounds': source_bounds, 'sharedNormalizationScale': scale,
            'output': str(output).replace('\\', '/'), 'outputSha256': digest(output),
            'outputBytes': output.stat().st_size, 'contentBounds': content_bounds,
        }
    (args.output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (args.preview_dir / 'normalization.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    if args.provenance_file:
        metadata = json.loads(args.provenance_file.read_text(encoding='utf-8'))
        metadata['assets'] = provenance
        metadata['totalOutputBytes'] = sum(p['outputBytes'] for p in provenance.values())
        args.provenance_file.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(provenance, indent=2))


if __name__ == '__main__':
    main()
