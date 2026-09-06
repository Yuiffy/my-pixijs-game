const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

let playwright;
for (const location of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(location); break; } catch { /* Try the configured browser runtime. */ }
}
if (!playwright) throw new Error('Playwright unavailable. Set PLAYWRIGHT_MODULE.');
const base = process.env.ONE_MORE_URL || 'http://127.0.0.1:3821';
const destination = 'artifacts/one-more-qa';
mkdirSync(destination, { recursive: true });

(async () => {
  const response = await fetch(`${base}/game/one-more`);
  assert.equal(response.status, 200, 'Dev server must answer before launching Chrome');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: process.env.ONE_MORE_HEADED !== '1', args: ['--mute-audio'] });
  const errors = [];
  const failed = [];
  const captures = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', result => { if (result.status() >= 400) failed.push({ url: result.url(), status: result.status() }); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
  const screenshot = async name => {
    await page.waitForTimeout(350);
    const file = join(destination, `${name}.png`);
    const image = await page.screenshot({ path: file, fullPage: true });
    const pixels = inspectPng(image);
    const dom = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      const hud = document.querySelector('[class*="fightMeta"]')?.getBoundingClientRect();
      const feedback = document.querySelector('[class*="moveName"], [class*="parryFeedback"]')?.getBoundingClientRect();
      const hudOverlapsFeedback = Boolean(hud && feedback && feedback.width > 0 && feedback.height > 0 && hud.right > feedback.left && hud.left < feedback.right && hud.bottom > feedback.top && hud.top < feedback.bottom);
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, hudOverlapsFeedback, canvas: { width: canvas.width, height: canvas.height, x: rect.x, y: rect.y, cssWidth: rect.width, cssHeight: rect.height } };
    });
    assert.ok(dom.canvas.width && dom.canvas.height && dom.canvas.cssWidth > 0);
    assert.ok(dom.scrollWidth <= dom.width, 'No horizontal overflow');
    assert.equal(dom.hudOverlapsFeedback, false, 'Fight stats must not overlap attack or parry feedback');
    captures.push({ name, file, pixels, dom, state: await state() });
  };
  const start = async () => {
    await page.getByRole('button', { name: '请赐教' }).click();
    await advance(0);
  };
  const pilot = async () => page.evaluate(() => {
    const keys = { guard: 'KeyK', attack: 'KeyJ', dodge: 'Space', left: 'KeyA', right: 'KeyD' };
    const pressed = new Set();
    const input = (action, down) => {
      if (pressed.has(action) === down) return;
      if (down) pressed.add(action); else pressed.delete(action);
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: keys[action], key: keys[action], bubbles: true }));
    };
    const seen = new Set();
    for (let i = 0; i < 9000; i += 1) {
      const s = window.suiSparring.snapshot();
      if (s.phase !== 'fight') break;
      const b = s.boss; const p = s.player;
      seen.add(b.move);
      const danger = b.mode === 'windup' && b.move === 'slam';
      const distance = b.x - p.x;
      input('guard', b.mode === 'windup' && !danger && b.nextImpact !== null && b.nextImpact - b.clock < 100);
      input('left', !danger && Math.abs(distance) > 190 && distance < 0);
      input('right', !danger && Math.abs(distance) > 190 && distance > 0);
      input('attack', b.mode === 'recover' && Math.abs(distance) < 225 && s.t - p.dashAt > 320);
      input('dodge', danger && b.nextImpact !== null && b.nextImpact - b.clock < 170);
      window.advanceTime(10);
    }
    for (const action of Array.from(pressed)) input(action, false);
    return { state: window.suiSparring.snapshot(), moves: Array.from(seen) };
  });
  try {
    await page.goto(`${base}/game/one-more`);
    await page.getByRole('button', { name: '请赐教' }).waitFor({ timeout: 60000 });
    assert.equal((await state()).muted, true);
    assert.equal((await state()).audio.context, 'not-started');
    await screenshot('desktop-ready');
    await start();
    await page.evaluate(() => window.suiSparring.live());
    const realTimeStart = (await state()).t;
    await page.waitForTimeout(400);
    assert.ok((await state()).t - realTimeStart > 200, 'Real animation frames must advance the game');
    await advance(0);
    const beginning = await state();
    await page.keyboard.down('d'); await advance(160); await page.keyboard.up('d');
    assert.ok((await state()).player.x > beginning.player.x);
    await page.keyboard.down('j'); await advance(350); await page.keyboard.up('j');
    await screenshot('desktop-fight');
    await page.setViewportSize({ width: 1440, height: 600 });
    await screenshot('short-desktop-fight');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      for (let i = 0; i < 400; i += 1) {
        const s = window.suiSparring.snapshot();
        if (s.boss.mode === 'windup' && s.boss.nextImpact - s.boss.clock < 100) break;
        window.advanceTime(10);
      }
    });
    await page.keyboard.down('k'); await advance(130);
    assert.ok((await state()).stats.parries > 0);
    await screenshot('desktop-parry'); await page.keyboard.up('k');
    await page.evaluate(() => {
      for (let i = 0; i < 1500; i += 1) {
        const s = window.suiSparring.snapshot();
        if (s.boss.move === 'slam' && s.boss.mode === 'windup' && s.boss.clock > 1150) break;
        window.advanceTime(10);
      }
    });
    await screenshot('desktop-slam');
    await page.keyboard.down('Space'); await advance(340); await page.keyboard.up('Space');
    await page.getByRole('button', { name: '开启声音', exact: true }).click();
    await page.waitForTimeout(50);
    assert.equal((await state()).audio.context, 'running');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const paused = await state(); await advance(10000);
    assert.equal((await state()).t, paused.t);
    assert.equal((await state()).audio.activeVoices, 0);
    await screenshot('desktop-paused');
    await page.getByRole('dialog').getByRole('button', { name: '继续过招' }).click();
    await advance(100); assert.equal((await state()).phase, 'fight');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state()).phase, 'paused');
    await page.getByRole('dialog').getByRole('button', { name: '继续过招' }).click();
    await advance(40000); assert.equal((await state()).phase, 'lost');
    await screenshot('desktop-defeat');
    const attempts = (await state()).attempts;
    await page.getByRole('button', { name: '再过一场' }).click();
    assert.equal((await state()).attempts, attempts + 1);
    assert.equal((await state()).player.hp, 5);
    await page.reload();
    await page.getByRole('button', { name: '请赐教' }).waitFor();
    assert.equal((await state()).phase, 'ready');
    assert.equal((await state()).attempts, attempts + 1);
    await page.getByRole('radio', { name: '三招全接' }).check();
    await start();
    const victory = await pilot();
    assert.equal(victory.state.phase, 'won'); assert.equal(victory.state.vowMet, true);
    assert.ok(victory.state.audio.activeVoices <= 12);
    assert.equal(victory.state.stats.damage, 0);
    assert.deepEqual(victory.moves.sort(), ['slam', 'sweep', 'triple']);
    await screenshot('desktop-victory');
    await page.getByRole('button', { name: '换个约定' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('tab', { name: '声音与难度' }).click();
    await page.getByLabel('舒缓模式', { exact: true }).check();
    await page.getByLabel('音效音量').fill('0.2');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.getByRole('button', { name: '静音', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '请赐教' }).waitFor();
    assert.equal((await state()).assist, true);
    assert.equal((await state()).vow, 'combo');
    assert.ok((await state()).stamps.includes('combo:standard'));
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot('mobile-ready');
    await start();
    const initialX = (await state()).player.x;
    const right = page.getByRole('button', { name: '向右移动' });
    const rightBox = await right.boundingBox();
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rightBox.x + rightBox.width / 2, y: rightBox.y + rightBox.height / 2 }] });
    await advance(120);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state()).player.x > initialX);
    await screenshot('mobile-fight');
    await page.setViewportSize({ width: 844, height: 390 });
    await screenshot('landscape-fight');
    if (process.env.ONE_MORE_SMOKE !== '1') {
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await screenshot('landscape-settings');
      await page.getByRole('button', { name: '关闭设置' }).click();
      await page.getByRole('button', { name: '回到庭前' }).click();
      await page.setViewportSize({ width: 320, height: 568 });
      await screenshot('small-mobile-ready');
      await start();
      const mobileWin = await pilot();
      assert.equal(mobileWin.state.phase, 'won');
      await screenshot('small-mobile-victory');
    }
    await page.goto(`${base}/demos`);
    await page.locator('a[href="/game/one-more"]').click();
    await page.getByRole('button', { name: '请赐教' }).waitFor();
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal((await state()).phase, 'ready');
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    writeFileSync(join(destination, 'report.json'), JSON.stringify({ passed: true, captures, errors, failed, victory }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: captures.map(c => c.file), victory: victory.state.stats }, null, 2));
  } catch (error) {
    writeFileSync(join(destination, 'failure.json'), JSON.stringify({ message: error.message, errors, failed, captures }, null, 2));
    await page.screenshot({ path: join(destination, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
