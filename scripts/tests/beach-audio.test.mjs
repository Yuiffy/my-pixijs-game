import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { default: BeachAudio, AUDIO, DEFAULT_AUDIO_SETTINGS } = await loadTypescriptModule('src/components/beachVolley/audio.ts');
const { createGame, CHARACTER_IDS } = await loadTypescriptModule('src/components/beachVolley/engine.ts');
const { selectCinematic, nextCinematic } = await loadTypescriptModule('src/components/beachVolley/cinematics.ts');
const { musicForGame, voicesForCinema, voicesForEvent, introVoices } = await loadTypescriptModule('src/components/beachVolley/audioCues.ts');
const media = JSON.parse(fs.readFileSync('public/games/beach-volley/media.json', 'utf8'));
const silentMedia = JSON.parse(JSON.stringify(media, (key, value) => key === 'dialogue' ? undefined : value));
const voiceAsset = (actor, kind) => Array.isArray(AUDIO.voices[actor][kind]) ? AUDIO.voices[actor][kind][0] : AUDIO.voices[actor][kind];
const flush = () => new Promise(resolve => setImmediate(resolve));

test('22 successful pure audio generations ship compressed, non-silent, verified assets', () => {
  const job = JSON.parse(fs.readFileSync('docs/beach-volley-audio-job.json', 'utf8'));
  const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-audio-delivery.json', 'utf8'));
  const clips = Object.values(delivery.items);
  assert.equal(clips.length, 22);
  assert.equal(new Set(clips.map(c => c.src)).size, 22);
  assert.ok(delivery.totalBytes < 2_000_000);
  let total = 0;
  for (const clip of clips) {
    const record = Object.values(delivery.items).find(r => r.src === clip.src);
    const bytes = fs.readFileSync(`public${clip.src}`);
    assert.equal(bytes.length, clip.bytes); total += bytes.length;
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256);
    assert.ok(record.samples > 10000 && record.rmsDb > -25 && record.peak > 0.1 && record.peak <= 1);
    assert.ok(clip.duration > 1 && clip.duration < 65);
  }
  assert.equal(total, delivery.totalBytes);
  for (const item of Object.values(job.items)) {
    assert.equal(item.operationState, 'succeeded'); assert.equal(item.resourceVerified, true);
    assert.ok(item.resourceId && item.submitId);
    assert.ok(['music', 'tts'].includes(item.mode));
    if (item.mode === 'music') assert.equal(item.model, 'seed_music_1.0');
    else assert.ok(item.voiceName && !item.model);
  }
});

test('all matchups voice their actual winner, loser and special actor, including mirrors', () => {
  for (const character of CHARACTER_IDS) for (const opponent of CHARACTER_IDS) {
    const g = createGame({ character, opponent, mode: 'local' });
    assert.deepEqual(introVoices(g).map(c => c.character), [character, opponent]);
    for (const side of [0, 1]) for (const kind of ['intro', 'special', 'point', 'result']) {
      let movie = selectCinematic(g, silentMedia, 'all', false, kind, side);
      const cues = [];
      while (movie) { cues.push(...voicesForCinema(g, movie)); movie = nextCinematic(movie); }
      const expectedSides = kind === 'intro' ? [0, 1] : kind === 'special' ? [side] : [side, 1 - side];
      assert.deepEqual(cues.map(c => c.side), expectedSides);
      assert.ok(cues.every(c => c.character === g.players[c.side].character && AUDIO.voices[c.character][c.kind]));
      if (kind === 'result') assert.deepEqual(cues.map(c => c.kind), ['victory', 'defeat']);
      if (kind === 'point') assert.deepEqual(cues.map(c => c.kind), ['pointWin', 'pointLose']);
    }
  }
});

test('solo loss music follows player outcome; local champions and practice keep appropriate music', () => {
  const g = createGame(); assert.equal(musicForGame(g, null), 'menu');
  g.phase = 'rally'; assert.equal(musicForGame(g, null), 'match');
  g.phase = 'result'; g.winner = 1; assert.equal(musicForGame(g, null), 'defeat');
  g.winner = 0; assert.equal(musicForGame(g, null), 'victory');
  g.options.mode = 'local'; g.winner = 1; assert.equal(musicForGame(g, null), 'victory');
  g.phase = 'rally'; g.options.mode = 'practice'; assert.equal(musicForGame(g, null), 'match');
  g.options.mode = 'solo';
  assert.deepEqual(voicesForEvent(g, { id: 1, type: 'point', side: 1 }), [{ character: 'sui', side: 0, kind: 'pointLose' }]);
  assert.deepEqual(voicesForEvent(g, { id: 2, type: 'win', side: 1 }).map(c => c.kind), ['victory', 'defeat']);
});

async function mocked(task) {
  const previousContext = globalThis.AudioContext, previousFetch = globalThis.fetch;
  const contexts = [], requests = [];
  class Param {
    value = 1;
    setValueAtTime(value) { this.value = value; }
    linearRampToValueAtTime(value) { this.value = value; }
    exponentialRampToValueAtTime(value) { this.value = value; }
    setTargetAtTime(value) { this.value = value; }
    cancelScheduledValues() {}
  }
  class Node {
    constructor(kind) { this.kind = kind; this.gain = new Param(); this.frequency = new Param(); this.started = false; this.stopped = false; this.onended = null; }
    connect() {} disconnect() {}
    start() { this.started = true; }
    stop() { this.stopped = true; }
    end() { this.onended?.(); }
  }
  class Context {
    state = 'suspended'; currentTime = 0; destination = {}; nodes = [];
    constructor() { contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { const n = new Node('gain'); this.nodes.push(n); return n; }
    createBufferSource() { const n = new Node('buffer'); this.nodes.push(n); return n; }
    createOscillator() { const n = new Node('oscillator'); this.nodes.push(n); return n; }
    decodeAudioData() { return Promise.resolve({ duration: 4 }); }
  }
  globalThis.AudioContext = Context;
  globalThis.fetch = (src, { signal }) => new Promise((resolve, reject) => {
    const r = { src, signal, done: false, complete(ok = true) { if (r.done) return; r.done = true; resolve({ ok, status: ok ? 200 : 404, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }); } };
    requests.push(r);
    signal.addEventListener('abort', () => { r.done = true; reject(new DOMException('Aborted', 'AbortError')); });
  });
  const audio = new BeachAudio(() => 0);
  const drain = async () => { for (let i = 0; i < 100; i++) { const r = requests.find(r => !r.done); if (!r) { await flush(); if (!requests.some(r => !r.done)) break; } else { r.complete(); await flush(); } } };
  try { await task({ audio, contexts, requests, drain }); }
  finally { audio.dispose(); await flush(); globalThis.AudioContext = previousContext; globalThis.fetch = previousFetch; }
}

test('one download at a time prepares only this matchup and drops obsolete actors', () => mocked(async ({ audio, requests, drain }) => {
  audio.prepare(['sui', 'nagisa']); assert.equal(requests.filter(r => !r.done).length, 1);
  await drain(); assert.equal(audio.snapshot().loaded, 32);
  assert.ok(requests.every(r => !r.src.includes('shiori')));
  const initial = requests.length;
  audio.prepare(['shiori', 'shiori']); await drain(); assert.equal(audio.snapshot().loaded, 18);
  assert.ok(requests.slice(initial).every(r => r.src.includes('shiori')));
}));

test('gesture unlock, loop and one-shot music, ducking and pause preserve playback', () => mocked(async ({ audio, contexts, drain }) => {
  audio.prepare(['sui']); await drain(); assert.equal(contexts.length, 0);
  audio.unlock(); await flush(); assert.equal(audio.snapshot().musicPlaying, true);
  const ctx = contexts[0], music = ctx.nodes.find(n => n.kind === 'buffer'); assert.equal(music.loop, true);
  audio.queueVoices([{ character: 'sui', side: 0, kind: 'special' }], 'one'); await flush();
  assert.equal(audio.snapshot().voicePlaying, true); assert.equal(audio.snapshot().musicGain, 0.1);
  const voice = ctx.nodes.filter(n => n.kind === 'buffer').at(-1);
  audio.setPaused(true); assert.equal(ctx.state, 'suspended'); assert.equal(voice.stopped, false);
  audio.setPaused(false); await flush(); assert.equal(audio.snapshot().voicePlaying, true);
  voice.end(); assert.equal(audio.snapshot().voice, null); assert.equal(audio.snapshot().musicGain, 0.38);
  audio.setScene('defeat'); await flush(); const ending = ctx.nodes.filter(n => n.kind === 'buffer').at(-1);
  assert.equal(ending.loop, false); ending.end(); audio.setScene('defeat'); await flush(); assert.equal(audio.snapshot().musicPlaying, false);
}));

test('skipped or restarted speech cannot start from a late network response', () => mocked(async ({ audio, contexts, requests, drain }) => {
  audio.prepare(['sui']); audio.unlock(); audio.queueVoices([{ character: 'sui', side: 0, kind: 'special' }], 'old');
  await flush(); assert.equal(requests.find(r => !r.done).src, voiceAsset('sui', 'special').src);
  audio.clearVoices(); await drain(); audio.setScene('menu'); await flush();
  assert.equal(audio.snapshot().voice, null);
  assert.equal(contexts[0].nodes.filter(n => n.kind === 'buffer').length, 1, 'only BGM started');
  audio.queueVoices([{ character: 'sui', side: 0, kind: 'victory' }], 'new'); await flush();
  assert.equal(audio.snapshot().voice.kind, 'victory'); audio.resetMatch(); assert.equal(audio.snapshot().voice, null);
}));

test('cold video holds BGM downloads while a short active voice has priority', () => mocked(async ({ audio, requests, drain }) => {
  audio.prepare(['sui']); audio.unlock(); audio.setBackgroundPaused(true); await flush();
  assert.equal(requests.filter(r => !r.done).length, 0);
  audio.queueVoices([{ character: 'sui', side: 0, kind: 'special' }], 'special'); await flush();
  const r = requests.find(r => !r.done); assert.equal(r.src, voiceAsset('sui', 'special').src); r.complete(); await flush();
  assert.equal(audio.snapshot().voicePlaying, true); assert.equal(requests.filter(r => !r.done).length, 0);
  audio.setBackgroundPaused(false); await drain(); assert.equal(audio.snapshot().loaded, 18);
}));

test('native cold movies release an obsolete speech download and resume it only in the background', () => mocked(async ({ audio, requests, drain }) => {
  audio.prepare(['sui']); audio.unlock(); audio.setBackgroundPaused(true); await flush();
  audio.queueVoices([{ character: 'sui', side: 0, kind: 'intro' }], 'intro'); await flush();
  const speech = requests.find(r => !r.done);
  assert.equal(speech.src, voiceAsset('sui', 'intro').src);
  audio.setCinemaDialogue(true); audio.queueVoices([], 'native'); await flush();
  assert.equal(speech.signal.aborted, true);
  assert.equal(requests.filter(r => !r.done).length, 0);
  assert.equal(audio.snapshot().voice, null);
  audio.setBackgroundPaused(false); await drain();
  assert.equal(audio.snapshot().loaded, 18);
  assert.equal(audio.snapshot().voice, null);
}));

test('master mute cancels speech, independent switches preserve effects, and match event IDs reset', () => mocked(async ({ audio, contexts, drain }) => {
  audio.prepare(['sui']); await drain(); audio.unlock(); await flush();
  audio.event({ id: 1, type: 'serve', side: 0 }); const ctx = contexts[0];
  assert.equal(ctx.nodes.filter(n => n.kind === 'oscillator').length, 2);
  audio.event({ id: 1, type: 'serve', side: 0 }); assert.equal(ctx.nodes.filter(n => n.kind === 'oscillator').length, 2);
  audio.resetMatch(); audio.event({ id: 1, type: 'serve', side: 0 }); assert.equal(ctx.nodes.filter(n => n.kind === 'oscillator').length, 4);
  audio.queueVoices([{ character: 'sui', side: 0, kind: 'special' }], 'special'); await flush();
  audio.configure({ ...DEFAULT_AUDIO_SETTINGS, enabled: false }); assert.equal(ctx.state, 'suspended'); assert.equal(audio.snapshot().voice, null);
  assert.equal(ctx.nodes[0].gain.value, 0);
  audio.configure({ enabled: true, music: false, voices: false }); await flush();
  assert.equal(audio.snapshot().musicPlaying, false); assert.equal(audio.snapshot().musicGain, 0);
  audio.event({ id: 2, type: 'serve', side: 0 }); assert.equal(ctx.nodes.filter(n => n.kind === 'oscillator').length, 6);
}));

test('failed audio finishes its cue without stopping subsequent voices or retrying forever', () => mocked(async ({ audio, requests, drain }) => {
  audio.prepare(['sui']); audio.unlock();
  audio.queueVoices([{ character: 'sui', side: 0, kind: 'special' }, { character: 'sui', side: 0, kind: 'victory' }], 'failed'); await flush();
  requests.find(r => !r.done).complete(false); await flush(); await drain(); await flush();
  assert.ok(audio.snapshot().failures.includes(voiceAsset('sui', 'special').src)); assert.equal(audio.snapshot().voice.kind, 'victory');
  const count = requests.length;
  audio.queueVoices([{ character: 'sui', side: 0, kind: 'special' }], 'again'); await flush(); assert.equal(requests.length, count);
}));

test('each contact voices its actual athlete once; preparation and empty swings are silent', () => mocked(async ({ audio, contexts, drain }) => {
  audio.prepare(['sui', 'shiori']); await drain(); audio.unlock(); await flush();
  const actors = ['sui', 'shiori'];
  let previous = null;
  for (const [id, type, side] of [[1, 'serve', 0], [2, 'hit', 1], [3, 'spike', 0], [4, 'hit', 1]]) {
    audio.event({ id, type, side }, actors);
    const s = audio.snapshot(); assert.equal(s.effortPlayed, id);
    assert.equal(s.lastEffort.character, actors[side]);
    assert.equal(s.lastEffort.eventId, id);
    if (previous && previous.character === actors[side]) assert.notEqual(s.lastEffort.src, previous.src);
    previous = s.lastEffort;
    audio.event({ id, type, side }, actors); assert.equal(audio.snapshot().effortPlayed, id);
  }
  audio.event({ id: 5, type: 'special', side: 0 }, actors);
  audio.event({ id: 6, type: 'jump', side: 1 }, actors);
  assert.equal(audio.snapshot().effortPlayed, 4);
  const active = contexts[0].nodes.filter(n => n.kind === 'buffer' && !n.loop && n.started);
  audio.configure({ enabled: true, music: true, voices: false }); assert.ok(active.every(n => n.stopped));
  audio.event({ id: 7, type: 'hit', side: 0 }, actors); assert.equal(audio.snapshot().effortPlayed, 4);
}));

test('speech variants avoid repeats and native dialogue ducks music without an external voice', () => mocked(async ({ audio, drain }) => {
  audio.prepare(['sui']); await drain(); audio.unlock(); await flush();
  const cue = [{ character: 'sui', side: 0, kind: 'pointWin' }]; const sources = [];
  for (let i = 0; i < 4; i++) {
    audio.queueVoices(cue, `point:${i}`); await flush(); sources.push(audio.snapshot().voice.src);
  }
  assert.ok(sources.every((src, i) => !i || src !== sources[i - 1]));
  audio.clearVoices(); audio.setCinemaDialogue(true);
  assert.equal(audio.snapshot().voice, null); assert.equal(audio.snapshot().musicGain, 0.1);
  audio.configure({ enabled: true, music: true, voices: false });
  assert.equal(audio.snapshot().musicGain, 0.38, 'muted native dialogue does not lower music');
  audio.configure({ enabled: true, music: true, voices: true });
  assert.equal(audio.snapshot().musicGain, 0.1);
  audio.setCinemaDialogue(false); assert.equal(audio.snapshot().musicGain, 0.38);
}));

test('a later point event cannot hide a contact, and old contacts do not replay', () => mocked(async ({ audio, drain }) => {
  audio.prepare(['sui']); await drain(); audio.unlock(); await flush();
  const contact = { id: 1, type: 'hit', side: 0 };
  audio.event({ id: 2, type: 'point', side: 1 }, ['sui', 'sui'], contact);
  assert.equal(audio.snapshot().effortPlayed, 1);
  audio.event({ id: 3, type: 'jump', side: 0 }, ['sui', 'sui'], contact);
  assert.equal(audio.snapshot().effortPlayed, 1);
  audio.resetMatch(); audio.event({ id: 4, type: 'serve', side: 1 }, ['sui', 'sui'], { id: 4, type: 'serve', side: 1 });
  assert.equal(audio.snapshot().effortPlayed, 2);
}));
