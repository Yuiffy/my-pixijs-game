const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex/skills/develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const url = process.env.RECAPS_URL || 'http://localhost:3962/liver/sui';
const output = path.resolve('tmp/stream-recaps-qa');
fs.mkdirSync(output, { recursive: true });

(async () => {
  // Verify the actual URL before launching system Chrome.
  assert.equal((await fetch(url)).status, 200, 'target server responds');
  const { syncStreamRecaps } = await import('./sync-stream-recaps.mjs');
  const { resolveStreamTargetDir } = await import('./stream-shards.mjs');
  const all = syncStreamRecaps({ output: path.join(output, 'streams.json') });
  const first = all.find(stream => stream.id === '2026_10_02_20_24_20');
  const watch = all.find(stream => stream.id === '2026_10_01_20_13_38');
  const split = all.find(stream => stream.id === '2026_09_12_20_00_00') || all.find(stream => stream.recap?.games.some(game => game.clips?.length === 2));
  const legacy = all.find(stream => stream.id === '2026_05_20_20_13_10');
  assert.ok(first?.recap && watch?.recap && split?.recap && legacy);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--disable-speech-api'] });
  const errors = []; const warnings = []; const screenshots = [];
  let records = [first, watch, split, legacy]; let failHighlight = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' });
    await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (/^Warning: \[antd:.*deprecated/.test(message.text())) warnings.push(message.text());
      else errors.push(message.text());
    });
    await page.route('**/api/record', route => route.fulfill({ json: { success: true } }));
    for (const pattern of ['**/pagead/**', '**/hm.baidu.com/**']) await page.route(pattern, route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/data/streams/**', async route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname).replace(/\/+/g, '/');
      if (pathname.endsWith('/streams.json')) { await route.fulfill({ json: records }); return; }
      const [, , , liverId, streamId, ...files] = pathname.split('/');
      if (failHighlight && files.at(-1) === 'highlights.md') { await route.fulfill({ status: 503, body: 'unavailable' }); return; }
      const file = path.join(resolveStreamTargetDir(liverId, streamId), ...files);
      assert.ok(fs.existsSync(file), `local real archive file exists: ${pathname}`);
      const contentType = file.endsWith('.md') ? 'text/markdown; charset=utf-8' : file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      await route.fulfill({ body: fs.readFileSync(file), contentType });
    });
    async function capture(name, fullPage = false) {
      const png = await page.screenshot({ path: path.join(output, `${name}.png`), fullPage, animations: 'disabled' });
      const metrics = inspectPng(png);
      assert.ok(metrics.colors > 1 && metrics.nearBlackRatio < 0.97 && metrics.transparentRatio < 0.97, `screenshot sanity: ${JSON.stringify(metrics)}`);
      screenshots.push({ name, metrics });
    }
    async function sectionOrder(root, expected) {
      await root.getByRole('region', { name: 'Highlight', exact: true }).waitFor({ state: 'attached' });
      const order = await root.locator('[aria-label="直播内容"] > section, [aria-label="直播内容"] > details').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
      assert.deepEqual(order, expected);
    }
    await page.goto(url);
    const card = page.locator(`[id="stream-${first.id}"]`);
    await sectionOrder(card, ['直播梗概', '晚安回复', 'Highlight', '生成信息']);
    assert.equal(await card.getByRole('link', { name: '查看Moon River的歌切记录' }).getAttribute('href'), '/liver/sui/songs?q=Moon+River');
    assert.match(await card.getByRole('region', { name: '游戏', exact: true }).getByRole('link').getAttribute('href'), /BV1VzHh6YE3j/);
    assert.equal(await card.getByText('generatedAt:', { exact: false }).isVisible(), false);
    const watched = page.locator(`[id="stream-${watch.id}"]`);
    await sectionOrder(watched, ['直播梗概', '晚安回复', 'Highlight', '生成信息']);
    assert.equal(await watched.getByRole('region', { name: '同步视听', exact: true }).getByRole('link').getAttribute('href'), 'https://www.bilibili.com/video/BV1VGaU63EaL/?p=1');
    const splitCard = page.locator(`[id="stream-${split.id}"]`);
    assert.equal(await splitCard.getByRole('region', { name: '游戏', exact: true }).getByRole('link').count(), 2);
    await sectionOrder(page.locator(`[id="stream-${legacy.id}"]`), ['晚安回复', 'Highlight']);
    await card.scrollIntoViewIfNeeded();
    await capture('01-real-list-desktop');
    await card.getByRole('heading', { name: '晚安回复', exact: true }).scrollIntoViewIfNeeded();
    await capture('02-real-goodnight-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await card.getByRole('heading', { name: '直播梗概', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile list has no horizontal overflow');
    await capture('03-real-list-mobile');
    const panel = card.locator('article').locator('..');
    assert.ok(await panel.evaluate(element => element.scrollHeight > element.clientHeight), 'long content stays in a scrollable mobile panel');
    await card.getByRole('heading', { name: 'Highlight', exact: true }).scrollIntoViewIfNeeded();
    await capture('04-real-highlight-mobile');

    await page.route('**/public/data/streams/sui/songs.json', route => route.fulfill({ json: JSON.parse(fs.readFileSync('src/data/songs/sui.json', 'utf8')) }));
    await card.getByRole('link', { name: '查看Moon River的歌切记录' }).click();
    await page.waitForURL('**/liver/sui/songs?q=Moon+River');
    await page.getByRole('status').filter({ hasText: '1 个歌曲条目' }).waitFor();
    assert.equal(await page.getByLabel('搜索歌曲', { exact: true }).inputValue(), 'Moon River');
    assert.equal(await page.locator('summary strong').getByText('Moon River', { exact: true }).count(), 1);
    await page.goto(url);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '日历视图' }).click();
    await page.locator('.stream-calendar-item').filter({ hasText: watch.title }).first().click();
    const dialog = page.getByRole('dialog');
    await sectionOrder(dialog, ['直播梗概', '晚安回复', 'Highlight', '生成信息']);
    assert.equal(await dialog.getByRole('region', { name: '同步视听', exact: true }).getByRole('link').getAttribute('href'), 'https://www.bilibili.com/video/BV1VGaU63EaL/?p=1');
    await capture('05-real-calendar-detail-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole('heading', { name: '晚安回复', exact: true }).scrollIntoViewIfNeeded();
    const bounds = await dialog.locator('.ant-modal-content').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'mobile dialog fits viewport');
    await capture('06-real-calendar-detail-mobile');
    await dialog.getByText('生成信息', { exact: true }).click();
    await dialog.locator('details[aria-label="生成信息"]').scrollIntoViewIfNeeded();
    assert.equal(await dialog.getByText('generatedAt:', { exact: false }).isVisible(), true);
    await capture('07-bottom-metadata-mobile');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    // The shared renderer also handles a different liver, without dead Sui links.
    records = [{ ...first, id: '2026_10_04_20_00_00', title: '测试其他主播', cover: null, images: [], srt: null, xml: null,
      highlights: '## Highlight\n\n[5m] 事件\n\n## 晚安回复\n\n辛苦啦，晚安！\n\n## 直播梗概\n\n唱歌和闲聊。',
      recap: { overview: '歌回与游戏', songs: [{ name: '夜曲' }], games: [{ name: '空洞骑士' }], watch: [], other: [] } }];
    await page.goto(new URL('/liver/shiori', url).href);
    const other = page.locator('[id="stream-2026_10_04_20_00_00"]');
    await sectionOrder(other, ['直播梗概', '晚安回复', 'Highlight']);
    assert.equal(await other.getByRole('region', { name: '歌曲', exact: true }).getByRole('link').count(), 0);
    assert.equal(await other.getByRole('region', { name: '游戏', exact: true }).getByRole('link').count(), 0);
    assert.deepEqual(errors, []);
    records = [first]; failHighlight = true;
    await page.goto(url);
    await page.getByRole('status').filter({ hasText: '晚安回复与 Highlight 加载失败。' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '直播梗概', exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: '查看Moon River的歌切记录' }).count(), 1);
    assert.ok(errors.every(error => /503/.test(error)), `only deliberate failed-fetch errors: ${errors}`);
    const expectedErrors = errors.splice(0);
    // Verify the normal deployed index path too. It may still lack recap fields;
    // the saved summaries must make classification and links available now.
    await page.unroute('**/data/streams/**');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(url);
    const actual = page.locator(`[id="stream-${first.id}"]`);
    await sectionOrder(actual, ['直播梗概', '晚安回复', 'Highlight', '生成信息']);
    assert.equal(await actual.getByRole('link', { name: '查看Moon River的歌切记录' }).count(), 1);
    assert.match(await actual.getByRole('region', { name: '游戏', exact: true }).getByRole('link').getAttribute('href'), /BV1VzHh6YE3j/);
    await page.waitForFunction(streamId => {
      const image = document.getElementById(`stream-${streamId}`)?.querySelector('img');
      return image?.complete && image.naturalWidth > 0;
    }, first.id);
    await actual.scrollIntoViewIfNeeded();
    await capture('08-current-index-desktop');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, screenshots, errors, expectedErrors, warnings, structuredStreams: all.filter(stream => stream.recap).length }, null, 2));
    console.log(JSON.stringify({ passed: true, screenshots: screenshots.map(screenshot => screenshot.name), structuredStreams: all.filter(stream => stream.recap).length, errors, expectedErrors, warnings }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
