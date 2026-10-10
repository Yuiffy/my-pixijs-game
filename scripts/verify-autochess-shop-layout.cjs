const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

// Focused entry point: AUTOCHESS_SHOP_LAYOUT=1 node verify-autochess.cjs.
module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  await page.locator('.rift-dom-choice').first().click();
  assert.equal((await state()).phase, 'preparation');
  const layouts = [];
  const sizes = process.env.AUTOCHESS_LAYOUT_BASELINE === '1'
    ? [{ width: 2048, height: 960, name: '2k-before', fits: false }]
    : [
      { width: 2048, height: 960, name: '2k-windows125', fits: true },
      { width: 2560, height: 1200, name: '2k-windows100', fits: true },
      { width: 1440, height: 900, name: 'desktop', fits: true },
      { width: 2048, height: 760, name: 'wide-short', fits: false },
      { width: 1280, height: 620, name: 'short', fits: false },
    ];
  for (const { width, height, name, fits } of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    const layout = await page.evaluate(() => {
      const shop = document.querySelector('.rift-dom-shop-desktop');
      const list = shop.querySelector('.rift-shop-list');
      const stage = shop.parentElement;
      const layer = shop.closest('.rift-dom-layer');
      const cards = [...list.querySelectorAll('.rift-dom-shop-card')];
      const box = (element) => element.getBoundingClientRect().toJSON();
      const canvas = document.querySelector('[data-game-canvas="rift-line"]');
      return {
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        uiScale: document.querySelector('[data-ui-scale]').dataset.uiScale,
        shop: box(shop), stage: box(stage), layer: box(layer),
        maxHeight: getComputedStyle(shop).maxHeight,
        list: { ...box(list), clientHeight: list.clientHeight, scrollHeight: list.scrollHeight, scrollWidth: list.scrollWidth, clientWidth: list.clientWidth },
        cards: cards.map(box),
        actions: box(shop.querySelector('.rift-dom-shop-actions')),
        canvas: { ...box(canvas), width: canvas.width, height: canvas.height },
        documentOverflow: document.documentElement.scrollHeight - innerHeight,
      };
    });
    layouts.push({ name, ...layout, state: await state() });
    assert.equal(layout.cards.length, 5);
    assert.ok(layout.canvas.width > 0 && layout.canvas.height > 0);
    assert.ok(layout.shop.bottom <= layout.layer.bottom + 1, `${name}: shop exceeds viewport`);
    assert.ok(layout.documentOverflow <= 1);
    assert.ok(layout.list.scrollWidth <= layout.list.clientWidth + 1);
    if (fits) {
      assert.ok(layout.list.scrollHeight <= layout.list.clientHeight + 1, `${name}: unnecessary shop scrolling ${JSON.stringify(layout)}`);
      assert.ok(layout.cards[4].bottom <= layout.list.bottom + 1, `${name}: fifth card clipped`);
    } else {
      await page.locator('.rift-shop-list').evaluate((list) => { list.scrollTop = list.scrollHeight; });
      const last = await page.locator('.rift-shop-list .rift-dom-shop-card').last().boundingBox();
      assert.ok(last.y >= layout.list.top - 1 && last.y + last.height <= layout.list.bottom + 1, `${name}: cannot scroll to fifth card`);
      await page.locator('.rift-shop-list').evaluate((list) => { list.scrollTop = 0; });
    }
    await capture(`shop-layout-${name}`);
  }
  if (process.env.AUTOCHESS_LAYOUT_BASELINE !== '1') {
    await page.setViewportSize({ width: 2048, height: 960 });
    await page.waitForTimeout(350);
    const lastCard = page.locator('.rift-shop-list button.rift-dom-shop-card').last();
    await lastCard.hover();
    const tooltip = page.locator('.rift-shop-card-detail[role="tooltip"]');
    await tooltip.waitFor({ state: 'visible' });
    const tooltipBox = await tooltip.boundingBox();
    assert.ok(tooltipBox.y >= 0 && tooltipBox.y + tooltipBox.height <= 960);
    await capture('shop-layout-fifth-tooltip');
    const before = await state();
    await lastCard.click();
    const after = await state();
    assert.equal(after.player.gold, before.player.gold - before.shop[4].cost);
    assert.equal(after.shop.some((card) => card.index === 4), false);
    await page.getByRole('button', { name: '锁定商店' }).click();
    assert.equal((await state()).shopLocked, true);
    await page.getByRole('button', { name: /已锁定/ }).click();
    assert.equal((await state()).shopLocked, false);
    await page.mouse.move(100, 100);
    await capture('shop-layout-fifth-purchased');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    await page.locator('.rift-dom-mobile-actions .rift-action').first().click();
    await page.locator('.rift-dom-sheet-shop').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.rift-dom-shop-desktop').isVisible(), false);
    assert.equal(await page.locator('.rift-sheet-shop-list .rift-dom-shop-card').count(), 5);
    await capture('shop-layout-mobile');
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  const report = { layouts, screenshots, errors, failedResponses };
  writeFileSync('.tmp/autochess/shop-layout-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(layouts.map(({ name, list, shop, stage, maxHeight }) => ({ name, list, shop, stage, maxHeight })), null, 2));
};
