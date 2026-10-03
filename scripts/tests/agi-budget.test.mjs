import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const { AI_COMPANIES } = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
const { round } = await loadTypescriptModule('src/components/miniGames/core.ts');
const fresh = () => ai.decideAiEvent(ai.createAi(2026, 'product', 'openai', 'relaxed'), 'defer');
const launched = () => {
  const s = fresh(); Object.assign(s, { product: 45, capability: 45, safety: 35, cash: 80, event: 2 });
  Object.assign(s.industry, { reliability: 40, hype: 75 }); return s;
};

test('recorded procurement and regulation scenarios include revenue multipliers and refunds', () => {
  const s = launched(); const boom = ai.aiQuarterBudget(s);
  assert.equal(boom.baseIncome, 16.9); assert.equal(boom.income, 23.7);
  assert.equal(boom.upkeep, 13); assert.equal(boom.refund, 8); assert.equal(boom.cashAfter, 82.7);
  s.event = 4; s.cash = 8; s.industry.defense = 4;
  const risk = ai.aiQuarterBudget(s); assert.equal(risk.income, 8.5); assert.equal(risk.cashAfter, -8.5);
  const settled = ai.endAiTurn(s); assert.equal(settled.cash, -8.5); assert.equal(settled.ending.title, '现金流断裂');
});

test('itemized upkeep includes service, compute, routing, licensed data, scrutiny and defense', () => {
  const s = fresh(); s.compute = 5;
  Object.assign(s.industry, { service: 'consumer', route: true, licensedData: true, scrutiny: 2, defense: 3 });
  assert.deepEqual(ai.aiUpkeepParts(s), { base: 4, compute: 10, service: 6, routing: 8, samples: 4, scrutiny: 6, defense: 3 });
  assert.equal(ai.aiQuarterBudget(s).upkeep, 41);
  s.industry.company = 'router'; assert.equal(ai.aiUpkeepParts(s).routing, 4);
  s.industry.route = false; assert.equal(ai.aiUpkeepParts(s).samples, 0);
  s.industry.service = 'research'; s.industry.scrutiny = 0; s.industry.defense = 0;
  assert.equal(ai.aiQuarterBudget(s).upkeep, 16);
});

test('refund and regulatory thresholds are strict and distinct from recurring scrutiny costs', () => {
  const s = launched(); s.event = 4; s.safety = 40; s.industry.hype = 55;
  assert.equal(ai.aiQuarterBudget(s).safetyMultiplier, 1); assert.equal(ai.aiQuarterBudget(s).refund, 0);
  s.safety = 39.9; s.industry.hype = 55.1;
  assert.equal(ai.aiQuarterBudget(s).safetyMultiplier, .5); assert.equal(ai.aiQuarterBudget(s).refund, 8);
  s.event = 0; s.industry.scrutiny = 1;
  assert.equal(ai.aiQuarterBudget(s).safetyMultiplier, 1); assert.equal(ai.aiQuarterBudget(s).costs.scrutiny, 6);
});

test('preview is read-only and independent of private RNG and rival future cash', () => {
  const s = launched(), original = structuredClone(s), budget = ai.aiQuarterBudget(s);
  assert.deepEqual(s, original);
  s.rng = 94303; s.rivals.forEach(r => { r.cash += 500; r.funding = 2; });
  assert.deepEqual(ai.aiQuarterBudget(s), budget);
  assert.ok(ai.endAiTurn(original).cash > budget.cashAfter, 'rivals can still pay unpromised royalties');
});

test('660 visible market/company/service/threshold combinations reconcile with actual settlement', () => {
  let count = 0;
  for (const c of AI_COMPANIES) for (let event = 0; event < 5; event++) for (const service of ['research', 'balanced', 'consumer']) for (const safety of [39, 40]) for (const refund of [false, true]) {
    const s = ai.decideAiEvent(ai.createAi(2026, c.style, c.id, 'relaxed'), 'defer');
    Object.assign(s, { product: 45, capability: 45, cash: 80, safety, event });
    Object.assign(s.industry, { service, reliability: 40, hype: refund ? 56 : 55 });
    const budget = ai.aiQuarterBudget(s), end = ai.endAiTurn(s);
    const royalties = !s.competition.publishedOpen ? end.competition.feed.filter(e => e.turn === s.turn && e.kind === 'distill' && e.target === s.industry.company).length * 6 : 0;
    assert.equal(end.industry.lastIncome, budget.income);
    assert.equal(end.industry.lastCosts, budget.upkeep);
    assert.equal(end.cash, round(budget.cashAfter + royalties), `${c.id}/${event}/${service}/${safety}/${refund}`);
    count++;
  }
  assert.equal(count, 660);
});

test('paid actions update projected cash once, and post-training removes refund risk', () => {
  const s = launched(), before = ai.aiQuarterBudget(s);
  const expanded = ai.actAi(s, 'compute'), after = ai.aiQuarterBudget(expanded);
  assert.equal(after.cashAfter, round(before.cashAfter - ai.aiCost(s, 'compute') - 2));
  const trained = ai.actAi(s, 'posttrain'); assert.equal(ai.aiQuarterBudget(trained).refund, 0);
  assert.equal(trained.cash, s.cash - ai.aiCost(s, 'posttrain'));
});

test('recursive research applies after income; exact zero cash remains solvent', () => {
  const s = launched(); s.event = 4; s.safety = 40; s.recursive = true; s.industry.defense = 4;
  const preview = ai.aiQuarterBudget(s), end = ai.endAiTurn(s);
  assert.equal(end.industry.lastIncome, preview.income); assert.equal(end.safety, 34);
  const empty = fresh(); empty.cash = ai.aiUpkeep(empty);
  assert.equal(ai.aiQuarterBudget(empty).cashAfter, 0); assert.equal(ai.endAiTurn(empty).ending, null);
});
