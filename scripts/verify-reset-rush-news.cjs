const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.RESET_BASE_URL || 'http://localhost:4003';
const out = path.resolve(process.env.RESET_NEWS_OUTPUT || 'tmp/reset-news-dev');
const report = { checks: [], screenshots: [], errors: [] };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v5')));

async function loaded(page) {
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).ready !== false);
}
async function seed(page, E, g) {
  assert.ok(E.restoreGame(JSON.stringify(g)), `invalid fixture D${g.day}`);
  await page.evaluate(g => {
    for (const key of Object.keys(localStorage)) if (/^reset-rush-v/.test(key)) localStorage.removeItem(key);
    localStorage.setItem('reset-rush-v5', JSON.stringify(g));
  }, g);
  await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
  assert.equal((await state(page)).day, g.day);
}
async function english(page, locale) {
  if (locale !== 'en-US') return;
  const leaks = await page.locator('main').evaluate(root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), found = [];
    while (walker.nextNode()) {
      if (walker.currentNode.parentElement.closest('[aria-label="Language"]')) continue;
      const text = walker.currentNode.textContent.trim();
      if (/[\u3400-\u9fff]/.test(text)) found.push(text);
    }
    return found;
  });
  assert.deepEqual(leaks, [], 'untranslated rendered text');
}
async function capture(page, name, locale) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: overflow`);
  await english(page, locale);
  assert.equal(await page.locator('canvas').count(), 0, 'DOM game canvas dimensions: none');
  const current = await state(page), stored = await saved(page);
  assert.equal(current.day, stored.day); assert.equal(current.event.id, stored.event.id);
  assert.equal(current.players[0].credits, stored.players[0].credits);
  assert.equal(current.players[0].accounts[0].percent >= 0, true);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, animations: 'disabled' }));
  report.screenshots.push({ file, pixels, state: current, dom: { main: await page.locator('main').isVisible(), canvases: 0, viewport: page.viewportSize() } });
}

async function run() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200, 'responsive server before browser launch');
  const E = await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
  const { announce, newsFixture } = await import('./tests/helpers/reset-news-fixtures.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api', '--disable-features=SpeechSynthesis'] });
  try {
    for (const locale of ['zh-CN', 'en-US']) {
      const ctx = await browser.newContext({ locale, viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', hasTouch: true });
      await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
      await ctx.route('**/api/record', route => route.fulfill({ json: { success: true } }));
      await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ body: '' }));
      const page = await ctx.newPage(); page.setDefaultNavigationTimeout(60000);
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
      await page.goto(`${base}/game/reset-rush`, { waitUntil: 'domcontentloaded' }); await loaded(page);
      const close = () => page.getByRole('button', { name: locale === 'zh-CN' ? '关闭弹窗' : 'Close dialog', exact: true }).click();
      const shop = async () => {
        await page.getByTestId('clock-help').getByRole('button').click();
        await buy().first().waitFor();
      };
      const buy = () => page.getByRole('button', { name: locale === 'zh-CN' ? '开新号 · 只花钱' : 'Open account · cash only', exact: true });

      let before = newsFixture(E); before.players[0].accounts[0].quota = 156;
      await seed(page, E, before); await shop(); assert.equal(await buy().count(), 3); await close();
      const returned = announce(E, before, 'pro-return');
      await seed(page, E, returned);
      assert.equal((await state(page)).players[0].accounts[0].percent, E.quotaPercent(before.players[0].accounts[0], before));
      assert.match(await page.getByTestId('platform-status').innerText(), /10×.*25×/);
      await english(page, locale);
      if (locale === 'zh-CN') await capture(page, '01-return-news', locale);

      let credits = announce(E, returned, 'credit-compensation');
      credits.players[0].cash = 2000;
      credits.players[0].accounts[0].quota = 200;
      await seed(page, E, credits); await shop();
      assert.equal(await buy().count(), 4);
      assert.match(await page.getByTestId('credit-balance').innerText(), /120/);
      assert.doesNotMatch(await page.getByTestId('subscription-notice').innerText(), /另等|separately/);
      await capture(page, `02-credit-balance-${locale}`, locale);
      const refill = page.locator('[data-credit-account]');
      await refill.focus(); await page.keyboard.press('Enter');
      let after = await saved(page);
      assert.equal(after.players[0].credits, 80); assert.equal(after.players[0].accounts[0].quota, 240);
      assert.equal(after.minute, credits.minute); assert.equal(after.players[0].energy, credits.players[0].energy);
      assert.equal(after.players[0].cash, 2000);
      await buy().nth(3).click(); after = await saved(page);
      assert.equal(after.players[0].accounts[1].tier, 500); assert.equal(after.players[0].accounts[1].quota, 600);
      const accountId = after.players[0].accounts[0].id;
      await page.locator(`[data-managed-account="${accountId}"]`).getByRole('button', { name: /PRO 500$/ }).click();
      after = await saved(page); assert.equal(after.players[0].accounts[0].tier, 500);
      assert.equal(after.players[0].cash, 1200);
      await page.locator(`[data-renewal="${accountId}"]`).selectOption('200');
      assert.equal((await saved(page)).players[0].accounts[0].renewal, 200);
      await page.setViewportSize({ width: locale === 'zh-CN' ? 320 : 390, height: 844 });
      await page.getByTestId('modal-scroll-body').evaluate(el => el.scrollTop = el.scrollHeight);
      await capture(page, `02-plans-${locale}`, locale);
      await close(); await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
      assert.equal((await saved(page)).players[0].credits, 80);
      assert.equal((await saved(page)).players[0].accounts[0].tier, 500);
      // An expired subscription is renewed explicitly through the UI at the new tier.
      const expired = await saved(page); expired.players[0].accounts[0].paidUntil = expired.day - 1; expired.players[0].accounts[0].quota = 0;
      await seed(page, E, expired); await shop();
      await page.locator(`[data-managed-account="${accountId}"]`).getByRole('button', { name: /^\$500 .*PRO 500$/ }).click();
      assert.equal((await saved(page)).players[0].accounts[0].quota, 600);
      await close();
      report.checks.push(`${locale}: locked/open plans, capacity percentage, separate compensation, keyboard refill, $500 purchase/upgrade/manual renewal, scheduled downgrade and refresh`);

      let dot = announce(E, returned, 'devday-dots');
      dot = E.act(dot, { type: 'claim', project: dot.market[0].id }); dot.events = ['quiet'];
      await seed(page, E, dot);
      const [first, second] = dot.players[0].projects, energy = dot.players[0].energy;
      await page.locator('#dot-project').selectOption(String(first.id));
      await page.locator('#dot-project').selectOption(String(second.id));
      await page.locator('#dot-project').selectOption('0');
      await page.locator('#dot-project').selectOption(String(first.id));
      assert.equal((await saved(page)).players[0].energy, energy - 1);
      await page.locator('#studio-threads').focus(); await page.keyboard.press('Home');
      assert.equal((await saved(page)).players[0].energy, energy - 1);
      await page.locator('#end-day').click(); await page.locator('#confirm-end-day').click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'reveal');
      const night = await saved(page);
      assert.ok(night.players[0].dot.report.work > 0);
      assert.equal(night.players[0].projects.find(j => j.id === second.id).work, 0);
      assert.ok(night.players[0].accounts[0].quota < dot.players[0].accounts[0].quota);
      assert.equal(night.players[0].lanes.some(l => l.id < 0), false);
      await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
      assert.deepEqual((await saved(page)).players[0].dot.report, night.players[0].dot.report);
      await page.locator('#next-day').click();
      assert.equal((await saved(page)).players[0].dot.paidDay, night.day + 1);
      await page.getByTestId('dots-night').locator('summary').click();
      await page.getByTestId('dots-night').scrollIntoViewIfNeeded();
      assert.match(await page.getByTestId('dot-report').innerText(), /36/);
      await capture(page, `03-dot-report-${locale}`, locale);
      report.checks.push(`${locale}: one-energy handoff, switch/cancel without refund, one-project night work, quota consumption, reveal reload and next-morning report at narrow width`);

      let sol = announce(E, returned, 'sol-61');
      await seed(page, E, sol); assert.match(await page.getByTestId('platform-status').innerText(), /GPT-6.1 Sol/); await english(page, locale);
      sol = announce(E, sol, 'sol-polish'); await seed(page, E, sol);
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.getByTestId('model-roadmap').locator('summary').click();
      await page.getByTestId('model-roadmap').scrollIntoViewIfNeeded();
      await capture(page, `04-sol-polish-${locale}`, locale);
      report.checks.push(`${locale}: real Sol 6.1 and optional improvement are localized; roadmap distinguishes fictional Astra`);

      const legacy = E.createGame(44, 21); delete legacy.newsRules; delete legacy.platform.news;
      for (const p of legacy.players) { delete p.dot; delete p.credits; }
      await seed(page, E, legacy);
      assert.equal((await saved(page)).newsRules, 1); assert.equal((await saved(page)).rng, legacy.rng);
      report.checks.push(`${locale}: old v5 migrates into the current game with the same random state`);
      if (locale === 'zh-CN') {
        // Complete a fresh short season through normal game buttons, without injected state/time.
        await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (/^reset-rush-v/.test(key)) localStorage.removeItem(key); });
        await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page);
        await page.locator('#reset-length').selectOption('21'); await page.locator('#reset-seed').fill('7919');
        await page.locator('#start-game').click();
        await page.getByRole('button', { name: /→ PRO 200$/ }).click();
        await close();
        await page.locator('#studio-threads').focus(); await page.keyboard.press('ArrowRight');
        assert.equal((await saved(page)).studio.threads, 2);
        const headlines = [], works = [];
        while ((await state(page)).phase !== 'over') {
          const current = await state(page);
          if (current.phase === 'reveal') { await page.locator('#next-day').click(); continue; }
          if (current.event.effect === 'industry') headlines.push(current.event.id);
          for (let count = 0; count < 2; count++) {
            const position = await state(page);
            if (position.players[0].projects.length >= 3 || position.players[0].energy < 2) break;
            const job = [...position.market].sort((a, b) => a.need - b.need)[0];
            const card = page.locator(`[data-project="${job.id}"]`);
            if (await card.isDisabled()) break;
            await card.click();
            assert.ok((await saved(page)).players[0].projects.some(j => j.id === job.id));
          }
          const ongoing = await saved(page);
          if (ongoing.platform.news.dots && ongoing.players[0].projects.length && ongoing.players[0].energy >= 1) {
            const details = page.getByTestId('dots-night');
            if (!await details.evaluate(el => el.open)) await details.locator('summary').click();
            await page.locator('#dot-project').selectOption(String(ongoing.players[0].projects[0].id));
          }
          await page.locator('#end-day').click(); await page.locator('#confirm-end-day').click();
          await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase !== 'plan');
          const stored = await saved(page); assert.ok(E.restoreGame(JSON.stringify(stored))); works.push(stored.players[0].shipped.length);
          if (stored.day % 7 === 0) { await page.reload({ waitUntil: 'domcontentloaded' }); await loaded(page); }
        }
        assert.ok((await state(page)).players[0].shipped.length >= 6);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await capture(page, '05-natural-season-finish', locale);
        report.checks.push(`normal 21-day UI season completed with periodic refresh: ${works.at(-1)} works; news ${headlines.join(', ') || 'none'}`);
      }
      await ctx.close();
    }
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); }
}
run().then(() => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.map(s => s.file), errors: report.errors }, null, 2));
}).catch(error => {
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack, ...report }, null, 2));
  console.error(error); process.exitCode = 1;
});
