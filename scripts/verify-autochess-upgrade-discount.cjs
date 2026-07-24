const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inflateSync } = require("node:zlib");

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

const inspectPng = (buffer) => {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Screenshot is not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (chunk[8] !== 8 || chunk[12] !== 0 || !channels) {
        throw new Error("Unsupported PNG encoding");
      }
    }
    if (type === "IDAT") idat.push(chunk);
    if (type === "IEND") break;
    offset += length + 12;
  }

  const rows = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let rowOffset = 0;
  let previous = Buffer.alloc(stride);
  let nearBlack = 0;
  let transparent = 0;
  const colors = new Set();
  for (let y = 0; y < height; y += 1) {
    const filter = rows[rowOffset];
    const row = Buffer.from(rows.subarray(rowOffset + 1, rowOffset + 1 + stride));
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      if (filter === 1) row[index] = (row[index] + left) & 255;
      if (filter === 2) row[index] = (row[index] + up) & 255;
      if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const prediction = left + up - upperLeft;
        const leftDistance = Math.abs(prediction - left);
        const upDistance = Math.abs(prediction - up);
        const upperLeftDistance = Math.abs(prediction - upperLeft);
        const nearest = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft;
        row[index] = (row[index] + nearest) & 255;
      }
    }
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`);
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      const red = row[pixel];
      const green = row[pixel + 1];
      const blue = row[pixel + 2];
      const alpha = channels === 4 ? row[pixel + 3] : 255;
      if (red <= 12 && green <= 12 && blue <= 12) nearBlack += 1;
      if (alpha === 0) transparent += 1;
      if (colors.size < 2048) colors.add(`${red},${green},${blue},${alpha}`);
    }
    previous = row;
    rowOffset += stride + 1;
  }

  const pixels = width * height;
  const metrics = {
    width,
    height,
    colors: colors.size,
    nearBlackRatio: Number((nearBlack / pixels).toFixed(4)),
    transparentRatio: Number((transparent / pixels).toFixed(4)),
  };
  if (metrics.colors <= 1 || metrics.nearBlackRatio >= 0.97 || metrics.transparentRatio >= 0.97) {
    throw new Error(`Invalid screenshot: ${JSON.stringify(metrics)}`);
  }
  return metrics;
};

const { chromium } = loadPlaywright();
const artifactDirectory = ".tmp/autochess";
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
  page.on("response", (pageResponse) => {
    if (pageResponse.status() >= 400) {
      failedResponses.push({ status: pageResponse.status(), url: pageResponse.url() });
    }
  });

  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
  const response = await page.goto(`${baseUrl}/game/autochess?seed=1`, { waitUntil: "domcontentloaded" });
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
  const clickLogical = async (x, y) => {
    const point = await pointForLogical(x, y);
    await page.mouse.click(point.x, point.y);
  };
  const capture = async (name) => {
    const buffer = await page.screenshot({
      path: `${artifactDirectory}/${name}.png`,
      fullPage: true,
    });
    return inspectPng(buffer);
  };

  await page.evaluate(() => {
    for (const node of document.querySelectorAll("*")) {
      const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
      let fiber = key ? node[key] : null;
      while (fiber) {
        const props = fiber.memoizedProps;
        if (props?.engine?.state && typeof props.onAction === "function") {
          window.__autochessUpgradeTest = props;
          return;
        }
        fiber = fiber.return;
      }
    }
    throw new Error("Unable to locate the autochess engine");
  });

  await page.evaluate(() => {
    const { engine, onAction } = window.__autochessUpgradeTest;
    engine.state.upgradeRemaining = 1;
    engine.state.upgradeDiscountCarry = 0;
    onAction({ type: "clearSelection" });
  });
  await page.waitForTimeout(100);

  const finishBattle = async () => {
    await page.locator(".rift-start-button").click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
    await page.evaluate(() => {
      const { engine } = window.__autochessUpgradeTest;
      engine.state.battle.enemy.forEach((fighter) => {
        fighter.hp = 0;
        fighter.alive = false;
      });
      window.advanceTime(100);
    });
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "result");
    await clickLogical(560, 665);
  };

  await finishBattle();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  const zeroCost = await readState();
  const zeroCostDom = {
    heading: await page.locator(".rift-shop-level").innerText(),
    button: await page.locator(".rift-dom-shop-actions button").first().innerText(),
  };
  if (zeroCost.player.upgradeRemaining !== 0 || zeroCost.player.upgradeDiscountCarry !== 0) {
    throw new Error(`First discount did not reach zero: ${JSON.stringify(zeroCost.player)}`);
  }
  if (!zeroCostDom.heading.includes("下本还需 0 金") || !zeroCostDom.button.includes("0")) {
    throw new Error(`Zero-cost UI did not update: ${JSON.stringify(zeroCostDom)}`);
  }
  const zeroCostScreenshot = await capture("upgrade-discount-zero");

  await finishBattle();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "augment");
  const carried = await readState();
  if (carried.player.upgradeRemaining !== 0 || carried.player.upgradeDiscountCarry !== 1) {
    throw new Error(`Overflow discount was not carried: ${JSON.stringify(carried.player)}`);
  }
  await clickLogical(235, 405);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  const carriedDom = await page.locator(".rift-shop-level").innerText();
  if (!carriedDom.includes("下本还需 0 金 · 结转 1")) {
    throw new Error(`Carried discount is not visible: ${carriedDom}`);
  }
  const carriedScreenshot = await capture("upgrade-discount-carried");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.locator(".rift-dom-mobile-actions button").first().click();
  const mobileCarry = await page.locator(".rift-sheet-summary").innerText();
  if (!mobileCarry.includes("减费结转 1")) {
    throw new Error(`Mobile carried discount is not visible: ${mobileCarry}`);
  }
  const mobileCarriedScreenshot = await capture("upgrade-discount-carried-mobile");
  await page.getByRole("button", { name: "关闭面板" }).evaluate((button) => button.click());
  await page.locator(".rift-dom-sheet-backdrop").waitFor({ state: "detached" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);

  const goldBeforeUpgrade = (await readState()).player.gold;
  await page.locator(".rift-dom-shop-actions button").first().click();
  const afterUpgrade = await readState();
  const afterUpgradeDom = await page.locator(".rift-shop-level").innerText();
  if (
    afterUpgrade.player.bookLevel !== 4
    || afterUpgrade.player.upgradeRemaining !== 8
    || afterUpgrade.player.upgradeDiscountCarry !== 0
    || afterUpgrade.player.gold !== goldBeforeUpgrade
  ) {
    throw new Error(`Carried discount did not reduce the next level: ${JSON.stringify(afterUpgrade.player)}`);
  }
  if (!afterUpgradeDom.includes("下本还需 8 金")) {
    throw new Error(`Next-level UI did not show the carried discount: ${afterUpgradeDom}`);
  }
  const nextLevelScreenshot = await capture("upgrade-discount-next-level");

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
    zeroCost: {
      player: zeroCost.player,
      dom: zeroCostDom,
      screenshot: zeroCostScreenshot,
    },
    carried: {
      player: carried.player,
      dom: carriedDom,
      mobile: mobileCarry,
      screenshot: carriedScreenshot,
      mobileScreenshot: mobileCarriedScreenshot,
    },
    afterUpgrade: {
      player: afterUpgrade.player,
      dom: afterUpgradeDom,
      screenshot: nextLevelScreenshot,
    },
    canvas: canvasState,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
