const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const world = require('../src/components/liuzhou/world.ts');
const city = require('../src/components/liuzhou/city.ts');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const { bridgeSurface } = require('../src/components/liuzhou/bridges.ts');
const underground = require('../src/components/liuzhou/underground.ts');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-city-flight-dev';
const report = { scope: 'Eight requested districts on one running build. Flight and ground arrival smoke tour; detailed route coverage is supplied by the district rule suites.', errors: [], checks: [], captures: [], passed: false };

(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(`${base}/game/liuzhou?test=1`);
    const start = page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' });
    await start.waitFor({ timeout: 90000 });
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
    await page.evaluate(() => window.liuzhouTest.manual(true));
    await start.click();
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), true);
    const capture = async (name) => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`);
      const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom });
    };
    await page.evaluate(() => { window.liuzhouTest.move({ jump: true }, 420); });
    await capture('01-takeoff');
    assert.ok(await page.evaluate(() => window.liuzhouTest.game.player.y > 140));
    const flyTo = async (x, z) => {
      // Only orientation and normal input are set; travel uses shipped Rapier.
      for (let i = 0; i < 50; i++) {
        const remaining = await page.evaluate(({ x, z }) => {
          const t = window.liuzhouTest; const p = t.game.player; const d = Math.hypot(x - p.x, z - p.z);
          t.rig.yaw = Math.atan2(x - p.x, z - p.z); t.rig.reset = true; t.rig.dragged = performance.now();
          if (d > 8) t.move({ forward: 1, sprint: d > 130 }, Math.min(90, Math.max(1, Math.floor((d - 5) / (d > 130 ? 160 : 55) * 60))));
          return d;
        }, { x, z });
        if (remaining < 9) break;
      }
      await page.evaluate(() => window.liuzhouTest.move({}, 50));
      const p = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
      assert.ok(Math.hypot(x - p.x, z - p.z) < 18, JSON.stringify({ x, z, p }));
      return p;
    };
    for (const [name, x, z, yaw, pitch] of [
      ['02-wuxing', -420, -90, -1.2, 0.3],
      ['03-people-square', -555, -735, 0.1, 0.42],
      ['04-guangya', -1755, -1261, -1.55, 0.3],
      ['05-railway-station', -2660, 440, -1.55, 0.18],
      ['06-eshan-park', -3010, -285, -1.7, 0.15],
      ['07-xihuan-eshan', -3214, -664, 0.3, 0.38],
      ['08-beizhan-market', -735, -2020, Math.PI / 2, 0.25],
    ]) {
      const p = await flyTo(x, z);
      await page.evaluate(({ yaw, pitch }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom: 18, reset: true, dragged: performance.now() }), { yaw, pitch });
      await capture(name); report.checks.push({ name, player: p, travelledByNormalInput: true });
      const candidate = name === '04-guangya' ? { point: { x, z }, a: { x: x - 20, z }, b: { x: x + 20, z }, support: bridgeSurface({ x, z }).y } : city.CITY_ROAD_SEGMENTS
        .filter(s => !s.road.bridge)
        .map(s => ({ ...s, point: world.closestOnSegment({ x, z }, s.a, s.b) }))
        .filter(s => world.distance(s.a, s.b) > 8 && !world.inRiver(s.point) && !world.BUILDINGS.some(b => world.buildingContains(s.point, b, 4)))
        .sort((a, b) => world.distance(a.point, { x, z }) - world.distance(b.point, { x, z }))[0];
      assert.ok(candidate);
      await flyTo(candidate.point.x, candidate.point.z);
      await page.evaluate(() => { window.liuzhouTest.move({ descend: true }, 1050); });
      await page.keyboard.press('f');
      assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
      const ground = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
      const support = candidate.support ?? terrainTriangleHeight(ground);
      assert.ok(Math.abs(ground.y - support) < 0.65, JSON.stringify({ name, ground, support }));
      await page.evaluate(({ a, b }) => { const t = window.liuzhouTest; t.rig.yaw = Math.atan2(b.x - a.x, b.z - a.z); t.rig.pitch = 0.12; t.rig.zoom = 12; t.rig.reset = true; t.move({ forward: 1 }, 45); }, candidate);
      const walking = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
      assert.ok(world.distance(ground, walking) > 1.5, JSON.stringify({ name, ground, walking }));
      await capture(`${name}-ground`); report.checks.push({ name: `${name}-ground`, ground, walking, support });
      await page.keyboard.press('f');
      await page.evaluate(() => { window.liuzhouTest.move({ jump: true, sprint: true }, 270); });
    }
    // Reach an actual stair from the same continuous flight tour. No fixture
    // save or position rewrite is used to enter the lower layer.
    const entry = underground.UNDERGROUND_ENTRANCES.find(e => e.id === '1275168873');
    const stairYaw = Math.atan2(entry.points[1][0] - entry.top[0], entry.points[1][1] - entry.top[1]);
    const outside = [entry.top[0] - Math.sin(stairYaw) * 2, entry.top[1] - Math.cos(stairYaw) * 2];
    const go = async (point, flying = false) => {
      let previous = Infinity; let stalled = 0;
      // Ground waypoints use the same half-metre arrival radius as the
      // underground route verifier, leaving the capsule room at stair bends.
      const arrival = flying ? 0.18 : 0.5;
      for (let chunk = 0; chunk < 250; chunk++) {
        const remaining = await page.evaluate(({ point, flying, arrival }) => {
          const t = window.liuzhouTest; const p = t.game.player; const d = Math.hypot(point[0] - p.x, point[1] - p.z);
          t.rig.yaw = Math.atan2(point[0] - p.x, point[1] - p.z); t.rig.dragged = performance.now();
          if (d >= arrival) t.move({ forward: flying ? Math.min(1, d * 1.5) : 1, precise: flying }, Math.max(1, Math.min(60, Math.floor((d - (flying ? 0.06 : 0.25)) / (flying ? 6 : 4.4) * 60))));
          return d;
        }, { point, flying, arrival });
        if (remaining < arrival) return;
        stalled = Math.abs(previous - remaining) < 0.015 ? stalled + 1 : 0; previous = remaining;
        assert.ok(stalled < 8, `stair approach stalled ${JSON.stringify({ point, remaining, flying, player: await page.evaluate(() => ({ ...window.liuzhouTest.game.player })) })}`);
      }
      assert.fail(`stair approach did not reach ${JSON.stringify(point)}`);
    };
    await flyTo(...outside); await go(outside, true);
    await page.evaluate(() => window.liuzhouTest.move({ descend: true }, 1100)); await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
    for (const point of entry.points) await go(point);
    await go([-595, -118]);
    await page.evaluate(() => Object.assign(window.liuzhouTest.rig, { yaw: Math.PI, pitch: 0.1, zoom: 6, reset: true, dragged: performance.now() }));
    const lower = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(lower.underground, 'concourse'); assert.ok(lower.player.y < 2);
    await capture('09-underground-concourse');
    await go(entry.bottom);
    for (const point of [...entry.points].reverse()) await go(point);
    await go(outside);
    const returned = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(returned.underground, null);
    report.checks.push({ name: '09-underground', lower: lower.player, returned: returned.player, travelledByNormalInput: true });
    await page.evaluate(stairYaw => Object.assign(window.liuzhouTest.rig, { yaw: stairYaw + Math.PI, pitch: 0.25, zoom: 8, reset: true, dragged: performance.now() }), stairYaw);
    await capture('10-underground-returned');
    await page.keyboard.press('f'); await page.evaluate(() => window.liuzhouTest.move({ jump: true }, 200));
    await page.keyboard.press('m');
    await page.getByRole('button', { name: '柳州火车站', exact: true }).click();
    await capture('11-city-map');
    for (const district of city.CITY_DISTRICTS) assert.equal(await page.getByRole('button', { name: district.name, exact: true }).count(), 1);
    await page.getByRole('button', { name: '回到街上 ↗', exact: true }).click();
    const nav = await page.evaluate(() => JSON.parse(window.render_game_to_text()).navigation);
    assert.equal(nav.guidance, 'bearing'); assert.equal(nav.destination.id, 'railway-station');
    assert.match(await page.getByLabel('街区导航', { exact: true }).innerText(), /直线方位/);
    await page.keyboard.press('Escape');
    const frozen = await page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    await page.evaluate(() => window.liuzhouTest.move({ forward: 1, jump: true }, 120));
    assert.deepEqual(await page.evaluate(() => ({ ...window.liuzhouTest.game.player })), frozen);
    await page.getByRole('button', { name: '回到街上 ↗', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const label of ['飞行降低', '飞行加速', '飞行慢速']) {
      const rect = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 390 && rect.y + rect.height <= 844, `${label} must be on-screen`);
    }
    await capture('12-mobile-flight');
    assert.equal(report.checks.filter(c => c.travelledByNormalInput).length, 8, 'all eight named districts have current-build arrival evidence');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
