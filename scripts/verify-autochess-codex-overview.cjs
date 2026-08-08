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
      // Try the next repository-known Playwright location.
    }
  }
  throw new Error("Unable to load Playwright");
};

const inspectPng = (buffer) => {
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
    }
    if (type === "IDAT") idat.push(chunk);
    if (type === "IEND") break;
    offset += length + 12;
  }
  if (!width || !height || !channels) throw new Error("Unsupported PNG screenshot");

  const rows = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let rowOffset = 0;
  let previous = Buffer.alloc(stride);
  let nearBlack = 0;
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
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      const red = row[pixel];
      const green = row[pixel + 1];
      const blue = row[pixel + 2];
      const alpha = channels === 4 ? row[pixel + 3] : 255;
      if (red <= 12 && green <= 12 && blue <= 12) nearBlack += 1;
      if (colors.size < 4096) colors.add(`${red},${green},${blue},${alpha}`);
    }
    previous = row;
    rowOffset += stride + 1;
  }
  const metrics = {
    width,
    height,
    colors: colors.size,
    nearBlackRatio: Number((nearBlack / (width * height)).toFixed(4)),
  };
  if (metrics.colors <= 1 || metrics.nearBlackRatio >= 0.97) {
    throw new Error(`Invalid screenshot: ${JSON.stringify(metrics)}`);
  }
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3000";
const artifactDirectory = ".tmp/autochess/codex-overview";
mkdirSync(artifactDirectory, { recursive: true });
let browser;

(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  const failedResponses = [];
  const screenshots = {};

  const preparePage = async (viewport) => {
    console.log(`prepare ${viewport.width}x${viewport.height}: create`);
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(15000);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push({
        text: message.text(),
        url: message.location().url,
      });
    });
    page.on("pageerror", (error) => errors.push({ text: error.message, url: page.url() }));
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
    });
    const response = await page.goto(`${baseUrl}/game/autochess?seed=401`, { waitUntil: "domcontentloaded" });
    console.log(`prepare ${viewport.width}x${viewport.height}: loaded`);
    if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    if (viewport.width <= 600) await page.keyboard.press("c");
    else await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
    console.log(`prepare ${viewport.width}x${viewport.height}: codex opened`);
    const dialog = page.getByRole("dialog", { name: "裂隙阵线图鉴" });
    await dialog.waitFor();
    const overviewButton = dialog.getByRole("button", { name: "概览", exact: true });
    if (await overviewButton.getAttribute("aria-pressed") !== "true") {
      throw new Error("The codex did not open on the overview tab");
    }
    const overview = dialog.getByRole("region", { name: "棋子费用概览" });
    await overview.waitFor();
    const rows = overview.locator(":scope > div");
    for (let index = 0; index < await rows.count(); index += 1) {
      const row = rows.nth(index);
      await row.scrollIntoViewIfNeeded();
      await row.locator("button").last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
      await row.locator("button").first().scrollIntoViewIfNeeded();
    }
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('section[aria-label="棋子费用概览"] img')];
      return images.length === 41 && images.every((image) => image.complete && image.naturalWidth > 0);
    });
    await rows.first().scrollIntoViewIfNeeded();
    console.log(`prepare ${viewport.width}x${viewport.height}: overview ready`);
    return { page, dialog };
  };

  const capture = async (page, name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, bytes: buffer.length, ...inspectPng(buffer) };
  };

  const desktop = await preparePage({ width: 1440, height: 900 });
  const desktopSummary = await desktop.dialog.evaluate((dialog) => {
    const overview = dialog.querySelector('section[aria-label="棋子费用概览"]');
    const rows = overview ? [...overview.children] : [];
    const images = overview ? [...overview.querySelectorAll("img")] : [];
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    return {
      rowCount: rows.length,
      unitCount: overview?.querySelectorAll("button").length || 0,
      tierCounts: rows.map((row) => row.querySelectorAll("button").length),
      imagesLoaded: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      dialogFitsViewport: dialog.scrollWidth <= dialog.clientWidth,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      state: JSON.parse(window.render_game_to_text()).phase,
    };
  });
  if (desktopSummary.rowCount !== 5 || desktopSummary.unitCount !== 41) {
    throw new Error(`Unexpected overview roster: ${JSON.stringify(desktopSummary)}`);
  }
  if (desktopSummary.imagesLoaded !== 41 || !desktopSummary.dialogFitsViewport || !desktopSummary.canvas) {
    throw new Error(`Overview assets or layout failed: ${JSON.stringify(desktopSummary)}`);
  }
  await capture(desktop.page, "desktop-overview");
  console.log("desktop overview captured");

  await desktop.dialog.getByRole("button", { name: "查看七海大鲨鱼详情" }).click();
  const details = await desktop.dialog.locator("aside").innerText();
  if (!details.includes("七海大鲨鱼") || !details.includes("5 费")) {
    throw new Error(`Overview did not open the expected unit: ${details}`);
  }
  const desktopUnitList = desktop.dialog.locator("[data-codex-unit-list]");
  const desktopUnitDetails = desktop.dialog.locator("[data-codex-unit-details]");
  const independentScrollSummary = await desktop.dialog.evaluate((dialog) => {
    const list = dialog.querySelector("[data-codex-unit-list]");
    const detailsPanel = dialog.querySelector("[data-codex-unit-details]");
    list.scrollTop = list.scrollHeight;
    const detailsAfterListScroll = detailsPanel.scrollTop;
    detailsPanel.scrollTop = detailsPanel.scrollHeight;
    return {
      listScrollable: list.scrollHeight > list.clientHeight,
      detailsScrollable: detailsPanel.scrollHeight > detailsPanel.clientHeight,
      listAfterScroll: list.scrollTop,
      detailsAfterListScroll,
      detailsAfterScroll: detailsPanel.scrollTop,
    };
  });
  if (
    !independentScrollSummary.listScrollable
    || !independentScrollSummary.detailsScrollable
    || independentScrollSummary.listAfterScroll <= 0
    || independentScrollSummary.detailsAfterListScroll !== 0
    || independentScrollSummary.detailsAfterScroll <= 0
  ) {
    throw new Error(`Independent desktop scrolling failed: ${JSON.stringify(independentScrollSummary)}`);
  }
  await desktopUnitList.locator("button").last().click();
  await desktop.page.waitForFunction(() => (
    document.querySelector("[data-codex-unit-details]")?.scrollTop === 0
  ));
  const listScrollAfterSelection = await desktopUnitList.evaluate((list) => list.scrollTop);
  if (listScrollAfterSelection <= 0) throw new Error("Selecting a unit unexpectedly reset the roster scroll");
  await capture(desktop.page, "desktop-independent-scroll");

  const desktopDetailImage = desktopUnitDetails.locator(".ant-image");
  await desktopDetailImage.hover();
  await desktopDetailImage.locator(".ant-image-mask").click();
  const desktopPreviewRoot = desktop.page.locator(".ant-image-preview-root");
  const desktopPreview = desktop.page.locator(".ant-image-preview-wrap");
  await desktopPreview.waitFor();
  await desktop.page.waitForTimeout(450);
  const desktopPreviewSummary = await desktopPreviewRoot.evaluate((preview) => {
    const image = preview.querySelector("img");
    const bounds = image?.getBoundingClientRect();
    return {
      imageLoaded: Boolean(image?.naturalWidth),
      naturalWidth: image?.naturalWidth || 0,
      displayedWidth: Math.round(bounds?.width || 0),
      displayedHeight: Math.round(bounds?.height || 0),
    };
  });
  if (!desktopPreviewSummary.imageLoaded || desktopPreviewSummary.displayedWidth < 300) {
    throw new Error(`Desktop image preview failed: ${JSON.stringify(desktopPreviewSummary)}`);
  }
  await capture(desktop.page, "desktop-detail-preview");
  await desktop.page.keyboard.press("Escape");
  await desktopPreview.waitFor({ state: "hidden" });
  if (!await desktop.dialog.isVisible()) throw new Error("Escape closed the codex together with the image preview");
  await desktop.dialog.getByRole("button", { name: "1 费", exact: true }).click();
  const filteredList = await desktop.dialog.locator("section").first().evaluate((section) => {
    const cards = [...section.querySelectorAll("button")].filter((button) => button.querySelector("strong"));
    return {
      cards: cards.length,
      portraits: cards.filter((card) => card.querySelector("img")?.naturalWidth > 0).length,
    };
  });
  if (!filteredList.cards || filteredList.cards !== filteredList.portraits) {
    throw new Error(`Filtered unit portraits failed: ${JSON.stringify(filteredList)}`);
  }
  await capture(desktop.page, "desktop-one-cost-list");
  console.log("desktop list captured");

  const mobile = await preparePage({ width: 390, height: 844 });
  const mobileSummary = await mobile.dialog.evaluate((dialog) => {
    const overview = dialog.querySelector('section[aria-label="棋子费用概览"]');
    const strips = overview ? [...overview.children].map((row) => row.lastElementChild) : [];
    return {
      unitCount: overview?.querySelectorAll("button").length || 0,
      imagesLoaded: overview
        ? [...overview.querySelectorAll("img")].filter((image) => image.complete && image.naturalWidth > 0).length
        : 0,
      horizontalStrips: strips.filter((strip) => strip && strip.scrollWidth > strip.clientWidth).length,
      dialogFitsViewport: dialog.scrollWidth <= dialog.clientWidth,
    };
  });
  if (
    mobileSummary.unitCount !== 41
    || mobileSummary.imagesLoaded !== 41
    || mobileSummary.horizontalStrips !== 5
    || !mobileSummary.dialogFitsViewport
  ) {
    throw new Error(`Mobile overview failed: ${JSON.stringify(mobileSummary)}`);
  }
  await capture(mobile.page, "mobile-overview");
  console.log("mobile overview captured");

  await mobile.dialog.getByRole("button", { name: "查看兔子射手详情" }).click();
  const mobileDetailImage = mobile.dialog.locator("aside .ant-image");
  await mobileDetailImage.scrollIntoViewIfNeeded();
  await mobileDetailImage.hover();
  await mobileDetailImage.locator(".ant-image-mask").click();
  const mobilePreview = mobile.page.locator(".ant-image-preview-wrap");
  await mobilePreview.waitFor();
  await mobile.page.waitForTimeout(450);
  const mobilePreviewLoaded = await mobilePreview.locator("img").evaluate((image) => (
    image.complete && image.naturalWidth > 0
  ));
  if (!mobilePreviewLoaded) throw new Error("Mobile image preview did not load");
  await capture(mobile.page, "mobile-detail-preview");

  await desktop.dialog.getByRole("button", { name: "关闭 Esc" }).click();
  await desktop.page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  const reopenedOverview = desktop.page.getByRole("dialog", { name: "裂隙阵线图鉴" })
    .getByRole("region", { name: "棋子费用概览" });
  await reopenedOverview.waitFor();
  const reopenedOnOverview = await desktop.page.getByRole("dialog", { name: "裂隙阵线图鉴" })
    .getByRole("button", { name: "概览", exact: true })
    .getAttribute("aria-pressed") === "true";
  if (!reopenedOnOverview) throw new Error("Reopening the codex did not reset to the overview tab");

  await desktop.page.close();
  await mobile.page.close();
  await browser.close();
  const ignoredLocalAsset = (url) => url.endsWith("/api/record") || url.endsWith("/favicon.ico");
  const unexpectedErrors = errors.filter((error) => !ignoredLocalAsset(error.url));
  const unexpectedResponses = failedResponses.filter((response) => !ignoredLocalAsset(response.url));
  if (unexpectedErrors.length || unexpectedResponses.length) {
    throw new Error(JSON.stringify({ errors: unexpectedErrors, failedResponses: unexpectedResponses }, null, 2));
  }
  console.log(JSON.stringify({
    desktopSummary,
    independentScrollSummary,
    listScrollAfterSelection,
    desktopPreviewSummary,
    filteredList,
    mobileSummary,
    mobilePreviewLoaded,
    reopenedOnOverview,
    screenshots,
  }, null, 2));
})().catch(async (error) => {
  console.error(error);
  await browser?.close().catch(() => {});
  process.exitCode = 1;
});
