const assert = require('node:assert/strict');
const { quietContext } = require('./liuzhou-test-browser.cjs');
const { travel } = require('./liuzhou-pilot.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));

exports.runConversation = async ({ page: p, browser, capture, report }) => {
  const { loadTypescriptModule } = await import('../tests/helpers/load-typescript-module.mjs');
  const { stallPoint } = await loadTypescriptModule('src/components/liuzhou/street.ts');
  const close = async page => { for (let i = 0; (await state(page)).dialogue && i < 12; i++) await page.keyboard.press('KeyE'); };
  const inspect = async (page, name, speaker) => {
    await page.waitForTimeout(350);
    const frame = await page.evaluate(() => window.liuzhouTest.rig.framing());
    const dom = await page.getByRole('dialog').evaluate(el => ({ bounds: el.getBoundingClientRect().toJSON(), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    assert.equal(frame.offset, true);
    assert.equal(frame.actors.length, speaker ? 2 : 1);
    assert.equal((await state(page)).controls.pointerLocked, false);
    for (const actor of frame.actors) {
      assert.ok(actor.left >= frame.area.x - 2 && actor.right <= frame.area.x + frame.area.width + 2, `${name} ${JSON.stringify(actor)} ${JSON.stringify(frame.area)}`);
      assert.ok(actor.top >= frame.area.y - 2 && actor.bottom <= frame.area.y + frame.area.height + 2, `${name} ${JSON.stringify(actor)} ${JSON.stringify(frame.area)}`);
      assert.ok(actor.right <= dom.bounds.x || actor.left >= dom.bounds.right || actor.bottom <= dom.bounds.y || actor.top >= dom.bounds.bottom, `${name}: actual dialogue panel covers actor`);
    }
    assert.ok(dom.bounds.y >= 80 && dom.bounds.bottom <= page.viewportSize().height);
    const before = await state(page); const time = await page.evaluate(() => window.liuzhouTest.game.time);
    await page.evaluate(() => window.advanceTime(1000));
    const after = await state(page); assert.deepEqual(after.player, before.player); assert.equal(await page.evaluate(() => window.liuzhouTest.game.time), time);
    await capture(page, name);
    report.framing ||= []; report.framing.push({ name, frame, dom });
  };
  await travel(p, { x: 28, z: -23 });
  const rig = await p.evaluate(() => ({ yaw: window.liuzhouTest.rig.yaw, pitch: window.liuzhouTest.rig.pitch, zoom: window.liuzhouTest.rig.zoom }));
  await p.keyboard.press('KeyE'); await inspect(p, 'conversation-01-shiori-desktop', true);
  await p.keyboard.press('KeyE');
  await p.setViewportSize({ width: 390, height: 844 }); await inspect(p, 'conversation-02-shiori-portrait', true);
  await p.setViewportSize({ width: 844, height: 390 }); await inspect(p, 'conversation-03-shiori-landscape', true);
  await p.keyboard.press('Escape'); assert.equal((await state(p)).phase, 'paused');
  await p.getByRole('button', { name: '回到街上 ↗' }).click();
  await inspect(p, 'conversation-04-resume-dialogue', true);
  await close(p); await p.waitForTimeout(100);
  assert.equal((await p.evaluate(() => window.liuzhouTest.rig.framing())).offset, false);
  assert.deepEqual(await p.evaluate(() => ({ yaw: window.liuzhouTest.rig.yaw, pitch: window.liuzhouTest.rig.pitch, zoom: window.liuzhouTest.rig.zoom })), rig);
  await p.setViewportSize({ width: 1440, height: 900 });
  await travel(p, { x: 42, z: -8 }); await p.keyboard.press('KeyE');
  assert.equal((await state(p)).vehicle, 'bike-1');
  await travel(p, { x: -170, z: 117 }); await p.keyboard.press('KeyE');
  await travel(p, stallPoint(0, 2), { tolerance: 0.4 });
  await p.keyboard.press('KeyE'); await inspect(p, 'conversation-05-chef-stall', true); await close(p);
  assert.equal((await state(p)).stage, 2);
  await p.keyboard.press('KeyE'); await p.keyboard.press('KeyE');
  await inspect(p, 'conversation-06-chef-choices', true);
  await p.getByRole('button', { name: /接下这单/ }).click();
  assert.ok((await state(p)).life.delivery);
  await inspect(p, 'conversation-07-chef-followup', true); await close(p);
  await p.keyboard.press('Escape');
  const context = await quietContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await p.context().storageState() });
  try {
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const m = await context.newPage(); m.on('pageerror', e => report.errors.push(e.message)); m.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
    await m.goto(p.url()); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 60000 });
    await m.evaluate(() => window.liuzhouTest.manual(true)); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).tap();
    await m.keyboard.press('KeyE'); await m.getByRole('button', { name: /继续/ }).tap();
    await inspect(m, 'conversation-08-mobile-chef-choices', true);
    await m.setViewportSize({ width: 844, height: 390 }); await inspect(m, 'conversation-09-mobile-landscape-choices', true);
    const purchase = m.getByRole('button', { name: /买保温餐篮/ }); await purchase.scrollIntoViewIfNeeded(); await purchase.tap();
    assert.equal((await state(m)).life.insulated, true);
    await inspect(m, 'conversation-10-mobile-purchase', true);
    await m.getByRole('button', { name: /收起/ }).tap();
    await m.waitForTimeout(100); assert.equal((await m.evaluate(() => window.liuzhouTest.rig.framing())).offset, false);
  } finally { await context.close(); }
  report.checks.push('actual mounted actor bounds fit free canvas on desktop/portrait/landscape; stall camera and choice followups; frozen simulation; dialogue pause/resume; camera restores yaw/pitch/zoom; mobile scroll and touch purchase; every context uses virtual Pointer Lock');
};
