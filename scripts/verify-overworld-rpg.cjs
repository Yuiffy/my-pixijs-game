const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean);
let chromium;
for (const candidate of candidates) { try { ({ chromium } = require(candidate)); break; } catch {} }
if (!chromium) throw new Error('Playwright is required; set PLAYWRIGHT_MODULE to its installed location.');
const base = process.env.RPG_BASE_URL || 'http://127.0.0.1:3860';
const output = process.env.RPG_QA_DIR || 'tmp/rpg-verify';
const evidence = []; const errors = []; const events = [];
mkdirSync(output, { recursive: true });
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const assertRenderedBattle = async page => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const s = await state(page);
  assert.equal(s.renderedBattle.length, s.battle.units.length, 'Every battle unit has a current renderer object');
  for (const unit of s.battle.units) {
    const view = s.renderedBattle.find(v => v.uid === unit.uid);
    assert.ok(view, `Missing actor ${unit.uid}`);
    assert.equal(view.characterId, unit.characterId, `Wrong rendered sprite in ${s.battle.encounterId}`);
    assert.equal(view.label, unit.name, `Stale rendered name in ${s.battle.encounterId}`);
    if (unit.hp > 0) assert.ok(Math.abs(view.angle) < 20, 'A revived actor cannot keep its previous defeated rotation');
  }
};
const observe = page => {
  page.on('pageerror', e => errors.push(`page: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
};
const open = async page => {
  await page.goto(`${base}/game/rpg`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.overworldRpg && document.querySelector('canvas')?.width > 0 && !document.body.innerText.includes('正在铺开山河'));
};
const capture = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  await page.waitForTimeout(250);
  const snapshot = await state(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight })), text: document.body.innerText.slice(0, 1500), badImages: [...document.querySelectorAll('img')].filter(i => !i.complete || !i.naturalWidth).map(i => i.src) }));
  assert.ok(layout.scrollWidth <= layout.width + 1, 'Horizontal overflow');
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].width > 0 && layout.canvas[0].height > 0);
  assert.deepEqual(layout.badImages, []);
  const path = join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path, fullPage: true }));
  evidence.push({ name, path, pixels, layout, mode: snapshot.mode, party: snapshot.active, level: snapshot.level, shards: snapshot.shards });
  writeFileSync(join(output, `${name}.json`), JSON.stringify(snapshot, null, 2));
  console.log(`capture ${name}: ${snapshot.mode} ${pixels.width}x${pixels.height}`);
};
const go = async (page, id) => {
  assert.equal((await state(page)).mode, 'explore');
  await page.evaluate(value => window.overworldRpg.interact(value), id);
  for (let i = 0; i < 85 && (await state(page)).mode === 'explore'; i++) await advance(page, 1000);
  const s = await state(page);
  assert.equal(s.mode, 'dialogue', `Could not walk to ${id}: ${JSON.stringify({ player: s.player, route: s.route, paused: s.paused })}`);
  assert.equal(s.dialogue.entityId, id);
};
const choose = async (page, id) => {
  await page.locator(`[data-choice="${id}"]`).click();
};
const leave = async page => { if ((await state(page)).mode === 'dialogue') await choose(page, 'leave'); };
const camp = async (page, id, upgrade = true) => {
  await go(page, id); await choose(page, 'rest');
  if (upgrade) for (let i = 0; i < 4; i++) {
    if (!(await page.locator('[data-choice="upgrade"]').isEnabled())) break;
    await choose(page, 'upgrade');
  }
  await leave(page);
};
const recruit = async (page, id) => { await go(page, id); await choose(page, 'recruit'); await leave(page); };
const fight = async (page, id, shot) => {
  await go(page, id); await choose(page, 'fight'); assert.equal((await state(page)).mode, 'battle');
  await advance(page, 1600);
  await assertRenderedBattle(page);
  if (shot) await capture(page, shot);
  for (let i = 0; i < 80 && (await state(page)).mode === 'battle'; i++) await advance(page, 2000);
  const result = await state(page); events.push({ id, level: result.level, weapon: result.weapon, result: result.result });
  assert.equal(result.mode, 'result'); assert.equal(result.result.won, true, `Lost ${id}: ${JSON.stringify(result.result)}`);
  if (id === 'rift_tyrant') await capture(page, '08-final-victory');
  await page.getByRole('button', { name: /继续旅程/ }).click();
};

(async () => {
  const response = await fetch(`${base}/game/rpg`); assert.equal(response.status, 200, 'Dev server must respond before Chrome launches');
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.RPG_HEADED !== '1' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); observe(page); await open(page);
    await capture(page, '01-title');
    await page.getByRole('button', { name: /踏入虚境/ }).focus();
    await page.keyboard.press('Space');
    assert.equal((await state(page)).mode, 'explore', 'Focused title action supports native keyboard activation');
    await page.keyboard.press('f');
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement);
    const screenResume = page.getByRole('button', { name: '继续旅程', exact: true });
    if (await screenResume.isVisible()) await screenResume.click();
    const before = (await state(page)).player;
    await page.keyboard.down('d'); await advance(page, 200); await page.keyboard.up('d');
    assert.ok((await state(page)).player.x > before.x + 20, 'Keyboard movement advances the actual player');
    await page.keyboard.press('Escape'); const paused = await state(page); await advance(page, 2000); assert.equal((await state(page)).playTime, paused.playTime);
    await page.getByRole('button', { name: '继续旅程', exact: true }).click();
    await page.keyboard.press('e'); assert.equal((await state(page)).dialogue.entityId, 'sui');
    await capture(page, '02-sui-dialogue');
    await page.keyboard.press('Space'); assert.equal((await state(page)).party.length, 2, 'Dialogue focuses and activates recruitment by keyboard');
    await go(page, 'town_cache'); await choose(page, 'open');
    await fight(page, 'bamboo_echo', '03-first-battle');
    await camp(page, 'town_camp'); await recruit(page, 'shiori');
    await page.keyboard.press('m'); await capture(page, '04-world-map'); await page.getByRole('button', { name: '关闭面板' }).click();
    await fight(page, 'reed_beast'); await camp(page, 'grove_camp'); await recruit(page, 'pako');
    await fight(page, 'pass_guard'); await camp(page, 'pass_camp'); await recruit(page, 'seki_boar_king');
    await page.keyboard.press('Tab'); await capture(page, '05-party');
    const cards = page.locator('article');
    await cards.filter({ hasText: '追风连射' }).getByRole('button').click();
    await cards.filter({ hasText: '猪王冲阵' }).getByRole('button').click();
    assert.ok((await state(page)).active.includes('seki_boar_king')); assert.equal((await state(page)).active.length, 4);
    await cards.filter({ hasText: '猪王冲阵' }).getByRole('button').click();
    await cards.filter({ hasText: '追风连射' }).getByRole('button').click();
    await page.keyboard.press('Escape');
    const saved = await state(page); await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /继续旅程/ }).click();
    assert.deepEqual((await state(page)).completed, saved.completed); assert.equal((await state(page)).party.length, 5);
    for (const [boss, rest] of [['grove_warden', 'grove_camp'], ['bell_keeper', 'pass_camp'], ['ruin_sentinel', 'ruins_camp']]) { await camp(page, rest); await fight(page, boss, boss === 'bell_keeper' ? '06-regional-battle' : undefined); }
    assert.equal((await state(page)).shards, 3);
    await camp(page, 'ruins_camp');
    await go(page, 'rift_tyrant'); await choose(page, 'fight'); await advance(page, 1300);
    // Mid-battle reload must preserve earned progression and restore the unspent battle entry.
    const battleStart = await state(page); await page.waitForTimeout(2100); await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: /继续旅程/ }).click();
    const restored = await state(page); assert.equal(restored.mode, 'explore'); assert.equal(restored.shards, 3); assert.deepEqual(restored.completed, battleStart.completed);
    await fight(page, 'rift_tyrant', '07-final-battle');
    await go(page, 'home'); await choose(page, 'return'); assert.equal((await state(page)).mode, 'ending');
    await capture(page, '09-ending');
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: /继续旅程/ }).click(); assert.equal((await state(page)).mode, 'ending');
    const final = await state(page);

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const mobile = await mobileContext.newPage(); observe(mobile); await open(mobile);
    await mobile.getByRole('button', { name: /踏入虚境/ }).tap();
    const mobileStart = (await state(mobile)).player;
    const cdp = await mobileContext.newCDPSession(mobile);
    const box = await mobile.getByRole('button', { name: '向右', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await advance(mobile, 250);
    assert.ok((await state(mobile)).player.x > mobileStart.x + 25, 'Real touch moves the player');
    // Opening dialogue unmounts the pressed direction button before pointerup.
    await mobile.evaluate(() => window.overworldRpg.interact('sui'));
    assert.equal((await state(mobile)).mode, 'dialogue');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await choose(mobile, 'recruit');
    const afterDialogue = (await state(mobile)).player; await advance(mobile, 1000);
    assert.deepEqual((await state(mobile)).player, afterDialogue, 'Touch movement must clear when its button disappears for dialogue');
    await capture(mobile, '10-mobile-world');
    await go(mobile, 'bamboo_echo'); await choose(mobile, 'fight'); await advance(mobile, 1400);
    await mobile.getByRole('button', { name: /点击接管主角/ }).tap();
    const unitBefore = (await state(mobile)).battle.units.find(u => u.uid === 'ally-biscuit_sui');
    const left = await mobile.getByRole('button', { name: '向左', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: left.x + left.width / 2, y: left.y + left.height / 2 }] });
    await advance(mobile, 300); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state(mobile)).battle.units.find(u => u.uid === 'ally-biscuit_sui').y > unitBefore.y + 20, 'Left touch moves left on the rotated portrait battlefield');
    await capture(mobile, '11-mobile-manual-battle');
    await mobile.getByRole('button', { name: /点击切为自动/ }).tap();
    for (let i = 0; i < 80 && (await state(mobile)).mode === 'battle'; i++) await advance(mobile, 2000);
    assert.equal((await state(mobile)).result.won, true);
    await mobile.getByRole('button', { name: /继续旅程/ }).tap();
    await mobile.getByRole('button', { name: /^地图/ }).tap(); await capture(mobile, '12-mobile-map');
    await mobile.getByRole('button', { name: '关闭面板' }).tap();
    await mobile.setViewportSize({ width: 320, height: 740 }); await capture(mobile, '13-small-world');

    const deniedContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await deniedContext.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Unavailable', 'QuotaExceededError'); }; });
    const denied = await deniedContext.newPage(); observe(denied); await open(denied); await denied.getByRole('button', { name: /踏入虚境/ }).click(); await recruit(denied, 'sui'); assert.equal((await state(denied)).party.length, 2);
    await denied.getByRole('button', { name: '设置与操作' }).click(); assert.ok(await denied.getByText('本机存档不可用，本次仍可继续游玩。').isVisible());
    await capture(denied, '14-storage-fallback');
    const failureContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await failureContext.addInitScript(() => localStorage.setItem('overworld-rpg-save-v1', '{bad-json'));
    const failure = await failureContext.newPage(); observe(failure); await open(failure);
    assert.ok(await failure.getByText('旧存档无法读取，可以重新踏入虚境。').isVisible());
    await failure.getByRole('button', { name: /踏入虚境/ }).click();
    await go(failure, 'grove_warden'); await choose(failure, 'fight');
    for (let i = 0; i < 80 && (await state(failure)).mode === 'battle'; i++) await advance(failure, 2000);
    const lost = await state(failure); assert.equal(lost.result.won, false); assert.equal(lost.shards, 0); assert.equal(lost.gold, 30);
    await capture(failure, '15-defeat-recovery');
    await failure.getByRole('button', { name: /继续旅程/ }).click();
    assert.equal((await state(failure)).mode, 'explore');
    await recruit(failure, 'sui'); await fight(failure, 'bamboo_echo');
    await failure.setViewportSize({ width: 2560, height: 1440 });
    await capture(failure, '16-2k-world');
    // A lost focus clears held movement and pauses; resuming never leaves a key stuck.
    await failure.keyboard.down('d');
    await failure.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurState = await state(failure); assert.equal(blurState.paused, true); await advance(failure, 1000);
    assert.deepEqual((await state(failure)).player, blurState.player);
    await failure.keyboard.up('d'); await failure.getByRole('button', { name: '继续旅程', exact: true }).click();
    const resumed = (await state(failure)).player; await advance(failure, 1000); assert.deepEqual((await state(failure)).player, resumed);
    assert.deepEqual([...new Set(errors)], [], 'Browser console/page/HTTP errors');
    writeFileSync(join(output, 'report.json'), JSON.stringify({ base, evidence, events, errors, final: { mode: final.mode, level: final.level, party: final.party, completed: final.completed, shards: final.shards, gold: final.gold } }, null, 2));
    console.log(`RPG verification passed: ${evidence.length} screenshots, ${events.length} battles, home ending, refresh, touch and storage fallback.`);
  } finally { await browser.close(); }
})().catch(error => { writeFileSync(join(output, 'failure.json'), JSON.stringify({ message: error.stack, evidence, events, errors }, null, 2)); console.error(error); process.exitCode = 1; });
