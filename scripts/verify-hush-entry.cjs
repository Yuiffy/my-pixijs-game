const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, capture, images, follow, hold } = require('./verify-hush-3d.cjs');
const { activity } = require('./lib/hush-minigame-browser.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:4088';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-entry';

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/hush-live')).status, 200);
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const e = await loadTypescriptModule('src/components/hushLive/engine.ts');
  const seeds = Array.from({ length: 3000 }, (_, i) => i + 1);
  const errors = [], checks = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  async function open(level, seed, touch = false) {
    const page = await browser.newPage({ viewport: touch ? { width: 320, height: 740 } : { width: 1280, height: 850 }, hasTouch: touch });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(level => {
      localStorage.setItem('hush-live-v1', JSON.stringify({ version: 1, unlocked: level, best: [0,0,0,0,0], stars: [0,0,0,0,0], endlessBest: 0, skin: 'sui', player: '男友', partner: '她', cgs: ['host-lamp','sui-repair','nana7mi-supper','shiori-home','mizuki-computer'] }));
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
    }, level);
    await page.goto(`${base}/game/hush-live?seed=${seed}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).renderer.calls > 0);
    await advance(page, 0);
    await page.locator('#hush-start').click();
    return page;
  }
  try {
    for (const touch of [false, true]) {
      const name = touch ? 'phone' : 'desktop';
      const early = await open(1, 1, touch);
      assert.equal((await state(early)).daily.arrival, 'done');
      assert.equal(await early.getByRole('region', { name: '轻声开门小游戏' }).count(), 0);
      await capture(early, `${name}-early-room`);
      await follow(early); await hold(early);
      assert.equal((await state(early)).carry, 'food');
      await capture(early, `${name}-early-dinner`);
      await early.close();

      const late = await open(4, 1, touch);
      assert.equal((await state(late)).daily.panel, 'lock');
      await late.keyboard.press('p');
      const timer = (await state(late)).daily.arrivalTime;
      await advance(late, 4000);
      assert.equal((await state(late)).daily.arrivalTime, timer);
      await late.getByRole('button', { name: '继续今晚 →' }).click();
      await advance(late, 850);
      assert.equal(await late.locator('[data-ready="true"]').count(), 1);
      await capture(late, `${name}-late-key-lit`);
      const love = (await state(late)).love;
      const button = late.getByRole('button', { name: '轻转钥匙，推门进屋', exact: true });
      if (touch) await button.tap(); else await button.click();
      assert.equal((await state(late)).daily.arrival, 'entering');
      assert.equal((await state(late)).love, love + 4);
      await advance(late, 750);
      assert.equal((await state(late)).daily.arrival, 'done');
      assert.equal((await state(late)).player.y, 500);
      await capture(late, `${name}-late-room`);
      await late.close();
      checks.push({ touch, earlyImmediateRoom: true, foodAccessible: true, lateSingleTap: true, timingReward: true, pauseFrozen: true });
    }
    const earlyClick = await open(4, 2);
    const before = await state(earlyClick);
    await earlyClick.getByRole('button', { name: '轻转钥匙，推门进屋' }).click();
    await advance(earlyClick, 750);
    const after = await state(earlyClick);
    assert.equal(after.daily.arrival, 'done');
    assert.equal(after.love, before.love);
    assert.equal(after.suspicion, before.suspicion);
    await earlyClick.close();

    const idle = await open(4, 3);
    // Exercise the normal real-time clock as well as deterministic stepping.
    await idle.reload({ waitUntil: 'domcontentloaded' });
    await idle.waitForFunction(() => !document.querySelector('#hush-start')?.disabled);
    await idle.locator('#hush-start').click();
    await idle.waitForFunction(() => JSON.parse(window.render_game_to_text()).daily.arrival === 'done');
    await idle.getByRole('region', { name: '下班回家' }).waitFor({ state: 'hidden' });
    await advance(idle, 0);
    await capture(idle, 'idle-auto-room');
    await idle.close();

    const rareSeed = seeds.find(seed => e.createGame(5, seed, 5).daily.entryLock);
    const rare = await open(5, rareSeed);
    assert.equal((await state(rare)).daily.panel, 'lock');
    await activity(rare); assert.equal((await state(rare)).daily.arrival, 'done');
    await rare.close();
    const ordinarySeed = seeds.find(seed => { const d = e.createGame(5, seed, 5).daily; return !d.entryLock && !d.outing.trip; });
    const ordinary = await open(5, ordinarySeed);
    assert.equal((await state(ordinary)).daily.arrival, 'done'); await ordinary.close();
    const tripSeed = seeds.find(seed => e.createGame(5, seed, 5).daily.outing.trip);
    const trip = await open(5, tripSeed, true);
    assert.equal((await state(trip)).daily.arrival, 'intro');
    await activity(trip, true); await advance(trip, 3000);
    assert.equal((await state(trip)).daily.arrival, 'done');
    assert.equal((await state(trip)).daily.entryLock, false);
    assert.equal((await state(trip)).daily.outing.stage, 'to-desk');
    await capture(trip, 'trip-fast-home');
    await advance(trip, 15000); assert.equal((await state(trip)).daily.outing.stage, 'live');
    await trip.close();
    checks.push({ earlyClickNoPenalty: true, idleAutoEntry: true, rareSeed, ordinarySeed, tripSeed, tripWalkPreserved: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(out + '/report.json', JSON.stringify({ checks, images, errors }, null, 2));
    console.log(JSON.stringify({ checks, images: images.map(i => i.file), errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
