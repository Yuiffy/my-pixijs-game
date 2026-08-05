import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { EngineBridge } = await loadTypescriptModule(
  "src/components/autoChessGame/phaser/EngineBridge.ts",
);
const { AutoChessAIController } = await loadTypescriptModule(
  "src/components/autoChessGame/ai/AutoChessAI.ts",
);
const hostSource = await readFile("src/components/autoChessGame/PhaserGame.tsx", "utf8");

test("AI 控制台对象覆盖完整流程并使用 1 起始槽位", () => {
  const bridge = new EngineBridge(90210);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  const ai = new AutoChessAIController(bridge);

  assert.equal(ai.version, "0.2.0");
  assert.match(ai.help().indexing, /1-based/);
  assert.equal(ai.starter(1).ok, true);
  assert.equal(bridge.engine.state.phase, "preparation");
  assert.ok(bridge.engine.state.board.some(Boolean));
  assert.equal(ai.select("board", 1).ok, true);
  assert.equal(ai.move("board", 1, "bench", 1).ok, true);
  assert.equal(ai.move("bench", 1, "board", 1).ok, true);
  assert.equal(ai.buy(0).ok, false);
  assert.equal(ai.move("board", 25, "bench", 1).ok, false);
  assert.equal(ai.battle().ok, true);
  assert.equal(bridge.engine.state.phase, "battle");
  const skipped = ai.skipBattle();
  assert.equal(skipped.skipped, true);
  assert.equal(bridge.engine.state.phase, "result");
  assert.ok(ai.logs().some((event) => event.type === "battle"));
  assert.equal(JSON.parse(bridge.engine.renderTextState()).version, "0.2.0");
});

test("战斗日志记录目标、施法、投射物命中方向与伤害", () => {
  const bridge = new EngineBridge(7711);
  bridge.setConsoleLogging(false);
  bridge.engine.state.starterChoices = ["bastion", "blaze", "mature_start"];
  bridge.engine.startRun("bastion");
  bridge.engine.startBattle();
  const battle = bridge.engine.state.battle;
  assert.ok(battle);
  const source = battle.player[0];
  const target = battle.enemy[0];
  source.x = target.x - 110;
  source.y = target.y;
  source.targetFid = target.fid;
  bridge.engine.update(1 / 60);
  bridge.engine.castAbility(source, battle.enemy, true);
  bridge.engine.fireFixedProjectile(source, target, {
    sourceFid: source.fid,
    targetFid: target.fid,
    delay: 0,
    damage: 17,
    damageKind: "ability",
    burnPower: 0,
    speed: 900,
    color: "#ffffff",
    size: 6,
    style: "carrot",
  });
  for (let step = 0; step < 20 && battle.projectiles.length; step += 1) {
    bridge.engine.update(1 / 60);
  }

  assert.ok(battle.eventLog.some((event) => event.type === "target" && event.direction));
  assert.ok(battle.eventLog.some((event) => event.type === "ability" && event.ability));
  const hit = battle.eventLog.find((event) => event.type === "projectile" && event.projectile === "carrot");
  assert.ok(hit);
  assert.equal(hit.damageKind, "ability");
  assert.ok(hit.amount > 0);
  assert.ok(Number.isFinite(hit.impact.x) && Number.isFinite(hit.impact.y));
  assert.match(hit.message, /命中.*造成/);
  const textState = JSON.parse(bridge.engine.renderTextState());
  assert.ok(textState.battle.log.some((event) => event.id === hit.id));
});

test("宿主公开 AI API、阶段快捷键和快速结算键", () => {
  assert.match(hostSource, /window\.autoChessAI = ai/);
  assert.match(hostSource, /delete window\.autoChessAI/);
  assert.match(hostSource, /state\.phase === "title" && number >= 1/);
  assert.match(hostSource, /state\.phase === "preparation" && key === "r"/);
  assert.match(hostSource, /state\.phase === "preparation" && key === "l"/);
  assert.match(hostSource, /state\.phase === "preparation" && key === "u"/);
  assert.match(hostSource, /state\.phase === "battle" && key === "s"/);
  assert.match(hostSource, /state\.phase === "result" && event\.key === "Enter"/);
  assert.match(hostSource, /state\.phase === "gameover" && event\.key === "Enter"/);
});
