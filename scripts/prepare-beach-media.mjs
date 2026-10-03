import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Derived delivery files only: retain every original and its existing generation provenance.
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const root = path.resolve('public');
const manifestPath = path.join(root, 'games/beach-volley/media.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const clips = [];
function collect(value) {
  if (value?.src) clips.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(manifest);
const run = (exe, args) => {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  return result.stdout;
};
const report = [];
for (const clip of clips) {
  const src = path.join(root, clip.src);
  const liteSrc = `/games/beach-volley/lite-v4/${path.basename(clip.src)}`;
  const lite = path.join(root, liteSrc);
  fs.mkdirSync(path.dirname(lite), { recursive: true });
  run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-an',
    '-vf', 'scale=640:360:flags=lanczos,setsar=1', '-r', '24',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
    '-maxrate', '400k', '-bufsize', '800k', '-g', '48',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', lite,
  ]);
  const probe = JSON.parse(run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', lite]));
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  if (video?.width !== 640 || video?.height !== 360 || Math.abs(Number(probe.format.duration) - clip.duration) > 0.09 || probe.streams.length !== 1) throw new Error(`Invalid light delivery: ${lite}`);
  clip.lite = { src: liteSrc, bytes: fs.statSync(lite).size };
  report.push({ src: clip.src, originalBytes: fs.statSync(src).size, lite: clip.lite, duration: Number(probe.format.duration) });
}
manifest.version = 4;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const delivery = {
  method: 'Local ffmpeg transcode from existing delivery; no generation or source edits',
  encoding: '640x360 H.264, 24 fps, CRF 30, maxrate 400k, bufsize 800k, GOP 48, yuv420p, faststart, silent',
  originalBytes: report.reduce((sum, clip) => sum + clip.originalBytes, 0),
  liteBytes: report.reduce((sum, clip) => sum + clip.lite.bytes, 0),
  clips: report,
};
fs.writeFileSync('docs/beach-volley-media-delivery.json', `${JSON.stringify(delivery, null, 2)}\n`);
console.log(JSON.stringify({ clips: clips.length, originalBytes: delivery.originalBytes, liteBytes: delivery.liteBytes }));
