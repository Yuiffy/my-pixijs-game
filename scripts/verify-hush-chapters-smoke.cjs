const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3879';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-chapters-production';
const errors=[];
async function run() {
  fs.mkdirSync(out,{recursive:true}); assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({ args: ['--mute-audio', '--disable-speech-api'],channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/game/hush-live?seed=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
    assert.equal(await page.getByText('NEW · 同居日常').count(),0);
    for (let level=0;level<2;level++) {
      assert.equal((await state(page)).level,level); await page.locator('#hush-start').click();
      for(let n=0;n<20;n++) {
        const s=await state(page);
        if(s.phase==='result') { assert.ok(s.won); break; }
        if(s.daily?.panel==='lock') {
          for(let beat=0;beat<3;beat++) {
            await page.waitForFunction(()=>{const d=JSON.parse(window.render_game_to_text()).daily; const p=(Math.sin(d.clock*2.2-Math.PI/2)+1)/2; return p>.4 && p<.6 && d.cooldown<=0;});
            await page.locator('[data-daily-timing]').click();
          }
          continue;
        }
        if(s.daily?.stage==='sleep') {
          assert.ok(s.player.x<506); await page.waitForTimeout(1600); await capture(page,'sofa-sleep');
          await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).daily.stage==='after'); continue;
        }
        if(s.daily?.panel==='story') {
          assert.ok(s.partner.x<506); await capture(page,'sofa-after-stream');
          await page.getByRole('button',{name:'递杯温水，陪你坐一会儿'}).click();
          await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='result'); continue;
        }
        await page.locator('[data-assist="goal"]').click();
        await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text()); return !s.path.length && s.focus===s.objective.spot && s.action.key===s.objective.key;},{},{timeout:25000});
        const before=await state(page);
        if(before.action.key==='charger' && level===0) {assert.equal(before.focus,'charging'); await page.waitForTimeout(200); await capture(page,'tray-target');}
        await page.keyboard.press('e');
        await page.waitForFunction(()=>!!JSON.parse(window.render_game_to_text()).busy);
        await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).busy);
        if(before.action.key==='charger' && level===0) { await page.waitForTimeout(150); await capture(page,'charger-on-tray'); }
      }
      assert.ok((await state(page)).won); assert.equal((await state(page)).progression.unlocked,level+1);
      if(level===0) await page.getByRole('button',{name:'下一个夜晚 →'}).click();
    }
    await capture(page,'chapter-result'); const saved=await page.evaluate(()=>localStorage.getItem('hush-live-v1'));
    await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
    assert.equal((await state(page)).level,2); assert.equal(await page.evaluate(()=>localStorage.getItem('hush-live-v1')),saved);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(out+'/report.json',JSON.stringify({images,errors,clock:'real requestAnimationFrame, no advanceTime'},null,2));
    console.log(JSON.stringify({images:images.map(i=>i.file),errors}));
  } finally {await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
