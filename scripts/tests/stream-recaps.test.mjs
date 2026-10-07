import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { activityPublications, buildStreamRecap, composeStreamTexts, enrichStreamRecaps, gamePublications, syncStreamRecaps } from '../sync-stream-recaps.mjs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { splitStreamText, isStreamRecap, chooseStreamRecap } = await loadTypescriptModule('src/components/Home/streamRecap.ts');
const source = '录制-25788785-20261001-201338-508-测试直播';
const id = '2026_10_01_20_13_38';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-recaps-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const date = path.join(root, '2026_10_01');
  const directory = path.join(date, 'stream_activity_clips', source);
  const save = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); return file; };
  const summary = { status: 'success', generatedAt: '2026-10-02T00:00:00Z', content: { overview: '杂谈、唱歌、观看《奇异博士》', songs: ['上游旧歌名'], games: ['艾尔登法环'], topics: ['观看《奇异博士》', '海边旅行'] } };
  save(path.join(date, `${source}_LIVE_CONTENT.json`), summary);
  const plan = { sessionId: 'session', signature: 'active', source: { mediaPath: `${source}.flv` }, events: [{ id: 'watch-1', kind: 'watch', name: null, start: 100, end: 1000 }] };
  const metadata = { type: 'stream_activity_submission', kind: 'watch', planSignature: 'active', source: plan.source, activities: plan.events, output: { parts: [{ activityId: 'other' }, { activityId: 'watch-1', title: '《奇异博士》 01/03' }] } };
  const manifest = path.join(directory, 'release', 'UPLOAD_MANIFEST.json');
  const metadataFile = path.join(directory, 'release', 'watch.json');
  plan.uploadManifestPath = manifest;
  save(path.join(directory, 'PLAN.json'), plan);
  save(manifest, { clips: [{ reviewIndex: 2, metadataPath: metadataFile }] });
  save(metadataFile, metadata);
  const stateFile = path.join(directory, 'release', 'upload_state.json');
  save(stateFile, { done: { 1: { bvid: 'BV1pvaU6xE6i' }, 2: { bvid: 'BV1VGaU63EaL' } } });
  return { root, date, directory, save, summary, plan, metadata, metadataFile, stateFile };
}

test('legacy text separates replies, highlight and bottom metadata without losing Markdown', () => {
  const text = '\uFEFF---\r\ngeneratedAt: "2026-10-02"\r\nsourceHighlight: "example_AI_HIGHLIGHT.txt"\r\nprovider: test\r\n---\r\n保温杯洒了，小岁辛苦啦。\r\n\r\n---\r\n【摘要】(保留率: 前35%)\r\n---\r\n[5m] 🔥 保温杯事件\r\n\r\n---\r\n{"format":"immersive_v1","composition":"图片脚本"}\r\n{"kind":"beat","scene":"道具"}';
  const result = splitStreamText(text);
  assert.equal(result.summary, '');
  assert.equal(result.goodnight, '保温杯洒了，小岁辛苦啦。');
  assert.match(result.highlights, /【摘要】[\s\S]*\[5m\]/);
  assert.match(result.highlights, /【摘要】[^\n]+\n\n---\n\n/);
  assert.doesNotMatch(result.goodnight + result.highlights, /generatedAt|provider|composition/);
  assert.equal(result.metadata.length, 2);
  assert.match(result.metadata[0], /generatedAt/);
  const old = splitStreamText('小岁宝贝晚安呀！\n\n今天的聊天很好玩，明天见。\n\n---\n【高能浓缩摘要】\n[0m] 开场');
  assert.equal(old.summary, ''); assert.match(old.goodnight, /小岁宝贝/); assert.match(old.highlights, /开场/);
});

test('semantic source order survives old file ordering and preserves fenced code', () => {
  const documents = [
    { file: 'recording_AI_HIGHLIGHT.txt', content: '[5m] 事件' },
    { file: 'recording_晚安回复.md', content: '休息一下，晚安呀。' },
    { file: 'recording_SUMMARY.md', content: '今天唱歌和玩游戏。\n\n```yaml\n---\ngeneratedAt: code example\n---\n```' },
    { file: 'recording_COMIC_SCRIPT.txt', content: '图片生成脚本' },
  ];
  const merged = composeStreamTexts(documents);
  assert.ok(merged.indexOf('直播梗概') < merged.indexOf('晚安回复'));
  assert.ok(merged.indexOf('晚安回复') < merged.indexOf('Highlight'));
  assert.doesNotMatch(merged, /图片生成脚本/);
  const result = splitStreamText(merged);
  assert.match(result.summary, /今天唱歌[\s\S]*```yaml[\s\S]*code example/);
  assert.match(result.goodnight, /休息一下/);
  assert.equal(result.highlights, '[5m] 事件');
  assert.equal(result.metadata.length, 0);
});

test('watch publication matches current plan, exact source/boundaries and manifest part, never queued uploads', t => {
  const f = fixture(t);
  assert.equal(activityPublications(f.directory, f.plan).get('watch-1').clip.url, 'https://www.bilibili.com/video/BV1VGaU63EaL/?p=2');
  for (const mutation of [
    metadata => { metadata.planSignature = 'old'; },
    metadata => { metadata.source = { mediaPath: 'different.flv' }; },
    metadata => { metadata.activities = [{ ...metadata.activities[0], start: 90 }]; },
    metadata => { metadata.kind = 'songs'; },
  ]) {
    const metadata = structuredClone(f.metadata); mutation(metadata); f.save(f.metadataFile, metadata);
    assert.equal(activityPublications(f.directory, f.plan).size, 0);
  }
  f.save(f.metadataFile, f.metadata); f.save(f.stateFile, { queue: { 2: { bvid: 'BV1VGaU63EaL' } }, done: {} });
  assert.equal(activityPublications(f.directory, f.plan).size, 0);
});

test('songs use reviewed session records and watch works are separate from other topics', t => {
  const f = fixture(t);
  const publications = activityPublications(f.directory, f.plan);
  const songs = { sessionId: 'session', songs: [{ activityId: 'song-1', name: '泡泡', start: 10, end: 60 }] };
  const recap = buildStreamRecap(f.summary, { liverId: 'sui', plan: f.plan, songs, publications });
  assert.equal(recap.songs[0].name, '泡泡');
  assert.equal(recap.watch.length, 1);
  assert.equal(recap.watch[0].name, '奇异博士');
  assert.deepEqual(recap.other, [{ name: '海边旅行' }]);
  assert.equal(isStreamRecap(recap), true);
  assert.doesNotMatch(JSON.stringify(recap), /mediaPath|planSignature|sourceWindow|promptTokens/);
  recap.watch[0].clips[0].url = 'javascript:alert(1)';
  assert.equal(isStreamRecap(recap), false);
});

test('game publications keep each submitted video and match split activity source windows after drive migration', t => {
  const f = fixture(t);
  const directory = path.join(f.date, 'stream_game_clips', source);
  const release = path.join(directory, 'release');
  const event = { id: 'game-1', gameId: 'elden-ring', start: 100, end: 1000 };
  const plan = { signature: 'game-plan', renderSignature: 'game-render', source: f.plan.source, events: [event], uploadManifestPath: `D:/old-recordings/${source}/release/UPLOAD_MANIFEST.json` };
  const metadata = { type: 'stream_game_submission', kind: 'games', gameId: 'elden-ring', source: plan.source, planSignature: plan.signature, renderSignature: plan.renderSignature,
    copy: { title: '艾尔登法环 第08集（1/2）｜探索' }, activities: [{ ...event, sourceWindow: { start: 100, end: 1000 }, end: 500 }], output: { parts: [{ activityId: 'game-1', gameId: 'elden-ring', start: 100, end: 500 }] } };
  const second = structuredClone(metadata); second.activities[0].start = 500; second.activities[0].end = 1000; second.output.parts[0].start = 500; second.output.parts[0].end = 1000; second.copy.title = '艾尔登法环 第08集（2/2）｜战斗';
  f.save(path.join(release, 'UPLOAD_MANIFEST.json'), { clips: [1, 2].map(reviewIndex => ({ reviewIndex, metadataPath: `D:/old-recordings/${source}/release/game-${reviewIndex}.json` })) });
  f.save(path.join(release, 'game-1.json'), metadata); f.save(path.join(release, 'game-2.json'), second);
  f.save(path.join(release, 'upload_state.json'), { done: { 1: { bvid: 'BV1JcaU6UEPp' }, 2: { bvid: 'BV17PaU62EyL' } } });
  const games = gamePublications(directory, plan);
  assert.equal(games.length, 2);
  const recap = buildStreamRecap(f.summary, { games });
  assert.equal(recap.games.length, 1);
  assert.equal(recap.games[0].clips.length, 2);
  assert.match(recap.games[0].clips[1].url, /BV17PaU62EyL/);
  metadata.renderSignature = 'stale'; f.save(path.join(release, 'game-1.json'), metadata);
  assert.equal(gamePublications(directory, plan).length, 1);
  second.activities[0].sourceWindow.end = 1100; f.save(path.join(release, 'game-2.json'), second);
  assert.equal(gamePublications(directory, plan).length, 0);
});

test('historical recaps refresh outside asset window, prefer plan summary and retain output on corrupt source', t => {
  const f = fixture(t);
  const planSummary = { ...f.summary, content: { ...f.summary.content, overview: '已复核的梗概' } };
  f.plan.summary = { path: f.save(path.join(f.directory, 'SUMMARY.json'), planSummary) };
  f.save(path.join(f.directory, 'PLAN.json'), f.plan);
  const index = f.save(path.join(f.root, 'streams.json'), [{ id, highlights: '/data/streams/sui/example/highlights.md' }, { id: '2025_01_01_20_00_00' }]);
  syncStreamRecaps({ sourceDirs: [f.root], liverId: 'sui', index });
  const before = fs.readFileSync(index, 'utf8');
  const streams = JSON.parse(before);
  assert.equal(streams[0].recap.overview, '已复核的梗概');
  assert.equal(streams[0].highlights, '/data/streams/sui/example/highlights.md');
  assert.deepEqual(streams[1], { id: '2025_01_01_20_00_00' });
  syncStreamRecaps({ sourceDirs: [f.root], liverId: 'sui', index });
  assert.equal(fs.readFileSync(index, 'utf8'), before);
  fs.writeFileSync(f.plan.summary.path, '{broken');
  assert.throws(() => syncStreamRecaps({ sourceDirs: [f.root], liverId: 'sui', index }));
  assert.equal(fs.readFileSync(index, 'utf8'), before);
});

test('another liver retains categories and has no fabricated publication links', () => {
  const summary = { status: 'success', content: { overview: '歌回与游戏', songs: ['夜曲'], games: ['空洞骑士'], topics: ['闲聊'] } };
  const [stream] = enrichStreamRecaps([{ id }], { sourceDirs: [], liverId: 'shiori' });
  assert.deepEqual(stream, { id });
  assert.deepEqual(buildStreamRecap(summary, { liverId: 'shiori' }).songs, [{ name: '夜曲' }]);
  assert.deepEqual(buildStreamRecap(summary, { liverId: 'shiori' }).games, [{ name: '空洞骑士' }]);
});

test('saved recaps cover index rollout delays, then accept newer remote summaries', () => {
  const saved = { overview: '已保存梗概', songs: [], games: [], watch: [], other: [], generatedAt: '2026-10-03T00:00:00Z' };
  const older = { ...saved, overview: '旧梗概', generatedAt: '2026-10-02T00:00:00Z' };
  const newer = { ...saved, overview: '新梗概', generatedAt: '2026-10-04T00:00:00Z' };
  assert.equal(chooseStreamRecap(undefined, saved), saved);
  assert.equal(chooseStreamRecap({ overview: '损坏数据' }, saved), saved);
  assert.equal(chooseStreamRecap(older, saved), saved);
  assert.equal(chooseStreamRecap(newer, saved), newer);
  assert.equal(chooseStreamRecap(newer, undefined), newer);
  assert.equal(chooseStreamRecap(undefined, undefined), undefined);
});
