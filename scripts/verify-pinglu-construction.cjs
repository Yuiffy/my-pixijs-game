const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.codex', 'skills', 'develop-web-game', 'node_modules', 'playwright'))); }

const url = process.env.PINGLU_URL || 'http://localhost:3191/game/pinglu-canal';
const output = path.join(process.cwd(), '.tmp', 'pinglu-construction');
const saveKey = 'pinglu-shared-construction-v1';
fs.mkdirSync(output, { recursive: true });
const readState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const readSession = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);

async function addAction(page, action, E) {
  const before = await readState(page);
  if (['build', 'haul', 'inspect'].includes(action.type)) {
    await page.getByRole('button', { name: '工地施工', exact: true }).click();
    await page.locator('#project-select').selectOption(action.project);
    await page.getByRole('button', { name: action.type === 'build' ? '普通施工' : action.type === 'haul' ? '运土回填' : '试水验收', exact: true }).click();
    if (action.type === 'haul') await page.locator('#soil-source').selectOption(action.source);
  } else {
    await page.getByRole('button', { name: '公司与调度', exact: true }).click();
    if (action.type === 'equipment') await page.locator(`[data-equipment="${action.equipment}"]`).click();
    if (action.type === 'camp') await page.getByRole('button', { name: new RegExp(`${E.REGIONS[action.region].name}营地`) }).click();
    if (action.type === 'fund') await page.getByRole('button', { name: /^后勤维护/ }).click();
    if (action.type === 'water') await page.getByRole('button', { name: /^补充试验水/ }).click();
  }
  const button = page.getByTestId('add-action');
  assert.equal(await button.isEnabled(), true, `${JSON.stringify(action)} disabled: ${await button.textContent()}`);
  await button.click();
  const after = await readState(page);
  assert.equal(after.draft.length, before.draft.length + 1);
}

async function submit(page) {
  await page.getByRole('button', { name: '封存计划，一起开工 →', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase !== 'planning');
}

async function newGame(page, humans, ais) {
  await page.getByRole('button', { name: '新对局', exact: true }).click();
  await page.locator('#human-count').selectOption(String(humans));
  await page.locator('#ai-count').selectOption(String(ais));
  await page.getByRole('button', { name: '展开新沙盘 →', exact: true }).click();
}

async function finish(page, E, label) {
  let decisions = 0;
  let rounds = 0;
  while (decisions < 130) {
    const state = await readState(page);
    if (state.phase === 'finished') {
      return { label, decisions, round: state.round, connected: state.connected, quality: state.quality, scores: state.companies.map(c => ({ name: c.name, score: c.score.total })) };
    }
    if (state.phase === 'handoff') {
      await page.getByRole('button', { name: /查看工地/ }).click();
      continue;
    }
    if (state.phase === 'review') {
      await page.getByRole('button', { name: /进入第 .* 轮/ }).first().click();
      rounds += 1;
      continue;
    }
    const session = await readSession(page);
    const active = E.activeCompany(session.game);
    const plan = E.chooseAiPlan(session.game, active);
    for (const action of plan) { await addAction(page, action, E); decisions += 1; }
    await submit(page);
    if (rounds > 10) throw Error('Round loop did not stop');
  }
  throw Error(`${label} failed to finish`);
}

(async () => {
  const response = await fetch(url);
  assert.equal(response.status, 200, 'dev server must respond before Chrome starts');
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const E = await loadTypescriptModule('src/components/pingluCanal/construction.ts');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('canvas[data-game-canvas="pinglu-construction"]').waitFor();
    await page.screenshot({ path: path.join(output, 'start-desktop.png'), fullPage: true });
    assert.equal((await readState(page)).projects.filter(p => p.main).length, 8);
    await addAction(page, { type: 'build', project: 'B' }, E);
    assert.equal((await readState(page)).preview.company.soil.B, 2);
    await page.getByRole('button', { name: '撤回第 1 步及后续行动', exact: true }).click();
    assert.equal((await readState(page)).draft.length, 0);
    assert.equal((await readState(page)).preview.company.cash, 22);
    await addAction(page, { type: 'build', project: 'B' }, E);
    await addAction(page, { type: 'haul', project: 'E', source: 'B' }, E);
    await addAction(page, { type: 'fund' }, E);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await readState(page)).draft.length, 3, 'draft restored after reload');
    await page.getByTestId('canal-diorama').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'planned-earthwork.png') });
    await submit(page);
    const results = [await finish(page, E, 'human-vs-two-ai')];
    assert.ok(results[0].connected);
    await page.screenshot({ path: path.join(output, 'finished-desktop.png'), fullPage: true });
    await page.getByTestId('canal-diorama').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'completed-diorama.png') });

    const canvas = page.locator('canvas[data-game-canvas="pinglu-construction"]');
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.7);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.65, { steps: 10 }); await page.mouse.up();
    await page.getByRole('button', { name: '复位视角 ↺', exact: true }).click();

    await newGame(page, 1, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'mobile-map.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('aside[aria-label="工程队行动计划"]').scrollIntoViewIfNeeded();
    await addAction(page, { type: 'build', project: 'B' }, E);
    await page.screenshot({ path: path.join(output, 'mobile-planner.png') });
    await page.getByRole('button', { name: '撤回第 1 步及后续行动', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    results.push(await finish(page, E, 'solo'));
    assert.ok(results[1].connected && results[1].scores[0].score >= E.SOLO_TARGET);

    await newGame(page, 4, 0);
    results.push(await finish(page, E, 'four-human-hotseat'));
    assert.ok(results[2].connected);
    assert.deepEqual(errors, []);
    const evidence = { results, errors, canvas: bounds, mobileOverflow: false, exercised: ['cut-and-haul', 'undo', 'reload-draft', 'camera-orbit-reset', 'mobile-input', 'hidden-handoff', 'all-game-modes'] };
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
