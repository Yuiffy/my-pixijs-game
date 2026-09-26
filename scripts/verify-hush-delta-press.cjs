const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, solve, reachAction, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3877';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-delta-press';
const errors = [];
const checks = [];
async function startDelta(page) {
  await page.goto(base+'/game/hush-live?seed=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);await advance(page,0);
  for(let i=0;i<2;i++){await page.locator('#hush-start').click();await solve(page);await page.getByRole('button',{name:'下一个夜晚 →'}).click();}
  await page.locator('#hush-start').click();await reachAction(page,'delta');await page.keyboard.press('e');await advance(page,50);
  assert.ok((await state(page)).delta.active);
}
async function main(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({ args: ['--mute-audio', '--disable-speech-api'],channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));
    await startDelta(page);
    const target=page.locator('[data-delta-target]');const before=await target.boundingBox();const beforeState=await state(page);const initialTransform=await target.evaluate(el=>getComputedStyle(el).transform);
    // Holding the mouse for 250 ms is a normal human click, not Playwright's near-instant click.
    await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.waitForTimeout(250);
    const after=await target.boundingBox();const downState=await state(page);const downTransform=await target.evaluate(el=>getComputedStyle(el).transform);
    await capture(page,'mouse-held');
    await page.mouse.up();await advance(page,50);const released=await state(page);
    const evidence={before,after,initialTransform,downTransform,beforeState,downState,released};fs.writeFileSync(out+'/mouse-evidence.json',JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({deltaX:after.x-before.x,deltaY:after.y-before.y,initialTransform,downTransform,downHits:downState.delta.hits,releasedHits:released.delta.hits,misses:released.delta.misses}));
    assert.equal(downState.delta.hits,beforeState.delta.hits+1,'pressing a visible ball must register immediately');
    assert.equal(released.delta.hits,downState.delta.hits,'releasing must not score twice');
    assert.equal(released.delta.misses,0);
    checks.push('mouse press scores immediately; 250ms hold and release do not miss or double-score');
    // Isolate the actual CSS pressed state on an inert copy, since a hit replaces the live target.
    await page.locator('[data-delta-target]').evaluate(el=>{const probe=el.cloneNode(true);probe.removeAttribute('data-delta-target');probe.id='delta-style-probe';probe.style.left='50%';probe.style.top='50%';el.parentElement.appendChild(probe);});
    const probe=page.locator('#delta-style-probe');const resting=await probe.boundingBox();
    await page.mouse.move(resting.x+resting.width/2,resting.y+resting.height/2);await page.mouse.down();await page.waitForTimeout(220);const pressed=await probe.boundingBox();
    assert.ok(Math.abs(resting.x+resting.width/2-pressed.x-pressed.width/2)<.5);
    assert.ok(Math.abs(resting.y+resting.height/2-pressed.y-pressed.height/2)<.5);
    await page.mouse.up();await probe.evaluate(el=>el.remove());
    checks.push('pressed CSS preserves both centre coordinates');
    let hits=(await state(page)).delta.hits;
    await page.locator('[data-delta-target]').focus();await page.keyboard.press('Enter');assert.equal((await state(page)).delta.hits,++hits);
    await page.locator('[data-delta-target]').focus();await page.keyboard.press('Space');assert.equal((await state(page)).delta.hits,++hits);
    checks.push('Enter and Space each score once');
    let point=await page.locator('[data-delta-target]').boundingBox();await page.mouse.click(point.x+point.width/2,point.y+point.height/2,{button:'right'});assert.equal((await state(page)).delta.hits,hits);
    // A slower click near the circular edge still counts at initial contact.
    point=await page.locator('[data-delta-target]').boundingBox();await page.mouse.move(point.x+7,point.y+point.height/2);await page.mouse.down();await advance(page,300);await page.waitForTimeout(250);await page.mouse.up();assert.equal((await state(page)).delta.hits,++hits);assert.equal((await state(page)).delta.misses,0);
    while((await state(page)).delta.active){point=await page.locator('[data-delta-target]').boundingBox();await page.mouse.move(point.x+point.width/2,point.y+point.height/2);await page.mouse.down();await page.waitForTimeout(160);await page.mouse.up();await advance(page,80);}
    assert.ok((await state(page)).done.includes('delta'));assert.equal((await state(page)).delta.hits,8);assert.equal((await state(page)).delta.misses,0);await capture(page,'desktop-complete');
    checks.push('edge press, moving target and deliberate clicks finish with 8 hits / zero misses');
    // Return to preparation without changing game state through a debug setter.
    await page.keyboard.press('p');await page.getByRole('button',{name:'放弃本晚，返回准备'}).click();
    const save=await page.evaluate(()=>localStorage.getItem('hush-live-v1'));
    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await mobile.addInitScript(value=>localStorage.setItem('hush-live-v1',value),save);
    const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base+'/game/hush-live?seed=1',{waitUntil:'networkidle'});await phone.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);await advance(phone,0);
    assert.equal((await state(phone)).level,2);await phone.locator('#hush-start').tap();await reachAction(phone,'delta');await phone.locator('[data-act="hold"]').tap();await advance(phone,60);
    const cdp=await mobile.newCDPSession(phone);
    for(let i=0;i<8;i++){
      const targetRect=await phone.locator('[data-delta-target]').boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:targetRect.x+targetRect.width/2,y:targetRect.y+targetRect.height/2}]});
      assert.equal((await state(phone)).delta.hits,i+1,'touchstart must score without waiting for touchend');
      await advance(phone,250);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await state(phone)).delta.hits,i+1);
      if(i===2)await capture(phone,'touch-third-hit');
    }
    assert.ok((await state(phone)).done.includes('delta'));assert.equal((await state(phone)).delta.misses,0);await capture(phone,'touch-complete');await mobile.close();
    checks.push('real CDP touch contact scores immediately, 8 held touches complete with no misses/double-score');
    await page.reload({waitUntil:'domcontentloaded'});await page.bringToFront();
    await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
    await page.locator('#hush-start').click();
    // Resolve the chapter's arrival and meal with real RAF time before reporting.
    for(let beat=0;beat<3;beat++) {
      await page.waitForFunction(()=>{const d=JSON.parse(window.render_game_to_text()).daily;const p=(Math.sin(d.clock*2.2-Math.PI/2)+1)/2;return p>.4&&p<.6&&d.cooldown<=0;});
      await page.locator('[data-daily-timing]').click();
    }
    for(let n=0;n<12;n++) {
      await page.locator('[data-assist="goal"]').click();
      await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).path.length,{},{timeout:25000});
      await page.waitForTimeout(350);
      const arrived=await state(page);
      // Crossing rooms can change the guide to closing the door. Follow that new goal.
      if(arrived.focus!==arrived.objective.spot||arrived.action.key!==arrived.objective.key)continue;
      if(arrived.action.key==='delta')break;
      await page.keyboard.press('e');await page.waitForFunction(()=>!!JSON.parse(window.render_game_to_text()).busy);await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).busy);
    }
    assert.equal((await state(page)).action.key,'delta');
    await page.keyboard.press('e');await page.locator('[data-delta-target]').waitFor();
    for(let i=0;i<8;i++){
      const box=await page.locator('[data-delta-target]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();
      assert.equal((await state(page)).delta.hits,i+1);assert.equal((await state(page)).delta.misses,0);
    }
    assert.ok((await state(page)).done.includes('delta'));
    checks.push('real RAF clock: eight 250ms mouse holds hit moving balls without advanceTime');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(out+'/report.json',JSON.stringify({images,errors,checks},null,2));
    console.log(JSON.stringify({checks,errors,images:images.map(i=>i.file)}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
