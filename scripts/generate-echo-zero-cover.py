#!/usr/bin/env python3
"""Generate the ECHO ZERO key art using the danmaku-to-summary-ts image pipeline.

Reuses `src/scripts/tuzi_chat_completions.call_tuzi_images_generations` from the
sibling repository (the same /v1/images/generations flow used by its comic
generator), pointed at the local Sub2API provider so no WorkBuddy credits are
involved. Credentials are read from that project's config/secret.json and are
never printed.

Usage:
    python scripts/generate-echo-zero-cover.py
    python scripts/generate-echo-zero-cover.py --model gpt-image-2.6-flare
    python scripts/generate-echo-zero-cover.py --prompt "..." --output public/games/echo-zero/preview.png
"""

import argparse
import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SIBLING = Path(os.environ.get("DANMAKU_PROJECT", "D:/workspace/myrepo/danmaku-to-summary-ts"))
DEFAULT_OUTPUT = REPO_ROOT / "public/games/echo-zero/preview.webp"

PROMPT = (
    "16:9横屏，电影感 3D 次世代动作游戏主视觉海报，单一明确的视觉中心，画面干净高级。"
    "低角度背面视角：一位银白色长发、扎双螺旋卷马尾的少女站在暴雨中废弃的现代都市长街上，"
    "戴黑色猫耳帽，穿oversize淡紫色外套，背后有一对小巧的黑色蝠翼和一环极细的金色光环，"
    "右手握一把细长的青蓝色发光太刀，刀锋拖出一道冷光。"
    "末日封锁区场景：湿漉漉的柏油路面倒映着青色与洋红色霓虹，倾覆的车辆、断裂的路障、"
    "闪烁的中文字形灯牌、远处漆黑的摩天楼群与红色警示灯，尽头是一座巨大的检疫闸门。"
    "大雨如注，体积雾，强烈的轮廓逆光与霓虹边缘光，浅景深，冷暖对比调色（深青蓝 + 绯红），"
    "超精细材质与雨滴细节，胶片颗粒，史诗而克制的悲怆氛围。"
    "构图留出上方与左侧的深色空间用于排版，人物不要变形，四肢与手指结构正常，"
    "画面中不要出现任何文字、字母、标题、Logo、水印或UI。"
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sibling", type=Path, default=DEFAULT_SIBLING)
    parser.add_argument("--provider", choices=["daiYu", "tuZi"], default="tuZi",
                        help="daiYu = local Sub2API (localhost:8080), tuZi = api.tu-zi.com via proxy")
    parser.add_argument("--model", default="gpt-image-2")
    parser.add_argument("--size", default="16:9")
    parser.add_argument("--quality", default="high")
    parser.add_argument("--prompt", default=PROMPT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=float, default=600)
    args = parser.parse_args()

    missing = [name for name in ("requests", "PIL") if importlib.util.find_spec(name) is None]
    if missing:
        print("[ERROR] this Python is missing:", ", ".join(missing))
        print("        Use the interpreter that runs the sibling project, e.g. py -3.12 scripts/generate-echo-zero-cover.py")
        return 1
    scripts_dir = args.sibling / "src/scripts"
    if not scripts_dir.is_dir():
        print("[ERROR] sibling project scripts directory not found:", scripts_dir)
        return 1
    sys.path.insert(0, str(scripts_dir))
    os.environ.setdefault("DANMAKU_PROJECT_ROOT", str(args.sibling))
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

    secret_path = args.sibling / "config/secret.json"
    secret = json.loads(secret_path.read_text(encoding="utf-8-sig"))
    if args.provider == "daiYu":
        provider = secret["providers"]["daiYu"]
        base_url = provider["baseURL"]
        api_key = provider["apiKey"]
        proxy_url = ""
    else:
        base_url = "https://api.tu-zi.com"
        api_key = secret["tuZi"]["apiKey"]
        proxy_url = "http://127.0.0.1:7890"

    from tuzi_chat_completions import call_tuzi_images_generations  # noqa: E402

    generated = call_tuzi_images_generations(
        prompt=args.prompt,
        model=args.model,
        base_url=base_url,
        api_key=api_key,
        proxy_url=proxy_url,
        timeout=args.timeout,
        size=args.size,
        quality=args.quality,
        output_format="png",
        use_tuzi_retry=False,
        provider_label=args.provider,
    )
    if not generated or not Path(generated).is_file():
        print("[ERROR] image generation returned no file")
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix.lower() in {".webp", ".jpg", ".jpeg"}:
        from PIL import Image  # noqa: E402

        with Image.open(generated) as image:
            rgb = image.convert("RGB")
            rgb.thumbnail((1600, 1600), Image.LANCZOS)
            rgb.save(args.output, "WEBP", quality=86, method=6)
    else:
        shutil.copy2(generated, args.output)
    print("[OK] saved:", args.output, "bytes:", args.output.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
