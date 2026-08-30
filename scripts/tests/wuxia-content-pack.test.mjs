import assert from "node:assert/strict";
import test from "node:test";

import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const campaignModule = await loadTypescriptModule("src/components/wuxia/game/wuxiaCampaign.ts");
const exampleModule = await loadTypescriptModule("src/components/wuxia/game/exampleContentPack.ts");

const {
  agendaDefinitionsForOrigin,
  createWuxiaContentRegistry,
  instantiateWorldOpportunities,
  refreshOpportunityStatuses,
} = campaignModule;
const { EXAMPLE_RIVER_LANTERN_PACK } = exampleModule;

test("示例内容包可扩展路线、人物、机会和规则", () => {
  const registry = createWuxiaContentRegistry([EXAMPLE_RIVER_LANTERN_PACK]);
  const opportunities = instantiateWorldOpportunities(registry, 731, ["actor_a", "actor_b"]);

  assert.deepEqual(registry.packs.map((pack) => pack.id), ["core.campaign", "example.river-lanterns"]);
  assert.ok(agendaDefinitionsForOrigin(registry, "wanderer").some((agenda) => agenda.id === "example.river-letters"));
  assert.ok(opportunities.some((opportunity) => opportunity.templateId === "example_lantern_fair"));
  assert.ok(registry.characters.some((character) => character.id === "example_luo_zhen"));
  assert.ok(registry.locations.some((location) => location.id === "example_river_lantern_pier"));
  assert.ok(opportunities.some((opportunity) => opportunity.templateId === "example_lantern_fair" && opportunity.locationId === "example_river_lantern_pier"));
  assert.equal(registry.rules.maxVisibleActivities, 10);
  assert.equal(registry.rules.inventTechnique.martialInsights, 2);
  assert.equal(registry.rules.foundSect.followers, 1);
});

test("内容包 ID 冲突会在创建世界前失败", () => {
  assert.throws(() => createWuxiaContentRegistry([
    EXAMPLE_RIVER_LANTERN_PACK,
    { ...EXAMPLE_RIVER_LANTERN_PACK, version: "1.0.1" },
  ]), /重复 id/);
});

test("机会状态刷新不会让已参加的盛会重新开放", () => {
  const registry = createWuxiaContentRegistry();
  const opportunity = instantiateWorldOpportunities(registry, 191, ["actor_a"])[0];
  const attended = { ...opportunity, status: "attended" };
  assert.equal(refreshOpportunityStatuses([attended], attended.endDay + 20)[0].status, "attended");
});
