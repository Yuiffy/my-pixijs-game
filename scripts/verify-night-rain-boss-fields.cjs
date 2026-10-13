const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4061';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-boss-fields-browser';

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const { supportAt } = await load('src/components/nightRain/world.ts');
  const scenarios = [
    {name:'pine',id:'market-boss',index:2,ms:1500},
    {name:'shield',id:'nana-tide',index:1,ms:600},
    {name:'drones',id:'azi-stage',index:2,ms:1200},
    {name:'leap',id:'gate-captain',index:1,ms:600},
    {name:'freeze',id:'rain-regent',index:1,ms:1800},
    {name:'counter',id:'drowned-warden',index:1,ms:600},
    {name:'song',id:'silent-abbot',index:1,ms:1200},
    {name:'beam',id:'river-serpent',index:1,ms:1500},
    {name:'dragon',id:'last-lamplighter',index:1,ms:1400},
    {name:'quake',id:'crypt-colossus',index:2,ms:1400},
    {name:'gust',id:'cave-sentinel',index:2,ms:1100},
    {name:'pine-mobile',id:'market-boss',index:2,ms:1500,width:390},
  ];
  const errors = []; const evidence = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NIGHT_RAIN_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const scenario of scenarios) {
      const state = engine.createGame(); engine.startGame(state);
      const enemy = state.enemies.find(e => e.id === scenario.id);
      const y = enemy.y;
      Object.assign(enemy, { facing: 0, action: 'windup', timer: .15, attackIndex: scenario.index, phase: 2, aggro: true });
      const distance = ['crypt-colossus', 'cave-sentinel'].includes(scenario.id) ? 5.5 : 3;
      const p = { x: enemy.x, z: enemy.z + distance, y: supportAt(enemy.x, enemy.z + distance, y + .6) };
      Object.assign(state.player, p, { facing: Math.PI, lastGround: p, fallPeak: p.y });
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
      await page.evaluate(ms => window.advanceTime(ms), scenario.ms);
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(500);
      const snapshot = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      assert.ok(snapshot.bossFields.some(f => f.owner === scenario.id) || snapshot.projectiles.some(b => b.owner === scenario.id),scenario.name+' live cast');
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
