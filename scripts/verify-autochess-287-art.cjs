const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

// Uses verify-autochess.cjs: muted installed Chrome, full page screenshots and PNG sanity.
module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  const report = { frames: {}, screenshots, errors, failedResponses };
  const ids = ['viridis', 'sumire', 'chu2u'];
  const names = ['植物学家', '紫色妈妈', '烂梗小孩'];
  const evidence = async name => {
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dom = await page.evaluate(() => {
      const canvas = document.querySelector('[data-game-canvas="rift-line"]');
      return { canvas: { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON() }, overflow: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText, images: [...document.images].map(img => ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight })) };
    });
    assert.ok(dom.canvas.width > 0 && dom.canvas.height > 0 && dom.canvas.rect.width > 0);
    assert.ok(dom.overflow <= 1);
    await capture(`287-art-${name}`);
    report.frames[name] = { state: await state(), dom };
  };
  const style = async (key, label) => {
    await page.getByRole('button', { name: '游戏设置', exact: true }).click();
    await page.getByRole('radio', { name: label, exact: true }).click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.waitForFunction(value => localStorage.getItem('rift-line-character-style') === value, key);
    for (const id of (await state()).phase === 'battle' ? [] : ids) {
      const asset = key === 'classic' ? `/images/livers/${id}.jpg` : `/images/autochess/portraits/${key}/${id}.png`;
      await page.waitForFunction(src => [...document.images].some(img => img.getAttribute('src') === src && img.complete && img.naturalWidth > 0), asset);
    }
    await page.waitForTimeout(250);
  };
  await page.locator('.rift-dom-choice').first().click();
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    bridge.setConsoleLogging(false);
    const engine = bridge.engine;
    engine.state.gold = 100;
    engine.state.playerLevel = 8;
    engine.state.round = 8;
    engine.state.board.fill(null);
    engine.state.bench.fill(null);
    engine.state.shop = ['viridis', 'sumire', 'chu2u', 'komichi', 'sui'];
    ['viridis', 'sumire', 'chu2u', 'komichi', 'sui', 'mossback'].forEach((id, i) => { engine.state.board[i + 6] = { uid: 600 + i, id, star: 2 }; });
    bridge.dispatch({ type: 'clearSelection' });
  });
  for (const [key, label] of [['minimal', '极简'], ['detail', '细节'], ['classic', '棋子']]) {
    await style(key, label);
    await evidence(`shop-${key}`);
  }
  await style('minimal', '极简');
  await page.getByRole('button', { name: '图鉴 / 本局天赋', exact: true }).click();
  for (const [i, name] of names.entries()) {
    await page.getByRole('button', { name: '概览', exact: true }).click();
    await page.getByRole('button', { name: `查看${name}详情`, exact: true }).click();
    const details = page.locator('[data-codex-unit-details]');
    await details.waitFor();
    const image = details.locator('img').first();
    assert.equal(await image.getAttribute('src'), `/images/autochess/portraits/minimal/${ids[i]}.png`);
    await evidence(`codex-${ids[i]}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-codex-unit-details] img').first().scrollIntoViewIfNeeded();
  await evidence('codex-mobile');
  await page.getByRole('button', { name: '关闭 Esc', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /开始战斗/ }).click();
  await page.evaluate(() => window.autoChessAI.bridge.setBattlePaused(true));
  await page.evaluate(() => window.advanceTime(900));
  assert.equal((await state()).phase, 'battle');
  await evidence('battle-minimal');
  await style('detail', '细节');
  await evidence('battle-detail');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  writeFileSync('.tmp/autochess/287-art-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ screenshots: Object.keys(screenshots), errors, failedResponses }, null, 2));
};
