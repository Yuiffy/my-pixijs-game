const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.AFTER_HOURS_URL || 'http://127.0.0.1:3940';
const out = process.env.AFTER_HOURS_QA || 'tmp/after-hours-browser';
const errors = []; const images = []; const results = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
let world;

async function quietExternalScripts(context) {
  // Local game QA should not depend on production advertising/telemetry hosts.
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,
    route => route.fulfill({ contentType: 'application/javascript', body: '' }));
}

async function capture(page, name) {
  await page.waitForTimeout(200);
  const file = path.join(out, `${name}.png`);
  const s = await state(page);
  const dom = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, canvas: [document.querySelector('canvas')?.width, document.querySelector('canvas')?.height], text: document.body.innerText.slice(0, 1300) }));
  assert.ok(dom.scrollWidth <= dom.width + 1, 'no horizontal overflow');
  assert.ok(s.renderer.triangles > 0 && s.renderer.calls > 0, JSON.stringify(s.renderer));
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  images.push({ file, pixels, dom, state: s });
}

async function turn(page, yaw) {
  const s = await state(page);
  const delta = Math.atan2(Math.sin(yaw - s.player.yaw), Math.cos(yaw - s.player.yaw));
  if (Math.abs(delta) < .002) return;
  const key = delta > 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key); await advance(page, Math.abs(delta) / 1.7 * 1000); await page.keyboard.up(key);
}

async function walk(page, point, run = false) {
  let s = await state(page);
  const route = world.findPath(s.player, point, s);
  assert.ok(route.length, `No route to ${JSON.stringify(point)} from ${JSON.stringify(s.player)}`);
  for (const target of route) {
    for (let attempt = 0; attempt < 120; attempt++) {
      s = await state(page); assert.equal(s.mode, 'playing', JSON.stringify(s));
      const dx = target.x - s.player.x; const dz = target.z - s.player.z; const distance = Math.hypot(dx, dz);
      if (distance < .07) break;
      await turn(page, Math.atan2(-dx, -dz));
      if (run && s.player.stamina > 15) await page.keyboard.down('Shift');
      await page.keyboard.down('w'); await advance(page, Math.min(250, distance / (run && s.player.stamina > 15 ? 3.7 : 2.05) * 1000)); await page.keyboard.up('w'); await page.keyboard.up('Shift');
    }
  }
  s = await state(page);
  assert.ok(Math.hypot(s.player.x - point.x, s.player.z - point.z) < .16, `Walk stalled: ${JSON.stringify(s.player)} -> ${JSON.stringify(point)}`);
}

async function reach(page, id, run = false) {
  let s = await state(page);
  const spot = s.spots.find(s => s.id === id);
  assert.ok(spot, `Inactive spot ${id}: ${s.stage}`);
  const choices = [];
  for (let x = -1.4; x <= 1.4; x += .2) for (let z = -1.4; z <= 1.4; z += .2) {
    const p = { x: spot.x + x, z: spot.z + z };
    const d = Math.hypot(x, z);
    if (d < .5 || d > (spot.reach || 1.3) - .16 || !world.walkable(p, s) || !world.clearLine(p, spot, s, 0, true)) continue;
    const path = world.findPath(s.player, p, s);
    if (path.length) choices.push({ p, cost: path.reduce((n, point, i) => n + Math.hypot(point.x - (path[i - 1] || s.player).x, point.z - (path[i - 1] || s.player).z), 0) });
  }
  choices.sort((a, b) => a.cost - b.cost);
  assert.ok(choices.length, `No reachable interaction for ${id}`);
  await walk(page, choices[0].p, run);
  s = await state(page); await turn(page, Math.atan2(s.player.x - spot.x, s.player.z - spot.z)); await advance(page, 0);
  assert.equal((await state(page)).focus, id, `Interaction not facing ${id}: ${JSON.stringify(await state(page))}`);
}

async function interact(page, id, photo, run = false) {
  await reach(page, id, run);
  if (photo) await capture(page, photo);
  await page.keyboard.press('e'); await advance(page, 0);
}

async function exerciseShell(page) {
  await page.locator('[role="presentation"]').click({ position: { x: 610, y: 370 } });
  await page.waitForFunction(() => Boolean(document.pointerLockElement));
  const before = (await state(page)).player.yaw;
  await page.mouse.move(720, 370);
  await page.waitForTimeout(100);
  assert.ok(Math.abs((await state(page)).player.yaw - before) > .01, 'pointer lock turns the camera');
  await page.keyboard.press('j');
  await page.waitForFunction(() => !document.pointerLockElement);
  assert.equal((await state(page)).panel, 'journal');
  assert.equal((await state(page)).mode, 'playing');
  await page.getByRole('button', { name: '收起面板' }).click();
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).mode, 'paused');
  await capture(page, 'desktop-pause');
  await page.getByRole('button', { name: '继续 →' }).click();

  const snapshot = await state(page);
  const lost = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext(); return true;
  });
  assert.equal(lost, true, 'Chrome supports context loss verification');
  await page.getByRole('alertdialog', { name: '恢复游戏画面' }).waitFor();
  assert.equal((await state(page)).mode, 'paused');
  await page.getByRole('button', { name: '重新载入 3D 画面' }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas && !canvas.getContext('webgl2').isContextLost();
  });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '继续 →' }).click();
  assert.equal((await state(page)).stage, snapshot.stage);
  assert.equal((await state(page)).player.x, snapshot.player.x);
  await capture(page, 'renderer-recovered');
  results.push({ pointerLockAndJournalRelease: true, pausedContextLossAndRecovery: true });
}

async function solve(page, ending = 'name', photographs = true) {
  await interact(page, 'echo', photographs && 'sui-companion');
  await interact(page, 'computer', photographs && 'last-stream');
  assert.equal((await state(page)).stage, 'power');
  await page.keyboard.press('f');
  await interact(page, 'fridge', photographs && 'power-note');
  if (photographs) await capture(page, 'journal');
  await page.getByRole('button', { name: '收起面板' }).click();
  await interact(page, 'fuse', photographs && 'blackout');
  await page.getByRole('button', { name: /星/ }).click();
  assert.deepEqual((await state(page)).fuse, []);
  for (const name of ['月亮', '星', '太阳']) await page.getByRole('button', { name: new RegExp(name) }).click();
  assert.equal((await state(page)).stage, 'memories');
  if (photographs) await capture(page, 'power-restored');
  for (const id of ['tape-shelf', 'tape-bedroom', 'tape-kitchen']) await interact(page, id, photographs && id);
  await interact(page, 'notebook', photographs && 'diary');
  await page.getByRole('button', { name: '收起面板' }).click();
  await interact(page, 'computer', photographs && 'memory-screen');
  await page.getByRole('textbox', { name: '午夜密码' }).fill('0000'); await page.getByRole('button', { name: '确认时间 →' }).click();
  assert.equal((await state(page)).stage, 'memories');
  await page.getByRole('textbox', { name: '午夜密码' }).fill('0017'); await page.getByRole('button', { name: '确认时间 →' }).click();
  assert.equal((await state(page)).stage, 'corridor');
  for (const id of ['clock', 'portrait', 'radio']) {
    await interact(page, id, photographs && `corridor-${id}`);
    if (photographs && id !== 'radio') await capture(page, `corridor-repeat-${id}`);
  }
  assert.equal((await state(page)).stage, 'chase');
  if (photographs) await capture(page, 'chase-begins');
  await interact(page, 'fuse', photographs && 'source-fuse', true);
  let approached = false;
  for (let i = 0; i < 120 && (await state(page)).mode === 'playing'; i++) {
    const s = await state(page);
    await turn(page, Math.atan2(s.player.x - s.echo.x, s.player.z - s.echo.z));
    if (!approached && Math.hypot(s.player.x - s.echo.x, s.player.z - s.echo.z) < 2.4) {
      if (photographs) await capture(page, 'chase-approach');
      approached = true;
    }
    await advance(page, 1000);
  }
  assert.equal((await state(page)).mode, 'dead', 'echo catches an idle player in the real browser');
  if (photographs) await capture(page, 'caught');
  await page.getByRole('button', { name: '回到本章检查点 →' }).click();
  assert.deepEqual((await state(page)).sources, ['fuse']);
  await interact(page, 'hide', false, true);
  assert.equal((await state(page)).hidden, true);
  await advance(page, 30000);
  assert.equal((await state(page)).mode, 'playing');
  assert.equal((await state(page)).hidden, true);
  if (photographs) await capture(page, 'wardrobe-hiding');
  await page.keyboard.press('e'); await advance(page, 0);
  assert.equal((await state(page)).hidden, false);
  results.push({ realChaseCapture: true, retryPreservesSources: true, wardrobeAvoidsCapture: true });
  for (const id of ['computer', 'mirror']) {
    let closed = false;
    for (let attempt = 0; attempt < 3 && !closed; attempt++) {
      try {
        await interact(page, id, photographs && `source-${id}`, true);
        closed = true;
      } catch (error) {
        const s = await state(page);
        if (s.mode !== 'dead') throw error;
        const preserved = [...s.sources];
        await page.getByRole('button', { name: '回到本章检查点 →' }).click();
        assert.deepEqual((await state(page)).sources, preserved);
      }
    }
    assert.equal(closed, true, `complete ${id} with normal movement and checkpoint retries`);
  }
  assert.equal((await state(page)).stage, 'choice');
  await interact(page, 'computer', photographs && 'quiet-room');
  if (photographs) await capture(page, 'last-choice');
  const choiceSave = await page.evaluate(() => localStorage.getItem('sui-after-hours-v1'));
  // Refresh the real live checkpoint before choosing an ending. Never inject
  // progress into the running game or let its unload save overwrite a fixture.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#after-hours-start').disabled);
  await page.getByRole('button', { name: /继续 ·/ }).click();
  assert.equal((await state(page)).stage, 'choice');
  await interact(page, 'computer');
  await page.getByRole('button', { name: ending === 'name' ? '记住她，关掉直播，走向天亮' : '再陪她一会儿，留在零点' }).click();
  if (ending === 'name') { await interact(page, 'entry', photographs && 'daybreak'); }
  const s = await state(page);
  assert.equal(s.mode, 'ending'); assert.equal(s.ending, ending === 'name' ? 'dawn' : 'loop');
  if (photographs) await capture(page, `ending-${s.ending}`);
  results.push({ ending: s.ending, deaths: s.deaths, mistakes: s.mistakes, time: s.time, renderer: s.renderer });
  return choiceSave;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/after-hours')).status, 200);
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  world = await loadTypescriptModule('src/components/afterHours/world.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await quietExternalScripts(context);
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/demos', { waitUntil: 'networkidle' });
    await page.getByRole('searchbox', { name: '搜索游戏' }).fill('零点之后');
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-game="/game/after-hours"] img');
      return img && img.complete && img.naturalWidth > 0;
    });
    const libraryFile = path.join(out, 'game-library.png');
    const libraryPixels = inspectPng(await page.screenshot({ path: libraryFile, fullPage: true }));
    images.push({ file: libraryFile, pixels: libraryPixels, dom: { text: await page.locator('[data-game="/game/after-hours"]').innerText() } });
    await page.getByRole('link', { name: '打开 岁己：零点之后', exact: true }).click();
    await page.waitForURL('**/game/after-hours');
    await page.waitForFunction(() => document.querySelector('#after-hours-start') && !document.querySelector('#after-hours-start').disabled, { timeout: 90000 });
    await capture(page, 'title');
    await page.locator('#after-hours-start').click(); await capture(page, 'first-person');
    if (process.env.SMOKE === '1') { assert.deepEqual(errors, []); return; }
    await exerciseShell(page);
    const choiceSave = await solve(page);
    const alternate = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await quietExternalScripts(alternate);
    await alternate.addInitScript(raw => { localStorage.setItem('sui-after-hours-v1', raw); if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; }, choiceSave);
    const alternatePage = await alternate.newPage();
    alternatePage.on('pageerror', e => errors.push(e.message)); alternatePage.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await alternatePage.goto(base + '/game/after-hours', { waitUntil: 'networkidle' });
    await alternatePage.waitForFunction(() => !document.querySelector('#after-hours-start').disabled);
    await alternatePage.getByRole('button', { name: /继续 ·/ }).click();
    assert.equal((await state(alternatePage)).stage, 'choice');
    await interact(alternatePage, 'computer'); await alternatePage.getByRole('button', { name: '再陪她一会儿，留在零点' }).click();
    await capture(alternatePage, 'ending-loop'); assert.equal((await state(alternatePage)).ending, 'loop');
    await alternate.close();
    results.push({ ending: 'loop', refreshedAtChoice: true });
    await page.getByRole('button', { name: '从另一个选择再开始 →' }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await capture(page, `mobile-${width}`);
      await page.getByRole('button', { name: '暂停游戏' }).click(); await capture(page, `mobile-pause-${width}`);
      await page.getByRole('button', { name: '继续 →' }).click();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal((await state(page)).mode, 'paused');
      await page.getByRole('button', { name: '继续 →' }).click();
      const before = (await state(page)).player;
      const joystick = await page.getByRole('button', { name: '移动摇杆' }).boundingBox();
      const cdp = await context.newCDPSession(page);
      const stickPoint = { x: joystick.x + 48, y: joystick.y + 48, id: 1 };
      const lookPoint = { x: width - 65, y: 320, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stickPoint, lookPoint] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...stickPoint, y: stickPoint.y - 33 }, { ...lookPoint, x: lookPoint.x - 40 }] });
      await advance(page, 180);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const after = await state(page); assert.ok(Math.hypot(before.x - after.player.x, before.z - after.player.z) > .1); assert.equal(after.controls.forward, 0); assert.ok(Math.abs(before.yaw - after.player.yaw) > .1);
      results.push({ viewport: width, realTwoFingerMovementAndLook: true }); await cdp.detach();
      await page.getByRole('button', { name: '暂停游戏' }).click();
      await page.getByRole('button', { name: '重新开始', exact: true }).click(); await page.getByRole('button', { name: '从下播那一刻开始', exact: true }).click();
    }
    assert.deepEqual(errors, []);
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ images, results, errors }, null, 2));
    console.log(JSON.stringify({ images: images.map(i => i.file), results, errors }, null, 2));
    await browser.close();
  }
}

module.exports = { state, advance, capture, turn, walk, reach, interact, solve, exerciseShell };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
