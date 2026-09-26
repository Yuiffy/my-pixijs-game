const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3870';
const output = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-journey';
fs.mkdirSync(output, { recursive: true });
const evidence = []; const errors = []; const stages = [];
const state = page => page.evaluate(() => window.nightRain.getState());
const text = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(page, name) {
  await page.waitForTimeout(400);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const snapshot = await text(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth, canvases: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })), dom: document.body.innerText }));
  assert.equal(layout.canvases.length, 1); assert.ok(layout.canvases[0].width > 0); assert.ok(layout.scroll <= layout.width);
  const file = path.join(output, `${name}.png`); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: "disabled" }));
  fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify({ snapshot, layout, pixels }, null, 2));
  evidence.push({ name, file, pixels, region: snapshot.region }); console.log(`capture ${name}: ${snapshot.region}`);
}
async function walk(page, target) {
  const result = await page.evaluate(target => {
    let ms = 0;
    while (ms < 90000) {
      const s = window.nightRain.getState();
      const combat = s.enemies.some(e => e.hp > 0 && e.aggro && !(target.ignoreBoss && e.kind === 'boss') && Math.abs(e.y - s.player.y) < 1.5 && Math.hypot(e.x - s.player.x, e.z - s.player.z) < 8);
      if (Math.hypot(s.player.x - target.x, s.player.z - target.z) < 0.22 && !combat && s.player.action === 'idle') return { ok: true, time: s.time, hp: s.player.hp, region: s.region };
      if (s.mode !== 'playing') return { ok: false, state: s, target };
      window.nightRain.input(window.nightRainPilot.chooseInput(s, target)); window.advanceTime(40); ms += 40;
    }
    return { ok: false, state: window.nightRain.getState(), target };
  }, target);
  assert.ok(result.ok, JSON.stringify(result)); stages.push({ target, ...result });
}
async function press(page, key) { await page.keyboard.press(key); await page.evaluate(() => window.advanceTime(40)); }
async function main() {
  assert.equal((await fetch(`${base}/game/night-rain`)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await context.addInitScript(installVirtualPointerLock); const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '出门找夜宵', exact: true }).click();
    const pilot = fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs', 'utf8').replaceAll('export ', '');
    await page.addScriptTag({ content: `${pilot}\nwindow.nightRainPilot = { chooseInput, NIGHT_ROUTE };` });
    await press(page, 'e');
    await press(page, 'c');
    await page.getByRole('button', { name: '🦦 獭獭栞', exact: true }).click();
    await capture(page, '01-companion-dialog');
    await page.getByRole('button', { name: '直接带我去 · 中庭雨灯', exact: true }).click();
    await page.evaluate(() => window.advanceTime(3000));
    assert.equal((await text(page)).companion.status, 'waiting');
    await capture(page, '02-otter-waits');
    // Follow the NPC's current position; do not know its path or move its body.
    const following = await page.evaluate(() => {
      let ticks = 0;
      while (ticks++ < 12000) {
        const s = window.nightRain.getState(); const c = JSON.parse(window.render_game_to_text()).companion;
        if (c.status === 'arrived') return { ok: true, ticks };
        if (s.mode !== 'playing') return { ok: false, s };
        window.nightRain.input(window.nightRainPilot.chooseInput(s, c.position)); window.advanceTime(40);
      }
      return { ok: false, state: JSON.parse(window.render_game_to_text()) };
    });
    assert.ok(following.ok, JSON.stringify(following));
    await capture(page, '03-arrive-rain-lamp'); await press(page, 'e');
    assert.equal((await state(page)).checkpoint, 'courtyard');
    await press(page, 'c'); await page.getByRole('button', { name: '先不带路，我们随便逛逛', exact: true }).click();
    const route = await page.evaluate(() => window.nightRainPilot.NIGHT_ROUTE);
    for (let i = 7; i < route.length; i++) {
      const target = route[i]; await walk(page, target);
      if (i === 9) {
        await page.evaluate(() => window.advanceTime(16000));
        await walk(page, { x: -8, z: 2 });
        await page.evaluate(() => window.advanceTime(16000));
        assert.match((await text(page)).companion.subtitle, /错过/);
        await capture(page, 'hint-01-missed-branch');
        await press(page, 'c');
        await page.getByRole('button', { name: '直接带我去 · 晾衣巷的钱袋', exact: true }).click();
        assert.equal((await text(page)).companion.targetId, 'alley-cache');
        await capture(page, 'hint-02-accepted-help');
      }
      if (target.interact === 'rooftop-note') {
        await press(page, 'c'); await page.getByLabel('宝宝模式 有人陪你探索与认路').uncheck(); await page.getByRole('button', {name:'关闭',exact:true}).click();
        await press(page, 'e'); assert.equal((await state(page)).messageKind, 'lore'); assert.match(await page.locator('[data-narrative="lore"]').innerText(), /逐水向东/); assert.doesNotMatch(await page.locator('main').innerText(), /运河侧廊有一扇门|从里面能打开/);
        await capture(page, '06b-rooftop-lore');
        await press(page, 'c'); await page.getByLabel('宝宝模式 有人陪你探索与认路').check(); await page.getByRole('button', {name:'关闭',exact:true}).click();
        await press(page, 'e'); assert.match((await text(page)).companion.subtitle, /运河侧廊/); await capture(page, '06c-rooftop-interpretation');
      }
      if (target.interact) {
        await capture(page, `route-${i}-${target.interact}`);
        await press(page, 'e');
        if (target.interact === 'shortcut') assert.ok((await state(page)).shortcut);
      }
      if (i === 12) {
        for (const p of [{ x: -15.5, z: -13 }, { x: -11, z: -13 }, { x: -6, z: -14.5 }]) await walk(page, p);
        await press(page, 'c'); await page.getByLabel('宝宝模式 有人陪你探索与认路').uncheck(); await page.getByRole('button', {name:'关闭',exact:true}).click();
        await press(page, 'e'); assert.equal((await state(page)).messageKind, 'event'); assert.equal(await page.locator('[data-narrative="event"]').innerText(), '旧铜钱 ×35'); assert.doesNotMatch(await page.locator('main').innerText(), /不用原路返回|矮阶通回/);
        await capture(page, '04-cloister-chest');
        await press(page, 'c'); await page.getByLabel('宝宝模式 有人陪你探索与认路').check(); await page.getByRole('button', {name:'关闭',exact:true}).click();
        assert.ok((await state(page)).collected.includes('cloister-cache'));
        // Descend the new inner loop back to courtyard and climb back to the fork.
        for (const p of [{ x: -6, z: -11 }, { x: -6, z: -5.3 }, { x: -8, z: -5 }, { x: -15.5, z: -5 }, { x: -15.5, z: -13 }]) await walk(page, p);
        await capture(page, '05-inner-loop');
      }
      if (i === 14) {
        for (const p of [{ x: -14, z: -23 }, { x: -14, z: -28.5 }]) await walk(page, p);
        await capture(page, '06-lookout-chest'); await press(page, 'e');
        assert.ok((await state(page)).collected.includes('lookout-cache')); assert.match((await text(page)).companion.subtitle, /挑战首领前/); await capture(page, '06a-chest-interpretation');
        await walk(page, { x: -14, z: -23 });
      }
      if (target.upgrade) { await page.keyboard.down('Alt'); await page.getByRole('button', { name: /整备 ·/ }).click(); assert.equal((await state(page)).level, 1); await page.keyboard.up('Alt'); }
      if (i === 36) await capture(page, '07-market-approach');
    }
    assert.equal((await state(page)).mode, 'ending'); await capture(page, '08-dinner-ending');
    const ended = await state(page); assert.ok(ended.bossDefeated && ended.shortcut && ended.charm); assert.ok(ended.parries > 0 && ended.executions > 0);
    await page.evaluate(() => window.nightRain.save()); await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    const restored = await state(page); assert.equal(restored.mode, 'ending'); assert.deepEqual(restored.collected, ended.collected);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ base, evidence, errors, stages, following, final: ended, restored: restored.mode }, null, 2));
    console.log('First act completed through legal input, both optional loops, guide following, boss, dinner and ending reload.');
  } finally { await browser.close(); }
}
main().catch(e => { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: e.stack, evidence, errors, stages }, null, 2)); console.error(e); process.exitCode = 1; });
