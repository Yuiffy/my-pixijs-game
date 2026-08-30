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

const forbiddenMainline = /沉星渡|归潮阁|opening-oath|tea-whisper|bridge-ambush|final-confrontation/;
const forbiddenRuleProse = /施法距离|攻击距离|最大生命值|能量|技能护盾|本局开始|本局生成|随本局|逐招演算|骰签|检定成功|检定未过|\d+(?:\.\d+)?\s*秒|\d+(?:\.\d+)?\s*点(?:气力|积怨)|\d+(?:\.\d+)?%\s*(?:火候|熟练)/;
const relationTypesRequired = ["sibling", "enemy", "master", "disciple", "sect_sibling"];

const eventArchetype = (eventId = "") => {
  if (eventId.startsWith("sandbox:")) return "encounter";
  return eventId.match(/^sandbox-([^:]+)/)?.[1] || "unknown";
};

const assertImmersiveProse = (state) => {
  const prose = JSON.stringify({
    event: state.eventProse,
    signatures: state.narrative.cast.map((character) => character.signatureDescription),
    outcome: state.outcome ? {
      revealTitle: state.outcome.revealTitle,
      revealLead: state.outcome.revealLead,
      resultParagraphs: state.outcome.resultParagraphs,
    } : null,
    scenes: state.manuscript.chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({
      paragraphs: scene.paragraphs,
      consequence: scene.consequence,
    }))),
    ending: state.ending,
  });
  assert.doesNotMatch(prose, forbiddenRuleProse, `小说文本泄漏规则数值: ${prose.match(forbiddenRuleProse)?.[0]}`);
};

const runFingerprint = (state) => ({
  hero: state.hero,
  companions: state.companions,
  location: state.location,
  history: state.history,
  world: state.world,
  narrative: state.narrative,
  chapters: state.manuscript.chapters,
  ending: state.ending,
});

const assertWorldIntegrity = (state) => {
  assert.equal(state.version, 6, "存档版本不是玩家主动生涯 v6");
  assert.equal(state.narrative.mode, "emergent_sandbox");
  assert.ok(state.world && Number.isInteger(state.world.day), "缺少可序列化世界状态");
  assert.equal(state.world.locations.length, 12, "江湖地点数量不正确");
  assert.equal(state.world.actors.length, 9 + state.content.characterCount, "世界人物数量没有包含内容包角色");
  assert.equal(state.narrative.cast.length, 8 + state.content.characterCount, "叙事人物数量没有包含内容包角色");
  assert.equal(state.world.manuals.length, 3, "每局应有三册真实流转的角色招式抄本");
  assert.ok(state.narrative.cast.every((character) => character.sourceName && character.signatureMove && character.desire), "人物缺少原型、招式或目标");
  const activeFactionIds = new Set(state.narrative.cast.map((character) => character.factionId));
  ["huanzhen", "xingyou", "sixi", "free"].forEach((factionId) => assert.ok(activeFactionIds.has(factionId), `活跃人物未覆盖 ${factionId}`));
  assert.ok(state.narrative.factions.some((faction) => faction.sourceLabel?.includes("VirtuaReal")), "缺少 VirtuaReal 武侠化势力");
  assert.ok(state.narrative.factions.some((faction) => faction.sourceLabel?.includes("PSPLive")), "缺少 PSPLive 武侠化势力");
  assert.ok(state.narrative.factions.some((faction) => faction.sourceLabel?.includes("四禧丸子")), "缺少四禧丸子武侠化势力");
  relationTypesRequired.forEach((type) => assert.ok(state.world.relationTypes.includes(type), `本局关系图缺少 ${type}`));
  if (state.turn === 0) assert.ok(state.world.hiddenRelationCount > 0, "秘密关系不应在开局全部公开");

  const actorNames = state.world.actors.map((actor) => actor.name);
  assert.equal(new Set(actorNames).size, actorNames.length, "世界人物姓名应当全局唯一");
  assert.ok(state.world.actors.filter((actor) => actor.id !== "hero").every((actor) => actor.goals.length && actor.locationId && actor.stayUntilDay >= 1), "NPC 缺少地点、停留或个人目标");

  const locations = new Map(state.world.locations.map((location) => [location.id, location]));
  state.world.locations.forEach((location) => {
    location.connections.forEach((targetId) => {
      assert.ok(locations.has(targetId), `地点 ${location.id} 指向不存在的 ${targetId}`);
      assert.ok(locations.get(targetId).connections.includes(location.id), `路径 ${location.id} -> ${targetId} 不是双向连接`);
    });
  });
  state.world.movements.forEach((movement) => {
    assert.ok(locations.get(movement.fromLocationId)?.connections.includes(movement.toLocationId), `人物发生瞬移: ${JSON.stringify(movement)}`);
  });
  state.world.actors.forEach((actor) => assert.ok(locations.has(actor.locationId), `人物 ${actor.name} 位于无效地点 ${actor.locationId}`));
  assert.equal(state.world.actors.find((actor) => actor.id === "hero")?.locationId, state.location, "主角世界坐标与界面地点不一致");
  state.world.encounters.forEach((encounter) => assert.ok(encounter.dramaticChance > encounter.baseChance, `戏剧调度没有提高相遇概率: ${JSON.stringify(encounter)}`));
  if (state.eventId) assert.match(state.eventId, /^(?:sandbox|campaign)(?:-|:)/, `出现非沙盘事件 ${state.eventId}`);
  if (state.world.eventDirector) {
    assert.match(state.world.eventDirector.selectedEventId, /^(?:sandbox|campaign)(?:-|:)/, "导演选中了旧主线事件");
    state.world.eventDirector.candidates.forEach((candidate) => {
      assert.match(candidate.eventId, /^(?:sandbox|campaign|activity)(?:-|:)/, `候选池混入旧主线事件 ${candidate.eventId}`);
      assert.ok(candidate.kind && candidate.archetype, `v5 候选缺少类别或原型: ${JSON.stringify(candidate)}`);
    });
  }
  assert.doesNotMatch(JSON.stringify({ eventId: state.eventId, event: state.event, history: state.history, ending: state.ending, manuscript: state.manuscript }), forbiddenMainline, "运行状态泄漏旧沉星渡主线");
  assertImmersiveProse(state);
};

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
    const screenshots = {};
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
    });

    const readState = async () => parseState(await page.evaluate(() => window.render_game_to_text?.() || ""));
    const waitForScreen = async (screen) => {
      await page.waitForFunction((expected) => {
        const raw = window.render_game_to_text?.();
        if (!raw) return false;
        try {
          return JSON.parse(raw).screen === expected;
        } catch {
          return false;
        }
      }, screen);
    };
    const waitForTurn = async (turn) => {
      await page.waitForFunction((expected) => {
        const raw = window.render_game_to_text?.();
        if (!raw) return false;
        try {
          return JSON.parse(raw).turn === expected;
        } catch {
          return false;
        }
      }, turn);
    };
    const capture = async (name, locator) => {
      const path = `${artifactDirectory}/${name}.png`;
      const buffer = locator ? await locator.screenshot({ path }) : await page.screenshot({ path, fullPage: true });
      screenshots[name] = { path, ...inspectPng(buffer) };
      return screenshots[name];
    };
    const assertNoHorizontalOverflow = async (label) => {
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
      assert.ok(overflow <= 1, `${label} 横向溢出 ${overflow}px`);
    };
    const fontSizeOf = async (locator) => Number.parseFloat(await locator.evaluate((element) => getComputedStyle(element).fontSize));
    const assertOpaqueDrawer = async (locator, label) => {
      await locator.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
      });
      const style = await locator.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { backgroundColor: computed.backgroundColor, opacity: computed.opacity };
      });
      assert.equal(style.opacity, "1", `${label} 整体透明度异常: ${JSON.stringify(style)}`);
      assert.equal(style.backgroundColor, "rgb(16, 25, 30)", `${label} 背景不是预期实色: ${JSON.stringify(style)}`);
    };
    const freshSetup = async () => {
      await page.goto(baseUrl + "/game/wuxia", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => window.localStorage.clear());
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(window.render_game_to_text));
      await waitForScreen("edition-select");
      await page.getByRole("button", { name: "进入开放江湖", exact: true }).click();
      await waitForScreen("setup");
    };
    const startRun = async ({ seed, name = "顾知微", origin = "无门游侠", ambition = "守义" }) => {
      await freshSetup();
      await page.locator("#wuxia-hero-name").fill(name);
      await page.locator("#wuxia-seed").fill(seed);
      await page.locator("button").filter({ hasText: origin }).first().click();
      await page.locator("button").filter({ hasText: ambition }).first().click();
      await page.locator("button").filter({ hasText: "落笔开卷" }).first().click();
      await waitForScreen("agenda");
      await page.waitForFunction(() => window.scrollY === 0);
      const state = await readState();
      assertWorldIntegrity(state);
      return state;
    };
    const openMap = async () => {
      await page.locator('button[aria-label="打开行路图"]:visible').first().click();
      const dialog = page.getByRole("dialog", { name: "行路图" });
      assert.ok(await dialog.isVisible());
      assert.equal(await dialog.locator("line").count(), 22, "行路图没有渲染 22 条真实双向路径");
      await assertOpaqueDrawer(dialog, "行路图抽屉");
      return dialog;
    };
    const openCast = async () => {
      await page.locator('button[aria-label="打开同行者"]:visible, button[aria-label="打开人物与江湖"]:visible').first().click();
      const dialog = page.getByRole("dialog", { name: "人物与江湖" });
      assert.ok(await dialog.isVisible());
      assert.ok(await dialog.getByText("关系网", { exact: true }).isVisible());
      assert.ok(await dialog.getByText("武学谱", { exact: true }).isVisible());
      assert.ok(await dialog.getByText("原型", { exact: true }).first().isVisible());
      await assertOpaqueDrawer(dialog, "人物与江湖抽屉");
      return dialog;
    };

    await freshSetup();
    const setupNameInput = page.locator("#wuxia-hero-name");
    const setupSeedInput = page.locator("#wuxia-seed");
    const randomNameButton = page.getByRole("button", { name: "随机一个名字", exact: true });
    const randomSeedButton = page.getByRole("button", { name: "随机命数与活跃江湖人物", exact: true });
    await page.waitForFunction(() => {
      const input = document.querySelector("#wuxia-hero-name");
      return input && input.value !== "沈听澜";
    });
    const initialIndependentName = await setupNameInput.inputValue();
    const initialStorySeed = await setupSeedInput.inputValue();
    const nameSequence = [initialIndependentName];
    for (let index = 0; index < 6; index += 1) {
      const previousName = nameSequence[nameSequence.length - 1];
      await randomNameButton.click();
      await page.waitForFunction((previous) => {
        const input = document.querySelector("#wuxia-hero-name");
        return input && input.value !== previous;
      }, previousName);
      nameSequence.push(await setupNameInput.inputValue());
      assert.equal(await setupSeedInput.inputValue(), initialStorySeed, "随机姓名不应修改剧情种子");
    }
    assert.ok(nameSequence.every((name, index) => index === 0 || name !== nameSequence[index - 1]), `连续随机姓名出现停滞: ${JSON.stringify(nameSequence)}`);

    const fixedStorySeed = "name-independent-story-seed";
    await setupSeedInput.fill(fixedStorySeed);
    const nameBeforeFixedSeedShuffle = await setupNameInput.inputValue();
    await randomNameButton.click();
    await page.waitForFunction((previous) => {
      const input = document.querySelector("#wuxia-hero-name");
      return input && input.value !== previous;
    }, nameBeforeFixedSeedShuffle);
    assert.equal(await setupSeedInput.inputValue(), fixedStorySeed, "固定剧情种子时随机姓名修改了种子");
    const nameBeforeStoryShuffle = await setupNameInput.inputValue();
    await randomSeedButton.click();
    await page.waitForFunction((previous) => {
      const input = document.querySelector("#wuxia-seed");
      return input && input.value !== previous;
    }, fixedStorySeed);
    assert.equal(await setupNameInput.inputValue(), nameBeforeStoryShuffle, "随机剧情种子不应顺带修改姓名");
    const nameRandomization = {
      initial: initialIndependentName,
      sequence: nameSequence,
      fixedSeed: fixedStorySeed,
      randomizedSeed: await setupSeedInput.inputValue(),
      namePreservedAcrossSeedShuffle: nameBeforeStoryShuffle,
    };

    if (process.env.WUXIA_NAME_ONLY === "1") {
      await capture("setup-name-randomization");
      assert.deepEqual(consoleErrors, [], `浏览器控制台错误: ${JSON.stringify(consoleErrors)}`);
      assert.deepEqual(failedResponses, [], `页面失败请求: ${JSON.stringify(failedResponses)}`);
      console.log(JSON.stringify({ ok: true, nameRandomization, screenshots }, null, 2));
      return;
    }

    if (process.env.WUXIA_V6_SMOKE === "1") {
      const settleCampaignView = () => page.waitForTimeout(500);
      await freshSetup();
      await setupNameInput.fill("顾知微");
      await setupSeedInput.fill("verify-player-led-v6");
      await page.locator("button").filter({ hasText: "门派弟子" }).first().click();
      await page.locator("button").filter({ hasText: "求真" }).first().click();
      await page.getByRole("button", { name: /落笔开卷/ }).click();
      await waitForScreen("agenda");
      let campaignState = await readState();
      assert.equal(campaignState.version, 6);
      assert.equal(campaignState.phase, "choose_agenda");
      assert.ok(campaignState.content.packs.length >= 1, "内容包注册表为空");
      await settleCampaignView();
      await capture("campaign-agenda");

      await page.getByRole("region", { name: "选择长期路线" }).locator("button").first().click();
      await waitForScreen("planning");
      campaignState = await readState();
      assert.equal(campaignState.phase, "planning");
      assert.ok(campaignState.campaign.agenda, "路线选择没有写入状态");
      assert.ok(campaignState.campaign.activities.some((activity) => activity.enabled), "没有可执行的主动活动");
      await settleCampaignView();
      await capture("campaign-planning");

      for (let sceneIndex = 1; sceneIndex <= 3; sceneIndex += 1) {
        campaignState = await readState();
        const enabledIndex = campaignState.campaign.activities.findIndex((activity) => activity.enabled);
        assert.ok(enabledIndex >= 0, `第 ${sceneIndex} 幕没有可执行活动`);
        await page.getByRole("region", { name: "可安排活动" }).locator("button").nth(enabledIndex).click();
        await waitForScreen("story");
        campaignState = await readState();
        assert.equal(campaignState.phase, "scene");
        assert.ok(campaignState.choices.length >= 2, `第 ${sceneIndex} 幕缺少选择`);
        if (sceneIndex === 1) {
          await settleCampaignView();
          await capture("campaign-scene");
        }

        await page.getByRole("region", { name: "当前选择" }).locator("button").first().click();
        await waitForScreen("outcome");
        campaignState = await readState();
        assert.equal(campaignState.turn, sceneIndex);
        assert.equal(campaignState.phase, "outcome");
        if (sceneIndex === 1) {
          await settleCampaignView();
          await capture("campaign-outcome");
        }

        const continueName = sceneIndex === 3 ? "查看本章小结" : "回到行程安排";
        await page.getByRole("button", { name: continueName, exact: true }).click();
        await waitForScreen(sceneIndex === 3 ? "chapter_break" : "planning");
      }

      campaignState = await readState();
      assert.equal(campaignState.phase, "chapter_break");
      assert.equal(campaignState.chapterScene, 3);
      assert.ok(campaignState.campaign.milestone, "三幕后没有生成章节里程碑");
      await settleCampaignView();
      await capture("campaign-chapter-break");
      await page.getByRole("button", { name: "开启下一章", exact: true }).click();
      await waitForScreen("planning");
      campaignState = await readState();
      assert.match(campaignState.chapter, /^2 · /, "没有进入第二章");
      assert.equal(campaignState.chapterScene, 0);
      assert.ok(campaignState.campaign.activities.some((activity) => activity.enabled), "第二章没有可安排活动");
      await settleCampaignView();
      await capture("campaign-chapter-two");

      await page.setViewportSize({ width: 390, height: 844 });
      await freshSetup();
      await setupNameInput.fill("苏照野");
      await setupSeedInput.fill("verify-player-led-v6-mobile");
      await page.getByRole("button", { name: /落笔开卷/ }).click();
      await waitForScreen("agenda");
      await assertNoHorizontalOverflow("移动端路线选择");
      await settleCampaignView();
      await capture("campaign-agenda-mobile");
      await page.getByRole("region", { name: "选择长期路线" }).locator("button").first().click();
      await waitForScreen("planning");
      await assertNoHorizontalOverflow("移动端行程安排");
      await settleCampaignView();
      await capture("campaign-planning-mobile");

      assert.deepEqual(consoleErrors, [], `浏览器控制台错误: ${JSON.stringify(consoleErrors)}`);
      assert.deepEqual(failedResponses, [], `页面失败请求: ${JSON.stringify(failedResponses)}`);
      console.log(JSON.stringify({
        ok: true,
        nameRandomization,
        campaign: {
          phase: campaignState.phase,
          chapter: campaignState.chapter,
          agenda: campaignState.campaign.agenda,
          activityCount: campaignState.campaign.activities.length,
          installedPackIds: campaignState.campaign.installedPackIds,
        },
        screenshots,
      }, null, 2));
      return;
    }

    await page.setViewportSize({ width: 2560, height: 1440 });
    await assertNoHorizontalOverflow("2K 开局");
    const originOption = page.locator("button").filter({ hasText: "门派弟子" }).first();
    const setup2kTypography = {
      fieldLabel: await fontSizeOf(page.getByText("命数种子", { exact: true })),
      optionTitle: await fontSizeOf(originOption.locator("strong")),
      optionDescription: await fontSizeOf(originOption.locator("small")),
      worldPreview: await fontSizeOf(page.getByText("此卷活跃人物", { exact: true })),
      footnote: await fontSizeOf(page.getByText(/角色与招式取材自项目自走棋/)),
    };
    assert.ok(setup2kTypography.fieldLabel >= 14, `2K 字段标签过小: ${JSON.stringify(setup2kTypography)}`);
    assert.ok(setup2kTypography.optionTitle >= 16, `2K 选项标题过小: ${JSON.stringify(setup2kTypography)}`);
    assert.ok(setup2kTypography.optionDescription >= 14, `2K 选项说明过小: ${JSON.stringify(setup2kTypography)}`);
    assert.ok(setup2kTypography.worldPreview >= 14, `2K 人物预览过小: ${JSON.stringify(setup2kTypography)}`);
    assert.ok(setup2kTypography.footnote >= 13, `2K 页脚说明过小: ${JSON.stringify(setup2kTypography)}`);
    await capture("setup-2k");
    await page.setViewportSize({ width: 1440, height: 900 });

    const runScene = async ({ activity, choose, captureName }) => {
      const before = await readState();
      assert.equal(before.screen, "planning");
      const activityIndex = before.campaign.activities.findIndex(activity);
      assert.ok(activityIndex >= 0, `找不到预期活动: ${JSON.stringify(before.campaign.activities)}`);
      const selectedActivity = before.campaign.activities[activityIndex];
      assert.ok(selectedActivity.enabled, `活动不可执行: ${JSON.stringify(selectedActivity)}`);
      await page.getByRole("region", { name: "可安排活动" }).locator("button").nth(activityIndex).click();
      await waitForScreen("story");
      const scene = await readState();
      assertWorldIntegrity(scene);
      const choiceRegion = page.getByRole("region", { name: "当前选择" });
      const visibleChoiceText = await choiceRegion.innerText();
      assert.doesNotMatch(visibleChoiceText, /\d+(?:\.\d+)?%|检定/, `选择区泄漏概率或检定术语: ${visibleChoiceText}`);
      const choiceIndex = scene.choices.findIndex(choose || (() => true));
      assert.ok(choiceIndex >= 0, `找不到预期选择: ${JSON.stringify(scene.choices)}`);
      await choiceRegion.locator("button").nth(choiceIndex).click();
      await waitForTurn(before.turn + 1);
      await waitForScreen("outcome");
      const outcome = await readState();
      assert.equal(outcome.choices.length, 0, "结算阶段提前展示了下一幕选择");
      assertImmersiveProse(outcome);
      const outcomeText = await page.locator("#wuxia-turn-outcome").innerText();
      assert.doesNotMatch(outcomeText, /胜算\s*\d+(?:\.\d+)?%|掷签|检定成功|检定未过/, `结算区泄漏概率或掷签术语: ${outcomeText}`);
      assert.doesNotMatch(outcomeText, /(?:\d+\/\d+)\s*(?:气力|内力)|伤害\s*[+-]?\d+|(?:内力|对手气力)\s*\d+|(?:气血|武艺|洞察|侠义|名望|机缘|风声)\s*[+-]\d+/, `结算区泄漏规则数值: ${outcomeText}`);
      if (outcome.outcome?.combat) {
        assert.match(outcomeText, /交手实录/, "战斗结算缺少文学化交手实录");
        assert.doesNotMatch(outcomeText, /逐招战斗演算|距离、内力、冷却/, "战斗结算仍显示调试式演算术语");
      }
      const resolvedCaptureName = typeof captureName === "function" ? captureName(outcome) : captureName;
      if (resolvedCaptureName) {
        await page.waitForTimeout(450);
        await capture(resolvedCaptureName);
      }
      await page.getByRole("button", { name: outcome.turn % outcome.chapterLength === 0 ? "查看本章小结" : "回到行程安排", exact: true }).click();
      await waitForScreen(outcome.turn % outcome.chapterLength === 0 ? "chapter_break" : "planning");
      if (outcome.turn % outcome.chapterLength === 0) {
        await page.getByRole("button", { name: "开启下一章", exact: true }).click();
        await waitForScreen("planning");
      }
      return { scene, outcome, planning: await readState(), selectedActivity };
    };

    let current = await startRun({ seed: "verify-player-led-v6-long", name: "顾知微", origin: "门派弟子", ambition: "雪恨" });
    await page.getByRole("region", { name: "选择长期路线" }).locator("button").filter({ hasText: "请剑下山" }).click();
    await waitForScreen("planning");
    current = await readState();
    assert.equal(current.phase, "planning");
    assert.ok(current.campaign.activities.some((activity) => activity.opportunityStage === "prepare"), "没有可提前抵达的限时机会");
    await capture("v6-long-planning");

    const preparation = await runScene({
      activity: (activity) => activity.opportunityStage === "prepare",
      choose: (choice) => choice.id.startsWith("campaign-opportunity-prepare-rules:"),
      captureName: "v6-opportunity-preparation",
    });
    const opportunityId = preparation.selectedActivity.opportunityId;
    assert.ok(opportunityId, "提前赴会活动缺少 opportunityId");
    assert.notEqual(preparation.outcome.campaign.opportunities.find((entry) => entry.id === opportunityId)?.status, "attended", "提前抵达被误算成正式参加");
    assert.equal(preparation.outcome.campaign.leads.find((lead) => lead.opportunityId === opportunityId)?.status, "active", "提前抵达后机会线索没有保持进行中");

    let opportunityResult;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      current = await readState();
      const target = current.campaign.activities.find((activity) => activity.opportunityId === opportunityId);
      assert.ok(target, `等待第 ${attempt + 1} 幕时机会消失`);
      opportunityResult = await runScene({
        activity: (activity) => activity.id === target.id,
        choose: (choice) => choice.id.startsWith("sandbox-duel:") || choice.id.startsWith("campaign-opportunity-study:") || choice.id.startsWith("campaign-opportunity-prepare-rules:"),
        captureName: target.opportunityStage === "attend" ? "v6-opportunity-attended" : undefined,
      });
      if (opportunityResult.outcome.campaign.opportunities.find((entry) => entry.id === opportunityId)?.status === "attended") break;
    }
    assert.ok(opportunityResult, "没有执行机会活动");
    assert.equal(opportunityResult.outcome.campaign.opportunities.find((entry) => entry.id === opportunityId)?.status, "attended", "正式参加后机会未标记 attended");
    assert.equal(opportunityResult.outcome.campaign.leads.find((lead) => lead.opportunityId === opportunityId)?.status, "resolved", "正式参加后机会线索未结清");
    assert.ok(!opportunityResult.planning.campaign.activities.some((activity) => activity.opportunityId === opportunityId), "已参加盛会仍重复出现在活动列表");

    let factionKnowledgeId = Object.entries(opportunityResult.outcome.campaign.factionKnowledge)
      .find(([, knowledge]) => knowledge.encounters?.length)?.[0];
    if (!factionKnowledgeId) {
      const lead = opportunityResult.planning.campaign.leads.find((entry) => {
        const actor = opportunityResult.planning.world.actors.find((candidate) => candidate.id === entry.targetActorId);
        return entry.kind === "person" && entry.targetActorId && entry.status !== "expired" && actor?.factionId !== "home";
      });
      assert.ok(lead, "没有可追寻的异派人物用于验证战斗");
      const leadArticle = page.getByRole("region", { name: "人物追寻目标" }).locator("article").filter({ hasText: opportunityResult.planning.world.actors.find((actor) => actor.id === lead.targetActorId)?.name }).first();
      await leadArticle.getByRole("button", { name: "复仇", exact: true }).click();
      await page.waitForFunction((leadId) => {
        const raw = window.render_game_to_text?.();
        return raw && JSON.parse(raw).campaign.leads.find((entry) => entry.id === leadId)?.intent === "revenge";
      }, lead.id);
      const battle = await runScene({
        activity: (activity) => activity.leadId === lead.id,
        choose: (choice) => choice.id.startsWith("sandbox-confront:"),
        captureName: "v6-faction-combat",
      });
      factionKnowledgeId = Object.entries(battle.outcome.campaign.factionKnowledge)
        .find(([, knowledge]) => knowledge.encounters?.length)?.[0];
      opportunityResult = battle;
    }
    assert.ok(factionKnowledgeId, "异派战斗后没有形成门派辨识账");
    const factionKnowledge = opportunityResult.outcome.campaign.factionKnowledge[factionKnowledgeId];
    assert.ok(factionKnowledge.recognizedTechniqueIds.length > 0, "门派辨识没有记录具体招式");
    assert.ok(factionKnowledge.encounters.length > 0, "门派辨识没有记录交手后果");
    assert.ok(factionKnowledge.encounters.at(-1).consequence, "交手账没有门派后果说明");

    const castDialog = await openCast();
    assert.ok(await castDialog.getByText(/辨招把握/).first().isVisible(), "势力志没有展示门派辨识");
    assert.ok(await castDialog.getByText(/往来(?:转暖|转冷|未改) · 戒心(?:加深|稍解|未改)/).first().isVisible(), "势力志没有展示交手态度变化");
    const factionLedgerText = await castDialog.innerText();
    assert.doesNotMatch(factionLedgerText, /辨招把握\s*\d+|往来\s*[+-]?\d+|戒心\s*[+-]?\d+|牵系\s*\d+/, "人物谱仍泄漏关系或辨招内部数值");
    await castDialog.getByText("势力志", { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await capture("v6-faction-ledger", castDialog);
    await page.keyboard.press("Escape");

    while ((await readState()).turn < 14) {
      current = await readState();
      const preferred = current.campaign.activities.find((activity) => activity.kind === "train" && activity.enabled)
        || current.campaign.activities.find((activity) => activity.enabled);
      assert.ok(preferred, `第 ${current.turn + 1} 幕没有可执行活动`);
      await runScene({
        activity: (activity) => activity.id === preferred.id,
        choose: preferred.kind === "train"
          ? (choice) => choice.id.startsWith("campaign-train:")
          : undefined,
      });
    }
    current = await readState();
    assert.ok(current.turn >= 14, "世界仍在固定十二幕附近结束");
    assert.equal(current.screen, "planning");
    assert.equal(current.ending, null);
    assert.ok(current.manuscript.chapters.filter((chapter) => chapter.sceneCount > 0).length >= 5, "第十三幕以后没有生成新章节");
    assert.ok(current.campaign.activities.some((activity) => activity.enabled), "第十四幕后没有后续活动");
    assert.doesNotMatch(JSON.stringify(current.manuscript), forbiddenMainline, "长流程手稿泄漏旧沉星渡主线");
    assertImmersiveProse(current);
    await capture("v6-beyond-thirteen");

    let reputationScenes = 0;
    while (!current.campaign.activities.some((activity) => activity.kind === "invent" && activity.enabled)) {
      const recovery = current.campaign.activities.find((activity) => activity.kind === "rest" && activity.enabled);
      const publicOpportunity = current.campaign.activities.find((activity) => {
        if (activity.kind !== "opportunity" || !activity.enabled) return false;
        const opportunity = current.campaign.opportunities.find((entry) => entry.id === activity.opportunityId);
        return activity.opportunityStage === "prepare" || opportunity?.type !== "secret_realm";
      });
      const publicTravel = current.campaign.activities.find((activity) => activity.kind === "travel" && activity.enabled);
      const reputationActivity = recovery || publicOpportunity || publicTravel;
      assert.ok(reputationActivity, `第 ${current.turn + 1} 幕缺少可公开积累名望的活动`);
      const result = await runScene({
        activity: (activity) => activity.id === reputationActivity.id,
        choose: recovery
          ? (choice) => choice.id === "gather-news"
          : publicOpportunity
            ? publicOpportunity.opportunityStage === "prepare"
              ? (choice) => choice.id.startsWith("campaign-opportunity-prepare-help:")
              : (choice) => choice.id.startsWith("campaign-opportunity-social:") || choice.id.startsWith("sandbox-duel:")
            : (choice) => choice.id.startsWith("campaign-travel-help:"),
      });
      current = result.planning;
      reputationScenes += 1;
      assert.ok(reputationScenes <= 8, `积累名望后仍未解锁创招: ${JSON.stringify(current.campaign.legacy)}`);
    }

    let inventionResult;
    for (let attempt = 0; attempt < 8 && !current.campaign.legacy.authoredTechniques.length; attempt += 1) {
      inventionResult = await runScene({
        activity: (activity) => activity.kind === "invent" && activity.enabled,
        choose: (choice) => choice.id === "campaign-invent:break",
        captureName: (outcome) => outcome.outcome?.success ? "v6-invented-technique" : undefined,
      });
      current = inventionResult.planning;
    }
    assert.ok(inventionResult?.outcome.outcome?.success, "创招检定连续失败，未形成浏览器验收样本");
    const authoredTechnique = current.campaign.legacy.authoredTechniques.at(-1);
    assert.ok(authoredTechnique, "创招成功后没有写入自创武学");
    assert.ok(current.world.techniques.some((technique) => technique.id === authoredTechnique.id), "自创招式没有进入世界武学定义");
    assert.ok(current.world.actors.find((actor) => actor.id === "hero")?.techniques.some((known) => known.techniqueId === authoredTechnique.id && known.source === "自创"), "主角没有真正习得自创招式");

    const followerIdsBeforeTeaching = new Set(current.campaign.legacy.followerActorIds);
    const firstTeaching = await runScene({
      activity: (activity) => activity.kind === "found_sect" && activity.enabled,
      choose: (choice) => choice.id === "campaign-found-sect:school",
      captureName: "v6-first-teaching-hall",
    });
    current = firstTeaching.planning;
    const firstStudentId = current.campaign.legacy.followerActorIds.find((actorId) => !followerIdsBeforeTeaching.has(actorId));
    assert.ok(firstStudentId && current.world.actors.some((actor) => actor.id === firstStudentId), "第一次传艺没有留下真实人物 ID");

    const secondTeaching = await runScene({
      activity: (activity) => activity.kind === "found_sect" && activity.enabled,
      choose: (choice) => choice.id === "campaign-found-sect:school",
      captureName: "v6-second-teaching-hall",
    });
    current = secondTeaching.planning;
    const secondStudentId = current.campaign.legacy.followerActorIds.find((actorId) => actorId !== firstStudentId && !followerIdsBeforeTeaching.has(actorId));
    assert.ok(secondStudentId && current.world.actors.some((actor) => actor.id === secondStudentId), "第二次传艺没有留下另一名真实人物 ID");
    assert.equal(current.campaign.legacy.followers, current.campaign.legacy.followerActorIds.length, "追随者数量与人物名册不一致");

    let foundingPreparationScenes = 0;
    while (!current.campaign.activities.some((activity) => activity.kind === "found_sect" && activity.title === "择地开宗立派" && activity.enabled)) {
      const teaching = current.campaign.activities.find((activity) => activity.kind === "found_sect" && activity.enabled);
      const recovery = current.campaign.activities.find((activity) => activity.kind === "rest" && activity.enabled);
      const travel = current.campaign.activities.find((activity) => activity.kind === "travel" && activity.enabled);
      const preparationActivity = teaching || recovery || travel;
      assert.ok(preparationActivity, `第 ${current.turn + 1} 幕缺少继续积累名望或传艺的活动`);
      const result = await runScene({
        activity: (activity) => activity.id === preparationActivity.id,
        choose: teaching
          ? (choice) => choice.id === "campaign-found-sect:school"
          : recovery
            ? (choice) => choice.id === "gather-news"
            : (choice) => choice.id.startsWith("campaign-travel-help:"),
      });
      current = result.planning;
      foundingPreparationScenes += 1;
      assert.ok(foundingPreparationScenes <= 8, `追随者已足够但创派仍未解锁: ${JSON.stringify(current.campaign.legacy)}`);
    }

    const foundingResult = await runScene({
      activity: (activity) => activity.kind === "found_sect" && activity.enabled,
      choose: (choice) => choice.id === "campaign-found-sect:open",
      captureName: "v6-sect-founded",
    });
    current = foundingResult.planning;
    const foundedSect = current.campaign.legacy.foundedSect;
    assert.ok(foundedSect, "正式开山后没有生成玩家门派");
    assert.equal(current.hero.sectId, foundedSect.id, "创派后主角身份没有切换到新门派");
    assert.ok(current.narrative.factions.some((faction) => faction.id === foundedSect.id), "玩家门派没有进入势力志");
    assert.equal(current.world.martialArts.find((art) => art.id === "art_hero_authored")?.factionId, foundedSect.id, "自创传承没有归入玩家门派");

    const legacyDialog = await openCast();
    assert.ok(await legacyDialog.getByText(authoredTechnique.name, { exact: true }).first().isVisible(), "武学谱没有展示自创招式");
    assert.ok(await legacyDialog.getByText(foundedSect.name, { exact: true }).first().isVisible(), "武学谱没有展示新门派");
    for (const actorId of [firstStudentId, secondStudentId]) {
      const followerName = current.world.actors.find((actor) => actor.id === actorId)?.name;
      assert.ok(followerName && await legacyDialog.getByText(new RegExp(followerName)).first().isVisible(), `武学谱没有展示追随者 ${followerName}`);
    }
    assert.doesNotMatch(await legacyDialog.innerText(), /\b(?:huanzhen|xingyou|sixi|free|home|hero)\b|player_sect_\d+/, "武学谱泄漏内部势力 ID");
    await legacyDialog.getByText("你的传承", { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await capture("v6-founded-sect-ledger", legacyDialog);
    await page.keyboard.press("Escape");

    const stateBeforeReload = runFingerprint(current);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForScreen("setup");
    await page.getByRole("button", { name: /继续上一卷/ }).click();
    await waitForScreen("planning");
    current = await readState();
    assert.deepEqual(runFingerprint(current), stateBeforeReload, "第十三幕以后刷新续卷丢失世界状态");

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow("移动端长流程规划");
    await capture("v6-beyond-thirteen-mobile");
    const mobileCast = await openCast();
    await assertNoHorizontalOverflow("移动端势力账");
    await mobileCast.getByText("势力志", { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await capture("v6-faction-ledger-mobile", mobileCast);
    await page.keyboard.press("Escape");

    assert.deepEqual(consoleErrors, [], `浏览器控制台错误: ${JSON.stringify(consoleErrors)}`);
    assert.deepEqual(failedResponses, [], `页面失败请求: ${JSON.stringify(failedResponses)}`);
    console.log(JSON.stringify({
      ok: true,
      nameRandomization,
      setup2kTypography,
      longCampaign: {
        turn: current.turn,
        chapter: current.chapter,
        day: current.world.day,
        opportunityId,
        factionKnowledgeId,
        legacy: current.campaign.legacy,
        installedPackIds: current.campaign.installedPackIds,
      },
      screenshots,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
