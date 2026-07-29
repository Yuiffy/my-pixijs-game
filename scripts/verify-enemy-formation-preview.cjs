const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inflateSync } = require("node:zlib");

const localRequire = createRequire(__filename);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
].filter(Boolean);

const loadPlaywright = () => {
  for (const candidate of playwrightCandidates) {
    try {
      if ((candidate.includes("/") || candidate.includes("\\")) && !existsSync(candidate)) continue;
      return localRequire(candidate);
    } catch {
      // Try the next repository-known Playwright location.
    }
  }
  throw new Error("Unable to load Playwright");
};

const inspectPng = (buffer) => {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
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
      assert.equal(chunk[8], 8);
      assert.equal(chunk[12], 0);
      assert.ok(channels);
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
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      if (filter === 2) row[x] = (row[x] + up) & 255;
      if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const prediction = left + up - upperLeft;
        const leftDistance = Math.abs(prediction - left);
        const upDistance = Math.abs(prediction - up);
        const upperLeftDistance = Math.abs(prediction - upperLeft);
        const nearest = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft;
        row[x] = (row[x] + nearest) & 255;
      }
    }
    assert.ok(filter <= 4, `Unsupported PNG filter ${filter}`);
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      const red = row[pixel];
      const green = row[pixel + 1];
      const blue = row[pixel + 2];
      const alpha = channels === 4 ? row[pixel + 3] : 255;
      if (red <= 12 && green <= 12 && blue <= 12) nearBlack += 1;
      if (alpha === 0) transparent += 1;
      if (colors.size < 4096) colors.add(`${red},${green},${blue},${alpha}`);
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
  assert.ok(
    metrics.colors > 1
      && metrics.nearBlackRatio < 0.97
      && metrics.transparentRatio < 0.97,
    `Invalid screenshot: ${JSON.stringify(metrics)}`,
  );
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3017";
const artifactDirectory = ".tmp/autochess/enemy-formation";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const failedResponses = [];
    const screenshots = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
    });

    const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const capture = async (filename) => {
      await page.waitForTimeout(100);
      const path = `${artifactDirectory}/${filename}`;
      const buffer = await page.screenshot({ path, fullPage: true });
      const result = { path, bytes: buffer.length, metrics: inspectPng(buffer) };
      screenshots.push(result);
      return result;
    };
    const clickLogical = async (x, y, width, height) => {
      const canvas = page.locator('[data-game-canvas="rift-line"]');
      const box = await canvas.boundingBox();
      assert.ok(box);
      const scale = Math.min(box.width / width, box.height / height);
      await page.mouse.click(
        box.x + (box.width - width * scale) / 2 + x * scale,
        box.y + (box.height - height * scale) / 2 + y * scale,
      );
    };
    const openFormationAt = async (x, y, width, height) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await clickLogical(x, y, width, height);
        await page.waitForTimeout(120);
        if ((await state()).interface.enemyFormationOpen) return;
      }
      throw new Error("Enemy formation trigger did not open the deployment dialog");
    };

    await page.goto(`${baseUrl}/game/autochess?seed=311`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const canvas = page.locator('[data-game-canvas="rift-line"]');
    await canvas.waitFor();
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
    await page.evaluate(() => {
      const canvasElement = document.querySelector('[data-game-canvas="rift-line"]');
      let node = canvasElement;
      let fiber = null;
      while (node && !fiber) {
        const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
        fiber = fiberKey ? node[fiberKey] : null;
        node = node.parentElement;
      }
      while (fiber && fiber.type?.name !== "AutoChessGame") fiber = fiber.return;
      let hook = fiber?.memoizedState;
      let bridge = null;
      while (hook) {
        if (hook.memoizedState?.current?.engine?.state) {
          bridge = hook.memoizedState.current;
          break;
        }
        hook = hook.next;
      }
      if (!bridge) throw new Error("Unable to locate the autochess engine bridge");
      bridge.engine.state.round = 32;
      bridge.onEvent?.({ type: "state" });
    });
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).round === 32);
    await page.waitForTimeout(250);

    const preparation = await state();
    assert.ok(preparation.wave.units.length > 10);
    preparation.wave.units.forEach((unit) => {
      assert.ok(Number.isFinite(unit.formation.x));
      assert.ok(Number.isFinite(unit.formation.y));
      assert.ok(Number.isInteger(unit.formation.row));
    });
    const desktopCanvas = await canvas.boundingBox();
    assert.ok(desktopCanvas && desktopCanvas.width > 1000 && desktopCanvas.height > 700);

    await openFormationAt(719, 124, 1120, 720);
    const dialog = page.locator(".rift-enemy-formation-dialog");
    await dialog.waitFor();
    let openState = await state();
    assert.equal(openState.interface.enemyFormationOpen, true);
    assert.equal(await page.locator(".rift-enemy-formation-unit").count(), preparation.wave.units.length);

    const secondUnit = page.locator(".rift-enemy-formation-unit").nth(Math.min(1, preparation.wave.units.length - 1));
    await secondUnit.hover();
    assert.equal(
      await page.locator(".rift-enemy-detail-identity strong").textContent(),
      preparation.wave.units[Math.min(1, preparation.wave.units.length - 1)].name,
    );
    const beforeShortcuts = await state();
    await page.keyboard.press("r");
    await page.keyboard.press("Space");
    const afterShortcuts = await state();
    assert.equal(afterShortcuts.phase, "preparation");
    assert.equal(afterShortcuts.player.gold, beforeShortcuts.player.gold);
    assert.deepEqual(afterShortcuts.shop, beforeShortcuts.shop);
    assert.equal(afterShortcuts.interface.enemyFormationOpen, true);
    await capture("enemy-formation-desktop.png");

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal((await state()).interface.enemyFormationOpen, false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobileCanvas = await canvas.boundingBox();
    assert.ok(mobileCanvas && mobileCanvas.width >= 380 && mobileCanvas.height >= 800);
    await openFormationAt(409, 109, 480, 1000);
    await dialog.waitFor();
    openState = await state();
    assert.equal(openState.interface.enemyFormationOpen, true);
    const mobileDialog = await dialog.boundingBox();
    const mobileField = await page.locator(".rift-enemy-formation-field").boundingBox();
    assert.ok(mobileDialog && mobileDialog.x >= 0 && mobileDialog.y >= 0);
    assert.ok(mobileDialog.x + mobileDialog.width <= 390);
    assert.ok(mobileDialog.y + mobileDialog.height <= 844);
    assert.ok(mobileField && mobileField.height >= 210);

    const lastIndex = preparation.wave.units.length - 1;
    await page.locator(".rift-enemy-formation-unit").nth(lastIndex).click();
    assert.equal(
      await page.locator(".rift-enemy-detail-identity strong").textContent(),
      preparation.wave.units[lastIndex].name,
    );
    await capture("enemy-formation-mobile.png");
    await page.locator(".rift-enemy-formation-close").click();
    await dialog.waitFor({ state: "detached" });
    assert.equal((await state()).interface.enemyFormationOpen, false);

    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    console.log(JSON.stringify({
      wave: preparation.wave.name,
      units: preparation.wave.units.map(({ id, star, formation }) => ({ id, star, formation })),
      desktopCanvas,
      mobileCanvas,
      screenshots,
      errors,
      failedResponses,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
