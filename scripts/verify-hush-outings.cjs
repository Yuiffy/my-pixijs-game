const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const qa=require('./verify-hush-3d.cjs');
const {state,advance,follow,hold,cover,capture,images}=qa;
const base=process.env.HUSH_BASE_URL||'http://127.0.0.1:4074';
const out=process.env.HUSH_QA_DIR||'tmp/hush-outings';
async function main(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts');
  const seeds=Array.from({length:5000},(_,i)=>i+1), errors=[];
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  async function open(seed,level,skin,touch=false){
    const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:850},hasTouch:touch});
    page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack,url:page.url()}));page.on('console',m=>{if(m.type()==='error')errors.push({message:m.text(),location:m.location(),url:page.url()});});
    await page.addInitScript(({level,skin})=>{localStorage.setItem('hush-live-v1',JSON.stringify({cgs:['host-lamp','sui-repair','nana7mi-supper','shiori-home','mizuki-computer'],version:1,unlocked:level,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,skin,player:'男友',partner:'她'}));if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};},{level,skin});
    await page.goto(`${base}/game/hush-live?seed=${seed}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).renderer.calls>0);await advance(page,0);await page.locator('#hush-start').click();return page;
  }
  try{
    for(const touch of [false,true]){
      const seed=seeds.find(seed=>{const d=e.createGame(5,seed,5).daily;return d.outing.trip&&d.after==='supper'&&d.events.repair.stage==='none'&&!d.homemade;});
      const p=await open(seed,5,touch?'mizuki':'shiori',touch);await capture(p,`${touch?'phone':'desktop'}-trip`);assert.equal((await state(p)).partner.speaking,false);
      await qa.timing(p,touch);await advance(p,4000);assert.equal((await state(p)).daily.outing.stage,'to-desk');await capture(p,`${touch?'phone':'desktop'}-unpacking`);
      await advance(p,14000);assert.equal((await state(p)).daily.outing.stage,'live');assert.equal((await state(p)).partner.speaking,true);
      for(let i=0;i<60;i++){
        const s=await state(p);if(s.daily.panel==='story')break;
        if(await qa.activity(p))continue;
        await follow(p);const next=await state(p);if(next.action.key!==next.objective.key)continue;
        if(['pickup-charger','food','hug','kiss'].includes(next.action.key))await cover(p);
        await hold(p);
      }
      assert.equal((await state(p)).daily.panel,'story');await capture(p,`${touch?'phone':'desktop'}-supper-choice`);
      await p.getByRole('button',{name:touch?'披上外套，牵手出门':'一起去吃烧鹅和热汤'}).click();await advance(p,1500);await capture(p,`${touch?'phone':'desktop'}-departure`);
      await p.keyboard.press('p');const clock=(await state(p)).daily.outing.exitClock;await advance(p,3000);assert.equal((await state(p)).daily.outing.exitClock,clock);await p.getByRole('button',{name:'继续今晚 →'}).click();await advance(p,3000);assert.equal((await state(p)).won,true);await capture(p,`${touch?'phone':'desktop'}-supper-result`);await p.close();
    }
    for(const meal of ['goose','dumplings','soup']){
      const seed=seeds.find(seed=>e.createGame(1,seed,1).daily.meal===meal);const p=await open(seed,1,'mizuki');await qa.timing(p);await follow(p);await hold(p);await follow(p);await hold(p);assert.ok((await state(p)).done.includes('food'));await advance(p,100);await capture(p,`delivery-${meal}`);await p.close();
    }
    if(errors.length)fs.writeFileSync(out+'/errors.json',JSON.stringify(errors,null,2));
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({images,errors},null,2));console.log(JSON.stringify({images:images.map(i=>i.file),errors}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
