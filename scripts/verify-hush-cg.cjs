const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const qa = require('./verify-hush-3d.cjs');
const { aim, walk } = require('./verify-hush-life-events.cjs');
const { range } = require('./lib/hush-minigame-browser.cjs');
const { state, advance, capture, images } = qa;
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:4074';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-cg';
async function untilCg(p) {
  for (let i=0;i<70;i++) {
    let s=await state(p); if(s.cg) return;
    assert.notEqual(s.phase,'result',JSON.stringify(s));
    if(await qa.activity(p))continue;
    await qa.follow(p);s=await state(p);if(s.cg)return;
    if(s.action.key!==s.objective.key)continue;
    if(['food','hug','kiss','pickup-charger'].includes(s.action.key))await qa.cover(p);
    await qa.hold(p);
  }
  throw Error('No CG: '+JSON.stringify(await state(p)));
}
async function main() {
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts');
  const nav=await loadTypescriptModule('src/components/hushLive/navigation.ts');
  const seeds=Array.from({length:5000},(_,i)=>i+1),errors=[],checks=[];
  const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',args:['--mute-audio','--disable-speech-api']});
  try {
    for(const skin of ['host','sui','nana7mi','shiori','mizuki']) {
      const mobile=skin==='shiori'||skin==='mizuki';
      const level=skin==='host'?0:skin==='sui'?4:5;
      const seed=skin==='host'||skin==='sui'?2:seeds.find(seed=>{
        const d=e.createGame(5,seed,5,skin).daily;
        return !d.homemade&&d.events.repair.stage==='none'&&(skin==='shiori'?d.outing.trip:!d.outing.trip)&&(skin==='nana7mi'?d.after==='supper':true);
      });
      const p=await browser.newPage({viewport:mobile?{width:320,height:740}:{width:1280,height:850},hasTouch:mobile});
      p.on('pageerror',err=>errors.push(err.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await p.addInitScript(({level,skin})=>{
        if(!localStorage.getItem('hush-live-v1'))localStorage.setItem('hush-live-v1',JSON.stringify({version:1,unlocked:level,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,skin,player:'男友',partner:'她'}));
        if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};
      },{level,skin});
      await p.goto(`${base}/game/hush-live?seed=${seed}`,{waitUntil:'networkidle'});
      await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).renderer.calls>0);await advance(p,0);
      if(skin==='host') {
        await p.getByRole('button',{name:'回忆相册 · 0/5'}).click();
        assert.equal(await p.getByRole('dialog').getByRole('button',{disabled:true}).count(),5);
        await capture(p,'locked-album');await p.keyboard.press('Escape');assert.equal((await state(p)).phase,'ready');
      }
      await p.locator('#hush-start').click();if(skin!=='host')await qa.timing(p,mobile);
      if(skin==='shiori') {
        await advance(p,18000);assert.equal((await state(p)).daily.outing.stage,'live');assert.equal((await state(p)).cg,null);
        await capture(p,'shiori-trip-no-opening-cg');
      }
      if(skin==='sui')await advance(p,35000);
      if(skin==='mizuki') {
        // Finish carried food/charger before interacting with the computer freely.
        for(let i=0;i<12&&(await state(p)).carry;i++){await qa.follow(p);await qa.cover(p);await qa.hold(p);}
        await walk(p,e.SPOTS.desk,nav);await aim(p,{x:230,y:150,height:1.05});
        assert.equal((await state(p)).action.key,'computer');await qa.hold(p);
        await range(p,'外放音量',15);await advance(p,8200);
        assert.equal((await state(p)).cg,null);assert.ok((await state(p)).daily.computerPlay>=8);
        await p.getByRole('button',{name:/^离开电脑/}).click();
      }
      await untilCg(p);
      const id={host:'host-lamp',sui:'sui-repair',nana7mi:'nana7mi-supper',shiori:'shiori-home',mizuki:'mizuki-computer'}[skin];
      assert.equal((await state(p)).cg,id);const before=await state(p);
      assert.equal(before.phase,skin==='sui'?'paused':'result');
      await p.getByRole('dialog').locator('img').waitFor();
      await p.waitForFunction(()=>[...document.querySelectorAll('dialog img')].every(i=>i.complete&&i.naturalWidth>0));
      await capture(p,id);
      await advance(p,5000);assert.equal((await state(p)).elapsed,before.elapsed);
      await p.keyboard.press('p');await p.keyboard.press('w');assert.equal((await state(p)).phase,before.phase);
      for(let i=0;i<6;i++){await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)));}
      await p.getByRole('button',{name:'查看回忆相册'}).click();await capture(p,`${skin}-album`);
      await p.getByRole('button',{name:/已解锁/}).click();await p.keyboard.press('Escape');
      assert.equal((await state(p)).phase,skin==='sui'?'playing':'result');await advance(p,200);
      assert.equal((await state(p)).cg,null);
      assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('hush-live-v1')).cgs),[id]);
      await p.reload({waitUntil:'networkidle'});await p.locator('#hush-start').waitFor();
      await p.getByRole('button',{name:'回忆相册 · 1/5'}).click();assert.equal(await p.getByRole('button',{name:/已解锁/}).count(),1);
      await p.getByRole('button',{name:/已解锁/}).click();await p.waitForFunction(()=>document.querySelector('dialog img').naturalWidth>0);
      await p.keyboard.press('Escape');assert.equal((await state(p)).phase,'ready');
      checks.push({skin,seed,id,mobile,paused:true,focusContained:true,reloaded:true});await p.close();
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,images,errors},null,2));console.log(JSON.stringify({checks,errors,images:images.map(i=>i.file)}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
