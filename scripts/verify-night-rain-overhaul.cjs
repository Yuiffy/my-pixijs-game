const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4061';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-overhaul-browser';

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const { supportAt } = await load('src/components/nightRain/world.ts');
  const scenarios = [
    { name: 'uphill', id: 'stair-prowler', enemy: [-15.5, -13], player: [-15.5, -15.2], facing: Math.PI },
    { name: 'downhill', id: 'stair-prowler', enemy: [-15.5, -13], player: [-15.5, -10.8], facing: 0 },
    { name: 'bridge-junction', id: 'stair-prowler', enemy: [-15.5, -13], player: [-14.2, -12.5], facing: 1.2 },
    { name: 'red-stair', id: 'gate-captain', enemy: [-47, -118], player: [-47, -116.6], facing: 0 },
    { name: 'canopy', id: 'canal-guard', enemy: [17, -30], player: [19, -30], facing: Math.PI / 2, ceiling: 1 },
    { name: 'red-stair-mobile', id: 'gate-captain', enemy: [-47, -118], player: [-47, -116.6], facing: 0, width: 390 },
  ];
  const errors = []; const evidence = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NIGHT_RAIN_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const scenario of scenarios) {
      const state = engine.createGame(); engine.startGame(state);
      const enemy = state.enemies.find(e => e.id === scenario.id);
      const y = supportAt(...scenario.enemy, scenario.ceiling ?? 25);
      Object.assign(enemy, { x: scenario.enemy[0], z: scenario.enemy[1], y, facing: scenario.facing, action: 'windup', timer: .15, attackIndex: 2, phase: 2, aggro: true });
      const p = { x: scenario.player[0], z: scenario.player[1], y: supportAt(...scenario.player, scenario.ceiling ?? 25) };
      Object.assign(state.player, p, { facing: scenario.facing + Math.PI, lastGround: p, fallPeak: p.y });
      const save = engine.saveGame(state); assert.ok(engine.loadGame(save), scenario.name + ' fixture is a validated save');
      const ctx = await browser.newContext({ viewport: { width: scenario.width || 1440, height: scenario.width ? 844 : 900 } });
      await ctx.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      await ctx.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      await ctx.addInitScript(installVirtualPointerLock);
      await ctx.addInitScript(save => {
        localStorage.setItem('night-rain-v1-slot-1', save);
        localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
        localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
        if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
      }, save);
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).waitFor();
      // Freeze only the public simulation clock before clicking Continue. No runtime
      // state mutation: the pose comes from a save validated by the production loader.
      await page.evaluate(() => { window.advanceTime(0); window.__qaFreeze = setInterval(() => window.advanceTime(0), 250); });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.keyboard.press('q');
      await page.evaluate(() => window.advanceTime(1));
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(500);
      if (scenario.name === 'uphill') {
        // Inspect the uphill wedge from the open side, clear of the nearby roof.
        await page.keyboard.press('q');
        await page.mouse.move(450, 450);
        await page.mouse.move(850, 450, { steps: 10 });
        await page.waitForTimeout(350);
      }
      const snapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      assert.equal(snapshot.enemies.find(e => e.id === scenario.id).action, 'windup');
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText }));
      assert.ok(layout.width >= layout.scroll); assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0] > 0);
      const file = path.join(out, scenario.name + '.png');
      const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      fs.writeFileSync(path.join(out, scenario.name + '.json'), JSON.stringify({ snapshot, layout, pixels }, null, 2));
      evidence.push({ file, pixels });
      await ctx.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ errors, evidence }, null, 2));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
