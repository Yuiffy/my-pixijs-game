/* Focused rules verification for the DEM geography and multi-level canal. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();
function load(file) {
  const resolved = path.resolve(file);
  if (modules.has(resolved)) return modules.get(resolved);
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const exports = {}; modules.set(resolved, exports);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', code)(exports, spec => load(path.join(path.dirname(resolved), `${spec}${spec.endsWith('.json') ? '' : '.ts'}`)));
  return exports;
}
const e = load('src/components/pingluCanal/terrainEngine.ts');
const g = load('src/components/pingluCanal/geography.ts');
let game = e.createTerrain();
assert.equal(game.plots.length, 3456);
assert.equal(e.GEOGRAPHY.elevation.length, game.plots.length);
assert.deepEqual(e.createTerrain(1, 0, 9).plots, game.plots, 'New games preserve the real geography');
assert.deepEqual(e.LOCKS.map(l => l.name), ['马道枢纽', '企石枢纽', '青年枢纽']);
assert(e.START[1] < e.LOCKS[0].at[1] && e.LOCKS[2].at[1] < e.END[1]);
assert.equal(e.findRoute(game), null);
assert(e.restoreTerrain(JSON.stringify(game)), 'New terrain and its high mountains survive save restore');
assert.equal(e.restoreTerrain(JSON.stringify({ ...game, version: 2 })), null, 'Legacy maps must not load under new dimensions');
// Original rivers stop on opposite sides of a dry divide. They are not a generated sine canal.
assert(e.GEOGRAPHY.rivers.some(r => r.name === '沙坪河'));
assert(e.GEOGRAPHY.rivers.some(r => r.name === '旧州江'));
const gap = game.plots.map((p, id) => ({ p, id, at: e.xy(id) })).filter(({ at }) => at[0] >= 29 && at[0] <= 35 && at[1] >= 16 && at[1] <= 18);
assert(gap.every(({ p }) => !p.naturalWater), 'The watershed must start dry');
assert(gap.some(({ p, id }) => p.height > e.waterLevel(id)), 'The watershed must require a land cut');
let survey = e.surveyTerrain(game);
const initialPlan = survey.proposal;
assert(initialPlan.blocked.length > 200 && initialPlan.remaining > 1000);
assert.equal(e.quoteTerrain(game, { tool: 'lock', cells: [], source: 0 }).error, '先开挖、疏浚闸室的 15 格基坑至各自设计底层');
// Construct the entire initial plan with legal, paid earthwork actions, including funding and spoil capacity.
for (let step = 0; step < 250; step++) {
  const blocked = initialPlan.cells.filter(id => game.plots[id].height > e.bedLevel(id) && !e.isPort(id));
  if (!blocked.length) break;
  const high = game.plots[blocked[0]].height > e.waterLevel(blocked[0]);
  let action = { tool: high ? 'blast' : 'dredge', cells: blocked.filter(id => (game.plots[id].height > e.waterLevel(id)) === high).slice(0, e.MAX_CELLS) };
  const quote = e.quoteTerrain(game, action);
  if (quote.error) action = { tool: e.pileSize(e.currentPlayer(game)) > 180 && e.currentPlayer(game).cash >= 8 ? 'dispose' : 'fund', cells: [] };
  assert.equal(e.quoteTerrain(game, action).error, null);
  const next = e.applyTerrainAction(game, action); assert.notEqual(next, game); game = next;
}
assert(initialPlan.cells.every(id => game.plots[id].height <= e.bedLevel(id)), 'Every planned tile can be excavated within the normal budget/turn rules');
assert.equal(e.findRoute(game), null, 'Earthwork alone cannot bypass unbuilt locks');
for (const lock of e.LOCKS) {
  if (e.currentPlayer(game).cash < 30) game = e.applyTerrainAction(game, { tool: 'fund', cells: [] });
  const action = { tool: 'lock', cells: [], source: lock.index };
  assert.equal(e.quoteTerrain(game, action).error, null); game = e.applyTerrainAction(game, action);
}
assert.deepEqual(e.restoreTerrain(JSON.stringify(game)), JSON.parse(JSON.stringify(game)), 'Completed construction, funding and locks restore exactly');
survey = e.surveyTerrain(game);
assert(survey.route, 'A fully excavated three-lock canal must pass the route survey');
assert(e.LOCKS.every(l => e.lockCells(l.index).every(id => survey.route.cells.includes(id))), 'All lock chambers are adopted');
assert(survey.route.cells.every(id => survey.wet[id]), 'The accepted navigation corridor must actually contain water');
assert.equal(e.scoreTerrain(game, survey.route)[0].locks, 3);
assert.equal(e.findRoute({ ...game, locks: [0, null, 0] }), null);
assert(e.restoreTerrain(JSON.stringify(game)), 'Completed locks and earthwork survive save restore');
// Filling every optional depression still leaves an excavatable navigation reservation.
const reclaimed = e.createTerrain();
reclaimed.plots.forEach(p => { if (p.farm) { p.height = e.reclamationLevel(p); p.fill.push({ player: 0, source: 0, level: 0 }); } });
assert(e.findRoute(reclaimed, true), 'Reclamation cannot destroy every possible route');
const report = { checks: ['DEM grid', 'fixed geography', 'north-south landmarks', 'dry watershed', 'paid earthworks', 'water levels', 'mandatory locks', 'save restore', 'reclamation reserve'], completedAtRound: game.round, moves: game.moves, routeKm: Number((survey.route.length / 1000).toFixed(1)), initialEarthwork: initialPlan.remaining, waterSteps: g.WATER_STEPS };
fs.mkdirSync('artifacts/pinglu-geography', { recursive: true });
fs.writeFileSync('artifacts/pinglu-geography/rules-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

