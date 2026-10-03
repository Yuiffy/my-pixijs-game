const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3962';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-motion-browser';
const errors = [], evidence = [], checks = {};
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function step(p, ms, input = {}) { await p.evaluate(({ ms, input }) => { window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input }); await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function burst(p, ms, input = {}) { for (let left = ms; left > 0; left -= 40) { await step(p, Math.min(40, left), input); input = { ...input, heavy: false, light: false, jump: false, dodge: false, parry: false }; } }
async function capture(p, name) {
  const layout = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), dom: document.body.innerText }));
  assert.ok(layout.scroll <= layout.width); assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].every(x => x > 0));
  const file = path.join(out, name + '.png'); const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true }));
  const snapshot = await state(p); fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ snapshot, layout, pixels }, null, 2)); evidence.push({ file, pixels }); return snapshot;
}
async function main() {
  fs.mkdirSync(out, { recursive: true }); assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const engine = await load('src/components/nightRain/engine.ts'); const weapons = await load('src/components/nightRain/weapons.ts'); const world = await load('src/components/nightRain/world.ts');
  const seed = engine.createGame(); engine.startGame(seed);
  seed.player.x = 0; seed.player.y = 0; seed.player.z = 8; seed.player.facing = 0; seed.player.lastGround = { x: 0, y: 0, z: 8 }; seed.player.fallPeak = 0;
  seed.collected.push('grave-spear', 'cave-daggers', 'stone-maul', 'reed-cape'); seed.weaponLevel = 2;
  seed.bossDefeated = true; const clearedBoss = seed.enemies.find(e => e.kind === 'boss'); clearedBoss.hp = 0; clearedBoss.action = 'dead';
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  async function open({ weapon = 'umbrella', skin = 'sui', width = 1280, combat = false, touch = false, pad = false, hp = 100, meal = false } = {}) {
    const fixture = structuredClone(seed); fixture.weapon = weapon; fixture.playerSkin = skin;
    fixture.player.hp = hp;
    if (meal) { fixture.mode = 'interlude'; fixture.collected.push('food'); const at = world.interactionPoint(world.LANDMARKS.find(l => l.id === 'food')); Object.assign(fixture.player, at, { facing: Math.PI, lastGround: { ...at }, fallPeak: at.y }); }
    if (combat) { const foe = fixture.enemies[0]; Object.assign(fixture.player, { x: foe.x, y: foe.y, z: foe.z + 1.8, facing: Math.PI }); fixture.player.lastGround = { x: fixture.player.x, y: fixture.player.y, z: fixture.player.z }; Object.assign(foe, { action: 'recover', timer: 4, aggro: true }); }
    if (combat === 'boss') {
      const index = fixture.enemies.findIndex(e => e.kind === 'boss'); const foe = engine.createGame().enemies[index]; fixture.enemies[index] = foe; fixture.bossDefeated = false; fixture.weaponLevel = 0;
      Object.assign(fixture.player, { x: foe.x, y: foe.y, z: foe.z + 1.9, facing: Math.PI }); fixture.player.lastGround = { x: fixture.player.x, y: fixture.player.y, z: fixture.player.z };
      Object.assign(foe, { action: 'windup', timer: 1.13, aggro: true, facing: 0 });
    }
    const save = engine.saveGame(fixture); assert.ok(engine.loadGame(save));
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 820 }, hasTouch: touch });
    await ctx.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' })); await ctx.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await ctx.addInitScript(installVirtualPointerLock);
    await ctx.addInitScript(save => { localStorage.setItem('night-rain-v1-slot-1', save); localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false })); localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true })); if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {}; }, save);
    if (pad) await ctx.addInitScript(() => { window.testPad = { index: 0, id: 'QA', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] }); });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(base + '/game/night-rain', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.nightRain && !document.querySelector('[data-game-primary]')?.disabled);
    await p.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click(); await step(p, 0); await p.mouse.wheel(0, -600); await p.waitForTimeout(180); await step(p, 120);
    return { p, ctx };
  }
  try {
    {
      const { p, ctx } = await open(); await capture(p, 'umbrella-00-idle');
      for (const [ms, label] of [[100, 'sink'], [170, 'gather'], [170, 'raise'], [120, 'loaded'], [100, 'release'], [60, 'contact'], [130, 'follow'], [210, 'weighted'], [220, 'recover'], [180, 'idle']]) {
        await step(p, ms, label === 'sink' ? { heavy: true } : {}); await capture(p, 'umbrella-' + label);
      }
      checks.heavyTimeline = true;
      await step(p, 1500); await step(p, 600, { heavy: true, heavyHeld: true }); const charged = await capture(p, 'charge-prepared'); assert.equal(charged.player.action, 'charge');
      await step(p, 1); const released = await capture(p, 'charge-release'); assert.equal(released.player.attack, 'heavy'); assert.ok(released.player.actionTime > 0.2 && released.player.actionTime < 0.5);
      await step(p, 1500); await step(p, 960, { heavy: true, heavyHeld: true }); assert.equal((await state(p)).player.attack, 'charged'); await capture(p, 'charge-full');
      await step(p, 1650, { heavyHeld: true }); assert.equal((await state(p)).player.action, 'idle'); checks.chargeOnce = true;
      await step(p, 400, { heavy: true }); await p.keyboard.press('p'); const before = await state(p); await step(p, 600); assert.equal((await state(p)).time, before.time); await p.keyboard.press('p'); await step(p, 1300); checks.pause = true;
      await step(p, 3000); await burst(p, 300, { x: 1 }); await capture(p, 'locomotion-walk'); await burst(p, 280, { x: 1, sprint: true }); await capture(p, 'locomotion-run');
      await burst(p, 150, { jump: true }); assert.ok((await state(p)).player.jumpHeight > 0.5); await capture(p, 'locomotion-jump'); await step(p, 800); await burst(p, 220, { dodge: true }); assert.equal((await state(p)).player.action, 'dodge'); await capture(p, 'locomotion-roll'); await step(p, 900);
      await step(p, 100, { light: true }); await step(p, 240); await step(p, 100, { light: true }); assert.equal((await state(p)).player.attack, 'light2'); await capture(p, 'light-combo'); await step(p, 1200);
      await burst(p, 320, { parry: true, guardHeld: true }); assert.equal((await state(p)).player.action, 'guard'); await capture(p, 'guard'); await step(p, 300); await ctx.close();
    }
    for (const weapon of ['ironUmbrella', 'katana', 'graveSpear', 'reedDaggers', 'stoneMaul']) {
      const { p, ctx } = await open({ weapon }); const spec = weapons.weaponAttack({ ...seed, weapon }, 'heavy');
      await step(p, spec.impact * 0.7 * 1000, { heavy: true }); await capture(p, weapon + '-prepare');
      await step(p, spec.impact * 0.3 * 1000 + 3); await capture(p, weapon + '-contact'); await ctx.close();
    }
    checks.weapons = 6;
    for (const skin of ['shiori', 'nagisa']) {
      const { p, ctx } = await open({ skin }); await step(p, 460, { heavy: true }); await capture(p, skin + '-prepare'); await step(p, 270); await capture(p, skin + '-contact'); await ctx.close();
    }
    checks.skins = 3;
    {
      const { p, ctx } = await open({ hp: 40 }); await burst(p, 450, { heal: true }); assert.equal((await state(p)).player.action, 'heal'); await capture(p, 'healing-sip'); await step(p, 900); assert.equal((await state(p)).player.hp, 100); checks.heal = true; await ctx.close();
      const dinner = await open({ meal: true }); assert.equal((await state(dinner.p)).mode, 'interlude'); await dinner.p.waitForTimeout(400); await capture(dinner.p, 'meal-interlude'); checks.meal = true; await dinner.ctx.close();
    }
    {
      const { p, ctx } = await open({ combat: true }); const before = await state(p); await step(p, 650, { heavy: true }); assert.equal((await state(p)).enemies[0].hp, before.enemies[0].hp);
      await step(p, 85); assert.equal((await state(p)).enemies[0].hp, before.enemies[0].hp - 36); await capture(p, 'combat-contact');
      await step(p, 150); await step(p, 1, { heavy: true }); assert.ok((await state(p)).player.actionTime > 0.7); checks.realContact = true; await ctx.close();
      const punished = await open({ combat: 'boss' }); await burst(punished.p, 740, { heavy: true }); assert.equal((await state(punished.p)).player.action, 'heavy'); await burst(punished.p, 500); await capture(punished.p, 'combat-recovery-punished'); assert.ok((await state(punished.p)).player.hp < 100); checks.punishedRecovery = true; await punished.ctx.close();
    }
    {
      const { p, ctx } = await open({ width: 390, touch: true });
      const button = p.getByRole('button', { name: /重击/ }).last(); const box = await button.boundingBox(); assert.ok(box);
      const session = await ctx.newCDPSession(p); const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 2, radiusY: 2 };
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }); await p.evaluate(() => window.advanceTime(80));
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.evaluate(() => window.advanceTime(300)); assert.equal((await state(p)).player.action, 'heavy'); await capture(p, 'mobile-heavy'); await step(p, 1600); checks.touch = true; await ctx.close();
    }
    {
      const { p, ctx } = await open({ pad: true }); await p.evaluate(() => { window.testPad.buttons[7] = { pressed: true, value: 1 }; }); await p.waitForTimeout(80); await p.evaluate(() => window.advanceTime(980)); assert.equal((await state(p)).player.attack, 'charged'); await capture(p, 'gamepad-charge');
      await p.evaluate(() => { window.testPad.buttons[7] = { pressed: false, value: 0 }; }); await step(p, 1700); checks.gamepad = true; await ctx.close();
    }
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, checks, errors, evidence }, null, 2)); console.log(JSON.stringify({ checks, screenshots: evidence.length, errors, out }));
  } finally { await browser.close(); }
}
main().catch(e => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: e.stack, errors, evidence }, null, 2)); console.error(e); process.exitCode = 1; });
