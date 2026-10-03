const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://localhost:3926';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-haven-browser';
const captureOnly = new Set((process.env.NIGHT_RAIN_CAPTURES || '').split(',').filter(Boolean));
const evidence = []; const errors = []; const stages = []; const performanceSamples = []; const fights = new Set();
fs.mkdirSync(out, { recursive: true });
const state = p => p.evaluate(() => window.nightRain.getState());
const advance = (p, ms, action = {}) => p.evaluate(({ ms, action }) => { window.nightRain.input({ x: 0, z: 0, ...action }); window.advanceTime(ms); }, { ms, action });

async function capture(page, name, preserveView = false) {
  if (captureOnly.size && !captureOnly.has(name)) return;
  await advance(page, 0);
  if (!preserveView && !name.endsWith('windup')) await page.evaluate(() => window.nightRain.resetCamera());
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
        const pose = live.find(e => e.kind === 'elegist' && e.action === 'windup' && !captured.includes(e.kind));
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
  const pilot = fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs', 'utf8').replaceAll('export ', '');
  await page.addInitScript({ content: `${pilot}\nwindow.nightRainPilot={chooseInput,NIGHT_ROUTE};` });
  await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0);

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
  const { HAVEN_ROUTE, HAVEN_RETURN_ROUTE } = await import('./tests/helpers/night-rain-haven-pilot.mjs');
  const world = await loadTypescriptModule('src/components/nightRain/world.ts');
  const guide = await loadTypescriptModule('src/components/nightRain/companion.ts');
  const haven = await loadTypescriptModule('src/components/nightRain/haven.ts');
  const engine = await loadTypescriptModule('src/components/nightRain/engine.ts');
  const seed = fs.readFileSync('scripts/tests/fixtures/night-rain-valley-v6.json', 'utf8');
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.NIGHT_RAIN_HEADED, args: ['--mute-audio', '--disable-speech-api'] });
  const labels = { deposit: /^寄存随身的/, withdraw: /^取回寄存的/, 'invite-scribe': /^邀请弥音前往归灯庭/, 'invite-boatwright': /^邀请温叔前往归灯庭/, remember: /^把名字刻回庭灯/, release: /^让愿灯顺水远行/ };
  const close = async p => { if (await p.getByRole('dialog').count()) await p.getByRole('button', { name: '关闭', exact: true }).click(); await advance(p, 0); };
  const route = async (page, targets, captures = true) => {
    for (const target of targets) {
      if (target.travel) {
        await page.keyboard.press('m');
        await page.getByRole('button', { name: `前往${guide.targetLabel(target.travel)}`, exact: true }).click(); await advance(page, 0);
        assert.equal((await state(page)).checkpoint, target.travel); continue;
      }
      const s = await state(page); const l = target.id ? world.LANDMARKS.find(l => l.id === target.id) : null;
      const dest = l ? world.interactionPoint(l) : target;
      const path = guide.findPath(s.player, dest, s); assert.ok(path.length, `path to ${JSON.stringify(target)}`);
      for (const point of path.slice(1)) await walk(page, point);
      const before = await state(page);
      if (l) { assert.equal(before.nearbyId, l.id); await advance(page, 40, { interact: true }); }
      if (target.talkCapture && captures) await capture(page, target.talkCapture);
      if (target.choice) await page.getByRole('button', { name: labels[target.choice] }).click();
      let after = await state(page);
      if (l?.kind === 'ferry') {
        assert.deepEqual({ x: after.player.x, y: after.player.y, z: after.player.z }, haven.HAVEN_FERRIES[l.id].position);
        assert.equal(after.player.hp, before.player.hp); assert.equal(after.player.flasks, before.player.flasks);
        assert.equal(after.checkpoint, before.checkpoint); assert.deepEqual(after.enemies, before.enemies);
      }
      if (target.capture && captures) await capture(page, target.capture);
      await close(page);
      if (target.rest) await advance(page, 40, { interact: true });
      after = await state(page); assert.ok(engine.loadGame(JSON.stringify(after)), `save ${JSON.stringify(target)}`);
      stages.push({ id: target.id ?? target.capture, hp: after.player.hp, time: after.time, recruits: [...after.haven.recruits] });
      if (target.id === 'haven-lamp' && !stages.slice(0, -1).some(e => e.id === 'haven-lamp') && captures) {
        await page.keyboard.press('m'); await capture(page, 'haven-map'); await close(page);
        await page.keyboard.press('n'); await capture(page, 'haven-journal'); await close(page);
        await samplePerformance(page, 'desktop-haven');
        await page.evaluate(() => {
          const event = new MouseEvent('mousemove', { bubbles: true });
          Object.defineProperty(event, 'movementX', { value: Math.PI / .003 });
          document.dispatchEvent(event);
        });
        await capture(page, 'haven-court-view', true);
        await page.evaluate(() => window.nightRain.resetCamera());
      }
    }
  };
  const loadPage = async (save, viewport = { width: 1440, height: 900 }, mobile = false) => {
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    await page.addInitScript(save => { if (!localStorage.getItem('night-rain-v1')) localStorage.setItem('night-rain-v1', save); }, save);
    await install(page); await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await advance(page, 0);
    return page;
  };
  try {
    const page = await loadPage(seed);
    assert.equal((await state(page)).worldVersion, 7);
    await route(page, HAVEN_ROUTE);
    assert.ok((await state(page)).defeatedGuests.includes('last-lamplighter'));
    const choiceSave = JSON.stringify(await state(page)); fs.writeFileSync(path.join(out, 'choice-save.json'), choiceSave);
    await advance(page, 40, { interact: true }); await page.getByRole('button', { name: labels.remember }).click();
    assert.equal((await state(page)).haven.ending, 'remember'); await capture(page, '19-remember-ending');
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    assert.equal((await state(page)).haven.ending, 'remember'); await capture(page, '19-remember-reload');
    await page.getByRole('button', { name: '回到旅途 · 重访归灯庭', exact: true }).click(); await advance(page, 0);
    await route(page, HAVEN_RETURN_ROUTE);
    assert.ok((await state(page)).haven.gates.includes('well-return'));
    await route(page, [{ id: 'haven-ferry' }, { id: 'boatyard-ferry' }, { id: 'haven-lamp' }], false);
    await page.evaluate(() => window.nightRain.save()); const finalSave = await page.evaluate(() => localStorage.getItem('night-rain-v1'));
    fs.writeFileSync(path.join(out, 'verified-save.json'), finalSave);
    const mobile = await loadPage(finalSave, { width: 390, height: 844 }, true);
    await capture(mobile, 'mobile-haven');
    await mobile.getByRole('button', { name: '地图 M', exact: true }).tap(); await capture(mobile, 'mobile-haven-map');
    await mobile.getByRole('button', { name: /归灯手记 ·/ }).tap(); await capture(mobile, 'mobile-journal');
    await mobile.setViewportSize({ width: 320, height: 740 }); await capture(mobile, 'narrow-journal'); await close(mobile);
    await route(mobile, [{ id: 'haven-keeper' }], false); await advance(mobile, 40, { interact: true });
    await capture(mobile, 'narrow-conversation');
    await mobile.getByRole('button', { name: labels.deposit }).tap(); assert.ok((await state(mobile)).haven.savings > 0);
    await mobile.getByRole('button', { name: labels.withdraw }).tap(); assert.equal((await state(mobile)).haven.savings, 0); await close(mobile);
    await mobile.getByRole('button', { name: '地图 M', exact: true }).tap(); await capture(mobile, 'narrow-haven-map'); await close(mobile);
    await mobile.waitForTimeout(1250); await mobile.getByRole('button', { name: '跳跃', exact: true }).tap();
    await mobile.waitForFunction(() => window.nightRain.getState().player.jumpHeight > .3); await mobile.waitForFunction(() => window.nightRain.getState().player.jumpHeight === 0);
    const release = await loadPage(choiceSave);
    await advance(release, 40, { interact: true }); await release.getByRole('button', { name: labels.release }).click();
    assert.equal((await state(release)).haven.ending, 'release'); await capture(release, '24-release-ending');
    await release.getByRole('button', { name: '回到旅途 · 重访归灯庭', exact: true }).click(); await advance(release, 0);
    await route(release, HAVEN_RETURN_ROUTE, false); await capture(release, '25-release-home');
    await route(release, [{ id: 'haven-scribe' }], false); await advance(release, 40, { interact: true }); await capture(release, '26-release-conversation');
    await release.keyboard.press('Tab');
    assert.ok(await release.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)));
    await release.keyboard.press('Escape'); assert.equal((await state(release)).paused, false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ evidence, errors, stages, performanceSamples, input: 'Recorded v6 chapter-two save, legal public movement/combat and DOM dialogue choices; muted installed Chrome' }, null, 2));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
