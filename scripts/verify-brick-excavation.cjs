const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const playwrightModule = process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', {
  paths: [process.cwd(), path.join(os.homedir(), '.codex', 'skills', 'develop-web-game')],
});
const { chromium } = require(playwrightModule);
const { inspectPng } = require('./lib/autochess-screenshot.cjs');

const url = process.env.BRICK_EXCAVATION_URL || 'http://127.0.0.1:3877/game/brick-excavation';
const output = path.resolve(process.env.BRICK_EXCAVATION_QA_DIR || 'tmp/brick-excavation-verify');
const screenshotEvidence = [];
const observations = [];
const errors = [];
const grid = page => page.locator('[role="group"][aria-label="彩色砖块矩阵"]');
const tile = (page, index) => grid(page).locator(':scope > *').nth(index);
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));

function neighbors(index, cols, length) {
  const result = [];
  if (index >= cols) result.push(index - cols);
  if (index + cols < length) result.push(index + cols);
  if (index % cols > 0) result.push(index - 1);
  if (index % cols < cols - 1 && index + 1 < length) result.push(index + 1);
  return result;
}

function cluster(board, index, cols) {
  if (board[index] === null) return [];
  const color = board[index];
  const found = [index];
  const seen = new Set(found);
  for (let cursor = 0; cursor < found.length; cursor += 1) {
    for (const neighbor of neighbors(found[cursor], cols, board.length)) {
      if (!seen.has(neighbor) && board[neighbor] === color) {
        seen.add(neighbor);
        found.push(neighbor);
      }
    }
  }
  return found;
}

function expectedStrike(before, index) {
  const cleared = cluster(before.board, index, before.cols);
  assert.ok(cleared.length > 0, `No live brick at ${index}`);
  const removed = new Set(cleared);
  const shifted = new Set();
  for (const cell of cleared) {
    for (const neighbor of neighbors(cell, before.cols, before.board.length)) {
      if (!removed.has(neighbor) && before.board[neighbor] !== null) shifted.add(neighbor);
    }
  }
  const board = before.board.slice();
  for (const cell of cleared) board[cell] = null;
  const colors = before.level === 'sui' ? 3 : 4;
  for (const cell of shifted) board[cell] = (board[cell] + 1) % colors;
  return {
    board,
    targets: before.remainingTargets - cleared.filter(cell => before.targetMask[cell]).length,
    movesLeft: before.movesLeft - (cleared.length >= 6 ? 0 : 1),
    shifted: [...shifted],
    cleared,
  };
}

function chooseGreedyMove(current) {
  const visited = new Set();
  let bestIndex = -1;
  let bestScore = -Infinity;
  for (let index = 0; index < current.board.length; index += 1) {
    if (current.board[index] === null || visited.has(index)) continue;
    const connected = cluster(current.board, index, current.cols);
    connected.forEach(cell => visited.add(cell));
    const targets = connected.filter(cell => current.targetMask[cell]).length;
    const score = targets * 10 + connected.length + (connected.length >= 6 ? 8 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  assert.ok(bestIndex >= 0, 'A playing board must contain a clickable brick');
  return bestIndex;
}

function observeErrors(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
}

async function open(page) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, `Game route failed: ${url}`);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function'
    && document.querySelector('[role="group"][aria-label="彩色砖块矩阵"]')?.children.length === 81);
  assert.equal(await page.getByRole('heading', { name: '维阿发掘局' }).count(), 1);
}

async function inspectBoard(page) {
  const current = await state(page);
  const visible = await grid(page).locator(':scope > *').evaluateAll(elements => elements.map(element => (
    element.tagName === 'BUTTON' ? Number(element.getAttribute('data-color')) : null
  )));
  assert.deepEqual(visible, current.board, 'The DOM colors must match render_game_to_text');
  const layout = await page.evaluate(() => {
    const board = document.querySelector('[role="group"][aria-label="彩色砖块矩阵"]');
    const boardRect = board.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('main button')];
    return {
      viewport: [innerWidth, innerHeight],
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      board: [boardRect.width, boardRect.height],
      clippedControls: buttons.filter(button => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map(button => button.getAttribute('aria-label') || button.textContent?.trim()),
    };
  });
  assert.ok(layout.document[0] <= layout.viewport[0] + 1, JSON.stringify(layout));
  assert.deepEqual(layout.clippedControls, [], JSON.stringify(layout));
  assert.ok(layout.board[0] >= 260 && Math.abs(layout.board[0] - layout.board[1]) <= 2,
    JSON.stringify(layout));
  return { current, layout };
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const { current, layout } = await inspectBoard(page);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshotEvidence.push({ name, file, pixels, layout, level: current.level,
    status: current.status, turns: current.turns, remainingTargets: current.remainingTargets });
}

async function hit(page, index, tap = false) {
  const before = await state(page);
  const expected = expectedStrike(before, index);
  assert.equal(await tile(page, index).evaluate(element => element.tagName), 'BUTTON');
  if (tap) await tile(page, index).tap();
  else await tile(page, index).click();
  const after = await state(page);
  assert.deepEqual(after.board, expected.board, `Wrong board transition at ${index}`);
  assert.equal(after.remainingTargets, expected.targets);
  assert.equal(after.movesLeft, expected.movesLeft);
  assert.equal(after.turns, before.turns + 1);
  return { before, after, expected };
}

async function solveLevel(page, number) {
  const started = await state(page);
  assert.equal(started.status, 'playing');
  for (let step = 0; step < 81; step += 1) {
    const current = await state(page);
    if (current.status !== 'playing') break;
    await hit(page, chooseGreedyMove(current));
  }
  const won = await state(page);
  assert.equal(won.status, 'won', `Greedy strategy did not finish stage ${number}`);
  assert.equal(won.remainingTargets, 0);
  await page.waitForFunction(id => {
    const records = JSON.parse(localStorage.getItem('brick-excavation-records-v1') || '{}');
    return Boolean(records[id]);
  }, won.level);
  observations.push({ stage: number, level: won.level, turns: won.turns,
    movesLeft: won.movesLeft, targetTotal: won.targetTotal });
  return won;
}

async function main() {
  mkdirSync(output, { recursive: true });
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `Dev server is not ready at ${url}`);
  assert.match(await response.text(), /维阿发掘局/, 'The responding server is not the expected game');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.HEADED !== '1',
    args: ['--mute-audio'],
  });
  try {
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await desktopContext.addInitScript(() => {
      try { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; } catch {}
    });
    const desktop = await desktopContext.newPage();
    observeErrors(desktop, 'desktop');
    await open(desktop);
    const initial = await state(desktop);
    assert.equal(initial.level, 'sui');
    assert.equal(initial.status, 'playing');
    await capture(desktop, 'desktop-initial');

    await desktop.getByRole('button', { name: '玩法规则' }).click();
    assert.ok(await desktop.getByText('敲一块砖，四向相连的同色砖一起落下。').isVisible());
    await desktop.getByRole('button', { name: '关闭规则' }).click();
    assert.equal(await desktop.getByText('发掘规则').count(), 0);

    const firstIndex = initial.board.findIndex((color, index) => color !== null
      && expectedStrike(initial, index).shifted.length > 0);
    assert.ok(firstIndex >= 0);
    const first = await hit(desktop, firstIndex);
    assert.ok(first.expected.shifted.some(index => first.before.board[index] !== first.after.board[index]),
      'A live neighboring brick must advance color');
    await capture(desktop, 'desktop-mid');
    await desktop.getByRole('button', { name: '撤销' }).click();
    assert.deepEqual((await state(desktop)).board, initial.board, 'Undo must restore every brick');
    assert.equal((await state(desktop)).turns, 0);

    await hit(desktop, firstIndex);
    await desktop.getByRole('button', { name: '重开' }).click();
    assert.deepEqual((await state(desktop)).board, initial.board, 'Restart must restore the seed');
    assert.equal((await state(desktop)).turns, 0);

    await tile(desktop, 0).focus();
    await desktop.keyboard.press('ArrowRight');
    assert.equal(await desktop.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      await tile(desktop, 1).getAttribute('aria-label'), 'ArrowRight must focus the next brick');
    const beforeKeyboard = await state(desktop);
    const expectedKeyboard = expectedStrike(beforeKeyboard, 1);
    await desktop.keyboard.press('Enter');
    assert.deepEqual((await state(desktop)).board, expectedKeyboard.board,
      'Enter must strike the focused brick');
    await desktop.getByRole('button', { name: '重开' }).click();

    for (let number = 1; number <= 3; number += 1) {
      const won = await solveLevel(desktop, number);
      assert.ok(await desktop.getByText('发掘成功').isVisible());
      assert.equal(await desktop.getByRole('button', { name: `档案 ${Math.min(number + 1, 3)}` }).count(), 1);
      if (number === 1) {
        await capture(desktop, 'desktop-win');
        assert.equal(await desktop.getByRole('button', { name: /档案 2/ }).isEnabled(), true,
          'Winning the first stage must unlock the second');
      }
      if (number < 3) {
        await desktop.getByRole('button', { name: '下一份档案' }).click();
        assert.equal((await state(desktop)).level, ['sui', 'shiori', 'yua'][number]);
        assert.equal((await state(desktop)).status, 'playing');
      } else {
        assert.equal(won.level, 'yua');
        await capture(desktop, 'desktop-final-win');
      }
    }

    const savedRecords = await desktop.evaluate(() => JSON.parse(
      localStorage.getItem('brick-excavation-records-v1'),
    ));
    assert.deepEqual(Object.keys(savedRecords).sort(), ['shiori', 'sui', 'yua']);
    await desktop.reload({ waitUntil: 'domcontentloaded' });
    await desktop.waitForFunction(() => typeof window.render_game_to_text === 'function');
    assert.deepEqual(await desktop.evaluate(() => JSON.parse(
      localStorage.getItem('brick-excavation-records-v1'),
    )), savedRecords);
    await desktop.waitForFunction(() => [...document.querySelectorAll('[aria-label^="档案 "]')]
      .filter(button => !button.disabled).length === 3);
    assert.equal(await desktop.getByRole('button', { name: /档案 3/ }).isEnabled(), true);

    const catalog = await desktop.goto(new URL('/demos', url).toString(), { waitUntil: 'domcontentloaded' });
    assert.equal(catalog?.status(), 200);
    const catalogEntry = desktop.locator('a[href="/game/brick-excavation"]');
    assert.equal(await catalogEntry.count(), 1, 'The game must have one catalog entry');
    assert.ok(await catalogEntry.isVisible());
    await catalogEntry.click();
    await desktop.waitForURL(url);
    await desktop.waitForFunction(() => typeof window.render_game_to_text === 'function');
    assert.equal((await state(desktop)).level, 'sui');
    assert.equal(await desktop.getByRole('button', { name: /档案 3/ }).isEnabled(), true);
    observations.push({ scenario: 'catalog-entry', href: '/game/brick-excavation' });

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    });
    await mobileContext.addInitScript(() => {
      try { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; } catch {}
    });
    const mobile = await mobileContext.newPage();
    observeErrors(mobile, 'mobile');
    await open(mobile);
    await capture(mobile, 'mobile-initial-390');
    const mobileHelpButton = mobile.getByRole('button', { name: '玩法规则' });
    await mobileHelpButton.tap();
    const rules = mobile.locator('#brick-rules');
    assert.ok(await rules.isVisible());
    const rulesViewport = await rules.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: innerWidth, height: innerHeight, focused: document.activeElement === element };
    });
    assert.ok(rulesViewport.left >= 0 && rulesViewport.top >= 0
      && rulesViewport.right <= rulesViewport.width
      && rulesViewport.bottom <= rulesViewport.height && rulesViewport.focused,
    `Mobile rules must be visible and focused: ${JSON.stringify(rulesViewport)}`);
    await capture(mobile, 'mobile-help-390');
    await mobile.getByRole('button', { name: '关闭规则' }).tap();
    assert.equal(await rules.count(), 0);
    assert.equal(await mobile.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      '玩法规则', 'The close button must restore focus to Help');
    await mobileHelpButton.tap();
    assert.ok(await rules.isVisible());
    await mobile.keyboard.press('Escape');
    assert.equal(await rules.count(), 0);
    assert.equal(await mobile.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      '玩法规则', 'Escape must restore focus to Help');
    await hit(mobile, chooseGreedyMove(await state(mobile)), true);
    await capture(mobile, 'mobile-mid-390');
    await mobile.setViewportSize({ width: 320, height: 740 });
    await capture(mobile, 'mobile-mid-320');
    await mobileContext.close();
    await desktopContext.close();

    assert.deepEqual(errors, [], 'Unexpected browser errors');
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({
      url, screenshots: screenshotEvidence, observations, records: savedRecords, errors,
    }, null, 2));
    console.log(JSON.stringify({ screenshots: screenshotEvidence.map(entry => entry.file),
      observations, errors }));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
