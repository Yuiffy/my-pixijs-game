const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4064';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-sky-browser';
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { engine, riverCompleted, place } = await import('./tests/helpers/night-rain-sky.mjs');
  const scenarios = [
    { name: '01-river-distant-ring', p: [-149, 8, -517], yaw: -.54, pitch: .14 },
    { name: '02-reed-pass', p: [-108, 12.1, -549], yaw: 0, pitch: .24 },
    { name: '03-salt-reveal', p: [-99, 18, -578], yaw: -.48, pitch: -.15 },
    { name: '04-salt-pools', p: [-143, 12, -585], yaw: -.6, pitch: .35 },
    { name: '05-old-tower', p: [-140, 26, -632], yaw: -1.05, pitch: -.1 },
    { name: '06-refraction-bridge', p: [-66, 26.47, -615], yaw: -.26, pitch: -.23 },
    { name: '07-mirror-court', p: [-30, 32, -637], yaw: .1, pitch: -.3 },
    { name: '08-observatory-boss', p: [-40, 32, -674], yaw: 0, pitch: .5, boss: true },
    { name: '09-return-vista', p: [-44, 40, -718], yaw: 2.6, pitch: .3, complete: true },
    { name: '10-cinematic', p: [-43, 40, -723], cinema: true, complete: true },
    { name: '11-mobile-salt', p: [-103, 18, -572], yaw: -.5, pitch: -.12, mobile: true },
    { name: '13-reduced-motion', p: [-43, 40, -723], cinema: true, complete: true, reduced: true },
    { name: '14-mobile-320', p: [-103, 18, -572], yaw: -.5, pitch: -.12, mobile: true, width: 320 },
  ];
  const errors = []; const evidence = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NIGHT_RAIN_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const scenario of scenarios.filter(s => !process.env.NIGHT_SCENE || s.name.includes(process.env.NIGHT_SCENE))) {
      const s = riverCompleted(); s.skyGates = ['sky-entry', 'sky-return', 'sky-door'];
      s.collected.push('sky-prism-rose', 'sky-prism-moon');
      s.litLamps.push('sky-lamp', 'sky-court-lamp');
      place(s, { x: scenario.p[0], y: scenario.p[1], z: scenario.p[2] });
      if (scenario.complete) {
        s.defeatedGuests.push('sky-astronomer'); Object.assign(s.enemies.find(e => e.kind === 'astronomer'), { hp: 0, action: 'dead' });
        s.skyComplete = true; s.collected.push('sky-heart');
      }
      if (scenario.boss) {
        const boss = s.enemies.find(e => e.kind === 'astronomer'); Object.assign(boss, { action: 'windup', timer: 1, aggro: true });
        const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
        (await load('src/components/nightRain/bossFields.ts')).castBossSkill(s, boss);
      }
      if (scenario.cinema) s.mode = 'interlude';
      const save = engine.saveGame(s); assert.ok(engine.loadGame(save), scenario.name + ' valid save');
      const ctx = await browser.newContext({ viewport: { width: scenario.width || (scenario.mobile ? 390 : 1440), height: scenario.mobile ? 844 : 900 }, reducedMotion: scenario.reduced ? 'reduce' : 'no-preference' });
      await ctx.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      await ctx.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      await ctx.addInitScript(installVirtualPointerLock);
      await ctx.addInitScript(save => {
        localStorage.setItem('night-rain-v1-slot-1', save);
        localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
        localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
        if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
      }, save);
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).waitFor();
      await page.evaluate(() => { window.advanceTime(0); window.__qaFreeze = setInterval(() => window.advanceTime(0), 250); });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      if (!scenario.cinema) {
        await page.evaluate(({ yaw, pitch }) => {
          const s = JSON.parse(window.render_game_to_text());
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: (s.camera.yaw - yaw) / .003, movementY: (pitch - s.camera.pitch) / .003 }));
        }, scenario);
      }
      await page.waitForTimeout(600);
      const snapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText }));
      assert.ok(layout.width >= layout.scroll); assert.equal(layout.canvas.length, 1);
      assert.ok(Math.abs(snapshot.player.z - scenario.p[2]) < .1);
      const file = path.join(out, scenario.name + '.png'); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      fs.writeFileSync(path.join(out, scenario.name + '.json'), JSON.stringify({ snapshot, layout, pixels }, null, 2)); evidence.push({ file, pixels });
      if (scenario.reduced) {
        const clip = { x: 0, y: 55, width: 1440, height: 450 };
        const still = await page.screenshot({ clip });
        await page.waitForTimeout(4500);
        assert.ok(still.equals(await page.screenshot({ clip })), 'reduced-motion cinematic keeps the camera still');
        const later = path.join(out, '16-reduced-motion-later.png');
        evidence.push({ file: later, pixels: inspectPng(await page.screenshot({ path: later, fullPage: true })) });
      }
      if (scenario.cinema) { await page.getByRole('button', { name: '跳过演出，继续探索' }).click(); assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'playing'); }
      if (scenario.mobile) {
        await page.keyboard.press('m'); await page.getByRole('button', { name: '天镜原', exact: true }).click();
        const map = path.join(out, scenario.width ? '15-mobile-320-map.png' : '12-mobile-map.png');
        const mapState = await page.evaluate(() => ({ snapshot: JSON.parse(window.render_game_to_text()), width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText }));
        assert.ok(mapState.scroll <= mapState.width); assert.equal(mapState.canvas.length, 1); assert.equal(mapState.snapshot.panel, 'map');
        const mapPixels = inspectPng(await page.screenshot({ path: map, fullPage: true }));
        fs.writeFileSync(map.replace(/\.png$/, '.json'), JSON.stringify({ ...mapState, pixels: mapPixels }, null, 2));
        evidence.push({ file: map, pixels: mapPixels });
      }
      await ctx.close(); console.log(scenario.name);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ errors, evidence }, null, 2)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
