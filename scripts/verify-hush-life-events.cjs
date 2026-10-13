const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, capture, images } = require('./verify-hush-3d.cjs');
const { activity } = require('./lib/hush-minigame-browser.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:4074';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-life-events';
async function aim(page, target) {
  const s=await state(page),dx=(target.x-s.player.x)/70,dz=(target.y-s.player.y)/70;
  const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(target.height-1.55,Math.hypot(dx,dz));
  const change=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));
  const viewport=page.viewportSize(),cx=viewport.width/2,cy=viewport.height/2;
  const n=Math.ceil(Math.max(Math.abs(change),Math.abs(pitch-s.camera.pitch)) / Math.min(.3,viewport.width*.0005))||1;
  for(let i=0;i<n;i++){await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx-change/.0025/n,cy-(pitch-s.camera.pitch)/.0025/n,{steps:3});await page.mouse.up({button:'right'});}await advance(page,0);
}
async function walk(page, dest, nav) {
  let s=await state(page);const path=nav.route(s.player,dest,s.doorClosed);assert.ok(path.length);
  for(const p of path){
    s=await state(page);const dx=p.x-s.player.x,dy=p.y-s.player.y;const yaw=Math.atan2(-dx,-dy);const turn=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));
    const key=turn>0?'ArrowLeft':'ArrowRight';await page.keyboard.down(key);await advance(page,Math.abs(turn)/1.7*1000);await page.keyboard.up(key);
    await page.keyboard.down('w');await advance(page,Math.hypot(dx,dy)/(s.quiet?100:155)*1000);await page.keyboard.up('w');
  }
  s=await state(page);assert.ok(Math.hypot(s.player.x-dest.x,s.player.y-dest.y)<8,JSON.stringify({dest,p:s.player}));
}
async function main(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts');const nav=await loadTypescriptModule('src/components/hushLive/navigation.ts');
  const {FAULTS}=await loadTypescriptModule('src/components/hushLive/lifeEvents.ts');
  const seeds=Array.from({length:1000},(_,i)=>i+1), errors=[];
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  try{
    for(const [index,kind] of ['mic','camera','network'].entries()){
      const seed=seeds.find(n=>e.createGame(4,n,5).daily.events.repair.kind===kind);
      const page=await browser.newPage({viewport:{width:index===2?390:1280,height:850},hasTouch:index===2});
      page.on('pageerror',x=>errors.push(x.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.addInitScript(skin=>{localStorage.setItem('hush-live-v1',JSON.stringify({cgs:['host-lamp','sui-repair','nana7mi-supper','shiori-home','mizuki-computer'],version:1,unlocked:4,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,skin,player:'男友',partner:'她'}));if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};},index===1?'mizuki':'shiori');
      await page.goto(`${base}/game/hush-live?seed=${seed}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady && JSON.parse(window.render_game_to_text()).renderer.calls > 0);
      await advance(page,0);await capture(page,`${kind}-ready`);await page.locator('#hush-start').click();await activity(page,index===2);
      await advance(page,35000);assert.equal((await state(page)).daily.events.repair.stage,'fault');
      // Inventory has priority; deliver it if needed before inspecting the equipment.
      for(let i=0;i<4&&(await state(page)).objective.key!=='repair';i++){await follow(page);await hold(page);}
      await follow(page);assert.equal((await state(page)).action.key,'repair');await capture(page,`${kind}-equipment`);await hold(page);
      await capture(page,`${kind}-diagnose`);await page.getByRole('button',{name:'给TA暗号：闭麦，切稍等画面'}).click();
      const wrong=Object.keys(FAULTS).find(k=>k!==kind);await page.getByRole('button',{name:FAULTS[wrong].fix}).click();assert.equal((await state(page)).daily.events.repair.mistakes,1);
      await page.getByRole('button',{name:FAULTS[kind].fix}).click();await advance(page,1000);
      await page.keyboard.press('p');const frozen=(await state(page)).daily.events.repair.stable;await advance(page,4000);assert.equal((await state(page)).daily.events.repair.stable,frozen);await page.getByRole('button',{name:'继续今晚 →'}).click();await advance(page,2100);
      await capture(page,`${kind}-stable`);await page.getByRole('button',{name:'确认恢复，示意TA继续播'}).click();assert.equal((await state(page)).daily.events.repair.stage,'fixed');
      if(index<3){
        await walk(page,e.SPOTS.bed,nav);await aim(page,{x:710,y:425,height:.7});assert.equal((await state(page)).action.key,'nap');await hold(page);await advance(page,3300);await capture(page,`${kind}-nap-look`);
        await advance(page,3100);await capture(page,`${kind}-nap-gesture`);await advance(page,3100);await capture(page,`${kind}-nap-message`);
        await page.getByRole('button',{name:'轻轻起床，收住呼噜'}).click();assert.equal((await state(page)).daily.events.nap.active,false);assert.equal((await state(page)).daily.stage,'home');
      }
      await page.close();
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({images,errors},null,2));console.log(JSON.stringify({screenshots:images.map(i=>i.file),errors}));
  } finally {await browser.close();}
}
module.exports = { aim, walk };
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
