import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { StreetControls } = await loadTypescriptModule('src/components/liuzhou/controls.ts');
function setup(t, request, sensitivity) {
  const saved = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  const document = new EventTarget();
  globalThis.document = document;
  globalThis.matchMedia = () => ({ matches: false });
  const requests = [];
  const root = { contains: () => true, focus() {}, requestPointerLock(options) { requests.push(options); return request?.(options); } };
  const rig = { yaw: 0, pitch: 0.12, dragged: 0 };
  let playing = true;
  const controls = new StreetControls({ root, rig, sensitivity, playing: () => playing, pause() { playing = false; }, clear() {}, changed() {} });
  document.exitPointerLock = () => { document.pointerLockElement = null; document.dispatchEvent(new Event('pointerlockchange')); };
  const lock = () => { document.pointerLockElement = root; document.dispatchEvent(new Event('pointerlockchange')); };
  const mouse = (x, y) => document.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: x, movementY: y }));
  t.after(() => {
    controls.dispose();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  return { controls, rig, mouse, lock, requests, pause: () => { playing = false; } };
}

test('mouse sensitivity changes immediately without recapturing and leaves touch unchanged', t => {
  let sensitivity = 0.6;
  const { controls, rig, mouse, lock } = setup(t, undefined, () => sensitivity);
  lock(); mouse(20, 10);
  assert.ok(Math.abs(rig.yaw + 0.036) < 1e-12);
  assert.ok(Math.abs(rig.pitch - 0.138) < 1e-12);
  sensitivity = 0.2; mouse(20, 10);
  assert.ok(Math.abs(rig.yaw + 0.048) < 1e-12);
  assert.ok(Math.abs(rig.pitch - 0.144) < 1e-12);
  controls.look(20, 10, false);
  assert.ok(Math.abs(rig.yaw + 0.108) < 1e-12);
  assert.ok(Math.abs(rig.pitch - 0.174) < 1e-12);
  mouse(1440, -900);
  assert.ok(Math.abs(rig.yaw + 0.108) < 1e-12);
  assert.equal(controls.locked, true);
});

test('locked relative input drops screen-sized spikes without accumulating a correction', t => {
  const { rig, lock, mouse } = setup(t);
  lock(); mouse(10, 3);
  const before = { ...rig };
  for (const [x, y] of [[1440, -900], [-1440, 900], [257, 0], [0, -257], [NaN, 0], [0, Infinity]]) mouse(x, y);
  assert.deepEqual(rig, before);
  mouse(-8, -2);
  assert.ok(Math.abs(rig.yaw - (-0.006)) < 1e-12);
  assert.ok(Math.abs(rig.pitch - 0.123) < 1e-12);
});

test('fast consecutive samples retain full turns and pitch limits', t => {
  const { rig, lock, mouse } = setup(t);
  lock();
  for (let i = 0; i < 100; i++) mouse(80, 0);
  assert.ok(Math.abs(rig.yaw + 24) < 1e-10);
  for (let i = 0; i < 100; i++) mouse(-80, 0);
  assert.ok(Math.abs(rig.yaw) < 1e-10);
  for (let i = 0; i < 10; i++) mouse(0, 80);
  assert.equal(rig.pitch, 0.95);
  for (let i = 0; i < 10; i++) mouse(0, -80);
  assert.equal(rig.pitch, -0.65);
});

test('recapture filters spikes while paused and Alt input never rotate the view', t => {
  const { controls, rig, lock, mouse, pause } = setup(t);
  mouse(20, 20); assert.equal(rig.yaw, 0);
  lock(); controls.altHeld = true; mouse(20, 20); assert.equal(rig.yaw, 0);
  controls.altHeld = false; controls.release(); mouse(20, 20); assert.equal(rig.yaw, 0);
  lock(); mouse(960, -600); assert.equal(rig.yaw, 0);
  mouse(20, 0); assert.equal(rig.yaw, -0.06);
  pause(); mouse(20, 0); assert.equal(rig.yaw, -0.06);
});

test('raw input requests fall back when unsupported', async t => {
  const { controls, requests } = setup(t, options => options ? Promise.reject(new DOMException('Raw input unavailable', 'NotSupportedError')) : Promise.resolve());
  controls.capture();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, [{ unadjustedMovement: true }, undefined]);
});

test('unsupported raw input does not recapture after Alt, pause or disposal', async t => {
  for (const stop of ['alt', 'pause', 'dispose']) await t.test(stop, async t => {
    let reject;
    const { controls, requests, pause } = setup(t, () => new Promise((resolve, rejectRequest) => { reject = rejectRequest; }));
    controls.capture();
    if (stop === 'alt') controls.altHeld = true;
    else if (stop === 'pause') pause();
    else controls.dispose();
    reject(new DOMException('Raw input unavailable', 'NotSupportedError'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1);
  });
});

test('synchronously unsupported raw input falls back; permission failure does not loop', async t => {
  for (const name of ['NotSupportedError', 'NotAllowedError']) await t.test(name, async t => {
    const { controls, requests } = setup(t, options => { if (options) throw new DOMException('Input unavailable', name); });
    controls.capture();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, name === 'NotSupportedError' ? 2 : 1);
    assert.equal(!!controls.message, name === 'NotAllowedError');
  });
});
