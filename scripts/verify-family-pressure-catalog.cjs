const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const base = process.env.MARRIAGE_BASE_URL || "http://127.0.0.1:3910";
const out = process.env.MARRIAGE_QA_DIR || "tmp/family-catalog";
(async () => {
  assert.equal((await fetch(`${base}/game/family-pressure`)).status, 200);
  const { loadTypescriptModule } = await import("./tests/helpers/load-typescript-module.mjs");
  const { CANDIDATES } = await loadTypescriptModule("src/components/marriagePressureGame/content.ts");
  const { getCandidateProfile } = await loadTypescriptModule("src/components/marriagePressureGame/household.ts");
  const { createInitialState } = await loadTypescriptModule("src/components/marriagePressureGame/engine.ts");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  mkdirSync(out, { recursive: true });
  const errors = [], shots = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    page.on("pageerror", err => errors.push(String(err)));
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.goto(`${base}/game/family-pressure`, { waitUntil: "networkidle" });
    const legacy = { ...createInitialState(), phase: "turn", candidateId: "xu", stage: "dating", turn: 7, relation: 73, mutualIntent: 68, savings: 21 };
    await page.evaluate(s => localStorage.setItem("marriage-pressure-save-v1", JSON.stringify(s)), legacy);
    await page.reload({ waitUntil: "networkidle" });
    const before = await page.evaluate(() => ({ state: window.render_game_to_text(), save: localStorage.getItem("marriage-pressure-save-v1") }));
    const catalog = page.getByTestId("candidate-catalog");
    await catalog.locator("summary").click();
    assert.equal(await catalog.locator('button[data-testid^="catalog-person-"]').count(), 40);
    assert.doesNotMatch(await catalog.innerText(), /许青|林知夏|乔安|陈雨宁|周可|唐悦/);
    const shot = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.querySelectorAll("main img")].every(img => img.complete && img.naturalWidth));
      const pixels = inspectPng(await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" }));
      assert.ok(pixels.colors > 64 && pixels.nearBlackRatio < .8 && pixels.transparentRatio < .02);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      shots.push({ name, pixels, state: await page.evaluate(() => JSON.parse(window.render_game_to_text())) });
    };
    await catalog.scrollIntoViewIfNeeded();
    await shot("01-clickable-catalog");
    await page.getByTestId(`catalog-person-${CANDIDATES[0].id}`).click();
    const dialog = page.getByTestId("catalog-person-dialog");
    for (const candidate of CANDIDATES) {
      const profile = getCandidateProfile(1, candidate.id);
      assert.equal(await dialog.locator("h2").innerText(), candidate.name);
      const text = await dialog.innerText();
      for (const field of [candidate.subtitle, candidate.opening, candidate.boundary, profile.title, profile.wish]) assert.ok(text.includes(field), `${candidate.id}: ${field}`);
      const stats = await dialog.locator("dd").allTextContents();
      assert.deepEqual(stats, [String(candidate.resume), String(candidate.compatibility), String(candidate.initialIntent), `请客 ${candidate.cityCost} · AA ${Math.ceil(candidate.cityCost / 2)}`, `${profile.spending} / 回合`, `${profile.income} / 回合`, `${profile.flexibility} / 100`]);
      await dialog.locator("img").evaluate(img => img.decode());
      assert.equal(await dialog.locator("img").getAttribute("src"), candidate.image);
      await page.getByTestId("catalog-next").click();
    }
    assert.equal(await dialog.locator("h2").innerText(), CANDIDATES[0].name);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await dialog.locator("h2").innerText(), CANDIDATES.at(-1).name);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByTestId(`catalog-person-${CANDIDATES[0].id}`).evaluate(el => el === document.activeElement), true);
    await page.getByTestId("catalog-search").fill("艰苦");
    assert.equal(await catalog.locator('button[data-testid^="catalog-person-"]').count(), 1);
    await page.getByTestId("catalog-person-komichi").click();
    await shot("02-komichi-profile-desktop");
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await shot("03-komichi-traits-desktop");
    await page.getByTestId("catalog-close").click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByTestId("catalog-person-komichi").click();
      await shot(`04-profile-${width}`);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844);
      if (width === 320) {
        await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
        const lastValue = await dialog.locator("dd").last().boundingBox();
        const footer = await dialog.locator("nav").boundingBox();
        assert.ok(lastValue.y >= 0 && lastValue.y + lastValue.height <= footer.y);
        await shot("05-traits-320");
      }
      await page.getByTestId("catalog-close").click();
    }
    await page.getByTestId("catalog-search").fill("许青");
    assert.match(await catalog.innerText(), /没有找到匹配的人物/);
    const after = await page.evaluate(() => ({ state: window.render_game_to_text(), save: localStorage.getItem("marriage-pressure-save-v1") }));
    assert.deepEqual(after, before, "Reviewing the catalog must not mutate the game or stored save");
    await page.getByTestId("resume-game").click();
    const restored = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(restored.candidateId, "izayoi");
    assert.equal(restored.turn, 7);
    assert.equal(restored.relation, 73);
    assert.equal(restored.savings, 21);
    assert.deepEqual(errors, []);
    writeFileSync(`${out}/report.json`, JSON.stringify({ passed: true, count: CANDIDATES.length, errors, shots }, null, 2));
    console.log(`All ${CANDIDATES.length} profiles, images and traits verified; search, keyboard, mobile, unchanged save and legacy resume passed.`);
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
