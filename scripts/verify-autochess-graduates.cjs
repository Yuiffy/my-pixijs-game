const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const localRequire = createRequire(__filename);
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean);
let chromium;
for (const candidate of candidates) {
  try { ({ chromium } = localRequire(candidate)); break; } catch { /* Try the next installation. */ }
}
assert.ok(chromium, 'Install Playwright or set PLAYWRIGHT_MODULE');
const baseUrl = process.env.AUTOCHESS_BASE_URL || 'http://127.0.0.1:4051';
const output = process.env.AUTOCHESS_ARTIFACT_DIR || 'tmp/autochess-graduates/browser';
mkdirSync(output, { recursive: true });

(async () => {
  const response = await fetch(`${baseUrl}/game/autochess?seed=101015`);
  assert.equal(response.ok, true, 'Target server must respond before Chrome launches');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.AUTOCHESS_HEADED !== '1', args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { window.speechSynthesis.speak = () => {}; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const report = { screenshots: {}, rounds: {}, errors };
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const capture = async (name) => {
    const snapshot = await state();
    const dom = await page.evaluate(() => {
      const canvas = document.querySelector('[data-game-canvas="rift-line"]');
      const rect = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, overflow: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText };
    });
    assert.ok(dom.width > 0 && dom.height > 0 && dom.cssWidth > 0 && dom.cssHeight > 0);
    assert.ok(dom.overflow <= 1);
    const pixels = inspectPng(await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }));
    report.screenshots[name] = { pixels, snapshot, dom };
  };
  try {
    await page.goto(`${baseUrl}/game/autochess?seed=101015`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.autoChessAI?.bridge && window.render_game_to_text, undefined, { timeout: 60000 });
    await page.locator('.rift-dom-choice').first().click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'preparation');
    for (const [round, leader, stars, name] of [[12, 'hatsuse_guest', 2, '蝙蝠夜歌'], [21, 'yua', 3, '邪恶外星人'], [26, 'miki_guest', 2, '肾虚萌音脑控']]) {
      await page.evaluate((roundNumber) => {
        const bridge = window.autoChessAI.bridge;
        bridge.setBattlePaused(false);
        bridge.dispatch({ type: 'restart' });
        bridge.dispatch({ type: 'starter', id: bridge.engine.state.starterChoices[0] });
        const { engine } = bridge;
        engine.state.round = roundNumber;
        engine.state.endlessUnlocked = roundNumber > 16;
        engine.state.playerLevel = roundNumber > 16 ? 10 : 8;
        engine.state.gold = 40;
        if (roundNumber > 16) engine.state.augments = ['tempered', 'execution', 'precision', 'second_wind', 'overclock'];
        if (roundNumber === 26) engine.state.augments.push('sharp_edge');
        engine.state.board.fill(null);
        engine.state.bench.fill(null);
        const specs = [['mossback', 2, 5], ['shiori', 2, 11], ['sui_bird', 2, 17], ['rei', 2, 18], ['sumi', 2, 0], ['spark_mage', 2, 6], ['sui_flower', 2, 12], ['cog_scribe', 2, 1]];
        if (roundNumber > 16) specs.push(['lian', 3, 19], ['cinder_ram', 2, 7]);
        if (roundNumber > 16) specs.forEach((spec) => { if (['sumi', 'spark_mage', 'sui_bird'].includes(spec[0])) spec[1] = 3; });
        specs.forEach(([id, star, slot], index) => { engine.state.board[slot] = { uid: index + 20, id, star }; });
        bridge.dispatch({ type: 'clearSelection' });
      }, round);
      const preview = await state();
      assert.equal(preview.wave.name, name);
      assert.equal(preview.wave.units[0].id, leader);
      assert.equal(preview.wave.units[0].star, stars);
      assert.ok(!preview.shop.some(({ id }) => ['yua', 'hatsuse_guest', 'miki_guest'].includes(id)));
      if (round === 26) {
        const brief = await page.locator('.rift-mobile-brief').textContent();
        assert.match(brief, /肾虚萌音脑控/);
        assert.match(brief, /价值约 315/);
        await page.waitForTimeout(160);
        await capture('miki-preparation');
      }
      await page.keyboard.press('e');
      const leaderButton = page.locator(`.rift-enemy-formation-unit[data-team="enemy"][data-unit-id="${leader}"]`);
      await leaderButton.click();
      await page.waitForTimeout(180);
      assert.match(await leaderButton.getAttribute('aria-label'), new RegExp(`${stars} 星`));
      await capture(`round-${round}-formation`);
      if (round === 21) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(250);
        await capture('yua-formation-mobile');
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      if (round === 26) {
        assert.match(await page.locator('.rift-enemy-detail-skill').innerText(), /妖女脑控.*反打队友/s);
        assert.match(await page.locator('.rift-enemy-detail-skill').innerText(), /1\.6 秒/);
        assert.equal(preview.wave.enemyBudget, 315);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(250);
        await capture('miki-formation-mobile');
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      await page.getByRole('button', { name: '关闭敌方部署图' }).click();
      await page.getByRole('button', { name: /开始战斗/ }).click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'battle');
      await page.evaluate(() => window.autoChessAI.bridge.setBattlePaused(true));
      const spawn = await state();
      const rows = spawn.battle.ranking.enemyRows;
      assert.equal(rows.find(({ unitId }) => unitId === leader)?.star, stars);
      await capture(`round-${round}-battle`);
      report.rounds[round] = { preview: preview.wave, spawn: spawn.battle };
      if (round === 21) {
        const beam = await page.evaluate(() => {
          const bridge = window.autoChessAI.bridge;
          const { engine } = bridge;
          const yua = engine.state.battle.enemy.find((fighter) => fighter.unitId === 'yua');
          const originalCast = engine.castAbility;
          let observed = null;
          engine.castAbility = function (source, targets, ...args) {
            const before = targets.map((target) => target.damageTaken);
            const result = originalCast.call(this, source, targets, ...args);
            if (source === yua) {
              const hits = targets.filter((target, index) => target.damageTaken > before[index]);
              if (hits.length >= 2) observed = { fid: yua.fid, star: yua.star, hp: yua.maxHp, attack: yua.attack, hits: hits.map((target) => target.fid), damage: hits.reduce((sum, target) => sum + target.damageTaken - before[targets.indexOf(target)], 0) };
            }
            return result;
          };
          try {
            for (let tick = 0; tick < 900 && engine.state.phase === 'battle' && !observed; tick += 1) engine.update(1 / 60);
          } finally {
            engine.castAbility = originalCast;
          }
          bridge.dispatch({ type: 'inspectFighter', fid: yua.fid });
          return observed;
        });
        assert.ok(beam, 'Yua must naturally fire a beam through multiple opponents');
        assert.equal(beam.star, 3);
        await page.waitForTimeout(160);
        await capture('yua-piercing-beam');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(250);
        await capture('yua-piercing-beam-mobile');
        await page.setViewportSize({ width: 1440, height: 900 });
        report.yuaBeam = beam;
      }
      if (round === 26) {
        // Advance the real battle until Miki casts naturally; freeze the frame for visual evidence.
        let controlled;
        for (let index = 0; index < 900; index += 1) {
          controlled = await page.evaluate(() => {
            const bridge = window.autoChessAI.bridge;
            bridge.engine.update(1 / 60);
            const fighter = bridge.engine.state.battle?.player.find((unit) => unit.alive && unit.mindControlTime > 0);
            return fighter ? { fid: fighter.fid, id: fighter.unitId, team: fighter.team, timer: fighter.mindControlTime, elapsed: bridge.engine.state.battle.elapsed } : null;
          });
          if (controlled) break;
        }
        assert.ok(controlled, 'Miki must cast brain control during actual combat');
        assert.equal(controlled.team, 'player');
        assert.ok(controlled.timer <= 1.6);
        assert.ok(controlled.elapsed >= 3, 'Miki must allow an opening charge window');
        await page.evaluate((fid) => window.autoChessAI.bridge.dispatch({ type: 'inspectFighter', fid }), controlled.fid);
        await page.waitForTimeout(160);
        await capture('miki-brain-control');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(250);
        await capture('miki-brain-control-mobile');
        await page.setViewportSize({ width: 1440, height: 900 });
        const reflected = await page.evaluate((fid) => {
          const bridge = window.autoChessAI.bridge;
          const battle = bridge.engine.state.battle;
          const target = battle.player.find((fighter) => fighter.fid === fid);
          const before = battle.player.filter((fighter) => fighter.fid !== fid).map((fighter) => ({ fid: fighter.fid, damage: fighter.damageTaken }));
          let hit = null;
          for (let tick = 0; tick < 180 && target.mindControlTime > 0; tick += 1) {
            bridge.engine.update(1 / 60);
            const victim = battle.player.find((fighter) => fighter.fid === target.targetFid);
            const previous = before.find((entry) => entry.fid === victim?.fid);
            if (victim && previous && victim.damageTaken > previous.damage && target.attackPulse > 0) {
              hit = { attacker: target.fid, victim: victim.fid, attackerTeam: target.team, victimTeam: victim.team, controlTime: target.mindControlTime };
              break;
            }
          }
          bridge.dispatch({ type: 'inspectFighter', fid });
          return hit;
        }, controlled.fid);
        assert.ok(reflected, 'The controlled unit must actually attack an ally');
        assert.equal(reflected.attackerTeam, reflected.victimTeam);
        await page.waitForTimeout(160);
        await capture('miki-controlled-hit');
        const released = await page.evaluate((fid) => {
          const bridge = window.autoChessAI.bridge;
          const battle = bridge.engine.state.battle;
          const caster = battle.enemy.find((fighter) => fighter.unitId === 'miki_guest');
          caster.alive = false;
          caster.hp = 0;
          bridge.engine.update(1 / 60);
          const target = battle.player.find((fighter) => fighter.fid === fid);
          bridge.dispatch({ type: 'inspectFighter', fid });
          return { team: target.team, time: target.mindControlTime, source: target.mindControlSourceFid };
        }, controlled.fid);
        assert.deepEqual(released, { team: 'player', time: 0, source: null });
        await page.waitForTimeout(160);
        await capture('miki-control-released');
        report.brainControl = { controlled, reflected, released };
      }
    }
    assert.deepEqual(errors, []);
    writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, screenshots: Object.keys(report.screenshots), yuaBeam: report.yuaBeam, brainControl: report.brainControl, errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
