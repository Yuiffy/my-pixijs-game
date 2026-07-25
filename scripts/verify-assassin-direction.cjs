const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");

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
      // Try the next known local Playwright installation.
    }
  }
  throw new Error("Unable to load Playwright");
};

const { chromium } = loadPlaywright();
const artifactDirectory = ".tmp/autochess";
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
  const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";

  await page.goto(`${baseUrl}/game/autochess?seed=98`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.getByText("火热整活", { exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");

  const setup = await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    let reactNode = canvas;
    let fiber = null;
    while (reactNode && !fiber) {
      const fiberKey = Object.keys(reactNode).find((key) => key.startsWith("__reactFiber$"));
      fiber = fiberKey ? reactNode[fiberKey] : null;
      reactNode = reactNode.parentElement;
    }
    while (fiber && fiber.type?.name !== "AutoChessGame") fiber = fiber.return;
    let hook = fiber?.memoizedState;
    let bridge = null;
    while (hook) {
      if (hook.memoizedState?.current?.engine?.state) {
        bridge = hook.memoizedState.current;
        break;
      }
      hook = hook.next;
    }
    if (!bridge) throw new Error("Unable to locate the engine bridge ref");
    const engine = bridge.engine;
    engine.state.round = 17;
    engine.state.playerLevel = 4;
    engine.state.board.fill(null);
    engine.state.board[0] = { uid: 1, id: "sun_guard", star: 1 };
    engine.state.bench.fill(null);
    engine.state.selected = null;
    engine.state.battle = null;
    engine.startBattle();

    const battle = engine.state.battle;
    const target = battle.player[0];
    const assassin = battle.enemy.find((fighter) => fighter.unitId === "youyi");
    if (!battle || !target || !assassin) throw new Error("Browser scenario did not create the expected fighters");

    target.x = 300;
    target.y = 320;
    battle.player.forEach((fighter) => {
      fighter.cooldown = 99;
      fighter.moveSpeed = 0;
      fighter.energy = 0;
    });
    battle.enemy.forEach((fighter) => {
      fighter.x = fighter === assassin ? 900 : 950;
      fighter.y = 320;
      fighter.attack = 0;
      fighter.cooldown = 99;
      fighter.moveSpeed = 0;
      fighter.energy = 0;
      fighter.hp = 99_999;
      fighter.maxHp = 99_999;
    });
    battle.engagedTeams.enemy = true;
    return {
      phase: engine.state.phase,
      target: { x: target.x, y: target.y },
      assassin: { x: assassin.x, y: assassin.y, jumpPending: assassin.jumpPending },
    };
  });

  await page.evaluate(() => window.advanceTime(350));
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector('[data-game-canvas="rift-line"]');
    let reactNode = canvas;
    let fiber = null;
    while (reactNode && !fiber) {
      const fiberKey = Object.keys(reactNode).find((key) => key.startsWith("__reactFiber$"));
      fiber = fiberKey ? reactNode[fiberKey] : null;
      reactNode = reactNode.parentElement;
    }
    while (fiber && fiber.type?.name !== "AutoChessGame") fiber = fiber.return;
    let hook = fiber?.memoizedState;
    let bridge = null;
    while (hook) {
      if (hook.memoizedState?.current?.engine?.state) {
        bridge = hook.memoizedState.current;
        break;
      }
      hook = hook.next;
    }
    if (!bridge) throw new Error("Unable to locate the engine bridge ref");
    const assassin = bridge.engine.state.battle.enemy.find((fighter) => fighter.unitId === "youyi");
    return {
      phase: bridge.engine.state.phase,
      elapsed: bridge.engine.state.battle.elapsed,
      target: bridge.engine.state.battle.player[0],
      assassin: {
        x: assassin.x,
        y: assassin.y,
        jumpPending: assassin.jumpPending,
        jumpTime: assassin.jumpTime,
        jumpFromX: assassin.jumpFromX,
        jumpToX: assassin.jumpToX,
        jumpFromY: assassin.jumpFromY,
        jumpToY: assassin.jumpToY,
      },
    };
  });

  const screenshotPath = `${artifactDirectory}/assassin-direction.png`;
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true });
  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
  }));
  if (screenshot.length < 20000) throw new Error(`Screenshot is suspiciously small: ${screenshot.length} bytes`);
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) throw new Error(`Game canvas size is invalid: ${JSON.stringify(canvasBox)}`);
  if (sample.assassin.jumpPending || sample.assassin.jumpTime <= 0) throw new Error(`Enemy assassin did not start jumping: ${JSON.stringify(sample.assassin)}`);
  if (sample.assassin.jumpToX >= sample.target.x) throw new Error(`Enemy assassin landed on its own side: ${JSON.stringify(sample)}`);
  const unexpectedErrors = errors.filter((error) => !error.includes("/api/record"));
  const unexpectedResponses = failedResponses.filter((response) => !response.url.endsWith("/api/record"));
  if (unexpectedErrors.length || unexpectedResponses.length) {
    throw new Error(`Chrome errors: ${JSON.stringify({ errors, failedResponses })}`);
  }

  console.log(JSON.stringify({ setup, sample, screenshot: screenshotPath, canvasBox, canvasMeta, errors, failedResponses }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
