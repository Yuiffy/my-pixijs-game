const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:4061';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-territory-browser';

async function main() {
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/night-rain')).status,200);
  const {loadTypescriptModule:load}=await import('./tests/helpers/load-typescript-module.mjs');
  const engine=await load('src/components/nightRain/engine.ts');
  const {supportAt}=await load('src/components/nightRain/world.ts');
  const {isBoss}=await load('src/components/nightRain/encounters.ts');
  const {findPath}=await load('src/components/nightRain/companion.ts');
  const errors=[],evidence=[],actions=[];
  const browser=await chromium.launch({channel:'chrome',headless:process.env.NIGHT_RAIN_HEADED!=='1',args:['--mute-audio','--disable-speech-api']});
  const fresh=()=>{const s=engine.createGame();engine.startGame(s);return s;};
  const place=(s,p)=>Object.assign(s.player,p,{facing:Math.PI,lastGround:{...p},fallPeak:p.y});
  async function open(s,width=1440) {
    const save=engine.saveGame(s);assert.ok(engine.loadGame(save),'validated setup save');
    const ctx=await browser.newContext({viewport:{width,height:width===390?844:900}});
    await ctx.route('https://pagead2.googlesyndication.com/**',r=>r.fulfill({body:''}));
    await ctx.route('https://hm.baidu.com/**',r=>r.fulfill({body:''}));
    await ctx.addInitScript(installVirtualPointerLock);
    await ctx.addInitScript(save=>{
      if(!sessionStorage.getItem('qa-initialized')) {localStorage.setItem('night-rain-v1-slot-1',save);sessionStorage.setItem('qa-initialized','1');}
      localStorage.setItem('night-rain-v1-settings',JSON.stringify({enabled:false,voice:false}));
      localStorage.setItem('night-rain-audio-v1',JSON.stringify({muted:true}));
      if('speechSynthesis' in window)window.speechSynthesis.speak=()=>{};
    },save);
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/game/night-rain',{waitUntil:'networkidle'});await resume(page);
    return {ctx,page};
  }
  async function resume(page) {
    await page.getByRole('button',{name:'继续雨夜旅程 →',exact:true}).waitFor();
    await page.evaluate(()=>{window.advanceTime(0);window.__qaFreeze=setInterval(()=>window.advanceTime(0),250);});
    await page.getByRole('button',{name:'继续雨夜旅程 →',exact:true}).click();
  }
  async function shot(page,name) {
    await page.waitForTimeout(350);
    const data=await page.evaluate(()=>({state:window.nightRain.getState(),textState:JSON.parse(window.render_game_to_text()),layout:{width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:[...document.querySelectorAll('canvas')].map(c=>[c.width,c.height]),text:document.body.innerText}}));
    assert.ok(data.layout.width>=data.layout.scroll);assert.equal(data.layout.canvas.length,1);assert.ok(data.layout.canvas[0][0]>0);
    const file=path.join(out,name+'.png');data.pixels=inspectPng(await page.screenshot({path:file,fullPage:true}));
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));evidence.push({file,pixels:data.pixels});return data.state;
  }
  const input=(page,action,ms=20)=>page.evaluate(({action,ms})=>{window.nightRain.input({x:0,z:0,...action});window.advanceTime(ms);},{action,ms});
  async function walk(page,axis,target,direction,sprint=false) {
    const result=await page.evaluate(({axis,target,direction,sprint})=>{
      let n=0;for(;n<700;n++){const p=window.nightRain.getState().player;if(direction>0?p[axis]>=target:p[axis]<=target)break;
        window.nightRain.input({x:0,z:0,[axis]:direction,sprint});window.advanceTime(20);}
      return {n,player:window.nightRain.getState().player};
    },{axis,target,direction,sprint});assert.ok(result.n<700,JSON.stringify(result));return result;
  }
  try {
    const s=fresh();place(s,{x:-191.5,y:2,z:-388.5});
    // Clear ordinary patrols only for the isolated traversal; combat is exercised below.
    for(const e of s.enemies)if(!isBoss(e)){e.hp=0;e.action='dead';}
    const {ctx,page}=await open(s);await page.mouse.wheel(0,350);await shot(page,'court-approach');
    await walk(page,'z',-401.65,-1,true);await shot(page,'roof-jump-read');
    await input(page,{z:-1,sprint:true,jump:true});await input(page,{z:-1,sprint:true},1200);
    assert.equal((await page.evaluate(()=>window.nightRain.getState())).player.y,5.8);
    await input(page,{interact:true});assert.ok((await shot(page,'roof-pickaxe-reward')).collected.includes('nana-pickaxe'));
    await walk(page,'z',-415,-1);await input(page,{},800);
    assert.equal((await page.evaluate(()=>window.nightRain.getState())).player.y,2);
    const current=await page.evaluate(()=>window.nightRain.getState());
    const route=findPath(current.player,{x:-183.2,y:2,z:-403.2},current);assert.ok(route.length,'return path to lamp');
    await page.evaluate(route=>{
      for(const point of route)for(let i=0;i<400;i++) {
        const p=window.nightRain.getState().player,dx=point.x-p.x,dz=point.z-p.z,d=Math.hypot(dx,dz);
        if(d<.15)break;window.nightRain.input({x:dx/d,z:dz/d});window.advanceTime(20);
      }
    },route);
    await input(page,{interact:true});await input(page,{interact:true});
    await page.getByRole('button',{name:'更换行装 · 武器 / 防具 / 护符',exact:true}).click();
    await page.getByRole('button',{name:/七海.*试作矿镐/}).click();
    assert.equal((await shot(page,'pickaxe-equipment')).weapon,'nanaPickaxe');
    await page.reload({waitUntil:'networkidle'});await resume(page);assert.equal((await shot(page,'pickaxe-reloaded')).weapon,'nanaPickaxe');
    actions.push('public-input roof climb, sprint jump, pickup, two drops, lamp, UI equip, reload');await ctx.close();
    const lever=fresh();place(lever,{x:6,y:0,z:-36.5});
    const l=await open(lever);await input(l.page,{interact:true});assert.equal((await shot(l.page,'remote-lever')).shortcut,true);await l.ctx.close();
    const fans=[['biscuit','courtyard-prowler',1],['otter','elephant-lancer',2],['shark','mill-lancer',1],['rabbit','harbor-prowler',0],['frog','monastery-monk',2]];
    for(const [name,id,index] of fans) {
      const state=fresh(),enemy=state.enemies.find(e=>e.id===id);
      Object.assign(enemy,{facing:0,aggro:true,action:'windup',timer:.15,attackIndex:index});
      place(state,{x:enemy.x,y:supportAt(enemy.x,enemy.z+2.4,enemy.y+.6),z:enemy.z+2.4});
      const f=await open(state,name==='frog'?390:1440);await f.page.keyboard.press('q');await input(f.page,{},1);
      await shot(f.page,'fan-'+name);
      let sawProjectile=false;
      for(let i=0;i<30;i++){await input(f.page,{},20);sawProjectile ||= await f.page.evaluate(id=>window.nightRain.getState().projectiles.some(b=>b.owner===id),id);}
      const after=await f.page.evaluate(()=>window.nightRain.getState());
      if(name==='rabbit')assert.ok(sawProjectile,'rabbit emits a real moving projectile before contact');
      if(name==='otter')assert.ok(after.enemies.find(e=>e.id===id).z>enemy.z+.5);
      actions.push({fan:name,playerHp:after.player.hp,projectiles:after.projectiles.length});await f.ctx.close();
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({errors,evidence,actions},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
