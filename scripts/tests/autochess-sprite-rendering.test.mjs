import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [host, scene, bridge, assets, config, layout] = await Promise.all([
  readFile(new URL("../../src/components/autoChessGame/PhaserGame.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/RiftLineScene.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/EngineBridge.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/assets.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/gameConfig.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/layout.ts", import.meta.url), "utf8"),
]);

test("Phaser 宿主保留浏览器验证画布和确定性时间接口", () => {
  assert.match(host, /data-game-canvas", "rift-line"/);
  assert.match(host, /window\.render_game_to_text/);
  assert.match(host, /window\.advanceTime/);
  assert.match(host, /gameRef\.current\?\.destroy\(true\)/);
  assert.match(host, /await import\("phaser"\)/);
});

test("游戏配置保持 1120×720 逻辑世界并使用 Phaser 缩放管理", () => {
  assert.match(config, /width: WORLD_WIDTH/);
  assert.match(config, /height: WORLD_HEIGHT/);
  assert.match(config, /mode: Phaser\.Scale\.FIT/);
  assert.match(config, /autoCenter: Phaser\.Scale\.CENTER_BOTH/);
  assert.match(layout, /WORLD_WIDTH = 1120/);
  assert.match(layout, /WORLD_HEIGHT = 720/);
});

test("引擎桥接只派发公开规则命令并使用固定步长测试推进", () => {
  assert.match(bridge, /new AutoChessEngine/);
  assert.match(bridge, /engine\.moveUnit/);
  assert.match(bridge, /engine\.sellUnit/);
  assert.match(bridge, /engine\.update\(1 \/ 60\)/);
  assert.match(bridge, /Math\.min\(0\.05/);
  assert.doesNotMatch(bridge, /state\.selected\s*=/);
});

test("Phaser 场景覆盖标题、备战、战斗、结算、强化和结束阶段", () => {
  assert.match(scene, /drawTitle\(\)/);
  assert.match(scene, /drawPreparation\(\)/);
  assert.match(scene, /drawBattle\(\)/);
  assert.match(scene, /drawResult\(\)/);
  assert.match(scene, /drawAugments\(\)/);
  assert.match(scene, /drawGameOver\(\)/);
});

test("备战和手机布局使用相同引擎动作并提供紧凑 profile", () => {
  assert.match(scene, /createShopTraitTags/);
  assert.match(scene, /traitActivatesAfterPurchase/);
  assert.match(scene, /type: "shop"/);
  assert.match(scene, /type: "buyXp"/);
  assert.match(scene, /type: "lock"/);
  assert.match(scene, /type: "reroll"/);
  assert.match(scene, /type: "battle"/);
  assert.match(scene, /type: "sell"/);
  assert.match(scene, /compactBoardSlot/);
  assert.match(scene, /drawCompactShop/);
  assert.match(layout, /profileFor/);
  assert.match(layout, /"compact"/);
});

test("战斗视图由引擎 fighter 状态同步，并支持完整动作、状态和能量反馈", () => {
  assert.match(scene, /fighter\.jumpTime/);
  assert.match(scene, /fighter\.jumpArcHeight/);
  assert.match(scene, /fighter\.attackPulse/);
  assert.match(scene, /fighter\.hitPulse/);
  assert.match(scene, /fighter\.shield/);
  assert.match(scene, /fighter\.burnTime/);
  assert.match(scene, /fighter\.stun/);
  assert.match(scene, /fighter\.facingX < 0/);
  assert.match(scene, /fighter\.energy \/ fighter\.maxEnergy/);
  assert.match(scene, /ENERGY_PROFILES\[fighter\.energyStyle\]\.color/);
  assert.match(scene, /this\.fighterViews\.get\(fighter\.fid\)/);
  assert.match(scene, /setDepth\(DEPTH\.entities \+ visualY\)/);
});

test("头像保持焦点裁切并使用 Phaser 4 WebGL mask", () => {
  assert.match(scene, /portraitFocus === "top"/);
  assert.match(scene, /portrait\.setCrop/);
  assert.doesNotMatch(scene, /createGeometryMask/);
  assert.match(scene, /portraitStyle === "sprite"/);
  assert.match(scene, /portraitImage\.setFlipX/);
});

test("战斗同步覆盖投射物、七类技能效果与两类召唤物", () => {
  assert.match(scene, /battle\.projectiles/);
  assert.match(scene, /battle\.effects/);
  assert.match(scene, /battle\.pets/);
  assert.match(scene, /battle\.pineTrees/);
  assert.match(scene, /battle\.chronospheres/);
  assert.match(scene, /projectile\.style === "pine_needle"/);
  assert.match(scene, /projectile\.style === "shark"/);
  assert.match(scene, /projectile\.style === "carrot"/);
  assert.match(scene, /effect\.kind === "line"/);
  assert.match(scene, /effect\.kind === "ring"/);
  assert.match(scene, /effect\.kind === "burst"/);
  assert.match(scene, /effect\.kind === "chronosphere"/);
  assert.match(scene, /effect\.kind === "hotpot"/);
  assert.match(scene, /mechanicalRabbitMuzzle/);
});

test("文字通过统一高 DPI resolution 策略绘制", () => {
  assert.match(scene, /textResolution = 2/);
  assert.match(scene, /resolution: this\.textResolution/);
  assert.match(scene, /window\.devicePixelRatio/);
});

test("结果页面不会在后续 battle HUD 同步中销毁继续按钮", () => {
  assert.match(scene, /if \(this\.phase === "battle"\)/);
  assert.match(scene, /resultContinueLabel/);
  assert.match(scene, /继续 · 进入整备/);
  assert.match(scene, /DEPTH\.overlay \+ 3/);
});

test("场景预加载单位头像并保留缺图降级纹理", () => {
  assert.match(assets, /Object\.values\(UNIT_DEFS\)/);
  assert.match(assets, /scene\.load\.image/);
  assert.match(assets, /rift-fallback-unit/);
  assert.match(scene, /textureKeyForUnit/);
  assert.match(scene, /this\.textures\.exists\(key\)/);
});

test("React 工具栏仍提供图鉴、音频、全屏与安全区支撑", () => {
  assert.match(host, /Codex/);
  assert.match(host, /AutoChessAudio/);
  assert.match(host, /全屏游玩/);
  assert.match(host, /safe-area-inset-bottom/);
  assert.match(host, /aria-live="polite"/);
});
