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
      // Try the next repository-known Playwright installation.
    }
  }
  throw new Error("Unable to load playwright; install it or set PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = `.tmp/autochess/seed-restart-v${expectedVersion}`;
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

(async () => {
  const health = await fetch(`${baseUrl}/game/autochess`);
  assert.equal(health.ok, true, `Autochess URL returned ${health.status}`);

  browserProfile = mkdtempSync(join(tmpdir(), "autochess-seed-restart-"));
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

  const open = async (url) => {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    assert.equal(response?.ok(), true, `Autochess URL returned ${response?.status()}: ${url}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor({ state: "attached", timeout: 60_000 });
    await page.waitForFunction(() => Boolean(
      window.autoChessAI?.bridge
        && typeof window.render_game_to_text === "function",
    ), undefined, { timeout: 60_000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-game-canvas="rift-line"]');
      const rect = canvas?.getBoundingClientRect();
      return Boolean(canvas && rect && rect.width > 0 && rect.height > 0 && canvas.width > 0 && canvas.height > 0);
    }, undefined, { timeout: 60_000 });
  };

  const snapshot = () => page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    const rect = canvas?.getBoundingClientRect();
    return {
      seed: bridge.engine.state.seed,
      enemySeed: bridge.engine.state.enemySeed,
      phase: bridge.engine.state.phase,
      starterChoices: [...bridge.engine.state.starterChoices],
      text: JSON.parse(window.render_game_to_text()),
      canvas: canvas && rect ? {
        width: canvas.width,
        height: canvas.height,
        displayWidth: rect.width,
        displayHeight: rect.height,
        logicalWidth: Number(canvas.dataset.logicalWidth),
        logicalHeight: Number(canvas.dataset.logicalHeight),
      } : null,
    };
  });

  const restartWithEntropy = async (forcedSeed) => {
    const result = await page.evaluate((nextSeed) => {
      const originalNow = Date.now;
      const originalRandom = Math.random;
      Date.now = () => nextSeed;
      Math.random = () => 0;
      try {
        window.autoChessAI.bridge.engine.state.phase = "gameover";
        return window.autoChessAI.restart();
      } finally {
        Date.now = originalNow;
        Math.random = originalRandom;
      }
    }, forcedSeed);
    assert.equal(result.ok, true);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "title");
  };

  const screenshots = {};
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, ...inspectPng(buffer) };
  };

  const pinnedSeed = 907_101;
  await open(`${baseUrl}/game/autochess?seed=${pinnedSeed}`);
  const pinnedBefore = await snapshot();
  assert.equal(pinnedBefore.seed, pinnedSeed);
  await restartWithEntropy(123_456_789);
  const pinnedAfter = await snapshot();
  assert.equal(pinnedAfter.seed, pinnedSeed);
  assert.equal(pinnedAfter.enemySeed, pinnedSeed);
  assert.deepEqual(pinnedAfter.starterChoices, pinnedBefore.starterChoices);
  await capture("pinned-seed-after-restart");

  await open(`${baseUrl}/game/autochess`);
  const unpinnedBefore = await snapshot();
  const forcedSeed = (unpinnedBefore.seed + 1) % 4_294_967_296;
  await restartWithEntropy(forcedSeed);
  const unpinnedAfter = await snapshot();
  assert.equal(unpinnedAfter.seed, forcedSeed);
  assert.notEqual(unpinnedAfter.seed, unpinnedBefore.seed);
  assert.equal(unpinnedAfter.enemySeed, forcedSeed);
  await capture("fresh-seed-after-restart");

  [pinnedBefore, pinnedAfter, unpinnedBefore, unpinnedAfter].forEach((state) => {
    assert.equal(state.phase, "title");
    assert.equal(state.text.version, expectedVersion);
    assert.equal(state.text.phase, state.phase);
    assert.ok(state.canvas?.width > 0 && state.canvas?.height > 0, JSON.stringify(state.canvas));
    assert.ok(state.canvas?.displayWidth > 0 && state.canvas?.displayHeight > 0, JSON.stringify(state.canvas));
    assert.ok(state.canvas?.logicalWidth > 0 && state.canvas?.logicalHeight > 0, JSON.stringify(state.canvas));
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);

  console.log(JSON.stringify({
    pinned: {
      before: pinnedBefore.seed,
      after: pinnedAfter.seed,
      starterChoicesStable: true,
    },
    unpinned: {
      before: unpinnedBefore.seed,
      after: unpinnedAfter.seed,
    },
    canvas: pinnedAfter.canvas,
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
