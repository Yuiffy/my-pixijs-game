const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const base = process.env.MARRIAGE_BASE_URL || "http://127.0.0.1:3916";
const out = process.env.MARRIAGE_QA_DIR || "tmp/marriage-immersion";
const shots = [], errors = [];
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const tid = (page, id) => page.getByTestId(id);
async function capture(page, name) {
  await page.waitForTimeout(600);
  const state = await read(page);
  const dom = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, canvas: [...document.querySelectorAll("canvas")].map(c => [c.width, c.height]) }));
  assert.equal(dom.overflow, false);
  assert.ok(dom.canvas[0][0] > 100);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true }));
  assert.ok(pixels.nearBlackRatio < .8 && pixels.colors > 64 && pixels.transparentRatio < .02, "Reject invalid GPU captures");
  shots.push({ name, file, scene: state.scene, venue: state.venue, commute: state.commute, dom, pixels });
}
async function inject(page, state) {
  await page.evaluate(value => {
    localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(value));
    localStorage.setItem("marriage-pressure-introduction", `${value.seed}-${value.candidateId}`);
    localStorage.setItem("marriage-pressure-muted", "on");
    localStorage.removeItem("marriage-pressure-conversations");
    localStorage.removeItem("marriage-pressure-day-plan");
  }, state);
  await page.reload({ waitUntil: "networkidle" });
  await tid(page, "resume-game").click();
  await tid(page, "scene-phone").waitFor();
}
async function openMap(page) {
  await tid(page, "scene-phone").click();
  await tid(page, "phone-back").click();
  await tid(page, "app-map").click();
}
(async () => {
  mkdirSync(out, { recursive: true });
  assert.equal((await fetch(`${base}/game/family-pressure`, { signal: AbortSignal.timeout(90000) })).status, 200);
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const e = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
  const { ACTIVITIES } = await loadTypescriptModule("src/components/marriagePressureGame/activities.ts");
  const started = e.gameReducer(e.createInitialState(), { type: "start", mode: "child", difficulty: "realistic", seed: 11 });
  const state = { ...started, candidateId: "pako", turn: 3, stage: "chatting", meetings: 2, understanding: 45, mutualIntent: 65, chemistry: 80, relation: 50, savings: 80, currentEventId: "quiet-week", week: { ...started.week, slot: "work", inbox: [
    { id: "3-child-boss-ping", kind: "boss-ping", from: "boss", slot: "work", urgent: true },
    { id: "3-child-candidate-share", kind: "candidate-share", from: "candidate", slot: "work", urgent: false },
    { id: "3-child-mom-marriage", kind: "mom-marriage", from: "mom", slot: "commute", urgent: true },
  ], handled: {}, micro: {} } };
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED, args: ["--mute-audio"] });
  try {
    const widths = (process.env.MARRIAGE_WIDTHS || "1440,390,320").split(",").map(Number);
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width > 760 ? 900 : 844 }, deviceScaleFactor: 1 });
      await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${base}/game/family-pressure?view=immersive`, { waitUntil: "networkidle" });
      await inject(page, state);
      await tid(page, "scene-phone").click();
      await tid(page, "chat-candidate").click();
      await tid(page, "reply-candidate-share-later").click();
      assert.equal((await read(page)).week.handled["3-child-candidate-share"], "deferred");
      assert.equal((await read(page)).understanding, state.understanding);
      await capture(page, `${width}-work-promise`);
      await tid(page, "phone-close").click();
      await tid(page, "journey-next").click();
      await tid(page, "walk-toggle").waitFor();
      assert.equal((await read(page)).scene, "commute");
      await capture(page, `${width}-walk-before`);
      const before = (await read(page)).commute.distance;
      await page.waitForTimeout(1800);
      assert.ok((await read(page)).commute.distance > before + .5);
      if (width === 1440) await capture(page, `${width}-walk-after`);
      await tid(page, "resume-promised-chat").click();
      const withPhone = (await read(page)).commute.distance;
      await tid(page, "reply-candidate-share-now").click();
      await page.waitForTimeout(1200);
      assert.ok((await read(page)).commute.distance > withPhone);
      assert.equal((await read(page)).week.handled["3-child-candidate-share"], "kept-promise");
      await tid(page, "choice-ask").click();
      await page.waitForTimeout(700);
      const conversation = await tid(page, "chat-thread").innerText();
      await capture(page, `${width}-walking-chat`);
      if (width <= 760) assert.ok(await tid(page, "phone").evaluate(el => el.getBoundingClientRect().top > innerHeight * .2));
      await tid(page, "phone-close").click();
      await tid(page, "scene-phone").click();
      await tid(page, "chat-candidate").click();
      await page.waitForTimeout(650);
      assert.equal(await tid(page, "chat-thread").innerText(), conversation, "reopening should preserve the conversation");
      await tid(page, "phone-back").click();
      await tid(page, "phone-back").click();
      await tid(page, "app-call").click();
      await tid(page, "reply-mom-marriage-answer").click();
      await tid(page, "active-call").waitFor();
      const calling = (await read(page)).commute.distance;
      await page.waitForTimeout(900);
      assert.ok((await read(page)).commute.distance > calling);
      if (width === 1440) await capture(page, `${width}-walking-call`);
      await tid(page, "hang-up").click();
      await tid(page, "phone-close").click();
      await tid(page, "walk-toggle").click();
      await page.waitForTimeout(200);
      const stopped = (await read(page)).commute.distance;
      await page.waitForTimeout(650);
      assert.equal((await read(page)).commute.distance, stopped);
      await tid(page, "walk-toggle").click();
      await page.waitForTimeout(650);
      assert.ok((await read(page)).commute.distance > stopped);
      await tid(page, "journey-next").click();
      assert.equal((await read(page)).scene, "room");
      assert.equal((await read(page)).commute, null);
      await openMap(page);
      await tid(page, "venue-cafe").click();
      assert.equal((await read(page)).venue, "cafe");
      await capture(page, `${width}-cafe-first-person`);
      await page.locator('[data-testid^="mini-"]').filter({ hasText: "拿铁" }).first().click();
      await tid(page, "meeting-listen").click();
      for (let i = 0; i < 15 && (await read(page)).resolution; i++) await tid(page, "resolution-next").click();
      while (await tid(page, "cutscene-next").count()) await tid(page, "cutscene-next").click();
      assert.ok((await read(page)).dateLog.at(-1).mood);
      await capture(page, `${width}-date-memory`);
      await tid(page, "date-finish").click();
      if (width === 1440) {
        const venueState = { ...state, stage: "dating", meetings: 4, week: { ...state.week, slot: "evening", inbox: [], handled: {} } };
        for (const activity of Object.values(ACTIVITIES)) {
          if (activity.venue === "cafe") continue;
          await inject(page, venueState);
          await openMap(page);
          await tid(page, `venue-${activity.id}`).click();
          assert.equal((await read(page)).venue, activity.venue);
          await capture(page, `venue-${activity.venue}`);
        }
        await inject(page, { ...state, week: { ...state.week, slot: "commute" } });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForTimeout(250);
        const reduced = (await read(page)).commute.distance;
        await page.waitForTimeout(650);
        assert.equal((await read(page)).commute.distance, reduced);
        await tid(page, "walk-toggle").click();
        await page.waitForTimeout(650);
        assert.ok((await read(page)).commute.distance > reduced);
        await capture(page, "reduced-motion-manual-walk");
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    writeFileSync(path.join(out, "report.json"), JSON.stringify({ shots, errors }, null, 2));
    console.log(JSON.stringify({ screenshots: shots.length, errors, output: out }));
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
      console.error((await page.locator("body").innerText()).slice(-2200));
    }
    console.error(errors);
    throw error;
  } finally {
    writeFileSync(path.join(out, "report.json"), JSON.stringify({ shots, errors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
