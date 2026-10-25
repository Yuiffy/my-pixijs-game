const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = (process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4161').replace(/\/$/, '').replace(/\/game\/night-rain$/, '');
const out = path.resolve(process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-earth-browser');
const selected = new Set((process.env.NIGHT_RAIN_SCENARIOS || '').split(',').filter(Boolean));
const errors = []; const evidence = []; const checks = [];
let passed = false;

async function snapshot(page) { return page.evaluate(() => JSON.parse(window.render_game_to_text())); }
async function advance(page, ms, input) {
  await page.evaluate(({ ms, input }) => { if (input) window.nightRain.input(input); window.advanceTime(ms); }, { ms, input });
}
async function look(page, yaw, pitch = 0.55, distance = 9) {
  await page.evaluate(({ yaw, pitch, distance }) => {
    const camera = JSON.parse(window.render_game_to_text()).camera;
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: (camera.yaw - yaw) / 0.003, movementY: (pitch - camera.pitch) / 0.003 }));
    document.dispatchEvent(new WheelEvent('wheel', { deltaY: (distance - camera.distance) / 0.006 }));
  }, { yaw, pitch, distance });
  await page.waitForTimeout(600);
}
async function capture(page, name) {
  const state = await snapshot(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText, mode: document.querySelector('main[data-mode]')?.dataset.mode }));
  assert.ok(!layout.text.includes('旧城即将亮灯'), name + ': render must be ready');
  assert.ok(layout.width >= layout.scroll, name + ': no horizontal overflow');
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0] > 0 && layout.canvas[0][1] > 0);
  const file = path.join(out, name + '.png');
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ state, layout, pixels }, null, 2));
  evidence.push({ name, file, pixels, mode: state.mode, player: state.player, panel: state.panel });
  console.log('captured ' + file);
  return state;
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const response = await fetch(base + '/game/night-rain', { signal: AbortSignal.timeout(120000) });
  assert.equal(response.status, 200, 'dev server must answer HTTP before browser launch');
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const world = await load('src/components/nightRain/world.ts');
  const fixture = (position, changes = () => {}) => {
    const state = engine.createGame(); engine.startGame(state);
    Object.assign(state.player, position, { lastGround: { ...position }, fallPeak: position.y });
    changes(state); const raw = engine.saveGame(state);
    assert.ok(engine.loadGame(raw), 'production loadGame validates the fixture');
    return raw;
  };
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NIGHT_RAIN_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const open = async raw => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.addInitScript(installVirtualPointerLock);
    await context.addInitScript(save => {
      localStorage.clear(); localStorage.setItem('night-rain-v1-slot-1', save);
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
      if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
    }, raw);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).waitFor({ timeout: 120000 });
    await page.evaluate(() => { window.advanceTime(0); window.__earthQaFreeze = setInterval(() => window.advanceTime(0), 200); });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('canvas') && document.querySelector('main[data-mode="playing"]') && !document.body.innerText.includes('旧城即将亮灯'), { timeout: 120000 });
    await advance(page, 1); await page.waitForTimeout(700);
    return { page, context };
  };
  const run = async (name, fn) => { if (!selected.size || selected.has(name)) { console.log('scenario ' + name); await fn(); checks.push(name); } };
  try {
    await run('entry', async () => { const { page, context } = await open(fixture(world.SPAWN)); await capture(page, 'entry'); await context.close(); });
    await run('high', async () => { const { page, context } = await open(fixture({ x: 4, y: 6, z: -24 })); await look(page, -Math.PI / 2, 0.85); await capture(page, 'high-sunken-overlook'); await context.close(); });
    await run('shrine', async () => {
      const { page, context } = await open(fixture(world.REST_POINTS.courtyard, s => { s.player.hp = 37; s.player.flasks = 1; }));
      await look(page, 0.45, 0.42, 5); let s = await capture(page, 'shrine-unlit');
      assert.equal(s.nearbyId, 'courtyard'); assert.ok(!s.litLamps.includes('courtyard'));
      await advance(page, 40, { x: 0, z: 0, interact: true });
      s = await capture(page, 'shrine-lit-notice');
      assert.ok(s.litLamps.includes('courtyard')); assert.equal(s.player.hp, 37); assert.equal(s.player.flasks, 1); assert.equal(s.checkpoint, 'courtyard');
      await page.waitForTimeout(2500); await capture(page, 'shrine-lit');
      await advance(page, 40, { x: 0, z: 0, interact: true });
      await page.getByRole('dialog', { name: '雨灯歇息', exact: true }).waitFor();
      s = await capture(page, 'shrine-menu'); assert.equal(s.panel, 'lamp');
      await page.getByRole('button', { name: '坐下休息 · 补满生命与药瓶', exact: true }).click();
      s = await capture(page, 'shrine-rest'); assert.equal(s.player.hp, engine.maxHp(s)); assert.equal(s.player.flasks, engine.maxFlasks(s)); assert.equal(s.restCount, 1);
      await context.close();
    });
    await run('sunken', async () => {
      const { page, context } = await open(fixture({ x: 8.4, y: 0, z: -6 }));
      await look(page, 0, 0.6); await advance(page, 2400, { x: 0, z: -1 });
      let s = await capture(page, 'sunken-descent'); assert.ok(s.player.y < -2.8); assert.equal(s.mode, 'playing');
      await advance(page, 2800, { x: 0, z: -1 }); s = await capture(page, 'sunken-court'); assert.equal(s.mode, 'playing'); assert.ok(s.player.z < -21);
      await advance(page, 4200, { x: 0, z: -1 }); s = await capture(page, 'sunken-market-ascent'); assert.equal(s.mode, 'playing'); assert.ok(s.player.y > -0.2); assert.ok(s.player.z < -36);
      await context.close();
    });
    await run('phase2', async () => {
      const { page, context } = await open(fixture({ x: 4, y: 0, z: -37.8 }, s => { const enemy = s.enemies.find(e => e.id === 'market-boss'); Object.assign(enemy, { hp: Math.floor(enemy.maxHp * 0.4), phase: 2, aggro: true, action: 'windup', attackIndex: 4, timer: 1.4, facing: 0 }); }));
      await advance(page, 1, { x: 0, z: 0, lock: true }); await look(page, 0, 0.5, 8);
      const s = await capture(page, 'harei-phase-two-delayed-strike');
      assert.equal(s.enemies.find(e => e.id === 'market-boss').phase, 2); assert.ok(s.enemyTells.some(e => e.id === 'market-boss'));
      await context.close();
    });
    assert.deepEqual(errors, []);
    passed = true;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, passed, checks, errors, evidence }, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
