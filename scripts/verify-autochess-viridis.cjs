const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

// Reuse verify-autochess.cjs: installed Chrome, muted speech/audio and page screenshot sanity.
module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  const report = { frames: {}, screenshots, errors, failedResponses };
  const evidence = async name => {
    await page.waitForFunction(() => [...document.images].filter(img => {
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    }).every(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dom = await page.evaluate(() => {
      const canvas = document.querySelector('[data-game-canvas="rift-line"]');
      return { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText };
    });
    assert.ok(dom.width > 0 && dom.height > 0 && dom.rect.width > 0 && dom.rect.height > 0);
    assert.ok(dom.overflow <= 1);
    await capture(`viridis-${name}`);
    report.frames[name] = { state: await state(), dom };
  };
  await page.locator('.rift-dom-choice').first().click();
  await page.getByRole('button', { name: '图鉴 / 本局天赋' }).click();
  await page.getByRole('button', { name: /^查看(?:小松绿Viridis|植物学家)详情$/ }).click();
  const detail = await page.locator('[data-codex-unit-details]').innerText();
  assert.match(detail, /满能量自动释放/);
  assert.match(detail, /满能量即放/);
  assert.doesNotMatch(detail, /受击释放|满能量受击|受击后自身/);
  await evidence('codex');
  await page.getByRole('button', { name: '关闭 Esc', exact: true }).click();
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    bridge.setConsoleLogging(false);
    const engine = bridge.engine;
    engine.state.playerLevel = 10; engine.state.board.fill(null);
    engine.state.board[0] = { uid: 900, id: 'viridis', star: 1 };
    engine.state.board[1] = { uid: 901, id: 'nori', star: 1 };
    bridge.dispatch({ type: 'clearSelection' });
    window.__viridisCasts = [];
    const cast = engine.castAbility.bind(engine);
    engine.castAbility = (source, targets, inRange) => {
      const before = { energy: source.energy, hp: source.hp, damageTaken: source.damageTaken, hitPulse: source.hitPulse };
      const result = cast(source, targets, inRange);
      if (source.unitId === 'viridis') window.__viridisCasts.push({ before, energy: source.energy, shield: source.shield, maxHp: source.maxHp, at: engine.state.battle.elapsed, zones: structuredClone(engine.state.battle.healingZones) });
      return result;
    };
  });
  await page.getByRole('button', { name: /开始战斗/ }).click();
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge; bridge.setBattlePaused(true);
    const battle = bridge.engine.state.battle;
    // Controlled rear-line case: enemies cannot hit; keep natural passive energy on Viridis.
    [...battle.player, ...battle.enemy].forEach(f => {
      f.moveSpeed = f.baseMoveSpeed = 0; f.cooldown = 100;
      f.energy = 0; f.energyOnAttack = f.energyOnHit = 0;
      if (f.unitId !== 'viridis') f.energyPerSecond = 0;
    });
    const [green, ally] = battle.player;
    green.x = 300; green.y = 300; green.hitPulse = 0;
    ally.x = 370; ally.y = 340; ally.hp = ally.maxHp * .5;
    battle.enemy.forEach((f, i) => { f.x = 850; f.y = 240 + i * 100; });
    window.__viridisAllyHp = ally.hp;
  });
  for (let tick = 0; tick < 160; tick++) {
    await page.evaluate(() => window.advanceTime(100));
    if (await page.evaluate(() => window.__viridisCasts.length > 0)) break;
  }
  report.casts = await page.evaluate(() => window.__viridisCasts);
  assert.equal(report.casts.length, 1);
  const first = report.casts[0];
  assert.equal(first.before.damageTaken, 0); assert.equal(first.before.hitPulse, 0);
  assert.equal(first.before.hp, first.maxHp); assert.equal(first.before.energy, 100);
  assert.equal(first.energy, 0); assert.ok(Math.abs(first.shield - first.maxHp * .12) < 1e-6);
  assert.equal(first.zones.length, 1); assert.equal(first.zones[0].x, 300); assert.equal(first.zones[0].y, 300);
  await evidence('automatic-no-hit');
  await page.evaluate(() => window.advanceTime(1100));
  const healing = await page.evaluate(() => ({ before: window.__viridisAllyHp, after: window.autoChessAI.bridge.engine.state.battle.player[1].hp, casts: window.__viridisCasts.length }));
  assert.ok(healing.after > healing.before); assert.equal(healing.casts, 1);
  report.healing = healing;
  await page.setViewportSize({ width: 390, height: 844 });
  await evidence('mobile-healing');
  assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []);
  writeFileSync('.tmp/autochess/viridis-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ castAt: first.at, damageTaken: first.before.damageTaken, healing, screenshots: Object.keys(screenshots), errors }, null, 2));
};
