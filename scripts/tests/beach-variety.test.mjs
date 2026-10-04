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

test('every actor has real RVC speech, short converted efforts and documented authentic alternatives', () => {
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
    for (const pool of [...Object.values(audio.voices[actor]), audio.effort[actor]]) {
      assert.ok(Array.isArray(pool) && pool.length >= 2);
      for (const clip of pool) {
        const bytes = fs.readFileSync(`public${clip.src}`);
        const evidence = Object.values(delivery.items).find(i => i.src === clip.src);
        assert.equal(bytes.length, clip.bytes);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), evidence.sha256);
        if (evidence.conversion === 'authentic-recording') {
          assert.equal(actor, 'sui');
          assert.equal(evidence.scene, 'pointWin');
          assert.ok(evidence.sourcePath.endsWith('耶~.MP3'));
          assert.match(evidence.sourceSha256, /^[a-f0-9]{64}$/);
        } else {
          assert.equal(evidence.conversion, 'RVC');
          assert.equal(evidence.modelSha256, delivery.models[actor].modelSha256);
        }
        assert.ok(evidence.rmsDb > -30 && evidence.peak > 0.15 && evidence.peak <= 1);
        if (evidence.scene !== 'effort') {
          assert.equal(evidence.asr.sha256, evidence.sha256);
          assert.ok(evidence.asr.similarity >= 0.65);
        }
      }
    }
    for (const scene of Object.keys(audio.voices[actor])) assert.equal(delivery.items[`${actor}-${scene}-1`].conversion, 'RVC');
    assert.ok(audio.effort[actor].every(c => c.duration <= 0.7 && c.bytes < 7000));
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

test('all five actor scenes gain a distinct native-dialogue movie and a faststart light version', () => {
  const job = JSON.parse(fs.readFileSync('docs/beach-volley-variety-job.json', 'utf8'));
  const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-variety-delivery.json', 'utf8'));
  assert.equal(Object.keys(delivery.items).length, 15);
  for (const actor of CHARACTER_IDS) {
    const pools = [media.characters[actor].special, media.characters[actor].point.win, media.characters[actor].point.lose, media.characters[actor].result.win, media.characters[actor].result.lose];
    for (const pool of pools) {
      assert.equal(pool.length, 2);
      assert.equal(new Set(pool.map(c => c.src)).size, 2);
      assert.equal(pool.filter(c => c.dialogue).length, 1);
      const movie = pool.find(c => c.dialogue), record = Object.values(delivery.items).find(i => i.src === movie.src);
      const request = Object.values(job.items).find(i => i.resourceId === record.resourceId);
      assert.equal(request.operationState, 'succeeded'); assert.equal(record.reviewed, true);
      assert.ok(record.nativeAudio && record.rmsDb > -40 && record.transcriptSimilarity > 0.65);
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
    assert.ok(cached.some(c => c.includes('variety-v5')));
  }
});
