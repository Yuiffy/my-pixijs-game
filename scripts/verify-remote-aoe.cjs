const { createRequire } = require("node:module");
const { existsSync, mkdirSync } = require("node:fs");

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
      // Continue through the repository's known Playwright locations.
    }
  }
  throw new Error("无法加载 playwright，请安装依赖或设置 PLAYWRIGHT_MODULE");
};

const { chromium } = loadPlaywright();
const baseUrl = process.env.AUTOCHESS_BASE_URL || "http://127.0.0.1:3100";
const artifactDirectory = ".tmp/autochess";
mkdirSync(artifactDirectory, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = async (milliseconds) => page.evaluate((value) => window.advanceTime(value), milliseconds);
  const clickLogical = async (x, y, options = {}) => {
    const canvas = page.locator('[data-game-canvas="rift-line"]');
    const box = await canvas.boundingBox();
    const logical = await canvas.evaluate((element) => ({
      width: Number(element.dataset.logicalWidth || 1120),
      height: Number(element.dataset.logicalHeight || 720),
    }));
    if (!box) throw new Error("游戏画布没有可交互区域");
    const fitScale = Math.min(box.width / logical.width, box.height / logical.height);
    await page.mouse.click(
      box.x + (box.width - logical.width * fitScale) / 2 + x * fitScale,
      box.y + (box.height - logical.height * fitScale) / 2 + y * fitScale,
      options,
    );
  };
  const screenshot = async (filename) => {
    const path = `${artifactDirectory}/${filename}`;
    const buffer = await page.screenshot({ path, fullPage: true });
    if (buffer.length < 20_000) throw new Error(`截图文件异常偏小: ${path} (${buffer.length})`);
    return { path, bytes: buffer.length };
  };

  const enterBattleWith = async ({ unitId, unitName, seed }) => {
    errors.length = 0;
    await page.goto(`${baseUrl}/game/autochess?seed=${seed}`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-game-canvas="rift-line"]').waitFor();
    await page.locator(".rift-dom-choice").first().click();
    await page.waitForTimeout(80);
    const preparation = await readState();
    if (
      preparation.phase !== "preparation"
      || !preparation.shop.some((entry) => entry.id === unitId)
    ) return null;

    const card = page.locator(`button[aria-label^="${unitName}"]`);
    if (await card.count() !== 1) return null;
    await card.click();
    let purchased = await readState();
    if (![...purchased.board, ...purchased.bench].some((unit) => unit.id === unitId)) return null;
    const starter = purchased.board.find((unit) => unit.id !== unitId);
    if (starter) {
      const row = Math.floor(starter.index / 6);
      const slotX = 44 + (starter.index % 6) * 116 + (row % 2) * 20;
      const slotY = 232 + row * 68;
      await clickLogical(slotX + 52, slotY + 29, { button: "right" });
      purchased = await readState();
      if (purchased.board.some((unit) => unit.id === starter.id)) {
        throw new Error(`未能出售起始棋子 ${starter.id} 以延长专项战斗`);
      }
    }
    await page.locator("button.rift-start-button").click();
    const battle = await readState();
    return battle.phase === "battle" ? battle : null;
  };

  const findProjectileScenario = async () => {
    const seeds = [22, 32, 50, 76, 101, 103, 110, 122];
    for (const seed of seeds) {
      const entered = await enterBattleWith({ unitId: "spark_mage", unitName: "北欧魔法师", seed });
      if (!entered) continue;
      for (let step = 0; step < 240; step += 1) {
        const state = await readState();
        if (state.phase !== "battle") break;
        const source = state.battle.playerUnits.find((unit) => unit.unitId === "spark_mage");
        const delivery = state.battle.visualEffects.projectiles.find((projectile) =>
          projectile.style === "aoe_orb" && projectile.ability === "spark_mage",
        );
        if (source && delivery && Math.hypot(delivery.x - source.x, delivery.y - source.y) > 20) {
          const inFlightScreenshot = await screenshot("remote-aoe-projectile-flight.png");
          for (let impactStep = 0; impactStep < 14; impactStep += 1) {
            await advance(50);
            const impactState = await readState();
            if (
              impactState.battle
              && !impactState.battle.visualEffects.projectiles.some((projectile) => projectile.ability === "spark_mage")
              && impactState.battle.visualEffects.chronospheres.length > 0
            ) {
              const impactScreenshot = await screenshot("remote-aoe-projectile-impact.png");
              const impactSource = impactState.battle.playerUnits.find((unit) => unit.unitId === "spark_mage");
              if (!impactSource || impactSource.energy <= 0) {
                throw new Error(`时停落地时北欧魔法师能量异常: ${JSON.stringify(impactSource)}`);
              }
              await advance(600);
              const drainingState = await readState();
              const drainingSource = drainingState.battle?.playerUnits.find((unit) => unit.unitId === "spark_mage");
              if (
                !drainingSource
                || !drainingState.battle.visualEffects.chronospheres.length
                || drainingSource.energy >= impactSource.energy
              ) {
                throw new Error(`时停持续期间能量未下降: ${JSON.stringify({ impactSource, drainingSource })}`);
              }
              const drainingScreenshot = await screenshot("remote-aoe-energy-draining.png");
              let endedState = drainingState;
              for (let endStep = 0; endStep < 80; endStep += 1) {
                await advance(50);
                endedState = await readState();
                if (
                  endedState.battle
                  && !endedState.battle.visualEffects.chronospheres.length
                ) break;
              }
              const endedSource = endedState.battle?.playerUnits.find((unit) => unit.unitId === "spark_mage");
              if (
                !endedState.battle
                || endedState.battle.visualEffects.chronospheres.length
                || !endedSource
                || endedSource.energy > 1
              ) {
                throw new Error(`时停未在能量耗尽时结束: ${JSON.stringify({ endedSource, chronospheres: endedState.battle?.visualEffects.chronospheres })}`);
              }
              const endedScreenshot = await screenshot("remote-aoe-energy-empty.png");
              return {
                seed,
                inFlightState: state,
                impactState,
                drainingState,
                endedState,
                inFlightScreenshot,
                impactScreenshot,
                drainingScreenshot,
                endedScreenshot,
                errors: [...errors],
              };
            }
          }
        }
        await advance(100);
      }
    }
    throw new Error(`已知商店种子内未捕获北欧时停的 AOE 弹幕飞行与落地帧: ${seeds.join(",")}`);
  };

  const findBeamScenario = async () => {
    const seeds = [15, 19, 27, 30, 48, 73, 87, 101];
    for (const seed of seeds) {
      const entered = await enterBattleWith({ unitId: "shiori", unitName: "椰子栞", seed });
      if (!entered) continue;
      for (let step = 0; step < 240; step += 1) {
        const state = await readState();
        if (state.phase !== "battle") break;
        const beam = state.battle.visualEffects.effects.find((effect) =>
          effect.kind === "line" && effect.size === 7,
        );
        const ring = state.battle.visualEffects.effects.find((effect) =>
          effect.kind === "ring" && effect.size === 136,
        );
        if (beam && ring && beam.x2 === ring.x && beam.y2 === ring.y) {
          const beamScreenshot = await screenshot("remote-aoe-beam-impact.png");
          return {
            seed,
            state,
            beam,
            ring,
            beamScreenshot,
            errors: [...errors],
          };
        }
        await advance(100);
      }
    }
    throw new Error(`已知商店种子内未捕获椰子栞的即时声束与 AOE 同帧: ${seeds.join(",")}`);
  };

  const projectile = await findProjectileScenario();
  if (projectile.errors.length) {
    throw new Error(`弹幕型场景控制台出现错误: ${JSON.stringify(projectile.errors)}`);
  }
  const beam = await findBeamScenario();
  if (beam.errors.length) {
    throw new Error(`声束型场景控制台出现错误: ${JSON.stringify(beam.errors)}`);
  }

  const canvas = page.locator('[data-game-canvas="rift-line"]');
  const canvasBox = await canvas.boundingBox();
  const canvasMeta = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
    logicalWidth: element.dataset.logicalWidth,
    logicalHeight: element.dataset.logicalHeight,
    renderScale: element.dataset.renderScale,
  }));
  if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 500) {
    throw new Error(`游戏画布尺寸异常: ${JSON.stringify(canvasBox)}`);
  }

  console.log(JSON.stringify({
    projectile: {
      seed: projectile.seed,
      flightElapsed: projectile.inFlightState.battle.elapsed,
      flight: projectile.inFlightState.battle.visualEffects.projectiles,
      impactElapsed: projectile.impactState.battle.elapsed,
      impact: {
        effects: projectile.impactState.battle.visualEffects.effects,
        chronospheres: projectile.impactState.battle.visualEffects.chronospheres,
      },
      draining: {
        source: projectile.drainingState.battle.playerUnits.find((unit) => unit.unitId === "spark_mage"),
        chronospheres: projectile.drainingState.battle.visualEffects.chronospheres,
      },
      ended: {
        source: projectile.endedState.battle.playerUnits.find((unit) => unit.unitId === "spark_mage"),
        chronospheres: projectile.endedState.battle.visualEffects.chronospheres,
      },
      screenshots: [
        projectile.inFlightScreenshot,
        projectile.impactScreenshot,
        projectile.drainingScreenshot,
        projectile.endedScreenshot,
      ],
    },
    beam: {
      seed: beam.seed,
      elapsed: beam.state.battle.elapsed,
      beam: beam.beam,
      ring: beam.ring,
      screenshot: beam.beamScreenshot,
    },
    canvasBox,
    canvasMeta,
    errors: [],
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
