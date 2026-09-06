const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
let playwright;
for (const location of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(location); break; } catch { /* Try the next configured runtime. */ }
}
const base = process.env.ONE_MORE_URL || 'http://127.0.0.1:3821';
const directory = 'artifacts/one-more-chapter';
mkdirSync(directory, { recursive: true });

(async () => {
  assert.equal((await fetch(`${base}/game/one-more`)).status, 200);
  const { pilotInputs } = await import('./tests/helpers/one-more-pilot.mjs');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: process.env.ONE_MORE_HEADED !== '1', args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await context.addInitScript(({ decision }) => {
    window.__chapterDecision = (0, eval)(`(${decision})`);
    window.__held = new Map();
    window.__chapterInput = (action, down) => {
      const code = window.suiSparring.snapshot().bindings[action];
      if (window.__held.has(action) === down) return;
      if (down) window.__held.set(action, code); else window.__held.delete(action);
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
    };
    window.__release = () => {
      for (const [action, code] of window.__held) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
        window.__held.delete(action);
      }
    };
  }, { decision: pilotInputs.toString() });
  const page = await context.newPage();
  const errors = [];
  const failures = [];
  const captures = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) failures.push({ status: response.status(), url: response.url() }); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const step = ms => page.evaluate(value => window.advanceTime(value), ms);
  const shot = async name => {
    await page.waitForTimeout(320);
    const file = join(directory, `${name}.png`);
    const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
    const geometry = await page.evaluate(() => {
      const rect = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const canvas = document.querySelector('canvas');
      const hud = rect(document.querySelector('[class*="fightMeta"]'));
      const cue = rect(document.querySelector('[class*="moveName"], [class*="parryFeedback"]'));
      const resourceOverlap = !!hud && Array.from(document.querySelectorAll('[class*="playerName"], [class*="bossHealth"]')).map(rect).some(r => r && r.right > hud.x && r.x < hud.right && r.bottom > hud.y && r.y < hud.bottom);
      return { canvas: rect(canvas), backing: { width: canvas.width, height: canvas.height }, viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth > innerWidth,
        resourceOverlap, hudOverlap: !!(hud && cue && cue.width && hud.right > cue.x && hud.x < cue.right && hud.bottom > cue.y && hud.y < cue.bottom) };
    });
    assert.ok(geometry.canvas.width > 0 && geometry.backing.width > 0);
    assert.equal(geometry.overflow, false); assert.equal(geometry.hudOverlap, false, `HUD overlap in ${name}`);
    assert.equal(geometry.resourceOverlap, false, `Resource overlap in ${name}`);
    captures.push({ name, file, pixels, geometry, state: await state() });
  };
  const pilot = async (stop = 'finish') => page.evaluate(target => {
    for (let i = 0; i < 18000; i += 1) {
      const s = window.suiSparring.snapshot();
      if (s.phase !== 'fight') break;
      if (target === 'stagger' && s.boss.mode === 'stagger') break;
      if (target === 'broken' && s.boss.mode === 'broken') break;
      if (target === 'chain' && s.boss.move === 'bellChain' && s.boss.mode === 'windup') break;
      if (target === 'final' && s.boss.enraged && s.boss.mode === 'windup') break;
      for (const [action, down] of Object.entries(window.__chapterDecision(s))) window.__chapterInput(action, down);
      window.advanceTime(10);
    }
    window.__release();
    return window.suiSparring.snapshot();
  }, stop);
  const start = async () => { await page.getByRole('button', { name: '请赐教' }).click(); await step(0); };
  const settings = async () => { await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('tab', { name: '整备', exact: true }).click(); };
  try {
    await page.goto(`${base}/game/one-more`);
    await page.getByRole('button', { name: '请赐教' }).waitFor({ timeout: 60000 });
    assert.equal((await state()).version, '0.3.0');
    assert.equal((await state()).muted, true);
    await shot('coach-ready');
    await settings();
    await page.getByLabel('本章护符', { exact: true }).selectOption('breath');
    await page.getByLabel('主播布局', { exact: true }).selectOption('left');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await shot('streamer-left');
    assert.ok(captures.at(-1).geometry.canvas.x >= 280);
    await settings(); await page.getByLabel('主播布局', { exact: true }).selectOption('right');
    await page.getByRole('button', { name: '关闭设置' }).click(); await shot('streamer-right');
    assert.ok(captures.at(-1).geometry.canvas.right <= 1160);
    await settings(); await page.getByLabel('主播布局', { exact: true }).selectOption('none');
    await shot('journey-settings'); await page.getByRole('button', { name: '关闭设置' }).click();
    await page.getByRole('radio', { name: '三招全接' }).check();
    await start();
    await page.evaluate(() => window.suiSparring.live());
    const beforeLive = (await state()).t; await page.waitForTimeout(350);
    assert.ok((await state()).t > beforeLive + 150, 'Real frames must advance combat'); await step(0);
    const beforeShortcut = (await state()).player.guardAt;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, bubbles: true })));
    assert.equal((await state()).player.guardAt, beforeShortcut);
    let s = await pilot('stagger'); assert.equal(s.boss.mode, 'stagger'); assert.ok(s.boss.counterReady);
    await shot('coach-stagger');
    s = await pilot('broken'); assert.equal(s.boss.mode, 'broken');
    await shot('coach-broken');
    const hp = s.boss.spirit;
    await page.keyboard.down('j'); await step(320); await page.keyboard.up('j');
    assert.ok((await state()).boss.spirit <= hp - 19);
    await page.getByRole('status', { name: '破架追击', exact: true }).waitFor();
    await shot('coach-counter');
    s = await pilot(); assert.equal(s.phase, 'won'); assert.equal(s.campaign.cleared.length, 1);
    await shot('coach-victory');
    await page.reload(); await page.getByRole('button', { name: '去钟台' }).waitFor();
    assert.equal((await state()).phase, 'won');
    await page.getByRole('button', { name: '去钟台' }).click();
    await shot('keeper-ready'); assert.equal((await state()).boss.id, 'keeper');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('keeper-mobile-ready');
    await start();
    const box = await page.getByRole('button', { name: '向右移动' }).boundingBox();
    const before = (await state()).player.x;
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await step(120); await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state()).player.x > before);
    const dodgeBox = await page.getByRole('button', { name: '闪避', exact: true }).boundingBox();
    const tapDodge = async () => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: dodgeBox.x + dodgeBox.width / 2, y: dodgeBox.y + dodgeBox.height / 2 }] });
      await step(15); await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    for (let i = 0; i < 5; i += 1) { await tapDodge(); await step(760); }
    const lastDash = (await state()).player.dashAt;
    await step(1200); await tapDodge();
    assert.ok((await state()).player.dashAt > lastDash, 'Touch release must survive low stamina and recover');
    await pilot('stagger'); await shot('keeper-mobile-parry');
    await page.setViewportSize({ width: 1440, height: 900 }); await pilot('chain'); await shot('keeper-chain');
    await step(60000); assert.equal((await state()).phase, 'lost'); await shot('keeper-defeat');
    await page.reload(); await page.getByRole('button', { name: '请赐教' }).waitFor();
    assert.equal((await state()).campaign.bossIndex, 1); assert.equal((await state()).campaign.cleared.length, 1);
    await start(); s = await pilot(); assert.equal(s.phase, 'won');
    await page.getByRole('button', { name: '去终庭' }).click(); await shot('master-ready');
    await page.setViewportSize({ width: 844, height: 390 }); await shot('master-landscape-ready');
    await start(); await pilot('stagger'); await shot('master-landscape-stagger');
    await page.setViewportSize({ width: 320, height: 568 }); await shot('master-small-stagger');
    await page.setViewportSize({ width: 1440, height: 900 }); await pilot('final'); await shot('master-final-chain');
    s = await pilot(); assert.equal(s.phase, 'ending'); assert.equal(s.campaign.cleared.length, 3); assert.equal(s.chapterWins, 1);
    await shot('chapter-ending');
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载首章战报' }).click();
    const download = await pendingDownload; const card = join(directory, 'chapter-result.png'); await download.saveAs(card);
    const cardPixels = inspectPng(readFileSync(card)); assert.equal(cardPixels.width, 1200); assert.equal(cardPixels.height, 840);
    await page.getByRole('button', { name: '复制挑战链接' }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const challenge = new URL(link); assert.equal(challenge.searchParams.get('rev'), '0.3.0'); assert.equal(challenge.searchParams.get('charm'), 'breath');
    await page.reload(); await page.getByRole('button', { name: '再过三庭' }).waitFor(); assert.equal((await state()).chapterWins, 1);
    await page.setViewportSize({ width: 390, height: 844 }); await shot('chapter-ending-mobile');
    await page.setViewportSize({ width: 844, height: 390 }); await shot('chapter-ending-landscape');
    await page.goto(link); await page.getByRole('button', { name: '请赐教' }).waitFor();
    assert.equal((await state()).campaign.mode, 'rematch'); assert.equal((await state()).campaign.bossIndex, 0);
    await start(); await pilot('stagger');
    await page.getByRole('button', { name: '暂停', exact: true }).click(); const frozen = (await state()).t; await step(5000); assert.equal((await state()).t, frozen);
    await page.reload(); await page.getByRole('button', { name: '请赐教' }).waitFor(); assert.equal((await state()).campaign.mode, 'rematch');
    await page.getByRole('combobox', { name: '本场难度', exact: true }).selectOption('relaxed');
    await start(); const challengeAttempts = (await state()).campaign.attempts[0];
    await page.reload(); await page.getByRole('button', { name: '请赐教' }).waitFor();
    assert.equal((await state()).difficulty, 'relaxed', 'Reload must preserve settings changed after entering a challenge');
    assert.equal((await state()).campaign.attempts[0], challengeAttempts);
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ passed: true, captures, card, cardPixels, link, chapter: s.campaign, errors, failures }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: captures.map(item => item.file), card, fights: s.campaign.cleared.map(item => ({ boss: item.bossId, ...item.stats })) }, null, 2));
  } catch (e) {
    writeFileSync(join(directory, 'failure.json'), JSON.stringify({ message: e.message, errors, failures, captures }, null, 2));
    await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true }).catch(() => {}); throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
