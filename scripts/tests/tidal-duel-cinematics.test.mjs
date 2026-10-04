import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { createGame, startGame, skipTransition, stepGame, emptyInput } = await loadTypescriptModule("src/components/tidalDuel/engine.ts");
const { DUEL_MOVIES, movieForHit, matchMovies, DuelMovieCache } = await loadTypescriptModule("src/components/tidalDuel/cinematics.ts");
function match(character, side = 0, gap = 109, skin = "original") {
  const game = createGame({ mode: "local", character: side ? "shiori" : character, opponent: side ? character : "shiori", skin, opponentSkin: skin });
  startGame(game); skipTransition(game);
  game.fighters[0].x = 565; game.fighters[1].x = 565 + gap;
  game.fighters[side].meter = 100;
  return game;
}
function strike(game, side, blocked = false, action = "special") {
  const found = [];
  for (let i = 0; i < 120; i++) {
    const attack = { ...emptyInput(), [action]: i === 0 };
    const defense = { ...emptyInput(), guard: blocked };
    stepGame(game, side ? [defense, attack] : [attack, defense]);
    for (const event of game.events) if (event.type === "hit" || event.type === "block") {
      if (!found.some(e => e.id === event.id)) found.push(event);
    }
  }
  return found;
}

test("only confirmed supers select the correct movie for all three fighters in both slots", () => {
  for (const actor of ["sui", "shiori", "mizuki"]) for (const side of [0, 1]) {
    const game = match(actor, side);
    const events = strike(game, side);
    assert.equal(events.length, 1);
    assert.equal(events[0].move, "super");
    assert.equal(events[0].moveKind, "super");
    assert.equal(movieForHit(game, events[0]).character, actor);
    assert.equal(game.fighters[side].meter, 0);
    assert.ok(game.fighters[1 - side].hp < 300);
  }
});
test("blocked supers and wide whiffs never select movies or add a second damage application", () => {
  for (const actor of ["sui", "shiori", "mizuki"]) {
    const blocked = match(actor);
    const events = strike(blocked, 0, true);
    assert.ok(events.some(e => e.type === "block"));
    assert.ok(events.every(e => movieForHit(blocked, e) === null));
    assert.equal(blocked.fighters[1].hp, 292);
    const whiff = match(actor, 0, 600);
    assert.deepEqual(strike(whiff, 0), []);
    assert.equal(whiff.fighters[1].hp, 300);
  }
});
test("ordinary skills remain uninterrupted, and movies never show a mismatched costume", () => {
  for (const actor of ["sui", "shiori", "mizuki"]) {
    const game = match(actor);
    assert.ok(strike(game, 0, false, "ability").every(e => movieForHit(game, e) === null));
  }
  for (const actor of ["sui", "shiori"]) {
    const game = match(actor, 0, 109, "resort");
    assert.deepEqual(matchMovies(game), []);
    assert.ok(strike(game, 0).every(e => movieForHit(game, e) === null));
  }
  assert.equal(matchMovies(match("shiori")).length, 1, "mirror matches load only one copy");
  assert.deepEqual(matchMovies(match("mizuki")).map(c => c.character), ["shiori", "mizuki"]);
});
test("delivered movies are distinct faststart MP4s with native sound, matching checksums and measured duration", () => {
  const delivery = JSON.parse(fs.readFileSync("docs/tidal-duel-cinematics-delivery.json", "utf8"));
  assert.equal(DUEL_MOVIES.length, 3);
  assert.equal(new Set(delivery.clips.map(c => c.sha256)).size, 3);
  for (const clip of delivery.clips) {
    const bytes = fs.readFileSync(`public${clip.src}`);
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), clip.sha256);
    assert.ok(clip.duration > 4.8 && clip.duration < 5.3);
    assert.equal(clip.videoCodec, "h264"); assert.equal(clip.audioCodec, "aac");
    assert.ok(bytes.includes(Buffer.from("soun")));
    const boxes = [];
    for (let offset = 0; offset + 8 <= bytes.length;) {
      const size = bytes.readUInt32BE(offset); assert.ok(size >= 8);
      boxes.push(bytes.toString("ascii", offset + 4, offset + 8)); offset += size;
    }
    assert.ok(boxes.indexOf("moov") >= 0 && boxes.indexOf("moov") < boxes.indexOf("mdat"));
    assert.ok(fs.statSync(`public${clip.poster}`).size > 1000);
  }
});

async function mocked(task) {
  const originalFetch = globalThis.fetch, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const requests = [], blobs = [], revoked = [];
  globalThis.fetch = (src, { signal }) => new Promise(resolve => requests.push({ src, signal, done: (size = 100, ok = true) => resolve({ ok, blob: async () => ({ size }) }) }));
  URL.createObjectURL = () => { const url = `blob:duel-${blobs.length}`; blobs.push(url); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  const cache = new DuelMovieCache();
  try { await task({ cache, requests, blobs, revoked }); }
  finally { cache.dispose(); requests.forEach(r => r.done()); globalThis.fetch = originalFetch; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
}
test("simultaneous preload/play requests share one download and warm replay uses the same blob", () => mocked(async ({ cache, requests }) => {
  const clip = DUEL_MOVIES[0]; cache.prepare([clip]);
  const first = cache.load(clip), second = cache.load(clip);
  assert.equal(requests.length, 1); assert.equal(first, second);
  requests[0].done(700); const url = await first;
  assert.equal(await cache.load(clip), url); assert.equal(requests.length, 1);
  assert.deepEqual(cache.snapshot(), { ready: 1, pending: 0, bytes: 700 });
}));
test("changing actors aborts old downloads, releases old blobs, and rejects late responses", () => mocked(async ({ cache, requests, blobs, revoked }) => {
  const first = cache.load(DUEL_MOVIES[0]); requests[0].done(300); const old = await first;
  const pending = cache.load(DUEL_MOVIES[1]);
  cache.prepare([DUEL_MOVIES[2]]);
  assert.ok(requests[1].signal.aborted); assert.deepEqual(revoked, [old]);
  requests[1].done(500); assert.equal(await pending, null); assert.equal(blobs.length, 1);
  requests[2].done(800); await cache.load(DUEL_MOVIES[2]);
  assert.deepEqual(cache.snapshot(), { ready: 1, pending: 0, bytes: 800 });
}));
test("failed and oversized downloads resolve safely; disposal prevents late blob allocation", () => mocked(async ({ cache, requests, blobs }) => {
  const failed = cache.load(DUEL_MOVIES[0]); requests[0].done(100, false); assert.equal(await failed, null);
  const oversized = cache.load(DUEL_MOVIES[0]); requests[1].done(DuelMovieCache.MAX_BYTES + 1); assert.equal(await oversized, null);
  const pending = cache.load(DUEL_MOVIES[1]); cache.dispose(); requests[2].done(400);
  assert.equal(await pending, null); assert.equal(await cache.load(DUEL_MOVIES[2]), null);
  assert.equal(blobs.length, 0); assert.deepEqual(cache.snapshot(), { ready: 0, pending: 0, bytes: 0 });
}));
