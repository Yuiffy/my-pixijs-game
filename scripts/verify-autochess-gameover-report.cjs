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
        row[x] = (row[x] + (leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft)) & 255;
      }
      if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`);
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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/gameover-report";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=88`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => Boolean(window.autoChessAI && window.render_game_to_text));

  const setup = await page.evaluate(() => {
    const bridge = window.autoChessAI.bridge;
    const engine = bridge.engine;
    bridge.dispatch({ type: "starter", id: engine.state.starterChoices[0] });
    const lineup = [
      "grove_mender",
      "zeyin",
      "xuehui",
      "shiori",
      "yukisyo",
      "rei",
      "lian",
      "yua",
      "spark_mage",
    ];
    const slots = [0, 3, 6, 9, 12, 15, 18, 21, 23];
    const stars = [3, 2, 2, 2, 3, 2, 2, 2, 3];
    engine.state.board.fill(null);
    lineup.forEach((id, index) => {
      engine.state.board[slots[index]] = { uid: 8000 + index, id, star: stars[index] };
    });
    engine.state.playerLevel = 9;
    engine.state.round = 23;
    engine.state.hp = 1;
    engine.state.maxHp = 20;
    engine.state.score = 67_890;
    engine.state.victories = 18;
    engine.state.runStats = {};
    lineup.forEach((unitId, index) => {
      const battles = 4 + index * 2;
      engine.state.runStats[unitId] = {
        unitId,
        maxStar: stars[index],
        battles,
        damageDealt: battles * (19_500 - index * 1_120),
        healingDone: battles * (index % 3 === 1 ? 3_800 + index * 220 : 180 + index * 35),
        shieldingDone: battles * (index % 3 === 1 ? 2_600 + index * 170 : 120 + index * 24),
        damageTaken: battles * (16_800 - index * 980),
      };
    });

    const traits = engine.getActiveTraits().map((trait) => trait.name);
    bridge.dispatch({ type: "battle" });
    const battle = engine.state.battle;
    if (!battle || battle.player.length !== lineup.length) throw new Error("Final battle did not use the prepared lineup");
    battle.player.forEach((fighter, index) => {
      fighter.damageDealt = 4_000 + index * 700;
      fighter.healingDone = index % 3 === 1 ? 1_200 + index * 90 : 0;
      fighter.shieldingDone = index % 3 === 1 ? 900 + index * 70 : 0;
      fighter.damageTaken = 2_800 + (lineup.length - index) * 480;
      fighter.hp = 0;
      fighter.alive = false;
    });
    bridge.advance(50);
    if (engine.state.phase !== "result" || engine.state.hp !== 0) throw new Error("Prepared final loss did not reach result");
    bridge.dispatch({ type: "resultContinue" });
    if (engine.state.phase !== "gameover") throw new Error("Final result did not reach gameover");
    return { lineup, traits };
  });

  await page.waitForFunction(() => document.querySelector(".rift-final-report")?.textContent?.includes("战线已失守"));
  await page.waitForFunction(() => document.querySelector(".rift-final-footer a")?.textContent?.includes("/game/autochess"));

  const inspectLayout = async () => page.evaluate(() => {
    const report = document.querySelector(".rift-final-report");
    const layer = document.querySelector(".rift-dom-modal-phase");
    const rect = report?.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      report: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
      reportScrollWidth: report?.scrollWidth,
      reportClientWidth: report?.clientWidth,
      layerScrollHeight: layer?.scrollHeight,
      layerClientHeight: layer?.clientHeight,
      lineupCount: document.querySelectorAll(".rift-final-lineup article").length,
      traitCount: document.querySelectorAll(".rift-final-traits > div > span").length,
      rankingGroups: document.querySelectorAll(".rift-final-ranking").length,
      rankingRows: Array.from(document.querySelectorAll(".rift-final-ranking")).map((group) => group.querySelectorAll("article").length),
      url: document.querySelector(".rift-final-footer a")?.textContent,
      reportText: report?.textContent,
      coreInHeader: Boolean(document.querySelector(".rift-header-core")),
    };
  });

  const validateLayout = (layout, mobile = false) => {
    if (!layout.report || layout.report.x < -1 || layout.report.width > layout.viewport.width + 1) {
      throw new Error(`Report overflowed horizontally: ${JSON.stringify(layout)}`);
    }
    if (layout.reportScrollWidth > layout.reportClientWidth + 1) throw new Error(`Report content overflowed: ${JSON.stringify(layout)}`);
    if (layout.lineupCount !== 9 || layout.traitCount < 2 || layout.rankingGroups !== 3) {
      throw new Error(`Report sections are incomplete: ${JSON.stringify(layout)}`);
    }
    if (layout.rankingRows.some((count) => count !== 3)) throw new Error(`A top-three ranking is incomplete: ${JSON.stringify(layout)}`);
    if (!layout.reportText.includes("第 23 战") || !layout.reportText.includes("场均治疗 / 护盾")) {
      throw new Error(`Required report text is missing: ${JSON.stringify(layout)}`);
    }
    if (layout.coreInHeader || layout.reportText.includes("核心 0")) throw new Error("Terminal report still shows redundant core HP");
    if (mobile && layout.report.bottom > layout.viewport.height + 1) {
      throw new Error(`Mobile report does not fit the initial screenshot: ${JSON.stringify(layout)}`);
    }
  };

  const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (textState.phase !== "gameover" || textState.round !== 23 || textState.runStats.length !== 9) {
    throw new Error(`Terminal text state is incomplete: ${JSON.stringify(textState)}`);
  }
  if (textState.runStats.some((stats) => !stats.battles || !Number.isFinite(stats.perBattle.damageDealt))) {
    throw new Error(`Per-battle text stats are invalid: ${JSON.stringify(textState.runStats)}`);
  }

  const desktop = await inspectLayout();
  validateLayout(desktop);
  const desktopPath = `${artifactDirectory}/gameover-report-desktop.png`;
  const desktopBuffer = await page.screenshot({ path: desktopPath, fullPage: true });
  const desktopPng = inspectPng(desktopBuffer);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobile = await inspectLayout();
  validateLayout(mobile, true);
  const mobilePath = `${artifactDirectory}/gameover-report-mobile.png`;
  const mobileBuffer = await page.screenshot({ path: mobilePath, fullPage: true });
  const mobilePng = inspectPng(mobileBuffer);

  if (errors.length || failedResponses.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ errors, failedResponses })}`);
  }

  console.log(JSON.stringify({
    setup,
    desktop,
    mobile,
    textState: {
      phase: textState.phase,
      round: textState.round,
      score: textState.player.score,
      runStats: textState.runStats,
      activeTraits: textState.activeTraits.map((trait) => trait.name),
    },
    screenshots: {
      desktop: { path: desktopPath, ...desktopPng },
      mobile: { path: mobilePath, ...mobilePng },
    },
    errors,
    failedResponses,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
