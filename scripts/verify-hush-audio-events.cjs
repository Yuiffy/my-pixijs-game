const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const qa=require('./verify-hush-3d.cjs');
const audioQa=require('./verify-hush-audio.cjs');
const {aim,walk}=require('./verify-hush-life-events.cjs');
const {state,advance,follow,hold,capture,images}=qa;
const base=process.env.HUSH_BASE_URL||'http://127.0.0.1:4095';
const out=process.env.HUSH_QA_DIR||'tmp/hush-audio-events';

async function main(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts');
  const nav=await loadTypescriptModule('src/components/hushLive/navigation.ts');
  const {FAULTS}=await loadTypescriptModule('src/components/hushLive/lifeEvents.ts');
  const seeds=Array.from({length:5000},(_,i)=>i+1),errors=[],checks=[];
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  async function open(skin,level,seed){
    const p=await browser.newPage({viewport:{width:1280,height:850}});p.on('pageerror',x=>errors.push(x.message));
    await audioQa.instrument(p,skin,level);await audioQa.ready(p,seed);return p;
  }
  async function voice(p,name){
    await audioQa.pump(p,350);const s=await state(p);assert.ok(s.audio.voice?.endsWith('/'+name),JSON.stringify(s.audio));
    let heard=false;
    for(let i=0;i<6;i++){
      heard=await p.evaluate(clip=>window.__audioQA.samples.slice(-8).some(x=>x.audio.voice===clip&&x.audio.rms>1e-6),s.audio.voice);
      if(heard)break;
      await audioQa.pump(p,120);
    }
    assert.ok(heard,'Cartoon syllables contain actual energy between their intentional pauses');assert.equal(s.audio.errors.length,0);return s.audio;
  }
  try{
    for(const [index,kind] of ['mic','camera','network'].entries()){
      const seed=seeds.find(n=>e.createGame(4,n,5).daily.events.repair.kind===kind);
      const p=await open(['sui','mizuki','shiori'][index],4,seed);await qa.timing(p);await advance(p,35000);
      for(let i=0;i<5&&(await state(p)).objective.key!=='repair';i++){await follow(p);await hold(p);}
      await follow(p);await hold(p);assert.equal((await state(p)).daily.panel,'repair');
      // Finish any prior incidental line before entering the technical isolation.
      await audioQa.pump(p,4500);
      await p.getByRole('button',{name:'给TA暗号：闭麦，切稍等画面'}).click();await advance(p,0);await audioQa.pump(p,150);
      assert.equal((await state(p)).audio.voice,null);assert.equal((await state(p)).audio.mode,'ambient');
      await p.getByRole('button',{name:FAULTS[kind].fix}).click();await advance(p,3100);
      await p.getByRole('button',{name:'确认恢复，示意TA继续播'}).click();await advance(p,0);
      const repair=await voice(p,'repair');checks.push({kind,isolationSilent:true,repair});
      if(index===0){
        await audioQa.pump(p,4500);
        await walk(p,e.interactionPoint(await state(p),'partner'),nav);await aim(p,{...e.partnerPose(await state(p)),height:1.31});
        await p.keyboard.press('m');await advance(p,0);const privateMute=await voice(p,'private-mute');checks.push({privateMute});
        await audioQa.pump(p,7500);
        await walk(p,e.SPOTS.bed,nav);await aim(p,{x:710,y:425,height:.7});await hold(p);
        await advance(p,6100);const nap=await voice(p,'nap');await capture(p,'nap-audio');
        const sources=await p.evaluate(()=>window.__audioQA.sources);assert.ok(sources.some(s=>s.started&&s.duration>1&&s.duration<1.3));
        checks.push({nap,snore:true});
      }
      await p.close();
    }
    const tripSeed=seeds.find(n=>{const d=e.createGame(5,n,5).daily;return d.outing.trip&&d.events.repair.stage==='none'&&!d.entryLock;});
    const trip=await open('nana7mi',5,tripSeed);
    const tripAudio=await voice(trip,'trip');await qa.timing(trip);await advance(trip,18000);await audioQa.pump(trip,5000);
    assert.equal((await state(trip)).daily.outing.stage,'live');assert.ok(['talk','sing','whisper'].includes((await state(trip)).audio.mode));
    checks.push({trip:tripAudio,liveAfterTrip:true});await trip.close();
    const breakSeed=seeds.find(n=>{const d=e.createGame(5,n,5).daily;return d.household.rest.stage==='pending'&&d.events.repair.stage==='none'&&!d.entryLock&&!d.outing.trip;});
    const rest=await open('shiori',5,breakSeed);await qa.timing(rest);
    let s=await state(rest);await advance(rest,Math.max(0,s.daily.household.rest.due-s.elapsed+.05)*1000);
    const breakOut=await voice(rest,'break-out');await audioQa.pump(rest,4500);
    assert.equal((await state(rest)).audio.voice,null,'Broadcast stops during the actual break');
    for(let i=0;i<80&&(await state(rest)).daily.household.rest.stage!=='done';i++)await advance(rest,500);
    const breakBack=await voice(rest,'break-back');checks.push({breakOut,breakBack});await rest.close();
    // A missing manifest must preserve controls and report a readable status.
    const fail=await browser.newPage();await fail.route('**/audio-v2/manifest.json',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}));
    await fail.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
    fail.on('pageerror',x=>errors.push(x.message));await fail.goto(base+'/game/hush-live');
    await fail.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
    await advance(fail,0);await fail.locator('#hush-start').click();await audioQa.pump(fail,750);
    assert.deepEqual((await state(fail)).audio.errors,['manifest']);assert.equal((await state(fail)).phase,'playing');
    await fail.getByRole('status').filter({hasText:'部分声音'}).waitFor();checks.push({missingAssetsGraceful:true});await fail.close();
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,images,errors},null,2));console.log(JSON.stringify({checks,images:images.map(i=>i.file),errors}));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
