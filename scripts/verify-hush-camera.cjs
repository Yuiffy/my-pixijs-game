const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, virtualPointerLock, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3879';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-camera';
const baseline = process.env.HUSH_CAMERA_BASELINE === '1';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
async function move(page,x,y=0,count=1) {
  await page.evaluate(({x,y,count})=>{
    for(let i=0;i<count;i++)document.dispatchEvent(new MouseEvent('mousemove',{movementX:x,movementY:y,bubbles:true}));
  },{x,y,count});
  await advance(page,0);
}
async function main() {
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  const errors=[],checks=[];
  try {
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    // Never capture the user's real cursor. Only the browser API is substituted;
    // events still pass through the game's document listeners and camera rig.
    await virtualPointerLock(context);
    await context.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/game/hush-live',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
    await page.locator('#hush-start').click();await advance(page,0);
    await page.mouse.click(640,400);assert.ok((await state(page)).pointerLocked);
    let before=(await state(page)).camera;
    await move(page,2,1,80);let after=(await state(page)).camera;
    near(after.yaw,before.yaw-.4);near(after.pitch,before.pitch-.2);
    before=after;await move(page,720,0);after=(await state(page)).camera;
    if(baseline){
      const report={injectedWarpPixels:720,jumpDegrees:Math.abs(after.yaw-before.yaw)*180/Math.PI,errors};
      assert.ok(report.jumpDegrees>100);fs.writeFileSync(out+'/baseline.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));return;
    }
    near(after.yaw,before.yaw);near(after.pitch,before.pitch);
    await move(page,0,-800);near((await state(page)).camera.pitch,before.pitch);
    await move(page,2,0,30);near((await state(page)).camera.yaw,before.yaw-.15);
    before=(await state(page)).camera;await move(page,120,0,12);near((await state(page)).camera.yaw,before.yaw-3.6);
    await advance(page,500);near((await state(page)).camera.yaw,before.yaw-3.6);
    checks.push('slow turns, isolated warp rejection, immediate recovery and fast turns beyond 180 degrees');
    await capture(page,'locked-turn');
    await page.keyboard.press('Escape');assert.equal((await state(page)).phase,'paused');before=(await state(page)).camera;
    await move(page,100,0);near((await state(page)).camera.yaw,before.yaw);
    await page.getByRole('button',{name:'继续今晚 →'}).click();
    await page.mouse.move(610,410);await page.mouse.down({button:'right'});before=(await state(page)).camera;
    await page.mouse.move(690,430,{steps:10});await page.mouse.up({button:'right'});near((await state(page)).camera.yaw,before.yaw-.2);
    await page.mouse.click(640,400);before=(await state(page)).camera;await move(page,-900,0);near((await state(page)).camera.yaw,before.yaw);
    await move(page,-2,0,40);near((await state(page)).camera.yaw,before.yaw+.2);
    checks.push('pause, unlocked right drag, pointer-lock reentry without a stale drag');
    await page.evaluate(()=>document.exitPointerLock());await page.getByRole('button',{name:'继续今晚 →'}).click();
    await page.locator('[data-assist="goal"]').click();await advance(page,300);await page.mouse.click(640,400);await move(page,2);
    before=(await state(page)).camera;await advance(page,600);near((await state(page)).camera.yaw,before.yaw);
    checks.push('manual look keeps control during assisted travel');await capture(page,'manual-after-assist');
    const phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    phone.on('pageerror',e=>errors.push(e.message));
    await phone.goto(base+'/game/hush-live',{waitUntil:'networkidle'});await phone.locator('#hush-start').tap();await advance(phone,0);
    const cdp=await phone.context().newCDPSession(phone);before=(await state(phone)).camera;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:400}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:260,y:420}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(phone,0);
    near((await state(phone)).camera.yaw,before.yaw-.2);near((await state(phone)).camera.pitch,before.pitch-.05);
    checks.push('real touch drag');await capture(phone,'touch-look');
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));console.log(JSON.stringify({checks,errors}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
