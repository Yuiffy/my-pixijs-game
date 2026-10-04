const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3980';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-landmarks-browser';
const selected = new Set((process.env.NIGHT_RAIN_CAPTURES || '').split(',').filter(Boolean));
const scenes = new Set((process.env.NIGHT_RAIN_SCENES || '').split(',').filter(Boolean));
const errors = [], evidence = [], cases = [];
fs.mkdirSync(out, { recursive: true });
const state = page => page.evaluate(() => window.nightRain.getState());
const advance = (page, ms, input = {}) => page.evaluate(({ ms, input }) => { window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });

async function capture(page, name) {
  if (selected.size && !selected.has(name)) return;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
  const text = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const layout = await page.evaluate(() => ({ dom: document.body.innerText, width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })) }));
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].width > 0); assert.ok(layout.scroll <= layout.width);
  const file = path.join(out, name + '.png');
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  fs.writeFileSync(file.replace('.png', '.json'), JSON.stringify({ text, layout, pixels }, null, 2));
  evidence.push({ name, file, pixels, region: text.region }); console.log('capture ' + name);
}

async function main() {
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const world = await load('src/components/nightRain/world.ts');
  const discovery = await load('src/components/nightRain/landmarkPresentation.ts');
  const ferry = await load('src/components/nightRain/ferries.ts');
  const fixture = fs.readFileSync('scripts/tests/fixtures/night-rain-valley-v6.json', 'utf8');
  const fresh = () => engine.loadGame(fixture);
  const recruit = s => { s.collected.push('names-register', 'keel-rubbing'); s.haven.recruits.push('scribe', 'boatwright'); };
  const place = (s, p) => { Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y, facing: Math.PI, action: 'idle', attack: null }); s.messageTime = 0; };
  const approach = (s, l) => [
    ...(['canal-lamp', 'temple-lamp'].includes(l.id) ? [world.interactionPoint(l)] : []),
    ...(l.id === 'ferry-note' ? [{ x: l.x - 1.3, y: l.y, z: l.z + 1.1 }] : []),
    ...(['crypt-note', 'cave-note'].includes(l.id) ? [{ x: l.x - 4, y: l.y, z: l.z - 3 }] : []),
    { x: l.x + 1.3, y: l.y, z: l.z + 1.1 }, { x: l.x - 1.3, y: l.y, z: l.z + 1.1 },
    { x: l.x + 1.4, y: l.y, z: l.z }, world.interactionPoint(l),
  ].find(p => world.canOccupy(p.x, p.z, p.y, s) && Math.abs(world.supportAt(p.x, p.z, p.y + 0.1) - p.y) < 0.1 && world.lineClear(p, l, s, l.id));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const open = async (s, viewport = { width: 1440, height: 900 }) => {
    const save = engine.saveGame(s); assert.ok(engine.loadGame(save), 'valid staged save');
    const page = await browser.newPage({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(installVirtualPointerLock);
    await page.addInitScript(save => {
      if (!localStorage.getItem('night-landmarks-qa-seeded')) {
        localStorage.setItem('night-rain-v1', save);
        localStorage.setItem('night-landmarks-qa-seeded', '1');
      }
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
    }, save);
    await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0);
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.evaluate(() => { window.advanceTime(0); window.qaFreeze = setInterval(() => window.advanceTime(0), 50); });
    await page.waitForTimeout(400);
    if (s.player.y < -10) {
      // Turn using the same pointer event handled during normal gameplay.
      await page.locator('canvas').click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(50);
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: Math.PI / 0.003 })));
      await advance(page, 0); await page.waitForTimeout(450);
    }
    return page;
  };
  try {
    // Catalog each existing note model; all scenes start from validated saves.
    for (const l of world.LANDMARKS.filter(l => l.kind === 'note')) {
      if (scenes.size && !scenes.has(l.id) && !scenes.has('catalog')) continue;
      const s = fresh();
      if (l.id.startsWith('haven-') && l.id !== 'haven-sign' || l.id === 'well-testimony') recruit(s);
      if (l.id === 'well-testimony') { s.haven.echoes = 3; s.haven.gates.push('well-door'); }
      if (l.id === 'river-heart') { s.valleyComplete = false; s.collected = s.collected.filter(id => id !== l.id); }
      if (discovery.notePresentation(l).role !== 'mechanism') s.collected = s.collected.filter(id => id !== l.id);
      const p = approach(s, l); assert.ok(p, 'approach ' + l.id); place(s, p);
      const page = await open(s);
      await advance(page, 16);
      const yaw = { 'temple-lamp': Math.PI / 2, 'crypt-note': -2.25, 'cave-note': -2.25 }[l.id];
      if (yaw !== undefined) {
        await page.locator('canvas').click({ position: { x: 100, y: 100 } });
        await page.evaluate(yaw => {
          const current = JSON.parse(window.render_game_to_text()).camera.yaw;
          document.dispatchEvent(new MouseEvent('mousemove', { movementX: (current - yaw) / 0.003 }));
        }, yaw);
        await advance(page, 0); await page.waitForTimeout(450);
      }
      const rendered = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      assert.equal(rendered.discoveries.find(d => d.id === l.id).model, discovery.notePresentation(l).model);
      await capture(page, 'model-' + l.id);
      if (l.id === 'rooftop-note' || l.id === 'names-register') {
        assert.equal((await state(page)).nearbyId, l.id);
        await advance(page, 16, { interact: true });
        assert.ok((await state(page)).collected.includes(l.id));
        await capture(page, 'read-' + l.id);
      }
      cases.push({ id: l.id, model: discovery.notePresentation(l).model, nearbyId: (await state(page)).nearbyId });
      await page.close();
    }
    for (const viewport of scenes.size && !scenes.has('river') ? [] : [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const suffix = viewport.width < 600 ? '-mobile' : '';
      const s = fresh(); s.valleyComplete = false; s.collected = s.collected.filter(id => id !== 'river-heart');
      place(s, { x: -150, y: 8, z: -510 });
      const page = await open(s, viewport);
      await capture(page, 'river-heart-far' + suffix);
      await advance(page, 40, { interact: true }); assert.equal((await state(page)).valleyComplete, false);
      for (let step = 0; step < 20 && (await state(page)).nearbyId !== 'river-heart'; step++) await advance(page, 250, { z: -1, sprint: true });
      await advance(page, 0);
      assert.equal((await state(page)).nearbyId, 'river-heart');
      await capture(page, 'river-heart-approach' + suffix);
      await page.keyboard.press('e'); await page.evaluate(() => window.advanceTime(40));
      assert.equal((await state(page)).mode, 'interlude');
      await capture(page, 'river-heart-released' + suffix);
      while (await page.getByRole('button', { name: '继续对白 →', exact: true }).count()) await page.getByRole('button', { name: '继续对白 →', exact: true }).click();
      await page.getByRole('button', { name: '起身，继续旅途 →', exact: true }).click();
      await advance(page, 0);
      assert.equal((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).discoveries.find(d => d.id === 'river-heart').phase, 'complete');
      await capture(page, 'river-heart-complete' + suffix);
      await page.close();
    }
    for (const stage of scenes.size && !scenes.has('ferry') ? [] : ['locked', 'needs-lamp', 'ready']) {
      const s = fresh();
      if (stage !== 'locked') recruit(s);
      if (stage === 'ready') s.litLamps.push('haven-lamp');
      const l = world.LANDMARKS.find(l => l.id === 'boatyard-ferry');
      place(s, approach(s, l));
      const page = await open(s);
      await advance(page, 40, { interact: true });
      const after = await state(page);
      if (stage === 'ready') {
        assert.equal(after.player.z, ferry.FERRY_ROUTES[l.id].position.z);
        assert.equal(after.player.flasks, s.player.flasks); assert.equal(after.player.hp, s.player.hp); assert.equal(after.checkpoint, s.checkpoint);
        await capture(page, 'ferry-returned-home');
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
        await page.evaluate(() => { window.advanceTime(0); window.qaFreeze = setInterval(() => window.advanceTime(0), 50); });
        assert.equal((await state(page)).player.z, after.player.z);
        await advance(page, 40, { interact: true });
        assert.equal((await state(page)).player.z, ferry.FERRY_ROUTES['haven-ferry'].position.z);
        await capture(page, 'ferry-back-to-boatyard');
      } else {
        assert.equal(after.nearbyId, l.id); assert.equal(after.player.z, s.player.z);
        assert.match(after.prompt, stage === 'locked' ? /航线未开通/ : /等待庭灯/);
        await capture(page, 'ferry-' + stage);
        const shortPage = await open(s, { width: 1280, height: 720 });
        await advance(shortPage, 40, { interact: true });
        const boxes = await shortPage.evaluate(() => ({
          message: document.querySelector('[data-narrative]')?.getBoundingClientRect().toJSON(),
          interaction: document.querySelector('button kbd')?.parentElement.getBoundingClientRect().toJSON(),
        }));
        assert.ok(boxes.message && boxes.interaction);
        assert.ok(boxes.message.bottom + 8 <= boxes.interaction.top, 'ferry requirement is clear of the interaction button');
        await capture(shortPage, 'ferry-' + stage + '-720p');
        await shortPage.close();
      }
      await page.keyboard.press('m'); await capture(page, 'map-ferry-' + stage);
      const titles = await page.locator('svg title').allTextContents();
      assert.ok(titles.some(t => t.includes('乘温叔的船') && t.includes(stage === 'ready' ? '航线已开通' : stage === 'locked' ? '航线未开通' : '等待庭灯')));
      await page.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, errors, cases, evidence }, null, 2));
    console.log(JSON.stringify({ cases: cases.length, screenshots: evidence.length, errors }));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
