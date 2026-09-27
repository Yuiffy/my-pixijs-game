const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.PINGLU_URL || 'http://localhost:3191/game/pinglu-canal';
const output = path.resolve('artifacts/pinglu-workflow');
fs.mkdirSync(output, { recursive: true });
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('pinglu-geography-v3')));
async function choose(page, id) {
  const details = page.getByText('坐标选择与其他操作', { exact: true });
  if (!await page.locator('#terrain-row').isVisible()) await details.click();
  await page.locator('#terrain-row').selectOption(String(Math.floor(id / 48)));
  await page.locator('#terrain-column').fill(String(id % 48 + 1));
  await page.getByRole('button', { name: '选中', exact: true }).click();
}
async function work(page) { await page.getByRole('button', { name: '开始施工 →', exact: true }).click(); }
async function run() {
  assert.equal((await fetch(url)).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.speechSynthesis.speak = () => {}; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(url); await page.waitForFunction(() => !!window.render_game_to_text);
    await page.locator('canvas').waitFor();
    const initial = await state(page);
    let source; let target;
    for (const p of initial.plots.filter(p => p.farm && !p.wet && p.height < p.fillTarget)) {
      const neighbour = initial.plots.find(n => !n.wet && !n.farm && n.height >= n.waterLevel + 7 && Math.abs(n.id % 48 - p.id % 48) + Math.abs(Math.floor(n.id / 48) - Math.floor(p.id / 48)) === 1);
      if (neighbour) { source = neighbour.id; target = p.id; break; }
    }
    assert.notEqual(source, undefined, 'A natural reachable source/field pair exists on the actual map');
    await choose(page, source);
    await work(page); await work(page);
    assert.deepEqual((await state(page)).selected, [source]);
    await page.getByRole('button', { name: /↧\s*开挖/ }).click();
    await work(page);
    assert.deepEqual((await state(page)).selected, [source], 'Repeated excavation and tool switches retain the work area');
    await page.getByRole('button', { name: '地图指定填土点', exact: true }).click();
    await choose(page, target);
    let current = await state(page);
    assert.equal(current.autoHaul.target, target);
    assert.deepEqual(current.selected, [source], 'Pinning delivery does not overwrite excavation selection');
    const beforeHaul = await saved(page);
    await page.locator('#terrain-auto-haul').check();
    await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).last?.id > id, beforeHaul.moves);
    await page.locator('#terrain-auto-haul').uncheck();
    current = await state(page);
    assert.equal(current.last.tool, 'haul');
    assert(current.last.units > 0);
    assert.deepEqual(current.selected, [source]);
    assert.equal((await saved(page)).players[0].cash, beforeHaul.players[0].cash - current.last.cost);
    assert(current.plots.some(p => p.height > initial.plots[p.id].height), 'Automatic hauling really raises terrain');
    let stopped = current.last.id;
    await page.waitForTimeout(2700);
    assert.equal((await state(page)).last.id, stopped, 'Disabling cancels pending dispatch');
    await work(page);
    stopped = (await state(page)).last.id;
    await page.locator('#terrain-auto-haul').check();
    assert((await state(page)).autoHaul.plan.action, 'Pause is tested with a real pending dispatch');
    await page.getByRole('button', { name: '玩法', exact: true }).click();
    await page.waitForTimeout(2700);
    assert.equal((await state(page)).last.id, stopped, 'Open panels suspend automatic work');
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    await page.locator('#terrain-auto-haul').uncheck();
    await choose(page, source);
    await page.locator('#terrain-auto-haul').check();
    await page.getByRole('button', { name: '撤销上次施工（单人）', exact: true }).click();
    assert.equal((await state(page)).autoHaul.enabled, false);
    assert.deepEqual((await state(page)).selected, [source]);
    await page.reload(); await page.waitForFunction(() => !!window.render_game_to_text);
    assert.equal((await state(page)).autoHaul.target, target);
    assert.equal((await state(page)).autoHaul.enabled, false, 'Reload keeps destination but pauses automation');
    await page.getByRole('button', { name: /⇢\s*运土/ }).click();
    await page.locator('#terrain-auto-haul').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'auto-haul.png'), fullPage: true });

    await page.getByRole('button', { name: '新地图', exact: true }).click();
    await page.locator('#terrain-humans').selectOption('2');
    await page.getByRole('button', { name: '重置工程，进场 →', exact: true }).click();
    await page.getByRole('button', { name: '接手施工 →', exact: true }).click();
    const mountains = (await state(page)).plots.filter(p => p.height > 45 && !p.wet).slice(0, 2).map(p => p.id);
    await page.getByRole('button', { name: /✹\s*爆破/ }).click();
    await choose(page, mountains[0]);
    for (let i = 0; i < 3; i++) {
      assert.equal((await state(page)).active, 0);
      await work(page);
      if (i < 2) assert.equal(await page.getByRole('dialog').count(), 0, 'No handoff after the first two crews');
    }
    assert.equal((await state(page)).active, 1);
    await page.getByRole('button', { name: '接手施工 →', exact: true }).click();
    await choose(page, mountains[1]);
    for (let i = 0; i < 6; i++) await work(page);
    assert.equal((await state(page)).active, 0);
    await page.getByRole('button', { name: '接手施工 →', exact: true }).click();
    assert.deepEqual((await state(page)).selected, [mountains[0]], 'Each contractor resumes their own selection');
    await page.getByRole('button', { name: '全图', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'grouped-turns.png'), fullPage: true });
    assert.deepEqual(errors, []);
    const report = { checks: ['repeated work', 'tool switching', 'pinned destination', 'paid scheduled haul', 'real terrain changes', 'pause', 'modal pause', 'undo', 'reload', 'three consecutive actions', 'per-contractor selections'], source, target, errors };
    fs.writeFileSync(path.join(output, 'ui-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
