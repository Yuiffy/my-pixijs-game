const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

// Run via AUTOCHESS_ORACLE_TERMINAL=1 node verify-autochess.cjs.
// The shared entry uses muted installed Chrome and validates page screenshots.
module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const { EngineBridge } = await loadTypescriptModule('src/components/autoChessGame/phaser/EngineBridge.ts');
  const fixture = round => {
    const bridge = new EngineBridge(9918048, 1, { simulation: true, battleStepHz: 60 });
    bridge.setConsoleLogging(false);
    bridge.engine.state.starterChoices = ['bastion'];
    bridge.engine.startRun('bastion');
    const s = bridge.engine.state;
    Object.assign(s, { round, playerLevel: 10, gold: 111, hp: 6 });
    s.board.fill(null); s.bench.fill(null);
    ['sui_flower', 'cog_scribe', 'cinder_ram', 'xuehui', 'komichi', 'lian', 'grove_mender', 'tower_god', 'spark_mage', 'chu2u'].forEach((id, i) => {
      s.board[[3, 4, 9, 10, 11, 15, 16, 17, 21, 22][i]] = { uid: 1000 + i, id, star: 3 };
    });
    ['sumi', 'mumu', 'sui_cat', 'lovely', 'rift_brawler', 'rei', 'yukisyo', 'nagisa'].forEach((id, i) => {
      s.bench[i] = { uid: 1010 + i, id, star: 3 };
    });
    return bridge.engine.getSimulationSnapshot();
  };
  const report = { frames: {}, scenarios: {}, screenshots, errors, failedResponses };
  const evidence = async name => {
    await page.waitForFunction(() => [...document.images].filter(img => {
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    }).every(img => img.complete && img.naturalWidth > 0));
    const dom = await page.evaluate(() => {
      const canvas = document.querySelector('[data-game-canvas="rift-line"]');
      return { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON(), text: document.body.innerText };
    });
    assert.ok(dom.width > 0 && dom.height > 0 && dom.rect.width > 0 && dom.rect.height > 0);
    await capture(`oracle-terminal-${name}`);
    report.frames[name] = { state: await state(), dom };
  };
  await page.locator('.rift-dom-choice').first().click();
  await page.getByRole('button', { name: '游戏设置' }).click();
  const settings = page.getByRole('dialog', { name: '游戏设置' });
  await settings.getByRole('radiogroup', { name: '托管 AI 等级' }).getByRole('radio', { name: '看穿', exact: true }).click();
  await settings.getByRole('button', { name: '关闭设置' }).click();
  for (const round of [18, 70]) {
    await page.evaluate(snapshot => {
      const bridge = window.autoChessAI.bridge;
      bridge.setConsoleLogging(false);
      bridge.engine.restoreSimulationSnapshot(snapshot);
      bridge.setBattlePaused(false);
      bridge.dispatch({ type: 'clearSelection' });
      window.__oracleTraceStart = bridge.getActionHistory(2000).length;
    }, fixture(round));
    if (round === 18) await evidence('full-three-star');
    const start = Date.now();
    await page.getByRole('button', { name: /手动指挥/ }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'battle', null, { timeout: 180000 });
    await page.locator('.rift-toolbar button.is-autoplay').click();
    await page.evaluate(() => window.autoChessAI.pause());
    const result = await page.evaluate(() => {
      const bridge = window.autoChessAI.bridge;
      return { actions: bridge.getActionHistory(2000).slice(window.__oracleTraceStart), snapshot: bridge.engine.getSimulationSnapshot() };
    });
    const types = result.actions.map(entry => entry.action.type);
    if (round === 18) {
      assert.ok(!types.some(type => ['reroll', 'sell', 'shop', 'starForge'].includes(type)));
      assert.ok(!types.includes('move'), 'already winning deployed team starts without rearranging');
      assert.equal(result.snapshot.state.gold, 111);
    } else {
      assert.ok(types.includes('sell') && types.includes('shop') && types.includes('starForge'));
      assert.ok(result.snapshot.state.board.some(unit => unit?.id === 'meme' && unit.star === 3), 'verified replacement must be deployed');
      assert.ok(types.filter(type => type === 'reroll').length <= 48);
    }
    await evidence(round === 18 ? 'winning-lineup' : 'replacement-deployed');
    await page.evaluate(() => window.autoChessAI.skipBattle());
    const settled = await state();
    if (round === 18) assert.equal(settled.result.won, true);
    report.scenarios[round] = { ...result, elapsedMs: Date.now() - start, result: settled.result };
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  writeFileSync('.tmp/autochess/oracle-terminal-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ scenarios: report.scenarios, screenshots, errors, failedResponses }, null, 2));
};
