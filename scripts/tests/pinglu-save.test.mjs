import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const e = await loadTypescriptModule('src/components/pingluCanal/terrainEngine.ts');
const s = await loadTypescriptModule('src/components/pingluCanal/terrainSave.ts');
const fresh = e.createTerrain();
const advanced = JSON.parse(JSON.stringify(e.applyTerrainAction(fresh, { tool: 'fund', cells: [] })));
const raw = JSON.stringify(advanced);
const store = (values = {}) => {
  const data = new Map(Object.entries(values));
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test('valid terrain and legacy crew ordering round-trip without losing construction', () => {
  for (const [humans, ais, sandbox] of [[1, 0, false], [1, 0, true], [2, 2, false], [0, 3, false]]) {
    let game = e.createTerrain(humans, ais, 18, sandbox);
    for (let i = 0; i < 15; i++) {
      const actor = e.currentPlayer(game);
      const id = game.plots.findIndex((p, id) => p.height > e.waterLevel(id) + 3 && !p.fill.length);
      const action = e.pileSize(actor) >= 220 ? { tool: 'dispose', cells: [] } : { tool: 'blast', cells: [id] };
      game = e.applyTerrainAction(game, action);
      assert.deepEqual(e.restoreTerrain(JSON.stringify(game)), JSON.parse(JSON.stringify(game)));
    }
    const legacy = structuredClone(game); delete legacy.order;
    assert.ok(e.restoreTerrain(JSON.stringify(legacy)).order);
    legacy.plots.forEach(p => { delete p.fillTarget; delete p.naturalWater; });
    assert.ok(e.restoreTerrain(JSON.stringify(legacy)), 'optional old geography fields remain compatible');
  }
});

test('reject malformed values before rendering, scoring or worker dispatch', () => {
  const changes = [
    g => { g.players[0].name = { broken: true }; },
    g => { g.players[0].ai = 'false'; },
    g => { g.players[0].style = 'invalid'; },
    g => { g.players[0].piles = []; },
    g => { g.players[0].piles['3456'] = [{ source: 3456, level: 3, amount: 1 }]; },
    g => { g.players[0].piles['1'] = [{ source: 2, level: 3, amount: 1 }]; },
    g => { g.players[0].piles['1'] = [null]; },
    g => { g.players[0].piles['1'] = [{ source: 1, level: 'high', amount: 1 }]; },
    g => { g.players[0].haulTarget = -1; },
    g => { g.players[0].cash = null; },
    g => { g.plots[0].fill = [null]; },
    g => { g.plots[0].fill = [{ player: 1, source: 0, level: 1 }]; },
    g => { g.plots[0].fill = [{ player: 0, source: 9000, level: 1 }]; },
    g => { g.plots[0].cuts = []; },
    g => { g.plots[0].cuts = { three: 0 }; },
    g => { g.plots[0].cuts = { 3: 1 }; },
    g => { g.plots[0].initial = null; },
    g => { g.plots[0].farm = {}; },
    g => { g.events[0].message = {}; },
    g => { g.events[0].player = -1; },
    g => { g.events[0].cells = [4000]; },
    g => { g.events[0].deliveries = [{ source: -1, target: 2, units: 1 }]; },
    g => { g.events[0].tool = 'hack'; },
    g => { g.moves = null; },
    g => { g.limit = 0; },
    g => { g.finishRound = 'tomorrow'; },
    g => { g.finished = 'false'; },
    g => { g.order = [0, 0, 1]; },
    g => { g.locks[0] = 1; },
  ];
  changes.forEach((change, index) => { const g = JSON.parse(raw); change(g); assert.equal(e.restoreTerrain(JSON.stringify(g)), null, `case ${index}`); });
  for (const value of ['{broken', 'null', '[]', '{}', 'false']) assert.equal(e.restoreTerrain(value), null);
});

test('empty storage initializes, valid primary takes priority, reads never write', () => {
  const storage = store(); assert.deepEqual(s.readTerrainSave(storage), { game: null, recovery: null });
  storage.setItem(s.SAVE_KEY, raw); storage.setItem(s.BACKUP_KEY, '{broken');
  assert.deepEqual(s.readTerrainSave(storage).game, advanced);
  assert.equal(storage.data.size, 2);
});

test('corrupt or missing primary offers valid backup without overwriting either slot', () => {
  for (const primary of ['{broken', '', null]) {
    const storage = store({ [s.BACKUP_KEY]: raw }); if (primary !== null) storage.setItem(s.SAVE_KEY, primary);
    const before = Array.from(storage.data.entries());
    const read = s.readTerrainSave(storage);
    assert.equal(read.game, null); assert.deepEqual(read.recovery.backup, advanced);
    assert.deepEqual(Array.from(storage.data.entries()), before);
  }
});

test('write retains previous valid state; unchanged reload does not rotate the backup', () => {
  const storage = store(); s.writeTerrainSave(storage, fresh); s.writeTerrainSave(storage, advanced);
  assert.equal(storage.getItem(s.BACKUP_KEY), JSON.stringify(fresh));
  s.writeTerrainSave(storage, advanced);
  assert.equal(storage.getItem(s.BACKUP_KEY), JSON.stringify(fresh));
  assert.equal(storage.getItem(s.SAVE_KEY), raw);
});

test('explicit recovery preserves unreadable bytes and valid backup before replacing primary', () => {
  const storage = store({ [s.SAVE_KEY]: '{broken', [s.BACKUP_KEY]: raw });
  s.writeTerrainSave(storage, advanced);
  assert.equal(storage.getItem(s.RECOVERY_KEY), '{broken');
  assert.equal(storage.getItem(s.BACKUP_KEY), raw);
  assert.equal(storage.getItem(s.SAVE_KEY), raw);
});

test('failed backup, quarantine or main write never destroys the prior main save', () => {
  for (const previous of [raw, '{broken']) {
    for (const fail of [s.SAVE_KEY, previous === raw ? s.BACKUP_KEY : s.RECOVERY_KEY]) {
      const storage = store({ [s.SAVE_KEY]: previous });
      const set = storage.setItem; storage.setItem = (key, value) => { if (key === fail) throw Error('quota'); return set(key, value); };
      assert.throws(() => s.writeTerrainSave(storage, fresh));
      assert.equal(storage.getItem(s.SAVE_KEY), previous);
    }
  }
});
