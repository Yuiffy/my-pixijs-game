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
const artifactDirectory = `.tmp/autochess/shop-details-v${expectedVersion}`;
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

const inspectShopLayout = (page) => page.evaluate(() => {
  const sheet = document.querySelector(".rift-dom-sheet-shop");
  const cards = [...document.querySelectorAll(".rift-sheet-shop-list .rift-shop-card-wrap")];
  const overlaps = cards.some((card) => {
    const buy = card.querySelector(".rift-dom-shop-card")?.getBoundingClientRect();
    const info = card.querySelector(".rift-shop-card-info")?.getBoundingClientRect();
    return Boolean(
      buy && info
      && buy.left < info.right
      && buy.right > info.left
      && buy.top < info.bottom
      && buy.bottom > info.top,
    );
  });
  return {
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    sheetOverflow: sheet ? sheet.scrollWidth - sheet.clientWidth : null,
    sheetScrollHeight: sheet?.scrollHeight,
    sheetClientHeight: sheet?.clientHeight,
    overlaps,
  };
});

(async () => {
  browserProfile = mkdtempSync(join(tmpdir(), "autochess-shop-details-"));
  browserContext = await chromium.launchPersistentContext(browserProfile, {
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
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

  const response = await page.goto(`${baseUrl}/game/autochess?seed=6101`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.ok(), true, `Autochess URL returned ${response?.status()}`);
  await page.waitForFunction(() => Boolean(
    window.autoChessAI?.bridge
      && typeof window.render_game_to_text === "function"
      && typeof window.advanceTime === "function",
  ), { timeout: 60_000 });

  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const engine = bridge.engine;
    engine.resetToTitle();
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.gold = 0;
    engine.state.shop.splice(0, 5, "youyi", "tiandou", "rei", "spark_mage", "mossback");
    bridge.dispatch({ type: "clearSelection" });
  });
  assert.equal(JSON.parse(await page.evaluate(() => window.render_game_to_text())).version, expectedVersion);

  const screenshots = {};
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, ...inspectPng(buffer) };
  };
  const snapshot = () => page.evaluate(() => {
    const { state } = window.autoChessAI.bridge.engine;
    return {
      gold: state.gold,
      shop: [...state.shop],
      board: state.board.filter(Boolean).map((unit) => unit.uid),
      bench: state.bench.filter(Boolean).map((unit) => unit.uid),
    };
  });

  await page.locator(".rift-dom-mobile-actions .rift-action").first().tap();
  const sheet = page.locator(".rift-dom-sheet-shop");
  await sheet.waitFor({ state: "visible" });
  const purchaseButtons = sheet.locator(".rift-sheet-shop-list .rift-dom-shop-card");
  const infoButtons = sheet.locator(".rift-shop-card-info");
  assert.equal(await purchaseButtons.count(), 5);
  assert.equal(await infoButtons.count(), 5);
  assert.equal(await purchaseButtons.evaluateAll((buttons) => buttons.every((button) => button.disabled)), true);

  const beforeInspect = await snapshot();
  await infoButtons.first().tap();
  const detail = sheet.locator('.rift-shop-card-detail[role="region"]');
  await detail.waitFor({ state: "visible" });
  const detailText = await detail.innerText();
  for (const expected of ["生命", "攻击", "护甲", "射程", "技能 · 叛逆转场", "星级成长："]) {
    assert.match(detailText, new RegExp(expected));
  }
  assert.match(await detail.locator(".rift-detail-energy").innerText(), /回能|能量/);
  assert.deepEqual(await snapshot(), beforeInspect, "Inspecting an unaffordable unit changed game state");

  const mobileLayout = await inspectShopLayout(page);
  assert.ok(mobileLayout.documentOverflow <= 1, JSON.stringify(mobileLayout));
  assert.ok(mobileLayout.sheetOverflow <= 1, JSON.stringify(mobileLayout));
  assert.equal(mobileLayout.overlaps, false);
  assert.ok(mobileLayout.sheetScrollHeight > mobileLayout.sheetClientHeight);
  await capture("shop-details-mobile-unaffordable");

  await infoButtons.nth(1).tap();
  assert.equal(await sheet.locator(".rift-shop-card-detail").count(), 1);
  assert.equal(await infoButtons.first().getAttribute("aria-expanded"), "false");
  assert.equal(await infoButtons.nth(1).getAttribute("aria-expanded"), "true");
  await infoButtons.nth(1).tap();
  assert.equal(await sheet.locator(".rift-shop-card-detail").count(), 0);
  await infoButtons.first().tap();

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(250);
  await detail.waitFor({ state: "visible" });
  const tabletLayout = await inspectShopLayout(page);
  assert.ok(tabletLayout.documentOverflow <= 1, JSON.stringify(tabletLayout));
  assert.ok(tabletLayout.sheetOverflow <= 1, JSON.stringify(tabletLayout));
  assert.equal(tabletLayout.overlaps, false);
  await capture("shop-details-tablet");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await infoButtons.first().tap();
  await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    bridge.engine.state.gold = 100;
    bridge.dispatch({ type: "clearSelection" });
  });
  await page.waitForFunction(() => {
    const button = document.querySelector(".rift-dom-sheet-shop .rift-dom-shop-card");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  const beforeBuy = await snapshot();
  await purchaseButtons.first().tap();
  const afterBuy = await snapshot();
  assert.equal(afterBuy.gold, beforeBuy.gold - 3);
  assert.equal(afterBuy.board.length + afterBuy.bench.length, beforeBuy.board.length + beforeBuy.bench.length + 1);
  assert.equal(afterBuy.shop[0], null);
  assert.equal(await sheet.locator(".rift-shop-card-detail").count(), 0);
  await capture("shop-details-mobile-purchased");

  await sheet.getByRole("button", { name: "关闭面板" }).tap();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);
  const desktopCard = page.locator(".rift-dom-shop-desktop .rift-dom-shop-card:not(.empty)").first();
  await desktopCard.hover();
  const desktopTooltip = page.locator('.rift-dom-shop-desktop .rift-shop-card-detail[role="tooltip"]');
  await desktopTooltip.waitFor({ state: "visible" });
  assert.equal(await page.locator(".rift-dom-shop-desktop .rift-shop-card-info").count(), 0);
  await capture("shop-details-desktop-hover");

  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({
    version: expectedVersion,
    beforeInspect,
    detailText,
    mobileLayout,
    tabletLayout,
    purchase: { before: beforeBuy, after: afterBuy },
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
