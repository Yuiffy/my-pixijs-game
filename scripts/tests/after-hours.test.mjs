import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { createPilot } from './helpers/after-hours-pilot.mjs';

const engine = await loadTypescriptModule('src/components/afterHours/engine.ts');
const world = await loadTypescriptModule('src/components/afterHours/world.ts');
const fresh = () => { const g = engine.createGame(); return { g, pilot: createPilot(engine, world, g) }; };

test('title, pause, panels and invalid time never move the player or advance a chase', () => {
  const { g } = fresh(); const before = engine.saveGame(g);
  engine.stepGame(g, 1000, { forward: 1, right: 1, run: true }); assert.equal(engine.saveGame(g), before);
  engine.startGame(g); engine.pause(g, true); const paused = engine.saveGame(g);
  engine.stepGame(g, 1000); engine.look(g, 1, 1); assert.equal(engine.saveGame(g), paused);
  engine.pause(g, false); g.panel = 'journal'; const reading = engine.saveGame(g); engine.stepGame(g, 1000); assert.equal(engine.saveGame(g), reading);
  g.panel = 'none'; const time = g.time; engine.stepGame(g, NaN); engine.stepGame(g, -1); assert.equal(g.time, time);
  engine.stepGame(g, 999999); assert.ok(Math.abs(g.time - time - 5) < .00001);
});

for (const ending of ['name', 'stay']) test(`normal movement, clues and puzzles complete the warm evening and every horror chapter: ${ending}`, () => {
  const { g, pilot } = fresh(); pilot.toChoice();
  assert.equal(g.stage, 'choice'); assert.equal(g.panel, 'choice'); assert.equal(g.tapes.length, 3); assert.equal(g.seals, 3); assert.equal(g.sources.length, 3); assert.equal(g.deaths, 0);
  engine.chooseEnding(g, ending);
  if (ending === 'name') { assert.equal(g.stage, 'dawn'); pilot.interact('entry'); }
  assert.equal(g.mode, 'ending'); assert.equal(g.ending, ending === 'name' ? 'dawn' : 'loop');
});

test('facing, walls and distance prevent interacting through partitions', () => {
  const { g, pilot } = fresh(); pilot.toHome(); pilot.interact('sui'); engine.chooseDialogue(g, 'tomorrow');
  const original = g.stage; engine.interact(g); assert.equal(g.stage, original);
  pilot.reach('computer'); pilot.turn(g.player.yaw + Math.PI); engine.interact(g); assert.equal(g.stage, original);
  pilot.turn(g.player.yaw + Math.PI); engine.interact(g); assert.equal(g.stage, 'unease');
  pilot.walk({ x: .4, z: -2.5 }); assert.equal(world.focusedSpot(g), null);
});

test('the wrong fuse order resets only the puzzle and the correct order restores power', () => {
  const { g, pilot } = fresh(); pilot.toPower(); pilot.interact('fuse');
  engine.fuseSwitch(g, 0); assert.deepEqual(g.fuse, []); assert.equal(g.mistakes, 1);
  engine.fuseSwitch(g, 1); engine.fuseSwitch(g, 2); assert.deepEqual(g.fuse, []); assert.equal(g.stage, 'power');
  for (const i of [1, 0, 2]) engine.fuseSwitch(g, i);
  assert.equal(g.stage, 'memories'); assert.equal(g.panel, 'none');
});

test('password requires all three recordings; wrong digits do not open the hall', () => {
  const { g, pilot } = fresh(); pilot.toPower(); pilot.interact('fuse');
  [1, 0, 2].forEach(i => engine.fuseSwitch(g, i)); pilot.interact('computer'); assert.equal(g.panel, 'none');
  for (const id of ['tape-shelf', 'tape-bedroom', 'tape-kitchen']) pilot.interact(id);
  pilot.interact('computer'); engine.submitCode(g, '0000'); assert.equal(g.stage, 'memories');
  engine.submitCode(g, '0017'); assert.equal(g.stage, 'corridor'); assert.equal(world.corridorOpen(g), true);
});

test('wrong memory door repeats the hallway without awarding a seal', () => {
  const { g, pilot } = fresh(); pilot.toPower(); pilot.interact('fuse'); [1, 0, 2].forEach(i => engine.fuseSwitch(g, i));
  for (const id of ['tape-shelf', 'tape-bedroom', 'tape-kitchen']) pilot.interact(id);
  pilot.interact('computer'); engine.submitCode(g, '0017'); pilot.interact('portrait');
  assert.equal(g.seals, 0); assert.equal(g.mistakes, 1); assert.equal(g.player.z, 6.8); assert.equal(g.stage, 'corridor');
  for (const id of ['clock', 'portrait', 'radio']) pilot.interact(id);
  assert.equal(g.stage, 'chase');
});

test('echo traverses the real corridor and catches an idle player; retry keeps disabled sources', () => {
  const { g, pilot } = fresh(); pilot.toChase(); pilot.interact('fuse', true);
  for (let i = 0; i < 200 && g.mode === 'playing'; i++) engine.stepGame(g, 1000);
  assert.equal(g.mode, 'dead'); assert.equal(g.deaths, 1);
  engine.retry(g); assert.equal(g.mode, 'playing'); assert.deepEqual(g.sources, ['fuse']); assert.ok(world.walkable(g.player, g)); assert.equal(g.player.stamina, 100);
});

test('hiding drops pursuit and recovers stamina; interaction exits the wardrobe', () => {
  const { g, pilot } = fresh(); pilot.toChase(); pilot.interact('hide', true); assert.equal(g.hidden, true);
  const position = { x: g.player.x, z: g.player.z };
  for (let i = 0; i < 30; i++) engine.stepGame(g, 1000, { forward: 1, right: 1, run: true });
  assert.equal(g.mode, 'playing'); assert.deepEqual({ x: g.player.x, z: g.player.z }, position); assert.equal(g.player.stamina, 100);
  engine.interact(g); assert.equal(g.hidden, false);
});

test('save roundtrip restores every chapter and rejects invalid positions/data', () => {
  const { g, pilot } = fresh(); pilot.toChoice();
  const loaded = engine.loadGame(engine.saveGame(g)); assert.ok(loaded); assert.equal(loaded.mode, 'title');
  assert.equal(loaded.stage, g.stage); assert.deepEqual(loaded.notes, g.notes); assert.deepEqual(loaded.sources, g.sources);
  assert.equal(engine.loadGame('{bad'), null); assert.equal(engine.loadGame('null'), null);
  const value = JSON.parse(engine.saveGame(g)); value.player.x = 900; assert.equal(engine.loadGame(JSON.stringify(value)), null);
  value.player.x = 4.5; value.player.z = -3.55; assert.equal(engine.loadGame(JSON.stringify(value)), null);
});

test('shipped models contain geometry, packed textures and articulated character pivots', async () => {
  for (const name of ['apartment', 'sui']) {
    const buffer = await readFile(`public/games/after-hours/${name}.glb`);
    assert.equal(buffer.readUInt32LE(0), 0x46546c67); assert.equal(buffer.readUInt32LE(4), 2);
    const doc = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
    assert.ok(doc.meshes.length > 0); assert.ok(doc.images.length > 0);
    assert.ok(doc.images.every(image => image.bufferView !== undefined), 'textures ship inside GLB');
    assert.ok(!JSON.stringify(doc).includes('https://'), 'no external asset fetch');
    if (name === 'sui') {
      for (const pivot of ['Sui_Head', 'Sui_Body', 'Sui_LeftArm', 'Sui_RightArm', 'Sui_LeftForearm', 'Sui_RightForearm', 'Sui_LeftEye', 'Sui_RightEye', 'Sui_LeftLeg', 'Sui_RightLeg']) assert.ok(doc.nodes.some(node => node.name === pivot), pivot);
      const mouth = doc.meshes.find(mesh => mesh.extras?.targetNames?.includes('Smile'));
      assert.ok(mouth, 'optimized export retains the real mouth morph targets');
      assert.deepEqual(mouth.extras.targetNames, ['Smile', 'Talk', 'Worry']);
      assert.equal(mouth.primitives[0].targets.length, 3);
      assert.equal(doc.nodes.find(node => node.name === 'Sui_Root').extras.character_revision, 2);
    }
  }
});

test('tea has a real ingredient order and either blend remains personal after reload', () => {
  for (const blend of ['honey', 'lemon']) {
    const {g, pilot} = fresh(); engine.startGame(g); pilot.interact('sui');
    engine.chooseDialogue(g, 'help'); pilot.settle(); pilot.interact('kettle');
    engine.makeTea(g, 'water'); engine.makeTea(g, 'honey'); assert.equal(g.evening.tea, 0);
    engine.makeTea(g, 'bag'); engine.makeTea(g, 'bag'); assert.equal(g.evening.tea, 1);
    engine.makeTea(g, 'water'); engine.makeTea(g, blend);
    const loaded = engine.loadGame(engine.saveGame(g)); assert.ok(loaded);
    assert.equal(loaded.evening.blend, blend); assert.equal(loaded.evening.carrying, true);
    engine.startGame(loaded); const resumed = createPilot(engine, world, loaded); resumed.settle(); resumed.interact('sui'); engine.chooseDialogue(loaded, 'tease');
    assert.equal(loaded.stage, 'photo'); assert.equal(loaded.evening.served, true);
    assert.ok(loaded.subtitle.text.includes(blend === 'lemon' ? '柠檬' : '蜂蜜'));
  }
});

test('the room only fails after a photograph, a promise, inspection and Sui’s answer', () => {
  const {g, pilot} = fresh(); pilot.toHome('lemon');
  const image = g.photoImage; pilot.interact('computer'); assert.equal(g.stage, 'home');
  pilot.interact('sui'); engine.chooseDialogue(g, 'extra'); pilot.interact('computer');
  assert.equal(g.stage, 'unease'); assert.ok(g.subtitle.text.includes('永远'));
  pilot.interact('computer'); assert.equal(g.stage, 'unease');
  pilot.interact('photo-frame'); assert.equal(g.evening.anomaly, 1);
  assert.equal(g.panel, 'photograph'); g.panel = 'none';
  pilot.interact('computer'); assert.equal(g.stage, 'unease');
  pilot.interact('sui'); engine.chooseDialogue(g, 'name'); pilot.interact('computer');
  assert.equal(g.stage, 'power'); assert.equal(g.photoImage, image);
});

test('a photo cannot advance the chapter without the camera and survives the save roundtrip', () => {
  const {g, pilot} = fresh(); engine.finishPhoto(g, 'data:image/jpeg;base64,fake'); assert.equal(g.stage, 'visit');
  pilot.toHome(); const restored = engine.loadGame(engine.saveGame(g));
  assert.ok(restored); assert.equal(restored.photoImage, g.photoImage); assert.equal(restored.photoRequest, 0);
  assert.equal(restored.evening.photo, true); assert.equal(restored.evening.dialogue, null);
  const broken = JSON.parse(engine.saveGame(g)); broken.evening.served = false;
  assert.equal(engine.loadGame(JSON.stringify(broken)), null);
});

test('legacy saves restart the old intro and preserve later horror progress', () => {
  const {g, pilot} = fresh(); pilot.toHome();
  const old = JSON.parse(engine.saveGame(g)); old.version = 1; delete old.evening; delete old.photoImage;
  const intro = engine.loadGame(JSON.stringify(old)); assert.ok(intro); assert.equal(intro.stage, 'visit'); assert.equal(intro.evening.greeted, false);
  pilot.interact('sui'); engine.chooseDialogue(g, 'tomorrow'); pilot.interact('computer'); pilot.interact('photo-frame'); g.panel = 'none'; pilot.interact('sui'); engine.chooseDialogue(g, 'voice'); pilot.interact('computer');
  const later = JSON.parse(engine.saveGame(g)); later.version = 1; delete later.evening; delete later.photoImage;
  const migrated = engine.loadGame(JSON.stringify(later)); assert.ok(migrated); assert.equal(migrated.stage, 'power');
  assert.equal(migrated.evening.promise, 'tomorrow'); assert.equal(migrated.photoImage, '');
});
