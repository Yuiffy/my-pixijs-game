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
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const waitStep = step => page.waitForFunction(expected => JSON.parse(localStorage.getItem('love-boundary-zh-v1')).step === expected, step);
    async function capture(name) {
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const metrics = inspectPng(await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }));
      console.log(name, metrics);
    }
    await page.goto(url);
    await page.locator('a[href="#boundary"]').waitFor();
    await capture('desktop-hub');
    await page.locator('a[href="#boundary"]').click();
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
    // Legacy progress survives the hub and switching to a different questionnaire.
    await page.getByRole('button', { name: '开始判定' }).click();
    await page.getByRole('button', { name: '完全 OK' }).click();
    await waitStep(1);
    await page.getByRole('link', { name: '选择其他问卷' }).click();
    await page.locator('a[href="#boundary"]').filter({ hasText: '已答 1 / 40' }).waitFor();
    await capture('mobile-hub');
    for (const [id, label] of [['heavy', '很开心'], ['dependence', '爱情']]) {
      await page.locator(`a[href="#${id}"]`).click();
      await page.getByRole('button', { name: '开始判定' }).click();
      const key = `love-questionnaire-${id}-v1`;
      for (let i = 0; i < 30; i++) {
        await page.getByRole('button', { name: label, exact: false }).first().click();
        await page.waitForFunction(({ key, step }) => JSON.parse(localStorage.getItem(key)).step === step, { key, step: i + 1 });
        if (i === 0) {
          await page.reload();
          await page.getByRole('heading').filter({ hasText: id === 'heavy' ? '每天早上' : '无论多累' }).waitFor();
        }
      }
      await page.getByRole('textbox', { name: '自由填写' }).fill('希望我们都能坦诚沟通，也保有自己的生活。');
      await page.getByRole('button', { name: '查看结果' }).click();
      await page.getByRole('img', { name: '恋爱边界判定结果图' }).waitFor();
      await capture(`${id}-result`);
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: '下载完整结果图' }).click();
      await (await pending).saveAs(path.join(output, `${id}-card.png`));
      await page.getByRole('button', { name: '复制文字结果' }).click();
      assert.match(await page.evaluate(() => navigator.clipboard.readText()), new RegExp(`#${id}`));
      await page.reload();
      await page.getByRole('heading', { name: '我的分类结果' }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: '分享文字' }).inputValue().then(t => t.includes('坦诚沟通')), true);
      await page.getByText('回顾 / 修改我的 30 个答案').click();
      await page.getByRole('button', { name: '修改第 30 题', exact: true }).click();
      await page.getByRole('button', { name: label, pressed: true }).waitFor();
      await page.getByRole('link', { name: '选择其他问卷' }).click();
    }
    await page.locator('a[href="#boundary"]').click();
    await page.getByRole('heading', { name: '和学生时代就认识的异性挚友单独吃饭' }).waitFor();
    await page.getByRole('link', { name: '选择其他问卷' }).click();
    await page.locator('a[href="#ideal"]').click();
    assert.equal(await page.getByRole('button', { name: '下一部分' }).isEnabled(), false);
    for (const [i, v] of [6, 5, 4, 3, 3, 2, 2].entries()) await page.locator('select').nth(i).selectOption(String(v));
    await capture('ideal-allocation');
    await page.getByRole('button', { name: '下一部分' }).click();
    for (let i = 0; i < 7; i++) await page.locator('fieldset').nth(i).getByRole('button').first().click();
    await page.getByRole('button', { name: '下一部分' }).click();
    for (const name of ['穿搭很土', '爱好完全不合', '几乎不表达爱意']) await page.getByRole('button', { name }).click();
    await page.getByRole('button', { name: '情绪察觉' }).click();
    await page.getByRole('button', { name: '完全记忆' }).click();
    assert.equal(await page.getByRole('button', { name: '独一无二' }).isDisabled(), true);
    await page.reload();
    await page.getByRole('button', { name: '情绪察觉', pressed: true }).waitFor();
    await page.getByRole('button', { name: '下一部分' }).click();
    await page.getByRole('textbox', { name: '自由填写' }).fill('喜欢一起散步、听歌的人。');
    await page.getByRole('button', { name: '生成创建表' }).click();
    await page.getByRole('img', { name: '我的理想恋人创建表结果图' }).waitFor();
    await capture('ideal-result');
    const idealDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载完整结果图' }).click();
    await (await idealDownload).saveAs(path.join(output, 'ideal-card.png'));
    await page.getByRole('button', { name: '复制文字结果' }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /散步、听歌/);
    await page.reload();
    await page.getByRole('img', { name: '我的理想恋人创建表结果图' }).waitFor();
    await page.getByRole('button', { name: '重新创建' }).click();
    await page.getByRole('button', { name: '确认重新开始' }).click();
    assert.equal(await page.locator('select').first().inputValue(), '0');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('love-boundary-zh-v1')).answers[0]), 2);
    assert.deepEqual(errors, []);
    console.log('PASS: 4 questionnaires, isolated progress, creator budget, 100 automatic transitions, duplicate-click protection, pending transition cancellation, navigation, persistence, result, review, clipboard, PNG, reset, responsive layout; no page errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
