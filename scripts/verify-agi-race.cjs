const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { aiAction } = require('./tests/helpers/agi-ui.cjs');
const base = process.env.MINI_BASE_URL || 'http://127.0.0.1:3895';
const output = process.env.AGI_QA_DIR || 'tmp/agi-race-verify';
const report = { screenshots: [], errors: [], outcomes: [] };
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function shot(p, name) {
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const file = path.join(output, `${name}.png`);
  report.screenshots.push({ file, pixels: inspectPng(await p.screenshot({ path: file, animations: 'disabled' })), state: await read(p) });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
  const { getAiRaceReport } = await loadTypescriptModule('src/components/miniGames/agiRace.ts');
  const { AI_COMPANIES } = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const savedPage = async save => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(s => localStorage.setItem('mini-agi-v1', JSON.stringify(s)), save);
    const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(`${base}/game/agi`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text);
    return { ctx, page };
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }); const p = await context.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    await p.goto(`${base}/game/agi`, { waitUntil: 'networkidle' }); await p.waitForFunction(() => !!window.render_game_to_text);
    assert.match(await p.locator('main').innerText(), /V3\.2/);
    await p.locator('#world-seed').fill('1'); await p.locator('#start-game').click();
    const community = p.locator('[aria-label="公司资源"] [data-metric="社区"] strong');
    const reputation = p.locator('[aria-label="公司资源"] [data-metric="信誉"] strong');
    assert.equal(Number(await community.innerText()), (await read(p)).community);
    await p.locator('[data-event-choice="defer"]').click(); const before = await read(p); await aiAction(p, 'market');
    assert.equal(Number(await community.innerText()), before.community + 18);
    assert.equal(Number(await reputation.innerText()), before.reputation + 6);
    await shot(p, 'resources-desktop');
    await p.getByRole('button', { name: '排行榜 ↗', exact: true }).click();
    assert.equal(await p.locator('dialog[open] tbody tr').count(), 11);
    assert.equal(await p.locator('dialog[open] tr[data-player="true"]').count(), 1);
    await shot(p, 'ranking-desktop'); await p.keyboard.press('Escape');
    assert.equal(await p.locator('dialog[open]').count(), 0);
    assert.equal(await p.getByRole('button', { name: '排行榜 ↗', exact: true }).evaluate(el => el === document.activeElement), true);
    await p.setViewportSize({ width: 390, height: 844 });
    await shot(p, 'resources-mobile');
    await p.getByRole('button', { name: '排行榜 ↗', exact: true }).click(); await shot(p, 'ranking-mobile');
    await p.getByRole('button', { name: '关闭排行榜' }).click();
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const resources = await p.locator('[aria-label="公司资源"]').boundingBox();
    assert.ok(Math.abs(resources.y) < 2); assert.ok(resources.height < 260);
    assert.ok(await community.isVisible()); assert.ok(await reputation.isVisible());
    const end = async () => { if (!(await read(p)).industry.eventResolved) await p.locator('[data-event-choice="defer"]').click(); if ((await read(p)).funding < 3 && (await read(p)).actions > 0) await aiAction(p, 'fund'); await p.getByRole('button', { name: '结束季度 →', exact: true }).click(); };
    let warning = false;
    for (let n = 0; n < 15 && !(await read(p)).ending; n++) {
      await end(); const state = await read(p); const race = getAiRaceReport(state);
      if (!state.ending) {
        const brief = p.locator('[aria-label="本季竞争速报"]'); assert.ok((await brief.innerText()).includes(`Q${state.turn} 竞速报告`));
        if (!warning && race.threat?.stage === 'near') { assert.match(await brief.innerText(), /接近 AGI/); await shot(p, 'last-quarter-warning'); warning = true; }
      }
    }
    const lost = await read(p); assert.ok(lost.ending?.rivalOutcome); assert.ok(warning, 'A normal rival victory is preceded by a visible near-AGI report');
    assert.ok(await p.locator('[aria-label="对手选择的世界结局"]').isVisible()); await shot(p, 'rival-ending-mobile');
    const actual = lost.ending; await p.reload({ waitUntil: 'networkidle' }); assert.deepEqual((await read(p)).ending, actual);
    report.outcomes.push({ company: actual.rivalOutcome.winnerId, title: actual.title, source: 'legal-quarter-play' });
    const legacy = structuredClone(lost); const winner = legacy.rivals.find(r => r.company === actual.rivalOutcome.winnerId);
    legacy.ending = { title: `${winner.name}率先抵达`, text: '旧版本结算', won: false };
    const restored = await savedPage(legacy);
    assert.deepEqual((await read(restored.page)).ending, actual); assert.equal((await read(restored.page)).cash, legacy.cash);
    await restored.ctx.close();
    // Controlled late-game saves cover every company route in the actual ending UI.
    for (const company of AI_COMPANIES) {
      const start = ai.decideAiEvent(ai.createAi(42, 'product', company.id === 'openai' ? 'deepseek' : 'openai', 'standard'), 'defer');
      start.turn = 8; start.cash = 250;
      const rival = start.rivals.find(r => r.company === company.id);
      Object.assign(rival, { capability: 100, compute: 5, reliability: 88, safety: 78, video: 60, ecosystem: 60, defense: 2, reputation: 45, product: 90, cash: 100 });
      const ended = ai.endAiTurn(start); assert.equal(ended.ending.rivalOutcome.winnerId, company.id);
      const fixture = await savedPage(ended); const ep = fixture.page;
      assert.equal(await ep.locator('[data-rival-ending]').getAttribute('data-rival-ending'), ended.ending.rivalOutcome.endingId);
      assert.match(await ep.locator('[data-rival-ending]').innerText(), new RegExp(company.name));
      assert.equal(await ep.locator('[data-rival-ending] li').count(), 2);
      assert.equal(/DeepSeek|Anthropic|OpenAI|Grok|MiniMax|Google|Qwen|Kimi|Meta|Llama|GLM/.test(await ep.locator('main').innerText()), false);
      report.outcomes.push({ company: company.id, title: ended.ending.title, source: 'late-game-save' });
      if (company.id === 'anthropic') { await ep.setViewportSize({ width: 1440, height: 960 }); await shot(ep, 'guarded-ending-desktop'); }
      if (company.id === 'minimax') await shot(ep, 'cinema-ending-mobile');
      await fixture.ctx.close();
    }
    assert.deepEqual(report.errors, []); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outcomes: report.outcomes, screenshots: report.screenshots.map(s => s.file), errors: report.errors }));
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
