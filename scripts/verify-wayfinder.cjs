const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, copyFileSync } = require('node:fs');
const { join } = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
let chromium;
for (const module of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { ({ chromium } = require(module)); break; } catch {}
}
if (!chromium) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright package.');
const base = process.env.WAYFINDER_BASE_URL || 'http://127.0.0.1:4091';
const output = process.env.WAYFINDER_QA_DIR || 'tmp/wayfinder-qa';
const errors = []; const captures = []; const checks = [];
mkdirSync(output, { recursive: true });
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(page, name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const s = await state(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, coarsePointer: matchMedia('(pointer: coarse)').matches, joystickDisplay: document.querySelector('[aria-label="移动摇杆，拖动行走"]') ? getComputedStyle(document.querySelector('[aria-label="移动摇杆，拖动行走"]')).display : null, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })), dom: document.body.innerText.slice(0, 3000) }));
  assert.ok(layout.scrollWidth <= layout.width + 1, 'Horizontal overflow');
  assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0].width > 100 && layout.canvas[0].height > 100);
  const path = join(output, `${name}.png`); const pixels = inspectPng(await page.screenshot({ path, fullPage, animations: 'disabled' }));
  writeFileSync(join(output, `${name}.json`), JSON.stringify({ state: s, layout, pixels }, null, 2));
  captures.push({ name, path, pixels, mode: s.mode, mission: s.mission, floor: s.player.floor });
  console.log(`capture ${name}: ${s.mode}, floor ${s.player.floor}`);
}
async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/game/wayfinder`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.windpost && window.render_game_to_text && document.querySelector('canvas')?.width > 100);
  await page.getByRole('button', { name: /领第一封信|继续这段旅程/ }).waitFor();
  return page;
}
async function advance(page, ms) { await page.evaluate(ms => window.advanceTime(ms), ms); }
async function walkTo(page, id) {
  const before = await state(page); const n = before.world.nodes[id];
  if (n.floor !== before.player.floor) {
    await page.keyboard.press('t'); await advance(page, 1400);
    const after = await state(page); assert.equal(after.player.floor, n.floor); return;
  }
  const result = await page.evaluate(id => {
    const read = () => JSON.parse(window.render_game_to_text());
    const n = read().world.nodes[id];
    for (let i = 0; i < 1000; i++) {
      const s = read(); const p = s.player; const d = Math.hypot(p.x - n.x, p.z - n.z);
      if (d < 0.03) break;
      const yaw = (Math.atan2(n.x - p.x, p.z - n.z) + Math.PI * 2) % (Math.PI * 2);
      for (let j = 0; j < 4; j++) {
        const diff = ((yaw - read().player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        window.windpost.look(diff);
      }
      window.windpost.input({ forward: 1, right: 0, turn: 0 });
      window.advanceTime(Math.min(100, d / (s.comfort ? 4.5 : 6.3) * 1000));
    }
    window.windpost.input({ forward: 0, right: 0, turn: 0 });
    return read();
  }, id);
  assert.ok(Math.hypot(result.player.x - n.x, result.player.z - n.z) < .04, `Could not walk to ${id}: ${JSON.stringify(result.player)}`);
}
async function travel(page, to) {
  const s = await state(page); const nodes = s.world.nodes;
  const from = nodes.filter(n => n.floor === s.player.floor).sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0].id;
  const paths = [[from]]; const seen = new Set([from]); let result;
  while (paths.length) {
    const path = paths.shift(); const at = path.at(-1); if (at === to) { result = path; break; }
    for (const e of s.world.edges) {
      if (s.blocked.includes(`${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`) || s.bridgeEvent?.edge === `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`) continue;
      const next = e.a === at ? e.b : e.b === at ? e.a : -1;
      if (next >= 0 && !seen.has(next)) { seen.add(next); paths.push([...path, next]); }
    }
  }
  assert.ok(result, 'No legal route');
  for (const id of result) await walkTo(page, id);
}
async function setup(context) {
  await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
}
(async () => {
  const response = await fetch(`${base}/game/wayfinder`, { signal: AbortSignal.timeout(60000) }); assert.equal(response.status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const library = await browser.newContext({ viewport: { width: 1365, height: 850 }, reducedMotion: 'reduce' }); await setup(library);
    await library.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    const entry = await library.newPage();
    entry.on('pageerror', error => errors.push(error.message));
    entry.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await entry.goto(`${base}/demos`, { waitUntil: 'networkidle' });
    await entry.getByRole('searchbox', { name: '搜索游戏' }).fill('风邮小镇');
    const card = entry.locator('[data-game="/game/wayfinder"]'); await card.waitFor();
    assert.equal(await entry.locator('[data-game]').count(), 1);
    await card.locator('img').evaluate(img => { if (!img.complete || img.naturalWidth < 100) throw new Error('Library preview did not load'); });
    await card.scrollIntoViewIfNeeded();
    const libraryPath = join(output, '00-library.png');
    const libraryPixels = inspectPng(await entry.screenshot({ path: libraryPath, fullPage: true, animations: 'disabled' }));
    captures.push({ name: '00-library', path: libraryPath, pixels: libraryPixels, dom: await card.innerText() });
    await entry.getByRole('link', { name: '打开 风邮小镇', exact: true }).click();
    await entry.waitForURL('**/game/wayfinder');
    await entry.getByRole('button', { name: '领第一封信' }).click();
    await entry.getByRole('button', { name: /把信放进邮包/ }).click();
    assert.equal((await state(entry)).mode, 'playing');
    assert.equal(await entry.evaluate(() => JSON.parse(localStorage.getItem('sui-game-library-v1')).recent[0].href), '/game/wayfinder');
    await capture(entry, '00-library-start');
    checks.push('library search, loaded preview, actual launch and recent entry');
    await library.close();
    const context = await browser.newContext({ viewport: { width: 1365, height: 850 }, reducedMotion: 'reduce' }); await setup(context);
    const page = await open(context);
    await capture(page, '01-title');
    await page.getByRole('button', { name: /看看远行路线/ }).click(); await capture(page,'01-regions');
    await page.getByRole('button', { name:'合上远行路线' }).click();
    await page.getByRole('button', { name: '领第一封信' }).click();
    await page.getByRole('button', { name: /把信放进邮包/ }).click();
    await page.waitForFunction(()=>Boolean(document.pointerLockElement));
    const beforeMouse=(await state(page)).player.yaw;
    await page.mouse.move(800,420); await page.mouse.move(900,400);
    assert.notEqual((await state(page)).player.yaw,beforeMouse); checks.push('actual pointer lock and mouse movement without a pressed button');
    await page.keyboard.press('Escape'); await page.waitForFunction(()=>!document.pointerLockElement);
    assert.equal((await state(page)).mode,'pause');
    await page.getByRole('button',{name:'继续走走',exact:true}).click();await page.waitForFunction(()=>Boolean(document.pointerLockElement));
    assert.equal((await state(page)).mode,'playing');checks.push('Escape releases mouse and pauses; resume captures it again');
    await page.evaluate(()=>{for(let i=0;i<8;i++){const p=JSON.parse(window.render_game_to_text()).player;window.windpost.look(((0-p.yaw+Math.PI*3)%(Math.PI*2))-Math.PI);}});
    await capture(page, '02-street');
    if (process.env.WAYFINDER_SMOKE === '1') return;
    const initial = await state(page);
    await page.keyboard.down('w'); await advance(page, 350); await page.keyboard.up('w');
    const moved = await state(page); assert.ok(moved.player.z < initial.player.z - 1); checks.push('physical keyboard movement');
    await page.keyboard.down('Shift'); await page.keyboard.down('w'); await advance(page,350); await page.keyboard.up('w'); await page.keyboard.up('Shift');
    const sprint=(await state(page)).player;
    assert.ok((moved.player.z-sprint.z)/(initial.player.z-moved.player.z)>1.8);checks.push('real Shift sprint is 1.85x walking');
    await page.keyboard.press('m'); await page.getByLabel('我打算经过的地标').selectOption('clock');
    await page.waitForFunction(()=>!document.pointerLockElement);
    await capture(page, '03-map');
    const at = (await state(page)).player; await advance(page, 400); assert.deepEqual((await state(page)).player, at);
    await page.keyboard.press('Escape'); assert.equal((await state(page)).mode, 'playing');
    await page.getByRole('button', { name: '暂停与设置' }).click();
    await page.getByLabel('舒适探索').check(); await page.getByLabel('舒适探索').uncheck();
    await page.getByRole('button', { name: '继续走走' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '看看旅记' }).click();
    await page.getByRole('button', { name: '合上旅记' }).click();
    await page.getByRole('button', { name: '继续走走' }).click();
    assert.equal((await state(page)).mode, 'playing'); checks.push('nested journal and pause can both close');
    const preReload = await state(page);
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: /继续这段旅程/ }).click();
    assert.deepEqual((await state(page)).player, preReload.player); checks.push('save reload and preference controls');
    let caveSave;
    for (let mission = 0; mission < 8; mission++) {
      let s = await state(page); assert.equal(s.mission, mission);
      if (mission === 3) await capture(page, '07-arcade-1f');
      if (mission === 1) {
        await page.keyboard.press('m'); await page.getByRole('button', { name: '我在哪？试着标一标' }).click();
        const svg = page.getByRole('img', { name: /纸地图/ }); await svg.click({ position: { x: 180, y: 240 } });
        assert.equal((await state(page)).stats.locations, 1); await capture(page, '05-location'); await page.keyboard.press('Escape');
        await page.keyboard.press('h'); await page.keyboard.press('h'); await page.keyboard.press('h'); assert.equal((await state(page)).stats.hints, 3);
      }
      if(mission===6){
        await capture(page,'15-cave-entry');await travel(page,4);
        await page.evaluate(()=>{for(let i=0;i<8;i++){const s=JSON.parse(window.render_game_to_text()),p=s.player,n=s.world.nodes[5];const yaw=Math.atan2(n.x-p.x,p.z-n.z);window.windpost.look(((yaw-p.yaw+Math.PI*3)%(Math.PI*2))-Math.PI);}});
        await capture(page,'16-cave-junction');await page.keyboard.press('g');
        const recallAt=(await state(page)).player;await advance(page,400);assert.deepEqual((await state(page)).player,recallAt);
        await page.getByRole('button',{name:'还没有走过',exact:true}).click();await capture(page,'17-branch-recall');
        await page.getByRole('button',{name:'继续探索',exact:true}).click();await page.keyboard.press('b');
        assert.equal((await state(page)).chalk.length,1);await capture(page,'18-chalk');
        await walkTo(page,5);await walkTo(page,4);
        await page.evaluate(()=>{for(let i=0;i<8;i++){const s=JSON.parse(window.render_game_to_text()),p=s.player,n=s.world.nodes[5];const yaw=Math.atan2(n.x-p.x,p.z-n.z);window.windpost.look(((yaw-p.yaw+Math.PI*3)%(Math.PI*2))-Math.PI);}});
        await page.keyboard.press('g');await page.getByRole('button',{name:'我走过这条路',exact:true}).click();
        assert.equal((await state(page)).stats.branchMistakes,0);await page.getByRole('button',{name:'继续探索',exact:true}).click();
        await page.keyboard.press('m');await capture(page,'19-cave-map');await page.keyboard.press('Escape');
        const beforeSave=await state(page);await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:/继续这段旅程/}).click();
        assert.deepEqual((await state(page)).chalk,beforeSave.chalk);assert.deepEqual((await state(page)).edgeVisits,beforeSave.edgeVisits);
        caveSave = await page.evaluate(() => localStorage.getItem('windpost-wayfinder-v1'));
        checks.push('new and repeated cave branch retrieval, voluntary chalk, map and save retention');
      }
      await travel(page, s.target.node);
      if (mission === 3) {
        await page.evaluate(() => { for (let i=0;i<4;i++) {const s=JSON.parse(window.render_game_to_text()); const target=(Math.PI*7)/4; window.windpost.look(((target-s.player.yaw+Math.PI*3)%(Math.PI*2))-Math.PI); } });
        await capture(page, '08-arcade-2f');
      }
      await page.keyboard.press('f'); assert.equal((await state(page)).mode, 'bearing');
      if (mission === 0) await capture(page, '04-delivery');
      if (mission % 2 === 0) await page.getByRole('button', { name: '邮局在正前方', exact: true }).click();
      else await page.getByRole('button', { name: /还没把握/ }).click();
      await page.getByRole('button', { name: /带着回信，找路回家/ }).click();
      if (mission === 2) {
        assert.equal((await state(page)).blocked.length,0);assert.equal((await state(page)).bridgeEvent.stage,'armed');
        await page.evaluate(()=>{for(let i=0;i<8;i++){const s=JSON.parse(window.render_game_to_text());window.windpost.look(((Math.PI-s.player.yaw+Math.PI*3)%(Math.PI*2))-Math.PI);}window.windpost.input({forward:1,right:0,turn:0});});
        await advance(page,600);await page.evaluate(()=>window.windpost.input({forward:0,right:0,turn:0}));
        assert.equal((await state(page)).bridgeEvent.stage,'jump');await advance(page,800);await capture(page,'06-carp-jump');
        await advance(page,650);await capture(page,'06-carp-bite');
        await advance(page,1950);assert.equal((await state(page)).bridgeEvent.stage,'broken');assert.equal((await state(page)).blocked.length,1);
        await capture(page,'06-broken-bridge');await walkTo(page,2);
        await page.keyboard.press('m'); await capture(page, '06-closure'); await page.keyboard.press('Escape');
        checks.push('carp triggered by real return approach, jumps and breaks bridge, alternate route remains');
      }
      s = await state(page); await travel(page, s.world.start); await page.keyboard.press('f');
      assert.equal((await state(page)).mode, 'result'); checks.push(`mission ${mission + 1} walked out and home`);
      if (mission === 6) await capture(page,'20-cave-review');
      if (mission === 7) await capture(page, '09-finale');
      else { await page.getByRole('button', { name: /领取下一封信/ }).click(); await page.getByRole('button', { name: /把信放进邮包/ }).click(); }
    }
    await page.getByRole('button', { name: /收好回信/ }).click(); await capture(page, '10-journal');
    assert.equal((await state(page)).records.length, 8);
    await page.getByRole('button', { name: '另一阵海风 · 新地图' }).click();
    await page.getByRole('button', { name: /把信放进邮包/ }).click();
    const newWorld = await state(page); assert.notEqual(newWorld.seed, 63117); checks.push('fresh expedition');
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await state(page)).mode, 'pause');
    await context.close();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' }); await setup(mobile);
    const phone = await open(mobile); await phone.getByRole('button', { name: '领第一封信' }).click(); await phone.getByRole('button', { name: /把信放进邮包/ }).click();
    await capture(phone, '11-mobile');
    const beforeTouch = await state(phone);
    // Use real touch dispatch via CDP so pointer capture and cancellation are exercised.
    const client = await mobile.newCDPSession(phone); const rect = await phone.getByRole('application', { name: /移动摇杆/ }).boundingBox();
    const x = rect.x + rect.width / 2; const y = rect.y + rect.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 32 }] }); await advance(phone, 400);
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.ok((await state(phone)).player.z < beforeTouch.player.z - .5);
    const stopped = (await state(phone)).player; await advance(phone, 200); assert.deepEqual((await state(phone)).player, stopped); checks.push('touch movement and cancellation');
    const heading = stopped.yaw;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 310 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 310 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(Math.abs((await state(phone)).player.yaw - heading) > .2); checks.push('real touch look');
    await phone.getByRole('button', { name: /纸地图/ }).click(); await capture(phone, '12-mobile-map');
    await phone.setViewportSize({ width: 320, height: 640 }); await capture(phone, '13-narrow-map');
    await phone.getByRole('button', { name: /合上地图，自己走走/ }).scrollIntoViewIfNeeded();
    await capture(phone, '13-narrow-map-bottom');
    await phone.getByRole('button', { name: /合上地图，自己走走/ }).click();
    await mobile.close();
    // Reuse the exact autosave earned by legal desktop play, without altering progression.
    assert.ok(caveSave);
    const caveMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' }); await setup(caveMobile);
    await caveMobile.addInitScript(save => localStorage.setItem('windpost-wayfinder-v1', save), caveSave);
    const cavePhone = await open(caveMobile); await cavePhone.getByRole('button', { name: /继续这段旅程/ }).tap();
    assert.equal((await state(cavePhone)).world.theme, 'cave');
    await capture(cavePhone, '21-mobile-cave', false);
    await cavePhone.getByRole('button', { name: /这条路走过吗/ }).tap();
    const caveStill = (await state(cavePhone)).player; await advance(cavePhone, 500); assert.deepEqual((await state(cavePhone)).player, caveStill);
    await cavePhone.getByRole('button', { name: '我走过这条路', exact: true }).tap();
    assert.equal((await state(cavePhone)).stats.branchMistakes, 0); await capture(cavePhone, '22-mobile-cave-recall', false);
    await cavePhone.getByRole('button', { name: '继续探索', exact: true }).tap();
    const marksBefore = (await state(cavePhone)).chalk; await cavePhone.getByRole('button', { name: /留粉笔记号/ }).tap(); assert.deepEqual((await state(cavePhone)).chalk, marksBefore);
    await cavePhone.getByRole('button', { name: /⇧ 跑步/ }).tap(); await cavePhone.getByRole('button', { name: /⇧ 慢走/ }).waitFor({ state: 'visible' });
    await cavePhone.setViewportSize({ width: 320, height: 640 }); await capture(cavePhone, '23-narrow-cave', false);
    checks.push('mobile cave uses earned save; touch branch recall freezes movement, chalk is unique, sprint toggle and 320px controls work');
    await caveMobile.close();
    const landscape = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' }); await setup(landscape);
    const widePhone = await open(landscape); await widePhone.getByRole('button', { name: '领第一封信' }).tap(); await widePhone.getByRole('button', { name: /把信放进邮包/ }).tap();
    await widePhone.getByRole('application', { name: /移动摇杆/ }).waitFor({ state: 'visible' });
    // Chrome full-page metric overrides can temporarily report a fine pointer.
    // Use the actual viewport to capture the touch layout in landscape.
    await capture(widePhone, '14-landscape', false); checks.push('narrow map action reachable by scrolling; landscape touch controls visible');
    await landscape.close();
    const restricted = await browser.newContext({ viewport: { width: 1000, height: 720 } }); await setup(restricted);
    await restricted.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('storage disabled'); }; Storage.prototype.getItem = () => { throw new Error('storage disabled'); }; });
    const denied = await open(restricted); await denied.getByRole('button', { name: '领第一封信' }).click(); await denied.getByRole('button', { name: /把信放进邮包/ }).click();
    assert.equal((await state(denied)).mode, 'playing'); await denied.getByText(/本机存档暂不可用/).waitFor(); checks.push('storage unavailable remains playable');
    await restricted.close();
    const shared = await browser.newContext({ viewport: { width: 1000, height: 720 } }); await setup(shared);
    const sharePage = await shared.newPage();
    sharePage.on('pageerror', error => errors.push(error.message));
    await sharePage.goto(`${base}/game/wayfinder?seed=778899`, { waitUntil: 'networkidle' });
    await sharePage.getByRole('button', { name: '打开同行地图 #778899' }).click();
    await sharePage.getByRole('button', { name: /把信放进邮包/ }).click();
    assert.equal((await state(sharePage)).seed, 778899); assert.equal((await state(sharePage)).unlocked, 0);
    const z = (await state(sharePage)).player.z;
    await sharePage.keyboard.down('w');
    await sharePage.waitForFunction(z => JSON.parse(window.render_game_to_text()).player.z < z - 1, z, { timeout: 6000 });
    await sharePage.keyboard.up('w');
    checks.push('shared seed starts a new map without unlocking story; real animation-frame movement');
    await shared.close();
    assert.deepEqual(errors, []);
    if (process.env.WAYFINDER_PREVIEW === '1') { mkdirSync('public/games/wayfinder', { recursive: true }); copyFileSync(join(output, '01-title.png'), 'public/games/wayfinder/preview.png'); }
  } finally {
    writeFileSync(join(output, 'report.json'), JSON.stringify({ base, checks, captures, errors }, null, 2)); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
