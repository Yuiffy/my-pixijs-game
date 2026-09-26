const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, timing, cover, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3882';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-household';
async function frame(page,ms=0) {
  await advance(page,ms);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function aim(page,target) {
  const s=await state(page),dx=(target.x-s.player.x)/70,dz=(target.y-s.player.y)/70;
  const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(target.height-1.55,Math.hypot(dx,dz));
  const change=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));
  const n=Math.ceil(Math.abs(change/.0025)/160)||1;
  const {width,height}=page.viewportSize();
  for(let i=0;i<n;i++){
    await page.mouse.move(width/2,height/2);await page.mouse.down({button:'right'});
    await page.mouse.move(width/2-change/.0025/n,height/2-(pitch-s.camera.pitch)/.0025/n,{steps:3});await page.mouse.up({button:'right'});
  }
  await frame(page);
}
async function touchHold(page) {
  const s=await state(page), a=s.action;
  const button=page.getByRole('button',{name:/^(轻点互动|按住互动)/});
  if(a.mode==='hold'){
    const b=await button.boundingBox(),cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
    await frame(page,a.seconds*1000+150);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
    await button.tap();await frame(page,a.seconds*1000+150);
    if(a.mode==='minigame')for(let i=0;i<10&&(await state(page)).delta?.active;i++){await page.locator('[data-delta-target]').tap();await frame(page,120);}
  }
  await frame(page,60);
}
async function journey(page,name,photograph=false,touch=false) {
  const seen=new Set();
  for(let i=0;i<100;i++) {
    let s=await state(page);
    if(s.phase==='result'){assert.ok(s.won,JSON.stringify(s));return s;}
    const d=s.daily;
    if(d.panel==='lock'||d.panel==='cook'){await timing(page);continue;}
    if(d.panel==='leisure'){
      await page.getByLabel('外放音量',{exact:true}).focus();await page.keyboard.press('Home');
      await frame(page,9000);await page.getByRole('button',{name:/收起手机|先起来走走/}).click();continue;
    }
    if(d.stage==='sleep'){await frame(page,3100);continue;}
    if(d.panel==='story'){await page.getByRole('button',{name:d.after==='rice'?'拿两把勺子，一起吃':'拿干毛巾，帮你擦头发'}).click();await frame(page,100);continue;}
    const requested=s.objective.spot;
    if(s.action.key!==s.objective.key||s.focus!==requested)await follow(page);
    s=await state(page);
    if(s.objective.spot!==requested)continue;
    if(s.action.key!==s.objective.key||!s.action.key){await capture(page,`${name}-stalled`);throw Error(JSON.stringify(s));}
    if(['food','hug','kiss','pickup-charger'].includes(s.action.key))await cover(page);
    s=await state(page);
    if(s.action.key!==s.objective.key)continue;
    const key=s.action.key;
    const photo=photograph&&!seen.has(key)&&['pickup-food','boil-water','pour-noodles','take-noodles','food','cat-food','cat-litter'].includes(key)?`${name}-${key}`:undefined;
    if(touch)await touchHold(page);else await hold(page,photo);seen.add(key);await frame(page,60);
    if(touch&&key==='cat-food')await capture(page,`${name}-cat-food`);
    if(photograph&&key==='cat-food'){
      for(let j=0;j<200&&(await state(page)).daily.household.cat.mode!=='eat';j++)await frame(page,100);
      const c=(await state(page)).daily.household.cat;assert.equal(c.mode,'eat');await aim(page,{...c,height:.3});await capture(page,`${name}-cat-eating`);
    }
  }
  throw Error('Journey did not finish: '+JSON.stringify(await state(page)));
}
async function run(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts');
  const seeds=Array.from({length:2000},(_,i)=>i+1);
  const noodleSeed=seeds.find(n=>{const s=e.createGame(5,n,5);return s.daily.meal==='noodles'&&s.tasks.includes('cat-food')&&s.tasks.includes('cat-litter');});
  const homeSeed=seeds.find(n=>e.createGame(5,n,5).daily.household.arrival==='computer');
  const homemadeSeed=seeds.find(n=>e.createGame(5,n,5).daily.homemade);
  const catSeed=seeds.find(n=>{const h=e.createGame(5,n,5).daily.household;return h.arrival==='sofa'&&h.cat.mode==='sleep';});
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  const errors=[],checks=[];
  async function open(seed,viewport={width:1280,height:800},touch=false){
    const page=await browser.newPage({viewport,isMobile:touch,hasTouch:touch});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{
      localStorage.setItem('hush-live-v1',JSON.stringify({version:1,unlocked:5,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,player:'男友',partner:'她',skin:'sui'}));
      if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};
    });
    await page.goto(`${base}/game/hush-live?seed=${seed}`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
    await frame(page);return page;
  }
  try{
    const p=await open(homeSeed);
    const starts=new Set(),meals=new Set();
    for(let i=0;i<35;i++){
      const s=await state(p);starts.add(s.daily.household.arrival);if(!s.daily.homemade)meals.add(s.daily.meal);
      assert.equal(s.daily.panel,s.daily.household.arrival==='outside'?'lock':null);
      assert.ok((await p.locator('body').innerText()).includes(s.daily.household.arrival==='outside'?'下班回家':s.daily.household.arrival==='sofa'?'沙发旁开始':'电脑旁开始'));
      await p.locator('[data-reroll-night]').click();
    }
    assert.equal(starts.size,3);assert.equal(meals.size,7);checks.push({rerolls:35,starts:[...starts],meals:[...meals]});await p.close();
    const catPage=await open(catSeed);await catPage.locator('#hush-start').click();await frame(catPage);
    const cat=(await state(catPage)).daily.household.cat;
    await aim(catPage,{x:cat.x,y:cat.y+15,height:.2});
    assert.equal((await state(catPage)).action.key,'pet-cat');await capture(catPage,'cat-sleeping');
    await catPage.keyboard.press('e');await frame(catPage,750);assert.equal((await state(catPage)).daily.household.cat.petted,true);
    for(let i=0;i<200&&(await state(catPage)).daily.household.cat.mode!=='walk';i++)await frame(catPage,100);
    await frame(catPage,1000);const movingCat=(await state(catPage)).daily.household.cat;
    assert.equal(movingCat.mode,'walk');await aim(catPage,{...movingCat,height:.3});await capture(catPage,'cat-walking');checks.push({catPetAndWander:true,seed:catSeed});await catPage.close();
    const q=await open(homeSeed);await capture(q,'home-computer');await q.locator('#hush-start').click();await frame(q);
    assert.equal((await state(q)).daily.panel,null);
    await q.keyboard.press('p');const paused=(await state(q)).daily.household;await frame(q,10000);assert.deepEqual((await state(q)).daily.household,paused);await q.getByRole('button',{name:'继续今晚 →'}).click();
    for(let i=0;i<1000&&(await state(q)).daily.household.rest.stage!=='out';i++)await frame(q,100);
    let s=await state(q);assert.equal(s.daily.household.rest.stage,'out');assert.equal(s.partner.speaking,false);
    for(let i=0;i<180&&(await state(q)).partner.x>420;i++)await frame(q,100);
    s=await state(q);
    await aim(q,{...s.partner,height:1.3});await capture(q,'partner-leaves');
    for(let i=0;i<350&&(await state(q)).daily.household.rest.stage!=='inside';i++)await frame(q,100);
    assert.equal((await state(q)).daily.household.rest.stage,'inside');await aim(q,{x:65,y:221,height:1.3});await capture(q,'bathroom-occupied');
    await frame(q,12500);assert.equal((await state(q)).daily.household.rest.stage,'back');
    for(let i=0;i<350&&(await state(q)).daily.household.rest.stage!=='done';i++)await frame(q,100);
    assert.equal((await state(q)).daily.household.rest.stage,'done');assert.equal((await state(q)).partner.speaking,true);checks.push({bathroomRoundTrip:true,paused:true});await q.close();
    for(const [name,seed,touch] of [['noodles',noodleSeed,false],['homemade',homemadeSeed,false],['mobile',noodleSeed,true]]){
      const page=await open(seed,touch?{width:320,height:740}:{width:1280,height:800},touch);
      await capture(page,`${name}-ready`);
      if(touch)await page.locator('#hush-start').tap();else await page.locator('#hush-start').click();
      await frame(page);const final=await journey(page,name,name==='noodles',touch);
      assert.equal(final.done.length,final.tasks.length);if(final.daily.meal==='noodles')assert.equal(final.daily.household.noodles,'served');
      await capture(page,`${name}-complete`);checks.push({name,seed,won:final.won,tasks:final.tasks,meal:final.daily.meal,arrival:final.daily.household.arrival});await page.close();
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));console.log(JSON.stringify({checks,errors,images:images.map(i=>i.file)}));
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
