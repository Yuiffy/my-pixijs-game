const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3879';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-daily';
const errors = [];
async function open(page, seed, meal) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/game/hush-live?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
  await advance(page, 0);
  await page.getByLabel('今晚吃什么').selectOption(meal);
  await page.getByRole('button', { name: '体验同居日常 →' }).click();
  await page.locator('#hush-start').click();
}
async function timing(page, touch = false) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      for (let n = 0; n < 150; n++) {
        const d = JSON.parse(window.render_game_to_text()).daily;
        const p = (Math.sin(d.clock * 2.2 - Math.PI / 2) + 1) / 2;
        if (p > .42 && p < .58 && d.cooldown <= 0) break;
        window.advanceTime(25);
      }
    });
    if (touch) await page.locator('[data-daily-timing]').tap();
    else await page.locator('[data-daily-timing]').click();
  }
  assert.equal((await state(page)).daily.panel, null);
}
async function interact(page, touch) {
  await follow(page);
  const s = await state(page);
  assert.equal(s.action.key, s.objective.key, JSON.stringify(s));
  if (touch) { await page.locator('[data-act="hold"]').tap(); await advance(page, s.action.seconds * 1000 + 150); }
  else await hold(page);
}
async function run() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/hush-live')).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await open(page, 1, 'homemade');
    await capture(page, 'arrival');
    await page.locator('[data-daily-timing]').click(); assert.equal((await state(page)).daily.mistakes, 1);
    await page.keyboard.press('p'); const paused = await state(page); await advance(page, 3000); assert.equal((await state(page)).daily.clock, paused.daily.clock);
    await page.getByRole('button', { name: '继续今晚 →' }).click(); await timing(page);
    await interact(page); assert.equal((await state(page)).daily.panel, 'cook'); await capture(page, 'cooking');
    await timing(page); await capture(page, 'rice-in-hands');
    await interact(page); assert.ok((await state(page)).done.includes('food')); await capture(page, 'dinner');
    await interact(page); assert.equal((await state(page)).daily.panel, 'leisure');
    await advance(page, 3200); assert.ok((await state(page)).daily.unread); await capture(page, 'wechat');
    await page.getByRole('button', { name: '回复：收到，戴耳机啦' }).click(); assert.equal((await state(page)).daily.volume, 15);
    await page.getByRole('button', { name: '玩接星星' }).click(); await page.getByRole('button', { name: '接星星', exact: true }).click();
    await page.keyboard.press('p'); const time = (await state(page)).daily.leisureTime; await advance(page, 5000); assert.equal((await state(page)).daily.leisureTime, time);
    await page.getByRole('button', { name: '继续今晚 →' }).click(); await advance(page, 5100);
    await page.getByRole('button', { name: '有点困了，去睡一会儿 →' }).click(); await interact(page); await advance(page, 600); await page.waitForTimeout(1600); await capture(page, 'sleep');
    await advance(page, 3200); assert.equal((await state(page)).daily.stage, 'after');
    assert.equal((await state(page)).objective.spot, 'partner'); await follow(page); assert.equal((await state(page)).focus, 'partner'); await capture(page, 'after-kitchen'); await hold(page); await capture(page, 'after-choice');
    await page.getByRole('button', { name: '拿两把勺子，一起吃' }).click(); await advance(page, 100);
    assert.ok((await state(page)).won); assert.equal((await state(page)).progression.unlocked, 0); await capture(page, 'daily-ending');
    // Every menu selection produces the right physical dish after placement.
    for (const meal of (process.env.HUSH_SKIP_MEALS ? [] : ['tea', 'dq', 'bbq', 'rice', 'crayfish', 'noodles', 'plain'])) {
      await open(page, 2, meal); await timing(page); await interact(page); await interact(page);
      assert.equal((await state(page)).daily.meal, meal); assert.ok((await state(page)).done.includes('food'));
      await capture(page, `meal-${meal}`);
    }
    await page.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await mobile.newPage(); await open(phone, 2, 'dq'); await capture(phone, 'mobile-lock'); await timing(phone, true);
    await interact(phone, true); await interact(phone, true); await interact(phone, true); await advance(phone, 3300);
    await phone.setViewportSize({ width: 320, height: 740 }); await capture(phone, 'mobile-wechat');
    const panel = await phone.getByLabel('客厅休闲', { exact: true }).boundingBox(); assert.ok(panel.x >= 0 && panel.x + panel.width <= 320 && panel.y >= 45 && panel.y + panel.height <= 740);
    await phone.getByRole('button', { name: '回复：收到，戴耳机啦' }).tap(); await advance(phone, 5100);
    await phone.getByRole('button', { name: '有点困了，去睡一会儿 →' }).tap(); await interact(phone, true); await advance(phone, 3300); await interact(phone, true);
    await capture(phone, 'mobile-shower-choice'); await phone.getByRole('button', { name: '拿干毛巾，帮你擦头发' }).tap(); await advance(phone, 100); assert.ok((await state(phone)).won);
    await mobile.close(); assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/report.json`, JSON.stringify({ images, errors }, null, 2));
    console.log(JSON.stringify({ screenshots: images.map(i => i.file), errors }));
  } finally { await browser.close(); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
