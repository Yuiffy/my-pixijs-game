const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3870';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-enemies';
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
 try{
 const {page,context}=await open(browser);const pilot=fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs','utf8').replaceAll('export ','');await page.addScriptTag({content:pilot+';window.nightRainPilot={chooseInput,NIGHT_ROUTE};'});
 await page.keyboard.press('c');await page.getByLabel('宝宝模式 有人陪你探索与认路').uncheck();await page.getByRole('button',{name:'关闭',exact:true}).click();
 const route=await page.evaluate(()=>window.nightRainPilot.NIGHT_ROUTE.slice(0,7));for(const target of route)await walk(page,target);
 await page.evaluate(()=>window.nightRain.resetCamera());await page.mouse.wheel(0,-400);
 const approach=async id=>{
  const result=await page.evaluate(id=>{
   for(let i=0;i<2000;i++){const s=window.nightRain.getState();const e=s.enemies.find(e=>e.id===id);const p=s.player;const d=Math.hypot(e.x-p.x,e.z-p.z);
    if(s.mode!=='playing')return false;if(e.action==='windup')return true;
    window.nightRain.input({x:d>1.8?(e.x-p.x)/d:0,z:d>1.8?(e.z-p.z)/d:0,lock:d<6&&!s.lockedId});window.advanceTime(10);
   }return false;
  },id);if(!result)fs.writeFileSync(path.join(out,'approach-failed.json'),JSON.stringify(await state(page),null,2));assert.ok(result,`approach ${id}`);
 };
 const awaitPhase=async(id,action,timer)=>{
  const ok=await page.evaluate(({id,action,timer})=>{for(let i=0;i<2500;i++){const s=window.nightRain.getState();const e=s.enemies.find(e=>e.id===id);if(s.mode!=='playing')return false;if(e.action===action&&e.timer<=timer)return true;window.nightRain.input({x:0,z:0});window.advanceTime(5);}return false;},{id,action,timer});assert.ok(ok,`${id} ${action} ${timer}`);
 };
 await approach('courtyard-prowler');await awaitPhase('courtyard-prowler','windup',.65);await capture(page,'01-prowler-raise');await awaitPhase('courtyard-prowler','windup',.32);await capture(page,'02-prowler-gather');await awaitPhase('courtyard-prowler','windup',.035);await capture(page,'03-prowler-release');await awaitPhase('courtyard-prowler','attack',.14);await capture(page,'04-prowler-contact');await awaitPhase('courtyard-prowler','recover',.45);await capture(page,'05-prowler-recover');
 // A subsequent strike is parried via the same visible release window.
 const parried=await page.evaluate(()=>{const count=window.nightRain.getState().parries;for(let i=0;i<1200;i++){const s=window.nightRain.getState();if(s.parries>count)return true;if(s.mode!=='playing')return false;window.nightRain.input(window.nightRainPilot.chooseInput(s,s.enemies[0],{parryOnly:true}));window.advanceTime(10);}return false;});assert.ok(parried);await capture(page,'06-parry-readable-release');checks.push('real windup/strike/recovery frames and timed parry in a legal encounter');
 await walk(page,{x:-4,z:3});await walk(page,{x:-8,z:2});await approach('alley-guard');await awaitPhase('alley-guard','windup',.5);await capture(page,'07-guard-overhead');await awaitPhase('alley-guard','attack',.14);await capture(page,'08-guard-strike');await walk(page,{x:-12,z:-3});
 for(const target of [{x:-15.5,z:-5},{x:-15.5,z:-16},{x:-15.5,z:-22.5}])await walk(page,target);
 await approach('roof-duelist');await awaitPhase('roof-duelist','windup',.26);await capture(page,'09-duelist-draw');await awaitPhase('roof-duelist','attack',.14);await capture(page,'10-duelist-cut');await walk(page,{x:-5,z:-22.5});
 await page.keyboard.press('r');await advance(page,1200);
 // Follow the legal stairs into the market; never move actors by assignment.
 for(const target of [{x:2.5,z:-22.5},{x:2.5,z:-29}])await walk(page,target);
 await approach('market-boss');await awaitPhase('market-boss','windup',.32);await capture(page,'11-boss-draw');await awaitPhase('market-boss','attack',.14);await capture(page,'12-boss-thrust');
 const seek=async(predicate)=>{const ok=await page.evaluate(predicate=>{const check=new Function('e','return '+predicate);for(let i=0;i<10000;i++){const s=window.nightRain.getState();const e=s.enemies.find(e=>e.kind==='boss');if(check(e))return true;if(s.mode!=='playing'||e.hp<=0)return false;window.nightRain.input(window.nightRainPilot.chooseInput(s,e,{parryOnly:true}));window.advanceTime(10);}return false;},predicate);assert.ok(ok,predicate);};
 await seek("e.action==='windup'&&e.attackIndex%3===1&&e.timer<.5&&e.timer>.2");await capture(page,'13-boss-overhead');
 await seek("e.action==='windup'&&e.phase===2&&e.attackIndex%3===2&&e.timer<.4&&e.timer>.2");await capture(page,'14-boss-sweep-gather');await advance(page,310,{dodge:true,x:1});await awaitPhase('market-boss','attack',.14);await capture(page,'15-boss-sweep');
 checks.push('guard and duelist full-body silhouettes, boss thrust, no gameplay state injection');await context.close();assert.deepEqual(errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,evidence},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
