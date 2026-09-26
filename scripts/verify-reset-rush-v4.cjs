const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex', 'skills', 'develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3888';
const output = path.resolve(process.env.RESET_QA_DIR || 'tmp/reset-rush-v4-verify');
const report = { checks: [], screenshots: [], errors: [] };
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v4')));

async function load(page) {
  await page.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).ready !== false);
}

async function expectSave(page, expected) {
  await page.waitForFunction(state => {
    const raw = localStorage.getItem('reset-rush-v4');
    return raw && JSON.stringify(JSON.parse(raw)) === JSON.stringify(state);
  }, expected);
  assert.deepEqual(await saved(page), expected);
}

async function shot(page, name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: horizontal overflow`);
  if (fullPage) await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage, animations: 'disabled' }));
  report.screenshots.push({ file, pixels, state: await read(page) });
}

async function inject(page, state, key = 'reset-rush-v4') {
  await page.evaluate(({ state: value, key: storageKey }) => {
    for (const version of ['v1', 'v2', 'v3', 'v4']) localStorage.removeItem(`reset-rush-${version}`);
    localStorage.setItem(storageKey, JSON.stringify(value));
  }, { state, key });
  await load(page);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200, 'server responds before Chrome launch');
  const E = await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-features=SpeechSynthesis'] });
  try {
    const makeContext = options => browser.newContext({ ...options, reducedMotion: 'reduce' });
    const quiet = context => context.addInitScript(() => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    });
    const errors = page => {
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    };
    const desktop = await makeContext({ viewport: { width: 1440, height: 960 } });
    await quiet(desktop);
    const page = await desktop.newPage();
    errors(page);
    await load(page);
    await shot(page, '01-intro');

    await page.locator('#reset-length').selectOption('21');
    await page.locator('#start-game').click();
    await page.locator('dialog[open]').waitFor();
    let game = await saved(page);
    assert.equal(game.players[0].cash, 480);
    assert.equal(game.studio.threads, 1);
    await shot(page, '02-account-management', false);
    await page.locator(`[data-managed-account="${game.players[0].accounts[0].id}"]`).getByRole('button', { name: /→ PRO 200/ }).click();
    await expectSave(page, E.act(game, { type: 'upgrade', account: game.players[0].accounts[0].id, tier: 200 }));
    game = await saved(page);
    await page.getByRole('button', { name: '开新号 · 只花钱', exact: true }).nth(2).click();
    await expectSave(page, E.act(game, { type: 'buy', tier: 200 }));
    game = await saved(page);
    assert.deepEqual(game.players[0].accounts.map(account => account.tier), [200, 200]);
    assert.equal(game.players[0].energy, 12);
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    report.checks.push('new game opens account management; two $200 accounts cost cash only');

    for (let i = 0; i < 2; i += 1) {
      game = await saved(page);
      const target = game.market[0].id;
      await page.locator(`[data-project="${target}"]`).click();
      await expectSave(page, E.act(game, { type: 'claim', project: target }));
    }
    game = await saved(page);
    assert.equal(game.players[0].lanes.length, 1);
    assert.equal(game.players[0].lanes[0].projects.length, 3);
    const slider = page.locator('#studio-threads');
    await slider.focus();
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    game = await saved(page);
    assert.equal(game.studio.threads, 3);
    assert.equal(game.players[0].lanes.filter(lane => lane.enabled).length, 3);
    assert.equal(game.players[0].energy, 4);
    await page.locator('#studio-policy').selectOption('preferred');
    game = await saved(page);
    await page.locator('#studio-account').selectOption(String(game.players[0].accounts[1].id));
    game = await saved(page);
    assert.equal(game.players[0].lanes.every(lane => lane.account === game.players[0].accounts[1].id), true);
    await page.getByRole('button', { name: '重置冲刺' }).click();
    game = await saved(page);
    assert.deepEqual(game.development, { model: 'astra', effort: 'ultra', turbo: true });
    await shot(page, '03-auto-studio');
    await slider.focus();
    await slider.press('Home');
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    game = await saved(page);
    assert.equal(game.players[0].energy, 4, 'returning to paid slots must not charge again');
    await page.locator('#end-day').click();
    game = await saved(page);
    assert.equal(game.phase, 'reveal');
    assert.equal(game.minute, 480);
    await shot(page, '04-night-reveal');
    report.checks.push('auto queue, three threads, preferred account, preset, free same-day resizing and one-click reveal');

    let edge = E.createGame(804, 21);
    edge.players[0].projects[0].need = 1;
    await inject(page, edge);
    await page.locator('#next-node').click();
    game = await saved(page);
    assert.equal(game.minute, 6);
    assert.equal(game.players[0].shipped.length, 1);
    edge = E.createGame(805, 21);
    edge.players[0].accounts[0].quota = 0.001;
    await inject(page, edge);
    await page.locator('#next-node').click();
    game = await saved(page);
    assert.equal(game.players[0].accounts[0].quota, 0);
    const beforeBank = game.players[0].projects[0].work;
    await page.getByRole('button', { name: /使用银行券/ }).click();
    game = await saved(page);
    assert.equal(game.players[0].accounts[0].quota, 24);
    await page.locator('#end-day').click();
    game = await saved(page);
    assert.ok((game.players[0].projects[0]?.work ?? 0) > beforeBank || game.players[0].shipped.length > 0);
    report.checks.push('critical moment stops on delivery or exhaustion; banked quota resumes work');

    edge = E.createGame(806, 21);
    const old = structuredClone(edge);
    old.version = 3;
    delete old.studio;
    await inject(page, old, 'reset-rush-v3');
    game = await saved(page);
    assert.equal(game.version, 4);
    assert.equal(game.studio.mode, 'auto');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v3')).version), 3);
    report.checks.push('v3 save migrates to v4 while the original save remains');

    let quotaPolicy = E.createGame(809, 21);
    quotaPolicy = E.act(quotaPolicy, { type: 'buy', tier: 200 });
    quotaPolicy.players[0].accounts[1].quota = 80;
    await inject(page, quotaPolicy);
    await page.locator('#studio-policy').selectOption('most-quota');
    game = await saved(page);
    assert.equal(game.players[0].lanes[0].account, game.players[0].accounts[1].id);
    assert.equal(game.minute, 0);
    await page.evaluate(() => window.advanceTime(60000 * 60));
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).minute === 60);
    game = await saved(page);
    assert.equal(game.players[0].accounts[0].quota, 24);
    assert.ok(game.players[0].accounts[1].quota < 80);
    await load(page);
    assert.deepEqual(await saved(page), game);
    assert.equal(await page.locator('#studio-policy').inputValue(), 'most-quota');
    await page.locator('#reset-command').scrollIntoViewIfNeeded();
    await shot(page, '05-most-quota-policy', false);
    report.checks.push('most-quota selects by absolute balance, runs without manual switching and persists on reload');

    await inject(page, E.createGame(807, 21));
    for (let day = 1; day <= 21; day += 1) {
      game = await saved(page);
      assert.equal(game.day, day);
      if (game.players[0].energy >= 3) await page.locator(`[data-project="${game.market[0].id}"]`).click();
      await page.locator('#end-day').click();
      assert.equal((await saved(page)).phase, 'reveal');
      await page.locator('#next-day').click();
    }
    game = await saved(page);
    assert.equal(game.phase, 'over');
    assert.ok(game.players[0].shipped.length >= 1);
    await shot(page, '05-season-ranking');
    report.checks.push(`21-day UI season completed: ${game.players[0].shipped.length} releases`);

    for (const width of [390, 320]) {
      const mobile = await makeContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      await quiet(mobile);
      const touch = await mobile.newPage();
      errors(touch);
      await load(touch);
      await touch.locator('#start-game').tap();
      await touch.getByRole('button', { name: '关闭弹窗' }).tap();
      game = await saved(touch);
      await touch.locator(`[data-project="${game.market[0].id}"]`).tap();
      await touch.locator('#studio-policy').selectOption('most-quota');
      await touch.locator('#studio-threads').focus();
      await touch.locator('#studio-threads').press('ArrowRight');
      await shot(touch, `06-mobile-${width}-studio`);
      await touch.locator('#reset-command').scrollIntoViewIfNeeded();
      await shot(touch, `07-mobile-${width}-strategy`, false);
      await touch.locator('#end-day').tap();
      assert.equal((await read(touch)).phase, 'reveal');
      await touch.locator('#next-day').scrollIntoViewIfNeeded();
      await shot(touch, `08-mobile-${width}-reveal`, false);
      await mobile.close();
    }
    report.checks.push('390px and 320px touch flow: account modal, claim, strategy, reveal, no horizontal overflow');
    assert.deepEqual(report.errors, []);
  } finally {
    await browser.close();
  }
}

main().then(() => {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.map(item => item.file), errors: report.errors }, null, 2));
}).catch(error => {
  report.errors.push(error.stack);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.error(error);
  process.exitCode = 1;
});
