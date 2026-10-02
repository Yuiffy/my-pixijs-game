const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, base, out, state, project, ready, drag, capture, prepare, captures } = require('./verify-flick-chess.cjs');
const errors = [], scenarios = [];
const gameState = ({ mode, pieces, phase, turn, winner, shotCount, remaining, cleanup }) => ({ mode, pieces, phase, turn, winner, shotCount, remaining, cleanup });
async function frozen(page) {
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).suspended);
  await page.waitForTimeout(80);
  const before = gameState(await state(page));
  await page.evaluate(() => window.advanceTime(16000));
  await page.waitForTimeout(850);
  assert.deepEqual(gameState(await state(page)), before, 'Physics, cleanup and AI must freeze together');
  assert.equal(await page.locator('main > div[inert]').count(), 1);
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(`${base}/game/flick-chess`, { signal: AbortSignal.timeout(90000) })).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.FLICK_HEADED, args: ['--mute-audio', '--disable-speech-api'] });
  let passed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await prepare(page);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await ready(page);
    await drag(page, 'red-4', 96);
    assert.ok((await state(page)).aim);
    await page.keyboard.press('Escape');
    await frozen(page);
    assert.equal((await state(page)).aim, null);
    assert.equal(await page.locator('canvas').evaluate(el => el.hasPointerCapture(1)), false);
    await page.mouse.up();
    assert.equal((await state(page)).shotCount, 0);
    await capture(page, '01-cancel-drag-pause');
    await page.getByRole('button', { name: '继续对局' }).click();
    await drag(page, 'red-4', 96);
    await page.mouse.up();
    assert.equal((await state(page)).shotCount, 1);
    await page.getByRole('button', { name: '规则', exact: true }).click();
    await frozen(page);
    await capture(page, '02-rules-freeze-collision');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '规则');
    await page.evaluate(() => {
      window.advanceTime(16000);
      document.querySelector('button[aria-label="规则"]').click();
    });
    await frozen(page);
    assert.equal((await state(page)).turn, 'blue');
    assert.equal((await state(page)).shotCount, 1);
    await capture(page, '03-ai-waits-for-rules');
    await page.getByRole('button', { name: '关闭规则' }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shotCount === 2);
    scenarios.push('cancel drag releases capture without a shot; help freezes collision and AI; close resumes one AI reply');

    await page.keyboard.press('p');
    await frozen(page);
    await page.keyboard.press('p');
    await page.evaluate(() => window.advanceTime(16000));
    await page.getByRole('button', { name: '重新开局' }).click();
    await frozen(page);
    const preserved = gameState(await state(page));
    await capture(page, '04-restart-confirm');
    await page.getByRole('button', { name: '保留本局' }).click();
    assert.deepEqual(gameState(await state(page)), preserved);
    await page.getByRole('button', { name: '本地双人' }).click();
    await frozen(page);
    await page.keyboard.press('Escape');
    assert.equal((await state(page)).mode, 'ai');
    await page.getByRole('button', { name: '本地双人' }).click();
    await page.getByRole('button', { name: '确认开新局' }).click();
    assert.equal((await state(page)).mode, 'local');
    assert.equal((await state(page)).shotCount, 0);
    await drag(page, 'red-4', 96); await page.mouse.up();
    await page.evaluate(() => window.advanceTime(16000));
    await page.waitForTimeout(750);
    assert.equal((await state(page)).shotCount, 1);
    assert.equal((await state(page)).turn, 'blue');
    scenarios.push('P toggles pause; cancel reset/mode preserves board; confirm resets once; local blue turn stays human');

    // Exercise browser lifecycle callbacks without requiring the user's focus.
    await drag(page, 'blue-9', -90);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await frozen(page);
    await page.mouse.up();
    assert.equal((await state(page)).aim, null);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal((await state(page)).pauseReason, 'away');
    await capture(page, '05-away-waits-for-resume');
    await page.getByRole('button', { name: '继续对局' }).click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await frozen(page);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal((await state(page)).pauseReason, 'away');
    await page.getByRole('button', { name: '继续对局' }).click();
    await drag(page, 'blue-9', -90); await page.mouse.up();
    assert.equal((await state(page)).shotCount, 2);
    await page.getByRole('button', { name: '重新开局' }).click();
    await page.getByRole('button', { name: '确认开新局' }).click();
    assert.equal((await state(page)).shotCount, 0);
    scenarios.push('blur/visibility event handlers cancel aiming, require explicit resume and allow the next real shot');

    await drag(page, 'red-0', 0, 150); await page.mouse.up();
    await page.evaluate(() => window.advanceTime(2200));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).cleanup.pending > 0);
    await page.keyboard.press('p');
    await frozen(page);
    assert.ok((await state(page)).cleanup.pending > 0);
    await capture(page, '06-cleanup-paused');
    await page.getByRole('button', { name: '继续对局' }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).cleanup.collected > 0, undefined, { timeout: 15000 });
    scenarios.push('fallen piece collection pauses in progress and finishes after resume');

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await prepare(phone);
    phone.on('pageerror', e => errors.push(e.message));
    phone.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await ready(phone);
    await capture(phone, '06-mobile-390');
    const model = await state(phone), piece = model.pieces.find(p => p.id === 'red-4');
    const point = project(piece, await phone.locator('canvas').boundingBox(), phone.viewportSize(), model.board);
    const cdp = await phone.context().newCDPSession(phone);
    const touches = (y) => [{ x: point.x, y, id: 1 }];
    const beginTouch = async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(point.y) });
      for (let step = 1; step <= 12; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(point.y + step * 80 / 12) });
        await phone.waitForTimeout(16);
      }
      await phone.waitForTimeout(100);
    };
    await beginTouch();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal((await state(phone)).aim, null);
    assert.equal((await state(phone)).shotCount, 0);
    await beginTouch();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await state(phone)).shotCount, 1);
    await phone.getByRole('button', { name: '暂停', exact: true }).tap();
    await frozen(phone);
    await capture(phone, '07-mobile-paused');
    await phone.getByRole('button', { name: '继续对局' }).tap();
    await phone.getByRole('button', { name: '重新开局' }).tap();
    await phone.setViewportSize({ width: 320, height: 740 });
    await capture(phone, '08-mobile-320-confirm');
    await phone.getByRole('button', { name: '确认开新局' }).tap();
    await capture(phone, '09-mobile-320-board');
    await phone.setViewportSize({ width: 844, height: 390 });
    await phone.getByRole('button', { name: '规则', exact: true }).tap();
    await capture(phone, '10-landscape-rules');
    await phone.getByRole('button', { name: '关闭规则' }).tap();
    scenarios.push('real touch cancel/launch/pause/resume/reset; 320/390px and landscape modal layouts');
    assert.deepEqual(errors, []);
    passed = true;
  } finally {
    fs.writeFileSync(path.join(out, 'session-report.json'), JSON.stringify({ passed, scenarios, captures, errors }, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ passed, scenarios, screenshots: captures.map(c => c.file), errors }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
