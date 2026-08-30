const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

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
      if (candidate.includes("/") || candidate.includes("\\")) {
        if (!existsSync(candidate)) continue;
        return localRequire(candidate);
      }
      return localRequire(candidate);
    } catch {
      // Try the next known installation path.
    }
  }
  throw new Error("无法加载 playwright，请安装依赖或设置 PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const baseUrl = (process.env.WUXIA_BASE_URL || "http://127.0.0.1:3801").replace(/\/$/, "");
const artifactDirectory = ".tmp/wuxia-verify";
mkdirSync(artifactDirectory, { recursive: true });

const parseState = (raw) => {
  assert.ok(raw, "render_game_to_text 未初始化");
  return JSON.parse(raw);
};

const runFingerprint = (state) => ({
  hero: state.hero,
  companions: state.companions,
  location: state.location,
  history: state.history,
  ending: state.ending,
});

const waitForPage = async () => {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(baseUrl + "/game/wuxia");
      lastStatus = response.status;
      if (response.ok) return;
    } catch {
      lastStatus = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  assert.fail("武侠页面无法访问: " + (lastStatus || "连接失败"));
};

(async () => {
  await waitForPage();

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (pageResponse) => {
    if (pageResponse.status() >= 400) {
      failedResponses.push({ status: pageResponse.status(), url: pageResponse.url() });
    }
  });

  const state = () => page.evaluate(() => window.render_game_to_text?.() || "");
  const readState = async () => parseState(await state());
  const capture = async (name) => {
    const path = artifactDirectory + "/" + name + ".png";
    const buffer = await page.screenshot({ path, fullPage: true });
    return inspectPng(buffer);
  };
  const fontSizeOf = async (locator) => Number.parseFloat(await locator.evaluate((element) => getComputedStyle(element).fontSize));
  const waitForTurn = async (turn) => {
    await page.waitForFunction((expectedTurn) => {
      const raw = window.render_game_to_text?.();
      if (!raw) return false;
      try {
        return JSON.parse(raw).turn === expectedTurn;
      } catch {
        return false;
      }
    }, turn);
  };
  const waitForScreen = async (screen) => {
    await page.waitForFunction((expectedScreen) => {
      const raw = window.render_game_to_text?.();
      if (!raw) return false;
      try {
        return JSON.parse(raw).screen === expectedScreen;
      } catch {
        return false;
      }
    }, screen);
  };
  const assertNoHorizontalOverflow = async (label) => {
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    assert.ok(overflow <= 1, label + " 横向溢出 " + overflow + "px");
  };

  await page.goto(baseUrl + "/game/wuxia", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.render_game_to_text));
  assert.equal((await readState()).screen, "setup");
  const setupShot = await capture("setup");

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(150);
  await assertNoHorizontalOverflow("开局 2K");
  const originOption = page.locator("button").filter({ hasText: "门派弟子" }).first();
  const setup2kTypography = {
    fieldLabel: await fontSizeOf(page.getByText("姓名", { exact: true }).first()),
    optionTitle: await fontSizeOf(originOption.locator("strong")),
    optionDescription: await fontSizeOf(originOption.locator("small")),
    featureNote: await fontSizeOf(page.getByText("可复现种子", { exact: true })),
    footnote: await fontSizeOf(page.getByText("每局状态会自动保存 · 种子相同，命运路径可重演", { exact: true })),
  };
  assert.ok(setup2kTypography.fieldLabel >= 13, "2K 字段标签过小: " + JSON.stringify(setup2kTypography));
  assert.ok(setup2kTypography.optionTitle >= 16, "2K 选项标题过小: " + JSON.stringify(setup2kTypography));
  assert.ok(setup2kTypography.optionDescription >= 14, "2K 选项说明过小: " + JSON.stringify(setup2kTypography));
  assert.ok(setup2kTypography.featureNote >= 13, "2K 功能说明过小: " + JSON.stringify(setup2kTypography));
  assert.ok(setup2kTypography.footnote >= 13, "2K 页脚说明过小: " + JSON.stringify(setup2kTypography));
  const setup2kShot = await capture("setup-2k");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  const nameInput = page.locator("#wuxia-hero-name");
  const seedInput = page.locator("#wuxia-seed");
  await nameInput.fill("顾知微");
  await seedInput.fill("verify-moon-27");
  await page.locator("button").filter({ hasText: "无门游侠" }).first().click();
  assert.ok(await page.locator('img[alt="无门游侠形象"]').isVisible());
  await page.locator("button").filter({ hasText: "守义" }).first().click();
  await page.locator("button").filter({ hasText: "落笔开卷" }).first().click();
  await waitForScreen("story");

  let current = await readState();
  assert.equal(current.turn, 0);
  assert.equal(current.choices.length, 3);
  assert.equal(current.hero.name, "顾知微");
  assert.equal(current.hero.origin, "wanderer");
  assert.equal(current.location, current.eventLocation);
  const storyShot = await capture("story-opening");
  const chosenChoiceIds = [current.choices[0].id];

  // Exercise the documented keyboard path and verify that the save is usable
  // after a full page reload.
  await page.keyboard.press("1");
  await waitForTurn(1);
  await waitForScreen("outcome");
  current = await readState();
  assert.equal(current.history.length, 1);
  assert.equal(current.choices.length, 0);
  assert.equal(current.outcome.choiceId, chosenChoiceIds[0]);
  assert.ok(current.outcome.lines.length >= 1);
  assert.ok(await page.getByRole("region", { name: "第1回结果" }).isVisible());
  await page.waitForTimeout(450);
  const firstOutcomeShot = await capture("outcome-first");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForScreen("setup");
  assert.ok(await page.locator("button").filter({ hasText: "继续上一卷" }).first().isVisible());
  await page.locator("button").filter({ hasText: "继续上一卷" }).first().click();
  await waitForScreen("outcome");
  current = await readState();
  assert.equal(current.turn, 1);
  assert.equal(current.history.length, 1);
  assert.equal(current.outcome.choiceId, chosenChoiceIds[0]);
  await page.keyboard.press("Enter");
  await waitForScreen("story");
  current = await readState();
  assert.equal(current.location, current.eventLocation);

  await page.getByRole("button", { name: "打开行路图", exact: true }).first().click();
  assert.ok(await page.getByRole("dialog", { name: "行路图" }).isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  assert.ok(await page.getByRole("dialog", { name: "卷外设置" }).isVisible());
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  let forcedHighRisk = false;
  let companionOfferShot = null;
  let companionJoinedShot = null;
  for (let step = 0; step < 14; step += 1) {
    current = await readState();
    if (current.screen === "ending") break;
    assert.equal(current.location, current.eventLocation, "当前地点与事件地点不一致");
    assert.ok(current.choices.length >= 2, "第 " + current.turn + " 回合缺少选择");
    if (current.choices.some((choice) => choice.id === "invite-healer")) {
      await page.waitForTimeout(450);
      companionOfferShot = await capture("companion-offer");
    }
    const cards = page.locator('[aria-label="当前选择"] button');
    assert.equal(await cards.count(), current.choices.length);
    let choiceIndex = current.choices.findIndex((choice) => choice.risk === "低");
    if (!forcedHighRisk) {
      const highRisk = current.choices.findIndex((choice) => choice.risk === "高");
      if (highRisk >= 0) {
        choiceIndex = highRisk;
        forcedHighRisk = true;
      }
    }
    if (choiceIndex < 0) choiceIndex = 0;
    chosenChoiceIds.push(current.choices[choiceIndex].id);
    const selectedChoice = current.choices[choiceIndex];
    const previousTurn = current.turn;
    await cards.nth(choiceIndex).click();
    await waitForTurn(previousTurn + 1);
    await waitForScreen("outcome");
    const outcomeState = await readState();
    assert.equal(outcomeState.outcome.choiceId, selectedChoice.id);
    assert.equal(outcomeState.choices.length, 0, "结算阶段不应提前显示下一回选择");
    assert.ok(outcomeState.outcome.lines.length >= 1, "结算阶段缺少结果文字");
    assert.ok(outcomeState.hero.health >= 0 && outcomeState.hero.health <= outcomeState.hero.maxHealth);
    assert.ok(outcomeState.hero.silver >= 0);
    assert.ok(outcomeState.hero.clues >= 0 && outcomeState.hero.clues <= 6);
    assert.ok(outcomeState.hero.heat >= 0 && outcomeState.hero.heat <= 100);
    assert.equal(outcomeState.location, outcomeState.eventLocation, "结算后的地点与显示地点不一致");
    if (selectedChoice.id === "invite-healer") {
      await page.waitForTimeout(450);
      companionJoinedShot = await capture("companion-joined");
    }
    const isFinalOutcome = outcomeState.turn >= outcomeState.maxTurns;
    await page.getByRole("button", { name: isFinalOutcome ? "查看本卷结局" : "继续下一回", exact: true }).click();
    await waitForScreen(isFinalOutcome ? "ending" : "story");
  }

  current = await readState();
  assert.equal(current.screen, "ending", "长流程未到结局: " + JSON.stringify(current));
  assert.equal(current.turn, current.maxTurns);
  assert.equal(current.history.length, current.maxTurns);
  assert.ok(current.ending && current.ending.title);
  assert.ok(Number.isInteger(current.ending.score));
  assert.ok(current.history.some((entry) => entry.eventId === "lantern-healer"));
  assert.ok(current.companions.length >= 1 && current.companions.length <= 2);
  assert.ok(companionOfferShot && companionJoinedShot, "同行者邀约缺少截图证据");
  await page.waitForTimeout(500);
  assert.ok(await page.getByText("第 12 / 12 回", { exact: true }).isVisible());
  const endingShot = await capture("ending");
  const firstRunFingerprint = runFingerprint(current);

  // A seed is only useful if the same setup and choices reproduce checks,
  // companion identities, resources, and the ending exactly.
  await page.locator("button").filter({ hasText: "再写一卷" }).first().click();
  await page.locator("#wuxia-hero-name").fill("顾知微");
  await page.locator("#wuxia-seed").fill("verify-moon-27");
  await page.locator("button").filter({ hasText: "无门游侠" }).first().click();
  await page.locator("button").filter({ hasText: "守义" }).first().click();
  await page.locator("button").filter({ hasText: "落笔开卷" }).first().click();
  await waitForScreen("story");
  for (let turn = 0; turn < chosenChoiceIds.length; turn += 1) {
    const replayState = await readState();
    const choiceIndex = replayState.choices.findIndex((choice) => choice.id === chosenChoiceIds[turn]);
    assert.ok(choiceIndex >= 0, "重放时找不到第 " + (turn + 1) + " 回选择 " + chosenChoiceIds[turn]);
    await page.locator('[aria-label="当前选择"] button').nth(choiceIndex).click();
    await waitForTurn(turn + 1);
    await waitForScreen("outcome");
    const replayOutcome = await readState();
    assert.equal(replayOutcome.outcome.choiceId, chosenChoiceIds[turn]);
    const isFinalOutcome = replayOutcome.turn >= replayOutcome.maxTurns;
    await page.getByRole("button", { name: isFinalOutcome ? "查看本卷结局" : "继续下一回", exact: true }).click();
    await waitForScreen(isFinalOutcome ? "ending" : "story");
  }
  const replayEnding = await readState();
  assert.equal(replayEnding.screen, "ending");
  assert.deepEqual(runFingerprint(replayEnding), firstRunFingerprint, "相同种子与选择未能复现同一结局");

  // Start a fresh volume at a narrow viewport and check the mobile dock,
  // drawer, and choice cards without relying on hover.
  await page.locator("button").filter({ hasText: "再写一卷" }).first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await assertNoHorizontalOverflow("开局移动端");
  await page.locator("#wuxia-hero-name").fill("沈问棠");
  await page.locator("#wuxia-seed").fill("verify-mobile-01");
  await page.locator("button").filter({ hasText: "镖局护卫" }).first().click();
  assert.ok(await page.locator('img[alt="镖局护卫形象"]').isVisible());
  await page.locator("button").filter({ hasText: "求真" }).first().click();
  await page.locator("button").filter({ hasText: "落笔开卷" }).first().click();
  await waitForScreen("story");
  const mobileState = await readState();
  assert.equal(mobileState.hero.origin, "escort_guard");
  assert.equal(mobileState.hero.sectName, "雁回镖局");
  assert.equal(mobileState.location, "guild_yanhui");
  assert.equal(mobileState.location, mobileState.eventLocation);
  await assertNoHorizontalOverflow("故事移动端");
  await page.getByText("旧卷已收起 · 可重新落笔", { exact: true }).waitFor({ state: "hidden" });
  const visibleTopbarIcons = await page.locator("header button:visible .anticon:visible").count();
  assert.equal(visibleTopbarIcons, 3, "移动端顶栏图标缺失");
  const mobileChoiceBoxes = await page.locator('[aria-label="当前选择"] button').evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  assert.ok(mobileChoiceBoxes.length === 3);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  mobileChoiceBoxes.forEach((box) => {
    assert.ok(box.left >= -1 && box.right <= viewportWidth + 1, "移动端选项越界: " + JSON.stringify(box));
  });
  const mobileShot = await capture("story-mobile");
  await page.locator('[aria-label="当前选择"] button').first().click();
  await waitForTurn(1);
  await waitForScreen("outcome");
  await assertNoHorizontalOverflow("结算移动端");
  assert.ok(await page.getByRole("region", { name: "第1回结果" }).isVisible());
  assert.ok(await page.getByRole("button", { name: "继续下一回", exact: true }).isVisible());
  await page.waitForTimeout(450);
  const mobileOutcomeShot = await capture("outcome-mobile");
  await page.keyboard.press(" ");
  await waitForScreen("story");
  await page.getByRole("button", { name: "打开行路图", exact: true }).last().click();
  assert.ok(await page.getByRole("dialog", { name: "行路图" }).isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);

  assert.deepEqual(consoleErrors, [], "浏览器控制台错误: " + JSON.stringify(consoleErrors));
  assert.deepEqual(failedResponses, [], "页面失败请求: " + JSON.stringify(failedResponses));
  console.log(JSON.stringify({
    ok: true,
    setupShot,
    setup2kShot,
    setup2kTypography,
    storyShot,
    firstOutcomeShot,
    companionOfferShot,
    companionJoinedShot,
    endingShot,
    mobileShot,
    mobileOutcomeShot,
    ending: current.ending,
    history: current.history.length,
    screenshots: artifactDirectory,
  }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
