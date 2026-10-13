const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const qa = require('./verify-hush-3d.cjs');
const { state, advance, follow, hold, cover, capture, images } = qa;
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:4090';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-endings';
async function story(page) {
  for (let n = 0; n < 65; n++) {
    const s = await state(page);
    if (s.daily.panel === 'story') return;
    if (await qa.activity(page)) continue;
    if (s.daily.arrival !== 'done') { await qa.timing(page); continue; }
    await follow(page);
    const next = await state(page);
    if (next.action.key !== next.objective.key) continue;
    if (['pickup-charger', 'food', 'hug', 'kiss'].includes(next.action.key)) await cover(page);
    await hold(page);
  }
  throw new Error('Could not reach the after-stream choice');
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/hush-live')).status, 200);
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const e = await loadTypescriptModule('src/components/hushLive/engine.ts');
  const seeds = Array.from({ length: 3000 }, (_, i) => i + 1);
  const supperSeed = seeds.find(seed => { const d = e.createGame(5, seed, 5).daily; return d.after === 'supper' && d.events.repair.stage === 'none' && !d.homemade && !d.outing.trip && !d.entryLock; });
  const cases = [
    { after: 'rice', seed: 2, level: 1, choice: 'together', button: '拿两把勺子，一起吃', id: 'rice-share' },
    { after: 'rice', seed: 2, level: 1, choice: 'care', button: '接过锅铲：我来，你歇着', id: 'kitchen-care' },
    { after: 'shower', seed: 1, level: 1, choice: 'together', button: '递杯温水，陪你坐一会儿', id: 'warm-water' },
    { after: 'shower', seed: 1, level: 1, choice: 'care', button: '拿干毛巾，帮你擦头发', id: 'dry-hair' },
    { after: 'supper', seed: supperSeed, level: 5, choice: 'together', button: '一起去吃烧鹅和热汤', id: 'supper-table' },
    { after: 'supper', seed: supperSeed, level: 5, choice: 'care', button: '披上外套，牵手出门', id: 'night-walk' },
  ];
  const errors = [], checks = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    for (const touch of [false, true]) for (const [i, item] of cases.entries()) {
      const skin = ['mizuki','shiori','sui','nana7mi','nana7mi','shiori'][i];
      const page = await browser.newPage({ viewport: touch ? { width: 320, height: 740 } : { width: 1280, height: 850 }, hasTouch: touch });
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(({ level, skin }) => {
        localStorage.setItem('hush-live-v1', JSON.stringify({ version: 1, unlocked: level, skin, best: [0,0,0,0,0], stars: [0,0,0,0,0], endlessBest: 0, player: '男友', partner: '她', cgs: ['host-lamp','sui-repair','nana7mi-supper','shiori-home','mizuki-computer'] }));
        if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      }, { level: item.level, skin });
      await page.goto(`${base}/game/hush-live?seed=${item.seed}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
      await advance(page, 0); await page.locator('#hush-start').click(); await story(page);
      assert.equal((await state(page)).daily.after, item.after);
      const button = page.getByRole('button', { name: item.button, exact: true });
      if (touch) await button.tap(); else await button.click();
      await advance(page, item.after === 'supper' ? 4200 : 150);
      await page.waitForTimeout(150); await advance(page, 0);
      const result = await state(page);
      assert.equal(result.won, true); assert.equal(result.endingScene.id, item.id); assert.equal(result.daily.endingChoice, item.choice);
      assert.equal(result.skin, skin); assert.equal(await page.locator(`[data-ending="${item.id}"]`).count(), 1);
      await capture(page, `${touch ? 'phone' : 'desktop'}-${item.id}`);
      checks.push({ touch, skin, id: item.id, actualNightCompleted: true });
      if (i === 1) {
        await page.getByRole('button', { name: '回忆相册 · 5/5', exact: true }).click();
        await page.getByRole('button', { name: '关闭相册', exact: true }).click();
        assert.equal((await state(page)).phase, 'result');
        assert.equal((await state(page)).endingScene.id, item.id);
        await page.getByRole('button', { name: '重玩本晚', exact: true }).click();
        assert.equal((await state(page)).phase, 'playing');
        assert.equal((await state(page)).skin, skin);
        assert.equal((await state(page)).level, item.level);
        assert.equal(await page.locator('#hush-start').count(), 0);
        await story(page); await page.getByRole('button', { name: item.button, exact: true }).click(); await advance(page, 150);
        assert.equal((await state(page)).endingScene.id, item.id);
        checks.push({ touch, replayDirect: true, galleryPreservesEnding: true });
      }
      if (i === 2) {
        await page.getByRole('button', { name: '换角色 / 选择夜晚', exact: true }).click();
        assert.equal((await state(page)).phase, 'ready');
        assert.equal(await page.locator(`[data-skin="${skin}"][aria-pressed="true"]`).count(), 1);
        await page.locator('#hush-start').click(); await story(page);
        await page.getByRole('button', { name: item.button, exact: true }).click(); await advance(page, 150);
        assert.equal((await state(page)).endingScene.id, item.id);
        checks.push({ touch, optionalSetupRetainsSkin: true });
      }
      const saved = (await state(page)).progression;
      assert.deepEqual(saved.cgs, result.progression.cgs);
      assert.ok(saved.best[item.level] >= result.progression.best[item.level] || item.level === 5);
      const nextButton = page.getByRole('button', { name: item.level === 5 ? '再开一个加班夜 →' : '下一个夜晚 →', exact: true });
      if (touch) { await nextButton.scrollIntoViewIfNeeded(); await nextButton.tap(); } else await nextButton.click();
      const next = await state(page);
      assert.equal(next.phase, 'playing'); assert.equal(next.skin, skin); assert.equal(next.level, Math.min(5, item.level + 1));
      assert.equal(await page.locator('#hush-start').count(), 0); assert.deepEqual(next.progression, saved);
      assert.equal(next.cg, null); assert.equal(next.endingScene, null);
      if (!touch && i === 0) {
        await capture(page, 'continued-next-night');
        for (let level = 2; level <= 5; level++) {
          assert.equal((await state(page)).level, level); await qa.solve(page);
          assert.equal((await state(page)).skin, skin);
          await page.getByRole('button', { name: level >= 4 ? '再开一个加班夜 →' : '下一个夜晚 →' }).click();
          assert.equal((await state(page)).phase, 'playing'); assert.equal((await state(page)).skin, skin);
        }
        await capture(page, 'continued-endless');
        await page.keyboard.press('p');
        assert.equal((await state(page)).phase, 'paused');
        await page.getByRole('button', { name: '继续今晚 →' }).click();
        assert.equal((await state(page)).phase, 'playing');
        checks.push({ sameSkinAcrossAllNights: true, endlessContinues: true, pauseAfterContinue: true });
      }
      await page.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(out + '/report.json', JSON.stringify({ checks, images, errors }, null, 2));
    console.log(JSON.stringify({ checks, images: images.map(i => i.file), errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
