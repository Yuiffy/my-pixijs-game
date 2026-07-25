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
const artifactDirectory = ".tmp/autochess/progression";
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
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=31`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");

  const attached = await page.evaluate(() => {
    const target = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement;
    const fiberKey = target && Object.keys(target).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? target[fiberKey] : null;
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
  if (!attached) throw new Error("Unable to locate EngineBridge through React");

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    bridge.dispatch({ type: "starter", id: bridge.engine.state.starterChoices[0] });
  });

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const forcePreparation = async (round, finance = false) => {
    await page.evaluate(({ targetRound, enableFinance }) => {
      const bridge = window.__codexAutoChessBridge;
      const engine = bridge.engine;
      engine.state.round = targetRound;
      engine.state.phase = "preparation";
      engine.state.battle = null;
      engine.state.result = null;
      engine.state.selected = null;
      if (enableFinance) {
        engine.state.playerLevel = 6;
        engine.state.gold = 100;
        engine.state.board.fill(null);
        ["sui_blue", "sui_flower", "shiori", "grove_mender"].forEach((id, index) => {
          engine.state.board[index] = { uid: 900 + index, id, star: 1 };
        });
      }
      bridge.dispatch({ type: "clearSelection" });
    }, { targetRound: round, enableFinance: finance });
    await page.waitForFunction(
      (targetRound) => JSON.parse(window.render_game_to_text()).round === targetRound,
      round,
    );
    await page.waitForTimeout(120);
  };
  const capture = async (name) => {
    const path = `${artifactDirectory}/${name}.png`;
    const buffer = await page.screenshot({ path, fullPage: true });
    screenshots[name] = { path, bytes: buffer.length, ...inspectPng(buffer) };
  };

  await forcePreparation(4);
  const elite = await readState();
  if (
    elite.wave.tag !== "elite"
    || elite.progressionMode !== "campaign"
    || !elite.wave.description.includes("精英预警")
    || !elite.wave.enemyTraits.length
  ) {
    throw new Error(`Elite warning is incomplete: ${JSON.stringify(elite)}`);
  }
  await capture("round-04-elite-warning");

  await forcePreparation(17);
  const endless = await readState();
  const endlessHeader = await page.locator(".rift-dom-header").innerText();
  if (endless.progressionMode !== "endless" || endless.wave.enemyBudget !== 135 || !endless.wave.enemyTraits.length || !endlessHeader.includes("普通无限")) {
    throw new Error(`Normal endless state is incomplete: ${JSON.stringify({ endless, endlessHeader })}`);
  }
  await capture("round-17-normal-endless");

  await forcePreparation(32, true);
  const hell = await readState();
  const hellHeader = await page.locator(".rift-dom-header").innerText();
  if (
    hell.progressionMode !== "hell"
    || hell.wave.enemyBudget !== 666
    || !hell.wave.enemyTraits.length
    || hell.player.interestIncome !== 20
    || !hellHeader.includes("地狱无限")
  ) {
    throw new Error(`Hell endless state is incomplete: ${JSON.stringify({ hell, hellHeader })}`);
  }
  const interest = page.locator(".rift-dom-shop-desktop .rift-interest-info");
  await interest.hover();
  const interestText = await interest.locator('[role="tooltip"]').innerText();
  if (!interestText.includes("最多 20 利息") || !interestText.includes("80 金币封顶")) {
    throw new Error(`Finance cap tooltip is incomplete: ${interestText}`);
  }
  await capture("round-32-hell-finance-cap");

  await page.getByRole("button", { name: "图鉴 / 本局天赋" }).click();
  const dialog = page.getByRole("dialog", { name: "裂隙阵线图鉴" });
  await dialog.getByRole("button", { name: "玩法说明" }).click();
  const rulesText = await dialog.innerText();
  for (const expected of ["第 17—31 战", "20 利息", "连胜与赏金全部复投", "80 金"]) {
    if (!rulesText.includes(expected)) throw new Error(`Rules are missing ${expected}`);
  }
  await capture("progression-rules");

  const desktopCanvas = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    layoutProfile: element.dataset.layoutProfile,
  }));
  await dialog.getByRole("button", { name: "关闭 Esc" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await forcePreparation(4);
  const mobileBrief = page.locator(".rift-mobile-brief");
  const mobileBriefText = await mobileBrief.innerText();
  const mobileBriefBox = await mobileBrief.boundingBox();
  const mobileActionsBox = await page.locator(".rift-dom-mobile-actions").boundingBox();
  if (
    !mobileBriefText.includes("ELITE WARNING")
    || !mobileBriefBox
    || !mobileActionsBox
    || mobileBriefBox.y + mobileBriefBox.height >= mobileActionsBox.y
  ) {
    throw new Error(`Mobile elite warning layout is invalid: ${JSON.stringify({ mobileBriefText, mobileBriefBox, mobileActionsBox })}`);
  }
  await capture("round-04-elite-warning-mobile");
  const mobileCanvas = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    layoutProfile: element.dataset.layoutProfile,
  }));
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  if (failedResponses.length) throw new Error(`Failed responses: ${JSON.stringify(failedResponses)}`);

  console.log(JSON.stringify({
    elite: { round: elite.round, tag: elite.wave.tag, budget: elite.wave.enemyBudget },
    endless: { round: endless.round, mode: endless.progressionMode, budget: endless.wave.enemyBudget },
    hell: { round: hell.round, mode: hell.progressionMode, budget: hell.wave.enemyBudget, interest: hell.player.interestIncome },
    interestText,
    canvas: { desktop: desktopCanvas, mobile: mobileCanvas },
    screenshots,
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
