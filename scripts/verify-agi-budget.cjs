const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/.codex/skills/develop-web-game/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { aiAction, aiPolicy, chooseAiCompany } = require('./tests/helpers/agi-ui.cjs');
const base = process.env.MINI_BASE_URL || 'http://localhost:3994';
const output = process.env.AGI_BUDGET_OUTPUT || 'tmp/agi-budget-dev';
fs.mkdirSync(output, { recursive: true });
(async () => {
  assert.equal((await fetch(base + '/game/agi')).status, 200);
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
  const { aiPilot } = await import('./tests/helpers/mini-games-pilots.mjs');
  const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio', '--disable-speech-api'] });
  const errors = [], captures = [], checks = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, hasTouch: true });
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    if (sessionStorage.getItem('agi-budget-clear')) { localStorage.removeItem('mini-agi-v1'); sessionStorage.removeItem('agi-budget-clear'); }
    const fixture = sessionStorage.getItem('agi-budget-fixture');
    if (fixture) { localStorage.setItem('mini-agi-v1', fixture); sessionStorage.removeItem('agi-budget-fixture'); }
  });
  await context.route('**/api/record', r => r.fulfill({ json: { success: true } }));
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const exact = name => page.getByRole('button', { name, exact: true });
  const open = async () => { await page.goto(base + '/game/agi', { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!window.render_game_to_text); };
  const fixture = async value => { await page.evaluate(s => sessionStorage.setItem('agi-budget-fixture', JSON.stringify(s)), value); await open(); };
  const budgetButton = () => page.getByRole('button', { name: '查看本季收支 ↗', exact: true });
  const dialog = () => page.getByRole('dialog', { name: '本季收支预估' });
  const verify = async () => {
    const s = await state(), expected = ai.aiQuarterBudget(s);
    assert.equal(Number(await page.locator('[data-budget-cash]').getAttribute('data-budget-cash')), expected.cashAfter);
    for (const key of ['income', 'upkeep', 'refund']) assert.equal(Number(await page.locator(`[data-budget-${key}]`).getAttribute(`data-budget-${key}`)), expected[key]);
    return { s, expected };
  };
  const settle = async () => {
    const { s } = await verify(); const expected = ai.endAiTurn(s);
    await exact('结束季度 →').click(); const after = await state();
    assert.equal(after.cash, expected.cash); assert.equal(after.industry.lastIncome, expected.industry.lastIncome);
    assert.equal(after.industry.lastCosts, expected.industry.lastCosts); assert.deepEqual(after.ending, expected.ending);
    return after;
  };
  const shot = async name => {
    await page.waitForTimeout(120);
    const pixels = inspectPng(await page.screenshot({ path: path.join(output, name + '.png'), fullPage: false, animations: 'disabled' }));
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect();
      const d = document.querySelector('dialog[open]'), bounds = d?.getBoundingClientRect();
      const close = d?.querySelector('header button')?.getBoundingClientRect();
      return { canvas: { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height }, overflow: document.documentElement.scrollWidth > innerWidth + 1,
        dialogFits: !bounds || (bounds.x >= 0 && bounds.y >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight), closeFits: !close || (close.y >= 0 && close.bottom <= innerHeight) };
    });
    assert.equal(geometry.overflow, false); assert.ok(geometry.dialogFits && geometry.closeFits); assert.ok(geometry.canvas.width > 0 && geometry.canvas.cssWidth > 0);
    captures.push({ name, pixels, geometry, state: await state() });
  };
  const check = name => { checks.push(name); console.log('PASS ' + name); };
  const launched = () => {
    const s = ai.decideAiEvent(ai.createAi(2026, 'product', 'openai', 'relaxed'), 'defer');
    Object.assign(s, { product: 45, capability: 45, safety: 35, cash: 80, event: 2 });
    Object.assign(s.industry, { reliability: 40, hype: 75 }); return s;
  };
  try {
    await open(); await fixture(launched());
    await verify(); await budgetButton().focus(); await page.keyboard.press('Enter'); await dialog().waitFor();
    assert.match(await dialog().innerText(), /23.7 M/); assert.match(await dialog().innerText(), /宣传过度退款/);
    const unchanged = await state(); await shot('01-boom-budget'); await page.keyboard.press('Escape');
    assert.equal(await dialog().count(), 0); assert.ok(await budgetButton().evaluate(e => e === document.activeElement));
    assert.deepEqual(await state(), unchanged); const boom = await settle(); assert.ok(boom.cash > 82.7);
    check('procurement revenue/refund, keyboard open/Escape/focus return, extra rival royalties excluded');
    const risk = launched(); risk.event = 4; risk.cash = 8; risk.industry.defense = 4;
    await fixture(risk); await verify(); assert.match(await page.getByRole('region', { name: '本季收支预估', exact: true }).innerText(), /资金可能不足/);
    await budgetButton().click(); await shot('02-regulation-warning'); await exact('关闭收支预估').click();
    const bankrupt = await settle(); assert.equal(bankrupt.cash, -8.5); assert.equal(bankrupt.ending.title, '现金流断裂'); await shot('03-bankruptcy');
    check('regulation discount and refund warn before matching bankruptcy');

    await fixture(launched()); await aiAction(page, 'posttrain'); const trained = await verify(); assert.equal(trained.expected.refund, 0);
    await page.reload(); await page.waitForFunction(() => !!window.render_game_to_text); assert.equal((await verify()).expected.refund, 0);
    await budgetButton().click(); await shot('04-posttrain-recovery'); await exact('关闭收支预估').click();
    check('post-training removes refund risk and forecast survives ordinary save/refresh');
    const route = ai.decideAiEvent(ai.createAi(2026, 'product', 'router', 'relaxed'), 'defer');
    const teacher = route.rivals.find(r => r.company === route.industry.teacher); teacher.product = 50; teacher.defense = 0;
    Object.assign(route.industry, { route: true, licensedData: true, service: 'consumer', scrutiny: 2, defense: 3 });
    await fixture(route); const full = (await verify()).expected; assert.equal(full.costs.routing, 4); assert.equal(full.costs.samples, 4);
    await budgetButton().click(); await dialog().getByText('宣传过度退款', { exact: true }).scrollIntoViewIfNeeded(); await shot('05-cost-breakdown'); await exact('关闭收支预估').click(); await settle();
    check('router discount, samples, scrutiny, defense and service costs reconcile');

    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size); await fixture(risk); await budgetButton().tap(); await dialog().waitFor(); await shot(`06-dialog-${size.width}`);
      const scroll = dialog().locator('[data-budget-scroll]'), box = await scroll.boundingBox();
      const touch = await context.newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height - 20 }] });
      for (let i = 1; i <= 5; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height - 20 - (box.height - 50) * i / 5 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
      await page.waitForFunction(() => document.querySelector('[data-budget-scroll]').scrollTop > 0);
      await dialog().getByText(/按当前产品和设置/).scrollIntoViewIfNeeded();
      assert.ok(await dialog().getByText(/按当前产品和设置/).isVisible());
      await exact('关闭收支预估').tap();
      const end = await exact('结束季度 →').boundingBox(), button = await budgetButton().boundingBox();
      assert.ok(button.y >= 0 && button.y + button.height <= size.height); assert.ok(end.y >= 0 && end.y + end.height <= size.height);
      check(`touch dialog scrolling and reachable footer at ${size.width}x${size.height}`);
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.evaluate(() => sessionStorage.setItem('agi-budget-clear', '1')); await open();
    await page.locator('#start-game').waitFor();
    await chooseAiCompany(page, 'openai'); await page.locator('#agi-difficulty').selectOption('relaxed');
    await page.locator('#start-game').click(); await verify(); await budgetButton().click();
    assert.match(await dialog().innerText(), /事件尚未处理/); await shot('07-pending-event'); await exact('关闭收支预估').click();
    const trace = [], expectedEnd = aiPilot(2026, 'product', 'shared', trace, 'openai'); let quarters = 0;
    for (const entry of trace) {
      if (entry.type === 'event') {
        await page.locator(`[data-event-choice="${entry.id}"]`).click();
        if ((await state()).turn === 1) await aiPolicy(page, '开源共享');
      } else if (entry.type === 'action') await aiAction(page, entry.id);
      else { await settle(); quarters++; }
      if (!(await state()).ending) await verify();
    }
    const ending = await state(); assert.equal(ending.ending.title, expectedEnd.ending.title); assert.equal(ending.cash, expectedEnd.cash);
    await shot('08-legal-campaign-ending'); assert.ok(quarters > 5); check(`complete public AGI route with ${quarters} quarterly forecasts and settlement checks`);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ base, checks, captures, errors }, null, 2));
    console.log(JSON.stringify({ checks: checks.length, screenshots: captures.length, errors }));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, errors }, null, 2));
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
