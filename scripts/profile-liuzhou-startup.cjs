const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(require('node:os').homedir(), '.codex/skills/develop-web-game')] }));
const { quietContext } = require('./lib/liuzhou-test-browser.cjs');
const base = process.env.LIUZHOU_BASE_URL || 'http://127.0.0.1:4134';
const output = process.env.LIUZHOU_PROFILE || 'tmp/liuzhou/startup-profile.json';
(async () => {
  if ((await fetch(`${base}/game/liuzhou`)).status !== 200) throw new Error('Server unavailable');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  try {
    const context = await quietContext(browser, { viewport: { width: 1280, height: 800 } });
    await context.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//, r => r.fulfill({ body: '' }));
    await context.addInitScript(() => {
      window.startupProfile = { longTasks: [], milestones: {} };
      new PerformanceObserver(list => list.getEntries().forEach(e => window.startupProfile.longTasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask', buffered: true });
      const observer = new MutationObserver(() => {
        const milestones = window.startupProfile.milestones;
        if (document.querySelector('h1') && !milestones.title) milestones.title = performance.now();
        const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('自由巡览 · 快速飞行'));
        if (button && !button.disabled && !milestones.playable) milestones.playable = performance.now();
      });
      observer.observe(document, { childList: true, subtree: true, attributes: true });
    });
    const page = await context.newPage(); const errors = [];
    const cdp = process.env.LIUZHOU_CPU ? await context.newCDPSession(page) : null;
    if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/game/liuzhou?test=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.startupProfile?.milestones.playable, null, { timeout: 180000 });
    if (cdp) fs.writeFileSync(`${output}.cpuprofile`, JSON.stringify((await cdp.send('Profiler.stop')).profile));
    const result = await page.evaluate(() => ({ ...window.startupProfile, marks: performance.getEntriesByType('mark').map(e => ({ name: e.name, time: e.startTime })), resources: performance.getEntriesByType('resource').filter(e => e.name.includes('/_next/')).map(e => ({ name: e.name.split('/').pop(), end: e.responseEnd, bytes: e.transferSize })) }));
    fs.writeFileSync(output, JSON.stringify({ ...result, errors }, null, 2));
    console.log(JSON.stringify({ milestones: result.milestones, longTasks: result.longTasks.sort((a, b) => b.duration - a.duration).slice(0, 8), errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
