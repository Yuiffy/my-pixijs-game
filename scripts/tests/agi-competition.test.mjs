import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { aiCompetitivePilot, aiPilot } from './helpers/mini-games-pilots.mjs';

const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const competition = await loadTypescriptModule('src/components/miniGames/agiCompetition.ts');
const content = await loadTypescriptModule('src/components/miniGames/agiIndustry.ts');
const next = s => ai.endAiTurn(ai.decideAiEvent(s, 'defer'));
const fresh = (difficulty = 'standard', company = 'deepseek') => ai.createAi(42, content.aiCompany(company).style, company, difficulty);
const published = (open = true) => {
  let s = fresh(); s.capability = 80; s.cash = 180; s.openness = open;
  s = ai.actAi(s, 'release'); s.used = []; s.actions = 3;
  return s;
};

test('difficulty config changes disclosed budgets and tempo, and standard is the default', () => {
  assert.equal(fresh().difficulty, 'standard'); assert.equal(fresh().version, 3);
  const levels = competition.AI_DIFFICULTIES.map(d => fresh(d.id));
  assert.deepEqual(levels.map(s => s.rivals[0].cash), [100, 135, 155]);
  assert.deepEqual(levels.map(s => s.rivals[0].compute), [2, 3, 4]);
  for (const s of levels) assert.equal(s.cash, 120, 'Difficulty does not secretly take starting money from the player');
});

test('rivals buy training, publish, optimize and finance through auditable finite budgets', () => {
  const s = fresh(); const r = s.rivals.find(r => r.company === 'qwen');
  const kinds = new Set();
  for (let turn = 1; turn <= 9; turn++) {
    s.turn = turn;
    const before = structuredClone(r);
    competition.advanceAiRival(s, r, 0.99);
    const feed = s.competition.feed.filter(e => e.actor === r.company && e.turn === turn);
    feed.forEach(e => kinds.add(e.kind));
    assert.ok(r.cash >= 0); assert.ok(r.funding <= 3); assert.ok(r.lastActions.length <= 4);
    assert.ok(r.product <= r.capability);
    if (r.capability > before.capability) assert.ok(feed.some(e => ['train', 'optimize', 'posttrain', 'distill'].includes(e.kind)), 'Every capability increase has a paid research action');
    if (r.product > before.product) assert.ok(feed.some(e => e.kind === 'release'), 'Internal research does not automatically ship');
    assert.equal(r.lastIncome, competition.rivalIncome(r));
  }
  for (const kind of ['train', 'release', 'fund', 'optimize', 'compute']) assert.ok(kinds.has(kind), kind);
  const poor = fresh().rivals[0]; poor.cash = 0; poor.funding = 3; poor.product = 0; poor.video = 0; poor.ecosystem = 0;
  const capability = poor.capability;
  competition.advanceAiRival(fresh(), poor, 0.5);
  assert.equal(poor.capability, capability, 'A broke rival cannot invent free training or a fourth financing round');
  assert.equal(poor.funding, 3); assert.equal(poor.cash, 0);
});

test('rivals explicitly distill the player or a peer using only released capability', () => {
  const s = published(); const r = s.rivals.find(r => r.company === 'anthropic');
  const before = structuredClone(r);
  competition.advanceAiRival(s, r, 0.99);
  const entry = s.competition.feed.find(e => e.actor === r.company && e.kind === 'distill');
  assert.equal(entry.target, s.industry.company); assert.equal(entry.basis, 'licensed');
  assert.equal(entry.amount, Math.round((s.product - before.capability) * 0.6 * 10) / 10);
  assert.ok(r.capability <= s.product); assert.match(entry.text, /支付 17 M/);
  const peer = fresh(); const teacher = peer.rivals.find(r => r.company === 'qwen'); teacher.product = 75; teacher.capability = 99;
  competition.advanceAiRival(peer, peer.rivals[0], 0.99);
  const learned = peer.competition.feed.find(e => e.kind === 'distill');
  assert.equal(learned.target, 'qwen'); assert.match(learned.text, /模型 75/); assert.doesNotMatch(learned.text, /模型 99/);
});

test('universal defense costs an action, upkeep and community, and changes rival sampling', () => {
  const open = published(); const protectedOpen = ai.actAi(open, 'protect');
  assert.equal(protectedOpen.cash, open.cash - 18); assert.equal(protectedOpen.actions, open.actions - 1);
  assert.equal(protectedOpen.community, open.community - 3); assert.equal(ai.aiUpkeep(protectedOpen), ai.aiUpkeep(open) + 2);
  competition.advanceAiRival(open, open.rivals[0], 0.99);
  competition.advanceAiRival(protectedOpen, protectedOpen.rivals[0], 0.99);
  const gain = s => s.competition.feed.find(e => e.kind === 'distill' && e.actor === s.rivals[0].company)?.amount || 0;
  assert.ok(gain(open) > gain(protectedOpen)); assert.ok(gain(protectedOpen) > 0, 'Open weights cannot be retroactively revoked');
  const closed = ai.actAi(published(false), 'protect');
  competition.advanceAiRival(closed, closed.rivals[0], 0.99);
  assert.ok(!closed.competition.feed.some(e => e.kind === 'distill' && e.target === closed.industry.company));
  assert.equal(ai.actAi(protectedOpen, 'protect'), protectedOpen);
});

test('publication captures license policy and later closed releases retain previous open knowledge', () => {
  let s = published(true);
  s.openness = false;
  assert.equal(s.competition.publishedOpen, true);
  s.capability = 95; s = ai.actAi(s, 'release');
  assert.equal(s.competition.publishedOpen, false); assert.equal(s.competition.openCapability, 80);
  s.industry.defense = 5;
  competition.advanceAiRival(s, s.rivals[0], 0.99);
  const entry = s.competition.feed.find(e => e.kind === 'distill' && e.target === s.industry.company);
  assert.ok(entry); assert.match(entry.text, /历史开放版.*模型 80/);
  assert.ok(s.rivals[0].capability <= 80);
});

test('paid closed-model licensing transfers money to the teacher in both directions', () => {
  const player = published(false); const before = player.cash;
  competition.advanceAiRival(player, player.rivals[0], 0.99);
  assert.equal(player.cash, before + 6);
  let s = fresh(); const r = s.rivals.find(r => r.company === 'openai'); r.product = 80;
  s = ai.setAiDistillTarget(s, r.company); const cash = r.cash;
  const after = ai.actAi(s, 'distill');
  assert.equal(after.cash, s.cash - 23); assert.equal(after.rivals.find(r => r.company === 'openai').cash, cash + 6);
});

test('well-founded public criticism changes target finances and forces a remedial decision', () => {
  let s = fresh(); const r = s.rivals.find(r => r.company === 'openai');
  r.product = 50; r.capability = 55; r.reliability = 61; r.safety = 45;
  s = ai.setAiCompetitionTarget(s, r.company); const before = structuredClone(s);
  assert.equal(ai.aiCriticismPreview(s).supported, true);
  s = ai.actAi(s, 'criticize');
  const target = s.rivals.find(r => r.company === 'openai');
  assert.equal(s.cash, before.cash - 10); assert.equal(s.actions, before.actions - 1);
  assert.equal(target.cash, r.cash - 8); assert.equal(target.reputation, r.reputation - 12);
  assert.ok(competition.rivalIncome(target) < competition.rivalIncome(r));
  competition.advanceAiRival(s, target, 0.99);
  assert.ok(target.lastActions[0].includes('后训练'), 'An observed reliability issue below 65 gets remediated even when normal training threshold is 57');
});

test('unsupported accusations backfire and lawful open distillation is not fabricated misconduct', () => {
  let s = fresh(); const r = s.rivals.find(r => r.company === 'qwen'); r.product = 60; r.capability = 70; r.reliability = 80; r.safety = 60;
  s.community = 30; s.reputation = 35; s = ai.setAiCompetitionTarget(s, 'qwen');
  assert.equal(ai.aiCriticismPreview(s).supported, false); assert.match(ai.aiCriticismPreview(s).basis, /开放许可.*不构成违规/);
  const after = ai.actAi(s, 'criticize');
  assert.equal(after.reputation, 25); assert.equal(after.community, 24);
  assert.equal(after.rivals.find(r => r.company === 'qwen').cash, r.cash);
  assert.equal(ai.setAiCompetitionTarget(s, s.industry.company), s);
});

test('rival criticism has observable grounds, one challenge per quarter, and an optional single response', () => {
  let s = published(false); s.turn = 3; s.industry.reliability = 50; s.safety = 32; s.community = 60; s.reputation = 40;
  for (const r of s.rivals) competition.advanceAiRival(s, r, 0);
  const entries = s.competition.feed.filter(e => e.kind === 'criticize' && e.target === s.industry.company);
  assert.equal(entries.length, 1); assert.match(entries[0].basis, /可靠性仅 50/);
  assert.equal(s.community, 55); assert.equal(s.reputation, 32); assert.equal(entries[0].response, 'pending');
  const before = structuredClone(s);
  s = ai.respondAiChallenge(s, entries[0].id, 'fix');
  assert.equal(s.cash, before.cash - 24); assert.equal(s.actions, before.actions);
  assert.equal(s.industry.reliability, 60); assert.equal(s.safety, 38);
  assert.equal(s.revenue, ai.aiIncome(s), 'Remediation updates the displayed product-income forecast immediately');
  assert.equal(ai.respondAiChallenge(s, entries[0].id, 'fix'), s);
  const broke = { ...before, cash: 0 };
  assert.match(ai.aiChallengeBlocked(broke, entries[0].id, 'fix'), /资金不足/);
  assert.equal(ai.respondAiChallenge(broke, entries[0].id, 'fix'), broke);
  assert.equal(ai.respondAiChallenge(broke, entries[0].id, 'ignore').competition.feed.find(e => e.id === entries[0].id).response, 'ignore');
  assert.equal(ai.respondAiChallenge(s, 'missing', 'fix'), s);
  const nextSeason = { ...before, turn: 4 }; const expired = next(nextSeason);
  assert.equal(expired.competition.feed.find(e => e.id === entries[0].id).response, 'expired', 'Responses cannot be stockpiled for free actions many quarters later');
});

test('three difficulty levels are deterministic, routine play is contested and advanced routes remain winnable', () => {
  const counts = {};
  for (const difficulty of ['relaxed', 'standard', 'hard']) {
    let wins = 0;
    for (const company of content.AI_COMPANIES) for (let seed = 1; seed <= 20; seed++) {
      const s = aiPilot(seed, company.style, 'safe', [], company.id, difficulty);
      assert.ok(s.ending, `${difficulty}/${company.id}/${seed} must terminate`);
      wins += !!s.ending.won;
    }
    counts[difficulty] = wins;
  }
  assert.ok(counts.relaxed > counts.standard + 25, JSON.stringify(counts));
  assert.ok(counts.standard > counts.hard + 25, JSON.stringify(counts));
  assert.ok(counts.standard > 60 && counts.standard < 185, JSON.stringify(counts));
  let advanced = 0;
  for (const company of content.AI_COMPANIES) {
    for (const seed of [2, 5, 11, 15]) {
      const s = aiCompetitivePilot(seed, company.id, 'hard');
      assert.ok(s.ending); advanced += !!s.ending.won;
      if (seed === 5) assert.deepEqual(aiCompetitivePilot(seed, company.id, 'hard'), s);
    }
  }
  assert.ok(advanced >= 20, `Hard retains multiple-company winning routes: ${advanced}/44`);
});
