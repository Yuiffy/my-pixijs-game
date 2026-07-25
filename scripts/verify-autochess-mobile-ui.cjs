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
const artifactDirectory = ".tmp/autochess/mobile-ui";
mkdirSync(artifactDirectory, { recursive: true });

const attachDiagnostics = (page) => {
  const errors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });
  return { errors, failedResponses };
};

const attachBridge = async (page) => {
  const attached = await page.evaluate(() => {
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
  if (!attached) throw new Error("Unable to locate the AutoChess bridge");
};

const state = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));

const capture = async (page, name, screenshots) => {
  const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png`, fullPage: true });
  screenshots[name] = inspectPng(buffer);
};

const openRun = async (page, seed) => {
  const response = await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachBridge(page);
};

const selectOwnedUnit = async (page) => page.evaluate(() => {
  const bridge = window.__codexAutoChessBridge;
  const boardIndex = bridge.engine.state.board.findIndex(Boolean);
  const benchIndex = bridge.engine.state.bench.findIndex(Boolean);
  const location = boardIndex >= 0 ? { zone: "board", index: boardIndex } : { zone: "bench", index: benchIndex };
  if (location.index < 0) throw new Error("No owned unit can be selected");
  bridge.dispatch({ type: "slot", location });
  return location;
});

const advanceUntilResult = async (page) => {
  for (let elapsed = 0; elapsed < 40000; elapsed += 500) {
    if ((await state(page)).phase === "result") return elapsed;
    await page.evaluate(() => window.advanceTime(500));
  }
  throw new Error("Timed out waiting for mobile result");
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const screenshots = {};
  const report = {};

  const landscapeContext = await browser.newContext({
    viewport: { width: 1138, height: 640 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const landscape = await landscapeContext.newPage();
  const landscapeDiagnostics = attachDiagnostics(landscape);
  await openRun(landscape, 1);

  const landscapeLayout = await landscape.evaluate(() => {
    const toolbar = document.querySelector(".rift-toolbar");
    const header = document.querySelector(".rift-dom-header")?.getBoundingClientRect();
    const brief = document.querySelector(".rift-mobile-brief")?.getBoundingClientRect();
    const actions = document.querySelector(".rift-dom-mobile-actions")?.getBoundingClientRect();
    const desktopShop = document.querySelector(".rift-dom-shop-desktop");
    const canvas = document.querySelector('[data-game-canvas="rift-line"]')?.getBoundingClientRect();
    return {
      toolbarDisplay: toolbar && getComputedStyle(toolbar).display,
      desktopShopDisplay: desktopShop && getComputedStyle(desktopShop).display,
      header: header && { x: header.x, y: header.y, width: header.width, height: header.height },
      brief: brief && { x: brief.x, y: brief.y, width: brief.width, height: brief.height },
      actions: actions && { x: actions.x, y: actions.y, width: actions.width, height: actions.height },
      canvas: canvas && { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      coarse: matchMedia("(pointer: coarse)").matches,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.equal(landscapeLayout.coarse, true);
  assert.equal(landscapeLayout.toolbarDisplay, "none");
  assert.equal(landscapeLayout.desktopShopDisplay, "none");
  assert.ok(landscapeLayout.canvas.height >= 635, JSON.stringify(landscapeLayout));
  assert.ok(landscapeLayout.header.height <= 44, JSON.stringify(landscapeLayout));
  assert.ok(landscapeLayout.overflow <= 1, JSON.stringify(landscapeLayout));
  await capture(landscape, "landscape-preparation", screenshots);

  await landscape.locator(".rift-dom-mobile-actions button").nth(0).click();
  const shopLayout = await landscape.evaluate(() => {
    const sheet = document.querySelector(".rift-dom-sheet-shop")?.getBoundingClientRect();
    const cards = [...document.querySelectorAll(".rift-dom-sheet-shop .rift-dom-shop-card")].map((card) => {
      const box = card.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    });
    return {
      sheet: sheet && { x: sheet.x, y: sheet.y, width: sheet.width, height: sheet.height },
      cards,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert.equal(shopLayout.cards.length, 5);
  assert.ok(shopLayout.sheet.x >= shopLayout.viewport.width * 0.4, JSON.stringify(shopLayout));
  assert.ok(shopLayout.cards.every((card) => card.top >= 0 && card.bottom <= shopLayout.viewport.height + 1), JSON.stringify(shopLayout));
  await capture(landscape, "landscape-shop", screenshots);
  const enabledShopCard = landscape.locator(".rift-dom-sheet-shop .rift-dom-shop-card:not(:disabled)").first();
  if (await enabledShopCard.count()) await enabledShopCard.click();
  await landscape.getByRole("button", { name: "关闭面板" }).click();

  await selectOwnedUnit(landscape);
  const sellButton = landscape.locator(".rift-dom-mobile-actions .rift-action-danger");
  await sellButton.waitFor();
  assert.equal(await sellButton.isEnabled(), true);
  const beforeSell = await state(landscape);
  await sellButton.click();
  const afterSell = await state(landscape);
  assert.equal(afterSell.board.length + afterSell.bench.length, beforeSell.board.length + beforeSell.bench.length - 1);

  await landscape.locator(".rift-dom-mobile-actions .rift-action-confirm").click();
  await landscape.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  await landscape.waitForTimeout(100);
  const canvas = landscape.locator('[data-game-canvas="rift-line"]');
  const initialView = await canvas.evaluate((element) => ({
    zoom: Number(element.dataset.battleViewZoom),
    center: element.dataset.battleViewCenter,
    box: element.getBoundingClientRect().toJSON(),
  }));
  assert.ok(initialView.zoom >= 1.17, JSON.stringify(initialView));
  assert.ok(await landscape.getByRole("button", { name: "放大战场" }).isVisible());
  await capture(landscape, "landscape-battle", screenshots);

  await landscape.getByRole("button", { name: "放大战场" }).click();
  const buttonZoom = Number(await canvas.getAttribute("data-battle-view-zoom"));
  assert.ok(buttonZoom > initialView.zoom, `${buttonZoom} <= ${initialView.zoom}`);
  const box = await canvas.boundingBox();
  await landscape.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.55);
  await landscape.mouse.down();
  await landscape.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.45, { steps: 8 });
  await landscape.mouse.up();
  const pannedCenter = await canvas.getAttribute("data-battle-view-center");
  assert.notEqual(pannedCenter, initialView.center);

  const cdp = await landscapeContext.newCDPSession(landscape);
  const centerX = box.x + box.width * 0.5;
  const centerY = box.y + box.height * 0.56;
  const beforePinch = Number(await canvas.getAttribute("data-battle-view-zoom"));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: centerX - 45, y: centerY, id: 1 }, { x: centerX + 45, y: centerY, id: 2 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: centerX - 80, y: centerY, id: 1 }, { x: centerX + 80, y: centerY, id: 2 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await landscape.waitForTimeout(50);
  const afterPinch = Number(await canvas.getAttribute("data-battle-view-zoom"));
  assert.ok(afterPinch > beforePinch, `${afterPinch} <= ${beforePinch}`);
  await capture(landscape, "landscape-battle-zoomed", screenshots);

  const resultElapsed = await advanceUntilResult(landscape);
  await landscape.locator(".rift-mobile-result").waitFor();
  await landscape.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const battle = bridge.engine.state.battle;
    const cloneTeam = (fighters, count, team) => Array.from({ length: count }, (_, index) => {
      const source = fighters[index % fighters.length];
      return {
        ...source,
        fid: `mobile-result-${team}-${index}`,
        team,
        star: (index % 3) + 1,
        alive: index % 4 !== 3,
        hp: index % 4 === 3 ? 0 : Math.max(1, source.maxHp - index * 19),
        damageDealt: 2400 - index * 173,
        healingDone: index * 91,
        shieldingDone: index * 47,
        damageTaken: 420 + index * 128,
      };
    });
    battle.player = cloneTeam(battle.player, 8, "player");
    battle.enemy = cloneTeam(battle.enemy, 8, "enemy");
    bridge.dispatch({ type: "metric", metric: "damage" });
  });
  const resultPlayer = await landscape.evaluate(() => ({
    resultBoxes: document.querySelectorAll(".rift-mobile-result").length,
    visibleRows: document.querySelectorAll(".rift-mobile-result-list article").length,
    selectedTeam: document.querySelector('.rift-mobile-result-team-tabs button[aria-selected="true"]')?.textContent,
    list: (() => {
      const element = document.querySelector(".rift-mobile-result-list");
      return element && { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
    })(),
    overflow: document.documentElement.scrollWidth - innerWidth,
    toolbarDisplay: getComputedStyle(document.querySelector(".rift-toolbar")).display,
  }));
  assert.equal(resultPlayer.resultBoxes, 1);
  assert.match(resultPlayer.selectedTeam, /我方阵容/);
  assert.equal(resultPlayer.visibleRows, 8);
  assert.ok(resultPlayer.list.scrollHeight > resultPlayer.list.clientHeight, JSON.stringify(resultPlayer));
  assert.ok(resultPlayer.overflow <= 1);
  assert.equal(resultPlayer.toolbarDisplay, "none");
  await capture(landscape, "landscape-result-player", screenshots);
  await landscape.getByRole("tab", { name: /敌方阵容/ }).click();
  const selectedEnemy = await landscape.locator('.rift-mobile-result-team-tabs button[aria-selected="true"]').textContent();
  assert.match(selectedEnemy, /敌方阵容/);
  await capture(landscape, "landscape-result-enemy", screenshots);
  report.landscape = {
    layout: landscapeLayout,
    shop: shopLayout,
    view: { initialView, buttonZoom, pannedCenter, beforePinch, afterPinch },
    result: { elapsed: resultElapsed, player: resultPlayer, selectedEnemy },
    textState: await state(landscape),
    diagnostics: landscapeDiagnostics,
  };

  const portraitContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const portrait = await portraitContext.newPage();
  const portraitDiagnostics = attachDiagnostics(portrait);
  await openRun(portrait, 2);
  await selectOwnedUnit(portrait);
  const portraitSell = portrait.locator(".rift-dom-mobile-actions .rift-action-danger");
  const portraitLayout = await portrait.evaluate(() => {
    const sell = document.querySelector(".rift-dom-mobile-actions .rift-action-danger")?.getBoundingClientRect();
    const actions = document.querySelector(".rift-dom-mobile-actions")?.getBoundingClientRect();
    const canvasBox = document.querySelector('[data-game-canvas="rift-line"]')?.getBoundingClientRect();
    return {
      sell: sell && { x: sell.x, y: sell.y, width: sell.width, height: sell.height },
      actions: actions && { x: actions.x, y: actions.y, width: actions.width, height: actions.height },
      canvas: canvasBox && { x: canvasBox.x, y: canvasBox.y, width: canvasBox.width, height: canvasBox.height },
      toolbarDisplay: getComputedStyle(document.querySelector(".rift-toolbar")).display,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.equal(await portraitSell.isEnabled(), true);
  assert.ok(portraitLayout.sell.height >= 48, JSON.stringify(portraitLayout));
  assert.ok(portraitLayout.sell.y + portraitLayout.sell.height <= 844, JSON.stringify(portraitLayout));
  assert.equal(portraitLayout.toolbarDisplay, "none");
  assert.ok(portraitLayout.overflow <= 1);
  await capture(portrait, "portrait-preparation-sell", screenshots);
  const portraitBeforeSell = await state(portrait);
  await portraitSell.click();
  const portraitAfterSell = await state(portrait);
  assert.equal(
    portraitAfterSell.board.length + portraitAfterSell.bench.length,
    portraitBeforeSell.board.length + portraitBeforeSell.bench.length - 1,
  );
  await portrait.evaluate(() => {
    const bridge = window.__codexAutoChessBridge;
    const summary = JSON.parse(window.render_game_to_text());
    const index = summary.shop.find((entry) => entry.cost <= summary.player.gold)?.index ?? -1;
    if (index < 0) throw new Error("No affordable portrait replacement unit");
    bridge.dispatch({ type: "shop", index });
  });
  await portrait.locator(".rift-dom-mobile-actions .rift-action-confirm").click();
  await portrait.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  await advanceUntilResult(portrait);
  await portrait.locator(".rift-mobile-result").waitFor();
  const portraitResult = await portrait.evaluate(() => {
    const result = document.querySelector(".rift-mobile-result")?.getBoundingClientRect();
    const summary = document.querySelector(".rift-mobile-result-summary")?.getBoundingClientRect();
    const roster = document.querySelector(".rift-mobile-result-roster")?.getBoundingClientRect();
    const button = document.querySelector(".rift-mobile-result-continue")?.getBoundingClientRect();
    return {
      result: result && { x: result.x, y: result.y, width: result.width, height: result.height },
      summary: summary && { x: summary.x, y: summary.y, width: summary.width, height: summary.height },
      roster: roster && { x: roster.x, y: roster.y, width: roster.width, height: roster.height },
      button: button && { x: button.x, y: button.y, width: button.width, height: button.height },
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.ok(portraitResult.summary.height > 0 && portraitResult.roster.height > 0, JSON.stringify(portraitResult));
  assert.ok(portraitResult.button.y + portraitResult.button.height <= 844, JSON.stringify(portraitResult));
  assert.ok(portraitResult.overflow <= 1);
  await capture(portrait, "portrait-result", screenshots);
  report.portrait = {
    layout: portraitLayout,
    result: portraitResult,
    textState: await state(portrait),
    diagnostics: portraitDiagnostics,
  };

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const desktop = await desktopContext.newPage();
  const desktopDiagnostics = attachDiagnostics(desktop);
  await openRun(desktop, 3);
  const desktopLayout = await desktop.evaluate(() => {
    const toolbar = document.querySelector(".rift-toolbar")?.getBoundingClientRect();
    const shop = document.querySelector(".rift-dom-shop-desktop")?.getBoundingClientRect();
    const mobileActions = document.querySelector(".rift-dom-mobile-actions");
    const canvasBox = document.querySelector('[data-game-canvas="rift-line"]')?.getBoundingClientRect();
    return {
      toolbar: toolbar && { x: toolbar.x, y: toolbar.y, width: toolbar.width, height: toolbar.height },
      toolbarDisplay: getComputedStyle(document.querySelector(".rift-toolbar")).display,
      shop: shop && { x: shop.x, y: shop.y, width: shop.width, height: shop.height },
      shopDisplay: getComputedStyle(document.querySelector(".rift-dom-shop-desktop")).display,
      mobileActionsDisplay: getComputedStyle(mobileActions).display,
      canvas: canvasBox && { x: canvasBox.x, y: canvasBox.y, width: canvasBox.width, height: canvasBox.height },
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.equal(desktopLayout.toolbarDisplay, "flex");
  assert.equal(desktopLayout.shopDisplay, "grid");
  assert.equal(desktopLayout.mobileActionsDisplay, "none");
  assert.ok(desktopLayout.toolbar.height >= 42 && desktopLayout.toolbar.height <= 53, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.shop.width >= 294, JSON.stringify(desktopLayout));
  assert.ok(desktopLayout.overflow <= 1);
  await capture(desktop, "desktop-preparation", screenshots);
  report.desktop = { layout: desktopLayout, diagnostics: desktopDiagnostics };

  assert.deepEqual(landscapeDiagnostics.errors, []);
  assert.deepEqual(landscapeDiagnostics.failedResponses, []);
  assert.deepEqual(portraitDiagnostics.errors, []);
  assert.deepEqual(portraitDiagnostics.failedResponses, []);
  assert.deepEqual(desktopDiagnostics.errors, []);
  assert.deepEqual(desktopDiagnostics.failedResponses, []);
  report.screenshots = screenshots;
  console.log(JSON.stringify(report, null, 2));
  await portraitContext.close();
  await landscapeContext.close();
  await desktopContext.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
