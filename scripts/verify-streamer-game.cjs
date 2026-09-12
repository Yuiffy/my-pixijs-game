const assert = require('node:assert/strict');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const base = process.env.STREAMER_BASE_URL || 'http://127.0.0.1:3847';
const output = process.env.STREAMER_QA_DIR || 'tmp/streamer-game-verify';
const screenshots = [];
const observed = [];
const errors = [];
mkdirSync(output, { recursive: true });

const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const control = (page, id) => page.getByTestId(id);
const advance = (page, ms) => page.evaluate(value => window.advanceTime(value), ms);
const phase = async (page, expected) => {
  await page.waitForFunction(value => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === value, expected);
  assert.equal((await state(page)).phase, expected);
};
const observe = page => {
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message, url: page.url() }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ type: 'console', message: message.text(), url: page.url() });
  });
};
const open = async page => {
  await page.goto(`${base}/game/streamer`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
};
const layout = async page => {
  const result = await page.evaluate(() => {
    const main = document.querySelector('main');
    const problems = [];
    if (!main || main.innerText.trim().length < 30) problems.push('Missing game content');
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('Horizontal page overflow');
    for (const element of document.querySelectorAll('main button, main select, main a')) {
      const rect = element.getBoundingClientRect();
      if (rect.width && rect.height && (rect.left < -1 || rect.right > innerWidth + 1)) {
        problems.push(`Offscreen control: ${element.getAttribute('data-testid') || element.textContent}`);
      }
    }
    for (const image of document.querySelectorAll('main img')) {
      if (!image.complete || !image.naturalWidth) problems.push(`Missing image: ${image.getAttribute('src')}`);
    }
    return {
      problems,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      text: main?.innerText.slice(0, 1400),
      canvases: [...document.querySelectorAll('canvas')].map(canvas => ({ width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight })),
    };
  });
  assert.deepEqual(result.problems, [], JSON.stringify(result));
  return result;
};
const capture = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => scrollTo(0, 0));
  const dom = await layout(page);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshots.push({ file, pixels, dom, state: await state(page) });
};
const runIdentity = value => ({
  phase: value.phase,
  seed: value.seed,
  completedTopics: value.completedTopics,
  activeTopic: value.activeTopic,
  beat: value.beat,
  fans: value.fans,
  energy: value.energy,
  trust: value.trust,
  risk: value.risk,
  actions: value.actions,
  perks: value.perks,
  resolvedBeats: value.resolvedBeats,
});

(async () => {
  const response = await fetch(`${base}/game/streamer`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'Start the target Next dev server before launching Chrome');
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  const content = await loadTypescriptModule('src/components/streamerGame/content.ts');
  const topics = content.TOPICS;
  assert.ok(Array.isArray(topics) && topics.length >= 12, 'The game must have enough topics for varied six-topic runs');
  const topicById = new Map(topics.map(topic => [topic.id, topic]));
  const notebook = topicById.get('laptop');
  assert.ok(notebook, 'The requested notebook travel scenario must exist');
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED });
  let passed = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    const page = await context.newPage();
    observe(page);
    await open(page);
    await phase(page, 'lobby');
    await capture(page, '01-lobby-desktop');
    const initialSkin = (await state(page)).skin;
    await control(page, 'change-look').click();
    const changedSkin = (await state(page)).skin;
    assert.notEqual(changedSkin, initialSkin);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text);
    assert.equal((await state(page)).skin, changedSkin, 'The selected SUI look must persist after reload');
    await capture(page, '07-twintail-desktop');
    await control(page, 'change-look').click();
    assert.equal((await state(page)).skin, initialSkin);
    await control(page, 'mode-cozy').click();
    await page.getByRole('textbox', { name: '同局种子', exact: true }).fill('20260912');
    await control(page, 'start-stream').click();
    await phase(page, 'topic');
    assert.equal((await state(page)).timed, false);
    assert.ok((await state(page)).topicOptions.includes(notebook.id), 'The first draft should include the notebook tutorial topic');

    const reply = async (target, preferred, style) => {
      const before = await state(target);
      assert.equal(before.phase, 'reply');
      const comments = topicById.get(before.activeTopic).beats[before.beat].comments;
      const index = comments.findIndex(comment => comment.kind === preferred);
      assert.ok(index >= 0, `Missing ${preferred} comment for ${before.activeTopic}/${before.beat}`);
      await control(target, `comment-${index}`).click();
      assert.equal((await state(target)).selectedComment, index);
      await control(target, `reply-${style}`).click();
      const after = await state(target);
      assert.equal(after.resolvedBeats, before.resolvedBeats + 1);
      assert.notEqual(after.phase, 'reply');
      return after;
    };
    const chooseReward = async target => {
      const before = await state(target);
      const priorities = ['empathetic', 'fact-check', 'soft-landing', 'encore', 'open-mic', 'slow-chat', 'thick-skin'];
      const selected = priorities.find(id => before.rewardOptions.includes(id)) || before.rewardOptions[0];
      assert.ok(selected, 'Reward phase must offer a usable perk');
      await control(target, `reward-${selected}`).click();
      const after = await state(target);
      assert.ok(after.perks.includes(selected));
      assert.equal(after.perks.length, before.perks.length + 1);
      return after;
    };

    await control(page, `topic-${notebook.id}`).click();
    await phase(page, 'reply');
    const opening = await state(page);
    await reply(page, 'support', 'agree');
    assert.ok((await state(page)).control > opening.control, 'Selecting affirmation must affect fan control');
    await control(page, 'continue-topic').click();
    await phase(page, 'reply');
    assert.equal((await state(page)).beat, 1);
    await reply(page, 'rational', 'explain');
    const beforeThailand = await state(page);
    await control(page, 'continue-topic').click();
    await phase(page, 'reply');
    const thailand = await state(page);
    assert.equal(thailand.beat, 2);
    assert.match(await page.locator('main').innerText(), /泰国/);
    assert.ok(thailand.risk > beforeThailand.risk, 'The Thailand reveal must visibly escalate risk');
    await control(page, `comment-${notebook.beats[2].comments.findIndex(comment => comment.kind === 'rational')}`).click();
    await capture(page, '02-thailand-reply-desktop');
    await reply(page, 'rational', 'explain');
    assert.equal((await state(page)).completedTopics, 1);

    await control(page, `topic-${(await state(page)).topicOptions[0]}`).click();
    const interrupted = await state(page);
    await control(page, 'action-sing').click();
    const singing = await state(page);
    assert.equal(singing.actions.sing, interrupted.actions.sing - 1);
    assert.equal(singing.interruptions, interrupted.interruptions + 1);
    assert.equal(singing.completedTopics, interrupted.completedTopics + 1);
    assert.notEqual(singing.phase, 'reply');
    if (singing.phase === 'reward') await chooseReward(page);
    await control(page, `topic-${(await state(page)).topicOptions[0]}`).click();
    await control(page, 'pause-stream').click();
    assert.equal((await state(page)).paused, true);
    const frozen = await state(page);
    await advance(page, 90000);
    assert.deepEqual(await state(page), frozen, 'Paused simulation must freeze completely');
    await control(page, 'resume-pause').click();
    assert.equal((await state(page)).paused, false);
    const saved = await state(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text);
    if ((await state(page)).phase === 'lobby') await control(page, 'resume-stream').click();
    if ((await state(page)).paused) await control(page, 'resume-pause').click();
    assert.deepEqual(runIdentity(await state(page)), runIdentity(saved), 'Reload must restore the same run');
    observed.push({ scenario: 'notebook-thailand-action-pause-resume', state: runIdentity(await state(page)) });

    for (let turns = 0; turns < 90 && (await state(page)).phase !== 'ended'; turns++) {
      const current = await state(page);
      if (current.phase === 'topic') {
        const selected = [...current.topicOptions].sort((a, b) => topicById.get(a).beats.reduce((sum, beat) => sum + beat.risk, 0) - topicById.get(b).beats.reduce((sum, beat) => sum + beat.risk, 0))[0];
        await control(page, `topic-${selected}`).click();
      } else if (current.phase === 'continue') {
        await control(page, 'continue-topic').click();
      } else if (current.phase === 'reply') {
        if (current.energy < 22 && current.actions.sing > 0) await control(page, 'action-sing').click();
        else await reply(page, current.beat === 0 && current.risk < 28 ? 'support' : 'rational', current.beat === 0 && current.risk < 28 ? 'agree' : 'explain');
      } else if (current.phase === 'reward') {
        if (!screenshots.some(item => item.file.endsWith('03-reward-desktop.png'))) await capture(page, '03-reward-desktop');
        await chooseReward(page);
      } else {
        assert.fail(`Unexpected campaign phase: ${current.phase}`);
      }
    }
    await phase(page, 'ended');
    const ending = await state(page);
    assert.equal(ending.completedTopics, 6, 'A thoughtful mixed strategy should finish all six topics');
    assert.ok(ending.score > 0);
    assert.ok(ending.ending);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('streamer-career-v1') || '{}').runs === 1);
    const career = await page.evaluate(() => JSON.parse(localStorage.getItem('streamer-career-v1')));
    assert.equal(career.best, ending.score);
    assert.ok(career.endings.includes(ending.ending));
    await capture(page, '04-ending-desktop');
    await control(page, 'share-result').click();
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(shared.includes(String(ending.score)), 'The copied scorecard must include the actual score');
    const pendingDownload = page.waitForEvent('download');
    await control(page, 'download-result').click();
    const download = await pendingDownload;
    const downloadedPath = path.join(output, 'scorecard.png');
    await download.saveAs(downloadedPath);
    const downloadedPixels = inspectPng(readFileSync(downloadedPath));
    screenshots.push({ file: downloadedPath, pixels: downloadedPixels, state: ending, artifact: 'downloaded scorecard' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.render_game_to_text);
    if ((await state(page)).phase === 'lobby') await control(page, 'resume-stream').click();
    assert.equal((await state(page)).ending, ending.ending);
    assert.equal((await state(page)).score, ending.score);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('streamer-career-v1')).runs), 1, 'Reopening the same result must not duplicate career progress');
    await control(page, 'restart-stream').click();
    await phase(page, 'topic');
    assert.equal((await state(page)).completedTopics, 0, 'Restart must provide a fresh playable run');
    await page.reload({ waitUntil: 'networkidle' });
    await phase(page, 'lobby');
    assert.equal(await control(page, 'start-stream').isEnabled(), true);
    await page.getByRole('combobox', { name: '开场天赋', exact: true }).selectOption('empathetic');
    observed.push({ scenario: 'six-topic-campaign-share-download-persistence', ending: ending.ending, score: ending.score, topics: ending.usedTopics, perks: ending.perks });

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const phone = await mobile.newPage(); observe(phone);
    await open(phone);
    await layout(phone);
    await control(phone, 'mode-cozy').tap();
    await control(phone, 'start-stream').tap();
    await control(phone, `topic-${(await state(phone)).topicOptions[0]}`).tap();
    await capture(phone, '05-reply-mobile-390');
    await reply(phone, 'rational', 'explain');
    await phone.setViewportSize({ width: 320, height: 740 });
    await control(phone, 'continue-topic').tap();
    await capture(phone, '06-reply-mobile-320');
    await reply(phone, 'support', 'agree');
    assert.equal((await state(phone)).resolvedBeats, 2);
    await mobile.close();

    await control(page, 'mode-timed').click();
    await control(page, 'start-stream').click();
    assert.equal((await state(page)).timed, true);
    assert.ok((await state(page)).perks.includes('empathetic'), 'A completed run must unlock a usable opening perk');
    await control(page, 'pause-stream').click();
    const timedPause = await state(page);
    await advance(page, 90000);
    assert.deepEqual(await state(page), timedPause, 'Pause must prevent cold-room penalties in timed mode');
    await control(page, 'resume-pause').click();
    const runningClock = await state(page);
    await advance(page, 1000);
    assert.ok((await state(page)).remainingMs < runningClock.remainingMs, 'Resuming must restart the decision clock');
    for (let lapse = 0; lapse < 30 && (await state(page)).phase !== 'ended'; lapse++) await advance(page, 60000);
    await phase(page, 'ended');
    const cold = await state(page);
    assert.ok(cold.silenceCount > 0);
    assert.ok(cold.completedTopics < 6);
    observed.push({ scenario: 'timed-cold-room-failure', ending: cold.ending, silenceCount: cold.silenceCount, viewers: cold.viewers });

    await page.getByRole('button', { name: '回到开播准备', exact: true }).click();
    await control(page, 'mode-cozy').click();
    await control(page, 'start-stream').click();
    await control(page, `topic-${(await state(page)).topicOptions[0]}`).click();
    const beforeModeration = await state(page);
    await control(page, 'action-moderate').click();
    const moderated = await state(page);
    assert.equal(moderated.actions.moderate, beforeModeration.actions.moderate - 1);
    assert.equal(moderated.phase, 'reply', 'Moderating abuse must still leave the underlying topic to answer');
    assert.equal(moderated.completedTopics, beforeModeration.completedTopics);
    assert.equal(await control(page, 'action-moderate').isEnabled(), false, 'The same beat must not consume repeated moderator cards');
    await reply(page, 'chaos', 'confront');
    assert.equal((await state(page)).confrontations, 1);
    for (const action of ['game', 'movie']) {
      const beforeAction = await state(page);
      await control(page, `action-${action}`).click();
      const afterAction = await state(page);
      assert.equal(afterAction.actions[action], beforeAction.actions[action] - 1);
      assert.equal(afterAction.interruptions, beforeAction.interruptions + 1);
      assert.equal(afterAction.completedTopics, beforeAction.completedTopics + 1);
      if (afterAction.phase === 'reward') await chooseReward(page);
      await control(page, `topic-${(await state(page)).topicOptions[0]}`).click();
    }
    observed.push({ scenario: 'moderator-boundary-confront-game-movie', state: runIdentity(await state(page)) });

    const blocked = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await blocked.addInitScript(() => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('streamer-')) throw new DOMException('QA storage unavailable', 'SecurityError');
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('streamer-')) throw new DOMException('QA storage unavailable', 'SecurityError');
        return set.call(this, key, value);
      };
    });
    const blockedPage = await blocked.newPage(); observe(blockedPage);
    await open(blockedPage);
    await control(blockedPage, 'mode-cozy').click();
    await control(blockedPage, 'start-stream').click();
    await control(blockedPage, `topic-${(await state(blockedPage)).topicOptions[0]}`).click();
    await reply(blockedPage, 'rational', 'explain');
    assert.equal((await state(blockedPage)).resolvedBeats, 1, 'Unavailable browser storage must not prevent play');
    assert.match(await blockedPage.locator('main').innerText(), /无法保存进度/);
    await layout(blockedPage);
    observed.push({ scenario: 'blocked-storage', phase: (await state(blockedPage)).phase });
    await blocked.close();
    assert.deepEqual(errors, []);
    passed = true;
  } finally {
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed, screenshots, observed, errors }, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ passed, screenshots: screenshots.map(item => item.file), observed, errors }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
