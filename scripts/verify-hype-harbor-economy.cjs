const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const ts = require('typescript');
const filename = path.resolve('src/components/hypeHarbor/engine.ts');
const compiled = new Module(filename);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const E = compiled.exports;
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch { /* Try installed copies. */ }
}
if (!chromium) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright package.');
const base = process.env.HARBOR_BASE_URL || 'http://127.0.0.1:3886';
const out = 'tmp/hype-harbor-economy';
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const click = (page, id) => page.getByTestId(id).click();
const errors = [];
const captures = [];
async function capture(page, name) {
  await page.waitForTimeout(200);
  const file = path.join(out, `${name}.png`);
  const metrics = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, canvas: [canvas.width, canvas.height] };
  });
  assert.equal(layout.overflow, false);
  assert.ok(layout.canvas.every(n => n > 0));
  assert.ok(metrics.colors > 1 && metrics.nearBlackRatio < 0.95);
  const snapshot = await state(page);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(snapshot, null, 2));
  captures.push({ file, layout, metrics, phase: snapshot.phase });
}
async function center(page, id) {
  const b = await page.getByTestId(id).boundingBox();
  return { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 };
}
async function dragMouse(page, source, target) {
  await page.getByTestId(source).scrollIntoViewIfNeeded();
  await page.getByTestId(target).scrollIntoViewIfNeeded();
  const a = await center(page, source), b = await center(page, target);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
}
(async () => {
  assert.equal((await fetch(`${base}/game/hype-harbor`, { signal: AbortSignal.timeout(55000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  async function setup(saved, mobile = false) {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 }, hasTouch: mobile, isMobile: mobile });
    await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    if (saved) await ctx.addInitScript(raw => { if (!localStorage.getItem('hype-harbor-v1')) localStorage.setItem('hype-harbor-v1', raw); }, JSON.stringify(saved));
    await ctx.route(/google-analytics|googlesyndication|hm\.baidu\.com/, route => route.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_BLOCKED_BY_CLIENT')) errors.push({ text: m.text(), location: m.location() }); });
    page.on('response', response => { if (response.status() >= 400) errors.push({ url: response.url(), status: response.status() }); });
    await page.goto(`${base}/game/hype-harbor`, { waitUntil: 'networkidle' });
    await click(page, saved ? 'resume' : 'start');
    return { page, ctx };
  }
  try {
    const desktop = await setup(); const p = desktop.page;
    assert.deepEqual((await state(p)).boats.map(b => b.position), [4, 4, 4]);
    assert.match(await p.getByTestId('warmup-2').innerText(), /36/);
    assert.equal(await p.getByTestId('warmup-2').locator('[title^="第"]').count(), 4);
    const hull = await center(p, 'warmup-0');
    const initial = (await state(p)).boats.map(b => b.position);
    await p.mouse.move(hull.x, hull.y); await p.mouse.down();
    await p.mouse.move(hull.x + 100, hull.y, { steps: 10 });
    assert.equal(await p.getByTestId('warmup-0').getAttribute('aria-valuenow'), '6');
    assert.deepEqual((await state(p)).boats.map(b => b.position), initial, 'preview must not commit');
    await capture(p, '00-drag-preview');
    const preview = await p.getByRole('slider').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('aria-valuenow'))));
    assert.equal(preview.reduce((a, b) => a + b, 0), 12);
    await p.mouse.up();
    assert.deepEqual((await state(p)).boats.map(b => b.position), preview, 'release must match preview');
    const h2 = await center(p, 'warmup-0');
    await p.mouse.move(h2.x, h2.y); await p.mouse.down(); await p.mouse.move(h2.x - 100, h2.y, { steps: 8 });
    await p.keyboard.press('Escape'); await p.mouse.up();
    assert.deepEqual((await state(p)).boats.map(b => b.position), preview, 'Escape cancels hull movement');
    await p.getByTestId('warmup-0').focus(); await p.keyboard.press('Home');
    assert.equal((await state(p)).boats[0].position, 2);
    await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
    assert.equal((await state(p)).boats[0].position, 4);
    await p.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await p.getByTestId('warmup-0').evaluate(n => getComputedStyle(n.parentElement).transitionDuration), '0s');
    await p.getByLabel('满座歌回增加预热').click();
    await dragMouse(p, 'character-0', 'boat-1');
    assert.deepEqual((await state(p)).boats.map(b => b.streamer), ['nagisa', 'sui', 'shiori']);
    assert.equal((await state(p)).boats[0].position, 5);
    assert.equal((await state(p)).boats.reduce((sum, b) => sum + b.position, 0), 12);
    await dragMouse(p, 'resting-dock', 'boat-2');
    assert.equal((await state(p)).resting, 'shiori');
    await p.getByTestId('boat-0').focus(); await p.keyboard.press('Enter');
    await p.getByTestId('resting-dock').focus(); await p.keyboard.press('Enter');
    assert.equal((await state(p)).resting, 'nagisa');
    const before = (await state(p)).boats.map(b => b.streamer);
    await p.getByTestId('boat-0').scrollIntoViewIfNeeded();
    const a = await center(p, 'boat-0');
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(1400, 30, { steps: 8 }); await p.mouse.up();
    assert.deepEqual((await state(p)).boats.map(b => b.streamer), before, 'outside drop cancels');
    assert.equal(await p.evaluate(() => window.getSelection().toString()), '', 'drag must not select page text');
    await click(p, 'boat-0'); await p.keyboard.press('Escape');
    await click(p, 'boat-1');
    assert.deepEqual((await state(p)).boats.map(b => b.streamer), before, 'Escape cancels selection');
    await p.keyboard.press('Escape');
    await capture(p, '01-desktop-arrangement');
    await p.reload({ waitUntil: 'networkidle' }); await click(p, 'resume');
    assert.deepEqual((await state(p)).boats.map(b => b.streamer), before);
    await click(p, 'launch');
    await capture(p, '02-first-ticket');
    assert.match(await p.getByTestId('pool-preview').innerText(), /18 币酬金总额/);
    await desktop.ctx.close();

    const mobile = await setup(null, true); const m = mobile.page;
    await m.getByTestId('character-0').scrollIntoViewIfNeeded();
    const start = await center(m, 'character-0'), end = await center(m, 'boat-1');
    const cdp = await mobile.ctx.newCDPSession(m);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 10, y: start.y + (end.y - start.y) * step / 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual((await state(m)).boats.map(b => b.streamer), ['nagisa', 'sui', 'shiori']);
    await m.getByTestId('warmup-0').scrollIntoViewIfNeeded();
    const touchHull = await center(m, 'warmup-0');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchHull] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchHull.x + 45, y: touchHull.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await state(m)).boats[0].position, 6);
    assert.equal((await state(m)).boats.reduce((a, b) => a + b.position, 0), 12);
    await m.getByTestId('resting-dock').tap();
    await m.getByTestId('boat-0').tap();
    assert.equal((await state(m)).boats[0].streamer, 'mizuki');
    await m.setViewportSize({ width: 320, height: 760 });
    await capture(m, '03-mobile-arrangement');
    await mobile.ctx.close();

    const saved = E.launch(E.createGame([{ name: '你', ai: false }, { name: '朋友甲', ai: false }, { name: '朋友乙', ai: false }], 3, 91));
    saved.beat = 3; saved.boats[1].position = 14;
    saved.boats[1].seats = [{ player: 0, cost: 3, insured: false }, { player: 1, cost: 4, insured: false }];
    saved.players[0].cash = 27; saved.players[1].cash = 26;
    const pool = await setup(saved); const q = pool.page;
    await click(q, 'handoff'); await click(q, 'boat-1');
    assert.match(await q.getByTestId('pool-preview').innerText(), /你已有 1 席/);
    assert.match(await q.getByLabel('当前操作').innerText(), /新增净收益 -1 币/);
    await capture(q, '04-repeat-seat-preview');
    await click(q, 'confirm-action');
    assert.deepEqual((await state(q)).boats[1].seats.map(s => s.player), [0, 1, 0]);
    await q.reload({ waitUntil: 'networkidle' }); await click(q, 'resume');
    for (let i = 0; i < 2; i++) { await click(q, 'handoff'); await click(q, 'work'); }
    await click(q, 'roll'); await click(q, 'continue');
    const settled = await state(q);
    assert.deepEqual(settled.result.payments.map(p => p.amount), [8, 8, 8]);
    assert.deepEqual(settled.players.map(p => p.cash), [38, 35, 31]);
    await q.locator('aside details').first().locator('summary').click();
    await q.setViewportSize({ width: 390, height: 844 });
    await capture(q, '05-mobile-shared-settlement');
    await pool.ctx.close();

    const four = E.launch(E.createGame([{ name: '你', ai: false }, { name: '朋友', ai: false }], 3, 18));
    four.beat = 3; four.boats[2].position = 14;
    four.boats[2].seats = [0, 1, 0].map((player, i) => ({ player, cost: 4 + i, insured: false }));
    four.players[0].cash = 20; four.players[1].cash = 25;
    const anniversary = await setup(four); const f = anniversary.page;
    await click(f, 'handoff'); await click(f, 'boat-2');
    assert.match(await f.getByTestId('pool-preview').innerText(), /36 币酬金总额/);
    assert.equal(await f.getByTestId('pool-preview').locator('[data-next="true"]').count(), 1);
    await click(f, 'confirm-action');
    assert.equal((await state(f)).boats[2].seats.length, 4);
    await click(f, 'handoff'); await click(f, 'work'); await click(f, 'roll'); await click(f, 'continue');
    assert.deepEqual((await state(f)).result.payments.map(p => p.amount), [9, 9, 9, 9]);
    await capture(f, '06-four-seat-settlement');
    await anniversary.ctx.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, captures: captures.length, errors }));
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ captures, errors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
