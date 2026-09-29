const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

const base = process.env.MARRIAGE_BASE_URL || "http://127.0.0.1:3910";
const output = process.env.MARRIAGE_QA_DIR || "tmp/family-v6-browser";
const only = process.env.MARRIAGE_VIEWPORTS ? process.env.MARRIAGE_VIEWPORTS.split(",") : null;
const shots = [];
const errors = [];
mkdirSync(output, { recursive: true });

const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const tid = (page, id) => page.getByTestId(id);

// 3D 场景按需渲染：等两帧再截图，避免拍到上一帧
async function settle(page, ms = 450) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(ms);
}

async function capture(page, name, expectScene) {
  await settle(page);
  const state = await read(page);
  if (expectScene) assert.equal(state.scene, expectScene, `${name}: 场景应为 ${expectScene}，实际 ${state.scene}`);
  const dom = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    width: innerWidth,
    height: innerHeight,
    canvases: [...document.querySelectorAll("canvas")].map(canvas => ({ width: canvas.width, height: canvas.height })),
  }));
  assert.equal(dom.overflow, false, `${name}: 页面横向溢出`);
  assert.ok(dom.canvases.length >= 1 && dom.canvases[0].width > 100, `${name}: 没有 3D 画布`);
  const file = path.join(output, `${name}.png`);
  let pixels = inspectPng(await page.screenshot({ path: file, animations: "disabled" }));
  // 截图可疑（全黑/单色）时重拍整页一次
  if (pixels.nearBlackRatio > 0.8 || pixels.colors < 64) {
    await settle(page, 900);
    pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: "disabled" }));
  }
  assert.ok(pixels.nearBlackRatio < 0.8 && pixels.transparentRatio < 0.02 && pixels.colors > 64, `${name}: 截图无效 ${JSON.stringify(pixels)}`);
  shots.push({ name, file, pixels, dom, scene: state.scene, phoneApp: state.phoneApp, node: state.node, choices: state.choices });
  return state;
}

async function drain(page) {
  for (let guard = 0; guard < 14; guard++) {
    const state = await read(page);
    if (!state.resolution) return;
    await tid(page, "resolution-next").click();
  }
  throw new Error("结算通知没有走完");
}

// 默认把这一回合的年夜饭标记为看过；需要验证年夜饭时传 reunion: true
async function inject(page, save, { reunion = false } = {}) {
  await page.evaluate(([value, playReunion]) => {
    localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(value));
    localStorage.setItem("marriage-pressure-view", "immersive");
    localStorage.setItem("marriage-pressure-introduction", `${value.seed}-${value.candidateId}`);
    if (playReunion) localStorage.removeItem("marriage-pressure-reunion");
    else localStorage.setItem("marriage-pressure-reunion", `${value.seed}-${value.turn}`);
  }, [save, reunion]);
  await page.reload({ waitUntil: "networkidle" });
  await tid(page, "resume-game").click();
  await tid(page, "immersive-game").waitFor();
  await page.locator("canvas").first().waitFor();
}

async function runViewport(browser, viewport, fixtures) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  // 测试环境里禁用语音合成，保证自测不出声
  await context.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = () => undefined;
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`${viewport.name}: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`${viewport.name} console: ${message.text()}`); });
  await page.goto(`${base}/game/family-pressure?view=immersive`, { waitUntil: "networkidle" });
  const prefix = viewport.name;

  // 相亲角：挑一个对象
  await inject(page, fixtures.draft);
  let state = await capture(page, `${prefix}-01-matchmaking`, "matchmaking");
  assert.equal(state.view, "immersive");
  await tid(page, `candidate-${fixtures.draft.candidateOptions[0]}`).click();
  await drain(page);

  // 春节返乡由玩家在住处主动发起；不再在开局强制插入。
  await inject(page, fixtures.child, { reunion: true });
  await tid(page, "journey-next").click();
  await tid(page, "journey-next").click();
  await tid(page, "visit-reunion").click();
  state = await capture(page, `${prefix}-02a-reunion`, "reunion");
  assert.equal(state.reunion.total, 3);
  assert.deepEqual(state.hotspots, []);
  await tid(page, "reunion-timer").waitFor({ state: "attached" });
  for (const tone of ["honest", "joke", "silent"]) {
    await tid(page, `reunion-${tone}`).click();
    await tid(page, "reunion-next").click();
  }
  state = await read(page);
  assert.deepEqual(state.reunion.tones, ["honest", "joke", "silent"]);
  await capture(page, `${prefix}-02b-reunion-summary`, "reunion");
  await tid(page, "reunion-finish").click();
  await settle(page);

  // 工位：打开手机看会话
  await inject(page, fixtures.child);
  state = await capture(page, `${prefix}-02-office`, fixtures.child.currentEventId === "layoff-rumor" || fixtures.child.currentEventId === "promotion" ? "meeting-room" : "office");
  assert.equal(state.slot, "work");
  await tid(page, "open-phone").click();
  await capture(page, `${prefix}-03-phone-home`);
  await tid(page, "app-chats").click();
  await capture(page, `${prefix}-04-chat-list`);
  await tid(page, "chat-candidate").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).choices.length > 0);
  state = await capture(page, `${prefix}-05-candidate-chat`);
  assert.equal(state.chatId, "candidate");
  const replies = page.locator('[data-testid^="reply-"]');
  if (await replies.count()) {
    const before = (await read(page)).week.handled;
    await replies.first().click();
    const after = (await read(page)).week.handled;
    assert.ok(Object.keys(after).length > Object.keys(before).length, "回复消息后应记为已处理");
  }
  await tid(page, "phone-close").first().click();

  // 下班路上、晚上出租屋
  await tid(page, "hotspot-advance").click();
  await capture(page, `${prefix}-06-commute`, "commute");
  await tid(page, "hotspot-advance").click();
  state = await capture(page, `${prefix}-07-room`, "room");
  assert.ok(state.hotspots.includes("bed") && state.hotspots.includes("calendar"));
  await tid(page, "hotspot-calendar").click();
  await capture(page, `${prefix}-08-calendar`);
  await tid(page, "phone-back").click();
  await tid(page, "app-map").click();
  await capture(page, `${prefix}-09-date-map`);

  // 周末约会：散步 → 小互动 → 聊天话题 → 结算 → 合照
  await tid(page, "venue-walk").click();
  state = await capture(page, `${prefix}-10-venue-riverside`, "venue");
  assert.equal(state.activity, "walk");
  await page.locator('[data-testid^="mini-"]').first().click();
  await tid(page, "meeting-everyday").click();
  await capture(page, `${prefix}-11-resolution`);
  await drain(page);
  await tid(page, "date-photo").waitFor();
  await capture(page, `${prefix}-12-date-after`, "venue");
  await tid(page, "date-finish").click();
  state = await read(page);
  assert.ok(state.dateLog.length >= 1 && state.dateLog[state.dateLog.length - 1].activity === "walk");
  await tid(page, "open-phone").click();
  await tid(page, "app-album").click();
  await capture(page, `${prefix}-13-album`);
  await tid(page, "phone-close").first().click();

  // 精简节奏：直接停在晚上的住处
  await tid(page, "pacing-toggle").click();
  state = await read(page);
  assert.equal(state.pacing, "brief");
  assert.equal(state.hotspots.includes("advance"), false);
  await tid(page, "pacing-toggle").click();

  // 其余场馆与场景
  for (const [activity, scene] of fixtures.venues) {
    await inject(page, fixtures.venueSave);
    await tid(page, "open-phone").click();
    await tid(page, "app-map").click();
    await tid(page, `venue-${activity}`).click();
    const venueState = await capture(page, `${prefix}-venue-${activity}`, "venue");
    assert.equal(venueState.venue, scene);
    // 了解过对方之后，吃饭类场馆多出“记得忌口”的选项
    if (activity === "hotpot") await tid(page, "mini-remember").waitFor();
    if (activity === "boardgame" || activity === "hike" || activity === "cook") {
      await tid(page, "mini-steps").click();
      await tid(page, "steps-mini").waitFor();
      for (let step = 0; step < 3; step++) await tid(page, step === 1 ? "step-push" : "step-care").click();
      await tid(page, "steps-done").click();
      assert.equal((await read(page)).dateStage, "talk", `${activity}: 分步小互动结束后应进入聊天`);
      await tid(page, "meeting-everyday").waitFor();
    }
    if (activity === "karting" || activity === "archery") {
      await tid(page, "mini-skill").click();
      await tid(page, "timing-mini").waitFor();
      await capture(page, `${prefix}-venue-${activity}-skill`, "venue");
      for (let round = 0; round < 3; round++) await tid(page, "timing-hit").click();
      const after = await read(page);
      assert.equal(after.dateStage, "talk", `${activity}: 小游戏结束后应进入聊天`);
      await tid(page, "meeting-everyday").waitFor();
    }
  }
  await inject(page, fixtures.home);
  await capture(page, `${prefix}-20-home`, "home");
  await inject(page, fixtures.parent);
  await capture(page, `${prefix}-21-park`, "park");
  await tid(page, "hotspot-advance").click();
  await capture(page, `${prefix}-22-parent-home`, "parent-home");
  await tid(page, "hotspot-home-phone").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).choices.length > 0);
  await capture(page, `${prefix}-23-parent-chat`);
  await tid(page, "choice-listen").click();
  await drain(page);

  // 现实事件场景：加班夜里的办公室、医院走廊
  await inject(page, fixtures.overtime);
  await capture(page, `${prefix}-30-night-office`, "office");
  assert.equal(await tid(page, "scene-title").textContent(), "夜里的办公室");
  await inject(page, fixtures.hospital);
  state = await capture(page, `${prefix}-31-hospital`, "hospital");
  assert.ok(state.hotspots.includes("hospital-bench") && state.hotspots.includes("hospital-call"));

  // 七夕：只提醒，不扣分
  await inject(page, fixtures.festival);
  state = await read(page);
  assert.ok(state.festival.some(line => line.includes("七夕")), "第 3 季应提醒七夕");
  await tid(page, "festival-reminder").first().waitFor();
  await capture(page, `${prefix}-32-festival`);

  // 关键过场：见面后确认交往 → 朋友圈官宣
  await inject(page, fixtures.official);
  await tid(page, "open-phone").click();
  await tid(page, "app-map").click();
  await tid(page, "venue-walk").click();
  await page.locator('[data-testid^="mini-"]').first().click();
  await tid(page, "meeting-everyday").click();
  await drain(page);
  await tid(page, "cutscene").waitFor();
  state = await capture(page, `${prefix}-33-cutscene-official`);
  assert.equal(state.stage, "dating");
  assert.equal(state.cutscene, "official");
  await tid(page, "cutscene-next").click();
  await tid(page, "date-photo").waitFor();

  // 家庭对弈：家长出完牌，遮住屏幕再交给孩子
  await inject(page, fixtures.duel);
  await tid(page, "hotspot-advance").click();
  await tid(page, "hotspot-tea").click();
  await drain(page);
  await tid(page, "cutscene").waitFor();
  state = await capture(page, `${prefix}-34-handoff`);
  assert.equal(state.cutscene, "handoff");
  assert.equal(state.activeActor, "child");
  await tid(page, "cutscene-next").click();
  await capture(page, `${prefix}-35-after-handoff`, "office");
  await context.close();
}

(async () => {
  const response = await fetch(`${base}/game/family-pressure`, { signal: AbortSignal.timeout(90000) });
  assert.equal(response.status, 200, "开发服务器没有响应");
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const e = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
  const start = (mode, seed) => e.gameReducer(e.createInitialState(), { type: "start", mode, difficulty: "realistic", seed });
  // 当事人模式开局由家长 AI 选好对象；相亲角用家长模式开局验证
  const draft = start("parent", 11);
  assert.equal(draft.phase, "candidate");
  const child = start("child", 11);
  assert.equal(child.phase, "turn");
  // 有过几次见面的交往中存档：所有场馆都已解锁
  const venueSave = { ...child, stage: "dating", meetings: 3, understanding: 55, relation: 55, mutualIntent: 60, savings: 80, week: { ...child.week, slot: "evening" } };
  const home = { ...child, stage: "married", marriedAtTurn: 1, relation: 60, mutualIntent: 60, week: { ...child.week, slot: "evening" } };
  const parentStart = start("parent", 12);
  const parent = parentStart.phase === "candidate" ? e.gameReducer(parentStart, { type: "candidate", id: parentStart.candidateOptions[0] }) : parentStart;
  assert.equal(parent.activeActor, "parent");
  const overtime = { ...child, currentEventId: "overtime" };
  const hospital = { ...child, currentEventId: "hospital", week: { ...child.week, slot: "commute" } };
  const festival = { ...venueSave, turn: 3 };
  const official = { ...child, stage: "chatting", meetings: 2, understanding: 60, relation: 62, mutualIntent: 75, chemistry: 60, savings: 80, week: { ...child.week, slot: "evening" } };
  const duelStart = start("duel", 11);
  const duel = e.gameReducer(duelStart, { type: "candidate", id: duelStart.candidateOptions[0] });
  assert.equal(duel.activeActor, "parent");
  const fixtures = {
    draft,
    child,
    venueSave,
    home,
    parent,
    overtime,
    hospital,
    festival,
    official,
    duel,
    venues: [["hotpot", "hotpot"], ["boardgame", "boardgame"], ["hike", "mountain"], ["karting", "karting"], ["archery", "archery"], ["comicon", "comicon"], ["movie", "cinema"], ["cook", "kitchen"]],
  };
  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone390", width: 390, height: 844 },
    { name: "phone320", width: 320, height: 780 },
  ].filter(viewport => !only || only.includes(viewport.name));
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED, args: ["--mute-audio"] });
  try {
    for (const viewport of viewports) await runViewport(browser, viewport, { ...fixtures, venues: viewport.name === "desktop" ? fixtures.venues : fixtures.venues.slice(0, 2) });
  } finally {
    await browser.close();
  }
  writeFileSync(path.join(output, "report.json"), JSON.stringify({ shots, errors }, null, 2));
  const fatal = errors.filter(line => !/Download the React DevTools|favicon/.test(line));
  assert.deepEqual(fatal, [], `浏览器报错：\n${fatal.join("\n")}`);
  console.log(`沉浸版验证通过，截图 ${shots.length} 张 → ${output}`);
})().catch(error => {
  writeFileSync(path.join(output, "report.json"), JSON.stringify({ shots, errors, failure: String(error?.stack || error) }, null, 2));
  console.error(error);
  process.exit(1);
});
