import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptsDir = fileURLToPath(new URL('../', import.meta.url));

test('real collector excludes working images before copying and cleans old references', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-gallery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, contents) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  for (const script of ['sync_streams.mjs', 'stream-sync-helpers.mjs', 'stream-shards.mjs', 'liver-config.js']) {
    write(`scripts/${script}`, fs.readFileSync(path.join(scriptsDir, script)));
  }
  write('package.json', '{"type":"module"}');
  write('src/data/livers/liverConfigs.json', JSON.stringify({
    sui: { name: 'Fixture', sourceDirs: [path.join(root, 'source')] },
  }));
  write('config/stream-shards.json', JSON.stringify({
    version: 1,
    index: { repo: 'fixture/index' },
    shards: { future: { repo: 'fixture/assets', year: 2099 } },
    assignments: { '2099:sui': 'future' },
  }));
  fs.mkdirSync(path.join(root, 'repos/index/.git'), { recursive: true });
  const id = '2099_09_14_20_07_49';
  const prefix = '录制-25788785-20990914-200749-824-测试';
  const sourceDir = 'source/2099_09_14';
  const image = name => write(`${sourceDir}/${name}`, `fixture image: ${name}`);
  write(`${sourceDir}/${prefix}.xml`, '<d p="3600,0,0"/>');
  write(`${sourceDir}/${prefix}_merged.srt`, 'fixture subtitles');
  write(`${sourceDir}/${prefix}_AI_HIGHLIGHT.txt`, 'fixture summary');
  const comic = `${prefix}_merged_COMIC_FACTORY.png`;
  const sheet = `${prefix}_merged_SCREENSHOTS.jpg`;
  const cover = `${prefix}.cover.jpg`;
  [comic, sheet, cover].forEach(image);
  const unwanted = [
    `${prefix}_merged_EVIDENCE_FRAME_01_005940s.jpg`,
    `${prefix}_merged_EVIDENCE_REQUEST_E1.jpg`,
    `${prefix}_merged_EVIDENCE_REQUEST_E2.jpg`,
    `${prefix}_merged_EVIDENCE_REQUEST_E4.jpg`,
    'pause-0-0.jpg', 'qa-0-0.jpg', 'variant-1.jpg', 'CLIP_COVER.JPG',
    `own_stream_fun_clips/${prefix}_fun_05_002718_cover.jpg`,
    'own_stream_fun_clips/temp/pause-1-2.jpg',
    `archive/${prefix}_COMIC_FACTORY.png`,
    'manual_requested_clips/ordinary-name.png',
  ];
  unwanted.forEach(image);
  const oldId = '2024_01_01_20_00_00';
  const oldBase = `/data/streams/sui/${oldId}/`;
  const indexPath = 'repos/index/public/data/streams/sui/streams.json';
  write(indexPath, JSON.stringify([{
    id: oldId, duration: 3600, images: [`${oldBase}qa-0-0.jpg`, `${oldBase}手工总结.png`],
    cover: `${oldBase}original.cover.jpg`,
  }]));
  const run = () => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/sync_streams.mjs'), '--liver', 'sui'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, STREAM_REPOS_ROOT: path.join(root, 'repos') },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(fs.readFileSync(path.join(root, indexPath), 'utf8'));
  };
  const streams = run();
  const stream = streams.find(entry => entry.id === id);
  const base = `/data/streams/sui/${id}/`;
  assert.deepEqual(stream.images, [base + comic, base + sheet]);
  assert.equal(stream.cover, base + cover);
  assert.ok(stream.xml && stream.srt && stream.highlights);
  assert.deepEqual(streams.find(entry => entry.id === oldId).images, [`${oldBase}手工总结.png`]);
  assert.equal(streams.find(entry => entry.id === oldId).cover, `${oldBase}original.cover.jpg`);
  const target = path.join(root, 'repos/assets/public/data/streams/sui', id);
  assert.deepEqual(fs.readdirSync(target).filter(name => /\.(png|jpe?g)$/i.test(name)).sort(), [comic, sheet, cover].sort());
  for (const name of unwanted) assert.ok(fs.existsSync(path.join(root, sourceDir, name)), name);
  const firstIndex = fs.readFileSync(path.join(root, indexPath), 'utf8');
  run();
  assert.equal(fs.readFileSync(path.join(root, indexPath), 'utf8'), firstIndex);

  // Exercise keyword, time-window and final remaining-image assignment together.
  for (let n = 0; n < 10; n++) {
    const name = `Gemini_Generated_Image_${n}${n % 2 ? '_晚台' : ''}.png`;
    image(name);
    const time = new Date(2099, 8, 14, 21);
    fs.utimesSync(path.join(root, sourceDir, name), time, time);
  }
  const capped = run().find(entry => entry.id === id);
  assert.equal(capped.images.length, 5);
  assert.ok(capped.images.includes(base + comic) && capped.images.includes(base + sheet));
  assert.equal(fs.readdirSync(target).filter(name => /\.(png|jpe?g)$/i.test(name)).length, 6);
});
