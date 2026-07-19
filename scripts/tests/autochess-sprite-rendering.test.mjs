import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const renderer = await readFile(
  new URL("../../src/components/autoChessGame/PhaserGame.tsx", import.meta.url),
  "utf8",
);

test("精灵头像在战斗中支持朝向镜像且不再绘制方框", () => {
  assert.match(renderer, /mirrorSpriteX = false/);
  assert.match(renderer, /ctx\.scale\(-1, 1\)/);
  assert.match(renderer, /fighter\.facingX < 0/);
  assert.doesNotMatch(renderer, /drawSpriteCornerMarks/);
  assert.doesNotMatch(renderer, /strokeRect\(x - radius, y - radius, radius \* 2, radius \* 2\)/);
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
  assert.match(shopTags[0], /ctx\.shadowBlur = 10/);
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
