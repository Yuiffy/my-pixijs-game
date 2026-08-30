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
const artifactDirectory = ".tmp/wuxia-editions";
mkdirSync(artifactDirectory, { recursive: true });

const waitForPage = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/game/wuxia`);
      if (response.ok) return;
    } catch {
      // Retry while the local development server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  assert.fail(`武侠页面无法访问: ${baseUrl}/game/wuxia`);
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

    const readState = async () => {
      const raw = await page.evaluate(() => window.render_game_to_text?.() || "");
      assert.ok(raw, "render_game_to_text 未初始化");
      return JSON.parse(raw);
    };
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
    const waitForLegacyDecision = async () => {
      await page.waitForFunction(() => {
        const raw = window.render_game_to_text?.();
        if (!raw) return false;
        try {
          const state = JSON.parse(raw);
          return state.edition === "legacy" && (state.screen === "choice" || state.screen === "ending");
        } catch {
          return false;
        }
      }, null, { timeout: 15000 });
      return readState();
    };
    const capture = async (name, locator) => {
      const path = `${artifactDirectory}/${name}.png`;
      const buffer = locator
        ? await locator.screenshot({ path })
        : await page.screenshot({ path, fullPage: true });
      screenshots[name] = { path, ...inspectPng(buffer) };
      return screenshots[name];
    };
    const assertNoHorizontalOverflow = async (label) => {
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
      assert.ok(overflow <= 1, `${label} 横向溢出 ${overflow}px`);
    };
    const enterEdition = async (name, edition) => {
      await page.getByRole("button", { name, exact: true }).click();
      await waitForScreen("setup");
      assert.equal((await readState()).edition, edition);
    };
    const returnToPicker = async () => {
      await page.getByRole("button", { name: "切换武侠版本", exact: true }).click();
      await waitForScreen("edition-select");
    };

    await page.addInitScript(() => {
      let state = 0x5f3759df;
      Math.random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    });
    await page.goto(`${baseUrl}/game/wuxia`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForScreen("edition-select");

    let picker = await readState();
    assert.deepEqual(
      picker.editions.map((edition) => edition.name),
      ["简陋测试版", "开放江湖"],
    );
    assert.ok(await page.getByRole("button", { name: "进入简陋测试版", exact: true }).isVisible());
    assert.ok(await page.getByRole("button", { name: "进入开放江湖", exact: true }).isVisible());
    await assertNoHorizontalOverflow("桌面版本选择");
    await capture("edition-picker-desktop");

    await enterEdition("进入简陋测试版", "legacy");
    assert.ok(await page.getByRole("button", { name: "开始江湖演义", exact: true }).isVisible());
    assert.equal(await page.locator("#wuxia-hero-name").count(), 0, "简陋测试版不应出现新版捏人界面");
    await capture("legacy-start", page.getByRole("button", { name: "开始江湖演义", exact: true }));
    await page.getByRole("button", { name: "开始江湖演义", exact: true }).click();

    let legacyState = await waitForLegacyDecision();
    assert.equal(legacyState.edition, "legacy");
    await capture("legacy-story", page.locator("div.overflow-y-auto").first());

    let decisions = 0;
    const legacyTrace = [];
    while (legacyState.screen !== "ending" && decisions < 90) {
      assert.ok(legacyState.choices.length > 0, `旧版第 ${decisions + 1} 次停笔没有选项`);
      const findExact = (text) => legacyState.choices.find((choice) => choice.text === text);
      const findStart = (text) => legacyState.choices.find((choice) => choice.text.startsWith(text));
      const selected = findExact("弟子领命！")
        || (legacyState.hero?.inventory.includes("回信") ? findExact("返回师门") : null)
        || findExact("杀回城市，找仇人算账！")
        || findStart("使出绝学")
        || findExact("继续")
        || (legacyState.stageName === "决战巅峰" && legacyState.location?.type === "sect"
          ? findStart("下山前往")
          : null)
        || (legacyState.stageName === "决战巅峰" && legacyState.location?.type === "city"
          ? legacyState.choices.find((choice) => choice.text.includes("探险"))
          : null)
        || legacyState.choices[0];
      legacyTrace.push({
        decision: decisions + 1,
        stage: legacyState.stageName,
        turn: legacyState.turnInStage,
        location: legacyState.location?.name,
        inventory: legacyState.hero?.inventory,
        selected: selected.text,
      });
      const priorChoiceIds = legacyState.choices.map((choice) => choice.id).join("|");
      await page.locator("button").filter({ hasText: selected.text }).last().click();
      await page.waitForFunction((previous) => {
        const raw = window.render_game_to_text?.();
        if (!raw) return false;
        try {
          const state = JSON.parse(raw);
          return state.screen === "ending"
            || (state.screen === "choice" && state.choices.map((choice) => choice.id).join("|") !== previous);
        } catch {
          return false;
        }
      }, priorChoiceIds, { timeout: 15000 });
      legacyState = await readState();
      decisions += 1;
    }
    assert.equal(
      legacyState.screen,
      "ending",
      `简陋测试版没有在 90 次选择内写到结局: ${JSON.stringify(legacyTrace.slice(-15))}`,
    );
    assert.match(await page.locator("body").innerText(), /—— 全书完 ——/);
    assert.ok(await page.getByRole("button", { name: "开启下一世", exact: true }).isVisible());
    assert.equal(
      await page.evaluate(() => window.localStorage.getItem("wuxia-novel-save-v1")),
      null,
      "改版前测试版不应凭空出现新版存档",
    );
    await capture("legacy-ending", page.locator("div.overflow-y-auto").first());

    await returnToPicker();
    await enterEdition("进入开放江湖", "sandbox");
    await page.locator("#wuxia-hero-name").fill("苏照野");
    await page.locator("#wuxia-seed").fill("verify-sandbox-edition-browser");
    await page.getByRole("button", { name: /落笔开卷/ }).click();
    await waitForScreen("agenda");
    const sandboxOpening = await readState();
    assert.equal(sandboxOpening.edition, "sandbox");
    assert.equal(sandboxOpening.version, 6);
    assert.ok(await page.evaluate(() => Boolean(window.localStorage.getItem("wuxia-novel-save-v6"))));
    await capture("sandbox-opening");

    await returnToPicker();
    picker = await readState();
    assert.equal(picker.editions.find((edition) => edition.id === "legacy").saved, false);
    assert.equal(picker.editions.find((edition) => edition.id === "sandbox").saved, true);
    await enterEdition("进入简陋测试版", "legacy");
    assert.ok(await page.getByRole("button", { name: "开始江湖演义", exact: true }).isVisible());
    await returnToPicker();

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow("移动端版本选择");
    await capture("edition-picker-mobile");

    assert.deepEqual(consoleErrors, [], `浏览器控制台错误: ${JSON.stringify(consoleErrors)}`);
    assert.deepEqual(failedResponses, [], `页面失败请求: ${JSON.stringify(failedResponses)}`);
    console.log(JSON.stringify({
      ok: true,
      legacyDecisions: decisions,
      legacyStage: legacyState.stageName,
      sandboxVersion: sandboxOpening.version,
      saves: picker.editions,
      screenshots,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
