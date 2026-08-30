const assert = require("node:assert/strict");
const { existsSync, mkdirSync, mkdtempSync, rmSync } = require("node:fs");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const { version: expectedVersion } = require("../package.json");

const localRequire = createRequire(__filename);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
  "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
].filter(Boolean);

const loadPlaywright = () => {
  for (const candidate of playwrightCandidates) {
    try {
      if ((candidate.includes("/") || candidate.includes("\\")) && !existsSync(candidate)) continue;
      return localRequire(candidate);
    } catch {
      // Try the next known installation.
    }
  }
  throw new Error("Unable to load playwright; install it or set PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = `.tmp/autochess/auto-arrange-v${expectedVersion}`;
const expectedSlots = [4, 9, 10, 11, 15, 16, 17, 23];
mkdirSync(artifactDirectory, { recursive: true });

let browserContext = null;
let browserProfile = null;

const closeBrowser = async () => {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
  }
  if (browserProfile) {
    try {
      rmSync(browserProfile, { recursive: true, force: true });
    } catch {
      // Chrome can briefly retain a profile lock after shutdown.
    }
    browserProfile = null;
  }
};

const rosterKey = (entries) => entries
  .map(({ uid, id, star }) => `${uid}:${id}:${star}`)
  .sort();

const assertArranged = (before, after, label) => {
  assert.equal(after.textState.version, expectedVersion, `${label}: stale game version`);
  assert.deepEqual(rosterKey(after.board), rosterKey(before.board), `${label}: board roster changed`);
  assert.deepEqual(rosterKey(after.bench), rosterKey(before.bench), `${label}: bench roster changed`);
  assert.deepEqual(after.bench, before.bench, `${label}: bench slots changed`);
  assert.deepEqual(after.board.map(({ index }) => index).sort((a, b) => a - b), expectedSlots);
  assert.deepEqual(
    after.textState.board.map(({ index }) => index).sort((a, b) => a - b),
    expectedSlots,
    `${label}: text state is out of sync`,
  );
  assert.equal(after.board.find(({ id }) => id === "rei")?.index, 23, `${label}: Rei anchor moved`);
  assert.ok(after.textState.availableActions.includes("A 推荐站位（只整理场上单位）"));
};

(async () => {
  browserProfile = mkdtempSync(join(tmpdir(), "autochess-auto-arrange-"));
  browserContext = await chromium.launchPersistentContext(browserProfile, {
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
    viewport: { width: 1440, height: 900 },
  });
  const page = browserContext.pages()[0] || await browserContext.newPage();
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=6060`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(
    window.autoChessAI?.bridge
      && typeof window.render_game_to_text === "function"
      && typeof window.advanceTime === "function",
  ), { timeout: 60_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-game-canvas="rift-line"]');
    const rect = element?.getBoundingClientRect();
    return Boolean(element && rect && rect.width > 0 && rect.height > 0 && element.width > 0 && element.height > 0);
  }, { timeout: 60_000 });

  const screenshots = {};
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = inspectPng(buffer);
  };
  const snapshot = () => page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const { state } = bridge.engine;
    const summarize = (unit, index) => unit && ({ index, uid: unit.uid, id: unit.id, star: unit.star });
    return {
      board: state.board.map(summarize).filter(Boolean),
      bench: state.bench.map(summarize).filter(Boolean),
      selected: state.selected,
      selectedUid: state.selected
        ? (state.selected.zone === "board"
          ? state.board[state.selected.index]?.uid
          : state.bench[state.selected.index]?.uid)
        : null,
      toast: state.toast,
      textState: JSON.parse(window.render_game_to_text()),
    };
  });
  const scramble = (slots) => page.evaluate((nextSlots) => {
    const bridge = window.autoChessAI.bridge;
    const { state } = bridge.engine;
    const units = state.board.filter(Boolean).sort((left, right) => left.uid - right.uid);
    state.board.fill(null);
    units.forEach((unit, index) => { state.board[nextSlots[index]] = unit; });
    state.selected = null;
    bridge.dispatch({ type: "clearSelection" });
  }, slots);

  const setup = await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const engine = bridge.engine;
    engine.resetToTitle();
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.playerLevel = 10;
    engine.state.gold = 180;
    engine.state.board.fill(null);
    engine.state.bench.fill(null);
    const units = [
      { uid: 60601, id: "rei", star: 2 },
      { uid: 60602, id: "mossback", star: 1 },
      { uid: 60603, id: "youyi", star: 2 },
      { uid: 60604, id: "spark_mage", star: 1 },
      { uid: 60605, id: "spark_mage", star: 1 },
      { uid: 60606, id: "yua", star: 3 },
      { uid: 60607, id: "tiandou", star: 2 },
      { uid: 60608, id: "sui_blue", star: 3 },
    ];
    const slots = [0, 2, 6, 7, 12, 13, 18, 20];
    units.forEach((unit, index) => { engine.state.board[slots[index]] = unit; });
    engine.state.bench[0] = { uid: 60701, id: "lian", star: 3 };
    engine.state.bench[5] = { uid: 60702, id: "sui", star: 1 };
    bridge.dispatch({ type: "slot", location: { zone: "board", index: 7 } });
    return JSON.parse(window.render_game_to_text());
  });
  assert.equal(setup.phase, "preparation");
  assert.equal(setup.player.boardCount, 8);
  assert.ok(setup.availableActions.includes("A 推荐站位（只整理场上单位）"));

  const desktopLayout = await page.evaluate(() => {
    const panel = document.querySelector(".rift-dom-shop-desktop");
    const footer = panel?.querySelector("footer");
    const actions = panel ? [...panel.querySelectorAll(".rift-dom-shop-actions button")] : [];
    const panelRect = panel?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      panelBottom: panelRect?.bottom,
      footerBottom: footerRect?.bottom,
      viewportHeight: window.innerHeight,
      actionCount: actions.length,
      actionsFit: actions.every((button) => button.scrollWidth <= button.clientWidth + 1),
    };
  });
  assert.equal(desktopLayout.actionCount, 5);
  assert.equal(desktopLayout.actionsFit, true);
  assert.ok(desktopLayout.panelBottom <= desktopLayout.viewportHeight + 1, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.footerBottom <= desktopLayout.viewportHeight + 1, JSON.stringify(desktopLayout));

  const desktopBefore = await snapshot();
  assert.equal(desktopBefore.selectedUid, 60604);
  await capture("auto-arrange-desktop-before");
  const desktopButton = page.locator(".rift-dom-shop-desktop").getByRole("button", { name: "推荐站位" });
  await desktopButton.click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).toast?.includes("推荐站位已完成"));
  const desktopAfter = await snapshot();
  assertArranged(desktopBefore, desktopAfter, "desktop button");
  assert.equal(desktopAfter.selectedUid, desktopBefore.selectedUid);
  assert.match(desktopAfter.toast.text, /推荐站位已完成/);
  await capture("auto-arrange-desktop-after");

  await scramble([1, 3, 5, 6, 8, 12, 18, 20]);
  const keyboardBefore = await snapshot();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press("a");
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).toast?.includes("推荐站位已完成"));
  const keyboardAfter = await snapshot();
  assertArranged(keyboardBefore, keyboardAfter, "keyboard A");

  await scramble([0, 1, 2, 3, 6, 7, 12, 18]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobileBefore = await snapshot();
  const mobileLayout = await page.evaluate(() => {
    const nav = document.querySelector(".rift-dom-mobile-actions");
    const buttons = nav ? [...nav.querySelectorAll("button")] : [];
    const rects = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
      };
    });
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      buttonCount: buttons.length,
      rects,
      overlaps: rects.some((left, index) => rects.slice(index + 1).some((right) => (
        left.left < right.right && left.right > right.left
          && left.top < right.bottom && left.bottom > right.top
      ))),
    };
  });
  assert.equal(mobileLayout.buttonCount, 5);
  assert.ok(mobileLayout.overflow <= 1, `mobile overflow: ${JSON.stringify(mobileLayout)}`);
  assert.equal(mobileLayout.overlaps, false);
  assert.ok(mobileLayout.rects.every((rect) => rect.width >= 60 && rect.scrollWidth <= rect.clientWidth + 1));
  await capture("auto-arrange-mobile-before");
  const mobileButton = page.locator(".rift-dom-mobile-actions").getByRole("button", { name: "推荐站位" });
  await mobileButton.click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).toast?.includes("推荐站位已完成"));
  const mobileAfter = await snapshot();
  assertArranged(mobileBefore, mobileAfter, "mobile button");
  await capture("auto-arrange-mobile-after");

  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({
    actions: {
      desktop: { selectedUid: `${desktopBefore.selectedUid} -> ${desktopAfter.selectedUid}` },
      keyboard: true,
      mobile: true,
    },
    expectedSlots,
    desktopLayout,
    mobileLayout,
    screenshots,
    errors,
    failedResponses,
  }, null, 2));
  await closeBrowser();
})().catch(async (error) => {
  console.error(error);
  await closeBrowser();
  process.exitCode = 1;
});
