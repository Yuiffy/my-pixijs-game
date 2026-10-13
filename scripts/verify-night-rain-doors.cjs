const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4066';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-door-browser';

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const cases = [
    { name: 'temple-tight-face', id: 'temple-gate', p: { x: -30.5, y: 0, z: -6.68 }, yaw: Math.PI },
    { name: 'weaver-tight-face', id: 'weaver-gate', p: { x: -52.32, y: 0, z: -81 }, yaw: Math.PI / 2 },
    { name: 'royal-remote-winch', id: 'royal-gate', p: { x: -110.8, y: 24, z: -223.6 }, yaw: Math.PI / 2 },
    { name: 'temple-wrong-face', id: 'temple-gate', p: { x: -30.5, y: 0, z: -4.65 }, refused: true },
  ];
  const errors = []; const evidence = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NIGHT_RAIN_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const c of cases) {
      const s = engine.createGame(); engine.startGame(s);
      Object.assign(s.player, c.p, { lastGround: { ...c.p }, fallPeak: c.p.y });
      const save = engine.saveGame(s); assert.ok(engine.loadGame(save), c.name + ' validated save');
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
      page.on('pageerror', e => errors.push(e.stack || e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).waitFor();
      await page.evaluate(() => { window.advanceTime(0); window.__qaFreeze = setInterval(() => window.advanceTime(0), 250); });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await page.evaluate(() => window.advanceTime(1));
      // Exercise the mouse-look handler under virtual pointer lock, leaving the
      // user's OS pointer free. Face the mechanism so the evidence is readable.
      await page.evaluate(yaw => {
        const current = JSON.parse(window.render_game_to_text()).camera.yaw;
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: (current - yaw) / 0.003 }));
      }, c.yaw || 0);
      if (c.name.includes('tight-face')) {
        await page.keyboard.down('w');
        await page.evaluate(() => window.advanceTime(200));
        await page.keyboard.up('w');
      }
      const capture = async stage => {
        await page.waitForTimeout(350);
        const snapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
        const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText }));
        assert.ok(layout.width >= layout.scroll); assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0] > 0);
        const file = path.join(out, c.name + '-' + stage + '.png');
        const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
        evidence.push({ file, pixels, snapshot, layout });
        return snapshot;
      };
      const before = await capture('before');
      assert.equal(before.nearbyId, c.id, c.name);
      assert.equal(/无法从这一侧打开/.test(before.prompt), !!c.refused);
      assert.ok(evidence.at(-1).layout.text.includes(before.prompt));
      await page.keyboard.press('e');
      await page.evaluate(() => window.advanceTime(10));
      const after = await capture('after');
      assert.equal(!!engine.closedDoor(after, c.id), !!c.refused);
      if (c.refused) assert.match(after.message, /无法从这一侧打开/);
      else assert.doesNotMatch(after.message, /另一侧|另一面/);
      await ctx.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ errors, evidence }, null, 2));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
