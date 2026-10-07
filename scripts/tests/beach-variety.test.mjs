import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { VariantPicker } = await loadTypescriptModule('src/components/beachVolley/variants.ts');
const { createGame, CHARACTER_IDS } = await loadTypescriptModule('src/components/beachVolley/engine.ts');
const { selectCinematic, nextCinematic, matchMediaClips } = await loadTypescriptModule('src/components/beachVolley/cinematics.ts');
const { voicesForCinema } = await loadTypescriptModule('src/components/beachVolley/audioCues.ts');
const media = JSON.parse(fs.readFileSync('public/games/beach-volley/media.json', 'utf8'));
const audio = JSON.parse(fs.readFileSync('public/games/beach-volley/audio.json', 'utf8'));

test('all active external voices retain authentic recording provenance', () => {
  const recordings = JSON.parse(fs.readFileSync('docs/beach-volley-recording-delivery.json', 'utf8'));
  const nagisa = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-recording-delivery.json', 'utf8'));
  const assets = { ...recordings.items, ...nagisa.items };
  for (const actor of CHARACTER_IDS) {
    for (const pool of [...Object.values(audio.voices[actor]), audio.effort[actor]]) {
      assert.ok(Array.isArray(pool) && pool.length >= 2);
      for (const clip of pool) {
        const bytes = fs.readFileSync(`public${clip.src}`);
        const evidence = Object.values(assets).find(i => i.src === clip.src);
        assert.ok(evidence, clip.src);
        assert.equal(bytes.length, clip.bytes);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
        assert.equal(evidence.conversion, 'authentic-recording');
        assert.ok(['authentic-button', 'authentic-livestream'].includes(evidence.sourceKind));
        assert.equal(evidence.contiguousCrop.length, 2);
        assert.ok(evidence.contiguousCrop[1] > evidence.contiguousCrop[0]);
        assert.match(evidence.sourceSha256, /^[a-f0-9]{64}$/);
        assert.ok(evidence.rmsDb > -30 && evidence.peak > 0.15 && evidence.peak <= 1);
        if (evidence.scene !== 'effort') {
          assert.equal(evidence.asr.sha256, evidence.sha256);
          assert.ok(evidence.asr.transcript, 'final encoded speech was checked, including short exclamations');
          if (evidence.duration >= 1 && evidence.text.length >= 4) {
            // Button labels can include homophones such as 欺米 / 七米 and 甚 / 深.
            const homophones = evidence.sourceKind === 'authentic-button'
              && evidence.asr.phoneticSimilarity >= 0.85;
            assert.ok(evidence.asr.similarity >= 0.65 || homophones, 'longer lines retain a useful independent content check');
          }
        }
      }
    }
    assert.ok(audio.effort[actor].every(c => c.duration <= 0.7 && c.bytes < 7000));
  }
});

test('retired RVC delivery still preserves historical training evidence', () => {
  const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-rvc-delivery.json', 'utf8'));
  const training = JSON.parse(fs.readFileSync('docs/beach-volley-rvc-training.json', 'utf8'));
  assert.equal(new Set(Object.values(delivery.models).map(m => m.modelSha256)).size, 3);
  for (const actor of CHARACTER_IDS) {
    assert.equal(delivery.models[actor].version, actor === 'sui' ? 'v1' : 'v2');
    if (actor !== 'sui') {
      const record = training.datasets[actor];
      assert.equal(record.epochsCompleted, 120);
      assert.ok(record.cleanSpeechSeconds > 300 && record.sampleCount > 100);
      assert.equal(record.modelSha256, delivery.models[actor].modelSha256);
      assert.equal(record.indexSha256, delivery.models[actor].indexSha256);
      assert.ok(record.terminalEvidence.some(line => line.includes('saving final ckpt:Success.')));
    }
    for (const scene of Object.keys(audio.voices[actor])) assert.equal(delivery.items[`${actor}-${scene}-1`].conversion, 'RVC');
  }
});

test('a silent next actor never inherits native dialogue or the preceding video source', () => {
  const g = createGame({ character: 'sui', opponent: 'nagisa', mode: 'local' });
  const fixture = { ...media, characters: {
    sui: { point: { win: media.characters.sui.point.win.filter(c => c.dialogue) } },
    nagisa: { point: { lose: media.characters.nagisa.point.lose.filter(c => !c.dialogue) } },
  } };
  const winner = selectCinematic(g, fixture, 'all', false, 'point', 0);
  assert.ok(winner.dialogue);
  const loser = nextCinematic(winner);
  assert.equal(loser.character, 'nagisa');
  assert.equal(loser.dialogue, undefined);
  assert.equal(loser.src, winner.clips[1].src);
  assert.deepEqual(voicesForCinema(g, loser), [{ character: 'nagisa', side: 1, kind: 'pointLose' }]);
});

test('embedded performer dialogue retains faststart light variants and authenticated audio provenance', () => {
  const job = JSON.parse(fs.readFileSync('docs/beach-volley-variety-job.json', 'utf8'));
  const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-variety-delivery.json', 'utf8'));
  const dubbing = JSON.parse(fs.readFileSync('docs/beach-volley-dubbing-delivery.json', 'utf8'));
  const nagisaDubbing = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-dubbing-delivery.json', 'utf8'));
  const rally = JSON.parse(fs.readFileSync('docs/beach-volley-rally-delivery.json', 'utf8'));
  assert.equal(Object.keys(delivery.items).length, 15);
  for (const actor of CHARACTER_IDS) {
    const pools = [media.characters[actor].special, media.characters[actor].point.win, media.characters[actor].point.lose, media.characters[actor].result.win, media.characters[actor].result.lose];
    for (const pool of pools) {
      assert.equal(pool.length, 2);
      assert.equal(new Set(pool.map(c => c.src)).size, 2);
      assert.equal(pool.filter(c => c.dialogue).length, 1);
      const movie = pool.find(c => c.dialogue);
      const isRally = pool === media.characters[actor].special;
      const record = Object.values(actor === 'nagisa' ? nagisaDubbing.items : isRally ? rally.items : dubbing.items).find(i => i.src === movie.src);
      assert.ok(record, movie.src);
      if (actor === 'nagisa') {
        if (!isRally) {
          const original = Object.values(delivery.items).find(i => i.src === record.originalSrc);
          assert.equal(record.originalSha256, original.sha256);
          const request = Object.values(job.items).find(i => i.resourceId === original.resourceId);
          assert.equal(request.operationState, 'succeeded');
        }
        assert.equal(record.lite.imageStreamCopied, true);
        assert.equal(record.lite.audioStreamCopiedFromStandard, true);
      }
      assert.equal(movie.dialogue.source, 'recording');
      assert.equal(record.originalSoundtrackRemoved, true);
      if (isRally && actor !== 'nagisa') assert.equal(record.generatedSoundtrackRemoved, true);
      else assert.equal(record.imageStreamCopied, true);
      const voice = fs.readFileSync(`public${record.voiceSrc}`);
      assert.equal(crypto.createHash('sha256').update(voice).digest('hex'), record.voiceSha256);
      assert.ok(record.voiceEnd < movie.duration, 'the entire line fits the animation');
      assert.ok(record.rmsDb > -40);
      for (const clip of [movie, movie.lite]) {
        const bytes = fs.readFileSync(`public${clip.src}`);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), clip === movie ? record.sha256 : record.lite.sha256);
        assert.ok(bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')));
        assert.ok(bytes.includes(Buffer.from('soun')), 'speech survives compression');
      }
      assert.ok(movie.lite.bytes < record.bytes * 0.35);
    }
  }
});

test('selection alternates variants per scene, preserves chosen queues and never duplicates native dialogue', () => {
  for (const actor of CHARACTER_IDS) {
    const g = createGame({ character: actor, opponent: actor, mode: 'local' });
    const picker = new VariantPicker(() => 0);
    for (const kind of ['special', 'point', 'result']) {
      let prior = null;
      for (let round = 0; round < 4; round++) {
        const plan = selectCinematic(g, media, 'all', false, kind, 0, picker);
        assert.notEqual(plan.src, prior); prior = plan.src;
        let movie = plan, seen = 0;
        while (movie) {
          assert.equal(movie.src, plan.clips[movie.index].src);
          const cues = voicesForCinema(g, movie);
          if (movie.dialogue) assert.deepEqual(cues, []);
          else assert.equal(cues.length, 1);
          movie = nextCinematic(movie); seen++;
        }
        assert.equal(seen, kind === 'special' ? 1 : 2);
      }
    }
    const cached = matchMediaClips(g, media, 'all', false).map(c => c.src);
    assert.equal(cached.length, 11);
    assert.ok(cached.includes(media.characters[actor].point.win.find(c => c.dialogue).src));
  }
});

test('every selectable special uses a reviewed rally attack; rejected and old shots stay out of playback', () => {
  const job = JSON.parse(fs.readFileSync('docs/beach-volley-rally-job.json', 'utf8'));
  const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-rally-delivery.json', 'utf8'));
  const nagisaDubbing = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-dubbing-delivery.json', 'utf8'));
  assert.equal(job.authorizationText, '批准144积分');
  assert.equal(job.authorizedCreditCeiling, 144);
  assert.ok(job.quote.totalMaxCredits <= job.authorizedCreditCeiling);
  assert.equal(Object.keys(job.items).length, 6);
  assert.equal(Object.keys(delivery.items).length, 6);
  assert.equal(delivery.acceptedGenerationOutputs, 5);
  assert.equal(job.items['sui-special-1'].contentDecision, 'rejected');
  const rejected = job.items['sui-special-1'].resourceId;
  const oldSources = new Set(Object.values(delivery.items).map(item => item.replacesSrc));
  for (const actor of CHARACTER_IDS) {
    for (const [index, movie] of media.characters[actor].special.entries()) {
      const record = delivery.items[`${actor}-special-${index + 1}`];
      const source = job.items[record.sourceKey];
      assert.equal(source.operationState, 'succeeded');
      assert.equal(source.downloadVerified, true);
      assert.ok(source.contentDecision.startsWith('accepted'));
      assert.equal(record.sourceSha256, source.sourceSha256);
      assert.equal(record.resourceId, source.resourceId);
      assert.notEqual(record.resourceId, rejected);
      assert.equal(record.reviewed, true);
      assert.equal(record.generatedSoundtrackRemoved, true);
      assert.equal(oldSources.has(movie.src), false);
      const redubbed = actor === 'nagisa' && Boolean(movie.dialogue);
      const playback = redubbed ? nagisaDubbing.items['nagisa-special'] : record;
      assert.match(movie.src, redubbed ? /\/dubbed-v10\// : /\/rally-v7\//);
      assert.match(movie.lite.src, redubbed ? /\/lite-v10\// : /\/lite-v7\//);
      if (redubbed) {
        assert.equal(playback.originalSrc, record.src);
        assert.equal(playback.originalSha256, record.sha256);
        assert.equal(playback.lite.originalSha256, record.lite.sha256);
      }
      for (const [clip, evidence] of [[movie, playback], [movie.lite, playback.lite]]) {
        const bytes = fs.readFileSync(`public${clip.src}`);
        assert.equal(bytes.length, evidence.bytes);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
        assert.ok(bytes.indexOf(Buffer.from('moov')) < bytes.indexOf(Buffer.from('mdat')));
        assert.equal(bytes.includes(Buffer.from('soun')), Boolean(movie.dialogue));
      }
    }
  }
  assert.equal(delivery.items['sui-special-1'].derivedCameraFraming, true);
  assert.deepEqual(delivery.items['nagisa-special-2'].crop, [1216, 684, 64, 0]);
});

test('Nagisa uses authentic external and embedded recordings while preserving silent videos', () => {
  const retained = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-recording-delivery.json', 'utf8'));
  const dubbing = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-dubbing-delivery.json', 'utf8'));
  for (const actor of ['sui', 'shiori']) {
    const g = createGame({ character: actor, opponent: actor });
    for (const clip of matchMediaClips(g, media, 'all', false)) {
      if (clip.dialogue) assert.equal(clip.dialogue.source, 'recording');
    }
    for (const clip of [...Object.values(audio.voices[actor]).flat(), ...audio.effort[actor]]) {
      assert.match(clip.src, /^\/games\/beach-volley\/audio-v[345]\//);
    }
  }
  for (const clip of [...Object.values(audio.voices.nagisa).flat(), ...audio.effort.nagisa]) {
    const evidence = Object.values(retained.items).find(item => item.src === clip.src);
    assert.ok(evidence, clip.src);
    assert.equal(evidence.conversion, 'authentic-recording');
    assert.match(clip.src, /^\/games\/beach-volley\/audio-v[67]\//);
    assert.ok(retained.retiredRvc.every(old => old.src !== clip.src && old.sha256 !== evidence.sha256));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`public${clip.src}`)).digest('hex'), evidence.sha256);
  }
  assert.equal(retained.retiredRvc.length, 14);
  assert.equal(retained.initialExternalOnlyDelivery.retainedVideos.length, 22);
  assert.equal(dubbing.retainedSilentVideos.length, 12);
  const g = createGame({ character: 'nagisa', opponent: 'nagisa' });
  const active = matchMediaClips(g, media, 'all', false).flatMap(c => [c, c.lite]);
  for (const movie of dubbing.retainedSilentVideos) {
    assert.ok(active.some(c => c.src === movie.src), movie.src);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`public${movie.src}`)).digest('hex'), movie.sha256);
  }
  for (const movie of active) {
    if (movie.dialogue) assert.equal(movie.dialogue.source, 'recording');
  }
});

test('rejected Nagisa BGM and generated speech cannot return through either video quality or external cues', () => {
  const recordings = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-recording-delivery.json', 'utf8'));
  const dubbing = JSON.parse(fs.readFileSync('docs/beach-volley-nagisa-dubbing-delivery.json', 'utf8'));
  const rejected = [...Object.values(recordings.rejectedItems), ...recordings.retiredRvc, ...dubbing.retiredGeneratedVideos];
  const rejectedSources = new Set(rejected.map(i => i.src));
  const rejectedHashes = new Set(rejected.map(i => i.sha256));
  assert.equal(Object.keys(recordings.rejectedItems).length, 2);
  assert.equal(dubbing.retiredGeneratedVideos.length, 10);
  const g = createGame({ character: 'nagisa', opponent: 'nagisa', mode: 'local' });
  const active = [...Object.values(audio.voices.nagisa).flat(), ...audio.effort.nagisa,
    ...matchMediaClips(g, media, 'all', false).flatMap(c => [c, c.lite])];
  for (const clip of active) {
    assert.equal(rejectedSources.has(clip.src), false, clip.src);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(`public${clip.src}`)).digest('hex');
    assert.equal(rejectedHashes.has(hash), false, `rejected audio/video bytes at ${clip.src}`);
  }
  for (const key of ['nagisa-intro-1', 'nagisa-special-2']) {
    const item = recordings.items[key];
    assert.notEqual(item.sha256, recordings.rejectedItems[key].sha256);
    assert.equal(item.backgroundSeparation.model, 'HP2_all_vocals');
    assert.ok(item.backgroundSeparation.validation.attenuationDb > 40);
    assert.equal(item.asr.similarity, 1);
  }
  assert.equal(Object.keys(dubbing.items).length, 5);
  for (const item of Object.values(dubbing.items)) {
    assert.equal(rejectedSources.has(item.voiceSrc), false, item.voiceSrc);
    assert.equal(rejectedHashes.has(item.voiceSha256), false, item.voiceSrc);
    assert.equal(item.originalSoundtrackRemoved, true);
    assert.equal(item.validation.standard.audioPacketSha256, item.validation.lite.audioPacketSha256);
    for (const validation of Object.values(item.validation)) {
      assert.equal(validation.imageStreamSha256, validation.originalImageStreamSha256);
      assert.ok(validation.audioSourceCorrelation > .92);
      assert.ok(validation.outsideVoiceRms < .004);
      assert.ok(Math.abs(validation.voiceOffsetSeconds - item.voiceStart) < .02);
    }
  }
});

test('rejected Shiori laughter cannot return through external voices or embedded point-win video', () => {
  const recordings = JSON.parse(fs.readFileSync('docs/beach-volley-recording-delivery.json', 'utf8'));
  const dubbing = JSON.parse(fs.readFileSync('docs/beach-volley-dubbing-delivery.json', 'utf8'));
  const active = [...Object.values(audio.voices.shiori).flat(), ...audio.effort.shiori];
  for (const key of ['shiori-pointWin-2', 'shiori-victory-1', 'shiori-effort-2']) {
    const old = recordings.rejectedItems[key], replacement = recordings.items[key];
    assert.equal(old.status, 'rejected');
    assert.ok(active.every(c => c.src !== old.src));
    assert.ok(active.some(c => c.src === replacement.src));
    assert.notEqual(replacement.sourceSha256, old.sourceSha256);
    assert.equal(replacement.sourceKind, 'authentic-button');
    assert.equal(replacement.repository, 'https://github.com/forsakenrei/shiori-button');
    assert.match(replacement.repositoryRevision, /^[a-f0-9]{40}$/);
    assert.match(replacement.src, /\/audio-v[45]\//);
    assert.match(replacement.identityEvidence, /upstream project/);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`public${old.src}`)).digest('hex'), old.sha256, 'rejected history is retained');
  }
  const movie = media.characters.shiori.point.win.find(c => c.dialogue);
  assert.equal(movie.src, dubbing.items['shiori-pointWin'].src);
  assert.equal(dubbing.items['shiori-pointWin'].voiceSrc, recordings.items['shiori-pointWin-2'].src);
  assert.notEqual(movie.src, dubbing.rejectedItems['shiori-pointWin'].src);
  assert.notEqual(movie.lite.src, dubbing.rejectedItems['shiori-pointWin'].lite.src);
  assert.ok(fs.readFileSync('public/games/beach-volley/audio-v4/SHIORI-BUTTON-LICENSE.txt', 'utf8').includes('GNU GENERAL PUBLIC LICENSE'));
});

test('every selectable Shiori soundtrack excludes all rejected recordings, including match victory', () => {
  const recordings = JSON.parse(fs.readFileSync('docs/beach-volley-recording-delivery.json', 'utf8'));
  const dubbing = JSON.parse(fs.readFileSync('docs/beach-volley-dubbing-delivery.json', 'utf8'));
  const rally = JSON.parse(fs.readFileSync('docs/beach-volley-rally-delivery.json', 'utf8'));
  const rejected = new Set(Object.values(recordings.rejectedItems).map(item => item.src));
  const g = createGame({ character: 'shiori', opponent: 'sui', mode: 'local' });
  for (const movie of matchMediaClips(g, media, 'all', false)) {
    if (!movie.dialogue || !movie.src.includes('shiori')) continue;
    const record = [...Object.values(dubbing.items), ...Object.values(rally.items)].find(item => item.src === movie.src);
    assert.ok(record, movie.src);
    assert.equal(rejected.has(record.voiceSrc), false, `Rejected recording remains embedded in ${movie.src}`);
  }
  for (const clip of [...Object.values(audio.voices.shiori).flat(), ...audio.effort.shiori]) {
    assert.equal(rejected.has(clip.src), false, `Rejected external recording ${clip.src}`);
  }
});

test('all actors ship compact four-frame transparent running strips with provenance', () => {
  const manifest = JSON.parse(fs.readFileSync('public/games/beach-volley/run-v1/manifest.json', 'utf8'));
  const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-run-assets.json', 'utf8'));
  let total = 0;
  for (const actor of CHARACTER_IDS) {
    const spec = manifest.characters[actor], record = delivery.items[actor];
    assert.equal(spec.frames.length, 4);
    assert.deepEqual(spec.anchor, [192, 380]);
    const bytes = fs.readFileSync(`public/games/beach-volley/${spec.file}`);
    total += bytes.length;
    assert.equal(bytes.length, record.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256);
    assert.equal(record.sourceBounds.length, 4);
    assert.equal(record.horizontalShifts.length, 4);
  }
  assert.ok(total < 350000, 'movement does not add a large movie download');
});
