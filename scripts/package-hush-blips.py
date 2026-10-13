"""One shared original cartoon chatter bank. No TTS, voice references or speaker output.
Uses numpy, soundfile and ffmpeg; existing music and Foley are copied intact.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import numpy as np
import soundfile as sf

SR = 24000
NOTES = [[65, 67, 69, 72, 71, 69, 67, 65, 64, 65, 67, 69, 67, 65, 64, 60],
         [69, 67, 65, 67, 69, 72, 71, 69, 67, 65, 64, 65, 67, 64, 62, 60]]
DURATIONS = dict(zip(['private-mute', 'trip', 'break-out', 'break-back', 'repair',
    'food', 'hug', 'nap', 'off-air', 'after-rice', 'after-shower', 'after-supper',
    'ending-lamp', 'ending-rice-share', 'ending-kitchen-care', 'ending-warm-water',
    'ending-dry-hair', 'ending-supper-table', 'ending-night-walk'],
    [2.68, 3.85, 3.44, 2.79, 4.08, 3.2, 2.12, 3.94, 3.95, 2.99, 3.52, 2.55,
     2.49, 2.62, 2.69, 3.38, 2.3, 3.23, 2.66]))
DURATIONS.update({**{f'talk-{i}': 12 for i in range(3)},
    **{f'whisper-{i}': 3 for i in range(2)}, **{f'song-{i}': 7 for i in range(2)}})


def blip(frequency, seconds, musical=False):
    t = np.arange(round(seconds*SR))/SR
    # Rounded sine body, mild harmonics, smooth edges instead of harsh chip buzz.
    phase = 2*np.pi*np.cumsum(frequency*(1 + .025*np.exp(-t/.025)))/SR
    body = .84*np.sin(phase) + .12*np.sin(2*phase) + .025*np.sin(3*phase)
    envelope = np.minimum(1, t/.014)*np.minimum(1, (seconds-t)/.025)
    envelope *= np.exp(-t/(.38 if musical else .09))
    return body*envelope*.16


def chatter(name, seconds):
    seed = int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], 'little')
    rng = np.random.default_rng(seed)
    y = np.zeros(round(seconds*SR))
    whisper = name.startswith(('whisper', 'ending', 'after'))
    if name.startswith('song'):
        pulses = [(i*.4375+.035, 440*2**((midi-69)/12), .29)
                  for i, midi in enumerate(NOTES[int(name[-1])])]
    else:
        pulses, at = [], .045
        while at < seconds-.12:
            count = int(rng.integers(3, 7))
            for i in range(count):
                if at >= seconds-.12:
                    break
                frequency = (260 if whisper else 310)*2**((rng.integers(-3, 4)+(i/count-.5)*2)/12)
                length = float(rng.uniform(.055, .09))
                pulses.append((at, frequency, length))
                at += length + float(rng.uniform(.055, .105))
            at += float(rng.uniform(.27, .48))
    for at, frequency, length in pulses:
        sound = blip(frequency, length, name.startswith('song'))
        start = round(at*SR)
        size = min(len(sound), len(y)-start)
        y[start:start+size] += sound[:size]*(.58 if whisper else 1)
    return y


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le',
        '-ac', '1', '-ar', str(SR), 'pipe:1'], check=True, capture_output=True).stdout
    y = np.frombuffer(raw, dtype='<f4')
    if not np.isfinite(y).all() or np.sqrt(np.mean(y*y)) < 1e-6:
        raise ValueError(f'Invalid audio: {path}')
    return y


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--common-source', type=Path, default=Path('public/games/hush-live/audio-v2'))
    args = p.parse_args()
    out = Path('public/games/hush-live/audio-v2')
    out.mkdir(parents=True, exist_ok=True)
    scratch = Path('tmp/hush-blips-bake')
    scratch.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads((args.common_source/'manifest.json').read_text(encoding='utf-8'))
    clips, delivered = {}, {}
    for key, item in source_manifest['clips'].items():
        if key.split('/')[0] not in ['music', 'ambience', 'sfx']:
            continue
        dest = out/(key+'.mp3')
        dest.parent.mkdir(parents=True, exist_ok=True)
        source = Path('public'+item['src'])
        if source.resolve() != dest.resolve():
            shutil.copyfile(source, dest)
        clips[key] = {**item, 'src': '/'+dest.relative_to('public').as_posix()}
    lines = json.loads(Path('scripts/hush-voice-lines.json').read_text(encoding='utf-8'))
    for name, duration in DURATIONS.items():
        wave = scratch/(name+'.wav')
        dest = out/'voice'/(name+'.mp3')
        dest.parent.mkdir(exist_ok=True)
        sf.write(wave, chatter(name, duration), SR)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wave), '-c:a',
            'libmp3lame', '-b:a', '64k', str(dest)], check=True)
        y = decode(dest)
        envelope = [float(min(1, np.sqrt(np.mean(y[i:i+960]**2))/.065))
                    for i in range(0, len(y), 960)]
        clips['voice/'+name] = dict(src='/'+dest.relative_to('public').as_posix(),
            duration=duration, text=lines.get(name, '原创旋律拟声，无真实歌词'),
            envelope=envelope, envelopeRate=25,
            sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
    for key, item in clips.items():
        path = Path('public'+item['src'])
        y = decode(path)
        delivered[key] = dict(bytes=path.stat().st_size, sha256=item['sha256'],
            seconds=len(y)/SR, rms=float(np.sqrt(np.mean(y*y))), peak=float(np.abs(y).max()))
    manifest = dict(version=2, voiceStyle='shared-cartoon-blips', clips=clips)
    (out/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    report = dict(method='One original procedural cartoon blip voice shared by all five characters; no TTS or voice references',
        clips=delivered, total_bytes=sum(v['bytes'] for v in delivered.values()), human_listening_review=False)
    Path('docs/hush-audio-delivery.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Packaged {len(clips)} clips; {report['total_bytes']} bytes", flush=True)


if __name__ == '__main__':
    main()
