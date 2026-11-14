import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { constrainNightCamera, nightCameraBlocked, nightPlayerOpacity } = await loadTypescriptModule('src/components/nightRain/camera.ts');
const { followCameraBoom } = await loadTypescriptModule('src/components/gameCamera/boom.ts');
const target = { x: 3.2, y: 1.3, z: -5.5 };
const access = { shortcut: false, templeGate: false, harborGate: false };

test('Night Rain shares radial occlusion handling at a real house without switching sides', () => {
  assert.equal(nightCameraBlocked(target, access), false);
  let previous;
  for (const direction of [-1, 1]) for (let lap = 0; lap < 2; lap++) for (let i = 0; i <= 180; i++) {
    const yaw = direction * (lap * 2 * Math.PI + i * Math.PI / 90);
    const desired = { x: target.x + Math.sin(yaw) * 6.5, y: target.y + 2, z: target.z + Math.cos(yaw) * 6.5 };
    const allowed = constrainNightCamera(target, desired, access);
    const actual = followCameraBoom(target, allowed, previous, 1 / 60);
    previous = actual.distance;
    const dx = actual.x - target.x, dz = actual.z - target.z;
    assert.ok(Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) < 1e-8);
    assert.ok(dx * Math.sin(yaw) + dz * Math.cos(yaw) >= -1e-8);
    assert.equal(nightCameraBlocked(actual, access), false);
  }
  const wall = constrainNightCamera(target, { ...target, z: target.z - 6.5 }, access);
  assert.ok(Math.hypot(wall.x - target.x, wall.z - target.z) < 2);
});

test('camera stops inside deep foundations and leaves lower-route headroom clear', () => {
  assert.equal(nightCameraBlocked({ x: 0, y: -3, z: 0 }, access), true);
  assert.equal(nightCameraBlocked({ x: 7, y: -1.5, z: -20 }, access), false);
  const start = { x: 7, y: -1.5, z: -20 };
  const clipped = constrainNightCamera(start, { x: 7, y: -1.5, z: -3 }, access);
  assert.ok(clipped.z < -6, 'camera cannot travel through the courtyard foundation');
  assert.equal(nightCameraBlocked(clipped, access), false);
});

test('player fades continuously near the camera and returns fully opaque in open space', () => {
  const torso = { x: 2, y: 3.2, z: -6 };
  assert.equal(nightPlayerOpacity(torso, torso), 0);
  let previous = 0;
  for (let d = 0; d < 4; d += 0.01) {
    const opacity = nightPlayerOpacity({ ...torso, z: torso.z + d }, torso);
    assert.ok(opacity >= previous - 1e-10 && opacity - previous < 0.02);
    previous = opacity;
  }
  assert.equal(previous, 1);
});

test('camera fade owns material copies and restores shared skin/weapon originals', async () => {
  const THREE = await import('three');
  const { createPlayerCameraVisibility } = await loadTypescriptModule('src/components/nightRain/playerCameraVisibility.ts');
  const material = new THREE.MeshBasicMaterial({ opacity: 0.65, transparent: true });
  const geometry = new THREE.BoxGeometry();
  const actor = new THREE.Group(); const mesh = new THREE.Mesh(geometry, material); actor.add(mesh);
  const otherActor = new THREE.Mesh(geometry, material);
  const visibility = createPlayerCameraVisibility();
  visibility.apply(actor, 0.2);
  assert.notEqual(mesh.material, material);
  assert.equal(mesh.material.opacity, 0.13);
  assert.equal(otherActor.material.opacity, 0.65);
  const copy = mesh.material;
  visibility.apply(actor, 0.5);
  assert.equal(mesh.material, copy, 'no material allocation on subsequent close frames');
  assert.equal(mesh.material.opacity, 0.325);
  visibility.apply(actor, 1);
  assert.equal(mesh.material, material);
  assert.equal(material.depthWrite, true);
  visibility.restore(); geometry.dispose(); material.dispose();
});

test('close camera copies follow in-place skin and armor changes without allocating materials or recompiling stable fade shaders', async () => {
  const THREE = await import('three');
  const { createPlayerCameraVisibility } = await loadTypescriptModule('src/components/nightRain/playerCameraVisibility.ts');
  const material = new THREE.MeshStandardMaterial({ color: '#112233', roughness: 0.8 });
  const geometry = new THREE.BoxGeometry(); const mesh = new THREE.Mesh(geometry, material);
  const actor = new THREE.Group(); actor.add(mesh);
  const visibility = createPlayerCameraVisibility(); visibility.apply(actor, 0.3);
  const copy = mesh.material; const version = copy.version;
  material.color.set('#abcdef'); material.roughness = 0.25; material.opacity = 0.65;
  for (let frame = 0; frame < 30; frame += 1) visibility.apply(actor, 0.3);
  assert.equal(mesh.material, copy);
  assert.equal(copy.color.getHexString(), 'abcdef'); assert.equal(copy.roughness, 0.25);
  assert.equal(copy.opacity, 0.65 * 0.3); assert.equal(copy.transparent, true); assert.equal(copy.depthWrite, false);
  assert.equal(copy.version, version, 'ordinary uniform/opacity updates keep the existing fade shader');
  material.needsUpdate = true; visibility.apply(actor, 0.4);
  assert.equal(copy.version, version + 1, 'an explicit original shader update propagates once');
  visibility.apply(actor, 0.4); assert.equal(copy.version, version + 1);
  visibility.restore(); assert.equal(mesh.material, material); assert.equal(material.transparent, false);
  assert.equal(material.color.getHexString(), 'abcdef'); assert.equal(material.depthWrite, true);
  geometry.dispose(); material.dispose();
});

test('removing armor meshes or replacing their materials releases only the owned camera copies immediately', async () => {
  const THREE = await import('three');
  const { createPlayerCameraVisibility } = await loadTypescriptModule('src/components/nightRain/playerCameraVisibility.ts');
  const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  const geometry = new THREE.BoxGeometry(); const mesh = new THREE.Mesh(geometry, materials);
  const actor = new THREE.Group(); actor.add(mesh);
  const visibility = createPlayerCameraVisibility(); visibility.apply(actor, 0.3);
  const copies = mesh.material; let disposed = 0; let originalsDisposed = 0;
  copies.forEach(material => material.addEventListener('dispose', () => { disposed += 1; }));
  materials.forEach(material => material.addEventListener('dispose', () => { originalsDisposed += 1; }));
  actor.remove(mesh); visibility.apply(actor, 0.3);
  assert.equal(disposed, 2); assert.equal(mesh.material, materials); assert.equal(originalsDisposed, 0);
  visibility.apply(actor, 0.3); visibility.restore(); assert.equal(disposed, 2, 'removed copies are not retained or disposed twice');
  actor.add(mesh); visibility.apply(actor, 0.3);
  const previous = mesh.material; let replacedDisposed = 0;
  previous.forEach(material => material.addEventListener('dispose', () => { replacedDisposed += 1; }));
  const replacement = new THREE.MeshBasicMaterial({ color: '#abcdef' }); mesh.material = replacement;
  visibility.apply(actor, 0.3);
  assert.equal(replacedDisposed, 2); assert.notEqual(mesh.material, replacement);
  assert.equal(mesh.material.color.getHexString(), 'abcdef');
  visibility.restore(); assert.equal(mesh.material, replacement); assert.equal(originalsDisposed, 0);
  geometry.dispose(); materials.forEach(material => material.dispose()); replacement.dispose();
});
