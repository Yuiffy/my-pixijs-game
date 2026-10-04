const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.TIDAL_DUEL_URL || 'http://127.0.0.1:4044/game/tidal-duel';
const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-contact/browser');
const publicOnly = process.env.TIDAL_DUEL_PUBLIC_MATCH === '1';
const step = 1000/120;
const names = { sui:'岁己', shiori:'栞栞', mizuki:'弥月' };
const keys = [
  { forward:'KeyD', back:'KeyA', down:'KeyS', punch:'KeyJ', heavy:'KeyL', ability:'KeyU' },
  { forward:'ArrowLeft', back:'ArrowRight', down:'ArrowDown', punch:'Digit1', heavy:'Digit3', ability:'Digit4' },
];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms=step) => page.evaluate(ms => window.advanceTime(ms),ms);
const button = (page,name) => page.getByRole('button',{ name, exact:true });
class CaptureFailure extends Error {}
async function until(page,predicate,limit=300) {
  for (let i=0;i<limit;i++) {
    const s = await state(page); if(predicate(s)) return s;
    await advance(page);
  }
  assert.fail('Contact transition missing: '+JSON.stringify(await state(page)));
}
async function press(page,codes,ms=step) {
  for(const code of codes) await page.keyboard.down(code);
  await advance(page,ms);
  for(const code of codes.toReversed()) await page.keyboard.up(code);
  await advance(page,0);
}
async function begin(page,actor='sui',opponent=actor,mode='local') {
  if((await state(page)).phase !== 'menu') {
    await button(page,'返回选人').last().click();
    if(await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button',{name:'返回选人',exact:true}).click();
  }
  await page.getByRole('button',{name:new RegExp(`${names[actor]}.*${actor.toUpperCase()}`)}).click();
  await page.locator('#duel-opponent').selectOption(opponent);
  await button(page,mode==='training'?'自由练习':'同机双人').click();
  if(mode==='training') await page.locator('#duel-dummy').selectOption('idle');
  await page.locator('#tidal-start').click(); await page.keyboard.press('Enter'); await advance(page,20);
  assert.equal((await state(page)).phase,'fight');
}
async function approach(page,gap=109) {
  const widening = Math.abs((await state(page)).fighters[1].x-(await state(page)).fighters[0].x)<gap;
  const code = widening ? keys[0].back : keys[0].forward;
  await page.keyboard.down(code);
  await until(page,s => widening ? Math.abs(s.fighters[1].x-s.fighters[0].x)>=gap : Math.abs(s.fighters[1].x-s.fighters[0].x)<=gap);
  await page.keyboard.up(code); await advance(page);
}
async function capture(page,report,name) {
  const file=path.join(output,`${name}.png`); let pixels;
  try { pixels=inspectPng(await page.screenshot({path:file,fullPage:true,animations:'disabled'})); }
  catch(e) { throw new CaptureFailure(e.message); }
  const s=await state(page);
  const dom=await page.evaluate(() => ({width:document.documentElement.scrollWidth,viewport:innerWidth,
    canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,rect:c.getBoundingClientRect().toJSON()}))}));
  assert.equal(s.assetsReady,true); assert.ok(dom.width<=dom.viewport+1);
  assert.equal(dom.canvas.length,1); assert.deepEqual([dom.canvas[0].width,dom.canvas[0].height],[1280,720]);
  assert.ok(dom.canvas[0].rect.width>0 && pixels.colors>8 && pixels.nearBlackRatio<.96 && pixels.transparentRatio<.98);
  report.screenshots.push({name,file,pixels,state:s,dom});
}
async function publicControls(page,report) {
  for(const [actor,gap] of [['sui',370],['shiori',410],['mizuki',330]]) {
    await begin(page,actor);
    await approach(page,gap);
    for(const k of keys) await page.keyboard.down(k.punch);
    await until(page,s=>s.events.some(e=>e.type==='clash'));
    for(const k of keys) await page.keyboard.up(k.punch);
    const s=await state(page); assert.ok(s.fighters.every(f=>f.hp===300 && f.state==='clash' && f.contact==='none'));
    await capture(page,report,`01-clash-${actor}`);
    await advance(page,500); assert.ok((await state(page)).fighters.every(f=>f.state==='idle'));
  }
  await begin(page); await approach(page);
  await press(page,keys.map(k=>k.punch),105);
  const traded=await state(page); assert.ok(traded.fighters.every(f=>f.hp<300 && f.state==='hit'));
  assert.equal(traded.events.filter(e=>e.type==='hit').length,2);
  await capture(page,report,'02-body-trade');
  for(const side of [0,1]) {
    await begin(page); await approach(page);
    await page.keyboard.down(keys[1-side].punch);
    await until(page,s=>s.fighters[1-side].moveTime>=.05);
    await page.keyboard.down(keys[side].back);
    await until(page,s=>s.events.some(e=>e.type==='perfectGuard'));
    await page.keyboard.up(keys[side].back); await page.keyboard.up(keys[1-side].punch);
    const s=await state(page), f=s.fighters[side];
    assert.equal(f.hp,300); assert.equal(f.guardGauge,100); assert.equal(s.fighters[1-side].contact,'block');
    await capture(page,report,`03-perfect-${side+1}P`);
  }
  for(const side of [0,1]) {
    await begin(page,side?'sui':'shiori',side?'shiori':'sui');
    await press(page,[keys[side].ability]);
    await until(page,s=>s.projectiles.length===1);
    // Determine the leading contact coordinate from shipped public contour data.
    // This only schedules the key press; all interaction uses real keyboard UI.
    await page.evaluate(async()=>{window.__tidalContourData=await(await fetch('/games/tidal-duel/pixel/collision-contours.json')).json();});
    const ahead = await page.evaluate(side=>{
      const s=JSON.parse(window.render_game_to_text()), f=s.fighters[1-side], pose=s.animation[1-side], p=s.projectiles[0];
      const frame=window.__tidalContourData.characters[f.character][pose.sheet][pose.index];
      const edges=frame.hurt.flatMap(([x,y,w,h])=>{
        const top=f.y+(y-440)*2, bottom=top+h*2;
        const dy=Math.max(top-p.y,p.y-bottom,0);
        if(dy>=35) return [];
        const radius=Math.sqrt(35*35-dy*dy);
        const left=f.x+(f.facing>0?(x-224)*2:-(x+w-224)*2);
        return [side ? left+w*2+radius : left-radius];
      });
      return side?Math.max(...edges):Math.min(...edges);
    },side);
    await until(page,s=>side ? s.projectiles[0]?.x<ahead+22 : s.projectiles[0]?.x>ahead-22);
    await page.keyboard.down(keys[1-side].punch); await page.keyboard.down(keys[1-side].heavy);
    await until(page,s=>s.events.some(e=>e.type==='reflect'));
    await page.keyboard.up(keys[1-side].heavy); await page.keyboard.up(keys[1-side].punch);
    const s=await state(page); assert.equal(s.projectiles.length,1); assert.equal(s.projectiles[0].side,1-side);
    assert.equal(s.projectiles[0].sourceCharacter,'shiori'); assert.equal(s.projectiles[0].reflections,1);
    assert.equal(s.fighters[1-side].hp,300);
    await capture(page,report,`04-reflect-${2-side}P`);
    await until(page,s=>s.fighters[side].hp<300); assert.equal((await state(page)).fighters[1-side].hp,300);
  }
  report.checks.push('Public real keyboard: all three distal clashes and symmetric recovery, close-range body trade, correct relative-back precision defense and reflected Shiori waves in both slots, origin retained and return actually damages its sender');
}
async function training(page,report) {
  for(const actor of ['sui','shiori','mizuki']) {
    await begin(page,actor,actor,'training'); await button(page,'判定框 关').click(); await advance(page,0);
    assert.ok((await state(page)).fighters.every(f=>f.boxes.hurt.length>3));
    assert.ok(await page.getByText('绿：受击 · 红：攻击 · 黄：推挤',{exact:true}).isVisible());
    await page.keyboard.down(keys[0].punch);
    await until(page,s=>s.fighters[0].boxes.strikes.length>0);
    await page.keyboard.up(keys[0].punch);
    const s=await state(page); assert.deepEqual(s.fighters[0].boxes.pose,s.animation[0]);
    assert.ok(s.fighters[0].boxes.strikes.length>1 && s.fighters[0].boxes.geometry==='contour');
    await capture(page,report,`05-training-${actor}`);
    await button(page,'重置站位').click(); await advance(page,0);
    assert.equal((await state(page)).fighters[0].perfectGuardFrames,0); assert.equal((await state(page)).fighters[0].boxes.attack,null);
  }
  await page.setViewportSize({width:390,height:844}); await capture(page,report,'06-mobile-boxes');
  await button(page,'玩法').click();
  assert.match(await page.getByRole('dialog').innerText(),/精确防御/);
  assert.match(await page.getByRole('dialog').innerText(),/每颗波最多返还一次/);
  await capture(page,report,'07-guide-mobile');
  report.checks.push('Training contour geometry uses the exact animation/anchor, three readable box colors and reset; 390px layout and updated guard/clash/reflect guide remain usable');
}
async function run(headless) {
  fs.mkdirSync(output,{recursive:true});
  const report={status:'running',url,publicOnly,browser:{channel:'chrome',headless,muted:true},checks:[],screenshots:[],errors:[]};
  let browser,page;
  try {
    assert.equal((await fetch(url,{signal:AbortSignal.timeout(30000)})).status,200);
    browser=await chromium.launch({channel:'chrome',headless,args:['--mute-audio','--disable-speech-api']});
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    await context.route(/\/api\/record(?:\?|$)/,r=>r.fulfill({contentType:'application/json',body:'{"success":true,"skipped":true}'}));
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,r=>r.fulfill({contentType:'application/javascript',body:''}));
    await context.addInitScript(()=>{
      localStorage.setItem('tidal-duel-cinematics','off');
      if(window.speechSynthesis) window.speechSynthesis.speak=()=>{};
      let id=0; window.requestAnimationFrame=()=>++id; window.cancelAnimationFrame=()=>{};
    });
    page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') report.errors.push(m.text());});
    await page.goto(url); await page.waitForFunction(()=>window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady,null,{polling:50});
    if(publicOnly) assert.equal(await page.evaluate(()=>typeof window.tidalDuel),'undefined');
    await publicControls(page,report); await training(page,report);
    assert.deepEqual(report.errors,[]); report.status='passed';
    console.log(JSON.stringify({status:report.status,checks:report.checks,screenshots:report.screenshots.length},null,2));
  } catch(e) {
    report.status='failed'; report.failure={message:e.message,stack:e.stack};
    if(page) report.lastState=await state(page).catch(()=>null);
    throw e;
  } finally {
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)); await browser?.close();
  }
}
(async()=>{try{await run(process.env.HEADED!=='1');}catch(e){if(!(e instanceof CaptureFailure))throw e;await run(false);}})().catch(e=>{console.error(e);process.exitCode=1;});
