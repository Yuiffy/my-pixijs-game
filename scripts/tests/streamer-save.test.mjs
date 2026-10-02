import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { createInitialState, gameReducer } = await loadTypescriptModule('src/components/streamerGame/engine.ts');
const { SAVE_KEY, emptyCareer } = await loadTypescriptModule('src/components/streamerGame/persistence.ts');
const { BACKUP_KEY, loadRun, writeRun, parseRun, createArchive, parseArchive, mergeCareer, MAX_ARCHIVE_BYTES } = await loadTypescriptModule('src/components/streamerGame/save.ts');
const run = (seed = 42) => ({ state: gameReducer(createInitialState(), { type: 'start', seed, timed: false }), runKey: `run-${seed}` });
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map }; };

test('legacy saves retain identity, missing identity receives a stable fallback', () => {
  assert.deepEqual(parseRun(JSON.stringify(run())), run());
  assert.equal(parseRun(JSON.stringify({ state: run().state })).runKey, 'restored-42');
  for (const value of ['{', 'null', '[]', JSON.stringify({ state: createInitialState() }), JSON.stringify({ ...run(), runKey: {} })]) assert.equal(parseRun(value), null);
});
test('recover a previous valid checkpoint without overwriting damaged evidence on read', () => {
  const store = storage();
  assert.equal(loadRun(store).status, 'empty');
  writeRun(store, run(1)); writeRun(store, run(2));
  assert.equal(loadRun(store).run.state.seed, 2);
  store.setItem(SAVE_KEY, '{');
  assert.deepEqual(loadRun(store), { run: run(1), status: 'recovered' });
  assert.equal(store.getItem(SAVE_KEY), '{');
  writeRun(store, run(3));
  assert.deepEqual(parseRun(store.getItem(BACKUP_KEY)), run(1));
  store.map.delete(SAVE_KEY);
  assert.equal(loadRun(store).status, 'recovered');
  store.setItem(BACKUP_KEY, '{');
  assert.equal(loadRun(store).status, 'corrupt');
});
test('identical writes do not age the checkpoint and failed writes keep recoverable data', () => {
  const store = storage(); writeRun(store, run(1)); writeRun(store, run(2)); writeRun(store, run(2));
  assert.equal(parseRun(store.getItem(BACKUP_KEY)).state.seed, 1);
  const set = store.setItem;
  store.setItem = (key, value) => { if (key === SAVE_KEY) throw new Error('quota'); set(key, value); };
  assert.throws(() => writeRun(store, run(3)), /quota/);
  assert.equal(loadRun(store).run.state.seed, 2);
  assert.equal(parseRun(store.getItem(BACKUP_KEY)).state.seed, 2);
  assert.throws(() => loadRun({ getItem() { throw new Error('denied'); } }), /denied/);
});
test('portable archives preserve full game state and reject incompatible or oversized input', () => {
  const ongoing = run();
  ongoing.state = gameReducer(ongoing.state, { type: 'topic', id: ongoing.state.topicOptions[0] });
  const career = { ...emptyCareer(), runs: 4, best: 120, endings: ['steady'], recorded: ['old'] };
  const encoded = createArchive(ongoing, career);
  assert.deepEqual(parseArchive(encoded).run, ongoing);
  assert.deepEqual(parseArchive(encoded).career, career);
  for (const raw of ['{', 'null', encoded.replace('"version": 1', '"version": 2'), encoded.replace('"seed": 42', '"seed": -1'), encoded.replace('"runs": 4', '"runs": -1'), ' '.repeat(MAX_ARCHIVE_BYTES + 1)]) assert.throws(() => parseArchive(raw));
});
test('repeated imports merge achievements idempotently without adding career totals', () => {
  const current = { ...emptyCareer(), runs: 5, best: 200, endings: ['steady'], recorded: ['a', 'b'] };
  const incoming = { ...emptyCareer(), runs: 3, best: 400, endings: ['community'], recorded: ['b', 'c'] };
  const merged = mergeCareer(current, incoming);
  assert.equal(merged.runs, 5); assert.equal(merged.best, 400);
  assert.deepEqual(merged.endings, ['steady', 'community']);
  assert.deepEqual(merged.recorded, ['a', 'b', 'c']);
  assert.deepEqual(mergeCareer(merged, incoming), merged);
});
