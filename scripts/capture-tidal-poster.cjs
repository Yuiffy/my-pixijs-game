const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
(async () => {
  const url = process.env.TIDAL_DUEL_URL || 'http://localhost:4040/game/tidal-duel';
  const output = path.resolve(process.env.TIDAL_DUEL_OUTPUT || 'tmp/tidal-modern/poster');
  fs.mkdirSync(output, { recursive: true });
  assert.equal((await fetch(url, { signal: AbortSignal.timeout(20000) })).status, 200);
  const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await page.goto(url); await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).assetsReady);
    await page.evaluate(() => window.tidalDuel?.manual(true));
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(state.phase, 'menu'); assert.equal(state.title, '潮夜格斗 · 岁己 vs 栞栞'); assert.ok(state.fighters.every(f => f.skin === 'original'));
    const data = await page.evaluate(() => {
      const source = document.querySelector('canvas'), poster = document.createElement('canvas');
      poster.width = source.width; poster.height = source.height;
      const ctx = poster.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(source, 0, 0);
      ctx.fillStyle = '#e5daff'; ctx.font = '900 88px "Microsoft YaHei", sans-serif'; ctx.fillText('潮夜格斗', 56, 194);
      ctx.fillStyle = '#fff0d3'; ctx.font = '700 19px "Microsoft YaHei", sans-serif'; ctx.fillText('TIDE FIGHTERS  /  岁己 × 栞栞', 60, 245);
      ctx.font = '500 24px "Microsoft YaHei", sans-serif'; ctx.fillText('轻中重出招，按后防御。', 60, 310);
      ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#c8b6e5'; ctx.fillText('小猫帽原皮 · 月色旅装 · 可选衣装', 60, 540);
      document.body.replaceChildren(poster); document.body.style.cssText = 'margin:0;width:1280px;height:720px;overflow:hidden;background:#241e39';
      poster.style.cssText = 'display:block;width:1280px;height:720px';
      return poster.toDataURL('image/webp', 0.95);
    });
    assert.match(data, /^data:image\/webp;base64,/);
    fs.writeFileSync(path.resolve('public/games/tidal-duel/poster.webp'), Buffer.from(data.split(',')[1], 'base64'));
    const pixels = inspectPng(await page.screenshot({ path: path.join(output, 'poster.png'), fullPage: true }));
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ state, pixels, errors }, null, 2));
    console.log(JSON.stringify({ output: 'public/games/tidal-duel/poster.webp', pixels, errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
