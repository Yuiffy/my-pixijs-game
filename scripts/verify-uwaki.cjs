const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.UWAKI_URL || 'http://localhost:4119/game/uwaki-hantei';
const output = path.resolve('tmp/uwaki-qa');
const errors = [];
fs.mkdirSync(output, { recursive: true });

(async () => {
  assert.equal((await fetch(url)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 980 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const waitStep = step => page.waitForFunction(expected => JSON.parse(localStorage.getItem('love-boundary-zh-v1')).step === expected, step);
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const metrics = inspectPng(await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
      console.log(name, metrics);
    }
    await page.goto(url);
    await page.getByRole('button', { name: '开始判定' }).waitFor();
    await capture('desktop-intro');
    await page.getByRole('button', { name: '开始判定' }).click();
    assert.equal(await page.getByRole('button', { name: '下一题' }).isDisabled(), true);
    await page.getByRole('button', { name: '完全 OK' }).click();
    await waitStep(1);
    await page.reload();
    await waitStep(1);
    await page.getByRole('button', { name: '上一题' }).click();
    await page.getByRole('button', { name: '完全 OK', pressed: true }).waitFor();
    // Repeated events during the feedback delay must answer only one question.
    await page.getByRole('button', { name: '算越界', exact: false }).first().evaluate(button => { button.click(); button.click(); });
    await waitStep(1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('love-boundary-zh-v1')).answers[1]), null);
    await page.getByRole('button', { name: '上一题' }).click();
    await page.getByRole('button', { name: '算越界', pressed: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('mobile-question');
    for (let i = 0; i < 40; i++) {
      await page.getByRole('button', { name: '完全 OK' }).click();
      await waitStep(i + 1);
    }
    await page.getByRole('button', { name: '不会，我的标准一致' }).click();
    await page.getByRole('heading', { name: '松弛信任派' }).waitFor();
    await page.getByRole('img', { name: '恋爱边界判定结果图' }).waitFor();
    await capture('mobile-result');
    await page.getByRole('button', { name: '复制文字结果' }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /松弛信任派/);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载完整结果图' }).click();
    const download = await pending;
    await download.saveAs(path.join(output, 'result-card.png'));
    console.log('result-card', inspectPng(fs.readFileSync(path.join(output, 'result-card.png'))));
    await page.reload();
    await page.getByRole('heading', { name: '松弛信任派' }).waitFor();
    await page.getByText('回顾 / 修改我的 40 个答案').click();
    await page.getByRole('button', { name: '修改第 1 题', exact: true }).click();
    await page.getByRole('button', { name: '完全 OK', pressed: true }).waitFor();
    // Going back during the feedback delay cancels the pending transition.
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      buttons.find(b => b.textContent.includes('完全 OK')).click();
      buttons.find(b => b.textContent.includes('回到首页')).click();
    });
    await page.waitForTimeout(300);
    await waitStep(-1);
    await page.setViewportSize({ width: 320, height: 720 });
    await capture('small-mobile-intro');
    await page.getByRole('button', { name: /继续作答/ }).click();
    await page.getByRole('button', { name: '不会，我的标准一致' }).click();
    await page.getByRole('button', { name: '重新测一次' }).click();
    await page.getByRole('button', { name: '保留结果' }).click();
    await page.getByRole('heading', { name: '松弛信任派' }).waitFor();
    await page.getByRole('button', { name: '重新测一次' }).click();
    await page.getByRole('button', { name: '确认重新开始' }).click();
    await page.getByRole('button', { name: '开始判定' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: 40 automatic transitions, duplicate-click protection, pending transition cancellation, navigation, persistence, result, review, clipboard, PNG, reset, responsive layout; no page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
