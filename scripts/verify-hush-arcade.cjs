const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {state,advance,follow,hold,capture,images}=require('./verify-hush-3d.cjs');
const {activity}=require('./lib/hush-minigame-browser.cjs');
const base=process.env.HUSH_BASE_URL||'http://127.0.0.1:3882';
const out=process.env.HUSH_QA_DIR||'tmp/hush-arcade';
async function main(){
 fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
 const errors=[],checks=[];
 async function open(touch=false,level=0,seed=1){
  const p=await browser.newPage({viewport:touch?{width:320,height:740}:{width:1280,height:800},hasTouch:touch,isMobile:touch});
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.addInitScript(level=>{localStorage.setItem('hush-live-v1',JSON.stringify({version:1,unlocked:level,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,player:'男友',partner:'她',skin:'sui'}));if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};},level);
  await p.goto(`${base}/game/hush-live?seed=${seed}`,{waitUntil:'networkidle'});await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);await advance(p,0);return p;
 }
 try{
  for(const touch of process.env.HUSH_ARCADE_ONLY==='noodles'?[]:process.env.HUSH_ARCADE_ONLY==='mobile'?[true]:[false,true]){
   const p=await open(touch);const initial=await state(p),save=await p.evaluate(()=>localStorage.getItem('hush-live-v1'));
   const click=async el=>{await el.scrollIntoViewIfNeeded();if(touch){await p.waitForTimeout(350);await el.tap();}else await el.click();};
   await p.getByRole('region',{name:'单独玩小游戏'}).scrollIntoViewIfNeeded();await capture(p,`${touch?'mobile':'desktop'}-menu`);
   for(const kind of (process.env.HUSH_TEST_KINDS||'toss,eggs,dial,pick,pins,recoil').split(',')){
    await click(p.locator(`[data-practice="${kind}"]`));assert.equal((await state(p)).practice.kind,kind);
    const panel=p.getByRole('region',{name:'小游戏自由练习'});
    assert.equal(await panel.evaluate(el=>el.scrollWidth-el.clientWidth),0);
    if(kind==='toss'){
     const b=await p.locator('[data-mini-surface]').boundingBox();const x=b.x+b.width*.5,y=b.y+b.height*.8,end=b.y+b.height*.3;
     if(touch){const c=await p.context().newCDPSession(p);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:end}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
     else{await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x,end,{steps:5});await p.mouse.up();}
     assert.equal((await state(p)).practice.flight,true);await advance(p,100);await capture(p,`${touch?'mobile':'desktop'}-toss`);
     await p.keyboard.press('p');const frozen=(await state(p)).practice;await advance(p,1200);assert.deepEqual((await state(p)).practice,frozen);
     await p.getByRole('button',{name:'继续练习 ▶',exact:true}).last().click();
    }
    if(kind!=='recoil'){let captured=false;await activity(p,touch,async()=>{if(!captured&&['eggs','dial'].includes(kind)){captured=true;await capture(p,`${touch?'mobile':'desktop'}-${kind}`);}});if(['toss','eggs'].includes(kind)){assert.equal(await p.locator('[data-cooking-canvas]').count(),1);await capture(p,`${touch?'mobile':'desktop'}-${kind}-done`);}}
    else{
     const canvas=p.locator('[data-mini-surface]');await canvas.focus();
     const box=await canvas.boundingBox();let x=box.x+box.width*.5,y=box.y+box.height*.2;
     const c=touch?await p.context().newCDPSession(p):null;
     if(c)await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else await p.keyboard.down('Space');
     for(let i=0;i<30&&!(await state(p)).practice.won;i++){
      const m=(await state(p)).practice;
      if(c){x+=(50-m.aimX)/100*box.width;y+=(50-m.aimY)/100*box.height;await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});}
      else for(let j=0;j<Math.round((50-m.aimY)/2);j++)await p.keyboard.press('ArrowDown');
      await advance(p,175);
     }
     if(c){await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}else await p.keyboard.up('Space');
     assert.equal((await state(p)).practice.shots,24);assert.ok((await state(p)).practice.score>=20);await capture(p,`${touch?'mobile':'desktop'}-recoil`);
    }
    assert.equal((await state(p)).practice.won,true);
    const playedSeed=(await state(p)).practice.seed;await click(p.getByRole('button',{name:'再来一局 ↻',exact:true}));await p.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).practice.won,{},{timeout:3000});if((await state(p)).practice.won){await capture(p,`replay-failure-${kind}`);throw Error(`replay ${kind} touch=${touch}`);}assert.equal((await state(p)).practice.score,0);assert.equal((await state(p)).practice.seed,playedSeed+1);
    await click(p.getByRole('button',{name:'返回主界面',exact:true}));assert.equal((await state(p)).practice,null);
    assert.equal((await state(p)).level,initial.level);assert.equal((await state(p)).phase,'ready');assert.equal(await p.evaluate(()=>localStorage.getItem('hush-live-v1')),save);
    checks.push({kind,touch,won:true,replay:true,saveUnchanged:true});
   }
   await click(p.locator('[data-practice="toss"]'));await p.getByText('换个小游戏',{exact:true}).click();await click(p.locator('[data-practice="eggs"]'));assert.equal((await state(p)).practice.kind,'eggs');assert.equal((await state(p)).practice.score,0);await click(p.getByRole('button',{name:'返回主界面',exact:true}));checks.push({touch,switchInPractice:true});
   // Losing focus clears held fire and pauses without advancing the selected night.
   await click(p.locator('[data-practice="recoil"]'));await p.locator('[data-mini-surface]').focus();await p.keyboard.down('Space');await advance(p,200);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.keyboard.up('Space');const shots=(await state(p)).practice.shots;assert.equal((await state(p)).practice.held,false);await advance(p,1000);assert.equal((await state(p)).practice.shots,shots);
   await p.getByRole('button',{name:'继续练习 ▶',exact:true}).last().click();await advance(p,1000);assert.equal((await state(p)).practice.shots,shots);await click(p.getByRole('button',{name:'返回主界面',exact:true}));
   await click(p.locator('#hush-start'));assert.equal((await state(p)).phase,'playing');assert.equal((await state(p)).practice,null);checks.push({touch,blurRelease:true,normalNightStarts:true});
   if(!touch){
    await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
    await p.locator('[data-practice="toss"]').click();const box=await p.locator('[data-mini-surface]').boundingBox();await p.mouse.move(box.x+box.width*.5,box.y+box.height*.7);await p.waitForTimeout(25);await p.mouse.move(box.x+box.width*.5,box.y+box.height*.4);assert.equal((await state(p)).practice.flight,true);
    const before=(await state(p)).practice;await p.waitForTimeout(250);const after=(await state(p)).practice;
    assert.ok(after.clock>before.clock);assert.notEqual(after.y,before.y);
    await p.keyboard.press('Escape');const frozen=(await state(p)).practice.clock;await p.waitForTimeout(200);assert.equal((await state(p)).practice.clock,frozen);
    checks.push({realRafPractice:true,escapePauses:true});
   }
   await p.close();
  }
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts');
  const noodleSeed=Array.from({length:100},(_,i)=>i+1).find(seed=>e.createGame(1,seed,1).daily.meal==='noodles');
  const p=await open(false,1,noodleSeed);await p.locator('#hush-start').click();assert.equal((await state(p)).daily.arrival,'intro');assert.ok((await state(p)).player.y>532);await capture(p,'arrival-outside');let lockCaptured=false;await activity(p,false,async(page,kind)=>{if(kind==='arrival-open'||kind==='arrival-inside'){await capture(page,kind);}else if(!lockCaptured){lockCaptured=true;assert.ok((await state(page)).player.y>532);await capture(page,'arrival-unlocking-outside');}});assert.equal((await state(p)).daily.arrival,'done');assert.equal((await state(p)).player.y,500);checks.push({arrivalOutside:true,unlockBeforeEntry:true,closeAfterEntry:true});
  assert.equal((await state(p)).daily.meal,'noodles');
  for(let i=0;i<20&&(await state(p)).daily.household.noodles!=='steeping';i++){
   const s=await state(p);if(s.daily.household.noodles==='boiling'){await advance(p,12000);continue;}
   await follow(p);await hold(p);
  }
  assert.equal((await state(p)).daily.household.noodles,'steeping');assert.equal((await state(p)).objective.key,'take-noodles');await hold(p);
  assert.equal((await state(p)).daily.household.noodles,'carrying');await follow(p);assert.equal((await state(p)).action.key,'food');await hold(p);
  let s=await state(p);assert.ok(s.done.includes('food'));assert.equal(s.daily.household.noodles,'served');assert.ok(s.daily.household.timer>0);await capture(p,'noodles-served-steeping');
  await p.keyboard.press('p');const timer=(await state(p)).daily.household.timer;await advance(p,11000);assert.equal((await state(p)).daily.household.timer,timer);await p.getByRole('button',{name:'继续今晚 →'}).click();await advance(p,11000);s=await state(p);assert.equal(s.daily.household.timer,0);assert.equal(s.daily.household.noodles,'served');assert.equal(s.done.filter(x=>x==='food').length,1);await capture(p,'noodles-ready-on-desk');checks.push({noodlesDeliveredBeforeReady:true,servedTaskComplete:true,pauseTimer:true});await p.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));console.log(JSON.stringify({checks,errors,images:images.map(x=>x.file)}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
