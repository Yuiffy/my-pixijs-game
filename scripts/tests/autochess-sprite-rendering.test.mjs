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
