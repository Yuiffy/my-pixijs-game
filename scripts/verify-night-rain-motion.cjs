const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');

const base = (process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4187').replace(/\/$/, '').replace(/\/game\/night-rain$/, '');
const out = path.resolve(process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-motion-browser');
const selected = new Set((process.env.NIGHT_RAIN_SCENARIOS || '').split(',').filter(Boolean));
const errors = []; const evidence = []; const checks = [];
const scenarios = [
  { id: 'market-boss', slug: 'harei', index: 3, gap: 4.4 },
  { id: 'gate-captain', slug: 'shiori', index: 3, gap: 5 },
  { id: 'drowned-warden', slug: 'nana', index: 4, gap: 5.4 },
];
let passed = false;

// Disposable read-only observer of the rendered Three rig, installed before React
// boots. This avoids adding a scene traversal or mutation hook to normal gameplay.
function installRigObserver() {
  const roots = new Set();
  let nextRenderer = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(),
    inject(renderer) { const id = ++nextRenderer; this.renderers.set(id, renderer); return id; },
    onCommitFiberRoot(_id, root) { roots.add(root); }, onCommitFiberUnmount() {},
  };
  window.__nightMotionRig = id => {
    let actor = null;
    const visit = fiber => {
      for (let node = fiber; node && !actor; node = node.sibling) {
        if (node.stateNode?.isObject3D && node.stateNode.name === `enemy-${id}`) actor = node.stateNode;
        if (node.child) visit(node.child);
      }
    };
    for (const root of roots) { visit(root.current); if (actor) break; }
    if (!actor) return null;
    const body = actor.children[0];
    const legs = body.children.filter(c => c.isGroup && Math.abs(Math.abs(c.position.x) - 0.14) < 0.001 && Math.abs(c.position.y - 0.8) < 0.001);
    const soles = legs.map(leg => {
      const boot = leg.children.find(c => c.isMesh && c.geometry?.parameters?.width === 0.2);
      if (!boot) return null;
      const corners = [-1, 1].flatMap(x => [-1, 1].map(z => boot.localToWorld(boot.position.clone().set(x * 0.1, -0.125, z * 0.175)).toArray()));
      return { center: boot.getWorldPosition(boot.position.clone()).toArray(), corners };
    });
    return { position: actor.position.toArray(), body: { position: body.position.toArray(), rotation: body.rotation.toArray().slice(0, 3) }, legs: legs.map(c => c.rotation.toArray().slice(0, 3)), soles };
  };
}

async function snapshot(page) { return page.evaluate(() => JSON.parse(window.render_game_to_text())); }
async function advance(page, ms, input) {
  await page.evaluate(({ ms, input }) => { if (input) window.nightRain.input(input); window.advanceTime(ms); }, { ms, input });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function read(page, id) {
  return page.evaluate(id => ({ state: JSON.parse(window.render_game_to_text()), rig: window.__nightMotionRig(id) }), id);
}
async function capture(page, scenario, stage) {
  const { state, rig } = await read(page, scenario.id);
  const enemy = state.enemies.find(e => e.id === scenario.id);
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]), text: document.body.innerText, mode: document.querySelector('main[data-mode]')?.dataset.mode }));
  assert.ok(!layout.text.includes('旧城即将亮灯'));
  assert.ok(layout.width >= layout.scroll, 'no horizontal overflow');
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0] > 0 && layout.canvas[0][1] > 0);
  assert.equal(state.mode, 'playing'); assert.equal(enemy.action, stage === 'loaded' ? 'windup' : stage === 'contact' ? 'attack' : 'recover');
  assert.ok(rig && rig.soles.length === 2 && rig.soles.every(Boolean), 'observe actual rendered feet');
  const name = `${scenario.slug}-${stage}`; const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ state, rig, layout, pixels }, null, 2));
  evidence.push({ name, file, pixels, enemy: { action: enemy.action, timer: enemy.timer, x: enemy.x, y: enemy.y, z: enemy.z }, rig });
  console.log(`captured ${file}`);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const response = await fetch(`${base}/game/night-rain`, { signal: AbortSignal.timeout(120000) });
  assert.equal(response.status, 200, 'dev server must answer HTTP before browser launch');
  const { loadTypescriptModule: load } = await import('./tests/helpers/load-typescript-module.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const combat = await load('src/components/nightRain/enemyCombat.ts');
  const motion = await load('src/components/nightRain/enemyLocomotion.ts');
  const fixture = scenario => {
    const state = engine.createGame(); engine.startGame(state);
    const enemy = state.enemies.find(e => e.id === scenario.id);
    Object.assign(enemy, { hp: Math.floor(enemy.maxHp * 0.4), phase: 2, aggro: true, action: 'windup', attackIndex: scenario.index, facing: 0 });
    enemy.timer = combat.enemyAttack(enemy).windup;
    const position = { x: enemy.x, y: enemy.y, z: enemy.z + scenario.gap };
    Object.assign(state.player, position, { lastGround: { ...position }, fallPeak: position.y });
    state.lockedId = enemy.id;
    const raw = engine.saveGame(state); assert.ok(engine.loadGame(raw), `${scenario.slug}: production save validation`);
    return raw;
  };
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.NIGHT_RAIN_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  const open = async raw => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('https://pagead2.googlesyndication.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.route('https://hm.baidu.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.addInitScript(installVirtualPointerLock); await context.addInitScript(installRigObserver);
    await context.addInitScript(save => {
      localStorage.clear(); localStorage.setItem('night-rain-v1-slot-1', save);
      localStorage.setItem('night-rain-v1-settings', JSON.stringify({ enabled: false, voice: false }));
      localStorage.setItem('night-rain-audio-v1', JSON.stringify({ muted: true }));
      if ('speechSynthesis' in window) window.speechSynthesis.speak = () => {};
    }, raw);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/game/night-rain`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).waitFor({ timeout: 120000 });
    await page.evaluate(() => { window.advanceTime(0); window.__motionFreeze = setInterval(() => window.advanceTime(0), 200); });
    await page.getByRole('button', { name: '继续雨夜旅程 →', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('canvas') && document.querySelector('main[data-mode="playing"]') && !document.body.innerText.includes('旧城即将亮灯'), { timeout: 120000 });
    await page.evaluate(() => {
      const camera = JSON.parse(window.render_game_to_text()).camera;
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: (camera.yaw - 0.38) / 0.003, movementY: (0.32 - camera.pitch) / 0.003 }));
      document.dispatchEvent(new WheelEvent('wheel', { deltaY: (6.5 - camera.distance) / 0.006 }));
    });
    await page.waitForTimeout(700);
    return { page, context };
  };
  try {
    for (const scenario of scenarios) {
      if (selected.size && !selected.has(scenario.slug)) continue;
      console.log(`scenario ${scenario.slug}`);
      const { page, context } = await open(fixture(scenario));
      await page.waitForFunction(id => window.__nightMotionRig(id), scenario.id, { timeout: 120000 });
      await advance(page, 0);
      const initial = await snapshot(page); const enemy = initial.enemies.find(e => e.id === scenario.id);
      const spec = combat.enemyAttack(enemy); const samples = []; const captured = new Set();
      const gait = motion.createEnemyGait(enemy, initial.time);
      while (samples.length < 400) {
        const sample = await read(page, scenario.id); const e = sample.state.enemies.find(e => e.id === scenario.id);
        if (e.attackIndex !== scenario.index || !['windup', 'attack', 'recover'].includes(e.action)) break;
        assert.equal(sample.state.mode, 'playing'); assert.ok(sample.rig, 'actual rig available');
        motion.updateEnemyGait(gait, e, sample.state.time);
        const pose = motion.sampleEnemyPose(e, sample.state.time, gait);
        assert.ok(Math.abs(sample.rig.body.rotation[2] - pose.roll) < 0.0001, 'attack lunge must not create a walking body roll');
        assert.ok(Math.abs(sample.rig.legs[0][0] - pose.legL) < 0.0001 && Math.abs(sample.rig.legs[1][0] - pose.legR) < 0.0001, 'actual legs use the authored motion');
        assert.ok(Math.abs(e.y - enemy.y) < 0.001, 'feet stay on the same ground layer');
        const soleFloor = Math.min(...sample.rig.soles.flatMap(foot => foot.corners.map(corner => corner[1] - e.y)));
        assert.ok(soleFloor >= -0.00001, 'rendered soles must not penetrate the ground');
        const previous = samples.at(-1);
        if (previous && previous.enemy.action === e.action && e.action !== 'attack') assert.ok(Math.hypot(e.x - previous.enemy.x, e.z - previous.enemy.z) < 0.00001, 'windup and recovery roots stay planted');
        assert.equal(gait.phase, 0, 'attack lunge must not advance walking phase');
        samples.push({ time: sample.state.time, enemy: e, rig: sample.rig });
        const stage = e.action === 'windup' && e.timer < spec.windup * 0.55 && e.timer > combat.enemyTiming(e).commit ? 'loaded' : e.action === 'attack' && e.timer <= combat.ENEMY_STRIKE_TIME - combat.ENEMY_CONTACT_TIME && e.timer > 0.2 ? 'contact' : e.action === 'recover' && e.timer < spec.recovery * 0.55 && e.timer > spec.recovery * 0.35 ? 'retrieval' : null;
        if (stage && !captured.has(stage)) { await capture(page, scenario, stage); captured.add(stage); }
        await advance(page, 1000 / 60);
        assert.ok(samples.length < 400, 'one attack must finish');
      }
      assert.deepEqual([...captured], ['loaded', 'contact', 'retrieval']);
      fs.writeFileSync(path.join(out, `${scenario.slug}-continuous.json`), JSON.stringify(samples, null, 2));
      checks.push({ scenario: scenario.slug, samples: samples.length, captured: [...captured] });
      await context.close();
    }
    assert.deepEqual(errors, []); passed = true;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, passed, checks, errors, evidence }, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
