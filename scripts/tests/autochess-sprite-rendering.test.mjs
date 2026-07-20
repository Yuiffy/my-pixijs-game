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

test("战斗视图由引擎 fighter 状态同步，并支持朝向、跳跃、生命和能量", () => {
  assert.match(scene, /fighter\.jumpTime/);
  assert.match(scene, /fighter\.jumpArcHeight/);
  assert.match(scene, /fighter\.facingX < 0/);
  assert.match(scene, /fighter\.energy \/ fighter\.maxEnergy/);
  assert.match(scene, /ENERGY_PROFILES\[fighter\.energyStyle\]\.color/);
  assert.match(scene, /this\.fighterViews\.get\(fighter\.fid\)/);
  assert.match(scene, /setDepth\(DEPTH\.entities \+ fighter\.y\)/);
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
