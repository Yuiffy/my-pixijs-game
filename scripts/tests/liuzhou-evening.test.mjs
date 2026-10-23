import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const e = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const f = await loadTypescriptModule('src/components/liuzhou/evening.ts');
const w = await loadTypescriptModule('src/components/liuzhou/world.ts');
const game = () => { const g = e.createGame(); g.phase = 'playing'; g.stage = 6; return g; };
const close = g => { while (g.dialogue) e.interact(g); };
const talk = (g, id) => { Object.assign(g.player, g.npcs.find(n => n.id === id)); e.interact(g); while (g.dialogue.index < g.dialogue.lines.length - 1) e.interact(g); };
const advance = (g, seconds, input) => { for (let i = 0; i < seconds * 60; i++) e.step(g, input); };
let saved = null;
globalThis.localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };

test('second chapter requires explicit acceptance after the first and old saves retain their earnings', () => {
  const original = e.createGame(); original.phase = 'playing'; talk(original, 'shiori');
  assert.ok(!original.dialogue.choices); close(original); assert.equal(original.stage, 1);
  const g = game(); talk(g, 'shiori'); close(g); assert.equal(g.evening.started, false);
  talk(g, 'shiori'); e.chooseDialogue(g, 0); close(g); assert.equal(g.evening.started, true);
  e.chooseDialogue(g, 0); assert.equal(g.money, 60);
  saved = JSON.stringify({ version: 1, stage: 6, money: 81, life: { version: 1, delivered: 3, insulated: true } });
  const loaded = e.createGame(); e.loadGame(loaded); assert.equal(loaded.money, 81); assert.equal(loaded.evening.started, false); assert.equal(loaded.life.insulated, true);
});
test('all recording points have usable ground and building clearance for the full recording circle', () => {
  for (const s of f.SOUND_SPOTS) {
    assert.ok(w.canTraverse(s), s.id);
    assert.equal(w.BUILDINGS.some(b => w.buildingContains(s, b, 3.8)), false, s.id);
    assert.ok(e.nearestInteraction(Object.assign(game(), { player: { ...s, y: 0, speed: 0, angle: 0 }, evening: { ...f.createEvening(), started: true } })).kind === 'sample');
  }
});
test('recordings require six steady seconds, movement restarts, passing cars hold progress and pause/dialogue freeze it', () => {
  const g = game(); g.evening.started = true;
  Object.assign(g.player, f.SOUND_SPOTS[1]); g.traffic = []; g.vehicles = [];
  e.interact(g); assert.equal(g.evening.recording.id, 'bridge'); advance(g, 2);
  assert.ok(g.evening.recording.progress >= 1.99);
  const progress = g.evening.recording.progress;
  g.phase = 'paused'; advance(g, 3); assert.equal(g.evening.recording.progress, progress);
  g.phase = 'playing'; g.dialogue = { lines: ['wait'], index: 0, advance: false }; advance(g, 3); assert.equal(g.evening.recording.progress, progress); g.dialogue = null;
  g.vehicles.push({ id: 'noise', x: g.player.x + 8, z: g.player.z, speed: 3, kind: 'car' });
  advance(g, 2); assert.equal(g.evening.recording.progress, progress); g.vehicles = [];
  advance(g, 0.3, { forward: 1, turn: 0, sprint: false, jump: false, brake: false });
  assert.equal(g.evening.recording.progress, 0);
  advance(g, 7); assert.deepEqual(g.evening.samples, ['bridge']); assert.equal(g.evening.recording, null);
  const loaded = e.createGame(); e.loadGame(loaded); assert.deepEqual(loaded.evening.samples, ['bridge']);
});
test('leaving the circle or mounting cancels incomplete recording; reload only restores finished sound cards', () => {
  const g = game(); g.evening.started = true; Object.assign(g.player, f.SOUND_SPOTS[0]); g.traffic = [];
  e.interact(g); advance(g, 2); e.saveGame(g); const loaded = e.createGame(); e.loadGame(loaded);
  assert.equal(loaded.evening.recording, null); assert.deepEqual(loaded.evening.samples, []);
  g.player.x += 6; e.step(g); assert.equal(g.evening.recording, null);
  Object.assign(g.player, f.SOUND_SPOTS[0]); e.interact(g); e.interact(g); assert.equal(g.evening.recording, null);
  e.interact(g); g.vehicle = 'bike-1'; f.stepEvening(g, 0.1); assert.equal(g.evening.recording, null);
});
test('any sampling order works; arrangements change the opening, the show only starts after collecting and choosing', () => {
  const g = game(); g.evening.started = true; g.traffic = []; g.vehicles = [];
  talk(g, 'nana'); assert.equal(g.dialogue.choices, undefined); close(g);
  for (const index of [2, 0, 1]) { Object.assign(g.player, f.SOUND_SPOTS[index], { speed: 0 }); e.interact(g); advance(g, 6.1); }
  assert.deepEqual(g.evening.samples, ['river', 'street', 'bridge']);
  talk(g, 'nagisa'); close(g); assert.equal(g.evening.arrangement, null);
  talk(g, 'nagisa'); e.chooseDialogue(g, 0); close(g); assert.equal(f.eveningFrame(g.evening).card, 'street');
  talk(g, 'nagisa'); e.chooseDialogue(g, 1); close(g); assert.equal(f.eveningFrame(g.evening).card, 'river');
  talk(g, 'nana'); close(g); assert.equal(g.evening.watching, false);
  talk(g, 'nana'); e.chooseDialogue(g, 0); assert.equal(g.evening.watching, true); assert.equal(g.dialogue, null);
});
test('screening can pause, leave, reload and resume; reward and completion save together and replays never repay', () => {
  const g = game(); g.evening = { ...f.createEvening(), started: true, samples: ['street', 'bridge', 'river'], arrangement: 'river' };
  talk(g, 'nana'); e.chooseDialogue(g, 0); const before = { ...g.player };
  advance(g, 4, { forward: 1, turn: 1, sprint: true, jump: true, brake: false }); assert.deepEqual(g.player, before);
  g.phase = 'paused'; advance(g, 5); assert.ok(g.evening.elapsed < 4.01); g.phase = 'playing';
  e.interact(g); assert.equal(g.evening.watching, false); assert.equal(g.money, 60);
  const reloaded = game(); e.loadGame(reloaded); assert.equal(reloaded.evening.watching, false); assert.ok(reloaded.evening.elapsed > 3.99);
  talk(reloaded, 'nana'); e.chooseDialogue(reloaded, 0); advance(reloaded, 25); assert.equal(reloaded.money, 88); assert.equal(reloaded.evening.completed, true);
  const receipt = JSON.parse(saved); assert.equal(receipt.money, 88); assert.equal(receipt.evening.completed, true);
  advance(reloaded, 10); assert.equal(reloaded.money, 88); e.interact(reloaded);
  talk(reloaded, 'nana'); e.chooseDialogue(reloaded, 0); advance(reloaded, 29); assert.equal(reloaded.money, 88);
  const final = game(); e.loadGame(final); assert.equal(final.evening.completed, true); assert.equal(final.money, 88);
});
test('save validation rejects invented samples, duplicates, non-finite clocks and impossible completions', () => {
  const cleaned = f.loadEvening({ started: true, samples: ['river', 'river', 'bogus'], arrangement: 'river', completed: true, elapsed: Infinity, watching: true, recording: { id: 'river', progress: 100 } });
  assert.deepEqual(cleaned.samples, ['river']); assert.equal(cleaned.arrangement, null); assert.equal(cleaned.completed, false); assert.equal(cleaned.elapsed, 0); assert.equal(cleaned.watching, false); assert.equal(cleaned.recording, null);
  const g = e.createGame(); saved = JSON.stringify({ version: 1, stage: 2, money: 36, evening: { started: true, samples: ['river'] } }); e.loadGame(g); assert.equal(g.evening.started, false);
});
test('neighbor deliveries remain payable during the second chapter and the show preserves their warmth', () => {
  const g = game(); g.evening.started = true; g.life.delivery = { id: 1, route: 0, elapsed: 5 };
  talk(g, 'uncle'); assert.equal(g.dialogue.effect.kind, 'delivery'); close(g);
  assert.equal(g.life.delivered, 1); assert.equal(g.money, 78);
  talk(g, 'uncle'); assert.ok(g.dialogue.lines[0].includes('锅盖')); close(g);
  g.life.delivery = { id: 2, route: 1, elapsed: 10 };
  Object.assign(g.evening, { samples: ['street', 'bridge', 'river'], arrangement: 'street' });
  talk(g, 'nana'); e.chooseDialogue(g, 0); advance(g, 10); assert.equal(g.life.delivery.elapsed, 10);
});
