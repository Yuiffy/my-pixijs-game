const { createRequire } = require("node:module");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
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

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

const summarize = (values) => ({
  count: values.length,
  average: Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(3)),
  median: Number(percentile(values, 0.5).toFixed(3)),
  p95: Number(percentile(values, 0.95).toFixed(3)),
  p99: Number(percentile(values, 0.99).toFixed(3)),
  max: Number(Math.max(0, ...values).toFixed(3)),
});

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
const label = process.env.PERF_LABEL || "current";
const durationMs = Number(process.env.PERF_DURATION_MS || 8000);
const cpuRate = Number(process.env.PERF_CPU_RATE || 4);
const renderDensityOverride = Number(process.env.PERF_RENDER_DENSITY || 0);
const artifactDirectory = ".tmp/autochess/performance";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  const errors = [];
  const failedRequests = [];
  const errorResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || "failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errorResponses.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto(`${baseUrl}/game/autochess?seed=83`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  const canvas = page.locator('[data-game-canvas="rift-line"]');
  await canvas.waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");

  const attached = await page.evaluate(() => {
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
    const scene = window.__codexAutoChessGame?.scene?.getScene("RiftLineScene");
    if (!window.__codexAutoChessBridge || !scene) return false;
    const topLevelMethods = ["syncBattleEntities", "syncCombatEffects", "syncBattleOverlay"];
    const detailMethods = [
      "updateFighter",
      "updateProjectile",
      "updateEffect",
      "updateRabbit",
      "updatePineTree",
      "syncChronospheres",
    ];
    const componentMethods = [...topLevelMethods, ...detailMethods];
    window.__autochessPerfComponentSamples = Object.fromEntries([
      ["simulation", []],
      ...componentMethods.map((method) => [method, []]),
    ]);
    window.__autochessPerfRenderLoad = { effects: [], textEffects: [] };
    const originalUpdate = scene.update.bind(scene);
    const bridge = window.__codexAutoChessBridge;
    const originalBridgeUpdate = bridge.update.bind(bridge);
    bridge.update = (delta) => {
      const start = performance.now();
      originalBridgeUpdate(delta);
      if (window.__autochessPerfSampling) {
        window.__autochessPerfComponentSamples.simulation.push(performance.now() - start);
      }
    };
    componentMethods.forEach((method) => {
      const original = scene[method].bind(scene);
      scene[method] = (...args) => {
        const start = performance.now();
        const result = original(...args);
        if (window.__autochessPerfSampling) {
          window.__autochessPerfComponentSamples[method].push(performance.now() - start);
          if (method === "syncCombatEffects") {
            const renderedEffects = [...scene.effectViews.keys()].filter((effect) => typeof effect?.kind === "string");
            window.__autochessPerfRenderLoad.effects.push(renderedEffects.length);
            window.__autochessPerfRenderLoad.textEffects.push(
              renderedEffects.filter((effect) => effect.kind === "text" || effect.kind === "heal").length,
            );
          }
        }
        return result;
      };
    });
    window.__autochessPerfUpdateSamples = [];
    window.__autochessPerfSampling = false;
    scene.update = (time, delta) => {
      const start = performance.now();
      originalUpdate(time, delta);
      if (window.__autochessPerfSampling) {
        window.__autochessPerfUpdateSamples.push(performance.now() - start);
      }
    };
    return true;
  });
  if (!attached) throw new Error("Unable to locate the active game and bridge through the React host");

  await page.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const engine = bridge.engine;
    engine.startRun(engine.state.starterChoices[0]);
    engine.state.round = 24;
    engine.state.playerLevel = 10;
    engine.state.board.fill(null);
    [
      "sun_guard",
      "mossback",
      "rift_brawler",
      "sui",
      "cog_scribe",
      "pako",
      "clock_gunner",
      "ember_blade",
      "shiori",
      "rei",
    ].forEach((id, index) => {
      engine.state.board[index] = { uid: 9000 + index, id, star: 2 };
    });
    engine.startBattle();
    const battle = engine.state.battle;
    battle.limit = 90;
    [...battle.player, ...battle.enemy].forEach((fighter) => {
      fighter.maxHp *= 12;
      fighter.hp = fighter.maxHp;
      fighter.attack *= 0.4;
      fighter.baseAttack *= 0.4;
    });
    bridge.dispatch({ type: "clearSelection" });
  });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  if (renderDensityOverride > 0) {
    await page.evaluate((density) => {
      const game = window.__codexAutoChessGame;
      const canvas = game.canvas;
      const bounds = canvas.getBoundingClientRect();
      game.scale.resize(
        Math.max(1, Math.round(bounds.width * density)),
        Math.max(1, Math.round(bounds.height * density)),
      );
      canvas.dataset.renderScale = density.toFixed(3);
      canvas.dataset.devicePixelRatio = density.toFixed(3);
    }, renderDensityOverride);
  }
  await page.waitForTimeout(1800);

  await client.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  await client.send("Performance.enable");
  const beforeMetrics = await client.send("Performance.getMetrics");
  await page.evaluate(() => {
    window.__autochessPerfUpdateSamples.length = 0;
    window.__autochessPerfSampling = true;
  });

  const frameSample = await page.evaluate((sampleDuration) => new Promise((resolve) => {
    const deltas = [];
    const longTasks = [];
    const effects = [];
    const textEffects = [];
    const projectiles = [];
    const start = performance.now();
    let previous = start;
    const observer = typeof PerformanceObserver === "function"
      ? new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => longTasks.push(entry.duration));
      })
      : null;
    observer?.observe({ type: "longtask", buffered: false });
    const onFrame = (now) => {
      deltas.push(now - previous);
      previous = now;
      const battle = window.__codexAutoChessBridge?.engine.state.battle;
      const currentEffects = battle?.effects || [];
      effects.push(currentEffects.length);
      textEffects.push(currentEffects.filter((effect) => effect.kind === "text" || effect.kind === "heal").length);
      projectiles.push(battle?.projectiles.length || 0);
      if (now - start >= sampleDuration) {
        observer?.disconnect();
        resolve({
          deltas,
          longTasks,
          effects,
          textEffects,
          projectiles,
          elapsed: now - start,
        });
        return;
      }
      requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  }), durationMs);
  await page.evaluate(() => {
    window.__autochessPerfSampling = false;
  });
  const afterMetrics = await client.send("Performance.getMetrics");
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const updateSamples = await page.evaluate(() => window.__autochessPerfUpdateSamples);
  const componentSamples = await page.evaluate(() => window.__autochessPerfComponentSamples);
  const renderLoad = await page.evaluate(() => window.__autochessPerfRenderLoad);
  const trackedSceneSamples = Array.from(
    { length: Math.max(...["simulation", "syncBattleEntities", "syncCombatEffects", "syncBattleOverlay"].map((name) => componentSamples[name].length)) },
    (_, index) => ["simulation", "syncBattleEntities", "syncCombatEffects", "syncBattleOverlay"]
      .reduce((sum, name) => sum + (componentSamples[name][index] || 0), 0),
  );
  const canvasInfo = await canvas.evaluate((element) => ({
    cssWidth: element.getBoundingClientRect().width,
    cssHeight: element.getBoundingClientRect().height,
    backingWidth: element.width,
    backingHeight: element.height,
    renderScale: Number(element.dataset.renderScale),
    devicePixelRatio: Number(element.dataset.devicePixelRatio),
    renderer: element.dataset.renderer || null,
  }));
  const battleState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const screenshotPath = `${artifactDirectory}/${label}-battle.png`;
  const screenshotBuffer = await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshot = inspectPng(screenshotBuffer);

  const metricsByName = (payload) => Object.fromEntries(payload.metrics.map((metric) => [metric.name, metric.value]));
  const before = metricsByName(beforeMetrics);
  const after = metricsByName(afterMetrics);
  const frameSummary = summarize(frameSample.deltas.slice(1));
  const result = {
    label,
    setup: {
      viewport: "390x844",
      emulatedDevicePixelRatio: 3,
      cpuThrottlingRate: cpuRate,
      renderDensityOverride: renderDensityOverride || null,
      durationMs: Math.round(frameSample.elapsed),
      playerUnits: battleState.battle?.allPlayerUnits?.length,
      enemyUnits: battleState.battle?.allEnemyUnits?.length,
    },
    canvas: canvasInfo,
    frames: {
      ...frameSummary,
      effectiveFps: Number((1000 / Math.max(frameSummary.average, 0.001)).toFixed(2)),
      over25ms: frameSample.deltas.filter((delta) => delta > 25).length,
      over50ms: frameSample.deltas.filter((delta) => delta > 50).length,
    },
    gameLoop: {
      updates: trackedSceneSamples.length,
      effectiveFps: Number((trackedSceneSamples.length * 1000 / frameSample.elapsed).toFixed(2)),
    },
    sceneUpdateMs: summarize(updateSamples),
    trackedSceneWorkMs: summarize(trackedSceneSamples),
    componentsMs: Object.fromEntries(
      Object.entries(componentSamples).map(([name, samples]) => [name, summarize(samples)]),
    ),
    longTasksMs: summarize(frameSample.longTasks),
    battleLoad: {
      effects: summarize(frameSample.effects),
      textEffects: summarize(frameSample.textEffects),
      projectiles: summarize(frameSample.projectiles),
      renderedEffects: summarize(renderLoad.effects),
      renderedTextEffects: summarize(renderLoad.textEffects),
    },
    browserCpu: {
      taskDurationSeconds: Number(((after.TaskDuration || 0) - (before.TaskDuration || 0)).toFixed(4)),
      scriptDurationSeconds: Number(((after.ScriptDuration || 0) - (before.ScriptDuration || 0)).toFixed(4)),
      jsHeapUsedBytes: Math.round(after.JSHeapUsedSize || 0),
    },
    liveEffects: {
      projectiles: battleState.battle?.projectiles?.length || 0,
      nonTextEffects: battleState.battle?.effects?.length || 0,
    },
    screenshot: { path: screenshotPath, ...screenshot },
    errors,
    failedRequests,
    errorResponses,
  };

  writeFileSync(`${artifactDirectory}/${label}-metrics.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || failedRequests.length || errorResponses.length) {
    throw new Error("Browser errors, failed requests, or error responses were captured");
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
