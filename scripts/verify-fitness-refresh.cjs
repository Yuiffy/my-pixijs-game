const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.FITNESS_BASE_URL || 'http://localhost:4085';
const output = process.env.FITNESS_QA_DIR || 'tmp/fitness-refresh/details';

(async () => {
  assert.ok((await fetch(base + '/game/sui-fitness')).ok);
  fs.mkdirSync(output, { recursive: true });
  const { fitnessDecision, fitnessUpgrade } = await import('./tests/helpers/fitness-pilot.mjs');
  const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
  const errors = [], shots = [];
  try {
    for (const talent of ['strength', 'swimmer', 'rhythm']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.route('**/api/visit**', r => r.fulfill({ body: '' }));
      await page.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
      await page.goto(`${base}/game/sui-fitness?seed=41&talent=${talent}`);
      await page.waitForFunction(() => !!window.render_game_to_text);
      await page.evaluate(() => window.advanceTime(0));
      await page.locator('#start-fitness').click();
      let memo = {}, found = [];
      for (let turn = 0; turn < 100; turn++) {
        const result = await page.evaluate(({ decideSource, memory, captured, kind }) => {
          const decide = new Function('return (' + decideSource + ')')();
          const read = () => JSON.parse(window.render_game_to_text());
          const held = new Set();
          const keys = { KeyA: 'a', KeyD: 'd', KeyW: 'w', KeyS: 's', KeyE: 'e', KeyQ: 'q', Space: ' ' };
          const change = (code, down) => {
            if (held.has(code) === down) return;
            down ? held.add(code) : held.delete(code);
            window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: keys[code], bubbles: true }));
          };
          let reason = null, s = read();
          try {
            for (let i = 0; i < 180 && s.phase === 'playing'; i++) {
              if (!s.circuits) memory.forceKind = !s.workouts.gym ? 'gym' : !s.workouts.swim ? 'swim' : 'home';
              else delete memory.forceKind;
              const a = decide(s, memory);
              change('KeyA', a.x < 0); change('KeyD', a.x > 0); change('KeyW', a.y < 0); change('KeyS', a.y > 0);
              change('KeyE', !!a.exercise); change('Space', !!a.dash); change('KeyQ', !!a.pulse);
              window.advanceTime(1000 / 60); s = read();
              if (!captured.includes('attack') && (kind === 'strength' ? s.attackFlash > 0.08 : kind === 'swimmer' ? s.waterFlash > 0.08 : s.weaponDamage.rope > 0)) reason = 'attack';
              if (kind === 'strength' && !captured.includes('warning') && s.foods.some(f => f.kind === 'jerky' && f.telegraph > 0.25 && f.x > 50 && f.x < 1050 && f.y > 80 && f.y < 620)) reason = 'warning';
              if (kind === 'rhythm' && !captured.includes('flow') && s.flowTime > 10 && s.phase === 'playing') reason = 'flow';
              if (reason && s.phase === 'playing') break;
              reason = null;
            }
          } finally { [...held].forEach(code => change(code, false)); }
          return { s: read(), memo: memory, reason };
        }, { decideSource: fitnessDecision.toString(), memory: memo, captured: found, kind: talent });
        memo = result.memo;
        if (result.reason) {
          const file = path.join(output, `${talent}-${result.reason}.png`);
          const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
          assert.ok(pixels.colors > 30 && pixels.nearBlackRatio < 0.8 && pixels.transparentRatio < 0.8);
          const canvas = await page.locator('canvas').evaluate(c => ({ width: c.width, height: c.height }));
          assert.deepEqual(canvas, { width: 1100, height: 700 });
          assert.equal(result.s.visualRevision, 3);
          const dom = await page.locator('body').innerText();
          assert.ok(dom.includes(result.s.weight.toFixed(2)) && dom.includes('三站连携'));
          shots.push({ file, pixels, canvas, state: result.s }); found.push(result.reason);
        }
        if (found.includes('attack') && (talent === 'swimmer' || found.includes(talent === 'strength' ? 'warning' : 'flow'))) break;
        if (result.s.phase === 'upgrade') await page.locator(`[data-upgrade="${fitnessUpgrade(result.s)}"]`).click();
        else if (result.s.phase !== 'playing') break;
      }
      assert.ok(found.includes('attack'), talent);
      if (talent !== 'swimmer') assert.ok(found.includes(talent === 'strength' ? 'warning' : 'flow'), talent);
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: shots.length, errors }));
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ errors, shots }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
