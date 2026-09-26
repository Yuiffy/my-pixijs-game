const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const base = process.env.MARRIAGE_BASE_URL || "http://127.0.0.1:3910";
const output = process.env.MARRIAGE_QA_DIR || "tmp/family-v4-browser";
const shots = [], errors = [], observations = [];
mkdirSync(output, { recursive: true });
const read = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const button = (page, id) => page.getByTestId(id);

async function drain(page) {
  const steps = [];
  for (let guard = 0; guard < 12; guard++) {
    const s = await read(page);
    if (!s.resolution) return steps;
    steps.push(s.resolution.current);
    const text = await button(page, "resolution-dialog").innerText();
    for (const c of s.resolution.current.changes) assert.ok(text.includes(`${c.before} → ${c.after}`));
    await button(page, "resolution-next").click();
  }
  throw new Error("Resolution queue did not drain");
}
async function act(page, actor, id) {
  const controlId = id === "meet-aa" || id === "invest" ? "meet" : id;
  for (const tab of ["connection", "life", "decision"]) {
    if (await button(page, `${actor}-action-${controlId}`).count()) break;
    await button(page, `actions-${tab}`).click();
  }
  await button(page, `${actor}-action-${controlId}`).click();
  if ((await read(page)).pendingMeeting) { await button(page, id === "meet" ? "payment-treat" : "payment-aa").click(); await button(page, "meeting-everyday").click(); }
  if ((await read(page)).pendingDecision) await button(page, "decision-confirm").click();
  return drain(page);
}
async function fixture(page, value) {
  await page.evaluate(s => localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(s)), value);
  await page.reload({ waitUntil: "networkidle" });
  await button(page, "resume-game").click();
  assert.equal((await read(page)).candidateId, value.candidateId);
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => [...document.querySelectorAll("main img")].every(img => img.complete && img.naturalWidth));
  const dom = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, width: innerWidth, text: document.querySelector("main")?.innerText.slice(0, 2400), canvases: [...document.querySelectorAll("canvas")].map(c => ({ width: c.width, height: c.height })) }));
  assert.equal(dom.overflow, false, `${name}: overflow`);
  const file = path.join(output, `${name}.png`);
  const pixels = inspectPng(await page.screenshot({ path: file, fullPage: true, animations: "disabled" }));
  assert.ok(pixels.nearBlackRatio < .8 && pixels.transparentRatio < .02 && pixels.colors > 64, `${name}: invalid screenshot`);
  shots.push({ file, pixels, dom, state: await read(page) });
}

(async () => {
  assert.equal((await fetch(`${base}/game/family-pressure`, { signal: AbortSignal.timeout(60000) })).status, 200);
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const e = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
  const { CANDIDATES } = await loadTypescriptModule("src/components/marriagePressureGame/content.ts");
  const { chooseAction, runCampaign } = await import("./simulate-family-pressure.mjs");
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", err => errors.push(String(err)));
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.goto(`${base}/game/family-pressure`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await button(page, "candidate-catalog").locator("summary").click();
    const catalog = await button(page, "candidate-catalog").innerText();
    for (const c of CANDIDATES) assert.ok(catalog.includes(c.name));
    for (const c of CANDIDATES) assert.equal((await context.request.get(`${base}${encodeURI(c.image)}`)).status(), 200, c.image);
    await capture(page, "01-full-cast-lobby");
    const seed = Array.from({ length: 80 }, (_, i) => i + 1).find(n => { const run = runCampaign(n); return run.history.some(h => h.id === "next") && ["happy", "modest"].includes(run.state.ending); });
    assert.ok(seed);
    await page.getByLabel("同局种子").fill(String(seed));
    await button(page, "player-name").fill("小禾");
    await button(page, "start-game").click();
    await button(page, "open-household").click();
    assert.match(await button(page, "meter-family").innerText(), /与父母的亲情/);
    await page.keyboard.press("Escape");
    assert.match(await button(page, "meter-relation").innerText(), /伴侣感情/);
    await button(page, "child-action-meet").click();
    await capture(page, "01b-meeting-topics");
    await page.keyboard.press("Escape");
    assert.equal((await read(page)).meetings, 0);
    const history = [];
    let capturedDating = false, capturedMarried = false;
    for (let guard = 0; guard < 80; guard++) {
      const s = await read(page);
      if (s.phase === "ended") break;
      if (s.matchClosed && !capturedDating) { await page.setViewportSize({ width: 390, height: 844 }); await capture(page, "02-no-feeling-mobile"); await page.setViewportSize({ width: 1440, height: 1000 }); capturedDating = true; }
      if (s.stage === "married" && !capturedMarried) { await capture(page, "03-shared-life-desktop"); capturedMarried = true; }
      const id = chooseAction(s);
      history.push({ turn: s.turn, id, candidate: s.candidateId });
      await act(page, "child", id);
    }
    const final = await read(page);
    assert.equal(final.phase, "ended");
    assert.ok(["happy", "modest"].includes(final.ending));
    assert.ok(capturedDating && capturedMarried);
    await capture(page, "04-campaign-ending");
    observations.push({ case: "legal campaign", seed, history, ending: final.ending });
    await page.reload({ waitUntil: "networkidle" });
    await button(page, "resume-game").click();
    assert.equal((await read(page)).ending, final.ending);

    const baseState = { ...e.createInitialState(), phase: "turn", mode: "child", difficulty: "realistic", seed: 3, rng: 12, turn: 8, candidateId: "sui", stage: "dating", activeActor: "child", chemistry: 80, relation: 77, mutualIntent: 76, savings: 32, stress: 82, familyBond: 97, support: 36, familyReserve: 6 };
    await fixture(page, baseState);
    await button(page, "actions-decision").click();
    await button(page, "child-action-marry").click();
    await capture(page, "05-marriage-confirmation");
    await button(page, "decision-cancel").click();
    assert.equal((await read(page)).stage, "dating");
    await act(page, "child", "marry");
    let s = await read(page);
    assert.equal(s.phase, "turn");
    assert.equal(s.stage, "married");
    assert.equal(s.burnoutTurns, 1);
    await capture(page, "06-married-recovery-window");
    await act(page, "child", "rest");
    assert.equal((await read(page)).burnoutTurns, 0);

    await fixture(page, { ...baseState, stage: "parenthood", marriedAtTurn: 4, parenthoodAtTurn: 6, relation: 25, mutualIntent: 23, stress: 40, conflictTurns: 2, childPlan: "ready" });
    await act(page, "child", "separate");
    assert.equal((await read(page)).ending, "runaway");
    assert.match(await button(page, "ending-poster").innerText(), /已经离婚|现已离婚/);
    await capture(page, "07-divorce-has-a-reason");

    await button(page, "back-lobby").click();
    await button(page, "mode-parent").click();
    await button(page, "start-game").click();
    s = await read(page);
    await button(page, `candidate-${s.candidateOptions[0]}`).click();
    await drain(page);
    await act(page, "parent", "support");
    assert.equal((await read(page)).familyReserve, 28);
    assert.equal((await read(page)).activeActor, "parent");
    await fixture(page, { ...baseState, mode: "duel", activeActor: "parent", stage: "chatting", stress: 30 });
    await act(page, "parent", "next");
    s = await read(page);
    assert.equal(s.phase, "candidate");
    await button(page, `candidate-${s.candidateOptions[0]}`).click();
    await drain(page);
    assert.equal((await read(page)).activeActor, "child");
    await act(page, "child", "chat-listen");
    assert.equal((await read(page)).activeActor, "parent");

    await fixture(page, { ...baseState, stage: "married", marriedAtTurn: 4, stress: 90, savings: 2, weddingDebt: 32, familyReserve: 14 });
    await page.setViewportSize({ width: 320, height: 780 });
    await button(page, "actions-life").click();
    await capture(page, "08-small-phone-help-and-budget");
    await button(page, "child-action-ask-help").click();
    await capture(page, "09-small-phone-resolution");
    const resolution = await drain(page);
    assert.equal(resolution[0].changes.find(c => c.key === "familyReserve").delta, -14);
    assert.equal((await read(page)).familyReserve, 0);
    await page.reload({ waitUntil: "networkidle" });
    await button(page, "resume-game").click();
    assert.equal((await read(page)).familyReserve, 0);
    await page.getByRole("button", { name: "玩法说明", exact: true }).click();
    await page.keyboard.press("Escape");
    assert.equal((await read(page)).help, false);
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, "report.json"), JSON.stringify({ passed: true, errors, observations, shots }, null, 2));
    console.log(`Verified ${shots.length} screenshots, ${CANDIDATES.length} assets, full campaign, crisis recovery, divorce, all roles and 390/320px layouts.`);
  } catch (err) { writeFileSync(path.join(output, "failure.json"), JSON.stringify({ error: String(err.stack), errors, shots }, null, 2)); throw err; }
  finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
