const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { inspectPng } = require("./lib/autochess-screenshot.cjs");
const base = process.env.HUSH_BASE_URL || "http://127.0.0.1:3877";
const out = "tmp/hush-live-verify";
const errors = [];
const shots = [];
const results = [];
const state = (page) =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
async function open(page, url = "/game/hush-live") {
  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.advanceTime);
  await advance(page, 0);
}
async function capture(page, name) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    canvas: [
      document.querySelector("canvas").width,
      document.querySelector("canvas").height,
    ],
  }));
  assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
  assert.deepEqual(layout.canvas, [960, 580]);
  const file = path.join(out, `${name}.png`);
  const pixels = inspectPng(
    await page.screenshot({ path: file, fullPage: true }),
  );
  shots.push({ file, pixels, layout, state: await state(page) });
}
async function hold(page, seconds, photograph) {
  const s = await state(page);
  assert.ok(s.action.key, JSON.stringify(s));
  await page.keyboard.down("e");
  const ms = ((seconds ?? s.action.seconds) + 0.08) * 1000;
  await advance(page, photograph ? ms / 2 : ms);
  if (photograph) { await capture(page, photograph); await advance(page, ms / 2); }
  await page.keyboard.up("e");
  await advance(page, 20);
}
async function walk(page, spot) {
  await page.locator(`[data-spot="${spot}"]`).click();
  await page.evaluate(() => {
    for (
      let i = 0;
      i < 500 && JSON.parse(window.render_game_to_text()).path.length;
      i++
    )
      window.advanceTime(50);
  });
  const s = await state(page);
  if (s.doorClosed && s.nearest === "door" && spot !== "door") {
    await hold(page);
    return walk(page, spot);
  }
  assert.equal(s.nearest, spot, `walk ${spot}: ${JSON.stringify(s)}`);
}
async function cover(page) {
  const s = await state(page);
  if (s.nearest === "partner" && s.cooldown === 0) {
    await page.keyboard.press("m");
    await advance(page, 0);
    return;
  }
  const b = s.broadcast;
  if (b.music && b.remaining >= s.action.seconds + 0.2) return;
  await advance(
    page,
    ((b.music ? b.remaining + 15 : b.remaining) + 0.1) * 1000,
  );
}
async function solve(page, photos = false) {
  const initial = await state(page);
  for (const task of initial.tasks) {
    if (task === "charger") {
      await walk(page, "shelf");
      await cover(page);
      if (photos) await capture(page, "music-cover");
      await hold(page);
      await walk(page, "sofa");
      await hold(page);
    }
    if (task === "food") {
      await walk(page, "entry");
      await hold(page);
      await walk(page, "partner");
      await cover(page);
      await hold(page, undefined, initial.level === 1 ? 'food-delivery' : undefined);
    }
    if (task === "delta") {
      await walk(page, "desk");
      await walk(page, "door");
      if (!(await state(page)).doorClosed) await hold(page);
      await walk(page, "desk");
      assert.equal((await state(page)).doorClosed, true);
      await hold(page, undefined, initial.level === 2 ? 'delta-closed-door' : undefined);
    }
    if (task === "hug" || task === "kiss") {
      await walk(page, "partner");
      await cover(page);
      await hold(page, undefined, initial.level === 3 ? `affection-${task}` : undefined);
    }
    assert.equal((await state(page)).phase, "playing");
  }
  await walk(page, "partner");
  if (!(await state(page)).bonus) {
    await cover(page);
    if (photos) await capture(page, "mute-and-love");
    await hold(page);
  }
  await walk(page, "sofa");
  await hold(page);
  const final = await state(page);
  assert.equal(final.won, true, JSON.stringify(final));
  results.push({
    level: final.level,
    score: final.totalScore,
    peak: final.peak,
    love: final.love,
    elapsed: final.elapsed,
  });
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert.equal((await fetch(base + "/game/hush-live")).status, 200);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  try {
    await open(page);
    await capture(page, "ready-desktop");
    fs.mkdirSync("public/games/hush-live", { recursive: true });
    inspectPng(
      await page
        .locator("canvas")
        .screenshot({ path: "public/games/hush-live/preview.png" }),
    );
    await page.getByLabel("玩家身份", { exact: true }).selectOption("女友");
    await page.getByLabel("恋人称呼", { exact: true }).selectOption("他");
    await page.locator("#hush-start").click();
    await advance(page, 0);
    await page.setViewportSize({ width: 1280, height: 720 });
    await capture(page, "playing-720");
    assert.ok(
      await page
        .locator('[data-act="hold"]')
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      "desktop action must fit in viewport",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Real key movement, quiet toggle and pause.
    const x = (await state(page)).player.x;
    await page.keyboard.down("d");
    await advance(page, 400);
    await page.keyboard.up("d");
    assert.ok((await state(page)).player.x > x);
    await page.keyboard.press("q");
    assert.equal((await state(page)).quiet, false);
    await page.keyboard.press("q");
    await page.keyboard.press("p");
    const paused = await state(page);
    await advance(page, 5000);
    assert.equal((await state(page)).elapsed, paused.elapsed);
    await capture(page, "paused");
    await page.getByRole("button", { name: "继续今晚 →" }).click();
    // Click-to-walk directly on the canvas.
    const box = await page.locator("canvas").boundingBox();
    await page.mouse.click(
      box.x + (104 / 960) * box.width,
      box.y + (493 / 580) * box.height,
    );
    assert.equal((await state(page)).target, "entry");
    for (let level = 0; level < 5; level++) {
      await solve(page, level === 0);
      if (level === 0 || level === 4)
        await capture(page, `result-${level + 1}`);
      if (level < 4) {
        await page.getByRole("button", { name: "下一个夜晚 →" }).click();
        await page.locator("#hush-start").click();
      }
    }
    assert.equal((await state(page)).progression.unlocked, 5);
    await page.getByRole("button", { name: "再开一个加班夜 →" }).click();
    await page.locator("#hush-start").click();
    await solve(page);
    await page.getByRole("button", { name: "复制成绩分享" }).click();
    const share = await page.getByLabel("成绩分享文案").inputValue();
    assert.match(share, /seed=/);
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /加班夜/,
    );
    await page.reload({ waitUntil: "networkidle" });
    await advance(page, 0);
    assert.equal((await state(page)).progression.unlocked, 5);
    assert.equal((await state(page)).progression.player, "女友");
    assert.equal((await state(page)).progression.partner, "他");
    // Timeout and retry, then actual reckless movement causes exposure.
    await page.locator("#hush-start").click();
    await advance(page, 200000);
    assert.equal((await state(page)).reason, "timeout");
    await page.getByRole("button", { name: "再试一次 →" }).click();
    assert.equal((await state(page)).phase, "playing");
    await walk(page, "partner");
    await page.keyboard.down("Shift");
    await page.keyboard.down("ArrowRight");
    await advance(page, 20000);
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("Shift");
    assert.equal((await state(page)).reason, "caught");
    await capture(page, "caught");
    await page.getByRole("button", { name: "重玩本晚" }).click();
    await page.locator("#hush-start").click();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal((await state(page)).phase, "paused");
    // Persistence, malformed save, restricted storage.
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await mobile.newPage();
    phone.on("pageerror", (e) => errors.push(e.message));
    await open(phone);
    await capture(phone, "mobile-ready");
    await phone.locator("#hush-start").tap();
    await phone.locator('[data-spot="shelf"]').tap();
    await phone.evaluate(() => {
      for (
        let i = 0;
        i < 300 && JSON.parse(window.render_game_to_text()).path.length;
        i++
      )
        window.advanceTime(50);
    });
    await cover(phone);
    const holdButton = phone.locator('[data-act="hold"]');
    await holdButton.scrollIntoViewIfNeeded();
    const hb = await holdButton.boundingBox();
    const cdp = await mobile.newCDPSession(phone);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }],
    });
    await advance(phone, 2150);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal((await state(phone)).carry, "charger");
    await capture(phone, "mobile-touch-playing");
    await phone.setViewportSize({ width: 320, height: 740 });
    await capture(phone, "mobile-320-playing");
    assert.ok(
      await phone
        .locator('[data-act="hold"]')
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      "mobile action must fit in viewport",
    );
    await walk(phone, "sofa");
    await hold(phone);
    await hold(phone);
    assert.equal((await state(phone)).won, true);
    await phone.setViewportSize({ width: 320, height: 740 });
    await capture(phone, "mobile-320-result");
    await phone.evaluate(() => localStorage.setItem("hush-live-v1", "{broken"));
    await open(phone);
    assert.equal((await state(phone)).progression.unlocked, 0);
    await mobile.close();
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new Error("blocked");
      };
      Storage.prototype.getItem = () => {
        throw new Error("blocked");
      };
    });
    const blockedPage = await blocked.newPage();
    await open(blockedPage);
    await blockedPage.locator("#hush-start").click();
    await solve(blockedPage);
    assert.equal((await state(blockedPage)).won, true);
    await blocked.close();
    // Live RAF timing, audio unlock, fullscreen and catalogue navigation.
    const live = await context.newPage();
    live.on('pageerror', e => errors.push(e.message));
    await live.goto(base + '/game/hush-live', { waitUntil: 'networkidle' });
    await live.locator('#hush-start').click();
    const before = (await state(live)).elapsed;
    await live.waitForTimeout(500);
    assert.ok((await state(live)).elapsed > before + 0.3);
    await live.getByRole('button', { name: '声音 关' }).click();
    await live.waitForTimeout(100);
    await live.getByRole('button', { name: '声音 开' }).click();
    await live.keyboard.press('f');
    await live.waitForFunction(() => !!document.fullscreenElement);
    await live.keyboard.press('f');
    await live.waitForFunction(() => !document.fullscreenElement);
    await live.goto(base + '/demos', { waitUntil: 'networkidle' });
    const entry = live.locator('a[href="/game/hush-live"]');
    assert.equal(await entry.count(), 1);
    await entry.scrollIntoViewIfNeeded();
    const preview = entry.locator('img');
    assert.ok(await preview.evaluate(img => img.complete && img.naturalWidth > 0));
    await entry.click(); await live.waitForURL('**/game/hush-live');
    await live.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify({ results, shots, errors }, null, 2),
    );
    console.log(
      JSON.stringify(
        { results, screenshots: shots.map((s) => s.file), errors },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
