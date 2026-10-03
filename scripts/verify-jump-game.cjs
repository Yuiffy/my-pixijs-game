const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {paths:[process.cwd(),path.join(os.homedir(),'.codex/skills/develop-web-game')]}));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.JUMP_BASE_URL || 'http://localhost:3960';
const output = process.env.JUMP_QA_DIR || 'tmp/jump-qa';
fs.mkdirSync(output,{recursive:true});
const errors = [], shots = [];
const state = p => p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const advance = (p,ms) => p.evaluate(ms=>window.advanceTime(ms),ms);
const ready = p => p.waitForFunction(()=>window.render_game_to_text && JSON.parse(window.render_game_to_text()).loaded);
const capture = async(p,name) => {
  await p.evaluate(()=>document.fonts.ready);
  await p.waitForFunction(()=>{
    const height=[...document.querySelectorAll('span')].find(e=>e.textContent==='攀登高度')?.parentElement?.querySelector('strong');
    return height && parseInt(height.textContent,10)===JSON.parse(window.render_game_to_text()).height;
  });
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const layout = await p.evaluate(()=>{
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    return {width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:{x:canvas.x,right:canvas.right,width:canvas.width,height:canvas.height},overflow:[...document.querySelectorAll('h1,h2,p,button')].filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent)};
  });
  assert.ok(layout.scroll<=layout.width+1, JSON.stringify(layout));
  assert.ok(layout.canvas.x>=-1&&layout.canvas.right<=layout.width+1,JSON.stringify(layout));
  assert.deepEqual(layout.overflow,[]);
  const file=path.join(output,`${name}.png`);
  const pixels=inspectPng(await p.screenshot({path:file,fullPage:true}));
  shots.push({file,pixels,layout,state:await state(p)});
};
async function pilot(p,floors) {
  return p.evaluate(count=>{
    const read=()=>JSON.parse(window.render_game_to_text());
    const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
    for(let floor=1;floor<=count;floor++) {
      const target=read().platforms.find(p=>p.id===floor);
      if(!target)throw Error(`No target ${floor}`);
      key('keydown','Space'); window.advanceTime(1000/120);key('keyup','Space');
      for(let i=0;i<170&&!read().player.grounded;i++){
        const s=read();
        key(s.player.x>target.x+2?'keydown':'keyup','ArrowLeft');
        key(s.player.x<target.x-2?'keydown':'keyup','ArrowRight');
        window.advanceTime(1000/120);
      }
      key('keyup','ArrowLeft');key('keyup','ArrowRight');
      if(read().floor!==floor)throw Error(`Failed landing ${floor}: ${JSON.stringify(read())}`);
    }
    return read();
  },floors);
}
(async()=>{
  assert.equal((await fetch(`${base}/game/jumpone`)).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:process.env.JUMP_HEADED!=='1',args:['--mute-audio','--disable-speech-api']});
  const context=async options=>{
    const c=await browser.newContext(options);
    await c.route('**/api/record',r=>r.fulfill({json:{success:true}}));
    await c.route('**/api/demos/visits',r=>r.fulfill({json:{visits:{}}}));
    await c.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,r=>r.fulfill({body:''}));
    await c.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
    c.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
    return c;
  };
  try {
    const c=await context({viewport:{width:1440,height:960},permissions:['clipboard-read','clipboard-write']}), p=await c.newPage();
    await p.goto(`${base}/game/jumpone?seed=41`);await ready(p);await advance(p,0);
    assert.equal(await p.locator('canvas').count(),1);
    await p.getByRole('button',{name:'分享游戏'}).click();assert.match(await p.evaluate(()=>navigator.clipboard.readText()),/seed=41/);
    await capture(p,'desktop-ready');
    await p.getByRole('button',{name:'开始攀登'}).click();
    assert.equal((await state(p)).phase,'playing');
    const climbed=await pilot(p,12);assert.equal(climbed.floor,12);
    await capture(p,'desktop-climbed');
    await p.keyboard.down('ArrowRight');await p.keyboard.down('k');await advance(p,60);
    assert.ok((await state(p)).player.dashTime>0);
    await capture(p,'desktop-dash');
    await p.keyboard.up('k');await p.keyboard.up('ArrowRight');
    await p.keyboard.press('p'); const paused=await state(p);assert.equal(paused.phase,'paused');
    await advance(p,2000);assert.deepEqual(await state(p),paused);
    await p.keyboard.press('Escape');assert.equal((await state(p)).phase,'paused');
    await capture(p,'desktop-paused');
    await p.getByRole('button',{name:'继续攀登'}).click();
    await p.keyboard.down('ArrowLeft');await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
    assert.equal((await state(p)).phase,'paused'); assert.ok(Object.values((await state(p)).input).every(v=>!v));
    await p.getByRole('button',{name:'继续攀登'}).click();
    await p.keyboard.up('ArrowLeft');
    await p.getByRole('button',{name:'切换全屏'}).click();await p.waitForFunction(()=>!!document.fullscreenElement);
    await capture(p,'desktop-fullscreen');
    await p.getByRole('button',{name:'切换全屏'}).click();await p.waitForFunction(()=>!document.fullscreenElement);
    await p.keyboard.down('ArrowLeft');await advance(p,6000);
    assert.ok(Object.values((await state(p)).input).every(v=>!v), 'game over clears held input before physical release');
    await p.keyboard.up('ArrowLeft');
    assert.equal((await state(p)).phase,'over');
    const record=await p.evaluate(()=>JSON.parse(localStorage.getItem('sui-jump.records.v1')));
    assert.ok(record.height>=climbed.height);assert.equal(record.runs,1);
    await advance(p,1000);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('sui-jump.records.v1')).runs),1);
    await capture(p,'desktop-over');
    await p.getByRole('button',{name:'再试同一路线'}).click();assert.equal((await state(p)).seed,41);assert.equal((await state(p)).floor,0);
    await p.getByRole('button',{name:'跳跃',exact:true}).focus();await p.keyboard.down('Space');await advance(p,80);await p.keyboard.up('Space');assert.ok((await state(p)).player.vy<0);assert.equal((await state(p)).input.jump,false);
    await p.keyboard.press('p');await p.getByRole('button',{name:'换一条新路线'}).click();assert.notEqual((await state(p)).seed,41);
    await p.reload();await ready(p);await advance(p,0);assert.equal((await state(p)).phase,'ready');
    assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('sui-jump.records.v1'))),record);
    await p.goto(`${base}/game/jumpone`);await ready(p);
    const fresh=await state(p);assert.equal(new URL(p.url()).searchParams.get('seed'),String(fresh.seed));
    await p.getByRole('button',{name:'分享游戏'}).click();assert.ok((await p.evaluate(()=>navigator.clipboard.readText())).includes(`seed=${fresh.seed}`));
    await p.reload();await ready(p);assert.equal((await state(p)).seed,fresh.seed);
    await c.close();

    const mobile=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true}), m=await mobile.newPage();
    await m.goto(`${base}/game/jumpone?seed=41`);await ready(m);await advance(m,0);await capture(m,'mobile-ready');
    await m.getByRole('button',{name:'开始攀登'}).tap();
    const session=await mobile.newCDPSession(m);
    const point=async name=>{const b=await m.getByRole('button',{name,exact:true}).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
    const right=await point('向右移动'), jump=await point('跳跃');
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...right,id:1},{...jump,id:2}]});
    await advance(m,120);let s=await state(m);assert.ok(s.player.x>425&&s.player.y<510);assert.ok(s.input.right&&s.input.jump);
    await capture(m,'mobile-multitouch');
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(Object.values((await state(m)).input).every(v=>!v));
    const dash=await point('冲刺');
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...dash,id:3}]});await advance(m,40);assert.ok((await state(m)).player.dashTime>0);
    await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await state(m)).input.dash,false);
    await m.getByRole('button',{name:'暂停',exact:true}).tap(); await capture(m,'mobile-paused');
    await m.setViewportSize({width:320,height:740}); await m.waitForTimeout(250);await capture(m,'mobile-320');
    await m.setViewportSize({width:844,height:390});await m.waitForTimeout(300);await capture(m,'mobile-landscape');
    await m.getByRole('button',{name:'继续攀登'}).tap();await advance(m,150);assert.equal((await state(m)).phase,'playing');
    await mobile.close();

    const restricted=await context({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await restricted.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};});
    const r=await restricted.newPage();await r.goto(`${base}/game/jumpone?seed=3`);await ready(r);await advance(r,0);
    await r.getByRole('button',{name:'开始攀登'}).click();await pilot(r,3);
    await r.keyboard.down('ArrowRight');await advance(r,5000);await r.keyboard.up('ArrowRight');assert.equal((await state(r)).phase,'over');
    assert.match(await r.locator('body').innerText(),/设备存储不可用/);await capture(r,'storage-blocked');await restricted.close();
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,errors,shots},null,2));
    console.log(JSON.stringify({passed:true,errors,screenshots:shots.map(s=>s.file)},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
