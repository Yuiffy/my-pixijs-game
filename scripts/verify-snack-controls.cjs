const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.MINI_BASE_URL || 'http://localhost:3968';
const output = process.env.MINI_QA_DIR || 'tmp/snack-controls-dev';
const errors = [], captures = [], scenarios = [];
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (p, ms) => p.evaluate(ms => window.advanceTime(ms), ms);
const button = (p, name) => p.getByRole('button', {name, exact:true});
const inputs = async (p, expected) => assert.deepEqual((await state(p)).inputs, {talk:false,eat:false,mute:false,...expected});
async function prepare(context) {
 await context.addInitScript(() => { if(window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
 await context.route('**/api/record',r=>r.fulfill({json:{success:true}}));
 await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,r=>r.fulfill({body:''}));
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
}
async function open(p, kind='snack') {
 await p.goto(`${base}/game/${kind}`); await p.waitForFunction(()=>!!window.render_game_to_text);
 await p.waitForFunction(()=>!document.querySelector('#start-game')?.disabled);
}
async function capture(p,name) {
 await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(120);
 const dimensions=await p.locator('canvas').evaluate(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth}));
 assert.equal(dimensions.width,960); assert.ok(dimensions.cssWidth>200);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
 const file=path.join(output,`${name}.png`);
 const pixels=inspectPng(await p.screenshot({path:file,fullPage:true,animations:'disabled'}));
 captures.push({file,pixels,dimensions,state:await state(p)});
}
async function fresh(p) {
 await button(p,'新开一局').click(); await button(p,'同种子重开').click();
 await p.locator('#start-game').click(); await advance(p,0);
}
async function touchPoint(p,name,id) {
 const b=await button(p,name).boundingBox(); assert.ok(b);
 assert.ok(b.y>=0 && b.y+b.height<= (await p.evaluate(()=>innerHeight))+1,`${name} is within viewport`);
 return {id,x:b.x+b.width/2,y:b.y+b.height/2};
}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 assert.equal((await fetch(`${base}/game/snack`,{signal:AbortSignal.timeout(90000)})).status,200);
 const browser=await chromium.launch({channel:'chrome',headless:!process.env.HEADED,args:['--mute-audio','--disable-speech-api']});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:960}}); await prepare(context);
 const p=await context.newPage(); await open(p); await p.locator('#start-game').click(); await advance(p,0);
 for (const key of ['Enter','Space']) {
  await button(p,'按住静音').focus(); await p.keyboard.down(key); await inputs(p,{mute:true});
  await p.keyboard.up(key); await inputs(p,{});
 }
 await button(p,'按住说话').focus(); await p.keyboard.down('Enter'); await p.keyboard.down('Space');
 await p.keyboard.up('Enter'); await inputs(p,{talk:true}); await p.keyboard.up('Space'); await inputs(p,{});
 await p.keyboard.down('Enter'); await p.keyboard.press('Tab'); await inputs(p,{}); await p.keyboard.up('Enter');
 // A focused ordinary button retains native Space activation; it cannot talk.
 await button(p,'玩法说明').focus(); await p.keyboard.press('Space'); assert.equal((await state(p)).phase,'paused'); await inputs(p,{});
 await button(p,'收起说明').click(); await button(p,'继续直播').click();
 await button(p,'吃一口').focus(); await p.keyboard.down('Enter'); await advance(p,1600); assert.equal((await state(p)).eaten,1);
 await p.keyboard.down('Enter'); await advance(p,400); assert.equal((await state(p)).eaten,1); await p.keyboard.up('Enter'); await inputs(p,{});
 await capture(p,'01-keyboard-hold');
 await button(p,'点按保持').click(); assert.equal((await state(p)).controlMode,'toggle');
 await button(p,'切换说话').focus(); await p.keyboard.down('Enter'); await p.keyboard.down('Enter'); await inputs(p,{talk:true}); await p.keyboard.up('Enter'); await inputs(p,{talk:true});
 await p.keyboard.press('Enter'); await inputs(p,{});
 await button(p,'切换说话').click(); await advance(p,500); await inputs(p,{talk:true});
 await button(p,'切换静音').click(); await inputs(p,{talk:true,mute:true}); assert.equal((await state(p)).speech,'silent');
 await capture(p,'02-toggle-both');
 await p.keyboard.press('p'); await inputs(p,{}); const paused=await state(p); await advance(p,5000); assert.equal((await state(p)).time,paused.time);
 await capture(p,'03-pause-clears');
 await p.reload(); await p.waitForFunction(()=>!!window.render_game_to_text); await advance(p,0);
 assert.equal((await state(p)).controlMode,'toggle'); assert.equal((await state(p)).phase,'paused'); await inputs(p,{});
 await button(p,'继续直播').click(); await button(p,'切换说话').click(); await button(p,'按住操作').click(); await inputs(p,{});
 await button(p,'点按保持').click(); await button(p,'切换说话').click();
 await p.evaluate(()=>window.dispatchEvent(new Event('blur'))); assert.equal((await state(p)).phase,'paused'); await inputs(p,{});
 await button(p,'继续直播').click(); await fresh(p);
 // Complete five levels through the new latched buttons and single serving taps.
 for(let level=0;level<5;level++) {
  let s=await state(p), guard=0;
  while(s.phase==='playing' && guard++<30) {
   await button(p,'切换说话').click(); await advance(p,1300); await button(p,'切换说话').click();
   s=await state(p); const eatMs=[1400,2000,2600,3600][s.selected];
   await button(p,'切换静音').click(); await button(p,'吃一口').click(); await advance(p,eatMs+35);
   s=await state(p);
   if(s.phase==='playing') await button(p,'切换静音').click();
  }
  assert.equal(s.phase,level===4?'ending':'won',JSON.stringify(s)); assert.ok(s.best[level]>0); await inputs(p,{});
  if(level===2 || level===4) await capture(p,`04-level-${level+1}`);
  if(level<4) {await button(p,'准备下一关').click();await p.locator('#start-game').click();await advance(p,0);await inputs(p,{});}
 }
 const records=(await state(p)).best; await p.reload();await p.waitForFunction(()=>!!window.render_game_to_text);assert.deepEqual((await state(p)).best,records);
 scenarios.push('focused keyboard controls, repeat/blur cleanup, native button activation, toggle and pause, five-level campaign and record reload');
 // Real touch: multi-source holds, cancellation, latches and narrow screens.
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await prepare(mobile);
 const t=await mobile.newPage();await open(t);await t.locator('#start-game').tap();await advance(t,0);
 const cdp=await mobile.newCDPSession(t);
 const talk=await touchPoint(t,'按住说话',1), mute=await touchPoint(t,'按住静音',2);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[talk,mute]});await inputs(t,{talk:true,mute:true});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[talk]});await inputs(t,{mute:true});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await inputs(t,{});
 // A physical keyboard and touch hold can coexist.
 await t.keyboard.down('k');const muteAgain=await touchPoint(t,'按住静音',3);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[muteAgain]});await t.keyboard.up('k');await inputs(t,{mute:true});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await inputs(t,{});
 await button(t,'点按保持').tap();await button(t,'切换说话').tap();await inputs(t,{talk:true});
 await advance(t,1000);await capture(t,'05-touch-toggle-390');
 await button(t,'切换说话').tap();await inputs(t,{});
 await button(t,'切换静音').tap();await button(t,'吃一口').tap();await advance(t,1500);assert.equal((await state(t)).eaten,1);
 await capture(t,'06-touch-eat-390');
 await t.setViewportSize({width:320,height:740});await capture(t,'07-touch-320');
 await t.setViewportSize({width:844,height:390});await capture(t,'08-touch-landscape');
 await t.keyboard.press('p');await inputs(t,{});
 await mobile.close();
 scenarios.push('CDP multitouch, partial release, cancellation, keyboard plus touch, real toggle taps, 320/390px and landscape');
 // Shared MiniGame must preserve management games and ordinary button keyboard use.
 for(const kind of ['fab','agi']) {
  await open(p,kind);await p.locator('#start-game').click();
  if(kind==='fab') {await p.locator('[data-action="loan"]').click();assert.equal((await state(p)).player.debt,80);await button(p,'结算本季市场 →').focus();await p.keyboard.press('Space');assert.equal((await state(p)).turn,2);}
  else {const {aiAction}=require('./tests/helpers/agi-ui.cjs');await aiAction(p,'train');assert.equal((await state(p)).capability,24);}
  await capture(p,`09-shared-${kind}`);
 }
 const denied=await browser.newContext({viewport:{width:390,height:844}});await prepare(denied);
 await denied.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('Test storage unavailable');};});
 const d=await denied.newPage();await open(d);await d.locator('#start-game').click();await advance(d,0);await button(d,'点按保持').click();await button(d,'切换说话').click();await inputs(d,{talk:true});assert.match(await d.locator('main').innerText(),/本局仍可玩/);await capture(d,'10-storage-denied');await denied.close();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,scenarios,captures,errors},null,2));console.log(JSON.stringify({passed:true,captures:captures.map(c=>c.file),errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
