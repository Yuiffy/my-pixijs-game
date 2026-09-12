const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.MINI_BASE_URL || 'http://127.0.0.1:3862';
const output = process.env.SNACK_CONTROLS_QA_DIR || 'tmp/snack-controls-verify';
const screenshots = [];
const observed = [];
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const eat = page => button(page, '吃一口');
const music = page => page.getByTestId('snack-music');
const stock = current => current.remaining.reduce((sum, count) => sum + count, 0);

function observeErrors(page) {
  page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ url: page.url(), message: message.text() });
  });
}

async function open(page) {
  await page.goto(`${base}/game/snack`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.render_game_to_text && !!window.advanceTime);
  await advance(page, 0);
  assert.equal((await state(page)).kind, 'snack');
}

async function start(page) {
  await page.locator('#start-game').click();
  await advance(page, 0);
  assert.equal((await state(page)).phase, 'playing');
}

async function reset(page, skin = 'sui') {
  if ((await state(page)).started) {
    await button(page, '新开一局').click();
    await button(page, '同种子重开').click();
    await advance(page, 0);
  }
  await button(page, skin === 'sui' ? '岁己 SUI' : '原创主播').click();
  await start(page);
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(220); // Settle UI color transitions while deterministic game time stays frozen.
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
  const pressedContrast = await page.locator('button[aria-pressed="true"][aria-label]:not(:disabled)').evaluateAll(elements => elements.map(element => {
    const parse = value => value.match(/[\d.]+/g).map(Number);
    const layers = [];
    for (let node = element; node; node = node.parentElement) layers.unshift(parse(getComputedStyle(node).backgroundColor));
    let background = [255, 255, 255];
    for (const layer of layers) {
      const alpha = layer[3] ?? 1;
      background = background.map((value, channel) => layer[channel] * alpha + value * (1 - alpha));
    }
    const color = parse(getComputedStyle(element.querySelector('strong') || element).color);
    const luminance = rgb => rgb.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, channel) => sum + value * [0.2126, 0.7152, 0.0722][channel], 0);
    const values = [luminance(background), luminance(color)].sort((a, b) => a - b);
    return { label: element.getAttribute('aria-label'), ratio: (values[1] + 0.05) / (values[0] + 0.05) };
  }));
  for (const contrast of pressedContrast) assert.ok(contrast.ratio >= 4, `Pressed control text must remain legible while hovered: ${JSON.stringify(contrast)}`);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshots.push({ file, pixels, canvas, layout, pressedContrast, state: await state(page), music: await music(page).innerText() });
}

async function mouthPixels(page) {
  // Canvas2D sampling complements the full-page screenshot, comparing exactly the same game time.
  return page.locator('canvas').evaluate(canvas => Array.from(
    canvas.getContext('2d').getImageData(450, 270, 125, 42).data,
  ));
}

async function assertMusic(page, active) {
  const current = await state(page);
  assert.equal(await music(page).getAttribute('data-active'), String(active));
  assert.equal(active, current.phase === 'playing' && current.cover.active);
  assert.match(await music(page).innerText(), /音乐/);
  if (current.phase === 'playing') assert.match(await music(page).innerText(), /\d/);
}

async function touchPoint(page, name, id) {
  const rect = await button(page, name).boundingBox();
  assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= (await page.viewportSize()).height,
    `${name} must be visible without scrolling: ${JSON.stringify(rect)}`);
  return { id, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

(async () => {
  mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/snack`)).status, 200, 'The server must respond before Chrome starts');
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await desktop.newPage();
    observeErrors(page);
    await open(page);
    await button(page, '岁己 SUI').click();
    await capture(page, '01-sui-ready-desktop');
    await start(page);
    const beforeTap = await state(page);
    await page.keyboard.press('j');
    await advance(page, 300);
    assert.equal((await state(page)).inputs.eat, false);
    assert.ok((await state(page)).chewing > 0, 'A released tap must keep chewing');
    assert.equal(await eat(page).getAttribute('aria-pressed'), 'true');
    assert.match(await eat(page).innerText(), /嚼|剩|秒/);
    await eat(page).click();
    await eat(page).click();
    await advance(page, 1400);
    assert.equal((await state(page)).eaten, beforeTap.eaten + 1);
    assert.equal(stock(await state(page)), stock(beforeTap) - 1);
    assert.equal((await state(page)).chewing, 0, 'Clicks during chewing must never queue another bite');
    assert.equal(await eat(page).getAttribute('aria-pressed'), 'false');
    observed.push({ scenario: 'released-key-tap-and-repeated-clicks', state: await state(page) });

    await reset(page);
    await page.keyboard.down('k');
    await page.keyboard.down('j');
    await advance(page, 1700);
    for (let repeat = 0; repeat < 8; repeat++) {
      await page.keyboard.down('j'); // Playwright generates a real repeat keydown while J is held.
      await advance(page, 200);
    }
    assert.equal((await state(page)).inputs.eat, true);
    assert.equal((await state(page)).eaten, 1);
    assert.equal((await state(page)).chewing, 0);
    assert.equal(await eat(page).getAttribute('aria-pressed'), 'false', 'Pressed styling must reflect chewing, not the held key');
    await page.keyboard.up('j');
    await page.keyboard.up('k');
    for (let remaining = 2; remaining > 0; remaining--) {
      await page.keyboard.down('Space'); await advance(page, 1100); await page.keyboard.up('Space');
      await page.keyboard.down('k'); await page.keyboard.down('j'); await advance(page, 1700);
      await page.keyboard.down('j'); await advance(page, 300);
      await page.keyboard.up('j'); await page.keyboard.up('k');
    }
    const changedSnack = await state(page);
    assert.deepEqual(changedSnack.remaining, [0, 2, 0, 0]);
    assert.equal(changedSnack.selected, 1);
    assert.equal(changedSnack.eaten, 3);
    assert.equal(changedSnack.chewing, 0);
    observed.push({ scenario: 'long-hold-repeat-and-category-boundary', state: changedSnack });

    await reset(page);
    await page.keyboard.down('k');
    await eat(page).focus();
    await page.keyboard.down('Enter');
    await advance(page, 1700);
    await page.keyboard.down('Enter');
    await advance(page, 500);
    assert.equal((await state(page)).eaten, 1, 'Holding Enter on the eat button must not chain bites');
    await page.keyboard.up('Enter');
    await page.keyboard.press('Space');
    await advance(page, 1500);
    assert.equal((await state(page)).eaten, 2, 'Space must activate a focused eat button');
    assert.equal((await state(page)).inputs.talk, false, 'Focused eat activation must not also start talking');
    await page.keyboard.up('k');
    observed.push({ scenario: 'focused-eat-enter-repeat-and-space', state: await state(page) });

    for (const skin of ['sui', 'original']) {
      await reset(page, skin);
      await page.keyboard.press('2');
      await page.keyboard.press('j');
      await advance(page, 450);
      const beforeTalk = await state(page);
      const closedMouth = await mouthPixels(page);
      await page.keyboard.down('Space');
      await advance(page, 0);
      const talkingMouth = await mouthPixels(page);
      const changedChannels = closedMouth.filter((value, index) => Math.abs(value - talkingMouth[index]) > 10).length;
      assert.ok(changedChannels > 10, `${skin} mouth must visibly change for muffled speech at identical time`);
      await advance(page, 600);
      const speaking = await state(page);
      assert.equal(speaking.speech, 'muffled');
      assert.ok(speaking.energy > beforeTalk.energy, 'A short sentence with food should restore some atmosphere');
      assert.ok(speaking.suspicion > beforeTalk.suspicion, 'Muffled speech must still carry a visible suspicion cost');
      assert.ok(speaking.chewing - beforeTalk.chewing > 0 && speaking.chewing - beforeTalk.chewing < 0.6,
        'Muffled speech should slow chewing while preserving progress');
      await capture(page, skin === 'sui' ? '02-sui-muffled-desktop' : '03-original-muffled-desktop');
      await page.keyboard.up('Space');
      await page.keyboard.down('k');
      await advance(page, 2500);
      await page.keyboard.up('k');
      assert.equal((await state(page)).eaten, 1);
      assert.equal((await state(page)).chewing, 0);
      await page.keyboard.down('Space'); await advance(page, 200);
      assert.equal((await state(page)).speech, 'clear');
      await page.keyboard.up('Space');
      observed.push({ scenario: `${skin}-muffled-speech-and-animation`, beforeTalk, speaking, changedChannels });
    }

    await reset(page);
    await assertMusic(page, false);
    const quietColor = await music(page).evaluate(element => getComputedStyle(element).backgroundColor);
    await page.keyboard.down('Space');
    await advance(page, (await state(page)).cover.next * 1000 + 60);
    await assertMusic(page, true);
    await page.waitForTimeout(250);
    const activeColor = await music(page).evaluate(element => getComputedStyle(element).backgroundColor);
    assert.notEqual(activeColor, quietColor, 'The music window must visibly change the status strip color');
    const countdown = (await state(page)).cover.next;
    const activeText = await music(page).innerText();
    await advance(page, 800);
    assert.ok((await state(page)).cover.next < countdown);
    assert.notEqual(await music(page).innerText(), activeText, 'The visible music countdown must update');
    await page.keyboard.up('Space');
    await page.keyboard.press('j');
    await advance(page, 350);
    await capture(page, '04-sui-music-cover-desktop');
    await page.keyboard.press('p');
    const paused = await state(page);
    await assertMusic(page, false);
    assert.equal(paused.phase, 'paused');
    assert.ok(paused.chewing > 0);
    await advance(page, 10000);
    assert.deepEqual(await state(page), paused);
    await capture(page, '05-sui-paused-bite-desktop');
    await page.reload({ waitUntil: 'networkidle' });
    await advance(page, 0);
    assert.deepEqual(await state(page), paused, 'Pause/reload must keep the same partially eaten food');
    await button(page, '继续直播').click();
    await assertMusic(page, true);
    await page.keyboard.down('k'); await advance(page, 1500); await page.keyboard.up('k');
    assert.equal((await state(page)).eaten, paused.eaten + 1);
    await page.keyboard.down('Space');
    await advance(page, (await state(page)).cover.next * 1000 + 80);
    await page.keyboard.up('Space');
    await assertMusic(page, false);
    observed.push({ scenario: 'music-countdown-end-and-pause-reload', quietColor, activeColor, paused, after: await state(page) });

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touch = await mobile.newPage();
    observeErrors(touch);
    await open(touch);
    await button(touch, '岁己 SUI').tap();
    await start(touch);
    await touchPoint(touch, '吃一口', 1);
    await eat(touch).tap();
    await advance(touch, 400);
    assert.equal((await state(touch)).inputs.eat, false);
    assert.ok((await state(touch)).chewing > 0);
    await capture(touch, '06-sui-tap-auto-chew-mobile-390');
    await advance(touch, 1500);
    assert.equal((await state(touch)).eaten, 1);
    assert.equal((await state(touch)).chewing, 0);
    const cdp = await mobile.newCDPSession(touch);
    const mutePoint = await touchPoint(touch, '按住静音', 1);
    const eatPoint = await touchPoint(touch, '吃一口', 2);
    const beforeMuted = await state(touch);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [mutePoint] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [mutePoint, eatPoint] });
    // For CDP touchEnd, listed points are the fingers being lifted, so keep mute down by ending only eat.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [eatPoint] });
    await touch.waitForFunction(() => !JSON.parse(window.render_game_to_text()).inputs.eat);
    await advance(touch, 600);
    assert.equal((await state(touch)).inputs.eat, false);
    assert.equal((await state(touch)).inputs.mute, true);
    assert.ok((await state(touch)).chewing > 0);
    assert.ok((await state(touch)).suspicion <= beforeMuted.suspicion);
    await advance(touch, 1300);
    assert.equal((await state(touch)).eaten, beforeMuted.eaten + 1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(Object.values((await state(touch)).inputs).every(value => !value));
    await touch.keyboard.down('Space');
    await advance(touch, (await state(touch)).cover.next * 1000 + 70);
    await touch.keyboard.up('Space');
    await assertMusic(touch, true);
    await capture(touch, '07-sui-music-cover-mobile-390');
    await touch.setViewportSize({ width: 320, height: 740 });
    for (const name of ['吃一口', '按住说话', '按住静音']) await touchPoint(touch, name, 1);
    await eat(touch).tap();
    await advance(touch, 400);
    const beforeBlur = await state(touch);
    await touch.evaluate(() => dispatchEvent(new Event('blur')));
    assert.equal((await state(touch)).phase, 'paused');
    assert.equal((await state(touch)).chewing, beforeBlur.chewing);
    await assertMusic(touch, false);
    await capture(touch, '08-sui-paused-mobile-320');
    observed.push({ scenario: '390-and-320-touch-tap-mute-and-blur', state: await state(touch) });
    await mobile.close();
    await desktop.close();
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
