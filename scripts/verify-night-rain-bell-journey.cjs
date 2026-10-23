const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4126';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-bell-journey';
async function main() {
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const { engine, skyCompleted, world, BELL_ROUTE } = await import('./tests/helpers/night-rain-bell.mjs');
  const { chooseInput } = await import('./tests/helpers/night-rain-pilot.mjs');
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const guide = await load('src/components/nightRain/companion.ts');
  const weapons = await load('src/components/nightRain/weapons.ts');
  const saveState = skyCompleted(); const save = engine.saveGame(saveState); assert.ok(engine.loadGame(save));
  const attackTable = Object.fromEntries(saveState.enemies.map(e => [e.id, [1, 2].map(phase => [0, 1, 2].map(attackIndex => engine.enemyAttack({ ...e, phase, attackIndex })))]));
  const swingTable = Object.fromEntries(['light1', 'heavy'].map(id => [id, weapons.weaponAttack(saveState, id)]));
  const evidence = []; const stages = []; const errors = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NIGHT_RAIN_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await ctx.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await ctx.addInitScript(installVirtualPointerLock);
  await ctx.addInitScript(save => {
    if (!localStorage.getItem('night-rain-v1-slot-1')) localStorage.setItem('night-rain-v1-slot-1', save);
    localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
    localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
    if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
  }, save);
  // The pilot observes copies and emits normal inputs. Tables contain immutable
  // attack definitions from the same source; no production state is overwritten.
  await ctx.addInitScript({ content: `const attackTable=${JSON.stringify(attackTable)};const swingTable=${JSON.stringify(swingTable)};const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);const enemyAttack=e=>attackTable[e.id][e.phase-1][e.attackIndex%3];const weaponAttack=(s,id)=>swingTable[id];window.bellPilot=${chooseInput.toString()};` });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => window.nightRain.getState());
  const advance = action => page.evaluate(action => { window.nightRain.input({ x: 0, z: 0, ...action }); window.advanceTime(40); }, action);
  async function capture(name) {
    if (name !== '02-lamp-earned') await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).presentation);
    await page.waitForTimeout(300);
    const text = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const layout = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), width: innerWidth, scroll: document.documentElement.scrollWidth, text: document.body.innerText }));
    assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0] > 0); assert.ok(layout.scroll <= layout.width);
    const file = path.join(out, name + '.png'); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
    evidence.push({ file, pixels }); fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ text, layout, pixels }, null, 2));
  }
  async function walk(point, captureBoss = false) {
    let detours = 0;
    for (let loops = 0; loops < 50; loops++) {
      const result = await page.evaluate(({ point, captureBoss }) => {
        let blocked = 0;
        for (let ms = 0; ms < 10000; ms += 40) {
          const s = window.nightRain.getState(); const p = s.player;
          if (s.mode !== 'playing') return { bad: true, s };
          const live = s.enemies.filter(e => e.hp > 0 && e.aggro && Math.abs(e.y - p.y) < 1.5 && Math.hypot(e.x - p.x, e.z - p.z) < 8);
          if (captureBoss && live.some(e => e.kind === 'bellkeeper' && e.action === 'windup')) return { pose: true };
          if (Math.hypot(p.x - point.x, p.z - point.z) < .22 && !live.length && p.action === 'idle') return { ok: true };
          window.nightRain.input(window.bellPilot(s, point)); window.advanceTime(40);
          const next = window.nightRain.getState().player;
          blocked = !live.length && next.action === 'idle' && Math.hypot(next.x - p.x, next.z - p.z) < .01 ? blocked + 40 : 0;
          if (blocked > 600) return { blocked: true };
        }
        return { more: true };
      }, { point, captureBoss });
      if (result.ok) return;
      if (result.pose) { await capture('05-boss-earned'); captureBoss = false; }
      if (result.bad) throw new Error(JSON.stringify(result));
      if (result.blocked) {
        const s = await state(); assert.ok(detours++ < 3, `stuck ${JSON.stringify(s.player)}`);
        const route = guide.findPath(s.player, point, s); assert.ok(route.length);
        for (const p of route.slice(1)) await walk(p);
      }
    }
    throw new Error('Route exceeded five minutes: ' + JSON.stringify(point));
  }
  try {
    await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).waitFor();
    await page.evaluate(() => { window.advanceTime(0); window.__freeze = setInterval(() => window.advanceTime(0), 250); });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    for (const [x, z, id] of BELL_ROUTE) {
      await walk({ x, z, y: world.supportAt(x, z, 45) }, z === -866);
      if (!id) continue;
      await advance({ interact: true });
      if (id.endsWith('lamp')) {
        await advance({ interact: true });
        await page.getByRole('button', { name: '坐下休息 · 补满生命与药瓶', exact: true }).click();
        await page.keyboard.press('Escape');
      }
      const s = await state(); assert.ok(s.collected.includes(id) || s.litLamps.includes(id) || s.bellGates.includes(id), id + ': ' + s.message);
      assert.ok(engine.loadGame(engine.saveGame(s)), 'validated stage ' + id);
      stages.push({ id, time: s.time, hp: s.player.hp }); console.log(id);
      if (id === 'bell-entry') {
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('night-rain-v1-slot-1')));
        assert.ok(stored.bellGates.includes(id), 'gate is saved immediately');
        await capture('01-channel-open');
      }
      if (id === 'bell-porch-lamp') {
        await page.keyboard.press('p'); const t = (await state()).time;
        await page.evaluate(() => window.advanceTime(3000)); assert.equal((await state()).time, t);
        await page.keyboard.press('p'); await capture('02-lamp-earned');
      }
      if (id === 'bell-silence') await capture('03-branch-earned');
      if (id === 'bell-door') await capture('04-mirrors-earned');
      if (id === 'bell-heart') {
        await capture('06-finale-earned'); await page.waitForTimeout(6500); await capture('07-finale-return-pan');
        await page.getByRole('button', { name: '跳过演出，继续探索' }).click();
        assert.equal((await state()).mode, 'playing');
      }
    }
    const final = await state(); assert.equal(final.bellComplete, true); assert.equal(final.deaths, 0);
    assert.equal(final.bellGates.length, 3); assert.ok(final.collected.includes('bell-silence'));
    await page.evaluate(() => window.nightRain.save());
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.evaluate(() => { window.advanceTime(0); window.__freeze = setInterval(() => window.advanceTime(0), 250); });
    const restored = await state(); assert.equal(restored.bellComplete, true); assert.equal(restored.mode, 'playing'); assert.equal(restored.rice, final.rice);
    await capture('08-reload');
    const home = world.LANDMARKS.find(l => l.id === 'bell-home-lamp');
    await walk({ x: home.x + 1.2, y: home.y, z: home.z });
    await page.keyboard.press('m'); await page.getByRole('button', { name: '前往眺台雨灯', exact: true }).click(); await page.evaluate(() => window.advanceTime(0));
    assert.equal((await state()).checkpoint, 'bell-porch-lamp'); await capture('09-lamp-return');
    fs.writeFileSync(path.join(out, 'completed-save.json'), JSON.stringify(final, null, 2));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ evidence, stages, errors, input: 'Validated sky save followed by ordinary public movement, combat, E interaction and real lamp UI' }, null, 2)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
