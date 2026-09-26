const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, follow, hold, solve, timing, reachAction, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3882';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-chapters-daily';
const errors = [];
async function open(context, level, seed) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(level => localStorage.setItem('hush-live-v1', JSON.stringify({version:1, unlocked:level,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,player:'男友',partner:'她'})), level);
  await page.goto(`${base}/game/hush-live?seed=${seed}`, {waitUntil:'networkidle'});
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
  await advance(page,0);
  assert.equal((await state(page)).level,level);
  assert.equal(await page.getByText('NEW · 同居日常').count(),0);
  await page.locator('#hush-start').click(); return page;
}
async function run() {
  fs.mkdirSync(out,{recursive:true}); assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser = await chromium.launch({ args: ['--mute-audio', '--disable-speech-api'],channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:800}});
    // Meals come from actual chapter seeds; there is no mode or dish selector.
    for (const [i,meal] of ['tea','dq','bbq','rice','crayfish','noodles','plain'].entries()) {
      const page = await open(context,2,i || 7); await timing(page);
      await reachAction(page,'food'); await hold(page);
      assert.equal((await state(page)).daily.meal,meal); assert.ok((await state(page)).done.includes('food'));
      await page.close();
    }
    const page = await open(context,3,2);
    await page.locator('[data-daily-timing]').click(); assert.equal((await state(page)).daily.mistakes,1);
    await page.keyboard.press('p'); const frozen=(await state(page)).daily.clock; await advance(page,3000); assert.equal((await state(page)).daily.clock,frozen);
    await page.getByRole('button',{name:'继续今晚 →'}).click(); await timing(page);
    await reachAction(page,'cook'); await hold(page); await capture(page,'chapter-cooking'); await timing(page);
    await reachAction(page,'leisure'); await hold(page);
    await page.getByRole('button',{name:'玩接星星'}).click(); await page.getByRole('button',{name:'接星星',exact:true}).click();
    await advance(page,3100); assert.match((await state(page)).daily.messages.at(-1).text,/游戏的声音/);
    await page.getByRole('button',{name:'回复：收到，戴耳机啦'}).click();
    await advance(page,5100); await page.getByRole('button',{name:'收起手机，在沙发上小睡 →'}).click();
    await follow(page); assert.equal((await state(page)).focus,'sofa'); await capture(page,'sofa-rest-target'); await hold(page);
    assert.ok((await state(page)).player.x < 506); await advance(page,3300);
    await follow(page); assert.equal((await state(page)).focus,'partner'); await capture(page,'kitchen-after-stream'); await hold(page);
    await page.getByRole('button',{name:'接过锅铲：我来，你歇着'}).click(); await advance(page,100);
    assert.equal((await state(page)).progression.unlocked,4); assert.ok((await state(page)).progression.stars[3]>0);
    await page.getByRole('button',{name:'下一个夜晚 →'}).click(); assert.equal((await state(page)).level,4);
    await page.close();
    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const phone=await open(mobile,2,2); await capture(phone,'mobile-chapter-arrival'); await timing(phone,true);
    await reachAction(phone,'leisure'); await phone.locator('[data-act="hold"]').tap(); await advance(phone,400);
    await advance(phone,3100); await phone.setViewportSize({width:320,height:740}); await capture(phone,'mobile-chapter-wechat');
    const rect=await phone.getByLabel('客厅休闲',{exact:true}).boundingBox(); assert.ok(rect.x>=0 && rect.x+rect.width<=320 && rect.y+rect.height<=740);
    await phone.getByRole('button',{name:'回复：收到，戴耳机啦'}).tap(); await advance(phone,5100);
    await phone.getByRole('button',{name:'收起手机，在沙发上小睡 →'}).tap(); await follow(phone);
    await phone.locator('[data-act="hold"]').tap(); await advance(phone,500); assert.equal((await state(phone)).daily.stage,'sleep'); assert.ok((await state(phone)).player.x<506);
    await advance(phone,3300); await follow(phone); assert.ok((await state(phone)).partner.x<506); assert.equal((await state(phone)).focus,'partner'); await hold(phone);
    await capture(phone,'mobile-sofa-story'); await phone.getByRole('button',{name:'拿干毛巾，帮你擦头发'}).tap(); await advance(phone,100);
    assert.ok((await state(phone)).won); assert.equal((await state(phone)).progression.unlocked,3);
    await mobile.close(); await context.close(); assert.deepEqual(errors,[]);
    fs.writeFileSync(out+'/report.json',JSON.stringify({images,errors},null,2)); console.log(JSON.stringify({screenshots:images.map(i=>i.file),errors}));
  } finally { await browser.close(); }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
