const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { travel } = require('./lib/liuzhou-pilot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4130';
const output = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou';
const report = { pointerLockMode: 'browser-only virtual capture; native system pointer lock disabled in automated tests', errors: [], captures: [], checks: [] };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(p, name) {
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = path.join(output, `${name}.png`);
  const sanity = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const dom = await p.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, css: c.getBoundingClientRect().toJSON(), calls: c.dataset.drawCalls, cameraDistance: c.dataset.cameraDistance })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
  report.captures.push({ name, file, sanity, dom, state: await state(p) });
}
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(90000) })).status, 200);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.LIUZHOU_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    if (process.env.LIUZHOU_EVENING === '1') await context.addInitScript(() => {
      window.liuzhouAudioQA = { panners: [], gains: [], tones: 0 };
      for (const [method, array] of [['createPanner', 'panners'], ['createGain', 'gains']]) {
        const original = AudioContext.prototype[method];
        AudioContext.prototype[method] = function (...args) {
          const node = original.apply(this, args);
          window.liuzhouAudioQA[array].push(node);
          if (method === 'createGain') {
            const setTarget = node.gain.setTargetAtTime;
            node.gain.setTargetAtTime = function (value, ...rest) {
              node.qaTarget = value;
              return setTarget.call(this, value, ...rest);
            };
          }
          return node;
        };
      }
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (...args) { window.liuzhouAudioQA.tones++; return original.apply(this, args); };
    });
    const p = await context.newPage();
    p.on('pageerror', e => report.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400 && /\/(game\/liuzhou|_next|images\/livers)/.test(r.url())) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
    await p.goto(`${base}/game/liuzhou?test=1`);
    await p.getByRole('button', { name: '走进柳州 ↗' }).waitFor({ timeout: 90000 });
    await p.evaluate(() => window.liuzhouTest.manual(true));
    await capture(p, '01-title');
    await p.getByRole('button', { name: '走进柳州 ↗' }).click();
    await capture(p, '02-east-gate');
    if (process.env.LIUZHOU_CAMERA_ONLY === '1') {
      await require('./lib/liuzhou-camera-playtest.cjs').runCamera({ page: p, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_CONVERSATION_ONLY === '1') {
      await require('./lib/liuzhou-conversation-playtest.cjs').runConversation({ page: p, browser, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_ACTORS_ONLY === '1') {
      await require('./lib/liuzhou-actors-playtest.cjs').runActors({ page: p, browser, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_NAVIGATION_ONLY === '1') {
      await require('./lib/liuzhou-navigation-playtest.cjs').runNavigation({ page: p, browser, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_STREET_ONLY === '1') {
      await require('./lib/liuzhou-street-playtest.cjs').runStreet({ page: p, browser, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_DONGMEN_ONLY === '1') {
      await require('./lib/liuzhou-dongmen-playtest.cjs').runDongmen({ page: p, browser, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_CONTROLS_ONLY === '1') {
      await require('./lib/liuzhou-controls-playtest.cjs').runControls({ page: p, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_CITIZENS_ONLY === '1') {
      await require('./lib/liuzhou-citizens-playtest.cjs').runCitizens({ page: p, browser, capture, report });
      assert.deepEqual(report.errors, []); return;
    }
    if (process.env.LIUZHOU_SMOKE === '1') { assert.deepEqual(report.errors, []); return; }
    const initial = await state(p);
    await p.keyboard.down('KeyW');
    await p.evaluate(() => window.liuzhouTest.move({ forward: 1 }, 90));
    await p.keyboard.up('KeyW');
    assert.ok(Math.hypot((await state(p)).player.x - initial.player.x, (await state(p)).player.z - initial.player.z) > 3);
    await p.keyboard.press('Escape'); const paused = await state(p);
    await p.evaluate(() => window.advanceTime(1000)); assert.deepEqual(await state(p), paused);
    await p.getByRole('button', { name: '回到街上 ↗' }).click();
    await p.getByRole('button', { name: '打开街区地图' }).click(); await capture(p, '03-map');
    await p.keyboard.press('Escape'); assert.equal((await state(p)).phase, 'playing');
    for (let i = 1; i <= 4; i++) { await p.keyboard.press(`Digit${i}`); assert.equal((await state(p)).player.character, ['sui', 'shiori', 'nagisa', 'nana'][i - 1]); }
    await p.keyboard.press('Digit1');
    await capture(p, '04-walk');
    report.checks.push('boot, walking, pause freezes simulation, map, four characters');
    const talk = async expectedStage => {
      await p.keyboard.press('KeyE');
      let s = await state(p); assert.ok(s.dialogue, `expected dialogue at ${JSON.stringify(s.interaction)}`);
      if (process.env.LIUZHOU_LIFE === '1' && [2, 6].includes(expectedStage)) {
        const { money, stage } = s;
        await p.reload(); await p.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 60000 });
        await p.evaluate(() => window.liuzhouTest.manual(true)); await p.getByRole('button', { name: '继续这趟旅行 ↗' }).click();
        s = await state(p); assert.equal(s.money, money); assert.equal(s.stage, stage);
        await p.keyboard.press('KeyE'); s = await state(p); assert.equal(s.money, money);
      }
      while (s.dialogue) { await p.keyboard.press('KeyE'); s = await state(p); }
      assert.equal(s.stage, expectedStage);
    };
    console.log('Travel: meet Shiori');
    await travel(p, { x: 28, z: -23 }); await p.keyboard.press('KeyE'); await capture(p, '05-shiori-dialogue');
    while ((await state(p)).dialogue) await p.keyboard.press('KeyE');
    assert.equal((await state(p)).stage, 1);
    await travel(p, { x: 42, z: -8 }); await p.keyboard.press('KeyE'); assert.equal((await state(p)).vehicle, 'bike-1');
    console.log('Travel: cycle to noodle shop');
    await travel(p, { x: -167, z: 120 }, { tolerance: 3.5 });
    await p.waitForFunction(() => {
      const s = JSON.parse(window.render_game_to_text());
      return s.navigation?.status === 'route' && s.navigation.metres < 20 && s.navigation.points.length < 12;
    });
    await capture(p, '06-cycle-old-street');
    await p.keyboard.press('KeyE'); assert.equal((await state(p)).vehicle, null);
    await travel(p, { x: -170, z: 117 }); await talk(2);
    console.log('Travel: deliver to Nagisa');
    await travel(p, { x: -217, z: -18 }); await talk(3);
    await travel(p, { x: -207, z: 8 }); await p.keyboard.press('KeyE'); assert.equal((await state(p)).vehicle, 'car-1');
    console.log('Travel: drive across Wenhui bridge');
    await travel(p, { x: 128, z: 270 }, { tolerance: 3.5 }); await capture(p, '07-driving-bridge');
    await travel(p, { x: 219, z: 618 }, { tolerance: 3.5 });
    await p.keyboard.press('KeyE'); assert.equal((await state(p)).vehicle, null);
    await travel(p, { x: 219, z: 622 }); await talk(4);
    console.log('Travel: return north to river recording');
    const parked = (await state(p)).vehicles.find(v => v.id === 'car-1');
    await travel(p, parked); await p.keyboard.press('KeyE'); assert.equal((await state(p)).vehicle, 'car-1');
    await travel(p, { x: 270, z: -180 }, { tolerance: 3.5 }); await capture(p, '08-north-bank');
    await p.keyboard.press('KeyE'); await travel(p, { x: 253, z: -175 }); await talk(5);
    await p.keyboard.press('KeyP'); assert.ok((await state(p)).stamps.includes('square'));
    console.log('Travel: chapter reunion');
    await travel(p, { x: 28, z: -23 }); await talk(6);
    await capture(p, '09-chapter-clear');
    const complete = await state(p); assert.ok(complete.bikeDistance > 100); assert.ok(complete.carDistance > 700);
    report.checks.push('chapter completed using movement, steering, brakes and E only; bicycle, car, two bridge crossings, NPCs, field recording, landmark journal');
    await p.reload(); await p.getByRole('button', { name: '继续这趟旅行 ↗' }).waitFor({ timeout: 60000 });
    await p.getByRole('button', { name: '继续这趟旅行 ↗' }).click(); assert.equal((await state(p)).stage, 6);
    assert.ok((await state(p)).stamps.includes('square')); report.checks.push('save and reload chapter and journal');
    await p.getByRole('button', { name: '关闭声音' }).click(); assert.ok(await p.getByRole('button', { name: '开启声音' }).getAttribute('aria-pressed'));
    await p.getByRole('button', { name: '开启声音' }).click();
    if (process.env.LIUZHOU_LIFE === '1') await require('./lib/liuzhou-life-playtest.cjs').runStreetLife({ page: p, browser, capture, report });
    if (process.env.LIUZHOU_EVENING === '1') await require('./lib/liuzhou-evening-playtest.cjs').runEvening({ page: p, browser, capture, report });
    if (process.env.LIUZHOU_CITIZENS === '1') await require('./lib/liuzhou-citizens-playtest.cjs').runCitizens({ page: p, browser, capture, report });
    await p.keyboard.press('KeyJ'); await capture(p, '10-journal'); await p.keyboard.press('Escape');
    const mctx = await quietContext(browser, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    await mctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await mctx.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const m = await mctx.newPage(); m.on('pageerror', e => report.errors.push(e.message));
    await m.goto(`${base}/game/liuzhou?test=1`); await m.getByRole('button', { name: '走进柳州 ↗' }).waitFor({ timeout: 60000 });
    await m.getByRole('button', { name: '走进柳州 ↗' }).tap();
    const point = async name => { const b = await m.getByRole('button', { name, exact: true }).boundingBox(); assert.ok(b?.width >= 43 && b?.height >= 43); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const forward = await point('向前'); const jump = await point('刹车或跳跃'); const cdp = await mctx.newCDPSession(m);
    const beforeTouch = await state(m);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...forward, id: 1 }, { ...jump, id: 2 }] });
    await m.waitForFunction(before => {
      const g = window.liuzhouTest.game;
      return g.player.y > 0.25 && Math.hypot(g.player.x - before.x, g.player.z - before.z) > 0.3;
    }, beforeTouch.player);
    await capture(m, '11-mobile-landscape');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const afterTouch = await state(m); assert.ok(Math.hypot(afterTouch.player.x - beforeTouch.player.x, afterTouch.player.z - beforeTouch.player.z) > 0.2);
    await m.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await state(m)).phase, 'paused');
    await m.getByRole('button', { name: '回到街上 ↗' }).tap();
    await m.setViewportSize({ width: 390, height: 844 }); await capture(m, '12-mobile-portrait');
    await m.getByRole('button', { name: '地图', exact: true }).tap(); await capture(m, '13-mobile-map');
    report.checks.push('mobile landscape/portrait, simultaneous forward+jump via CDP touches, touch cancellation, blur pause, mobile map, audio mute toggle');
    await mctx.close();
    assert.deepEqual(report.errors, []);
  } finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
