import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const competition = await loadTypescriptModule('src/components/miniGames/agiCompetition.ts');
const content = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
const endings = await loadTypescriptModule('src/components/miniGames/agiEndings.ts');
const { readGameSave } = await loadTypescriptModule('src/components/miniGames/save.ts');
const fresh = company => ai.createAi(42, content.aiCompany(company).style, company, 'standard');
const ready = r => Object.assign(r, { capability: 100, compute: 5, reliability: 88, safety: 78, product: 90, video: 60, ecosystem: 60, defense: 2, reputation: 45, cash: 100 });
const rival = company => ready(fresh(company === 'deepseek' ? 'openai' : 'deepseek').rivals.find(r => r.company === company));

test('all eleven rivals choose a world outcome matching their company route', () => {
  const routes = {
    deepseek: 'research-commons', anthropic: 'guarded-intelligence', openai: 'subscription-empire',
    xai: 'synthetic-social-world', zai: 'verified-delivery', minimax: 'generative-cinema',
    google: 'multimodal-utility', qwen: 'modular-commons', kimi: 'delegated-work',
    meta: 'licensed-federation', router: 'intelligence-exchange',
  };
  for (const company of content.AI_COMPANIES) {
    const r = rival(company.id); const original = structuredClone(r);
    const result = endings.selectAiRivalEnding(r, 8);
    assert.equal(result.won, false, 'The world outcome does not misreport a player victory');
    assert.equal(result.rivalOutcome.winnerId, company.id);
    assert.equal(result.rivalOutcome.endingId, routes[company.id]);
    assert.equal(result.rivalOutcome.turn, 8);
    assert.equal(result.rivalOutcome.metrics.open, company.open);
    assert.ok(result.rivalOutcome.reason.length > 15);
    assert.equal(result.rivalOutcome.consequences.length, 2);
    assert.ok(result.rivalOutcome.tradeoff.length > 20);
    assert.ok(result.text.includes(company.name));
    assert.equal(result.rivalOutcome.metrics.capability, 100);
    assert.deepEqual(r, original, 'Choosing a world never invents stats or alters the rival');
  }
});

test('safety, defense and market maturity change the world choice at their exact thresholds', () => {
  const cases = [
    ['deepseek', 'safety', 75, 'research-commons', 'open-research-trials'],
    ['anthropic', 'defense', 2, 'guarded-intelligence', 'audited-enterprise'],
    ['openai', 'product', 70, 'subscription-empire', 'subscription-rollout'],
    ['openai', 'reputation', 35, 'subscription-empire', 'subscription-rollout'],
    ['zai', 'reliability', 85, 'verified-delivery', 'staged-delivery'],
    ['kimi', 'reliability', 85, 'delegated-work', 'supervised-agents'],
  ];
  for (const [company, field, threshold, above, below] of cases) {
    const r = rival(company); r[field] = threshold;
    assert.equal(endings.selectAiRivalEnding(r, 8).rivalOutcome.endingId, above);
    r[field]--;
    const outcome = endings.selectAiRivalEnding(r, 8).rivalOutcome;
    assert.equal(outcome.endingId, below);
    assert.equal(outcome.metrics[field], threshold - 1);
  }
});

test('video and ecosystem endings require real progress instead of assuming it from a company name', () => {
  const cases = [
    ['xai', 'video', 40, 'synthetic-social-world', 'live-intelligence-network'],
    ['minimax', 'video', 50, 'generative-cinema', 'creative-apprenticeship'],
    ['google', 'video', 30, 'multimodal-utility', 'compute-utility'],
    ['qwen', 'ecosystem', 40, 'modular-commons', 'open-toolkit'],
    ['meta', 'ecosystem', 40, 'licensed-federation', 'licensed-seed'],
    ['router', 'ecosystem', 40, 'intelligence-exchange', 'intelligence-gateway'],
  ];
  for (const [company, field, threshold, above, below] of cases) {
    const r = rival(company); r[field] = threshold;
    assert.equal(endings.selectAiRivalEnding(r, 8).rivalOutcome.endingId, above);
    r[field] = 0;
    const outcome = endings.selectAiRivalEnding(r, 8).rivalOutcome;
    assert.equal(outcome.endingId, below);
    assert.equal(outcome.metrics[field], 0);
    assert.match(outcome.reason, /0/);
  }
});

test('a quarter stops after the first rival launches AGI; later rivals cannot overwrite the winner', () => {
  const s = ai.decideAiEvent(fresh('openai'), 'defer'); s.turn = 8;
  s.rivals.forEach(ready);
  const before = structuredClone(s);
  const ended = ai.endAiTurn(s);
  assert.equal(ended.ending.rivalOutcome.winnerId, s.rivals[0].company);
  assert.deepEqual(ended.rivals.slice(1), before.rivals.slice(1), 'No post-victory training, criticism, or accounting is simulated');
  assert.deepEqual(s, before, 'Quarter resolution does not mutate its input');
  assert.equal(ended.competition.feed.filter(e => e.kind === 'agi').length, 1);
  assert.equal(ended.competition.feed.filter(e => e.kind === 'settlement').length, 1, 'The winner keeps its current-quarter account');
  assert.equal(ended.turn, 8);
  assert.equal(ai.endAiTurn(ended), ended);
  const frozen = structuredClone(ended);
  competition.advanceAiRival(ended, ended.rivals[1], 0);
  assert.deepEqual(ended, frozen, 'Direct engine calls also respect an already resolved world');
});

test('bankruptcy and the last quarter cannot replace a rival world outcome that already occurred', () => {
  const s = ai.decideAiEvent(fresh('openai'), 'defer'); s.turn = 20; s.cash = 0;
  const winner = ready(s.rivals[0]);
  Object.assign(winner, { cash: 0, product: 0, ecosystem: 0, video: 0, efficiency: 0 });
  const ended = ai.endAiTurn(s);
  assert.ok(ended.cash < 0);
  assert.equal(ended.ending.rivalOutcome.winnerId, winner.company);
  assert.equal(ended.rivals[0].compute, 5, 'Closing deficit does not retroactively undo a verified AGI launch');
  assert.equal(ended.rivals[0].cash, 0);
  assert.equal(ended.rivals[0].lastCosts, competition.rivalUpkeep(winner));
  assert.match(ended.competition.feed.find(e => e.kind === 'settlement').text, /终局账面缺口/);
  assert.deepEqual(readGameSave(JSON.stringify(ended), 'agi'), ended);
});

test('world endings do not relax any of the existing four AGI launch requirements', () => {
  for (const [field, value] of [['capability', 99], ['compute', 4], ['reliability', 69], ['safety', 39]]) {
    const s = fresh('openai'); const r = ready(s.rivals[0]);
    Object.assign(r, { [field]: value, cash: 0, funding: 3, product: 0, video: 0, ecosystem: 0, efficiency: 0 });
    competition.advanceAiRival(s, r, 0.99);
    assert.equal(s.ending, null, `${field} must still meet its threshold`);
  }
});

test('plain old endings, ongoing saves and player world choices remain compatible', () => {
  const ongoing = fresh('deepseek');
  assert.deepEqual(readGameSave(JSON.stringify(ongoing), 'agi'), ongoing);
  const old = { ...ongoing, ending: { title: '研究的长冬', text: '旧存档没有赢家记录。', won: false } };
  assert.deepEqual(readGameSave(JSON.stringify(old), 'agi'), old);
  const player = ai.decideAiEvent(fresh('deepseek'), 'defer');
  Object.assign(player, { capability: 100, compute: 5, safety: 80, cash: 200 });
  player.industry.reliability = 85;
  const ending = ai.actAi(player, 'agi').ending;
  assert.equal(ending.won, true);
  assert.equal(ending.title, '共同富裕');
  assert.equal(ending.rivalOutcome, undefined);
});

test('an old rival loss gains the corresponding world ending without resetting financial progress', () => {
  const s = ai.decideAiEvent(fresh('openai'), 'defer'); s.turn = 8; s.cash = 93;
  ready(s.rivals[0]);
  const ended = ai.endAiTurn(s);
  const legacy = structuredClone(ended);
  legacy.ending = { title: `${legacy.rivals[0].name}率先抵达`, text: '旧版本敌人率先完成验证。', won: false };
  const migrated = readGameSave(JSON.stringify(legacy), 'agi');
  assert.deepEqual(migrated.ending, ended.ending);
  assert.equal(migrated.cash, legacy.cash); assert.equal(migrated.turn, legacy.turn);
  assert.deepEqual(migrated.rivals, legacy.rivals);
  const invalid = structuredClone(ended); invalid.ending.rivalOutcome.winnerId = 'made-up';
  assert.equal(readGameSave(JSON.stringify(invalid), 'agi'), null);
  const fakeProse = structuredClone(ended); fakeProse.ending.rivalOutcome.decision = 'unsaved arbitrary prose';
  fakeProse.ending.rivalOutcome.metrics.capability = -500;
  assert.deepEqual(readGameSave(JSON.stringify(fakeProse), 'agi').ending, ended.ending);
});
