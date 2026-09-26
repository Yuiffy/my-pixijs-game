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
const screenshots = [];
const observations = [];
const errors = [];
const grid = page => page.locator('[role="group"][aria-label="彩色砖块矩阵"]');
const tile = (page, index) => grid(page).locator(':scope > *').nth(index);
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const colorNames = ['朱红', '青绿', '琥珀', '紫晶'];
const colorMarks = ['●', '◆', '▲', '✦'];

let createGame;
let getCluster;
let hasLegalMove;
let hasStrandedTreasure;
let canShuffleRemaining;
let shuffleRemaining;
let strike;

async function loadEngine() {
  const { loadTypescriptModule } = await import('./tests/helpers/load-typescript-module.mjs');
  ({ createGame, getCluster, hasLegalMove, hasStrandedTreasure,
    canShuffleRemaining, shuffleRemaining, strike } = await loadTypescriptModule(
    'src/components/brickExcavation/engine.ts',
  ));
}

function groups(model, minSize = 2) {
  const visited = new Set();
  const result = [];
  for (let index = 0; index < model.board.length; index += 1) {
    if (model.board[index] === null || visited.has(index)) continue;
    const cells = getCluster(model.board, index, model.cols);
    cells.forEach(cell => visited.add(cell));
    if (cells.length >= minSize) result.push({ index, cells });
  }
  return result;
}

async function assertSingletonBlocked(page, model) {
  const singleton = groups(model, 1).find(group => group.cells.length === 1);
  assert.ok(singleton, 'Expected a stranded single brick for the deadlock check');
  const target = tile(page, singleton.index);
  assert.equal(await target.evaluate(element => element.tagName), 'BUTTON');
  assert.equal(await target.isDisabled(), true,
    'A single brick must be visibly unavailable');
  const before = await state(page);
  await target.evaluate(element => element.click());
  assert.deepEqual(await state(page), before,
    'Clicking a stranded brick must not consume a hammer or change the board');
  assert.equal(strike(model, singleton.index), model,
    'The engine must reject a single-brick strike');
  observations.push({ scenario: 'single-brick-deadlock', index: singleton.index,
    turns: model.turns, movesLeft: model.movesLeft });
}

function chooseFirstDiscovery(model) {
  const candidates = groups(model).map(group => ({
    ...group,
    hits: model.treasures.map(treasure => group.cells
      .filter(cell => treasure.indices.includes(cell)).length),
  })).filter(group => group.hits.filter(Boolean).length === 1
    && group.hits.every((count, index) => count < model.treasures[index].total));
  assert.ok(candidates.length, 'Opening board needs a move that partially discovers one item');
  return candidates[0].index;
}

function chooseKnownMove(model) {
  const candidates = groups(model).map(({ index }) => ({
    index,
    next: strike(model, index),
  }));
  return candidates.length ? candidates.map(({ index, next }) => ({
    index,
    score: next.treasures.filter(treasure => treasure.found).length * 1000
      + next.treasures.reduce((sum, treasure) => sum + treasure.revealed * 15, 0)
      + next.movesLeft * 2 + next.score * 0.1
      - (next.status === 'lost' ? 300 : 0),
  })).reduce((best, move) => move.score > best.score ? move : best).index : null;
}

function chooseLossMove(model) {
  const candidates = groups(model).map(({ index, cells }) => {
    const hits = model.treasures.reduce((count, treasure) => count
      + cells.filter(cell => treasure.indices.includes(cell)).length, 0);
    return { index, cost: (cells.length >= 6 ? 1000 : 0) + hits * 100 + cells.length };
  });
  return candidates.length ? candidates.reduce((best, move) => move.cost < best.cost ? move : best).index : null;
}

function findStrandedRoute(seed, attempts = 200) {
  for (let run = 0; run < attempts; run += 1) {
    let model = createGame(seed);
    let randomState = (seed + 1) * 331 + run + 1;
    const route = [];
    while (model.status === 'playing') {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      const choices = groups(model);
      if (choices.length === 0) break;
      const index = choices[randomState % choices.length].index;
      route.push(index);
      model = strike(model, index);
    }
    if (model.status === 'lost' && model.movesLeft > 0
      && hasStrandedTreasure(model)) return route;
  }
  return null;
}

function assertPublicState(actual, model) {
  assert.equal(actual.seed, model.seed);
  assert.equal(actual.cols, model.cols);
  assert.equal(actual.rows, model.rows);
  assert.equal(actual.colors, model.colors);
  assert.deepEqual(actual.board, model.board);
  assert.equal(actual.status, model.status);
  assert.equal(actual.movesLeft, model.movesLeft);
  assert.equal(actual.maxMoves, model.maxMoves);
  assert.equal(actual.shufflesLeft, model.shufflesLeft);
  assert.equal(actual.maxShuffles, model.maxShuffles);
  assert.equal(actual.hasLegalMove, hasLegalMove(model.board, model.cols));
  assert.equal(actual.canShuffle, canShuffleRemaining(model));
  assert.equal(actual.turns, model.turns);
  assert.equal(actual.score, model.score);
  assert.equal(actual.treasureTotal, model.treasures.length);
  assert.equal(actual.foundCount, model.treasures.filter(treasure => treasure.found).length);

  const discovered = model.treasures.filter(treasure => treasure.revealed > 0);
  assert.deepEqual(actual.treasures, discovered.map(treasure => ({
    id: treasure.found ? treasure.id : null,
    name: treasure.found ? treasure.name : null,
    revealed: treasure.revealed,
    total: treasure.total,
    found: treasure.found,
    points: treasure.found ? treasure.points : null,
  })), 'Only discovered items should be public, and identities stay hidden until extraction');
  for (const item of actual.treasures) {
    for (const field of ['x', 'y', 'width', 'height', 'indices', 'mask', 'portrait']) {
      assert.equal(field in item, false, 'Public treasure leaked ' + field);
    }
  }
  const serialized = JSON.stringify(actual);
  for (const hidden of model.treasures.filter(treasure => !treasure.found)) {
    assert.equal(serialized.includes('"' + hidden.id + '"'), false,
      'Unextracted identity leaked: ' + hidden.id);
    assert.equal(serialized.includes('"' + hidden.name + '"'), false,
      'Unextracted name leaked: ' + hidden.name);
  }

  if (model.lastMove) {
    assert.ok(actual.lastMove, 'Last move is missing from render_game_to_text');
    assert.equal(actual.lastMove.discoveredCount, model.lastMove.discoveredIds.length);
    assert.deepEqual(actual.lastMove.foundIds, model.lastMove.foundIds);
    assert.equal(actual.lastMove.scoreGained, model.lastMove.scoreGained);
    assert.equal(actual.lastMove.hitTargets, model.lastMove.hitTargets);
    assert.equal('discoveredIds' in actual.lastMove, false,
      'Unextracted IDs must not be exposed in the last move');
  } else {
    assert.equal(actual.lastMove, null);
  }
}

function observeErrors(page, label) {
  page.on('pageerror', error => errors.push(label + ': ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(label + ': ' + message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      errors.push(label + ': HTTP ' + response.status() + ' ' + response.url());
    }
  });
}

async function open(page, seed = 0) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, 'Game route failed: ' + url);
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function'
    && document.querySelector('[role="group"][aria-label="彩色砖块矩阵"]')?.children.length === 100);
  assert.equal(await page.getByRole('heading', { name: '维阿发掘局' }).count(), 1);
  const model = createGame(seed);
  assertPublicState(await state(page), model);
  assert.equal(await page.locator('[data-treasure-cell]').count(), 0,
    'Hidden treasure art must not mount before a discovery');
  return model;
}

async function inspectTreasureArt(page, model) {
  const discovered = model.treasures.filter(treasure => treasure.revealed > 0);
  const illustrations = page.locator('[data-treasure-illustration]');
  assert.equal(await illustrations.count(), discovered.length,
    'Every discovered treasure needs one complete illustration');
  const expectedIndices = discovered.flatMap(treasure => treasure.indices).sort((a, b) => a - b);
  const actualIndices = (await page.locator('[data-treasure-cell]').evaluateAll(elements =>
    elements.map(element => Number(element.getAttribute('data-index'))))).sort((a, b) => a - b);
  assert.deepEqual(actualIndices, expectedIndices,
    'Only occupied shape cells of discovered treasures should have backing tiles');
  const imageUrls = await illustrations.evaluateAll(elements => elements.map(element =>
    getComputedStyle(element).backgroundImage));
  for (const treasure of discovered) {
    assert.ok(imageUrls.some(url => url.includes(treasure.portrait)),
      `Complete artwork is missing for ${treasure.id}`);
  }
  for (const treasure of discovered) {
    const footprint = Array.from({ length: treasure.width * treasure.height }, (_, offset) =>
      (treasure.y + Math.floor(offset / treasure.width)) * model.cols
        + treasure.x + (offset % treasure.width));
    for (const hole of footprint.filter(index => !treasure.indices.includes(index))) {
      assert.equal(actualIndices.includes(hole), false,
        `Transparent shape hole ${hole} must not show treasure art`);
    }
  }
}

async function inspectColorLegend(page, model) {
  const legend = page.locator('[aria-label="颜色变化顺序"]');
  assert.equal(await legend.count(), 1, 'The color cycle must be visible beside the board');
  assert.equal(await legend.isVisible(), true);
  const content = (await legend.innerText()).replace(/\s+/g, '');
  let at = -1;
  for (const name of [...colorNames.slice(0, model.colors), colorNames[0]]) {
    at = content.indexOf(name, at + 1);
    assert.ok(at >= 0, 'Color legend has the wrong cycle: ' + content);
  }
  const swatches = await legend.locator('[data-color]').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewportWidth: innerWidth };
  }));
  assert.equal(swatches.length, model.colors + 1);
  assert.ok(swatches.every((swatch, index) => swatch.left >= 0
    && swatch.right <= swatch.viewportWidth + 1
    && (index === 0 || swatch.left >= swatches[index - 1].right - 1)),
  'The color cycle must fit and remain ordered in the viewport: ' + JSON.stringify(swatches));
}

async function assertHoverPreview(page, model, index) {
  const expected = strike(model, index);
  assert.notEqual(expected, model, 'Preview requires a legal group');
  await tile(page, index).hover();
  await page.waitForFunction(({ cleared, shifted }) => {
    const cells = [...document.querySelector('[aria-label="彩色砖块矩阵"]').children];
    return cleared.every(cell => cells[cell].dataset.preview === 'group')
      && shifted.every(cell => cells[cell].dataset.preview === 'edge'
        && cells[cell].dataset.previewColor !== undefined);
  }, { cleared: expected.lastMove.cleared, shifted: expected.lastMove.shifted });
  const preview = await grid(page).locator(':scope > *').evaluateAll(elements => elements.map(element => ({
    color: element.getAttribute('data-color'),
    kind: element.getAttribute('data-preview'),
    next: element.getAttribute('data-preview-color'),
  })));
  for (const cell of expected.lastMove.cleared) {
    assert.equal(preview[cell].kind, 'group');
    assert.equal(preview[cell].next, null);
  }
  for (const cell of expected.lastMove.shifted) {
    assert.equal(preview[cell].kind, 'edge');
    assert.equal(Number(preview[cell].color), model.board[cell],
      'Hover must not prematurely alter the real brick color');
    assert.equal(Number(preview[cell].next), (model.board[cell] + 1) % model.colors,
      'The edge preview must show exactly one color advance');
    const marker = tile(page, cell).locator('[aria-hidden="true"][data-color]');
    assert.equal(await marker.count(), 1, `Edge brick ${cell} is missing its next-color marker`);
    assert.equal((await marker.innerText()).trim(), colorMarks[(model.board[cell] + 1) % model.colors]);
    assert.equal(await marker.isVisible(), true);
  }
  assertPublicState(await state(page), model);
  observations.push({ scenario: 'hover-color-preview', index,
    group: expected.lastMove.cleared.length, edge: expected.lastMove.shifted.length });
}

async function inspectBoard(page, model) {
  const current = await state(page);
  assertPublicState(current, model);
  await inspectTreasureArt(page, model);
  await inspectColorLegend(page, model);
  const visible = await grid(page).locator(':scope > *').evaluateAll(elements => elements.map(element => (
    element.tagName === 'BUTTON' ? Number(element.getAttribute('data-color')) : null
  )));
  assert.deepEqual(visible, model.board, 'DOM colors do not match render_game_to_text');
  const blocked = await grid(page).locator(':scope > *').evaluateAll(elements => elements.map(element =>
    element.tagName === 'BUTTON' ? element.disabled : null));
  for (const group of groups(model, 1)) {
    for (const cell of group.cells) {
      assert.equal(blocked[cell], model.status !== 'playing' || group.cells.length === 1,
        `Brick ${cell} has the wrong disabled state`);
    }
  }
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

async function capture(page, name, model) {
  await page.evaluate(() => document.fonts.ready);
  const { current, layout } = await inspectBoard(page, model);
  const file = path.join(output, name + '.png');
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }));
  screenshots.push({ name, file, pixels, layout, seed: current.seed,
    status: current.status, turns: current.turns, score: current.score,
    foundCount: current.foundCount });
}

async function hit(page, model, index, tap = false) {
  const next = strike(model, index);
  assert.notEqual(next, model, 'Invalid strike at ' + index);
  assert.equal(await tile(page, index).evaluate(element => element.tagName), 'BUTTON');
  if (tap) await tile(page, index).tap();
  else await tile(page, index).click();
  await page.waitForFunction(turns => JSON.parse(window.render_game_to_text()).turns === turns,
    next.turns);
  assertPublicState(await state(page), next);
  const bonus = next.lastMove.foundIds.reduce((sum, id) => sum
    + next.treasures.find(treasure => treasure.id === id).points, 0);
  assert.equal(next.score - model.score, next.lastMove.cleared.length * 5 + bonus,
    'Each brick scores five points; each completed item scores once');
  return next;
}

async function undo(page, expected) {
  await page.getByRole('button', { name: '撤销' }).click();
  await page.waitForFunction(({ board, shufflesLeft, turns }) => {
    const current = JSON.parse(window.render_game_to_text());
    return current.turns === turns && current.shufflesLeft === shufflesLeft
      && JSON.stringify(current.board) === JSON.stringify(board);
  }, { board: expected.board, shufflesLeft: expected.shufflesLeft, turns: expected.turns });
  assertPublicState(await state(page), expected);
}

async function shuffleBoard(page, model, tap = false) {
  const next = shuffleRemaining(model);
  assert.notEqual(next, model, 'The current board cannot be shuffled');
  const button = page.locator('[data-shuffle]');
  if (tap) await button.tap();
  else await button.click();
  await page.waitForFunction(value => JSON.parse(window.render_game_to_text()).shufflesLeft === value,
    next.shufflesLeft);
  assertPublicState(await state(page), next);
  assert.equal(next.movesLeft, model.movesLeft, 'Shuffle must not consume a hammer');
  assert.equal(next.score, model.score, 'Shuffle must not change the score');
  assert.equal(next.turns, model.turns, 'Shuffle is not a strike');
  assert.deepEqual(next.board.map((color, index) => color === null),
    model.board.map((color, index) => color === null), 'Shuffle must preserve empty cells');
  return next;
}

async function restart(page, seed) {
  const model = createGame(seed);
  await page.getByRole('button', { name: /重开/ }).click();
  await page.waitForFunction(({ board, shufflesLeft }) => {
    const current = JSON.parse(window.render_game_to_text());
    return current.turns === 0 && current.shufflesLeft === shufflesLeft
      && JSON.stringify(current.board) === JSON.stringify(board);
  }, { board: model.board, shufflesLeft: model.shufflesLeft });
  assertPublicState(await state(page), model);
  return model;
}

async function checkRules(page, tap = false) {
  const help = page.getByRole('button', { name: '玩法规则' });
  if (tap) await help.tap();
  else await help.click();
  const rules = page.locator('#brick-rules');
  await rules.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'brick-rules');
  const placement = await rules.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      focused: document.activeElement === element };
  });
  assert.ok(placement.left >= 0 && placement.top >= 0
    && placement.right <= placement.viewportWidth
    && placement.bottom <= placement.viewportHeight && placement.focused,
  'Rules must open in the viewport with focus: ' + JSON.stringify(placement));
  assert.equal(await help.getAttribute('aria-expanded'), 'true');
  return rules;
}

async function closeRules(page, viaEscape = false) {
  if (viaEscape) await page.keyboard.press('Escape');
  else await page.locator('#brick-rules').getByRole('button', { name: '关闭规则' }).click();
  await page.locator('#brick-rules').waitFor({ state: 'detached' });
  const help = page.getByRole('button', { name: '玩法规则' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '玩法规则');
  assert.equal(await help.getAttribute('aria-expanded'), 'false');
  assert.equal(await help.evaluate(element => document.activeElement === element), true,
    'Closing the rules must restore focus to Help');
}

async function main() {
  await loadEngine();
  mkdirSync(output, { recursive: true });
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, 'Dev server is not ready at ' + url);
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
    let model = await open(desktop);
    assert.ok(model.treasures.some(treasure => treasure.total < treasure.width * treasure.height),
      'At least one buried item must have an irregular outline');
    assert.ok(new Set(model.treasures.map(treasure => treasure.mask.join('/'))).size >= 2,
      'Treasure shapes should vary within one map');
    await capture(desktop, 'desktop-initial', model);
    await checkRules(desktop);
    await closeRules(desktop);
    await assertSingletonBlocked(desktop, model);
    await assertHoverPreview(desktop, model, chooseFirstDiscovery(model));
    await capture(desktop, 'desktop-hover-preview', model);
    await desktop.mouse.move(0, 0);

    const opening = chooseFirstDiscovery(model);
    model = await hit(desktop, model, opening);
    assert.equal(model.lastMove.discoveredIds.length, 1);
    assert.equal(model.lastMove.foundIds.length, 0);
    assert.equal((await state(desktop)).treasures.length, 1);
    await capture(desktop, 'desktop-discovery', model);
    observations.push({ scenario: 'first-discovery', itemRevealed: model.treasures
      .find(treasure => treasure.revealed > 0).revealed, score: model.score });

    const foundEvents = [];
    let extractionUndoChecked = false;
    for (let step = 0; model.status === 'playing' && step < 100; step += 1) {
      const before = model;
      const index = chooseKnownMove(model);
      assert.notEqual(index, null, 'A playing board needs a legal two-brick group');
      model = await hit(desktop, model, index);
      if (model.lastMove.foundIds.length) {
        foundEvents.push({ turn: model.turns, ids: model.lastMove.foundIds,
          scoreGained: model.lastMove.scoreGained });
        for (const id of model.lastMove.foundIds) {
          const name = model.treasures.find(treasure => treasure.id === id).name;
          assert.ok((await desktop.locator('body').innerText()).includes(name),
            'Extracted item must be named on screen: ' + name);
        }
        if (!extractionUndoChecked) {
          await capture(desktop, 'desktop-first-extraction', model);
          const foundState = model;
          await undo(desktop, before);
          assert.equal((await state(desktop)).score, before.score,
            'Undo across extraction must remove the item bonus');
          model = await hit(desktop, before, index);
          assertPublicState(await state(desktop), foundState);
          extractionUndoChecked = true;
        }
      }
    }
    assert.equal(extractionUndoChecked, true);
    assert.ok(foundEvents.length >= 2, 'Items should score as independent discoveries');
    assert.deepEqual(foundEvents.flatMap(event => event.ids).sort(),
      model.treasures.map(treasure => treasure.id).sort(),
      'Each extracted item must score exactly once');
    assert.equal(model.status, 'won', 'Seed zero should remain winnable with planned moves');
    await capture(desktop, 'desktop-win', model);
    observations.push({ scenario: 'win', seed: model.seed, score: model.score,
      turns: model.turns, foundEvents });

    model = await restart(desktop, 0);
    assert.equal((await state(desktop)).treasures.length, 0,
      'Restart must hide previously discovered positions');
    await tile(desktop, 0).focus();
    await desktop.keyboard.press('ArrowRight');
    const nextKeyboardIndex = groups(model, 1)
      .filter(group => group.cells.length >= 2)
      .flatMap(group => group.cells)
      .filter(index => index > 0 && index < model.cols)
      .sort((a, b) => a - b)[0];
    assert.ok(nextKeyboardIndex, 'Top row needs a second playable brick');
    assert.equal(await desktop.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      await tile(desktop, nextKeyboardIndex).getAttribute('aria-label'),
      'ArrowRight must skip stranded bricks');
    const keyboardExpected = strike(model, nextKeyboardIndex);
    await desktop.keyboard.press('Enter');
    await desktop.waitForFunction(turns => JSON.parse(window.render_game_to_text()).turns === turns,
      keyboardExpected.turns);
    assertPublicState(await state(desktop), keyboardExpected);
    model = await restart(desktop, 0);

    await desktop.getByRole('button', { name: '新地图' }).click();
    await desktop.waitForFunction(seed => JSON.parse(window.render_game_to_text()).seed === seed, 1);
    model = createGame(1);
    assertPublicState(await state(desktop), model);
    assert.notDeepEqual(model.board, createGame(0).board);
    await capture(desktop, 'desktop-new-map', model);
    observations.push({ scenario: 'new-map', seed: model.seed, treasureTotal: model.treasures.length });
    const beforeShuffle = model;
    model = await shuffleBoard(desktop, model);
    assert.equal(await desktop.locator('[data-shuffle]').isEnabled(), true);
    await capture(desktop, 'desktop-shuffled', model);
    await undo(desktop, beforeShuffle);
    model = beforeShuffle;
    assert.equal(await desktop.locator('[data-shuffle]').isEnabled(), true,
      'Undo must return the shuffle charge');
    model = await shuffleBoard(desktop, model);
    model = await shuffleBoard(desktop, model);
    assert.equal(await desktop.locator('[data-shuffle]').isDisabled(), true,
      'Only two shuffles are available per map');
    await capture(desktop, 'desktop-shuffles-exhausted', model);
    observations.push({ scenario: 'limited-shuffle', seed: model.seed,
      shufflesLeft: model.shufflesLeft, movesLeft: model.movesLeft });
    model = await restart(desktop, 1);
    assert.equal(model.shufflesLeft, model.maxShuffles);
    for (let step = 0; model.status === 'playing' && step < 100; step += 1) {
      const largest = groups(model).reduce((best, group) =>
        !best || group.cells.length > best.cells.length ? group : best, null);
      assert.ok(largest, 'The reference route needs a legal pair');
      model = await hit(desktop, model, largest.index);
    }
    assert.equal(model.status, 'won', 'The five-treasure map should have a complete route');
    assert.equal(model.treasures.length, 5);
    await capture(desktop, 'desktop-five-treasures-win', model);
    await desktopContext.close();

    const lossContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const lossPage = await lossContext.newPage();
    observeErrors(lossPage, 'loss');
    let lossModel = await open(lossPage);
    let beforeLoss;
    let lastIndex;
    for (let step = 0; lossModel.status === 'playing' && step < 100; step += 1) {
      beforeLoss = lossModel;
      lastIndex = chooseLossMove(lossModel);
      if (lastIndex === null) {
        assert.equal(canShuffleRemaining(lossModel), true,
          'A board without a pair should permit a remaining shuffle');
        lossModel = await shuffleBoard(lossPage, lossModel);
        continue;
      }
      lossModel = await hit(lossPage, lossModel, lastIndex);
    }
    assert.equal(lossModel.status, 'lost', 'A low-value route should end without all items');
    assert.ok(lossModel.movesLeft === 0 || hasStrandedTreasure(lossModel)
      || (!hasLegalMove(lossModel.board, lossModel.cols) && lossModel.shufflesLeft === 0),
    'A loss must come from exhausted resources or a stranded treasure');
    assert.ok(lossModel.treasures.some(treasure => !treasure.found));
    const lossReason = lossModel.movesLeft === 0 ? 'hammers'
      : hasStrandedTreasure(lossModel) ? 'stranded' : 'shuffles';
    await capture(lossPage, 'desktop-loss', lossModel);
    await undo(lossPage, beforeLoss);
    assert.equal((await state(lossPage)).status, 'playing');
    lossModel = await hit(lossPage, beforeLoss, lastIndex);
    assert.equal(lossModel.status, 'lost');
    lossModel = await restart(lossPage, 0);
    assert.equal(lossModel.score, 0);
    observations.push({ scenario: 'loss-route', turns: beforeLoss.turns + 1,
      reason: lossReason });

    const deadlockRoute = findStrandedRoute(0);
    assert.ok(deadlockRoute, 'The map should permit a stranded-treasure loss');
    let beforeDeadlock;
    let lastDeadlockIndex;
    for (const index of deadlockRoute) {
      beforeDeadlock = lossModel;
      lastDeadlockIndex = index;
      lossModel = await hit(lossPage, lossModel, index);
    }
    assert.equal(lossModel.status, 'lost');
    assert.ok(lossModel.movesLeft > 0, 'Deadlock should end before the hammers run out');
    assert.equal(hasStrandedTreasure(lossModel), true,
      'A geometrically isolated treasure cannot be rescued by recoloring');
    assert.equal(await lossPage.locator('[data-shuffle]').isDisabled(), true);
    assert.ok((await lossPage.locator('body').innerText()).includes('宝物砖已孤立'));
    await capture(lossPage, 'desktop-deadlock', lossModel);
    await undo(lossPage, beforeDeadlock);
    lossModel = await hit(lossPage, beforeDeadlock, lastDeadlockIndex);
    assert.equal(lossModel.status, 'lost');
    observations.push({ scenario: 'stranded-treasure', turns: lossModel.turns,
      movesLeft: lossModel.movesLeft, remainingBricks: lossModel.board.filter(color => color !== null).length });
    await lossContext.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
    });
    await mobileContext.addInitScript(() => {
      try { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; } catch {}
    });
    const mobile = await mobileContext.newPage();
    observeErrors(mobile, 'mobile');
    let mobileModel = await open(mobile);
    await capture(mobile, 'mobile-initial-390', mobileModel);
    await checkRules(mobile, true);
    await capture(mobile, 'mobile-help-390', mobileModel);
    await closeRules(mobile);
    await checkRules(mobile, true);
    await closeRules(mobile, true);
    mobileModel = await hit(mobile, mobileModel, chooseFirstDiscovery(mobileModel), true);
    await capture(mobile, 'mobile-discovery-390', mobileModel);
    await mobile.setViewportSize({ width: 320, height: 740 });
    await capture(mobile, 'mobile-discovery-320', mobileModel);
    await checkRules(mobile, true);
    await capture(mobile, 'mobile-help-320', mobileModel);
    await closeRules(mobile);
    mobileModel = await hit(mobile, mobileModel, chooseKnownMove(mobileModel), true);
    await capture(mobile, 'mobile-after-tap-320', mobileModel);
    mobileModel = await shuffleBoard(mobile, mobileModel, true);
    await capture(mobile, 'mobile-shuffled-320', mobileModel);
    observations.push({ scenario: 'mobile-touch', turns: mobileModel.turns,
      score: mobileModel.score, shufflesLeft: mobileModel.shufflesLeft });
    await mobileContext.close();

    assert.deepEqual(errors, [], 'Unexpected browser or asset errors');
    writeFileSync(path.join(output, 'report.json'), JSON.stringify({
      url, screenshots, observations, errors,
    }, null, 2));
    console.log(JSON.stringify({ screenshots: screenshots.map(entry => entry.file),
      observations, errors }));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
