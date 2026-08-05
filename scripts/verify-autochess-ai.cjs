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
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Screenshot is not a PNG");
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
      assert.equal(chunk[8], 8, "Unsupported PNG bit depth");
      assert.equal(chunk[12], 0, "Interlaced PNG screenshots are unsupported");
      assert.ok(channels, "Unsupported PNG color type");
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
    assert.ok(filter <= 4, `Unsupported PNG filter ${filter}`);
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
const artifactDirectory = ".tmp/autochess/ai-v020";
mkdirSync(artifactDirectory, { recursive: true });

const finitePoint = (point) => point
  && Number.isFinite(point.x)
  && Number.isFinite(point.y);

let browser;

(async () => {
  const response = await fetch(pageUrl);
  assert.ok(response.ok, `Autochess URL did not respond before Chrome launch: ${response.status} ${pageUrl}`);

  browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.AUTOCHESS_HEADED !== "1",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const failedResponses = [];
  const portraitResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (pageResponse) => {
    const entry = { status: pageResponse.status(), url: pageResponse.url() };
    if (entry.status >= 400) failedResponses.push(entry);
    if (entry.url.includes("/images/autochess/portraits/")) portraitResponses.push(entry);
  });
  await page.addInitScript(() => {
    window.__riftCapturedConsole = [];
    const originalInfo = console.info.bind(console);
    console.info = (...args) => {
      const captured = args.map((value) => {
        if (value === undefined || value === null || typeof value !== "object") return value;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch {
          return String(value);
        }
      });
      window.__riftCapturedConsole.push(captured);
      if (window.__riftCapturedConsole.length > 1200) window.__riftCapturedConsole.shift();
      originalInfo(...args);
    };
  });

  const screenshotMetrics = {};
  const capture = async (name) => {
    const buffer = await page.screenshot({
      path: `${artifactDirectory}/${name}.png`,
      fullPage: true,
    });
    screenshotMetrics[name] = inspectPng(buffer);
  };
  const state = () => page.evaluate(() => window.autoChessAI.state());
  const callAI = (method, ...args) => page.evaluate(
    ({ methodName, methodArgs }) => window.autoChessAI[methodName](...methodArgs),
    { methodName: method, methodArgs: args },
  );
  const capturedConsole = () => page.evaluate(() => window.__riftCapturedConsole);

  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    typeof window.render_game_to_text === "function"
      && typeof window.advanceTime === "function"
      && Boolean(window.autoChessAI)
  ));
  await page.waitForTimeout(600);

  const help = await callAI("help");
  assert.equal(help.version, "0.2.0");
  assert.ok(help.flow.includes("skipBattle()"));
  assert.ok(help.testing.includes("consoleLogging(enabled)"));
  assert.equal((await state()).version, "0.2.0");
  console.log("[ai-verify] API ready");

  await page.keyboard.press("v");
  const releaseDialog = page.getByRole("dialog", { name: /v0\.2\.0/ });
  await releaseDialog.waitFor({ state: "visible" });
  assert.match(await releaseDialog.innerText(), /AI 操作与观测/);
  assert.match(await releaseDialog.innerText(), /棋子形象/);
  await capture("release-notes");
  await page.keyboard.press("Escape");
  await releaseDialog.waitFor({ state: "hidden" });
  console.log("[ai-verify] keyboard release dialog verified");

  await page.getByRole("button", { name: /v0\.2\.0/ }).click();
  await releaseDialog.waitFor({ state: "visible" });
  await page.locator(".rift-release-dismiss").click({ position: { x: 12, y: 54 } });
  await releaseDialog.waitFor({ state: "hidden" });
  console.log("[ai-verify] toolbar/backdrop release dialog verified");

  const titleState = await state();
  assert.equal(titleState.phase, "title");
  const generatedStarterIndex = titleState.starterChoices.findIndex((choice) => (
    choice.id === "bastion" || choice.id === "dance_start"
  ));
  const starterIndex = generatedStarterIndex >= 0 ? generatedStarterIndex : 0;
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press(String(starterIndex + 1));
  await page.waitForFunction(() => window.autoChessAI.state().phase === "preparation");
  console.log("[ai-verify] keyboard starter verified");

  const preparationBeforeReroll = await state();
  assert.equal(preparationBeforeReroll.starterHistory.length, 1, "Keyboard starter choice was not recorded");
  assert.ok(
    preparationBeforeReroll.wave.units.some((unit) => unit.id === "sun_guard"),
    "Round-one preview must expose the generated sun-guard portrait",
  );

  const reroll = await callAI("reroll");
  assert.equal(reroll.ok, true);
  assert.match(reroll.message, /rerolled shop/);
  const afterReroll = await state();
  assert.equal(afterReroll.shop.length, 5);
  const consoleAfterReroll = await capturedConsole();
  const shopConsole = [...consoleAfterReroll].reverse().find(([tag]) => tag === "[RiftLine][shop]");
  assert.ok(shopConsole, "Reroll did not emit a structured shop console entry");
  assert.deepEqual(
    shopConsole[1].map((unit) => unit.name),
    afterReroll.shop.map((unit) => unit.name),
    "Console shop names differ from render_game_to_text",
  );
  assert.ok(
    consoleAfterReroll.some(([tag, payload]) => tag === "[RiftLine][feedback]" && /刷新/.test(payload.text)),
    "Reroll toast was not mirrored to the console",
  );
  console.log("[ai-verify] console reroll and feedback verified");

  const buyResults = [];
  for (let purchase = 0; purchase < 2; purchase += 1) {
    const current = await state();
    const affordable = current.shop
      .filter((unit) => unit.cost <= current.player.gold)
      .sort((left, right) => left.cost - right.cost || left.index - right.index)[0];
    assert.ok(affordable, `No affordable unit for purchase ${purchase + 1}`);
    const beforeCopies = [...current.board, ...current.bench]
      .reduce((total, unit) => total + (unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9), 0);
    const result = await callAI("buy", affordable.index + 1);
    assert.equal(result.ok, true);
    const next = await state();
    const afterCopies = [...next.board, ...next.bench]
      .reduce((total, unit) => total + (unit.star === 1 ? 1 : unit.star === 2 ? 3 : 9), 0);
    assert.equal(afterCopies, beforeCopies + 1, "Console purchase did not add one unit copy");
    buyResults.push({ slot: affordable.index + 1, name: affordable.name, cost: affordable.cost });
  }

  const beforeMove = await state();
  const moveSource = beforeMove.board[0];
  const emptyBenchSlot = Array.from({ length: 8 }, (_, index) => index)
    .find((index) => !beforeMove.bench.some((unit) => unit.index === index));
  assert.ok(moveSource && emptyBenchSlot !== undefined, "No formation slots available for API movement test");
  const movedToBench = await callAI("move", "board", moveSource.index + 1, "bench", emptyBenchSlot + 1);
  assert.equal(movedToBench.ok, true);
  const benchState = await state();
  assert.ok(benchState.bench.some((unit) => unit.index === emptyBenchSlot && unit.id === moveSource.id));
  const movedBack = await callAI("move", "bench", emptyBenchSlot + 1, "board", moveSource.index + 1);
  assert.equal(movedBack.ok, true);
  const restoredFormation = await state();
  assert.ok(restoredFormation.board.some((unit) => unit.index === moveSource.index && unit.id === moveSource.id));
  assert.equal(restoredFormation.player.boardCount, 3);
  console.log("[ai-verify] console purchase and movement verified");

  await page.waitForTimeout(350);
  await capture("preparation-generated-portraits");

  const started = await callAI("battle");
  assert.equal(started.ok, true);
  assert.equal((await state()).phase, "battle");
  await callAI("advance", 1400);
  const battleState = await state();
  assert.equal(battleState.phase, "battle");
  assert.ok(battleState.battle.playerUnits.length > 0 && battleState.battle.enemyUnits.length > 0);
  await capture("battle-ai-control");
  console.log("[ai-verify] battle start verified");

  const skipped = await callAI("skipBattle");
  assert.equal(skipped.skipped, true, skipped.reason);
  assert.equal(skipped.state.phase, "result");
  assert.ok(skipped.steps > 0 && skipped.simulatedSeconds > 0);
  const resultState = await state();
  assert.equal(resultState.phase, "result");
  await page.waitForTimeout(180);
  await capture("result-after-skip");
  console.log("[ai-verify] deterministic battle skip verified");

  const battleLog = await callAI("logs", 320);
  assert.ok(battleLog.length > 0 && battleLog.every((event) => Number.isFinite(event.time)));
  const targetEvent = battleLog.find((event) => event.type === "target" && event.source && event.target && finitePoint(event.direction));
  const abilityEvent = battleLog.find((event) => event.type === "ability" && event.source && event.ability && finitePoint(event.direction));
  const projectileEvent = battleLog.find((event) => (
    event.type === "projectile"
      && event.source
      && event.target
      && event.projectile
      && event.amount > 0
      && event.damageKind
      && finitePoint(event.direction)
      && finitePoint(event.impact)
  ));
  const damageEvent = battleLog.find((event) => (
    (event.type === "damage" || event.type === "projectile")
      && event.source
      && event.target
      && event.amount > 0
      && event.damageKind
      && finitePoint(event.impact)
  ));
  assert.ok(targetEvent, "Battle log lacks a structured target lock/change event");
  assert.ok(abilityEvent, "Battle log lacks a structured ability cast with position and direction");
  assert.ok(projectileEvent, "Battle log lacks a structured projectile hit with impact and damage");
  assert.ok(damageEvent, "Battle log lacks structured damage details");
  assert.ok(battleLog.some((event) => event.type === "battle" && /快速结算指令/.test(event.message)));

  const finalConsole = await capturedConsole();
  const consoleBattleEvents = finalConsole
    .filter(([tag, event]) => typeof tag === "string" && tag.startsWith("[RiftLine][battle]") && event?.id)
    .map(([, event]) => event);
  const consoleEventIds = new Set(consoleBattleEvents.map((event) => event.id));
  [targetEvent, abilityEvent, projectileEvent, damageEvent].forEach((event) => {
    assert.ok(consoleEventIds.has(event.id), `Battle event ${event.id} was not mirrored to the console`);
  });

  assert.equal(errors.length, 0, `Console/page errors: ${JSON.stringify(errors, null, 2)}`);
  assert.equal(failedResponses.length, 0, `Failed responses: ${JSON.stringify(failedResponses, null, 2)}`);
  assert.ok(
    portraitResponses.some((entry) => entry.status === 200 && entry.url.endsWith("/sun-guard.png")),
    `Generated portrait did not load: ${JSON.stringify(portraitResponses, null, 2)}`,
  );

  const canvasInfo = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    profile: element.dataset.layoutProfile,
  }));
  const report = {
    url: pageUrl,
    version: help.version,
    keyboardStarter: preparationBeforeReroll.starterHistory[0].name,
    shopAfterReroll: afterReroll.shop.map((unit) => unit.name),
    bought: buyResults,
    skip: {
      steps: skipped.steps,
      simulatedSeconds: skipped.simulatedSeconds,
      won: resultState.result?.won,
    },
    logEvidence: {
      target: targetEvent,
      ability: abilityEvent,
      projectile: projectileEvent,
      damage: damageEvent,
      total: battleLog.length,
      consoleMirrored: consoleBattleEvents.length,
    },
    portraitResponses,
    canvas: canvasInfo,
    screenshots: screenshotMetrics,
    errors,
    failedResponses,
  };
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  browser = undefined;
})().catch(async (error) => {
  console.error(error);
  await browser?.close();
  process.exitCode = 1;
});
