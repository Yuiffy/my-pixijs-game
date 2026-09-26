const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3877';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-3d';
const images = []; const errors = [];
const results = [];
const capturedActions = new Set();
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
async function capture(page, name) {
  const file = path.join(out, `${name}.png`);
  const s = await state(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height] }));
  assert.ok(layout.scrollWidth <= layout.width + 1, JSON.stringify(layout));
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  assert.match(s.renderer.type, /WebGL/);
  assert.ok(s.renderer.triangles > 0 && s.renderer.calls > 0, 'WebGL must actually submit geometry, including sparse views of the door');
  images.push({ file, pixels, layout, state: s });
}
async function follow(page) {
  await page.locator('[data-assist="goal"]').click();
  await page.evaluate(() => {
    for (let i = 0; i < 1000; i++) {
      window.advanceTime(40);
      const s = JSON.parse(window.render_game_to_text());
      if (!s.path.length || s.phase !== 'playing') break;
    }
    window.advanceTime(650);
  });
  await page.waitForTimeout(150);
  await advance(page, 0);
}
async function hold(page, photograph) {
  const a = (await state(page)).action;
  assert.ok(a.key, JSON.stringify(await state(page)));
  if (a.mode === 'minigame') {
    await page.keyboard.press('e'); await advance(page,60);
    if (photograph) await capture(page,photograph);
    for(let i=0;i<10&&(await state(page)).delta?.active;i++) {
      await page.locator('[data-delta-target]').click(); await advance(page,120);
    }
    assert.ok((await state(page)).done.includes('delta'));
  } else if (a.mode === 'tap') {
    await page.keyboard.press('e'); await advance(page,a.seconds*500);
    if(photograph) await capture(page,photograph);
    await advance(page,a.seconds*500+100);
  } else {
    await page.keyboard.down('e');await advance(page,a.seconds*500);
    if(photograph) await capture(page,photograph);
    await advance(page,a.seconds*500+100);await page.keyboard.up('e');await advance(page,50);
  }
}
async function cover(page) {
  const s = await state(page);
  if (s.focus === 'partner' && s.cooldown === 0) { await page.keyboard.press('m'); await advance(page, 0); return; }
  if (s.action.seconds > 7) return;
  if (s.broadcast.music && s.broadcast.remaining >= s.action.seconds + .2) return;
  await advance(page, ((s.broadcast.music ? s.broadcast.remaining + 15 : s.broadcast.remaining) + .1) * 1000);
}
async function timing(page, touch = false) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      for (let n = 0; n < 150; n++) {
        const d = JSON.parse(window.render_game_to_text()).daily;
        const p = (Math.sin(d.clock * 2.2 - Math.PI / 2) + 1) / 2;
        if (p > .42 && p < .58 && d.cooldown <= 0) break;
        window.advanceTime(25);
      }
    });
    const button = page.locator('[data-daily-timing]');
    if (touch) await button.tap(); else await button.click();
  }
  assert.equal((await state(page)).daily.panel, null);
}
async function activity(page, photos = false) {
  const s = await state(page), d = s.daily;
  if (!d) return false;
  const photograph = async name => { if (photos && !capturedActions.has(name)) { await capture(page, name); capturedActions.add(name); } };
  if (d.panel === 'lock' || d.panel === 'cook') {
    await photograph('activity-' + d.panel); await timing(page); return true;
  }
  if (d.panel === 'leisure') {
    await advance(page, 3200); assert.ok((await state(page)).daily.unread);
    await photograph('wechat'); await page.getByRole('button', {name:'回复：收到，戴耳机啦'}).click();
    await advance(page, 5000);
    await page.getByRole('button', {name:'收起手机，在沙发上小睡 →'}).click(); return true;
  }
  if (d.stage === 'sleep') {
    assert.ok(s.player.x < 506, 'sleep must happen in the living room');
    if (photos) await page.waitForTimeout(1550);
    await photograph('sofa-sleep'); await advance(page, 3300); return true;
  }
  if (d.panel === 'story') {
    await photograph('story-' + d.after);
    await page.getByRole('button', {name: d.after === 'rice' ? '拿两把勺子，一起吃' : '拿干毛巾，帮你擦头发'}).click();
    await advance(page, 100); return true;
  }
  return false;
}
async function reachAction(page, key) {
  for (let i = 0; i < 35; i++) {
    if (await activity(page)) continue;
    let s = await state(page);
    if (s.objective.key === key && s.action.key === key && s.focus === s.objective.spot) return;
    await follow(page); s = await state(page);
    if (s.objective.key === key && s.action.key === key) return;
    if (s.action.key !== s.objective.key) continue;
    if (['food', 'hug', 'kiss', 'pickup-charger'].includes(s.action.key)) await cover(page);
    await hold(page);
  }
  throw Error('Could not reach ' + key + ': ' + JSON.stringify(await state(page)));
}
async function virtualPointerLock(context) {
  // Test-only browser API substitute: never captures the user's system cursor.
  await context.addInitScript(() => {
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', {get: () => locked});
    Element.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
    document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  });
}
async function solve(page, photos = false) {
  const initial = await state(page);
  const photographed = new Set();
  for (let i = 0; i < 40; i++) {
    let s = await state(page);
    if (s.phase === 'result') { assert.ok(s.won, JSON.stringify(s)); results.push({ level: s.level, seed: s.seed, score: s.totalScore, peak: s.peak, elapsed: s.elapsed }); return; }
    if (await activity(page, photos)) continue;
    const requested = s.objective.spot;
    if (s.action.key !== s.objective.key || s.focus !== s.objective.spot) await follow(page);
    s = await state(page);
    if (s.objective.spot !== requested) continue; // Entering the living room can reveal the next door-closing step.
    if (s.action.key !== s.objective.key || !s.action.key) { await capture(page, `stalled-${s.level}-${i}`); throw new Error(`Cannot interact after following: ${JSON.stringify(s)}`); }
    if (['pickup-charger', 'food', 'hug', 'kiss'].includes(s.action.key)) await cover(page);
    const key = s.action.key;
    if (photos && key === 'discover' && !capturedActions.has('after-' + s.daily.after)) { await capture(page, 'after-' + s.daily.after); capturedActions.add('after-' + s.daily.after); }
    const photograph = photos && !['door', 'finish', 'discover', 'leisure', 'sleep'].includes(key) && !capturedActions.has(key) ? `night-${s.level + 1}-${key}` : undefined;
    await hold(page, photograph); photographed.add(key); if (photograph) capturedActions.add(key);
  }
  throw new Error('Night did not complete');
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/hush-live')).status, 200);
  const browser = await chromium.launch({ args: ['--mute-audio', '--disable-speech-api'], channel: 'chrome', headless: process.env.HEADED !== '1' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/game/hush-live?seed=2', { waitUntil: 'networkidle' });
    await page.locator('#hush-start').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#hush-start').disabled);
    await advance(page, 0); assert.equal(await page.getByText('NEW · 同居日常').count(), 0); await capture(page, 'ready');
    await page.locator('#hush-start').click(); await capture(page, 'first-person');
    for (let level = 0; level < 6; level++) {
      await solve(page, true); assert.equal((await state(page)).progression.unlocked, Math.min(5, level + 1)); if (level === 4) await capture(page, 'chapter-result');
      if (level < 5) { await page.getByRole('button', { name: level === 4 ? '再开一个加班夜 →' : '下一个夜晚 →' }).click(); await page.locator('#hush-start').click(); }
    }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ images, errors, results }, null, 2));
    console.log(JSON.stringify({ results, screenshots: images.map(i => i.file), errors }, null, 2));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { state, advance, follow, hold, cover, solve, timing, activity, reachAction, virtualPointerLock, capture, images, run: main };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
