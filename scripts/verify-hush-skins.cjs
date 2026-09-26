const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, reachAction, hold, solve, capture, images } = require('./verify-hush-3d.cjs');
const base=process.env.HUSH_BASE_URL||'http://127.0.0.1:3882';
const out=process.env.HUSH_QA_DIR||'tmp/hush-skins';
async function frame(page,ms=0){await advance(page,ms);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function aim(page,target) {
  const s=await state(page),dx=(target.x-s.player.x)/70,dz=(target.y-s.player.y)/70;
  const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(target.height-1.55,Math.hypot(dx,dz));
  const change=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));
  const n=Math.ceil(Math.abs(change/.0025)/180)||1;
  for(let i=0;i<n;i++){await page.mouse.move(640,400);await page.mouse.down({button:'right'});await page.mouse.move(640-change/.0025/n,400-(pitch-s.camera.pitch)/.0025/n,{steps:4});await page.mouse.up({button:'right'});}
  await frame(page);
}
async function run(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  const errors=[],checks=[];
  try{
    for(const [skin,name] of [['host','主播酱'],['sui','岁己'],['nana7mi','七海']]){
      const page=await browser.newPage({viewport:{width:1280,height:800}});
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.addInitScript(()=>{if(!localStorage.getItem('hush-live-v1'))localStorage.setItem('hush-live-v1',JSON.stringify({version:1,unlocked:1,best:[81,0,0,0,0],stars:[2,0,0,0,0],endlessBest:0,player:'男友',partner:'她'}));});
      await page.goto(base+'/game/hush-live?seed=1',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
      assert.equal((await state(page)).skin,'host');
      await page.locator(`[data-skin="${skin}"]`).click();await frame(page);
      assert.equal((await state(page)).partner.name,name);
      assert.equal((await state(page)).progression.best[0],81);
      await capture(page,skin+'-selection');
      await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
      assert.equal((await state(page)).skin,skin);await frame(page);
      await page.locator('#hush-start').click();
      assert.ok((await state(page)).objective.title.includes(name));
      assert.ok((await page.locator('body').innerText()).includes(name+'已经开播了'));
      await reachAction(page,'food');await hold(page);await frame(page,1400);
      let s=await state(page);await aim(page,{x:s.partner.x,y:s.partner.y,height:1.40});
      await page.keyboard.down('s');await frame(page,400);await page.keyboard.up('s');
      s=await state(page);await aim(page,{x:s.partner.x,y:s.partner.y,height:1.32});
      await capture(page,skin+'-character');
      await frame(page,14000);await aim(page,{x:736,y:247,height:1.27});await frame(page,1500);
      await capture(page,skin+'-screen');
      const mouths=new Set();
      for(let i=0;i<14;i++) {await frame(page,90);s=await state(page);assert.equal(s.tracking.avatarMouth,s.tracking.mouth);assert.equal(s.tracking.avatarBlink,s.tracking.blink);mouths.add(s.tracking.mouth.toFixed(3));}
      assert.ok(mouths.size>3,'speaking animation still tracks');
      await solve(page);s=await state(page);assert.ok(s.won);assert.ok(s.daily.memory.includes(name));
      await page.getByRole('button',{name:'重玩本晚'}).click();assert.equal((await state(page)).skin,skin);
      if(skin==='nana7mi') {
        await page.getByText('选择夜晚与角色',{exact:true}).click();
        await page.getByRole('button',{name:/隔墙有耳/}).click();
        await page.locator('#hush-start').click();await reachAction(page,'leisure');await hold(page);await frame(page,3200);
        const phone=await page.getByLabel('微信消息',{exact:true}).innerText();
        assert.ok(phone.includes('七海'));assert.ok(!phone.includes('岁己')&&!phone.includes('partner'));
        await capture(page,'nana7mi-wechat');
      }
      checks.push({skin,name,tracking:true,save:true,chapterComplete:true});await page.close();
    }
    const mobile=await browser.newPage({viewport:{width:320,height:740},isMobile:true,hasTouch:true});
    mobile.on('pageerror',e=>errors.push(e.message));
    await mobile.goto(base+'/game/hush-live',{waitUntil:'networkidle'});await mobile.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
    await mobile.locator('[data-skin="nana7mi"]').tap();await capture(mobile,'mobile-selection');
    assert.equal((await state(mobile)).skin,'nana7mi');await mobile.locator('#hush-start').tap();assert.equal((await state(mobile)).phase,'playing');
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));console.log(JSON.stringify({checks,errors,images:images.map(i=>i.file)}));
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
