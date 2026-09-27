const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex', 'skills', 'develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3888';
const output = path.resolve(process.env.RESET_V5_DIR || 'tmp/reset-rush-v5-platform');
const report = { checks: [], screenshots: [], errors: [] };
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v5')));

async function main() {
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200);
  const E = await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-features=SpeechSynthesis'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
    const load = async () => {
      await page.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).ready !== false);
    };
    const inject = async (g, key = E.SAVE_KEY) => {
      await page.evaluate(({ g, key }) => {
        for (let v = 1; v <= 5; v++) localStorage.removeItem(`reset-rush-v${v}`);
        localStorage.setItem(key, JSON.stringify(g));
      }, { g, key });
      await load();
    };
    const shot = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const file = path.join(output, `${name}.png`);
      const pixels = inspectPng(await page.screenshot({ path: file, animations: 'disabled' }));
      report.screenshots.push({ file, pixels, state: await page.evaluate(() => JSON.parse(window.render_game_to_text())) });
    };
    const morning = (g, day, event) => {
      const next = structuredClone(g);
      next.day = day - 1; next.phase = 'reveal'; next.events = [event]; next.platform.nextRelease = 100;
      return E.nextDay(next);
    };
    await load();
    await page.locator('#start-game').click();
    await page.locator('dialog[open]').waitFor();
    const plans = await page.locator('dialog').innerText();
    for (const ratio of ['1×', '5×', '20×']) assert.ok(plans.includes(ratio));
    await shot('01-plan-ratios');
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    await page.evaluate(() => window.advanceTime(120 * 60000));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).minute === 120);
    await page.getByTestId('quota-observation').first().locator('summary').click();
    await page.getByTestId('quota-observation').first().scrollIntoViewIfNeeded();
    assert.match(await page.getByTestId('quota-observation').first().innerText(), /满额约 .*–.*k token/);
    const observed = await saved(page);
    assert.ok(E.quotaObservation(observed.players[0].accounts[0]).fullLow > 0);
    await shot('02-token-observation');
    report.checks.push('1x/5x/20x plans and automatically measured token interval');

    let warning = morning(E.createGame(902, 42), 8, 'pro-last-call');
    await inject(warning);
    await page.getByRole('button', { name: '账号管理', exact: true }).click();
    assert.match(await page.getByTestId('subscription-notice').innerText(), /D10/);
    await page.getByRole('button', { name: '开新号 · 只花钱', exact: true }).nth(2).click();
    warning = await saved(page);
    assert.equal(warning.players[0].accounts[1].tier, 200);
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    const closed = morning(warning, 10, 'quiet');
    await inject(closed);
    await page.getByRole('button', { name: '账号管理', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '开新号 · 只花钱', exact: true }).nth(2).isDisabled(), true);
    assert.equal(await page.locator(`[data-managed-account="${closed.players[0].accounts[0].id}"]`).getByRole('button', { name: /→ PRO 200/ }).isDisabled(), true);
    assert.equal(await page.locator(`[data-renewal="${closed.players[0].accounts[1].id}"] option[value="200"]`).isDisabled(), false);
    await shot('03-retired-plan');
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    const renewed = morning(closed, 38, 'quiet');
    assert.equal(renewed.players[0].accounts[1].paidUntil, 67);
    await inject(renewed);
    await load();
    assert.deepEqual(await saved(page), renewed);
    report.checks.push('last-call purchase, closed-plan controls, grandfathered renewal and reload');

    let release = morning(E.createGame(903, 42), 6, 'tech-1');
    release = morning(release, 11, 'tech-2');
    release = morning(release, 16, 'tech-3');
    await inject(release);
    await page.getByRole('button', { name: '均衡开发', exact: true }).click();
    await page.locator('#reset-command').scrollIntoViewIfNeeded();
    assert.match(await page.locator('#reset-command').innerText(), /6 Sol/);
    assert.match(await page.locator('#reset-command').innerText(), /费率 75%/);
    await shot('04-new-model');
    const start = await saved(page);
    await page.evaluate(() => window.advanceTime(60 * 60000));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).minute === 60);
    assert.ok((await saved(page)).players[0].projects[0].work > start.players[0].projects[0].work);
    report.checks.push('released and discounted models run in existing studio without extra scheduling');

    const old = E.createGame(904, 21);
    old.version = 4; delete old.platform;
    old.players[0].accounts[0].quota = 12;
    for (const p of old.players) for (const a of p.accounts) delete a.meter;
    await inject(old, 'reset-rush-v4');
    assert.equal((await saved(page)).version, 5);
    assert.equal(E.quotaPercent((await saved(page)).players[0].accounts[0]), 50);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v4')).version), 4);
    report.checks.push('v4 save migrated preserving percentage and original storage');

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await inject(release);
      await page.locator('#reset-command').scrollIntoViewIfNeeded();
      await shot(`05-mobile-${width}-models`);
      await inject(closed);
      await page.getByRole('button', { name: '账号管理', exact: true }).click();
      await shot(`06-mobile-${width}-retirement`);
      await page.getByRole('button', { name: '关闭弹窗' }).click();
    }
    report.checks.push('390px and 320px platform notices, strategy and account modal fit without horizontal overflow');
    assert.deepEqual(report.errors, []);
  } finally { await browser.close(); }
}
main().then(() => {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.map(s => s.file), errors: report.errors }, null, 2));
}).catch(e => {
  report.errors.push(e.stack);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.error(e); process.exitCode = 1;
});
