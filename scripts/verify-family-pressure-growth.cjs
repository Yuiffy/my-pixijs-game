const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const base = `${process.env.MARRIAGE_BASE_URL || "http://127.0.0.1:3910"}/game/family-pressure`;
const out = "tmp/family-growth";
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));

(async () => {
  assert.equal((await fetch(base)).status, 200);
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const e = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [], shots = [], checks = [];
  mkdirSync(out, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true, reducedMotion: "reduce" });
    page.on("pageerror", err => errors.push(String(err)));
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.goto(base, { waitUntil: "networkidle" });
    const drain = async () => {
      for (let i = 0; i < 12 && (await read(page)).resolution; i++) await page.getByTestId("resolution-next").click();
      assert.equal((await read(page)).resolution, null);
    };
    const fixture = async (patch = {}, legacy = false) => {
      const state = { ...e.createInitialState(), phase: "turn", mode: "child", turn: 2, seed: 3, rng: 18, candidateId: "sui", stage: "chatting", meetings: 1, relation: 35, mutualIntent: 60, chemistry: 80, understanding: 45, stress: 20, savings: 40, familyBond: 90, pressure: 5, datingFeedback: "对方愿意再见一面，继续了解。", ...patch };
      if (legacy) {
        state.version = 4;
        for (const key of ["fitness", "grooming", "interests", "relationshipBalance", "growthNote"]) delete state[key];
      }
      await page.evaluate(s => localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(s)), state);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByTestId("resume-game").click();
      return read(page);
    };
    const shot = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.querySelectorAll("main img")].every(img => img.complete && img.naturalWidth));
      const pixels = inspectPng(await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled", fullPage: true }));
      assert.ok(pixels.colors > 64 && pixels.transparentRatio < .02 && pixels.nearBlackRatio < .8);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      shots.push({ name, pixels, state: await read(page) });
    };
    await page.getByTestId("start-game").click();
    await page.getByTestId("actions-growth").click();
    await shot("01-growth-desktop");
    await page.getByTestId("child-action-exercise").click();
    assert.match(await page.getByTestId("resolution-dialog").innerText(), /体能/);
    await drain();
    assert.equal((await read(page)).fitness, 50);
    await page.getByTestId("actions-growth").click();
    await page.getByTestId("child-action-groom").click();
    await drain();
    assert.equal((await read(page)).grooming, 64);
    await page.getByTestId("actions-growth").click();
    await page.getByTestId("open-growth").click();
    await shot("02-growth-record");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByTestId("open-growth").evaluate(el => el === document.activeElement), true);
    const saved = await read(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("resume-game").click();
    assert.equal((await read(page)).fitness, saved.fitness);
    assert.equal((await read(page)).grooming, saved.grooming);
    checks.push("new-game growth, action breakdown, modal focus and reload persistence");

    for (const [width, height] of [[390, 844], [320, 780]]) {
      await fixture();
      await page.setViewportSize({ width, height });
      await page.getByTestId("actions-growth").tap();
      await page.evaluate(() => scrollTo(0, 0));
      const boxes = await page.locator('[data-testid="turn-actions"] button[data-testid^="child-action-"]').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { bottom: r.bottom, top: r.top }; }));
      assert.equal(boxes.length, 4);
      assert.ok(boxes.every(b => b.top >= 0 && b.bottom <= height), `${width}: ${JSON.stringify(boxes)}`);
      await shot(`03-growth-mobile-${width}`);
      await page.getByTestId("child-action-hobby").tap();
      await drain();
      assert.equal((await read(page)).interests, 52);
    }
    checks.push("four growth choices in first viewport at 390 and 320, real touch action");

    await page.setViewportSize({ width: 1280, height: 720 });
    await fixture({ savings: 0 });
    await page.getByTestId("actions-growth").click();
    for (const id of ["groom", "hobby", "study"]) assert.ok(await page.getByTestId(`child-action-${id}`).isDisabled());
    assert.ok(await page.getByTestId("child-action-exercise").isEnabled());
    await shot("04-affordable-growth");
    await fixture({ stage: "dating", meetings: 3, relation: 70, savings: 100 });
    for (const balance of [49, 33]) {
      await page.getByTestId("actions-decision").click();
      await page.getByTestId("child-action-overgive").click();
      await drain();
      assert.equal((await read(page)).relationshipBalance, balance);
    }
    assert.match(await page.getByTestId("progression-guide").innerText(), /失衡/);
    await fixture({ stage: "dating", meetings: 3, chemistry: 44, grooming: 40, relation: 78, mutualIntent: 80 });
    await page.getByTestId("child-action-meet").click();
    await page.getByTestId("meeting-everyday").click();
    await drain();
    assert.equal((await read(page)).matchClosed, false);
    assert.equal((await read(page)).stage, "dating");
    checks.push("repeated overgiving triggers imbalance; grooming decay cannot undo established dating");
    await fixture({ stage: "dating", meetings: 3, relation: 70, relationshipBalance: 30 });
    await page.getByTestId("actions-decision").click();
    assert.equal(await page.getByTestId("child-action-simple-wedding").count(), 0);
    await shot("05-boundary-decision");
    await page.getByTestId("child-action-relationship-boundary").click();
    await drain();
    assert.equal((await read(page)).relationshipBalance, 54);
    await page.getByTestId("actions-decision").click();
    await page.getByTestId("child-action-simple-wedding").click();
    await page.getByTestId("decision-confirm").click();
    await drain();
    assert.equal((await read(page)).stage, "married");
    await page.getByTestId("actions-growth").click();
    await page.getByTestId("child-action-study").click();
    await drain();
    assert.ok((await read(page)).career >= 70);
    checks.push("affordability, imbalance blocks marriage, repair unlocks marriage, growth after marriage");

    await fixture({ stage: "married", relation: 20, mutualIntent: 20, relationshipBalance: 20 });
    await page.getByTestId("actions-decision").click();
    assert.match(await page.getByTestId("relationship-situation").innerText(), /贬低/);
    await page.getByTestId("child-action-separate").click();
    await page.getByTestId("decision-confirm").click();
    await drain();
    assert.equal((await read(page)).ending, "runaway");
    await shot("06-leave-imbalanced-marriage");

    await fixture({ matchClosed: true, chemistry: 20 });
    await page.getByTestId("actions-growth").click();
    await page.getByTestId("child-action-exercise").click();
    await drain();
    assert.equal((await read(page)).matchClosed, true);
    await page.getByTestId("actions-decision").click();
    await page.getByTestId("child-action-next").click();
    await drain();
    assert.equal((await read(page)).fitness, 50);
    assert.notEqual((await read(page)).candidateId, "sui");
    const legacy = await fixture({ turn: 9, savings: 23 }, true);
    assert.equal(legacy.version, 5);
    assert.equal(legacy.turn, 9);
    assert.equal(legacy.savings, 23);
    assert.equal(legacy.fitness, 40);
    checks.push("voluntary divorce, refusal respected, growth survives new candidate, real v4 migration");
    assert.deepEqual(errors, []);
    writeFileSync(`${out}/report.json`, JSON.stringify({ passed: true, errors, checks, shots }, null, 2));
    console.log(JSON.stringify({ passed: true, checks, screenshots: shots.length }));
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
