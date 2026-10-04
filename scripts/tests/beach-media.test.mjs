import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { CinemaCache } = await loadTypescriptModule('src/components/beachVolley/mediaCache.ts');
const { createGame, CHARACTER_IDS } = await loadTypescriptModule('src/components/beachVolley/engine.ts');
const { matchMediaClips } = await loadTypescriptModule('src/components/beachVolley/cinematics.ts');
const manifest = JSON.parse(fs.readFileSync('public/games/beach-volley/media.json', 'utf8'));
const clip = (name) => ({ src: `/${name}.mp4`, lite: { src: `/lite/${name}.mp4`, bytes: 10 }, duration: 4, poster: '/poster.webp' });
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function mocked(task) {
  const originalFetch = globalThis.fetch, originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const requests = [], created = [], revoked = [];
  globalThis.fetch = (src, { signal }) => new Promise((resolve, reject) => {
    const request = { src, signal, done: false, resolve: (bytes = 10, ok = true) => {
      request.done = true;
      resolve({ ok, status: ok ? 200 : 404, blob: async () => ({ size: bytes }) });
    } };
    requests.push(request);
    signal.addEventListener('abort', () => {
      if (request.ignoreAbort) return;
      request.done = true;
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
  URL.createObjectURL = () => { const url = `blob:test-${created.length}`; created.push(url); return url; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  const cache = new CinemaCache();
  const pending = () => requests.filter((r) => !r.done && !r.signal.aborted);
  const complete = async (src, bytes = 10, ok = true) => {
    const request = pending().find((r) => r.src === src);
    assert.ok(request, `pending request ${src}`); request.resolve(bytes, ok); await flush();
  };
  try { await task({ cache, requests, created, revoked, pending, complete }); }
  finally {
    cache.dispose();
    requests.filter((r) => !r.done).forEach((r) => r.resolve());
    await flush();
    globalThis.fetch = originalFetch; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
}

test('every shipped light clip is smaller, silent faststart MP4 with recorded bytes; originals remain', () => {
  const delivery = JSON.parse(fs.readFileSync('docs/beach-volley-media-delivery.json', 'utf8'));
  assert.equal(delivery.clips.length, 23);
  assert.ok(delivery.liteBytes / delivery.originalBytes < 0.15);
  for (const entry of delivery.clips) {
    const bytes = fs.readFileSync(`public${entry.lite.src}`);
    assert.equal(bytes.length, entry.lite.bytes); assert.ok(bytes.length < entry.originalBytes * 0.25);
    assert.equal(fs.statSync(`public${entry.src}`).size, entry.originalBytes);
    let offset = 0; const boxes = [];
    while (offset + 8 <= bytes.length) {
      const size = bytes.readUInt32BE(offset); assert.ok(size >= 8);
      boxes.push(bytes.toString('ascii', offset + 4, offset + 8)); offset += size;
    }
    assert.ok(boxes.indexOf('moov') >= 0 && boxes.indexOf('moov') < boxes.indexOf('mdat'));
    assert.ok(!bytes.includes(Buffer.from('soun'))); // no generated soundtrack in the track metadata
  }
});

test('preload list includes only selected actors, paired overrides, and enabled movie kinds', () => {
  for (const character of CHARACTER_IDS) for (const opponent of CHARACTER_IDS) {
    const game = createGame({ character, opponent });
    const all = matchMediaClips(game, manifest, 'all', false);
    assert.equal(new Set(all.map((c) => c.src)).size, all.length);
    assert.ok(all.every((c) => c.lite?.src && c.lite.bytes > 0));
    const paired = character !== opponent && ![character, opponent].includes('nagisa');
    assert.equal(all.length, paired ? 25 : character === opponent ? 11 : 22);
    if (paired) assert.equal(all.filter(c => c.src.includes('intro')).length, 1, 'only the eligible paired intro is downloaded');
    const specialIndex = all.findIndex(c => c.src.includes('special'));
    assert.ok(specialIndex > 0 && all.slice(0, specialIndex).every(c => c.src.includes('intro')));
    assert.ok(all.slice(specialIndex, specialIndex + (character === opponent ? 2 : 4)).every(c => c.src.includes('special')));
    assert.ok(matchMediaClips(game, manifest, 'key', false).every((c) => !c.src.includes('point')));
    assert.deepEqual(matchMediaClips(game, manifest, 'off', false), []);
    assert.deepEqual(matchMediaClips(game, manifest, 'all', true), []);
  }
});

test('two bounded downloads prepare all light clips before standard; warm replay uses a blob', async () => mocked(async ({ cache, requests, complete, pending }) => {
  const a = clip('a'), b = clip('b'), c = clip('c');
  cache.update([a, b, c]); assert.equal(pending().length, 2);
  await complete(a.lite.src); await complete(b.lite.src);
  assert.ok(requests.every((r) => r.src.startsWith('/lite/')));
  await complete(c.lite.src); assert.equal(cache.snapshot().liteReady, 3);
  assert.equal(pending().length, 2);
  const low = cache.play(a); assert.equal(low.quality, 'lite'); assert.equal(low.cached, true); assert.ok(low.src.startsWith('blob:'));
  await flush(); assert.equal(pending().length, 0, 'large downloads yield during a movie');
  cache.finish();
  await complete(a.src); await complete(b.src); await complete(c.src);
  const high = cache.play(a); assert.equal(high.quality, 'standard'); assert.equal(high.cached, true);
  cache.finish(); assert.deepEqual(cache.play(a), high, 'repeat needs no new download');
}));

test('cold playback streams light immediately, cancels competing fetches, and never changes its source', async () => mocked(async ({ cache, pending, complete }) => {
  const a = clip('a'), b = clip('b'); cache.update([a, b]);
  const selected = cache.play(b);
  assert.deepEqual(selected, { src: b.lite.src, quality: 'lite', cached: false });
  await flush(); assert.equal(pending().length, 0);
  cache.update([a, b]); assert.equal(pending().length, 0); assert.equal(selected.src, b.lite.src);
  cache.finish(); await complete(a.lite.src); await complete(b.lite.src);
  assert.equal(selected.src, b.lite.src, 'completed preload cannot restart the ongoing selection');
}));

test('roster changes abort unused downloads, ignore stale responses, and revoke obsolete blobs', async () => mocked(async ({ cache, requests, created, revoked, complete }) => {
  const a = clip('a'), b = clip('b'), c = clip('c'); cache.update([a, b], false);
  await complete(a.lite.src); const aUrl = cache.play(a).src; cache.finish();
  const stale = requests.find((r) => r.src === b.lite.src); stale.ignoreAbort = true;
  cache.update([c], false);
  assert.ok(stale.signal.aborted); assert.ok(revoked.includes(aUrl));
  stale.resolve(); await flush(); assert.equal(created.length, 1, 'late unused bytes do not enter cache');
  await complete(c.lite.src); assert.equal(cache.snapshot().liteReady, 1); assert.equal(cache.snapshot().bytes, 10);
}));

test('disable/roster changes preserve the current movie until its end, then release its URL', async () => mocked(async ({ cache, complete, revoked, pending }) => {
  const a = clip('a'); cache.update([a], false); await complete(a.lite.src);
  const movie = cache.play(a); cache.update([], false);
  assert.ok(!revoked.includes(movie.src)); assert.equal(pending().length, 0);
  cache.finish(); assert.ok(revoked.includes(movie.src)); assert.equal(cache.snapshot().bytes, 0);
}));

test('slow/save-data policy downloads only light clips; errors leave a direct playback path', async () => mocked(async ({ cache, requests, complete }) => {
  const a = clip('a'), b = clip('b'); cache.update([a, b], false);
  await complete(a.lite.src, 10, false); await complete(b.lite.src);
  assert.ok(requests.every((r) => r.src.startsWith('/lite/')));
  assert.equal(cache.play(a).src, a.lite.src); cache.finish();
  assert.equal(cache.play(b).cached, true);
}));

test('cache byte budget rejects oversized responses and unmount releases all owned resources', async () => mocked(async ({ cache, complete, created, revoked, pending }) => {
  const a = clip('a'), b = clip('b'); cache.update([a, b], false);
  await complete(a.lite.src, 32 * 1024 * 1024 + 1); await complete(b.lite.src);
  assert.equal(cache.snapshot().bytes, 10); assert.equal(created.length, 1);
  cache.dispose(); assert.deepEqual(revoked, created); assert.equal(cache.snapshot().bytes, 0);
  cache.update([a]); await flush(); assert.equal(pending().length, 0);
}));
