const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const model = require('./lib/sui-delivery-model.cjs');
const pilot = require('./lib/sui-delivery-campaign-pilot.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/feedback-dev';
const report = { errors: [], captures: [], checks: [], audio: {} };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const audio = p => p.evaluate(() => window.deliveryTest.audio());
async function ready(p) {
  await p.waitForFunction(() => !!window.deliveryTest && !!document.querySelector('canvas') && Array.from(document.querySelectorAll('button')).some(b => !b.disabled && /接下第一单|继续这趟配送|接下一单|回到春日餐会/.test(b.textContent)));
  await p.evaluate(() => window.deliveryTest.manual(true));
}
async function capture(p, name, kind) {
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const dom = await p.evaluate(() => {
    const c = document.querySelector('canvas'); const box = c.getBoundingClientRect();
    return { width: c.width, height: c.height, box: box.toJSON(), count: document.querySelectorAll('canvas').length, innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText };
  });
  assert.equal(dom.count, 1); assert.ok(dom.box.width > 0 && dom.box.height > 0);
  assert.ok(Math.abs(dom.width / dom.height - dom.box.width / dom.box.height) < 0.015);
  assert.ok(dom.scrollWidth <= dom.innerWidth + 1 && dom.scrollHeight <= dom.innerHeight + 1);
  const current = await state(p);
  if (kind) assert.ok(current.feedback.some(v => v.kind === kind && v.age < 0.18), `${name}: visible recent ${kind}`);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.captures.push({ name, file, pixels, dom, state: current });
}
function contactMarks(run, index) {
  const wants = { 0: ['dough', 'cloth-tight', 'spring'], 1: ['metal'], 2: ['steam'], 3: ['reflect'], 6: ['dash'], 7: ['water'], 9: ['warning'], 11: ['mechanism'] }[index] || [];
  const s = model.createDelivery(model.readDeliverySave(JSON.stringify(run.milestones[0].state.save)));
  model.startDelivery(s, 'story', undefined, model.LEVELS[index].id);
  const marks = [];
  for (let f = 0; f < run.tape.length; f++) {
    model.stepDelivery(s, run.tape[f]);
    for (const cue of s.events) {
      if (!wants.includes(cue.kind) || marks.some(v => v.kind === cue.kind) || (index === 11 && cue.x < 2500)) continue;
      if (cue.x > s.camera.x + 30 && cue.x < s.camera.x + s.viewport.w - 30 && cue.y > s.camera.y + 35 && cue.y < s.camera.y + s.viewport.h - 35) marks.push({ frame: Math.min(run.tape.length, f + 6), kind: cue.kind });
    }
    s.events.length = 0;
  }
  assert.equal(marks.length, wants.length, `${index}: all requested contacts occur on screen`);
  return marks.sort((a, b) => a.frame - b.frame);
}
async function offlineMaterials(p) {
  const result = await p.evaluate(async source => {
    const AudioClass = Function(`return (${source})`)();
    const original = window.AudioContext;
    const results = [];
    try {
      for (const kind of ['land-stone', 'land-wood', 'land-metal', 'land-cloth', 'dough', 'reflect', 'spring', 'steam', 'dash', 'cart-start', 'rope', 'water']) {
        const offline = new OfflineAudioContext(1, 48000 * 0.8, 48000);
        window.AudioContext = function () {
          return new Proxy(offline, { get(target, key) {
            if (key === 'state') return 'running';
            if (key === 'close') return () => Promise.resolve();
            const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
          } });
        };
        const a = new AudioClass(); a.setPhase('playing'); a.unlock();
        a.effect({ kind, x: 100, y: 100, strength: 1, time: 0, age: 0 }, { x: 0, y: 0 }, { w: 855, h: 540 });
        const buffer = await offline.startRendering(); const data = buffer.getChannelData(0);
        let peak = 0; let square = 0; let hash = 2166136261;
        for (let i = 0; i < data.length; i++) { peak = Math.max(peak, Math.abs(data[i])); square += data[i] * data[i]; hash = Math.imul(hash ^ Math.round(data[i] * 1000000), 16777619); }
        results.push({ kind, peak, rms: Math.sqrt(square / data.length), hash: hash >>> 0, activeAfterRender: a.diagnostics().active }); a.destroy();
      }
    } finally { window.AudioContext = original; }
    return results;
  }, model.DeliveryAudio.toString());
  for (const item of result) {
    assert.ok(item.rms > 0.0001 && item.peak < 0.3, item.kind);
    assert.equal(item.activeAfterRender, 0, `${item.kind}: sources release after ending`);
  }
  assert.equal(new Set(result.map(v => v.hash)).size, result.length);
  report.audio.offline = result;
}
(async () => {
  assert.equal((await fetch(`${base}/game/sui-spring`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DELIVERY_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await ctx.route(/\/api\/(record|demos\/visits)(\?|$)/, r => r.fulfill({ json: { success: true, count: 0 } }));
    ctx.on('page', p => {
      p.on('pageerror', e => report.errors.push(e.message));
      p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
    });
    const p = await ctx.newPage(); await p.goto(`${base}/game/sui-spring?test=1`); await ready(p);
    assert.equal((await audio(p)).unlocked, false); await offlineMaterials(p);
    await p.getByRole('button', { name: /^接下第一单/ }).click();
    await p.waitForFunction(() => window.deliveryTest.audio().state === 'running');
    const runs = pilot.campaign();
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]; let frame = 0;
      if (i) await p.getByRole('button', { name: `下一单 · ${model.LEVELS[i].title} →`, exact: true }).click();
      for (const mark of contactMarks(run, i)) {
        await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(frame, mark.frame)); frame = mark.frame;
        await capture(p, `${i + 1}-${mark.kind}`, mark.kind);
        if (i === 0 && mark.kind === 'dough') {
          const before = await state(p); await p.getByRole('button', { name: '暂停或继续', exact: true }).click();
          assert.equal((await audio(p)).active, 0); assert.equal((await audio(p)).phase, 'paused');
          await p.evaluate(() => window.advanceTime(2000)); const after = await state(p);
          for (const key of ['player', 'time', 'feedback']) assert.deepEqual(after[key], before[key]);
          await p.getByRole('button', { name: '继续配送', exact: true }).click();
        }
      }
      await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(frame));
      const current = await state(p); assert.equal(current.phase, 'delivered'); assert.equal(current.player.health, 3); assert.equal(current.deaths, 0);
      assert.ok(Math.abs(current.player.x - run.s.player.x) < 0.01); assert.ok(Math.abs(current.player.y - run.s.player.y) < 0.01);
      assert.deepEqual(current.save.delivered, run.milestones.at(-1).state.save.delivered);
    }
    report.checks.push('fresh normal-input twelve-order campaign, contact effects in all districts, full health/no deaths, exact authored positions and actual final seating');
    await p.evaluate(() => window.advanceTime(1000)); assert.deepEqual((await state(p)).feedback, []);
    await p.getByRole('button', { name: '整备', exact: true }).click();
    await p.getByRole('button', { name: /音乐与音效/ }).click(); assert.equal((await audio(p)).enabled, false); assert.equal((await audio(p)).active, 0);
    await p.getByRole('button', { name: '关闭面板', exact: true }).click();
    await p.getByRole('button', { name: '订单', exact: true }).click(); await p.getByRole('button', { name: new RegExp(model.LEVELS[0].title) }).click();
    const mark = contactMarks(runs[0], 0)[0];
    await p.evaluate(tape => window.deliveryTest.replay(tape), runs[0].tape.slice(0, mark.frame));
    assert.equal((await audio(p)).active, 0); assert.equal((await audio(p)).enabled, false);
    await p.setViewportSize({ width: 390, height: 844 }); await capture(p, 'mobile-muted-contact', 'dough');
    await p.getByRole('button', { name: '整备', exact: true }).click();
    await p.getByRole('button', { name: /减少动态/ }).click(); await p.getByRole('button', { name: '关闭面板', exact: true }).click();
    await p.setViewportSize({ width: 844, height: 390 }); await capture(p, 'landscape-reduced-contact', 'dough');
    await p.reload(); await ready(p); assert.equal((await audio(p)).unlocked, false); assert.equal((await audio(p)).enabled, false);
    report.checks.push('real WebAudio gesture unlock; pause immediately disconnects voices and freezes visual feedback; muted contact keeps visual cue; reduced-motion and mobile layouts; muted preference survives reload');
    report.audio.final = await audio(p);
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, captures: report.captures.length, errors: report.errors, out }));
})().catch(error => { report.failure = error.stack; fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
