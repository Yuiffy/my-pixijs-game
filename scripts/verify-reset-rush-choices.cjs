const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3888';
const output = path.resolve(process.env.RESET_CHOICES_DIR || 'tmp/reset-rush-choices');
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const report = { checks: [], errors: [], screenshots: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-features=SpeechSynthesis'] });
  async function pageFor(g, mobile = false) {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });
    await ctx.route(/googlesyndication|google-analytics|hm\.baidu|googletagservices|doubleclick/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await ctx.addInitScript(state => { localStorage.setItem('reset-rush-v2', JSON.stringify(state)); if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; }, g);
    const p = await ctx.newPage(); p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await p.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'plan');
    return p;
  }
  async function shot(p, name, fullPage = true) {
    await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const file = path.join(output, `${name}.png`);
    report.screenshots.push({ file, pixels: inspectPng(await p.screenshot({ path: file, fullPage, animations: 'disabled' })), state: await read(p) });
  }
  try {
    const p = await pageFor(E.createGame(84));
    if(!(await p.locator('dialog[open]').count())) await p.getByRole('button', { name: '账号管理', exact: true }).click(); await p.getByRole('button', { name: '补 $80 → PRO 100', exact: true }).click();
    let g = await read(p); assert.equal(g.players[0].cash, 400); assert.equal(g.players[0].accounts[0].quota, 90); assert.equal(g.actions, 2);
    if(!(await p.locator('dialog[open]').count())) await p.getByRole('button', { name: '账号管理', exact: true }).click(); await p.getByRole('button', { name: /开新号/ }).nth(2).click();
    if(!(await p.locator('dialog[open]').count())) await p.getByRole('button', { name: '账号管理', exact: true }).click(); await p.getByRole('button', { name: /开新号/ }).nth(0).click();
    g = await read(p); assert.equal(g.players[0].accounts.length, 3); assert.equal(g.players[0].cash, 180); assert.equal(g.actions, 0);
    await p.getByRole('button', { name: '关闭弹窗' }).click(); await p.locator('#end-day').click(); await p.locator('#next-day').click();
    if(!(await p.locator('dialog[open]').count())) await p.getByRole('button', { name: '账号管理', exact: true }).click();
    for (const b of await p.getByRole('button', { name: /开新号/ }).all()) assert.equal(await b.isDisabled(), true);
    await p.getByRole('button', { name: '关闭弹窗' }).click();
    const old = await read(p); await p.getByRole('button', { name: /放弃项目/ }).click();
    g = await read(p); assert.equal(g.players[0].vp, old.players[0].vp - 2); assert.equal(g.players[0].projects.length, 0);
    await p.getByRole('button', { name: /手写外包/ }).click(); assert.equal((await read(p)).players[0].cash, g.players[0].cash + 25);
    report.checks.push('upgrade costs only difference; three distinct paid accounts; cap enforced; abandon penalty; manual cash action');

    const empty = E.createGame(33); empty.players[0].accounts[0].quota = 0; empty.players[0].accounts[0].banks = [];
    const lp = await pageFor(empty);
    assert.equal(await lp.locator('#develop').isDisabled(), true); assert.match(await lp.locator('main').innerText(), /额度不足/);
    await lp.locator('[data-model="luna"]').focus(); await lp.keyboard.press('Enter');
    await lp.locator('#develop').focus(); await lp.keyboard.press('Enter');
    g = await read(lp); assert.equal(g.players[0].projects[0].work, 3); assert.equal(g.players[0].accounts[0].quota, 0); assert.equal(g.actions, 2);
    await shot(lp, '01-luna-fallback'); report.checks.push('zero quota disables paid mode, keyboard-only Luna progresses without negative resources');

    const dual = E.createGame(42);const first=dual.players[0].accounts[0];first.tier=200;first.quota=180;dual.players[0].cash=100;dual.players[0].accounts.push({...structuredClone(first),id:++dual.serial}); dual.day = 7; dual.event = { ...E.EVENTS[2] };
    dual.players[0].accounts[0].quota = 0; dual.players[0].accounts[0].nextReset = 9; dual.players[0].accounts[0].banks = [8];
    dual.players[0].accounts[1].quota = 30;
    const mp = await pageFor(dual, true);
    await mp.evaluate(() => scrollTo(0, 0));
    const nav = await mp.getByRole('navigation', { name: '牌桌快捷跳转' }).boundingBox(); assert.ok(nav.y >= 0 && nav.y + nav.height <= 845);
    await mp.getByRole('link', { name: '账号 / 银行券', exact: true }).tap();
    await mp.getByRole('button', { name: /使用银行券/ }).tap();
    g = await read(mp); assert.equal(g.actions, 3); assert.equal(g.players[0].accounts[0].quota, 180); assert.equal(g.players[0].accounts[1].quota, 30);
    assert.equal(g.players[0].accounts[0].nextReset, 9); assert.equal(g.players[0].accounts[0].banks.length, 0);
    await mp.getByRole('link', { name: '开蹬 ↓', exact: true }).tap();
    const command = await mp.locator('#develop').boundingBox();
    assert.ok(command.y >= 0 && command.y + command.height < 800, 'quick jump brings the primary action into the touch viewport');
    await shot(mp, '02-mobile-quick-actions', false);
    await mp.setViewportSize({ width: 320, height: 740 });
    await mp.getByRole('link', { name: '开蹬 ↓', exact: true }).tap();
    await mp.locator('#develop').tap();
    assert.equal((await read(mp)).players[0].projects[0].work, 6);
    await shot(mp, '03-mobile320-action', false);
    await mp.locator('#end-day').tap(); await mp.getByRole('button', { name: /确认收工并揭牌/ }).tap(); await mp.locator('#next-day').tap();
    g = await read(mp); assert.equal(g.day, 8); assert.equal(g.players[0].accounts[1].quota, 180); assert.equal(g.players[0].accounts[1].nextReset, 15); assert.equal(g.players[0].accounts[0].nextReset, 9);
    report.checks.push('390/320 sticky navigation and real touch development; use expiring token on one account while other naturally resets next morning');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.checks));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
