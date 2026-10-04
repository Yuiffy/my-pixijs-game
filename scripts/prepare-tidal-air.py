"""Compile whole aerial strips around a reviewed pelvis anchor, without redrawing art."""
import argparse
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/games/tidal-duel/pixel"
SPEC = json.loads((OUT / "source-air-layout.json").read_text(encoding="utf-8"))
compiler_spec = importlib.util.spec_from_file_location("tidal_pixels", ROOT / "scripts/prepare-tidal-pixels.py")
compiler = importlib.util.module_from_spec(compiler_spec)
compiler_spec.loader.exec_module(compiler)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    source = Path(args.source).resolve()
    size = SPEC["frameSize"]
    pelvis = SPEC["pelvis"]
    if size != compiler.SIZE or SPEC["anchor"] != compiler.LAYOUT["anchor"]:
        raise ValueError("Air and ground sprites must share the game frame layout")
    report = []
    for desc in SPEC["sources"]:
        raw = compiler.slots(source, {"file": desc["file"], "rows": [0, 1, 2, 3, 4]})
        if len(raw) != 16 or len(desc["roots"]) != 16:
            raise ValueError("Each aerial sheet requires 16 complete figures and reviewed roots")
        scale = SPEC["bodyHeight"] / raw[desc["bodyReference"]].height
        frames = []
        bounds = []
        roots = []
        for index, (frame, root) in enumerate(zip(raw, desc["roots"])):
            image = frame.resize((round(frame.width * scale), round(frame.height * scale)), Image.Resampling.NEAREST)
            box = image.getbbox()
            x = round(pelvis[0] - root[0] * scale) + box[0]
            y = round(pelvis[1] - root[1] * scale) + box[1]
            image = image.crop(box)
            if x <= 0 or y <= 0 or x + image.width >= size or y + image.height >= size:
                raise ValueError(f"{desc['name']} frame {index} escapes the container; never shrink a wide pose")
            tile = Image.new("RGBA", (size, size))
            tile.alpha_composite(image, (x, y))
            frames.append(tile)
            bounds.append(list(tile.getbbox()))
            roots.append([round(pelvis[0] - root[0] * scale) + round(root[0] * scale),
                          round(pelvis[1] - root[1] * scale) + round(root[1] * scale)])
        name = f"{desc['name']}-air.webp"
        packed = compiler.atlas(frames, name)
        preview = Image.new("RGBA", packed.size, "#342943")
        preview.alpha_composite(packed)
        draw = ImageDraw.Draw(preview)
        for index in range(16):
            x, y = index % 4 * size, index // 4 * size
            draw.line((x, y + pelvis[1], x + size, y + pelvis[1]), fill="#665572")
            draw.line((x + pelvis[0], y + pelvis[1] - 5, x + pelvis[0], y + pelvis[1] + 5), fill="#c2b5df")
            draw.text((x + 6, y + 6), f"{index}: {SPEC['rows'][index // 4]}", fill="#ffe4b5")
        preview_path = ROOT / "tmp/tidal-air" / name.replace(".webp", "-preview.png")
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview.convert("RGB").save(preview_path)
        report.append({"file": name, "frames": 16, "size": list(packed.size), "frameSize": size,
                       "anchor": SPEC["anchor"], "pelvis": pelvis, "frameRoots": roots,
                       "frameBounds": bounds, "bodyHeight": SPEC["bodyHeight"], "scale": scale,
                       "alpha": "binary", "source": desc["file"], "normalization": "shared body scale and pelvis; bent legs do not change the root"})
        print(name, packed.size, "16 frames, shared scale", round(scale, 4))
    (OUT / "compiled-air.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
