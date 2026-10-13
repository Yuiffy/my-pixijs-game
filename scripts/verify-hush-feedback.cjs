const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const qa = require('./verify-hush-3d.cjs');
const {state, advance, capture, images} = qa;
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:4074';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-feedback';
async function main() {
  fs.mkdirSync(out, {recursive:true});
  assert.equal((await fetch(base + '/game/hush-live')).status, 200);
  const browser = await chromium.launch({channel:'chrome', headless:true, args:['--mute-audio','--disable-speech-api']});
  const errors = [], checks = [];
  try {
    for (const touch of [false,true]) {
      const p = await browser.newPage({viewport:touch?{width:320,height:740}:{width:1280,height:850},hasTouch:touch});
      p.on('pageerror', e=>errors.push(e.message));
      p.on('console', m=>{if(m.type()==='error') errors.push(m.text());});
      await p.addInitScript(()=>{localStorage.setItem('hush-live-v1',JSON.stringify({version:1,unlocked:2,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,skin:'mizuki',player:'男友',partner:'她'}));if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
      await p.goto(base+'/game/hush-live?seed=2',{waitUntil:'networkidle'});
      await p.waitForFunction(()=>window.render_game_to_text && JSON.parse(window.render_game_to_text()).renderer.calls>0);
      await advance(p,0);
      await p.locator('[data-practice="recoil"]').click();
      await p.getByRole('button',{name:'移动靶 · 练跟枪',exact:true}).click();
      assert.equal((await state(p)).practice.movingTarget,true);
      const surface=p.locator('[data-mini-surface]');await surface.focus();
      for(let i=0;i<40 && !(await state(p)).practice.won;i++) {
        const m=(await state(p)).practice;
        const target={x:50+Math.sin(m.clock*.9)*21,y:50+Math.cos(m.clock*.65)*12};
        for(const [delta,positive,negative] of [[target.x-m.aimX,'ArrowRight','ArrowLeft'],[target.y-m.aimY,'ArrowDown','ArrowUp']]) {
          for(let j=0;j<Math.round(Math.abs(delta)/2);j++) await p.keyboard.press(delta>0?positive:negative);
        }
        await p.keyboard.down('Space');await advance(p,170);await p.keyboard.up('Space');
        if(i===10) await capture(p,`${touch?'phone':'desktop'}-moving-target`);
      }
      let m=(await state(p)).practice;assert.equal(m.won,true,JSON.stringify(m));assert.equal(m.shots,24);assert.ok(m.score>=20);
      await capture(p,`${touch?'phone':'desktop'}-moving-complete`);
      await p.getByRole('button',{name:'固定靶 · 练压枪',exact:true}).click();
      m=(await state(p)).practice;assert.equal(m.movingTarget,false);assert.equal(m.shots,0);assert.equal(m.won,false);
      await p.getByRole('button',{name:'返回主界面',exact:true}).click();
      await p.locator('[data-practice="eggs"]').click();await surface.focus();
      await p.keyboard.down('ArrowRight');await p.keyboard.down('ArrowUp');
      m=(await state(p)).practice;assert.equal(m.tiltX,1);assert.equal(m.tiltZ,-1);
      await p.keyboard.up('ArrowRight');assert.equal((await state(p)).practice.tiltX,0);
      await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.keyboard.up('ArrowUp');
      m=(await state(p)).practice;assert.equal(m.tiltX,0);assert.equal(m.tiltZ,0);
      const clock=m.clock;await advance(p,1000);assert.equal((await state(p)).practice.clock,clock);
      await p.getByRole('button',{name:'继续练习 ▶',exact:true}).last().click();
      await p.getByRole('button',{name:'返回主界面',exact:true}).click();
      await p.locator('#hush-start').click();await qa.timing(p,touch);await qa.reachAction(p,'delta');
      await p.keyboard.press('e');await advance(p,60);
      for(let i=0;i<3;i++){await p.locator('[data-delta-target]').click();await advance(p,120);}
      assert.equal((await state(p)).delta.streak,3);
      await capture(p,`${touch?'phone':'desktop'}-delta-streak`);
      for(let i=0;i<8 && (await state(p)).delta.active;i++){await p.locator('[data-delta-target]').click();await advance(p,120);}
      assert.ok((await state(p)).done.includes('delta'));
      checks.push({touch,movingComplete:true,modeReset:true,eggKeysAndBlur:true,deltaComplete:true});
      await p.close();
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));
    console.log(JSON.stringify({checks,errors,screenshots:images.map(i=>i.file)}));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
