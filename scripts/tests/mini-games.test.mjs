import assert from 'node:assert/strict';
import test from 'node:test';
import { aiPilot, fabPilot, playSnack } from './helpers/mini-games-pilots.mjs';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const fab = await loadTypescriptModule('src/components/miniGames/fabEngine.ts');
const snack = await loadTypescriptModule('src/components/miniGames/snackEngine.ts');
const { industryEvent } = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
const nextAi = state => {
  let s = state;
  if (!s.industry.eventResolved) { const c = industryEvent(s.industry.eventId).choices.find(c => s.cash + (c.deltas.cash || 0) >= 0); s = ai.decideAiEvent(s, c.id); }
  return ai.endAiTurn(s);
};
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
  s = nextAi(s); s = ai.actAi(s, 'train'); s = ai.actAi(s, 'release');
  assert.ok(ai.aiIncome(s) > 0);
  s = nextAi(s); s = ai.actAi(s, 'distill');
  assert.equal(s.efficiency, 2);
  assert.ok(ai.aiCost(s, 'train') < 25);
  s = { ...s, cash: 500, capability: 60, safety: 70, actions: 3, used: [] };
  s = ai.actAi(s, 'self'); const before = structuredClone(s); s = nextAi(s);
  assert.equal(s.capability - before.capability, 9); assert.equal(before.safety - s.safety, 6);
  assert.ok(s.rivals.every((r, i) => r.capability > before.rivals[i].capability));
  assert.equal(s.industry.lastCosts, ai.aiUpkeep(before)); assert.ok(s.industry.lastIncome > 0);
});
test('all AI specialties can complete a reliable AGI route across seeds, and idling loses', () => {
  for (const style of ai.AI_STYLES) for (const seed of [1, 42, 2026, 7788]) {
    const result = aiPilot(seed, style.id, 'shared');
    assert.equal(result.ending?.title, '共同富裕', `${style.id}/${seed}: ${JSON.stringify(result)}`);
    assert.deepEqual(result, aiPilot(seed, style.id, 'shared'));
  }
  let s = { ...ai.createAi(), cash: 1000 };
  while (!s.ending) s = nextAi(s);
  assert.match(s.ending.title, /率先抵达/);
  assert.equal(ai.endAiTurn(s), s);
  let poor = ai.createAi(); while (!poor.ending) poor = nextAi(poor);
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
test('all five snack menus across four music offsets can be completed through taps with persistent records', () => {
  for (const seed of [0, 1, 42, 2027]) {
    let best = [0, 0, 0, 0, 0];
    for (let level = 0; level < 5; level++) {
      const s = playSnack(snack.createSnack(seed, level, best));
      assert.equal(s.phase, level === 4 ? 'ending' : 'won', JSON.stringify(s));
      assert.ok(s.remaining.every(n => n === 0)); assert.ok(s.score > 1000);
      best = s.best;
      const before = structuredClone(s); snack.advanceSnack(s, 10000); assert.deepEqual(s, before);
      assert.deepEqual(readGameSave(JSON.stringify(s), 'snack'), s);
    }
    assert.ok(best.every(score => score > 1000));
  }
});
test('snack taps finish one serving automatically, while holding or repeated down cannot start another', () => {
  const tap = snack.createSnack(); tap.phase = 'playing';
  snack.snackInput(tap, 'eat', true); snack.snackInput(tap, 'eat', false);
  assert.ok(tap.chewing > 0, 'A tap between animation frames must still take a serving');
  snack.advanceSnack(tap, 1800);
  assert.equal(tap.eaten, 1); assert.equal(tap.chewing, 0); assert.equal(tap.remaining[0], 2);
  snack.advanceSnack(tap, 1800); assert.equal(tap.eaten, 1);

  const hold = snack.createSnack(); hold.phase = 'playing';
  snack.snackInput(hold, 'eat', true); snack.advanceSnack(hold, 1420);
  assert.equal(hold.eaten, 1); assert.equal(hold.chewing, 0); assert.ok(hold.cooldown > 0);
  snack.snackInput(hold, 'eat', true); snack.advanceSnack(hold, 1800);
  assert.equal(hold.eaten, 1, 'Held-key repeats cannot eat a second serving');
  snack.snackInput(hold, 'eat', false); snack.snackInput(hold, 'eat', true);
  assert.ok(hold.chewing > 0);

  const immediate = snack.createSnack(); immediate.phase = 'playing';
  snack.snackInput(immediate, 'eat', true); snack.snackInput(immediate, 'eat', false);
  snack.advanceSnack(immediate, 1420); assert.ok(immediate.cooldown > 0);
  snack.snackInput(immediate, 'eat', true); snack.snackInput(immediate, 'eat', false);
  assert.ok(immediate.chewing > 0, 'A deliberate next tap is accepted immediately after swallowing');
  snack.advanceSnack(immediate, 1420); assert.equal(immediate.eaten, 2);
});
test('snack presses while chewing never queue a serving, including automatic food selection', () => {
  const s = snack.createSnack(0, 1); s.phase = 'playing';
  snack.snackInput(s, 'eat', true); snack.advanceSnack(s, 400);
  const progress = s.chewing;
  snack.selectSnack(s, 2); assert.equal(s.selected, 0, 'Food cannot change while it is in the mouth');
  for (let i = 0; i < 4; i++) {
    snack.snackInput(s, 'eat', false); snack.snackInput(s, 'eat', true);
  }
  assert.equal(s.chewing, progress, 'Extra presses must not reset chewing');
  snack.advanceSnack(s, 1800);
  assert.equal(s.eaten, 1); assert.equal(s.chewing, 0);
  assert.equal(s.selected, 1); assert.equal(s.remaining[1], 3);
  snack.snackInput(s, 'eat', true); snack.advanceSnack(s, 500);
  assert.equal(s.eaten, 1); assert.equal(s.chewing, 0);
  snack.snackInput(s, 'eat', false); snack.snackInput(s, 'eat', true); snack.snackInput(s, 'eat', false);
  snack.advanceSnack(s, 2100); assert.equal(s.eaten, 2); assert.equal(s.remaining[1], 2);
});
test('snack muffled replies restore atmosphere while chewing slowly, then clear speech becomes effective again', () => {
  const s = snack.createSnack(0, 2); s.phase = 'playing'; s.energy = 25; s.suspicion = 5;
  snack.selectSnack(s, 3);
  snack.snackInput(s, 'eat', true); snack.snackInput(s, 'eat', false);
  snack.snackInput(s, 'talk', true);
  assert.equal(snack.snackSpeech(s), 'muffled');
  const automatic = structuredClone(s); snack.snackInput(automatic, 'talk', false);
  const clear = structuredClone(s); clear.chewing = 0;
  snack.advanceSnack(s, 1000); snack.advanceSnack(automatic, 1000); snack.advanceSnack(clear, 1000);
  assert.ok(s.energy > 25, 'A mouthful reply must make net progress against the atmosphere drain');
  assert.ok(s.energy < clear.energy, 'Swallowing before speaking should recover atmosphere faster');
  assert.ok(s.suspicion > 5); assert.ok(clear.suspicion < 5);
  assert.ok(s.chewing > 0 && s.chewing < automatic.chewing, 'Replying slows chewing without stopping it');
  snack.snackInput(s, 'talk', false);
  const before = s.chewing; snack.advanceSnack(s, 500);
  assert.ok(s.chewing - before > 0.49, 'Releasing talk returns to normal chewing speed');
  snack.snackInput(s, 'talk', true); snack.advanceSnack(s, 5000);
  assert.equal(s.phase, 'playing'); assert.equal(s.eaten, 1); assert.equal(s.chewing, 0);
  assert.equal(snack.snackSpeech(s), 'clear');
  const afterBite = s.suspicion; const energy = s.energy;
  snack.advanceSnack(s, 800);
  assert.equal(s.eaten, 1, 'Continuing a reply after swallowing cannot pick up another serving');
  assert.ok(s.suspicion < afterBite); assert.ok(s.energy > energy);
});
test('snack music and mute reduce each food noise, and mute prevents even a muffled reply', () => {
  for (let index = 0; index < snack.SNACKS.length; index++) {
    const noise = snack.createSnack(0, 4); noise.phase = 'playing'; snack.selectSnack(noise, index);
    const music = structuredClone(noise); music.time = 9;
    const quiet = structuredClone(noise);
    for (const state of [noise, music, quiet]) {
      snack.snackInput(state, 'eat', true); snack.snackInput(state, 'eat', false);
    }
    snack.snackInput(quiet, 'mute', true); snack.snackInput(quiet, 'talk', true);
    for (const state of [noise, music, quiet]) snack.advanceSnack(state, 700);
    assert.ok(noise.suspicion > music.suspicion, snack.SNACKS[index].name);
    assert.ok(music.suspicion > quiet.suspicion); assert.equal(quiet.suspicion, 0);
    assert.ok(noise.energy > quiet.energy, 'Muted chewing drains atmosphere faster');
    assert.equal(snack.snackSpeech(quiet), 'silent'); assert.equal(quiet.chewing, noise.chewing);

    const reply = structuredClone(noise); const coveredReply = structuredClone(music);
    const beforeNoise = reply.suspicion; const beforeMusic = coveredReply.suspicion;
    snack.snackInput(reply, 'talk', true); snack.snackInput(coveredReply, 'talk', true);
    snack.advanceSnack(reply, 300); snack.advanceSnack(coveredReply, 300);
    assert.ok(reply.suspicion - beforeNoise > coveredReply.suspicion - beforeMusic, 'Music still helps during a muffled reply');
  }
});
test('snack exposed crunching and nonstop muffled chatter can still be caught through legal inputs', () => {
  for (const talking of [false, true]) {
    const s = snack.createSnack(0, 4); s.phase = 'playing';
    snack.selectSnack(s, 2);
    snack.snackInput(s, 'talk', talking);
    for (let i = 0; i < 3600 && s.phase === 'playing'; i++) {
      if (!s.chewing) {
        snack.snackInput(s, 'eat', true); snack.snackInput(s, 'eat', false);
      }
      snack.advanceSnack(s, 1000 / 60);
    }
    assert.equal(s.phase, 'lost', `Unmasked ${talking ? 'muffled replies' : 'crunching'} must still carry risk`);
    assert.equal(s.suspicion, 100); assert.match(s.message, /偷吃声/);
    assert.ok(s.energy > 0 && s.time < snack.SNACK_LEVELS[s.level].limit, 'Noise, not atmosphere or time, caused this loss');
    assert.ok(s.eaten >= 1 && s.remaining.some(n => n > 0), 'Suspicion accumulates naturally over actual servings');
  }
});
test('snack holding one bite cannot clear the menu or prevent silence, and timeouts still matter', () => {
  const held = snack.createSnack(); held.phase = 'playing'; snack.snackInput(held, 'eat', true); snack.advanceSnack(held, 20000);
  assert.equal(held.phase, 'lost'); assert.equal(held.eaten, 1); assert.match(held.message, /冷场/);
  const silent = snack.createSnack(); silent.phase = 'playing'; snack.advanceSnack(silent, 20000);
  assert.equal(silent.phase, 'lost'); assert.match(silent.message, /冷场/);
  const timeout = snack.createSnack(); timeout.phase = 'playing'; snack.snackInput(timeout, 'talk', true); snack.advanceSnack(timeout, 70000);
  assert.equal(timeout.phase, 'lost'); assert.match(timeout.message, /时间/);
});
test('pause clears held controls, persists a safe resume point, and invalid storage is rejected', () => {
  const s = snack.createSnack(); s.phase = 'playing'; snack.snackInput(s, 'eat', true); snack.advanceSnack(s, 300);
  snack.pauseSnack(s); assert.equal(s.phase, 'paused'); assert.ok(Object.values(s.inputs).every(v => !v));
  const before = structuredClone(s); snack.advanceSnack(s, 10000); assert.deepEqual(s, before);
  snack.pauseSnack(s); assert.equal(s.phase, 'playing');
  const loaded = readGameSave(JSON.stringify(s), 'snack'); assert.equal(loaded.phase, 'paused');
  assert.equal(loaded.chewing, s.chewing); assert.ok(Object.values(loaded.inputs).every(v => !v));
  const pausedSave = structuredClone(loaded); snack.advanceSnack(loaded, 10000); assert.deepEqual(loaded, pausedSave);
  snack.pauseSnack(loaded); snack.advanceSnack(loaded, 2000);
  assert.equal(loaded.eaten, 1); assert.equal(loaded.chewing, 0, 'A version-1 partial bite resumes automatically');
  const loadedBites = loaded.eaten; snack.advanceSnack(loaded, 1000); assert.equal(loaded.eaten, loadedBites);
  snack.snackInput(loaded, 'eat', true); snack.snackInput(loaded, 'eat', false);
  const immediateSave = readGameSave(JSON.stringify(loaded), 'snack');
  assert.ok(immediateSave.chewing > 0, 'A just-accepted tap is preserved even before the next tick');
  snack.pauseSnack(immediateSave); snack.advanceSnack(immediateSave, 1500); assert.equal(immediateSave.eaten, 2);
  for (const game of [ai.createAi(), fab.createFab(), snack.createSnack()]) {
    assert.deepEqual(readGameSave(JSON.stringify(game), game.kind), game);
    assert.equal(readGameSave('{broken', game.kind), null);
    assert.equal(readGameSave(JSON.stringify({ ...game, version: 99 }), game.kind), null);
  }
  assert.equal(readGameSave(JSON.stringify({ ...s, level: 88 }), 'snack'), null);
  assert.equal(readGameSave(JSON.stringify({ ...s, remaining: [] }), 'snack'), null);
});
