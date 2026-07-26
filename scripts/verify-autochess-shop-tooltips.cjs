const assert = require("node:assert/strict");
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
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Screenshot is not a PNG");
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
      if (chunk[8] !== 8 || chunk[12] !== 0 || !channels) throw new Error("Unsupported PNG encoding");
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
  if (metrics.colors <= 1 || metrics.nearBlackRatio >= 0.97 || metrics.transparentRatio >= 0.97) {
    throw new Error(`Invalid screenshot: ${JSON.stringify(metrics)}`);
  }
  return metrics;
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3160";
const artifactDirectory = ".tmp/autochess/shop-tooltips";
mkdirSync(artifactDirectory, { recursive: true });

const attachBridge = async (page) => page.evaluate(() => {
  const host = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement;
  const fiberKey = host && Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
  let fiber = fiberKey ? host[fiberKey] : null;
  while (fiber) {
    let hook = fiber.memoizedState;
    while (hook) {
      const current = hook.memoizedState?.current;
      if (current?.engine?.state && typeof current.dispatch === "function") window.__codexAutoChessBridge = current;
      hook = hook.next;
    }
    fiber = fiber.return;
  }
  return Boolean(window.__codexAutoChessBridge);
});

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 2048, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  try {
    const response = await page.goto(`${baseUrl}/game/autochess?seed=1`, { waitUntil: "domcontentloaded" });
    assert.ok(response?.ok(), `Autochess URL returned ${response?.status()}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
    assert.equal(await attachBridge(page), true);
    await page.evaluate(() => {
      const bridge = window.__codexAutoChessBridge;
      bridge.engine.state.shop = ["rift_stalker", "sui", "rift_stalker", "clock_gunner", "rutice"];
    });
    await page.getByRole("button", { name: "锁定商店" }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shop.at(-1)?.id === "rutice");

    const cards = page.locator(".rift-dom-shop-desktop .rift-shop-card-wrap");
    assert.equal(await cards.count(), 5);
    const layouts = [];
    const screenshots = {};
    for (let index = 0; index < 5; index += 1) {
      const card = cards.nth(index);
      await card.hover();
      const layout = await page.evaluate((cardIndex) => {
        const wraps = [...document.querySelectorAll(".rift-dom-shop-desktop .rift-shop-card-wrap")];
        const wrap = wraps[cardIndex];
        const tooltip = wrap?.querySelector(".rift-shop-card-detail");
        const canvas = document.querySelector('[data-game-canvas="rift-line"]');
        if (!wrap || !tooltip || !(canvas instanceof HTMLCanvasElement)) return null;
        const cardBox = wrap.getBoundingClientRect();
        const tooltipBox = tooltip.getBoundingClientRect();
        const arrow = getComputedStyle(tooltip, "::after");
        return {
          viewport: { width: innerWidth, height: innerHeight },
          card: { top: cardBox.top, bottom: cardBox.bottom },
          tooltip: { top: tooltipBox.top, bottom: tooltipBox.bottom, height: tooltipBox.height },
          arrow: { top: arrow.top, bottom: arrow.bottom },
          canvas: {
            width: canvas.width,
            height: canvas.height,
            rect: canvas.getBoundingClientRect().toJSON(),
          },
          domOverflow: document.documentElement.scrollWidth - innerWidth,
          textState: JSON.parse(window.render_game_to_text()),
        };
      }, index);
      assert.ok(layout, `Missing tooltip layout for card ${index + 1}`);
      assert.ok(layout.tooltip.top >= 0, JSON.stringify(layout));
      assert.ok(layout.tooltip.bottom <= layout.viewport.height + 0.5, JSON.stringify(layout));
      assert.ok(layout.domOverflow <= 1, JSON.stringify(layout));
      if (index < 2) {
        assert.ok(Math.abs(layout.tooltip.top - (layout.card.top - 5)) <= 2, JSON.stringify(layout));
      } else {
        assert.ok(Math.abs(layout.tooltip.bottom - (layout.card.bottom + 5)) <= 2, JSON.stringify(layout));
        assert.equal(layout.arrow.bottom, "19px");
      }
      layouts.push(layout);
      if (index === 2 || index === 4) {
        const name = index === 2 ? "third-card-detail" : "fifth-card-detail";
        const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png`, fullPage: true });
        screenshots[name] = inspectPng(buffer);
      }
    }

    const state = layouts.at(-1).textState;
    assert.equal(state.phase, "preparation");
    assert.equal(state.shop.length, 5);
    assert.ok(layouts.at(-1).canvas.width > 0 && layouts.at(-1).canvas.height > 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResponses, []);
    console.log(JSON.stringify({ layouts, screenshots, errors, failedResponses }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
