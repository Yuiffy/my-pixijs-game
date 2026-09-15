const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { aiAction, aiPolicy, aiTab, chooseAiCompany } = require('./tests/helpers/agi-ui.cjs');
const base = process.env.MINI_BASE_URL || 'http://127.0.0.1:3895';
const output = process.env.AGI_QA_DIR || 'tmp/agi-competition-verify';
const report = { screenshots: [], scenarios: [], errors: [] };
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const end = async p => { if (!(await read(p)).industry.eventResolved) await p.locator('[data-event-choice="defer"]').click(); await p.getByRole('button', { name: '结束季度 →', exact: true }).click(); };
async function shot(p, name, fullPage = false) {
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const file = path.join(output, `${name}.png`);
  report.screenshots.push({ file, pixels: inspectPng(await p.screenshot({ path: file, fullPage, animations: 'disabled' })), state: await read(p) });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
  const { aiCompetitivePilot } = await import('./tests/helpers/mini-games-pilots.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const create = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }); const p = await context.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    await p.goto(`${base}/game/agi`, { waitUntil: 'networkidle' }); await p.waitForFunction(() => !!window.render_game_to_text);
    return { context, p };
  };
  try {
    const { context, p } = await create();
    assert.equal(await p.getByRole('navigation', { name: '选择游戏' }).count(), 0);
    assert.equal(await p.locator('header a[href="/demos"]').count(), 1);
    assert.equal((await read(p)).difficulty, 'standard'); assert.equal((await read(p)).version, 3);
    const budgets = [];
    for (const difficulty of ['relaxed', 'standard', 'hard']) {
      await p.locator('#agi-difficulty').selectOption(difficulty); const s = await read(p);
      assert.equal(s.difficulty, difficulty); budgets.push(s.rivals[0].cash);
    }
    assert.deepEqual(budgets, [100, 135, 155]);
    await p.locator('#agi-difficulty').selectOption('standard'); await chooseAiCompany(p, 'deepseek');
    assert.equal((await read(p)).difficulty, 'standard');
    await p.locator('#world-seed').fill('1'); await shot(p, 'difficulty-desktop', true);
    await p.setViewportSize({ width: 390, height: 844 }); await p.locator('#agi-difficulty').scrollIntoViewIfNeeded(); await shot(p, 'difficulty-mobile');
    await p.setViewportSize({ width: 1440, height: 960 }); await p.locator('#start-game').click();
    for (let q = 1; q <= 3; q++) {
      await p.locator('[data-event-choice="defer"]').click();
      for (const id of q === 1 ? ['train', 'compute', 'fund'] : q === 2 ? ['train', 'release', 'fund'] : ['train', 'release']) await aiAction(p, id);
      await end(p);
    }
    const attacked = await read(p);
    const distillation = attacked.competition.feed.find(e => e.kind === 'distill' && e.target === 'deepseek');
    const challenge = attacked.competition.feed.find(e => e.response === 'pending' && e.target === 'deepseek');
    assert.ok(distillation?.amount > 0); assert.ok(challenge); assert.equal(attacked.turn, 4);
    const brief = p.locator('[aria-label="本季竞争速报"]');
    assert.ok(await brief.isVisible()); assert.match(await brief.innerText(), /上季交锋/);
    assert.ok(await brief.getByText(/条质疑待回应/).isVisible());
    await p.setViewportSize({ width: 390, height: 844 }); await shot(p, 'quarter-brief-mobile');
    await p.setViewportSize({ width: 1440, height: 960 }); await shot(p, 'quarter-brief-desktop');
    await p.locator('[data-event-choice="defer"]').click(); await p.getByRole('button', { name: /回应.*条质疑/ }).click();
    await shot(p, 'incoming-challenge');
    const beforeReply = await read(p); const expected = ai.respondAiChallenge(beforeReply, challenge.id, 'fix');
    await p.locator(`[data-challenge="${challenge.id}"] [data-challenge-response="fix"]`).click();
    const replied = await read(p); assert.equal(replied.cash, expected.cash); assert.equal(replied.actions, beforeReply.actions - 1);
    assert.equal(replied.industry.reliability, expected.industry.reliability); assert.equal(replied.competition.feed.find(e => e.id === challenge.id).response, 'fix');
    await aiAction(p, 'protect'); assert.equal((await read(p)).industry.defense, 2);
    const available = (await read(p)).rivals.find(r => r.product > 0 && (r.reliability < 65 || r.safety < 40)); assert.ok(available);
    await p.locator('summary').filter({ hasText: '向同行发文质疑' }).click(); await p.locator('#agi-competition-target').selectOption(available.company);
    const beforeCritique = await read(p); assert.equal(ai.aiCriticismPreview(beforeCritique).supported, true);
    await p.locator('[data-action="criticize"]').click();
    const critical = await read(p); const target = critical.rivals.find(r => r.company === available.company);
    assert.equal(target.reputation, Math.max(0, available.reputation - 12)); assert.ok(target.cash < available.cash);
    assert.equal(critical.actions, beforeCritique.actions - 1);
    await shot(p, 'criticism-and-defense');
    await p.reload({ waitUntil: 'networkidle' }); const restored = await read(p);
    assert.equal(restored.difficulty, 'standard'); assert.deepEqual(restored.competition, critical.competition);
    await p.setViewportSize({ width: 390, height: 844 }); await aiTab(p, 'business'); await shot(p, 'competition-mobile');
    const resource = await p.locator('[aria-label="公司资源"]').boundingBox(); assert.ok(Math.abs(resource.y) < 2);
    report.scenarios.push({ kind: 'interaction', difficulty: attacked.difficulty, opponentDistillation: distillation.text, opponentCriticism: challenge.text, response: 'fix', target: available.name, defense: critical.industry.defense });
    await context.close();

    for (const difficulty of ['relaxed', 'standard', 'hard']) {
      let seed = 1; let expectedEnd; let trace;
      for (; seed <= 25; seed++) { trace = []; expectedEnd = aiCompetitivePilot(seed, 'openai', difficulty, trace); if (expectedEnd.ending?.won) break; }
      assert.ok(expectedEnd.ending?.won, `No legal ${difficulty} route`);
      const { context: winContext, p: win } = await create();
      await win.locator('#agi-difficulty').selectOption(difficulty); await win.locator('#world-seed').fill(String(seed)); await win.locator('#start-game').click();
      for (const step of trace) {
        if (step.type === 'event') await win.locator(`[data-event-choice="${step.id}"]`).click();
        else if (step.type === 'policy') { if ((await read(win)).actions === 3) await aiPolicy(win, '研究优先'); await aiPolicy(win, '闭源商业'); }
        else if (step.type === 'target') { await aiTab(win, 'research'); if (!await win.locator('#agi-distill-target').isVisible()) await win.locator('summary').filter({ hasText: '向同行蒸馏模型' }).click(); await win.locator('#agi-distill-target').selectOption(step.id); }
        else if (step.type === 'response') { await aiTab(win, 'business'); await win.locator(`[data-challenge="${step.id}"] [data-challenge-response="${step.response}"]`).click(); }
        else if (step.type === 'action') await aiAction(win, step.id);
        else if (step.type === 'end') await end(win);
      }
      const final = await read(win); assert.deepEqual(final.ending, expectedEnd.ending); assert.equal(final.difficulty, difficulty); assert.equal(final.cash, expectedEnd.cash);
      report.scenarios.push({ kind: 'win', difficulty, seed, turn: final.turn, title: final.ending.title });
      if (difficulty === 'hard') await shot(win, 'hard-ending');
      await win.reload({ waitUntil: 'networkidle' }); assert.deepEqual((await read(win)).ending, final.ending);
      await winContext.close();
    }
    const legacy = ai.createAi(42, 'efficient', 'deepseek', 'relaxed'); legacy.version = 2; delete legacy.difficulty; delete legacy.competition;
    legacy.cash = 83; legacy.capability = 51; legacy.turn = 5;
    legacy.rivals = legacy.rivals.map(r => { const { cash, compute, efficiency, funding, reputation, lastIncome, lastCosts, lastActions, lastChallengeTurn, ...old } = r; return old; });
    const oldContext = await browser.newContext(); await oldContext.addInitScript(save => localStorage.setItem('mini-agi-v1', save), JSON.stringify(legacy));
    const old = await oldContext.newPage(); await old.goto(`${base}/game/agi`, { waitUntil: 'networkidle' });
    const migrated = await read(old); assert.equal(migrated.version, 3); assert.equal(migrated.difficulty, 'relaxed'); assert.equal(migrated.cash, 83); assert.equal(migrated.capability, 51); assert.equal(migrated.turn, 5);
    await oldContext.close();
    for (const kind of ['fab', 'snack']) { const c = await browser.newContext(); const other = await c.newPage(); await other.goto(`${base}/game/${kind}`, { waitUntil: 'networkidle' }); assert.equal(await other.getByRole('navigation', { name: '选择游戏' }).count(), 0); assert.ok(await other.locator('header a[href="/demos"]').isVisible()); await c.close(); }
    assert.deepEqual(report.errors, []); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ scenarios: report.scenarios, screenshots: report.screenshots.map(s => s.file), errors: report.errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
