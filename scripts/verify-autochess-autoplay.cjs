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
  let dark = 0;
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
        row[index] = (row[index] + (
          leftDistance <= upDistance && leftDistance <= upperLeftDistance
            ? left
            : upDistance <= upperLeftDistance ? up : upperLeft
        )) & 255;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      const red = row[pixel];
      const green = row[pixel + 1];
      const blue = row[pixel + 2];
      const alpha = channels === 4 ? row[pixel + 3] : 255;
      if (red <= 12 && green <= 12 && blue <= 12) nearBlack += 1;
      if (red * 0.2126 + green * 0.7152 + blue * 0.0722 <= 28) dark += 1;
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
    darkRatio: Number((dark / pixels).toFixed(4)),
    transparentRatio: Number((transparent / pixels).toFixed(4)),
  };
  assert.ok(
    metrics.colors > 1
      && metrics.nearBlackRatio < 0.97
      && metrics.darkRatio < 0.99
      && metrics.transparentRatio < 0.97,
    `Invalid screenshot: ${JSON.stringify(metrics)}`,
  );
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const pageUrl = `${baseUrl}/game/autochess?seed=1`;
const artifactDirectory = ".tmp/autochess/autoplay";
mkdirSync(artifactDirectory, { recursive: true });

let browser;

(async () => {
  const response = await fetch(pageUrl);
  assert.ok(response.ok, `Autochess URL did not respond before Chrome launch: ${response.status} ${pageUrl}`);

  browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(12000);
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

  const screenshotMetrics = {};
  const capture = async (name) => {
    const buffer = await page.screenshot({
      path: `${artifactDirectory}/${name}.png`,
      fullPage: true,
    });
    screenshotMetrics[name] = inspectPng(buffer);
  };
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const setSyntheticHidden = (hidden) => page.evaluate((nextHidden) => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => nextHidden,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor({ state: "visible" });
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.waitForTimeout(500);

  assert.equal((await state()).phase, "title");
  await page.getByRole("button", { name: /AI 观战/ }).click();
  assert.equal(await page.getByRole("button", { name: /AI 观战/ }).getAttribute("aria-pressed"), "true");
  await capture("title-ai-mode");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.ok(await page.getByRole("button", { name: /由 AI 自选协议并开局/ }).isVisible());
  await capture("title-ai-mode-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: /由 AI 自选协议并开局/ }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await page.waitForTimeout(900);
  const preparation = await state();
  assert.equal(preparation.interface.autoplayEnabled, true);
  assert.ok(preparation.player.boardCount > 0);
  await capture("ai-preparation");

  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).phase === "battle",
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(300);
  const battle = await state();
  assert.ok(battle.battle.playerUnits.length > 0 && battle.battle.enemyUnits.length > 0);
  await capture("ai-battle");

  const toolbar = page.locator(".rift-toolbar");
  const musicVolume = toolbar.getByRole("slider", { name: "音乐音量" });
  const effectsVolume = toolbar.getByRole("slider", { name: "音效音量" });
  assert.ok(await musicVolume.isVisible());
  assert.ok(await effectsVolume.isVisible());
  assert.equal(await toolbar.getByText(/v0\.2\.3/).count(), 0);
  await musicVolume.fill("0.35");
  await effectsVolume.fill("0.65");
  assert.equal(await musicVolume.inputValue(), "0.35");
  assert.equal(await effectsVolume.inputValue(), "0.65");

  await page.getByRole("button", { name: "游戏设置" }).click();
  const settings = page.getByRole("dialog", { name: "游戏设置" });
  await settings.waitFor({ state: "visible" });
  const strategyGroup = settings.getByRole("radiogroup", { name: "托管风格" });
  const levelGroup = settings.getByRole("radiogroup", { name: "AI 等级" });
  const survivalStyle = strategyGroup.getByRole("radio", { name: "稳健" });
  const balancedStyle = strategyGroup.getByRole("radio", { name: "平衡" });
  const highrollStyle = strategyGroup.getByRole("radio", { name: "搏上限" });
  const veteranLevel = levelGroup.getByRole("radio", { name: "老手" });
  const oracleLevel = levelGroup.getByRole("radio", { name: "看穿" });
  assert.equal(await balancedStyle.getAttribute("aria-checked"), "true");
  assert.equal(await veteranLevel.getAttribute("aria-checked"), "true");
  await highrollStyle.click();
  assert.equal((await state()).interface.autoplayPreferenceStyle, "highroll");
  assert.equal((await state()).interface.autoplayInformationMode, "normal");
  await oracleLevel.click();
  assert.equal((await state()).interface.autoplayThinkingLevel, "oracle");
  assert.equal((await state()).interface.autoplayInformationMode, "oracle");
  await survivalStyle.click();
  assert.equal((await state()).interface.autoplayPreferenceStyle, "survival");
  await veteranLevel.click();
  assert.equal((await state()).interface.autoplayThinkingLevel, "veteran");
  assert.equal((await state()).interface.autoplayInformationMode, "normal");
  await balancedStyle.click();
  assert.equal((await state()).interface.autoplayPreferenceStyle, "balanced");
  assert.equal(await settings.getByRole("switch", { name: "天眼商店" }).count(), 0);
  const backgroundSwitch = settings.getByRole("switch", { name: "后台继续战斗" });
  assert.equal(await backgroundSwitch.getAttribute("aria-checked"), "false");
  await backgroundSwitch.click();
  assert.equal(await backgroundSwitch.getAttribute("aria-checked"), "true");
  assert.equal(await page.evaluate(() => localStorage.getItem("rift-line-background-battle")), "1");
  assert.equal(await settings.getByRole("slider", { name: "设置中的音乐音量" }).isVisible(), false);
  assert.equal(await settings.getByRole("slider", { name: "设置中的音效音量" }).isVisible(), false);
  await page.waitForTimeout(180);
  await capture("desktop-settings");
  await settings.getByRole("button", { name: /版本与更新.*v0\.3\.0/ }).click();
  const releaseNotes = page.getByRole("dialog", { name: /v0\.3\.0/ });
  await releaseNotes.waitFor({ state: "visible" });
  assert.equal(await settings.isVisible(), false);
  await capture("desktop-release-from-settings");
  await releaseNotes.getByRole("button", { name: "关闭更新日志" }).click();

  const beforeBackground = await state();
  await setSyntheticHidden(true);
  await page.waitForTimeout(1250);
  const duringBackground = await state();
  assert.equal(duringBackground.interface.pageHidden, true);
  assert.equal(duringBackground.interface.backgroundBattleEnabled, true);
  assert.ok(
    duringBackground.battle.elapsed - beforeBackground.battle.elapsed > 0.9,
    `Enabled background battle did not advance: ${beforeBackground.battle.elapsed} -> ${duringBackground.battle.elapsed}`,
  );
  await setSyntheticHidden(false);

  await page.getByRole("button", { name: "游戏设置" }).click();
  await backgroundSwitch.click();
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await setSyntheticHidden(true);
  const beforePause = await state();
  assert.equal(beforePause.interface.pageHidden, true);
  assert.equal(beforePause.interface.backgroundBattleEnabled, false);
  await page.waitForTimeout(900);
  const duringPause = await state();
  assert.ok(
    Math.abs(duringPause.battle.elapsed - beforePause.battle.elapsed) < 0.08,
    `Disabled background battle still advanced: ${beforePause.battle.elapsed} -> ${duringPause.battle.elapsed}`,
  );
  await setSyntheticHidden(false);

  await page.getByRole("button", { name: /AI 托管中/ }).click();
  assert.equal((await state()).interface.autoplayEnabled, false);
  await setSyntheticHidden(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileControls = page.locator(".rift-mobile-session-controls");
  await mobileControls.waitFor({ state: "visible" });
  assert.equal(await mobileControls.getByRole("button").count(), 2);
  await capture("mobile-controls");
  await mobileControls.getByRole("button", { name: "游戏设置" }).click();
  await settings.waitFor({ state: "visible" });
  assert.ok(await settings.getByRole("switch", { name: "游戏声音" }).isVisible());
  assert.ok(await settings.getByRole("radiogroup", { name: "托管风格" }).isVisible());
  assert.ok(await settings.getByRole("radiogroup", { name: "AI 等级" }).isVisible());
  assert.ok(await settings.getByRole("radiogroup", { name: "AI 等级" })
    .getByRole("radio", { name: "看穿" }).isVisible());
  assert.equal(await settings.getByRole("radio", { name: "看穿2" }).count(), 0);
  assert.equal(await settings.getByRole("radio", { name: "Go测试" }).count(), 0);
  assert.equal(await settings.getByRole("switch", { name: "天眼商店" }).count(), 0);
  assert.ok(await settings.getByRole("slider", { name: "设置中的音乐音量" }).isVisible());
  assert.ok(await settings.getByRole("slider", { name: "设置中的音效音量" }).isVisible());
  assert.ok(await settings.getByRole("button", { name: /版本与更新.*v0\.3\.0/ }).isVisible());
  await capture("mobile-settings");
  await settings.getByRole("button", { name: "关闭设置" }).click();
  await setSyntheticHidden(false);

  const canvasState = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    layoutProfile: element.dataset.layoutProfile,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  assert.equal(canvasState.layoutProfile, "compact");
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResponses, []);

  console.log(JSON.stringify({
    preparation: {
      round: preparation.round,
      boardCount: preparation.player.boardCount,
      gold: preparation.player.gold,
    },
    battle: {
      beforeBackground: beforeBackground.battle.elapsed,
      duringBackground: duringBackground.battle.elapsed,
      pausedAt: duringPause.battle.elapsed,
    },
    canvas: canvasState,
    screenshotMetrics,
    errors,
    failedResponses,
  }, null, 2));

  await browser.close();
  browser = null;
})().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close();
  process.exitCode = 1;
});
