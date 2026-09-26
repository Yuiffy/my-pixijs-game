const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3885';
const output = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-companion-models';
const errors = []; const evidence = []; const checks = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
async function capture(page, name) {
  await page.waitForTimeout(500);
  const snapshot = await state(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvases: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText }));
  assert.ok(layout.scroll <= layout.width); assert.equal(layout.canvases.length, 1); assert.ok(layout.canvases[0][0] > 0);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  evidence.push({ file, pixels });
  fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify({ snapshot, layout, pixels }, null, 2));
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); assert.equal((await fetch(`${base}/game/night-rain`)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(installVirtualPointerLock);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '出门找夜宵', exact: true }).click();
    await advance(page, 0); await page.keyboard.press('e'); await advance(page, 40);
    await page.keyboard.press('c'); await page.getByRole('button', { name: '直接带我去 · 中庭雨灯', exact: true }).click();
    const pilot = fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs', 'utf8').replaceAll('export ', '');
    await page.addScriptTag({ content: `${pilot};window.nightRainPilot={chooseInput};` });
    const arrived = await page.evaluate(() => {
      for (let i = 0; i < 12000; i++) {
        const s = window.nightRain.getState(); const c = JSON.parse(window.render_game_to_text()).companion;
        if (c.status === 'arrived') return true;
        window.nightRain.input(window.nightRainPilot.chooseInput(s, c.position)); window.advanceTime(40);
      }
      return false;
    });
    assert.ok(arrived); await page.keyboard.press('e'); await advance(page, 40);
    await page.keyboard.press('c');
    await page.getByRole('button', { name: '先不带路，我们随便逛逛', exact: true }).click();
    const moved = await page.evaluate(() => {
      for (let i = 0; i < 3000; i++) {
        const s = window.nightRain.getState();
        if (Math.hypot(s.player.x - 2, s.player.z - 7) < 0.22 && s.player.action === 'idle') return true;
        window.nightRain.input(window.nightRainPilot.chooseInput(s, { x: 2, z: 7 })); window.advanceTime(40);
      }
      return false;
    });
    assert.ok(moved); await page.evaluate(() => { window.nightRain.input({ x: 0, z: 0 }); window.nightRain.resetCamera(); });
    await advance(page, 6000);
    await capture(page, '01-biscuit-courtyard');
    await page.keyboard.press('c'); await page.getByRole('button', { name: '🦦 獭獭栞', exact: true }).click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal((await state(page)).companion.skin, 'otter'); await capture(page, '02-otter-courtyard');
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    assert.equal((await state(page)).companion.skin, 'otter'); assert.equal((await state(page)).checkpoint, 'courtyard');
    checks.push('ordinary-input companion journey, both skins visible, skin and lamp persist after reload');
    await page.keyboard.press('c'); await page.getByLabel('宝宝模式', { exact: false }).uncheck();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal((await state(page)).companion.enabled, false); await capture(page, '03-disabled');
    await page.keyboard.press('c'); await page.getByLabel('宝宝模式', { exact: false }).check();
    await page.getByRole('button', { name: '🍪 饼干岁', exact: true }).click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); await capture(page, '04-biscuit-mobile');
    await page.getByRole('button', { name: '饼干岁 C', exact: true }).click();
    await page.getByRole('button', { name: '🦦 獭獭栞', exact: true }).click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await capture(page, '05-otter-mobile');
    checks.push('baby mode hides models, both skins restore, narrow viewport has no overflow');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, evidence, errors }, null, 2));
    console.log('Companion models, legal following, persistence, visibility and mobile layout passed.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: e.stack, errors, evidence }, null, 2)); process.exitCode = 1; });
