const assert = require('node:assert/strict');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { NextRequest } = require('next/server');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BUTTON_BASE_URL || 'http://127.0.0.1:3838';
const output = process.env.BUTTON_QA_DIR || 'tmp/button-game-verify';
mkdirSync(output, { recursive: true });
const screenshots = [];
const errors = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const phase = async (page, value) => {
  await page.waitForFunction(expected => window.render_game_to_text && [expected, 'error'].includes(JSON.parse(window.render_game_to_text()).phase), value);
  assert.equal((await state(page)).phase, value, await page.locator('body').innerText());
};
const goto = async (page, suffix = '') => {
  await page.goto(`${base}/game/button${suffix}`, { waitUntil: 'networkidle' });
  await phase(page, 'ready');
};
const checkLayout = async page => {
  const problems = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) issues.push('horizontal page overflow');
    const elements = [...document.querySelectorAll('main button, main select, main a')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && rect.height;
    });
    for (let i = 0; i < elements.length; i++) {
      const a = elements[i].getBoundingClientRect();
      if (a.left < -1 || a.right > innerWidth + 1) issues.push(`offscreen control: ${elements[i].textContent}`);
      for (let j = i + 1; j < elements.length; j++) {
        if (elements[i].contains(elements[j]) || elements[j].contains(elements[i])) continue;
        const b = elements[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
          issues.push(`overlapping controls: ${elements[i].getAttribute('aria-label') || elements[i].textContent}/${elements[j].getAttribute('aria-label') || elements[j].textContent}`);
        }
      }
    }
    for (const element of document.querySelectorAll('main h1, main h2, main p')) {
      if (element.getBoundingClientRect().width && element.scrollWidth > element.clientWidth + 2) issues.push(`text overflow: ${element.textContent}`);
    }
    for (const image of document.querySelectorAll('main img')) {
      if (!image.complete || !image.naturalWidth) issues.push(`missing image: ${image.getAttribute('src')}`);
    }
    return issues;
  });
  assert.deepEqual(problems, []);
};
const capture = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await checkLayout(page);
  const file = path.join(output, `${name}.png`);
  const png = await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  const pixels = inspectPng(png);
  screenshots.push({ file, pixels, state: await state(page) });
};
const compile = (relative, dependencies = {}) => {
  const source = readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', 'require', compiled)(module, module.exports, name => dependencies[name] || require(name));
  return module.exports;
};

(async () => {
  assert.equal((await fetch(`${base}/game/button`)).status, 200, 'Start the local Next server first');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const db = new PGlite();
  let allowNetworkErrors = false;
  const observe = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !allowNetworkErrors) errors.push(message.text()); });
  };
  try {
    const unavailable = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const unavailablePage = await unavailable.newPage(); observe(unavailablePage);
    let unavailableVotes = 0;
    await unavailablePage.route('**/api/button-game', async route => {
      if (route.request().postDataJSON().action === 'vote') unavailableVotes++;
      await route.fulfill({ status: 503, json: { error: 'Statistics unavailable' } });
    });
    allowNetworkErrors = true;
    await goto(unavailablePage);
    assert.equal((await state(unavailablePage)).statisticsMode, 'local');
    const pressButton = unavailablePage.getByRole('button', { name: '按下按钮', exact: true });
    const passButton = unavailablePage.getByRole('button', { name: '我不按', exact: true });
    assert.equal(await pressButton.isEnabled(), true, 'A statistics outage must not disable the game');
    assert.equal(await passButton.isEnabled(), true);
    await pressButton.hover();
    assert.equal(await pressButton.evaluate(element => getComputedStyle(element).cursor), 'pointer');
    await unavailablePage.waitForFunction(() => getComputedStyle(document.querySelector('#press-button img')).transform !== 'none');
    await capture(unavailablePage, 'statistics-outage-hover');
    await unavailablePage.mouse.down();
    assert.equal((await state(unavailablePage)).phase, 'ready');
    await capture(unavailablePage, 'statistics-outage-pressed');
    await unavailablePage.mouse.up();
    await phase(unavailablePage, 'answered');
    assert.equal((await state(unavailablePage)).choice, 'press');
    assert.equal((await state(unavailablePage)).statistics, null);
    await capture(unavailablePage, 'statistics-outage-result');
    await unavailablePage.reload({ waitUntil: 'networkidle' });
    await phase(unavailablePage, 'answered');
    assert.equal((await state(unavailablePage)).choice, 'press');
    await unavailablePage.getByRole('button', { name: '下一道问题', exact: true }).click();
    await phase(unavailablePage, 'ready');
    await passButton.hover();
    assert.equal(await passButton.evaluate(element => getComputedStyle(element).cursor), 'pointer');
    await capture(unavailablePage, 'statistics-outage-pass-hover');
    await passButton.click();
    await phase(unavailablePage, 'answered');
    assert.equal((await state(unavailablePage)).choice, 'pass');
    assert.equal((await state(unavailablePage)).answered, 2);
    assert.equal(unavailableVotes, 0, 'Local fallback must not submit votes');
    allowNetworkErrors = false;

    for (const failure of ['offline', 'timeout', 400, 429]) {
      const failedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const failedPage = await failedContext.newPage(); observe(failedPage);
      if (failure === 'timeout') await failedPage.clock.install();
      await failedPage.route('**/api/button-game', async route => {
        if (failure === 'offline') await route.abort('internetdisconnected');
        else if (failure !== 'timeout') await route.fulfill({ status: failure, json: { error: `Expected ${failure}` } });
      });
      allowNetworkErrors = true;
      const requested = failedPage.waitForRequest(request => request.url().endsWith('/api/button-game'));
      await failedPage.goto(`${base}/game/button`, { waitUntil: 'domcontentloaded' });
      await requested;
      if (failure === 'timeout') await failedPage.clock.fastForward(16000);
      if (typeof failure === 'number') {
        await phase(failedPage, 'error');
        assert.equal(await failedPage.getByRole('button', { name: '按下按钮', exact: true }).isEnabled(), false);
        assert.equal((await state(failedPage)).statisticsMode, 'pending', 'Validation and throttling must not bypass the server');
      } else {
        await phase(failedPage, 'ready');
        await failedPage.getByRole('button', { name: '我不按', exact: true }).tap();
        await phase(failedPage, 'answered');
        assert.equal((await state(failedPage)).choice, 'pass');
        assert.equal((await state(failedPage)).statistics, null);
        if (failure === 'offline') await capture(failedPage, 'offline-mobile-result');
      }
      await failedContext.close();
      allowNetworkErrors = false;
    }

    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(); observe(page);
    await goto(page);
    assert.equal((await state(page)).statisticsMode, 'local', 'Local server must have no database configured for the local-mode scenario');
    assert.equal((await state(page)).count, 32);
    await capture(page, 'desktop-question');
    await page.getByRole('button', { name: '复制本题链接', exact: true }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /q=vt-fame-and-essays/);
    await page.getByRole('button', { name: '关闭提示', exact: true }).click();
    await page.getByRole('button', { name: '先跳过', exact: true }).click();
    await phase(page, 'ready');
    assert.equal((await state(page)).answered, 0);
    await page.getByLabel('筛选话题').selectOption('inspiration');
    await phase(page, 'ready');
    await page.getByRole('button', { name: '开启音效', exact: true }).click();
    await page.getByRole('button', { name: '按下按钮', exact: true }).focus();
    await page.keyboard.press('Enter');
    await phase(page, 'answered');
    assert.equal((await state(page)).choice, 'press');
    assert.equal((await state(page)).statistics, null);
    await capture(page, 'local-result');
    await page.getByRole('button', { name: '下一道问题', exact: true }).click();
    await phase(page, 'ready');
    await page.getByRole('button', { name: '我不按', exact: true }).click();
    await phase(page, 'answered');
    await page.getByRole('button', { name: '查看本组结果', exact: true }).click();
    assert.equal((await state(page)).finished, true);
    await page.getByRole('button', { name: '回看我的选择', exact: true }).click();
    await capture(page, 'history');
    await page.getByRole('button', { name: /五千万元/ }).click();
    await phase(page, 'answered');
    await page.reload({ waitUntil: 'networkidle' });
    await phase(page, 'answered');
    assert.equal((await state(page)).choice, 'pass');
    await page.getByLabel('筛选话题').selectOption('inspiration');
    await page.getByRole('button', { name: '我是观众', exact: true }).click();
    assert.equal((await state(page)).count, 0);
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await page.getByRole('button', { name: '我是观众', exact: true }).click();
    await phase(page, 'ready');
    assert.equal((await state(page)).question.perspective, 'viewer');
    await page.getByRole('button', { name: '直播模式', exact: true }).click();
    await capture(page, 'broadcast');
    await page.getByRole('button', { name: '退出直播模式', exact: true }).click();
    await page.getByLabel('选择主题').selectOption('everyday');
    await phase(page, 'ready');
    assert.equal((await state(page)).count, 6);
    await page.getByRole('button', { name: '切换全屏', exact: true }).click();
    assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true);
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);

    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 780 }, { width: 768, height: 1024 }]) {
      const mobile = await browser.newContext({ viewport, reducedMotion: 'reduce', isMobile: viewport.width < 500, hasTouch: true });
      const phone = await mobile.newPage(); observe(phone);
      await goto(phone);
      await capture(phone, `question-${viewport.width}`);
      await phone.getByRole('button', { name: '我不按', exact: true }).tap();
      await phase(phone, 'answered');
      assert.equal((await state(phone)).choice, 'pass');
      await checkLayout(phone);
      await mobile.close();
    }

    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) { if (key.startsWith('button-game')) throw new DOMException('Blocked', 'SecurityError'); return get.call(this, key); };
      Storage.prototype.setItem = function (key, value) { if (key.startsWith('button-game')) throw new DOMException('Blocked', 'SecurityError'); return set.call(this, key, value); };
    });
    const blockedPage = await blocked.newPage(); observe(blockedPage);
    await goto(blockedPage);
    await blockedPage.getByRole('button', { name: '按下按钮', exact: true }).click();
    await phase(blockedPage, 'answered');
    assert.equal((await state(blockedPage)).answered, 1);
    await blocked.close();

    // Exercise the production route against real PostgreSQL SQL, without credentials or public writes.
    const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
    const content = await loadTypescriptModule('src/components/buttonGame/content.ts');
    const model = await loadTypescriptModule('src/components/buttonGame/model.ts');
    const store = await loadTypescriptModule('src/lib/buttonGame/store.ts');
    const identity = compile('src/lib/buttonGame/identity.ts');
    await db.exec(readFileSync(path.join(__dirname, 'sql/button-game.sql'), 'utf8'));
    process.env.DATABASE_URL = 'test-injected-no-external-connection';
    process.env.BUTTON_GAME_VOTE_SECRET = 'browser-qa-test-secret-'.repeat(3);
    delete process.env.VERCEL;
    const api = compile('src/app/api/button-game/route.ts', {
      '@/lib/db': { getPool: () => db }, '@/components/buttonGame/content': content,
      '@/components/buttonGame/model': model, '@/lib/buttonGame/store': store, '@/lib/buttonGame/identity': identity,
    });
    let loseNextVote = false;
    let holdNextVote = false;
    let releaseHeldVote;
    let voteRequests = 0;
    const attachApi = async target => {
      await target.route('**/api/button-game', async route => {
        const request = route.request();
        const body = request.postDataJSON();
        if (body.action === 'vote') voteRequests++;
        if (holdNextVote && body.action === 'vote') {
          holdNextVote = false;
          await new Promise(resolve => { releaseHeldVote = resolve; });
        }
        const headers = { ...await request.allHeaders(), host: new URL(request.url()).host };
        const result = await api.POST(new NextRequest(request.url(), { method: 'POST', headers, body: request.postData() }));
        if (loseNextVote && body.action === 'vote' && result.status === 200) {
          loseNextVote = false;
          await route.abort('failed');
          return;
        }
        await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: await result.text() });
      });
    };
    await unavailablePage.unroute('**/api/button-game');
    await attachApi(unavailablePage);
    await unavailablePage.getByRole('button', { name: '重新连接统计', exact: true }).click();
    await phase(unavailablePage, 'ready');
    assert.equal((await state(unavailablePage)).statisticsMode, 'global');
    assert.equal((await state(unavailablePage)).choice, null);
    assert.equal(voteRequests, 0, 'Recovering from an outage must never auto-submit local choices');
    await unavailable.close();

    const global = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const globalPage = await global.newPage(); observe(globalPage); await attachApi(globalPage);
    await goto(globalPage);
    assert.equal((await state(globalPage)).statisticsMode, 'global');
    assert.equal((await state(globalPage)).statistics, null);
    await globalPage.evaluate(() => { const button = document.querySelector('#press-button'); button.click(); button.click(); });
    await phase(globalPage, 'answered');
    assert.equal(voteRequests, 1);
    assert.deepEqual((await state(globalPage)).statistics, { press: 1, pass: 0, total: 1 });
    const other = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const otherPage = await other.newPage(); observe(otherPage); await attachApi(otherPage);
    await goto(otherPage);
    const passSize = await otherPage.getByRole('button', { name: '我不按', exact: true }).boundingBox();
    holdNextVote = true;
    await otherPage.getByRole('button', { name: '我不按', exact: true }).tap();
    await phase(otherPage, 'saving');
    await otherPage.waitForFunction(() => document.querySelector('[aria-label="我不按"]').textContent.includes('确认中'));
    assert.equal((await state(otherPage)).pendingChoice, 'pass');
    assert.equal(await otherPage.getByRole('button', { name: '按下按钮', exact: true }).innerText(), '按下');
    assert.equal(await otherPage.getByRole('button', { name: '我不按', exact: true }).isEnabled(), false);
    const savingSize = await otherPage.getByRole('button', { name: '我不按', exact: true }).boundingBox();
    assert.equal(savingSize.width, passSize.width, 'The saving label must not resize the control');
    assert.equal(savingSize.height, passSize.height);
    await capture(otherPage, 'global-saving-pass-mobile');
    releaseHeldVote();
    await phase(otherPage, 'answered');
    assert.deepEqual((await state(otherPage)).statistics, { press: 1, pass: 1, total: 2 });
    await capture(otherPage, 'global-result-mobile');
    await globalPage.reload({ waitUntil: 'networkidle' });
    await phase(globalPage, 'answered');
    assert.equal((await state(globalPage)).statistics.total, 2);
    await capture(globalPage, 'global-result-desktop');
    await globalPage.getByRole('button', { name: '下一道问题', exact: true }).click();
    await phase(globalPage, 'ready');
    loseNextVote = true; allowNetworkErrors = true;
    await globalPage.getByRole('button', { name: '按下按钮', exact: true }).click();
    await phase(globalPage, 'error');
    const requestsAfterLoss = voteRequests;
    await globalPage.getByRole('button', { name: '重新载入本题', exact: true }).click();
    await phase(globalPage, 'answered');
    allowNetworkErrors = false;
    assert.equal(voteRequests, requestsAfterLoss, 'Recovery must read the committed vote, not re-submit it');
    assert.equal((await state(globalPage)).statistics.total, 1);
    assert.equal((await state(globalPage)).choice, 'press');
    await global.clearCookies();
    await globalPage.reload({ waitUntil: 'networkidle' });
    await phase(globalPage, 'ready');
    assert.equal((await state(globalPage)).choice, null, 'A stale device record must not replace the current server identity');
    assert.equal(voteRequests, requestsAfterLoss);
    await attachApi(page);
    await goto(page, '?q=vt-fame-and-essays');
    assert.equal((await state(page)).statisticsMode, 'global');
    assert.equal((await state(page)).choice, null, 'Local practice answers must not be submitted automatically');
    assert.equal(voteRequests, requestsAfterLoss);
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, screenshots, errors, voteRequests, sql: 'PGlite + actual Next API route' }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: screenshots.map(item => item.file), errors, voteRequests }, null, 2));
  } finally {
    await browser.close();
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
