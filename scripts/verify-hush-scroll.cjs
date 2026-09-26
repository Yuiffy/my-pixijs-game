const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { state, advance, reachAction, hold, capture, images } = require('./verify-hush-3d.cjs');
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:3879';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-scroll';
const baseline = process.env.HUSH_SCROLL_BASELINE === '1';
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
      for (const activity of baseline ? ['lock'] : ['lock','cook']) {
        if (activity === 'cook') { await reachAction(page, 'cook'); await hold(page); }
        assert.equal((await state(page)).daily.panel, activity);
        const cycle = 2 * Math.PI / 2.2;
        for (const phase of [0, .25, .5, .75, 1]) {
          const clock = (await state(page)).daily.clock;
          await advance(page, ((phase * cycle - clock % cycle + cycle) % cycle) * 1000);
          await page.waitForTimeout(100);
          const layout = await page.locator('[role="meter"]').evaluate(meter => {
            const panel = meter.closest('section'), needle = meter.querySelector('i');
            const n = needle.getBoundingClientRect(), t = meter.getBoundingClientRect();
            return {overflow:panel.scrollWidth-panel.clientWidth, vertical:panel.scrollHeight-panel.clientHeight,
              x:(n.x+n.width/2-t.x)/t.width, needleHeight:n.height, trackHeight:t.height};
          });
          measurements.push({viewport,activity,phase,...layout});
          if (!baseline) assert.equal(layout.overflow, 0, JSON.stringify(measurements.at(-1)));
          assert.ok(Math.abs(layout.x - (1-Math.cos(phase*2*Math.PI))/2) < .025);
          assert.ok(layout.needleHeight > layout.trackHeight, 'needle must keep its visible overhang');
          if (phase === .5) {
            await page.locator('[role="meter"]').scrollIntoViewIfNeeded();
            await capture(page, `${viewport.width}-${activity}-right`);
          }
        }
        if (!baseline && viewport.height < 600) {
          const button = page.locator('[data-daily-timing]');
          await button.scrollIntoViewIfNeeded();
          assert.ok(await button.isVisible());
          if (viewport.height < 400) assert.ok(await button.evaluate(b => b.closest('section').scrollTop > 0), 'short panels must retain vertical scrolling');
          assert.ok(await button.evaluate(b => {
            const p = b.closest('section').getBoundingClientRect(), r = b.getBoundingClientRect();
            return r.top >= p.top && r.bottom <= p.bottom;
          }), 'scrolled action must be inside the panel');
          // Score through the same button after scrolling, to prove it remains reachable.
          if (activity === 'cook') {
            const clock = (await state(page)).daily.clock;
            await advance(page, ((.25*cycle-clock%cycle+cycle)%cycle)*1000);
            await button.click();
            assert.equal((await state(page)).daily.beats, 1);
          }
        }
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(out + '/report.json', JSON.stringify({measurements,errors,images},null,2));
    console.log(JSON.stringify({maxOverflow:Math.max(...measurements.map(m=>m.overflow)),errors,images:images.map(i=>i.file)}));
  } finally { await browser.close(); }
}
run().catch(e => { console.error(e); process.exitCode=1; });
