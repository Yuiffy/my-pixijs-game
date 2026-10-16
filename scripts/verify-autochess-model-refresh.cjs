const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');

module.exports = async ({ page, state, capture, screenshots, errors, failedResponses }) => {
  const frames = {};
  const evidence = async (name) => {
    const dom = await page.evaluate(() => {
      const canvas = document.querySelector('[data-game-canvas="rift-line"]');
      return { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON(),
        overflow: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText };
    });
    assert.ok(dom.width > 0 && dom.height > 0 && dom.rect.width > 0 && dom.rect.height > 0);
    assert.ok(dom.overflow <= 1);
    await capture(`model-refresh-${name}`);
    frames[name] = { state: await state(), dom };
  };
  await page.waitForFunction(() => Boolean(window.autoChessAI));
  assert.equal((await state()).interface.autoplayThinkingLevel, 'veteran');
  assert.equal((await state()).interface.autoplayStyle, 'balanced');
  await page.getByRole('button', { name: '游戏设置' }).click();
  const settings = page.getByRole('dialog', { name: '游戏设置' });
  const levels = settings.getByRole('radiogroup', { name: '托管 AI 等级' });
  assert.equal(await levels.getByRole('radio', { name: '老手', exact: true }).getAttribute('aria-checked'), 'true');
  await evidence('default-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await levels.scrollIntoViewIfNeeded();
  await evidence('default-mobile');
  await levels.getByRole('radio', { name: '新手', exact: true }).click();
  await settings.getByRole('button', { name: '关闭设置' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.waitForFunction(() => window.autoChessAI && JSON.parse(window.render_game_to_text()).interface.autoplayThinkingLevel === 'novice');
  await page.getByRole('button', { name: '游戏设置' }).click();
  await levels.getByRole('radio', { name: '老手', exact: true }).click();
  await settings.getByRole('button', { name: '关闭设置' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByText('AI 观战', { exact: true }).click();
  await page.getByRole('button', { name: '由 AI 自选协议并开局' }).click();
  await page.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text());
    return s.phase === 'battle' && s.interface.autoplayEnabled;
  }, null, { timeout: 60000 });
  const battle = await state();
  assert.equal(battle.interface.autoplayThinkingLevel, 'veteran');
  assert.equal(battle.interface.autoplayInformationMode, 'normal');
  assert.ok(battle.battle.playerUnits.length > 0 && battle.battle.enemyUnits.length > 0);
  await page.getByRole('button', { name: /AI 托管中/ }).click();
  await page.evaluate(() => window.autoChessAI.pause());
  await evidence('autopilot-battle');
  await page.evaluate(() => window.autoChessAI.skipBattle());
  assert.equal((await state()).phase, 'result');
  await evidence('result');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  const report = { frames, screenshots, errors, failedResponses, savedChoicePreserved: true };
  writeFileSync('.tmp/autochess/model-refresh-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};
