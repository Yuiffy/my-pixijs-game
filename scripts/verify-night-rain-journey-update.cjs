const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3952';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-journey-browser';
const errors = [], evidence = [], checks = {};
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(p, name) {
  await p.waitForTimeout(250);
  const file = path.join(out, name + '.png');
  const layout = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: Array.from(document.querySelectorAll('canvas')).map(c => [c.width, c.height]), dom: document.body.innerText }));
  assert.ok(layout.scroll <= layout.width); assert.ok(layout.canvas.every(c => c[0] > 0 && c[1] > 0));
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ state: await state(p), layout, pixels }, null, 2)); evidence.push({ file, pixels });
}
async function pad(p, index, duration = 100) {
  await p.evaluate(i => { window.virtualPad.buttons[i] = { pressed: true, value: 1 }; }, index);
  await p.waitForTimeout(duration);
  await p.evaluate(i => { window.virtualPad.buttons[i] = { pressed: false, value: 0 }; }, index);
  await p.waitForTimeout(70);
}
async function focusPad(p, text) {
  for (let i = 0; i < 65; i++) {
    if (await p.evaluate(t => document.activeElement?.textContent?.includes(t) || document.activeElement?.getAttribute('aria-label') === t, text)) return;
    await pad(p, 13);
  }
  throw Error('Controller cannot reach ' + text);
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const { walkTo, playFirstLevel } = await import('./tests/helpers/night-rain-pilot.mjs');
  const e = await load('src/components/nightRain/engine.ts'), w = await load('src/components/nightRain/world.ts'), c = await load('src/components/nightRain/companion.ts'), d = await load('src/components/nightRain/dungeons.ts');
  const fresh = () => { const s = e.createGame(); e.startGame(s); return s; };
  const route = (s, p) => { const r = c.findPath(s.player, p, s); assert.ok(r.length); for (const q of r.slice(1)) walkTo(e, s, q, 120000); };
  const lamp = fresh(); route(lamp, w.REST_POINTS.courtyard); e.interact(lamp);
  const dinner = playFirstLevel(e).state;
  const crypt = e.loadGame(e.saveGame(lamp)); Object.assign(crypt.player, d.DUNGEON_PORTALS['crypt-entrance'].destination, { lastGround: { ...d.DUNGEON_PORTALS['crypt-entrance'].destination }, fallPeak: 0 }); e.stepGame(crypt, 1);
  const cryptEntrance = e.saveGame(crypt);
  for (const id of ['crypt-lamp', 'crypt-note', 'ossuary-mail', 'grave-spear', 'grave-seal']) { route(crypt, w.interactionPoint(w.LANDMARKS.find(l => l.id === id))); e.interact(crypt); }
  route(crypt, w.REST_POINTS['crypt-lamp']); e.interact(crypt);
  const cave = e.loadGame(e.saveGame(dinner)); e.continueExploring(cave);
  const { CHAPTER_ROUTE } = await import('./tests/helpers/night-rain-chapter-pilot.mjs');
  for (const target of CHAPTER_ROUTE) {
    const landmark = target.id ? w.LANDMARKS.find(l => l.id === target.id) : null;
    route(cave, landmark ? w.interactionPoint(landmark) : target);
    if (landmark) e.interact(cave); if (target.rest) e.interact(cave); if (target.upgrade) while (e.upgrade(cave)) { /* earned upgrades */ }
  }
  e.continueExploring(cave); Object.assign(cave.player, d.DUNGEON_PORTALS['cave-entrance'].destination, { lastGround: { ...d.DUNGEON_PORTALS['cave-entrance'].destination }, fallPeak: 0 }); e.stepGame(cave, 1); assert.ok(e.loadGame(e.saveGame(cave)));
  const caveEntrance = e.saveGame(cave);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  async function open(save, width = 1440, legacy = false) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
    // Production layout ads have independent RUM errors; keep QA focused on the shipped game.
    await ctx.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.addInitScript(installVirtualPointerLock);
    await ctx.addInitScript(({ save, legacy }) => {
      if (!localStorage.getItem(legacy ? 'night-rain-v1' : 'night-rain-v1-slot-1')) localStorage.setItem(legacy ? 'night-rain-v1' : 'night-rain-v1-slot-1', save);
      if (!localStorage.getItem('night-rain-v1-settings')) localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: true, voice: true }));
      window.nativeSpeechCalls = 0; if ('speechSynthesis' in window) window.speechSynthesis.speak = () => { window.nativeSpeechCalls++; throw Error('Unexpected system TTS'); };
      window.virtualPad = { index: 0, id: 'Xbox QA standard device', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.virtualPad] });
      window.audioMetrics = { active: false, longTasks: [], frames: [], voice: [], native: 0 };
      new PerformanceObserver(list => { if (window.audioMetrics.active) window.audioMetrics.longTasks.push(...list.getEntries().map(e => e.duration)); }).observe({ entryTypes: ['longtask'] });
      let prev = 0; function frame(t) { const m = window.audioMetrics; if (m.active) { if (prev) m.frames.push(t - prev); if (window.render_game_to_text) m.voice.push(JSON.parse(window.render_game_to_text()).audio); } prev = t; requestAnimationFrame(frame); } requestAnimationFrame(frame);
    }, { save, legacy });
    const p = await ctx.newPage();
    p.on('pageerror', er => errors.push({ type: 'pageerror', message: er.message, stack: er.stack, url: p.url() })); p.on('console', m => { if (m.type() === 'error') errors.push({ type: 'console', message: m.text(), location: m.location(), url: p.url() }); });
    await p.goto(base + '/game/night-rain', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0 && !document.body.innerText.includes('旧城即将亮灯'));
    return { ctx, p };
  }
  try {
    {
      const { ctx, p } = await open(e.saveGame(lamp), 1440, true);
      await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await p.waitForTimeout(2800);
      assert.equal((await state(p)).saveSlot, 1); assert.ok((await state(p)).audio.unlocked);
      await pad(p, 3); assert.equal((await state(p)).panel, 'lamp');
      assert.ok(await p.locator('[data-pad-focus="true"]').textContent().then(t => t.includes('坐下休息')));
      const rests = (await state(p)).restCount; await pad(p, 0); assert.equal((await state(p)).restCount, rests + 1);
      await capture(p, '01-controller-lamp');
      await focusPad(p, '锻造与更换武器'); await pad(p, 0); assert.equal((await state(p)).panel, 'forge'); await pad(p, 1); assert.equal((await state(p)).panel, 'lamp');
      await focusPad(p, '雨灯行旅'); await pad(p, 0); assert.equal((await state(p)).panel, 'map'); await capture(p, '02-map-lamps'); await pad(p, 1); assert.equal((await state(p)).panel, 'lamp'); await pad(p, 1);
      await pad(p, 9); await focusPad(p, '声音设置'); await pad(p, 0); await pad(p, 13);
      assert.equal(await p.evaluate(() => document.activeElement.id), 'sound-music'); const volume = await p.locator('#sound-music').inputValue(); await pad(p, 15); assert.ok(Math.abs((await state(p)).audio.settings.music - Number(volume) - 0.05) < 0.001);
      await capture(p, '03-controller-audio'); await pad(p, 1);
      await p.keyboard.press('c'); await p.getByRole('button', { name: '再说一遍', exact: true }).click(); await p.waitForTimeout(1200);
      await p.keyboard.press('c'); await p.evaluate(() => { window.audioMetrics.active = true; }); await p.getByRole('button', { name: '直接带我去', exact: false }).click(); await p.waitForTimeout(2400);
      const metrics = await p.evaluate(() => { window.audioMetrics.active = false; return { ...window.audioMetrics, native: window.nativeSpeechCalls }; });
      assert.equal(metrics.native, 0); assert.ok(metrics.voice.some(a => a.recent.includes('voice') && a.voiceLine)); assert.ok(metrics.voice.some(a => a.rms > 0.0001), 'Audio graph should carry real decoded media while Chrome output is muted');
      assert.ok(Math.max(0, ...metrics.longTasks) < 500, JSON.stringify(metrics.longTasks));
      checks.audio = { nativeCalls: 0, maxLongTaskMs: Math.max(0, ...metrics.longTasks), maxFrameMs: Math.max(...metrics.frames), rmsMax: Math.max(...metrics.voice.map(a => a.rms)), track: metrics.voice.at(-1).track };
      fs.writeFileSync(path.join(out, 'audio-performance.json'), JSON.stringify(metrics, null, 2));
      await p.keyboard.press('p'); await p.getByRole('button', { name: '保存并返回标题 · 切换旅人', exact: true }).click(); await p.getByText('选择旅人', { exact: false }).click();
      await p.getByRole('button', { name: /^旅人 2/ }).click(); await p.getByRole('button', { name: '栞栞', exact: true }).click(); await p.getByRole('button', { name: '出门找夜宵', exact: true }).click(); assert.equal((await state(p)).saveSlot, 2); assert.deepEqual((await state(p)).litLamps, []); assert.equal((await state(p)).playerSkin, 'shiori');
      await p.keyboard.press('p'); await p.getByRole('button', { name: '保存并返回标题 · 切换旅人', exact: true }).click(); await p.getByText('选择旅人', { exact: false }).click(); await p.getByRole('button', { name: /^旅人 1/ }).click(); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); assert.ok((await state(p)).litLamps.includes('courtyard'));
      assert.equal((await state(p)).playerSkin, 'sui'); await p.reload({ waitUntil: 'networkidle' }); await p.getByText('选择旅人', { exact: false }).click(); await capture(p, '04-five-save-slots');
      checks.controllerLampForgeMapRangesAndSlots = true; await ctx.close();
    }
    {
      const { ctx, p } = await open(e.saveGame(dinner)); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); assert.equal((await state(p)).mode, 'interlude');
      assert.equal(await p.getByRole('button', { name: /再走一场|重新开始/ }).count(), 0); await capture(p, '05-dinner-cutscene');
      for (let i = 0; i < 3; i++) { if (await p.getByRole('button', { name: '继续对白 →', exact: true }).count()) await pad(p, 0); }
      await pad(p, 0); assert.equal((await state(p)).mode, 'playing'); checks.interludeContinues = true; await ctx.close();
    }
    {
      const { ctx, p } = await open(e.saveGame(crypt)); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await p.keyboard.press('p');
      await p.getByRole('button', { name: '雨夜图鉴 · 击败后收录', exact: true }).click(); await p.getByRole('button', { name: '露缇 · 藏骨巨像', exact: true }).click(); await p.waitForTimeout(1500); await capture(p, '06-colossus-bestiary');
      assert.ok((await state(p)).bestiary.includes('boss:colossus')); assert.equal(await p.locator('canvas').count(), 2);
      await pad(p, 1); await pad(p, 14); assert.equal((await state(p)).panel, 'gear'); await focusPad(p, '守灯长枪'); await pad(p, 0); assert.equal((await state(p)).weapon, 'graveSpear');
      await focusPad(p, '藏骨轻甲'); await pad(p, 0); await focusPad(p, '刻名石印'); await pad(p, 0); assert.deepEqual((await state(p)).gear, { armor: 'ossuaryMail', talisman: 'graveSeal' }); await capture(p, '07-unique-equipment'); await pad(p, 1);
      await p.keyboard.press('m'); assert.ok(await p.getByRole('button', { name: '弃灯墓地', exact: true }).getAttribute('aria-pressed')); await capture(p, '08-crypt-map'); const health = (await state(p)).player.hp; await p.getByRole('button', { name: '前往中庭雨灯', exact: true }).click(); assert.equal((await state(p)).checkpoint, 'courtyard'); assert.equal((await state(p)).player.hp, health); assert.equal((await state(p)).weapon, 'graveSpear');
      checks.bestiaryAndEquipment = true; await ctx.close();
    }
    for (const [save, name] of [[cryptEntrance, '09-crypt-entry'], [caveEntrance, '10-cavern-entry']]) {
      const { ctx, p } = await open(save); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await capture(p, name); await ctx.close();
    }
    for (const [id, z, name] of [['crypt-colossus', 60.5, '15-colossus-lock'], ['cave-sentinel', 131.5, '16-sentinel-lock']]) {
      const fixture = fresh(), boss = fixture.enemies.find(b => b.id === id);
      Object.assign(fixture.player, { x: boss.x, y: 0, z, lastGround: { x: boss.x, y: 0, z }, fallPeak: 0 }); e.stepGame(fixture, 1);
      assert.ok(e.loadGame(e.saveGame(fixture)));
      const { ctx, p } = await open(e.saveGame(fixture)); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
      await p.evaluate(() => { window.nightRain.input({ x: 0, z: 0, lock: true }); window.advanceTime(40); window.poseFreeze = setInterval(() => window.advanceTime(0), 100); });
      assert.equal((await state(p)).lockedId, id); await capture(p, name); await ctx.close();
    }
    {
      const npc = fresh(); route(npc, w.interactionPoint(w.LANDMARKS.find(l => l.id === 'haven-keeper')));
      const { ctx, p } = await open(e.saveGame(npc)); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await pad(p, 3); assert.equal((await state(p)).panel, 'story'); await capture(p, '11-controller-npc'); await pad(p, 0); await pad(p, 1); assert.equal((await state(p)).panel, null);
      await p.evaluate(() => { window.virtualPad.id = 'DualSense Wireless Controller'; }); await p.waitForTimeout(100); await pad(p, 9); assert.equal((await state(p)).controls.family, 'playstation'); assert.ok((await p.getByText('✕ 确认 · ○ 返回', { exact: false }).count()) > 0); await capture(p, '12-playstation-hints'); checks.npcAndSonyHints = true; await ctx.close();
    }
    for (const width of [390, 320]) {
      const { ctx, p } = await open(e.saveGame(crypt), width); await p.getByText('选择旅人', { exact: false }).click(); await capture(p, `13-slots-${width}`); await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await p.getByRole('button', { name: /^暂停/ }).click(); await p.getByRole('button', { name: '雨夜图鉴 · 击败后收录', exact: true }).click(); await p.getByRole('button', { name: '露缇 · 藏骨巨像', exact: true }).click(); await p.waitForTimeout(800); await capture(p, `14-bestiary-${width}`); await ctx.close();
    }
    checks.responsiveSlotsAndBestiary = true; assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, checks, evidence, errors }, null, 2)); }
  console.log(JSON.stringify({ checks, errors, screenshots: evidence.length }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
