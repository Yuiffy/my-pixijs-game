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
const pageUrl = `${baseUrl}/game/autochess?seed=153103`;
const artifactDirectory = ".tmp/autochess/autopilot-prewarm";
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
  const workerUrls = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => workerUrls.push(worker.url()));
  page.on("response", (pageResponse) => {
    if (pageResponse.status() >= 400) {
      failedResponses.push({ status: pageResponse.status(), url: pageResponse.url() });
    }
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "rift-line-autopilot-strategy",
      JSON.stringify({ style: "balanced", level: "veteran", version: 6 }),
    );
  });

  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.locator('[data-game-canvas="rift-line"]').waitFor({ state: "visible" });
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  const readState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const mainThreadCacheBefore = await page.evaluate(() => window.getAutoChessRolloutCacheStats());

  await page.getByText("AI 观战", { exact: true }).click();
  await page.getByRole("button", { name: "由 AI 自选协议并开局" }).click();
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.phase === "battle" && state.interface.autoplayEnabled;
  }, null, { timeout: 15000 }).catch(async (error) => {
    throw new Error(`Autopilot did not enter battle: ${JSON.stringify({
      state: await readState(),
      toolbarStatus: await page.locator(".rift-toolbar-status").textContent(),
      thinkingStatus: await page.locator(".rift-autopilot-thinking").allTextContents(),
      workerUrls,
      errors,
      failedResponses,
      cause: error.message,
    })}`);
  });
  const beforeSwitch = await readState();
  assert.equal(beforeSwitch.interface.autoplayThinkingLevel, "veteran");

  await page.getByRole("button", { name: "游戏设置" }).click();
  const settings = page.getByRole("dialog", { name: "游戏设置" });
  await settings.getByRole("radiogroup", { name: "AI 等级" })
    .getByRole("radio", { name: "看穿" })
    .click();
  await settings.getByRole("button", { name: "关闭设置" }).click();

  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.phase === "battle"
      && state.interface.autoplayThinkingLevel === "oracle"
      && state.interface.autoplayInformationMode === "oracle";
  });
  const switched = await readState();
  const prewarmStatus = page.getByText("下一回合预演中", { exact: true });
  await prewarmStatus.waitFor({ state: "visible" });
  const desktopBuffer = await page.screenshot({
    path: `${artifactDirectory}/prewarm-desktop.png`,
    fullPage: true,
  });
  const desktop = inspectPng(desktopBuffer);
  const desktopResponsiveness = await page.evaluate(async () => {
    const samples = [];
    await new Promise((resolve) => {
      const sample = (time) => {
        samples.push(time);
        if (samples.length >= 4) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const state = JSON.parse(window.render_game_to_text());
    return {
      samples,
      battleElapsed: state.battle?.elapsed || 0,
      labelVisible: document.body.textContent.includes("下一回合预演中"),
    };
  });
  assert.equal(desktopResponsiveness.samples.length, 4);
  assert.ok(
    desktopResponsiveness.samples[3] - desktopResponsiveness.samples[0] < 250,
    `Main-thread animation stalled: ${JSON.stringify(desktopResponsiveness.samples)}`,
  );
  await prewarmStatus.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 390, height: 844 });
  const autopilotButton = page.locator('.rift-toolbar button[title="关闭托管并接管"]');
  await autopilotButton.evaluate((button) => button.click());
  const manualButton = page.locator('.rift-toolbar button[title="让 AI 托管当前对局"]');
  await manualButton.waitFor({ state: "attached" });
  await manualButton.evaluate((button) => button.click());
  await prewarmStatus.waitFor({ state: "visible" });
  const mobileBuffer = await page.screenshot({
    path: `${artifactDirectory}/prewarm-mobile.png`,
    fullPage: true,
  });
  const mobile = inspectPng(mobileBuffer);
  await prewarmStatus.waitFor({ state: "hidden" });

  const afterPrewarm = await readState();
  const mainThreadCacheAfter = await page.evaluate(() => window.getAutoChessRolloutCacheStats());
  assert.equal(afterPrewarm.interface.autoplayThinkingLevel, "oracle");
  assert.equal(afterPrewarm.interface.autoplayInformationMode, "oracle");
  assert.ok(workerUrls.length >= 2, `Expected Worker restart after retaking control: ${workerUrls}`);
  assert.equal(mainThreadCacheAfter.misses, mainThreadCacheBefore.misses);
  const relevantFailures = failedResponses.filter(({ url }) => (
    !url.endsWith("/api/record") && !url.includes("/_next/webpack-hmr")
  ));
  assert.deepEqual(errors, []);
  assert.deepEqual(relevantFailures, []);

  console.log(JSON.stringify({
    switchedDuringBattle: {
      round: switched.round,
      from: beforeSwitch.interface.autoplayThinkingLevel,
      to: switched.interface.autoplayThinkingLevel,
      informationMode: switched.interface.autoplayInformationMode,
    },
    desktopResponsiveness,
    workerCount: workerUrls.length,
    workerUrls,
    mainThreadRolloutMisses: mainThreadCacheAfter.misses - mainThreadCacheBefore.misses,
    screenshots: { desktop, mobile },
    finalPhase: afterPrewarm.phase,
    errors,
    failedResponses: relevantFailures,
  }, null, 2));
})().finally(async () => {
  await browser?.close();
});
