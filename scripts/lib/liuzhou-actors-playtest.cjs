const assert = require('node:assert/strict');
const { quietContext } = require('./liuzhou-test-browser.cjs');
const { travel } = require('./liuzhou-pilot.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const visual = async p => { await settle(p); return p.evaluate(() => window.liuzhouTest.visual()); };
const player = async p => (await visual(p)).find(a => a.id === 'player');
async function move(p, input, frames) {
  await p.evaluate(({ input, frames }) => window.liuzhouTest.move(input, frames), { input, frames });
  await settle(p);
}
async function yaw(p, wanted) {
  const current = (await state(p)).controls.yaw;
  const delta = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
  await p.evaluate(dx => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx })), -delta / 0.003);
  await p.waitForTimeout(650);
}
exports.runActors = async ({ page: p, browser, capture, report }) => {
  report.poses = [];
  const shot = async (name, id = 'player') => {
    const avatar = (await visual(p)).find(a => a.id === id);
    assert.ok(avatar?.visible, name);
    report.poses.push({ name, avatar, locomotion: (await state(p)).locomotion });
    await capture(p, name);
    return avatar;
  };
  await move(p, {}, 12);
  assert.equal((await player(p)).mode, 'idle', 'global floor is grounded even at the controller contact offset');
  await travel(p, { x: 36, z: -30 }, { tolerance: 0.4 });
  await move(p, {}, 40);
  await yaw(p, (await state(p)).player.angle + Math.PI);
  await p.evaluate(() => document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -700, bubbles: true, cancelable: true })));
  await p.waitForTimeout(650);
  const characters = ['sui', 'shiori', 'nagisa', 'nana'];
  for (let i = 0; i < characters.length; i++) {
    await p.keyboard.press(`Digit${i + 1}`);
    const avatar = await shot(`actors-0${i + 1}-${characters[i]}`);
    assert.equal(avatar.character, characters[i]);
  }
  await p.keyboard.press('Digit1');
  await move(p, { forward: 1 }, 18);
  const walking = await shot('actors-05-walk'); assert.equal(walking.mode, 'walk');
  await move(p, { forward: 1 }, 6);
  assert.notDeepEqual((await player(p)).leftLeg, walking.leftLeg);
  await move(p, { forward: 1, sprint: true }, 24);
  assert.equal((await shot('actors-06-run')).mode, 'run');
  await move(p, { jump: true }, 1); await move(p, {}, 7);
  assert.equal((await shot('actors-07-jump-rise')).mode, 'rise');
  for (let i = 0; i < 40 && (await state(p)).locomotion.velocityY >= 0; i++) await move(p, {}, 1);
  assert.equal((await shot('actors-08-jump-fall')).mode, 'fall');
  for (let i = 0; i < 90 && !(await state(p)).locomotion.grounded; i++) await move(p, {}, 1);
  assert.equal((await shot('actors-09-land')).mode, 'land');
  await move(p, { forward: 1 }, 12);
  await p.keyboard.press('Escape');
  const frozen = await player(p), paused = await state(p);
  await p.evaluate(() => window.advanceTime(1500)); await settle(p);
  assert.deepEqual(await player(p), frozen); assert.deepEqual(await state(p), paused);
  await shot('actors-10-paused');
  await p.keyboard.press('Escape');
  await travel(p, { x: 28, z: -23 });
  await p.keyboard.press('KeyE'); assert.ok((await state(p)).dialogue);
  await shot('actors-11-conversation');
  while ((await state(p)).dialogue) await p.keyboard.press('KeyE');
  await travel(p, { x: 42, z: -8 }); await p.keyboard.press('KeyE');
  assert.equal((await state(p)).vehicle, 'bike-1');
  await yaw(p, (await state(p)).player.angle + Math.PI / 2);
  let previous;
  for (let i = 0; i < characters.length; i++) {
    await p.keyboard.press(`Digit${i + 1}`);
    await move(p, { forward: 1 }, 12);
    const rider = await shot(`actors-${12 + i}-riding-${characters[i]}`, 'rider-bike-1');
    assert.equal(rider.character, characters[i]); assert.equal(rider.mode, 'ride');
    assert.ok(rider.pedalErrors.every(v => v < 0.035), `actual pedal contacts ${rider.pedalErrors}`);
    assert.ok(rider.gripErrors.every(v => v < 0.015), `actual handlebar contacts ${rider.gripErrors}`);
    assert.equal((await player(p)).visible, false, 'walking body hidden when riding');
    if (previous) assert.notDeepEqual(rider.leftLeg, previous.leftLeg);
    previous = rider;
  }
  await move(p, { brake: true }, 50); await p.keyboard.press('KeyE');
  assert.equal((await state(p)).vehicle, null); assert.equal((await player(p)).visible, true);
  await p.keyboard.press('Escape');
  const context = await quietContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await p.context().storageState() });
  try {
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const m = await context.newPage();
    m.on('pageerror', e => report.errors.push(e.message));
    m.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
    await m.goto(p.url()); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 90000 });
    await m.evaluate(() => window.liuzhouTest.manual(true));
    await m.getByRole('button', { name: '继续这趟旅行 ↗' }).tap();
    await move(m, {}, 20);
    assert.equal((await player(m)).character, 'nana');
    await capture(m, 'actors-16-mobile-portrait');
    await m.setViewportSize({ width: 844, height: 390 }); await capture(m, 'actors-17-mobile-landscape');
  } finally { await context.close(); }
  report.checks.push('four portrait-referenced articulated characters share walking and bicycle meshes; actual mounted knee/elbow/ankle transforms, travel-driven gait, Rapier jump/rise/fall/landing, frozen pause, ordinary dialogue and mounting/dismounting, actual pedal and handlebar contacts, saved character restored on touch portrait/landscape; virtual pointer lock only');
};
