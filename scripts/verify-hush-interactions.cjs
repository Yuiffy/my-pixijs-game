const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, solve, timing, reachAction, virtualPointerLock, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3877';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-interactions-special';
const errors = [];
async function open(page) {
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/game/hush-live?seed=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
  await advance(page, 0);
}
async function turnToPartner(page) {
  const s = await state(page); const target = s.partner;
  const dx = (target.x - s.player.x) / 70; const dz = (target.y - s.player.y) / 70;
  const yaw = Math.atan2(-dx, -dz); const pitch = Math.atan2(1.31 + target.stand * .22 - 1.55, Math.hypot(dx,dz));
  const change = Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));
  const moves = Math.ceil(Math.abs(change / .0025) / 220) || 1;
  for(let i=0;i<moves;i++) {await page.mouse.move(640,400);await page.mouse.down({button:'right'});await page.mouse.move(640-change/.0025/moves,400-(pitch-s.camera.pitch)/.0025/moves,{steps:3});await page.mouse.up({button:'right'});}
  await advance(page,0); await page.waitForTimeout(80); await advance(page,0);
}
async function tap(page, duration, photo) {
  await page.keyboard.press('e'); await advance(page, duration/2);
  if(photo) await capture(page,photo);
  await advance(page,duration/2+100);
}
async function main() {
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({ args: ['--mute-audio', '--disable-speech-api'],channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:800}});await virtualPointerLock(context);const page=await context.newPage();await open(page);
    await page.locator('#hush-start').click();await follow(page);
    await tap(page,400,'charger-short-tap');assert.equal((await state(page)).carry,'charger');assert.equal((await state(page)).busy,null);
    await solve(page);await page.getByRole('button',{name:'下一个夜晚 →'}).click();await page.locator('#hush-start').click();
    await timing(page);await follow(page);await tap(page,350,'food-short-tap');assert.equal((await state(page)).carry,'food');
    assert.equal((await state(page)).objective.spot,'table');await follow(page);assert.equal((await state(page)).focus,'table');
    await page.keyboard.press('e');await advance(page,790);await capture(page,'unpacking-table');await advance(page,400);
    assert.equal((await state(page)).carry,null);assert.ok((await state(page)).done.includes('food'));await capture(page,'meal-on-table');
    await advance(page,1600);assert.ok((await state(page)).partner.stand>.9);await turnToPartner(page);assert.equal((await state(page)).focus,'partner');
    const talk1=(await state(page)).partner.mouth;await advance(page,120);assert.notEqual((await state(page)).partner.mouth,talk1);await capture(page,'talk-and-invite');
    await page.keyboard.press('m');await advance(page,40);assert.equal((await state(page)).partner.speaking,false);assert.equal((await state(page)).partner.mouth,0);
    await page.keyboard.down('e');await advance(page,1450);await capture(page,'invited-hug-progress');
    const ring=await page.locator('[class*="crosshair"]').evaluate(el=>({width:el.getBoundingClientRect().width,text:el.textContent,shadow:getComputedStyle(el).boxShadow}));assert.ok(ring.width>=70);assert.match(ring.text,/%/);assert.notEqual(ring.shadow,'none');
    await page.keyboard.up('e');await advance(page,50);const progress=(await state(page)).actionProgress;
    await page.keyboard.press('p');const frozen=await state(page);await advance(page,3000);assert.equal((await state(page)).elapsed,frozen.elapsed);await page.getByRole('button',{name:'继续今晚 →'}).click();await turnToPartner(page);
    await page.keyboard.down('e');await advance(page,2200);await page.keyboard.up('e');await advance(page,50);assert.equal((await state(page)).bonus,true);assert.ok(progress>0);
    await solve(page);await page.getByRole('button',{name:'下一个夜晚 →'}).click();await page.locator('#hush-start').click();
    await reachAction(page,'delta');assert.equal((await state(page)).focus,'desk');
    // Start from locked mouse: entering the clicking game must unlock without pausing.
    await page.mouse.click(640,400);await page.waitForFunction(()=>!!document.pointerLockElement);await page.keyboard.press('e');await advance(page,70);
    await page.waitForFunction(()=>!document.pointerLockElement);assert.equal((await state(page)).phase,'playing');assert.ok((await state(page)).delta.active);
    await page.keyboard.down('e');await advance(page,500);await page.keyboard.up('e');assert.equal((await state(page)).delta.hits,0);
    const targetBefore=await page.locator('[data-delta-target]').boundingBox();await advance(page,400);const targetAfter=await page.locator('[data-delta-target]').boundingBox();assert.notEqual(targetBefore.x,targetAfter.x);
    await page.keyboard.press('p');const age=(await state(page)).delta.age;await advance(page,4000);assert.equal((await state(page)).delta.age,age);await page.getByRole('button',{name:'继续今晚 →'}).click();
    const arena=await page.getByLabel('报点场地',{exact:true}).boundingBox();await page.mouse.click(arena.x+5,arena.y+5);assert.equal((await state(page)).delta.misses,1);
    await advance(page,4400);assert.equal((await state(page)).delta.active,false);assert.ok(!(await state(page)).done.includes('delta'));
    await page.keyboard.press('e');await advance(page,70);assert.equal((await state(page)).delta.hits,0);assert.equal((await state(page)).delta.misses,0);
    await capture(page,'delta-retry');
    for(let i=0;i<8;i++){await page.locator('[data-delta-target]').click();await advance(page,90);}
    assert.ok((await state(page)).done.includes('delta'));await solve(page);
    const saved=await page.evaluate(()=>localStorage.getItem('hush-live-v1'));await context.close();
    // Mobile tap pickup, table serving, then touch targets and visible hold progress at 320px.
    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await mobile.addInitScript(value=>localStorage.setItem('hush-live-v1',value),saved);
    const phone=await mobile.newPage();await open(phone);await phone.getByText('选择夜晚与角色',{exact:true}).tap();await phone.getByRole('button',{name:/外卖要趁热/}).tap();await phone.locator('#hush-start').tap();
    await timing(phone,true);await follow(phone);await phone.locator('[data-act="hold"]').tap();await advance(phone,550);assert.equal((await state(phone)).carry,'food');await follow(phone);await phone.locator('[data-act="hold"]').tap();await advance(phone,1200);assert.ok((await state(phone)).done.includes('food'));await capture(phone,'mobile-table');await solve(phone);
    await phone.getByRole('button',{name:'下一个夜晚 →'}).tap();await phone.locator('#hush-start').tap();await reachAction(phone,'delta');await phone.locator('[data-act="hold"]').tap();await advance(phone,80);
    await phone.setViewportSize({width:320,height:740});await capture(phone,'mobile-320-delta');
    const rect=await phone.getByLabel('三角洲报点小游戏',{exact:true}).boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=320&&rect.y+rect.height<=740);
    for(let i=0;i<8;i++){await phone.locator('[data-delta-target]').tap();await advance(phone,150);}assert.ok((await state(phone)).done.includes('delta'));
    await solve(phone);await phone.getByRole('button',{name:'下一个夜晚 →'}).tap();await phone.locator('#hush-start').tap();await reachAction(phone,'hug');
    const button=await phone.locator('[data-act="hold"]').boundingBox();const cdp=await mobile.newCDPSession(phone);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button.x+button.width/2,y:button.y+button.height/2}]});await advance(phone,1450);await capture(phone,'mobile-320-hold');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(phone,100);assert.ok(!(await state(phone)).done.includes('hug'));
    await mobile.close();assert.deepEqual(errors,[]);
    fs.writeFileSync(out+'/interaction-report.json',JSON.stringify({images,errors,checks:['tap pickup','automatic unpacking at table','speaking mouth and mute','optional approaching partner','pause and resume embrace','visible hold ring','pointer lock release','moving targets, misses, timeout, retry, completion','mobile taps and targets and hold']},null,2));
    console.log(JSON.stringify({images:images.map(i=>i.file),errors}));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
