const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

// AUTOCHESS_SINGING=1 AUTOCHESS_BASE_URL=http://127.0.0.1:4073 node verify-autochess.cjs
module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  const report = { frames: {}, screenshots, errors, failedResponses };
  const evidence = async name => {
    await page.waitForFunction(() => [...document.images].filter(img => {
      const box = img.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    }).every(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dom = await page.evaluate(() => {
      const c = document.querySelector('[data-game-canvas="rift-line"]');
      return { width: c.width, height: c.height, css: c.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText };
    });
    assert.ok(dom.width > 0 && dom.height > 0 && dom.css.width > 0 && dom.css.height > 0);
    assert.ok(dom.overflow <= 1); await capture(`singing-${name}`);
    report.frames[name] = { state: await state(), dom };
  };
  await page.locator('.rift-dom-choice').first().click();
  if (process.env.AUTOCHESS_SINGING_ROSTER === '1') {
    await page.getByRole('button', { name: '图鉴 / 本局天赋' }).click();
    await page.getByRole('button', { name: '查看山猪王详情', exact: true }).click();
    const detail = await page.locator('[data-codex-unit-details]').innerText();
    assert.match(detail, /山猪冲阵/); assert.doesNotMatch(detail, /合唱/);
    await evidence('roster-seki');
    await page.getByRole('button', { name: '羁绊', exact: true }).click();
    const song = page.locator('article').filter({ hasText: '合唱 · 职业' });
    await song.scrollIntoViewIfNeeded();
    const songText = await song.innerText();
    assert.doesNotMatch(songText, /星汐/);
    const members = songText.split('相关棋子：')[1].trim().split('、');
    assert.deepEqual([...members].sort(), ['老弥', '雅吨', '七海大鲨鱼', '蛙梓', '小红帽', '塔神', '泽音美乐蒂', '狍子偶像', '路牌女'].sort());
    await evidence('roster-singers');
    assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []);
    writeFileSync('.tmp/autochess/singing-roster-report.json', JSON.stringify({ ...report, members }, null, 2));
    console.log(JSON.stringify({ members, errors, screenshots: Object.keys(screenshots) }, null, 2));
    return;
  }
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    bridge.setConsoleLogging(false); const e = bridge.engine;
    e.state.gold = 100; e.state.playerLevel = 10;
    e.state.board.fill(null); e.state.bench.fill(null);
    e.state.shop = ['viridis', 'clock_gunner', 'rift_brawler', 'sui', 'tower_god'];
    bridge.dispatch({ type: 'clearSelection' });
  });
  await page.getByRole('button', { name: /^购买植物学家/ }).hover();
  await evidence('shop');
  await page.getByRole('button', { name: /^购买植物学家/ }).click();
  await page.getByRole('button', { name: '图鉴 / 本局天赋' }).click();
  await page.getByRole('button', { name: '查看植物学家详情', exact: true }).click();
  const detail = page.locator('[data-codex-unit-details]');
  const text = await detail.innerText();
  assert.match(text, /裸子植物/); assert.match(text, /怕死/); assert.doesNotMatch(text, /主持/);
  await evidence('green-codex');
  await page.getByRole('button', { name: '羁绊', exact: true }).click();
  const song = page.locator('article').filter({ hasText: '合唱 · 职业' });
  assert.equal(await song.count(), 1); await song.scrollIntoViewIfNeeded();
  const songText = await song.innerText();
  assert.deepEqual(songText.split('相关棋子：')[1].trim().split('、').sort(), ['老弥', '雅吨', '七海大鲨鱼', '蛙梓', '小红帽', '塔神', '泽音美乐蒂', '狍子偶像', '路牌女'].sort());
  for (const expected of [/2 名/, /4 名/, /6 名/, /12%/, /20%/, /30%/, /4 秒休息/, /术盾/]) assert.match(songText, expected);
  await evidence('trait-codex');
  await page.setViewportSize({ width: 390, height: 844 }); await song.scrollIntoViewIfNeeded();
  await evidence('trait-mobile');
  await page.getByRole('button', { name: '关闭 Esc', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge; const e = bridge.engine;
    e.state.round = 16; e.state.board.fill(null);
    const specs = [['viridis', 3, 5], ['clock_gunner', 2, 12], ['grove_mender', 2, 13], ['tower_god', 2, 14], ['rift_brawler', 2, 6], ['sui', 2, 7], ['cinder_ram', 2, 8]];
    specs.forEach(([id, star, slot], i) => { e.state.board[slot] = { uid: i + 300, id, star }; });
    bridge.dispatch({ type: 'clearSelection' });
    window.__singingCasts = []; window.__singingHeals = []; window.__singingShields = [];
    const cast = e.castAbility.bind(e); const heal = e.heal.bind(e); const shield = e.grantAbilityShield.bind(e);
    e.heal = (s, t, a, show) => { const result = heal(s, t, a, show); window.__singingHeals.push({ source: s?.unitId, target: t.unitId, amount: a, healed: result, at: e.state.battle?.elapsed }); return result; };
    e.grantAbilityShield = (s, t, a, d, b) => { const result = shield(s, t, a, d, b); window.__singingShields.push({ source: s?.unitId, target: t.unitId, amount: a, granted: result, duration: d, at: b?.elapsed }); return result; };
    e.castAbility = (s, targets, range) => {
      const before = structuredClone(e.state.battle.singing);
      const result = cast(s, targets, range);
      window.__singingCasts.push({ id: s.unitId, at: e.state.battle.elapsed, before, after: structuredClone(e.state.battle.singing), plants: structuredClone(e.state.battle.healingZones), x: s.x, y: s.y, shield: s.shield, maxHp: s.maxHp });
      return result;
    };
  });
  const prepared = await state(); assert.equal(prepared.activeTraits.find(t => t.name === '合唱').count, 6);
  await evidence('formation'); await page.getByRole('button', { name: /开始战斗/ }).click();
  await page.evaluate(() => window.autoChessAI.bridge.setBattlePaused(true));
  let greenSeen = false; let chorusSeen = false;
  const verifyPlants = process.env.AUTOCHESS_VERIFY_PLANTS === '1';
  for (let tick = 0; tick < 450 && (await state()).phase === 'battle'; tick++) {
    await page.evaluate(() => window.advanceTime(100));
    const observed = await page.evaluate(() => ({ casts: window.__singingCasts, song: window.autoChessAI.bridge.engine.state.battle.singing.player }));
    if (!greenSeen && observed.casts.some(c => c.id === 'viridis' && c.plants.some(z => z.kind === 'plant'))) { greenSeen = true; await evidence('natural-green'); }
    if (!chorusSeen && observed.song.choruses > 0) { chorusSeen = true; await evidence('natural-chorus'); }
    if (chorusSeen && (!verifyPlants || greenSeen)) break;
  }
  report.observed = await page.evaluate(() => ({ casts: window.__singingCasts, heals: window.__singingHeals, shields: window.__singingShields }));
  if (verifyPlants) assert.ok(greenSeen, '小松绿应自然受击施法');
  assert.ok(chorusSeen, '六合唱应自然完成和声');
  const chorus = report.observed.casts.find(c => c.after.player.choruses > c.before.player.choruses);
  assert.equal(chorus.before.player.voices.length, 3); assert.equal(chorus.after.player.voices.length, 0);
  assert.ok(report.observed.heals.some(h => h.healed > 0 && Math.abs(h.at - chorus.at) < 1e-6));
  assert.ok(report.observed.shields.some(s => s.granted > 0 && s.duration === 3 && Math.abs(s.at - chorus.at) < 1e-6));
  await page.setViewportSize({ width: 390, height: 844 }); await evidence('battle-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '游戏设置', exact: true }).click(); await page.locator('.rift-setting-version').click();
  assert.match(await page.locator('.rift-release-notes').innerText(), /九人合唱/);
  await evidence('release'); assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []);
  writeFileSync('.tmp/autochess/singing-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ greenSeen, chorusSeen, chorusAt: chorus.at, screenshots: Object.keys(screenshots), errors }, null, 2));
};
