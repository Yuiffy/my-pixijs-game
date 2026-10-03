// Legal campaign fixtures, installed Chrome, muted audio, full-page screenshot QA.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://localhost:3926';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-experience-browser';
const captures = process.env.NIGHT_RAIN_CAPTURES?.split(',');
fs.mkdirSync(out, { recursive: true });
const evidence = [], errors = [], fixtures = {};
async function capture(page, name) {
  if (captures && !captures.includes(name)) return;
  await page.evaluate(() => document.fonts.ready);
  const text = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, dom: document.body.innerText, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })) }));
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].width > 0); assert.ok(layout.scroll <= layout.width);
  const file = path.join(out, name + '.png'); const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ text, layout, pixels }, null, 2)); evidence.push({ file, pixels }); console.log('capture ' + name);
}
async function main() {
  assert.equal((await fetch(base + '/game/night-rain')).status, 200);
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const { playFirstLevel, walkTo, NIGHT_ROUTE } = await import('./tests/helpers/night-rain-pilot.mjs');
  const { CHAPTER_ROUTE } = await import('./tests/helpers/night-rain-chapter-pilot.mjs');
  const { VALLEY_ROUTE } = await import('./tests/helpers/night-rain-valley-pilot.mjs');
  const { HAVEN_ROUTE } = await import('./tests/helpers/night-rain-haven-pilot.mjs');
  const engine = await load('src/components/nightRain/engine.ts'); const world = await load('src/components/nightRain/world.ts'); const guide = await load('src/components/nightRain/companion.ts'); const { BOSS_ROSTER } = await load('src/components/nightRain/bossRoster.ts');
  const saveFixture = (name, s) => { if (fixtures[name]) return; const save = engine.saveGame(s); if (engine.loadGame(save)) fixtures[name] = save; };
  const proxy = { ...engine, stepGame(s, ms, input) {
    for (const e of s.enemies) if (e.aggro && e.action === 'windup' && e.timer <= .14 && s.player.action === 'idle' && Math.hypot(e.x - s.player.x, e.z - s.player.z) < 2.5 && engine.enemyAttack(e).parryable) saveFixture('parry-ready', s);
    engine.stepGame(s, ms, input);
    for (const e of s.enemies) {
      if (BOSS_ROSTER[e.kind] && e.aggro && e.phase === 2 && e.action === 'windup' && e.timer > .3) saveFixture('boss-' + e.kind, s);
      if (e.id === 'alley-ambusher' && e.aggro && e.action === 'windup') saveFixture('alley-peek', s);
      if (e.id === 'market-ambusher' && e.aggro && e.action === 'windup') saveFixture('market-peek', s);
    }
  } };
  const first = engine.createGame(); engine.startGame(first);
  for (const p of NIGHT_ROUTE.slice(0, 7)) { walkTo(proxy, first, p); if (p.interact && p.interact !== 'courtyard') engine.interact(first); }
  saveFixture('lamp-unlit', first);
  const { state: campaign } = playFirstLevel(proxy);
  engine.continueExploring(campaign); engine.escapeStuck(campaign); saveFixture('forge-ready', campaign);
  const market = engine.loadGame(fixtures['forge-ready']);
  const marketPath = guide.findPath(market.player, { x: 12.7, y: 0, z: -45.5 }, market); assert.ok(marketPath.length);
  // Deliberately peek around the pillar; the combat pilot otherwise tries to
  // approach the enemy through cover instead of finishing the walking route.
  for (const p of marketPath.slice(1)) {
    for (let i = 0; i < 2000 && !fixtures['market-peek']; i++) {
      const dx = p.x - market.player.x, dz = p.z - market.player.z, distance = Math.hypot(dx, dz);
      if (distance < .18) break;
      proxy.stepGame(market, 40, { x: dx / distance, z: dz / distance });
      assert.equal(market.mode, 'playing');
      if (i === 1999) throw new Error('Market peek route blocked');
    }
  }
  for (let i = 0; i < 30 && !fixtures['market-peek']; i++) proxy.stepGame(market, 40, { x: 0, z: 0 });
  assert.ok(fixtures['market-peek']);
  const door = engine.loadGame(fixtures['lamp-unlit']);
  const doorPath = guide.findPath(door.player, { x: 12, y: 0, z: -6.65 }, door); assert.ok(doorPath.length);
  for (const p of doorPath.slice(1)) walkTo(proxy, door, p, 180000);
  assert.equal(door.nearbyId, 'shortcut'); assert.match(door.prompt, /无法从这一侧打开/); saveFixture('wrong-door', door);
  const route = (s, targets) => {
    for (const target of targets) {
      if (target.travel) { assert.ok(engine.travelToLamp(s, target.travel)); continue; }
      const l = target.id ? world.LANDMARKS.find(l => l.id === target.id) : null;
      const destination = l ? world.interactionPoint(l) : target;
      const points = guide.findPath(s.player, destination, s); assert.ok(points.length, target.id || JSON.stringify(target));
      for (const p of points.slice(1)) walkTo(proxy, s, p, 180000);
      if (l) engine.interact(s); if (target.rest) engine.interact(s); if (target.upgrade) while (engine.upgrade(s)) {}
      if (target.choice) assert.ok(engine.chooseConversation(s, target.choice));
      s.haven.talking = null; engine.setPaused(s, false);
      assert.ok(engine.loadGame(engine.saveGame(s)), target.id);
    }
  };
  route(campaign, CHAPTER_ROUTE); engine.continueExploring(campaign);
  route(campaign, VALLEY_ROUTE); engine.continueExploring(campaign);
  // The restored checkpoint is at a known lamp, so the existing hub route can travel.
  engine.escapeStuck(campaign); route(campaign, HAVEN_ROUTE);
  assert.equal(Object.keys(fixtures).filter(k => k.startsWith('boss-')).length, 7);
  const dying = engine.loadGame(fixtures['lamp-unlit']); engine.interact(dying);
  for (let i = 0; i < 3000 && dying.mode === 'playing'; i++) {
    const e = dying.enemies[0]; const dist = Math.hypot(e.x - dying.player.x, e.z - dying.player.z);
    if (dying.player.hp <= engine.enemyAttack(e).damage && e.action === 'windup' && e.timer <= .14) saveFixture('death-ready', dying);
    const move = dist > 1.6 ? { x: (e.x - dying.player.x) / dist, z: (e.z - dying.player.z) / dist } : { x: 0, z: 0 };
    engine.stepGame(dying, 40, move);
  }
  assert.ok(fixtures['death-ready']); assert.ok(fixtures['parry-ready']);
  for (const [name, save] of Object.entries(fixtures)) fs.writeFileSync(path.join(out, name + '-save.json'), save);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const open = async (save, viewport = { width: 1440, height: 900 }) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(installVirtualPointerLock);
    await page.addInitScript(save => {
      if (!localStorage.getItem('night-rain-v1')) localStorage.setItem('night-rain-v1', save); localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
    }, save);
    await page.goto(base + '/game/night-rain', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.nightRain && document.querySelector('canvas')?.width > 0);
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.evaluate(() => { window.advanceTime(0); window.qaFreeze = setInterval(() => window.advanceTime(0), 50); });
    await page.waitForTimeout(1300); return page;
  };
  const advance = (page, ms, input = {}) => page.evaluate(({ ms, input }) => { window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });
  try {
    const lamp = await open(fixtures['lamp-unlit']); await capture(lamp, '01-unlit-guiding-motes');
    await advance(lamp, 40, { interact: true }); await lamp.waitForTimeout(700);
    assert.equal(await lamp.locator('[data-soul-notice="lamp"]').count(), 1); await capture(lamp, '02-bonfire-lit');
    const x = (await lamp.evaluate(() => window.nightRain.getState())).player.x; await advance(lamp, 100, { x: 1 });
    assert.ok((await lamp.evaluate(() => window.nightRain.getState())).player.x > x); await lamp.waitForTimeout(2800);
    assert.equal(await lamp.locator('[data-soul-notice]').count(), 0); await lamp.close();
    const parry = await open(fixtures['parry-ready']); await advance(parry, 260, { parry: true }); await advance(parry, 100);
    assert.ok((await parry.evaluate(() => window.nightRain.getState())).effects.some(f => f.kind === 'parry'));
    await capture(parry, '03-parry-sparks'); await parry.close();
    const forge = await open(fixtures['forge-ready']); await forge.getByRole('button', { name: /锻造武器/ }).click();
    const before = await forge.evaluate(() => window.nightRain.getState());
    await forge.getByRole('button', { name: '锻造 · 80 夜市钱', exact: true }).click();
    await forge.getByRole('button', { name: '携刃出发' }).click(); await advance(forge, 280, { light: true, aim: Math.PI / 2 });
    await capture(forge, 'weapon-iron-attack'); await advance(forge, 900);
    await forge.getByRole('button', { name: /锻造武器/ }).click();
    await forge.getByRole('button', { name: '锻造 · 160 夜市钱', exact: true }).click();
    const after = await forge.evaluate(() => window.nightRain.getState()); assert.equal(after.weapon, 'katana'); assert.equal(after.rice, before.rice - 240); assert.equal(after.player.hp, before.player.hp);
    await capture(forge, '04-forged-weapon-menu'); await forge.getByRole('button', { name: '携刃出发' }).click(); await capture(forge, '05-katana-equipped');
    await advance(forge, 280, { light: true, aim: -Math.PI / 2 }); await capture(forge, 'weapon-katana-attack'); await advance(forge, 900);
    await forge.getByRole('button', { name: /锻造武器/ }).click(); await forge.getByRole('button', { name: '握持折雨伞', exact: true }).click();
    assert.equal((await forge.evaluate(() => window.nightRain.getState())).rice, after.rice);
    await forge.getByRole('button', { name: '携刃出发' }).click(); await advance(forge, 280, { light: true, aim: Math.PI / 2 }); await capture(forge, 'weapon-folded-attack'); await advance(forge, 900);
    await forge.getByRole('button', { name: /锻造武器/ }).click(); await forge.getByRole('button', { name: '握持雨切武士刀', exact: true }).click(); await forge.getByRole('button', { name: '携刃出发' }).click();
    await forge.reload({ waitUntil: 'networkidle' }); await forge.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    assert.equal((await forge.evaluate(() => window.nightRain.getState())).weapon, 'katana'); await forge.close();
    const dead = await open(fixtures['death-ready']); await advance(dead, 500); await dead.waitForTimeout(600);
    assert.equal((await dead.evaluate(() => window.nightRain.getState())).mode, 'dead'); assert.equal(await dead.locator('[data-soul-notice="death"]').count(), 1); await capture(dead, '06-you-died');
    await dead.getByRole('button', { name: '回到雨灯', exact: true }).waitFor({ timeout: 5000 }); await dead.getByRole('button', { name: '回到雨灯', exact: true }).click();
    await advance(dead, 5000); assert.equal((await dead.evaluate(() => window.nightRain.getState())).player.hp, 100); assert.equal(await dead.locator('[data-soul-notice]').count(), 0); await capture(dead, '07-respawn-refuge'); await dead.close();
    for (const kind of Object.keys(BOSS_ROSTER)) {
      const page = await open(fixtures['boss-' + kind]);
      assert.ok((await page.evaluate(() => window.nightRain.getState())).enemies.some(e => e.kind === kind && e.phase === 2 && e.aggro));
      await capture(page, 'boss-' + kind); await page.close();
    }
    const beam = await open(fixtures['boss-regent']);
    const gunner = (await beam.evaluate(() => window.nightRain.getState())).enemies.find(e => e.kind === 'regent');
    assert.equal(gunner.attackIndex % 3, 0); await advance(beam, gunner.timer * 1000 + 25); await capture(beam, 'boss-regent-beam'); await beam.close();
    if (fixtures['alley-peek']) { const page = await open(fixtures['alley-peek']); await capture(page, '08-alley-ambush'); await page.close(); }
    assert.ok(fixtures['market-peek']); const peek = await open(fixtures['market-peek']); await capture(peek, '09-market-ambush'); await peek.close();
    const refusal = await open(fixtures['wrong-door']); await capture(refusal, '10-wrong-door-prompt'); await advance(refusal, 40, { interact: true });
    assert.equal((await refusal.evaluate(() => window.nightRain.getState())).shortcut, false); await capture(refusal, '11-wrong-door-refusal'); await refusal.close();
    for (const width of [390, 320]) {
      const page = await open(fixtures['lamp-unlit'], { width, height: 844 }); await advance(page, 40, { interact: true }); await page.waitForTimeout(700); await capture(page, 'mobile-' + width + '-bonfire'); await page.close();
      const menu = await open(fixtures['forge-ready'], { width, height: 844 }); await menu.getByRole('button', { name: /锻造武器/ }).click(); await capture(menu, 'mobile-' + width + '-forge');
      await menu.getByRole('button', { name: '锻造 · 80 夜市钱', exact: true }).click(); await menu.getByRole('button', { name: '锻造 · 160 夜市钱', exact: true }).click();
      assert.equal((await menu.evaluate(() => window.nightRain.getState())).weapon, 'katana');
      await menu.keyboard.press('Escape'); assert.equal((await menu.evaluate(() => JSON.parse(window.render_game_to_text()))).panel, null); await menu.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, fixtures: Object.keys(fixtures), evidence, errors }, null, 2)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
