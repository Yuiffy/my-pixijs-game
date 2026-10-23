const { quietContext } = require('./liuzhou-test-browser.cjs');
const assert = require('node:assert/strict');
const { travel } = require('./liuzhou-pilot.cjs');
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const next = p => p.keyboard.press('KeyE');
async function close(p) { for (let i = 0; (await state(p)).dialogue && i < 10; i++) await next(p); assert.equal((await state(p)).dialogue, null); }
async function choices(p) { await next(p); for (let i = 0; i < 10; i++) { const s = await state(p); if (s.dialogue?.index === s.dialogue?.lines.length - 1) return; await next(p); } throw new Error('choices never arrived'); }
async function reload(p) {
  await p.reload(); await p.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 90000 });
  await p.evaluate(() => window.liuzhouTest.manual(true));
  await p.getByRole('button', { name: '继续这趟旅行 ↗' }).click();
}
async function advance(p, ms) { await p.evaluate(ms => window.advanceTime(ms), ms); }
async function runEvening({ page: p, browser, capture, report }) {
  console.log('Evening: accept chapter and record three sites in a different order');
  await p.evaluate(() => window.liuzhouTest.manual(true));
  assert.equal((await state(p)).stage, 6);
  await travel(p, { x: 28, z: -23 }); await choices(p); await close(p);
  assert.equal((await state(p)).evening.started, false, 'E must not accept the new chapter');
  await choices(p); await p.getByRole('button', { name: /开始第二章/ }).click(); await close(p);
  assert.equal((await state(p)).evening.started, true);
  await p.keyboard.press('KeyM'); await capture(p, 'evening-01-three-sites-map'); await p.keyboard.press('Escape');
  await travel(p, { x: 78, z: -42 }); await next(p); await capture(p, 'evening-02-neighbor-memory'); await close(p);
  const spots = [{ id: 'river', x: 247, z: -166 }, { id: 'bridge', x: 74, z: 25 }, { id: 'street', x: -158, z: 126 }];
  for (const [index, spot] of spots.entries()) {
    await travel(p, spot, { tolerance: 1 }); await advance(p, 600);
    assert.equal((await state(p)).interaction.kind, 'sample'); await next(p);
    if (index === 0) {
      await advance(p, 2200); const progress = (await state(p)).evening.recording.progress;
      assert.ok(progress > 1); await capture(p, 'evening-03-field-recording');
      await p.keyboard.press('Escape'); await advance(p, 2000); assert.equal((await state(p)).evening.recording.progress, progress);
      await p.keyboard.press('Escape'); await reload(p);
      assert.deepEqual((await state(p)).evening.samples, []); assert.equal((await state(p)).evening.recording, null);
      await next(p);
    }
    for (let i = 0; i < 45 && !(await state(p)).evening.samples.includes(spot.id); i++) await advance(p, 1000);
    assert.ok((await state(p)).evening.samples.includes(spot.id), `recording did not finish at ${spot.id}`);
    await capture(p, `evening-0${index + 4}-${spot.id}-saved`);
  }
  const collected = (await state(p)).evening.samples; assert.deepEqual(collected, ['river', 'bridge', 'street']);
  await reload(p); assert.deepEqual([...(await state(p)).evening.samples].sort(), [...collected].sort());
  await travel(p, { x: 23, z: -27 }); await choices(p); await capture(p, 'evening-07-arrangement-choice');
  await close(p); assert.equal((await state(p)).evening.arrangement, null);
  await choices(p); await p.getByRole('button', { name: /街巷先开口/ }).click(); await close(p);
  assert.equal((await state(p)).evening.arrangement, 'street');
  await choices(p); await p.getByRole('button', { name: /让江风先来/ }).click(); await close(p);
  await travel(p, { x: 34, z: -27 }); await choices(p); await close(p); assert.equal((await state(p)).evening.watching, false);
  await choices(p); await p.getByRole('button', { name: /开始江边放映/ }).click();
  const opening = await state(p); assert.equal(opening.evening.frame.card, 'river'); const money = opening.money;
  const tonesBefore = await p.evaluate(() => window.liuzhouAudioQA.tones);
  await p.evaluate(() => window.liuzhouTest.manual(false));
  await p.waitForFunction(baseline => window.liuzhouAudioQA.tones > baseline + 2 && window.liuzhouTest.game.evening.elapsed > 1, tonesBefore);
  await p.evaluate(() => window.liuzhouTest.manual(true));
  const audio = await p.evaluate(() => {
    const qa = window.liuzhouAudioQA; const panner = qa.panners[0]; const listener = panner.context.listener;
    return { tones: qa.tones, panner: [panner.positionX.value, panner.positionY.value, panner.positionZ.value], listener: [listener.positionX.value, listener.positionY.value, listener.positionZ.value], stageGain: qa.gains[1].gain.value };
  });
  assert.deepEqual(audio.panner, [28, 2, -34]); assert.deepEqual(audio.listener, [28, 4.5, -7]); assert.ok(audio.stageGain > 0.9); report.audio = audio;
  report.audio.newTones = audio.tones - tonesBefore;
  await capture(p, 'evening-08-screen-river');
  await p.getByRole('button', { name: '关闭声音' }).click();
  // Chrome can stop processing an upstream silent branch once the master reaches zero.
  // Verify its real automation target and the rendered master gain, not a stale upstream value.
  await p.waitForFunction(() => window.liuzhouAudioQA.gains[1].qaTarget === 0 && window.liuzhouAudioQA.gains[0].gain.value < 0.01);
  Object.assign(report.audio, await p.evaluate(() => ({ mutedStageTarget: window.liuzhouAudioQA.gains[1].qaTarget, mutedMasterGain: window.liuzhouAudioQA.gains[0].gain.value })));
  await p.getByRole('button', { name: '开启声音' }).click();
  await p.keyboard.press('Escape'); const paused = await state(p); await advance(p, 1000); assert.deepEqual(await state(p), paused);
  await p.waitForFunction(() => window.liuzhouAudioQA.gains[1].qaTarget === 0 && window.liuzhouAudioQA.gains[0].gain.value < 0.01);
  Object.assign(report.audio, await p.evaluate(() => ({ pausedStageTarget: window.liuzhouAudioQA.gains[1].qaTarget, pausedMasterGain: window.liuzhouAudioQA.gains[0].gain.value })));
  await p.keyboard.press('Escape');
  await advance(p, 6500); await capture(p, 'evening-09-screen-bridge');
  await p.getByRole('button', { name: '暂离放映', exact: false }).click(); assert.equal((await state(p)).money, money);
  const partial = (await state(p)).evening.elapsed; await reload(p); assert.equal((await state(p)).evening.watching, false); assert.equal((await state(p)).evening.elapsed, partial);
  await choices(p); await p.getByRole('button', { name: /接着看江边放映/ }).click();
  await advance(p, 7500); await capture(p, 'evening-10-screen-street');
  await advance(p, 8500); await capture(p, 'evening-11-screen-together');
  await advance(p, 6000); assert.equal((await state(p)).evening.completed, true); assert.equal((await state(p)).money, money + 28);
  await capture(p, 'evening-12-chapter-complete');
  await p.getByRole('button', { name: /^回到街上/ }).click();
  await reload(p); assert.equal((await state(p)).evening.completed, true); assert.equal((await state(p)).money, money + 28);
  await choices(p); await p.getByRole('button', { name: /再看一遍江边放映/ }).click(); await advance(p, 29000);
  assert.equal((await state(p)).money, money + 28); await p.getByRole('button', { name: /^回到街上/ }).click();
  await p.keyboard.press('KeyJ'); await capture(p, 'evening-13-journal'); await p.keyboard.press('Escape');
  report.checks.push('chapter two accepted explicitly after normal first-chapter route; any-order ordinary-input recordings, pause and partial reload, completed cards restored, two arrangements, spatial live synthesis, interrupt/resume/reload performance, atomic reward and no-pay replay');
  // The mobile context restores the save earned through the ordinary route above.
  const save = await p.evaluate(() => localStorage.getItem('liuzhou-riverside-v1'));
  assert.ok(save);
  const context = await quietContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
  await context.addInitScript(value => { if (!localStorage.getItem('liuzhou-riverside-v1')) localStorage.setItem('liuzhou-riverside-v1', value); if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; }, save);
  const m = await context.newPage(); m.on('pageerror', e => report.errors.push(e.message));
  await m.goto(p.url()); await m.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 90000 }); await m.evaluate(() => window.liuzhouTest.manual(true));
  await m.getByRole('button', { name: '继续这趟旅行 ↗' }).tap();
  await m.getByRole('button', { name: /与七海交谈/ }).tap();
  while ((await state(m)).dialogue.index < (await state(m)).dialogue.lines.length - 1) await m.getByRole('button', { name: '继续', exact: false }).tap();
  await capture(m, 'evening-14-mobile-replay-choice'); await m.getByRole('button', { name: /再看一遍江边放映/ }).tap();
  await advance(m, 2000); await capture(m, 'evening-15-mobile-show-portrait');
  await m.setViewportSize({ width: 844, height: 390 }); await advance(m, 6000); await capture(m, 'evening-16-mobile-show-landscape');
  await m.getByRole('button', { name: '暂离放映', exact: false }).tap(); assert.equal((await state(m)).evening.watching, false);
  await context.close();
  report.checks.push('earned second-chapter save on 390×844 touch device; explicit replay button, portrait and 844×390 landscape subtitles, interrupt return to exploration');
}
module.exports = { runEvening };
