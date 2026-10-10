import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSongCatalog, collectSongFiles, correctedSongName, syncSongs } from '../sync-songs.mjs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { enrichStreamRecaps } from '../sync-stream-recaps.mjs';

const { isSongCatalog, performedAt, normalizeSongName } = await loadTypescriptModule('src/components/songs/catalog.ts');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sui-songs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '2026_10_01', 'stream_activity_clips', 'recording');
  fs.mkdirSync(dir, { recursive: true });
  const song = { activityId: 'a1', name: '测试曲', start: 100, end: 280, performance: 'full', verificationStatus: 'keep', startObserved: true, endObserved: true };
  const record = { type: 'sui_stream_song_record', sessionId: 'session1', roomId: '25788785', recordedAt: '2026-10-01 23:59:00', status: 'rendered', coverage: { status: 'complete' }, source: { mediaPath: '录制-25788785-20261001-235900-000-测试.flv' }, songs: [song] };
  const save = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); return file; };
  const file = save(path.join(dir, 'SONGS.json'), record);
  return { root, dir, song, record, save, file };
}
test('confirmed repeats, unknowns, fragments, incomplete and uncertain remain distinct', t => {
  const f = fixture(t);
  f.record.songs.push({ ...f.song, activityId: 'a2', name: null, performance: 'fragment', verificationStatus: 'uncertain' });
  f.save(f.file, f.record);
  const catalog = buildSongCatalog([f.file]);
  assert.equal(catalog.performances.length, 2);
  assert.equal(catalog.performances[0].confirmed, true);
  assert.equal(catalog.performances[1].confirmed, false);
  assert.equal(catalog.performances[1].name, null);
  assert.doesNotMatch(JSON.stringify(catalog), /mediaPath|srtPath|sourceSnapshot/);
  f.record.coverage.status = 'incomplete'; f.save(f.file, f.record);
  assert.equal(buildSongCatalog([f.file]).performances[0].confirmed, false);
  f.record.songs = []; f.save(f.file, f.record);
  assert.equal(buildSongCatalog([f.file]).sessions.length, 1);
});
test('upload link uses manifest review index and actual part, never an old revision or watch video', t => {
  const f = fixture(t);
  const release = path.join(f.dir, 'release');
  const manifestPath = path.join(release, 'UPLOAD_MANIFEST.json');
  const metadataPath = path.join(release, 'songs.json');
  f.save(path.join(f.dir, 'PLAN.json'), { sessionId: f.record.sessionId, signature: 'active', uploadManifestPath: manifestPath });
  f.save(manifestPath, { clips: [{ reviewIndex: 2, metadataPath }] });
  f.save(path.join(release, 'upload_state.json'), { done: { 1: { bvid: 'BV1VGaU63EaL' }, 2: { bvid: 'BV1pvaU6xE6i' } } });
  const metadata = { type: 'stream_activity_submission', kind: 'songs', planSignature: 'active', source: f.record.source, activities: [{ id: 'a1', start: 100, end: 280 }], output: { parts: [{ activityId: 'other' }, { activityId: 'a1' }] } };
  f.save(metadataPath, metadata);
  assert.equal(buildSongCatalog([f.file]).performances[0].clip.url, 'https://www.bilibili.com/video/BV1pvaU6xE6i/?p=2');
  metadata.planSignature = 'stale'; f.save(metadataPath, metadata);
  assert.equal(buildSongCatalog([f.file]).performances[0].clip, null);
  metadata.planSignature = 'active'; metadata.activities[0].start = 90; f.save(metadataPath, metadata);
  assert.equal(buildSongCatalog([f.file]).performances[0].clip, null);
  metadata.activities[0].start = 100; metadata.kind = 'watch'; f.save(metadataPath, metadata);
  assert.equal(buildSongCatalog([f.file]).performances[0].clip, null);
});
test('deduplicates session copies using latest record, excludes work directories', t => {
  const f = fixture(t);
  const newer = f.save(path.join(f.dir, 'temp', 'SONGS.json'), { ...f.record, songs: [] });
  fs.utimesSync(newer, new Date(), new Date(Date.now() + 10000));
  assert.equal(buildSongCatalog([f.file, newer]).performances.length, 0);
  assert.deepEqual(collectSongFiles([f.root]), [f.file]);
});

test('recaps and library fill reviewed names before upload and reject mismatched revisions', t => {
  const f = fixture(t);
  f.record.songs[0].name = null; f.save(f.file, f.record);
  const release = path.join(f.dir, 'release');
  const metadataFile = path.join(release, 'songs.json');
  const manifest = f.save(path.join(release, 'UPLOAD_MANIFEST.json'), { clips: [{ reviewIndex: 2, metadataPath: metadataFile }] });
  const event = { id: 'a1', kind: 'song', start: 100, end: 280 };
  const plan = { sessionId: f.record.sessionId, signature: 'active', source: f.record.source, events: [event], uploadManifestPath: manifest };
  // Use a recording-named directory so recap discovery finds the same session.
  const sessionDir = path.join(path.dirname(f.dir), f.record.source.mediaPath.replace(/\.flv$/, ''));
  fs.renameSync(f.dir, sessionDir);
  f.dir = sessionDir; f.file = path.join(sessionDir, 'SONGS.json');
  plan.uploadManifestPath = path.join(sessionDir, 'release', 'UPLOAD_MANIFEST.json');
  const currentMetadataFile = path.join(sessionDir, 'release', 'songs.json');
  f.save(plan.uploadManifestPath, { clips: [{ reviewIndex: 2, metadataPath: currentMetadataFile }] });
  f.save(path.join(sessionDir, 'PLAN.json'), plan);
  const metadata = { type: 'stream_activity_submission', kind: 'songs', planSignature: 'active', source: f.record.source,
    activities: [event], output: { parts: [{ activityId: 'a1', name: '已审核曲名' }] },
    uploadReady: true, activityReview: { status: 'approved', authority: 'automatic', checks: { titles: true } },
    presentation: { titleEvidence: { items: [{ activityId: 'a1', name: '已审核曲名', note: 'private evidence' }] } } };
  const summary = { status: 'success', content: { overview: '唱歌', songs: ['不可按顺序套用的旧名'] } };
  f.save(path.join(f.root, '2026_10_01', f.record.source.mediaPath.replace(/\.flv$/, '_LIVE_CONTENT.json')), summary);
  const recap = () => enrichStreamRecaps([{ id: '2026_10_01_23_59_00' }], { sourceDirs: [f.root], liverId: 'sui' })[0].recap;
  f.save(currentMetadataFile, metadata);
  const performance = buildSongCatalog([f.file]).performances[0];
  assert.equal(performance.name, '已审核曲名'); assert.equal(performance.clip, null);
  assert.equal(recap().songs[0].name, performance.name); assert.equal(recap().songs[0].clips, undefined);
  assert.doesNotMatch(JSON.stringify([performance, recap()]), /private evidence|titleEvidence|mediaPath/);
  for (const mutate of [
    m => { m.activityReview.status = 'pending'; },
    m => { m.activityReview.checks.titles = false; },
    m => { m.planSignature = 'stale'; },
    m => { m.source = { mediaPath: 'other.flv' }; },
    m => { m.activities[0].start = 99; },
    m => { m.presentation.titleEvidence.items[0].name = '不一致'; },
  ]) {
    const changed = structuredClone(metadata); mutate(changed); f.save(currentMetadataFile, changed);
    assert.equal(buildSongCatalog([f.file]).performances[0].name, null);
    assert.equal(recap().songs[0].name, '未识别歌名');
  }
  f.save(currentMetadataFile, metadata);
  f.record.songs[0].name = '上游名称'; f.save(f.file, f.record);
  assert.equal(buildSongCatalog([f.file]).performances[0].name, '上游名称');
  f.record.songs[0].name = null; f.save(f.file, f.record);
  f.save(path.join(sessionDir, 'release', 'upload_state.json'), { done: { 2: { bvid: 'BV1pvaU6xE6i' } } });
  assert.equal(buildSongCatalog([f.file]).performances[0].clip.part, 1);
  assert.equal(recap().songs[0].clips[0].part, 1);
});
test('synchronization is stable, catches historical review changes, and retains output on corrupt input', t => {
  const f = fixture(t); const output = path.join(f.root, 'public', 'songs.json');
  syncSongs({ sourceDirs: [f.root], output });
  const before = fs.readFileSync(output, 'utf8');
  syncSongs({ sourceDirs: [f.root], output });
  assert.equal(fs.readFileSync(output, 'utf8'), before);
  f.record.songs[0].verificationStatus = 'uncertain'; f.save(f.file, f.record);
  syncSongs({ sourceDirs: [f.root], output });
  assert.equal(JSON.parse(fs.readFileSync(output)).performances[0].confirmed, false);
  const updated = fs.readFileSync(output, 'utf8');
  fs.writeFileSync(f.file, '{broken');
  assert.throws(() => syncSongs({ sourceDirs: [f.root], output }));
  assert.equal(fs.readFileSync(output, 'utf8'), updated);
});

test('public schema rejects unsafe links and invalid dates; time uses Beijing across midnight', t => {
  const f = fixture(t); const data = buildSongCatalog([f.file]);
  assert.equal(isSongCatalog(data), true);
  assert.equal(performedAt('2026-10-01 23:59:00', 120), '2026/10/02 00:01:00');
  assert.equal(normalizeSongName(' ＡＢＣ　歌 '), 'abc歌');
  data.performances[0].clip = { bvid: 'BV1pvaU6xE6i', part: 1, url: 'javascript:alert(1)' };
  assert.equal(isSongCatalog(data), false);
  data.performances[0].clip = null;
  data.sessions[0].recordedAt = '2026-99-99 99:00:00';
  assert.equal(isSongCatalog(data), false);
});

test('title corrections match exact revisions, preserve source names and review uncertainty', t => {
  const corrections = JSON.parse(fs.readFileSync('src/data/songs/title-corrections.json', 'utf8'));
  for (const correction of corrections) {
    const song = { ...correction, name: null };
    assert.equal(correctedSongName(correction.sessionId, song), correction.name);
    assert.equal(correctedSongName('different-session', song), null);
    assert.equal(correctedSongName(correction.sessionId, { ...song, start: song.start + 1 }), null);
    assert.equal(correctedSongName(correction.sessionId, { ...song, end: song.end + 1 }), null);
    assert.equal(correctedSongName(correction.sessionId, { ...song, activityId: 'reused' }), null);
    assert.equal(correctedSongName(correction.sessionId, { ...song, name: '上游已核验歌名' }), '上游已核验歌名');
  }
  const f = fixture(t); const correction = corrections[0];
  f.record.sessionId = correction.sessionId;
  f.record.songs = [{ ...f.song, ...correction, name: null, verificationStatus: 'uncertain', startObserved: false, endObserved: false }];
  f.save(f.file, f.record);
  const [performance] = buildSongCatalog([f.file]).performances;
  assert.equal(performance.name, correction.name);
  assert.equal(performance.confirmed, false);
  assert.equal(performance.boundariesConfirmed, false);
  assert.doesNotMatch(JSON.stringify(performance), /evidence|quote|transcript/);
});
