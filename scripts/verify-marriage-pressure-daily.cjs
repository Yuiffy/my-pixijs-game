const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const base = process.env.MARRIAGE_BASE_URL || "http://127.0.0.1:3910";
const out = process.env.MARRIAGE_QA_DIR || "tmp/marriage-daily";
const shots = [], errors = [];
const tid = (p, id) => p.getByTestId(id);
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(page, name) {
  await page.waitForTimeout(650);
  const state = await read(page);
  const dom = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, canvas: [...document.querySelectorAll("canvas")].map(c => [c.width, c.height]) }));
  assert.equal(dom.overflow, false);
  assert.ok(dom.canvas[0][0] > 100);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: "disabled" }));
  assert.ok(pixels.nearBlackRatio < .8 && pixels.colors > 64 && pixels.transparentRatio < .02);
  shots.push({ name, file, state, dom, pixels });
}
async function scrollCheck(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="chat-thread"]');
    return el && el.clientHeight > 140 && Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 3;
  }, undefined, { timeout: 5000 }).catch(async error => {
    console.log(await page.evaluate(() => [...document.querySelectorAll('[data-testid="chat-thread"], [data-testid="chat-reply-tray"], [data-testid="phone"]')].map(el => ({ id: el.dataset.testid, height: el.clientHeight, scroll: el.scrollTop, total: el.scrollHeight, rect: el.getBoundingClientRect().toJSON() }))));
    await page.screenshot({ path: path.join(out, "scroll-failure.png"), fullPage: true });
    throw error;
  });
  const layout = await page.evaluate(() => {
    const thread = document.querySelector('[data-testid="chat-thread"]').getBoundingClientRect();
    const tray = document.querySelector('[data-testid="chat-reply-tray"]').getBoundingClientRect();
    return { bottom: thread.bottom, tray: tray.top };
  });
  assert.ok(layout.bottom <= layout.tray + 1, "回复选项不能遮住聊天内容");
}
async function inject(page, save) {
  await page.evaluate(value => {
    localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(value));
    localStorage.setItem("marriage-pressure-introduction", `${value.seed}-${value.candidateId}`);
    localStorage.removeItem("marriage-pressure-reunion");
  }, save);
  await page.reload({ waitUntil: "networkidle" });
  await tid(page, "resume-game").click();
  await tid(page, "immersive-game").waitFor();
}
(async () => {
  mkdirSync(out, { recursive: true });
  assert.equal((await fetch(`${base}/game/family-pressure`, { signal: AbortSignal.timeout(90000) })).status, 200);
  mkdirSync(out, { recursive: true });
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const e = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
  const { candidateStory } = await loadTypescriptModule("src/components/marriagePressureGame/immersive/dailyStories.ts");
  const initial = e.gameReducer(e.createInitialState(), { type: "start", mode: "child", difficulty: "realistic", seed: 11 });
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED, args: ["--mute-audio"] });
  try {
    const widths = process.env.MARRIAGE_WIDTHS ? process.env.MARRIAGE_WIDTHS.split(",").map(Number) : [1440, 390, 320];
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width > 760 ? 900 : 844 }, deviceScaleFactor: 1 });
      await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${base}/game/family-pressure?view=immersive`, { waitUntil: "networkidle" });
      await tid(page, "mode-child").click();
      await page.locator("#marriage-seed").fill("11");
      await tid(page, "start-game").click();
      await tid(page, "intro-add-wechat").waitFor();
      await capture(page, `${width}-01-introduction`);
      assert.equal((await read(page)).reunion, null, "开局不应突然吃年夜饭");
      await tid(page, "intro-add-wechat").click();
      await tid(page, "intro-start-chat").click();
      await page.waitForTimeout(600);
      await scrollCheck(page);
      await capture(page, `${width}-02-first-chat`);
      await tid(page, "phone-close").click();
      await capture(page, `${width}-03-office`);
      await tid(page, "scene-phone").click();
      await tid(page, "chat-work").click();
      await tid(page, "choice-work").click();
      let state = await read(page);
      assert.equal(state.turn, 1);
      assert.equal(state.slot, "work");
      assert.ok(state.pendingPlan, "工位选择应成为今晚的安排，不能跳过通勤");
      await page.reload({ waitUntil: "networkidle" });
      await tid(page, "resume-game").click();
      await tid(page, "scene-phone").waitFor();
      assert.ok((await read(page)).pendingPlan, "刷新后应保留今晚的安排");
      await tid(page, "journey-next").click();
      assert.equal((await read(page)).scene, "commute");
      await capture(page, `${width}-04-commute`);
      await tid(page, "scene-phone").click();
      await tid(page, "phone-back").click();
      await tid(page, "app-call").click();
      await tid(page, "call-candidate").click();
      await tid(page, "active-call").waitFor();
      await page.waitForTimeout(600);
      await scrollCheck(page);
      await capture(page, `${width}-05-call`);
      await tid(page, "hang-up").click();
      await tid(page, "phone-close").click();
      await tid(page, "journey-next").click();
      assert.equal((await read(page)).scene, "room");
      await capture(page, `${width}-06-room`);
      await tid(page, "visit-reunion").click();
      await capture(page, `${width}-07-reunion`);
      if (width === 1440 && process.env.MARRIAGE_UPDATE_COVER) {
        // A real page capture, cropped to the people and table, with no mockup.
        mkdirSync("public/images/marriage-pressure", { recursive: true });
        await page.screenshot({ path: "public/images/marriage-pressure/reunion-dinner.jpg", type: "jpeg", quality: 92, clip: { x: 220, y: 338, width: 790, height: 505 } });
      }
      for (let i = 0; i < 3; i++) {
        await tid(page, "reunion-honest").click();
        await tid(page, "reunion-next").click();
      }
      await tid(page, "reunion-finish").click();
      assert.equal((await read(page)).scene, "room");
      assert.equal((await read(page)).turn, 1);
      await tid(page, "complete-plan").click();
      for (let i = 0; i < 15 && (await read(page)).resolution; i++) await tid(page, "resolution-next").click();
      state = await read(page);
      assert.equal(state.turn, 2);
      assert.equal(state.pendingPlan, null);
      assert.equal(state.reunion, null);

      // Select a deterministic photo-bearing story; text-only topics are intentional.
      const save = { ...initial, stage: "chatting", understanding: 20, week: { ...initial.week, inbox: [{ id: "1-child-candidate-share", kind: "candidate-share", from: "candidate", slot: "work", urgent: false }], handled: {} } };
      while (!candidateStory(save).picture) save.seed++;
      await inject(page, save);
      await tid(page, "scene-phone").click();
      await tid(page, "chat-candidate").click();
      await tid(page, "reply-candidate-share-now").click();
      await page.waitForTimeout(700);
      await scrollCheck(page);
      assert.ok(await tid(page, "chat-picture").count() >= 1);
      await capture(page, `${width}-08-photo-chat`);
      await page.setViewportSize({ width, height: 620 });
      await scrollCheck(page);
      await capture(page, `${width}-09-short-chat`);
      await page.setViewportSize({ width, height: width > 760 ? 900 : 844 });
      await tid(page, "phone-back").click();
      await tid(page, "phone-back").click();
      await tid(page, "app-moments").click();
      await capture(page, `${width}-10-moments`);
      await tid(page, "phone-close").click();
      if (width === 1440) {
        await inject(page, { ...save, currentEventId: "quiet-week" });
        await capture(page, `${width}-11-day-office`);
        await tid(page, "scene-phone").click();
        await tid(page, "phone-back").click();
        await tid(page, "app-map").click();
        await tid(page, "venue-walk").click();
        assert.equal((await read(page)).scene, "office");
        assert.ok((await read(page)).pendingPlan);
        await tid(page, "journey-next").click();
        await tid(page, "journey-next").click();
        await tid(page, "complete-plan").click();
        assert.equal((await read(page)).scene, "venue");
        await tid(page, "date-cancel").click();
        const future = { id: "1-child-candidate-home", kind: "candidate-home", from: "candidate", slot: "evening", urgent: false };
        await inject(page, { ...save, week: { ...save.week, inbox: [...save.week.inbox, future] } });
        await tid(page, "scene-phone").click();
        await tid(page, "chat-candidate").click();
        assert.equal(await tid(page, "inbox-candidate-home").count(), 0, "日常节奏不提前显示晚间消息");
        await tid(page, "phone-close").click();
        await tid(page, "pacing-toggle").click();
        await tid(page, "scene-phone").click();
        await tid(page, "chat-candidate").click();
        await tid(page, "inbox-candidate-home").waitFor();
        await tid(page, "reply-candidate-home-reply").click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("marriage-pressure-save-v1")).week.handled["1-child-candidate-home"] === "reply");
        await tid(page, "phone-close").click();
        await tid(page, "pacing-toggle").click();
      }
      await page.reload({ waitUntil: "networkidle" });
      await tid(page, "resume-game").click();
      await tid(page, "scene-phone").waitFor();
      assert.equal(await tid(page, "introduction").count(), 0, "已加好友后刷新不应重新介绍");
      await context.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(errors, []);
  writeFileSync(path.join(out, "report.json"), JSON.stringify({ shots, errors }, null, 2));
  console.log(`Daily-life verification passed: ${shots.length} screenshots`);
})().catch(error => { writeFileSync(path.join(out, "report.json"), JSON.stringify({ shots, errors, failure: String(error.stack || error) }, null, 2)); console.error(error); process.exit(1); });
