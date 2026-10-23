const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const pilot = require('./lib/sui-delivery-campaign-pilot.cjs');
const model = require('./lib/sui-delivery-model.cjs');
const base = process.env.DELIVERY_BASE_URL || 'http://127.0.0.1:4138';
const out = process.env.DELIVERY_QA_DIR || '.tmp/sui-delivery/environment';
const report = { errors: [], captures: [], checks: [], assets: [] };
const ovenFocus = process.env.DELIVERY_ART_FOCUS === 'oven';
const marketFocus = process.env.DELIVERY_ART_FOCUS === 'market';
const freightFocus = process.env.DELIVERY_ART_FOCUS === 'freight';
const selected = freightFocus ? {
  'market-stalls': ['take-meal'],
  'freight-lunch': ['loading-dock', 'middle-stop', 'dispatch-reflection', 'under-loading-beam', 'unload-arrival', 'delivered'],
  'serving-machine': ['take-meal', 'arm-warning', 'arm-sweep', 'belt-stopped-0', 'upper-belt-1', 'belt-stopped-1', 'upper-belt-2', 'belt-stopped-2', 'serving-table-bridge'],
  'rain-relay': ['take-meal'],
} : marketFocus ? {
  'oven-crab': ['claw-warning'],
  'market-stalls': ['take-meal', 'moving-stall-rider', 'market-low-beam', 'reflected-heat', 'bell-open', 'customer-arrival', 'delivered'],
  'freight-lunch': ['loading-dock', 'sloped-rail-rider', 'middle-stop', 'dispatch-reflection', 'under-loading-beam', 'unloading-stop', 'delivered'],
  'serving-machine': ['take-meal', 'serving-table-bridge'],
  'rain-relay': ['take-meal'],
} : ovenFocus ? {
  'bakery-backdoor': ['take-meal'],
  'oven-crab': ['take-meal', 'claw-warning', 'vent-warning', 'pan-raised-0', 'on-back-0', 'valve-0', 'pan-raised-1', 'on-back-1', 'valve-1', 'pan-raised-2', 'on-back-2', 'valve-2', 'delivered'],
  'market-stalls': ['take-meal'],
  'rain-relay': ['take-meal'],
} : {
  'bakery-backdoor': ['take-meal', 'low-kitchen-beam', 'pan-rider', 'flour-shelf', 'kitchen-window', 'cooling-awning', 'backdoor-arrival', 'delivered'],
  'oven-crab': ['claw-warning', 'on-back-0', 'delivered'],
  'market-stalls': ['take-meal'],
  'rain-relay': ['take-meal'],
};
const state = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(p, name) {
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dom = await p.evaluate(() => {
    const c = document.querySelector('canvas'); const box = c.getBoundingClientRect();
    return { width: c.width, height: c.height, box: box.toJSON(), count: document.querySelectorAll('canvas').length, innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText };
  });
  assert.equal(dom.count, 1); assert.ok(dom.box.width > 0 && dom.box.height > 0);
  assert.ok(Math.abs(dom.width / dom.height - dom.box.width / dom.box.height) < 0.015);
  assert.ok(dom.scrollWidth <= dom.innerWidth + 1 && dom.scrollHeight <= dom.innerHeight + 1);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await p.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  const actual = await state(p);
  const ovenArt = await p.evaluate(() => window.deliveryTest.oven());
  const marketArt = await p.evaluate(() => window.deliveryTest.market());
  const servingArt = await p.evaluate(() => window.deliveryTest.serving());
  const freight = actual.order === 'freight-lunch';
  const sorter = actual.order === 'serving-machine';
  assert.equal(servingArt.facades.filter(facade => facade.key === 'freight-station').length, freight ? 3 : 0);
  assert.equal(servingArt.facades.filter(facade => facade.key === 'sorter-tower').length, sorter ? 1 : 0);
  if (freight) {
    for (const [i, [x, bottom, width]] of [[585, 540, 270], [1585, 500, 400], [2895, 460, 300]].entries()) {
      const facade = servingArt.facades[i];
      assert.equal(facade.scale, width / 1476);
      assert.equal(facade.x + 30 * facade.scale, x);
      assert.equal(facade.y + 928 * facade.scale, bottom);
    }
  }
  assert.equal(servingArt.ladle.visible, !!actual.machine && actual.machine.phase !== 'off');
  assert.equal(servingArt.ladle.texture, 'sorter-ladle');
  const stage = actual.switches.filter(id => id.startsWith('sorter-bell-')).length;
  if (actual.machine) {
    const expectedX = actual.machine.phase === 'sweep' ? 1030 + (1 - actual.machine.timer / 0.65) * 510 : 1050;
    assert.equal(servingArt.ladle.x, expectedX);
    assert.equal(servingArt.ladle.y, 680 - Math.min(2, stage) * 120 - 22);
  }
  servingArt.lights.forEach((light, i) => {
    const active = actual.machine && !['sleep', 'off'].includes(actual.machine.phase) && i === stage;
    assert.equal(light.visible, sorter);
    assert.equal(light.x, 1785);
    assert.equal(light.y, 680 - (1497 - [390, 535, 680][i]) * (375 / 1461));
    if (sorter) assert.equal(light.color, i < stage ? 0x8cae80 : active ? 0xe8b759 : 0x35473e);
  });
  const hasMarketCart = ['market-stalls', 'freight-lunch'].includes(actual.order);
  assert.equal(marketArt.cart.visible, hasMarketCart);
  assert.equal(marketArt.cart.texture, 'market-cart');
  assert.equal(marketArt.facades.filter(key => key === 'market-produce').length, actual.order === 'market-stalls' ? 5 : 0);
  assert.equal(marketArt.facades.filter(key => key === 'market-canteen').length, actual.order === 'market-stalls' ? 1 : 0);
  if (hasMarketCart) {
    assert.equal(marketArt.cart.x, actual.cart.x);
    assert.equal(marketArt.cart.y, actual.cart.y);
    assert.equal(marketArt.cart.scaleX, 160 / 1896);
    assert.equal(marketArt.cart.scaleY, 58 / 491);
  }
  assert.equal(ovenArt.shell.visible, !!actual.boss);
  assert.equal(ovenArt.claw.visible, !!actual.boss && actual.boss.phase !== 'off');
  assert.deepEqual(ovenArt.facades.filter(key => key === 'oven-courtyard'), actual.boss ? ['oven-courtyard', 'oven-courtyard'] : []);
  if (actual.boss) {
    assert.equal(ovenArt.shell.x, actual.boss.x + 125);
    assert.equal(ovenArt.shell.y, 653);
    assert.equal(ovenArt.claw.flipX, actual.boss.facing > 0);
  }
  report.captures.push({ name, file, pixels, dom, state: actual, ovenArt, marketArt, servingArt });
}
(async () => {
  assert.equal((await fetch(`${base}/game/sui-spring`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.DELIVERY_HEADED !== '1', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(() => {
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      Element.prototype.requestPointerLock = async () => {};
      document.exitPointerLock = () => {};
    });
    await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await ctx.route(/\/api\/(record|demos\/visits)(\?|$)/, r => r.fulfill({ json: { success: true, count: 0 } }));
    const p = await ctx.newPage();
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    p.on('response', r => {
      if (r.status() >= 400 && r.url().startsWith(base)) report.errors.push(`HTTP ${r.status()} ${r.url()}`);
      if (r.url().includes('/sui-spring/environment/')) report.assets.push({ url: r.url(), status: r.status() });
    });
    await p.goto(`${base}/game/sui-spring?test=1`);
    await p.waitForFunction(() => !!window.deliveryTest && !!document.querySelector('canvas') && Array.from(document.querySelectorAll('button')).some(b => !b.disabled && /接下第一单/.test(b.textContent)));
    await p.evaluate(() => window.deliveryTest.manual(true));
    await p.getByRole('button', { name: /^接下第一单/ }).click();
    const runs = pilot.campaign();
    for (let i = 0; i < runs.length; i++) {
      if (i) await p.getByRole('button', { name: `下一单 · ${model.LEVELS[i].title} →`, exact: true }).click();
      const run = runs[i]; let frame = 0;
      for (const mark of run.milestones) {
        if (ovenFocus && run.s.levelId === 'oven-crab' && mark.name === 'vent-warning') {
          const before = await state(p);
          const sweepFrame = frame + Math.ceil((before.boss.timer + 0.12) / model.FIXED_DT);
          assert.ok(sweepFrame < mark.frame);
          await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(frame, sweepFrame)); frame = sweepFrame;
          assert.equal((await state(p)).boss.phase, 'claw');
          await capture(p, 'oven-claw-sweep');
        }
        await p.evaluate(tape => window.deliveryTest.replay(tape), run.tape.slice(frame, mark.frame)); frame = mark.frame;
        const actual = await state(p);
        assert.equal(actual.order, mark.state.order); assert.equal(actual.phase, mark.state.phase);
        assert.ok(Math.abs(actual.player.x - mark.state.player.x) < 0.01); assert.ok(Math.abs(actual.player.y - mark.state.player.y) < 0.01);
        assert.equal(actual.player.health, 3); assert.equal(actual.deaths, 0);
        if ((selected[actual.order] || []).includes(mark.name)) await capture(p, `${actual.order}-${mark.name}`);
        const mobileMilestone = freightFocus
          ? (actual.order === 'freight-lunch' && mark.name === 'middle-stop') || (actual.order === 'serving-machine' && ['arm-sweep', 'upper-belt-2'].includes(mark.name))
          : marketFocus
          ? (actual.order === 'market-stalls' && ['moving-stall-rider', 'customer-arrival'].includes(mark.name)) || (actual.order === 'freight-lunch' && mark.name === 'under-loading-beam')
          : ovenFocus
          ? actual.order === 'oven-crab' && ['on-back-0', 'on-back-2'].includes(mark.name)
          : actual.order === 'bakery-backdoor' && ['pan-rider', 'backdoor-arrival'].includes(mark.name);
        if (mobileMilestone) {
          for (const [orientation, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
            await p.setViewportSize({ width, height });
            await capture(p, `${freightFocus ? 'freight' : marketFocus ? 'market' : ovenFocus ? 'oven' : 'bakery'}-${mark.name}-${orientation}`);
            const resized = await state(p);
            assert.equal(resized.player.x, actual.player.x);
            assert.equal(resized.player.y, actual.player.y);
            assert.equal(resized.phase, actual.phase);
            assert.equal(resized.time, actual.time);
            assert.ok(resized.player.x >= resized.camera.x + 10, 'resized player left remains visible without physics steps');
            assert.ok(resized.player.x + resized.player.w <= resized.camera.x + resized.viewport.w - 10, 'resized player right remains visible without physics steps');
            assert.ok(resized.player.y >= resized.camera.y && resized.player.y + resized.player.h < resized.camera.y + resized.viewport.h, 'resized player and landing remain visible');
          }
          await p.setViewportSize({ width: 1440, height: 1000 });
        }
      }
      const actual = await state(p); assert.equal(actual.phase, 'delivered');
      assert.deepEqual(actual.save.delivered, model.LEVELS.slice(0, i + 1).map(v => v.id));
    }
    await p.evaluate(() => window.advanceTime(1000)); await capture(p, 'seated-ending');
    report.checks.push('fresh twelve-order normal-input campaign with unchanged exact positions, full health and zero deaths; raster scenery and moving cart align with gameplay surfaces; previous district images are hidden/destroyed; actual seated ending');
    await p.getByRole('button', { name: '回小馆看看', exact: true }).click();
    for (const item of model.HOME_DECORATIONS) await p.getByRole('button', { name: `${item.price} 零钱 · 添置${item.name}`, exact: true }).click();
    assert.equal(await p.locator('[data-decoration]').count(), 4);
    await p.getByRole('button', { name: '关闭面板', exact: true }).click();
    await p.getByRole('button', { name: '订单', exact: true }).click();
    await p.getByRole('button', { name: new RegExp(model.LEVELS[0].title) }).click();
    await capture(p, 'decorated-cafe');
    await p.setViewportSize({ width: 390, height: 844 }); await capture(p, 'portrait-decorated-cafe');
    await p.setViewportSize({ width: 844, height: 390 }); await capture(p, 'landscape-decorated-cafe');
    report.checks.push('four decorations bought through real UI after the campaign; lights, cloth, photo and herb shelf remain visible against the new facade on desktop, portrait and landscape');
    const assets = [...new Set(report.assets.map(v => v.url.split('/').at(-1)))].sort();
    assert.deepEqual(assets, ['attic-v1.webp', 'bakery-backdoor-v1.webp', 'bakery-v1.webp', 'bread-rack-v1.webp', 'cafe-v1.webp', 'freight-station-v1.webp', 'gatehouse-v1.webp', 'kitchen-oven-v1.webp', 'kitchen-wall-v1.webp', 'market-canteen-v1.webp', 'market-cart-v1.webp', 'market-produce-v1.webp', 'oven-courtyard-v1.webp', 'oven-crab-claw-v1.webp', 'oven-crab-shell-v1.webp', 'sorter-ladle-v1.webp', 'sorter-tower-v1.webp', 'workshop-v1.webp']);
    assert.ok(report.assets.every(v => v.status === 200));
    const expectedCaptures = Object.entries(selected).flatMap(([order, marks]) => marks.map(mark => `${order}-${mark}`));
    expectedCaptures.push('seated-ending', 'decorated-cafe', 'portrait-decorated-cafe', 'landscape-decorated-cafe');
    if (freightFocus) {
      for (const mark of ['middle-stop', 'arm-sweep', 'upper-belt-2']) for (const orientation of ['portrait', 'landscape']) expectedCaptures.push(`freight-${mark}-${orientation}`);
      report.checks.push('three open station canopies sit on actual loading/middle/upper unload platforms; sorter tower and live indicator colors follow all three actual switch states; ladle follows the true sweep center and disappears when stopped; all new props cleaned up in adjacent districts; portrait/landscape station, active sweep and highest belt');
    } else if (marketFocus) {
      for (const mark of ['moving-stall-rider', 'customer-arrival', 'under-loading-beam']) for (const orientation of ['portrait', 'landscape']) expectedCaptures.push(`market-${mark}-${orientation}`);
      report.checks.push('five market produce counters, upstairs canteen sill at real destination ledge, cart chassis at exact physical position on both market rail and sloped freight route, counter/canteen cleanup and hidden chassis in subsequent districts; portrait/landscape rider, customer arrival and low freight beam');
    } else if (ovenFocus) {
      expectedCaptures.push('oven-claw-sweep');
      for (const mark of ['on-back-0', 'on-back-2']) for (const orientation of ['portrait', 'landscape']) expectedCaptures.push(`oven-${mark}-${orientation}`);
      report.checks.push('oven shell and mirrored claw follow all three real stages, actual claw sweep, all valve closures, off-state bread, two courtyard facades and portrait/landscape back landings; shell/claw hidden and courtyard facades destroyed on leaving oven district');
    } else for (const mark of ['pan-rider', 'backdoor-arrival']) for (const orientation of ['portrait', 'landscape']) expectedCaptures.push(`bakery-${mark}-${orientation}`);
    assert.deepEqual(report.captures.map(c => c.name).sort(), expectedCaptures.sort());
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.passed, captures: report.captures.length, errors: report.errors, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
