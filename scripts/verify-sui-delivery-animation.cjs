const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const model = require('./lib/sui-delivery-model.cjs');
const exercises = require('./lib/sui-delivery-animation-pilot.cjs');
const pilot = require('./lib/sui-delivery-campaign-pilot.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/animation-dev';
const report = { errors: [], captures: [], checks: [] };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function ready(p) {
  await p.waitForFunction(() => !!window.deliveryTest?.sprite && !!document.querySelector('canvas') && Array.from(document.querySelectorAll('button')).some(b => !b.disabled && /接下第一单|继续这趟配送/.test(b.textContent)));
  await p.evaluate(() => window.deliveryTest.manual(true));
}
async function fresh(p) {
  await p.evaluate(key => localStorage.removeItem(key), model.SAVE_KEY); await p.reload(); await ready(p);
  await p.getByRole('button', { name: /^接下第一单/ }).click();
}
function actionMark(run, index, kind) {
  const s = model.createDelivery(model.readDeliverySave(JSON.stringify(run.milestones[0].state.save)));
  model.startDelivery(s, 'story', undefined, model.LEVELS[index].id);
  for (let i = 0; i < run.tape.length; i++) {
    model.stepDelivery(s, run.tape[i]);
    if (s.events.some(cue => cue.kind === kind && cue.age === 0)) return i + 1;
  }
  assert.fail(`${kind} must occur on the normal campaign route`);
}
async function capture(p, name) {
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const dom = await p.evaluate(() => {
    const c = document.querySelector('canvas'); const box = c.getBoundingClientRect();
    return { width: c.width, height: c.height, box: box.toJSON(), count: document.querySelectorAll('canvas').length, innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText };
  });
  assert.equal(dom.count, 1); assert.ok(dom.box.width > 0 && dom.box.height > 0);
  assert.ok(Math.abs(dom.width / dom.height - dom.box.width / dom.box.height) < 0.015);
  assert.ok(dom.scrollWidth <= dom.innerWidth + 1 && dom.scrollHeight <= dom.innerHeight + 1);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const current = await state(p); const sprite = await p.evaluate(() => window.deliveryTest.sprite());
  assert.equal(sprite.texture, current.playerAnimation.texture);
  if (current.playerAnimation.drawn) assert.equal(Number(sprite.frame), current.playerAnimation.frame);
  assert.equal(sprite.flipX, current.player.facing < 0); assert.equal(sprite.angle, 0);
  if (current.playerAnimation.drawn) {
    assert.equal(sprite.originY, 100 / model.PLAYER_SPRITE_FRAME); assert.equal(sprite.size, model.PLAYER_SPRITE_SIZE);
    assert.ok(Math.abs(sprite.y - (current.player.y + 44 - (current.theater.seated ? 10 : 0))) < 0.01);
  }
  report.captures.push({ name, file, pixels, dom, state: current, sprite });
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
    const p = await ctx.newPage(); await p.goto(`${base}/game/sui-spring?test=1`);
    await ready(p); await p.getByRole('button', { name: /^接下第一单/ }).click();
    const exercise = exercises.animationExercise(); let frame = 0;
    for (const mark of exercise.marks) {
      await p.evaluate(tape => window.deliveryTest.replay(tape), exercise.tape.slice(frame, mark.frame)); frame = mark.frame;
      const actual = await state(p); assert.deepEqual(actual.playerAnimation, mark.state.playerAnimation);
      assert.ok(Math.abs(actual.player.y - mark.state.player.y) < 0.01); assert.equal(actual.player.health, 3);
      await capture(p, mark.name);
      if (mark.name === 'tray-contact') {
        await p.getByRole('button', { name: '暂停或继续', exact: true }).click();
        await p.evaluate(() => window.advanceTime(2000)); const after = await state(p);
        assert.deepEqual(after.playerAnimation, actual.playerAnimation); assert.deepEqual(after.player, actual.player);
        await p.getByRole('button', { name: '继续配送', exact: true }).click();
      }
    }
    assert.deepEqual(exercise.gait, { left: [0, 1, 2, 3], right: [0, 1, 2, 3] });
    report.checks.push('normal-input idle/start, full four-frame gait both directions, release braking, all four air phases, all four attack phases, mirrored tray; actual Phaser texture/frame/flip/foot anchor/angle cross-check; pause freezes exact pose');
    await p.getByRole('button', { name: '整备', exact: true }).click(); await p.getByRole('button', { name: /减少动态/ }).click();
    await p.getByRole('button', { name: '关闭面板', exact: true }).click();
    await p.setViewportSize({ width: 390, height: 844 }); await capture(p, 'mobile-tray-left');
    await p.setViewportSize({ width: 844, height: 390 }); await capture(p, 'landscape-reduced-tray-left');
    await p.setViewportSize({ width: 1440, height: 1000 }); await fresh(p);
    const hurt = exercises.hurtExercise(); frame = 0;
    for (const mark of hurt.marks) {
      await p.evaluate(tape => window.deliveryTest.replay(tape), hurt.tape.slice(frame, mark.frame)); frame = mark.frame;
      assert.deepEqual((await state(p)).playerAnimation, mark.state.playerAnimation);
      if (mark.name === 'hurt') await capture(p, 'hurt');
    }
    await p.keyboard.press('r'); await p.evaluate(() => window.advanceTime(10));
    assert.ok((await state(p)).player.invincible > 1.35); assert.notEqual((await state(p)).playerAnimation.state, 'hurt');
    report.checks.push('actual dough collision shows short hurt recoil, longer shield restores movement art; R retry protection never poses as hurt; mobile portrait and landscape preserve mirrored attack with reduced motion');
    await fresh(p);
    const runs = pilot.campaign();
    for (let i = 0; i < runs.length; i++) {
      if (i) await p.getByRole('button', { name: `下一单 · ${model.LEVELS[i].title} →`, exact: true }).click();
      const kind = { 0: 'dough', 3: 'reflect', 6: 'dash' }[i]; let at = 0;
      if (kind) {
        at = actionMark(runs[i], i, kind);
        await p.evaluate(tape => window.deliveryTest.replay(tape), runs[i].tape.slice(0, at));
        assert.ok((await state(p)).feedback.some(cue => cue.kind === kind && cue.age === 0));
        await capture(p, `actual-${kind}`);
      }
      await p.evaluate(tape => window.deliveryTest.replay(tape), runs[i].tape.slice(at));
      const actual = await state(p);
      assert.equal(actual.phase, 'delivered'); assert.equal(actual.player.health, 3); assert.equal(actual.deaths, 0);
      assert.ok(Math.abs(actual.player.x - runs[i].s.player.x) < 0.01); assert.ok(Math.abs(actual.player.y - runs[i].s.player.y) < 0.01);
      assert.deepEqual(actual.save.delivered, runs[i].milestones.at(-1).state.save.delivered);
      assert.deepEqual(actual.playerAnimation, model.deliveryPlayerFrame(runs[i].s));
      if (i === 0) { await p.evaluate(() => window.advanceTime(1000)); await capture(p, 'first-handoff'); }
    }
    assert.equal((await state(p)).theater.seated, true);
    await p.getByRole('button', { name: '留在餐桌旁', exact: true }).click();
    await p.evaluate(() => window.advanceTime(1000)); await capture(p, 'seated-ending');
    report.checks.push('fresh normal-input twelve-order campaign, all health/death and exact authored positions preserved, independent handoff and actual seated ending art');
    await p.getByRole('button', { name: '整备', exact: true }).click(); await p.getByRole('button', { name: /宽托盘/ }).click();
    await p.getByRole('button', { name: '关闭面板', exact: true }).click();
    await p.getByRole('button', { name: '订单', exact: true }).click(); await p.getByRole('button', { name: new RegExp(model.LEVELS[0].title) }).click();
    const airAttack = Array.from({ length: 10 }, () => ({ ...model.deliveryInput(), jump: true, attack: true }));
    await p.evaluate(tape => window.deliveryTest.replay(tape), airAttack);
    assert.equal((await state(p)).save.tray, 'wide'); assert.equal((await state(p)).player.grounded, false);
    assert.equal((await state(p)).playerAnimation.state, 'tray-contact'); await capture(p, 'wide-insulated-air-tray');
    report.checks.push('actual dough lift, insulated reflection and steam dash rendered at contact; wide insulated tray can be selected through real UI and follows the air attack');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, captures: report.captures.length, errors: report.errors, out }));
})().catch(error => { report.failure = error.stack; fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
