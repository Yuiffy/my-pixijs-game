const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

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
      if (candidate.includes("/") || candidate.includes("\\")) {
        if (!existsSync(candidate)) continue;
        return localRequire(candidate);
      }
      return localRequire(candidate);
    } catch {
      // Continue with the next known installation.
    }
  }
  throw new Error("Unable to load playwright; install it or set PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const artifactDirectory = ".tmp/autochess";
const expectedVersions = ["0.4.1", "0.4.0", "0.3.0", "0.2.3", "0.2.2", "0.2.1", "0.2.0", "0.1.0"];

const getScrollerMetrics = (element) => {
  const rect = element.getBoundingClientRect();
  return {
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    top: rect.top,
    bottom: rect.bottom,
  };
};

const isEntryVisibleInScroller = (entry) => {
  const scroller = entry.closest(".rift-release-notes");
  if (!scroller) return false;
  const scrollerRect = scroller.getBoundingClientRect();
  const entryRect = entry.getBoundingClientRect();
  return entryRect.top >= scrollerRect.top && entryRect.bottom <= scrollerRect.bottom;
};

mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  await page.goto(`${process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100"}/game/autochess?seed=1`);
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.keyboard.press("v");

  const releaseDialog = page.getByRole("dialog", { name: /版本与更新/ });
  await releaseDialog.waitFor({ state: "visible" });
  const releaseNotes = releaseDialog;
  const entries = releaseDialog.locator(".rift-release-entry");
  const dialogText = await releaseDialog.innerText();
  for (const version of expectedVersions) {
    if (!dialogText.includes(`v${version}`)) throw new Error(`Missing release v${version}`);
  }
  if (await entries.count() !== expectedVersions.length) {
    throw new Error(`Expected ${expectedVersions.length} release entries`);
  }

  const desktopTop = await releaseNotes.evaluate(getScrollerMetrics);
  if (desktopTop.scrollHeight <= desktopTop.clientHeight) throw new Error("Release dialog is not scrollable on desktop");
  if (!await entries.first().evaluate(isEntryVisibleInScroller)) throw new Error("Latest release is not visible at the top");
  const desktopTopScreenshot = inspectPng(await page.screenshot({ path: `${artifactDirectory}/release-notes-desktop-top.png` }));

  await releaseNotes.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(80);
  if (!await entries.last().evaluate(isEntryVisibleInScroller)) throw new Error("Oldest release is not visible after desktop scroll");
  const desktopBottom = await releaseNotes.evaluate(getScrollerMetrics);
  const desktopBottomScreenshot = inspectPng(await page.screenshot({ path: `${artifactDirectory}/release-notes-desktop-bottom.png` }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const mobileLayout = await page.evaluate(() => {
    const notes = document.querySelector(".rift-release-notes");
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      notes: notes ? {
        clientWidth: notes.clientWidth,
        scrollWidth: notes.scrollWidth,
        clientHeight: notes.clientHeight,
        scrollHeight: notes.scrollHeight,
      } : null,
      canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null,
    };
  });
  if (!mobileLayout.notes) throw new Error("Release dialog disappeared on mobile");
  if (mobileLayout.documentOverflow > 1 || mobileLayout.notes.scrollWidth > mobileLayout.notes.clientWidth + 1) {
    throw new Error(`Mobile release dialog overflows horizontally: ${JSON.stringify(mobileLayout)}`);
  }
  await releaseNotes.evaluate((element) => { element.scrollTop = 0; });
  await page.waitForTimeout(50);
  if (!await entries.first().evaluate(isEntryVisibleInScroller)) throw new Error("Latest release is not visible on mobile");
  const mobileTopScreenshot = inspectPng(await page.screenshot({ path: `${artifactDirectory}/release-notes-mobile-top.png` }));
  await releaseNotes.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(80);
  if (!await entries.last().evaluate(isEntryVisibleInScroller)) throw new Error("Oldest release is not visible after mobile scroll");
  const mobileBottomScreenshot = inspectPng(await page.screenshot({ path: `${artifactDirectory}/release-notes-mobile-bottom.png` }));

  if (errors.length) throw new Error(`Browser console errors: ${JSON.stringify(errors)}`);
  if (failedResponses.length) throw new Error(`Failed page requests: ${JSON.stringify(failedResponses)}`);
  console.log(JSON.stringify({
    versions: expectedVersions,
    desktop: { top: desktopTop, bottom: desktopBottom, screenshots: { top: desktopTopScreenshot, bottom: desktopBottomScreenshot } },
    mobile: { layout: mobileLayout, screenshots: { top: mobileTopScreenshot, bottom: mobileBottomScreenshot } },
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
