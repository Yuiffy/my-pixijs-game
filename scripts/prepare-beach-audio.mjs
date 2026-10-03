import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const source = path.resolve(process.env.BEACH_AUDIO_SOURCE || 'tmp/beach-audio');
const dest = path.resolve('public/games/beach-volley/audio-v1');
const job = JSON.parse(fs.readFileSync('docs/beach-volley-audio-job.json', 'utf8'));
const manifest = { version: 1, music: {}, voices: {} };
const delivery = { canvasId: job.canvasId, webUrl: job.webUrl, totalBytes: 0, items: {} };
fs.mkdirSync(dest, { recursive: true });
const run = (args) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 32 * 1024 * 1024 });
const probe = (file) => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function signal(file) {
  const pcm = run(['-i', file, '-f', 'f32le', '-ar', '24000', '-ac', '1', 'pipe:1']);
  let squares = 0, peak = 0;
  for (let i = 0; i < pcm.length; i += 4) { const n = pcm.readFloatLE(i); squares += n * n; peak = Math.max(peak, Math.abs(n)); }
  const rmsDb = 10 * Math.log10(squares / (pcm.length / 4));
  if (!(rmsDb > -40 && peak > 0.05 && peak <= 1)) throw new Error(`Invalid audio signal in ${file}: ${rmsDb} dB / ${peak}`);
  return { rmsDb: +rmsDb.toFixed(2), peak: +peak.toFixed(4), samples: pcm.length / 4 };
}
for (const [key, item] of Object.entries(job.items)) {
  if (item.operationState !== 'succeeded' || !item.resourceVerified) throw new Error(`${key} has no verified successful audio resource.`);
  const input = path.join(source, `${key}.source`), output = path.join(dest, `${key}.mp3`);
  const bytes = fs.readFileSync(input), original = probe(input);
  if (hash(bytes) !== item.download.sha256 || bytes.length !== item.download.size) throw new Error(`Download checksum mismatch for ${key}`);
  const isMusic = item.mode === 'music', cue = key.replace(/^music-/, '');
  const loop = isMusic && ['menu', 'match'].includes(cue);
  const normalize = `loudnorm=I=${isMusic ? -18 : -16}:TP=-2:LRA=8`;
  if (loop) {
    // Rotate after a two-second tail/head blend, leaving consecutive samples at the new join.
    const pcm = run(['-i', input, '-af', normalize, '-ar', '32000', '-ac', '2', '-f', 'f32le', 'pipe:1']);
    const overlap = 32000 * 2 * 2, samples = pcm.length / 4;
    if (samples <= overlap * 3) throw new Error('Music is too short to loop.');
    const mixed = Buffer.alloc(overlap * 4);
    for (let i = 0; i < overlap; i++) {
      const t = Math.floor(i / 2) / (overlap / 2 - 1);
      mixed.writeFloatLE(pcm.readFloatLE((samples - overlap + i) * 4) * (1 - t) + pcm.readFloatLE(i * 4) * t, i * 4);
    }
    const loopPcm = path.join(source, `${key}.loop.pcm`);
    fs.writeFileSync(loopPcm, Buffer.concat([pcm.subarray(overlap * 4, (samples - overlap) * 4), mixed]));
    run(['-f', 'f32le', '-ar', '32000', '-ac', '2', '-i', loopPcm, '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', output]);
  } else {
    const filters = isMusic ? `${normalize},afade=t=out:st=9:d=1`
      : `silenceremove=start_periods=1:start_duration=0.01:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_duration=0.01:start_threshold=-48dB,areverse,${normalize},afade=t=in:d=0.01`;
    run(['-i', input, ...(isMusic ? ['-t', '10'] : []), '-af', `${filters},aresample=${isMusic ? 32000 : 24000},alimiter=limit=0.7:level=false:latency=true`, '-ar', isMusic ? '32000' : '24000', '-ac', isMusic ? '2' : '1', '-c:a', 'libmp3lame', '-b:a', isMusic ? '96k' : '64k', '-map_metadata', '-1', output]);
  }
  const result = probe(output), size = fs.statSync(output).size;
  const clip = { src: `/games/beach-volley/audio-v1/${key}.mp3`, bytes: size, duration: +Number(result.format.duration).toFixed(3) };
  if (isMusic) manifest.music[cue] = { ...clip, loop };
  else { const [actor, voiceCue] = key.split('-'); (manifest.voices[actor] ||= {})[voiceCue] = { ...clip, text: item.prompt }; }
  delivery.items[key] = { ...clip, sha256: hash(fs.readFileSync(output)), resourceId: item.resourceId, sourceSha256: item.download.sha256, originalFormat: original.format.format_name, originalDuration: Number(original.format.duration), ...signal(output) };
  delivery.totalBytes += size;
  console.log(`${key}: ${clip.duration}s / ${size} bytes / ${delivery.items[key].rmsDb} dB`);
}
fs.writeFileSync('public/games/beach-volley/audio.json', `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync('docs/beach-volley-audio-delivery.json', `${JSON.stringify(delivery, null, 2)}\n`);
console.log(`Audio delivery: ${delivery.totalBytes} bytes.`);
