import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [host, hud, scene, bridge, assets, config, layout, theme, engine, gameTypes, canvasEffects] = await Promise.all([
  readFile(new URL("../../src/components/autoChessGame/PhaserGame.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/RiftHud.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/RiftLineScene.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/EngineBridge.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/assets.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/gameConfig.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/layout.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/phaser/theme.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/core/gameEngine.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/core/gameTypes.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/canvas/effects.ts", import.meta.url), "utf8"),
]);

test("Phaser 宿主保留浏览器验证画布和确定性时间接口", () => {
  assert.match(host, /data-game-canvas", "rift-line"/);
  assert.match(host, /window\.render_game_to_text/);
  assert.match(host, /window\.advanceTime/);
  assert.match(host, /gameRef\.current\?\.destroy\(true\)/);
  assert.match(host, /await import\("phaser"\)/);
  assert.doesNotMatch(host, /DomTooltip|onTooltip|tooltip=/);
});

test("游戏配置保持 1120×720 逻辑世界并由宿主管理高 DPI 缩放", () => {
  assert.match(config, /width: WORLD_WIDTH/);
  assert.match(config, /height: WORLD_HEIGHT/);
  assert.match(config, /mode: Phaser\.Scale\.NONE/);
  assert.match(config, /autoCenter: Phaser\.Scale\.CENTER_BOTH/);
  assert.match(layout, /WORLD_WIDTH = 1120/);
  assert.match(layout, /WORLD_HEIGHT = 720/);
  assert.match(layout, /MIN_CARD_SCALE = 0\.72/);
  assert.match(layout, /MAX_CARD_SCALE = 1\.25/);
  assert.match(layout, /viewportScaleFor/);
  assert.match(scene, /viewportScaleFor\(width, height\)/);
  assert.match(scene, /setZoom\(fitScale\)/);
  assert.match(layout, /MAX_TEXT_RESOLUTION = 2/);
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
  assert.match(scene, /if \(!this\.phaseLayer \|\| !this\.entityLayer \|\| !this\.effectsLayer\) return/);
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
  assert.match(scene, /const \{ abilityMotion \} = fighter/);
  assert.match(scene, /abilityMotion\?\.kind === "jump"/);
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

test("突进、跃击与击退由引擎运动状态推进，仅保留明确设计的两处闪现", () => {
  assert.match(gameTypes, /kind: "dash" \| "jump" \| "push"/);
  assert.match(engine, /private updateAbilityMotion/);
  assert.match(engine, /private sweepGuangyiDash/);
  assert.match(engine, /motion\.hitFids\.includes/);
  ["sui_bird", "guangyi", "biscuit_sui", "youyi", "akirinco", "mumu"].forEach((unitId) => {
    const marker = `case "${unitId}":`;
    let searchFrom = 0;
    let usesMotion = false;
    while (!usesMotion) {
      const branchStart = engine.indexOf(marker, searchFrom);
      if (branchStart < 0) break;
      const nextCase = engine.indexOf("\n      case \"", branchStart + marker.length);
      const branch = engine.slice(branchStart, nextCase < 0 ? engine.length : nextCase);
      usesMotion = /startAbilityMotion/.test(branch);
      searchFrom = branchStart + marker.length;
    }
    assert.ok(usesMotion, `${unitId} 不应再直接瞬移`);
  });
  const relocationCalls = engine.match(/this\.relocateFighter\(/g) || [];
  assert.equal(relocationCalls.length, 2, "只允许冷笑话与猫拳起手保留瞬移");
});

test("头像生成圆形缓存纹理并保留精灵分支与朝向翻转", () => {
  assert.match(assets, /createCircularPortraitTextures/);
  assert.match(assets, /context\.arc/);
  assert.match(assets, /context\.clip/);
  assert.match(scene, /circularTextureKeyForUnit/);
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
  assert.match(scene, /projectile\.style === "lollipop"/);
  assert.match(scene, /projectile\.style === "aoe_orb"/);
  assert.match(scene, /effect\.kind === "line"/);
  assert.match(scene, /effect\.kind === "ring"/);
  assert.match(scene, /effect\.kind === "burst"/);
  assert.match(scene, /effect\.kind === "chronosphere"/);
  assert.match(scene, /effect\.kind === "hotpot"/);
  assert.match(scene, /mechanicalRabbitMuzzle/);
});

test("技能只保留名称提示，范围与连线效果提供范围染色和飞行脉冲", () => {
  assert.doesNotMatch(gameTypes, /kind: "cast"/);
  assert.doesNotMatch(engine, /kind: "cast"/);
  assert.doesNotMatch(scene, /effect\.kind === "cast"/);
  assert.doesNotMatch(canvasEffects, /effect\.kind === "cast"/);
  assert.match(engine, /text: def\.abilityName/);
  assert.match(scene, /const travel = Math\.min\(1, progress \* 1\.35\)/);
  assert.match(scene, /fillCircle\(0, 0, fieldRadius\)/);
  assert.match(engine, /visualEffects:/);
  assert.match(engine, /projectiles: battle\.projectiles\.map/);
});

test("贴身护盾按当前值相对峰值降低透明强度", () => {
  assert.match(engine, /shieldPeak: Math\.round\(fighter\.shieldPeak\)/);
  assert.match(scene, /fighter\.shield \/ Math\.max\(fighter\.shieldPeak, 1\)/);
  assert.match(scene, /0\.06 \+ shieldStrength \* 0\.14/);
  assert.match(scene, /0\.24 \+ shieldStrength \* 0\.66/);
  assert.match(scene, /\.setAlpha\(fighter\.shield > 0 \? 1 : 0\)/);
});

test("机械兔耳浮游炮以原版分层轮廓绘制，并与共享炮口对齐", () => {
  assert.match(scene, /drawRabbitBody\(/);
  assert.match(scene, /drawRabbitCannon\(/);
  assert.match(scene, /fillGradientStyle\(0x111a27, 0x728998, 0x3b4f60, 0x728998, 1\)/);
  assert.match(scene, /lineStyle\(1\.2, 0xb8ccd8\)/);
  assert.match(scene, /fillStyle\(0x1b2938\)/);
  assert.match(scene, /fillStyle\(0xf4f0f2\)/);
  assert.match(scene, /fillStyle\(0xefc8d1\)/);
  assert.match(scene, /lineStyle\(1\.4, 0x92d7ff\)/);
  assert.match(scene, /lineTo\(muzzleDistance, 0\)/);
  assert.match(scene, /flash\.setX\(muzzleDistance\)/);
  assert.match(scene, /1 \+ \(pet\.attackPulse \/ 0\.16\) \* 0\.75/);
  assert.match(scene, /setRotation\(-angle\)\.setY\(pet\.radius \* 0\.88 - bob\)/);
});

test("投射物按原版互斥分支绘制 Emoji、松针与光弹", () => {
  assert.match(scene, /const projectileEmoji = \(projectile: Projectile\)/);
  assert.match(scene, /if \(projectile\.emoji\) return projectile\.emoji/);
  assert.match(scene, /if \(projectile\.style === "pine_needle"\)/);
  assert.match(scene, /\* 16/);
  assert.match(scene, /drawProjectileTrail\(trail, tailX, tailY, 2\.2, projectileColor\)/);
  assert.match(scene, /if \(emoji\)/);
  assert.match(scene, /Math\.max\(12, projectile\.size\)/);
  assert.match(scene, /Math\.max\(14, projectile\.size\)/);
  assert.match(scene, /trail\.clear\(\)\.setVisible\(false\)/);
  assert.match(scene, /core\.setVisible\(false\)/);
  assert.match(scene, /setBlendMode\(Phaser\.BlendModes\.SCREEN\)/);
  assert.match(scene, /drawProjectileTrail\(trail, tailX, tailY, projectile\.size \+ 3, projectileColor\)/);
  assert.match(scene, /fillCircle\(tailX, tailY, capRadius\)\.fillCircle\(0, 0, capRadius\)/);
});

test("远端 AOE 投送弹幕以缩小范围圈和主题符号绘制", () => {
  assert.match(scene, /if \(projectile\.style === "aoe_orb"\)/);
  assert.match(scene, /strokeCircle\(0, 0, 11\)/);
  assert.match(scene, /strokeCircle\(0, 0, 6\)/);
  assert.match(canvasEffects, /if \(projectile\.style === "aoe_orb"\)/);
  assert.match(canvasEffects, /ctx\.arc\(projectile\.x, projectile\.y, 14/);
  assert.match(canvasEffects, /ctx\.arc\(projectile\.x, projectile\.y, 11/);
});

test("投射物命中使用可复用的径向渐变爆裂", () => {
  assert.match(scene, /BURST_GRADIENT_TEXTURE/);
  assert.match(scene, /createBurstGradientTexture\(\)/);
  assert.match(scene, /textures\.createCanvas\(BURST_GRADIENT_TEXTURE, 128, 128\)/);
  assert.match(scene, /context\.createRadialGradient/);
  assert.match(scene, /texture\.refresh\(\)/);
  assert.match(scene, /setName\("burstGradient"\)/);
  assert.match(scene, /effect\.kind === "burst"/);
  assert.match(scene, /\(effect\.size \|\| 40\) \* \(0\.35 \+ progress \* 0\.65\)/);
  assert.match(scene, /burstGradient[\s\S]*?\.setTint\(color\)[\s\S]*?\.setDisplaySize\(radius \* 2, radius \* 2\)[\s\S]*?\.setVisible\(true\)/);
});

test("文字、圆形头像和宿主 Canvas 根据真实视口同步高 DPI 渲染", () => {
  assert.match(layout, /MAX_RENDER_PIXELS/);
  assert.match(layout, /MAX_DEVICE_PIXEL_RATIO = 2/);
  assert.match(layout, /logicalSizeFor/);
  assert.match(layout, /renderSizeFor/);
  assert.match(layout, /uiScaleFor/);
  assert.match(layout, /MAX_UI_SCALE = 1\.25/);
  assert.match(layout, /viewportScaleFor/);
  assert.match(layout, /tooltipLayoutFor/);
  assert.match(layout, /scale: 1 \/ fitScale/);
  assert.match(layout, /TOOLTIP_TYPOGRAPHY/);
  assert.match(layout, /width: Math\.max\(1, Math\.round\(displayWidth \* density\)\)/);
  assert.match(host, /ResizeObserver/);
  assert.match(host, /scale\.setParentSize/);
  assert.match(host, /scale\.resize\(target\.width, target\.height\)/);
  assert.doesNotMatch(host, /scale\.setGameSize/);
  assert.match(host, /baseSize\.width !== target\.width/);
  assert.match(host, /RiftHud/);
  assert.match(host, /data-ui-scale/);
  assert.match(host, /transform: `scale\(\$\{uiScale\}\)`/);
  assert.match(host, /dataset\.devicePixelRatio/);
  assert.match(host, /dataset\.renderScale/);
  assert.match(host, /dataset\.layoutProfile/);
  assert.match(host, /document\.fonts\?\.load/);
  assert.match(scene, /scale\.parentSize/);
  assert.match(scene, /logicalSizeFor\(\)/);
  assert.match(scene, /setViewport/);
  assert.match(scene, /setZoom\(fitScale\)/);
  assert.match(scene, /centerOn\(logical\.width \/ 2, logical\.height \/ 2\)/);
  assert.match(scene, /positionToCamera\(this\.cameras\.main\)/);
  assert.match(scene, /Math\.min\(MAX_TEXT_RESOLUTION, 2, Math\.ceil\(devicePixelRatio\)\)/);
  assert.match(scene, /resolution: this\.textResolution/);
  assert.match(scene, /tooltipLayoutFor\(/);
  assert.match(scene, /container = this\.add\.container\(x, y\)\.setScale\(scale\)/);
  assert.match(scene, /width \* scale, height \* scale/);
  assert.match(scene, /const offset = TOOLTIP_TYPOGRAPHY\.pointerOffset \* scale/);
  assert.match(scene, /scale\.off\(Phaser\.Scale\.Events\.RESIZE, this\.handleResize, this\)/);
});

test("整备页用逻辑坐标羁绊视口、分区面板和受限文本还原 Canvas 层级", () => {
  assert.match(scene, /createGeometryMask\(\)/);
  assert.match(scene, /content\.setMask\(/);
  assert.match(scene, /traitMinimumOffset/);
  assert.match(scene, /updateTraitViewport\(\)/);
  assert.doesNotMatch(scene, /viewport\.draw\(source/);
  assert.match(scene, /PREPARATION_BOARD_PANEL/);
  assert.match(scene, /PREPARATION_BENCH_PANEL/);
  assert.match(scene, /PREPARATION_SHOP_PANEL/);
  assert.match(scene, /boundedText\(/);
  assert.match(scene, /probe\.getWrappedText\(value\)/);
  assert.match(scene, /wordWrap: \{ width: maxWidth, useAdvancedWrap: true \}/);
  assert.match(scene, /abilityTitle\.height/);
  assert.match(scene, /detailText\.height/);
  assert.match(scene, /traitX \+ tagWidth > contentWidth/);
  assert.match(scene, /TOOLTIP_TYPOGRAPHY/);
  assert.match(scene, /const \{ padding, title, body/);
  assert.match(scene, /boundedText\(trait\.description/);
  assert.match(scene, /const inset = TOOLTIP_TYPOGRAPHY\.edgeInset \* scale/);
  assert.match(scene, /const xMin = Math\.min\(inset, Math\.max\(0, WORLD_WIDTH - width\)\)/);
  assert.match(scene, /const yMax = Math\.max\(yMin, WORLD_HEIGHT - height - inset\)/);
  assert.match(scene, /truncateText\(/);
  assert.match(scene, /occupiedSlotLayout/);
  assert.match(scene, /"★"\.repeat\(unit\.star\)/);
  assert.match(scene, /const starColor = unit\.star === 3/);
  assert.match(scene, /showUnitTooltip\(unit\.id, pointer, unit\.star, undefined, unit\)/);
  assert.match(scene, /getPlayerCombatStats\(owned\)/);
  assert.match(scene, /部署生命 \$\{Math\.round\(combatStats\.maxHp\)\}/);
  assert.match(scene, /def\.traits\.forEach/);
  assert.match(scene, /getTraitStatus\(traitId\)/);
  assert.doesNotMatch(scene, /const labelBackplate = this\.add\.graphics\(\)/);
  assert.doesNotMatch(scene, /const traitDots =/);
  assert.match(layout, /WIDE_TRAIT_STRIP/);
  assert.match(layout, /COMPACT_TRAIT_STRIP = \{ x: 48, y: 194/);
  assert.match(layout, /portraitY/);
  assert.match(layout, /starY/);
  assert.match(layout, /nameY/);
  assert.match(scene, /POINTER_MOVE, \(pointer: Phaser\.Input\.Pointer\) => \{\n      if \(!this\.traitDrag\?\.moved\) this\.updateTraitTooltip\(pointer\);/);
});

test("标题页复用响应式布局、主题协议卡与缓存氛围光", () => {
  assert.match(scene, /titleLayoutFor\(this\.profile\)/);
  assert.match(layout, /WIDE_TITLE_LAYOUT/);
  assert.match(layout, /COMPACT_TITLE_LAYOUT/);
  assert.match(layout, /starterCardRect/);
  assert.match(scene, /this\.boundedText\(starter\.description, layout\.descriptionWidth, 2/);
  assert.match(scene, /fillGradientStyle\(TITLE\.cardTop, TITLE\.cardTop, TITLE\.cardBottom, TITLE\.cardBottom/);
  assert.match(scene, /fillRoundedRect\(0, 0, layout\.cardWidth, layout\.cardHeight, 20\)/);
  assert.match(scene, /createTitleGlowTexture\(\)/);
  assert.match(scene, /TITLE_GLOW_TEXTURE/);
  assert.match(scene, /this\.tweens\.add/);
  assert.match(scene, /轻量构筑 · 自动战斗 · 一局约 8 分钟/);
  assert.match(scene, /选择一项开局协议/);
  assert.match(scene, /操作：点击购买与移动 · 右键快速回收 · R 刷新 · Space 开战 · F 全屏/);
  assert.match(theme, /export const TITLE/);
  assert.match(theme, /cardTop/);
  assert.match(theme, /ctaHoverText/);
});

test("Phaser UI 恢复整卡选择、羁绊暗态、垂直裂隙与拖拽跟手", () => {
  assert.match(scene, /点击接入并开始/);
  assert.match(scene, /type: "starter", id/);
  assert.match(scene, /type: "augment", index/);
  assert.match(scene, /if \(this\.phase === "result"\)/);
  assert.match(scene, /this\.drawResult\(\)/);
  assert.match(scene, /if \(this\.phase === "augment"\) this\.drawAugments\(\)/);
  assert.doesNotMatch(bridge, /onTooltip|DomTooltip/);
  assert.match(scene, /layout\.cardWidth \/ 2, layout\.cardHeight \/ 2, layout\.cardWidth, layout\.cardHeight/);
  assert.match(scene, /enabled: canBattle/);
  assert.match(scene, /enabled: this\.canReroll\(\)/);
  assert.match(scene, /traitOffset/);
  assert.doesNotMatch(scene, /filter\(\(\[, count\]\) => count > 0\)\.slice/);
  assert.match(scene, /0x142735/);
  assert.match(scene, /lineBetween\(560, 104, 560, 680\)/);
  assert.doesNotMatch(scene, /field\.fillGradientStyle/);
  assert.match(scene, /createDragGhost/);
  assert.match(scene, /handlePointerMove/);
  assert.match(scene, /POINTER_UP_OUTSIDE/);
  assert.match(scene, /type: "move", from: drag\.origin, to: target/);
  assert.match(scene, /drawResultRow/);
  assert.match(scene, /\+\$\{result\.income\} 金币/);
});

test("场上满员时 Phaser 与 DOM 商店仍预测待激活羁绊", () => {
  const phaserPrediction = scene.match(/private traitActivatesAfterPurchase[\s\S]*?\n  }\n\n  private createShopTraitTags/)?.[0];
  const domPrediction = hud.match(/const traitTags = def\.traits\.map[\s\S]*?return \{ id, trait, status, willActivate \};\n  \}\);/)?.[0];
  assert.ok(phaserPrediction);
  assert.ok(domPrediction);
  assert.doesNotMatch(phaserPrediction, /boardCount|boardCap/);
  assert.doesNotMatch(domPrediction, /boardCount|boardCap/);
  assert.match(phaserPrediction, /status\.count \+ 1 >= threshold/);
  assert.match(domPrediction, /status\.count \+ 1 >= nextThreshold/);
  assert.match(phaserPrediction, /!engine\.state\.board\.some/);
  assert.match(domPrediction, /!engine\.state\.board\.some/);
});

test("战斗统计和结算层保留稳定交互、模态拦截与阵容提示", () => {
  assert.match(scene, /buildBattleOverlay/);
  assert.match(scene, /rankingStateKey/);
  assert.doesNotMatch(scene, /private syncBattleOverlay\(\)[\s\S]*buttonViews\.forEach/);
  assert.match(scene, /createInputBlocker/);
  assert.match(scene, /showUnitTooltip\(fighter\.unitId, pointer, fighter\.star, fighter\)/);
  assert.match(scene, /damageTaken/);
  assert.match(scene, /resultContinueLabel/);
  assert.match(scene, /继续 · 进入整备/);
  assert.match(scene, /DEPTH\.overlay \+ 3/);
  assert.match(scene, /this\.overlayLayer\.add\(\[graphics, label, zone\]\)/);
  assert.match(scene, /this\.overlayLayer\.add\(zone\)/);
});

test("结算报告约束摘要文本、保留八人阵容并适配紧凑布局", () => {
  assert.match(theme, /Noto Sans CJK SC/);
  assert.match(theme, /resultReward: "#ffd166"/);
  assert.match(scene, /truncateText\(result\.headline, 920/);
  assert.match(scene, /boundedText\(result\.detail, 860, 2/);
  assert.match(scene, /drawResultMetricTab/);
  assert.match(scene, /this\.isCompact\(\) \? COMPACT_RESULT_LAYOUT : WIDE_RESULT_LAYOUT/);
  assert.match(scene, /const rowCount = Math\.max\(playerRows\.length, enemyRows\.length\)/);
  assert.doesNotMatch(scene, /getBattleRanking\(team\)\.slice\(0, 6\)/);
  assert.match(layout, /WIDE_RESULT_LAYOUT/);
  assert.match(layout, /COMPACT_RESULT_LAYOUT/);
});

test("Phaser 备战信息恢复商店概率、激活羁绊、敌情和快捷回收", () => {
  assert.match(scene, /tierOddsForLevel/);
  assert.match(scene, /距 \$\{bookLevelForPlayerLevel/);
  assert.match(scene, /getActiveTraits\(\)/);
  assert.match(scene, /currentWave\.units/);
  assert.match(scene, /currentWave\.tag === "elite"/);
  assert.match(scene, /rightButtonDown\(\)/);
  assert.match(scene, /preventContextMenu/);
  assert.match(scene, /回收 \+\$\{refund\}/);
});

test("经济信息只在商店出现，并提供利息规则与清晰的备战价值", () => {
  assert.doesNotMatch(hud, /rift-header-gold/);
  assert.match(hud, /function InterestInfo/);
  assert.match(hud, /每 5 金币提供 1 利息/);
  assert.match(hud, /理财Ⅱ：每 4 金币提供 1 利息/);
  assert.match(hud, /rift-bench-value/);
  assert.match(engine, /public getUnitSellValue/);
  assert.match(scene, /getUnitSellValue\(unit\)/);
  assert.match(scene, /const priceLabel = `\$\{def\.cost\} 费`/);
  assert.match(scene, /priceBackplate/);
});

test("场景预加载单位头像并保留缺图降级纹理", () => {
  assert.match(assets, /Object\.values\(UNIT_DEFS\)/);
  assert.match(assets, /scene\.load\.image/);
  assert.match(assets, /rift-fallback-unit/);
  assert.match(scene, /textureKeyForUnit/);
  assert.match(scene, /this\.textures\.exists\(key\)/);
});

test("React 宿主默认填满网页视口并保留工具栏与安全区支撑", () => {
  assert.match(host, /width: fullscreen \? "100vw" : "100%"/);
  assert.match(host, /height: fullscreen \? "100dvh" : "100%"/);
  assert.match(host, /flex: "1 1 auto"/);
  assert.doesNotMatch(host, /min\(\$\{WORLD_WIDTH\}px/);
  assert.doesNotMatch(host, /aspectRatio:/);
  assert.match(host, /Codex/);
  assert.match(host, /AutoChessAudio/);
  assert.match(host, /全屏游玩/);
  assert.match(host, /safe-area-inset-bottom/);
  assert.match(host, /aria-live="polite"/);
});
