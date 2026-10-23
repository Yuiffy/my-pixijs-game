import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const framing = await loadTypescriptModule('src/components/liuzhou/conversationCamera.ts');
const sim = await loadTypescriptModule('src/components/liuzhou/simulation.ts');
const { terrainHeight } = await loadTypescriptModule('src/components/liuzhou/terrain.ts');
const grounded = (x, z) => ({ x, z, y: terrainHeight({ x, z }) });

function assertProjected(view, width, height, actors) {
  const c = new PerspectiveCamera(58, width / height, 0.1, 2300);
  const a = view.area;
  c.setViewOffset(width, height, width / 2 - a.x - a.width / 2, height / 2 - a.y - a.height / 2, width, height);
  c.position.set(view.position.x, view.position.y, view.position.z);
  c.lookAt(view.target.x, view.target.y, view.target.z); c.updateMatrixWorld();
  for (const actor of actors) for (const y of [0.03, 2.35]) {
    const p = new Vector3(actor.x, actor.y + y, actor.z).project(c);
    const x = ((p.x + 1) * width) / 2, screenY = ((1 - p.y) * height) / 2;
    assert.ok(x > a.x && x < a.x + a.width, `actor x ${x} outside ${JSON.stringify(a)}`);
    assert.ok(screenY > a.y && screenY < a.y + a.height, `actor y ${screenY} outside ${JSON.stringify(a)}`);
  }
}

test('both speakers fit above bottom dialogue or beside landscape dialogue at four approach angles', () => {
  for (const [w, h, panel] of [[1440, 900, { x: 340, y: 650 }], [390, 844, { x: 16, y: 460 }], [844, 390, { x: 470, y: 82 }]]) {
    const area = framing.conversationArea(w, h, { ...panel, width: 350, height: 260 });
    for (const angle of [0, 1.5, 3, 4.5]) {
      const p = grounded(1000 + Math.sin(angle) * 4, 1000 + Math.cos(angle) * 4);
      const n = grounded(1000, 1000);
      assertProjected(framing.conversationView(p, n, 0, area, h, []), w, h, [p, n]);
    }
  }
});

test('conversation chooses the clear side of a pair instead of entering a wall', () => {
  const p = grounded(998, 1000), n = grounded(1002, 1000);
  const wall = { id: 'test-wall', x: 1000, z: 1006, w: 16, d: 4, h: 8, angle: 0 };
  const area = framing.conversationArea(1440, 900, { x: 340, y: 650, width: 760, height: 220 });
  const view = framing.conversationView(p, n, 0, area, 900, [wall]);
  assert.ok(view.position.z < 1000, 'clear opposite side');
  assertProjected(view, 1440, 900, [p, n]);
});

test('NPC dialogue stops and faces the pair, freezes the world, and preserves speaker across choices', () => {
  const g = sim.createGame(); g.phase = 'playing'; g.stage = 2;
  const chef = g.npcs.find(n => n.id === 'chef');
  Object.assign(g.player, { x: chef.x + 2, z: chef.z, y: chef.y, speed: 5 }); chef.speed = 1;
  sim.interact(g);
  assert.equal(g.dialogue.speakerId, 'chef'); assert.equal(g.player.speed, 0); assert.equal(chef.speed, 0);
  assert.ok(Math.abs(g.player.angle + Math.PI / 2) < 0.001);
  assert.ok(Math.abs(chef.angle - Math.PI / 2) < 0.001);
  const before = JSON.stringify(g);
  sim.step(g, { forward: 1, turn: 1, sprint: true, jump: true, brake: false }, 1);
  assert.equal(JSON.stringify(g), before);
  g.dialogue.index = g.dialogue.lines.length - 1;
  sim.chooseDialogue(g, 0);
  assert.equal(g.dialogue.speakerId, 'chef'); assert.ok(g.life.delivery);
});

test('recording narration does not aim at a distant portrait character', () => {
  const g = sim.createGame(); g.phase = 'playing'; g.stage = 4;
  Object.assign(g.player, sim.QUESTS[4], { y: 0 });
  sim.interact(g);
  assert.ok(g.dialogue); assert.equal(g.dialogue.speakerId, undefined);
});
