import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  calculateOverlapRatio,
  choosePreferredArtifact,
  choosePreferredSrt,
  copyFileIfChanged,
  filterStreamImageReferences,
  getIncrementalRefreshStart,
  getStreamImageExclusionReason,
  imageBelongsToStream,
  isImageFallbackCandidate,
  mergeRefreshedStream,
  parseStreamArtifact,
  readXmlDuration,
  shouldScanDateFolder,
} from '../stream-sync-helpers.mjs';

const TARGET_ID = '2026_07_17_19_59_07';
const PREFIX = '录制-25788785-20260717-195907-920-陪你这个猪过周⑤';

test('gallery filtering rejects clip and QA artifacts but preserves published recaps', () => {
  const rejected = [
    `${PREFIX}_merged_EVIDENCE_FRAME_01_005940s.jpg`,
    `${PREFIX}_merged_EVIDENCE_REQUEST_E2.jpg`,
    `${PREFIX}_merged_fun_05_002718_cover.jpg`,
    'own_stream_fun_clips/temp/pause-0-0.jpg',
    `reviewed_covers\\${PREFIX}_COMIC_FACTORY.png`,
    'manual_requested_clips/final.png',
    'qa-0-0.jpg', 'QA_FRAME_120s_scene.jpg', 'pause-1-2.jpg', 'variant-1.jpg',
    'frame_002.jpg', 'preview_01.jpg', 'inset_halfsec_contact.jpg',
    'sui_封面.png', 'CLIP_COVER.JPG', '截图_20260914.png', '截图20260914.png',
    `${PREFIX}_screenshot.jpg`, `${PREFIX}.cover.jpg`,
  ];
  for (const file of rejected) assert.notEqual(getStreamImageExclusionReason(file), null, file);
  const accepted = [
    `${PREFIX}_merged_COMIC_FACTORY.png`, `${PREFIX}_merged_SCREENSHOTS.jpg`,
    `${PREFIX}聊聊切片封面截图_COMIC_FACTORY.png`,
    'Gemini_Generated_Image_kdxlsokdxlsokdxl_晚台.png',
    '12月6日午台总结.png', '20251208晚安总结插画.png',
    '2026_01_12_20_03_10_找你有事！速来_DDTV5_fix.png',
    '317A60CAD4CE210E154E0DDE21907BE6.png',
  ];
  for (const file of accepted) assert.equal(getStreamImageExclusionReason(file), null, file);
});

test('historical index filtering preserves order and handles escaped filenames', () => {
  const base = '/data/streams/sui/2026_07_17_19_59_07/';
  const comic = `${base}${PREFIX}_COMIC_FACTORY.png`;
  const sheet = `${base}${PREFIX}_SCREENSHOTS.jpg`;
  const legacy = `${base}图片文字替换.png`;
  assert.deepEqual(filterStreamImageReferences([
    comic, `${base}qa-0-0.jpg`, `${base}${encodeURIComponent('切片封面.jpg')}`, sheet, legacy,
  ]), [comic, sheet, legacy]);
  assert.deepEqual(filterStreamImageReferences(), []);
});

test('parses late SRT and generated images without corrupting the stream title', () => {
  const plain = parseStreamArtifact(`${PREFIX}_merged.srt`);
  const speaker = parseStreamArtifact(`${PREFIX}_merged.speaker.srt`);
  const image = parseStreamArtifact(`${PREFIX}_merged_COMIC_FACTORY.png`);
  const highlight = parseStreamArtifact(`${PREFIX}_merged_AI_HIGHLIGHT.txt`);

  assert.equal(plain.streamId, TARGET_ID);
  assert.equal(plain.kind, 'srt');
  assert.equal(speaker.kind, 'speaker-srt');
  assert.equal(image.kind, 'image');
  assert.equal(highlight.kind, 'highlights');
  assert.equal(plain.title, '陪你这个猪过周⑤');
  assert.equal(speaker.title, '陪你这个猪过周⑤');
  assert.equal(image.title, '陪你这个猪过周⑤');
  assert.equal(highlight.title, '陪你这个猪过周⑤');
});

test('chooses finished XML and canonical SRT deterministically', () => {
  const files = [
    { file: `${PREFIX}.xml`, artifact: parseStreamArtifact(`${PREFIX}.xml`), duration: 3129 },
    { file: `${PREFIX}_merged.xml`, artifact: parseStreamArtifact(`${PREFIX}_merged.xml`), duration: 16108 },
    { file: `${PREFIX}_merged.speaker.srt`, artifact: parseStreamArtifact(`${PREFIX}_merged.speaker.srt`), duration: 0 },
    { file: `${PREFIX}_merged.srt`, artifact: parseStreamArtifact(`${PREFIX}_merged.srt`), duration: 0 },
  ];

  assert.equal(choosePreferredArtifact(files, 'xml').file, `${PREFIX}_merged.xml`);
  assert.equal(choosePreferredSrt(files).file, `${PREFIX}_merged.srt`);
});

test('incremental refresh revisits settling and recent incomplete streams only', () => {
  const now = new Date(2026, 6, 18, 12);
  const completeOld = {
    id: '2026_07_10_12_00_00', xml: 'x', cover: 'c', srt: 's', highlights: 'h', images: ['i'],
  };
  const incompleteRecent = {
    id: '2026_07_08_12_00_00', xml: 'x', cover: 'c', srt: null, highlights: null, images: [],
  };

  const refreshStart = getIncrementalRefreshStart([completeOld, incompleteRecent], now);
  assert.equal(refreshStart.getTime(), new Date(2026, 6, 8, 12).getTime());
  assert.equal(shouldScanDateFolder('2026_07_08', {
    mode: 'incremental', refreshStart, latestSyncedTime: new Date(2026, 6, 17),
  }), true);
  assert.equal(shouldScanDateFolder('2026_07_07', {
    mode: 'incremental', refreshStart, latestSyncedTime: new Date(2026, 6, 17),
  }), false);
  assert.equal(shouldScanDateFolder('2025_01_01', {
    mode: 'full', refreshStart, latestSyncedTime: new Date(2026, 6, 17),
  }), true);
});

test('incremental bootstrap scans every valid date folder without existing streams', () => {
  const bootstrapState = {
    mode: 'incremental', refreshStart: null, latestSyncedTime: null,
  };

  assert.equal(shouldScanDateFolder('2026_08_07', bootstrapState), true);
  assert.equal(shouldScanDateFolder('2024_01_01', bootstrapState), true);
  assert.equal(shouldScanDateFolder('bak', bootstrapState), false);
});

test('refresh merge fills late artifacts and replaces stale adjacent-day images', () => {
  const existing = {
    id: TARGET_ID,
    title: '陪你这个猪过周⑤',
    duration: 3129,
    xml: '/old.xml',
    srt: null,
    cover: '/cover.jpg',
    highlights: null,
    images: ['/data/streams/sui/2026_07_17_19_59_07/20260716_SCREENSHOTS.jpg'],
  };
  const refreshed = {
    id: TARGET_ID,
    title: '陪你这个猪过周⑤',
    duration: 16108,
    xml: '/merged.xml',
    srt: '/merged.srt',
    cover: null,
    highlights: '/highlights.md',
    images: ['/20260717_COMIC_FACTORY.png', '/20260717_SCREENSHOTS.jpg'],
  };

  assert.deepEqual(mergeRefreshedStream(existing, refreshed), {
    ...existing,
    ...refreshed,
    cover: '/cover.jpg',
    images: ['/20260717_COMIC_FACTORY.png', '/20260717_SCREENSHOTS.jpg'],
  });
});

test('image identity wins and fallback is bounded to the same date', () => {
  const stream = { id: TARGET_ID, date: '2026-07-17', startTime: new Date(2026, 6, 17, 20) };
  const own = { streamId: TARGET_ID };
  const adjacent = { streamId: '2026_07_16_19_58_53' };
  assert.equal(imageBelongsToStream(own, TARGET_ID), true);
  assert.equal(imageBelongsToStream(adjacent, TARGET_ID), false);

  assert.equal(isImageFallbackCandidate({
    streamId: null, date: '2026-07-17', mtime: new Date(2026, 6, 17, 21).getTime(),
  }, stream), true);
  assert.equal(isImageFallbackCandidate({
    streamId: null, date: '2026-07-16', mtime: new Date(2026, 6, 17, 21).getTime(),
  }, stream), false);
  assert.equal(isImageFallbackCandidate({
    streamId: null, date: '2026-07-17', mtime: new Date(2026, 6, 18, 10).getTime(),
  }, stream), false);
});

test('changed assets are replaced while identical reruns are idempotent', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-sync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'source.xml');
  const target = path.join(dir, 'target.xml');
  fs.writeFileSync(source, '<d p="3129,0,0"/>');

  assert.equal(copyFileIfChanged(source, target), true);
  assert.equal(copyFileIfChanged(source, target), false);
  fs.writeFileSync(source, '<d p="16108,0,0"/>');
  assert.equal(copyFileIfChanged(source, target), true);
  assert.equal(readXmlDuration(target), 16108);
});

test('overlap deduplication retains existing 90 percent rule', () => {
  const first = { id: TARGET_ID, duration: 1000 };
  const duplicate = { id: '2026_07_17_19_59_57', duration: 1000 };
  const separate = { id: '2026_07_17_21_00_00', duration: 1000 };
  assert.ok(calculateOverlapRatio(first, duplicate) >= 0.9);
  assert.equal(calculateOverlapRatio(first, separate), 0);
});
