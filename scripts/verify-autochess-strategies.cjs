const assert = require("node:assert/strict");
const { existsSync, mkdirSync } = require("node:fs");
const { createRequire } = require("node:module");
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
    assert.ok(filter <= 4);
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
  assert.ok(metrics.colors > 1);
  assert.ok(metrics.nearBlackRatio < 0.97);
  assert.ok(metrics.transparentRatio < 0.97);
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const pageUrl = `${baseUrl}/game/autochess?seed=162133`;
const artifactDirectory = ".tmp/autochess/strategies";
mkdirSync(artifactDirectory, { recursive: true });

let browser;

(async () => {
  const response = await fetch(pageUrl);
  assert.ok(response.ok, `Autochess URL did not respond: ${response.status} ${pageUrl}`);

  browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30000);
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
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "rift-line-autopilot-strategy",
      JSON.stringify({ style: "balanced", version: 3 }),
    );
  });

  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.locator('[data-game-canvas="rift-line"]').waitFor({ state: "visible" });
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  const readState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const readStoredStrategy = () => page.evaluate(() => JSON.parse(
    window.localStorage.getItem("rift-line-autopilot-strategy"),
  ));

  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.interface.autoplayStyle === "fair";
  });
  const migrated = await readState();
  assert.equal(migrated.interface.autoplayStyle, "fair");
  assert.equal(migrated.interface.autoplayInformationMode, "normal");

  await page.getByRole("button", { name: "游戏设置" }).click();
  const settings = page.getByRole("dialog", { name: "游戏设置" });
  const strategies = settings.getByRole("radiogroup", { name: "托管风格" });
  await assert.doesNotReject(() => strategies.getByRole("radio", { name: "实战" }).waitFor());
  assert.deepEqual(
    await strategies.getByRole("radio").allTextContents(),
    ["实战", "看穿2", "Go测试"],
  );

  const selectStrategy = async (name, style, informationMode) => {
    await strategies.getByRole("radio", { name }).click();
    const state = await readState();
    const stored = await readStoredStrategy();
    assert.equal(state.interface.autoplayStyle, style);
    assert.equal(state.interface.autoplayInformationMode, informationMode);
    assert.deepEqual(stored, { style, version: 4 });
  };
  await selectStrategy("实战", "fair", "normal");
  await selectStrategy("看穿2", "seer", "oracle");
  await selectStrategy("Go测试", "go", "oracle");
  await selectStrategy("实战", "fair", "normal");

  const layout = await page.evaluate(() => {
    const panel = document.querySelector(".rift-settings-panel")?.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll(
      '[aria-label="托管风格"] [role="radio"]',
    )).map((button) => ({
      text: button.textContent,
      width: button.getBoundingClientRect().width,
      scrollWidth: button.scrollWidth,
    }));
    return { panel, buttons, viewport: { width: innerWidth, height: innerHeight } };
  });
  assert.ok(layout.panel);
  assert.ok(layout.panel.x >= 0 && layout.panel.y >= 0);
  assert.ok(layout.panel.right <= layout.viewport.width && layout.panel.bottom <= layout.viewport.height);
  assert.ok(layout.buttons.every((button) => button.scrollWidth <= button.width + 1));

  const desktopBuffer = await page.screenshot({
    path: `${artifactDirectory}/strategies-desktop.png`,
    fullPage: true,
  });
  const desktop = inspectPng(desktopBuffer);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobileLayout = await page.evaluate(() => {
    const panel = document.querySelector(".rift-settings-panel")?.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll(
      '[aria-label="托管风格"] [role="radio"]',
    )).map((button) => ({
      text: button.textContent,
      width: button.getBoundingClientRect().width,
      scrollWidth: button.scrollWidth,
    }));
    return { panel, buttons, viewport: { width: innerWidth, height: innerHeight } };
  });
  assert.ok(mobileLayout.panel);
  assert.ok(mobileLayout.panel.x >= 0 && mobileLayout.panel.y >= 0);
  assert.ok(mobileLayout.panel.right <= mobileLayout.viewport.width);
  assert.ok(mobileLayout.buttons.every((button) => button.scrollWidth <= button.width + 1));
  const mobileBuffer = await page.screenshot({
    path: `${artifactDirectory}/strategies-mobile.png`,
    fullPage: true,
  });
  const mobile = inspectPng(mobileBuffer);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("Escape");
  await page.getByText("AI 观战", { exact: true }).click();
  await page.getByRole("button", { name: "由 AI 自选协议并开局" }).click();
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.phase === "preparation" && state.interface.autoplayEnabled === true;
  });
  const started = await readState();
  assert.equal(started.interface.autoplayStyle, "fair");
  assert.equal(started.interface.autoplayInformationMode, "normal");

  const relevantFailures = failedResponses.filter(({ url }) => (
    !url.endsWith("/api/record") && !url.includes("/_next/webpack-hmr")
  ));
  assert.deepEqual(errors, []);
  assert.deepEqual(relevantFailures, []);

  console.log(JSON.stringify({
    migrated: {
      style: migrated.interface.autoplayStyle,
      informationMode: migrated.interface.autoplayInformationMode,
    },
    choices: ["实战", "看穿2", "Go测试"],
    started: {
      phase: started.phase,
      style: started.interface.autoplayStyle,
      informationMode: started.interface.autoplayInformationMode,
      autoplayEnabled: started.interface.autoplayEnabled,
    },
    screenshots: { desktop, mobile },
    errors,
    failedResponses: relevantFailures,
  }, null, 2));
})().finally(async () => {
  await browser?.close();
});
