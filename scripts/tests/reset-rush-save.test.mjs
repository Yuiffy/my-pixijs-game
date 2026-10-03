import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const S = await loadTypescriptModule('src/components/resetRush/save.ts');
const raw = game => JSON.stringify(game);
const fresh = () => E.createGame(610, 21);
function storage(entries = []) {
  const values = new Map(entries), writes = [];
  return {
    values, writes,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes.push(key); values.set(key, value); },
  };
}
const originals = store => [...store.values].filter(([key]) => key.startsWith(S.RECOVERY_PREFIX)).map(([, value]) => value);

test('normal changes preserve the previous position; reload never rotates the backup', () => {
  const store = storage(), first = fresh(), second = E.advanceMinutes(first, 60);
  assert.deepEqual(S.readResetSave(store), { game: null, issue: null });
  assert.equal(S.writeResetSave(store, first).ok, true);
  assert.equal(store.values.has(S.BACKUP_KEY), false);
  assert.equal(S.writeResetSave(store, second).ok, true);
  assert.equal(store.values.get(S.BACKUP_KEY), raw(first));
  assert.deepEqual(S.readResetSave(store).game, second);
  S.writeResetSave(store, second);
  assert.equal(store.values.get(S.BACKUP_KEY), raw(first));
});

test('damaged newest save blocks silent fallback and all ordinary writes', () => {
  const broken = '{"version":5,"day":12,"players":', valid = fresh();
  const store = storage([[E.SAVE_KEY, broken], [E.V4_SAVE_KEY, raw(valid)]]);
  const read = S.readResetSave(store);
  assert.equal(read.game, null);
  assert.equal(read.issue.kind, 'damaged');
  assert.deepEqual(read.issue.candidate, valid);
  assert.equal(S.writeResetSave(store, valid).ok, false);
  assert.deepEqual(store.writes, []);
  assert.equal(store.values.get(E.SAVE_KEY), broken);
});

test('backup takes priority over older keys and missing primary resumes it', () => {
  const newer = E.advanceMinutes(fresh(), 60), older = fresh();
  const store = storage([[S.BACKUP_KEY, raw(newer)], [E.V4_SAVE_KEY, raw(older)]]);
  assert.deepEqual(S.readResetSave(store).game, newer);
  assert.equal(S.writeResetSave(store, newer).ok, true);
  assert.equal(store.values.get(S.BACKUP_KEY), raw(newer));
  store.values.set(E.SAVE_KEY, '');
  assert.deepEqual(S.readResetSave(store).issue.candidate, newer);
});

test('explicit recovery preserves every unread original verbatim before replacement', () => {
  const valid = fresh(), broken = ['{broken\n中文', '', '{"version":100}'];
  const store = storage([[E.SAVE_KEY, broken[0]], [S.BACKUP_KEY, broken[1]], [E.V4_SAVE_KEY, broken[2]], [E.V3_SAVE_KEY, raw(valid)]]);
  assert.equal(S.writeResetSave(store, valid, true).ok, true);
  assert.deepEqual(originals(store), broken);
  assert.equal(store.values.get(E.V4_SAVE_KEY), broken[2]);
  assert.deepEqual(S.readResetSave(store), { game: valid, issue: null });
  assert.equal(store.writes.at(-1), E.SAVE_KEY);
});

test('explicit fresh game preserves both damaged primary and valid previous game', () => {
  const previous = E.advanceMinutes(fresh(), 60), replacement = E.createGame(900, 42);
  const store = storage([[E.SAVE_KEY, '{broken'], [E.V4_SAVE_KEY, raw(previous)]]);
  assert.equal(S.writeResetSave(store, replacement, true).ok, true);
  assert.equal(store.values.get(S.BACKUP_KEY), raw(previous));
  assert.deepEqual(originals(store), ['{broken']);
  assert.deepEqual(S.readResetSave(store).game, replacement);
});

test('structured invalid state cannot be silently replaced without a candidate', () => {
  const invalid = fresh(); invalid.players[0].energy = -1;
  const store = storage([[E.SAVE_KEY, raw(invalid)]]);
  assert.equal(S.readResetSave(store).issue.candidate, null);
  assert.equal(S.writeResetSave(store, fresh()).ok, false);
  assert.equal(S.writeResetSave(store, fresh(), true).ok, true);
  assert.deepEqual(originals(store), [raw(invalid)]);
});

test('preservation failure stops replacement, and retry preserves all originals', () => {
  const store = storage([[E.SAVE_KEY, '{one'], [S.BACKUP_KEY, '{two']]);
  const set = store.setItem.bind(store); let count = 0;
  store.setItem = (key, value) => { if (++count === 2) throw new Error('quota'); set(key, value); };
  assert.equal(S.writeResetSave(store, fresh(), true).ok, false);
  assert.equal(store.values.get(E.SAVE_KEY), '{one');
  assert.equal(store.values.get(S.BACKUP_KEY), '{two');
  store.setItem = set;
  assert.equal(S.writeResetSave(store, fresh(), true).ok, true);
  assert.ok(originals(store).includes('{one') && originals(store).includes('{two'));
});

test('backup write failure leaves the old main position; retry saves the current position', () => {
  const first = fresh(), second = E.advanceMinutes(first, 60), store = storage([[E.SAVE_KEY, raw(first)]]);
  const set = store.setItem.bind(store);
  store.setItem = (key, value) => { if (key === S.BACKUP_KEY) throw new Error('quota'); set(key, value); };
  assert.equal(S.writeResetSave(store, second).ok, false);
  assert.equal(store.values.get(E.SAVE_KEY), raw(first));
  store.setItem = set;
  assert.equal(S.writeResetSave(store, second).ok, true);
  assert.equal(store.values.get(S.BACKUP_KEY), raw(first));
  assert.deepEqual(S.readResetSave(store).game, second);
});

test('main write failure after preservation leaves damaged primary and a recoverable backup', () => {
  const candidate = fresh(), store = storage([[E.SAVE_KEY, '{broken'], [E.V4_SAVE_KEY, raw(candidate)]]);
  const set = store.setItem.bind(store), replacement = E.advanceMinutes(candidate, 60);
  store.setItem = (key, value) => { if (key === E.SAVE_KEY) throw new Error('quota'); set(key, value); };
  assert.equal(S.writeResetSave(store, replacement, true).ok, false);
  assert.equal(store.values.get(E.SAVE_KEY), '{broken');
  assert.equal(store.values.get(S.BACKUP_KEY), raw(candidate));
  assert.deepEqual(originals(store), ['{broken']);
  store.setItem = set;
  assert.equal(S.writeResetSave(store, replacement, true).ok, true);
});

test('unavailable reads refuse writes even when replacement is explicitly requested', () => {
  const store = storage([[E.SAVE_KEY, '{broken']]), get = store.getItem;
  store.getItem = () => { throw new Error('denied'); };
  assert.equal(S.readResetSave(store).issue.kind, 'unavailable');
  assert.equal(S.writeResetSave(store, fresh(), true).ok, false);
  assert.deepEqual(store.writes, []);
  store.getItem = get;
  assert.equal(S.readResetSave(store).issue.kind, 'damaged');
});

test('v1 through v5 saves migrate without deleting their source', () => {
  for (const [version, key] of [[1, E.LEGACY_SAVE_KEY], [2, E.V2_SAVE_KEY], [3, E.V3_SAVE_KEY], [4, E.V4_SAVE_KEY], [5, E.SAVE_KEY]]) {
    const source = version <= 2 ? readFileSync(new URL(`./fixtures/reset-rush-v${version}.json`, import.meta.url), 'utf8') : raw({ ...fresh(), version });
    const store = storage([[key, source]]), migrated = S.readResetSave(store).game;
    assert.ok(migrated, `v${version}`); assert.equal(migrated.version, 5);
    assert.equal(S.writeResetSave(store, migrated).ok, true);
    if (version < 5) assert.equal(store.values.get(key), source);
    assert.deepEqual(S.readResetSave(store).game, migrated);
  }
});

test('all ordinary season transitions including reveals and completed games remain restorable', () => {
  for (const length of [21, 42]) {
    let game = E.createGame(610, length); const store = storage();
    while (game.phase !== 'over') {
      assert.equal(S.writeResetSave(store, game).ok, true);
      assert.deepEqual(S.readResetSave(store).game, game);
      game = game.phase === 'plan' ? E.endDay(game) : E.nextDay(game);
    }
    assert.equal(S.writeResetSave(store, game).ok, true);
    assert.deepEqual(S.readResetSave(store).game, game);
  }
});
