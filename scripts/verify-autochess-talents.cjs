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
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error("Unsupported PNG encoding");
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`Unsupported PNG color type ${chunk[9]}`);
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
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`);
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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/talents";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  const screenshots = {};
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const attachBridge = async () => page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    const host = canvas?.parentElement;
    const fiberKey = host && Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? host[fiberKey] : null;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const current = hook.memoizedState?.current;
        if (current?.engine?.state && typeof current.dispatch === "function") {
          window.__codexAutoChessBridge = current;
          return true;
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
  const loadSeed = async (seed) => {
    const response = await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, {
      waitUntil: "domcontentloaded",
    });
    if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    if (!await attachBridge()) throw new Error("Unable to locate EngineBridge through React");
  };
  const forceAugmentRound = async (round) => page.evaluate((value) => {
    const bridge = window.__codexAutoChessBridge;
    const engine = bridge.engine;
    engine.state.round = value;
    engine.state.phase = "result";
    engine.state.battle = null;
    engine.state.result = {
      won: true,
      headline: "",
      detail: "",
      income: 0,
      bounty: 0,
      defeatedEnemies: 0,
      defeatedByStar: { 1: 0, 2: 0, 3: 0 },
      upgradeDiscount: 0,
      damage: 0,
    };
    bridge.dispatch({ type: "resultContinue" });
  }, round);
  const pointForLogical = async (x, y) => {
    const canvas = page.locator('[data-game-canvas="rift-line"]');
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
  const clickAugment = async (index, total = 3) => {
    const choiceWidth = total * 320 + Math.max(0, total - 1) * 30;
    const left = 560 - choiceWidth / 2 + index * 350;
    const point = await pointForLogical(left + 160, 516);
    await page.mouse.click(point.x, point.y);
  };
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, bytes: buffer.length, ...inspectPng(buffer) };
  };

  let selectedSeed = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    await loadSeed(seed);
    await page.evaluate(() => {
      const bridge = window.__codexAutoChessBridge;
      bridge.dispatch({ type: "starter", id: bridge.engine.state.starterChoices[0] });
    });
    await forceAugmentRound(2);
    await page.evaluate(() => window.__codexAutoChessBridge.dispatch({ type: "augment", index: 0 }));
    await forceAugmentRound(5);
    const state = await readState();
    if (state.augmentChoices.some((choice) => choice.id === "second_wind")) {
      selectedSeed = seed;
      break;
    }
  }
  if (!selectedSeed) throw new Error("No deterministic seed offered 德川家康 as a major talent");

  errors.length = 0;
  failedResponses.length = 0;
  await loadSeed(selectedSeed);
  const opening = await readState();
  if (opening.phase !== "title" || opening.starterChoices.length !== 3) {
    throw new Error(`Opening talent choices are invalid: ${JSON.stringify(opening)}`);
  }
  await capture("opening-talents");

  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  const dialog = page.getByRole("dialog", { name: "裂隙阵线图鉴" });
  await dialog.getByRole("button", { name: "开局 / 天赋" }).click();
  const codexText = await dialog.innerText();
  for (const expected of ["局中小天赋", "局中大天赋", "德川家康", "同档天赋拿完前不会重复"]) {
    if (!codexText.includes(expected)) throw new Error(`Codex is missing ${expected}`);
  }
  await capture("talent-codex");
  await dialog.getByText("局中大天赋", { exact: true }).scrollIntoViewIfNeeded();
  await capture("talent-codex-major");
  await dialog.getByText("全员护航", { exact: true }).evaluate((element) => {
    (element.closest("article") || element).scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(100);
  await capture("talent-codex-major-bottom");
  await dialog.getByRole("button", { name: "关闭 Esc" }).click();

  await forceAugmentRound(2);
  const minor = await readState();
  if (
    minor.phase !== "augment" ||
    minor.augmentChoices.length !== 3 ||
    minor.augmentChoices.some((choice) => choice.tier !== "minor" || choice.id === "second_wind")
  ) {
    throw new Error(`Round 2 did not offer balanced minor talents: ${JSON.stringify(minor.augmentChoices)}`);
  }
  await capture("minor-talents-round-2");
  await clickAugment(0, minor.augmentChoices.length);
  const afterMinor = await readState();
  if (afterMinor.phase !== "preparation" || afterMinor.augmentHistory.at(-1)?.tier !== "minor") {
    throw new Error(`Minor talent click did not resolve: ${JSON.stringify(afterMinor)}`);
  }

  await forceAugmentRound(5);
  const major = await readState();
  if (
    major.phase !== "augment" ||
    major.augmentChoices.length !== 3 ||
    major.augmentChoices.some((choice) => choice.tier !== "major") ||
    !major.augmentChoices.some((choice) => choice.id === "second_wind")
  ) {
    throw new Error(`Round 5 did not offer balanced major talents: ${JSON.stringify(major.augmentChoices)}`);
  }
  await capture("major-talents-round-5");
  const secondWindIndex = major.augmentChoices.findIndex((choice) => choice.id === "second_wind");
  await clickAugment(secondWindIndex, major.augmentChoices.length);
  const afterMajor = await readState();
  if (
    afterMajor.phase !== "preparation" ||
    afterMajor.augmentHistory.at(-1)?.name !== "德川家康" ||
    afterMajor.augmentHistory.at(-1)?.tier !== "major"
  ) {
    throw new Error(`Major talent click did not resolve: ${JSON.stringify(afterMajor)}`);
  }

  const minorIds = ["tempered", "sharp_edge", "momentum", "payday", "vitality", "precision"];
  await page.evaluate((ids) => {
    window.__codexAutoChessBridge.engine.state.augments = [...ids];
  }, minorIds);
  await forceAugmentRound(10);
  const repeated = await readState();
  if (
    repeated.phase !== "augment" ||
    repeated.augmentChoices.length !== 3 ||
    repeated.augmentChoices.some((choice) => choice.tier !== "minor" || !minorIds.includes(choice.id))
  ) {
    throw new Error(`Exhausted minor pool did not refill: ${JSON.stringify(repeated.augmentChoices)}`);
  }
  await capture("minor-talents-exhausted-refill");

  const canvas = await page.locator('[data-game-canvas="rift-line"]').evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    layoutProfile: element.dataset.layoutProfile,
  }));
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  if (failedResponses.length) throw new Error(`Failed responses: ${JSON.stringify(failedResponses)}`);

  console.log(JSON.stringify({
    selectedSeed,
    openingChoices: opening.starterChoices.map((choice) => choice.name),
    minorChoices: minor.augmentChoices.map((choice) => choice.name),
    majorChoices: major.augmentChoices.map((choice) => choice.name),
    selectedHistory: afterMajor.augmentHistory,
    exhaustedRefill: repeated.augmentChoices.map((choice) => choice.name),
    canvas,
    screenshots,
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
