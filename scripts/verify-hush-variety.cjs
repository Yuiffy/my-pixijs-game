const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {state,advance,follow,hold,cover,capture,images}=require('./verify-hush-3d.cjs');
const {activity}=require('./lib/hush-minigame-browser.cjs');
const base=process.env.HUSH_BASE_URL||'http://127.0.0.1:3882';
const out=process.env.HUSH_QA_DIR||'tmp/hush-variety';
async function aim(page,target){
  const s=await state(page),dx=(target.x-s.player.x)/70,dz=(target.y-s.player.y)/70;
  const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(target.height-1.55,Math.hypot(dx,dz));
  const change=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));const n=Math.ceil(Math.abs(change/.0025)/150)||1;
  const cx=page.viewportSize().width/2,cy=page.viewportSize().height/2;
  for(let i=0;i<n;i++){await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx-change/.0025/n,cy-(pitch-s.camera.pitch)/.0025/n,{steps:3});await page.mouse.up({button:'right'});}await advance(page,0);
}
async function main(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts'),mini=await loadTypescriptModule('src/components/hushLive/minigames.ts');
  const seeds=Array.from({length:4000},(_,i)=>i+1),errors=[],checks=[];
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  async function open(seed,level=3,touch=false){
    const p=await browser.newPage({viewport:touch?{width:320,height:740}:{width:1280,height:800},hasTouch:touch,isMobile:touch});
    p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await p.addInitScript(level=>{localStorage.setItem('hush-live-v1',JSON.stringify({version:1,unlocked:level,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,player:'男友',partner:'她',skin:'sui'}));if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};},level);
    await p.goto(`${base}/game/hush-live?seed=${seed}`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
    if(touch)await p.locator('#hush-start').tap();else await p.locator('#hush-start').click();await advance(p,0);return p;
  }
  try{
    for(const touch of [false,true])for(const kind of ['dial','pick','pins']){
      const seed=seeds.find(n=>mini.lockKind(n)===kind),p=await open(seed,3,touch);
      assert.equal((await state(p)).daily.mini.kind,kind);await capture(p,`${touch?'mobile':'desktop'}-${kind}`);
      const before=(await state(p)).daily.mini;await p.keyboard.press('p');await advance(p,2000);assert.deepEqual((await state(p)).daily.mini,before);await p.getByRole('button',{name:'继续今晚 →'}).click();
      await activity(p,touch);checks.push({kind,touch,completed:true});await p.close();
    }
    for(const touch of [false,true])for(const kind of ['toss','eggs']){
      const p=await open(seeds.find(n=>mini.cookKind(n)===kind),3,touch);await activity(p,touch);await follow(p);await hold(p);
      assert.equal((await state(p)).daily.panel,'cook');assert.equal((await state(p)).daily.mini.kind,kind);
      if(kind==='toss'){
        const b=await p.locator('[data-mini-surface]').boundingBox(),x=b.x+b.width*.5,from=b.y+b.height*.8,to=b.y+b.height*.4;
        if(touch){const cdp=await p.context().newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:to}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
        else{await p.mouse.move(x,from);await p.mouse.down();await p.mouse.move(x,to,{steps:6});await p.mouse.up();}
        assert.equal((await state(p)).daily.mini.flight,true,'upwards gesture launches rice');
      }
      let photo=false;await activity(p,touch,async page=>{const m=(await state(page)).daily.mini;if(!photo&&((m.kind==='toss'&&m.flight&&m.y>12)||(m.kind==='eggs'&&m.clock>1))){photo=true;await capture(page,`${touch?'mobile':'desktop'}-${kind}-air`);}});
      assert.ok(photo);assert.equal((await state(p)).carry,'food');assert.ok((await state(p)).done.includes('cook'));await follow(p);await hold(p);assert.ok((await state(p)).done.includes('food'));checks.push({kind,touch,completed:true});await p.close();
    }
    const computerSeed=seeds.find(n=>{const s=e.createGame(5,n,5);return s.daily.household.arrival==='computer'&&!s.tasks.includes('delta');});
    const pc=await open(computerSeed,5);await aim(pc,{x:230,y:150,height:1.05});await pc.keyboard.down('w');await advance(pc,200);await pc.keyboard.up('w');await aim(pc,{x:230,y:150,height:1.05});
    assert.equal((await state(pc)).action.key,'computer');await hold(pc);assert.equal((await state(pc)).daily.leisurePlace,'computer');
    const screen=pc.locator('[data-mini-surface]');await screen.focus();await pc.keyboard.down('Space');
    for(let i=0;i<30&&!(await state(pc)).daily.mini.won;i++){
      const m=(await state(pc)).daily.mini;const down=Math.round((50-m.aimY)/2),side=Math.round((50-m.aimX)/2);
      for(let j=0;j<Math.abs(down);j++)await pc.keyboard.press(down>0?'ArrowDown':'ArrowUp');
      for(let j=0;j<Math.abs(side);j++)await pc.keyboard.press(side>0?'ArrowRight':'ArrowLeft');await advance(pc,175);
    }
    await pc.keyboard.up('Space');let s=await state(pc);assert.equal(s.daily.mini.shots,24);assert.ok(s.daily.mini.score>=20);await capture(pc,'computer-recoil');
    await pc.locator('details').filter({hasText:'键盘与辅助操作'}).evaluate(el=>el.open=true);await pc.getByRole('button',{name:'重新装填，再练一梭'}).click();assert.equal((await state(pc)).daily.mini.shots,0);
    const b=await screen.boundingBox();await pc.mouse.move(b.x+b.width/2,b.y+b.height/2);await pc.mouse.down();await advance(pc,400);await pc.mouse.up();const shots=(await state(pc)).daily.mini.shots;await advance(pc,1000);assert.equal((await state(pc)).daily.mini.shots,shots);
    await pc.locator('details').filter({hasText:'键盘与辅助操作'}).evaluate(el=>el.open=true);await pc.getByRole('button',{name:'重新装填，再练一梭'}).click();
    await screen.focus();await pc.keyboard.down('Space');await advance(pc,250);
    await pc.keyboard.press('p');await pc.keyboard.up('Space');const paused=await state(pc);
    assert.equal(paused.daily.mini.held,false);await advance(pc,1000);assert.equal((await state(pc)).daily.mini.shots,paused.daily.mini.shots);
    await pc.getByRole('button',{name:'继续今晚 →'}).click();await advance(pc,1000);assert.equal((await state(pc)).daily.mini.shots,paused.daily.mini.shots);
    checks.push({computer:true,keyboardRecoil:true,pointerRelease:true,pauseRelease:true});await pc.close();
    const phone=await open(computerSeed,5,true);await aim(phone,{x:230,y:150,height:1.05});await phone.keyboard.down('w');await advance(phone,200);await phone.keyboard.up('w');await aim(phone,{x:230,y:150,height:1.05});await hold(phone);
    assert.equal((await state(phone)).daily.leisurePlace,'computer');
    const pb=await phone.locator('[data-mini-surface]').boundingBox(),cdp=await phone.context().newCDPSession(phone);let tx=pb.x+pb.width*.5,ty=pb.y+pb.height*.25;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
    for(let i=0;i<35&&!(await state(phone)).daily.mini.won;i++){
      const m=(await state(phone)).daily.mini;tx+=(50-m.aimX)/100*pb.width;ty+=(50-m.aimY)/100*pb.height;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:ty}]});await advance(phone,175);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    assert.equal((await state(phone)).daily.mini.shots,24);assert.ok((await state(phone)).daily.mini.score>=20);await capture(phone,'mobile-recoil');
    const exit=phone.getByRole('button',{name:/先起来走走|收起手机|离开电脑/});
    await exit.scrollIntoViewIfNeeded();await phone.waitForTimeout(350);await exit.tap();await phone.waitForFunction(()=>JSON.parse(window.render_game_to_text()).daily.panel===null);assert.equal((await state(phone)).daily.panel,null);checks.push({touchRecoil:true,exitVisibleByScrolling:true});await phone.close();
    const sleepSeed=seeds.find(n=>{const s=e.createGame(5,n,5);return s.daily.household.arrival!=='outside'&&s.tasks.length===1&&s.tasks[0]==='food'&&s.daily.meal!=='noodles';});
    assert.ok(sleepSeed);const bed=await open(sleepSeed,5);
    for(let i=0;i<12&&(await state(bed)).done.length<(await state(bed)).tasks.length;i++){await follow(bed);await hold(bed);}
    s=await state(bed);assert.equal(s.done.length,s.tasks.length);assert.notEqual(s.daily.household.rest.stage,'done');
    while((await state(bed)).daily.household.rest.stage!=='inside')await advance(bed,100);
    assert.equal((await state(bed)).objective.key,'sleep');await follow(bed);assert.equal((await state(bed)).action.key,'sleep');assert.ok(['out','inside','back'].includes((await state(bed)).daily.household.rest.stage));
    await capture(bed,'sleep-available-during-break');await hold(bed);assert.equal((await state(bed)).daily.stage,'sleep');await bed.waitForTimeout(1600);await capture(bed,'sleep-during-break');await advance(bed,3100);assert.equal((await state(bed)).daily.stage,'after');
    await follow(bed);await hold(bed);await bed.getByRole('button',{name:/拿两把勺子，一起吃|拿干毛巾，帮你擦头发/}).click();await advance(bed,100);assert.equal((await state(bed)).won,true);checks.push({sleepDuringBreak:true,seed:sleepSeed,storyCompleted:true});await bed.close();
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));console.log(JSON.stringify({checks,errors,images:images.map(i=>i.file)}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
