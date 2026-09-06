const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

const loadPlaywright = () => {
  for (const candidate of [process.env.PLAYWRIGHT_MODULE, "playwright", "C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright"].filter(Boolean)) {
    try { return require(candidate); } catch { /* Try the next local installation. */ }
  }
  throw new Error("Playwright is unavailable; set PLAYWRIGHT_MODULE.");
};

const baseUrl = process.env.WUXIA_BASE_URL || "http://127.0.0.1:3801";
const directory = ".tmp/wuxia-martial-review";

(async () => {
  const response = await fetch(`${baseUrl}/game/wuxia`);
  assert.equal(response.status, 200);
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const engine = await loadTypescriptModule("src/components/wuxia/game/novelEngine.ts");
  const saves = await loadTypescriptModule("src/components/wuxia/game/wuxiaSave.ts");
  const game = engine.selectPlayerAgenda(engine.createNovelState({ heroName: "顾知微", seed: "martial-browser-review", origin: "sect_disciple", ambition: "truth" }), "sect_mastery");
  game.hero.stats = { martial: 100, insight: 100, fortune: 100, chivalry: 100, fame: 70 };
  game.narrative.martial.mastery = 100;
  game.campaign.legacy.martialInsights = 4;
  game.campaign.availableActivities = engine.generatePlayerActivities(game);
  game.rngState = 1;
  const root = saves.createSaveRoot(game);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ channel: "chrome", headless: process.env.WUXIA_HEADED !== "1" });
  mkdirSync(directory, { recursive: true });
  const screenshots = {};
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (entry) => { if (entry.status() >= 400 && entry.url().startsWith(baseUrl)) errors.push(`${entry.status()} ${entry.url()}`); });
    await page.addInitScript(({ key, fixture }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
    }, { key: saves.WUXIA_STORAGE_KEY_V7, fixture: root });
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const waitFor = (screen) => page.waitForFunction((expected) => {
      const raw = window.render_game_to_text?.();
      return raw && JSON.parse(raw).screen === expected;
    }, screen);
    const reopen = async () => {
      await page.goto(`${baseUrl}/game/wuxia`, { waitUntil: "domcontentloaded" });
      await waitFor("edition-select");
      await page.getByRole("button", { name: "进入开放江湖", exact: true }).click();
      await waitFor("world-library");
      await page.getByRole("button", { name: /续写顾知微的人生/ }).click();
    };
    const capture = async (name, fullPage = true) => {
      await page.waitForTimeout(500);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow");
      const path = `${directory}/${name}.png`;
      screenshots[name] = { path, ...inspectPng(await page.screenshot({ path, fullPage })) };
    };
    const assertLifeLedger = async () => {
      const cells = await page.getByLabel("人生近况").locator("strong").evaluateAll((elements) => elements.map((element) => ({
        width: element.getBoundingClientRect().width,
        column: getComputedStyle(element).gridColumnStart,
      })));
      assert.equal(cells.length, 4);
      assert.ok(cells.every((cell) => cell.column === "2" && cell.width >= 56), "Life summary text is squeezed into the icon column");
    };
    const enterInvent = async () => {
      await waitFor("planning");
      const current = await state();
      const index = current.campaign.activities.findIndex((entry) => entry.kind === "invent" && entry.enabled);
      assert.ok(index >= 0);
      await page.getByRole("region", { name: "可安排活动" }).locator("button").nth(index).click();
      await waitFor("story");
    };
    const choose = async (id) => {
      const before = await state();
      const index = before.choices.findIndex((entry) => entry.id === id);
      assert.ok(index >= 0 && before.choices[index].enabled);
      await page.getByRole("region", { name: "当前选择" }).locator("button").nth(index).click();
      await waitFor("outcome");
      const result = await state();
      assert.ok(result.outcome.success);
      assert.doesNotMatch(result.outcome.resultParagraphs.join("\n"), /潮声|少了一条退路/);
      return result;
    };
    await reopen();
    await waitFor("planning");
    await assertLifeLedger();
    await capture("life-summary-desktop");
    await enterInvent();
    const first = await choose("campaign-invent:break");
    assert.match(first.outcome.discovery, /你自创.*截流一式/);
    await capture("first-invention-desktop");
    await page.getByRole("button", { name: "回到行程安排", exact: true }).click();
    await enterInvent();
    await reopen();
    await waitFor("story");
    const repeated = await state();
    assert.match(repeated.choices[0].label, /精进.*截流一式/);
    await capture("refinement-choice-desktop");
    const refined = await choose("campaign-invent:break");
    assert.equal(refined.campaign.legacy.authoredTechniques.length, 1);
    assert.match(refined.outcome.discovery, /你精进.*截流一式/);
    assert.ok(!refined.outcome.changes.some((entry) => entry.label === "新招"));
    const authoredId = refined.campaign.legacy.authoredTechniques[0].id;
    assert.equal(refined.world.actors.find((actor) => actor.id === "hero").techniques.find((entry) => entry.techniqueId === authoredId).mastery, 40);
    await capture("refinement-outcome-desktop");
    const snapshot = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saves.WUXIA_STORAGE_KEY_V7);
    const savedGame = snapshot.worlds[0].game;
    const planning = engine.continueNovelAction(savedGame);
    planning.world.actors.find((actor) => actor.id === "hero").techniques.find((entry) => entry.techniqueId === authoredId).mastery = 100;
    planning.narrative.martial.techniques.find((entry) => entry.id === authoredId).mastery = 100;
    planning.campaign.availableActivities = engine.generatePlayerActivities(planning);
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: saves.WUXIA_STORAGE_KEY_V7, value: saves.createSaveRoot(planning) });
    await page.setViewportSize({ width: 390, height: 844 });
    await reopen();
    await enterInvent();
    const capped = await state();
    const firstButton = page.getByRole("region", { name: "当前选择" }).locator("button").first();
    assert.ok(await firstButton.isDisabled());
    assert.match(capped.choices[0].unavailableReason, /圆熟/);
    await page.keyboard.press("1");
    assert.deepEqual(await state(), capped, "A disabled keyboard choice changed state");
    await page.getByRole("region", { name: "当前选择" }).scrollIntoViewIfNeeded();
    await capture("mastered-choice-mobile", false);
    const different = await choose("campaign-invent:guard");
    assert.equal(different.campaign.legacy.authoredTechniques.length, 2);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const continueBounds = await page.getByRole("button", { name: "查看本章小结", exact: true }).boundingBox();
    const dockBounds = await page.locator('[class*="mobileDock"]').boundingBox();
    assert.ok(continueBounds && dockBounds && continueBounds.y + continueBounds.height <= dockBounds.y, "Continue button is covered by the mobile dock");
    await capture("different-invention-mobile", false);
    await page.getByRole("button", { name: "查看本章小结", exact: true }).click();
    await waitFor("chapter_break");
    await page.getByRole("button", { name: "开启下一章", exact: true }).click();
    await waitFor("planning");
    await assertLifeLedger();
    await page.getByLabel("人生近况").scrollIntoViewIfNeeded();
    await capture("life-summary-mobile", false);
    const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saves.WUXIA_STORAGE_KEY_V7);
    assert.equal(persisted.worlds[0].game.campaign.legacy.authoredTechniques.length, 2);
    assert.deepEqual(errors, []);
    const report = { ok: true, screenshots, errors, authoredTechniques: different.campaign.legacy.authoredTechniques };
    writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
