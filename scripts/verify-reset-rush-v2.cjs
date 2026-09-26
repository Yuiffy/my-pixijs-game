const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3888';
const output = path.resolve(process.env.RESET_V2_DIR || 'tmp/reset-rush-v2-lifecycle');
const report = { checks: [], errors: [], screenshots: [] };
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));

(async () => {
  assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-features=SpeechSynthesis'] });
  async function pageFor(g, mobile = false) {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 }, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });
    await ctx.addInitScript(state => {
      if (!sessionStorage.getItem('rr-fixture')) {
        localStorage.setItem(`reset-rush-v${state.version}`, JSON.stringify(state));
        sessionStorage.setItem('rr-fixture', '1');
      }
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    }, g);
    const p = await ctx.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await p.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'plan');
    return p;
  }
  async function shot(p, name, fullPage = true) {
    await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name);
    const file = path.join(output, `${name}.png`);
    report.screenshots.push({ file, pixels: inspectPng(await p.screenshot({ path: file, fullPage, animations: 'disabled' })), state: await read(p) });
  }
  try {
    const challenge = E.createGame(18);
    challenge.players[0].projects[0] = { ...challenge.market[0], name: '复杂工程验收', difficulty: 4, need: 68 };
    const p = await pageFor(challenge);
    for (const model of Object.keys(E.MODELS)) for (const effort of Object.keys(E.EFFORTS)) for (const turbo of [false, true]) {
      await p.locator(`[data-model="${model}"]`).click();
      await p.locator('#reset-effort').selectOption(effort);
      await p.locator('#reset-turbo').setChecked(turbo);
      const state = await read(p);
      assert.deepEqual(state.development, { model, effort, turbo });
      assert.equal(state.actions, 3);
      const stats = E.developmentStats(challenge, challenge.players[0], state.development, challenge.players[0].projects[0]);
      const preview = await p.getByTestId('development-preview').innerText();
      assert.match(preview, new RegExp(`bug 风险 ${stats.risk}%`));
      assert.equal(await p.locator('#develop').isDisabled(), stats.cost > 24);
    }
    await p.locator('[data-model="luna"]').click();
    await p.locator('#reset-effort').selectOption('medium');
    await p.locator('#reset-turbo').uncheck();
    await p.locator('#reset-command').scrollIntoViewIfNeeded();
    await shot(p, '01-luna-hard-task-risk', false);
    await p.locator('[data-model="astra"]').click();
    await p.locator('#reset-effort').selectOption('ultra');
    await p.locator('#reset-turbo').check();
    await p.getByRole('button', { name: '账号管理', exact: true }).click();
    await p.getByRole('button', { name: '补 $180 → PRO 200', exact: true }).click();
    await p.getByRole('button', { name: '关闭弹窗' }).click();
    await p.locator('#reset-command').scrollIntoViewIfNeeded();
    await shot(p, '02-astra-ultra-turbo-safe', false);
    await p.reload({ waitUntil: 'networkidle' });
    assert.deepEqual((await read(p)).development, { model: 'astra', effort: 'ultra', turbo: true });
    await p.locator('#develop').click();
    let state = await read(p);
    assert.equal(state.players[0].projects[0].bugs, 0);
    assert.equal(state.players[0].projects[0].work, 36);
    assert.equal(state.players[0].accounts[0].quota, 126);
    report.checks.push('36 UI configurations are independent and free to change; exact risk preview and quota gating; settings persist; capable Ultra/Turbo produces no bug');

    let lifecycle = E.createGame(42);
    lifecycle = E.act(lifecycle, { type: 'upgrade', account: lifecycle.players[0].accounts[0].id, tier: 200 });
    lifecycle = E.act(lifecycle, { type: 'buy', tier: 200 });
    lifecycle.day = 30; lifecycle.cursor = 12; lifecycle.event = { ...E.EVENTS[2] }; lifecycle.events = ['quiet'];
    lifecycle.players[0].accounts[0].banks = [34, 39];
    const mp = await pageFor(lifecycle, true);
    await mp.getByRole('button', { name: '账号管理', exact: true }).tap();
    await mp.getByRole('combobox', { name: '账号 1 到期方案', exact: true }).selectOption('20');
    await mp.getByRole('combobox', { name: '账号 2 到期方案', exact: true }).selectOption('0');
    state = await read(mp); assert.equal(state.actions, 0); assert.equal(state.players[0].cash, 100);
    assert.equal(state.players[0].accounts[0].tier, 200);
    await shot(mp, '03-mobile-scheduled-downgrade', false);
    await mp.getByRole('button', { name: '关闭弹窗' }).tap();
    await mp.locator('#end-day').tap();
    await mp.getByRole('button', { name: '账号管理', exact: true }).tap();
    assert.equal(await mp.getByRole('combobox', { name: '账号 1 到期方案', exact: true }).inputValue(), '20');
    await mp.getByRole('button', { name: '关闭弹窗' }).tap();
    await mp.locator('#next-day').tap();
    state = await read(mp);
    assert.equal(state.players[0].cash, 80); assert.equal(state.players[0].accounts[0].tier, 20);
    assert.equal(state.players[0].accounts[0].quota, 24); assert.equal(state.players[0].accounts[0].nextReset, 38);
    assert.deepEqual(state.players[0].accounts[0].banks, [34, 39]);
    assert.equal(state.players[0].accounts[1].quota, 0); assert.equal(state.players[0].accounts[1].paidUntil, 30);
    await mp.getByRole('button', { name: /手写外包/ }).tap();
    await mp.getByRole('button', { name: '账号管理', exact: true }).tap();
    await mp.getByRole('button', { name: '$100 续开 PRO 100', exact: true }).tap();
    state = await read(mp); assert.equal(state.players[0].accounts[1].tier, 100); assert.equal(state.players[0].accounts[1].paidUntil, 60); assert.equal(state.players[0].cash, 5);
    await mp.setViewportSize({ width: 320, height: 740 });
    await shot(mp, '04-mobile320-renewed', false);
    await mp.getByRole('button', { name: '关闭弹窗' }).tap();
    report.checks.push('policies change at zero actions and remain available at night; D31 downgrade/stop applies once; original bank expiry kept; expired account resumes at another tier; 390/320 touch');

    const old = JSON.parse(fs.readFileSync(path.join(__dirname,'tests/fixtures/reset-rush-v1.json'),'utf8'));
    const legacyPage = await pageFor(old);
    state = await read(legacyPage); assert.equal(state.version, 2); assert.equal(state.players[0].cash, 100); assert.equal(state.players[0].projects[0].work, 8); assert.ok(state.players[0].accounts.every(a => a.renewal === null));
    const stored = await legacyPage.evaluate(() => localStorage.getItem('reset-rush-v2'));
    await legacyPage.reload({ waitUntil: 'networkidle' });
    assert.equal(await legacyPage.evaluate(() => localStorage.getItem('reset-rush-v2')), stored);
    report.checks.push('a real checkpoint v1 save migrates in browser and its v2 save survives reload');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots.map(s => s.file), errors: report.errors }, null, 2));
  } catch (e) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: e.stack, ...report }, null, 2)); throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
