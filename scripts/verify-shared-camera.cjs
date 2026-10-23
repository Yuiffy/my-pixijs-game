const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.CAMERA_BASE_URL || 'http://127.0.0.1:4132';
const output = process.env.CAMERA_QA_DIR || '.tmp/shared-camera-night';
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const report = { errors: [], captures: [], traces: [], pointerLock: 'quietContext virtual document only', passed: false };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const frame = page => page.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), camera: window.nightRainCamera() }));
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function aim(page, yaw, pitch = 0.46) {
  const before = await state(page);
  await page.evaluate(({ dx, dy }) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy })), { dx: (before.camera.yaw - yaw) / 0.003, dy: (pitch - before.camera.pitch) / 0.003 });
  await settled(page);
}
function check({ state: s, camera: c }, yaw) {
  assert.ok(angle(s.camera.yaw, yaw) < 0.00301, 'occlusion cannot rewrite free-look input');
  assert.ok(angle(Math.atan2(-c.forward[0], -c.forward[2]), s.camera.yaw) < 1e-6, 'rendered free camera follows requested heading');
  const dx = c.position[0] - c.target[0], dz = c.position[2] - c.target[2];
  if (Math.hypot(dx, dz) > 0.01) assert.ok(angle(Math.atan2(dx, dz), s.camera.yaw) < 1e-6, 'extension stays on the current ray');
  assert.ok(c.position.every(Number.isFinite));
}
async function capture(page, name) {
  await settled(page);
  const file = path.join(output, `${name}.png`);
  const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const dom = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText.slice(0, 1600) }));
  assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0][0] > 0); assert.ok(dom.scroll <= dom.width + 1);
  report.captures.push({ name, file, sanity, dom, ...await frame(page) });
}
(async () => {
  assert.equal((await fetch(`${base}/game/night-rain`)).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const { engine, world, place } = await import('./tests/helpers/night-rain-sky.mjs');
  const { skyCompleted } = await import('./tests/helpers/night-rain-bell.mjs');
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const { dungeonPoint } = await loadTypescriptModule('src/components/nightRain/dungeons.ts');
  const fresh = () => { const s = engine.createGame(); engine.startGame(s); return s; };
  const house = fresh(); place(house, { x: 3.2, y: 0, z: -5.5 });
  const roof = fresh(); place(roof, { x: -15.5, y: 6, z: -22.5 });
  const crypt = fresh(); place(crypt, dungeonPoint('crypt', { x: 96, y: 0, z: 33 })); crypt.discoveredDungeons = ['crypt'];
  const abbey = skyCompleted(); abbey.bellGates = ['bell-entry']; place(abbey, { x: -44, y: 35, z: -740 });
  let combat;
  for (const enemy of fresh().enemies) {
    for (const [dx, dz] of [[0, 4], [4, 0], [0, -4], [-4, 0]]) {
      const s = fresh(), p = { x: enemy.x + dx, y: enemy.y, z: enemy.z + dz };
      if (!world.canOccupy(p.x, p.z, p.y, s, 0.32) || world.supportAt(p.x, p.z, p.y + 0.2) !== p.y) continue;
      place(s, p); engine.stepGame(s, 16, { x: 0, z: 0, lock: true });
      if (s.lockedId) { s.lockedId = null; combat = s; break; }
    }
    if (combat) break;
  }
  assert.ok(combat, 'valid combat fixture with a visible enemy');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const [name, source] of [['house', house], ['roof', roof], ['crypt', crypt], ['abbey', abbey], ['combat', combat]]) {
      assert.ok(world.canOccupy(source.player.x, source.player.z, source.player.y, source, 0.32), `${name}: valid player position`);
      const save = engine.saveGame(source); const loaded = engine.loadGame(save); assert.ok(loaded, `${name}: accepted save`);
      assert.equal(loaded.player.y, source.player.y);
      const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
      await context.addInitScript(save => {
        localStorage.setItem('night-rain-v1-slot-1', save);
        localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
        localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      }, save);
      await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(`${base}/game/night-rain?test=1`, { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.advanceTime(0); window.cameraFreeze = setInterval(() => window.advanceTime(0), 200); });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.waitForFunction(() => typeof window.nightRainCamera === 'function' && document.pointerLockElement !== null);
      await page.getByText('雨正在落下，旧城即将亮灯……', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
      if (name === 'combat') {
        await page.keyboard.press('KeyQ'); await page.evaluate(() => window.advanceTime(16));
        await page.waitForTimeout(700);
        const locked = await frame(page); assert.ok(locked.state.lockedId, 'normal Q lock-on still works');
        const delta = locked.camera.target.map((v, i) => v - locked.camera.position[i]);
        const length = Math.hypot(...delta);
        assert.ok(delta.every((v, i) => Math.abs(v / length - locked.camera.forward[i]) < 1e-6));
        await capture(page, 'night-combat-lock');
        await page.keyboard.press('KeyQ'); await page.evaluate(() => window.advanceTime(16));
        assert.equal((await state(page)).lockedId, null);
        await aim(page, Math.PI); check(await frame(page), Math.PI);
        await capture(page, 'night-combat-unlock');
      } else {
        const firstYaw = name === 'house' ? Math.PI : 0;
        await aim(page, firstYaw); check(await frame(page), firstYaw);
        await capture(page, `night-${name}-first`);
        for (const direction of [1, -1]) {
          const count = name === 'house' ? 96 : 24;
          for (let i = 0; i <= count; i++) {
            const yaw = firstYaw + direction * i * Math.PI * 4 / count;
            await aim(page, yaw); const actual = await frame(page); check(actual, yaw);
            report.traces.push({ name, yaw, actual: actual.state.camera.yaw, forward: actual.camera.forward, position: actual.camera.position });
          }
        }
        await aim(page, firstYaw + Math.PI); check(await frame(page), firstYaw + Math.PI);
        await aim(page, firstYaw); check(await frame(page), firstYaw);
        await capture(page, `night-${name}-repeated`);
        if (name === 'house') {
          await page.keyboard.press('Escape'); assert.equal((await state(page)).panel, 'pause');
          await page.getByRole('button', { name: '继续旅程', exact: true }).click();
          await page.waitForFunction(() => document.pointerLockElement !== null);
          await page.setViewportSize({ width: 390, height: 844 });
          await aim(page, Math.PI); check(await frame(page), Math.PI);
          await capture(page, 'night-house-portrait');
        }
      }
      await context.close();
    }
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
