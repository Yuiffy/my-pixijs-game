const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3870';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-defense';
const errors = []; const checks = []; const evidence = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms, input) => page.evaluate(({ ms, input }) => { if (input) window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });
async function capture(page, name) {
  await advance(page, 0); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = path.join(out, `${name}.png`); const snapshot = await state(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width,c.height]), text: document.body.innerText }));
  assert.ok(layout.width >= layout.scroll); assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0]);
  const pixels = inspectPng(await page.screenshot({path:file,fullPage:true}));
  evidence.push({file,pixels}); fs.writeFileSync(path.join(out,`${name}.json`),JSON.stringify({snapshot,layout,pixels},null,2));
}
async function open(browser, options={}) {
  const context=await browser.newContext({ viewport:{width:1440,height:900},...options }); await context.addInitScript(installVirtualPointerLock);
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/game/night-rain`,{waitUntil:'networkidle'}); await page.getByRole('button',{name:'出门找夜宵',exact:true}).waitFor();
  await page.getByRole('button',{name:'出门找夜宵',exact:true}).click(); await advance(page,0); return {context,page};
}
async function walk(page, target) {
 const ok = await page.evaluate(target => {
  for (let i=0;i<2500;i++) {
   const s=window.nightRain.getState(); const danger=s.enemies.some(e=>e.hp>0&&e.aggro&&Math.hypot(e.x-s.player.x,e.z-s.player.z)<8);
   if(Math.hypot(s.player.x-target.x,s.player.z-target.z)<.22&&!danger&&s.player.action==='idle')return true;
   window.nightRain.input(window.nightRainPilot.chooseInput(s,target));window.advanceTime(40);
  } return false;
 },target);assert.ok(ok,'legal route reaches screenshot stage');
}

async function main(){
 fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(`${base}/game/night-rain`)).status,200);
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
 try {
  const {context,page}=await open(browser);
  await page.keyboard.down('f');await advance(page,20);assert.equal((await state(page)).player.action,'parry');await page.keyboard.up('f');await advance(page,600);assert.equal((await state(page)).player.action,'idle');
  await page.keyboard.down('f');await advance(page,400);assert.equal((await state(page)).player.action,'guard');await advance(page,1000);assert.equal((await state(page)).player.action,'guard');await page.keyboard.up('f');await advance(page,10);assert.equal((await state(page)).player.action,'guardRelease');await advance(page,250);
  await page.keyboard.down('f');await advance(page,400);await page.keyboard.down('Alt');await advance(page,20);assert.equal((await state(page)).player.action,'idle');await page.keyboard.up('f');await page.keyboard.up('Alt');await advance(page,900);
  await page.keyboard.down('f');await advance(page,400);await page.keyboard.press('Escape');assert.equal((await state(page)).player.action,'idle');await page.keyboard.up('f');await page.getByRole('button',{name:'继续旅程',exact:true}).click();await advance(page,1000);checks.push('keyboard tap/hold/release, Alt and pause clear defense');
  const pilot=fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs','utf8').replaceAll('export ','');await page.addScriptTag({content:pilot+';window.nightRainPilot={chooseInput,NIGHT_ROUTE};'});
  const route=await page.evaluate(()=>window.nightRainPilot.NIGHT_ROUTE.slice(0,7));for(const target of route)await walk(page,target);
  // Approach a live enemy with legal movement. Catch its first real strike in guard.
  const block=await page.evaluate(()=>{
   for(let i=0;i<900;i++){
    const s=window.nightRain.getState();const e=s.enemies[0];const p=s.player;const gap=Math.hypot(e.x-p.x,e.z-p.z);
    if(s.effects.some(f=>f.kind==='block'))return {hp:p.hp,action:p.action};
    const defense=gap<2.2;
    window.nightRain.input({x:defense?0:(e.x-p.x)/gap,z:defense?0:(e.z-p.z)/gap,parry:defense&&p.action==='idle',guardHeld:defense,lock:defense&&!s.lockedId});window.advanceTime(20);
   }return null;
  });assert.ok(block);assert.equal(block.action,'guard');await capture(page,'01-guard-impact');
  const broken=await page.evaluate(()=>{for(let i=0;i<1000;i++){const s=window.nightRain.getState();if(s.player.action==='guardBreak')return true;if(s.mode!=='playing')return false;window.nightRain.input({x:0,z:0,guardHeld:true});window.advanceTime(20);}return false;});assert.ok(broken);await capture(page,'01b-guard-break');
  const parried=await page.evaluate(()=>{const count=window.nightRain.getState().parries;for(let i=0;i<1200;i++){const s=window.nightRain.getState();if(s.parries>count)return true;if(s.mode!=='playing')return false;window.nightRain.input(window.nightRainPilot.chooseInput(s,s.enemies[0],{parryOnly:true}));window.advanceTime(20);}return false;});assert.ok(parried);await capture(page,'01c-parry-contact');

  await walk(page,{x:1,z:8});await advance(page,1600,{ });
  await page.keyboard.press('c');await page.getByLabel('宝宝模式 有人陪你探索与认路').uncheck();await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.evaluate(()=>window.nightRain.resetCamera());await page.mouse.wheel(0,-220);
  // Side camera through virtual pointer movement; no OS pointer calls.
  await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:450,movementY:-55,bubbles:true})));
  await advance(page,10,{z:-1});await advance(page,1000,{});
  await advance(page,80,{parry:true});await capture(page,'02-parry-draw');await advance(page,90,{});await capture(page,'03-parry-deflect');await advance(page,90,{guardHeld:true});await advance(page,30,{guardHeld:true});await capture(page,'04-guard-brace');await advance(page,1000,{});
  await advance(page,60,{dodge:true,x:1});await capture(page,'05-roll-compress');await advance(page,100,{});await capture(page,'06-roll-shoulder');await advance(page,100,{});await capture(page,'07-roll-inverted');await advance(page,120,{});await capture(page,'08-roll-unfold');await advance(page,170,{});await capture(page,'09-roll-plant');await advance(page,100,{});assert.equal((await state(page)).player.action,'idle');checks.push('legal enemy block; parry and roll phase screenshots');await context.close();
  const pad=await open(browser);await pad.page.evaluate(()=>{window.virtualPad={index:0,id:'QA pad',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.virtualPad]});});await advance(pad.page,20);
  await pad.page.evaluate(()=>{window.virtualPad.buttons[4]={pressed:true,value:1};});await advance(pad.page,400);assert.equal((await state(pad.page)).player.action,'guard');await advance(pad.page,1000);assert.equal((await state(pad.page)).player.action,'guard');await pad.page.evaluate(()=>{window.virtualPad.buttons[4]={pressed:false,value:0};});await advance(pad.page,200);assert.equal((await state(pad.page)).player.action,'idle');checks.push('virtual standard gamepad LB hold and release');await pad.context.close();
  const phone=await open(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const touch=await phone.context.newCDPSession(phone.page);const rect=await phone.page.getByRole('button',{name:'弹反 / 防御',exact:true}).boundingBox();
  const down=()=>touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});
  await down();await advance(phone.page,400);assert.equal((await state(phone.page)).player.action,'guard');await capture(phone.page,'10-touch-guard');await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(phone.page,200);assert.equal((await state(phone.page)).player.action,'idle');
  await down();await advance(phone.page,400);await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await advance(phone.page,200);assert.equal((await state(phone.page)).player.action,'idle');await down();await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await advance(phone.page,20);assert.equal((await state(phone.page)).player.action,'idle');const subtitle=await phone.page.getByRole('status').filter({has:phone.page.locator('b')}).boundingBox();if(subtitle)assert.ok(subtitle.y+subtitle.height<rect.y);checks.push('CDP touch hold, release and cancellation including before first simulation tick');await phone.context.close();assert.deepEqual(errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,evidence,devices:'Silent headless installed Chrome; virtual Pointer Lock/Gamepad/CDP touch, no desktop input'},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
