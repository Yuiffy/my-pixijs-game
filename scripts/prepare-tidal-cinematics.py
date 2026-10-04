"""Prepare the three reviewed Dreamina movies; no generation or credit operations."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('--source', default='tmp/tidal-cinema/sources')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
source = Path(args.source).resolve()
target = root / 'public/games/tidal-duel/cinematics'
preview = root / 'tmp/tidal-cinema/previews'
target.mkdir(parents=True, exist_ok=True)
preview.mkdir(parents=True, exist_ok=True)
ffmpeg = shutil.which('ffmpeg')
ffprobe = shutil.which('ffprobe')
if not ffmpeg or not ffprobe:
    raise RuntimeError('ffmpeg and ffprobe are required')
job = json.loads((root / 'docs/tidal-duel-cinematics-job.json').read_text(encoding='utf-8'))
manifest = {'version': 1, 'clips': []}
delivery = {'canvasId': job['canvasId'], 'model': job['model'], 'clips': []}

def run(command):
    return subprocess.run(command, check=True, capture_output=True).stdout

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for actor, item in job['items'].items():
    original = source / f'{actor}.mp4'
    if digest(original) != item['sourceSha256']:
        raise RuntimeError(f'{actor}: downloaded source checksum does not match')
    movie = target / f'{actor}-original.mp4'
    poster = target / f'{actor}-original.webp'
    run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(original),
         '-vf', 'scale=960:540:flags=lanczos,setsar=1,fps=30', '-c:v', 'libx264',
         '-preset', 'medium', '-crf', '25', '-pix_fmt', 'yuv420p',
         '-af', 'loudnorm=I=-18:TP=-2:LRA=11', '-c:a', 'aac', '-b:a', '80k',
         '-ar', '48000', '-movflags', '+faststart', str(movie)])
    probe = json.loads(run([ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)]))
    video = next(stream for stream in probe['streams'] if stream['codec_type'] == 'video')
    audio = next(stream for stream in probe['streams'] if stream['codec_type'] == 'audio')
    duration = float(probe['format']['duration'])
    assert 4.8 < duration < 5.3 and video['width'] == 960 and video['height'] == 540
    run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.3', '-i', str(movie),
         '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', str(poster)])
    # Samples cover the opening, each attack beat, and the final pose.
    sheet = Image.new('RGB', (960, 592), '#171222')
    draw = ImageDraw.Draw(sheet)
    for n, time in enumerate([0.3, 1.2, 2.1, 3.0, 3.9, 4.8]):
        png = run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-ss', str(time), '-i', str(movie),
                   '-frames:v', '1', '-vf', 'scale=320:180', '-f', 'image2pipe', '-vcodec', 'png', '-'])
        frame = Image.open(io.BytesIO(png)).convert('RGB')
        x, y = n % 3 * 320, n // 3 * 296
        sheet.paste(frame, (x, y + 22))
        draw.text((x + 8, y + 6), f'{actor}  {time:.1f}s', fill='#fff0d4')
    sheet.save(preview / f'{actor}-filmstrip.png')
    clip = {'character': actor, 'skin': 'original', 'title': item['title'],
            'src': f'/games/tidal-duel/cinematics/{movie.name}',
            'poster': f'/games/tidal-duel/cinematics/{poster.name}',
            'duration': duration, 'bytes': movie.stat().st_size}
    manifest['clips'].append(clip)
    delivery['clips'].append({**clip, 'sha256': digest(movie), 'posterSha256': digest(poster),
                              'sourceSha256': digest(original), 'resourceId': item['resourceId'],
                              'width': video['width'], 'height': video['height'],
                              'videoCodec': video['codec_name'], 'audioCodec': audio['codec_name'],
                              'audioSampleRate': audio['sample_rate'],
                              'sourceBytes': original.stat().st_size})
    print(f'{actor}: {duration:.3f}s, {movie.stat().st_size:,} bytes')
delivery['totalBytes'] = sum(clip['bytes'] for clip in manifest['clips'])
for filename, data in [('public/games/tidal-duel/cinematics.json', manifest),
                       ('docs/tidal-duel-cinematics-delivery.json', delivery)]:
    (root / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
