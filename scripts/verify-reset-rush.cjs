const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex', 'skills', 'develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3888';
const output = path.resolve(process.env.RESET_QA_DIR || 'tmp/reset-rush-verify');
const report = { screenshots: [], errors: [], assertions: [], actions: {}, reveals: {} };
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const saved = p => p.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v1')));
let E;
async function shot(p, name) {
  await p.evaluate(() => document.fonts.ready);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} overflow`);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.screenshots.push({ file, pixels, state: await read(p) });
}
async function quiet(context) {
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  });
}
function errors(p) {
  p.on('pageerror', e => report.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
}
async function load(p) {
  await p.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase);
}
async function perform(p, a) {
  const before = await saved(p);
  assert.equal(E.actionError(before, 0, a), null, JSON.stringify(a));
  report.actions[a.type] = (report.actions[a.type] || 0) + 1;
  if (a.type === 'develop') {
    await p.locator(`[data-project="${a.project}"]`).click();
    const index = before.players[0].accounts.findIndex(x => x.id === a.account);
    if (index >= 0) await p.getByRole('button', { name: `选择账号 ${index + 1}`, exact: true }).click();
    await p.locator(`[data-mode="${a.mode}"]`).click();
    await p.locator('#develop').click();
  } else if (a.type === 'claim') await p.locator(`[data-project="${a.project}"]`).click();
  else if (a.type === 'test') {
    await p.locator(`[data-project="${a.project}"]`).click();
    await p.getByRole('button', { name: /测试修 bug/ }).click();
  } else if (a.type === 'bank') {
    const index = before.players[0].accounts.findIndex(x => x.id === a.account);
    await p.getByRole('button', { name: `选择账号 ${index + 1}`, exact: true }).click();
    await p.getByRole('button', { name: /使用银行券/ }).click();
  } else if (a.type === 'freelance') await p.getByRole('button', { name: /手写外包/ }).click();
  else if (a.type === 'renew') {
    const index = before.players[0].accounts.findIndex(x => x.id === a.account);
    await p.getByRole('button', { name: /^续费/ }).nth(before.players[0].accounts.slice(0, index).filter(x => x.paidUntil < before.day).length).click();
  } else if (a.type === 'buy' || a.type === 'upgrade') {
    await p.getByRole('button', { name: /管理/ }).click();
    if (a.type === 'buy') await p.getByRole('button', { name: /开新号/ }).nth([20, 100, 200].indexOf(a.tier)).click();
    else await p.getByRole('button', { name: new RegExp(`→ ${E.PLANS[a.tier].name}`) }).click();
  } else throw new Error(`Unhandled UI action ${a.type}`);
  await p.waitForFunction(({ cursor, banks }) => {
    const g = JSON.parse(localStorage.getItem('reset-rush-v1'));
    return g.cursor !== cursor || g.players[0].banksUsed !== banks;
  }, { cursor: before.cursor, banks: before.players[0].banksUsed });
  const next = await saved(p);
  assert.deepEqual(next, E.act(before, a), `UI matches reducer for ${a.type}`);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const response = await fetch(`${base}/game/reset-rush`);
  assert.equal(response.status, 200, 'server responds before browser launch');
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  E = await loadTypescriptModule('src/components/resetRush/engine.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-features=SpeechSynthesis'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    await quiet(ctx); const p = await ctx.newPage(); errors(p); await load(p);
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).ready);
    await shot(p, '01-intro-desktop');
    await p.locator('#reset-seed').fill('84'); await p.locator('#start-game').click();
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'plan');
    await shot(p, '02-board-desktop');
    await p.getByRole('button', { name: /玩法说明/ }).click();
    assert.ok(await p.locator('dialog[open]').isVisible());
    await p.keyboard.press('Escape'); assert.equal(await p.locator('dialog[open]').count(), 0);
    assert.match(await p.evaluate(() => document.activeElement.textContent), /玩法说明/);
    await p.keyboard.press('f'); assert.equal(await p.evaluate(() => !!document.fullscreenElement), true);
    await p.keyboard.press('f'); assert.equal(await p.evaluate(() => !!document.fullscreenElement), false);
    report.assertions.push('rules keyboard dismissal restores focus; F toggles fullscreen');
    let g = await saved(p);
    await perform(p, { type: 'develop', project: g.players[0].projects[0].id, account: g.players[0].accounts[0].id, mode: 'astra' });
    g = await saved(p); await perform(p, { type: 'bank', account: g.players[0].accounts[0].id });
    const preserved = await saved(p); await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).day === 1);
    assert.deepEqual(await saved(p), preserved); report.assertions.push('reload preserves actions, banks, market and RNG');
    await p.locator('#end-day').click(); assert.ok(await p.locator('dialog[open]').isVisible());
    await p.getByRole('button', { name: '再蹬一会儿' }).click();
    assert.deepEqual(await saved(p), preserved); report.assertions.push('early end can be cancelled without spending');

    const seen = new Set(); let guard = 0;
    while ((await read(p)).phase !== 'over' && guard++ < 400) {
      g = await saved(p);
      if (g.phase === 'reveal') {
        report.reveals[g.receipt.kind] = (report.reveals[g.receipt.kind] || 0) + 1;
        if (!seen.has(g.receipt.kind) && g.receipt.kind !== 'quiet') {
          await shot(p, `03-reveal-${g.receipt.kind}`); seen.add(g.receipt.kind);
        }
        await p.locator('#next-day').click();
        await p.waitForFunction(day => { const s = JSON.parse(window.render_game_to_text()); return s.day !== day || s.phase === 'over'; }, g.day);
        if (g.day === 30) await shot(p, '04-renewal-day31');
      } else if (E.actionsLeft(g)) await perform(p, E.chooseAction(g, 0));
      else {
        await p.locator('#end-day').click();
        await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'reveal');
      }
    }
    assert.equal((await read(p)).phase, 'over'); assert.equal((await read(p)).day, 42);
    assert.ok((await read(p)).players[0].shipped.length > 10);
    await shot(p, '05-final-ranking');
    const final = await saved(p); await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'over'); assert.deepEqual(await saved(p), final);
    report.assertions.push('complete 42-day season through real buttons; final score persists');
    await p.getByRole('button', { name: '看看我的作品', exact: true }).click();
    assert.equal(await p.locator('dialog[open]').count(), 1); await p.keyboard.press('Escape');
    await p.getByRole('button', { name: '重新开局', exact: true }).click();
    await p.getByRole('button', { name: '回到准备页', exact: true }).click();
    assert.equal((await read(p)).phase, 'intro'); assert.equal(await saved(p), null);
    report.assertions.push('restart returns to setup and clears only this game save');

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await quiet(mobile); const mp = await mobile.newPage(); errors(mp); await load(mp);
    await mp.getByRole('button', { name: /双号狂蹬/ }).tap(); await mp.locator('#reset-length').selectOption('21');
    await mp.locator('#start-game').tap(); await mp.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'plan');
    assert.equal((await read(mp)).players[0].accounts.length, 2);
    await mp.getByRole('button', { name: '选择账号 2', exact: true }).tap();
    await mp.locator('[data-mode="ultra"]').tap(); await mp.locator('#develop').tap();
    const mstate = await read(mp); assert.equal(mstate.players[0].accounts[0].quota, 180); assert.equal(mstate.players[0].accounts[1].quota, 156);
    await shot(mp, '06-mobile390-dual');
    await mp.getByRole('button', { name: /管理/ }).tap();
    assert.equal(await mp.getByRole('button', { name: /开新号/ }).nth(2).isDisabled(), true);
    await shot(mp, '07-mobile-shop');
    await mp.getByRole('button', { name: '关闭弹窗' }).tap();
    await mp.setViewportSize({ width: 320, height: 740 });
    await shot(mp, '08-mobile320');
    report.assertions.push('390/320 touch; independent second account; unaffordable purchase disabled; no horizontal overflow');

    const bad = await browser.newContext({ viewport: { width: 1000, height: 800 } }); await quiet(bad);
    await bad.addInitScript(() => localStorage.setItem('reset-rush-v1', '{"version":1}'));
    const bp = await bad.newPage(); errors(bp); await load(bp); assert.equal((await read(bp)).phase, 'intro');
    report.assertions.push('malformed save recovers to setup');
    const noStore = await browser.newContext({ viewport: { width: 1000, height: 800 } }); await quiet(noStore);
    await noStore.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage disabled'); } }); });
    const np = await noStore.newPage(); errors(np); await load(np); await np.locator('#start-game').click();
    assert.equal((await read(np)).phase, 'plan'); assert.match(await np.locator('footer').innerText(), /未能保存/);
    report.assertions.push('game remains playable when localStorage is unavailable');
    await p.goto(`${base}/demos`, { waitUntil: 'networkidle' });
    assert.equal(await p.locator('a[href="/game/reset-rush"]').count(), 1);
    report.assertions.push('catalog route is discoverable');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ screenshots: report.screenshots.map(s => s.file), assertions: report.assertions, actions: report.actions, reveals: report.reveals, errors: report.errors }, null, 2));
  } catch (e) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ message: e.stack, ...report }, null, 2));
    throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
