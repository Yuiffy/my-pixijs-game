import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [renderer, effects, primitives] = await Promise.all([
  readFile(new URL("../../src/components/autoChessGame/PhaserGame.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/canvas/effects.ts", import.meta.url), "utf8"),
  readFile(new URL("../../src/components/autoChessGame/canvas/primitives.ts", import.meta.url), "utf8"),
]);

test("精灵头像在战斗中支持朝向镜像且不再绘制方框", () => {
  assert.match(renderer, /mirrorSpriteX = false/);
  assert.match(renderer, /ctx\.scale\(-1, 1\)/);
  assert.match(renderer, /fighter\.facingX < 0/);
  assert.doesNotMatch(renderer, /drawSpriteCornerMarks/);
  assert.doesNotMatch(renderer, /strokeRect\(x - radius, y - radius, radius \* 2, radius \* 2\)/);
});

test("战斗技能条使用棋子上限并展示能量身份", () => {
  assert.match(renderer, /fighter\.energy \/ fighter\.maxEnergy/);
  assert.match(renderer, /ENERGY_PROFILES\[fighter\.energyStyle\]\.color/);
  assert.match(renderer, /describeEnergyRecovery\(profile\)/);
  assert.match(renderer, /attackType === "ranged" \? "远程" : "近战"/);
});

test("单位提示会完整换行能量说明并动态扩展高度", () => {
  const tooltip = renderer.match(/const drawTooltip = \([\s\S]*?\n};/);
  assert.ok(tooltip);
  assert.match(tooltip[0], /const energyLines = wrapText\(ctx, energyText, textWidth\)/);
  assert.match(tooltip[0], /energyLines\.forEach/);
  assert.doesNotMatch(tooltip[0], /truncateText\(\s*ctx,\s*energyText/);
  assert.match(tooltip[0], /const traitY = abilityDescriptionY \+ abilityLines\.length \* abilityLineHeight \+ 19/);
  assert.match(tooltip[0], /const h = Math\.max\(fighter \? 252 : 222, traitY \+ 34\)/);
  assert.match(tooltip[0], /HEIGHT - h - 12/);
});

test("弹道特效同时绘制柔光外层与明亮核心", () => {
  const drawEffects = effects.match(/export const drawEffects = \([\s\S]*?\n};/);
  assert.ok(drawEffects);
  assert.match(drawEffects[0], /ctx\.globalCompositeOperation = "screen"/);
  assert.match(drawEffects[0], /ctx\.lineWidth = width \+ 4/);
  assert.match(drawEffects[0], /rgba\(244, 251, 255, 0\.96\)/);
  assert.match(drawEffects[0], /setShadow\(ctx, effect\.color, 18\)/);
  assert.match(effects, /ctx\.shadowBlur = blur/);
});

test("实体子弹按实时位置和速度绘制尾迹", () => {
  const drawProjectiles = effects.match(/export const drawProjectiles = \([\s\S]*?\n};/);
  assert.ok(drawProjectiles);
  assert.match(drawProjectiles[0], /battle\.projectiles\.forEach/);
  assert.match(drawProjectiles[0], /projectile\.velocityX/);
  assert.match(drawProjectiles[0], /trailLength/);
  assert.match(renderer, /drawProjectiles\(ctx, state\)/);
});

test("机械兔耳宠物在子弹和特效前使用独立绘制路径", () => {
  const drawPets = effects.match(/export const drawMechanicalRabbitPets = \([\s\S]*?\n};/);
  assert.ok(drawPets);
  assert.match(drawPets[0], /battle\.pets\.forEach/);
  const drawPet = effects.match(/const drawMechanicalRabbitPet = \([\s\S]*?\n};/);
  assert.ok(drawPet);
  assert.match(drawPet[0], /mechanicalRabbitMuzzle\(pet\)/);
  assert.match(drawPet[0], /Math\.atan2\(pet\.aimY, pet\.aimX\)/);
  assert.match(drawPet[0], /ctx\.rotate\(aimAngle\)/);
  assert.match(drawPet[0], /pet\.attackPulse/);
  assert.match(drawPet[0], /cannonTipX/);
  assert.doesNotMatch(drawPet[0], /\[-1, 1\]\.forEach/);
  assert.match(renderer, /drawMechanicalRabbitPets\(ctx, state\);\s*drawPineTreeTurrets\(ctx, state\);\s*drawProjectiles\(ctx, state\);/);
});

test("结算页使用显式继续按钮推进阶段", () => {
  assert.match(renderer, /resultContinueRect/);
  assert.match(renderer, /resultContinueLabel/);
  assert.match(renderer, /target\.kind === "resultContinue"\) engine\.continueAfterResult\(\)/);
  assert.match(renderer, /getBattleRanking\("enemy"\)/);
});

test("羁绊提示会按内容自动换行并动态调整高度", () => {
  const traitTooltip = renderer.match(/const drawTraitTooltip = \([\s\S]*?\n};/);
  assert.ok(traitTooltip);
  assert.match(traitTooltip[0], /const descriptionLines = wrapText\(ctx, trait\.description, w - 40\)/);
  assert.match(traitTooltip[0], /const lines = wrapText\(ctx, `\$\{threshold\} 名：\$\{trait\.bonuses\[index\]\}`, w - 62\)/);
  assert.match(traitTooltip[0], /const h = Math\.max\(174, contentY \+ 10\)/);
  assert.match(traitTooltip[0], /row\.lines\.forEach/);
  assert.doesNotMatch(traitTooltip[0], /const h = 174/);
  assert.doesNotMatch(traitTooltip[0], /index \* 22/);
});

test("商店以可读羁绊标签、定位和单一费用呈现棋子", () => {
  const shopTags = renderer.match(/const drawShopTraitTags = \([\s\S]*?\n};/);
  assert.ok(shopTags);
  assert.match(shopTags[0], /traitActivationAfterPurchase/);
  assert.match(shopTags[0], /setCanvasShadow\(ctx, trait\.color, 10\)/);
  assert.match(shopTags[0], /trait\.name/);
  assert.match(renderer, /shopRole\(unitId\)/);
  assert.match(renderer, /drawShopTraitTags\(ctx, engine, unitId, rect, affordable\)/);
  assert.doesNotMatch(renderer, /`\$\{def\.tier\}费`/);
});

test("备战阶段可用滚轮横向浏览溢出的羁绊栏", () => {
  const wheelHandler = renderer.match(/const onWheel = \([\s\S]*?\n  };/);
  assert.ok(wheelHandler);
  assert.match(wheelHandler[0], /inRect\(point\.x, point\.y, TRAIT_STRIP\)/);
  assert.match(wheelHandler[0], /event\.preventDefault\(\)/);
  assert.match(wheelHandler[0], /traitScrollXRef\.current/);
  assert.match(renderer, /onWheel=\{onWheel\}/);
});

test("连续输入请求下一帧绘制而静态阶段不持续重绘", () => {
  assert.match(renderer, /const onPointerMove = \(/);
  assert.match(renderer, /const onWheel = \(/);
  assert.match(renderer, /requestDrawRef\.current\(\)/);
  assert.match(renderer, /const loop = \(timestamp: number\) => \{/);
  assert.match(renderer, /engine\.state\.phase === "battle"/);
  assert.match(renderer, /shouldKeepLooping/);
  assert.match(renderer, /if \(drawRequested\)/);
  assert.match(renderer, /window\.advanceTime = \(milliseconds: number\) => \{/);
});

test("受限 Canvas 文本会按宽度换行或省略", () => {
  assert.match(primitives, /export const truncateText = \(/);
  assert.match(primitives, /export const boundedTextLines = \(/);
  assert.match(primitives, /export const drawBoundedText = \(/);
  assert.match(primitives, /truncateText\(ctx, lines\.slice\(maxLines - 1\)\.join\(""\), maxWidth\)/);
});

test("开局与契印卡说明限制在按钮上方的两行区域", () => {
  const drawTitle = renderer.match(/const drawTitle = \([\s\S]*?\n};/);
  const drawAugments = renderer.match(/const drawAugments = \([\s\S]*?\n};/);
  assert.ok(drawTitle);
  assert.ok(drawAugments);
  assert.match(drawTitle[0], /drawBoundedText\([\s\S]*?starter\.description[\s\S]*?2,/);
  assert.doesNotMatch(drawTitle[0], /starter\.description\.split\("；"\)/);
  assert.match(drawAugments[0], /drawBoundedText\([\s\S]*?augment\.description[\s\S]*?2,/);
  assert.match(drawAugments[0], /selectionHistory[\s\S]*?drawBoundedText/);
});

test("运行时提示和固定宽度行不会越界", () => {
  assert.match(renderer, /const toastLines = boundedTextLines\(ctx, state\.toast\.text, 600, 2\)/);
  assert.match(renderer, /const height = toastLines\.length === 2 \? 56 : 38/);
  assert.match(renderer, /truncateText\(ctx, def\.name, 136\)/);
  assert.match(renderer, /truncateText\(ctx, `\$\{definition\.name\}\$\{"★"\.repeat\(fighter\.star\)\}`, 118\)/);
  assert.match(renderer, /truncateText\(ctx, traitNames, textWidth\)/);
});
