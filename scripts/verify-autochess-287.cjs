const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

// AUTOCHESS_287=1 AUTOCHESS_BASE_URL=http://127.0.0.1:4071 node verify-autochess.cjs
// Uses the parent verifier's muted installed Chrome and page screenshots.
module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  const report = { frames: {}, casts: [], screenshots, errors, failedResponses };
  const evidence = async (name) => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dom = await page.evaluate(() => {
      const c = document.querySelector('[data-game-canvas="rift-line"]');
      return { width: c.width, height: c.height, css: c.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText };
    });
    assert.ok(dom.width > 0 && dom.height > 0 && dom.css.width > 0 && dom.css.height > 0);
    assert.ok(dom.overflow <= 1);
    await capture(`287-${name}`);
    report.frames[name] = { state: await state(), dom };
  };
  await page.locator('.rift-dom-choice').first().click();
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    bridge.setConsoleLogging(false);
    bridge.engine.state.gold = 100;
    bridge.engine.state.playerLevel = 8;
    bridge.engine.state.board.fill(null);
    bridge.engine.state.bench.fill(null);
    bridge.engine.state.shop = ['viridis', 'sumire', 'chu2u', 'komichi', 'viridis'];
    bridge.dispatch({ type: 'clearSelection' });
  });
  await page.getByRole('button', { name: /^购买植物学家/ }).first().hover();
  await page.waitForTimeout(200);
  await evidence('shop');
  for (const [name, cost] of [['植物学家', 2], ['紫色妈妈', 4], ['烂梗小孩', 4], ['路牌女', 5]]) {
    const before = await state();
    await page.getByRole('button', { name: new RegExp(`^购买${name}`) }).first().click();
    assert.equal((await state()).player.gold, before.player.gold - cost);
  }
  const purchased = await state();
  assert.equal(purchased.activeTraits.find(t => t.name === '287').count, 4);
  assert.equal(purchased.activeTraits.find(t => t.name === '287').level, 2);
  await page.getByRole('button', { name: '图鉴 / 本局天赋' }).click();
  for (const name of ['植物学家', '紫色妈妈', '烂梗小孩']) {
    // Start from the overview each time so selection does not depend on scroll.
    await page.getByRole('button', { name: '概览', exact: true }).click();
    await page.getByRole('button', { name: `查看${name}详情`, exact: true }).click();
    await page.locator('[data-codex-unit-details]').waitFor();
    assert.match(await page.locator('[data-codex-unit-details]').innerText(), /1星|1 星/);
    await evidence(`codex-${name.split(/[VS c]/)[0]}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.locator('[data-codex-unit-details]').scrollIntoViewIfNeeded();
  await evidence('codex-mobile');
  await page.getByRole('button', { name: '关闭 Esc', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const engine = bridge.engine;
    engine.state.round = 8;
    engine.state.gold = 30;
    engine.state.board.fill(null);
    const specs = [['viridis', 2, 0], ['sumire', 2, 6], ['chu2u', 2, 12], ['komichi', 2, 5], ['mossback', 2, 11], ['nagisa', 2, 17]];
    specs.forEach(([id, star, slot], i) => { engine.state.board[slot] = { uid: i + 300, id, star }; });
    bridge.dispatch({ type: 'clearSelection' });
    window.__casts287 = [];
    const cast = engine.castAbility.bind(engine);
    engine.castAbility = (source, targets, enforceRange) => {
      const before = targets.map(t => ({ fid: t.fid, hp: t.hp, energy: t.energy }));
      const result = cast(source, targets, enforceRange);
      if (['viridis', 'sumire', 'chu2u'].includes(source.unitId)) {
        window.__casts287.push({ id: source.unitId, at: engine.state.battle.elapsed, before, after: targets.map(t => ({ fid: t.fid, hp: t.hp, energy: t.energy })), plants: structuredClone(engine.state.battle.healingZones), vines: structuredClone(engine.state.battle.controlZones), volley: structuredClone(engine.state.battle.projectileVolley) });
      }
      return result;
    };
  });
  await evidence('formation');
  await page.getByRole('button', { name: /开始战斗/ }).click();
  await page.evaluate(() => window.autoChessAI.bridge.setBattlePaused(true));
  const seen = new Set();
  for (let tick = 0; tick < 240 && (await state()).phase === 'battle'; tick++) {
    await page.evaluate(() => window.advanceTime(100));
    const casts = await page.evaluate(() => window.__casts287);
    for (const cast of casts) if (!seen.has(cast.id)) {
      seen.add(cast.id);
      if (cast.id === 'chu2u') await page.evaluate(() => window.advanceTime(200));
      await evidence(`natural-${cast.id}`);
    }
    if (seen.size === 3) break;
  }
  report.casts = await page.evaluate(() => window.__casts287);
  assert.deepEqual([...seen].sort(), ['chu2u', 'sumire', 'viridis']);
  assert.ok(report.casts.some(c => c.id === 'sumire' && c.before.some((b, i) => c.after[i].hp < b.hp)));
  assert.ok(report.casts.some(c => c.id === 'viridis' && c.plants.some(z => z.kind === 'plant')));
  assert.ok(report.casts.some(c => c.id === 'chu2u' && c.volley.filter(s => s.emoji && ['📡', '👽', '😼'].includes(s.emoji)).length === 3));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await evidence('battle-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '游戏设置', exact: true }).click();
  await page.locator('.rift-setting-version').click();
  assert.match(await page.locator('.rift-release-notes').innerText(), /287 全员开麦/);
  assert.match(await page.locator('.rift-release-notes').innerText(), /四费从 9 位补至 11 位/);
  await evidence('release-notes');
  assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []);
  writeFileSync('.tmp/autochess/287-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ casts: report.casts.map(c => ({ id: c.id, at: c.at })), screenshots: Object.keys(screenshots), errors }, null, 2));
};
