const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3958';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-underground-browser';
const errors=[], evidence=[];
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function step(p, ms, input={x:0,z:0}) { await p.evaluate(({ms,input})=>{window.nightRain.input(input);window.advanceTime(ms);},{ms,input}); }
async function capture(p,name) {
 await step(p,0);await p.waitForTimeout(name.includes('arrival')?700:300);
 const layout=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:[...document.querySelectorAll('canvas')].map(c=>[c.width,c.height]),dom:document.body.innerText}));
 assert.ok(layout.scroll<=layout.width); assert.ok(layout.canvas.every(c=>c[0]>0&&c[1]>0));
 const file=path.join(out,name+'.png'); const pixels=inspectPng(await p.screenshot({path:file,fullPage:true,animations:name.includes('arrival')?'allow':'disabled'}));
 const snapshot=await state(p);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({state:snapshot,layout,pixels},null,2));evidence.push({file,pixels});
}
async function main(){
 fs.mkdirSync(out,{recursive:true}); assert.equal((await fetch(base+'/game/night-rain')).status,200);
 const {loadTypescriptModule:load}=await import('./tests/helpers/load-typescript-module.mjs');
 const {walkTo}=await import('./tests/helpers/night-rain-pilot.mjs');
 const e=await load('src/components/nightRain/engine.ts'),w=await load('src/components/nightRain/world.ts'),d=await load('src/components/nightRain/dungeons.ts'),c=await load('src/components/nightRain/companion.ts');
 const seed=e.loadGame(fs.readFileSync('scripts/tests/fixtures/night-rain-valley-v6.json','utf8'));assert.ok(seed);
 const route=(s,p)=>{const r=c.findPath(s.player,p,s);assert.ok(r.length,JSON.stringify(p));for(const q of r.slice(1))walkTo(e,s,q,180000);};
 const place=(s,p)=>{Object.assign(s.player,p,{lastGround:{...p},fallPeak:p.y});e.stepGame(s,1);};
 const fixtures={};
 const crypt=e.loadGame(e.saveGame(seed));assert.ok(e.travelToLamp(crypt,'courtyard'));route(crypt,{x:-31,y:6,z:-23.5});fixtures.crypt=e.saveGame(crypt);
 const cave=e.loadGame(e.saveGame(seed));route(cave,{x:-137,y:2,z:-316});fixtures.cave=e.saveGame(cave);
 const gear=e.loadGame(e.saveGame(seed));
 for(const id of ['crypt','cave']){
  place(gear,d.DUNGEON_PORTALS[id+'-entrance'].destination);
  const items=id==='crypt'?['crypt-lamp','crypt-note','ossuary-mail','grave-spear','grave-seal']:['cave-lamp','cave-note','reed-cape','cave-daggers','stone-maul','tide-knot'];
  for(const item of items){if(item==='stone-maul'){route(gear,d.dungeonPoint('cave',{x:91,y:0,z:125}));route(gear,d.dungeonPoint('cave',{x:100,y:0,z:133}));}route(gear,w.interactionPoint(w.LANDMARKS.find(l=>l.id===item)));e.interact(gear);}
 }
 route(gear,w.REST_POINTS['cave-lamp']);e.interact(gear);while(e.forgeWeapon(gear)){}e.equipWeapon(gear,'umbrella');fixtures.gear=e.saveGame(gear);assert.ok(e.loadGame(fixtures.gear));
 fs.writeFileSync(path.join(out,'fixtures.json'),JSON.stringify(fixtures));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
 async function open(save,width=1440){
  const ctx=await browser.newContext({viewport:{width,height:width<500?844:900}});
  await ctx.route('https://pagead2.googlesyndication.com/**',r=>r.fulfill({contentType:'application/javascript',body:''}));await ctx.route('https://hm.baidu.com/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
  await ctx.addInitScript(installVirtualPointerLock);
  await ctx.addInitScript(save=>{if(!localStorage.getItem('night-rain-v1-slot-1'))localStorage.setItem('night-rain-v1-slot-1',save);localStorage.setItem('night-rain-v1-settings',JSON.stringify({enabled:true,voice:false}));localStorage.setItem('night-rain-audio-v1',JSON.stringify({muted:true}));if('speechSynthesis'in window)window.speechSynthesis.speak=()=>{};},save);
  const p=await ctx.newPage();p.on('pageerror',er=>errors.push(er.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto(base+'/game/night-rain',{waitUntil:'networkidle'});await p.waitForFunction(()=>window.nightRain&&document.querySelector('canvas')?.width>0&&!document.body.innerText.includes('旧城即将亮灯'));
  await p.getByRole('button',{name:'继续雨夜旅程 →',exact:true}).click();await step(p,0);return{p,ctx};
 }
 try{
  for(const id of ['crypt','cave']){
   const {p,ctx}=await open(fixtures[id]);await capture(p,id+'-01-outside');
   const upper=d.DUNGEONS[id].upper;
   for(let i=0;i<75;i++){const s=await state(p);const dx=upper.x-s.player.x,dz=upper.z-s.player.z;const dist=Math.hypot(dx,dz);if(dist<.2)break;await step(p,40,{x:dx/dist,z:dz/dist});if(i===38)await capture(p,id+'-02-arrival');}
   let s=await state(p);assert.ok(s.discoveredDungeons.includes(id));assert.ok(Math.hypot(s.player.x-upper.x,s.player.z-upper.z)<.3);
   await capture(p,id+'-03-platform');await step(p,40,{x:0,z:0,interact:true});s=await state(p);assert.ok(s.liftRide);const resources=[s.player.hp,s.player.flasks];
   await step(p,1800,{x:1,z:1,heavy:true,jump:true});s=await state(p);assert.equal(s.player.x,upper.x);assert.equal(s.player.z,upper.z);assert.ok(s.player.y<upper.y);
   await capture(p,id+'-04-descending');await p.keyboard.press('p');const pausedY=(await state(p)).player.y;await step(p,1000);assert.equal((await state(p)).player.y,pausedY);await p.keyboard.press('p');
   await step(p,1000);await p.evaluate(()=>window.nightRain.save());const mid=(await state(p)).player.y;
   await p.reload({waitUntil:'networkidle'});await p.getByRole('button',{name:'继续雨夜旅程 →',exact:true}).click();await step(p,0);assert.ok(Math.abs((await state(p)).player.y-mid)<1.5,JSON.stringify({mid,after:(await state(p)).player.y,ride:(await state(p)).liftRide}));
   await step(p,5500);s=await state(p);assert.equal(s.liftRide,null);assert.equal(s.player.y,d.DUNGEONS[id].floor);assert.deepEqual([s.player.hp,s.player.flasks],resources);await capture(p,id+'-05-underground');
   await step(p,500,{x:0,z:1});await capture(p,id+'-06-hall');await step(p,500,{x:0,z:-1});
   await step(p,40,{x:0,z:0,interact:true});assert.equal((await state(p)).liftRide?.direction,'up');await step(p,3000);await capture(p,id+'-07-returning');await step(p,5000);assert.equal((await state(p)).player.y,upper.y);
   await p.keyboard.press('m');await capture(p,id+'-08-map');assert.ok(await p.getByRole('button',{name:d.DUNGEONS[id].name,exact:true}).count());
   assert.equal(await p.locator('svg title').filter({hasText:'升降台 · 返回地面'}).count(),1);
   assert.equal(await p.locator('svg title').filter({hasText:'地面入口'}).count(),1);await ctx.close();
  }
  for(const width of [1440,320]){
   const {p,ctx}=await open(fixtures.gear,width);await p.keyboard.press('e');await p.evaluate(()=>window.advanceTime(40));assert.equal((await state(p)).panel,'lamp');await p.getByRole('button',{name:/更换行装 · 武器/}).click();
   const ids=await p.locator('[data-equipment-art]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-equipment-art')));assert.equal(ids.length,13);assert.equal(new Set(ids).size,13);
   for(const [section,selector]of[['weapons','umbrella'],['armor','traveler'],['talismans','goldBell']]){await p.locator('[data-equipment-art="'+selector+'"]').scrollIntoViewIfNeeded();await capture(p,'gear-'+width+'-'+section);}
   await p.getByRole('button',{name:/双苇短刃/}).click();assert.equal((await state(p)).weapon,'reedDaggers');await p.getByRole('button',{name:/风苇披风/}).click();assert.equal((await state(p)).gear.armor,'reedCape');
   await p.getByRole('button',{name:'关闭',exact:true}).click();await p.getByRole('button',{name:/锻造与更换武器/}).click();assert.equal(await p.locator('[data-equipment-art]').count(),3);await capture(p,'forge-'+width);await ctx.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({errors,evidence,checks:{shafts:2,continuousTravel:true,midrideReload:true,pause:true,equipmentPortraits:13,widths:[1440,320]}},null,2));console.log(JSON.stringify({screenshots:evidence.length,errors,output:out}));
 }finally{await browser.close();}
}
main().catch(er=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:er.message,stack:er.stack,errors,evidence},null,2));console.error(er);process.exitCode=1;});
