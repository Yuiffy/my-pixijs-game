const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
let playwright;
for (const location of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(location); break; } catch { /* Try the next known runtime. */ }
}
const base = process.env.ONE_MORE_URL || 'http://127.0.0.1:3821';
const destination = 'artifacts/one-more-feedback';
mkdirSync(destination, { recursive: true });

(async () => {
  assert.equal((await fetch(`${base}/game/one-more`)).status, 200);
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const screenshots = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    // Tap the real output graph before Chrome's muted device output.
    const original = AudioNode.prototype.connect;
    const taps = new WeakMap();
    AudioNode.prototype.connect = function connect(destinationNode, ...args) {
      if (destinationNode instanceof AudioDestinationNode && !(this instanceof AnalyserNode)) {
        let analyser = taps.get(this.context);
        if (!analyser) {
          analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
          taps.set(this.context, analyser); original.call(analyser, destinationNode);
        }
        window.audioProbe = analyser;
        return original.call(this, analyser, ...args);
      }
      return original.call(this, destinationNode, ...args);
    };
  });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const advance = ms => page.evaluate(value => window.advanceTime(value), ms);
  const screenshot = async name => {
    await page.waitForTimeout(260);
    const file = join(destination, `${name}.png`);
    const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
    const outside = await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] select, [role="dialog"] button, header button')).filter(node => {
      const r = node.getBoundingClientRect(); const style = getComputedStyle(node);
      return style.display !== 'none' && r.width && (r.x < 0 || r.right > innerWidth + 1 || r.y < 0 || r.bottom > innerHeight + 1);
    }).map(node => node.getAttribute('aria-label') || node.textContent));
    assert.deepEqual(outside, [], 'Controls should fit in their viewport');
    screenshots.push({ file, pixels, state: await state() });
  };
  const peak = () => page.evaluate(async () => {
    let max = 0;
    let energy = 0;
    let count = 0;
    const values = new Float32Array(2048);
    for (let frame = 0; frame < 15; frame += 1) {
      await new Promise(requestAnimationFrame);
      window.audioProbe.getFloatTimeDomainData(values);
      for (const n of values) { max = Math.max(max, Math.abs(n)); energy += n * n; count += 1; }
    }
    return { peak: max, rms: Math.sqrt(energy / count) };
  });
  const opening = async margin => page.evaluate(value => {
    for (let i = 0; i < 1500; i += 1) {
      const s = window.suiSparring.snapshot();
      if (s.boss.mode === 'windup' && s.boss.move === 'sweep' && s.boss.nextImpact - s.boss.clock <= value) return;
      window.advanceTime(10);
    }
    throw new Error('Missing sweep telegraph');
  }, margin);
  const restart = async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '回到庭前' }).click();
    await page.getByRole('button', { name: '请赐教' }).click();
    await advance(0);
  };
  try {
    await page.goto(`${base}/game/one-more`);
    await page.getByRole('button', { name: '请赐教' }).waitFor();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    assert.equal(await page.getByLabel('格挡 / 弹反', { exact: true }).inputValue(), 'KeyK');
    await screenshot('desktop-controls');
    await page.getByLabel('格挡 / 弹反', { exact: true }).selectOption('KeyL');
    await page.getByRole('tab', { name: '声音', exact: true }).click();
    await page.getByRole('checkbox', { name: '声音', exact: true }).check();
    await screenshot('desktop-sound');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.reload();
    await page.getByRole('button', { name: '请赐教' }).waitFor();
    assert.equal((await state()).bindings.guard, 'KeyL');
    await page.getByRole('button', { name: '请赐教' }).click(); await advance(0);
    await opening(400);
    await page.keyboard.down('l'); await advance(440);
    assert.equal((await state()).stats.guards, 1);
    assert.equal((await state()).stats.parries, 0);
    const guardAudio = await peak();
    await screenshot('ordinary-guard');
    await page.keyboard.up('l'); await restart();
    await opening(90); assert.equal((await state()).parryWindowOpen, true);
    await screenshot('parry-window');
    await page.keyboard.down('l'); await advance(100);
    const impact = await state();
    assert.equal(impact.stats.parries, 1); assert.ok(impact.hitStopRemaining > 0);
    assert.equal(impact.audio.lastCue, 'parry');
    assert.ok(impact.audio.activeVoices >= 4);
    await page.getByRole('status', { name: '弹反成功' }).waitFor();
    const parryAudio = await peak();
    assert.ok(parryAudio.peak > 0.01); assert.ok(parryAudio.rms > guardAudio.rms * 1.5);
    await screenshot('parry-impact');
    const combatTime = (await state()).t; await advance(40);
    assert.equal((await state()).t, combatTime);
    await advance(150); await screenshot('parry-afterglow');
    await advance(700); assert.equal(await page.getByRole('status', { name: '弹反成功' }).count(), 0);
    await page.keyboard.up('l');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const paused = (await state()).t; await advance(3000); assert.equal((await state()).t, paused);
    assert.equal((await state()).audio.activeVoices, 0);
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport); await screenshot(`controls-${viewport.width}`);
    }
    await page.getByRole('button', { name: '恢复默认按键' }).click();
    assert.equal((await state()).bindings.guard, 'KeyK');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.getByRole('button', { name: '回到庭前' }).click();
    await page.getByRole('button', { name: '请赐教' }).click(); await advance(0);
    await opening(90); await page.keyboard.down('k'); await advance(100);
    await screenshot('parry-320');
    assert.equal((await state()).stats.parries, 1);
    assert.deepEqual(errors, []);
    writeFileSync(join(destination, 'report.json'), JSON.stringify({ passed: true, guardAudio, parryAudio, screenshots, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, guardAudio, parryAudio, screenshots: screenshots.map(s => s.file) }, null, 2));
  } catch (e) {
    writeFileSync(join(destination, 'failure.json'), JSON.stringify({ message: e.message, errors }, null, 2));
    await page.screenshot({ path: join(destination, 'failure.png') }); throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
