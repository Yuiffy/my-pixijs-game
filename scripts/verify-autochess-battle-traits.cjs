const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
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
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (chunk[8] !== 8 || chunk[12] !== 0 || !channels) {
        throw new Error("Unsupported PNG encoding");
      }
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
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3160";
const artifactDirectory = ".tmp/autochess/battle-traits";
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
        if (current?.engine?.state && typeof current.dispatch === "function") {
          window.__codexAutoChessBridge = current;
        }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return Boolean(window.__codexAutoChessBridge);
  });
  if (!attached) throw new Error("Unable to locate the AutoChess bridge");
};

const openBattle = async (page, seed, round = 1) => {
  const response = await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`Autochess URL returned ${response?.status()}`);
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.locator(".rift-dom-choice").first().click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "preparation");
  await attachBridge(page);
  await page.evaluate(({ targetRound }) => {
    const bridge = window.__codexAutoChessBridge;
    bridge.engine.state.round = targetRound;
    bridge.engine.state.playerLevel = 10;
    bridge.engine.state.board.fill(null);
    [
      "shiori",
      "ember_blade",
      "xuehui",
      "sui_bird",
      "clock_gunner",
      "zeyin",
      "cinder_ram",
      "sui_flower",
      "grove_mender",
      "sui_blue",
    ].forEach((id, index) => {
      bridge.engine.state.board[index] = { uid: 91001 + index, id, star: 1 };
    });
    bridge.dispatch({ type: "battle" });
  }, { targetRound: round });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === "battle");
  await page.locator(".rift-battle-traits").waitFor();
};

const capture = async (page, name, screenshots) => {
  const buffer = await page.screenshot({ path: `${artifactDirectory}/${name}.png`, fullPage: true });
  screenshots[name] = inspectPng(buffer);
};

const traitScrollSnapshot = (page, team = "player") => page
  .locator(`.rift-battle-trait-side[data-team="${team}"] .rift-battle-trait-tags`)
  .evaluate((container) => {
    const lastTag = container.querySelector("button:last-of-type");
    const containerRect = container.getBoundingClientRect();
    const lastRect = lastTag?.getBoundingClientRect();
    return {
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      scrollLeft: container.scrollLeft,
      maxScrollLeft: container.scrollWidth - container.clientWidth,
      lastTagVisible: Boolean(lastRect && lastRect.left >= containerRect.left - 1 && lastRect.right <= containerRect.right + 1),
    };
  });

const layoutSnapshot = (page) => page.evaluate(() => {
  const state = JSON.parse(window.render_game_to_text());
  const box = (selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  };
  return {
    bar: box(".rift-battle-traits"),
    player: box('.rift-battle-trait-side[data-team="player"]'),
    enemy: box('.rift-battle-trait-side[data-team="enemy"]'),
    toggle: box(".rift-battle-traits-toggle"),
    detail: box(".rift-battle-trait-detail"),
    canvas: box('[data-game-canvas="rift-line"]'),
    header: box(".rift-dom-header"),
    collapsed: document.querySelector(".rift-battle-traits")?.classList.contains("is-collapsed"),
    playerTags: document.querySelectorAll('.rift-battle-trait-side[data-team="player"] .rift-battle-trait-tags button').length,
    enemyTags: document.querySelectorAll('.rift-battle-trait-side[data-team="enemy"] .rift-battle-trait-tags button').length,
    textState: {
      phase: state.phase,
      playerTraits: state.activeTraits.map((trait) => ({ name: trait.name, count: trait.count, level: trait.level })),
      enemyTraits: state.wave.enemyTraits.map((trait) => ({ name: trait.name, count: trait.count, level: trait.level })),
      playerUnits: state.battle.playerUnits.length,
    },
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const screenshots = {};
  const report = {};

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const desktop = await desktopContext.newPage();
  const desktopDiagnostics = attachDiagnostics(desktop);
  await openBattle(desktop, 81);
  const desktopOpen = await layoutSnapshot(desktop);
  assert.equal(desktopOpen.collapsed, false);
  assert.ok(desktopOpen.playerTags >= 14, JSON.stringify(desktopOpen));
  assert.ok(desktopOpen.enemyTags >= 1, JSON.stringify(desktopOpen));
  assert.equal(desktopOpen.playerTags, desktopOpen.textState.playerTraits.length);
  assert.equal(desktopOpen.enemyTags, desktopOpen.textState.enemyTraits.length);
  assert.equal(desktopOpen.textState.phase, "battle");
  assert.equal(desktopOpen.textState.playerUnits, 10);
  assert.ok(desktopOpen.bar.x >= desktopOpen.canvas.x && desktopOpen.bar.right <= desktopOpen.canvas.right);
  const desktopPlayerTags = desktop.locator('.rift-battle-trait-side[data-team="player"] .rift-battle-trait-tags');
  const scrollStart = await traitScrollSnapshot(desktop);
  assert.ok(scrollStart.scrollWidth > scrollStart.clientWidth, JSON.stringify(scrollStart));
  assert.equal(scrollStart.scrollLeft, 0);
  assert.equal(scrollStart.lastTagVisible, false);
  await desktopPlayerTags.hover({ position: { x: 12, y: 8 } });
  await desktop.mouse.wheel(0, 180);
  await desktop.waitForFunction(() => {
    const container = document.querySelector('.rift-battle-trait-side[data-team="player"] .rift-battle-trait-tags');
    return container && container.scrollLeft > 0;
  });
  const scrollAfterWheel = await traitScrollSnapshot(desktop);
  assert.ok(Math.abs(scrollAfterWheel.scrollLeft - 63) <= 1, JSON.stringify(scrollAfterWheel));
  await desktopPlayerTags.evaluate((container) => { container.scrollLeft = 0; });
  const playerTagsBox = await desktopPlayerTags.boundingBox();
  assert.ok(playerTagsBox);
  await desktop.mouse.move(playerTagsBox.x + playerTagsBox.width - 10, playerTagsBox.y + playerTagsBox.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(playerTagsBox.x + playerTagsBox.width - 14, playerTagsBox.y + playerTagsBox.height / 2);
  await desktop.mouse.up();
  const scrollAfterSmallDrag = await traitScrollSnapshot(desktop);
  assert.equal(scrollAfterSmallDrag.scrollLeft, 0, JSON.stringify(scrollAfterSmallDrag));
  await desktop.mouse.move(playerTagsBox.x + playerTagsBox.width - 10, playerTagsBox.y + playerTagsBox.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(playerTagsBox.x + 20, playerTagsBox.y + playerTagsBox.height / 2, { steps: 8 });
  await desktop.mouse.up();
  const scrollAfterDrag = await traitScrollSnapshot(desktop);
  assert.ok(scrollAfterDrag.scrollLeft > 0, JSON.stringify(scrollAfterDrag));
  await desktopPlayerTags.hover({ position: { x: 12, y: 8 } });
  await desktop.mouse.wheel(0, 10000);
  await desktop.waitForFunction(() => {
    const container = document.querySelector('.rift-battle-trait-side[data-team="player"] .rift-battle-trait-tags');
    return container && container.scrollWidth - container.clientWidth - container.scrollLeft <= 1;
  });
  const scrollAtEnd = await traitScrollSnapshot(desktop);
  assert.equal(scrollAtEnd.lastTagVisible, true, JSON.stringify(scrollAtEnd));
  await desktop.mouse.move(0, 0);
  await capture(desktop, "desktop-expanded-scroll-end", screenshots);
  await desktop.locator('.rift-battle-trait-side[data-team="enemy"] .rift-battle-trait-tags button').first().hover();
  await desktop.locator(".rift-battle-trait-detail").waitFor();
  const detailText = await desktop.locator(".rift-battle-trait-detail").innerText();
  assert.match(detailText, /当前效果：/);
  assert.match(detailText, /\d+人 [ⅠⅡⅢ]/);
  const desktopDetail = await layoutSnapshot(desktop);
  assert.ok(desktopDetail.detail.x >= 0 && desktopDetail.detail.right <= 1440, JSON.stringify(desktopDetail));
  await capture(desktop, "desktop-expanded-hover", screenshots);
  await desktop.getByRole("button", { name: "收起双方羁绊" }).click();
  const desktopCollapsed = await layoutSnapshot(desktop);
  assert.equal(desktopCollapsed.collapsed, true);
  assert.equal(desktopCollapsed.playerTags, 0);
  assert.equal(desktopCollapsed.enemyTags, 0);
  await capture(desktop, "desktop-collapsed", screenshots);
  report.desktop = {
    open: desktopOpen,
    scroll: {
      start: scrollStart,
      afterWheel: scrollAfterWheel,
      afterSmallDrag: scrollAfterSmallDrag,
      afterDrag: scrollAfterDrag,
      end: scrollAtEnd,
    },
    detail: desktopDetail,
    collapsed: desktopCollapsed,
    detailText,
    diagnostics: desktopDiagnostics,
  };

  const narrowContext = await browser.newContext({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 1 });
  const narrow = await narrowContext.newPage();
  const narrowDiagnostics = attachDiagnostics(narrow);
  await openBattle(narrow, 4, 17);
  const narrowOpen = await layoutSnapshot(narrow);
  assert.equal(narrowOpen.collapsed, false);
  assert.ok(narrowOpen.enemyTags >= 9, JSON.stringify(narrowOpen));
  const narrowEnemyTags = narrow.locator('.rift-battle-trait-side[data-team="enemy"] .rift-battle-trait-tags');
  const enemyScrollStart = await traitScrollSnapshot(narrow, "enemy");
  assert.ok(enemyScrollStart.scrollWidth > enemyScrollStart.clientWidth, JSON.stringify(enemyScrollStart));
  assert.equal(enemyScrollStart.scrollLeft, 0);
  assert.equal(enemyScrollStart.lastTagVisible, false);
  await narrowEnemyTags.hover({ position: { x: 12, y: 8 } });
  await narrow.mouse.wheel(0, 120);
  await narrow.waitForFunction(() => {
    const container = document.querySelector('.rift-battle-trait-side[data-team="enemy"] .rift-battle-trait-tags');
    return container && container.scrollLeft > 0;
  });
  const enemyScrollAfterWheel = await traitScrollSnapshot(narrow, "enemy");
  assert.ok(Math.abs(enemyScrollAfterWheel.scrollLeft - 42) <= 1, JSON.stringify(enemyScrollAfterWheel));
  await narrowEnemyTags.evaluate((container) => { container.scrollLeft = 0; });
  const enemyTagsBox = await narrowEnemyTags.boundingBox();
  assert.ok(enemyTagsBox);
  await narrow.mouse.move(enemyTagsBox.x + enemyTagsBox.width - 10, enemyTagsBox.y + enemyTagsBox.height / 2);
  await narrow.mouse.down();
  await narrow.mouse.move(enemyTagsBox.x + 20, enemyTagsBox.y + enemyTagsBox.height / 2, { steps: 8 });
  await narrow.mouse.up();
  const enemyScrollAfterDrag = await traitScrollSnapshot(narrow, "enemy");
  assert.ok(enemyScrollAfterDrag.scrollLeft > 0, JSON.stringify(enemyScrollAfterDrag));
  await narrowEnemyTags.hover({ position: { x: 12, y: 8 } });
  await narrow.mouse.wheel(0, 10000);
  await narrow.waitForFunction(() => {
    const container = document.querySelector('.rift-battle-trait-side[data-team="enemy"] .rift-battle-trait-tags');
    return container && container.scrollWidth - container.clientWidth - container.scrollLeft <= 1;
  });
  const enemyScrollAtEnd = await traitScrollSnapshot(narrow, "enemy");
  assert.equal(enemyScrollAtEnd.lastTagVisible, true, JSON.stringify(enemyScrollAtEnd));
  await narrow.mouse.move(0, 0);
  await capture(narrow, "narrow-desktop-enemy-scroll-end", screenshots);
  report.narrow = {
    open: narrowOpen,
    scroll: {
      start: enemyScrollStart,
      afterWheel: enemyScrollAfterWheel,
      afterDrag: enemyScrollAfterDrag,
      end: enemyScrollAtEnd,
    },
    diagnostics: narrowDiagnostics,
  };

  const portraitContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const portrait = await portraitContext.newPage();
  const portraitDiagnostics = attachDiagnostics(portrait);
  await openBattle(portrait, 82);
  await portrait.waitForFunction(() => document.querySelector(".rift-battle-traits")?.classList.contains("is-collapsed"));
  const portraitCollapsed = await layoutSnapshot(portrait);
  assert.equal(portraitCollapsed.collapsed, true);
  assert.ok(portraitCollapsed.bar.x >= 0 && portraitCollapsed.bar.right <= 390, JSON.stringify(portraitCollapsed));
  assert.ok(portraitCollapsed.bar.y >= portraitCollapsed.header.bottom, JSON.stringify(portraitCollapsed));
  await capture(portrait, "portrait-default-collapsed", screenshots);
  await portrait.getByRole("button", { name: "展开双方羁绊" }).click();
  await portrait.locator('.rift-battle-trait-side[data-team="enemy"] .rift-battle-trait-tags button').first().click();
  await portrait.locator(".rift-battle-trait-detail").waitFor();
  const portraitExpanded = await layoutSnapshot(portrait);
  assert.ok(portraitExpanded.playerTags >= 14 && portraitExpanded.enemyTags >= 1, JSON.stringify(portraitExpanded));
  assert.ok(portraitExpanded.detail.x >= 0 && portraitExpanded.detail.right <= 390, JSON.stringify(portraitExpanded));
  assert.ok(portraitExpanded.overflow <= 1, JSON.stringify(portraitExpanded));
  await capture(portrait, "portrait-expanded-detail", screenshots);
  report.portrait = { collapsed: portraitCollapsed, expanded: portraitExpanded, diagnostics: portraitDiagnostics };

  const landscapeContext = await browser.newContext({
    viewport: { width: 1138, height: 640 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const landscape = await landscapeContext.newPage();
  const landscapeDiagnostics = attachDiagnostics(landscape);
  await openBattle(landscape, 83);
  await landscape.waitForFunction(() => document.querySelector(".rift-battle-traits")?.classList.contains("is-collapsed"));
  const landscapeCollapsed = await layoutSnapshot(landscape);
  assert.equal(landscapeCollapsed.collapsed, true);
  assert.ok(landscapeCollapsed.bar.x >= 0 && landscapeCollapsed.bar.right <= 1138, JSON.stringify(landscapeCollapsed));
  await capture(landscape, "landscape-default-collapsed", screenshots);
  await landscape.getByRole("button", { name: "展开双方羁绊" }).click();
  const landscapeExpanded = await layoutSnapshot(landscape);
  assert.ok(landscapeExpanded.playerTags >= 14 && landscapeExpanded.enemyTags >= 1, JSON.stringify(landscapeExpanded));
  assert.ok(landscapeExpanded.overflow <= 1, JSON.stringify(landscapeExpanded));
  await capture(landscape, "landscape-expanded", screenshots);
  report.landscape = { collapsed: landscapeCollapsed, expanded: landscapeExpanded, diagnostics: landscapeDiagnostics };

  assert.deepEqual(desktopDiagnostics.errors, []);
  assert.deepEqual(desktopDiagnostics.failedResponses, []);
  assert.deepEqual(narrowDiagnostics.errors, []);
  assert.deepEqual(narrowDiagnostics.failedResponses, []);
  assert.deepEqual(portraitDiagnostics.errors, []);
  assert.deepEqual(portraitDiagnostics.failedResponses, []);
  assert.deepEqual(landscapeDiagnostics.errors, []);
  assert.deepEqual(landscapeDiagnostics.failedResponses, []);
  report.screenshots = screenshots;
  console.log(JSON.stringify(report, null, 2));

  await desktopContext.close();
  await narrowContext.close();
  await portraitContext.close();
  await landscapeContext.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
