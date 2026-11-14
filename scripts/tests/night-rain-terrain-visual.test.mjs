import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule as load } from './helpers/load-typescript-module.mjs';
const visual = await load('src/components/nightRain/terrainVisual.ts');
const world = await load('src/components/nightRain/world.ts');
const terrain = await load('src/components/nightRain/terrain.ts');
const { createEarthTexture } = await load('src/components/nightRain/earthTexture.ts');

test('rock weathering stays inside the physical wall and keeps exact rims and headroom boundaries', () => {
  let eroded = 0;
  for (const [a, b] of [
    [[-5, 6, -20], [5, 6, -20]], [[5, 6, -20], [5, 3, -10]],
    [[5, 3, -10], [-5, 3, -10]], [[-5, 3, -10], [-5, 6, -20]],
  ]) for (let u = 0; u <= 1; u += .125) for (let v = 0; v <= 1; v += .125) {
    const vertex = visual.cliffVertex(a, b, -3, -2, u, v);
    const [x, y, z] = vertex.point; const wallX = a[0] + (b[0] - a[0]) * u; const wallZ = a[2] + (b[2] - a[2]) * u;
    const inward = (x - wallX) * -(b[2] - a[2]) + (z - wallZ) * (b[0] - a[0]);
    assert.ok(inward >= -1e-10); assert.ok(vertex.inset <= .23);
    if (vertex.depth < 3) assert.ok(vertex.inset <= .08);
    if ([0, 1].includes(u) || [0, 1].includes(v)) assert.equal(vertex.inset, 0);
    assert.ok(y >= -3 && y <= 6); eroded += vertex.inset > .02 ? 1 : 0;
  }
  assert.ok(eroded > 50);
});

test('complete terrain geometry retains collider bounds, finite attributes and a bounded static mesh', () => {
  const geometry = visual.createTerrainGeometry(world.SURFACES);
  const position = geometry.getAttribute('position');
  assert.ok(position.count > 20000 && position.count < 800000, `vertices ${position.count}`);
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const attribute = geometry.getAttribute(name);
    assert.equal(attribute.count, position.count);
    assert.ok(attribute.array.every(Number.isFinite), name);
  }
  for (const surface of world.SURFACES.filter(s => s.id.startsWith('sunken'))) {
    assert.ok(terrain.foundationCells(surface, world.SURFACES).every(c => c.bottom <= surface.y || c.bottom <= surface.endY));
  }
  geometry.dispose();
});

test('shared mineral texture has opaque nonuniform pixels and is reusable without external assets', () => {
  const texture = createEarthTexture(); const { data, width, height } = texture.image;
  assert.equal(width, 512); assert.equal(height, 512);
  let low = 255; let high = 0;
  for (let i = 0; i < data.length; i += 4) { low = Math.min(low, data[i]); high = Math.max(high, data[i]); assert.equal(data[i + 3], 255); }
  assert.ok(high - low > 80); assert.ok(low > 30); texture.dispose();
});
