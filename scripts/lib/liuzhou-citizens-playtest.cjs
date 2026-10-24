const { quietContext } = require('./liuzhou-test-browser.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { travel, model } = require('./liuzhou-pilot.cjs');
const { mouseLook } = require('./liuzhou-mouse.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function close(p) { for (let i = 0; (await state(p)).dialogue && i < 10; i++) await p.keyboard.press('KeyE'); }
async function look(p, target) {
  const s = await state(p), wanted = Math.atan2(target.x - s.player.x, target.z - s.player.z);
  for (let attempt = 0; attempt < 12; attempt++) {
    const yaw = await p.evaluate(() => window.liuzhouTest.rig.yaw);
    const delta = -Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw)) / 0.003;
    if (Math.abs(delta) <= 1) break;
    const dx = Math.max(-450, Math.min(450, delta));
    // Relative mouse events stay inside the test document's virtual capture.
    await mouseLook(p, dx);
    await p.waitForTimeout(40);
  }
  await p.evaluate(() => document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -800, bubbles: true, cancelable: true })));
  await p.waitForTimeout(600);
}
async function runCitizens({ page: p, browser, capture, report }) {
  console.log('Citizens: ordinary-input visits, daily activities, saved walks and touch map');
  const { loadTypescriptModule } = await import(pathToFileURL(path.join(process.cwd(), 'scripts/tests/helpers/load-typescript-module.mjs')));
  const c = await loadTypescriptModule('src/components/liuzhou/citizens.ts'), w = await model();
  await p.evaluate(() => window.liuzhouTest.manual(true));
  assert.equal((await state(p)).npcs.filter(n => n.routine).length, 5);
  await p.keyboard.press('KeyM'); await capture(p, 'citizens-01-live-map'); await p.keyboard.press('Escape');
  let index = 2;
  for (const id of ['uncle', 'walker-1', 'walker-2', 'walker-3', 'walker-4']) {
    const plan = c.CITIZEN_PLANS[id], wanted = id === 'walker-3' ? 'photo' : id === 'walker-4' ? 'shop' : 'stretch';
    const stop = plan.stops.find(s => s.action === wanted);
    let observer;
    for (const radius of [7, 9, 11, 13]) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const candidate = { x: stop.x + Math.sin(a) * radius, z: stop.z + Math.cos(a) * radius };
        if (!c.citizenClear(candidate, 0.9)) continue;
        let visible = true;
        for (let d = 0; d < radius + 6; d += 0.3) {
          if (!c.citizenClear({ x: stop.x + Math.sin(a) * d, z: stop.z + Math.cos(a) * d }, 2.3)) { visible = false; break; }
        }
        if (!visible) continue;
        if (plan.stops.some((s, i) => w.distance(candidate, w.closestOnSegment(candidate, s, plan.stops[(i + 1) % plan.stops.length])) < 5.5)) continue;
        if ((await state(p)).vehicles.some(v => w.distance(v, candidate) < 4)) continue;
        observer = candidate; break;
      }
      if (observer) break;
    }
    assert.ok(observer, `observer ground ${id}`);
    await travel(p, observer, { tolerance: 0.5 });
    let n;
    for (let i = 0; i < 700; i++) {
      n = (await state(p)).npcs.find(n => n.id === id);
      if (n.routine.action === wanted && n.routine.remaining > 1 && !n.routine.waiting && w.distance(n, observer) < 18) break;
      await p.evaluate(() => window.advanceTime(1000));
    }
    assert.equal(n.routine.action, wanted, `${id}: ${JSON.stringify(n)}`); assert.ok(n.routine.remaining > 1, `${id} must stop`); assert.equal(n.routine.waiting, null);
    await look(p, n); await capture(p, `citizens-${String(index++).padStart(2, '0')}-${id}-${wanted}`);
    const pose = structuredClone(n); await p.keyboard.press('Escape'); const paused = await state(p);
    await p.evaluate(() => window.advanceTime(2500)); assert.deepEqual(await state(p), paused); await p.keyboard.press('Escape');
    // Catch the citizen through ordinary walking, then E; approach makes them stop and face us.
    for (let attempt = 0; attempt < 8; attempt++) {
      n = (await state(p)).npcs.find(n => n.id === id);
      await travel(p, n, { tolerance: 1.1 });
      if ((await state(p)).interaction?.id === id) break;
    }
    assert.equal((await state(p)).interaction.id, id);
    await p.keyboard.press('KeyE'); assert.equal((await state(p)).dialogue.name, n.name);
    const dialogue = await state(p); await p.evaluate(() => window.advanceTime(2500)); assert.deepEqual(await state(p), dialogue);
    if (id === 'walker-3' || id === 'walker-4') await capture(p, `citizens-${String(index++).padStart(2, '0')}-${id}-conversation`);
    await close(p);
    report.checks.push(`${id}: reached scheduled ${wanted} without editing citizen/player state; visible prop/pose; ordinary E conversation; pause/dialogue frozen; walked ${pose.routine.odometer.toFixed(1)}m`);
  }
  const before = (await state(p)).npcs.filter(n => n.routine).map(n => ({ id: n.id, x: n.x, z: n.z, routine: n.routine }));
  const enter = /(继续这趟旅行|走进柳州) ↗/;
  await p.reload(); await p.getByRole('button', { name: enter }).waitFor({ timeout: 90000 });
  await p.evaluate(() => window.liuzhouTest.manual(true)); await p.getByRole('button', { name: enter }).click();
  const after = await state(p);
  for (const n of before) {
    const saved = after.npcs.find(v => v.id === n.id);
    assert.equal(saved.x, n.x, `${n.id} x restored`); assert.equal(saved.z, n.z, `${n.id} z restored`);
    assert.equal(saved.routine.remaining, n.routine.remaining); assert.equal(saved.routine.odometer, n.routine.odometer);
  }
  await capture(p, `citizens-${String(index++).padStart(2, '0')}-saved-street`);
  const context = await quietContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await p.context().storageState() });
  try {
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const m = await context.newPage(); m.on('pageerror', e => report.errors.push(e.message));
    await m.goto(p.url()); await m.getByRole('button', { name: enter }).waitFor({ timeout: 90000 }); await m.evaluate(() => window.liuzhouTest.manual(true)); await m.getByRole('button', { name: enter }).tap();
    await m.getByRole('button', { name: '地图', exact: true }).tap(); await capture(m, `citizens-${String(index++).padStart(2, '0')}-touch-map`);
    await m.getByRole('button', { name: '回到街上 ↗', exact: true }).tap();
    await m.getByRole('button', { name: '互动', exact: true }).tap(); assert.ok((await state(m)).dialogue);
    await capture(m, `citizens-${String(index++).padStart(2, '0')}-touch-conversation`);
    await m.setViewportSize({ width: 844, height: 390 }); await capture(m, `citizens-${String(index++).padStart(2, '0')}-landscape-conversation`);
  } finally { await context.close(); }
  report.checks.push('all five citizens restore exact position, stop timer and walked distance; earned save on touch device, live map, portrait and landscape conversation');
}
module.exports = { runCitizens };
