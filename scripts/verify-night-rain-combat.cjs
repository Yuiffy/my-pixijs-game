const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://127.0.0.1:3870';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-combat';
const errors = []; const checks = []; const evidence = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms, input) => page.evaluate(({ ms, input }) => { if (input) window.nightRain.input({ x: 0, z: 0, ...input }); window.advanceTime(ms); }, { ms, input });
async function capture(page, name) {
  await advance(page, 0); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = path.join(out, `${name}.png`); const snapshot = await state(page);
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, canvas: [...document.querySelectorAll('canvas')].map(c => [c.width,c.height]), text: document.body.innerText }));
  assert.ok(layout.width >= layout.scroll); assert.equal(layout.canvas.length, 1); assert.ok(layout.canvas[0][0]);
  const pixels = inspectPng(await page.screenshot({path:file,fullPage:true}));
  evidence.push({file,pixels}); fs.writeFileSync(path.join(out,`${name}.json`),JSON.stringify({snapshot,layout,pixels},null,2));
}
async function open(browser, options={}) {
  const context=await browser.newContext({ viewport:{width:1440,height:900},...options }); await context.addInitScript(installVirtualPointerLock);
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/game/night-rain`,{waitUntil:'networkidle'}); await page.getByRole('button',{name:'出门找夜宵',exact:true}).waitFor();
  await page.getByRole('button',{name:'出门找夜宵',exact:true}).click(); await advance(page,0); return {context,page};
}
async function walk(page, target) {
 const ok = await page.evaluate(target => {
  for (let i=0;i<2500;i++) {
   const s=window.nightRain.getState(); const danger=s.enemies.some(e=>e.hp>0&&e.aggro&&Math.hypot(e.x-s.player.x,e.z-s.player.z)<8);
   if(Math.hypot(s.player.x-target.x,s.player.z-target.z)<.22&&!danger&&s.player.action==='idle')return true;
   window.nightRain.input(window.nightRainPilot.chooseInput(s,target));window.advanceTime(40);
  } return false;
 },target);assert.ok(ok,'legal route reaches screenshot stage');
}
async function main(){
 fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(`${base}/game/night-rain`)).status,200);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const {context,page}=await open(browser);
  const pilot=fs.readFileSync('scripts/tests/helpers/night-rain-pilot.mjs','utf8').replaceAll('export ','');
  await page.addScriptTag({content:pilot+';window.nightRainPilot={chooseInput,NIGHT_ROUTE};'});
  const route=await page.evaluate(()=>window.nightRainPilot.NIGHT_ROUTE.slice(0,8));for(const target of route)await walk(page,target);await walk(page,{x:1,z:8});
  await page.keyboard.press('c');await page.getByLabel('宝宝模式 有人陪你探索与认路').uncheck();await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.evaluate(()=>window.nightRain.resetCamera());await page.mouse.wheel(0,-220);await advance(page,10,{z:-1});await advance(page,1200);
  await page.keyboard.down('Space');await advance(page,180);await page.keyboard.up('Space');assert.ok((await state(page)).player.jumpHeight>.5);await capture(page,'01-jump');await advance(page,1600);
  await page.keyboard.down('Shift');await advance(page,65);assert.equal((await state(page)).player.action,'idle');await page.keyboard.up('Shift');await advance(page,50);assert.equal((await state(page)).player.action,'dodge');await advance(page,1600);
  await page.keyboard.down('w');await page.keyboard.down('Shift');await advance(page,350);assert.ok((await state(page)).player.sprintTime>.1);await page.mouse.down();await advance(page,240);assert.equal((await state(page)).player.attack,'sprintLight');await capture(page,'02-sprint-thrust');await page.mouse.up();await page.keyboard.up('w');await page.keyboard.up('Shift');await advance(page,1600);assert.equal((await state(page)).player.action,'idle');checks.push('physical keyboard Space/Shift and mouse sprint attack');
  await walk(page,{x:1,z:8});await advance(page,1500);
  await page.keyboard.down('w');await page.keyboard.down('Shift');await advance(page,350);await page.mouse.down({button:'right'});await advance(page,440);assert.equal((await state(page)).player.attack,'sprintHeavy');await capture(page,'02b-sprint-spin');await page.mouse.up({button:'right'});await page.keyboard.up('w');await page.keyboard.up('Shift');await advance(page,1800);
  await walk(page,{x:1,z:8});await advance(page,10,{z:-1});await advance(page,1500);
  await page.mouse.click(720,450);await advance(page,240);assert.equal((await state(page)).player.attack,'light1');await capture(page,'03-light-sweep');
  await page.mouse.click(720,450);await advance(page,320);assert.equal((await state(page)).player.attack,'light2');await capture(page,'04-light-return');
  await page.mouse.click(720,450);await advance(page,510);assert.equal((await state(page)).player.attack,'light3');await capture(page,'05-light-finisher');await advance(page,1700);
  await page.mouse.down({button:'right'});await advance(page,250);assert.equal((await state(page)).player.action,'charge');await capture(page,'06-heavy-windup');
  await page.mouse.up({button:'right'});await advance(page,260);assert.equal((await state(page)).player.attack,'heavy');await capture(page,'07-heavy-chop');await advance(page,1700);
  await page.mouse.down({button:'right'});await advance(page,820);assert.equal((await state(page)).player.charge,.75);await capture(page,'08-full-charge');
  await page.mouse.up({button:'right'});await advance(page,280);assert.equal((await state(page)).player.attack,'charged');await capture(page,'09-charged-impact');await advance(page,1800);
  await advance(page,150,{jump:true});await page.mouse.click(720,450);await advance(page,200);assert.equal((await state(page)).player.attack,'airLight');await capture(page,'10-air-cut');await advance(page,1800);
  await page.keyboard.press('Space');await advance(page,180);await page.mouse.click(720,450,{button:'right'});await advance(page,370);assert.equal((await state(page)).player.attack,'airHeavy');await capture(page,'11-air-plunge');await advance(page,1800);
  const before=(await state(page)).player;await page.mouse.click(720,450,{button:'right'});await page.keyboard.down('a');await advance(page,160);await page.keyboard.up('a');const steer=(await state(page)).player;assert.ok(Math.abs(steer.facing-before.facing)>.3);checks.push('all nine attack variants, buffered combo, charge/release and attack steering');await advance(page,1700);
  await page.mouse.down({button:'right'});await advance(page,600);await page.keyboard.down('Alt');await advance(page,200);assert.equal((await state(page)).player.action,'idle');await page.mouse.up({button:'right'});await page.keyboard.up('Alt');await advance(page,400);assert.equal((await state(page)).player.action,'idle');checks.push('Alt cancels charge without unsolicited strike');
  await context.close();
  const normal=await open(browser);await normal.page.keyboard.press('Escape');await normal.page.getByLabel('宝宝模式 有人陪你探索与认路').uncheck();await normal.page.getByRole('button',{name:'继续旅程',exact:true}).click();await advance(normal.page,20);await normal.page.keyboard.press('e');await advance(normal.page,50);assert.equal((await state(normal.page)).messageKind,'lore');assert.equal(await normal.page.locator('[data-narrative="lore"]').count(),1);assert.doesNotMatch(await normal.page.locator('main').innerText(),/先从旅馆外梯|下播啦！|WASD/);await capture(normal.page,'12-lore-without-guide');
  const box=await normal.page.locator('[data-narrative="lore"]').boundingBox();assert.ok(Math.abs(box.x+box.width/2-720)<5);assert.ok(box.y>350);
  await normal.page.keyboard.press('c');await normal.page.getByLabel('宝宝模式 有人陪你探索与认路').check();await normal.page.getByRole('button',{name:'关闭',exact:true}).click();await advance(normal.page,9000);await normal.page.keyboard.press('e');await advance(normal.page,50);assert.match((await state(normal.page)).companion.subtitle,/旅馆外梯/);await capture(normal.page,'13-guide-interpretation');checks.push('normal mode has sparse cryptic lore, baby mode decodes it in centered subtitles');await normal.context.close();
  const phone=await open(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});await phone.page.getByRole('button',{name:'跳跃',exact:true}).tap();await advance(phone.page,180);assert.ok((await state(phone.page)).player.jumpHeight>.5);await capture(phone.page,'14-mobile-jump');await advance(phone.page,1800);
  const heavy=phone.page.getByRole('button',{name:'重击 / 蓄力',exact:true});const touch=await phone.context.newCDPSession(phone.page);const rect=await heavy.boundingBox();await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});await advance(phone.page,800);assert.equal((await state(phone.page)).player.action,'charge');await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(phone.page,280);assert.equal((await state(phone.page)).player.attack,'charged');await advance(phone.page,1800);await phone.page.getByRole('button',{name:'闪避 / 跑',exact:true}).tap();await advance(phone.page,50);assert.equal((await state(phone.page)).player.action,'dodge');checks.push('mobile jump, held heavy and quick dodge tap');await phone.context.close();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,evidence,devices:'Headless installed Chrome; test-only virtual Pointer Lock; no desktop input'},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
