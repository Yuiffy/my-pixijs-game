const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

// Exercise the shipped Worker with the real browser bridge, using a controlled
// clock so the smoke test does not require sixteen rounds of wall-clock delays.
module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const { EngineBridge } = await loadTypescriptModule('src/components/autoChessGame/phaser/EngineBridge.ts');
  const fixture = new EngineBridge(86200, 1, { simulation: true, battleStepHz: 60 });
  fixture.setConsoleLogging(false);
  await page.waitForFunction(() => Boolean(window.autoChessAI));
  // Observe the URL actually constructed by the app; do not hard-code a bundle.
  await page.evaluate(() => {
    window.__auditNativeWorker = window.Worker;
    window.Worker = class extends window.__auditNativeWorker {
      constructor(url, options) {
        super(url, options);
        window.__auditWorkerUrl = String(url);
      }
    };
  });
  await page.getByText('AI 观战', { exact: true }).click();
  await page.getByRole('button', { name: '由 AI 自选协议并开局' }).click();
  await page.waitForFunction(() => Boolean(window.__auditWorkerUrl));
  await page.locator('.rift-toolbar button.is-autoplay').click();
  await page.evaluate(() => { window.Worker = window.__auditNativeWorker; });
  const result = await page.evaluate(async snapshot => {
    const bridge = window.autoChessAI.bridge;
    bridge.setConsoleLogging(false);
    bridge.engine.restoreSimulationSnapshot(snapshot);
    bridge.setAutopilotStrategy('balanced', 'normal', 'balanced', 'deep');
    const worker = new Worker(window.__auditWorkerUrl);
    let now = 1000;
    const rounds = [];
    const actions = [];
    const decide = request => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker decision timed out')), 120000);
      worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
      worker.onmessage = event => {
        clearTimeout(timer);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      worker.postMessage(request);
    });
    try {
      for (let tick = 0; tick < 3000; tick += 1) {
        const s = bridge.engine.state;
        const reply = await decide({ type: 'decide', id: tick + 1, now: now += 2400,
          enabled: true, startFromTitle: s.phase === 'title',
          configuration: { style: 'balanced', level: 'deep' },
          snapshot: bridge.engine.getSimulationSnapshot() });
        if (reply.action) {
          actions.push({ round: s.round, gold: s.gold, action: reply.action });
          bridge.dispatch(reply.action);
        }
        if (s.phase === 'battle') {
          bridge.setBattlePaused(true);
          if (s.round === 16) return { rounds, actions,
            snapshot: bridge.engine.getSimulationSnapshot(), workerUrl: window.__auditWorkerUrl };
          bridge.skipBattle();
          rounds.push({ round: s.round, won: s.result.won });
        }
        if (s.phase === 'gameover') throw new Error('Regression fixture ended before round 16');
      }
      throw new Error('Worker did not reach the target battle');
    } finally { worker.terminate(); }
  }, fixture.engine.getSimulationSnapshot());
  assert.equal(result.rounds.length, 15);
  assert.ok(result.actions.filter(a => a.round === 16).length > 0);
  await page.evaluate(() => window.advanceTime(0));
  await capture('ai-worker-boss-deployed');
  const deployed = await state();
  assert.equal(deployed.round, 16);
  assert.equal(deployed.phase, 'battle');
  await page.evaluate(() => window.autoChessAI.skipBattle());
  const settled = await state();
  assert.equal(settled.phase, 'result');
  assert.equal(typeof settled.result.won, 'boolean');
  await capture('ai-worker-boss-result');
  const canvas = await page.locator('[data-game-canvas="rift-line"]').evaluate(element => ({
    width: element.width, height: element.height, rect: element.getBoundingClientRect().toJSON(),
  }));
  assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.rect.width > 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  writeFileSync('.tmp/autochess/ai-worker-report.json', JSON.stringify({
    ...result, deployed, settled, canvas, screenshots, errors, failedResponses,
  }, null, 2));
  console.log(JSON.stringify({ gold: result.snapshot.state.gold, won: settled.result.won,
    actions: result.actions.filter(a => a.round === 16).length, screenshots, errors, failedResponses }));
};
