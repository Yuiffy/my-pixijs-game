const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, reachAction, hold, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3879';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-timing';
const baseline = process.env.HUSH_TIMING_BASELINE === '1';
async function sample(page) {
  return page.evaluate(() => new Promise(resolve => {
    const meter = document.querySelector('[role="meter"]');
    const needle = meter.querySelector('i');
    const samples = [];
    const start = performance.now();
    function frame(now) {
      const box = needle.getBoundingClientRect(), track = meter.getBoundingClientRect();
      const s = JSON.parse(window.render_game_to_text());
      samples.push({time:now, x:(box.x+box.width/2-track.x)/track.width, clock:s.daily.clock});
      if (now-start < 5000) requestAnimationFrame(frame);
      else {
        let changed=0, maxError=0;
        for(let i=1;i<samples.length;i++) {
          if(Math.abs(samples[i].x-samples[i-1].x)>.00001)changed++;
          maxError=Math.max(maxError,Math.abs(samples[i].x-(Math.sin(samples[i].clock*2.2-Math.PI/2)+1)/2));
        }
        const seconds=(samples.at(-1).time-samples[0].time)/1000;
        resolve({frames:samples.length,rafHz:(samples.length-1)/seconds,needleHz:changed/seconds,updatedRatio:changed/(samples.length-1),maxError});
      }
    }
    requestAnimationFrame(frame);
  }));
}
async function run() {
  fs.mkdirSync(out,{recursive:true});
  assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  const errors=[], measurements=[];
  try {
    for(const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
      await context.addInitScript(()=>{
        localStorage.setItem('hush-live-v1',JSON.stringify({version:1,unlocked:3,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,player:'男友',partner:'她'}));
        if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};
      });
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(base+'/game/hush-live?seed=1',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
      await page.locator('#hush-start').click();
      await page.waitForTimeout(500);
      const performance=await sample(page);
      measurements.push({device:mobile?'touch':'desktop',...performance});
      console.log(JSON.stringify(measurements.at(-1)));
      if(!baseline) {
        assert.ok(performance.updatedRatio>.85,JSON.stringify(performance));
        assert.ok(performance.maxError<.065,'visual needle must agree with judgement clock');
        await capture(page,mobile?'touch-lock':'desktop-lock');
        await page.keyboard.press('p');
        await page.waitForTimeout(100);
        const frozen=await state(page);
        assert.equal(await page.locator('[role="meter"]').count(),0,'paused activity unmounts its animation');
        await page.waitForTimeout(450);
        assert.equal((await state(page)).daily.clock,frozen.daily.clock);
        await page.getByRole('button',{name:'继续今晚 →'}).click();
        const cdp=mobile?await context.newCDPSession(page):null;
        for(let beat=0;beat<3;beat++) {
          await page.waitForFunction(()=>{const d=JSON.parse(window.render_game_to_text()).daily;const p=(Math.sin(d.clock*2.2-Math.PI/2)+1)/2;return p>.42&&p<.58&&d.cooldown<=0;});
          const b=await page.locator('[data-daily-timing]').boundingBox();
          const x=b.x+b.width/2,y=b.y+b.height/2;
          if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
          else {await page.mouse.move(x,y);await page.mouse.down();}
          assert.equal((await state(page)).daily.beats,beat+1,'score on contact, not delayed release');
          await page.waitForTimeout(400);
          if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          else await page.mouse.up();
          assert.equal((await state(page)).daily.beats,beat+1,'no duplicate score on release');
        }
        assert.equal((await state(page)).daily.mistakes,0);
        // Cooking shares the timing widget. Reach it using legal gameplay, then check pause/time stepping and keyboard activation.
        await advance(page,0);await reachAction(page,'cook');await hold(page);
        assert.equal((await state(page)).daily.panel,'cook');
        await advance(page,714);await page.waitForTimeout(100);
        await capture(page,mobile?'touch-cooking':'desktop-cooking');
        await page.locator('[data-daily-timing]').focus();await page.keyboard.press('Enter');
        assert.equal((await state(page)).daily.beats,1);
        await advance(page,714);await page.locator('[data-daily-timing]').focus();await page.keyboard.press('Space');
        assert.equal((await state(page)).daily.beats,2);
      } else await capture(page,mobile?'touch-before':'desktop-before');
      await context.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(out+'/report.json',JSON.stringify({measurements,errors,images},null,2));
    console.log(JSON.stringify({measurements,errors,images:images.map(i=>i.file)}));
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
