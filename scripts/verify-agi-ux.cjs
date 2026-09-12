const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { aiAction, aiPolicy, aiTab, chooseAiCompany, resolveAiEvent } = require('./tests/helpers/agi-ui.cjs');
const base = process.env.MINI_BASE_URL || 'http://127.0.0.1:3845';
const output = process.env.AGI_QA_DIR || 'tmp/agi-ux-verify';
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const realNames = /DeepSeek|Anthropic|Claude|OpenAI|ChatGPT|Codex|Grok|MiniMax|Gemini|Gemma|Google|Qwen|Kimi|Meta|Llama|GLM|智谱|千问|海螺|月之暗面/i;
const report = { screenshots: [], errors: [], distillation: null, migration: null };
async function screen(p, name, fullPage = false) {
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const file = path.join(output, `${name}.png`);
  report.screenshots.push({ file, pixels: inspectPng(await p.screenshot({ path: file, fullPage, animations: 'disabled' })) });
}
async function noRealNames(p) { assert.equal(realNames.test(await p.locator('main').innerText()), false, 'Real names should only appear when inspiration sources are expanded'); }
async function pinned(p) {
  const resource = await p.locator('[aria-label="公司资源"]').boundingBox();
  assert.ok(Math.abs(resource.y) < 2, JSON.stringify(resource));
  const end = await p.getByRole('button', { name: '结束季度 →', exact: true }).boundingBox();
  assert.ok(end.y >= resource.y + resource.height && end.y + end.height <= p.viewportSize().height, JSON.stringify(end));
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const { createAi, aiDistillGain, aiDistillTarget } = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }); const p = await context.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    await p.goto(`${base}/game/agi`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => !!window.render_game_to_text);
    assert.equal(await p.locator('[data-company]:visible').count(), 4);
    assert.equal((await read(p)).industry.company, 'openai');
    await noRealNames(p); await screen(p, 'four-companies-desktop', true);
    await p.getByText('更多厂商（7）', { exact: true }).click(); assert.equal(await p.locator('[data-company]:visible').count(), 11);
    await chooseAiCompany(p, 'anthropic');
    await p.getByText('更多厂商（7）', { exact: true }).click(); assert.equal(await p.locator('[data-company]:visible').count(), 4);
    assert.ok((await p.locator('main').innerText()).includes('灯塔实验室')); await noRealNames(p);
    const source = p.locator('summary').filter({ hasText: '灵感来源与改编说明' }).first();
    await source.click(); assert.ok((await p.locator('main').innerText()).includes('Anthropic'));
    assert.ok(await p.locator('a[href="https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks"]').isVisible());
    await source.click(); await noRealNames(p);
    await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => scrollTo(0, 430)); await screen(p, 'four-companies-mobile');
    await chooseAiCompany(p, 'openai'); await p.locator('#start-game').click();
    assert.equal(await p.locator('[data-action="train"]').count(), 0, 'Events and ordinary actions should not compete on screen');
    assert.equal(await p.locator('aside [data-event-choice]').count(), 3);
    await p.evaluate(() => scrollTo(0, 420)); await pinned(p); await screen(p, 'event-mobile');
    await p.locator('[data-event-choice="defer"]').click();
    assert.equal(await p.locator('[data-event-choice]').count(), 0);
    assert.ok(await p.locator('[data-action="train"]').isVisible());
    await aiTab(p, 'business'); assert.ok(await p.locator('[data-action="market"]').isVisible()); assert.equal(await p.locator('[data-action="train"]').count(), 0);
    await aiTab(p, 'ecosystem'); assert.ok(await p.locator('[data-action="video"]').isVisible());
    await aiTab(p, 'research'); await p.evaluate(() => scrollTo(0, 720)); await pinned(p); await screen(p, 'research-scrolled-mobile');
    for (let n = 0; n < 4; n++) { await resolveAiEvent(p); await p.getByRole('button', { name: '结束季度 →', exact: true }).click(); }
    await resolveAiEvent(p); await aiTab(p, 'research');
    await p.locator('summary').filter({ hasText: '向同行蒸馏模型' }).click();
    await p.locator('#agi-distill-target').selectOption('qwen');
    const before = await read(p); const gain = aiDistillGain(before); const teacher = aiDistillTarget(before);
    assert.ok(gain > 0); assert.equal(await p.locator('#agi-distill-target').inputValue(), 'qwen');
    await p.locator('[data-action="distill"]').click(); const after = await read(p);
    assert.equal(after.capability, Math.round((before.capability + gain) * 10) / 10);
    assert.ok(after.capability <= teacher.product); assert.equal(after.actions, before.actions - 1);
    report.distillation = { before: before.capability, teacher: teacher.product, gain, after: after.capability };
    await noRealNames(p); await screen(p, 'distillation-mobile');
    await p.reload({ waitUntil: 'networkidle' }); assert.equal((await read(p)).industry.distillTeacher, 'qwen');
    await p.setViewportSize({ width: 1440, height: 960 }); await p.evaluate(() => scrollTo(0, 400)); await pinned(p); await screen(p, 'actions-scrolled-desktop');
    await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(150); await pinned(p);
    await aiTab(p, 'business');
    await p.getByRole('button', { name: '结束季度 →', exact: true }).click();
    await p.locator('[data-event-choice="defer"]').click();
    await pinned(p); await screen(p, 'landscape-actions');
    const old = createAi(); delete old.industry.distillTeacher; old.cash = 89; old.capability = 61;
    old.rivals.find(r => r.company === 'anthropic').name = '宪章智能'; old.rivals.find(r => r.company === 'anthropic').focus = 'Anthropic / Claude';
    old.rivals.find(r => r.company === 'minimax').name = '海螺映像';
    old.logs = [{ turn: 1, text: '行业事件「海螺把视频权重端上来了」完成。' }];
    old.ending = { title: '海螺映像率先抵达', text: '千问工坊发布新模型。', won: false };
    const legacy = await browser.newContext(); await legacy.addInitScript(s => localStorage.setItem('mini-agi-v1', s), JSON.stringify(old));
    const oldPage = await legacy.newPage(); await oldPage.goto(`${base}/game/agi`, { waitUntil: 'networkidle' });
    const migrated = await read(oldPage); assert.equal(migrated.cash, 89); assert.equal(migrated.capability, 61);
    assert.equal(migrated.ending.title, '流光影业率先抵达'); assert.equal(migrated.ending.text, '积木工坊发布新模型。');
    await noRealNames(oldPage); report.migration = { cash: migrated.cash, capability: migrated.capability, title: migrated.ending.title };
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
