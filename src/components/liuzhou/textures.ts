import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// Authored locally; no remote texture requests or image licensing dependencies.
export function cityTexture(kind: "stone" | "wall" | "road" | "dark-stone" | "roof") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle =
    kind === "stone" ? "#c6c3b3" : kind === "wall" ? "#ddd9cb" : kind === "dark-stone" ? "#7b827d" : kind === "roof" ? "#666f68" : "#999e95";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 713;
  for (let i = 0; i < 3000; i++) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const x = Math.floor(seed / 16777216);
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const y = Math.floor(seed / 16777216);
    ctx.fillStyle = i % 2 ? "rgba(255,255,239,.07)" : "rgba(38,48,39,.06)";
    ctx.fillRect(x, y, 2, 2);
  }
  if (kind === "stone" || kind === "wall" || kind === "dark-stone") {
    const height = kind === "stone" ? 64 : 32;
    ctx.strokeStyle = kind === "stone" ? "#aaa998" : kind === "dark-stone" ? "#535e58" : "#c3c1b4";
    ctx.lineWidth = 1.4;
    for (let row = 0; row < 256 / height; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * height);
      ctx.lineTo(256, row * height);
      ctx.stroke();
      for (let x = row % 2 ? -64 : 0; x < 256; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, row * height);
        ctx.lineTo(x, (row + 1) * height);
        ctx.stroke();
      }
    }
  }
  if (kind === "roof") {
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = "#4c5952"; ctx.fillRect(x, 0, 5, 256);
      ctx.fillStyle = "#899085"; ctx.fillRect(x + 5, 0, 3, 256);
      for (let y = 0; y < 256; y += 96) { ctx.fillStyle = "#424f48"; ctx.fillRect(x, y + (x % 64 ? 48 : 0), 32, 3); }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
