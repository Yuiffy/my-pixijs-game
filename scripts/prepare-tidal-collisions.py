"""Bake gameplay contours from canonical alpha and reviewed anatomical regions.

This is a collision approximation, not semantic segmentation. Costume silhouettes
never enter the simulation. Hair, hats and the distal striking tip are excluded
from hurt regions; special-effect arcs and grabs remain authored in TypeScript.
No runtime getImageData, and no changes to the reviewed sprite artwork.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
PIXELS = ROOT / "public/games/tidal-duel/pixel"
CELL = 8
SIZE = 448
ANCHOR = (224, 440)
QA = ROOT / "tmp/tidal-contact/contours"

# Regions use source pixels, facing right. Include the arm/shin, rather than a
# rectangle spanning the empty space between the character and the tip.
STRIKE_REGIONS = {
    "sui": {
        "combat": [(270, 288, 328, 316), (268, 292, 348, 344), (265, 380, 411, 434),
                   (280, 270, 352, 310), (235, 174, 276, 272)],
        "air": [(256, 260, 342, 310), (251, 312, 361, 342),
                (240, 344, 350, 432), (262, 312, 343, 366)],
    },
    "shiori": {
        "combat": [(270, 288, 340, 317), (265, 285, 371, 337), (264, 379, 402, 431),
                   (250, 254, 343, 302), (249, 158, 277, 274)],
        "air": [(254, 259, 337, 310), (248, 310, 344, 344),
                (239, 344, 354, 424), (249, 334, 350, 400)],
    },
    "mizuki": {
        "combat": [(260, 288, 316, 312), (263, 297, 346, 349), (263, 387, 424, 440),
                   (265, 220, 351, 334), (237, 189, 328, 304)],
        "air": [(253, 268, 338, 312), (250, 289, 364, 337),
                (236, 344, 354, 424), (249, 342, 345, 424)],
    },
}


def region_mask(rectangles):
    mask = np.zeros((SIZE, SIZE), dtype=bool)
    for left, top, right, bottom in rectangles:
        mask[top:bottom, left:right] = True
    return mask


def hurt_regions(sheet, index):
    low = (sheet == "motion" and index == 9) or (sheet == "combat" and 8 <= index < 12)
    if low:
        return [(217, 338, 284, 389), (203, 370, 281, 435), (173, 402, 296, 440)]
    if sheet == "combat" and index == 22:
        # Fallen poses differ in direction between artists. This region is debug
        # geometry only: knockdown/wakeup invulnerability excludes contact.
        return [(120, 398, 340, 440)]
    if sheet == "air" and index == 13:
        return [(217, 276, 283, 337), (191, 309, 282, 365), (166, 340, 305, 402)]
    return [(211, 260, 276, 304), (194, 296, 282, 356), (139, 348, 319, 440)]


def bake(mask):
    # Filter detached alpha debris after clipping. Grid cells need at least 1/8
    # coverage, limiting empty transparent pixels included around narrow limbs.
    labels, _ = ndimage.label(mask)
    sizes = np.bincount(labels.ravel())
    mask &= sizes[labels] >= 16
    grid = mask.reshape(SIZE // CELL, CELL, SIZE // CELL, CELL).mean(axis=(1, 3)) >= .125
    result, previous = [], {}
    for y, row in enumerate(grid):
        starts = np.flatnonzero(np.diff(np.r_[False, row, False].astype(int)) == 1)
        ends = np.flatnonzero(np.diff(np.r_[False, row, False].astype(int)) == -1)
        current = {}
        for start, end in zip(starts, ends):
            key = (int(start), int(end))
            if key in previous:
                rect = previous[key]
                rect[3] += CELL
            else:
                rect = [int(start * CELL), y * CELL, int((end - start) * CELL), CELL]
                result.append(rect)
            current[key] = rect
        previous = current
    return result


def main():
    QA.mkdir(parents=True, exist_ok=True)
    result = {"version": 1, "frameSize": SIZE, "anchor": list(ANCHOR), "cell": CELL,
              "scale": 2, "alphaThreshold": 128, "coverage": .125,
              "method": "Canonical alpha clipped to reviewed body/limb regions; merged 8px grid rectangles.",
              "characters": {}, "sources": []}
    max_rects = 0
    for actor, regions in STRIKE_REGIONS.items():
        result["characters"][actor] = {}
        for sheet, count in (("motion", 16), ("combat", 24), ("air", 16)):
            path = PIXELS / f"{actor}-original-{sheet}.webp"
            atlas = Image.open(path).convert("RGBA")
            assert atlas.size == (SIZE * 4, SIZE * (count // 4))
            result["sources"].append({"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
            frames = []
            preview = Image.new("RGBA", (SIZE * 4, SIZE * (count // 4)), "#211c30")
            draw = ImageDraw.Draw(preview)
            for index in range(count):
                left, top = index % 4 * SIZE, index // 4 * SIZE
                frame = atlas.crop((left, top, left + SIZE, top + SIZE))
                alpha = np.array(frame.getchannel("A")) >= 128
                strike_mask = np.zeros_like(alpha)
                region = None
                if sheet in regions and index % 4 == 1 and index // 4 < len(regions[sheet]):
                    region = regions[sheet][index // 4]
                    strike_mask = alpha & region_mask([region])
                hurt_mask = alpha & region_mask(hurt_regions(sheet, index))
                if region:
                    # The proximal 55% can be whiff-punished. The distal tip can
                    # clash without immediately producing a body trade.
                    x0, y0, x1, y1 = region
                    proximal = (x0, y0, round(x0 + (x1 - x0) * .55), y1)
                    hurt_mask |= alpha & region_mask([proximal])
                    hurt_mask &= ~region_mask([(proximal[2], y0, x1, y1)])
                hurt, strike = bake(hurt_mask), bake(strike_mask)
                assert hurt, f"Empty body: {actor}/{sheet}/{index}"
                if region:
                    assert strike, f"Empty strike: {actor}/{sheet}/{index}"
                max_rects = max(max_rects, len(hurt))
                frames.append({"hurt": hurt, "strike": strike})
                preview.alpha_composite(frame, (left, top))
                for boxes, color in ((hurt, "#74e5a5"), (strike, "#ff7587")):
                    for x, y, w, h in boxes:
                        draw.rectangle((left + x, top + y, left + x + w - 1, top + y + h - 1), outline=color, width=2)
                draw.text((left + 10, top + 10), f"{actor}/{sheet}/{index}", fill="white")
            result["characters"][actor][sheet] = frames
            preview.convert("RGB").resize((896, count // 4 * 224), Image.Resampling.NEAREST).save(QA / f"{actor}-{sheet}.png")
    target = PIXELS / "collision-contours.json"
    target.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    audit = {"frames": 168, "canonicalCostumes": "original", "maxHurtRectangles": max_rects,
             "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
             "regions": STRIKE_REGIONS, "excluded": "Hair, hats, detached debris, distal active tip",
             "sourceHashes": result["sources"]}
    (ROOT / "docs/tidal-duel-collision-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in audit.items() if k in ("frames", "maxHurtRectangles", "bytes", "sha256")}))


if __name__ == "__main__":
    main()
