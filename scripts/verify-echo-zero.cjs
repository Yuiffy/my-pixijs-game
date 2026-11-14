const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE
  || require.resolve('playwright', {
    paths: [
      process.cwd(),
      path.join(os.homedir(), '.codex/skills/develop-web-game'),
      'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules',
    ],
  }),
);
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');

const base = process.env.ECHO_ZERO_BASE_URL || 'http://127.0.0.1:3000';
const out = path.resolve(process.env.ECHO_ZERO_QA_DIR || 'tmp/echo-zero-qa');
const url = `${base}/game/echo-zero`;
const report = { checks: [], screenshots: [], errors: [], networkFailures: [] };

const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const text = page => page.evaluate(() => window.echoZero.getState());

async function capture(page, name) {
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, animations: 'disabled' }));
  const snapshot = await state(page);
  assert.ok(snapshot.canvas >= 1, `${name}: WebGL canvas must be mounted`);
  assert.ok(pixels.nearBlackRatio < 0.9, `${name}: screenshot is a black capture`);
  report.screenshots.push({ name, file, pixels, phase: snapshot.phase, canvas: snapshot.canvas });
  console.log(`  [shot] ${name}: ${pixels.width}x${pixels.height}, colors=${pixels.colors}, nearBlack=${pixels.nearBlackRatio}`);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(url)).status, 200, 'dev server responds before browser launch');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.HEADED !== '1',
    args: ['--mute-audio', '--disable-speech-api', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.addInitScript(installVirtualPointerLock);
    await context.addInitScript(() => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      localStorage.removeItem('echo-zero-v1');
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(`${message.text()} @ ${message.location().url}`); });
    page.on('response', response => { if (response.status() >= 400) report.networkFailures.push({ url: response.url(), status: response.status() }); });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.echoZero && document.querySelector('canvas')?.width > 100);
    await page.evaluate(() => window.echoZero.mute(true));
    const title = await state(page);
    assert.equal(title.phase, 'title');
    assert.ok(title.canvas >= 1, '3D world renders behind the title panel');
    await page.getByRole('dialog', { name: '标题画面' }).waitFor();
    assert.ok((await page.locator('body').innerText()).includes('栞栞'), 'title copy credits the radio companion');
    await capture(page, '01-title');
    report.checks.push('title screen: WebGL canvas, chapter copy and poster-grade composition');

    await page.getByRole('button', { name: '开始序章', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'opening');
    await page.waitForTimeout(700);
    assert.ok((await text(page)).notices.some(line => line.includes('第七区') || line.includes('信号')), 'radio subtitles appear in the cinematic');
    await capture(page, '02-opening');
    report.checks.push('opening cinematic: camera move, radio subtitles and letterbox');

    await page.evaluate(() => { window.echoZero.skipIntro(); window.advanceTime(1400); });
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'play');
    const playing = await text(page);
    assert.equal(playing.stage, 1);
    assert.match(playing.objective, /离开末班站台/);
    assert.ok(await page.evaluate(() => !!localStorage.getItem('echo-zero-v1')), 'checkpoint save is written when play begins');
    report.checks.push('cinematic skip hands control to stage 1 and persists a save');

    await page.evaluate(() => { window.echoZero.tap({ light: true }); window.advanceTime(700); });
    assert.equal((await text(page)).hints.attack, true, 'light attack registers');
    await page.evaluate(() => { window.echoZero.input({ z: -1 }); window.advanceTime(1600); window.echoZero.input({}); });
    const moved = await text(page);
    assert.ok(moved.player.z < playing.player.z - 1, 'WASD-style movement advances north');
    assert.equal(moved.hints.move, true);
    const hud = await page.locator('body').innerText();
    assert.ok(hud.includes('ECHO ZERO') || hud.includes('零日'), 'HUD chapter label is visible');
    await capture(page, '03-gameplay');
    report.checks.push('gameplay: attacks, movement, HUD and rain-soaked 3D city');

    await page.evaluate(() => { window.echoZero.pause(); });
    assert.equal((await state(page)).phase, 'paused');
    const frozen = await text(page);
    await page.evaluate(() => window.advanceTime(1200));
    assert.equal((await text(page)).player.z, frozen.player.z, 'pause freezes the simulation');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    assert.equal((await state(page)).phase, 'play');
    await page.keyboard.press('h');
    await page.getByRole('dialog', { name: '操作说明' }).waitFor();
    await capture(page, '04-help');
    await page.keyboard.press('h');
    assert.equal(await page.getByRole('dialog', { name: '操作说明' }).count(), 0);
    report.checks.push('pause/resume, help overlay and keyboard shortcuts');

    await page.evaluate(() => { window.echoZero.respawn(); window.advanceTime(300); });
    const revived = await text(page);
    assert.equal(revived.phase, 'play');
    assert.equal(revived.player.hp, 130);
    report.checks.push('respawn restores full vitals without tearing down the scene');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout does not overflow');
    await capture(page, '05-mobile');
    report.checks.push('390px mobile layout stays within the viewport');

    assert.deepEqual(report.errors, [], 'no console/page errors');
    assert.deepEqual(report.networkFailures, [], 'no failed asset requests');
    await context.close();
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log(`ECHO ZERO verification passed (${report.checks.length} checks, ${report.screenshots.length} screenshots) -> ${out}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
