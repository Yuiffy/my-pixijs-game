const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
let playwright;
for (const location of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(location); break; } catch { /* Try the next runtime. */ }
}
const base = process.env.ONE_MORE_URL || 'http://127.0.0.1:3821';
const directory = 'artifacts/one-more-mechanics';
mkdirSync(directory, { recursive: true });

(async () => {
  assert.equal((await fetch(`${base}/game/one-more`)).status, 200);
  const { pilotInputs, playFight } = await import('./tests/helpers/one-more-pilot.mjs');
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const { Sparring } = await loadTypescriptModule('src/components/oneMoreGame/core.ts');
  const game = new Sparring();
  const saves = [];
  for (let index = 0; index < 3; index += 1) {
    saves.push(JSON.stringify(game.progress));
    game.start(); playFight(game);
    assert.ok(['won', 'ending'].includes(game.state.phase));
    if (index < 2) game.nextBoss();
  }
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const errors = [];
  const captures = [];
  let page;
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const step = ms => page.evaluate(value => window.advanceTime(value), ms);
  const shot = async name => {
    await page.waitForTimeout(180);
    const file = join(directory, `${name}.png`);
    const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
    const geometry = await page.evaluate(() => {
      const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const stamina = document.querySelector('[aria-label="体力状态"]');
      const meter = document.querySelector('[role="meter"][aria-label="体力"]');
      const controls = [...document.querySelectorAll('[aria-label="战斗操作"] button')];
      const resources = document.querySelector('[aria-label="岁己状态"]');
      const blood = document.querySelector('[class*="spiritTrack"] i');
      const hud = [...document.querySelectorAll('[class*="bossHealth"], [class*="fightMeta"], [class*="moveName"], [class*="parryFeedback"]')];
      const boxes = [resources, ...hud, ...controls].map(rect);
      const overlap = boxes.some((a, i) => boxes.slice(i + 1).some(b => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y));
      const canvas = document.querySelector('canvas');
      return { boxes, overlap, topLeft: resources.contains(stamina) && rect(resources).x < innerWidth / 2 && rect(stamina).bottom < innerHeight / 2,
        bloodColor: getComputedStyle(blood).backgroundColor, meter: rect(meter), meterValue: Number(meter.getAttribute('aria-valuenow')), stamina: stamina.textContent, overflow: document.documentElement.scrollWidth > innerWidth,
        inside: boxes.every(r => r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight), canvas: { ...rect(canvas), backingWidth: canvas.width, backingHeight: canvas.height } };
    });
    const snapshot = await state();
    assert.equal(geometry.overlap, false, JSON.stringify({ name, boxes: geometry.boxes })); assert.equal(geometry.overflow, false, name); assert.equal(geometry.inside, true, name);
    assert.equal(geometry.topLeft, true, `Player resources stay together: ${name}`);
    const [red, green, blue] = geometry.bloodColor.match(/\d+/g).map(Number);
    assert.ok(red > green * 1.5 && red > blue, `Enemy health is red: ${name}`);
    assert.ok(geometry.meter.height >= 12, name); assert.equal(geometry.meterValue, Math.floor(snapshot.player.stamina));
    assert.ok(geometry.canvas.backingWidth > 0 && geometry.canvas.backingHeight > 0);
    captures.push({ name, file, pixels, geometry, state: snapshot });
  };
  const openBoss = async index => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    await context.addInitScript(({ save, decision }) => {
      localStorage.setItem('sui-sparring-v2', save);
      window.__decision = (0, eval)(`(${decision})`);
      window.__held = new Set();
      window.__input = (action, down) => {
        if (window.__held.has(action) === down) return;
        if (down) window.__held.add(action); else window.__held.delete(action);
        const code = window.suiSparring.snapshot().bindings[action];
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      };
      window.__release = () => { for (const action of [...window.__held]) window.__input(action, false); };
    }, { save: saves[index], decision: pilotInputs.toString() });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/game/one-more`);
    await page.getByRole('button', { name: '请赐教' }).waitFor({ timeout: 60000 });
    await step(0); await page.getByRole('button', { name: '请赐教' }).click(); await step(0);
    assert.equal((await state()).campaign.bossIndex, index);
    return context;
  };
  const until = async (predicate, stationary = false) => {
    const result = await page.evaluate(({ source, stationary }) => {
      const condition = (0, eval)(`(${source})`);
      for (let i = 0; i < 18000; i += 1) {
        const s = window.suiSparring.snapshot();
        if (condition(s)) { window.__release(); return s; }
        if (s.phase !== 'fight') break;
        for (const [action, down] of Object.entries(window.__decision(s))) window.__input(action, stationary && ['left', 'right', 'attack'].includes(action) ? false : down);
        window.advanceTime(10);
      }
      throw new Error(`Unreached scenario: ${source} / ${window.render_game_to_text()}`);
    }, { source: predicate.toString(), stationary });
    return result;
  };
  try {
    let context = await openBoss(0);
    const denied = await page.evaluate(() => {
      window.__input('attack', true); window.__input('left', true);
      for (let i = 0; i < 1000; i += 1) {
        window.advanceTime(10);
        const s = window.suiSparring.snapshot();
        if (s.player.stamina < s.player.dodgeCost && s.t - s.player.attackAt > 200 && s.t >= s.player.stunUntil) break;
      }
      window.__release(); window.__input('dodge', true); window.__input('dodge', false); window.advanceTime(0);
      return window.suiSparring.snapshot();
    });
    assert.equal(denied.denial.reason, 'stamina'); assert.equal(denied.denial.action, 'dodge');
    await page.getByText('体力不足 · 无法闪避', { exact: true }).waitFor();
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844], ['small', 320, 568], ['landscape', 844, 390]]) {
      await page.setViewportSize({ width, height }); await shot(`stamina-${name}`);
    }
    await step(1400);
    assert.equal((await state()).denial, null);
    const button = page.getByRole('button', { name: '闪避', exact: true });
    const lastDash = (await state()).player.dashAt;
    const box = await button.boundingBox();
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await step(20); await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state()).player.dashAt > lastDash, 'A recovered action works again');
    await context.close();

    context = await openBoss(1);
    await until(s => s.projectiles.some(bell => !bell.reflected && Math.abs(bell.x - s.player.x) > 100 && Math.abs(bell.x - s.player.x) < 240), true);
    await shot('keeper-flight');
    const reflected = await until(s => s.projectiles.some(bell => bell.reflected), true);
    await step(220);
    await shot('keeper-reflection');
    const returned = await until(s => s.boss.mode === 'stagger');
    assert.ok(returned.boss.spirit < reflected.boss.spirit); await shot('keeper-return-impact');
    await until(s => s.boss.move === 'bellCrash' && s.boss.mode === 'windup' && s.boss.clock > 1800);
    await shot('keeper-ward');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('keeper-ward-mobile');
    await context.close();

    context = await openBoss(2);
    await until(s => s.boss.move === 'crossCut' && s.boss.mode === 'windup' && s.boss.clock > 820);
    await shot('master-rush');
    await until(s => s.boss.move === 'finalChain' && s.boss.mode === 'windup' && s.boss.hitIndex > 0 && s.boss.clock - s.boss.attack.hits[s.boss.hitIndex - 1] > 190 && s.boss.clock - s.boss.attack.hits[s.boss.hitIndex - 1] < 340);
    await shot('master-spin');
    await until(s => s.boss.elevation > 155); await shot('master-leap');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('master-leap-mobile');
    await page.setViewportSize({ width: 320, height: 568 }); await shot('master-leap-small');
    await page.setViewportSize({ width: 844, height: 390 }); await shot('master-leap-landscape');
    await until(s => s.phase === 'ending');
    await context.close();
    assert.deepEqual(errors, []);
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: true, errors, captures }, null, 2));
    console.log(JSON.stringify({ passed: true, captures: captures.map(item => item.file) }, null, 2));
  } catch (error) {
    writeFileSync(join(directory, 'failure.json'), JSON.stringify({ message: error.message, errors, captures }, null, 2));
    if (page && !page.isClosed()) await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
