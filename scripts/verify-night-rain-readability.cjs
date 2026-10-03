const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://localhost:3936';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-readability-browser';
const before = process.env.NIGHT_RAIN_BEFORE === '1';
const selected = process.env.NIGHT_RAIN_CAPTURES?.split(',');
fs.mkdirSync(out, { recursive: true });
const errors = [], evidence = [], cases = [];

async function main() {
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const { playFirstLevel, walkTo } = await import('./tests/helpers/night-rain-pilot.mjs');
  const { CHAPTER_ROUTE } = await import('./tests/helpers/night-rain-chapter-pilot.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const motion = await load('src/components/nightRain/enemyCombat.ts');
  const world = await load('src/components/nightRain/world.ts');
  const guide = await load('src/components/nightRain/companion.ts');
  const fixtures = {};
  const remember = (key, s, e) => {
    if (fixtures[key]) return;
    const save = engine.saveGame(s); assert.ok(engine.loadGame(save));
    fixtures[key] = { save, id: e.id };
  };
  const proxy = { ...engine, stepGame(s, ms, input) {
    engine.stepGame(s, ms, input);
    for (const e of s.enemies) if (e.aggro && e.action === 'windup' && s.player.action === 'idle' && e.timer > motion.enemyAttack(e).windup - .08) {
      remember(motion.enemyStyle(e), s, e);
      if (!motion.enemyAttack(e).parryable) remember('danger', s, e);
    }
  } };
  const { state: campaign } = playFirstLevel(proxy);
  engine.continueExploring(campaign);
  for (const target of CHAPTER_ROUTE) {
    const landmark = target.id ? world.LANDMARKS.find(l => l.id === target.id) : null;
    const destination = landmark ? world.interactionPoint(landmark) : target;
    const points = guide.findPath(campaign.player, destination, campaign); assert.ok(points.length);
    for (const point of points.slice(1)) walkTo(proxy, campaign, point, 180000);
    if (landmark) engine.interact(campaign);
    if (target.rest) engine.interact(campaign);
    if (target.upgrade) while (engine.upgrade(campaign)) {}
  }
  assert.deepEqual(['thrust', 'overhead', 'sweep', 'draw', 'shot'].filter(key => !fixtures[key]), []);
  for (const [key, fixture] of Object.entries(fixtures)) fs.writeFileSync(path.join(out, key + '-save.json'), fixture.save);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const advance = (page, ms, input = {}) => page.evaluate(({ ms, input }) => { window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });
  const state = page => page.evaluate(() => window.nightRain.getState());
  const capture = async (page, name) => {
    if (selected && !selected.includes(name)) return;
    await page.waitForTimeout(100);
    const text = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const layout = await page.evaluate(() => ({ dom: document.body.innerText, width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })) }));
    assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].width > 0); assert.ok(layout.scroll <= layout.width);
    const file = path.join(out, name + '.png');
    const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ text, layout, pixels }, null, 2));
    evidence.push({ file, pixels }); console.log('capture ' + name);
  };
  const open = async (fixture, viewport = { width: 1440, height: 900 }) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(installVirtualPointerLock);
    await page.addInitScript(save => {
      localStorage.setItem('night-rain-v1', save);
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
    }, fixture.save);
    await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0);
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.evaluate(() => { window.advanceTime(0); window.qaFreeze = setInterval(() => window.advanceTime(0), 50); });
    await page.waitForTimeout(900); return page;
  };
  try {
    for (const style of ['thrust', 'overhead', 'sweep', 'draw', 'shot', 'danger'].filter(key => fixtures[key])) {
      const fixture = fixtures[style]; const page = await open(fixture);
      let e = (await state(page)).enemies.find(e => e.id === fixture.id);
      const spec = motion.enemyAttack(e); const timing = motion.enemyTiming(e);
      if (e.timer > spec.windup - timing.raise - .07) await advance(page, (e.timer - (spec.windup - timing.raise - .07)) * 1000);
      await capture(page, style + '-loaded');
      if (before) { await page.close(); continue; }
      e = (await state(page)).enemies.find(e => e.id === fixture.id);
      const readout = await page.evaluate(id => JSON.parse(window.render_game_to_text()).enemyTells.find(e => e.id === id), fixture.id);
      assert.equal(readout.style, motion.enemyStyle(e)); assert.equal(readout.stage, 'hold'); assert.equal(readout.parryNow, false);
      if (style === 'draw') {
        await page.keyboard.press('Escape'); const paused = await state(page);
        await advance(page, 500); assert.deepEqual(await state(page), paused);
        await capture(page, 'draw-paused'); await page.keyboard.press('Escape');
        await advance(page, 400); await capture(page, 'draw-delayed-hold');
        assert.equal(motion.enemyTell((await state(page)).enemies.find(e => e.id === fixture.id)).parryNow, false);
      }
      e = (await state(page)).enemies.find(e => e.id === fixture.id);
      await advance(page, Math.max(0, e.timer - .11) * 1000);
      await capture(page, style + '-release');
      e = (await state(page)).enemies.find(e => e.id === fixture.id);
      assert.equal(e.action, 'windup'); assert.equal(motion.enemyTell(e).parryNow, spec.parryable);
      const facing = e.facing; const hp = (await state(page)).player.hp;
      await advance(page, (e.timer + motion.ENEMY_CONTACT_TIME + .018) * 1000);
      await capture(page, style + '-contact');
      e = (await state(page)).enemies.find(e => e.id === fixture.id);
      assert.equal(e.hitDone, true); assert.equal(e.facing, facing);
      cases.push({ style, damage: hp - (await state(page)).player.hp, cueToContact: .11 + motion.ENEMY_CONTACT_TIME, facing });
      await advance(page, 150); await capture(page, style + '-follow'); await page.close();
    }
    if (!before) {
      const fixture = fixtures.sweep; const page = await open(fixture);
      const e = (await state(page)).enemies.find(e => e.id === fixture.id);
      await advance(page, (e.timer - .11) * 1000); const hp = (await state(page)).player.hp;
      await advance(page, 215, { parry: true }); assert.ok((await state(page)).parries > JSON.parse(fixture.save).parries);
      assert.equal((await state(page)).player.hp, hp); await capture(page, 'cue-timed-parry'); await page.close();
      const mobile = await open(fixtures.overhead, { width: 390, height: 844 });
      const heavy = (await state(mobile)).enemies.find(e => e.id === fixtures.overhead.id);
      await advance(mobile, (heavy.timer - .11) * 1000); await capture(mobile, 'mobile-overhead-release'); await mobile.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, before, cases, evidence, errors }, null, 2)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
