import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const e = await loadTypescriptModule('src/components/hushLive/engine.ts');
const a = await loadTypescriptModule('src/components/hushLive/audioPlan.ts');
const manifest = JSON.parse(fs.readFileSync('public/games/hush-live/audio-v2/manifest.json', 'utf8'));
const game = skin => { const s = e.createGame(4, 2, 5, skin); s.phase='playing'; s.daily.arrival='done'; s.daily.household.rest.stage='done'; return s; };

test('all five characters share synchronized cartoon chatter and two melodic blip hooks', () => {
  for (const skin of ['host','sui','nana7mi','shiori','mizuki']) {
    const s=game(skin);
    for (const [time,mode,duration] of [[1,'talk',12],[12.5,'sing',7],[19.5,'whisper',3]]) {
      s.elapsed=time; const plan=a.liveVoice(s); assert.equal(plan.mode,mode);
      assert.ok(plan.clip.startsWith('voice/'));
      const other=game(skin==='host'?'sui':'host'); other.elapsed=time;
      assert.equal(a.liveVoice(other).clip,plan.clip,'Characters use the same asset instead of duplicate voice banks');
      const clip=manifest.clips[plan.clip]; assert.ok(clip); assert.equal(clip.duration,duration);
      assert.ok(clip.envelope.some(v=>v>.05)); assert.ok(clip.text.length>5);
      assert.equal(plan.offset, mode==='talk'?time:mode==='sing'?time-12:time-19);
      assert.equal(a.musicFor(s), mode==='sing'?'music/'+plan.clip.split('/')[1]:'music/apartment');
    }
    s.elapsed=2; const first=a.liveVoice(s); s.elapsed=24; assert.notEqual(a.liveVoice(s).clip,first.clip);
    for(const pause of ['paused','ready','result']) {s.phase=pause;assert.equal(a.liveVoice(s),null);}
  }
});

test('breaks, isolation, private mute and off-air suppress live speech until resumed', () => {
  const s=game('sui');
  for(const rest of ['out','inside','back']) {s.daily.household.rest.stage=rest; assert.equal(a.liveVoice(s),null);}
  s.daily.household.rest.stage='done'; assert.ok(a.liveVoice(s));
  s.daily.events.repair.stage='isolated'; assert.equal(a.liveVoice(s),null);
  s.daily.events.repair.stage='fixed'; s.muted=7; assert.equal(a.liveVoice(s),null);
  s.muted=0; s.daily.stage='sleep'; assert.equal(a.liveVoice(s),null); assert.equal(a.musicFor(s),'music/lamplight');
});

test('private and ending dialogue fire on transitions rather than every frame', () => {
  const s=game('mizuki'); const before=a.audioSnapshot(s); s.muted=7;
  assert.equal(a.dialogueEvent(s,before),'private-mute'); assert.equal(a.dialogueEvent(s,a.audioSnapshot(s)),null);
  s.muted=0; const repair=a.audioSnapshot(s); s.daily.events.repair.stage='fixed';assert.equal(a.dialogueEvent(s,repair),'repair');
  for(const after of ['rice','shower','supper']) for(const choice of ['care','together']) {
    const x=game('shiori'); const old=a.audioSnapshot(x);x.won=true;x.phase='result';x.daily.after=after;x.daily.endingChoice=choice;
    const clip=a.dialogueEvent(x,old); assert.ok(manifest.clips['voice/'+clip]);assert.equal(a.dialogueEvent(x,a.audioSnapshot(x)),null);
    assert.ok(manifest.clips[a.musicFor(x)]);
  }
});

test('audio settings reject invalid saved data and clamp three independent buses', () => {
  assert.deepEqual(a.parseAudioMix(null),a.DEFAULT_MIX);
  assert.deepEqual(a.parseAudioMix({voice:3,music:-1,effects:NaN}),{voice:1,music:0,effects:a.DEFAULT_MIX.effects});
  assert.deepEqual(a.parseAudioMix({voice:.1,music:.9,effects:0}),{voice:.1,music:.9,effects:0});
});

test('every deployable clip matches its manifest hash, valid duration and mouth envelope', () => {
  assert.equal(Object.keys(manifest.clips).length,49);
  assert.equal(manifest.voiceStyle,'shared-cartoon-blips');
  for(const [id,item] of Object.entries(manifest.clips)) {
    const bytes=fs.readFileSync('public'+item.src);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,id);
    assert.ok(bytes.length>500 && item.duration>.1 && item.duration<40,id);
    if(item.text) {assert.equal(item.envelopeRate,25);assert.ok(Math.abs(item.envelope.length/25-item.duration)<.05);assert.ok(item.envelope.every(v=>Number.isFinite(v)&&v>=0&&v<=1));}
  }
});
