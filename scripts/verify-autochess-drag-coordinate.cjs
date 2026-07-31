const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");

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

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess/drag-coordinate";
mkdirSync(artifactDirectory, { recursive: true });

const viewports = [
  { width: 966, height: 989, label: "narrow-tall" },
  { width: 773, height: 790, label: "reported-browser" },
  { width: 800, height: 800, label: "compact-desktop" },
  { width: 1024, height: 768, label: "small-landscape" },
  { width: 1280, height: 720, label: "baseline" },
  { width: 1440, height: 900, label: "wide" },
  { width: 1680, height: 1050, label: "scaled-wide" },
];
const deviceScaleFactors = [1, 1.25, 1.5];
const selectedViewports = process.env.DRAG_VIEWPORTS
  ? viewports.filter(({ label }) => process.env.DRAG_VIEWPORTS.split(",").includes(label))
  : viewports;
const selectedDeviceScaleFactors = process.env.DRAG_DPRS
  ? deviceScaleFactors.filter((value) => process.env.DRAG_DPRS.split(",").includes(String(value)))
  : deviceScaleFactors;

const inspect = async (page, canvas) => page.evaluate(() => {
  const host = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement;
  const scene = window.__codexAutoChessGame?.scene.getScene("RiftLineScene");
  const canvasElement = document.querySelector('[data-game-canvas="rift-line"]');
  const pointer = scene?.input.activePointer;
  const logicalPointer = pointer && scene?.logicalPointer(pointer);
  const rect = canvasElement?.getBoundingClientRect();
  const camera = scene?.cameras.main;
  const round = (value) => Number(value?.toFixed?.(3) ?? value);
  return {
    canvas: canvasElement && {
      rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
      width: canvasElement.width,
      height: canvasElement.height,
      dataset: { renderScale: canvasElement.dataset.renderScale, uiScale: canvasElement.parentElement?.parentElement?.dataset.uiScale },
    },
    host: host && { x: round(host.getBoundingClientRect().x), y: round(host.getBoundingClientRect().y), width: round(host.clientWidth), height: round(host.clientHeight) },
    scale: scene && {
      base: { width: scene.scale.baseSize.width, height: scene.scale.baseSize.height },
      parent: { width: scene.scale.parentSize.width, height: scene.scale.parentSize.height },
      display: { width: round(scene.scale.displaySize.width), height: round(scene.scale.displaySize.height) },
    },
    camera: camera && {
      zoom: round(camera.zoom),
      scrollX: round(camera.scrollX),
      scrollY: round(camera.scrollY),
      worldView: { x: round(camera.worldView.x), y: round(camera.worldView.y), width: round(camera.worldView.width), height: round(camera.worldView.height) },
    },
    pointer: pointer && {
      x: round(pointer.x),
      y: round(pointer.y),
      screenX: round(pointer.screenX),
      screenY: round(pointer.screenY),
      logical: logicalPointer && { x: round(logicalPointer.x), y: round(logicalPointer.y) },
    },
    drag: scene?.dragState && {
      active: scene.dragState.active,
      origin: scene.dragState.origin,
      target: scene.dragState.target,
    },
    state: JSON.parse(window.render_game_to_text()),
  };
});

const exposeReactRefs = async (page) => page.evaluate(() => {
  const host = document.querySelector('[data-game-canvas="rift-line"]')?.parentElement;
  const fiberKey = host && Object.keys(host).find((key) => key.startsWith("__reactFiber$"));
  let fiber = fiberKey ? host[fiberKey] : null;
  while (fiber) {
    let hook = fiber.memoizedState;
    while (hook) {
      const current = hook.memoizedState?.current;
      if (current?.engine?.state && typeof current.dispatch === "function") window.__codexAutoChessBridge = current;
      if (current?.scene?.getScene) window.__codexAutoChessGame = current;
      hook = hook.next;
    }
    fiber = fiber.return;
  }
  return Boolean(window.__codexAutoChessBridge && window.__codexAutoChessGame);
});

const pointForWorld = async (page, canvas, x, y) => page.evaluate(({ x, y }) => {
  const scene = window.__codexAutoChessGame.scene.getScene("RiftLineScene");
  const element = document.querySelector('[data-game-canvas="rift-line"]');
  const rect = element.getBoundingClientRect();
  const camera = scene.cameras.main;
  const base = scene.scale.baseSize;
  const internalX = (x - camera.worldView.x) * camera.zoom;
  const internalY = (y - camera.worldView.y) * camera.zoom;
  return {
    x: rect.x + internalX * rect.width / base.width,
    y: rect.y + internalY * rect.height / base.height,
  };
}, { x, y });

const pointForLogical = async (page, canvas, x, y) => page.evaluate(({ x, y }) => {
  const element = document.querySelector('[data-game-canvas="rift-line"]');
  const rect = element.getBoundingClientRect();
  const logical = {
    width: Number(element.dataset.logicalWidth || 1120),
    height: Number(element.dataset.logicalHeight || 720),
  };
  const fitScale = Math.min(rect.width / logical.width, rect.height / logical.height);
  return {
    x: rect.x + (rect.width - logical.width * fitScale) / 2 + x * fitScale,
    y: rect.y + (rect.height - logical.height * fitScale) / 2 + y * fitScale,
  };
}, { x, y });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  const failedResponses = [];
  const results = [];

  for (const deviceScaleFactor of selectedDeviceScaleFactors) {
    const context = await browser.newContext({ viewport: selectedViewports[0], deviceScaleFactor });
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
    });
    for (const viewport of selectedViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(`${baseUrl}/game/autochess?seed=1`, { waitUntil: "domcontentloaded" });
      if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
      const canvas = page.locator('[data-game-canvas="rift-line"]');
      await canvas.waitFor();
      await page.waitForFunction(() => typeof window.render_game_to_text === "function");
      if (!await exposeReactRefs(page)) throw new Error("Unable to locate the active game bridge");
      await page.evaluate(() => {
        const bridge = window.__codexAutoChessBridge;
        const engine = bridge.engine;
        engine.startRun(engine.state.starterChoices[0]);
        engine.state.board.fill(null);
        engine.state.bench.fill(null);
        engine.state.board[0] = { uid: 1001, id: "sui", star: 1 };
        engine.state.board[1] = { uid: 1002, id: "rift_stalker", star: 1 };
        bridge.dispatch({ type: "clearSelection" });
      });
      await page.waitForTimeout(200);
      const before = await inspect(page, canvas);
      const sourceRect = await page.evaluate(() => window.__codexAutoChessGame.scene.getScene("RiftLineScene").slotRect({ zone: "board", index: 0 }));
      const targetRect = await page.evaluate(() => window.__codexAutoChessGame.scene.getScene("RiftLineScene").slotRect({ zone: "board", index: 1 }));
      const pointForDrag = process.env.DRAG_POINT_MODE === "logical" ? pointForLogical : pointForWorld;
      const source = await pointForDrag(page, canvas, sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
      const target = await pointForDrag(page, canvas, targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2);
      await page.mouse.move(source.x, source.y);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 8 });
      await page.screenshot({ path: `${artifactDirectory}/${viewport.label}-dpr-${deviceScaleFactor}-drag.png`, fullPage: true });
      const during = await inspect(page, canvas);
      await page.mouse.up();
      await page.waitForTimeout(80);
      const after = await inspect(page, canvas);
      results.push({ deviceScaleFactor, viewport, sourceRect, targetRect, source, target, before, during, after });
    }
    await context.close();
  }

  if (errors.length || failedResponses.length) {
    throw new Error(`Browser errors: ${JSON.stringify({ errors, failedResponses })}`);
  }
  console.log(JSON.stringify({ results, errors, failedResponses }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
