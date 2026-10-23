const assert = require('node:assert/strict');
const { quietContext } = require('./liuzhou-test-browser.cjs');
const { travel } = require('./liuzhou-pilot.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function ready(p, id, mode) {
  await p.waitForFunction(({ id, mode }) => {
    const n = JSON.parse(window.render_game_to_text()).navigation;
    return n && n.destination.id === id && (!mode || n.mode === mode) && ['route', 'arrived'].includes(n.status);
  }, { id, mode }, { timeout: 20000 });
  const route = (await state(p)).navigation;
  if (route.status === 'route') await p.locator(`[data-navigation-route="${id}"]`).first().waitFor();
  return route;
}
async function openMap(p) { await p.getByRole('button', { name: '打开街区地图' }).click(); }
async function select(p, name) { await p.getByRole('button', { name, exact: true }).click(); }
// Follow the actual shipped route with ordinary walking inputs. This differs
// from travel(), which has an independent test-only planner.
async function followWalkingRoute(p) {
  for (let tick = 0; tick < 2400; tick += 6) {
    const s = await state(p); const n = s.navigation;
    if (n.status === 'arrived') return;
    assert.equal(n.status, 'route');
    const target = n.points.find(q => Math.hypot(q.x - s.player.x, q.z - s.player.z) > 1.2) || n.points.at(-1);
    await p.evaluate(target => {
      const t = window.liuzhouTest;
      const angle = Math.atan2(target.x - t.game.player.x, target.z - t.game.player.z) - t.rig.yaw;
      t.move({ forward: Math.cos(angle), turn: -Math.sin(angle) }, 6);
    }, target);
  }
  throw new Error('Walking along the shipped navigation route stalled');
}
exports.runNavigation = async ({ page: p, browser, capture, report }) => {
  await ready(p, 'story-0-shiori', 'walk');
  await openMap(p); await capture(p, 'navigation-01-story-map');
  await select(p, '文惠桥'); const bridge = await ready(p, 'bridge');
  assert.ok(bridge.metres > 200); assert.ok(bridge.points.some(q => q.z > 200));
  await capture(p, 'navigation-02-bridge-map');
  // Queue several worker searches; only the final selection may win.
  for (const name of ['曙光东路', '柳江北岸', '东门城楼', '金沙角']) await select(p, name);
  await ready(p, 'square'); await p.waitForTimeout(1200);
  assert.equal((await state(p)).navigation.destination.id, 'square');
  await select(p, '跟随任务'); await ready(p, 'story-0-shiori'); await p.keyboard.press('Escape');
  await followWalkingRoute(p);
  assert.equal((await state(p)).interaction.id, 'shiori');
  await p.keyboard.press('KeyE');
  while ((await state(p)).dialogue) await p.keyboard.press('KeyE');
  assert.equal((await state(p)).stage, 1);
  await ready(p, 'story-1-chef');
  await travel(p, { x: 42, z: -8 }); await p.keyboard.press('KeyE');
  assert.equal((await state(p)).vehicle, 'bike-1'); await ready(p, 'story-1-chef', 'bike');
  await capture(p, 'navigation-03-bike-route');
  await travel(p, { x: 60, z: 20 }, { tolerance: 2 });
  await p.waitForTimeout(900);
  const deviated = await state(p);
  assert.ok(Math.hypot(deviated.navigation.points[0].x - deviated.player.x, deviated.navigation.points[0].z - deviated.player.z) < 0.1);
  await p.keyboard.press('KeyE'); await ready(p, 'story-1-chef', 'walk');
  await travel(p, { x: 45, z: 5 }); await p.keyboard.press('KeyE');
  assert.equal((await state(p)).vehicle, 'car-2'); await ready(p, 'story-1-chef', 'car');
  await openMap(p); await select(p, '文惠桥'); await ready(p, 'bridge', 'car');
  await capture(p, 'navigation-04-car-bridge');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  const context = await quietContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await p.context().storageState() });
  try {
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const m = await context.newPage(); m.on('pageerror', e => report.errors.push(e.message));
    m.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
    await m.goto(p.url()); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 60000 });
    await m.evaluate(() => window.liuzhouTest.manual(true)); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).tap();
    await ready(m, 'story-1-chef');
    assert.notEqual((await state(m)).navigation.destination.id, 'bridge', 'temporary landmark choice does not overwrite the saved story');
    await m.getByRole('button', { name: '地图', exact: true }).tap();
    await m.getByRole('button', { name: '金沙角', exact: true }).tap(); await ready(m, 'square');
    await capture(m, 'navigation-05-mobile-map');
    await m.getByRole('button', { name: '关闭面板，继续游戏' }).tap();
    assert.ok(await m.getByLabel('街区导航').getByText('金沙角', { exact: true }).isVisible());
    await capture(m, 'navigation-06-mobile-route');
    await m.setViewportSize({ width: 844, height: 390 });
    assert.ok(await m.getByLabel('街区导航').getByText('金沙角', { exact: true }).isVisible());
    await capture(m, 'navigation-07-landscape-route');
  } finally { await context.close(); }
  report.checks.push('worker routes and actual SVG polylines; rapid destinations ignore stale replies; ordinary walking follows the shipped path to Shiori; task completion changes route; bike/car mode and deviation update; earned save reload resumes story; mobile map selection and orientation');
};
