const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, solve, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3877';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-tracking';
const errors = []; const samples = [];
async function frame(page, ms = 0) { await advance(page, ms); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function aim(page, target) {
  const s = await state(page);
  const dx = (target.x-s.player.x)/70; const dz = (target.y-s.player.y)/70;
  const yaw = Math.atan2(-dx,-dz); const pitch = Math.atan2(target.height-1.55,Math.hypot(dx,dz));
  const change = Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));
  const n = Math.ceil(Math.abs(change/.0025)/200)||1;
  for(let i=0;i<n;i++){await page.mouse.move(640,400);await page.mouse.down({button:'right'});await page.mouse.move(640-change/.0025/n,400-(pitch-s.camera.pitch)/.0025/n,{steps:4});await page.mouse.up({button:'right'});}
  await frame(page);
}
async function sample(page,label) {
  await frame(page);
  const s = await state(page);const t=s.tracking;
  assert.ok(Math.abs(t.avatarYaw-Math.atan2(Math.sin(t.yaw-Math.PI),Math.cos(t.yaw-Math.PI)))<.00001,label);
  assert.equal(t.avatarMouth,t.mouth,label);assert.equal(t.avatarBlink,t.blink,label);
  if(t.stand<.1&&!s.won)assert.ok(Math.abs(Math.atan2(Math.sin(t.chairYaw-t.yaw),Math.cos(t.chairYaw-t.yaw)))<.00001,label);
  samples.push({label,tracking:t,partner:s.partner,phase:s.phase});return s;
}
async function main() {
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/game/hush-live?seed=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);await frame(page);
    await page.locator('#hush-start').click();await solve(page);await page.getByRole('button',{name:'下一个夜晚 →'}).click();await page.locator('#hush-start').click();await follow(page);await hold(page);await follow(page);
    // Back away using ordinary movement so the complete chair orientation is reviewable.
    await aim(page,{x:665,y:125,height:1.55});await page.keyboard.down('s');await frame(page,650);await page.keyboard.up('s');await aim(page,{x:735,y:245,height:1.0});
    for(let i=0;i<45;i++){await frame(page,100);const s=await state(page);if(!s.partner.peek&&Math.abs(s.tracking.avatarYaw)<.1)break;}
    await capture(page,'wide-chair-orientation');
    await follow(page);
    // The same side view as the user's screenshot: chair, partner and virtual avatar visible together.
    await aim(page,{x:736,y:247,height:1.27});
    let speaking;let peek;
    for(let i=0;i<80;i++) {
      await frame(page,100);const s=await sample(page,'seated-'+i);
      if(!speaking&&!s.partner.peek&&Math.abs(s.tracking.avatarYaw)<.1&&s.tracking.mouth>.45){speaking=s;await capture(page,'chair-facing-desk-and-speaking-avatar');}
      if(speaking&&!peek&&s.partner.peek&&Math.abs(s.tracking.avatarYaw)>.8){peek=s;await capture(page,'swivel-and-avatar-turn');}
      if(speaking&&peek)break;
    }
    assert.ok(speaking&&peek,'observe both desk-facing talk and a genuine peek');
    const mouthValues = new Set();
    for(let i=0;i<12;i++){await frame(page,70);const s=await sample(page,'mouth-'+i);mouthValues.add(s.tracking.avatarMouth.toFixed(3));}
    assert.ok(mouthValues.size>6,'mouth tracking must animate, not stay frozen');
    await page.keyboard.press('p');await frame(page);const frozen=(await state(page)).tracking;await frame(page,4000);assert.deepEqual((await state(page)).tracking,frozen);await page.getByRole('button',{name:'继续今晚 →'}).click();
    // Place the meal and let the partner stand: the chair must stay at the desk.
    await follow(page);await hold(page);await frame(page,1700);let s=await sample(page,'standing');assert.ok(s.tracking.stand>.9);const chairYaw=s.tracking.chairYaw;
    await aim(page,{x:s.partner.x,y:s.partner.y,height:1.53});await page.keyboard.press('m');await frame(page,150);s=await sample(page,'muted');assert.equal(s.tracking.mouth,0);assert.equal(s.tracking.avatarMouth,0);assert.equal(s.tracking.chairYaw,chairYaw);
    await aim(page,{x:715,y:232,height:1.25});await capture(page,'standing-muted-avatar-and-empty-chair');
    await frame(page,13500);await sample(page,'back-in-seat');await capture(page,'returned-chair-and-avatar');
    await solve(page);
    // Existing male appearance uses the same tracking path, not a second unsynchronised animation.
    await page.getByRole('button',{name:'重玩本晚'}).click();await page.getByText('选择夜晚与角色',{exact:true}).click();await page.getByLabel('恋人称呼',{exact:true}).selectOption('他');await page.locator('#hush-start').click();await follow(page);await hold(page);await follow(page);await aim(page,{x:736,y:247,height:1.27});await frame(page,2000);await sample(page,'male');await capture(page,'male-chair-and-avatar');
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/tracking-report.json',JSON.stringify({samples,images,errors},null,2));console.log(JSON.stringify({samples:samples.length,images:images.map(i=>i.file),errors}));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
