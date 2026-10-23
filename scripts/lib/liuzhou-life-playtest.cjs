const { quietContext } = require('./liuzhou-test-browser.cjs');
const assert = require('node:assert/strict');
const { travel } = require('./liuzhou-pilot.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const close = async p => { while ((await state(p)).dialogue) await p.keyboard.press('KeyE'); };
const menu = async p => {
  await travel(p, { x: -170, z: 117 });
  await p.keyboard.press('KeyE');
  assert.ok((await state(p)).dialogue);
  await p.keyboard.press('KeyE');
  await p.getByRole('button', { name: /这次先逛逛/ }).waitFor();
};
async function runStreetLife({ page: p, browser, capture, report }) {
  const initial = await state(p);
  await menu(p);
  await capture(p, 'life-01-shop');
  await p.keyboard.press('KeyE');
  assert.equal((await state(p)).life.delivery, null);
  assert.equal((await state(p)).money, initial.money);
  await menu(p); await p.keyboard.press('Digit1');
  assert.equal((await state(p)).player.character, initial.player.character);
  const firstId = (await state(p)).life.delivery.id;
  await p.keyboard.press('Digit1'); assert.equal((await state(p)).life.delivery.id, firstId);
  await close(p);
  await p.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text());
    return s.navigation?.destination.kind === 'delivery' && ['route', 'arrived'].includes(s.navigation.status);
  });
  await p.keyboard.press('KeyM'); const paused = (await state(p)).life.delivery.elapsed;
  await p.evaluate(() => window.advanceTime(5000)); assert.equal((await state(p)).life.delivery.elapsed, paused);
  await capture(p, 'life-02-order-map'); await p.keyboard.press('Escape');
  await p.reload(); await p.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 60000 });
  await p.evaluate(() => window.liuzhouTest.manual(true));
  await p.getByRole('button', { name: '继续这趟旅行 ↗' }).click();
  assert.equal((await state(p)).life.delivery.id, firstId);
  assert.ok(Math.abs((await state(p)).life.delivery.elapsed - paused) < 1);
  await capture(p, 'life-03-reloaded-package');
  for (let route = 0; route < 3; route++) {
    let s = await state(p);
    if (route > 0) {
      await menu(p);
      if (route === 1) {
        const money = (await state(p)).money;
        await p.getByRole('button', { name: /买保温餐篮/ }).click();
        assert.equal((await state(p)).money, money - 32);
        assert.equal((await state(p)).life.insulated, true); await close(p);
        await menu(p); assert.equal(await p.getByRole('button', { name: /买保温餐篮/ }).count(), 0);
      }
      await p.getByRole('button', { name: /接下这单/ }).click(); await close(p);
    }
    assert.equal((await state(p)).life.delivery.route, route);
    if (route === 2) await p.evaluate(() => window.advanceTime(151000));
    s = await state(p);
    const npc = s.npcs.find(n => n.id === ['uncle', 'walker-3', 'walker-4'][route]);
    console.log(`Neighbor delivery ${route + 1}: ${npc.name}`);
    await travel(p, npc);
    // A wandering resident may have moved while we crossed the old street.
    for (let attempt = 0; attempt < 3; attempt++) {
      s = await state(p); const target = s.npcs.find(n => n.id === npc.id);
      if (s.interaction?.id === npc.id) break;
      await travel(p, target, { tolerance: 1.8 });
    }
    await p.keyboard.press('KeyE'); s = await state(p);
    assert.equal(s.dialogue.effect.kind, 'delivery');
    const money = s.money;
    await p.evaluate(() => window.advanceTime(5000)); assert.equal((await state(p)).life.delivery.elapsed, s.life.delivery.elapsed);
    if (route === 0) {
      await p.reload(); await p.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 60000 });
      await p.evaluate(() => window.liuzhouTest.manual(true)); await p.getByRole('button', { name: '继续这趟旅行 ↗' }).click();
      assert.equal((await state(p)).money, money); assert.ok((await state(p)).life.delivery);
      await p.keyboard.press('KeyE');
      await p.waitForFunction(() => Number(document.querySelector('canvas').dataset.cameraDistance) >= 3);
    }
    await capture(p, `life-0${4 + route}-recipient`); await close(p);
    s = await state(p); assert.equal(s.life.delivered, route + 1); assert.equal(s.life.delivery, null);
    assert.equal(s.life.receipt.warm, route < 2); assert.equal(s.money, money + (route < 2 ? 18 : 12));
    await p.keyboard.press('KeyE'); await close(p); assert.equal((await state(p)).money, s.money);
  }
  await menu(p); await p.getByRole('button', { name: /接下这单/ }).click(); await close(p);
  const beforeCancel = await state(p);
  await menu(p); await p.getByRole('button', { name: /取消这单/ }).click(); await close(p);
  assert.equal((await state(p)).life.delivery, null); assert.equal((await state(p)).money, beforeCancel.money);
  await p.keyboard.press('KeyJ'); await capture(p, 'life-07-journal'); await p.keyboard.press('Escape');
  report.checks.push('three rotating neighborhood deliveries reached by normal movement; warm/cold pay, no-fail late order, atomic receiving dialogue and reload, one-time permanent basket, cancel, dialogue number keys, safe E, pause/interaction time freeze');
  const mctx = await quietContext(browser, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, storageState: await p.context().storageState() });
  try {
    await mctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await mctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const m = await mctx.newPage(); m.on('pageerror', e => report.errors.push(e.message));
    m.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
    await m.goto(p.url()); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 60000 });
    await m.evaluate(() => window.liuzhouTest.manual(true)); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).tap();
    await m.getByRole('button', { name: '互动', exact: true }).tap(); await m.getByRole('button', { name: /继续.*E/ }).tap();
    const accept = m.getByRole('button', { name: /接下这单/ });
    const box = await accept.boundingBox(); assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= 390);
    await capture(m, 'life-08-mobile-shop-landscape');
    await accept.tap(); await m.getByRole('button', { name: /收起.*E/ }).tap(); assert.ok((await state(m)).life.delivery);
    await m.setViewportSize({ width: 390, height: 844 }); await capture(m, 'life-09-mobile-package-portrait');
    await m.getByRole('button', { name: '互动', exact: true }).tap(); await m.getByRole('button', { name: /继续.*E/ }).tap();
    await capture(m, 'life-10-mobile-cancel-portrait');
    await m.getByRole('button', { name: /取消这单/ }).tap(); await m.getByRole('button', { name: /收起.*E/ }).tap();
    assert.equal((await state(m)).life.delivery, null);
    report.checks.push('earned save restored on simulated touch device; 844×390 shop choice bounds, tap accept, 390×844 parcel HUD and tap cancel');
  } finally { await mctx.close(); }
}
module.exports = { runStreetLife };
