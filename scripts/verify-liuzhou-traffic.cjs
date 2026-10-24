const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { travel, model } = require('./lib/liuzhou-pilot.cjs');
const { mouseLook } = require('./lib/liuzhou-mouse.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4130';
const output = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-traffic';
const report = { pointerLockMode: 'browser-only virtual capture; native system pointer lock disabled in automated tests', errors: [], checks: [], captures: [] };
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(p, name) {
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = path.join(output, `${name}.png`);
  const sanity = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const dom = await p.evaluate(() => ({ width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,calls:c.dataset.drawCalls})) }));
  assert.equal(dom.canvas.length,1);assert.ok(dom.canvas[0].width>0);assert.ok(dom.scroll<=dom.width+1);
  report.captures.push({name,file,sanity,dom,state:await state(p)});
}
async function lookAt(p, point) {
  const s = await state(p);const yaw = await p.evaluate(()=>window.liuzhouTest.rig.yaw);
  const wanted=Math.atan2(point.x-s.player.x,point.z-s.player.z);
  const delta=-Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw))/0.003;
  await mouseLook(p, delta);
  await p.waitForTimeout(250);
}
(async()=>{
  assert.equal((await fetch(`${base}/game/liuzhou`,{signal:AbortSignal.timeout(90000)})).status,200);
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:process.env.LIUZHOU_HEADED!=='1',args:['--mute-audio','--disable-speech-api']});
  try{
    const context=await quietContext(browser, {viewport:{width:1440,height:900}});
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,r=>r.fulfill({body:''}));
    const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    p.on('response',r=>{if(r.status()>=400&&/\/(game\/liuzhou|_next|images\/livers)/.test(r.url()))report.errors.push(`HTTP ${r.status()} ${r.url()}`);});
    await p.goto(`${base}/game/liuzhou?test=1`);await p.getByRole('button',{name:'走进柳州 ↗'}).waitFor({timeout:90000});
    await p.evaluate(()=>window.liuzhouTest.manual(true));await p.getByRole('button',{name:'走进柳州 ↗'}).click();
    await travel(p,{x:-159.17,z:-14.48},{tolerance:0.6});
    const arrivals=await state(p);assert.equal(arrivals.traffic.length,7);
    for(let i=0;i<120;i++)await p.evaluate(()=>window.liuzhouTest.move({},60));
    const stopped=await state(p);
    const yielding=stopped.traffic.filter(c=>c.waiting==='行人'&&c.speed<0.05&&Math.hypot(c.x-stopped.player.x,c.z-stopped.player.z)<8);
    assert.ok(yielding.length>0,'traffic should stop in front of the player');
    for(const c of stopped.traffic)assert.ok(Math.hypot(c.x-stopped.player.x,c.z-stopped.player.z)>1.8);
    const car=yielding[0];assert.equal(car.braking,true);
    await lookAt(p,car);await capture(p,'01-yield-to-player');
    await p.keyboard.press('Escape');const paused=await state(p);await p.evaluate(()=>window.advanceTime(5000));assert.deepEqual(await state(p),paused);
    await p.getByRole('button',{name:'回到街上 ↗'}).click();
    await travel(p,{x:-145,z:-14.48},{tolerance:0.8});
    await p.evaluate(()=>window.liuzhouTest.move({},120));
    const restarted=(await state(p)).traffic.find(c=>c.id===car.id);assert.ok(restarted.odometer>car.odometer+1);assert.ok(restarted.speed>1);
    await lookAt(p,restarted);await capture(p,'02-resume-after-crossing');
    await p.keyboard.press('KeyM');await capture(p,'03-live-traffic-map');await p.keyboard.press('Escape');
    // The concave OSM building's courtyard must be reachable with the real
    // Rapier collider, not only by the lightweight rule-test geometry.
    await travel(p,{x:-335,z:105},{tolerance:1});await lookAt(p,{x:-360,z:105});await capture(p,'04-concave-building-courtyard');
    const beforeWall=await state(p);
    const toward=await p.evaluate(({target})=>{const t=window.liuzhouTest;const g=t.game;return Math.atan2(target.x-g.player.x,target.z-g.player.z)-t.rig.yaw;},{target:{x:-360,z:105}});
    await p.evaluate(a=>window.liuzhouTest.move({forward:Math.cos(a),turn:-Math.sin(a)},480),toward);
    const afterWall=await state(p);report.wall={before:beforeWall.player,after:afterWall.player};
    const world=await model();assert.ok(!world.buildingContains(afterWall.player,world.BUILDINGS.find(b=>b.id==='641119443')),'building wing must remain solid');assert.ok(afterWall.player.x<beforeWall.player.x-4,'courtyard allows an approach to its actual wing');assert.equal(afterWall.blocked,true);
    await capture(p,'05-footprint-collision');
    await travel(p,{x:-207,z:8});await p.keyboard.press('KeyE');assert.equal((await state(p)).vehicle,'car-1');
    await p.evaluate(()=>{window.liuzhouTest.move({forward:1},60);window.liuzhouTest.move({brake:true},45);});
    await p.keyboard.press('KeyC');await p.waitForTimeout(250);
    const driven=await state(p);const parked=driven.vehicles.find(v=>v.id==='car-1');assert.equal(parked.speed,0);assert.equal(parked.braking,true);assert.ok(parked.odometer>1);
    await capture(p,'06-driver-brake-lights');await p.keyboard.press('KeyE');
    await travel(p,{x:42,z:-8});await p.keyboard.press('KeyE');assert.equal((await state(p)).vehicle,'bike-1');
    await p.evaluate(()=>window.liuzhouTest.move({forward:1},90));await p.keyboard.press('KeyC');await p.waitForTimeout(250);
    assert.ok((await state(p)).vehicles.find(v=>v.id==='bike-1').odometer>3);await capture(p,'07-pedalling-wheels');
    report.checks.push('seven ambient cars; ordinary-input walk to road; pedestrian yielding; resume after clearing road; pause freezes traffic; traffic map; real concave courtyard and solid building wing; driver brake lights and wheel travel; bicycle pedalling');
    assert.deepEqual(report.errors,[]);
    await context.close();
  }finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
