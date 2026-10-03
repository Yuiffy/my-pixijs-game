const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')],
}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.FITNESS_BASE_URL || 'http://localhost:4071';
const output = process.env.FITNESS_QA_DIR || 'tmp/sui-fitness-v2-dev';
const recordKey = 'sui-fitness-record-v2';
const errors = [];
const responses = [];
const shots = [];
const scenarios = [];
const liveObservations = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const ready = page => page.waitForFunction(() => typeof window.render_game_to_text === 'function'
  && typeof window.advanceTime === 'function' && JSON.parse(window.render_game_to_text()).assetsReady);
const button = (page, name) => ['继续挑战', '重新挑战', '换个开局', '收起说明'].includes(name)
  ? page.getByRole('dialog').getByRole('button', { name, exact: true })
  : page.getByRole('button', { name, exact: true });
const readRecord = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), recordKey);
const stable = value => ({
  phase: value.phase, day: value.day, time: value.time, elapsed: value.elapsed,
  player: value.player, weight: value.weight, muscle: value.muscle,
  motivation: value.motivation, foods: value.foods, workouts: value.workouts,
  defeats: value.defeats, fatMass: value.fatMass, bodyFat: value.bodyFat, level: value.level, xp: value.xp, projectiles: value.projectiles,
});

async function prepare(context) {
  await context.route('**/api/record', route => route.fulfill({ json: { success: true } }));
  await context.route('**/api/demos/visits', route => route.fulfill({ json: { visits: {} } }));
  await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,
    route => route.fulfill({ body: '' }));
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  });
  context.on('page', page => {
    page.on('pageerror', error => errors.push({ url: page.url(), text: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ url: page.url(), text: message.text() });
    });
    page.on('response', response => {
      if (response.status() >= 400) responses.push({ status: response.status(), url: response.url() });
    });
  });
}

async function open(context, seed = 41, talent = 'strength') {
  const page = await context.newPage();
  await page.goto(`${base}/game/sui-fitness?seed=${seed}&talent=${talent}`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await advance(page, 0);
  assert.equal(await page.locator('canvas').count(), 1);
  return page;
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const box = canvas.getBoundingClientRect();
    const overflow = [...document.querySelectorAll('h1,h2,p,button')]
      .filter(element => element.clientWidth && element.scrollWidth > element.clientWidth + 3)
      .map(element => ({ text: element.textContent, width: element.clientWidth, scroll: element.scrollWidth }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      canvas: { x: box.x, y: box.y, right: box.right, width: box.width, height: box.height,
        backingWidth: canvas.width, backingHeight: canvas.height },
      overflow,
    };
  });
  assert.ok(layout.scrollWidth <= layout.viewport.width + 1, `Page overflows: ${JSON.stringify(layout)}`);
  assert.ok(layout.canvas.x >= -1 && layout.canvas.right <= layout.viewport.width + 1,
    `Canvas overflows: ${JSON.stringify(layout)}`);
  assert.ok(layout.canvas.width > 200 && layout.canvas.height > 100, JSON.stringify(layout));
  assert.equal(layout.canvas.backingWidth, 1100);
  assert.equal(layout.canvas.backingHeight, 700);
  assert.deepEqual(layout.overflow, [], `Text overflows: ${JSON.stringify(layout.overflow)}`);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  assert.ok(pixels.colors > 30 && pixels.nearBlackRatio < 0.8 && pixels.transparentRatio < 0.8, 'Reject invalid capture');
  const snapshot = await state(page);
  const dom = await page.locator('body').innerText();
  assert.ok(dom.includes(snapshot.weight.toFixed(2)), 'HUD must show two-decimal weight from public state');
  assert.ok(dom.includes(snapshot.bodyFat.toFixed(2)), 'HUD must match public body composition');
  shots.push({ file, pixels, layout, state: await state(page) });
}

async function frozen(page) {
  const before = stable(await state(page));
  assert.equal(before.phase, 'paused');
  await advance(page, 2500);
  await page.waitForTimeout(120);
  assert.deepEqual(stable(await state(page)), before, 'Pause must freeze movement, foods, stats and day timer');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), 'Pause must keep keyboard focus in the dialog');
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
}

const runs = [];
let decisionSource;
let choose;

async function pilot(page, memo = {}, mode = 'active', frames = 450, stopWorkout) {
  return page.evaluate(({ source, memo: memory, mode: action, frames: limit, stopWorkout: kind }) => {
    const decide = new Function('return (' + source + ')')();
    const read = () => JSON.parse(window.render_game_to_text());
    const held = new Set();
    const keys = {KeyA:'a',KeyD:'d',KeyW:'w',KeyS:'s',KeyE:'e',KeyQ:'q',Space:' '};
    const change = (code, down) => {
      if (held.has(code) === down) return;
      down ? held.add(code) : held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code,key:keys[code],bubbles:true}));
    };
    const initial = read();
    let current = initial;
    try {
      for (let i=0; i<limit && current.phase==='playing'; i++) {
        const input = decide(current, memory, action);
        change('KeyA', input.x < 0); change('KeyD', input.x > 0);
        change('KeyW', input.y < 0); change('KeyS', input.y > 0);
        change('KeyE', !!input.exercise);
        change('Space', !!input.dash); change('KeyQ', !!input.pulse);
        window.advanceTime(1000/60);
        current = read();
        if (kind && current.workouts[kind] > initial.workouts[kind]) break;
      }
    } finally { [...held].forEach(code => change(code, false)); }
    return {initial,state:read(),memo:memory};
  }, {source:decisionSource,memo,mode,frames,stopWorkout});
}

async function selectUpgrade(page, s = null) {
  const before = s || await state(page);
  const id = choose(before);
  await page.locator('[data-upgrade="' + id + '"]').click();
  const after = await state(page);
  assert.equal(after.day, before.day);
  assert.equal(after.time, before.time, 'Level selection must keep the current wave and time');
  assert.deepEqual(after.foods, before.foods, 'Level selection must retain the live enemies');
  return after;
}

async function campaign(page, mode = 'active', screenshotPrefix = '') {
  let memo = {};
  let mixedCaptured = false;
  const trace = [];
  for (let loop=0; loop<140; loop++) {
    let s = await state(page);
    if (s.phase==='upgrade') {
      if (screenshotPrefix && s.level===2) {
        const frozenState = stable(s);
        await advance(page, 1800);
        assert.deepEqual(stable(await state(page)), frozenState);
      }
      await selectUpgrade(page, s);
    } else if (s.phase!=='playing') break;
    const result = await pilot(page, memo, mode);
    memo = result.memo; s = result.state;
    trace.push({time:s.elapsed,day:s.day,weight:s.weight,fat:s.bodyFat,muscle:s.muscle,
      level:s.level,xp:s.totalXp,workouts:s.workouts,weapons:s.weapons});
    if (screenshotPrefix && !mixedCaptured && s.phase==='playing' &&
        Object.values(s.weapons).filter(rank=>rank>0).length >= 3 && s.foods.length>=2) {
      await capture(page, screenshotPrefix + '-mixed-combat'); mixedCaptured=true;
    }
  }
  const final = await state(page);
  runs.push({mode,talent:final.talent,final,trace});
  return final;
}

async function touch(client, type, points) {
  await client.send('Input.dispatchTouchEvent', {type,touchPoints:points});
}
async function center(locator) {
  const box = await locator.boundingBox(); assert.ok(box);
  return {x:box.x+box.width/2,y:box.y+box.height/2};
}

(async () => {
  fs.mkdirSync(output,{recursive:true});
  const preflight = await fetch(base+'/game/sui-fitness');
  assert.ok(preflight.ok, 'Target server must respond before opening Chrome');
  const helper = await import('./tests/helpers/fitness-pilot.mjs');
  decisionSource = helper.fitnessDecision.toString(); choose=helper.fitnessUpgrade;
  const browser = await chromium.launch({channel:'chrome',headless:process.env.FITNESS_HEADED!=='1',args:['--mute-audio']});
  let passed=false;
  try {
    const desktop = await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
    await prepare(desktop);
    await desktop.addInitScript(() => { try {localStorage.setItem('sui-fitness-record-v1',JSON.stringify({best:777,wins:2,runs:3}));} catch {} });
    const page = await open(desktop);
    const initial = await state(page);
    assert.equal(initial.weight,48); assert.equal(initial.bodyFat,35); assert.equal(initial.level,1);
    await capture(page,'01-desktop-ready-talents');
    await page.locator('[data-talent="swimmer"]').click();
    assert.equal((await state(page)).weapons.water,1);
    assert.match(page.url(),/talent=swimmer/);
    await button(page,'分享游戏').click();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/talent=swimmer/);
    await page.reload(); await ready(page); await advance(page,0);
    assert.equal((await state(page)).talent,'swimmer');
    await page.locator('[data-talent="strength"]').click();
    await button(page,'玩法说明').click();
    const instructions = await page.getByRole('dialog').innerText();
    assert.match(instructions,/40.00/); assert.match(instructions,/22%/);
    assert.match(instructions,/牛肉干/); assert.match(instructions,/西西里/);
    await capture(page,'02-desktop-rules');
    await button(page,'收起说明').click();
    await page.locator('#start-fitness').click();
    const before=await state(page);
    await page.keyboard.down('ArrowRight'); await advance(page,180); await page.keyboard.up('ArrowRight');
    assert.ok((await state(page)).player.x > before.player.x+25);
    await page.keyboard.down('d'); await page.keyboard.press('Space'); await advance(page,80); await page.keyboard.up('d');
    assert.ok((await state(page)).dashCooldown > 0);
    await page.keyboard.press('q'); await advance(page,20);
    assert.ok((await state(page)).pulseCooldown > 0);
    await advance(page,500); // Finish the ongoing dash before testing cleared held movement.
    await page.keyboard.press('p'); await frozen(page); await capture(page,'03-desktop-paused');
    await page.keyboard.press('p'); assert.equal((await state(page)).phase,'playing');
    await page.keyboard.down('d'); await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await frozen(page); await button(page,'继续挑战').click();
    const stopped=await state(page); await advance(page,100);
    assert.deepEqual((await state(page)).player,stopped.player); await page.keyboard.up('d');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await frozen(page);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal((await state(page)).phase,'paused'); await button(page,'继续挑战').click();
    await button(page,'玩法说明').click(); const helpState=stable(await state(page));
    await advance(page,1000); assert.deepEqual(stable(await state(page)),helpState);
    await button(page,'收起说明').click(); await button(page,'继续挑战').click();
    await page.keyboard.press('f'); await page.waitForFunction(()=>!!document.fullscreenElement);
    await button(page,'全屏').click(); await page.waitForFunction(()=>!document.fullscreenElement);
    scenarios.push('Three selectable talents, seed/talent sharing and reload, precise goals, normal keys, abilities, pause/blur/help/fullscreen');

    await page.keyboard.press('Escape'); await button(page,'重新挑战').click();
    let memo={forceKind:'gym'};
    const trainingStart=await state(page);
    for(let loop=0;loop<20;loop++) {
      if ((await state(page)).phase==='upgrade') await selectUpgrade(page);
      const result=await pilot(page,memo,'active',450,'gym'); memo=result.memo;
      if(result.state.workouts.gym>0) break;
    }
    const trained=await state(page);
    assert.ok(trained.workouts.gym>0);
    assert.ok(trained.level>=2 && trained.elapsed<15);
    assert.ok(trained.weight>47.7,'First workout must not instantly remove a kilogram');
    if(trained.phase==='upgrade') {
      const levelState=stable(trained); await advance(page,3000);
      assert.deepEqual(stable(await state(page)),levelState);
      await capture(page,'04-action-earned-upgrade');
      await selectUpgrade(page);
    }
    for (const kind of ['swim','home']) {
      const initialCount=(await state(page)).workouts[kind]; memo={forceKind:kind};
      for(let loop=0;loop<35;loop++) {
        const s=await state(page); if(s.phase==='upgrade') await selectUpgrade(page,s);
        const result=await pilot(page,memo,'active',450,kind); memo=result.memo;
        if(result.state.workouts[kind]>initialCount) break;
      }
      assert.ok((await state(page)).workouts[kind]>initialCount,'Public held-E training must complete '+kind);
    }
    const afterTraining=await state(page);
    if(afterTraining.phase==='upgrade') await selectUpgrade(page,afterTraining);
    await capture(page,'05-three-training-zones');
    scenarios.push('Actual held-E gym/swim/home, gentle first-workout weight change, first-wave XP upgrade, frozen choice and wave retention');
    const victory=await campaign(page,'active','06-strength');
    assert.equal(victory.phase,'won',JSON.stringify({weight:victory.weight,muscle:victory.muscle,reason:victory.resultReason}));
    assert.ok(victory.weight<=40+1e-9 && victory.bodyFat<=22 && victory.muscle>=55);
    assert.ok(victory.elapsed>150 && victory.elapsed<300);
    await capture(page,'07-strength-victory');
    const record=await readRecord(page);
    assert.ok(record.wins===1 && record.runs===1);
    await advance(page,1000); assert.deepEqual(await readRecord(page),record);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sui-fitness-record-v1')).best),777);
    await page.reload(); await ready(page); await advance(page,0);
    assert.deepEqual((await state(page)).records,record);
    await page.locator('#start-fitness').click();
    const failed=await campaign(page,'no-training');
    assert.equal(failed.phase,'lost'); assert.ok(failed.weight>44);
    assert.deepEqual(failed.workouts,{gym:0,swim:0,home:0});
    await capture(page,'08-no-training-loss');
    await button(page,'换个开局').click();
    assert.notEqual((await state(page)).seed,41); assert.equal((await state(page)).phase,'ready');
    scenarios.push('Active route reaches 40kg early with body-fat/muscle goals, no-training route fails, v2 records/reload/dedup preserve v1, new seed restart');

    const damage={dumbbell:victory.weaponDamage.dumbbell,water:victory.weaponDamage.water,rope:victory.weaponDamage.rope,aura:victory.weaponDamage.aura};
    for (const talent of ['swimmer','rhythm']) {
      const build=await open(desktop,41,talent);
      assert.equal((await state(build)).talent,talent);
      await build.locator('#start-fitness').click();
      const final=await campaign(build,'active',talent==='swimmer'?'09-swimmer':'10-rhythm');
      assert.equal(final.phase,'won',JSON.stringify(final));
      assert.ok(final.bodyFat<=22 && final.weight<=40+1e-9 && final.muscle>=55);
      for(const kind of Object.keys(damage)) damage[kind]+=final.weaponDamage[kind];
      await capture(build,talent==='swimmer'?'11-swimmer-victory':'12-rhythm-victory');
      await build.close();
    }
    assert.ok(Object.values(damage).every(value=>value>10),JSON.stringify(damage));
    scenarios.push('All three talent campaigns win using public inputs; four distinct weapon types actually damage enemies across mixed builds');

    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await prepare(mobile); const phone=await open(mobile,2,'rhythm');
    await capture(phone,'13-mobile-ready-talents');
    await phone.locator('#start-fitness').tap();
    const client=await mobile.newCDPSession(phone);
    const stick=await center(phone.locator('[data-testid="fitness-joystick"]'));
    const exercise=await center(button(phone,'锻炼 E'));
    await touch(client,'touchStart',[{id:11,x:stick.x,y:stick.y+26}]);
    await advance(phone,980);
    await touch(client,'touchMove',[{id:11,...stick}]);
    assert.ok((await state(phone)).player.y>530 && (await state(phone)).player.y<565);
    await touch(client,'touchStart',[{id:11,...stick},{id:22,...exercise}]);
    await phone.keyboard.down('e'); await advance(phone,400);
    const multi=await state(phone); assert.equal(multi.inputs.exercise,true); assert.ok(multi.exercise.progress>0);
    await capture(phone,'14-mobile-multitouch-training');
    await touch(client,'touchEnd',[{id:22,...exercise}]);
    await advance(phone,150); assert.equal((await state(phone)).inputs.exercise,true);
    await phone.keyboard.up('e'); await advance(phone,20); assert.equal((await state(phone)).inputs.exercise,false);
    await touch(client,'touchStart',[{id:11,...stick},{id:23,...exercise}]); await advance(phone,300);
    await touch(client,'touchCancel',[]); await advance(phone,20);
    assert.equal((await state(phone)).inputs.exercise,false); assert.equal((await state(phone)).inputs.pointer,-1);
    await button(phone,'锻炼 E').focus(); await phone.keyboard.down('Enter'); await phone.keyboard.down('Space');
    await advance(phone,200); await phone.keyboard.up('Enter'); assert.equal((await state(phone)).inputs.exercise,true);
    await phone.keyboard.up('Space'); await advance(phone,20); assert.equal((await state(phone)).inputs.exercise,false);
    await button(phone,'暂停').tap(); await frozen(phone);
    await phone.setViewportSize({width:320,height:720}); await capture(phone,'15-mobile-320-paused');
    await phone.setViewportSize({width:844,height:390}); await capture(phone,'16-mobile-landscape-paused');
    await button(phone,'继续挑战').tap();
    await phone.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e',repeat:true,bubbles:true})));
    await advance(phone,20); assert.equal((await state(phone)).inputs.exercise,false,'A stale repeated key cannot reactivate cleared training');
    await button(phone,'玩法说明').tap(); await capture(phone,'17-mobile-landscape-help');
    await button(phone,'收起说明').tap(); await phone.setViewportSize({width:390,height:844});
    if((await state(phone)).phase==='paused') await button(phone,'继续挑战').tap();
    memo={forceKind:'home'};
    for(let loop=0;loop<15;loop++) {
      const result=await pilot(phone,memo,'active',450,'home');memo=result.memo;
      if(result.state.phase==='upgrade') break;
    }
    assert.equal((await state(phone)).phase,'upgrade');
    await capture(phone,'18-mobile-earned-upgrade'); await selectUpgrade(phone);
    scenarios.push('True CDP multi-touch joystick/E hold, physical/touch ownership, independent release, cancellation, dual Enter/Space holds, 320/390px/landscape and mobile XP choice');

    const blocked=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await prepare(blocked);
    await blocked.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage denied');};Storage.prototype.setItem=()=>{throw new Error('Storage denied');};});
    const blockedPage=await open(blocked,3,'swimmer');
    await blockedPage.locator('#start-fitness').tap();
    const blockedEnd=await campaign(blockedPage,'active');
    assert.equal(blockedEnd.phase,'won'); await capture(blockedPage,'19-storage-blocked-victory');
    await button(blockedPage,'重新挑战').tap(); assert.equal((await state(blockedPage)).phase,'playing');
    await blockedPage.reload(); await ready(blockedPage);
    assert.equal((await state(blockedPage)).phase,'ready');
    scenarios.push('Storage-denied/reduced-motion talent campaign wins, restart and reload remain playable');

    const live=await desktop.newPage();
    await live.goto(base+'/game/sui-fitness?seed=41&talent=swimmer',{waitUntil:'domcontentloaded'}); await ready(live);
    await live.locator('#start-fitness').click();
    const liveBefore=await state(live);
    await live.keyboard.down('ArrowRight'); await live.waitForTimeout(450); await live.keyboard.up('ArrowRight');
    const liveMoved=await state(live); assert.ok(liveMoved.player.x>liveBefore.player.x+40);
    await live.waitForFunction(()=>JSON.parse(window.render_game_to_text()).elapsed>=1.5);
    const spawned=await state(live); assert.ok(spawned.foods.length>0);
    await live.keyboard.press('p'); const paused=await state(live); await live.waitForTimeout(300);
    const frozenLive=await state(live); assert.deepEqual(stable(frozenLive),stable(paused));
    await live.keyboard.press('p'); await live.waitForTimeout(200);
    const resumed=await state(live); assert.equal(resumed.phase,'playing'); assert.ok(resumed.elapsed>paused.elapsed);
    liveObservations.push({usedAdvanceTime:false,before:liveBefore,moved:liveMoved,spawned,paused,frozen:frozenLive,resumed});
    scenarios.push('Fresh real-RAF ranged page moves, spawns enemies, freezes on pause, resumes with P without advanceTime');
    passed=true;
    console.log(JSON.stringify({passed,scenarios:scenarios.length,screenshots:shots.length,
      campaigns:runs.map(({mode,talent,final})=>({mode,talent,phase:final.phase,time:final.elapsed,weight:final.weight,fat:final.bodyFat,level:final.level})),errors,responses}));
  } finally {
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed,base,scenarios,errors,responses,shots,runs,liveObservations},null,2));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
