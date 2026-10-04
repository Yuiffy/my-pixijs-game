const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3966';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-character-browser';
const portraitsOnly = process.env.NIGHT_RAIN_CHARACTER_MODE === 'portraits';
const worldOnly = process.env.NIGHT_RAIN_CHARACTER_MODE === 'world';
const errors = [], evidence = [];
const snapshot = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function step(p, ms, input = {}) {
  await p.evaluate(({ ms, input }) => { window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function capture(p, name) {
  const layout = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvases: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, label: c.closest('[aria-label]')?.getAttribute('aria-label') })), dom: document.body.innerText }));
  assert.ok(layout.scroll <= layout.width, 'Horizontal overflow');
  assert.ok(layout.canvases.length && layout.canvases.every(c => c.width > 0 && c.height > 0));
  const file = path.join(out, name + '.png');
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true }));
  const state = await snapshot(p);
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ state, layout, pixels }, null, 2));
  evidence.push({ file, pixels });
  return state;
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const e = await load('src/components/nightRain/engine.ts');
  const { isBoss } = await load('src/components/nightRain/encounters.ts');
  const seed = e.loadGame(fs.readFileSync('scripts/tests/fixtures/night-rain-valley-v6.json', 'utf8'));
  assert.ok(seed); seed.mode = 'playing'; seed.paused = false;
  Object.assign(seed.player, { x: 0, y: 0, z: 8, facing: 0, lastGround: { x: 0, y: 0, z: 8 } });
  const bosses = seed.enemies.filter(isBoss);
  const index = bosses.map(foe => ({ id: foe.id, kind: foe.kind, name: foe.name }));
  for (const foe of bosses) { foe.hp = 0; foe.action = 'dead'; }
  seed.bossDefeated = true; seed.defeatedGuests = bosses.filter(foe => foe.kind !== 'boss').map(foe => foe.id);
  seed.bestiary = bosses.map(foe => `boss:${foe.kind}`); seed.kills = bosses.length;
  seed.haven.recruits = ['scribe', 'boatwright']; seed.haven.echoes = 3; seed.haven.gates = ['well-door'];
  seed.collected = [...new Set([...seed.collected, 'names-register', 'keel-rubbing'])];
  assert.ok(e.loadGame(e.saveGame(seed)), 'Portrait fixture must be a valid save');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  async function open(state, width = 1440) {
    const save = e.saveGame(state); assert.ok(e.loadGame(save));
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 } });
    await ctx.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.addInitScript(installVirtualPointerLock);
    await ctx.addInitScript(save => { localStorage.setItem('night-rain-v1-slot-1', save); localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false })); localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true })); if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {}; }, save);
    const p = await ctx.newPage();
    p.on('pageerror', error => errors.push(error.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.nightRain && !document.querySelector('[data-game-primary]')?.disabled);
    await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await step(p, 0); await p.mouse.wheel(0, -1000); await p.waitForTimeout(150); await step(p, 100);
    return { p, ctx };
  }
  try {
    if (!worldOnly) {
    const { p, ctx } = await open(seed);
    await p.keyboard.press('p'); await p.getByRole('button', { name: '雨夜图鉴 · 击败后收录', exact: true }).click();
    for (const foe of index) {
      await p.getByRole('button', { name: foe.name, exact: true }).click();
      await p.getByLabel(foe.name + '模型', { exact: true }).locator('canvas').waitFor({ state: 'visible' });
      await p.waitForTimeout(250); await p.locator('article').scrollIntoViewIfNeeded(); await capture(p, 'portrait-' + foe.kind);
    }
    await ctx.close();
    for (const skin of ['sui', 'shiori', 'nagisa']) {
      const state = structuredClone(seed); state.playerSkin = skin;
      const { p, ctx } = await open(state); await capture(p, 'player-' + skin);
      if (!portraitsOnly) {
        await step(p, 450, { heavy: true }); assert.equal((await snapshot(p)).player.action, 'heavy'); await capture(p, 'player-' + skin + '-heavy');
        await step(p, 1600); await step(p, 200, { dodge: true }); assert.equal((await snapshot(p)).player.action, 'dodge'); await capture(p, 'player-' + skin + '-roll');
      }
      await ctx.close();
    }
    }
    if (!portraitsOnly) {
      for (const kind of ['boss', 'captain', 'regent', 'warden', 'abbot', 'serpent', 'elegist', 'colossus']) {
        const state = e.createGame(); e.startGame(state); const fresh = state.enemies.find(foe => foe.kind === kind);
        const distance = kind === 'colossus' ? 6.5 : 3.6;
        Object.assign(state.player, { x: fresh.x, y: fresh.y, z: fresh.z + distance, facing: Math.PI, lastGround: { x: fresh.x, y: fresh.y, z: fresh.z + distance }, fallPeak: fresh.y });
        const { p, ctx } = await open(state);
        await p.keyboard.press('q'); await p.evaluate(() => window.advanceTime(40));
        await p.mouse.wheel(0, 900); await p.waitForTimeout(400); await step(p, 100);
        const live = await capture(p, 'world-' + kind);
        assert.equal(live.lockedId, fresh.id);
        assert.ok(live.enemies.some(foe => foe.kind === kind && foe.hp > 0)); await ctx.close();
      }
      if (!worldOnly) {
      const mobile = await open(seed, 390); await mobile.p.keyboard.press('p'); await mobile.p.getByRole('button', { name: '雨夜图鉴 · 击败后收录', exact: true }).click();
      for (const kind of ['warden', 'regent', 'serpent']) {
        const foe = index.find(foe => foe.kind === kind); await mobile.p.getByRole('button', { name: foe.name, exact: true }).click();
        await mobile.p.waitForTimeout(400); await mobile.p.locator('article').scrollIntoViewIfNeeded(); await capture(mobile.p, 'mobile-' + kind);
      }
      await mobile.ctx.close();
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, index, portraitsOnly, worldOnly, errors, evidence }, null, 2));
    console.log(JSON.stringify({ screenshots: evidence.length, namedEnemies: index.length, playerSkins: worldOnly ? 0 : 3, errors, out }));
  } finally { await browser.close(); }
}
main().catch(error => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack, errors, evidence }, null, 2)); console.error(error); process.exitCode = 1; });
