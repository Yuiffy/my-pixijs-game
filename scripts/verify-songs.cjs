const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const url = process.env.SONGS_URL || 'http://localhost:3957/liver/sui/songs';
const output = path.resolve('tmp/songs-qa');
const real = JSON.parse(fs.readFileSync('src/data/songs/sui.json', 'utf8'));
fs.mkdirSync(output, { recursive: true });

(async () => {
  assert.equal((await fetch(url)).status, 200, 'target server responds');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const errors = []; const screenshots = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles' });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    await page.route('**/api/record', route => route.fulfill({ json: { success: true } }));
    for (const pattern of ['**/pagead/**', '**/hm.baidu.com/**']) await page.route(pattern, route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    let response = {};
    await page.route('**/public/data/streams/sui/songs.json', route => route.fulfill({ json: response }));
    async function capture(name) {
      const png = await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
      const metrics = inspectPng(png);
      assert.ok(!metrics.suspicious, JSON.stringify(metrics));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
      screenshots.push({ name, metrics });
    }
    await page.goto(url);
    await page.getByText('暂时无法获取最新歌单，正在显示已保存的数据。', { exact: false }).waitFor();
    const bubble = page.locator('section[aria-label="歌曲与演唱记录"] > details').filter({ has: page.locator('summary').filter({ hasText: '泡泡' }) });
    await bubble.locator('summary').click();
    assert.equal(await bubble.getByRole('link', { name: '播放歌切' }).getAttribute('href'), real.performances.find(p => p.name === '泡泡').clip.url);
    assert.match(await bubble.locator('time').innerText(), /2026\/10\/01 21:25:20/);
    for (const name of ['泡泡', "Don't Look Back in Anger", 'Moon River']) {
      assert.equal(await page.locator('summary strong').getByText(name, { exact: true }).count(), 1);
    }
    assert.equal(await page.getByRole('link', { name: '返回岁己首页' }).getAttribute('href'), '/');
    response = { ...real, generatedAt: '2026-10-02T00:00:00Z', performances: real.performances.map(p => ({ ...p, name: null })) };
    await page.getByRole('button', { name: '刷新数据' }).click();
    await page.getByText('远端数据尚未更新', { exact: false }).waitFor();
    assert.equal(await page.locator('summary strong').getByText('Moon River', { exact: true }).count(), 1);
    await capture('01-real-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('02-real-mobile');
    const sessions = [
      { id: 's1', recordedAt: '2026-10-01 23:59:00', title: '第一场直播', complete: true },
      { id: 's2', recordedAt: '2026-09-20 20:00:00', title: '第二场直播', complete: true },
      { id: 's3', recordedAt: '2026-09-19 20:00:00', title: '检查未完成的直播', complete: false },
    ];
    const row = (id, name, sessionId, more = {}) => ({ id, name, sessionId, start: 120, end: 300, performance: 'full', confirmed: true, boundariesConfirmed: true, clip: null, ...more });
    response = { version: 1, generatedAt: real.generatedAt, sessions, performances: [
      row('a', '夜曲', 's1', { clip: { bvid: 'BV1pvaU6xE6i', part: 2, url: 'https://www.bilibili.com/video/BV1pvaU6xE6i/?p=2' } }),
      row('b', '夜曲', 's2', { performance: 'fragment' }),
      row('c', '夜曲', 's3', { confirmed: false }),
      row('u1', null, 's1', { confirmed: false }), row('u2', null, 's2', { confirmed: false }),
      ...Array.from({ length: 24 }, (_, i) => row(`extra${i}`, `其他歌曲${i}`, 's2')),
    ] };
    await page.getByRole('button', { name: '刷新数据' }).click();
    await page.getByText('已加载最新歌单', { exact: false }).waitFor();
    await page.getByRole('button', { name: '下一页' }).click();
    assert.match(await page.getByRole('navigation', { name: '歌曲分页' }).innerText(), /2 \/ 2/);
    await page.getByLabel('搜索歌曲', { exact: true }).fill('夜曲');
    await page.getByRole('status').filter({ hasText: '1 个歌曲条目 · 3 条记录' }).waitFor();
    assert.equal(await page.locator('time').count(), 3);
    assert.match(await page.locator('time').first().innerText(), /2026\/10\/02 00:01:00/);
    await capture('03-fixture-search-mobile');
    await page.getByLabel('核验状态').selectOption('confirmed');
    await page.getByRole('status').filter({ hasText: '2 条记录' }).waitFor();
    await page.getByLabel('演唱类型').selectOption('fragment');
    await page.getByRole('status').filter({ hasText: '1 条记录' }).waitFor();
    assert.equal(await page.getByRole('link', { name: '播放歌切' }).count(), 0);
    await page.getByLabel('演唱类型').selectOption('all');
    await page.getByLabel('歌切').selectOption('uploaded');
    assert.match(await page.getByRole('link', { name: '播放歌切' }).getAttribute('href'), /\?p=2$/);
    await page.reload();
    await page.getByText('已加载最新歌单', { exact: false }).waitFor();
    assert.equal(await page.getByLabel('搜索歌曲', { exact: true }).inputValue(), '夜曲');
    assert.equal(await page.getByLabel('歌切').inputValue(), 'uploaded');
    await page.getByRole('button', { name: '重置筛选' }).click();
    await page.getByLabel('演唱日期 · 从').fill('2026-10-02');
    await page.getByLabel('到', { exact: true }).fill('2026-10-02');
    await page.getByRole('status').filter({ hasText: '2 条记录' }).waitFor();
    await page.getByLabel('到', { exact: true }).fill('2026-10-01');
    await page.getByRole('alert').filter({ hasText: '开始日期不能晚于结束日期' }).waitFor();
    await page.getByRole('button', { name: '重置筛选' }).click();
    await page.getByLabel('搜索歌曲', { exact: true }).fill('不存在的歌曲');
    await page.getByRole('heading', { name: '没有匹配的演唱记录' }).waitFor();
    await capture('04-no-results');
    await page.getByRole('button', { name: '清除筛选' }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('排序').selectOption('count');
    assert.match(await page.locator('section[aria-label="歌曲与演唱记录"] > details > summary').first().innerText(), /夜曲/);
    await page.locator('section[aria-label="歌曲与演唱记录"] > details > summary').first().click();
    await capture('05-fixture-library');
    response = { version: 1, generatedAt: real.generatedAt, sessions: [], performances: [] };
    await page.getByRole('button', { name: '刷新数据' }).click();
    await page.getByRole('heading', { name: '暂时没有演唱记录' }).waitFor();
    await page.goto(new URL('/liver', url).href);
    assert.equal(await page.locator('a[href="/liver/sui/songs"]').count(), 0);
    assert.equal(await page.locator('a[href="/liver/sui/gifts"]').count(), 0);
    await page.route('**/data/streams/sui/streams.json', route => route.fulfill({ json: [] }));
    await page.goto(new URL('/liver/sui', url).href);
    await page.getByRole('navigation', { name: '主播页面导航' }).waitFor();
    assert.equal(await page.locator('a[href="/liver/sui/songs"]').count(), 0);
    assert.equal(await page.locator('a[href="/liver/sui/gifts"]').count(), 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ screenshots, errors, passed: true }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: screenshots.map(s => s.name), errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
