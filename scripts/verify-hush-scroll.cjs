const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, reachAction, hold, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3879';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-scroll';
const { activity: complete, range } = require('./lib/hush-minigame-browser.cjs');
async function run() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + '/game/hush-live')).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const errors = [], measurements = [];
  try {
    for (const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(() => {
        localStorage.setItem('hush-live-v1', JSON.stringify({version:1,unlocked:3,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,player:'男友',partner:'她'}));
        if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
      await page.goto(base + '/game/hush-live?seed=1', {waitUntil:'networkidle'});
      await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).webglReady);
      await page.locator('#hush-start').click();
      await advance(page, 0);
      for (const activity of ['lock','cook']) {
        if (activity === 'cook') { await reachAction(page, 'cook'); await hold(page); }
        assert.equal((await state(page)).daily.panel, activity);
        const kind=(await state(page)).daily.mini.kind;
        for (const value of [8,50,92]) {
          if(activity==='cook')await range(page,'锅的位置',value);
          await advance(page,150);
          const layout=await page.locator('[data-mini-surface]').evaluate(canvas=>{
            const panel=canvas.closest('section');
            return {overflow:panel.scrollWidth-panel.clientWidth,vertical:panel.scrollHeight-panel.clientHeight};
          });
          measurements.push({viewport,activity,kind,value,...layout});
          assert.equal(layout.overflow,0,JSON.stringify(measurements.at(-1)));
        }
        const controls=page.locator('[data-minigame] button');
        const control=await controls.count()?controls.last():page.getByLabel('锅的位置');
        await control.scrollIntoViewIfNeeded();
        assert.ok(await control.evaluate(el=>{
          const p=el.closest('section').getBoundingClientRect(),r=el.getBoundingClientRect();
          return r.top>=p.top&&r.bottom<=p.bottom;
        }),'controls remain reachable inside short scrolling panels');
        await capture(page,`${viewport.width}-${activity}`);
        await complete(page);
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(out + '/report.json', JSON.stringify({measurements,errors,images},null,2));
    console.log(JSON.stringify({maxOverflow:Math.max(...measurements.map(m=>m.overflow)),errors,images:images.map(i=>i.file)}));
  } finally { await browser.close(); }
}
run().catch(e => { console.error(e); process.exitCode=1; });
