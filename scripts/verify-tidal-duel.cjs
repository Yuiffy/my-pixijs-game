const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const url = process.env.TIDAL_DUEL_URL || 'http://localhost:3970/game/tidal-duel';
const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-duel-qa');
const smokeOnly = process.env.SMOKE_ONLY === '1' || process.env.TIDAL_DUEL_SMOKE === '1';
const publicMatch = process.env.TIDAL_DUEL_PUBLIC_MATCH === '1';
const gamepadOnly = process.env.TIDAL_DUEL_GAMEPAD_ONLY === '1';
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const actions = ['left', 'right', 'jump', 'crouch', 'light', 'medium', 'heavy', 'ability', 'assist', 'punch', 'kick', 'guard', 'hold', 'throw', 'sidestep', 'special', 'skill', 'rise', 'burst'];
const P1 = { left: 'KeyA', right: 'KeyD', jump: 'KeyW', crouch: 'KeyS',
  punch: 'KeyJ', kick: 'KeyK', guard: 'KeyA', hold: ['KeyJ', 'KeyL'], throw: ['KeyJ', 'KeyK'], sidestep: ['KeyK', 'KeyL'], special: ['KeyL', 'KeyU'] };
const dismissHelp = page => button(page, '明白了，去过招 →').click();

class CaptureFailure extends Error {}

function recordErrors(page, report) {
  page.on('pageerror', error => report.errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ type: 'console', message: message.text() });
  });
}

async function quietContext(browser, options = {}) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...options });
  await context.route(/\/api\/record(?:\?|$)/, route => route.fulfill({ contentType: 'application/json', body: '{"success":true,"skipped":true}' }));
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  });
  return context;
}

async function open(page, report, manual = true) {
  recordErrors(page, report);
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, 'target route responds');
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function'
    && typeof window.advanceTime === 'function'
    && JSON.parse(window.render_game_to_text()).assetsReady === true, null, { timeout: 30000 });
  if (manual) {
    await page.waitForFunction(() => !!window.tidalDuel);
    await page.evaluate(() => window.tidalDuel.manual(true));
  }
  assert.equal((await state(page)).phase, 'menu', 'initial screen is character selection');
}

async function capture(page, report, name) {
  const current = await state(page);
  if (current.phase === 'menu') {
    await page.locator('#tidal-start').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const menu = document.querySelector('#tidal-start')?.closest('section');
      return menu && Number(getComputedStyle(menu).opacity) >= 0.99;
    });
  } else {
    await page.locator('#tidal-start').waitFor({ state: 'detached' });
  }
  if (current.phase === 'result') await page.getByLabel('对决结果', { exact: true }).waitFor();
  if (current.paused && !current.overlay) await page.getByLabel('对决已暂停', { exact: true }).waitFor();
  const file = path.join(output, `${name}.png`);
  const image = await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  let pixels;
  try {
    pixels = inspectPng(image);
  } catch (error) {
    throw new CaptureFailure(`${name}: ${error.message}`);
  }
  const text = await state(page);
  const dom = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    buttons: [...document.querySelectorAll('button')].filter(el => el.getBoundingClientRect().width > 0)
      .map(el => ({ text: el.textContent?.trim(), label: el.getAttribute('aria-label') })),
  }));
  const canvases = await page.locator('canvas').evaluateAll(elements => elements.map(el => {
    const rect = el.getBoundingClientRect();
    return { width: el.width, height: el.height,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  }));
  assert.ok(canvases.length > 0, 'rendered canvas exists');
  assert.ok(canvases.every(canvas => canvas.width > 0 && canvas.height > 0
    && canvas.rect.width > 0 && canvas.rect.height > 0), 'backing and displayed canvas dimensions are positive');
  assert.ok(dom.document.width <= dom.viewport.width + 1, `${name}: no horizontal overflow`);
  assert.equal(text.assetsReady, true, `${name}: assets and text agree with screenshot`);
  report.screenshots.push({ name, file, pixels, state: text, canvases, dom });
  return text;
}

async function start(page, mode = 'training') {
  const labels = { solo: '单人挑战', local: '同机双人', training: '自由练习' };
  await button(page, labels[mode]).click();
  await page.locator('#tidal-start').click();
  await advance(page, 3300);
  await page.keyboard.press('Enter');
  await advance(page, 20);
  assert.equal((await state(page)).phase, 'fight', `${mode}: intro enters playable fight`);
}

async function keys(page, codes, ms) {
  codes = codes.flat();
  for (const code of codes) await page.keyboard.down(code);
  await advance(page, ms);
  for (const code of [...codes].reverse()) await page.keyboard.up(code);
  // The engine records rising edges at a simulation tick. Give key releases
  // their own tick before another press of the same action (e.g. J → J).
  await advance(page, 10);
}

async function returnToMenu(page) {
  await button(page, '返回选人').last().click();
  if (await page.getByRole('dialog').isVisible()) {
    await page.getByRole('dialog').getByRole('button', { name: '返回选人', exact: true }).click();
  }
  assert.equal((await state(page)).phase, 'menu');
}

async function smoke(page, report) {
  if (publicMatch) assert.equal(await page.evaluate(() => typeof window.tidalDuel), 'undefined', 'production has no mutable developer game hook');
  assert.equal((await state(page)).art, 'tidal-pixel-v2', 'production uses the current pixel renderer');
  assert.ok((await state(page)).fighters.every(f => f.skin === 'original'), 'production defaults to original costumes');
  await capture(page, report, '01-desktop-menu');
  await button(page, '玩法').click();
  await page.getByRole('dialog').waitFor();
  await dismissHelp(page);
  await button(page, '自由练习').click();
  await page.locator('#tidal-start').click();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'fight');
  const before = await state(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(260);
  await page.keyboard.up('KeyD');
  const moved = await state(page);
  assert.ok(moved.fighters[0].x > before.fighters[0].x, 'production keyboard moves fighter');
  await keys(page, [P1.punch], 400); await advance(page, 400);
  await keys(page, [P1.kick], 400); await advance(page, 400);
  await keys(page, [P1.jump], 180);
  assert.ok((await state(page)).fighters[0].y < 580, 'production keyboard jump leaves the floor');
  await capture(page, report, '02-desktop-fight');
  await button(page, '暂停').click();
  const paused = await state(page);
  await advance(page, 1200);
  assert.equal((await state(page)).timeRemaining, paused.timeRemaining, 'production pause freezes timer');
  await capture(page, report, '03-desktop-pause');
  await button(page, '继续对决').click();
  await returnToMenu(page);
  if (publicMatch) {
    await publicVersus(page, report);
    await publicPixelCostumes(page, report);
  }
  for (const [name, viewport] of [
    ['04-phone-menu', { width: 390, height: 844 }],
    ['05-small-menu', { width: 320, height: 740 }],
    ['06-landscape-menu', { width: 844, height: 390 }],
  ]) {
    await page.setViewportSize(viewport);
    await capture(page, report, name);
    if (name === '06-landscape-menu') {
      const canvas = await page.locator('canvas').boundingBox();
      assert.ok(canvas.width >= viewport.width - 1, 'landscape selection uses the full width rather than the short battle viewport limit');
    }
  }
  report.checks.push('Production public controls: boot, rules, practice, keyboard movement/strikes/jump, pause/resume, return to selection, 1440/390/320/844 layouts');
  if (publicMatch) await libraryNavigation(page, report);
}

async function publicPixelCostumes(page, report) {
  await page.locator('#duel-skin').selectOption('resort');
  await page.locator('#duel-opponent-skin').selectOption('resort');
  assert.ok((await state(page)).fighters.every(f => f.skin === 'resort'));
  await capture(page, report, '09-production-resort-selection');
  await page.getByRole('button', { name: /栞栞.*SHIORI/ }).click();
  await page.locator('#duel-skin').selectOption('original');
  await page.locator('#duel-opponent').selectOption('sui');
  await page.locator('#duel-opponent-skin').selectOption('original');
  await start(page, 'training');
  await keys(page, ['KeyU'], 300);
  assert.ok((await state(page)).projectiles.some(p => p.side === 0), 'public Shiori shortcut creates a travelling wave');
  await capture(page, report, '10-production-original-wave');
  await button(page, '重置站位').click();
  await keys(page, ['KeyS', 'KeyU'], 160);
  const rise = await state(page);
  assert.equal(rise.fighters[0].move, 'reversal');
  assert.equal(rise.fighters[0].meter, 75, 'public reversal spends 25 energy');
  await capture(page, report, '11-production-reversal');
  await returnToMenu(page);
  await page.locator('#duel-opponent').selectOption('shiori');
  await page.locator('#duel-opponent-skin').selectOption('resort');
  await start(page, 'training');
  const mirror = await state(page);
  assert.ok(mirror.fighters.every(f => f.character === 'shiori'));
  assert.deepEqual(mirror.fighters.map(f => f.skin), ['original', 'resort']);
  await capture(page, report, '12-production-costume-mirror');
  await returnToMenu(page);
  await page.getByRole('button', { name: /岁己.*SUI/ }).click();
  await page.locator('#duel-skin').selectOption('original');
  await page.locator('#duel-opponent-skin').selectOption('original');
  report.checks.push('Production original defaults, both optional costumes, independent Shiori costume mirror, real travel-wave and 25-energy reversal via public controls');
}

async function libraryNavigation(page, report) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: /游戏大厅/ }).click();
  await page.waitForURL('**/demos');
  await page.getByRole('searchbox', { name: '搜索游戏' }).fill('格斗');
  await page.waitForURL(current => current.searchParams.get('q') === '格斗');
  const entries = page.locator('[data-game]');
  assert.ok((await entries.evaluateAll(elements => elements.map(el => el.dataset.game))).includes('/game/tidal-duel'), 'fighting search finds the renamed game');
  assert.equal(await page.locator('[data-game="/game/beach-volley"]').count(), 0, 'volleyball remains distinct from fighting');
  const fighting = page.locator('[data-game="/game/tidal-duel"]');
  await fighting.scrollIntoViewIfNeeded();
  await fighting.locator('img').evaluate(el => el.decode());
  const poster = await fighting.locator('img').evaluate(el => ({ src: el.currentSrc, loaded: el.complete && el.naturalWidth > 0, width: el.naturalWidth, height: el.naturalHeight }));
  assert.ok(poster.loaded, 'game hall poster decodes');
  assert.ok(decodeURIComponent(poster.src).includes('/games/tidal-duel/poster.webp'), 'hall uses the new fighting poster');
  const resource = await page.request.get(new URL('/games/tidal-duel/poster.webp', url).href);
  assert.equal(resource.status(), 200, 'production serves game poster');
  assert.match(resource.headers()['content-type'], /image\/webp/);
  assert.ok((await resource.body()).length > 5000, 'poster is a real image asset');
  await fighting.scrollIntoViewIfNeeded();
  const file = path.join(output, '08-production-hall.png');
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  report.screenshots.push({ name: '08-production-hall', file, pixels, entries: await entries.evaluateAll(elements => elements.map(el => ({ href: el.dataset.game, text: el.textContent }))), poster });
  await fighting.getByRole('link', { name: '打开 潮夜格斗 · 岁己 vs 栞栞', exact: true }).click();
  await page.waitForURL('**/game/tidal-duel');
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
  assert.equal((await state(page)).phase, 'menu', 'hall fighter link opens character selection');
  report.checks.push('Production hall fighting search finds 潮夜格斗 independently of volleyball; new WebP poster serves and decodes; fighter link opens playable selection');
}

async function development(page, browser, report) {
  await capture(page, report, '01-desktop-menu');
  await button(page, '静音').click();
  assert.equal(await button(page, '开启声音').getAttribute('aria-pressed'), 'true', 'mute control reflects silent state');
  await page.waitForFunction(() => localStorage.getItem('tidal-duel-muted') === 'true');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.tidalDuel && JSON.parse(window.render_game_to_text()).assetsReady);
  await page.evaluate(() => window.tidalDuel.manual(true));
  try {
    await button(page, '开启声音').waitFor({ state: 'visible', timeout: 4000 });
    assert.ok(await button(page, '开启声音').isVisible(), 'mute preference survives a reload');
    await button(page, '开启声音').click();
  } catch (error) {
    report.failures.push({ check: 'mute preference survives reload', message: error.message });
  }
  await button(page, '玩法').click();
  assert.ok(await page.locator('canvas').evaluate(el => el.closest('main').parentElement.inert), 'rules prevent background controls from receiving input');
  await page.keyboard.press('Tab');
  assert.ok(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), 'rules retain keyboard focus');
  await capture(page, report, '02-desktop-help');
  await dismissHelp(page);
  await start(page, 'training');
  await capture(page, report, '03-desktop-fight');
  const practice = await state(page);
  const trainingTimer = practice.timeRemaining;
  await advance(page, 8000);
  assert.equal((await state(page)).timeRemaining, trainingTimer, 'practice has no countdown');
  assert.equal((await state(page)).fighters[1].x, practice.fighters[1].x, 'standing training dummy remains stationary');
  await button(page, '重置站位').click();
  assert.ok((await state(page)).fighters.every(fighter => fighter.hp === 300 && fighter.meter === 100), 'practice reset restores health and super meter');
  report.checks.push('Mute preference survives reload, rules isolate background and contain focus; training dummy is stationary with no countdown and reset restores resources');
  await returnToMenu(page); await start(page, 'local');
  assert.equal((await state(page)).mode, 'local', 'menu launches same-device versus');

  await rig(page, { positions: [420, 880] });
  let before = await state(page);
  await keys(page, [P1.right], 300);
  let after = await state(page);
  assert.ok(after.fighters[0].x > before.fighters[0].x + 60, '1P keyboard movement');
  assert.equal(after.fighters[1].x, before.fighters[1].x, '1P movement does not move 2P');
  await keys(page, [P1.jump], 180);
  assert.ok((await state(page)).fighters[0].y < 580, 'jump leaves the floor');
  await advance(page, 1100);
  await keys(page, [P1.crouch], 20);
  // Inspect while held, because release correctly returns to idle.
  await page.keyboard.down(P1.crouch); await advance(page, 20);
  assert.equal((await state(page)).fighters[0].state, 'crouch');
  await page.keyboard.up(P1.crouch); await advance(page, 20);
  await page.keyboard.down(P1.guard); await advance(page, 20);
  assert.equal((await state(page)).fighters[0].state, 'walk', 'holding back still retreats at range');
  await page.keyboard.up(P1.guard); await advance(page, 20);
  await rig(page);
  await keys(page, [P1.hold], 25);
  assert.equal((await state(page)).fighters[0].state, 'hold', 'keyboard opens a hold counter window');
  await rig(page);
  await page.keyboard.down(P1.jump); await advance(page, 50);
  for (const code of P1.hold) await page.keyboard.down(code); await advance(page, 30);
  await page.keyboard.up(P1.jump); for (const code of P1.hold) await page.keyboard.up(code); await advance(page, 10);
  after = await state(page);
  assert.equal(after.fighters[0].state, 'hold', 'W then light-heavy within chord grace opens high hold');
  assert.equal(after.fighters[0].holdHeight, 'high');
  assert.equal(after.fighters[0].y, 610, 'high counter chord stays grounded');
  await rig(page);
  for (const code of P1.hold) await page.keyboard.down(code); await advance(page, 50);
  await page.keyboard.down(P1.jump); await advance(page, 30);
  await page.keyboard.up(P1.jump); for (const code of P1.hold) await page.keyboard.up(code); await advance(page, 10);
  assert.equal((await state(page)).fighters[0].holdHeight, 'high', 'light-heavy then W within chord grace also reads high');
  await rig(page);
  await keys(page, [P1.sidestep], 100);
  assert.ok(Math.abs((await state(page)).fighters[0].z) > 0.38, 'keyboard sidestep leaves the strike line');
  report.checks.push('Real modern keyboard movement, jump, crouch, retreat, hold and sidestep states; high counter accepts either order with a 50 ms direction/chord gap');

  await rig(page);
  await keys(page, [P1.punch], 140);
  after = await state(page);
  assert.ok(after.fighters[1].hp < after.fighters[1].maxHp, 'punch connects');
  const punchDamage = after.fighters[1].maxHp - after.fighters[1].hp;
  await rig(page);
  await keys(page, [P1.kick], 240);
  after = await state(page);
  assert.ok(after.fighters[1].maxHp - after.fighters[1].hp > punchDamage, 'kick connects with heavier damage');
  await rig(page);
  await keys(page, [P1.crouch, P1.kick], 260);
  assert.equal((await state(page)).fighters[0].move, 'lowKick', 'crouch changes strike height');
  assert.ok((await state(page)).fighters[1].hp < 300, 'low kick connects');
  await rig(page);
  await keys(page, [P1.punch], 220);
  await keys(page, [P1.punch], 240);
  await keys(page, [P1.kick], 300);
  after = await state(page);
  assert.equal(after.fighters[0].move, 'launcher', 'J → J → K produces the advertised launcher sequence');
  assert.ok(after.fighters[0].combo >= 3, 'buffered followups retain the combo');
  assert.ok(after.fighters[1].y < 610 && after.fighters[1].state === 'launch', 'launcher visibly lifts the opponent');
  report.checks.push('Punch, heavier kick, crouching low strike and buffered J → J → K launcher connect through actual keyboard input');

  await rig(page);
  await input(page, 1, 'guard', true);
  await keys(page, [P1.kick], 240);
  after = await state(page);
  assert.ok(after.fighters[1].hp > 290, 'guard reduces strike damage');
  assert.ok(after.events.some(event => event.type === 'block'), 'guard produces a block event');
  await rig(page);
  await input(page, 1, 'hold', true); await advance(page, 20);
  await keys(page, [P1.kick], 240);
  after = await state(page);
  assert.equal(after.fighters[1].hp, 300, 'matching mid hold prevents incoming kick');
  assert.ok(after.fighters[0].hp < 300, 'hold reverses damage to attacker');
  assert.ok(after.events.some(event => event.type === 'hold'), 'counter produces hold event');
  await rig(page);
  await input(page, 1, 'jump', true); await input(page, 1, 'hold', true); await advance(page, 20);
  await keys(page, [P1.punch], 140);
  after = await state(page);
  assert.equal(after.fighters[1].hp, 300, 'high hold catches a high punch');
  assert.ok(after.fighters[0].hp < 300, 'high hold reverses punch damage');
  await rig(page);
  await input(page, 1, 'crouch', true); await input(page, 1, 'hold', true); await advance(page, 20);
  await keys(page, [P1.crouch, P1.punch], 180);
  after = await state(page);
  assert.equal(after.fighters[1].hp, 300, 'low hold catches crouching punch');
  assert.ok(after.fighters[0].hp < 300, 'low hold reverses low strike damage');
  await rig(page);
  await input(page, 1, 'hold', true); await advance(page, 20);
  await keys(page, [P1.throw], 390);
  after = await state(page);
  assert.ok(after.fighters[1].hp < 260, 'throw punishes a committed hold');
  assert.ok(after.events.some(event => event.type === 'throw'), 'throw event identifies punish');
  await rig(page);
  await input(page, 1, 'throw', true);
  await keys(page, [P1.punch], 160);
  after = await state(page);
  assert.equal(after.fighters[0].hp, 300, 'fast strike interrupts throw');
  assert.ok(after.fighters[1].hp < 300, 'interrupted throw takes strike damage');
  report.checks.push('Tactical triangle and height reads: guard blocks strike, high/mid/low holds reverse matching strikes, throw punishes hold, strike interrupts throw');

  await rig(page);
  await input(page, 1, 'sidestep', true); await advance(page, 100);
  await keys(page, [P1.punch], 140);
  assert.equal((await state(page)).fighters[1].hp, 300, 'sidestep evades linear punch');
  await rig(page);
  await input(page, 1, 'sidestep', true); await advance(page, 100);
  await keys(page, [P1.kick], 240);
  assert.ok((await state(page)).fighters[1].hp < 300, 'tracking kick beats sidestep');
  report.checks.push('Depth movement evades a linear attack while a tracking kick catches sidestep');

  await rig(page, { meter: 100 });
  await keys(page, [P1.special], 600);
  after = await capture(page, report, '04-sui-special');
  assert.equal(after.fighters[0].meter, 0, 'super spends full meter');
  assert.ok(after.fighters[1].hp < 240, 'Sui super connects');
  await keys(page, [P1.special], 60);
  assert.equal((await state(page)).fighters[0].meter, 0, 'super cannot be repeated without a new charge');
  await rig(page, { meter: 100, characters: ['shiori', 'sui'] });
  await keys(page, [P1.special], 600);
  after = await state(page);
  assert.equal(after.fighters[0].character, 'shiori');
  assert.equal(after.fighters[0].meter, 0);
  assert.ok(after.fighters[1].hp < 240, 'Shiori super connects');
  await rig(page, { meter: 99 });
  await keys(page, [P1.special], 100);
  assert.equal((await state(page)).fighters[0].move, null, 'special requires a complete meter');
  report.checks.push('Both playable fighters execute distinct supers and meter cannot be spent twice');

  await rig(page, { positions: [410, 920] });
  before = await state(page);
  await keys(page, ['ArrowLeft'], 260);
  after = await state(page);
  assert.ok(after.fighters[1].x < before.fighters[1].x - 45, '2P arrow movement');
  assert.equal(after.fighters[0].x, before.fighters[0].x, '2P arrow controls are independent');
  await rig(page);
  await keys(page, ['Digit1'], 140);
  after = await state(page);
  assert.ok(after.fighters[0].hp < 300, '2P number-row punch damages 1P');
  assert.equal(after.fighters[1].hp, 300, '2P number-row punch does not trigger 1P action');
  await button(page, '暂停').click();
  const paused = await state(page);
  await keys(page, [P1.right, 'ArrowLeft', P1.punch], 900);
  assert.deepEqual((await state(page)).fighters, paused.fighters, 'pause freezes both fighters and ignores battle input');
  assert.equal((await state(page)).timeRemaining, paused.timeRemaining, 'pause freezes countdown');
  await capture(page, report, '05-desktop-pause');
  await button(page, '返回选人').last().click();
  assert.ok(await page.getByRole('dialog').isVisible(), 'leaving an active fight asks before clearing its score');
  await button(page, '留在擂台').click();
  assert.deepEqual((await state(page)).fighters, paused.fighters, 'cancelling return preserves the fight');
  await button(page, '继续对决').click();
  await button(page, '玩法').click();
  const help = await state(page); await advance(page, 600);
  assert.equal(help.paused, true, 'help pauses an active fight');
  assert.equal((await state(page)).timeRemaining, help.timeRemaining, 'help freezes timer');
  await dismissHelp(page);
  assert.equal((await state(page)).paused, true, 'closing rules waits for explicit resume');
  await button(page, '继续对决').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state(page)).paused, true, 'losing focus pauses');
  await button(page, '继续对决').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  assert.equal((await state(page)).paused, true, 'background visibility pauses');
  await button(page, '继续对决').click();
  report.checks.push('Independent local 2P controls, pause input cleanup, rules freeze, focus and background pause');

  await rig(page, { positions: [300, 1050] });
  await keys(page, [P1.punch], 100);
  await page.keyboard.down(P1.punch); await advance(page, 20); await page.keyboard.up(P1.punch);
  assert.ok(await page.evaluate(() => window.tidalDuel.game().fighters[0].buffer.length > 0), 'followup is genuinely queued before pause');
  await button(page, '暂停').click();
  assert.equal(await page.evaluate(() => window.tidalDuel.game().fighters[0].buffer.length), 0, 'pause clears a pending combo input');
  await button(page, '继续对决').click(); await advance(page, 100);
  assert.equal((await state(page)).fighters[0].move, 'punch', 'resume cannot fire the cancelled punch2 followup');
  await advance(page, 500); assert.equal((await state(page)).fighters[0].move, null);
  report.checks.push('A queued combo followup is cancelled by pause and cannot fire on resume');
  await gamepadControls(page, report);

  await rig(page, { hp: [220, 90], timer: 0.01 });
  await advance(page, 60);
  after = await state(page);
  assert.equal(after.phase, 'roundEnd');
  assert.deepEqual(after.wins, [1, 0], 'time-out awards higher-health fighter');
  await advance(page, 4100);
  assert.equal((await state(page)).round, 2, 'round presentation advances to next round');
  assert.equal((await state(page)).phase, 'fight');
  await rig(page, { hp: [180, 180], timer: 0.01 });
  await advance(page, 60);
  after = await state(page);
  assert.equal(after.phase, 'roundEnd');
  assert.deepEqual(after.wins, [0, 0], 'equal-health timeout is a draw without a win');
  await rig(page, { hp: [300, 1], wins: [1, 0] });
  await keys(page, [P1.kick], 260); await advance(page, 3800);
  after = await capture(page, report, '06-desktop-result');
  assert.equal(after.phase, 'result');
  assert.equal(after.winner, 0);
  assert.deepEqual(after.wins, [2, 0], 'best-of-three match requires two rounds');
  await button(page, '再战一场 ↗').click(); await advance(page, 3400);
  assert.deepEqual((await state(page)).wins, [0, 0], 'rematch resets score');
  assert.equal((await state(page)).round, 1, 'rematch resets round');
  await returnToMenu(page);
  await page.getByRole('button', { name: /栞栞.*SHIORI/i }).click();
  await start(page, 'solo');
  after = await state(page);
  assert.equal(after.fighters[0].character, 'shiori', 'character selection determines player roster entry');
  before = after; await advance(page, 5000); after = await state(page);
  assert.ok(after.fighters[1].x !== before.fighters[1].x || after.fighters[1].hp !== before.fighters[1].hp
    || after.fighters[0].hp !== before.fighters[0].hp, 'solo AI approaches or attacks the player');
  await returnToMenu(page);
  await page.locator('#duel-opponent').selectOption('shiori');
  await start(page, 'local');
  assert.deepEqual((await state(page)).fighters.map(fighter => fighter.character), ['shiori', 'shiori'], 'opponent selector supports a playable mirror match');
  await returnToMenu(page);
  await page.getByRole('button', { name: /岁己.*SUI/i }).click();
  report.checks.push('Timeout health decision and draw, KO, first-to-two match, rematch reset, Shiori selection, live solo AI and opponent-selected mirror match');

  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, report, '07-phone-menu');
  await start(page, 'training');
  await portraitHud(page, report);
  await capture(page, report, '08-phone-fight');
  await page.setViewportSize({ width: 320, height: 740 });
  await portraitHud(page, report);
  await capture(page, report, '09-small-fight');
  await page.setViewportSize({ width: 844, height: 390 });
  await capture(page, report, '10-landscape-fight');
  report.checks.push('390px portrait and 320px small portrait have readable native names/time/health/meter above the compact canvas; 844px landscape and all layouts have no horizontal overflow');

  await realTouch(browser, report);
}

async function portraitHud(page, report) {
  const hud = page.getByLabel('对战状态', { exact: true });
  await hud.waitFor({ state: 'visible' });
  const text = await state(page);
  const info = await hud.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { text: el.innerText, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      bold: [...el.querySelectorAll('b')].map(node => ({ text: node.textContent, fontSize: parseFloat(getComputedStyle(node).fontSize) })),
      health: [...el.querySelectorAll('[class*="mobileHealth"] > i')].map(node => ({ width: node.clientWidth, height: node.clientHeight })),
      guard: [...el.querySelectorAll('[class*="mobileGuard"] > i')].map(node => ({ width: node.clientWidth, height: node.clientHeight })) };
  });
  for (const fighter of text.fighters) {
    assert.ok(info.text.includes(fighter.name), 'portrait HUD shows readable character names');
    assert.ok(info.text.includes(`${Math.round(fighter.hp)} / 300`), 'portrait HUD health matches public state');
    assert.ok(info.text.includes(`气势 ${Math.round(fighter.meter)}%`), 'portrait HUD meter matches public state');
  }
  assert.ok(info.text.includes('∞'), 'practice portrait HUD displays unlimited time');
  assert.ok(info.bold[0].fontSize >= 12 && info.bold[2].fontSize >= 12 && info.bold[1].fontSize >= 20, 'portrait HUD does not scale names and timer down with the canvas');
  assert.equal(info.health.length, 2, 'portrait has one health bar per fighter');
  assert.ok(info.health.every(bar => bar.width > 30 && bar.height >= 4), 'portrait health bars remain visible');
  assert.equal(info.guard.length, 2, 'portrait has one guard gauge per fighter');
  assert.ok(info.guard.every(bar => bar.width > 30 && bar.height >= 2), 'portrait guard gauges remain visible');
  const canvas = await page.locator('canvas').boundingBox();
  assert.ok(info.rect.y + info.rect.height <= canvas.y + 1, 'portrait HUD leaves the playfield unobstructed');
  (report.portraitHud ||= []).push(info);
}

async function gamepadControls(page, report) {
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
    window.__qaPads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__qaPads });
    window.__qaRestorePads = () => {
      if (descriptor) Object.defineProperty(navigator, 'getGamepads', descriptor);
      else delete navigator.getGamepads;
      delete window.__qaPads;
    };
  });
  async function padScenario(pads, condition, expected, options = {}) {
    await rig(page, { positions: [300, 1050], ...options });
    await page.evaluate(pads => {
      window.__qaPads = pads.map((pad, index) => ({ id: `QA standard pad ${index + 1}`, index, connected: true,
        mapping: 'standard', axes: pad.axes || [0, 0],
        buttons: Array.from({ length: 16 }, (_, buttonIndex) => ({ pressed: (pad.buttons || []).includes(buttonIndex), value: (pad.buttons || []).includes(buttonIndex) ? 1 : 0 })) }));
      window.tidalDuel.manual(false);
    }, pads);
    try {
      await page.waitForFunction(condition, expected, { timeout: 4000 });
    } finally {
      await page.evaluate(() => window.tidalDuel.manual(true));
    }
  }
  try {
    await padScenario([{ axes: [1, 0] }, { axes: [-1, 0] }], () => {
      const s = JSON.parse(window.render_game_to_text());
      return s.fighters[0].x > 330 && s.fighters[1].x < 1020;
    });
    await padScenario([{ buttons: [0] }, { buttons: [2] }], () => {
      const s = JSON.parse(window.render_game_to_text());
      return s.fighters[0].move === 'punch' && s.fighters[1].move === 'kick';
    });
    for (const [indices, expectedState] of [[[0, 3], 'hold'], [[2, 3], 'sidestep']]) {
      await padScenario([{ buttons: indices }, { buttons: indices }], expectedState =>
        JSON.parse(window.render_game_to_text()).fighters.every(fighter => fighter.state === expectedState), expectedState);
    }
    await padScenario([{ buttons: [4] }, { buttons: [4] }], () =>
      JSON.parse(window.render_game_to_text()).fighters.every(fighter => fighter.move === 'throw'));
    await padScenario([{ axes: [0, -1] }, { axes: [0, 1] }], () => {
      const s = JSON.parse(window.render_game_to_text());
      return s.fighters[0].y < 600 && s.fighters[1].state === 'crouch';
    });
    await padScenario([{ buttons: [3, 1] }, {}], () => {
      const s = JSON.parse(window.render_game_to_text());
      return s.fighters[0].move === 'super' && s.fighters[0].meter === 0;
    }, undefined, { meter: 100 });
    report.checks.push('Modern gamepad polling with browser getGamepads stub: both pads move, A/X strike, A+Y hold, X+Y sidestep, LB throw, vertical axis jump/crouch and Y+B super');
  } finally {
    await page.evaluate(() => { window.__qaPads = []; window.tidalDuel.manual(false); });
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.tidalDuel.manual(true); window.__qaRestorePads(); delete window.__qaRestorePads; });
    await rig(page, { positions: [440, 840] });
  }
}

async function publicVersus(page, report) {
  await button(page, '同机双人').click(); await page.locator('#tidal-start').click();
  await advance(page, 1700);
  let rounds = 0;
  for (let action = 0; action < 64; action++) {
    let current = await state(page);
    if (current.phase === 'result') break;
    if (current.phase === 'roundEnd' || current.phase === 'intro') {
      rounds++; await advance(page, 4000); continue;
    }
    assert.equal(current.phase, 'fight', 'public match remains in a playable or round state');
    const gap = current.fighters[1].x - current.fighters[0].x;
    if (gap > 140) {
      await keys(page, [P1.right], Math.min(1300, (gap - 115) / 294 * 1000));
      current = await state(page);
    }
    await keys(page, [current.fighters[0].meter >= 100 ? P1.special : P1.kick], 850);
    await advance(page, 500);
  }
  const result = await capture(page, report, '04-public-match-result');
  assert.equal(result.phase, 'result', 'public controls finish a complete match');
  assert.equal(result.winner, 0);
  assert.deepEqual(result.wins, [2, 0], 'public controls win two rounds');
  assert.equal(result.fighters[1].hp, 0, 'public match ends through real KO rather than injected state or timeout');
  assert.ok(rounds >= 1, 'public match passes through the natural round transition');
  await button(page, '再战一场 ↗').click(); await advance(page, 1700);
  assert.deepEqual((await state(page)).wins, [0, 0], 'production rematch resets real score');
  await returnToMenu(page);
  report.checks.push('Production complete local match through public movement/kick/super inputs: two real KOs, natural rounds, match result and rematch reset; no developer hooks');
}

async function input(page, side, action, down) {
  await page.evaluate(({ side, action, down }) => window.tidalDuel.input(side, action, down), { side, action, down });
}

async function rig(page, options = {}) {
  await page.evaluate(({ options, actions }) => {
    const g = window.tidalDuel.game();
    g.phase = 'fight'; g.phaseTime = 0; g.paused = false; g.freeze = 0; g.super = null;
    g.options.mode = 'local'; g.roundTimer = options.timer ?? 60;
    g.round = options.round ?? 1; g.wins = options.wins ?? [0, 0]; g.winner = null;
    g.events = []; g.camera.shake = 0; g.projectiles = []; g.grabs = [];
    const clear = Object.fromEntries(actions.map(action => [action, false]));
    for (let side = 0; side < 2; side++) {
      for (const action of actions) window.tidalDuel.input(side, action, false);
      Object.assign(g.fighters[side], {
        x: options.positions?.[side] ?? [565, 655][side], y: 610, z: 0, vx: 0, vy: 0,
        facing: side === 0 ? 1 : -1, hp: options.hp?.[side] ?? 300, maxHp: 300,
        meter: side === 0 ? options.meter ?? 0 : 0, state: 'idle', stateTime: 0,
        stateDuration: 0, move: null, moveTime: 0, moveHit: false, combo: 0, comboDamage: 0,
        comboTime: 0, stun: 0, critical: 0, juggle: 0, invincible: 0, holdHeight: 'mid',
        holdCooldown: 0, stepCooldown: 0, buffer: [], previous: { ...clear },
        aiTimer: 0, aiPlan: { ...clear }, lastDamage: 0,
        contact: 'none', guardGauge: 100, guardDelay: 0, burstReady: true, throwTech: 0, directions: [], history: [], assisted: null,
        airAttacks: 0, airRank: 0, airLanding: 0,
      });
      if (options.characters) g.fighters[side].character = options.characters[side];
    }
  }, { options, actions });
  await advance(page, 0);
}

async function realTouch(browser, report) {
  const context = await quietContext(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await open(page, report);
  await start(page, 'local');
  await rig(page, { positions: [300, 1050] });
  const cdp = await context.newCDPSession(page);
  async function point(action, id) {
    const box = await page.locator(`[data-control="0-${action}"]`).boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, `touch ${action} control is visible`);
    return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  const right = await point('right', 1); const punch = await point('light', 2);
  const before = await state(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right, punch] });
  await advance(page, 160);
  let after = await state(page);
  assert.equal(after.fighters[0].move, 'punch', 'real simultaneous touch launches punch');
  await advance(page, 420); after = await state(page);
  assert.ok(after.fighters[0].x > before.fighters[0].x, 'real simultaneous touch keeps moving after attack recovery');
  // CDP touchEnd lists the fingers being lifted, not the remaining fingers.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [punch] });
  await advance(page, 650); const held = (await state(page)).fighters[0].x;
  await advance(page, 150);
  assert.ok((await state(page)).fighters[0].x > held + 15, 'releasing punch preserves held movement finger');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 350); const stopped = (await state(page)).fighters[0].x;
  await advance(page, 350);
  assert.equal((await state(page)).fighters[0].x, stopped, 'native pointercancel releases movement without sticking');
  const jump = await point('jump', 3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [jump] });
  await advance(page, 180);
  assert.ok((await state(page)).fighters[0].y < 580, 'touch jump leaves floor');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await capture(page, report, '11-real-touch');
  await button(page, '全屏').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.ok(await page.evaluate(() => !!document.fullscreenElement), 'real full-screen entry');
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await rig(page, { hp: [300, 1], wins: [1, 0] });
  const kick = await point('medium', 4);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [kick] });
  await advance(page, 260);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await advance(page, 3800);
  assert.equal((await state(page)).phase, 'result', 'touch attack can finish match');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, report, '12-phone-result');
  report.checks.push('Installed Chrome native two-finger movement + punch, independent finger release, pointercancel, touch jump, full-screen and portrait result');
  await context.close();
}

async function run(headless, captureRetry = false) {
  const report = { url, mode: gamepadOnly ? 'development-gamepad' : publicMatch ? 'production-public-match' : smokeOnly ? 'production-smoke' : 'development-full',
    browser: { channel: 'chrome', headless, muted: true }, captureRetry,
    started: new Date().toISOString(), checks: [], screenshots: [], errors: [], failures: [], status: 'running' };
  fs.mkdirSync(output, { recursive: true });
  let browser;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'dev-server URL responds before browser launch');
    browser = await chromium.launch({ channel: 'chrome', headless,
      args: ['--mute-audio', '--disable-speech-api'] });
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await open(page, report, !smokeOnly && !publicMatch);
    if (gamepadOnly) {
      await start(page, 'local'); await gamepadControls(page, report); await capture(page, report, '01-gamepad');
    } else if (smokeOnly || publicMatch) await smoke(page, report);
    else await development(page, browser, report);
    assert.deepEqual(report.errors, [], 'no console or page errors');
    assert.deepEqual(report.failures, [], 'all user behavior checks pass');
    report.status = 'passed';
    console.log(JSON.stringify({ status: report.status, checks: report.checks,
      screenshots: report.screenshots.map(({ name, file, pixels }) => ({ name, file, pixels })),
      errors: report.errors }, null, 2));
  } catch (error) {
    report.status = 'failed';
    report.failure = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser?.close();
  }
}

(async () => {
  const headless = process.env.HEADED !== '1' && process.env.TIDAL_DUEL_HEADED !== '1';
  try {
    await run(headless);
  } catch (error) {
    if (!(error instanceof CaptureFailure) || !headless) throw error;
    console.error(`Screenshot sanity check rejected a headless capture; retrying the same suite in headed installed Chrome: ${error.message}`);
    await run(false, true);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
