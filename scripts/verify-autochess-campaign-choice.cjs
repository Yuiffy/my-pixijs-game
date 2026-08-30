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
const artifactDirectory = `.tmp/autochess/campaign-choice-v${expectedVersion}`;
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
      // Chrome can briefly retain its profile lock after shutdown.
    }
    browserProfile = null;
  }
};

(async () => {
  browserProfile = mkdtempSync(join(tmpdir(), "autochess-campaign-choice-"));
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

  const response = await page.goto(`${baseUrl}/game/autochess?seed=70016`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.ok(), true, `Autochess URL returned ${response?.status()}`);
  await page.locator('[data-game-canvas="rift-line"]').waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(
    window.autoChessAI?.bridge
      && typeof window.render_game_to_text === "function",
  ), undefined, { timeout: 60_000 });
  const attached = await page.evaluate(() => {
    const host = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement;
    const fiberKey = host && Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? host[fiberKey] : null;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const current = hook.memoizedState?.current;
        if (current?.scene?.getScene) window.__codexAutoChessGame = current;
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return Boolean(window.__codexAutoChessGame);
  });
  assert.equal(attached, true, "Unable to locate the AutoChess Phaser game");
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    const rect = canvas?.getBoundingClientRect();
    return Boolean(canvas && rect && rect.width > 0 && rect.height > 0 && canvas.width > 0 && canvas.height > 0);
  }, undefined, { timeout: 60_000 });

  const screenshots = {};
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = inspectPng(buffer);
  };

  const setupCampaignVictory = async () => page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const engine = bridge.engine;
    bridge.dispatch({ type: "restart" });
    bridge.dispatch({ type: "starter", id: engine.state.starterChoices[0] });
    engine.state.round = 16;
    engine.state.playerLevel = 10;
    engine.state.upgradeRemaining = 0;
    engine.state.hp = 13;
    engine.state.gold = 64;
    engine.state.score = 4820;
    engine.state.board.fill(null);
    engine.state.bench.fill(null);
    [
      [60601, "rei", 2, 23],
      [60602, "mossback", 2, 17],
      [60603, "youyi", 2, 11],
      [60604, "spark_mage", 2, 10],
      [60605, "tiandou", 2, 16],
      [60606, "sui_blue", 2, 9],
    ].forEach(([uid, id, star, slot]) => {
      engine.state.board[slot] = { uid, id, star };
    });
    bridge.dispatch({ type: "battle" });
    const battle = engine.state.battle;
    if (!battle) throw new Error("Campaign final battle did not start");
    battle.player.forEach((fighter, index) => {
      fighter.damageDealt = 1800 + index * 420;
      fighter.healingDone = index === 4 ? 960 : 0;
      fighter.shieldingDone = index === 0 ? 720 : 0;
      fighter.damageTaken = 980 + index * 110;
    });
    battle.enemy.forEach((fighter) => {
      fighter.hp = 0;
      fighter.alive = false;
    });
    bridge.advance(50);
    if (engine.state.phase !== "result" || !engine.state.result?.won) {
      throw new Error("Campaign final victory did not reach result");
    }
    bridge.onEvent?.({ type: "state" });
    return {
      phase: engine.state.phase,
      round: engine.state.round,
      canFinishCampaign: engine.canFinishCampaign,
      finalWon: engine.state.finalWon,
      endlessUnlocked: engine.state.endlessUnlocked,
    };
  });

  const state = async () => page.evaluate(() => {
    const engine = window.autoChessAI.bridge.engine;
    return {
      text: JSON.parse(window.render_game_to_text()),
      phase: engine.state.phase,
      round: engine.state.round,
      finalWon: engine.state.finalWon,
      endlessUnlocked: engine.state.endlessUnlocked,
      canFinishCampaign: engine.canFinishCampaign,
    };
  });

  const desktopSetup = await setupCampaignVictory();
  assert.deepEqual(desktopSetup, {
    phase: "result",
    round: 16,
    canFinishCampaign: true,
    finalWon: false,
    endlessUnlocked: false,
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).campaignVictoryPending === true);
  await page.waitForTimeout(150);
  const desktopLayout = await page.evaluate(() => {
    const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
    const finish = scene.children.getByName("campaign-finish-button");
    const endless = scene.children.getByName("campaign-endless-button");
    const summarize = (object) => {
      const bounds = object?.getBounds();
      return bounds && {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        right: bounds.right,
        bottom: bounds.bottom,
      };
    };
    return {
      finish: summarize(finish),
      endless: summarize(endless),
      canvas: (() => {
        const element = document.querySelector('[data-game-canvas="rift-line"]');
        return element && {
          width: element.width,
          height: element.height,
          logicalWidth: Number(element.dataset.logicalWidth),
          logicalHeight: Number(element.dataset.logicalHeight),
        };
      })(),
    };
  });
  assert.ok(desktopLayout.finish && desktopLayout.endless, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.finish.right < desktopLayout.endless.x, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.finish.width >= 220 && desktopLayout.endless.width >= 220, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.finish.bottom <= desktopLayout.canvas.logicalHeight, JSON.stringify(desktopLayout));
  const desktopText = (await state()).text;
  assert.equal(desktopText.version, expectedVersion);
  assert.equal(desktopText.campaignVictoryPending, true);
  assert.ok(desktopText.availableActions.includes("点击完成远征或按 Enter 查看总结"));
  assert.ok(desktopText.availableActions.includes("点击继续无限模式进入第 17 战"));
  await capture("campaign-choice-desktop");

  await page.keyboard.press("Enter");
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "gameover");
  await page.locator(".rift-final-report").waitFor({ state: "visible" });
  const keyboardFinish = await state();
  assert.equal(keyboardFinish.finalWon, true);
  assert.equal(keyboardFinish.endlessUnlocked, false);
  assert.equal(keyboardFinish.text.campaignCleared, true);
  assert.equal(keyboardFinish.text.campaignVictoryPending, false);
  assert.match(await page.locator(".rift-final-report").innerText(), /裂隙已封闭/);
  await capture("campaign-finished-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await setupCampaignVictory();
  await page.waitForSelector(".rift-mobile-result-actions.is-campaign-clear");
  await page.waitForTimeout(250);
  const mobileLayout = await page.evaluate(() => {
    const actions = document.querySelector(".rift-mobile-result-actions");
    const buttons = actions ? [...actions.querySelectorAll("button")] : [];
    const rects = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
      };
    });
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      rects,
      overlap: rects.length === 2
        && rects[0].left < rects[1].right
        && rects[0].right > rects[1].left
        && rects[0].top < rects[1].bottom
        && rects[0].bottom > rects[1].top,
    };
  });
  assert.equal(mobileLayout.rects.length, 2, JSON.stringify(mobileLayout));
  assert.ok(mobileLayout.overflow <= 1, JSON.stringify(mobileLayout));
  assert.equal(mobileLayout.overlap, false, JSON.stringify(mobileLayout));
  assert.ok(mobileLayout.rects.every((rect) => (
    rect.width >= 150
      && rect.height >= 44
      && rect.scrollWidth <= rect.clientWidth + 1
  )), JSON.stringify(mobileLayout));
  await capture("campaign-choice-mobile");

  await page.getByRole("button", { name: /完成远征/ }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "gameover");
  const mobileFinish = await state();
  assert.equal(mobileFinish.finalWon, true);
  assert.equal(mobileFinish.endlessUnlocked, false);
  await capture("campaign-finished-mobile");

  await setupCampaignVictory();
  await page.waitForSelector(".rift-mobile-result-actions.is-campaign-clear");
  await page.getByRole("button", { name: /继续无限/ }).click();
  await page.waitForFunction(() => {
    const bridge = window.autoChessAI.bridge;
    return bridge.engine.state.phase === "augment" && bridge.engine.state.endlessUnlocked;
  });
  const endless = await state();
  assert.equal(endless.phase, "augment");
  assert.equal(endless.round, 16);
  assert.equal(endless.finalWon, false);
  assert.equal(endless.endlessUnlocked, true);
  assert.equal(endless.text.campaignCleared, true);
  assert.equal(endless.text.campaignVictoryPending, false);

  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({
    desktopLayout,
    mobileLayout,
    keyboardFinish: {
      phase: keyboardFinish.phase,
      finalWon: keyboardFinish.finalWon,
      campaignCleared: keyboardFinish.text.campaignCleared,
    },
    mobileFinish: {
      phase: mobileFinish.phase,
      finalWon: mobileFinish.finalWon,
    },
    endless: {
      phase: endless.phase,
      round: endless.round,
      endlessUnlocked: endless.endlessUnlocked,
    },
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
