const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");

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
      // Try the next local Playwright installation.
    }
  }
  throw new Error("Unable to load Playwright");
};

const { chromium } = loadPlaywright();
const artifactDirectory = ".tmp/autochess/star-forge";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
  const response = await page.goto(`${baseUrl}/game/autochess?seed=309`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.getByText("火热整活", { exact: true }).click();

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const pointForLogical = async (x, y) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas is not visible");
    const logical = await canvas.evaluate((element) => ({
      width: Number(element.dataset.logicalWidth || 1120),
      height: Number(element.dataset.logicalHeight || 720),
    }));
    const scale = Math.min(box.width / logical.width, box.height / logical.height);
    return {
      x: box.x + (box.width - logical.width * scale) / 2 + x * scale,
      y: box.y + (box.height - logical.height * scale) / 2 + y * scale,
    };
  };
  const capture = (name) => page.screenshot({
    path: `${artifactDirectory}/${name}.png`,
    fullPage: true,
  });

  await page.evaluate(() => {
    for (const node of document.querySelectorAll("*")) {
      const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
      let fiber = key ? node[key] : null;
      while (fiber) {
        const props = fiber.memoizedProps;
        if (props?.engine?.state && typeof props.onAction === "function") {
          window.__autochessStarForgeTest = props;
          return;
        }
        fiber = fiber.return;
      }
    }
    throw new Error("Unable to locate the autochess engine");
  });

  await page.evaluate(() => {
    const { engine, onAction } = window.__autochessStarForgeTest;
    engine.state.playerLevel = 10;
    engine.state.upgradeRemaining = 0;
    engine.state.upgradeDiscountCarry = 0;
    engine.state.starForgeUnlocked = false;
    engine.state.gold = 200;
    engine.state.board.fill(null);
    engine.state.bench.fill(null);
    engine.state.board[11] = { uid: 30900, id: "rift_brawler", star: 1 };
    engine.state.bench[0] = { uid: 30901, id: "sun_guard", star: 1 };
    onAction({ type: "clearSelection" });
  });
  await page.waitForTimeout(100);

  const desktopForge = page.locator(".rift-dom-shop-actions .rift-star-forge");
  await desktopForge.waitFor();
  const lockedState = await readState();
  const lockedLabel = await desktopForge.innerText();
  if (!lockedLabel.includes("解锁工坊") || !lockedLabel.includes("40")) {
    throw new Error(`Locked forge label is incorrect: ${lockedLabel}`);
  }
  if (lockedState.player.starForge.unlocked) throw new Error("Forge started unlocked");
  await capture("star-forge-locked");

  await desktopForge.click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.starForge.unlocked);
  const unlockedState = await readState();
  if (unlockedState.player.gold !== 160 || unlockedState.bench[0].star !== 1) {
    throw new Error(`Unlock changed the wrong state: ${JSON.stringify(unlockedState)}`);
  }

  const upgradeCost = await page.evaluate(() => {
    const { engine } = window.__autochessStarForgeTest;
    return engine.getStarForgeUpgradeCost(engine.state.bench[0]);
  });
  const source = await pointForLogical(88, 638);
  const forgeBox = await desktopForge.boundingBox();
  if (!forgeBox) throw new Error("Forge drop zone is not visible");
  const target = { x: forgeBox.x + forgeBox.width / 2, y: forgeBox.y + forgeBox.height / 2 };
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.waitForFunction(() => document.querySelector(".rift-star-forge")?.classList.contains("is-drag-over"));
  const dragLabel = await desktopForge.innerText();
  if (!dragLabel.includes("松开升 2 星") || !dragLabel.includes(`${upgradeCost} 金`)) {
    throw new Error(`Drag preview is missing its price: ${dragLabel}`);
  }
  await capture("star-forge-drag-over");
  await page.mouse.up();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).bench[0]?.star === 2);

  const upgradedState = await readState();
  if (upgradedState.player.gold !== 160 - upgradeCost) {
    throw new Error(`Direct upgrade charged the wrong amount: ${JSON.stringify(upgradedState.player)}`);
  }
  if (!upgradedState.toast?.includes("直升 2 星")) {
    throw new Error(`Direct upgrade feedback is missing: ${upgradedState.toast}`);
  }
  await capture("star-forge-upgraded");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.locator(".rift-dom-mobile-actions .rift-action").filter({ hasText: "备战席" }).click();
  const firstBenchUnit = page.locator(".rift-sheet-bench-grid button").first();
  await firstBenchUnit.click();
  const mobileForge = page.locator(".rift-sheet-bench-actions .rift-star-forge");
  await mobileForge.waitFor();
  const mobileLabel = await mobileForge.innerText();
  if (!mobileLabel.includes("直升 3 星")) {
    throw new Error(`Mobile forge did not reflect the selected unit: ${mobileLabel}`);
  }
  const goldBeforeMobileUpgrade = (await readState()).player.gold;
  const mobileUpgradeCost = await page.evaluate(() => {
    const { engine } = window.__autochessStarForgeTest;
    return engine.getStarForgeUpgradeCost(engine.state.bench[0]);
  });
  await mobileForge.click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).bench[0]?.star === 3);
  const mobileState = await readState();
  if (mobileState.player.gold !== goldBeforeMobileUpgrade - mobileUpgradeCost) {
    throw new Error(`Mobile upgrade charged the wrong amount: ${JSON.stringify(mobileState.player)}`);
  }
  await capture("star-forge-mobile-upgraded");

  const canvasState = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (errors.length || failedResponses.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ errors, failedResponses })}`);
  }

  console.log(JSON.stringify({
    locked: { label: lockedLabel, player: lockedState.player },
    unlocked: { player: unlockedState.player },
    desktopUpgrade: { dragLabel, cost: upgradeCost, player: upgradedState.player, bench: upgradedState.bench },
    mobileUpgrade: { label: mobileLabel, cost: mobileUpgradeCost, player: mobileState.player, bench: mobileState.bench },
    canvas: canvasState,
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
