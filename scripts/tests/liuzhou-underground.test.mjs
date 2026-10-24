import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const sim = require('../../src/components/liuzhou/simulation.ts');
const underground = require('../../src/components/liuzhou/underground.ts');
const { terrainHeight } = require('../../src/components/liuzhou/terrain.ts');
const camera = require('../../src/components/liuzhou/camera.ts');
const world = require('../../src/components/liuzhou/world.ts');
const THREE = require('three');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];
const idle = { forward: 0, turn: 0, jump: false, brake: false, sprint: false };

test('west branch retaining wall meets the ceiling across terrain grade breaks', () => {
  const data = underground.undergroundSurface(rings => THREE.ShapeUtils.triangulateShape(rings[0].map(p => new THREE.Vector2(...p)), rings.slice(1).map(r => r.map(p => new THREE.Vector2(...p)))));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
  // This 12.7m boundary crossed x=-760 without a vertex. The wall's old
  // straight top fell 22cm below the separately segmented ceiling here.
  const a = [-765.6439764278592, -509.50872389100414];
  const b = [-755.1025195664906, -516.5719219329997];
  const normal = new THREE.Vector3(b[1] - a[1], 0, a[0] - b[0]).normalize();
  try {
    for (const t of [0.25, 0.45, 0.55, 0.7, 0.85]) {
      const p = { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
      for (const side of [-1, 1]) {
        const from = new THREE.Vector3(p.x, underground.undergroundLevel(p) + underground.UNDERGROUND_CLEARANCE - 0.025, p.z).addScaledVector(normal, side * 0.12);
        const hits = new THREE.Raycaster(from, normal.clone().multiplyScalar(-side), 0, 0.24).intersectObject(mesh);
        assert.ok(hits.some(hit => data.kinds[hit.face.a] === 2), `ceiling-wall gap at ${JSON.stringify({ p, side })}`);
      }
    }
  } finally { geometry.dispose(); material.dispose(); }
});

test('underground entrance openings retain adjacent side walls and block the previously visible sky rays', () => {
  const data = underground.undergroundSurface(rings => THREE.ShapeUtils.triangulateShape(rings[0].map(p => new THREE.Vector2(...p)), rings.slice(1).map(r => r.map(p => new THREE.Vector2(...p)))));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
  try {
    // Reproduce the blue wedges beside source entry 1275168879. The old
    // midpoint-radius opening test omitted an adjacent 9.14m side wall.
    const from = new THREE.Vector3(-588.4755009310182, 3.1399642425907874, -269.9459013571089);
    for (const point of [[-592.94274, 0.47249, -262.62930], [-593.04114, 0.61676, -260.49529]]) {
      const direction = new THREE.Vector3(...point).sub(from).normalize();
      const hits = new THREE.Raycaster(from, direction, 0, 15).intersectObject(mesh);
      assert.ok(hits.length, 'the view must terminate at the stair side wall');
      assert.equal(data.kinds[hits[0].face.a], 2);
    }
  } finally { geometry.dispose(); material.dispose(); }
});

test('west entrance treads fill the terrain opening up to both retaining walls', () => {
  // Actual camera and four pixels that showed sky at exit 1275168886.
  const camera = new THREE.PerspectiveCamera(58, 1440 / 900, 0.15, 18000);
  camera.position.set(-781.2094973394408, 20.37869624080909, -539.9952908566548);
  const yaw = 1.5881491292710925; const pitch = 0.2;
  camera.lookAt(camera.position.x + Math.sin(yaw), camera.position.y - Math.sin(pitch) - 1 / 8, camera.position.z + Math.cos(yaw)); camera.updateMatrixWorld();
  const material = new THREE.MeshBasicMaterial();
  const meshes = underground.UNDERGROUND_STEPS.map(b => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...b.size), material); mesh.position.set(...b.at); mesh.rotation.y = b.angle; mesh.updateMatrixWorld(); return mesh;
  });
  try {
    for (const [x, y] of [[485, 730], [500, 727], [950, 730], [960, 735]]) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / 1440 * 2 - 1, 1 - y / 900 * 2), camera);
      assert.ok(ray.intersectObjects(meshes).length, `unsealed stair edge at pixel ${x},${y}`);
    }
  } finally { meshes.forEach(mesh => mesh.geometry.dispose()); material.dispose(); }
});

test('the first stair turn is a level landing with a consistent visible surface', () => {
  const e = underground.UNDERGROUND_ENTRANCES.find(entry => entry.id === '1275168873');
  const a = e.points[0]; const turn = e.points[1]; const length = Math.hypot(turn[0] - a[0], turn[1] - a[1]);
  const material = new THREE.MeshBasicMaterial();
  const meshes = underground.UNDERGROUND_STEPS.map((box, index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...box.size), material);
    mesh.position.set(...box.at); mesh.rotation.y = box.angle; mesh.userData.index = index; mesh.updateMatrixWorld(); return mesh;
  });
  const colors = new Set(); const heights = [];
  try {
    for (const distance of [0.2, 0.6, 1, 1.4, 1.8]) {
      const p = { x: turn[0] - (turn[0] - a[0]) / length * distance, z: turn[1] - (turn[1] - a[1]) / length * distance };
      const from = new THREE.Vector3(p.x, terrainHeight({ x: e.top[0], z: e.top[1] }) + 1, p.z);
      const hits = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0), 0, 15).intersectObjects(meshes);
      assert.ok(hits.length, 'landing has a hole');
      heights.push(hits[0].point.y);
      for (const hit of hits.filter(hit => Math.abs(hit.point.y - hits[0].point.y) < 1e-6)) colors.add(underground.UNDERGROUND_STEPS[hit.object.userData.index].color);
    }
    assert.ok(Math.max(...heights) - Math.min(...heights) < 1e-6, `uneven landing: ${heights}`);
    assert.equal(colors.size, 1, 'coplanar landing faces alternate colors and flicker');
  } finally { meshes.forEach(mesh => mesh.geometry.dispose()); material.dispose(); }
});

function walk(g, p, target, tolerance = 0.35) {
  const frames = Math.ceil(Math.hypot(target[0] - g.player.x, target[1] - g.player.z) / 4.4 * 60) + 500;
  for (let i = 0; i < frames; i++) {
    const distance = Math.hypot(target[0] - g.player.x, target[1] - g.player.z);
    if (distance < tolerance) return;
    const yaw = Math.atan2(target[0] - g.player.x, target[1] - g.player.z);
    sim.step(g, { ...idle, forward: 1 }, 1 / 60, p, yaw);
  }
  assert.fail(JSON.stringify({ target, player: g.player, underground: underground.undergroundLocation(g.player) }));
}

test('underground keeps source branches and all sixteen stair axes; paving leaves the entrances open', () => {
  assert.deepEqual(fs.readFileSync('src/components/liuzhou/underground-layout.json'), fs.readFileSync('public/games/liuzhou/underground-layout.json'));
  assert.equal(underground.UNDERGROUND_ENTRANCES.length, 16);
  assert.equal(underground.UNDERGROUND_WALKS.length, 11);
  for (const e of underground.UNDERGROUND_ENTRANCES) {
    const a = e.points[0]; const b = e.points[1]; const p = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 };
    assert.ok(underground.undergroundOpening(p), e.id);
    const pieces = underground.pavingWithoutEntrances([{ x: p.x - 0.2, z: p.z - 0.2 }, { x: p.x + 0.2, z: p.z - 0.2 }, { x: p.x, z: p.z + 0.2 }]);
    assert.equal(pieces.length, 0, `covered stair ${e.id}`);
  }
});

test('Rapier walks down and up every mapped stair without being lifted through the ground', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true;
  const p = await sim.createPhysics(g);
  try {
    for (const e of underground.UNDERGROUND_ENTRANCES) {
      const a = e.points[0]; const b = e.points[1]; const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const start = { x: a[0] - Math.sin(angle) * 2, z: a[1] - Math.cos(angle) * 2 };
      Object.assign(g.player, { ...start, y: terrainHeight(start), angle, speed: 0 }); p.velocityY = 0; p.reset();
      for (const point of e.points) walk(g, p, point);
      for (let i = 0; i < 45; i++) sim.step(g, idle, 1 / 60, p);
      assert.ok(Math.abs(g.player.y - underground.undergroundLevel(g.player)) < 0.3, JSON.stringify({ entry: e.id, player: g.player }));
      for (const point of e.points.slice().reverse()) walk(g, p, point);
      walk(g, p, [start.x, start.z]);
      assert.ok(Math.abs(g.player.y - terrainHeight(g.player)) < 0.3, JSON.stringify({ entry: e.id, player: g.player }));
    }
  } finally { p.dispose(); }
});

test('underground main route, horizontal branch, roof, walls, camera and saves share the lower layer', async () => {
  const g = sim.createGame(); g.phase = 'playing'; g.exploration = true;
  Object.assign(g.player, { x: -595, z: -118, y: underground.undergroundLevel({ x: -595, z: -118 }), angle: Math.PI });
  const p = await sim.createPhysics(g);
  try {
    for (const target of [[-587.858, -264.352], [-579.153, -442.697], [-574.689, -531.085], [-731.37, -531.931]]) walk(g, p, target, 0.7);
    assert.equal(underground.undergroundLocation(g.player), 'concourse');
    assert.ok(g.player.y < terrainHeight(g.player) - 5.5);
    const target = { ...g.player, y: g.player.y + 1.4 };
    const view = camera.resolveCamera(target, Math.PI / 2, 0.1, 12);
    assert.ok(Math.hypot(view.x - target.x, view.z - target.z) > 2, JSON.stringify(view));
    assert.ok(underground.undergroundFree(view));
    assert.equal(sim.toggleFlight(g), true);
    for (let i = 0; i < 100; i++) sim.step(g, { ...idle, jump: true }, 1 / 60, p);
    assert.ok(g.player.y < underground.undergroundLevel(g.player) + 3, JSON.stringify(g.player));
    g.flight.active = false; p.velocityY = 0;
    for (let i = 0; i < 120; i++) sim.step(g, idle, 1 / 60, p);
    const savedStorage = globalThis.localStorage;
    let saved;
    globalThis.localStorage = { getItem: () => saved, setItem: (_, v) => { saved = v; } };
    try {
      sim.saveGame(g); const loaded = sim.createGame(); sim.loadGame(loaded);
      assert.ok(world.distance(loaded.player, g.player) < 0.01);
      assert.ok(Math.abs(loaded.player.y - g.player.y) < 0.01);
      assert.equal(underground.undergroundLocation(loaded.player), 'concourse');
    } finally { globalThis.localStorage = savedStorage; }
    Object.assign(g.player, { x: -592.2, z: -170, y: underground.undergroundLevel({ x: -592.2, z: -170 }), speed: 0, angle: Math.PI / 2 }); p.reset();
    for (let i = 0; i < 200; i++) sim.step(g, { ...idle, forward: 1 }, 1 / 60, p, Math.PI / 2);
    assert.ok(g.player.y < terrainHeight(g.player) - 5.5, JSON.stringify(g.player));
    assert.ok(g.player.x < -581, JSON.stringify(g.player));
    // A separate surface character directly above the concourse stays outside.
    Object.assign(g.player, { x: -595, z: -118, y: terrainHeight({ x: -595, z: -118 }), speed: 0 }); p.reset();
    for (let i = 0; i < 90; i++) sim.step(g, idle, 1 / 60, p);
    assert.ok(Math.abs(g.player.y - terrainHeight(g.player)) < 0.1);
  } finally { p.dispose(); }
});
