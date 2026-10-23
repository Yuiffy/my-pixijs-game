import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Reuse the delivered title's final wide shot; no new generation or credits.
// Interpolate a slow ambient movement, then dissolve the tail into the head.
// The last frame leads into the first frame's source time on every repeat.
const filter = '[0:v]trim=start=6:end=8,setpts=2.5*(PTS-STARTPTS),'
  + 'minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,'
  + 'tpad=stop_mode=clone:stop_duration=0.25,trim=end=5,fps=24,split=2[body][tail];'
  + '[body]trim=end=4,setpts=PTS-STARTPTS,fps=24[b];'
  + '[tail]trim=start=4,setpts=PTS-STARTPTS,fps=24[t];'
  + '[t][b]xfade=transition=fade:duration=1:offset=0,format=yuv420p[v]';
const result = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y', '-i', 'public/games/night-rain/cinema/title.mp4',
  '-filter_complex', filter, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'medium',
  '-crf', '23', '-r', '24', '-fps_mode', 'cfr', '-movflags', '+faststart',
  'public/games/night-rain/cinema/title-loop.mp4',
], { stdio: 'inherit' });
assert.equal(result.status, 0, 'loop encoding succeeds');
