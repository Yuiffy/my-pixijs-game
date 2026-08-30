import assert from "node:assert/strict";
import test from "node:test";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const { createWuxiaWorld } = await loadTypescriptModule(
  "src/components/wuxia/legacy/game/world.ts",
);
const {
  applySnippetWorldResult,
  mergeSnippetNpcs,
} = await loadTypescriptModule(
  "src/components/wuxia/legacy/game/applySnippetResult.ts",
);
const { SNIPPETS } = await loadTypescriptModule(
  "src/components/wuxia/legacy/snippets/index.ts",
);
const { StoryStage } = await loadTypescriptModule(
  "src/components/wuxia/legacy/logic/types.ts",
);

const snippet = (id) => {
  const found = SNIPPETS.find((entry) => entry.id === id);
  assert.ok(found, `旧版缺少事件 ${id}`);
  return found;
};

const withFixedRandom = (value, run) => {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
};

test("改版前测试版保留结伴、同行助战和明确结局", () => {
  let { world } = withFixedRandom(0.11, () => createWuxiaWorld());
  const wild = world.locations.find((location) => location.type === "wild");
  assert.ok(wild, "旧版世界没有野外地点");

  world = {
    ...world,
    npcs: world.npcs.map((npc) => (
      npc.id === world.heroId ? { ...npc, locationId: wild.id } : npc
    )),
  };
  let hero = world.npcs.find((npc) => npc.id === world.heroId);
  assert.ok(hero, "旧版世界没有主角");

  const meeting = withFixedRandom(0.11, () => snippet("wild_meet_wanderer").run(hero, world));
  const travelTogether = meeting.choices?.find((choice) => choice.text === "同意结伴");
  assert.ok(travelTogether, "旧版偶遇没有结伴选项");

  world = mergeSnippetNpcs(world, travelTogether.result);
  world = applySnippetWorldResult(world, travelTogether.result).world;
  assert.equal(world.party.length, 1, "同行者没有加入旧版队伍");
  const companion = world.npcs.find((npc) => npc.id === world.party[0]);
  assert.ok(companion, "加入队伍的同行者不在世界人物中");
  assert.match(
    travelTogether.result.lines.map((line) => line.text).join("\n"),
    /一起踏上了旅程/,
  );

  hero = world.npcs.find((npc) => npc.id === world.heroId);
  const bandits = withFixedRandom(0.11, () => snippet("travel_bandits_advanced").run(hero, world));
  const fight = bandits.choices?.find((choice) => choice.text === "动手！");
  assert.ok(fight, "旧版山贼事件没有战斗选项");
  const battleText = fight.result.lines.map((line) => line.text).join("\n");
  assert.match(battleText, new RegExp(companion.name), "山贼战没有写出同行者");
  assert.match(battleText, /我也来帮忙|并肩而立|一起上/, "同行者没有进入山贼战");
  assert.match(battleText, /夹击敌人|在一旁喊道/, "同行者没有实际行动");

  const city = world.locations.find((location) => location.type === "city");
  assert.ok(city, "旧版世界没有决战城市");
  world = {
    ...world,
    stage: StoryStage.CLIMAX,
    npcs: world.npcs.map((npc) => (
      npc.id === world.heroId
        ? {
          ...npc,
          locationId: city.id,
          flags: { ...npc.flags, ready_for_final: true },
        }
        : npc
    )),
  };
  hero = world.npcs.find((npc) => npc.id === world.heroId);
  const finale = withFixedRandom(0.11, () => snippet("final_battle_start").run(hero, world));
  const decisiveMove = finale.choices?.find((choice) => choice.text.startsWith("使出绝学"));
  assert.ok(decisiveMove, "旧版决战没有绝学选项");
  const finish = decisiveMove.result.choices?.find((choice) => choice.text === "继续")?.result;
  assert.ok(finish?.endGame, "旧版决战没有结束整卷");
  assert.equal(finish.advanceStage, true);
  assert.match(finish.lines.map((line) => line.text).join("\n"), /《完》/);
});
