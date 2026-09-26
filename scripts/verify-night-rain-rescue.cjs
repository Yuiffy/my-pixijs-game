const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3885';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-rescue';
const evidence = [], errors = [], checks = [];
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms, input) => p.evaluate(({ ms, input }) => { if (input) window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });
const pilot = fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs', 'utf8').replaceAll('export ', '');
const installPilot = p => p.addScriptTag({ content: pilot + ';window.nightRainPilot={chooseInput,NIGHT_ROUTE};' });
async function walk(p, target) {
  const ok = await p.evaluate(target => {
    for (let i = 0; i < 4000; i++) {
      const s = window.nightRain.getState();
      const fighting = s.enemies.some(e => e.hp > 0 && e.aggro && Math.abs(e.y - s.player.y) < 1.5 && Math.hypot(e.x - s.player.x, e.z - s.player.z) < 8);
      if (Math.hypot(s.player.x - target.x, s.player.z - target.z) < .12 && !fighting && s.player.action === 'idle') return true;
      window.nightRain.input(window.nightRainPilot.chooseInput(s, target)); window.advanceTime(40);
    }
    return false;
  }, target);
  assert.ok(ok, 'walk ' + JSON.stringify(target));
}
async function shot(p, name) {
  await advance(p, 0); await p.waitForTimeout(300);
  const file = path.join(out, name + '.png');
  const layout = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]) }));
  assert.ok(layout.scroll <= layout.width); assert.equal(layout.canvas.length, 1);
  evidence.push({ file, layout, pixels: inspectPng(await p.screenshot({ path: file, fullPage: true })) });
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(await state(p), null, 2));
}
function resources(s) { return { hp: s.player.hp, flasks: s.player.flasks, rice: s.rice, collected: s.collected, kills: s.kills }; }
async function rescue(p, panel, checkpoint) {
  const before = await state(p); await p.keyboard.press(panel);
  await p.getByRole('button', { name: /脱离卡死/ }).click(); await advance(p, 0);
  const after = await state(p); assert.equal(after.mode, 'playing'); assert.equal(after.paused, false);
  assert.deepEqual(resources(after), resources(before));
  assert.ok(Math.hypot(after.player.x - checkpoint.x, after.player.z - checkpoint.z) < .01);
  assert.equal(after.player.y, checkpoint.y); assert.equal(after.player.jumpHeight, 0);
}
async function main() {
  fs.mkdirSync(out, { recursive: true }); assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(installVirtualPointerLock);
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(base + '/game/night-rain', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: '出门找夜宵', exact: true }).click(); await advance(p, 0); await installPilot(p);
    await walk(p, { x: 7, z: 15 }); await rescue(p, 'm', { x: 1.8, y: 6, z: 15.5 }); checks.push('map rescue before lighting a lamp returns to the hotel');
    const route = await p.evaluate(() => window.nightRainPilot.NIGHT_ROUTE);
    for (const target of route) {
      await walk(p, target); if (target.interact) { await p.keyboard.press('e'); await advance(p, 1); }
      if (target.interact === 'rooftop-note') break;
    }
    await walk(p, { x: -5, z: -21 }); await advance(p, 700, { z: 1, jump: true }); await advance(p, 600);
    let s = await state(p); assert.equal(s.player.jumpHeight, 0); assert.ok(s.player.y > 4.5 && s.player.y < 6); await shot(p, '01-merchant-roof');
    await p.evaluate(() => window.nightRain.save()); await p.reload({ waitUntil: 'networkidle' }); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await advance(p, 0); await installPilot(p);
    s = await state(p); assert.ok(s.player.y > 4.5 && s.player.y < 6);
    await advance(p, 170, { x: 1 }); await advance(p, 1050, { z: 1, jump: true }); await advance(p, 700);
    s = await state(p); assert.equal(s.player.y, 3); assert.equal(s.mode, 'playing'); await shot(p, '02-cloister-landing');
    await rescue(p, 'Escape', { x: -1, y: 0, z: 8.2 }); await shot(p, '03-rescued-courtyard'); checks.push('legal rooftop jump, sloped roof landing, save/reload, jump to lower cloister, pause rescue preserve resources');
    await p.keyboard.press('m'); await shot(p, '04-map-route'); await p.getByRole('button', { name: '带我去新区域 · 潮汐港', exact: true }).click();
    const arrived = await p.evaluate(() => {
      for (let i = 0; i < 18000; i++) {
        const s = window.nightRain.getState(), c = JSON.parse(window.render_game_to_text()).companion;
        if (c.status === 'arrived') return true;
        window.nightRain.input(window.nightRainPilot.chooseInput(s, c.position)); window.advanceTime(40);
      }
      return false;
    });
    assert.ok(arrived, 'follow fairy to tide bridge'); s = await state(p); assert.ok(s.player.x > 20); assert.equal(s.player.y, 0); await shot(p, '05-guided-tide-entrance');
    await rescue(p, 'm', { x: -1, y: 0, z: 8.2 }); checks.push('map guide actually follows legal route through open ferry pavilion; map rescue returns from new district');
    for (const width of [390, 320]) {
      await p.setViewportSize({ width, height: 844 }); await p.keyboard.press('Escape');
      const button = p.getByRole('button', { name: /脱离卡死/ }); await button.scrollIntoViewIfNeeded(); await shot(p, `06-pause-${width}`); await button.click(); await advance(p, 0);
      await p.keyboard.press('m'); await button.scrollIntoViewIfNeeded(); await shot(p, `07-map-${width}`); await button.click(); await advance(p, 0);
    }
    await p.setViewportSize({ width: 1440, height: 900 }); await p.keyboard.press('c'); await p.getByLabel('宝宝模式', { exact: false }).uncheck(); await p.getByRole('button', { name: '关闭', exact: true }).click();
    await p.keyboard.press('m'); assert.equal(await p.getByRole('button', { name: '带我去新区域 · 潮汐港', exact: true }).count(), 0); assert.equal(await p.getByRole('button', { name: /脱离卡死/ }).count(), 1); await shot(p, '08-map-no-baby');
    checks.push('390/320 menus scroll with rescue accessible; normal mode retains rescue without baby guidance'); assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors, evidence }, null, 2)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
