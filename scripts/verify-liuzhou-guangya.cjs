const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { guangyaPoint, GUANGYA_LENGTH, GUANGYA_WALK_OFFSET } = require('../src/components/liuzhou/guangya.ts');
const { terrainTriangleHeight } = require('../src/components/liuzhou/terrainMesh.ts');
const layout = require('../src/components/liuzhou/guangya-layout.json');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4133';
const out = process.env.LIUZHOU_QA_DIR || '.tmp/liuzhou-guangya-dev';
const report = { passed: false, errors: [], checks: [], captures: [] };
(async () => {
  assert.equal((await fetch(`${base}/game/liuzhou`, { signal: AbortSignal.timeout(60000) })).status, 200);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1440, height: 900 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const ready = async () => {
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && ![...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'))?.disabled, { timeout: 90000 });
      await page.evaluate(() => window.liuzhouTest.manual(true));
      await page.getByRole('button', { name: '自由巡览 · 快速飞行 ↗' }).click();
    };
    await page.goto(`${base}/game/liuzhou?test=1`); await ready();
    const player = () => page.evaluate(() => ({ ...window.liuzhouTest.game.player }));
    const view = (yaw, pitch = 0.15, zoom = 14) => page.evaluate(({ yaw, pitch, zoom }) => Object.assign(window.liuzhouTest.rig, { yaw, pitch, zoom, reset: true, dragged: performance.now() }), { yaw, pitch, zoom });
    const capture = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = path.join(out, `${name}.png`); const sanity = inspectPng(await page.screenshot({ path: file, fullPage: true }));
      const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const dom = await page.evaluate(() => ({ canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, calls: c.dataset.drawCalls })), width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dom.canvas.length, 1); assert.ok(dom.canvas[0].width > 0); assert.ok(dom.scroll <= dom.width + 1);
      report.captures.push({ name, file, sanity, state, dom });
      fs.writeFileSync(path.join(out, 'checkpoint.json'), JSON.stringify(report, null, 2)); console.log(`captured ${name}`);
    };
    const go = async (target, flying = false) => {
      console.log(`${flying ? 'fly' : 'walk'} to ${target.x.toFixed(2)},${target.z.toFixed(2)}`);
      let previous = Infinity; let still = 0;
      for (let chunk = 0; chunk < 220; chunk++) {
        const gap = await page.evaluate(({ target, flying }) => {
          const t = window.liuzhouTest; const p = t.game.player; const distance = Math.hypot(target.x - p.x, target.z - p.z);
          t.rig.yaw = Math.atan2(target.x - p.x, target.z - p.z); t.rig.dragged = performance.now();
          if (distance > (flying ? 4 : 0.13)) {
            const fast = flying && distance > 90; const pace = flying ? fast ? 160 : 55 : 4.4;
            t.move({ forward: 1, sprint: fast }, Math.max(1, Math.min(75, Math.floor((distance - (flying ? 3 : 0.06)) / pace * 60))));
          }
          return distance;
        }, { target, flying });
        if (gap < (flying ? 5 : 0.18)) return;
        still = Math.abs(previous - gap) < 0.015 ? still + 1 : 0; previous = gap;
        assert.ok(still < 4, `movement stuck toward ${JSON.stringify(target)} at gap ${gap}; player ${JSON.stringify(await player())}`);
      }
      assert.fail(`route did not reach ${JSON.stringify(target)}`);
    };
    const flyGround = async target => {
      if (!await page.evaluate(() => window.liuzhouTest.game.flight.active)) await page.keyboard.press('f');
      await page.evaluate(() => window.liuzhouTest.move({ jump: true, sprint: true }, 170));
      await go(target, true);
      await page.evaluate(() => { window.liuzhouTest.move({}, 50); window.liuzhouTest.move({ descend: true }, 900); window.liuzhouTest.move({}, 30); });
      await page.keyboard.press('f');
      assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
      const p = await player(); assert.ok(Math.abs(p.y - terrainTriangleHeight(p)) < 0.18, JSON.stringify(p));
    };
    const west = guangyaPoint(0, GUANGYA_WALK_OFFSET); const westGround = { x: west.x - 35, z: west.z };
    await flyGround(westGround); await go(westGround); await view(Math.PI / 2, 0.17, 16); await capture('01-west-street-to-bridge');
    await go(west);
    for (const along of [30, 100, 200, 300, 420, 500, 540, 650, 750]) {
      await go(guangyaPoint(along, GUANGYA_WALK_OFFSET));
      if (along === 300) { await view(Math.PI / 2, 0.22, 24); await capture('02-complete-west-approach'); }
    }
    await view(Math.PI / 2, 0.15, 16); await capture('03-main-bridge-sidewalk');
    const saved = await player(); await page.reload(); await ready();
    const restored = await player(); assert.ok(Math.hypot(restored.x - saved.x, restored.z - saved.z) < 0.3); assert.ok(Math.abs(restored.y - saved.y) < 0.2);
    assert.equal(await page.evaluate(() => window.liuzhouTest.game.flight.active), false);
    await view(Math.PI / 2, 0.15, 16); await capture('04-deck-save-restored');
    for (const along of [850, 950, 1030, 1070, 1100, 1130, GUANGYA_LENGTH]) await go(guangyaPoint(along, GUANGYA_WALK_OFFSET));
    const east = guangyaPoint(GUANGYA_LENGTH, GUANGYA_WALK_OFFSET); const eastGround = { x: east.x + 35, z: east.z };
    await go(eastGround); await view(-Math.PI / 2, 0.2, 17); await capture('05-east-ground-landing');
    report.checks.push({ name: 'ordinary walk from west street across complete north sidewalk to east street', player: await player() });
    const eastSouth = guangyaPoint(GUANGYA_LENGTH, -GUANGYA_WALK_OFFSET); await go({ x: eastSouth.x + 35, z: eastSouth.z }); await go(eastSouth);
    for (const along of [1130, 1100, 1070, 1030, 950, 850, 750, 650, 540, 500, 420, 300, 200, 100, 30, 0]) await go(guangyaPoint(along, -GUANGYA_WALK_OFFSET));
    const westSouth = guangyaPoint(0, -GUANGYA_WALK_OFFSET); await go({ x: westSouth.x - 35, z: westSouth.z });
    await view(Math.PI / 2, 0.2, 19); await capture('06-south-sidewalk-return');
    report.checks.push({ name: 'ordinary walk east to west along the complete south sidewalk', player: await player() });
    let index = 7;
    for (const crossing of layout.crossings.filter(c => ['835966480', '205519383', '481085881'].includes(c.roadId))) {
      const road = layout.sourceRoads.find(r => r.id === crossing.roadId); const points = road.points;
      const p = { x: crossing.at[0], z: crossing.at[1] };
      let segment;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]; const b = points[i]; const dx = b[0] - a[0]; const dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < 0.01) { segment = { dx, dz, length: Math.hypot(dx, dz) }; break; }
      }
      assert.ok(segment);
      const at = n => ({ x: p.x + segment.dx / segment.length * n, z: p.z + segment.dz / segment.length * n });
      await flyGround(at(-45)); await go(at(-45)); await go(p);
      const under = await player(); assert.ok(Math.abs(under.y - terrainTriangleHeight(under)) < 0.18);
      await view(Math.atan2(segment.dx, segment.dz), 0.17, 11); await capture(`${String(index++).padStart(2, '0')}-under-${crossing.roadId}`);
      await go(at(45)); await go(at(-45));
      report.checks.push({ name: `${road.name} remains on the lower road in both directions`, crossing, player: await player() });
    }
    await page.setViewportSize({ width: 390, height: 844 }); await capture('10-mobile-underpass');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
