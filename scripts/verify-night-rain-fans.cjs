const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4126';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-fan-roster/dev';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { engine, world, place, riverCompleted } = await import('./tests/helpers/night-rain-sky.mjs');
  const { skyCompleted } = await import('./tests/helpers/night-rain-bell.mjs');
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const { FAN_ENEMIES, fanOf } = await load('src/components/nightRain/fanEnemies.ts');
  const ids = world.ENEMY_SPAWNS.filter(e => /^(sky-|bell-)/.test(e.id) && fanOf(e)).map(e => e.id);
  assert.equal(ids.length, 13);
  const report = { pointerLock: 'virtual document only', evidence: [], errors: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const id of ids) {
      const s = id.startsWith('bell-') ? skyCompleted() : riverCompleted();
      s.skyGates = ['sky-entry', 'sky-return', 'sky-door'];
      for (const item of ['sky-prism-rose', 'sky-prism-moon']) if (!s.collected.includes(item)) s.collected.push(item);
      if (id.startsWith('bell-')) s.bellGates = ['bell-entry'];
      const e = s.enemies.find(e => e.id === id);
      const spot = [[1.8, 2], [-1.8, 2], [1.8, -2], [-1.8, -2]].map(([dx, dz]) => ({ x: e.x + dx, y: world.supportAt(e.x + dx, e.z + dz, e.y + 2), z: e.z + dz }))
        .find(p => p.y !== null && world.canOccupy(p.x, p.z, p.y, s, .24));
      assert.ok(spot, id + ' clear player approach'); place(s, spot);
      s.player.facing = spot.z > e.z ? Math.PI : 0;
      e.facing = Math.atan2(spot.x - e.x, spot.z - e.z);
      const oldSave = JSON.parse(engine.saveGame(s));
      for (const enemy of oldSave.enemies) if (FAN_ENEMIES[enemy.id]?.cosmeticOnly) enemy.name = FAN_ENEMIES[enemy.id].previous;
      const save = JSON.stringify(oldSave); assert.ok(engine.loadGame(save), id + ' legacy save loads');
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(installVirtualPointerLock);
      await ctx.addInitScript(save => {
        localStorage.setItem('night-rain-v1-slot-1', save);
        localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
        localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
        if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      }, save);
      await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      const page = await ctx.newPage();
      page.on('pageerror', e => report.errors.push(e.stack));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.advanceTime(0); window.__freeze = setInterval(() => window.advanceTime(0), 200); });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.locator('canvas').waitFor();
      await page.getByText('雨正在落下，旧城即将亮灯……', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
      await page.waitForFunction(() => document.pointerLockElement !== null);
      await page.evaluate(({ yaw, pitch }) => {
        const s = JSON.parse(window.render_game_to_text());
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: (s.camera.yaw - yaw) / .003, movementY: (pitch - s.camera.pitch) / .003 }));
        document.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000 }));
      }, { yaw: spot.z > e.z ? 0 : Math.PI, pitch: Math.max(-.3, Math.min(.6, .22 - (e.y - spot.y) * .25)) });
      await page.waitForTimeout(450);
      const snapshot = await page.evaluate(id => {
        const state = JSON.parse(window.render_game_to_text());
        return { state, target: state.enemies.find(e => e.id === id), canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), dom: document.body.innerText };
      }, id);
      assert.equal(snapshot.state.mode, 'playing'); assert.equal(snapshot.target.name, e.name);
      assert.deepEqual(snapshot.state.enemies, s.enemies); assert.equal(snapshot.state.player.hp, s.player.hp);
      assert.equal(snapshot.canvas.length, 1); assert.ok(snapshot.canvas[0][0] > 100);
      const file = path.join(out, id + '.png');
      const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      report.evidence.push({ id, fan: fanOf(e), file, pixels, ...snapshot });
      await ctx.close(); console.log(id + ' ' + fanOf(e));
    }
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
