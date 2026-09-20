const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");

const base = process.env.MARRIAGE_BASE_URL || "http://127.0.0.1:3906";
const output = process.env.MARRIAGE_QA_DIR || "tmp/marriage-pressure-verify";
const screenshots = [];
const observed = [];
const errors = [];
mkdirSync(output, { recursive: true });

const readState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const control = (page, id) => page.getByTestId(id);

function observe(page) {
  page.on("pageerror", error => errors.push({ type: "pageerror", message: error.message, url: page.url() }));
  page.on("console", message => {
    if (message.type() === "error") errors.push({ type: "console", message: message.text(), url: page.url() });
  });
}

async function open(page, clear = false) {
  await page.goto(`${base}/game/family-pressure`, { waitUntil: "networkidle" });
  if (clear) {
    await page.evaluate(() => localStorage.removeItem("marriage-pressure-save-v1"));
    await page.reload({ waitUntil: "networkidle" });
  }
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
}

async function layout(page) {
  const report = await page.evaluate(() => {
    const main = document.querySelector("main");
    const problems = [];
    if (!main || main.innerText.trim().length < 80) problems.push("Missing game content");
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push("Horizontal overflow");
    for (const element of document.querySelectorAll("main button, main input, main a")) {
      const box = element.getBoundingClientRect();
      if (box.width && box.height && (box.left < -1 || box.right > innerWidth + 1))
        problems.push(`Offscreen control: ${element.getAttribute("data-testid") || element.textContent}`);
    }
    for (const image of document.querySelectorAll("main img")) {
      if (!image.complete || !image.naturalWidth) problems.push(`Missing image: ${image.getAttribute("src")}`);
    }
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      problems,
      text: main?.innerText.slice(0, 1800),
    };
  });
  assert.deepEqual(report.problems, [], JSON.stringify(report));
  return report;
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(
    () => [...document.querySelectorAll("main img")].every(image => image.complete && image.naturalWidth),
    { timeout: 30000 },
  );
  const file = path.join(output, `${name}.png`);
  const dom = await layout(page);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: "disabled" }));
  assert.ok(pixels.transparentRatio < 0.02, `${name} must be visible`);
  assert.ok(pixels.nearBlackRatio < 0.8, `${name} must not be near-black`);
  assert.ok(pixels.colors > 64, `${name} must contain real visual detail`);
  screenshots.push({ file, pixels, dom, state: await readState(page) });
}

async function verifyEndingPoster(page, expectedChildText) {
  const poster = control(page, "ending-poster");
  assert.ok(await poster.isVisible(), "Ending poster must be visible");
  const text = await poster.innerText();
  assert.match(text, /my-pixijs-game\.vercel\.app\/game\/family-pressure/);
  assert.match(text, /对象/);
  assert.match(text, /走到结局/);
  assert.match(text, /家庭经济/);
  if (expectedChildText) assert.match(text, expectedChildText);
  assert.ok(await poster.locator("img").count(), "Ending poster must include the candidate portrait");
}

async function drainResolution(page) {
  const seen = [];
  for (let guard = 0; guard < 10; guard += 1) {
    const state = await readState(page);
    if (!state.resolution) break;
    const dialog = control(page, "resolution-dialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    assert.match(text, /这一步单独结算/);
    assert.match(text, /这里只显示当前这一步的影响/);
    seen.push({ kind: state.resolution.current.kind, text });
    const previousIndex = state.resolution.index;
    await control(page, "resolution-next").click();
    await page.waitForFunction(
      index => {
        const current = JSON.parse(window.render_game_to_text()).resolution;
        return current === null || current.index !== index;
      },
      previousIndex,
    );
  }
  assert.equal((await readState(page)).resolution, null, "Resolution dialog queue must fully drain");
  return seen;
}

async function chooseFirstCandidate(page) {
  const state = await readState(page);
  assert.equal(state.phase, "candidate");
  assert.equal(state.candidateOptions.length, 3);
  await control(page, `candidate-${state.candidateOptions[0]}`).click();
  await drainResolution(page);
}

async function finishChildRun(page) {
  for (let step = 0; step < 30 && (await readState(page)).phase !== "ended"; step += 1) {
    const state = await readState(page);
    assert.equal(state.activeActor, "child");
    const options = state.availableActions;
    let action = options.includes("boundary") && state.stress > 70 ? "boundary" : "meet";
    if (state.stage === "married") action = options.includes("delay") ? "delay" : options[0];
    else if (options.includes("invest") && state.mutualIntent >= 35) action = "invest";
    else if (!options.includes(action)) action = options.includes("work") ? "work" : options[0];
    await control(page, `child-action-${action}`).click();
    await drainResolution(page);
  }
  assert.equal((await readState(page)).phase, "ended");
}

(async () => {
  const response = await fetch(`${base}/game/family-pressure`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, "Start the target Next dev server before launching Chrome");
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
  let passed = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    observe(page);
    await open(page, true);
    assert.equal((await readState(page)).phase, "lobby");
    await capture(page, "01-lobby-desktop");

    await control(page, "mode-child").click();
    await control(page, "difficulty-realistic").click();
    await control(page, "player-name").fill("阿满");
    await page.getByLabel("同局种子").fill("20260920");
    await control(page, "start-game").click();
    let state = await readState(page);
    assert.equal(state.phase, "turn");
    assert.equal(state.activeActor, "child");
    assert.ok(state.candidate);
    assert.ok(state.event);
    assert.equal(state.playerName, "阿满");
    await control(page, "event-notice").waitFor();
    assert.match(await control(page, "event-notice").innerText(), /刚刚发生/);
    assert.match(await page.locator("main").innerText(), /轮到我回应/);
    await capture(page, "02-child-turn-desktop");
    await control(page, "child-action-meet").click();
    await control(page, "resolution-dialog").waitFor();
    assert.match(await control(page, "resolution-dialog").innerText(), /我的选择/);
    await capture(page, "02b-resolution-dialog-desktop");
    const childResolution = await drainResolution(page);
    assert.deepEqual(childResolution.map(step => step.kind), ["choice", "reality", "family"]);
    assert.match(childResolution[0].text, /压力|存款|关系/);
    assert.match(childResolution[1].text, /现实事件/);
    assert.match(childResolution[2].text, /家长回应/);
    const afterMeet = await readState(page);
    assert.ok(afterMeet.turn >= 2 || afterMeet.phase === "ended");
    assert.ok(afterMeet.relation > state.relation);
    await page.waitForFunction(
      expected => JSON.parse(localStorage.getItem("marriage-pressure-save-v1") || "null")?.relation === expected,
      afterMeet.relation,
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    if ((await readState(page)).phase === "lobby") {
      await control(page, "resume-game").waitFor();
      await control(page, "resume-game").click();
    }
    assert.equal((await readState(page)).relation, afterMeet.relation, "Reload must preserve the same household state");
    await finishChildRun(page);
    state = await readState(page);
    assert.ok(state.ending);
    await verifyEndingPoster(page);
    await capture(page, "03-child-ending-desktop");
    observed.push({ scenario: "child-campaign", ending: state.ending, scores: state.scores });

    await control(page, "back-lobby").click();
    await control(page, "mode-parent").click();
    await control(page, "difficulty-gentle").click();
    await control(page, "start-game").click();
    await capture(page, "04-parent-candidate-draft");
    await chooseFirstCandidate(page);
    state = await readState(page);
    assert.equal(state.activeActor, "parent");
    const beforeSupport = state;
    await control(page, "parent-action-support").click();
    await drainResolution(page);
    state = await readState(page);
    assert.ok(state.support > beforeSupport.support);
    assert.ok(
      state.savings + state.support > beforeSupport.savings + beforeSupport.support,
      "Material support must increase the household's total financial backing after the child's response",
    );
    await capture(page, "05-parent-support-desktop");
    observed.push({ scenario: "parent-material-support", support: state.support, childResponse: state.lastChildAction });

    const replacedCandidate = state.candidate.name;
    await control(page, "parent-action-next").click();
    await drainResolution(page);
    state = await readState(page);
    assert.equal(state.phase, "candidate");
    const replacementNotice = await control(page, "event-notice").innerText();
    assert.match(replacementNotice, new RegExp(replacedCandidate));
    assert.match(replacementNotice, /划掉|重新选人/);
    await capture(page, "05b-parent-replacement-notice");
    observed.push({ scenario: "visible-candidate-replacement", previous: replacedCandidate, notice: replacementNotice });

    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("marriage-pressure-save-v1") || "null");
      if (!saved) throw new Error("Expected a save before injecting the pressure recovery scenario");
      Object.assign(saved, {
        phase: "turn",
        mode: "child",
        difficulty: "realistic",
        turn: 4,
        activeActor: "child",
        selectionKind: "opening",
        candidateId: "sui",
        candidateOptions: [],
        stage: "chatting",
        stress: 78,
        autonomy: 62,
        familyBond: 70,
        pressure: 58,
        relation: 35,
        mutualIntent: 45,
        currentEventId: "rent",
        lastParentAction: "compare",
        lastChildAction: null,
        ending: null,
        scores: { child: 0, parent: 0, family: 0 },
      });
      localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(saved));
    });
    await page.reload({ waitUntil: "networkidle" });
    await control(page, "resume-game").click();
    const pressureBeforeRecovery = (await readState(page)).stress;
    await control(page, "child-action-boundary").click();
    state = await readState(page);
    assert.equal(state.resolution.current.kind, "choice");
    await control(page, "resolution-next").click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).resolution?.current.kind === "reality");
    state = await readState(page);
    const realityStress = state.resolution.current.changes.find(change => change.key === "stress");
    assert.ok(realityStress?.delta <= 0, JSON.stringify(state.resolution.current));
    assert.match(await control(page, "resolution-dialog").innerText(), /准点下班|调休|押金|复查|奖金|远程办公/);
    await capture(page, "05c-pressure-breather-event");
    await control(page, "resolution-next").click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).resolution?.current.kind === "family");
    state = await readState(page);
    const familyStress = state.resolution.current.changes.find(change => change.key === "stress");
    assert.ok(familyStress?.delta < 0, JSON.stringify(state.resolution.current));
    assert.match(state.resolution.current.title, /我先听孩子说|我拿出真金白银/);
    assert.doesNotMatch(state.resolution.current.title, /比较/);
    await capture(page, "05d-high-pressure-parent-deescalation");
    await control(page, "resolution-next").click();
    state = await readState(page);
    assert.equal(state.resolution, null);
    assert.ok(state.stress < pressureBeforeRecovery, JSON.stringify(state));
    observed.push({
      scenario: "pressure-recovery-window",
      before: pressureBeforeRecovery,
      after: state.stress,
      realityEvent: state.event.id,
      parentAction: state.lastParentAction,
    });

    await page.evaluate(() => localStorage.removeItem("marriage-pressure-save-v1"));
    await page.reload({ waitUntil: "networkidle" });
    await control(page, "mode-duel").click();
    await control(page, "difficulty-gentle").click();
    await control(page, "start-game").click();
    await chooseFirstCandidate(page);
    await control(page, "parent-action-support").click();
    await drainResolution(page);
    assert.equal((await readState(page)).activeActor, "child");
    await control(page, "child-action-meet").click();
    await drainResolution(page);
    state = await readState(page);
    assert.equal(state.turn, 2);
    assert.equal(state.activeActor, "parent");
    await capture(page, "06-duel-round-two-desktop");
    observed.push({ scenario: "duel-alternation", turn: state.turn, actor: state.activeActor });

    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("marriage-pressure-save-v1") || "null");
      if (!saved) throw new Error("Expected a valid v3 save before injecting the parenting scenario");
      Object.assign(saved, {
        phase: "turn",
        mode: "parent",
        difficulty: "realistic",
        turn: 7,
        startAge: 27,
        marriedAtTurn: 4,
        parenthoodAtTurn: 6,
        activeActor: "parent",
        selectionKind: "opening",
        candidateOptions: [],
        stage: "parenthood",
        stress: 42,
        autonomy: 55,
        familyBond: 64,
        savings: 48,
        career: 60,
        relation: 72,
        mutualIntent: 70,
        pressure: 58,
        support: 36,
        weddingDebt: 8,
        nextGenStress: 78,
        childPlan: "ready",
        ending: null,
        scores: { child: 0, parent: 0, family: 0 },
        lastEvent: "孩子的日程表已经没有空白。",
      });
      localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(saved));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await control(page, "resume-game").click();
    state = await readState(page);
    assert.equal(state.stage, "parenthood");
    assert.equal(state.nextGenStress, 78);
    await control(page, "parent-action-push-education").click();
    await drainResolution(page);
    state = await readState(page);
    assert.equal(state.phase, "ended");
    assert.equal(state.ending, "depressed");
    assert.match(await page.locator("main").innerText(), /孙辈玉玉了/);
    await verifyEndingPoster(page, /已经生子/);
    await capture(page, "06b-next-generation-pressure-ending");
    observed.push({
      scenario: "next-generation-pressure-ending",
      ending: state.ending,
      nextGenStress: state.nextGenStress,
    });

    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("marriage-pressure-save-v1") || "null");
      Object.assign(saved, {
        phase: "turn",
        mode: "child",
        difficulty: "gentle",
        seed: 20260920,
        rng: 20260920,
        turn: 14,
        maxTurns: 14,
        startAge: 26,
        marriedAtTurn: 7,
        parenthoodAtTurn: null,
        activeActor: "child",
        stage: "married",
        stress: 10,
        autonomy: 70,
        familyBond: 65,
        savings: 70,
        career: 66,
        relation: 74,
        mutualIntent: 68,
        pressure: 10,
        support: 28,
        weddingDebt: 12,
        nextGenStress: 0,
        coerciveMoves: 1,
        supportiveMoves: 4,
        childPlan: "delay",
        ending: null,
        scores: { child: 0, parent: 0, family: 0 },
        lastEvent: "很多年过去，婚礼已经不是两个人生活里最重要的那一天。",
        lastParentAction: null,
        lastChildAction: null,
        log: ["很多年过去，婚礼已经不是两个人生活里最重要的那一天。"],
      });
      localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(saved));
    });
    await page.reload({ waitUntil: "networkidle" });
    await control(page, "resume-game").click();
    state = await readState(page);
    assert.equal(state.maxTurns, 14);
    assert.ok(state.availableActions.includes("build-home"));
    assert.ok(!state.availableActions.includes("meet"));
    assert.ok(!state.availableActions.includes("next"));
    await control(page, "child-action-childfree").click();
    await drainResolution(page);
    state = await readState(page);
    assert.equal(state.turn, 15);
    assert.equal(state.maxTurns, 16);
    assert.equal(state.childPlan, "childfree");
    await control(page, "child-action-build-home").click();
    await drainResolution(page);
    state = await readState(page);
    assert.equal(state.turn, 16);
    assert.equal(state.phase, "turn");
    await control(page, "child-action-build-home").click();
    await drainResolution(page);
    state = await readState(page);
    assert.equal(state.ending, "happy", JSON.stringify(state));
    assert.match(await page.locator("main").innerText(), /真的幸福终老/);
    await verifyEndingPoster(page, /决定不生/);
    await capture(page, "06c-later-life-happy-ending");
    observed.push({ scenario: "later-life-happy-ending", ending: state.ending, turn: state.turn });

    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("marriage-pressure-save-v1") || "null");
      Object.assign(saved, {
        phase: "turn",
        mode: "child",
        seed: 20260920,
        rng: 20260920,
        turn: 14,
        maxTurns: 14,
        startAge: 28,
        marriedAtTurn: 6,
        parenthoodAtTurn: null,
        activeActor: "child",
        stage: "married",
        stress: 52,
        autonomy: 62,
        familyBond: 48,
        savings: 55,
        career: 60,
        relation: 34,
        mutualIntent: 30,
        pressure: 72,
        support: 4,
        weddingDebt: 48,
        nextGenStress: 0,
        coerciveMoves: 5,
        supportiveMoves: 0,
        childPlan: "childfree",
        ending: null,
        scores: { child: 0, parent: 0, family: 0 },
        lastEvent: "婚礼账单还没还完，两个人已经很久没有认真说过话。",
        lastParentAction: null,
        lastChildAction: null,
        log: ["婚礼账单还没还完，两个人已经很久没有认真说过话。"],
      });
      localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(saved));
    });
    await page.reload({ waitUntil: "networkidle" });
    await control(page, "resume-game").click();
    await control(page, "child-action-work").click();
    await drainResolution(page);
    state = await readState(page);
    assert.equal(state.ending, "runaway");
    assert.match(await page.locator("main").innerText(), /彩礼卷走，人也走了/);
    await verifyEndingPoster(page, /决定不生/);
    await capture(page, "06d-bride-price-runaway-ending");
    observed.push({ scenario: "bride-price-runaway-ending", ending: state.ending, turn: state.turn });

    await page.setViewportSize({ width: 390, height: 844 });
    await layout(page);
    await verifyEndingPoster(page, /决定不生/);
    await capture(page, "06e-ending-mobile-390");

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const phone = await mobileContext.newPage();
    observe(phone);
    await open(phone, true);
    await capture(phone, "07-lobby-mobile-390");
    await control(phone, "mode-child").tap();
    await control(phone, "difficulty-realistic").tap();
    await control(phone, "start-game").tap();
    await capture(phone, "08-child-turn-mobile-390");
    await control(phone, "child-action-boundary").tap();
    await control(phone, "resolution-dialog").waitFor();
    assert.match(await control(phone, "resolution-dialog").innerText(), /压力/);
    await capture(phone, "08b-resolution-dialog-mobile-390");
    const mobileResolution = await drainResolution(phone);
    assert.deepEqual(mobileResolution.map(step => step.kind), ["choice", "reality", "family"]);
    await phone.setViewportSize({ width: 320, height: 740 });
    await layout(phone);
    await capture(phone, "09-child-turn-mobile-320");
    await mobileContext.close();

    assert.deepEqual(errors, []);
    passed = true;
  } finally {
    writeFileSync(path.join(output, "report.json"), JSON.stringify({ passed, screenshots, observed, errors }, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ passed, screenshots: screenshots.map(item => item.file), observed, errors }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
