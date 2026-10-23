const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4126';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-slope/dev';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { engine, world, place, riverCompleted } = await import('./tests/helpers/night-rain-sky.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const report = { pointerLock: 'virtual document only', scenarios: [], errors: [] };
  try {
    for (const scenario of [{ name: 'uphill', z: -607, yaw: 0 }, { name: 'downhill', z: -616, yaw: Math.PI }, { name: 'crest', z: -622, yaw: 0 }]) {
      const s = riverCompleted(); s.skyGates = ['sky-entry']; s.litLamps.push('sky-lamp'); s.checkpoint = 'sky-lamp';
      place(s, { x: -146, y: world.supportAt(-146, scenario.z, 30), z: scenario.z });
      const save = engine.saveGame(s); assert.ok(engine.loadGame(save), 'valid slope save');
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
      await page.evaluate(() => { window.advanceTime(0); window.__freeze = setInterval(() => window.advanceTime(0), 250); });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.locator('canvas').waitFor();
      await page.getByText('雨正在落下，旧城即将亮灯……', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
      await page.waitForFunction(() => document.pointerLockElement !== null);
      await page.evaluate(yaw => {
        const s = JSON.parse(window.render_game_to_text());
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: (s.camera.yaw - yaw) / .003, movementY: (.3 - s.camera.pitch) / .003 }));
      }, scenario.yaw);
      const evidence = { ...scenario, samples: [], screenshots: [] }; report.scenarios.push(evidence);
      const advance = async ms => {
        const state = await page.evaluate(ms => { window.advanceTime(ms); return JSON.parse(window.render_game_to_text()); }, ms);
        const p = state.player; const floor = world.supportAt(p.x, p.z, 30);
        evidence.samples.push({ mode: state.mode, feet: p.y + p.jumpHeight, floor, player: p });
        assert.equal(state.mode, 'playing'); assert.ok(p.hp >= s.player.hp - 14);
        assert.ok(p.y + p.jumpHeight >= floor - .002, `${scenario.name}: feet crossed the ramp`);
        return state;
      };
      const capture = async name => {
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const file = path.join(out, scenario.name + '-' + name + '.png');
        const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
        const snapshot = await page.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), dom: document.body.innerText }));
        assert.equal(snapshot.canvas.length, 1); assert.ok(snapshot.canvas[0][0] > 100);
        evidence.screenshots.push({ file, pixels, ...snapshot });
      };
      await page.keyboard.down('w'); await page.keyboard.down('Shift'); await advance(400);
      await page.keyboard.down('Space'); const takeoff = await advance(20); await page.keyboard.up('Space');
      assert.ok(takeoff.player.jumpVelocity > 0); assert.ok(Math.abs(takeoff.player.airZ) > 5);
      for (let i = 0; i < 8; i++) await advance(20);
      await capture('jump');
      for (let i = 0; i < 55; i++) await advance(20);
      await page.keyboard.up('w'); await page.keyboard.up('Shift');
      const landed = await advance(40); assert.equal(landed.player.jumpHeight, 0); assert.equal(landed.player.jumpVelocity, 0);
      assert.ok(Math.abs(landed.player.z - scenario.z) > 5);
      await capture('landed'); await ctx.close(); console.log(scenario.name + ' passed');
    }
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
