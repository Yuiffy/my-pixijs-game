const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.MINI_BASE_URL || 'http://127.0.0.1:3845';
const output = process.env.SNACK_SKINS_QA_DIR || 'tmp/snack-skins-verify';
const screenshots = [];
const observed = [];
const errors = [];
const skinKey = 'mini-snack-skin-v1';
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const selector = page => page.getByRole('group', { name: '主播皮肤', exact: true });
const withoutSkin = ({ skin, ...rest }) => rest;

function observeErrors(page) {
  page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ url: page.url(), message: message.text() });
  });
}

async function open(page, kind = 'snack') {
  await page.goto(`${base}/game/${kind}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
  await advance(page, 0);
  assert.equal((await state(page)).kind, kind);
}

async function choose(page, id) {
  const before = await state(page);
  assert.equal(await selector(page).count(), 1);
  await button(page, id === 'sui' ? '岁己 SUI' : '原创主播').click();
  await advance(page, 0);
  const after = await state(page);
  assert.equal(after.skin, id);
  assert.equal(await button(page, '原创主播').getAttribute('aria-pressed'), String(id === 'original'));
  assert.equal(await button(page, '岁己 SUI').getAttribute('aria-pressed'), String(id === 'sui'));
  assert.deepEqual(withoutSkin(after), withoutSkin(before), 'Changing skin must preserve every gameplay field');
  await assertSelectedContrast(page);
  return after;
}

async function assertSelectedContrast(page) {
  await page.waitForTimeout(200); // Let the existing 160ms button background transition settle.
  const contrast = await selector(page).locator('button[aria-pressed="true"]').evaluate(element => {
    const parse = value => value.match(/[\d.]+/g).map(Number);
    const layers = [];
    for (let node = element; node; node = node.parentElement) layers.unshift(parse(getComputedStyle(node).backgroundColor));
    let background = [255, 255, 255];
    for (const layer of layers) {
      const alpha = layer[3] ?? 1;
      background = background.map((value, channel) => layer[channel] * alpha + value * (1 - alpha));
    }
    const text = parse(getComputedStyle(element.querySelector('strong')).color);
    const luminance = rgb => rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, channel) => sum + value * [0.2126, 0.7152, 0.0722][channel], 0);
    const values = [luminance(background), luminance(text)].sort((a, b) => a - b);
    return { ratio: (values[1] + 0.05) / (values[0] + 0.05), background, text };
  });
  assert.ok(contrast.ratio >= 4, `Selected skin must retain the theme's text contrast while hovered: ${JSON.stringify(contrast)}`);
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    clippedButtons: [...document.querySelectorAll('main button')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.textContent),
  }));
  assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
  assert.deepEqual(layout.clippedButtons, []);
  const canvas = await page.locator('canvas').evaluate(element => ({
    width: element.width, height: element.height, cssWidth: element.clientWidth,
  }));
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 520);
  assert.ok(canvas.cssWidth > 250);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshots.push({ file, pixels, canvas, state: await state(page) });
}

async function portraitPixels(page) {
  // Compare the character area at identical game time, independently of DOM selection styling.
  return page.locator('canvas').evaluate(canvas => Array.from(
    canvas.getContext('2d').getImageData(260, 60, 390, 410).data,
  ));
}

async function start(page) {
  await page.locator('#start-game').click();
  await advance(page, 0);
  assert.equal((await state(page)).phase, 'playing');
  assert.equal(await selector(page).count(), 0, 'Skin controls must not crowd active play');
}

async function hold(page, keys, ms) {
  for (const key of keys) await page.keyboard.down(key);
  await advance(page, ms);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

async function winLevel(page) {
  for (let bite = 0; bite < 20 && (await state(page)).phase === 'playing'; bite++) {
    await hold(page, ['Space'], 1200);
    const current = await state(page);
    await hold(page, ['k', 'j'], [1400, 2000, 2600, 3600][current.selected] + 35);
  }
  const result = await state(page);
  assert.equal(result.phase, result.level === 4 ? 'ending' : 'won', JSON.stringify(result));
  assert.equal(result.skin, 'sui');
  assert.ok(result.best[result.level] > 0);
  assert.equal(await selector(page).count(), 1);
  return result;
}

(async () => {
  mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/snack`)).status, 200, 'The server must respond before Chrome starts');
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    observeErrors(page);
    await open(page);
    assert.equal((await state(page)).skin, 'original');
    assert.equal(await button(page, '原创主播').getAttribute('aria-pressed'), 'true');
    await capture(page, '01-original-ready-desktop');
    const originalPixels = await portraitPixels(page);
    await choose(page, 'sui');
    const suiPixels = await portraitPixels(page);
    let changed = 0;
    for (let index = 0; index < originalPixels.length; index += 4) {
      if (originalPixels.slice(index, index + 3).some((value, channel) => Math.abs(value - suiPixels[index + channel]) > 15)) changed++;
    }
    const changedRatio = changed / (originalPixels.length / 4);
    assert.ok(changedRatio > 0.08, `The actual character must change: ${changedRatio}`);
    observed.push({ scenario: 'different-character-art', changedRatio });
    assert.equal(await page.evaluate(key => localStorage.getItem(key), skinKey), 'sui');
    await capture(page, '02-sui-ready-desktop');
    await page.reload({ waitUntil: 'networkidle' });
    await advance(page, 0);
    assert.equal((await state(page)).skin, 'sui');
    assert.equal((await state(page)).phase, 'ready');

    await start(page);
    await page.keyboard.down('Space');
    await advance(page, 800);
    assert.equal((await state(page)).inputs.talk, true);
    assert.ok((await state(page)).energy > 85);
    await capture(page, '03-sui-talking-desktop');
    await page.keyboard.up('Space');
    await page.keyboard.down('k');
    await page.keyboard.down('j');
    await advance(page, 600);
    const chewing = await state(page);
    assert.equal(chewing.inputs.eat, true);
    assert.equal(chewing.inputs.mute, true);
    assert.ok(chewing.chewing > 0);
    assert.equal(chewing.suspicion, 0);
    await capture(page, '04-sui-eating-muted-desktop');
    await page.keyboard.up('j');
    await page.keyboard.up('k');
    await page.keyboard.press('p');
    const paused = await state(page);
    assert.equal(paused.phase, 'paused');
    assert.ok(Object.values(paused.inputs).every(value => !value));
    await advance(page, 10000);
    assert.deepEqual(await state(page), paused);
    await choose(page, 'original');
    await capture(page, '05-original-paused-desktop');
    await choose(page, 'sui');
    await page.reload({ waitUntil: 'networkidle' });
    await advance(page, 0);
    assert.deepEqual(await state(page), paused, 'Reload must retain skin and paused bite progress');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mini-snack-v1')));
    assert.equal('skin' in saved, false, 'Skin preference must stay independent of gameplay saves');
    await button(page, '继续直播').click();
    await hold(page, ['Space'], 5000);
    assert.equal((await state(page)).phase, 'lost');
    await choose(page, 'original');
    await choose(page, 'sui');
    await button(page, '重试本关').click();
    assert.equal((await state(page)).phase, 'ready');
    assert.equal((await state(page)).skin, 'sui');
    assert.equal((await state(page)).chewing, 0);

    for (let level = 0; level < 5; level++) {
      await start(page);
      const result = await winLevel(page);
      observed.push({ scenario: `sui-level-${level + 1}`, phase: result.phase, score: result.score });
      if (level < 4) {
        await button(page, '准备下一关').click();
        assert.equal((await state(page)).level, level + 1);
        assert.equal((await state(page)).skin, 'sui');
        assert.equal((await state(page)).phase, 'ready');
      }
    }
    await capture(page, '06-sui-campaign-ending-desktop');
    const final = await state(page);
    await page.reload({ waitUntil: 'networkidle' });
    await advance(page, 0);
    assert.deepEqual(await state(page), final);
    await button(page, '再挑战五关').click();
    assert.equal((await state(page)).skin, 'sui');
    assert.deepEqual((await state(page)).best, final.best);
    await start(page);
    await hold(page, ['j', 'k'], 400);
    const oldSeed = (await state(page)).seed;
    await button(page, '新开一局').click();
    await button(page, '同种子重开').click();
    await advance(page, 0);
    assert.equal((await state(page)).skin, 'sui');
    assert.equal((await state(page)).seed, oldSeed);
    assert.equal((await state(page)).time, 0);
    assert.equal((await state(page)).phase, 'ready');
    assert.deepEqual((await state(page)).best, final.best);

    for (const kind of ['agi', 'fab']) {
      await open(page, kind);
      assert.equal(await selector(page).count(), 0);
      assert.equal('skin' in await state(page), false);
      await page.locator('#start-game').click();
      const before = await state(page);
      if (kind === 'agi') {
        await page.locator('[data-action="train"]').click();
        assert.ok((await state(page)).capability > before.capability);
      } else {
        await button(page, '半产').click();
        await button(page, '结算本季市场 →').click();
        assert.equal((await state(page)).turn, before.turn + 1);
      }
      assert.equal(await page.evaluate(key => localStorage.getItem(key), skinKey), 'sui');
      observed.push({ scenario: `${kind}-unaffected`, kind: (await state(page)).kind });
    }

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touch = await mobile.newPage();
    observeErrors(touch);
    await open(touch);
    await button(touch, '岁己 SUI').tap();
    assert.equal((await state(touch)).skin, 'sui');
    await assertSelectedContrast(touch);
    await capture(touch, '07-sui-ready-mobile-390');
    await touch.locator('#start-game').tap();
    await advance(touch, 0);
    const cdp = await mobile.newCDPSession(touch);
    const boxes = await Promise.all(['按住吃零食', '按住静音'].map(name => button(touch, name).boundingBox()));
    assert.ok(boxes.every(rect => rect && rect.y >= 0 && rect.y + rect.height <= 844));
    const points = boxes.map((rect, id) => ({ id, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await advance(touch, 600);
    assert.equal((await state(touch)).inputs.eat, true);
    assert.equal((await state(touch)).inputs.mute, true);
    assert.equal((await state(touch)).skin, 'sui');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(Object.values((await state(touch)).inputs).every(value => !value));
    await touch.evaluate(() => dispatchEvent(new Event('blur')));
    assert.equal((await state(touch)).phase, 'paused');
    await touch.setViewportSize({ width: 320, height: 740 });
    await choose(touch, 'original');
    await choose(touch, 'sui');
    await capture(touch, '08-sui-paused-mobile-320');
    await mobile.close();

    const corrupted = await browser.newContext();
    await corrupted.addInitScript(key => localStorage.setItem(key, '{bad skin preference'), skinKey);
    const fallback = await corrupted.newPage();
    observeErrors(fallback);
    await open(fallback);
    assert.equal((await state(fallback)).skin, 'original');
    await choose(fallback, 'sui');
    await start(fallback);
    await corrupted.close();

    const denied = await browser.newContext();
    await denied.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        Storage.prototype[method] = () => { throw new Error('Test: storage unavailable'); };
      }
    });
    const offline = await denied.newPage();
    observeErrors(offline);
    await open(offline);
    assert.equal((await state(offline)).skin, 'original');
    await choose(offline, 'sui');
    await start(offline);
    await hold(offline, ['j', 'k'], 600);
    assert.ok((await state(offline)).chewing > 0);
    assert.equal((await state(offline)).skin, 'sui');
    assert.ok((await offline.locator('main').innerText()).includes('本局仍可玩'));
    await denied.close();
    observed.push({ scenario: 'invalid-and-unavailable-storage', playable: true });
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ screenshots, observed, errors }, null, 2));
    console.log(JSON.stringify({ screenshots: screenshots.map(item => item.file), observed, errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, screenshots, observed, errors }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
