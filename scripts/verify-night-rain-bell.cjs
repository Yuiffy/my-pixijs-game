const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4126';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-bell-visual';
(async () => {
  fs.mkdirSync(out, { recursive: true }); assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { engine, world, place, skyCompleted } = await import('./tests/helpers/night-rain-bell.mjs');
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const { castBossSkill } = await load('src/components/nightRain/bossFields.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const report = { evidence: [], errors: [] };
  const scenarios = [
    { name: '01-arrival', p: [-44, 40, -726], yaw: 0, pitch: .32 },
    { name: '02-porch-vista', p: [-44, 28, -761], yaw: 0, pitch: .18 },
    { name: '03-west-descent', p: [-78, 26.3, -778], yaw: -.45, pitch: .5 },
    { name: '04-lower-bells', p: [-83, 16, -819], yaw: 2.1, pitch: .35 },
    { name: '05-scriptorium', p: [-110, 16, -815], yaw: -2.4, pitch: .35 },
    { name: '06-rising-stair', p: [-50, 28, -828], yaw: 0, pitch: .3 },
    { name: '07-high-return', p: [-20, 34, -808], yaw: Math.PI, pitch: .4 },
    { name: '08-chapel-entry', p: [-44, 34, -848], yaw: 0, pitch: .22 },
    { name: '09-three-resonances', p: [-44, 34, -858], yaw: -.8, pitch: .7, field: true },
    { name: '10-morning', p: [-44, 34, -889], yaw: 0, pitch: .25, ending: true },
    { name: '11-ending', p: [-44, 34, -894], ending: true, cinema: true },
    { name: '12-mobile', p: [-44, 34, -848], yaw: 0, pitch: .3, width: 390 },
    { name: '13-mobile-320', p: [-20, 34, -808], yaw: 0, pitch: .3, width: 320 },
    { name: '14-reduced-ending', p: [-44, 34, -894], ending: true, cinema: true, reduced: true },
  ];
  try {
    for (const scenario of scenarios) {
      const s = skyCompleted(); s.bellGates = ['bell-entry'];
      if (scenario.p[2] < -810 || scenario.name.includes('return') || scenario.width === 320) { s.bellGates.push('bell-return', 'bell-door'); s.collected.push('bell-clapper'); }
      if (scenario.ending) { s.collected.push('bell-heart'); s.bellComplete = true; s.defeatedGuests.push('bell-keeper'); Object.assign(s.enemies.find(e => e.id === 'bell-keeper'), { hp: 0, action: 'dead' }); }
      place(s, { x: scenario.p[0], y: world.supportAt(scenario.p[0], scenario.p[2], scenario.p[1] + .5), z: scenario.p[2] });
      if (scenario.field) { const e = s.enemies.find(e => e.id === 'bell-keeper'); Object.assign(e, { phase: 2, attackIndex: 2, aggro: true }); castBossSkill(s, e); s.bossFields.forEach(f => { f.age = 1.2; }); }
      if (scenario.cinema) s.mode = 'interlude';
      const save = engine.saveGame(s); assert.ok(engine.loadGame(save), scenario.name + ' valid save');
      const ctx = await browser.newContext({ viewport: { width: scenario.width || 1440, height: scenario.width ? 844 : 900 }, reducedMotion: scenario.reduced ? 'reduce' : 'no-preference' });
      await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
      await ctx.addInitScript(installVirtualPointerLock);
      await ctx.addInitScript(save => {
        localStorage.setItem('night-rain-v1-slot-1', save); localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false })); localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
        if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      }, save);
      const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push(e.stack)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.advanceTime(0); window.__freeze = setInterval(() => window.advanceTime(0), 250); });
      await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      if (!scenario.cinema) await page.evaluate(({ yaw, pitch }) => {
        const s = JSON.parse(window.render_game_to_text()); document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: (s.camera.yaw - yaw) / .003, movementY: (pitch - s.camera.pitch) / .003 }));
      }, scenario);
      await page.waitForTimeout(600);
      const capture = async name => {
        const state = await page.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), width: innerWidth, scroll: document.documentElement.scrollWidth, dom: document.body.innerText }));
        assert.equal(state.canvas.length, 1); assert.ok(state.canvas[0][0] > 100); assert.ok(state.scroll <= state.width); assert.ok(Math.abs(state.state.player.z - scenario.p[2]) < .1);
        const file = path.join(out, name + '.png'); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
        fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ ...state, pixels }, null, 2)); report.evidence.push({ file, pixels });
      };
      await capture(scenario.name);
      if (scenario.width) { await page.keyboard.press('m'); await page.getByRole('button', { name: '沉钟修道院', exact: true }).click(); await capture(scenario.name + '-map'); }
      if (scenario.cinema) { await page.getByRole('button', { name: '跳过演出，继续探索' }).click(); assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode), 'playing'); }
      await ctx.close(); console.log(scenario.name);
    }
    assert.deepEqual(report.errors, []);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
