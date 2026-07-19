import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const usage = `Usage: node scripts/autochess-portrait-generate.mjs --unit <unit-id> --prompt-file <path> [--count <1-4>] [--size <1024x1024>]

Requires OPENAI_API_KEY. Generated candidates are written to .tmp/autochess-portraits/<unit-id>/ and are never published automatically.`;

const readOption = (args, option, fallback) => {
  const index = args.indexOf(option);
  if (index === -1) return fallback;
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

  const unit = readOption(args, "--unit");
  const promptFile = readOption(args, "--prompt-file");
  const count = Number(readOption(args, "--count", "1"));
  const size = readOption(args, "--size", "1024x1024");
  if (!unit || !promptFile) throw new Error(usage);
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("--count must be an integer from 1 to 4.");
  if (!/^(1024|1536)x(1024|1536)$/.test(size)) throw new Error("--size must be one of 1024x1024, 1024x1536, 1536x1024, or 1536x1536.");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required. Set it in your shell or local environment; do not commit it.");

  const prompt = await readFile(promptFile, "utf8");
  const outputDirectory = path.join(".tmp", "autochess-portraits", unit);
  await mkdir(outputDirectory, { recursive: true });
  const generatedAt = new Date().toISOString();
  const manifest = { unit, promptFile, count, size, generatedAt, model: "gpt-image-1", candidates: [] };

  for (let index = 1; index <= count; index += 1) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size,
        background: "transparent",
        output_format: "png",
        n: 1,
      }),
    });
    if (!response.ok) throw new Error(`Image generation failed (${response.status}): ${await response.text()}`);
    const result = await response.json();
    const imageBase64 = result.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error("Image generation response did not include PNG image data.");
    const filename = `candidate-${String(index).padStart(2, "0")}.png`;
    await writeFile(path.join(outputDirectory, filename), Buffer.from(imageBase64, "base64"));
    manifest.candidates.push(filename);
    console.log(`Created ${path.join(outputDirectory, filename)}`);
  }

  await writeFile(path.join(outputDirectory, "generation.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("Review candidates manually before processing. Do not publish an unreviewed candidate.");
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
