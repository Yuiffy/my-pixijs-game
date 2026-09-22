const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, hold, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3877';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-door';
async function aim(page, yaw, pitch = 0) {
  const s = await state(page);const change=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));const n=Math.ceil(Math.abs(change/.0025)/220)||1;
  for(let i=0;i<n;i++){await page.mouse.move(640,400);await page.mouse.down({button:'right'});await page.mouse.move(640-change/.0025/n,400-(pitch-s.camera.pitch)/.0025/n,{steps:3});await page.mouse.up({button:'right'});}
  await advance(page,0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await advance(page,0);
}
async function aimDoor(page){
  const s=await state(page);const p=s.doorClosed?{x:520,y:410}:{x:555,y:371};
  const dx=(p.x-s.player.x)/70;const dz=(p.y-s.player.y)/70;
  await aim(page,Math.atan2(-dx,-dz),Math.atan2(1.27-1.55,Math.hypot(dx,dz)));
  assert.equal((await state(page)).focus,'door',JSON.stringify(await state(page)));
}
async function move(page,yaw,ms){await aim(page,yaw);await page.keyboard.down('w');await advance(page,ms);await page.keyboard.up('w');await advance(page,0);}
async function main(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/game/hush-live',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);await advance(page,0);await page.locator('#hush-start').click();
    // Walk into the threshold with public controls; no position/state injection.
    await page.locator('[data-assist="goal"]').click();
    await page.evaluate(()=>{for(let i=0;i<400;i++){window.advanceTime(25);const s=JSON.parse(window.render_game_to_text());if(s.player.x>=514)break;}});
    await page.keyboard.down('ArrowLeft');await advance(page,10);await page.keyboard.up('ArrowLeft');
    let s=await state(page);assert.ok(s.player.x>=514&&s.player.x<530,JSON.stringify(s.player));
    await aimDoor(page);await hold(page);assert.equal((await state(page)).doorClosed,false);assert.match((await state(page)).message,/门缝/);await capture(page,'close-in-threshold-stays-open');
    const before=(await state(page)).player.x;await move(page,-Math.PI/2,510);assert.ok((await state(page)).player.x>before+40);
    // Close on the studio side, then walk into the panel's would-be open position.
    await aimDoor(page);await hold(page);assert.equal((await state(page)).doorClosed,true);
    s=await state(page);await move(page,0,(s.player.y-378)*10);
    await aimDoor(page);await hold(page);assert.equal((await state(page)).doorClosed,true);assert.match((await state(page)).message,/退一点/);await capture(page,'open-blocked-by-body');
    await move(page,Math.PI,340);await aimDoor(page);await hold(page);assert.equal((await state(page)).doorClosed,false);
    await move(page,Math.PI/2,1000);s=await state(page);assert.ok(s.player.x<506,JSON.stringify(s.player));
    // Living-room side: close, walk away, reopen and cross again.
    await aimDoor(page);await hold(page);assert.equal((await state(page)).doorClosed,true);
    const left=s.player.x;await move(page,Math.PI/2,100);assert.ok((await state(page)).player.x<left-5);
    await aimDoor(page);await hold(page);assert.equal((await state(page)).doorClosed,false);await move(page,-Math.PI/2,1000);assert.ok((await state(page)).player.x>534);await capture(page,'cross-after-reopening');
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({images,errors,checks:['close from threshold blocked safely','walk out with WASD','opening on studio side blocked safely','step away then open','living room close then leave','cross reopened doorway']},null,2));console.log(JSON.stringify({images:images.map(i=>i.file),errors}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
