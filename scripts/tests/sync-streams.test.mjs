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
  getIncrementalRefreshStart,
  imageBelongsToStream,
  isImageFallbackCandidate,
  mergeRefreshedStream,
  parseStreamArtifact,
  readXmlDuration,
  shouldScanDateFolder,
} from '../stream-sync-helpers.mjs';

const TARGET_ID = '2026_07_17_19_59_07';
const PREFIX = '录制-25788785-20260717-195907-920-陪你这个猪过周⑤';

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
