const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3885';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-world';
const errors = []; const checks = []; const evidence = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms, input) => page.evaluate(({ ms, input }) => { if (input) window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });
async function capture(page, name) {
  await advance(page, 0); await page.waitForTimeout(250); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
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
   const s=window.nightRain.getState(); const danger=s.enemies.some(e=>e.hp>0&&e.aggro&&Math.abs(e.y-s.player.y)<1.5&&!(target.ignoreBoss&&e.kind==='boss')&&Math.hypot(e.x-s.player.x,e.z-s.player.z)<8);
   if(Math.hypot(s.player.x-target.x,s.player.z-target.z)<.22&&!danger&&s.player.action==='idle')return true;
   window.nightRain.input(window.nightRainPilot.chooseInput(s,target));window.advanceTime(40);
  } return false;
 },target);if(!ok)fs.writeFileSync(path.join(out,'stalled.json'),JSON.stringify({target,state:await state(page)},null,2));assert.ok(ok,`legal route reaches ${JSON.stringify(target)}`);
}


async function face(page,point){
 await page.evaluate(point=>{window.nightRain.resetCamera();const s=JSON.parse(window.render_game_to_text());const yaw=Math.atan2(s.player.x-point.x,s.player.z-point.z);document.dispatchEvent(new MouseEvent('mousemove',{movementX:(s.camera.yaw-yaw)/(.003*s.controls.look.mouse),movementY:0,bubbles:true}));},point);
 await advance(page,0);await page.waitForTimeout(250);
}

async function main(){
 fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(`${base}/game/night-rain`)).status,200);
 const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');const guide=await loadTypescriptModule('src/components/nightRain/companion.ts');const world=await loadTypescriptModule('src/components/nightRain/world.ts');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
 try{
 const {context,page}=await open(browser);
 const pilot=fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs','utf8').replaceAll('export ','');await page.addScriptTag({content:pilot+';window.nightRainPilot={chooseInput,NIGHT_ROUTE};'});
 const travel=async id=>{const s=await state(page);const dest=typeof id==='string'?world.interactionPoint(world.LANDMARKS.find(l=>l.id===id)):id;const path=guide.findPath(s.player,dest,s);assert.ok(path.length,`path ${id}`);for(const point of path.slice(1))await walk(page,{...point,ignoreBoss:true});};
 const use=async id=>{await travel(id);await page.keyboard.press('e');await advance(page,30);};
 await page.keyboard.press('Escape');await page.getByLabel('宝宝模式 有人陪你探索与认路').uncheck();await page.getByRole('button',{name:'继续旅程',exact:true}).click();await capture(page,'01-healing-hud');
 await travel('courtyard');await capture(page,'01b-unlit-lamp');
 const initial=await state(page);await page.keyboard.press('e');await advance(page,1);const ignited=await state(page);
 assert.equal(ignited.checkpoint,'courtyard');assert.equal(ignited.restCount,initial.restCount);assert.equal(ignited.player.hp,initial.player.hp);assert.equal(ignited.player.flasks,initial.player.flasks);assert.deepEqual(ignited.enemies.map(e=>e.hp),initial.enemies.map(e=>e.hp));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('night-rain-v1')).checkpoint),'courtyard');await capture(page,'02-courtyard-recorded');
 // Receive a real hit, then leave combat through ordinary inputs and heal/rest.
 const damaged=await page.evaluate(()=>{for(let i=0;i<900;i++){const s=window.nightRain.getState();const e=s.enemies[0];const p=s.player;const d=Math.hypot(e.x-p.x,e.z-p.z);if(p.hp<100)return true;window.nightRain.input({x:d>1.5?(e.x-p.x)/d:0,z:d>1.5?(e.z-p.z)/d:0});window.advanceTime(20);}return false;});assert.ok(damaged);
 await travel('courtyard');const before=(await state(page)).player;await page.keyboard.press('r');await advance(page,450);assert.equal((await state(page)).player.action,'heal');await capture(page,'03-drink-medicine');await advance(page,800);assert.ok((await state(page)).player.hp>before.hp);assert.equal((await state(page)).player.flasks,before.flasks-1);
 const paidBefore=await state(page);await page.keyboard.press('e');await advance(page,1);const rested=await state(page);assert.equal(rested.rice,paidBefore.rice);assert.equal(rested.restCount,paidBefore.restCount+1);assert.equal(rested.player.flasks,3);assert.equal(rested.player.hp,100);assert.ok(rested.enemies[0].hp>0);await capture(page,'03b-free-rest');checks.push('first ignition without reset, immediate storage, subsequent free rest restores resources and ordinary enemies; real R healing');
 await travel({x:-30.5,y:0,z:-3.8});await page.keyboard.press('e');await capture(page,'04-water-gate-below');assert.equal((await state(page)).templeGate,false);
 await travel({x:-23,y:6,z:-27});await capture(page,'05-bell-bridge');await use('temple-flask');assert.equal((await state(page)).flaskUpgrade,true);await capture(page,'06-temple-reward');
 await use('temple-note');assert.equal((await state(page)).messageKind,'lore');await capture(page,'07-temple-inscription');
 await travel({x:-32,y:3.6,z:-18});await capture(page,'08-temple-descent');await travel('temple-lamp');const spentBefore=await state(page);await page.keyboard.press('e');await advance(page,1);assert.equal((await state(page)).checkpoint,'courtyard');assert.equal((await state(page)).player.flasks,spentBefore.player.flasks);assert.equal((await state(page)).restCount,spentBefore.restCount);await capture(page,'09-lotus-lamp');
 await travel({x:-28,y:0,z:-8.5});await face(page,{x:-26.4,z:-6});await capture(page,'09b-water-winch-inside');await page.keyboard.press('e');await advance(page,1);assert.equal((await state(page)).templeGate,true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('night-rain-v1')).templeGate),true);await page.waitForTimeout(900);await capture(page,'10-water-gate-open');await travel({x:-22,y:0,z:-2});await use('courtyard');checks.push('west loop, flask upgrade, inert old lamp, one-sided winch and traversable water gate');
 await travel({x:12,y:0,z:-6.6});await face(page,{x:14,z:-8});await page.keyboard.press('e');assert.equal((await state(page)).shortcut,false);await capture(page,'10b-canal-outside');
 await travel({x:12,y:0,z:-10.7});await face(page,{x:14,z:-8});await capture(page,'10c-canal-winch-inside');await page.keyboard.press('e');await advance(page,1);assert.equal((await state(page)).shortcut,true);await travel({x:12,y:0,z:-6.6});await face(page,{x:14,z:-8});await capture(page,'10d-canal-open');await use('courtyard');
 await page.evaluate(()=>{window.virtualPad={index:0,id:'QA pad',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.virtualPad]});});await advance(page,20);
 const levelBefore=(await state(page)).level;await page.evaluate(()=>{window.virtualPad.buttons[12]={pressed:true,value:1};});await advance(page,20);assert.equal((await state(page)).level,levelBefore+1);await page.evaluate(()=>{window.virtualPad.buttons[12]={pressed:false,value:0};});await advance(page,20);checks.push('virtual gamepad paid upgrade remains separate from free rest');
 await use('canal-lamp');assert.equal((await state(page)).checkpoint,'courtyard');await capture(page,'11-ferry-old-lamp');await page.keyboard.press('m');await capture(page,'12-expanded-map');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(()=>window.nightRain.save());const saved=await state(page);await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'继续雨夜旅程 →',exact:true}).click();await advance(page,0);const restored=await state(page);assert.equal(restored.checkpoint,'courtyard');assert.equal(restored.templeGate,true);assert.equal(restored.player.flasks,4);assert.deepEqual(restored.collected,saved.collected);
 await page.addScriptTag({content:pilot+';window.nightRainPilot={chooseInput,NIGHT_ROUTE};'});
 await travel({x:4,y:0,z:-37});await advance(page,5000,{});for(let i=0;i<15&&(await state(page)).mode==='playing';i++)await advance(page,3000,{});assert.equal((await state(page)).mode,'dead');await capture(page,'13-death');await page.getByRole('button',{name:'回到雨灯',exact:true}).click();await advance(page,0);assert.equal((await state(page)).player.x,world.REST_POINTS.courtyard.x);assert.equal((await state(page)).player.z,world.REST_POINTS.courtyard.z);assert.equal((await state(page)).player.flasks,4);await capture(page,'14-respawn-at-courtyard');checks.push('sole lamp, persistent doors/medicine, reload, genuine death and courtyard respawn');
 await context.close();const phone=await open(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});await capture(phone.page,'15-mobile-medicine');await phone.page.keyboard.press('m');await capture(phone.page,'16-mobile-map');await phone.context.close();assert.deepEqual(errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,evidence,devices:'Silent hidden Chrome; virtual pointer, ordinary movement/combat inputs only'},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
