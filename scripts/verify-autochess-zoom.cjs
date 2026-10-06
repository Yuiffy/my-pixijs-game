// Real browser zoom (not CSS zoom/pinch emulation), in a disposable, muted Chrome profile.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { mkdirSync, mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const localRequire = createRequire(__filename);
const playwright = [process.env.PLAYWRIGHT_MODULE, "playwright",
  "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright",
  "C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright"]
  .filter(Boolean).map(name => { try { return localRequire(name); } catch { return null; } }).find(Boolean);
assert.ok(playwright, "Install Playwright or set PLAYWRIGHT_MODULE");
const base = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:4038";
const output = resolve(process.env.AUTOCHESS_ARTIFACT_DIR || "tmp/autochess-zoom/verified");
mkdirSync(output, { recursive: true });

(async () => {
  assert.equal((await fetch(`${base}/game/autochess`)).status, 200);
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const { UNIT_DEFS, TRAITS } = await loadTypescriptModule("src/components/autoChessGame/core/gameData.ts");
  const profile = mkdtempSync(join(tmpdir(), "autochess-zoom-"));
  const extension = join(profile, "zoom-extension");
  mkdirSync(extension);
  writeFileSync(join(extension, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Zoom regression", version: "1.0", permissions: ["tabs"], background: { service_worker: "worker.js" } }));
  writeFileSync(join(extension, "worker.js"), "chrome.runtime.onInstalled.addListener(() => {});");
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chrome", headless: false, viewport: { width: 1440, height: 900 },
    args: ["--mute-audio", "--enable-unsafe-extension-debugging"], ignoreDefaultArgs: ["--disable-extensions"],
  });
  const errors = [];
  const captures = [];
  const measurements = [];
  try {
    await context.addInitScript(() => { speechSynthesis.speak = () => {}; });
    const root = await context.browser().newBrowserCDPSession();
    await root.send("Extensions.loadUnpacked", { path: extension });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = context.pages()[0];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${base}/game/autochess?seed=1`);
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
    await page.evaluate(() => {
      const host = document.querySelector("canvas").parentElement;
      let fiber = host[Object.keys(host).find(key => key.startsWith("__reactFiber"))];
      for (; fiber; fiber = fiber.return) {
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          if (hook.memoizedState?.current?.scene?.getScene) window.__zoomGame = hook.memoizedState.current;
        }
      }
      if (!window.__zoomGame) throw new Error("Missing Phaser game");
    });
    const zoom = async factor => {
      await worker.evaluate(async factor => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(tab => tab.url.includes("/game/autochess"));
        await chrome.tabs.setZoom(tab.id, factor);
        if (Math.abs(await chrome.tabs.getZoom(tab.id) - factor) > 0.001) throw new Error("Zoom did not apply");
      }, factor);
      await page.waitForTimeout(450);
    };
    const fixture = async ids => {
      await page.evaluate(ids => {
        const bridge = window.autoChessAI.bridge;
        bridge.engine.state.shop = ids;
        bridge.engine.state.gold = 99;
        bridge.dispatch({ type: "clearSelection" });
      }, ids);
      await page.waitForTimeout(80);
    };
    const read = () => page.evaluate(() => {
      const scene = __zoomGame.scene.getScene("RiftLineScene");
      const canvas = scene.game.canvas;
      return {
        state: JSON.parse(render_game_to_text()), dpr: devicePixelRatio, viewport: [innerWidth, innerHeight],
        canvas: { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON() },
        resolution: scene.textResolution, cameraZoom: scene.cameras.main.zoom,
        offset: scene.traitOffset, minimumOffset: scene.traitMinimumOffset,
        labels: scene.traitLabels.list.map(label => {
          let hash = 2166136261;
          for (const byte of label.context.getImageData(0, 0, label.canvas.width, label.canvas.height).data) hash = Math.imul(hash ^ byte, 16777619);
          return { text: label.text, resolution: label.style.resolution, width: label.canvas.width, height: label.canvas.height, hash, filtered: Boolean(label.parentContainer.filters), visible: label.visible, crop: label._crop };
        }),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    const capture = async name => {
      await page.waitForTimeout(150);
      const path = join(output, `${name}.png`);
      let sanity;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { sanity = inspectPng(await page.screenshot({ path, fullPage: attempt > 0 })); break; }
        catch (error) { if (attempt === 2) throw error; await page.waitForTimeout(250); }
      }
      captures.push({ name, path, sanity, snapshot: await read() });
    };
    const assertTags = async (ids, selector) => {
      const cards = await page.locator(selector).evaluateAll(cards => cards.map(card => {
        const rect = card.getBoundingClientRect();
        const tags = [...card.querySelectorAll(".rift-dom-shop-copy i")];
        return { names: tags.map(tag => tag.textContent), clipped: tags.some(tag => {
          const r = tag.getBoundingClientRect();
          return r.left < rect.left || r.right > rect.right || r.top < rect.top || r.bottom > rect.bottom || tag.scrollWidth > tag.clientWidth + 1;
        }), summary: Boolean(card.querySelector(".rift-dom-shop-copy em")) };
      }));
      assert.equal(cards.length, ids.length);
      cards.forEach((card, index) => {
        assert.deepEqual(card.names.sort(), UNIT_DEFS[ids[index]].traits.map(id => TRAITS[id].name).sort());
        assert.equal(card.clipped, false, `Clipped tags on ${ids[index]}`);
        assert.equal(card.summary, false);
      });
    };
    const desktopCards = ".rift-dom-shop-desktop .rift-dom-shop-card";
    const roster = Object.keys(UNIT_DEFS);
    await zoom(1);
    for (let i = 0; i < roster.length; i += 5) {
      const ids = roster.slice(i, i + 5);
      await fixture(ids);
      await assertTags(ids, desktopCards);
    }
    const ids = ["grove_mender", "cinder_ram", "youyi", "tiandou", "sui_flower"];
    await fixture(ids);
    const steps = [1, 0.67, 0.8, 1.25, 1.5, 2, 1, 0.67, 1.5, 0.8, 2, 1.25, 1];
    let baseline;
    for (const [index, factor] of steps.entries()) {
      await zoom(factor);
      await assertTags(ids, desktopCards);
      assert.ok(await page.locator(".rift-shop-list").evaluate(list => list.clientHeight >= Math.min(...[...list.children].map(card => card.offsetHeight))), "Shop viewport cannot show even one whole card");
      const snapshot = await read();
      assert.equal(snapshot.state.phase, "preparation");
      assert.ok(snapshot.canvas.width > 0 && snapshot.canvas.height > 0);
      assert.ok(snapshot.overflow <= 1);
      assert.ok(snapshot.resolution >= Math.min(1.5, snapshot.cameraZoom));
      assert.ok(snapshot.labels.every(label => !label.filtered));
      const raster = snapshot.labels.map(({ text, resolution, width, height, hash }) => ({ text, resolution, width, height, hash }));
      if (index === 0) baseline = raster;
      if (factor === 1) assert.deepEqual(raster, baseline, "Text raster changed after returning to 100% zoom");
      const details = [];
      for (let cardIndex = 0; cardIndex < ids.length; cardIndex++) {
        await page.locator(desktopCards).nth(cardIndex).hover();
        await page.waitForTimeout(150);
        const detail = page.locator(".rift-shop-card-detail.is-floating");
        await detail.waitFor({ state: "visible" });
        const layout = await detail.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { rect: rect.toJSON(), headerBottom: document.querySelector(".rift-dom-header").getBoundingClientRect().bottom, viewport: [innerWidth, innerHeight], scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, hit: element.contains(document.elementFromPoint(rect.left + 10, rect.top + 10)) };
        });
        assert.ok(layout.rect.top >= layout.headerBottom, JSON.stringify(layout));
        assert.ok(layout.rect.bottom <= layout.viewport[1] + 1, JSON.stringify(layout));
        assert.ok(layout.rect.left >= 0 && layout.rect.right <= layout.viewport[0] + 1);
        assert.ok(layout.hit, "Detail covered by another element");
        details.push(layout);
        if ([0, 4, 5, 12].includes(index) && cardIndex === 2) await capture(`zoom-${index}-${factor}-detail`);
      }
      await page.mouse.move(4, 4);
      if ([0, 12].includes(index)) await capture(`zoom-${index}-traits`);
      measurements.push({ factor, ...snapshot, details });
    }
    // A long brief stays open while moving from its card and scrolling to the end.
    await zoom(2);
    const card = page.locator(desktopCards).nth(3);
    await card.hover();
    const brief = page.locator(".rift-shop-card-detail.is-floating");
    const box = await brief.boundingBox();
    const anchor = await card.boundingBox();
    await page.mouse.move(box.x + box.width - 5, Math.max(box.y + 10, Math.min(anchor.y + anchor.height / 2, box.y + box.height - 10)), { steps: 6 });
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(150);
    assert.ok(await brief.evaluate(e => e.scrollTop > 0 && e.scrollTop + e.clientHeight >= e.scrollHeight - 2));
    await capture("long-detail-scrolled");
    await zoom(1);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(200);
    // Overflowing trait strip: wheel and drag keep labels clipped and tooltips working.
    await page.evaluate(() => {
      const bridge = autoChessAI.bridge;
      const engine = bridge.engine;
      engine.state.playerLevel = 10;
      engine.state.board.fill(null);
      ["sui_blue", "sui_cat", "sun_guard", "xuehui", "pako", "clock_gunner", "gale_archer", "sui_flower", "ember_blade"].forEach((id, i) => { engine.state.board[i] = { uid: 700 + i, id, star: 1 }; });
      bridge.dispatch({ type: "clearSelection" });
    });
    const point = await page.evaluate(() => {
      const s = __zoomGame.scene.getScene("RiftLineScene");
      const strip = s.traitStrip();
      const rect = s.game.canvas.getBoundingClientRect();
      const logical = s.logicalSize();
      const scale = Math.min(rect.width / logical.width, rect.height / logical.height);
      return { x: rect.x + (rect.width - logical.width * scale) / 2 + (strip.x + strip.width - 20) * scale, y: rect.y + (rect.height - logical.height * scale) / 2 + (strip.y + 12) * scale };
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(150);
    assert.ok((await read()).offset < 0, JSON.stringify(await page.evaluate(point => {
      const s = __zoomGame.scene.getScene("RiftLineScene");
      const p = s.input.activePointer;
      return { point, hit: document.elementFromPoint(point.x, point.y)?.outerHTML.slice(0, 160), pointer: { x: p.x, y: p.y }, logical: s.logicalPointer(p), strip: s.traitStrip(), offset: s.traitOffset, minimum: s.traitMinimumOffset, bounds: s.scale.canvasBounds };
    }, point)));
    await page.mouse.down();
    await page.mouse.move(point.x - 200, point.y, { steps: 8 });
    await page.mouse.up();
    await page.mouse.move(4, 4);
    await capture("trait-strip-middle");
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 5000);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(150);
    const end = await read();
    assert.ok(Math.abs(end.offset - end.minimumOffset) < 0.1);
    await capture("trait-strip-end");
    // Portrait shares the card component; every roster entry must still show all traits.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".rift-dom-mobile-actions .rift-action").first().click();
    for (let i = 0; i < roster.length; i += 5) {
      const batch = roster.slice(i, i + 5);
      await fixture(batch);
      await assertTags(batch, ".rift-sheet-shop-list .rift-dom-shop-card");
    }
    await fixture(ids);
    await capture("mobile-all-traits");
    await page.locator(".rift-shop-card-info").nth(2).click();
    assert.ok(await page.locator('.rift-shop-card-detail[role="region"]').isVisible());
    await capture("mobile-detail");
    await page.locator(".rift-shop-card-info").nth(2).click();
    await page.setViewportSize({ width: 320, height: 740 });
    await assertTags(ids, ".rift-sheet-shop-list .rift-dom-shop-card");
    await capture("mobile-320-traits");
    const beforeBuy = (await read()).state;
    await page.locator(".rift-sheet-shop-list .rift-dom-shop-card").nth(2).click();
    const afterBuy = (await read()).state;
    assert.equal(afterBuy.player.gold, beforeBuy.player.gold - UNIT_DEFS[ids[2]].cost);
    assert.equal(afterBuy.board.length + afterBuy.bench.length, beforeBuy.board.length + beforeBuy.bench.length + 1);
    await page.getByRole("button", { name: /关闭/ }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "锁定商店" }).click();
    assert.equal((await read()).state.shopLocked, true);
    await page.getByRole("button", { name: /开始战斗/ }).click();
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).phase === "battle");
    await page.getByRole("button", { name: "暂停战斗" }).click();
    // Battle has no preparation trait label container.
    const canvas = page.locator('[data-game-canvas="rift-line"]');
    const battle = await page.evaluate(() => JSON.parse(render_game_to_text()));
    assert.equal(battle.interface.battlePaused, true);
    const battlePath = join(output, "battle-regression.png");
    captures.push({ name: "battle-regression", path: battlePath, sanity: inspectPng(await page.screenshot({ path: battlePath })), snapshot: { state: battle, canvas: await canvas.boundingBox() } });
    assert.deepEqual(errors, []);
    writeFileSync(join(output, "report.json"), JSON.stringify({ rosterCount: roster.length, steps, measurements, captures, errors }, null, 2));
    console.log(JSON.stringify({ rosterCount: roster.length, zoomSteps: steps.length, captures: captures.map(c => c.path), errors }, null, 2));
  } finally {
    await context.close();
    // Only the disposable profile created above is removed.
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
