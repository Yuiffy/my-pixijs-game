"""Compile reviewed sprite slots into fixed native-pixel atlases; originals stay intact.

Only mechanical asset preparation: alpha threshold, slot extraction, shared scale,
nearest-neighbour resizing and a shared foot anchor. No generated art is redrawn.
"""
from pathlib import Path
from statistics import median
from collections import deque
import argparse
import json
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/games/tidal-duel/pixel"
LAYOUT = json.loads((OUT / "source-layout.json").read_text(encoding="utf-8"))
SIZE, FOOT = LAYOUT["frameSize"], LAYOUT["anchor"][1]
BODY_HEIGHT = LAYOUT["bodyHeight"]
if LAYOUT["anchor"][0] != SIZE // 2:
    raise ValueError("The compiler expects a bottom-center anchor")


def clean(im):
    im = im.convert("RGBA")
    alpha = im.getchannel("A").point(lambda a: 255 if a > 220 else 0)
    # Retain the character, dropping detached alpha debris outside the silhouette.
    w, h = im.size
    data = bytearray(alpha.tobytes())
    seen = bytearray(w * h)
    components = []
    for start, value in enumerate(data):
        if not value or seen[start]:
            continue
        queue, cells = deque([start]), []
        seen[start] = 1
        while queue:
            i = queue.popleft()
            cells.append(i)
            x, y = i % w, i // w
            for j in (i - 1 if x else -1, i + 1 if x + 1 < w else -1,
                      i - w if y else -1, i + w if y + 1 < h else -1):
                if j >= 0 and data[j] and not seen[j]:
                    seen[j] = 1
                    queue.append(j)
        components.append(cells)
    if not components:
        raise ValueError("An empty sprite slot was found")
    largest = max(map(len, components))
    for cells in components:
        if len(cells) < max(24, largest * 0.015):
            for i in cells:
                data[i] = 0
    im.putalpha(Image.frombytes("L", im.size, bytes(data)))
    return im


def slots(source, desc):
    im = Image.open(source / desc["file"]).convert("RGBA")
    alpha = np.array(im.getchannel("A")) > 220
    labels, _ = ndimage.label(alpha, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    objects = ndimage.find_objects(labels)
    figures = [(i + 1, obj) for i, obj in enumerate(objects) if sizes[i + 1] > 750]
    expected = (len(desc.get("rows", [0, im.height])) - 1) * 4
    if len(figures) != expected:
        raise ValueError(f"{desc['file']}: expected {expected} complete silhouettes, found {len(figures)}")
    # Generated slots may be unequal, and kicks extend beyond a nominal column.
    # Feet sort frames into rows; silhouette x then sorts each row into columns.
    figures.sort(key=lambda figure: figure[1][0].stop)
    ordered = []
    for start in range(0, len(figures), 4):
        ordered += sorted(figures[start:start + 4], key=lambda figure: figure[1][1].start)
    result = []
    for index, (label, obj) in enumerate(ordered):
        x0, x1, y0, y1 = obj[1].start, obj[1].stop, obj[0].start, obj[0].stop
        f = im.crop((x0, y0, x1, y1))
        f.putalpha(Image.fromarray(np.where(labels[obj] == label, 255, 0).astype(np.uint8)))
        f.info["anchorX"] = (index % 4 + 0.5) * im.width / 4 - x0
        result.append(f)
    return result


def normalize(frames, body_height=BODY_HEIGHT, reference=None):
    # Generated slot centres drift. Pin the bottom support footprint to one root,
    # rather than letting a nominal grid centre offset both bodies into each other.
    for f in frames:
        box = f.getbbox()
        alpha = np.array(f.getchannel("A"))
        band = max(3, round((box[3] - box[1]) * 0.055))
        occupied = np.flatnonzero(np.any(alpha[box[3] - band:box[3]] > 0, axis=0))
        f.info["anchorX"] = (int(occupied[0]) + int(occupied[-1]) + 1) / 2
    heights = [f.getbbox()[3] - f.getbbox()[1] for f in frames[:4]]
    scale = body_height / (reference or median(heights))
    result = []
    for index, f in enumerate(frames):
        frame_scale = scale * f.info.get("scaleCorrection", 1)
        box = f.getbbox()
        content = f.crop(box)
        content = content.resize((max(1, round(content.width * frame_scale)), max(1, round(content.height * frame_scale))), Image.Resampling.NEAREST)
        # A thin source foot pixel may disappear during nearest-neighbour reduction.
        # Re-anchor the actual resized silhouette, not its now-empty last row.
        resized_box = content.getbbox()
        content = content.crop(resized_box)
        canvas = Image.new("RGBA", (SIZE, SIZE))
        # Do not recenter an extended kick around its larger silhouette.
        x = round(SIZE / 2 + (box[0] - f.info.get("anchorX", f.width / 2)) * frame_scale) + resized_box[0]
        y = FOOT - content.height
        if y < 0 or x < 0 or x + content.width > SIZE:
            raise ValueError(f"Sprite {index} escapes normalized slot: {(x, y, content.size)}, source box {box}, scale {frame_scale}. Enlarge the container instead of shrinking the character.")
        canvas.alpha_composite(content, (x, y))
        result.append(canvas)
    return result


def atlas(frames, name):
    rows = (len(frames) + 3) // 4
    sheet = Image.new("RGBA", (SIZE * 4, SIZE * rows))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, ((i % 4) * SIZE, (i // 4) * SIZE))
    sheet.save(OUT / name, "WEBP", lossless=True, exact=True)
    return sheet


def preview(sheet, name):
    bg = Image.new("RGBA", sheet.size, "#352842")
    bg.alpha_composite(sheet)
    draw = ImageDraw.Draw(bg)
    for i in range(sheet.height // SIZE * 4):
        x, y = (i % 4) * SIZE, (i // 4) * SIZE
        draw.line((x, y + FOOT, x + SIZE, y + FOOT), fill="#6a536f")
        draw.text((x + 5, y + 5), str(i), fill="#ffe4b5")
    path = ROOT / "tmp/tidal-duel-v2" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    bg.convert("RGB").save(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    source = Path(args.source).resolve()
    spec = LAYOUT
    audit = []
    for character, skins in spec["sources"].items():
        for skin, desc in skins.items():
            seed = clean(Image.open(source / desc["seed"]))
            seed_frame = normalize([seed])[0]
            seed_name = f"{character}-original-seed.webp" if skin == "original" else f"{character}-seed.webp"
            seed_frame.save(OUT / seed_name, "WEBP", lossless=True, exact=True)
            raw_motion = slots(source, desc["motion"])
            for index, correction in desc.get("motionCorrections", {}).items():
                raw_motion[int(index)].info["scaleCorrection"] = correction
            # Each generated action strip can have a different body scale.
            # Crouch and jump use an upright body's scale, not bent pose height.
            guard_height = median(f.height for f in raw_motion[10:12])
            motion = (normalize(raw_motion[:4]) + normalize(raw_motion[4:8])
                      + normalize(raw_motion[8:10], reference=guard_height)
                      + normalize(raw_motion[10:12], reference=guard_height)
                      + normalize(raw_motion[12:16], reference=guard_height))
            combat_desc = desc["combat"]
            raw_combat = slots(source, combat_desc)
            # The reaction row uses its configured upright pose as a body reference,
            # preserving the proportions of leaning and lying poses.
            reaction = raw_combat[-4:]
            reaction_height = reaction[desc["combat"].get("reactionReference", 1)].height
            combat = normalize(raw_combat[:-4]) + normalize(reaction, reference=reaction_height)
            if "insertLow" in combat_desc:
                low = normalize(slots(source, combat_desc["insertLow"]), body_height=110)
                combat[8:8] = low
            if len(motion) != 16 or len(combat) != 24:
                raise ValueError("Expected 16 motion and 24 combat frames")
            for kind, frames in (("motion", motion), ("combat", combat)):
                name = f"{character}-{skin}-{kind}.webp"
                packed = atlas(frames, name)
                preview(packed, name.replace(".webp", ".png"))
                audit.append({"file": name, "frames": len(frames), "size": packed.size,
                              "frameSize": SIZE, "alpha": "binary", "anchor": [SIZE // 2, FOOT], "bodyHeight": BODY_HEIGHT,
                              "frameBounds": [list(f.getbbox()) for f in frames],
                              "normalization": "action-strip body references; never shrink to fit an extended limb"})
    stage = Image.open(source / spec["stage"]).convert("RGB").resize((640, 360), Image.Resampling.NEAREST)
    stage.save(OUT / "boardwalk.webp", "WEBP", lossless=True)
    (OUT / "compiled.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"atlases": len(audit), "frames": sum(a["frames"] for a in audit), "output": str(OUT)}))


if __name__ == "__main__":
    main()
