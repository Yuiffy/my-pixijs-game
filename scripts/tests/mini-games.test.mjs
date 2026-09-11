import assert from 'node:assert/strict';
import test from 'node:test';
import { aiPilot, fabPilot, playSnack } from './helpers/mini-games-pilots.mjs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const fab = await loadTypescriptModule('src/components/miniGames/fabEngine.ts');
const snack = await loadTypescriptModule('src/components/miniGames/snackEngine.ts');
const { readGameSave } = await loadTypescriptModule('src/components/miniGames/save.ts');

test('AI full games reach four distinct AGI endings through legal decisions', () => {
  const expectations = { shared: '共同富裕', commerce: '商业霸主', safe: '守望者协议', doom: '失控的黎明' };
  for (const [route, title] of Object.entries(expectations)) {
    const s = aiPilot(2026, route === 'commerce' ? 'product' : 'efficient', route);
    assert.equal(s.ending?.title, title, JSON.stringify(s));
    assert.equal(s.capability, 100);
    assert.ok(s.compute >= 5);
    assert.deepEqual(readGameSave(JSON.stringify(s), 'agi'), s, 'Completed game with full-width RNG must reload');
  }
});
test('AI constraints, releases, distillation, recursion and competitor progress have economic consequences', () => {
  let s = ai.createAi();
  assert.match(ai.aiBlocked(s, 'self'), /55/);
  s = ai.actAi(s, 'train');
  assert.equal(ai.actAi(s, 'train'), s, 'One training run per quarter');
  s = ai.endAiTurn(s); s = ai.actAi(s, 'train'); s = ai.actAi(s, 'release');
  assert.ok(ai.aiIncome(s) > 0);
  s = ai.endAiTurn(s); s = ai.actAi(s, 'distill');
  assert.equal(s.efficiency, 2);
  assert.ok(ai.aiCost(s, 'train') < 25);
  s = { ...s, cash: 500, capability: 60, safety: 70, actions: 3, used: [] };
  s = ai.actAi(s, 'self'); const before = structuredClone(s); s = ai.endAiTurn(s);
  assert.equal(s.capability - before.capability, 9); assert.equal(before.safety - s.safety, 6);
  assert.ok(s.rivals.every((r, i) => r.capability > before.rivals[i].capability));
  assert.equal(s.cash, Math.round((before.cash + ai.aiIncome(before) - (4 + before.compute * 2)) * 10) / 10);
});
test('all AI specialties can complete a reliable AGI route across seeds, and idling loses', () => {
  for (const style of ai.AI_STYLES) for (const seed of [1, 42, 2026, 7788]) {
    const result = aiPilot(seed, style.id, 'shared');
    assert.equal(result.ending?.title, '共同富裕', `${style.id}/${seed}: ${JSON.stringify(result)}`);
    assert.deepEqual(result, aiPilot(seed, style.id, 'shared'));
  }
  let s = { ...ai.createAi(), cash: 1000 };
  while (!s.ending) s = ai.endAiTurn(s);
  assert.match(s.ending.title, /率先抵达/);
  assert.equal(ai.endAiTurn(s), s);
  let poor = ai.createAi(); while (!poor.ending) poor = ai.endAiTurn(poor);
  assert.equal(poor.ending.title, '现金流断裂');
});
test('fab competition clears a finite market and pricing changes demand allocation', () => {
  const base = fab.createFab(); base.production = 1;
  const cheap = fab.endFabTurn({ ...base, pricing: 0.85 });
  const costly = fab.endFabTurn({ ...base, pricing: 1.2 });
  assert.ok(cheap.player.sold > costly.player.sold);
  assert.ok(cheap.player.sold + cheap.rivals.reduce((n, f) => n + f.sold, 0) <= base.demand);
  assert.ok(cheap.player.inventory >= 0);
  const boom = { ...fab.createFab(), cycle: 2, price: 3.5, demand: 400, production: 1 };
  const markup = fab.endFabTurn({ ...boom, pricing: 1.2 });
  const discount = fab.endFabTurn({ ...boom, pricing: 0.85 });
  assert.equal(markup.player.sold, discount.player.sold, 'Supply is scarce during this boom');
  assert.ok(markup.player.profit > discount.player.profit, 'Raising prices pays when orders exceed supply');
});
test('fab inventory, two-quarter construction, loans, research and final liquidation are real', () => {
  let s = fab.createFab(); s.production = 0; s.shipment = 0;
  s = fab.actFab(s, 'expand'); assert.equal(s.player.building, 2);
  assert.equal(s.player.fabs, 2);
  const inventory = s.player.inventory; s = fab.endFabTurn(s);
  assert.equal(s.player.building, 1); assert.equal(s.player.fabs, 2); assert.equal(s.player.inventory, inventory);
  assert.equal(s.player.profit, -(12 + inventory * 0.08));
  s = fab.endFabTurn(s); assert.equal(s.player.fabs, 3); assert.equal(s.player.building, 0);
  s = fab.actFab(s, 'loan'); assert.equal(s.player.debt, 80);
  s = fab.actFab(s, 'repay'); assert.equal(s.player.debt, 0);
  const cost = fab.unitCost(s.player); s = { ...s, actions: 2, used: [] }; s.player.cash = 200;
  s = fab.actFab(s, 'research'); assert.ok(fab.unitCost(s.player) < cost);
  assert.equal(fab.liquidation(s.player, 2), Math.round((s.player.cash + s.player.inventory * 1.3 + s.player.fabs * 55) * 10) / 10);
});
test('fab full six-year games are winnable across specialties and seeds; excessive hoarding fails', () => {
  for (const style of fab.FAB_STYLES) for (const seed of [1, 42, 2026]) {
    const s = fabPilot(seed, style.id);
    assert.equal(s.turn, 24, JSON.stringify(s)); assert.ok(s.ending?.won, JSON.stringify(s));
    assert.equal(s.history.length, 25); assert.equal(fab.endFabTurn(s), s);
    assert.deepEqual(s, fabPilot(seed, style.id));
    assert.deepEqual(readGameSave(JSON.stringify(s), 'fab'), s);
  }
  let s = fab.createFab(); s.production = 1; s.shipment = 0;
  while (!s.ending) s = fab.endFabTurn(s);
  assert.equal(s.ending.title, '停机清算');
});
test('all five snack menus can be completed through controls alone with persistent records', () => {
  let best = [0, 0, 0, 0, 0];
  for (let level = 0; level < 5; level++) {
    const s = playSnack(snack.createSnack(2026, level, best));
    assert.equal(s.phase, level === 4 ? 'ending' : 'won', JSON.stringify(s));
    assert.ok(s.remaining.every(n => n === 0)); assert.ok(s.score > 1000);
    best = s.best;
    const before = structuredClone(s); snack.advanceSnack(s, 10000); assert.deepEqual(s, before);
  }
  assert.ok(best.every(score => score > 1000));
});
test('snack talking with a full mouth, noise, silence and timeout all matter', () => {
  const s = snack.createSnack(); s.phase = 'playing'; snack.snackInput(s, 'eat', true); snack.advanceSnack(s, 500);
  assert.ok(s.chewing > 0);
  const selected = s.selected; snack.selectSnack(s, 1); assert.equal(s.selected, selected);
  snack.snackInput(s, 'eat', false); snack.snackInput(s, 'talk', true); snack.advanceSnack(s, 5000);
  assert.equal(s.phase, 'lost'); assert.match(s.message, /偷吃声/);
  const silent = snack.createSnack(); silent.phase = 'playing'; snack.advanceSnack(silent, 20000);
  assert.equal(silent.phase, 'lost'); assert.match(silent.message, /冷场/);
  const timeout = snack.createSnack(); timeout.phase = 'playing'; snack.snackInput(timeout, 'talk', true); snack.advanceSnack(timeout, 70000);
  assert.equal(timeout.phase, 'lost'); assert.match(timeout.message, /时间/);
  const noise = snack.createSnack(0, 1); noise.phase = 'playing'; noise.selected = 2; snack.snackInput(noise, 'eat', true); snack.advanceSnack(noise, 1000);
  const quiet = snack.createSnack(0, 1); quiet.phase = 'playing'; quiet.selected = 2; snack.snackInput(quiet, 'eat', true); snack.snackInput(quiet, 'mute', true); snack.advanceSnack(quiet, 1000);
  assert.ok(noise.suspicion > quiet.suspicion); assert.ok(noise.energy > quiet.energy);
  const music = snack.createSnack(0, 1); music.phase = 'playing'; music.selected = 2; music.time = 8; snack.snackInput(music, 'eat', true); snack.advanceSnack(music, 1000);
  assert.ok(music.suspicion < noise.suspicion);
});
test('pause clears held controls, persists a safe resume point, and invalid storage is rejected', () => {
  const s = snack.createSnack(); s.phase = 'playing'; snack.snackInput(s, 'eat', true); snack.advanceSnack(s, 300);
  snack.pauseSnack(s); assert.equal(s.phase, 'paused'); assert.ok(Object.values(s.inputs).every(v => !v));
  const before = structuredClone(s); snack.advanceSnack(s, 10000); assert.deepEqual(s, before);
  snack.pauseSnack(s); assert.equal(s.phase, 'playing');
  const loaded = readGameSave(JSON.stringify(s), 'snack'); assert.equal(loaded.phase, 'paused');
  for (const game of [ai.createAi(), fab.createFab(), snack.createSnack()]) {
    assert.deepEqual(readGameSave(JSON.stringify(game), game.kind), game);
    assert.equal(readGameSave('{broken', game.kind), null);
    assert.equal(readGameSave(JSON.stringify({ ...game, version: 99 }), game.kind), null);
  }
  assert.equal(readGameSave(JSON.stringify({ ...s, level: 88 }), 'snack'), null);
  assert.equal(readGameSave(JSON.stringify({ ...s, remaining: [] }), 'snack'), null);
});
