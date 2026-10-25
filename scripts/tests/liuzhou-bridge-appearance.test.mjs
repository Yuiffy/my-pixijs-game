import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const old = require.extensions['.ts'];
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const appearance = require('../../src/components/liuzhou/bridgeAppearance.ts');
const bridge = require('../../src/components/liuzhou/guangya.ts');
const { buildSkylineGeometry } = require('../../src/components/liuzhou/skylineGeometry.ts');
const T = require('three');
if (old) require.extensions['.ts'] = old; else delete require.extensions['.ts'];

test('Guangya has white independent arch planes, two 210m main spans and 63m side shoulders', () => {
  assert.deepEqual(appearance.GUANGYA_APPEARANCE.spans, [63, 210, 210, 63]);
  assert.deepEqual(appearance.GUANGYA_PIER_FRACTIONS, [63 / 546, 273 / 546, 483 / 546]);
  const parts = appearance.buildGuangyaAppearance(bridge.GUANGYA_ARCH_OFFSET);
  const paint = new T.Color(appearance.GUANGYA_APPEARANCE.paint);
  assert.ok(Math.min(paint.r, paint.g, paint.b) > .8 && Math.max(paint.r, paint.g, paint.b) - Math.min(paint.r, paint.g, paint.b) < .06);
  assert.equal(parts.filter(p => p.kind === 'arch').length, 160);
  assert.equal(parts.filter(p => p.kind === 'backstay').length, 4);
  const limit = bridge.GUANGYA_WIDTH / 2 - bridge.GUANGYA_SIDEWALK_WIDTH;
  for (const part of parts) {
    assert.equal(part.a.side, part.b.side, 'no invented overhead cross brace');
    assert.ok(Math.abs(part.a.side) + part.width / 2 < limit, 'arch/hanger footprint clears sidewalk');
    assert.ok([part.a.t, part.a.h, part.a.side, part.b.t, part.b.h, part.b.side, part.width, part.depth].every(Number.isFinite));
    if (part.kind === 'arch') assert.equal(part.color, appearance.GUANGYA_APPEARANCE.paint);
    if (part.kind === 'hanger') { assert.equal(part.a.t, part.b.t); assert.ok(part.b.h > part.a.h); }
  }
  for (const side of [-bridge.GUANGYA_ARCH_OFFSET, bridge.GUANGYA_ARCH_OFFSET]) {
    const arches = parts.filter(p => p.kind === 'arch' && p.a.side === side);
    assert.equal(arches[0].a.t, 63 / 546); assert.equal(arches.at(-1).b.t, 483 / 546);
    for (let i = 1; i < arches.length; i++) assert.ok(Math.hypot(arches[i].a.t - arches[i - 1].b.t, arches[i].a.h - arches[i - 1].b.h) < 1e-10);
    assert.equal(arches.filter(p => p.a.h === appearance.GUANGYA_APPEARANCE.estimatedRiseAboveDeck).length, 2);
  }
});

test('streamed skyline actually contains bright Guangya arch geometry above the unchanged deck', () => {
  const data = buildSkylineGeometry([], { minX: -660, maxX: 700, minZ: -560, maxZ: 1200 });
  const matrix = new T.Matrix4(); const at = new T.Vector3(); const q = new T.Quaternion(); const scale = new T.Vector3();
  const white = new T.Color(appearance.GUANGYA_APPEARANCE.paint);
  let brightArches = 0;
  for (let i = 0; i < data.matrices.length / 16; i++) {
    matrix.fromArray(data.matrices, i * 16).decompose(at, q, scale);
    if (at.x < bridge.GUANGYA_MAIN.a.x || at.x > bridge.GUANGYA_MAIN.b.x || Math.abs(at.z + 1256) > 35 || at.y < bridge.GUANGYA_HEIGHT + 2) continue;
    const c = new T.Color().fromArray(data.colors, i * 3);
    if (Math.abs(c.r - white.r) < 1e-6 && Math.abs(c.g - white.g) < 1e-6 && Math.abs(c.b - white.b) < 1e-6) brightArches++;
  }
  assert.ok(brightArches > 100, `only ${brightArches} white above-deck segments`);
});
