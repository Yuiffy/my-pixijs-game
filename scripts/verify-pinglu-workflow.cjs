/* Focused verification of paid auto logistics and grouped contractor turns. */
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
const source = e.tileId(10, 10);
const cells = [e.tileId(11, 10), e.tileId(12, 10), e.tileId(13, 10)];
function fixture() {
  const game = e.createTerrain();
  game.plots.forEach(p => { p.height = 20; p.farm = false; p.naturalWater = false; });
  cells.forEach((id, i) => { game.plots[id].height = 2 + i * 2; game.plots[id].farm = true; game.plots[id].fillTarget = 20; });
  game.players[0].piles[source] = [{ source, level: 21, amount: 60 }];
  return game;
}
let game = fixture();
const manual = e.quoteTerrain(game, { tool: 'haul', cells, source });
assert.deepEqual(manual.depths, e.quoteTerrain(game, { tool: 'haul', cells: [...cells].reverse(), source }).depths);
assert.deepEqual(cells.map(id => manual.depths[id]), [12, 12, 12], 'Every layer goes to the current lowest tile');
let plan = e.planAutoHaul(game);
assert(plan.action && !plan.quote.error);
assert.equal(plan.quote.units, 24);
const next = e.applyTerrainAction(game, plan.action);
assert.equal(e.pileSize(next.players[0]), 36);
assert.equal(next.players[0].cash, game.players[0].cash - plan.quote.cost);
assert.equal(next.moves, 1);
assert.equal(next.turn, 1);
assert.equal(next.plots.reduce((sum, p) => sum + p.fill.length, 0), 24);
assert(next.plots.flatMap(p => p.fill).every(s => s.source === source && s.player === 0 && s.level === 21));
assert.equal(game.plots[cells[0]].height, 2, 'Planning and applying preserve the input snapshot for undo');
game = next;
while ((plan = e.planAutoHaul(game)).action) game = e.applyTerrainAction(game, plan.action);
assert.equal(game.moves, 2, 'Stop when local sites reach their target surfaces');
assert.equal(e.pileSize(game.players[0]), 12);
assert(cells.every(id => game.plots[id].height === 20));
assert.match(plan.reason, /没有可回填/);

game = fixture();
const far = e.tileId(35, 10);
game.plots[far].farm = true; game.plots[far].height = 10; game.plots[far].fillTarget = 13;
game.players[0].haulTarget = far;
plan = e.planAutoHaul(game);
assert.deepEqual(plan.action.cells, [far], 'Pinned delivery ignores closer sites outside the chosen radius');
game = e.applyTerrainAction(game, plan.action);
assert.equal(e.planAutoHaul(game).action, null, 'Do not silently move to another region after the pinned area fills');
assert.equal(e.restoreTerrain(JSON.stringify(game)).players[0].haulTarget, far);
const invalid = structuredClone(game); invalid.players[0].haulTarget = 999999;
assert.equal(e.restoreTerrain(JSON.stringify(invalid)), null);

game = fixture(); game.players[0].cash = 0;
assert.equal(e.planAutoHaul(game).action, null); assert.match(e.planAutoHaul(game).reason, /资金不足/);
game.players[0].piles = {};
assert.match(e.planAutoHaul(game).reason, /等待新土方/);
game = fixture();
// A full-height river wall prevents trucks from reaching the pinned far bank.
for (let z = 0; z < e.MAP_H; z++) {
  const p = game.plots[e.tileId(15, z)]; p.naturalWater = true; p.height = -3;
}
game.plots[far].farm = true; game.plots[far].height = 20; game.plots[far].fillTarget = 23;
game.players[0].haulTarget = far;
assert.equal(e.planAutoHaul(game).action, null); assert.match(e.planAutoHaul(game).reason, /陆路不通/);
game.players[0].piles[far] = [{ source: far, level: 24, amount: 3 }];
assert.equal(e.planAutoHaul(game).action.source, far, 'Automatically switch to a reachable owned stockpile');
game = fixture(); game.players[0].haulTarget = cells[0];
cells.forEach(id => { game.plots[id].cuts[21] = 0; });
assert.equal(e.planAutoHaul(game).action, null, 'Automatic logistics must not refill excavated work sites');

game = e.createTerrain(2, 2);
assert.deepEqual(e.turnOrder(game), [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
const acted = [];
for (let i = 0; i < 12; i++) { acted.push(e.currentPlayer(game).id); game = e.applyTerrainAction(game, { tool: 'pass', cells: [] }); }
assert.deepEqual(acted, [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
assert.equal(game.round, 2);
assert.deepEqual(e.turnOrder(game), [1, 1, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0]);
assert(game.players.every(p => p.cash === 384));
game = e.createTerrain(2); delete game.order; game.turn = 1; game.moves = 1;
game = e.restoreTerrain(JSON.stringify(game));
assert.deepEqual(e.turnOrder(game), [0, 1, 1, 0, 0, 1], 'Legacy rounds keep crews assigned to their original owners');
for (let i = 0; i < 5; i++) game = e.applyTerrainAction(game, { tool: 'pass', cells: [] });
assert.deepEqual(e.turnOrder(game), [1, 1, 1, 0, 0, 0]);
console.log('PASS: low-first fill, paid auto haul, source switching, target radius, caps, blocked/waiting states, soil attribution, grouped turns, rotating first seat, save migration.');
