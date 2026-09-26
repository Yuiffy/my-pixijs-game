const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const localRequire = createRequire(__filename);
const ts = localRequire('typescript');
const enginePath = path.resolve('src/components/hypeHarbor/engine.ts');
const engineModule = new (require('node:module'))(enginePath);
engineModule._compile(ts.transpileModule(fs.readFileSync(enginePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, enginePath);
const E = engineModule.exports;
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { ({ chromium } = localRequire(candidate)); break; } catch { /* try installed copies */ }
}
if (!chromium) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright package.');
const base = process.env.HARBOR_BASE_URL || 'http://127.0.0.1:3886';
const out = process.env.HARBOR_QA_DIR || 'tmp/hype-harbor-verify';
const errors = [];
const captures = [];
const checks = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const click = (page, id) => page.getByTestId(id).click();

async function waitState(page, predicate) {
  await page.waitForFunction(predicate, undefined, { timeout: 20000 });
  return state(page);
}
async function ready(page) {
  await page.goto(`${base}/game/hype-harbor`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
}
async function capture(page, name) {
  await page.waitForTimeout(500);
  const file = path.join(out, `${name}.png`);
  const metrics = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="hype-harbor"]');
    return { viewport: [innerWidth, innerHeight], document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], canvas: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight], images: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src) };
  });
  assert.ok(layout.document[0] <= layout.viewport[0] + 1, `overflow: ${JSON.stringify(layout)}`);
  assert.ok(layout.canvas.every(x => x > 0));
  assert.deepEqual(layout.images, [], 'portraits must load');
  const snapshot = await state(page);
  captures.push({ name, file, metrics, layout, phase: snapshot.phase, round: snapshot.round });
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(snapshot, null, 2));
}

async function humanAction(page, kind, boat = 0, insured = false, recognition = 0) {
  if (kind === 'recognition') { await click(page, 'action-recognition'); await click(page, `recognition-choice-${recognition}`); }
  else {
    await click(page, `boat-${boat}`); await click(page, `action-${kind === 'smear' ? 'boost' : kind}`);
    if (kind === 'smear') await click(page, 'traffic-smear');
  }
  if (kind === 'support') await page.locator('#harbor-insurance').setChecked(insured);
  const before = await state(page);
  const selected = before.availableActions.find(a => a.kind === kind && (kind === 'recognition' ? a.recognition === recognition : a.boat === boat && Boolean(a.insured) === insured));
  assert.ok(selected, `${kind} is not available: ${JSON.stringify(before.availableActions)}`);
  await click(page, 'confirm-action');
  const after = await state(page);
  assert.equal(after.players[before.turn].cash, before.players[before.turn].cash - selected.cost);
  return after;
}

async function finishMatch(page, limit = 180) {
  for (let i = 0; i < limit; i++) {
    const s = await state(page);
    if (s.phase === 'finished') return s;
    if (s.handoff) { await click(page, 'handoff'); continue; }
    if (['placing', 'preparing', 'spotlight'].includes(s.phase) && s.players[s.turn].ai) { await page.waitForTimeout(300); continue; }
    if (s.phase === 'spotlight') { await click(page, s.clipOptions.length ? `clip-board-${s.clipOptions[0]}` : 'clip-hold'); continue; }
    if (s.phase === 'preparing') await click(page, 'launch');
    else if (s.phase === 'placing') {
      const candidates = s.availableActions.filter(a => ['support', 'clip', 'share', 'boost', 'smear', 'recognition'].includes(a.kind));
      const a = candidates[(s.round + s.beat) % Math.max(1, candidates.length)];
      if (a) await humanAction(page, a.kind, a.boat, Boolean(a.insured), a.recognition);
      else await click(page, 'work');
    } else if (s.phase === 'sailing') await click(page, 'roll');
    else if (s.phase === 'reveal') await click(page, 'continue');
    else if (s.phase === 'settlement') await click(page, 'next-round');
  }
  throw new Error('Match did not finish within its transition bound.');
}

(async () => {
  assert.equal((await fetch(`${base}/game/hype-harbor`, { signal: AbortSignal.timeout(55000) })).status, 200, 'HTTP preflight');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  async function context(options = {}) {
    const ctx = await browser.newContext(options);
    await ctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await ctx.route(/google-analytics|googlesyndication|hm\.baidu\.com/, route => route.abort());
    const page = await ctx.newPage();
    page.on('pageerror', error => errors.push({ type: 'pageerror', text: error.message }));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) errors.push({ type: 'console', text: message.text() }); });
    return { ctx, page };
  }
  try {
    const { page, ctx } = await context({ viewport: { width: 1440, height: 1000 } });
    await ready(page);
    await capture(page, '01-menu');
    if (process.env.HARBOR_WRITE_PREVIEW === '1') {
      fs.mkdirSync('public/games/hype-harbor', { recursive: true });
      const box = await page.getByLabel('企划港湾棋盘').boundingBox();
      const board = await page.locator('[data-game-canvas="hype-harbor"]').boundingBox();
      inspectPng(await page.screenshot({ path: 'public/games/hype-harbor/preview.png', clip: { x: box.x, y: box.y, width: box.width, height: board.y + board.height - box.y + 39 } }));
    }
    await page.locator('#harbor-roster').selectOption('1');
    assert.match(await page.getByLabel('四位主播行情').innerText(), /灰泽满/);
    await capture(page, '02-roster-27');
    await page.locator('#harbor-roster').selectOption('2');
    assert.match(await page.getByLabel('四位主播行情').innerText(), /羽啾/);
    await capture(page, '03-roster-28');
    await page.locator('#harbor-roster').selectOption('0');
    await click(page, 'start');
    await page.getByLabel('满座歌回主播').selectOption('mizuki');
    let s = await state(page);
    assert.equal(s.resting, 'sui');
    await page.getByLabel('满座歌回主播').selectOption('sui');
    await page.getByLabel('满座歌回增加预热').click();
    await page.getByLabel('满座歌回增加预热').click();
    await capture(page, '04-preparing');
    await click(page, 'launch');
    await page.locator('#harbor-insurance').check();
    await capture(page, '05-insured-preview');
    await click(page, 'action-recognition');
    assert.match(await page.getByLabel('当前操作').innerText(), /净赚 2 币/);
    await capture(page, '14-recognition-preview');
    await click(page, 'action-clip');
    assert.equal(await page.getByLabel('选择行动').locator('button').count(), 5);
    await capture(page, '15-clip-preview');
    await click(page, 'action-support');
    if (process.argv.includes('--smoke')) { checks.push('desktop menu, all presets, producer and insurance preview'); return; }
    await humanAction(page, 'support', 0, true);
    s = await waitState(page, () => JSON.parse(window.render_game_to_text()).phase === 'sailing');
    assert.equal(s.boats[0].seats[0].insured, true);
    assert.equal(s.players[0].cash, 24);
    await click(page, 'roll');
    await capture(page, '06-dice');
    s = await state(page);
    const stored = await page.evaluate(() => localStorage.getItem('hype-harbor-v1'));
    await page.reload({ waitUntil: 'networkidle' });
    await click(page, 'resume');
    assert.equal(await page.evaluate(() => localStorage.getItem('hype-harbor-v1')), stored);
    assert.equal((await state(page)).phase, 'reveal');
    checks.push('reload preserves exact dice, cash, seats and decision phase');
    await click(page, 'continue');
    s = await state(page);
    const share = s.availableActions.find(a => a.kind === 'share');
    await humanAction(page, 'share', share.boat);
    await waitState(page, () => JSON.parse(window.render_game_to_text()).phase === 'sailing');
    await click(page, 'roll'); await click(page, 'continue');
    s = await state(page);
    await waitState(page, () => JSON.parse(window.render_game_to_text()).phase === 'placing');
    s = await state(page);
    const recognitionAction = s.availableActions.find(a => a.kind === 'recognition');
    if (recognitionAction) await humanAction(page, 'recognition', 0, false, recognitionAction.recognition); else await click(page, 'work');
    await waitState(page, () => JSON.parse(window.render_game_to_text()).phase === 'sailing');
    await click(page, 'roll'); await click(page, 'continue');
    await page.locator('aside details').first().locator('summary').click();
    await capture(page, '07-settlement');
    s = await finishMatch(page);
    assert.equal(s.round, 3);
    await capture(page, '08-finished');
    checks.push('three-round human vs two AI match, financial actions, settlement and final ranking');
    await ctx.close();

    const local = await context({ viewport: { width: 1280, height: 900 } });
    await ready(local.page);
    await local.page.getByRole('button', { name: '4 人', exact: true }).click();
    for (const n of [2, 3, 4]) await local.page.getByLabel(`玩家 ${n} 类型`).selectOption('human');
    await local.page.locator('#harbor-roster').selectOption('1');
    await click(local.page, 'start');
    assert.equal((await state(local.page)).handoff, true);
    await capture(local.page, '09-hotseat');
    await click(local.page, 'handoff'); await click(local.page, 'launch');
    await humanAction(local.page, 'support', 0);
    for (const n of [1, 2]) {
      assert.equal((await state(local.page)).turn, n);
      await click(local.page, 'handoff'); await humanAction(local.page, 'support', 0);
    }
    await click(local.page, 'handoff');
    await click(local.page, 'boat-0');
    assert.ok(await local.page.getByTestId('confirm-action').isDisabled());
    await humanAction(local.page, 'boost', 0);
    assert.equal((await state(local.page)).boats[0].position, 6);
    await capture(local.page, '10-full-boat');
    await click(local.page, 'roll'); await click(local.page, 'continue');
    await click(local.page, 'handoff');
    await local.page.getByRole('button', { name: '给已有席位补保险 · 2 币' }).click();
    await click(local.page, 'confirm-action');
    assert.equal((await state(local.page)).boats[0].seats[0].insured, true);
    await finishMatch(local.page, 230);
    await capture(local.page, '11-local-finished');
    checks.push('four humans, 27th-generation roster, handoffs, full seats, boost, later insurance and complete game');
    await local.ctx.close();

    async function fixture(saved, options = { viewport: { width: 1280, height: 900 } }) {
      const setup = await context(options);
      await setup.ctx.addInitScript(raw => { if (!localStorage.getItem('hype-harbor-v1')) localStorage.setItem('hype-harbor-v1', raw); }, JSON.stringify(saved));
      await ready(setup.page); await click(setup.page, 'resume');
      return setup;
    }
    const humans = [{ name: '你', ai: false }, { name: '朋友甲', ai: false }, { name: '朋友乙', ai: false }];
    const trafficSave = E.launch(E.createGame(humans, 3, 91));
    trafficSave.beat = 3;
    trafficSave.boats.forEach((b, i) => { b.position = [12, 1, 15][i]; });
    const traffic = await fixture(trafficSave);
    await click(traffic.page, 'handoff');
    await click(traffic.page, 'action-boost');
    assert.equal(await traffic.page.getByTestId('action-boost').innerText(), '↗\n投流');
    await click(traffic.page, 'traffic-smear');
    assert.match(await traffic.page.locator('aside').innerText(), /达标机会 67% → 33%/);
    await capture(traffic.page, '20-negative-traffic');
    await click(traffic.page, 'confirm-action');
    assert.equal((await state(traffic.page)).boats[0].position, 10);
    await traffic.page.reload({ waitUntil: 'networkidle' }); await click(traffic.page, 'resume');
    assert.equal((await state(traffic.page)).boats[0].position, 10);
    await click(traffic.page, 'handoff');
    await humanAction(traffic.page, 'boost', 0);
    assert.equal((await state(traffic.page)).boats[0].position, 12);
    await click(traffic.page, 'handoff');
    await click(traffic.page, 'action-boost'); await click(traffic.page, 'traffic-smear');
    await click(traffic.page, 'boat-2');
    assert.ok(await traffic.page.getByTestId('confirm-action').isDisabled());
    await click(traffic.page, 'boat-1');
    await traffic.page.setViewportSize({ width: 320, height: 760 });
    await capture(traffic.page, '21-mobile-negative-traffic');
    await click(traffic.page, 'confirm-action');
    assert.equal((await state(traffic.page)).boats[1].position, 0);
    assert.equal((await state(traffic.page)).players[2].cash, 28);
    await click(traffic.page, 'roll'); await click(traffic.page, 'continue');
    assert.equal((await state(traffic.page)).phase, 'settlement');
    await traffic.ctx.close();
    checks.push('unified traffic modes, exact odds, backward movement, rival counter-boost, arrival lock, zero clamp, reload and 320px layout');
    const recognitionSave = E.launch(E.createGame(humans, 3, 42));
    recognitionSave.beat = 3;
    recognitionSave.boats.forEach((b, i) => { b.position = [15, 0, 8][i]; });
    const recognition = await fixture(recognitionSave);
    await click(recognition.page, 'handoff'); await humanAction(recognition.page, 'recognition', 0, false, 0);
    await click(recognition.page, 'handoff'); await humanAction(recognition.page, 'recognition', 0, false, 1);
    await click(recognition.page, 'handoff'); await click(recognition.page, 'action-recognition');
    assert.ok(await recognition.page.getByTestId('confirm-action').isDisabled());
    await click(recognition.page, 'recognition-choice-2');
    assert.match(await recognition.page.getByTestId('confirm-action').innerText(), /不可能/);
    await click(recognition.page, 'work'); await click(recognition.page, 'roll'); await click(recognition.page, 'continue');
    const recognitionResult = await state(recognition.page);
    assert.deepEqual(recognitionResult.result.payments.filter(p => p.label.startsWith('认知民')).map(p => p.amount), [5, 6]);
    assert.deepEqual(recognitionResult.players.map(p => p.cash), [30, 32, 31]);
    await recognition.page.locator('aside details').first().locator('summary').click();
    await capture(recognition.page, '16-recognition-settlement');
    await click(recognition.page, 'next-round');
    assert.ok((await state(recognition.page)).recognition.every(slot => slot.owner === null));
    await recognition.ctx.close();
    checks.push('unified five-action entry, lower recognition returns, exclusivity, impossible conditions and reset');

    let clipSave = E.launch(E.createGame(humans, 3, 91));
    clipSave = E.takeAction(clipSave, { kind: 'clip', boat: 0 });
    clipSave = E.takeAction(clipSave, { kind: 'clip', boat: 0 });
    clipSave.phase = 'reveal'; clipSave.beat = 2;
    clipSave.boats.forEach((b, i) => { b.position = i === 0 ? 13 : 6; b.die = 4; });
    const spotlight = await fixture(clipSave);
    await click(spotlight.page, 'continue'); await click(spotlight.page, 'handoff');
    assert.equal((await state(spotlight.page)).phase, 'spotlight');
    assert.equal(await spotlight.page.getByText('剩余 1 次掷骰', { exact: true }).count(), 1);
    await capture(spotlight.page, '17-spotlight-choice');
    await click(spotlight.page, 'clip-hold'); await click(spotlight.page, 'handoff');
    await click(spotlight.page, 'clip-board-0');
    let spotState = await state(spotlight.page);
    assert.equal(spotState.boats[0].seats.at(-1).source, 'clip');
    assert.equal(spotState.clippers[0].player, 0); assert.equal(spotState.clippers[1], null);
    assert.equal(spotState.phase, 'placing'); assert.equal(spotState.turn, 0);
    await click(spotlight.page, 'handoff');
    await capture(spotlight.page, '18-clip-joined');
    await spotlight.page.reload({ waitUntil: 'networkidle' }); await click(spotlight.page, 'resume');
    assert.equal((await state(spotlight.page)).boats[0].seats.at(-1).cost, 0);
    await finishMatch(spotlight.page, 230);
    await spotlight.ctx.close();

    const finalClip = structuredClone(clipSave);
    finalClip.beat = 3;
    finalClip.boats.forEach((b, i) => { b.position = i === 0 ? 13 : 15; });
    const finale = await fixture(finalClip, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await click(finale.page, 'continue');
    const clipPayments = (await state(finale.page)).result.payments.filter(p => p.label.startsWith('切片佬'));
    assert.deepEqual(clipPayments.map(p => p.amount), [4, 4]);
    await finale.page.locator('aside details').first().locator('summary').click();
    await capture(finale.page, '19-mobile-clip-payout');
    await finale.ctx.close();
    checks.push('second-roll 13 choice, sequential hotseat decisions, hold versus free boarding, persistence and full follow-through; final 13 shared payout on touch');

    const legacy = E.launch(E.createGame(humans, 3, 11));
    legacy.version = 1;
    delete legacy.recognition; delete legacy.clippers; delete legacy.clipQueue; delete legacy.clipEntrants;
    legacy.boats.forEach(b => { b.rescue = null; });
    legacy.boats[0].rescue = { player: 0, cost: 3 }; legacy.players[0].cash -= 3;
    legacy.yard = [{ player: 1, cost: 3 }, null, null]; legacy.players[1].cash -= 3;
    const migration = await fixture(legacy);
    assert.deepEqual((await state(migration.page)).players.map(p => p.cash), [30, 30, 30]);
    assert.equal(await migration.page.evaluate(() => JSON.parse(localStorage.getItem('hype-harbor-v1')).version), 2);
    await migration.page.reload({ waitUntil: 'networkidle' }); await click(migration.page, 'resume');
    assert.deepEqual((await state(migration.page)).players.map(p => p.cash), [30, 30, 30]);
    await migration.ctx.close();
    checks.push('v1 unresolved rescue and yard stakes refund once, then save as v2');

    const mobile = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await ready(mobile.page);
    await mobile.page.locator('#harbor-roster').selectOption('2');
    await mobile.page.getByTestId('start').tap(); await mobile.page.getByTestId('launch').tap();
    await mobile.page.getByTestId('boat-2').tap();
    await mobile.page.getByTestId('jump-action').tap();
    const operationTop = await mobile.page.getByLabel('当前操作').boundingBox();
    assert.ok(operationTop.y >= 0 && operationTop.y < 40, 'mobile operations jump reaches the panel');
    await mobile.page.getByTestId('jump-board').tap();
    const boardTop = await mobile.page.getByLabel('企划港湾棋盘').boundingBox();
    assert.ok(boardTop.y >= 0 && boardTop.y < 40, 'mobile board jump reaches the harbor');
    await mobile.page.getByTestId('jump-action').tap();
    await mobile.page.getByTestId('action-recognition').tap();
    assert.equal((await state(mobile.page)).action, 'recognition');
    await capture(mobile.page, '12-mobile-390');
    await mobile.page.getByRole('button', { name: /怎么玩/ }).tap();
    assert.ok(await mobile.page.getByRole('dialog').isVisible());
    await mobile.page.getByRole('button', { name: '关闭', exact: true }).tap();
    await mobile.page.getByTestId('confirm-action').tap();
    assert.equal((await state(mobile.page)).recognition[0].owner.player, 0);
    await waitState(mobile.page, () => JSON.parse(window.render_game_to_text()).phase === 'sailing');
    await mobile.page.getByTestId('roll').tap();
    await mobile.page.setViewportSize({ width: 320, height: 720 });
    await capture(mobile.page, '13-mobile-320');
    checks.push('28th-generation touch play, help dialog, 390/320 layout');
    await mobile.ctx.close();

    const broken = await context({ viewport: { width: 1280, height: 900 } });
    await broken.ctx.addInitScript(() => localStorage.setItem('hype-harbor-v1', '{"version":1,"bad":true}'));
    await ready(broken.page); await click(broken.page, 'start'); await click(broken.page, 'launch');
    assert.equal((await state(broken.page)).phase, 'placing');
    await broken.ctx.close();
    const denied = await context({ viewport: { width: 1280, height: 900 } });
    await denied.ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled in test'); } }); });
    await ready(denied.page); await click(denied.page, 'start'); await click(denied.page, 'launch'); await click(denied.page, 'work');
    assert.match((await state(denied.page)).storageMessage, /保存不可用/);
    await denied.ctx.close();
    checks.push('malformed-save and unavailable-storage recovery');
    assert.deepEqual(errors, []);
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, captures, errors }, null, 2));
    await browser.close();
    console.log(JSON.stringify({ output: out, checks, captures: captures.length, errors }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
