const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.MINI_BASE_URL || 'http://127.0.0.1:3845';
const output = process.env.AGI_QA_DIR || 'tmp/agi-industry-verify';
const report = { scenarios: [], screenshots: [], errors: [] };
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const exact = (page, name) => page.getByRole('button', { name, exact: true });
const action = (page, id) => page.locator(`[data-action="${id}"]`).click();
async function event(page) {
  if (!(await state(page)).industry.eventResolved) await page.locator('[data-event-choice]:not(:disabled)').first().click();
}
async function next(page) { await event(page); await exact(page, '结束季度 →').click(); }
async function capture(page, name) {
  await page.evaluate(() => { window.scrollTo(0, 0); return document.fonts.ready; });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const bad = await page.locator('main button, main select').evaluateAll(elements => elements.filter(el => {
    const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 3);
  }).map(el => el.textContent));
  assert.deepEqual(bad, []);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.screenshots.push({ file, pixels, state: await state(page), canvas: await page.locator('canvas').evaluate(c => ({ width: c.width, height: c.height })) });
}
(async () => {
  mkdirSync(output, { recursive: true });
  assert.equal((await fetch(`${base}/game/agi`)).status, 200);
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
  const content = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
  const { aiPilot } = await import('./tests/helpers/mini-games-pilots.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const create = async (company, viewport = { width: 1440, height: 960 }) => {
    const context = await browser.newContext({ viewport }); const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(`${base}/game/agi`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text);
    await page.locator(`[data-company="${company}"]`).click();
    return { context, page };
  };
  try {
    for (const company of content.AI_COMPANIES) {
      const { context, page } = await create(company.id);
      if (company.id === 'deepseek') { await capture(page, 'company-picker-desktop'); await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'company-picker-mobile'); await page.setViewportSize({ width: 1440, height: 960 }); }
      assert.ok((await page.locator('main').innerText()).includes(company.trait));
      await page.locator('#start-game').click();
      assert.equal((await state(page)).industry.company, company.id);
      assert.equal(await exact(page, '结束季度 →').isEnabled(), false);
      await event(page); assert.equal(await exact(page, '结束季度 →').isEnabled(), true);
      const before = await state(page); const expected = ai.actAi(before, 'special');
      await action(page, 'special'); const after = await state(page);
      assert.deepEqual(after.industry, expected.industry); assert.equal(after.cash, expected.cash);
      await page.reload({ waitUntil: 'networkidle' }); assert.deepEqual((await state(page)).industry, after.industry);
      if (company.id === 'deepseek') {
        await next(page);
        await exact(page, '研究优先').click(); const research = await state(page);
        await exact(page, 'To C 扩张').click(); assert.ok(ai.aiTrainGain(research) > ai.aiTrainGain(await state(page)));
        await capture(page, 'deepseek-consumer-conflict');
      }
      if (company.id === 'minimax') {
        await action(page, 'video'); await action(page, 'openvideo');
        assert.equal((await state(page)).industry.videoOpen, true); await capture(page, 'minimax-open-video');
      }
      if (company.id === 'anthropic') {
        await page.getByText(/观察同行动态/).click();
        await capture(page, 'anthropic-access-defense');
      }
      report.scenarios.push({ company: company.id, specialty: company.specialty, passed: true });
      await context.close();
    }
    for (const route of ['shared', 'commerce', 'safe', 'doom']) {
      const company = route === 'commerce' ? 'openai' : 'deepseek';
      const { context, page } = await create(company);
      await page.locator('#start-game').click(); await exact(page, route === 'shared' ? '开源共享' : '闭源商业').click();
      const trace = []; const expected = aiPilot(2026, content.aiCompany(company).style, route, trace, company);
      for (const step of trace) {
        if (step.type === 'event') await page.locator(`[data-event-choice="${step.id}"]`).click();
        else if (step.type === 'end') await exact(page, '结束季度 →').click();
        else await action(page, step.id);
      }
      assert.deepEqual((await state(page)).ending, expected.ending); assert.equal((await state(page)).industry.reliability, expected.industry.reliability);
      await page.reload({ waitUntil: 'networkidle' }); assert.deepEqual((await state(page)).ending, expected.ending);
      if (route === 'shared') { await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'reliable-agi-ending-mobile'); }
      report.scenarios.push({ route, title: expected.ending.title, turn: expected.turn }); await context.close();
    }
    const { context, page } = await create('router');
    await page.locator('#start-game').click();
    await page.locator('summary').filter({ hasText: '模型合作与路由' }).click();
    assert.equal(await exact(page, '启用合作调用').isEnabled(), false);
    await next(page); await next(page); await next(page);
    await event(page); const before = await state(page);
    await exact(page, '启用合作调用').click(); await page.locator('#agi-sample-license').check();
    await next(page); const collected = await state(page);
    assert.equal(collected.industry.samples - before.industry.samples, 8); assert.equal(collected.capability, before.capability);
    await action(page, 'learn'); assert.equal((await state(page)).capability, before.capability + 6);
    assert.equal((await state(page)).industry.samples, collected.industry.samples - 8);
    await page.locator('#agi-teacher').selectOption('anthropic');
    assert.equal(await page.locator('#agi-sample-license').isEnabled(), false);
    await capture(page, 'router-licensed-learning');
    await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'router-mobile');
    await context.close();
    const legacy = ai.createAi(); legacy.version = 1; delete legacy.industry; legacy.cash = 77; legacy.turn = 3;
    legacy.rivals = legacy.rivals.slice(0, 3).map(({ name, capability, safety, product, focus }) => ({ name, capability, safety, product, focus }));
    const legacyContext = await browser.newContext();
    await legacyContext.addInitScript(save => localStorage.setItem('mini-agi-v1', save), JSON.stringify(legacy));
    const legacyPage = await legacyContext.newPage(); await legacyPage.goto(`${base}/game/agi`, { waitUntil: 'networkidle' });
    assert.equal((await state(legacyPage)).cash, 77); assert.equal((await state(legacyPage)).version, 2);
    await legacyContext.close();
    assert.deepEqual(report.errors, []);
    writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ scenarios: report.scenarios, screenshots: report.screenshots.map(s => s.file), errors: report.errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
