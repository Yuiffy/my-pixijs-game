const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://localhost:3924';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-chapter-browser';
const evidence = []; const errors = []; const stages = []; const performanceSamples = []; const fights = new Set();
fs.mkdirSync(out, { recursive: true });
const state = p => p.evaluate(() => window.nightRain.getState());
const advance = (p, ms, action = {}) => p.evaluate(({ ms, action }) => { window.nightRain.input({ x: 0, z: 0, ...action }); window.advanceTime(ms); }, { ms, action });

async function capture(page, name) {
  if (!name.endsWith('windup')) await page.evaluate(() => window.nightRain.resetCamera());
  await page.waitForTimeout(350);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const text = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })), dom: document.body.innerText }));
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].width > 0); assert.ok(layout.scroll <= layout.width);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ text, layout, pixels }, null, 2));
  evidence.push({ name, file, pixels, region: text.region }); console.log(`capture ${name}: ${text.region}`);
}

async function walk(page, point) {
  for (;;) {
    const result = await page.evaluate(({ point, captured }) => {
      for (let ms = 0; ms < 180000; ms += 40) {
        const s = window.nightRain.getState();
        const live = s.enemies.filter(e => e.hp > 0 && e.aggro && !(point.ignoreBoss && e.kind === 'boss') && Math.abs(e.y - s.player.y) < 1.5 && Math.hypot(e.x - s.player.x, e.z - s.player.z) < 8);
        const pose = live.find(e => ['captain', 'regent'].includes(e.kind) && e.action === 'windup' && !captured.includes(e.kind));
        if (pose) return { capture: pose.kind };
        if (Math.hypot(s.player.x - point.x, s.player.z - point.z) < .22 && !live.length && s.player.action === 'idle') return { ok: true };
        if (s.mode !== 'playing') return { ok: false, s, point };
        window.nightRain.input(window.nightRainPilot.chooseInput(s, point)); window.advanceTime(40);
      }
      return { ok: false, s: window.nightRain.getState(), point };
    }, { point, captured: [...fights] });
    if (result.capture) { fights.add(result.capture); await capture(page, `${result.capture}-windup`); continue; }
    assert.ok(result.ok, JSON.stringify(result)); return;
  }
}

async function install(page) {
  await page.addInitScript(installVirtualPointerLock);
  await page.addInitScript(() => { if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {}; localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false })); });
  await page.addInitScript(() => {
    window.nightRainDrawCalls = 0;
    for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const draw = Type.prototype[name]; if (!draw) continue;
        Type.prototype[name] = function (...args) { window.nightRainDrawCalls++; return draw.apply(this, args); };
      }
    }
  });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0);
  const pilot = fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs', 'utf8').replaceAll('export ', '');
  await page.addScriptTag({ content: `${pilot}\nwindow.nightRainPilot={chooseInput,NIGHT_ROUTE};` });
}

async function samplePerformance(page, name) {
  const result = await page.evaluate(async () => {
    const times = [], calls = []; let previous = performance.now(); let count = window.nightRainDrawCalls;
    for (let i = 0; i < 150; i++) {
      window.advanceTime(0);
      const now = await new Promise(r => requestAnimationFrame(r));
      if (i > 29) { times.push(now - previous); calls.push(window.nightRainDrawCalls - count); }
      previous = now; count = window.nightRainDrawCalls;
    }
    const gl = document.querySelector('canvas').getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    times.sort((a, b) => a - b); calls.sort((a, b) => a - b);
    return { frames: times.length, medianMs: times[60], p95Ms: times[114], medianDrawCalls: calls[60], renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', viewport: [innerWidth, innerHeight] };
  });
  performanceSamples.push({ name, ...result });
}

async function main() {
  assert.equal((await fetch(`${base}/game/night-rain`)).status, 200);
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const { CHAPTER_ROUTE } = await import('./tests/helpers/night-rain-chapter-pilot.mjs');
  const { NIGHT_ROUTE } = await import('./tests/helpers/night-rain-pilot.mjs');
  const world = await loadTypescriptModule('src/components/nightRain/world.ts');
  const guide = await loadTypescriptModule('src/components/nightRain/companion.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await install(page); await capture(page, 'chapter-title');
    await page.getByRole('button', { name: '出门找夜宵', exact: true }).click();
    await advance(page, 0);
    for (const target of NIGHT_ROUTE) {
      await walk(page, target);
      if (target.interact) await advance(page, 40, { interact: true });
      if (target.upgrade) await page.getByRole('button', { name: /强化装备/ }).click();
    }
    assert.equal((await state(page)).mode, 'ending'); await capture(page, 'market-interlude');
    await page.getByRole('button', { name: '继续探索旧城', exact: true }).click();
    for (const target of CHAPTER_ROUTE) {
      const s = await state(page); const l = target.id ? world.LANDMARKS.find(l => l.id === target.id) : null;
      const dest = l ? world.interactionPoint(l) : target; const route = guide.findPath(s.player, dest, s);
      assert.ok(route.length, `route ${JSON.stringify(target)}`);
      for (const p of route.slice(1)) await walk(page, p);
      if (l) await advance(page, 40, { interact: true });
      if (target.rest) await advance(page, 40, { interact: true });
      if (target.upgrade) {
        for (;;) { const s = await state(page); if (s.level >= 10 || s.rice < 40 + s.level * 30) break; await page.getByRole('button', { name: /强化装备/ }).click(); }
      }
      const after = await state(page); stages.push({ target: target.id || dest, time: after.time, hp: after.player.hp });
      if (target.capture) await capture(page, target.capture);
      if (target.id === 'lower-lamp' && !evidence.some(e => e.name === 'lower-map')) { await page.keyboard.press('m'); await page.getByRole('button', { name: '全城', exact: true }).click(); await capture(page, 'lower-map'); await page.keyboard.press('m'); }
    }
    const final = await state(page); assert.equal(final.chapterComplete, true); assert.equal(final.chapterGates.length, 5);
    await page.evaluate(() => window.nightRain.save()); await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); assert.equal((await state(page)).chapterComplete, true);
    await page.getByRole('button', { name: '继续探索旧城', exact: true }).click();
    await page.keyboard.press('m'); await page.getByRole('button', { name: /脱离卡死/ }).click();
    await advance(page, 0); await page.keyboard.press('m');
    const before = await state(page); await page.getByRole('button', { name: '前往经院雨灯', exact: true }).click();
    const after = await state(page); assert.equal(after.checkpoint, 'archive-lamp'); assert.equal(after.player.hp, before.player.hp); assert.equal(after.player.flasks, before.player.flasks);
    await page.keyboard.press('m'); await capture(page, 'lamp-travel-map'); await page.keyboard.press('m');
    await samplePerformance(page, 'desktop-archive');
    await page.evaluate(() => window.nightRain.save());
    const save = await page.evaluate(() => localStorage.getItem('night-rain-v1'));
    fs.writeFileSync(path.join(out, 'verified-save.json'), save);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.addInitScript(save => localStorage.setItem('night-rain-v1', save), save); await install(mobile);
    await mobile.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await advance(mobile, 0);
    await capture(mobile, 'mobile-archive');
    await mobile.waitForTimeout(1250);
    await mobile.getByRole('button', { name: '跳跃', exact: true }).tap();
    await mobile.waitForFunction(() => window.nightRain.getState().player.jumpHeight > .3);
    await mobile.waitForFunction(() => window.nightRain.getState().player.jumpHeight === 0);
    await mobile.getByRole('button', { name: '轻击', exact: true }).tap();
    await mobile.waitForFunction(() => window.nightRain.getState().player.action === 'light');
    await mobile.waitForFunction(() => window.nightRain.getState().player.action === 'idle');
    await mobile.getByRole('button', { name: '地图 M', exact: true }).tap(); await capture(mobile, 'mobile-map');
    await mobile.getByRole('button', { name: '全城', exact: true }).tap(); await capture(mobile, 'mobile-whole-map');
    await mobile.getByRole('button', { name: '定位自己', exact: true }).tap();
    await mobile.setViewportSize({ width: 320, height: 740 }); await capture(mobile, 'narrow-map');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ evidence, errors, stages, performanceSamples, input: 'Legal public movement and combat, virtual pointer lock, muted installed Chrome' }, null, 2));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
