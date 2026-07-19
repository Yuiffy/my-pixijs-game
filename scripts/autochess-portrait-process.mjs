import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const usage = `Usage: node scripts/autochess-portrait-process.mjs --input <approved-candidate.png> --output <public-path> [--remove-background]

Normalizes a human-approved candidate to a 512x512 transparent PNG. --remove-background requires Python packages Pillow and rembg. Without it, the source must already have a transparent background.`;

const readOption = (args, option) => {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}.`);
  return value;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const input = readOption(args, "--input");
  const output = readOption(args, "--output");
  const removeBackground = args.includes("--remove-background");
  if (!input || !output) throw new Error(usage);
  if (path.extname(output).toLowerCase() !== ".png") throw new Error("--output must end in .png.");
  await access(input);
  await mkdir(path.dirname(output), { recursive: true });

  const python = String.raw`
import sys
from pathlib import Path
from PIL import Image

input_path, output_path, remove_background = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
image = Image.open(input_path).convert("RGBA")
if remove_background:
    try:
        from rembg import remove
    except ImportError as error:
        raise SystemExit("Background removal requires rembg. Install it with: python -m pip install rembg onnxruntime") from error
    image = remove(image).convert("RGBA")
elif image.getchannel("A").getextrema()[0] == 255:
    raise SystemExit("Input has no transparent pixels. Re-run with --remove-background after installing rembg, or approve a transparent candidate.")

# Preserve the approved silhouette, center it, and enforce a 10% transparent safety margin.
alpha = image.getchannel("A")
bbox = alpha.getbbox()
if bbox is None:
    raise SystemExit("Input contains no visible pixels after processing.")
subject = image.crop(bbox)
max_side = round(512 * 0.80)
scale = min(max_side / subject.width, max_side / subject.height)
resample = Image.Resampling.LANCZOS
subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), resample)
canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
canvas.alpha_composite(subject, ((512 - subject.width) // 2, (512 - subject.height) // 2))
canvas.save(output_path, "PNG", optimize=True)
print(f"Published normalized portrait: {output_path}")
`;
  const result = spawnSync("python", ["-c", python, input, output, removeBackground ? "1" : "0"], { encoding: "utf8" });
  if (result.error) throw new Error(`Unable to start Python: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || "Portrait processing failed.");
  console.log(result.stdout.trim());
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
