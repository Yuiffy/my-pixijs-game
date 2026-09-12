import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { aiPilot } from './helpers/mini-games-pilots.mjs';
const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const content = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
const { readGameSave } = await loadTypescriptModule('src/components/miniGames/save.ts');
const fresh = id => ai.createAi(2026, content.aiCompany(id).style, id);
const skipEvent = s => ({ ...s, industry: { ...s.industry, eventResolved: true } });

test('all eleven companies have source-grounded identities, distinct specialties and playable AGI paths', () => {
  assert.equal(content.AI_COMPANIES.length, 11);
  assert.equal(new Set(content.AI_COMPANIES.map(c => c.specialty)).size, 11);
  for (const c of content.AI_COMPANIES) {
    assert.ok(c.sourceIds.every(id => content.AI_SOURCES[id]?.url.startsWith('https://')));
    assert.ok(content.AI_INDUSTRY_EVENTS.some(e => e.company === c.id));
    let s = fresh(c.id); const before = structuredClone(s); s = ai.actAi(s, 'special');
    assert.notDeepEqual(s.industry, before.industry, c.id);
    assert.equal(ai.actAi(s, 'special'), s);
    for (const seed of [42, 2026]) {
      const end = aiPilot(seed, c.style, 'shared', [], c.id);
      assert.equal(end.ending?.title, '共同富裕', `${c.id}/${seed}: ${JSON.stringify(end)}`);
      assert.deepEqual(readGameSave(JSON.stringify(end), 'agi'), end);
    }
  }
});
test('event choices are one-shot, cannot overspend, persist and rotate without immediate repeats', () => {
  let s = fresh('deepseek'); assert.equal(ai.endAiTurn(s), s);
  const costly = content.industryEvent(s.industry.eventId).choices[0];
  const poor = { ...s, cash: 0 }; assert.equal(ai.decideAiEvent(poor, costly.id), poor);
  s = ai.decideAiEvent(s, costly.id); const after = structuredClone(s);
  assert.equal(ai.decideAiEvent(s, costly.id), s);
  assert.deepEqual(readGameSave(JSON.stringify(s), 'agi'), after);
  s = ai.endAiTurn(s); assert.notEqual(s.industry.eventId, after.industry.eventId); assert.equal(s.industry.eventResolved, false);
  const broke = fresh('openai'); broke.cash = 0; broke.funding = 3; broke.actions = 0;
  const deferred = ai.decideAiEvent(broke, 'defer');
  assert.equal(deferred.industry.eventResolved, true);
  assert.equal(ai.endAiTurn(deferred).ending.title, '现金流断裂', 'Zero-cash event cannot trap the game before settlement');
});
test('consumer service competes with training while keeping the research-first web service open', () => {
  const base = fresh('deepseek'); base.product = 40;
  const research = ai.setAiOperating(base, { service: 'research' });
  const consumer = ai.setAiOperating(base, { service: 'consumer' });
  assert.ok(ai.aiTrainGain(research) > ai.aiTrainGain(consumer));
  assert.ok(ai.aiIncome(consumer) > ai.aiIncome(research));
  assert.ok(ai.aiIncome(research) > 0);
  assert.ok(ai.aiUpkeep(research) < ai.aiUpkeep(consumer));
  const trained = ai.actAi(research, 'train');
  assert.equal(ai.setAiOperating(trained, { service: 'consumer' }).industry.service, 'research', 'Cannot train with research bonus then switch to consumer revenue in the same quarter');
});
test('post-training improves delivery on the same product base, with a stronger GLM-style effect', () => {
  const a = fresh('zai'); a.product = 50; a.capability = 50; a.industry.reliability = 35;
  const b = fresh('openai'); b.product = 50; b.capability = 50; b.industry.reliability = 35;
  const improved = ai.actAi(a, 'posttrain');
  assert.equal(improved.product, a.product); assert.ok(improved.industry.reliability > ai.actAi(b, 'posttrain').industry.reliability);
  assert.ok(ai.aiIncome(improved) > ai.aiIncome(a));
  const flashy = skipEvent(a); flashy.industry.hype = 95;
  const honest = skipEvent(a); honest.industry.hype = 10;
  const failed = ai.endAiTurn(flashy), stable = ai.endAiTurn(honest);
  assert.ok(failed.cash < stable.cash); assert.ok(failed.community <= stable.community); assert.ok(failed.reputation < stable.reputation);
  assert.ok(ai.aiValuation(flashy) > ai.aiValuation(honest));
  assert.ok(ai.actAi(flashy, 'fund').cash > ai.actAi(honest, 'fund').cash);
});
test('quota resets boost community and revenue for one quarter and incur the advertised cost', () => {
  let s = fresh('openai'); s.product = 40;
  const before = structuredClone(s); s = ai.actAi(s, 'special');
  assert.equal(before.cash - s.cash, 16); assert.equal(s.community - before.community, 22);
  assert.ok(ai.aiIncome(s) > ai.aiIncome(before)); assert.equal(s.industry.promotion, true);
  s = ai.endAiTurn(skipEvent(s)); assert.equal(s.industry.promotion, false);
});
test('creative video earns money and opening weights actually helps the ecosystem and rivals', () => {
  let s = fresh('minimax'); s = ai.actAi(s, 'special'); s = ai.actAi(s, 'video');
  assert.equal(s.industry.video, 58); assert.equal(s.product, 0); assert.ok(ai.aiIncome(s) > 0);
  const closed = ai.endAiTurn(skipEvent(s));
  s = ai.actAi(s, 'openvideo'); const opened = ai.endAiTurn(skipEvent(s));
  assert.equal(s.industry.videoOpen, true); assert.ok(opened.industry.ecosystem > closed.industry.ecosystem);
  assert.ok(opened.rivals.find(r => r.company === 'xai').video > closed.rivals.find(r => r.company === 'xai').video);
});
test('spicy creative traffic has a finite, two-quarter moderation cost', () => {
  let s = ai.actAi(fresh('xai'), 'special'); assert.equal(s.industry.scrutiny, 2);
  assert.equal(ai.aiUpkeep(s) - ai.aiUpkeep({ ...s, industry: { ...s.industry, scrutiny: 0 } }), 6);
  s = ai.endAiTurn(skipEvent(s)); assert.equal(s.industry.scrutiny, 1);
  s = ai.endAiTurn(skipEvent(s)); assert.equal(s.industry.scrutiny, 0);
});
test('routing borrows service capability; licensed samples must be learned before becoming owned capability', () => {
  let s = fresh('router'); const teacher = s.rivals.find(r => r.company === 'qwen'); teacher.product = 70; teacher.capability = 70;
  const original = s.capability;
  s = ai.setAiOperating(s, { route: true });
  assert.equal(ai.aiEffectiveProduct(s), 70); assert.equal(s.capability, original);
  let noData = ai.endAiTurn(skipEvent(s)); assert.equal(noData.industry.samples, 0);
  assert.equal(noData.capability, original);
  s = ai.setAiOperating(s, { licensedData: true }); s = ai.endAiTurn(skipEvent(s));
  assert.equal(s.industry.samples, 8); assert.equal(s.capability, original);
  s = ai.actAi(s, 'learn'); assert.equal(s.capability, original + 6); assert.equal(s.industry.samples, 0);
  assert.match(ai.aiBlocked({ ...s, used: [] }, 'learn'), /8/);
  s.industry.route = true; s.rivals.find(r => r.company === 'qwen').product = 100; s.compute = 5;
  assert.ok(ai.aiBlocked(s, 'agi'), 'A routed AGI is not your AGI');
});
test('anti-distillation and restrictive access block data export and eventually upstream calls', () => {
  let s = fresh('router'); const teacher = s.rivals.find(r => r.company === 'anthropic'); teacher.product = 70;
  s = ai.setAiOperating(s, { teacher: 'anthropic', route: true, licensedData: true });
  assert.equal(s.industry.route, true); assert.equal(s.industry.licensedData, false);
  s.rivals.find(r => r.company === 'anthropic').defense = 4;
  assert.ok(ai.aiTeacherBlock(s)); s = ai.endAiTurn(skipEvent(s)); assert.equal(s.industry.route, false);
  const open = fresh('openai'); open.product = 90;
  const shielded = structuredClone(open); shielded.industry.defense = 5;
  const a = ai.endAiTurn(skipEvent(open)), b = ai.endAiTurn(skipEvent(shielded));
  assert.ok(a.rivals.some((r, i) => r.capability > b.rivals[i].capability));
});
test('each rival grows along its identity and records real, divergent behavior', () => {
  let s = fresh('router'); s.cash = 2000;
  for (let n = 0; n < 6; n++) s = ai.endAiTurn(skipEvent(s));
  assert.equal(new Set(s.rivals.map(r => r.latest)).size, 10);
  assert.ok(s.rivals.find(r => r.company === 'minimax').video > s.rivals.find(r => r.company === 'openai').video);
  assert.ok(s.rivals.find(r => r.company === 'zai').reliability > s.rivals.find(r => r.company === 'xai').reliability);
  assert.ok(s.rivals.find(r => r.company === 'anthropic').defense >= 3);
  assert.ok(s.rivals.find(r => r.company === 'qwen').ecosystem > s.rivals.find(r => r.company === 'openai').ecosystem);
});
test('legacy v1 saves migrate financial progress and v2 rejects invalid identity or event data', () => {
  const old = fresh('deepseek'); old.version = 1; old.cash = 87; old.turn = 5; delete old.industry;
  old.rivals = old.rivals.slice(0, 3).map(({ name, capability, safety, product, focus }) => ({ name, capability, safety, product, focus }));
  const migrated = readGameSave(JSON.stringify(old), 'agi');
  assert.equal(migrated.version, 2); assert.equal(migrated.cash, 87); assert.equal(migrated.turn, 5); assert.equal(migrated.rivals.length, 10);
  const invalid = fresh('zai'); invalid.industry.eventId = 'made-up'; assert.equal(readGameSave(JSON.stringify(invalid), 'agi'), null);
  invalid.industry.eventId = 'same-base'; invalid.industry.teacher = 'zai'; assert.equal(readGameSave(JSON.stringify(invalid), 'agi'), null);
});
